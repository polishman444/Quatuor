// Outils des tests dans le navigateur (Chromium via Playwright) : serveur local du jeu, ouverture avec données, partie
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

let pw = null;
for (const m of ["playwright", "/opt/node-tools/node_modules/playwright"]) { try { pw = require(m); break; } catch (e) {} }
const RACINE = path.join(__dirname, "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };

function serveur() {
  const s = http.createServer((req, res) => {
    const p = path.join(RACINE, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html"));
    if (!p.startsWith(RACINE) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" }); fs.createReadStream(p).pipe(res);
  });
  return new Promise(ok => s.listen(0, "127.0.0.1", () => ok(s)));
}

// Ouvre le jeu avec des données locales déjà présentes ; options : config (mode en ligne), route (interception réseau)
async function ouvrir(nav, url, donnees, { route, config, ctx } = {}) {
  ctx = ctx || await nav.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const erreurs = []; page.on("pageerror", e => erreurs.push(e.message));
  await page.route("**/*", r => {
    const u = new URL(r.request().url());
    if (u.hostname === "127.0.0.1") {
      if (config && u.pathname.endsWith("/config-en-ligne.js")) return r.fulfill({ contentType: "text/javascript", body: `window.QUATUOR_CONFIG=${JSON.stringify(config)};` });
      return r.continue();
    }
    if (route) return route(r);
    return r.abort("internetdisconnected");
  });
  // Bulles d'aide contextuelles déjà vues (sinon elles peuvent recouvrir un bouton pendant le test)
  donnees = { ...Object.fromEntries(["bonus", "indice", "themes", "serie", "moi"].map(b => ["quatuor-bulle-" + b, "1"])), ...donnees };
  await page.addInitScript(d => { let deja = true; try { deja = !!sessionStorage.getItem("init"); } catch (e) {} if (!deja) { sessionStorage.setItem("init", "1");
    for (const [k, v] of Object.entries(d)) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } }, donnees);
  await page.goto(url);
  await page.waitForFunction(() => typeof GRIDS !== "undefined" && GRIDS.length > 0 && document.querySelectorAll("#grid .tile:not(.sk)").length + document.querySelectorAll("#solved .solved").length > 0);
  return { ctx, page, erreurs };
}
// Joue la grille affichée sans faute
async function jouerGrille(page) {
  const groupes = await page.evaluate(() => grid.map(g => g.words));
  for (const mots of groupes) {
    await page.waitForFunction(() => !busy && !done && document.querySelectorAll("#grid .tile").length > 0 && !document.getAnimations().some(a => a.playState === "running" && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest(".area")));
    for (const m of mots) await page.locator(`#grid .tile[data-w="${m.replace(/"/g, '\\"')}"]`).click();
    await page.locator("#submit").click();
    await page.waitForFunction(n => document.querySelectorAll("#solved .solved").length >= n, groupes.indexOf(mots) + 1);
    await page.waitForFunction(() => !busy);
  }
  await page.waitForSelector("#sheet.open");
}

const jourN = () => { const s = new Date(2026, 9, 1), t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((t - s) / 864e5) + 1; };

module.exports = { pw, serveur, ouvrir, jouerGrille, jourN };
