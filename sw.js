const CACHE_NAME = 'horaire-carrefour-v16';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './logoCarrefour.png',
  './icon-192.png',
  './icon-512.png',
  './styles-auth.css'
];

// Installation : on met en cache les fichiers de base de l'app
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activation : on supprime les vieux caches si la version change
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Stratégie "network-first" : on essaie toujours le réseau d'abord
// (pour que le planning soit à jour), et on retombe sur le cache si hors ligne.
self.addEventListener('fetch', event => {
  // On ne touche pas aux requêtes vers Supabase (API + temps réel)
  if (event.request.url.includes('supabase.co')) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Réception d'une notification push envoyée par le serveur
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data?.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Horaire Carrefour', {
      body: data.body || '',
      icon: './icon-192.png',
      badge: './icon-192.png',
      vibrate: [200, 100, 200]
    })
  );
});

// Clic sur la notification : on ouvre l'app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('./'));
});
