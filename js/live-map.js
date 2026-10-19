/* Private live map for CEO and the concerned restaurant only: customers and couriers never get it.
   Lot 4: one marker per courier holding a part of THIS order, moved with a short animation between two points
   really received (no invented coordinate is stored or sent), zoom kept across refreshes, explicit recentring.
   Only this order's pickup and destination are drawn: never the private tour or other customers. */
const pkMaps = new Map();
const coordinatesGPS = pkGPS;
const pkMapParts = order => (order.parts || []).filter(p => ['accepted', 'collected'].includes(p.state) && Number.isFinite(p.position?.latitude) && Number.isFinite(p.position?.longitude));
pkGPS = function (order) {
  const show = ['ceo', 'restaurant'].includes(PK.portal) && !['done', 'no'].includes(order.st) && pkMapParts(order).length;
  return coordinatesGPS(order) + (show ? `<div class="pk-map" data-map-order="${esc(order.id)}" style="height:240px;border-radius:14px;overflow:hidden;margin:12px 0" aria-label="Position des livreurs de cette commande"></div><div class="row">${pkButton('Recentrer la carte', 'map-recenter', order.id, 'ghost')}</div>` : '');
};
const noMapCustomerCard = orderCard;
orderCard = function (order, id, pro) { let html = noMapCustomerCard(order, id, pro); if (!pro) { if (order.gift) html += `<div class="info">🎁 ${esc(order.gift)}</div>`; if (order.message) html += `<div class="info">${esc(order.message)}</div>`; } return html; };
function pkMapAnimate(marker, accuracy, from, to) {
  // Visual transition only, from the last received point to the new received point.
  const start = performance.now(), duration = 900;
  cancelAnimationFrame(marker._pkFrame);
  const step = now => {
    const k = Math.min(1, (now - start) / duration), point = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
    marker.setLatLng(point); accuracy.setLatLng(point);
    if (k < 1) marker._pkFrame = requestAnimationFrame(step);
  };
  marker._pkFrame = requestAnimationFrame(step);
}
function pkMapBounds(entry) {
  const points = [...entry.drivers.values()].map(d => d.to).concat(entry.targets.map(t => t.getLatLng()));
  if (points.length > 1) entry.map.fitBounds(points, { padding: [28, 28], maxZoom: 16 });
  else if (points.length) entry.map.setView(points[0], 15);
}
const withoutMapsRender = render;
render = function () {
  const retained = new Map(); for (const [id, entry] of pkMaps) retained.set(id, entry);
  withoutMapsRender();
  const current = new Set();
  document.querySelectorAll('[data-map-order]').forEach(placeholder => {
    if (typeof L === 'undefined') return;
    const id = placeholder.dataset.mapOrder, order = store.orders[id]; if (!order) return;
    const parts = pkMapParts(order); if (!parts.length) return;
    current.add(id); let entry = retained.get(id);
    if (entry) { placeholder.replaceWith(entry.node); entry.map.invalidateSize(false); }
    else {
      const first = [parts[0].position.latitude, parts[0].position.longitude];
      const map = L.map(placeholder, { scrollWheelZoom: false }).setView(first, 14);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      entry = { map, node: placeholder, drivers: new Map(), targets: [] }; pkMaps.set(id, entry);
      requestAnimationFrame(() => map.invalidateSize(false));
    }
    const seen = new Set();
    for (const part of parts) {
      const pos = part.position, to = [pos.latitude, pos.longitude], live = pos.state === 'live' || pos.state === 'recent';
      seen.add(part.driver); let d = entry.drivers.get(part.driver);
      if (!d) {
        d = { marker: L.marker(to, {icon:L.divIcon({className:'courier-map-pin',html:'🚲',iconSize:[42,42],iconAnchor:[21,21]})}).addTo(entry.map), accuracy: L.circle(to, { radius: pos.accuracy || 0, color: '#c9a24a', weight: 1, fillOpacity: .08 }).addTo(entry.map), to };
        entry.drivers.set(part.driver, d);
      } else if (d.to[0] !== to[0] || d.to[1] !== to[1]) { pkMapAnimate(d.marker, d.accuracy, d.to, to); d.to = to; }
      d.marker.setOpacity(live?1:.5).bindTooltip(`🚲 ${esc(part.driverName || 'Livreur')} · ${esc((pkGpsStates[pos.state] || pkGpsStates.none)[1])}`);
      d.accuracy.setRadius(pos.accuracy || 0);
    }
    for (const [driver, d] of entry.drivers) if (!seen.has(driver)) { entry.map.removeLayer(d.marker); entry.map.removeLayer(d.accuracy); entry.drivers.delete(driver); }
    entry.targets.forEach(t => entry.map.removeLayer(t)); entry.targets = [];
    const menu = mdoc(order.m);
    if (menu.lat != null && order.m !== 'chabad-porto' && parts.some(p => p.state === 'accepted')) entry.targets.push(L.circleMarker([menu.lat, menu.lon], { radius: 7, color: '#c9a24a', fillOpacity: 1 }).addTo(entry.map).bindTooltip('Collecte · ' + esc(merch(order.m).name)));
    if (order.destLat != null) entry.targets.push(L.marker([order.destLat, order.destLon], {icon:L.divIcon({className:'destination-map-pin',html:'⌂',iconSize:[34,34],iconAnchor:[17,17]})}).addTo(entry.map).bindTooltip('Livraison #' + esc(order.code)));
    if (!retained.has(id)) pkMapBounds(entry);
  });
  for (const [id, entry] of retained) if (!current.has(id)) { entry.map.remove(); pkMaps.delete(id); }
};
const mapActions = A.pk;
A.pk = function (action, button) {
  if (action === 'map-recenter') { const entry = pkMaps.get(button?.dataset.id || ''); if (entry) pkMapBounds(entry); return; }
  return mapActions(action, button);
};
render();
