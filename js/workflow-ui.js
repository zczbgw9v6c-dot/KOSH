/* UI continuity, compact professional tools and the customer's delivery journey. */
(()=>{
const root=()=>document.getElementById('app');
const detailState=new Map();
let renderedScope='',didRestoreJourney=false,deepLinkDone=false;
const scope=()=>[PK.portal,PK.tab,S.tab,S.rid||''].join(':');
function detailKey(el,index){const owner=el.closest('[data-order-id]');return (owner?.dataset.orderId||'page')+':'+(el.dataset.uiKey||el.querySelector('summary')?.textContent?.trim()||'menu');}
function rememberDetails(){if(!root())return;root().querySelectorAll('details').forEach((el,i)=>detailState.set(renderedScope+':'+detailKey(el,i),el.open));}
function restoreDetails(){root()?.querySelectorAll('details').forEach((el,i)=>{const key=renderedScope+':'+detailKey(el,i);if(detailState.has(key))el.open=detailState.get(key);});}
function menuGroup(el,title,key){if(el.closest('.ui-menu')||el.matches('article,.pk-filters'))return;el.hidden=false;const group=document.createElement('details');group.className='ui-menu';group.dataset.uiKey=key;const summary=document.createElement('summary');summary.textContent=title;el.before(group);group.append(summary,el);}
const originalOrder=pkOrder;
pkOrder=function(order,id){const h=originalOrder(order,id);const split=h.indexOf('</div>',h.indexOf('<div class="tot big">'))+6;if(split<6)return h;return h.slice(0,split)+`<details class="order-actions" data-ui-key="order-actions-${esc(id)}"><summary>Détails et actions de la commande</summary>`+h.slice(split,h.lastIndexOf('</article>'))+'</details></article>';};
function restaurantOrderActions(){
 if(PK.portal!=='restaurant')return;
 root()?.querySelectorAll('article[data-order-id]').forEach(card=>{
  const id=card.dataset.orderId,order=store.orders[id];if(!order)return;
  const phone=card.querySelector('a[href^="tel:"]');if(phone){phone.classList.add('customer-call');phone.setAttribute('aria-label','Appeler '+order.name+' au '+order.tel);phone.innerHTML='<span aria-hidden="true">↗</span> Appeler · '+esc(order.tel);}
  if(['done','no'].includes(order.st))return;
  const details=card.querySelector('.order-actions');if(!details)return;
  const main=details.querySelector('[data-v="status"]');
  const actions=document.createElement('section');actions.className='restaurant-order-primary';actions.setAttribute('aria-label','Actions de la commande');
  const isNew=['pay','decl'].includes(order.st);
  if(main){
   if(isNew){const hint=document.createElement('p');hint.className='payment-reminder';hint.textContent='Vérifiez que le paiement a bien été reçu avant d’accepter. La déclaration du client ne suffit pas.';actions.append(hint);main.textContent='Accepter · paiement reçu';}
   actions.append(main);
  }
  if(isNew){
   const refuse=document.createElement('details');refuse.className='restaurant-refusal';
   const summary=document.createElement('summary');summary.textContent='Refuser la commande';refuse.append(summary);
   const reason=details.querySelector('[data-f="reason_'+CSS.escape(id)+'"]');const cancel=details.querySelector('[data-v="cancel-order"]');
   if(reason)refuse.append(reason.closest('label')||reason);
   if(cancel){cancel.textContent='Confirmer le refus';refuse.append(cancel);}
   const note=document.createElement('small');note.textContent='Motif obligatoire, visible par le client. Tout paiement reçu doit être remboursé manuellement.';refuse.append(note);actions.append(refuse);
  }
  const total=card.querySelector('.tot.big');(total||details).after(actions);
 });
 const cards=[...root().querySelectorAll('article[data-order-id]')];
 const parent=cards[0]?.parentElement;if(parent&&cards.every(c=>c.parentElement===parent)&&!parent.classList.contains('restaurant-order-grid')){const grid=document.createElement('div');grid.className='restaurant-order-grid';cards[0].before(grid);cards.forEach(c=>grid.append(c));}
}
const clientOrderCard=orderCard;
orderCard=function(order,id,pro){const h=clientOrderCard(order,id,pro);if(pro||PK.portal!=='client')return h;const total=h.indexOf('<div class="tot big">');if(total<0)return h;const split=h.indexOf('</div>',total)+6;const close=h.lastIndexOf('</div>');return h.slice(0,split)+`<details class="order-actions" data-ui-key="customer-order-${esc(id)}"><summary>Détails et options de la commande</summary>`+h.slice(split,close)+'</details>'+h.slice(close);};
const originalOrders=pkOrders;
pkOrders=function(){if(PK.portal==='driver'&&PK.tab==='tour')return pkCourierBox()+pkTour();if(PK.portal==='driver'&&PK.tab==='settings')return pkPasswordForm()+(typeof pnPanel==='function'?pnPanel():'');return originalOrders();};
const originalFirstUse=pnFirstUse;
pnFirstUse=function(){return ['driver','restaurant'].includes(PK.portal)?'':originalFirstUse();};
const originalPanel=pnPanel;
pnPanel=function(first){if(PK.portal==='ceo')return originalPanel(first);return `<div class="box pn-panel"><h3>Notifications sur cet appareil</h3><p>Les alertes sont actives lorsque KOSH est ouvert.</p><p class="mute">${pnPermission()==='granted'?'Autorisation du navigateur accordée.':pnPermission()==='denied'?'Notifications bloquées dans les réglages du navigateur.':'Autorisez les notifications lorsque le navigateur le demande.'}</p><p class="mute">${PN.subscribed?'Notifications en arrière-plan actives.':PN.server?.enabled?'Connexion des notifications en cours.':'Les alertes en arrière-plan nécessitent la configuration du service serveur.'}</p>${pnPermission()!=='granted'?pkButton('Autoriser les notifications','notif-enable','','ghost'):''}</div>`;};
// Foreground alerts are automatic. Browser permission is requested only from an actual user gesture.
PK.notifications=true;
let permissionAsked=false;
document.addEventListener('click',event=>{if(permissionAsked||!(PK.me||PK.portal==='client'&&event.target.closest('[data-a=order]')))return;PK.notifications=true;permissionAsked=true;if(pnPermission()==='default')Notification.requestPermission().then(()=>pnRefresh(true)).catch(()=>{});else pnRefresh(true);},{capture:true});
const oldSync=pkSync;
pkSync=async function(){
 await oldSync();
 PK.notifications=true;
 if(PK.portal==='client'&&PK.data&&!didRestoreJourney){didRestoreJourney=true;const active=Object.values(store.orders).filter(o=>o.mode==='deliv'&&!['done','no'].includes(o.st)).sort((a,b)=>b.t-a.t)[0];if(active&&!['cart','payment','resto','game','ticket'].includes(S.tab)){S.tk=active.id;S.tab='track';render();}}
};
const placeOrder=A.order;
A.order=async function(){const before=new Set(Object.keys(store.orders));await placeOrder();const fresh=Object.values(store.orders).filter(o=>!before.has(o.id)&&o.mode==='deliv').sort((a,b)=>b.t-a.t)[0];if(fresh&&!S.bad){S.tk=fresh.id;S.tab='track';render();}};
const closeReceipt=pkCloseReceipt;
pkCloseReceipt=function(){const id=S.tk,o=store.orders[id];closeReceipt();if(S.tab!=='ticket'&&PK.portal==='client'&&o?.mode==='deliv'&&!['done','no'].includes(o.st)){S.tk=id;S.tab='track';render();}};
const pickupBox=pkPickupBox;
pkPickupBox=function(mid){const m=mdoc(mid),key='access_'+mid;const link=location.origin+'/?restaurant='+encodeURIComponent(mid);return pickupBox(mid)+`<div class="box" data-pk-panel="Accès et consignes"><h3>Accès et consignes</h3><label>Pour le livreur<textarea data-f="${key}_driver" maxlength="1000">${esc(S.f[key+'_driver']??m.driverAccessNote??'')}</textarea></label><label>Pour le client en retrait<textarea data-f="${key}_pickup" maxlength="1000">${esc(S.f[key+'_pickup']??m.pickupAccessNote??'')}</textarea></label>${pkButton('Enregistrer les consignes','access-save',mid)}</div><div class="box" data-pk-panel="Lien de mon établissement"><h3>Lien de mon établissement</h3><p class="mute">Partagez ce lien pour ouvrir directement votre carte KOSH. Sur cet aperçu, il fonctionne uniquement sur ce Mac.</p><input aria-label="Lien de mon établissement" readonly value="${esc(link)}">${pkButton('Copier le lien','restaurant-link',mid,'ghost')}</div>`;};
const actions=A.pk;
A.pk=function(action,button){const mid=button?.dataset.id;if(action==='access-save')return pkDo(async()=>{const m=mdoc(mid),key='access_'+mid;await pkApi('/api/access-notes',{merchant:mid,driverAccessNote:S.f[key+'_driver']??m.driverAccessNote??'',pickupAccessNote:S.f[key+'_pickup']??m.pickupAccessNote??''});PK.notice='Consignes enregistrées.';});if(action==='restaurant-link')return pkDo(async()=>{await navigator.clipboard.writeText(location.origin+'/?restaurant='+encodeURIComponent(mid));PK.notice='Lien de votre établissement copié.';});return actions(action,button);};
const cards=homeList;
homeList=function(){const q=nz(S.q||'').trim();if(q.length<2)return cards();const results=D.flatMap(m=>items(m.id).filter(p=>nz(p.n+' '+(p.d||'')).includes(q)).map(p=>({m,p}))).slice(0,24);return (results.length?`<section class="search-products"><h3>Produits correspondants</h3>${results.map(({m,p})=>`<button class="product-result" data-a="open" data-v="${esc(m.id)}" data-i="${esc(p.id)}"><span><b>${esc(p.n)}</b><small>${esc(m.name)} · ${esc(p.c||'Carte')}</small></span><span>${eur(p.p)} ↗</span></button>`).join('')}</section>`:'')+cards();};
const originalOpen=A.open;
A.open=function(value,button){originalOpen(value,button);S.productTarget=button?.dataset.i||null;S.highlightProduct=S.productTarget;};
function clientAccess(){if(PK.portal!=='client')return;const o=store.orders[S.tk];if(o?.mode==='pick'&&o.pickupAccessNote&&!root().querySelector('.pickup-access')){const el=document.createElement('div');el.className='info pickup-access';el.textContent='Accès au retrait : '+o.pickupAccessNote;root().append(el);}}
const clientMaps=new Map();
document.addEventListener('toggle',event=>{if(event.target.tagName==='DETAILS'&&event.target.open)requestAnimationFrame(()=>{for(const entry of pkMaps.values())if(entry.node.offsetHeight)entry.map.invalidateSize(false);for(const entry of clientMaps.values())if(entry.node.offsetHeight)entry.map.invalidateSize(false);});},true);
function deliveryUI(retained){
 if(PK.portal!=='client')return;
 root().querySelectorAll('[data-a="pk"][data-v="notifications"]').forEach(b=>b.remove());
 root().querySelectorAll('[data-a="track"]').forEach(b=>b.remove());
 root().querySelectorAll('.trk-eta').forEach(el=>el.remove());
 const o=store.orders[S.tk],track=root().querySelector('.trk');if(!track||!o)return;
 const title=track.querySelector('.trk-h1');if(title){title.textContent=stLabel(o);title.dataset.st=String(({pay:0,decl:0,new:0,no:0,ok:1,prep:1,ready:1,go:2,done:3})[o.st]??0);}
 const sub=track.querySelector('.trk-sub');if(sub)sub.textContent=o.message||'Votre commande avance. Retrouvez ici les dernières informations.';
 const eta=Number(o.deliveryEta),known=Number.isFinite(eta)&&eta>pkTime();
 const banner=document.createElement('div');banner.className='delivery-arrival';banner.innerHTML=`<span>Livraison à votre porte</span><strong>${known?pkClock(eta):o.st==='done'?'Livrée':'Estimation en attente'}</strong>${known?`<small>Dans environ ${Math.max(1,Math.ceil((eta-pkTime())/60000))} min</small>`:''}`;track.querySelector('.trk-top')?.append(banner);
 const progress=document.createElement('div');progress.className='delivery-progress';const pct=({pay:5,decl:10,ok:20,prep:40,ready:60,go:80,done:100,no:0})[o.st]??0;progress.innerHTML=`<i style="width:${pct}%"></i>`;track.append(progress);
 const points=o.courierPositions||[];
 const card=document.createElement('section');card.className='delivery-map-card';card.innerHTML=`<div class="delivery-map-heading"><div><span class="eyebrow">VOTRE LIVRAISON</span><h3>${points.length?'Votre livreur est en route':'Suivi de votre livreur'}</h3></div><span class="live-pill">${points.length?'● En direct':'En attente'}</span></div>${points.length?'<div class="customer-live-map" aria-label="Position du livreur de votre commande"></div>':'<p class="mute">La position apparaîtra après la collecte, dès qu’un point récent sera disponible.</p>'}`;track.after(card);
 if(points.length&&typeof L!=='undefined'){
  const placeholder=card.querySelector('.customer-live-map');let entry=retained.get(o.id);
  if(entry){placeholder.replaceWith(entry.node);entry.map.invalidateSize(false);entry.markers.forEach(m=>entry.map.removeLayer(m));entry.markers=[];}
  else{const map=L.map(placeholder,{scrollWheelZoom:false,zoomControl:false});L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(map);L.control.zoom({position:'bottomright'}).addTo(map);entry={map,node:placeholder,markers:[]};clientMaps.set(o.id,entry);}
  points.forEach(p=>entry.markers.push(L.marker([p.latitude,p.longitude],{icon:L.divIcon({className:'courier-map-pin',html:'🚲',iconSize:[42,42],iconAnchor:[21,21]})}).addTo(entry.map)));
  const coords=points.map(p=>[p.latitude,p.longitude]);if(Number.isFinite(o.destLat)&&Number.isFinite(o.destLon)){coords.push([o.destLat,o.destLon]);entry.markers.push(L.marker([o.destLat,o.destLon],{icon:L.divIcon({className:'destination-map-pin',html:'⌂',iconSize:[34,34],iconAnchor:[17,17]})}).addTo(entry.map));}
  if(!retained.has(o.id))entry.map.fitBounds(coords,{padding:[45,45],maxZoom:15});requestAnimationFrame(()=>entry.map.invalidateSize(false));
 }
}
const baseRender=render;
render=function(){
 rememberDetails();const focused=document.activeElement;const focusId=focused?.id;const focusField=focused?.dataset?.f;const selection=typeof focused?.selectionStart==='number'?[focused.selectionStart,focused.selectionEnd]:null;
 const retained=new Map(clientMaps);
 if(PK.portal==='client'&&PK.data&&!deepLinkDone){deepLinkDone=true;const mid=new URLSearchParams(location.search).get('restaurant');if(D.some(m=>m.id===mid)){S.rid=mid;S.tab='resto';S.rmode='resto';}}
 if(PK.portal==='client'&&S.tab==='orders'){
  const active=Object.values(store.orders).filter(o=>o.mode==='deliv'&&!['done','no'].includes(o.st)).sort((a,b)=>b.t-a.t)[0];
  if(active){S.tk=active.id;S.tab='track';}
 }
 baseRender();renderedScope=scope();
 if(PK.portal!=='client'&&PK.me){
  root().querySelectorAll('.pn-panel details').forEach(e=>{if(PK.portal!=='ceo')e.remove();});
  const workspace=root().querySelector('.pk-workspace');if(workspace){[...workspace.children].forEach((el,i)=>{const title=el.getAttribute('data-pk-panel')||el.querySelector('h3')?.textContent;if(title&&title!=='Tout est calme ici'&&el.classList.contains('box')&&!el.matches('article,.pk-filters')&&!(PK.tab==='orders'&&el.classList.contains('pk-prep')))menuGroup(el,title,'panel-'+title);});}
  root().querySelectorAll('[data-order-id]').forEach(el=>{const order=store.orders[el.dataset.orderId];if(order?.driverAccessNote&&PK.portal==='driver'){const note=document.createElement('p');note.className='info';note.textContent='Accès à la collecte : '+order.driverAccessNote;el.querySelector('.order-actions')?.prepend(note);}});
 }
 deliveryUI(retained);clientAccess();restoreDetails();restaurantOrderActions();
 const focusReplacement=focusId?document.getElementById(focusId):focusField?root().querySelector('[data-f="'+CSS.escape(focusField)+'"]'):null;
 if(focusReplacement){const replacement=focusReplacement;replacement.focus({preventScroll:true});if(selection&&replacement.setSelectionRange)try{replacement.setSelectionRange(...selection);}catch{}}
 if(S.highlightProduct&&S.tab==='resto')document.getElementById('it-'+S.highlightProduct)?.classList.add('product-target');
 if(S.productTarget&&S.tab==='resto'){const el=document.getElementById('it-'+S.productTarget);if(el){el.classList.add('product-target');requestAnimationFrame(()=>el.scrollIntoView({block:'center',behavior:'smooth'}));S.productTarget=null;}}
 const liveId=PK.portal==='client'&&S.tab==='track'?S.tk:null;for(const [id,entry] of retained)if(id!==liveId||!root().contains(entry.node)){entry.map.remove();clientMaps.delete(id);}
};
render();
})();
