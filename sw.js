/* 铁线饭点 Service Worker：接收服务器推送、显示通知、离线缓存 */
const CACHE = 'tie-xian-v5';
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
  const late = /饭点过了|还没吃|过了一阵/.test(title) || !!data.late;

  // 关掉「只靠系统通知」的死路：通知一定要弹，且尽量常驻
  const options = {
    body,
    tag: data.tag || 'fan-dian',
    renotify: true,
    requireInteraction: true,      // 别让它自己悄悄消失，要用户处理
    silent: false,
    icon: './icon-192.png',
    badge: './badge-72.png',
    vibrate: [200, 90, 200, 90, 360, 140, 440],
    timestamp: data.ts || Date.now(),
    lang: 'zh-CN',
    data: { url: data.url || './', meal: data.meal || '', late, ts: data.ts || Date.now() },
    actions: [
      { action: 'open', title: '看提醒' },
      { action: 'ok', title: '我要去吃了' }
    ]
  };

  // 页面当前可见时：交给页面弹「小闹钟」窗口；不可见或没有页面：发系统通知
  const showWindow = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const visible = clients.filter(c => c.visibilityState === 'visible');
    if (visible.length) {
      visible.forEach(c => c.postMessage({
        type: 'meal-alert', meal: data.meal || 'lunch', title, body, late
      }));
      return true;
    }
    return false;
  });

  e.waitUntil(showWindow.then(visible => {
    if (visible) return undefined;
    return self.registration.showNotification(title, options);
  }).catch(() => self.registration.showNotification(title, options)));
});

/* ---------- 点通知 ---------- */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};

  // 「我要去吃了」：只记下来，不打开页面
  if (e.action === 'ok') {
    e.waitUntil((async () => {
      try {
        const cache = await caches.open('tie-xian-state');
        await cache.put(new Request('/__fd_ack'), new Response(JSON.stringify({ ts: Date.now(), meal: data.meal })));
      } catch {}
      // 给所有开着的页面发个消息，让页面记一笔
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      wins.forEach(w => w.postMessage({ type: 'meal-done', meal: data.meal }));
    })());
    return;
  }

  // 普通点击 / 「看提醒」：打开或聚焦页面
  e.waitUntil((async () => {
    try {
      const cache = await caches.open('tie-xian-state');
      await cache.put(new Request('/__fd_seen'), new Response(JSON.stringify({ ts: Date.now(), meal: data.meal, action: e.action || 'open' })));
    } catch {}
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const hit = wins.find(w => w.url.startsWith(self.registration.scope));
    if (hit) { await hit.focus(); return; }
    await self.clients.openWindow(data.url || './');
  })());
});
