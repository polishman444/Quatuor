// =====================================================================
// Quatuor · statistiques anonymes (TelemetryDeck)
// Respectueux de la vie privée : aucune donnée personnelle, aucun pseudo, aucun identifiant de compte.
// Chaque appareil a un identifiant aléatoire (jamais relié au compte Quatuor), envoyé seulement après
// hachage SHA-256, comme le fait le SDK officiel. Le contenu des grilles n'est jamais envoyé.
// Rien n'est envoyé : sans identifiant d'appli, en développement local, ou si le joueur a désactivé
// « Partager des statistiques anonymes » (Paramètres › Données).
// =====================================================================
(function (racine, fabrique) {
  const m = fabrique();
  if (typeof module === "object" && module.exports) module.exports = m; else racine.QuatuorStats = m;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ADRESSE = "https://nom.telemetrydeck.com/v2/";
  const aleatoire = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID()
    : "x".repeat(32).replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)));
  async function sha256(t) {
    const o = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
    return [...new Uint8Array(o)].map(x => x.toString(16).padStart(2, "0")).join("");
  }

  // opts : { appId, ls, autorise: () => bool, local: bool, test: bool, commun: {…}, envoyer: fetch }
  function creer(opts) {
    const { appId, ls, local } = opts;
    const envoyer = opts.envoyer || ((u, o) => fetch(u, o));
    const actif = () => !!appId && !local && opts.autorise();
    const session = aleatoire();
    let file = [], minuteur = 0, utilisateur = null;

    async function idAppareil() {
      if (utilisateur) return utilisateur;
      let id = ls.get("quatuor-id-stats");
      if (!id) { id = aleatoire(); ls.set("quatuor-id-stats", id); }
      utilisateur = await sha256(id + ":quatuor");
      return utilisateur;
    }
    async function vider() {
      clearTimeout(minuteur); minuteur = 0;
      if (!file.length) return;
      if (!actif()) { file = []; return; }
      const lot = file.splice(0, 50), clientUser = await idAppareil();
      const signaux = lot.map(s => ({ appID: appId, clientUser, sessionID: session, type: s.type, payload: s.payload, isTestMode: opts.test ? "true" : "false" }));
      try { await envoyer(ADRESSE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(signaux), keepalive: true }); }
      catch (e) { /* hors ligne : ces statistiques sont simplement perdues */ }
    }
    // Un signal : type (ex. « Grille.reussie ») + quelques valeurs simples, converties en texte
    function signal(type, valeurs = {}) {
      if (!actif()) return;
      const payload = {};
      Object.entries({ ...(opts.commun || {}), ...valeurs }).forEach(([k, v]) => { if (v !== undefined && v !== null) payload[k] = String(v); });
      file.push({ type, payload });
      if (file.length > 100) file = file.slice(-100);
      if (!minuteur) minuteur = setTimeout(vider, 5000);
    }
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") vider(); });
    return { signal, vider, actif };
  }
  return { creer, ADRESSE };
});
