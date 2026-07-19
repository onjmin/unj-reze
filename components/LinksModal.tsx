'use client';

import { X, ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { externalLinkGroups } from '@/lib/externalLinks';

interface LinksModalProps {
  onClose: () => void;
}

export default function LinksModal({ onClose }: LinksModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto px-3 pt-16 pb-8" onClick={(e) => e.stopPropagation()}>
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full md:max-w-lg bg-[#0b0e14] rounded-xl border border-gray-800 shadow-2xl p-4 flex flex-col space-y-4 animate-fade-in-up">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-gray-200">リンク集</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-gray-100/10 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-5 max-h-[70vh] overflow-y-auto pr-1 scrollbar-none">
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
      </div>
    </div>
  );
}
