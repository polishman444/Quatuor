// Pubs récompensées (js/pubs.js, appli iOS) : consentement, pub vue / fermée / indisponible ; dans le jeu : indices et solution
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const QuatuorPubs = require("../js/pubs.js");
const { pw, serveur, ouvrir } = require("./aide-navigateur.js");

const CONFIG = { recompense: "ca-app-pub-3940256099942544/1712485313", test: true };

// Faux plugin AdMob : mode "vue" (récompense puis fermeture), "fermee" (fermée avant la fin), "indispo" (aucune pub)
function fauxAdmob(o = {}) {
  const ecoutes = {}, appels = [];
  const emettre = (n, d) => (ecoutes[n] || []).slice().forEach(f => f(d));
  const a = {
    mode: "vue", appels,
    initialize: async opts => { appels.push(["initialize", opts]); },
    requestConsentInfo: async () => { appels.push(["requestConsentInfo"]); return o.consentement || { status: "OBTAINED", canRequestAds: true, privacyOptionsRequirementStatus: "REQUIRED" }; },
    showConsentForm: async () => { appels.push(["showConsentForm"]); return { status: "OBTAINED", canRequestAds: true }; },
    trackingAuthorizationStatus: async () => ({ status: o.suivi || "notDetermined" }),
    requestTrackingAuthorization: async () => { appels.push(["requestTrackingAuthorization"]); },
    prepareRewardVideoAd: async opts => { appels.push(["prepare", opts]); if (a.mode === "indispo") throw new Error("No fill"); return { adUnitId: opts.adId }; },
    showRewardVideoAd: () => new Promise((ok, ko) => {
      appels.push(["show"]);
      if (a.mode === "echec") { setTimeout(() => emettre("onRewardedVideoAdFailedToShow", { code: 0 }), 10); return; }
      setTimeout(() => {
        if (a.mode === "vue") { emettre("onRewardedVideoAdReward", { type: "indice", amount: 1 }); ok({ type: "indice", amount: 1 }); }
        emettre("onRewardedVideoAdDismissed");
      }, 10);
    }),
    addListener: async (n, f) => { (ecoutes[n] = ecoutes[n] || []).push(f); return { remove: () => { ecoutes[n] = ecoutes[n].filter(x => x !== f); } }; },
    showPrivacyOptionsForm: async () => { appels.push(["showPrivacyOptionsForm"]); },
    ecoutes
  };
  return a;
}
const nb = (a, nom) => a.appels.filter(x => x[0] === nom).length;

test("site (pas de plugin) ou pas de bloc d'annonces : inactif, jamais de pub", async () => {
  assert.equal(QuatuorPubs.creer({ admob: null, config: CONFIG }).actif, false);
  assert.equal(QuatuorPubs.creer({ admob: fauxAdmob(), config: {} }).actif, false);
  assert.equal(await QuatuorPubs.creer({ admob: null, config: CONFIG }).regarder(), "indispo");
});

test("démarrage : formulaire de consentement s'il est requis, puis demande de suivi d'Apple, puis une pub chargée à l'avance", async () => {
  const a = fauxAdmob({ consentement: { status: "REQUIRED", isConsentFormAvailable: true, canRequestAds: false } });
  const p = QuatuorPubs.creer({ admob: a, config: CONFIG });
  assert.equal(await p.demarrer(), true);
  assert.deepEqual(a.appels.map(x => x[0]), ["initialize", "requestConsentInfo", "showConsentForm", "requestTrackingAuthorization", "prepare"]);
  assert.deepEqual(a.appels[0][1], { initializeForTesting: true });
  assert.deepEqual(a.appels[4][1], { adId: CONFIG.recompense, isTesting: true });
  await p.demarrer();
  assert.equal(nb(a, "initialize"), 1, "une seule fois");
});

test("consentement déjà donné, suivi déjà choisi : rien n'est redemandé", async () => {
  const a = fauxAdmob({ suivi: "denied" });
  await QuatuorPubs.creer({ admob: a, config: CONFIG }).demarrer();
  assert.equal(nb(a, "showConsentForm"), 0);
  assert.equal(nb(a, "requestTrackingAuthorization"), 0);
});

