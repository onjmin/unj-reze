import type { MetadataRoute } from 'next';
import { SITE_NAME, SITE_DESCRIPTION, BASE_PATH, assetPath } from '@/lib/site';

// マニフェストはビルド時に固定できる（静的エクスポートでも同じものが出る）
export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: 'ja',
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0e14',
    theme_color: '#0b0e14',
    categories: ['social', 'games', 'entertainment'],
    icons: [
      { src: assetPath('/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: assetPath('/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: assetPath('/icon-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'ゲーム', short_name: 'ゲーム', url: `${BASE_PATH}/?tab=game` },
      { name: '通知', short_name: '通知', url: `${BASE_PATH}/notifications` },
    ],
  };
}
