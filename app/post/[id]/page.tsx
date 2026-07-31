import type { Metadata } from 'next';
import { cache } from 'react';
import { db } from '@/lib/db';
import { db as mockDb } from '@/lib/mock-db';
import PostDetail from '@/components/PostDetail';
import Link from 'next/link';
import { decodeId, encodeId, encodePost } from '@/lib/sqids';
import { attachEmbedInfo } from '@/lib/post-embeds';
import { getDisplayContent } from '@/lib/mml';
import { SITE_NAME, SITE_URL } from '@/lib/site';

const DEFAULT_USER_ID = '名無しvFZ';

// generateMetadata と page 本体で同じ投稿を二重フェッチしないよう、リクエスト単位でメモ化する
const getCachedPost = cache(async (decodedId: number) => {
  const post = await db.getPost(decodedId, DEFAULT_USER_ID);
  if (!post) return null;
  await attachEmbedInfo(post);
  return post;
});

export function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_STATIC_EXPORT !== 'true') return [];
  const params = mockDb.getPosts().map(post => ({ id: encodePost(post).id }));
  return params.length > 0 ? params : [{ id: encodeId(1) }];
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const decodedId = decodeId(id);
  if (decodedId === null) return {};
  const post = await getCachedPost(decodedId);
  if (!post) return {};

  const title = post.hasGame && post.gameTitle ? post.gameTitle : `${post.displayName}の投稿`;
  const description = getDisplayContent(post.content).slice(0, 100) || `${post.displayName}による投稿です。`;
  const image = post.hasGame ? post.gameThumbnail : (post.hasImage ? post.imageSrc : undefined);
  const url = `${SITE_URL}/post/${id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: 'article',
      locale: 'ja_JP',
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decodedId = decodeId(id);
  if (decodedId === null) {
    return (
      <div className="bg-[#0b0e14] text-gray-100 min-h-dvh flex flex-col items-center justify-center space-y-3">
        <p className="text-gray-500 text-sm">不正なIDです</p>
        <Link href="/" className="text-blue-400 text-xs hover:underline">戻る</Link>
      </div>
    );
  }
  const post = await getCachedPost(decodedId);
  if (!post) {
    return (
      <div className="bg-[#0b0e14] text-gray-100 min-h-dvh flex flex-col items-center justify-center space-y-3">
        <p className="text-gray-500 text-sm">投稿が見つかりません</p>
        <Link href="/" className="text-blue-400 text-xs hover:underline">戻る</Link>
      </div>
    );
  }

  const encoded = encodePost(post);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: post.hasGame && post.gameTitle ? post.gameTitle : `${post.displayName}の投稿`,
    text: getDisplayContent(post.content),
    url: `${SITE_URL}/post/${id}`,
    datePublished: post.createdAt,
    dateModified: post.createdAt,
    author: { '@type': 'Person', name: post.displayName },
    ...(post.hasImage && post.imageSrc ? { image: post.imageSrc } : {}),
    interactionStatistic: [
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: post.likes },
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/ReplyAction', userInteractionCount: post.repliesCount },
    ],
  };

  return (
    <div className="bg-[#0b0e14] text-gray-100 min-h-dvh w-full flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="w-full max-w-2xl mx-auto border-x border-gray-800 flex-1 flex flex-col">
        <PostDetail post={encoded} />
      </div>
    </div>
  );
}
