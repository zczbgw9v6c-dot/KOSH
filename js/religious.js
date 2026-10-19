/* Hebcal data follows the selected agenda date; network updates never replace a focused field. */
(()=>{
const cache=new Map(),minyanCache=new Map();
function minyanCard(office,date){const state=minyanCache.get(date)?.[office],count=state?.count||0;
 return `<div class="minyan-box" data-minyan-date="${date}" data-minyan-office="${office}"><div class="minyan-status ${count>=10?'confirmed':''}"><strong>${count>=10?'✓ '+count+' / 10':count+' / 10'}</strong><span>${count>=10?'Minyan confirmé':''}</span></div><button type="button" data-minyan-join="${office}" data-date="${date}" aria-pressed="${!!state?.joined}">${state?.joined?'Inscrit · Annuler':'S’inscrire'}</button></div>`;
}
function refreshMinyan(date){fetch('/api/minyan?date='+date,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{minyanCache.set(date,data);document.querySelectorAll('[data-minyan-date="'+date+'"]').forEach(el=>{el.outerHTML=minyanCard(el.dataset.minyanOffice,date);});}).catch(()=>{});}

const fmt=iso=>iso?new Date(iso).toLocaleTimeString('fr-FR',{timeZone:'Europe/Lisbon',hour:'2-digit',minute:'2-digit'}):'Indisponible';
const dateText=iso=>new Date(iso.slice(0,10)+'T12:00:00Z').toLocaleDateString('fr-FR',{timeZone:'Europe/Lisbon',day:'numeric',month:'short'});
const labels={alotHaShachar:'Aube · 16,1°',misheyakir:'Talit et téfilines · 11,5°',sunrise:'Lever du soleil',sofZmanShma:'Fin du Chema · GRA',sofZmanTfilla:'Fin de la téfila · GRA',chatzot:'Midi solaire',minchaGedola:'Min’ha guédola',minchaKetana:'Min’ha kétana',plagHaMincha:'Plag hamin’ha',sunset:'Coucher du soleil',tzeit85deg:'Nuit · 8,5°'};
// Use the scheduled tractate and folio, never a generic today redirect.
function dafFrenchStudy(daf){
 const match=(daf?.title||'').match(/^(.+?)\s+(\d+)$/);if(!match)return '';
 const aliases={'Bechorot':'bekhorot','Bekhorot':'bekhorot','Berachot':'berakhot','Shabbos':'shabbat','Eiruvin':'eruvin','Rosh Hashana':'roch-hachana','Rosh Hashanah':'roch-hachana','Moed Katan':'moed-katan','Bava Kamma':'baba-kama','Bava Metzia':'baba-metsia','Bava Batra':'baba-batra','Avodah Zarah':'avoda-zara','Chullin':'houlin','Chagigah':'haguiga',"Ta'anit":"taanit",'Taanit':'taanit'};
 const slug=aliases[match[1]]||match[1].toLowerCase().replace(/[^a-z ]/g,'').trim().replace(/ +/g,'-');
 return 'https://www.torah-box.com/torah-pdf/talmud/'+slug+'/'+Number(match[2])+'.html';
}
const base=vAgenda;
vAgenda=function(){
 const html=base();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+(S.day||0));const date=d.toISOString().slice(0,10);
 if(!cache.has(date)){
  cache.set(date,{loading:true});
  fetch('/api/religious?date='+date,{cache:'no-store'}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error);cache.set(date,data);}).catch(()=>cache.set(date,{error:true})).finally(()=>{if(S.tab==='agenda'||(PK.portal==='ceo'&&PK.tab==='agenda'))soft();});
 }
 if(!minyanCache.has(date)){minyanCache.set(date,{});refreshMinyan(date);}
 const data=cache.get(date);
 let content='Chargement des horaires…';
 if(data.error)content='Horaires indisponibles pour cette date. Rechargez la page pour réessayer.';
 else if(!data.loading){
 const daf=data.items.find(x=>x.category==='dafyomi'&&x.date.slice(0,10)===date);
 const frenchStudy=dafFrenchStudy(daf);
 const week=data.items.filter(x=>x.category!=='dafyomi');
 const parasha=week.find(x=>x.category==='parashat');
 content=`<div class="faith-top"><section class="shabbat-panel"><div class="faith-kicker">✦ CHABBAT À PORTO</div><h3>${parasha?esc(parasha.title.replace('Parashat ','Paracha ')):'Chabbat de la semaine'}</h3><div class="shabbat-pair">${week.filter(x=>['candles','havdalah'].includes(x.category)).map(x=>`<div><span>${x.category==='candles'?'Allumage des bougies':'Sortie de Chabbat'}</span><strong>${fmt(x.date)}</strong><small>${dateText(x.date)}</small></div>`).join('')||'<p>Horaires indisponibles</p>'}</div></section><section class="daf-panel" aria-label="Daf Hayomi du ${dateText(date)}"><header class="daf-header"><div><div class="faith-kicker">LE RENDEZ-VOUS QUOTIDIEN</div><h3>Daf Hayomi <span lang="he" dir="rtl">דף היומי</span></h3></div><time datetime="${date}">${dateText(date)}</time></header><div class="daf-reading"><span class="daf-book" aria-hidden="true">✦</span><div><span class="daf-label">${daf?'LA PAGE À ÉTUDIER':'ÉTUDE DU JOUR'}</span><strong>${daf?esc(daf.title):'Page indisponible'}</strong>${daf?.hebrew?`<span class="daf-hebrew" lang="he" dir="rtl">${esc(daf.hebrew)}</span>`:''}</div></div><footer class="daf-footer"><span>Cours en français<br>avec Torah-Box</span>${frenchStudy?`<button type="button" data-daf-study="${esc(frenchStudy)}" data-daf-title="${esc(daf.title)}" aria-haspopup="dialog">Vidéo et textes <span aria-hidden="true">↗</span></button>`:'<small>Calendrier quotidien · Hebcal</small>'}</footer></section></div><details class="zmanim-panel" open><summary class="zmanim-toggle">Tous les zmanim du jour <span>⌄</span></summary><div class="faith-heading"><div><div class="faith-kicker">LES REPÈRES DE LA JOURNÉE</div><h3>Zmanim</h3></div><span class="faith-date">${dateText(date)} · Porto</span></div><div class="religious-times">${Object.entries(labels).map(([key,label])=>`<div class="zman-tile"><span>${label.split(' · ')[0]}</span><strong>${fmt(data.times[key])}</strong><small>${label.includes(' · ')?label.split(' · ')[1]:'Heure locale'}</small></div>`).join('')}</div></details>`;
 }
 const references=data.loading||data.error?'':`<aside class="agenda-prayer-references" aria-label="Repères pour la prière"><h4>Repères du jour</h4><dl><div><dt>Limite du Chema · GRA</dt><dd>${fmt(data.times.sofZmanShma)}</dd></div><div><dt>Limite du Chema · MGA</dt><dd>${fmt(data.times.sofZmanShmaMGA)}</dd></div>${data.tefillinStatus==='shabbat'||data.tefillinStatus==='holiday'?'<div><dt>Téfilines</dt><dd>Pas de pose ce jour</dd></div>':data.tefillinStatus==='chol_hamoed'?'<div><dt>Téfilines · Hol hamoed</dt><dd>Selon votre usage</dd></div>':`<div><dt>Talit et téfilines · début</dt><dd>${fmt(data.times.misheyakir)}</dd></div><div><dt>Téfilines · avant le coucher</dt><dd>${fmt(data.times.sunset)}</dd></div>`}</dl><small>Horaires calculés pour Porto, distincts des offices. Usage des fêtes et de Hol hamoed à confirmer auprès de votre communauté.</small></aside>`;
 const panel=`<section class="faith-agenda" aria-label="Horaires juifs de Porto">${data.loading||data.error?`<div class="box" role="status">${content}</div>`:content}<details class="faith-source"><summary>Source et méthodes de calcul</summary><p>Horaires de Porto · Europe/Lisbon. Allumage : 18 min avant le coucher du soleil. Sortie : soleil à 8,5°. Zmanim calculés, distincts des horaires des offices ; conventions à confirmer auprès de votre communauté.</p><a href="https://www.hebcal.com/" target="_blank" rel="noopener noreferrer">Hebcal · CC BY 4.0 ↗</a></details></section>`;
 const halakha=`<button type="button" class="halakha-card" data-halakha-video aria-haspopup="dialog"><div><span class="faith-kicker">UN MOMENT POUR APPRENDRE</span><h3>La halakha du jour</h3><p>Une loi pratique expliquée par un Rav, en quelques minutes.</p><span class="halakha-action">Découvrir le cours <span aria-hidden="true">↗</span></span><small>Programme quotidien Halakha Time · Torah-Box</small></div></button>`;
 const controls=html.match(/<div class="wkh">[\s\S]*?<div class="wkdots">[\s\S]*?<\/div>/)?.[0]||'';
 const events=html.match(/<div class="evc"[\s\S]*?(?=<p class="mute">)/)?.[0]||'';
 const prayerRows=dayRows(S.day||0).rows;
 const morning=`<div class="evc" style="background-image:url('/img/ev-minha.jpg')"><div class="evt"><time>À confirmer</time><b>Chaharit</b><span>Office du matin · horaire à confirmer auprès de la communauté</span></div>${minyanCard('chaharit',date)}</div>`;
 const officeEvents=events.replace(/(<div class="evc"[\s\S]*?<\/div>)(<\/div>)/g,(whole,body,end)=>{const text=body.toLowerCase();const office=text.includes('minha')||text.includes('min’ha')?'minha':text.includes('arvit')?'arvit':null;return office?body+minyanCard(office,date)+end:whole;});
 let prayerEvents=morning+officeEvents;
 for(const [key,label] of [['minha','Minha'],['arvit','Arvit']])if(!prayerEvents.includes('data-minyan-office="'+key+'"'))prayerEvents+=`<div class="evc" style="background-image:url('/img/ev-${key}.jpg')"><div class="evt"><time>À confirmer</time><b>${label}</b></div>${minyanCard(key,date)}</div>`;
 const heading=new Date(date+'T12:00:00Z').toLocaleDateString('fr-FR',{timeZone:'Europe/Lisbon',weekday:'long',day:'numeric',month:'long'});
 return `<div class="agenda-intro"><div><span class="faith-kicker">VIVRE PORTO ENSEMBLE</span><h2>Votre agenda</h2><p>Se retrouver, apprendre, prendre le temps.</p></div><span class="porto-badge">Porto · heure locale</span></div><section class="agenda-calendar" aria-label="Choisir une journée">${controls}<label class="agenda-date-picker">Choisir une date<input type="date" data-agenda-date value="${date}" aria-label="Date de l’agenda"></label><div class="agenda-day-heading"><h3>${heading}</h3><button class="agenda-today" data-a="agendaToday">Aujourd’hui</button></div></section><div class="agenda-client-layout"><section class="agenda-meetings" aria-label="Rendez-vous du jour"><div class="agenda-section-heading"><span class="faith-kicker">SE RETROUVER</span><h3>Les rendez-vous du jour</h3></div>${references}${prayerEvents||'<div class="agenda-empty">Une journée pour vous.<p>Aucun rendez-vous annoncé pour cette date.</p></div>'}<p class="agenda-caption">Horaires des offices à confirmer auprès de la communauté.</p>${halakha}</section><div class="agenda-daily">${panel}</div></div>`;

};
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-minyan-join]');if(!button)return;
 const office=button.dataset.minyanJoin,date=button.dataset.date;button.disabled=true;
 try{const r=await fetch('/api/minyan',{method:'POST',headers:{'Content-Type':'application/json','X-PK-Portal':'client'},body:JSON.stringify({date,office,join:!minyanCache.get(date)?.[office]?.joined})});const data=await r.json();if(!r.ok)throw Error(data.error);minyanCache.set(date,data);refreshMinyan(date);}catch(error){button.disabled=false;button.textContent=error.message;}
});
setInterval(()=>{if(!document.hidden)document.querySelectorAll('[data-minyan-date]').forEach((el,i)=>{if(!i)refreshMinyan(el.dataset.minyanDate);});},15000);
document.addEventListener('click',async event=>{
 const trigger=event.target.closest('[data-daf-study]');if(!trigger)return;
 const source=trigger.dataset.dafStudy,match=source.match(/\/talmud\/([a-z-]+)\/(\d+)\.html$/);if(!match)return;
 const dialog=document.createElement('dialog');dialog.className='halakha-dialog daf-dialog';
 dialog.innerHTML='<div class="video-heading"><div><small>TORAH-BOX · DAF HAYOMI</small><h2></h2></div><button type="button" aria-label="Fermer l’étude">✕</button></div><div class="daf-resources" role="status">Chargement de l’étude…</div><p class="video-credit">Cours en français · textes de Guémara en hébreu · <a target="_blank" rel="noopener noreferrer">Voir chez Torah-Box ↗</a></p>';
 dialog.querySelector('h2').textContent=trigger.dataset.dafTitle;dialog.querySelector('.video-credit a').href=source;
 document.body.append(dialog);dialog.showModal();dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.addEventListener('close',()=>{dialog.remove();if(trigger.isConnected)trigger.focus();},{once:true});
 try{
  const response=await fetch('/api/daf-resources?tractate='+encodeURIComponent(match[1])+'&folio='+match[2]);const data=await response.json();if(!response.ok)throw Error();if(!dialog.isConnected)return;
  const box=dialog.querySelector('.daf-resources');box.replaceChildren();box.removeAttribute('role');
  const links=document.createElement('div');links.className='daf-pdf-links';
  for(const side of ['a','b']){if(!data.pdfs[side])continue;const a=document.createElement('a');a.href=data.pdfs[side];a.target='_blank';a.rel='noopener noreferrer';a.textContent='Texte PDF · '+data.folio+side+' ↗';links.append(a);}box.append(links);
  if(data.videos.length){
   const label=document.createElement('label');label.className='daf-course-select';label.textContent='Choisir un cours en français';const select=document.createElement('select');select.setAttribute('aria-label','Choisir un cours du Daf Hayomi');
   data.videos.forEach((url,i)=>{const option=document.createElement('option');option.value=url;option.textContent='Cours '+(i+1);select.append(option);});label.append(select);box.append(label);
   const wrap=document.createElement('div');wrap.className='video-content';const frame=document.createElement('iframe');frame.src=data.videos[0];frame.title='Daf Hayomi '+trigger.dataset.dafTitle+' · cours en français';frame.allow='fullscreen; autoplay; encrypted-media; picture-in-picture';frame.allowFullscreen=true;wrap.append(frame);box.append(wrap);select.onchange=()=>{frame.src=select.value;};
  }else{const p=document.createElement('p');p.textContent='La vidéo de cette page n’est pas disponible pour le moment.';box.append(p);}
 }catch{if(dialog.isConnected)dialog.querySelector('.daf-resources').textContent='L’étude est momentanément indisponible. Le lien Torah-Box reste accessible ci-dessous.';}
});

