# Vérifications des sources externes — 14 octobre 2026

Ces notes servent à éviter les promesses incompatibles avec les fournisseurs. Elles ne prouvent pas que les clés d'Ethan sont activées ni qu'une intégration a déjà été testée en production.

## Google : objectif et méthode

La documentation de [l'optimisation des étapes Google Routes](https://developers.google.com/maps/documentation/routes/opt-way) explique que l'optimisation tient compte du temps de trajet ainsi que d'autres facteurs. Ne pas l'assimiler à une preuve d'optimum strict en durée pour une tournée à dernier arrêt libre. Le besoin humain est de minimiser le temps total pour finir tous les arrêts. Pour trois livraisons, comparer les six ordres admissibles avec des durées Google constitue une vérification directe ; pour plus d'arrêts, choisir une méthode adaptée aux contraintes et préciser la portée de son résultat.

Les [liens Google Maps](https://developers.google.com/maps/documentation/urls/get-started) conservent l'ordre des étapes fourni. Ils sont limités à 2 048 caractères et supportent jusqu'à trois étapes intermédiaires sur navigateur mobile, neuf ailleurs selon le produit. Prévoir navigation segmentée qui préserve tous les arrêts et leur ordre si le lien complet n'est pas supporté. Un lien n'effectue pas lui-même l'optimisation demandée.

## Waze

Les [liens Waze officiels](https://developers.google.com/waze/deeplinks) permettent d'ouvrir la navigation vers une destination. Utiliser le prochain arrêt pour cette option, sans annoncer un support multiarrêts non vérifié.

## CalJ

L'[accueil CalJ](https://www.calj.net/) fournit Chabbat, zmanim et Daf Yomi mais les données ouvertes lors de cette vérification étaient celles de Paris. Aucun horaire parisien ne doit devenir un horaire Porto dans Kosh.

L'auteur décrit une intégration de site avec inscription et clé API dans son [article officiel sur le plugin CalJ](https://blog.calj.net/en/calj-plugin-for-wordpress/). C'est une piste d'intégration documentée, pas la preuve que toutes les données demandées sont disponibles dans un endpoint public sans clé. La [page développeur](https://www.calj.net/developpeur) n'a pas fourni de documentation textuelle exploitable lors de cette consultation. Vérifier le contrat d'API, la sélection Porto/Portugal, les méthodes des zmanim et la disponibilité actuelle avant d'implémenter.

## Notifications iPhone

[WebKit documente le Web Push pour les applications ajoutées à l'écran d'accueil](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/). Prévoir une initiation guidée adaptée à la version iOS, un geste explicite pour la permission, et une vérification sur appareil. Une notification ne maintient pas le GPS actif.

## Claude Code

Formats vérifiés sur [agents](https://code.claude.com/docs/en/sub-agents) et [skills](https://code.claude.com/docs/en/skills). Le modèle n'est pas imposé ; il dépend de la configuration d'Ethan. Le paquet ne contourne pas les permissions de Claude Code.
