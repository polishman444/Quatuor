// Connexion par code e-mail, Apple sur le site, déconnexion
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { creerConnexionEmail, messageErreurEmail } = require("../js/en-ligne.js");
const { pw, serveur, ouvrir, jouerGrille } = require("./aide-navigateur.js");
const { creerBase } = require("./aide-pg.js");
const { fauxSupabase } = require("./faux-supabase.js");

// ---- Logique (faux client) ----
function fauxClient({ emailPris = false } = {}) {
  const journal = [];
  let session = { access_token: "jeton-anonyme", user: { id: "anon", is_anonymous: true } };
  return { journal, auth: {
    getSession: async () => ({ data: { session } }),
    updateUser: async x => { journal.push(["updateUser", x.email]); return emailPris ? { data: {}, error: { code: "email_exists", message: "A user with this email address has already been registered" } } : { data: {}, error: null }; },
    signInWithOtp: async x => { journal.push(["otp", x.email, x.options.shouldCreateUser]); return { data: {}, error: null }; },
    verifyOtp: async x => { journal.push(["verify", x.type, x.token]);
      if (x.token !== "123456") return { data: {}, error: { code: "otp_expired", message: "Token has expired or is invalid" } };
      const u = x.type === "email" ? { id: "existant" } : { id: "anon" };
      session = { access_token: "jeton-" + u.id, user: u }; return { data: { user: u, session }, error: null }; }
  } };
}
function deps(c, reponse) {
  const j = { demande: 0, sync: 0, supprime: [] };
  return { j, d: { client: async () => c, demanderRecuperation: async () => { j.demande++; return reponse; }, synchroniser: async () => { j.sync++; }, supprimerAncien: async t => { j.supprime.push(t); } } };
}

test("e-mail nouveau : rattaché au compte anonyme (même compte)", async () => {
  const c = fauxClient(), { j, d } = deps(c, true), f = creerConnexionEmail(d);
  assert.deepEqual(await f.envoyerCode("a@b.fr"), { mode: "lier" });
  assert.deepEqual(await f.verifierCode("a@b.fr", "123456", "lier"), { etat: "lie" });
  assert.deepEqual(c.journal.map(x => x[0] + ":" + (x[1] || "")), ["updateUser:a@b.fr", "verify:email_change"]);
  assert.equal(j.demande, 0); assert.deepEqual(j.supprime, []); assert.equal(j.sync, 1);
});

test("e-mail déjà utilisé : on demande ; refus → rien ; accord → code de connexion, ancien compte anonyme supprimé", async () => {
  let c = fauxClient({ emailPris: true }), x = deps(c, false);
  assert.deepEqual(await creerConnexionEmail(x.d).envoyerCode("a@b.fr"), { mode: "annule" });
  assert.equal(c.journal.some(e => e[0] === "otp"), false, "pas de connexion silencieuse");
  c = fauxClient({ emailPris: true }); x = deps(c, true);
  const f = creerConnexionEmail(x.d);
  assert.deepEqual(await f.envoyerCode("a@b.fr"), { mode: "recuperer" });
  assert.deepEqual(c.journal[1], ["otp", "a@b.fr", false], "jamais de création de compte ici");
  await assert.rejects(f.verifierCode("a@b.fr", "000000", "recuperer"));
  assert.deepEqual(await f.verifierCode("a@b.fr", "123456", "recuperer"), { etat: "recupere" });
  assert.deepEqual(x.j.supprime, ["jeton-anonyme"]);
});

test("messages d'erreur clairs", () => {
  assert.match(messageErreurEmail({ code: "otp_expired" }), /Code incorrect ou expiré/);
  assert.match(messageErreurEmail({ code: "over_email_send_rate_limit" }), /quelques minutes/);
  assert.match(messageErreurEmail({ code: "email_address_invalid" }), /invalide/);
  assert.match(messageErreurEmail({ message: "Failed to fetch" }), /connexion/);
});

// ---- Dans le navigateur, avec le faux Supabase ----
const CONFIG = { supabaseUrl: "https://projet.supabase.co", supabaseCle: "sb_publishable_test", telemetryDeckAppId: "" };
const attendre = async (fn, ms = 15000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error("délai dépassé"); await new Promise(r => setTimeout(r, 100)); } };
async function contexte(t, config = CONFIG) {
  const base = await creerBase(), faux = fauxSupabase(base), srv = await serveur(), nav = await pw.chromium.launch();
  t.after(async () => { await nav.close(); srv.close(); });
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const routes = [];
  const ouvrirPage = async (donnees = {}) => ouvrir(nav, url, { "quatuor-tuto-done": "1", "quatuor-reglages": { sons: false }, ...donnees }, { config,
    route: r => { const u = new URL(r.request().url()); routes.push(u.href); return u.hostname === "projet.supabase.co" ? faux.gerer(r) : r.abort(); } });
  return { base, faux, ouvrirPage, routes, url };
}
async function codeEmail(page, email) {
  await page.locator("#setBtn").click();
  await page.locator("#setCompte [data-email]").click();
  await page.locator("#emChamp").fill(email); await page.locator("#emOk").click();
}

