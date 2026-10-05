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
        derniereVictoire: p.base_derniere_victoire || null, dernierJeu: p.base_dernier_jeu || null };
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
  const nonceAleatoire = () => { const o = new Uint8Array(32); crypto.getRandomValues(o); return [...o].map(x => x.toString(16).padStart(2, "0")).join(""); };

  // ---- Démarrage dans le jeu ----
  // Charge supabase-js à la demande, ouvre (ou crée) le compte anonyme, puis synchronise :
  // au lancement, au retour du réseau, au retour dans l'appli, et après chaque partie ou favori (signaler()).
  function demarrer({ ls, config, aujourdhui, apres, charger }) {
    const pret = !!(config && config.supabaseUrl && config.supabaseCle);
    let sb = null, synchro = null, minuteur = 0, connexionEnCours = null;
    const enLigne = () => typeof navigator === "undefined" || navigator.onLine !== false;

    async function client() {
      if (sb) return sb;
      if (!window.supabase) await charger("vendor/supabase.js");
      sb = window.supabase.createClient(config.supabaseUrl, config.supabaseCle, {
        auth: { storageKey: "quatuor-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
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
    // État du compte (sans réseau : lu dans la session enregistrée)
    async function compte() {
      if (!pret) return null;
      try {
        const c = await client(); const { data } = await c.auth.getSession(); const u = data && data.session && data.session.user;
        if (!u) return null;
        const fournisseurs = (u.app_metadata && u.app_metadata.providers) || (u.identities || []).map(i => i.provider);
        return { id: u.id, anonyme: !!u.is_anonymous, apple: fournisseurs.includes("apple"), email: u.email || "" };
      } catch (e) { return null; }
    }
    return { actif: pret, synchroniser, signaler, client, assurerSession, enLigne, appleDisponible, connexionApple, compte, supprimerCompte };
  }

  return { creerSynchro, apiSupabase, demarrer, creerConnexionApple, dejaLie };
});