document.addEventListener('click',async event=>{
 if(!event.target.closest('[data-halakha-video]'))return;
 event.preventDefault();
 const trigger=event.target.closest('[data-halakha-video]');
 const dialog=document.createElement('dialog');dialog.className='halakha-dialog';
 dialog.innerHTML='<div class="video-heading"><div><small>TORAH-BOX · HALAKHA TIME</small><h2>La halakha du jour</h2></div><button type="button" aria-label="Fermer la vidéo">✕</button></div><div class="video-content" role="status">Chargement du lecteur…</div><p class="video-credit">Lecteur officiel Torah-Box · <a href="https://www.torah-box.com/halakha-time/" target="_blank" rel="noopener noreferrer">Ouvrir chez Torah-Box ↗</a></p>';
 document.body.append(dialog);dialog.showModal();
 const close=()=>dialog.close();dialog.querySelector('button').addEventListener('click',close);
 dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
 dialog.addEventListener('close',()=>{dialog.remove();trigger.focus();},{once:true});
 try{
  const r=await fetch('/api/halakha');const data=await r.json();if(!r.ok)throw Error();
  if(!dialog.isConnected)return;
  dialog.querySelector('h2').textContent=data.title;
  const player=document.createElement('iframe');player.src=data.embed;player.title=data.title;player.allow='fullscreen; autoplay; encrypted-media; picture-in-picture';player.allowFullscreen=true;
  dialog.querySelector('.video-content').replaceChildren(player);
 }catch(e){if(dialog.isConnected)dialog.querySelector('.video-content').textContent='Le lecteur est momentanément indisponible. Vous pouvez ouvrir le cours chez Torah-Box avec le lien ci-dessous.';}
});

