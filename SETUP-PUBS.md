# Mettre en place les pubs (Google AdMob, appli iOS)

Quatuor n'affiche que des **pubs récompensées**, toujours choisies par le joueur :

- **💡 Indice** : chaque indice (jusqu'à 6 par grille) se débloque avec une courte vidéo ;
- **Voir la solution 📺** : la solution d'une grille perdue se débloque avec une vidéo.

Pas de bannière, pas de pub imposée, pas de pub dans le tutoriel ni sur le site (tout y reste gratuit).
La première fois, un petit écran explique le principe. Si la pub est fermée avant la fin, pas de récompense ;
si aucune pub n'est disponible (réseau, stock vide), la récompense est donnée quand même.

Le code est prêt et fonctionne déjà avec les **identifiants de test de Google** (pubs factices marquées « Test Ad »,
aucun revenu). Pour gagner de l'argent, il faut créer ton compte AdMob et remplacer ces identifiants.

## 1. Créer le compte AdMob

1. Va sur **admob.google.com** (Safari) et connecte-toi avec ton compte Google.
2. Remplis le pays (France), le fuseau horaire et la devise (EUR), accepte les conditions.
3. Plus tard, AdMob demandera tes **informations de paiement** (adresse, IBAN) et une vérification d'identité :
   les paiements arrivent quand tes gains dépassent 70 €.

## 2. Ajouter l'appli

1. **Applications → Ajouter une application → iOS**.
2. « L'application est-elle publiée sur une plateforme compatible ? » : **Oui**, cherche **Quatuor**
   (si elle n'est pas encore en ligne sur l'App Store : **Non**, tu pourras la relier ensuite).
3. Note l'**ID d'application**, de la forme `ca-app-pub-1234567890123456~1234567890`.
4. Dans le dépôt, ouvre `ios/App/App/Info.plist` et remplace la valeur de `GADApplicationIdentifier`
   (`ca-app-pub-3940256099942544~1458002511`, celle de test) par **ton** ID d'application.

## 3. Créer le bloc d'annonces

1. Dans l'appli Quatuor sur AdMob : **Blocs d'annonces → Ajouter → Avec récompense**.
2. Nom : `Indice ou solution`. Récompense : **1**, élément : `indice`. Le reste par défaut.
3. Note l'**ID du bloc d'annonces**, de la forme `ca-app-pub-1234567890123456/1234567890` (avec une barre `/`).
4. Dans `config-en-ligne.js`, remplace :
   ```js
   admob: { recompense: "ca-app-pub-3940256099942544/1712485313", test: true },
   ```
   par :
   ```js
   admob: { recompense: "ca-app-pub-TON-ID/TON-BLOC", test: false },
   ```

⚠️ Avec tes vrais identifiants, **ne clique jamais sur tes propres pubs** et ne les regarde pas en boucle :
Google peut suspendre le compte. Pour tester sur ton iPhone, garde `test: true` (ou ajoute ton iPhone comme
appareil de test dans AdMob → Paramètres → Appareils de test).

## 4. Consentement (RGPD) — obligatoire en Europe

1. AdMob → **Confidentialité et messages** → **Réglementations européennes (RGPD)** → **Créer un message**.
2. Applis : Quatuor. Langue : **français**. Lien vers la politique : `https://playquatuor.fr/confidentialite.html`.
3. Garde les choix proposés par défaut (« Consentir », « Gérer les options », et le bouton « Ne pas consentir »),
   puis **Publier**.
4. Facultatif mais conseillé : dans **Confidentialité et messages → Message explicatif IDFA**, crée un message
   en français : il s'affiche juste avant la fenêtre d'Apple et augmente le taux d'acceptation.

L'appli affiche ce formulaire tout seul au lancement (jamais pendant le tutoriel), puis la fenêtre d'Apple
« Autoriser l'app à suivre vos activités ». Le joueur peut changer d'avis dans **Paramètres › Données ›
Mes choix publicitaires** (le bouton n'apparaît que quand Google le demande, c'est-à-dire en Europe).

## 5. Fichier app-ads.txt (pour être payé normalement)

1. AdMob → **Applications → Afficher toutes les applications → app-ads.txt** : copie la ligne proposée, du type
   `google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0`.
2. Envoie-la-moi : je crée le fichier `app-ads.txt` à la racine du site (il sera en ligne sur
   `https://playquatuor.fr/app-ads.txt`).
3. Dans App Store Connect, le champ **Site web du développeur** (URL marketing) doit être `https://playquatuor.fr`.

## 6. Avant de publier la nouvelle version

1. **Supabase** : lance `supabase/migrations/0006_indices.sql` dans **SQL Editor** (jusqu'à 6 indices par grille
   au lieu de 2). À faire **avant** la sortie de l'appli, sinon la synchronisation des résultats avec beaucoup
   d'indices serait refusée.
2. **App Store Connect** : mets à jour la confidentialité de l'app avec `ETIQUETTES-APP-STORE.md`
   (les pubs ajoutent des données et le suivi).
3. Lance un build Codemagic : il installe le SDK Google (`npx cap sync ios`) et compile.
4. Teste sur TestFlight : touche 💡 → écran d'explication → pub « Test Ad » → l'indice apparaît.
