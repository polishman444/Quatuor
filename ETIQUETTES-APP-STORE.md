# App Store Connect : réponses pour la confidentialité et la validation (version 1.3, avec pubs)

À remplir dans **App Store Connect → ton appli → Confidentialité de l'app** (*App Privacy*), depuis Safari.
Ces réponses correspondent à la version avec les pubs récompensées Google AdMob (mode en ligne + pubs).
> ⚠️ Vérifie aussi la page officielle de Google, qui fait foi pour la partie AdMob :
> *« Préparer votre application pour les informations sur la confidentialité de l'App Store »* (aide AdMob → SDK Google Mobile Ads, iOS).

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
| **Données d'utilisation** (*Usage Data*) | **Interactions avec le produit** (*Product Interaction*) | Statistiques anonymes TelemetryDeck, et Google AdMob (interactions avec les pubs) |
| **Données d'utilisation** (*Usage Data*) | **Données publicitaires** (*Advertising Data*) | Google AdMob : pubs vues |
| **Identifiants** (*Identifiers*) | **Identifiant de l'appareil** (*Device ID*) | Google AdMob : identifiant publicitaire (IDFA, seulement si le joueur l'autorise) et identifiant fournisseur |
| **Localisation** (*Location*) | **Localisation approximative** (*Coarse Location*) | Google AdMob : déduite de l'adresse IP (pays, région) |
| **Diagnostics** | **Données de plantage**, **Données de performances**, **Autres données de diagnostic** | Google AdMob : fonctionnement du SDK |

Ne coche **pas** : Nom, Téléphone, Adresse, Localisation précise, Contacts (la liste d'amis n'est pas le carnet d'adresses),
Historique de navigation, Achats, Données financières, Santé, Données sensibles.

## 4. Détail pour chaque type

| Type | Utilisation (*purpose*) | Lié à l'identité ? (*linked to user*) | Utilisé pour le suivi ? (*tracking*) |
|---|---|---|---|
| Adresse e-mail | **Fonctionnalités de l'app** (*App Functionality*) | **Oui** | **Non** |
| Identifiant utilisateur | **Fonctionnalités de l'app** | **Oui** | **Non** |
| Contenu de jeu | **Fonctionnalités de l'app** | **Oui** | **Non** |
| Autre contenu utilisateur | **Fonctionnalités de l'app** | **Oui** | **Non** |
| Interactions avec le produit | **Analyses** (*Analytics*) et **Publicité de tiers** (*Third-Party Advertising*) | **Non** | **Oui** (pubs Google) |
| Données publicitaires | **Publicité de tiers** | **Non** | **Oui** |
| Identifiant de l'appareil | **Publicité de tiers**, **Analyses** | **Non** | **Oui** |
| Localisation approximative | **Publicité de tiers**, **Analyses** | **Non** | **Oui** |
| Données de plantage, de performances, autres diagnostics | **Fonctionnalités de l'app**, **Analyses** | **Non** | **Non** |

Résultat affiché sur la fiche : *Données utilisées pour vous suivre* : Identifiants, Données d'utilisation, Localisation ;
*Données liées à vous* : Coordonnées, Contenu utilisateur, Identifiants ;
*Données non liées à vous* : Données d'utilisation, Diagnostics, Localisation.

## 5. Autres questions de la soumission

- **Suivi / App Tracking Transparency** : **Oui**. La fenêtre d'Apple est affichée après le formulaire de consentement
  de Google, avant toute pub ; le texte est dans `Info.plist` (`NSUserTrackingUsageDescription`). Refuser ne bloque rien.
- **Publicités** : uniquement des pubs **récompensées**, que le joueur choisit de regarder (indice, solution d'une grille
  perdue). Note pour l'équipe de revue, à ajouter :
  > Ads are rewarded videos only, always opt-in: tap the 💡 hint button or "Voir la solution 📺" after losing a grid.
  > No ad is ever shown without a user action. If no ad is available, the reward is granted anyway.
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
