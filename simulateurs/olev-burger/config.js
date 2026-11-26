/* Olev Burger · « Monte ton Olev » — Menu Olev 19 € : Classique Olev, frites et boisson au choix.
   Recette du restaurant : pain maison, steak smashé, cheddar parvé, oignons caramélisés.
   Deux steaks au maximum. Les garnitures sont posées d'office : on touche pour en retirer une.
   z = rang dans le burger (du bas vers le haut). */
window.KOSH_CONFIGS = window.KOSH_CONFIGS || {};
window.KOSH_CONFIGS['olev-burger'] = {
  id: 'olev-burger-menu',
  scene: 'pile',
  brand: 'Olev Burger', initial: 'O', tagline: 'Smash burger · Fries',
  title: 'Monte ton Olev', lineName: 'Menu Olev',
  price: 19, priceLabel: 'Menu Olev',
  theme: { c: '#ee6a45', c2: '#f58a67', bg: '#fbf2df', stage: 'radial-gradient(120% 90% at 50% 40%,#f79a78 0%,#e2552f 60%,#a8361a 100%)' },
  hintText: 'Touche pour ajouter un steak ou retirer une garniture',
  bottom: { k: 'pain-bas', art: { t: 'painBas' }, w: 68, rise: 9 },
  top: { k: 'pain-haut', art: { t: 'painHaut', tresse: false }, w: 70 },
  preset: ['steak', 'cheddar-parve', 'oignons-caramelises', 'cornichons', 'frites'],
  steps: [
    { k: 'steak', label: 'Steak', qty: true, min: 1, max: 2, need: 'Il faut au moins un steak', hint: 'Un ou deux steaks smashés, pas plus', free: 1, items: [
      // PRIX DU DEUXIÈME STEAK À CONFIRMER avec le restaurant : 0 tant qu'il n'est pas communiqué.
      { k: 'steak', n: 'Steak smashé', sub: 'le 2ᵉ : prix à confirmer', p: 0, z: 1, w: 71, rise: 8, art: { t: 'steak' } },
    ] },
    { k: 'garnitures', label: 'Garnitures', hint: 'Tout est compris · touche pour retirer', items: [
      { k: 'cheddar-parve', n: 'Cheddar parvé', z: 2, w: 71, rise: 3, art: { t: 'fromage' } },
      { k: 'oignons-caramelises', n: 'Oignons caramélisés', z: 3, w: 56, rise: 3, art: { t: 'filaments', cols: ['#8a4b16', '#b06a1f', '#5e300c'], n: 70 } },
      { k: 'cornichons', n: 'Cornichons', z: 4, w: 49, rise: 3, art: { t: 'rondelles', fill: '#9bb23a', edge: '#5f7419', in: '#c9d870' } },
    ] },
    { k: 'frites', label: 'Frites', qty: true, hint: 'Une portion comprise · portion en plus : 3 €', free: 1, items: [
      { k: 'frites', n: 'Frites', sub: 'comprises · en plus 3 €', p: 3, noLayer: true, emoji: '🍟' },
    ] },
    { k: 'boisson', label: 'Boisson', max: 1, min: 1, need: 'Choisis ta boisson', hint: 'Une boisson au choix, comprise dans le menu', items: [
      { k: 'ice-tea', n: 'Ice Tea', noLayer: true, emoji: '🧋' },
      { k: 'coca-zero', n: 'Coca zéro', noLayer: true, emoji: '🥤' },
      { k: 'coca-rouge', n: 'Coca rouge', noLayer: true, emoji: '🥤' },
    ] },
  ],
};
