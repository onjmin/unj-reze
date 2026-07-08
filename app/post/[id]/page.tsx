import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { db as mockDb } from '@/lib/mock-db';
import PostDetail from '@/components/PostDetail';
import Link from 'next/link';
import { decodeId, encodePost } from '@/lib/sqids';
import { attachGameInfo } from '@/lib/game-embed';

export function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_STATIC_EXPORT !== 'true') return [];
  return mockDb.getPosts().map(post => ({ id: encodePost(post).id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const decodedId = decodeId(id);
  if (decodedId === null) return {};
  const post = await db.getPost(decodedId);
  if (!post) return {};
  await attachGameInfo(post);

  const title = post.hasGame && post.gameTitle ? post.gameTitle : `${post.displayName}の投稿`;
  const description = post.content.slice(0, 100);
  const image = post.hasGame ? post.gameThumbnail : (post.hasImage ? post.imageSrc : undefined);

  return {
    title,
    description,
    openGraph: { title, description, type: 'article', ...(image ? { images: [image] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary' },
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
  const userId = '名無しvFZ';
  const post = await db.getPost(decodedId, userId);
  if (!post) {
    return (
      <div className="bg-[#0b0e14] text-gray-100 min-h-dvh flex flex-col items-center justify-center space-y-3">
        <p className="text-gray-500 text-sm">投稿が見つかりません</p>
        <Link href="/" className="text-blue-400 text-xs hover:underline">戻る</Link>
      </div>
    );
  }
  await attachGameInfo(post);

  return (
    <div className="bg-[#0b0e14] text-gray-100 min-h-dvh w-full flex flex-col">
      <div className="w-full max-w-2xl mx-auto border-x border-gray-800 flex-1 flex flex-col">
        <PostDetail post={encodePost(post)} />
      </div>
    </div>
  );
}
