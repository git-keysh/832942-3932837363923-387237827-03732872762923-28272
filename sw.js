/* Service worker: shows notifications and checks due dates in the background when the browser allows it. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});

const dayOf = (d) => Math.round((new Date(d + 'T00:00:00') - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00')) / 86400000);

async function check() {
  const cache = await caches.open('sc-data');
  const res = await cache.match('due.json');
  if (!res) return;
  const data = await res.json();
  const today = new Date().toISOString().slice(0, 10);
  const seenRes = await cache.match('seen.json');
  const seen = seenRes ? await seenRes.json() : { day: '' };
  if (seen.day === today) return;
  const soon = (data.items || []).filter((i) => dayOf(i.date) <= (data.window || 15));
  if (!soon.length) return;
  const label = (n) => (n < 0 ? `overdue ${-n}d` : n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
  await self.registration.showNotification(soon.length === 1 ? soon[0].title : `${soon.length} dates coming up`, {
    body: soon.slice(0, 3).map((i) => `${i.title}${i.customer ? ' · ' + i.customer : ''} (${label(dayOf(i.date))})`).join('\n'),
    tag: 'sc-daily', icon: 'assets/watermark.png', badge: 'assets/watermark.png', data: { url: self.registration.scope }
  });
  await cache.put('seen.json', new Response(JSON.stringify({ day: today })));
}
self.addEventListener('periodicsync', (e) => { if (e.tag === 'sc-due') e.waitUntil(check()); });
self.addEventListener('message', (e) => { if (e.data === 'check') e.waitUntil(check()); });
