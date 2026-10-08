# Quatuor

Jeu quotidien de culture G : 16 mots, 4 groupes. PWA (https://playquatuor.fr) et appli iOS (Capacitor), même code.

- `index.html` : la page ; `css/quatuor.css` : le style ; `js/jeu.js` : le jeu ; `js/grilles.js` : règles des grilles
  (grille du jour, grille bonus), partagées avec le vérificateur. `grilles.json` : les grilles (voir `COMMENT-AJOUTER-UNE-GRILLE.md`,
  et `npm run verifier`).
- Version : `npm run nouvelle-version -- 1.3` met à jour package.json, le site, l'appli iOS et le cache hors ligne (`sw.js`) ;
  sans numéro, vérifie qu'ils concordent.
- Mode en ligne (comptes anonymes, connexion Apple, amis, synchronisation) : `js/`, `supabase/`,
  configuration publique dans `config-en-ligne.js`. Mise en place : **`SETUP-EN-LIGNE.md`**.
- Confidentialité App Store : `ETIQUETTES-APP-STORE.md` ; TestFlight : `GUIDE-TESTFLIGHT.md`.
- Tests : `npm test` (base Postgres en mémoire avec RLS, synchronisation, jeu dans Chromium).
