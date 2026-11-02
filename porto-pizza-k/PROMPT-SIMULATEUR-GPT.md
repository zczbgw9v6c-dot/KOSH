# Prompt GPT · simulateur Porto Pizza K

À coller tel quel dans **la même conversation ChatGPT** que celle où il a généré les 10 images
(il pourra ainsi les réutiliser). Tout ce qui est entre les deux lignes `====` est à copier.

====

Tu vas maintenant créer un **simulateur de pizza interactif** pour le restaurant **Porto Pizza K**, avec les
10 images que tu viens de générer. Ce simulateur sera intégré à une application de commande de restaurants
(Kosh) : quand le client ouvre la fiche du restaurant, il compose sa pizza de façon ludique, puis l'ajoute
à sa commande. Je veux un résultat digne d'une app premium : ultra réaliste, fluide, beau sur iPhone.

## 1. Le concept (inspiré d'une vidéo virale « Monte sua pizza »)

Écran vertical de téléphone. De haut en bas :
1. Un titre, un sous-titre et deux sélecteurs en forme de pilule (base et taille).
2. Au centre, **la pizza vue du dessus**, grande, sur un plan de travail.
3. Une ligne d'aide : « Touche un ingrédient pour l'ajouter ».
4. Une grille de **ronds d'ingrédients** (icône + nom + « +2,00 € »).
5. En bas, un grand bouton pleine largeur : « Ajouter · au four » à gauche, **le prix** à droite.

Le déroulé :
- **Au départ**, la pizza montre déjà la pâte crue avec la sauce tomate et la mozzarella (c'est la base de
  toutes les pizzas de la carte). Prix affiché : 13,00 €.
- **Quand on touche un ingrédient**, ses morceaux **s'envolent depuis le rond de l'ingrédient** en décrivant
  une petite courbe vers le haut, grossissent un instant, puis **retombent sur la pizza** avec un léger rebond,
  l'un après l'autre (décalage de quelques dizaines de millisecondes). Ils se répartissent naturellement sur la
  sauce, sans trop se chevaucher, avec une rotation aléatoire. Le rond de l'ingrédient s'entoure d'un anneau,
  reçoit une coche ✓ en haut à droite et un petit bouton « − » en haut à gauche. Toucher à nouveau, ou appuyer
  sur « − », retire l'ingrédient : ses morceaux disparaissent en rétrécissant.
- **Le prix du bouton défile** (petite animation de compteur) jusqu'au nouveau montant à chaque changement.
- **Le changement de taille M ↔ XL** fait grossir ou rétrécir la pizza avec un effet ressort.
- **En appuyant sur le bouton**, la pizza part **au four** (environ 3,5 secondes) :
  - le plan de travail s'assombrit et devient l'intérieur d'un four à bois (lueur orange, flammes en bas) ;
  - la pizza reste visible au centre et **cuit sous nos yeux** : on passe en fondu de la photo crue à la photo
    cuite (croûte qui gonfle et dore, mozzarella qui fond), les ingrédients brunissent légèrement ;
  - des **braises montent** ;
  - le bouton devient **vert** et **se remplit de gauche à droite** comme une barre de progression,
    texte « Cuisson en cours ».
- **Sortie du four** : le four disparaît, la pizza cuite reste à l'écran, message « Sortie du four ✓ ·
  [nom de la pizza] ajoutée » avec un lien « Recomposer », et la pizza s'ajoute à un petit encart
  « Ta commande » sous le simulateur (nom, options, prix).

## 2. La carte et les prix (à respecter exactement)

Pizzas (taille M) :
- Mozzarella : 13 €
- Mozza olives vertes : 15 €
- Mozza thon : 16 €
- Mozza saumon : 17 €
- Mozza champignons : 15 €
- Pizza chocolat (Nutella vegan) : 9 €

Tailles : **M** = prix de la carte, **XL** = +3 €.
Suppléments : 2 € chacun (oignons rouges, olives vertes, champignons, thon, saumon, piments).

Ingrédients ajoutables sur la base tomate + mozzarella : Olives vertes, Champignons, Thon, Saumon,
Oignons rouges, Piments.

