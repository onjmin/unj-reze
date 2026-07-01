import { db } from '@/lib/db';
import { db as mockDb } from '@/lib/mock-db';
import ProfileView from '@/components/ProfileView';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_STATIC_EXPORT !== 'true') return [];
  const slugs = new Set(mockDb.getPosts().map(p => p.slug));
  return Array.from(slugs).map(slug => ({ id: slug! }));
}

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userPosts = await db.getUserPostsBySlug(id);
  const displayName = await db.getUserDisplayName(id);

  if (userPosts.length === 0) {
    return (
      <div className="bg-[#0b0e14] text-gray-100 min-h-screen flex flex-col items-center justify-center space-y-3">
        <p className="text-gray-500 text-sm">ユーザーが見つかりません</p>
        <Link href="/" className="text-blue-400 text-xs hover:underline">戻る</Link>
      </div>
    );
  }

  return (
    <div className="bg-[#0b0e14] text-gray-100 min-h-screen w-full flex flex-col">
      <div className="w-full max-w-2xl mx-auto border-x border-gray-800 flex-1 flex flex-col">
        <div className="sticky top-0 z-10 bg-[#0b0e14]/95 backdrop-blur border-b border-gray-800">
          <div className="flex items-center px-3 h-11">
            <Link href="/" className="p-1.5 -ml-1.5 hover:bg-gray-100/10 rounded-full transition-colors">
              <ArrowLeft size={18} className="text-gray-300" />
            </Link>
            <span className="ml-3 font-bold text-sm text-gray-200">プロフィール</span>
          </div>
        </div>
        <ProfileView userId={id} displayName={displayName} />
      </div>
    </div>
  );
}
