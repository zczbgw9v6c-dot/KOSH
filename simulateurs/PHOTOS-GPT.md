# Photos des simulateurs : quoi demander à GPT

Les simulateurs affichent un dessin de secours tant qu'une photo n'existe pas. Dès qu'une photo détourée
est déposée, elle le remplace automatiquement. **Une image = un article, seul, sur fond transparent.**

## Marche à suivre

1. Dans ChatGPT (génération d'images), colle d'abord le **bloc de style** de la section voulue.
2. Demande ensuite les images **une par une** en collant la ligne « sujet » : *« Même style, même angle, même lumière. Sujet : … »*
3. Télécharge chaque image en PNG et nomme-la **exactement** comme la clé indiquée (ex. `salami-rosette.png`).
4. Envoie-moi les fichiers (ou dépose-les dans un dossier) puis :

```bash
python3 simulateurs/outils/detourer.py le-j dossier-des-photos/
```

Commence par les **3 images test** de Le J (marquées ★) : si l'angle et la lumière collent, on lance le reste.

---

## 1. Le J — couches du sandwich (22 images)

Toutes les couches doivent avoir **le même angle** pour s'empiler : c'est le point le plus important.

**Bloc de style (à coller en premier)**

> Ultra realistic commercial food photography, shot in a professional studio by a senior food photographer, 100 mm macro lens, f/8, soft diffused key light from upper left with a gentle rim light, true-to-life colours, crisp appetizing detail, no CGI look. Every image shows ONE single sandwich layer, alone, floating, seen from the same front three-quarter angle with the camera about 25 degrees above horizontal. The layer is oblong, about twice as wide as it is deep, sized to fit inside an oblong braided challah sandwich roll. Perfectly centered, fully inside the frame with a clear margin all around, nothing cropped. Transparent background (PNG with alpha), no shadow on the ground, no plate, no board, no props, no text, no hands. Landscape 3:2.

| Clé (nom du fichier) | Sujet |
| --- | --- |
| ★ `hallah-haut` | The TOP half of a sliced braided challah roll: glossy deep golden-brown braided crust with white sesame seeds, the cut side facing down and not visible. |
| ★ `hallah-bas` | The BOTTOM half of the same sliced braided challah roll: golden crust on the sides, the soft cream-white cut crumb facing up and clearly visible. |
| ★ `salami-rosette` | A generous layer of thinly sliced beef salami rosette, slices folded and ruffled, overlapping. |
| `dinde-fumee` | A generous layer of thinly sliced smoked turkey breast, pale pink, folded and ruffled. |
| `duo-volaille` | A generous layer of two kinds of thinly sliced poultry cold cuts mixed, one pale, one slightly rosy, folded. |
| `dinde-miel` | A generous layer of thinly sliced honey-glazed smoked turkey, golden caramel edge on each slice, folded. |
| `dinde-poivre` | A generous layer of thinly sliced smoked turkey with a cracked black pepper crust on the edge of each slice, folded. |
| `poulet-fume` | A generous layer of thinly sliced smoked chicken breast, cream-white with a light golden smoked edge, folded. |
| `pastrami-boeuf` | A generous layer of thinly sliced smoked beef pastrami, deep rosy red with a dark smoked bark edge, folded and ruffled. |
| `pastrami-poivre` | A generous layer of thinly sliced beef pastrami with a thick black pepper and coriander crust on each slice, folded. |
| `salade-israelienne` | A flat layer of Israeli salad: finely diced tomato, cucumber and a little onion and parsley, glistening. |
| `oignon` | A flat layer of raw red onion rings, thin, separated and overlapping. |
| `oignon-caramelise` | A flat layer of glossy dark golden caramelized onions. |
| `coleslaw` | A flat layer of creamy coleslaw: shredded white cabbage and carrot in a light creamy dressing. |
| `laitue` | A flat layer of fresh crisp green lettuce leaves with ruffled edges, a few water droplets. |
| `mayonnaise` | A thin glossy layer of mayonnaise spread in an oblong shape, with a few thick drips falling over the front edge. |
| `ketchup` | A thin glossy layer of ketchup spread in an oblong shape, with a few thick drips falling over the front edge. |
| `moutarde-miel` | A thin glossy layer of golden honey mustard sauce spread in an oblong shape, with a few thick drips over the front edge. |
| `sauce-burger` | A thin glossy layer of creamy light-orange burger sauce spread in an oblong shape, with a few thick drips over the front edge. |
| `harissa` | A thin layer of deep red harissa chili paste, slightly grainy and oily, spread in an oblong shape. |

## 2. Maison Braha — table de Chabbat (8 images)

**Bloc de style**

> Ultra realistic commercial bakery photography, professional studio, senior food photographer, 85 mm lens, warm soft golden key light from the upper left, true-to-life colours, crisp appetizing detail, no CGI look. Every image shows ONE single item (or one single serving plate of items), alone, seen from a three-quarter angle with the camera about 35 degrees above horizontal, as if standing in front of a dining table. Perfectly centered, fully inside the frame with a clear margin, nothing cropped. Transparent background (PNG with alpha), no tablecloth, no props, no text, no hands. Square 1:1.

| Clé | Sujet |
| --- | --- |
| `hallot` | Two homemade round braided challah loaves side by side, glossy golden-brown with sesame seeds. |
| `mini-pizzas-thon` | A white oval serving platter of ten small round mini pizzas topped with tomato sauce, flaked tuna and a black olive slice. |
| `pains-navettes` | A small basket of ten soft oval "navette" milk-bread rolls, golden and glossy with sesame seeds. |
| `babka-nutella` | A chocolate hazelnut babka loaf on a wooden board, two slices cut showing the dark marbled swirl. |
| `brioche-perles` | A round braided brioche crown generously topped with white pearl sugar. |
| `bougies` | One polished silver Shabbat candlestick with a lit white candle, warm flame. |
| `kiddouch` | An engraved silver kiddush cup filled with red wine. |
| `nappe` (facultatif) | A cream linen Shabbat tablecloth seen from above at 35 degrees, soft folds, subtle gold embroidery, filling the whole frame (opaque background, landscape 3:2). |

## 3. Kosher FC — plateaux (12 images)

Objectif : du vrai poulet frit de photographe culinaire, pas de rendu « plastique ».

**Bloc de style**

> Ultra realistic commercial fast-food photography, professional studio, senior food photographer, 85 mm lens, bright clean key light with a soft warm rim light, real fried chicken texture: irregular craggy golden-brown breading, tiny oil glints, visible crumbs, natural imperfections, nothing symmetrical, no plastic or CGI look, no artificial glow. Every image shows ONE single item or one single menu serving, alone, seen from a three-quarter angle with the camera about 35 degrees above horizontal. Plain unbranded packaging only: white and red striped paper, no logo, no lettering, no brand name. Perfectly centered, fully inside the frame with a clear margin. Transparent background (PNG with alpha), no tray, no props, no text, no hands. Square 1:1.

| Clé | Sujet |
| --- | --- |
| `menu-tenders` | Six crispy fried chicken tenders piled next to an unbranded striped paper cup of golden waffle fries. |
| `menu-tasty-bowl` | An unbranded striped paper bowl of white rice topped with crispy chopped chicken tenders and a zigzag of creamy pepper sauce. |
| `menu-burger` | A crispy fried chicken burger (sesame bun, crispy chicken fillet, melted cheddar slice, tomato, lettuce, creamy sauce) next to an unbranded striped cup of waffle fries. |
| `menu-salade-cesar` | An unbranded striped paper bowl of Caesar salad: crisp romaine, crispy chicken tender pieces, parmesan-style shavings, creamy dressing, with a small cup of waffle fries beside it. |
| `sauce-mayo` | A small clear plastic dipping cup of mayonnaise. |
| `sauce-ketchup` | A small clear plastic dipping cup of ketchup. |
| `sauce-moutarde-miel` | A small clear plastic dipping cup of golden honey mustard sauce. |
| `sauce-burger` | A small clear plastic dipping cup of creamy light-orange burger sauce. |
| `coca`, `coca-zero`, `ice-tea`, `eau` | Utilise de préférence **les vraies photos des canettes** déjà présentes sur le site (les marques ne se génèrent pas bien). |

## 4. Olev Burger — plateau (5 images)

**Bloc de style**

> Ultra realistic commercial burger photography, professional studio, senior food photographer, 85 mm lens, soft daylight-style key light, warm cream tones, real texture: smashed beef patties with dark lacy crispy edges, molten cheese, glossy soft bun, natural imperfections, no CGI look. Every image shows ONE single item, alone, three-quarter angle with the camera about 20 degrees above horizontal. Perfectly centered, fully inside the frame with a clear margin. Transparent background (PNG with alpha), no props, no text, no logo, no hands. Square 1:1.

| Clé | Sujet |
| --- | --- |
| `classique-olev` | A double smash burger: glossy soft golden bun, two thin smashed beef patties with crispy lacy edges, two slices of melted yellow cheese, pickle slices, ketchup and mustard. |
| `frites-menu` | A plain kraft paper cone of golden thin-cut french fries. |
| `ice-tea`, `coca-zero`, `coca-rouge` | Utilise **les vraies photos des canettes** déjà sur la fiche Olev du site. |

## 5. Porto Pizza K (10 images)

Les prompts existent déjà : voir `porto-pizza-k/PROMPTS-GPT.md` et `porto-pizza-k/ASSETS.md`.
