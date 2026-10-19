// Exercise the actual canvas loop against deterministic input; Python replays it independently.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const harness=path.join(__dirname,'frontend.cjs'),mod=new Module(harness,module);
mod.filename=harness;mod.paths=module.paths;
mod._compile(fs.readFileSync(harness,'utf8')+`
const vectors=[];
for(const key of ['spin','stack','sky']){
  const handlers={},drawing=new Proxy({}, {get:(_o,k)=>k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
  const canvas={getContext:()=>drawing,addEventListener:(name,fn)=>handlers[name]=fn};elements.set('gc',canvas);
  context.requestAnimationFrame=fn=>{context.nextFrame=fn;};
  read("PK.portal='client';PK.data={};PK.serverTime=Date.now();PK.syncAt=0;PK.gameExpires=PK.serverTime+3600000;PK.replay={seed:1234567,taps:[],tick:0,ack:0};arcade.best={};S.gk='"+key+"';S.tab='game';startGame();");
  for(let frame=0;frame<6000;frame++){
    if(frame===1||frame%29===0)handlers.pointerdown({preventDefault(){}});
    context.nextFrame(frame*1000/60);
  }
  vectors.push({key,seed:1234567,tick:read('PK.replay.tick'),taps:read('PK.replay.taps'),best:read("String(arcade.best['"+key+"']||'0')")});
  read('arcade.finish()');
}
console.log(JSON.stringify(vectors));
`,harness);
