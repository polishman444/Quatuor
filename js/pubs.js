// =====================================================================
// Quatuor · pubs récompensées (appli iOS uniquement, Google AdMob via @capacitor-community/admob)
// Le joueur choisit de regarder une courte pub pour obtenir un indice ou voir la solution d'une grille perdue.
// Jamais de pub imposée (ni bannière, ni interstitielle), jamais de pub sur le site ni pendant le tutoriel.
//
// QuatuorPubs.creer({ admob, config, journal }) :
//   admob   : le plugin natif (window.Capacitor.Plugins.AdMob), null sur le site
//   config  : QUATUOR_CONFIG.admob = { recompense: "ca-app-pub-…/…", test: true|false }
// Renvoie { actif, demarrer(), regarder(), optionsConfidentialite(), choixRequis() } ;
// regarder() → "ok" (pub vue jusqu'au bout) | "annule" (fermée avant la fin) | "indispo" (pas de pub : réseau, aucune pub à montrer…).
// Chargé dans le jeu (window.QuatuorPubs) et dans les tests Node (require).
// =====================================================================
(function (racine, fabrique) {
  const m = fabrique();
  if (typeof module === "object" && module.exports) module.exports = m; else racine.QuatuorPubs = m;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const EV = { recompense: "onRewardedVideoAdReward", fermee: "onRewardedVideoAdDismissed", echecAffichage: "onRewardedVideoAdFailedToShow" };
  const delai = (p, ms) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error("délai dépassé")), ms))]);

  function creer({ admob, config, journal = () => {}, attenteChargement = 8000 } = {}) {
    const c = config || {};
    const actif = !!(admob && typeof c.recompense === "string" && c.recompense);
    let demarrage = null, prete = null, choix = null, enCours = false;

    // Consentement (RGPD, formulaire Google UMP) puis autorisation de suivi d'Apple (ATT), puis SDK et première pub.
    // Appelé une fois au lancement (hors tutoriel) ; sans réseau, on réessaiera à la première pub demandée.
    function demarrer() {
      if (!actif) return Promise.resolve(false);
      if (demarrage) return demarrage;
      demarrage = (async () => {
        await admob.initialize({ initializeForTesting: !!c.test });
        try {
          let info = await admob.requestConsentInfo();
          if (info && info.status === "REQUIRED" && info.isConsentFormAvailable) info = await admob.showConsentForm();
          choix = info || null;
        } catch (e) { journal("consentement indisponible", e); }
        try {
          const t = await admob.trackingAuthorizationStatus();
          if (t && t.status === "notDetermined") await admob.requestTrackingAuthorization();
        } catch (e) { journal("autorisation de suivi indisponible", e); }
        if (choix && choix.canRequestAds === false) return false;
        precharger();
        return true;
      })().catch(e => { journal("démarrage des pubs impossible", e); demarrage = null; return false; });
      return demarrage;
    }

    // Une pub chargée à l'avance (pour qu'elle s'affiche tout de suite)
    function precharger() {
      if (!prete) prete = admob.prepareRewardVideoAd({ adId: c.recompense, isTesting: !!c.test })
        .catch(e => { prete = null; throw e; });
      prete.catch(() => {});
      return prete;
    }

    async function regarder() {
      if (!actif) return "indispo";
      if (enCours) return "annule";
      enCours = true;
      const ecoutes = [];
      try {
        if (!(await demarrer())) return "indispo";
        try { await delai(precharger(), attenteChargement); } catch (e) { journal("pub non chargée", e); prete = null; return "indispo"; }
        prete = null;
        // La pub se termine par « fermée » ; la récompense arrive juste avant si elle a été vue jusqu'au bout
        let gagne = false;
        const fin = new Promise(fini => {
          const ecouter = (nom, f) => Promise.resolve(admob.addListener(nom, f)).then(h => ecoutes.push(h)).catch(() => {});
          Promise.all([
            ecouter(EV.recompense, () => { gagne = true; }),
            ecouter(EV.fermee, () => setTimeout(() => fini(gagne ? "ok" : "annule"), 150)),
            ecouter(EV.echecAffichage, () => fini("indispo"))
          ]).then(() => admob.showRewardVideoAd()
            .then(() => { gagne = true; })
            .catch(e => { journal("pub non affichée", e); fini("indispo"); }));
        });
        return await fin;
      } finally {
        ecoutes.forEach(h => { try { h.remove(); } catch (e) {} });
        enCours = false;
        if (actif && demarrage) precharger().catch(() => {});   // la suivante, à l'avance
      }
    }

    // Paramètres › « Mes choix publicitaires » (demandé par Google quand le joueur doit pouvoir modifier son consentement)
    const choixRequis = () => !!(choix && choix.privacyOptionsRequirementStatus === "REQUIRED");
    async function optionsConfidentialite() {
      if (!actif) return;
      await demarrer();
      await admob.showPrivacyOptionsForm();
      try { choix = await admob.requestConsentInfo(); } catch (e) {}
    }

    return { actif, demarrer, regarder, choixRequis, optionsConfidentialite };
  }

  return { creer };
});
