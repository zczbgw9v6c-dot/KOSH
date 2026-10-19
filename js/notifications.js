/* Lot 5b: notifications of the professional spaces (restaurant, courier, CEO).
   Foreground: sound + local notification while the app is open. Background: Web Push when the server is configured.
   First use: a guided panel explains home-screen installation (iPhone, iOS 16.4 or later), asks the permission
   only on an explicit tap, shows a diagnostic and lets the user retry. "Sent" is never presented as received. */
const PN = { reg: null, sub: null, endpoint: '', server: null, checking: false, message: '', error: '', forAccount: null, subscribed: false };
const PN_GUIDE = () => 'kosh-notif-guide:' + PK.portal;
function pnPlatform() {
  const ua = navigator.userAgent || '', touchMac = /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
  const ios = /iPhone|iPad|iPod/.test(ua) || touchMac;
  const m = ua.match(/OS (\d+)[_.](\d+)/) || ua.match(/Version\/(\d+)\.(\d+)/);
  const version = ios && m ? [+m[1], +m[2]] : null;
  const standalone = (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  return { ios, version, iosOk: !ios || !version || version[0] > 16 || (version[0] === 16 && version[1] >= 4), standalone,
    android: /Android/.test(ua), mac: /Macintosh/.test(ua) && !ios };
}
const pnSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
const pnPermission = () => ('Notification' in window ? Notification.permission : 'unsupported');
function pnKey(base64) {
  const pad = '='.repeat((4 - base64.length % 4) % 4), raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function pnDevice() { const p = pnPlatform(); return (p.ios ? 'iPhone/iPad' : p.android ? 'Android' : p.mac ? 'Mac' : 'Navigateur') + (p.standalone ? ' · écran d’accueil' : ''); }
async function pnRegister() {
  if (!('serviceWorker' in navigator)) return null;
  try { PN.reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' }); } catch (error) { PN.error = 'Service worker indisponible : ' + error.message; PN.reg = null; }
  return PN.reg;
}
/* Diagnostic refresh. silent=true re-attaches an existing permission to the account after a (re)login, without prompting. */
async function pnRefresh(silent = false) {
  if (PK.portal === 'client' || !PK.me || PN.checking) return;
  PN.checking = true;
  try {
    if (pnSupported()) {
      const reg = PN.reg || await pnRegister();
      PN.sub = reg ? await reg.pushManager.getSubscription() : null;
      PN.endpoint = PN.sub?.endpoint || '';
    }
    PN.server = await pkApi('/api/push', { action: 'status', endpoint: PN.endpoint });
    PN.subscribed = !!PN.server.subscribed;
    if (silent && !PN.subscribed && PN.server.enabled && pnPermission() === 'granted' && pnPlatform().iosOk) await pnSubscribe(true);
  } catch (error) { PN.error = error.message; }
  finally { PN.checking = false; }
}
async function pnSubscribe(silent = false) {
  const reg = PN.reg || await pnRegister();
  if (!reg) throw new Error('Ce navigateur ne permet pas les notifications en arrière-plan.');
  if (!PN.server?.publicKey) PN.server = await pkApi('/api/push', { action: 'status', endpoint: PN.endpoint });
  if (!PN.server.enabled) throw new Error('Notifications en arrière-plan indisponibles sur le serveur : ' + (PN.server.reason || 'non configuré') + '. Les alertes restent actives application ouverte.');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pnKey(PN.server.publicKey) });
  await pkApi('/api/push', { action: 'subscribe', subscription: sub.toJSON(), device: pnDevice() });
  PN.sub = sub; PN.endpoint = sub.endpoint; PN.subscribed = true;
  if (!silent) PN.message = 'Notifications activées sur cet appareil pour l’espace ' + pkRoles[PK.portal] + '.';
}
/* Called from a button: the permission prompt only ever follows an explicit tap. */
async function pnEnable() {
  PN.error = ''; PN.message = '';
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); await actx.resume(); beep(); } catch {}
  PK.notifications = true;
  if (!('Notification' in window)) { PN.message = 'Ce navigateur n’affiche pas de notifications : alertes sonores uniquement, application ouverte.'; return; }
  const p = pnPlatform();
  if (p.ios && !p.iosOk) { PN.message = 'iOS ' + p.version.join('.') + ' : les notifications web demandent iOS 16.4 ou plus récent. Alertes sonores uniquement, application ouverte.'; return; }
  if (p.ios && !p.standalone) { PN.message = 'Ajoutez d’abord KOSH à l’écran d’accueil, puis ouvrez-le depuis son icône pour autoriser les notifications.'; return; }
  const answer = await Notification.requestPermission();
  if (answer !== 'granted') { PN.message = answer === 'denied' ? 'Notifications refusées. Elles peuvent être réactivées dans les réglages de l’appareil (voir ci-dessous).' : 'Autorisation non accordée.'; return; }
  try { await pnSubscribe(); } catch (error) { PN.message = 'Alertes activées application ouverte. ' + error.message; }
}
async function pnDisable() {
  if (PN.endpoint) await pkApi('/api/push', { action: 'unsubscribe', endpoint: PN.endpoint });
  PN.subscribed = false; PN.message = 'Notifications en arrière-plan désactivées pour cet espace sur cet appareil.';
}
async function pnTest() {
  const result = await pkApi('/api/push', { action: 'test', endpoint: PN.endpoint });
  PN.message = result.message;
}
/* Local (foreground) notification. Skipped when this device already receives the same event by push. */
function pkLocalNotify(body) {
  if (PN.subscribed || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification('KOSH', { body, tag: 'kosh-' + PK.portal }); }
  catch { PN.reg?.showNotification('KOSH', { body, tag: 'kosh-' + PK.portal }).catch(() => {}); }
}
const pnRow = (ok, label, detail = '') => `<li><span class="pill ${ok === true ? 'ok' : ok === false ? 'bad' : 'gold'}">${ok === true ? 'OK' : ok === false ? 'À faire' : 'Info'}</span> <b>${label}</b>${detail ? `<br><span class="mute">${detail}</span>` : ''}</li>`;
function pnSteps(p) {
  if (p.ios && !p.iosOk) return `<p class="alert">iOS ${p.version.join('.')} : les notifications web exigent iOS 16.4 ou plus récent. Mettez l’iPhone à jour ; en attendant, les alertes sonores fonctionnent seulement application ouverte.</p>`;
  if (p.ios && !p.standalone) return `<ol class="pn-steps"><li>Dans Safari, touchez <b>Partager</b> (carré avec une flèche).</li><li>Choisissez <b>Sur l’écran d’accueil</b>, puis <b>Ajouter</b>.</li><li>Ouvrez <b>KOSH ${esc(pkRoles[PK.portal])}</b> depuis la nouvelle icône, connectez-vous, puis revenez ici pour activer les notifications.</li></ol>`;
  if (pnPermission() === 'denied') return `<p class="alert">Notifications refusées sur cet appareil. ${p.ios ? 'Réglages de l’iPhone → Notifications → KOSH → Autoriser les notifications' : p.mac ? 'Réglages du site dans le navigateur (icône à gauche de l’adresse) → Notifications → Autoriser' : 'Réglages du site (icône à gauche de l’adresse) → Notifications → Autoriser'}, puis touchez « Vérifier à nouveau ».</p>`;
  return `<p class="mute">${p.android || p.mac ? 'Vous pouvez aussi installer l’application (menu du navigateur → Installer / Ajouter à l’écran d’accueil). ' : ''}Touchez « Activer les notifications » : votre appareil vous demandera l’autorisation.</p>`;
}
function pnPanel(first = false) {
  if (!PK.me) return '';
  const p = pnPlatform(), perm = pnPermission(), s = PN.server || PK.data?.push || {};
  const rows = [
    pnRow(pnSupported() ? true : 'Notification' in window ? null : false, 'Navigateur', pnSupported() ? 'Notifications et service worker disponibles.' : 'Notifications en arrière-plan non disponibles dans ce navigateur.'),
    ...(p.ios ? [pnRow(p.iosOk, 'Version iOS', p.version ? 'iOS ' + p.version.join('.') + (p.iosOk ? '' : ' (16.4 minimum)') : 'Version non détectée'), pnRow(p.standalone, 'Écran d’accueil', p.standalone ? 'Application ouverte depuis son icône.' : 'Installation requise sur iPhone pour les notifications.')] : []),
    pnRow(perm === 'granted' ? true : perm === 'denied' ? false : null, 'Autorisation', { granted: 'Accordée', denied: 'Refusée', default: 'Pas encore demandée', unsupported: 'Non prise en charge' }[perm]),
    pnRow(s.enabled ? true : false, 'Service push du serveur', s.enabled ? 'Configuré.' : 'Non configuré (' + esc(s.reason || 'inconnu') + ') : alertes application ouverte uniquement.'),
    pnRow(PN.subscribed, 'Cet appareil', PN.subscribed ? 'Abonné pour l’espace ' + esc(pkRoles[PK.portal]) + '.' : 'Non abonné pour cet espace.'),
  ].join('');
  const actions = [
    !PN.subscribed ? pkButton('Activer les notifications', 'notif-enable') : pkButton('Envoyer une notification de test', 'notif-test', '', 'ghost'),
    pkButton('Vérifier à nouveau', 'notif-check', '', 'ghost'),
    PN.subscribed ? pkButton('Désactiver sur cet appareil', 'notif-disable', '', 'ghost') : '',
    first ? pkButton('Plus tard', 'notif-later', '', 'ghost') : '',
  ].join('');
  return `<div class="box pn-panel" data-pk-panel="Notifications"><h3>${first ? 'Recevoir les alertes sur cet appareil' : 'Notifications sur cet appareil'}</h3><p class="mute">Nouvelles commandes, paiements à vérifier, commande prête, alertes sans livreur. Une notification ne maintient pas le GPS actif et un envoi par le serveur ne prouve pas la réception.</p>${pnSteps(p)}${PN.message ? `<p class="info" role="status">${esc(PN.message)}</p>` : ''}${PN.error ? `<p class="alert">${esc(PN.error)}</p>` : ''}<details${first ? ' open' : ''}><summary>Diagnostic</summary><ul class="pn-diag">${rows}</ul></details><div class="row">${actions}</div></div>`;
}
function pnFirstUse() {
  if (!PK.me || PK.portal === 'client') return '';
  let seen = '';
  try { seen = localStorage.getItem(PN_GUIDE()) || ''; } catch {}
  return seen || PN.subscribed ? '' : pnPanel(true);
}
function pnStatusCEO() {
  const s = PK.data?.push || {}, c = s.counts || {}, d = s.devices || {};
  return `<div class="box" data-pk-panel="Service de notifications"><h3>Service de notifications</h3><p><span class="pill ${s.enabled ? 'ok' : 'bad'}">${s.enabled ? 'Web Push configuré' : 'Mode dégradé'}</span> ${s.enabled ? '' : `<span class="mute">${esc(s.reason || '')} · alertes application ouverte uniquement</span>`}</p><p>Appareils abonnés : restaurateurs ${d.restaurant || 0} · livreurs ${d.driver || 0} · CEO ${d.ceo || 0}</p><p>En attente <b>${c.pending || 0}</b> (dont ${s.late || 0} en retard) · transmis au service <b>${c.sent || 0}</b> · en échec <b>${c.failed || 0}</b> · abonnements expirés <b>${c.expired || 0}</b></p><p class="mute">Dernier contrôle : ${s.lastFlush ? pkDate(s.lastFlush) : 'aucun'}${s.lastError ? ` · dernière erreur ${pkDate(s.lastError.at)} : ${esc(s.lastError.message)}` : ''}. « Transmis » signifie accepté par le service du navigateur, pas affiché sur l’appareil.</p>${(s.errors || []).length ? `<details><summary>Erreurs récentes</summary>${s.errors.map(e => `<p class="mute">${pkDate(e.created)} · ${esc(e.event.split(':')[0])} · ${esc(e.state)} · ${esc(e.error || '')}</p>`).join('')}</details>` : ''}</div>`;
}
const pnBaseSync = pkSync;
pkSync = async function () {
  await pnBaseSync();
  if (PK.portal !== 'client' && PK.me && PN.forAccount !== PK.me.id) { PN.forAccount = PK.me.id; await pnRefresh(true); render(); }
  if (!PK.me) PN.forAccount = null;
};
const pnBaseAction = A.pk;
A.pk = function (action, button) {
  const run = fn => pkDo(async () => { await fn(); });
  if (action === 'notif-enable') return run(pnEnable).then(() => pnRefresh()).then(render);
  if (action === 'notif-test') return run(pnTest);
  if (action === 'notif-disable') return run(pnDisable).then(() => pnRefresh()).then(render);
  if (action === 'notif-check') { PN.error = ''; PN.message = ''; return pnRefresh().then(render); }
  if (action === 'notif-later') { try { localStorage.setItem(PN_GUIDE(), 'later'); } catch {} render(); return; }
  if (action === 'logout' && PN.endpoint) { // this role stops receiving pushes on this device; other spaces keep theirs
    const endpoint = PN.endpoint; PN.subscribed = false; PN.forAccount = null;
    return pkApi('/api/push', { action: 'unsubscribe', endpoint }).catch(() => {}).then(() => pnBaseAction(action, button));
  }
  return pnBaseAction(action, button);
};
if (PK.portal !== 'client') {
  try { if ('Notification' in window && Notification.permission === 'granted') PK.notifications = true; } catch {}
  pnRegister();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && PK.me) pnRefresh().then(render); });
}
