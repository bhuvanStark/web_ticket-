// TaskTel service worker — Web Push only (technician ticket-assignment
// notifications). No fetch handler and no caching: the app's network
// behaviour is exactly the same as without this worker.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'TaskTel';
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || 'You have a new ticket assignment.',
    icon: 'tasktel-icon.png',
    badge: 'tasktel-icon.png',
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
    data: { ticketId: payload.ticketId || null }
  }));
});

// Focus an open TaskTel tab if there is one, otherwise open the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const appUrl = self.registration.scope;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((w) => w.url.startsWith(appUrl));
    if (existing) return existing.focus();
    return self.clients.openWindow(appUrl);
  })());
});
