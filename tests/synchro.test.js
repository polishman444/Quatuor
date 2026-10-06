// Synchronisation de bout en bout : moteur de js/en-ligne.js + vraie base (RLS comprise)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { creerBase } = require("./aide-pg.js");
const { stockage, apiTest } = require("./aide-synchro.js");
const QC = require("../js/calculs.js");
const { creerSynchro } = require("../js/en-ligne.js");

const J = n => QC.dateDuNum(n);
// Un appareil : stockage local + moteur de synchro + compte (uid) ; « jour » = date du jour de l'appareil
function appareil(base, local, uid, jour) {
  const ls = stockage(local), compte = { uid, horsLigne: false };
  const s = creerSynchro(apiTest(base, compte), { ls, aujourdhui: () => J(jour.n) });
  return { ls, compte, ...s, jour };
}
async function compte(base) { const id = crypto.randomUUID(); await base.admin("insert into auth.users (id) values ($1)", [id]); return id; }
// Ce que fait index.html à la mise à jour : base = stats actuelles de l'appareil
const misAJour = local => ({ ...local, "quatuor-base": QC.baseDepuisStats(local.quatuor) });

const ANCIEN = {
  quatuor: { played: 12, wins: 10, streak: 4, best: 6, lastPlayed: 20, lastWin: 20 },
  "quatuor-res": { g001: { win: true, mistakes: 1, tries: 1, first: { win: true, mistakes: 1 }, hist: [[0, 0, 0, 0]], found: [0, 1, 2, 3], vu: true, hints: 0 },
    g002: { win: false, mistakes: 4, tries: 1, first: { win: false, mistakes: 4 }, hist: [[0, 1, 0, 0]], found: [], vu: false, hints: 2 } },
  "quatuor-favs": [{ id: "g001:Planètes", grid: "g001", num: 1, name: "Planètes", words: ["Mars"], fact: "…", lvl: 0, at: 1000 }]
};

test("joueur existant qui met à jour : aucune perte de progression", async () => {
  const b = await creerBase(), A = await compte(b), jour = { n: 21 };
  const avant = JSON.parse(JSON.stringify(ANCIEN));
  const app = appareil(b, misAJour(ANCIEN), A, jour);
  const r = await app.synchroniser();
  assert.equal(r.ok, true);
  // local : identique
  assert.deepEqual(app.ls.json("quatuor"), avant.quatuor);
  assert.deepEqual(app.ls.json("quatuor-res"), avant["quatuor-res"]);
  assert.deepEqual(app.ls.json("quatuor-favs").map(f => f.id), ["g001:Planètes"]);
  // serveur : tout est là
  assert.equal((await b.en(A, "select * from public.resultats")).length, 2);
  assert.equal((await b.en(A, "select * from public.favoris")).length, 1);
  const [s] = await b.en(A, "select serie, record, parties from public.mes_stats($1::date)", [J(21)]);
  assert.deepEqual(s, { serie: 4, record: 6, parties: 12 });
  // une 2e synchro ne renvoie rien
  assert.equal((await app.synchroniser()).envoyes, 0);
});

test("nouveau joueur hors ligne : le jeu marche, la synchro se fait au retour du réseau", async () => {
  const b = await creerBase(), A = await compte(b), jour = { n: 3 };
  const app = appareil(b, { "quatuor-base": QC.BASE_VIDE }, A, jour);
  app.compte.horsLigne = true;
  // il joue hors ligne (ce que fait finish())
  const res = { g010: { win: true, mistakes: 0, tries: 1, first: { win: true, mistakes: 0 }, hist: [], vu: true, hints: 0, d: J(3), jdj: true } };
  app.ls.set("quatuor-res", JSON.stringify(res));
  const r = await app.synchroniser();
  assert.equal(r.ok, false);
  assert.deepEqual(app.ls.json("quatuor-res"), res);   // rien n'est touché
  // retour du réseau
  app.compte.horsLigne = false;
  assert.equal((await app.synchroniser()).ok, true);
  assert.equal((await b.en(A, "select * from public.resultats")).length, 1);
  assert.equal(app.ls.json("quatuor").streak, 1);
});

