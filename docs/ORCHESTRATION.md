# Rôle de la conversation principale : orchestrateur Kosh

Ce document organise le travail lancé par PROMPT-CLAUDE-KOSH.md. Le registre validé complet est dans docs/kosh-decisions.md et docs/kosh-decisions.json.

## Avant de distribuer le travail

Lire les instructions du dépôt, identifier la stack réelle et inventorier ce qui existe déjà dans Kosh. Ne pas recopier aveuglément l'architecture Python de PortoKitch ni remplacer la stack existante. Lire le registre complet des 285 décisions et les clarifications dans PROMPT-CLAUDE-KOSH.md. Le dernier choix humain explicite prévaut ; « On garde » sur une fonction historique conserve son état actuel, y compris son retrait.

Créer une matrice : identifiant de besoin, règle validée, agent responsable, fichiers concernés, preuve attendue, état. Signaler ce qui reste réellement indéterminé. Ne pas inventer une décision manquante.

## Distribution

L'orchestrateur conserve l'autorité sur les contrats communs, les changements de modèle de données, l'intégration et le rapport final. Utiliser `kosh-workflows` pour établir les transitions et les interfaces entre les rôles. Confier ensuite des lots bornés aux spécialistes. Ne pas lancer systématiquement tous les agents ni présumer que tous peuvent s'exécuter simultanément : respecter les capacités de Claude Code.

Attribuer les fichiers à un seul propriétaire par lot. Toute modification d'un fichier partagé passe par l'orchestrateur. Paralléliser les lots réellement indépendants ; intégrer les changements dépendants dans l'ordre. Employer l'isolation de travail disponible dans l'environnement si elle est utile, sans effacer ni réinitialiser les changements d'Ethan.

Les agents spécialisés n'ont pas à recréer d'autres agents. Ils renvoient leur résultat à la conversation principale, qui organise les suites et la revue.

## Ordre conseillé

1. Inventaire du dépôt, matrice des besoins et contrats entre rôles.
2. Accès, sessions et activation des services livreurs.
3. Parcours vertical : commande, stock, paiement, préparation, acceptation, collecte, livraison.
4. Livraison fractionnée, capacités et gestion des courses concurrentes.
5. Google Maps, tournée automatique modifiable, GPS réservé aux professionnels.
6. Gestion des cartes, promotions, réclamations, service et archives.
7. Notifications, PWA, jeux et agenda conservés ou adaptés selon le cahier des charges.
8. Vérification intégrée, revue indépendante et corrections.

Adapter cet ordre aux dépendances réelles du dépôt. La priorité est un parcours complet observable ; éviter des écrans qui ne sont pas reliés à leurs actions serveur.

## Compte rendu d'un lot

Chaque agent remet les identifiants couverts, fichiers changés, règles appliquées, commandes de validation et résultats, limites restantes, besoins d'intégration. Aucun « terminé » basé uniquement sur une lecture du code.

Le réviseur indépendant ne valide pas son propre travail. Il reçoit le besoin, le diff, les contrats et les preuves, plutôt qu'une conclusion imposée. L'agent tests couvre les scénarios d'intégration et les échecs concurrents. L'orchestrateur traite les problèmes bloquants avant de déclarer le lot validé.

## Critères de sortie

- Besoins du lot reliés à des preuves ; aucun écart métier non résolu.
- Aucun défaut critique ou important connu laissé sans résolution.
- Tests pertinents réussis et parcours navigateur vérifiés quand l'environnement le permet.
- Contraintes visuelles et fonctionnalités à préserver contrôlées.
- Services non configurés et vérifications physiques manquantes déclarés clairement.

Une note facultative doit citer ses preuves et ses limites. Un seuil de 90/100 ne remplace pas ces critères. Après trois cycles infructueux sur le même problème, produire un diagnostic et une proposition ciblée plutôt qu'une boucle infinie de corrections.

Préserver les données et le code existants. Un changement de schéma nécessaire doit être conçu comme une migration explicite et réversible, testée sur données isolées, puis appliquée selon l'autorisation d'Ethan. Ne pas publier, envoyer de messages réels, effectuer de paiement ou exécuter une action externe sur la seule base de ce paquet.
