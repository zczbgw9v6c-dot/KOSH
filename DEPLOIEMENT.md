# Mettre KOSH en ligne

Le dépôt **Kosh-app** contient toute l'appli. Une fois en ligne, un seul lien sert à tout le monde :

| Adresse | Pour qui |
|---|---|
| `/` | Clients (commande, paiement Revolut, suivi, jeux) |
| `/restaurant` | Restaurateurs |
| `/livreur` | Livreurs |
| `/ceo` | Associés |

C'est un serveur Python (`server.py`, sans framework) qui garde ses données dans une base SQLite. Paquets externes : `cryptography`, `certifi` et, pour les notifications en arrière-plan, `pywebpush` (voir `requirements.txt`). Python 3.11 ou plus récent.

## 1. Réglages de l'hébergeur

- **Commande de démarrage** : `python server.py`
- **Commande d'installation** : `pip install -r requirements.txt`
- **Disque permanent** (indispensable) : le monter par exemple sur `/data`. Sans lui, les commandes et les comptes sont effacés à chaque redémarrage ou redéploiement.

Variables d'environnement :

| Variable | Valeur | Rôle |
|---|---|---|
| `PK_HOST` | `0.0.0.0` | Le serveur écoute sur l'extérieur (par défaut il n'écoute que sur la machine). |
| `PORT` | fournie par l'hébergeur | Port d'écoute, lu automatiquement. |
| `PK_RUNTIME` | `/data` | Dossier de la base de données et de la clé de chiffrement. À mettre sur le disque permanent. |
| `PK_SECURE` | `1` | Cookies sécurisés en HTTPS. |
| `PK_BOOTSTRAP_CEO` | `mail1,mail2,mail3` | Comptes CEO créés au démarrage s'ils n'existent pas encore. |
| `PK_BOOTSTRAP_PASSWORD` | au moins 12 caractères | Mot de passe provisoire de ces comptes. Chacun le change ensuite dans ses réglages. |
| `PK_SECRET_KEY` | clé Fernet (recommandé) | Clé de chiffrement du coffre (mots de passe pros, clés Google, jetons d'adresse), gardée **hors** du dossier de la base. Voir « Clé de chiffrement » ci-dessous. |
| `PK_ADDRESS_DAILY_LIMIT` | `2000` (défaut) | Plafond journalier, pour tout le serveur, des recherches d'adresse Google (facturées). |

Les mots de passe ne sont jamais écrits dans le code : ils passent uniquement par ces variables, qu'on règle chez l'hébergeur.

### Clé de chiffrement — à sauvegarder

Une seule clé chiffre le coffre des mots de passe professionnels, les clés Google enregistrées par un CEO et les jetons d'adresse vérifiée. **Si elle est perdue, ces données sont illisibles** (il faut alors réinitialiser les mots de passe et ressaisir les clés Google).

- **Recommandé** : générer une clé une fois (`python3 -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"`), la déclarer chez l'hébergeur dans `PK_SECRET_KEY`, et la **conserver dans un gestionnaire de mots de passe**, séparément des sauvegardes de la base. Une sauvegarde de `PK_RUNTIME` seule ne suffit alors plus à tout déchiffrer.
- **Sans cette variable** (comportement par défaut) : la clé est créée automatiquement dans `PK_RUNTIME/integration.key` (droits 600). La sauvegarder avec la base, en sachant qu'elle donne accès au coffre.
- **Passage de l'un à l'autre sans perte** : quand `PK_SECRET_KEY` est définie et que `integration.key` existe déjà, les nouvelles données sont chiffrées avec `PK_SECRET_KEY` et les anciennes restent lisibles avec le fichier. Ne supprimer le fichier qu'après avoir réenregistré les secrets (changement de mot de passe, clés Google).

### Google Maps Platform (adresses, trajets) — facultatif

Sans clé Google, l'appli fonctionne en **mode dégradé clair** : adresses saisies librement et marquées « non vérifiée », tournée dans l'ordre manuel du livreur, aucune heure de trajet annoncée. OpenRouteService n'est plus utilisé (l'ancienne clé reste stockée en base, ignorée).

| Variable | Rôle |
|---|---|
| `PK_GOOGLE_KEY` | Clé **serveur** unique pour Places API (New) et Routes API. |
| `PK_GOOGLE_PLACES_KEY` | (optionnel) clé serveur dédiée aux adresses ; prioritaire sur `PK_GOOGLE_KEY`. |
| `PK_GOOGLE_ROUTES_KEY` | (optionnel) clé serveur dédiée aux trajets ; prioritaire sur `PK_GOOGLE_KEY`. |

