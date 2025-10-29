const CACHE_NAME = 'deliverymaster-admin-v2'; // Bumped version
const urlsToCache = [
  './',
  './index.html', // Cache the main admin page (index.html, not index2.html)
  './manifest.json', // Assuming manifest.json is in this dir
  'https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
  // Note: Caching external scripts like tailwind, leaflet, firebase is risky.
  // It's better to let the browser cache them or use the network.
];

// Install event: cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Opened cache and caching core assets:', urlsToCache);
        return cache.addAll(urlsToCache).catch(error => {
            console.error('[SW] Failed to cache core assets during install:', error);
        });
      })
      .then(() => self.skipWaiting()) // Activate new SW immediately
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => self.clients.claim()) // Take control of all open clients
  );
});

// Fetch event: Cache first, but ignore API/Auth calls
self.addEventListener('fetch', event => {
    // 1. Ignore non-GET requests (like POST to Firestore/Auth)
    if (event.request.method !== 'GET') {
        // console.log('[SW] Ignoring non-GET request:', event.request.method);
        return; // Let the network handle it
    }

    // 2. Ignore Firebase and Google API calls
    const urlStr = event.request.url;
    if (urlStr.includes('firestore.googleapis.com') ||
        urlStr.includes('firebaseapp.com') ||
        urlStr.includes('identitytoolkit.googleapis.com') ||
        urlStr.includes('googleapis.com') || // General Google APIs
        urlStr.includes('openstreetmap.org') // Map tiles
       ) {
       // console.log('[SW] Ignoring API/Map request:', urlStr);
        return; // Let the network handle it
    }

    // 3. For all other GET requests, use Cache-first strategy
    event.respondWith(
        caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              // console.log('[SW] Serving from cache:', event.request.url);
              return cachedResponse;
            }

            // Not in cache, fetch from network
            // console.log('[SW] Fetching from network:', event.request.url);
            return fetch(event.request).then(
              networkResponse => {
                // Optional: You could cache new static assets here if you want
                // But be careful not to cache dynamic HTML pages
                return networkResponse;
              }
            ).catch(error => {
                 console.error('[SW] Fetch failed:', error);
                 // You could return an offline fallback page here if you had one
            });
          })
      );
});
