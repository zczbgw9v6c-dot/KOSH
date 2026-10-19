# Matrice R — Restaurateur (R01–R88)

> Mise à jour lot 5a (14/10/2026) : états revérifiés dans le code après les lots 1-5a. Preuves = fonctions et tests cités ; suites : `python -m unittest discover -s tests`, `node tests/*.cjs` (dont `tests/kitchen.cjs`). Vérification Chromium (Playwright, base isolée) en 390×844 et 1366×900 : mode cuisine, agrandissement, promotions, précommande.

Sources vérifiées : `server.py` (create_order, cancel_order, record_stock, reserve_product, get_api /api/bootstrap et /api/report, post_api /api/orders/action, /api/dispatch, /api/menu, /api/service, /api/photo, /api/promo/check), `js/professional.js` (pkSync, pkOrder, pkOrders, pkService, pkMenuTools, A.pk), `js/operations.js` (pkQueueReceipts, pkCloseReceipt, mode-toggle), `js/live-map.js`, `js/menu-composition.js`, `js/content-studio.js`, `index.html` (vPro legacy, A.esave/eopen/edel/tog/padd/pdel/ssave, vTicket, parseO), `integrations.py` (route), tests `tests/test_flows.py`, `tests/operations.cjs`.
Note : l'espace restaurateur (`/restaurant`) remplace l'onglet commandes legacy de `vPro` par `pkOrders()` ; les onglets « Ma carte » et « Réglages » réutilisent `vPro` legacy + `pkMenuTools` + `pkService`.

