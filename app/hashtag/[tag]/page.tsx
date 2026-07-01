import { db as mockDb } from '@/lib/mock-db';
import HashtagView from '@/components/HashtagView';

export function generateStaticParams() {
  const tags = new Set<string>();
  for (const p of mockDb.getPosts()) {
    const matches = p.content.match(/#[^\s#]+/g);
    if (matches) for (const m of matches) tags.add(m.slice(1));
  }
  return Array.from(tags).map(tag => ({ tag }));
}

export default async function HashtagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  return <HashtagView tag={decodeURIComponent(tag)} />;
}
