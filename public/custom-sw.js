/* Custom SW: Angular ngsw + Web Push (iOS PWA / Android / desktop). */
/* global self, clients, registration */
importScripts('./ngsw-worker.js');

self.addEventListener('push', (event) => {
  let data = {
    title: 'Cierres de caja',
    body: 'Tenés una notificación nueva',
    url: '/',
    tag: 'crc-notification',
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    try {
      const text = event.data && event.data.text();
      if (text) data.body = text;
    } catch {
      // ignore
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Cierres de caja', {
      body: data.body || '',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag: data.tag || 'crc-notification',
      renotify: true,
      data: {
        url: data.url || '/',
        shopId: data.shopId || null,
        notificationId: data.notificationId || null,
      },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification && event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            return client.navigate(targetUrl).then((c) => (c && c.focus ? c.focus() : client.focus()));
          }
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});
