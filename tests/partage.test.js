// Partie 6 · partage du résultat : texte façon Wordle, sans aucun spoiler
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const QC = require("../js/calculs.js");
const { pw, serveur, ouvrir, jouerGrille } = require("./aide-navigateur.js");

test("texte : une ligne par essai, une couleur par groupe, indices et essai, adresse du site", () => {
  const t = QC.texteDePartage({ titre: "Quatuor #42", history: [[1, 1, 1, 1], [0, 3, 0, 0], [0, 0, 0, 0], [3, 3, 3, 3], [2, 2, 2, 2]], hints: 1 });
  assert.equal(t, "Quatuor #42 🧩\n🟧🟧🟧🟧\n🟩🟦🟩🟩\n🟩🟩🟩🟩\n🟦🟦🟦🟦\n🟥🟥🟥🟥\n💡 1 indice\nplayquatuor.fr");
  assert.equal(QC.texteDePartage({ titre: "Quatuor #3", history: [[0, 0, 0, 0]], attempt: 2, hints: 2 }), "Quatuor #3 🧩\n🟩🟩🟩🟩\n💡 2 indices · 🔄 2e essai\nplayquatuor.fr");
  assert.equal(QC.texteDePartage({ titre: "Q", history: [[0, 1, 2, 3]], daltonien: true }).split("\n")[1], "🟦🟧🟨🟪");
});

test("temps de jeu : lisible, et dans le texte de partage", () => {
  assert.equal(QC.dureeTexte(0), "0 s");
  assert.equal(QC.dureeTexte(45), "45 s");
  assert.equal(QC.dureeTexte(187), "3 min 07 s");
  assert.equal(QC.dureeTexte(3900), "1 h 05 min");
  assert.equal(QC.dureeTexte(null), "");
  assert.equal(QC.texteDePartage({ titre: "Quatuor #3", history: [[0, 0, 0, 0]], attempt: 2, hints: 1, duree: 187 }),
    "Quatuor #3 🧩\n🟩🟩🟩🟩\n⏱️ 3 min 07 s · 💡 1 indice · 🔄 2e essai\nplayquatuor.fr");
});

const navOk = pw ? undefined : "Playwright indisponible";
async function partie(t, donnees, cible) {
  const srv = await serveur(), nav = await pw.chromium.launch();
  t.after(async () => { await nav.close(); srv.close(); });
  const { page, erreurs } = await ouvrir(nav, `http://127.0.0.1:${srv.address().port}/index.html`, { "quatuor-tuto-done": "1", "quatuor-reglages": { sons: false }, ...donnees });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => { navigator.share = undefined; });   // Chromium de test : pas de feuille de partage → copie
  if (cible) await page.evaluate(cible);
  await page.waitForFunction(() => view === "jeu" && !busy);
  return { page, erreurs };
}
const motsDe = page => page.evaluate(() => grid.flatMap(g => [g.name, ...g.words]));
const sansSpoiler = (texte, mots) => mots.forEach(m => assert.equal(texte.toLowerCase().includes(m.toLowerCase()), false, `spoiler : « ${m} »`));

test("web : grille du jour réussie → « Copié ! », texte sans spoiler", { skip: navOk }, async t => {
  const { page, erreurs } = await partie(t, {});
  await jouerGrille(page);
  await page.locator("#share").click();
  await page.waitForFunction(() => document.querySelector("#toast").textContent === "Copié !");
  const texte = await page.evaluate(() => navigator.clipboard.readText()), num = await page.evaluate(() => grid.num);
  const lignes = await page.evaluate(() => history.map(r => r.map(i => ["🟩", "🟧", "🟥", "🟦"][i]).join("")));
  assert.equal(lignes.length, 4);
  const temps = await page.evaluate(() => `⏱️ ${QC.dureeTexte(duree)}`);
  assert.equal(texte, [`Quatuor #${num} 🧩`, ...lignes, temps, "playquatuor.fr"].join("\n"));
  assert.match(await page.locator("#sheetBody").innerText(), /Grille résolue en \d+ s avec 0 erreur/);
  sansSpoiler(texte, await motsDe(page));
  assert.deepEqual(erreurs, []);
});

test("grille ratée (solution pas encore vue) : bouton Partager, sans spoiler", { skip: navOk }, async t => {
  const { page, erreurs } = await partie(t, {});
  // erreurs volontaires (un mot de chaque groupe) jusqu'à la fin de la partie
  for (let k = 0; !(await page.evaluate(() => done)); k++) {
    await page.waitForFunction(() => !busy || done);
    if (await page.evaluate(() => done)) break;
    await page.evaluate(() => { if (selected.size) $("clear").click(); });   // après une erreur, la sélection reste
    const mots = await page.evaluate(k => [0, 1, 2, 3].map(g => grid[g].words[(g + k) % 4]), k);
    for (const m of mots) await page.locator(`#grid .tile[data-w="${m}"]`).click();
    await page.locator("#submit").click();
  }
  await page.waitForSelector("#pShare");
  await page.locator("#pShare").click();
  await page.waitForFunction(() => document.querySelector("#toast").textContent === "Copié !");
  const texte = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(texte.split("\n").filter(l => /^[🟩🟧🟥🟦]+$/u.test(l)).length, await page.evaluate(() => maxErr));
  sansSpoiler(texte, await motsDe(page));
  assert.deepEqual(erreurs, []);
});

test("grille de thème : son nom à la place du numéro", { skip: navOk }, async t => {
  const { page, erreurs } = await partie(t, {}, () => { const i = GRIDS.findIndex(g => g.theme !== "quotidien" && THEMES.some(x => x.id === g.theme && x.publie)); switchGame(i); });
  await page.waitForFunction(() => isTheme() && !busy);
  await jouerGrille(page);
  await page.locator("#share").click();
  await page.waitForFunction(() => document.querySelector("#toast").textContent === "Copié !");
  const texte = await page.evaluate(() => navigator.clipboard.readText()), attendu = await page.evaluate(() => `Quatuor · ${themeOf(grid.theme).icone} ${themeOf(grid.theme).nom} · ${themeLabel(gridIdx)} 🧩`);
  assert.equal(texte.split("\n")[0], attendu);
  sansSpoiler(texte.split("\n").slice(1).join("\n"), await motsDe(page));
  assert.deepEqual(erreurs, []);
});

test("appli iOS : feuille de partage native (@capacitor/share) avec le texte", { skip: navOk }, async t => {
  const srv = await serveur(), nav = await pw.chromium.launch();
  t.after(async () => { await nav.close(); srv.close(); });
  const ctx = await nav.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript(() => { window.__partages = []; window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios",
    Plugins: { Share: { share: async o => { window.__partages.push(o); return {}; } } } }; });
  const { page, erreurs } = await ouvrir(nav, `http://127.0.0.1:${srv.address().port}/index.html`, { "quatuor-tuto-done": "1", "quatuor-reglages": { sons: false } }, { ctx });
  await page.waitForFunction(() => view === "jeu" && !busy);
  await jouerGrille(page);
  await page.locator("#share").click();
  await page.waitForFunction(() => window.__partages.length === 1);
  const { text } = await page.evaluate(() => window.__partages[0]);
  assert.match(text, /^Quatuor #\d+ 🧩\n([🟩🟧🟥🟦]{4}\n){4}⏱️ \d+ s\nplayquatuor\.fr$/u);
  assert.deepEqual(erreurs, []);
});
