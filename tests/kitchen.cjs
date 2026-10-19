// Lot 5a, restaurant screens: kitchen mode, identical-line grouping, priorities, filters, single promotions function,
// tickets, pre-orders and polling. Runs every browser script in a VM (no network, no real data).
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const harness=path.join(__dirname,'frontend.cjs'),mod=new Module(harness,module);mod.filename=harness;mod.paths=module.paths;
mod._compile(fs.readFileSync(harness,'utf8')+`
(async()=>{
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve)); // let the start-up pkSync calls settle
 // R12: identical lines merge, any difference (options, note, menu choice, price) keeps them apart.
 const grouped=read("pkGroupLines([{id:'a',n:'Burger',p:10,q:1,o:['Sauce','Cheddar'],note:''},{id:'a',n:'Burger',p:10,q:2,o:['Cheddar','Sauce']},{id:'a',n:'Burger',p:10,q:1,o:['Sauce'],note:''},{id:'a',n:'Burger',p:10,q:1,o:['Sauce','Cheddar'],note:'Sans oignon'},{id:'m',n:'Menu',p:8,q:1,o:['1 × Cookie'],choices:{c:1}},{id:'m',n:'Menu',p:8,q:1,o:['1 × Fondant'],choices:{f:1}},{id:'m',n:'Menu',p:8,q:2,o:['1 × Cookie'],choices:{c:1}},{id:'a',n:'Burger',p:11,q:1,o:['Sauce','Cheddar']}])");
 assert.deepEqual(JSON.parse(JSON.stringify(grouped.map(l=>[l.id,l.q,l.note||'',l.p]))),[['a',3,'',10],['a',1,'',10],['a',1,'Sans oignon',10],['m',3,'',8],['m',1,'',8],['a',1,'',11]]);
 assert.equal(read("pkGroupLines([{id:'x',n:'X',p:1,q:1,o:[]}])[0]===undefined"),false);
 // Orders for the restaurant view.
 read(\`PK.portal='restaurant';PK.me={id:'restaurant',role:'restaurant',merchant:'levfood'};PK.busy=false;S.pro='levfood';PK.serverTime=Date.now();PK.syncAt=0;PK.data={orders:{},prep:{}};PK.tab='orders';PK.ticket=false;
  store.menus={levfood:{items:{'add-009':{s:4}},promos:{OLD:{kind:'percent',pct:10,max:5,used:5,active:true},GIFT:{kind:'gift',giftId:'add-009',giftQ:2,max:3,used:1,active:false,createdAt:2}}}};
  store.orders={
   new1:{id:'new1',m:'levfood',code:'NEW1',name:'Ana',tel:'900',t:50,st:'ok',paid:true,mode:'pick',when:'asap',scheduledAt:9.5e12,total:9,lines:[{id:'add-009',n:'Cookie maison',p:3,q:1,o:[]},{id:'add-009',n:'Cookie maison',p:3,q:2,o:[]}]},
   decl:{id:'decl',m:'levfood',code:'DECL',name:'Bo',tel:'900',t:40,st:'decl',paid:false,mode:'pick',total:3,lines:[]},
   canc:{id:'canc',m:'levfood',code:'CANC',name:'Cy',tel:'900',t:30,st:'prep',paid:true,mode:'pick',total:3,lines:[],cancelRequest:{state:'pending',t:1}},
   late:{id:'late',m:'levfood',code:'LATE',name:'Di',tel:'900',t:20,st:'prep',paid:true,mode:'pick',prepEta:1,total:3,lines:[]},
   ready:{id:'ready',m:'levfood',code:'RDY1',name:'Ed',tel:'900',t:10,st:'ready',paid:true,mode:'pick',total:3,lines:[]},
   menu:{id:'menu',m:'levfood',code:'MENU',name:'Fa',tel:'900',t:60,st:'prep',paid:true,mode:'pick',prepEta:9e12,total:5,promo:'GIFT',gift:'2 × Cookie maison',giftLine:{id:'add-009',n:'Cookie maison',q:2,inc:['1 × Pâte']},note:'Allergie noix',lines:[{id:'x-fixed',n:'Duo',p:5,q:1,o:[],inc:['1 × Cookie maison','1 × Fondant'],note:'Sans sucre'}]},
   done:{id:'done',m:'levfood',code:'DONE',name:'Gi',tel:'900',t:5,st:'done',paid:true,mode:'pick',total:3,lines:[]},
   no:{id:'no',m:'levfood',code:'ANNU',name:'Ho',tel:'900',t:4,st:'no',paid:false,mode:'pick',total:3,lines:[]}};\`);
 // R08: cancellation request, declared payment and late preparation first, then the newest.
const S=read('S');S.f.pk_filter='active';S.f.pk_search='';
 let html=read('pkOrders()');const order=[...html.matchAll(/<h3>#(\\w+)/g)].map(m=>m[1]);
 assert.deepEqual(order,['CANC','DECL','LATE','MENU','NEW1','RDY1']);
 assert.match(html,/Prioritaire · Demande d’annulation du client/);assert.match(html,/Prioritaire · paiement déclaré à vérifier/);assert.match(html,/Prioritaire · préparation en retard/);
 assert.match(html,/Mode cuisine/);
 // R12-R14 in the detailed card: one grouped line, components, instructions, gift to prepare.
 assert.match(html,/3 × Cookie maison/);assert(!html.includes('1 × Cookie maison<'),'identical cookie lines are merged');
 assert.match(html,/Inclus : 1 × Cookie maison · 1 × Fondant/);assert.match(html,/Offert à préparer : 2 × Cookie maison/);
 // R05: filters.
 const codes=filter=>{S.f.pk_filter=filter;return [...read('pkOrders()').matchAll(/<h3>#(\\w+)/g)].map(m=>m[1]).sort().join(',');};
 assert.equal(codes('ready'),'RDY1');assert.equal(codes('pay'),'DECL');assert.equal(codes('done'),'ANNU,DONE');assert.equal(codes('all').split(',').length,8);
 S.f.pk_filter='active';S.f.pk_search='bo';assert.equal(codes('active'),'DECL');S.f.pk_search='';
 // R10: kitchen mode, urgent first then by due time; paid orders to cook only; large focus view with client details.
 await read("A.pk('kitchen',{dataset:{id:'1'}})");assert.equal(read('PK.kitchen'),true);
 html=read('pkOrders()');assert.match(html,/pk-kitchen/);assert.match(html,/Mode cuisine/);
 const kitchen=[...html.matchAll(/pk-k-code">#(\\w+)/g)].map(m=>m[1]);assert.deepEqual(kitchen,['CANC','LATE','MENU','NEW1']);
 assert.match(html,/pk-k-q">3×/);assert.match(html,/Sans sucre/);assert.match(html,/Allergie noix/);assert.match(html,/🎁 Cookie maison/);assert.match(html,/Inclus : 1 × Pâte/);
 assert.match(html,/data-v="status" data-id="new1:prep"/);assert.match(html,/data-v="status" data-id="menu:ready"/);assert(!html.includes('tel:'),'list view hides phone numbers');
 await read("A.pk('kitchen-filter',{dataset:{id:'ready'}})");assert.deepEqual([...read('pkOrders()').matchAll(/pk-k-code">#(\\w+)/g)].map(m=>m[1]),['RDY1']);
 assert.match(read('pkOrders()'),/data-id="ready:done"/);
 await read("A.pk('kitchen-focus',{dataset:{id:'menu'}})");html=read('pkOrders()');assert.match(html,/pk-k-card focus/);assert.match(html,/tel:900/);assert.match(html,/Retour à la cuisine/);assert.equal((html.match(/pk-k-card/g)||[]).length,1);
 await read("A.pk('kitchen',{dataset:{id:'0'}})");assert.equal(read('PK.kitchen'),false);assert(!read('pkOrders()').includes('pk-kitchen'));
 // R14/R13 on the ticket: grouped lines, included products and the gift; the stored order is left untouched.
 read("S.tk='menu';");html=read('vTicket()');assert.match(html,/Offert : Cookie maison/);assert.match(html,/Inclus : 1 × Fondant/);assert.match(html,/Inclus : 1 × Pâte/);
 assert.equal(read('store.orders.menu.lines.length'),1);assert.equal(read("store.orders.menu.lines[0].o.length"),0);
 read("S.tk='new1';");html=read('vTicket()');assert.match(html,/3x Cookie maison/);
 // R69-R76: one promotions screen with counters, state, reactivation; the legacy % box and gift box are gone.
 read("PK.tab='promos';");html=read('pkRestaurant()');
 assert.match(html,/Promotions et cadeaux/);assert.match(html,/<b>OLD<\\/b> · Réduction de 10 %/);assert.match(html,/5 \\/ 5 utilisations/);assert.match(html,/Épuisé/);
 assert.match(html,/<b>GIFT<\\/b> · 🎁 2 × Cookie maison offerts/);assert.match(html,/1 \\/ 3 utilisations/);assert.match(html,/Désactivé/);assert.match(html,/Réactiver/);
 assert.match(html,/data-f="promoKind"/);assert.match(html,/data-f="promoPct"/);assert(!html.includes('data-f="promoGift"'));
 S.f.promoKind='gift';html=read('pkRestaurant()');assert.match(html,/data-f="promoGift"/);assert.match(html,/data-f="promoGiftQ"/);
 read("PK.tab='menu';");html=read('pkMenuTools("levfood")');assert(!html.includes('Codes cadeaux'));assert(!html.includes('gift-promo'));
 read("S.ptab='set';");assert(!read('pkLegacyPro()').includes('data-a="padd"'),'legacy percentage box removed');
 read("A.pdel('OLD');");assert.equal(read("Object.keys(store.menus.levfood.promos).length"),2);
 // Creation and (de)activation go through /api/promo only; the browser never sends a counter.
 const calls=[];const savedFetch=context.fetch;context.fetch=async(url,init)=>{calls.push([url,init&&JSON.parse(init.body||'null')]);return {ok:true,json:async()=>url==='/api/promo'?{ok:true,promos:{}}:data};};
 Object.assign(S.f,{promoKind:'gift',promoCode:'cookie2',promoGift:'add-009',promoGiftQ:'2',promoMax:'10'});read("PK.busy=false;");await read("A.pk('promo-create',{dataset:{id:'levfood'}})");
 const create=calls.find(c=>c[0]==='/api/promo')[1];assert.deepEqual(create,{merchant:'levfood',action:'create',code:'COOKIE2',kind:'gift',max:10,giftId:'add-009',giftQ:2});assert.equal(read('S.f.promoCode'),'');
 calls.length=0;read("PK.busy=false;");await read(\`A.pk('promo-active',{dataset:{id:JSON.stringify(['levfood','GIFT',true])}})\`);assert.deepEqual(calls.find(c=>c[0]==='/api/promo')[1],{merchant:'levfood',action:'active',code:'GIFT',active:true});
 assert(!JSON.stringify(calls).includes('used'));context.fetch=savedFetch;
 // R85: open pre-orders (start reached, opening ahead) are not greyed; before the start or after the opening they are not pre-orders.
 const porto=minutes=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(Date.now()+minutes*60000)).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;};
 read("PK.portal='client';PK.serverTime=0;");context.shabbat=()=>({closed:false});
 const set=(pre,open)=>read(\`store.menus.levfood.effectiveService={open:true,glo:true,pickup:true,uber:false,preordersAt:'\${pre}',opensAt:'\${open}',delay:30};store.menus.levfood.closed=false;\`);
 set(porto(-30),porto(90));assert.equal(read("pkPreorder('levfood')"),true);
 set(porto(30),porto(90));assert.equal(read("pkPreorder('levfood')"),false);
 set(porto(-90),porto(-30));assert.equal(read("pkPreorder('levfood')"),false);
 set(porto(-30),porto(90));read("store.menus.levfood.effectiveService.open=false;");assert.equal(read("pkPreorder('levfood')"),false);
 set(porto(-30),porto(90));context.shabbat=()=>({closed:true});assert.equal(read("pkPreorder('levfood')"),false);
 // R02: 10 s foreground polling, immediate refresh when the app comes back (visibilitychange).
 const professional=fs.readFileSync(path.join(root,'js','professional.js'),'utf8');
 assert.match(professional,/setInterval\\(\\(\\)=>\\{if\\(!document\\.hidden\\)pkSync\\(\\);\\},10000\\)/);assert.match(professional,/addEventListener\\('visibilitychange',\\(\\)=>\\{if\\(!document\\.hidden\\)pkSync\\(\\);\\}\\)/);
 console.log('Kitchen: line grouping, priorities, filters, kitchen mode, tickets, single promotions screen, pre-orders and 10 s polling passed.');
})().catch(error=>{console.error(error);process.exit(1);});
`,harness);
