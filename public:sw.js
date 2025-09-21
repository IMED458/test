// Service Worker for IMEDCalc PWA
const CACHE_NAME = 'imedcalc-v2.0.0';
const urlsToCache = [
    '/',
    '/index.html',
    '/logo.svg',
    '/manifest.json',
    '/js/script.js',
    '/js/auth.js',
    '/css/styles.css'
];

// Install event
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('📦 Cache opened');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑️ Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - Network First strategy
self.addEventListener('fetch', event => {
    // Don't cache API calls
    if (event.request.url.includes('/api/') || event.request.method !== 'GET') {
        event.respondWith(fetch(event.request));
        return;
    }

    // Cache First for static assets
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Return cached version or fetch from network
                if (response) {
                    return response;
                }
                return fetch(event.request).then(
                    networkResponse => {
                        // Cache the new response
                        if (networkResponse && networkResponse.status === 200) {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    cache.put(event.request, responseToCache);
                                });
                        }
                        return networkResponse;
                    }
                ).catch(() => {
                    // Network failed - show offline page for navigation requests
                    if (event.request.destination === 'document') {
                        return caches.match('/index.html');
                    }
                    return new Response('Offline - გთხოვთ, შეამოწმოთ ინტერნეტ კავშირი', {
                        status: 503,
                        statusText: 'Service Unavailable'
                    });
                });
            })
    );
});

// Background sync for failed requests (optional)
self.addEventListener('sync', event => {
    if (event.tag === 'sync-auth-requests') {
        event.waitUntil(this.syncPendingRequests());
    }
});

self.syncPendingRequests = async () => {
    // Implement background sync for failed auth requests if needed
    console.log('🔄 Background sync completed');
};

// Push notifications (optional)
self.addEventListener('push', event => {
    const options = {
        body: event.data ? event.data.text() : 'IMEDCalc ახალი შეტყობინება',
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: '1'
        },
        actions: [
            {
                action: 'explore',
                title: 'შეხედვა',
                icon: '/icon-192x192.png'
            },
            {
                action: 'close',
                title: 'დახურვა',
                icon: '/icon-192x192.png'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification('IMEDCalc', options)
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'explore') {
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// Handle messages from client
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

console.log('🚀 Service Worker loaded for IMEDCalc v2.0.0');