// Partie 2 · Connexion avec Apple : liaison au compte anonyme, ou récupération d'une progression existante
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { creerConnexionApple, creerSynchro } = require("../js/en-ligne.js");
const { creerBase } = require("./aide-pg.js");
const { stockage, apiTest } = require("./aide-synchro.js");
const QC = require("../js/calculs.js");

// Faux client supabase : session anonyme ; comptesApple = jetons déjà liés à un autre compte
function fauxClient({ dejaLie = false, refusPremierSignIn = false } = {}) {
  const journal = [];
  let session = { access_token: "jeton-anonyme", user: { id: "anon", is_anonymous: true } };
  let signIns = 0;
  const c = { journal, auth: {
    getSession: async () => ({ data: { session } }),
    linkIdentity: async x => { journal.push(["link", x.token, x.nonce]);
      return dejaLie ? { data: null, error: { code: "identity_already_exists", message: "Identity is already linked to another user" } }
        : (session = { ...session, user: { ...session.user, is_anonymous: false } }, { data: { session }, error: null }); },
    signInWithIdToken: async x => { journal.push(["signin", x.token, x.nonce]); signIns++;
      if (refusPremierSignIn && signIns === 1) return { data: {}, error: { message: "nonce already used" } };
      session = { access_token: "jeton-apple", user: { id: "existant", is_anonymous: false } }; return { data: { session, user: session.user }, error: null }; }
  } };
  return c;
}
function deps(c, reponse, extra = {}) {
  const j = { jetons: 0, sync: 0, supprime: [], demande: 0 };
  let n = 0;
  return { j, d: { client: async () => c, nonce: () => "nonce" + (++n), jetonApple: async nonce => { j.jetons++; return "idtoken-" + nonce; },
    demanderRecuperation: async () => { j.demande++; return reponse; }, synchroniser: async () => { j.sync++; },
    supprimerAncien: async t => { j.supprime.push(t); }, ...extra } };
}

test("1er appareil : le compte Apple est lié au compte anonyme (même compte, rien à demander)", async () => {
  const c = fauxClient(), { j, d } = deps(c, true);
  assert.deepEqual(await creerConnexionApple(d)(), { etat: "lie" });
  assert.deepEqual(c.journal, [["link", "idtoken-nonce1", "nonce1"]]);
  assert.equal(j.demande, 0); assert.equal(j.sync, 1); assert.deepEqual(j.supprime, []);
});

test("compte Apple déjà lié ailleurs + refus : rien ne change", async () => {
  const c = fauxClient({ dejaLie: true }), { j, d } = deps(c, false);
  assert.deepEqual(await creerConnexionApple(d)(), { etat: "annule" });
  assert.equal(j.demande, 1);
  assert.equal(c.journal.filter(x => x[0] === "signin").length, 0, "pas de connexion silencieuse");
  assert.deepEqual(j.supprime, []); assert.equal(j.sync, 0);
});

test("compte Apple déjà lié ailleurs + « Récupérer » : connexion au compte existant, ancien compte anonyme supprimé", async () => {
  const c = fauxClient({ dejaLie: true }), { j, d } = deps(c, true);
  assert.deepEqual(await creerConnexionApple(d)(), { etat: "recupere" });
  assert.deepEqual(c.journal.map(x => x[0]), ["link", "signin"]);
  assert.deepEqual(j.supprime, ["jeton-anonyme"]);
  assert.equal(j.sync, 1);
});

test("jeton refusé à la 2e utilisation : nouvelle demande à Apple", async () => {
  const c = fauxClient({ dejaLie: true, refusPremierSignIn: true }), { j, d } = deps(c, true);
  assert.deepEqual(await creerConnexionApple(d)(), { etat: "recupere" });
  assert.equal(j.jetons, 2);
});

test("autre erreur de liaison : remontée, aucune question posée", async () => {
  const c = fauxClient(); c.auth.linkIdentity = async () => ({ error: new Error("Réseau") });
  const { j, d } = deps(c, true);
  await assert.rejects(creerConnexionApple(d)(), /Réseau/);
  assert.equal(j.demande, 0);
});

test("connexion Apple sur un 2e appareil : progression récupérée, grilles de cet appareil ajoutées", async () => {
  const b = await creerBase(), A = crypto.randomUUID(), C = crypto.randomUUID();
  await b.admin("insert into auth.users (id) values ($1), ($2)", [A, C]);
  const J = QC.dateDuNum;
  // téléphone 1 (compte A, lié à Apple) : 2 grilles, série de 2
  const ls1 = stockage({ "quatuor-base": QC.BASE_VIDE, "quatuor-res": {
    g001: { win: true, mistakes: 0, tries: 1, first: { win: true, mistakes: 0 }, d: J(4), jdj: true },
    g002: { win: true, mistakes: 1, tries: 1, first: { win: true, mistakes: 1 }, d: J(5), jdj: true } } });
  await creerSynchro(apiTest(b, { uid: A }), { ls: ls1, aujourdhui: () => J(5) }).synchroniser();
  // téléphone 2 : compte anonyme C, a joué une grille bonus
  const compte2 = { uid: C }, ls2 = stockage({ "quatuor-base": QC.BASE_VIDE, "quatuor-res": { g050: { win: false, mistakes: 4, tries: 1, d: J(5) } } });
  const s2 = creerSynchro(apiTest(b, compte2), { ls: ls2, aujourdhui: () => J(5) });
  await s2.synchroniser();
  // « Récupérer ma progression » : la session devient celle du compte A, puis synchro
  compte2.uid = A;
  await s2.synchroniser();
  assert.deepEqual(Object.keys(ls2.json("quatuor-res")).sort(), ["g001", "g002", "g050"]);
  assert.equal(ls2.json("quatuor").streak, 2);
  assert.equal((await b.en(A, "select * from public.resultats")).length, 3);
});
