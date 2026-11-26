/* Le J · « Compose ton J » — carte du comptoir : tout compris 15,90 €.
   Chaque article a une clé (k) : la photo détourée du même nom dans assets/ remplace le dessin. */
window.KOSH_CONFIGS = window.KOSH_CONFIGS || {};
(function () {
  const meat = (fill, edge, more) => Object.assign({ t: 'viande', fill, edge }, more);
  window.KOSH_CONFIGS['le-j'] = {
    id: 'le-j-compose',
    scene: 'pile',
    brand: 'Le J', initial: 'J', tagline: 'Delicatessen français',
    title: 'Compose ton J', lineName: 'Compose ton J',
    price: 15.9, priceLabel: 'Tout compris',
    theme: { c: '#5b2a86', c2: '#7c3fb5', bg: '#f4f0fa' },
    hintText: 'Touche un ingrédient, il tombe dans ton J',
    bottom: { k: 'hallah-bas', art: { t: 'painBas' }, w: 88, rise: 9 },
    top: { k: 'hallah-haut', art: { t: 'painHaut' }, w: 90 },
    preset: ['hallah'],
    steps: [
      { k: 'pain', label: 'Pain', max: 1, min: 1, items: [
        { k: 'hallah', ph: 'hallah-haut', n: 'Pain hallah', noLayer: true, art: { t: 'painHaut' } },
      ] },
      { k: 'sauces', label: 'Sauces', rand: 2, items: [
        { k: 'mayonnaise', n: 'Mayonnaise', rise: 2, art: { t: 'sauce', fill: '#f7eecb' } },
        { k: 'ketchup', n: 'Ketchup', rise: 2, art: { t: 'sauce', fill: '#c9221b' } },
        { k: 'moutarde-miel', n: 'Moutarde au miel', rise: 2, art: { t: 'sauce', fill: '#e2a92b' } },
        { k: 'sauce-burger', n: 'Sauce burger', rise: 2, art: { t: 'sauce', fill: '#f0a36b' } },
        { k: 'harissa', n: 'Harissa', rise: 2, art: { t: 'sauce', fill: '#a82416' } },
      ] },
      { k: 'garnitures', label: 'Garnitures', rand: 2, items: [
        { k: 'salade-israelienne', n: 'Salade israélienne', rise: 5, art: { t: 'des', cols: [['#e23b2e', '#a11d14'], ['#7cc04a', '#4a8a22'], ['#f4f1e4', '#cfc9b2']] } },
        { k: 'oignon', n: 'Oignon', rise: 4, art: { t: 'oignon' } },
        { k: 'oignon-caramelise', n: 'Oignon caramélisé', rise: 4, art: { t: 'filaments', cols: ['#8a4b16', '#b06a1f', '#5e300c'], n: 70 } },
        { k: 'coleslaw', n: 'Coleslaw', rise: 5, art: { t: 'filaments', cols: ['#f6f0dc', '#f0e6c4', '#f08a2b', '#8c4a9c'], n: 90, sw: 2 } },
        { k: 'laitue', n: 'Laitue', rise: 5, art: { t: 'laitue' } },
      ] },
      { k: 'charcuterie', label: 'Charcuterie', min: 1, need: 'Choisis ta charcuterie', rand: 2, items: [
        { k: 'salami-rosette', n: 'Salami rosette', rise: 7, art: meat('#b8323a', '#7a1a22', { dots: '#f3dcd6' }) },
        { k: 'dinde-fumee', n: 'Dinde fumée', rise: 7, art: meat('#e8b9a4', '#b98670') },
        { k: 'duo-volaille', n: 'Duo de volaille', rise: 7, art: meat('#eecdb4', '#c49a7c', { rim: '#d98a6a' }) },
        { k: 'dinde-miel', n: 'Dinde fumée au miel', rise: 7, art: meat('#e9b58c', '#b9772f', { rim: '#c8862c' }) },
        { k: 'dinde-poivre', n: 'Dinde fumée au poivre', rise: 7, art: meat('#e6baa6', '#a9806c', { rim: '#2b2622', dash: '2 3' }) },
        { k: 'poulet-fume', n: 'Poulet fumé', rise: 7, art: meat('#f1d6bd', '#c9a27f') },
        { k: 'pastrami-boeuf', n: 'Pastrami de bœuf fumé', rise: 7, art: meat('#a8404a', '#5e1c24', { rim: '#4a1a14' }) },
        { k: 'pastrami-poivre', n: 'Pastrami au poivre', rise: 7, art: meat('#a23c44', '#5a1a20', { rim: '#1e1a18', dash: '2 2.5' }) },
      ] },
    ],
  };
})();
