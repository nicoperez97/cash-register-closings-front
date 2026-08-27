/* Custom SW: Angular ngsw + Web Push (iOS PWA / Android / desktop). */
/* global self, clients, registration */
/* rev: notification-deeplink-v2 */
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
      type: data.type || null,
      shopId: data.shopId || null,
      shopName: data.shopName || null,
      notificationId: data.notificationId || null,
      paymentId: data.paymentId || null,
      closingId: data.closingId || null,
      targetId: data.targetId || null,
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
  if (!data) return '/';
  let raw = String(data.url || '').trim();
  if ((!raw || raw === '/') && data.paymentId) {
    const q = new URLSearchParams();
    if (data.shopId) q.set('shop', data.shopId);
    q.set('payment', data.paymentId);
    raw = `/payments/suppliers?${q.toString()}`;
  }
  try {
    const u = new URL(raw, self.location.origin);
    if (data.shopId && !u.searchParams.get('shop')) u.searchParams.set('shop', data.shopId);
    if (data.paymentId && !u.searchParams.get('payment')) {
      u.searchParams.set('payment', data.paymentId);
    }
    return u.pathname + u.search + u.hash;
  } catch {
    return raw || '/';
  }
}

const PENDING_CACHE = 'crc-push-pending';
const PENDING_KEY = '/__crc_pending_click';

async function savePendingUrl(url) {
  try {
    const cache = await caches.open(PENDING_CACHE);
    await cache.put(PENDING_KEY, new Response(url, { headers: { 'Content-Type': 'text/plain' } }));
  } catch {
    // ignore
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = (event.notification && event.notification.data) || {};
  const targetUrl = resolveNotificationUrl(data);
  const absolute = new URL(targetUrl, self.location.origin).href;
  event.waitUntil(
    (async () => {
      await savePendingUrl(targetUrl);
      const clientList = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clientList) {
        try {
          client.postMessage({ type: 'CRC_NOTIFICATION_CLICK', url: targetUrl, data });
        } catch {
          // ignore
        }
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(absolute);
      return undefined;
    })(),
  );
});
