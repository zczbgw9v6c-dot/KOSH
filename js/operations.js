/* Professional workflows: reception modes, shared courier offers, receipts and compact navigation. */
function pkReceptionModes(mid){
  const menu=mdoc(mid),local=menu.service||{},global=PK.data?.conf||{},effective=menu.effectiveService;
  const delivery=effective?effective.glo:global.glo!==false&&local.glo!==false;
  return {deliv:delivery,pick:effective?effective.pickup:global.pickup!==false&&local.pickup!==false,uber:effective?effective.uber:!delivery&&global.uber!==false&&local.uber!==false};
}
const receptionCart=vCart;
vCart=function(sh){
  const modes=pkReceptionModes(S.cartR),available=Object.keys(modes).filter(key=>modes[key]);
  if(!modes[S.f.mode])S.f.mode=available[0]||'pick';
  let html=receptionCart(sh).replace(/<button[^>]*data-a="mode"[^>]*data-v="([^"]+)"[^>]*>[\s\S]*?<\/button>/g,(button,key)=>modes[key]?button:'');
  if(!available.length)html=html.replace('<button class="btn gold" data-a="order">','<p class="alert">Aucun mode de réception disponible pour cet établissement.</p><button class="btn gold" data-a="order" disabled>');
  return html;
};
function pkCourierBox(){
  const c=PK.data?.courier||{open:false,capacity:5,load:0,available:5};
  const meter=Array.from({length:c.capacity},(_,i)=>`<i class="${i<c.load?'on':''}"></i>`).join('');
  return `<div class="box"><div class="row sp"><h3>Service et capacité</h3><span class="pill ${c.open?'ok':'bad'}">${c.open?'Service ouvert':'Service fermé'}</span></div><p class="mute">${c.open?'Vous recevez les courses de toutes les enseignes.':'Un CEO ouvre votre service pour chaque tournée. Vous pouvez terminer les parts déjà acceptées.'}</p><p><b>${c.load} sac${c.load>1?'s':''} engagé${c.load>1?'s':''}</b> sur ${c.capacity} · <b>${c.available}</b> place${c.available>1?'s':''} libre${c.available>1?'s':''}</p><div class="pk-meter" aria-hidden="true">${meter}</div><details><summary>Ma capacité de sacs</summary>${pkSelect('courierCapacity','Capacité (sacs)',Array.from({length:10},(_,i)=>[String(i+1),String(i+1)]),S.f.courierCapacity??String(c.capacity))}${pkButton('Enregistrer la capacité','capacity-save','','ghost')}</details></div>`;
}
function pkOffers(){
  const c=PK.data?.courier||{open:false};
  const offers=Object.values(PK.data?.offers||{}).sort((a,b)=>a.t-b.t);
  const card=order=>{
    const limit=order.proposal?order.proposal.bags:order.remaining,max=Math.min(limit,order.available),key='bags_'+order.id;
    const choice=order.unknownLoad?'<p class="alert">Charge inconnue : le restaurant n’a pas encore indiqué le nombre de sacs.</p>':max<1?'<p class="alert">Capacité pleine : livrez ou libérez une part pour accepter ces sacs.</p>':pkSelect(key,'Sacs que je prends',Array.from({length:max},(_,i)=>[String(max-i),String(max-i)]),S.f[key]??String(order.suggested));
    return `<article class="box offer-card" data-order-id="${esc(order.id)}"><h3>${esc(merch(order.m).name)}</h3><p>${esc(order.m==='chabad-porto'?'Adresse de collecte communiquée par le restaurant':mdoc(order.m).address||'Adresse de collecte à confirmer auprès du restaurant')}</p><p class="mute">#${esc(order.code)} · ${pkDate(order.t)} · ${stLabel(order)}</p>${order.prepEta&&order.st==='prep'?`<p class="info">⏱ Fin de préparation estimée : <b>${pkClock(order.prepEta)}</b></p>`:''}${order.proposal?`<p class="info">Proposition CEO : <b>${order.proposal.bags} sac${order.proposal.bags>1?'s':''}</b> pour vous.</p>`:''}${order.unknownLoad?'':`<div class="pk-bags"><span class="pill gold">${order.remaining} sac${order.remaining>1?'s':''} à prendre</span><span class="pill">${order.bags} au total</span></div>`}${choice}${!order.unknownLoad&&max>=1?pkButton('Accepter la course','accept-course',order.id):''}${order.proposal?`<details><summary>Refuser la proposition</summary>${inp('reason_'+order.id,'Motif')}${pkButton('Refuser','part-release',order.id,'ghost')}</details>`:''}</article>`;
  };
  return `<div class="box"><h3>Courses proposées · toutes les enseignes</h3><p class="mute">${c.open?'Les commandes payées apparaissent ici avec les sacs encore libres. Acceptez une part pour voir les coordonnées du client.':'Service fermé : aucune nouvelle course ne vous est proposée.'}</p>${pkButton('Actualiser les courses','refresh','','ghost')}</div>${offers.map(card).join('')}${c.open&&!offers.length?'<p class="mute">Aucune nouvelle course disponible pour le moment.</p>':''}`;
}
function pkPasswordForm(){
  const field=(key,label,auto)=>`<label for="f-${key}">${label}<input type="password" id="f-${key}" name="${key}" data-f="${key}" value="${esc(S.f[key]||'')}" autocomplete="${auto}" ${auto==='new-password'?'minlength="12"':''} required></label>`;
  return `<form class="box" data-pk-panel="Mon mot de passe" data-pk-form="password" method="post" action="#"><h3>Choisir mon mot de passe</h3><p class="mute">Au moins 12 caractères. Ce mot de passe professionnel sera conservé dans le coffre chiffré consultable par les associés CEO (chaque consultation est journalisée). Toutes vos sessions seront fermées : vous devrez vous reconnecter.</p><input type="email" name="username" value="${esc(PK.me?.login||'')}" autocomplete="username" hidden readonly>${field('currentPassword','Mot de passe actuel','current-password')}${field('newPassword','Nouveau mot de passe','new-password')}${field('confirmPassword','Confirmer le nouveau mot de passe','new-password')}<button type="submit" class="btn sm gold" ${PK.busy?'disabled':''}>Enregistrer mon mot de passe</button></form>`;}
