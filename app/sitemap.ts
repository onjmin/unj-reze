import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { db as mockDb } from '@/lib/mock-db';
import { encodePost } from '@/lib/sqids';
import { SITE_URL } from '@/lib/site';

// SSRモードでは投稿一覧が頻繁に変わるため、ビルド時にDBへ接続してプリレンダリングせず
// リクエスト時に生成する（output: "export" 時は Next.js が自動的に静的化するため無害）
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const isStaticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true';
  const posts = isStaticExport ? mockDb.getPosts() : await db.getPosts();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'always', priority: 1 },
  ];

  const postEntries: MetadataRoute.Sitemap = posts.map(post => ({
    url: `${SITE_URL}/post/${encodePost(post).id}`,
    lastModified: post.createdAt,
    changeFrequency: 'hourly',
    priority: 0.7,
  }));

  return [...staticEntries, ...postEntries];
}
