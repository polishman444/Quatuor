// Faux Supabase pour les tests dans le navigateur : les requêtes de supabase-js (auth, REST, RPC, fonctions)
// sont interceptées par Playwright et exécutées sur la base de test PGlite, avec les droits du joueur
// (RLS comprise). Imite le strict nécessaire de GoTrue et PostgREST.
"use strict";
const crypto = require("crypto");

const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(uid) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: uid, role: "authenticated", aud: "authenticated", exp })}.sig`;
}
const uidDe = jeton => { try { return JSON.parse(Buffer.from(String(jeton).split(".")[1], "base64url").toString()).sub; } catch (e) { return null; } };

function fauxSupabase(base) {
  const comptes = new Map();    // uid → { anonyme, apple (sub Apple), email }
  const apple = new Map();      // sub Apple → uid
  const journal = [];           // appels notables (tests)
  const rafraichir = new Map(); // refresh_token → uid

  function session(uid) {
    const c = comptes.get(uid), rt = crypto.randomUUID(); rafraichir.set(rt, uid);
    const providers = [c.apple && "apple", c.email && "email"].filter(Boolean);
    if (!providers.length) providers.push("anonymous");
    return { access_token: jwt(uid), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: rt,
      user: { id: uid, aud: "authenticated", role: "authenticated", is_anonymous: !c.apple && !c.email, email: c.email || "",
        app_metadata: { provider: providers[0], providers }, user_metadata: {}, identities: c.apple ? [{ provider: "apple", id: c.apple }] : [],
        created_at: new Date().toISOString() } };
  }
  async function creerCompte(extra = {}) {
    const uid = crypto.randomUUID();
    await base.admin("insert into auth.users (id) values ($1)", [uid]);
    comptes.set(uid, { anonyme: true, ...extra }); return uid;
  }
  // Compte déjà lié à Apple (ex. créé sur un autre appareil)
  async function compteApple(subApple, email = "joueur@privaterelay.appleid.com") {
    const uid = await creerCompte({ apple: subApple, email }); apple.set(subApple, uid); return uid;
  }
  const json = (r, status, corps) => r.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: corps === undefined ? "" : JSON.stringify(corps) });
  const erreurPg = e => ({ code: e.code || "P0001", message: e.message, details: null, hint: null });
  const statutPg = e => /permission denied/.test(e.message) ? 403 : /row-level security/.test(e.message) ? 403 : e.code === "23505" ? 409 : 400;

  // Description des fonctions (arguments, retour) pour les appels RPC
  let fonctions = null;
  async function fonction(nom) {
    if (!fonctions) {
      const rows = await base.admin(`select p.proname, p.proretset, coalesce(p.proargnames, '{}') as noms, p.pronargs,
        array(select format_type(t, null) from unnest(p.proargtypes) t) as types, format_type(p.prorettype, null) as ret,
        (select typtype from pg_type where oid = p.prorettype) as typtype
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`);
      fonctions = new Map(rows.map(r => [r.proname, r]));
    }
    return fonctions.get(nom);
  }

  async function gerer(route) {
    const req = route.request(), url = new URL(req.url()), chemin = url.pathname, methode = req.method();
    if (methode === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    const corps = (() => { try { return JSON.parse(req.postData() || "null"); } catch (e) { return null; } })();
    const uid = uidDe((req.headers().authorization || "").replace(/^Bearer /, ""));
    const moi = uid && comptes.has(uid) ? uid : null;

    // ---- Auth (GoTrue) ----
    if (chemin === "/auth/v1/signup") { const u = await creerCompte(); journal.push(["anonyme", u]); return json(route, 200, session(u)); }
    // ---- Connexion par code e-mail (le code est toujours 123456 dans les tests) ----
    const parEmail = e => [...comptes].find(([, c]) => c.email === e)?.[0];
    if (chemin === "/auth/v1/user" && methode === "PUT") {
      if (!moi) return json(route, 401, { code: "bad_jwt", msg: "invalid" });
      if (corps.email) {
        const autre = parEmail(corps.email);
        if (autre && autre !== moi) return json(route, 422, { code: "email_exists", msg: "A user with this email address has already been registered" });
        comptes.get(moi).emailEnAttente = corps.email; journal.push(["code_email", corps.email, "lier"]);
      }
      return json(route, 200, session(moi).user);
    }
    if (chemin === "/auth/v1/otp") {
      const u = parEmail(corps.email);
      if (!u) return json(route, 422, { code: "otp_disabled", msg: "Signups not allowed for otp" });
      journal.push(["code_email", corps.email, "connexion"]);
      return json(route, 200, {});
    }
    if (chemin === "/auth/v1/verify") {
      if (corps.token !== "123456") return json(route, 403, { code: "otp_expired", msg: "Token has expired or is invalid" });
      if (corps.type === "email_change") {
        // (comme GoTrue : le compte est retrouvé par l'e-mail en attente, sans jeton de session)
        const id = [...comptes].find(([, c]) => c.emailEnAttente === corps.email)?.[0], u = id && comptes.get(id);
        if (!u) return json(route, 403, { code: "otp_expired", msg: "Token has expired or is invalid" });
        u.email = corps.email; delete u.emailEnAttente; journal.push(["email_lie", id]);
        return json(route, 200, session(id));
      }
      const u = parEmail(corps.email);
      if (!u) return json(route, 403, { code: "otp_expired", msg: "Token has expired or is invalid" });
      journal.push(["connexion_email", u]);
      return json(route, 200, session(u));
    }
    if (chemin === "/auth/v1/user") return moi ? json(route, 200, session(moi).user) : json(route, 401, { code: "bad_jwt", msg: "invalid" });
    if (chemin === "/auth/v1/logout") return json(route, 204);
    if (chemin === "/auth/v1/user/identities/authorize") { journal.push(["apple_web", url.searchParams.get("redirect_to")]);
      return json(route, 200, { url: "https://appleid.apple.com/auth/authorize?faux=1" }); }
    if (chemin === "/auth/v1/token") {
      const g = url.searchParams.get("grant_type");
      if (g === "refresh_token") { const u = rafraichir.get(corps.refresh_token); return u && comptes.has(u) ? json(route, 200, session(u)) : json(route, 400, { code: "refresh_token_not_found", msg: "Invalid Refresh Token" }); }
      if (g === "id_token") {
        const sub = String(corps.id_token);   // dans les tests, le jeton Apple est directement l'identifiant Apple
        journal.push([corps.link_identity ? "lier" : "connexion", sub]);
        if (corps.link_identity) {
          if (!moi) return json(route, 401, { code: "bad_jwt", msg: "invalid" });
          if (apple.has(sub) && apple.get(sub) !== moi) return json(route, 422, { code: "identity_already_exists", msg: "Identity is already linked to another user" });
          apple.set(sub, moi); Object.assign(comptes.get(moi), { apple: sub, email: "joueur@privaterelay.appleid.com" });
          return json(route, 200, session(moi));
        }
        let u = apple.get(sub); if (!u) { u = await creerCompte({ apple: sub }); apple.set(sub, u); }
        return json(route, 200, session(u));
      }
    }
    // ---- Fonction serveur « supprimer-compte » (voir supabase/functions) ----
    if (chemin === "/functions/v1/supprimer-compte") {   // le vrai code de la fonction, avec une API d'administration factice
      const { traiter } = await import("../supabase/functions/supprimer-compte/index.ts");
      const admin = { auth: {
        getUser: async j => { const u = uidDe(j); return u && comptes.has(u) ? { data: { user: { id: u } }, error: null } : { data: { user: null }, error: { message: "invalide" } }; },
        admin: { deleteUser: async id => { journal.push(["supprimer", id]); await base.admin("delete from auth.users where id = $1", [id]);
          const c = comptes.get(id); comptes.delete(id); if (c && c.apple) apple.delete(c.apple); return { error: null }; } } } };
      const r = await traiter(new Request(req.url(), { method: methode, headers: req.headers(), body: methode === "POST" ? req.postData() : undefined }), admin);
      return route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: await r.text() });
    }
    // ---- REST (PostgREST) ----
    const rest = chemin.match(/^\/rest\/v1\/(rpc\/)?([a-z_]+)$/);
    if (rest) {
      try {
        if (rest[1]) {   // RPC
          const f = await fonction(rest[2]); if (!f) return json(route, 404, { code: "PGRST202", message: "fonction inconnue" });
          const args = corps || {};
          const appel = f.noms.slice(0, f.pronargs).map((n, i) => f.types[i] === "jsonb" ? `${n} => ($1::jsonb -> '${n}')`
            : `${n} => ($1::jsonb ->> '${n}')::${f.types[i]}`).join(", ");
          const sql = f.ret === "void" ? `select public.${f.proname}(${appel})` : `select * from public.${f.proname}(${appel})`;
          const lignes = await base.en(moi, sql, f.pronargs ? [JSON.stringify(corps || {})] : []);
          if (f.ret === "void") return json(route, 200, null);
          if (f.proretset) return json(route, 200, lignes);
          if (f.typtype === "c") return json(route, 200, lignes[0] || null);
          return json(route, 200, lignes[0] ? Object.values(lignes[0])[0] : null);
        }
        const table = rest[2];
        if (methode === "GET") {
          const off = +url.searchParams.get("offset") || 0, lim = +url.searchParams.get("limit") || 1000;
          return json(route, 200, await base.en(moi, `select * from public.${table} offset ${off} limit ${lim}`));
        }
        if (methode === "PATCH") {   // update(...).eq("col", v).select(...)
          const filtres = [...url.searchParams].filter(([k, v]) => /^eq\./.test(v));
          const cols = Object.keys(corps || {});
          const params = [...cols.map(c => corps[c]), ...filtres.map(([, v]) => v.slice(3))];
          const lignes = await base.en(moi, `update public.${table} set ${cols.map((c, i) => `${c} = $${i + 1}`).join(", ")}
            where ${filtres.map(([k], i) => `${k}::text = $${cols.length + i + 1}`).join(" and ") || "true"} returning *`, params);
          const unique = /vnd\.pgrst\.object/.test(req.headers().accept || "");
          if (unique && lignes.length !== 1) return json(route, 406, { code: "PGRST116", message: "0 ou plusieurs lignes" });
          return json(route, 200, unique ? lignes[0] : lignes);
        }
        if (methode === "DELETE") {
          const filtres = [...url.searchParams].filter(([k, v]) => /^eq\./.test(v));
          await base.en(moi, `delete from public.${table} where ${filtres.map(([k], i) => `${k}::text = $${i + 1}`).join(" and ") || "false"}`, filtres.map(([, v]) => v.slice(3)));
          return json(route, 204);
        }
        if (methode === "POST") {
          const lignes = Array.isArray(corps) ? corps : [corps], cles = (url.searchParams.get("on_conflict") || "").split(",").filter(Boolean);
          const cols = [...new Set(lignes.flatMap(Object.keys))];
          const maj = cols.filter(c => !cles.includes(c)).map(c => `${c} = excluded.${c}`).join(", ");
          await base.en(moi, `insert into public.${table} (${cols.join(", ")}) select ${cols.join(", ")} from jsonb_populate_recordset(null::public.${table}, $1::jsonb)
            ${cles.length ? `on conflict (${cles.join(", ")}) do update set ${maj}` : ""}`, [JSON.stringify(lignes)]);
          return json(route, 201);
        }
      } catch (e) { return json(route, statutPg(e), erreurPg(e)); }
    }
    return json(route, 404, { message: "inconnu : " + chemin });
  }
  // Compte déjà relié à un e-mail (ex. créé sur un autre appareil)
  async function compteEmail(email) { return creerCompte({ email }); }
  return { gerer, comptes, journal, compteApple, compteEmail, creerCompte, session };
}

module.exports = { fauxSupabase };
