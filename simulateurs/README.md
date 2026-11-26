# Simulateurs de composition Kosh

Modules autonomes (aucune dépendance) à intégrer ensuite dans Kosh. Ouvrir le `index.html` de chaque dossier pour la démo.

| Dossier | Restaurant | Ce qu'on compose | Prix |
| --- | --- | --- | --- |
| `le-j/` | Le J | Sandwich hallah : sauces, garnitures, charcuteries qui s'empilent | Tout compris 15,90 € |
| `maison-braha/` | Maison Braha | Table de Chabbat qui se remplit | Carte, paliers compris (hallot 3 € / 25 € les 10…) |
| `kosher-fc/` | Kosher FC | Plateau : menu, sauce, boisson | 14 à 18 € selon le menu |
| `olev-burger/` | Olev Burger | Plateau Menu Olev : boisson, frites en plus | 19 € + 3 € par portion de frites en plus |
| `porto-pizza-k/` | Porto Pizza K | Pizza (module d'origine, à passer en photos) | Carte + suppléments 2 € |

- `moteur.js` : moteur commun (scènes « pile » et « table »), une `config.js` par restaurant.
- `PHOTOS-GPT.md` : prompts des photos à générer ; `outils/detourer.py` les intègre (détourage + manifeste).
- `onAdd(line)` reçoit `{ id, name, options, price, items }` pour l'ajout au panier.

À confirmer avec les restaurants : la liste des boissons de Kosher FC (non indiquée sur la carte), et si la sauce
est proposée avec le Menu Salade César.
