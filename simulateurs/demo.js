/* Démo : chaque composition validée arrive dans la liste. Dans Kosh, onAdd ajoutera la ligne au panier. */
function demo(key) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return KoshSimulateur.mount(document.getElementById('simulateur'), KOSH_CONFIGS[key], {
    onAdd(line) {
      document.getElementById('vide').hidden = true;
      const li = document.createElement('li');
      li.innerHTML = `<span>${esc(line.name)}<small>${line.options.map(esc).join(' · ')}</small></span><b>${KoshSimulateur.fmt(line.price)}</b>`;
      document.getElementById('lignes').appendChild(li);
    },
  });
}
