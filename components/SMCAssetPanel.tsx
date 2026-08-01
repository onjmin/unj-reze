'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { loadImage } from '@/lib/walk-sprite';
import type { PickResult } from './ContentPicker';
import { resolveSMCUrl, getSmcMetadata, type SmcMetadata } from '@/lib/smc-helper';

// Global cache promise for metadata
const metadataPromise: Promise<SmcMetadata | null> | null = null;
function getMetadata() {
  return getSmcMetadata();
}

interface SMCAssetPanelProps {
  onPick: (res: PickResult) => void;
}

// Recommended sprites to show by default
const RECOMMENDED_SPRITES = [
  { key: 'PlayerSprite', name: 'プレイヤー (マリオ/ルイージ)' },
  { key: 'Goomba', name: 'クリボー / 栗 (Goomba)' },
  { key: 'KoopaTroopa', name: 'ノコノコ (Koopa Troopa)' },
  { key: 'DryBones', name: 'カロン (Dry Bones)' },
  { key: 'Bobomb', name: 'ボム兵 (Bob-omb)' },
  { key: 'Boo', name: 'テレサ (Boo)' },
  { key: 'NPC', name: 'キノピオ/キノピコ (NPC)' }
];

export default function SMCAssetPanel({ onPick }: SMCAssetPanelProps) {
  const [metadata, setMetadata] = useState<SmcMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedSprite, setSelectedSprite] = useState<string | null>(null);
  const [failedAnims, setFailedAnims] = useState<Set<string>>(new Set());

  // Filters for PlayerSprite
  // 実データの命名は <姿番号><アクション><0|1>（例: 1Walk0 = スーパーマリオ歩き・マリオ）。
  // 姿番号 = パワーアップ(0〜12)、末尾 0=マリオ / 1=ルイージ。SMB3/SMWのスタイル区別は存在しない。
  const [playerChar, setPlayerChar] = useState<'all' | 'mario' | 'luigi'>('mario');
  const [playerPowerup, setPlayerPowerup] = useState<string>('all');

  // NPC・敵の接頭辞は色/種類のバリエーション番号で、SMB3/SMWのスタイル区別は実データに存在しない。
  // 件数も少ないためフィルタは設けず全件表示する。

  useEffect(() => {
    getMetadata()
      .then(data => {
        setMetadata(data);
        setLoading(false);
      })
      .catch(e => {
        console.error("Failed to load SMC metadata:", e);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
        <Loader2 className="animate-spin text-blue-500" size={24} />
        <span className="text-xs">SMCメタデータを読み込み中...</span>
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="text-center py-12 text-xs text-red-500">
        メタデータの読み込みに失敗しました。
      </div>
    );
  }

  // Filter sprite names based on search query
  const q = query.trim().toLowerCase();
  const allSpriteNames = Object.keys(metadata).sort();
  const filteredSpriteNames = allSpriteNames.filter(name => {
    if (!q) return false; // Only show search results when typing
    return name.toLowerCase().includes(q);
  });

  const handlePick = (spriteKey: string, animName: string) => {
    onPick({
      ref: `walk:smc_json:${spriteKey}:${animName}`,
      label: `${spriteKey} (${animName})`
    });
  };

  // If a sprite is selected, render its animations list
  if (selectedSprite) {
    const spriteData = metadata[selectedSprite];
    const allAnims = Object.keys(spriteData.animations).sort();

    // Apply filters
    const filteredAnims = allAnims.filter(animName => {
      // 1. PlayerSprite Filters（命名: <姿番号><アクション><0|1>）
      if (selectedSprite === 'PlayerSprite') {
        // 互換シム由来のエイリアス（2Idle0_3 等、'_'入り）は実体の重複なので出さない
        if (animName.includes('_')) return false;

        const m = animName.match(/^(\d+)([A-Za-z]+?)(\d?)$/);
        if (!m) return true; // 想定外の名前はフィルタせず表示
        const [, powerNum, , charDigit] = m;

        // 末尾 0=マリオ / 1=ルイージ / なし(RunJump等)=共通
        if (playerChar === 'mario' && charDigit === '1') return false;
        if (playerChar === 'luigi' && charDigit === '0') return false;

        if (playerPowerup !== 'all' && powerNum !== playerPowerup) return false;
      }

      // 2. NPC: _Walk エイリアスは Idle と同一実体なので出さない
      if (selectedSprite === 'NPC' && animName.endsWith('_Walk')) return false;

      return true;
    });

    const activeFilterBtn = (active: boolean) =>
      `px-2 py-1 rounded text-[10px] font-bold border transition ${active ? 'bg-blue-600 text-white border-blue-500' : 'bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800'}`;

    return (
      <div className="flex flex-col gap-3 min-h-[300px]">
        {/* Back Button & Header */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-2">
          <button
            onClick={() => setSelectedSprite(null)}
            className="text-[10px] text-blue-500 hover:underline font-bold"
          >
            ← キャラ一覧に戻る
          </button>
          <span className="text-xs font-bold text-gray-200">{selectedSprite}</span>
        </div>

        {/* Filters Panel */}
        {selectedSprite === 'PlayerSprite' && (
          <div className="flex flex-col gap-2 p-2 bg-gray-950 border border-gray-800 rounded-lg">
            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span>キャラクター:</span>
              <div className="flex gap-1">
                <button className={activeFilterBtn(playerChar === 'all')} onClick={() => setPlayerChar('all')}>すべて</button>
                <button className={activeFilterBtn(playerChar === 'mario')} onClick={() => setPlayerChar('mario')}>マリオ</button>
                <button className={activeFilterBtn(playerChar === 'luigi')} onClick={() => setPlayerChar('luigi')}>ルイージ</button>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span>パワーアップ:</span>
              <select
                value={playerPowerup}
                onChange={(e) => setPlayerPowerup(e.target.value)}
                className="bg-gray-900 text-gray-300 text-[10px] font-bold border border-gray-800 rounded px-1.5 py-0.5 outline-none focus:border-blue-500"
              >
                <option value="all">すべて</option>
                <option value="0">ちびマリオ</option>
                <option value="1">スーパーマリオ</option>
                <option value="2">ファイア</option>
                <option value="3">しっぽ</option>
                <option value="4">ハンマー</option>
                <option value="5">アイス</option>
                <option value="6">バリエーション6</option>
                <option value="7">ペンギン</option>
                <option value="8">バリエーション8</option>
                <option value="9">バニー</option>
                <option value="10">タヌキスーツ</option>
                <option value="11">バリエーション11</option>
                <option value="12">カエル</option>
              </select>
            </div>
          </div>
        )}

        {/* Animations Grid */}
        <div className="text-[10px] text-gray-500">
          該当アニメーション ({filteredAnims.filter(animName => !failedAnims.has(animName)).length}件):
        </div>
        <div className="grid grid-cols-6 gap-2 overflow-y-auto max-h-[220px] scrollbar-none pr-1">
          {filteredAnims.filter(animName => !failedAnims.has(animName)).map(animName => (
            <button
              key={animName}
              onClick={() => handlePick(selectedSprite, animName)}
              className="flex flex-col items-center gap-1.5 p-2 bg-[#121620] border border-gray-800 hover:border-blue-500/50 rounded-lg text-center transition group active:scale-95 gimp-checkered-background-white"
            >
              <SMCSpritePreview
                spriteKey={selectedSprite}
                animName={animName}
                metadata={metadata}
                size={36}
                onError={() => setFailedAnims(prev => new Set(prev).add(animName))}
              />
              <span className="text-[9px] font-bold text-gray-400 group-hover:text-blue-400 truncate w-full px-1">
                {animName}
              </span>
            </button>
          ))}
          {filteredAnims.filter(animName => !failedAnims.has(animName)).length === 0 && (
            <div className="col-span-6 text-center py-6 text-[10px] text-gray-500">
              条件に一致するアニメーションがありません。
            </div>
          )}
        </div>
      </div>
    );
  }

  // Otherwise, render the sprites search and list
  return (
    <div className="flex flex-col gap-3 min-h-[300px]">
      {/* Search Bar */}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="SMCスプライト素材を検索（例: Goomba, Bowser）"
          className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-8 pr-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
        />
      </div>

      {/* Search Results */}
      {q && (
        <div className="flex flex-col gap-2">
          <div className="text-[10px] text-gray-500">検索結果 ({filteredSpriteNames.length}件):</div>
          <div className="grid grid-cols-2 gap-1.5 overflow-y-auto max-h-[220px] scrollbar-none">
            {filteredSpriteNames.map(name => (
              <button
                key={name}
                onClick={() => setSelectedSprite(name)}
                className="px-2.5 py-2 text-left bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-lg text-xs font-bold text-gray-300 transition"
              >
                🎮 {name}
              </button>
            ))}
            {filteredSpriteNames.length === 0 && (
              <div className="col-span-2 text-center py-6 text-xs text-gray-600">
                該当するスプライトが見つかりません。
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recommended Sprites */}
      {!q && (
        <div className="flex flex-col gap-2 flex-1">
          <div className="text-[10px] text-gray-500">推奨キャラクター:</div>
          <div className="grid grid-cols-1 gap-1.5 overflow-y-auto max-h-[240px] scrollbar-none">
            {RECOMMENDED_SPRITES.map(item => (
              <button
                key={item.key}
                onClick={() => setSelectedSprite(item.key)}
                className="flex items-center justify-between p-2.5 bg-[#121620] hover:bg-[#171c2a] border border-gray-800 hover:border-blue-500/30 rounded-lg transition text-left active:scale-[0.99]"
              >
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-200">{item.name}</span>
                  <span className="text-[9px] text-gray-500 font-mono">SMC key: {item.key}</span>
                </div>
                <span className="text-[10px] text-blue-500 font-bold hover:underline">選択 →</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SMCSpritePreview({
  spriteKey,
  animName,
  size = 48,
  metadata,
  className,
  onError,
}: {
  spriteKey: string;
  animName: string;
  size?: number;
  metadata: SmcMetadata | null;
  className?: string;
  onError?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    Promise.resolve().then(() => setError(false));

    const sprite = metadata?.[spriteKey];
    const anim = sprite?.animations?.[animName];
    if (!anim || !anim.frames.length) return;

    // SMC のアニメはコマごとに別シートにまたがることがある
    // （例: Goomba 2Walk は f0=tiles-sheet5, f1=goomba-sheet0）。
    // frames[0] のシート固定で切り抜くと別コマが化けるので、シートごとにロードして
    // 各コマは自分のシートから描く。
    const imgByUrl = new Map<string, HTMLImageElement>();
    const urls = Array.from(new Set<string>(anim.frames.map((f) => resolveSMCUrl(f.image))));
    Promise.all(urls.map(u => loadImage(u).then(img => imgByUrl.set(u, img))))
      .then(() => {
        if (cancelled) return;
        raf = requestAnimationFrame(render);
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          onError?.();
        }
      });

    const render = () => {
      if (cancelled) return;
      raf = requestAnimationFrame(render);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const framesCount = anim.frames.length;
      let frameIndex = 0;
      if (framesCount > 1) {
        const fps = anim.speed || 7;
        frameIndex = Math.floor((performance.now() / 1000) * fps) % framesCount;
      }
      const frame = anim.frames[frameIndex];
      const img = imgByUrl.get(resolveSMCUrl(frame.image));
      if (!img) return;
      const sx = frame.x;
      const sy = frame.y;
      const sw = frame.w;
      const sh = frame.h;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== size * dpr) { canvas.width = size * dpr; canvas.height = size * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = false;

      // Fit aspect ratio inside preview square
      const scale = Math.min(size / sw, size / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      const dx = (size - dw) / 2;
      const dy = (size - dh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    };

    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [spriteKey, animName, size, metadata, onError]);

  if (error) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
      className={className}
    />
  );
}
