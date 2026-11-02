# Photos réelles du simulateur

Le simulateur affiche des **photos réelles** dès qu'elles sont présentes dans `assets/` (sinon il garde son rendu dessiné).
Il faut 10 images, générées par IA (gpt-image, Seedream, Flux…) ou photographiées en cuisine.

## 1. Les 4 pizzas (vue du dessus, fond gris clair uni)

| Fichier | Contenu |
| --- | --- |
| `tomate-crue` | Pâte crue étalée, sauce tomate, morceaux de mozzarella fraîche crue |
| `tomate-cuite` | **La même pizza**, cuite : croûte gonflée et léopardée, mozzarella fondue (générer en image de référence de la crue) |
| `pate-crue` | Pâte crue nature, sans garniture |
| `chocolat-cuite` | Pâte cuite couverte de Nutella brillant (générer en référence de la pâte crue) |

Prompt de base (à adapter) :

> Professional food photography, perfectly top-down 90° overhead view of an UNBAKED raw Neapolitan pizza: hand-stretched raw pale cream dough with a thicker raw puffy rim, smooth bright red San Marzano tomato sauce, generous torn pieces of fresh white fior di latte mozzarella, raw and not melted, light dusting of flour. No basil, nothing else. Perfectly centered and round, fills 88% of the square frame, flat seamless plain medium neutral grey background (#9a9a98), soft diffused daylight, very soft contact shadow, ultra realistic.

Version cuite (avec la crue en référence) : *« Same pizza, same framing, now baked in a 450 °C wood-fired oven: puffy golden crust with leopard char spots, mozzarella melted and lightly golden, sauce slightly reduced. »*

```bash
python3 outils/decouper.py pizza photo-crue.jpg tomate-crue
```

## 2. Les 6 planches d'ingrédients (fond uni très coloré, morceaux séparés)

Une image par ingrédient, 9 à 12 morceaux bien espacés, **sur fond bleu pur** (fond **vert** pour les oignons) :

> Ultra realistic food macro photography, top-down view of 9 separate [INGREDIENT], arranged in a loose 3x3 grid, each piece clearly separated with lots of empty space, nothing touching, nothing cut by the frame. Flat seamless solid pure saturated blue background (#0030ff), even flat lighting, no shadows, no props.

`olives` : rondelles d'olives vertes dénoyautées · `champi` : lamelles de champignons de Paris · `thon` : morceaux de thon émietté ·
`saumon` : morceaux de saumon fumé · `oignons` : demi-anneaux d'oignon rouge · `piments` : rondelles de piment rouge.

```bash
python3 outils/decouper.py morceaux planche-olives.jpg olives
```

Chaque commande détoure, découpe et met à jour `assets/manifest.js` automatiquement. Rien d'autre à toucher.
