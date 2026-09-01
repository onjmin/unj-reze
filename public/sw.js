// 【原理的なデッドロック防止のためのクリーンアップ Service Worker】
// キャッシュを持たない素通しSWであっても、fetch リスナーが存在すると Chromium 等で
// SW プロセス待ちによる通信フリーズ（Network タブに何も出ず無限保留）を誘発する。
// 現代のブラウザは Web App Manifest のみで PWA インストールが可能なため、
// 本アプリに Service Worker は不要。既存ブラウザの登録を自己消滅させる。

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (self.caches) {
        const keys = await self.caches.keys();
        await Promise.all(keys.map((k) => self.caches.delete(k)));
      }
      await self.registration.unregister();
    })()
  );
});

