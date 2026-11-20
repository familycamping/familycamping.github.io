// 露營手帳：讓網頁在沒有網路的營地也能打開，有新版本時自動更新
const CACHE = 'camp-notebook-v7';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

// 安裝新版：直接向 GitHub 拿最新檔案（不用瀏覽器暫存），裝好立刻接手
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

// 新版接手後：刪掉舊版暫存，並把已經打開的露營手帳自動重新整理成新版
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const old = keys.filter(k => k !== CACHE);
    await Promise.all(old.map(k => caches.delete(k)));
    await self.clients.claim();
    if (old.length) {
      const wins = await self.clients.matchAll({ type: 'window' });
      wins.forEach(w => { try { w.navigate(w.url); } catch (err) {} });
    }
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;
  const url = new URL(req.url);
  // 只處理露營手帳自己的檔案；照片、天氣、字型、同步這些外部網址交給瀏覽器自己處理
  if (url.origin !== self.location.origin) return;

  // 打開 App 時：有網路就拿最新版的頁面，沒網路（或訊號太差超過 4 秒）就用手機裡存的版本
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const cached = await c.match('./index.html');
      try {
        const res = await Promise.race([
          fetch(req, { cache: 'no-cache' }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
        ]);
        if (res && res.ok) { c.put('./index.html', res.clone()); return res; }
        return cached || res;
      } catch (err) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // 其他檔案（圖示、啟動畫面）：先用存好的，背景再更新
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => {
      if (res && res.ok) c.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
