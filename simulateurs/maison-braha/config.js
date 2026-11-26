/* Maison Braha · « Dresse ta table de Chabbat » — prix de la carte, paliers compris (ex. hallot : 3 € l'unité, 25 € les 10).
   spot : [gauche %, bas de l'objet %, largeur] = l'endroit où l'article se pose sur la table. */
window.KOSH_CONFIGS = window.KOSH_CONFIGS || {};
window.KOSH_CONFIGS['maison-braha'] = {
  id: 'maison-braha-table',
  scene: 'table',
  brand: 'Maison Braha', initial: 'B', tagline: 'Les gourmandises de Chabbat',
  title: 'Dresse ta table', lineName: 'Table de Chabbat',
  priceLabel: 'Ta table',
  theme: { c: '#7a1626', c2: '#a3283b', bg: '#fbf5ea', stage: 'radial-gradient(120% 90% at 50% 30%,#8f2233 0%,#5c0f1c 60%,#33060f 100%)', surface: 'linear-gradient(180deg,#fffaf0,#eadfc8)' },
  hintText: 'Touche une gourmandise, elle arrive sur ta table',
  cta: 'Commander ma table', empty: 'Ta table est vide',
  decor: [
    { k: 'bougies', emoji: '🕯️', spot: [16, 50, 13] },
    { k: 'bougies-2', ph: 'bougies', emoji: '🕯️', spot: [27, 48, 13] },
    { k: 'kiddouch', emoji: '🍷', spot: [84, 50, 13] },
  ],
  steps: [
    { k: 'table', label: 'Les gourmandises', qty: true, hint: 'Touche pour ajouter, « − » pour retirer', items: [
      { k: 'hallot', n: 'Hallot maison', sub: '3 € · les 10 : 25 €', tiers: [[10, 25], [1, 3]], emoji: '🥖', spot: [50, 62, 30] },
      { k: 'mini-pizzas-thon', n: 'Mini-pizzas au thon', sub: 'les 10 : 12 € · les 20 : 20 €', unit: 10, tiers: [[2, 20], [1, 12]], emoji: '🍕', spot: [24, 82, 26] },
      { k: 'pains-navettes', n: 'Pains navettes', sub: 'les 10 : 8 €', unit: 10, tiers: [[1, 8]], emoji: '🥯', spot: [76, 82, 26] },
      { k: 'babka-nutella', n: 'Babka Nutella', sub: '6 pers. · 10 €', tiers: [[1, 10]], emoji: '🍫', spot: [38, 96, 24] },
      { k: 'brioche-perles', n: 'Brioche perles de sucre', sub: '6 pers. · 10 €', tiers: [[1, 10]], emoji: '🍞', spot: [64, 97, 24] },
    ] },
  ],
};
