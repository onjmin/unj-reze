import { db } from '@/lib/mock-db';
import PostDetail from '@/components/PostDetail';
import Link from 'next/link';

export function generateStaticParams() {
  return db.getPosts().map(post => ({ id: post.id.toString() }));
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = db.getPost(parseInt(id));
  const allPosts = db.getPosts();

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
        <PostDetail post={post} allPosts={allPosts} />
      </div>
    </div>
  );
}
