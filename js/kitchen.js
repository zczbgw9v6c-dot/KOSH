/* Lot 5a, restaurant: kitchen mode, one function for promotions and gifts, enriched tickets, pre-orders.
   Line grouping and priorities live in professional.js (used by every order view). Prices, stock, codes and counters stay decided by the server; this file only presents and calls it. */

const pkDue = o => o.st === 'prep' && o.prepEta ? o.prepEta : o.scheduledAt || o.t;

/* R10: kitchen mode. Large cards readable from a distance on iPhone and Mac; one tap enlarges one order. */
PK.kitchen = false; PK.kitchenFocus = null; PK.kitchenFilter = 'all';
const pkKitchenFilters = [['new', 'Nouvelles', o => ['pay','decl'].includes(o.st)], ['cook', 'À préparer', o => o.paid && ['ok', 'prep'].includes(o.st)], ['ready', 'Prêtes', o => ['ready', 'go'].includes(o.st)], ['all', 'Toutes en cours', o => !['done', 'no'].includes(o.st)]];
function pkKitchenNext(o) {
  if (o.st === 'pay' || o.st === 'decl') return ['ok', 'Accepter · paiement reçu'];
  if (o.st === 'ok') return ['prep', 'Commencer la préparation'];
  if (o.st === 'prep') return ['ready', 'Commande prête'];
  if (o.st === 'ready' && o.mode !== 'deliv') return ['done', o.mode === 'uber' ? 'Remise au coursier Uber' : 'Remise au client'];
  return null; // Kosh delivery: per-part handover stays in the detailed view (sacs et livreurs)
}
function pkKitchenCard(o, id, focus) {
  const [rank, why] = pkPriority(o), next = pkKitchenNext(o), late = o.st === 'prep' && o.prepEta && pkTime() > o.prepEta;
  const mode = o.mode === 'deliv' ? '🚲 Livraison Kosh' : o.mode === 'uber' ? '📦 Uber Colis' : '🛍 Retrait';
  const due = o.st === 'prep' && o.prepEta ? `Prête vers <b>${pkClock(o.prepEta)}</b>${late ? ' · en retard' : ''}` : `${/^\d\d:\d\d$/.test(o.when || '') ? 'Pour ' + esc(o.when) : esc(whenL(o.when)) + (o.scheduledAt ? ' · ' + pkClock(o.scheduledAt) : '')}`;
  const lines = pkGroupLines(o.lines).map(line => `<li><span class="pk-k-q">${esc(line.q)}×</span><span class="pk-k-n">${esc(line.n)}${(line.o || []).length ? `<small>${line.o.map(esc).join(' · ')}</small>` : ''}${line.inc?.length ? `<small>Inclus : ${line.inc.map(esc).join(' · ')}</small>` : ''}${line.note ? `<small class="pk-k-note">« ${esc(line.note)} »</small>` : ''}</span></li>`).join('');
  const gift = o.giftLine ? `<li class="pk-k-gift"><span class="pk-k-q">${esc(o.giftLine.q)}×</span><span class="pk-k-n">🎁 ${esc(o.giftLine.n)} <small>Offert${o.promo ? ' · code ' + esc(o.promo) : ''}</small>${o.giftLine.inc?.length ? `<small>Inclus : ${o.giftLine.inc.map(esc).join(' · ')}</small>` : ''}</span></li>` : o.gift ? `<li class="pk-k-gift"><span class="pk-k-q">🎁</span><span class="pk-k-n">${esc(o.gift)} <small>Offert</small></span></li>` : '';
  const client = `<p class="pk-k-client"><b>${esc(o.name)}</b> · <a class="customer-call" href="tel:${esc(String(o.tel || '').replace(/[^+0-9]/g, ''))}">Appeler · ${esc(o.tel)}</a>${o.addr && o.mode === 'deliv' ? `<br>${esc(o.addr)}` : ''}</p>`;
  return `<article class="pk-k-card${rank < 5 ? ' urgent' : ''}${focus ? ' focus' : ''}" data-order="${esc(id)}"><header><b class="pk-k-code">#${esc(o.code)}</b><span class="pill ${o.st === 'ready' || o.st === 'go' ? 'ok' : 'gold'}">${esc(stLabel(o))}</span></header>${rank < 5 ? `<p class="pk-k-why">⚠️ ${esc(why)}</p>` : ''}<p class="pk-k-meta">${mode} · ${due}</p>${client}<ul class="pk-k-lines">${lines}${gift}</ul>${o.note ? `<p class="pk-k-note-order">📝 ${esc(o.note)}</p>` : ''}${o.paid ? '' : `<p class="payment-reminder">Vérifiez la réception du paiement avant d’accepter.</p><p class="pill bad">${o.st === 'decl' ? 'Paiement déclaré · à vérifier' : 'En attente de paiement'}</p>`}<div class="pk-k-actions">${next ? pkButton(next[1], 'status', id + ':' + next[0]) : ''}${['pay','decl'].includes(o.st)?`<details class="restaurant-refusal"><summary>Refuser la commande</summary>${inp('reason_'+id,'Motif du refus')}${pkButton('Confirmer le refus','cancel-order',id,'danger')}</details>`:''}${focus ? pkButton('Ticket', 'ticket', id, 'ghost') + pkButton('Retour à la cuisine', 'kitchen-focus', '', 'ghost') : pkButton('Agrandir', 'kitchen-focus', id, 'ghost')}</div></article>`;
}
function pkKitchen() {
  const all = Object.entries(store.orders || {});
  if (PK.kitchenFocus && store.orders?.[PK.kitchenFocus]) return `<section class="pk-kitchen">${pkKitchenBar(all)}${pkKitchenCard(store.orders[PK.kitchenFocus], PK.kitchenFocus, true)}</section>`;
  const test = (pkKitchenFilters.find(f => f[0] === PK.kitchenFilter) || pkKitchenFilters[0])[2];
  // Urgent first (priorities), then the earliest due time.
  const rows = all.filter(([, o]) => test(o)).sort((a, b) => pkPriority(a[1])[0] - pkPriority(b[1])[0] || pkDue(a[1]) - pkDue(b[1]));
  return `<section class="pk-kitchen">${pkKitchenBar(all)}<div class="pk-k-grid">${rows.map(([id, o]) => pkKitchenCard(o, id, false)).join('') || '<p class="pk-k-empty">Rien à préparer pour le moment.</p>'}</div></section>`;
}
function pkKitchenBar(all) {
  return `<div class="pk-k-bar"><b class="pk-k-title">Mode cuisine · ${pkClock(pkTime() || Date.now())}</b><div class="seg">${pkKitchenFilters.map(([key, label, test]) => `<button data-a="pk" data-v="kitchen-filter" data-id="${key}" aria-pressed="${PK.kitchenFilter === key && !PK.kitchenFocus}">${label} · ${all.filter(([, o]) => test(o)).length}</button>`).join('')}</div>${pkButton('Quitter le mode cuisine', 'kitchen', '0', 'ghost')}</div>`;
}
const pkOrdersList = pkOrders;
pkOrders = function () { return PK.portal !== 'driver' && PK.kitchen ? pkKitchen() : pkOrdersList(); };

