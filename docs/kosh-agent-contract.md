# Règles de référence pour les agents — état du 14 octobre 2026

Ce document donne les règles communes nécessaires aux skills. Il se lit avec le registre complet docs/kosh-decisions.md et PROMPT-CLAUDE-KOSH.md ; leurs règles finales précises priment sur une formulation abrégée de ce document. La marque de livraison est Kosh ; ne pas renommer une marque existante du dépôt sur une simple supposition.

## Rôles et sessions

Trois espaces professionnels distincts. Comptes individuels créés par les CEO. Trois CEO actifs maximum, droits égaux. Restaurateur limité à son établissement, CEO sur l'ensemble des opérations. Sessions simultanées indépendantes par rôle, option 30 jours, déconnexion limitée à l'espace choisi, saisie stable et révocation lors d'une réinitialisation de mot de passe.

Un compte livreur actif ne signifie pas que son service est ouvert. Les CEO ouvrent son service à chaque tournée. Seul un livreur avec compte actif et service ouvert reçoit et accepte de nouvelles courses. Fermer son service bloque les nouvelles courses mais permet de terminer les parts déjà acceptées. La désactivation du compte et la fermeture du service sont deux actions distinctes.

Les mots de passe professionnels créés ou changés sont également conservés dans un coffre chiffré consultable par les CEO ; accès journalisé, aucun stockage dans le navigateur ni exposition aux autres rôles. Le stockage de vérification d'authentification demeure distinct du coffre récupérable.

## Commande et livraisons fractionnées

Le restaurant déclare un nombre entier positif de sacs, sans plafond métier fixe. Capacité livreur : 5 par défaut, réglable de 1 à 10. Compter des sacs et non des articles. Une commande peut être répartie entre plusieurs livreurs. Exemple : dix sacs, cinq acceptés par un livreur, cinq restant disponibles pour un autre.

Chaque livreur accepte sa propre part selon sa capacité disponible. Il peut collecter et partir dès que sa part est prête, sans attendre les autres affectations. Une part acceptée disparaît des offres des autres livreurs ; les sacs restants restent proposés. Ne pas distribuer deux fois les mêmes sacs. La commande n'est entièrement livrée qu'après livraison de toutes les parts.

Suivre séparément la commande, les sacs, les parts acceptées, les collectes et les livraisons. Ce modèle de parts est une recommandation d'implémentation pour respecter la règle métier ; l'adapter à la stack. La libération d'une part avant collecte remet uniquement ses sacs à disposition, sans annuler la vente. L'affectation manuelle est réservée aux CEO et demeure soumise à l'acceptation du livreur.

## Préparation, paiement, stocks

Préparation initiale : 15 minutes, réglable par le restaurateur. Après les vingt premières préparations valides mesurées, proposer leur médiane. Ne pas appliquer automatiquement la proposition : acceptation explicite du restaurateur. En cas de refus conserver le délai actuel. La périodicité d'éventuelles propositions futures n'a pas été décidée ; ne pas inventer un recalcul permanent.

Paiement Revolut vérifié manuellement. Validation du paiement ouvre le ticket ; tickets consultables et imprimables. « Commande prête » notifie les livreurs ayant accepté une part. Promotions et cadeaux dans une même fonction. Réserver le cadeau uniquement lors de l'enregistrement d'une commande qui utilise le code valide.

Prix, disponibilités et réservation des stocks côté serveur. Une annulation restitue les stocks une seule fois, y compris après préparation conformément au choix humain. Paiements et remboursements restent manuels. Demande d'annulation payée soumise au restaurant ou CEO. Refus avec message standard, sans justification libre obligatoire : « Le restaurant a malheureusement décliné votre annulation. Vous pouvez adresser une réclamation. »

Commande payée sans livreur : alertes après cinq et quinze minutes. Après quinze minutes sans solution, proposition de retrait envoyée manuellement par le restaurant puis soumise à l'accord client ; aucune conversion ou annulation automatique. Pour une commande partiellement attribuée, exposer les sacs sans livreur ; la règle exacte d'escalade et d'annulation après collecte partielle doit être clarifiée avant d'être figée.

Frais livraison Kosh : 3,50 euros. Frais retrait : 0,50 euro. Uber Colis organisé et payé par le client, pas de frais de livraison Kosh. Commission historique de 1,50 euro supprimée. Le traitement financier d'une livraison transformée en retrait reste à préciser.

## Cartographie et GPS

Google Maps remplace entièrement OpenRouteService pour les calculs et la configuration. Adresses sélectionnées et validées via Google, numéro de rue conservé. Itinéraire automatique visant le temps total le plus court pour terminer l'ensemble des arrêts, modifiable ensuite par le livreur. Collecte avant livraison, capacités et commandes déjà collectées respectées. Générer un lien Google Maps avec les arrêts dans l'ordre retenu. Navigation Google Maps, Plans Apple et Waze.

GPS automatique, cible de demande de position toutes les trois secondes pendant l'activité de l'application et avec permission du navigateur. Le navigateur ne garantit pas un nouveau point physique toutes les trois secondes ni un suivi après suspension. Carte et GPS privés réservés aux CEO et au restaurateur concerné ; le client conserve les statuts et estimations autorisés, sans position exacte ni trajet privé dans ses réponses API.

Ne pas rétablir les boutons GPS historiques retirés. Signaler les interruptions ; ne pas faire passer des coordonnées anciennes pour une nouvelle position. Les choix retirant certains détails GPS de l'écran livreur ne suppriment pas les contrôles nécessaires au serveur.

## Fonctions à préserver et retraits

Conserver la charte du site cible et éviter de recopier les polices de PortoKitch sans vérifier la charte Kosh. Interface iPhone et Mac, fonctions regroupées, champs uniformes et mode cuisine agrandi.

Trois jeux arcade sans niveaux ni plafond de score fixé, accès une heure après la date serveur d'une commande, échéance conservée et partie arrêtée à expiration. Classement par joueur, records multiappareils, scores vérifiés côté serveur. Conserver l'agenda ; demande d'intégration des horaires de Chabbat à Porto, zmanim et Daf Hayomi depuis https://www.calj.net/ à vérifier sur la source avant conception de l'import.

Ne pas recréer les interfaces factures, analyse de factures IA, studio de personnalisation, studio IA, bilan financier étendu, recettes et coûts. Conserver les données historiques existantes sans les supprimer. « On garde » sur H signifie préserver l'état actuel, pas réactiver l'ancienne fonction. Historique/restauration de carte conservés dans leur état existant, avec protection des stocks et compteurs. Ne pas ajouter une section Coûts vide au menu CEO.
