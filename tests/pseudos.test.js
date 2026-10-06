// Partie 3 · pseudos : format, filtre (client ET serveur, identiques), unicité, limites ; code ami
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../js/pseudos.js");
const { creerBase, echoue } = require("./aide-pg.js");

const CORPUS = ["Constance", "Hercule", "Unique", "Technique", "Communiquer", "Monique", "Élodie", "Assassin", "Scunthorpe",
  "GrosCon", "con_42", "Con42", "c0nnard", "PUTAIN", "Sh1t", "Pute", "ta-mere", "F_U_C_K", "fuck_you", "BiTcH", "SupportPSG",
  "Admin", "admin2", "RenardMalin42", "LoutreRusée07", "Ñandú", "Øystein", "naziboy", "N4Z1", "Hitler_88", "Pédé", "PD",
  "x_pd_x", "Kéké", "Bob", "Dick-Rivers", "Dickens", "grape", "rape_me", "Sexton", "sex", "Cul", "Culotte", "Assmat", "ass-man"];

test("format : 3 à 16 caractères, lettres (accents compris), chiffres, tiret, underscore", () => {
  for (const ok of ["Bob", "Élodie_92", "jean-luc", "ABCDEFGHIJKLMNOP", "Zoé"]) assert.equal(P.valider(ok).ok, true, ok);
  assert.equal(P.valider("ab").raison, "court");
  assert.equal(P.valider("ABCDEFGHIJKLMNOPQ").raison, "long");
  for (const ko of ["a b c", "émile!", "<script>", "tom.cat", "abc😀", "日本語語"]) assert.equal(P.valider(ko).raison, "caracteres", ko);
});

test("filtre : insultes FR/EN bloquées, y compris collées, en leet ou en majuscules ; mots innocents acceptés", () => {
  for (const ko of ["GrosCon", "con_42", "Con42", "c0nnard", "PUTAIN", "Sh1t", "Pute", "ta-mere", "fuck_you", "BiTcH", "N4Z1", "Hitler_88", "Pédé", "PD", "rape_me", "Admin", "ass-man", "Cul"])
    assert.equal(P.interdit(ko), true, ko);
  for (const ok of ["Constance", "Hercule", "Unique", "Technique", "Communiquer", "Monique", "Élodie", "Assassin", "Dickens", "grape", "Sexton", "Culotte", "Bob", "Kéké", "Assmat"])
    assert.equal(P.interdit(ok), false, ok);
});

test("pseudo proposé : toujours valide, varié", () => {
  const vus = new Set();
  for (let i = 0; i < 300; i++) { const p = P.proposer(); assert.equal(P.valider(p).ok, true, p); vus.add(p); }
  assert.ok(vus.size > 200);
});

test("code ami : saisie tolérante", () => {
  assert.equal(P.nettoyerCode(" ab3 - k7q "), "AB3K7Q");
  assert.equal(P.codeValide("AB3K7Q"), true);
  for (const ko of ["AB3K7", "AB3K7QQ", "AB0K7Q", "AB1K7Q", "ABOK7Q", "ABIK7Q"]) assert.equal(P.codeValide(ko), false, ko);
});

test("serveur : même liste de mots et même verdict que le client", async () => {
  const b = await creerBase();
  const liste = await b.admin("select mot, partout from public.mots_interdits order by mot");
  assert.deepEqual(liste.filter(x => x.partout).map(x => x.mot).sort(), [...P.PARTOUT].sort());
  assert.deepEqual(liste.filter(x => !x.partout).map(x => x.mot).sort(), [...P.MOTS].sort());
  for (const p of CORPUS) {
    const [r] = await b.admin("select public.pseudo_interdit($1) as i", [p]);
    assert.equal(r.i, P.interdit(p), p);
  }
});

test("serveur : pseudo contrôlé à l'écriture (format, filtre, unicité sans tenir compte des accents ni majuscules)", async () => {
  const b = await creerBase(); const A = await b.nouveauJoueur(), B = await b.nouveauJoueur();
  const changer = (u, p) => b.en(u, "update public.profils set pseudo = $1 where id = $2", [p, u]);
  await changer(A, "Élodie");
  await echoue(changer(B, "elodie"), /duplicate key|unique/);
  await echoue(changer(B, "ELODIE"), /duplicate key|unique/);
  await echoue(changer(B, "GrosCon"), /pseudo_interdit/);
  await echoue(changer(B, "ab"), /pseudo_format/);
  await echoue(changer(B, "<b>gras</b>"), /pseudo_format/);
  await echoue(changer(B, "x".repeat(17)), /pseudo_format/);
  await changer(B, "Zoé_42");
  assert.deepEqual((await b.en(B, "select public.verifier_pseudo('elodie') v"))[0].v, "pris");
  assert.deepEqual((await b.en(A, "select public.verifier_pseudo('elodie') v"))[0].v, "ok");   // le sien
  assert.deepEqual((await b.en(B, "select public.verifier_pseudo('c0nnard') v"))[0].v, "interdit");
  assert.deepEqual((await b.en(B, "select public.verifier_pseudo('a b') v"))[0].v, "format");
  // impossible de toucher au pseudo d'un autre
  await b.en(B, "update public.profils set pseudo = 'Volé' where id = $1", [A]);
  assert.equal((await b.admin("select pseudo from public.profils where id = $1", [A]))[0].pseudo, "Élodie");
});

test("serveur : 10 changements de pseudo par jour au maximum", async () => {
  const b = await creerBase(); const A = await b.nouveauJoueur();
  for (let i = 0; i < 10; i++) await b.en(A, "update public.profils set pseudo = $1 where id = $2", ["Joueur" + i, A]);
  await echoue(b.en(A, "update public.profils set pseudo = 'Encore' where id = $1", [A]), /trop_de_changements/);
  await b.en(A, "update public.profils set avatar = 4 where id = $1", [A]);   // l'avatar reste modifiable
  await echoue(b.en(A, "update public.profils set avatar = 40 where id = $1", [A]), /check/);
});