/* R69-R77: one function for promotions and gifts. Codes are created and (de)activated through /api/promo; the
   server keeps the counters. Changing an offer means creating a new code; nothing resets or deletes a counter. */
function pkPromoOffer(p, mid) {
  if (p.kind === 'gift') { const g = items(mid).find(i => i.id === p.giftId); return `🎁 ${esc(p.giftQ || 1)} × ${esc(g?.n || 'produit retiré de la carte')} offert${(p.giftQ || 1) > 1 ? 's' : ''}`; }
  return `Réduction de ${esc(+p.pct || 0)} %`;
}
function pkPromos(mid) {
  const promos = Object.entries(mdoc(mid).promos || {}).filter(([, p]) => p && typeof p === 'object').sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0) || (a[0] < b[0] ? -1 : 1));
  const kind = S.f.promoKind === 'gift' ? 'gift' : 'percent';
  const rows = promos.map(([code, p]) => {
    const used = +p.used || 0, max = +p.max || 0, active = p.active !== false, out = used >= max;
    const state = !active ? ['bad', 'Désactivé'] : out ? ['bad', 'Épuisé'] : ['ok', 'Actif'];
    return `<div class="item pk-promo"><div class="grow"><b>${esc(code)}</b> · ${pkPromoOffer(p, mid)}<br><span class="pill ${state[0]}">${state[1]}</span> <span class="mute">${used} / ${max} utilisation${max > 1 ? 's' : ''} · ${Math.max(0, max - used)} restante${max - used > 1 ? 's' : ''}</span></div>${pkButton(active ? 'Désactiver' : 'Réactiver', 'promo-active', JSON.stringify([mid, code, !active]), 'ghost')}</div>`;
  }).join('');
  const giftable = items(mid).filter(i => !i.menuChoices?.length);
  const fields = kind === 'gift' ? `${pkSelect('promoGift', 'Produit offert', giftable.map(i => [i.id, i.n + (i.components?.length ? ' (menu)' : '')]), S.f.promoGift || giftable[0]?.id)}${inp('promoGiftQ', 'Quantité offerte (1 à 50)', 'number')}` : `<label for="f-promoPct">Réduction en % (1 à 100)<input id="f-promoPct" data-f="promoPct" type="number" inputmode="numeric" min="1" max="100" step="1" required value="${esc(S.f.promoPct||'')}"><small>Une réduction diminue le prix. Exemple : 20 % sur 10 € = 8 €.</small></label>`;
  return `<div class="box pk-promos" data-pk-panel="Promotions et cadeaux"><h3>Promotions et cadeaux</h3><p class="mute">Réductions et produits offerts dans une seule liste. Le code est vérifié à la commande ; le cadeau et ses composants ne sont réservés qu’à l’enregistrement d’une commande qui l’utilise. Pour changer une offre, créez un nouveau code : les utilisations déjà comptées restent visibles.</p>${rows || '<p class="mute">Aucun code pour le moment.</p>'}<details${promos.length ? '' : ' open'}><summary>Créer un code</summary>${pkSelect('promoKind', 'Type', [['percent', 'Réduction en pourcentage'], ['gift', 'Produit offert']], kind)}${inp('promoCode', 'Code (3 à 16 lettres ou chiffres)')}${fields}${inp('promoMax', 'Nombre total d’utilisations', 'number')}${pkButton('Créer le code', 'promo-create', mid)}</details></div>`;
}
const pkRestaurantBase = pkRestaurant;
pkRestaurant = function () { return PK.me && PK.tab === 'promos' ? pkPromos(S.pro) : pkRestaurantBase(); };
// The historical buttons can no longer delete a code (its counter) nor create a code outside the single function.
A.pdel = function () { PK.error = 'Un code ne se supprime pas : désactivez-le dans « Promotions ».'; };
A.padd = function () { PK.tab = 'promos'; };

