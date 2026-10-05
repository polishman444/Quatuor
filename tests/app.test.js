// Test de fumée du jeu dans Chromium (Playwright), réseau extérieur coupé :
// un joueur existant met à jour l'appli → rien n'est perdu, le jeu se joue normalement.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
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
async function ouvrir(nav, url, donnees, { route, config } = {}) {
  const ctx = await nav.newContext({ serviceWorkers: "block" });
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
  await page.addInitScript(d => { if (!sessionStorage.getItem("init")) { sessionStorage.setItem("init", "1");
    for (const [k, v] of Object.entries(d)) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } }, donnees);
  await page.goto(url);
  await page.waitForFunction(() => typeof GRIDS !== "undefined" && GRIDS.length > 0 && document.querySelectorAll("#grid .tile:not(.sk)").length + document.querySelectorAll("#solved .solved").length > 0);
  return { ctx, page, erreurs };
}
// Joue la grille affichée sans faute
async function jouerGrille(page) {
  const groupes = await page.evaluate(() => grid.map(g => g.words));
  for (const mots of groupes) {
    for (const m of mots) await page.locator(`#grid .tile[data-w="${m.replace(/"/g, '\\"')}"]`).click();
    await page.locator("#submit").click();
    await page.waitForFunction(n => document.querySelectorAll("#solved .solved").length >= n, groupes.indexOf(mots) + 1);
    await page.waitForFunction(() => !busy);
  }
  await page.waitForSelector("#sheet.open");
}

const jourN = () => { const s = new Date(2026, 9, 1), t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((t - s) / 864e5) + 1; };

test("joueur existant hors ligne : progression intacte, la grille du jour se joue, série prolongée", { skip: !pw && "Playwright indisponible" }, async () => {
  const srv = await serveur(), url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const nav = await pw.chromium.launch();
  try {
    const n = jourN();
    const stats = { played: 9, wins: 8, streak: 4, best: 6, lastPlayed: n - 1, lastWin: n - 1 };
    const favs = [{ id: "g001:Test", grid: "g001", num: 1, name: "Test", words: ["A", "B", "C", "D"], fact: "Anecdote", lvl: 0, at: 1 }];
    const { ctx, page, erreurs } = await ouvrir(nav, url, { quatuor: stats, "quatuor-res": { g001: { win: true, mistakes: 1, tries: 1 } },
      "quatuor-favs": favs, "quatuor-tuto-done": "1", "quatuor-migr": "1", "quatuor-reglages": { sons: false } });
    // rien de perdu au lancement
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("quatuor"))), stats);
    assert.ok(await page.evaluate(() => localStorage.getItem("quatuor-base")));
    await page.locator('.tabs [data-tab="progres"]').click();
    await page.waitForSelector(".pserie");
    assert.match(await page.locator(".pserie").innerText(), /4 jours de série[\s\S]*Record : 6 jours/);
    assert.match(await page.locator("#favSec").innerText(), /1/);
    // grille du jour
    await page.locator('.tabs [data-tab="jouer"]').click();
    await page.waitForFunction(() => view === "jeu" && gridIdx === dailyIdx);
    await jouerGrille(page);
    const apres = await page.evaluate(() => ({ s: JSON.parse(localStorage.getItem("quatuor")), r: JSON.parse(localStorage.getItem("quatuor-res"))[GRIDS[dailyIdx].id], today: todayStr }));
    assert.deepEqual([apres.s.played, apres.s.wins, apres.s.streak, apres.s.best, apres.s.lastWin], [10, 9, 5, 6, n]);
    assert.equal(apres.r.d, apres.today); assert.equal(apres.r.jdj, true); assert.ok(Number.isInteger(apres.r.s));
    assert.deepEqual(erreurs, []);
    await ctx.close();
  } finally { await nav.close(); srv.close(); }
});

test("mode en ligne configuré mais serveur injoignable : aucune erreur, le jeu marche", { skip: !pw && "Playwright indisponible" }, async () => {
  const srv = await serveur(), url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const nav = await pw.chromium.launch();
  try {
    const { ctx, page, erreurs } = await ouvrir(nav, url, { "quatuor-tuto-done": "1", "quatuor-reglages": { sons: false } },
      { config: { supabaseUrl: "https://exemple.supabase.co", supabaseCle: "cle-publique", telemetryDeckAppId: "" } });
    await page.waitForFunction(() => view === "jeu" && gridIdx === dailyIdx);
    await jouerGrille(page);
    await page.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });   // supabase-js chargé à la demande
    await page.waitForTimeout(2500);   // la synchro (signaler) a eu le temps d'échouer
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("quatuor")).streak), 1);
    assert.deepEqual(erreurs, []);
    await ctx.close();
  } finally { await nav.close(); srv.close(); }
});

module.exports = { pw, serveur, ouvrir, jouerGrille, jourN };
