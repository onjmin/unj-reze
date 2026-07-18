'use client';

// yume25d（ゆめにっき3D）の編集パネル。かつては Yume25DMaker 内でキャンバスに重ねる
// absolute オーバーレイだったが、GameMaker のサイドバーへ吸収し縦積みのリストとして表示する。

import { useEffect, useRef, useState } from 'react';
import { Plus, Image as ImageIcon, Music } from 'lucide-react';
import { type Yume25DTool, YUME25D_TOOL_LABELS, yume25dTexList, yume25dResizeFloor } from './Yume25DMaker';
import {
  type Layout25D, type Tex25D, type Dir4, type NpcBehavior,
  SYSTEM_TILE_TEMPLATES, type SystemTileTemplate,
  SYSTEM_SPRITE_TEMPLATES, type SystemSpriteTemplate,
} from './game-presets/shared';
import { searchModels, type ModelCatalogEntry } from './game-presets/model-catalog';
import { drawPlayerIconCanvas } from '@/lib/yume25d';
import { billboardGroups, canShiftGroup, shiftBillboardGroup, generateYumeTerrain } from '@/lib/yume25d-macros';
import type { TerrainWater } from '@/lib/terrain-gen';

/** スプライトパレットのサムネ。歩行グラ（walk:参照）なら正面(下向き)1コマ目だけを切り出して表示する。 */
function SpriteThumb({ t }: { t: Tex25D }) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    cv.width = 64; cv.height = 64;
    drawPlayerIconCanvas(cv, { emoji: t.emoji, color: t.color, spriteUrl: t.imageUrl, spriteRef: t.imageRef }, () => {});
  }, [t.imageUrl, t.imageRef, t.emoji, t.color]);
  return <canvas ref={cvRef} className="w-full h-full" style={{ imageRendering: 'pixelated' }} />;
}

interface Yume25DEditorPanelProps {
  layout: Layout25D;
  onLayoutChange: (updater: (l: Layout25D) => Layout25D) => void;
  onPickImage?: (target: { t: 'yumeTex'; id: number } | { t: 'yumeSky' } | { t: 'yumeTexSound'; id: number }) => void;
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

  // マクロ（一括編集）パネル：同じ見た目のスプライト/3Dモデルのグループをまとめて動かす
  const [macroOpen, setMacroOpen] = useState(false);
  const [macroTex, setMacroTex] = useState(0);
  const macroGroups = billboardGroups(layout);
  // 選択中のグループが消えていたら（削除・全消去）先頭グループへフォールバック
  const macroSel = macroGroups.some(g => g.tex === macroTex) ? macroTex : (macroGroups[0]?.tex ?? 0);
  const runShiftMacro = (dc: number, dr: number, dlv = 0) =>
    onLayoutChange(l => shiftBillboardGroup(l, macroSel, dc, dr, dlv));
  // 地形自動生成マクロ：押すたびにランダムシードで生成し直す
  const [terrainWater, setTerrainWater] = useState<TerrainWater>('mid');
  const runTerrainMacro = () =>
    onLayoutChange(l => generateYumeTerrain(l, (Math.random() * 0xffffffff) >>> 0, terrainWater));

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

          {/* 地形自動生成：パーリンノイズで床＋草ブロックの丘＋木を丸ごと作る */}
          <p className="font-bold text-gray-400">🌍 地形の自動生成</p>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5">水の量
              <select value={terrainWater} onChange={e => setTerrainWater(e.target.value as TerrainWater)}
                className="bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-white">
                <option value="low">少なめ</option>
                <option value="mid">ふつう</option>
                <option value="high">多め</option>
              </select>
            </label>
            <button onClick={runTerrainMacro}
              className="px-2.5 py-1 rounded border-2 border-gray-600 bg-blue-600 text-white text-[11px] font-bold">
              🎲 地形を生成
            </button>
          </div>
          <p className="text-[9px] text-gray-500">マイクラと同じパーリンノイズで、床を 海・砂浜・草原 に塗り分け、丘は草ブロックを積み、森に🌲を立てます（内蔵素材を使用）。押すたびに別の地形になります。床と草ブロック/木は描き替えますが、ほかのスプライトは残ります。スタート周辺は平地になります</p>

