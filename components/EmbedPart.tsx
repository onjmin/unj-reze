'use client';

import { useState, useRef, useEffect } from 'react';
import { ExternalLink, X, Play, Music, Gamepad2, Loader2 } from 'lucide-react';
import { EmbeddedMedia } from '@/lib/embed';
import { useAudioFocus } from '@/lib/audio-focus-context';

const ytRegex = /\/embed\/([a-zA-Z0-9_-]{11})/;
const getYtThumb = (url: string) => {
  const m = url.match(ytRegex);
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null;
};

interface EmbedPartProps {
  embed: EmbeddedMedia | null;
}

const uid = () => `e${Math.random().toString(36).slice(2, 9)}`;

export default function EmbedPart({ embed }: EmbedPartProps) {
  const { requestFocus, releaseFocus } = useAudioFocus();
  const [closed, setClosed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(uid());
  const focusRegistered = useRef(false);

  useEffect(() => {
    if (embed?.type !== 'video_file' || !playing || !videoRef.current) return;
    const v = videoRef.current;
    const onPlay = () => { requestFocus(idRef.current, () => { v.pause(); setPlaying(false); }); focusRegistered.current = true; };
    const onPause = () => { if (focusRegistered.current) { releaseFocus(idRef.current); focusRegistered.current = false; } };
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onPause);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onPause);
      releaseFocus(idRef.current);
    };
  }, [embed, playing, requestFocus, releaseFocus]);

  useEffect(() => {
    return () => {
      if (iframeRef.current) {
        iframeRef.current.remove();
        iframeRef.current = null;
      }
      releaseFocus(idRef.current);
    };
  }, [releaseFocus]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting && playing) {
        if (embed?.type === 'video_file') {
          const v = videoRef.current;
          if (v) { v.pause(); v.src = ''; v.load(); }
        } else if (iframeRef.current) {
          iframeRef.current.remove();
          iframeRef.current = null;
        }
        setPlaying(false);
        releaseFocus(idRef.current);
      }
    }, { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [playing, embed?.type, releaseFocus]);

  if (!embed || closed) return null;

  const isYt = !!getYtThumb(embed.embedUrl);
  const thumbUrl = getYtThumb(embed.embedUrl);

  const createIframe = (): HTMLIFrameElement => {
    const iframe = document.createElement('iframe');
    iframe.title = 'embed';
    const allowValue = embed.type === 'audio'
      ? 'autoplay'
      : 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allow = allowValue;
    if (embed.type !== 'audio') iframe.allowFullscreen = true;
    iframe.sandbox = 'allow-forms allow-modals allow-popups allow-scripts allow-same-origin allow-presentation';
    iframe.onload = () => setReady(true);
    iframe.className = 'w-full h-full rounded-b-xl';
    iframe.style.border = 'none';
    if (isYt) {
      iframe.src = `${embed.embedUrl}?autoplay=1`;
    } else {
      iframe.src = embed.embedUrl;
    }
    return iframe;
  };

  const handleLoad = (e: React.MouseEvent) => {
    e.stopPropagation();
    setReady(false);
    setPlaying(true);

    if (embed.type !== 'video_file') {
      requestFocus(idRef.current, () => {
        if (iframeRef.current) {
          iframeRef.current.remove();
          iframeRef.current = null;
        }
        setPlaying(false);
      });
    }

    if (embed.type === 'video_file' && videoRef.current) {
      videoRef.current.src = embed.embedUrl;
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    } else if (embed.type !== 'video_file') {
      const iframe = createIframe();
      containerRef.current?.appendChild(iframe);
      iframeRef.current = iframe;
    }
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-[#0f121a] mb-2.5 overflow-hidden">
      <div className="flex items-center px-3 py-1.5 border-b border-gray-800/50">
        <span className="text-[10px] text-gray-500 font-medium">{embed.siteName}</span>
        <div className="ml-auto flex items-center space-x-1">
          <a href={embed.rawUrl} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-gray-100/10 transition-colors">
            <ExternalLink size={12} className="text-gray-500" />
          </a>
          <button onClick={() => setClosed(true)} className="p-1 rounded hover:bg-gray-100/10 transition-colors">
            <X size={12} className="text-gray-500" />
          </button>
        </div>
      </div>

      {embed.type === 'image' && (
        <img src={embed.embedUrl} alt="embed" className="w-full h-auto object-contain max-h-[400px]" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      )}

      {(embed.type === 'video' || embed.type === 'audio' || embed.type === 'video_file' || embed.type === 'game') && (
        <div
          ref={containerRef}
          className={embed.type === 'audio' ? 'h-[166px] relative' : 'aspect-video relative'}
          style={{ contain: 'layout paint style', contentVisibility: 'auto' }}
        >
          {/* Placeholder (top layer) */}
          {!playing && (
            <div className="absolute inset-0 z-20 bg-gray-900 rounded-b-xl cursor-pointer group" onClick={handleLoad}>
              {embed.type === 'video' && isYt && (
                <>
                  <img src={thumbUrl!} alt="" className="w-full h-full object-cover rounded-b-xl" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
                    <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      <Play size={28} className="text-white ml-1" />
                    </div>
                  </div>
                </>
              )}
              {(embed.type === 'video' && !isYt) || embed.type === 'video_file' ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Play size={28} className="text-white ml-1" />
                  </div>
                </div>
              ) : embed.type === 'audio' ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-green-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Music size={24} className="text-white" />
                  </div>
                </div>
              ) : embed.type === 'game' ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-purple-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Gamepad2 size={24} className="text-white" />
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Loading indicator */}
          {playing && !ready && (
            <div className="absolute inset-0 z-10 bg-gray-900 rounded-b-xl flex items-center justify-center">
              <Loader2 size={32} className="text-gray-500 animate-spin" />
            </div>
          )}

          {/* Media element (video_file only — iframes are created imperatively) */}
          {embed.type === 'video_file' && (
            <video
              ref={videoRef}
              controls
              playsInline
              preload="none"
              onCanPlay={() => setReady(true)}
              className="w-full h-full rounded-b-xl"
            />
          )}
        </div>
      )}
    </div>
  );
}
