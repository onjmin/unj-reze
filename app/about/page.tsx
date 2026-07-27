'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AppShell from '@/components/AppShell';
import AboutView from '@/components/AboutView';

export default function AboutPage() {
  return (
    <AppShell current="settings">
      <div className="sticky top-0 z-10 bg-[#0b0e14] border-b border-gray-800">
        <div className="flex items-center px-3 h-11">
          <Link href="/" className="p-1.5 -ml-1.5 hover:bg-gray-100/10 rounded-full transition-colors">
            <ArrowLeft size={18} className="text-gray-300" />
          </Link>
          <span className="font-bold text-sm text-gray-200 ml-2">サイトについて</span>
        </div>
      </div>
      <div className="flex-1">
        <AboutView />
      </div>
    </AppShell>
  );
}