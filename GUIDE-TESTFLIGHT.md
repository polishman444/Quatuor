# Envoyer Quatuor sur TestFlight, sans Mac

Ce guide explique, pas à pas, comment compiler l'appli iOS de Quatuor dans le cloud avec **Codemagic** et l'envoyer sur **TestFlight** pour la faire tester sur de vrais iPhone. Aucun Mac n'est nécessaire : tout se fait dans le navigateur.

Tu as besoin de :

- ton compte **Apple Developer** (payant, 99 €/an), déjà actif ;
- l'appli déjà créée dans **App Store Connect** avec l'identifiant `fr.playquatuor.app` (voir l'étape 1 si ce n'est pas fait) ;
- ton compte **GitHub** (le dépôt `polishman444/Quatuor`).

Compte environ 1 heure la première fois. Ensuite, chaque nouvelle version ne demande qu'un clic.

> 🔒 **Règle d'or** : le fichier `.p8` (ta clé API) et tout certificat ne doivent **jamais** être envoyés sur GitHub. Ils se déposent uniquement dans Codemagic. Le fichier `.gitignore` du dépôt les bloque déjà par sécurité.

---

## Étape 1 — Vérifier l'appli dans App Store Connect

1. Va sur <https://appstoreconnect.apple.com> et connecte-toi.
2. Clique sur **Apps**.
3. Si l'appli **Quatuor** existe déjà avec l'identifiant de paquet (« Bundle ID ») `fr.playquatuor.app`, passe à l'étape 2.
4. Sinon : clique sur le **+** bleu, puis **Nouvelle app** :
   - Plateformes : **iOS**
   - Nom : **Quatuor** (s'il est déjà pris sur l'App Store, ajoute un sous-titre, par exemple « Quatuor – Culture G »)
   - Langue principale : **Français**
   - Identifiant de paquet : choisis **fr.playquatuor.app** dans la liste
   - SKU : un code libre, par exemple `quatuor-ios`
   - Accès : **Accès complet**
   - Clique sur **Créer**.

---

## Étape 2 — Créer la clé API App Store Connect

Cette clé permet à Codemagic de signer l'appli et de l'envoyer sur TestFlight à ta place.

1. Dans App Store Connect, clique sur **Utilisateurs et accès**.
2. Ouvre l'onglet **Intégrations**, puis **App Store Connect API** (onglet « Clés d'équipe »).
   - La première fois, Apple te demande d'accepter les conditions : clique sur **Demander l'accès**, puis valide.
3. Clique sur **Générer une clé API** (ou le **+**).
   - Nom : `Codemagic`
   - Accès : **App Manager**
   - Clique sur **Générer**.
4. Note précieusement ces trois informations :
   - **Issuer ID** : affiché en haut de la page (un long code avec des tirets) ;
   - **Key ID** : affiché sur la ligne de ta clé (10 caractères, par exemple `AB12CD34EF`) ;
   - le **fichier .p8** : clique sur **Télécharger la clé API**.

> ⚠️ Apple ne permet de télécharger le fichier `.p8` **qu'une seule fois**. Range-le dans un endroit sûr (gestionnaire de mots de passe, clé USB…). Si tu le perds, il faudra révoquer la clé et en créer une nouvelle.

---

## Étape 3 — Créer un compte Codemagic et relier le dépôt GitHub

1. Va sur <https://codemagic.io/signup> et choisis **Sign up with GitHub**.
2. Autorise Codemagic à accéder à ton compte GitHub. Quand GitHub te le demande, donne-lui accès au dépôt **polishman444/Quatuor** (« Only select repositories » → choisis `Quatuor`).
3. Dans Codemagic, clique sur **Add application**.
4. Choisis **GitHub**, puis le dépôt **Quatuor**.
5. Type de projet : **Other** (Codemagic lira automatiquement le fichier `codemagic.yaml` du dépôt). Clique sur **Finish: Add application**.

---

## Étape 4 — Ajouter la clé API dans Codemagic

