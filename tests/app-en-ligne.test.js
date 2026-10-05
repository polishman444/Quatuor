// Le jeu dans Chromium, branché sur un faux Supabase (base de test PGlite) :
// interface du mode en ligne de bout en bout (compte anonyme, connexion Apple simulée, etc.)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { pw, serveur, ouvrir } = require("./aide-navigateur.js");
const { creerBase } = require("./aide-pg.js");
const { fauxSupabase } = require("./faux-supabase.js");
const { upsert } = require("./aide-synchro.js");
const QC = require("../js/calculs.js");

const CONFIG = { supabaseUrl: "https://projet.supabase.co", supabaseCle: "cle-publique", telemetryDeckAppId: "" };
// Imitation de l'appli iOS (Capacitor) : plugin natif QuatuorApple qui renvoie le jeton Apple « appleId »
const iOS = appleId => `window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>"ios",Plugins:{QuatuorApple:{connexion:async()=>({idToken:${JSON.stringify(appleId)}})}}};`;

async function contexte(t, { appleId, donnees = {} } = {}) {
  const base = await creerBase(), faux = fauxSupabase(base), srv = await serveur();
  const nav = await pw.chromium.launch();
  t.after(async () => { await nav.close(); srv.close(); });
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const ouvrirPage = async (d = donnees) => {
    const ctx = await nav.newContext({ serviceWorkers: "block" });
    if (appleId) await ctx.addInitScript(iOS(appleId));
    const o = await ouvrir(nav, url, { "quatuor-tuto-done": "1", "quatuor-reglages": { sons: false }, ...d }, { config: CONFIG,
      route: r => new URL(r.request().url()).hostname === "projet.supabase.co" ? faux.gerer(r) : r.abort("internetdisconnected"), ctx });
    return o;
  };
  return { base, faux, ouvrirPage };
}
const attendre = async (fn, ms = 15000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error("délai dépassé"); await new Promise(r => setTimeout(r, 100)); } };

test("lancement : compte anonyme créé sans rien demander, progression envoyée", { skip: !pw && "Playwright indisponible" }, async t => {
  const { base, faux, ouvrirPage } = await contexte(t, { donnees: { quatuor: { played: 3, wins: 3, streak: 3, best: 3, lastPlayed: 4, lastWin: 4 },
    "quatuor-res": { g001: { win: true, mistakes: 0, tries: 1 } }, "quatuor-migr": "1" } });
  const { page, erreurs } = await ouvrirPage();
  const uid = await attendre(() => faux.journal.find(x => x[0] === "anonyme")?.[1]);
  await attendre(async () => (await base.admin("select 1 from public.resultats where user_id = $1", [uid])).length === 1);
  const [p] = await base.admin("select base_parties, base_serie from public.profils where id = $1", [uid]);
  assert.deepEqual(p, { base_parties: 3, base_serie: 3 });
  // web : pas de bouton Apple, mais la sauvegarde automatique est indiquée
  await page.locator("#setBtn").click();
  await page.waitForSelector("#setCompte .rrow");
  assert.match(await page.locator("#setCompte").innerText(), /Sauvegarde automatique/);
  assert.equal(await page.locator(".bapple").count(), 0);
  assert.deepEqual(erreurs, []);
});

test("iOS, 1er appareil : « Se connecter avec Apple » lie le compte anonyme (même compte)", { skip: !pw && "Playwright indisponible" }, async t => {
  const { faux, ouvrirPage } = await contexte(t, { appleId: "apple-nouveau" });
  const { page, erreurs } = await ouvrirPage();
  const uid = await attendre(() => faux.journal.find(x => x[0] === "anonyme")?.[1]);
  await page.locator('.tabs [data-tab="moi"]').click();
  // 1er passage dans Moi : on garde le pseudo proposé
  await page.waitForSelector("#psChamp"); await page.locator("#psOk").click();
  await page.waitForSelector("#sheet:not(.open)");
  await page.waitForSelector("#moiCompte .bapple");
  assert.match(await page.locator("#moiCompte").innerText(), /Garde ta progression, même si tu changes de téléphone/);
  await page.locator("#moiCompte .bapple").click();
  await attendre(() => faux.comptes.get(uid).apple === "apple-nouveau");
  await page.locator("#setBtn").click();
  await page.waitForSelector("#setCompte .cok");
  assert.match(await page.locator("#setCompte").innerText(), /Connecté avec Apple/);
  assert.equal(faux.comptes.size, 1, "aucun autre compte créé");
  assert.deepEqual(erreurs, []);
});

