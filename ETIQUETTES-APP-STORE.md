# App Store Connect : réponses pour la confidentialité et la validation (version 1.2)

À remplir dans **App Store Connect → ton appli → Confidentialité de l'app** (*App Privacy*), depuis Safari.
Ces réponses correspondent exactement à ce que fait la version 1.2 (mode en ligne, phase 1).

## 1. Adresse de la politique de confidentialité
`https://playquatuor.fr/confidentialite.html`

## 2. « Collectez-vous des données à partir de cette app ? » → **Oui**

## 3. Types de données à cocher

| Catégorie (App Store) | Type | Pourquoi |
|---|---|---|
| **Coordonnées** (*Contact Info*) | **Adresse e-mail** (*Email Address*) | Seulement si le joueur se connecte : fournie par Apple (souvent une adresse relais) ou saisie pour recevoir un code de connexion |
| **Identifiants** (*Identifiers*) | **Identifiant utilisateur** (*User ID*) | Identifiant technique du compte Quatuor (anonyme) |
| **Contenu utilisateur** (*User Content*) | **Contenu de jeu** (*Gameplay Content*) | Résultats par grille, série, favoris |
| **Contenu utilisateur** (*User Content*) | **Autre contenu utilisateur** (*Other User Content*) | Pseudo, avatar, liste d'amis, signalements |
| **Données d'utilisation** (*Usage Data*) | **Interactions avec le produit** (*Product Interaction*) | Statistiques anonymes TelemetryDeck |

Ne coche **pas** : Nom, Téléphone, Adresse, Localisation, Contacts (la liste d'amis n'est pas le carnet d'adresses),
Historique de navigation, Achats, Données financières, Santé, Données sensibles, Diagnostics, Identifiant de l'appareil
(*Device ID*), Données publicitaires.

## 4. Détail pour chaque type

| Type | Utilisation (*purpose*) | Lié à l'identité ? (*linked to user*) | Utilisé pour le suivi ? (*tracking*) |
|---|---|---|---|
| Adresse e-mail | **Fonctionnalités de l'app** (*App Functionality*) | **Oui** | **Non** |
| Identifiant utilisateur | **Fonctionnalités de l'app** | **Oui** | **Non** |
| Contenu de jeu | **Fonctionnalités de l'app** | **Oui** | **Non** |
| Autre contenu utilisateur | **Fonctionnalités de l'app** | **Oui** | **Non** |
| Interactions avec le produit | **Analyses** (*Analytics*) | **Non** (identifiant aléatoire haché, jamais relié au compte) | **Non** |

Résultat affiché sur la fiche : *Données liées à vous* : Coordonnées, Contenu utilisateur, Identifiants ;
*Données non liées à vous* : Données d'utilisation. **Aucun suivi.**

## 5. Autres questions de la soumission

- **Suivi / App Tracking Transparency** : l'app ne suit pas les joueurs → pas de fenêtre ATT, réponse « Non ».
- **Connexion à un compte pour la revue** (*Sign-in required*) : **Non** — le compte est créé automatiquement,
  rien n'est à saisir. Note pour l'équipe de revue (*Review Notes*), à copier :
  > No login is required: an anonymous account is created automatically. Sign in with Apple or with an
  > email code is optional (Settings › Compte, or the "Moi" tab); "Se déconnecter" signs out. To test friends, open the "Moi" tab, choose a nickname, then add a friend
  > with a friend code (two devices or simulators). Account deletion: Settings › Compte › Supprimer mon compte
  > (double confirmation; deletes all server data). Users can block and report players from a friend's card;
  > nicknames are filtered automatically and reports are reviewed within 24 hours.
- **Suppression du compte** (règle 5.1.1(v)) : Paramètres › Compte › Supprimer mon compte ✔️
- **Contenu généré par les joueurs** (règle 1.2) : seulement les pseudos, visibles par les amis.
  Filtre automatique ✔️, signalement ✔️, blocage ✔️, CGU acceptées au choix du pseudo ✔️, contact publié ✔️.
- **Classification par âge** (*Age Rating*) : si le questionnaire demande la présence de contenu généré par les
  utilisateurs ou d'interactions entre utilisateurs, réponds **Oui** (pseudos visibles par les amis), **sans**
  messagerie ni discussion. Aucun autre changement par rapport à la version précédente.
- **Se connecter avec Apple** : proposé à côté de la connexion par code e-mail (sans réseau social tiers), conforme à la règle 4.8.
- **Chiffrement** : `ITSAppUsesNonExemptEncryption = false` est déjà dans l'app (HTTPS standard uniquement).
