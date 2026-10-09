#!/usr/bin/env node
// Vérifie grilles.json avant publication.
// Utilisation : node outils/verifier-grilles.js [chemin/vers/grilles.json]
"use strict";
const fs = require("fs");
const path = require("path");
const QG = require("../js/grilles.js");   // règles partagées avec le jeu (grille du jour, grille bonus)

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

const ids = new Map(), nums = new Map(), jours = new Map();
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
  if (g.titre !== undefined && (typeof g.titre !== "string" || !g.titre.trim())) err(ou, "« titre » doit être un texte non vide");
  if (theme !== "quotidien") {
    if (g.titre === undefined) avertissements.push(`${ou} : grille de thème sans « titre » (« Grille n » sera affiché)`);
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
      if (diffDe(g.difficulte) === "facile") err(ou, "une grille facile ne peut pas être grille du jour, trop simple (retire « jour » : elle devient une grille libre)");
      if (jours.has(g.jour)) err(ou, `deux grilles le même jour (${g.jour}) : déjà ${jours.get(g.jour)}`);
      else jours.set(g.jour, g.id);
      if (g.toujours_visible !== true) secretes++;
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
    // Grille de thème : l'anecdote peut être vide ("") sur certains groupes ; jeu quotidien : une anecdote par groupe
    if (!gr || typeof gr.anecdote !== "string") err(o, "« anecdote » manquante (mettre \"\" si le groupe n'en a pas)");
    else if (!gr.anecdote.trim() && theme === "quotidien") err(o, "« anecdote » vide (obligatoire pour le jeu quotidien)");
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

// Calendrier : jours sans grille du jour planifiée dans les 30 prochains jours (même règle que le jeu : js/grilles.js)
const pourQG = data.grilles.filter(g => g && typeof g === "object").map(g => ({ id: g.id, diff: diffDe(g.difficulte), jour: g.jour || null,
  always: g.toujours_visible === true, theme: g.theme === undefined ? "quotidien" : g.theme }));
const trous = [];
for (let k = 0; k < 30; k++) {
  const d = new Date(aujourdhui); d.setDate(d.getDate() + k);
  if (QG.choisirGrilleDuJour(pourQG, iso(d)).bonus) trous.push(iso(d));
}
// Aucun jour sans grille : un trou dans les 7 prochains jours est une erreur (la « Grille bonus » n'est qu'un secours)
trous.filter(j => j < iso(new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate() + 7)))
  .forEach(j => err(`calendrier ${j}`, "aucune grille du jour planifiée (ajoute une grille moyenne ou difficile avec ce « jour »)"));

// ---- Doublons : la même catégorie ou les mêmes mots qui reviennent d'une grille à l'autre ----
const norm = t => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const doublons = [];
const nomsVus = new Map(), groupesVus = [], motsVus = new Map();
data.grilles.forEach(g => {
  if (!g || !Array.isArray(g.groupes)) return;
  g.groupes.forEach(gr => {
    if (!gr || typeof gr.nom !== "string" || !Array.isArray(gr.mots)) return;
    const n = norm(gr.nom);
    if (nomsVus.has(n) && nomsVus.get(n) !== g.id) doublons.push(`${g.id} : nom de groupe déjà utilisé dans ${nomsVus.get(n)} (« ${gr.nom} »)`);
    else nomsVus.set(n, g.id);
    const mots = new Set(gr.mots.map(norm));
    for (const v of groupesVus) {
      if (v.id === g.id) continue;
      const communs = [...mots].filter(m => v.mots.has(m)).length;
      if (communs >= 3) { doublons.push(`${g.id} : groupe presque identique à un groupe de ${v.id} (« ${gr.nom} » / « ${v.nom} », ${communs} mots en commun)`); break; }
    }
    groupesVus.push({ id: g.id, nom: gr.nom, mots });
    gr.mots.forEach(m => { const k = norm(m); if (!motsVus.has(k)) motsVus.set(k, { mot: m, ids: new Set() }); motsVus.get(k).ids.add(g.id); });
  });
});
const motsRecurrents = [...motsVus.values()].filter(x => x.ids.size >= 3).sort((a, b) => b.ids.size - a.ids.size);
motsRecurrents.forEach(x => doublons.push(`mot présent dans ${x.ids.size} grilles : « ${x.mot} » (${[...x.ids].join(", ")})`));

const quotidien = data.grilles.filter(g => g && (g.theme === undefined || g.theme === "quotidien"));
const parDiff = DIFFICULTES.map(d => `${d} ${quotidien.filter(g => diffDe(g.difficulte) === d).length}`).join(", ");
console.log(`Fichier : ${path.relative(process.cwd(), fichier) || fichier}`);
console.log(`${quotidien.length} grilles du jeu quotidien (${parDiff}), ${jours.size} planifiées, dont ${secretes} secrète(s) jusqu'à leur jour.`);
const libres = pourQG.filter(QG.estLibre);
console.log(`Grilles libres (Bonus, Hasard, grille bonus de secours) : ${DIFFICULTES.map(d => `${d} ${libres.filter(g => g.diff === d).length}`).join(", ")}.`);
if (themes.size) {
  console.log(`\n🗂  ${themes.size} thème(s) :`);
  [...themes.values()].sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99)).forEach(t => {
    const n = t.grilles.length, det = DIFFICULTES.map(d => t.grilles.filter(x => x === d).length).map((c, k) => c ? `${c} ${DIFFICULTES[k]}` : "").filter(Boolean).join(", ");
    console.log(`  ${t.icone} ${t.nom.padEnd(12)} ${t.publie ? "✅ publié     " : "⏸  non publié "} ${n} grille${n > 1 ? "s" : ""}${det ? ` (${det})` : ""}`);
    if (t.publie && !n) avertissements.push(`thème ${t.id} : publié mais sans aucune grille`);
  });
}
if (doublons.length) { console.log(`\n🔁 ${doublons.length} répétition(s) entre grilles (à éviter dans les nouvelles grilles) :`); doublons.forEach(d => console.log("  - " + d)); }
if (avertissements.length) { console.log(`\n⚠ ${avertissements.length} avertissement(s) :`); avertissements.forEach(a => console.log("  - " + a)); }
console.log(trous.length
  ? `\n📅 ${trous.length} jour(s) sans grille du jour planifiée dans les 30 prochains jours (une « Grille bonus » de secours serait proposée) :\n  ${trous.join(", ")}`
  : "\n📅 Les 30 prochains jours ont tous une grille du jour planifiée.");
if (erreurs.length) {
  console.log(`\n✗ ${erreurs.length} erreur(s) :`);
  erreurs.forEach(e => console.log("  - " + e));
  process.exit(1);
}
console.log("\n✓ grilles.json est valide.");
