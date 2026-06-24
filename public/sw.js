const isLocalhost = Boolean(
  self.location.hostname === 'localhost' ||
    self.location.hostname === '[::1]' ||
    self.location.hostname.match(
      /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
    )
);

if (isLocalhost) {
  self.addEventListener('install', (event) => {
    self.skipWaiting();
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(cacheNames.map((name) => caches.delete(name)));
      }).then(() => self.registration.unregister())
    );
  });

  self.addEventListener('fetch', (event) => {
    return; // bypass all caching in development
  });
} else {
  const CACHE_NAME = 'on-journey-cache-v1';
  const PRECACHE_ASSETS = [
    '/',
    '/icon-192x192.png',
    '/icon-512x512.png',
  ];

  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(PRECACHE_ASSETS);
      })
    );
    self.skipWaiting();
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    );
    self.clients.claim();
  });

  self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (
      url.pathname.startsWith('/api/') || 
      url.pathname.startsWith('/_next/webpack-hmr') ||
      url.hostname.includes('supabase.co')
    ) {
      return; 
    }

    if (
      event.request.destination === 'image' || 
      event.request.destination === 'font' ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.jpg') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.woff2')
    ) {
      event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          });
        })
      );
      return;
    }

    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          return cachedResponse;
        });

        return cachedResponse || fetchPromise;
      })
    );
  });

  self.addEventListener('push', function (event) {
    if (event.data) {
      try {
        const data = event.data.json();
        const options = {
          body: data.body,
          icon: data.icon || '/icon-192x192.png',
          badge: '/icon-192x192.png',
          vibrate: [100, 50, 100],
          data: {
            dateOfArrival: Date.now(),
            primaryKey: '2',
          },
        };
        event.waitUntil(self.registration.showNotification(data.title || 'On-Journey 알림', options));
      } catch (e) {
        const options = {
          body: event.data.text(),
          icon: '/icon-192x192.png',
          badge: '/icon-192x192.png',
          vibrate: [100, 50, 100],
        };
        event.waitUntil(self.registration.showNotification('On-Journey 알림', options));
      }
    }
  });

  self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          const url = new URL(client.url);
          if (url.pathname === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  });
}
