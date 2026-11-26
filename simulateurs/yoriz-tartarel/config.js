/* Yoriz & Tartarel · soirée spéciale 22 € : riz sauté beignet de poulet caramélisé + nems au poulet + boisson.
   Le client choisit avec ou sans nems, et sa boisson. */
window.KOSH_CONFIGS = window.KOSH_CONFIGS || {};
window.KOSH_CONFIGS['yoriz-tartarel'] = {
  id: 'yoriz-tartarel-soiree',
  scene: 'table',
  brand: 'Yoriz & Tartarel', initial: 'Y', tagline: 'Soirée spéciale',
  title: 'Ton plateau du soir', lineName: 'Soirée spéciale',
  price: 22, priceLabel: 'Soirée spéciale',
  theme: { c: '#b3161c', c2: '#d8343a', bg: '#fbf3e6', stage: 'radial-gradient(120% 90% at 50% 30%,#3a1a12 0%,#1d0d09 60%,#0d0604 100%)', surface: 'linear-gradient(180deg,#8a5a34,#5e3a1f)' },
  hintText: 'Avec ou sans nems ? Choisis, ton plateau se dresse',
  preset: ['riz-poulet-caramelise', 'nems-poulet'],
  steps: [
    { k: 'plat', label: 'Plat', max: 1, min: 1, items: [
      { k: 'riz-poulet-caramelise', n: 'Riz sauté, beignets de poulet caramélisé', emoji: '🍛', spot: [36, 80, 44] },
    ] },
    { k: 'nems', label: 'Nems', max: 1, min: 1, need: 'Avec ou sans nems ?', hint: 'Les nems au poulet sont compris', items: [
      { k: 'nems-poulet', n: 'Avec nems au poulet', emoji: '🥟', spot: [58, 98, 34] },
      { k: 'sans-nems', n: 'Sans nems', emoji: '🚫', noProp: true },
    ] },
    { k: 'boisson', label: 'Boisson', max: 1, min: 1, need: 'Choisis ta boisson', hint: 'Une boisson au choix, comprise', items: [
      { k: 'coca-rouge', n: 'Coca rouge', emoji: '🥤', spot: [82, 66, 18] },
      { k: 'coca-zero', n: 'Coca zéro', emoji: '🥤', spot: [82, 66, 18] },
      { k: 'ice-tea', n: 'Ice tea', emoji: '🧋', spot: [82, 66, 18] },
      { k: 'eau', n: 'Eau', emoji: '💧', spot: [82, 66, 18] },
    ] },
  ],
};
