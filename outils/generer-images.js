#!/usr/bin/env node
// Génère les images sources de l'appli iOS dans assets/ (logo : les 4 carrés arrondis du jeu).
//   assets/icon-only.png    1024×1024, fond bleu nuit, SANS transparence (exigence d'Apple)
//   assets/splash.png       2732×2732, écran de lancement (mode clair)
//   assets/splash-dark.png  2732×2732, écran de lancement (mode sombre)
// Puis : npx capacitor-assets generate --ios (voir « npm run assets ») produit toutes les tailles dans ios/.
// Utilisation : npm run assets
"use strict";
const path = require("path");
const sharp = require("sharp");

const dossier = path.join(__dirname, "..", "assets");
// Couleurs du jeu : menthe, abricot, framboise, bleu nuit
const MENTHE = "#45D0B0", ABRICOT = "#FFA552", FRAMBOISE = "#EF5B7C";

// 4 carrés arrondis (proportions de icon-512.png : carré 131, espace 25, rayon 26 pour 512 px)
function carres(taille, x0, y0, carre, espace, rayon, couleurs) {
  return couleurs.map((c, i) => {
    const x = x0 + (i % 2) * (carre + espace), y = y0 + Math.floor(i / 2) * (carre + espace);
    return `<rect x="${x}" y="${y}" width="${carre}" height="${carre}" rx="${rayon}" fill="${c}"/>`;
  }).join("");
}
function svg(taille, fond, logo, couleurs) {
  const carre = Math.round(logo * 131 / 287), espace = logo - 2 * carre, rayon = Math.round(carre * 26 / 131);
  const x0 = Math.round((taille - logo) / 2);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}">
    <rect width="${taille}" height="${taille}" fill="${fond}"/>${carres(taille, x0, x0, carre, espace, rayon, couleurs)}</svg>`);
}
async function png(nom, buf) {
  // flatten + removeAlpha : aucune transparence
  await sharp(buf).flatten({ background: "#1B2040" }).removeAlpha().png().toFile(path.join(dossier, nom));
  console.log(`✓ assets/${nom}`);
}
(async () => {
  // Icône : identique à icon-512.png (bleu nuit clair #7888E6 pour le 4e carré, visible sur le fond)
  await png("icon-only.png", svg(1024, "#1B2040", 574, [MENTHE, ABRICOT, FRAMBOISE, "#7888E6"]));
  // Écrans de lancement aux couleurs du jeu (fond --bg, 4e carré --l3 du thème correspondant)
  await png("splash.png", svg(2732, "#EEF0F7", 420, [MENTHE, ABRICOT, FRAMBOISE, "#2E3A87"]));
  await png("splash-dark.png", svg(2732, "#12152A", 420, [MENTHE, ABRICOT, FRAMBOISE, "#4A58C2"]));
})().catch(e => { console.error(e); process.exit(1); });
