// Base Postgres de test (PGlite : vrai Postgres compilé en WebAssembly, en mémoire)
// avec une imitation minimale de Supabase : rôles anon / authenticated, schéma auth, auth.uid(),
// et les droits par défaut que Supabase accorde (pour vérifier que nos REVOKE les retirent bien).
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SUPABASE = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, is_anonymous boolean not null default true, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Droits par défaut de Supabase sur le schéma public (nos migrations doivent les restreindre)
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

async function creerBase() {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite({ parsers: { 1082: v => v } });   // dates renvoyées en texte AAAA-MM-JJ, comme PostgREST
  await db.exec(SUPABASE);
  const dir = path.join(__dirname, "..", "supabase", "migrations");
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) {
    try { await db.exec(fs.readFileSync(path.join(dir, f), "utf8")); }
    catch (e) { e.message = `${f} : ${e.message}`; throw e; }
  }
  // File d'attente : PGlite n'a qu'une connexion, le rôle courant est donc partagé
  let file = Promise.resolve();
  const enSerie = fn => { const p = file.then(fn); file = p.catch(() => {}); return p; };

  // Exécute une requête en tant que joueur (uid) ou sans session (uid = null → rôle anon)
  async function en(uid, sql, params = []) {
    return enSerie(async () => {
      await db.query("select set_config('request.jwt.claims', $1, false)", [uid ? JSON.stringify({ sub: uid, role: "authenticated" }) : ""]);
      await db.exec(`set role ${uid ? "authenticated" : "anon"}`);
      try { return (await db.query(sql, params)).rows; }
      finally { await db.exec("reset role"); await db.query("select set_config('request.jwt.claims', '', false)"); }
    });
  }
  // Requête en administrateur (comme le tableau de bord Supabase)
  const admin = (sql, params = []) => enSerie(async () => (await db.query(sql, params)).rows);
  // Nouveau compte (anonyme), avec son profil
  async function nouveauJoueur() {
    const id = crypto.randomUUID();
    await admin("insert into auth.users (id) values ($1)", [id]);
    await en(id, "select public.assurer_profil()");
    return id;
  }
  return { db, en, admin, nouveauJoueur };
}

// Vérifie qu'une promesse échoue (droits refusés, contrainte, exception…)
async function echoue(promesse, motif) {
  try { await promesse; } catch (e) { if (motif && !motif.test(e.message)) throw new Error(`Erreur inattendue : ${e.message}`); return e; }
  throw new Error("La requête aurait dû échouer");
}

module.exports = { creerBase, echoue };
