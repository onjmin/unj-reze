'use client';

import { useEffect, useRef, useId } from 'react';
import { mountMmlPlayer, type MmlPlayerInstance } from '@onjmin/dtm';
import { useAudioFocus } from '@/lib/audio-focus-context';

interface MmlPlayerProps {
  mml: string;
}

// 再生UIは @onjmin/dtm の mountMmlPlayer（軽量・内蔵squareシンセ・遅延AudioContext）で実装する。
// フィードに多数並んでも AudioContext は初回再生まで生成されないため安全。
export default function MmlPlayer({ mml }: MmlPlayerProps) {
  const id = useId();
  const { requestFocus, releaseFocus } = useAudioFocus();
  const containerRef = useRef<HTMLDivElement>(null);
  const claimedRef = useRef(false);
  // 最新の focus 関数を ref で保持し、mml 再マウント effect から参照する。
  const focusRef = useRef({ requestFocus, releaseFocus });
  focusRef.current = { requestFocus, releaseFocus };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let inst: MmlPlayerInstance;
    try {
      inst = mountMmlPlayer(el, mml, {
        onStop: () => {
          claimedRef.current = false;
          focusRef.current.releaseFocus(id);
        },
      });
    } catch {
      return;
    }

    // 再生ボタンはライブラリ内部DOMにあるため、コンテナのクリックを監視して
    // 再生開始の瞬間にオーディオフォーカスを奪う（アプリ全体で同時に1つだけ鳴らす）。
    const onClick = () => {
      requestAnimationFrame(() => {
        if (inst.isPlaying() && !claimedRef.current) {
          claimedRef.current = true;
          focusRef.current.requestFocus(id, () => inst.stop());
        }
      });
    };
    el.addEventListener('click', onClick);

    return () => {
      el.removeEventListener('click', onClick);
      inst.destroy();
      focusRef.current.releaseFocus(id);
      claimedRef.current = false;
    };
  }, [mml, id]);

  return <div ref={containerRef} className="mb-2.5" />;
}
