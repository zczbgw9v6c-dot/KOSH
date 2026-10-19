# Porto Kitch

Application client et trois applications professionnelles partageant le catalogue,
la charte bleu marine/crème/or et une base SQLite persistante. Le catalogue initial
comprend 11 enseignes et 331 articles. Les images et les données d'origine sont conservées.

| Application | Adresse | Accès |
| --- | --- | --- |
| Clients | `/` | Commande sans compte ou compte client individuel |
| Restaurateurs | `/restaurant` | Compte individuel, limité à son établissement |
| Livreurs | `/livreur` | Compte individuel, limité aux courses affectées |
| CEO / associés | `/ceo` | Comptes créés par un associé ou l'exploitant du serveur |

Les trois liens professionnels figurent dans le profil, au même emplacement logique
que l'ancien accès restaurateur. Chaque application professionnelle dispose de son
propre manifeste pour une ouverture sur l'écran d'accueil d'un téléphone.

## Démarrer

Python 3.12 ou ultérieur est recommandé. Aucun compte professionnel ni mot de passe
par défaut n'est livré dans le dépôt.

```sh
python3 -m venv .runtime/venv
.runtime/venv/bin/pip install -r requirements.txt
.runtime/venv/bin/python server.py account --role ceo --login associe@example.com
.runtime/venv/bin/python server.py --port 8766
```

La création du premier compte demande un mot de passe de 12 caractères minimum.
Ouvrir `http://127.0.0.1:8766/ceo`, puis créer les comptes restaurateurs et livreurs
dans **Comptes**. Un mot de passe généré s'affiche une seule fois ; aucune invitation
par e-mail n'est envoyée automatiquement. La réinitialisation ferme les sessions existantes.

`Lancer-PortoKitch.command` lance le serveur sur Mac et installe ses dépendances au premier lancement.
Il conserve les données dans `.runtime/`, répertoire exclu de Git et interdit au serveur web.
`PK_RUNTIME` peut désigner un autre répertoire persistant ; `PK_SECURE=1` ajoute l'attribut
Secure aux cookies lorsque le serveur est utilisé derrière un hébergement HTTPS.

Un serveur HTML statique ou GitHub Pages seuls ne suffisent plus : les commandes,
les accès professionnels, les jeux autorisés et le GPS passent par l'API Python.
Cette version s'exécute localement. Pour l'utiliser depuis plusieurs téléphones,
il faut héberger ce serveur derrière HTTPS avec un volume persistant, sauvegardes,
supervision et configuration du proxy. Le serveur de développement écoute seulement
sur `127.0.0.1` ; il n'expose pas ce Mac à Internet.

## Commandes, restaurants et livraisons

- Prix, options obligatoires, promotions et réservations de stock vérifiés côté serveur.
- Réservations transactionnelles et restitution unique lors d'une annulation.
- Refus des modifications de carte devenues anciennes pendant une commande.
- Livraison Porto Kitch à 3,50 €, retrait et Uber Colis organisé/payé par le client.
- Validation manuelle du paiement Revolut, préparation, commande prête, collecte et livraison.
- Affectation à un livreur, horaire annoncé de collecte ou livraison, destination corrigible.
- GPS partagé dès le départ vers le restaurant et pendant la tournée ; précision, dernière
  actualisation, position périmée et interruption de connexion affichées.
- Carte de suivi réservée aux CEO et au restaurant concerné (positions par livreur, animées
  entre points réels, zoom conservé) ; le client ne reçoit ni position ni tournée.
- Tournée livreur Google (lot 4) : ordre au temps total minimal, modifiable à la main,
  liens Google Maps multi-arrêts (segmentés si besoin), Plans et Waze vers le prochain arrêt.
- Navigation Google Maps/Plans, copie d'adresse, contact téléphonique, messages,
  confirmation de réception, notes, réclamations et réponses, tickets imprimables.
- Cartes, options/suppléments, produits/photos, menus fixes ou au choix par catégorie.
  Les menus décomptent les produits inclus ; leurs quantités ne sont pas affichées au client.
- Codes de réduction et produits cadeaux, nombre d'utilisations et commission Porto Kitch.
- Activation des nouvelles livraisons, programmation de précommandes, ouverture/clôture
  du service, archives et compte rendu CSV ; remboursements signalés mais manuels.

