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

## 5. Se connecter avec Apple (appli iOS)

### 5a. Apple Developer : activer la capacité « Sign In with Apple »
1. **https://developer.apple.com/account** → **Certificates, IDs & Profiles** → **Identifiers**.
2. Touche l'identifiant **fr.playquatuor.app**.
3. Dans la liste *Capabilities*, coche **Sign In with Apple** (laisse *Enable as a primary App ID*) → **Save** → **Confirm**.
4. Menu **Profiles** : le profil *App Store* de Quatuor apparaît maintenant **Invalid** (il ne contient pas la nouvelle capacité).
   Touche-le → **Remove**. Pas d'inquiétude : Codemagic en recrée un automatiquement au prochain build.

> Sans ces étapes, le build Codemagic échoue avec un message du type
> *Provisioning profile doesn't include the com.apple.developer.applesignin entitlement*.

### 5b. Supabase : activer Apple
1. **Authentication → Sign In / Providers → Apple** → active **Enable Sign in with Apple**.
2. **Client IDs** : `fr.playquatuor.app`
3. Laisse **Secret Key (for OAuth)** vide : il ne sert qu'à la connexion Apple sur le web, que nous n'utilisons pas.
4. **Save**.

### Pourquoi pas de bouton Apple sur le site web ?
Sur le web, Apple impose un « Services ID », la vérification du domaine et surtout une **clé secrète qui expire tous les 6 mois**
et se régénère avec un script sur ordinateur. C'est trop fragile pour un projet géré depuis un iPad : le bouton est donc
**masqué sur le web**. La progression web reste sauvegardée automatiquement (compte anonyme du navigateur).

### Comment ça marche pour le joueur
- 1er appareil : « Se connecter avec Apple » relie son compte (anonyme) à Apple → même compte, rien ne change.
- Nouvel appareil : l'appli crée d'abord un compte anonyme ; à la connexion Apple, elle **demande**
  « Récupérer ta progression existante ? ». Oui → il retrouve sa progression (les grilles jouées sur le nouvel appareil
  y sont ajoutées, meilleur résultat gardé) ; le compte anonyme vide est supprimé (fonction de l'étape 7).

---

## 6. Fonction serveur « supprimer-compte » (obligatoire pour Apple)

Elle permet à un joueur de supprimer son compte depuis l'appli (exigence de l'App Store) et sert aussi
à supprimer le compte anonyme vide quand un joueur récupère sa progression Apple.

1. Supabase → menu **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nom de la fonction : `supprimer-compte` (exactement).
3. Efface le code d'exemple, puis colle tout le contenu du fichier `supabase/functions/supprimer-compte/index.ts` du dépôt.
4. **Deploy function**.
5. Dans les réglages de la fonction (onglet **Details** / **Settings**), laisse **Verify JWT** (ou *Enforce JWT verification*) **activé**.

La fonction utilise la clé d'administration que Supabase lui fournit automatiquement : tu n'as **rien** à copier.

Vérification : dans l'appli, Paramètres › Compte › Supprimer mon compte (avec un compte de test) ; dans
**Authentication → Users**, l'utilisateur a disparu, et dans **Table Editor** ses lignes aussi.
> Si la suppression échoue avec une erreur 401 alors que tout semble correct, désactive **Verify JWT** dans
> les réglages de la fonction : elle vérifie elle-même le jeton du joueur.

## 7. Modération (signalements, pseudos)

- **Voir les signalements** : **SQL Editor** → `select * from signalements_a_traiter;`
  (pseudo signalé, pseudo actuel, auteur, nombre total de signalements du joueur). Ou **Table Editor → signalements**.
- **Effacer un pseudo inapproprié** (le joueur devra en choisir un autre) :
  ```sql
  update profils set pseudo = null where id = 'IDENTIFIANT-DU-JOUEUR';
  update signalements set traite = true where cible = 'IDENTIFIANT-DU-JOUEUR';
  ```
  (l'identifiant est la colonne `cible` de la vue des signalements).
- **Ajouter un mot interdit** : `insert into mots_interdits (mot, partout) values ('motsansaccent', true);`
  (`partout = true` : interdit même au milieu d'un pseudo ; `false` : seulement comme mot entier).
  Pense à me le dire pour que j'ajoute aussi le mot dans `js/pseudos.js` (vérification immédiate dans l'appli).
- **Supprimer un compte abusif** : **Authentication → Users** → ⋯ → **Delete user** (toutes ses données suivent).
- Les joueurs peuvent te signaler un problème à **playquatuor@gmail.com** (indiqué dans les CGU) :
  Apple exige que tu traites les signalements sous 24 h.

Limites anti-abus déjà en place : 20 demandes d'ami par jour (codes essayés compris), 200 amis, 10 signalements
et 10 changements de pseudo par jour, 50 blocages par jour, 500 favoris, tailles de champs contrôlées.
Ménage facultatif de temps en temps : `delete from journal_actions where le < now() - interval '7 days';`

---

## Récapitulatif des tests automatiques

`npm test` (sur un ordinateur, ou ici par Claude) lance :
- `tests/rls-*.test.js` : la sécurité de la base (RLS) sur un vrai Postgres, avec plusieurs comptes de test ;
- `tests/synchro.test.js` : la synchronisation (mise à jour sans perte, hors ligne, 2e appareil…) ;
- `tests/calculs.test.js` : série, fusion des résultats, partage… ;
- `tests/app.test.js` : le jeu dans un vrai navigateur (Chromium), réseau coupé.
