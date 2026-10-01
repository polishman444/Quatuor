#!/usr/bin/env node
// Vérifie grilles.json avant publication.
// Utilisation : node outils/verifier-grilles.js [chemin/vers/grilles.json]
"use strict";
const fs = require("fs");
const path = require("path");

const fichier = process.argv[2] || path.join(__dirname, "..", "grilles.json");
const DIFFICULTES = ["facile", "moyen", "difficile", "goat"];
// La difficulté s'écrit en texte (recommandé) ou en chiffre : 1 = facile, 2 = moyen, 3 = difficile, 4 = goat
const diffDe = v => typeof v === "number" ? DIFFICULTES[v - 1] : v;
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

// Thèmes (mode « Thèmes ») : « quotidien » est réservé aux grilles du jeu quotidien
const themes = new Map();
if (data.themes !== undefined && !Array.isArray(data.themes)) err("racine", "« themes » doit être une liste");
(Array.isArray(data.themes) ? data.themes : []).forEach((t, n) => {
  const ou = `thème ${t && t.id ? t.id : "n°" + (n + 1)}`;
  if (!t || typeof t.id !== "string" || !t.id.trim()) return err(ou, "« id » manquant");
  if (t.id === "quotidien") return err(ou, "« quotidien » est réservé aux grilles du jeu quotidien");
  if (themes.has(t.id)) return err(ou, "« id » de thème en double");
  if (typeof t.nom !== "string" || !t.nom.trim()) err(ou, "« nom » manquant");
  if (typeof t.icone !== "string" || !t.icone.trim()) err(ou, "« icone » manquante");
  if (t.ordre !== undefined && !Number.isFinite(t.ordre)) err(ou, "« ordre » doit être un nombre");
  if (typeof t.publie !== "boolean") err(ou, "« publie » doit valoir true ou false");
  themes.set(t.id, { ...t, grilles: [] });
});

const ids = new Map(), nums = new Map(), jours = new Map(), inedites = new Map();
let secretes = 0;
const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
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

  if (!DIFFICULTES.includes(diffDe(g.difficulte))) err(ou, `« difficulte » doit valoir ${DIFFICULTES.join(", ")} (ou 1 à 4)`);

  const theme = g.theme === undefined ? "quotidien" : g.theme;
  if (theme !== "quotidien") {
    if (!themes.has(theme)) err(ou, `thème « ${theme} » absent de la liste « themes »`);
    else themes.get(theme).grilles.push(diffDe(g.difficulte));
    if (g.jour !== undefined && g.jour !== null) err(ou, "une grille de thème ne peut pas avoir de « jour » (elle n'est jamais grille du jour)");
    if (g.toujours_visible !== undefined) err(ou, "une grille de thème n'utilise pas « toujours_visible »");
  }

  if (g.toujours_visible !== undefined && typeof g.toujours_visible !== "boolean")
    err(ou, "« toujours_visible » doit valoir true ou false");

  if (g.jour !== undefined && g.jour !== null) {
    if (!dateValide(g.jour)) err(ou, `« jour » invalide (${g.jour}), format attendu AAAA-MM-JJ`);
    else {
      if (diffDe(g.difficulte) === "goat") err(ou, "une grille GOAT ne peut pas être grille du jour (retire « jour »)");
      if (jours.has(g.jour)) err(ou, `deux grilles le même jour (${g.jour}) : déjà ${jours.get(g.jour)}`);
      else jours.set(g.jour, g.id);
      if (g.toujours_visible !== true) { secretes++; inedites.set(g.jour, g.id); }
      // Une grille libre (toujours visible) ne peut pas être une future grille du jour : on pourrait la jouer à l'avance
      else if (g.jour >= iso(aujourdhui))
        err(ou, `grille « toujours_visible » planifiée aujourd'hui ou plus tard (${g.jour}) : retire « jour » ou « toujours_visible »`);
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

// Calendrier : jours sans grille inédite planifiée dans les 30 prochains jours
const trous = [];
for (let k = 0; k < 30; k++) {
  const d = new Date(aujourdhui); d.setDate(d.getDate() + k);
  if (!inedites.has(iso(d))) trous.push(iso(d));
}

const quotidien = data.grilles.filter(g => g && (g.theme === undefined || g.theme === "quotidien"));
const parDiff = DIFFICULTES.map(d => `${d} ${quotidien.filter(g => diffDe(g.difficulte) === d).length}`).join(", ");
console.log(`Fichier : ${path.relative(process.cwd(), fichier) || fichier}`);
console.log(`${quotidien.length} grilles du jeu quotidien (${parDiff}), ${jours.size} planifiées, dont ${secretes} secrète(s) jusqu'à leur jour.`);
if (themes.size) {
  console.log(`\n🗂  ${themes.size} thème(s) :`);
  [...themes.values()].sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99)).forEach(t => {
    const n = t.grilles.length, det = DIFFICULTES.map(d => t.grilles.filter(x => x === d).length).map((c, k) => c ? `${c} ${DIFFICULTES[k]}` : "").filter(Boolean).join(", ");
    console.log(`  ${t.icone} ${t.nom.padEnd(12)} ${t.publie ? "✅ publié     " : "⏸  non publié "} ${n} grille${n > 1 ? "s" : ""}${det ? ` (${det})` : ""}`);
    if (t.publie && !n) avertissements.push(`thème ${t.id} : publié mais sans aucune grille`);
  });
}
if (avertissements.length) { console.log(`\n⚠ ${avertissements.length} avertissement(s) :`); avertissements.forEach(a => console.log("  - " + a)); }
console.log(trous.length
  ? `\n📅 ${trous.length} jour(s) sans grille inédite planifiée dans les 30 prochains jours (une « Grille bonus » sera proposée) :\n  ${trous.join(", ")}`
  : "\n📅 Les 30 prochains jours ont tous une grille inédite planifiée.");
if (erreurs.length) {
  console.log(`\n✗ ${erreurs.length} erreur(s) :`);
  erreurs.forEach(e => console.log("  - " + e));
  process.exit(1);
}
console.log("\n✓ grilles.json est valide.");
