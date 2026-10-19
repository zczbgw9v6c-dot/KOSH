/* Dedicated Porto Kitch applications share the catalogue, components and branding. */
const PK = {
  portal: ({ '/restaurant': 'restaurant', '/livreur': 'driver', '/ceo': 'ceo' })[location.pathname] || 'client',
  data: null, me: null, busy: false, error: '', notice: '', tab: 'orders',
  watch: null, tracking: false, lastGPS: 0, online: true, serverTime: 0, syncAt: 0,
  gameExpires: 0, run: null,
  notifications: false, knownOrders: new Set(),
};
const pkRoles = { restaurant: 'Restaurateur', driver: 'Livreur', ceo: 'CEO · Associés' };
async function pkApi(path, body) {
  const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin', headers: {'X-PK-Portal':PK.portal,...(body ? {'Content-Type':'application/json'} : {})},
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Connexion interrompue.');
  return data;
}
function pkTime() { return PK.serverTime + Math.max(0, performance.now() - PK.syncAt); }
async function pkSync() {
  try {
    const data = await pkApi('/api/bootstrap?portal=' + PK.portal);
    const newIds = Object.keys(PK.portal==='driver'?(data.offers||{}):data.orders).filter(id => !PK.knownOrders.has(id));
    if (PK.data && PK.notifications && newIds.length) {
      beep();
      if (typeof pkLocalNotify === 'function') pkLocalNotify(`${newIds.length} nouvelle(s) ${PK.portal === 'driver' ? 'course(s)' : 'commande(s)'}`);
    }
    const receiptOpened=typeof pkQueueReceipts==='function'&&pkQueueReceipts(data,PK.data);
    const identityChanged=PK.me?.id!==data.me?.id;
    PK.knownOrders = new Set(Object.keys(PK.portal==='driver'?(data.offers||{}):data.orders));
    if(identityChanged){PK.credential=null;PK.initialized=false;}
    PK.data = data; PK.me = data.me; PK.serverTime = data.time; PK.syncAt = performance.now();
    PK.gameExpires = data.gameExpires; if (!PK.online) PK.error = ''; PK.online = true;
    Object.assign(store, { menus: data.menus, orders: data.orders, events: data.events, scores: data.scores, conf: data.conf });
    if (PK.portal === 'client') {
      S.my = Object.keys(data.orders); pid = data.client;
      if(PK.clientID!==data.client){S.f.gname=data.scores[data.client]?.n||data.clientAccount?.name||pname();PK.clientID=data.client;}
      const best = data.scores[data.client]?.best || {};
      Object.keys(arcade.best).forEach(key => delete arcade.best[key]); Object.assign(arcade.best, best);
    }
    if (PK.me?.role === 'restaurant') {
      S.pro = PK.me.merchant;
      if (!PK.initialized) { const menu=mdoc(S.pro);Object.assign(S.f,{s_rev:menu.rev||'',s_type:menu.type||'none',s_h1:hours(S.pro)[0],s_h2:hours(S.pro)[1],pickupAddress:'',prepMinutes:String(data.prep?.[S.pro]?.minutes??15)});PK.initialized=true; }
    }
    if (PK.portal === 'driver' && PK.me) {
      const mine = Object.values(store.orders).flatMap(order => (order.parts || []).map(part => ({ order, part })));
      const active = mine.some(({ order, part }) => ['accepted', 'collected'].includes(part.state) && !['no', 'done'].includes(order.st));
      pkGpsSync(active, identityChanged);
      // « Commande prête » reaches every courier holding an accepted part, including parts accepted after the event.
      const ready = mine.filter(({ order, part }) => part.state === 'accepted' && ['ready', 'go'].includes(order.st)).map(({ order }) => order.id);
      const fresh = ready.filter(oid => !(PK.readySeen || new Set()).has(oid));
      if (PK.readySeen && fresh.length && PK.notifications) { beep(); if (typeof pkLocalNotify === 'function') pkLocalNotify('Commande prête : vos sacs vous attendent.'); }
      if (PK.readySeen && fresh.length) PK.notice = 'Commande prête : vos sacs vous attendent au restaurant.';
      PK.readySeen = new Set(ready);
    }
    if (['restaurant', 'ceo'].includes(PK.portal) && PK.me) {
      // Lot 3: missing courier (5 / 15 min) and customer cancellation requests, through the existing foreground alert.
      const keys = Object.entries(data.orders).flatMap(([oid, o]) => [o.courierAlert ? `${oid}:alert${o.courierAlert.level}` : '', o.cancelRequest?.state === 'pending' ? `${oid}:cancel` : '', o.pickupOffer?.state === 'refused' ? `${oid}:pickup-refused` : ''].filter(Boolean));
      const fresh = keys.filter(key => !(PK.alertSeen || new Set()).has(key));
      if (PK.alertSeen && fresh.length) {
        const text = fresh.some(k => k.endsWith(':alert15')) ? 'Alerte renforcée : commande payée sans livreur depuis 15 min.' : fresh.some(k => k.endsWith(':cancel')) ? 'Un client demande l’annulation de sa commande.' : fresh.some(k => k.endsWith(':alert5')) ? 'Commande payée sans livreur depuis 5 min.' : 'Le client a refusé le retrait : la livraison est maintenue.';
        PK.notice = text;
        if (PK.notifications) { beep(); if (typeof pkLocalNotify === 'function') pkLocalNotify(text); }
      }
      PK.alertSeen = new Set(keys);
    }
    if (PK.portal === 'driver' && PK.me) pkTourAuto();
    if (receiptOpened || identityChanged || S.tab !== 'game' && !document.activeElement?.matches('input,textarea,select')) render();
  } catch (error) {
    PK.online = false;
    if (/Connexion requise|Connectez-vous/.test(error.message)) { const wasAuthenticated = !!PK.me; PK.me = null; S.pro = null; PK.data = null; PK.credential=null; PK.error=''; PK.initialized=false; if (PK.portal !== 'client') store.orders = {}; if (wasAuthenticated || !document.querySelector('[data-pk-form=login]')) render(); return; }  // A19: private data dropped at once
    else PK.error = error.message;
    if (S.tab !== 'game' && !document.activeElement?.matches('input,textarea,select')) render();
  }
}
async function pkDo(fn) {
  if (PK.busy) return;
  PK.busy = true; PK.error = ''; PK.notice = ''; render();
  try { await fn(); await pkSync(); } catch (error) { PK.error = error.message; }
  finally { PK.busy = false; render(); }
}
const pkButton = (label, action, value = '', kind = 'gold') => `<button class="btn sm ${kind}" data-a="pk" data-v="${esc(action)}" data-id="${esc(value)}" ${PK.busy ? 'disabled' : ''}>${label}</button>`;
const pkSelect = (key, label, rows, value = S.f[key]) => `<label>${label}<select data-f="${key}">${rows.map(([id, title]) => `<option value="${esc(id)}" ${String(value || '') === String(id) ? 'selected' : ''}>${esc(title)}</option>`).join('')}</select></label>`;
const pkArea = (key, label, value = S.f[key] || '') => `<label>${label}<textarea data-f="${key}" rows="4">${esc(value)}</textarea></label>`;
const pkDate = timestamp => timestamp ? new Date(timestamp).toLocaleString(loc(), { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Non annoncé';
const pkMerchants = () => D.map(m => [m.id, m.name]);
/* A12: a real form, so password managers fill it and Enter submits; values are read from the form on submit
   (autofill may not fire input events) and polling never re-renders while a field has the focus. */
function pkLogin() {
  return `<h2>${pkRoles[PK.portal]}</h2><form class="box pk-login" data-pk-form="login" method="post" action="#" autocomplete="on"><h3>Bienvenue dans votre espace</h3><p class="mute">${PK.portal === 'ceo' ? 'Accès individuel réservé aux associés autorisés.' : 'Connectez-vous avec le compte transmis par les associés.'}</p><label for="f-pk_login">Adresse e-mail<input type="email" id="f-pk_login" name="username" data-f="pk_login" value="${esc(S.f.pk_login || '')}" autocomplete="username" autocapitalize="none" spellcheck="false" inputmode="email" required></label><label for="f-pk_password">Mot de passe<input type="password" id="f-pk_password" name="password" data-f="pk_password" value="${esc(S.f.pk_password || '')}" autocomplete="current-password" required></label><label class="row"><input type="checkbox" name="remember" data-pk-remember ${S.f.pk_remember?'checked':''}> Rester connecté pendant 30 jours</label><button type="submit" class="btn sm gold" ${PK.busy ? 'disabled' : ''}>Se connecter</button></form><a class="btn ghost" href="/">Retour à KOSH</a>`;
}
/* Lot 4: per-courier position and arrivals, for the CEO and the concerned restaurant only (never sent to customers). */
const pkGpsStates = { live: ['ok', 'GPS en direct'], recent: ['gold', 'Dernier point récent'], stale: ['bad', 'Position ancienne'], interrupted: ['bad', 'Suivi interrompu'], none: ['bad', 'Aucune position reçue'], busy: ['gold', 'En course pour une autre enseigne · position masquée'] };
/* Uber Colis is off until a CEO enables it (provisional default); the other modes are on unless disabled. */
const pkModeOff = (service, key) => key === 'uber' ? service[key] !== true : service[key] === false;
/* I-5: the server reserves the Google address search to a customer with a cart in progress. */
const pkAddressCart = () => ({ m: S.cartR, lines: (typeof lines === 'function' ? lines() : []).map(i => ({ id: i.id, q: i.q })) });
const pkAge = ms => ms < 60000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60000)} min`;
function pkGPS(order) {
  const parts = (order.parts || []).filter(p => ['accepted', 'collected'].includes(p.state));
  const announced = order.etaSource === 'manual' && (order.st === 'go' ? order.deliveryEta : order.pickupEta) ? `<p class="mute">Horaire annoncé : <b>${pkDate(order.st === 'go' ? order.deliveryEta : order.pickupEta)}</b></p>` : '';
  if (!parts.length) return `<div class="info"><b>🚲 ${esc(order.driverName || 'Livreur non affecté')}</b>${announced}</div>`;
  return `<div class="info pk-gps">${parts.map(part => {
    const pos = part.position || { state: 'none' }, [kind, label] = pkGpsStates[pos.state] || pkGpsStates.none, eta = part.eta;
    const detail = pos.latitude != null ? `<span class="mute">Dernier point ${pkClock(pos.fixAt || pos.updatedAt)} (il y a ${pkAge(pos.ageMs || 0)}) · précision ${Math.round(pos.accuracy || 0)} m${pos.state === 'interrupted' ? ' · partage arrêté' : ''}</span> <a href="https://www.google.com/maps/search/?api=1&query=${pos.latitude},${pos.longitude}" target="_blank" rel="noopener noreferrer">Voir ↗</a>` : '';
    const times = !eta ? '<span class="mute">Pas encore d’estimation Google pour ce livreur.</span>' : eta.fresh ? `${part.state === 'accepted' && eta.pickup ? `Collecte ≈ <b>${pkClock(eta.pickup)}</b> · ` : ''}${eta.delivery ? `Livraison ≈ <b>${pkClock(eta.delivery)}</b>` : ''} <span class="mute">(durées Google, calcul ${pkClock(eta.at)})</span>` : `<span class="mute">Estimation à actualiser (calculée à ${pkClock(eta.at)}).</span>`;
    return `<div class="pk-part"><div class="row sp"><b>🚲 ${esc(part.driverName)} · ${pkSacs(part.bags)}</b><span class="pill ${kind}">${label}</span></div><p>${times}</p>${detail}</div>`;
  }).join('')}${announced}</div>`;
}
const pkPartStates = { proposed: 'Proposée · en attente du livreur', accepted: 'Acceptée · à récupérer', collected: 'Récupérée · en livraison', delivered: 'Livrée', released: 'Libérée', cancelled: 'Annulée' };
const pkSacs = n => `${n} sac${n > 1 ? 's' : ''}`;
function pkParts(order, id) {
  const d = order.delivery || {}, parts = order.parts || [], isDriver = PK.portal === 'driver', active = !['done', 'no'].includes(order.st), ready = ['ready', 'go'].includes(order.st);
  const summary = d.unknownLoad ? '<p class="alert">Nombre de sacs non renseigné : charge inconnue, aucun livreur ne peut encore accepter.</p>' : `<div class="pk-bags"><span class="pill">${pkSacs(d.bags)}</span><span class="pill ${d.remaining ? 'gold' : 'ok'}">${d.remaining ? d.remaining + ' à attribuer' : 'Tous attribués'}</span><span class="pill">${d.delivered}/${d.bags} livrés</span></div>`;
  if (isDriver) {
    return `<div class="info"><b>Ma part</b>${parts.map(part => `<div class="pk-part mine"><div class="row sp"><b>${pkSacs(part.bags)}</b><span class="pill ${part.state === 'delivered' ? 'ok' : 'gold'}">${pkPartStates[part.state]}</span></div>${part.state === 'accepted' ? `${ready ? '' : `<p class="mute">En préparation : vous serez prévenu dès que la commande est prête.</p>`}<div class="row">${ready ? pkButton('Sacs récupérés · partir', 'part-collect', id + ':' + part.id) : part.heading_at ? '<span class="pill">En route pour la collecte</span>' : pkButton('Je vais collecter', 'part-heading', id + ':' + part.id, 'ghost')}</div><details><summary>Annuler ma course</summary><p class="mute">Vos sacs seront proposés à un autre livreur. La vente n’est pas annulée.</p>${inp('reason_' + id, 'Motif (obligatoire)')}${pkButton('Annuler ma course', 'part-release', id + ':' + part.id, 'danger')}</details>` : part.state === 'collected' ? `<div class="row">${pkButton('Confirmer la livraison de mes sacs', 'part-deliver', id + ':' + part.id)}</div>` : ''}</div>`).join('')}${d.bags ? `<p class="mute">Commande : ${pkSacs(d.bags)}${d.remaining ? ` · ${d.remaining} encore sans livreur` : ''}</p>` : ''}</div>`;
  }
  const editable = active && !parts.some(part => ['collected', 'delivered'].includes(part.state));
  const rows = parts.map(part => `<div class="pk-part"><div class="row sp"><b>${esc(part.driverName)} · ${pkSacs(part.bags)}</b><span class="pill ${part.state === 'delivered' ? 'ok' : ['released', 'cancelled'].includes(part.state) ? 'bad' : 'gold'}">${pkPartStates[part.state]}</span></div>${part.release_reason ? `<p class="mute">Motif : ${esc(part.release_reason)}</p>` : ''}${part.state === 'accepted' && ready ? `<div class="row">${pkButton('Sacs remis à ' + part.driverName, 'part-collect', id + ':' + part.id, 'ghost')}</div>` : part.state === 'collected' ? `<div class="row">${pkButton('Confirmer la livraison', 'part-deliver', id + ':' + part.id, 'ghost')}</div>` : ''}</div>`).join('');
  return `<div class="info"><div class="row sp"><b>Sacs et livreurs</b>${d.state === 'partially_delivered' ? '<span class="pill gold">Partiellement livrée</span>' : ''}</div>${summary}${rows || (d.unknownLoad ? '' : '<p class="mute">Aucun livreur pour le moment.</p>')}${editable ? `<details${d.unknownLoad ? ' open' : ''}><summary>${d.unknownLoad ? 'Indiquer le nombre de sacs' : 'Modifier le nombre de sacs'}</summary>${inp('bagcount_' + id, 'Nombre de sacs (entier, sans limite)', 'number')}${pkButton('Enregistrer les sacs', 'bags-save', id)}</details>` : ''}</div>`;
}
/* Lot 3: preparation estimate, couriers missing, pickup proposal, customer cancellation request, declared refund. */
const pkClock = timestamp => new Date(timestamp).toLocaleTimeString(loc(), { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' });
function pkPrepLine(order) {
  if(PK.portal==='client')return '';
  if (order.st === 'prep' && order.prepEta) return `<p class="info">⏱ Fin de préparation estimée : <b>${pkClock(order.prepEta)}</b> · délai ${order.prepMinutes} min${pkTime() > order.prepEta ? ' · <b>dépassée</b>' : ''}</p>`;
  if (['ready', 'go'].includes(order.st) && order.readyAt) return `<p class="mute">Prête à ${pkClock(order.readyAt)}${order.prepSeconds ? ` · préparation ${Math.round(order.prepSeconds / 60)} min` : ''}</p>`;
  return '';
}
function pkWorkflow(order, id) {
  if (PK.portal === 'driver') return '';
  let html = '';
  const a = order.courierAlert, offer = order.pickupOffer, request = order.cancelRequest;
  if (a) {
    const bags = a.unknownLoad ? 'nombre de sacs non renseigné' : a.partial ? `${pkSacs(a.bags)} sans livreur sur ${order.delivery?.bags}` : `${pkSacs(a.bags)} sans livreur`;
    html += `<div class="alert pk-courier-alert" data-level="${a.level}"><b>${a.level >= 15 ? '⚠️ Alerte renforcée' : '⚠️ Alerte'} · aucun livreur depuis ${a.minutes} min</b><br>${bags}.${a.level >= 15 ? ' Vous pouvez proposer le retrait au client ; rien n’est converti ni annulé automatiquement.' : ''}</div>`;
    if (a.pickupProposable && offer?.state !== 'pending' && !(order.parts || []).some(p => ['collected', 'delivered'].includes(p.state))) html += `<div class="row">${pkButton(offer?.state === 'refused' ? 'Proposer à nouveau le retrait' : 'Proposer le retrait au client', 'pickup-offer', id, 'ghost')}</div>`;
  }
  if (offer && order.mode === 'deliv') html += `<p class="info">Proposition de retrait ${offer.state === 'pending' ? 'envoyée · en attente de la réponse du client' : offer.state === 'refused' ? 'refusée par le client : la livraison est maintenue' : 'acceptée'} (${pkDate(offer.answeredAt || offer.t)})</p>`;
  if (order.conversion) html += `<div class="info"><b>Livraison convertie en retrait</b> avec l’accord du client (${pkDate(order.conversion.at)}). Frais inchangés (${eur(order.conversion.fee || 0)}) : ${esc(order.conversion.note)}.</div>`;
  if (request?.state === 'pending') html += `<div class="alert pk-cancel-request"><b>Le client demande l’annulation</b> (${pkDate(request.t)}). Accepter restitue le stock et signale un remboursement manuel ; refuser envoie le message standard.<div class="row">${pkButton('Accepter l’annulation', 'cancel-accept', id, 'danger')}${pkButton('Refuser', 'cancel-refuse', id, 'ghost')}</div></div>`;
  else if (request) html += `<p class="mute">Demande d’annulation du client ${request.state === 'refused' ? 'refusée · message standard envoyé' : 'acceptée'} (${pkDate(request.decidedAt)}).</p>`;
  if (order.refund) html += order.refundedAt ? `<p class="pill ok">Remboursement déclaré effectué · ${pkDate(order.refundedAt)}</p>` : `<div class="alert">Remboursement manuel à effectuer<div class="row">${pkButton('Remboursement effectué', 'refunded', id, 'ghost')}</div></div>`;
  return html;
}
function pkPrepBox(mid) {
  const prep = PK.data?.prep?.[mid]; if (!prep) return '';
  const p = prep.proposal, min = s => `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`;
  const proposal = !p ? `<p class="mute">Après vos 20 premières préparations mesurées (début → prête), leur médiane vous sera proposée. Elle ne s’applique qu’avec votre accord.</p>`
    : `<div class="${p.state === 'pending' ? 'info' : 'mute'}"><b>Proposition : ${p.minutes} min</b> (médiane ${min(p.medianSeconds)} sur ${p.count} préparations valides, de ${min(p.minSeconds)} à ${min(p.maxSeconds)}, ${pkDate(p.from)} → ${pkDate(p.to)}). Délai au moment de la proposition : ${p.currentMinutes} min.${p.state === 'pending' ? (PK.portal === 'restaurant' ? `<div class="row">${pkButton('Appliquer ' + p.minutes + ' min', 'prep-accept', mid)}${pkButton('Garder ' + prep.minutes + ' min', 'prep-refuse', mid, 'ghost')}</div>` : '<br>En attente de la décision du restaurateur.') : `<br>${p.state === 'accepted' ? 'Acceptée' : 'Refusée'} le ${pkDate(p.decidedAt)}.`}<details><summary>Préparations mesurées</summary>${p.samples.map(r => `<span class="pill">#${esc(r.code)} · ${min(r.seconds)}</span>`).join(' ')}</details></div>`;
  return `<div class="box pk-prep"><h3>Temps de préparation · ${prep.minutes} min</h3><p class="mute">Sert à l’heure de fin estimée affichée uniquement au restaurant, aux CEO et aux livreurs concernés.</p>${inp('prepMinutes', 'Temps de préparation (1 à 180 minutes)', 'number')}${pkButton('Enregistrer le temps', 'prep-set', mid, 'ghost')}${proposal}</div>`;
}
/* Lot 5a: grouping of identical lines, included products, gifts, filters and priorities (also used by js/kitchen.js). */
/* R12: two lines merge only when product, options (any order), instructions, menu choices, included products and
   unit price are all identical. Anything different stays on its own line. */
function pkLineKey(line) {
  const options = (Array.isArray(line.o) ? line.o : []).map(String).sort();
  const choices = Object.entries(line.choices || {}).filter(([, q]) => +q > 0).map(([id, q]) => [id, +q]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return JSON.stringify([line.id ?? '', line.n ?? '', options, String(line.note || '').trim(), choices, line.inc || [], +line.p || 0]);
}
function pkGroupLines(lines) {
  const rows = [], seen = new Map();
  for (const line of Array.isArray(lines) ? lines : []) {
    const key = pkLineKey(line);
    if (seen.has(key)) seen.get(key).q += +line.q || 0;
    else { const row = { ...line, q: +line.q || 0 }; seen.set(key, row); rows.push(row); }
  }
  return rows;
}
/* R13-R14: products included in a fixed menu, and the gift to prepare (with its own components). */
const pkIncluded = line => Array.isArray(line.inc) && line.inc.length ? `<br><span class="mute pk-inc">Inclus : ${line.inc.map(esc).join(' · ')}</span>` : '';
function pkGiftLine(order) {
  const g = order.giftLine;
  if (g) return `<div class="info pk-gift"><b>🎁 Offert à préparer : ${esc(g.q)} × ${esc(g.n)}</b>${g.inc?.length ? `<br><span class="mute">Inclus : ${g.inc.map(esc).join(' · ')}</span>` : ''}${order.promo ? `<br><span class="mute">Code ${esc(order.promo)}</span>` : ''}</div>`;
  return order.gift ? `<div class="info pk-gift"><b>🎁 Offert à préparer : ${esc(order.gift)}</b></div>` : '';
}
/* R05: list filters. */
function pkFilterMatch(o, filter) {
  if (filter === 'all') return true;
  if (filter === 'pay') return !o.paid && o.st !== 'no';
  if (filter === 'ready') return ['ready', 'go'].includes(o.st);
  if (filter === 'done') return ['done', 'no'].includes(o.st);
  return !['done', 'no'].includes(o.st);
}
/* R08: rank 0-4 are priorities (badge + top of the list); 5 is a normal active order; 9 is archived. */
function pkPriority(o) {
  if (['done', 'no'].includes(o.st)) return [9, ''];
  if (o.cancelRequest?.state === 'pending') return [0, 'Demande d’annulation du client'];
  const alert = o.courierAlert;
  if (alert && alert.level >= 15) return [1, `aucun livreur depuis ${alert.minutes} min`];
  if (o.st === 'decl') return [2, 'paiement déclaré à vérifier'];
  if (alert) return [3, `aucun livreur depuis ${alert.minutes} min`];
  if (o.st === 'prep' && o.prepEta && pkTime() > o.prepEta) return [4, 'préparation en retard'];
  return [5, ''];
}
function pkOrder(order, id) {
  const isDriver = PK.portal === 'driver', mid = order.m, m = merch(mid);
  const pickup = mid==='chabad-porto' ? 'Adresse communiquée par le restaurant' : (mdoc(mid).address || 'Adresse à renseigner par le restaurant');
  const next = { pay: ['ok', 'Valider le paiement'], decl: ['ok', 'Valider le paiement'], ok: ['prep', 'Commencer la préparation'], prep: ['ready', 'Commande prête à être récupérée'], ready: [order.mode === 'deliv' ? 'go' : 'done', order.mode === 'deliv' ? 'Commande récupérée · partir' : order.mode === 'uber' ? 'Remise au coursier Uber' : 'Confirmer la remise au client'], go: ['done', 'Confirmer la livraison'] }[order.st];
  // Delivery handover and completion happen per part (pkParts); couriers never use order-level transitions.
  const canNext = next && !isDriver && !(order.mode === 'deliv' && ['ready', 'go'].includes(order.st));
  const active = !['done', 'no'].includes(order.st);
  const links = (address, lat, lon) => { const point = lat != null && lon != null ? `${(+lat).toFixed(6)},${(+lon).toFixed(6)}` : address; return `<div class="row"><a class="btn sm ghost" href="https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(point)}" target="_blank" rel="noopener noreferrer">Google Maps ↗</a><a class="btn sm ghost" href="https://maps.apple.com/?daddr=${encodeURIComponent(point)}&dirflg=d" target="_blank" rel="noopener noreferrer">Plans ↗</a><a class="btn sm ghost" href="https://waze.com/ul?${lat != null && lon != null ? 'll=' + encodeURIComponent(point) : 'q=' + encodeURIComponent(address)}&navigate=yes" target="_blank" rel="noopener noreferrer">Waze ↗</a></div>`; };
  const [rank, why] = pkPriority(order);
  return `<article data-order-id="${esc(id)}" class="box${rank < 5 ? ' pk-urgent' : ''}">${rank < 5 && !isDriver ? `<p class="pill bad pk-priority">Prioritaire · ${esc(why)}</p>` : ''}<div class="row sp"><h3>#${esc(order.code)} · ${esc(m.name)}</h3><span class="pill ${order.st === 'done' ? 'ok' : order.st === 'no' ? 'bad' : 'gold'}">${order.delivery?.state === 'partially_delivered' && order.st !== 'done' ? 'Partiellement livrée' : stLabel(order)}</span></div><p><b>${esc(order.name)}</b> · <a href="tel:${esc(order.tel.replace(/[^+0-9]/g, ''))}">${esc(order.tel)}</a></p><p class="mute">${pkDate(order.t)} · ${whenL(order.when)}</p>${isDriver ? `<div class="info"><b>Collecte · ${esc(m.name)}</b><p>${esc(pickup)}</p>${mid === 'chabad-porto' || !mdoc(mid).address ? '' : links(pickup, mdoc(mid).lat, mdoc(mid).lon)}</div>` : ''}<p><b>${order.mode === 'deliv' ? 'Livraison Porto Kitch' : order.mode === 'uber' ? 'Uber Colis organisé par le client' : 'Retrait sur place'}</b>${order.addr ? `<br>${esc(order.addr)}` : ''}</p>${isDriver && order.addr ? links(order.addr, order.addressVerified ? order.destLat : null, order.addressVerified ? order.destLon : null) : ''}${pkGroupLines(order.lines).map(line => `<div class="tot"><span>${line.q} × ${esc(line.n)}${lo(line)}${pkIncluded(line)}</span><b>${eur(line.p * line.q)}</b></div>`).join('')}${pkGiftLine(order)}<div class="tot big"><span>Total</span><b>${eur(order.total)}</b></div>${order.note ? `<p class="info">${esc(order.note)}</p>` : ''}<p class="pill ${order.paid ? 'ok' : 'gold'}">${order.paid ? 'Paiement validé' : order.st === 'decl' ? 'Paiement déclaré · à vérifier' : 'En attente de paiement'}</p>${isDriver && order.refund ? '<div class="alert">Remboursement manuel à effectuer</div>' : ''}${order.recv ? '<p class="pill ok">Réception confirmée par le client</p>' : ''}${order.why ? `<p class="alert">${esc(order.why)}</p>` : ''}${pkPrepLine(order)}${pkWorkflow(order, id)}${order.mode === 'deliv' ? pkParts(order, id) : ''}${order.mode === 'deliv' && !isDriver ? pkGPS(order) : ''}${PK.portal === 'ceo' && active && order.mode === 'deliv' && order.st !== 'go' ? `<details><summary>Affecter un livreur</summary><p class="mute">Proposition au livreur : il doit l’accepter. Service et capacité sont vérifiés à l’acceptation.</p>${pkSelect('assign_' + id, 'Livreur', [['', 'Choisir'], ...(PK.data?.drivers || []).filter(d => d.active).map(d => [d.id, d.name + (d.service ? ` · ${d.service.open ? 'service ouvert' : 'service fermé'} · ${d.service.available} place(s)` : '')])], S.f['assign_' + id] || '')}${inp('assignbags_' + id, `Sacs proposés (${order.delivery?.remaining ?? 0} libres)`, 'number')}${inp('eta_' + id, 'Collecte dans (minutes)', 'number')}${pkButton('Proposer la part', 'dispatch', id)}</details>` : ''}<div class="row">${canNext ? pkButton(next[1], 'status', id + ':' + next[0]) : ''}${!isDriver ? pkButton('Ticket', 'ticket', id, 'ghost') : ''}</div>${active && !isDriver ? `<details><summary>Horaire et autres actions</summary>${inp('eta_' + id, order.st === 'go' ? 'Livraison dans (minutes)' : 'Collecte dans (minutes)', 'number')}${pkButton('Actualiser l’arrivée', 'eta', id, 'ghost')}${!isDriver ? `${inp('msg_' + id, 'Message visible par le client')}${pkButton('Publier le message', 'message', id, 'ghost')}` : ''}${inp('reason_' + id, 'Motif d’annulation')}${pkButton('Annuler la commande', 'cancel-order', id, 'danger')}</details>` : ''}${(order.claims || []).map((claim, index) => `<div class="info"><b>Réclamation · ${esc(t('c_' + claim.k))}</b><p>${esc(claim.txt)}</p>${claim.rep ? `<p>Réponse : ${esc(claim.rep)}</p>` : !isDriver ? `${inp('rep_' + id + '_' + index, 'Votre réponse')}${pkButton('Répondre', 'reply', id + ':' + index)}` : ''}</div>`).join('')}${order.message ? `<p class="info">${esc(order.message)}</p>` : ''}</article>`;
}
function pkOrders() {
  const filter = PK.portal==='driver'?'active':S.f.pk_filter || 'active', query = PK.portal==='driver'?'':nz(S.f.pk_search || '');
  const all = Object.entries(store.orders).sort((a, b) => b[1].t - a[1].t);
  // R08: cancellation requests, long waits without courier and declared payments come first, then the newest.
  const rows = all.filter(([id, o]) => pkFilterMatch(o, filter) && nz(o.name + ' ' + o.addr + ' ' + o.code + ' ' + (merch(o.m)?.name || '')).includes(query)).sort((a, b) => pkPriority(a[1])[0] - pkPriority(b[1])[0] || b[1].t - a[1].t);
  const paid = all.filter(([, o]) => o.paid && o.st === 'done');
  return `${PK.portal==='driver'?pkOffers():''}<div class="stats"><div><b>${all.filter(([, o]) => !['done', 'no'].includes(o.st)).length}</b><span class="mute">À traiter</span></div><div><b>${all.filter(([, o]) => !o.paid && o.st !== 'no').length}</b><span class="mute">À vérifier</span></div><div><b>${eur(paid.reduce((a, [, o]) => a + o.total, 0))}</b><span class="mute">Payées et livrées</span></div></div>${PK.portal==='driver'?'':`<div class="box pk-filters"><div class="row sp"><h3>Commandes</h3>${pkButton('Mode cuisine', 'kitchen', '1')}</div>${pkSelect('pk_filter', 'Afficher', [['active', 'En cours'], ['pay', 'Paiement à vérifier'], ['ready', 'Prêtes'], ['done', 'Archives (terminées, annulées)'], ['all', 'Toutes']])}${inp('pk_search', 'Nom, adresse, référence ou restaurant')}<div class="row">${pkButton('Rechercher', 'filter', '', 'ghost')}${pkButton('Actualiser', 'refresh', '', 'ghost')}</div></div>`}${rows.map(([id, order]) => pkOrder(order, id)).join('') || '<div class="box"><h3>Tout est calme ici</h3><p class="mute">Les nouvelles commandes apparaîtront automatiquement.</p></div>'}`;
}
function pkService(mid) {
  const service = mid ? mdoc(mid).service || {} : PK.data?.config || {};
  return `<div class="box"><h3>Service ${service.open === false ? 'fermé' : 'ouvert'}</h3><p class="mute">La clôture bloque uniquement les nouvelles commandes. Les commandes déjà reçues ou payées restent à préparer et à livrer. Les archives restent accessibles.</p><div class="row">${pkButton(service.open === false ? 'Ouvrir un nouveau service' : 'Clôturer le service', service.open === false ? 'service-open' : 'service-close', mid || '')}<a class="btn sm ghost" href="/api/report?portal=${PK.portal}${mid ? '&merchant=' + mid : ''}" download>Compte rendu CSV</a></div></div><div class="box"><h3>Modes de réception</h3><p class="mute">Chaque mode se règle séparément. Les réglages généraux CEO s’appliquent à toutes les enseignes. ${PK.portal==='ceo'?'La livraison Kosh exclut Uber Colis, activable uniquement par les CEO.':''}</p>${[['glo','Livraison Kosh · 3,50 €'],['pickup','Retrait sur place · 0,50 €'],...(PK.portal==='ceo'?[['uber','Uber Colis · sans frais Kosh']]:[])].map(([key,label])=>`<div class="item"><div class="grow"><b>${label}</b><br><span class="pill ${pkModeOff(service,key)?'bad':'ok'}">${pkModeOff(service,key)?'Désactivé':'Activé'}${key==='uber'&&(mid?mdoc(mid).effectiveService?.glo:service.glo!==false)?' · suspendu par la livraison':''}</span></div>${pkButton(pkModeOff(service,key)?'Activer':'Désactiver','mode-toggle',JSON.stringify([mid||'',key]),'ghost')}</div>`).join('')}</div><div class="box"><h3>Précommandes et ouverture</h3>${inp('preordersAt', 'Début des précommandes · heure de Porto', 'datetime-local')}${inp('opensAt', 'Ouverture · heure de Porto', 'datetime-local')}${inp('serviceDelay', 'Délai après ouverture (minutes)', 'number')}${pkButton('Enregistrer les horaires', 'schedule', mid || '', 'ghost')}</div>`;
}
function pkMenuTools(mid) {
  const products = items(mid);
  return `<div class="box"><h3>Formule à composition fixe</h3><p class="mute">Exemple : un sandwich précis + une boisson précise, à prix fixe. Indiquez la quantité de chaque produit inclus ; laissez 0 pour les autres.</p><p class="mute">Les portions incluses réservent le stock des produits. Le menu est indisponible si ses composants sont épuisés.</p>${inp('bundleName', 'Nom du menu')}${inp('bundlePrice', 'Prix (€)', 'number')}${products.filter(i => !i.components?.length).map(i => `<label class="tot"><span>${esc(i.n)}</span><input style="max-width:80px" data-f="bundle_${esc(i.id)}" type="number" min="0" max="50" value="${esc(S.f['bundle_' + i.id] || '')}" placeholder="0"></label>`).join('')}${pkButton('Ajouter ce menu', 'bundle', mid)}</div>`;
}
const originalPro = vPro;
function pkLegacyPro(){
  let html=originalPro().replace(/<div class="row sp"><h2>[\s\S]*?<\/div>/,'').replace(/<div class="seg">(?=[\s\S]*?data-a="ptab")[\s\S]*?<\/div>/,'');
  // R69: the historical percentage-code box is replaced by the single promotions function (tab « Promotions »).
  html=html.replace(/<div class="box"><h3>[^<]*<\/h3>(?:(?!<div class="box">)[\s\S])*?data-a="padd"[\s\S]*?<\/button><\/div>/,'');
  if(S.ptab==='menu')return '<section data-pk-panel="Carte et stocks">'+html+'</section>';
  return html.replace('<div class="box">','<div class="box" data-pk-panel="Informations du restaurant">');
}
function pkRestaurant() {
  if (!PK.me) return pkLogin();
  if (PK.tab === 'orders') return (PK.data?.prep?.[S.pro]?.proposal?.state === 'pending' ? pkPrepBox(S.pro) : '') + pkOrders();
  if (PK.tab === 'menu') { S.ptab = 'menu'; return '<div class="menu-guide"><h3>Gérer ma carte</h3><p>Modifiez un article pour changer son prix, ses options ou sa photo. Pour une formule, choisissez une composition fixe ou des catégories au choix ci-dessous. Les stocks des produits inclus restent liés.</p><div class="row"><button class="btn sm gold" data-a="eadd">Ajouter un produit</button><button class="btn sm ghost" data-a="pk" data-v="menu-compose" data-id="fixed">Formule fixe</button><button class="btn sm ghost" data-a="pk" data-v="menu-compose" data-id="choice">Formule au choix</button></div></div>' + pkLegacyPro() + pkMenuTools(S.pro); }
  S.ptab = 'set';
  return pkLegacyPro() + `${pkPickupBox(S.pro)}` + pkPrepBox(S.pro) + pkService(S.pro) + (typeof pnPanel === 'function' ? pnPanel() : '') + pkPasswordForm();
}
function pkDriverServices() {
  const drivers = (PK.data?.drivers || []).filter(d => d.active);
  return `<div class="box"><h3>Services des livreurs</h3><p class="mute">Ouvrir le service d’un livreur pour la tournée lui donne accès aux courses. Le fermer bloque les nouvelles acceptations : ses parts en cours restent terminables et il reste connecté. La désactivation du compte est une action distincte.</p>${drivers.map(d => { const c = d.service || { open: false, capacity: 5, load: 0, available: 5 }; return `<div class="item"><div class="grow"><b>${esc(d.name)}</b><br><span class="pill ${c.open ? 'ok' : 'bad'}">${c.open ? 'Service ouvert' : 'Service fermé'}</span> <span class="pill">${c.load}/${c.capacity} sacs · ${c.available} libre${c.available > 1 ? 's' : ''}</span></div><div>${pkButton(c.open ? 'Fermer le service' : 'Ouvrir le service', 'driver-service', d.id + ':' + (c.open ? '0' : '1'), c.open ? 'ghost' : 'gold')}${pkSelect('cap_' + d.id, 'Capacité', Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i + 1)]), S.f['cap_' + d.id] ?? String(c.capacity))}${pkButton('Régler', 'driver-capacity', d.id, 'ghost')}</div></div>`; }).join('') || '<p class="mute">Aucun livreur actif.</p>'}</div>`;
}
function pkAccounts() {
  return `${pkDriverServices()}<div class="box"><h3>Comptes et invitations</h3><p class="mute">Seuls les associés peuvent créer ces comptes. Aucun compte CEO ne peut être créé depuis la page publique. Les mots de passe professionnels sont conservés dans un coffre chiffré, consultable uniquement par les CEO. Leur copie est tentée automatiquement à la création.</p>${inp('accountName', 'Nom')}${inp('accountEmail', 'Adresse e-mail', 'email')}${pkSelect('accountRole', 'Rôle', [['restaurant', 'Restaurateur'], ['driver', 'Livreur'], ['ceo', 'Associé CEO']])}${(S.f.accountRole || 'restaurant') === 'restaurant' ? pkSelect('accountMerchant', 'Établissement du restaurateur', pkMerchants()) : ''}${pkButton('Créer le compte', 'account')}<div>${(PK.data?.accounts || []).map(account => `<div class="item"><div class="grow"><b>${esc(account.name)}</b><br>${esc(account.login)}<br><span class="pill">${esc(pkRoles[account.role])}</span> ${account.active ? '' : '<span class="pill bad">Désactivé</span>'}</div>${account.active&&account.role!=='client'?pkButton('Afficher le mot de passe','credential-show',account.id,'ghost'):''}${account.id !== PK.me.id ? `<div>${pkButton('Nouveau mot de passe', 'account-reset', account.id, 'ghost')}${account.active ? pkButton('Désactiver', 'account-disable', account.id, 'danger') : pkButton('Réactiver', 'account-enable', account.id, 'ghost')}</div>` : '<span class="pill ok">Votre compte</span>'}</div>`).join('')}</div></div>`;
}
function pkCEO() {
  if (!PK.me) return pkLogin();
  const mid=S.f.ceoMerchant || D[0].id;
  if (PK.tab === 'orders') return pkOrders();
  if (PK.tab === 'accounts') return pkAccounts();
  if (PK.tab === 'finance' || PK.tab === 'studio') { PK.tab = 'orders'; return pkOrders(); }
  if (PK.tab === 'history') return pkAuditBox() + pkArchives() + `<div class="box"><h3>Versions des cartes</h3>${Object.values(PK.data.history || {}).sort((a,b)=>b.t-a.t).map(v=>`<div class="item"><div class="grow"><b>${esc(v.note || 'Réglages')}</b><br>${pkDate(v.t)}</div>${pkButton('Restaurer','restore',v.id,'ghost')}</div>`).join('') || '<p>Aucune version antérieure.</p>'}</div>`;
  if (PK.tab === 'menus') {
    S.pro=mid;S.ptab=S.f.ceoMenuTab || 'menu';
    if (PK.prepFor !== mid && PK.data?.prep?.[mid]) { S.f.prepMinutes = String(PK.data.prep[mid].minutes); PK.prepFor = mid; }
    return `<div class="box" data-pk-fixed>${pkSelect('ceoMerchant','Établissement',pkMerchants())}${pkSelect('ceoMenuTab','Gestion',[['menu','Carte et stocks'],['set','Réglages et promotions']])}${pkButton('Ouvrir','filter','','ghost')}</div>`+pkLegacyPro()+pkMenuTools(mid)+(typeof pkPromos==='function'?pkPromos(mid):'')+pkPrepBox(mid)+pkPickupBox(mid)+pkService(mid);
  }
  if (PK.tab === 'agenda') { S.org = true; return pkAgendaAdmin() + pkCaljBox() + `<div class="box"><h3>Aperçu public</h3></div>` + vAgenda(); }
  return pkService('')+pkGoogleSettings()+(typeof pnPanel==='function'?pnPanel()+pnStatusCEO():'')+pkPasswordForm();
}
/* C21/C27: readable operations journal (who, what, when) and service archives with their CSV. */
const pkAuditLabels = { 'account.create': 'Compte créé', 'account.reset': 'Mot de passe réinitialisé', 'account.disable': 'Compte désactivé', 'account.enable': 'Compte réactivé', 'account.password': 'Mot de passe changé', 'credential.view': 'Coffre consulté', 'courier.open': 'Service livreur ouvert', 'courier.close': 'Service livreur fermé', 'courier.capacity': 'Capacité livreur', 'event.create': 'Événement ajouté', 'event.update': 'Événement modifié', 'event.remove': 'Événement supprimé', 'calj.config': 'Réglage CalJ', 'push.subscribe': 'Notifications activées', 'push.unsubscribe': 'Notifications désactivées' };
function pkAuditDetail(detail) {
  let value = {}; try { value = typeof detail === 'string' ? JSON.parse(detail || '{}') : detail || {}; } catch { value = {}; }
  const names = Object.fromEntries((PK.data?.accounts || []).map(a => [a.id, a.name]));
  return Object.entries(value).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object').map(([k, v]) => `${esc(k)} : ${esc(k === 'account' ? names[v] || v : v)}`).join(' · ');
}
function pkAuditBox() {
  const rows = PK.data?.audit || [];
  return `<div class="box" data-pk-panel="Journal des opérations"><h3>Journal des opérations</h3><p class="mute">100 dernières opérations, dont chaque consultation du coffre. Aucun mot de passe n’y figure.</p>${rows.map(a => `<div class="item"><div class="grow"><b>${esc(pkAuditLabels[a.action] || a.action)}</b> · ${esc(a.actorName || '')}<br><span class="mute">${pkDate(a.created)}${a.detail && a.detail !== '{}' ? ' · ' + pkAuditDetail(a.detail) : ''}</span></div></div>`).join('') || '<p class="mute">Aucune opération.</p>'}</div>`;
}
function pkArchives() {
  const reports = Object.values(PK.data?.reports || {}).sort((a, b) => b.closedAt - a.closedAt);
  return `<div class="box" data-pk-panel="Archives des services"><h3>Archives des services clôturés</h3><p class="mute">Chaque clôture conserve l’état des commandes à cet instant. Les archives ne sont jamais supprimées.</p>${reports.map(r => `<div class="item"><div class="grow"><b>${esc(r.merchant ? merch(r.merchant)?.name || r.merchant : 'Service général')}</b><br><span class="mute">${pkDate(r.closedAt)} · ${(r.snapshot || []).length} commande(s) archivée(s)</span></div><a class="btn sm ghost" href="/api/report?portal=ceo&id=${esc(r.id)}" download>CSV</a></div>`).join('') || '<p class="mute">Aucune clôture archivée.</p>'}<a class="btn sm ghost" href="/api/report?portal=ceo" download>Compte rendu CSV de toutes les commandes</a></div>`;
}
/* C70-C73: community agenda administered by the CEO (one-off and weekly events, edit, delete). */
const pkWeekdays = () => [0, 1, 2, 3, 4, 5, 6].map(k => [String(k), new Date(2026, 9, 11 + k).toLocaleDateString(loc(), { weekday: 'long' })]);
function pkAgendaAdmin() {
  const events = Object.entries(PK.data?.events || {}).map(([id, e]) => ({ id, ...e }));
  const weekly = events.filter(e => !e.day).sort((a, b) => (+a.dow - +b.dow) || String(a.time).localeCompare(b.time));
  const once = events.filter(e => e.day).sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
  const day = Object.fromEntries(pkWeekdays());
  const row = e => `<div class="item"><div class="grow"><b>${esc(e.title)}</b><br><span class="mute">${e.day ? esc(new Date(e.day + 'T12:00:00').toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })) : 'Chaque ' + esc(day[String(e.dow)] || '')} · ${esc(e.time || '')}${e.place ? ' · ' + esc(e.place) : ''}</span></div><div class="row">${pkButton('Modifier', 'event-edit', e.id, 'ghost')}${pkButton('Supprimer', 'event-remove', e.id, 'danger')}</div></div>`;
  const kind = S.f.ev_kind || 'weekly', editing = PK.eventEdit && PK.data?.events?.[PK.eventEdit];
  return `<div class="box"><h3>${editing ? 'Modifier l’événement' : 'Ajouter un événement'}</h3>${inp('ev_title', 'Titre')}${pkSelect('ev_kind', 'Récurrence', [['weekly', 'Chaque semaine'], ['once', 'Une seule date']], kind)}${kind === 'once' ? inp('ev_day', 'Date', 'date') : pkSelect('ev_dow', 'Jour de la semaine', pkWeekdays(), S.f.ev_dow ?? '5')}${inp('ev_time', 'Heure (Porto)', 'time')}${inp('ev_place', 'Lieu')}${pkSelect('ev_img', 'Image', [['', '—'], ['bg', 'Backgammon'], ['halla', 'Hafrashat Halla'], ['minha', 'Minha'], ['arvit', 'Arvit']], S.f.ev_img || '')}<div class="row">${pkButton(editing ? 'Enregistrer les modifications' : 'Ajouter à l’agenda', 'event-save')}${editing ? pkButton('Annuler', 'event-cancel', '', 'ghost') : ''}</div></div><div class="box"><h3>Événements hebdomadaires</h3>${weekly.map(row).join('') || '<p class="mute">Aucun.</p>'}</div><div class="box"><h3>Événements ponctuels</h3>${once.map(row).join('') || '<p class="mute">Aucun.</p>'}</div>`;
}
/* W23/C-CalJ: configuration slot only, disabled by default; no endpoint is called and no time is invented. */
function pkCaljBox() {
  const c = PK.data?.caljConfig || {};
  if (!PK.caljInit) { Object.assign(S.f, { calj_city: c.city || 'Porto', calj_country: c.country || 'Portugal' }); S.f.calj_enabled = !!c.enabled; PK.caljInit = true; }
  return `<div class="box"><h3>Horaires CalJ (Chabbat, zmanim, Daf Hayomi)</h3><p><span class="pill ${c.enabled ? 'gold' : 'bad'}">${c.enabled ? 'Source configurée · import non activé' : 'Source non configurée'}</span> ${c.keySaved ? '<span class="pill ok">Clé enregistrée (coffre chiffré)</span>' : ''}</p><p class="mute">Aucun horaire CalJ n’est importé tant que le contrat d’accès (clé, sélection Porto/Portugal, conventions des zmanim, mise en cache permise) n’est pas confirmé auprès de CalJ. Les horaires actuels de l’agenda sont calculés localement et restent indicatifs.</p><label class="row"><input type="checkbox" data-pk-calj ${S.f.calj_enabled ? 'checked' : ''}> Activer la source CalJ</label>${inp('calj_city', 'Ville')}${inp('calj_country', 'Pays')}<label for="f-calj_key">Clé API CalJ (si fournie)<input type="password" id="f-calj_key" data-f="calj_key" value="${esc(S.f.calj_key || '')}" autocomplete="off"></label><div class="row">${pkButton('Enregistrer', 'calj-save', '', 'ghost')}${c.keySaved ? pkButton('Retirer la clé', 'calj-remove-key', '', 'danger') : ''}</div><p class="mute">Source : ${esc(c.source || 'https://www.calj.net/')}</p></div>`;
}
const pkKeySource = value => value === 'env' ? 'Configurée (variable serveur)' : value === 'vault' ? 'Configurée (coffre chiffré)' : 'Non configurée';
function pkGoogleSettings() {
  const i = PK.data?.integrations || {};
  return `<div class="box"><h3>Google Maps Platform</h3><p class="mute">Adresses : Places API (New), suggestions puis détail du lieu choisi. Trajets : Routes API, une matrice de durées par calcul de tournée (courte mise en cache). OpenRouteService n’est plus utilisé. Les clés restent sur le serveur : variables d’environnement prioritaires, sinon coffre chiffré.</p><p>Adresses <span class="pill ${i.places ? 'ok' : 'bad'}">${pkKeySource(i.places)}</span> · Trajets <span class="pill ${i.routes ? 'ok' : 'bad'}">${pkKeySource(i.routes)}</span></p>${inp('googleKey', 'Clé Google Places (serveur)', 'password')}${pkButton('Vérifier et enregistrer', 'google-config', '', 'ghost')}${inp('googleRoutesKey', 'Clé Google Routes (serveur, si différente)', 'password')}${pkButton('Vérifier et enregistrer', 'google-routes-config', '', 'ghost')}${pkButton('Tester le calcul Google', 'route-test', '', 'ghost')}</div>`;
}
PK.pickupMatches = [];
function pkPickupBox(mid) {
  const menu = mdoc(mid);
  return `<div class="box" data-pk-panel="Adresse de collecte"><h3>Adresse de collecte</h3><p>${menu.address ? esc(menu.address) : '<span class="mute">Non renseignée</span>'} ${menu.address ? `<span class="pill ${menu.pickupVerified ? 'ok' : 'bad'}">${menu.pickupVerified ? 'Vérifiée par Google' : 'Non vérifiée'}</span>` : ''}</p>${inp('pickupAddress', 'Rechercher l’adresse (rue et numéro)')}<div class="row">${pkButton('Rechercher avec Google', 'pickup-search', mid, 'ghost')}${pkButton('Enregistrer sans vérification', 'pickup-free', mid, 'ghost')}</div>${PK.pickupNote ? `<p class="mute">${esc(PK.pickupNote)}</p>` : ''}${PK.pickupMatches.map((m, i) => pkButton(esc(m.label), 'pickup-select', mid + '|' + i, 'ghost')).join('')}</div>`;
}
function vProfessional() {
  if(PK.ticket)return vTicket();
  const content = PK.portal==='restaurant' ? pkRestaurant() : PK.portal==='driver' ? PK.me ? pkOrders() : pkLogin() : pkCEO();
  return `${PK.error ? `<div class="alert" role="alert">${esc(PK.error)}</div>` : ''}${PK.notice ? `<div class="info" role="status">${esc(PK.notice)}</div>` : ''}${!PK.online && PK.data ? '<div class="alert">Connexion interrompue · les positions et commandes peuvent être anciennes.</div>' : ''}${pkGpsAlert()}${typeof pkCredentialView==='function'?pkCredentialView():''}<section class="pk-workspace">${PK.me && PK.tab === 'orders' && typeof pnFirstUse === 'function' ? pnFirstUse() : ''}${content}</section>`;
}
vPro = function () { if (PK.portal==='client') return `<h2>Espaces professionnels</h2>${pkAccessLinks()}`;return vProfessional(); };
const originalProfile=vProfile;
const pkAccessLinks=()=>`<div class="box"><a class="pl" href="/restaurant">🍽️ Espace restaurateur <span>›</span></a><a class="pl" href="/livreur">🚲 Espace livreur <span>›</span></a><a class="pl" href="/ceo">🔑 Espace CEO · Associés <span>›</span></a></div>`;
vProfile=function(){return originalProfile()+pkAccessLinks();};
const accessProfile=vProfile;
vProfile=function(){const account=PK.data?.clientAccount;return accessProfile()+`<div class="box"><h3>Mon compte joueur</h3>${account?`<p><b>${esc(account.name)}</b><br>${esc(account.login)}</p><p class="mute">Vos commandes et records vous suivent sur vos appareils après connexion.</p>${pkButton('Déconnexion du compte client','client-logout','','ghost')}`:`<p class="mute">Créez un compte pour retrouver votre classement et vos commandes sur plusieurs appareils. Vous pouvez aussi commander sans compte.</p>${inp('clientName','Pseudo du joueur')}${inp('clientEmail','Adresse e-mail','email')}${inp('clientPassword','Mot de passe · 12 caractères minimum','password')}<div class="row">${pkButton('Créer mon compte','client-register')}${pkButton('Me connecter','client-login','','ghost')}</div>`}${pkButton('Activer les notifications de commande','notifications','','ghost')}</div>`;};
const originalRender=render;
render=function(){
  document.body.setAttribute('data-portal',PK.portal);
  if(PK.portal!=='client')S.tab='pro';
  const gameCanvas=S.tab==='game'?document.getElementById('gc'):null;
  const keepGame=gameCanvas&&gameCanvas._run===PK.run&&!gameCanvas._finished;
  originalRender();
  const replacement=keepGame?document.getElementById('gc'):null;
  if(replacement&&replacement!==gameCanvas)replacement.replaceWith(gameCanvas);
  if(PK.portal!=='client'){
    const root=document.getElementById('app'),dock=root.querySelector('.dock');
    if(dock){const tabs=PK.portal==='ceo'?[['orders','Commandes'],['menus','Enseignes'],['accounts','Comptes'],['settings','Réglages'],['history','Historique'],['agenda','Agenda']]:PK.portal==='restaurant'?[['orders','Commandes'],['menu','Ma carte'],['promos','Promotions'],['settings','Réglages']]:[['orders','Mes courses'],['tour','Ma tournée'],['settings','Réglages']];
      dock.innerHTML=PK.me?`<nav class="nav pro-nav">${tabs.map(([key,label])=>`<button data-a="pk" data-v="section" data-id="${key}" aria-pressed="${PK.tab===key}">${label}</button>`).join('')}</nav>`:'';}
    const top=root.querySelector('.top');if(top){const banner=document.createElement('div');banner.className='row sp pro-banner';banner.innerHTML=`<span>${pkRoles[PK.portal]}${PK.me?' · '+esc(PK.me.name):''}</span>${PK.me?pkButton('Déconnexion','logout','','ghost'):''}`;top.appendChild(banner);}
    root.querySelectorAll('[data-a="logout"]').forEach(b=>{b.dataset.a='pk';b.dataset.v='logout';});
    root.querySelector('#f-s_pin')?.closest('label')?.remove();
  }
};
const baseCart=vCart;
vCart=function(sh){let html=baseCart(sh);html=html.replace(/(<div class="seg">)([\s\S]*?)(<\/div>)/,(_match,start,buttons,end)=>start+buttons+`<button data-a="mode" data-v="uber" aria-pressed="${S.f.mode==='uber'}">Uber Colis</button>`+end);if(S.f.mode==='uber')html=html.replace('<button class="btn gold" data-a="order">','<p class="mute">Vous réservez et payez votre coursier Uber Colis. Aucun frais de livraison n’est ajouté ici.</p><button class="btn gold" data-a="order">');return html;};
const scheduledCart=vCart;
vCart=function(sh){const service=mdoc(S.cartR).effectiveService;let html=scheduledCart(sh);if(service){const messages=[];if(!service.open)messages.push('Le service est fermé.');if(service.preordersAt)messages.push('Précommandes à partir du '+service.preordersAt.replace('T',' à ')+' (heure de Porto).');if(service.opensAt)messages.push('Ouverture à partir du '+service.opensAt.replace('T',' à ')+' (heure de Porto).');if(messages.length)html='<div class="info">'+messages.map(esc).join('<br>')+'</div>'+html;}return html;};
const deliveryCart=vCart;
PK.addressMatches=[];
vCart=function(sh){let html=deliveryCart(sh);if(S.f.mode==='deliv')html=html.replace('<label for="f-when">',`<div class="box">${pkButton('Rechercher mon adresse avec Google','address-search','','ghost')}${PK.addressMatches.map((point,index)=>pkButton(esc(point.label),'address-select',String(index),'ghost')).join('')}${PK.addressNote?`<p class="mute">${esc(PK.addressNote)}</p>`:''}${S.f.addrToken?`<p class="pill ok">Adresse vérifiée par Google${PK.addressPrecision==='street'?' · numéro conservé':''}</p>`:S.f.addr?'<p class="pill gold">Adresse non vérifiée : elle sera transmise telle quelle</p>':''}</div><label for="f-when">`);return html;};
const nativePTab=A.ptab;
A.ptab=function(value){nativePTab(value);if(PK.portal==='restaurant')PK.tab=value==='set'?'settings':value;else S.f.ceoMenuTab=value;};
promoOf=mid=>S.promoVerified && S.promoVerified.mid===mid && S.promoVerified.c===S.promo ? S.promoVerified : null;
A.promo=async function(){try{const promo=await pkApi('/api/promo/check',{merchant:S.cartR,code:S.f.promo_in});S.promo=promo.c;S.promoVerified={...promo,mid:S.cartR};render();}catch(error){S.promo='';S.promoVerified=null;S.toast=error.message;S.bad=true;render();}};
const originalPromoAdd=A.padd;
A.padd=function(){if(!S.f.p_c)S.f.p_c='PK'+crypto.randomUUID().slice(0,6).toUpperCase();originalPromoAdd();};
Object.assign(T.fr,{local:'',deliv:'Livraison Porto Kitch',fee:'Livraison Porto Kitch',st_go_d:'En route avec votre livreur',st_ready:'Prête à être récupérée',st_go_p:'Prête à être récupérée',uber:'Uber Colis',pinHint:'Connexion individuelle sécurisée',sent:'Commande enregistrée',glovo:'Livraison Porto Kitch'});
Object.assign(T.en,{deliv:'KOSH delivery',fee:'KOSH delivery',st_go_d:'On the way with your courier',st_ready:'Ready for collection',uber:'Uber Parcel'});
Object.assign(T.he,{deliv:'משלוח Porto Kitch',st_ready:'מוכן לאיסוף',uber:'Uber Colis'});
Object.assign(T.pt,{deliv:'Entrega Porto Kitch',st_ready:'Pronta para recolha',uber:'Uber Colis'});

