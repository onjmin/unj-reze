'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { loadImage } from '@/lib/walk-sprite';
import type { PickResult } from './ContentPicker';
import { resolveSMCUrl, getSmcMetadata } from '@/lib/smc-helper';

// Global cache promise for metadata
let metadataPromise: Promise<any> | null = null;
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
  { key: 'NPC', name: 'キノピオ/ピーチ姫 (NPC)' }
];

export default function SMCAssetPanel({ onPick }: SMCAssetPanelProps) {
  const [metadata, setMetadata] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedSprite, setSelectedSprite] = useState<string | null>(null);

  // Filters for PlayerSprite
  const [playerStyle, setPlayerStyle] = useState<'all' | 'smb3' | 'smw'>('smw');
  const [playerChar, setPlayerChar] = useState<'all' | 'mario' | 'luigi'>('mario');
  const [playerPowerup, setPlayerPowerup] = useState<'all' | 'small' | 'super' | 'fire' | 'tanooki' | 'cape' | 'frog'>('all');

  // Filters for NPC
  const [npcStyle, setNpcStyle] = useState<'all' | 'smb3' | 'smw'>('all');
  const [npcChar, setNpcChar] = useState<'all' | 'toad' | 'peach' | 'rosalina'>('all');

  // General Style filter (for Goomba, Koopa, etc.)
  const [generalStyle, setGeneralStyle] = useState<'all' | 'smb3' | 'smw'>('all');

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
      // 1. PlayerSprite Filters
      if (selectedSprite === 'PlayerSprite') {
        const styleChar = animName[0];
        if (playerStyle === 'smb3' && styleChar !== '1') return false;
        if (playerStyle === 'smw' && styleChar !== '2') return false;

        const isLuigi = animName.endsWith('_1') || animName.includes('_1_') || animName.endsWith('_1_1');
        if (playerChar === 'mario' && isLuigi) return false;
        if (playerChar === 'luigi' && !isLuigi) return false;

        const parts = animName.split('_');
        const powerupPart = parts[1]; // e.g. "3" or "12"
        if (playerPowerup !== 'all') {
          const targetMap: Record<string, string> = {
            small: '0',
            super: '1',
            fire: '2',
            tanooki: '3',
            cape: '4',
            frog: '12'
          };
          if (powerupPart !== targetMap[playerPowerup]) return false;
        }
      }

      // 2. NPC Filters
      if (selectedSprite === 'NPC') {
        const styleChar = animName[0];
        if (npcStyle === 'smb3' && styleChar !== '1') return false;
        if (npcStyle === 'smw' && styleChar !== '2') return false;

        if (npcChar === 'toad' && !animName.includes('NPC0')) return false;
        if (npcChar === 'peach' && !animName.includes('NPC1')) return false;
        if (npcChar === 'rosalina' && !animName.includes('NPC2')) return false;
      }

      // 3. General Style Filters (starts with 1 or 2)
      if (selectedSprite !== 'PlayerSprite' && selectedSprite !== 'NPC') {
        const styleChar = animName[0];
        if (generalStyle === 'smb3' && styleChar !== '1') return false;
        if (generalStyle === 'smw' && styleChar !== '2') return false;
      }

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
              <span>スタイル:</span>
              <div className="flex gap-1">
                <button className={activeFilterBtn(playerStyle === 'all')} onClick={() => setPlayerStyle('all')}>すべて</button>
                <button className={activeFilterBtn(playerStyle === 'smb3')} onClick={() => setPlayerStyle('smb3')}>SMB3</button>
                <button className={activeFilterBtn(playerStyle === 'smw')} onClick={() => setPlayerStyle('smw')}>SMW</button>
              </div>
            </div>
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
                onChange={(e) => setPlayerPowerup(e.target.value as any)}
                className="bg-gray-900 text-gray-300 text-[10px] font-bold border border-gray-800 rounded px-1.5 py-0.5 outline-none focus:border-blue-500"
              >
                <option value="all">すべて</option>
                <option value="small">ちびマリオ</option>
                <option value="super">スーパーマリオ</option>
                <option value="fire">ファイア</option>
                <option value="tanooki">タヌキ</option>
                <option value="cape">マント</option>
                <option value="frog">カエル</option>
              </select>
            </div>
          </div>
        )}

        {selectedSprite === 'NPC' && (
          <div className="flex flex-col gap-2 p-2 bg-gray-950 border border-gray-800 rounded-lg">
            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span>スタイル:</span>
              <div className="flex gap-1">
                <button className={activeFilterBtn(npcStyle === 'all')} onClick={() => setNpcStyle('all')}>すべて</button>
                <button className={activeFilterBtn(npcStyle === 'smb3')} onClick={() => setNpcStyle('smb3')}>SMB3</button>
                <button className={activeFilterBtn(npcStyle === 'smw')} onClick={() => setNpcStyle('smw')}>SMW</button>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span>キャラクター:</span>
              <div className="flex gap-1">
                <button className={activeFilterBtn(npcChar === 'all')} onClick={() => setNpcChar('all')}>すべて</button>
                <button className={activeFilterBtn(npcChar === 'toad')} onClick={() => setNpcChar('toad')}>キノピオ</button>
                <button className={activeFilterBtn(npcChar === 'peach')} onClick={() => setNpcChar('peach')}>ピーチ姫</button>
                <button className={activeFilterBtn(npcChar === 'rosalina')} onClick={() => setNpcChar('rosalina')}>ロゼッタ</button>
              </div>
            </div>
          </div>
        )}

        {selectedSprite !== 'PlayerSprite' && selectedSprite !== 'NPC' && (
          <div className="flex items-center justify-between text-[10px] text-gray-500 p-2 bg-gray-950 border border-gray-800 rounded-lg">
            <span>スタイル:</span>
            <div className="flex gap-1">
              <button className={activeFilterBtn(generalStyle === 'all')} onClick={() => setGeneralStyle('all')}>すべて</button>
              <button className={activeFilterBtn(generalStyle === 'smb3')} onClick={() => setGeneralStyle('smb3')}>SMB3 (栗/亀..)</button>
              <button className={generalStyle === 'smw' ? activeFilterBtn(true) : activeFilterBtn(false)} onClick={() => setGeneralStyle('smw')}>SMW (丸栗..)</button>
            </div>
          </div>
        )}

        {/* Animations Grid */}
        <div className="text-[10px] text-gray-500">
          該当アニメーション ({filteredAnims.length}件):
        </div>
        <div className="grid grid-cols-3 gap-2 overflow-y-auto max-h-[220px] scrollbar-none pr-1">
          {filteredAnims.map(animName => (
            <button
              key={animName}
              onClick={() => handlePick(selectedSprite, animName)}
              className="flex flex-col items-center gap-1.5 p-2 bg-[#121620] border border-gray-800 hover:border-blue-500/50 rounded-lg text-center transition group active:scale-95"
            >
              <SMCSpritePreview
                spriteKey={selectedSprite}
                animName={animName}
                metadata={metadata}
                size={36}
              />
              <span className="text-[9px] font-bold text-gray-400 group-hover:text-blue-400 truncate w-full px-1">
                {animName}
              </span>
            </button>
          ))}
          {filteredAnims.length === 0 && (
            <div className="col-span-3 text-center py-6 text-[10px] text-gray-500">
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

interface SMCSpritePreviewProps {
  spriteKey: string;
  animName: string;
  size?: number;
  className?: string;
  metadata: any;
}

export function SMCSpritePreview({ spriteKey, animName, size = 48, className, metadata }: SMCSpritePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let raf = 0;
    let img: HTMLImageElement | null = null;
    let cancelled = false;
    setError(false);

    const sprite = metadata?.[spriteKey];
    const anim = sprite?.animations?.[animName];
    if (!anim || !anim.frames.length) return;

    const imageUrl = resolveSMCUrl(anim.frames[0].image);

    loadImage(imageUrl).then((loaded) => {
      if (cancelled) return;
      img = loaded;
      raf = requestAnimationFrame(render);
    }).catch(() => { if (!cancelled) setError(true); });

    const render = () => {
      if (cancelled) return;
      raf = requestAnimationFrame(render);
      const canvas = canvasRef.current;
      if (!canvas || !img) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const framesCount = anim.frames.length;
      let frameIndex = 0;
      if (framesCount > 1) {
        const fps = anim.speed || 7;
        frameIndex = Math.floor((performance.now() / 1000) * fps) % framesCount;
      }
      const frame = anim.frames[frameIndex];
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
  }, [spriteKey, animName, size, metadata]);

  if (error) {
    return (
      <div className="flex items-center justify-center bg-gray-900 text-gray-600 text-[9px]" style={{ width: size, height: size }}>
        ✕
      </div>
    );
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
