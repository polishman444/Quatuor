// =====================================================================
// Quatuor · configuration du mode en ligne (PUBLIQUE : rien de secret ici)
//
// - supabaseUrl / supabaseCle : adresse du projet et clé « anon » (ou « publishable »).
//   Ces deux valeurs sont faites pour être dans l'appli : ce sont les règles RLS de la base
//   qui protègent les données. ⚠️ Ne JAMAIS mettre ici la clé « service_role » (ou « secret »).
// - telemetryDeckAppId : identifiant de l'appli dans TelemetryDeck (statistiques anonymes).
//
// Valeurs vides = mode en ligne désactivé : le jeu fonctionne exactement comme avant.
// Où trouver ces valeurs : SETUP-EN-LIGNE.md
// =====================================================================
window.QUATUOR_CONFIG = {
  supabaseUrl: "",
  supabaseCle: "",
  telemetryDeckAppId: ""
};
