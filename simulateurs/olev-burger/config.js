/* Olev Burger · « Ton menu Olev » — Menu Olev 19 € (Classique Olev, frites, boisson au choix), frites en plus 3 €. */
window.KOSH_CONFIGS = window.KOSH_CONFIGS || {};
window.KOSH_CONFIGS['olev-burger'] = {
  id: 'olev-burger-menu',
  scene: 'table',
  brand: 'Olev Burger', initial: 'O', tagline: 'Smash burger · Fries',
  title: 'Ton menu Olev', lineName: 'Menu Olev',
  price: 19, priceLabel: 'Menu Olev',
  theme: { c: '#ee6a45', c2: '#f58a67', bg: '#fbf2df', stage: 'radial-gradient(120% 90% at 50% 30%,#f58a67 0%,#e2552f 60%,#a8361a 100%)', surface: 'linear-gradient(180deg,#fdf6e6,#ecdfc2)' },
  hintText: 'Choisis ta boisson, ton plateau est prêt',
  preset: ['classique-olev', 'frites-menu'],
  steps: [
    { k: 'burger', label: 'Burger', max: 1, min: 1, items: [
      { k: 'classique-olev', n: 'Classique Olev', sub: 'Double steak smashé, fromage fondant', emoji: '🍔', spot: [38, 90, 44] },
    ] },
    { k: 'frites', label: 'Frites', qty: true, hint: 'Une portion comprise · portion en plus : 3 €', free: 1, items: [
      { k: 'frites-menu', n: 'Frites', sub: 'comprises · en plus 3 €', p: 3, emoji: '🍟', spot: [72, 92, 26] },
    ] },
    { k: 'boisson', label: 'Boisson', max: 1, min: 1, need: 'Choisis ta boisson', hint: 'Une boisson au choix, comprise dans le menu', items: [
      { k: 'ice-tea', n: 'Ice Tea', emoji: '🧋', spot: [82, 62, 18] },
      { k: 'coca-zero', n: 'Coca zéro', emoji: '🥤', spot: [82, 62, 18] },
      { k: 'coca-rouge', n: 'Coca rouge', emoji: '🥤', spot: [82, 62, 18] },
    ] },
  ],
};