test("pub regardée jusqu'au bout : « ok », et la suivante est chargée à l'avance", async () => {
  const a = fauxAdmob(), p = QuatuorPubs.creer({ admob: a, config: CONFIG });
  assert.equal(await p.regarder(), "ok");
  assert.equal(nb(a, "show"), 1);
  assert.equal(nb(a, "prepare"), 2);
  assert.equal(await p.regarder(), "ok");
  assert.equal(Object.values(a.ecoutes).flat().length, 0, "écouteurs retirés");
});

test("pub fermée avant la fin : « annule » ; aucune pub ou échec d'affichage : « indispo »", async () => {
  const a = fauxAdmob(), p = QuatuorPubs.creer({ admob: a, config: CONFIG, attenteChargement: 200 });
  a.mode = "fermee"; assert.equal(await p.regarder(), "annule");
  a.mode = "echec"; assert.equal(await p.regarder(), "indispo");
  a.mode = "vue"; assert.equal(await p.regarder(), "ok");
  // aucune pub à charger (réseau, stock vide) : « indispo », puis ça repart dès qu'une pub est disponible
  const a2 = fauxAdmob(), p2 = QuatuorPubs.creer({ admob: a2, config: CONFIG, attenteChargement: 200 });
  a2.mode = "indispo"; assert.equal(await p2.regarder(), "indispo");
  a2.mode = "vue"; assert.equal(await p2.regarder(), "ok");
});

test("choix publicitaires : bouton des Paramètres seulement si Google le demande", async () => {
  const a = fauxAdmob(), p = QuatuorPubs.creer({ admob: a, config: CONFIG });
  assert.equal(p.choixRequis(), false);
  await p.demarrer();
  assert.equal(p.choixRequis(), true);
  await p.optionsConfidentialite();
  assert.equal(nb(a, "showPrivacyOptionsForm"), 1);
});

// ---- Dans le jeu (Chromium, appli iOS simulée) ----
const navOk = pw ? undefined : "Playwright indisponible";
async function jeuNatif(t, mode = "vue") {
  const srv = await serveur(), nav = await pw.chromium.launch();
  t.after(async () => { await nav.close(); srv.close(); });
  const ctx = await nav.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript(mode => {
    const ecoutes = {}, emettre = (n, d) => (ecoutes[n] || []).slice().forEach(f => f(d));
    window.__pub = { mode, vues: 0 };
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: { AdMob: {
      initialize: async () => {}, requestConsentInfo: async () => ({ status: "OBTAINED", canRequestAds: true, privacyOptionsRequirementStatus: "REQUIRED" }),
      showConsentForm: async () => ({}), trackingAuthorizationStatus: async () => ({ status: "authorized" }), requestTrackingAuthorization: async () => {},
      prepareRewardVideoAd: async () => ({}), showPrivacyOptionsForm: async () => {},
      showRewardVideoAd: () => new Promise(ok => { window.__pub.vues++; setTimeout(() => {
        if (window.__pub.mode === "vue") { emettre("onRewardedVideoAdReward", {}); ok({}); }
        emettre("onRewardedVideoAdDismissed"); }, 30); }),
      addListener: async (n, f) => { (ecoutes[n] = ecoutes[n] || []).push(f); return { remove: () => { ecoutes[n] = ecoutes[n].filter(x => x !== f); } }; }
    } } };
  }, mode);
  const { page, erreurs } = await ouvrir(nav, `http://127.0.0.1:${srv.address().port}/index.html`, { "quatuor-tuto-done": "1", "quatuor-reglages": { sons: false } }, { ctx });
  await page.waitForFunction(() => view === "jeu" && !busy && gridIdx === dailyIdx);
  return { page, erreurs };
}