put=async function(path,data){
  if(path.startsWith('menus/')){if(PK.portal==='client')return;return pkApi('/api/menu',{merchant:path.split('/')[1],menu:data}).then(()=>pkSync()).catch(error=>{PK.error=error.message;render();});}
  // Order actions, events and scores use their own restricted endpoints below.
};
// A product draft keeps the revision at which its fields were loaded.
const pkOpenProduct=A.eopen,pkNewProduct=A.eadd,pkSaveProduct=A.esave;
A.eopen=function(id){pkOpenProduct(id);PK.editRevision=mdoc(S.pro)._revision||0;PK.editMerchant=S.pro;};
A.eadd=function(){pkNewProduct();PK.editRevision=mdoc(S.pro)._revision||0;PK.editMerchant=S.pro;};
A.esave=function(){
  if(PK.editMerchant!==S.pro || (mdoc(S.pro)._revision||0)!==PK.editRevision){
    PK.error='La carte ou le stock ont changé pendant votre modification. Fermez puis rouvrez ce produit avant de réessayer.';render();return;
  }
  return pkSaveProduct();
};
db={};dbDone=true;
arcade.expires=()=>PK.gameExpires;
arcade.remaining=()=>Math.max(0,PK.gameExpires-pkTime());
arcade.allowed=()=>PK.portal==='client' && PK.data && arcade.remaining()>0;
arcade.countdown=()=>{const seconds=Math.ceil(arcade.remaining()/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
// Only server-replayed runs enter the shared leaderboard. Local records stay visual.
const pkReplays=new Set();
arcade.record=function(key,score){if(arcade.integer(score)>arcade.integer(arcade.best[key]))arcade.best[key]=String(score);};
async function pkFlushArcade(replay){
  if(!replay||replay.busy||replay.invalid||replay.ack>=replay.tick){if(replay?.finished&&replay.ack>=replay.tick)pkReplays.delete(replay);return;}
  replay.busy=true;
  try{
    const target=Math.min(replay.tick,replay.ack+600);
    replay.packet=replay.packet||{run:replay.run,from:replay.ack,tick:target,taps:replay.taps.filter(t=>t>replay.ack&&t<=target),name:S.f.gname||'Joueur'};
    const result=await pkApi('/api/games/score',replay.packet);
    replay.ack=result.tick;replay.packet=null;replay.taps=replay.taps.filter(t=>t>replay.ack);
    if(PK.clientID===replay.client)store.scores[replay.client]=result.row;
  }catch(error){
    PK.error=error.message;
    if(/expirée|invalide|trop vite|Actualisation/.test(error.message)){replay.invalid=true;pkReplays.delete(replay);}
  }finally{replay.busy=false;if(replay.finished&&replay.ack>=replay.tick)pkReplays.delete(replay);}
}
setInterval(()=>{for(const replay of pkReplays)pkFlushArcade(replay);},700);
window.addEventListener('pagehide',()=>{for(const replay of pkReplays){if(replay.invalid||replay.ack>=replay.tick)continue;const target=Math.min(replay.tick,replay.ack+600),body=replay.packet||{run:replay.run,from:replay.ack,tick:target,taps:replay.taps.filter(t=>t>replay.ack&&t<=target),name:S.f.gname||'Joueur'};fetch('/api/games/score',{method:'POST',headers:{'Content-Type':'application/json','X-PK-Portal':'client'},body:JSON.stringify(body),keepalive:true}).catch(()=>{});}});
const localGPlay=A.gplay;
A.gplay=async function(value){arcade.finish();if(!arcade.allowed()){S.tab='games';render();return;}try{const run=await pkApi('/api/games/start',{game:value});PK.run=run.run;PK.replay={run:run.run,seed:run.seed,client:PK.clientID,tick:0,ack:0,taps:[],busy:false};pkReplays.add(PK.replay);PK.gameExpires=run.expires;PK.serverTime=run.time;PK.syncAt=performance.now();localGPlay(value);render();startGame();}catch(error){PK.error=error.message;S.tab='games';render();}};
A.order=async function(){if(PK.busy)return;PK.busy=true;const f=S.f;try{if(shabbat().closed)throw new Error(t('closedShab'));const result=await pkApi('/api/orders',{m:S.cartR,lines:lines().map(i=>({id:i.id,q:i.q,o:i.o,note:i.note,choices:i.choices})),name:f.name,tel:f.tel,addr:f.addr,note:f.note,mode:f.mode,when:f.when,promo:S.promo,addressToken:f.mode==='deliv'?f.addrToken:undefined});PK.gameExpires=result.gameExpires;PK.serverTime=result.time;PK.syncAt=performance.now();S.cart={};S.cfgs={};S.promo='';S.tab='orders';ls.set('pk-me',{name:f.name,tel:f.tel,addr:f.addr,mode:f.mode});await pkSync();say('sent');}catch(error){S.toast=error.message;S.bad=true;}finally{PK.busy=false;render();}};
for(const [action,key] of [['paid','paid'],['recv','received'],['rate','rate'],['clsend','claim']])A[action]=async function(id,button){try{await pkApi('/api/orders/action',{id,action:key,rate:+button?.dataset.k,kind:S.f.cl_k,text:S.f.cl_txt});S.cl=null;await pkSync();}catch(error){S.toast=error.message;S.bad=true;render();}};
/* Lot 3, customer: estimate, cancellation request and pickup proposal; no free text field, so polling never loses input. */
const K3={fr:{eta:'Livraison estimée vers',prep:'Préparation estimée jusqu’à',ask:'Demander l’annulation',askOk:'Envoyer la demande d’annulation au restaurant ? Il l’acceptera ou la refusera.',sent:'Demande d’annulation envoyée · en attente du restaurant',accepted:'Annulation acceptée par le restaurant.',offer:'Aucun livreur n’est disponible pour le moment. Le restaurant vous propose de retirer votre commande sur place',yes:'Accepter le retrait',no:'Refuser, garder la livraison',kept:'Vous avez refusé le retrait : la livraison est maintenue.',converted:'Commande à retirer sur place',fees:'Les éventuels ajustements de frais seront traités manuellement par le restaurant.',refunded:'Remboursement effectué'},
en:{eta:'Estimated delivery around',prep:'Preparation estimated until',ask:'Request cancellation',askOk:'Send the cancellation request to the restaurant? It will accept or decline it.',sent:'Cancellation requested · waiting for the restaurant',accepted:'Cancellation accepted by the restaurant.',offer:'No rider is available right now. The restaurant offers that you collect your order on site',yes:'Accept pickup',no:'Decline, keep delivery',kept:'You declined pickup: delivery is maintained.',converted:'Order to collect on site',fees:'Any fee adjustment will be handled manually by the restaurant.',refunded:'Refund completed'},
he:{eta:'משלוח משוער בסביבות',prep:'הכנה משוערת עד',ask:'בקשת ביטול',askOk:'לשלוח למסעדה בקשת ביטול? המסעדה תאשר או תדחה.',sent:'בקשת הביטול נשלחה · ממתינה למסעדה',accepted:'המסעדה אישרה את הביטול.',offer:'אין שליח זמין כרגע. המסעדה מציעה לאסוף את ההזמנה במקום',yes:'אישור איסוף',no:'דחייה, להשאיר משלוח',kept:'דחיתם את האיסוף: המשלוח נשמר.',converted:'הזמנה לאיסוף במקום',fees:'התאמת דמי המשלוח תטופל ידנית על ידי המסעדה.',refunded:'ההחזר בוצע'},
pt:{eta:'Entrega estimada por volta das',prep:'Preparação estimada até',ask:'Pedir o cancelamento',askOk:'Enviar o pedido de cancelamento ao restaurante? Ele vai aceitar ou recusar.',sent:'Cancelamento pedido · a aguardar o restaurante',accepted:'Cancelamento aceite pelo restaurante.',offer:'Não há estafeta disponível de momento. O restaurante propõe que levante o seu pedido no local',yes:'Aceitar o levantamento',no:'Recusar, manter a entrega',kept:'Recusou o levantamento: a entrega mantém-se.',converted:'Pedido a levantar no local',fees:'Eventuais ajustes de taxas serão tratados manualmente pelo restaurante.',refunded:'Reembolso efetuado'}};
function kOrderRequests(o,id){
  if(!o)return '';const L=K3[S.lang]||K3.fr,eid=esc(id),live=!['done','no'].includes(o.st),r=o.cancelRequest,p=o.pickupOffer;let h='';
  if(live&&o.mode==='deliv'&&o.etaSource==='route'&&o.deliveryEta)h+=`<div class="info k3-eta">🚲 ${L.eta} <b>${pkClock(o.deliveryEta)}</b></div>`;
  if(p?.state==='pending'&&live&&o.mode==='deliv')h+=`<div class="alert k3-pickup"><b>${L.offer}</b>${o.pickupAddress?` : ${esc(o.pickupAddress)}`:''}.<div class="row" style="margin-top:8px"><button class="btn sm gold" data-a="kpick" data-v="${eid}" data-k="1">${L.yes}</button><button class="btn sm ghost" data-a="kpick" data-v="${eid}" data-k="0">${L.no}</button></div></div>`;
  else if(p?.state==='refused'&&live)h+=`<div class="mute">${L.kept}</div>`;
  if(o.conversion)h+=`<div class="info"><b>${L.converted}</b>${o.pickupAddress?` : ${esc(o.pickupAddress)}`:''}<br>${L.fees}</div>`;
  if(r?.state==='refused')h+=`<div class="alert k3-refused">${esc(r.message)}</div>`;
  else if(r?.state==='pending'&&live)h+=`<div class="info">${L.sent}</div>`;
  else if(r?.state==='accepted')h+=`<div class="info">${L.accepted}</div>`;
  else if(!r&&o.paid&&live)h+=`<div><button class="btn sm ghost k3-cancel" data-a="kcancel" data-v="${eid}">${L.ask}</button></div>`;
  return h?`<div class="k3">${h}</div>`:'';
}
const k3Card=orderCard;
orderCard=function(o,id,pro){let h=k3Card(o,id,pro);if(pro)return h;const L=K3[S.lang]||K3.fr;if(o.refundedAt)h=h.replace(`<div class="alert">${t("refund")}</div>`,`<div class="info">✓ ${L.refunded}</div>`);return h.replace(/<\/div>$/,kOrderRequests(o,id)+'</div>');};
A.kcancel=async function(id){if(!confirm((K3[S.lang]||K3.fr).askOk))return;try{await pkApi('/api/orders/action',{id,action:'cancel-request'});await pkSync();}catch(error){S.toast=error.message;S.bad=true;render();}};
A.kpick=async function(id,button){try{await pkApi('/api/orders/action',{id,action:'pickup-answer',accept:button?.dataset.k==='1'});await pkSync();}catch(error){S.toast=error.message;S.bad=true;render();}};
A.evlogin=function(){S.tab='pro';};
A.evsave=()=>pkDo(()=>pkApi('/api/events',{event:{title:S.f.v_t,time:S.f.v_time,place:S.f.v_place,dow:+S.f.v_dow,day:S.f.v_date||undefined,img:S.f.v_img}}));
A.evdel=id=>pkDo(()=>pkApi('/api/events',{id,remove:true}));
A.logout=()=>pkDo(()=>pkApi('/api/logout',{}));
const originalTicket=vTicket;
vTicket=function(){return originalTicket()+`<button class="btn ghost" data-a="pk" data-v="print">Imprimer le ticket</button>`;};
/* Lot 4: automatic courier GPS. Permission is requested once at login (even without a course); a real browser
   fix is sent at most every 3 s, only while a part is active, and only by ONE page per courier (lease in
   localStorage). Refusal, unavailable position, timeout and network loss are explained without request loops.
   No background tracking is promised: a suspended page (iPhone PWA, locked screen) stops sending. */
const GPS = { watch: null, high: true, denied: false, status: '', lastSent: 0, lastFix: 0, pending: null, owner: false, sent: false, timer: null, retry: null, tab: Math.random().toString(36).slice(2) };
const GPS_LEASE = 'kosh-gps-lease';
function pkGpsLease() {
  const id = PK.me?.id; if (!id) return false;
  let lease = null; const t = Date.now();
  try { lease = JSON.parse(localStorage.getItem(GPS_LEASE) || 'null'); } catch { lease = null; }
  try {
    if (!lease || lease.driver !== id || lease.tab === GPS.tab || lease.until < t) { localStorage.setItem(GPS_LEASE, JSON.stringify({ driver: id, tab: GPS.tab, until: t + 8000 })); lease = JSON.parse(localStorage.getItem(GPS_LEASE)); }
  } catch { return (GPS.owner = true); } // storage unavailable: this page is the only emitter it can know of
  return (GPS.owner = lease?.tab === GPS.tab && lease?.driver === id);
}
function pkGpsRelease() { try { const lease = JSON.parse(localStorage.getItem(GPS_LEASE) || 'null'); if (lease?.tab === GPS.tab) localStorage.removeItem(GPS_LEASE); } catch {} GPS.owner = false; }
function pkHasCourse() { return Object.values(store.orders || {}).some(o => !['no', 'done'].includes(o.st) && (o.parts || []).some(p => ['accepted', 'collected'].includes(p.state))); }
function pkStartGPS() {
  if (PK.portal !== 'driver' || !PK.me || GPS.watch !== null || GPS.denied) return Promise.resolve();
  if (!navigator.geolocation) { GPS.status = 'unsupported'; return Promise.resolve(); }
  GPS.watch = navigator.geolocation.watchPosition(pkGpsFix, pkGpsError, { enableHighAccuracy: GPS.high, maximumAge: 0, timeout: GPS.high ? 15000 : 30000 });
  if (!GPS.timer) GPS.timer = setInterval(pkGpsTick, 3000);
  if (!GPS.permission && navigator.permissions?.query) navigator.permissions.query({ name: 'geolocation' }).then(state => { GPS.permission = state; state.onchange = () => { if (state.state !== 'denied' && GPS.denied) { GPS.denied = false; GPS.status = ''; pkStartGPS(); render(); } }; }).catch(() => {});
  return Promise.resolve();
}
function pkGpsClear() { if (GPS.watch !== null && navigator.geolocation) navigator.geolocation.clearWatch(GPS.watch); GPS.watch = null; }
function pkGpsFix(position) { GPS.pending = position; GPS.lastFix = performance.now(); if (GPS.status && GPS.status !== 'other-tab') { GPS.status = ''; render(); } pkGpsTick(); }
function pkGpsError(error) {
  if (error.code === 1) { GPS.denied = true; GPS.status = 'denied'; pkGpsClear(); render(); return; } // never asked again until the permission changes
  GPS.status = error.code === 3 ? 'timeout' : 'unavailable';
  if (GPS.high) { GPS.high = false; pkGpsClear(); pkStartGPS(); } // L42: retry once with a less precise position
  else if (!GPS.retry) GPS.retry = setTimeout(() => { GPS.retry = null; pkGpsClear(); GPS.high = true; pkStartGPS(); }, 30000); // L43: resume later, no loop
  render();
}
async function pkGpsTick() {
  if (PK.portal !== 'driver' || !PK.me || GPS.busy) return;
  if (!pkGpsLease()) { if (GPS.status !== 'other-tab') { GPS.status = 'other-tab'; render(); } return; }
  if (GPS.status === 'other-tab') { GPS.status = ''; render(); }
  if (GPS.watch !== null && GPS.lastFix && performance.now() - GPS.lastFix > 120000 && !['denied', 'stale'].includes(GPS.status)) { GPS.status = 'stale'; render(); }
  const position = GPS.pending;
  if (!position || (GPS.lastSent && performance.now() - GPS.lastSent < 3000) || !pkHasCourse() || navigator.onLine === false) return;
  GPS.busy = true;
  try {
    await pkApi('/api/location', { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, age: Math.max(0, Math.min(3600000, Date.now() - (position.timestamp || Date.now()))) });
    GPS.lastSent = performance.now(); GPS.sent = true; if (GPS.pending === position) GPS.pending = null;
    if (GPS.status === 'network') { GPS.status = ''; render(); }
  } catch (error) { GPS.status = 'network'; }
  finally { GPS.busy = false; }
}
function pkGpsSync(active, identityChanged) {
  if (identityChanged) { pkGpsClear(); GPS.denied = false; GPS.sent = false; GPS.pending = null; GPS.status = ''; } // L45
  if (!active && GPS.sent && GPS.owner) { GPS.sent = false; pkApi('/api/location', { stop: true }).catch(() => {}); }
  pkStartGPS();
}
async function pkStopGPS() { const sent = GPS.sent && GPS.owner; pkGpsClear(); clearInterval(GPS.timer); GPS.timer = null; GPS.sent = false; GPS.pending = null; pkGpsRelease(); if (sent) await pkApi('/api/location', { stop: true }).catch(() => {}); }
const pkGpsMessages = { denied: 'Localisation refusée : autorisez-la dans les réglages du navigateur pour que le restaurant voie votre arrivée.', unavailable: 'Position introuvable pour le moment : nouvel essai automatique.', timeout: 'Délai dépassé pour obtenir la position : nouvel essai avec une précision réduite.', network: 'Connexion interrompue : la position sera envoyée dès le retour du réseau.', stale: 'Aucune nouvelle position depuis deux minutes : gardez l’application ouverte au premier plan.', 'other-tab': 'Le partage GPS est déjà actif dans une autre page KOSH ouverte : cette page n’envoie rien.', unsupported: 'Ce navigateur ne fournit pas la localisation.' };
function pkGpsAlert() { return PK.portal === 'driver' && PK.me && pkGpsMessages[GPS.status] ? `<div class="alert pk-gps-alert" role="alert">${pkGpsMessages[GPS.status]}</div>` : ''; }
/* Lot 4: the courier's tour. Automatic optimisation (shortest total time) when the stops change, manual
   up/down moves saved on the server, never overwritten by polling; times refreshed without reordering. */
function pkTourAuto() {
  const tour = PK.data?.tour; if (!tour || !tour.stops.length || !tour.routes || PK.tourBusy) return;
  if (!GPS.lastSent || performance.now() - GPS.lastSent > 110000) return; // needs a recent real position
  const key = tour.signature + '/' + tour.stops.map(s => s.id).join(','), age = tour.estimates ? pkTime() - tour.estimates.at : Infinity;
  let action = null;
  if (tour.outdated && PK.tourKey !== key) action = tour.manual ? 'refresh' : 'optimize';
  else if (tour.estimates && age > 300000 && performance.now() - (PK.tourRefreshAt || -1e9) > 300000) action = 'refresh';
  if (!action) return;
  PK.tourKey = key; PK.tourRefreshAt = performance.now(); PK.tourBusy = true;
  pkApi('/api/tour', { action }).then(result => { PK.tourNote = result.degraded?.message || result.warning || ''; PK.data.tour = result.tour; render(); }).catch(error => { PK.tourNote = error.message; render(); }).finally(() => { PK.tourBusy = false; });
}
function pkTour() {
  const tour = PK.data?.tour || { stops: [], links: { segments: [], missing: [] } }, stops = tour.stops || [], est = tour.estimates;
  if (!stops.length) return `<div class="box pk-tour"><h3>Ma tournée</h3><p class="mute">Aucun arrêt pour le moment. Acceptez une course pour l’ajouter à votre tournée.</p></div>`;
  const status = !tour.routes ? 'Calcul Google non configuré : ordre manuel, sans heure estimée.' : tour.degraded && !est ? tour.degraded.message : !est ? 'Calcul des heures en attente de votre position.' : est.fresh ? `Fin de tournée estimée vers <b>${pkClock(est.finish)}</b> · durées Google, estimations sans garantie de trafic.` : 'Heures à actualiser : elles ne sont plus considérées comme actuelles.';
  const rows = stops.map((s, i) => `<li class="pk-stop"><div class="row sp"><span><b>${s.kind === 'pickup' ? '🛍 Collecte' : '🏠 Livraison'} · #${esc(s.code)}</b> · ${pkSacs(s.bags)}<br>${esc(s.kind === 'pickup' ? s.name : s.address || '')}${s.kind === 'pickup' && s.address ? ` <span class="mute">${esc(s.address)}</span>` : ''}${s.verified ? '' : ' <span class="pill bad">adresse non vérifiée</span>'}</span><span class="row">${i ? pkButton('↑', 'tour-move', s.id + '|up', 'ghost') : ''}${i < stops.length - 1 ? pkButton('↓', 'tour-move', s.id + '|down', 'ghost') : ''}</span></div>${est && est.fresh && s.eta ? `<span class="mute">Arrivée ≈ ${pkClock(s.eta.arrive)}${s.eta.wait >= 60000 ? ` · attente préparation ${Math.round(s.eta.wait / 60000)} min` : ''}</span>` : ''}</li>`).join('');
  const segments = tour.links?.segments || [], next = tour.next;
  const google = segments.length === 1 ? `<a class="btn sm gold" href="${esc(segments[0].url)}" target="_blank" rel="noopener noreferrer">Google Maps · tournée complète ↗</a>` : segments.map((seg, i) => `<a class="btn sm gold" href="${esc(seg.url)}" target="_blank" rel="noopener noreferrer">Google Maps · étape ${i + 1}/${segments.length} (arrêts ${stops.findIndex(s => s.id === seg.stops[0]) + 1} à ${stops.findIndex(s => s.id === seg.stops[seg.stops.length - 1]) + 1}) ↗</a>`).join('');
  return `<div class="box pk-tour"><div class="row sp"><h3>Ma tournée</h3><span class="pill ${tour.manual ? 'gold' : 'ok'}">${tour.manual ? 'Ordre manuel' : 'Ordre optimisé'}</span></div><p class="mute">${status}</p>${PK.tourNote && PK.tourNote !== tour.degraded?.message ? `<p class="mute">${esc(PK.tourNote)}</p>` : ''}<ol class="pk-stops">${rows}</ol><div class="row">${google}</div>${segments.length > 1 ? '<p class="mute">Le lien complet dépasse la limite Google Maps : ouvrez les étapes dans l’ordre, chacune reprend au dernier arrêt de la précédente.</p>' : ''}${tour.links?.missing?.length ? '<p class="mute">Un arrêt sans adresse publique n’est pas dans le lien : adresse communiquée par le restaurant.</p>' : ''}${next ? `<div class="row"><span class="mute">Prochain arrêt :</span><a class="btn sm ghost" href="${esc(next.apple)}" target="_blank" rel="noopener noreferrer">Plans ↗</a><a class="btn sm ghost" href="${esc(next.waze)}" target="_blank" rel="noopener noreferrer">Waze ↗</a></div>` : ''}${pkButton('Recalculer l’ordre optimal', 'tour-optimize', '', 'ghost')}<p class="mute">Votre position est demandée automatiquement. Gardez l’application ouverte au premier plan pendant la tournée : un écran verrouillé suspend le GPS.</p></div>`;
}

A.pk=function(action,button){
  const id=button.dataset.id || '',mid=S.pro;
  if(action==='section'){PK.tab=id;PK.ticket=false;PK.error='';PK.credential=null;render();return;}
  if(action==='filter'){render();return;}
  if(action==='ticket'){S.tk=id;S.tkBack='pro';PK.ticket=true;render();return false;}
  if(action==='ticket-back'){pkCloseReceipt();return;}
  if(action==='print'){window.print();return false;}
  return pkDo(async()=>{
    if(action==='login'){await pkApi('/api/login',{role:PK.portal,login:S.f.pk_login,password:S.f.pk_password,remember:!!S.f.pk_remember});S.f.pk_password='';PK.error='';}
    else if(action==='logout'){await pkStopGPS();await pkApi('/api/logout',{portal:PK.portal});PK.me=null;PK.data=null;S.pro=null;PK.initialized=false;PK.credential=null;PK.receiptQueue=[];}
    else if(action==='refresh')await pkSync();
    else if(action==='client-register'||action==='client-login'){await pkApi('/api/client/account',{action:action==='client-register'?'register':'login',email:S.f.clientEmail,password:S.f.clientPassword,name:S.f.clientName});if(S.f.clientName)ls.set('pk-gname',S.f.clientName);S.f.clientPassword='';}
    else if(action==='client-logout'){arcade.finish();await pkApi('/api/client/account',{action:'logout'});PK.gameExpires=0;S.my=[];}
    else if(action==='address-search'){PK.addrSession=PK.addrSession||crypto.randomUUID();PK.addressNote='';try{const result=await pkApi('/api/address',{query:S.f.addr,session:PK.addrSession,cart:pkAddressCart()});PK.addressMatches=result.results;PK.addressNote=result.results.length?'Sélectionnez votre adresse exacte.':'Aucune adresse trouvée : vérifiez le numéro et la rue.';}catch(error){PK.addressMatches=[];PK.addressNote=error.message;}}
    else if(action==='address-select'){const match=PK.addressMatches[+id];const result=await pkApi('/api/address',{placeId:match.placeId,session:PK.addrSession,query:S.f.addr,cart:pkAddressCart()});S.f.addr=result.address.label;S.f.addrToken=result.address.token;PK.addressPrecision=result.address.precision;PK.addressMatches=[];PK.addrSession=null;PK.addressNote='';}
    else if(action==='dispatch'){const bags=S.f['assignbags_'+id]?Number(S.f['assignbags_'+id]):undefined;if(bags!==undefined&&(!Number.isInteger(bags)||bags<1))throw new Error('Nombre de sacs invalide.');await pkApi('/api/dispatch',{id,driver:S.f['assign_'+id],bags,minutes:+S.f['eta_'+id]||15});delete S.f['assignbags_'+id];PK.notice='Part proposée : le livreur doit l’accepter.';}
    else if(action==='status'){const [oid,status]=id.split(':');await pkApi('/api/orders/action',{id:oid,action:'status',status});}
    else if(action==='collect'){await pkApi('/api/orders/action',{id,action:'collect'});}
    else if(action==='cancel-order'){const reason=S.f['reason_'+id];if(!reason)throw new Error('Indiquez le motif d’annulation.');if(!confirm('Annuler cette commande ? Le stock sera restitué et un remboursement manuel sera signalé si elle est payée.'))return;await pkApi('/api/orders/action',{id,action:'status',status:'no',reason});}
    else if(action==='cancel-accept'){if(!confirm('Accepter l’annulation demandée par le client ? Le stock sera restitué et un remboursement manuel sera signalé.'))return;await pkApi('/api/orders/action',{id,action:'cancel-decision',decision:'accept'});}
    else if(action==='cancel-refuse'){if(!confirm('Refuser l’annulation ? Le client recevra : « Le restaurant a malheureusement décliné votre annulation. Vous pouvez adresser une réclamation. »'))return;await pkApi('/api/orders/action',{id,action:'cancel-decision',decision:'refuse'});}
    else if(action==='pickup-offer'){if(!confirm('Proposer au client de retirer sa commande sur place ? Rien ne change tant qu’il n’a pas accepté.'))return;await pkApi('/api/orders/action',{id,action:'pickup-offer'});PK.notice='Proposition envoyée : en attente de la réponse du client.';}
    else if(action==='refunded'){if(!confirm('Confirmer que le remboursement manuel a été effectué ?'))return;await pkApi('/api/orders/action',{id,action:'refunded'});}
    else if(action==='prep-set'){const minutes=Number(S.f.prepMinutes);if(!Number.isInteger(minutes)||minutes<1||minutes>180)throw new Error('Temps de préparation : minutes entières de 1 à 180.');await pkApi('/api/prep',{merchant:id,action:'set',minutes});PK.notice='Temps de préparation enregistré.';}
    else if(action==='prep-accept'||action==='prep-refuse'){const result=await pkApi('/api/prep',{merchant:id,action:action==='prep-accept'?'accept':'refuse'});S.f.prepMinutes=String(result.prep.minutes);}
    else if(action==='eta')await pkApi('/api/orders/action',{id,action:'eta',minutes:+S.f['eta_'+id]});
    else if(action==='message')await pkApi('/api/orders/action',{id,action:'message',text:S.f['msg_'+id]});
    else if(action==='reply'){const [oid,index]=id.split(':');await pkApi('/api/orders/action',{id:oid,action:'reply',index:+index,text:S.f['rep_'+oid+'_'+index]});}
    else if(action==='tour-move'){const [stop,to]=id.split('|');const result=await pkApi('/api/tour',{action:'move',stop,to,signature:PK.data?.tour?.signature});PK.data.tour=result.tour;PK.tourNote=result.degraded?.message||'';}
    else if(action==='tour-optimize'){if(PK.data?.tour?.manual&&!confirm('Remplacer votre ordre manuel par l’ordre le plus rapide calculé ?'))return;const result=await pkApi('/api/tour',{action:'optimize'});PK.data.tour=result.tour;PK.tourNote=result.degraded?.message||result.warning||'';PK.notice=result.degraded?'':'Ordre optimal calculé.';}
    else if(action==='route-test'){const result=await pkApi('/api/routing',{action:'test'});PK.notice=result.message;}
    else if(action==='google-config'){if(!confirm('Enregistrer cette clé Google (Places API) ? Les recherches d’adresses peuvent entraîner des frais Google.'))return;await pkApi('/api/routing',{action:'google',key:S.f.googleKey});S.f.googleKey='';PK.notice='Clé Google Places vérifiée et enregistrée.';}
    else if(action==='google-routes-config'){if(!confirm('Enregistrer cette clé Google (Routes API) ? Chaque calcul de tournée peut entraîner des frais Google.'))return;await pkApi('/api/routing',{action:'google-routes',key:S.f.googleRoutesKey});S.f.googleRoutesKey='';PK.notice='Clé Google Routes vérifiée et enregistrée.';}
    else if(action==='pickup-search'){PK.pickupSession=PK.pickupSession||crypto.randomUUID();PK.pickupNote='';try{PK.pickupMatches=(await pkApi('/api/address',{query:S.f.pickupAddress,session:PK.pickupSession})).results;if(!PK.pickupMatches.length)PK.pickupNote='Aucune adresse trouvée.';}catch(error){PK.pickupMatches=[];PK.pickupNote=error.message;}}
    else if(action==='pickup-select'){const [merchant,index]=id.split('|');const match=PK.pickupMatches[+index];const result=await pkApi('/api/address',{placeId:match.placeId,session:PK.pickupSession,query:S.f.pickupAddress});await pkApi('/api/pickup',{merchant,token:result.address.token});PK.pickupMatches=[];PK.pickupSession=null;S.f.pickupAddress='';PK.notice='Adresse de collecte vérifiée par Google et enregistrée.';}
    else if(action==='pickup-free'){if(!confirm('Enregistrer cette adresse sans vérification Google ? Les trajets et heures estimées seront indisponibles pour ce restaurant.'))return;await pkApi('/api/pickup',{merchant:id,address:S.f.pickupAddress});PK.pickupMatches=[];S.f.pickupAddress='';PK.notice='Adresse enregistrée sans vérification.';}
    else if(action==='service-close'||action==='service-open'){if(action==='service-close'&&!confirm('Clôturer le service ? Les nouvelles commandes seront bloquées ; les commandes déjà reçues restent à traiter.'))return;await pkApi('/api/service',{merchant:id,action:action==='service-close'?'close':'open'});}
    else if(action==='glo-toggle')await pkApi('/api/service',{merchant:id,action:'glo',enabled:(id?mdoc(id).service:PK.data.config)?.glo===false});
    else if(action==='schedule')await pkApi('/api/service',{merchant:id,action:'schedule',preordersAt:S.f.preordersAt,opensAt:S.f.opensAt,delay:+S.f.serviceDelay||30});
    else if(action==='account'){const role=S.f.accountRole||'restaurant';const result=await pkApi('/api/ceo',{action:'account',login:S.f.accountEmail,role,...(role==='restaurant'?{merchant:S.f.accountMerchant||D[0].id}:{}),name:S.f.accountName});await pkRememberCredential(result.id,result.password);}
    else if(action==='account-enable')await pkApi('/api/ceo',{action:'enable',id});
    else if(action==='account-disable'){if(confirm('Désactiver ce compte et fermer ses sessions ?'))await pkApi('/api/ceo',{action:'disable',id});}
    else if(action==='account-reset'){if(confirm('Remplacer le mot de passe et fermer les sessions de ce compte ?')){const result=await pkApi('/api/ceo',{action:'reset',id});await pkRememberCredential(id,result.password,result.credentialSaved!==false);}}
    else if(action==='bundle'){const components=items(id).filter(i=>+S.f['bundle_'+i.id]>0).map(i=>({id:i.id,q:+S.f['bundle_'+i.id]}));if(!components.length||!S.f.bundleName)throw new Error('Choisissez les produits inclus et le nom du menu.');const menu=mdoc(id);menu.items['x'+Date.now().toString(36)]={n:S.f.bundleName,p:+S.f.bundlePrice,c:'Menus',d:components.map(c=>c.q+' × '+items(id).find(i=>i.id===c.id).n).join(', '),components};await pkApi('/api/menu',{merchant:id,menu});}
    else if(action==='restore'){if(confirm('Restaurer cette présentation ? Les commandes seront conservées.'))await pkApi('/api/ceo',{action:'restore',id});}
    else if(action==='notifications'){if('Notification'in window)await Notification.requestPermission();PK.notifications=true;try{actx=actx||new(window.AudioContext||window.webkitAudioContext)();await actx.resume();beep();}catch{}PK.notice='Alertes activées pendant cette session.';}
  });
};
document.addEventListener('input',event=>{
  if(event.target.dataset.f==='addr'){delete S.f.addrToken;PK.addressMatches=[];PK.addressNote='';}
});
document.addEventListener('change',async event=>{
  if(event.target.hasAttribute('data-pk-remember')){S.f.pk_remember=event.target.checked;return;}
});
window.addEventListener('pagehide',()=>{if(PK.portal!=='driver')return;const sent=GPS.sent&&GPS.owner;pkGpsClear();pkGpsRelease();if(sent){GPS.sent=false;fetch('/api/location',{method:'POST',headers:{'Content-Type':'application/json','X-PK-Portal':'driver'},body:JSON.stringify({stop:true}),keepalive:true}).catch(()=>{});}});
window.addEventListener('pageshow',()=>{if(PK.portal==='driver'&&PK.me)pkStartGPS();});
function pkBackgroundSync(){
  // An unauthenticated login form has no live data to refresh.
  if (PK.portal !== 'client' && !PK.me && document.querySelector('[data-pk-form=login]')) return;
  if (!document.hidden) return pkSync();
}
window.addEventListener('online',pkBackgroundSync);
document.addEventListener('visibilitychange',pkBackgroundSync);
setInterval(pkBackgroundSync,10000); // R02: every 10 s in the foreground; visibilitychange refreshes at once (R03)
if(PK.portal!=='client'){S.tab='pro';document.title='Porto Kitch · '+pkRoles[PK.portal];document.querySelector('link[rel=manifest]').href='/manifest/'+PK.portal+'.webmanifest';document.querySelector('meta[name=apple-mobile-web-app-title]')?.setAttribute('content',pkRoles[PK.portal]+' PK');}
render();pkSync();
