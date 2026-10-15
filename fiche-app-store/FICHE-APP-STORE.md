# Fiche App Store de Quatuor (version 1.3, première publication)

Tout est à remplir dans **App Store Connect → Quatuor – Culture G → Distribution**, depuis Safari.
Les champs marqués 📋 se copient-collent tels quels.

---

## 1. Page de la version : « 1.3 Prêt pour soumission » (menu de gauche, en haut)

### Captures d'écran (iPhone 6,9")
Les 5 images de ce dossier, **dans l'ordre**. Elles sont au format 1320 × 2868, exigé pour l'iPhone 6,9 pouces :
1. `capture-1.png` : « 16 mots, 4 groupes, trouve ce qui les relie ! »
2. `capture-2.png` : « Une anecdote à chaque groupe trouvé »
3. `capture-3.png` : « Une nouvelle grille chaque jour »
4. `capture-4.png` : « Des thèmes pour tous les goûts »
5. `capture-5.png` : « Ta série, tes stats et ton carnet d'anecdotes »

Glisse-les dans la zone **iPhone 6,9"**. Apple les réutilise automatiquement pour les autres tailles d'iPhone.

### Captures d'écran (iPad 13")
L'appli fonctionne aussi sur iPad, donc Apple demande aussi des captures iPad. Les 5 images
`capture-ipad-1.png` à `capture-ipad-5.png`, au format 2064 × 2752, vont dans la zone **iPad 13"**, dans le même ordre.

### Texte promotionnel (170 caractères max, modifiable à tout moment) 📋
```
Chaque jour, une nouvelle grille : range 16 mots en 4 groupes, découvre une anecdote à chaque groupe trouvé et fais grimper ta série 🔥
```

### Description 📋
```
Quatuor, c'est le petit défi de culture générale de ta journée.

16 mots. 4 groupes de 4. Un seul point commun par groupe. À toi de trouver lequel !

Planètes, peintres, fromages, héros de BD, capitales, mots d'origine arabe… Les liens sont parfois évidents, parfois bien cachés, et il y a souvent un piège : un mot qui semble aller dans deux groupes. Attention, les erreurs sont comptées.

UNE NOUVELLE GRILLE CHAQUE JOUR
• Une grille du jour, la même pour tout le monde
• Fais grimper ta série 🔥 et bats ton record
• Rattrape les grilles des 7 derniers jours

UNE ANECDOTE À CHAQUE GROUPE TROUVÉ
• Chaque groupe trouvé révèle une anecdote vraie et surprenante
• Garde tes préférées dans ton carnet ⭐ et partage-les en image

DES CENTAINES DE GRILLES
• 4 niveaux : Facile, Moyen, Difficile et GOAT 🐐 pour les experts
• Des grilles bonus à faire à ton rythme, ou au hasard 🎲
• Des thèmes : Géographie, Histoire, Animés, Sport

JOUE AVEC TES AMIS
• Ajoute tes amis avec leur code et compare vos séries
• Vois s'ils ont réussi la grille du jour, sans spoiler
• Partage ton résultat façon carrés de couleur, sans dévoiler les réponses

POUR TOUS
• Indices 💡 si tu bloques
• Mode sombre, grand texte, mode daltonien
• Rappel quotidien (facultatif)
• Fonctionne même sans connexion
• Ta progression est sauvegardée, même si tu changes de téléphone

Quatuor est gratuit. Si tu le souhaites, tu peux regarder une courte pub pour obtenir un indice ou découvrir la solution d'une grille ratée. Jamais de pub imposée pendant ta partie.

Une question, une idée de grille ? playquatuor@gmail.com
```

### Mots-clés (100 caractères max) 📋
```
mots,énigme,quiz,culture générale,casse-tête,logique,anecdote,jeu du jour,trivia,défi,devinette
```
*(95 caractères. Inutile de répéter « Quatuor » ou « culture G », qui sont déjà dans le nom.)*

