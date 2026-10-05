// =====================================================================
// Quatuor · fonction serveur « supprimer-compte » (Supabase Edge Function, Deno)
// Supprime le compte du joueur qui l'appelle : son jeton (Authorization: Bearer …) est vérifié,
// puis le compte d'authentification est supprimé avec l'API d'administration. Toutes ses données
// (profil, résultats, favoris, amitiés, blocages, signalements, journal) sont effacées par ON DELETE CASCADE.
// La clé d'administration (SUPABASE_SERVICE_ROLE_KEY) est fournie par Supabase à la fonction :
// elle n'existe nulle part ailleurs, et jamais dans l'appli.
// Déploiement : voir SETUP-EN-LIGNE.md (copier-coller dans le tableau de bord Supabase).
// =====================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const reponse = (status: number, corps: unknown) => new Response(JSON.stringify(corps), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// admin : client Supabase avec la clé d'administration (injecté, pour pouvoir tester)
// deno-lint-ignore no-explicit-any
export async function traiter(req: Request, admin: any): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reponse(405, { error: "Méthode non autorisée" });
  const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jeton) return reponse(401, { error: "Non connecté" });
  const { data, error } = await admin.auth.getUser(jeton);
  if (error || !data || !data.user) return reponse(401, { error: "Jeton invalide" });
  const { error: e } = await admin.auth.admin.deleteUser(data.user.id);
  if (e) return reponse(500, { error: "Suppression impossible" });
  return reponse(200, { ok: true });
}

if (typeof Deno !== "undefined") {
  const { createClient } = await import("jsr:@supabase/supabase-js@2");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } });
  Deno.serve((req: Request) => traiter(req, admin));
}