| ID | Règle (≤12 mots) | État observé | Écart / travail | Fichiers | Effort |
|---|---|---|---|---|---|
| R01 | Voir les commandes de son établissement | OK | Filtre serveur `o['m']==actor['merchant']` dans /api/bootstrap ; test `test_restaurant_cannot_view_or_modify_other_restaurant` | server.py get_api | 0 |
| R02 | Actualisation auto 10 s quand l'app est active | OK | Lot 5a : `setInterval(pkSync,10000)` si `!document.hidden` ; tests/kitchen.cjs (source) ; Chromium : saisie « Sar » et focus conservés après 10,8 s | js/professional.js | 0 |
| R03 | Actualiser au retour dans l'application | OK | `visibilitychange` → pkSync ; `online` → pkSync | js/professional.js l.320-321 | 0 |
| R04 | Actualiser sans effacer les saisies | OK | pkSync ne fait pas `render()` si `document.activeElement` est un input/textarea/select ; valeurs dans `S.f` ; tests frontend_regressions.cjs (activeElement) | js/professional.js pkSync | 0 |
| R05 | Filtres : en cours, paiement, prêtes, archives, toutes | OK | Lot 5a : filtres En cours / Paiement à vérifier / Prêtes / Archives / Toutes (`pkFilterMatch`) ; tests/kitchen.cjs | js/professional.js | 0 |
| R06 | Recherche par référence ou nom client | OK | `nz(o.name+o.addr+o.code+…)` contre `pk_search` | js/professional.js pkOrders | 0 |
| R07 | Nombre de commandes actives | OK | Statistique « À traiter » (st ∉ done/no) | js/professional.js pkOrders | 0 |
| R08 | Prioriser annulations, paiements déclarés, attente livreur | OK | Lot 5a : `pkPriority` (annulation demandée, sans livreur ≥15 min, paiement déclaré, sans livreur 5 min, préparation en retard) trie et badge « Prioritaire » ; mode cuisine : priorités puis échéance ; tests/kitchen.cjs, Chromium | js/professional.js, js/kitchen.js | 0 |
| R09 | Ouvrir le détail d'une commande | OK | `pkOrder()` rend toute la commande (lignes, client, paiement, livreur, actions) dans la carte | js/professional.js pkOrder | 0 |
| R10 | Mode cuisine : commande affichée en grand | OK | Lot 5a : mode cuisine (`pkKitchen`) cartes agrandies, filtres À préparer/Prêtes/Toutes, « Agrandir » une commande (téléphone, ticket), action principale ; tests/kitchen.cjs ; Chromium 390×844 et 1366×900 sans débordement horizontal | js/kitchen.js, professional.css | 0 |
| R11 | Quantités, produits, options, suppléments, instructions clairs | OK | `line.q × line.n` + `lo(line)` (options et note) + prix ligne ; note commande ; ticket détaille options/notes | js/professional.js pkOrder, index.html lo/vTicket | 0 |
| R12 | Regrouper lignes identiques sans mélanger options/instructions | OK | Lot 5a : `pkGroupLines` fusionne seulement produit + options (ordre indifférent) + note + choix + inclus + prix identiques ; liste, cuisine et ticket ; tests/kitchen.cjs | js/professional.js, js/kitchen.js | 0 |
| R13 | Détailler les produits inclus d'un menu composé | OK | Lot 5a : `line.inc` (composants d’un menu fixe) écrit par create_order, affiché commande/cuisine/ticket ; menu au choix déjà dans `o` ; test `test_composed_menus_detail_components_and_become_unavailable` | server.py, js/professional.js, js/kitchen.js | 0 |
| R14 | Afficher les cadeaux à préparer dans la commande | OK | Lot 5a : `order.giftLine` (produit, quantité, composants) affiché commande, cuisine et ticket ; test `test_percent_and_gift_codes_apply_only_with_their_code`, tests/kitchen.cjs | server.py, js/kitchen.js | 0 |
| R15 | Nom, téléphone, adresse, créneau, mode de réception | OK | pkOrder : name, tel, `whenL(order.when)`, mode, addr | js/professional.js pkOrder | 0 |
| R16 | Appeler le client depuis la commande | OK | Lien `tel:` dans pkOrder | js/professional.js pkOrder | 0 |
| R17 | Distinguer paiement attendu, déclaré, validé | OK | Pastille : « En attente de paiement » / « Paiement déclaré · à vérifier » (st `decl`) / « Paiement validé » (`paid`) | js/professional.js pkOrder ; server action `paid` | 0 |
| R18 | Vérifier manuellement le paiement Revolut | OK | Vérification hors app (Revolut) ; validation manuelle restaurant/CEO seulement (`target=='ok'` exige role ceo/restaurant) | server.py /api/orders/action | 0 |
| R19 | Confirmer le paiement | OK | Transition pay/decl→ok, `paid=True`, `paidAt` ; test `test_validated_payment_records_receipt_time` | server.py /api/orders/action | 0 |
| R20 | Ouvrir automatiquement le ticket après validation | OK | `pkQueueReceipts` ouvre le ticket au passage `paid` ; tests/operations.cjs | js/operations.js | 0 |
| R21 | File d'attente des tickets si plusieurs paiements | OK | `PK.receiptQueue` + `pkCloseReceipt` ouvre le suivant ; tests/operations.cjs (one puis two) | js/operations.js | 0 |
| R22 | Revoir et imprimer le ticket | OK | Bouton « Ticket » (action ticket) + « Imprimer le ticket » (`window.print`) | js/professional.js vTicket/A.pk | 0 |
| R23 | Déclarer un nombre entier de sacs, répartition multi-livreurs | OK | Lot 2 : sacs entiers sans plafond, parts multi-livreurs ; tests `test_bag_declaration_rules`, `test_ten_bags_split_five_five_with_independent_departure` | server.py, js/professional.js pkParts | 0 |
| R24 | Modifier les sacs avant collecte en revalidant affectations | OK | Lot 2 : modification avant collecte, revalidation ; collecte partielle refusée (règle non décidée) ; `test_bag_declaration_rules`, `test_cancellation_after_partial_collection_is_not_invented` | server.py | 0 |
| R25 | Commencer la préparation | OK | Transition ok→prep, bouton « Commencer la préparation » ; test `test_full_driver_and_restaurant_flow` | server.py, js/professional.js | 0 |
| R26 | Commande prête : notifier livreurs ayant accepté | OK | Lot 2-3 : prep→ready, notification aux livreurs ayant une part (pkSync readySeen), état prêt visible après acceptation tardive ; tests/operations.cjs | js/professional.js, server.py | 0 |
| R27 | Confirmer remise des sacs au livreur concerné | OK | Lot 2 : remise par part (`part-collect`) ; `test_restaurant_hands_over_and_confirms_per_part` | server.py, js/professional.js | 0 |
| R28 | Confirmer remise au client (retrait) | OK | mode pick : ready→done « Confirmer la remise au client » | server.py valid map, js/professional.js | 0 |
| R29 | Confirmer remise au coursier Uber Colis | OK | mode uber : ready→done « Remise au coursier Uber » | idem | 0 |
| R30 | Confirmation livraison cuisine, livrée quand tous sacs livrés | OK | Lot 2 : livraison par part, commande terminée quand toutes livrées (`finish_if_delivered`) ; `test_restaurant_hands_over_and_confirms_per_part` | server.py | 0 |
| R31 | Publier un message visible par le client | OK | action `message` (ceo/restaurant), affiché côté client (live-map orderCard) | server.py, js/live-map.js | 0 |
| R32 | Annoncer manuellement un délai collecte/livraison | OK | action `eta` → pickupEta/deliveryEta, `etaSource='manual'` | server.py, js/professional.js | 0 |
| R33 | Voir l'heure estimée de fin de préparation | OK | Lot 3 : `prepEta` affiché (pkPrepLine, cuisine) ; `test_preparation_time_default_estimate_and_setting` | server.py, js/professional.js | 0 |
| R34 | Temps de préparation 15 min par défaut, réglable 1-180 | OK | Lot 3 : 15 min par défaut, 1-180 ; `test_preparation_time_default_estimate_and_setting` | server.py /api/prep | 0 |
| R35 | Médiane des 20 premières préparations, proposée puis validée | OK | Lot 3 : médiane des 20 premières, accord explicite ; `test_median_of_first_twenty_valid_preparations_is_proposed_then_refused_or_accepted` | server.py | 0 |
| R36 | Voir chaque livreur et sa part de sacs | OK | Lot 2/4 : chaque part (livreur, sacs, état) dans pkParts/pkGPS | js/professional.js | 0 |
| R37 | Carte des livreurs de ses commandes, sans tournée privée | OK | Revue I-1 corrigée : position fournie au restaurant seulement si le prochain arrêt de la tournée est le sien et sans sacs collectés d'une autre enseigne à bord ; point antérieur à une livraison ailleurs masqué (`gps_merchant`, état `busy`), même règle pour `drivers`. TF `test_review_i1_restaurant_never_sees_courier_at_other_brand_customer`, `test_review_i1_restaurant_hidden_while_courier_heads_to_other_pickup`, `test_shared_tour_reveals_no_gps_route_or_other_customer` | server.py order_view/bootstrap | 0 |
| R38 | Arrivée estimée de chaque livreur collecteur | OK | Lot 4 : `part.eta` par livreur (durées Google) ; `test_old_positions_and_estimates_are_never_shown_as_current` | server.py, js/professional.js pkGPS | 0 |
| R39 | Précision et date de la dernière position | OK | pkGPS : `pkDate(position.updatedAt)` + `précision … m` | js/professional.js pkGPS | 0 |
| R40 | Distinguer GPS récent, ancien ou interrompu | OK | Lot 4 : états live/récent/ancien/interrompu/aucun (`pkGpsStates`) ; tests/courier_tour.cjs | js/professional.js | 0 |
| R41 | Alerte si aucun livreur après 5 min | OK | Lot 3 : alerte 5 min ; `test_alerts_after_five_and_fifteen_minutes_without_courier` | server.py, js/professional.js | 0 |
| R42 | Alerte renforcée après 15 min | OK | Lot 3 : alerte renforcée 15 min ; même test | idem | 0 |
| R43 | Proposition manuelle de retrait après 15 min, accord client | OK | Lot 3 : proposition manuelle, accord client ; `test_pickup_proposal_after_fifteen_minutes_accepted_by_customer`, `..._refused_changes_nothing` | server.py, js/professional.js | 0 |
| R44 | Accepter une demande d'annulation client payée | OK | Lot 3 : `cancel-decision` accept ; `test_accepted_cancellation_restores_stock_once_even_after_preparation` | server.py | 0 |
| R45 | Refuser l'annulation avec message standard | OK | Lot 3 : refus message standard ; `test_customer_cancellation_request_refused_with_standard_message` | server.py | 0 |
| R46 | Annuler avec motif transmis au client | OK | status `no` + `why` (motif requis côté front, `short(reason)` serveur), affiché au client ; test `test_cancel_restores_stock_once_and_revokes_game` | server.py cancel_order | 0 |
| R47 | Restituer les stocks à l'annulation, même après préparation | OK | `cancel_order` → `record_stock(...,True)` une seule fois (`st=='no'` court-circuite), tout statut sauf done ; tests cancel/service_close | server.py cancel_order | 0 |
| R48 | Identifier les remboursements manuels | OK | `refund=bool(paid)` à l'annulation ; alerte « Remboursement manuel à effectuer » ; colonne CSV | server.py cancel_order, js/professional.js pkOrder | 0 |
| R49 | Déclarer un remboursement effectué | OK | Lot 3 : action `refunded` ; `test_restaurant_cancellation_requires_reason_and_refund_is_declared` | server.py, js/professional.js | 0 |
| R50 | Lire les réclamations de son seul établissement | OK | `owner()`/`scope()` ; test `test_complaints_can_be_replied_to_only_by_correct_restaurant` | server.py | 0 |
| R51 | Répondre aux réclamations | OK | action `reply` (ceo/restaurant) | server.py, js/professional.js | 0 |
| R52 | Voir la confirmation de réception client | OK | `order.recv` → pastille « Réception confirmée par le client » | server.py action received, pkOrder | 0 |
| R53 | Ajouter un produit | OK | A.eadd/esave (id `x…`) via `/api/menu` | index.html, js/professional.js put | 0 |
| R54 | Modifier un produit | OK | A.eopen/esave + contrôle révision `PK.editRevision` | index.html, js/professional.js | 0 |
| R55 | Supprimer un produit | OK | A.edel → `{del:true}` ; `items()` filtre `del` | index.html, server.py items | 0 |
| R56 | Nom, description, prix, catégorie, photo | OK | esave (n,d,p,c) ; photo via `/api/photo` (content-studio, produit existant), validée `/media/…` | index.html, js/content-studio.js, server.py | 0 |
| R57 | Options et suppléments | OK | Textarea `e_o` → `parseO` (« Sauce : A, B +0.50 ») ; prix des suppléments recalculés serveur | index.html esave, server.py create_order | 0 |
| R58 | Choix obligatoires | OK | Étoile `*` = `one` ; serveur exige 1 choix ; test `test_required_product_options_are_verified_server_side` | idem | 0 |
| R59 | Activer/désactiver un produit | OK | A.tog → `off` ; serveur refuse `off` | index.html, server.py | 0 |
| R60 | Régler les quantités en stock | OK | `e_s` → `s` (null = illimité) ; validé `number(...,0,1000000)` | index.html esave, server.py /api/menu | 0 |
| R61 | Décompter les stocks réservés | OK | `reserve_product` + `record_stock` à la commande ; `order.reserved` | server.py create_order | 0 |
| R62 | Bloquer la vente si stock insuffisant | OK | `require(stock>=qty,'Stock insuffisant.',409)` ; test `test_order_rejection_rolls_back_stock` | server.py record_stock | 0 |
| R63 | Refuser une ancienne version de carte | OK | `_revision` comparé dans /api/menu (409) ; test `test_stale_menu_edits_do_not_overwrite_new_order_stock` | server.py /api/menu, js/professional.js A.esave | 0 |
| R64 | Menu composé de produits fixes à prix propre | OK | pkMenuTools « Composer un menu » → `components` | js/professional.js action bundle | 0 |
| R65 | Menu au choix par catégorie | OK | « Menu au choix par catégorie » → `menuChoices` ; contrôle serveur | js/menu-composition.js, server.py | 0 |
| R66 | Quantités de produits/choix inclus | OK | `q` par composant (1-50) / par catégorie (1-10) validés serveur | server.py /api/menu | 0 |
| R67 | Décompter les stocks des composants | OK | `reserve_product` récursif ; test `test_fixed_and_choice_menus_reserve_component_stock` | server.py | 0 |
| R68 | Menu indisponible si composants épuisés | OK | Lot 5a : disponibilité calculée serveur (`availability`) : menu fixe/au choix à `s:0` si composant épuisé, désactivé ou insuffisant ; commande refusée 409 ; `test_composed_menus_detail_components_and_become_unavailable` | server.py | 0 |
| R69 | Promotions et cadeaux dans une seule interface | OK | Lot 5a : onglet unique « Promotions » (`pkPromos`, aussi CEO › Enseignes) ; ancien encadré % et « Codes cadeaux » retirés ; route `/api/promo` ; tests/kitchen.cjs, Chromium | js/kitchen.js, server.py promo_api | 0 |
| R70 | Code de réduction en pourcentage | OK | Lot 5a : `/api/promo` create kind=percent (entier 1-100) ; `test_percent_and_gift_codes_apply_only_with_their_code` | server.py | 0 |
| R71 | Code donnant un produit offert | OK | Lot 5a : create kind=gift ; même test | server.py | 0 |
| R72 | Choisir produit cadeau et quantité | OK | Lot 5a : giftId (pas de menu au choix) + giftQ 1-50 validés ; `test_promo_quota_counter_and_activation` | server.py | 0 |
| R73 | Limiter le nombre total d'utilisations | OK | Quota `max` ; dernière utilisation unique sous concurrence : `test_last_promo_use_and_last_stock_are_reserved_once_under_concurrency` | server.py create_order | 0 |
| R74 | Voir les utilisations consommées | OK | Lot 5a : « used / max utilisations · restantes », états Actif/Désactivé/Épuisé, cadeau lisible ; tests/kitchen.cjs, Chromium | js/kitchen.js | 0 |
| R75 | Désactiver ou réactiver un code | OK | Lot 5a : action `active` (restaurant de l’enseigne ou CEO) ; `test_promo_quota_counter_and_activation` | server.py, js/kitchen.js | 0 |
| R76 | Préserver compteurs ; nouveau code pour changer l'offre | OK | Lot 5a : code existant → 409 « créez un nouveau code » ; /api/menu conserve les promos serveur (compteurs forgés ignorés, pas de suppression) ; A.pdel neutralisé ; migration additive `migrate_promos` ; `test_new_offer_needs_new_code_and_counters_survive_menu_saves`, `test_legacy_promos_and_gift_codes_migrate_without_losing_counters` | server.py, js/kitchen.js | 0 |
| R77 | Réserver cadeau seulement à l'enregistrement avec code valide | OK | Création et vérification ne réservent rien ; réservation dans create_order ; `test_percent_and_gift_codes_apply_only_with_their_code`, `test_composite_gift_reserves_and_restores_ingredients` | server.py | 0 |
| R78 | Horaires d'ouverture et de fermeture | OK | h1/h2 modifiables (ssave), validés HH:MM côté serveur quand ils changent ; `test_hours_revolut_and_kitchen_type_are_editable_and_validated`. Les horaires n’interdisent pas la commande (créneau programmé), comportement existant conservé | server.py /api/menu | 0 |
| R79 | Lien de paiement Revolut | OK | `rev` validé (revolut.me / checkout / pay) ; même test | server.py, index.html ssave | 0 |
| R80 | Type de cuisine bassari/halavi/parvé | OK | `type` meat/dairy/parve validé ; même test | idem | 0 |
| R81 | Ouvrir un nouveau service | OK | /api/service `open` → nouvelle `session` | server.py, js/professional.js pkService | 0 |
| R82 | Clôturer sans supprimer les commandes reçues | OK | Lot 1 : la clôture bloque les nouvelles commandes sans annuler ; `test_service_close_keeps_received_orders_and_history` | server.py /api/service | 0 |
| R83 | Activer/désactiver livraison Kosh, dans limites CEO | OK | Local ET global ; `test_restaurant_modes_stay_within_ceo_limits`, `test_glo_disable_blocks_new_orders_but_preserves_accepted` | server.py effective_service | 0 |
| R84 | Retrait activable indépendamment | OK | `test_reception_modes_are_independent_and_exclude_uber_with_driver`, `test_restaurant_modes_stay_within_ceo_limits` | idem | 0 |
| R85 | Début des précommandes, mention Précommande, Chabbat | OK | Lot 5a : `effectiveService.preorderOpen` ; `pkPreorder` : carte non grisée, pastille « Précommande », mention sur la page restaurant ; Chabbat/service fermé respectés ; `test_open_preorders_accept_orders_for_the_opening_and_are_public`, tests/kitchen.cjs, Chromium (LevFood non grisé, Le J fermé grisé) | server.py, js/kitchen.js, index.html (patch KOSH final) | 0 |
| R86 | Programmer ouverture et délai après ouverture | OK | `opensAt` + `delay` → `scheduledAt` serveur ; test `test_global_schedule_blocks_orders_and_is_public` | server.py | 0 |
| R87 | Compte rendu CSV | OK | GET /api/report (scope restaurant) + lien « Compte rendu CSV » | server.py, js/professional.js pkService | 0 |
| R88 | Archives des commandes terminées/annulées | OK | Filtre « Terminées » (done + no) ; commandes jamais supprimées | js/professional.js pkOrders | 0 |

