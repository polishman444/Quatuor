// Partie 4 · amis, avec plusieurs comptes de test : demande, acceptation, refus, retrait, résultats sans spoiler
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { creerBase, echoue } = require("./aide-pg.js");
const { upsert } = require("./aide-synchro.js");
const QC = require("../js/calculs.js");

async function joueur(b, pseudo) {
  const id = await b.nouveauJoueur();
  if (pseudo) await b.en(id, "update public.profils set pseudo = $1 where id = $2", [pseudo, id]);
  const [p] = await b.admin("select code_ami from public.profils where id = $1", [id]);
  return { id, code: p.code_ami };
}
const demander = (b, de, code) => b.en(de.id, "select public.envoyer_demande($1) r", [code]).then(r => r[0].r);
const amis = (b, qui, grille = "g100", jour = QC.dateDuNum(10)) => b.en(qui.id, "select * from public.mes_amis($1, $2::date)", [grille, jour]);
const jouer = (b, qui, grille, x) => upsert(b, qui.id, "resultats", [{ user_id: qui.id, ...QC.versServeur(grille, { tries: 1, hints: 0, ...x }) }], ["user_id", "grille_id"]);

test("demande par code → acceptée : chacun voit l'autre (pseudo, série)", async () => {
  const b = await creerBase(); const A = await joueur(b, "Alice"), B = await joueur(b, "Bruno");
  assert.equal(await demander(b, A, B.code.toLowerCase().replace(/(...)/, "$1 ")), "envoyee");   // saisie tolérante
  assert.equal(await demander(b, A, B.code), "deja_envoyee");
  let la = await amis(b, A), lb = await amis(b, B);
  assert.deepEqual([la[0].pseudo, la[0].etat], ["Bruno", "envoyee"]);
  assert.deepEqual([lb[0].pseudo, lb[0].etat], ["Alice", "recue"]);
  assert.equal(la[0].serie, null, "pas de stats avant l'acceptation");
  // seul le destinataire peut accepter
  assert.equal((await b.en(A.id, "select public.repondre_demande($1, true) r", [la[0].demande]))[0].r, false);
  assert.equal((await b.en(B.id, "select public.repondre_demande($1, true) r", [lb[0].demande]))[0].r, true);
  // série de Bruno visible par Alice
  await jouer(b, B, "g009", { win: true, mistakes: 0, d: QC.dateDuNum(9), jdj: true });
  await jouer(b, B, "g010", { win: true, mistakes: 1, d: QC.dateDuNum(10), jdj: true });
  la = await amis(b, A, "g010");
  assert.deepEqual([la[0].etat, la[0].serie], ["ami", 2]);
  assert.equal(await demander(b, A, B.code), "deja_amis");
});

test("demandes croisées : acceptées automatiquement", async () => {
  const b = await creerBase(); const A = await joueur(b, "Alice"), B = await joueur(b, "Bruno");
  assert.equal(await demander(b, A, B.code), "envoyee");
  assert.equal(await demander(b, B, A.code), "acceptee");
  assert.equal((await amis(b, A))[0].etat, "ami");
});

test("refus : le demandeur n'est pas prévenu et ne peut pas insister pendant 7 jours", async () => {
  const b = await creerBase(); const A = await joueur(b, "Alice"), B = await joueur(b, "Bruno");
  await demander(b, A, B.code);
  const [d] = await amis(b, B);
  await b.en(B.id, "select public.repondre_demande($1, false)", [d.demande]);
  assert.equal((await amis(b, A)).length, 0);
  assert.equal((await amis(b, B)).length, 0);
  assert.equal(await demander(b, A, B.code), "envoyee");      // (rien n'est envoyé en réalité)
  assert.equal((await amis(b, B)).length, 0);
  // 8 jours plus tard, une nouvelle demande est possible
  await b.admin("update public.amities set repondu_le = now() - interval '8 days'");
  assert.equal(await demander(b, A, B.code), "envoyee");
  assert.equal((await amis(b, B))[0].etat, "recue");
});

