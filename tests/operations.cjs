const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const harness=path.join(__dirname,'frontend.cjs'),mod=new Module(harness,module);mod.filename=harness;mod.paths=module.paths;
mod._compile(fs.readFileSync(harness,'utf8')+`
(async()=>{
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 read("PK.portal='client';PK.data={conf:{}};store.menus={levfood:{effectiveService:{glo:true,pickup:false,uber:false,open:true}}};S.cartR='levfood';S.cart={'add-009':1};S.cfgs={};S.f.mode='uber';");
 let html=read('vCart({closed:false})');assert.match(html,/data-v="deliv"/);assert(!html.includes('data-v="uber"'));assert(!html.includes('data-v="pick"'));assert.equal(read('S.f.mode'),'deliv');
 read("store.menus.levfood.effectiveService={glo:false,pickup:true,uber:true};");html=read('vCart({closed:false})');assert(!html.includes('data-v="deliv"'));assert.match(html,/data-v="uber"/);assert.equal(read('S.f.mode'),'pick');
 read("store.menus.levfood.effectiveService={glo:false,pickup:false,uber:false};");assert.match(read('vCart({closed:false})'),/data-a="order" disabled/);
 read("PK.portal='restaurant';S.tab='pro';PK.ticket=false;pkQueueReceipts({orders:{one:{paid:true,st:'ok'}}},{orders:{one:{paid:false}}});");assert.equal(read('PK.ticket'),true);assert.equal(read('S.tk'),'one');
 read("pkQueueReceipts({orders:{one:{paid:true,st:'ok'},two:{paid:true,st:'ok'}}},{orders:{one:{paid:true}}});pkCloseReceipt();");assert.equal(read('S.tk'),'two');assert.equal(read('PK.ticket'),true);
 read("PK.portal='client';PK.ticket=false;S.tab='orders';pkQueueReceipts({orders:{client:{paid:true,st:'ok'}}},{orders:{}});");assert.equal(read('S.tab'),'ticket');assert.equal(read('S.tk'),'client');
 read("PK.portal='driver';PK.me={id:'driver'};PK.data={courier:{open:true,capacity:5,load:0,available:5},offers:{offer:{id:'offer',m:'levfood',code:'123',st:'ok',t:1,bags:10,remaining:10,suggested:5,available:5,capacity:5,unknownLoad:false}}};store.orders={};");html=read('pkOrders()');assert.match(html,/Accepter la course/);assert(!html.includes('Nom, adresse, référence ou restaurant'));
 // Lot 2: bags left, a bag selector defaulting to min(remaining, free capacity), unknown load and closed service.
 assert.match(html,/10 sacs à prendre/);assert.match(html,/data-f="bags_offer"/);{const picker=html.split('data-f="bags_offer"')[1].split('</select>')[0];assert(picker.includes('<option value="5" selected>5'));assert(!picker.includes('<option value="6"'));}assert.match(html,/Service ouvert/);
 read("PK.data.offers.offer={...PK.data.offers.offer,bags:null,remaining:0,suggested:0,unknownLoad:true};");html=read('pkOrders()');assert.match(html,/Charge inconnue/);assert(!html.includes('accept-course'));
 read("PK.data={courier:{open:false,capacity:5,load:2,available:3},offers:{}};");html=read('pkOrders()');assert.match(html,/Service fermé/);assert.match(html,/2 sacs engagés/);
 read("store.orders={p:{id:'p',m:'levfood',code:'P1',name:'C',tel:'900',addr:'Rua 2',t:1,st:'prep',mode:'deliv',lines:[],total:9,paid:true,delivery:{bags:10,remaining:5,assigned:5,delivered:0,state:'partially_assigned'},parts:[{id:'x',driver:'driver',bags:5,state:'accepted',driverName:'driver'}]}};");
 html=read('pkOrders()');assert.match(html,/Libérer ma part/);assert.match(html,/Je vais collecter/);assert(!html.includes('part-collect'),'collect waits for « commande prête »');assert.match(html,/5 encore sans livreur/);
 read("store.orders.p.st='ready';");html=read('pkOrders()');assert.match(html,/Sacs récupérés · partir/);assert(!html.includes('data-v="status"'),'courier uses part actions only');
 read("PK.portal='restaurant';PK.me={id:'restaurant',merchant:'levfood'};store.orders.p.parts.push({id:'y',driver:'d2',bags:3,state:'released',driverName:'Bob',release_reason:'Crevaison'});");html=read("pkOrder(store.orders.p,'p')");
 assert.match(html,/5 à attribuer/);assert.match(html,/driver · 5 sacs/);assert.match(html,/Motif : Crevaison/);assert.match(html,/Sacs remis à driver/);assert.match(html,/bags-save/);assert(!html.includes('Commande récupérée · partir'));
 context.navigator.clipboard={writeText:async value=>{context.copied=value;}};
 await read("pkRememberCredential('test-account','temporary-value')");assert.equal(context.copied,'temporary-value');
 context.navigator.clipboard.writeText=async()=>{throw Error('Denied');};await read("pkRememberCredential('test-account','temporary-value')");assert.match(read('PK.notice'),/empêché/);
 read("PK.portal='ceo';PK.me=null;PK.credential={id:'x',password:'temporary-value'};");assert.equal(read('pkCredentialView()'),'');
 // A focused revealed password must disappear from the DOM immediately on 401.
 const savedFetch=context.fetch;context.fetch=async()=>({ok:false,json:async()=>({error:'Connexion requise.'})});
 doc.activeElement={matches:()=>true};
 read("PK.portal='ceo';PK.me={id:'ceo',role:'ceo'};PK.data={};PK.credential={id:'x',password:'test-secret-value'};PK.ticket=false;S.tab='pro';render();");
 assert(elements.get('app').innerHTML.includes('test-secret-value'));
 await read('pkSync()');assert.equal(read('PK.credential'),null);assert(!elements.get('app').innerHTML.includes('test-secret-value'));
 context.fetch=savedFetch;doc.activeElement=null;
 // Drive compact navigation with a minimal DOM, retaining the hidden forms.
 const makePanel=title=>({hidden:false,classList:{contains:c=>c==='box'},hasAttribute:()=>false,getAttribute:()=>null,querySelector:sel=>sel==='h3'?{textContent:title}:null});
 const panels=[makePanel('Adresses'),makePanel('Notifications')],workspace={children:panels,before(){},prepend(node){this.menu=node;}};
 doc.querySelector=sel=>sel==='.pk-workspace'?workspace:null;
 read("PK.portal='ceo';PK.me={id:'ceo'};PK.tab='settings';PK.ticket=false;PK.invoice=null;PK.panels={'ceo:settings':'Notifications'};pkCompactPanels();");assert.equal(panels[0].hidden,true);assert.equal(panels[1].hidden,false);assert.match(workspace.menu.innerHTML,/pk-function/);
 // Lot 1: driver screen has no manual GPS, copy, ticket, correction or cancellation; customers never get a map.
 read("PK.portal='driver';PK.me={id:'driver'};PK.busy=false;PK.tracking=false;PK.data={offers:{},drivers:[{id:'driver',latitude:41.1234,longitude:-8.6,tracking:true,updatedAt:Date.now()}]};store.orders={a:{id:'a',m:'levfood',code:'A1',name:'C',tel:'900',addr:'Rua 1',t:1,st:'ready',mode:'deliv',lines:[],total:9,paid:true,driver:'driver',driverAccepted:true,location:{latitude:41.1234,longitude:-8.6}}};");
 html=read('pkOrders()');for(const forbidden of ['gps-start','gps-stop','copy-address','cancel-order','data-v="ticket"','lat_a','map-correct','précision','data-map-order','Affecter un livreur','Actualiser l’arrivée','41.1234'])assert(!html.includes(forbidden),'driver view leaks '+forbidden);
 assert.match(html,/Google Maps/);
 read("PK.portal='restaurant';PK.me={id:'restaurant',merchant:'levfood'};");html=read("pkOrder(store.orders.a,'a')");assert.match(html,/cancel-order/);assert(!html.includes('Affecter un livreur'));assert(!read("pkService('levfood')").includes('Uber Colis'));
 read("PK.portal='ceo';PK.me={id:'ceo'};");assert.match(read("pkOrder(store.orders.a,'a')"),/Affecter un livreur/);assert.match(read("pkService('levfood')"),/Uber Colis/);
 read("PK.portal='client';");html=read("orderCard(store.orders.a,'a',false)");assert(!html.includes('data-map-order')&&!html.includes('41.1234'),'customer card must not expose GPS');
 assert.deepEqual([read('feeOf("deliv")'),read('feeOf("pick")'),read('feeOf("uber")')],[3.5,.5,0]);assert.equal(read('typeof COM'),'undefined');
 assert.equal(read('[GM.spin[0],GM.stack[0],GM.sky[0]].join()'),'Pita Pulse,Golden Stack,Porto Flight');
 console.log('Operations: modes, automatic receipts, courier offers, clipboard fallback and compact navigation passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
`,harness);