### URL d'assistance 📋
```
https://playquatuor.fr/mentions-legales.html
```
*(Cette page affiche l'adresse e-mail de contact, comme Apple le demande.)*

### URL marketing
`https://playquatuor.fr` (déjà fait)

### Version
`1.3` (déjà fait)

### Copyright 📋
```
2026 Evan Chayani
```

### Build
Une fois la compilation Codemagic de `main` terminée et traitée par Apple, clique sur **Ajouter un build** et choisis-la.
Ce doit être la compilation **en vraies pubs** (`test: false`) : demande-la à Claude avant de compiler.

### Connexion pour la revue (*App Review Information*)
- **Connexion requise** : **décoché** (aucun identifiant à fournir, le compte se crée tout seul).
- **Coordonnées** : ton prénom, ton nom, ton numéro de téléphone et `playquatuor@gmail.com`.
- **Notes** 📋 :
```
No login is required: an anonymous account is created automatically on first launch.
Sign in with Apple or with an email code is optional (Settings › Compte, or the "Moi" tab); "Se déconnecter" signs out.
Friends: open the "Moi" tab, choose a nickname, then add a friend with a friend code (two devices or simulators needed).
Account deletion: Settings › Compte › Supprimer mon compte (double confirmation; deletes all server data).
Users can block and report players from a friend's card; nicknames are filtered automatically and reports are reviewed within 24 hours.
Ads are rewarded videos only, always opt-in: tap the 💡 hint button, or "Voir la solution 📺" after losing a grid. No ad is ever shown without a user action. If no ad is available, the reward is granted anyway.
The Google consent form (GDPR) and the App Tracking Transparency prompt appear on first launch, after the short tutorial.
```

### Publication de la version
**Publier automatiquement cette version** une fois validée, ou **manuellement** si tu préfères choisir le jour de sortie.

---

## 2. Informations sur l'app (menu Général)

| Champ | Valeur |
|---|---|
| **Nom** | Quatuor – Culture G (déjà fait) |
| **Sous-titre** (30 car. max) 📋 | `16 mots, 4 groupes par jour` |
| **Catégorie principale** | **Jeux**, sous-catégories **Mots** et **Quiz** (*Trivia*) |
| **Catégorie secondaire** | **Éducation** (facultatif) |
| **Droits sur le contenu** | « Ne contient pas de contenu tiers », ou « possède les droits nécessaires » : les grilles et les anecdotes sont à toi |

---

## 3. Classification par âge (menu Général → Classification par âge)

Réponds **Aucun** ou **Non** partout, sauf ici :

| Question | Réponse |
|---|---|
| **Contenu généré par les utilisateurs** | **Oui**. Ce sont seulement les pseudos, visibles par les amis. Le filtre, le signalement et le blocage existent. |
| **Messagerie ou discussion** entre utilisateurs | **Non** |
| **Publicités** (si la question est posée) | **Oui** |
| **Contrôles parentaux, vérification de l'âge** | **Non** |
| **Jeux de hasard, concours, coffres à butin** | **Non** (le mode « Hasard 🎲 » tire seulement une grille au sort, sans argent) |
| **Accès au Web sans restriction** | **Non** (les liens n'ouvrent que les pages légales du site) |

Apple calcule ensuite l'âge minimum, normalement **4+** ou **9+**.

---

## 4. Tarifs et disponibilité (menu Monétisation)

- **Prix** : **Gratuit** (0 €).
- **Disponibilité** : tous les pays, ou seulement les pays francophones si tu préfères (France, Belgique, Suisse, Luxembourg, Canada…). Le jeu est entièrement en français.

---

## 5. Déjà fait

- ✅ Confidentialité de l'app (11 types de données, suivi publicitaire)
- ✅ URL de la politique de confidentialité
- ✅ URL marketing
- ✅ Version renommée en 1.3
- ✅ Chiffrement : rien à fournir (`ITSAppUsesNonExemptEncryption = false` dans l'appli)
