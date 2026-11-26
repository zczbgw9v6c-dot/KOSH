(() => {
  // Each sprite shares one front-facing camera. Width and rise are relative to the stage.
  const ingredients = {
    'bun-bottom': { width: 68, rise: 9 },
    lettuce: { width: 74, rise: 5 },
    beef: { width: 71, rise: 10 },
    cheddar: { width: 71, rise: 3 },
    tomato: { width: 59, rise: 4 },
    pickle: { width: 49, rise: 3 },
    onion: { width: 54, rise: 3 },
    'bun-top': { width: 70, rise: 12 },
  };
  const profiles = {
    burger: Object.keys(ingredients),
  };
  const copy = {
    fr: ['Vue assemblée', 'Vue éclatée', 'Aperçu de la composition'],
    pt: ['Vista montada', 'Vista explodida', 'Pré-visualização da composição'],
    en: ['Assembled view', 'Exploded view', 'Meal preview'],
    he: ['תצוגה מורכבת', 'תצוגה מפורקת', 'תצוגה מקדימה של המנה'],
  };

  let current;
  function describe(item, config) {
    const recipe = item?.mealPreview;
    if (!recipe || !Object.hasOwn(profiles, recipe.profile) ||
        !Array.isArray(recipe.layers) || !recipe.layers.length || recipe.layers.length > 12 || !config?.sel) return null;
    const profile = profiles[recipe.profile];
    const groups = og(item);
    const layers = [];

    for (const layer of recipe.layers) {
      if (!layer || !profile.includes(layer.asset)) return null;
      let active = true;
      if (layer.option !== undefined) {
        const option = layer.option;
        if (!option || typeof option.group !== 'string' || typeof option.choice !== 'string') return null;
        const groupIndex = groups.findIndex(group => group.t === option.group);
        const choiceIndex = groups[groupIndex]?.ch.findIndex(choice => choice.n === option.choice) ?? -1;
        if (choiceIndex < 0) return null;
        active = Boolean(config.sel[groupIndex]?.includes(choiceIndex));
      }
      layers.push({ asset: layer.asset, active, key: String(layers.length) });
    }
    return layers.filter(layer => layer.active);
  }

  function placeholder(item, config) {
    return describe(item, config) ? '<div id="meal-preview-slot"></div>' : '';
  }

  function mount() {
    const slot = document.getElementById('meal-preview-slot');
    if (!slot) {
      current = null;
      return;
    }
    const config = S.cf;
    const item = items(config.mid).find(product => product.id === config.id);
    const layers = describe(item, config);
    if (!layers) return;
    const [assembled, exploded, label] = copy[S.lang] || copy.fr;
    const key = JSON.stringify(item.mealPreview);
    const fresh = current?.config !== config || current?.key !== key;

    if (fresh) {
      const root = document.createElement('section');
      root.className = 'meal-preview';
      root.innerHTML = '<div class="meal-stage" aria-hidden="true"></div><button class="meal-toggle" type="button"></button>';
      const stage = root.firstElementChild;
      const button = root.lastElementChild;
      current = { config, key, root, stage, button, exploded: false, nodes: new Map() };
      const preview = current;
      button.addEventListener('click', () => {
        preview.exploded = !preview.exploded;
        update(preview, preview.layers, preview.labels);
      });
    }
    current.layers = layers;
    current.labels = [assembled, exploded];
    current.root.setAttribute('aria-label', label);
    slot.replaceWith(current.root);
    update(current, layers, current.labels, fresh);
  }

  function update(preview, layers, labels, fresh = false) {
    preview.button.textContent = labels[preview.exploded ? 0 : 1];
    const active = new Set(layers.map(layer => layer.key));
    for (const [key, node] of preview.nodes) {
      if (!active.has(key) && !node.classList.contains('meal-leaving')) {
        node.classList.add('meal-leaving');
        setTimeout(() => {
          if (!node.classList.contains('meal-leaving')) return;
          node.remove();
          preview.nodes.delete(key);
        }, 340);
      }
    }

    const gap = preview.exploded ? Math.min(9, 51 / Math.max(1, layers.length - 1)) : 0;
    const rises = layers.map(layer => ingredients[layer.asset].rise);
    const space = Math.min(1, 70 / Math.max(1, rises.reduce((sum, rise) => sum + rise, 0) + gap * (layers.length - 1)));
    const height = (rises.reduce((sum, rise) => sum + rise, 0) + gap * (layers.length - 1)) * space;
    let bottom = Math.max(4, (80 - height) / 2);
    preview.stage.style.setProperty('--meal-floor', bottom + '%');
    layers.forEach((layer, index) => {
      const sprite = ingredients[layer.asset];
      let node = preview.nodes.get(layer.key);
      const previousBottom = node?.style.bottom;
      if (!node) {
        node = document.createElement('img');
        node.className = 'meal-layer';
        node.alt = '';
        node.draggable = false;
        node.src = '/img/meal/' + layer.asset + '.webp';
        preview.nodes.set(layer.key, node);
        preview.stage.append(node);
        if (!fresh && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          node.classList.add('meal-entering');
          setTimeout(() => node.classList.remove('meal-entering'), 320);
        }
      }
      node.classList.remove('meal-leaving');
      node.style.width = sprite.width + '%';
      node.style.bottom = bottom + '%';
      if (previousBottom && previousBottom !== node.style.bottom &&
          !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        node.getAnimations().filter(animation => animation.id === 'meal-position')
          .forEach(animation => animation.cancel());
        const animation = node.animate(
          [{ bottom: previousBottom }, { bottom: node.style.bottom }],
          { duration: 320, easing: 'cubic-bezier(.22,.74,.24,1)' }
        );
        animation.id = 'meal-position';
      }
      node.style.zIndex = index + 1;
      bottom += (sprite.rise + gap) * space;
    });
  }

  window.KoshMealPreview = { placeholder, mount };

  // The client portal replaces render() with its own shell, so the hook in the base render is not always
  // reached. Watching the app root mounts the scene whichever render produced the placeholder.
  const app = typeof document !== 'undefined' && document.getElementById?.('app');
  if (app && typeof MutationObserver === 'function') {
    new MutationObserver(() => { if (document.getElementById('meal-preview-slot')) mount(); })
      .observe(app, { childList: true, subtree: true });
  }
})();
