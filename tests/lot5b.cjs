// Lot 5b, browser modules: every inline and /js script of index.html, in page order, against a minimal DOM.
// Covers the login/password forms, credential auto-hide, notification guide, CEO agenda/CalJ, games without
// levels and Wheelie Bradley stopped at the server deadline. No network, no real push, no real GPS.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),elements=new Map(),cache=new Map(),listeners={};
const element=()=>({innerHTML:'',style:{setProperty(){}},classList:{add(){},remove(){},contains(){return false;}},querySelector(){return null;},querySelectorAll(){return [];},appendChild(node){if(node.id)elements.set(node.id,node);},after(){},before(){},prepend(){},setAttribute(){},getAttribute(){return null;},hasAttribute(){return false;},remove(){},children:[]});
elements.set('app',element());
const doc={documentElement:element(),body:element(),head:element(),activeElement:null,hidden:false,
  getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[],querySelector:selector=>selector.startsWith('link')||selector.startsWith('meta')?({href:'',setAttribute(){}}):null,createElement:element,
  addEventListener:(name,fn)=>{(listeners[name]=listeners[name]||[]).push(fn);}};
const calls=[];let reply=()=>({});
const context=vm.createContext({document:doc,window:{devicePixelRatio:1,addEventListener(){}},location:{pathname:'/ceo'},navigator:{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130',maxTouchPoints:0},
  performance:{now:()=>0},localStorage:{getItem:key=>cache.has(key)?cache.get(key):null,setItem:(key,val)=>cache.set(key,String(val)),removeItem:key=>cache.delete(key)},
  setInterval(){},clearInterval(){},setTimeout(fn,ms){context.timers.push({fn,ms});return context.timers.length;},clearTimeout(){},timers:[],
  requestAnimationFrame(){},scrollTo(){},Image:class{},Date,Intl,console,URL,Blob,BigInt,Uint8Array,atob:s=>Buffer.from(s,'base64').toString('binary'),crypto:require('node:crypto').webcrypto,
  matchMedia:()=>({matches:false}),confirm:()=>true,FormData:class{constructor(form){this.v=form.values;}get(k){return k in this.v?this.v[k]:null;}},
  fetch:async(url,options)=>{const body=options&&options.body?JSON.parse(options.body):null;calls.push({url,body});const value=reply(url,body);return {ok:!value.error,json:async()=>value};}});
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const match of html.matchAll(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g)){
  if(match[1]){if(match[1].startsWith('/js/'))vm.runInContext(fs.readFileSync(path.join(root,match[1]),'utf8'),context,{filename:match[1]});}
  else vm.runInContext(match[2],context,{filename:'index.html#inline'});
}
const read=code=>vm.runInContext(code,context);
const tick=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
(async()=>{
  await tick();
  // ---- A12: login is a real form (autofill attributes, Enter = submit), values read from the form itself.
  read("PK.me=null;PK.data=null;");
  const login=read('pkLogin()');
  assert.match(login,/<form[^>]*data-pk-form="login"/);assert.match(login,/autocomplete="username"/);assert.match(login,/autocomplete="current-password"/);assert.match(login,/type="submit"/);
  reply=url=>url==='/api/login'?{ok:true}:{error:'Connexion requise.'};
  const form={values:{username:'ceo@test.invalid',password:'autofilled-secret',remember:'on'},dataset:{pkForm:'login'},closest(){return this;}};
  listeners.submit.forEach(fn=>fn({target:form,preventDefault(){}}));await tick();
  const sent=calls.find(c=>c.url==='/api/login');assert.deepEqual([sent.body.login,sent.body.password,sent.body.remember,sent.body.role],['ceo@test.invalid','autofilled-secret',true,'ceo']);
  assert.equal(read('S.f.pk_password'),'','password cleared from memory after the attempt');
  // ---- A10: password form sends the confirmation; mismatch is refused before any request.
  read("PK.me={id:'ceo',role:'ceo',login:'ceo@test.invalid',name:'CEO'};PK.data={accounts:[],audit:[],events:{},push:{enabled:false,reason:'Bibliothèque pywebpush absente'},prep:{},reports:{}};PK.busy=false;");
  const pw=read('pkPasswordForm()');assert.match(pw,/autocomplete="new-password"/);assert.match(pw,/autocomplete="current-password"/);assert.match(pw,/name="username"[^>]*autocomplete="username"/);
  calls.length=0;reply=()=>({ok:true});
  const pwForm={values:{currentPassword:'old-password-123',newPassword:'new-password-2026',confirmPassword:'new-password-2027'},dataset:{pkForm:'password'},closest(){return this;}};
  listeners.submit.forEach(fn=>fn({target:pwForm,preventDefault(){}}));await tick();
    assert.equal(calls.filter(c=>c.url==='/api/password').length,0);assert.match(read('PK.error'),/correspondent pas/);
  pwForm.values.confirmPassword='new-password-2026';read("PK.me={id:'ceo',role:'ceo',login:'ceo@test.invalid',name:'CEO'};PK.busy=false;");
  listeners.submit.forEach(fn=>fn({target:pwForm,preventDefault(){}}));await tick();
  assert.deepEqual(calls.find(c=>c.url==='/api/password').body,{current:'old-password-123',password:'new-password-2026',confirm:'new-password-2026'});
  // ---- C11/C12/C20: generated password copied when possible, manual copy otherwise, hidden after 60 s; nothing persisted.
  context.timers.length=0;read("PK.me={id:'ceo',role:'ceo',login:'ceo@test.invalid',name:'CEO'};PK.portal='ceo';");
  context.navigator.clipboard={writeText:async()=>{throw new Error('denied');}};
  await read("pkRememberCredential('acc','generated-secret-1')");assert.match(read('PK.notice'),/Copier/);assert.match(read('pkCredentialView()'),/generated-secret-1/);
  const hide=context.timers.find(t=>t.ms===60000);assert(hide,'auto-hide timer');hide.fn();assert.equal(read('PK.credential'),null);
  let copied='';context.navigator.clipboard={writeText:async value=>{copied=value;}};
  await read("pkRememberCredential('acc','generated-secret-2')");assert.equal(copied,'generated-secret-2');assert.match(read('PK.notice'),/copié/);
  assert(![...cache.values()].some(v=>v.includes('generated-secret')),'no password in browser storage');
  // ---- Notification guide: explained installation, permission only on a tap, diagnostic and retry.
  read("PN.server={enabled:true,publicKey:'BAAA',reason:''};PN.subscribed=false;");
  context.navigator.userAgent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) Safari/604.1';
  context.window.Notification=context.Notification={permission:'default',requestPermission:async()=>{context.asked=(context.asked||0)+1;return 'granted';}};
  let panel=read('pnPanel(true)');assert.match(panel,/Sur l’écran d’accueil/);assert.match(panel,/Plus tard/);assert.match(panel,/Diagnostic/);assert.equal(context.asked,undefined,'never asked without a tap');
  await read("pnEnable()");assert.equal(context.asked,undefined,'iPhone not installed: no prompt');assert.match(read('PN.message'),/écran d’accueil/);
  context.navigator.userAgent='Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X) Safari/604.1';
  assert.match(read('pnPanel()'),/16\.4 ou plus récent/);
  context.navigator.userAgent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) Safari/604.1';context.navigator.standalone=true;
  context.Notification.permission='denied';assert.match(read('pnPanel()'),/Réglages de l’iPhone → Notifications/);assert.match(read('pnPanel()'),/Vérifier à nouveau/);
  context.Notification.permission='default';
  assert.equal(read("pnFirstUse()===''"),false);read("A.pk('notif-later',{dataset:{id:''}})");assert.equal(read("pnFirstUse()"),'');
  read("PN.subscribed=true;");assert.match(read('pnPanel()'),/notification de test/);read("PN.subscribed=false;");
  // CEO notification service status: degraded mode declared, counts shown, "sent" is not "received".
  read("PK.me={id:'ceo',role:'ceo',login:'ceo@test.invalid',name:'CEO'};PK.data={accounts:[],audit:[],events:{},prep:{},reports:{}};PK.data.push={enabled:false,reason:'Bibliothèque pywebpush absente',counts:{pending:1,sent:4,failed:2,expired:1},late:1,devices:{driver:2},lastFlush:Date.now(),lastError:{at:Date.now(),message:'HTTP 503'},errors:[]};");
  const status=read('pnStatusCEO()');assert.match(status,/Mode dégradé/);assert.match(status,/en échec <b>2/);assert.match(status,/pas affiché sur l’appareil/);
  // ---- CEO: no Costs section, agenda administration (weekly + one-off, edit, delete), CalJ slot disabled by default.
  read("PK.portal='ceo';PK.tab='agenda';PK.data.events={w:{title:'Backgammon',time:'14:00',dow:3,place:'Café'},o:{title:'Soirée',time:'20:00',day:'2026-12-31'}};PK.data.caljConfig={enabled:false,city:'Porto',country:'Portugal',source:'https://www.calj.net/'};PK.data.calj={label:'Horaires CalJ : source non configurée'};PK.data.prep={levfood:{minutes:22,proposal:null}};");
  let ceo=read('pkCEO()');
  assert.match(ceo,/Événements hebdomadaires[\s\S]*Backgammon/);assert.match(ceo,/Événements ponctuels[\s\S]*Soirée/);assert.match(ceo,/Source non configurée/);assert.match(ceo,/indicatifs/);assert.match(ceo,/source non configurée/);
  assert(!/Coûts|Factures|Studio/.test(ceo));
  read("A.pk('event-edit',{dataset:{id:'w'}})");assert.equal(read('S.f.ev_title'),'Backgammon');assert.equal(read('S.f.ev_kind'),'weekly');
  calls.length=0;reply=()=>({ok:true,id:'w'});read("S.f.ev_title='Backgammon du mercredi';PK.busy=false;");await read("A.pk('event-save',{dataset:{id:''}})");
  assert.deepEqual(calls[0].body,{id:'w',event:{title:'Backgammon du mercredi',time:'14:00',place:'Café',img:'',dow:3}});
  calls.length=0;read("S.f.ev_kind='once';S.f.ev_title='Hafrashat Halla';S.f.ev_day='2026-11-06';S.f.ev_time='18:00';PK.busy=false;");await read("A.pk('event-save',{dataset:{id:''}})");
  assert.deepEqual(calls[0].body,{event:{title:'Hafrashat Halla',time:'18:00',place:'',img:'',day:'2026-11-06'}});
  calls.length=0;read("PK.busy=false;");await read("A.pk('event-remove',{dataset:{id:'o'}})");assert.deepEqual(calls[0].body,{id:'o',remove:true});
  calls.length=0;reply=()=>({ok:true,calj:{enabled:true}});read("S.f.calj_enabled=true;S.f.calj_key='K';PK.busy=false;");await read("A.pk('calj-save',{dataset:{id:''}})");
  assert.deepEqual(calls[0].body,{action:'calj',enabled:true,city:'Porto',country:'Portugal',key:'K',removeKey:false});assert.equal(read('S.f.calj_key'),'');
  // C34: preparation delay screen for a chosen restaurant.
  read("PK.tab='menus';S.f.ceoMerchant='levfood';PK.prepFor=null;");ceo=read('pkCEO()');assert.match(ceo,/Temps de préparation · 22 min/);assert.equal(read('S.f.prepMinutes'),'22');
  // C09: the establishment field is shown (and sent) only for a restaurateur account.
  read("PK.tab='accounts';S.f.accountRole='driver';PK.data.drivers=[];");assert(!read('pkCEO()').includes('accountMerchant'));
  read("S.f.accountRole='restaurant';");assert(read('pkCEO()').includes('accountMerchant'));
  // C21/C27: journal with author and detail, archives with CSV.
  read("PK.tab='history';PK.data.accounts=[{id:'r1',name:'Resto'}];PK.data.audit=[{action:'credential.view',actorName:'Alice',created:Date.now(),detail:JSON.stringify({account:'r1'})}];PK.data.reports={x:{id:'x',closedAt:Date.now(),merchant:'',snapshot:[{},{}]}};PK.data.history={};");
  ceo=read('pkCEO()');assert.match(ceo,/Coffre consulté<\/b> · Alice/);assert.match(ceo,/account : Resto/);assert.match(ceo,/id=x" download>CSV/);assert.match(ceo,/2 commande\(s\) archivée\(s\)/);
  // ---- Games: no levels anywhere, Wheelie is a bonus out of the leaderboard and stops at the server deadline.
  read("PK.portal='client';PK.me=null;PK.data={};PK.serverTime=Date.now();PK.syncAt=0;PK.gameExpires=PK.serverTime+3600000;S.my=[];store.scores={};");
  const cards=read('arcade.cards()');assert.match(cards,/Wheelie Bradley[\s\S]*hors classement/);assert(!/\/10|Niveau|Level/.test(cards));
  read("store.orders.t1={id:'t1',code:'A1',st:'go',t:Date.now(),m:'levfood',lines:[],mode:'deliv'};S.tk='t1';");
  read("S.tab='track';render();");const track=elements.get('app').innerHTML;assert.match(track,/trk-games/);assert(!/\d+\/10/.test(track),'tracking page shows records, not levels');assert.match(track,/hors classement/);read("S.tab='games';");
  reply=url=>url==='/api/games/start'?{run:'r-w',expires:read('PK.gameExpires'),time:read('PK.serverTime'),seed:1}:{};
  calls.length=0;await read("A.gplay('wheel')");assert.deepEqual(calls[0].body,{game:'wheel'});assert.equal(read('S.gk'),'wheel');assert.equal(read('S.tab'),'game');
  const handlers={},drawing=new Proxy({}, {get:(_o,k)=>k==='createLinearGradient'?()=>({addColorStop(){}}):k==='measureText'?()=>({width:10}):()=>{},set:()=>true});
  const canvas={getContext:()=>drawing,addEventListener:(name,fn)=>handlers[name]=fn};elements.set('gc',canvas);
  let next=null;context.requestAnimationFrame=fn=>{next=fn;};
  read('startGame()');assert(next,'wheel loop started');
  handlers.pointerdown({preventDefault(){}});for(let f=1;f<40;f++){const fn=next;next=null;fn(f*16);assert(next,'loop continues inside the window');}
  read('PK.gameExpires=PK.serverTime-1;');const fn=next;next=null;fn(800);
  assert.equal(next,null,'loop stopped at the deadline');assert.equal(read('S.tab'),'games');assert.equal(canvas._finished,true);
  const local=JSON.parse(cache.get('pk-game')||'{}');assert.equal((local.best||{}).wheel,undefined,'no Wheelie level stored');
  assert.equal(read("Object.keys(store.scores).length"),0);
  read('PK.gameExpires=PK.serverTime+3600000;');calls.length=0;reply=()=>({error:'Votre heure de jeu est terminée.'});
  await read("A.gplay('wheel')");assert.equal(read('S.tab'),'games');assert.match(read('PK.error'),/terminée/);
  console.log('Lot 5b frontend: forms, credential hiding, notification guide, CEO agenda/CalJ/journal/archives, games window and Wheelie passed.');
})().catch(error=>{console.error(error);process.exit(1);});
