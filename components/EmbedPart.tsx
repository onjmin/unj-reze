'use client';

import { useState, useEffect, useRef, useCallback, useId } from 'react';
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
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const embedRef = useRef<HTMLDivElement>(null);

  const handleExternalStop = useCallback(() => {
    setStopped(true);
  }, []);

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth * 0.7;
      const h = window.innerHeight * 0.7;
      let w2: number, h2: number;
      if (w < h) {
        w2 = w;
        h2 = w2 * (9 / 16);
      } else {
        h2 = h * 0.6;
        w2 = h2 * (16 / 9);
      }
      setWidth(w2 | 0);
      setHeight(h2 | 0);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!embed || embed.type === 'image') return;
    const el = embedRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        requestFocus(id, handleExternalStop);
        setStopped(false);
      } else {
        setStopped(true);
        releaseFocus(id);
      }
    }, { threshold: 0.1 });

    observer.observe(el);
    return () => {
      observer.disconnect();
      releaseFocus(id);
    };
  }, [embed, id, requestFocus, releaseFocus, handleExternalStop]);

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
        <div className="flex justify-center">
          <iframe
            title="embed"
            src={stopped ? 'about:blank' : embed.embedUrl}
            width={width}
            height={height}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="rounded-b-xl"
            style={{ border: 'none' }}
          />
        </div>
      )}

      {embed.type === 'audio' && (
        <div className="flex justify-center p-2">
          <iframe
            title="embed"
            src={stopped ? 'about:blank' : embed.embedUrl}
            width={width}
            height={height || 166}
            allow="autoplay"
            className="rounded-b-xl"
            style={{ border: 'none' }}
          />
        </div>
      )}

      {embed.type === 'game' && (
        <div className="flex justify-center">
          <iframe
            title="embed"
            src={stopped ? 'about:blank' : embed.embedUrl}
            width={width}
            height={height}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            className="rounded-b-xl"
            style={{ border: 'none' }}
          />
        </div>
      )}
    </div>
  );
}