Les variables d'environnement priment ; sinon les clés saisies par un CEO dans **Réglages → Google Maps Platform** sont vérifiées puis conservées dans le coffre chiffré (`secret/google`, `secret/google-routes`). Aucune clé n'est envoyée au navigateur ni écrite dans les journaux. Aucune clé navigateur n'est nécessaire : la recherche d'adresse passe par le serveur (si une carte Google était un jour affichée côté navigateur, créer une clé séparée restreinte par référent HTTP).

**API à activer** dans Google Cloud (projet avec facturation) : *Places API (New)* (Autocomplete + Place Details) et *Routes API* (computeRouteMatrix).

**Restrictions de clé conseillées** : restriction d'API (uniquement Places API (New) et Routes API) ; restriction d'adresse IP du serveur si l'hébergeur fournit une IP sortante fixe ; quotas journaliers et alertes de budget.

**Fonctionnement et coûts** : une recherche d'adresse = suggestions puis détail du lieu choisi (même jeton de session). La recherche est réservée à un client qui a un panier en cours ou à un restaurateur/CEO connecté, exige un jeton de session Google, et est limitée (30 appels par 10 min et par personne, 120 par adresse IP, plafond journalier `PK_ADDRESS_DAILY_LIMIT`) : au-delà, réponse 429 et l'adresse peut être saisie à la main. Un calcul de tournée = **un seul** appel computeRouteMatrix (position du livreur + arrêts), réutilisé 2 minutes ; jamais un appel par point GPS ni par permutation. En cas de quota atteint ou de panne, des durées de moins de 15 minutes peuvent servir, signalées comme anciennes ; sinon l'ordre est conservé sans heure.

**Limites à connaître** :
- Les durées sont des **estimations** Google (trafic prévu), pas une garantie ; préparation restante et 5 min de manutention par arrêt sont ajoutées. Une estimation de plus de 10 minutes est affichée « à actualiser ».
- Ordre optimal exact jusqu'à 12 arrêts (énumération jusqu'à 8, puis programmation dynamique) ; au-delà, heuristique sans garantie d'optimum.
- Liens Google Maps : 3 étapes intermédiaires au maximum sur navigateur mobile et 2 048 caractères ; au-delà, la tournée est découpée en segments consécutifs. Waze et Plans ouvrent le prochain arrêt seulement.
- **GPS** : demandé à la connexion du livreur, point visé toutes les 3 s tant que l'application est **ouverte au premier plan**. Pas de suivi en arrière-plan : sur iPhone, écran verrouillé ou appli PWA suspendue = plus de position (affichée « ancienne » puis « interrompue » au restaurant et aux CEO). Une notification ne réveille pas le GPS.

### Notifications des espaces professionnels (Web Push) — facultatif

Sans configuration, l'appli fonctionne en **mode dégradé déclaré** : alertes sonores et notifications seulement quand l'application est ouverte au premier plan. L'état réel est affiché dans **CEO → Réglages → Service de notifications**.

| Variable / élément | Rôle |
|---|---|
| `pywebpush` | Bibliothèque d'envoi (déjà dans `requirements.txt`). Absente : mode dégradé. |
| `PK_VAPID_SUBJECT` | Contact exigé par les services push, par exemple `mailto:contact@votre-domaine` ou `https://votre-domaine`. Absent : mode dégradé. |
| `PK_RUNTIME/vapid-private.pem` | Clé VAPID **générée automatiquement** au premier usage (droits 600). Elle n'est jamais dans le dépôt ; la garder sur le disque permanent et dans les sauvegardes. Si elle est perdue ou changée, chaque appareil doit réactiver ses notifications. |

- HTTPS obligatoire (sinon ni service worker ni notifications).
- Le serveur doit pouvoir joindre les services push des navigateurs (Apple `*.push.apple.com`, Google `fcm.googleapis.com`, Mozilla `*.push.services.mozilla.com`).
- iPhone/iPad : iOS 16.4 minimum et application **ajoutée à l'écran d'accueil** puis ouverte depuis son icône ; le parcours guidé l'explique au premier usage. La permission n'est demandée qu'après un appui explicite.
- Un abonnement est enregistré par appareil et par espace (restaurateur, livreur, CEO). Il est retiré à la déconnexion de cet espace et désactivé lors d'un changement ou d'une réinitialisation de mot de passe et d'une désactivation de compte.
- Événements envoyés : paiement déclaré (restaurant concerné + CEO), nouvelle course payée (livreurs au service ouvert), commande prête (livreurs ayant accepté une part), alertes 5 et 15 minutes sans livreur et demande d'annulation (restaurant concerné + CEO). Les messages ne contiennent ni nom, ni téléphone, ni adresse du client.
- File durable en base, un seul envoi par appareil et par événement, 5 tentatives espacées en cas d'erreur, abonnement expiré (404/410) désactivé automatiquement.
- **Limite** : « transmis » signifie accepté par le service du navigateur, pas affiché. La réception réelle (écran verrouillé, application fermée) doit être vérifiée sur chaque modèle d'appareil avec le bouton « Envoyer une notification de test ». Une notification ne réveille pas le GPS.

