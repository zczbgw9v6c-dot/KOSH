// Execute every browser script in order and exercise gates without a real GPS or API.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),elements=new Map(),cache=new Map();
const element=()=>({innerHTML:'',style:{setProperty(){}},classList:{add(){},remove(){}},querySelector(){return null;},querySelectorAll(){return [];},appendChild(node){if(node.id)elements.set(node.id,node);},after(){},setAttribute(){},remove(){}});
elements.set('app',element());
const doc={documentElement:element(),body:element(),head:element(),activeElement:null,hidden:false,
  getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[],querySelector:selector=>selector.startsWith('link')?({href:'',setAttribute(){}}):null,createElement:element,addEventListener(){}};
const data={client:'public-user-id',time:Date.now(),gameExpires:0,orders:{},menus:{},events:{},scores:{},conf:{},me:null};
const context=vm.createContext({document:doc,window:{devicePixelRatio:1,addEventListener(){}},location:{pathname:'/'},navigator:{},performance:{now:()=>0},
  localStorage:{getItem:key=>cache.get(key)||null,setItem:(key,val)=>cache.set(key,val)},setInterval(){},setTimeout(){return 1;},clearTimeout(){},
  requestAnimationFrame(){},scrollTo(){},Date,Intl,console,URL,Blob,BigInt,crypto:require('node:crypto').webcrypto,
  fetch:async()=>({ok:true,json:async()=>data}),confirm:()=>true});
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
vm.runInContext(source.match(/<script>([\s\S]*?)<\/script>/)[1],context,{filename:'index.html'});
for(const file of ['arcade.js','professional.js','menu-composition.js','content-studio.js','live-map.js','operations.js','kitchen.js'])vm.runInContext(fs.readFileSync(path.join(root,'js',file),'utf8'),context,{filename:file});
const read=code=>vm.runInContext(code,context);
assert.equal(read('Boolean(arcade.allowed())'),false);
assert.match(read('vGames()'),/réservés aux clients/);
read('PK.data={};PK.serverTime=Date.now();PK.syncAt=0;PK.gameExpires=PK.serverTime+3600000;');
assert.equal(read('Boolean(arcade.allowed())'),true);
assert.equal(read('arcade.countdown()'),'60:00');
assert(!read('vGames()').includes(' / 10'));
read('PK.gameExpires=PK.serverTime;');assert.equal(read('Boolean(arcade.allowed())'),false);
assert.equal(read("arcade.integer('123456789012345678901234567890').toString()"),'123456789012345678901234567890');
read("store.scores={a:{n:'A',p:'999999999999999999999'},b:{n:'B',p:'1000000000000000000000'}}");
assert.equal(read('arcade.rankings()[0].id'),'b');
read("mdoc('levfood').items={'add-009':{s:4},menu:{id:'menu',n:'Menu',p:8,c:'Menus',components:[{id:'add-009',q:2}]}};");
assert.equal(read("items('levfood').find(i=>i.id==='menu').s"),2);
assert.equal(read("stk(items('levfood').find(i=>i.id==='menu'))"),'');
assert.match(read('vProfile()'),/Espace livreur/);assert.match(read('vProfile()'),/Espace CEO/);
console.log('Frontend: all modules loaded; game gating, arbitrary-precision ranking, menu stock and app links passed.');
