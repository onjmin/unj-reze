import type { Metadata } from 'next';
import { db as mockDb } from '@/lib/mock-db';
import AppShell from '@/components/AppShell';
import DmThreadView from '@/components/DmThreadView';
import { SITE_URL } from '@/lib/site';

export function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_STATIC_EXPORT !== 'true') return [];
  const slugs = new Set(mockDb.getPosts().map(p => p.slug));
  const params = Array.from(slugs).filter(Boolean).map(slug => ({ id: slug! }));
  return params.length > 0 ? params : [{ id: 'demo' }];
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const rawParams = await params;
  const id = decodeURIComponent(rawParams.id || '');
  return {
    title: 'メッセージ',
    // DMは当人同士のものなので検索結果には出さない。
    robots: { index: false, follow: false },
    alternates: { canonical: `${SITE_URL}/messages/${encodeURIComponent(id)}` },
  };
}

export default async function DmThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const rawParams = await params;
  const id = decodeURIComponent(rawParams.id || '');

  return (
    <AppShell current="messages">
      <DmThreadView partnerSlug={id} />
    </AppShell>
  );
}
