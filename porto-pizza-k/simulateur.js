/* Porto Pizza K · simulateur « Compose ta pizza » (module autonome, sans dépendance).
   Le client part d'une base sauce tomate, choisit M ou XL, touche les ingrédients (ils volent jusqu'à la pizza),
   puis envoie la pizza au four : elle cuit à l'écran et le module renvoie la ligne de commande via onAdd().

   Utilisation :
     PortoPizzaSimulator.mount(document.getElementById('ici'), {
       onAdd(line) {},        // { id, name, size, options:[…], price } quand la pizza sort du four
       onViewCart() {},       // facultatif : bouton « Voir mon panier » après l'ajout
       closed: false,         // facultatif : true affiche « Commandes fermées »
       menu: MENU,            // facultatif : carte à jour (prix modifiés par le restaurant)
     });

   Prix : toujours ceux de la carte. Le simulateur choisit la pizza de la carte la moins chère qui correspond
   à la composition (ex. mozzarella + thon = « Mozza thon » 16 €), puis ajoute 2 € par supplément et 3 € en XL. */
(function () {
  // Carte Porto Pizza K (taille M = prix de la carte, XL = +3 €, suppléments à 2 €).
  const MENU = {
    pizzas: [
      { id: 'pzk-01', n: 'Mozzarella', p: 13, top: 'mozza' },
      { id: 'pzk-02', n: 'Mozza olives vertes', p: 15, top: 'olives' },
      { id: 'pzk-03', n: 'Mozza thon', p: 16, top: 'thon' },
      { id: 'pzk-04', n: 'Mozza saumon', p: 17, top: 'saumon' },
      { id: 'pzk-05', n: 'Mozza champignons', p: 15, top: 'champi' },
    ],
    sizes: { M: 0, XL: 3 },
    supplement: 2,
  };
  let menu = MENU, opts = {};
  const NS = 'http://www.w3.org/2000/svg';
  // k: clé interne · n: nom de l'option « Suppléments » sur la carte · item: pizza de la carte qui porte cet ingrédient.
  const TOPS = [
    { k: 'mozza', n: 'Mozzarella', count: 22, size: 13, z: 1 },
    { k: 'olives', n: 'Olives vertes', count: 13, size: 6.8, z: 3 },
    { k: 'champi', n: 'Champignons', count: 9, size: 11, z: 3 },
    { k: 'thon', n: 'Thon', count: 11, size: 9.5, z: 2 },
    { k: 'saumon', n: 'Saumon', count: 7, size: 15, z: 2 },
    { k: 'oignons', n: 'Oignons rouges', count: 9, size: 11, z: 4 },
    { k: 'piments', n: 'Piments', count: 12, size: 6.4, z: 5 },
  ];
  const SIZES = [['M', 'M', .84], ['XL', 'XL', 1]];
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Prix : la meilleure combinaison possible de la carte ---------- */
  function quote(sel, size) {
    if (!sel.includes('mozza') || !(size in menu.sizes)) return null;
    // Base = la pizza de la carte qui porte la garniture principale (la plus chère trouvée) ; si aucune, la Mozzarella.
    // Exemples : mozza + thon = Mozza thon 16 € ; mozza + thon + saumon = Mozza saumon 17 € + thon 2 € = 19 €.
    const named = menu.pizzas.filter(pz => !pz.off && pz.top !== 'mozza' && sel.includes(pz.top));
    const plain = menu.pizzas.find(pz => !pz.off && pz.top === 'mozza');
    const pz = named.sort((a, b) => b.p - a.p)[0] || plain;
    if (!pz) return null;
    const extras = TOPS.filter(t => t.k !== 'mozza' && t.k !== pz.top && sel.includes(t.k)).map(t => t.n);
    const price = Math.round((+pz.p + +menu.sizes[size] + extras.length * menu.supplement) * 100) / 100;
    return { id: pz.id, name: pz.n, size, extras, price };
  }

  /* ---------- Dessin ---------- */
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
    mozza(r) {
      const spots = [...Array(3)].map(() => `<ellipse cx="${f(12 + r() * 16)}" cy="${f(12 + r() * 16)}" rx="${f(1.4 + r() * 2)}" ry="${f(1 + r() * 1.5)}" fill="#d9a04f" opacity=".75"/>`).join('');
      return `<path d="${blob(r, 20, 20, 16, 9, .42)}" fill="#fffaf0"/><path d="${blob(r, 18, 18, 10, 7, .4)}" fill="#ffffff" opacity=".9"/>`
        + `<ellipse cx="15" cy="14" rx="4" ry="2.2" fill="#fff" opacity=".9"/><g class="pzk-gold">${spots}</g>`;
    },
    olives() { return '<path fill-rule="evenodd" d="M20 4a16 16 0 1 0 .01 0ZM20 13a7 7 0 1 1-.01 0Z" fill="#7d9a2c" stroke="#4d6316" stroke-width="2"/><path d="M10 13a12 12 0 0 1 9-6" stroke="#c7dc78" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>'; },
    champi(r) {
      const g = r() < .5 ? '#ecdcc0' : '#e4d1b1';
      return `<path d="M5 22C5 11 12 5 20 5s15 6 15 17c0 2-2 3-4 3h-5v8c0 2-2 3-6 3s-6-1-6-3v-8H9c-2 0-4-1-4-3Z" fill="${g}" stroke="#8b6a45" stroke-width="2"/>`
        + '<path d="M9 21c3-3 6-4 11-4s8 1 11 4" stroke="#b79470" stroke-width="1.3" fill="none"/><path d="M17 26v8M23 26v8" stroke="#c9ad88" stroke-width="1.1"/>';
    },
    thon(r) {
      const c = r() < .5 ? '#c9a090' : '#b98a78';
      return `<path d="${blob(r, 20, 20, 14, 7, .7)}" fill="${c}" stroke="#8f6656" stroke-width="1.2"/><path d="M12 17c4 2 9 2 15-1M13 24c4 1 8 1 12-1" stroke="#e8cdc0" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    },
    saumon() {
      return '<defs><linearGradient id="pzkSal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9d6b"/><stop offset="1" stop-color="#e8653a"/></linearGradient></defs>'
        + '<path d="M4 15C9 6 28 3 36 11c3 4 0 11-6 15-9 6-22 7-25 0-1-3-2-7-1-11Z" fill="url(#pzkSal)" stroke="#c8532d" stroke-width="1.2"/>'
        + '<path d="M9 13c6-4 16-5 23-1M7 20c8-4 19-5 26-1M9 27c7-3 14-3 19-1" stroke="#ffe0cc" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".9"/>';
    },
    oignons(r) {
      const a = r() * 60;
      return `<g transform="rotate(${f(a)} 20 20)"><path d="M6 24a14 14 0 0 1 28 0" stroke="#8a2f6e" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M6 24a14 14 0 0 1 28 0" stroke="#e7c4dc" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M12 24a8 8 0 0 1 16 0" stroke="#a9468c" stroke-width="3" fill="none" stroke-linecap="round"/></g>`;
    },
    piments(r) {
      r(); const green = r() < .25, c = green ? '#3f9a2f' : '#d9261c', d = green ? '#286b1c' : '#99160f';
      return `<circle cx="20" cy="20" r="13" fill="${c}" stroke="${d}" stroke-width="2"/><circle cx="20" cy="20" r="7.5" fill="#f6d9a2"/><circle cx="17.5" cy="18.5" r="1.6" fill="#f3e2b6"/><circle cx="22.5" cy="19" r="1.6" fill="#f3e2b6"/><circle cx="20" cy="23" r="1.6" fill="#f3e2b6"/><path d="M11 14a11 11 0 0 1 7-4" stroke="#fff" stroke-width="1.6" opacity=".55" fill="none" stroke-linecap="round"/>`;
    },
  };
  const art = (k, seed) => `<svg viewBox="0 0 40 40" aria-hidden="true">${ART[k](rng(seed))}</svg>`;

  function spiral() {
    let d = '';
    for (let i = 0; i <= 420; i++) { const t = i / 420, a = t * Math.PI * 2 * 5.2, r = 3 + t * 72; d += (i ? 'L' : 'M') + f(100 + Math.cos(a) * r) + ' ' + f(100 + Math.sin(a) * r); }
    return d;
  }
  function pieSvg() {
    const r = rng(77);
    let speck = '';
    for (let i = 0; i < 150; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 76, x = 100 + Math.cos(a) * d, y = 100 + Math.sin(a) * d, light = r() < .45;
      speck += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(.6 + r() * 1.6)}" fill="${light ? '#ff7b4f' : '#9e1d0c'}" opacity="${f(.25 + r() * .4)}"/>`;
    }
    let char = '';
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = 84 + r() * 10;
      char += `<ellipse cx="${f(100 + Math.cos(a) * d)}" cy="${f(100 + Math.sin(a) * d)}" rx="${f(1.5 + r() * 3.5)}" ry="${f(1 + r() * 2)}" transform="rotate(${f(a * 57.3)} ${f(100 + Math.cos(a) * d)} ${f(100 + Math.sin(a) * d)})" fill="#3d200c" opacity="${f(.45 + r() * .4)}"/>`;
    }
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 70;
      char += `<circle cx="${f(100 + Math.cos(a) * d)}" cy="${f(100 + Math.sin(a) * d)}" r="${f(1 + r() * 2.2)}" fill="#5a1606" opacity=".35"/>`;
    }
    return `<svg class="pzk-base" viewBox="0 0 200 200" aria-hidden="true"><defs>
<radialGradient id="pzkDough" cx="46%" cy="42%" r="58%"><stop offset="0" stop-color="#fdf0d4"/><stop offset=".78" stop-color="#f3dcaa"/><stop offset="1" stop-color="#e2b979"/></radialGradient>
<radialGradient id="pzkCrust" cx="50%" cy="50%" r="50%"><stop offset=".8" stop-color="#b8692a" stop-opacity="0"/><stop offset=".9" stop-color="#c47a35" stop-opacity=".55"/><stop offset="1" stop-color="#8f4a17" stop-opacity=".8"/></radialGradient>
<radialGradient id="pzkSauce" cx="44%" cy="40%" r="64%"><stop offset="0" stop-color="#f45a2e"/><stop offset=".65" stop-color="#df3d1c"/><stop offset="1" stop-color="#bb2812"/></radialGradient>
<filter id="pzkRough" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="5"/><feDisplacementMap in="SourceGraphic" scale="6"/></filter>
<filter id="pzkSoft"><feGaussianBlur stdDeviation="1.2"/></filter>
<clipPath id="pzkClip"><circle cx="100" cy="100" r="80"/></clipPath></defs>
<circle cx="100" cy="100" r="96" fill="url(#pzkDough)" filter="url(#pzkRough)"/>
<circle cx="100" cy="100" r="90" fill="none" stroke="#fff6df" stroke-width="2.5" opacity=".7" filter="url(#pzkSoft)"/>
<circle cx="100" cy="100" r="95" fill="none" stroke="#c99554" stroke-width="2" opacity=".45"/>
<g class="pzk-bake"><circle cx="100" cy="100" r="97" fill="url(#pzkCrust)" filter="url(#pzkRough)"/></g>
<g filter="url(#pzkRough)"><circle cx="100" cy="100" r="81" fill="url(#pzkSauce)"/></g>
<g clip-path="url(#pzkClip)"><path d="${spiral()}" fill="none" stroke="#a51f0d" stroke-width="5" opacity=".28" filter="url(#pzkRough)"/><path d="${spiral()}" fill="none" stroke="#ff7a4a" stroke-width="2.4" opacity=".35" transform="rotate(14 100 100)" filter="url(#pzkRough)"/>${speck}</g>
<g class="pzk-bake">${char}</g></svg>`;
  }

  /* ---------- Styles ---------- */
  const CSS = `
.pzk{--o1:#ff8a3d;--o2:#f2541b;--ink:#f5f1ea;--mute:rgba(236,232,255,.62);position:relative;margin:4px 0 14px;padding:22px 18px 18px;border-radius:30px;color:var(--ink);
  background:radial-gradient(120% 70% at 50% 0%,#3a4072 0%,#262a4d 45%,#191c36 100%);box-shadow:0 24px 50px -18px rgba(14,16,40,.75),inset 0 1px 0 rgba(255,255,255,.08);overflow:hidden;
  font-family:Rubik,system-ui,sans-serif;-webkit-tap-highlight-color:transparent;isolation:isolate}
.pzk *{box-sizing:border-box}
.pzk-hd{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px}
.pzk h3{margin:0;font-family:"Instrument Serif","Frank Ruhl Libre",Georgia,serif;font-weight:400;font-size:clamp(34px,10vw,44px);line-height:1;letter-spacing:-.01em;color:#fff}
.pzk h3 i{color:var(--o1);font-style:italic}
.pzk-sub{margin:0;font-size:12.5px;font-weight:500;color:var(--mute);letter-spacing:.01em}
.pzk-size{position:relative;display:flex;padding:4px;border-radius:999px;background:rgba(255,255,255,.08);box-shadow:inset 0 1px 2px rgba(0,0,0,.35)}
.pzk-size button{position:relative;z-index:1;width:46px;height:34px;border:0;border-radius:999px;background:none;font:700 13px Rubik,sans-serif;color:var(--mute);cursor:pointer;transition:color .25s}
.pzk-size button[aria-pressed=true]{color:#1e2244}
.pzk-knob{position:absolute;top:4px;left:4px;width:46px;height:34px;border-radius:999px;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,.35);transition:transform .45s cubic-bezier(.3,1.5,.5,1)}
.pzk-size.xl .pzk-knob{transform:translateX(46px)}
.pzk-stage{position:relative;width:min(78vw,330px);aspect-ratio:1;margin:18px auto 6px}
.pzk-plate{position:absolute;inset:-2%;border-radius:50%;background:radial-gradient(circle,#20244a 0 62%,#1a1d3b 63% 100%);box-shadow:0 20px 40px -10px rgba(0,0,0,.6),inset 0 2px 0 rgba(255,255,255,.05)}
.pzk-fire{position:absolute;inset:-28%;border-radius:50%;opacity:0;pointer-events:none;background:radial-gradient(circle,rgba(255,214,120,.95) 0 22%,rgba(255,140,40,.8) 38%,rgba(232,70,20,.45) 55%,rgba(180,30,10,0) 72%);filter:blur(6px);transition:opacity .5s;z-index:0}
.pzk.baking .pzk-fire{opacity:1;animation:pzkFlicker .18s infinite alternate}
@keyframes pzkFlicker{from{transform:scale(1) rotate(0)}to{transform:scale(1.04) rotate(3deg)}}
.pzk-ember{position:absolute;bottom:40%;width:5px;height:5px;border-radius:50%;background:#ffd27a;box-shadow:0 0 8px #ff9a3c;opacity:0;z-index:3;pointer-events:none}
.pzk.baking .pzk-ember{animation:pzkRise 1.3s ease-in infinite}
@keyframes pzkRise{0%{opacity:0;transform:translateY(0) scale(1)}15%{opacity:1}100%{opacity:0;transform:translateY(-190px) scale(.3)}}
.pzk-pie{position:absolute;inset:4%;z-index:1;transform:scale(var(--s,.84));transition:transform .6s cubic-bezier(.3,1.45,.5,1)}
.pzk.baking .pzk-pie{animation:pzkHeat .7s ease-in-out infinite alternate}
@keyframes pzkHeat{to{filter:brightness(1.08) saturate(1.15)}}
.pzk-base{position:absolute;inset:0;width:100%;height:100%;filter:drop-shadow(0 10px 14px rgba(0,0,0,.45));transition:filter 1.2s}
.pzk-bake{opacity:0;transition:opacity 1.4s ease}
.pzk.baked .pzk-bake{opacity:1}
.pzk.baked .pzk-base{filter:drop-shadow(0 10px 14px rgba(0,0,0,.45)) saturate(1.08) brightness(.97)}
.pzk-tops{position:absolute;inset:0}
.pzk-pc{position:absolute;pointer-events:none;will-change:transform}
.pzk-pc svg{display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 1.5px 1.5px rgba(70,10,0,.35))}
.pzk-gold{opacity:0;transition:opacity 1.4s}
.pzk.baked .pzk-gold{opacity:1}
.pzk.baked .pzk-pc{filter:saturate(1.1) brightness(.97)}
.pzk.baked .pzk-mz{filter:sepia(.18) saturate(1.2)}
.pzk-hint{min-height:20px;margin:6px 0 12px;text-align:center;font-size:12.5px;font-weight:500;color:var(--mute)}
.pzk-hint b{color:#fff;font-weight:600}
.pzk-hint button{border:0;background:none;padding:0 0 0 8px;font:600 12.5px Rubik,sans-serif;color:var(--o1);cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.pzk-grid{display:flex;flex-wrap:wrap;justify-content:center;gap:12px 6px}
.pzk-ing{position:relative;flex:0 0 calc(25% - 6px);display:flex;flex-direction:column;align-items:center;gap:6px;padding:0;border:0;background:none;color:var(--ink);cursor:pointer;font:600 11px Rubik,sans-serif}
.pzk-ing:disabled{cursor:default}
.pzk-dot{position:relative;width:62px;height:62px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#3c4378,#232748 70%);box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 8px 16px -6px rgba(0,0,0,.6);transition:transform .25s cubic-bezier(.3,1.6,.5,1),box-shadow .25s}
.pzk-dot .pzk-ico{position:relative;width:46px;height:46px}
.pzk-dot .pzk-ico svg{position:absolute;width:62%;height:62%}
.pzk-dot .pzk-ico svg:nth-child(1){left:0;top:4%}.pzk-dot .pzk-ico svg:nth-child(2){right:0;top:12%}.pzk-dot .pzk-ico svg:nth-child(3){left:20%;bottom:0}
.pzk-ing:active .pzk-dot{transform:scale(.9)}
.pzk-ing[aria-pressed=true] .pzk-dot{box-shadow:0 0 0 2.5px var(--o1),0 0 22px -2px rgba(255,138,61,.7),inset 0 1px 0 rgba(255,255,255,.12)}
.pzk-ok,.pzk-minus{position:absolute;top:-2px;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font:700 11px/1 Rubik,sans-serif;transform:scale(0);transition:transform .3s cubic-bezier(.3,1.7,.5,1)}
.pzk-ok{right:-2px;background:linear-gradient(135deg,var(--o1),var(--o2));color:#fff;box-shadow:0 2px 6px rgba(242,84,27,.6)}
.pzk-minus{left:-2px;background:#5c6596;color:#fff;font-size:14px}
.pzk-ing[aria-pressed=true] .pzk-ok,.pzk-ing[aria-pressed=true] .pzk-minus{transform:scale(1)}
.pzk.locked .pzk-ing[aria-pressed=true] .pzk-minus{transform:scale(0)}
.pzk-ing.req:not([aria-pressed=true]) .pzk-dot{animation:pzkCall 1.6s ease-in-out infinite}
@keyframes pzkCall{50%{box-shadow:0 0 0 2px rgba(255,138,61,.55),0 0 18px rgba(255,138,61,.45),inset 0 1px 0 rgba(255,255,255,.12)}}
.pzk-ing.shake .pzk-dot{animation:pzkShake .4s}
@keyframes pzkShake{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
.pzk.locked .pzk-ing:not([aria-pressed=true]){opacity:.45}
.pzk-go{position:relative;display:flex;align-items:center;justify-content:space-between;width:100%;height:58px;margin-top:18px;padding:0 22px;border:0;border-radius:999px;overflow:hidden;
  font:600 15px Rubik,sans-serif;color:var(--mute);background:rgba(255,255,255,.08);cursor:pointer;transition:background .4s,color .4s,box-shadow .4s,transform .15s}
.pzk-go:active{transform:scale(.98)}
.pzk-go:disabled{cursor:default}
.pzk-go.on{color:#fff;background:linear-gradient(135deg,var(--o1),var(--o2));box-shadow:0 14px 28px -10px rgba(242,84,27,.8)}
.pzk-go.oven{color:#fff;background:#1f9d55;box-shadow:0 14px 28px -10px rgba(31,157,85,.8)}
.pzk-go .pzk-bar{position:absolute;inset:0;width:0;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.28));pointer-events:none}
.pzk-go.oven .pzk-bar{animation:pzkBar var(--bake,3.2s) linear forwards}
@keyframes pzkBar{to{width:100%}}
.pzk-go span{position:relative}
.pzk-price{font-variant-numeric:tabular-nums;font-weight:700}
.pzk-or{margin:14px 0 0;text-align:center;font-size:12px;color:var(--mute)}
@media (prefers-reduced-motion:reduce){.pzk *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
`;

  /* ---------- Composant ---------- */
  const st = { sel: [], size: 'M', phase: 'build', shown: 0 };
  let el = null, pie = null, tops = null, stage = null, timers = [];
  const pieces = {};

  function style() {
    if (document.getElementById('pzk-css')) return;
    const s = document.createElement('style'); s.id = 'pzk-css'; s.textContent = CSS; (document.head || document.body).appendChild(s);
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap'; (document.head || document.body).appendChild(l);
  }
  const money = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(+n || 0);
  const blocked = () => !!(typeof opts.closed === 'function' ? opts.closed() : opts.closed);

  function build() {
    style();
    el = document.createElement('section');
    el.className = 'pzk'; el.setAttribute('aria-label', 'Compose ta pizza');
    el.innerHTML = `<h3>Compose <i>ta pizza</i></h3><div class="pzk-hd"><p class="pzk-sub">Porto Pizza K · base sauce tomate</p>
<div class="pzk-size" role="group" aria-label="Taille">${SIZES.map(s => `<button type="button" data-size="${s[0]}" aria-pressed="${st.size === s[0]}">${s[1]}</button>`).join('')}<span class="pzk-knob"></span></div></div>
<div class="pzk-stage"><div class="pzk-fire"></div><div class="pzk-plate"></div><div class="pzk-pie">${pieSvg()}<div class="pzk-tops"></div></div>
${[...Array(14)].map((_, i) => `<span class="pzk-ember" style="left:${18 + (i * 37) % 64}%;animation-delay:${(i * 0.17) % 1.3}s"></span>`).join('')}</div>
<p class="pzk-hint" aria-live="polite"></p>
<div class="pzk-grid">${TOPS.map((t, i) => `<button type="button" class="pzk-ing${t.k === 'mozza' ? ' req' : ''}" data-k="${t.k}" aria-pressed="false"><span class="pzk-dot"><span class="pzk-ico">${art(t.k, i * 7 + 1)}${art(t.k, i * 7 + 2)}${art(t.k, i * 7 + 3)}</span><span class="pzk-minus" aria-hidden="true">−</span><span class="pzk-ok" aria-hidden="true">✓</span></span>${t.n}</button>`).join('')}</div>
<button type="button" class="pzk-go"><span class="pzk-bar"></span><span class="pzk-lbl"></span><span class="pzk-price"></span></button>
`;
    pie = el.querySelector('.pzk-pie'); tops = el.querySelector('.pzk-tops'); stage = el.querySelector('.pzk-stage');
    el.addEventListener('click', onClick);
    sync(false);
  }

  function place(top) {
    // Positions stables (graine par ingrédient), réparties sur la sauce sans trop se chevaucher.
    const r = rng(top.k.length * 977 + top.count * 31), out = [], R = 39 - top.size * .32;
    let guard = 0;
    while (out.length < top.count && guard++ < 900) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R, x = 50 + Math.cos(a) * d, y = 50 + Math.sin(a) * d;
      const gap = top.size * (guard < 500 ? .78 : .45);
      if (out.every(p => Math.hypot(p.x - x, p.y - y) > gap)) out.push({ x, y, rot: r() * 360, sc: .85 + r() * .3 });
    }
    return out;
  }

  function addPieces(top, animate) {
    const chip = el.querySelector(`[data-k="${top.k}"] .pzk-dot`);
    const pr = pie.getBoundingClientRect(), cr = chip ? chip.getBoundingClientRect() : null;
    const scale = pr.width ? pr.width / pie.offsetWidth || 1 : 1;
    pieces[top.k] = place(top).map((p, i) => {
      const d = document.createElement('div');
      d.className = 'pzk-pc' + (top.k === 'mozza' ? ' pzk-mz' : '');
      const w = top.size * p.sc;
      d.style.cssText = `left:${f(p.x - w / 2)}%;top:${f(p.y - w / 2)}%;width:${f(w)}%;height:${f(w)}%;z-index:${top.z}`;
      d.innerHTML = `<svg viewBox="0 0 40 40" aria-hidden="true"><g transform="rotate(${f(p.rot)} 20 20)">${ART[top.k](rng(i * 13 + top.k.length))}</g></svg>`;
      tops.appendChild(d);
      if (animate && !reduce && cr && pr.width && d.animate) {
        const px = pr.left + pr.width * p.x / 100, py = pr.top + pr.height * p.y / 100;
        const dx = (cr.left + cr.width / 2 - px) / scale, dy = (cr.top + cr.height / 2 - py) / scale;
        d.animate([
          { transform: `translate(${f(dx)}px,${f(dy)}px) scale(.35)`, opacity: 0 },
          { transform: `translate(${f(dx * .45)}px,${f(dy * .45 - 70)}px) scale(1.45)`, opacity: 1, offset: .5 },
          { transform: 'translate(0,0) scale(.9)', offset: .85 },
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
        ], { duration: 620 + i * 14, delay: i * 38, easing: 'cubic-bezier(.25,.7,.35,1)', fill: 'backwards' });
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
    const q = quote(st.sel, st.size), closed = blocked(), building = st.phase === 'build';
    el.classList.toggle('locked', !building);
    el.querySelector('.pzk-size').classList.toggle('xl', st.size === 'XL');
    el.querySelectorAll('[data-size]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.size === st.size)); b.disabled = !building; });
    el.querySelectorAll('.pzk-ing').forEach(b => { const on = st.sel.includes(b.dataset.k); b.setAttribute('aria-pressed', String(on)); b.disabled = !building; b.setAttribute('aria-label', b.textContent.replace(/[−✓]/g, '').trim() + (on ? ', ajouté' : '')); });
    pie.style.setProperty('--s', SIZES.find(s => s[0] === st.size)[2]);
    const hint = el.querySelector('.pzk-hint'), go = el.querySelector('.pzk-go'), lbl = go.querySelector('.pzk-lbl'), price = go.querySelector('.pzk-price');
    go.classList.remove('on', 'oven');
    if (st.phase === 'oven') {
      hint.innerHTML = '<b>Au four</b> · 90 secondes de cuisson 🔥';
      go.classList.add('oven'); go.disabled = true; lbl.textContent = 'Ajout à ta commande…';
    } else if (st.phase === 'done') {
      hint.innerHTML = '<b>Sortie du four ✓ · ajoutée à ta commande</b><button type="button" data-redo>Recomposer</button>';
      go.classList.add('on'); go.disabled = false; lbl.textContent = opts.onViewCart ? 'Voir mon panier' : 'Recomposer une pizza';
      price.textContent = st.line ? money(st.line.price) : '';
      return;
    } else if (closed) {
      hint.textContent = 'Les commandes sont fermées pour le moment.';
      go.disabled = true; lbl.textContent = 'Commandes fermées'; price.textContent = '';
      return;
    } else if (!st.sel.includes('mozza')) {
      hint.innerHTML = 'Commence par la <b>mozzarella</b>, puis ajoute ce que tu veux';
      go.disabled = true; lbl.textContent = 'Ajouter à la commande';
    } else {
      hint.innerHTML = st.sel.length > 1 ? `${q ? `<b>${q.name}</b>` : ''}${q && q.extras.length ? ' + ' + q.extras.length + ' suppl.' : ''} · touche encore pour en ajouter` : 'Touche un ingrédient pour l’ajouter';
      go.disabled = !q; if (q) go.classList.add('on'); lbl.textContent = q ? 'Ajouter à la commande' : 'Indisponible';
    }
    const base = q ? q.price : quote(['mozza'], st.size)?.price;
    if (base != null) { if (animatePrice) countTo(price, base); else { st.shown = base; price.textContent = money(base); } }
  }

  function toggle(k, btn) {
    const top = TOPS.find(t => t.k === k);
    if (st.sel.includes(k)) {
      if (k === 'mozza' && st.sel.length > 1) { btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake'); return; }
      st.sel = st.sel.filter(x => x !== k); dropPieces(k, true);
    } else {
      st.sel = [...st.sel, k]; addPieces(top, true);
    }
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
    sync();
  }

  function later(fn, ms) { timers.push(setTimeout(fn, reduce ? Math.min(ms, 300) : ms)); }
  function bake() {
    const q = quote(st.sel, st.size);
    if (!q || blocked()) return;
    st.phase = 'oven'; st.line = q; el.classList.add('baking'); el.style.setProperty('--bake', '3.2s'); sync(false);
    later(() => el.classList.add('baked'), 1300);
    later(() => {
      el.classList.remove('baking');
      const q = st.line, line = { id: q.id, name: q.name, size: q.size, options: ['Taille : ' + q.size].concat(q.extras), price: q.price };
      if (typeof opts.onAdd === 'function') opts.onAdd(line);
      el.dispatchEvent(new CustomEvent('pzk:add', { detail: line, bubbles: true }));
      st.phase = 'done'; sync(false);
    }, 3200);
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
    if (t.dataset.k && st.phase === 'build') { toggle(t.dataset.k, t); return; }
    if (t.hasAttribute('data-redo')) { reset(); return; }
    if (t.classList.contains('pzk-go')) { if (st.phase === 'build') bake(); else if (st.phase === 'done') { if (opts.onViewCart) opts.onViewCart(); else reset(); } }
  }

  /* ---------- API publique ---------- */
  window.PortoPizzaSimulator = {
    mount(target, options) {
      opts = options || {}; menu = opts.menu || MENU;
      if (!el) build(); else sync(false);
      target.appendChild(el); sync(false);
      return { reset, refresh: () => sync(false), quote: (sel, size) => quote(sel, size || 'M'), get state() { return { sel: st.sel.slice(), size: st.size, phase: st.phase }; } };
    },
    quote: (sel, size) => quote(sel, size || 'M'),
    MENU,
  };
})();
