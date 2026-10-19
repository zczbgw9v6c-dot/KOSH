const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const harness=path.join(__dirname,'frontend.cjs'),mod=new Module(harness,module);
mod.filename=harness;mod.paths=module.paths;
mod._compile(fs.readFileSync(harness,'utf8')+`
(async()=>{
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  read("PK.portal='restaurant';PK.me={id:'test',role:'restaurant',merchant:'levfood'};PK.initialized=true;S.pro='levfood';store.menus={levfood:{_revision:1,items:{'add-009':{s:5}}}};A.eopen('add-009');S.f.e_n='New name';");
  doc.activeElement={matches:()=>true};
  data.me={id:'test',role:'restaurant',merchant:'levfood'};data.menus={levfood:{_revision:2,items:{'add-009':{s:3}}}};
  await read('pkSync()');
  read("globalThis.saved=null;put=(p,d)=>{globalThis.saved=JSON.parse(JSON.stringify(d));};A.esave();");
  assert.equal(read('saved'),null);assert.match(read('PK.error'),/stock ont changé/);
  read("A.eopen('add-009');S.f.e_n='New name';A.esave();");
  assert.equal(read("saved.items['add-009'].s"),3);assert.equal(read('saved._revision'),2);
  // Lot 1: finance and studio are retired from every CEO menu, without touching stored data.
  assert.equal(read("pkSections.ceo.map(([key])=>key).filter(key=>['finance','studio'].includes(key)).length"),0);
  read("PK.portal='ceo';PK.me={id:'ceo',role:'ceo'};PK.busy=false;PK.data={orders:{},drivers:[]};store.orders={};PK.tab='finance';");
  assert(!read('pkCEO()').includes('Factures et rentabilité'));assert.equal(read('PK.tab'),'orders');
  read("PK.portal='client';store.menus={levfood:{items:{'x-choice':{n:'Menu',p:8,c:'Menus',menuChoices:[{category:'Desserts',q:1}]}}}};store.orders={old:{m:'levfood',lines:[{id:'x-choice',n:'Menu',p:8,q:1,o:['1 × Cookie'],choices:{'add-009':1}}]}};A.again('old');");
  assert.equal(read("lines()[0].choices['add-009']"),1);
  read("store.menus.levfood.items['add-009']={off:true};A.again('old');");
  assert.equal(read('S.tab'),'cfg');assert.equal(read('S.cf.id'),'x-choice');
  read("store.menus.levfood.items['add-009']={off:false};store.menus.levfood.items.xb={n:'Extra',p:1,c:'Removed'};store.orders.old.lines[0].choices.xb=1;A.again('old');");
  assert.equal(read('S.tab'),'cfg','Removed category must reopen menu choices');
  // Simulate the DOM replacement performed by rendering a language dropdown.
  const live={_run:'run-a'},replacement={replaceWith(node){elements.set('gc',node);}};
  elements.set('gc',live);
  let inner='';Object.defineProperty(elements.get('app'),'innerHTML',{get:()=>inner,set:value=>{inner=value;elements.set('gc',replacement);},configurable:true});
  doc.activeElement=null;
  read("S.tab='game';S.gk='spin';PK.run='run-a';PK.gameExpires=Date.now()+3600000;PK.serverTime=Date.now();PK.syncAt=0;PK.data={};A.lgo();render();");
  assert.equal(elements.get('gc'),live,'Language render must preserve running game canvas');
  console.log('Frontend regressions passed: stock editor, retired finance/studio, menu reorder and game canvas.');
})().catch(error=>{console.error(error);process.exitCode=1;});
`,harness);
