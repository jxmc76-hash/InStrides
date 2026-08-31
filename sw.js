const CACHE = 'traininglog-v21';
const FBv = '10.7.1';

// Pre-cache everything the app needs to start offline
const SHELL = [
    '/',
    '/logo.png',
    '/favicon.ico',
    '/manifest.json',
    '/script.js?v=245',
    '/style.css?v=173',
    `https://www.gstatic.com/firebasejs/${FBv}/firebase-app.js`,
    `https://www.gstatic.com/firebasejs/${FBv}/firebase-firestore.js`,
    `https://www.gstatic.com/firebasejs/${FBv}/firebase-auth.js`,
    `https://www.gstatic.com/firebasejs/${FBv}/firebase-functions.js`,
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
];

const CACHEABLE_ORIGINS = new Set(['www.gstatic.com', 'cdn.jsdelivr.net']);

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    const isSameOrigin = url.hostname === location.hostname;
    const isCacheableCDN = CACHEABLE_ORIGINS.has(url.hostname);
    if (!isSameOrigin && !isCacheableCDN) return;

    // Navigation: network-first, fall back to cached shell
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request)
                .then(res => { caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; })
                .catch(() => caches.match(e.request).then(r => r || caches.match('/')))
        );
        return;
    }

    // Everything else (JS, CSS, CDN libs): network-first, cache on success, serve from cache offline
    e.respondWith(
        fetch(e.request)
            .then(res => {
                if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
                return res;
            })
            .catch(() => caches.match(e.request))
    );
});
