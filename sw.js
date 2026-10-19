/* KOSH service worker (professional spaces). It only displays Web Push messages and opens the right space.
   No offline cache: orders, positions and stocks must always come from the server, never from a stale copy. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';
  event.waitUntil(self.registration.showNotification(data.title || 'KOSH', {
    body: data.body || 'Nouvelle notification', tag: data.tag || undefined, renotify: Boolean(data.tag),
    icon: '/img/icon-192.png', badge: '/img/icon-192.png', data: { url },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) if (client.url.startsWith(target) && 'focus' in client) return client.focus();
    return self.clients.openWindow(target);
  }));
});
self.addEventListener('pushsubscriptionchange', event => {
  // The browser replaced the subscription: the app re-attaches it at the next opening (diagnostic shows "non abonné").
  event.waitUntil(Promise.resolve());
});
