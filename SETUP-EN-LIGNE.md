# Mode en ligne : ce que tu dois faire toi-même

Tout se fait **depuis un navigateur** (Safari sur iPad convient). Compte environ 45 minutes la première fois.
Tant que ces étapes ne sont pas faites, le jeu fonctionne exactement comme avant : le mode en ligne
reste simplement éteint (le fichier `config-en-ligne.js` est vide).

> 🔐 **Règle d'or des clés** : seules l'**URL du projet** et la clé **anon / publishable** vont dans l'appli.
> La clé **service_role / secret** ne doit **jamais** être copiée nulle part (ni dans le code, ni dans un message).

---

## 1. Créer le projet Supabase (base de données et comptes)

1. Va sur **https://supabase.com** → **Start your project** → connecte-toi avec GitHub (le plus simple).
2. **New project** :
   - *Organization* : la tienne (créée automatiquement) ;
   - *Project name* : `quatuor` ;
   - *Database password* : clique sur **Generate a password** et garde-le dans ton gestionnaire de mots de passe
     (tu n'en auras normalement plus besoin) ;
   - *Region* : **West EU (Paris)** — les données restent en France (RGPD) ;
   - plan **Free** pour commencer.
3. Patiente 1 à 2 minutes pendant la création.

> ℹ️ Plan gratuit : un projet sans aucune activité pendant 7 jours est mis en pause (un clic pour le relancer).
> Avec des joueurs chaque jour, cela n'arrive pas.

## 2. Créer les tables (copier-coller du SQL)

Les fichiers sont dans le dossier `supabase/migrations/` du dépôt GitHub. Pour **chaque fichier, dans l'ordre des numéros**
(`0001_…`, puis `0002_…`, etc.) :

1. Sur GitHub (Safari), ouvre le fichier, puis touche le bouton **Raw** (ou l'icône « copier » en haut du fichier) et copie tout le texte.
2. Dans Supabase : menu de gauche **SQL Editor** → **New query** → colle → **Run**.
3. Tu dois voir *Success. No rows returned*. En cas d'erreur, ne lance pas le fichier suivant : envoie-moi le message.

> Chaque fichier ne doit être lancé **qu'une fois**. Si un nouveau fichier apparaît plus tard (mise à jour),
> lance seulement celui-là.

Vérification : menu **Table Editor** → tu dois voir les tables `profils`, `resultats`, `favoris`, `amities`,
`blocages`, `signalements`, `mots_interdits`, `journal_actions`, chacune avec la mention **RLS enabled**
(jamais *RLS disabled* ni *Unrestricted*).

## 3. Activer les comptes anonymes

1. Menu **Authentication** → **Sign In / Providers** (ou *Providers*).
2. Active **Allow anonymous sign-ins** → **Save**.
3. Dans la même page, laisse **Allow new users to sign up** activé.

Les limites anti-abus par défaut (menu **Authentication → Rate Limits** : 30 comptes anonymes par heure et par adresse IP)
conviennent : n'y touche pas.

## 4. Brancher l'appli sur le projet

1. Menu **Project Settings** (roue dentée) → **Data API** : copie la **Project URL** (`https://xxxx.supabase.co`).
2. **Project Settings → API Keys** : copie la clé **anon** (onglet *Legacy API keys*) ou la clé **publishable**
   (`sb_publishable_…`). ⚠️ Pas la clé *service_role* ni *secret*.
3. Sur GitHub, ouvre `config-en-ligne.js` → icône ✏️ (*Edit this file*) → remplis :
   ```js
   window.QUATUOR_CONFIG = {
     supabaseUrl: "https://xxxx.supabase.co",
     supabaseCle: "eyJhbGciOi… ou sb_publishable_…",
     telemetryDeckAppId: ""
   };
   ```
   → **Commit changes**. (Tu peux aussi m'envoyer l'URL et la clé anon : elles sont publiques, je les mettrai.)
4. Le site playquatuor.fr se met à jour tout seul ; pour l'appli iOS, lance un build Codemagic (voir la fin de ce guide).

Vérification : ouvre le jeu, joue une grille, puis dans Supabase **Table Editor → resultats** : ta partie apparaît.
**Authentication → Users** : un utilisateur *Anonymous* a été créé.

---

## Récapitulatif des tests automatiques

`npm test` (sur un ordinateur, ou ici par Claude) lance :
- `tests/rls-*.test.js` : la sécurité de la base (RLS) sur un vrai Postgres, avec plusieurs comptes de test ;
- `tests/synchro.test.js` : la synchronisation (mise à jour sans perte, hors ligne, 2e appareil…) ;
- `tests/calculs.test.js` : série, fusion des résultats, partage… ;
- `tests/app.test.js` : le jeu dans un vrai navigateur (Chromium), réseau coupé.
