/* Custom SW: Angular ngsw + Web Push (iOS PWA / Android / desktop). */
/* global self, clients, registration */
/* rev: notification-deeplink-v1 */
importScripts('./ngsw-worker.js');

self.addEventListener('push', (event) => {
  let data = {
    title: 'Cierres de caja',
    body: 'Tenés una notificación nueva',
    url: '/',
    tag: 'crc-notification',
    unreadCount: null,
    icon: null,
    image: null,
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

  const parsedUnread = Number(data.unreadCount);
  const badgeCount =
    Number.isFinite(parsedUnread) && parsedUnread > 0
      ? Math.floor(parsedUnread)
      : 1;

  const icon = data.icon || '/icons/icon-192x192.png';
  const options = {
    body: data.body || '',
    icon: icon,
    badge: '/icons/icon-192x192.png',
    tag: data.tag || 'crc-notification',
    renotify: true,
    data: {
      url: data.url || '/',
      shopId: data.shopId || null,
      shopName: data.shopName || null,
      notificationId: data.notificationId || null,
    },
  };
  if (data.image) {
    options.image = data.image;
  }

  const show = self.registration.showNotification(
    data.title || 'Cierres de caja',
    options,
  );

  const setBadge =
    typeof self.registration.setAppBadge === 'function'
      ? self.registration.setAppBadge(badgeCount).catch(() => undefined)
      : Promise.resolve();

  event.waitUntil(Promise.all([show, setBadge]));
});

function resolveNotificationUrl(data) {
  const raw = (data && data.url) || '/';
  try {
    const u = new URL(raw, self.location.origin);
    if (data && data.shopId && !u.searchParams.get('shop')) {
      u.searchParams.set('shop', data.shopId);
    }
    return u.pathname + u.search + u.hash;
  } catch {
    return raw;
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = resolveNotificationUrl(event.notification && event.notification.data);
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