Le GPS d'une application web dépend de l'autorisation du livreur et d'une page active.
iOS peut le suspendre lorsque l'écran est verrouillé. Aucun suivi de fond natif n'est
annoncé. Les notifications et alertes sonores fonctionnent pendant que l'application
est ouverte. Les notifications en arrière-plan (Web Push, `sw.js`) fonctionnent quand le
serveur est configuré (voir DEPLOIEMENT.md) ; sinon le mode dégradé est affiché aux CEO.
Un parcours guidé explique au premier usage l'installation sur l'écran d'accueil
(iPhone, iOS 16.4 minimum), demande la permission sur un appui et affiche un diagnostic.
La réception réelle doit être vérifiée sur les appareils : un envoi n'en est pas la preuve.

## Jeux d'arcade

Pita Pulse, Golden Stack et Porto Flight sont sans niveaux ni écran de victoire final.
La difficulté augmente progressivement, les décors restent cohérents avec Porto Kitch,
et les scores sont représentés par des entiers de précision arbitraire plutôt que par
des nombres flottants limités à 53 bits.

Chaque commande ouvre exactement une heure à partir de sa date serveur. Le minuteur
ne repart pas à zéro après un rechargement ; une partie active est arrêtée à l'échéance.
Une commande annulée n'ouvre plus cet accès. Le serveur vérifie l'appartenance de la
commande et de la session de jeu. Une nouvelle commande ouvre sa propre fenêtre.

Le classement cumule les meilleurs scores des trois jeux par identifiant de joueur.
Wheelie Bradley, jeu bonus, suit la même fenêtre d'une heure ouverte par le serveur et
s'arrête à l'échéance, sans niveaux ; il reste hors classement (record local).
Un compte client permet de retrouver ce même identifiant sur plusieurs appareils.
Le serveur recalcule les scores à partir d'un journal d'actions et d'une simulation
déterministe, avec une limite de progression liée au temps réel. Un total envoyé seul
est refusé. Le classement utilise uniquement ces parties vérifiées ; les anciens
records non vérifiés restent conservés dans la base, sans être mélangés au classement.
Cette validation ne prétend pas détecter tous les robots capables de jouer légalement.

## Espace CEO

- Ensemble des commandes, enseignes, courses, stocks, promotions et réclamations.
- Création, désactivation, réactivation et renouvellement des accès individuels (trois CEO
  actifs maximum), coffre chiffré des mots de passe professionnels et journal des opérations
  (auteur, action, détail ; chaque consultation du coffre est journalisée).
- Services livreurs par tournée, capacités, modes de réception globaux et locaux, délai de
  préparation de chaque restaurant, archives des services clôturés et comptes rendus CSV.
- Réglages Google Places / Google Routes (variables serveur ou coffre chiffré), état du
  service de notifications (en attente, transmis, en échec, expirés, dernière erreur).
- Agenda communautaire : événements ponctuels et hebdomadaires, modification et suppression ;
  emplacement de configuration CalJ désactivé par défaut (aucun horaire importé ni inventé).
- Fonctions retirées (factures, analyse IA, matières, recettes et coûts, bilan, studio de
  personnalisation et studio IA, PIN de démonstration) : routes fermées et interfaces supprimées ;
  les données historiques (`finance/*`, fichiers, `conf/main`, versions) sont conservées sans être
  appliquées aux pages publiques.

