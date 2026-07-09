'use client';

// 2.5Dエンジン（yume25d）専用のエディタ＋プレイビュー。
// GameMaker.tsx の 2D キャンバスの代わりに描画エリアへ丸ごとはめ込む。
// 編集モード：2D 見下ろしグリッド（配置） ⇄ 3D プレビュー（歩行）をトグルで切替。
// プレイ/デモ：常に 3D。エンジン実体（WebGL）はマウント中1つを使い回し、アンマウントで dispose。

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Yume25DEngine, RENDER_W, RENDER_H, drawPlayerIconCanvas, type PlayerAppearance, type GhostSpec } from '@/lib/yume25d';
import { detectStandard, standardById, cellRect, walkFrameIndex, type WayKey } from '@/lib/walk-sprite';
import { parseWalkRef } from '@/lib/asset-ref';
import {
  type Layout25D, type Tex25D, type Dir4, uid, normalizeWall25D,
} from './game-presets/shared';

export const CELL = 28;              // 2Dエディタの1マスpx
/** 他プリセットの編集キャンバス（15×11マス分の窓をプレイヤー開始地点基準でスクロール）に合わせた可視窓サイズ。 */
const VIEW_COLS = 15;
const VIEW_ROWS = 11;
export type Yume25DTool = 'floor' | 'wall' | 'sprite' | 'start' | 'talk' | 'erase';
export const YUME25D_TOOL_LABELS: Record<Yume25DTool, string> = { floor: '床', wall: '壁', sprite: 'スプライト', start: '開始', talk: '会話設定', erase: '消す' };
/** ドラッグ1pxあたりの回転量（ラジアン）。マウス・タッチ共通（Pointer Events）。 */
const DRAG_TURN_SENSITIVITY = 0.006;
/** D-padの不感帯（px）。中心付近の誤入力を防ぐ。 */
const PAD_DEADZONE = 10;
/** 3Dビューのタップ判定：累計移動量がこのpx以下で離したら「配置」、超えたら「視点回転ドラッグ」。 */
const TAP_MAX_MOVE = 8;
/** Minecraft風の浮遊トグル：Space 2回押しがこのms以内なら浮遊モードをON/OFFする。 */
const SPACE_DOUBLE_TAP_MS = 300;
/** システム床（special 付き床テクスチャ）の2D見下ろしエディタ用マーカー。 */
const SPECIAL_FLOOR_GLYPHS: Record<string, string> = {
  warp: '◉', damage: '☠', 'ice-up': '↑', 'ice-right': '→', 'ice-down': '↓', 'ice-left': '←',
};

interface DialogueState { message: string; choices?: string[]; }

/** setPointerCapture は一部環境で「アクティブなポインタが見つからない」例外を投げることがある
 *  （マルチタッチの取りこぼしなど）。取れなくてもドラッグ自体は ref 側の手動追跡で継続できるので、
 *  ここで握りつぶして呼び出し元の状態更新を止めないようにする。 */
const tryCapturePointer = (el: Element, pointerId: number) => {
  try { el.setPointerCapture(pointerId); } catch { /* noop */ }
};

interface Yume25DMakerProps {
  layout: Layout25D;
  onLayoutChange: (updater: (l: Layout25D) => Layout25D) => void;
  isPlaying: boolean;
  /** イントロカルーセルのデモ再生（自動走行） */
  demo?: boolean;
  /** 三人称視点で表示するプレイヤー自身の見た目。 */
  playerAppearance: PlayerAppearance;
  onPickImage?: (target: { t: 'yumeTex'; id: number }) => void;
  virtualKeys?: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    action: boolean;
    shoot: boolean;
    slow: boolean;
    bomb: boolean;
    select: boolean;
  };
  /** 2D編集/3D確認の表示・編集ツール類はキャンバス上に重ねず、呼び出し側（サイドパネル）が持つ制御状態。 */
  view: '2d' | '3d';
  tool: Yume25DTool;
  /** 編集対象の段（高さ）。壁/スプライトの配置・消去はこの段に対して行う。 */
  level: number;
  selFloor: number;
  selWall: number;
  selSprite: number;
  talkTargetId: string | null;
  onTalkTargetChange: (id: string | null) => void;
  /** 浮遊（ホバー）モードのON/OFF。ボタンはキャンバス上ではなく呼び出し側（移動・設置モードパネル）に配置するため、
   *  状態も呼び出し側で保持する。上昇/下降のホールド操作は engineRef を持つこちら側で imperative handle として公開する。 */
  hoverMode: boolean;
  onHoverModeChange: (v: boolean) => void;
}

export interface Yume25DMakerHandle {
  setFlyUp: (active: boolean) => void;
  setFlyDown: (active: boolean) => void;
}

export const yume25dTexList = (l: Layout25D | undefined, kind: Tex25D['kind']): Tex25D[] =>
  l ? Object.values(l.textures).filter(t => t.kind === kind).sort((a, b) => a.id - b.id) : [];

/** グリッドを新サイズへ切り詰め/拡張（拡張部は 0 埋め）。 */
export const yume25dResizeFloor = (floor: number[][], cols: number, rows: number): number[][] =>
  Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => floor[r]?.[c] ?? 0));

