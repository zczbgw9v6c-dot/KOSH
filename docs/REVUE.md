# Revue indépendante Kosh — lots 1 à 5b

Périmètre : `git diff 15f1347 HEAD` (lots 1, 2, 3, 4, 5a, 5b et matrice). Revue en lecture seule : aucun fichier applicatif modifié.
Référentiels : `docs/PROMPT-CLAUDE-KOSH.md` §3 à §10, `docs/kosh-agent-contract.md`, `docs/kosh-decisions.json` (règle effective), `DEPLOIEMENT.md`.
Date : 14/10/2026.

**Verdict : corrections nécessaires.** Les matrices déclarent tout « OK ». Cinq défauts importants reproduits les contredisent (R37, H20/C40, C36/W05, règle Chabad de `DEPLOIEMENT.md`, quotas Google §7). Aucun défaut critique n'a été trouvé.

## Environnement et vérifications réellement exécutées

| Vérification | Environnement | Résultat |
|---|---|---|
| Suite existante `python3 -m unittest discover -s tests` | Python 3.13, base SQLite temporaire | 121 tests OK |
| Tests front `node tests/*.cjs` (7 fichiers) | Node, `NODE_PATH=$(npm root -g)` | tous OK |
| Scénarios de reproduction `/tmp/kosh_review/test_review.py` (rv01 à rv14), harnais de `tests/test_flows.py` | base temporaire isolée, vrai serveur HTTP local | 14 exécutés ; ils démontrent les défauts ci-dessous |
| Parcours client KOSH avec Playwright et Chromium (profil iPhone 13) : `/tmp/kosh_review/client_journey.cjs`, `client_track.cjs`, `client_track2.cjs` | serveur lancé avec `PK_RUNTIME=/tmp/kosh_review/rt`, port 8899, comptes fictifs | voir §4 ; captures dans `/tmp/kosh_review/*.png` |

Commande : `cd /tmp/kosh_review && python3 -W ignore -m unittest -k test_rv test_review`.

Ce qui n'a pas été vérifié : réception push sur un appareil physique, GPS réel, clés Google réelles, iPhone physique et CalJ (aucune intégration à tester).

---

## 1. Défauts importants

