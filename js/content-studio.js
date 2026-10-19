/* Product photos for restaurants and CEO. The former content studio (pages, sections, styles, AI) is retired (H14-H18):
   its stored data stays on the server (conf/main, versions) but is no longer edited nor applied to any page. */
const nativeOpen=A.eopen;
A.eopen=function(id){nativeOpen(id);S.f.e_image=items(S.pro).find(p=>p.id===id)?.image||'';};
const nativeSave=A.esave;
A.esave=function(){const id=S.edit;if(id&&id!=='new'&&S.f.e_image)mdoc(S.pro).items[id]={...mdoc(S.pro).items[id],image:S.f.e_image};nativeSave();};
const legacyProView=originalPro;
const augmentRestaurant=pkRestaurant;
pkRestaurant=function(){let html=augmentRestaurant();if(PK.tab==='menu'&&S.edit&&S.edit!=='new')html=html.replace('<div class="row"><button class="btn sm gold" data-a="esave">',`<label>Photo du produit<input type="file" id="pk-product-photo" accept="image/jpeg,image/png,image/webp"></label>${S.f.e_image?'<p class="pill ok">Photo sélectionnée</p>':''}<div class="row"><button class="btn sm gold" data-a="esave">`);return html;};
const baseCEOView=pkCEO;
pkCEO=function(){let html=baseCEOView();if(PK.tab==='menus'&&S.edit&&S.edit!=='new')html=html.replace('<div class="row"><button class="btn sm gold" data-a="esave">',`<label>Photo du produit<input type="file" id="pk-product-photo" accept="image/jpeg,image/png,image/webp"></label><div class="row"><button class="btn sm gold" data-a="esave">`);return html;};
const noPhotoResto=vResto;
vResto=function(sh){let html=noPhotoResto(sh);items(S.rid).filter(p=>p.image).forEach(p=>{html=html.replace(`id="it-${p.id}"><div class="grow">`,`id="it-${p.id}"><img class="thumb" src="${esc(p.image)}" alt="${esc(p.n)}" loading="lazy"><div class="grow">`);});return html;};
document.addEventListener('change',async event=>{if(event.target.id!=='pk-product-photo')return;const file=event.target.files?.[0];if(!file)return;await pkDo(async()=>{const body=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});const photo=await pkApi('/api/photo',{merchant:S.pro,name:file.name,mime:file.type,body});S.f.e_image=photo.image;PK.notice='Photo importée. Enregistrez l’article pour la publier.';});});
render();

/* Restaurant cover follows the same scoped media store as product photos. */
const originalPoster=poster;
poster=function(m,cls){const image=mdoc(m.id).coverImage;return image?`<img class="${esc(cls||'')}" src="${esc(image)}" alt="${esc(m.name)}" loading="lazy">`:originalPoster(m,cls);};
const restaurantWithPhotos=pkRestaurant;
pkRestaurant=function(){
 let html=restaurantWithPhotos();
 if(PK.me&&PK.tab==='settings'){
  const m=mdoc(S.pro),image=S.f.restaurantPhotoPreview||m.coverImage;
  html=`<section class="box restaurant-photo-panel" data-pk-panel="Photo de mon restaurant"><h3>Photo de mon restaurant</h3><p class="mute">Cette image représente votre établissement dans la liste des restaurants et sur sa fiche client.</p>${image?`<img class="restaurant-cover-preview" src="${esc(image)}" alt="Aperçu de votre restaurant">`:poster(merch(S.pro),'restaurant-cover-preview')}<label for="pk-restaurant-photo">Choisir une nouvelle photo<input type="file" id="pk-restaurant-photo" accept="image/jpeg,image/png,image/webp"><small>JPEG, PNG ou WebP · 8 Mo maximum · privilégiez une photo horizontale.</small></label>${pkButton('Enregistrer la photo','restaurant-photo-save',S.pro)}${m.coverImage?pkButton('Revenir à la photo d’origine','restaurant-photo-reset',S.pro,'ghost'):''}<p class="mute">La photo devient visible par les clients après enregistrement.</p></section>`+html;
 }
 return html;
};
const actionsWithPhoto=A.pk;
A.pk=function(action,button){
 if(action==='menu-compose'){const title=button.dataset.id==='fixed'?'Formule à composition fixe':'Formule au choix';const panel=[...document.querySelectorAll('details.ui-menu')].find(el=>el.querySelector('summary')?.textContent===title);if(panel){panel.open=true;panel.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}return false;}
 if(action==='restaurant-photo-save'||action==='restaurant-photo-reset')return pkDo(async()=>{
  const mid=button.dataset.id,image=action==='restaurant-photo-reset'?'':S.f.restaurantPhoto;
  if(action==='restaurant-photo-save'&&!image)throw new Error('Choisissez d’abord une photo.');
  await pkApi('/api/restaurant-photo',{merchant:mid,image});delete S.f.restaurantPhoto;delete S.f.restaurantPhotoPreview;PK.notice='La photo de votre restaurant a été mise à jour.';
 });
 return actionsWithPhoto(action,button);
};
document.addEventListener('change',async event=>{
 if(event.target.id!=='pk-restaurant-photo')return;
 const file=event.target.files?.[0];if(!file)return;
 await pkDo(async()=>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)throw new Error('Choisissez une image JPEG, PNG ou WebP de 8 Mo maximum.');
  const preview=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);});
  const photo=await pkApi('/api/photo',{merchant:S.pro,name:file.name,mime:file.type,body:preview.split(',')[1]});
  S.f.restaurantPhoto=photo.image;S.f.restaurantPhotoPreview=preview;PK.notice='Photo sélectionnée. Enregistrez pour la publier.';
 });
});
