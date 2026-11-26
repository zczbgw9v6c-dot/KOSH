/* Kosher FC · « Compose ton menu » — 4 menus de la carte, boisson et sauce au choix. */
window.KOSH_CONFIGS = window.KOSH_CONFIGS || {};
window.KOSH_CONFIGS['kosher-fc'] = {
  id: 'kosher-fc-menu',
  scene: 'table',
  brand: 'Kosher FC', initial: 'K', tagline: 'Poulet frit croustillant',
  title: 'Compose ton menu', lineName: 'Menu Kosher FC',
  priceLabel: 'Ton menu',
  theme: { c: '#d3121a', c2: '#f0343b', bg: '#fff5f4', stage: 'radial-gradient(120% 90% at 50% 30%,#e8262d 0%,#a50c12 60%,#5f0508 100%)', surface: 'linear-gradient(180deg,#ffffff,#eceaea)' },
  hintText: 'Choisis ton menu, ton plateau se remplit',
  empty: 'Choisis ton menu',
  steps: [
    { k: 'menu', label: 'Menu', max: 1, min: 1, need: 'Choisis ton menu', items: [
      { k: 'menu-tenders', n: 'Menu Tenders', sub: 'Tenders + waffle frites', p: 16, emoji: '🍗', spot: [40, 86, 46] },
      { k: 'menu-tasty-bowl', n: 'Menu Tasty Bowl', sub: 'Bowl tenders crousty + riz', p: 14, emoji: '🍚', spot: [40, 86, 46] },
      { k: 'menu-burger', n: 'Menu Burger', sub: 'Burger + waffle frites', p: 18, emoji: '🍔', spot: [40, 86, 46] },
      { k: 'menu-salade-cesar', n: 'Menu Salade César', sub: 'Nouveauté · + waffle frites', p: 15, emoji: '🥗', spot: [40, 86, 46] },
    ] },
    { k: 'sauce', label: 'Sauce', max: 1, hint: 'Une sauce au choix, comprise dans le menu', items: [
      { k: 'sauce-mayo', n: 'Mayo', emoji: '🥛', spot: [72, 94, 16] },
      { k: 'sauce-ketchup', n: 'Ketchup', emoji: '🍅', spot: [72, 94, 16] },
      { k: 'sauce-moutarde-miel', n: 'Moutarde miel', emoji: '🍯', spot: [72, 94, 16] },
      { k: 'sauce-burger', n: 'Sauce burger', emoji: '🧡', spot: [72, 94, 16] },
    ] },
    { k: 'boisson', label: 'Boisson', max: 1, min: 1, need: 'Choisis ta boisson', hint: 'Une boisson au choix, comprise dans le menu', items: [
      { k: 'coca', n: 'Coca-Cola', emoji: '🥤', spot: [80, 64, 20] },
      { k: 'coca-zero', n: 'Coca zéro', emoji: '🥤', spot: [80, 64, 20] },
      { k: 'ice-tea', n: 'Ice Tea', emoji: '🧋', spot: [80, 64, 20] },
      { k: 'eau', n: 'Eau', emoji: '💧', spot: [80, 64, 20] },
    ] },
  ],
};
