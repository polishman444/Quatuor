#!/usr/bin/env node
// Copie les fichiers du jeu (racine du dépôt = seule source de vérité) dans www/,
// le dossier web embarqué dans l'appli iOS par Capacitor.
// Utilisation : npm run build (lancé automatiquement par npm run sync et par Codemagic)
"use strict";
const fs = require("fs");
const path = require("path");

const racine = path.join(__dirname, "..");
const www = path.join(racine, "www");
// Fichiers et dossiers du jeu (tout le reste : outils, ios, docs… n'a rien à faire dans l'appli)
const FICHIERS = ["index.html", "grilles.json", "manifest.webmanifest", "sw.js",
  "mentions-legales.html", "confidentialite.html", "cgu.html",
  "config-en-ligne.js", "css", "js", "vendor",
  "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "fonts"];

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });
for (const f of FICHIERS) {
  const src = path.join(racine, f);
  if (!fs.existsSync(src)) { console.error(`✗ Fichier introuvable : ${f}`); process.exit(1); }
  fs.cpSync(src, path.join(www, f), { recursive: true });
}
// La copie embarquée de grilles.json doit être valide (secours du tout premier lancement hors ligne)
try { JSON.parse(fs.readFileSync(path.join(www, "grilles.json"), "utf8")); }
catch (e) { console.error(`✗ grilles.json illisible : ${e.message}`); process.exit(1); }
console.log(`✓ ${FICHIERS.length} éléments copiés dans www/`);
