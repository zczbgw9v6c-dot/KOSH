/* Kosh · moteur des simulateurs de composition (module autonome, sans dépendance).

   Un seul moteur, une configuration par restaurant (voir le-j/config.js, maison-braha/config.js…).
   Deux scènes :
     - 'pile'  : on empile des couches entre deux pains (sandwich, burger), vue trois-quarts ;
     - 'table' : chaque article choisi vient se poser sur une table ou un plateau (Chabbat, menus).

   Utilisation :
     KoshSimulateur.mount(element, CONFIG, {
       onAdd(line) {},      // { id, name, options:[…], price, items:[{k,n,q}] }
       closed: false,       // booléen ou fonction : « Commandes fermées »
       assets: {…},         // facultatif : photos détourées (sinon window.KOSH_ASSETS[config.id])
     });

   Photos réelles : si assets/manifest.js déclare une photo pour un article, elle remplace le dessin
   automatiquement. Voir PHOTOS-GPT.md et outils/detourer.py. */
(function () {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f = n => Math.round(n * 100) / 100;
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function hash(str) { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

  /* ---------- Dessins de secours (remplacés par les photos dès qu'elles existent) ---------- */
  function wavy(r, x0, x1, y, amp, step) {
    let d = `M${f(x0)} ${f(y)}`;
    for (let x = x0; x < x1; x += step) d += `q${f(step / 2)} ${f((r() - .5) * amp * 2)} ${f(step)} ${f((r() - .5) * amp * .4)}`;
    return d;
  }
  function slice(r, cx, cy, rx, ry, rot, c) {
    // tranche pliée : bord ondulé, liseré clair, reflet
    let d = '';
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2, k = 1 + (r() - .5) * .16;
      d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * rx * k) + ' ' + f(cy + Math.sin(a) * ry * k);
    }
    let extra = '';
    if (c.dots) for (let i = 0; i < 9; i++) { const a = r() * 6.28, q = Math.sqrt(r()) * .8; extra += `<circle cx="${f(cx + Math.cos(a) * rx * q)}" cy="${f(cy + Math.sin(a) * ry * q)}" r="${f(.9 + r() * 1.3)}" fill="${c.dots}" opacity=".85"/>`; }
    if (c.rim) extra += `<path d="${d}Z" fill="none" stroke="${c.rim}" stroke-width="2.6" stroke-dasharray="${c.dash || ''}" opacity=".9"/>`;
    return `<g transform="rotate(${f(rot)} ${f(cx)} ${f(cy)})"><path d="${d}Z" fill="${c.fill}" stroke="${c.edge}" stroke-width="1"/>${extra}<path d="M${f(cx - rx * .6)} ${f(cy - ry * .35)}q${f(rx * .6)} ${f(-ry * .5)} ${f(rx * 1.2)} 0" stroke="#fff" stroke-width="1.4" fill="none" opacity=".28" stroke-linecap="round"/></g>`;
  }
  const ART = {
    painBas(a) {
      return [200, 50, `<defs><linearGradient id="pb${a.u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c98a3a"/><stop offset="1" stop-color="#8f5418"/></linearGradient></defs>
        <path d="M6 20c0-4 3-6 8-6h172c5 0 8 2 8 6v8c0 12-22 20-94 20S6 40 6 28Z" fill="url(#pb${a.u})"/>
        <ellipse cx="100" cy="19" rx="93" ry="13" fill="#f6e3b6"/><ellipse cx="100" cy="19" rx="93" ry="13" fill="none" stroke="#d6a558" stroke-width="2"/>
        <ellipse cx="92" cy="17" rx="70" ry="8" fill="#fbefd0" opacity=".8"/>`];
    },
    painHaut(a, r) {
      let seeds = '';
      for (let i = 0; i < 70; i++) { const x = 18 + r() * 164, y = 10 + r() * 44; seeds += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="1.9" ry="1" fill="#fbf0cf" transform="rotate(${f(r() * 180)} ${f(x)} ${f(y)})"/>`; }
      const braid = a.tresse !== false ? [[38, 46, 36, 30, -18], [82, 40, 38, 32, 14], [124, 42, 38, 32, -12], [164, 48, 32, 28, 16]].map(([x, y, rx, ry, rot]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#ph${a.u})" stroke="#7d4410" stroke-width="1.4" transform="rotate(${rot} ${x} ${y})"/><ellipse cx="${x - 6}" cy="${y - 12}" rx="${rx * .55}" ry="${ry * .3}" fill="#fff" opacity=".22" transform="rotate(${rot} ${x} ${y})"/>`).join('')
        : `<path d="M8 66C8 22 50 6 100 6s92 16 92 60Z" fill="url(#ph${a.u})" stroke="#7d4410" stroke-width="1.4"/><ellipse cx="86" cy="26" rx="52" ry="12" fill="#fff" opacity=".22"/>`;
      return [200, 82, `<defs><radialGradient id="ph${a.u}" cx=".4" cy=".25" r=".9"><stop offset="0" stop-color="#e8a94c"/><stop offset=".6" stop-color="#b8701f"/><stop offset="1" stop-color="#7d4410"/></radialGradient></defs>
        <ellipse cx="100" cy="66" rx="94" ry="13" fill="#f3dba6"/>${braid}<g clip-path="none">${seeds}</g>`];
    },
    viande(a, r) {
      let s = '';
      const n = a.n || 7;
      for (let i = 0; i < n; i++) s += slice(r, 22 + i * (156 / (n - 1)) + (r() - .5) * 8, 24 + (r() - .5) * 8, 30 + r() * 6, 15 + r() * 4, (r() - .5) * 34, a);
      return [200, 46, s];
    },
    steak(a, r) {
      let crust = '';
      for (let i = 0; i < 46; i++) crust += `<circle cx="${f(10 + r() * 180)}" cy="${f(14 + r() * 18)}" r="${f(1 + r() * 2.2)}" fill="${r() < .5 ? '#2a1408' : '#6d3b1c'}" opacity=".7"/>`;
      return [200, 40, `<path d="${wavy(r, 6, 194, 14, 5, 12)}L196 28c0 6-30 10-96 10S4 34 4 28Z" fill="#4a2410" stroke="#2a1408" stroke-width="1"/>${crust}<path d="M30 12q70 -6 140 0" stroke="#fff" stroke-width="1.6" opacity=".18" fill="none"/>`];
    },
    fromage(a) {
      return [200, 34, `<path d="M6 12Q100 2 194 12L182 20l10 10-22-6-18 8-20-9-26 9-22-9-30 8-20-9-24 6 8-10Z" fill="${a.fill || '#f6b21b'}" stroke="#d18d0c" stroke-width="1"/><path d="M30 11q70-5 140 0" stroke="#fff" stroke-width="2" opacity=".35" fill="none"/>`];
    },
    laitue(a, r) {
      return [200, 34, `<path d="${wavy(r, 4, 196, 20, 9, 9)}L196 14Q100 0 4 14Z" fill="#6aa832" stroke="#3f7417" stroke-width="1.2"/><path d="${wavy(r, 10, 190, 15, 6, 11)}" fill="none" stroke="#b6dd72" stroke-width="2" opacity=".8"/>`];
    },
    oignon(a, r) {
      let s = '';
      for (let i = 0; i < 9; i++) { const x = 24 + i * 19 + (r() - .5) * 8, y = 16 + (r() - .5) * 8, rx = 15 + r() * 7; s += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(rx * .42)}" fill="none" stroke="#8a2f6e" stroke-width="3.4"/><ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(rx * .42)}" fill="none" stroke="#f1d6e8" stroke-width="1.2"/>`; }
      return [200, 32, s];
    },
    filaments(a, r) {
      let s = '';
      const cols = a.cols;
      for (let i = 0; i < (a.n || 60); i++) { const x = 12 + r() * 170, y = 8 + r() * 16; s += `<path d="M${f(x)} ${f(y)}q${f(6 + r() * 8)} ${f((r() - .5) * 14)} ${f(12 + r() * 12)} ${f((r() - .5) * 8)}" stroke="${cols[Math.floor(r() * cols.length)]}" stroke-width="${f(a.sw || 2.4)}" fill="none" stroke-linecap="round"/>`; }
      return [200, 32, s];
    },
    des(a, r) {
      let s = '';
      const cols = a.cols;
      for (let i = 0; i < 46; i++) { const x = 12 + r() * 172, y = 6 + r() * 16, w = 6 + r() * 4, c = cols[Math.floor(r() * cols.length)]; s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(w * .8)}" rx="1.4" fill="${c[0]}" stroke="${c[1]}" stroke-width=".8" transform="rotate(${f((r() - .5) * 50)} ${f(x)} ${f(y)})"/>`; }
      return [200, 32, s];
    },
    rondelles(a, r) {
      let s = '';
      for (let i = 0; i < (a.n || 6); i++) { const x = 30 + i * (140 / ((a.n || 6) - 1)), y = 14 + (r() - .5) * 6; s += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="17" ry="7" fill="${a.fill}" stroke="${a.edge}" stroke-width="1.6"/><ellipse cx="${f(x)}" cy="${f(y)}" rx="10" ry="3.6" fill="${a.in || a.fill}" opacity=".7"/>`; }
      return [200, 28, s];
    },
    sauce(a, r) {
      let drips = '';
      [18, 52, 96, 140, 178].forEach(x => { const h = 8 + r() * 12; drips += `<path d="M${x - 5} 10v${f(h)}a5 5 0 0 0 10 0V10Z" fill="${a.fill}"/>`; });
      return [200, 30, `${drips}<path d="${wavy(r, 6, 194, 12, 4, 10)}L194 8Q100 -2 6 8Z" fill="${a.fill}"/><path d="M24 6q76-5 152 0" stroke="#fff" stroke-width="2" opacity=".45" fill="none" stroke-linecap="round"/>`];
    },
  };
  let uid = 0;
  function drawing(art, key) {
    const a = Object.assign({ u: ++uid }, art);
    const [w, h, body] = (ART[a.t] || ART.viande)(a, rng(hash(key)));
    return { ar: h / w, html: `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>` };
  }
  function visual(item, assets) {
    const photo = assets && assets[item.ph || item.k];
    if (photo) return { ar: photo.h / photo.w, html: `<img src="${esc(photo.src)}" alt="" draggable="false">`, photo: true };
    if (item.emoji) return { ar: 1, html: `<span class="ks-emoji">${item.emoji}</span>` };
    return drawing(item.art || { t: 'viande', fill: '#c44' , edge: '#822' }, item.k);
  }

  const CSS = `
.ks{--c:#5b2a86;--c2:#7c3fb5;--bg:#f4f0fa;--ink:#1d1630;--mut:#6f6a7d;--card:#fff;--stage:radial-gradient(120% 90% at 50% 40%,#7d35c9 0%,#4a1b82 60%,#2c0f55 100%);
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Inter","Segoe UI",system-ui,sans-serif;color:var(--ink);background:var(--bg);border-radius:28px;overflow:hidden;position:relative;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.ks *{box-sizing:border-box}
.ks-head{display:flex;align-items:center;gap:12px;padding:16px 18px 12px}
.ks-logo{width:44px;height:44px;border-radius:50%;background:var(--c);color:#fff;display:grid;place-items:center;font-weight:800;font-size:19px;flex:none;overflow:hidden}
.ks-logo img{width:100%;height:100%;object-fit:cover}
.ks-head h2{margin:0;font-size:21px;font-weight:800;letter-spacing:-.02em;line-height:1.1}
.ks-head p{margin:2px 0 0;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
.ks-badge{margin-left:auto;text-align:right;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.ks-badge b{display:block;font-size:22px;letter-spacing:-.02em;color:var(--c);font-variant-numeric:tabular-nums;transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.ks-badge b.pop{transform:scale(1.18)}
.ks-stage{position:relative;margin:0 12px;border-radius:24px;background:var(--stage);aspect-ratio:1/.92;overflow:hidden;container-type:inline-size;perspective:900px;touch-action:pan-y}
.ks-stage::after{content:"";position:absolute;inset:0;background:radial-gradient(60% 40% at 50% 0,rgba(255,255,255,.2),transparent 70%);pointer-events:none}
.ks-tilt{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .5s cubic-bezier(.2,.8,.2,1);will-change:transform}
.ks-tilt.live{transition:transform .08s linear}
.ks-shadow{position:absolute;left:50%;bottom:9cqw;width:74cqw;height:9cqw;transform:translateX(-50%);background:radial-gradient(closest-side,rgba(0,0,0,.5),transparent);filter:blur(3px);transition:transform .4s}
.ks-pile{position:absolute;left:0;right:0;bottom:12cqw;height:0;transform-origin:50% 100%;transition:transform .45s cubic-bezier(.34,1.4,.64,1);transform-style:preserve-3d}
.ks-layer{position:absolute;left:50%;transition:bottom .45s cubic-bezier(.34,1.4,.64,1);will-change:transform,bottom;filter:drop-shadow(0 .8cqw .8cqw rgba(0,0,0,.28))}
.ks-layer svg,.ks-layer img{display:block;width:100%;height:auto;pointer-events:none}
.ks-hint{position:absolute;left:0;right:0;top:54px;text-align:center;color:#fff;font-size:13px;font-weight:600;opacity:.85;pointer-events:none;transition:opacity .3s;text-shadow:0 1px 6px rgba(0,0,0,.4)}
.ks-tools{position:absolute;right:10px;top:10px;display:flex;gap:8px;z-index:3}
.ks-tools button{border:0;border-radius:99px;padding:8px 12px;font:inherit;font-size:12px;font-weight:700;color:#fff;background:rgba(255,255,255,.18);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);cursor:pointer}
.ks-tools button:active{transform:scale(.94)}
.ks-steps{display:flex;gap:6px;padding:14px 12px 4px;overflow-x:auto;scrollbar-width:none}
.ks-steps::-webkit-scrollbar{display:none}
.ks-step{flex:none;border:0;border-radius:99px;padding:9px 14px;font:inherit;font-size:13px;font-weight:700;background:rgba(0,0,0,.06);color:var(--mut);cursor:pointer;transition:background .2s,color .2s,transform .15s;display:flex;gap:6px;align-items:center}
.ks-step.on{background:var(--c);color:#fff}
.ks-step i{font-style:normal;font-size:11px;min-width:18px;height:18px;border-radius:9px;display:grid;place-items:center;background:rgba(255,255,255,.28);padding:0 5px}
.ks-step:not(.on) i{background:var(--c);color:#fff}
.ks-step i:empty{display:none}
.ks-sub{padding:6px 18px 0;font-size:12px;color:var(--mut);min-height:22px}
.ks-items{display:flex;gap:10px;padding:8px 12px 14px;overflow-x:auto;scroll-snap-type:x proximity;scrollbar-width:none}
.ks-items::-webkit-scrollbar{display:none}
.ks-item{flex:none;width:104px;scroll-snap-align:start;border:0;border-radius:20px;padding:10px 6px 10px;background:var(--card);font:inherit;cursor:pointer;position:relative;box-shadow:0 1px 0 rgba(0,0,0,.04),0 6px 16px -10px rgba(40,20,80,.35);transition:transform .18s cubic-bezier(.34,1.56,.64,1),box-shadow .2s;color:var(--ink)}
.ks-item:active{transform:scale(.93)}
.ks-item.on{box-shadow:0 0 0 2.5px var(--c),0 10px 20px -10px var(--c)}
.ks-item.off{opacity:.4;pointer-events:none}
.ks-thumb{height:58px;display:grid;place-items:center;margin-bottom:6px}
.ks-thumb>*{width:84px;max-height:58px;display:block}
.ks-thumb img{object-fit:contain;height:58px}
.ks-emoji{font-size:40px;line-height:58px;text-align:center}
.ks-item b{display:block;font-size:12px;font-weight:700;line-height:1.2;min-height:29px}
.ks-item small{display:block;font-size:11px;color:var(--mut);margin-top:2px;font-variant-numeric:tabular-nums}
.ks-tick{position:absolute;top:7px;right:7px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:var(--c);color:#fff;font-size:12px;font-weight:800;display:grid;place-items:center;transform:scale(0);transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.ks-item.on .ks-tick{transform:scale(1)}
.ks-less{position:absolute;top:7px;left:7px;width:22px;height:22px;border-radius:11px;background:rgba(0,0,0,.08);color:var(--ink);font-size:16px;font-weight:800;line-height:20px;display:none;text-align:center}
.ks-item.on.multi .ks-less{display:block}
.ks-foot{padding:0 12px 14px}
.ks-recap{font-size:12px;color:var(--mut);padding:0 6px 10px;min-height:28px;line-height:1.35}
.ks-cta{width:100%;border:0;border-radius:18px;padding:16px 18px;font:inherit;font-size:16px;font-weight:800;color:#fff;background:linear-gradient(180deg,var(--c2),var(--c));display:flex;justify-content:space-between;align-items:center;cursor:pointer;box-shadow:0 12px 24px -12px var(--c);transition:transform .15s,opacity .2s,filter .2s}
.ks-cta:active{transform:scale(.98)}
.ks-cta[disabled]{filter:grayscale(.7);opacity:.55;cursor:default}
.ks-cta span:last-child{font-variant-numeric:tabular-nums}
.ks-done{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;opacity:0;transition:opacity .3s;z-index:4}
.ks-done.on{opacity:1}
.ks-done div{background:rgba(255,255,255,.96);color:var(--c);font-weight:800;font-size:17px;border-radius:99px;padding:14px 22px;box-shadow:0 20px 40px -12px rgba(0,0,0,.45);transform:scale(.6);transition:transform .4s cubic-bezier(.34,1.56,.64,1)}
.ks-done.on div{transform:scale(1)}
.ks-spark{position:absolute;width:8px;height:8px;border-radius:2px;pointer-events:none;z-index:3}
.ks-table{position:absolute;inset:0}
.ks-surface{position:absolute;left:-6%;right:-6%;bottom:-2%;height:62%;border-radius:50% 50% 0 0/22% 22% 0 0;background:var(--surface,linear-gradient(180deg,#fbf6ea,#e9dfc9));box-shadow:inset 0 2cqw 4cqw rgba(255,255,255,.7),0 -2cqw 6cqw rgba(0,0,0,.35)}
.ks-prop{position:absolute;transform:translate(-50%,-100%);pointer-events:none;filter:drop-shadow(0 1.2cqw 1cqw rgba(0,0,0,.3))}
.ks-prop svg,.ks-prop img{display:block;width:100%;height:auto}
.ks-prop .ks-emoji{display:block;font-size:inherit;line-height:1}
.ks-count{position:absolute;right:-4%;top:-8%;min-width:6cqw;height:6cqw;padding:0 1.6cqw;border-radius:3cqw;background:#fff;color:var(--c);font-size:3.4cqw;font-weight:800;display:grid;place-items:center;box-shadow:0 1cqw 2cqw rgba(0,0,0,.3)}
@media (prefers-reduced-motion:reduce){.ks *{transition:none!important;animation:none!important}}
`;

  function mount(root, config, opts) {
    opts = opts || {};
    const assets = opts.assets || (typeof window !== 'undefined' && window.KOSH_ASSETS && window.KOSH_ASSETS[config.id]) || {};
    if (!document.getElementById('ks-css')) { const st = document.createElement('style'); st.id = 'ks-css'; st.textContent = CSS; document.head.appendChild(st); }
    const steps = config.steps;
    const all = {};
    steps.forEach(s => s.items.forEach(it => { it.step = s; all[it.k] = it; }));
    // sel : liste ordonnée des clés choisies (une clé répétée = quantité)
    let sel = [], cur = 0, busy = false;
    const count = k => sel.filter(x => x === k).length;
    const countStep = s => sel.filter(k => all[k].step === s).length;
    const closed = () => typeof opts.closed === 'function' ? opts.closed() : !!opts.closed;

    function price() {
      let p = +config.price || 0;
      steps.forEach(s => {
        const mine = s.items.filter(it => count(it.k));
        let free = s.free || 0;
        mine.forEach(it => { const q = count(it.k); if (it.tiers) { p += tier(it, q); return; } for (let i = 0; i < q; i++) { if (it.p && free-- <= 0) p += +it.p; else if (!it.p) free--; } });
      });
      return Math.round(p * 100) / 100;
    }
    // paliers : [[10,25],[1,3]] = 25 € les 10, 3 € l'unité
    function tier(it, q) { let p = 0; it.tiers.forEach(([n, pr]) => { p += Math.floor(q / n) * pr; q %= n; }); return p; }
    function missing() { return steps.find(s => countStep(s) < (s.min || 0)); }

    root.innerHTML = `<section class="ks" style="${Object.entries(config.theme || {}).map(([k, v]) => `--${k}:${v}`).join(';')}">
      <header class="ks-head"><div class="ks-logo">${config.logo ? `<img src="${esc(config.logo)}" alt="">` : esc(config.initial || config.brand[0])}</div>
        <div><h2>${esc(config.title)}</h2><p>${esc(config.brand)}${config.tagline ? ' · ' + esc(config.tagline) : ''}</p></div>
        <div class="ks-badge">${esc(config.priceLabel || 'Total')}<b></b></div></header>
      <div class="ks-stage"><div class="ks-tilt">${config.scene === 'table' ? '<div class="ks-table"><div class="ks-surface"></div></div>' : '<div class="ks-shadow"></div><div class="ks-pile"></div>'}</div>
        <div class="ks-hint"></div><div class="ks-tools"><button data-a="rand">✨ Surprends-moi</button><button data-a="reset">Recommencer</button></div>
        <div class="ks-done"><div></div></div></div>
      <nav class="ks-steps"></nav><div class="ks-sub"></div><div class="ks-items"></div>
      <footer class="ks-foot"><div class="ks-recap"></div><button class="ks-cta"><span></span><span></span></button></footer></section>`;
    const $ = q => root.querySelector(q);
    const stage = $('.ks-stage'), tilt = $('.ks-tilt'), pile = $('.ks-pile'), table = $('.ks-table');

    /* ----- Scène « pile » ----- */
    const nodes = new Map(); // id de couche → élément
    let seq = 0, layers = []; // {id,k}
    function layerEl(item, id) {
      const v = visual(item, assets), w = item.w || (v.photo ? 84 : 82);
      const el = document.createElement('div');
      el.className = 'ks-layer';
      el.style.width = w + 'cqw'; el.style.marginLeft = -w / 2 + 'cqw';
      el.innerHTML = v.html;
      el._h = w * v.ar; el._rise = item.rise != null ? item.rise : el._h * (item.riseK || .42);
      el.dataset.id = id;
      return el;
    }
    function drop(el, from) {
      if (reduce || !el.animate) return;
      el.animate([{ transform: `translateY(${from || -70}cqw) rotate(${(Math.random() - .5) * 16}deg)`, opacity: 0 }, { opacity: 1, offset: .3 }, { transform: 'translateY(0) rotate(0)' }], { duration: 520, easing: 'cubic-bezier(.3,1.35,.5,1)' });
    }
    function squash() { if (!reduce && pile.animate) pile.animate([{ scale: '1 1' }, { scale: '1.03 .94', offset: .55 }, { scale: '1 1' }], { duration: 420, easing: 'ease-out', delay: 260 }); }
    function layout() {
      // ordre : socle, couches choisies dans l'ordre des touches, couvercle
      const order = [];
      if (config.bottom) order.push(['__b', config.bottom]);
      layers.forEach(l => order.push([l.id, all[l.k]]));
      if (config.top) order.push(['__t', config.top]);
      const keep = new Set(order.map(o => String(o[0])));
      nodes.forEach((el, id) => { if (!keep.has(String(id))) { nodes.delete(id); if (reduce || !el.animate) el.remove(); else el.animate([{ opacity: 1 }, { transform: 'translate(40cqw,-30cqw) rotate(40deg)', opacity: 0 }], { duration: 300, easing: 'ease-in' }).onfinish = () => el.remove(); } });
      let y = 0, z = 0;
      order.forEach(([id, item]) => {
        let el = nodes.get(String(id));
        if (!el) { el = layerEl(item, id); nodes.set(String(id), el); el.style.bottom = y + 'cqw'; pile.appendChild(el); if (id !== '__b' && id !== '__t') drop(el); else if (seq) drop(el, -40); }
        el.style.bottom = y + 'cqw'; el.style.zIndex = ++z; el.style.transform = `translateZ(${z * .6}cqw)`;
        y += id === '__t' ? el._h : el._rise;
      });
      const room = 74; // hauteur utile en cqw
      pile.style.transform = `scale(${Math.min(1, room / Math.max(y, 1))})`;
    }

    /* ----- Scène « table » ----- */
    function tableRender(newKey) {
      const present = [...new Set(sel)];
      table.querySelectorAll('.ks-prop[data-k]').forEach(el => { if (!present.includes(el.dataset.k)) el.remove(); });
      present.forEach(k => {
        const item = all[k], q = count(k), spot = item.spot || [50, 80, 30];
        let el = table.querySelector(`.ks-prop[data-k="${k}"]`);
        if (!el) {
          const v = visual(item, assets);
          el = document.createElement('div'); el.className = 'ks-prop'; el.dataset.k = k;
          el.style.cssText = `left:${spot[0]}%;top:${spot[1]}%;width:${spot[2]}cqw;z-index:${Math.round(spot[1])};font-size:${spot[2] * .8}cqw`;
          el.innerHTML = v.html + '<span class="ks-count"></span>';
          table.appendChild(el);
        }
        const c = el.querySelector('.ks-count'); c.textContent = '×' + q * (item.unit || 1); c.style.display = q * (item.unit || 1) > 1 ? '' : 'none';
        if (k === newKey && !reduce && el.animate) el.animate([{ transform: 'translate(-50%,-260%) scale(.6) rotate(-12deg)', opacity: 0 }, { opacity: 1, offset: .35 }, { transform: 'translate(-50%,-100%) scale(1.08,.92)', offset: .7 }, { transform: 'translate(-50%,-100%)' }], { duration: 620, easing: 'cubic-bezier(.3,1.2,.5,1)' });
      });
    }
    if (table) (config.decor || []).forEach(d => {
      const el = document.createElement('div'); el.className = 'ks-prop';
      const v = visual(d, assets);
      el.style.cssText = `left:${d.spot[0]}%;top:${d.spot[1]}%;width:${d.spot[2]}cqw;z-index:${Math.round(d.spot[1])};font-size:${d.spot[2] * .8}cqw`;
      el.innerHTML = v.html; table.appendChild(el);
    });

    /* ----- Interface ----- */
    function sparks(color) {
      if (reduce || !stage.animate) return;
      for (let i = 0; i < 14; i++) {
        const s = document.createElement('i'); s.className = 'ks-spark'; s.style.background = i % 2 ? '#fff' : color || '#ffd66b'; s.style.left = '50%'; s.style.top = '55%'; stage.appendChild(s);
        const a = Math.random() * 6.28, d = 60 + Math.random() * 110;
        s.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d - 40}px) rotate(${Math.random() * 360}deg) scale(.2)`, opacity: 0 }], { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => s.remove();
      }
    }
    function render(newKey) {
      const p = price(), badge = $('.ks-badge b');
      if (badge.textContent !== fmt(p)) { badge.textContent = fmt(p); badge.classList.add('pop'); setTimeout(() => badge.classList.remove('pop'), 220); }
      $('.ks-steps').innerHTML = steps.map((s, i) => `<button class="ks-step ${i === cur ? 'on' : ''}" data-s="${i}">${esc(s.label)}<i>${countStep(s) || ''}</i></button>`).join('');
      const s = steps[cur];
      $('.ks-sub').textContent = s.hint || (s.max === 1 ? 'Un seul choix' : s.max ? `Jusqu’à ${s.max} au choix` : 'Autant que tu veux, c’est compris');
      const full = s.max && s.max > 1 && countStep(s) >= s.max;
      $('.ks-items').innerHTML = s.items.map(it => {
        const q = count(it.k), v = visual(it, assets);
        const sub = it.sub || (it.p ? '+' + fmt(it.p) : '');
        return `<button class="ks-item ${q ? 'on' : ''} ${s.qty ? 'multi' : ''} ${it.off || (full && !q) ? 'off' : ''}" data-k="${esc(it.k)}"><span class="ks-less" data-less="${esc(it.k)}">−</span><span class="ks-tick">${s.qty ? q * (it.unit || 1) : '✓'}</span><div class="ks-thumb">${v.html}</div><b>${esc(it.n)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
      }).join('');
      $('.ks-recap').textContent = steps.map(st => { const names = [...new Set(sel.filter(k => all[k].step === st))].map(k => (st.qty ? count(k) * (all[k].unit || 1) + ' × ' : '') + all[k].n); return names.length ? names.join(', ') : null; }).filter(Boolean).join(' · ');
      const cta = $('.ks-cta'), miss = missing();
      cta.disabled = closed() || !!miss || !sel.length;
      cta.firstElementChild.textContent = closed() ? 'Commandes fermées' : miss ? (miss.need || 'Choisis : ' + miss.label.toLowerCase()) : !sel.length ? (config.empty || 'Compose pour commander') : (config.cta || 'Ajouter à ma commande');
      cta.lastElementChild.textContent = sel.length && !miss ? fmt(p) : '';
      $('.ks-hint').textContent = sel.length > (config.preset || []).length ? '' : (config.hintText || 'Touche un ingrédient, il tombe dans ton sandwich');
      if (pile) layout(); else tableRender(newKey);
    }
    function add(k) {
      const it = all[k], s = it.step;
      if (s.qty) { sel.push(k); layers.push({ id: ++seq, k }); }
      else if (count(k)) { sel = sel.filter(x => x !== k); layers = layers.filter(l => l.k !== k); k = null; }
      else {
        if (s.max === 1) { sel = sel.filter(x => all[x].step !== s); layers = layers.filter(l => all[l.k].step !== s); }
        else if (s.max && countStep(s) >= s.max) return;
        sel.push(k); if (!it.noLayer) layers.push({ id: ++seq, k });
      }
      if (k && navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
      render(k); if (k && pile) squash();
    }
    function less(k) { const i = sel.lastIndexOf(k); if (i < 0) return; sel.splice(i, 1); const j = layers.map(l => l.k).lastIndexOf(k); if (j >= 0) layers.splice(j, 1); render(); }
    function reset(silent) { sel = (config.preset || []).slice(); layers = sel.filter(k => !all[k].noLayer).map(k => ({ id: ++seq, k })); cur = Math.max(0, steps.findIndex(s => !(s.max === 1 && s.items.length === 1))); if (!silent) render(); }
    function random() {
      reset(true);
      steps.forEach(s => { if (s.max === 1 && countStep(s)) return; const pool = s.items.filter(it => !it.off).sort(() => Math.random() - .5), n = s.max === 1 ? 1 : Math.min(pool.length, s.rand || 2); pool.slice(0, n).forEach(it => { if (!count(it.k)) { sel.push(it.k); if (!it.noLayer) layers.push({ id: ++seq, k: it.k }); } }); });
      render(); if (pile) squash();
    }
    function order() {
      if (busy || $('.ks-cta').disabled) return;
      busy = true;
      const line = { id: config.id, name: config.lineName || config.title, price: price(), items: [...new Set(sel)].map(k => ({ k, n: all[k].n, q: count(k) * (all[k].unit || 1) })), options: steps.map(st => { const names = [...new Set(sel.filter(k => all[k].step === st))].map(k => (st.qty ? count(k) * (all[k].unit || 1) + ' × ' : '') + all[k].n); return names.length ? `${st.label} : ${names.join(', ')}` : null; }).filter(Boolean) };
      sparks(); if (navigator.vibrate) try { navigator.vibrate([10, 40, 18]); } catch (e) {}
      const target = pile || table;
      if (!reduce && target.animate) target.animate([{ transform: getComputedStyle(target).transform, opacity: 1 }, { transform: 'translateY(8%) scale(.9)', offset: .25 }, { transform: 'translateY(70%) scale(.3)', opacity: 0 }], { duration: 650, easing: 'cubic-bezier(.5,0,.8,.4)' });
      const done = $('.ks-done'); done.firstElementChild.textContent = '✓ Ajouté à ta commande';
      setTimeout(() => { done.classList.add('on'); if (opts.onAdd) opts.onAdd(line); nodes.forEach(el => el.remove()); nodes.clear(); reset(); }, reduce ? 0 : 560);
      setTimeout(() => { done.classList.remove('on'); busy = false; }, 1900);
    }
    root.addEventListener('click', e => {
      const t = e.target.closest('[data-less],[data-k],[data-s],[data-a],.ks-cta');
      if (!t || busy) return;
      if (t.dataset.less) less(t.dataset.less);
      else if (t.dataset.k) add(t.dataset.k);
      else if (t.dataset.s) { cur = +t.dataset.s; render(); }
      else if (t.dataset.a === 'rand') random();
      else if (t.dataset.a === 'reset') reset();
      else order();
    });
    // inclinaison au doigt / à la souris : effet de profondeur
    function tiltTo(e) { const r = stage.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; tilt.classList.add('live'); tilt.style.transform = `rotateY(${f(x * 26)}deg) rotateX(${f(-y * 14)}deg)`; }
    if (!reduce) {
      stage.addEventListener('pointermove', tiltTo);
      ['pointerleave', 'pointerup', 'pointercancel'].forEach(ev => stage.addEventListener(ev, () => { tilt.classList.remove('live'); tilt.style.transform = ''; }));
    }
    reset();
    return { reset, random, price, selection: () => sel.slice() };
  }

  const api = { mount, fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.KoshSimulateur = api;
})();
