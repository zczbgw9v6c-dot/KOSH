# Porto Pizza K · simulateur « Compose ta pizza »

Module autonome (aucune dépendance) à intégrer plus tard dans Kosh.
Ouvrir `index.html` dans un navigateur pour la démo.

- Charte de la carte Porto Pizza K : vert, rouge, crème, titre « PORTO PIZZA K » et double liseré.
- Deux bases : **sauce tomate + mozzarella** (déjà posées au départ) ou **chocolat (Nutella vegan, 9 €)**.
- Tailles **M** (prix de la carte) et **XL** (+3 €).
- Ingrédients sur la base tomate : olives vertes, champignons, thon, saumon, oignons rouges, piments.
- Photos réelles : voir `ASSETS.md` (le rendu dessiné est utilisé tant qu'elles ne sont pas fournies).
- Prix : la pizza de la carte qui porte la garniture principale sert de base (Mozza thon 16 €, Mozza saumon 17 €…),
  les autres ingrédients sont comptés en suppléments à 2 €.
- « Ajouter à la commande » : cuisson animée, puis `onAdd(line)` reçoit
  `{ id, name, base, size, options, price }` (ex. `pzk-04`, « Mozza saumon », `["Taille : XL", "Thon"]`, 22).

```js
PortoPizzaSimulator.mount(document.getElementById('simulateur'), {
  onAdd(line) { /* ajouter au panier */ },
  onViewCart() { /* facultatif */ },
  closed: false,        // ou une fonction
  menu: PortoPizzaSimulator.MENU, // facultatif : carte avec prix à jour
});
```