## Contrats partagés touchés

- **Table SQLite `docs`** (pas de tables dédiées) : `orders/<id>` (st, paid, paidAt, refund, why, gift, promo, reserved, driver, driverAccepted, pickupEta, deliveryEta, location, route, claims, message, recv), `menus/<mid>` (`items`, `promos{pct|kind:gift,giftId,giftQ,max,used,active}`, `service{open,session,glo,pickup,uber,preordersAt,opensAt,delay}`, h1/h2, rev, type, `_revision`), `reports/<id>`, `drivers/<aid>`, `versions/<id>`, `conf/main`. Tables `accounts`, `sessions`, `audit`, `files`.
- **Statuts de commande** : `pay → decl → ok → prep → ready → go (deliv) → done`, `no` (annulée). Ajouts nécessaires : sacs/parts (R23-R30, R36, R38), demande d'annulation (R44-45), remboursement déclaré (R49), proposition de retrait (R43), temps de préparation/médiane (R33-35). Ces ajouts touchent aussi les sections Livreur et CEO.
- **Routes API** : `GET /api/bootstrap?portal=restaurant`, `GET /api/report`, `POST /api/orders/action` (status, eta, message, reply), `/api/dispatch`, `/api/menu`, `/api/service` (open, close, schedule, glo/pickup/uber), `/api/photo`, `/api/promo/check`, `/api/orders/accept` (livreur, impacté par R23).

