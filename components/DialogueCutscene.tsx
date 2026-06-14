'use client';
import { useState, useEffect, useLayoutEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { type DialogueLine, PLAY_W, PLAY_H } from './game-presets/shared';

const keyOf = (l: DialogueLine) => l.imageSrc ?? l.emoji ?? l.speaker;

interface PortraitProps {
  line: DialogueLine;
  active: boolean;
}

function Portrait({ line, active }: PortraitProps) {
  const [loaded, setLoaded] = useState(false);
  const x = line.imageX ?? 0;
  const y = line.imageY ?? 0;
  const scale = line.imageScale ?? 1;
  const scaleVal = active ? scale * 1.04 : scale * 0.95;
  const opacity = active ? 1 : 0.35;

  if (line.imageSrc) {
    return (
      <img
        src={line.imageSrc}
        onLoad={() => setLoaded(true)}
        style={{
          position: 'absolute',
          bottom: y,
          left: x,
          transform: `scale(${scaleVal})`,
          transformOrigin: 'bottom left',
          imageRendering: 'pixelated',
          opacity: loaded ? opacity : 0,
          transition: 'opacity 0.25s, transform 0.25s',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
        alt={line.speaker}
      />
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: y,
        left: x,
        transform: `scale(${scaleVal})`,
        transformOrigin: 'bottom left',
        opacity,
        transition: 'opacity 0.25s, transform 0.25s',
        userSelect: 'none',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <span style={{ fontSize: 56, lineHeight: 1 }}>{line.emoji ?? '❓'}</span>
      <span style={{ fontSize: 10, fontWeight: 700, color: active ? '#fef08a' : '#6b7280' }}>
        {line.speaker}
      </span>
    </div>
  );
}

interface Props {
  lines: DialogueLine[];
  onComplete: () => void;
}

export interface DialogueCutsceneHandle {
  advance: () => void;
}

const DialogueCutscene = forwardRef<DialogueCutsceneHandle, Props>(function DialogueCutscene({ lines, onComplete }, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [uiScale, setUiScale] = useState(1);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => setUiScale((el.offsetWidth || PLAY_W) / PLAY_W);
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const [index, setIndex] = useState(0);
  const [portraitMap, setPortraitMap] = useState<Record<string, DialogueLine>>(() => {
    const m: Record<string, DialogueLine> = {};
    if (lines.length > 0) m[keyOf(lines[0])] = lines[0];
    return m;
  });
  const [textVisible, setTextVisible] = useState(true);

  useEffect(() => {
    setPortraitMap(prev => {
      const next = { ...prev };
      let changed = false;
      for (const l of lines) {
        const k = keyOf(l);
        if (k in next && next[k] !== l) { next[k] = l; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [lines]);

  const current = lines[index];
  if (!current) return null;
  const currentKey = keyOf(current);

  const advance = () => {
    if (index < lines.length - 1) {
      const next = lines[index + 1];
      setPortraitMap(prev => ({ ...prev, [keyOf(next)]: next }));
      setTextVisible(false);
      setTimeout(() => { setIndex(i => i + 1); setTextVisible(true); }, 80);
    } else {
      onComplete();
    }
  };

  // forwardRef 経由で advance を外部に公開（モバイル「次へ」ボタン用）
  const advanceRef = useRef<() => void>(advance);
  advanceRef.current = advance;
  useImperativeHandle(ref, () => ({ advance: () => advanceRef.current() }), []);

  // Z キー / Enter キーでセリフ送り
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'z' || e.key === 'Z' || e.key === 'Enter') {
        e.preventDefault();
        advanceRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const isLast = index === lines.length - 1;

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-30"
      style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 55%, transparent)' }}
      onClick={advance}
    >
      {/* 設計座標空間（PLAY_W×PLAY_H）をuiScaleで縮小し、立ち絵の値をそのまま使える */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: PLAY_W,
        height: PLAY_H,
        transform: `scale(${uiScale})`,
        transformOrigin: 'bottom left',
        pointerEvents: 'none',
      }}>
        {Object.entries(portraitMap).map(([k, pl]) => (
          <Portrait key={k} line={pl} active={k === currentKey} />
        ))}
      </div>

      <div className="absolute bottom-0 left-0 right-0 mx-2 mb-2">
        <div
          className="rounded-lg px-4 py-3 shadow-2xl"
          style={{ background: '#1a1a2e', border: '2px solid #555', fontFamily: 'monospace' }}
        >
          <p className="text-yellow-300 text-xs font-bold mb-1 leading-none">{current.speaker}</p>
          <p
            className="text-white text-sm leading-relaxed whitespace-pre-wrap transition-opacity duration-75"
            style={{ opacity: textVisible ? 1 : 0 }}
          >
            {current.text}
          </p>
          <div className="flex justify-end mt-1.5 h-4">
            <span className="text-yellow-300 text-xs animate-bounce">
              {isLast ? '▶ 閉じる' : '▼'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default DialogueCutscene;