1. Dans Codemagic, clique sur **Teams** (menu de gauche), puis sur ton équipe (« Personal Account »).
2. Ouvre **Team integrations** (ou **Integrations**), puis **Developer Portal** → **Connect** (ou **Manage keys** → **Add key**).
3. Remplis :
   - **App Store Connect API key name** : `Quatuor App Store Connect`
     (⚠️ exactement ce nom, avec les mêmes majuscules et espaces : c'est celui écrit dans `codemagic.yaml`)
   - **Issuer ID** : celui noté à l'étape 2
   - **Key ID** : celui noté à l'étape 2
   - **API key** : choisis ton fichier **.p8**
4. Clique sur **Save**.

---

## Étape 5 — Préparer la signature de l'appli (une seule fois)

Apple exige que chaque appli soit « signée » avec un certificat et un profil. Codemagic s'occupe de la signature, mais il faut d'abord lui fournir ces deux éléments. Tout se fait dans le navigateur.

### 5a. Le certificat de distribution (dans Codemagic)

1. Dans Codemagic : **Teams** → ton équipe → **codemagic.yaml settings** → **Code signing identities**.
2. Onglet **iOS certificates** → **Generate certificate**.
3. Choisis la clé `Quatuor App Store Connect`, le type **Apple Distribution**, et donne-lui un nom (par exemple `quatuor-distribution`).
4. Clique sur **Generate**.
   - Codemagic crée le certificat chez Apple et le garde pour toi. S'il te propose de télécharger le certificat (`.p12`) et son mot de passe, range-les dans un endroit sûr, **jamais** sur GitHub.

> Si Apple refuse parce que tu as déjà trop de certificats de distribution, supprime un ancien certificat inutilisé sur <https://developer.apple.com/account/resources/certificates/list>, puis recommence.

### 5b. Le profil de distribution (sur le site Apple Developer)

1. Va sur <https://developer.apple.com/account/resources/profiles/list>.
2. Clique sur le **+** bleu.
3. Dans **Distribution**, choisis **App Store Connect**, puis **Continue**.
4. App ID : choisis **fr.playquatuor.app**, puis **Continue**.
5. Certificat : coche le certificat **Apple Distribution** créé à l'étape 5a (le plus récent), puis **Continue**.
6. Nom du profil : `Quatuor App Store`, puis **Generate**. (Inutile de le télécharger.)

### 5c. Récupérer le profil dans Codemagic

1. Retourne dans Codemagic : **Code signing identities** → onglet **iOS provisioning profiles**.
2. Clique sur **Fetch profiles**, choisis la clé `Quatuor App Store Connect`.
3. Coche le profil **Quatuor App Store** puis **Download selected**.
4. Vérifie que le profil apparaît dans la liste, avec une coche verte indiquant que le certificat correspondant est bien présent.

C'est terminé : à chaque compilation, la ligne `ios_signing` du fichier `codemagic.yaml` retrouve automatiquement ce certificat et ce profil.

> Le profil expire au bout d'un an : il suffira alors de refaire les étapes 5b et 5c.

---

## Étape 6 — Lancer la compilation

1. Dans Codemagic, ouvre l'appli **Quatuor**.
2. Clique sur **Start new build**.
3. Branche : **main**. Workflow : **Quatuor iOS → TestFlight**.
4. Clique sur **Start new build**.

Codemagic va alors, tout seul :

1. installer les dépendances (`npm ci`) ;
2. vérifier `grilles.json` ;
3. copier les fichiers du jeu dans `www/` et synchroniser Capacitor (`npx cap sync ios`) ;
4. choisir un **numéro de build** plus grand que le dernier envoyé sur TestFlight ;
5. compiler et signer l'appli ;
6. l'envoyer sur **App Store Connect / TestFlight**.

Compte 10 à 20 minutes. Un ✅ vert indique que tout s'est bien passé. En cas d'échec (❌), clique sur l'étape en rouge pour lire le message d'erreur.

> Après l'envoi, Apple « traite » la version pendant 10 à 30 minutes. Tu reçois un e-mail quand elle est prête. Grâce à la ligne `ITSAppUsesNonExemptEncryption = false` (l'appli n'utilise que le HTTPS standard), Apple ne pose pas de question sur le chiffrement : la version est directement disponible pour les tests.

---

## Étape 7 — Inviter des testeurs sur TestFlight

### Testeurs internes (toi et ton équipe, jusqu'à 100 personnes, sans validation d'Apple)

1. Dans App Store Connect : **Apps** → **Quatuor** → onglet **TestFlight**.
2. Dans le menu de gauche, à côté de **Tests internes**, clique sur le **+** pour créer un groupe (par exemple `Équipe`).
3. Ajoute des testeurs : ils doivent d'abord être membres de ton compte (**Utilisateurs et accès** → **+**, rôle « Developer » ou « Marketing » suffisent).
4. Ajoute la version (le « build ») au groupe si elle n'y est pas automatiquement.

### Testeurs externes (amis, famille… jusqu'à 10 000 personnes)

1. Onglet **TestFlight** → à côté de **Tests externes**, clique sur le **+** et crée un groupe (par exemple `Bêta-testeurs`).
2. Ajoute le build au groupe.
3. Remplis les informations demandées (description de l'appli, adresse e-mail de contact, « Quoi tester »).
4. Ajoute les testeurs par adresse e-mail, ou active un **lien public** à partager.
5. La première version destinée aux testeurs externes passe une courte vérification d'Apple (souvent moins de 24 h).

### Côté testeur

1. Installer l'appli **TestFlight** depuis l'App Store sur l'iPhone.
2. Ouvrir l'invitation reçue par e-mail (ou le lien public) et toucher **Installer**.

---

## Pour les versions suivantes

1. Modifie le jeu comme d'habitude (fichiers à la racine du dépôt) et publie sur `main` : la PWA se met à jour comme avant.
2. Dans Codemagic : **Start new build**. Le numéro de build augmente tout seul.

Bon à savoir :

- **Les grilles n'ont pas besoin d'une nouvelle version de l'appli** : l'appli télécharge `grilles.json` en ligne à chaque lancement (sur `playquatuor.fr`, ou sur `polishman444.github.io` en secours). Une nouvelle compilation n'est nécessaire que si tu modifies `index.html`, les pages légales, les icônes, etc.
- Pour changer le numéro de version affiché (par exemple **1.1**), modifie `MARKETING_VERSION` dans `ios/App/App.xcodeproj/project.pbxproj` (2 occurrences).
- Pour compiler automatiquement à chaque envoi sur `main`, décommente la partie `events` dans `codemagic.yaml`.
- Pour régénérer l'icône et l'écran de lancement après une modification du logo : `npm install` puis `npm run assets` (sur n'importe quel ordinateur, pas besoin de Mac).

## En cas de problème

| Message ou symptôme | Que faire |
| --- | --- |
| `No matching profiles found` / erreur de signature | Refais les étapes 5a à 5c et vérifie que le profil utilise bien le certificat présent dans Codemagic. |
| `Integration ... not found` | Le nom de la clé dans Codemagic (étape 4) doit être exactement `Quatuor App Store Connect`. |
| `The bundle version must be higher than the previously uploaded version` | Relance simplement la compilation : le numéro est recalculé. |
| `Authentication credentials are missing or invalid` | Vérifie l'Issuer ID, le Key ID et le fichier `.p8` (étape 4), et que la clé a l'accès « App Manager ». |
| Le build n'apparaît pas dans TestFlight | Attends la fin du traitement par Apple (e-mail), puis actualise la page. |
