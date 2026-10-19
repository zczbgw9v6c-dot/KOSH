# Matrice C (CEO) · H (Historique) · G (Jeux) — état après lot 5b (14/10/2026)

Revérification de chaque identifiant dans le code actuel. Preuves : tests exécutés (121 tests Python, 7 scripts Node dont
`tests/lot5b.cjs`) et contrôle Chromium 390×844 et 1366×900 (CEO : menus, réglages, agenda, historique, enseignes ;
guides de notifications restaurateur/livreur ; jeux, Wheelie et échéance). Abréviations : SRV = server.py, PUSH = push.py,
PJ = js/professional.js, OPS = js/operations.js, NOTIF = js/notifications.js, IDX = index.html, ARC = js/arcade.js,
TF = tests/test_flows.py, L5B = tests/lot5b.cjs.

## C — Espace CEO

| ID | Règle (≤12 mots) | État observé | Preuve / écart restant | Fichiers | Effort |
|---|---|---|---|---|---|
| C01 | Trois comptes CEO actifs maximum | OK | `active_ceo_count` à la création, réactivation, CLI et bootstrap. TF `test_three_active_ceo_maximum_and_reactivation_keeps_vault`. | SRV | 0 |
| C02 | Mêmes droits pour les trois CEO | OK | `staff(('ceo',))` sans distinction. | SRV | 0 |
| C03 | Pas d'inscription publique comme CEO | OK | TF `test_ceo_cannot_overwrite_own_account_with_public_registration`. | SRV | 0 |
| C04 | Créer un compte restaurateur | OK | `/api/ceo action=account`. TF A10. | SRV, PJ | 0 |
| C05 | Lier le restaurateur à un établissement | OK | `mid in MERCHANTS` requis. TF `test_establishment_is_linked_only_to_restaurant_accounts`. | SRV | 0 |
| C06 | Livreur toutes enseignes ; ouverture du service par tournée | OK | `driver-service` open/close distinct de la désactivation. TF `test_closing_service_keeps_accepted_parts_finishable`. | SRV, PJ | 0 |
| C07 | Créer un autre CEO dans la limite | OK | Voir C01. | SRV | 0 |
| C08 | Saisir le nom et l'e-mail | OK | `name`, `login` avec `@`, unicité 409. | SRV, PJ | 0 |
| C09 | Champ établissement seulement pour les restaurateurs | OK | Lot 5b : sélecteur affiché seulement si rôle Restaurateur (re-rendu au changement), non envoyé sinon ; serveur ignore `merchant` hors restaurateur. TF `test_establishment_is_linked_only_to_restaurant_accounts` ; L5B. | PJ, OPS, SRV | 0 |
| C10 | Générer un mot de passe pro | OK | `secrets.token_urlsafe(18)`. | SRV | 0 |
| C11 | Tenter la copie automatique | OK | `pkRememberCredential` → `navigator.clipboard.writeText`. L5B (copie réussie). | OPS | 0 |
| C12 | Bouton Copier et champ sélectionnable si échec | OK | `pkCredentialView` (champ lecture seule + Copier). L5B (copie refusée → message « Copier »), operations.cjs. | OPS | 0 |
| C13 | Réinitialiser un mot de passe | OK | `action=reset` : hash, coffre, `revoke_access` (sessions + push). TF A10, `test_push_…`. | SRV | 0 |
| C14 | Désactiver et fermer les sessions | OK | `disable` + `revoke_access` ; coffre conservé. TF `test_disabled_account_sessions_are_revoked`. | SRV | 0 |
| C15 | Réactiver en conservant le mot de passe | OK | `action=enable`, coffre gardé. TF `test_three_active_ceo_maximum_and_reactivation_keeps_vault`. | SRV, PJ | 0 |
| C16 | Liste des comptes, rôles et états | OK | `pkAccounts` (rôle, Désactivé, coffre). | PJ | 0 |
| C17 | Coffre chiffré des mots de passe, CEO seulement | OK | `save_credential` Fernet, clé runtime. TF `test_professional_password_vault_and_personal_change`, A10 (valeur absente des audits et du coffre en clair). | SRV | 0 |
| C18 | Afficher un mot de passe du coffre | OK | `action=credential` + `credential-show`. | SRV, OPS | 0 |
| C19 | Journaliser la consultation du coffre | OK | `audit credential.view` (acteur, compte). TF A10 (ligne d'audit exacte + `actorName`). | SRV | 0 |
| C20 | Masquer à la déconnexion ou à l'expiration | OK | Lot 5b : masqué après 60 s, à `pagehide`, au passage en arrière-plan, à la déconnexion, au changement de section et sur 401 ; jamais en stockage navigateur. L5B (minuteur, aucun mot de passe dans `localStorage`). | OPS, PJ | 0 |
| C21 | Consulter le journal des opérations | OK | Lot 5b : Historique → Journal (libellé, auteur `actorName`, date, détail lisible, comptes nommés). L5B ; Chromium. | SRV, PJ | 0 |
| C22 | Toutes les commandes, parts, sacs, états | OK | `order_view` CEO avec parts. TF lot 2. | SRV, PJ | 0 |
| C23 | Actions cuisine sur tous les établissements | OK | `owner()`/`scope()` CEO. | SRV | 0 |
| C24 | Superviser paiements, annulations, remboursements | OK | `pkWorkflow` (demande d'annulation, remboursement déclaré). TF `test_restaurant_cancellation_requires_reason_and_refund_is_declared`. | PJ, SRV | 0 |
| C25 | Lire et traiter les réclamations | OK | TF `test_complaints_can_be_replied_to_only_by_correct_restaurant`. | SRV | 0 |
| C26 | Cartes, suivi livreurs, parts, services ouverts | OK | Carte par livreur (live-map), `pkDriverServices`. TF `test_location_is_hidden_from_other_restaurants_and_stopped_explicitly`. | PJ, live-map.js | 0 |
| C27 | Archives et comptes rendus CSV | OK | Lot 5b : Historique → « Archives des services clôturés » (snapshot par clôture, CSV `/api/report?id=`), CSV global. L5B ; Chromium. | PJ, SRV | 0 |
| C28 | Menu Commandes, Enseignes, Comptes, Agenda, Réglages ; pas de Coûts | OK | Dock CEO : Commandes, Enseignes, Comptes, Réglages, Historique, Agenda (Chromium) ; aucune entrée Coûts/Finances/Studio. L5B, frontend_regressions.cjs. | PJ, OPS | 0 |
| C29 | Choisir l'établissement à gérer | OK | `pkSelect('ceoMerchant')`. | PJ | 0 |
| C30 | Produits, photos, prix, options, stocks | OK | `/api/menu`, `/api/photo` (photo conservée dans content-studio.js). TF menus/stocks. | SRV, PJ | 0 |
| C31 | Menus fixes et menus au choix | OK | TF `test_fixed_and_choice_menus_reserve_component_stock`. | SRV | 0 |
| C32 | Promotions et cadeaux par enseigne | OK | Fonction unique `/api/promo` (lot 5a). TF `test_percent_and_gift_codes_apply_only_with_their_code`. | SRV, kitchen.js | 0 |
| C33 | Horaires, type de cuisine, lien Revolut | OK | TF `test_hours_revolut_and_kitchen_type_are_editable_and_validated`. | SRV, PJ | 0 |
| C34 | Modifier le temps de préparation initial | OK | Lot 5b : Enseignes → `pkPrepBox(mid)` pour l'établissement choisi (valeur rechargée à chaque changement d'enseigne), API `/api/prep set` CEO. L5B ; Chromium ; TF `test_preparation_time_default_estimate_and_setting`. | PJ, SRV | 0 |
| C35 | Rechercher l'adresse de collecte via Google | OK | `pkPickupBox` + `/api/address` ; revue I-5 : jeton de session Google requis, réservé au client avec panier ou au pro connecté, limites par personne/IP/jour (429). TF `test_address_search_and_google_settings_are_server_side`, `test_review_i5_address_search_is_reserved_and_rate_limited`. | PJ, SRV | 0 |
| C36 | Enregistrer l'adresse avec coordonnées vérifiées | OK | Jeton serveur ; revue I-4 corrigée : `restore_menu` ne restaure plus le point de collecte (adresse, coordonnées et vérification restent ceux de `/api/pickup`). TF `test_delivery_and_pickup_addresses_come_from_server_verified_results`, `test_review_i4_restore_never_marks_old_coordinates_verified`. | SRV | 0 |
| C37 | Ouvrir/clôturer le service d'une enseigne | OK | Clôture sans annulation + archive. TF `test_service_close_keeps_received_orders_and_history`. | SRV, PJ | 0 |
| C38 | Ouvrir/clôturer le service général | OK | Idem sans `merchant`. | SRV | 0 |
| C39 | Régler globalement livraison et retrait | OK | `/api/service glo/pickup`. TF `test_restaurant_modes_stay_within_ceo_limits`. | SRV | 0 |
| C40 | Uber Colis global et par enseigne | OK | Revue I-2 corrigée : `/api/menu` ignore `service`/`closed` hors CEO. Provisoire (m-5, réversible) : Uber désactivé par défaut tant qu'un CEO ne l'a pas activé en global ET pour l'enseigne. TF `test_manual_dispatch_and_uber_are_ceo_only`, `test_review_i2_menu_save_cannot_change_uber_or_service`, `test_review_m5_uber_off_until_ceo_enables_global_and_establishment`. | SRV | 0 |
| C41 | Suspendre Uber quand la livraison Kosh est active | OK | TF `test_reception_modes_are_independent_and_exclude_uber_with_driver`. | SRV | 0 |
| C42 | Les restrictions CEO priment sur les réglages locaux | OK | TF `test_restaurant_modes_stay_within_ceo_limits`. | SRV | 0 |
| C43 | Programmer précommandes, ouvertures, délais | OK | TF `test_open_preorders_accept_orders_for_the_opening_and_are_public`. | SRV | 0 |
| C44 | Garder les commandes acceptées malgré mode/fermeture | OK | TF `test_glo_disable_blocks_new_orders_but_preserves_accepted`, `test_service_close_keeps_received_orders_and_history`. | SRV | 0 |
| C45 | Retirer matières premières (données gardées) | Retiré OK | `/api/finance` 410 ; lot 5b : `pkFinance` et actions supprimés du code. TF `test_retired_studio_and_finance_routes_keep_existing_data` (données `finance/*` intactes), `test_retired_studio_pages_and_styles_are_not_published_but_kept` (code mort absent). | SRV, PJ | 0 |
| C46 | Retirer le choix d'unité | Retiré OK | Idem C45. | PJ | 0 |
| C47 | Retirer la quantité achetée | Retiré OK | Idem C45. | PJ | 0 |
| C48 | Retirer le coût d'achat | Retiré OK | Idem C45. | PJ | 0 |
| C49 | Retirer le rendement après pertes | Retiré OK | Idem C45. | PJ | 0 |
| C50 | Retirer la modification de matière | Retiré OK | Idem C45. | PJ | 0 |
| C51 | Retirer les recettes enseigne/produit | Retiré OK | Idem C45. | PJ | 0 |
| C52 | Retirer les quantités de recette | Retiré OK | Idem C45. | PJ | 0 |
| C53 | Retirer les pièces produites | Retiré OK | Idem C45. | PJ | 0 |
| C54 | Retirer les pièces par portion | Retiré OK | Idem C45. | PJ | 0 |
| C55 | Retirer emballages et frais | Retiré OK | Idem C45. | PJ | 0 |
| C56 | Retirer le coût théorique par portion | Retiré OK | Idem C45. | PJ | 0 |
| C57 | Retirer la modification de recette | Retiré OK | Idem C45. | PJ | 0 |
| C58 | Retirer le signalement de matière manquante | Retiré OK | Idem C45. | PJ | 0 |
| C59 | Retirer la correction des références | Retiré OK | Idem C45. | PJ | 0 |
| C60 | Enregistrer et vérifier une clé Google Places | OK | TF `test_address_search_and_google_settings_are_server_side`. | integrations.py, PJ | 0 |
| C61 | Remplacer OpenRouteService par Google pour les trajets | OK | test_integrations `test_openrouteservice_configuration_is_retired`. | integrations.py | 0 |
| C62 | Tester le calcul Google et afficher l'état réel | OK | `route-test` Google ; erreurs sans clé (`test_provider_errors_never_contain_the_key`). | integrations.py, PJ | 0 |
| C63 | Secrets chiffrés ; clé navigateur distincte et restreinte | OK | `secret()` Fernet ; aucune clé navigateur. test_integrations `test_keys_are_encrypted_and_round_trip`. Lot 5b : clé CalJ dans le même coffre. | integrations.py | 0 |
| C64 | Voir si adresse/routage sont configurés | OK | `pkGoogleSettings` (source env/coffre/non configurée). | PJ | 0 |
| C65 | Voir les permissions de notification | OK | Lot 5b : diagnostic (navigateur, iOS, écran d'accueil, autorisation, serveur, appareil). L5B. | NOTIF | 0 |
| C66 | Activer les notifications sur l'appareil | OK | Lot 5b : `pnEnable` (appui explicite) → permission → abonnement push par appareil et rôle ; mode premier plan si serveur non configuré. L5B ; TF `test_push_…`. Réception réelle : externe. | NOTIF, SRV | 0 |
| C67 | État du service de notifications serveur | OK | Lot 5b : `push.status` → Réglages « Service de notifications » (Web Push configuré / mode dégradé + raison). TF `test_push_…` ; L5B ; Chromium. | PUSH, NOTIF | 0 |
| C68 | Notifications en attente, en échec, en retard | OK | Compteurs `pending/sent/failed/expired`, `late` (> 2 min), appareils par rôle. TF `test_push_…` (2 en échec après 5 essais). | PUSH, NOTIF | 0 |
| C69 | Dernier contrôle et erreurs du service | OK | `lastFlush`, `lastError`, 5 dernières erreurs (sans endpoint ni clé). TF `test_push_…`. | PUSH, NOTIF | 0 |
| C70 | Administrer l'agenda communautaire | OK | Lot 5b : `/api/events` CEO seul, schéma validé (`event_value`), audit `event.*` ; écran Agenda CEO (`pkAgendaAdmin`) + aperçu public + bloc CalJ. TF `test_weekly_and_one_off_agenda_events_are_validated_editable_and_audited`. | SRV, PJ | 0 |
| C71 | Ajouter des événements ponctuels | OK | `day` (date réelle validée). TF idem ; L5B ; Chromium. | SRV, PJ | 0 |
| C72 | Ajouter des événements hebdomadaires | OK | `dow` 0–6. TF idem ; Chromium (ajout « Cours du mardi »). | SRV, PJ | 0 |
| C73 | Modifier ou supprimer des événements | OK | Lot 5b : `event-edit` / `event-remove` (404 si inconnu). TF idem ; L5B ; Chromium (modification + suppression). | SRV, OPS | 0 |

## H — Historique (préserver l'état actuel, ne rien réactiver)

| ID | Règle (≤12 mots) | État observé | Preuve / écart restant | Fichiers | Effort |
|---|---|---|---|---|---|
| H01 | PIN 0000 retiré, comptes individuels | Retiré OK | Lot 5b : plus aucune occurrence « 0000 » ; anciens gestionnaires PIN (`A.vlogin`, `A.login` historique) refusent toujours ; textes PIN remplacés. TF `test_retired_studio_pages_and_styles_are_not_published_but_kept` (assertion « 0000 » absent). | IDX | 0 |
| H02 | Affectation manuelle CEO seulement, acceptation livreur | OK | TF `test_manual_dispatch_and_uber_are_ceo_only`, `test_ceo_assignment_is_a_proposal_the_courier_must_accept`. | SRV | 0 |
| H03 | Boutons GPS démarrer/arrêter retirés | Retiré OK | operations.cjs (`gps-start`/`gps-stop` absents). | PJ | 0 |
| H04 | Pas de copie d'adresse côté livreur | Retiré OK | operations.cjs (`copy-address` absent). | PJ | 0 |
| H05 | Pas de correction lat/lon côté livreur | Retiré OK | operations.cjs (`lat_`, `map-correct` absents) ; serveur `destination` refusé au livreur (TF). | PJ, SRV | 0 |
| H06 | Pas de ticket dans le parcours livreur | Retiré OK | operations.cjs (`data-v="ticket"` absent). | PJ | 0 |
| H07 | Le livreur libère sa part, pas d'annulation | OK | TF `test_release_before_collection_only_returns_own_bags`, `test_driver_cannot_cancel_sale_or_edit_eta_and_destination`. | SRV, OPS | 0 |
| H08 | Garder les compteurs, pas de commission 1,50 € | Retiré OK | TF `test_fees_kosh_delivery_pickup_and_no_commission`. | SRV | 0 |
| H09 | Garder l'historique des versions de carte | OK | Historique → « Versions des cartes ». | SRV, PJ | 0 |
| H10 | Garder la restauration avec stocks/compteurs/service | OK | TF `test_restore_preserves_live_stock_promos_service_and_revision`, `test_restore_after_orders_keeps_newer_stock_and_promo_counters`. | SRV | 0 |
| H11 | Factures retirées, archives conservées | Retiré OK | Routes `/api/finance`, `/api/upload` 410 ; lot 5b : UI factures et import supprimés du code ; documents `files` et `finance/*` conservés (`/api/file` CEO). TF `test_retired_studio_and_finance_routes_keep_existing_data`. | SRV, PJ | 0 |
| H12 | Analyse IA des factures retirée | Retiré OK | `/api/ai` 410 ; lot 5b : `integrations.generate` (OpenAI) supprimé. TF studio retiré (`hasattr(integrations,'generate')` faux). | SRV, integrations.py | 0 |
| H13 | Pas de bilan financier étendu | Retiré OK | Lot 5b : `pkFinance`, `pkInFinancePeriod`, export bilan supprimés. TF idem. | PJ | 0 |
| H14 | Studio de personnalisation retiré | Retiré OK | `/api/ceo config` 410 ; lot 5b : `pkStudio` et parties studio de content-studio.js supprimées (photos produits gardées). TF `test_retired_studio_pages_and_styles_are_not_published_but_kept`. | PJ, content-studio.js, SRV | 0 |
| H15 | Création de pages/sections retirée | Retiré OK | Lot 5b : `/page/<slug>` → 404, `screenBlocks` plus envoyés ni appliqués ; `conf/main.pages` conservé (CEO). TF idem. | SRV, content-studio.js | 0 |
| H16 | Édition avancée des styles retirée | Retiré OK | Lot 5b : `siteCss`, `accent`, `background`, `brand`, `headline`, `intro` ne sont plus envoyés au public ni appliqués (`PUBLIC_CONF`) ; données gardées. TF idem (tous portails). | SRV, PJ | 0 |
| H17 | Studio IA retiré | Retiré OK | `/api/ai` 410, champ clé OpenAI supprimé, `generate` supprimé. | SRV, PJ, integrations.py | 0 |
| H18 | Aperçu/historique du studio retiré, archives gardées | Retiré OK | Aperçu/brouillon supprimés ; versions conservées et restaurables (données seulement, jamais appliquées au public). TF `test_config_restore_removes_new_editorial_fields_only`. | PJ, SRV | 0 |
| H19 | Une seule interface promotions et cadeaux | OK | Lot 5a (`/api/promo`, écran unique). kitchen.cjs. | kitchen.js, SRV | 0 |
| H20 | Uber Colis réservé au CEO | OK | `/api/service` et `/api/menu` (champ `service` ignoré hors CEO, revue I-2). TF `test_manual_dispatch_and_uber_are_ceo_only`, `test_review_i2_menu_save_cannot_change_uber_or_service`. | SRV, PJ | 0 |
| H21 | Pas de recherche générale côté livreur | Retiré OK | `pkOrders` sans recherche livreur. | PJ | 0 |
| H22 | Navigation par rôle, détails dépliables | OK | Dock par rôle, `<details>`. | PJ, OPS | 0 |

## G — Jeux

| ID | Règle (≤12 mots) | État observé | Preuve / écart restant | Fichiers | Effort |
|---|---|---|---|---|---|
| G01 | Trois jeux : Pita Pulse, Golden Stack, Porto Flight | OK | `GM` : Pita Pulse, Golden Stack, Porto Flight (+ Wheelie Bradley bonus ajouté par Ethan). | IDX, ARC | 0 |
| G02 | Sans niveaux ni fin, difficulté progressive, sans plafond | OK | Moteurs serveur sans plafond de score (`test_scores_keep_arbitrary_precision`). Lot 5b : niveaux de Wheelie (`lvOf`, `gs.best.wheel`) et affichage « niveau x/10 » de la page de suivi supprimés (record affiché). L5B ; Chromium. | IDX, ARC | 0 |
| G03 | Accès une heure après une commande (heure serveur) | OK | `game_expiry` = date serveur + 1 h. TF `test_game_window_per_order_cancellation_and_falsified_scores`, `test_exact_hour_deadline_and_user_score_ownership`. | SRV | 0 |
| G04 | Échéance après rechargement ; partie arrêtée à la fin | OK | `gameExpires` du bootstrap (rechargement), boucles arrêtées à l'échéance ; lot 5b : Wheelie démarre par `/api/games/start` et sa boucle s'arrête à l'échéance. TF G03 ; L5B ; Chromium (Wheelie → écran Jeux à l'échéance). | SRV, ARC, IDX | 0 |
| G05 | Commande annulée : accès retiré ; nouvelle commande : nouvelle fenêtre | OK | TF `test_game_window_per_order_cancellation_and_falsified_scores` (fenêtre propre, annulation → retour à la fenêtre restante, puis 403), `test_cancel_restores_stock_once_and_revokes_game`. | SRV | 0 |
| G06 | Classement par cumul des meilleurs scores | OK | `verified-scores` = somme des trois jeux classés (`RANKED_GAMES`). Wheelie hors classement (décision en attente). TF `test_wheelie_bonus_has_the_same_window_and_stays_out_of_the_leaderboard`. | SRV, ARC | 0 |
| G07 | Identifiant et records retrouvés sur plusieurs appareils | OK | TF `test_customer_account_restores_orders_on_another_device`, `test_score_identity_is_not_authentication_token`. Wheelie : record local (hors classement). | SRV | 0 |
| G08 | Scores vérifiés côté serveur par replay | OK | Trois jeux : replay déterministe (test_arcade, arcade_replay.cjs) ; total envoyé seul et journal falsifié refusés (TF G05, `test_raw_fabricated_arcade_score_is_rejected`). Wheelie : aucun score accepté par le serveur (400 « hors classement »). | SRV, arcade_engine.py | 0 |

## Comptes par état

- C (73) : OK 58 · Retiré OK 15 (C45–C59) · Partiel 0 · Absent 0.
- H (22) : OK 7 (H02, H07, H09, H10, H19, H20, H22) · Retiré OK 15 (H01, H03–H06, H08, H11–H18, H21) · Partiel 0 · À retirer 0.
- G (8) : OK 8.

## Éléments externes et limites

- Web Push : envoi testé avec émetteur simulé (et pywebpush 2.5 avec HTTP simulé) ; réception réelle sur iPhone/Android/Mac à vérifier par l'exploitant.
- CalJ : emplacement de configuration seulement (désactivé par défaut) ; import à concevoir après obtention du contrat (DEPLOIEMENT.md).
- Wheelie Bradley : entrée au classement en attente de décision ; il faudrait alors porter sa physique dans `arcade_engine.py`.

## Contrats partagés touchés (lot 5b)

- Tables `push_subscriptions`, `push_queue` ; docs `conf/calj`, `secret/calj`, `events/*` (champs `updatedAt`, `updatedBy`).
- `runs.game` peut valoir `wheel` (aucun document `arcade/<run>` pour ce jeu).
- Bootstrap public : `conf` réduit à `open, glo, pickup, uber` ; `calj` (statut). CEO : `push` (statut), `caljConfig`, `audit[].actorName`.
- Fichiers : `push.py`, `sw.js`, `js/notifications.js` (chargé après `kitchen.js`), `tests/lot5b.cjs`.
