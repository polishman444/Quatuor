// Partie 1 · Row Level Security et fonctions du serveur, sur un vrai Postgres (PGlite)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { creerBase, echoue } = require("./aide-pg.js");
const { upsert } = require("./aide-synchro.js");
const QC = require("../js/calculs.js");

const TABLES = ["profils", "resultats", "favoris", "amities", "blocages", "signalements", "mots_interdits", "journal_actions"];
const ligne = (id, x) => QC.versServeur(id, x);

test("RLS activée sur TOUTES les tables du schéma public", async () => {
  const b = await creerBase();
  const t = await b.admin("select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relkind = 'r'");
  assert.ok(t.length >= TABLES.length);
  t.forEach(r => assert.equal(r.relrowsecurity, true, `RLS désactivée sur ${r.relname}`));
});

test("sans session (rôle anon) : aucun accès, à rien", async () => {
  const b = await creerBase(); await b.nouveauJoueur();
  for (const t of TABLES) await echoue(b.en(null, `select * from public.${t}`), /permission denied/);
  await echoue(b.en(null, "select public.assurer_profil()"), /permission denied/);
  await echoue(b.en(null, "insert into public.resultats (user_id, grille_id, gagne, erreurs, premier_gagne, premier_erreurs) values (gen_random_uuid(), 'g1', true, 0, true, 0)"), /permission denied/);
});

test("profil : créé automatiquement avec un code ami lisible et unique", async () => {
  const b = await creerBase();
  const ids = []; for (let i = 0; i < 30; i++) ids.push(await b.nouveauJoueur());
  const p = await b.admin("select code_ami from public.profils");
  assert.equal(new Set(p.map(x => x.code_ami)).size, 30);
  p.forEach(x => assert.match(x.code_ami, /^[2-9A-HJ-NP-Z]{6}$/));
  p.forEach(x => assert.doesNotMatch(x.code_ami, /[01OI]/));
  // assurer_profil est idempotent
  const a = await b.en(ids[0], "select (public.assurer_profil()).code_ami"), c = await b.en(ids[0], "select (public.assurer_profil()).code_ami");
  assert.equal(a[0].code_ami, c[0].code_ami);
});

test("profil : je ne lis que le mien et ne modifie que pseudo et avatar", async () => {
  const b = await creerBase(); const A = await b.nouveauJoueur(), B = await b.nouveauJoueur();
  const vus = await b.en(A, "select id from public.profils");
  assert.deepEqual(vus.map(x => x.id), [A]);
  await b.en(A, "update public.profils set avatar = 3 where id = $1", [A]);
  // modifier le profil d'un autre : aucune ligne touchée
  await b.en(A, "update public.profils set avatar = 5 where id = $1", [B]);
  assert.equal((await b.admin("select avatar from public.profils where id = $1", [B]))[0].avatar, 0);
  // colonnes protégées
  await echoue(b.en(A, "update public.profils set code_ami = 'ABCDEF' where id = $1", [A]), /permission denied/);
  await echoue(b.en(A, "update public.profils set base_record = 999 where id = $1", [A]), /permission denied/);
  await echoue(b.en(A, "update public.profils set reinit_le = now() where id = $1", [A]), /permission denied/);
  await echoue(b.en(A, "insert into public.profils (id, code_ami) values (gen_random_uuid(), 'ABCDEF')"), /permission denied/);
  await echoue(b.en(A, "delete from public.profils where id = $1", [A]), /permission denied/);
});

