import type { Metadata } from 'next';
import { db as mockDb } from '@/lib/mock-db';
import HashtagView from '@/components/HashtagView';
import { SITE_URL } from '@/lib/site';

export function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_STATIC_EXPORT !== 'true') return [];
  const tags = new Set<string>();
  for (const p of mockDb.getPosts()) {
    const matches = p.content.match(/#[^\s#]+/g);
    if (matches) for (const m of matches) tags.add(m.slice(1));
  }
  return Array.from(tags).map(tag => ({ tag }));
}

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag } = await params;
  const decodedTag = decodeURIComponent(tag);
  const title = `#${decodedTag}`;
  const description = `#${decodedTag} のハッシュタグが付いた投稿一覧`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/hashtag/${tag}` },
    openGraph: { title, description, url: `${SITE_URL}/hashtag/${tag}` },
  };
}

export default async function HashtagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  return <HashtagView tag={decodeURIComponent(tag)} />;
}
