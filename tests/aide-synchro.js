// Outils des tests de synchronisation : stockage local factice et « api » branchée sur la base de test
// (mêmes requêtes que supabase-js / PostgREST, exécutées avec les droits du joueur : RLS comprise).
"use strict";

// Imitation de l'objet ls de index.html
function stockage(initial = {}) {
  const m = new Map(Object.entries(initial).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  return { get: k => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, String(v)), del: k => m.delete(k),
    json: k => (m.has(k) ? JSON.parse(m.get(k)) : null), map: m };
}

// Upsert façon PostgREST : colonnes = clés présentes, ON CONFLICT DO UPDATE de toutes ces colonnes
async function upsert(base, uid, table, lignes, cles) {
  const cols = [...new Set(lignes.flatMap(Object.keys))];
  const maj = cols.filter(c => !cles.includes(c)).map(c => `${c} = excluded.${c}`).join(", ");
  await base.en(uid, `insert into public.${table} (${cols.join(", ")})
    select ${cols.join(", ")} from jsonb_populate_recordset(null::public.${table}, $1::jsonb)
    on conflict (${cles.join(", ")}) do update set ${maj}`, [JSON.stringify(lignes)]);
}

// api pour creerSynchro(), au nom du joueur courant (compte.uid) ; horsLigne = true : tout échoue
function apiTest(base, compte) {
  const reseau = () => { if (compte.horsLigne) throw new Error("Failed to fetch"); };
  const dates = r => ({ ...r, joue_le: r.joue_le == null ? null : String(r.joue_le instanceof Date ? r.joue_le.toISOString() : r.joue_le).slice(0, 10),
    maj_le: r.maj_le instanceof Date ? r.maj_le.toISOString() : r.maj_le, reinit_le: r.reinit_le instanceof Date ? r.reinit_le.toISOString() : r.reinit_le });
  const profilJs = p => { const x = dates(p);
    ["base_derniere_victoire", "base_dernier_jeu"].forEach(k => { if (x[k] instanceof Date) x[k] = x[k].toISOString().slice(0, 10); }); return x; };
  return {
    async utilisateur() { reseau(); return compte.uid; },
    async profil() { reseau(); return profilJs((await base.en(compte.uid, "select (public.assurer_profil()).*"))[0]); },
    async fixerBase(b) { reseau(); await base.en(compte.uid, "select public.fixer_base($1::jsonb)", [JSON.stringify(b)]); },
    async reinitialiser() { reseau(); const r = await base.en(compte.uid, "select public.reinitialiser_progression() as t"); return r[0].t.toISOString(); },
    async resultats() { reseau(); return (await base.en(compte.uid, "select * from public.resultats")).map(dates); },
    async favoris() { reseau(); return (await base.en(compte.uid, "select * from public.favoris")).map(dates); },
    async envoyerResultats(l) { reseau(); await upsert(base, compte.uid, "resultats", l, ["user_id", "grille_id"]); },
    async envoyerFavoris(l) { reseau(); await upsert(base, compte.uid, "favoris", l, ["user_id", "fav_id"]); }
  };
}

module.exports = { stockage, upsert, apiTest };
