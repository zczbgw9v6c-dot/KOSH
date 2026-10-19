// Lot 4: courier tour screen, automatic GPS (permission, refusal, lower accuracy, single emitter), restaurant GPS detail.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const harness=path.join(__dirname,'frontend.cjs'),mod=new Module(harness,module);mod.filename=harness;mod.paths=module.paths;
mod._compile(fs.readFileSync(harness,'utf8')+`
(async()=>{
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 const calls=[];let clock=10000;context.performance.now=()=>clock;
 context.fetch=async(url,options)=>{calls.push({url,body:options&&options.body?JSON.parse(options.body):null});return {ok:true,json:async()=>(url.startsWith('/api/bootstrap')?data:{ok:true,tour:read('PK.data.tour')})};};
 const watches=[];let cleared=0;
 context.navigator.geolocation={watchPosition:(ok,ko,options)=>{watches.push({ok,ko,options});return watches.length;},clearWatch:()=>{cleared++;}};
 // Permission is requested automatically at login, even without any course; nothing is sent without a course.
 data.me={id:'driver',role:'driver',name:'D'};data.orders={};data.offers={};data.courier={open:true,capacity:5,load:0,available:5};
 data.tour={stops:[],links:{segments:[],missing:[]},routes:true};
 read("PK.portal='driver';");await read('pkSync()');
 assert.equal(watches.length,1,'GPS requested at login');assert.equal(watches[0].options.enableHighAccuracy,true);assert.equal(watches[0].options.maximumAge,0);
 watches[0].ok({coords:{latitude:41.15,longitude:-8.61,accuracy:9},timestamp:Date.now()});await Promise.resolve();
 assert.equal(calls.filter(c=>c.url==='/api/location').length,0,'no position sent without a course');
 // With an accepted part, one real fix is sent (with its age), at most every 3 s.
 read("store.orders={a:{id:'a',m:'levfood',code:'A1',name:'C',tel:'900',addr:'Rua 2',t:1,lines:[],total:9,paid:true,st:'ready',mode:'deliv',parts:[{id:'p',driver:'driver',bags:1,state:'accepted'}]}};");
 await read('pkGpsTick()');let sent=calls.filter(c=>c.url==='/api/location');assert.equal(sent.length,1);assert.equal(sent[0].body.latitude,41.15);assert(sent[0].body.age>=0);
 watches[0].ok({coords:{latitude:41.151,longitude:-8.611,accuracy:9},timestamp:Date.now()});clock+=1000;await read('pkGpsTick()');
 assert.equal(calls.filter(c=>c.url==='/api/location').length,1,'throttled to one point per 3 s');
 clock+=2500;await read('pkGpsTick()');assert.equal(calls.filter(c=>c.url==='/api/location').length,2);
 clock+=3000;await read('pkGpsTick()');assert.equal(calls.filter(c=>c.url==='/api/location').length,2,'an already sent point is never resent as new');
 // A second page of the same courier does not emit while this page holds the lease.
 cache.set('kosh-gps-lease',JSON.stringify({driver:'driver',tab:'other-page',until:Date.now()+60000}));
 watches[0].ok({coords:{latitude:41.152,longitude:-8.612,accuracy:9},timestamp:Date.now()});clock+=4000;await read('pkGpsTick()');
 assert.equal(calls.filter(c=>c.url==='/api/location').length,2);assert.equal(read('GPS.status'),'other-tab');assert.match(read('pkGpsAlert()'),/autre page/);
 cache.delete('kosh-gps-lease');clock+=4000;await read('pkGpsTick()');assert.equal(calls.filter(c=>c.url==='/api/location').length,3);
 // Timeout: one retry with a less precise position; refusal: explained, never requested again in a loop.
 watches[watches.length-1].ko({code:3});assert.equal(watches.length,2);assert.equal(watches[1].options.enableHighAccuracy,false);assert.match(read('pkGpsAlert()'),/Délai dépassé/);
 watches[1].ko({code:1});assert.equal(read('GPS.status'),'denied');assert.match(read('pkGpsAlert()'),/Localisation refusée/);
 await read('pkSync()');read('pkStartGPS()');assert.equal(watches.length,2,'no new permission request after a refusal');
 // Tour screen: ordered stops, manual moves, full Google link split in explicit segments, Waze/Plans for the next stop.
 const now=Date.now();
 read("PK.serverTime="+now+";PK.syncAt=performance.now();PK.busy=false;");
 read(\`PK.data.tour={signature:'sig',manual:false,routes:true,outdated:false,degraded:null,unverified:[],
   estimates:{at:\${now},finish:\${now+3600000},method:'exact-enumeration',fresh:true,stale:false},
   stops:[{id:'pickup:a',kind:'pickup',code:'A1',bags:1,name:'Lev Food',address:'Rua 1',verified:true,eta:{arrive:\${now+60000},wait:600000,depart:\${now+960000}}},
          {id:'delivery:a',kind:'delivery',code:'A1',bags:1,name:'C',address:'Rua 2',verified:true,eta:{arrive:\${now+1200000},wait:0,depart:\${now+1500000}}}],
   links:{segments:[{url:'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=41.1%2C-8.6&waypoints=41.2%2C-8.6',stops:['pickup:a','delivery:a']},{url:'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=41.1%2C-8.6&destination=41.3%2C-8.6',stops:['delivery:a']}],missing:[]},
   next:{google:'https://www.google.com/maps/dir/?api=1',apple:'https://maps.apple.com/?daddr=41.2%2C-8.6&dirflg=d',waze:'https://waze.com/ul?ll=41.200000%2C-8.600000&navigate=yes'}};\`);
 let html=read('pkTour()');
 assert.match(html,/Ordre optimisé/);assert.match(html,/Google Maps · étape 1\\/2/);assert.match(html,/Google Maps · étape 2\\/2/);
 assert.match(html,/waze\\.com\\/ul\\?ll=41\\.200000%2C-8\\.600000&amp;navigate=yes|waze\\.com\\/ul\\?ll=41\\.200000%2C-8\\.600000&navigate=yes/);assert.match(html,/maps\\.apple\\.com/);
 assert.match(html,/Arrivée ≈/);assert.match(html,/attente préparation 10 min/);assert.match(html,/data-v="tour-move" data-id="delivery:a\\|up"/);
 for(const forbidden of ['précision','data-map-order','gps-start','gps-stop','Partager ma position','Il y a'])assert(!html.includes(forbidden),'driver tour leaks '+forbidden);
 read("PK.data.tour.estimates.fresh=false;");html=read('pkTour()');assert.match(html,/Heures à actualiser/);assert(!html.includes('Arrivée ≈'),'old estimate shown as current');
 read("PK.data.tour.routes=false;PK.data.tour.estimates=null;");assert.match(read('pkTour()'),/Calcul Google non configuré/);
 calls.length=0;await read("A.pk('tour-move',{dataset:{id:'delivery:a|up'}})");
 const move=calls.find(c=>c.url==='/api/tour');assert.deepEqual(move.body,{action:'move',stop:'delivery:a',to:'up',signature:'sig'});
 // Polling never reorders: bootstrap only replaces the server-held order; no automatic optimisation once manual.
 calls.length=0;read("GPS.lastSent=performance.now();");data.tour={signature:'s2',manual:true,routes:true,outdated:true,stops:[{id:'delivery:a',kind:'delivery',code:'A1',bags:1}],links:{segments:[],missing:[]}};
 await read('pkSync()');await Promise.resolve();assert.deepEqual(calls.filter(c=>c.url==='/api/tour').map(c=>c.body.action),['refresh']);
 calls.length=0;await read('pkSync()');assert.equal(calls.filter(c=>c.url==='/api/tour').length,0,'no repeated calls for the same stops');
 // Restaurant/CEO: per courier position state with useful detail; customers never get a map nor a position.
 read("PK.portal='restaurant';PK.me={id:'r',role:'restaurant',merchant:'levfood'};");
 const order={id:'o',m:'levfood',code:'O1',name:'C',tel:'900',addr:'Rua 3',t:1,lines:[],total:9,paid:true,claims:[],st:'go',mode:'deliv',parts:[{id:'p1',driver:'d1',driverName:'Ana',bags:2,state:'collected',position:{latitude:41.15,longitude:-8.61,accuracy:12,fixAt:now-200000,ageMs:200000,state:'stale',tracking:true},eta:{delivery:now+600000,at:now-60000,fresh:true}},{id:'p2',driver:'d2',driverName:'Rui',bags:1,state:'accepted',position:{latitude:41.16,longitude:-8.62,accuracy:5,fixAt:now-5000,ageMs:5000,state:'interrupted',tracking:false},eta:{pickup:now+60000,delivery:now+900000,at:now-900000,fresh:false}}]};
 read("store.orders={o:"+JSON.stringify(order)+"}");html=read("pkGPS(store.orders.o)");
 assert.match(html,/Position ancienne/);assert.match(html,/Suivi interrompu/);assert.match(html,/précision 12 m/);assert.match(html,/Livraison ≈/);assert.match(html,/Estimation à actualiser/);assert.match(html,/data-map-order="o"/);
 read("PK.portal='client';");html=read("orderCard(store.orders.o,'o',false)");assert(!html.includes('data-map-order')&&!html.includes('41.15'),'customer card must not expose GPS');
 console.log('Courier tour: automatic GPS (3 s, single page, refusal, lower accuracy), tour order/links/Waze and restaurant GPS states passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
`,harness);
