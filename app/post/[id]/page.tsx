import { db } from '@/lib/db';
import { db as mockDb } from '@/lib/mock-db';
import PostDetail from '@/components/PostDetail';
import Link from 'next/link';
import { decodeId, encodePost } from '@/lib/sqids';

export function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_STATIC_EXPORT !== 'true') return [];
  return mockDb.getPosts().map(post => ({ id: encodePost(post).id }));
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decodedId = decodeId(id);
  if (decodedId === null) {
    return (
      <div className="bg-[#0b0e14] text-gray-100 min-h-screen flex flex-col items-center justify-center space-y-3">
        <p className="text-gray-500 text-sm">不正なIDです</p>
        <Link href="/" className="text-blue-400 text-xs hover:underline">戻る</Link>
      </div>
    );
  }
  const userId = '名無しvFZ';
  const post = await db.getPost(decodedId, userId);
  if (!post) {
    return (
      <div className="bg-[#0b0e14] text-gray-100 min-h-screen flex flex-col items-center justify-center space-y-3">
        <p className="text-gray-500 text-sm">投稿が見つかりません</p>
        <Link href="/" className="text-blue-400 text-xs hover:underline">戻る</Link>
      </div>
    );
  }

  return (
    <div className="bg-[#0b0e14] text-gray-100 min-h-screen w-full flex flex-col">
      <div className="w-full max-w-2xl mx-auto border-x border-gray-800 flex-1 flex flex-col">
        <PostDetail post={encodePost(post)} />
      </div>
    </div>
  );
}
