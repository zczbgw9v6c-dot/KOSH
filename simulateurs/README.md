# Simulateurs de composition Kosh

Modules autonomes (aucune dépendance) à intégrer ensuite dans Kosh. Ouvrir le `index.html` de chaque dossier pour la démo.

| Dossier | Restaurant | Ce qu'on compose | Prix |
| --- | --- | --- | --- |
| `le-j/` | Le J | Sandwich hallah : sauces, garnitures, charcuteries qui s'empilent | Tout compris 15,90 € |
| `maison-braha/` | Maison Braha | Table de Chabbat qui se remplit | Carte, paliers compris (hallot 3 € / 25 € les 10…) |
| `kosher-fc/` | Kosher FC | Plateau : menu, sauce, boisson | 14 à 18 € selon le menu |
| `olev-burger/` | Olev Burger | Burger en photos réelles : 1 ou 2 steaks, cheddar parvé, oignons caramélisés, cornichons ; frites, boisson | 19 € + 3 € par portion de frites en plus |
| `yoriz-tartarel/` | Yoriz & Tartarel | Plateau de la soirée : avec ou sans nems, boisson | 22 € |
| `porto-pizza-k/` | Porto Pizza K | Pizza (module d'origine, à passer en photos) | Carte + suppléments 2 € |

- `moteur.js` : moteur commun (scènes « pile » et « table »), une `config.js` par restaurant.
- `PHOTOS-GPT.md` : prompts des photos à générer ; `outils/detourer.py` les intègre (détourage + manifeste).
- `onAdd(line)` reçoit `{ id, name, options, price, items }` pour l'ajout au panier.

Intégration dans l'application : `js/meal-preview.js` affiche la pile de photos dans le configurateur standard pour
tout produit dont le menu porte un champ `mealPreview` (voir `docs/MEAL-PREVIEW.md`).

À confirmer avec les restaurants : le prix du deuxième steak chez Olev Burger (0 € dans la démo tant qu'il n'est pas
communiqué) et le prix de la soirée Yoriz & Tartarel sans nems (22 € dans les deux cas pour l'instant).
