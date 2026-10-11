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
  // Pubs récompensées de l'appli iOS (Google AdMob) : bloc d'annonces « Indice ou solution » (avec récompense).
  // L'ID de l'appli AdMob est dans ios/App/App/Info.plist (GADApplicationIdentifier). Mise en place : SETUP-PUBS.md
  // test: true → l'appli affiche les pubs de TEST de Google (aucun revenu, aucun risque pour le compte).
  // ⚠️ Passer à test: false seulement au moment de publier, une fois le profil de paiement AdMob rempli.
  admob: { recompense: "ca-app-pub-1202848161795834/1142179866", test: true },
  // Connexion Apple sur le site : à passer à true une fois le « Services ID » Apple configuré (SETUP-EN-LIGNE.md, étape 5c)
  appleWeb: false
};
