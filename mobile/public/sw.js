// VOIDtv service worker, JOB_19 v1. Exists to make the app INSTALLABLE, on purpose caches
// almost nothing: the stale-bundle ghosts that haunted this project came from a clinging SW,
// and this one is built to never become that. Offline caching is a later, deliberate slice.
const SW_VERSION = 'void-sw-2';

self.addEventListener('install', () => {
  // New worker takes over immediately; the page toast handles telling the user.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// NO fetch handler ON PURPOSE. Chrome dropped the "PWA needs a fetch handler to be
// installable" rule (~Chrome 89, 2021), so the old no-op `fetch` listener bought us nothing
// and cost us: a registered fetch handler makes the SW intercept EVERY request on the page,
// including the video element's byte-range requests, routing media streaming through the SW
// for zero benefit (Chrome's "No-op fetch handler may bring overhead" warning). With no
// handler at all, the SW stays installed/installable but is fully out of the network path,
// so media streams go straight to the browser's native fast path. Offline caching, when we
// build it, will add a handler back DELIBERATELY with real respondWith logic.

self.addEventListener('message', (event) => {
  if (event && event.data === 'SKIP_WAITING') self.skipWaiting();
});