L'adaptation a été conçue à partir des interfaces et du JavaScript publiés de
[Yoriz et Tartarel](https://yoriz-et-tartarel.sarel-elfassy.chatgpt.site), retrouvés dans
la discussion « Programmer rappel quotidien ». La source privée et les données de
ce site ne sont pas copiées dans le dépôt. Les métiers, accès et données sont adaptés
aux multiples établissements de Porto Kitch.

## Intégrations et validation

Les clés et les configurations des services de Yoriz ne sont pas réutilisées.
Les clés Google sont lues dans les variables serveur ou saisies par un CEO (voir DEPLOIEMENT.md).
Sans clé, le GPS, l'ordre manuel et les horaires annoncés restent utilisables ; l'application
ne simule aucune durée routière. Le calcul (`tour.py`) minimise le temps total de la tournée :
énumération exacte jusqu'à 8 arrêts, programmation dynamique exacte jusqu'à 12, heuristique au-delà.

Références : [Google Places](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/searchText),
[Routes API computeRouteMatrix](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRouteMatrix),
[URLs Google Maps](https://developers.google.com/maps/documentation/urls/get-started), [liens Waze](https://developers.google.com/waze/deeplinks),
[Leaflet](https://leafletjs.com/reference-1.9.4.html),
[Web Push sur iOS et iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
Leaflet 1.9.4 est distribué dans `vendor/leaflet/` avec sa licence ; les cartes affichent
l'attribution OpenStreetMap.

```sh
.runtime/venv/bin/python -m unittest discover -s tests -v
node tests/frontend.cjs
node tests/frontend_regressions.cjs
node tests/operations.cjs
node tests/courier_tour.cjs
node tests/kitchen.cjs
node tests/lot5b.cjs
```

Les tests utilisent une base isolée et des comptes fictifs. Ils vérifient les parcours
de commande/livraison, permissions, stocks, promotions, menus, sessions, échéance des
jeux et comptes joueurs. Les modules du navigateur sont aussi exécutés ensemble pour
détecter les erreurs de chargement et vérifier le classement de grands entiers.
Les intégrations réelles et un trajet GPS sur téléphone doivent être validés avec les
clés et appareils de l'exploitant. Les horaires religieux et les cartes d'origine
restent à confirmer auprès de la communauté et des établissements.

## Corrections de l’audit du 12 octobre 2026

Les formulaires de produit conservent leur révision de départ, et toutes les écritures
de carte font avancer cette révision. Les restaurations conservent stocks, compteurs
de promotions et état de service actuels. Les cadeaux composés réservent leurs ingrédients.
Les sessions clients sont révoquées lors de la désactivation ou du changement de mot de passe.

Les appels externes s’exécutent hors du verrou des commandes. Avant d’enregistrer une
tournée calculée, le serveur recontrôle les accès et les courses ; un résultat devenu
ancien est refusé, et les nouvelles positions GPS/messages sont préservés.
Les dates de précommande/ouverture globales et locales s’appliquent ensemble : la date
la plus tardive prévaut, avec le délai maximal des deux réglages. Les pages personnalisées
chargent leurs ressources depuis la racine du site. Les exports financiers suivent
la période sélectionnée ; les options vidées et les compositions lors d’un réachat sont respectées.

Les tests de relecture arcade comparent directement les boucles des trois jeux au moteur
serveur. Le code de test utilise Node.js ; le serveur et le lanceur Mac restent en Python.
Aucune migration supplémentaire n’est nécessaire pour ces corrections.


## Parcours professionnels simplifiés

- Le ticket s’ouvre automatiquement à la validation du paiement, côté client et dans les espaces restaurant/CEO déjà connectés. Plusieurs paiements sont mis en file pour consultation. Il reste consultable et imprimable depuis la commande.
- Les réglages de service comportent des commandes distinctes pour la livraison Porto Kitch, le retrait et Uber Colis. Les réglages CEO globaux limitent les réglages locaux. Uber Colis est indisponible tant que la livraison Porto Kitch effective est active ; les commandes déjà acceptées sont conservées.
- Toutes les courses de livraison payées et disponibles sont proposées aux livreurs, quelle que soit l’enseigne. Le premier à accepter obtient la course. Une affectation manuelle est une proposition au livreur choisi, qui doit aussi l’accepter. Les coordonnées client ne sont exposées qu’après acceptation.
- Les espaces CEO et restaurant comportent un menu d’espace et un menu de fonctions : une seule fonction est affichée à la fois. Les contrôles, notamment les champs de prix numériques, partagent la typographie et les dimensions du site. Le formulaire de recherche est retiré de l’espace livreur.
- Chaque professionnel peut changer son mot de passe avec confirmation du mot de passe actuel. Les sessions existantes sont révoquées. À la demande de l’exploitant, les mots de passe professionnels créés ou changés sont aussi conservés chiffrés dans un coffre réservé aux CEO ; leur consultation est journalisée. Les clients ne font pas partie de ce coffre. Les mots de passe existants, auparavant uniquement hachés, ne peuvent pas être retrouvés : une réinitialisation ou un changement crée leur entrée dans le coffre.
- Les mots de passe générés par le CEO sont copiés automatiquement si le navigateur l’autorise. Sinon, le bouton Copier et le champ sélectionnable restent disponibles. Aucun mot de passe n’est enregistré dans le stockage local du navigateur. Une déconnexion ou expiration de session retire immédiatement tout mot de passe affiché.

Le coffre utilise la clé locale `.runtime/integration.key`, déjà utilisée pour les intégrations. La clé, les données et les mots de passe sont exclus de Git et de l’archive de livraison ; ils doivent être conservés ensemble dans les sauvegardes privées de l’installation.