test("résultats et favoris : un joueur ne peut ni lire ni modifier ceux d'un autre", async () => {
  const b = await creerBase(); const A = await b.nouveauJoueur(), B = await b.nouveauJoueur();
  await upsert(b, A, "resultats", [{ user_id: A, ...ligne("g001", { win: true, mistakes: 1, tries: 1 }) }], ["user_id", "grille_id"]);
  await upsert(b, A, "favoris", [{ user_id: A, fav_id: "g001:X", donnees: { name: "X" }, maj_le: new Date().toISOString() }], ["user_id", "fav_id"]);
  assert.equal((await b.en(B, "select * from public.resultats")).length, 0);
  assert.equal((await b.en(B, "select * from public.favoris")).length, 0);
  // écrire au nom d'un autre : refusé
  await echoue(upsert(b, B, "resultats", [{ user_id: A, ...ligne("g002", { win: true, mistakes: 0, tries: 1 }) }], ["user_id", "grille_id"]), /row-level security/);
  await echoue(upsert(b, B, "favoris", [{ user_id: A, fav_id: "pirate", donnees: {}, maj_le: new Date().toISOString() }], ["user_id", "fav_id"]), /row-level security/);
  // modifier / supprimer ceux d'un autre : aucune ligne touchée
  await b.en(B, "update public.resultats set gagne = false where user_id = $1", [A]);
  await b.en(B, "delete from public.resultats where user_id = $1", [A]);
  const r = await b.admin("select gagne from public.resultats where user_id = $1", [A]);
  assert.deepEqual(r.map(x => x.gagne), [true]);
  // ni dans les fonctions de stats d'un autre (calcul_stats est interne)
  await echoue(b.en(B, "select * from public.calcul_stats($1, current_date)", [A]), /permission denied/);
});

test("limites : champs et tailles contrôlés", async () => {
  const b = await creerBase(); const A = await b.nouveauJoueur();
  const ok = ligne("g001", { win: true, mistakes: 0, tries: 1 });
  await echoue(upsert(b, A, "resultats", [{ user_id: A, ...ok, grille_id: "x".repeat(41) }], ["user_id", "grille_id"]), /check/);
  await echoue(upsert(b, A, "resultats", [{ user_id: A, ...ok, erreurs: 50 }], ["user_id", "grille_id"]), /check/);
  await echoue(upsert(b, A, "resultats", [{ user_id: A, ...ok, detail: { hist: "x".repeat(5000) } }], ["user_id", "grille_id"]), /check/);
  await echoue(upsert(b, A, "favoris", [{ user_id: A, fav_id: "f", donnees: { t: "x".repeat(5000) }, maj_le: new Date().toISOString() }], ["user_id", "fav_id"]), /check/);
});

test("le serveur garde le meilleur résultat (même règle que fusionnerResultat)", async () => {
  const b = await creerBase(); const A = await b.nouveauJoueur();
  const cas = [
    [{ win: false, mistakes: 4, tries: 1, d: "2026-10-03", jdj: true, vu: true }, { win: true, mistakes: 2, tries: 2, first: { win: false, mistakes: 4 }, d: "2026-10-04" }],
    [{ win: true, mistakes: 1, tries: 1, d: "2026-10-03" }, { win: true, mistakes: 3, tries: 1, d: "2026-10-02" }],
    [{ win: true, mistakes: 1, tries: 1, hints: 2 }, { win: true, mistakes: 1, tries: 1, hints: 0, d: "2026-10-05", jdj: true }],
    [{ win: false, mistakes: 4, tries: 1, vu: false, d: "2026-10-05", jdj: true }, { win: false, mistakes: 4, tries: 1, vu: true, d: "2026-10-06" }],
    [{ win: true, mistakes: 0, tries: 1, d: "2026-10-05", jdj: true, s: 30 }, { win: false, mistakes: 4, tries: 1, d: "2026-10-04", jdj: true, s: 99 }]
  ];
  for (const [k, [ancien, nouveau]] of cas.entries()) {
    const id = "g" + k;
    await upsert(b, A, "resultats", [{ user_id: A, ...ligne(id, ancien) }], ["user_id", "grille_id"]);
    await upsert(b, A, "resultats", [{ user_id: A, ...ligne(id, nouveau) }], ["user_id", "grille_id"]);
    const [r] = await b.en(A, "select *, to_char(joue_le, 'YYYY-MM-DD') as j from public.resultats where grille_id = $1", [id]);
    const serveur = QC.depuisServeur({ ...r, joue_le: r.j });
    const js = QC.fusionnerResultat(QC.depuisServeur(ligne(id, ancien)), QC.depuisServeur(ligne(id, nouveau)));
    assert.deepEqual(QC.versServeur(id, serveur), QC.versServeur(id, js), `cas ${k}`);
  }
});

