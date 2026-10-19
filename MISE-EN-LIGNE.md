# Mise en ligne KOSH sur Render

Configuration prête dans render.yaml. Le service et le disque persistant sont payants : vérifier le tarif affiché avant de créer le service.

1. Créer un compte Render et connecter un dépôt Git privé contenant ce dossier, sans .runtime ni secrets.
2. Dans Render, créer un Blueprint depuis ce dépôt et vérifier le coût proposé.
3. Remplir PK_BOOTSTRAP_CEO et PK_BOOTSTRAP_PASSWORD dans le formulaire sécurisé Render (12 caractères minimum). Ne jamais les ajouter au dépôt.
4. Déployer puis vérifier les quatre espaces : /, /restaurant, /livreur et /ceo.
5. Après la première connexion CEO, retirer PK_BOOTSTRAP_PASSWORD de la configuration. Le compte reste enregistré sur le disque.

Le domaine public est attribué par Render après création. Les espaces professionnels gardent leur connexion obligatoire.

Ce déploiement crée une base neuve. Il ne transfère pas les comptes, commandes, réglages et clés du Mac. Toute migration doit copier de façon sécurisée la base et sa clé de chiffrement après arrêt du serveur et sauvegarde, sans les publier dans Git.

Le processus serveur lance aussi les vérifications périodiques du Daf et de la Halakha. Elles tournent lorsque le service fonctionne et dépendent de la disponibilité des sources.

Sauvegarder régulièrement le volume /data, y compris la clé integration.key. Ne pas augmenter le nombre de processus ou d'instances avec la base SQLite actuelle.
