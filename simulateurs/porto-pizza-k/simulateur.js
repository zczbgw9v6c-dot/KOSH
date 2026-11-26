/* Porto Pizza K · simulateur « Compose ta pizza » (module autonome, sans dépendance).

   Parcours : base sauce tomate + mozzarella déjà posées (ou base chocolat), taille M ou XL, ingrédients qui
   s'envolent jusqu'à la pizza, puis passage au four (la pâte dore, les braises montent, le bouton vert se remplit).
   À la sortie du four, le module renvoie la ligne de commande via onAdd().

   Utilisation :
     PortoPizzaSimulator.mount(document.getElementById('ici'), {
       onAdd(line) {},        // { id, name, base, size, options:[…], price }
       onViewCart() {},       // facultatif : bouton « Voir mon panier » après l'ajout
       closed: false,         // facultatif (booléen ou fonction) : « Commandes fermées »
       menu: MENU,            // facultatif : carte à jour (prix modifiés par le restaurant)
       assets: { … },         // facultatif : photos réelles (sinon window.PORTO_PIZZA_ASSETS, cf. assets/manifest.js)
     });

   Photos réelles : si assets/manifest.js déclare des photos (pizza crue / cuite, morceaux détourés par ingrédient),
   elles remplacent automatiquement le rendu dessiné. Voir ASSETS.md et outils/decouper.py.

   Prix : toujours ceux de la carte. La pizza de la carte qui porte la garniture principale sert de base
   (mozza + thon = Mozza thon 16 €), chaque autre ingrédient est un supplément à 2 €, la XL coûte 3 € de plus. */
