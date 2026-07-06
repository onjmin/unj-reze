'use client';

// 2.5Dエンジン（yume25d）専用のエディタ＋プレイビュー。
// GameMaker.tsx の 2D キャンバスの代わりに描画エリアへ丸ごとはめ込む。
// 編集モード：2D 見下ろしグリッド（配置） ⇄ 3D プレビュー（歩行）をトグルで切替。
// プレイ/デモ：常に 3D。エンジン実体（WebGL）はマウント中1つを使い回し、アンマウントで dispose。

import { useCallback, useEffect, useRef, useState } from 'react';
import { Yume25DEngine, RENDER_W, RENDER_H, type PlayerAppearance } from '@/lib/yume25d';
import {
  type Layout25D, type Tex25D, type Dir4, uid, normalizeWall25D,
} from './game-presets/shared';

const CELL = 28;              // 2Dエディタの1マスpx
type Tool = 'floor' | 'wall' | 'sprite' | 'start' | 'erase';
const TOOL_LABELS: Record<Tool, string> = { floor: '床', wall: '壁', sprite: 'スプライト', start: '開始', erase: '消す' };
/** ドラッグ1pxあたりの回転量（ラジアン）。マウス・タッチ共通（Pointer Events）。 */
const DRAG_TURN_SENSITIVITY = 0.006;

interface Yume25DMakerProps {
  layout: Layout25D;
  onLayoutChange: (updater: (l: Layout25D) => Layout25D) => void;
  isPlaying: boolean;
  /** イントロカルーセルのデモ再生（自動走行） */
  demo?: boolean;
  /** 三人称視点で表示するプレイヤー自身の見た目。 */
  playerAppearance: PlayerAppearance;
}

const texList = (l: Layout25D, kind: Tex25D['kind']): Tex25D[] =>
  Object.values(l.textures).filter(t => t.kind === kind).sort((a, b) => a.id - b.id);

/** グリッドを新サイズへ切り詰め/拡張（拡張部は 0 埋め）。 */
const resizeFloor = (floor: number[][], cols: number, rows: number): number[][] =>
  Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => floor[r]?.[c] ?? 0));