## Top risques

1. **Fuite de tournée privée** : `integrations.route` écrit la géométrie complète de la tournée dans chaque `order.route`, envoyée au restaurateur et tracée par live-map (contraire à R37 et au contrat GPS).
2. **Modèle mono-livreur** : sacs/parts absents ; R23-R30, R36, R38 et les offres livreurs exigent un changement de schéma partagé (orders + available_offer + accept + dispatch) ; la règle de collecte partielle reste à clarifier.
3. **Clôture du service = annulation automatique** de toutes les commandes en cours, payées comprises (R82), à faire trancher par un humain.
4. **Compteurs promo écrasables** : recréer un code remet `used` à 0, `pdel` détruit l'historique et `/api/menu` accepte `used` venant du client (R76).
5. **Flux d'annulation client et délais absents** (R44-45, R33-35, R41-43) : aucune règle serveur. Les horaires h1/h2 ne sont pas vérifiés côté serveur (R78).

## Lot 5a — contrats ajoutés et limites (14/10/2026)

Les « Top risques » ci-dessus datent de l'inventaire initial ; 1 à 5 ont été traités par les lots 1-4 (tournée privée, parts, clôture, annulation client, délais) et 4 par le lot 5a (compteurs promo).

- **Route ajoutée** `POST /api/promo` (ceo, restaurant de l'enseigne) : `create` (kind percent|gift, code `[A-Z0-9]{3,16}`, pct, giftId, giftQ, max) et `active`. Un code existant ne peut être recréé (409). `/api/menu` ignore désormais `promos` et conserve celles du serveur.
- **Forme `menus/<mid>.promos[code]`** : `{kind, pct | giftId+giftQ, max, used, active, createdAt, createdBy}` ; migration additive `2026-10-lot5a-promos` (ajoute `kind`/`active`, conserve `used`, ne supprime rien).
- **Commande** : `lines[].inc` (composants d'un menu fixe), `giftLine {id,n,q,inc?}` en plus de `gift` (texte conservé).
- **Menus publics** : plus de quantité `s` envoyée aux clients ; seul `s:0` signale l'indisponibilité (calcul serveur `availability`). Les espaces restaurant/CEO gardent les stocks.
- **`effectiveService.preorderOpen`** (public) ; le front combine avec Chabbat, service fermé et horaires.
- Limites : la décision d'annulation d'une demande client se fait dans la vue détaillée (le mode cuisine la signale en priorité) ; la cuisine ne gère pas les remises par part (livraison Kosh), renvoyées à la vue détaillée ; sans `opensAt`, la précommande ne couvre que le jour de son ouverture hors horaires.
