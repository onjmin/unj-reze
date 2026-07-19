'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  icon?: ReactNode;
  backHref?: string;
  rightSlot?: ReactNode;
}

export default function PageHeader({ title, icon, backHref = '/', rightSlot }: PageHeaderProps) {
  return (
    <div className="sticky top-0 z-10 bg-[#0b0e14]/95 backdrop-blur border-b border-gray-800">
      <div className="flex items-center px-3 h-11">
        <Link href={backHref} className="p-1.5 -ml-1.5 hover:bg-gray-100/10 rounded-full transition-colors">
          <ArrowLeft size={18} className="text-gray-300" />
        </Link>
        <span className="ml-3 font-bold text-sm text-gray-200 flex items-center gap-1.5">
          {icon}
          {title}
        </span>
        {rightSlot && <div className="ml-auto">{rightSlot}</div>}
      </div>
    </div>
  );
}
