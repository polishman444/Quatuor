// Tests des calculs purs : série, statistiques, fusion des résultats et des favoris
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const QC = require("../js/calculs.js");

const J = (n) => QC.dateDuNum(n);   // date du jour n°n (1 = 1er octobre 2026)
const gagne = (d, extra = {}) => ({ win: true, mistakes: 0, tries: 1, first: { win: true, mistakes: 0 }, hints: 0, hist: [], d, jdj: true, ...extra });
const perdu = (d, extra = {}) => ({ win: false, mistakes: 4, tries: 1, first: { win: false, mistakes: 4 }, hints: 0, hist: [], d, jdj: true, ...extra });

test("dates : jour n°1 = 1er octobre 2026, sans décalage aux changements d'heure", () => {
  assert.equal(QC.dateDuNum(1), "2026-10-01");
  assert.equal(QC.numJour("2026-10-01"), 1);
  assert.equal(QC.numJour("2027-03-29"), 180);           // après le passage à l'heure d'été
  assert.equal(QC.dateDuNum(QC.numJour("2027-11-02")), "2027-11-02");
});

test("série : mêmes règles que l'ancien calcul incrémental", () => {
  const b = QC.BASE_VIDE;
  assert.equal(QC.calculerStats(b, {}, J(10)).serie, 0);
  // 3 jours gagnés d'affilée jusqu'à aujourd'hui
  let r = { a: gagne(J(8)), b: gagne(J(9)), c: gagne(J(10)) };
  assert.equal(QC.calculerStats(b, r, J(10)).serie, 3);
  // aujourd'hui pas encore joué : la série d'hier court toujours
  assert.equal(QC.calculerStats(b, r, J(11)).serie, 3);
  // un jour sans jouer : série perdue
  assert.equal(QC.calculerStats(b, r, J(12)).serie, 0);
  // perdu aujourd'hui : 0, même si hier était gagné
  r.d = perdu(J(11));
  assert.equal(QC.calculerStats(b, r, J(11)).serie, 0);
  // gagné au 2e essai : ne compte pas (seul le 1er essai compte)
  r = { a: gagne(J(9)), b: gagne(J(10), { first: { win: false, mistakes: 4 }, tries: 2 }) };
  assert.equal(QC.calculerStats(b, r, J(10)).serie, 0);
  // grilles hors grille du jour : jamais comptées
  r = { a: gagne(J(10), { jdj: false }) };
  assert.deepEqual(QC.calculerStats(b, r, J(10)), { serie: 0, record: 0, parties: 0, victoires: 0, derniereVictoire: null, dernierJeu: null });
});

test("série : un trou au milieu, record = plus longue suite", () => {
  const r = { a: gagne(J(1)), b: gagne(J(2)), c: gagne(J(3)), d: gagne(J(4)), e: perdu(J(5)), f: gagne(J(6)), g: gagne(J(7)) };
  const s = QC.calculerStats(QC.BASE_VIDE, r, J(7));
  assert.equal(s.serie, 2); assert.equal(s.record, 4); assert.equal(s.parties, 7); assert.equal(s.victoires, 6);
});

test("joueur existant : la base prolonge la série sans coupure et rien n'est perdu", () => {
  const anciennes = { played: 12, wins: 9, streak: 4, best: 6, lastWin: 20, lastPlayed: 20 };
  const base = QC.baseDepuisStats(anciennes);
  // Juste après la mise à jour (le jour même ou le lendemain) : identique
  assert.deepEqual(QC.statsLocales(QC.calculerStats(base, {}, J(20))), anciennes);
  assert.deepEqual(QC.statsLocales(QC.calculerStats(base, {}, J(21))), anciennes);
  // Résultats sans date (d'avant la mise à jour) : ignorés (déjà comptés dans la base)
  const legacy = { g001: { win: true, mistakes: 1, tries: 1 } };
  assert.deepEqual(QC.statsLocales(QC.calculerStats(base, legacy, J(20))), anciennes);
  // Il gagne la grille du lendemain : série 5, record 6, 13 parties
  const s = QC.calculerStats(base, { x: gagne(J(21)) }, J(21));
  assert.deepEqual([s.serie, s.record, s.parties, s.victoires], [5, 6, 13, 10]);
  // puis 2 jours de plus : nouveau record
  const s2 = QC.calculerStats(base, { x: gagne(J(21)), y: gagne(J(22)), z: gagne(J(23)) }, J(23));
  assert.deepEqual([s2.serie, s2.record], [7, 7]);
});

