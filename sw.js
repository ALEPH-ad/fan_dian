/* 铁线饭点 Service Worker：接收服务器推送、显示通知 */
const CACHE = 'tie-xian-v3';
const ASSETS = ['./', './index.html', './app.js', './wire.js', './manifest.json', './icon-192.png', './badge-72.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(ASSETS.map(a => c.add(new Request(a, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // 不缓存 GitHub API
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req);
      return hit || (await caches.match('./index.html')) || Response.error();
    }
  })());
});

/* ---------- 收到推送 ---------- */
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: '饭点提醒', body: e.data ? e.data.text() : '' }; }
  const title = data.title || '🍚 到饭点啦';
  const body = data.body || '该吃饭了，别碰膨化、别吃太涨肚。';
  const options = {
    body,
    tag: data.tag || 'fan-dian',
    renotify: true,
    requireInteraction: true,      // 别让它自己悄悄消失
    icon: './icon-192.png',
    badge: './badge-72.png',
    vibrate: [180, 80, 180, 80, 360, 120, 420],
    timestamp: data.ts || Date.now(),
    lang: 'zh-CN',
    data: { url: data.url || './', meal: data.meal || '', ts: data.ts || Date.now() },
    actions: [
      { action: 'open', title: '看提醒' },
      { action: 'ok', title: '我要去吃了' }
    ]
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

/* ---------- 点通知 ---------- */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};
  const target = data.url || './';
  if (e.action === 'ok') {
    // 记一笔「我吃过啦」，下次打开页面能看到
    e.waitUntil((async () => {
      try {
        const cache = await caches.open('tie-xian-state');
        await cache.put(new Request('/__fd_ack'), new Response(JSON.stringify({ ts: Date.now(), meal: data.meal })));
      } catch {}
    })());
    return;
  }
  e.waitUntil((async () => {
    try {
      const cache = await caches.open('tie-xian-state');
      await cache.put(new Request('/__fd_seen'), new Response(JSON.stringify({ ts: Date.now(), meal: data.meal, action: e.action || 'open' })));
    } catch {}
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const hit = wins.find(w => w.url.startsWith(self.registration.scope));
    if (hit) { await hit.focus(); return; }
    await self.clients.openWindow(target);
  })());
});
