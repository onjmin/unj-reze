'use client';

import { Link2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import LinksList from '@/components/LinksList';

export default function LinksPage() {
  return (
    <div className="bg-[#0b0e14] text-gray-100 min-h-dvh w-full flex flex-col">
      <div className="w-full max-w-2xl mx-auto border-x border-gray-800 flex-1 flex flex-col">
        <PageHeader title="リンク集" icon={<Link2 size={15} className="text-blue-400" />} />
        <div className="flex-1 overflow-y-auto">
          <LinksList />
        </div>
      </div>
    </div>
  );
}
