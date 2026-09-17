// PUNCH FACE 서비스 워커: 한 번 열면 오프라인에서도 실행. 새 버전은 백그라운드로 갱신.
const VERSION = 'pf-v8';
const CORE = ['./','./index.html','./css/style.css','./manifest.webmanifest',
  './js/data.js','./js/sprites.js','./js/audio.js','./js/fighter.js','./js/combat.js','./js/ai.js','./js/career.js','./js/net.js','./js/draw.js','./js/game.js',
  './assets/crowd.jpg','./assets/qr.png','./assets/icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // PeerJS 등 외부 요청은 건드리지 않음
  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(e.request);
    const fetching = fetch(e.request).then(res => { if (res && res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => cached);
    return cached || fetching;   // 캐시 우선, 백그라운드 갱신 (stale-while-revalidate)
  }));
});