/* C20: a revealed password is kept in memory only, hidden after 60 s, on page hide and when the app goes to background. */
function pkShowCredential(id,password){
  PK.credential={id,password};clearTimeout(PK.credentialTimer);
  PK.credentialTimer=setTimeout(()=>{if(PK.credential?.id===id){PK.credential=null;render();}},60000);
}
function pkHideCredential(){if(!PK.credential)return;PK.credential=null;clearTimeout(PK.credentialTimer);render();}
window.addEventListener('pagehide',()=>{PK.credential=null;});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pkHideCredential();});
async function pkRememberCredential(id,password,saved=true){
  pkShowCredential(id,password);
  const message=saved?'Mot de passe enregistré dans le coffre CEO':'Mot de passe client généré (non conservé dans le coffre professionnel)';
  try{await navigator.clipboard.writeText(password);PK.notice=message+' et copié dans le presse-papiers.';}
  catch{PK.notice=message+'. Le navigateur a empêché la copie automatique : utilisez « Copier ».';}
}
function pkCredentialView(){
  if(PK.portal!=='ceo'||PK.me?.role!=='ceo'||!PK.credential)return '';
  const account=PK.data?.accounts?.find(a=>a.id===PK.credential.id);
  return `<section class="pk-credential" role="status"><h3>Mot de passe professionnel</h3><p>${esc(account?.login||'Compte créé')}</p><label>Mot de passe<input readonly type="text" value="${esc(PK.credential.password)}" autocomplete="off"></label><div class="row">${pkButton('Copier','credential-copy','','ghost')}${pkButton('Masquer','credential-hide','','ghost')}</div></section>`;
}
PK.receiptQueue=[];PK.receiptSeen=new Set();
function pkOpenReceipt(id){
  if(PK.portal==='client'&&S.tab==='game')arcade.finish();
  S.tk=id;S.tkBack=PK.portal==='client'?'orders':'pro';
  if(PK.portal==='client')S.tab='ticket';else PK.ticket=true;
}
function pkQueueReceipts(data,previous){
  if(!previous||PK.portal!=='client')return;
  for(const [id,order] of Object.entries(data.orders)){
    if(order.paid&&order.st!=='no'&&!previous.orders?.[id]?.paid&&!PK.receiptSeen.has(id)){
      PK.receiptSeen.add(id);PK.receiptQueue.push(id);
    }
  }
  if(PK.receiptQueue.length&&!PK.ticket&&S.tab!=='ticket'&&S.tab!=='game'){pkOpenReceipt(PK.receiptQueue.shift());return true;}
  return false;
}
function pkCloseReceipt(){PK.ticket=false;if(PK.receiptQueue.length)pkOpenReceipt(PK.receiptQueue.shift());else S.tab=PK.portal==='client'?'orders':'pro';render();}
const operationsTicket=vTicket;
vTicket=function(){return operationsTicket().replace(/data-a="tab" data-v="[^"]+"/,'data-a="pk" data-v="receipt-close"');};
const operationsActions=A.pk;
A.pk=function(action,button){
  const id=button?.dataset.id||'';
  if(action==='receipt-close'){pkCloseReceipt();return;}
  if(action==='credential-hide'){pkHideCredential();return;}
  if(action==='credential-copy')return pkDo(async()=>{if(PK.credential){await navigator.clipboard.writeText(PK.credential.password);PK.notice='Mot de passe copié.';}});
  if(action==='credential-show')return pkDo(async()=>{const result=await pkApi('/api/ceo',{action:'credential',id});pkShowCredential(id,result.password);});
  if(action==='accept-course')return pkDo(async()=>{const offer=PK.data?.offers?.[id]||{};const bags=+(S.f['bags_'+id]??offer.suggested)||undefined;const result=await pkApi('/api/parts',{action:'accept',order:id,bags});delete S.f['bags_'+id];PK.notice=`Part acceptée : ${result.part.bags} sac${result.part.bags>1?'s':''}. Vous pouvez partir pour la collecte.`;});
  if(action==='capacity-save')return pkDo(async()=>{await pkApi('/api/courier',{action:'capacity',capacity:+S.f.courierCapacity||PK.data.courier.capacity});delete S.f.courierCapacity;PK.notice='Capacité enregistrée.';});
  if(['part-heading','part-collect','part-deliver','part-release'].includes(action))return pkDo(async()=>{
    const [order,part]=id.split(':'),verb=action.slice(5),body={action:verb,order};if(part)body.part=part;
    if(verb==='release'){const reason=(S.f['reason_'+order]||'').trim();if(reason.length<3)throw new Error('Indiquez le motif d’annulation de la course.');body.reason=reason;}
    await pkApi('/api/parts',body);if(verb==='release')S.f['reason_'+order]='';
    if(PK.portal==='driver'&&['heading','collect'].includes(verb)&&typeof pkStartGPS==='function')await pkStartGPS().catch(()=>{});
    PK.notice={heading:'En route pour la collecte.',collect:'Sacs récupérés : bonne route.',deliver:'Livraison confirmée.',release:'Course annulée : les sacs sont de nouveau proposés.'}[verb];});
  if(action==='bags-save')return pkDo(async()=>{const count=Number(S.f['bagcount_'+id]);if(!Number.isInteger(count)||count<1)throw new Error('Indiquez un nombre entier de sacs (au moins 1).');await pkApi('/api/orders/action',{id,action:'bags',bags:count});delete S.f['bagcount_'+id];PK.notice='Nombre de sacs enregistré.';});
  if(action==='driver-service')return pkDo(async()=>{const [driver,open]=id.split(':');await pkApi('/api/ceo',{action:'driver-service',id:driver,open:open==='1'});PK.notice=open==='1'?'Service du livreur ouvert.':'Service fermé : le livreur termine ses parts en cours.';});
  if(action==='driver-capacity')return pkDo(async()=>{await pkApi('/api/ceo',{action:'capacity',id,capacity:+S.f['cap_'+id]});delete S.f['cap_'+id];PK.notice='Capacité enregistrée.';});
  if(action==='mode-toggle')return pkDo(async()=>{const [merchant,key]=JSON.parse(id),service=merchant?mdoc(merchant).service||{}:PK.data.config||{};await pkApi('/api/service',{merchant,action:key,enabled:pkModeOff(service,key)});});
  if(action==='password-save')return pkDo(async()=>{
    if((S.f.newPassword||'').length<12)throw new Error('Choisissez au moins 12 caractères.');
    if(S.f.newPassword!==S.f.confirmPassword)throw new Error('Les deux nouveaux mots de passe ne correspondent pas.');
    await pkApi('/api/password',{current:S.f.currentPassword,password:S.f.newPassword,confirm:S.f.confirmPassword});
    S.f.currentPassword=S.f.newPassword=S.f.confirmPassword='';PK.me=null;PK.data=null;PK.initialized=false;PK.credential=null;S.pro=null;PK.notice='Mot de passe enregistré. Reconnectez-vous avec votre nouveau mot de passe.';
  });
  if(action==='event-edit'){const e=PK.data?.events?.[id];if(!e)return;PK.eventEdit=id;Object.assign(S.f,{ev_title:e.title||'',ev_kind:e.day?'once':'weekly',ev_day:e.day||'',ev_dow:String(e.dow??5),ev_time:e.time||'',ev_place:e.place||'',ev_img:e.img||''});render();return;}
  if(action==='event-cancel'){PK.eventEdit=null;for(const k of ['ev_title','ev_day','ev_time','ev_place','ev_img'])S.f[k]='';render();return;}
  if(action==='event-save')return pkDo(async()=>{
    const once=(S.f.ev_kind||'weekly')==='once',event={title:(S.f.ev_title||'').trim(),time:S.f.ev_time||'',place:(S.f.ev_place||'').trim(),img:S.f.ev_img||''};
    if(!event.title||!/^\d{1,2}:\d{2}$/.test(event.time))throw new Error('Indiquez un titre et une heure.');
    if(once){if(!S.f.ev_day)throw new Error('Choisissez la date.');event.day=S.f.ev_day;}else event.dow=Number(S.f.ev_dow??5);
    await pkApi('/api/events',{...(PK.eventEdit?{id:PK.eventEdit}:{}),event});
    PK.notice=PK.eventEdit?'Événement modifié.':'Événement ajouté à l’agenda.';PK.eventEdit=null;for(const k of ['ev_title','ev_day','ev_time','ev_place','ev_img'])S.f[k]='';});
  if(action==='event-remove'){if(!confirm('Supprimer cet événement de l’agenda ?'))return;return pkDo(async()=>{await pkApi('/api/events',{id,remove:true});if(PK.eventEdit===id)PK.eventEdit=null;PK.notice='Événement supprimé.';});}
  if(action==='calj-save'||action==='calj-remove-key')return pkDo(async()=>{
    if(action==='calj-remove-key'&&!confirm('Retirer la clé CalJ du coffre ?'))return;
    const result=await pkApi('/api/ceo',{action:'calj',enabled:!!S.f.calj_enabled,city:S.f.calj_city,country:S.f.calj_country,key:action==='calj-save'?S.f.calj_key||'':'',removeKey:action==='calj-remove-key'});
    S.f.calj_key='';PK.caljInit=false;PK.notice=result.calj.enabled?'Source CalJ enregistrée. Aucun horaire n’est importé tant que l’accès n’est pas vérifié.':'Source CalJ désactivée.';});
  return operationsActions(action,button);
};
/* Forms: Enter submits, password managers fill them; values are read from the form itself on submit. */
document.addEventListener('submit',event=>{
  const form=event.target?.closest?.('form[data-pk-form]');if(!form)return;event.preventDefault();
  const data=new FormData(form),value=key=>String(data.get(key)||'');
  if(form.dataset.pkForm==='login'){S.f.pk_login=value('username');S.f.pk_password=value('password');S.f.pk_remember=data.get('remember')!==null;A.pk('login',{dataset:{id:''}});}
  if(form.dataset.pkForm==='password'){S.f.currentPassword=value('currentPassword');S.f.newPassword=value('newPassword');S.f.confirmPassword=value('confirmPassword');A.pk('password-save',{dataset:{id:''}});}
});
const pkSections={ceo:[['orders','Commandes'],['menus','Enseignes'],['accounts','Comptes'],['settings','Réglages'],['history','Historique'],['agenda','Agenda']],restaurant:[['orders','Commandes'],['menu','Ma carte'],['promos','Promotions'],['settings','Réglages']]};
PK.panels={};
function pkCompactPanels(){
  if(!PK.me||!pkSections[PK.portal]||PK.ticket)return;
  const workspace=document.querySelector('.pk-workspace');if(!workspace)return;
  const navigation=document.createElement('label');navigation.className='pk-navigation';navigation.innerHTML=`Espace ${pkRoles[PK.portal]}<select id="pk-section">${pkSections[PK.portal].map(([key,title])=>`<option value="${key}" ${PK.tab===key?'selected':''}>${title}</option>`).join('')}</select>`;workspace.before(navigation);
  // Orders stay together. Other screens expose one function at a time.
  if(['orders','agenda'].includes(PK.tab))return;
  const panels=[...workspace.children].filter(el=>!el.hasAttribute('data-pk-fixed')&&(el.classList.contains('box')||el.hasAttribute('data-pk-panel')));
  if(panels.length<2)return;
  const titles=panels.map((el,index)=>el.getAttribute('data-pk-panel')||el.querySelector('h3')?.textContent||el.querySelector('h2')?.textContent||'Fonction '+(index+1));
  const key=PK.portal+':'+PK.tab;let selected=PK.panels[key]||titles[0];
  if(!titles.includes(selected))selected=titles[0];PK.panels[key]=selected;
  const menu=document.createElement('label');menu.className='pk-functions';menu.innerHTML=`Fonction<select id="pk-function">${titles.map(title=>`<option value="${esc(title)}" ${title===selected?'selected':''}>${esc(title)}</option>`).join('')}</select>`;workspace.prepend(menu);
  panels.forEach((el,i)=>{el.hidden=titles[i]!==selected;});
}
const operationsRender=render;
render=function(){operationsRender();pkCompactPanels();};
document.addEventListener('change',event=>{
  if(event.target.dataset?.f==='ev_kind'){S.f.ev_kind=event.target.value;render();return;}
  if(event.target.dataset?.f==='accountRole'){S.f.accountRole=event.target.value;render();return;}  // C09: establishment only for restaurateurs
  if(event.target.hasAttribute?.('data-pk-calj')){S.f.calj_enabled=event.target.checked;return;}
  if(event.target.id==='pk-section'){PK.tab=event.target.value;PK.credential=null;PK.error='';render();}
  if(event.target.id==='pk-function'){PK.panels[PK.portal+':'+PK.tab]=event.target.value;render();}
});
render();
