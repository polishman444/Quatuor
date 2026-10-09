#!/usr/bin/env node
// Numéro de version de Quatuor, écrit à 4 endroits qui doivent toujours concorder :
//   package.json (« 1.3.0 »), js/jeu.js (APP_VERSION, affichée sur le site), l'appli iOS (MARKETING_VERSION)
//   et le nom du cache hors ligne dans sw.js (« quatuor-vN », augmenté à chaque nouvelle version).
// Utilisation :
//   npm run nouvelle-version -- 1.3   → passe tout en version 1.3 et renouvelle le cache hors ligne
//   npm run nouvelle-version          → vérifie seulement que tout concorde
// (Le numéro de build iOS, lui, est augmenté automatiquement par Codemagic.)
"use strict";
const fs = require("fs");
const path = require("path");

const racine = path.join(__dirname, "..");
const F = {
  paquet: path.join(racine, "package.json"),
  jeu: path.join(racine, "js", "jeu.js"),
  xcode: path.join(racine, "ios", "App", "App.xcodeproj", "project.pbxproj"),
  sw: path.join(racine, "sw.js")
};
const lire = f => fs.readFileSync(f, "utf8");
const RE = {
  jeu: /const APP_VERSION="([^"]+)";/,
  xcode: /MARKETING_VERSION = ([^;]+);/g,
  sw: /const CACHE = "quatuor-v(\d+)";/
};
// « 1.3 » (affichée) ⇄ « 1.3.0 » (package.json)
const versPaquet = v => { const p = v.split("."); while (p.length < 3) p.push("0"); return p.join("."); };
const versAffichee = v => v.replace(/(\.0)+$/, "") || v;

function lireVersions() {
  const xcode = [...lire(F.xcode).matchAll(RE.xcode)].map(m => m[1].trim());
  const jeu = RE.jeu.exec(lire(F.jeu)), sw = RE.sw.exec(lire(F.sw));
  return {
    paquet: JSON.parse(lire(F.paquet)).version,
    jeu: jeu && jeu[1],
    xcode,
    cache: sw ? +sw[1] : null
  };
}
// Liste des incohérences (vide si tout concorde)
function verifier(v = lireVersions()) {
  const pb = [], ref = versAffichee(v.paquet || "");
  if (!v.jeu) pb.push("APP_VERSION introuvable dans js/jeu.js");
  else if (v.jeu !== ref) pb.push(`js/jeu.js (APP_VERSION = ${v.jeu}) ≠ package.json (${v.paquet})`);
  if (!v.xcode.length) pb.push("MARKETING_VERSION introuvable dans le projet Xcode");
  v.xcode.forEach(x => { if (versAffichee(x) !== ref) pb.push(`appli iOS (MARKETING_VERSION = ${x}) ≠ package.json (${v.paquet})`); });
  if (v.cache == null) pb.push("nom du cache introuvable dans sw.js");
  return pb;
}

function changer(nouvelle) {
  if (!/^\d+(\.\d+){0,2}$/.test(nouvelle)) { console.error(`✗ Version invalide : « ${nouvelle} » (exemple : 1.3)`); process.exit(1); }
  const aff = versAffichee(versPaquet(nouvelle));
  const paquet = JSON.parse(lire(F.paquet)); paquet.version = versPaquet(nouvelle);
  fs.writeFileSync(F.paquet, JSON.stringify(paquet, null, 2) + "\n");
  for (const f of [path.join(racine, "package-lock.json")]) {
    if (!fs.existsSync(f)) continue;
    const l = JSON.parse(lire(f)); l.version = paquet.version; if (l.packages && l.packages[""]) l.packages[""].version = paquet.version;
    fs.writeFileSync(f, JSON.stringify(l, null, 2) + "\n");
  }
  fs.writeFileSync(F.jeu, lire(F.jeu).replace(RE.jeu, `const APP_VERSION="${aff}";`));
  fs.writeFileSync(F.xcode, lire(F.xcode).replace(RE.xcode, `MARKETING_VERSION = ${aff};`));
  fs.writeFileSync(F.sw, lire(F.sw).replace(RE.sw, (_, n) => `const CACHE = "quatuor-v${+n + 1}";`));
  console.log(`✓ Version ${aff} (package.json ${paquet.version}), cache hors ligne quatuor-v${lireVersions().cache}`);
}

if (require.main === module) {
  if (process.argv[2]) changer(process.argv[2]);
  const v = lireVersions(), pb = verifier(v);
  console.log(`package.json ${v.paquet} · site ${v.jeu} · iOS ${[...new Set(v.xcode)].join(", ")} · cache quatuor-v${v.cache}`);
  if (pb.length) { pb.forEach(p => console.log("✗ " + p)); process.exit(1); }
  console.log("✓ Les numéros de version concordent.");
}

module.exports = { lireVersions, verifier, versPaquet, versAffichee };