### Horaires CalJ (Chabbat, zmanim, Daf Hayomi) — à obtenir avant activation

Aucun horaire CalJ n'est importé aujourd'hui : l'agenda affiche « Horaires CalJ : source non configurée » et garde ses horaires calculés localement, marqués **indicatifs**. **CEO → Agenda → Horaires CalJ** permet seulement d'enregistrer la source, la ville (Porto, Portugal) et une clé (coffre chiffré) ; l'option est désactivée par défaut et n'appelle aucun service.

À obtenir de CalJ (https://www.calj.net/, contact développeur) avant de concevoir l'import :
1. Le contrat d'API écrit : adresse(s) du service, format de réponse, méthode d'authentification (clé API, inscription), quotas et conditions d'usage (affichage, attribution, mise en cache autorisée et durée).
2. La sélection explicite de **Porto, Portugal** (identifiant de lieu ou coordonnées/altitude) : la page d'accueil de CalJ affiche Paris par défaut.
3. Les conventions de calcul : minutes d'allumage avant le coucher du soleil, définition de la sortie de Chabbat (tzeit), zmanim disponibles et leur méthode, ainsi que la validation par la communauté de Porto.
4. La disponibilité du Daf Hayomi par date et la langue des libellés.
5. Le fuseau `Europe/Lisbon` et le passage heure d'été/heure d'hiver dans les réponses.
6. Le comportement attendu si la source est indisponible (afficher « horaires indisponibles » plutôt qu'un horaire calculé ou parisien) et la règle de blocage des commandes pendant Chabbat à appliquer dans ce cas (décision humaine en attente).

## 2. Exemples d'hébergeurs

**Railway** (environ 5 $/mois, disque inclus)
1. Connecter le compte GitHub qui a accès à Kosh-app, puis New Project → Deploy from GitHub repo → Kosh-app.
2. Ajouter un Volume monté sur `/data`.
3. Ajouter les variables ci-dessus.
4. Settings → Networking → Generate Domain : c'est le lien public.

**Render**
1. New → Web Service → Kosh-app. Runtime : Python. Build : `pip install -r requirements.txt`. Start : `python server.py`.
2. Le disque permanent (Disks → `/data`) n'existe que sur les offres payantes. En gratuit, l'appli marche mais **les données sont perdues à chaque redémarrage**, et le service s'endort après 15 minutes sans visite. Ça suffit pour une démo, pas pour de vraies commandes.
3. Ajouter les variables ci-dessus.

## 3. Après la mise en ligne

1. Ouvrir `lien/ceo`, se connecter avec un compte créé par `PK_BOOTSTRAP_CEO`, puis **changer le mot de passe**.
2. Depuis le CEO, aller dans **Comptes** et créer un compte par restaurant (un mot de passe est généré automatiquement), plus les livreurs.
3. Chaque restaurateur se connecte sur `lien/restaurant`, enregistre son lien de paiement Revolut et ses horaires dans **Réglages**.
4. Faire une vraie commande test avec un premier restaurant.
5. Faire pointer la vitrine GitHub Pages (Tanous2/PortoKitch) vers le nouveau lien.

## 4. Ce qui ne doit jamais aller dans le dépôt

Le dossier `.runtime/` (base de données, clé de chiffrement), tout fichier `.sqlite3`, et tout mot de passe ou lien de paiement réel. Le fichier `.gitignore` exclut déjà `.runtime/`.

## 5. Points connus

- Wheelie Bradley (jeu bonus) : même fenêtre d'une heure que les trois jeux (ouverte par le serveur, partie arrêtée à l'échéance), record conservé sur le téléphone du joueur et **hors classement** tant que sa prise en compte n'est pas décidée.
- Chabad on Campus : badge « Kosher Certified », affiché en premier. Son adresse n'est jamais montrée, même aux livreurs. Plus généralement, l'adresse de collecte d'un restaurant n'est envoyée qu'au restaurateur concerné, aux CEO et aux livreurs ayant une part acceptée chez ce restaurant (jamais au public).
- Restaurants fermés (case « fermé », Chabbat ou hors horaires renseignés) : affichés en bas et grisés.
