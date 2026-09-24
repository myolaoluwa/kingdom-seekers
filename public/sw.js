self.addEventListener('push', event => {
  let message = {};
  try { message = event.data?.json() ?? {}; } catch { message = {}; }
  const title = typeof message.title === 'string' ? message.title : 'Kingdom Seekers';
  const body = typeof message.body === 'string' ? message.body : 'A new community update is ready.';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    data: { url: '/' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) return existing.focus();
    return self.clients.openWindow('/');
  })());
});
