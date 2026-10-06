// =====================================================================
// Quatuor · configuration du mode en ligne (PUBLIQUE : rien de secret ici)
//
// - supabaseUrl / supabaseCle : adresse du projet et clé « publishable » (sb_publishable_…, ou l'ancienne « anon »).
//   Ces deux valeurs sont faites pour être dans l'appli : ce sont les règles RLS de la base
//   qui protègent les données. ⚠️ Ne JAMAIS mettre ici la clé « service_role » (ou « secret »).
// - telemetryDeckAppId : identifiant de l'appli dans TelemetryDeck (statistiques anonymes).
//
// Valeurs vides = mode en ligne désactivé : le jeu fonctionne exactement comme avant.
// Où trouver ces valeurs : SETUP-EN-LIGNE.md
// =====================================================================
window.QUATUOR_CONFIG = {
  supabaseUrl: "https://lnoorsfuoczfbaefgppe.supabase.co",
  supabaseCle: "sb_publishable_o6kouGC4ttP2UdhNIVPMbg_6MmXZXAN",
  telemetryDeckAppId: "AF21F056-30B3-4885-8849-008AB82C901D",
  // Connexion Apple sur le site : à passer à true une fois le « Services ID » Apple configuré (SETUP-EN-LIGNE.md, étape 5c)
  appleWeb: false
};
