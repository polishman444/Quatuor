# Quatuor

Jeu quotidien de culture G : 16 mots, 4 groupes. PWA (https://playquatuor.fr) et appli iOS (Capacitor), même code.

- `index.html` : tout le jeu ; `grilles.json` : les grilles (voir `COMMENT-AJOUTER-UNE-GRILLE.md`).
- Mode en ligne (comptes anonymes, connexion Apple, amis, synchronisation) : `js/`, `supabase/`,
  configuration publique dans `config-en-ligne.js`. Mise en place : **`SETUP-EN-LIGNE.md`**.
- Confidentialité App Store : `ETIQUETTES-APP-STORE.md` ; TestFlight : `GUIDE-TESTFLIGHT.md`.
- Tests : `npm test` (base Postgres en mémoire avec RLS, synchronisation, jeu dans Chromium).
