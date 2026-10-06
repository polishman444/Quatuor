// =====================================================================
// Quatuor · mode en ligne : compte anonyme automatique et synchronisation
//
// Règle d'or : le jeu fonctionne sans ce fichier. Le stockage local (ls) reste la source principale ;
// le serveur (Supabase) se synchronise quand le réseau est là. Toute erreur réseau est silencieuse
// et la synchronisation est simplement retentée plus tard (retour du réseau, retour dans l'appli…).
//
// Clés locales ajoutées :
//   quatuor-base        stats de l'appareil avant le mode en ligne (base de calcul de la série)
//   quatuor-favs-suppr  favoris retirés { id: horodatage } (pour propager le retrait aux autres appareils)
//   quatuor-sync        { compte, baseEnvoyee, reinitVu, reinitAFaire, derniere }
//   quatuor-auth        session Supabase (gérée par supabase-js)
//   quatuor-profil      { pseudo, avatar, code_ami } (copie pour l'affichage hors ligne)
// =====================================================================
(function (racine, fabrique) {
  const m = fabrique(typeof module === "object" && module.exports ? require("./calculs.js") : racine.QC);
  if (typeof module === "object" && module.exports) module.exports = m; else racine.QuatuorEnLigne = m;
})(typeof self !== "undefined" ? self : this, function (QC) {
  "use strict";

  const lireJson = (ls, k, def) => { try { const v = JSON.parse(ls.get(k) || "null"); return v == null ? def : v; } catch (e) { return def; } };
  const ecrireJson = (ls, k, v) => ls.set(k, JSON.stringify(v));

  // ---- Moteur de synchronisation (indépendant de Supabase : « api » est injectée) ----
  // api : { utilisateur(), profil(), fixerBase(base), reinitialiser(), resultats(), envoyerResultats(lignes),
  //         favoris(), envoyerFavoris(lignes) }
  // opts : { ls, aujourdhui: () => "AAAA-MM-JJ", apres: (infos) => {} }
  function creerSynchro(api, opts) {
    const { ls } = opts;
    let enCours = null, encore = false;

    const etat = () => lireJson(ls, "quatuor-sync", {});
    const majEtat = e => ecrireJson(ls, "quatuor-sync", { ...etat(), ...e });

    function baseDuProfil(p) {
      if (p.base_parties == null) return null;
      return { parties: p.base_parties || 0, victoires: p.base_victoires || 0, record: p.base_record || 0, serie: p.base_serie || 0,
        derniereVictoire: p.base_derniere_victoire ? String(p.base_derniere_victoire).slice(0, 10) : null,
        dernierJeu: p.base_dernier_jeu ? String(p.base_dernier_jeu).slice(0, 10) : null };
    }
    function recalculerStats() {
      const base = lireJson(ls, "quatuor-base", QC.BASE_VIDE), res = lireJson(ls, "quatuor-res", {});
      ecrireJson(ls, "quatuor", QC.statsLocales(QC.calculerStats(base, res, opts.aujourdhui())));
    }

    async function une() {
      const moi = await api.utilisateur(); if (!moi) return { ok: false };
      let e = etat();
      if (e.compte && e.compte !== moi) { e = { compte: moi }; ecrireJson(ls, "quatuor-sync", e); }   // autre compte : tout se renvoie
      // 1. Réinitialisation demandée sur cet appareil (éventuellement hors ligne)
      if (e.reinitAFaire) { const t = await api.reinitialiser(); majEtat({ reinitAFaire: false, reinitVu: t, baseEnvoyee: null }); e = etat(); }
      let profil = await api.profil();
      // 2. Réinitialisation faite sur un autre appareil : on s'aligne
      if (profil.reinit_le && Date.parse(profil.reinit_le) !== Date.parse(e.reinitVu)) {
        if (e.reinitVu || e.derniere) {   // cet appareil s'était déjà synchronisé avant : ses données sont effacées
          ["quatuor-res", "quatuor-encours", "quatuor-bonus"].forEach(k => ls.del(k));
          ecrireJson(ls, "quatuor-base", QC.BASE_VIDE);
        }
        majEtat({ reinitVu: profil.reinit_le, baseEnvoyee: null }); e = etat();
      }
      // 3. Base des statistiques : envoyée une fois par compte ; le serveur garde le maximum
      if (e.baseEnvoyee !== moi) {
        await api.fixerBase(lireJson(ls, "quatuor-base", QC.BASE_VIDE));
        majEtat({ baseEnvoyee: moi }); profil = await api.profil();
      }
      // 4. Téléchargement
      const [distRes, distFav] = await Promise.all([api.resultats(), api.favoris()]);
      // 5. Fusion et écriture locale (sans attente entre lecture et écriture : aucune partie ne peut être perdue)
      const res = lireJson(ls, "quatuor-res", {}), parServeur = new Map(distRes.map(r => [r.grille_id, QC.depuisServeur(r)]));
      const aEnvoyer = [];
      new Set([...Object.keys(res), ...parServeur.keys()]).forEach(id => {
        const s = parServeur.get(id), l = res[id] && typeof res[id] === "object" ? res[id] : null;
        const m = QC.fusionnerResultat(s, l);
        res[id] = m;
        if (!s || !QC.memeResultat(m, s)) aEnvoyer.push({ user_id: moi, ...QC.versServeur(id, m) });
      });
      ecrireJson(ls, "quatuor-res", res);
      const base = baseDuProfil(profil); if (base) ecrireJson(ls, "quatuor-base", base);
      recalculerStats();
      const favsLocaux = lireJson(ls, "quatuor-favs", []), suppr = lireJson(ls, "quatuor-favs-suppr", {});
      const f = QC.fusionnerFavoris(Array.isArray(favsLocaux) ? favsLocaux : [], suppr, distFav);
      const dist = new Map(distFav.map(r => [r.fav_id, r]));
      const favsAEnvoyer = [];
      f.favs.forEach(x => { const d = dist.get(x.id); if (!d || d.supprime || (Date.parse(d.maj_le) || 0) < x.maj) favsAEnvoyer.push({ user_id: moi, ...QC.favoriVersServeur(x) }); });
      Object.entries(f.suppressions).forEach(([id, t]) => { const d = dist.get(id);
        if (d && !d.supprime) favsAEnvoyer.push({ user_id: moi, fav_id: id, donnees: {}, supprime: true, maj_le: new Date(t).toISOString() }); });
      ecrireJson(ls, "quatuor-favs", f.favs); ecrireJson(ls, "quatuor-favs-suppr", f.suppressions);
      // 6. Envoi des différences
      if (aEnvoyer.length) await api.envoyerResultats(aEnvoyer);
      if (favsAEnvoyer.length) await api.envoyerFavoris(favsAEnvoyer);
      ecrireJson(ls, "quatuor-profil", { pseudo: profil.pseudo || null, avatar: profil.avatar || 0, code_ami: profil.code_ami });
      majEtat({ compte: moi, derniere: Date.now() });
      return { ok: true, profil, recus: distRes.length, envoyes: aEnvoyer.length + favsAEnvoyer.length };
    }

    // Une seule synchronisation à la fois ; une demande pendant ce temps en relance une à la fin
    function synchroniser() {
      if (enCours) { encore = true; return enCours; }
      enCours = (async () => {
        let r;
        try { do { encore = false; r = await une(); } while (encore); }
        catch (err) { r = { ok: false, erreur: err }; }
        finally { enCours = null; }
        if (opts.apres) try { opts.apres(r); } catch (e) {}
        return r;
      })();
      return enCours;
    }
    return { synchroniser, recalculerStats };
  }

  // ---- Api réelle : Supabase ----
  function apiSupabase(sb) {
    const verifier = ({ data, error }) => { if (error) throw error; return data; };
    async function toutLire(table) {
      const lignes = [];
      for (let de = 0; ; de += 1000) {
        const lot = verifier(await sb.from(table).select("*").range(de, de + 999));
        lignes.push(...lot); if (lot.length < 1000) return lignes;
      }
    }
    async function envoyer(table, lignes, conflit) {
      for (let i = 0; i < lignes.length; i += 200) verifier(await sb.from(table).upsert(lignes.slice(i, i + 200), { onConflict: conflit }));
    }
    return {
      async utilisateur() { const { data } = await sb.auth.getSession(); return data && data.session ? data.session.user.id : null; },
      profil: async () => verifier(await sb.rpc("assurer_profil")),
      fixerBase: async base => verifier(await sb.rpc("fixer_base", { p: base })),
      reinitialiser: async () => verifier(await sb.rpc("reinitialiser_progression")),
      resultats: () => toutLire("resultats"),
      favoris: () => toutLire("favoris"),
      envoyerResultats: l => envoyer("resultats", l, "user_id,grille_id"),
      envoyerFavoris: l => envoyer("favoris", l, "user_id,fav_id")
    };
  }

  // ---- Connexion avec Apple (appli iOS) ----
  // deps : { client() → supabase, jetonApple(nonce) → idToken, demanderRecuperation() → bool,
  //          synchroniser(), supprimerAncien(jetonAcces), nonce() }
  // 1. Liaison du jeton Apple au compte anonyme actuel (même identifiant : amis, pseudo et code ami conservés).
  // 2. Si ce compte Apple appartient déjà à un autre compte Quatuor (ex. nouvel appareil) : on DEMANDE
  //    « Récupérer ta progression existante ? ». Oui → connexion à ce compte, les grilles de cet appareil y
  //    sont ajoutées (meilleur résultat gardé), puis le compte anonyme orphelin est supprimé. Non → rien ne change.
  const dejaLie = e => !!e && (e.code === "identity_already_exists" || /already (been )?(linked|exists)|identity.*exist/i.test(e.message || ""));
  function creerConnexionApple(d) {
    return async function connexionApple() {
      const c = await d.client();
      let nonce = d.nonce(), jeton = await d.jetonApple(nonce);
      const { data: s } = await c.auth.getSession();
      const ancien = s && s.session;
      if (!ancien) throw new Error("Pas de session");
      const lien = await c.auth.linkIdentity({ provider: "apple", token: jeton, nonce });
      if (!lien.error) { await d.synchroniser(); return { etat: "lie" }; }
      if (!dejaLie(lien.error)) throw lien.error;
      if (!(await d.demanderRecuperation())) return { etat: "annule" };
      let r = await c.auth.signInWithIdToken({ provider: "apple", token: jeton, nonce });
      if (r.error) {   // jeton refusé une 2e fois (déjà utilisé) : nouvelle demande à Apple
        nonce = d.nonce(); jeton = await d.jetonApple(nonce);
        r = await c.auth.signInWithIdToken({ provider: "apple", token: jeton, nonce });
        if (r.error) throw r.error;
      }
      if (ancien.user && ancien.user.is_anonymous && r.data.user && r.data.user.id !== ancien.user.id) {
        try { await d.supprimerAncien(ancien.access_token); } catch (e) { /* sans gravité : compte vide, sans pseudo visible */ }
      }
      await d.synchroniser();
      return { etat: "recupere" };
    };
  }
  // ---- Connexion par code e-mail (site et appli) ----
  // 1. envoyerCode(email) : compte anonyme → on y rattache l'e-mail (même compte : rien n'est perdu).
  //    Si l'e-mail appartient déjà à un compte Quatuor : on DEMANDE « Récupérer ta progression existante ? »,
  //    puis on envoie un code de connexion à ce compte. Renvoie { mode: "lier" | "recuperer" | "annule" }.
  // 2. verifierCode(email, code, mode) : vérifie le code ; en récupération, le compte anonyme orphelin est supprimé
  //    et les grilles de cet appareil sont ajoutées au compte (synchro, meilleur résultat gardé).
  const emailPris = e => !!e && (e.code === "email_exists" || e.code === "user_already_exists" || /already (been )?registered|already exists/i.test(e.message || ""));
  function creerConnexionEmail(d) {
    return {
      async envoyerCode(email) {
        const c = await d.client();
        const { data: s } = await c.auth.getSession();
        const session = s && s.session;
        if (session && session.user && session.user.is_anonymous) {
          const r = await c.auth.updateUser({ email });
          if (!r.error) return { mode: "lier" };
          if (!emailPris(r.error)) throw r.error;
          if (!(await d.demanderRecuperation())) return { mode: "annule" };
        }
        const r = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
        if (r.error) throw r.error;
        return { mode: "recuperer" };
      },
      async verifierCode(email, code, mode) {
        const c = await d.client();
        const { data: s } = await c.auth.getSession();
        const ancien = s && s.session;
        const r = await c.auth.verifyOtp({ email, token: code, type: mode === "lier" ? "email_change" : "email" });
        if (r.error) throw r.error;
        const nouveau = r.data && (r.data.user || (r.data.session && r.data.session.user));
        if (mode === "recuperer" && ancien && ancien.user && ancien.user.is_anonymous && nouveau && nouveau.id !== ancien.user.id) {
          try { await d.supprimerAncien(ancien.access_token); } catch (e) { /* sans gravité */ }
        }
        await d.synchroniser();
        return { etat: mode === "lier" ? "lie" : "recupere" };
      }
    };
  }
  // Message clair pour les erreurs d'e-mail
  function messageErreurEmail(e) {
    const c = (e && e.code) || "", m = (e && e.message) || "";
    if (c === "over_email_send_rate_limit" || c === "over_request_rate_limit" || /rate limit|too many/i.test(m)) return "Trop de demandes : réessaie dans quelques minutes.";
    if (c === "otp_expired" || /expired|invalid/i.test(m) && /otp|token|code/i.test(m)) return "Code incorrect ou expiré.";
    if (c === "email_address_invalid" || c === "validation_failed" || /invalid.*email|email.*invalid/i.test(m)) return "Adresse e-mail invalide.";
    if (c === "otp_disabled" || c === "signup_disabled" || /signups not allowed/i.test(m)) return "Aucun compte avec cet e-mail.";
    return "Impossible pour l'instant : vérifie ta connexion et réessaie.";
  }

  const nonceAleatoire = () => { const o = new Uint8Array(32); crypto.getRandomValues(o); return [...o].map(x => x.toString(16).padStart(2, "0")).join(""); };

  // ---- Démarrage dans le jeu ----
  // Charge supabase-js à la demande, ouvre (ou crée) le compte anonyme, puis synchronise :
  // au lancement, au retour du réseau, au retour dans l'appli, et après chaque partie ou favori (signaler()).
  function demarrer({ ls, config, aujourdhui, apres, charger, natif }) {
    // Garde-fou : une clé secrète (sb_secret_… ou ancienne service_role) ne doit jamais être dans l'appli
    const cleSecrete = c => /^sb_secret_/.test(c) || (() => { try { return JSON.parse(atob(c.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role"; } catch (e) { return false; } })();
    if (config && config.supabaseCle && cleSecrete(config.supabaseCle)) console.error("Quatuor : clé SECRÈTE dans config-en-ligne.js, mode en ligne désactivé. Utilise la clé publishable.");
    const pret = !!(config && config.supabaseUrl && config.supabaseCle && !cleSecrete(config.supabaseCle));
    let sb = null, synchro = null, minuteur = 0, connexionEnCours = null;
    const enLigne = () => typeof navigator === "undefined" || navigator.onLine !== false;

    async function client() {
      if (sb) return sb;
      if (!window.supabase) await charger("vendor/supabase.js");
      sb = window.supabase.createClient(config.supabaseUrl, config.supabaseCle, {
        // Web : retour de la connexion Apple par redirection (flux PKCE, code dans l'adresse)
        auth: { storageKey: "quatuor-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: !natif, flowType: "pkce",
          storage: { getItem: k => ls.get(k), setItem: (k, v) => ls.set(k, v), removeItem: k => ls.del(k) } }
      });
      synchro = creerSynchro(apiSupabase(sb), { ls, aujourdhui, apres });
      return sb;
    }
    // Compte anonyme créé automatiquement, sans rien demander
    function assurerSession() {
      if (connexionEnCours) return connexionEnCours;
      connexionEnCours = (async () => {
        const c = await client();
        const { data } = await c.auth.getSession();
        if (data && data.session) return data.session;
        const r = await c.auth.signInAnonymously();
        if (r.error) throw r.error;
        return r.data.session;
      })().finally(() => { connexionEnCours = null; });
      return connexionEnCours;
    }
    async function synchroniser() {
      if (!pret || !enLigne()) return { ok: false, horsLigne: true };
      try { await assurerSession(); return await synchro.synchroniser(); }
      catch (e) { console.warn("Quatuor : synchronisation reportée", e && e.message || e); return { ok: false, erreur: e }; }
    }
    // Plusieurs changements rapprochés : une seule synchronisation
    const signaler = (delai = 1500) => { clearTimeout(minuteur); minuteur = setTimeout(synchroniser, delai); };
    if (pret && typeof window !== "undefined") {
      window.addEventListener("online", () => signaler(500));
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") signaler(800); });
    }
    // Connexion Apple : uniquement dans l'appli iOS (plugin natif local « QuatuorApple »)
    const Cap = typeof window !== "undefined" && window.Capacitor;
    const appleDisponible = !!(pret && Cap && Cap.isNativePlatform && Cap.isNativePlatform() && Cap.getPlatform && Cap.getPlatform() === "ios");
    async function jetonApple(nonce) {
      const p = Cap.Plugins && Cap.Plugins.QuatuorApple;
      const r = p && p.connexion ? await p.connexion({ nonce }) : await Cap.nativePromise("QuatuorApple", "connexion", { nonce });
      if (!r || !r.idToken) throw new Error("Jeton Apple manquant");
      return r.idToken;
    }
    // Suppression d'un compte par la fonction serveur sécurisée « supprimer-compte » (jeton du compte concerné)
    async function supprimerCompte(jetonAcces) {
      const r = await fetch(config.supabaseUrl.replace(/\/$/, "") + "/functions/v1/supprimer-compte", { method: "POST",
        headers: { Authorization: "Bearer " + jetonAcces, apikey: config.supabaseCle, "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) throw new Error("Suppression refusée (" + r.status + ")");
    }
    function connexionApple(demanderRecuperation) {
      return creerConnexionApple({ client: async () => { await assurerSession(); return client(); }, jetonApple, demanderRecuperation,
        synchroniser, supprimerAncien: supprimerCompte, nonce: nonceAleatoire })();
    }
    // ---- Connexion par e-mail ----
    const connexionEmail = demanderRecuperation => creerConnexionEmail({ client: async () => { await assurerSession(); return client(); },
      demanderRecuperation, synchroniser, supprimerAncien: supprimerCompte });

    // ---- Connexion Apple sur le site (redirection vers Apple puis retour sur le site) ----
    // Activée par config.appleWeb (une fois le « Services ID » Apple configuré, voir SETUP-EN-LIGNE.md).
    const appleWebDisponible = !!(pret && !natif && config.appleWeb);
    const CLE_RETOUR = "quatuor-apple-web";
    async function appleWeb(mode) {
      const c = await client(); await assurerSession();
      const { data } = await c.auth.getSession(); const session = data && data.session;
      const retour = location.origin + location.pathname;
      try { sessionStorage.setItem(CLE_RETOUR, JSON.stringify({ mode, ancien: session && session.user.is_anonymous ? session.access_token : null, at: Date.now() })); } catch (e) {}
      const r = mode === "lier" ? await c.auth.linkIdentity({ provider: "apple", options: { redirectTo: retour } })
        : await c.auth.signInWithOAuth({ provider: "apple", options: { redirectTo: retour } });
      if (r.error) throw r.error;   // sinon, le navigateur part chez Apple
    }
    // Au retour d'Apple : { etat: "lie" | "recupere" | "deja_lie" | "erreur" } ou null s'il n'y a rien à traiter
    async function retourAppleWeb() {
      if (natif || !pret) return null;
      let attente = null; try { attente = JSON.parse(sessionStorage.getItem(CLE_RETOUR) || "null"); } catch (e) {}
      const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, ""));
      const erreur = q.get("error_code") || h.get("error_code") || q.get("error") || h.get("error");
      const descr = q.get("error_description") || h.get("error_description") || "";
      if (!attente && !erreur && !q.get("code")) return null;
      const c = await client();
      try { if (q.get("code") && c.auth.initialize) await c.auth.initialize(); } catch (e) {}
      try { sessionStorage.removeItem(CLE_RETOUR); } catch (e) {}
      try { window.history.replaceState(null, "", location.pathname); } catch (e) {}   // (window. : le jeu a sa propre variable « history »)
      if (!attente || Date.now() - attente.at > 30 * 60000) return null;
      if (erreur) return dejaLie({ code: erreur, message: descr }) ? { etat: "deja_lie" } : { etat: "erreur", message: descr };
      const { data } = await c.auth.getSession(); const u = data && data.session && data.session.user;
      if (!u) return { etat: "erreur" };
      if (attente.mode === "recuperer" && attente.ancien && attente.ancien !== data.session.access_token) {
        try { await supprimerCompte(attente.ancien); } catch (e) {}
      }
      await synchroniser();
      return { etat: attente.mode === "lier" ? "lie" : "recupere" };
    }

    // ---- Se déconnecter : d'abord tout envoyer sur le compte, puis fermer la session ----
    async function seDeconnecter() {
      if (!pret) return;
      if (!enLigne()) throw Object.assign(new Error("hors ligne"), { raison: "reseau" });
      const r = await synchroniser();
      if (!r || !r.ok) throw Object.assign(new Error("synchro"), { raison: "synchro" });
      const c = await client();
      try { await c.auth.signOut({ scope: "local" }); } catch (e) {}
      ls.del("quatuor-auth");
    }

    // État du compte (sans réseau : lu dans la session enregistrée)
    async function compte() {
      if (!pret) return null;
      try {
        const c = await client(); const { data } = await c.auth.getSession(); const u = data && data.session && data.session.user;
        if (!u) return null;
        const fournisseurs = (u.app_metadata && u.app_metadata.providers) || (u.identities || []).map(i => i.provider);
        return { id: u.id, anonyme: !!u.is_anonymous, apple: fournisseurs.includes("apple"), emailLie: fournisseurs.includes("email") && !!u.email, email: u.email || "" };
      } catch (e) { return null; }
    }
    // ---- Profil : pseudo et avatar ----
    // Erreurs traduites : "pris" | "interdit" | "format" | "trop" | "reseau"
    const raisonErreur = e => { const m = (e && (e.message || "")) + " " + (e && e.code || "");
      return /23505|duplicate|unique/.test(m) ? "pris" : /pseudo_interdit/.test(m) ? "interdit" : /pseudo_format|check/.test(m) ? "format"
        : /trop_de_changements/.test(m) ? "trop" : "reseau"; };
    async function avecCompte(fn) {
      if (!pret) throw Object.assign(new Error("hors ligne"), { raison: "reseau" });
      if (!enLigne()) throw Object.assign(new Error("hors ligne"), { raison: "reseau" });
      const session = await assurerSession(); const c = await client();
      return fn(c, session.user.id);
    }
    async function verifierPseudo(p) {
      return avecCompte(async c => { const { data, error } = await c.rpc("verifier_pseudo", { p }); if (error) throw error; return data; });
    }
    async function majProfil(champs) {
      return avecCompte(async (c, moi) => {
        await c.rpc("assurer_profil");
        const { data, error } = await c.from("profils").update(champs).eq("id", moi).select("pseudo, avatar, code_ami").single();
        if (error) throw Object.assign(new Error(error.message), { raison: raisonErreur(error) });
        ecrireJson(ls, "quatuor-profil", data);
        return data;
      });
    }
    const profilLocal = () => lireJson(ls, "quatuor-profil", null);

    // ---- Amis (toutes les opérations passent par les fonctions du serveur) ----
    const rpc = (nom, args) => avecCompte(async c => { const { data, error } = await c.rpc(nom, args); if (error) throw error; return data; });
    const amis = {
      liste: (grille, jour) => rpc("mes_amis", { grille: grille || "", jour }),
      ajouter: code => rpc("envoyer_demande", { code }),
      repondre: (demande, accepter) => rpc("repondre_demande", { demande, accepter }),
      retirer: ami => rpc("retirer_ami", { ami }),
      bloquer: cible => rpc("bloquer", { cible }),
      debloquer: cible => rpc("debloquer", { cible }),
      bloques: () => rpc("mes_bloques", {}),
      signaler: (cible, motif) => rpc("signaler", { cible, motif })
    };
    // Suppression du compte : fonction serveur sécurisée (vérifie le jeton, supprime le compte d'authentification ;
    // toutes les données suivent par cascade). Renvoie true si le serveur a confirmé (ou s'il n'y avait aucun compte).
    async function supprimerMonCompte() {
      if (!pret) return true;
      if (!enLigne()) throw Object.assign(new Error("hors ligne"), { raison: "reseau" });
      const c = await client(); const { data } = await c.auth.getSession();
      const session = data && data.session;
      if (session) {
        await supprimerCompte(session.access_token);
        try { await c.auth.signOut({ scope: "local" }); } catch (e) {}
      }
      ls.del("quatuor-auth");
      return true;
    }

    return { actif: pret, synchroniser, signaler, client, assurerSession, enLigne, appleDisponible, connexionApple, compte, supprimerCompte,
      verifierPseudo, majProfil, profilLocal, avecCompte, raisonErreur, rpc, amis, supprimerMonCompte,
      connexionEmail, appleWebDisponible, appleWeb, retourAppleWeb, seDeconnecter };
  }

  return { creerSynchro, apiSupabase, demarrer, creerConnexionApple, dejaLie, creerConnexionEmail, messageErreurEmail, emailPris };
});
