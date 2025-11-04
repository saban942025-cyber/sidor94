// service-worker.js

// [1] --- הגדרות גרסה ו-Cache ---
const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `zebulun-portal-cache-${CACHE_VERSION}`;
// רשימת הקבצים הנדרשים לפעולת האפליקציה הבסיסית
const APP_SHELL_FILES = [
  '/Zebulun-Portal/index.html'
  // ניתן להוסיף כאן נכסים סטטיים נוספים אם יהיו, כגון קובץ CSS ייעודי או אייקונים
];

// [2] --- התקנה (Install) ---
// שלב זה קורה כשהדפדפן מזהה Service Worker חדש
self.addEventListener('install', (event) => {
  console.log('[SW] ⚡️ Install event!', CACHE_NAME);
  // אנו אומרים לדפדפן להמתין עד שה-Cache יתעדכן
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell...');
        return cache.addAll(APP_SHELL_FILES);
      })
      .then(() => {
        // הפעלה מיידית של ה-SW החדש
        return self.skipWaiting();
      })
  );
});

// [3] --- הפעלה (Activate) ---
// שלב זה קורה אחרי ההתקנה, כשה-SW החדש לוקח שליטה
self.addEventListener('activate', (event) => {
  console.log('[SW] ⚡️ Activate event!', CACHE_NAME);
  // ניקוי גרסאות Cache ישנות
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('zebulun-portal-cache-') && name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // שליטה מיידית על כל הדפים הפתוחים
      return self.clients.claim();
    }).then(() => {
      // [דרישה 4] שליחת הודעה לדף שהאפליקציה עודכנה
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'APP_UPDATED', version: CACHE_VERSION }));
      });
    })
  );
});

// [4] --- יירוט בקשות (Fetch) ---
// זה הלב של תמיכת ה-Offline
self.addEventListener('fetch', (event) => {
  // אנו רוצים להגיב רק לבקשות GET (לא POST ל-Firestore וכו')
  if (event.request.method !== 'GET') {
    return;
  }

  // אסטרטגיה: Cache-First (נסה קודם מה-Cache)
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // [א] נמצא ב-Cache
        if (cachedResponse) {
          // console.log('[SW] Serving from Cache:', event.request.url);
          return cachedResponse;
        }

        // [ב] לא נמצא ב-Cache - גש לרשת
        // console.log('[SW] Serving from Network:', event.request.url);
        return fetch(event.request)
          .then((networkResponse) => {
            // אם הבקשה הצליחה, נשמור עותק ב-Cache לפעם הבאה
            // (אנחנו בודקים רק אם הבקשה היא מהמקור שלנו, לא ל-Firebase וכו')
            if (networkResponse.ok && event.request.url.includes('/Zebulun-Portal/')) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
          })
          .catch((error) => {
            // אם גם הרשת וגם ה-Cache נכשלו (מצב Offline אמיתי)
            console.warn('[SW] Fetch failed, network and cache unavailable.', error);
            // כאן אפשר להחזיר דף Offline ייעודי אם רוצים
            // return caches.match('/offline.html');
          });
      })
  );
});

// האזנה להודעות מהדף (למשל, לבדיקת גרסה)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.source.postMessage({ type: 'SW_VERSION', version: CACHE_VERSION });
  }
});
