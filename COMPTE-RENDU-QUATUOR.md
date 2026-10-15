# Quatuor : compte rendu complet du projet

*État au 11 octobre 2026. Dépôt GitHub : `polishman444/Quatuor` (branche `main`). Site : https://playquatuor.fr*

---

## 1. Le projet en bref

- **Quatuor** est un **jeu quotidien de culture générale** : 16 mots à ranger en **4 groupes de 4** qui ont un point commun. Chaque groupe trouvé révèle une **anecdote**.
- Il existe **deux versions avec le même code** :
  - **un site web installable** (PWA) sur https://playquatuor.fr, qui marche aussi hors ligne ;
  - **une appli iPhone** (Capacitor 8), compilée par **Codemagic** et distribuée par **TestFlight**. Elle s'appelle **Quatuor – Culture G** dans App Store Connect.
- Éditeur : Evan Chayani (aujourd'hui en tant que particulier), contact `playquatuor@gmail.com`.
- Version actuelle : **1.3**. L'appli **n'a jamais été publiée sur l'App Store** : la 1.3 sera la première version publique.
- **Technique** :
  - HTML, CSS et JavaScript, **sans framework** ;
  - **Supabase** pour le mode en ligne ;
  - **TelemetryDeck** pour les statistiques anonymes ;
  - **Google AdMob** pour les pubs.

---

## 2. Chronologie

| Dates | Étape |
|---|---|
| 30 sept. – 1er oct. 2026 | **Premières versions du jeu** : animations façon appli mobile, niveaux de difficulté, 32 grilles, carnet d'anecdotes favorites, tutoriel, panneaux à glisser. |
| 1er oct. | **Grilles déplacées dans `grilles.json`** (mises à jour sans republier l'appli), grille du jour par date, migration des données des joueurs. Mode **Grille au hasard**, **nouvel essai** sur une grille perdue, « Réessayer avant de voir la solution ». **Pages légales**, police hébergée localement, nom de domaine. **Indices 💡**, compte à rebours, calendrier séparé des grilles libres. |
| 1er – 2 oct. | **Mode Thèmes** (Géographie, Histoire, Animés, Sport) : 40 grilles de thème. Anti-répétition, écran « Tu as tout terminé ! ». |
| 2 – 3 oct. | **Nouvelles grilles** (12 libres, puis 30 GOAT). **Parties en cours sauvegardées**, accueil « Grille du jour terminée », grilles des 7 jours précédents. |
| 3 oct. | **Appli iOS** : Capacitor 8, Codemagic, TestFlight, rappels quotidiens. **Nouvelle navigation** par onglets (Jouer, Thèmes, Progrès, Moi), **sélection à plusieurs doigts**, **sons et vibrations**, **écran Paramètres complet**, **tutoriel guidé et bulles d'aide**. |
| 5 – 7 oct. | **Mode en ligne**, en 8 parties : comptes Supabase anonymes, connexion Apple, synchronisation, pseudo, amis, sécurité (blocage, signalement, suppression du compte), partage façon Wordle, statistiques TelemetryDeck, textes légaux. Puis **connexion par code e-mail**, Apple sur le site, se déconnecter. *(Pull requests #1 et #2)* |
| 8 oct. | **Bilan complet du jeu**, puis grosse mise à jour : plus de grille du jour facile, **119 nouvelles grilles**, grille bonus identique pour tous, **temps de jeu** affiché, vérificateur de doublons, restructuration du code, outil de version. *(Pull request #3)* |
| 10 – 11 oct. | **Pubs récompensées Google AdMob**, compte AdMob configuré, `app-ads.txt`, confidentialité App Store remplie, version 1.3. *(Pull request #4, fusionnée)* |

---

## 3. Le jeu : règles et modes

### Règles
- Le joueur touche 4 mots, puis **Valider**.
- **Erreurs autorisées selon la difficulté** :

  | Difficulté | Erreurs |
  |---|---|
  | Facile | 4 |
  | Moyen | 4 |
  | Difficile | 3 |
  | GOAT 🐐 | 2 |

- **Messages pendant la partie** : « Presque ! Un seul intrus » quand 3 mots sur 4 sont bons, « Déjà essayé » pour une combinaison déjà tentée.
- **Couleurs des groupes**, du plus facile au plus dur : menthe (Facile 🌱), abricot (Réflexion ⚡), framboise (Coriace 🔥), bleu nuit (Casse-tête 🧠).
- Chaque groupe trouvé s'affiche en bandeau avec son **anecdote**.

### Grille du jour
- C'est la **grille du calendrier** de la date locale du joueur. **Elle est toujours moyenne ou difficile**, jamais facile ni GOAT.
- **Grille bonus de secours**, au cas où un jour n'aurait pas de grille planifiée :
  - c'est une grille libre moyenne ou difficile ;
  - elle est **la même pour tous les joueurs**, car elle ne dépend que de la date ;
  - les règles sont dans `js/grilles.js`, partagées avec le vérificateur.
- **Seul le premier essai de la grille du jour compte** pour la série et les statistiques.
- **Compte à rebours** jusqu'à minuit (« Prochaine grille dans X h Y min »). L'appli recharge la nouvelle grille au retour après minuit.
- **Accueil « Grille du jour terminée ✓ »** quand elle est déjà faite, avec « Reprendre », « Grilles manquées » et « Au hasard ».

### Autres modes
- **Bonus** :
  - toutes les grilles libres, rangées par niveau, avec leur progression et « Jouer ▸ » ;
  - les **grilles des 7 jours précédents**, jouables mais sans effet sur la série ;
  - les grilles « À retenter ».
- **Hasard 🎲** : une grille pas encore faite, tirée au sort, au niveau de son choix.
- **Thèmes** : Géographie 🌍, Histoire 🏛️, Animés 🎌, Sport ⚽. Ce sont des grilles à part, qui ne comptent pas dans la série.
- **Anti-répétition** : « Grille suivante » et « Jouer » ne proposent jamais une grille déjà terminée. Quand tout est fini : écran « Tu as tout terminé ! ».
- **Tutoriel** sur une grille d'entraînement à part, sans effet sur les statistiques.

### Aides et seconde chance
- **Indices 💡** : jusqu'à **6 par grille**.
  - Le premier donne le nom du groupe le plus facile pas encore trouvé.
  - Les suivants mettent ses mots en évidence, un par un, jusqu'à 3.
  - Ensuite, on passe au groupe suivant.
  - Dans l'appli, **chaque indice se débloque avec une pub** (voir la partie 8).
- **Grille perdue** : la solution reste cachée. Le joueur peut **Réessayer** (gratuit) ou **Voir la solution** (une pub dans l'appli). Le nombre d'essais est enregistré : « Réussie au 2e essai ».
- **Parties en cours sauvegardées** et reprises à l'identique, temps de jeu compris.

### Résultats, série et partage
- **Écran de résultats** :
  - **le titre** : « Sans faute ! », « Réussie avec 2 indices », « Réussie au 2e essai ! », « Pas cette fois » ;
  - **le détail** : nombre d'erreurs, indices et **temps de jeu** (« Grille résolue en 3 min 07 s avec 1 erreur ») ;
  - **les statistiques** : parties, % de réussite, série 🔥, record ;
  - **« Ce que tu as appris aujourd'hui »** : les anecdotes.
- **Partage façon Wordle, sans spoiler** :
  - le titre, par exemple « Quatuor #42 » ;
  - une ligne de carrés de couleur par essai (autres couleurs en mode daltonien) ;
  - le temps, les indices et le n° d'essai, puis `playquatuor.fr`.
- **Carnet d'anecdotes ⭐** : favoris à garder, avec partage en **image 1080×1080**.

---

## 4. Le contenu

| | Nombre |
|---|---|
| Grilles au total | **247** |
| Grilles du jeu quotidien | **207** : 40 faciles, 62 moyennes, 61 difficiles, 44 GOAT |
| dont grilles libres (Bonus, Hasard) | **40 faciles, 40 moyennes, 40 difficiles**, 44 GOAT |
| dont grilles du calendrier | 43, du 2 octobre au **15 novembre 2026**, sans aucun jour vide |
| Grilles de thème | 40 : 4 thèmes × 10 grilles (3 faciles, 3 moyennes, 3 difficiles, 1 GOAT) |

- **Les anciennes grilles du jour faciles** (n°33, 36, 39, 44) sont devenues des grilles libres faciles.
- **Les 119 grilles du 8 octobre** évitent les catégories et les mots déjà utilisés. Les grilles moyennes et difficiles contiennent des **pièges** (un mot qui semble aller dans deux groupes), avec une seule solution possible.
- **Ajouter une grille** : on édite `grilles.json` en suivant le guide `COMMENT-AJOUTER-UNE-GRILLE.md`. Les grilles arrivent chez les joueurs **sans mise à jour de l'appli**.
- **Le vérificateur** (`npm run verifier`) :
  - **contrôle chaque grille** : format, 16 mots tous différents, identifiants uniques ;
  - **refuse une grille du jour facile ou GOAT**, et **signale comme erreur un jour sans grille dans les 7 prochains jours** ;
  - **liste les répétitions** : même nom de catégorie, groupe presque identique, mot trop fréquent. Il en reste **76 dans les anciennes grilles**, pas dans les nouvelles ;
  - **compte les grilles libres** par niveau.

---

## 5. Interface et expérience

- **Navigation** :
  - une barre d'onglets en bas : **Jouer** (Grille du jour, Bonus, Hasard), **Thèmes**, **Progrès** (série, statistiques, progression par niveau, carnet), **Moi** (profil, amis) ;
  - un engrenage en haut pour les **Paramètres**.
- **Animations** :
  - les tuiles qui rebondissent, le mélange animé ;
  - un groupe trouvé qui « vole » vers son bandeau, avec des étincelles ;
  - des confettis pour une grille sans faute ;
  - une transition entre les grilles ;
  - **le réglage « Réduire les animations » du téléphone est respecté**.
- **Sélection à plusieurs doigts** : on peut toucher plusieurs mots en même temps. Ni zoom ni défilement sur la grille.
- **Sons et vibrations** :
  - les sons sont générés directement par le jeu, sans fichier audio ;
  - **le mode silencieux est respecté** et la musique du joueur n'est jamais coupée.
- **Prise en main** :
  - un **tutoriel guidé**, avec un projecteur sur l'élément à toucher : trouver un groupe, faire une erreur, prendre un indice, finir la grille ;
  - des **bulles d'aide** qui n'apparaissent qu'une fois chacune.
- **Paramètres** :
  - **Apparence** : thème clair, sombre ou automatique ; grand texte ; **mode daltonien** (autres couleurs et un symbole par groupe ● ▲ ■ ◆) ;
  - **Sons et vibrations** ;
  - **Rappel quotidien**, dans l'appli : l'heure, et l'alerte « Série en danger » à 20 h ;
  - **Aide** : revoir le tuto, comment jouer ;
  - **Compte** : connexion, joueurs bloqués, suppression du compte ;
  - **Données** : **Mes choix publicitaires**, statistiques anonymes, réinitialiser la progression ;
  - **À propos** : version, contact, pages légales.

---

## 6. L'appli iPhone

- **Base technique** : **Capacitor 8.5**, avec Swift Package Manager (sans CocoaPods). Identifiant `fr.playquatuor.app`, iOS 15 minimum, portrait.
- **Ce que l'appli fait en plus du site** :
  - **grilles chargées depuis le site**, avec une adresse de secours sur GitHub et une copie dans l'appli ;
  - **données du joueur gardées dans le stockage natif d'iOS**, avec migration automatique ;
  - **retours haptiques** et **feuille de partage native** (texte et image) ;
  - **pages légales** dans le navigateur intégré, **barre d'état** claire ou sombre, **écran de lancement** ;
  - **rappels quotidiens** (notifications locales). La permission n'est demandée qu'après une première grille réussie. Pas de rappel si la grille du jour est déjà faite ;
  - **Sign In with Apple**, avec un plugin natif maison ;
  - **pubs récompensées AdMob**.
- **Compilation** : **Codemagic**. Le numéro de build augmente tout seul et chaque compilation est envoyée sur TestFlight. Elle se lance à la main, ou automatiquement à chaque envoi sur la branche de la 1.3. Guide : `GUIDE-TESTFLIGHT.md`.
- **Ce qui est dans `Info.plist`** : l'ID d'appli AdMob, le texte de la demande de suivi d'Apple, la déclaration « chiffrement standard uniquement », et la permission photos pour enregistrer l'image d'une anecdote.

---

## 7. Le mode en ligne (Supabase)

- **Comptes** : un **compte anonyme est créé automatiquement**, sans rien demander. Le jeu marche toujours sans réseau : les données de l'appareil restent la référence.
- **Se connecter**, pour retrouver sa progression sur un autre appareil :
  - **avec Apple**, dans l'appli. Sur le site, c'est prêt mais **désactivé** (`appleWeb: false`) tant que le « Services ID » Apple n'est pas configuré ;
  - **avec un code à 6 chiffres envoyé par e-mail**, sur le site et dans l'appli ;
  - si le compte existe déjà, l'appli demande « Récupérer ta progression existante ? ». Les grilles de l'appareil sont alors ajoutées, en gardant le meilleur résultat ;
  - **« Se déconnecter »** remet l'appareil à zéro, sans rien perdre sur le compte.
- **Synchronisation** des résultats, statistiques, série et favoris. La série est recalculée de la même façon côté jeu et côté serveur.
- **Pseudo** :
  - 3 à 16 caractères, avec une proposition aléatoire 🎲 ;
  - **filtre des pseudos insultants**, identique côté jeu et côté serveur ;
  - unique, et 10 changements par jour au maximum.
- **Profil** : 16 avatars, un **code ami** à 6 caractères, la série et le record.
- **Amis** :
  - demande par code, accepter, refuser, annuler, retirer, jusqu'à 200 amis ;
  - pour la grille du jour, on ne voit le résultat d'un ami qu'**après avoir fini la sienne** : pas de spoiler.
- **Sécurité** :
  - **bloquer** un joueur, sans qu'il le sache ; **signaler** (modération dans Supabase) ;
  - **supprimer son compte**, avec double confirmation, grâce à une fonction serveur sécurisée ;
  - limites anti-abus par jour ;
  - règles d'accès (RLS) sur toutes les tables.
- **Les fichiers de la base** (`supabase/migrations/`) :

  | Fichier | Contenu |
  |---|---|
  | 0001 | Comptes et synchronisation |
  | 0002 | Pseudos |
  | 0003 | Amis |
  | 0004 | Sécurité |
  | 0005 | Ménage mensuel automatique |
  | 0006 | Jusqu'à 6 indices par grille (au lieu de 2), **lancé le 11 octobre** |

- **E-mails** : le guide prévoit l'envoi des codes par **Resend**. C'est **à vérifier** : je ne sais pas si c'est configuré.
- Guide : `SETUP-EN-LIGNE.md`.

---

## 8. Les pubs récompensées (Google AdMob)

### Comment ça marche dans le jeu
- **Uniquement dans l'appli iPhone.** Aucune pub sur le site, dans le tutoriel, en bannière, ni imposée.
- **Le joueur choisit toujours** de regarder une pub :
  - **pour chaque indice 💡** (un petit ▶ sur le bouton le signale) ;
  - **pour « Voir la solution 📺 »** d'une grille perdue. « Réessayer » reste gratuit.
- **La première fois**, un écran explique le principe : « Une courte pub ? ».
- **Pub fermée avant la fin** : pas de récompense, et un message l'indique.
- **Aucune pub disponible** (pas de réseau, plus de pub en stock) : la récompense est donnée quand même, pour ne jamais bloquer le joueur.
- **Au lancement**, après le tutoriel, l'appli affiche :
  1. le formulaire de **consentement RGPD de Google** ;
  2. le **message explicatif** ;
  3. la fenêtre d'Apple « **Autoriser le suivi** ».
- Le joueur peut changer d'avis dans **Paramètres › Données › Mes choix publicitaires**.
- Le code est dans `js/pubs.js`, avec le plugin `@capacitor-community/admob`.

### Le compte AdMob (fait le 11 octobre)
- ✅ Compte créé, appli **Quatuor – Culture G** (iOS) ajoutée.
- ✅ **ID d'appli** : `ca-app-pub-1202848161795834~3903065414`, dans `Info.plist`.
- ✅ **Bloc d'annonces « Indice ou solution »** (avec récompense, 1 indice) : `ca-app-pub-1202848161795834/1142179866`, dans `config-en-ligne.js`.
- ✅ **Message de consentement RGPD** publié (français et anglais, avec bouton « Ne pas consentir »). **Partenaires publicitaires** choisis.
- ✅ **Message explicatif IDFA** publié.
- ✅ **`app-ads.txt`** à la racine du site : `google.com, pub-1202848161795834, DIRECT, f08c47fec0942fa0`.
- ⚠️ L'appli est encore en **mode test** (`test: true`) : elle affiche des pubs de démonstration « Test Ad », sans revenu.
- ⏳ **Le profil de paiement AdMob n'est pas rempli.** Tant qu'il ne l'est pas, Google n'examine pas l'appli et ne diffuse pas de vraies pubs.

Guide : `SETUP-PUBS.md`.

---

## 9. Les statistiques anonymes (TelemetryDeck)

- **Ce qui est envoyé** :
  - l'ouverture de l'appli, une fois par jour ;
  - le tutoriel : vu, passé, terminé ;
  - les grilles commencées, réussies ou ratées (type, erreurs, indices, temps, n° d'essai) ;
  - les partages, les amis ajoutés, les connexions, et les pubs (pour quoi faire, et comment ça s'est terminé).
- **Rien de personnel** :
  - aucun mot de grille, aucun pseudo, aucun e-mail ;
  - un identifiant d'appareil aléatoire et haché, jamais relié au compte.
- **Désactivable** dans Paramètres › Données. Rien n'est envoyé en développement local.

---

## 10. Côté légal et conformité

- **Pages en ligne** : `mentions-legales.html`, `confidentialite.html` et `cgu.html`. Elles sont à jour avec le compte en ligne, l'e-mail, Apple, TelemetryDeck et **AdMob** : publicités, consentement, identifiant publicitaire, durées de conservation.
- **RGPD** :
  - données hébergées par Supabase dans l'Union européenne (région de Paris) ;
  - droits des joueurs expliqués, suppression du compte dans l'appli ;
  - consentement publicitaire demandé par le formulaire de Google.
- **App Store Connect, déjà fait** :
  - ✅ **Confidentialité de l'app** remplie : 11 types de données, avec le **suivi publicitaire** (localisation approximative, identifiant de l'appareil, interactions, données publicitaires) ;
  - ✅ **URL marketing** : `https://playquatuor.fr` ;
  - ✅ **Version renommée en 1.3**.
- **Réponses et notes prêtes** pour la revue d'Apple, la classification par âge, le suivi (ATT) et les pubs : `ETIQUETTES-APP-STORE.md`.
- **Règles d'Apple respectées** :
  - suppression du compte dans l'appli (5.1.1(v)) ;
  - modération des pseudos (1.2) : filtre, signalement, blocage ;
  - Sign In with Apple proposé (4.8) ;
  - pubs uniquement au choix du joueur.
- **Statut juridique** : une **micro-entreprise** sera nécessaire quand les pubs rapporteront de l'argent régulièrement. **Mieux vaut la créer avant de remplir le profil de paiement AdMob**, car le type « Individuel » ou « Entreprise » ne pourra plus être changé. Ensuite, il faudra mettre à jour les mentions légales avec le SIRET.

---

## 11. Technique et qualité

- **Organisation du code** :

  | Fichier | Rôle |
  |---|---|
  | `index.html` | La page, environ 80 lignes |
  | `css/quatuor.css` | Le style |
  | `js/jeu.js` | Le jeu, environ 2 200 lignes |
  | `js/grilles.js` | Règles de la grille du jour et de la grille bonus |
  | `js/calculs.js` | Statistiques, série, partage, durée |
  | `js/en-ligne.js` | Mode en ligne |
  | `js/pseudos.js` | Pseudos et codes ami |
  | `js/telemetrie.js` | Statistiques anonymes |
  | `js/pubs.js` | Pubs |
  | `grilles.json` | Les grilles |
  | `sw.js` | Hors ligne |
  | `outils/` | Vérificateur, copie vers l'appli, icônes, **outil de version** |

- **Tests** : **99 tests automatiques** (`npm test`), et tous passent. Ils couvrent :
  - les règles d'accès de la base, sur un vrai Postgres en mémoire ;
  - la synchronisation, les amis, la sécurité, la suppression du compte ;
  - le partage, les statistiques, les pubs, les règles des grilles et le vérificateur ;
  - des parcours complets dans un vrai navigateur, Chromium, y compris en **appli iOS simulée**.
- **Version** : `npm run nouvelle-version -- 1.4` met à jour d'un coup package.json, le site, l'appli iOS et le cache hors ligne.
- **Hors ligne** : le service worker du site va d'abord chercher sur le réseau, et se rabat sur le cache sans connexion.
- **Problèmes relevés lors du bilan du 8 octobre, et corrigés** :
  - le calendrier allait être vide après le 12 octobre ;
  - la grille bonus différait d'un joueur à l'autre ;
  - les niveaux étaient déséquilibrés (44 GOAT pour 13 faciles) ;
  - il n'y avait pas de détection des répétitions ;
  - le texte de la bulle « mode en ligne bientôt » était périmé ;
  - les numéros de version étaient éparpillés ;
  - `index.html` était trop gros.

---

## 12. Où on en est (11 octobre au soir)

### ✅ Fait
- Tout ce qui précède. Les **pull requests #1 à #4 sont fusionnées dans `main`**, et le site est à jour.
- La migration Supabase **0006** a été lancée.
- AdMob est configuré, sauf le paiement. La confidentialité App Store et l'URL marketing sont remplies.

### 🔄 En cours
- **Compilation Codemagic** de `main`, pour tester la 1.3 sur TestFlight. Ce qu'il faut vérifier :
  - le formulaire de Google, puis la fenêtre d'Apple au lancement ;
  - 💡 → « Une courte pub ? » → une pub « Test Ad » → l'indice ;
  - une pub fermée avant la fin → pas d'indice ;
  - « Voir la solution 📺 » sur une grille perdue ;
  - Paramètres › Mes choix publicitaires.

### ⏳ Reste à faire avant de publier la 1.3
1. **Tester sur TestFlight**, à partir de la liste ci-dessus.
2. **Créer la micro-entreprise**, puis **remplir le profil de paiement AdMob**, en choisissant le type « Entreprise ».
3. **Compléter la fiche App Store**, puisque c'est la première publication :
   - captures d'écran iPhone ;
   - description, sous-titre et mots-clés (Claude peut les écrire) ;
   - URL d'assistance ;
   - classification par âge ;
   - catégorie (Jeux › Mots ou Trivia) ;
   - prix : gratuit ;
   - notes pour l'équipe de revue (texte prêt dans `ETIQUETTES-APP-STORE.md`).
4. **Passer l'appli en vraies pubs** (`test: false` dans `config-en-ligne.js`), à demander à Claude.
5. **Lancer la compilation de `main`** dans Codemagic, choisir ce build dans la version 1.3, puis **Soumettre pour vérification**.
6. Après la mise en vente : vérifier dans AdMob que `app-ads.txt` est bien détecté (jusqu'à 7 jours), et **relier la fiche App Store** à l'appli AdMob.

### 💡 Idées et chantiers pour plus tard
- **Ajouter des grilles du jour après le 15 novembre.** Le vérificateur signalera une erreur dès qu'il manquera une grille dans les 7 prochains jours.
- **Corriger les 76 répétitions** des anciennes grilles, si on veut.
- **Duels** et **Classement** : affichés « Bientôt » dans l'onglet Moi.
- **Premium éventuel** : l'emplacement `peutJouerArchive` est prêt pour réserver les grilles anciennes, et une option « sans pub » serait possible.
- **Connexion Apple sur le site** : configurer le « Services ID » Apple, puis passer `appleWeb: true`.
- **Lancer les tests automatiquement sur GitHub** à chaque modification (prévu « plus tard »).
- **Une appli Android** : aujourd'hui, seul le site sert sur Android.
- **Pubs sur le site** (AdSense) : pas prévu pour l'instant.

---

## 13. Guides et fichiers de référence

| Fichier | Sujet |
|---|---|
| `README.md` | Vue d'ensemble du dépôt |
| `COMMENT-AJOUTER-UNE-GRILLE.md` | Ajouter ou planifier une grille |
| `SETUP-EN-LIGNE.md` | Supabase, Apple, e-mails (Resend) |
| `SETUP-PUBS.md` | AdMob, étape par étape, et avancement |
| `ETIQUETTES-APP-STORE.md` | Confidentialité App Store et notes pour la revue |
| `GUIDE-TESTFLIGHT.md` | Codemagic et TestFlight |
| `config-en-ligne.js` | Réglages publics (Supabase, TelemetryDeck, AdMob, `appleWeb`) |
