# Comment ajouter une grille

Toutes les grilles du jeu sont dans **`grilles.json`**, à la racine du dépôt.
L'appli télécharge ce fichier à chaque lancement : une grille ajoutée ici arrive chez les joueurs **sans mise à jour de l'appli**.

## 1. Copier un modèle

Ouvre `grilles.json` et ajoute un bloc à la **fin** de la liste `"grilles"` (n'oublie pas la virgule après le bloc précédent) :

```json
    {
      "id": "g033",
      "num": 33,
      "difficulte": "moyen",
      "jour": "2026-10-27",
      "groupes": [
        { "nom": "Groupe le plus facile", "mots": ["Mot1", "Mot2", "Mot3", "Mot4"], "anecdote": "Une anecdote vraie et courte." },
        { "nom": "Deuxième groupe", "mots": ["Mot5", "Mot6", "Mot7", "Mot8"], "anecdote": "…" },
        { "nom": "Troisième groupe", "mots": ["Mot9", "Mot10", "Mot11", "Mot12"], "anecdote": "…" },
        { "nom": "Groupe le plus dur", "mots": ["Mot13", "Mot14", "Mot15", "Mot16"], "anecdote": "…" }
      ]
    }
```

## 2. Remplir les champs

| Champ | Ce qu'il faut mettre |
|---|---|
| `id` | Identifiant **unique et définitif** : le suivant de la liste (`g033`, `g034`…). **Ne jamais modifier l'id d'une grille existante** : les résultats et les favoris des joueurs y sont attachés. |
| `num` | Numéro affiché au joueur (« Grille n°33 »). Unique. |
| `difficulte` | `facile`, `moyen`, `difficile` ou `goat`. Erreurs autorisées : 4, 4, 3 et 2. |
| `jour` | *Optionnel.* Date `AAAA-MM-JJ` à laquelle ce sera la **grille du jour**. Une seule grille par jour, et jamais une grille `goat`. Sans `jour`, c'est une **grille libre**, jouable tout de suite depuis le tiroir. |
| `toujours_visible` | *Optionnel* (`true` ou `false`). Marque une **grille libre** (jouable à tout moment). **Une grille `toujours_visible` ne peut jamais être une grille du jour** : elle ne doit pas avoir de `jour` aujourd'hui ou dans le futur, sinon les joueurs pourraient la faire à l'avance (le vérificateur le signale comme une erreur). Seule une date passée peut être conservée, pour l'historique. **Ne le mets jamais sur une grille du calendrier.** |
| `groupes` | Exactement **4 groupes de 4 mots**, du plus facile au plus dur (l'ordre donne les couleurs : menthe, abricot, framboise, bleu nuit). Les **16 mots doivent être tous différents**. |

Conseils :
- Un **piège** (un mot qui semble aller dans deux groupes) rend la grille plus intéressante, mais il ne doit y avoir **qu'une seule solution**.
- Vérifie l'anecdote : elle doit être **vraie**.
- Pas besoin d'espaces insécables avant `:` `!` `?` `»` : l'appli les ajoute toute seule.
- **Deux sortes de grilles** :
  - **grille du calendrier** : un `jour`, **pas** de `toujours_visible`. Elle reste **secrète** jusqu'à son jour, puis rejoint le tiroir ;
  - **grille libre** : pas de `jour` (ou `toujours_visible`). Jouable tout de suite, et utilisée comme « Grille bonus » les jours sans grille planifiée.
- Pour planifier, utilise toujours des **grilles inédites** : jamais une grille déjà visible dans le tiroir.

## Ajouter une grille de thème (mode « Thèmes »)

Les thèmes sont déclarés dans la liste `"themes"`, en haut de `grilles.json` :

```json
{ "id": "geographie", "nom": "Géographie", "icone": "🌍", "ordre": 1, "publie": false }
```

| Champ | Ce qu'il faut mettre |
|---|---|
| `id` | Identifiant du thème, sans espace ni accent. `quotidien` est réservé au jeu quotidien. |
| `nom`, `icone` | Nom et emoji affichés sur la carte du thème. |
| `ordre` | Position de la carte dans l'écran Thèmes (1, 2, 3…). |
| `publie` | `false` : le thème n'est visible **qu'en local** (`localhost`), pour le tester. `true` : il apparaît chez tous les joueurs. Tant qu'aucun thème n'est publié, le sélecteur « Grille du jour \| Thèmes » reste masqué. |

Une grille de thème se remplit comme les autres, avec en plus `"theme": "<id du thème>"`, et **sans** `jour` ni `toujours_visible` (une grille de thème n'est jamais grille du jour et ne compte pas dans la série). Les grilles du jeu quotidien ont `"theme": "quotidien"` (valeur par défaut si le champ est absent).

Dans un thème, les grilles sont classées par difficulté (`facile` → `goat`). La difficulté peut aussi s'écrire en chiffre (1 = facile, 2 = moyen, 3 = difficile, 4 = goat), mais **le texte reste recommandé** : les anciennes versions de l'appli ne comprennent que le texte.

## 3. Vérifier

Dans un terminal, à la racine du dépôt :

```
node outils/verifier-grilles.js
```

- `✓ grilles.json est valide.` : tout est bon.
- `✗ … erreur(s)` : corrige chaque ligne indiquée, puis relance.
- Le script affiche chaque thème avec son statut (**publié** / **non publié**) et son nombre de grilles.
- Il liste aussi les **jours des 30 prochains jours sans grille inédite planifiée**. Ces jours-là, l'appli propose une « Grille bonus » choisie parmi les grilles libres non GOAT (de préférence une que le joueur n'a pas encore faite). Pense à planifier ces jours.

Si une grille invalide est quand même publiée, l'appli l'ignore simplement (sans planter), et elle n'apparaîtra pas.

## 4. Publier

Envoie `grilles.json` sur la branche `main`. Les joueurs reçoivent la nouvelle liste à leur prochain lancement de l'appli.
