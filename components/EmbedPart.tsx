'use client';

import { useState, useEffect, useRef, useId } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { EmbeddedMedia } from '@/lib/embed';
import { useAudioFocus } from '@/lib/audio-focus-context';

interface EmbedPartProps {
  embed: EmbeddedMedia | null;
}

export default function EmbedPart({ embed }: EmbedPartProps) {
  const id = useId();
  const { requestFocus, releaseFocus } = useAudioFocus();
  const [closed, setClosed] = useState(false);
  const [stopped, setStopped] = useState(() => embed && embed.type !== 'image');
  const embedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!embed || embed.type === 'image') return;
    const el = embedRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        requestFocus(id, () => {});
        setStopped(false);
      } else {
        setStopped(true);
        releaseFocus(id);
      }
    }, { rootMargin: '1500px 0px 200px 0px' });

    observer.observe(el);
    return () => {
      observer.disconnect();
      releaseFocus(id);
    };
  }, [embed, id, requestFocus, releaseFocus]);

  if (!embed || closed) return null;

  return (
    <div ref={embedRef} className="rounded-xl border border-gray-800 bg-[#0f121a] mb-2.5 overflow-hidden">
      <div className="flex items-center px-3 py-1.5 border-b border-gray-800/50">
        <span className="text-[10px] text-gray-500 font-medium">{embed.siteName}</span>
        <div className="ml-auto flex items-center space-x-1">
          <a
            href={embed.rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded hover:bg-gray-100/10 transition-colors"
          >
            <ExternalLink size={12} className="text-gray-500" />
          </a>
          <button
            onClick={() => setClosed(true)}
            className="p-1 rounded hover:bg-gray-100/10 transition-colors"
          >
            <X size={12} className="text-gray-500" />
          </button>
        </div>
      </div>

      {embed.type === 'image' && (
        <img
          src={embed.embedUrl}
          alt="embed"
          className="w-full h-auto object-contain max-h-[400px]"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}

      {embed.type === 'video' && (
        <div className="aspect-video">
          {stopped ? (
            <div className="w-full h-full bg-gray-900 rounded-b-xl" />
          ) : (
            <iframe
              title="embed"
              src={embed.embedUrl}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="w-full h-full rounded-b-xl"
              style={{ border: 'none' }}
            />
          )}
        </div>
      )}

      {embed.type === 'audio' && (
        <div className="h-[166px]">
          {stopped ? (
            <div className="w-full h-full bg-gray-900 rounded-b-xl" />
          ) : (
            <iframe
              title="embed"
              src={embed.embedUrl}
              allow="autoplay"
              className="w-full h-full rounded-b-xl"
              style={{ border: 'none' }}
            />
          )}
        </div>
      )}

      {embed.type === 'video_file' && (
        <div className="aspect-video">
          {stopped ? (
            <div className="w-full h-full bg-gray-900 rounded-b-xl" />
          ) : (
            <video
              src={embed.embedUrl}
              controls
              playsInline
              className="w-full h-full rounded-b-xl"
            />
          )}
        </div>
      )}

      {embed.type === 'game' && (
        <div className="aspect-video">
          {stopped ? (
            <div className="w-full h-full bg-gray-900 rounded-b-xl" />
          ) : (
            <iframe
              title="embed"
              src={embed.embedUrl}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              className="w-full h-full rounded-b-xl"
              style={{ border: 'none' }}
            />
          )}
        </div>
      )}
    </div>
  );
}