/* Tickets (R14, R13): grouped lines, included products and the gift to prepare appear on the printed ticket. */
const pkTicketBase = vTicket;
vTicket = function () {
  const o = store.orders?.[S.tk];
  if (!o || !Array.isArray(o.lines)) return pkTicketBase();
  const gift = o.giftLine ? [{ n: '🎁 Offert : ' + o.giftLine.n, q: o.giftLine.q, p: 0, o: (o.giftLine.inc || []).map(x => 'Inclus : ' + x) }] : o.gift ? [{ n: '🎁 Offert : ' + o.gift, q: 1, p: 0, o: [] }] : [];
  store.orders[S.tk] = { ...o, lines: [...pkGroupLines(o.lines).map(l => ({ ...l, o: [...(Array.isArray(l.o) ? l.o : []), ...(l.inc || []).map(x => 'Inclus : ' + x)] })), ...gift] };
  try { return pkTicketBase(); } finally { store.orders[S.tk] = o; }
};

/* R85: from the pre-order start (Porto time) until the opening, the restaurant is reachable, not greyed out, and
   « Précommande » is shown. Chabbat, a closed service and a closed restaurant keep it closed. */
function pkPortoNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(PK.serverTime ? pkTime() : Date.now())).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
function pkPreorder(mid) {
  const d = mdoc(mid), s = d.effectiveService;
  if (!s || !s.preordersAt || d.closed || s.open === false || (typeof shabbat === 'function' && shabbat().closed)) return false;
  const now = pkPortoNow();
  if (now < s.preordersAt) return false;
  if (s.opensAt) return now < s.opensAt;
  // No programmed opening: pre-orders cover the rest of that day while the restaurant is outside its hours.
  return s.preordersAt.slice(0, 10) === now.slice(0, 10) && typeof isOpen === 'function' && !!merch(mid) && !isOpen(merch(mid));
}
const pkPreorderNote = mid => { const s = mdoc(mid).effectiveService || {}; return `<div class="info kosh-preorder"><span class="pill gold">Précommande</span> Commandes ouvertes : préparation ${s.opensAt ? 'à partir du ' + esc(s.opensAt.replace('T', ' à ')) : 'dès l’ouverture, à ' + esc(hours(mid)[0])} (heure de Porto).</div>`; };
if (typeof vResto === 'function') { const pkRestoBase = vResto; vResto = function (sh) { const html = pkRestoBase(sh); return PK.portal === 'client' && S.rid && pkPreorder(S.rid) ? (/<span class="pill">[^<]*<\/span><\/div><\/div><\/div>/.test(html) ? html.replace(/(<span class="pill">[^<]*<\/span><\/div><\/div><\/div>)/, '$1' + pkPreorderNote(S.rid)) : pkPreorderNote(S.rid) + html) : html; }; }