const Yume25DMaker = forwardRef<Yume25DMakerHandle, Yume25DMakerProps>(function Yume25DMaker({
  layout, onLayoutChange, isPlaying, demo, playerAppearance, onPickImage, virtualKeys,
  view, tool, level, selFloor, selWall, selSprite, talkTargetId, onTalkTargetChange,
  hoverMode, onHoverModeChange,
}, ref) {
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const edCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Yume25DEngine | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const setTalkTargetId = onTalkTargetChange;
  /** 「はなす」で開く会話ウィンドウ。開いている間は仮想ボタン一式を非表示にする。 */
  const [dialogue, setDialogue] = useState<DialogueState | null>(null);
  const [showControlGuide, setShowControlGuide] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogueRef = useRef<DialogueState | null>(null);
  dialogueRef.current = dialogue;

  const playing = isPlaying || !!demo;
  const is3d = playing || view === '3d';

  // ── 浮遊（ホバー）モード：Minecraft創造飛行風。編集中の3Dビューで Space 2回押し／浮遊ボタンでトグル。
  //    ONの間は Space/上昇ボタン=上昇・Shift/下降ボタン=下降。OFFは通常の落下モード（重力・ジャンプ）。
  //    state は呼び出し側（移動・設置モードパネル）が持つので、ここでは hoverMode / onHoverModeChange プロップを使う。 ──
  const lastSpaceDownRef = useRef(0);

  // ── 2Dエディタのカメラ窓：他プリセット同様に VIEW_COLS×VIEW_ROWS マス分だけを表示し、
  //    プレイヤー開始地点（🏁）を基準にスクロールする（ブラウザのネイティブスクロールは使わない）。 ──
  const clampScroll = (col: number, row: number, cols: number, rows: number) => ({
    col: Math.max(0, Math.min(cols - VIEW_COLS, col)),
    row: Math.max(0, Math.min(rows - VIEW_ROWS, row)),
  });
  const centerScroll = (col: number, row: number, cols: number, rows: number) =>
    clampScroll(col - Math.floor(VIEW_COLS / 2), row - Math.floor(VIEW_ROWS / 2), cols, rows);

  // スムーズな float 座標を useRef で直接保持する（毎フレーム再レンダリングするのを防ぐため）
  const cursorRef = useRef({ col: layout.start.col, row: layout.start.row });
  const scrollRef = useRef({ col: 0, row: 0 });

  // 初期値セット
  const isInitializedRef = useRef(false);
  if (!isInitializedRef.current) {
    scrollRef.current = centerScroll(layout.start.col, layout.start.row, layout.cols, layout.rows);
    isInitializedRef.current = true;
  }

  // スタート地点が変更されたら位置を同期する
  useEffect(() => {
    cursorRef.current = { col: layout.start.col, row: layout.start.row };
    scrollRef.current = centerScroll(layout.start.col, layout.start.row, layout.cols, layout.rows);
  }, [layout.start.col, layout.start.row]);

  // マップサイズ変更（設定パネル）で現在の位置が範囲外になったら補正する。
  useEffect(() => {
    cursorRef.current = {
      col: Math.max(0, Math.min(layout.cols - 1, cursorRef.current.col)),
      row: Math.max(0, Math.min(layout.rows - 1, cursorRef.current.row)),
    };
    scrollRef.current = clampScroll(scrollRef.current.col, scrollRef.current.row, layout.cols, layout.rows);
  }, [layout.cols, layout.rows]);

  // 2Dエディタ用カーソルの向き・アニメーション状態
  const cursorDirRef = useRef<WayKey>('s');
  const cursorMovingRef = useRef(false);

  // 歩行グラシートのロード＆キャッシュ
  const playerImageRef = useRef<HTMLImageElement | null>(null);
  const [playerImageLoaded, setPlayerImageLoaded] = useState(false);
  useEffect(() => {
    const walk = playerAppearance.spriteRef ? parseWalkRef(playerAppearance.spriteRef) : null;
    const isAnimatableWalk = walk && walk.stdId !== 'smc_json' && !walk.crop;
    const sheetUrl = isAnimatableWalk
      ? (playerAppearance.spriteUrl ?? (walk.source.kind === 'url' ? walk.source.url : undefined))
      : undefined;

    if (sheetUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        playerImageRef.current = img;
        setPlayerImageLoaded(true);
      };
      img.onerror = () => {
        playerImageRef.current = null;
        setPlayerImageLoaded(false);
      };
      img.src = sheetUrl;
    } else {
      playerImageRef.current = null;
      setPlayerImageLoaded(false);
    }
  }, [playerAppearance.spriteUrl, playerAppearance.spriteRef]);

  // ── カーソルに表示するプレイヤーの見た目（絵文字/色/spriteUrl）。3D確認と同じ描画ロジックを使い回す。 ──
  const playerIconCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playerIconVersion, setPlayerIconVersion] = useState(0);
  useEffect(() => {
    if (!playerIconCanvasRef.current) playerIconCanvasRef.current = document.createElement('canvas');
    playerIconCanvasRef.current.width = 64;
    playerIconCanvasRef.current.height = 64;
    drawPlayerIconCanvas(playerIconCanvasRef.current, playerAppearance, () => setPlayerIconVersion(v => v + 1));
    setPlayerIconVersion(v => v + 1);
  }, [playerAppearance.emoji, playerAppearance.color, playerAppearance.spriteUrl, playerAppearance.spriteRef]);

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
    eng.input.forward = eng.input.back = eng.input.turnL = eng.input.turnR = eng.input.strafeL = eng.input.strafeR = eng.input.dash = eng.input.flyUp = eng.input.flyDown = false;
    setDialogue(null);
  }, [playing, demo]);

  const resetIdleTimer = useCallback(() => {
    setShowControlGuide(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (playing && !dialogue && !demo) {
      idleTimerRef.current = setTimeout(() => {
        setShowControlGuide(true);
      }, 3500);
    }
  }, [playing, dialogue, demo]);

  useEffect(() => {
    if (!playing || dialogue || demo) {
      setShowControlGuide(false);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      return;
    }

    const handleActivity = () => {
      resetIdleTimer();
    };

    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('mousedown', handleActivity, { passive: true });
    window.addEventListener('pointerdown', handleActivity, { passive: true });
    window.addEventListener('pointermove', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });

    resetIdleTimer();

    return () => {
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('pointermove', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [playing, dialogue, demo, resetIdleTimer]);

  // ── 3D操作：キーボード（矢印＝前後＋旋回、WASD＝前後＋左右ストレイフ）。Minecraft創造モード風：
  //    Space＝ジャンプ（浮遊中は上昇）、編集中に Space 2回押しで浮遊モードON/OFF、
  //    Shift＝ダッシュ（浮遊中は下降）。 ──
  // 会話ウィンドウが開いている間は移動キーを無視し、Enter/Spaceで閉じる。
  useEffect(() => {
    if (!is3d || demo) return;
    const editHover = !playing && hoverMode;
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
        case 'Shift':
          // Minecraft風：浮遊中は下降、それ以外はダッシュ。離したらどちらも解除（押下中のモード切替対策）。
          if (on) { if (editHover) inp.flyDown = true; else inp.dash = true; }
          else { inp.dash = false; inp.flyDown = false; }
          return true;
        case ' ': if (!on) inp.flyUp = false; return true;  // 押下側は down ハンドラが処理する
      }
      return false;
    };
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (dialogueRef.current) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setDialogue(null); }
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        if (playing) { engineRef.current?.jump(); return; }
        if (!e.repeat) {
          const now = performance.now();
          if (now - lastSpaceDownRef.current < SPACE_DOUBLE_TAP_MS) {
            // Space 2回押し：浮遊モードをトグル（ONで滞空開始、OFFで落下開始）
            lastSpaceDownRef.current = 0;
            const inp = engineRef.current?.input;
            if (inp) { inp.flyUp = false; inp.flyDown = false; }
            onHoverModeChange(!hoverMode);
            return;
          }
          lastSpaceDownRef.current = now;
        }
        if (editHover) { const inp = engineRef.current?.input; if (inp) inp.flyUp = true; }
        else engineRef.current?.jump();
        return;
      }
      if (e.key === 'e' || e.key === 'E' || e.key === 'f' || e.key === 'F') {
        const b = engineRef.current?.getInteractable();
        if (b) setDialogue({ message: b.message || '……', choices: b.choices });
        return;
      }
      if (setKey(e.key, true) && (e.key.startsWith('Arrow') || 'wasdWASD'.includes(e.key))) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => { setKey(e.key, false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [is3d, demo, playing, hoverMode]);

  // ── 共通コントローラーからの入力を 2.5D エンジンへ転送 ──
  // 浮遊（ホバー）モード中は A/B ボタンを上昇/下降の押しっぱなし入力として扱う。
  useEffect(() => {
    const inp = engineRef.current?.input;
    if (!inp || !virtualKeys) return;
    inp.forward = virtualKeys.up;
    inp.back = virtualKeys.down;
    inp.strafeL = virtualKeys.left;
    inp.strafeR = virtualKeys.right;
    inp.dash = virtualKeys.slow;
    const fly = is3d && !playing && !demo && hoverMode;
    inp.flyUp = fly && virtualKeys.action;
    inp.flyDown = fly && virtualKeys.shoot;
  }, [virtualKeys?.up, virtualKeys?.down, virtualKeys?.left, virtualKeys?.right, virtualKeys?.slow,
      virtualKeys?.action, virtualKeys?.shoot, is3d, playing, demo, hoverMode]);

  // Aボタン(Z): ジャンプ / ダイアログ進行（浮遊モード中は上の転送処理が「上昇」として扱う）
  useEffect(() => {
    if (virtualKeys?.action) {
      if (dialogueRef.current) {
        setDialogue(null);
      } else if (!engineRef.current?.hover) {
        engineRef.current?.jump();
      }
    }
  }, [virtualKeys?.action]);

  // Bボタン(X): 話す（浮遊モード中は「下降」に割り当てるため無効）
  useEffect(() => {
    if (virtualKeys?.shoot && !engineRef.current?.hover) {
      handleTalk();
    }
  }, [virtualKeys?.shoot]);

  // SELECTボタン: カメラPOV切り替え (first <=> third)
  useEffect(() => {
    if (virtualKeys?.select) {
      onLayoutChange(l => {
        const nextPov = l.pov === 'third' ? 'first' : 'third';
        engineRef.current?.setPov(nextPov);
        return { ...l, pov: nextPov };
      });
    }
  }, [virtualKeys?.select]);

  useImperativeHandle(ref, () => ({
    setFlyUp: (active: boolean) => { const inp = engineRef.current?.input; if (inp) inp.flyUp = active; },
    setFlyDown: (active: boolean) => { const inp = engineRef.current?.input; if (inp) inp.flyDown = active; },
  }), []);

  const holdProps = (prop: 'forward' | 'back' | 'turnL' | 'turnR' | 'strafeL' | 'strafeR' | 'dash' | 'flyUp' | 'flyDown') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      tryCapturePointer(e.currentTarget as HTMLElement, e.pointerId);
      const inp = engineRef.current?.input; if (inp) inp[prop] = true;
    },
    onPointerUp: () => { const inp = engineRef.current?.input; if (inp) inp[prop] = false; },
    onPointerCancel: () => { const inp = engineRef.current?.input; if (inp) inp[prop] = false; },
  });

  // ── 3D配置プレビュー（ゴースト）：カーソル位置から applyEditAt と同じ適用先を割り出し、
  //    半透明のゴーストで「タップしたらここに置かれる」を示す。
  //    高さ（段）は pickTarget が指した先（壁の上の方・NPC・浮遊高度の空中面）から自動で決まる。 ──
  const lastHoverRef = useRef<{ x: number; y: number } | null>(null);
  /** 既存物を対象にするツールは、浮遊面より遠くても実ジオメトリの交点を優先する。 */
  const prefersGeometry = (t: Yume25DTool) => t === 'floor' || t === 'start' || t === 'talk' || t === 'erase';
  const computeGhost = useCallback((clientX: number, clientY: number): GhostSpec | null => {
    const eng = engineRef.current, cv = glCanvasRef.current;
    if (!eng || !cv) return null;
    const rect = cv.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const L = layoutRef.current;
    const res = eng.pickTarget(ndcX, ndcY, prefersGeometry(tool));
    if (!res) return null;
    const c = Math.floor(res.x), r = Math.floor(res.z);
    if (c < 0 || r < 0 || c >= L.cols || r >= L.rows) return null;
    const fx = res.x - c, fy = res.z - r;
    const lv = res.level;
    if (tool === 'floor') {
      // 床なし（奈落）選択中はテクスチャが無いので暗色ハイライトで示す
      return selFloor > 0 ? { kind: 'floor', col: c, row: r, tex: selFloor } : { kind: 'cell', col: c, row: r, level: 0, color: '#0d0a14' };
    }
    if (tool === 'wall') {
      const dists: [number, Dir4][] = [[fy, 0], [1 - fx, 1], [1 - fy, 2], [fx, 3]];
      dists.sort((a, b) => a[0] - b[0]);
      const w = normalizeWall25D(c, r, dists[0][1], selWall, lv);
      return { kind: 'wall', col: w.col, row: w.row, dir: w.dir, level: lv, tex: selWall };
    }
    if (tool === 'sprite') return { kind: 'sprite', col: c, row: r, level: lv, tex: selSprite };
    if (tool === 'start') return { kind: 'cell', col: c, row: r, level: 0, color: '#7fffd4' };
    if (tool === 'talk') return { kind: 'cell', col: c, row: r, level: lv, color: '#38bdf8' };
    return { kind: 'cell', col: c, row: r, level: lv, color: '#ef4444' };  // erase
  }, [tool, selFloor, selWall, selSprite]);

  const updateGhost = (clientX: number, clientY: number) => {
    lastHoverRef.current = { x: clientX, y: clientY };
    engineRef.current?.setGhost(computeGhost(clientX, clientY));
  };

  // ツール/段/パレット切替やビュー・プレイ状態の変化時に、その場でゴーストを描き直す/消す。
  useEffect(() => {
    if (!is3d || playing || demo) { engineRef.current?.setGhost(null); return; }
    const p = lastHoverRef.current;
    if (p) engineRef.current?.setGhost(computeGhost(p.x, p.y));
  }, [is3d, playing, demo, computeGhost]);

  // 編集中の3Dビューは編集モード（空中面ピッキング・毎フレームのゴースト追従）。
  // 浮遊（ホバー）は hoverMode のトグルに従う。OFFなら通常の落下モードで歩き回れる。
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const edit = is3d && !playing && !demo;
    eng.editMode = edit;
    eng.hover = edit && hoverMode;
    if (!eng.hover) { eng.input.flyUp = false; eng.input.flyDown = false; }
  }, [is3d, playing, demo, hoverMode]);

  // プレイ開始やビュー切替で編集から離れたら浮遊モードを解除する。
  useEffect(() => {
    if ((!is3d || playing || demo) && hoverMode) onHoverModeChange(false);
  }, [is3d, playing, demo]);

  // 浮遊・移動でカメラが動くとカーソルの指す先も変わるので、編集中は毎フレームゴーストを追従させる。
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.onEditFrame = () => {
      const d = dragRef.current;
      if (d && d.moved > TAP_MAX_MOVE) return;  // 視点回転ドラッグ中は消したままにする
      const p = lastHoverRef.current;
      if (p) eng.setGhost(computeGhost(p.x, p.y));
    };
    return () => { eng.onEditFrame = null; };
  }, [computeGhost]);

  // ── 3D操作：ドラッグでカメラ回転（マウス・タッチ共通。Pointer Events を使うので追加実装不要）。
  //    横方向＝旋回(yaw)、縦方向＝見上げ/見下ろし(pitch)。
  //    編集中（3D確認ビュー）は、ほぼ動かさず離した「タップ」を配置操作として扱う。 ──
  const dragRef = useRef<{ id: number; lastX: number; lastY: number; moved: number } | null>(null);
  const glPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!is3d || demo) return;
    e.preventDefault();
    tryCapturePointer(e.currentTarget, e.pointerId);
    dragRef.current = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY, moved: 0 };
    // タッチにはホバーが無いので、指を置いた時点でゴーストを出して「離すとここ」を見せる。
    if (!playing) updateGhost(e.clientX, e.clientY);
  };
  const glPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) {
      // 非ドラッグ（マウスホバー）：カーソル位置の配置プレビューを追従させる。
      if (is3d && !playing && !demo) updateGhost(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - d.lastX, dy = e.clientY - d.lastY;
    d.lastX = e.clientX; d.lastY = e.clientY;
    d.moved += Math.abs(dx) + Math.abs(dy);
    if (dx !== 0 || dy !== 0) engineRef.current?.turnBy(-dx * DRAG_TURN_SENSITIVITY, -dy * DRAG_TURN_SENSITIVITY);
    // タップ閾値を超えたら視点回転ドラッグなのでゴーストを消す。閾値内なら追従させる。
    if (!playing) {
      if (d.moved > TAP_MAX_MOVE) engineRef.current?.setGhost(null);
      else updateGhost(e.clientX, e.clientY);
    }
  };
  const glPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (d?.id !== e.pointerId) return;
    dragRef.current = null;
    if (playing) return;
    // タップ判定：指ブレ程度しか動いていなければ、視線の先のマスへ現在のツールを適用する。
    if (d.moved <= TAP_MAX_MOVE) {
      const rect = e.currentTarget.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      // 高さ（段）はゴーストと同じくピッキング結果から自動で決まる。
      const res = engineRef.current?.pickTarget(ndcX, ndcY, prefersGeometry(tool));
      if (res) {
        const c = Math.floor(res.x), r = Math.floor(res.z);
        applyEditAt(c, r, false, res.x - c, res.z - r, res.level);
      }
    }
    // 視点回転の終了後や配置直後も、カーソル位置のプレビューを復帰させる。
    updateGhost(e.clientX, e.clientY);
  };
  const glPointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null;
    engineRef.current?.setGhost(null);
  };
  const glPointerLeave = () => {
    lastHoverRef.current = null;
    engineRef.current?.setGhost(null);
  };

  // ── 仮想 D-pad：1つの領域内でのポインタ位置から forward/back/strafeL/strafeR を合成する ──
  const dpadPointerRef = useRef<number | null>(null);
  const applyDpad = (e: React.PointerEvent<HTMLDivElement>) => {
    const inp = engineRef.current?.input; if (!inp) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2), dy = e.clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist < PAD_DEADZONE) { inp.forward = inp.back = inp.strafeL = inp.strafeR = false; return; }
    const nx = dx / dist, ny = dy / dist;
    const AXIS = 0.35;
    inp.strafeR = nx > AXIS; inp.strafeL = nx < -AXIS;
    inp.back = ny > AXIS; inp.forward = ny < -AXIS;
  };
  const dpadDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    tryCapturePointer(e.currentTarget, e.pointerId);
    dpadPointerRef.current = e.pointerId;
    applyDpad(e);
  };
  const dpadMove = (e: React.PointerEvent<HTMLDivElement>) => { if (dpadPointerRef.current === e.pointerId) applyDpad(e); };
  const dpadEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dpadPointerRef.current !== e.pointerId) return;
    dpadPointerRef.current = null;
    const inp = engineRef.current?.input; if (inp) inp.forward = inp.back = inp.strafeL = inp.strafeR = false;
  };

  // ── 「はなす」：近くの interactive なビルボードがあれば会話ウィンドウを開く ──
  const handleTalk = () => {
    const b = engineRef.current?.getInteractable();
    if (b) setDialogue({ message: b.message || '……', choices: b.choices });
  };

  // ── 2Dエディタ描画：VIEW_COLS×VIEW_ROWS マス分の窓だけを scroll 位置基準で描画する ──────
  const draw2DCanvas = useCallback(() => {
    if (is3d) return;
    const cv = edCanvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d')!;
    const L = layoutRef.current;
    const scr = scrollRef.current;
    const cur = cursorRef.current;
    const offX = scr.col * CELL, offY = scr.row * CELL;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cv.width, cv.height);
    ctx.clip();
    ctx.translate(-offX, -offY);
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
    // システム床のマーカー（色だけでは種別が判別しづらいため記号を重ねる）
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
      const sp = L.textures[L.floor[r]?.[c] ?? 0]?.special;
      if (!sp) continue;
      const glyph = SPECIAL_FLOOR_GLYPHS[sp];
      if (glyph) ctx.fillText(glyph, (c + 0.5) * CELL, (r + 0.5) * CELL);
    }
    // 壁（薄板＝辺の上の太線）。編集中の段以外はゴースト表示（他の段の配置を透かして見せる）。
    const sorted = [...L.walls].sort((a, b) => (Math.abs((a.level ?? 0) - level)) - (Math.abs((b.level ?? 0) - level))).reverse();
    for (const w of sorted) {
      const lv = w.level ?? 0;
      ctx.globalAlpha = lv === level ? 1 : 0.25;
      ctx.strokeStyle = L.textures[w.tex]?.color ?? '#f0f';
      ctx.lineWidth = lv === level ? 4 : 3;
      ctx.beginPath();
      if (w.dir === 0) { ctx.moveTo(w.col * CELL, w.row * CELL); ctx.lineTo((w.col + 1) * CELL, w.row * CELL); }
      else { ctx.moveTo(w.col * CELL, w.row * CELL); ctx.lineTo(w.col * CELL, (w.row + 1) * CELL); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // ビルボード。上空（level>0）のものには右上に段数バッジを添える。
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const b of L.billboards) {
      const t = L.textures[b.tex];
      const lv = b.level ?? 0;
      const cx = (b.col + 0.5) * CELL, cy = (b.row + 0.5) * CELL;
      ctx.globalAlpha = lv === level ? 1 : 0.3;
      if (t?.emoji) { ctx.font = '18px serif'; ctx.fillText(t.emoji, cx, cy + 1); }
      else {
        ctx.fillStyle = t?.color ?? '#f0f';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 9, cy); ctx.lineTo(cx, cy + 9); ctx.lineTo(cx - 9, cy);
        ctx.closePath(); ctx.fill();
      }
      if (lv > 0) {
        ctx.font = 'bold 9px sans-serif';
        ctx.fillStyle = '#ffd75e';
        ctx.fillText(String(lv + 1), cx + 10, cy - 9);
      }
    }
    ctx.globalAlpha = 1;
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
    // 十字キー操作カーソル：他プリセットの編集画面同様、プレイヤー自身の見た目（絵文字/色/スプライト）で表示する。
    if (!playing) {
      const cx = cur.col * CELL + CELL / 2, cy = cur.row * CELL + CELL / 2;
      const img = playerImageRef.current;
      const walk = playerAppearance.spriteRef ? parseWalkRef(playerAppearance.spriteRef) : null;
      const isWalk = walk && walk.stdId !== 'smc_json' && !walk.crop;

      if (isWalk && img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 3;
        const std = walk.stdId === 'auto' ? detectStandard(img.naturalWidth, img.naturalHeight) : standardById(walk.stdId);
        const idleFrame = std.frames === 3 ? 1 : 0;
        const timeSec = performance.now() / 1000;
        const fps = cursorMovingRef.current ? 8 : 4;
        const frame = walkFrameIndex(std, Math.floor(timeSec * fps)); // Always animate walk graphic!
        const rect = cellRect(std, img.naturalWidth, img.naturalHeight, cursorDirRef.current, frame);
        const sc = Math.min(CELL / rect.sw, CELL / rect.sh);
        const w = rect.sw * sc, h = rect.sh * sc;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, cx - w / 2, cy - h / 2, w, h);
        ctx.restore();
      } else {
        if (playerAppearance.emoji) {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 3;
          ctx.font = '18px serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(playerAppearance.emoji, cx, cy + 1);
          ctx.restore();
        } else {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 3;
          ctx.fillStyle = playerAppearance.color;
          ctx.beginPath();
          ctx.arc(cx, cy - 4, 5, 0, Math.PI * 2); ctx.fill(); // 頭
          ctx.fillRect(cx - 5, cy - 1, 10, 8);               // 胴
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }, [level, playing, playerAppearance, is3d]);

  // マウント中または依存関係が変更されたら初回だけ描画する
  useEffect(() => {
    draw2DCanvas();
  }, [draw2DCanvas]);

  // ── 2Dエディタ操作 ───────────────────────────────────────────────────────
  // c, r はワールド座標のマス目。fx, fy はマス内の相対位置（0〜1、壁の辺選択に使用）。
  // lvOverride: 3Dビューのピッキングが割り出した段。2D編集はパネルで選んだ段（level prop）を使う。
  const applyEditAt = useCallback((c: number, r: number, isDrag: boolean, fx: number, fy: number, lvOverride?: number) => {
    const L = layoutRef.current;
    if (c < 0 || r < 0 || c >= L.cols || r >= L.rows) return;
    const lv = lvOverride ?? level;

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
      const dists: [number, Dir4][] = [[fy, 0], [1 - fx, 1], [1 - fy, 2], [fx, 3]];
      dists.sort((a, b) => a[0] - b[0]);
      const w = normalizeWall25D(c, r, dists[0][1], selWall, lv);
      onLayoutChange(l => {
        const hit = l.walls.find(v => v.col === w.col && v.row === w.row && v.dir === w.dir && (v.level ?? 0) === lv);
        if (hit && hit.tex === w.tex) return { ...l, walls: l.walls.filter(v => v !== hit) };  // 同じ壁 → 取り除く
        if (hit) return { ...l, walls: l.walls.map(v => v === hit ? w : v) };                   // 別テクスチャ → 貼り替え
        return { ...l, walls: [...l.walls, w] };
      });
      return;
    }
    if (tool === 'sprite') {
      onLayoutChange(l => {
        const hit = l.billboards.find(b => b.col === c && b.row === r && (b.level ?? 0) === lv);
        if (hit && hit.tex === selSprite) return { ...l, billboards: l.billboards.filter(b => b !== hit) };
        if (hit) return { ...l, billboards: l.billboards.map(b => b === hit ? { ...b, tex: selSprite } : b) };
        return { ...l, billboards: [...l.billboards, { id: uid(), col: c, row: r, tex: selSprite, scale: 1, ...(lv > 0 ? { level: lv } : {}) }] };
      });
      return;
    }
    if (tool === 'start') {
      onLayoutChange(l => {
        if (l.start.col === c && l.start.row === r)
          return { ...l, start: { ...l.start, dir: ((l.start.dir + 1) % 4) as Dir4 } };  // 同マス再クリックで向き回転
        return { ...l, start: { ...l.start, col: c, row: r } };
      });
      // 他プリセット同様、開始地点を動かしたらそこを中心にカメラ窓を再スクロールする。
      scrollRef.current = centerScroll(c, r, L.cols, L.rows);
      return;
    }
    if (tool === 'talk') {
      // いま編集中の段を優先し、無ければ同セルの他の段から拾う
      const bs = layoutRef.current.billboards;
      const hit = bs.find(b => b.col === c && b.row === r && (b.level ?? 0) === lv)
        ?? bs.find(b => b.col === c && b.row === r);
      setTalkTargetId(hit ? hit.id : null);
      return;
    }
    // erase: 編集中の段の ビルボード → 壁（辺の近く） の順に消す。床は地上段(0)のみ。
    onLayoutChange(l => {
      const bb = l.billboards.find(b => b.col === c && b.row === r && (b.level ?? 0) === lv);
      if (bb) return { ...l, billboards: l.billboards.filter(b => b !== bb) };
      if (!isDrag) {
        const dists: [number, Dir4][] = [[fy, 0], [1 - fx, 1], [1 - fy, 2], [fx, 3]];
        dists.sort((a, b) => a[0] - b[0]);
        if (dists[0][0] < 0.3) {
          const w = normalizeWall25D(c, r, dists[0][1], 0);
          const hit = l.walls.find(v => v.col === w.col && v.row === w.row && v.dir === w.dir && (v.level ?? 0) === lv);
          if (hit) return { ...l, walls: l.walls.filter(v => v !== hit) };
        }
      }
      if (lv === 0 && (l.floor[r]?.[c] ?? 0) !== 0) {
        const floor = l.floor.map((row, ri) => ri === r ? row.map((v, ci) => ci === c ? 0 : v) : row);
        return { ...l, floor };
      }
      return l;
    });
  }, [tool, selFloor, selWall, selSprite, level, onLayoutChange]);

  const applyEdit = useCallback((sxWin: number, syWin: number, isDrag: boolean) => {
    const sx = sxWin + scrollRef.current.col * CELL, sy = syWin + scrollRef.current.row * CELL;
    const c = Math.floor(sx / CELL), r = Math.floor(sy / CELL);
    applyEditAt(c, r, isDrag, sx / CELL - c, sy / CELL - r);
  }, [applyEditAt]);

  const pointerToCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = e.currentTarget;
    const rect = cv.getBoundingClientRect();
    return {
      sx: (e.clientX - rect.left) * (cv.width / rect.width),
      sy: (e.clientY - rect.top) * (cv.height / rect.height),
    };
  };

  // キーボードでの2Dエディタ移動キー押下状態を保持するSet
  const pressedKeysRef = useRef<Set<string>>(new Set());

  // 物理キーボードのリスナー
  useEffect(() => {
    if (is3d) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const keyLower = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(keyLower)) {
        e.preventDefault();
        pressedKeysRef.current.add(keyLower);
      } else if (e.key === ' ') {
        e.preventDefault();
        const cur = cursorRef.current;
        applyEditAt(Math.floor(cur.col), Math.floor(cur.row), false, 0, 0);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      pressedKeysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      pressedKeysRef.current.clear();
    };
  }, [is3d, applyEditAt]);

  // ── カーソル操作（十字キー・キーボードでスムーズに移動）＆2Dキャンバス高頻度描画ループ ────
  useEffect(() => {
    if (is3d) return;
    let rafId = 0;
    let lastTime = performance.now();

    const loop = () => {
      const L = layoutRef.current;
      const k = virtualKeys;
      const pk = pressedKeysRef.current;
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      const left = !!((k?.left) || pk.has('arrowleft') || pk.has('a'));
      const right = !!((k?.right) || pk.has('arrowright') || pk.has('d'));
      const up = !!((k?.up) || pk.has('arrowup') || pk.has('w'));
      const down = !!((k?.down) || pk.has('arrowdown') || pk.has('s'));
      const moving = left || right || up || down;

      cursorMovingRef.current = moving;

      if (moving) {
        let newDir = cursorDirRef.current;
        if (left) newDir = 'a';
        else if (right) newDir = 'd';
        else if (up) newDir = 'w';
        else if (down) newDir = 's';
        cursorDirRef.current = newDir;

        const speed = 4.8; // Smooth movement speed: cells per second
        let dx = (right ? 1 : 0) - (left ? 1 : 0);
        let dy = (down ? 1 : 0) - (up ? 1 : 0);
        if (dx !== 0 && dy !== 0) {
          const len = Math.hypot(dx, dy);
          dx /= len;
          dy /= len;
        }

        const cur = cursorRef.current;
        const nextCol = Math.max(0, Math.min(L.cols - 1, cur.col + dx * speed * dt));
        const nextRow = Math.max(0, Math.min(L.rows - 1, cur.row + dy * speed * dt));
        cursorRef.current = { col: nextCol, row: nextRow };
        scrollRef.current = centerScroll(nextCol, nextRow, L.cols, L.rows);
      }

      draw2DCanvas();

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [is3d, virtualKeys, draw2DCanvas]);

  // A ボタン（配置/消す）：立ち上がりエッジでのみ発火し、カーソル位置へ現在のツールを適用する。
  const prevActionRef = useRef(false);
  useEffect(() => {
    if (is3d || !virtualKeys) return;
    const pressed = !!virtualKeys.action;
    if (pressed && !prevActionRef.current) {
      const cur = cursorRef.current;
      applyEditAt(Math.floor(cur.col), Math.floor(cur.row), false, 0, 0);
    }
    prevActionRef.current = pressed;
  }, [is3d, virtualKeys, virtualKeys?.action, applyEditAt]);

  return (
    <div className="absolute inset-0 flex flex-col bg-black select-none">
      {/* 3Dビュー（常時マウント：WebGLコンテキストを使い回す）。ドラッグでカメラ回転（PC/モバイル共通）。 */}
      <canvas
        ref={glCanvasRef} width={RENDER_W} height={RENDER_H}
        className={`w-full h-full touch-none ${is3d && !demo ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{ imageRendering: 'pixelated', display: is3d ? 'block' : 'none' }}
        onPointerDown={glPointerDown}
        onPointerMove={glPointerMove}
        onPointerUp={glPointerUp}
        onPointerCancel={glPointerCancel}
        onPointerLeave={glPointerLeave}
        onContextMenu={e => e.preventDefault()}
      />

      {/* 2D見下ろしエディタ：他プリセットと同じ箱サイズに収まる固定窓（VIEW_COLS×VIEW_ROWS）。 */}
      {!is3d && (
        <div className="flex-1 w-full p-2">
          <canvas
            ref={edCanvasRef}
            width={VIEW_COLS * CELL} height={VIEW_ROWS * CELL}
            className="cursor-crosshair touch-none w-full h-full"
            style={{ imageRendering: 'pixelated' }}
            onPointerDown={e => { e.preventDefault(); const { sx, sy } = pointerToCanvas(e); applyEdit(sx, sy, false); }}
            onPointerMove={e => { if ((e.buttons & 1) === 1) { const { sx, sy } = pointerToCanvas(e); applyEdit(sx, sy, true); } }}
            onContextMenu={e => e.preventDefault()}
          />
        </div>
      )}

      {/* 3D操作パネル（タッチ用）。視点回転は画面ドラッグに任せるので LOOK パッドは置かず、
          D-pad（移動）と最小限のアクションボタンだけに絞って画面占有を抑える。
          会話ウィンドウを表示中は選択の邪魔にならないよう丸ごと隠す。デモ中も非表示。 */}
      {is3d && !demo && !dialogue && !virtualKeys && (
        <>
          {/* 仮想 D-pad：移動（前後＋左右ストレイフ、斜め可）。視点回転は画面を直接ドラッグ。 */}
          <div
            onPointerDown={dpadDown} onPointerMove={dpadMove} onPointerUp={dpadEnd} onPointerCancel={dpadEnd}
            className="absolute bottom-2 left-2 z-20 w-20 h-20 rounded-full bg-gray-700/60 border border-gray-500/60 opacity-90 touch-none select-none flex items-center justify-center"
          >
            <span className="absolute top-1 text-white/70 text-xs">▲</span>
            <span className="absolute bottom-1 text-white/70 text-xs">▼</span>
            <span className="absolute left-1 text-white/70 text-xs">◀</span>
            <span className="absolute right-1 text-white/70 text-xs">▶</span>
            <span className="w-2.5 h-2.5 rounded-full bg-white/30" />
          </div>

          {/* アクションボタン：右下にまとめて画面占有を最小化。浮遊の昇降は専用クラスタ（下記）が担う。 */}
          <div className="absolute bottom-2 right-2 z-20 flex items-center gap-1.5 opacity-90 touch-none">
            <button {...holdProps('dash')}
              className="w-9 h-9 bg-amber-700/85 active:bg-amber-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center">
              DASH
            </button>
            <button
              onPointerDown={e => { e.preventDefault(); engineRef.current?.jump(); }}
              className="w-9 h-9 bg-emerald-700/85 active:bg-emerald-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center">
              JUMP
            </button>
            <button
              onPointerDown={e => { e.preventDefault(); handleTalk(); }}
              className="w-9 h-9 bg-sky-700/85 active:bg-sky-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center">
              TALK
            </button>
          </div>
        </>
      )}

      {/* 浮遊（ホバー）操作は移動・設置モードパネル（GameMaker.tsx サイドバー）側に配置。 */}

      {/* 会話ウィンドウ（選択肢がある場合は「選ぶ」までここに留まり、仮想ボタンは上で隠されている）。 */}
      {is3d && dialogue && (
        <div className="absolute inset-x-0 bottom-0 z-30 p-3">
          <div className="mx-auto max-w-md bg-black/90 border border-white/25 rounded-lg p-3 text-white text-[12px] leading-relaxed">
            <p className="whitespace-pre-wrap mb-2">{dialogue.message}</p>
            {dialogue.choices?.length ? (
              <div className="flex flex-col gap-1.5">
                {dialogue.choices.map((c, i) => (
                  <button key={i} onClick={() => setDialogue(null)}
                    className="text-left px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded text-[11px]">
                    ▸ {c}
                  </button>
                ))}
              </div>
            ) : (
              <button onClick={() => setDialogue(null)}
                className="w-full text-center px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded text-[11px]">
                とじる
              </button>
            )}
          </div>
        </div>
      )}
      {/* 3D操作方法ナビ */}
      {is3d && showControlGuide && !dialogue && (
        <div className="absolute inset-0 flex items-start justify-start p-3 z-20 pointer-events-none transition-opacity duration-300">
          <div className="bg-black/95 border-2 border-white/40 p-4 max-w-xs text-white text-center shadow-2xl pointer-events-auto font-pixel">
            <h4 className="text-violet-400 font-bold text-[11px] mb-2.5 tracking-widest">操作方法</h4>
            <div className="space-y-2 text-[10px] text-gray-300 text-left">
              <div className="flex items-center justify-between gap-4">
                <span>移動/ストレイフ</span>
                <span className="bg-gray-800 border border-gray-600 px-1 py-0.5 text-white">[W][A][S][D]</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>左右に旋回</span>
                <span className="bg-gray-800 border border-gray-600 px-1 py-0.5 text-white">[◀][▶]</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>視点回転</span>
                <span className="bg-gray-800 border border-gray-600 px-1 py-0.5 text-white">[ドラッグ]</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>ジャンプ</span>
                <span className="bg-gray-800 border border-gray-600 px-1 py-0.5 text-white">[Space]</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>ダッシュ</span>
                <span className="bg-gray-800 border border-gray-600 px-1 py-0.5 text-white">[Shift]</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>話しかける</span>
                <span className="bg-gray-800 border border-gray-600 px-1 py-0.5 text-white">[E] / [F]</span>
              </div>
            </div>
            <div className="mt-3 text-[9px] text-gray-400 border-t-2 border-gray-700 pt-2">
              操作を行うとガイドは非表示になります
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default Yume25DMaker;
