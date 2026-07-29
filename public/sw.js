// インストール可能な PWA として認識してもらうための最小 Service Worker。
// キャッシュは一切持たない（素通し）。ゲームやフィードは常に最新であるべきで、
// 中途半端なキャッシュは「更新したのに古い画面が出る」事故に直結するため。
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 過去に別実装のSWがキャッシュを残していた場合に備えて掃除しておく
  event.waitUntil(
    (async () => {
      if (self.caches) {
        const keys = await self.caches.keys();
        await Promise.all(keys.map((k) => self.caches.delete(k)));
      }
      await self.clients.claim();
    })()
  );
});

// fetch ハンドラの存在自体がインストール要件なので、素通しで登録しておく
self.addEventListener('fetch', () => {});