// Refresh links on the next opening; never interrupt a video being watched.
let studySignature='';
async function checkStudyUpdates(){
 if(document.hidden)return;
 try{const r=await fetch('/api/study-sync',{cache:'no-store'});if(!r.ok)return;const info=await r.json();const signature=JSON.stringify(Object.entries(info.sources).map(([k,v])=>[k,v.fingerprint]));
 if(studySignature&&signature!==studySignature){cache.clear();if(S.tab==='agenda'&&!document.querySelector('dialog[open]'))soft();}studySignature=signature;
 }catch{}
}
setInterval(checkStudyUpdates,30000);checkStudyUpdates();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkStudyUpdates();});
// Recheck the Porto calendar after midnight, after sleep and on returning to the tab.
const portoDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let displayedDate=portoDate();
function refreshAgendaDay(){
 const current=portoDate();if(current===displayedDate)return;
 displayedDate=current;cache.clear();S.day=null;S.wk=0;
 if(S.tab==='agenda'||(PK.portal==='ceo'&&PK.tab==='agenda'))soft();
}
setInterval(refreshAgendaDay,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAgendaDay();});
window.addEventListener('pageshow',refreshAgendaDay);
A.agendaToday=function(){S.wk=0;S.day=0;};
})();

// Date navigation uses civil UTC midnights, independent of summer-time changes.
document.addEventListener('change',event=>{if(!event.target.matches('[data-agenda-date]'))return;const value=event.target.value;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return;const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const offset=Math.round((Date.parse(value+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);if(Math.abs(offset)>366){event.target.setCustomValidity('Choisissez une date à moins d’un an.');event.target.reportValidity();return;}S.day=offset;S.wk=Math.floor(offset/7);render();});
