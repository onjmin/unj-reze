'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AppShell from '@/components/AppShell';
import LinksView from '@/components/LinksView';

export default function LinksPage() {
  return (
    <AppShell current="links">
      <div className="sticky top-0 z-10 bg-[#0b0e14]/95 backdrop-blur border-b border-gray-800">
        <div className="flex items-center px-3 h-11">
          <Link href="/" className="p-1.5 -ml-1.5 hover:bg-gray-100/10 rounded-full transition-colors">
            <ArrowLeft size={18} className="text-gray-300" />
          </Link>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <LinksView />
      </div>
    </AppShell>
  );
}
