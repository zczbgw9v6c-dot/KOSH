# Matrice L — Livreur (L01–L50) — état après lot 5b (14/10/2026)

Revérification dans le code actuel (lots 2 parts/sacs/service, 4 Google/GPS, 5b notifications). Preuves : tests exécutés
(`tests/test_flows.py`, `tests/test_tour.py`, `tests/test_integrations.py`, `tests/courier_tour.cjs`, `tests/operations.cjs`,
`tests/lot5b.cjs`) et fonctions citées. Abréviations : SRV = server.py, PJ = js/professional.js, OPS = js/operations.js,
LM = js/live-map.js, TOUR = tour.py, TF = tests/test_flows.py, CT = tests/courier_tour.cjs.

| ID | Règle (≤12 mots) | État observé | Preuve / écart restant | Fichiers | Effort |
|---|---|---|---|---|---|
| L01 | Offres toutes enseignes seulement si service ouvert par CEO | OK | Table `couriers.open`, action CEO `driver-service`. TF `test_closed_service_shows_no_offer_and_refuses_acceptance`, `test_all_drivers_receive_paid_offers_and_accept_exclusively`. Lot 5b : push « Nouvelle course » aux seuls livreurs au service ouvert. | SRV | 0 |
| L02 | Offres seulement pour livraisons payées éligibles | OK | `offer_for` (payée, `OFFER_STATES`). TF idem. | SRV | 0 |
| L03 | Avant acceptation : restaurant, collecte, statut, sacs, part compatible | OK | `pkOffers` : sacs restants/total, choix borné par la place libre. operations.cjs ; TF `test_capacity_is_checked_on_available_space_and_adjustable`. | OPS, SRV | 0 |
| L04 | Coordonnées client masquées avant acceptation, y compris serveur | OK | `offer_for` sans téléphone/adresse. TF `test_customer_details_only_after_acceptance_and_only_own_parts`. | SRV | 0 |
| L05 | Accepter course ou part selon capacité disponible | OK | `accept_part`. TF `test_capacity_is_checked_on_available_space_and_adjustable`. | SRV | 0 |
| L06 | Acceptation exclusive par part ; sacs restants toujours proposés | OK | Index unique `delivery_parts_one_open` + verrou. TF `test_ten_bags_split_five_five_with_independent_departure`, `test_concurrent_acceptances_never_assign_the_same_bags_twice`. | SRV | 0 |
| L07 | Retirer sacs acceptés des offres ; refus atomique sur vue ancienne | OK | TF `test_concurrent_acceptances_…`, `test_double_click_and_repeated_confirmations_are_idempotent`. | SRV, OPS | 0 |
| L08 | Accepter plusieurs courses simultanément | OK | Aucune limite hors capacité ; tournée multi-commandes. TF `test_tour_stops_follow_parts_collected_and_delivered`. | SRV | 0 |
| L09 | Collecter dans plusieurs restaurants pendant une tournée | OK | `tour_stops` un arrêt de collecte par restaurant. test_tour. | SRV, TOUR | 0 |
| L10 | Capacité 1–10 sacs, défaut 5, contrôle sur disponible | OK | `CHECK(capacity BETWEEN 1 AND 10)`, défaut 5, `set_capacity`. TF capacité. | SRV | 0 |
| L11 | Voir sacs engagés et places restantes | OK | `pkCourierBox` (jauge). operations.cjs. | OPS | 0 |
| L12 | Bloquer part trop grosse ; prendre plus petite, reste proposé | OK | TF `test_capacity_is_checked_on_available_space_and_adjustable`. | SRV | 0 |
| L13 | Signaler charge inconnue si colis mal renseignés | OK | `unknownLoad` (offre non acceptable). TF `test_bag_declaration_rules`. | SRV, OPS | 0 |
| L14 | Interdire capacité inférieure aux colis engagés | OK | `set_capacity` 409. TF capacité. | SRV | 0 |
| L15 | Parts dans ordre auto, ajustable manuellement | OK | `pkTour`, `/api/tour move`. TF `test_optimized_then_manual_order_survives_polling_and_recalculation`. | PJ, SRV | 0 |
| L16 | Mettre un arrêt admissible en premier, contraintes respectées | OK | `move_stop` + validation. TF `test_manual_order_violating_constraints_is_refused`. | SRV, TOUR | 0 |
| L17 | Ordre auto minimisant temps total + lien Google Maps multiarrêts | OK | `tour.py` (exact ≤ 12 arrêts), liens segmentés. test_tour `test_best_of_the_six_orders_is_chosen_not_the_nearest_first`, `test_one_link_with_every_stop_in_order`. | TOUR | 0 |
| L18 | Descendre un arrêt, recalcul estimations, contraintes respectées | OK | Idem L16 ; CT (ordre/liens). | SRV, PJ | 0 |
| L19 | Ordre confirmé conservé ; recalcul seulement explicite | OK | TF `test_optimized_then_manual_order_survives_polling_and_recalculation`. | SRV | 0 |
| L20 | Indiquer départ pour collecte | OK | Action `heading`. TF `test_ten_bags_split_…`. | SRV, PJ | 0 |
| L21 | Confirmer collecte de sa part et partir immédiatement | OK | `part_collect` par part. TF `test_ten_bags_split_five_five_with_independent_departure`. | SRV | 0 |
| L22 | Livrer seulement ses sacs ; dernière part termine la commande | OK | `part_deliver` + `finish_if_delivered`. TF `test_restaurant_hands_over_and_confirms_per_part`. | SRV | 0 |
| L23 | Libérer sa part avant collecte avec motif ; pas d'annulation vente | OK | `part_release` (motif ≥ 3 car.) ; `status no` refusé au livreur. TF `test_release_before_collection_only_returns_own_bags`, `test_driver_cannot_cancel_sale_or_edit_eta_and_destination`. | SRV, OPS | 0 |
| L24 | Libération ne remet que ses sacs, sans désaffecter autres | OK | TF `test_release_before_collection_only_returns_own_bags`. | SRV | 0 |
| L25 | Adresses collecte et livraison après acceptation | OK | Revue I-3/m-1 : adresse de collecte dans le menu livreur seulement avec une part acceptée chez ce restaurant, jamais pour chabad-porto (« Adresse communiquée par le restaurant ») ; coordonnées client jusqu'à 30 min après la livraison de sa part. TF `test_customer_details_only_after_acceptance_and_only_own_parts`, `test_review_i3_pickup_address_only_for_accepted_couriers_and_never_chabad`, `test_review_m1_courier_loses_customer_details_after_delivery_grace`. | SRV, PJ | 0 |
| L26 | Lire instructions de livraison et messages du restaurant | OK | `pkOrder` (note, notes de ligne, message). | PJ | 0 |
| L27 | Appeler le client | OK | Lien `tel:` après acceptation. | PJ | 0 |
| L28 | Ouvrir navigation Google Maps | OK | Liens Google Maps (TOUR `links`). test_tour. | TOUR, PJ | 0 |
| L29 | Garder Plans Apple, ajouter Waze ; multiarrêts Google | OK | test_tour `test_waze_apple_and_google_for_the_next_stop`, segments multi-arrêts. | TOUR | 0 |
| L30 | Retirer saisie manuelle de délai par livreur | Retiré OK | `eta` réservé CEO/restaurant ; UI livreur sans délai. TF `test_driver_cannot_cancel_sale_or_edit_eta_and_destination` ; operations.cjs. | SRV, PJ | 0 |
| L31 | Google Maps Platform pour tout routage ; retirer OpenRouteService | OK | Routes API `computeRouteMatrix`. tests/test_integrations.py `test_openrouteservice_configuration_is_retired`, `test_route_matrix_is_one_documented_call_and_keeps_durations`. | integrations.py | 0 |
| L32 | Voir estimations de collecte et livraison | OK | `tour_view`/`driver_etas`. TF `test_tour_stops_follow_parts_collected_and_delivered`. | SRV, PJ | 0 |
| L33 | Retirer libellé détaillé ancienne estimation ; fraîcheur serveur conservée | OK | TF `test_old_positions_and_estimates_are_never_shown_as_current`. | SRV, PJ | 0 |
| L34 | Actualisation automatique toutes les 10 s | OK | `setInterval(…,10000)` au premier plan + `visibilitychange`. kitchen.cjs (10 s). | PJ | 0 |
| L35 | Actualisation manuelle | OK | Bouton « Actualiser les courses ». operations.cjs. | OPS | 0 |
| L36 | Demander localisation dès connexion, même sans course | OK | `pkGpsSync` à la connexion (permission demandée une fois). CT. | PJ | 0 |
| L37 | Acquisition visée toutes les 3 s, page active | OK | `pkGpsTick` toutes les 3 s, envoi ≤ 1 / 3 s. CT. Vérification sur iPhone physique : non faite (externe). | PJ | 0 |
| L38 | Partager position réelle au serveur | OK | `/api/location`, docs `drivers/<id>`. TF `test_location_is_hidden_from_other_restaurants_and_stopped_explicitly`. | SRV | 0 |
| L39 | GPS réservé CEO/restaurateur ; aucun suivi client | OK | `order_view` client sans position. TF `test_client_payload_never_contains_driver_gps_or_route`, `test_shared_tour_reveals_no_gps_route_or_other_customer`. | SRV, LM | 0 |
| L40 | Retirer détail permanent précision/ancienneté GPS chez livreur | Retiré OK | `pkGPS` non rendu au livreur (`!isDriver`). operations.cjs (pas de « précision » ni coordonnées). | PJ | 0 |
| L41 | Expliquer refus, position introuvable, délai dépassé | OK | Messages distincts `denied`/`unavailable`/`timeout` (`pkGpsError`). CT. | PJ | 0 |
| L42 | Repli localisation moins précise après échec | OK | `GPS.high=false` puis relance. CT (« lower accuracy »). | PJ | 0 |
| L43 | Reprendre suivi sans redemander l'autorisation en boucle | OK | Reprise sur `pageshow`, `online`, changement de permission ; pas de boucle après refus. CT. | PJ | 0 |
| L44 | Signaler interruption réseau ou position > 2 min | OK | Bandeau réseau, états GPS `stale`/`interrupted`. TF `test_old_positions_…`. | PJ, SRV | 0 |
| L45 | Arrêter suivi ancienne session à déconnexion/changement compte | OK | `pkStopGPS` à la déconnexion, `pkGpsSync(active, identityChanged)`. CT. | PJ | 0 |
| L46 | Éviter deux pages concurrentes affichant suivi actif | OK | Bail `kosh-gps-lease` (une seule page émettrice). CT (« single page »). | PJ | 0 |
| L47 | Carte suivi seulement CEO/restaurateur ; livreur garde liens externes | OK | LM `pkGPS` : carte seulement `ceo`/`restaurant`. operations.cjs (aucune carte livreur/client). | LM | 0 |
| L48 | Animer déplacement entre points réels, sans coordonnées inventées | OK | `pkMapAnimate` entre deux points reçus. | LM | 0 |
| L49 | Conserver le zoom pendant mises à jour | OK | Cartes conservées dans `pkMaps`. | LM | 0 |
| L50 | Recentrer sur trajets autorisés | OK | Bouton « Recentrer la carte » (`pkMapBounds`). | LM | 0 |

## Comptes par état

- L (50) : OK 48 · Retiré OK 2 (L30, L40) · Partiel 0 · Absent 0 · À retirer 0.

## Limites et éléments externes

- GPS et notifications sur iPhone physique non vérifiés (navigateur ne garantit pas un point toutes les 3 s ni le suivi en arrière-plan ; une notification ne réveille pas le GPS).
- Lot 5b côté livreur : guide de notifications au premier usage (et dans « Notifications sur cet appareil »), push « Nouvelle course » (service ouvert) et « Commande prête » (part acceptée). Réception réelle : externe.
- Règle d'annulation après collecte partielle : non décidée (§9.1), non inventée (TF `test_cancellation_after_partial_collection_is_not_invented`).
- Provisoire (revue m-4, réversible) : annulation également refusée quand tous les sacs sont déjà collectés ou livrés, même message « règle non décidée » (TF `test_review_m4_cancel_refused_when_all_bags_collected`).

## Contrats partagés touchés (lot 5b)

- `push_subscriptions` (rôle `driver`, compte), `push_queue` (événements `order:<id>:offer`, `order:<id>:ready`).
