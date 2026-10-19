# Matrice A (Accès) et W (Règles entre comptes et client) — état après lot 5b (14/10/2026)

Revérification de chaque identifiant dans le code actuel (lots 1 à 5b). Preuves : fonctions/routes et tests exécutés
(`python3 -m unittest discover -s tests` : 121 tests OK ; `node tests/*.cjs` : 7 scripts OK, dont `tests/lot5b.cjs`)
et contrôle navigateur Chromium 390×844 et 1366×900 (script Playwright hors dépôt, serveur et base isolés).
Abréviations : SRV = server.py, PUSH = push.py, PJ = js/professional.js, OPS = js/operations.js, NOTIF = js/notifications.js,
IDX = index.html, TF = tests/test_flows.py, L5B = tests/lot5b.cjs.

## A — Accès

| ID | Règle (≤12 mots) | État observé | Preuve / écart restant | Fichiers | Effort |
|---|---|---|---|---|---|
| A01 | Trois espaces distincts restaurateur, CEO, livreur | OK | Routes `/restaurant`, `/livreur`, `/ceo` ; `/api/login` exige le rôle de l'espace ; cookie `pk_staff_<rôle>`. TF `test_three_professional_sessions_in_one_browser_and_separate_logout`. | SRV | 0 |
| A02 | Connexion individuelle e-mail + mot de passe | OK | `/api/login` scrypt + `hmac.compare_digest`, 10 essais / 15 min. | SRV | 0 |
| A03 | Création des comptes pro réservée aux CEO | OK | `/api/ceo action=account` sous `staff(('ceo',))`, plafond `MAX_ACTIVE_CEO` (création, réactivation, CLI, bootstrap). TF `test_three_active_ceo_maximum_and_reactivation_keeps_vault`, `test_ceo_cannot_overwrite_own_account_with_public_registration`. | SRV | 0 |
| A04 | Restaurateur limité à son établissement | OK | `scope()` ; bootstrap filtré ; push restaurant filtré par `merchant` (PUSH `enqueue`). TF `test_restaurant_cannot_view_or_modify_other_restaurant`, `test_push_subscription_dedup_unsubscribe_and_simulated_failures` (autre restaurant non notifié). | SRV, PUSH | 0 |
| A05 | CEO accède à tous établissements et opérations | OK | `scope()` laisse passer `ceo` ; bootstrap CEO complet (comptes, audit, archives, push, CalJ). | SRV | 0 |
| A06 | Offres : compte livreur actif ET service ouvert par CEO | OK | Table `couriers` (`open`) distincte de `accounts.active` ; `offer_for` / `accept_part`. TF `test_closed_service_shows_no_offer_and_refuses_acceptance`, `test_closing_service_keeps_accepted_parts_finishable`. | SRV | 0 |
| A07 | Sessions des trois espaces simultanées, même navigateur | OK | Cookies par rôle `staff_cookie(role)`, `actor()` choisi par `X-PK-Portal`. TF `test_three_professional_sessions_in_one_browser_and_separate_logout`. | SRV, PJ | 0 |
| A08 | « Rester connecté 30 jours » persistant | OK | `remember` → TTL 30 j, `Max-Age`. TF `test_staff_session_remember_option_sets_thirty_day_cookie` ; la case est lue depuis le formulaire (L5B). | SRV, PJ, OPS | 0 |
| A09 | Déconnexion limitée à l'espace choisi | OK | `/api/logout` supprime le seul cookie du portail ; lot 5b : retire aussi l'abonnement push de cet espace sur cet appareil (NOTIF `A.pk logout`). TF test de sessions simultanées. | SRV, NOTIF | 0 |
| A10 | Changement MDP : actuel contrôlé, confirmation, coffre CEO actualisé | OK | Lot 5b : `/api/password` exige l'actuel, la **confirmation côté serveur** (`confirm`), refuse l'identique ; hachage + `save_credential` (Fernet), audit `account.password`, consultation coffre auditée `credential.view`. Formulaire `<form>` avec confirmation (OPS `pkPasswordForm`). TF `test_password_change_checks_current_and_confirmation_updates_vault_audits_and_revokes`, `test_professional_password_vault_and_personal_change` ; L5B (envoi `confirm`, refus si différents). | SRV, OPS | 0 |
| A11 | Anciennes sessions fermées après changement/réinitialisation | OK | `revoke_access()` : sessions + abonnements push du compte (changement, reset, désactivation). TF test A10 (deux navigateurs → 401), `test_disabled_account_sessions_are_revoked`, `test_push_…` (reset → plus d'envoi). | SRV, PUSH | 0 |
| A12 | Formulaires de connexion stables, autoremplissage, touche Entrée | OK | Lot 5b : `pkLogin` et `pkPasswordForm` sont de vrais `<form>` (`autocomplete="username"/"current-password"/"new-password"`, bouton `submit`), valeurs lues dans le formulaire au `submit` (autoremplissage sans événement `input`). Polling sans rendu pendant la saisie. L5B (submit) ; Chromium : connexion par Entrée aux deux tailles, champ conservé après 11 s de polling. | PJ, OPS | 0 |
| A13 | Données dans une base partagée entre appareils | OK | SQLite serveur ; TF `test_customer_account_restores_orders_on_another_device`. | SRV | 0 |
| A14 | Chaque espace installable comme application web | OK | Manifestes `/manifest/<rôle>.webmanifest` + `sw.js` (servi `no-cache`, sans cache hors ligne). TF `test_service_worker_and_role_manifests_are_served` ; Chromium : service worker enregistré. Installation sur iPhone physique non vérifiée ici. | SRV, sw.js, NOTIF | 0 |
| A15 | Navigation par rôle ; retirer Coûts du menu CEO | Retiré OK | Menu CEO : Commandes, Enseignes, Comptes, Réglages, Historique, Agenda (Chromium). Finances/Studio supprimés de l'UI, routes 410. TF `test_retired_studio_and_finance_routes_keep_existing_data`, `test_retired_studio_pages_and_styles_are_not_published_but_kept`. | PJ, OPS, SRV | 0 |
| A16 | Interface adaptée iPhone et Mac | OK | Contrôlé dans Chromium 390×844 et 1366×900 (CEO, guides notifications, jeux ; pas de débordement horizontal). Lot 5b : le dock réapparaît 350 ms après la sortie de champ pour ne pas recouvrir le bouton touché. Pas d'appareil physique. | IDX, professional.css | 0 |
| A17 | Harmonisation champs, boutons, dimensions, typographies | OK | Un seul jeu de contrôles (`professional.css`), composants communs `inp`/`pkButton`/`pkSelect`. La charte (polices) reste celle du dépôt, non modifiée. | professional.css, PJ | 0 |
| A18 | Signaler connexion interrompue et données anciennes | OK | Pro : bandeau `!PK.online`. Lot 5b : bandeau équivalent côté client (`render` public). Positions/estimations anciennes signalées (lot 4, TF `test_old_positions_and_estimates_are_never_shown_as_current`). | PJ, IDX | 0 |
| A19 | Retrait immédiat des infos privées à expiration | OK | Sur 401 : `PK.me/PK.data/PK.credential` vidés et, lot 5b, `store.orders` purgé côté pro ; mot de passe affiché masqué après 60 s, à `pagehide` et en arrière-plan (L5B). | PJ, OPS | 0 |
| A20 | Activation des notifications sur l'appareil | OK | Lot 5b : parcours guidé (NOTIF `pnPanel`, `pnFirstUse`), permission seulement sur appui, abonnement Web Push par appareil et par rôle, diagnostic et « Vérifier à nouveau ». L5B ; Chromium (guide affiché au premier usage). Réception réelle : voir W22. | NOTIF, SRV, PUSH | 0 |

## W — Règles entre comptes et client

| ID | Règle (≤12 mots) | État observé | Preuve / écart restant | Fichiers | Effort |
|---|---|---|---|---|---|
| W01 | Commande client sans compte | OK | Cookie invité `pk_client`. TF `test_order_prices_and_time_are_server_controlled`. | SRV | 0 |
| W02 | Panier limité à une seule enseigne | OK | `create_order` un seul `m`. | SRV, IDX | 0 |
| W03 | Prix, options, promotions, stocks vérifiés serveur | OK | `create_order`. TF options, promos, menus (`test_required_product_options_are_verified_server_side`, `test_percent_and_gift_codes_apply_only_with_their_code`). | SRV | 0 |
| W04 | Pas de double réservation concurrente du stock | OK | `LOCK` + `BEGIN IMMEDIATE`. TF `test_last_promo_use_and_last_stock_are_reserved_once_under_concurrency`. | SRV | 0 |
| W05 | Adresse validée via suggestion Google, numéro conservé | OK | Jeton d'adresse produit par le serveur (lot 4) ; restauration de carte sans effet sur le point vérifié (revue I-4). TF `test_delivery_and_pickup_addresses_come_from_server_verified_results`, `test_places_autocomplete_then_details_with_street_number`, `test_review_i4_restore_never_marks_old_coordinates_verified`. | SRV, integrations.py | 0 |
| W06 | Coordonnées vérifiées utilisées pour les trajets | OK | Destination issue du jeton ; `destination` réservé CEO/restaurant et marqué non vérifié. TF `test_driver_cannot_cancel_sale_or_edit_eta_and_destination`. | SRV | 0 |
| W07 | Frais livraison Kosh 3,50 € par commande | OK | `fee=350` ; libellés « Livraison Kosh », plus de Glovo ni commission. TF `test_fees_kosh_delivery_pickup_and_no_commission`. | SRV, IDX | 0 |
| W08 | Retrait 0,50 € ; Uber Colis sans frais ; conversion à confirmer | OK | TF `test_uber_has_no_kosh_fee_and_pickup_costs_fifty_cents`. Conversion avec accord client (W18), frais inchangés et mention « traitement manuel » ; remboursement différentiel = décision humaine non prise (§9.2), non inventé. | SRV | 0 |
| W09 | Paiement Revolut, confirmation manuelle du restaurant | OK | `paid` → `decl` → `ok` par restaurant/CEO ; lot 5b : push « Paiement déclaré » au restaurant concerné et aux CEO. TF `test_validated_payment_records_receipt_time`, `test_push_…`. | SRV | 0 |
| W10 | Statuts synchronisés client, restaurant, livreur, CEO | OK | `order_view` par portail, aucune position/tournée côté client. TF `test_client_payload_never_contains_driver_gps_or_route`, `test_ten_bags_split_five_five_with_independent_departure`. | SRV | 0 |
| W11 | Ticket affiché automatiquement après validation du paiement | OK | `pkQueueReceipts` (OPS). operations.cjs. | OPS | 0 |
| W12 | Estimation : trajets Google, préparation, 5 min/arrêt, parts | OK | `tour.py` + Routes API (lot 4). tests/test_tour.py (6 ordres, préparation, 5 min). | tour.py, SRV | 0 |
| W13 | Cinq minutes de manutention par arrêt | OK | test_tour `test_each_stop_has_arrival_wait_and_five_minutes_of_handling`. | tour.py | 0 |
| W14 | Distinguer estimation Google et délai manuel ; livreur sans délai manuel | OK | `eta` réservé CEO/restaurant. TF `test_driver_cannot_cancel_sale_or_edit_eta_and_destination`. | SRV, PJ | 0 |
| W15 | Pas d'arrivée calculée présentée comme actuelle si données anciennes | OK | TF `test_old_positions_and_estimates_are_never_shown_as_current`. | SRV, PJ | 0 |
| W16 | Alertes commandes payées sans livreur à 5 et 15 min | OK | `scan_courier_alerts` + `alert_loop` serveur ; lot 5b : push au restaurant concerné et aux CEO, une seule fois par seuil. TF `test_alerts_after_five_and_fifteen_minutes_without_courier`. | SRV | 0 |
| W17 | Jamais d'annulation/remboursement auto faute de livreur | OK | Clôture sans annulation. TF `test_service_close_keeps_received_orders_and_history`. | SRV | 0 |
| W18 | Accord client avant transformation livraison → retrait | OK | TF `test_pickup_proposal_after_fifteen_minutes_accepted_by_customer`, `test_pickup_proposal_refused_changes_nothing`. | SRV, PJ | 0 |
| W19 | Annulation après paiement : décision restaurant ou CEO | OK | Demande client + message standard ; lot 5b : push « Demande d'annulation ». TF `test_customer_cancellation_request_refused_with_standard_message`. | SRV, PJ | 0 |
| W20 | Stocks restitués une seule fois à l'annulation | OK | TF `test_cancel_restores_stock_once_and_revokes_game`, `test_accepted_cancellation_restores_stock_once_even_after_preparation`. | SRV | 0 |
| W21 | Client : confirmer réception, noter, réclamer | OK | TF `test_complaints_can_be_replied_to_only_by_correct_restaurant`. | SRV | 0 |
| W22 | Alertes et push, guide de première activation | OK | Lot 5b : `sw.js`, clés VAPID générées dans `PK_RUNTIME` (hors dépôt), table `push_subscriptions` (appareil × rôle), file `push_queue` dédoublonnée `UNIQUE(endpoint,event)`, 5 essais, expiration 404/410, désabonnement, révocation ; mode dégradé déclaré sans `pywebpush`/`PK_VAPID_SUBJECT` ; guide iPhone ≥ 16.4. TF `test_push_subscription_dedup_unsubscribe_and_simulated_failures` (émetteur simulé), L5B. Envoi réel contrôlé avec pywebpush 2.5 et HTTP simulé (chiffrement + en-tête VAPID). **Externe** : réception réelle sur appareils non vérifiable ici (réseau bloqué, pas d'iPhone). | PUSH, SRV, NOTIF, sw.js | 0 |
| W23 | Blocage Chabbat Porto + CalJ (zmanim, Daf Hayomi) dans agenda | Externe/bloqué | Horaires calculés localement, affichés « indicatifs » ; lot 5b : emplacement CEO CalJ (source, Porto/Portugal, clé chiffrée) désactivé par défaut, statut public « source non configurée », aucun appel ni horaire inventé. TF `test_calj_slot_is_disabled_by_default_and_never_invents_times`. Bloqué : contrat d'accès CalJ et méthode religieuse (§9.5) — liste à obtenir dans DEPLOIEMENT.md. | SRV, PJ, IDX, DEPLOIEMENT.md | M (après CalJ) |
| W24 | Horaires/restrictions générales et locales appliqués ensemble | OK | `effective_service`. TF `test_restaurant_modes_stay_within_ceo_limits`, `test_global_schedule_blocks_orders_and_is_public`. | SRV | 0 |

## Comptes par état

- A (20) : OK 19 · Retiré OK 1 (A15).
- W (24) : OK 23 · Externe/bloqué 1 (W23).
- Total 44 : OK 42, Retiré OK 1, Externe/bloqué 1, Partiel 0, Absent 0.

## Éléments externes et limites

- Réception Web Push réelle (écran verrouillé, application fermée, iPhone iOS ≥ 16.4 installé sur l'écran d'accueil) : à vérifier sur appareils avec « Envoyer une notification de test ». « Transmis » ≠ reçu.
- CalJ : contrat d'API, sélection Porto, conventions des zmanim et comportement en absence de données (DEPLOIEMENT.md).
- Installation PWA et GPS sur iPhone physique non vérifiés ici (Chromium uniquement).

## Contrats partagés touchés (lot 5b)

- Tables : `push_subscriptions`, `push_queue` (nouvelles, additives). Docs : `conf/calj`, `secret/calj`, `events/*` (validées). Fichier runtime `vapid-private.pem` (600).
- Routes : `POST /api/push` (`status`, `subscribe`, `unsubscribe`, `test`), `/api/ceo action=calj`, `/api/events` (validation, édition, audit), `/api/password` (`confirm` requis), `/api/games/start` (`wheel`), `GET /sw.js` ; `/page/*` → 404.
- Bootstrap : `push` (portails pro), `calj` (public), `caljConfig` + statut push (CEO), `audit[].actorName` ; `conf` public réduit à `open, glo, pickup, uber`.
