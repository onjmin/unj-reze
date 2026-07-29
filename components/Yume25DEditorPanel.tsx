'use client';

// yume25d（ゆめにっき3D）の編集パネル。かつては Yume25DMaker 内でキャンバスに重ねる
// absolute オーバーレイだったが、GameMaker のサイドバーへ吸収し縦積みのリストとして表示する。

import { useEffect, useRef, useState } from 'react';
import { Plus, Image as ImageIcon, Music } from 'lucide-react';
import { type Yume25DTool, yume25dTexList, yume25dResizeFloor } from './Yume25DMaker';
import {
  type Layout25D, type Tex25D, type Dir4, type NpcBehavior,
  SYSTEM_TILE_TEMPLATES, type SystemTileTemplate,
  SYSTEM_SPRITE_TEMPLATES, type SystemSpriteTemplate,
} from './game-presets/shared';
import { searchModels, type ModelCatalogEntry } from './game-presets/model-catalog';
import { MINECRAFT_SKIN_PRESETS } from '@/lib/minecraft-model';
import { drawPlayerIconCanvas, yume25dAmbientDefault, yume25dTimeOfDay, yume25dSunAngles } from '@/lib/yume25d';
import { billboardGroups, canShiftLayer, shiftLayer, setWallHeight, stackBlockLayer, type LayerShiftTarget, generateYumeTerrain, type YumeTerrainOptions } from '@/lib/yume25d-macros';
import { TERRAIN_STYLE_LABELS, type TerrainStyle } from '@/lib/terrain-gen';
import AssetThumb from './AssetThumb';

/** スプライトパレットのサムネ。歩行グラ（walk:参照）なら正面(下向き)1コマ目だけを切り出して表示する。 */
function SpriteThumb({ t }: { t: Tex25D }) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    cv.width = 64; cv.height = 64;
    drawPlayerIconCanvas(cv, { emoji: t.emoji, color: t.color, spriteUrl: t.imageUrl, spriteRef: t.imageRef }, () => { });
  }, [t.imageUrl, t.imageRef, t.emoji, t.color]);
  return <canvas ref={cvRef} className="w-full h-full" style={{ imageRendering: 'pixelated' }} />;
}

/** 設定パネルの行のうち、幅いっぱいのコントロール（セレクト等）を置くもの。
 *  他の行と同じ「ラベル｜コントロール」の横並びにすると、コントロールが幅を取り切って
 *  ラベルが1文字ずつ縦に折り返してしまうため、こちらはラベルを上に積む。 */
function WideField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="col-span-2 block">
      <span className="block text-gray-400 mb-0.5">{label}</span>
      {children}
    </label>
  );
}

/** スライダー行：ラベル・つまみ・現在値を1行に収める。値が見えないと角度の調整ができない。 */
function SliderField({ label, value, min, max, step = 1, suffix = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="col-span-2 flex items-center justify-between gap-2">
      <span className="shrink-0">{label}</span>
      <span className="flex items-center gap-1.5 min-w-0">
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))} className="w-28 min-w-0" />
        <span className="w-11 shrink-0 text-right tabular-nums text-gray-400">{value}{suffix}</span>
      </span>
    </label>
  );
}

/** 方位角（度）を8方位の名前へ。数字だけだとどちらを向いているか分からない。 */
const COMPASS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
const compassName = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

interface Yume25DEditorPanelProps {
  layout: Layout25D;
  onLayoutChange: (updater: (l: Layout25D) => Layout25D) => void;
  onPickImage?: (target: { t: 'yumeTex'; id: number } | { t: 'yumeSky' } | { t: 'yumeTexSound'; id: number } | { t: 'yumeMcSkin' }) => void;
  view: '2d' | '3d';
  onViewChange: (v: '2d' | '3d') => void;
  tool: Yume25DTool;
  onToolChange: (t: Yume25DTool) => void;
  level: number;
  onLevelChange: (lv: number) => void;
  selFloor: number;
  onSelFloorChange: (id: number) => void;
  selWall: number;
  onSelWallChange: (id: number) => void;
  selSprite: number;
  onSelSpriteChange: (id: number) => void;
  settingsOpen: boolean;
  onSettingsOpenChange: (v: boolean) => void;
  talkTargetId: string | null;
}

