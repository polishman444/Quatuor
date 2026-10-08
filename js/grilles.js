// =====================================================================
// Quatuor · règles des grilles (fonctions pures, sans réseau ni DOM)
// Chargé dans le jeu (window.QG), par le vérificateur (outils/verifier-grilles.js) et par les tests Node (require).
// Une grille, ici : { id, diff ("facile"|"moyen"|"difficile"|"goat"), jour ("AAAA-MM-JJ"|null), always (toujours_visible), theme }
// =====================================================================
(function (racine, fabrique) {
  const m = fabrique();
  if (typeof module === "object" && module.exports) module.exports = m; else racine.QG = m;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DIFFICULTES = ["facile", "moyen", "difficile", "goat"];
  // Difficultés possibles pour la grille du jour : jamais facile (trop simple), jamais GOAT (trop dur)
  const DIFFS_DU_JOUR = ["moyen", "difficile"];

  const duQuotidien = g => !g.theme || g.theme === "quotidien";
  // Grille du calendrier : une date, pas « toujours_visible » (secrète jusqu'à son jour)
  const estCalendrier = g => duQuotidien(g) && !!g.jour && !g.always;
  // Peut-elle être grille du jour (planifiée, ou grille bonus de secours) ?
  const difficulteDuJour = g => DIFFS_DU_JOUR.includes(g.diff);
  // Grille libre : jouable à tout moment (sans date, ou « toujours_visible »)
  const estLibre = g => duQuotidien(g) && (g.always || !g.jour);

  // FNV-1a 32 bits : même résultat partout (navigateur, appli, Node)
  function hashStr(s) {
    let h = 2166136261;
    for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // Grille du jour pour une date : celle du calendrier, sinon une « Grille bonus » de secours.
  // La grille bonus ne dépend QUE de la date et de la liste des grilles (jamais de ce que le joueur a déjà fait) :
  // tout le monde a la même. Tirage « au plus haut score » (hash de la date et de l'id) : ajouter de nouvelles grilles
  // libres ne change le tirage que si l'une d'elles l'emporte.
  // Renvoie { index, bonus } (index = -1 s'il n'y a aucune grille du jeu quotidien).
  function choisirGrilleDuJour(grilles, jour) {
    const planifiee = grilles.findIndex(g => estCalendrier(g) && g.jour === jour && difficulteDuJour(g));
    if (planifiee >= 0) return { index: planifiee, bonus: false };
    const indices = grilles.map((_, i) => i).filter(i => duQuotidien(grilles[i]));
    const pools = [
      indices.filter(i => estLibre(grilles[i]) && difficulteDuJour(grilles[i])),
      indices.filter(i => estLibre(grilles[i]) && grilles[i].diff !== "goat"),
      indices.filter(i => estLibre(grilles[i]))
    ];
    const pool = pools.find(p => p.length);
    if (!pool) return { index: -1, bonus: true };
    let meilleur = -1, score = -1;
    for (const i of pool) {
      const s = hashStr(jour + "|" + grilles[i].id);
      if (s > score || (s === score && grilles[i].id < grilles[meilleur].id)) { score = s; meilleur = i; }
    }
    return { index: meilleur, bonus: true };
  }

  return { DIFFICULTES, DIFFS_DU_JOUR, estCalendrier, estLibre, difficulteDuJour, hashStr, choisirGrilleDuJour };
});
