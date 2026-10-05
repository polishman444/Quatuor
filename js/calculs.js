// =====================================================================
// Quatuor · calculs du mode en ligne (fonctions pures, sans réseau ni DOM)
// Chargé dans le jeu (window.QC) et dans les tests Node (require).
// ⚠️ fusionnerResultat() et calculerStats() ont leur jumelle SQL dans supabase/migrations/0001
//    (trigger garder_meilleur_resultat et fonction calcul_stats) : les tests vérifient qu'elles concordent.
// =====================================================================
(function (racine, fabrique) {
  const m = fabrique();
  if (typeof module === "object" && module.exports) module.exports = m; else racine.QC = m;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- Dates (chaînes AAAA-MM-JJ, calculées en UTC pour éviter les pièges des changements d'heure) ----
  const DEBUT = Date.UTC(2026, 9, 1);   // 1er octobre 2026 = jour n°1 (comme dayNum dans index.html)
  const enMs = s => { const [a, m, j] = s.split("-").map(Number); return Date.UTC(a, m - 1, j); };
  const versDate = ms => new Date(ms).toISOString().slice(0, 10);
  const ajouterJours = (s, n) => versDate(enMs(s) + n * 864e5);
  const estDate = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(enMs(s));
  const numJour = s => Math.round((enMs(s) - DEBUT) / 864e5) + 1;
  const dateDuNum = n => versDate(DEBUT + (n - 1) * 864e5);

  const borne = (v, min, max, def) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def; };

  // ---- Résultats : format local (quatuor-res) ⇄ ligne de la table resultats ----
  // Local : { win, mistakes, tries, first:{win,mistakes}, hist, found, vu, hints, d (date), jdj (grille du jour), s (durée en s) }
  const premierEssai = x => (x.first && typeof x.first === "object" ? x.first : { win: !!x.win, mistakes: x.mistakes | 0 });
  const histValide = h => Array.isArray(h) ? h.filter(r => Array.isArray(r) && r.length === 4).slice(0, 20)
    .map(r => r.map(i => borne(i, 0, 3, 0))) : [];
  const trouvesValides = f => Array.isArray(f) ? [...new Set(f.map(i => borne(i, 0, 3, 0)))] : undefined;

  function versServeur(id, x) {
    const p = premierEssai(x);
    const d = estDate(x.d) ? x.d : null;
    const detail = { hist: histValide(x.hist), vu: x.vu === undefined ? !!x.win : !!x.vu };
    const f = trouvesValides(x.found); if (f) detail.found = f;
    return {
      grille_id: id, gagne: !!x.win, erreurs: borne(x.mistakes, 0, 10, 0), indices: borne(x.hints || 0, 0, 2, 0),
      essais: borne(x.tries || 1, 1, 99, 1), premier_gagne: !!p.win, premier_erreurs: borne(p.mistakes, 0, 10, 0),
      duree_s: Number.isFinite(x.s) ? borne(x.s, 0, 86400, null) : null, joue_le: d, du_jour: !!(x.jdj && d), detail
    };
  }
  function depuisServeur(r) {
    const det = r.detail && typeof r.detail === "object" ? r.detail : {};
    const x = { win: !!r.gagne, mistakes: r.erreurs | 0, tries: r.essais || 1, first: { win: !!r.premier_gagne, mistakes: r.premier_erreurs | 0 },
      hist: histValide(det.hist), vu: det.vu === undefined ? !!r.gagne : !!det.vu, hints: r.indices | 0 };
    const f = trouvesValides(det.found); if (f) x.found = f;
    if (r.joue_le) x.d = String(r.joue_le).slice(0, 10);
    if (r.du_jour) x.jdj = true;
    if (r.duree_s != null) x.s = r.duree_s;
    return x;
  }
  const memeResultat = (a, b) => JSON.stringify(versServeur("x", a)) === JSON.stringify(versServeur("x", b));

  // Rang d'un résultat : plus petit = meilleur (gagné, puis moins d'essais, d'erreurs, d'indices)
  const rang = x => [x.win ? 0 : 1, borne(x.tries || 1, 1, 99, 1), borne(x.mistakes, 0, 10, 0), borne(x.hints || 0, 0, 9, 0)];
  const compare = (a, b) => { for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

  // Fusion de deux versions d'un même résultat (a = version existante, b = version reçue).
  // Même règle que le trigger SQL : meilleur résultat ; premier essai de la grille du jour, sinon le plus ancien.
  function fusionnerResultat(a, b) {
    if (!a) return b; if (!b) return a;
    const garderPremierA = !!a.jdj !== !!b.jdj ? !!a.jdj
      : !estDate(a.d) ? true : !estDate(b.d) ? false : a.d <= b.d;
    const src = garderPremierA ? a : b;
    const meilleurB = compare(rang(b), rang(a)) < 0;
    const res = meilleurB ? { ...b } : { ...a, vu: (a.vu === undefined ? !!a.win : !!a.vu) || (b.vu === undefined ? !!b.win : !!b.vu) };
    res.first = { ...premierEssai(src) };
    delete res.d; delete res.jdj;
    if (estDate(src.d)) res.d = src.d;
    if (src.jdj && estDate(src.d)) res.jdj = true;
    return res;
  }

  // ---- Statistiques des grilles du jour ----
  // base : stats de l'appareil avant le mode en ligne { parties, victoires, record, serie, derniereVictoire, dernierJeu }
  // resultats : quatuor-res ; seuls les résultats datés « grille du jour » (jdj) comptent en plus de la base.
  function baseDepuisStats(s) {
    s = s && typeof s === "object" ? s : {};
    const n = v => borne(v || 0, 0, 100000, 0);
    return { parties: n(s.played), victoires: n(s.wins), record: n(s.best), serie: n(s.streak),
      derniereVictoire: Number.isInteger(s.lastWin) ? dateDuNum(s.lastWin) : null,
      dernierJeu: Number.isInteger(s.lastPlayed) ? dateDuNum(s.lastPlayed) : null };
  }
  const BASE_VIDE = { parties: 0, victoires: 0, record: 0, serie: 0, derniereVictoire: null, dernierJeu: null };

  function calculerStats(base, resultats, aujourdhui) {
    base = base || BASE_VIDE;
    const gagnes = new Set(), joues = new Set(), victoiresApres = new Set(), partiesApres = new Set();
    Object.values(resultats || {}).forEach(x => {
      if (!x || !x.jdj || !estDate(x.d)) return;
      const p = premierEssai(x);
      joues.add(x.d); if (p.win) gagnes.add(x.d);
      if (!base.dernierJeu || x.d > base.dernierJeu) { partiesApres.add(x.d); if (p.win) victoiresApres.add(x.d); }
    });
    if (estDate(base.derniereVictoire))
      for (let k = 0; k < Math.max(1, base.serie || 0); k++) gagnes.add(ajouterJours(base.derniereVictoire, -k));
    gagnes.forEach(d => joues.add(d));
    if (estDate(base.dernierJeu)) joues.add(base.dernierJeu);

    let depart = null, serie = 0;
    if (joues.has(aujourdhui)) depart = aujourdhui; else if (joues.has(ajouterJours(aujourdhui, -1))) depart = ajouterJours(aujourdhui, -1);
    for (let d = depart; d && gagnes.has(d); d = ajouterJours(d, -1)) serie++;

    let meilleure = 0, courante = 0, prec = null;
    [...gagnes].sort().forEach(d => { courante = prec && ajouterJours(prec, 1) === d ? courante + 1 : 1; meilleure = Math.max(meilleure, courante); prec = d; });
    const max = e => e.size ? [...e].sort().pop() : null;
    return { serie, record: Math.max(base.record || 0, meilleure), parties: (base.parties || 0) + partiesApres.size,
      victoires: (base.victoires || 0) + victoiresApres.size, derniereVictoire: max(gagnes), dernierJeu: max(joues) };
  }
  // Au format de la clé locale « quatuor » (celui qu'utilisent l'affichage et les rappels)
  function statsLocales(st) {
    const s = { played: st.parties, wins: st.victoires, streak: st.serie, best: st.record };
    if (st.dernierJeu) s.lastPlayed = numJour(st.dernierJeu);
    if (st.derniereVictoire) s.lastWin = numJour(st.derniereVictoire);
    return s;
  }

  // ---- Favoris : dernière modification gagnante (pierres tombales pour les suppressions) ----
  // local : liste quatuor-favs [{id, …, at}] + suppressions { id: horodatage }
  function fusionnerFavoris(locaux, suppressions, distants) {
    const parId = new Map();
    (locaux || []).forEach(f => { if (f && typeof f.id === "string") parId.set(f.id, { maj: f.maj || f.at || 0, fav: f }); });
    Object.entries(suppressions || {}).forEach(([id, t]) => { const e = parId.get(id); if (!e || t > e.maj) parId.set(id, { maj: t, fav: null }); });
    (distants || []).forEach(r => {
      const t = Date.parse(r.maj_le) || 0, e = parId.get(r.fav_id);
      if (e && e.maj >= t) return;
      const d = r.donnees && typeof r.donnees === "object" ? r.donnees : {};
      parId.set(r.fav_id, { maj: t, fav: r.supprime ? null : { ...d, id: r.fav_id, maj: t } });
    });
    const favs = [], suppr = {};
    parId.forEach((e, id) => { if (e.fav) favs.push({ ...e.fav, maj: e.maj }); else suppr[id] = e.maj; });
    return { favs, suppressions: suppr };
  }
  function favoriVersServeur(f) {
    const { id, maj, ...donnees } = f;
    return { fav_id: id, donnees, supprime: false, maj_le: new Date(maj || f.at || Date.now()).toISOString() };
  }

  return { DEBUT, ajouterJours, estDate, numJour, dateDuNum, versServeur, depuisServeur, memeResultat, fusionnerResultat,
    baseDepuisStats, BASE_VIDE, calculerStats, statsLocales, fusionnerFavoris, favoriVersServeur };
});
