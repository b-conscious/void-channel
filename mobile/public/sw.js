// VOIDtv service worker, JOB_19 v1. Exists to make the app INSTALLABLE, on purpose caches
// almost nothing: the stale-bundle ghosts that haunted this project came from a clinging SW,
// and this one is built to never become that. Offline caching is a later, deliberate slice.
const SW_VERSION = 'void-sw-1';

self.addEventListener('install', () => {
  // New worker takes over immediately; the page toast handles telling the user.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Network passthrough. A fetch handler must exist for installability; it must not hoard.
self.addEventListener('fetch', () => {});

self.addEventListener('message', (event) => {
  if (event && event.data === 'SKIP_WAITING') self.skipWaiting();
});
