/* Menus reserve their ingredients; customers see availability, not a menu stock count. */
const rawItems = items;
items = function(mid) {
  const products = rawItems(mid);
  return products.map(product => {
    const limits = [];
    if (product.components?.length) product.components.forEach(part => {
      const ingredient = products.find(p=>p.id===part.id);
      if (!ingredient || ingredient.off) limits.push(0);
      else if (typeof ingredient.s==='number') limits.push(Math.floor(ingredient.s/part.q));
    });
    if (product.menuChoices?.length) product.menuChoices.forEach(group => {
      const available = products.filter(p=>p.c===group.category&&!p.off&&!p.components&&!p.menuChoices);
      if (!available.length) limits.push(0);
      else if (available.every(p=>typeof p.s==='number')) limits.push(Math.floor(available.reduce((a,p)=>a+p.s,0)/group.q));
    });
    return limits.length ? {...product,s:Math.min(...limits)} : product;
  });
};
const normalStock=stk;
stk=i=>i.components?.length||i.menuChoices?.length?'':normalStock(i);
const normalQty=qty;
qty=function(i,blocked){if(i.menuChoices?.length){if(i.s===0||i.off)return `<span class="pill bad">${t('off')}</span>`;return blocked?'':`<button class="btn sm ghost" data-a="cfg" data-v="${esc(i.id)}" data-m="${i.mid}">Composer</button>`;}return normalQty(i,blocked);};
const normalCfg=A.cfg;
A.cfg=function(id,button){const mid=button.dataset.m,item=items(mid).find(p=>p.id===id);if(item?.menuChoices?.length){S.cf={mid,id,choices:{},q:1};S.f.cf_note='';S.tab='cfg';}else normalCfg(id,button);};
const normalCfgView=vCfg;
vCfg=function(){const config=S.cf,item=config&&items(config.mid).find(p=>p.id===config.id);if(!item?.menuChoices?.length)return normalCfgView();const products=items(config.mid);let valid=true;
  const groups=item.menuChoices.map(group=>{const chosen=products.filter(p=>p.c===group.category).reduce((a,p)=>a+(config.choices[p.id]||0),0);if(chosen!==group.q)valid=false;
    return `<div class="box"><h3>${esc(group.category)} · ${chosen} / ${group.q}</h3>${products.filter(p=>p.c===group.category&&!p.components&&!p.menuChoices).map(p=>{const unavailable=p.off||p.s===0,count=config.choices[p.id]||0;return `<div class="item" style="${unavailable?'opacity:.45':''}"><div class="grow"><b>${esc(p.n)}</b>${unavailable?`<br>${t('off')}`:''}</div><div class="qty"><button data-a="bundle-choice" data-v="${esc(p.id)}" data-step="-1" ${count?'':'disabled'}>−</button><b>${count}</b><button data-a="bundle-choice" data-v="${esc(p.id)}" data-step="1" ${unavailable||chosen>=group.q||typeof p.s==='number'&&count>=p.s?'disabled':''}>+</button></div></div>`;}).join('')}</div>`;}).join('');
  return `<button class="btn sm ghost" data-a="open" data-v="${config.mid}">‹ ${t('back')}</button><h2>${esc(item.n)}</h2><b class="price">${eur(item.p)}</b>${groups}<div class="box">${inp('cf_note',t('instr'))}<button class="btn gold" data-a="bundle-add" ${valid?'':'disabled'}>${t('addCart')} · ${eur(item.p)}</button></div>`;
};
A['bundle-choice']=function(id,button){const config=S.cf;config.choices[id]=Math.max(0,(config.choices[id]||0)+ +button.dataset.step);};
A['bundle-add']=function(){const config=S.cf,item=items(config.mid).find(p=>p.id===config.id),products=items(config.mid);for(const group of item.menuChoices){if(products.filter(p=>p.c===group.category).reduce((a,p)=>a+(config.choices[p.id]||0),0)!==group.q)return;}
  if(S.cartR&&S.cartR!==config.mid)S.cart={};S.cartR=config.mid;const choices=Object.fromEntries(Object.entries(config.choices).filter(([,q])=>q>0)),key=item.id+'~menu~'+JSON.stringify(choices);S.cfgs[key]={choices,o:Object.entries(choices).map(([id,q])=>q+' × '+products.find(p=>p.id===id).n),note:S.f.cf_note||''};S.cart[key]=(S.cart[key]||0)+1;S.rid=config.mid;S.tab='resto';};
const normalLines=lines;
lines=()=>normalLines().map(line=>({...line,choices:S.cfgs[line.key]?.choices}));
const oldMenuTools=pkMenuTools;
pkMenuTools=function(mid){const categories=[...new Set(items(mid).filter(i=>!i.components&&!i.menuChoices).map(i=>i.c))];return oldMenuTools(mid)+`<div class="box"><h3>Formule au choix</h3><p class="mute">Exemple : choisissez 1 plat et 1 boisson. Le client sélectionne ses produits dans chaque catégorie. Laissez 0 pour exclure une catégorie.</p>${inp('choiceName','Nom du menu')}${inp('choicePrice','Prix du menu (€)','number')}${categories.map(category=>`<label class="tot"><span>${esc(category)}</span><input type="number" min="0" max="10" style="max-width:80px" data-f="choice_${esc(category)}" value="${esc(S.f['choice_'+category]||'')}" placeholder="0"></label>`).join('')}${pkButton('Ajouter le menu au choix','choice-menu',mid)}</div>`;};
const otherProfessionalActions=A.pk;
A.pk=function(action,button){if(action!=='choice-menu')return otherProfessionalActions(action,button);return pkDo(async()=>{const mid=button.dataset.id,products=items(mid),categories=[...new Set(products.map(i=>i.c))],menuChoices=categories.filter(c=>+S.f['choice_'+c]>0).map(category=>({category,q:+S.f['choice_'+category]}));if(!menuChoices.length||!S.f.choiceName)throw new Error('Indiquez le nom et les catégories du menu.');const menu=mdoc(mid);menu.items['x'+Date.now().toString(36)]={n:S.f.choiceName,p:+S.f.choicePrice,c:'Menus',d:'Menu composé au choix',menuChoices};await pkApi('/api/menu',{merchant:mid,menu});});};
render();

const reorderWithChoices=A.again;
A.again=function(id){
  reorderWithChoices(id);
  const products=items(S.cartR);
  for(const key of Object.keys(S.cart)){
    const product=products.find(p=>p.id===key.split('~')[0]);if(!product?.menuChoices?.length)continue;
    const choices=S.cfgs[key]?.choices||{};
    const valid=Object.entries(choices).every(([pid,q])=>{const p=products.find(i=>i.id===pid);return p&&product.menuChoices.some(group=>group.category===p.c)&&!p.off&&!p.components&&!p.menuChoices&&q>0&&(!Number.isFinite(p.s)||p.s>=q*S.cart[key]);}) && product.menuChoices.every(group=>Object.entries(choices).filter(([pid])=>products.find(i=>i.id===pid)?.c===group.category).reduce((a,[,q])=>a+q,0)===group.q);
    if(!valid){delete S.cart[key];delete S.cfgs[key];S.cf={mid:S.cartR,id:product.id,choices:{},q:1};S.f.cf_note='';S.tab='cfg';S.toast='La carte a changé : composez à nouveau ce menu.';S.bad=true;break;}
  }
};