test("joueur existant dont la dernière partie est une défaite : série à 0 conservée", () => {
  const anciennes = { played: 5, wins: 3, streak: 0, best: 2, lastWin: 18, lastPlayed: 19 };
  const base = QC.baseDepuisStats(anciennes);
  assert.deepEqual(QC.statsLocales(QC.calculerStats(base, {}, J(19))), anciennes);
  assert.equal(QC.calculerStats(base, { x: gagne(J(20)) }, J(20)).serie, 1);
});

test("fusion : on garde toujours le meilleur résultat", () => {
  const l = perdu(J(3), { vu: true }), w = gagne(J(5), { tries: 2, first: { win: false, mistakes: 4 }, mistakes: 2 });
  let m = QC.fusionnerResultat(l, w);
  assert.equal(m.win, true); assert.equal(m.tries, 2);
  // le premier essai reste celui du premier jour joué
  assert.equal(m.d, J(3)); assert.deepEqual(m.first, { win: false, mistakes: 4 });
  // symétrique sur le résultat
  m = QC.fusionnerResultat(w, l); assert.equal(m.win, true);
  // à résultat égal : moins d'erreurs, puis moins d'indices
  assert.equal(QC.fusionnerResultat(gagne(J(1), { mistakes: 2 }), gagne(J(1), { mistakes: 1 })).mistakes, 1);
  assert.equal(QC.fusionnerResultat(gagne(J(1), { hints: 2 }), gagne(J(1), { hints: 0 })).hints, 0);
  // « solution vue » : vraie si l'un des deux l'a vue
  assert.equal(QC.fusionnerResultat(perdu(J(1), { vu: false }), perdu(J(1), { vu: true })).vu, true);
  // version grille du jour prioritaire pour le premier essai
  const m2 = QC.fusionnerResultat(perdu(J(9), { jdj: false }), gagne(J(10)));
  assert.equal(m2.jdj, true); assert.equal(m2.d, J(10));
});

test("conversion local ⇄ serveur sans perte", () => {
  const x = { win: false, mistakes: 4, tries: 2, first: { win: false, mistakes: 4 }, hist: [[0, 1, 1, 1], [0, 0, 0, 0]], found: [0], vu: false, hints: 1, d: J(4), jdj: true, s: 93 };
  const r = QC.versServeur("g012", x);
  assert.equal(r.grille_id, "g012"); assert.equal(r.du_jour, true); assert.equal(r.duree_s, 93);
  assert.deepEqual(QC.depuisServeur(r), x);
  // ancien résultat sans date : jamais « grille du jour »
  assert.equal(QC.versServeur("g001", { win: true, mistakes: 0, tries: 1, jdj: true }).du_jour, false);
});

test("favoris : dernière modification gagnante, retraits propagés", () => {
  const loc = [{ id: "g1:A", name: "A", at: 1000 }, { id: "g1:B", name: "B", at: 1000 }];
  const dist = [
    { fav_id: "g1:B", donnees: {}, supprime: true, maj_le: new Date(2000).toISOString() },      // retiré ailleurs, plus tard
    { fav_id: "g2:C", donnees: { name: "C" }, supprime: false, maj_le: new Date(1500).toISOString() }, // ajouté ailleurs
    { fav_id: "g3:D", donnees: { name: "D" }, supprime: false, maj_le: new Date(1500).toISOString() }
  ];
  const f = QC.fusionnerFavoris(loc, { "g3:D": 3000 }, dist);   // D retiré ici après
  assert.deepEqual(f.favs.map(x => x.id).sort(), ["g1:A", "g2:C"]);
  assert.deepEqual(Object.keys(f.suppressions).sort(), ["g1:B", "g3:D"]);
});