### I-1 — Le restaurant voit le GPS du livreur chez le client d'une autre enseigne (R37, §7)
- **Où** : `server.py:84` (`order_view`, `row['position']=gps_view(...)` pour toute part `accepted`/`collected`) et `server.py:881` (`result['drivers']`, GPS de tout livreur « assigné »).
- **Scénario (rv03)** : le livreur accepte puis collecte une commande levfood et une commande kosherfc. Il se gare chez le client kosherfc (41.188888, -8.655555) et envoie sa position. Ensuite, `GET /api/bootstrap?portal=restaurant` pour levfood.
- **Observé** : `parts[0].position = 41.188888, -8.655555`. Le restaurant levfood suit en direct le livreur jusqu'à la porte d'un client qui n'est pas le sien. Après la livraison de ce client, il continue de recevoir le GPS. Le test existant `test_shared_tour_reveals_no_gps_route_or_other_customer` passe uniquement parce que la position n'y est jamais placée chez l'autre client.
- **Conséquence** : la règle R37 (« sans accès aux autres clients ») et le §7 (« Un restaurant ne doit pas voir les autres clients d'une tournée partagée ») sont violés. L'adresse approximative d'un autre client fuit.
- **Correction** : ne fournir la position au restaurant que lorsque le prochain arrêt de la tournée du livreur (`tour_context(...).order[0]`) appartient à une commande de ce restaurant (collecte ou livraison). Sinon, renvoyer `{state:'busy'}` avec l'ETA autorisée et sans coordonnées. Appliquer la même règle à `result['drivers']`. Ajouter un test avec une position chez l'autre client.

### I-2 — `/api/menu` permet au restaurateur de réactiver Uber Colis coupé par un CEO (H20, C40)
- **Où** : `server.py:1266` et suivantes (`/api/menu` enregistre `value` en entier, y compris `service`). Seul `/api/service` (`server.py:1298`) réserve `uber` au CEO.
- **Scénario (rv01)** : le CEO coupe Uber pour levfood (`/api/service {merchant:'levfood',action:'uber',enabled:false}`), puis le restaurant coupe la livraison Kosh. Une commande `mode:'uber'` est alors refusée (409). Le restaurant renvoie sa carte avec `service.uber=true` par `/api/menu`, ce qui répond 200, et la commande Uber passe (200).
- **Conséquence** : la réservation au CEO est contournée. Le même chemin permet d'écrire n'importe quel champ de `service` (`session`, `openedAt`, `preordersAt`…) sans les contrôles de `/api/service`. Défaut préexistant que le lot 5a n'a pas fermé : il protège `promos` et l'adresse de collecte, mais pas `service`.
- **Correction** : dans `/api/menu`, recopier `current['service']` (et `closed` si ce champ doit passer par `/api/service`) comme c'est fait pour `promos`. Ajouter un test.

### I-3 — L'adresse de collecte Chabad est publique pour tout visiteur et pour les livreurs (DEPLOIEMENT.md : « Son adresse n'est jamais montrée, même aux livreurs »)
- **Où** : `server.py:375` (`effective_menu` public : clés `address`, `lat`, `lon`). Le masquage n'existe que dans `tour_stops` (`server.py:721`).
- **Scénario (rv02)** : le CEO enregistre l'adresse de collecte de `chabad-porto`. Un navigateur anonyme appelle `GET /api/bootstrap`.
- **Observé** : `menus['chabad-porto'] = {address:'Rua Secreta 12, Porto', lat:41.1611, lon:-8.6222}`. Le bootstrap du livreur contient aussi l'adresse.
- **Correction** : retirer `address`, `lat` et `lon` du menu public pour les enseignes privées, et plus généralement pour le client, qui n'en a pas besoin pour commander. Le livreur ne lit ces données que par sa tournée. Ajouter un test sur le payload anonyme et sur celui du livreur.

### I-4 — La restauration d'une carte marque comme « vérifiées » des coordonnées anciennes non vérifiées (C36, W05)
- **Où** : `server.py:165-168` (`restore_menu` restaure `address`/`lat`/`lon` mais garde `pickupVerified`/`placeId`/`pickupPrecision` de l'état courant).
- **Scénario (rv13)** : une version de carte contient des coordonnées anciennes non vérifiées (41.0001, -8.0001). Le restaurant enregistre ensuite une adresse Google vérifiée. Le CEO restaure l'ancienne version.
- **Observé** : `{address:'Ancienne adresse ORS', lat:41.0001, lon:-8.0001, pickupVerified:True, placeId:'p'}`. `tour_stops` traite ce point comme vérifié : durées Google calculées et liens de navigation vers un mauvais lieu.
- **Correction** : ne jamais restaurer le point de collecte par `restore_menu`, puisque l'adresse ne change que par `/api/pickup` (règle du lot 4). À défaut, restaurer ensemble `address`, `lat`, `lon`, `pickupVerified`, `placeId` et `pickupPrecision`.

### I-5 — Proxy Google Places ouvert à tout visiteur, sans limite (§7 « Gérer quotas », coût facturé)
- **Où** : `server.py:933` (`/api/address` : `require(client or actor)`). N'importe quel visiteur obtient une session client en appelant `/api/bootstrap`. Aucune entrée `LIMITS` n'est prévue.
- **Scénario (rv07)** : un navigateur anonyme fait 60 appels `/api/address` consécutifs (clé simulée, `autocomplete` remplacé par un faux fournisseur). Résultat : 60 sur 60 sont acceptés.
- **Conséquence** : la clé Google n'est pas exposée, mais elle est utilisable à volonté par n'importe qui, avec des appels Places facturés.
- **Correction** : appliquer une limite par session client et par IP (par exemple 30 requêtes par 10 min), un plafond global journalier, et réserver `placeId` (Place Details) à une session ayant déjà un panier ou une suggestion récente.

---

## 2. Défauts mineurs (8)

| # | Où | Scénario exécuté et résultat | Correction |
|---|---|---|---|
| m-1 | `server.py:254` `PART_MINE` inclut `delivered` | rv04 : après livraison et commande `done`, le bootstrap livreur contient toujours `name`, `tel` et `addr` du client. L'accès est conservé indéfiniment. | Limiter les détails privés aux parts `accepted`/`collected`, plus une courte fenêtre après livraison. |
| m-2 | `server.py:1213` `/api/dispatch` | rv11 : le CEO propose 10 sacs à un livreur de capacité 5. Les 10 sacs sont retirés des offres des autres (`offers: []`) tant qu'il ne répond pas ; à l'acceptation il n'en garde que 5. | Plafonner la proposition à la capacité disponible, ou ne pas compter `proposed` dans `PART_HELD` au-delà de cette capacité. |
| m-3 | `server.py:1051` `/api/login` | rv14 : après 10 échecs, `restaurant@…` reçoit 429 mais `Restaurant@…` se connecte (200). La clé de limitation n'est pas normalisée alors que la requête SQL utilise `lower()`. Défaut préexistant. | Construire la clé avec `login.lower()`. |
| m-4 | `server.py:400` `cancel_order` | rv06 : annulation acceptée alors que tous les sacs sont collectés et aucun livré. Les parts passent à `cancelled` et le stock est restitué alors que la marchandise est chez le livreur. Ce cas est proche du §9.1, non décidé. | Le traiter comme le §9.1 : refuser et poser la question à Ethan, ou documenter explicitement ce choix. |
| m-5 | `server.py:159` `effective_service` | Lecture du code et test existant `test_uber_has_no_kosh_fee…` : `uber` vaut `True` par défaut (global et local). Un restaurant qui coupe sa livraison Kosh rend Uber disponible sans action CEO. Comportement préexistant. | Question pour Ethan : Uber doit-il être désactivé par défaut (H20 « réservé aux CEO ») ? |
| m-6 | `integrations.py:40` et `server.py:193` | Lecture du code : une seule clé Fernet (`.runtime/integration.key`) chiffre le coffre des mots de passe, les clés Google et les jetons d'adresse remis aux clients. Elle est stockée à côté de la base : une sauvegarde de `.runtime` suffit à tout déchiffrer. | Clés dérivées séparées par usage ; clé du coffre hors du répertoire de la base (variable d'environnement ou fichier séparé) ; le documenter dans `DEPLOIEMENT.md`. |
| m-7 | `push.py:106` `unsubscribe` | Lecture du code : la désinscription filtre sur `(endpoint, role)` sans le compte. Un compte du même rôle qui connaît l'endpoint peut désabonner l'appareil d'un autre. Risque faible, car l'endpoint n'est pas public. | Ajouter `AND account=?`. |
| m-8 | `server.py:866` bootstrap public | Lecture du code : `events` expose `updatedBy` (identifiant de compte CEO) et les menus publics exposent l'objet `service` brut (`session`, `openedAt`). Ce sont des fuites d'informations internes mineures. | Filtrer ces champs dans les vues publiques. |

---

## 3. Points contrôlés sans défaut trouvé (preuves exécutées)

- **Concurrence des parts** : rv05, 5 essais de 18 acceptations parallèles par 3 livreurs sur 10 sacs. Le total accepté ne dépasse jamais 10 et aucun livreur n'a deux parts. Les tests existants sur l'acceptation simultanée, le dernier stock et le dernier code promo passent.
- **Frais** : rv10, livraison de 10 sacs répartie entre 2 livreurs : `fee 3.5`, total inchangé. Retrait 0,50 et Uber 0 (tests existants). Plus de `COM=1.5` dans `index.html`.
- **Coffre et sessions** : rv08. Après changement de mot de passe, l'ancienne session répond 401. Le coffre contient la nouvelle valeur et seul le CEO la lit (restaurant et livreur : 401). Le mot de passe n'apparaît ni dans le bootstrap CEO ni dans la table `audit`.
- **Routes retirées** : rv09. `/api/finance`, `/api/upload` et `/api/ai` répondent 410 en POST et 404 en GET ; `/api/ceo config` répond 410 ; `/page/*`, `server.py`, `.runtime/…`, `docs/…` et `tests/…` répondent 404.
- **Alerte partielle** : rv12. Pour 10 sacs dont 5 acceptés, sans livreur depuis 16 min, on obtient `level 15, bags 5, partial true`.
- **Règles relues dans le code** : message de refus d'annulation exact (`CANCEL_REFUSED`) ; médiane proposée une seule fois et jamais appliquée sans action `accept` du restaurateur ; alertes 5/15 détectées côté serveur ; proposition de retrait manuelle sans conversion financière ; clôture sans annulation ; service livreur fermé (pas d'offre, pas d'acceptation, parts terminables) ; tournée (précédence collecte puis livraison, capacité, objectif « fin de tous les arrêts », Held-Karp exact jusqu'à 12 arrêts) ; jeux (échéance serveur, commande annulée qui ferme l'accès, Wheelie hors classement).

## 4. Parcours client KOSH (Chromium, profil iPhone 13)

- **Accueil** : Chabad on Campus apparaît en premier avec le badge « Kosher Certified ». « Le J » fermé est grisé (`is-shut`, `grayscale(.55)`) avec la mention « Fermé · ouvre à 12:30 ».
- **Épicerie Kosher Go** : rayons présents (Promotions, Nouveautés, Confiseries, Vin, …, Shabbat).
- **Agenda** : vue « Cette semaine », du dimanche au samedi.
- **Suivi** : l'écran de suivi affiche les étapes Confirmée, En cuisine, En route, Arrivée, puis les jeux Pita Pulse, Golden Stack, Porto Flight et Wheelie Bradley (bonus). Aucune carte ni coordonnée côté client ; le bootstrap client ne contient ni `41.15` ni `drivers`.
- **Erreurs JavaScript** : aucune. Seules les ressources externes (tuiles) échouent, faute de réseau dans le bac à sable.
- **Aucune régression constatée.** Une remarque hors diff : l'écran de suivi affiche « Commande confirmée » pour une commande encore au statut `pay` (non payée). Comportement préexistant, à vérifier.

## 5. Corrections demandées à l'orchestrateur

1. I-1 à I-5, chacun avec un test de non-régression qui reproduit le scénario ci-dessus.
2. Mettre à jour les lignes de matrice correspondantes, aujourd'hui « OK » à tort : R37, H20/C40, C36, et la ligne Chabad ou R-client concernée.
3. Faire trancher par Ethan m-4 (annulation après collecte totale) et m-5 (Uber activé par défaut).
4. Les mineurs peuvent suivre dans un lot de finition.

---

## 6. Corrections (14/10/2026)

Commit « Corrections de la revue indépendante » (suivant 3a9ad29). Chaque test ci-dessous (`tests/test_flows.py`) échoue sur 3a9ad29 et passe après correction (vérifié en remettant `server.py`, `push.py` et `integrations.py` dans leur état d'origine : 13 échecs + 1 erreur sur 14).

| Défaut | Correction | Test permanent |
|---|---|---|
| I-1 (R37) | `gps_merchant` : le restaurant ne reçoit la position que si le prochain arrêt est le sien et qu'aucun sac collecté d'une autre enseigne n'est à bord ; un point antérieur à une livraison pour une autre enseigne reste masqué. Sinon `{state:'busy'}`. Même règle pour `drivers`. CEO inchangé. | `test_review_i1_restaurant_never_sees_courier_at_other_brand_customer`, `test_review_i1_restaurant_hidden_while_courier_heads_to_other_pickup` |
| I-2 (H20/C40) | `/api/menu` recopie `service` et `closed` stockés hors CEO (valeurs envoyées ignorées). | `test_review_i2_menu_save_cannot_change_uber_or_service` |
| I-3 (Chabad) | Menus publics sans `address/lat/lon` ; livreur : adresse seulement pour les restaurants où il a une part acceptée, jamais `chabad-porto` ; restaurateur concerné et CEO : complet. Le client invité à retirer reçoit `pickupAddress` sur sa propre commande (hors Chabad). | `test_review_i3_pickup_address_only_for_accepted_couriers_and_never_chabad` |
| I-4 (C36/W05) | `restore_menu` ne restaure plus le point de collecte (seul `/api/pickup` le change). | `test_review_i4_restore_never_marks_old_coordinates_verified` |
| I-5 (§7 quotas) | `/api/address` : jeton de session Google requis (400), client avec panier valide ou restaurateur/CEO connecté (403), 30 appels/10 min par personne, 120 par IP, plafond journalier `PK_ADDRESS_DAILY_LIMIT` (défaut 2000) → 429. | `test_review_i5_address_search_is_reserved_and_rate_limited` |
| m-1 | Coordonnées client masquées 30 min après la livraison de la part du livreur (`detailsExpired`). | `test_review_m1_courier_loses_customer_details_after_delivery_grace` |
| m-2 | Proposition CEO plafonnée à la capacité disponible (409 au-delà ; sans nombre : min(restant, disponible)). | `test_review_m2_ceo_proposal_limited_to_available_capacity` |
| m-3 | Clé de limitation de connexion en minuscules. | `test_review_m3_login_limit_ignores_case` |
| m-4 **provisoire, réversible** | Annulation refusée dès qu'un sac est collecté ou livré, même message « règle non décidée ». À trancher par Ethan. | `test_review_m4_cancel_refused_when_all_bags_collected` |
| m-5 **provisoire, réversible** | Uber Colis désactivé par défaut tant qu'un CEO ne l'a pas activé en global ET pour l'enseigne (interface alignée). À trancher par Ethan. | `test_review_m5_uber_off_until_ceo_enables_global_and_establishment` |
| m-6 | `PK_SECRET_KEY` (clé Fernet) prioritaire ; l'ancien `integration.key` reste lisible (MultiFernet) ; documenté dans `DEPLOIEMENT.md` (sauvegarde). Clés séparées par usage : non fait. | `test_review_m6_secret_key_from_environment_keeps_existing_data` |
| m-7 | Désabonnement push filtré sur le compte. | `test_review_m7_push_unsubscribe_checks_account` |
| m-8 | `events.updatedBy` et `service` brut retirés des données publiques. | `test_review_m8_public_data_has_no_ceo_id_or_raw_service` |

Tests adaptés sans affaiblir d'assertion : activation explicite d'Uber par un CEO (m-5) et ajout de `session`/`cart` aux appels `/api/address` (I-5).

Vérifications : `python3 -m unittest discover -s tests` 135 OK ; 7 suites node OK ; `/tmp/kosh_review/test_review.py` : rv01, rv02, rv03, rv07, rv11, rv13, rv14 échouent désormais (défaut disparu), rv06 renvoie 409, rv04 passe encore car il lit pendant le délai de grâce de 30 min ; rv05/08/09/10/12 inchangés OK. Chromium 390×844 : accueil (Chabad en premier, « Kosher Certified », pas de défilement horizontal), suivi d'une commande Chabad avec étapes et jeux, aucune erreur JS ; bootstrap public sans adresse ni `service`.
