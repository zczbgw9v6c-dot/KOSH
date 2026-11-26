# Aperçu de composition KOSH

Le premier profil utilise huit photographies détourées WebP. L'assemblage 2,5D garde le détail de la photo, fonctionne avec les éléments HTML existants et évite de charger un moteur WebGL. Un rendu Three.js ou React Three Fiber devient pertinent si le produit doit tourner librement ou montrer ses faces cachées. Il faudrait alors des géométries et matériaux cohérents pour chaque ingrédient, un budget GPU mobile et une stratégie de repli.

## Activation produit

L'aperçu s'affiche dans le configurateur standard pour un produit doté d'options et d'un champ `mealPreview` dans son document de menu. Renseigner le champ au travers de l'API menu authentifiée, avec la révision du document courant. Associer les calques fixes aux ingrédients réellement inclus et les calques conditionnels aux intitulés exacts des groupes et choix de ce produit. Les options non visuelles peuvent rester dans le configurateur. Si le mapping devient invalide, le configurateur standard prend le relais. Le prix, les quantités de burgers, le panier, les stocks et les options validées restent ceux du parcours courant. Une portion supplémentaire d'un ingrédient se représente par un choix distinct du menu avec le prix correspondant et un ou plusieurs calques mappés à ce choix. Le prix et les options sont validés de nouveau par le serveur au passage de commande.

Exemple pour un burger fictif avec l'option « Tomate » du groupe « Garnitures ».

```json
{
  "mealPreview": {
    "profile": "burger",
    "layers": [
      { "asset": "bun-bottom" },
      { "asset": "beef" },
      { "asset": "tomato", "option": { "group": "Garnitures", "choice": "Tomate" } },
      { "asset": "bun-top" }
    ]
  }
}
```

Faire valider la recette et les noms par le restaurateur avant de publier la fiche. Pour les commerces de KOSH Porto, le fromage et les autres garnitures doivent correspondre à la recette autorisée et effectivement servie par l'établissement. Le visuel ne doit jamais permettre d'inférer les allergènes.

## Passation à Claude Fable 5.2

Travaille dans l'archive privée KOSH utilisée pour le déploiement. Inventorie les versions actuelles du catalogue restaurateur, des options et quantités, du panier et du calcul serveur. Identifie les différences avec l'instantané d'octobre `9c57434` et transpose le changement avec les conventions et la navigation de novembre. Fournis le diff pour revue et le résultat des tests par étape.

1. Conserve le configurateur et le contrat de commande actuels. Réutilise leurs options, montants, notes, règles de disponibilité et variantes de panier. Si le catalogue de novembre expose des identifiants stables pour les options, utilise-les et invalide un mapping obsolète au lieu d'approximer par nom.
2. Branche la scène sur un burger dont le restaurateur a confirmé les ingrédients. Permets au restaurateur de prévisualiser, activer et désactiver le rendu par produit. Ajoute une validation des identifiants d'assets et de références du catalogue. Pour les quantités d'ingrédient natives, teste les bornes, le prix unitaire et la persistance dans commande et cuisine.
3. Pour chaque nouveau profil, transmets à GPT Image la liste exacte des assets avec identifiants, taille relative, profondeur de pose, angle et direction de lumière. Utilise une référence de rendu commune pour chaque profil. Burger et sandwich utilisent une pile frontale. Pizza, bowl et salade demandent des masques et des ancrages de surface. Pour tacos, prévoir une enveloppe avant et arrière pour l'occlusion. Valide le résultat dans une scène assemblée et une scène éclatée.
4. Pour le burger, la planche source GPT Image utilise deux colonnes et quatre lignes, des sujets photographiques au même angle frontal de 14° au-dessus de l'horizon, une lumière douce supérieure gauche, un fond transparent et des marges entre sujets. Ordre ligne par ligne, brioche haute et basse, steak et tranche de cheddar, laitue et tomate, cornichon et oignon rouge. Les sprites web découpés représentent environ 370 Kio au total avant cache. Conserve ces angles et proportions pour les compléments.
5. Exécute les tests existants et le scénario `tests/meal-preview.cjs` après adaptation au dépôt. Vérifie sur Safari iOS et Chrome Android la lisibilité, les animations lors de clics rapides, la préférence de mouvement réduit et la possibilité de commander quand des images sont indisponibles. Compare le prix dans la fiche, le panier et la commande serveur. Renvoie les résultats et les captures assemblée et éclatée pour revue.
