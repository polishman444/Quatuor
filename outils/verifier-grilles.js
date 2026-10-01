#!/usr/bin/env node
// Vérifie grilles.json avant publication.
// Utilisation : node outils/verifier-grilles.js [chemin/vers/grilles.json]
"use strict";
const fs = require("fs");
const path = require("path");

const fichier = process.argv[2] || path.join(__dirname, "..", "grilles.json");
const DIFFICULTES = ["facile", "moyen", "difficile", "goat"];
const erreurs = [];
const avertissements = [];
const err = (ou, msg) => erreurs.push(`${ou} : ${msg}`);

let data;
try {
  data = JSON.parse(fs.readFileSync(fichier, "utf8"));
} catch (e) {
  console.error(`✗ Impossible de lire ${fichier} : ${e.message}`);
  process.exit(1);
}

if (!data || !Array.isArray(data.grilles)) {
  console.error("✗ Le fichier doit contenir { \"version\": …, \"grilles\": [ … ] }");
  process.exit(1);
}
if (!Number.isInteger(data.version)) err("racine", "« version » doit être un nombre entier");

const ids = new Map(), nums = new Map(), jours = new Map();
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dateValide = s => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, j] = s.split("-").map(Number), d = new Date(a, m - 1, j);
  return iso(d) === s;
};

data.grilles.forEach((g, n) => {
  const ou = `grille ${g && g.id ? g.id : "n°" + (n + 1) + " de la liste"}`;
  if (!g || typeof g !== "object") return err(ou, "n'est pas un objet");

  if (typeof g.id !== "string" || !g.id.trim()) err(ou, "« id » manquant");
  else if (ids.has(g.id)) err(ou, `« id » déjà utilisé (position ${ids.get(g.id) + 1})`);
  else ids.set(g.id, n);

  if (!Number.isInteger(g.num) || g.num < 1) err(ou, "« num » doit être un entier positif");
  else if (nums.has(g.num)) err(ou, `« num » ${g.num} déjà utilisé par ${nums.get(g.num)}`);
  else nums.set(g.num, g.id);

  if (!DIFFICULTES.includes(g.difficulte)) err(ou, `« difficulte » doit valoir ${DIFFICULTES.join(", ")}`);

  if (g.jour !== undefined && g.jour !== null) {
    if (!dateValide(g.jour)) err(ou, `« jour » invalide (${g.jour}), format attendu AAAA-MM-JJ`);
    else {
      if (g.difficulte === "goat") err(ou, "une grille GOAT ne peut pas être grille du jour (retire « jour »)");
      if (jours.has(g.jour)) err(ou, `deux grilles le même jour (${g.jour}) : déjà ${jours.get(g.jour)}`);
      else jours.set(g.jour, g.id);
    }
  }

  if (!Array.isArray(g.groupes) || g.groupes.length !== 4) return err(ou, "il faut exactement 4 groupes");
  const mots = [];
  g.groupes.forEach((gr, k) => {
    const o = `${ou}, groupe ${k + 1}`;
    if (!gr || typeof gr.nom !== "string" || !gr.nom.trim()) err(o, "« nom » manquant");
    if (!gr || typeof gr.anecdote !== "string" || !gr.anecdote.trim()) err(o, "« anecdote » manquante");
    if (!gr || !Array.isArray(gr.mots) || gr.mots.length !== 4) return err(o, "il faut exactement 4 mots");
    gr.mots.forEach(m => {
      if (typeof m !== "string" || !m.trim()) err(o, "mot vide");
      else {
        if (m !== m.trim()) avertissements.push(`${o} : espace en trop autour de « ${m} »`);
        mots.push(m);
      }
    });
  });
  const vus = new Set();
  mots.forEach(m => {
    const cle = m.trim().toLowerCase();
    if (vus.has(cle)) err(ou, `mot en double : « ${m} »`);
    vus.add(cle);
  });
});

// Calendrier : jours sans grille planifiée dans les 30 prochains jours
const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
const trous = [];
for (let k = 0; k < 30; k++) {
  const d = new Date(aujourdhui); d.setDate(d.getDate() + k);
  if (!jours.has(iso(d))) trous.push(iso(d));
}

const parDiff = DIFFICULTES.map(d => `${d} ${data.grilles.filter(g => g && g.difficulte === d).length}`).join(", ");
console.log(`Fichier : ${path.relative(process.cwd(), fichier) || fichier}`);
console.log(`${data.grilles.length} grilles (${parDiff}), ${jours.size} planifiées.`);
if (avertissements.length) { console.log(`\n⚠ ${avertissements.length} avertissement(s) :`); avertissements.forEach(a => console.log("  - " + a)); }
console.log(trous.length
  ? `\n📅 ${trous.length} jour(s) sans grille planifiée dans les 30 prochains jours (une grille de secours sera choisie) :\n  ${trous.join(", ")}`
  : "\n📅 Les 30 prochains jours ont tous une grille planifiée.");
if (erreurs.length) {
  console.log(`\n✗ ${erreurs.length} erreur(s) :`);
  erreurs.forEach(e => console.log("  - " + e));
  process.exit(1);
}
console.log("\n✓ grilles.json est valide.");