(function () {
  const MENU = {
    pizzas: [
      { id: 'pzk-01', n: 'Mozzarella', p: 13, top: 'mozza' },
      { id: 'pzk-02', n: 'Mozza olives vertes', p: 15, top: 'olives' },
      { id: 'pzk-03', n: 'Mozza thon', p: 16, top: 'thon' },
      { id: 'pzk-04', n: 'Mozza saumon', p: 17, top: 'saumon' },
      { id: 'pzk-05', n: 'Mozza champignons', p: 15, top: 'champi' },
      { id: 'pzk-06', n: 'Pizza chocolat (Nutella vegan)', p: 9, top: 'choco' },
    ],
    sizes: { M: 0, XL: 3 },
    supplement: 2,
  };
  // Ingrédients ajoutables sur la base tomate + mozzarella (noms identiques à la carte).
  const TOPS = [
    { k: 'olives', n: 'Olives vertes', count: 13, size: 7, z: 3 },
    { k: 'champi', n: 'Champignons', count: 9, size: 11.5, z: 3 },
    { k: 'thon', n: 'Thon', count: 11, size: 10, z: 2 },
    { k: 'saumon', n: 'Saumon', count: 7, size: 16, z: 2 },
    { k: 'oignons', n: 'Oignons rouges', count: 9, size: 11.5, z: 4 },
    { k: 'piments', n: 'Piments', count: 12, size: 6.6, z: 5 },
  ];
  const BASES = [['tomate', 'Tomate · mozza'], ['choco', 'Chocolat']];
  const SIZES = [['M', .84], ['XL', 1]];
  const BAKE_MS = 3600;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let menu = MENU, opts = {}, assets = {};

  /* ---------- Prix ---------- */
  function quote(sel, size, base) {
    base = base || 'tomate';
    if (!(size in menu.sizes)) return null;
    const live = menu.pizzas.filter(pz => !pz.off);
    let pz, extras = [];
    if (base === 'choco') pz = live.find(p => p.top === 'choco');
    else {
      pz = live.filter(p => p.top !== 'mozza' && p.top !== 'choco' && sel.includes(p.top)).sort((a, b) => b.p - a.p)[0] || live.find(p => p.top === 'mozza');
      if (pz) extras = TOPS.filter(t => t.k !== pz.top && sel.includes(t.k)).map(t => t.n);
    }
    if (!pz) return null;
    const price = Math.round((+pz.p + +menu.sizes[size] + extras.length * menu.supplement) * 100) / 100;
    return { id: pz.id, name: pz.n, base, size, extras, price };
  }

  /* ---------- Rendu dessiné (utilisé tant que les photos ne sont pas fournies) ---------- */
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const f = n => Math.round(n * 100) / 100;
  function blob(r, cx, cy, rad, pts, jitter) {
    const p = [];
    for (let i = 0; i < pts; i++) { const a = i / pts * Math.PI * 2, rr = rad * (1 - jitter / 2 + r() * jitter); p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    let d = '';
    for (let i = 0; i < pts; i++) {
      const p0 = p[(i - 1 + pts) % pts], p1 = p[i], p2 = p[(i + 1) % pts], p3 = p[(i + 2) % pts];
      if (!i) d += `M${f(p1[0])} ${f(p1[1])}`;
      d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d + 'Z';
  }
  const ART = {
    olives() { return '<path fill-rule="evenodd" d="M20 4a16 16 0 1 0 .01 0ZM20 13a7 7 0 1 1-.01 0Z" fill="#7d9a2c" stroke="#4d6316" stroke-width="2"/><path d="M10 13a12 12 0 0 1 9-6" stroke="#c7dc78" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>'; },
    champi(r) {
      const g = r() < .5 ? '#ecdcc0' : '#e4d1b1';
      return `<path d="M5 22C5 11 12 5 20 5s15 6 15 17c0 2-2 3-4 3h-5v8c0 2-2 3-6 3s-6-1-6-3v-8H9c-2 0-4-1-4-3Z" fill="${g}" stroke="#8b6a45" stroke-width="2"/><path d="M9 21c3-3 6-4 11-4s8 1 11 4" stroke="#b79470" stroke-width="1.3" fill="none"/><path d="M17 26v8M23 26v8" stroke="#c9ad88" stroke-width="1.1"/>`;
    },
    thon(r) {
      const c = r() < .5 ? '#c9a090' : '#b98a78';
      return `<path d="${blob(r, 20, 20, 14, 7, .7)}" fill="${c}" stroke="#8f6656" stroke-width="1.2"/><path d="M12 17c4 2 9 2 15-1M13 24c4 1 8 1 12-1" stroke="#e8cdc0" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    },
    saumon() {
      return '<path d="M4 15C9 6 28 3 36 11c3 4 0 11-6 15-9 6-22 7-25 0-1-3-2-7-1-11Z" fill="#f2814f" stroke="#c8532d" stroke-width="1.2"/><path d="M9 13c6-4 16-5 23-1M7 20c8-4 19-5 26-1M9 27c7-3 14-3 19-1" stroke="#ffe0cc" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".9"/>';
    },
    oignons(r) {
      const a = r() * 60;
      return `<g transform="rotate(${f(a)} 20 20)"><path d="M6 24a14 14 0 0 1 28 0" stroke="#8a2f6e" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M6 24a14 14 0 0 1 28 0" stroke="#e7c4dc" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M12 24a8 8 0 0 1 16 0" stroke="#a9468c" stroke-width="3" fill="none" stroke-linecap="round"/></g>`;
    },
    piments(r) {
      r(); const green = r() < .2, c = green ? '#3f9a2f' : '#d9261c', d = green ? '#286b1c' : '#99160f';
      return `<circle cx="20" cy="20" r="13" fill="${c}" stroke="${d}" stroke-width="2"/><circle cx="20" cy="20" r="7.5" fill="#f6d9a2"/><circle cx="17.5" cy="18.5" r="1.6" fill="#f3e2b6"/><circle cx="22.5" cy="19" r="1.6" fill="#f3e2b6"/><circle cx="20" cy="23" r="1.6" fill="#f3e2b6"/>`;
    },
  };
  function spiral(turns, r0, r1) {
    let d = '';
    for (let i = 0; i <= 420; i++) { const t = i / 420, a = t * Math.PI * 2 * turns, r = r0 + t * (r1 - r0); d += (i ? 'L' : 'M') + f(100 + Math.cos(a) * r) + ' ' + f(100 + Math.sin(a) * r); }
    return d;
  }
  function pieSvg() {
    const r = rng(77);
    let speck = '', mozza = '', gold = '', char = '';
    for (let i = 0; i < 150; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 76, light = r() < .45;
      speck += `<circle cx="${f(100 + Math.cos(a) * d)}" cy="${f(100 + Math.sin(a) * d)}" r="${f(.6 + r() * 1.6)}" fill="${light ? '#ff7b4f' : '#9e1d0c'}" opacity="${f(.25 + r() * .4)}"/>`;
    }
    const spots = [];
    for (let g = 0; spots.length < 17 && g < 400; g++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 62, x = 100 + Math.cos(a) * d, y = 100 + Math.sin(a) * d;
      if (spots.every(p => Math.hypot(p[0] - x, p[1] - y) > 22)) spots.push([x, y]);
    }
    spots.forEach(([x, y]) => {
      const rad = 9 + r() * 5;
      mozza += `<path d="${blob(r, x, y, rad, 9, .45)}" fill="#fffaf0"/><path d="${blob(r, x - 1.5, y - 1.5, rad * .6, 7, .4)}" fill="#fff" opacity=".9"/>`;
      gold += `<ellipse cx="${f(x + (r() - .5) * rad)}" cy="${f(y + (r() - .5) * rad)}" rx="${f(1.6 + r() * 2)}" ry="${f(1.2 + r() * 1.4)}" fill="#c98b3c" opacity=".7"/>`;
    });
    for (let i = 0; i < 30; i++) {
      const a = r() * Math.PI * 2, d = 84 + r() * 10, x = 100 + Math.cos(a) * d, y = 100 + Math.sin(a) * d;
      char += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(1.5 + r() * 3.5)}" ry="${f(1 + r() * 2)}" transform="rotate(${f(a * 57.3)} ${f(x)} ${f(y)})" fill="#3d200c" opacity="${f(.45 + r() * .4)}"/>`;
    }
    return `<svg class="pzk-draw" viewBox="0 0 200 200" aria-hidden="true"><defs>
<radialGradient id="pzkDough" cx="46%" cy="42%" r="58%"><stop offset="0" stop-color="#fdf0d4"/><stop offset=".78" stop-color="#f3dcaa"/><stop offset="1" stop-color="#e2b979"/></radialGradient>
<radialGradient id="pzkCrust" cx="50%" cy="50%" r="50%"><stop offset=".8" stop-color="#b8692a" stop-opacity="0"/><stop offset=".9" stop-color="#c47a35" stop-opacity=".6"/><stop offset="1" stop-color="#8f4a17" stop-opacity=".85"/></radialGradient>
<radialGradient id="pzkSauce" cx="44%" cy="40%" r="64%"><stop offset="0" stop-color="#f45a2e"/><stop offset=".65" stop-color="#df3d1c"/><stop offset="1" stop-color="#bb2812"/></radialGradient>
<radialGradient id="pzkChoc" cx="42%" cy="38%" r="66%"><stop offset="0" stop-color="#6b3a1f"/><stop offset=".7" stop-color="#4a2512"/><stop offset="1" stop-color="#341909"/></radialGradient>
<filter id="pzkRough" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="5"/><feDisplacementMap in="SourceGraphic" scale="6"/></filter>
<filter id="pzkSoft"><feGaussianBlur stdDeviation="1.2"/></filter>
<clipPath id="pzkClip"><circle cx="100" cy="100" r="80"/></clipPath></defs>
<circle cx="100" cy="100" r="96" fill="url(#pzkDough)" filter="url(#pzkRough)"/>
<circle cx="100" cy="100" r="90" fill="none" stroke="#fff6df" stroke-width="2.5" opacity=".7" filter="url(#pzkSoft)"/>
<g class="pzk-bake"><circle cx="100" cy="100" r="97" fill="url(#pzkCrust)" filter="url(#pzkRough)"/>${char}</g>
<g class="pzk-tomate"><g filter="url(#pzkRough)"><circle cx="100" cy="100" r="81" fill="url(#pzkSauce)"/></g>
<g clip-path="url(#pzkClip)"><path d="${spiral(5.2, 3, 75)}" fill="none" stroke="#a51f0d" stroke-width="5" opacity=".28" filter="url(#pzkRough)"/>${speck}</g>
<g filter="url(#pzkRough)">${mozza}</g><g class="pzk-bake">${gold}</g></g>
<g class="pzk-choco pzk-bake"><g filter="url(#pzkRough)"><circle cx="100" cy="100" r="80" fill="url(#pzkChoc)"/></g>
<path d="${spiral(4.2, 4, 70)}" fill="none" stroke="#8a5432" stroke-width="3" opacity=".55" filter="url(#pzkRough)"/>
<ellipse cx="76" cy="66" rx="26" ry="9" fill="#fff" opacity=".12" transform="rotate(-35 76 66)"/></g></svg>`;
  }

  /* ---------- Photos réelles (facultatives) ---------- */
  const photo = (base, step) => assets[base] && assets[base][step];
  const sprites = k => (assets.pieces && assets.pieces[k]) || [];
  function pieceHtml(k, i, rot) {
    const list = sprites(k);
    if (list.length) return `<img src="${list[i % list.length]}" alt="" draggable="false" style="transform:rotate(${f(rot)}deg)">`;
    return `<svg viewBox="0 0 40 40" aria-hidden="true"><g transform="rotate(${f(rot)} 20 20)">${ART[k](rng(i * 13 + k.length))}</g></svg>`;
  }

  /* ---------- Styles (charte de la carte Porto Pizza K : vert, rouge, crème) ---------- */
  const CSS = `
.pzk{--g:#1c7a33;--g2:#155f27;--r:#e0281c;--r2:#b81d13;--cream:#faf6ef;--paper:#f3ece0;--ink:#1d1b18;--mute:#6f675c;
  position:relative;padding:22px 18px 18px;border-radius:28px;color:var(--ink);background:var(--cream);overflow:hidden;isolation:isolate;
  box-shadow:0 30px 60px -28px rgba(60,40,20,.45),0 0 0 1px rgba(60,40,20,.06);font-family:Montserrat,system-ui,sans-serif;-webkit-tap-highlight-color:transparent}
.pzk *{box-sizing:border-box}
.pzk-brand{text-align:center}
.pzk-brand small{display:block;font:500 13px/1.25 Oswald,"Arial Narrow",sans-serif;letter-spacing:.02em;color:var(--ink)}
.pzk-brand b{display:block;margin-top:8px;font:800 clamp(25px,7.6vw,32px)/1 Montserrat,sans-serif;letter-spacing:.16em;color:var(--g);padding-left:.16em}
.pzk-flag{display:grid;gap:5px;margin:14px 0 16px}.pzk-flag i{display:block;height:6px;border-radius:1px;background:var(--g)}.pzk-flag i+i{background:var(--r)}
.pzk-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.pzk-tag{display:inline-block;padding:7px 12px;background:var(--g);color:#fff;font:700 15px/1 Montserrat,sans-serif;letter-spacing:.03em}
.pzk-seg{position:relative;display:flex;padding:3px;border-radius:999px;background:var(--paper);box-shadow:inset 0 1px 2px rgba(60,40,20,.12)}
.pzk-seg button{position:relative;z-index:1;height:32px;padding:0 14px;border:0;border-radius:999px;background:none;font:700 12px Montserrat,sans-serif;color:var(--mute);cursor:pointer;transition:color .3s}
.pzk-seg button[aria-pressed=true]{color:#fff}
.pzk-seg .pzk-knob{position:absolute;top:3px;bottom:3px;left:0;width:0;border-radius:999px;background:var(--g);box-shadow:0 4px 10px -2px rgba(28,122,51,.55);transition:transform .45s cubic-bezier(.3,1.4,.5,1),width .45s cubic-bezier(.3,1.4,.5,1)}
.pzk-seg button:disabled{cursor:default}
.pzk-ctl{display:flex;justify-content:space-between;gap:8px;margin-top:12px}
.pzk-stage{position:relative;width:calc(100% + 36px);margin:14px -18px 0;aspect-ratio:1/.92;overflow:hidden;
  background:radial-gradient(90% 80% at 30% 20%,#fffaf2 0%,#f4ecdf 55%,#e9dfcf 100%)}
.pzk-stage:before{content:"";position:absolute;inset:-20%;z-index:0;pointer-events:none;opacity:.55;
  background:repeating-linear-gradient(118deg,rgba(120,90,50,0) 0 70px,rgba(120,90,50,.10) 70px 130px);filter:blur(14px)}
.pzk-oven{position:absolute;inset:0;z-index:2;opacity:0;pointer-events:none;transition:opacity .7s ease;
  background:radial-gradient(70% 60% at 50% 46%,rgba(60,22,8,.0) 30%,rgba(40,14,4,.85) 70%,#140603 100%),radial-gradient(120% 70% at 50% 110%,#ff8a2a 0%,#c8400f 30%,#3b1206 65%,#1a0703 100%)}
.pzk-glow{position:absolute;left:50%;top:50%;width:120%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;opacity:0;z-index:4;pointer-events:none;
  background:radial-gradient(circle,rgba(255,196,110,.55) 0 28%,rgba(255,120,30,.35) 46%,rgba(220,60,10,0) 66%);mix-blend-mode:screen;filter:blur(8px);transition:opacity .6s}
.pzk.baking .pzk-oven{opacity:1}.pzk.baking .pzk-glow{opacity:1;animation:pzkFlicker .16s infinite alternate}
@keyframes pzkFlicker{from{transform:translate(-50%,-50%) scale(1)}to{transform:translate(-50%,-50%) scale(1.035) rotate(2deg);opacity:.85}}
.pzk-flame{position:absolute;bottom:-14%;width:22%;aspect-ratio:1/1.6;border-radius:50% 50% 45% 45%/60% 60% 40% 40%;z-index:5;opacity:0;pointer-events:none;mix-blend-mode:screen;filter:blur(6px);
  background:radial-gradient(60% 70% at 50% 75%,#fff2b0 0%,#ffb340 30%,#ff5a14 60%,rgba(200,40,0,0) 75%)}
.pzk.baking .pzk-flame{opacity:.95;animation:pzkLick .5s ease-in-out infinite alternate}
@keyframes pzkLick{from{transform:translateY(6%) scaleY(.9) skewX(-4deg)}to{transform:translateY(-8%) scaleY(1.15) skewX(5deg)}}
.pzk-ember{position:absolute;bottom:8%;width:4px;height:4px;border-radius:50%;background:#ffe2a0;box-shadow:0 0 6px 1px #ff9a3c;opacity:0;z-index:6;pointer-events:none}
.pzk.baking .pzk-ember{animation:pzkRise 1.4s ease-in infinite}
@keyframes pzkRise{0%{opacity:0;transform:translate(0,0) scale(1)}12%{opacity:1}100%{opacity:0;transform:translate(var(--dx,12px),-260px) scale(.25)}}
.pzk-pie{position:absolute;left:50%;top:50%;width:min(80vw,350px,86%);aspect-ratio:1;z-index:3;transform:translate(-50%,-50%) scale(var(--s,.84));transition:transform .6s cubic-bezier(.3,1.45,.5,1)}
.pzk.baking .pzk-pie{animation:pzkHeat .8s ease-in-out infinite alternate}
@keyframes pzkHeat{to{filter:brightness(1.07) saturate(1.12)}}
.pzk-shadow{position:absolute;inset:3% -1% -5% 5%;border-radius:50%;background:rgba(70,45,20,.38);filter:blur(16px);z-index:-1}
.pzk-draw,.pzk-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;user-select:none}
.pzk-photo.baked{opacity:0;transition:opacity 1.6s ease}
.pzk.baked .pzk-photo.baked{opacity:1}
.pzk-pie.photo .pzk-draw{display:none}
.pzk-bake{opacity:0;transition:opacity 1.6s ease}.pzk.baked .pzk-bake{opacity:1}
.pzk-pie.choco .pzk-tomate,.pzk-pie:not(.choco) .pzk-choco{display:none}
.pzk-tops{position:absolute;inset:0}
.pzk-pc{position:absolute;pointer-events:none;will-change:transform;transition:filter 1.6s}
.pzk-pc svg,.pzk-pc img{display:block;width:100%;height:100%;overflow:visible;object-fit:contain;filter:drop-shadow(0 1.5px 1.2px rgba(60,15,0,.35))}
.pzk.baked .pzk-pc{filter:saturate(1.08) brightness(.95) sepia(.08)}
.pzk-hint{min-height:20px;margin:14px 0 12px;text-align:center;font:500 12.5px/1.4 Montserrat,sans-serif;color:var(--mute)}
.pzk-hint b{color:var(--ink);font-weight:700}
.pzk-hint button{border:0;background:none;padding:0 0 0 8px;font:700 12.5px Montserrat,sans-serif;color:var(--r);cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.pzk-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px 6px;transition:opacity .4s}
.pzk.is-choco .pzk-grid{opacity:.35}
.pzk-ing{position:relative;display:flex;flex-direction:column;align-items:center;gap:7px;padding:0;border:0;background:none;color:var(--ink);cursor:pointer;font:700 10.5px/1.15 Montserrat,sans-serif;letter-spacing:.04em;text-transform:uppercase;text-align:center}
.pzk-ing:disabled{cursor:default}
.pzk-dot{position:relative;width:70px;height:70px;border-radius:50%;display:grid;place-items:center;background:#fff;
  box-shadow:0 10px 20px -10px rgba(60,40,20,.5),inset 0 0 0 1px rgba(60,40,20,.07);transition:transform .25s cubic-bezier(.3,1.6,.5,1),box-shadow .25s}
.pzk-ico{position:relative;width:52px;height:52px}
.pzk-ico>*{position:absolute;width:60%;height:60%}
.pzk-ico>*:nth-child(1){left:0;top:4%}.pzk-ico>*:nth-child(2){right:0;top:14%}.pzk-ico>*:nth-child(3){left:22%;bottom:0}
.pzk-ico svg,.pzk-ico img{object-fit:contain;filter:drop-shadow(0 1px 1px rgba(0,0,0,.25))}
.pzk-ing:active .pzk-dot{transform:scale(.9)}
.pzk-ing[aria-pressed=true] .pzk-dot{box-shadow:0 0 0 3px var(--g),0 12px 22px -8px rgba(28,122,51,.55)}
.pzk-ok,.pzk-minus{position:absolute;top:-3px;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font:800 12px/1 Montserrat,sans-serif;color:#fff;transform:scale(0);transition:transform .3s cubic-bezier(.3,1.7,.5,1)}
.pzk-ok{right:-3px;background:var(--g)}.pzk-minus{left:-3px;background:var(--r);font-size:15px}
.pzk-ing[aria-pressed=true] .pzk-ok,.pzk-ing[aria-pressed=true] .pzk-minus{transform:scale(1)}
.pzk.locked .pzk-minus{transform:scale(0)!important}
.pzk.locked .pzk-ing:not([aria-pressed=true]){opacity:.4}
.pzk-price-tag{font:600 10px Montserrat,sans-serif;color:var(--mute);letter-spacing:0;text-transform:none}
.pzk-go{position:relative;display:flex;align-items:center;justify-content:space-between;width:100%;height:58px;margin-top:20px;padding:0 22px;border:0;border-radius:14px;overflow:hidden;
  font:800 14px Montserrat,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#fff;background:var(--r);cursor:pointer;
  box-shadow:0 14px 26px -12px rgba(224,40,28,.8),inset 0 -3px 0 var(--r2);transition:background .4s,box-shadow .4s,transform .15s}
.pzk-go:active{transform:translateY(1px)}
.pzk-go:disabled{cursor:default;background:#cfc6b8;box-shadow:inset 0 -3px 0 #b9af9f}
.pzk-go.oven,.pzk-go.done{background:var(--g2);box-shadow:0 14px 26px -12px rgba(28,122,51,.8),inset 0 -3px 0 #0f4a1e}
.pzk-go .pzk-bar{position:absolute;inset:0;width:0;background:var(--g);pointer-events:none}
.pzk-go.oven .pzk-bar{animation:pzkBar ${BAKE_MS}ms linear forwards}
.pzk-go.done .pzk-bar{width:100%}
@keyframes pzkBar{to{width:100%}}
.pzk-go span{position:relative}
.pzk-price{font-variant-numeric:tabular-nums;letter-spacing:0}
.pzk-foot{margin-top:18px}
@media (prefers-reduced-motion:reduce){.pzk *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
`;

  /* ---------- Composant ---------- */
  const st = { base: 'tomate', sel: [], size: 'M', phase: 'build', shown: 0, line: null };
  let el = null, pie = null, tops = null, timers = [];
  const pieces = {};
  const money = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(+n || 0);
  const blocked = () => !!(typeof opts.closed === 'function' ? opts.closed() : opts.closed);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function style() {
    if (document.getElementById('pzk-css')) return;
    const s = document.createElement('style'); s.id = 'pzk-css'; s.textContent = CSS; (document.head || document.body).appendChild(s);
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&family=Oswald:wght@500&display=swap';
    (document.head || document.body).appendChild(l);
  }
  function chipIcon(k, i) {
    const list = sprites(k);
    if (list.length) return [0, 1, 2].map(j => `<img src="${list[(i + j) % list.length]}" alt="" draggable="false">`).join('');
    return [1, 2, 3].map(j => `<svg viewBox="0 0 40 40" aria-hidden="true">${ART[k](rng(i * 7 + j))}</svg>`).join('');
  }
  function seg(name, list, current) {
    return `<div class="pzk-seg" role="group" aria-label="${name}">${list.map(([v, label]) => `<button type="button" data-${name}="${v}" aria-pressed="${v === current}">${label}</button>`).join('')}<span class="pzk-knob"></span></div>`;
  }
  function build() {
    style();
    el = document.createElement('section');
    el.className = 'pzk'; el.setAttribute('aria-label', 'Compose ta pizza · Porto Pizza K');
    el.innerHTML = `<header class="pzk-brand"><small>À emporter · 33 Rua Nicolau Marques Guedes</small><b>PORTO PIZZA K</b></header>
<div class="pzk-flag" aria-hidden="true"><i></i><i></i></div>
<span class="pzk-tag">COMPOSE TA PIZZA</span>
<div class="pzk-ctl">${seg('base', BASES, st.base)}${seg('size', SIZES.map(s => [s[0], s[0]]), st.size)}</div>
<div class="pzk-stage"><div class="pzk-oven"></div>
${[0, 1, 2, 3, 4].map(i => `<span class="pzk-flame" style="left:${-4 + i * 22}%;animation-delay:${i * .11}s"></span>`).join('')}
<div class="pzk-pie"><div class="pzk-shadow"></div>${pieSvg()}<img class="pzk-photo raw" alt="" hidden><img class="pzk-photo baked" alt="" hidden><div class="pzk-tops"></div></div>
<div class="pzk-glow"></div>
${[...Array(18)].map((_, i) => `<span class="pzk-ember" style="left:${8 + (i * 41) % 84}%;--dx:${((i * 29) % 50) - 25}px;animation-delay:${(i * .19) % 1.4}s"></span>`).join('')}</div>
<p class="pzk-hint" aria-live="polite"></p>
<div class="pzk-grid">${TOPS.map((t, i) => `<button type="button" class="pzk-ing" data-k="${t.k}" aria-pressed="false"><span class="pzk-dot"><span class="pzk-ico">${chipIcon(t.k, i)}</span><span class="pzk-minus" aria-hidden="true">−</span><span class="pzk-ok" aria-hidden="true">✓</span></span>${t.n}<span class="pzk-price-tag">+${money(menu.supplement)}</span></button>`).join('')}</div>
<button type="button" class="pzk-go"><span class="pzk-bar"></span><span class="pzk-lbl"></span><span class="pzk-price"></span></button>
<div class="pzk-flag pzk-foot" aria-hidden="true"><i></i><i></i></div>`;
    pie = el.querySelector('.pzk-pie'); tops = el.querySelector('.pzk-tops');
    el.addEventListener('click', onClick);
    setBase(st.base);
  }
  function setBase(base) {
    st.base = base;
    const raw = photo(base, 'raw'), baked = photo(base, 'baked'), r = pie.querySelector('.pzk-photo.raw'), b = pie.querySelector('.pzk-photo.baked');
    pie.classList.toggle('choco', base === 'choco');
    pie.classList.toggle('photo', !!(raw && baked));
    [[r, raw], [b, baked]].forEach(([img, src]) => { if (src && raw && baked) { img.src = src; img.hidden = false; } else img.hidden = true; });
  }
  function moveKnobs() {
    el.querySelectorAll('.pzk-seg').forEach(g => {
      const on = g.querySelector('[aria-pressed=true]'), k = g.querySelector('.pzk-knob');
      if (on && on.offsetWidth) { k.style.width = on.offsetWidth + 'px'; k.style.transform = `translateX(${on.offsetLeft}px)`; }
    });
  }

  function place(top) {
    const r = rng(top.k.length * 977 + top.count * 31), out = [], R = 37 - top.size * .3;
    for (let guard = 0; out.length < top.count && guard < 900; guard++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R, x = 50 + Math.cos(a) * d, y = 50 + Math.sin(a) * d;
      const gap = top.size * (guard < 500 ? .8 : .45);
      if (out.every(p => Math.hypot(p.x - x, p.y - y) > gap)) out.push({ x, y, rot: r() * 360, sc: .85 + r() * .3 });
    }
    return out;
  }
  function addPieces(top, animate) {
    const chip = el.querySelector(`[data-k="${top.k}"] .pzk-dot`);
    const pr = pie.getBoundingClientRect(), cr = chip ? chip.getBoundingClientRect() : null;
    const scale = pr.width && pie.offsetWidth ? pr.width / pie.offsetWidth : 1;
    pieces[top.k] = place(top).map((p, i) => {
      const d = document.createElement('div');
      d.className = 'pzk-pc';
      const w = top.size * p.sc;
      d.style.cssText = `left:${f(p.x - w / 2)}%;top:${f(p.y - w / 2)}%;width:${f(w)}%;height:${f(w)}%;z-index:${top.z}`;
      d.innerHTML = pieceHtml(top.k, i, p.rot);
      tops.appendChild(d);
      if (animate && !reduce && cr && pr.width && d.animate) {
        const px = pr.left + pr.width * p.x / 100, py = pr.top + pr.height * p.y / 100;
        const dx = (cr.left + cr.width / 2 - px) / scale, dy = (cr.top + cr.height / 2 - py) / scale;
        d.animate([
          { transform: `translate(${f(dx)}px,${f(dy)}px) scale(.35)`, opacity: 0 },
          { transform: `translate(${f(dx * .45)}px,${f(dy * .45 - 80)}px) scale(1.5)`, opacity: 1, offset: .5 },
          { transform: 'translate(0,0) scale(.9)', offset: .86 },
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
        ], { duration: 640 + i * 14, delay: i * 38, easing: 'cubic-bezier(.25,.7,.35,1)', fill: 'backwards' });
      }
      return d;
    });
  }
  function dropPieces(k, animate) {
    (pieces[k] || []).forEach((d, i) => {
      if (animate && !reduce && d.animate) d.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'translateY(-14px) scale(0)', opacity: 0 }], { duration: 260, delay: i * 12, easing: 'ease-in', fill: 'forwards' }).onfinish = () => d.remove();
      else d.remove();
    });
    delete pieces[k];
  }
  function countTo(node, value) {
    const from = st.shown || value; st.shown = value;
    if (reduce || from === value || typeof requestAnimationFrame !== 'function') { node.textContent = money(value); return; }
    const t0 = performance.now();
    const step = now => { const k = Math.min(1, (now - t0) / 380), v = from + (value - from) * (1 - Math.pow(1 - k, 3)); node.textContent = money(Math.round(v * 100) / 100); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  function sync(animatePrice = true) {
    if (!el) return;
    const choco = st.base === 'choco', q = quote(st.sel, st.size, st.base), building = st.phase === 'build';
    el.classList.toggle('locked', !building);
    el.classList.toggle('is-choco', choco);
    el.querySelectorAll('[data-size]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.size === st.size)); b.disabled = !building; });
    el.querySelectorAll('[data-base]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.base === st.base)); b.disabled = !building; });
    el.querySelectorAll('.pzk-ing').forEach(b => { const on = st.sel.includes(b.dataset.k); b.setAttribute('aria-pressed', String(on)); b.disabled = !building || choco; });
    pie.style.setProperty('--s', SIZES.find(s => s[0] === st.size)[1]);
    moveKnobs();
    const hint = el.querySelector('.pzk-hint'), go = el.querySelector('.pzk-go'), lbl = go.querySelector('.pzk-lbl'), price = go.querySelector('.pzk-price');
    go.classList.remove('oven', 'done');
    if (st.phase === 'oven') {
      hint.innerHTML = '<b>Au four à 450 °C</b> · la croûte gonfle et dore…';
      go.classList.add('oven'); go.disabled = true; lbl.textContent = 'Cuisson en cours';
      return;
    }
    if (st.phase === 'done') {
      hint.innerHTML = `<b>Sortie du four ✓</b> · ${esc(st.line.name)} ajoutée<button type="button" data-redo>Recomposer</button>`;
      go.classList.add('done'); go.disabled = false; lbl.textContent = opts.onViewCart ? 'Voir mon panier' : 'Ajoutée ✓';
      price.textContent = money(st.line.price);
      return;
    }
    if (blocked()) { hint.textContent = 'Les commandes sont fermées pour le moment.'; go.disabled = true; lbl.textContent = 'Commandes fermées'; price.textContent = ''; return; }
    if (choco) hint.innerHTML = '<b>Pizza chocolat</b> · Nutella vegan, étalée à la sortie du four';
    else if (!st.sel.length) hint.innerHTML = 'Sauce tomate et mozzarella sont déjà là · <b>touche un ingrédient</b> pour l’ajouter';
    else hint.innerHTML = `${q ? `<b>${esc(q.name)}</b>` : ''}${q && q.extras.length ? ' + ' + q.extras.length + ' suppl.' : ''} · touche encore pour en ajouter`;
    go.disabled = !q; lbl.textContent = q ? 'Ajouter · au four' : 'Indisponible';
    if (q) { if (animatePrice) countTo(price, q.price); else { st.shown = q.price; price.textContent = money(q.price); } }
  }

  function toggle(k) {
    if (st.sel.includes(k)) { st.sel = st.sel.filter(x => x !== k); dropPieces(k, true); }
    else { st.sel = [...st.sel, k]; addPieces(TOPS.find(t => t.k === k), true); }
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
    sync();
  }
  function later(fn, ms) { timers.push(setTimeout(fn, reduce ? Math.min(ms, 300) : ms)); }
  function bake() {
    const q = quote(st.sel, st.size, st.base);
    if (!q || blocked()) return;
    st.phase = 'oven'; st.line = q; el.classList.add('baking'); sync(false);
    later(() => el.classList.add('baked'), BAKE_MS * .35);
    later(() => {
      el.classList.remove('baking');
      const line = { id: q.id, name: q.name, base: q.base, size: q.size, options: ['Taille : ' + q.size].concat(q.extras), price: q.price };
      if (typeof opts.onAdd === 'function') opts.onAdd(line);
      el.dispatchEvent(new CustomEvent('pzk:add', { detail: line, bubbles: true }));
      st.phase = 'done'; sync(false);
    }, BAKE_MS);
  }
  function reset() {
    timers.forEach(clearTimeout); timers = [];
    Object.keys(pieces).forEach(k => dropPieces(k, true));
    st.sel = []; st.phase = 'build'; st.line = null; el.classList.remove('baking', 'baked'); sync();
  }
  function onClick(e) {
    const t = e.target.closest('button');
    if (!t || !el.contains(t)) return;
    if (t.dataset.size && st.phase === 'build') { st.size = t.dataset.size; sync(); return; }
    if (t.dataset.base && st.phase === 'build') {
      if (t.dataset.base === 'choco') Object.keys(pieces).forEach(k => dropPieces(k, true)), st.sel = [];
      setBase(t.dataset.base); sync(); return;
    }
    if (t.dataset.k && st.phase === 'build') { toggle(t.dataset.k); return; }
    if (t.hasAttribute('data-redo')) { reset(); return; }
    if (t.classList.contains('pzk-go')) { if (st.phase === 'build') bake(); else if (st.phase === 'done') { if (opts.onViewCart) opts.onViewCart(); else reset(); } }
  }

  /* ---------- API publique ---------- */
  window.PortoPizzaSimulator = {
    mount(target, options) {
      opts = options || {}; menu = opts.menu || MENU; assets = opts.assets || window.PORTO_PIZZA_ASSETS || {};
      if (!el) build();
      target.appendChild(el); setBase(st.base); sync(false);
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(moveKnobs);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveKnobs);
      return { reset, refresh: () => sync(false), get state() { return { base: st.base, sel: st.sel.slice(), size: st.size, phase: st.phase }; } };
    },
    quote: (sel, size, base) => quote(sel || [], size || 'M', base),
    MENU,
  };
})();