test("appli : chaque indice demande une pub (explication la 1re fois) ; le nom du groupe, puis ses mots un par un", { skip: navOk }, async t => {
  const { page, erreurs } = await jeuNatif(t);
  assert.equal(await page.locator("#hintBtn.pub").count(), 1, "repère ▶ sur le bouton");
  await page.locator("#hintBtn").click();
  await page.waitForSelector("#pubOui");
  await page.locator("#pubOui").click();
  await page.waitForFunction(() => hints === 1 && !$("hintBar").hidden);
  assert.equal(await page.evaluate(() => window.__pub.vues), 1);
  assert.match(await page.locator("#hintBar").innerText(), new RegExp(await page.evaluate(() => grid[hintCat].name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  for (let k = 2; k <= 4; k++) {
    await page.waitForFunction(() => !indiceEnCours && !$("hintBtn").disabled);
    await page.locator("#hintBtn").click();   // plus d'explication : la pub directement
    await page.waitForFunction(k => hints === k, k);
  }
  const etat = await page.evaluate(() => ({ vues: window.__pub.vues, mots: hintWords.length, memeGroupe: hintWords.every(w => grid[hintCat].words.includes(w)), surligne: document.querySelectorAll("#grid .tile.hintw").length }));
  assert.deepEqual(etat, { vues: 4, mots: 3, memeGroupe: true, surligne: 3 });
  await page.locator("#hintBtn").click();   // 5e indice : 3 mots au plus, on passe au groupe suivant
  await page.waitForFunction(() => hints === 5);
  assert.deepEqual(await page.evaluate(() => ({ cat: hintCat, mots: hintWords.length })), { cat: 1, mots: 0 });
  assert.deepEqual(erreurs, []);
});

test("appli : pub fermée avant la fin → pas d'indice", { skip: navOk }, async t => {
  const { page, erreurs } = await jeuNatif(t, "fermee");
  await page.evaluate(() => localStorage.setItem("quatuor-pub-explique", "1"));
  await page.locator("#hintBtn").click();
  await page.waitForFunction(() => document.querySelector("#toast").textContent.startsWith("Pub interrompue"));
  assert.equal(await page.evaluate(() => hints), 0);
  assert.deepEqual(erreurs, []);
});

test("appli : grille perdue, « Voir la solution » demande une pub", { skip: navOk }, async t => {
  const { page, erreurs } = await jeuNatif(t);
  await page.evaluate(() => localStorage.setItem("quatuor-pub-explique", "1"));
  for (let k = 0; !(await page.evaluate(() => done)); k++) {
    await page.waitForFunction(() => !busy || done);
    if (await page.evaluate(() => done)) break;
    await page.evaluate(() => { if (selected.size) $("clear").click(); });
    const mots = await page.evaluate(k => [0, 1, 2, 3].map(g => grid[g].words[(g + k) % 4]), k);
    for (const m of mots) await page.locator(`#grid .tile[data-w="${m}"]`).click();
    await page.locator("#submit").click();
  }
  await page.waitForSelector("#pReveal");
  assert.equal(await page.locator("#pReveal").innerText(), "Voir la solution 📺");
  await page.evaluate(() => revealSolution());   // sans autorisation : rien
  assert.equal(await page.evaluate(() => document.querySelector(".dock").classList.contains("pending")), true);
  await page.locator("#pReveal").click();
  await page.waitForFunction(() => document.querySelector(".dock").classList.contains("lost"));
  assert.equal(await page.evaluate(() => window.__pub.vues), 1);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("quatuor-res"))[grid.id].vu), true);
  assert.deepEqual(erreurs, []);
});

test("site : indices sans pub", { skip: navOk }, async t => {
  const srv = await serveur(), nav = await pw.chromium.launch();
  t.after(async () => { await nav.close(); srv.close(); });
  const { page, erreurs } = await ouvrir(nav, `http://127.0.0.1:${srv.address().port}/index.html`, { "quatuor-tuto-done": "1", "quatuor-reglages": { sons: false } });
  await page.waitForFunction(() => view === "jeu" && !busy);
  assert.equal(await page.locator("#hintBtn.pub").count(), 0);
  await page.locator("#hintBtn").click();
  await page.waitForFunction(() => hints === 1);
  assert.equal(await page.locator("#pubOui").count(), 0);
  assert.equal(await page.evaluate(() => PUBS), null);
  assert.deepEqual(erreurs, []);
});
