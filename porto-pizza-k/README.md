# Porto Pizza K · simulateur « Compose ta pizza »

Module autonome (aucune dépendance) à intégrer plus tard dans Kosh.
Ouvrir `index.html` dans un navigateur pour la démo.

- Base sauce tomate, tailles **M** (prix de la carte) et **XL** (+3 €).
- Ingrédients : mozzarella (obligatoire, comme sur toutes les pizzas de la carte), olives vertes,
  champignons, thon, saumon, oignons rouges, piments.
- Prix : la pizza de la carte qui porte la garniture principale sert de base (Mozza thon 16 €, Mozza saumon 17 €…),
  les autres ingrédients sont comptés en suppléments à 2 €.
- « Ajouter à la commande » : cuisson animée, puis `onAdd(line)` reçoit
  `{ id, name, size, options, price }` (ex. `pzk-04`, « Mozza saumon », `["Taille : XL", "Thon"]`, 22).

```js
PortoPizzaSimulator.mount(document.getElementById('simulateur'), {
  onAdd(line) { /* ajouter au panier */ },
  onViewCart() { /* facultatif */ },
  closed: false,        // ou une fonction
  menu: PortoPizzaSimulator.MENU, // facultatif : carte avec prix à jour
});
```

La pizza chocolat (Nutella vegan, 9 €) n'entre pas dans le simulateur : elle reste un article classique de la carte.