test("favoris : la modification la plus récente gagne", async () => {
  const b = await creerBase(); const A = await b.nouveauJoueur();
  const t = ms => new Date(Date.now() - ms).toISOString();
  await upsert(b, A, "favoris", [{ user_id: A, fav_id: "f", donnees: { v: 2 }, maj_le: t(1000) }], ["user_id", "fav_id"]);
  await upsert(b, A, "favoris", [{ user_id: A, fav_id: "f", donnees: { v: 1 }, supprime: true, maj_le: t(5000) }], ["user_id", "fav_id"]);
  const [r] = await b.en(A, "select donnees, supprime from public.favoris");
  assert.deepEqual([r.donnees.v, r.supprime], [2, false]);
});

test("statistiques : le calcul SQL donne exactement le même résultat que le calcul JS", async () => {
  const b = await creerBase();
  let graine = 7; const alea = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 25; n++) {
    const A = await b.nouveauJoueur(), res = {};
    const base = n % 3 === 0 ? QC.BASE_VIDE : QC.baseDepuisStats({ played: 10 + n, wins: 5 + n, best: n % 7, streak: n % 5,
      lastWin: 5 + (n % 4), lastPlayed: 6 + (n % 4) });
    await b.en(A, "select public.fixer_base($1::jsonb)", [JSON.stringify(base)]);
    for (let j = 1; j <= 40; j++) {
      if (alea() < 0.25) continue;
      const premier = alea() < 0.7, x = { win: premier || alea() < 0.5, mistakes: 1, tries: premier ? 1 : 2, first: { win: premier, mistakes: premier ? 1 : 4 },
        d: QC.dateDuNum(j), jdj: alea() < 0.85 };
      res["g" + j] = x;
    }
    res.ancien = { win: true, mistakes: 0, tries: 1 };   // sans date
    await upsert(b, A, "resultats", Object.entries(res).map(([id, x]) => ({ user_id: A, ...ligne(id, x) })), ["user_id", "grille_id"]);
    for (const jour of [20, 38, 40, 41, 42]) {
      const auj = QC.dateDuNum(jour);
      const [s] = await b.en(A, "select serie, record, parties, victoires, to_char(derniere_victoire,'YYYY-MM-DD') dv, to_char(dernier_jeu,'YYYY-MM-DD') dj from public.mes_stats($1::date)", [auj]);
      const js = QC.calculerStats(base, res, auj);
      assert.deepEqual({ serie: s.serie, record: s.record, parties: s.parties, victoires: s.victoires, derniereVictoire: s.dv, dernierJeu: s.dj }, js, `joueur ${n}, jour ${jour}`);
    }
  }
});

test("base des stats : enregistrée une fois, puis on garde le maximum ; réinitialisation", async () => {
  const b = await creerBase(); const A = await b.nouveauJoueur();
  await b.en(A, "select public.fixer_base($1::jsonb)", [JSON.stringify({ parties: 10, victoires: 8, record: 5, serie: 3, derniereVictoire: "2026-10-04", dernierJeu: "2026-10-04" })]);
  await b.en(A, "select public.fixer_base($1::jsonb)", [JSON.stringify({ parties: 4, victoires: 4, record: 7, serie: 1, derniereVictoire: "2026-10-02", dernierJeu: "2026-10-02" })]);
  let [p] = await b.en(A, "select base_parties, base_victoires, base_record, base_serie, to_char(base_derniere_victoire,'YYYY-MM-DD') dv from public.profils");
  assert.deepEqual(p, { base_parties: 10, base_victoires: 8, base_record: 7, base_serie: 3, dv: "2026-10-04" });
  await upsert(b, A, "resultats", [{ user_id: A, ...ligne("g1", { win: true, mistakes: 0, tries: 1 }) }], ["user_id", "grille_id"]);
  await b.en(A, "select public.reinitialiser_progression()");
  assert.equal((await b.en(A, "select * from public.resultats")).length, 0);
  [p] = await b.en(A, "select base_parties, reinit_le from public.profils");
  assert.equal(p.base_parties, null); assert.ok(p.reinit_le);
});
