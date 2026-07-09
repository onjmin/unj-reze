'use client';

import { useEffect, useRef, useId, useState } from 'react';
import { useAudioFocus } from '@/lib/audio-focus-context';
import { getStudio } from '@/lib/dtm';
import { applyMasterVolume, subscribeMasterVolume } from '@/lib/master-volume';

interface MmlPlayerProps {
  mml: string;
}

// 再生UIは共有スタジオ経由の mountPlayer で実装する。
// 楽器プリセット・ドラム・歌声がすべて鳴り、編集UIと音色が一致する。
// フィードに多数並んでも getStudio() はシングルトンなので AudioContext は1つだけ。
export default function MmlPlayer({ mml }: MmlPlayerProps) {
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
      inst = studio.mountPlayer(el, mml, {
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
  }, [mml, id, volumeTick]);

  return <div ref={containerRef} className="mb-2.5" />;
}