const pkKitchenActions = A.pk;
A.pk = function (action, button) {
  const id = button?.dataset.id || '';
  if (action === 'kitchen') { PK.kitchen = id === '1'; PK.kitchenFocus = null; render(); scrollTo(0, 0); return false; }
  if (action === 'kitchen-filter') { PK.kitchenFilter = id; PK.kitchenFocus = null; render(); return false; }
  if (action === 'kitchen-focus') { PK.kitchenFocus = id || null; render(); scrollTo(0, 0); return false; }
  if (action === 'promo-create') return pkDo(async () => {
    const kind = S.f.promoKind === 'gift' ? 'gift' : 'percent', code = String(S.f.promoCode || '').trim().toUpperCase(), max = Number(S.f.promoMax);
    if (!/^[A-Z0-9]{3,16}$/.test(code)) throw new Error('Code : 3 à 16 lettres ou chiffres, sans espace.');
    if (!Number.isInteger(max) || max < 1) throw new Error('Indiquez le nombre total d’utilisations (entier).');
    const body = { merchant: id, action: 'create', code, kind, max };
    if (kind === 'percent') { body.pct = Number(S.f.promoPct); if (!Number.isInteger(body.pct) || body.pct < 1 || body.pct > 100) throw new Error('La réduction doit être un entier entre 1 et 100 %.'); }
    else { const giftable = items(id).filter(i => !i.menuChoices?.length); body.giftId = S.f.promoGift || giftable[0]?.id; body.giftQ = Number(S.f.promoGiftQ || 1); }
    await pkApi('/api/promo', body);
    Object.assign(S.f, { promoCode: '', promoPct: '', promoGiftQ: '', promoMax: '' }); PK.notice = `Code ${code} créé. Aucun stock n’est réservé tant qu’une commande ne l’utilise pas.`;
  });
  if (action === 'promo-active') return pkDo(async () => {
    const [merchant, code, active] = JSON.parse(id);
    await pkApi('/api/promo', { merchant, action: 'active', code, active });
    PK.notice = active ? `Code ${code} réactivé.` : `Code ${code} désactivé : ses utilisations restent comptées.`;
  });
  return pkKitchenActions(action, button);
};
document.addEventListener('change', event => { if (event.target?.dataset?.f === 'promoKind') { S.f.promoKind = event.target.value; render(); } });
const pkKitchenRender = render;
render = function () {
  pkKitchenRender();
  const on = PK.portal !== 'client' && PK.portal !== 'driver' && PK.kitchen && PK.tab === 'orders' && !PK.ticket && !!PK.me;
  document.body?.classList?.[on ? 'add' : 'remove']('pk-kitchen-on');
};
