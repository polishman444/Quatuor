#!/usr/bin/env node
// Décline assets/icon-only.png (1024×1024, sans transparence) en toutes les tailles d'icône iOS
// (iPhone, iPad, App Store) et écrit le Contents.json de AppIcon.appiconset.
// Utilisation : npm run assets (après capacitor-assets, qui ne produit que la version 1024)
"use strict";
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const src = path.join(__dirname, "..", "assets", "icon-only.png");
const dest = path.join(__dirname, "..", "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset");
// [idiom, taille en points, échelles]
const TAILLES = [
  ["iphone", 20, [2, 3]], ["iphone", 29, [2, 3]], ["iphone", 40, [2, 3]], ["iphone", 60, [2, 3]],
  ["ipad", 20, [1, 2]], ["ipad", 29, [1, 2]], ["ipad", 40, [1, 2]], ["ipad", 76, [1, 2]], ["ipad", 83.5, [2]],
  ["ios-marketing", 1024, [1]]
];
(async () => {
  for (const f of fs.readdirSync(dest)) if (f.endsWith(".png")) fs.rmSync(path.join(dest, f));
  const images = [];
  for (const [idiom, pt, echelles] of TAILLES) for (const e of echelles) {
    const px = Math.round(pt * e), nom = `AppIcon-${px}.png`;
    if (!fs.existsSync(path.join(dest, nom)))
      await sharp(src).resize(px, px).flatten({ background: "#1B2040" }).removeAlpha().png().toFile(path.join(dest, nom));
    images.push({ idiom, size: `${pt}x${pt}`, scale: `${e}x`, filename: nom });
  }
  fs.writeFileSync(path.join(dest, "Contents.json"), JSON.stringify({ images, info: { author: "xcode", version: 1 } }, null, 2) + "\n");
  console.log(`✓ ${images.length} icônes iOS générées`);
})().catch(e => { console.error(e); process.exit(1); });