export default function Yume25DMaker({ layout, onLayoutChange, isPlaying, demo, playerAppearance }: Yume25DMakerProps) {
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const edCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Yume25DEngine | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const [view, setView] = useState<'2d' | '3d'>('2d');
  const [tool, setTool] = useState<Tool>('wall');
  const [selFloor, setSelFloor] = useState(() => texList(layout, 'floor')[0]?.id ?? 0);
  const [selWall, setSelWall] = useState(() => texList(layout, 'wall')[0]?.id ?? 0);
  const [selSprite, setSelSprite] = useState(() => texList(layout, 'sprite')[0]?.id ?? 0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const playing = isPlaying || !!demo;
  const is3d = playing || view === '3d';

  // ── 3Dエンジン：マウント中は1実体を使い回し、破棄時に必ず dispose ──────────
  useEffect(() => {
    const cv = glCanvasRef.current;
    if (!cv) return;
    const eng = new Yume25DEngine(cv, layoutRef.current, playerAppearance);
    engineRef.current = eng;
    return () => { eng.dispose(); engineRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // レイアウト編集 → シーン再構築
  useEffect(() => { engineRef.current?.setLayout(layout); }, [layout]);

  // プレイヤー自身の見た目（絵文字/色）が変わったらビルボードだけ描き直す
  useEffect(() => { engineRef.current?.setPlayerAppearance(playerAppearance); }, [playerAppearance]);

  // 表示中だけレンダリングループを回す
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (is3d) eng.start(); else eng.stop();
  }, [is3d]);

  // プレイ/デモ開始時はスタート地点へ
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.demo = !!demo;
    if (playing) eng.resetToStart();
    eng.input.forward = eng.input.back = eng.input.turnL = eng.input.turnR = eng.input.strafeL = eng.input.strafeR = eng.input.dash = false;
  }, [playing, demo]);

  // ── 3D操作：キーボード（矢印＝前後＋旋回、WASD＝前後＋左右ストレイフ、Space＝ジャンプ、Shift＝ダッシュ） ──
  useEffect(() => {
    if (!is3d || demo) return;
    const setKey = (key: string, on: boolean): boolean => {
      const inp = engineRef.current?.input;
      if (!inp) return false;
      switch (key) {
        case 'ArrowUp': case 'w': case 'W': inp.forward = on; return true;
        case 'ArrowDown': case 's': case 'S': inp.back = on; return true;
        case 'ArrowLeft': inp.turnL = on; return true;
        case 'ArrowRight': inp.turnR = on; return true;
        case 'a': case 'A': inp.strafeL = on; return true;
        case 'd': case 'D': inp.strafeR = on; return true;
        case 'Shift': inp.dash = on; return true;
      }
      return false;
    };
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === ' ') { e.preventDefault(); engineRef.current?.jump(); return; }
      if (setKey(e.key, true) && (e.key.startsWith('Arrow') || 'wasdWASD'.includes(e.key))) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => { setKey(e.key, false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [is3d, demo]);

  const holdProps = (prop: 'forward' | 'back' | 'turnL' | 'turnR' | 'strafeL' | 'strafeR' | 'dash') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const inp = engineRef.current?.input; if (inp) inp[prop] = true;
    },
    onPointerUp: () => { const inp = engineRef.current?.input; if (inp) inp[prop] = false; },
    onPointerCancel: () => { const inp = engineRef.current?.input; if (inp) inp[prop] = false; },
  });

  // ── 3D操作：ドラッグでカメラ回転（マウス・タッチ共通。Pointer Events を使うので追加実装不要） ──
  const dragRef = useRef<{ id: number; lastX: number } | null>(null);
  const glPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!is3d || demo) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id: e.pointerId, lastX: e.clientX };
  };
  const glPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.lastX;
    d.lastX = e.clientX;
    if (dx !== 0) engineRef.current?.turnBy(-dx * DRAG_TURN_SENSITIVITY);
  };
  const glPointerEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null;
  };

  // ── 2Dエディタ描画 ───────────────────────────────────────────────────────
  useEffect(() => {
    if (is3d) return;
    const cv = edCanvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d')!;
    const L = layout;
    ctx.clearRect(0, 0, cv.width, cv.height);
    // 床
    for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
      const t = L.floor[r]?.[c] ?? 0;
      ctx.fillStyle = t > 0 ? (L.textures[t]?.color ?? '#f0f') : '#0d0a14';
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    }
    // グリッド線
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= L.cols; c++) { ctx.beginPath(); ctx.moveTo(c * CELL + 0.5, 0); ctx.lineTo(c * CELL + 0.5, L.rows * CELL); ctx.stroke(); }
    for (let r = 0; r <= L.rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * CELL + 0.5); ctx.lineTo(L.cols * CELL, r * CELL + 0.5); ctx.stroke(); }
    // 壁（薄板＝辺の上の太線）
    for (const w of L.walls) {
      ctx.strokeStyle = L.textures[w.tex]?.color ?? '#f0f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      if (w.dir === 0) { ctx.moveTo(w.col * CELL, w.row * CELL); ctx.lineTo((w.col + 1) * CELL, w.row * CELL); }
      else { ctx.moveTo(w.col * CELL, w.row * CELL); ctx.lineTo(w.col * CELL, (w.row + 1) * CELL); }
      ctx.stroke();
    }
    // ビルボード
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const b of L.billboards) {
      const t = L.textures[b.tex];
      const cx = (b.col + 0.5) * CELL, cy = (b.row + 0.5) * CELL;
      if (t?.emoji) { ctx.font = '18px serif'; ctx.fillText(t.emoji, cx, cy + 1); }
      else {
        ctx.fillStyle = t?.color ?? '#f0f';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 9, cy); ctx.lineTo(cx, cy + 9); ctx.lineTo(cx - 9, cy);
        ctx.closePath(); ctx.fill();
      }
    }
    // スタート地点（向き付き三角）
    {
      const { col, row, dir } = L.start;
      const cx = (col + 0.5) * CELL, cy = (row + 0.5) * CELL;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((dir * Math.PI) / 2);
      ctx.fillStyle = '#7fffd4';
      ctx.beginPath();
      ctx.moveTo(0, -9); ctx.lineTo(7, 7); ctx.lineTo(-7, 7);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }, [layout, is3d]);

  // ── 2Dエディタ操作 ───────────────────────────────────────────────────────
  const applyEdit = useCallback((sx: number, sy: number, isDrag: boolean) => {
    const L = layoutRef.current;
    const c = Math.floor(sx / CELL), r = Math.floor(sy / CELL);
    if (c < 0 || r < 0 || c >= L.cols || r >= L.rows) return;

    if (tool === 'floor') {
      onLayoutChange(l => {
        if ((l.floor[r]?.[c] ?? 0) === selFloor) return l;
        const floor = l.floor.map((row, ri) => ri === r ? row.map((v, ci) => ci === c ? selFloor : v) : row);
        return { ...l, floor };
      });
      return;
    }
    if (isDrag && tool !== 'erase') return;  // 床以外はクリック単位（誤爆防止）

    if (tool === 'wall') {
      const fx = sx / CELL - c, fy = sy / CELL - r;
      const dists: [number, Dir4][] = [[fy, 0], [1 - fx, 1], [1 - fy, 2], [fx, 3]];
      dists.sort((a, b) => a[0] - b[0]);
      const w = normalizeWall25D(c, r, dists[0][1], selWall);
      onLayoutChange(l => {
        const hit = l.walls.find(v => v.col === w.col && v.row === w.row && v.dir === w.dir);
        if (hit && hit.tex === w.tex) return { ...l, walls: l.walls.filter(v => v !== hit) };  // 同じ壁 → 取り除く
        if (hit) return { ...l, walls: l.walls.map(v => v === hit ? w : v) };                   // 別テクスチャ → 貼り替え
        return { ...l, walls: [...l.walls, w] };
      });
      return;
    }
    if (tool === 'sprite') {
      onLayoutChange(l => {
        const hit = l.billboards.find(b => b.col === c && b.row === r);
        if (hit && hit.tex === selSprite) return { ...l, billboards: l.billboards.filter(b => b !== hit) };
        if (hit) return { ...l, billboards: l.billboards.map(b => b === hit ? { ...b, tex: selSprite } : b) };
        return { ...l, billboards: [...l.billboards, { id: uid(), col: c, row: r, tex: selSprite, scale: 1 }] };
      });
      return;
    }
    if (tool === 'start') {
      onLayoutChange(l => {
        if (l.start.col === c && l.start.row === r)
          return { ...l, start: { ...l.start, dir: ((l.start.dir + 1) % 4) as Dir4 } };  // 同マス再クリックで向き回転
        return { ...l, start: { ...l.start, col: c, row: r } };
      });
      return;
    }
    // erase: ビルボード → 壁（辺の近く） → 床 の順に消す
    onLayoutChange(l => {
      const bb = l.billboards.find(b => b.col === c && b.row === r);
      if (bb) return { ...l, billboards: l.billboards.filter(b => b !== bb) };
      if (!isDrag) {
        const fx = sx / CELL - c, fy = sy / CELL - r;
        const dists: [number, Dir4][] = [[fy, 0], [1 - fx, 1], [1 - fy, 2], [fx, 3]];
        dists.sort((a, b) => a[0] - b[0]);
        if (dists[0][0] < 0.3) {
          const w = normalizeWall25D(c, r, dists[0][1], 0);
          const hit = l.walls.find(v => v.col === w.col && v.row === w.row && v.dir === w.dir);
          if (hit) return { ...l, walls: l.walls.filter(v => v !== hit) };
        }
      }
      if ((l.floor[r]?.[c] ?? 0) !== 0) {
        const floor = l.floor.map((row, ri) => ri === r ? row.map((v, ci) => ci === c ? 0 : v) : row);
        return { ...l, floor };
      }
      return l;
    });
  }, [tool, selFloor, selWall, selSprite, onLayoutChange]);

  const pointerToCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = e.currentTarget;
    const rect = cv.getBoundingClientRect();
    return {
      sx: (e.clientX - rect.left) * (cv.width / rect.width),
      sy: (e.clientY - rect.top) * (cv.height / rect.height),
    };
  };

  // ── パレット ─────────────────────────────────────────────────────────────
  const paletteKind: Tex25D['kind'] | null = tool === 'floor' ? 'floor' : tool === 'wall' ? 'wall' : tool === 'sprite' ? 'sprite' : null;
  const paletteSel = tool === 'floor' ? selFloor : tool === 'wall' ? selWall : selSprite;
  const setPaletteSel = (id: number) => {
    if (tool === 'floor') setSelFloor(id);
    else if (tool === 'wall') setSelWall(id);
    else setSelSprite(id);
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-black select-none">
      {/* 3Dビュー（常時マウント：WebGLコンテキストを使い回す）。ドラッグでカメラ回転（PC/モバイル共通）。 */}
      <canvas
        ref={glCanvasRef} width={RENDER_W} height={RENDER_H}
        className={`w-full h-full touch-none ${is3d && !demo ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{ imageRendering: 'pixelated', display: is3d ? 'block' : 'none' }}
        onPointerDown={glPointerDown}
        onPointerMove={glPointerMove}
        onPointerUp={glPointerEnd}
        onPointerCancel={glPointerEnd}
      />

      {/* 2D見下ろしエディタ */}
      {!is3d && (
        <div className="flex-1 overflow-auto flex items-center justify-center p-2 pt-16">
          <canvas
            ref={edCanvasRef}
            width={layout.cols * CELL} height={layout.rows * CELL}
            className="cursor-crosshair touch-none max-w-none"
            style={{ imageRendering: 'pixelated' }}
            onPointerDown={e => { e.preventDefault(); const { sx, sy } = pointerToCanvas(e); applyEdit(sx, sy, false); }}
            onPointerMove={e => { if ((e.buttons & 1) === 1) { const { sx, sy } = pointerToCanvas(e); applyEdit(sx, sy, true); } }}
          />
        </div>
      )}

      {/* 編集ツールバー（プレイ/デモ中は非表示） */}
      {!playing && (
        <div className="absolute top-0 left-0 right-0 z-20 flex flex-col gap-1 p-1.5 bg-black/70 backdrop-blur-sm">
          <div className="flex items-center gap-1 flex-wrap">
            {/* 2D/3D トグル */}
            <div className="flex overflow-hidden rounded border border-gray-600">
              {(['2d', '3d'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-2.5 py-1 text-[11px] font-bold ${view === v ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                  {v === '2d' ? '2D 編集' : '3D 確認'}
                </button>
              ))}
            </div>
            {view === '2d' ? (
              <>
                {(Object.keys(TOOL_LABELS) as Tool[]).map(t => (
                  <button key={t} onClick={() => setTool(t)}
                    className={`px-2 py-1 text-[11px] font-bold rounded ${tool === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                    {TOOL_LABELS[t]}
                  </button>
                ))}
              </>
            ) : (
              <span className="text-[10px] text-gray-400 px-1">WASDで移動/ストレイフ・ドラッグで視点回転・Shiftでダッシュ・Spaceでジャンプ</span>
            )}
            <button onClick={() => setSettingsOpen(v => !v)}
              className={`ml-auto px-2 py-1 text-[11px] font-bold rounded ${settingsOpen ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
              設定
            </button>
          </div>

          {/* パレット */}
          {view === '2d' && paletteKind && (
            <div className="flex items-center gap-1 flex-wrap">
              {paletteKind === 'floor' && (
                <button onClick={() => setPaletteSel(0)}
                  className={`w-7 h-7 rounded text-[9px] text-gray-300 bg-[#0d0a14] border-2 ${paletteSel === 0 ? 'border-yellow-400' : 'border-gray-700'}`}
                  title="床なし（奈落）">×</button>
              )}
              {texList(layout, paletteKind).map(t => (
                <button key={t.id} onClick={() => setPaletteSel(t.id)} title={t.name}
                  className={`w-7 h-7 rounded border-2 flex items-center justify-center text-sm ${paletteSel === t.id ? 'border-yellow-400' : 'border-gray-700'}`}
                  style={{ background: t.emoji ? '#1c1826' : t.color }}>
                  {t.emoji ?? ''}
                </button>
              ))}
            </div>
          )}

          {/* 設定パネル */}
          {settingsOpen && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 p-2 bg-gray-900/90 rounded border border-gray-700 text-[10px] text-gray-300">
              <label className="flex items-center justify-between gap-1">広さ(列)
                <input type="number" min={4} max={48} value={layout.cols}
                  onChange={e => { const cols = Math.max(4, Math.min(48, Number(e.target.value) || 4)); onLayoutChange(l => ({ ...l, cols, floor: resizeFloor(l.floor, cols, l.rows), walls: l.walls.filter(w => w.col <= cols - (w.dir === 3 ? 0 : 1) && w.col >= 0), billboards: l.billboards.filter(b => b.col < cols), start: { ...l.start, col: Math.min(l.start.col, cols - 1) } })); }}
                  className="w-14 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-white" />
              </label>
              <label className="flex items-center justify-between gap-1">広さ(行)
                <input type="number" min={4} max={48} value={layout.rows}
                  onChange={e => { const rows = Math.max(4, Math.min(48, Number(e.target.value) || 4)); onLayoutChange(l => ({ ...l, rows, floor: resizeFloor(l.floor, l.cols, rows), walls: l.walls.filter(w => w.row <= rows - (w.dir === 0 ? 0 : 1) && w.row >= 0), billboards: l.billboards.filter(b => b.row < rows), start: { ...l.start, row: Math.min(l.start.row, rows - 1) } })); }}
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
              <label className="flex items-center justify-between gap-1">霧の距離
                <input type="range" min={3} max={30} step={1} value={layout.fogFar}
                  onChange={e => onLayoutChange(l => ({ ...l, fogFar: Number(e.target.value), fogNear: Math.min(l.fogNear, Number(e.target.value) - 1) }))} className="w-20" />
              </label>
              <label className="flex items-center justify-between gap-1">霧の色
                <input type="color" value={layout.fogColor}
                  onChange={e => onLayoutChange(l => ({ ...l, fogColor: e.target.value }))} className="w-8 h-5 bg-transparent" />
              </label>
              <label className="flex items-center justify-between gap-1">空の色
                <input type="color" value={layout.skyColor}
                  onChange={e => onLayoutChange(l => ({ ...l, skyColor: e.target.value }))} className="w-8 h-5 bg-transparent" />
              </label>
              <label className="flex items-center justify-between gap-1 col-span-2">視点
                <span className="flex overflow-hidden rounded border border-gray-600">
                  {(['first', 'third'] as const).map(m => (
                    <button key={m} onClick={() => onLayoutChange(l => ({ ...l, pov: m }))}
                      className={`px-2 py-0.5 text-[10px] font-bold ${(layout.pov ?? 'first') === m ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
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
          )}
        </div>
      )}

      {/* 3D操作ボタン（タッチ用。視点回転は画面ドラッグに任せ、ここは移動系のみ。デモ中は非表示） */}
      {is3d && !demo && (
        <>
          <div className="absolute bottom-2 left-2 z-20 flex gap-1.5 opacity-90 touch-none">
            <button {...holdProps('strafeL')} className="w-11 h-11 bg-gray-700/80 active:bg-gray-500 rounded-lg text-white text-base flex items-center justify-center">◀</button>
            <button {...holdProps('strafeR')} className="w-11 h-11 bg-gray-700/80 active:bg-gray-500 rounded-lg text-white text-base flex items-center justify-center">▶</button>
          </div>
          <div className="absolute bottom-2 right-2 z-20 flex flex-col gap-1.5 opacity-90 touch-none">
            <button {...holdProps('forward')} className="w-11 h-11 bg-gray-700/80 active:bg-gray-500 rounded-lg text-white text-base flex items-center justify-center">▲</button>
            <button {...holdProps('back')} className="w-11 h-11 bg-gray-700/80 active:bg-gray-500 rounded-lg text-white text-base flex items-center justify-center">▼</button>
          </div>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 opacity-90 touch-none">
            <button {...holdProps('dash')}
              className="w-12 h-10 bg-amber-700/85 active:bg-amber-500 rounded-lg text-white text-[10px] font-bold flex items-center justify-center">
              DASH
            </button>
            <button
              onPointerDown={e => { e.preventDefault(); engineRef.current?.jump(); }}
              className="w-12 h-12 bg-emerald-700/85 active:bg-emerald-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">
              JUMP
            </button>
          </div>
        </>
      )}
    </div>
  );
}
