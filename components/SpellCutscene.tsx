'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PLAY_W } from './game-presets/shared';

export interface SpellCutsceneConfig {
  mode: 'boss' | 'player';
  charName: string;
  spellName: string;
  imageUrl?: string;
  /** 立ち絵の水平オフセット px（設計座標、画面中央基準） */
  imageX?: number;
  /** 立ち絵の垂直オフセット px（設計座標、画面中央基準） */
  imageY?: number;
  imageScale?: number;
}

interface Props extends SpellCutsceneConfig {
  onComplete: () => void;
}

const DURATION = 3500;

export default function SpellCutscene({
  mode, charName, spellName, imageUrl,
  imageX, imageY, imageScale, onComplete,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [uiScale, setUiScale] = useState(1);
  const idRef = useRef(`sc${Math.random().toString(36).slice(2, 6)}`);
  const id = idRef.current;

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => setUiScale((el.offsetWidth || PLAY_W) / PLAY_W);
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const t = setTimeout(onComplete, DURATION);
    return () => clearTimeout(t);
  }, [onComplete]);

  const isBoss = mode === 'boss';
  const sx = (imageX ?? (isBoss ? 50 : -150)) * uiScale;
  const sy = (imageY ?? (isBoss ? 0 : 80)) * uiScale;
  const sc = (imageScale ?? (isBoss ? 4 : 2.5)) * uiScale;

  const css = `
    @keyframes ${id}-dim {
      0%   { opacity: 0 }
      10%  { opacity: 0.7 }
      85%  { opacity: 0.7 }
      100% { opacity: 0 }
    }
    @keyframes ${id}-boss-char {
      0%   { transform: translate(calc(-50% + ${sx - 100 * uiScale}px), calc(-50% + ${sy}px)) scale(${sc}); opacity: 0; filter: brightness(2) drop-shadow(0 0 10px rgba(255,255,255,0.8)); }
      10%  { transform: translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px)) scale(${sc}); opacity: 1; filter: brightness(1); }
      90%  { transform: translate(calc(-50% + ${sx + 50 * uiScale}px), calc(-50% + ${sy}px)) scale(${sc}); opacity: 1; }
      100% { transform: translate(calc(-50% + ${sx + 100 * uiScale}px), calc(-50% + ${sy}px)) scale(${sc}); opacity: 0; }
    }
    @keyframes ${id}-player-char {
      0%   { transform: translate(calc(-50% + ${sx - 50 * uiScale}px), calc(-50% + ${sy + 30 * uiScale}px)) scale(${sc}); opacity: 0; filter: brightness(2); }
      10%  { transform: translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px)) scale(${sc}); opacity: 1; filter: brightness(1); }
      90%  { transform: translate(calc(-50% + ${sx + 20 * uiScale}px), calc(-50% + ${sy - 10 * uiScale}px)) scale(${sc}); opacity: 1; }
      100% { transform: translate(calc(-50% + ${sx + 50 * uiScale}px), calc(-50% + ${sy - 30 * uiScale}px)) scale(${sc}); opacity: 0; }
    }
    @keyframes ${id}-boss-banner {
      0%   { transform: translateX(100%) skewX(-15deg); opacity: 0; }
      10%  { transform: translateX(0) skewX(-15deg); opacity: 1; }
      90%  { transform: translateX(0) skewX(-15deg); opacity: 1; }
      100% { transform: translateX(100%) skewX(-15deg); opacity: 0; }
    }
    @keyframes ${id}-player-banner {
      0%   { transform: translateX(-100%); opacity: 0; }
      10%  { transform: translateX(0); opacity: 1; }
      90%  { transform: translateX(0); opacity: 1; }
      100% { transform: translateX(-100%); opacity: 0; }
    }
  `;

  const textShadow = '2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000';

  return (
    <div ref={rootRef} className="absolute inset-0 overflow-hidden pointer-events-none z-40">
      <style>{css}</style>

      {/* 暗幕 */}
      <div style={{
        position: 'absolute', inset: 0,
        animation: `${id}-dim ${DURATION}ms ease-in-out forwards`,
        background: isBoss ? 'rgba(120,0,0,0.55)' : 'rgba(0,0,120,0.55)',
      }} />

      {/* キャラクター立ち絵 */}
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl} alt={charName}
          style={{
            position: 'absolute', top: '50%', left: '50%',
            animation: `${id}-${isBoss ? 'boss' : 'player'}-char ${DURATION}ms cubic-bezier(0.2,0.8,0.2,1) forwards`,
            imageRendering: 'pixelated',
          }}
        />
      )}

      {/* スペルカード宣言帯 */}
      {isBoss ? (
        <div style={{
          position: 'absolute', top: '20%', right: 0, width: '120%', height: 96,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          paddingRight: '20%',
          animation: `${id}-boss-banner ${DURATION}ms cubic-bezier(0.1,0.9,0.2,1) forwards`,
          background: 'linear-gradient(90deg, transparent 0%, rgba(153,27,27,0.8) 50%, rgba(220,38,38,0.9) 100%)',
          borderTop: '3px solid #fca5a5', borderBottom: '3px solid #fca5a5',
          boxShadow: '0 0 30px rgba(220,38,38,0.6)',
        }}>
          <div style={{ transform: 'skewX(15deg)', textAlign: 'right' }}>
            <p style={{ color: '#fecaca', fontSize: 12, marginBottom: 4, fontFamily: 'serif', letterSpacing: '0.1em', textShadow }}>{charName}</p>
            <p style={{ color: '#fff', fontSize: 20, fontWeight: 700, fontFamily: 'serif', letterSpacing: '0.1em', textShadow }}>{spellName}</p>
          </div>
        </div>
      ) : (
        <div style={{
          position: 'absolute', bottom: '10%', left: 0, width: '80%', height: 80,
          display: 'flex', alignItems: 'center',
          paddingLeft: '8%',
          animation: `${id}-player-banner ${DURATION}ms cubic-bezier(0.1,0.9,0.2,1) forwards`,
          background: 'linear-gradient(90deg, rgba(30,58,138,0.9) 0%, rgba(29,78,216,0.8) 70%, transparent 100%)',
          borderTop: '2px solid #93c5fd', borderBottom: '2px solid #93c5fd',
          boxShadow: '0 0 20px rgba(29,78,216,0.6)',
        }}>
          <div>
            <p style={{ color: '#bfdbfe', fontSize: 10, marginBottom: 2, fontFamily: 'serif', letterSpacing: '0.05em', textShadow }}>{charName}</p>
            <p style={{ color: '#fff', fontSize: 16, fontWeight: 700, fontFamily: 'serif', letterSpacing: '0.1em', textShadow }}>{spellName}</p>
          </div>
        </div>
      )}
    </div>
  );
}
