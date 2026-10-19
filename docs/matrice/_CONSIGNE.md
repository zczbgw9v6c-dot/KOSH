# Consigne commune aux agents d'inventaire

Dépôt : /home/claude/kosh-server (serveur Python `server.py` sans framework + SQLite ; front : `index.html` monolithique ~530 Ko avec scripts inline,
puis `js/professional.js` (espaces pro), `js/operations.js`, `js/arcade.js`, `js/live-map.js`, `js/menu-composition.js`, `js/content-studio.js` ;
`integrations.py` (OpenRouteService, chiffrement), `arcade_engine.py` (jeux vérifiés serveur), tests dans `tests/` : 48 tests unittest qui passent).
Les lignes JS/Python sont très longues (code compacté) : utiliser Grep avec -o et un contexte court, ou python pour extraire des extraits ; ne jamais lire index.html en entier.

Registre : /home/claude/kosh-server/docs/kosh-decisions.json (clé "decisions", champs id, effective_requirement, original_note).
Règles communes : docs/kosh-agent-contract.md. N'appliquer que la "effective_requirement".

Pour chaque identifiant de ta plage, vérifie dans le CODE (pas seulement le README) et écris une ligne :
| ID | Règle (≤12 mots) | État observé | Écart / travail | Fichiers | Effort |
État observé ∈ {OK, Partiel, Absent, À retirer, Retiré OK, Externe/bloqué}. Effort ∈ {0, S (<1h), M (1-4h), L (>4h)}.
"OK" exige une preuve citée (fonction / route / test). Si incertain, écrire Partiel et dire ce qui manque.
Ne modifie AUCUN fichier du dépôt sauf ton fichier de sortie. Pas d'appel réseau externe.
Termine par une section "Contrats partagés touchés" (tables SQL, statuts de commande, routes API) et "Top risques".
Ton message final : 10 lignes max (compte par état + 5 plus gros travaux).