          <p className="font-bold text-gray-400 pt-1.5 mt-1 border-t border-gray-700/50">↔️ グループ平行移動</p>
          {macroGroups.length === 0 ? (
            <p className="text-gray-500">マップにスプライト/3Dモデルが配置されていません。スプライトツールで配置すると、同じ見た目のグループをまとめて動かせます</p>
          ) : (
            <>
              <label className="flex items-center gap-1.5">対象グループ
                <select value={macroSel} onChange={e => setMacroTex(Number(e.target.value))}
                  className="flex-1 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-white">
                  {macroGroups.map(g => (
                    <option key={g.tex} value={g.tex}>{g.emoji ? `${g.emoji} ` : ''}{g.name} ×{g.count}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-gray-400">1マスずつ移動</span>
                  <div className="grid grid-cols-3 gap-0.5">
                    <span />
                    <button onClick={() => runShiftMacro(0, -1)} disabled={!canShiftGroup(layout, macroSel, 0, -1)}
                      className="w-8 h-8 rounded border-2 border-gray-700 bg-gray-800 text-gray-200 text-[13px] font-bold disabled:opacity-30">↑</button>
                    <span />
                    <button onClick={() => runShiftMacro(-1, 0)} disabled={!canShiftGroup(layout, macroSel, -1, 0)}
                      className="w-8 h-8 rounded border-2 border-gray-700 bg-gray-800 text-gray-200 text-[13px] font-bold disabled:opacity-30">←</button>
                    <button onClick={() => runShiftMacro(0, 1)} disabled={!canShiftGroup(layout, macroSel, 0, 1)}
                      className="w-8 h-8 rounded border-2 border-gray-700 bg-gray-800 text-gray-200 text-[13px] font-bold disabled:opacity-30">↓</button>
                    <button onClick={() => runShiftMacro(1, 0)} disabled={!canShiftGroup(layout, macroSel, 1, 0)}
                      className="w-8 h-8 rounded border-2 border-gray-700 bg-gray-800 text-gray-200 text-[13px] font-bold disabled:opacity-30">→</button>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-gray-400">高さ（段）</span>
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => runShiftMacro(0, 0, 1)} disabled={!canShiftGroup(layout, macroSel, 0, 0, 1)}
                      className="w-12 h-7 rounded border-2 border-gray-700 bg-gray-800 text-gray-200 text-[11px] font-bold disabled:opacity-30">＋1段</button>
                    <button onClick={() => runShiftMacro(0, 0, -1)} disabled={!canShiftGroup(layout, macroSel, 0, 0, -1)}
                      className="w-12 h-7 rounded border-2 border-gray-700 bg-gray-800 text-gray-200 text-[11px] font-bold disabled:opacity-30">−1段</button>
                  </div>
                </div>
              </div>
              <p className="text-[9px] text-gray-500">選んだグループ（同じ見た目のスプライト/3Dモデル全部）をまとめて1マスずつ平行移動します。1体でもマップ外に出てしまう方向へは動かせません（形は崩れません）</p>
            </>
          )}
        </div>
      )}

