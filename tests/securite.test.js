// Partie 5 · sécurité : bloquer, signaler, supprimer le compte (fonction serveur), limites
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { creerBase, echoue } = require("./aide-pg.js");
const { upsert } = require("./aide-synchro.js");
const QC = require("../js/calculs.js");

async function joueur(b, pseudo) {
  const id = await b.nouveauJoueur();
  await b.en(id, "update public.profils set pseudo = $1 where id = $2", [pseudo, id]);
  return { id, code: (await b.admin("select code_ami from public.profils where id = $1", [id]))[0].code_ami };
}
const demander = (b, de, a) => b.en(de.id, "select public.envoyer_demande($1) r", [a.code]).then(r => r[0].r);
const amis = (b, qui) => b.en(qui.id, "select * from public.mes_amis('', current_date)");
async function rendreAmis(b, A, B) { await demander(b, A, B); await demander(b, B, A); }

test("bloquer : il disparaît de mes amis et ne peut plus m'ajouter (sans le savoir) ; débloquer", async () => {
  const b = await creerBase(); const A = await joueur(b, "Alice"), B = await joueur(b, "Bruno");
  await rendreAmis(b, A, B);
  assert.equal((await b.en(A.id, "select public.bloquer($1) r", [B.id]))[0].r, true);
  assert.equal((await amis(b, A)).length, 0);
  assert.equal((await amis(b, B)).length, 0);
  assert.equal(await demander(b, B, A), "introuvable", "le blocage n'est pas révélé");
  assert.equal(await demander(b, A, B), "introuvable");
  assert.equal((await amis(b, A)).length, 0);
  // liste de mes bloqués (lui ne voit pas qu'il est bloqué)
  assert.deepEqual((await b.en(A.id, "select pseudo from public.mes_bloques()")).map(x => x.pseudo), ["Bruno"]);
  assert.equal((await b.en(B.id, "select * from public.mes_bloques()")).length, 0);
  assert.equal((await b.en(B.id, "select * from public.blocages")).length, 0);
  // il ne peut pas se débloquer lui-même
  await b.en(B.id, "select public.debloquer($1)", [A.id]);
  await echoue(b.en(B.id, "delete from public.blocages"), /permission denied/);
  assert.equal((await b.admin("select * from public.blocages")).length, 1);
  await b.en(A.id, "select public.debloquer($1)", [B.id]);
  assert.equal(await demander(b, B, A), "envoyee");
});

test("signaler : enregistré pour l'administration, invisible des joueurs, limité", async () => {
  const b = await creerBase(); const A = await joueur(b, "Alice"), B = await joueur(b, "Bruno");
  assert.equal((await b.en(A.id, "select public.signaler($1, 'pseudo') r", [B.id]))[0].r, "ok");
  assert.equal((await b.en(A.id, "select public.signaler($1, 'pseudo') r", [B.id]))[0].r, "deja");
  assert.equal((await b.en(A.id, "select public.signaler($1, 'pseudo') r", [A.id]))[0].r, "inconnu");
  const [s] = await b.admin("select * from public.signalements_a_traiter");
  assert.deepEqual([s.pseudo_signale, s.signale_par, s.motif], ["Bruno", "Alice", "pseudo"]);
  // les joueurs n'y ont pas accès
  for (const q of ["select * from public.signalements", "select * from public.signalements_a_traiter"]) {
    await echoue(b.en(A.id, q), /permission denied/); await echoue(b.en(B.id, q), /permission denied/);
  }
  await echoue(b.en(A.id, "insert into public.signalements (auteur, cible) values ($1, $2)", [A.id, B.id]), /permission denied/);
  // 10 par jour
  for (let i = 0; i < 9; i++) { const X = await joueur(b, "Cible" + i); await b.en(A.id, "select public.signaler($1)", [X.id]); }
  const Y = await joueur(b, "Encore");
  assert.equal((await b.en(A.id, "select public.signaler($1) r", [Y.id]))[0].r, "limite");
  // motif tronqué à 300 caractères
  const C = await joueur(b, "Chloe");
  await b.en(C.id, "select public.signaler($1, $2)", [B.id, "x".repeat(1000)]);
  assert.equal((await b.admin("select length(motif) l from public.signalements where auteur = $1", [C.id]))[0].l, 300);
});

test("modération : l'administration peut effacer un pseudo, pas le joueur", async () => {
  const b = await creerBase(); const A = await joueur(b, "Alice");
  await echoue(b.en(A.id, "update public.profils set pseudo = null where id = $1", [A.id]), /Pseudo obligatoire/);
  await b.admin("update public.profils set pseudo = null where id = $1", [A.id]);
  assert.equal((await b.admin("select pseudo from public.profils where id = $1", [A.id]))[0].pseudo, null);
});