Calcul du prix : la pizza de la carte qui correspond à la garniture principale sert de base (la plus chère
si plusieurs correspondent), les autres ingrédients sont comptés comme suppléments à 2 €, puis +3 € en XL.
Exemples à vérifier :
- rien ajouté → Mozzarella 13 €
- thon → Mozza thon 16 €
- thon + saumon → Mozza saumon 17 € + thon 2 € = 19 €
- oignons rouges → Mozzarella 13 € + 2 € = 15 €
- saumon + olives + champignons + oignons + piments en XL → 17 + 4 × 2 + 3 = 28 €

**Pizza chocolat** : un sélecteur de base « Tomate · mozza / Chocolat ». En chocolat, la pizza montre la pâte
crue nature, les ingrédients sont grisés et désactivés, le prix est 9 € (12 € en XL), et à la sortie du four
la pâte cuite apparaît couverte de Nutella brillant.

## 3. L'identité visuelle de Porto Pizza K (sa carte papier)

On doit reconnaître ce restaurant au premier coup d'œil :
- Fond **crème / papier** (#faf6ef), texte presque noir.
- En haut : « À emporter · 33 Rua Nicolau Marques Guedes » en petite police condensée (type Oswald), puis
  **« PORTO PIZZA K »** en grandes capitales **vertes** (#1c7a33), très espacées, police géométrique grasse
  (type Montserrat 800).
- Juste dessous, un **double liseré** horizontal : une bande **verte** puis une bande **rouge** (#e0281c),
  rappel du drapeau italien. Le même double liseré ferme le bas du simulateur.
- Un **bandeau vert à texte blanc** en capitales, « COMPOSE TA PIZZA », dans le style « NOS PIZZAS » de la carte.
- Sélecteurs en pilules crème avec un curseur **vert** qui glisse.
- Ronds d'ingrédients blancs avec ombre douce ; sélectionné = anneau vert, coche verte, « − » rouge.
- Bouton principal **rouge** ; pendant la cuisson et après l'ajout, **vert**.
- La pizza est posée sur un plan de travail clair, avec une **ombre portée réaliste** et un léger jeu
  d'ombre de fenêtre, comme une vraie photo culinaire en lumière naturelle.

## 4. Les images (celles que tu viens de générer)

- Pizzas : `tomate-crue`, `tomate-cuite`, `pate-crue`, `chocolat-cuite`. Détoure-les en rond (fond transparent)
  et superpose crue et cuite au même endroit pour le fondu de cuisson.
- Ingrédients : `olives`, `champi`, `thon`, `saumon`, `oignons`, `piments`. Retire le fond uni (bleu ou vert),
  supprime le liseré de couleur sur les bords et **découpe chaque morceau** en PNG transparent. Utilise ces
  morceaux à la fois sur la pizza (taille réaliste par rapport à elle) et dans les ronds d'ingrédients.
- Fais ce traitement toi-même avec ton outil Python, et montre-moi un aperçu des morceaux découpés.

## 5. Contraintes techniques

- **Un seul fichier HTML autonome** (HTML + CSS + JavaScript, sans framework), avec **toutes les images
  intégrées en base64** pour qu'il fonctionne en l'ouvrant directement sur un téléphone ou un ordinateur.
  Donne-le-moi en **fichier téléchargeable**.
- Pensé pour mobile (largeur 360 à 430 px), centré sur grand écran. Pas de défilement horizontal.
- Animations fluides (Web Animations API ou CSS), respect de `prefers-reduced-motion`.
- Accessibilité : vrais boutons, états `aria-pressed`, textes lisibles.
- Le code doit exposer une fonction réutilisable pour l'intégration dans l'app :
  `PortoPizzaSimulator.mount(element, { onAdd(ligne) {} })`, où `ligne` vaut
  `{ id, name, base, size, options, price }` (ex. `{ id: "pzk-04", name: "Mozza saumon", base: "tomate",
  size: "XL", options: ["Taille : XL", "Thon"], price: 22 }`).
- Tous les textes en français.

## 6. Ce que j'attends en retour

1. Le fichier HTML complet et téléchargeable.
2. Un aperçu (capture) des étapes : départ, pizza garnie, au four, sortie du four, pizza chocolat.
3. La vérification des 5 exemples de prix ci-dessus.

Le mot d'ordre : **parfait**. Réalisme des aliments, fluidité des animations, fidélité à la carte Porto Pizza K.

====