      {/* ツール：2D/3D どちらのビューでも使える（3Dはタップした視線の先のマスへ配置）。 */}
      <div className="flex items-center gap-1 flex-wrap">
        {(Object.keys(YUME25D_TOOL_LABELS) as Yume25DTool[]).map(t => (
          <button key={t} onClick={() => onToolChange(t)}
            className={`px-2 py-1 text-[11px] font-bold rounded ${tool === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
            {YUME25D_TOOL_LABELS[t]}
          </button>
        ))}
      </div>
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
            <label className="flex items-center gap-1.5">AI行動
              <select value={target.behavior ?? 'still'}
                onChange={e => { const behavior = e.target.value as NpcBehavior; onLayoutChange(l => ({ ...l, billboards: l.billboards.map(b => b.id === target.id ? { ...b, behavior } : b) })); }}
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-white">
                <option value="still">静止 (Still)</option>
                <option value="random">ランダム移動 (Random)</option>
                <option value="randomDash">ランダムダッシュ (Random Dash)</option>
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
            <label className="flex items-center gap-1.5">選択肢（,区切り）
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
              <span className="text-[12px] font-bold text-gray-200">🎨 {t.name} の設定</span>
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

              <div className="flex items-center gap-1 ml-auto">
                {t.imageUrl && (
                  <button onClick={() => onLayoutChange(l => ({ ...l, textures: { ...l.textures, [t.id]: { ...l.textures[t.id], imageRef: undefined, imageUrl: undefined } } }))}
                    className="px-2 py-1 rounded text-gray-400 hover:text-red-400 hover:bg-red-500/10">
                    画像消去
                  </button>
                )}
                <button onClick={() => onPickImage?.({ t: 'yumeTex', id: t.id })}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:text-blue-300">
                  <ImageIcon size={12} /> 画像を参照
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
        <p className="text-[10px] text-gray-500 pt-1.5 mt-1 border-t border-gray-700/50">遊べるオブジェクト：スプライトパレットに追加され、スプライトツールで配置します。ボールは蹴って転がせて、スピーカーは設定した音源が近づくと聞こえます。</p>
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
          <p className="font-bold text-gray-400">マップ</p>
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

          {/* 空と霧：空の色・霧・背景パノラマ */}
          <p className="font-bold text-gray-400 pt-1.5 mt-1 border-t border-gray-700/50">空と霧</p>
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

          {/* 海：この高さから下がすべて水になる（0=なし）。プレイヤーは泳げる */}
          <p className="font-bold text-gray-400 pt-1.5 mt-1 border-t border-gray-700/50">海</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <label className="flex items-center justify-between gap-1">水面の高さ
              <input type="range" min={0} max={3} step={0.05} value={layout.waterLevel ?? 0}
                onChange={e => onLayoutChange(l => ({ ...l, waterLevel: Number(e.target.value) || undefined }))} className="w-20" />
            </label>
            <label className="flex items-center justify-between gap-1">水の色
              <input type="color" value={layout.waterColor ?? '#2f7fa8'}
                onChange={e => onLayoutChange(l => ({ ...l, waterColor: e.target.value }))} className="w-8 h-5 bg-transparent" />
            </label>
            {(layout.waterLevel ?? 0) > 0 && (
              <p className="col-span-2 text-[9px] text-gray-500">水面の高さ {(layout.waterLevel ?? 0).toFixed(2)} マスから下が海になります。水中はゆっくり沈み、ジャンプ入力のひとかきで上昇して泳げます。ブロックを積めば水面から顔を出す足場が作れます</p>
            )}
          </div>

          {/* 照明：環境光の明るさ（1=テクスチャそのままのフルブライト）とランタン */}
          <p className="font-bold text-gray-400 pt-1.5 mt-1 border-t border-gray-700/50">照明</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <label className="flex items-center justify-between gap-1">明るさ
              <input type="range" min={0.1} max={2} step={0.05} value={layout.ambientLight ?? 1}
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

          {/* 視点 */}
          <p className="font-bold text-gray-400 pt-1.5 mt-1 border-t border-gray-700/50">視点</p>
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
              <label className="flex items-center justify-between gap-1 col-span-2">カメラ距離
                <input type="range" min={0.4} max={3.5} step={0.1} value={layout.povDistance ?? 1.6}
                  onChange={e => onLayoutChange(l => ({ ...l, povDistance: Number(e.target.value) }))} className="w-28" />
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
