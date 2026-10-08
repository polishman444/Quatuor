// Maintenance : versions qui concordent, fichiers du jeu mis en cache hors ligne et copiés dans l'appli
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const version = require("../outils/version.js");

const racine = path.join(__dirname, "..");
const lire = f => fs.readFileSync(path.join(racine, f), "utf8");

test("numéros de version : package.json, site, appli iOS concordent", () => {
  assert.deepEqual(version.verifier(), []);
  assert.equal(version.versPaquet("1.3"), "1.3.0");
  assert.equal(version.versAffichee("1.3.0"), "1.3");
  assert.equal(version.versAffichee("2.0.0"), "2");
});

test("chaque fichier chargé par index.html est mis en cache hors ligne (sw.js) et existe", () => {
  const html = lire("index.html"), sw = lire("sw.js");
  const fichiers = [...html.matchAll(/<(?:script src|link rel="stylesheet" href)="([^"]+)"/g)].map(m => m[1]);
  assert.ok(fichiers.includes("css/quatuor.css") && fichiers.includes("js/jeu.js") && fichiers.includes("js/grilles.js"));
  for (const f of fichiers) {
    assert.ok(fs.existsSync(path.join(racine, f)), `${f} introuvable`);
    assert.ok(sw.includes(`"./${f}"`), `${f} absent de la liste ASSETS de sw.js`);
  }
});

test("l'appli iOS embarque les dossiers du jeu (outils/copier-web.js)", () => {
  const src = lire("outils/copier-web.js");
  for (const d of ["css", "js", "fonts", "index.html", "grilles.json"]) assert.ok(src.includes(`"${d}"`), `${d} non copié dans www/`);
});