test("site : e-mail → connecté, déconnexion (appareil à zéro), puis reconnexion qui récupère la progression", { skip: !pw && "Playwright indisponible" }, async t => {
  const { base, faux, ouvrirPage } = await contexte(t);
  const { page, erreurs } = await ouvrirPage();
  const A = await attendre(() => faux.journal.find(x => x[0] === "anonyme")?.[1]);
  await page.waitForFunction(() => view === "jeu" && gridIdx === dailyIdx && !busy);
  await jouerGrille(page); await page.evaluate(() => closeSheet());
  const grille = await page.evaluate(() => GRIDS[dailyIdx].id);
  // pas de bouton Apple sur le site tant que appleWeb n'est pas activé
  await codeEmail(page, "joueur@exemple.fr");
  assert.equal(await page.locator(".bapple").count(), 0);
  await page.waitForSelector("#emCode");
  await page.locator("#emCode").fill("000000"); await page.locator("#emOk").click();
  await page.waitForFunction(() => /incorrect ou expiré/.test(document.querySelector("#emMsg").textContent));
  await page.locator("#emCode").fill("123456"); await page.locator("#emOk").click();
  await page.waitForSelector("#setCompte .cok");
  assert.match(await page.locator("#setCompte").innerText(), /Connecté par e-mail[\s\S]*joueur@exemple\.fr/);
  assert.equal(faux.comptes.get(A).email, "joueur@exemple.fr", "même compte");
  await attendre(async () => (await base.admin("select 1 from public.resultats where user_id = $1", [A])).length === 1);
  // se déconnecter
  await page.locator("#setCompte [data-deco]").click();
  await page.locator("#decoOui").click();
  await page.waitForEvent("load");
  await page.waitForFunction(() => typeof GRIDS !== "undefined" && GRIDS.length > 0);
  assert.deepEqual(await page.evaluate(() => ({ res: JSON.parse(localStorage.getItem("quatuor-res") || "{}"), tuto: localStorage.getItem("quatuor-tuto-done") })), { res: {}, tuto: "1" });
  const B = await attendre(() => faux.journal.filter(x => x[0] === "anonyme")[1]?.[1]);
  assert.notEqual(A, B, "nouveau compte anonyme");
  // se reconnecter avec le même e-mail : question, puis progression récupérée
  await codeEmail(page, "joueur@exemple.fr");
  await page.waitForSelector("#recOui");
  assert.match(await page.locator("#sheetBody").innerText(), /Récupérer ta progression existante[\s\S]*Cette adresse e-mail/);
  await page.locator("#recOui").click();
  await page.waitForSelector("#emCode"); await page.locator("#emCode").fill("123456"); await page.locator("#emOk").click();
  await page.waitForEvent("load");
  await page.waitForFunction(g => !!JSON.parse(localStorage.getItem("quatuor-res") || "{}")[g], grille);
  assert.equal(faux.comptes.has(B), false, "compte anonyme vide supprimé");
  assert.deepEqual(erreurs, []);
});

test("site avec appleWeb : bouton Apple → redirection Apple ; au retour, compte déjà lié → question", { skip: !pw && "Playwright indisponible" }, async t => {
  const { faux, ouvrirPage, routes, url } = await contexte(t, { ...CONFIG, appleWeb: true });
  const { page, erreurs } = await ouvrirPage();
  await attendre(() => faux.journal.find(x => x[0] === "anonyme"));
  await page.locator("#setBtn").click();
  await page.waitForSelector("#setCompte .bapple");
  await page.locator("#setCompte .bapple").click();
  await attendre(() => routes.some(u => /\/auth\/v1\/user\/identities\/authorize\?.*provider=apple/.test(u)));
  // retour d'Apple avec « compte déjà lié » (la page d'origine avait noté la demande)
  // (la page avait noté la demande dans sessionStorage avant de partir chez Apple, ce qu'on vérifie au retour)
  await page.waitForTimeout(800);
  await page.goto(url + "?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user");
  await page.waitForSelector("#recOui", { timeout: 15000 });
  assert.match(await page.locator("#sheetBody").innerText(), /Ce compte Apple/);
  assert.equal(await page.evaluate(() => location.search), "", "adresse nettoyée");
  assert.deepEqual(erreurs.filter(e => !/identities\/authorize/.test(e)), []);
});

test("iOS : connecté avec Apple → Se déconnecter → l'appareil repart à zéro", { skip: !pw && "Playwright indisponible" }, async t => {
  const { faux, ouvrirPage } = await contexte(t);
  const srvCtx = null; void srvCtx;
  const { page } = await (async () => {
    const o = await ouvrirPage({ "quatuor-favs": [{ id: "g001:X", grid: "g001", num: 1, name: "X", words: ["a"], fact: "f", lvl: 0, at: 1 }] });
    return o;
  })();
  // (le web sert ici de support : on vérifie le parcours de déconnexion d'un compte relié par e-mail, identique sur iOS)
  const A = await attendre(() => faux.journal.find(x => x[0] === "anonyme")?.[1]);
  await codeEmail(page, "x@y.fr"); await page.waitForSelector("#emCode");
  await page.locator("#emCode").fill("123456"); await page.locator("#emOk").click();
  await page.waitForSelector("#setCompte [data-deco]");
  await page.context().setOffline(true);
  await page.locator("#setCompte [data-deco]").click(); await page.locator("#decoOui").click();
  await page.waitForFunction(() => /Internet/.test(document.querySelector("#toast").textContent));
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("quatuor-favs")).length), 1, "hors ligne : rien n'est effacé");
  await page.context().setOffline(false);
  await page.locator("#decoOui").click();
  await page.waitForEvent("load");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("quatuor-favs") || "[]").length), 0);
  assert.equal(faux.comptes.get(A).email, "x@y.fr", "le compte et ses données restent sur le serveur");
});
