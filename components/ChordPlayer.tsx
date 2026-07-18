'use client';

import { useEffect, useRef, useId, useState } from 'react';
import { useAudioFocus } from '@/lib/audio-focus-context';
import { getStudio } from '@/lib/dtm';
import { applyMasterVolume, subscribeMasterVolume } from '@/lib/master-volume';

interface ChordPlayerProps {
  chords: string;
}

// 再生UIは共有スタジオ経由の mountChordPlayer で実装する。
// コード進行のパース・ハイライト・再生はすべて @onjmin/dtm 側が担い、自前実装は不要。
export default function ChordPlayer({ chords }: ChordPlayerProps) {
  const id = useId();
  const { requestFocus, releaseFocus } = useAudioFocus();
  const containerRef = useRef<HTMLDivElement>(null);
  const claimedRef = useRef(false);
  const focusRef = useRef({ requestFocus, releaseFocus });
  const focusRef_current = { requestFocus, releaseFocus };
  focusRef.current = focusRef_current;
  const [volumeTick, setVolumeTick] = useState(0);

  useEffect(() => subscribeMasterVolume(() => setVolumeTick((n) => n + 1)), []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let inst: any | null = null;
    let disposed = false;

    let cleanup: (() => void) | null = null;

    getStudio().then((studio) => {
      if (disposed || !el) return;
      inst = studio.mountChordPlayer(el, chords, {
        volume: applyMasterVolume(50),
        onStop: () => {
          claimedRef.current = false;
          focusRef.current.releaseFocus(id);
        },
      });

      const onClick = () => {
        requestAnimationFrame(() => {
          if (inst?.isPlaying() && !claimedRef.current) {
            claimedRef.current = true;
            focusRef.current.requestFocus(id, () => inst?.stop());
          }
        });
      };
      el.addEventListener('click', onClick);
      cleanup = () => el.removeEventListener('click', onClick);
    });

    return () => {
      disposed = true;
      cleanup?.();
      inst?.destroy();
      focusRef.current.releaseFocus(id);
      claimedRef.current = false;
      inst = null;
    };
  }, [chords, id, volumeTick]);

  return <div ref={containerRef} className="mb-2.5" />;
}
