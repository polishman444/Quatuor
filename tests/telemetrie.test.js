// Partie 7 · statistiques anonymes (TelemetryDeck)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../js/telemetrie.js");
const { stockage } = require("./aide-synchro.js");
const { pw, serveur, ouvrir, jouerGrille } = require("./aide-navigateur.js");

function client(o = {}) {
  const envois = [];
  const c = T.creer({ appId: "APP-ID", ls: stockage(), autorise: () => true, local: false, envoyer: async (u, x) => envois.push({ u, corps: JSON.parse(x.body) }), ...o });
  return { c, envois };
}

test("signaux : format TelemetryDeck, identifiant d'appareil haché, valeurs en texte", async () => {
  const { c, envois } = client({ commun: { plateforme: "web" } });
  c.signal("Grille.reussie", { grille: "g001", erreurs: 1, indices: 0, rien: null });
  await c.vider();
  assert.equal(envois[0].u, "https://nom.telemetrydeck.com/v2/");
  const [s] = envois[0].corps;
  assert.equal(s.appID, "APP-ID"); assert.equal(s.type, "Grille.reussie"); assert.equal(s.isTestMode, "false");
  assert.deepEqual(s.payload, { plateforme: "web", grille: "g001", erreurs: "1", indices: "0" });
  assert.match(s.clientUser, /^[0-9a-f]{64}$/, "SHA-256");
});

test("rien n'est envoyé : désactivé par le joueur, en développement local, ou sans identifiant d'appli", async () => {
  for (const o of [{ autorise: () => false }, { local: true }, { appId: "" }]) {
    const { c, envois } = client(o);
    c.signal("App.ouverture"); await c.vider();
    assert.equal(envois.length, 0, JSON.stringify(Object.keys(o)));
  }
});

test("hors ligne : aucune erreur", async () => {
  const { c } = client({ envoyer: async () => { throw new Error("Failed to fetch"); } });
  c.signal("App.ouverture");
  await c.vider();
});

const CONFIG = { supabaseUrl: "", supabaseCle: "", telemetryDeckAppId: "APP-TEST", telemetrieDev: true };
test("dans le jeu : ouverture, tuto, grille commencée/réussie, partage ; puis plus rien une fois désactivé", { skip: !pw && "Playwright indisponible" }, async t => {
  const srv = await serveur(), nav = await pw.chromium.launch();
  t.after(async () => { await nav.close(); srv.close(); });
  const signaux = [];
  const { page, erreurs } = await ouvrir(nav, `http://127.0.0.1:${srv.address().port}/index.html`, { "quatuor-reglages": { sons: false } }, { config: CONFIG,
    route: r => { const u = new URL(r.request().url()); if (u.hostname === "nom.telemetrydeck.com") { signaux.push(...JSON.parse(r.request().postData())); return r.fulfill({ status: 200, body: "{}" }); } return r.abort(); } });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  // tutoriel du premier lancement : passé à l'étape 1
  await page.waitForSelector(".bulle .skipb");
  await page.locator(".bulle .skipb").click();
  await page.waitForFunction(() => !tuto && view === "jeu" && gridIdx === dailyIdx && !busy);
  await jouerGrille(page);
  await page.evaluate(() => { navigator.share = undefined; });
  await page.locator("#share").click();
  await page.waitForFunction(() => document.querySelector("#toast").textContent === "Copié !");
  await page.evaluate(() => STATS.vider());
  const types = signaux.map(s => s.type);
  for (const ty of ["App.ouverture", "Tuto.vu", "Tuto.etape", "Tuto.passe", "Grille.commencee", "Grille.reussie", "Partage"]) assert.ok(types.includes(ty), ty);
  const fin = signaux.find(s => s.type === "Grille.reussie").payload;
  assert.deepEqual(Object.keys(fin).sort(), ["duree", "erreurs", "essai", "grille", "indices", "plateforme", "typeGrille", "version"]);
  assert.equal(fin.typeGrille, "jour"); assert.equal(signaux[0].isTestMode, "true");
  // aucune donnée de contenu ni personnelle
  const mots = await page.evaluate(() => grid.flatMap(g => [g.name, ...g.words]));
  const valeurs = signaux.flatMap(s => Object.values(s.payload));
  mots.forEach(m => assert.equal(valeurs.some(v => v.toLowerCase().includes(m.toLowerCase())), false, m));
  // Paramètres › Données : désactiver
  await page.evaluate(() => closeSheet());
  await page.locator("#setBtn").click();
  const interrupteur = page.locator('.tgl[data-r="stats"]');
  assert.equal(await interrupteur.isChecked(), true, "activé par défaut");
  await interrupteur.click();
  const n = signaux.length;
  await page.evaluate(() => { stat("Partage", {}); return STATS.vider(); });
  assert.equal(signaux.length, n);
  assert.deepEqual(erreurs, []);
});

test("développement local (localhost, sans réglage spécial) : rien n'est envoyé", { skip: !pw && "Playwright indisponible" }, async t => {
  const srv = await serveur(), nav = await pw.chromium.launch();
  t.after(async () => { await nav.close(); srv.close(); });
  let n = 0;
  const { page } = await ouvrir(nav, `http://127.0.0.1:${srv.address().port}/index.html`, { "quatuor-tuto-done": "1" }, { config: { ...CONFIG, telemetrieDev: false },
    route: r => { if (new URL(r.request().url()).hostname === "nom.telemetrydeck.com") n++; return r.abort(); } });
  await page.evaluate(() => { stat("App.ouverture"); return STATS && STATS.vider(); });
  assert.equal(n, 0);
});