test("retirer un ami / annuler une demande", async () => {
  const b = await creerBase(); const A = await joueur(b, "Alice"), B = await joueur(b, "Bruno"), C = await joueur(b, "Chloé");
  await demander(b, A, B.code); await demander(b, B, A.code);
  await demander(b, A, C.code);
  assert.equal((await amis(b, A)).length, 2);
  await b.en(A.id, "select public.retirer_ami($1)", [B.id]);
  await b.en(A.id, "select public.retirer_ami($1)", [C.id]);
  assert.equal((await amis(b, A)).length, 0);
  assert.equal((await amis(b, B)).length, 0);
  assert.equal((await amis(b, C)).length, 0);
});

test("grille du jour : « Pas encore jouée », puis résultat sans spoiler seulement après avoir moi-même terminé", async () => {
  const b = await creerBase(); const A = await joueur(b, "Alice"), B = await joueur(b, "Bruno");
  await demander(b, A, B.code); await demander(b, B, A.code);
  let [x] = await amis(b, A, "g100");
  assert.equal(x.aujourdhui, "pas_jouee");
  await jouer(b, B, "g100", { win: false, mistakes: 4, d: QC.dateDuNum(10), jdj: true, hist: [[0, 1, 2, 3]] });
  [x] = await amis(b, A, "g100");
  assert.deepEqual([x.aujourdhui, x.erreurs, x.essais], ["masque", null, null], "rien avant d'avoir fini");
  await jouer(b, A, "g100", { win: true, mistakes: 1, d: QC.dateDuNum(10), jdj: true });
  [x] = await amis(b, A, "g100");
  assert.deepEqual([x.aujourdhui, x.erreurs, x.essais], ["ratee", 4, 1]);
  // aucune colonne ne contient l'historique, les groupes ou les mots
  assert.deepEqual(Object.keys(x).sort(), ["ami", "aujourdhui", "avatar", "demande", "erreurs", "essais", "etat", "pseudo", "record", "serie"]);
});

test("RLS : sans être amis, aucune donnée d'un autre joueur n'est accessible", async () => {
  const b = await creerBase(); const A = await joueur(b, "Alice"), B = await joueur(b, "Bruno"), C = await joueur(b, "Chloé");
  await demander(b, A, B.code); await demander(b, B, A.code);
  await jouer(b, B, "g100", { win: true, mistakes: 0, d: QC.dateDuNum(10), jdj: true });
  await jouer(b, C, "g100", { win: true, mistakes: 0, d: QC.dateDuNum(10), jdj: true });
  // même amis : pas d'accès direct aux tables de l'autre
  assert.equal((await b.en(A.id, "select * from public.resultats")).length, 0);
  assert.equal((await b.en(A.id, "select * from public.profils")).length, 1);
  // C n'est pas ami : absent de la liste, même en connaissant son identifiant
  assert.deepEqual((await amis(b, A)).map(x => x.pseudo), ["Bruno"]);
  // C ne voit rien de la relation A–B
  assert.equal((await b.en(C.id, "select * from public.amities")).length, 0);
  // écriture directe sur amities interdite (accepter à la place de l'autre, s'ajouter soi-même…)
  await echoue(b.en(C.id, "insert into public.amities (demandeur, destinataire, statut) values ($1, $2, 'acceptee')", [C.id, A.id]), /permission denied/);
  await echoue(b.en(A.id, "update public.amities set statut = 'acceptee'"), /permission denied/);
  await echoue(b.en(A.id, "delete from public.amities"), /permission denied/);
  // les fonctions internes ne sont pas appelables
  await echoue(b.en(C.id, "select * from public.calcul_stats($1, current_date)", [B.id]), /permission denied/);
  await echoue(b.en(C.id, "select public.bloques_entre($1, $2)", [A.id, B.id]), /permission denied/);
});

test("limites : pseudo requis, 20 demandes par jour, pas soi-même, code inconnu", async () => {
  const b = await creerBase(); const A = await joueur(b, "Alice"), S = await joueur(b, null), B = await joueur(b, "Bruno");
  assert.equal(await demander(b, S, B.code), "pseudo_requis");
  assert.equal(await demander(b, A, A.code), "soi_meme");
  assert.equal(await demander(b, A, "ZZZZZZ"), "introuvable");
  assert.equal(await demander(b, A, "O0I1!!"), "introuvable");
  for (let i = 0; i < 17; i++) await demander(b, A, "ZZZZZZ");
  assert.equal(await demander(b, A, B.code), "limite", "les codes essayés comptent : pas de recherche de codes au hasard");
});