test("iOS, 2e appareil : « Récupérer ta progression existante ? » puis progression récupérée", { skip: !pw && "Playwright indisponible" }, async t => {
  const { base, faux, ouvrirPage } = await contexte(t, { appleId: "apple-123" });
  // progression existante du compte Apple (créée sur le 1er téléphone)
  const A = await faux.compteApple("apple-123");
  await base.en(A, "select public.assurer_profil()");
  await upsert(base, A, "resultats", [{ user_id: A, ...QC.versServeur("g002", { win: true, mistakes: 1, tries: 1, d: QC.dateDuNum(3), jdj: true }) }], ["user_id", "grille_id"]);
  const { page, erreurs } = await ouvrirPage({ "quatuor-res": { g003: { win: true, mistakes: 2, tries: 1, d: QC.dateDuNum(4) } } });
  const anonyme = await attendre(() => faux.journal.find(x => x[0] === "anonyme")?.[1]);
  await page.locator("#setBtn").click();
  await page.locator("#setCompte .bapple").click();
  // la question est posée (pas de fusion silencieuse)
  await page.waitForSelector("#recOui");
  assert.match(await page.locator("#sheetBody").innerText(), /Récupérer ta progression existante/);
  assert.equal(faux.journal.some(x => x[0] === "connexion"), false);
  await page.locator("#recOui").click();
  await attendre(() => faux.journal.some(x => x[0] === "supprimer" && x[1] === anonyme));
  await page.waitForEvent("load");
  await page.waitForFunction(() => { const r = JSON.parse(localStorage.getItem("quatuor-res") || "{}"); return r.g002 && r.g003; });
  await attendre(async () => (await base.admin("select 1 from public.resultats where user_id = $1", [A])).length === 2);
  assert.equal((await base.admin("select 1 from auth.users where id = $1", [anonyme])).length, 0, "compte anonyme orphelin supprimé");
  assert.deepEqual(erreurs, []);
});

test("onglet Moi : pseudo choisi au 1er passage (filtre, unicité), avatar, code ami copié, séries", { skip: !pw && "Playwright indisponible" }, async t => {
  const { base, faux, ouvrirPage } = await contexte(t, { donnees: { quatuor: { played: 5, wins: 5, streak: 2, best: 4, lastPlayed: 4, lastWin: 4 }, "quatuor-migr": "1" } });
  // un autre joueur a déjà le pseudo « Bob »
  const autre = await faux.creerCompte(); await base.en(autre, "select public.assurer_profil()");
  await base.en(autre, "update public.profils set pseudo = 'Bob' where id = $1", [autre]);
  const { page, erreurs } = await ouvrirPage();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const uid = await attendre(() => faux.journal.find(x => x[0] === "anonyme")?.[1]);
  await attendre(async () => (await base.admin("select 1 from public.profils where id = $1", [uid])).length === 1);
  await page.locator('.tabs [data-tab="moi"]').click();
  // la fenêtre « Choisis ton pseudo » s'ouvre seule, avec une proposition valide
  await page.waitForSelector("#psChamp");
  const propose = await page.locator("#psChamp").inputValue();
  assert.equal(require("../js/pseudos.js").valider(propose).ok, true);
  // pseudo insultant : refusé côté client (bouton désactivé)
  await page.locator("#psChamp").fill("GrosCon");
  assert.match(await page.locator("#psMsg").innerText(), /pas autorisé/);
  assert.equal(await page.locator("#psOk").isDisabled(), true);
  // pseudo déjà pris (sans tenir compte des majuscules) : refusé par le serveur
  await page.locator("#psChamp").fill("BOB");
  await page.locator("#psOk").click();
  await page.waitForFunction(() => /déjà pris/.test(document.querySelector("#psMsg").textContent));
  await page.locator("#psChamp").fill("Zoé_42");
  await page.locator("#psOk").click();
  await page.waitForSelector("#moiPseudo:not(.vide)");
  assert.match(await page.locator("#moiPseudo").innerText(), /Zoé_42/);
  assert.equal((await base.admin("select pseudo from public.profils where id = $1", [uid]))[0].pseudo, "Zoé_42");
  // avatar
  await page.locator("#moiAvatar").click();
  await page.locator('[data-av="5"]').click();
  await attendre(async () => (await base.admin("select avatar from public.profils where id = $1", [uid]))[0].avatar === 5);
  // code ami : copié
  const code = (await base.admin("select code_ami from public.profils where id = $1", [uid]))[0].code_ami;
  assert.equal(await page.locator("#moiCode").innerText(), code);
  await page.locator("#codeCopie").click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), code);
  // séries
  assert.match(await page.locator(".mseries").innerText(), /2[\s\S]*Série actuelle[\s\S]*4[\s\S]*Meilleure série/);
  // Duels et Classement restent « Bientôt »
  assert.match(await page.locator(".mcards").innerText(), /Duels[\s\S]*Bientôt[\s\S]*Classement[\s\S]*Bientôt/);
  assert.deepEqual(erreurs, []);
});

test("onglet Moi hors ligne (mode en ligne configuré, jamais connecté) : message clair, pas d'erreur", { skip: !pw && "Playwright indisponible" }, async t => {
  const { ouvrirPage } = await contexte(t);
  const { page, erreurs } = await ouvrirPage();
  await page.context().setOffline(true);
  await page.locator('.tabs [data-tab="moi"]').click();
  await page.waitForSelector(".moi");
  // (la session a pu se créer avant la coupure : profil en cours de création ou message hors ligne)
  assert.match(await page.locator(".moi").innerText(), /Joueur|Choisir mon pseudo|Connecte-toi à Internet/);
  assert.deepEqual(erreurs, []);
});
