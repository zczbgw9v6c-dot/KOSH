/* Bilingual quotes: an absolute 14-second schedule, independent of hover and polling renders. */
(()=>{
const quotes=window.KOSH_QUOTES||[],period=14000;
let index=0,nextAt=0,paused=false,pauseRemaining=period,card=null,shownKey='',serial=0;
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function makeCard(){
 const box=document.createElement('section');box.className='trk-note wisdom-card';box.setAttribute('aria-label','Paroles de sages en hébreu et en français');
 box.innerHTML='<header class="wisdom-header"><span>UN INSTANT DE SAGESSE <i aria-hidden="true">✦</i> דברי חכמים</span><span class="wisdom-count" aria-hidden="true"></span></header><div class="wisdom-stage" aria-live="off"></div><footer class="wisdom-footer"><span>EXTRAIT TRADUIT DU TEXTE HÉBREU</span><div class="wisdom-controls"><button type="button" data-quote-prev aria-label="Citation précédente">‹</button><button type="button" data-quote-pause aria-label="Mettre les citations en pause" aria-pressed="false">Ⅱ</button><button type="button" data-quote-next aria-label="Citation suivante">›</button></div></footer><div class="wisdom-timer" aria-hidden="true"><i></i></div>';
 box.addEventListener('click',e=>{
  if(e.target.closest('[data-quote-pause]')){paused=!paused;if(paused)pauseRemaining=Math.max(0,nextAt-performance.now());else nextAt=performance.now()+pauseRemaining;const b=box.querySelector('[data-quote-pause]');b.textContent=paused?'▶':'Ⅱ';b.setAttribute('aria-pressed',String(paused));b.setAttribute('aria-label',paused?'Reprendre les citations':'Mettre les citations en pause');}
  if(e.target.closest('[data-quote-next]'))move(1);
  if(e.target.closest('[data-quote-prev]'))move(-1);
 });
 return box;
}
function slideFor(q){
 const slide=document.createElement('div');slide.className='wisdom-slide';slide.dataset.ref=q.ref;
 const hebrew=document.createElement('blockquote');hebrew.className='wisdom-he';hebrew.lang='he';hebrew.dir='rtl';hebrew.textContent=q.hebrew;
 const divider=document.createElement('span');divider.className='wisdom-divider';divider.setAttribute('aria-hidden','true');
 const french=document.createElement('blockquote');french.className='wisdom-fr';french.lang='fr';french.dir='ltr';french.textContent='« '+q.text+' »';
 const credit=document.createElement('div');credit.className='wisdom-credit';const author=document.createElement('strong');author.textContent=q.author;
 const link=document.createElement('a');link.href=q.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Pirké Avot '+q.ref.replace('.',':')+' · פרקי אבות';
 credit.append(author,link);slide.append(hebrew,divider,french,credit);return slide;
}
function show(direction=1){
 if(!card||!quotes.length)return;
 const key=index+':'+(S.lang||'fr');if(key===shownKey)return;shownKey=key;
 const stage=card.querySelector('.wisdom-stage'),old=stage.querySelector('.wisdom-slide.is-active'),slide=slideFor(quotes[index]);
 const id=++serial;
 const reveal=()=>{
  if(id!==serial)return;
  stage.replaceChildren(slide);slide.classList.add('is-active');
  if(!reduced())slide.animate([{opacity:0,transform:`translateY(${8*direction}px)`},{opacity:1,transform:'translateY(0)'}],{duration:520,easing:'cubic-bezier(.16,1,.3,1)'});
 };
 card.dataset.quoteIndex=String(index);card.querySelector('.wisdom-count').textContent=String(index+1).padStart(2,'0')+' / '+quotes.length;
 if(old&&!reduced()){
  old.getAnimations().forEach(a=>a.cancel());
  old.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:`translateY(${-6*direction}px)`}],{duration:240,easing:'ease-in',fill:'forwards'}).finished.then(reveal).catch(()=>{});
 }else reveal();
}
function move(delta){index=(index+delta+quotes.length)%quotes.length;nextAt=performance.now()+period;pauseRemaining=period;show(delta);progress();}
function progress(){if(!card)return;const remaining=paused?pauseRemaining:Math.max(0,nextAt-performance.now());card.style.setProperty('--quote-remaining',String(Math.min(1,remaining/period)));}
function tick(){
 if(!card?.isConnected||document.hidden||!quotes.length)return;
 const now=performance.now();if(!paused&&now>=nextAt){const steps=Math.floor((now-nextAt)/period)+1;index=(index+steps)%quotes.length;nextAt+=steps*period;show();}
 progress();
}
function attach(){
 if(PK.portal!=='client'||!quotes.length)return;const fresh=document.querySelector('.trk-note');if(!fresh)return;
 if(!card){card=makeCard();nextAt=performance.now()+period;}
 if(fresh!==card)fresh.replaceWith(card);show();tick();
}
const before=render;
render=function(){before();attach();};
setInterval(tick,100);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
attach();
})();