test("supprimer mon compte (fonction serveur) : plus AUCUNE donnée côté serveur", async () => {
  const { traiter } = await import("../supabase/functions/supprimer-compte/index.ts");
  const b = await creerBase(); const A = await joueur(b, "Alice"), B = await joueur(b, "Bruno"), C = await joueur(b, "Chloé");
  // des données dans toutes les tables
  await rendreAmis(b, A, B); await demander(b, A, C);
  await b.en(A.id, "select public.bloquer($1)", [C.id]);
  await b.en(A.id, "select public.signaler($1)", [B.id]); await b.en(B.id, "select public.signaler($1)", [A.id]);
  await upsert(b, A.id, "resultats", [{ user_id: A.id, ...QC.versServeur("g001", { win: true, mistakes: 0, tries: 1, d: "2026-10-04", jdj: true }) }], ["user_id", "grille_id"]);
  await upsert(b, A.id, "favoris", [{ user_id: A.id, fav_id: "g001:X", donnees: {}, maj_le: new Date().toISOString() }], ["user_id", "fav_id"]);
  await b.en(A.id, "select public.fixer_base($1::jsonb)", [JSON.stringify({ parties: 3 })]);
  const compter = async () => {
    const t = {};
    for (const [table, cols] of Object.entries({ profils: ["id"], resultats: ["user_id"], favoris: ["user_id"], amities: ["demandeur", "destinataire"],
      blocages: ["bloqueur", "bloque"], signalements: ["auteur", "cible"], journal_actions: ["user_id"] }))
      t[table] = +(await b.admin(`select count(*) n from public.${table} where ${cols.map(c => `${c} = $1`).join(" or ")}`, [A.id]))[0].n;
    t.auth = +(await b.admin("select count(*) n from auth.users where id = $1", [A.id]))[0].n;
    return t;
  };
  Object.entries(await compter()).forEach(([t, n]) => assert.ok(n > 0, `données de test présentes dans ${t}`));
  // fausse API d'administration branchée sur la base de test
  const admin = { auth: { getUser: async j => (j === "jeton-de-A" ? { data: { user: { id: A.id } }, error: null } : { data: null, error: { message: "invalide" } }),
    admin: { deleteUser: async id => { await b.admin("delete from auth.users where id = $1", [id]); return { error: null }; } } } };
  const appel = (h = {}) => traiter(new Request("https://x/functions/v1/supprimer-compte", { method: "POST", headers: h }), admin);
  assert.equal((await appel()).status, 401);
  assert.equal((await appel({ Authorization: "Bearer jeton-pirate" })).status, 401);
  assert.equal((await traiter(new Request("https://x", { method: "GET" }), admin)).status, 405);
  assert.equal((await appel({ Authorization: "Bearer jeton-de-A" })).status, 200);
  Object.entries(await compter()).forEach(([t, n]) => assert.equal(n, 0, `il reste des données dans ${t}`));
  // les autres joueurs ne sont pas touchés
  assert.equal((await b.admin("select count(*) n from public.profils"))[0].n, 2);
  assert.equal((await amis(b, B)).length, 0);
});

test("la fonction de suppression ne contient aucune clé : elle lit la clé d'administration dans l'environnement Supabase", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "../supabase/functions/supprimer-compte/index.ts"), "utf8");
  assert.match(src, /SUPABASE_SECRET_KEYS/); assert.match(src, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(src, /eyJ[A-Za-z0-9_-]{10,}|sb_secret_/);
});

test("aucune clé secrète dans le code du client", () => {
  const fs = require("fs"), path = require("path"), racine = path.join(__dirname, "..");
  const fichiers = ["index.html", "config-en-ligne.js", ...fs.readdirSync(path.join(racine, "js")).map(f => "js/" + f)];
  for (const f of fichiers) {
    const src = fs.readFileSync(path.join(racine, f), "utf8");
    assert.doesNotMatch(src, /service_role"?\s*[:=]\s*["']ey|sb_secret_[A-Za-z0-9]/, f);
  }
});

test("fonction de suppression : nouvelle clé secret (sb_secret_) en priorité, sinon ancienne service_role", async () => {
  const { cleAdmin } = await import("../supabase/functions/supprimer-compte/index.ts");
  const env = o => n => o[n];
  assert.equal(cleAdmin(env({ SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_abc" }), SUPABASE_SERVICE_ROLE_KEY: "eyJ.legacy" })), "sb_secret_abc");
  assert.equal(cleAdmin(env({ SUPABASE_SECRET_KEYS: JSON.stringify({ autre: "sb_secret_x" }) })), "sb_secret_x");
  assert.equal(cleAdmin(env({ SUPABASE_SERVICE_ROLE_KEY: "eyJ.legacy" })), "eyJ.legacy");
  assert.equal(cleAdmin(env({ SUPABASE_SECRET_KEYS: "pas du json", SUPABASE_SERVICE_ROLE_KEY: "eyJ.legacy" })), "eyJ.legacy");
});

test("configuration : clé publishable uniquement (jamais secret / service_role)", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "../config-en-ligne.js"), "utf8");
  const cle = (src.match(/supabaseCle:\s*"([^"]*)"/) || [])[1];
  assert.ok(cle === "" || /^sb_publishable_/.test(cle), "clé publishable attendue");
});

test("ménage mensuel : journal > 7 jours et signalements > 12 mois effacés, le reste gardé ; réservé au serveur", async () => {
  const b = await creerBase(); const A = await joueur(b, "Alice"), B = await joueur(b, "Bruno");
  await b.en(A.id, "select public.signaler($1)", [B.id]); await b.en(B.id, "select public.signaler($1)", [A.id]);
  await b.admin("update public.signalements set le = now() - interval '13 months' where auteur = $1", [A.id]);
  await b.admin("insert into public.journal_actions (user_id, action, le) values ($1, 'x', now() - interval '8 days'), ($1, 'y', now())", [A.id]);
  await echoue(b.en(A.id, "select public.menage_mensuel()"), /permission denied/);
  await b.admin("select public.menage_mensuel()");
  assert.deepEqual((await b.admin("select auteur from public.signalements")).map(x => x.auteur), [B.id]);
  assert.equal((await b.admin("select count(*) n from public.journal_actions where le < now() - interval '7 days'"))[0].n, 0);
  assert.ok((await b.admin("select count(*) n from public.journal_actions"))[0].n > 0);
});