test("2e appareil sur le même compte : progression récupérée et fusionnée (meilleur résultat)", async () => {
  const b = await creerBase(), A = await compte(b), jour = { n: 21 };
  const tel1 = appareil(b, misAJour(ANCIEN), A, jour);
  await tel1.synchroniser();
  // nouvel appareil vierge (base vide), mais a gagné g002 et une grille du jour
  const tel2 = appareil(b, { "quatuor-base": QC.BASE_VIDE, "quatuor-res": {
    g002: { win: true, mistakes: 1, tries: 1, first: { win: true, mistakes: 1 }, hist: [], vu: true, hints: 0, d: J(21), jdj: false },
    g021: { win: true, mistakes: 0, tries: 1, first: { win: true, mistakes: 0 }, hist: [], vu: true, hints: 0, d: J(21), jdj: true } } }, A, jour);
  await tel2.synchroniser();
  await tel1.synchroniser();
  for (const t of [tel1, tel2]) {
    const r = t.ls.json("quatuor-res");
    assert.deepEqual(Object.keys(r).sort(), ["g001", "g002", "g021"]);
    assert.equal(r.g002.win, true, "meilleur résultat gardé");
    assert.deepEqual(t.ls.json("quatuor"), { played: 13, wins: 11, streak: 5, best: 6, lastPlayed: 21, lastWin: 21 });
    assert.deepEqual(t.ls.json("quatuor-favs").map(f => f.id), ["g001:Planètes"]);
  }
});

test("favori retiré sur un appareil : retiré partout", async () => {
  const b = await creerBase(), A = await compte(b), jour = { n: 21 };
  const t1 = appareil(b, misAJour(ANCIEN), A, jour), t2 = appareil(b, { "quatuor-base": QC.BASE_VIDE }, A, jour);
  await t1.synchroniser(); await t2.synchroniser();
  assert.equal(t2.ls.json("quatuor-favs").length, 1);
  // t1 retire le favori (ce que fait toggleFav)
  t1.ls.set("quatuor-favs", "[]"); t1.ls.set("quatuor-favs-suppr", JSON.stringify({ "g001:Planètes": Date.now() }));
  await t1.synchroniser(); await t2.synchroniser();
  assert.equal(t2.ls.json("quatuor-favs").length, 0);
  assert.equal((await b.en(A, "select * from public.favoris where not supprime")).length, 0);
});

test("réinitialisation sur un appareil : effacée partout, même faite hors ligne", async () => {
  const b = await creerBase(), A = await compte(b), jour = { n: 21 };
  const t1 = appareil(b, misAJour(ANCIEN), A, jour), t2 = appareil(b, { "quatuor-base": QC.BASE_VIDE }, A, jour);
  await t1.synchroniser(); await t2.synchroniser();
  // ce que fait reinitialiser() dans index.html
  ["quatuor-res", "quatuor"].forEach(k => t1.ls.del(k)); t1.ls.set("quatuor-base", JSON.stringify(QC.BASE_VIDE));
  t1.ls.set("quatuor-sync", JSON.stringify({ ...t1.ls.json("quatuor-sync"), reinitAFaire: true }));
  t1.compte.horsLigne = true; await t1.synchroniser(); t1.compte.horsLigne = false;
  await t1.synchroniser(); await t2.synchroniser();
  for (const t of [t1, t2]) {
    assert.deepEqual(t.ls.json("quatuor-res"), {});
    assert.equal(t.ls.json("quatuor").played, 0);
  }
  assert.equal((await b.en(A, "select * from public.resultats")).length, 0);
});

test("changement de compte : tout est renvoyé vers le nouveau compte", async () => {
  const b = await creerBase(), A = await compte(b), B = await compte(b), jour = { n: 21 };
  const t = appareil(b, misAJour(ANCIEN), A, jour);
  await t.synchroniser();
  t.compte.uid = B;
  await t.synchroniser();
  assert.equal((await b.en(B, "select * from public.resultats")).length, 2);
  const [s] = await b.en(B, "select serie, parties from public.mes_stats($1::date)", [J(21)]);
  assert.deepEqual(s, { serie: 4, parties: 12 });
});
