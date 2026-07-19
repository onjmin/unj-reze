'use client';

import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { externalLinkGroups } from '@/lib/externalLinks';

export default function LinksList() {
  return (
    <div className="flex flex-col gap-5 p-4">
      {externalLinkGroups.map(group => (
        <div key={group.title}>
          <h3 className="text-xs font-bold text-gray-500 mb-2 px-1">{group.title}</h3>
          <div className="flex flex-col divide-y divide-gray-800/70 border border-gray-800 rounded-lg overflow-hidden">
            {group.links.map(link => (
              <a
                key={link.src}
                href={link.src}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start justify-between gap-2 px-3 py-2.5 hover:bg-gray-100/10 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-gray-200 truncate">{link.name}</span>
                  <span className="block text-[11px] text-gray-500 truncate">{link.description}</span>
                </span>
                <ExternalLinkIcon size={14} className="text-gray-600 shrink-0 mt-1" />
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
