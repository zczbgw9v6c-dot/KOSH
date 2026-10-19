/* Porto Kitch arcade. Shared with the customer app; all scores are decimal strings. */
const arcade = (() => {
  const duration = 60 * 60 * 1000;
  const integer = value => /^\d+$/.test(String(value)) ? BigInt(value) : 0n;
  let finish = null;
  const saved = ls.get('pk-arcade-v1', { best: {} });
  const best = saved.best && typeof saved.best === 'object' ? saved.best : {};
  const total = () => Object.values(best).reduce((a, b) => a + integer(b), 0n);
  function expires(now = Date.now()) {
    return S.my.reduce((end, id) => {
      const order = store.orders[id];
      return order && order.st !== 'no' && Number.isFinite(order.t) && order.t <= now
        ? Math.max(end, order.t + duration) : end;
    }, 0);
  }
  const remaining = () => Math.max(0, expires() - Date.now());
  const allowed = () => remaining() > 0;
  const display = value => integer(value).toLocaleString(loc());
  const countdown = () => {
    const seconds = Math.ceil(remaining() / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };
  function record(key, score) {
    if (integer(score) > integer(best[key])) best[key] = String(score);
    ls.set('pk-arcade-v1', { best });
    const name = pname();
    if (name && total() > 0n) {
      const row = { n: name, p: String(total()), best: { ...best }, t: Date.now() };
      store.scores[pid] = row;
      put('scores/' + pid, row);
    }
  }
  function locked() {
    return `<h2>🎮 ${t('games')}</h2><div class="box"><h3>${t('arcadeLocked')}</h3><p class="mute">${t('arcadeRule')}</p><button class="btn gold" data-a="tab" data-v="list">${t('list')}</button></div>`;
  }
  // Wheelie Bradley is a bonus game: same one-hour window, local record only, never in the leaderboard.
  const bonus = key => key === 'wheel';
  const bonusLabel = () => { let local = 0; try { local = +(ls.get('pk-game', {}) || {}).wbest || 0; } catch {} return t('arcadeBonus') + (local ? ` · ${t('record')} ${local}` : ''); };
  function cards() {
    return Object.keys(GM).map(key => `<button class="dc" data-a="gplay" data-v="${key}"><span class="lg" style="background:var(--navy);font-size:42px">${GM[key][1]}</span><span class="dcb"><b>${GM[key][0]}</b><span class="mute">${bonus(key) ? bonusLabel() : `${t('endless')} · ${t('record')} ${display(best[key])}`}</span></span></button>`).join('');
  }
  function rankings() {
    // Stable user ids aggregate the three personal bests; names are never identities.
    return Object.entries(store.scores).map(([id, row]) => ({ id, ...row }))
      .filter(row => integer(row.p) > 0n)
      .sort((a, b) => integer(a.p) === integer(b.p) ? a.id.localeCompare(b.id) : integer(a.p) > integer(b.p) ? -1 : 1);
  }
  return { duration, integer, best, total, expires, remaining, allowed, display, countdown,
    record, locked, cards, rankings, bonusLabel, setFinish: fn => { finish = fn; },
    finish: () => { if (finish) { const fn = finish; finish = null; fn(); } } };
})();

Object.assign(T.fr, { arcadeBonus: 'Jeu bonus · hors classement', endless: 'Arcade sans fin', record: 'Record', arcadeLocked: 'Les jeux sont réservés aux clients ayant commandé', arcadeRule: 'Chaque commande ouvre une heure de jeu à compter de sa création. Une annulation ferme l’accès associé. Le temps continue lorsque vous quittez la page.', arcadeLeft: 'Temps de jeu restant', arcadeExpired: 'Votre heure de jeu est terminée', arcadeScore: 'Score', arcadeRanking: 'Classement par joueur', arcadeBest: 'Somme de vos meilleurs scores', arcadeEnd: 'Partie terminée · touchez pour rejouer', arcadeWelcome: 'Touchez pour commencer · score sans plafond' });
Object.assign(T.en, { arcadeBonus: 'Bonus game · not ranked', endless: 'Endless arcade', record: 'Best', arcadeLocked: 'Games unlock after you place an order', arcadeRule: 'Each order unlocks one hour from the time it is created. Cancelling an order closes its access. Time keeps running when you leave this page.', arcadeLeft: 'Play time remaining', arcadeExpired: 'Your hour of play has ended', arcadeScore: 'Score', arcadeRanking: 'Player leaderboard', arcadeBest: 'Sum of your personal bests', arcadeEnd: 'Game over · tap to retry', arcadeWelcome: 'Tap to start · unlimited score' });
Object.assign(T.pt, { arcadeBonus: 'Jogo bónus · fora da classificação', endless: 'Arcade sem fim', record: 'Recorde', arcadeLocked: 'Os jogos ficam disponíveis após uma encomenda', arcadeRule: 'Cada encomenda permite jogar durante uma hora desde a sua criação. O cancelamento encerra esse acesso. O tempo continua ao sair da página.', arcadeLeft: 'Tempo de jogo restante', arcadeExpired: 'A sua hora de jogo terminou', arcadeScore: 'Pontuação', arcadeRanking: 'Classificação por jogador', arcadeBest: 'Soma dos seus melhores resultados', arcadeEnd: 'Fim do jogo · toque para tentar de novo', arcadeWelcome: 'Toque para começar · pontuação sem limite' });
Object.assign(T.he, { arcadeBonus: 'משחק בונוס · מחוץ לדירוג', endless: 'ארקייד ללא סוף', record: 'שיא', arcadeLocked: 'המשחקים זמינים לאחר הזמנה', arcadeRule: 'כל הזמנה מעניקה שעה של משחק מרגע יצירתה. ביטול ההזמנה מבטל את הגישה שלה. הזמן ממשיך גם ביציאה מהדף.', arcadeLeft: 'זמן משחק שנותר', arcadeExpired: 'שעת המשחק הסתיימה', arcadeScore: 'ניקוד', arcadeRanking: 'דירוג שחקנים', arcadeBest: 'סכום השיאים האישיים', arcadeEnd: 'המשחק הסתיים · געו לניסיון נוסף', arcadeWelcome: 'געו להתחלה · ניקוד ללא הגבלה' });

vGames = function () {
  if (!arcade.allowed()) return arcade.locked();
  if (S.f.gname == null) S.f.gname = pname();
  return `<h2>🎮 ${t('games')}</h2><div class="info">${t('arcadeLeft')} : <b data-arcade-clock>${arcade.countdown()}</b></div><p class="mute">${t('arcadeRule')}</p><div class="hs">${arcade.cards()}</div><div class="box"><h3>${t('arcadeBest')} : ${arcade.display(arcade.total())}</h3><div class="row">${inp('gname', t('gname'))}<button class="btn sm" data-a="gname">${t('okB')}</button></div></div><div class="box"><h3>🏆 ${t('arcadeRanking')}</h3>${arcade.rankings().slice(0, 50).map((row, rank) => `<div class="tot"><span>${rank + 1}. ${esc(row.n)}${row.id === pid ? ` (${t('you')})` : ''}</span><b>${arcade.display(row.p)}</b></div>`).join('') || `<p class="mute">${t('noBoard')}</p>`}</div>`;
};
vGame = function () {
  if (!arcade.allowed()) return arcade.locked();
  const key = GM[S.gk] ? S.gk : 'spin';
  return `<div class="row sp"><button class="btn sm ghost" data-a="tab" data-v="games">‹ ${t('back')}</button><b>${GM[key][0]}</b></div><div class="info">${t('arcadeLeft')} : <b data-arcade-clock>${arcade.countdown()}</b></div><canvas id="gc" width="320" height="460" class="gc" tabindex="0" aria-label="${esc(GM[key][0])} — ${t('endless')}"></canvas><p class="mute">${t('g_' + key)}</p>`;
};
const originalHomeList = homeList;
homeList = function () {
  // Replace the original public level cards with order-gated arcade cards.
  const html = originalHomeList();
  const marker = '<section><h3>🎮 ';
  const index = html.indexOf(marker);
  return index < 0 ? html : html.slice(0, index) + (arcade.allowed()
    ? sec('🎮 ' + t('games'), arcade.cards()) : '');
};
const originalTabAction = A.tab;
A.tab = function (value) { arcade.finish(); return originalTabAction(value); };
A.gplay = function (value) {
  arcade.finish();
  if (!arcade.allowed()) { S.tab = 'games'; return; }
  S.gk = GM[value] ? value : 'spin'; S.tab = 'game';
};
pushScore = function () { arcade.record(S.gk || 'spin', arcade.best[S.gk || 'spin'] || '0'); };

startGame = function () {
  const canvas = document.getElementById('gc');
  if (!canvas || canvas._on || !arcade.allowed()) return;
  canvas._on = true;canvas._run=PK.run;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = 320, H = 460, TAU = Math.PI * 2, key = GM[S.gk] ? S.gk : 'spin';
  const ratio = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = W * ratio; canvas.height = H * ratio; ctx.scale(ratio, ratio);
  let score = 0n, state = 'ready', game = {}, last = null, elapsed = 0, progress = 0, alive = true;
  const replay=PK.replay;let seed=replay.seed>>>0,simTick=0,accumulator=0,pendingTap=false;
  function random(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;}
  const difficulty = () => 1 + Math.min(9, Math.log2(1 + progress / 8));
  const text = (value, size, X, Y, color = '#fff') => {
    ctx.font = `700 ${size}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.fillText(String(value), X, Y, W - 24);
  };
  const rect = (X, Y, width, height, color) => { ctx.fillStyle = color; ctx.fillRect(X, Y, width, height); };
  function init() {
    score = 0n; progress = 0;
    game = key === 'spin' ? { angle: 0, pins: [], fly: null, cycle: 0, cooldown: 0 }
      : key === 'stack' ? { blocks: [{ x: 85, w: 150 }], cur: { x: 0, w: 150, d: 1 }, placed: 0 }
      : { y: H / 2, vy: 0, gates: [], stars: [], next: 0 };
  }
  function save() { arcade.record(key, score); }
  function end() { if (state === 'play') save(); state = 'lose'; }
  const add = amount => { score += BigInt(amount); progress++; save(); };
  arcade.setFinish(() => { if (state === 'play') save(); alive = false;canvas._finished=true;replay.finished=true;pkFlushArcade(replay); });
  function tap() {
    if (!arcade.allowed()) { arcade.finish(); S.tab = 'games'; render(); return; }
    if (state !== 'play') { init(); state = 'play'; return; }
    if (key === 'spin') { if (!game.fly && elapsed >= game.cooldown) game.fly = 400; }
    else if (key === 'sky') game.vy = -290;
    else {
      const current = game.cur, top = game.blocks[game.blocks.length - 1];
      let left = Math.max(current.x, top.x), overlap = Math.min(current.x + current.w, top.x + top.w) - left;
      if (overlap <= 2) { end(); return; }
      const perfect = Math.abs(current.x - top.x) < 4;
      if (perfect) { left = top.x; overlap = top.w; }
      add(perfect ? 20 : 10); game.placed++;
      game.blocks.push({ x: left, w: overlap }); game.blocks = game.blocks.slice(-9);
      game.cur = { x: random() < .5 ? 0 : W - overlap, w: overlap, d: random() < .5 ? 1 : -1 };
    }
  }
  function update(dt) {
    const d = difficulty();
    if (key === 'spin') {
      const direction = progress > 20 && Math.sin(elapsed * .5) < 0 ? -1 : 1;
      game.angle = (game.angle + (1.3 + d * .22) * direction * dt + TAU) % TAU;
      if (game.fly !== null) {
        game.fly -= 950 * dt;
        if (game.fly <= 240) {
          const angle = ((Math.PI / 2 - game.angle) % TAU + TAU) % TAU;
          if (game.pins.some(pin => { const delta = Math.abs(pin - angle); return Math.min(delta, TAU - delta) < .27; })) { end(); return; }
          game.pins.push(angle); game.fly = null; game.cooldown = elapsed + .2; add(10);
          // Continue playing on a fresh pita. There is no level, win screen or score cap.
          if (game.pins.length >= 8) { game.pins = []; game.cycle++; }
        }
      }
    } else if (key === 'stack') {
      const c = game.cur; c.x += c.d * (110 + d * 32) * dt;
      if (c.x < 0) { c.x = 0; c.d = 1; }
      if (c.x > W - c.w) { c.x = W - c.w; c.d = -1; }
    } else {
      const gap = Math.max(100, 165 - d * 6), speed = 125 + d * 14;
      game.vy += 950 * dt; game.y += game.vy * dt; game.next -= speed * dt;
      if (game.next <= 0) {
        const center = gap / 2 + 40 + random() * (H - gap - 80);
        game.gates.push({ x: W + 30, center, gap }); game.next = 185;
      }
      for (const gate of game.gates) {
        gate.x -= speed * dt;
        if (!gate.passed && gate.x + 26 < 70) { gate.passed = true; add(10); }
        if (Math.abs(gate.x - 70) < 37 && (game.y - 11 < gate.center - gate.gap / 2 || game.y + 11 > gate.center + gate.gap / 2)) { end(); return; }
      }
      game.gates = game.gates.filter(gate => gate.x > -40);
      if (game.y < 14 || game.y > H - 12) end();
    }
  }
  function draw() {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#131c36'); gradient.addColorStop(1, key === 'stack' ? '#a8641f' : '#2b4c8c');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 32; i++) rect((i * 73) % W, (i * 41) % H, 2, 2, '#c9a24a');
    if (key === 'spin' && game.pins) {
      for (const pin of game.pins) {
        const angle = game.angle + pin;
        ctx.strokeStyle = '#d9b98a'; ctx.lineWidth = 4; ctx.beginPath();
        ctx.moveTo(160 + Math.cos(angle) * 62, 170 + Math.sin(angle) * 62);
        ctx.lineTo(160 + Math.cos(angle) * 116, 170 + Math.sin(angle) * 116); ctx.stroke();
        text('🥙', 20, 160 + Math.cos(angle) * 100, 170 + Math.sin(angle) * 100);
      }
      ctx.fillStyle = '#f4e6c6'; ctx.beginPath(); ctx.arc(160, 170, 68, 0, TAU); ctx.fill();
      text('✡', 68, 160, 170, '#c9a24a');
      if (state === 'play') text('🍢', 38, 160, game.fly === null ? 400 : game.fly);
    }
    if (key === 'stack' && game.blocks) {
      rect(0, H - 30, W, 30, '#fbf6ee');
      game.blocks.forEach((block, index) => {
        const y = H - 30 - (index + 1) * 28;
        rect(block.x, y, block.w, 26, index % 2 ? '#bf7a2a' : '#f0b860');
        text('≋', 22, block.x + block.w / 2, y + 13, '#7d4b20');
      });
      if (state === 'play') rect(game.cur.x, H - 30 - (game.blocks.length + 1) * 28 - 18, game.cur.w, 26, '#f4cf8d');
    }
    if (key === 'sky' && game.gates) {
      for (const gate of game.gates) {
        rect(gate.x - 26, 0, 52, gate.center - gate.gap / 2, '#cdbfa6');
        rect(gate.x - 26, gate.center + gate.gap / 2, 52, H - gate.center - gate.gap / 2, '#cdbfa6');
      }
      text('🕊️', 30, 70, game.y);
    }
    rect(0, 0, W, 42, '#131c36'); text(t('arcadeScore') + ' : ' + arcade.display(score), 18, 160, 21);
    if (state !== 'play') {
      rect(22, 110, W - 44, 230, '#fbf6ee');
      text(GM[key][1], 38, 160, 150); text(GM[key][0], 23, 160, 195, '#131c36');
      text(t('endless') + ' ∞', 16, 160, 230, '#7d6a62');
      text(t(state === 'ready' ? 'arcadeWelcome' : 'arcadeEnd'), 12, 160, 265, '#131c36');
      text(t('record') + ' : ' + arcade.display(arcade.best[key]), 16, 160, 307, '#131c36');
    }
  }
  function frame(ts) {
    if (!alive) return;
    if (document.getElementById('gc') !== canvas) { if (state === 'play') save(); alive = false; return; }
    if (!arcade.allowed()) { arcade.finish(); S.tab = 'games'; render(); return; }
    const dt = last===null?0:Math.min(.25,Math.max(0,(ts-last)/1000));last=ts;
    if(!document.hidden){accumulator+=dt;while(accumulator>=1/60){accumulator-=1/60;simTick++;elapsed=simTick/60;if(pendingTap){pendingTap=false;replay.taps.push(simTick);tap();}if(state==='play')update(1/60);replay.tick=simTick;}}
    draw(); requestAnimationFrame(frame);
  }
  canvas.addEventListener('pointerdown', event => { event.preventDefault(); pendingTap=true; });
  canvas.addEventListener('keydown', event => { if (event.code === 'Space' || event.code === 'ArrowUp') { event.preventDefault(); pendingTap=true; } });
  init(); requestAnimationFrame(frame);
};

setInterval(() => {
  if (S.tab !== 'game' && S.tab !== 'games') return;
  if (!arcade.allowed()) { arcade.finish(); if (S.tab === 'game') S.tab = 'games'; render(); return; }
  document.querySelectorAll('[data-arcade-clock]').forEach(clock => { clock.textContent = arcade.countdown(); });
}, 1000);
window.addEventListener('pagehide', () => arcade.finish());
render();