export default function Yume25DEditorPanel({
  layout, onLayoutChange, onPickImage,
  view, onViewChange, tool, onToolChange, level, onLevelChange,
  selFloor, onSelFloorChange, selWall, onSelWallChange, selSprite, onSelSpriteChange,
  settingsOpen, onSettingsOpenChange, talkTargetId,
}: Yume25DEditorPanelProps) {
  const paletteKind: Tex25D['kind'] | null = tool === 'floor' ? 'floor' : tool === 'wall' ? 'wall' : tool === 'sprite' ? 'sprite' : null;
  const paletteSel = tool === 'floor' ? selFloor : tool === 'wall' ? selWall : selSprite;
  const setPaletteSel = (id: number) => {
    if (tool === 'floor') onSelFloorChange(id);
    else if (tool === 'wall') onSelWallChange(id);
    else onSelSpriteChange(id);
  };
  /** スライダーには実際に使われている角度を出す（未設定なら時間帯ごとの既定値）。 */
  const sunAngles = yume25dSunAngles(layout);

  /** 2Dエンジンの「シーン切替床」は yume25d ではマップ内転送なので表示名を読み替える。 */
  const sysTileLabel = (tpl: SystemTileTemplate) => tpl.special === 'warp' ? 'ワープ床' : tpl.label;

  /** システムタイルを special 付きの床テクスチャとして追加し、床ツール＋パレット選択まで済ませる。
   *  以後は通常の床と同じ操作（2D/3Dビューで塗る・消す）で配置できる。 */
  const addSystemFloorTex = (tpl: SystemTileTemplate) => {
    const id = Math.max(0, ...Object.keys(layout.textures).map(Number)) + 1;
    onLayoutChange(l => ({
      ...l,
      textures: {
        ...l.textures,
        [id]: {
          id, name: sysTileLabel(tpl), kind: 'floor' as const,
          color: tpl.color, imageRef: tpl.imageRef, imageUrl: tpl.imageUrl, special: tpl.special,
          // ワープ先の初期値はスタート地点（テクスチャ設定でいつでも変更できる）
          ...(tpl.special === 'warp' ? { warpDest: { col: l.start.col, row: l.start.row } } : {}),
        },
      },
    }));
    onToolChange('floor');
    onSelFloorChange(id);
  };

  // サンプル3Dモデルの検索モーダル（スプライト検索と同様のキーワード検索）
  const [modelSearchOpen, setModelSearchOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState('');

  // マクロ（一括編集）パネル：レイヤー（地形/壁/スプライト/全レイヤー）やスプライトグループをまとめて動かす
  const [macroOpen, setMacroOpen] = useState(false);
  const [macroTarget, setMacroTarget] = useState<LayerShiftTarget>('all');
  const [stackTex, setStackTex] = useState<number>(0);
  const texIds = Object.keys(layout.textures).map(Number);
  const selStackTex = layout.textures[stackTex] ? stackTex : (texIds[0] ?? 0);
  const macroGroups = billboardGroups(layout);
  const canShift = (dc: number, dr: number, dlv = 0) =>
    canShiftLayer(layout, macroTarget, dc, dr, dlv);
  const runShiftMacro = (dc: number, dr: number, dlv = 0) =>
    onLayoutChange(l => shiftLayer(l, macroTarget, dc, dr, dlv));
  // 地形自動生成マクロ：XYZ（列・行・最大高さ）の数値指定＋地形タイプ・水の量・洞窟。
  // 押すたびにランダムシードで生成し直す。XY が現在のマップサイズと違えば自動で拡張/縮小される。
  const [terrainCols, setTerrainCols] = useState(layout.cols);
  const [terrainRows, setTerrainRows] = useState(layout.rows);
  const [terrainHeight, setTerrainHeight] = useState(4);
  const [terrainWater, setTerrainWater] = useState<YumeTerrainOptions['water']>('mid');
  const [terrainStyle, setTerrainStyle] = useState<TerrainStyle>('hills');
  const [terrainCaves, setTerrainCaves] = useState(true);
  const runTerrainMacro = () =>
    onLayoutChange(l => generateYumeTerrain(l, {
      seed: (Math.random() * 0xffffffff) >>> 0,
      cols: terrainCols, rows: terrainRows, maxHeight: terrainHeight,
      water: terrainWater, style: terrainStyle, caves: terrainCaves,
    }));

  /** 検索モーダルで選んだ3Dモデルをスプライトテクスチャとして追加し、
   *  スプライトツール＋パレット選択まで済ませる。 */
  const addModelTex = (m: ModelCatalogEntry) => {
    const id = Math.max(0, ...Object.keys(layout.textures).map(Number)) + 1;
    onLayoutChange(l => ({
      ...l,
      textures: {
        ...l.textures,
        [id]: { id, name: m.label, kind: 'sprite' as const, color: '#9fb4c8', emoji: m.emoji, modelUrl: m.url },
      },
    }));
    onToolChange('sprite');
    onSelSpriteChange(id);
    setModelSearchOpen(false);
  };

  /** マイクラスキン（Slim型）のスプライトテクスチャを追加し、スプライトツール＋パレット選択まで済ませる。 */
  const addMinecraftSkinTex = (name: string, url: string) => {
    const id = Math.max(0, ...Object.keys(layout.textures).map(Number)) + 1;
    onLayoutChange(l => ({
      ...l,
      textures: {
        ...l.textures,
        [id]: { id, name, kind: 'sprite' as const, color: '#7ec9a2', emoji: '👗', minecraftSkin: url },
      },
    }));
    onToolChange('sprite');
    onSelSpriteChange(id);
  };
  const [mcSkinUrl, setMcSkinUrl] = useState('');

  /** システムスプライト（ボール・スピーカー）を special 付きスプライトテクスチャとして追加し、
   *  スプライトツール＋パレット選択まで済ませる。 */
  const addSystemSpriteTex = (tpl: SystemSpriteTemplate) => {
    const id = Math.max(0, ...Object.keys(layout.textures).map(Number)) + 1;
    onLayoutChange(l => ({
      ...l,
      textures: {
        ...l.textures,
        [id]: { id, name: tpl.label, kind: 'sprite' as const, color: tpl.color, emoji: tpl.emoji, special: tpl.special },
      },
    }));
    onToolChange('sprite');
    onSelSpriteChange(id);
  };

  /** システムテクスチャを削除する。塗られていた床は奈落に戻し、配置済みスプライトも取り除く。 */
  const deleteFloorTex = (id: number) => {
    const kind = layout.textures[id]?.kind;
    onLayoutChange(l => {
      const textures = { ...l.textures };
      delete textures[id];
      const floor = l.floor.map(row => row.map(v => (v === id ? 0 : v)));
      const billboards = l.billboards.filter(b => b.tex !== id);
      return { ...l, textures, floor, billboards };
    });
    if (kind === 'sprite') onSelSpriteChange(yume25dTexList(layout, 'sprite').find(t => t.id !== id)?.id ?? 0);
    else onSelFloorChange(0);
  };

  return (
    <div className="flex flex-col gap-1.5 p-2">
      <div className="flex items-center gap-1 flex-wrap">
        {/* 2D/3D トグル */}
        <div className="flex overflow-hidden rounded border border-gray-600">
          {(['2d', '3d'] as const).map(v => (
            <button key={v} onClick={() => onViewChange(v)}
              className={`px-2.5 py-1 text-[11px] font-bold ${view === v ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
              {v === '2d' ? '2D 表示' : '3D 表示'}
            </button>
          ))}
        </div>
        <button onClick={() => setMacroOpen(!macroOpen)}
          className={`ml-auto px-2 py-1 text-[11px] font-bold rounded ${macroOpen ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
          マクロ
        </button>
        <button onClick={() => onSettingsOpenChange(!settingsOpen)}
          className={`px-2 py-1 text-[11px] font-bold rounded ${settingsOpen ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
          設定
        </button>
      </div>

      {/* マクロパネル：マップ一括編集。プロトタイプは「同じ見た目のグループを1マスずつ平行移動」 */}
      {macroOpen && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 text-[10px] text-gray-300">
          <p className="text-[12px] font-bold text-gray-200">🔁 マクロ（一括編集）</p>

          {/* 地形自動生成：パーリンノイズの高さマップでブロック地形（海底〜山・洞窟）を丸ごと作る */}
          <p className="font-bold text-gray-400">🌍 地形の自動生成</p>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1" title="マップの列数（自動でリサイズ）">X(列)
              <input type="number" min={4} max={48} value={terrainCols}
                onChange={e => setTerrainCols(Math.max(4, Math.min(48, Number(e.target.value) || 4)))}
                className="w-14 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-white" />
            </label>
            <label className="flex items-center gap-1" title="マップの行数（自動でリサイズ）">Y(行)
              <input type="number" min={4} max={48} value={terrainRows}
                onChange={e => setTerrainRows(Math.max(4, Math.min(48, Number(e.target.value) || 4)))}
                className="w-14 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-white" />
            </label>
            <label className="flex items-center gap-1" title="地形の最大の高さ（ブロック段数）">Z(高さ)
              <input type="number" min={1} max={8} value={terrainHeight}
                onChange={e => setTerrainHeight(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
                className="w-12 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-white" />
            </label>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5">地形タイプ
              <select value={terrainStyle} onChange={e => setTerrainStyle(e.target.value as TerrainStyle)}
                className="bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-white">
                {(Object.keys(TERRAIN_STYLE_LABELS) as TerrainStyle[]).map(s => (
                  <option key={s} value={s}>{TERRAIN_STYLE_LABELS[s]}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">水の量
              <select value={terrainWater} onChange={e => setTerrainWater(e.target.value as YumeTerrainOptions['water'])}
                className="bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-white">
                <option value="none">なし</option>
                <option value="low">少なめ</option>
                <option value="mid">ふつう</option>
                <option value="high">多め</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={terrainCaves} onChange={e => setTerrainCaves(e.target.checked)} />
              洞窟
            </label>
            <button onClick={runTerrainMacro}
              className="px-2.5 py-1 rounded border-2 border-gray-600 bg-blue-600 text-white text-[11px] font-bold">
              🎲 地形を生成
            </button>
          </div>
          <p className="text-[9px] text-gray-500">マイクラと同じパーリンノイズの高さマップで、内蔵素材のブロックを積んだ地形（海底の起伏〜砂浜〜草原〜山、雪山）を作ります。水の量を入れると海面より低い場所は泳いで潜れる海になり、洞窟ONで山の中にトンネルがくり抜かれます。押すたびに別の地形になります。床とブロック/木は描き替えますが、ほかのスプライトや壁は残ります。スタート周辺は平地になります。XYZが大きいほど生成後の動作が重くなります</p>

          <p className="font-bold text-gray-400 pt-1.5 mt-1 border-t border-gray-700/50">↔️ レイヤー・タイルのバッチ移動</p>
          <div className="flex flex-col gap-1">
            <span className="text-gray-400 font-bold">対象レイヤー / グループ:</span>
            <div className="flex items-center gap-1 flex-wrap">
              {[
                { id: 'all', label: '🌐 全体' },
                { id: 'floor', label: '🗺️ 地形' },
                { id: 'wall', label: '🧱 壁' },
                { id: 'billboard', label: '🧍 スプライト' },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => setMacroTarget(item.id as LayerShiftTarget)}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
                    macroTarget === item.id
                      ? 'bg-blue-600 border-blue-400 text-white'
                      : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              {macroGroups.map(g => (
                <button
                  key={g.tex}
                  onClick={() => setMacroTarget(g.tex)}
                  title={`${g.name} (×${g.count})`}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded border flex items-center gap-1 ${
                    macroTarget === g.tex
                      ? 'bg-blue-600 border-blue-400 text-white'
                      : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {g.emoji ? `${g.emoji} ` : ''}{g.name}
                  <span className="opacity-70 text-[9px]">×{g.count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-gray-400">1マスずつ移動</span>
              <div className="grid grid-cols-3 gap-0.5">
                <span />
                <button onClick={() => runShiftMacro(0, -1)} disabled={!canShift(0, -1)}
                  className="w-8 h-8 rounded border-2 border-gray-700 bg-gray-800 text-gray-200 text-[13px] font-bold disabled:opacity-30">↑</button>
                <span />
                <button onClick={() => runShiftMacro(-1, 0)} disabled={!canShift(-1, 0)}
                  className="w-8 h-8 rounded border-2 border-gray-700 bg-gray-800 text-gray-200 text-[13px] font-bold disabled:opacity-30">←</button>
                <button onClick={() => runShiftMacro(0, 1)} disabled={!canShift(0, 1)}
                  className="w-8 h-8 rounded border-2 border-gray-700 bg-gray-800 text-gray-200 text-[13px] font-bold disabled:opacity-30">↓</button>
                <button onClick={() => runShiftMacro(1, 0)} disabled={!canShift(1, 0)}
                  className="w-8 h-8 rounded border-2 border-gray-700 bg-gray-800 text-gray-200 text-[13px] font-bold disabled:opacity-30">→</button>
              </div>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-gray-400">高さ（段）</span>
              <div className="flex flex-col gap-0.5">
                <button onClick={() => runShiftMacro(0, 0, 1)} disabled={!canShift(0, 0, 1)}
                  className="w-12 h-7 rounded border-2 border-gray-700 bg-gray-800 text-gray-200 text-[11px] font-bold disabled:opacity-30">＋1段</button>
                <button onClick={() => runShiftMacro(0, 0, -1)} disabled={!canShift(0, 0, -1)}
                  className="w-12 h-7 rounded border-2 border-gray-700 bg-gray-800 text-gray-200 text-[11px] font-bold disabled:opacity-30">−1段</button>
              </div>
            </div>
          </div>
          <p className="text-[9px] text-gray-500">
            選択したレイヤー（地形/壁/スプライト/全レイヤー/特定グループ）のタイルやオブジェクトを一括で上下左右・高さ方向に平行移動します。
          </p>
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-700/50 flex-wrap">
            <span className="text-gray-400 font-bold">📐 マップ層の高さスケール</span>
            <div className="flex items-center gap-1">
              {[0.5, 1.0, 1.5, 2.0].map(h => (
                <button
                  key={h}
                  onClick={() => onLayoutChange(l => setWallHeight(l, h))}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
                    layout.wallHeight === h
                      ? 'bg-blue-600 border-blue-400 text-white'
                      : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {h}x
                </button>
              ))}
            </div>
          </div>

          <p className="font-bold text-gray-400 pt-1.5 mt-1 border-t border-gray-700/50">🧱 ブロック層の積み上げ</p>
          <div className="flex flex-col gap-1.5">
            <span className="text-gray-400 font-bold">素材アイコンを選択:</span>
            <div className="flex items-center gap-1 flex-wrap">
              {Object.values(layout.textures).map(t => (
                <button
                  key={t.id}
                  onClick={() => setStackTex(t.id)}
                  title={`${t.name} (#${t.id})`}
                  className={`w-7 h-7 rounded border-2 flex items-center justify-center text-sm overflow-hidden transition-all ${
                    selStackTex === t.id ? 'border-yellow-400 ring-2 ring-yellow-400/40' : 'border-gray-700 hover:border-gray-500'
                  }`}
                  style={{ background: t.imageUrl ? undefined : t.emoji ? '#1c1826' : t.color }}
                >
                  {t.imageUrl && (t.kind === 'sprite' || t.imageUrl.includes('#')) ? (
                    <SpriteThumb t={t} />
                  ) : t.imageUrl ? (
                    <div className="w-full h-full" style={{ background: `url(${t.imageUrl}) center/contain no-repeat #1c1826` }} />
                  ) : (
                    t.emoji ?? ''
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[11px] text-gray-300 font-bold">
                選択中: {layout.textures[selStackTex]?.emoji ? `${layout.textures[selStackTex].emoji} ` : ''}{layout.textures[selStackTex]?.name ?? `#${selStackTex}`}
              </span>
              <button
                onClick={() => onLayoutChange(l => stackBlockLayer(l, selStackTex))}
                className="px-2.5 py-1 rounded border-2 border-blue-500 bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-500"
              >
                🧱 ブロック層を積み上げる (+1段)
              </button>
            </div>
          </div>
          <p className="text-[9px] text-gray-500">
            選んだ素材が存在する床・ブロックの全座標を自動識別し、同じ素材のブロックを1段上に一括生成します。連打すると2段目・3段目へと積み上がります。
          </p>
        </div>
      )}

      {/* ツール選択は上の「置くもの」ドロップダウンへ統合済み（入れ子の選択UIを作らない）。 */}
      {view === '3d' && (
        <span className="text-[10px] text-gray-400 px-1">タップ/クリックで配置（高さは指した先に自動追従）・WASDで移動・Space2回押しで浮遊ON/OFF（浮遊中：Spaceで上昇/Shiftで下降）・通常時：Spaceでジャンプ/Shiftでダッシュ・ドラッグで視点回転(上下も可)</span>
      )}

      {/* 段（高さ）セレクタ：壁/スプライトはこの段に配置される。マイクラ風の縦積みで上限なし。
          3Dビューではカーソルの指した先（壁の上・NPC・浮遊高度）から自動で決まるため表示しない。 */}
      {view === '2d' && (tool === 'wall' || tool === 'sprite' || tool === 'erase') && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-gray-400 px-0.5">高さ</span>
          <button onClick={() => onLevelChange(Math.max(0, level - 1))} disabled={level === 0}
            className="w-7 h-7 rounded border-2 border-gray-700 bg-gray-800 text-gray-300 text-[13px] font-bold disabled:opacity-40">−</button>
          <span className="h-7 min-w-14 px-1.5 rounded border-2 border-gray-600 bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
            {level + 1}段目
          </span>
          <button onClick={() => onLevelChange(level + 1)}
            className="w-7 h-7 rounded border-2 border-gray-700 bg-gray-800 text-gray-300 text-[13px] font-bold">＋</button>
          <span className="text-[9px] text-gray-500">に{tool === 'erase' ? 'あるものを消す' : '積む'}{level > 0 ? '（上空・すり抜け）' : '（地上・当たり判定あり）'}</span>
        </div>
      )}

      {/* パレット */}
      {paletteKind && (
        <div className="flex items-center gap-1 flex-wrap">
          {paletteKind === 'floor' && (
            <button onClick={() => setPaletteSel(0)}
              className={`w-7 h-7 rounded text-[9px] text-gray-300 bg-[#0d0a14] border-2 ${paletteSel === 0 ? 'border-yellow-400' : 'border-gray-700'}`}
              title="床なし（奈落）">×</button>
          )}
          {yume25dTexList(layout, paletteKind).map(t => (
            <button key={t.id} onClick={() => setPaletteSel(t.id)} title={t.name}
              className={`w-7 h-7 rounded border-2 flex items-center justify-center text-sm overflow-hidden ${paletteSel === t.id ? 'border-yellow-400' : 'border-gray-700'}`}
              style={{ background: t.imageUrl ? undefined : t.emoji ? '#1c1826' : t.color }}>
              {t.imageUrl && (paletteKind === 'sprite' || t.imageUrl.includes('#')) ? (
                // #sx,sy,sw,sh クロップ付きURL（システム床の内蔵シート切り出し）は CSS background では
                // 切り出せないため、クロップ対応の canvas サムネで描く
                <SpriteThumb t={t} />
              ) : t.imageUrl ? (
                <div className="w-full h-full" style={{ background: `url(${t.imageUrl}) center/contain no-repeat #1c1826` }} />
              ) : (t.emoji ?? '')}
            </button>
          ))}
        </div>
      )}

      {/* 会話設定：スプライトをタップして選択し、メッセージ/選択肢/はなせるかどうかを編集する */}
      {tool === 'talk' && (() => {
        const target = layout.billboards.find(b => b.id === talkTargetId);
        if (!target) return (
          <p className="text-[10px] text-gray-500 px-1">スプライトをタップして選択してください</p>
        );
        return (
          <div className="flex flex-col gap-1.5 rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 text-[10px] text-gray-300">
            <p className="text-[12px] font-bold text-gray-200">💬 会話・AI設定</p>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={!!target.interactive}
                onChange={e => onLayoutChange(l => ({ ...l, billboards: l.billboards.map(b => b.id === target.id ? { ...b, interactive: e.target.checked } : b) }))} />
              はなせる（「はなす」ボタンの対象にする）
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={!!target.collidable}
                onChange={e => onLayoutChange(l => ({ ...l, billboards: l.billboards.map(b => b.id === target.id ? { ...b, collidable: e.target.checked } : b) }))} />
              当たり判定あり（すり抜け不可）
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={!!target.through}
                onChange={e => onLayoutChange(l => ({ ...l, billboards: l.billboards.map(b => b.id === target.id ? { ...b, through: e.target.checked || undefined } : b) }))} />
              壁をすり抜ける（through）
            </label>
            <label className="flex items-center gap-1.5">AI行動
              <select value={target.behavior ?? 'still'}
                onChange={e => { const behavior = e.target.value as NpcBehavior; onLayoutChange(l => ({ ...l, billboards: l.billboards.map(b => b.id === target.id ? { ...b, behavior } : b) })); }}
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-white">
                <option value="still">静止 (Still)</option>
                <option value="random">ランダム移動 (Random)</option>
                <option value="randomDash">ランダムダッシュ (Random Dash)</option>
                <option value="randomHop">ランダムジャンプ (Random Hop)</option>
                <option value="chase">追いかける (Chase Player)</option>
                <option value="flee">逃げる (Flee Player)</option>
                <option value="patrolH">左右巡回 (Patrol H)</option>
                <option value="patrolV">前後巡回 (Patrol V)</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">メッセージ
              <input type="text" value={target.message ?? ''} placeholder="……"
                onChange={e => onLayoutChange(l => ({ ...l, billboards: l.billboards.map(b => b.id === target.id ? { ...b, message: e.target.value } : b) }))}
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-white" />
            </label>
            <label className="flex items-center gap-1.5">選択肢（カンマ区切り）
              <input type="text" value={(target.choices ?? []).join(',')}
                onChange={e => { const v = e.target.value; const choices = v.trim() ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined; onLayoutChange(l => ({ ...l, billboards: l.billboards.map(b => b.id === target.id ? { ...b, choices } : b) })); }}
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-white" />
            </label>
          </div>
        );
      })()}

      {/* テクスチャ個別設定 */}
      {paletteSel !== 0 && (() => {
        const t = layout.textures[paletteSel];
        if (!t) return null;
        return (
          <div className="flex flex-col gap-1.5 rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 text-[10px] text-gray-300">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-gray-200 flex items-center gap-1.5">
                {t.imageUrl || t.imageRef ? (
                  <span className="w-5 h-5 shrink-0 rounded overflow-hidden inline-flex items-center justify-center bg-black/40 border border-gray-700">
                    <AssetThumb refStr={t.imageRef || t.imageUrl || ''} url={t.imageUrl} size={20} />
                  </span>
                ) : (
                  <span className="w-3.5 h-3.5 rounded shrink-0 border border-gray-600 inline-block" style={{ backgroundColor: t.color }} />
                )}
                🎨 {t.name} の設定
              </span>
              {t.special && (
                <button onClick={() => deleteFloorTex(t.id)}
                  className="px-2 py-1 rounded text-gray-400 hover:text-red-400 hover:bg-red-500/10">
                  削除
                </button>
              )}
            </div>
            {t.special === 'warp' && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-gray-400">ワープ先</span>
                <label className="flex items-center gap-1">X(列)
                  <input type="number" min={0} max={layout.cols - 1} value={t.warpDest?.col ?? 0}
                    onChange={e => { const col = Math.max(0, Math.min(layout.cols - 1, Number(e.target.value) || 0)); onLayoutChange(l => ({ ...l, textures: { ...l.textures, [t.id]: { ...l.textures[t.id], warpDest: { ...(l.textures[t.id].warpDest ?? { col: 0, row: 0 }), col } } } })); }}
                    className="w-14 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-white" />
                </label>
                <label className="flex items-center gap-1">Y(行)
                  <input type="number" min={0} max={layout.rows - 1} value={t.warpDest?.row ?? 0}
                    onChange={e => { const row = Math.max(0, Math.min(layout.rows - 1, Number(e.target.value) || 0)); onLayoutChange(l => ({ ...l, textures: { ...l.textures, [t.id]: { ...l.textures[t.id], warpDest: { ...(l.textures[t.id].warpDest ?? { col: 0, row: 0 }), row } } } })); }}
                    className="w-14 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-white" />
                </label>
                <label className="flex items-center gap-1">向き
                  <select value={t.warpDest?.dir ?? ''}
                    onChange={e => { const dir = e.target.value === '' ? undefined : Number(e.target.value) as Dir4; onLayoutChange(l => ({ ...l, textures: { ...l.textures, [t.id]: { ...l.textures[t.id], warpDest: { ...(l.textures[t.id].warpDest ?? { col: 0, row: 0 }), dir } } } })); }}
                    className="bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-white">
                    <option value="">そのまま</option>
                    <option value={0}>北（上）</option>
                    <option value={1}>東（右）</option>
                    <option value={2}>南（下）</option>
                    <option value={3}>西（左）</option>
                  </select>
                </label>
                <span className="text-[9px] text-gray-500 w-full">ふむと同じマップ内の指定マスへ転送します（暗転演出つき）</span>
              </div>
            )}
            {t.special === 'damage' && (
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1">ダメージ量
                  <input type="number" min={1} max={6} value={t.damageAmount ?? 3}
                    onChange={e => { const damageAmount = Math.max(1, Math.min(6, Number(e.target.value) || 3)); onLayoutChange(l => ({ ...l, textures: { ...l.textures, [t.id]: { ...l.textures[t.id], damageAmount } } })); }}
                    className="w-14 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-white" />
                </label>
                <span className="text-[9px] text-gray-500 w-full">ふむとHP（ハート6=3個）がへります。HPがなくなると ゆめから さめて スタート地点にもどります（ジャンプで飛び越えられます）</span>
              </div>
            )}
            {t.special?.startsWith('ice-') && (
              <p className="text-[9px] text-gray-500">ふむと矢印の方向へ強制的にすべります。壁に当たると止まります（ジャンプで飛び越えられます）</p>
            )}
            {t.special === 'ball' && (
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1">大きさ（半径）
                  <input type="range" min={0.1} max={0.8} step={0.05} value={t.ballRadius ?? 0.22}
                    onChange={e => onLayoutChange(l => ({ ...l, textures: { ...l.textures, [t.id]: { ...l.textures[t.id], ballRadius: Number(e.target.value) } } }))} className="w-20" />
                  <span className="text-gray-400">{(t.ballRadius ?? 0.22).toFixed(2)}マス</span>
                </label>
                <p className="text-[9px] text-gray-500">模様なしの球体（色は「色」設定）。触れると蹴った方向へ転がり、常に重力で落下・バウンドします。壁やマップ端で跳ね返り、だんだん減速して止まります。2段目以上に置くと落ちてきます（リスタートで元の位置に戻ります）</p>
              </div>
            )}
            {t.special === 'block' && (
              <p className="text-[9px] text-gray-500">一辺1マスの立方体（サイズ固定）。上に乗れて、歩くと1段まで自動でよじ登れます。「高さ」を上げて配置すると積み上げられます。画像参照でテクスチャも貼れます</p>
            )}
            {t.modelUrl && (
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1">大きさ
                  <input type="range" min={0.25} max={4} step={0.25} value={t.modelScale ?? 1}
                    onChange={e => onLayoutChange(l => ({ ...l, textures: { ...l.textures, [t.id]: { ...l.textures[t.id], modelScale: Number(e.target.value) } } }))} className="w-20" />
                  <span className="text-gray-400">{(t.modelScale ?? 1).toFixed(2)}マス</span>
                </label>
                <p className="text-[9px] text-gray-500 break-all">サンプル3Dモデル（CDN読み込み）：{t.modelUrl.replace('https://cdn.jsdelivr.net/gh/', '')}。当たり判定はありません（すり抜け）。「高さ」を上げると宙に浮かせられます</p>
              </div>
            )}
            {t.special === 'speaker' && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-gray-400">音源</span>
                  <span className="flex-1 min-w-0 truncate text-gray-400">{t.sound?.ref ? t.sound.ref.slice(0, 36) : '未設定'}</span>
                  {t.sound && (
                    <button onClick={() => onLayoutChange(l => ({ ...l, textures: { ...l.textures, [t.id]: { ...l.textures[t.id], sound: undefined } } }))}
                      className="px-2 py-1 rounded text-gray-400 hover:text-red-400 hover:bg-red-500/10">
                      消去
                    </button>
                  )}
                  <button onClick={() => onPickImage?.({ t: 'yumeTexSound', id: t.id })}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:text-blue-300">
                    <Music size={12} /> 音源を参照
                  </button>
                </div>
                {t.sound?.ref && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-1">届く距離
                      <input type="range" min={2} max={20} step={1} value={t.sound.radius ?? 8}
                        onChange={e => onLayoutChange(l => ({ ...l, textures: { ...l.textures, [t.id]: { ...l.textures[t.id], sound: { ...l.textures[t.id].sound!, radius: Number(e.target.value) } } } }))} className="w-20" />
                      <span className="text-gray-400">{t.sound.radius ?? 8}マス</span>
                    </label>
                    <label className="flex items-center gap-1">音量
                      <input type="range" min={0.1} max={1} step={0.05} value={t.sound.volume ?? 0.7}
                        onChange={e => onLayoutChange(l => ({ ...l, textures: { ...l.textures, [t.id]: { ...l.textures[t.id], sound: { ...l.textures[t.id].sound!, volume: Number(e.target.value) } } } }))} className="w-20" />
                    </label>
                  </div>
                )}
                <p className="text-[9px] text-gray-500">近づくと聞こえ、離れるほど小さくなります（距離減衰は (1−d/距離)² の近似）。直リンク音源（RPGen効果音など）のみ再生できます。プレイ中のみ鳴ります</p>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1">名前:
                <input type="text" value={t.name}
                  onChange={e => onLayoutChange(l => ({ ...l, textures: { ...l.textures, [t.id]: { ...l.textures[t.id], name: e.target.value } } }))}
                  className="w-24 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-white" />
              </label>
              {t.kind === 'sprite' && (
                <label className="flex items-center gap-1">絵文字:
                  <input type="text" value={t.emoji ?? ''} maxLength={2}
                    onChange={e => onLayoutChange(l => ({ ...l, textures: { ...l.textures, [t.id]: { ...l.textures[t.id], emoji: e.target.value || undefined } } }))}
                    className="w-10 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-white text-center" />
                </label>
              )}
              <label className="flex items-center gap-1">色:
                <input type="color" value={t.color}
                  onChange={e => onLayoutChange(l => ({ ...l, textures: { ...l.textures, [t.id]: { ...l.textures[t.id], color: e.target.value } } }))}
                  className="w-6 h-4 bg-transparent cursor-pointer" />
              </label>

              <div className="flex items-center gap-1.5 ml-auto">
                {t.imageUrl || t.imageRef ? (
                  <div className="relative shrink-0 w-8 h-8 rounded border border-gray-700 bg-black/40 overflow-hidden flex items-center justify-center">
                    <AssetThumb refStr={t.imageRef || t.imageUrl || ''} url={t.imageUrl} size={32} />
                  </div>
                ) : null}
                {t.imageUrl && (
                  <button onClick={() => onLayoutChange(l => ({ ...l, textures: { ...l.textures, [t.id]: { ...l.textures[t.id], imageRef: undefined, imageUrl: undefined } } }))}
                    className="px-2 py-1 rounded text-gray-400 hover:text-red-400 hover:bg-red-500/10">
                    画像消去
                  </button>
                )}
                <button onClick={() => onPickImage?.({ t: 'yumeTex', id: t.id })}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:text-blue-300 font-bold">
                  <ImageIcon size={12} /> {t.imageRef ? '画像を変更' : '画像を参照'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── システムオブジェクト（ワープ床・どく沼/ダメージ床・つるつる床）──
          2Dエンジンのシステムタイルの yume25d 版。special 付きの床テクスチャとして追加し、
          床ツールで塗る。ワープはマップ内転送・ダメージは「めがさめる」に読み替える。 */}
      <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 space-y-2">
        <p className="text-[12px] font-bold text-gray-200">⚙️ システムオブジェクト</p>
        <p className="text-[10px] text-gray-500">クリックで床パレットに追加されます。床ツールでマップに塗ってください。ワープ床は同じマップ内の指定マスへ転送、どく沼/ダメージ床はふむと ゆめから さめてスタートへ、つるつる床は矢印の方向へすべります（いずれもジャンプで飛び越え可）。</p>
        <div className="grid grid-cols-2 gap-1.5">
          {SYSTEM_TILE_TEMPLATES.map(tpl => (
            <button key={tpl.key} onClick={() => addSystemFloorTex(tpl)}
              className="flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-gray-600 text-[10px] text-gray-400 hover:bg-gray-100/5">
              <Plus size={11} />{sysTileLabel(tpl)}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-500 pt-1.5 mt-1 border-t border-gray-700/50">遊べるオブジェクト：スプライトパレットに追加され、スプライトツールで配置します。ボールは蹴って転がせて、スピーカーは設定した音源が近づくと聞こえます。食べ物は触れると食べて空腹ゲージを回復します（設定の「空腹ゲージ」ON時）。</p>
        <div className="grid grid-cols-2 gap-1.5">
          {SYSTEM_SPRITE_TEMPLATES.map(tpl => (
            <button key={tpl.key} onClick={() => addSystemSpriteTex(tpl)}
              className="flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-gray-600 text-[10px] text-gray-400 hover:bg-gray-100/5">
              <Plus size={11} />{tpl.emoji} {tpl.label}
            </button>
          ))}
          <button onClick={() => { setModelQuery(''); setModelSearchOpen(true); }}
            className="col-span-2 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-gray-600 text-[10px] text-gray-400 hover:bg-gray-100/5">
            <Plus size={11} />🗿 3Dモデル（キーワード検索）
          </button>
        </div>
        {/* マイクラスキン：Slim型スキン画像からブロック人形の3Dキャラを組み立てる。
            プリセット／画像URL／アップロード画像（参照）のどれでも追加できる */}
        <p className="text-[10px] text-gray-500 pt-1.5 mt-1 border-t border-gray-700/50">マイクラスキン：Minecraft のスキン画像（Slim型・64×64）からブロック人形の3Dキャラを作ってスプライトとして配置できます。歩くと手足を振ります。</p>
        <div className="grid grid-cols-2 gap-1.5">
          {MINECRAFT_SKIN_PRESETS.map(p => (
            <button key={p.name} onClick={() => addMinecraftSkinTex(p.name, p.url)}
              className="flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-gray-600 text-[10px] text-gray-400 hover:bg-gray-100/5">
              <Plus size={11} />👗 {p.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <input value={mcSkinUrl} onChange={e => setMcSkinUrl(e.target.value)} placeholder="スキン画像URL（64×64）"
            className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-[10px] text-white outline-none" />
          <button onClick={() => { const u = mcSkinUrl.trim(); if (u) { addMinecraftSkinTex('マイクラスキン', u); setMcSkinUrl(''); } }}
            className="px-2 py-1 rounded bg-blue-600 text-white text-[10px] font-bold">追加</button>
          <button onClick={() => onPickImage?.({ t: 'yumeMcSkin' })}
            className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:text-blue-300 text-[10px]">
            <ImageIcon size={12} /> 参照
          </button>
        </div>
      </div>

      {/* サンプル3Dモデルの検索モーダル：three.js / glTF-Sample-Assets の公式サンプルをキーワードで絞り込む */}
      {modelSearchOpen && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4"
          onClick={() => setModelSearchOpen(false)}>
          <div className="w-full max-w-md max-h-[75vh] bg-[#12121c] border border-gray-700 rounded-lg p-3 flex flex-col gap-2"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-gray-200">🗿 サンプル3Dモデルをさがす</span>
              <button onClick={() => setModelSearchOpen(false)}
                className="px-2 py-0.5 text-gray-400 hover:text-white text-sm">×</button>
            </div>
            <input
              autoFocus type="text" value={modelQuery}
              onChange={e => setModelQuery(e.target.value)}
              placeholder="キーワード（例: 鳥 / robot / くるま）"
              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-[12px] text-white outline-none focus:border-blue-500"
            />
            <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-1.5 content-start">
              {searchModels(modelQuery).map(m => (
                <button key={m.key} onClick={() => addModelTex(m)}
                  className="flex flex-col items-start gap-0.5 px-2 py-1.5 rounded-lg border border-gray-700 bg-gray-800/70 hover:bg-blue-900/30 hover:border-blue-600 text-left">
                  <span className="text-[11px] text-gray-100">{m.emoji} {m.label}</span>
                  <span className="text-[8px] text-gray-500">{m.source === 'three.js' ? 'three.js examples' : 'glTF-Sample-Assets'}</span>
                </button>
              ))}
              {searchModels(modelQuery).length === 0 && (
                <p className="col-span-2 text-[10px] text-gray-500 py-3 text-center">みつかりませんでした</p>
              )}
            </div>
            <p className="text-[9px] text-gray-500">three.js / Khronos の公式サンプルモデルを CDN（jsDelivr）から読み込みます。選ぶとスプライトパレットに追加され、スプライトツールで配置できます</p>
          </div>
        </div>
      )}

      {/* 設定パネル：他タブのセクションと同じ「見出し＋グループ」構成で並べる */}
      {settingsOpen && (
        <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 space-y-2 text-[10px] text-gray-300">
          <p className="text-[12px] font-bold text-gray-200">⚙️ ワールド設定</p>

          {/* マップ：広さ・壁・天井・ジャンプ */}
          <p className="font-bold text-gray-400">🗺️ マップ</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <label className="flex items-center justify-between gap-1">広さ(列)
              <input type="number" min={4} max={48} value={layout.cols}
                onChange={e => { const cols = Math.max(4, Math.min(48, Number(e.target.value) || 4)); onLayoutChange(l => ({ ...l, cols, floor: yume25dResizeFloor(l.floor, cols, l.rows), walls: l.walls.filter(w => w.col <= cols - (w.dir === 3 ? 0 : 1) && w.col >= 0), billboards: l.billboards.filter(b => b.col < cols), start: { ...l.start, col: Math.min(l.start.col, cols - 1) } })); }}
                className="w-14 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-white" />
            </label>
            <label className="flex items-center justify-between gap-1">広さ(行)
              <input type="number" min={4} max={48} value={layout.rows}
                onChange={e => { const rows = Math.max(4, Math.min(48, Number(e.target.value) || 4)); onLayoutChange(l => ({ ...l, rows, floor: yume25dResizeFloor(l.floor, l.cols, rows), walls: l.walls.filter(w => w.row <= rows - (w.dir === 0 ? 0 : 1) && w.row >= 0), billboards: l.billboards.filter(b => b.row < rows), start: { ...l.start, row: Math.min(l.start.row, rows - 1) } })); }}
                className="w-14 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-white" />
            </label>
            <label className="flex items-center justify-between gap-1">壁の高さ
              <input type="range" min={0.5} max={2} step={0.1} value={layout.wallHeight}
                onChange={e => onLayoutChange(l => ({ ...l, wallHeight: Number(e.target.value) }))} className="w-20" />
            </label>
            <label className="flex items-center justify-between gap-1">天井
              <input type="checkbox" checked={layout.ceiling}
                onChange={e => onLayoutChange(l => ({ ...l, ceiling: e.target.checked }))} />
            </label>
            <label className="flex items-center justify-between gap-1">ジャンプ高さ
              <input type="number" min={0.5} max={12} step={0.1} value={layout.jumpHeight ?? 3.2}
                onChange={e => onLayoutChange(l => ({ ...l, jumpHeight: Math.max(0.5, Math.min(12, Number(e.target.value) || 3.2)) }))}
                className="w-14 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-white" />
            </label>
          </div>

          {/* 視点 */}
          <p className="font-bold text-gray-400 pt-1.5 mt-1 border-t border-gray-700/50">👁️ 視点</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <label className="flex items-center justify-between gap-1 col-span-2">視点
              <span className="flex overflow-hidden rounded border border-gray-600">
                {(['first', 'third'] as const).map(m => (
                  <button key={m} onClick={() => onLayoutChange(l => ({ ...l, pov: m }))}
                    className={`px-2 py-0.5 text-[10px] font-bold ${(layout.pov ?? 'first') === m ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                    {m === 'first' ? '一人称' : '三人称'}
                  </button>
                ))}
              </span>
            </label>
            {(layout.pov ?? 'first') === 'third' && (
              <SliderField label="カメラ距離" value={layout.povDistance ?? 1.6} min={0.4} max={3.5} step={0.1}
                onChange={v => onLayoutChange(l => ({ ...l, povDistance: v }))} />
            )}
          </div>

          {/* グラフィック：シェーダーMod プリセットと時間帯。以降は見た目まわりの設定が続く */}
          <p className="font-bold text-yellow-400 pt-1.5 mt-1 border-t border-gray-700/50">✨ グラフィック（Minecraft Shader Mods）</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <WideField label="シェーダープリセット">
              <select value={layout.shaderPreset ?? 'bsl'}
                onChange={e => onLayoutChange(l => ({ ...l, shaderPreset: e.target.value as 'bsl' | 'seus' | 'complementary' | 'vanilla' }))}
                className="w-full bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-white">
                <option value="bsl">🌅 BSL Shaders（夕焼け・温かな太陽光）</option>
                <option value="seus">🌌 SEUS Shaders（月光・ドラマチック）</option>
                <option value="complementary">⚡ Complementary（鮮やか・高コントラスト）</option>
                <option value="vanilla">🧱 Vanilla（クラシック・補正なし）</option>
              </select>
            </WideField>
            <WideField label="時間帯（光と空の色）">
              <select value={yume25dTimeOfDay(layout)}
                onChange={e => onLayoutChange(l => ({ ...l, timeOfDay: e.target.value as 'sunset' | 'day' | 'night' }))}
                className="w-full bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-white">
                <option value="sunset">🌆 夕焼け（Golden Hour）</option>
                <option value="day">☀️ 昼（Daylight）</option>
                <option value="night">🌙 夜（Midnight）</option>
              </select>
            </WideField>
            <label className="flex items-center justify-between gap-1">リアルタイム影
              <input type="checkbox" disabled={!!layout.sunHidden}
                checked={!layout.sunHidden && layout.shadowsEnabled !== false}
                onChange={e => onLayoutChange(l => ({ ...l, shadowsEnabled: e.target.checked }))} />
            </label>
            <label className="flex items-center justify-between gap-1">光彩ブルーム
              <input type="checkbox" checked={layout.bloomEnabled !== false}
                onChange={e => onLayoutChange(l => ({ ...l, bloomEnabled: e.target.checked }))} />
            </label>
          </div>

          {/* 太陽・月：空のどこに出すか。隠すと太陽光も影も無くなる */}
          <p className="font-bold text-gray-400 pt-1.5 mt-1 border-t border-gray-700/50">
            {yume25dTimeOfDay(layout) === 'night' ? '🌙 月' : '☀️ 太陽'}の位置
          </p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <label className="flex items-center justify-between gap-1 col-span-2">空に出す
              <input type="checkbox" checked={!layout.sunHidden}
                onChange={e => onLayoutChange(l => ({ ...l, sunHidden: e.target.checked ? undefined : true }))} />
            </label>
            {!layout.sunHidden && (
              <>
                <SliderField label="向き（方位）" value={sunAngles.azimuth} min={0} max={359} suffix="°"
                  onChange={v => onLayoutChange(l => ({ ...l, sunAzimuth: v }))} />
                <SliderField label="高さ（仰角）" value={sunAngles.elevation} min={0} max={90} suffix="°"
                  onChange={v => onLayoutChange(l => ({ ...l, sunElevation: v }))} />
                <p className="col-span-2 text-[9px] text-gray-500">
                  向きは {sunAngles.azimuth}°＝{compassName(sunAngles.azimuth)}（0°=北・90°=東・180°=南・270°=西）。
                  高さは 0°で地平線すれすれ（影が長く伸びる）、90°で真上（影が足元に落ちる）。
                </p>
              </>
            )}
            {layout.sunHidden && (
              <p className="col-span-2 text-[9px] text-gray-500">
                空から{yume25dTimeOfDay(layout) === 'night' ? '月' : '太陽'}が消え、太陽光と影も無くなります。
                下の「照明」の明るさだけで照らす、影のない平らな光になります（曇り空・夢の中のような見た目）
              </p>
            )}
          </div>

          {/* 照明：環境光の明るさ（1=テクスチャそのままのフルブライト）とランタン */}
          <p className="font-bold text-gray-400 pt-1.5 mt-1 border-t border-gray-700/50">💡 照明</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <label className="flex items-center justify-between gap-1">明るさ
              <input type="range" min={0.1} max={2} step={0.05} value={layout.ambientLight ?? yume25dAmbientDefault(layout)}
                onChange={e => onLayoutChange(l => ({ ...l, ambientLight: Number(e.target.value) }))} className="w-20" />
            </label>
            <label className="flex items-center justify-between gap-1">光の色
              <input type="color" value={layout.ambientColor ?? '#ffffff'}
                onChange={e => onLayoutChange(l => ({ ...l, ambientColor: e.target.value }))} className="w-8 h-5 bg-transparent" />
            </label>
            {/* プレイヤー光源（ランタン）：暗くした夢空間で足元だけ照らす演出用 */}
            <label className="flex items-center justify-between gap-1 col-span-2">ランタン（プレイヤー光源）
              <input type="checkbox" checked={!!layout.playerLight?.enabled}
                onChange={e => onLayoutChange(l => ({ ...l, playerLight: { ...l.playerLight, enabled: e.target.checked } }))} />
            </label>
            {layout.playerLight?.enabled && (
              <>
                <label className="flex items-center justify-between gap-1">光源の色
                  <input type="color" value={layout.playerLight.color ?? '#ffd9a0'}
                    onChange={e => onLayoutChange(l => ({ ...l, playerLight: { ...l.playerLight!, color: e.target.value } }))} className="w-8 h-5 bg-transparent" />
                </label>
                <label className="flex items-center justify-between gap-1">光源の強さ
                  <input type="range" min={0.2} max={3} step={0.1} value={layout.playerLight.intensity ?? 1}
                    onChange={e => onLayoutChange(l => ({ ...l, playerLight: { ...l.playerLight!, intensity: Number(e.target.value) } }))} className="w-20" />
                </label>
                <label className="flex items-center justify-between gap-1 col-span-2">光の届く距離
                  <input type="range" min={2} max={20} step={1} value={layout.playerLight.distance ?? 8}
                    onChange={e => onLayoutChange(l => ({ ...l, playerLight: { ...l.playerLight!, distance: Number(e.target.value) } }))} className="w-28" />
                </label>
              </>
            )}
          </div>

          {/* 空と霧：空の色・霧・背景パノラマ */}
          <p className="font-bold text-gray-400 pt-1.5 mt-1 border-t border-gray-700/50">🌫️ 空と霧</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <label className="flex items-center justify-between gap-1">空の色
              <input type="color" value={layout.skyColor}
                onChange={e => onLayoutChange(l => ({ ...l, skyColor: e.target.value }))} className="w-8 h-5 bg-transparent" />
            </label>
            <label className="flex items-center justify-between gap-1">霧の色
              <input type="color" value={layout.fogColor}
                onChange={e => onLayoutChange(l => ({ ...l, fogColor: e.target.value }))} className="w-8 h-5 bg-transparent" />
            </label>
            <label className="flex items-center justify-between gap-1">霧の距離
              <input type="range" min={3} max={30} step={1} value={layout.fogFar}
                onChange={e => onLayoutChange(l => ({ ...l, fogFar: Number(e.target.value), fogNear: Math.min(l.fogNear, Number(e.target.value) - 1) }))} className="w-20" />
            </label>
            {/* 背景画像：横360°の円筒パノラマ。上下の余白には空の色が見える */}
            <div className="flex items-center justify-between gap-1 col-span-2">
              <span>背景画像（360°パノラマ）{layout.skyUrl ? '：設定中' : '：なし'}</span>
              <span className="flex items-center gap-1">
                {layout.skyUrl && (
                  <button onClick={() => onLayoutChange(l => ({ ...l, skyRef: undefined, skyUrl: undefined }))}
                    className="px-2 py-1 rounded text-gray-400 hover:text-red-400 hover:bg-red-500/10">
                    消去
                  </button>
                )}
                <button onClick={() => onPickImage?.({ t: 'yumeSky' })}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:text-blue-300">
                  <ImageIcon size={12} /> 画像を参照
                </button>
              </span>
            </div>
          </div>

          {/* 海：この高さから下がすべて水（溶岩）になる（0=なし）。プレイヤーは泳げる */}
          <p className="font-bold text-gray-400 pt-1.5 mt-1 border-t border-gray-700/50">🌊 海</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <label className="flex items-center justify-between gap-1">水面の高さ
              <input type="range" min={0} max={3} step={0.05} value={layout.waterLevel ?? 0}
                onChange={e => onLayoutChange(l => ({ ...l, waterLevel: Number(e.target.value) || undefined }))} className="w-20" />
            </label>
            <label className="flex items-center justify-between gap-1">種類
              <select value={layout.waterKind ?? 'water'}
                onChange={e => onLayoutChange(l => ({ ...l, waterKind: e.target.value === 'lava' ? 'lava' : undefined }))}
                className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 outline-none">
                <option value="water">水</option>
                <option value="lava">溶岩</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-1">{layout.waterKind === 'lava' ? '溶岩の色' : '水の色'}
              <input type="color" value={layout.waterColor ?? (layout.waterKind === 'lava' ? '#d35400' : '#2f7fa8')}
                onChange={e => onLayoutChange(l => ({ ...l, waterColor: e.target.value }))} className="w-8 h-5 bg-transparent" />
            </label>
            {(layout.waterLevel ?? 0) > 0 && (
              <>
                {/* 水没ダメージ：浸かっている間の継続ダメージを対象別にON/OFF（溶岩はダメージ倍） */}
                <p className="col-span-2 text-gray-400">水没ダメージ（浸かっている間）</p>
                <label className="flex items-center justify-between gap-1">プレイヤー
                  <input type="checkbox" checked={!!layout.waterDamage?.player}
                    onChange={e => onLayoutChange(l => ({ ...l, waterDamage: { ...l.waterDamage, player: e.target.checked } }))} />
                </label>
                <label className="flex items-center justify-between gap-1">NPC（敵以外）
                  <input type="checkbox" checked={!!layout.waterDamage?.npc}
                    onChange={e => onLayoutChange(l => ({ ...l, waterDamage: { ...l.waterDamage, npc: e.target.checked } }))} />
                </label>
                <label className="flex items-center justify-between gap-1">敵（追尾の住人）
                  <input type="checkbox" checked={!!layout.waterDamage?.enemy}
                    onChange={e => onLayoutChange(l => ({ ...l, waterDamage: { ...l.waterDamage, enemy: e.target.checked } }))} />
                </label>
                <label className="flex items-center justify-between gap-1">酸素ゲージ
                  <input type="checkbox" checked={!!layout.oxygen}
                    onChange={e => onLayoutChange(l => ({ ...l, oxygen: e.target.checked || undefined }))} />
                </label>
                <p className="col-span-2 text-[9px] text-gray-500">
                  水面の高さ {(layout.waterLevel ?? 0).toFixed(2)} マスから下が{layout.waterKind === 'lava' ? '溶岩' : '海'}になります。水中はゆっくり沈み、ジャンプ入力のひとかきで上昇して泳げます。
                  水没ダメージをONにすると浸かっている間じわじわダメージ（溶岩は倍）。住人はしばらく浸かると倒れて消えます（リスポーンで復活）。
                  酸素ゲージをONにすると頭まで潜って約10秒で息が尽き、窒息ダメージが始まります。水面に出れば回復します
                </p>
              </>
            )}
          </div>

          {/* サバイバル：空腹ゲージ（Minecraft風）。「食べ物」スプライト（オブジェタブ）で回復する */}
          <p className="font-bold text-gray-400 pt-1.5 mt-1 border-t border-gray-700/50">🍖 サバイバル</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <label className="flex items-center justify-between gap-1 col-span-2">空腹ゲージ（Minecraft風）
              <input type="checkbox" checked={!!layout.hunger}
                onChange={e => onLayoutChange(l => ({ ...l, hunger: e.target.checked || undefined }))} />
            </label>
            {layout.hunger && (
              <p className="col-span-2 text-[9px] text-gray-500">
                方向キー2回押し（またはShift/DASHボタン）でダッシュでき、ダッシュ中は🍗ゲージがすこしずつ減ります。
                🍗3個以下になると走れず、0になると1ハートまで飢餓ダメージ。🍗9個以上あるとHPが自然回復します。
                オブジェタブの「🍖 食べ物」スプライトに触れると回復します
              </p>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
