'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import SearchView from '@/components/SearchView';

function SearchPageContent() {
  const currentUser = useCurrentUser();
  const searchParams = useSearchParams();
  const router = useRouter();

  return (
    <SearchView
      userId={currentUser?.displayName}
      currentUserSlug={currentUser?.slug}
      currentUserDisplayName={currentUser?.displayName}
      initialQuery={searchParams.get('q') || undefined}
      onQuickPost={(text) => router.push(`/?mention=${encodeURIComponent((text || '').replace(/^@/, ''))}`)}
      openGame={() => {}}
      openCollab={() => {}}
      openMml={() => {}}
    />
  );
}

export default function SearchPage() {
  return (
    <div className="bg-[#0b0e14] text-gray-100 min-h-dvh w-full flex flex-col">
      <div className="w-full max-w-2xl mx-auto border-x border-gray-800 flex-1 flex flex-col">
        <div className="sticky top-0 z-10 bg-[#0b0e14]/95 backdrop-blur border-b border-gray-800">
          <div className="flex items-center px-3 h-11">
            <Link href="/" className="p-1.5 -ml-1.5 hover:bg-gray-100/10 rounded-full transition-colors">
              <ArrowLeft size={18} className="text-gray-300" />
            </Link>
          </div>
        </div>
        <Suspense fallback={null}>
          <SearchPageContent />
        </Suspense>
      </div>
    </div>
  );
}
