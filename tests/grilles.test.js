// Règles des grilles (js/grilles.js) : grille du jour jamais facile ni GOAT, grille bonus identique pour tous
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const QG = require("../js/grilles.js");

const g = (id, diff, o = {}) => ({ id, diff, jour: null, always: false, theme: "quotidien", ...o });

test("grille du calendrier : choisie le jour J, jamais si elle est facile ou GOAT", () => {
  const l = [g("a", "moyen"), g("b", "difficile", { jour: "2026-11-02" }), g("c", "facile", { jour: "2026-11-03" }), g("d", "goat", { jour: "2026-11-04" })];
  assert.deepEqual(QG.choisirGrilleDuJour(l, "2026-11-02"), { index: 1, bonus: false });
  for (const j of ["2026-11-03", "2026-11-04"]) assert.deepEqual(QG.choisirGrilleDuJour(l, j), { index: 0, bonus: true });
});

test("grille bonus : même grille pour tous, uniquement moyenne ou difficile, jamais une grille du calendrier", () => {
  const l = [g("f1", "facile"), g("f2", "facile", { always: true }), g("m1", "moyen"), g("m2", "moyen", { always: true }), g("d1", "difficile"),
    g("x1", "goat"), g("cal", "moyen", { jour: "2026-12-01" }), g("th", "moyen", { theme: "sport" })];
  const vus = new Set();
  for (let k = 1; k <= 28; k++) {
    const jour = `2026-11-${String(k).padStart(2, "0")}`, c = QG.choisirGrilleDuJour(l, jour);
    assert.equal(c.bonus, true);
    assert.ok(["m1", "m2", "d1"].includes(l[c.index].id), `${jour} : ${l[c.index].id}`);
    // ne dépend que de la date et des grilles (ordre de la liste compris)
    assert.equal(QG.choisirGrilleDuJour([...l].reverse(), jour).index, l.length - 1 - c.index);
    vus.add(l[c.index].id);
  }
  assert.ok(vus.size > 1, "le tirage varie d'un jour à l'autre");
});

test("grille bonus : ajouter une grille ne change le tirage que si la nouvelle l'emporte", () => {
  const l = Array.from({ length: 30 }, (_, i) => g("m" + i, i % 2 ? "moyen" : "difficile"));
  let change = 0;
  for (let k = 1; k <= 30; k++) {
    const jour = `2026-11-${String(k).padStart(2, "0")}`, avant = l[QG.choisirGrilleDuJour(l, jour).index].id;
    const apres = [...l, g("nouvelle", "moyen")], id = apres[QG.choisirGrilleDuJour(apres, jour).index].id;
    if (id !== avant) { assert.equal(id, "nouvelle"); change++; }
  }
  assert.ok(change < 10);
});

test("grilles.json : chaque jour du calendrier a une grille moyenne ou difficile ; jamais de grille du jour facile", () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "../grilles.json"), "utf8"));
  const l = data.grilles.map(x => ({ id: x.id, diff: x.difficulte, jour: x.jour || null, always: x.toujours_visible === true, theme: x.theme || "quotidien" }));
  assert.equal(l.filter(x => x.jour && x.diff === "facile").length, 0, "grille facile avec un « jour »");
  for (const x of l.filter(x => QG.estCalendrier(x))) assert.ok(QG.difficulteDuJour(x), `${x.id} : ${x.diff}`);
});

test("vérificateur : grille du jour facile refusée, doublons signalés", () => {
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, "../grilles.json"), "utf8"));
  const mots = n => Array.from({ length: 4 }, (_, k) => `Mot${n}-${k}`);
  const grille = (id, num, o) => ({ id, num, difficulte: "moyen", theme: "quotidien",
    groupes: [0, 1, 2, 3].map(k => ({ nom: `Groupe ${id} ${k}`, mots: mots(`${id}${k}`), anecdote: "Vrai." })), ...o });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quatuor-"));
  const lancer = grilles => {
    const f = path.join(dir, "g.json"); fs.writeFileSync(f, JSON.stringify({ version: 1, themes: base.themes, grilles }));
    try { return { code: 0, sortie: execFileSync("node", [path.join(__dirname, "../outils/verifier-grilles.js"), f], { encoding: "utf8" }) }; }
    catch (e) { return { code: e.status, sortie: e.stdout }; }
  };
  const r1 = lancer([grille("t1", 1, { difficulte: "facile", jour: "2030-01-01" })]);   // (et calendrier vide)
  assert.equal(r1.code, 1); assert.match(r1.sortie, /facile ne peut pas être grille du jour/);
  // les 7 prochains jours doivent avoir une grille du jour (sinon : erreur)
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const cal = Array.from({ length: 7 }, (_, k) => { const d = new Date(); d.setDate(d.getDate() + k); return grille("c" + k, 10 + k, { difficulte: k % 2 ? "difficile" : "moyen", jour: iso(d) }); });
  const r0 = lancer(cal.slice(1));
  assert.equal(r0.code, 1); assert.match(r0.sortie, /aucune grille du jour planifiée/);
  const a = grille("t2", 2), b = grille("t3", 3);
  b.groupes[0].nom = a.groupes[0].nom;                       // même nom de groupe
  b.groupes[1].mots = [...a.groupes[1].mots.slice(0, 3), "Autre"];   // groupe presque identique
  const r2 = lancer([...cal, a, b]);
  assert.equal(r2.code, 0);
  assert.match(r2.sortie, /nom de groupe déjà utilisé/);
  assert.match(r2.sortie, /groupe presque identique/);
  fs.rmSync(dir, { recursive: true, force: true });
});
