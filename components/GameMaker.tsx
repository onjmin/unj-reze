'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { X, Play, Pause, RotateCcw, Smartphone, Image as ImageIcon, Music, Trash2, Save, Plus, Volume2, Shield, ShieldOff, Download, Upload, Settings } from 'lucide-react';
import { bgmManager } from '@/lib/BgmManager';
import { bgmRefToAsset, refLabel, parseWalkRef, imageRefToUrl, parseLoopFromRef, updateRefLoop, getLoopOption, getBgmVolume, parseBgmParams, updateRefBgmParams } from '@/lib/asset-ref';
import {
  detectStandard, standardById, animatedCell, dirFromDelta,
  type WayKey, type WalkStandard,
} from '@/lib/walk-sprite';
import { smcFrameRect, smcFrameCount } from '@/lib/smc-sprite';
import ContentPicker, { type PickResult } from './ContentPicker';
import { resolveSMCUrl, getSmcMetadata } from '@/lib/smc-helper';
import { segment } from '@/lib/tiny-segmenter';

import {
  TILE_SIZE, COLS, ROWS, PLAY_W, PLAY_H,
  uid, newObject,
  SPELL_PALETTE,
  type SpellBlock,
  type DialogueLine,
  type StagePhase,
  type SpellCardDef,
  type PresetId, type EngineKind, type NpcBehavior, type BulletType, type SfxTrigger,
  type ObjectKind, type TileDef, type SfxRef, type ObjectDef, type PresetData,
  type ObjType, type WarpTarget,
  type BattleMove, type SwitchDef, type ItemDef, type BattleConfig,
  type EventCommand, type EventPage, type EventCondition,
  type TitleScreenConfig, type EndingScreenConfig,
  defaultTitleScreen, defaultEndingScreen,
  type Layout25D,
} from './game-presets/shared';
import type { SceneDef, SceneExit } from './game-presets/shared';
import { PRESETS, PRESET_ORDER, PRESET_EMOJI, PRESET_TAGLINE } from './game-presets';
import SpellEditor, { defaultBlock } from './SpellEditor';
import DialogueCutscene, { type DialogueCutsceneHandle } from './DialogueCutscene';
import SpellCutscene from './SpellCutscene';
import { parseMiniScript, runMiniScript, type MiniEnv } from './MiniScriptVM';
import Yume25DMaker, { type Yume25DMakerHandle, type Yume25DTool, yume25dTexList } from './Yume25DMaker';
import Yume25DEditorPanel from './Yume25DEditorPanel';

export type { PresetId };

let cachedPixelFontFamily: string | null = null;
/** HUD/ダイアログのcanvas描画に使うピクセルアートフォント名を取得（next/fontのCSS変数から解決） */
function getPixelFontFamily(): string {
  if (cachedPixelFontFamily) return cachedPixelFontFamily;
  if (typeof document === 'undefined') return 'monospace';
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--font-pixel').trim();
  cachedPixelFontFamily = raw || 'monospace';
  return cachedPixelFontFamily;
}

function colorFromId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 70%, 55%)`;
}

/** 行頭に来てはいけない文字（禁則：句読点・閉じ括弧・促音/拗音など） */
const KINSOKU_LINE_HEAD_FORBIDDEN = new Set(
  '、。，．・：；？！ーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ）］｝」』】〉》ヽヾゝゞ々）〕,.!?)]}'.split(''),
);

/** 文節（単語）単位で詰め、語の途中で改行しないよう wrapSegments で改行する */
function wrapWithKinsoku(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    // 形態素的な単語境界でトークン化し、句読点等は直前の語にくっつける
    const rawTokens = segment(paragraph);
    const tokens: string[] = [];
    for (const t of rawTokens) {
      if (tokens.length > 0 && KINSOKU_LINE_HEAD_FORBIDDEN.has(t[0])) {
        tokens[tokens.length - 1] += t;
      } else {
        tokens.push(t);
      }
    }

    let line = '';
    for (const token of tokens) {
      const candidate = line + token;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = '';
      }
      // 1トークン自体が最大幅を超える場合は文字単位でも改行する
      if (ctx.measureText(line + token).width > maxWidth && !line) {
        let chunk = '';
        for (const ch of token) {
          const next = chunk + ch;
          if (chunk && ctx.measureText(next).width > maxWidth) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk = next;
          }
        }
        line = chunk;
      } else {
        line += token;
      }
    }
    lines.push(line);
  }
  return lines;
}

type EditorTab = 'map' | 'object' | 'char' | 'asset' | 'spell' | 'sound' | 'screen';

/** 保存マニフェストは表示URLを持たないため、URL由来の参照(url:/walk:...:u:)だけロード時に復元する。
 *  post: 等の投稿参照は解決不能なので undefined のまま（従来挙動）。 */
const hydrateUrlFromRef = (ref?: string): string | undefined => {
  if (!ref) return undefined;
  const url = imageRefToUrl(ref);
  return url && (url.startsWith('http') || url.startsWith('/') || url.startsWith('data:')) ? url : undefined;
};

/** 保存用マニフェスト（テキスト/参照のみ）。docs/game-feature-design.md §4 */
export interface GameManifestDraft {
  preset: PresetId; engine: EngineKind; name: string; gravity: number; friction: number;
  player: { emoji: string; color: string; speed: number; jumpPower: number; w: number; h: number; start: { x: number; y: number }; spriteRef?: string;
    bombCount?: number; bombSpellName?: string; bombCutinCharName?: string; bombCutinImageUrl?: string; bombCutinImageX?: number; bombCutinImageY?: number; bombCutinScale?: number; };
  tiles: Record<number, { name: string; color: string; passable: boolean; special?: string; imageRef?: string }>;
  map: number[][];
  overlayMap?: number[][];
  objects: Array<Omit<ObjectDef, 'spriteUrl'>>;
  bgm: string;
  battleBgm?: string;
  bossBgm?: string;
  sfx: Partial<Record<SfxTrigger, string>>;
  mapBgRef?: string;
  scroll?: { worldCols: number; worldRows?: number };
  switches?: SwitchDef[];
  items?: ItemDef[];
  phases?: StagePhase[];
  titleScreen?: Omit<TitleScreenConfig, 'bgUrl'>;
  ending?: Omit<EndingScreenConfig, 'bgUrl'>;
  /** 2.5Dエンジン（yume25d）のレイアウト。 */
  layout25d?: Layout25D;
  /** シーン切り替えモード。各シーンのオブジェクトは spriteUrl を除く。 */
  scenes?: Array<Omit<SceneDef, 'objects' | 'bgm'> & { objects: Array<Omit<ObjectDef, 'spriteUrl'>>; bgm?: string }>;
  battle?: BattleConfig;
}

/** ズームビューポート：画面に表示するタイル数。canvas は PLAY_W×PLAY_H px 固定のまま ctx.scale で拡大。 */
const VIEW_COLS = 15;
const VIEW_ROWS = 11;
const VIEW_W = VIEW_COLS * TILE_SIZE;   // 480 px
const VIEW_H = VIEW_ROWS * TILE_SIZE;   // 352 px
const SCALE_X = PLAY_W / VIEW_W;        // 640/480 = 4/3
const SCALE_Y = PLAY_H / VIEW_H;        // 480/352 = 15/11

const YT_BGM = 'https://www.youtube.com/watch?v=0_jEpB40aYw';

/** 全シーンを1枚のワールドマップに合成する。シーン0を原点にBFS展開。
 *  各シーンの実寸（map の行数・列数）を使うので DQ フィールドなどの非標準サイズも正しく扱う。 */
function buildWorldLayout(scenes: SceneDef[]): {
  map: number[][];
  overlayMap: number[][];
  layouts: Array<{ sceneIdx: number; originX: number; originY: number; sceneW: number; sceneH: number }>;
  worldCols: number;
  worldRows: number;
} {
  if (!scenes.length) return {
    map: Array.from({ length: ROWS }, () => Array(COLS).fill(0)),
    overlayMap: Array.from({ length: ROWS }, () => Array(COLS).fill(0)),
    layouts: [], worldCols: COLS, worldRows: ROWS,
  };
  const layouts: Array<{ sceneIdx: number; originX: number; originY: number; sceneW: number; sceneH: number }> = [];
  const placed = new Set<number>();
  const q: Array<{ idx: number; ox: number; oy: number }> = [{ idx: 0, ox: 0, oy: 0 }];
  let maxC = 0, maxR = 0;
  while (q.length) {
    const { idx, ox, oy } = q.shift()!;
    if (placed.has(idx)) continue;
    placed.add(idx);
    const sm = scenes[idx].map;
    const sceneW = sm[0]?.length ?? COLS;
    const sceneH = sm.length ?? ROWS;
    layouts.push({ sceneIdx: idx, originX: ox, originY: oy, sceneW, sceneH });
    maxC = Math.max(maxC, ox + sceneW); maxR = Math.max(maxR, oy + sceneH);
    const exits = scenes[idx].exits;
    if (!exits) continue;
    const add = (id: string | undefined, dox: number, doy: number) => {
      if (!id) return;
      const ni = scenes.findIndex(s => s.id === id);
      if (ni >= 0 && !placed.has(ni)) q.push({ idx: ni, ox: ox + dox, oy: oy + doy });
    };
    add(exits.right, sceneW, 0); add(exits.left, -sceneW, 0);
    add(exits.down, 0, sceneH); add(exits.up, 0, -sceneH);
  }
  const map: number[][] = Array.from({ length: maxR }, () => Array(maxC).fill(0));
  const overlayMap: number[][] = Array.from({ length: maxR }, () => Array(maxC).fill(0));
  for (const { sceneIdx, originX, originY, sceneW, sceneH } of layouts) {
    const sm = scenes[sceneIdx].map;
    const som = scenes[sceneIdx].overlayMap;
    for (let r = 0; r < sceneH; r++) for (let c = 0; c < sceneW; c++) {
      map[originY + r][originX + c] = sm[r]?.[c] ?? 0;
      overlayMap[originY + r][originX + c] = som?.[r]?.[c] ?? 0;
    }
  }
  return { map, overlayMap, layouts, worldCols: maxC, worldRows: maxR };
}

/** map と同サイズの空グリッド（overlayMap の既定値）を作る。 */
const emptyGridLike = (map: number[][]): number[][] =>
  map.map(row => new Array(row.length).fill(0));

const BEHAVIOR_LABELS: Record<NpcBehavior, string> = { still: '静止', random: 'ランダム', chase: '追尾', flee: '逃走', patrolH: '左右往復', patrolV: '上下往復', walker: '歩行（崖で反転）' };
const BULLET_LABELS: Record<BulletType, string> = { none: 'なし', aimed: '狙い弾', spread: '拡散', spiral: '回転' };
const OBJECT_KIND_LABELS: Record<ObjectKind, string> = { npc: 'NPC / 敵', tile: 'タイル', bullet: '弾 / 攻撃' };
const OBJTYPE_LABELS: Record<ObjType, string> = { enemy: '敵', npc: 'NPC', item: 'アイテム', warp: 'ワープ', event: 'イベント', platform: '動くリフト' };
const SFX_LABELS: Record<SfxTrigger, string> = { jump: 'ジャンプ', shot: 'ショット', clear: 'クリア', damage: 'ミス/被弾', graze: 'グレイズ', spellcard: 'スペルカード', levelup: 'レベルアップ', purchase: '購入', inn: '宿泊', coin: 'コイン' };

const clone = (d: PresetData): PresetData => JSON.parse(JSON.stringify(d));

/** 現在のワールド幅／高さ（タイル数）。scroll 優先、無ければマップ実寸。 */
const curWorldCols = (d: PresetData): number => d.scroll?.worldCols ?? d.map[0]?.length ?? COLS;
const curWorldRows = (d: PresetData): number => d.scroll?.worldRows ?? d.map.length ?? ROWS;

/** ワールドサイズ（幅・高さ＝タイル数）を変更する。マップを拡縮し、scroll を更新。
 *  画面サイズ（COLS×ROWS）と同じなら scroll を外して 1 画面固定に戻す。 */
const resizeGrid = (grid: number[][], w: number, h: number): number[][] => {
  let g = grid.map(row => {
    const next = row.slice(0, w);
    while (next.length < w) next.push(0);
    return next;
  });
  g = g.slice(0, h);
  while (g.length < h) g.push(new Array(w).fill(0));
  return g;
};

const applyWorldSize = (d: PresetData, cols: number, rows: number): PresetData => {
  const w = Math.max(COLS, Math.round(cols));
  const h = Math.max(ROWS, Math.round(rows));
  const map = resizeGrid(d.map, w, h);
  const overlayMap = resizeGrid(d.overlayMap ?? emptyGridLike(d.map), w, h);
  return { ...d, map, overlayMap, scroll: (w > COLS || h > ROWS) ? { worldCols: w, worldRows: h } : undefined };
};

async function playSfx(s?: SfxRef) {
  if (!s || !s.src) return;
  const volume = s.ref ? getBgmVolume(s.ref) : 50;
  if (s.type === 'direct') {
    const a = new Audio(s.src);
    a.volume = (volume / 100) * 0.7;
    a.play().catch(() => {});
    return;
  }
  if (s.type !== 'mml') return; // youtube は即時再生に不向きなので無視
  try {
    const { playMML } = await import('@onjmin/dtm');
    playMML(s.src, { loop: false, volume: volume });
  } catch (e) {
    console.error(e);
  }
}

// ── 弾幕スクリプト実行状態 ──────────────────────────────────────────
interface SpellFrame { script: SpellBlock[]; ip: number; timesLeft: number; }
interface SpellExecState { stack: SpellFrame[]; frame: number; waitLeft: number; }

interface MoveTarget { tx: number; ty: number; frames: number; elapsed: number; sx: number; sy: number; }
interface Entity {
  def: ObjectDef; x: number; y: number; homeX: number; homeY: number;
  hp: number; timer: number; vx: number; vy: number; talked: boolean;
  isGrounded?: boolean; // 横スク（action）敵の接地状態
  spellState?: SpellExecState;
  moveTarget?: MoveTarget;
  scriptCtx?: { cancelled: boolean };
  /** マリオ系・ノコノコの甲羅状態。undefined=通常, 'idle'=静止甲羅, 'slide'=滑走甲羅。SMC core 準拠。 */
  shellState?: 'idle' | 'slide';
  /** 甲羅を蹴った直後、プレイヤーへ即ダメージを与えないための猶予フレーム。 */
  shellGrace?: number;
  /** ブロックから出現するアイテムのせり上がり残フレーム数。 */
  spawnGrace?: number;
  /** レゼ専用：上半身を投げてから爆発するまで true（再投擲不可・自身は下半分のみ表示）。 */
  bombThrown?: boolean;
  rezeState?: 'charge' | 'flank' | 'normal';
  rezeStateTimer?: number;
  /** 味方モブが攻撃されて怯え、プレイヤーから逃げるようになった状態。 */
  fleeing?: boolean;
}
// onjReze: 近接攻撃の剣スプライト（素材は右向きが基準）
const SWORD_SPRITE_URL = 'https://rpgen-search.pages.dev/data/images/sprites/BkIGjOn.png';
// ── マリオ系アクションの落下・踏みつけ定数（SMC core 準拠）─────────────────
/** 終端速度 px/frame。32px タイルのすり抜け（トンネリング）を防ぎ、SMC 風の落下感を出す。 */
const ACTION_MAX_FALL = 20;
/** ジャンプ力に対する踏みつけ跳ね返り比（敵を踏んだ瞬間の上昇速度）。 */
const STOMP_BOUNCE_RATIO = 0.7;
/** 蹴られた甲羅の滑走速度 px/frame。プレイヤー速度より速く設定。 */
const SHELL_SPEED = 7;
/** 甲羅を蹴った直後、プレイヤーへダメージを与えない猶予フレーム数。 */
const SHELL_KICK_GRACE = 12;

interface Bullet { x: number; y: number; w: number; h: number; vy: number; vx?: number; color?: string; bounce?: boolean; }
interface EnemyBullet { x: number; y: number; vx: number; vy: number; r: number; color: string; grazed?: boolean; accel?: number; maxSpeed?: number; vanishIn?: number; }

// ── 空間グリッド（弾幕当たり判定高速化）────────────────────────────────────
// セルサイズを最大弾半径の2倍以上に設定することで漏れなし保証。
const GRID_CELL = 48;
class BulletGrid {
  private cells = new Map<number, EnemyBullet[]>();
  private cols: number;
  constructor(worldW: number) { this.cols = Math.ceil(worldW / GRID_CELL) + 1; }
  clear() { this.cells.clear(); }
  insert(b: EnemyBullet) {
    const key = this.key(b.x, b.y);
    let cell = this.cells.get(key);
    if (!cell) { cell = []; this.cells.set(key, cell); }
    cell.push(b);
  }
  /** 半径 radius 以内に存在する可能性がある弾を返す（偽陽性あり・漏れなし） */
  query(x: number, y: number, radius: number): EnemyBullet[] {
    const r = Math.ceil(radius / GRID_CELL);
    const cx0 = Math.floor(x / GRID_CELL), cy0 = Math.floor(y / GRID_CELL);
    const result: EnemyBullet[] = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const cell = this.cells.get((cx0 + dx) + (cy0 + dy) * this.cols);
        if (cell) for (const b of cell) result.push(b);
      }
    }
    return result;
  }
  private key(x: number, y: number) {
    return Math.floor(x / GRID_CELL) + Math.floor(y / GRID_CELL) * this.cols;
  }
}

/** 弾幕スクリプトを 1 ステップ進める（game loop から毎フレーム呼ぶ）。 */
function stepSpell(
  state: SpellExecState,
  enemyBullets: EnemyBullet[],
  ecx: number, ecy: number,
  pcx: number, pcy: number,
) {
  if (state.waitLeft > 0) { state.waitLeft--; state.frame++; return; }
  if (state.stack.length === 0) return;

  const frame = state.stack[state.stack.length - 1];
  const block = frame.script[frame.ip];

  if (!block) {
    // このフレームのスクリプトが終了
    if (frame.timesLeft !== 0) {
      frame.ip = 0;
      if (frame.timesLeft > 0) frame.timesLeft--;
      // timesLeft === -1 は無限ループ（ルートスクリプト用）
    } else {
      state.stack.pop();
    }
    state.frame++;
    return;
  }

  const col = SPELL_PALETTE[block.color % SPELL_PALETTE.length] ?? '#fff';

  switch (block.kind) {
    case 'wait':
      state.waitLeft = Math.max(0, block.frames - 1);
      frame.ip++;
      break;
    case 'nway': {
      const n = Math.max(1, block.ways);
      const sp = block.speed;
      const baseA = block.angle * Math.PI / 180;
      const totalSpread = block.spread * Math.PI / 180;
      for (let i = 0; i < n; i++) {
        const a = n === 1 ? baseA : baseA - totalSpread / 2 + totalSpread * i / (n - 1);
        enemyBullets.push({ x: ecx, y: ecy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 5, color: col });
      }
      frame.ip++;
      break;
    }
    case 'aimed': {
      const base = Math.atan2(pcy - ecy, pcx - ecx);
      const j = (block.jitter * Math.PI / 180) * (Math.random() * 2 - 1);
      const sp = block.speed;
      const a = base + j;
      enemyBullets.push({ x: ecx, y: ecy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 5, color: col });
      frame.ip++;
      break;
    }
    case 'spiral': {
      const ways = Math.max(1, block.ways);
      const sp = block.speed;
      const rotSpd = block.rotSpeed;
      for (let i = 0; i < ways; i++) {
        const a = (state.frame * rotSpd + i * 360 / ways) * Math.PI / 180;
        enemyBullets.push({ x: ecx, y: ecy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 5, color: col });
      }
      frame.ip++;
      break;
    }
    case 'repeat': {
      frame.ip++; // 親の ip を repeat の次へ進める
      const body = block.body ?? [];
      if (body.length > 0) {
        state.stack.push({ script: body, ip: 0, timesLeft: Math.max(0, block.times - 1) });
      }
      break;
    }
    default:
      frame.ip++;
  }
  state.frame++;
}

const DEG_TO_RAD = Math.PI / 180;

/** MiniScript を非同期実行し、エンティティの動き・弾幕を制御する */
function runEntityScript(
  src: string,
  entity: Entity,
  eng: { enemyBullets: EnemyBullet[] },
  getPlayer: () => { x: number; y: number },
): void {
  const ctx = { cancelled: false };
  entity.scriptCtx = ctx;

  const startX = entity.x + TILE_SIZE / 2;
  const startY = entity.y + TILE_SIZE / 2;

  // cancelled 時は resolve ではなく reject → while/for ループを async 例外で脱出
  const CANCEL = Symbol('cancel');
  const wait = (frames: number): Promise<void> =>
    new Promise((res, rej) => {
      if (ctx.cancelled) { rej(CANCEL); return; }
      const target = entity.timer + Math.max(0, frames | 0);
      const check = () => {
        if (ctx.cancelled) { rej(CANCEL); return; }
        if (entity.timer >= target) { res(); return; }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });

  const pushBullet = (angle: number, speed: number, colorIdx: number) => {
    if (ctx.cancelled) return;
    const r = angle * DEG_TO_RAD;
    const cx = entity.x + TILE_SIZE / 2, cy = entity.y + TILE_SIZE / 2;
    eng.enemyBullets.push({
      x: cx, y: cy,
      vx: Math.cos(r) * speed, vy: Math.sin(r) * speed,
      r: 5, color: SPELL_PALETTE[((colorIdx | 0) + 9) % 9],
      shape: entity.def.bulletShape ?? 'circle',
    } as typeof eng.enemyBullets[0]);
  };

  const env: MiniEnv = {
    // タイミング
    wait,

    // 位置取得（中心座標）
    getX: () => entity.x + TILE_SIZE / 2,
    getY: () => entity.y + TILE_SIZE / 2,

    // 移動
    move: (vx: unknown, vy: unknown) => { entity.vx = +(vx as number); entity.vy = +(vy as number); },
    stop: () => { entity.vx = 0; entity.vy = 0; },
    moveTo: (tx: unknown, ty: unknown, frames: unknown) => {
      const f = Math.max(1, (frames as number) | 0);
      entity.moveTarget = {
        tx: +(tx as number) - TILE_SIZE / 2, ty: +(ty as number) - TILE_SIZE / 2,
        frames: f, elapsed: 0, sx: entity.x, sy: entity.y,
      };
      entity.vx = 0; entity.vy = 0;
      return wait(f);
    },
    moveBoss: (x: unknown, y: unknown, frames: unknown) =>
      (env.moveTo as (x:unknown,y:unknown,f:unknown) => Promise<void>)(x, y, frames),

    // 弾幕
    shot: (angle: unknown, speed: unknown, color: unknown = 0) =>
      pushBullet(+(angle as number), +(speed as number), (color as number) | 0),
    shotN: (ways: unknown, baseAngle: unknown, spread: unknown, speed: unknown, color: unknown = 0) => {
      const n = (ways as number) | 0;
      for (let i = 0; i < n; i++) {
        const a = +(baseAngle as number) + (n > 1 ? (i / (n - 1) - 0.5) * +(spread as number) : 0);
        pushBullet(a, +(speed as number), (color as number) | 0);
      }
    },
    shotPlayer: (speed: unknown, color: unknown = 0, jitter: unknown = 0) => {
      const p = getPlayer();
      const angle = Math.atan2(p.y - (entity.y + TILE_SIZE / 2), p.x - (entity.x + TILE_SIZE / 2)) / DEG_TO_RAD;
      pushBullet(angle + (Math.random() * 2 - 1) * +(jitter as number), +(speed as number), (color as number) | 0);
    },
    shotSpiral: (ways: unknown, baseAngle: unknown, speed: unknown, color: unknown = 0) => {
      const n = (ways as number) | 0;
      for (let i = 0; i < n; i++) pushBullet(+(baseAngle as number) + i * (360 / n), +(speed as number), (color as number) | 0);
    },
    /** 全方向均等リング弾 shotRing(ways, speed, color) */
    shotRing: (ways: unknown, speed: unknown, color: unknown = 0) => {
      const n = Math.max(1, (ways as number) | 0);
      for (let i = 0; i < n; i++) pushBullet(i * (360 / n), +(speed as number), (color as number) | 0);
    },
    /** 加速弾：プレイヤー方向へ初速 initSpeed から accel ずつ加速し maxSpeed で頭打ち。vanishTime フレーム後自動消滅。 */
    shotPlayerAccel: (initSpeed: unknown, accel: unknown, maxSpeed: unknown, vanishTime: unknown, color: unknown = 0, jitter: unknown = 0) => {
      if (ctx.cancelled) return;
      const p = getPlayer();
      const angle = Math.atan2(p.y - (entity.y + TILE_SIZE / 2), p.x - (entity.x + TILE_SIZE / 2));
      const jitterRad = (+(jitter as number)) * DEG_TO_RAD * (Math.random() * 2 - 1);
      const a = angle + jitterRad;
      const spd = +(initSpeed as number);
      const col = SPELL_PALETTE[(((color as number) | 0) + 9) % 9];
      const cx = entity.x + TILE_SIZE / 2, cy = entity.y + TILE_SIZE / 2;
      eng.enemyBullets.push({
        x: cx, y: cy,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        r: 5, color: col,
        accel: +(accel as number),
        maxSpeed: +(maxSpeed as number),
        vanishIn: Math.max(1, (vanishTime as number) | 0),
      });
    },

    // プレイヤー情報
    getPlayerAngle: () => {
      const p = getPlayer();
      return Math.atan2(p.y - (entity.y + TILE_SIZE / 2), p.x - (entity.x + TILE_SIZE / 2)) / DEG_TO_RAD;
    },
    getPlayerX: () => getPlayer().x,
    getPlayerY: () => getPlayer().y,

    // 自己制御
    exit: () => { ctx.cancelled = true; entity.hp = 0; },

    // ボス用
    setSpellName: (name: unknown) => { if (entity.def.name !== undefined) entity.def.name = String(name); },

    // 数学
    abs: Math.abs, floor: Math.floor, ceil: Math.ceil,
    round: (x: unknown, d: unknown = 0) => Number(Math.round(+(x as number) * 10 ** +(d as number)) / 10 ** +(d as number)),
    sqrt: Math.sqrt, min: Math.min, max: Math.max,
    sin: (d: unknown) => Math.sin(+(d as number) * DEG_TO_RAD),
    cos: (d: unknown) => Math.cos(+(d as number) * DEG_TO_RAD),
    pi: Math.PI,
    rand: (mn: unknown, mx: unknown) => Math.floor(Math.random() * (+(mx as number) - +(mn as number) + 1)) + +(mn as number),
    randF: (mn: unknown, mx: unknown) => Math.random() * (+(mx as number) - +(mn as number)) + +(mn as number),
    range: (from: unknown, to: unknown, step: unknown = 1) => {
      const out: number[] = [];
      const s = +(step as number) || 1;
      for (let i = +(from as number); s > 0 ? i <= +(to as number) : i >= +(to as number); i += s) out.push(i);
      return out;
    },

    // エンティティ定数
    col: entity.def.col,
    row: entity.def.row,
    startX,
    startY,
    W: VIEW_W,
    H: VIEW_H,
  };

  const lines = parseMiniScript(src);
  (async () => {
    try { await runMiniScript(lines, env, {}); }
    catch (e) { if (e !== CANCEL) console.warn('[MiniScript]', e); }
  })();
}

interface GameEngine {
  map: number[][];
  player: { x: number; y: number; vx: number; vy: number; isGrounded: boolean };
  keys: Set<string>;
  bullets: Bullet[];
  enemyBullets: EnemyBullet[];
  entities: Entity[];
  shotTimer: number;
  animId: number;
}

/** ObjectDef からエンティティを生成（フェーズ一斉配置・wave スクリプト共通）。 */
function makePhaseEntity(o: ObjectDef, touhou: boolean): Entity {
  return {
    def: o,
    x: o.col * TILE_SIZE,
    y: (touhou && !o.isBoss) ? -TILE_SIZE * 2 : o.row * TILE_SIZE,
    homeX: o.col * TILE_SIZE, homeY: o.row * TILE_SIZE,
    hp: o.hp, timer: 0, vx: 0, vy: 0, talked: false,
    spellState: o.spellScript?.length
      ? { stack: [{ script: o.spellScript, ip: 0, timesLeft: -1 }], frame: 0, waitLeft: 0 }
      : undefined,
  };
}

/** wave 出現スクリプト（ゼビウス風）。spawn(敵, x, y) で雑魚を時間差スポーンする。
 *  ctx.cancelled で停止。完了/中断時に onDone を呼ぶ（フェーズ進行判定で参照）。 */
function runWaveScript(
  src: string,
  templates: ObjectDef[],
  eng: GameEngine,
  getPlayer: () => { x: number; y: number },
  ctx: { cancelled: boolean },
  onDone: () => void,
): void {
  const CANCEL = Symbol('cancel');
  let frame = 0;
  const tick = () => { if (ctx.cancelled) return; frame++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);

  const wait = (frames: unknown): Promise<void> => new Promise((res, rej) => {
    if (ctx.cancelled) { rej(CANCEL); return; }
    const target = frame + Math.max(0, (frames as number) | 0);
    const check = () => {
      if (ctx.cancelled) { rej(CANCEL); return; }
      if (frame >= target) { res(); return; }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });

  const findTemplate = (ref: unknown): ObjectDef | undefined => {
    if (typeof ref === 'number') return templates[((ref as number) | 0) - 1];
    const s = String(ref);
    return templates.find(t => (t.name ?? '') === s)
      ?? templates.find(t => t.emoji === s)
      ?? (/^\d+$/.test(s) ? templates[parseInt(s, 10) - 1] : undefined);
  };

  const spawnOne = (t: ObjectDef, x: number, y: number) => {
    if (ctx.cancelled) return;
    const e: Entity = {
      def: t,
      x: x - TILE_SIZE / 2, y: y - TILE_SIZE / 2,
      homeX: x - TILE_SIZE / 2, homeY: y - TILE_SIZE / 2,
      hp: t.hp, timer: 0, vx: 0, vy: 0, talked: false,
      spellState: t.spellScript?.length
        ? { stack: [{ script: t.spellScript, ip: 0, timesLeft: -1 }], frame: 0, waitLeft: 0 }
        : undefined,
    };
    if (t.miniScript) runEntityScript(t.miniScript, e, eng, getPlayer);
    eng.entities.push(e);
  };

  const env: MiniEnv = {
    wait,
    /** spawn(敵名 or 番号, x=中央, y=画面上端) */
    spawn: (ref: unknown, x: unknown = VIEW_W / 2, y: unknown = -TILE_SIZE) => {
      const t = findTemplate(ref);
      if (t) spawnOne(t, +(x as number), +(y as number));
      else console.warn('[WaveScript] 未知の敵参照:', ref);
    },
    /** spawnRow(敵, 個数, y, x開始, x間隔)：横一列に並べてスポーン */
    spawnRow: (ref: unknown, count: unknown, y: unknown = -TILE_SIZE, x0: unknown = 60, gap: unknown = 60) => {
      const t = findTemplate(ref);
      if (!t) { console.warn('[WaveScript] 未知の敵参照:', ref); return; }
      const n = Math.max(0, (count as number) | 0);
      for (let i = 0; i < n; i++) spawnOne(t, +(x0 as number) + i * +(gap as number), +(y as number));
    },
    count: templates.length,
    getPlayerX: () => getPlayer().x,
    getPlayerY: () => getPlayer().y,
    abs: Math.abs, floor: Math.floor, ceil: Math.ceil,
    round: (x: unknown, d: unknown = 0) => Number(Math.round(+(x as number) * 10 ** +(d as number)) / 10 ** +(d as number)),
    sqrt: Math.sqrt, min: Math.min, max: Math.max,
    sin: (d: unknown) => Math.sin(+(d as number) * DEG_TO_RAD),
    cos: (d: unknown) => Math.cos(+(d as number) * DEG_TO_RAD),
    pi: Math.PI,
    rand: (mn: unknown, mx: unknown) => Math.floor(Math.random() * (+(mx as number) - +(mn as number) + 1)) + +(mn as number),
    randF: (mn: unknown, mx: unknown) => Math.random() * (+(mx as number) - +(mn as number)) + +(mn as number),
    range: (from: unknown, to: unknown, step: unknown = 1) => {
      const out: number[] = [];
      const s = +(step as number) || 1;
      for (let i = +(from as number); s > 0 ? i <= +(to as number) : i >= +(to as number); i += s) out.push(i);
      return out;
    },
    W: VIEW_W, H: VIEW_H,
  };

  (async () => {
    try { await runMiniScript(parseMiniScript(src), env, {}); }
    catch (e) { if (e !== CANCEL) console.warn('[WaveScript]', e); }
    finally { ctx.cancelled = true; onDone(); }
  })();
}

/** フェーズ phaseIdx のエンティティを生成。kind=wave かつ spawnScript があれば
 *  ボスのみ即時配置し、雑魚は wave スクリプトで時間差スポーンする。 */
function buildPhaseEntities(
  phaseIdx: number,
  gameData: PresetData,
  eng: GameEngine,
  waveCtx: { current: { cancelled: boolean } | null },
  waveRunning: { current: boolean },
): Entity[] {
  const touhou = gameData.engine === 'touhou';
  const objs = (gameData.objects ?? []).filter(o => (o.phase ?? 0) === phaseIdx);
  const phase = gameData.phases?.[phaseIdx];
  const script = (touhou && phase?.kind !== 'boss') ? (phase?.spawnScript ?? '').trim() : '';

  // 前のウェーブスクリプトを停止
  if (waveCtx.current) waveCtx.current.cancelled = true;
  waveRunning.current = false;

  if (script) {
    const templates = objs.filter(o => !o.isBoss);
    const immediate = objs.filter(o => o.isBoss).map(o => makePhaseEntity(o, touhou));
    immediate.forEach(e => { if (e.def.miniScript) runEntityScript(e.def.miniScript, e, eng, () => eng.player); });
    const ctx = { cancelled: false };
    waveCtx.current = ctx;
    waveRunning.current = true;
    runWaveScript(script, templates, eng, () => eng.player, ctx, () => { if (waveCtx.current === ctx) waveRunning.current = false; });
    return immediate;
  }

  const entities = objs.map(o => makePhaseEntity(o, touhou));
  if (touhou) entities.forEach(e => { if (e.def.miniScript) runEntityScript(e.def.miniScript, e, eng, () => eng.player); });
  return entities;
}

// SMC素材は「不透明なマット背景（単色）」を持ち、alpha 透明を一切含まない（縁取り枠やバナーが
// 焼き込まれているシートもある）。そのまま canvas に描くと素材の周囲に矩形が残るため、読込時に
// マット色を検出して許容誤差つきで透明化したオフスクリーン canvas を作る。
//  判定（SMC素材 と 透明素材 の切り分け）:
//   1) 既に透明ピクセルを十分持つ画像（RPGen等の通常PNG）は対象外 → null（他プリセットへ無影響）。
//   2) ほぼ不透明な画像のみ「最頻色」をマットとみなす。占有率が低ければ素材色の誤検出なので null。
//      最頻色判定は四隅や縁取り枠に影響されず、シート支配色（=マット）を正しく拾える。
//  CORS で getImageData が tainted の場合は null を返し、呼び出し側は元画像にフォールバック。
const CHROMA_TOL = 18;
const CHROMA_MIN_COVERAGE = 0.18;
const CHROMA_MAX_EXISTING_ALPHA = 0.02; // これ以上 alpha<250 を含む画像は「透明素材」とみなしスキップ
function makeChromaKeyed(img: HTMLImageElement): HTMLCanvasElement | null {
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) return null;
  const cnv = document.createElement('canvas');
  cnv.width = w; cnv.height = h;
  const c = cnv.getContext('2d', { willReadFrequently: true });
  if (!c) return null;
  c.drawImage(img, 0, 0);
  let data: ImageData;
  try { data = c.getImageData(0, 0, w, h); } catch { return null; } // tainted
  const px = data.data;
  const total = w * h;
  // 1) 既存の透明度をチェック（透明素材は対象外）＋ 最頻色ヒストグラム（不透明ピクセルのみ）
  const hist = new Map<number, number>();
  let translucent = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 250) { translucent++; continue; }
    const k = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
    hist.set(k, (hist.get(k) ?? 0) + 1);
  }
  if (translucent / total > CHROMA_MAX_EXISTING_ALPHA) return null; // 透明素材 → キーイングしない
  let bestKey = -1, bestN = 0;
  for (const [k, n] of hist) if (n > bestN) { bestN = n; bestKey = k; }
  if (bestKey < 0 || bestN / total < CHROMA_MIN_COVERAGE) return null; // マットが支配的でない
  const kr = (bestKey >> 16) & 0xff, kg = (bestKey >> 8) & 0xff, kb = bestKey & 0xff;
  // 2) 最頻色（マット）を許容誤差つきで透明化
  let keyed = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] !== 0 &&
        Math.abs(px[i] - kr) <= CHROMA_TOL &&
        Math.abs(px[i + 1] - kg) <= CHROMA_TOL &&
        Math.abs(px[i + 2] - kb) <= CHROMA_TOL) {
      px[i + 3] = 0; keyed++;
    }
  }
  if (keyed === 0) return null;
  c.putImageData(data, 0, 0);
  return cnv;
}

interface GameMakerProps {
  onClose: () => void;
  userId: string;
  onSave?: (manifest: GameManifestDraft, meta: { title: string; preset: PresetId }) => void;
  initialManifest?: GameManifestDraft;
  playOnly?: boolean;
  /** 親コンテナに収める（absolute overlay ではなく h-full flex-col） */
  embedded?: boolean;
  ghostPlayers?: { sessionId: string; x: number; y: number; emoji: string; color?: string }[];
  onPositionChange?: (x: number, y: number, emoji: string) => void;
  /** ゲームポストのID（コメント返信先） */
  postId?: string;
  /** ニコニコ風弾幕コメント（新しい文字列が追加されるたびに流れる） */
  danmakuComments?: string[];
  /** コメント送信コールバック */
  onComment?: (text: string, displayName: string) => void;
}

type PickTarget =
  | { t: 'player' } | { t: 'bgm' } | { t: 'battleBgm' } | { t: 'bossBgm' } | { t: 'tile'; id: number }
  | { t: 'sfx'; trigger: SfxTrigger } | { t: 'objsprite' } | { t: 'selObjSprite' } | { t: 'mapBg' }
  | { t: 'titleBg' } | { t: 'endingBg' } | { t: 'titleBgm' } | { t: 'endingBgm' }
  | { t: 'sceneBgm'; idx: number }
  | { t: 'yumeTex'; id: number };

const SpriteThumbnail = ({
  spriteRef,
  spriteUrl,
  emoji,
  size = 32,
  className = '',
  imgCache,
  keyedCache,
}: {
  spriteRef?: string;
  spriteUrl?: string;
  emoji?: string;
  size?: number;
  className?: string;
  imgCache: React.MutableRefObject<Map<string, HTMLImageElement>>;
  keyedCache: React.MutableRefObject<Map<string, HTMLCanvasElement>>;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const walk = spriteRef ? parseWalkRef(spriteRef) : null;
  let resolvedUrl = spriteUrl ?? (walk?.source.kind === 'url' ? walk.source.url : undefined);
  let resolvedSMC = resolvedUrl;
  let sxOffset = 0, syOffset = 0, swOffset = 0, shOffset = 0;
  let hasSMCFrame = false;

  if (walk?.stdId === 'smc_json' && resolvedUrl && walk.source.kind === 'url') {
    const parts = walk.source.url.split(':');
    const spriteKey = parts[1];
    let animName = parts[2];
    const spriteData = globalSmcMetadata?.[spriteKey];
    if (spriteData) {
      if (!animName) {
        if (spriteKey === 'Goomba') animName = '2Walk0_0';
        else if (spriteKey === 'KoopaTroopa') animName = '1Walk0';
        else if (spriteKey === 'DryBones') animName = '1Walk0';
        else if (spriteKey === 'Bobomb') animName = '1Walk0';
        else if (spriteKey === 'Boo') animName = '1Idle0';
        else animName = Object.keys(spriteData.animations)[0];
      }
      let anim = spriteData.animations[animName];
      if (!anim) anim = Object.values(spriteData.animations)[0];
      if (anim) {
        resolvedSMC = resolveSMCUrl(anim.frames[0].image);
        sxOffset = anim.frames[0].x;
        syOffset = anim.frames[0].y;
        swOffset = anim.frames[0].w;
        shOffset = anim.frames[0].h;
        hasSMCFrame = true;
      }
    }
  }

  const img = resolvedSMC ? imgCache.current.get(resolvedSMC) : undefined;
  const loaded = !!img && img.complete && img.naturalWidth > 0;

  useEffect(() => {
    if (!loaded || !resolvedSMC || !img || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    const srcImg = keyedCache.current.get(resolvedSMC) ?? img;

    let sx = 0, sy = 0, sw = imgW, sh = imgH;

    if (hasSMCFrame) {
      sx = sxOffset;
      sy = syOffset;
      sw = swOffset;
      sh = shOffset;
    } else if (walk?.crop) {
      const [csx, csy, csw, csh] = walk.crop;
      const frames = smcFrameCount(walk.crop, walk.frames);
      sw = csw / frames;
      sh = csh;
      sx = csx;
      sy = csy;
    } else {
      const hashIdx = resolvedUrl!.indexOf('#');
      if (hashIdx !== -1) {
        const frag = resolvedUrl!.slice(hashIdx + 1);
        const parts = frag.split(',').map(n => parseInt(n, 10));
        if (parts.length >= 4 && parts.every(n => !isNaN(n))) {
          sx = parts[0];
          sy = parts[1];
          sw = parts[2];
          sh = parts[3];
          if (parts.length >= 5 && parts[4] > 1) {
            sw = sw / parts[4];
          }
        }
      } else {
        const std = walk?.stdId === 'auto'
          ? detectStandard(imgW, imgH)
          : standardById(walk?.stdId ?? 'auto');
        const cols = std.frames;
        const rows = std.ways.length;
        sw = imgW / cols;
        sh = imgH / rows;
        // VX/MV standard first frame might be down-facing, column 1
        const idleCol = std.frames === 3 ? 1 : 0;
        sx = idleCol * sw;
        sy = 0;
      }
    }

    ctx.clearRect(0, 0, size, size);
    
    // Calculate destination coordinates to fit inside the canvas
    const zoom = Math.min(size / sw, size / sh);
    const destW = sw * zoom;
    const destH = sh * zoom;
    const destX = (size - destW) / 2;
    const destY = (size - destH) / 2;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(srcImg, sx, sy, sw, sh, destX, destY, destW, destH);
  }, [loaded, resolvedSMC, img, walk?.crop, walk?.stdId, walk?.frames, size, hasSMCFrame, sxOffset, syOffset, swOffset, shOffset]);

  if (loaded && resolvedUrl) {
    return (
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className={`shrink-0 ${className}`}
        style={{ imageRendering: 'pixelated', width: `${size}px`, height: `${size}px` }}
      />
    );
  }

  if (emoji) {
    return (
      <div className={`shrink-0 flex items-center justify-center font-emoji text-lg ${className}`} style={{ width: `${size}px`, height: `${size}px` }}>
        {emoji}
      </div>
    );
  }

  return (
    <div className={`shrink-0 bg-gray-800 rounded ${className}`} style={{ width: `${size}px`, height: `${size}px` }} />
  );
};

let globalSmcMetadata: any = null;

// SMC のスプライトは敵キャラの多くが「左向き」で描かれている（プレイヤー Mario / Toad は右向き）。
// drawSprite は既定で「右向き素材・左移動時に水平反転」を前提とするため、左向き素材を
// そのまま流すと進行方向と逆を向く＝ムーンウォークになる。これらは反転条件を逆にする。
const SMC_LEFT_FACING = new Set(['Goomba', 'Bobomb', 'BobOmb', 'KoopaTroopa', 'DryBones', 'Boo']);

let cachedBlastCanvas: HTMLCanvasElement | null = null;
function getBlastCanvas(): HTMLCanvasElement {
  if (cachedBlastCanvas) return cachedBlastCanvas;
  if (typeof document === 'undefined') {
    return {} as HTMLCanvasElement;
  }
  const cnv = document.createElement('canvas');
  cnv.width = 256;
  cnv.height = 256;
  const ctx = cnv.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, '#fff6c0');
  g.addColorStop(0.4, '#ff9d2a');
  g.addColorStop(1, 'rgba(229,62,62,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(128, 128, 128, 0, Math.PI * 2);
  ctx.fill();
  cachedBlastCanvas = cnv;
  return cnv;
}

export default function GameMaker({ onClose, userId, onSave, initialManifest, playOnly, embedded, ghostPlayers, onPositionChange, postId, danmakuComments, onComment }: GameMakerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [presetId, setPresetId] = useState<PresetId>('onjReze');
  const [gameData, setGameData] = useState<PresetData>(() => clone(PRESETS.onjReze));
  const [title, setTitle] = useState(PRESETS.onjReze.name);
  const [isPlaying, setIsPlaying] = useState(false);
  const [smcMetadata, setSmcMetadata] = useState<any>(null);
  useEffect(() => {
    if (globalSmcMetadata) {
      setSmcMetadata(globalSmcMetadata);
      return;
    }
    getSmcMetadata()
      .then(data => {
        globalSmcMetadata = data;
        setSmcMetadata(data);
      })
      .catch(e => console.error("Failed to load SMC metadata:", e));
  }, []);
  /** 新規作成時の入口ヒーロー（デモ再生＋あそぶ/改造の選択）。playOnly/編集再開/埋め込み時は出さない。 */
  const [introOpen, setIntroOpen] = useState(!playOnly && !initialManifest && !embedded);
  const [editorTab, setEditorTab] = useState<EditorTab>('map');
  /** 詳細タブ（アセット・サウンド・画面・会話）の表示フラグ。初回は非表示で圧迫感を減らす。 */
  const [showAdvancedTabs, setShowAdvancedTabs] = useState(false);
  /** マップタブの編集ツール（tile のみ。初期位置は🏁ドラッグで変更）。 */
  const [mapTool] = useState<'tile'>('tile');
  const isDraggingStartRef = useRef(false);
  const justStartedRef = useRef(false);
  const editorCoordRef = useRef<HTMLDivElement>(null);
  // ── タイトル／エンディング画面ランタイム ──
  const [showTitle, setShowTitle] = useState(false);
  const [showEnding, setShowEnding] = useState(false);
  const endingRef = useRef<EndingScreenConfig | undefined>(undefined);
  endingRef.current = gameData.ending;
  const [selectedTileId, setSelectedTileId] = useState(1);
  /** マップ編集タブでどちらのレイヤーに描画するか。'base'=地面(当たり判定あり) / 'overlay'=上層(プレイヤーより手前・半透明化)。 */
  const [editMapLayer, setEditMapLayer] = useState<'base' | 'overlay'>('base');
  const [objTemplate, setObjTemplate] = useState<ObjectDef>(() => newObject());
  const [editSpeedMult, setEditSpeedMult] = useState(1);
  const [editModeType, setEditModeType] = useState<'move_place' | 'panel_input'>('panel_input');
  // ── yume25d（ゆめにっき3D）編集パネルの状態。パネルをキャンバス外（サイドバー）に配置するため GameMaker 側で保持する。 ──
  const [yume25dView, setYume25dView] = useState<'2d' | '3d'>('3d');
  const [yume25dTool, setYume25dTool] = useState<Yume25DTool>('wall');
  const [yume25dLevel, setYume25dLevel] = useState(0);
  const [yume25dSelFloor, setYume25dSelFloor] = useState(() => yume25dTexList(gameData.layout25d, 'floor')[0]?.id ?? 0);
  const [yume25dSelWall, setYume25dSelWall] = useState(() => yume25dTexList(gameData.layout25d, 'wall')[0]?.id ?? 0);
  const [yume25dSelSprite, setYume25dSelSprite] = useState(() => yume25dTexList(gameData.layout25d, 'sprite')[0]?.id ?? 0);
  const [yume25dSettingsOpen, setYume25dSettingsOpen] = useState(false);
  const [yume25dTalkTargetId, setYume25dTalkTargetId] = useState<string | null>(null);
  /** 浮遊（ホバー）モード：ボタンは移動・設置モードパネル側に置くが、上昇/下降の実処理は engineRef を持つ Yume25DMaker に委譲する。 */
  const [yume25dHoverMode, setYume25dHoverMode] = useState(false);
  const yume25dMakerRef = useRef<Yume25DMakerHandle>(null);
  const [charSubTab, setCharSubTab] = useState<'jiki' | 'boss' | 'midboss' | 'zenhan' | 'kohan'>('jiki');
  const [selectedObjId, setSelectedObjId] = useState<string | null>(null);
  const selectedObjIdRef = useRef<string | null>(null);
  selectedObjIdRef.current = selectedObjId;
  // ── イベントランタイム ──
  const [switchVals, setSwitchVals] = useState<Record<number, boolean>>({});
  const switchValsRef = useRef<Record<number, boolean>>({});
  switchValsRef.current = switchVals;
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [shopModal, setShopModal] = useState<{ npcId: string; items: import('./game-presets/shared').ShopItem[] } | null>(null);
  const shopModalRef = useRef<typeof shopModal>(null);
  shopModalRef.current = shopModal;
  const [equipment, setEquipment] = useState<{ weapon?: string; armor?: string }>({});
  const equipmentRef = useRef<{ weapon?: string; armor?: string }>({});
  const inventoryRef = useRef<Record<string, number>>({});
  inventoryRef.current = inventory;
  const selfSwitchesRef = useRef<Record<string, Record<string, boolean>>>({});
  const eventRunningRef = useRef(false);
  const eventIdRef = useRef(0);
  const eventChoiceRef = useRef<{ text: string; choices: { label: string; commands: EventCommand[] }[]; onPick: (idx: number) => void } | null>(null);
  const [eventChoice, setEventChoice] = useState<{ text: string; choices: { label: string; commands: EventCommand[] }[]; onPick: (idx: number) => void } | null>(null);

  const [picker, setPicker] = useState<{ mode: 'image' | 'bgm'; target: PickTarget } | null>(null);
  const [showControlGuide, setShowControlGuide] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gameMsg, setGameMsg] = useState<{ text: string; mode: 'instant' | 'timed'; onDismiss: () => void } | null>(null);
  const gameMsgRef = useRef<typeof gameMsg>(null);
  gameMsgRef.current = gameMsg;
  const [gameOverResult, setGameOverResult] = useState<{ score: number; marioDeathAnim?: boolean } | null>(null);
  const gameMsgReadyRef = useRef(false);
  const gameMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewStopRef = useRef<(() => void) | null>(null);
  const ghostPlayersRef = useRef(ghostPlayers || []);

  // 弾幕コメント
  interface DanmakuItem { id: number; text: string; row: number; color: string; }
  const [danmakuItems, setDanmakuItems] = useState<DanmakuItem[]>([]);
  const danmakuCounterRef = useRef(0);
  const prevDanmakuLenRef = useRef(0);
  const DANMAKU_COLORS = ['#fff', '#ffd700', '#00ff88', '#ff88ff', '#88ffff', '#ff8844', '#aaffaa', '#ff4444'];

  useEffect(() => {
    const comments = danmakuComments || [];
    if (comments.length <= prevDanmakuLenRef.current) return;
    const newTexts = comments.slice(prevDanmakuLenRef.current);
    prevDanmakuLenRef.current = comments.length;
    newTexts.forEach((text, i) => {
      const id = ++danmakuCounterRef.current;
      const row = (id + i) % 7;
      const color = DANMAKU_COLORS[id % DANMAKU_COLORS.length];
      setDanmakuItems(prev => [...prev, { id, text, row, color }]);
      setTimeout(() => setDanmakuItems(prev => prev.filter(d => d.id !== id)), 6500);
    });
  }, [danmakuComments]);

  // コメント入力
  const [commentText, setCommentText] = useState('');
  const onPositionChangeRef = useRef(onPositionChange);
  ghostPlayersRef.current = ghostPlayers || [];
  onPositionChangeRef.current = onPositionChange;

  const engineRef = useRef<GameEngine>({
    map: [], player: { x: 50, y: 50, vx: 0, vy: 0, isGrounded: false },
    keys: new Set(), bullets: [], enemyBullets: [], entities: [], shotTimer: 0, animId: 0,
  });
  const imgCache = useRef<Map<string, HTMLImageElement>>(new Map());
  // マット背景を透明化したオフスクリーン canvas（描画ソース用）。キーは imgCache と同じ URL。
  const keyedCache = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const sfxRef = useRef<PresetData['sfx']>({});
  sfxRef.current = gameData.sfx;

  // スクロール（編集時のビュー位置・px）。world が画面を超えるプリセットで使用。
  const [editScroll, setEditScroll] = useState(0);
  const [editScrollY, setEditScrollY] = useState(0);
  const editScrollRef = useRef(0);
  const editScrollYRef = useRef(0);
  editScrollRef.current = editScroll;
  editScrollYRef.current = editScrollY;

  // ── ターン制戦闘 ──
  // mercy: こうどう技で溜まる「敵意がなくなった度」ゲージ 0〜100（アンダーテール系。labels.mercy 設定時のみUIに出る）
  interface BattleView { enemyName: string; enemyEmoji: string; enemyHp: number; enemyMaxHp: number; mercy: number; log: string[]; canAct: boolean; over: boolean; }
  const [battle, setBattle] = useState<BattleView | null>(null);
  const battleRef = useRef<{ active: boolean; entity: Entity | null; enemyName: string; enemyHp: number; enemyMaxHp: number; enemyAtk: number; enemyDef: number; enemyMoves: { name: string; power: number; heal?: boolean; miniScript?: string }[]; exp: number; gold: number; isBoss: boolean; mercy: number; miniScript?: string }>(
    { active: false, entity: null, enemyName: '', enemyHp: 0, enemyMaxHp: 0, enemyAtk: 0, enemyDef: 0, enemyMoves: [], exp: 0, gold: 0, isBoss: false, mercy: 0, miniScript: undefined });
  // baseAtk/baseDef は装備ボーナスを含まないレベル基礎値。atk/def = base + 装備ボーナス。
  const progressRef = useRef({ hp: 0, mp: 0, maxHp: 0, maxMp: 0, atk: 0, def: 0, baseAtk: 0, baseDef: 0, level: 1, exp: 0, expNext: 10, gold: 0 });
  const invulnRef = useRef(0);
  /** 上層タイル(overlay)の描画アルファ。プレイヤーが真下にいる間だけ滑らかに半透明化する。 */
  const overlayAlphaRef = useRef(1);
  /** 戦闘コマンド「どうぐ」のサブメニュー開閉。 */
  const [battleItemsOpen, setBattleItemsOpen] = useState(false);
  // ── アンダーテール風戦闘（battle.style === 'soul'）──
  // menu: コマンド選択 / attack: タイミングバー / dodge: バトルボックス内で弾幕よけ
  const [soulPhase, setSoulPhase] = useState<'menu' | 'attack' | 'dodge'>('menu');
  const [soulMenu, setSoulMenu] = useState<'root' | 'act' | 'item' | 'mercy'>('root');
  const soulDodgeRef = useRef<{ frames: number; duration: number; pattern: number; dmg: number; bullets: { x: number; y: number; vx: number; vy: number; r: number; color?: string }[]; hx: number; hy: number; invuln: number; miniScript?: string; scriptCtx?: { cancelled: boolean } } | null>(null);
  const soulBarRef = useRef({ pos: 0 });
  const soulBarElRef = useRef<HTMLDivElement | null>(null);
  const soulCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /** フィールドの 🎒 どうぐ袋モーダル開閉（rpg エンジン）。開いている間は移動を凍結。 */
  const [bagOpen, setBagOpen] = useState(false);
  const bagOpenRef = useRef(false);
  bagOpenRef.current = bagOpen;
  /** ランダムエンカウント：歩行距離ゲージ（px）と次の発生しきい値（px）。 */
  const encounterGaugeRef = useRef(0);
  const encounterNextRef = useRef(0);
  /** 画面シェイク残フレーム数（0=なし）。ヒット・爆発・ゲームオーバー時にセット。 */
  const shakeRef = useRef(0);
  // ── シーン切り替え ────────────────────────────────────────────────────────
  /** ゲームデータに紐付くシーン一覧（プレイ中はこちらを参照）。 */
  const scenesRef = useRef<SceneDef[]>([]);
  /** 現在プレイ中のシーンインデックス。 */
  const activeSceneIdxRef = useRef(0);
  /** エディタで選択中のシーンインデックス（UI用）。 */
  const [editSceneIdx, setEditSceneIdx] = useState(0);
  /** スライド遷移の状態。null なら遷移なし。 */
  const sceneTransRef = useRef<{
    dir: 'right' | 'left' | 'up' | 'down';
    frame: number;          // 0 → TRANS_FRAMES
    nextIdx: number;
    /** 遷移後の2倍幅/高さ合成マップ（cols: 2*COLS or rows: 2*ROWS）。 */
    wideMap: number[][];
    /** 遷移完了後のプレイヤー位置。 */
    entryX: number;
    entryY: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    startCamX: number;
    startCamY: number;
    endCamX: number;
    endCamY: number;
  } | null>(null);
  const TRANS_FRAMES = 24;
  /** 全シーン合成ワールドレイアウト（シーンモード時のみ）。 */
  const worldLayoutRef = useRef<ReturnType<typeof buildWorldLayout> | null>(null);
  /** オブジェクト触発フェード遷移（土管・扉など）。null なら非アクティブ。 */
  const sceneFadeRef = useRef<{
    phase: 'out' | 'in';
    frame: number;
    totalFrames: number;
    nextSceneId: string;
    entryX: number;
    entryY: number;
  } | null>(null);
  /** シーン間ワープ直後の再発動抑制。ワープ先の入場座標を保持し、そこから一定距離離れるまで
   *  ワープ（warpSceneId / warpTarget）の発動を無効化する（入場地点付近に別のワープがある場合の
   *  即座の巻き戻り・往復ループを防ぐ）。 */
  const warpCooldownRef = useRef<{ x: number; y: number } | null>(null);
  const roundOverRef = useRef(false);    // ミス/ゲームオーバー/クリア演出中（操作・進行を凍結）
  const isPlayerDeadRef = useRef(false); // 残機制：死亡→復帰待ち中
  const livesRef = useRef(3);            // 残機数
  const scoreRef = useRef(0);            // スコア
  const actionDirRef = useRef<1 | -1>(1);     // action エンジン：プレイヤー向き
  const actionShootCoolRef = useRef(0);        // action エンジン：射撃クールダウン
  const actionWeaponsRef = useRef<string[]>([]);
  const actionWeaponIdxRef = useRef<number>(0);
  const actionWeaponEnergyRef = useRef<Record<string, number>>({});
  const MAX_WEAPON_ENERGY = 28;
  const prevNextWeaponRef = useRef(false);
  // ── マリオ系パワーアップ（ハイブリッド：ハートHP と スーパー/ファイア状態を併用）──
  const marioPowerRef = useRef<'small' | 'super' | 'fire'>('small');  // 既定チビ(small)、キノコでスーパー、フラワーでファイア
  const marioTransformingRef = useRef(0);                             // 巨大化変身用残フレーム
  const marioPipeRef = useRef<{
    phase: 'entering' | 'exiting';
    x: number;
    startY: number;
    targetY: number;
    progress: number;
    maxProgress: number;
    warpSceneId?: string;
    entryX?: number;
    entryY?: number;
  } | null>(null);
  const marioGoalRef = useRef<{
    phase: 'slide' | 'walk' | 'done';
    x: number;
    targetY: number;
    progress: number;
  } | null>(null);
  const blockAnimsRef = useRef<{
    col: number;
    row: number;
    type: 'bump' | 'break';
    timer: number;
    maxTimer: number;
    originalTile: number;
    info: any;
    oy: number;
    targetTileId?: number;
    spawnCoin?: boolean;
    particles?: { x: number; y: number; vx: number; vy: number }[];
  }[]>([]);

  // ── 新規追加のプラットフォーム物理・エフェクト用 Ref ──
  const coyoteFramesRef = useRef(0);
  const isJumpingRef = useRef(false);
  const runDurationRef = useRef(0);
  const scaleXRef = useRef(1.0);
  const scaleYRef = useRef(1.0);
  const isWallSlidingRef = useRef(false);
  const wallSlideDirRef = useRef(0); // -1: 左壁, 1: 右壁, 0: なし
  const prevGroundedRef = useRef(false);
  const particlesRef = useRef<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
    color: string;
    type?: 'smoke' | 'coin';
    bounceCount?: number;
  }[]>([]);

  const coinsRef = useRef(0);                                 // コイン枚数（ハテナ・回収）
  const starTimerRef = useRef(0);                             // スター無敵の残フレーム
  const STAR_DURATION = 600;                                  // スター無敵時間（約10秒 @60fps）
  const usedBlocksRef = useRef<Set<string>>(new Set());       // 叩き済みハテナ "col,row"
  // ── onjReze エンジン（トップビュー・アクションRPG）──
  const onjRezeDirRef = useRef<{ x: number; y: number }>({ x: 0, y: 1 });  // プレイヤーの向き（4方向）
  const swordRef = useRef<{ active: number; cool: number; dir: { x: number; y: number }; hit: Set<string> }>(
    { active: 0, cool: 0, dir: { x: 0, y: 1 }, hit: new Set() });        // 剣の振り状態
  const onjRezeHpRef = useRef<{ hp: number; max: number }>({ hp: 6, max: 6 }); // ハート（1ハート=2HP）
  const checkpointRef = useRef<{ x: number; y: number } | null>(null);
  // onjReze: 原作のボム挙動の再現（💣設置・🎯投げ・💀首爆弾・爆発）。すべてフレーム単位（60fps想定）。
  const onjBombsRef = useRef<{ x: number; y: number; fuse: number; maxFuse: number; r: number; dmg: number; head: boolean; srcUrl?: string; owner?: Entity }[]>([]);   // 着地済み・導火線カウント中のボム（中心座標）
  const onjFliesRef = useRef<{ fx: number; fy: number; tx: number; ty: number; t: number; dur: number; fuse: number; r: number; dmg: number; head: boolean; srcUrl?: string; owner?: Entity }[]>([]); // 放物線で飛行中のボム/首
  const onjBlastsRef = useRef<{ x: number; y: number; life: number; maxLife: number; r: number }[]>([]);  // 爆発エフェクト
  const onjBombCoolRef = useRef(0);   // 💣設置のクールダウン（長押し連打）
  const onjThrowCoolRef = useRef(0);  // 🎯投げ／💀首爆弾のクールダウン

  const bossDefeatedRef = useRef(false);
  /** NPCに接触中のセリフ表示（フキダシではなく頭上に1文字ずつ表示） */
  const npcTalkRef = useRef<{ entity: Entity; text: string; startTime: number; wrapped?: string[] } | null>(null);
  /** アイテム取得演出（メッセージウィンドウではなく頭上に一定時間表示） */
  const itemGetRef = useRef<{ text: string; startTime: number } | null>(null);
  const bossWarnRef = useRef(false);    // ゴールでのボス未撃破警告を一度だけ出す
  const bossOutroRef = useRef<DialogueLine[] | null>(null); // ボス撃破後のセリフ
  /** 現在のフェーズインデックス（phases 定義時）。-1=未開始 */
  const phaseIndexRef = useRef(-1);
  /** 実行中の wave 出現スクリプトの停止ハンドル */
  const waveCtxRef = useRef<{ cancelled: boolean } | null>(null);
  /** wave 出現スクリプトが実行中か（フェーズ進行判定で参照） */
  const waveRunningRef = useRef(false);

  // ── 弾幕空間グリッド ──
  const bulletGridRef = useRef(new BulletGrid(VIEW_W));

  // ── オンラインテストモード（疑似マルチプレイヤー） ──
  interface FakePlayer {
    sessionId: string; emoji: string; color: string;
    x: number; y: number; vx: number; vy: number;
    dirX: number; dirY: number; moveCool: number;
  }
  const [onlineTestMode, setOnlineTestMode] = useState(false);
  const onlineTestModeRef = useRef(false);
  onlineTestModeRef.current = onlineTestMode;
  const fakePlayersRef = useRef<FakePlayer[]>([]);

  // ── 設定パネル ──
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [settingsOpen]);

  // ── デバッグ無敵 ──
  const [debugInvincible, setDebugInvincible] = useState(false);
  const debugInvincibleRef = useRef(false);
  useEffect(() => { debugInvincibleRef.current = debugInvincible; }, [debugInvincible]);

  // オンラインテストモード：疑似プレイヤーを初期化
  const initFakePlayers = useCallback((data: PresetData, enabled: boolean) => {
    if (!enabled) { fakePlayersRef.current = []; return; }
    const gw = data.scroll?.worldCols ?? COLS;
    const gh = data.scroll?.worldRows ?? ROWS;
    const FAKE_EMOJIS = ['🐱', '🐸', '🐼', '🦊', '🐧', '🐨'];
    const FAKE_COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6'];
    fakePlayersRef.current = FAKE_EMOJIS.map((emoji, i) => {
      let sx = Math.floor(Math.random() * gw), sy = Math.floor(Math.random() * gh);
      for (let attempt = 0; attempt < 200; attempt++) {
        const cx = Math.floor(Math.random() * gw), cy = Math.floor(Math.random() * gh);
        if (data.tiles[data.map[cy]?.[cx] ?? 0]?.passable) { sx = cx; sy = cy; break; }
      }
      return {
        sessionId: `fake-${i}`, emoji, color: FAKE_COLORS[i % FAKE_COLORS.length],
        x: sx * TILE_SIZE, y: sy * TILE_SIZE, vx: 0, vy: 0,
        dirX: 0, dirY: 1, moveCool: Math.floor(Math.random() * 60),
      };
    });
  }, []);

  useEffect(() => {
    initFakePlayers(gameData, onlineTestMode);
  }, [onlineTestMode, gameData.engine, initFakePlayers]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── バトル/ボス戦 BGM ──
  const bossBgmActiveRef = useRef(false);
  const battleBgmActiveRef = useRef<'none' | 'battle' | 'boss'>('none');
  const gameDataRef = useRef(gameData);
  gameDataRef.current = gameData;

  // ── グレイズ ──
  const grazeRef = useRef(0);
  const grazeFlashRef = useRef(0); // グレイズ時の発光フレーム数

  // ── DialogueCutscene ハンドル（モバイル「次へ」ボタン用）──
  const dialogueCutsceneRef = useRef<DialogueCutsceneHandle>(null);

  // ── ボム / スペルカード ──
  const bombCountRef = useRef(3);
  const bombInvulnRef = useRef(0);    // ボム無敵フレーム数
  const bombCooldownRef = useRef(0);  // ボム連打防止クールダウン
  const bombPickupsRef = useRef<Array<{ x: number; y: number; life: number }>>([]);
  const spellCardTriggeredRef = useRef<Set<string>>(new Set()); // 発動済みカード {defId-cardIdx}
  const activeSpellCardNameRef = useRef<string | null>(null);   // 現在発動中のカード名
  const spellCutinKeyCountRef = useRef(0);
  const [spellCutin, setSpellCutin] = useState<{
    key: number; mode: 'boss' | 'player';
    charName: string; spellName: string;
    imageUrl?: string; imageX?: number; imageY?: number; imageScale?: number;
  } | null>(null);
  const [spellCutinPreview, setSpellCutinPreview] = useState<{
    key: number; mode: 'boss' | 'player';
    charName: string; spellName: string;
    imageUrl?: string; imageX?: number; imageY?: number; imageScale?: number;
  } | null>(null);
  /** 次に開始するフェーズ（dialogue 完了後に spawn する）。-1=クリア（outro後）*/
  const pendingPhaseRef = useRef<number | null>(null);
  /** true のとき、完了した dialogue は outro（フェーズクリア後）だったことを示す */
  const outroModeRef = useRef(false);
  const [activeDialogue, setActiveDialogue] = useState<DialogueLine[] | null>(null);
  // 「${phaseIdx}-${lineIdx}」形式。常に最後に操作した行を保持し消えない
  const [activePreviewKey, setActivePreviewKey] = useState<string | null>(null);
  /** ループから state を読むための ref */
  const activeDialogueRef = useRef<DialogueLine[] | null>(null);
  activeDialogueRef.current = activeDialogue;
  const afterDialogueRef = useRef<(() => void) | null>(null);
  const [, forceHud] = useState(0);

  const calcDmg = (atk: number, def: number) => Math.max(1, Math.round((atk - def / 2) * (0.85 + Math.random() * 0.3)));
  const appendLog = (line: string, patch: Partial<BattleView> = {}) =>
    setBattle(v => (v ? { ...v, enemyHp: battleRef.current.enemyHp, mercy: battleRef.current.mercy, log: [...v.log, line].slice(-6), ...patch } : v));

  const getCurrentFieldBgm = useCallback(() => {
    if (isPlaying && gameData.scenes && gameData.scenes.length > 0) {
      const curSceneIdx = activeSceneIdxRef.current;
      const curScene = gameData.scenes[curSceneIdx];
      if (curScene?.bgm?.ref) {
        return curScene.bgm;
      }
    }
    return gameData.bgm;
  }, [isPlaying, gameData.bgm, gameData.scenes]);

  /** BGM を即時切り替えるヘルパー。src がなければ停止。 */
  const switchBgm = (bgm?: { src?: string; type?: 'youtube' | 'mml' | 'direct'; ref?: string }) => {
    if (bgm?.src && bgm.type !== 'direct') {
      const loopOption = getLoopOption(bgm.ref);
      const volume = getBgmVolume(bgm.ref);
      bgmManager.play({ bgm: { type: bgm.type ?? 'youtube', src: bgm.src, loop: loopOption, volume } as any, tileset: {} });
    } else {
      bgmManager.stop();
    }
  };

  const beginBattle = (opts: { name: string; emoji: string; hp: number; atk: number; def: number; exp: number; gold?: number; moves?: { name: string; power: number; heal?: boolean; miniScript?: string }[]; miniScript?: string; entity?: Entity | null; isBoss?: boolean; outroDialogue?: DialogueLine[] }) => {
    battleRef.current = {
      active: true, entity: opts.entity ?? null, enemyName: opts.name, enemyHp: opts.hp, enemyMaxHp: opts.hp,
      enemyAtk: opts.atk, enemyDef: opts.def, enemyMoves: opts.moves ?? [], exp: opts.exp,
      gold: opts.gold ?? Math.round(opts.exp * 0.6), isBoss: !!opts.isBoss, mercy: 0,
      miniScript: opts.miniScript,
    };
    setBattleItemsOpen(false); setBagOpen(false);
    setSoulPhase('menu'); setSoulMenu('root'); soulDodgeRef.current = null;
    bossOutroRef.current = opts.outroDialogue?.length ? opts.outroDialogue : null;
    setBattle({ enemyName: opts.name, enemyEmoji: opts.emoji, enemyHp: opts.hp, enemyMaxHp: opts.hp, mercy: 0, log: [`${opts.name}が あらわれた！`], canAct: true, over: false });
    // バトルBGM切り替え
    if (opts.isBoss && gameDataRef.current.bossBgm?.src) {
      battleBgmActiveRef.current = 'boss';
      switchBgm(gameDataRef.current.bossBgm);
    } else if (!opts.isBoss && gameDataRef.current.battleBgm?.src) {
      battleBgmActiveRef.current = 'battle';
      switchBgm(gameDataRef.current.battleBgm);
    }
  };
  // シンボルエンカウント（フィールド上の敵に接触）。ボスにも使う。
  const startBattle = (e: Entity) => {
    const d = e.def;
    beginBattle({ name: d.name ?? 'てき', emoji: d.emoji, hp: d.hp, atk: d.atk ?? Math.round(d.hp), def: d.def ?? Math.round(d.hp * 0.4), exp: d.exp ?? Math.round(d.hp * 1.5), gold: d.gold, moves: d.moves, miniScript: d.miniScript, entity: e, isBoss: d.isBoss, outroDialogue: d.outroDialogue });
  };

  const nudgePlayer = () => {
    const eng = engineRef.current; const b = battleRef.current; const p = eng.player; const pData = gameData.player;
    if (!b.entity) return;
    const dx = p.x - b.entity.x, dy = p.y - b.entity.y; const dist = Math.hypot(dx, dy) || 1;
    const worldW = (gameData.scroll?.worldCols ?? COLS) * TILE_SIZE;
    p.x = Math.max(0, Math.min(worldW - pData.w, p.x + (dx / dist) * TILE_SIZE * 1.3));
    p.y = Math.max(0, Math.min(VIEW_H - pData.h, p.y + (dy / dist) * TILE_SIZE * 1.3));
  };

  // spare（みのがす）: 敵は撃破と同じく消えるが EXP は入らずゴールドだけ貰える。
  // ボスをみのがした場合も撃破と同様にクリア扱い（不殺ルート）。
  const endBattle = (result: 'win' | 'lose' | 'flee' | 'spare') => {
    const b = battleRef.current; const pr = progressRef.current; const eng = engineRef.current;
    if (result === 'lose') {
      battleRef.current.active = false; setBattle(null);
      battleBgmActiveRef.current = 'none';
      shakeRef.current = 18; playSfx(sfxRef.current.damage); showGameMsg('ゲームオーバー…', 'timed', () => setGameOverResult({ score: scoreRef.current }));
      return;
    }
    const wasBoss = b.isBoss;
    if (result === 'spare') {
      if (b.entity) { const idx = eng.entities.indexOf(b.entity); if (idx >= 0) eng.entities.splice(idx, 1); }
      pr.gold = (pr.gold ?? 0) + b.gold;
      setBattle(v => (v ? { ...v, over: true, canAct: false, log: [...v.log, `${b.enemyName}を みのがした！${b.gold > 0 ? ` ${b.gold}G` : ''}`].slice(-6) } : v));
      if (wasBoss) bossDefeatedRef.current = true;
    }
    if (result === 'win') {
      if (b.entity) { const idx = eng.entities.indexOf(b.entity); if (idx >= 0) eng.entities.splice(idx, 1); }
      pr.exp += b.exp;
      let lvUp = '';
      {
        const levelTable = gameDataRef.current.battle?.levelTable ?? [];
        while (true) {
          const nextEntry = levelTable.find(e => e.level === pr.level + 1);
          const nextExpNeeded = nextEntry?.exp ?? pr.expNext;
          if (pr.exp < nextExpNeeded) break;
          pr.exp -= nextExpNeeded;
          pr.level++;
          if (nextEntry) {
            if (nextEntry.maxHp != null) pr.maxHp = nextEntry.maxHp;
            if (nextEntry.maxMp != null) pr.maxMp = nextEntry.maxMp;
            if (nextEntry.atk != null) pr.baseAtk = nextEntry.atk;
            if (nextEntry.def != null) pr.baseDef = nextEntry.def;
            pr.hp = pr.maxHp; pr.mp = pr.maxMp;
          } else {
            pr.maxHp += 6; pr.maxMp += 3; pr.baseAtk += 2; pr.baseDef += 1; pr.hp = pr.maxHp; pr.mp = pr.maxMp;
          }
          const nextNext = levelTable.find(e => e.level === pr.level + 1);
          pr.expNext = nextNext?.exp ?? pr.level * 10;
          lvUp = `レベルが ${pr.level} に あがった！`;
          playSfx(sfxRef.current.levelup);
        }
        if (lvUp) applyEquipment(equipmentRef.current); // 基礎値の上に装備ボーナスを再計算
      }
      pr.gold = (pr.gold ?? 0) + b.gold;
      setBattle(v => (v ? { ...v, over: true, canAct: false, log: [...v.log, `${b.enemyName}を たおした！${b.exp > 0 ? ` EXP+${b.exp}` : ''}${b.gold > 0 ? ` ${b.gold}G` : ''}`, ...(lvUp ? [lvUp] : [])].slice(-6) } : v));
      if (wasBoss) bossDefeatedRef.current = true;
    }
    nudgePlayer();
    invulnRef.current = 60; forceHud(n => n + 1);
    setTimeout(() => {
      battleRef.current.active = false; battleRef.current.entity = null; setBattle(null); forceHud(n => n + 1);
      // バトルBGM終了 → フィールドBGMに戻す
      if (battleBgmActiveRef.current !== 'none') {
        battleBgmActiveRef.current = 'none';
        switchBgm(getCurrentFieldBgm());
      }
      if ((result === 'win' || result === 'spare') && wasBoss) {
        const outro = bossOutroRef.current;
        if (outro?.length) {
          outroModeRef.current = true;
          pendingPhaseRef.current = -1;
          setActiveDialogue(outro);
        } else {
          playSfx(sfxRef.current.clear); showGameMsg('🎉 クリア！', 'timed', () => { setIsPlaying(false); if (endingRef.current?.enabled) setShowEnding(true); });
        }
      }
    }, result === 'win' || result === 'spare' ? 1100 : 500);
  };

  /** みのがし成立条件：こうどうでゲージ満タン（閾値 %）、または敵HPが所定の割合以下。 */
  const spareReady = (b: { mercy: number; enemyHp: number; enemyMaxHp: number }) => {
    const battleCfg = gameDataRef.current.battle;
    const mercyTh = battleCfg?.mercyThreshold ?? 100;
    const hpThPct = battleCfg?.hpSpareThreshold ?? 20;
    const hpLimit = Math.ceil(b.enemyMaxHp * (hpThPct / 100));
    return b.mercy >= mercyTh || (b.enemyHp > 0 && b.enemyHp <= hpLimit);
  };

  const enemyTurn = () => {
    const b = battleRef.current; const pr = progressRef.current;
    if (!b.active) return;
    // 攻撃パターン：40% で呪文/特技、それ以外は通常攻撃
    const move = b.enemyMoves.length && Math.random() < 0.4 ? b.enemyMoves[Math.floor(Math.random() * b.enemyMoves.length)] : null;
    if (move?.heal) {
      const before = b.enemyHp; b.enemyHp = Math.min(b.enemyMaxHp, b.enemyHp + move.power);
      appendLog(`${b.enemyName}は ${move.name}を となえた！ HPが ${b.enemyHp - before} かいふく`, { canAct: pr.hp > 0 });
    } else if (move) {
      const dmg = Math.max(1, Math.round(move.power * (0.85 + Math.random() * 0.3)));
      pr.hp = Math.max(0, pr.hp - dmg); forceHud(n => n + 1);
      appendLog(`${b.enemyName}の ${move.name}！ ${dmg}のダメージ`, { canAct: pr.hp > 0 });
    } else {
      const dmg = calcDmg(b.enemyAtk, pr.def);
      pr.hp = Math.max(0, pr.hp - dmg); forceHud(n => n + 1);
      appendLog(`${b.enemyName}の こうげき！ ${dmg}のダメージ`, { canAct: pr.hp > 0 });
    }
    if (pr.hp <= 0) setTimeout(() => endBattle('lose'), 600);
  };

  /** プレイヤーの行動後に敵ターンへ。soul スタイルなら弾幕よけ、classic なら従来の即時ダメージ。 */
  const queueEnemyTurn = (delay = 750) => setTimeout(() => {
    if ((gameDataRef.current.battle?.style ?? 'classic') === 'soul') soulEnemyTurn(); else enemyTurn();
  }, delay);

  /** soul: 敵ターン開始。回復技なら回復のみ、攻撃ならバトルボックスを変形させて弾幕よけへ。 */
  const soulEnemyTurn = () => {
    const b = battleRef.current; const pr = progressRef.current;
    if (!b.active) return;
    const move = b.enemyMoves.length && Math.random() < 0.4 ? b.enemyMoves[Math.floor(Math.random() * b.enemyMoves.length)] : null;
    if (move?.heal) {
      const before = b.enemyHp; b.enemyHp = Math.min(b.enemyMaxHp, b.enemyHp + move.power);
      appendLog(`${b.enemyName}は ${move.name}を つかった！ HPが ${b.enemyHp - before} かいふく`, { canAct: pr.hp > 0 });
      return;
    }
    // 弾1発あたりのダメージ（何発か被弾しうるので通常攻撃より小さめに割る）
    const dmg = move ? Math.max(1, Math.round(move.power * 0.35)) : Math.max(1, Math.round(calcDmg(b.enemyAtk, pr.def) * 0.4));
    appendLog(move ? `${b.enemyName}の ${move.name}！` : `${b.enemyName}の こうげき！`);
    const script = move?.miniScript || b.entity?.def?.miniScript || b.miniScript;
    soulDodgeRef.current = { frames: 0, duration: 240, pattern: Math.floor(Math.random() * 3), dmg, bullets: [], hx: 88, hy: 118, invuln: 30, miniScript: script };
    setSoulPhase('dodge');
  };

  /** soul: タイミングバーの結果からダメージを与える。中央に近いほど高倍率。 */
  const resolveSoulAttack = (pos: number) => {
    const b = battleRef.current; const pr = progressRef.current;
    const dist = Math.abs(pos - 0.5);
    const mult = dist < 0.06 ? 1.6 : dist < 0.18 ? 1.2 : dist < 0.32 ? 0.9 : 0.6;
    const dmg = Math.max(1, Math.round(calcDmg(pr.atk, b.enemyDef) * mult));
    b.enemyHp = Math.max(0, b.enemyHp - dmg);
    setSoulPhase('menu');
    appendLog(`${mult >= 1.6 ? '会心の いちげき！ ' : ''}${dmg}のダメージ！`, { canAct: false });
    if (b.enemyHp <= 0) { setTimeout(() => endBattle('win'), 600); return; }
    queueEnemyTurn();
  };

  const missSoulAttack = () => {
    setSoulPhase('menu');
    appendLog('こうげきは ハズれた！', { canAct: false });
    queueEnemyTurn();
  };

  const doAttack = () => {
    if (!battle?.canAct || battle.over) return;
    const b = battleRef.current; const pr = progressRef.current;
    const dmg = calcDmg(pr.atk, b.enemyDef);
    b.enemyHp = Math.max(0, b.enemyHp - dmg);
    appendLog(`${gameData.battle?.playerName || '勇者'}の こうげき！ ${dmg}のダメージ`, { canAct: false });
    if (b.enemyHp <= 0) { setTimeout(() => endBattle('win'), 600); return; }
    queueEnemyTurn();
  };

  const doMove = (m: BattleMove) => {
    if (!battle?.canAct || battle.over) return;
    const b = battleRef.current; const pr = progressRef.current;
    if (pr.mp < m.cost) { appendLog('MPが たりない！'); return; }
    pr.mp -= m.cost; forceHud(n => n + 1);
    if (m.mercy != null) {
      // こうどう技：ダメージを与えず敵意ゲージを溜める
      const before = b.mercy;
      b.mercy = Math.min(100, b.mercy + m.mercy);
      const line = b.mercy >= 100
        ? `「${m.name}」！ ${b.enemyName}は たたかう気を なくしたようだ…`
        : b.mercy > before
          ? `「${m.name}」！ ${b.enemyName}の 敵意が やわらいだ`
          : `「${m.name}」！ しかし ${b.enemyName}には とどかなかった`;
      appendLog(line, { canAct: false });
      queueEnemyTurn();
      return;
    }
    if (m.heal) {
      const before = pr.hp; pr.hp = Math.min(pr.maxHp, pr.hp + m.power);
      appendLog(`${m.name}！ HPが ${pr.hp - before} かいふくした`, { canAct: false });
    } else {
      const dmg = Math.max(1, Math.round(m.power * (0.85 + Math.random() * 0.3)));
      b.enemyHp = Math.max(0, b.enemyHp - dmg);
      appendLog(`${m.name}！ ${dmg}のダメージ`, { canAct: false });
      if (b.enemyHp <= 0) { setTimeout(() => endBattle('win'), 600); return; }
    }
    queueEnemyTurn();
  };

  const doFlee = () => {
    if (!battle?.canAct || battle.over) return;
    if (Math.random() < 0.6) { appendLog('うまく にげきれた！', { canAct: false, over: true }); setTimeout(() => endBattle('flee'), 700); }
    else { appendLog('しかし まわりこまれてしまった！', { canAct: false }); queueEnemyTurn(); }
  };

  /** みのがす（labels.mercy 設定時のみUIに出る）。条件を満たしていなければターンを消費して失敗。 */
  const doSpare = () => {
    if (!battle?.canAct || battle.over) return;
    const b = battleRef.current;
    if (spareReady(b)) {
      appendLog(`${b.enemyName}は しずかに たちさった…`, { canAct: false, over: true });
      setTimeout(() => endBattle('spare'), 700);
    } else {
      appendLog(`${b.enemyName}は まだ たたかう気だ！`, { canAct: false });
      queueEnemyTurn();
    }
  };

  const battleStyle = gameData.battle?.style ?? 'classic';
  const inBattle = !!battle;

  // soul: たたかう＝タイミングバー。バーが右端まで行くとミス。クリック/Z/Enter/Spaceで停止。
  useEffect(() => {
    if (!inBattle || battleStyle !== 'soul' || soulPhase !== 'attack') return;
    soulBarRef.current = { pos: 0 };
    let raf = 0; let alive = true;
    const step = () => {
      if (!alive) return;
      soulBarRef.current.pos += 0.013;
      if (soulBarElRef.current) soulBarElRef.current.style.left = `${Math.min(100, soulBarRef.current.pos * 100)}%`;
      if (soulBarRef.current.pos >= 1) { alive = false; missSoulAttack(); return; }
      raf = requestAnimationFrame(step);
    };
    const stop = () => { if (!alive) return; alive = false; cancelAnimationFrame(raf); resolveSoulAttack(soulBarRef.current.pos); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'z' || e.key === 'Z' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stop(); } };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', stop);
    raf = requestAnimationFrame(step);
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', stop); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inBattle, battleStyle, soulPhase]);

  // soul: 敵ターン＝バトルボックス内の弾幕よけミニゲーム（176×176 の小キャンバス）。
  useEffect(() => {
    if (!inBattle || battleStyle !== 'soul' || soulPhase !== 'dodge') return;
    const cv = soulCanvasRef.current; const st = soulDodgeRef.current;
    if (!cv || !st) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const W = 176, H = 176, HR = 6;
    let raf = 0; let alive = true;

    const scriptSrc = st.miniScript;
    let scriptCtx = { cancelled: false };
    st.scriptCtx = scriptCtx;

    if (scriptSrc) {
      const runDodgeScript = async () => {
        const lines = parseMiniScript(scriptSrc);
        const CANCEL = Symbol('cancel');
        const wait = (frames: number): Promise<void> =>
          new Promise((res, rej) => {
            if (scriptCtx.cancelled) { rej(CANCEL); return; }
            const target = st.frames + Math.max(0, frames | 0);
            const check = () => {
              if (scriptCtx.cancelled) { rej(CANCEL); return; }
              if (st.frames >= target) { res(); return; }
              requestAnimationFrame(check);
            };
            requestAnimationFrame(check);
          });

        // color は SPELL_PALETTE のインデックス 0-8（省略時は白）
        const toColor = (c?: unknown) => c != null ? SPELL_PALETTE[((+(c as number) | 0) + 9) % 9] : undefined;
        const pushBullet = (x: number, y: number, vx: number, vy: number, r = 4, color?: string) => {
          if (scriptCtx.cancelled) return;
          st.bullets.push({ x, y, vx, vy, r, color });
        };

        const env: MiniEnv = {
          wait,
          /** 任意位置から速度指定で発射 */
          shot: (x: unknown, y: unknown, vx: unknown, vy: unknown, r?: unknown, color?: unknown) => {
            pushBullet(+(x as number), +(y as number), +(vx as number), +(vy as number), r != null ? +(r as number) : 4, toColor(color));
          },
          /** 任意位置から角度（度: 0=右, 90=下）で発射。リング/扇は for + shotAngle で組む */
          shotAngle: (x: unknown, y: unknown, angle: unknown, speed: unknown, r?: unknown, color?: unknown) => {
            const a = +(angle as number) * DEG_TO_RAD, sp = +(speed as number);
            pushBullet(+(x as number), +(y as number), Math.cos(a) * sp, Math.sin(a) * sp, r != null ? +(r as number) : 4, toColor(color));
          },
          /** 任意位置からハートを狙って発射 */
          shotPlayer: (x: unknown, y: unknown, speed: unknown, r?: unknown, color?: unknown) => {
            const sx = +(x as number), sy = +(y as number), sp = +(speed as number);
            const d = Math.hypot(st.hx - sx, st.hy - sy) || 1;
            pushBullet(sx, sy, (st.hx - sx) / d * sp, (st.hy - sy) / d * sp, r != null ? +(r as number) : 4.5, toColor(color));
          },
          /** ランダムな画面端からハートを狙って発射 */
          shotAimed: (speed: unknown, r?: unknown, color?: unknown) => {
            const edge = Math.floor(Math.random() * 4);
            const sx = edge === 0 ? -6 : edge === 1 ? W + 6 : Math.random() * W;
            const sy = edge === 2 ? -6 : edge === 3 ? H + 6 : Math.random() * H;
            const sp = +(speed as number);
            const d = Math.hypot(st.hx - sx, st.hy - sy) || 1;
            pushBullet(sx, sy, (st.hx - sx) / d * sp, (st.hy - sy) / d * sp, r != null ? +(r as number) : 4.5, toColor(color));
          },
          /** 上からランダム位置に降らせる */
          shotRain: (speed: unknown, r?: unknown, color?: unknown) => {
            const sx = 8 + Math.random() * (W - 16);
            pushBullet(sx, -6, 0, +(speed as number), r != null ? +(r as number) : 4, toColor(color));
          },
          /** 左右の端から水平に発射 */
          shotSide: (fromLeft: unknown, y: unknown, speed: unknown, r?: unknown, color?: unknown) => {
            const fl = !!fromLeft;
            const sx = fl ? -6 : W + 6;
            pushBullet(sx, +(y as number), fl ? +(speed as number) : -+(speed as number), 0, r != null ? +(r as number) : 4, toColor(color));
          },
          /** 回避フェーズの長さを変更（60〜900フレーム） */
          setDuration: (frames: unknown) => { st.duration = Math.max(60, Math.min(900, (frames as number) | 0)); },
          getPlayerX: () => st.hx,
          getPlayerY: () => st.hy,
          getFrame: () => st.frames,
          // 数学・ループ補助（touhou の MiniScript と同じ語彙）
          abs: Math.abs, floor: Math.floor, ceil: Math.ceil, sqrt: Math.sqrt, min: Math.min, max: Math.max,
          round: (x: unknown, d: unknown = 0) => Number(Math.round(+(x as number) * 10 ** +(d as number)) / 10 ** +(d as number)),
          sin: (d: unknown) => Math.sin(+(d as number) * DEG_TO_RAD),
          cos: (d: unknown) => Math.cos(+(d as number) * DEG_TO_RAD),
          pi: Math.PI,
          rand: (mn: unknown, mx: unknown) => Math.floor(Math.random() * (+(mx as number) - +(mn as number) + 1)) + +(mn as number),
          randF: (mn: unknown, mx: unknown) => Math.random() * (+(mx as number) - +(mn as number)) + +(mn as number),
          range: (from: unknown, to: unknown, step: unknown = 1) => {
            const out: number[] = [];
            const s = +(step as number) || 1;
            for (let i = +(from as number); s > 0 ? i <= +(to as number) : i >= +(to as number); i += s) out.push(i);
            return out;
          },
          W, H,
        };

        try {
          await runMiniScript(lines, env, {});
        } catch (e) {
          if (e !== CANCEL) console.warn('[MiniScript Dodge]', e);
        }
      };
      runDodgeScript();
    }

    const drawHeart = (x: number, y: number, s: number, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.9);
      ctx.bezierCurveTo(x + s, y + s * 0.2, x + s * 0.8, y - s * 0.8, x, y - s * 0.2);
      ctx.bezierCurveTo(x - s * 0.8, y - s * 0.8, x - s, y + s * 0.2, x, y + s * 0.9);
      ctx.fill();
    };
    const loop = () => {
      if (!alive) return;
      const pr = progressRef.current;
      st.frames++;
      // 入力（メインエンジンと同じキーセットを読む）＋タッチはポインタで直接動かす
      const keys = engineRef.current.keys;
      const sp = 2.4;
      if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) st.hx -= sp;
      if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) st.hx += sp;
      if (keys.has('ArrowUp') || keys.has('w') || keys.has('W')) st.hy -= sp;
      if (keys.has('ArrowDown') || keys.has('s') || keys.has('S')) st.hy += sp;
      st.hx = Math.max(9, Math.min(W - 9, st.hx));
      st.hy = Math.max(9, Math.min(H - 9, st.hy));
      // 弾の生成（3パターン：あめ／ねらいうち／よこなぐり）
      if (!scriptSrc) {
        if (st.pattern === 0) {
          if (st.frames % 11 === 0) st.bullets.push({ x: 8 + Math.random() * (W - 16), y: -6, vx: 0, vy: 1.3 + Math.random() * 1.2, r: 4 });
        } else if (st.pattern === 1) {
          if (st.frames % 24 === 0) {
            const edge = Math.floor(Math.random() * 4);
            const x = edge === 0 ? -6 : edge === 1 ? W + 6 : Math.random() * W;
            const y = edge === 2 ? -6 : edge === 3 ? H + 6 : Math.random() * H;
            const d = Math.hypot(st.hx - x, st.hy - y) || 1;
            st.bullets.push({ x, y, vx: (st.hx - x) / d * 1.6, vy: (st.hy - y) / d * 1.6, r: 4.5 });
          }
        } else {
          if (st.frames % 16 === 0) {
            const fromLeft = Math.floor(st.frames / 16) % 2 === 0;
            st.bullets.push({ x: fromLeft ? -6 : W + 6, y: 10 + Math.random() * (H - 20), vx: fromLeft ? 1.9 : -1.9, vy: 0, r: 4 });
          }
        }
      }
      for (const bl of st.bullets) { bl.x += bl.vx; bl.y += bl.vy; }
      st.bullets = st.bullets.filter(bl => bl.x > -20 && bl.x < W + 20 && bl.y > -20 && bl.y < H + 20);
      // 被弾判定（被弾後は無敵時間つき）
      if (st.invuln > 0) st.invuln--;
      else {
        for (const bl of st.bullets) {
          if (Math.hypot(bl.x - st.hx, bl.y - st.hy) < bl.r + HR - 1) {
            pr.hp = Math.max(0, pr.hp - st.dmg);
            st.invuln = 45;
            playSfx(sfxRef.current.damage);
            forceHud(n => n + 1);
            if (pr.hp <= 0) { alive = false; endBattle('lose'); return; }
            break;
          }
        }
      }
      // 描画
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      for (const bl of st.bullets) { ctx.fillStyle = bl.color ?? '#fff'; ctx.beginPath(); ctx.arc(bl.x, bl.y, bl.r, 0, Math.PI * 2); ctx.fill(); }
      if (st.invuln % 8 < 4) drawHeart(st.hx, st.hy, HR + 2, '#ff1e3c');
      if (st.frames >= st.duration) {
        alive = false;
        setSoulPhase('menu'); setSoulMenu('root');
        appendLog('…こうげきを しのいだ！', { canAct: progressRef.current.hp > 0 });
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; scriptCtx.cancelled = true; cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inBattle, battleStyle, soulPhase]);

  /** soul: タッチ/マウスでハートを直接動かす。 */
  const soulPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = soulDodgeRef.current; const cv = soulCanvasRef.current;
    if (!st || !cv) return;
    const rect = cv.getBoundingClientRect();
    st.hx = Math.max(9, Math.min(167, (e.clientX - rect.left) / rect.width * 176));
    st.hy = Math.max(9, Math.min(167, (e.clientY - rect.top) / rect.height * 176));
  };

  /** healHp/healMp を持つアイテムを使う。inBattle=true ならターン消費して敵の反撃を受ける。 */
  const useHealItem = (it: ItemDef, inBattle: boolean) => {
    const pr = progressRef.current;
    if ((inventoryRef.current[it.id] ?? 0) <= 0) return;
    const parts: string[] = [];
    if (it.healHp) { const before = pr.hp; pr.hp = Math.min(pr.maxHp, pr.hp + it.healHp); parts.push(`HPが ${pr.hp - before} かいふく`); }
    if (it.healMp) { const before = pr.mp; pr.mp = Math.min(pr.maxMp, pr.mp + it.healMp); parts.push(`MPが ${pr.mp - before} かいふく`); }
    setInventory(p => { const n = { ...p }; n[it.id] = (n[it.id] ?? 0) - 1; if (n[it.id] <= 0) delete n[it.id]; return n; });
    playSfx(sfxRef.current.inn);
    forceHud(n => n + 1);
    if (inBattle) {
      setBattleItemsOpen(false);
      appendLog(`${it.name}を つかった！ ${parts.join('、')}`, { canAct: false });
      queueEnemyTurn();
    } else {
      setBagOpen(false);
      showGameMsg(`${it.emoji} ${it.name}を つかった！\n${parts.join('、')}した`, 'instant', () => {});
    }
  };

  /** 「どうぐ」で使えるアイテム（healHp/healMp 持ちで所持数 1 以上）。 */
  const usableItems = () =>
    (gameDataRef.current.items ?? []).filter(it => (it.healHp || it.healMp) && (inventoryRef.current[it.id] ?? 0) > 0);

  const showGameMsg = useCallback((text: string, mode: 'instant' | 'timed', onDismiss: () => void) => {
    // timed メッセージ（ミス/ゲームオーバー/クリア）は必ずラウンド終了 → 即座に操作・進行を凍結。
    // 既に終了演出中なら同フレームの別ハザード等で上書きしない。
    if (mode === 'timed') {
      if (roundOverRef.current) return;
      roundOverRef.current = true;
    }
    gameMsgReadyRef.current = mode === 'instant';
    if (gameMsgTimerRef.current) clearTimeout(gameMsgTimerRef.current);
    setGameMsg({ text, mode, onDismiss });
    if (mode === 'timed') {
      gameMsgTimerRef.current = setTimeout(() => {
        gameMsgReadyRef.current = true;
        setGameMsg(prev => prev ? { ...prev } : null); // force re-render for ▼
      }, 2000);
    }
  }, []);

  const dismissGameMsg = useCallback(() => {
    if (!gameMsgReadyRef.current) return;
    if (gameMsgTimerRef.current) { clearTimeout(gameMsgTimerRef.current); gameMsgTimerRef.current = null; }
    setGameMsg(prev => {
      if (prev) { prev.onDismiss(); }
      return null;
    });
    gameMsgReadyRef.current = false;
  }, []);

  useEffect(() => () => { if (gameMsgTimerRef.current) clearTimeout(gameMsgTimerRef.current); }, []);

  /** セリフ完了 → pending フェーズをスポーン */
  const onDialogueComplete = useCallback(() => {
    setActiveDialogue(null);
    activeDialogueRef.current = null;
    const cb = afterDialogueRef.current;
    afterDialogueRef.current = null;
    cb?.();
    const pending = pendingPhaseRef.current;
    const wasOutro = outroModeRef.current;
    outroModeRef.current = false;
    if (pending === null) return;
    const eng = engineRef.current;
    eng.bullets = []; eng.enemyBullets = [];

    // outro 完了後の -1 → クリア
    // pendingPhaseRef は -1 のまま残す（null に戻すとゲームループが再トリガーするため）
    if (pending === -1) {
      playSfx(sfxRef.current.clear);
      showGameMsg('🎉 クリア！', 'timed', () => { setIsPlaying(false); if (endingRef.current?.enabled) setShowEnding(true); });
      return;
    }
    pendingPhaseRef.current = null;

    // outro 完了後の通常フェーズ → 次フェーズの intro を流してから spawn
    if (wasOutro) {
      const phases = gameData.phases;
      const nextPhase = phases?.[pending];
      if (nextPhase?.dialogue?.length) {
        // intro を流す（outroMode は false のまま）
        pendingPhaseRef.current = pending;
        setActiveDialogue(nextPhase.dialogue);
        return;
      }
    }

    // intro 完了 or intro なし → spawn
    // ボス戦BGM切り替え
    const curPhase = gameData.phases?.[pending];
    const isBossPhase = !!(curPhase?.kind === 'boss' && !curPhase?.noBossBgm);
    const bossBgm = gameData.bossBgm;
    if (isBossPhase && bossBgm?.src && !bossBgmActiveRef.current) {
      bossBgmActiveRef.current = true;
      const loopOption = getLoopOption(bossBgm.ref);
      const volume = getBgmVolume(bossBgm.ref);
      bgmManager.play({ bgm: { type: bossBgm.type ?? 'youtube', src: bossBgm.src, loop: loopOption, volume } as any, tileset: {} });
    } else if (!isBossPhase && bossBgmActiveRef.current) {
      bossBgmActiveRef.current = false;
      const normal = getCurrentFieldBgm();
      if (normal?.src) {
        const loopOption = getLoopOption(normal.ref);
        const volume = getBgmVolume(normal.ref);
        bgmManager.play({ bgm: { type: normal.type ?? 'youtube', src: normal.src, loop: loopOption, volume } as any, tileset: {} });
      }
      else bgmManager.stop();
    }

    eng.entities = buildPhaseEntities(pending, gameData, eng, waveCtxRef, waveRunningRef);
    phaseIndexRef.current = pending;
  }, [gameData, playSfx, showGameMsg]);

  // ── イベントインタプリタ ──
  const findActivePage = useCallback((obj: ObjectDef): EventPage | null => {
    if (!obj.pages || obj.pages.length === 0) return null;
    for (const page of obj.pages) {
      const c = page.conditions;
      if (c.switchId != null && (switchValsRef.current[c.switchId] ?? false) !== !!c.switchValue) continue;
      if (c.itemId != null && (!!inventoryRef.current[c.itemId]) !== !!c.hasItem) continue;
      if (c.selfSwitchId != null) {
        const ss = selfSwitchesRef.current[obj.id]?.[c.selfSwitchId] ?? false;
        if (ss !== !!c.selfSwitchValue) continue;
      }
      return page;
    }
    return null;
  }, []);

  const applyEquipment = useCallback((eq: { weapon?: string; armor?: string }) => {
    equipmentRef.current = eq;
    const b = gameDataRef.current.battle;
    if (!b) return;
    const pr = progressRef.current;
    const items = gameDataRef.current.items ?? [];
    let atkBonus = 0, defBonus = 0;
    if (eq.weapon) { const it = items.find(i => i.id === eq.weapon); atkBonus += it?.atkBonus ?? 0; }
    if (eq.armor) { const it = items.find(i => i.id === eq.armor); defBonus += it?.defBonus ?? 0; }
    // レベル基礎値（baseAtk/baseDef）に装備ボーナスを重ねる。旧データ互換で未設定なら初期値を使う。
    pr.atk = (pr.baseAtk || b.atk) + atkBonus;
    pr.def = (pr.baseDef || b.def) + defBonus;
    forceHud(n => n + 1);
  }, []);

  const runEventCommands = useCallback((objId: string, commands: EventCommand[], onDone?: () => void) => {
    if (eventRunningRef.current && !onDone) return;
    eventIdRef.current++;
    const currentEventId = eventIdRef.current;
    let index = 0;
    let cmds = commands;
    const ss = selfSwitchesRef.current;
    const advance = () => {
      if (currentEventId !== eventIdRef.current) return;
      index++;
      runNext();
    };
    const runNext = () => {
      if (currentEventId !== eventIdRef.current) return;
      if (index >= cmds.length) {
        eventRunningRef.current = false;
        forceHud(n => n + 1);
        onDone?.();
        return;
      }
      const cmd = cmds[index];
      switch (cmd.type) {
        case 'message':
          showGameMsg(cmd.text, 'instant', advance);
          break;
        case 'choice':
          eventChoiceRef.current = {
            text: cmd.text, choices: cmd.choices,
            onPick: (idx: number) => {
              eventChoiceRef.current = null;
              setEventChoice(null);
              if (idx >= 0 && idx < cmd.choices.length) {
                runEventCommands(objId, cmd.choices[idx].commands, advance);
              } else {
                advance();
              }
            },
          };
          setEventChoice(eventChoiceRef.current);
          break;
        case 'ifSwitch': {
          const cond = (switchValsRef.current[cmd.switchId] ?? false) === cmd.value;
          const sub = cond ? cmd.then : cmd.else ?? [];
          cmds = [...cmds.slice(0, index), ...sub, ...cmds.slice(index + 1)];
          setTimeout(runNext, 0);
          break;
        }
        case 'ifItem': {
          const cond2 = (!!inventoryRef.current[cmd.itemId]) === cmd.has;
          const sub2 = cond2 ? cmd.then : cmd.else ?? [];
          cmds = [...cmds.slice(0, index), ...sub2, ...cmds.slice(index + 1)];
          setTimeout(runNext, 0);
          break;
        }
        case 'setSwitch':
          setSwitchVals(p => { const n = { ...p }; n[cmd.switchId] = cmd.value; return n; });
          setTimeout(advance, 30);
          break;
        case 'setSelfSwitch': {
          const cur = ss[objId] ?? {};
          ss[objId] = { ...cur, [cmd.id]: cmd.value };
          setTimeout(advance, 30);
          break;
        }
        case 'giveItem':
          setInventory(p => { const n = { ...p }; n[cmd.itemId] = (n[cmd.itemId] ?? 0) + cmd.count; return n; });
          {
            const newItem = (gameDataRef.current.items ?? []).find(it => it.id === cmd.itemId);
            if (newItem?.category === 'weapon' || newItem?.category === 'armor') {
              const eq = { ...equipmentRef.current };
              if (newItem.category === 'weapon') eq.weapon = newItem.id;
              if (newItem.category === 'armor') eq.armor = newItem.id;
              setEquipment(eq);
              applyEquipment(eq);
            }
            itemGetRef.current = { text: `${newItem?.emoji ?? '🎒'} ${newItem?.name ?? cmd.itemId} ×${cmd.count} を てにいれた！`, startTime: performance.now() };
          }
          setTimeout(advance, 30);
          break;
        case 'removeItem':
          setInventory(p => { const n = { ...p }; n[cmd.itemId] = Math.max(0, (n[cmd.itemId] ?? 0) - cmd.count); if (n[cmd.itemId] === 0) delete n[cmd.itemId]; return n; });
          setTimeout(advance, 30);
          break;
        case 'warp':
          engineRef.current.player.x = cmd.col * TILE_SIZE;
          engineRef.current.player.y = cmd.row * TILE_SIZE;
          setTimeout(advance, 50);
          break;
        case 'wait':
          setTimeout(advance, cmd.frames * 16);
          break;
        case 'comment':
          setTimeout(advance, 0);
          break;
        case 'label':
          setTimeout(advance, 0);
          break;
        case 'jump': {
          const found = cmds.findIndex((c, i) => c.type === 'label' && c.name === cmd.label);
          if (found >= 0) index = found;
          setTimeout(advance, 0);
          break;
        }
        case 'changeGold':
          progressRef.current.gold = (progressRef.current.gold ?? 0) + cmd.amount;
          forceHud(n => n + 1);
          setTimeout(advance, 30);
          break;
        case 'restoreHp': {
          const amt = cmd.amount;
          if (gameDataRef.current.engine === 'rpg') {
            const pr2 = progressRef.current;
            pr2.hp = amt != null ? Math.min(pr2.maxHp, pr2.hp + amt) : pr2.maxHp;
          } else {
            const z = onjRezeHpRef.current;
            z.hp = amt != null ? Math.min(z.max, z.hp + amt) : z.max;
          }
          forceHud(n => n + 1);
          setTimeout(advance, 30);
          break;
        }
        case 'restoreMp': {
          const pr3 = progressRef.current;
          pr3.mp = cmd.amount != null ? Math.min(pr3.maxMp, pr3.mp + (cmd.amount ?? 0)) : pr3.maxMp;
          forceHud(n => n + 1);
          setTimeout(advance, 30);
          break;
        }
        case 'ifGold': {
          const condG = (progressRef.current.gold ?? 0) >= cmd.amount;
          const subG = condG ? cmd.then : (cmd.else ?? []);
          cmds = [...cmds.slice(0, index), ...subG, ...cmds.slice(index + 1)];
          setTimeout(runNext, 0);
          break;
        }
        default:
          setTimeout(advance, 0);
      }
    };
    eventRunningRef.current = true;
    runNext();
  }, [showGameMsg]);

  const resetSceneState = useCallback(() => {
    eventIdRef.current++;
    eventRunningRef.current = false;
    setActiveDialogue(null);
    activeDialogueRef.current = null;
    afterDialogueRef.current = null;
    if (gameMsgTimerRef.current) {
      clearTimeout(gameMsgTimerRef.current);
      gameMsgTimerRef.current = null;
    }
    setGameMsg(null);
    gameMsgReadyRef.current = false;
    setEventChoice(null);
    eventChoiceRef.current = null;
    setShopModal(null);
  }, []);

  const runObjectEvent = useCallback((obj: ObjectDef) => {
    if (eventRunningRef.current) return;
    const page = findActivePage(obj);
    if (page && page.commands.length > 0) {
      runEventCommands(obj.id, page.commands);
      return true;
    }
    return false;
  }, [findActivePage, runEventCommands]);

  const previewMmlAsset = useCallback(async (_key: string, asset?: { src?: string; type?: 'youtube' | 'mml' | 'direct' }) => {
    previewStopRef.current?.();
    previewStopRef.current = null;
    if (!asset?.src) return;
    if (asset.type === 'direct') {
      const a = new Audio(asset.src); a.volume = 0.7; a.play().catch(() => {});
      previewStopRef.current = () => { a.pause(); a.currentTime = 0; };
      return;
    }
    if (asset.type !== 'mml') return;
    try {
      const { playMML } = await import('@onjmin/dtm');
      const bgm = playMML(asset.src, {
        loop: false,
        onStop: () => { previewStopRef.current = null; }
      });
      previewStopRef.current = () => { bgm.stop(); bgm.destroy(); };
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => () => { previewStopRef.current?.(); previewStopRef.current = null; }, []);

  const ensureImage = useCallback((url?: string) => {
    if (!url) return;
    // #sx,sy,sw,sh クロップ付き URL: ベースURLでロードし、フルURLをキーにキャッシュ
    const hashIdx = url.indexOf('#');
    const baseUrl = hashIdx !== -1 ? url.slice(0, hashIdx) : url;
    if (imgCache.current.has(url)) return;
    // ベースURLで既にロード済みならそのimgを再利用してフルURLキーで登録
    const existing = imgCache.current.get(baseUrl);
    if (existing) {
      imgCache.current.set(url, existing);
      const k = keyedCache.current.get(baseUrl);
      if (k) keyedCache.current.set(url, k);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    // 読込完了後にマット背景を検出して透明化し、描画ソース用 canvas をキャッシュ（失敗時は元画像のまま）。
    img.onload = () => {
      const keyed = makeChromaKeyed(img);
      if (keyed) {
        keyedCache.current.set(url, keyed);
        if (hashIdx !== -1) keyedCache.current.set(baseUrl, keyed);
      }
    };
    img.src = baseUrl;
    imgCache.current.set(url, img);
    if (hashIdx !== -1) imgCache.current.set(baseUrl, img); // ベースURLでも登録
  }, []);

  // spriteRef から URL を抽出して ensureImage する（Entity.def は spriteUrl を除外するため）
  const ensureImageFromRef = useCallback((spriteRef?: string, spriteUrl?: string) => {
    const walk = spriteRef ? parseWalkRef(spriteRef) : null;
    if (walk?.stdId !== 'smc_json') {
      ensureImage(spriteUrl);
    }
    if (!spriteRef) return;
    if (walk?.source.kind === 'url') {
      if (walk.stdId === 'smc_json') {
        const parts = walk.source.url.split(':');
        const spriteKey = parts[1];
        let animName = parts[2];
        const spriteData = globalSmcMetadata?.[spriteKey];
        if (spriteData) {
          if (!animName) {
            if (spriteKey === 'Goomba') animName = '2Walk';
            else if (spriteKey === 'KoopaTroopa') animName = '2Walk';
            else if (spriteKey === 'DryBones') animName = '1Walk';
            else if (spriteKey === 'Bobomb') animName = 'Walk';
            else if (spriteKey === 'Boo') animName = '1Idle';
            else animName = Object.keys(spriteData.animations)[0];
          }
          let anim = spriteData.animations[animName];
          if (!anim) anim = Object.values(spriteData.animations)[0];
          if (anim) {
            ensureImage(resolveSMCUrl(anim.frames[0].image));
          }
        }
      } else {
        ensureImage(walk.source.url);
      }
    }
  }, [ensureImage]);

  useEffect(() => {
    ensureImageFromRef(gameData.player.spriteRef, gameData.player.spriteUrl);
    Object.values(gameData.tiles).forEach(t => ensureImage(t.imageUrl));
    gameData.objects.forEach(o => ensureImageFromRef(o.spriteRef, o.spriteUrl));
    ensureImageFromRef(objTemplate.spriteRef, objTemplate.spriteUrl);
    ensureImage(gameData.mapBgUrl);
    ensureImage(gameData.titleScreen?.bgUrl);
    ensureImage(gameData.ending?.bgUrl);
  }, [gameData, objTemplate, ensureImage, smcMetadata]);

  const resetGame = useCallback((id: PresetId) => {
    const data = clone(PRESETS[id]);
    // シーンモードなら scenes[0] の map/objects を初期表示に使う
    if (data.scenes?.length) {
      data.map = JSON.parse(JSON.stringify(data.scenes[0].map));
      data.objects = JSON.parse(JSON.stringify(data.scenes[0].objects));
    }
    setPresetId(id);
    setGameData(data);
    setTitle(PRESETS[id].name);
    setEditorTab('map');
    setEditSceneIdx(0);
    const eng = engineRef.current;
    eng.player = { ...data.player.start, vx: 0, vy: 0, isGrounded: false };
    eng.keys.clear();
    eng.bullets = []; eng.enemyBullets = []; eng.entities = [];
    actionDirRef.current = 1; actionShootCoolRef.current = 0;
    eng.map = JSON.parse(JSON.stringify(data.map));
    const sw = data.scroll?.worldCols ?? COLS; const sh = data.scroll?.worldRows ?? ROWS;
    setEditScroll(Math.max(0, Math.min(sw * TILE_SIZE - VIEW_W, data.player.start.x + data.player.w / 2 - VIEW_W / 2)));
    setEditScrollY(Math.max(0, Math.min(sh * TILE_SIZE - VIEW_H, data.player.start.y + data.player.h / 2 - VIEW_H / 2)));
    setIsPlaying(false); setSelectedObjId(null);
    setShowTitle(false); setShowEnding(false);
  }, []);

  const restart = useCallback(() => {
    const eng = engineRef.current;
    eng.player = { ...gameData.player.start, vx: 0, vy: 0, isGrounded: false };
    justStartedRef.current = true;
    eng.keys.clear();
    eng.bullets = []; eng.enemyBullets = []; eng.entities = [];
    actionDirRef.current = 1; actionShootCoolRef.current = 0;
    invulnRef.current = 0;
    bombInvulnRef.current = 0;
    isPlayerDeadRef.current = false;
    roundOverRef.current = false;
    warpCooldownRef.current = null;
    setIsPlaying(false); setSelectedObjId(null);
    setShowEnding(false); setGameOverResult(null);
  }, [gameData]);

  useEffect(() => {
    if (initialManifest) {
      // 既存ゲームを読み込む
      const preset = PRESETS[initialManifest.preset] ? initialManifest.preset : 'dq';
      const base = clone(PRESETS[preset]);
      const data: PresetData = {
        ...base,
        engine: initialManifest.engine,
        name: initialManifest.name,
        gravity: initialManifest.gravity,
        friction: initialManifest.friction,
        player: { ...base.player, ...initialManifest.player, spriteUrl: hydrateUrlFromRef(initialManifest.player.spriteRef) },
        tiles: Object.fromEntries(
          Object.entries(initialManifest.tiles).map(([k, t]) => [k, { ...t, imageUrl: hydrateUrlFromRef(t.imageRef) }])
        ),
        map: initialManifest.map,
        overlayMap: initialManifest.overlayMap ?? emptyGridLike(initialManifest.map),
        objects: initialManifest.objects.map(o => ({ ...o, spriteUrl: hydrateUrlFromRef(o.spriteRef) })),
        scroll: initialManifest.scroll ?? base.scroll,
        phases: initialManifest.phases ?? base.phases,
        titleScreen: initialManifest.titleScreen ?? base.titleScreen,
        ending: initialManifest.ending ?? base.ending,
        battle: initialManifest.battle ?? base.battle,
        layout25d: initialManifest.layout25d ?? base.layout25d,
        bgm: initialManifest.bgm && initialManifest.bgm !== 'none' ? { ref: initialManifest.bgm } : undefined,
        battleBgm: initialManifest.battleBgm ? { ref: initialManifest.battleBgm } : undefined,
        bossBgm: initialManifest.bossBgm ? { ref: initialManifest.bossBgm } : undefined,
        sfx: Object.fromEntries(
          Object.entries(initialManifest.sfx).map(([k, v]) => [k, v ? { ref: v } : undefined])
        ) as PresetData['sfx'],
        mapBgRef: initialManifest.mapBgRef,
        mapBgUrl: undefined,
      };
      setPresetId(preset);
      setGameData(data);
      setTitle(initialManifest.name);
      const eng = engineRef.current;
      eng.player = { ...data.player.start, vx: 0, vy: 0, isGrounded: false };
      eng.map = JSON.parse(JSON.stringify(data.map));
      if (playOnly) {
        if (data.titleScreen?.enabled) setShowTitle(true);
        else setIsPlaying(true);
      }
    } else {
      resetGame('onjReze');
    }
  }, [initialManifest, playOnly, resetGame]);

  // ── 入口ヒーロー：開いた瞬間にデモ再生して「動くゲーム」で迎える ──
  useEffect(() => {
    if (introOpen) setIsPlaying(true);
  }, [introOpen]);

  /** ヒーローでプリセットを切り替えてデモを再生し直す（②ギャラリーの予告）。 */
  const previewPresetInIntro = useCallback((id: PresetId) => {
    resetGame(id);          // isPlaying=false にリセット
    setIsPlaying(true);     // 同フレームで再生 → 新プリセットのデモが回る
  }, [resetGame]);

  const [introAnim, setIntroAnim] = useState<'right' | 'left'>('right');
  const navigateIntro = useCallback((dir: 1 | -1) => {
    const idx = PRESET_ORDER.indexOf(presetId);
    const next = PRESET_ORDER[(idx + dir + PRESET_ORDER.length) % PRESET_ORDER.length];
    setIntroAnim(dir === 1 ? 'right' : 'left');
    previewPresetInIntro(next);
  }, [presetId, previewPresetInIntro]);

  /** ヒーローから「あそぶ」。タイトル画面があればそれを、なければ即プレイ。 */
  const enterPlayFromIntro = useCallback(() => {
    setIntroOpen(false);
    setActivePreviewKey(null);
    if (gameData.titleScreen?.enabled) { restart(); setShowTitle(true); return; }
    // デモ中（isPlaying=true）から即プレイに移行する際、restart() の setIsPlaying(false) と
    // 直後の setIsPlaying(true) がバッチされて isPlaying が変化しないため、
    // flushSync で false を確定コミットしてからエフェクトを再実行させる
    flushSync(() => restart());
    setIsPlaying(true);
  }, [gameData.titleScreen, restart]);

  /** ヒーローから「改造する」。デモを止めてエディタへ。 */
  const enterEditFromIntro = useCallback(() => {
    setIntroOpen(false);
    restart();              // デモ停止＋初期位置に戻す
  }, [restart]);

  /** ゲームオーバーリザルトから「リトライ」 */
  const handleGameOverRetry = useCallback(() => {
    flushSync(() => restart());
    setIsPlaying(true);
  }, [restart]);

  /** ゲームオーバーリザルトから「終了」（エディタへ戻る） */
  const handleGameOverExit = useCallback(() => {
    restart();
  }, [restart]);

  // BGM
  useEffect(() => {
    if (isPlaying) {
      if (battleBgmActiveRef.current !== 'none') return;
      const currentBgm = getCurrentFieldBgm();
      if (currentBgm?.src) {
        const type = currentBgm.type;
        const src = currentBgm.src;
        const loopOption = getLoopOption(currentBgm.ref);
        const volume = getBgmVolume(currentBgm.ref);
        if (type && src) bgmManager.play({ bgm: { type, src, loop: loopOption, volume } as any, tileset: {} });
        else {
          const asset = bgmRefToAsset(currentBgm.ref);
          if (asset) bgmManager.play({ bgm: asset, tileset: {} } as never); else bgmManager.stop();
        }
      } else {
        bgmManager.stop();
      }
    } else {
      bgmManager.stop();
    }
    return () => bgmManager.stop();
  }, [isPlaying, gameData.bgm, editSceneIdx, getCurrentFieldBgm]);

  // ── シーン切り替えモード：全シーンをワールドマップに合成して初期化 ──
  useEffect(() => {
    if (!isPlaying || !gameData.scenes?.length) {
      scenesRef.current = [];
      worldLayoutRef.current = null;
      return;
    }
    scenesRef.current = gameData.scenes.map(s => ({ ...s })) as SceneDef[];
    activeSceneIdxRef.current = 0;
    sceneTransRef.current = null;
    // 全シーンを1枚のワールドマップに合成（事前ロードでシームレス遷移）
    const layout = buildWorldLayout(scenesRef.current);
    worldLayoutRef.current = layout;
    engineRef.current.map = JSON.parse(JSON.stringify(layout.map));
    // シーン0の原点でプレイヤー位置を補正
    const s0 = layout.layouts.find(l => l.sceneIdx === 0);
    if (s0) {
      const ep = engineRef.current.player;
      ep.x = s0.originX * TILE_SIZE + gameData.player.start.x;
      ep.y = s0.originY * TILE_SIZE + gameData.player.start.y;
    }
    // シーン0のエンティティをワールド座標で配置
    const s0l = layout.layouts.find(l => l.sceneIdx === 0)!;
    engineRef.current.entities = (scenesRef.current[0]?.objects ?? []).map(o => ({
      x: (s0l.originX + o.col) * TILE_SIZE,
      y: (s0l.originY + o.row) * TILE_SIZE,
      homeX: (s0l.originX + o.col) * TILE_SIZE,
      homeY: (s0l.originY + o.row) * TILE_SIZE,
      vx: 0, vy: 0, hp: o.hp, timer: 0, talked: false,
      def: o, // spriteUrl を保持する（SceneDef.objects は spriteUrl を含む ObjectDef）
    })) as unknown as Entity[];
    // 全シーンのスプライト画像を事前ロード（spriteUrl は Entity.def から除外されるため spriteRef も参照）
    gameData.scenes?.forEach(s => s.objects.forEach(o => ensureImageFromRef(o.spriteRef, o.spriteUrl)));
  }, [isPlaying, gameData.scenes, gameData.player.start, ensureImage, ensureImageFromRef]);

  // プレイ開始時に sfx を音量極小で一瞬再生してブラウザにデコード・バッファさせる
  useEffect(() => {
    if (!isPlaying) return;
    Object.values(gameData.sfx).forEach(s => {
      if (!s?.src || s.type !== 'direct') return;
      const a = new Audio(s.src);
      a.volume = 0.00001;
      a.play().then(() => { a.pause(); a.src = ''; }).catch(() => {});
    });
  }, [isPlaying, gameData.sfx]);

  // タイトル／エンディング画面の BGM（プレイ中の BGM とは独立）
  useEffect(() => {
    const ref = showTitle ? gameData.titleScreen?.bgmRef : showEnding ? gameData.ending?.bgmRef : undefined;
    if (ref) {
      const asset = bgmRefToAsset(ref);
      if (asset) bgmManager.play({ bgm: asset, tileset: {} } as never);
      return () => bgmManager.stop();
    }
  }, [showTitle, showEnding, gameData.titleScreen?.bgmRef, gameData.ending?.bgmRef]);

  // Spawn entities on play
  useEffect(() => {
    const eng = engineRef.current;
    if (isPlaying) {
      eng.bullets = []; eng.enemyBullets = [];
      const isTouhouWave = (o: ObjectDef) => gameData.engine === 'touhou' && !o.isBoss;
      const makeEntity = (o: ObjectDef): Entity => ({
        def: o, x: o.col * TILE_SIZE,
        y: isTouhouWave(o) ? -TILE_SIZE * 2 : (o.row + 1) * TILE_SIZE - (o.h ?? TILE_SIZE),
        homeX: o.col * TILE_SIZE, homeY: (o.row + 1) * TILE_SIZE - (o.h ?? TILE_SIZE),
        hp: o.hp, timer: 0, vx: 0, vy: 0, talked: false,
        spellState: o.spellScript?.length
          ? { stack: [{ script: o.spellScript, ip: 0, timesLeft: -1 as number }, ], frame: 0, waitLeft: 0 }
          : undefined,
      });
      const spawnEntities = (entities: Entity[]) => {
        if (gameData.engine === 'touhou') {
          entities.forEach(e => {
            if (e.def.miniScript) runEntityScript(e.def.miniScript, e, eng, () => eng.player);
          });
        }
        return entities;
      };
      if (gameData.engine === 'touhou' && gameData.phases?.length) {
        // フェーズシステム：フェーズ 0 から開始
        phaseIndexRef.current = -1;
        pendingPhaseRef.current = null;
        const phase0 = gameData.phases[0];
        if (phase0?.dialogue?.length) {
          eng.entities = [];
          pendingPhaseRef.current = 0;
          setActiveDialogue(phase0.dialogue);
        } else {
          eng.entities = buildPhaseEntities(0, gameData, eng, waveCtxRef, waveRunningRef);
          phaseIndexRef.current = 0;
        }
      } else {
        // レガシー：全オブジェクトをスポーン（touhou の isBoss は除外）
        const stageObjs = gameData.engine === 'touhou'
          ? gameData.objects.filter(o => !o.isBoss)
          : gameData.objects;
        eng.entities = spawnEntities(stageObjs.map(makeEntity));
        phaseIndexRef.current = 0;
      }
      eng.map = JSON.parse(JSON.stringify(gameData.map));
      eng.player = { ...gameData.player.start, vx: 0, vy: 0, isGrounded: false };
      // 戦闘プレイヤーの初期化
      const b = gameData.battle;
      if (b) progressRef.current = { hp: b.maxHp, mp: b.maxMp, maxHp: b.maxHp, maxMp: b.maxMp, atk: b.atk, def: b.def, baseAtk: b.atk, baseDef: b.def, level: 1, exp: 0, expNext: b.levelTable?.[0]?.exp ?? 10, gold: b.gold ?? 0 };
      setEquipment({}); equipmentRef.current = {};
      battleRef.current = { active: false, entity: null, enemyName: '', enemyHp: 0, enemyMaxHp: 0, enemyAtk: 0, enemyDef: 0, enemyMoves: [], exp: 0, gold: 0, isBoss: false, mercy: 0 };
      encounterGaugeRef.current = 0; encounterNextRef.current = 0;
      invulnRef.current = 0; isPlayerDeadRef.current = false; roundOverRef.current = false; livesRef.current = 3; scoreRef.current = 0;
      // onjReze：ハート・向き・剣の初期化
      const zMax = Math.max(1, gameData.player.hearts ?? 3) * 2;
      onjRezeHpRef.current = { hp: zMax, max: zMax };
      // マリオ系パワーアップの初期化
      marioPowerRef.current = 'small'; coinsRef.current = 0; starTimerRef.current = 0;
      marioTransformingRef.current = 0;
      marioPipeRef.current = null;
      marioGoalRef.current = null;
      blockAnimsRef.current = [];
      usedBlocksRef.current = new Set();
      checkpointRef.current = null;
      onjRezeDirRef.current = { x: 0, y: 1 };
      swordRef.current = { active: 0, cool: 0, dir: { x: 0, y: 1 }, hit: new Set() };
      ensureImage(SWORD_SPRITE_URL); // 剣の初回スイングで絵文字が一瞬映るのを防ぐため先読みしておく
      onjBombsRef.current = []; onjFliesRef.current = []; onjBlastsRef.current = [];
      onjBombCoolRef.current = 0; onjThrowCoolRef.current = 0;
      // action エンジン：武器スロット初期化
      actionWeaponsRef.current = [...(gameData.player.weapons ?? [])];
      actionWeaponIdxRef.current = 0;
      actionWeaponEnergyRef.current = {};
      actionWeaponsRef.current.forEach(w => { actionWeaponEnergyRef.current[w] = MAX_WEAPON_ENERGY; });

      bossDefeatedRef.current = false; bossWarnRef.current = false; outroModeRef.current = false; npcTalkRef.current = null; itemGetRef.current = null;
      bombCountRef.current = gameData.player.bombCount ?? 3;
      bombInvulnRef.current = 0; bombCooldownRef.current = 0;
      bombPickupsRef.current = []; spellCardTriggeredRef.current = new Set();
      activeSpellCardNameRef.current = null; setSpellCutin(null);
      grazeRef.current = 0; grazeFlashRef.current = 0;
      bossBgmActiveRef.current = false;
      setActiveDialogue(null);
      setBattle(null);
      setBattleItemsOpen(false); setBagOpen(false);
      setSwitchVals({}); switchValsRef.current = {};
      setInventory({}); inventoryRef.current = {};
      selfSwitchesRef.current = {};
      eventRunningRef.current = false;
    } else {
      eng.map = gameData.map;
      eng.entities = [];
      if (waveCtxRef.current) waveCtxRef.current.cancelled = true;
      waveRunningRef.current = false;
      eng.player.vx = 0; eng.player.vy = 0; eng.player.isGrounded = false;
      battleRef.current.active = false;
      setBattle(null);
    }
  }, [isPlaying, gameData]);

  const resetIdleTimer = useCallback(() => {
    setShowControlGuide(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    const hasOverlay = !!activeDialogue || !!gameMsg || !!shopModal || !!eventChoice || !!gameOverResult;
    if (isPlaying && !hasOverlay && gameData.engine !== 'yume25d') {
      idleTimerRef.current = setTimeout(() => {
        setShowControlGuide(true);
      }, 3500);
    }
  }, [isPlaying, activeDialogue, gameMsg, shopModal, eventChoice, gameOverResult, gameData.engine]);

  useEffect(() => {
    const hasOverlay = !!activeDialogue || !!gameMsg || !!shopModal || !!eventChoice || !!gameOverResult;
    if (!isPlaying || hasOverlay || gameData.engine === 'yume25d') {
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
  }, [isPlaying, activeDialogue, gameMsg, shopModal, eventChoice, gameOverResult, gameData.engine, resetIdleTimer]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    // ワールド寸法（touhou は画面固定のため常に 1 画面。それ以外は毎フレーム updateWorldBounds() で
    // engineRef.current.map（ワープ／シーン切替のたびに実際に差し替わる生きたマップ）実寸から再計算する。
    // gameData.map/scroll はシーン切替時に更新されないため、effect 起動時の値のまま固定してしまうと
    // ワープ先シーンのサイズに関わらず旧シーンの境界で移動がクランプされるバグになる。
    let worldCols = gameData.engine === 'touhou' ? COLS
      : (gameData.map[0]?.length ?? gameData.scroll?.worldCols ?? COLS);
    let worldRows = gameData.engine === 'touhou' ? ROWS
      : (gameData.map.length ?? gameData.scroll?.worldRows ?? ROWS);
    let worldW = worldCols * TILE_SIZE;
    let worldH = worldRows * TILE_SIZE;
    let camMax = Math.max(0, worldW - VIEW_W);
    let camMaxY = Math.max(0, worldH - VIEW_H);
    const updateWorldBounds = () => {
      if (gameData.engine === 'touhou') return;
      // engineRef.current.map は「合成ワールド(exits)」でも「シーン単体ワープ」でも、実際に描画・
      // 当たり判定に使われているマップへ常に差し替わるため、これを唯一の正とする
      // （worldLayoutRef はシーンに exits が無い場合 scenesRef.current[0] のみを含んだまま固定される
      //   ことがあり、ワープ後の実サイズと食い違うので基準にしない）。
      const liveMap = engineRef.current.map;
      worldCols = liveMap[0]?.length ?? gameData.scroll?.worldCols ?? COLS;
      worldRows = liveMap.length ?? gameData.scroll?.worldRows ?? ROWS;
      worldW = worldCols * TILE_SIZE;
      worldH = worldRows * TILE_SIZE;
      camMax = Math.max(0, worldW - VIEW_W);
      camMaxY = Math.max(0, worldH - VIEW_H);
    };

    const isInputTarget = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputTarget(e)) return;
      engineRef.current.keys.add(e.key);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (e.key === 'f' || e.key === 'F') { setEditSpeedMult(prev => { const speeds = [1, 2, 4]; return speeds[(speeds.indexOf(prev) + 1) % speeds.length]; }); e.preventDefault(); }
    };
    const handleKeyUp = (e: KeyboardEvent) => { if (isInputTarget(e)) return; engineRef.current.keys.delete(e.key); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const getTile = (x: number, y: number) => {
      const col = Math.floor(x / TILE_SIZE); const row = Math.floor(y / TILE_SIZE);
      if (col < 0 || col >= worldCols || row < 0 || row >= worldRows) return null;
      const id = engineRef.current.map[row]?.[col] ?? 0;
      return { id, rect: { x: col * TILE_SIZE, y: row * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE }, info: gameData.tiles[id] };
    };
    // モブ（非hazardのNPC）との衝突判定（円形）。敵(hazard)はすり抜け・接触ダメージ等の既存挙動を維持するため対象外。
    const isBlockedByMob = (x: number, y: number, w: number, h: number) => {
      const cx = x + w / 2, cy = y + h / 2;
      const playerR = Math.min(w, h) / 2 * 0.7;
      return engineRef.current.entities.some(e => {
        // 敵、ワープ、アイテムは「モブ」ではないため衝突対象から除外（踏んで発動する挙動を維持）
        if (e.def.hazard || e.def.objType === 'warp' || e.def.objType === 'item') return false;
        const ew = e.def.w ?? TILE_SIZE, eh = e.def.h ?? TILE_SIZE;
        const ecx = e.x + ew / 2, ecy = e.y + eh / 2;
        const mobR = Math.min(ew, eh) / 2 * 0.7;
        return Math.hypot(cx - ecx, cy - ecy) < playerR + mobR;
      });
    };

    // 歩行グラ用の状態: 規格の自動判定キャッシュ と 各インスタンスの向き/移動追跡。
    const walkStdCache = new Map<string, WalkStandard>();
    const walkInst = new Map<string, { px: number; py: number; dir: WayKey }>();
    const horizontalEngine = gameData.engine === 'action'; // 横スク（マリオ系）は左右のみ

    const drawSpriteInner = (
      def: { emoji: string; spriteUrl?: string; spriteRef?: string },
      x: number, y: number, w: number, h: number,
      animKey?: string,
      overrideDir?: WayKey,
    ) => {
      const walk = def.spriteRef ? parseWalkRef(def.spriteRef) : null;
      const resolvedUrl = def.spriteUrl
        ?? (walk?.source.kind === 'url' ? walk.source.url : undefined);

      // 向き・移動を画面上の移動量から導出（エンジン非依存）
      const key = animKey ?? resolvedUrl ?? 'unknown';
      const prev = walkInst.get(key);
      let dx = 0, dy = 0;
      if (prev) { dx = x - prev.px; dy = y - prev.py; }
      let dir: WayKey = overrideDir ?? prev?.dir ?? 's';
      const moving = Math.hypot(dx, dy) > 0.15;
      // dq/onjReze/touhou は静止中も足踏みアニメを続ける（向き判定には影響させない）
      const animMoving = moving || gameData.engine === 'rpg' || gameData.engine === 'touhou' || gameData.engine === 'onjReze';
      if (!overrideDir && moving) {
        if (horizontalEngine) dir = dx >= 0 ? (Math.abs(dx) > 0.05 ? 'd' : dir) : 'a';
        else dir = dirFromDelta(dx, dy) ?? dir;
      }
      walkInst.set(key, { px: x, py: y, dir: overrideDir ?? dir });

      // SMC Metadata-driven rendering (smc_json)
      if (walk?.stdId === 'smc_json' && walk.source.kind === 'url') {
        const parts = walk.source.url.split(':');
        const spriteKey = parts[1];
        let animName = parts[2];
        const spriteData = globalSmcMetadata?.[spriteKey];
        if (spriteData) {
          if (spriteKey === 'PlayerSprite' && animKey === 'player') {
            const pObj = engineRef.current.player;
            let action = !pObj.isGrounded ? 'Jump' : (Math.abs(pObj.vx) > 0.15 ? 'Walk' : 'Idle');
            let prefix = marioPowerRef.current === 'small' ? '1' : '2';
            if (marioTransformingRef.current > 0) {
              const showSmall = Math.floor(marioTransformingRef.current / 4) % 2 === 0;
              prefix = showSmall ? '1' : '2';
            }
            let nameOverride = '';
            if (marioGoalRef.current) {
              const goal = marioGoalRef.current;
              if (goal.phase === 'slide') {
                nameOverride = `${prefix}PoleClimb0_3`;
              } else if (goal.phase === 'walk') {
                action = 'Walk';
              }
            }
            animName = nameOverride || (animName || '2Idle0_3').replace(/(Idle|Walk|Jump)/g, action);
            if (!nameOverride) {
              animName = prefix + animName.slice(1);
            }
          } else if (spriteKey === 'NPC') {
            const base = animName || '1NPC0';
            const isMoving = Math.hypot(dx, dy) > 0.15;
            if (isMoving && spriteData.animations[`${base}_Walk`]) {
              animName = `${base}_Walk`;
            } else {
              animName = base;
            }
          }

          if (!animName) {
            if (spriteKey === 'Goomba') animName = '2Walk';
            else if (spriteKey === 'KoopaTroopa') animName = '2Walk';
            else if (spriteKey === 'DryBones') animName = '1Walk';
            else if (spriteKey === 'Bobomb') animName = 'Walk';
            else if (spriteKey === 'Boo') animName = '1Idle';
            else animName = Object.keys(spriteData.animations)[0];
          }

          let anim = spriteData.animations[animName];
          if (!anim) anim = Object.values(spriteData.animations)[0];
          if (anim) {
            // SMC のアニメは各コマが別シートにまたがることがある
            // （例: Goomba 2Walk は f0=tiles-sheet5, f1=goomba-sheet0）。
            // frames[0] のシート固定で各コマの矩形を切ると別フレームに化けるので、
            // 全コマの画像をプリロードし、描画は選択コマ自身の画像から行う。
            anim.frames.forEach((f: any) => {
              const u = resolveSMCUrl(f.image);
              if (!imgCache.current.get(u)) ensureImage(u);
            });
            const framesCount = anim.frames.length;
            let frameIndex = 0;
            if (framesCount > 1) {
              let fps = anim.speed || 7;
              if (spriteKey === 'PlayerSprite' && animKey === 'player') {
                const pObj = engineRef.current.player;
                const isDash = engineRef.current.keys.has('Shift') || engineRef.current.keys.has('c') || engineRef.current.keys.has('C');
                if (isDash && Math.abs(pObj.vx) > 1.0) {
                  fps *= 1.6;
                }
              }
              frameIndex = Math.floor((performance.now() / 1000) * fps) % framesCount;
            }
            let frame = anim.frames[frameIndex];
            let smcUrl = resolveSMCUrl(frame.image);
            let targetImg = imgCache.current.get(smcUrl);
            // 選択コマの画像が未ロードなら先頭コマにフォールバック（チラつき防止）。
            if (!(targetImg && targetImg.complete && targetImg.naturalWidth > 0)) {
              frame = anim.frames[0];
              smcUrl = resolveSMCUrl(frame.image);
              targetImg = imgCache.current.get(smcUrl);
            }
            if (targetImg && targetImg.complete && targetImg.naturalWidth > 0) {
              const srcImg = keyedCache.current.get(smcUrl) ?? targetImg;
              const sx = frame.x;
              const sy = frame.y;
              const sw = frame.w;
              const sh = frame.h;

              // 左向き素材は反転条件を逆転させ、常に進行方向を向かせる。
              const flip = SMC_LEFT_FACING.has(spriteKey) ? dir === 'd' : dir === 'a';

              const zoom = 1.0;
              const destW = sw * zoom;
              const destH = sh * zoom;
              const destX = x + (w - destW) / 2;
              const destY = y + (h - destH);

              if (flip) {
                ctx.save();
                ctx.translate(destX + destW, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(srcImg, sx, sy, sw, sh, 0, destY, destW, destH);
                ctx.restore();
              } else {
                ctx.drawImage(srcImg, sx, sy, sw, sh, destX, destY, destW, destH);
              }
              return;
            }
          }
        }
      }

      const img = resolvedUrl ? imgCache.current.get(resolvedUrl) : undefined;
      const loaded = !!img && img.complete && img.naturalWidth > 0;

      if (loaded && walk && resolvedUrl) {
        // 規格を判定（auto は実寸から推定）してキャッシュ
        let std = walkStdCache.get(resolvedUrl);
        if (!std) {
          std = walk.stdId === 'auto'
            ? detectStandard(img!.naturalWidth, img!.naturalHeight)
            : standardById(walk.stdId);
          walkStdCache.set(resolvedUrl, std);
        }

        // 描画ソース: マット透明化済み canvas があればそれを使う（寸法は元画像から取る）。
        const srcImg: CanvasImageSource = keyedCache.current.get(resolvedUrl) ?? img!;
        const imgW = img!.naturalWidth;
        const imgH = img!.naturalHeight;
        if (walk.crop) {
          // SMC専用ロジック（lib/smc-sprite.ts）: ストリップを分割。
          // 右向き素材なので、左移動時は水平反転して描く。
          const rect = smcFrameRect(walk.crop, { moving: animMoving, timeSec: performance.now() / 1000, fps: 7, frames: walk.frames });
          
          // アスペクト比を保ち、縦幅を h に合わせ、横幅をスケーリングして中央揃えにする。
          const baseH = rect.sh;
          const zoom = h / baseH;
          const destW = rect.sw * zoom;
          const destH = rect.sh * zoom;
          const destX = x + (w - destW) / 2;
          const destY = y + (h - destH); // 下端を合わせる

          if (dir === 'a') {
            ctx.save();
            ctx.translate(destX + destW, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(srcImg, rect.sx, rect.sy, rect.sw, rect.sh, 0, destY, destW, destH);
            ctx.restore();
          } else {
            ctx.drawImage(srcImg, rect.sx, rect.sy, rect.sw, rect.sh, destX, destY, destW, destH);
          }
          return;
        }

        const cell = animatedCell(std, imgW, imgH, {
          dir: std.flipH ? 'd' : dir,
          moving: animMoving, timeSec: performance.now() / 1000, fps: 7,
        });
        const flipLeft = std.flipH && dir === 'a';
        if (flipLeft) {
          ctx.save();
          ctx.translate(x + w, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(srcImg, cell.sx, cell.sy, cell.sw, cell.sh, 0, y, w, h);
          ctx.restore();
        } else {
          ctx.drawImage(srcImg, cell.sx, cell.sy, cell.sw, cell.sh, x, y, w, h);
        }
        return;
      }

      if (loaded) {
        ctx.drawImage(keyedCache.current.get(resolvedUrl!) ?? img!, x, y, w, h);
      } else {
        ctx.font = `${w}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(def.emoji, x + w / 2, y + h + 4);
      }
    };

    const drawSprite = (
      def: { emoji: string; spriteUrl?: string; spriteRef?: string },
      x: number, y: number, w: number, h: number,
      animKey?: string,
      overrideDir?: WayKey,
    ) => {
      const isPlayer = animKey === 'player';
      // touhouエンジンではジャンプ演出のsquash/stretchは不要なので適用しない
      const useScale = isPlayer && gameData.engine !== 'touhou';
      if (useScale) {
        ctx.save();
        const centerX = x + w / 2;
        const bottomY = y + h;
        ctx.translate(centerX, bottomY);
        ctx.scale(scaleXRef.current, scaleYRef.current);
        ctx.translate(-centerX, -bottomY);
      }
      drawSpriteInner(def, x, y, w, h, animKey, overrideDir);
      if (useScale) {
        ctx.restore();
      }
    };

    const win = () => { playSfx(sfxRef.current.clear); showGameMsg('🎉 クリア！', 'timed', () => { setIsPlaying(false); if (endingRef.current?.enabled) setShowEnding(true); }); };
const lose = (msg: string) => {
      // ── マリオ体力制ゲームオーバー ──────────────────────────────────
      // 小状態でのミスはHPを-1し、0になったらフキダシなしで直接ゲームオーバー演出へ。
      if (gameData.id === 'mario' && !debugInvincibleRef.current) {
        if (roundOverRef.current) return;
        roundOverRef.current = true;
        onjRezeHpRef.current.hp -= 1;
        forceHud(n => n + 1);
        hitShake();
        playSfx(sfxRef.current.damage);
        if (onjRezeHpRef.current.hp <= 0) {
          // 体力0 → 専用ゲームオーバー演出
          setTimeout(() => { setGameOverResult({ score: scoreRef.current, marioDeathAnim: true }); }, 1200);
        } else {
          // 体力残あり → チェックポイントまたはスタート地点に戻す
          const p2 = engineRef.current.player;
          const cp = checkpointRef.current;
          p2.x = cp ? cp.x : gameData.player.start.x;
          p2.y = cp ? cp.y : gameData.player.start.y;
          p2.vx = 0; p2.vy = 0; p2.isGrounded = false;
          marioPowerRef.current = 'small'; starTimerRef.current = 0;
          marioTransformingRef.current = 0;
          marioPipeRef.current = null;
          marioGoalRef.current = null;
          invulnRef.current = 120;
          shakeRef.current = 8;
          forceHud(n => n + 1);
          roundOverRef.current = false;
        }
        return;
      }
      // ── 他ゲーム：チェックポイント復帰 ──────────────────────────────
      if (gameData.engine === 'action' && checkpointRef.current && !debugInvincibleRef.current) {
        const p2 = engineRef.current.player;
        p2.x = checkpointRef.current.x;
        p2.y = checkpointRef.current.y;
        p2.vx = 0; p2.vy = 0; p2.isGrounded = false;
        onjRezeHpRef.current.hp = Math.ceil(onjRezeHpRef.current.max / 2);
        marioPowerRef.current = 'small'; starTimerRef.current = 0;  // 復帰時はチビに戻す
        marioTransformingRef.current = 0;
        marioPipeRef.current = null;
        marioGoalRef.current = null;
        invulnRef.current = 120;
        shakeRef.current = 8;
        forceHud(n => n + 1);
        return;
      }

      shakeRef.current = 18; showGameMsg(msg, 'timed', () => setGameOverResult({ score: scoreRef.current }));
    };
    const hitShake = () => { shakeRef.current = Math.max(shakeRef.current, 10); };

    // ── シーン境界検出：ワールドマップ上でプレイヤーが別シーン領域に入ったら即切り替え ──
    const trySceneTrans = () => {
      if (!worldLayoutRef.current || !scenesRef.current.length || roundOverRef.current) return;
      if (sceneFadeRef.current || sceneTransRef.current) return;
      const layout = worldLayoutRef.current;
      const curScene = scenesRef.current[activeSceneIdxRef.current];
      const activeLayout = layout.layouts.find(l => l.sceneIdx === activeSceneIdxRef.current);
      if (!activeLayout || !curScene) return;

      const ep = engineRef.current.player;
      const pw = getPlayerWidth();
      const ph = getPlayerHeight();

      // ロックマン風アクションエンジンのスライド遷移判定
      if (gameData.engine === 'action') {
        const exits = curScene.exits;

        // ── プレイヤーが現在のシーンの境界から「完全に外れている」場合は即時ワープ ──
        // (チェックポイント復帰やワープゲートによる座標ジャンプを検知するため)
        const curLeft = activeLayout.originX * TILE_SIZE;
        const curRight = (activeLayout.originX + activeLayout.sceneW) * TILE_SIZE;
        const curTop = activeLayout.originY * TILE_SIZE;
        const curBottom = (activeLayout.originY + activeLayout.sceneH) * TILE_SIZE;

        const isInside = ep.x + pw > curLeft && ep.x < curRight &&
                        ep.y + ph > curTop && ep.y < curBottom;

        if (!isInside) {
          // どのシーンに属しているか検索
          const px = ep.x / TILE_SIZE, py = ep.y / TILE_SIZE;
          const tgtLay = layout.layouts.find(lay => 
            px >= lay.originX && px < lay.originX + lay.sceneW &&
            py >= lay.originY && py < lay.originY + lay.sceneH
          );
          if (tgtLay && tgtLay.sceneIdx !== activeSceneIdxRef.current) {
            activeSceneIdxRef.current = tgtLay.sceneIdx;
            const newScene = scenesRef.current[tgtLay.sceneIdx];
            engineRef.current.entities = newScene.objects.map(o => ({
              x: (tgtLay.originX + o.col) * TILE_SIZE,
              y: (tgtLay.originY + o.row) * TILE_SIZE,
              homeX: (tgtLay.originX + o.col) * TILE_SIZE,
              homeY: (tgtLay.originY + o.row) * TILE_SIZE,
              vx: 0, vy: 0, hp: o.hp, timer: 0, talked: false,
              def: o,
            })) as unknown as Entity[];
            engineRef.current.bullets = []; engineRef.current.enemyBullets = [];
            resetSceneState();
            setEditSceneIdx(tgtLay.sceneIdx);
            switchBgm(getCurrentFieldBgm());
            return;
          }
        }

        if (!exits) return;

        let dir: 'right' | 'left' | 'up' | 'down' | null = null;
        let targetSceneId: string | undefined;

        if (exits.right && ep.x + pw >= curRight) {
          dir = 'right'; targetSceneId = exits.right;
        } else if (exits.left && ep.x <= curLeft) {
          dir = 'left'; targetSceneId = exits.left;
        } else if (exits.up && ep.y <= curTop) {
          dir = 'up'; targetSceneId = exits.up;
        } else if (exits.down && ep.y + ph >= curBottom) {
          dir = 'down'; targetSceneId = exits.down;
        }

        if (dir && targetSceneId) {
          const nextIdx = scenesRef.current.findIndex(s => s.id === targetSceneId);
          const nextLayout = layout.layouts.find(l => l.sceneIdx === nextIdx);
          if (nextIdx >= 0 && nextLayout) {
            // 現在のカメラ位置を計算
            const camMinX = activeLayout.originX * TILE_SIZE;
            const camMaxX = Math.max(camMinX, (activeLayout.originX + activeLayout.sceneW) * TILE_SIZE - VIEW_W);
            const camMinY = activeLayout.originY * TILE_SIZE;
            const camMaxY = Math.max(camMinY, (activeLayout.originY + activeLayout.sceneH) * TILE_SIZE - VIEW_H);
            const startCamX = Math.max(camMinX, Math.min(camMaxX, ep.x + pw / 2 - VIEW_W / 2));
            const startCamY = Math.max(camMinY, Math.min(camMaxY, ep.y + ph / 2 - VIEW_H / 2));

            // 遷移完了後のカメラ位置を計算
            const nextCamMinX = nextLayout.originX * TILE_SIZE;
            const nextCamMaxX = Math.max(nextCamMinX, (nextLayout.originX + nextLayout.sceneW) * TILE_SIZE - VIEW_W);
            const nextCamMinY = nextLayout.originY * TILE_SIZE;
            const nextCamMaxY = Math.max(nextCamMinY, (nextLayout.originY + nextLayout.sceneH) * TILE_SIZE - VIEW_H);
            
            let endCamX = startCamX;
            let endCamY = startCamY;
            if (dir === 'right') endCamX = nextLayout.originX * TILE_SIZE;
            else if (dir === 'left') endCamX = (nextLayout.originX + nextLayout.sceneW) * TILE_SIZE - VIEW_W;
            else if (dir === 'down') endCamY = nextLayout.originY * TILE_SIZE;
            else if (dir === 'up') endCamY = (nextLayout.originY + nextLayout.sceneH) * TILE_SIZE - VIEW_H;

            endCamX = Math.max(nextCamMinX, Math.min(nextCamMaxX, endCamX));
            endCamY = Math.max(nextCamMinY, Math.min(nextCamMaxY, endCamY));

            // プレイヤーの遷移後の位置（入場座標）
            let endX = ep.x;
            let endY = ep.y;
            if (dir === 'right') {
              endX = nextLayout.originX * TILE_SIZE + 8;
            } else if (dir === 'left') {
              endX = (nextLayout.originX + nextLayout.sceneW) * TILE_SIZE - pw - 8;
            } else if (dir === 'down') {
              endY = nextLayout.originY * TILE_SIZE + 8;
            } else if (dir === 'up') {
              endY = (nextLayout.originY + nextLayout.sceneH) * TILE_SIZE - ph - 8;
            }

            sceneTransRef.current = {
              dir,
              frame: 0,
              nextIdx,
              wideMap: [],
              entryX: endX,
              entryY: endY,
              startX: ep.x,
              startY: ep.y,
              endX,
              endY,
              startCamX,
              startCamY,
              endCamX,
              endCamY
            };
          }
        }
        return;
      }

      // 他のエンジン（rpg, touhou 等）は従来の即時切り替えを維持
      if (!layout.layouts.some(l => l.sceneIdx === activeSceneIdxRef.current)) return;
      const px = ep.x / TILE_SIZE, py = ep.y / TILE_SIZE;
      for (const lay of layout.layouts) {
        if (lay.sceneIdx === activeSceneIdxRef.current) continue;
        if (px >= lay.originX && px < lay.originX + lay.sceneW &&
            py >= lay.originY && py < lay.originY + lay.sceneH) {
          activeSceneIdxRef.current = lay.sceneIdx;
          const newScene = scenesRef.current[lay.sceneIdx];
          engineRef.current.entities = newScene.objects.map(o => ({
            x: (lay.originX + o.col) * TILE_SIZE,
            y: (lay.originY + o.row) * TILE_SIZE,
            homeX: (lay.originX + o.col) * TILE_SIZE,
            homeY: (lay.originY + o.row) * TILE_SIZE,
            vx: 0, vy: 0, hp: o.hp, timer: 0, talked: false,
            def: o,
          })) as unknown as Entity[];
          engineRef.current.bullets = []; engineRef.current.enemyBullets = [];
          encounterGaugeRef.current = 0; encounterNextRef.current = 0;
          resetSceneState();
          setEditSceneIdx(lay.sceneIdx);
          break;
        }
      }
    };

    // 残機制：touhou 専用の死亡ハンドラ
    const handlePlayerDeath = () => {
      const eng = engineRef.current;
      hitShake(); playSfx(sfxRef.current.damage);
      isPlayerDeadRef.current = true;
      eng.bullets = []; // 自機弾を即消去
      livesRef.current--;
      forceHud(n => n + 1);
      if (livesRef.current <= 0) {
        lose('ゲームオーバー…');
      } else {
          // 1.5 秒後に復帰
        setTimeout(() => {
          const p2 = engineRef.current.player;
          p2.x = gameData.player.start.x; p2.y = gameData.player.start.y;
          p2.vx = 0; p2.vy = 0;
          justStartedRef.current = true;
          engineRef.current.bullets = [];
          invulnRef.current = 180; // 3 秒間点滅無敵
          isPlayerDeadRef.current = false;
          marioPowerRef.current = 'small';
          marioTransformingRef.current = 0;
          marioPipeRef.current = null;
          forceHud(n => n + 1);
        }, 1500);
      }
    };

    const getPlayerHeight = () => {
      if (gameDataRef.current.id === 'mario') {
        return marioPowerRef.current === 'small' ? 32 : 64;
      }
      return gameDataRef.current.player.h;
    };

    const getPlayerWidth = () => {
      return gameDataRef.current.player.w;
    };

    const triggerBlockBump = (col: number, row: number, type: 'item' | 'destructible' | 'bounce', info: any) => {
      const bkey = `${col},${row}`;
      const originalTile = engineRef.current.map[row]?.[col] ?? 0;
      if (type === 'item') {
        usedBlocksRef.current.add(bkey);
        engineRef.current.map[row][col] = 0; // 一時的に空気化
        
        const usedId = Number(Object.keys(gameDataRef.current.tiles).find(k => gameDataRef.current.tiles[Number(k)]?.special === 'used')) || 14;
        // アイテム入りハテナ: special='itemPowerup' のタイルなら常にパワーアップ。
        // タイルセットに itemPowerup が無い旧データは従来の col%4 ヒューリスティックを維持。
        const hasPowerupTile = Object.values(gameDataRef.current.tiles).some(t => t?.special === 'itemPowerup');
        const isPowerupBlock = info?.special === 'itemPowerup' ||
          (!hasPowerupTile && (col % 4 === 0) && gameData.id === 'mario');

        if (isPowerupBlock) {
          const isSmall = marioPowerRef.current === 'small';
          const itemId = isSmall ? 'superMushroom' : 'fireFlower';
          const emoji = isSmall ? '🍄' : '🌸';
          
          const itemDef: ObjectDef = {
            id: Math.random().toString(),
            kind: 'npc',
            emoji,
            col,
            row: row - 1,
            w: TILE_SIZE,
            h: TILE_SIZE,
            objType: 'item',
            itemId,
            behavior: 'still',
            speed: 0,
            hazard: false,
            hp: 1,
            bullet: 'none',
            bulletSpeed: 0,
            bulletColor: '#fff',
            fireRate: 0,
            message: ''
          };
          
          const newEnt: Entity = {
            def: itemDef,
            x: col * TILE_SIZE,
            y: row * TILE_SIZE, // 最初はブロックの中に隠れている状態
            homeX: col * TILE_SIZE,
            homeY: (row - 1) * TILE_SIZE,
            hp: 1,
            timer: 0,
            vx: 0,
            vy: 0,
            talked: false,
            spawnGrace: 32
          };
          
          engineRef.current.entities.push(newEnt);
          
          blockAnimsRef.current.push({
            col, row,
            type: 'bump',
            timer: 0,
            maxTimer: 10,
            originalTile,
            info,
            oy: 0,
            targetTileId: usedId,
            spawnCoin: false
          });
          playSfx(sfxRef.current.shot); // アイテム出現効果音
        } else {
          coinsRef.current += 1; scoreRef.current += 100; forceHud(n => n + 1);
          blockAnimsRef.current.push({
            col, row,
            type: 'bump',
            timer: 0,
            maxTimer: 10,
            originalTile,
            info,
            oy: 0,
            targetTileId: usedId,
            spawnCoin: true
          });
          playSfx(sfxRef.current.jump);
        }
      }
      else if (type === 'destructible') {
        engineRef.current.map[row][col] = 0; // マップから消去
        if (marioPowerRef.current === 'small') {
          // チビマリオは壊せず、跳ねるだけ
          blockAnimsRef.current.push({
            col, row,
            type: 'bump',
            timer: 0,
            maxTimer: 10,
            originalTile,
            info,
            oy: 0,
            targetTileId: originalTile
          });
          playSfx(sfxRef.current.jump);
        } else {
          // デカマリオは破壊
          const px = col * TILE_SIZE + 8;
          const py = row * TILE_SIZE + 8;
          const particles = [
            { x: px - 4, y: py - 4, vx: -2, vy: -5 },
            { x: px + 4, y: py - 4, vx: 2, vy: -5 },
            { x: px - 4, y: py + 4, vx: -1.5, vy: -3 },
            { x: px + 4, y: py + 4, vx: 1.5, vy: -3 }
          ];
          blockAnimsRef.current.push({
            col, row,
            type: 'break',
            timer: 0,
            maxTimer: 30,
            originalTile,
            info,
            oy: 0,
            particles
          });
          scoreRef.current += 50; forceHud(n => n + 1);
          playSfx(sfxRef.current.damage);
        }
      }
      else if (type === 'bounce') {
        engineRef.current.map[row][col] = 0;
        blockAnimsRef.current.push({
          col, row,
          type: 'bump',
          timer: 0,
          maxTimer: 10,
          originalTile,
          info,
          oy: 0,
          targetTileId: originalTile
        });
      }
    };

    const loop = () => {
      updateWorldBounds();
      const eng = engineRef.current;
      const p = eng.player;
      const pData = gameData.player;
      const keys = eng.keys;
      const t = touchRef.current;

      const isLeft = keys.has('ArrowLeft') || keys.has('a') || keys.has('A') || t.left;
      const isRight = keys.has('ArrowRight') || keys.has('d') || keys.has('D') || t.right;
      const isUp = keys.has('ArrowUp') || keys.has('w') || keys.has('W') || t.up;
      const isDown = keys.has('ArrowDown') || keys.has('s') || keys.has('S') || t.down;
      const isAction = keys.has('z') || keys.has('Z') || keys.has('Enter') || keys.has(' ') || t.action || (gameData.engine === 'action' && isUp);

      let dead = false;
      if (invulnRef.current > 0) invulnRef.current--;
      if (starTimerRef.current > 0) starTimerRef.current--;
      if (bombInvulnRef.current > 0) bombInvulnRef.current--;
      if (bombCooldownRef.current > 0) bombCooldownRef.current--;

      // マリオ巨大化変身タイマー
      if (marioTransformingRef.current > 0) {
        marioTransformingRef.current--;
        p.vx = 0; p.vy = 0;
      }

      // マリオ土管アニメーション更新
      if (isPlaying && marioPipeRef.current) {
        const pipe = marioPipeRef.current;
        pipe.progress++;
        const t = pipe.progress / pipe.maxProgress;
        p.x = pipe.x;
        p.y = pipe.startY + (pipe.targetY - pipe.startY) * t;
        p.vx = 0; p.vy = 0;

        if (pipe.progress >= pipe.maxProgress) {
          if (pipe.phase === 'entering') {
            sceneFadeRef.current = {
              phase: 'out',
              frame: 0,
              totalFrames: 16,
              nextSceneId: pipe.warpSceneId!,
              entryX: pipe.entryX!,
              entryY: pipe.entryY!
            };
          }
          marioPipeRef.current = null;
        }
      }

      // マリオゴールポール滑り降りアニメーション更新
      if (isPlaying && marioGoalRef.current) {
        const goal = marioGoalRef.current;
        p.vx = 0; p.vy = 0;
        
        if (goal.phase === 'slide') {
          p.x = goal.x;
          p.y += 2.0; // スライド降下
          
          // ポールの下端（通常は地面の数マス上、Y衝突チェックで足元が接地したら歩行開始にする）
          const ph = getPlayerHeight();
          const pw = getPlayerWidth();
          let hitGround = false;
          for (let dx = 2; dx <= pw - 2; dx += 8) {
            const tBottom = getTile(p.x + dx, p.y + ph + 2); // 2px 下をチェック
            if (tBottom && !tBottom.info.passable) hitGround = true;
          }
          if (hitGround || p.y >= worldH - ph - TILE_SIZE) {
            goal.phase = 'walk';
            goal.progress = 0;
          }
        } else if (goal.phase === 'walk') {
          // 右側（お城の方向）へ自動歩行
          p.vx = 2.0;
          p.x += p.vx;
          goal.progress++;
          if (goal.progress >= 90) {
            goal.phase = 'done';
            marioGoalRef.current = null;
            win();
          }
        }
      }

      // ── ブロックアニメーションの更新 ──
      blockAnimsRef.current = blockAnimsRef.current.filter(anim => {
        anim.timer++;
        if (anim.type === 'bump') {
          const t = anim.timer / anim.maxTimer;
          anim.oy = -Math.sin(t * Math.PI) * 8;
          if (anim.timer >= anim.maxTimer) {
            if (engineRef.current.map[anim.row] && anim.targetTileId !== undefined) {
              engineRef.current.map[anim.row][anim.col] = anim.targetTileId;
            }
            return false;
          }
        } else if (anim.type === 'break') {
          if (anim.particles) {
            anim.particles.forEach(pt => {
              pt.x += pt.vx;
              pt.y += pt.vy;
              pt.vy += 0.3;
            });
          }
          if (anim.timer >= anim.maxTimer) {
            return false;
          }
        }
        return true;
      });

      // ── 新規粒子の物理更新 ──
      particlesRef.current = particlesRef.current.filter(pt => {
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.life--;

        if (pt.type === 'coin') {
          pt.vy += 0.4; // Gravity
          const col = Math.floor(pt.x / TILE_SIZE);
          const row = Math.floor(pt.y / TILE_SIZE);
          if (col >= 0 && col < worldCols && row >= 0 && row < worldRows) {
            const tileId = engineRef.current.map[row]?.[col] ?? 0;
            const tileInfo = gameData.tiles[tileId];
            if (tileInfo && !tileInfo.passable && tileInfo.special !== 'oneway') {
              pt.y = row * TILE_SIZE - pt.size;
              pt.vy = -Math.abs(pt.vy) * 0.6;
              pt.vx *= 0.8;
              pt.bounceCount = (pt.bounceCount ?? 0) + 1;
            }
          }
          const ph = getPlayerHeight();
          const pw = getPlayerWidth();
          if (isPlaying && !roundOverRef.current && !isPlayerDeadRef.current) {
            const dx = pt.x - (p.x + pw / 2);
            const dy = pt.y - (p.y + ph / 2);
            const dist = Math.hypot(dx, dy);
            if (dist < 20) {
              coinsRef.current++;
              forceHud(n => n + 1);
              playSfx(sfxRef.current.jump);
              return false;
            }
          }
        } else {
          pt.vx *= 0.95;
          pt.vy *= 0.95;
        }
        return pt.life > 0;
      });

      // ── player movement (both modes, paused during battle) ──
      // ミス/ゲームオーバー/クリア演出中、または残機制の死亡→復帰待ち中は操作を受け付けない
      // シーン遷移中は入力を凍結（スライド遷移もフェード遷移も）
      // 土管アニメーション中、変身中、ゴール演出中も操作を凍結
      const frozen = isPlaying && (roundOverRef.current || isPlayerDeadRef.current || !!sceneFadeRef.current || !!sceneTransRef.current || marioTransformingRef.current > 0 || !!marioPipeRef.current || !!marioGoalRef.current || bagOpenRef.current || !!gameMsgRef.current || !!activeDialogueRef.current || !!eventChoiceRef.current || !!shopModalRef.current);
      
      // 起動直後／リスタート時の埋まり防止イジェクト処理（2マスキャラ等の開始時埋まりバグ対策）
      if (justStartedRef.current && isPlaying && !frozen) {
        justStartedRef.current = false;
        let safety = 0;
        const ph = getPlayerHeight();
        const pw = getPlayerWidth();
        while (safety < 128) {
          let overlapping = false;
          for (let dy = 2; dy <= ph; dy += 8) {
            const yOffset = Math.min(dy, ph - 2);
            const t1 = getTile(p.x + 2, p.y + yOffset);
            const t2 = getTile(p.x + pw - 2, p.y + yOffset);
            if ((t1 && !t1.info.passable) || (t2 && !t2.info.passable)) {
              overlapping = true;
              break;
            }
          }
          if (!overlapping) {
            // 接地判定ライン（最下部）の重なりもチェック
            const t3 = getTile(p.x + 2, p.y + ph);
            const t4 = getTile(p.x + pw - 2, p.y + ph);
            if ((t3 && !t3.info.passable) || (t4 && !t4.info.passable)) {
              overlapping = true;
            }
          }
          if (!overlapping) break;
          p.y -= 1;
          safety++;
        }
      }

      if (!battleRef.current.active) {
        if (!isPlaying) {
          p.vx = 0; p.vy = 0; p.isGrounded = false;
          const es = pData.speed * editSpeedMult;
          if (isLeft) p.x -= es; if (isRight) p.x += es;
          if (isUp) p.y -= es; if (isDown) p.y += es;
          p.x = Math.max(0, Math.min(worldW - pData.w, p.x));
          p.y = Math.max(0, Math.min(worldH - pData.h, p.y));
        } else if (frozen) {
          p.vx = 0; p.vy = 0; p.isGrounded = false;
        } else if (gameData.engine === 'action') {
          // ── Auto-Sprint & Dash Speed ──
          const isDash = keys.has('Shift') || keys.has('c') || keys.has('C');
          let sprintActive = false;
          if (isDash && (isLeft || isRight)) {
            runDurationRef.current++;
            if (runDurationRef.current > 60) {
              sprintActive = true;
            }
          } else {
            runDurationRef.current = 0;
          }

          const accel = sprintActive ? 2.2 : (isDash ? 1.6 : 1.0);
          const maxSpeed = sprintActive ? 11.0 : (isDash ? 9.0 : 5.5);

          if (isLeft) p.vx = Math.max(-maxSpeed, p.vx - accel);
          if (isRight) p.vx = Math.min(maxSpeed, p.vx + accel);
          p.vx *= gameData.friction;

          // はしご：プレイヤー中心がはしごタイルにいるとき重力キャンセル＆上下移動
          const onLadder = isAction && (() => {
            const pcxL = p.x + pData.w / 2, pcyL = p.y + pData.h / 2;
            return getTile(pcxL, pcyL)?.info?.special === 'ladder';
          })();
          if (onLadder) {
            p.vy = 0;
            if (isUp) p.y -= pData.speed;
            if (isDown) p.y += pData.speed;
          }

          // ── Coyote Time ──
          if (p.isGrounded) {
            coyoteFramesRef.current = 6; // ~100ms grace
            isJumpingRef.current = false;
            isWallSlidingRef.current = false;
            wallSlideDirRef.current = 0;
          } else {
            coyoteFramesRef.current = Math.max(0, coyoteFramesRef.current - 1);
          }

          // ── Variable Jump Gravity ──
          if (!onLadder) {
            let gravityMult = 1.0;
            if (isJumpingRef.current && p.vy < 0) {
              if (isAction) {
                gravityMult = 0.5; // JUMP_GRAVITY
              }
              if (Math.abs(p.vy) < 2.0) {
                gravityMult = 0.3; // APEX_GRAVITY
              }
            }
            p.vy += gameData.gravity * gravityMult;
            if (p.vy > ACTION_MAX_FALL) p.vy = ACTION_MAX_FALL;
          }

          // ── Jump Action & Coyote Jump ──
          const canCoyoteJump = coyoteFramesRef.current > 0 && !isJumpingRef.current;
          if (isAction && !prevActionRef.current && (p.isGrounded || canCoyoteJump)) {
            const jumpPowerBoost = sprintActive ? 1.2 : (isDash ? 1.1 : 1.0);
            p.vy = gameData.player.jumpPower * jumpPowerBoost;
            p.isGrounded = false;
            isJumpingRef.current = true;
            coyoteFramesRef.current = 0;

            // Visual stretch
            scaleXRef.current = 0.8;
            scaleYRef.current = 1.2;

            playSfx(sfxRef.current.jump);
          }

          // ── Wall Jump ──
          if (isAction && !prevActionRef.current && (isWallSlidingRef.current || wallSlideDirRef.current !== 0)) {
            const wd = wallSlideDirRef.current;
            p.vx = -wd * 6.5;
            p.vy = gameData.player.jumpPower * 0.9;
            isJumpingRef.current = true;
            isWallSlidingRef.current = false;
            wallSlideDirRef.current = 0;
            coyoteFramesRef.current = 0;

            // Visual stretch
            scaleXRef.current = 0.8;
            scaleYRef.current = 1.2;

            playSfx(sfxRef.current.jump);
          }

          // ── 武器切り替え ──
          const isNextWeapon = keys.has('e') || keys.has('E');
          const isPrevWeapon = keys.has('q') || keys.has('Q');
          if (isNextWeapon && !prevNextWeaponRef.current) {
            if (actionWeaponsRef.current.length > 1)
              actionWeaponIdxRef.current = (actionWeaponIdxRef.current + 1) % actionWeaponsRef.current.length;
          }
          void isPrevWeapon;
          prevNextWeaponRef.current = isNextWeapon;

          // ── Horizontal movement and Wall Slide detection ──
          p.x += p.vx;
          const ph = getPlayerHeight();
          const pw = getPlayerWidth();
          const xHits: any[] = [];
          for (let dy = 2; dy <= ph - 2; dy += 8) {
            const yOffset = Math.min(dy, ph - 2);
            const tLeft = getTile(p.x + 2, p.y + yOffset);
            const tRight = getTile(p.x + pw - 2, p.y + yOffset);
            // Ignore one-way platforms during horizontal checks
            if (tLeft && !tLeft.info.passable && tLeft.info.special !== 'oneway') xHits.push(tLeft);
            if (tRight && !tRight.info.passable && tRight.info.special !== 'oneway') xHits.push(tRight);
          }
          const tLeftBottom = getTile(p.x + 2, p.y + ph - 2);
          const tRightBottom = getTile(p.x + pw - 2, p.y + ph - 2);
          if (tLeftBottom && !tLeftBottom.info.passable && tLeftBottom.info.special !== 'oneway') xHits.push(tLeftBottom);
          if (tRightBottom && !tRightBottom.info.passable && tRightBottom.info.special !== 'oneway') xHits.push(tRightBottom);

          let wallDir = 0;
          const tile = xHits[0];
          if (tile) { 
            if (p.x + pw / 2 < tile.rect.x + TILE_SIZE / 2) {
              wallDir = 1; // Wall is to the right
              if (p.vx > 0) p.x = tile.rect.x - pw; 
            } else {
              wallDir = -1; // Wall is to the left
              if (p.vx < 0) p.x = tile.rect.x + TILE_SIZE; 
            }
            p.vx = 0; 
          }

          // Wall Slide trigger
          if (wallDir !== 0 && !p.isGrounded && p.vy > 0) {
            if ((wallDir === 1 && isRight) || (wallDir === -1 && isLeft)) {
              isWallSlidingRef.current = true;
              wallSlideDirRef.current = wallDir;
              p.vy = Math.min(p.vy, 2.5); // Wall slide speed limit
            }
          } else {
            isWallSlidingRef.current = false;
            wallSlideDirRef.current = 0;
          }

          // ── Vertical Movement & Collisions ──
          p.y += p.vy; p.isGrounded = false;
          const yHits: { tile: any; dir: 'up' | 'down' }[] = [];
          for (let dx = 2; dx <= pw - 2; dx += 8) {
            const tBottom = getTile(p.x + dx, p.y + ph);
            if (tBottom) {
              if (tBottom.info.special === 'oneway') {
                if (p.vy >= 0 && (p.y + ph - p.vy <= tBottom.rect.y + 4)) {
                  yHits.push({ tile: tBottom, dir: 'down' });
                }
              } else if (!tBottom.info.passable) {
                yHits.push({ tile: tBottom, dir: 'down' });
              }
            }
            const tTop = getTile(p.x + dx, p.y + 2);
            if (tTop && !tTop.info.passable && tTop.info.special !== 'oneway') yHits.push({ tile: tTop, dir: 'up' });
          }
          const tBottomRight = getTile(p.x + pw - 2, p.y + ph);
          if (tBottomRight) {
            if (tBottomRight.info.special === 'oneway') {
              if (p.vy >= 0 && (p.y + ph - p.vy <= tBottomRight.rect.y + 4)) {
                yHits.push({ tile: tBottomRight, dir: 'down' });
              }
            } else if (!tBottomRight.info.passable) {
              yHits.push({ tile: tBottomRight, dir: 'down' });
            }
          }
          const tTopRight = getTile(p.x + pw - 2, p.y + 2);
          if (tTopRight && !tTopRight.info.passable && tTopRight.info.special !== 'oneway') yHits.push({ tile: tTopRight, dir: 'up' });

          const yHit = yHits[0];
          if (yHit) {
            const tile2 = yHit.tile;
            if (yHit.dir === 'down' || p.vy > 0) { 
              p.y = tile2.rect.y - ph; 
              p.isGrounded = true; 
            }
            else if (yHit.dir === 'up' || p.vy < 0) {
              p.y = tile2.rect.y + TILE_SIZE;
              // 下から叩く：ハテナ→コイン排出（使用済みに変化）、壊せるブロック→破壊
              const bcol = Math.round(tile2.rect.x / TILE_SIZE), brow = Math.round(tile2.rect.y / TILE_SIZE);
              const bsp = tile2.info?.special, bkey = `${bcol},${brow}`;
              if ((bsp === 'item' || bsp === 'itemPowerup') && !usedBlocksRef.current.has(bkey)) {
                triggerBlockBump(bcol, brow, 'item', tile2.info);
              } else if (bsp === 'destructible') {
                triggerBlockBump(bcol, brow, 'destructible', tile2.info);
              } else if (bsp === 'bounce') {
                triggerBlockBump(bcol, brow, 'bounce', tile2.info);
                p.vy = gameData.player.jumpPower * 1.5; // Springboard bounce!
                p.isGrounded = false;

                // Visual stretch on bounce
                scaleXRef.current = 0.8;
                scaleYRef.current = 1.3;

                playSfx(sfxRef.current.jump);
              }
            }
            p.vy = 0;
          }

          // ── Moving Platforms carriage ──
          let stoodOnPlatform: Entity | null = null;
          for (const ent of eng.entities) {
            const ed = ent.def;
            if (ed.objType === 'platform' || ed.name?.toLowerCase().includes('platform')) {
              const ew = ed.w ?? TILE_SIZE;
              const playerBottom = p.y + ph;
              const platformTop = ent.y;
              const isAbove = playerBottom >= platformTop - 5 && playerBottom <= platformTop + 5;
              const overlapX = p.x + pw - 2 > ent.x && p.x + 2 < ent.x + ew;
              if (isAbove && overlapX && p.vy >= 0) {
                stoodOnPlatform = ent;
                break;
              }
            }
          }
          if (stoodOnPlatform) {
            p.y = stoodOnPlatform.y - ph;
            p.vy = 0;
            p.isGrounded = true;
            p.x += stoodOnPlatform.vx || 0;
            p.y += stoodOnPlatform.vy || 0;
          }

          // ── Smoke Particles Spawn & Scale Interpolation ──
          scaleXRef.current += (1.0 - scaleXRef.current) * 0.15;
          scaleYRef.current += (1.0 - scaleYRef.current) * 0.15;

          const frameCount = Math.floor(performance.now() / 16.67);
          if (p.isGrounded && !prevGroundedRef.current) {
            const landingSmokeCount = 6;
            for (let i = 0; i < landingSmokeCount; i++) {
              const angle = (i / (landingSmokeCount - 1)) * Math.PI;
              const speed = 1.0 + Math.random() * 1.5;
              particlesRef.current.push({
                x: p.x + pw / 2,
                y: p.y + ph - 2,
                vx: Math.cos(angle) * speed,
                vy: -Math.sin(angle) * speed * 0.4,
                life: 15,
                maxLife: 15,
                size: 3 + Math.random() * 3,
                color: '#eee',
                type: 'smoke'
              });
            }
            scaleXRef.current = 1.3;
            scaleYRef.current = 0.7;
          }
          prevGroundedRef.current = p.isGrounded;

          if (p.isGrounded && Math.abs(p.vx) > 2.0) {
            if (sprintActive && frameCount % 6 === 0) {
              particlesRef.current.push({
                x: p.x + pw / 2 - Math.sign(p.vx) * (pw / 2),
                y: p.y + ph - 2,
                vx: -Math.sign(p.vx) * (0.5 + Math.random() * 1.0),
                vy: -(0.2 + Math.random() * 0.5),
                life: 18,
                maxLife: 18,
                size: 4 + Math.random() * 4,
                color: '#eee',
                type: 'smoke'
              });
            } else if (isDash && frameCount % 12 === 0) {
              particlesRef.current.push({
                x: p.x + pw / 2 - Math.sign(p.vx) * (pw / 2),
                y: p.y + ph - 2,
                vx: -Math.sign(p.vx) * (0.3 + Math.random() * 0.7),
                vy: -(0.1 + Math.random() * 0.4),
                life: 12,
                maxLife: 12,
                size: 3 + Math.random() * 3,
                color: '#eee',
                type: 'smoke'
              });
            }
          }

          if (p.y > worldH && isPlaying && !debugInvincibleRef.current) { lose('ミス！'); dead = true; }
          // プレイヤー向き更新
          if (isLeft) actionDirRef.current = -1;
          else if (isRight) actionDirRef.current = 1;
          // 射撃（X キーまたはタッチ SHOT ボタン）
          if (actionShootCoolRef.current > 0) actionShootCoolRef.current--;
          const isShoot = keys.has('x') || keys.has('X') || touchRef.current.shoot;
          // マリオはファイア状態のときだけショット可（他プリセットは常時可）
          const canShoot = gameData.id !== 'mario' || marioPowerRef.current === 'fire';
          if (isPlaying && !dead && isShoot && canShoot && actionShootCoolRef.current <= 0) {
            const dir = actionDirRef.current;
            if (gameData.id === 'mario') {
              // ファイアマリオ：地面で跳ねるファイアボール
              eng.bullets.push({ x: dir > 0 ? p.x + pData.w : p.x - 10, y: p.y + pData.h / 2, w: 10, h: 10, vx: dir * 8, vy: 2, color: '#ff6a00', bounce: true });
              actionShootCoolRef.current = 16;
              playSfx(sfxRef.current.shot);
            } else {
            const currentWeapon = actionWeaponsRef.current[actionWeaponIdxRef.current];
            const energy = actionWeaponEnergyRef.current;
            // 'buster' はエネルギー無限の初期武器（ゲージを消費せず常に通常弾）
            if (currentWeapon && currentWeapon !== 'buster' && (energy[currentWeapon] ?? 0) > 0) {
              energy[currentWeapon] = Math.max(0, (energy[currentWeapon] ?? 0) - 1);
              if (currentWeapon === 'airShooter') {
                [-15, 0, 15].forEach(offset => {
                  eng.bullets.push({ x: dir > 0 ? p.x + pData.w : p.x - 8, y: p.y + pData.h / 2 - 3, w: 8, h: 6, vx: dir * 9, vy: Math.sin(offset * Math.PI / 180) * 3, color: '#88ffcc' } as typeof eng.bullets[0]);
                });
              } else if (currentWeapon === 'metalBlade') {
                for (let di = 0; di < 8; di++) {
                  const a = di * 45 * Math.PI / 180;
                  eng.bullets.push({ x: p.x + pData.w / 2 - 4, y: p.y + pData.h / 2 - 4, w: 8, h: 8, vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, color: '#aaaaaa' } as typeof eng.bullets[0]);
                }
              } else if (currentWeapon === 'crashBomb') {
                eng.bullets.push({ x: dir > 0 ? p.x + pData.w : p.x - 8, y: p.y + pData.h / 2 - 3, w: 8, h: 8, vx: dir * 5, vy: 0, color: '#ff6600' } as typeof eng.bullets[0]);
              } else {
                eng.bullets.push({ x: dir > 0 ? p.x + pData.w : p.x - 8, y: p.y + pData.h / 2 - 3, w: 8, h: 6, vx: dir * 10, vy: 0 });
              }
            } else {
              eng.bullets.push({ x: dir > 0 ? p.x + pData.w : p.x - 8, y: p.y + pData.h / 2 - 3, w: 8, h: 6, vx: dir * 10, vy: 0 });
            }
            actionShootCoolRef.current = 12;
            playSfx(sfxRef.current.shot);
            }
          }
          // プレイヤー弾移動・範囲外削除（bounce=ファイアボールは重力＋地面反射）
          for (let i = eng.bullets.length - 1; i >= 0; i--) {
            const b = eng.bullets[i];
            if (b.bounce) {
              b.vy = (b.vy ?? 0) + 0.8; if (b.vy > 10) b.vy = 10;
              b.x += b.vx ?? 0; b.y += b.vy;
              const fl = getTile(b.x + b.w / 2, b.y + b.h);
              if (fl && !fl.info.passable && b.vy > 0) { b.y = fl.rect.y - b.h; b.vy = -6; }  // 地面で跳ねる
              const wl = getTile((b.vx ?? 0) > 0 ? b.x + b.w : b.x, b.y + b.h / 2);
              if (wl && !wl.info.passable) { eng.bullets.splice(i, 1); continue; }             // 壁で消滅
            } else {
              b.x += b.vx ?? 0; b.y += b.vy ?? 0;
            }
            if (b.x < -16 || b.x > worldW + 16 || b.y < -16 || b.y > worldH + 16) eng.bullets.splice(i, 1);
          }
        } else if (gameData.engine === 'onjReze') {
          // onjReze: トップビュー 4/8方向移動 ＋ 剣（近接）＋ 剣ビーム（HP満タン時）
          p.vx = 0; p.vy = 0;
          const moveSpd = pData.speed;
          let nx = p.x, ny = p.y;
          if (isLeft) nx -= moveSpd; if (isRight) nx += moveSpd;
          if (isUp) ny -= moveSpd; if (isDown) ny += moveSpd;
          // 既にモブと重なっている場合はブロック判定を無視し、動けなくなる（すり抜けられない）事態を防ぐ
          const alreadyOverlapping = isBlockedByMob(p.x, p.y, pData.w, pData.h);
          let zt1 = getTile(nx, p.y), zt2 = getTile(nx + pData.w - 1, p.y + pData.h - 1);
          if (zt1?.info.passable && zt2?.info.passable && nx >= 0 && nx <= worldW - pData.w && (alreadyOverlapping || !isBlockedByMob(nx, p.y, pData.w, pData.h))) p.x = nx;
          zt1 = getTile(p.x, ny); zt2 = getTile(p.x + pData.w - 1, ny + pData.h - 1);
          if (zt1?.info.passable && zt2?.info.passable && ny >= 0 && ny <= worldH - pData.h && (alreadyOverlapping || !isBlockedByMob(p.x, ny, pData.w, pData.h))) p.y = ny;
          // 向き更新（最後に押した方向。左右優先、無ければ上下）
          if (isLeft) onjRezeDirRef.current = { x: -1, y: 0 };
          else if (isRight) onjRezeDirRef.current = { x: 1, y: 0 };
          else if (isUp) onjRezeDirRef.current = { x: 0, y: -1 };
          else if (isDown) onjRezeDirRef.current = { x: 0, y: 1 };
          // ── ⚔ 近接攻撃（Z / Space / Enter / ⚔ボタン）──
          const sw = swordRef.current;
          if (sw.cool > 0) sw.cool--;
          if (sw.active > 0) sw.active--;
          if (isPlaying && !dead && isAction && !prevActionRef.current && sw.cool <= 0) {
            sw.active = 12; sw.cool = 18; sw.dir = { ...onjRezeDirRef.current }; sw.hit.clear();
            playSfx(sfxRef.current.shot);
          }

          // ── 💣ボム挙動の再現（原作 onj-reze.html: placeBomb / throwBomb / headBomb）──
          // 定数（フレーム / px）。原作 fuse/radius はサーバー値のため挙動が同等になるよう設定。
          const B_FUSE = 96;        // 導火線（約1.6秒）
          const B_FLY = 24;         // 投げの飛行時間（約0.4秒）
          const B_BLAST = 36;       // 爆発エフェクト持続（約0.6秒）
          const B_R = TILE_SIZE * 1.6;   // 通常ボムの爆風半径
          const H_R = TILE_SIZE * 2.2;   // 💀首爆弾の爆風半径（大きめ）
          const B_DMG = 3, H_DMG = 5;    // 爆風ダメージ（スライム1/ゴースト2/ボス6 を基準）
          const THROW_DIST = TILE_SIZE * 3; // 投げ距離（原作 攻撃間合い 3マスに合わせる）
          const pcx0 = p.x + pData.w / 2, pcy0 = p.y + pData.h / 2;
          // 入力（長押しでクールダウン連射。原作 BOMB_INTERVAL 相当）
          const isBomb = keys.has('c') || keys.has('C') || t.bomb;       // 💣 足元に設置
          const isThrow = keys.has('x') || keys.has('X') || t.shoot;     // 🎯 向きへ投げる
          const isHead = keys.has('v') || keys.has('V') || t.slow;       // 💀 首爆弾（強）を投げる
          if (onjBombCoolRef.current > 0) onjBombCoolRef.current--;
          if (onjThrowCoolRef.current > 0) onjThrowCoolRef.current--;
          if (isPlaying && !dead) {
            if (isBomb && onjBombCoolRef.current <= 0) {
              onjBombsRef.current.push({ x: pcx0, y: pcy0, fuse: B_FUSE, maxFuse: B_FUSE, r: B_R, dmg: B_DMG, head: false });
              onjBombCoolRef.current = 24; playSfx(sfxRef.current.shot);
            }
            if ((isThrow || isHead) && onjThrowCoolRef.current <= 0) {
              const dr = onjRezeDirRef.current; const head = isHead && !isThrow;
              const tx = Math.max(8, Math.min(worldW - 8, pcx0 + dr.x * THROW_DIST));
              const ty = Math.max(8, Math.min(worldH - 8, pcy0 + dr.y * THROW_DIST));
              onjFliesRef.current.push({ fx: pcx0, fy: pcy0, tx, ty, t: 0, dur: B_FLY, fuse: B_FUSE, r: head ? H_R : B_R, dmg: head ? H_DMG : B_DMG, head });
              onjThrowCoolRef.current = 24; playSfx(sfxRef.current.shot);
            }
          }
          // 飛行 → 着地
          for (let i = onjFliesRef.current.length - 1; i >= 0; i--) {
            const fb = onjFliesRef.current[i]; fb.t++;
            if (fb.t >= fb.dur) {
              onjBombsRef.current.push({ x: fb.tx, y: fb.ty, fuse: fb.fuse, maxFuse: fb.fuse, r: fb.r, dmg: fb.dmg, head: fb.head, srcUrl: fb.srcUrl, owner: fb.owner });
              onjFliesRef.current.splice(i, 1);
            }
          }
          // 導火線 → 爆発（範囲内の敵に範囲ダメージ）
          for (let i = onjBombsRef.current.length - 1; i >= 0; i--) {
            const bm = onjBombsRef.current[i]; bm.fuse--;
            if (bm.fuse > 0) continue;
            onjBombsRef.current.splice(i, 1);
            if (bm.owner) {
              bm.owner.bombThrown = false;
              // 爆発後、次の行動パターン（'charge': ダッシュ接近, 'flank': 回避ステップ, 'normal': 通常追尾）を決定する
              bm.owner.rezeState = Math.random() < 0.4 ? 'charge' : (Math.random() < 0.8 ? 'flank' : 'normal');
              bm.owner.rezeStateTimer = 90; // 90フレーム（1.5秒）の間、この行動を取る
            }
            onjBlastsRef.current.push({ x: bm.x, y: bm.y, life: B_BLAST, maxLife: B_BLAST, r: bm.r });
            hitShake(); playSfx(sfxRef.current.damage);
            for (let k = eng.entities.length - 1; k >= 0; k--) {
              const ent = eng.entities[k];
              if (ent.def.objType === 'warp') continue; // 扉などのワープオブジェクトは攻撃で破壊されない
              const ex = ent.x + TILE_SIZE / 2, ey = ent.y + TILE_SIZE / 2;
              if (Math.hypot(ex - bm.x, ey - bm.y) <= bm.r) {
                if (bm.owner && bm.owner === ent) continue; // 自分が投げた爆弾の爆風ダメージは無効
                ent.hp -= bm.dmg;
                if (ent.hp <= 0) {
                  if (ent.scriptCtx) ent.scriptCtx.cancelled = true;
                  scoreRef.current += ent.def.isBoss ? 100 : 10;
                  eng.entities.splice(k, 1);
                }
              }
            }
            // 自爆風判定：プレイヤー自身も爆風範囲に入っていればダメージを受ける
            if (!debugInvincibleRef.current && !dead && invulnRef.current <= 0 &&
                Math.hypot(pcx0 - bm.x, pcy0 - bm.y) <= bm.r) {
              onjRezeHpRef.current.hp -= bm.dmg; invulnRef.current = 60;
              hitShake(); playSfx(sfxRef.current.damage); forceHud(n => n + 1);
              if (onjRezeHpRef.current.hp <= 0) { lose('やられた…'); dead = true; }
            }
          }
          // 爆発エフェクトの寿命
          for (let i = onjBlastsRef.current.length - 1; i >= 0; i--) {
            if (--onjBlastsRef.current[i].life <= 0) onjBlastsRef.current.splice(i, 1);
          }

        } else {
          // rpg / touhou: 8-dir free move
          p.vx = 0; p.vy = 0;
          const isSlow = gameData.engine === 'touhou' && (keys.has('Shift') || touchRef.current.slow);
          const moveSpd = isSlow ? pData.speed * 0.45 : pData.speed;
          const prevPx = p.x, prevPy = p.y;
          let nx = p.x, ny = p.y;
          if (isLeft) nx -= moveSpd; if (isRight) nx += moveSpd;
          if (isUp) ny -= moveSpd; if (isDown) ny += moveSpd;
          const mobBlockActive = gameData.engine === 'rpg';
          // 既にモブと重なっている場合はブロック判定を無視し、動けなくなる（すり抜けられない）事態を防ぐ
          const alreadyOverlapping = mobBlockActive && isBlockedByMob(p.x, p.y, pData.w, pData.h);
          let t1 = getTile(nx, p.y), t2 = getTile(nx + pData.w - 1, p.y + pData.h - 1);
          if (t1?.info.passable && t2?.info.passable && nx >= 0 && nx <= worldW - pData.w && (!mobBlockActive || alreadyOverlapping || !isBlockedByMob(nx, p.y, pData.w, pData.h))) p.x = nx;
          t1 = getTile(p.x, ny); t2 = getTile(p.x + pData.w - 1, ny + pData.h - 1);
          if (t1?.info.passable && t2?.info.passable && ny >= 0 && ny <= worldH - pData.h && (!mobBlockActive || alreadyOverlapping || !isBlockedByMob(p.x, ny, pData.w, pData.h))) p.y = ny;
          // ── ランダムエンカウント（rpg・シーンに randomEncounters があるとき）──
          // 歩いた距離をゲージに貯め、しきい値（encounterRate 歩 ±40%）を超えたら抽選開始。
          if (isPlaying && gameData.engine === 'rpg' && gameData.battle && !dead &&
              !eventRunningRef.current && !sceneFadeRef.current && invulnRef.current <= 0) {
            const scene = scenesRef.current[activeSceneIdxRef.current];
            const table = scene?.randomEncounters;
            if (table?.length) {
              const moved = Math.abs(p.x - prevPx) + Math.abs(p.y - prevPy);
              if (moved > 0) {
                if (encounterNextRef.current <= 0) {
                  const rate = scene.encounterRate ?? 16;
                  encounterNextRef.current = rate * TILE_SIZE * (0.6 + Math.random() * 0.8);
                }
                encounterGaugeRef.current += moved;
                if (encounterGaugeRef.current >= encounterNextRef.current) {
                  encounterGaugeRef.current = 0; encounterNextRef.current = 0;
                  const enemy = table[Math.floor(Math.random() * table.length)];
                  beginBattle({ ...enemy, entity: null });
                  dead = true;
                }
              }
            }
          }
          // touhou: 画面外に出ないようクランプ（タイルチェックを抜けた場合の保険）
          if (gameData.engine === 'touhou') {
            p.x = Math.max(0, Math.min(VIEW_W - pData.w, p.x));
            p.y = Math.max(0, Math.min(VIEW_H - pData.h, p.y));
          }

          // touhou shooting + bomb: play mode only（死亡中は撃たない）
          if (!dead && !isPlayerDeadRef.current && gameData.engine === 'touhou') {
            eng.shotTimer++;
            if (eng.shotTimer > 6) {
              eng.bullets.push({ x: p.x + pData.w / 2 - 4, y: p.y, w: 8, h: 16, vy: -12, vx: 0 });
              eng.shotTimer = 0; playSfx(sfxRef.current.shot);
            }
            // ── ボム入力（X キーまたはタッチ BOMB ボタン）──
            const isBombKey = keys.has('x') || keys.has('X') || touchRef.current.bomb;
            if (isPlaying && isBombKey && !prevBombRef.current && bombCountRef.current > 0 && bombCooldownRef.current <= 0) {
              bombCountRef.current--;
              bombInvulnRef.current = 240;
              bombCooldownRef.current = 180;
              shakeRef.current = 14; // 爆弾爆発シェイク
              eng.enemyBullets = [];
              const pcxB = p.x + pData.w / 2, pcyB = p.y + pData.h / 2;
              for (let a = 0; a < 24; a++) {
                const ang = (a / 24) * Math.PI * 2;
                eng.bullets.push({ x: pcxB, y: pcyB, w: 6, h: 6, vy: Math.sin(ang) * 9, vx: Math.cos(ang) * 9 });
              }
              const k = ++spellCutinKeyCountRef.current;
              setSpellCutin({ key: k, mode: 'player',
                charName: pData.bombCutinCharName ?? '魔理沙',
                spellName: pData.bombSpellName ?? '恋符「マスタースパーク」',
                imageUrl: pData.bombCutinImageUrl ?? 'https://i.imgur.com/4M92pLV.png',
                imageX: pData.bombCutinImageX ?? 0, imageY: pData.bombCutinImageY ?? -50, imageScale: pData.bombCutinScale ?? 1,
              });
            }
            prevBombRef.current = isBombKey;
            // 弾移動・範囲外削除
            for (let i = eng.bullets.length - 1; i >= 0; i--) {
              eng.bullets[i].x += eng.bullets[i].vx ?? 0;
              eng.bullets[i].y += eng.bullets[i].vy;
              if (eng.bullets[i].y < -16 || eng.bullets[i].y > VIEW_H + 16 ||
                  eng.bullets[i].x < -16 || eng.bullets[i].x > VIEW_W + 16) {
                eng.bullets.splice(i, 1);
              }
            }
          }
        }
      }

      // 位置変化を通知（play only）
      if (isPlaying && onPositionChangeRef.current) onPositionChangeRef.current(p.x, p.y, pData.emoji);

      // ── オンラインテストモード：疑似プレイヤー更新 ──
      if (isPlaying && onlineTestModeRef.current) {
        const fps = fakePlayersRef.current;
        const gw = worldCols; const gh = worldRows;
        for (const fp of fps) {
          // 移動方向切り替え（クールダウンが切れたらランダム）
          if (fp.moveCool <= 0) {
            const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
            const d = dirs[Math.floor(Math.random() * dirs.length)];
            fp.dirX = d[0]; fp.dirY = d[1];
            fp.moveCool = 30 + Math.floor(Math.random() * 60);
          }
          fp.moveCool--;
          // 移動（pData.speed を流用）
          const spd = pData.speed;
          const nx = fp.x + fp.dirX * spd, ny = fp.y + fp.dirY * spd;
          const ncol = Math.floor((nx + pData.w / 2) / TILE_SIZE);
          const nrow = Math.floor((ny + pData.h / 2) / TILE_SIZE);
          if (ncol >= 0 && ncol < gw && nrow >= 0 && nrow < gh && gameData.tiles[gameData.map[nrow]?.[ncol] ?? 0]?.passable) {
            fp.x = nx; fp.y = ny;
          } else {
            fp.moveCool = 0; // 壁にぶつかったらすぐ方向転換
          }

        }
      }

      // ── シーン遷移チェック（action/rpg エンジン対象、プレイ中のみ）──
      if (isPlaying && !roundOverRef.current && (gameData.engine === 'action' || gameData.engine === 'rpg')) {
        trySceneTrans();
      }

      // ── play mode: entities / combat / win ──
      // ラウンド終了演出中（roundOver）は敵・弾・当たり判定も止める（残機の死亡中は継続）
      if (isPlaying && !roundOverRef.current && !battleRef.current.active) {
        const pcx = p.x + pData.w / 2, pcy = p.y + pData.h / 2;
        // ワープ直後の再発動抑制：入場座標から十分離れたら解除（overlap判定の半径 TILE_SIZE*1.1 より広めに取る）
        if (warpCooldownRef.current) {
          const wc = warpCooldownRef.current;
          if (Math.hypot(pcx - wc.x, pcy - wc.y) > TILE_SIZE * 1.5) warpCooldownRef.current = null;
        }
        const marioInvincible = gameData.id === 'mario' && starTimerRef.current > 0; // スター無敵
        for (let ei = eng.entities.length - 1; ei >= 0; ei--) {
          const e = eng.entities[ei]; const d = e.def; e.timer++;
          if (e.spawnGrace && e.spawnGrace > 0) {
            continue;
          }
          const ecx = e.x + TILE_SIZE / 2, ecy = e.y + TILE_SIZE / 2;

          const sp = (gameData.engine === 'onjReze' && d.name === 'レゼ' && Math.hypot(pcx - ecx, pcy - ecy) < TILE_SIZE * 4) ? 2.2 : d.speed;
          if (gameData.engine === 'touhou') {
            if (d.miniScript) {
              // MiniScript 制御：moveTarget (lerp) または vx/vy で移動
              if (e.moveTarget) {
                const mt = e.moveTarget;
                mt.elapsed++;
                const t = Math.min(1, mt.elapsed / mt.frames);
                const ease = t * (2 - t); // easeOutQuad
                e.x = mt.sx + (mt.tx - mt.sx) * ease;
                e.y = mt.sy + (mt.ty - mt.sy) * ease;
                if (mt.elapsed >= mt.frames) e.moveTarget = undefined;
              } else {
                e.x += e.vx; e.y += e.vy;
              }
              if (!d.isBoss) {
                if (e.y > VIEW_H + 64) {
                  if (e.scriptCtx) e.scriptCtx.cancelled = true;
                  eng.entities.splice(ei, 1); continue;
                }
              } else {
                e.x = Math.max(TILE_SIZE, Math.min(VIEW_W - TILE_SIZE * 2, e.x));
                e.y = Math.max(TILE_SIZE, Math.min(VIEW_H * 0.55, e.y));
              }
            } else if (!d.isBoss) {
              // Xevious フォールバック（miniScript なし wave 敵）
              e.y += sp;
              e.x = e.homeX + Math.sin(e.timer * 0.045) * 45;
              e.x = Math.max(TILE_SIZE, Math.min(VIEW_W - TILE_SIZE * 2, e.x));
              if (e.y > VIEW_H + 64) { eng.entities.splice(ei, 1); continue; }
            } else {
              // ボス（miniScript なし）: patrolH
              if (d.behavior === 'patrolH') {
                if (e.vx === 0) e.vx = sp; e.x += e.vx;
                if (e.x < TILE_SIZE * 2 || e.x > VIEW_W - TILE_SIZE * 3) e.vx *= -1;
              } else if (d.behavior === 'patrolV') {
                if (e.vy === 0) e.vy = sp; e.y += e.vy;
              }
              e.x = Math.max(TILE_SIZE, Math.min(VIEW_W - TILE_SIZE * 2, e.x));
              e.y = Math.max(TILE_SIZE, Math.min(VIEW_H * 0.4, e.y));
            }
          } else if (gameData.engine === 'action') {
            // ── パワーアップ出現アニメーション中 (spawnGrace) ──
            if (e.spawnGrace && e.spawnGrace > 0) {
              e.spawnGrace--;
              e.y -= 0.5; // 32フレームで 16px 上に這い出る
              if (e.spawnGrace === 0) {
                if (e.def.itemId === 'superMushroom') {
                  e.def.behavior = 'walker';
                  e.vx = 1.0;
                } else if (e.def.itemId === 'fireFlower') {
                  e.def.behavior = 'still';
                  e.vx = 0; e.vy = 0;
                }
              }
              continue;
            }
            // ── 横スク（マリオ/ロックマン）：重力・地面/壁判定つき敵AI ──
            // 地面に接していなければ自由落下。walker は崖の手前で反転（赤ノコノコ型）、
            // patrolH/緑ノコノコ型は崖からそのまま落ちる。
            const ew = d.w ?? TILE_SIZE; // 敵の当たり判定幅
            const eh = d.h ?? TILE_SIZE; // 敵の当たり判定高さ
            if (e.shellGrace && e.shellGrace > 0) e.shellGrace--;
            if (e.shellState) {
              // ── 甲羅（ノコノコ）：静止 or 滑走。SMC physics_process_shell 準拠 ──
              // 滑走中は壁で反射し、崖はそのまま落下。静止中は重力のみ受けて止まる。
              if (e.shellState === 'slide' && e.vx !== 0) {
                const nx = e.x + e.vx;
                const leadX = e.vx > 0 ? nx + ew - 1 : nx;
                const wt = getTile(leadX, e.y + 2), wb = getTile(leadX, e.y + eh - 2);
                const wall = (wt && !wt.info.passable) || (wb && !wb.info.passable);
                if (wall || nx < 0 || nx > worldW - ew) e.vx = -e.vx; // 壁・画面端で跳ね返る
                else e.x = nx;
              } else {
                e.vx = 0; // 静止甲羅
              }
              e.vy += gameData.gravity; if (e.vy > ACTION_MAX_FALL) e.vy = ACTION_MAX_FALL;
              e.y += e.vy; e.isGrounded = false;
              if (e.vy > 0) {
                const fl = getTile(e.x + 2, e.y + eh), fr = getTile(e.x + ew - 2, e.y + eh);
                const g = (fl && !fl.info.passable) ? fl : (fr && !fr.info.passable) ? fr : null;
                if (g) { e.y = g.rect.y - eh; e.vy = 0; e.isGrounded = true; }
              }
              e.x = Math.max(0, Math.min(worldW - ew, e.x));
              if (e.y > worldH + TILE_SIZE) { eng.entities.splice(ei, 1); continue; }
            } else if (d.behavior === 'still') {
              // 静止：配置位置に固定（壁付き砲台など）。移動・重力なし。
              e.vx = 0; e.vy = 0;
            } else {
              // 水平方向の意思決定
              if (d.behavior === 'random') {
                if (e.timer % 50 === 0) e.vx = (Math.random() < 0.5 ? -1 : 1) * sp;
                else if (e.vx === 0) e.vx = sp;
              } else if (d.behavior === 'chase' || d.behavior === 'flee') {
                const dir = Math.sign(pcx - ecx) || 1;
                e.vx = (d.behavior === 'chase' ? dir : -dir) * sp;
              } else if (e.vx === 0) {
                // patrolH / patrolV / walker → 左右に歩く
                e.vx = sp;
              }
              // 水平移動（壁・画面端で反転。walker は接地中、進行方向の足元が無ければ反転）
              if (e.vx !== 0) {
                const nx = e.x + e.vx;
                const leadX = e.vx > 0 ? nx + ew - 1 : nx;
                const wt = getTile(leadX, e.y + 2), wb = getTile(leadX, e.y + eh - 2);
                const wall = (wt && !wt.info.passable) || (wb && !wb.info.passable);
                let edge = false;
                if (d.behavior === 'walker' && e.isGrounded) {
                  const f = getTile(leadX, e.y + eh + 2);
                  edge = !f || f.info.passable;
                }
                if (wall || edge || nx < 0 || nx > worldW - ew) e.vx = -e.vx;
                else e.x = nx;
              }
              // 重力 → 垂直移動 → 地面/天井判定（接地していなければ自由落下）
              e.vy += gameData.gravity; if (e.vy > ACTION_MAX_FALL) e.vy = ACTION_MAX_FALL;
              e.y += e.vy;
              e.isGrounded = false;
              if (e.vy > 0) {
                const fl = getTile(e.x + 2, e.y + eh), fr = getTile(e.x + ew - 2, e.y + eh);
                const g = (fl && !fl.info.passable) ? fl : (fr && !fr.info.passable) ? fr : null;
                if (g) { e.y = g.rect.y - eh; e.vy = 0; e.isGrounded = true; }
              } else if (e.vy < 0) {
                const hl = getTile(e.x + 2, e.y), hr = getTile(e.x + ew - 2, e.y);
                const c = (hl && !hl.info.passable) ? hl : (hr && !hr.info.passable) ? hr : null;
                if (c) { e.y = c.rect.y + TILE_SIZE; e.vy = 0; }
              }
              e.x = Math.max(0, Math.min(worldW - ew, e.x));
              // 穴に落ちたら除去
              if (e.y > worldH + TILE_SIZE) { eng.entities.splice(ei, 1); continue; }
            }
          } else if (e.bombThrown) {
            // レゼ：上半身を投げてから爆発するまでは立ち止まる（原作再現のため棒立ち）
            e.vx = 0; e.vy = 0;
          } else if (e.fleeing) {
            // 怯えた味方モブ：本来の behavior を無視してプレイヤーから逃げる（壁はすり抜けない）
            const dx = pcx - ecx, dy = pcy - ecy; const dist = Math.hypot(dx, dy) || 1;
            const fleeSp = sp > 0 ? sp : 1.5;
            const nex = e.x - (dx / dist) * fleeSp, ney = e.y - (dy / dist) * fleeSp;
            const et1 = getTile(nex, e.y), et2 = getTile(nex + TILE_SIZE - 1, e.y + TILE_SIZE - 1);
            if (et1?.info.passable && et2?.info.passable && nex >= 0 && nex <= worldW - TILE_SIZE) e.x = nex;
            const et3 = getTile(e.x, ney), et4 = getTile(e.x + TILE_SIZE - 1, ney + TILE_SIZE - 1);
            if (et3?.info.passable && et4?.info.passable && ney >= 0 && ney <= worldH - TILE_SIZE) e.y = ney;
          } else {
            if (d.behavior === 'random') {
              if (e.timer % 40 === 0) { e.vx = (Math.random() * 2 - 1) * sp; e.vy = (Math.random() * 2 - 1) * sp; }
              e.x += e.vx; e.y += e.vy;
            } else if (d.behavior === 'chase' || d.behavior === 'flee') {
              const dx = pcx - ecx, dy = pcy - ecy; const dist = Math.hypot(dx, dy) || 1;
              let s = (d.behavior === 'chase' ? 1 : -1) * sp;

              // レゼ専用：爆弾爆発後の次の行動パターンに応じた移動
              if (gameData.engine === 'onjReze' && d.name === 'レゼ' && e.rezeState) {
                if (e.rezeStateTimer && e.rezeStateTimer > 0) {
                  e.rezeStateTimer--;
                  if (e.rezeState === 'charge') {
                    // 突撃：猛ダッシュでプレイヤーに接近
                    s = 2.2;
                    e.x += (dx / dist) * s; e.y += (dy / dist) * s;
                  } else if (e.rezeState === 'flank') {
                    // 回り込み：プレイヤーの側面に回り込むように移動
                    const flankSp = 1.6;
                    const signDir = ((e.homeX + e.homeY) % 2 === 0) ? 1 : -1;
                    e.x += (dy / dist) * flankSp * signDir;
                    e.y += (-dx / dist) * flankSp * signDir;
                  } else {
                    // normal：通常追尾
                    e.x += (dx / dist) * s; e.y += (dy / dist) * s;
                  }
                } else {
                  e.rezeState = undefined;
                  e.x += (dx / dist) * s; e.y += (dy / dist) * s;
                }
              } else {
                // 通常の追尾処理
                e.x += (dx / dist) * s; e.y += (dy / dist) * s;
              }
            } else if (d.behavior === 'patrolH') {
              if (e.vx === 0) e.vx = sp; e.x += e.vx;
              if (e.x < e.homeX - TILE_SIZE * 3 || e.x > e.homeX + TILE_SIZE * 3) e.vx *= -1;
              if (e.x < TILE_SIZE || e.x > worldW - TILE_SIZE * 2) e.vx *= -1;
            } else if (d.behavior === 'patrolV') {
              if (e.vy === 0) e.vy = sp; e.y += e.vy;
              if (e.x < e.homeY - TILE_SIZE * 3 || e.x > e.homeY + TILE_SIZE * 3) e.vy *= -1;
              if (e.y < TILE_SIZE || e.y > worldH - TILE_SIZE * 2) e.vy *= -1;
            }
            e.x = Math.max(0, Math.min(worldW - TILE_SIZE, e.x));
            e.y = Math.max(0, Math.min(worldH - TILE_SIZE, e.y));
          }

          // ── レゼ（敵）: 一定間隔でプレイヤーめがけて爆弾を投げる ──
          if (gameData.engine === 'onjReze' && d.name === 'レゼ' && isPlaying && !dead) {
            const distToPlayer = Math.hypot(pcx - ecx, pcy - ecy);
            const isClose = distToPlayer < TILE_SIZE * 4;

            // 爆発後の行動パターン持続中（e.rezeState が設定されている）は新しいボムを投げない
            if (!e.rezeState) {
              if (isClose) {
                // 近接戦闘AI: 45フレームに1回、非常に導火線が短いボムを使用
                if (!e.bombThrown && e.timer % 45 === 0) {
                  e.bombThrown = true;
                  const isVeryClose = distToPlayer < TILE_SIZE * 1.5;
                  if (isVeryClose) {
                    // 超至近距離なら直接プレイヤーの足元に設置（fuse: 12）
                    onjBombsRef.current.push({
                      x: pcx, y: pcy, fuse: 12, maxFuse: 12,
                      r: TILE_SIZE * 1.5, dmg: 2, head: false,
                      srcUrl: d.spriteUrl, owner: e,
                    });
                  } else {
                    // 近距離なら超高速ボムスロー（飛翔時間 10, 着地後 5フレームで爆発）
                    onjFliesRef.current.push({
                      fx: ecx, fy: ecy, tx: pcx, ty: pcy, t: 0, dur: 10,
                      fuse: 15, r: TILE_SIZE * 1.5, dmg: 2, head: false,
                      srcUrl: d.spriteUrl, owner: e,
                    });
                  }
                  playSfx(sfxRef.current.shot);
                }
              } else {
                // 通常モード: 遠距離から120フレームに1回ボムスロー
                const RB_FUSE = 96, RB_FLY = 24, RB_R = TILE_SIZE * 1.6, RB_DMG = 2;
                if (!e.bombThrown && distToPlayer < TILE_SIZE * 8 && e.timer % 120 === 0) {
                  e.bombThrown = true; // 爆発するまで次を投げない
                  onjFliesRef.current.push({
                    fx: ecx, fy: ecy, tx: pcx, ty: pcy, t: 0, dur: RB_FLY,
                    fuse: RB_FUSE, r: RB_R, dmg: RB_DMG, head: false,
                    srcUrl: d.spriteUrl, owner: e,
                  });
                  playSfx(sfxRef.current.shot);
                }
              }
            }
          }

          // hp が 0 以下なら即除去（exit() による非同期死亡に対応）
          if (e.hp <= 0) {
            if (e.scriptCtx) e.scriptCtx.cancelled = true;
            eng.entities.splice(ei, 1); continue;
          }

          // 弾幕スクリプトがあれば stepSpell、なければ従来の bullet システム
          // touhou 雑魚は画面内に入ってから発射
          if (e.spellState && e.y >= 0) {
            stepSpell(e.spellState, eng.enemyBullets, ecx, ecy, pcx, pcy);
          } else if (e.y >= 0 && d.bullet !== 'none' && e.timer % Math.max(1, Math.round(d.fireRate)) === 0) {
            const spd = d.bulletSpeed;
            if (d.bullet === 'aimed') {
              const dx = pcx - ecx, dy = pcy - ecy; const dist = Math.hypot(dx, dy) || 1;
              eng.enemyBullets.push({ x: ecx, y: ecy, vx: dx / dist * spd, vy: dy / dist * spd, r: 5, color: d.bulletColor });
            } else if (d.bullet === 'spread') {
              for (let k = -2; k <= 2; k++) {
                const a = Math.PI / 2 + k * 0.3;
                eng.enemyBullets.push({ x: ecx, y: ecy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 5, color: d.bulletColor });
              }
            } else if (d.bullet === 'spiral') {
              for (let w = 0; w < 5; w++) {
                const a = e.timer * 0.15 + w * (Math.PI * 2 / 5);
                eng.enemyBullets.push({ x: ecx, y: ecy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 6, color: d.bulletColor });
              }
            }
          }

          for (let j = eng.bullets.length - 1; j >= 0; j--) {
            const b = eng.bullets[j];
            // アイテム・NPC・ワープ・イベント等は自弾で破壊されない（敵のみ被弾）
            if ((d.objType ?? 'enemy') !== 'enemy') break;
            if (b.x < e.x + TILE_SIZE && b.x + b.w > e.x && b.y < e.y + TILE_SIZE && b.y + b.h > e.y) {
              e.hp--; eng.bullets.splice(j, 1);
              if (e.hp <= 0) {
                if (e.scriptCtx) e.scriptCtx.cancelled = true;
                scoreRef.current += d.isBoss ? 100 : 10;
                if (gameData.engine === 'touhou' && d.bombDrop && Math.random() < d.bombDrop) {
                  bombPickupsRef.current.push({ x: ecx, y: ecy, life: 300 });
                }
                if (d.isBoss) activeSpellCardNameRef.current = null;
                eng.entities.splice(ei, 1);
                // action ボス撃破：outroDialogue を流す（ゴール解放は goal タイル側の isBoss 残存チェック）
                if (gameData.engine === 'action' && d.isBoss && d.outroDialogue?.length && !activeDialogueRef.current) {
                  setActiveDialogue(d.outroDialogue);
                }
                break;
              }
            }
          }
          if (e.hp <= 0) continue;

          // ── 剣（近接）の当たり判定（onjReze） ──
          // 直線状の矩形判定だと、追尾してくる敵が斜め位置にいるだけで当たらず「ダメージを与えられない」原因になるため、
          // プレイヤーの向いている方向に少しずらした円形の判定に変更（斜め位置の敵にも当たるように緩和）。
          if (gameData.engine === 'onjReze' && (d.hazard || d.objType === 'npc') && swordRef.current.active > 0 && !swordRef.current.hit.has(d.id)) {
            const sw = swordRef.current; const reach = 26;
            const swingCx = p.x + pData.w / 2 + sw.dir.x * (pData.w / 2 + reach / 2);
            const swingCy = p.y + pData.h / 2 + sw.dir.y * (pData.h / 2 + reach / 2);
            const ew0 = e.def.w ?? TILE_SIZE, eh0 = e.def.h ?? TILE_SIZE;
            const hitR = reach + Math.max(pData.w, pData.h, ew0, eh0) / 2 * 0.6;
            if (Math.hypot(ecx - swingCx, ecy - swingCy) < hitR) {
              sw.hit.add(d.id);
              if (!d.hazard) {
                // 味方モブ：怯えて逃げるAIに切り替えつつ、ダメージも与える
                e.fleeing = true;
                e.talked = false;
                if (npcTalkRef.current?.entity === e) npcTalkRef.current = null;
              }
              e.hp--;
              e.x = Math.max(0, Math.min(worldW - TILE_SIZE, e.x + sw.dir.x * 12));
              e.y = Math.max(0, Math.min(worldH - TILE_SIZE, e.y + sw.dir.y * 12));
              if (e.hp <= 0) {
                if (e.scriptCtx) e.scriptCtx.cancelled = true;
                scoreRef.current += d.isBoss ? 100 : 10;
                if (npcTalkRef.current?.entity === e) npcTalkRef.current = null;
                eng.entities.splice(ei, 1);
                continue;
              }
            }
          }

          // ── onjReze: hazard 敵に触れたら確実にダメージを受ける（仕様変更） ──
          if (gameData.engine === 'onjReze' && d.hazard && isPlaying && !dead
              && !debugInvincibleRef.current && invulnRef.current <= 0) {
            const ew1 = e.def.w ?? TILE_SIZE, eh1 = e.def.h ?? TILE_SIZE;
            const touchR = (Math.max(pData.w, pData.h) + Math.max(ew1, eh1)) / 2 * 0.85;
            if (Math.hypot(pcx - ecx, pcy - ecy) < touchR) {
              const dmg = Math.max(1, Math.round((d.atk ?? 8) / 8));
              onjRezeHpRef.current.hp -= dmg; invulnRef.current = 60;
              // ノックバック（敵と反対方向へ）
              const kdx = pcx - ecx, kdy = pcy - ecy; const kd = Math.hypot(kdx, kdy) || 1;
              p.x = Math.max(0, Math.min(worldW - pData.w, p.x + (kdx / kd) * 18));
              p.y = Math.max(0, Math.min(worldH - pData.h, p.y + (kdy / kd) * 18));
              hitShake(); playSfx(sfxRef.current.damage); forceHud(n => n + 1);
              if (onjRezeHpRef.current.hp <= 0) { lose('やられた…'); dead = true; }
            }
          }

          // ── スペルカード発動チェック（ボス・touhou） ──
          if (isPlaying && gameData.engine === 'touhou' && d.isBoss && d.spellCards?.length) {
            for (let sci = 0; sci < d.spellCards.length; sci++) {
              const card = d.spellCards[sci];
              const cardKey = `${d.id}-${sci}`;
              if (!spellCardTriggeredRef.current.has(cardKey) && e.hp <= card.triggerHp) {
                spellCardTriggeredRef.current.add(cardKey);
                activeSpellCardNameRef.current = card.name;
                playSfx(sfxRef.current.spellcard);
                if (e.scriptCtx) e.scriptCtx.cancelled = true;
                eng.enemyBullets = [];
                const triggerCutin = () => {
                  const k = ++spellCutinKeyCountRef.current;
                  setSpellCutin({ key: k, mode: 'boss',
                    charName: card.cutinCharName ?? d.name ?? d.emoji,
                    spellName: card.name,
                    imageUrl: card.cutinImageUrl, imageX: card.cutinImageX,
                    imageY: card.cutinImageY, imageScale: card.cutinScale,
                  });
                  if (card.miniScript) {
                    const capturedE = e, capturedEng = eng, capturedScript = card.miniScript;
                    setTimeout(() => {
                      if (!capturedEng.entities.includes(capturedE)) return;
                      if (capturedE.scriptCtx) capturedE.scriptCtx.cancelled = true;
                      runEntityScript(capturedScript, capturedE, capturedEng, () => capturedEng.player);
                    }, 1500);
                  }
                };
                if (card.dialogue?.length) {
                  afterDialogueRef.current = triggerCutin;
                  setActiveDialogue(card.dialogue);
                } else {
                  triggerCutin();
                }
                break;
              }
            }
          }

          // ── マリオ系：踏みつけ／甲羅アクション（SMC core 準拠）──────────────
          // stompable/shell な敵（および甲羅化済み）のみ専用処理。AABB で接触判定し、
          // 上から落下中なら踏みつけ、横からなら甲羅蹴り or ダメージ。
          // テレサ・プクプク等の踏めない敵は従来の overlap 判定（下）でダメージを受ける。
          if (gameData.engine === 'action' && (d.objType ?? 'enemy') === 'enemy'
              && (d.stompable || d.shell || e.shellState || marioInvincible) && !(d.pages && d.pages.length > 0)) {
            const mew = d.w ?? TILE_SIZE, meh = d.h ?? TILE_SIZE;
            const aabb = p.x < e.x + mew && p.x + pData.w > e.x && p.y < e.y + meh && p.y + pData.h > e.y;
            if (!aabb) continue; // 接触なし → この敵はここで処理終了（legacy 判定へは進めない）
            // スター無敵：触れるだけで撃破
            if (marioInvincible) {
              scoreRef.current += 20; forceHud(n => n + 1); playSfx(sfxRef.current.damage);
              eng.entities.splice(ei, 1); break;
            }
            const prevFeet = (p.y + pData.h) - p.vy;            // 直前フレームの足元
            const isStomp = p.vy > 0 && prevFeet <= e.y + meh * 0.5; // 落下中かつ敵の上半分から
            const stompBounce = Math.min(-8, gameData.player.jumpPower * STOMP_BOUNCE_RATIO);
            if (isStomp) {
              p.y = e.y - pData.h; p.vy = stompBounce; p.isGrounded = false; // 敵の上にスナップして跳ねる
              playSfx(sfxRef.current.jump);
              if (d.shell) {
                if (!e.shellState) {
                  e.shellState = 'idle'; e.vx = 0; e.shellGrace = SHELL_KICK_GRACE; // ノコノコ→甲羅化
                  scoreRef.current += 10; forceHud(n => n + 1);
                } else if (e.shellState === 'slide') {
                  e.shellState = 'idle'; e.vx = 0; e.shellGrace = SHELL_KICK_GRACE; // 滑走甲羅を踏んで停止
                } else {
                  const kdir = Math.sign((e.x + mew / 2) - pcx) || 1; // 静止甲羅を踏んで蹴り出す
                  e.shellState = 'slide'; e.vx = kdir * SHELL_SPEED; e.shellGrace = SHELL_KICK_GRACE;
                }
              } else {
                scoreRef.current += 10; forceHud(n => n + 1); eng.entities.splice(ei, 1); // クリボー型は一撃
              }
              break;
            }
            // 横からの接触
            if (e.shellState === 'idle') {
              const kdir = Math.sign((e.x + mew / 2) - pcx) || 1; // 静止甲羅を横から蹴る（ダメージなし）
              e.shellState = 'slide'; e.vx = kdir * SHELL_SPEED; e.shellGrace = SHELL_KICK_GRACE;
              p.x = kdir > 0 ? e.x - pData.w : e.x + mew;          // 甲羅の外へ押し出す
              p.x = Math.max(0, Math.min(worldW - pData.w, p.x));
              playSfx(sfxRef.current.jump);
              break;
            }
            // スター無敵による即死処理
            if (starTimerRef.current > 0 && d.hazard && (e.shellGrace ?? 0) <= 0) {
              eng.entities.splice(ei, 1);
              scoreRef.current += 100;
              playSfx(sfxRef.current.damage);
              forceHud(n => n + 1);
              break;
            }
            // 滑走甲羅 or 通常の敵に横から触れた → ダメージ（蹴り出し直後の猶予中はスキップ）
            if (d.hazard && (e.shellGrace ?? 0) <= 0 && !debugInvincibleRef.current && invulnRef.current <= 0) {
              const dmg = Math.max(1, d.atk ?? 2);
              if (gameData.id === 'mario') {
                if (marioPowerRef.current === 'fire') {
                  marioPowerRef.current = 'super';
                  const droppedCoins = Math.min(10, coinsRef.current);
                  if (droppedCoins > 0) {
                    coinsRef.current -= droppedCoins;
                    const coinsToSpawn = Math.min(6, droppedCoins);
                    for (let i = 0; i < coinsToSpawn; i++) {
                      const angle = (Math.PI / 4) + (Math.random() * Math.PI / 2);
                      const speed = 2.0 + Math.random() * 4.0;
                      particlesRef.current.push({ x: p.x + pData.w / 2, y: p.y + pData.h / 2,
                        vx: Math.cos(angle) * speed * (Math.random() < 0.5 ? 1 : -1), vy: -Math.sin(angle) * speed - 1.0,
                        life: 300, maxLife: 300, size: 6, color: '#ffd700', type: 'coin', bounceCount: 0 });
                    }
                  }
                  invulnRef.current = 120;
                  hitShake(); playSfx(sfxRef.current.damage); forceHud(n => n + 1);
                } else if (marioPowerRef.current === 'super') {
                  marioPowerRef.current = 'small';
                  p.y += 32; // 接地を維持
                  const droppedCoins = Math.min(10, coinsRef.current);
                  if (droppedCoins > 0) {
                    coinsRef.current -= droppedCoins;
                    const coinsToSpawn = Math.min(6, droppedCoins);
                    for (let i = 0; i < coinsToSpawn; i++) {
                      const angle = (Math.PI / 4) + (Math.random() * Math.PI / 2);
                      const speed = 2.0 + Math.random() * 4.0;
                      particlesRef.current.push({ x: p.x + pData.w / 2, y: p.y + pData.h / 2,
                        vx: Math.cos(angle) * speed * (Math.random() < 0.5 ? 1 : -1), vy: -Math.sin(angle) * speed - 1.0,
                        life: 300, maxLife: 300, size: 6, color: '#ffd700', type: 'coin', bounceCount: 0 });
                    }
                  }
                  invulnRef.current = 120;
                  hitShake(); playSfx(sfxRef.current.damage); forceHud(n => n + 1);
                } else {
                  // 小状態でのダメージ
                  onjRezeHpRef.current.hp -= 1;
                  forceHud(n => n + 1);
                  if (onjRezeHpRef.current.hp <= 0) {
                    lose('ミス！'); dead = true;
                  } else {
                    const droppedCoins = Math.min(10, coinsRef.current);
                    if (droppedCoins > 0) {
                      coinsRef.current -= droppedCoins;
                      const coinsToSpawn = Math.min(6, droppedCoins);
                      for (let i = 0; i < coinsToSpawn; i++) {
                        const angle = (Math.PI / 4) + (Math.random() * Math.PI / 2);
                        const speed = 2.0 + Math.random() * 4.0;
                        particlesRef.current.push({ x: p.x + pData.w / 2, y: p.y + pData.h / 2,
                          vx: Math.cos(angle) * speed * (Math.random() < 0.5 ? 1 : -1), vy: -Math.sin(angle) * speed - 1.0,
                          life: 300, maxLife: 300, size: 6, color: '#ffd700', type: 'coin', bounceCount: 0 });
                      }
                    }
                    invulnRef.current = 120;
                    hitShake(); playSfx(sfxRef.current.damage);
                  }
                }
              } else {
                onjRezeHpRef.current.hp -= dmg; invulnRef.current = 120;
                hitShake(); playSfx(sfxRef.current.damage); forceHud(n => n + 1);
                if (onjRezeHpRef.current.hp <= 0) { lose('やられた…'); dead = true; }
              }
            }
            break;
          }

          // モブ衝突が円形になり隣接タイルへ入れなくなったため、NPCとの接触扱いの判定は円形かつ広めに取る。
          // ただしワープ/アイテムはモブ衝突の対象外（isBlockedByMob参照）で従来通りタイルに乗れるため、
          // 判定を広げると隣接するワープ同士が入った瞬間に誤発動するので、こちらは元の狭い矩形判定を使う。
          const overlap = Math.hypot(pcx - (e.x + TILE_SIZE / 2), pcy - (e.y + TILE_SIZE / 2)) < TILE_SIZE * 1.1;
          const exactOverlap = pcx > e.x && pcx < e.x + TILE_SIZE && pcy > e.y && pcy < e.y + TILE_SIZE;
          if (overlap) {
            const ot = d.objType ?? 'enemy';
            if (ot === 'warp' && d.warpTarget) {
              if (exactOverlap && !eventRunningRef.current && !warpCooldownRef.current) {
                engineRef.current.player.x = d.warpTarget.col * TILE_SIZE;
                engineRef.current.player.y = d.warpTarget.row * TILE_SIZE;
              }
              break;
            }
            // シーン間ワープ（土管・扉など）：フェード遷移を開始
            if (exactOverlap && d.warpSceneId && scenesRef.current.length > 0 && !sceneFadeRef.current && !sceneTransRef.current && !eventRunningRef.current && !warpCooldownRef.current) {
              const tgtScene = scenesRef.current.find(s => s.id === d.warpSceneId);
              if (tgtScene) {
                const ex = (d.warpEntryCol ?? 1) * TILE_SIZE;
                const ey = (d.warpEntryRow ?? 1) * TILE_SIZE;
                if (gameData.id === 'mario') {
                  const onTop = Math.abs(p.x - d.col * TILE_SIZE) < 12 && p.isGrounded;
                  if (onTop && isDown && !marioPipeRef.current) {
                    marioPipeRef.current = {
                      phase: 'entering',
                      x: d.col * TILE_SIZE,
                      startY: p.y,
                      targetY: p.y + getPlayerHeight(),
                      progress: 0,
                      maxProgress: 40,
                      warpSceneId: d.warpSceneId,
                      entryX: ex,
                      entryY: ey
                    };
                    playSfx(sfxRef.current.damage); // 土管に入る効果音
                    resetSceneState(); // 遷移開始時にセリフ・イベントを即座に消去
                  }
                } else {
                  sceneFadeRef.current = { phase: 'out', frame: 0, totalFrames: 16, nextSceneId: d.warpSceneId, entryX: ex, entryY: ey };
                  resetSceneState(); // 遷移開始時にセリフ・イベントを即座に消去
                }
              }
              break;
            }
            if (ot === 'item') {
              if (exactOverlap && !eventRunningRef.current) {
                const iid = d.itemId || d.name || d.id;
                // マリオ系パワーアップの即時効果
                if (gameData.id === 'mario') {
                  if (iid === 'fireFlower') {
                    marioPowerRef.current = 'fire';
                    playSfx(sfxRef.current.jump);
                  }
                  else if (iid === 'superMushroom') {
                    if (marioPowerRef.current === 'small') {
                      marioPowerRef.current = 'super';
                      p.y -= 32;
                      marioTransformingRef.current = 40;
                    }
                    const z = onjRezeHpRef.current;
                    z.hp = Math.min(z.max, z.hp + 2);
                    playSfx(sfxRef.current.jump);
                  }
                  else if (iid === 'oneUp') {
                    livesRef.current += 1;
                    playSfx(sfxRef.current.jump);
                  }
                  else if (iid === 'star') {
                    starTimerRef.current = STAR_DURATION;
                  }
                }
                // ロックマン系アイテムの即時効果（action エンジン汎用、itemId の規約で判定）
                else if (gameData.engine === 'action') {
                  const z = onjRezeHpRef.current;
                  const wEn = actionWeaponEnergyRef.current;
                  if (iid === 'energyCapsule') z.hp = Math.min(z.max, z.hp + 8);
                  else if (iid === 'smallEnergyTank') z.hp = Math.min(z.max, z.hp + Math.ceil(z.max / 2));
                  else if (iid === 'energyTank') z.hp = z.max;
                  else if (iid === 'weaponTank') actionWeaponsRef.current.forEach(w => { if (w !== 'buster') wEn[w] = MAX_WEAPON_ENERGY; });
                  else if (iid === 'smallWeaponTank') {
                    const cw = actionWeaponsRef.current[actionWeaponIdxRef.current];
                    if (cw && cw !== 'buster') wEn[cw] = Math.min(MAX_WEAPON_ENERGY, (wEn[cw] ?? 0) + Math.ceil(MAX_WEAPON_ENERGY / 2));
                  }
                  // ボス武器の入手：武器スロットに追加してフルチャージ（E キーで切り替え）
                  else if (['airShooter', 'metalBlade', 'crashBomb'].includes(iid)) {
                    if (!actionWeaponsRef.current.includes(iid)) actionWeaponsRef.current.push(iid);
                    wEn[iid] = MAX_WEAPON_ENERGY;
                  }
                  playSfx(sfxRef.current.jump);
                  forceHud(n => n + 1);
                }
                setInventory(p => { const n = { ...p }; n[iid] = (n[iid] ?? 0) + 1; return n; });
                eng.entities.splice(ei, 1);
                const itemDef = (gameData.items ?? []).find(it => it.id === iid);
                itemGetRef.current = { text: `${itemDef?.emoji ?? d.emoji} ×1 を てにいれた！`, startTime: performance.now() };
              }
              break;
            }
            if (d.shopItems?.length && !eventRunningRef.current && !frozen) {
              if (!e.talked) { e.talked = true; setShopModal({ npcId: d.id, items: d.shopItems }); }
              break;
            }
            if (d.pages && d.pages.length > 0) {
              if (!eventRunningRef.current && !e.talked && !frozen) {
                const page = findActivePage(d);
                if (page && page.commands.length > 0) {
                  e.talked = true;
                  runEventCommands(d.id, page.commands);
                }
              }
              break;
            }
            if (d.hazard) {
              if (starTimerRef.current > 0) {
                eng.entities.splice(ei, 1);
                scoreRef.current += 100;
                playSfx(sfxRef.current.damage);
                forceHud(n => n + 1);
                break;
              }
              if (!debugInvincibleRef.current) {
                if (gameData.engine === 'rpg' && gameData.battle) { if (invulnRef.current <= 0) { startBattle(e); dead = true; } break; }
                if (gameData.engine === 'touhou') { if (!isPlayerDeadRef.current && invulnRef.current <= 0) { handlePlayerDeath(); dead = true; } break; }
                // onjReze の hazard 接触ダメージは、円形のモブ判定に一本化するため下の専用ブロックで処理する（ここでは何もしない）
                if (gameData.engine === 'onjReze') break;
                if (gameData.engine === 'action') {
                  if (invulnRef.current <= 0) {
                    const dmg = Math.max(1, d.atk ?? 2);
                    if (gameData.id === 'mario') {
                      if (marioPowerRef.current === 'fire') {
                        marioPowerRef.current = 'super';
                      } else if (marioPowerRef.current === 'super') {
                        marioPowerRef.current = 'small';
                        p.y += 32; // 接地を維持
                      } else {
                        onjRezeHpRef.current.hp -= 1;
                        if (onjRezeHpRef.current.hp <= 0) {
                          lose('ミス！'); dead = true;
                        }
                      }
                      const droppedCoins = Math.min(10, coinsRef.current);
                      if (droppedCoins > 0) {
                        coinsRef.current -= droppedCoins;
                        const coinsToSpawn = Math.min(6, droppedCoins);
                        for (let i = 0; i < coinsToSpawn; i++) {
                          const angle = (Math.PI / 4) + (Math.random() * Math.PI / 2);
                          const speed = 2.0 + Math.random() * 4.0;
                          particlesRef.current.push({
                            x: p.x + pData.w / 2,
                            y: p.y + pData.h / 2,
                            vx: Math.cos(angle) * speed * (Math.random() < 0.5 ? 1 : -1),
                            vy: -Math.sin(angle) * speed - 1.0,
                            life: 300,
                            maxLife: 300,
                            size: 6,
                            color: '#ffd700',
                            type: 'coin',
                            bounceCount: 0
                          });
                        }
                      }
                      invulnRef.current = 120;
                      hitShake(); playSfx(sfxRef.current.damage); forceHud(n => n + 1);
                    } else {
                      onjRezeHpRef.current.hp -= dmg; invulnRef.current = 120;
                      hitShake(); playSfx(sfxRef.current.damage); forceHud(n => n + 1);
                      if (onjRezeHpRef.current.hp <= 0) { lose('やられた…'); dead = true; }
                    }
                  }
                  break;
                }
                hitShake(); playSfx(sfxRef.current.damage); lose('ミス！'); dead = true;
              }
              break;
            }
            else if (e.fleeing && !e.talked) {
              e.talked = true;
              const text = 'ひぃっ！？も、もう堪忍してぇや…！';
              ctx.font = `bold 11px ${getPixelFontFamily()}`;
              const wrapped = wrapWithKinsoku(ctx, text, Math.min(PLAY_W - 16, 220));
              npcTalkRef.current = { entity: e, text, startTime: performance.now(), wrapped };
            }
            else if (d.message && !e.talked) {
              e.talked = true;
              const text = d.message;
              ctx.font = `bold 11px ${getPixelFontFamily()}`;
              const wrapped = wrapWithKinsoku(ctx, text, Math.min(PLAY_W - 16, 220));
              npcTalkRef.current = { entity: e, text, startTime: performance.now(), wrapped };
            }
          } else { e.talked = false; if (npcTalkRef.current?.entity === e) npcTalkRef.current = null; }
        }

        // ── 敵同士の衝突反射（横歩き系のみ。テレサ＝chase 等はすり抜ける）──
        if (gameData.engine === 'action') {
          const ents = eng.entities;
          const reflects = (b: NpcBehavior) => b === 'patrolH' || b === 'walker';
          for (let a = 0; a < ents.length; a++) {
            const ea = ents[a];
            if (!reflects(ea.def.behavior) || ea.shellState) continue; // 甲羅は反射せず巻き込む
            const aw = ea.def.w ?? TILE_SIZE, ah = ea.def.h ?? TILE_SIZE;
            for (let b = a + 1; b < ents.length; b++) {
              const eb = ents[b];
              if (!reflects(eb.def.behavior) || eb.shellState) continue;
              const bw = eb.def.w ?? TILE_SIZE, bh = eb.def.h ?? TILE_SIZE;
              // AABB が重なったら、互いに逆方向へ歩き出す（反射）
              if (ea.x < eb.x + bw && ea.x + aw > eb.x && ea.y < eb.y + bh && ea.y + ah > eb.y) {
                const ov = Math.min(ea.x + aw, eb.x + bw) - Math.max(ea.x, eb.x);
                const left = ea.x <= eb.x ? ea : eb;
                const right = left === ea ? eb : ea;
                // 重なりを解消してから反転（左の敵は左へ、右の敵は右へ）
                left.x = Math.max(0, left.x - ov / 2);
                right.x = Math.min(worldW - (right.def.w ?? TILE_SIZE), right.x + ov / 2);
                left.vx = -Math.abs(left.vx || left.def.speed);
                right.vx = Math.abs(right.vx || right.def.speed);
              }
            }
          }
        }

        // ── 滑走甲羅が他の敵を巻き込んで撃破（SMC shell_destroy_area 準拠）──
        if (gameData.engine === 'action') {
          const shells = eng.entities.filter(en => en.shellState === 'slide' && en.vx !== 0);
          for (const sh of shells) {
            const shw = sh.def.w ?? TILE_SIZE, shh = sh.def.h ?? TILE_SIZE;
            for (let t = eng.entities.length - 1; t >= 0; t--) {
              const tg = eng.entities[t];
              if (tg === sh || tg.shellState) continue;                       // 甲羅同士は対象外
              if ((tg.def.objType ?? 'enemy') !== 'enemy' || !tg.def.hazard) continue;
              const tw = tg.def.w ?? TILE_SIZE, th = tg.def.h ?? TILE_SIZE;
              if (sh.x < tg.x + tw && sh.x + shw > tg.x && sh.y < tg.y + th && sh.y + shh > tg.y) {
                eng.entities.splice(t, 1);
                scoreRef.current += 10; forceHud(n => n + 1);
                playSfx(sfxRef.current.damage);
              }
            }
          }
        }

        if (!dead) {
          const core = gameData.engine === 'touhou' ? 3 : 8;
          if (grazeFlashRef.current > 0) grazeFlashRef.current--;

          // ── 弾移動・画面外除去 ──
          for (let i = eng.enemyBullets.length - 1; i >= 0; i--) {
            const eb = eng.enemyBullets[i];
            // 加速弾処理
            if (eb.accel !== undefined && eb.maxSpeed !== undefined) {
              const spd = Math.hypot(eb.vx, eb.vy);
              if (spd < eb.maxSpeed) {
                const newSpd = Math.min(spd + eb.accel, eb.maxSpeed);
                const ratio = spd > 0 ? newSpd / spd : 0;
                eb.vx *= ratio; eb.vy *= ratio;
              }
            }
            eb.x += eb.vx; eb.y += eb.vy;
            // 消滅タイマー
            if (eb.vanishIn !== undefined) {
              eb.vanishIn--;
              if (eb.vanishIn <= 0) { eng.enemyBullets.splice(i, 1); continue; }
            }
            if (eb.x < -20 || eb.x > worldW + 20 || eb.y < -20 || eb.y > worldH + 20) eng.enemyBullets.splice(i, 1);
          }

          // ── 空間グリッドに登録 ──
          const grid = bulletGridRef.current;
          grid.clear();
          for (const eb of eng.enemyBullets) grid.insert(eb);

          // ── 当たり判定（グリッドで絞り込んでから距離チェック） ──
          const checkRadius = 24 + core; // グレイズ検出最大距離
          const candidates = grid.query(pcx, pcy, checkRadius);
          for (const eb of candidates) {
            const dist = Math.hypot(eb.x - pcx, eb.y - pcy);
            // グレイズ判定
            if (gameData.engine === 'touhou' && !eb.grazed && !isPlayerDeadRef.current &&
                invulnRef.current <= 0 && bombInvulnRef.current <= 0 &&
                dist < eb.r + 16 && dist >= eb.r + core) {
              eb.grazed = true;
              grazeRef.current++;
              scoreRef.current += 10;
              grazeFlashRef.current = 8;
              playSfx(sfxRef.current.graze);
            }
            // 被弾判定
            if (!debugInvincibleRef.current && !isPlayerDeadRef.current && invulnRef.current <= 0 && bombInvulnRef.current <= 0 && dist < eb.r + core) {
              if (gameData.engine === 'rpg' && gameData.battle) {
                const idx = eng.enemyBullets.indexOf(eb);
                if (idx >= 0) eng.enemyBullets.splice(idx, 1);
                progressRef.current.hp -= 6; invulnRef.current = 45; forceHud(n => n + 1);
                if (progressRef.current.hp <= 0) { hitShake(); playSfx(sfxRef.current.damage); lose('やられた…'); dead = true; break; }
                continue;
              }
              if (gameData.engine === 'touhou') { handlePlayerDeath(); dead = true; break; }
              if (gameData.engine === 'onjReze') {
                const idx = eng.enemyBullets.indexOf(eb);
                if (idx >= 0) eng.enemyBullets.splice(idx, 1);
                onjRezeHpRef.current.hp -= 1; invulnRef.current = 60;
                hitShake(); playSfx(sfxRef.current.damage); forceHud(n => n + 1);
                if (onjRezeHpRef.current.hp <= 0) { lose('やられた…'); dead = true; break; }
                continue;
              }
              if (gameData.engine === 'action') {
                const idx = eng.enemyBullets.indexOf(eb);
                if (idx >= 0) eng.enemyBullets.splice(idx, 1);
                if (gameData.id === 'mario') {
                  if (marioPowerRef.current === 'fire') {
                    marioPowerRef.current = 'super';
                  } else if (marioPowerRef.current === 'super') {
                    marioPowerRef.current = 'small';
                    p.y += 32; // 接地を維持
                  } else {
                    onjRezeHpRef.current.hp -= 1;
                    if (onjRezeHpRef.current.hp <= 0) {
                      lose('ミス！'); dead = true; break;
                    }
                  }
                  const droppedCoins = Math.min(10, coinsRef.current);
                  if (droppedCoins > 0) {
                    coinsRef.current -= droppedCoins;
                    const coinsToSpawn = Math.min(6, droppedCoins);
                    for (let i = 0; i < coinsToSpawn; i++) {
                      const angle = (Math.PI / 4) + (Math.random() * Math.PI / 2);
                      const speed = 2.0 + Math.random() * 4.0;
                      particlesRef.current.push({
                        x: p.x + pData.w / 2,
                        y: p.y + pData.h / 2,
                        vx: Math.cos(angle) * speed * (Math.random() < 0.5 ? 1 : -1),
                        vy: -Math.sin(angle) * speed - 1.0,
                        life: 300,
                        maxLife: 300,
                        size: 6,
                        color: '#ffd700',
                        type: 'coin',
                        bounceCount: 0
                      });
                    }
                  }
                  invulnRef.current = 120;
                  hitShake(); playSfx(sfxRef.current.damage); forceHud(n => n + 1);
                  continue;
                }
                onjRezeHpRef.current.hp -= 1; invulnRef.current = 120;
                hitShake(); playSfx(sfxRef.current.damage); forceHud(n => n + 1);
                if (onjRezeHpRef.current.hp <= 0) { lose('やられた…'); dead = true; break; }
                continue;
              }
              lose('ミス！'); dead = true; break;
            }
          }
        }

        // ── ボムアイテム移動・回収 ──
        if (!dead && gameData.engine === 'touhou') {
          const pcxB = p.x + pData.w / 2, pcyB = p.y + pData.h / 2;
          for (let i = bombPickupsRef.current.length - 1; i >= 0; i--) {
            const bp = bombPickupsRef.current[i];
            bp.y += 0.8;
            bp.life--;
            if (bp.life <= 0 || bp.y > VIEW_H + 16) { bombPickupsRef.current.splice(i, 1); continue; }
            if (!isPlayerDeadRef.current && Math.hypot(bp.x - pcxB, bp.y - pcyB) < 16) {
              bombCountRef.current++;
              bombPickupsRef.current.splice(i, 1);
            }
          }
        }

        if (!dead) {
          if (gameData.engine !== 'touhou') {
            const center = getTile(pcx, pcy);
            if (center?.info?.special === 'goal') {
              const boss = gameData.battle?.boss;
              const symbolBossLeft = eng.entities.some(e => e.def.isBoss);
              if (boss && !bossDefeatedRef.current) {
                if (!debugInvincibleRef.current && invulnRef.current <= 0) { beginBattle({ name: boss.name, emoji: boss.emoji, hp: boss.hp, atk: boss.atk, def: boss.def, exp: boss.exp, gold: boss.gold, moves: boss.moves, miniScript: boss.miniScript, entity: null, isBoss: true, outroDialogue: gameData.battle?.outroDialogue }); dead = true; }
              } else if (symbolBossLeft) {
                if (!bossWarnRef.current) { bossWarnRef.current = true; showGameMsg('まだ強敵がいる！倒してから来るのだ！', 'instant', () => {}); }
              } else {
                if (gameData.id === 'mario' && !marioGoalRef.current) {
                  marioGoalRef.current = {
                    phase: 'slide',
                    x: center.rect.x,
                    targetY: center.rect.y + TILE_SIZE * 3.5,
                    progress: 0
                  };
                  playSfx(sfxRef.current.clear);
                } else if (gameData.id !== 'mario') {
                  win();
                }
              }
            }
            else if (center?.info?.special === 'trap') { if (!debugInvincibleRef.current) { lose('ミス！'); dead = true; } }
            else if (center?.info?.special === 'lava') {
              if (!debugInvincibleRef.current) { lose('溶岩に落ちた！'); dead = true; }
            }
            else if (center?.info?.special === 'checkpoint' && isAction) {
              if (!checkpointRef.current || checkpointRef.current.x !== p.x || checkpointRef.current.y !== p.y) {
                checkpointRef.current = { x: p.x, y: Math.max(0, p.y) };
                showGameMsg('チェックポイント！', 'timed', () => {});
              }
            }
            else bossWarnRef.current = false;
            // コインタイル：プレイヤーが重なったら回収（actionエンジン）
            if (isAction) {
              const phC = getPlayerHeight();
              const coinPts: [number, number][] = [
                [p.x + pData.w / 2, p.y + 6],
                [p.x + pData.w / 2, p.y + phC / 2],
                [p.x + pData.w / 2, p.y + phC - 6],
              ];
              for (const [cxq, cyq] of coinPts) {
                const ct = getTile(cxq, cyq);
                if (ct?.info?.special === 'coin') {
                  const ccol = Math.round(ct.rect.x / TILE_SIZE), crow = Math.round(ct.rect.y / TILE_SIZE);
                  if (eng.map[crow]?.[ccol] !== undefined) eng.map[crow][ccol] = 0;
                  coinsRef.current += 1; scoreRef.current += 200; forceHud(n => n + 1);
                  playSfx(sfxRef.current.coin);
                }
              }
            }
            // 音符ブロック：着地時に強制スーパージャンプ
            if (isAction) {
              const below = getTile(p.x + pData.w / 2, p.y + pData.h + 2);
              if (below?.info?.special === 'bounce' && p.isGrounded && p.vy === 0) {
                p.vy = gameData.player.jumpPower * 1.6;
                p.isGrounded = false;
              }
            }
            // onjReze：ダンジョンボスを倒したらクリア（ゴールタイル不要）
            if (gameData.engine === 'onjReze' && !bossDefeatedRef.current) {
              const bossDef = gameData.objects.find(o => o.isBoss);
              if (bossDef && eng.entities.every(e => !e.def.isBoss)) {
                bossDefeatedRef.current = true;
                if (bossDef.outroDialogue?.length) {
                  afterDialogueRef.current = () => win();
                  setActiveDialogue(bossDef.outroDialogue);
                } else win();
              }
            }
          } else if (gameData.engine === 'touhou') {
            // フェーズシステム（dialogue 表示中はエンティティが 0 でもスキップ）
            const phases = gameData.phases;
            if (
              eng.entities.length === 0 &&
              !waveRunningRef.current &&
              phaseIndexRef.current >= 0 &&
              pendingPhaseRef.current === null &&
              !activeDialogueRef.current
            ) {
              if (!phases?.length) {
                // phases 未定義：レガシー2フェーズ（旧互換）
                win();
              } else {
                const curPhaseIdx = phaseIndexRef.current;
                const curPhase = phases[curPhaseIdx];
                const nextIdx = curPhaseIdx + 1;

                // フェーズクリアボーナス
                if (curPhase?.scoreBonus) {
                  scoreRef.current += curPhase.scoreBonus;
                  forceHud(n => n + 1);
                }

                eng.bullets = []; eng.enemyBullets = [];

                // outroDialogue があれば先に流す（pendingPhase は nextIdx に保持）
                if (curPhase?.outroDialogue?.length) {
                  outroModeRef.current = true;
                  pendingPhaseRef.current = nextIdx < phases.length ? nextIdx : -1; // -1=クリア
                  setActiveDialogue(curPhase.outroDialogue);
                } else if (nextIdx >= phases.length) {
                  pendingPhaseRef.current = -1; // 再トリガー防止
                  win();
                } else {
                  const nextPhase = phases[nextIdx];
                  if (nextPhase?.dialogue?.length) {
                    pendingPhaseRef.current = nextIdx;
                    setActiveDialogue(nextPhase.dialogue);
                  } else {
                    eng.entities = buildPhaseEntities(nextIdx, gameData, eng, waveCtxRef, waveRunningRef);
                    phaseIndexRef.current = nextIdx;
                  }
                }
              }
            }
          }
        }
      }

      // ── action key: trigger event/message on overlapping object ──
      if (isAction && !prevActionRef.current && !battleRef.current.active && !eventRunningRef.current && !activeDialogueRef.current && !frozen) {
        const pcx = p.x + pData.w / 2, pcy = p.y + pData.h / 2;
        const target = (isPlaying ? eng.entities : gameData.objects).find(o => {
          const ox = isPlaying ? (o as Entity).x : (o as ObjectDef).col * TILE_SIZE;
          const oy = isPlaying ? (o as Entity).y : (o as ObjectDef).row * TILE_SIZE;
          // モブ衝突が円形になり隣接タイルへ入れなくなったため、話しかけ判定も円形かつ広めに取る
          return Math.hypot(pcx - (ox + TILE_SIZE / 2), pcy - (oy + TILE_SIZE / 2)) < TILE_SIZE * 1.1;
        });
        if (target) {
          const def = isPlaying ? (target as Entity).def : target as ObjectDef;
          if (isPlaying && (target as Entity).fleeing) {
            // 怯えているモブはメッセージウィンドウを出さない（頭上のセリフのみ）
          } else {
            const page = def.pages && def.pages.length > 0 ? findActivePage(def) : null;
            if (page && page.commands.length > 0) {
              runEventCommands(def.id, page.commands);
            } else if (def.message && !(isPlaying && !def.hazard)) {
              // 頭上に1文字ずつセリフが出るキャラ（非hazardの接触モブ）は、そちらで既に表示されるため
              // 話しかけ時の個別フキダシは重複させない
              showGameMsg(def.message, 'instant', () => {});
            }
          }
        }
      }
      prevActionRef.current = isAction;

      // ── Z / X keys: place / delete object ──
      const isZ = keys.has('z') || keys.has('Z') || touchRef.current.action;
      const isX = keys.has('x') || keys.has('X') || touchRef.current.shoot;
      if (!isPlaying && !battleRef.current.active && !eventRunningRef.current) {
        if (isZ && !prevZRef.current) placeObj();
        if (isX && !prevXRef.current && selectedObjIdRef.current) {
          setGameData(p => ({ ...p, objects: p.objects.filter(o => o.id !== selectedObjIdRef.current) }));
          setSelectedObjId(null);
        }
      }
      prevZRef.current = isZ;
      prevXRef.current = isX;

      // ── edit mode: detect near objects ──
      let nearObj: ObjectDef | null = null;
      if (!isPlaying && !battleRef.current.active) {
        const pcx = p.x + pData.w / 2, pcy = p.y + pData.h / 2;
        for (const o of gameData.objects) {
          const ox = o.col * TILE_SIZE, oy = o.row * TILE_SIZE;
          if (pcx > ox && pcx < ox + TILE_SIZE && pcy > oy && pcy < oy + TILE_SIZE) {
            nearObj = o;
            break;
          }
        }
        if (nearObj && nearObj.id !== selectedObjIdRef.current) setSelectedObjId(nearObj.id);
      }

      // ── draw ──
      ctx.fillStyle = gameData.tiles[0]?.color || '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (gameData.mapBgUrl) {
        const bgImg = imgCache.current.get(gameData.mapBgUrl);
        if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
          ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
        }
      }

      // カメラ：touhou は画面固定（常に原点）、他はプレイヤー中心追従
      let camX = gameData.engine === 'touhou' ? 0 : Math.max(0, Math.min(camMax,
        isPlaying || p.x !== gameData.player.start.x
          ? p.x + pData.w / 2 - VIEW_W / 2
          : editScrollRef.current));
      let camY = gameData.engine === 'touhou' ? 0 : Math.max(0, Math.min(camMaxY,
        isPlaying || p.y !== gameData.player.start.y
          ? p.y + pData.h / 2 - VIEW_H / 2
          : editScrollYRef.current));

      // ── シーン切り替えモードでのカメラ境界クランプ ──
      if (isPlaying && gameData.engine === 'action' && scenesRef.current.length > 0 && worldLayoutRef.current) {
        const lay = worldLayoutRef.current.layouts.find(l => l.sceneIdx === activeSceneIdxRef.current);
        if (lay && !sceneTransRef.current) {
          const minX = lay.originX * TILE_SIZE;
          const maxX = Math.max(minX, (lay.originX + lay.sceneW) * TILE_SIZE - VIEW_W);
          const minY = lay.originY * TILE_SIZE;
          const maxY = Math.max(minY, (lay.originY + lay.sceneH) * TILE_SIZE - VIEW_H);
          camX = Math.max(minX, Math.min(maxX, camX));
          camY = Math.max(minY, Math.min(maxY, camY));
        }
      }

      // ── スライド遷移中のカメラ位置線形補間 ──
      if (isPlaying && gameData.engine === 'action' && sceneTransRef.current) {
        const trans = sceneTransRef.current;
        const ratio = trans.frame / TRANS_FRAMES;
        camX = trans.startCamX + (trans.endCamX - trans.startCamX) * ratio;
        camY = trans.startCamY + (trans.endCamY - trans.startCamY) * ratio;
      }

      const finalCamX = camX, finalCamY = camY;

      // 画面シェイク（ヒット・爆発・ゲームオーバー）
      if (shakeRef.current > 0) shakeRef.current--;
      const shakeMag = shakeRef.current > 0 ? Math.min(shakeRef.current, 8) * 0.7 : 0;
      const shakeOx = shakeMag > 0 ? (Math.random() - 0.5) * shakeMag * 2 : 0;
      const shakeOy = shakeMag > 0 ? (Math.random() - 0.5) * shakeMag * 2 : 0;

      ctx.save();
      ctx.scale(SCALE_X, SCALE_Y);
      ctx.translate(shakeOx - finalCamX, shakeOy - finalCamY);

      const map = engineRef.current.map;
      const startCol = Math.max(0, Math.floor(finalCamX / TILE_SIZE));
      const endCol = Math.min(worldCols, startCol + VIEW_COLS + 2);
      const startRow = Math.max(0, Math.floor(finalCamY / TILE_SIZE));
      const endRow = Math.min(worldRows, startRow + VIEW_ROWS + 2);
      const drawTileCell = (x: number, y: number, tileId: number, info: TileDef) => {
            // コインタイル：回転コイン（横幅が正弦波で伸縮）を描く。画像不要。
            if (info.special === 'coin') {
              const ccx = x * TILE_SIZE + TILE_SIZE / 2, ccy = y * TILE_SIZE + TILE_SIZE / 2;
              const spinW = Math.max(2, Math.abs(Math.sin(Date.now() / 180 + x * 0.9)) * 9);
              ctx.fillStyle = '#ffd700';
              ctx.beginPath(); ctx.ellipse(ccx, ccy, spinW, 11, 0, 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.ellipse(ccx, ccy, spinW, 11, 0, 0, Math.PI * 2); ctx.stroke();
              if (!isPlaying) { ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE); }
              return;
            }
            // imageUrl に #sx,sy,sw,sh が付いていればアトラスから単一スプライトを切り出す。
            // 既定は cell-fill（マスいっぱいに描画）＝欠片を縦に積んでも継ぎ目が出ない（土管トップ＋ボディ等）。
            // imageOverflowTop=true のタイルのみ、アスペクト比を保ち「セル幅基準・下端固定」で上方向へはみ出す
            // （1マスに置く単独の縦長素材＝ゴール旗など）。
            const rawImgUrl = info.imageUrl ?? '';
            const hashIdx = rawImgUrl.indexOf('#');
            const baseImgUrl = hashIdx !== -1 ? rawImgUrl.slice(0, hashIdx) : rawImgUrl;
            const rawCrop = hashIdx !== -1
              ? rawImgUrl.slice(hashIdx + 1).split(',').map(Number)
              : null;
            const imgCrop = rawCrop && rawCrop.length === 4 && rawCrop.every(n => !Number.isNaN(n))
              ? rawCrop as [number, number, number, number]
              : null;
            const img = baseImgUrl ? (imgCache.current.get(rawImgUrl) ?? imgCache.current.get(baseImgUrl)) : undefined;
            if (img && img.complete && img.naturalWidth > 0) {
              const sx = imgCrop ? imgCrop[0] : 0;
              const sy = imgCrop ? imgCrop[1] : 0;
              const sw = imgCrop ? imgCrop[2] : img.naturalWidth;
              const sh = imgCrop ? imgCrop[3] : img.naturalHeight;
              // マット透明化済み canvas があればそれを描画ソースに（寸法は元画像と同じ）。
              const drawSrc = keyedCache.current.get(rawImgUrl) ?? keyedCache.current.get(baseImgUrl) ?? img;
              if (info.imageScale2x) {
                const zoom = 2.0;
                const destW = sw * zoom;
                const destH = sh * zoom;
                const destX = x * TILE_SIZE + (TILE_SIZE - destW) / 2;
                if (info.imageOverflowTop) {
                  const destY = y * TILE_SIZE + TILE_SIZE - destH;
                  ctx.drawImage(drawSrc, sx, sy, sw, sh, destX, destY, destW, destH);
                } else {
                  ctx.drawImage(drawSrc, sx, sy, sw, sh, destX, y * TILE_SIZE, destW, TILE_SIZE);
                }
              } else if (info.imageOverflowTop) {
                // セル幅に合わせ高さをアスペクト比から算出。下端固定で縦長は上へはみ出す。
                const dH = sw > 0 ? Math.round(sh * (TILE_SIZE / sw)) : TILE_SIZE;
                ctx.drawImage(drawSrc, sx, sy, sw, sh, x * TILE_SIZE, y * TILE_SIZE + TILE_SIZE - dH, TILE_SIZE, dH);
              } else {
                // cell-fill（既定）: マスいっぱいに敷き詰める。
                ctx.drawImage(drawSrc, sx, sy, sw, sh, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
              }
            }
            else { ctx.fillStyle = info.color; ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE); }
            if (!isPlaying) { ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE); }
      };
      // 地面レイヤー：プレイヤーより先に描画
      for (let y = startRow; y < endRow; y++) {
        for (let x = startCol; x < endCol; x++) {
          const tileId = map[y]?.[x] ?? 0;
          const info = gameData.tiles[tileId];
          if (tileId !== 0 && info) drawTileCell(x, y, tileId, info);
        }
      }
      // 上層レイヤー（木の上部・屋根など）：地面と同じ座標範囲・タイル定義を使う別グリッド
      const overlayMap = worldLayoutRef.current?.overlayMap ?? gameData.overlayMap;

      // ── アニメーション中ブロックの描画 ──
      if (isPlaying) {
        blockAnimsRef.current.forEach(anim => {
          const info = anim.info;
          if (!info) return;
          const tx = anim.col * TILE_SIZE;
          const ty = anim.row * TILE_SIZE + anim.oy;
          
          if (anim.type === 'bump') {
            const rawImgUrl = info.imageUrl ?? '';
            const hashIdx = rawImgUrl.indexOf('#');
            const baseImgUrl = hashIdx !== -1 ? rawImgUrl.slice(0, hashIdx) : rawImgUrl;
            const img = baseImgUrl ? (imgCache.current.get(rawImgUrl) ?? imgCache.current.get(baseImgUrl)) : undefined;
            if (img && img.complete && img.naturalWidth > 0) {
              const hash = hashIdx !== -1 ? rawImgUrl.slice(hashIdx + 1).split(',').map(Number) : null;
              const sx = hash ? hash[0] : 0;
              const sy = hash ? hash[1] : 0;
              const sw = hash ? hash[2] : img.naturalWidth;
              const sh = hash ? hash[3] : img.naturalHeight;
              const drawSrc = keyedCache.current.get(rawImgUrl) ?? keyedCache.current.get(baseImgUrl) ?? img;
              
              if (info.imageScale2x) {
                const zoom = 2.0;
                const destW = sw * zoom;
                const destH = sh * zoom;
                const destX = tx + (TILE_SIZE - destW) / 2;
                ctx.drawImage(drawSrc, sx, sy, sw, sh, destX, ty, destW, TILE_SIZE);
              } else {
                ctx.drawImage(drawSrc, sx, sy, sw, sh, tx, ty, TILE_SIZE, TILE_SIZE);
              }
            } else {
              ctx.fillStyle = info.color;
              ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
            }
          } else if (anim.type === 'break' && anim.particles) {
            anim.particles.forEach(pt => {
              ctx.fillStyle = info.color ?? '#c08840';
              ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
            });
          }
        });
      }

      // objects (play: from entities, edit: from data)
      if (isPlaying) {
        for (let ei = 0; ei < eng.entities.length; ei++) {
          const e = eng.entities[ei];
          if (gameData.engine === 'onjReze' && e.def.name === 'レゼ' && e.bombThrown && e.def.spriteUrl) {
            // 上半身を投げて爆発を待っている間は、下半身だけを表示する
            ensureImage(e.def.spriteUrl);
            const img = imgCache.current.get(e.def.spriteUrl);
            if (img && img.complete && img.naturalWidth > 0) {
              let std = walkStdCache.get(e.def.spriteUrl);
              if (!std) { std = detectStandard(img.naturalWidth, img.naturalHeight); walkStdCache.set(e.def.spriteUrl, std); }
              const cell = animatedCell(std, img.naturalWidth, img.naturalHeight, { dir: 's', moving: false, timeSec: 0, fps: 7 });
              const srcImg = keyedCache.current.get(e.def.spriteUrl) ?? img;
              const ew = e.def.w ?? TILE_SIZE, eh = e.def.h ?? TILE_SIZE;
              ctx.drawImage(srcImg, cell.sx, cell.sy + cell.sh / 2, cell.sw, cell.sh / 2, e.x, e.y + eh / 2, ew, eh / 2);
            }
          } else {
            drawSprite({ emoji: e.def.emoji, spriteUrl: e.def.spriteUrl, spriteRef: e.def.spriteRef }, e.x, e.y, e.def.w ?? TILE_SIZE, e.def.h ?? TILE_SIZE, `ent${e.def.id}_${ei}`);
          }
          // レゼが近接戦闘AIに移行している時（プレイヤーが近くにいる時）は赤いオーラを描画
          if (gameData.engine === 'onjReze' && e.def.name === 'レゼ' && !dead) {
            const pcx = p.x + pData.w / 2, pcy = p.y + pData.h / 2;
            const ecx = e.x + TILE_SIZE / 2, ecy = e.y + TILE_SIZE / 2;
            if (Math.hypot(pcx - ecx, pcy - ecy) < TILE_SIZE * 4) {
              ctx.save();
              ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
              ctx.lineWidth = 2;
              ctx.shadowColor = 'rgba(255, 0, 0, 0.8)';
              ctx.shadowBlur = 8;
              ctx.strokeRect(e.x - 2, e.y - 2, (e.def.w ?? TILE_SIZE) + 4, (e.def.h ?? TILE_SIZE) + 4);
              ctx.restore();
            }
          }
          if (e.def.hp > 1 && e.hp < e.def.hp) { ctx.fillStyle = 'red'; ctx.fillRect(e.x, e.y - 5, TILE_SIZE * (e.hp / e.def.hp), 3); }
        }
        for (const b of eng.bullets) {
          if (b.bounce) {
            // ファイアボール：オレンジの円
            ctx.fillStyle = b.color ?? '#ff6a00';
            ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.fillStyle = b.color ?? 'yellow';
            ctx.fillRect(b.x, b.y, b.w, b.h);
          }
        }
        // ── 新規粒子の描画 ──
        particlesRef.current.forEach(pt => {
          if (pt.type === 'coin') {
            ctx.save();
            ctx.fillStyle = '#ffd700';
            ctx.strokeStyle = '#d4af37';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.strokeStyle = '#f5c542';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.size * 0.6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          } else {
            ctx.save();
            const alpha = Math.max(0, pt.life / pt.maxLife);
            ctx.fillStyle = `rgba(220, 220, 220, ${alpha * 0.65})`;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.size * (0.4 + 0.6 * alpha), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        });
        // ボムアイテム描画
        if (gameData.engine === 'touhou' && bombPickupsRef.current.length > 0) {
          ctx.font = '14px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          for (const bp of bombPickupsRef.current) {
            ctx.globalAlpha = bp.life < 60 ? bp.life / 60 : 1;
            ctx.fillText('💣', bp.x, bp.y);
          }
          ctx.globalAlpha = 1;
        }
        if (gameData.engine === 'touhou') {
          // ── touhou 弾：色グループ別にまとめて描画（fillStyle 切り替えを最小化） ──
          const byColor = new Map<string, EnemyBullet[]>();
          for (const eb of eng.enemyBullets) {
            let arr = byColor.get(eb.color);
            if (!arr) { arr = []; byColor.set(eb.color, arr); }
            arr.push(eb);
          }
          // パス1：ダイヤモンド本体（色ごとに一括）
          for (const [color, bullets] of byColor) {
            ctx.fillStyle = color;
            ctx.beginPath();
            for (const eb of bullets) {
              const angle = Math.atan2(eb.vy, eb.vx);
              const cos = Math.cos(angle), sin = Math.sin(angle);
              const s = eb.r * 1.1;
              const x1 = s * 1.2, y2 = s * 0.85;
              // 回転済み座標を手動計算（save/restoreなしで高速化）
              ctx.moveTo(eb.x + cos * x1,              eb.y + sin * x1);
              ctx.lineTo(eb.x + sin * (-y2),           eb.y + cos * (-y2));  // (0,-y2) 回転
              ctx.lineTo(eb.x + cos * (-x1),           eb.y + sin * (-x1));
              ctx.lineTo(eb.x - sin * (-y2),           eb.y - cos * (-y2));  // (0,+y2) 回転
              ctx.closePath();
            }
            ctx.fill();
          }
          // パス2：白コアをまとめて一括描画
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath();
          for (const eb of eng.enemyBullets) {
            ctx.moveTo(eb.x + eb.r * 0.35, eb.y);
            ctx.arc(eb.x, eb.y, eb.r * 0.35, 0, Math.PI * 2);
          }
          ctx.fill();
        } else {
          // 非 touhou：色グループ別に一括描画
          const byColor = new Map<string, EnemyBullet[]>();
          for (const eb of eng.enemyBullets) {
            let arr = byColor.get(eb.color);
            if (!arr) { arr = []; byColor.set(eb.color, arr); }
            arr.push(eb);
          }
          for (const [color, bullets] of byColor) {
            ctx.fillStyle = color;
            ctx.beginPath();
            for (const eb of bullets) {
              const shape = (eb as { shape?: string }).shape ?? 'circle';
              if (shape === 'diamond') {
                ctx.moveTo(eb.x, eb.y - eb.r * 1.4);
                ctx.lineTo(eb.x + eb.r, eb.y);
                ctx.lineTo(eb.x, eb.y + eb.r * 1.4);
                ctx.lineTo(eb.x - eb.r, eb.y);
                ctx.closePath();
              } else if (shape === 'oval') {
                ctx.ellipse(eb.x, eb.y, eb.r * 1.6, eb.r * 0.7, 0, 0, Math.PI * 2);
              } else if (shape === 'arrow') {
                const hr = eb.r * 1.2;
                ctx.moveTo(eb.x, eb.y - hr);
                ctx.lineTo(eb.x + hr * 0.6, eb.y + hr * 0.5);
                ctx.lineTo(eb.x - hr * 0.6, eb.y + hr * 0.5);
                ctx.closePath();
              } else {
                ctx.moveTo(eb.x + eb.r, eb.y);
                ctx.arc(eb.x, eb.y, eb.r, 0, Math.PI * 2);
              }
            }
            ctx.fill();
          }
          ctx.fillStyle = 'white';
          ctx.beginPath();
          for (const eb of eng.enemyBullets) { ctx.moveTo(eb.x + eb.r * 0.5, eb.y); ctx.arc(eb.x, eb.y, eb.r * 0.5, 0, Math.PI * 2); }
          ctx.fill();
        }
      } else {
        for (const o of gameData.objects) {
          drawSprite({ emoji: o.emoji, spriteUrl: o.spriteUrl, spriteRef: o.spriteRef }, o.col * TILE_SIZE, (o.row + 1) * TILE_SIZE - (o.h ?? TILE_SIZE), o.w ?? TILE_SIZE, o.h ?? TILE_SIZE, `obj${o.id}`);
          const isSel = o.id === selectedObjIdRef.current;
          ctx.strokeStyle = o.hazard ? 'rgba(255,80,80,0.6)' : 'rgba(80,200,255,0.6)';
          ctx.lineWidth = isSel ? 3 : 1.5;
          const col = isSel ? 'rgba(255,255,0,0.8)' : ctx.strokeStyle;
          ctx.strokeStyle = col;
          ctx.strokeRect(o.col * TILE_SIZE - (isSel ? 1 : 1), o.row * TILE_SIZE - (isSel ? 1 : 1), TILE_SIZE + (isSel ? 2 : 0), TILE_SIZE + (isSel ? 2 : 0));
          if (isSel) {
            ctx.fillStyle = 'rgba(255,255,0,0.15)';
            ctx.fillRect(o.col * TILE_SIZE, o.row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        }
        // プレイヤー初期位置を常時表示（🏁ドラッグで移動可能）
        if (editorTab === 'map') {
          const sx = gameData.player.start.x, sy = gameData.player.start.y;
          ctx.strokeStyle = 'rgba(80,255,140,0.95)'; ctx.lineWidth = 2;
          ctx.strokeRect(sx, sy, gameData.player.w, gameData.player.h);
          ctx.font = '14px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
          ctx.fillText('🏁', sx, sy);
        }
      }

      // ghost players（他プレイヤー・当たり判定なし）
      for (const ghost of ghostPlayersRef.current) {
        const ghostCol = ghost.color ?? colorFromId(ghost.sessionId);
        ctx.globalAlpha = 0.45;
        ctx.font = `${pData.w}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(ghost.emoji, ghost.x + pData.w / 2, ghost.y + pData.h + 4);
        // 名前タグ代わりに色ドット
        ctx.fillStyle = ghostCol; ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.arc(ghost.x + pData.w / 2, ghost.y - 4, 4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // オンラインテストモード：疑似プレイヤー描画
      if (isPlaying && onlineTestModeRef.current) {
        for (const fp of fakePlayersRef.current) {
          const cx = fp.x + pData.w / 2;
          // プレイヤースプライト（プリセットのキャラクターそのもの）
          ctx.globalAlpha = 0.85;
          drawSprite({ emoji: pData.emoji, spriteUrl: pData.spriteUrl, spriteRef: pData.spriteRef }, fp.x, fp.y, pData.w, pData.h, `fake_${fp.sessionId}`);
          // 頭上ネームプレート（色帯＋ID文字）
          const label = fp.sessionId;
          ctx.font = `bold 9px ${getPixelFontFamily()}`;
          const tw = ctx.measureText(label).width;
          const bw = tw + 6, bh = 13;
          const bx = cx - bw / 2, by = fp.y - bh - 6;
          ctx.globalAlpha = 0.88;
          ctx.fillStyle = fp.color;
          ctx.beginPath();
          const r = 3;
          ctx.moveTo(bx + r, by); ctx.lineTo(bx + bw - r, by);
          ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
          ctx.lineTo(bx + bw, by + bh - r);
          ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
          ctx.lineTo(bx + r, by + bh);
          ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
          ctx.lineTo(bx, by + r);
          ctx.quadraticCurveTo(bx, by, bx + r, by);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#fff';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, cx, by + bh / 2);
        }
        ctx.globalAlpha = 1;
      }

      // player
      if (gameData.engine !== 'touhou') {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        const ph = getPlayerHeight();
        ctx.beginPath(); ctx.ellipse(p.x + pData.w / 2, p.y + ph, pData.w / 2, 4, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = gameData.player.color;
      // 死亡中は非表示。無敵中は点滅（action=2f周期でロックマン風、他=4f周期）
      const blinkPeriod = gameData.engine === 'action' ? 2 : 4;
      if (!isPlayerDeadRef.current && !(invulnRef.current > 0 && Math.floor(invulnRef.current / blinkPeriod) % 2 === 0)) {
        let drawH = pData.h;
        if (gameData.id === 'mario') {
          if (marioTransformingRef.current > 0) {
            drawH = Math.floor(marioTransformingRef.current / 4) % 2 === 0 ? 32 : 64;
          } else {
            drawH = marioPowerRef.current === 'small' ? 32 : 64;
          }
        }
        const isStar = starTimerRef.current > 0;
        if (isStar) {
          ctx.save();
          ctx.filter = `hue-rotate(${(performance.now() / 2.0) % 360}deg) brightness(1.25)`;
        }
        drawSprite({ emoji: pData.emoji, spriteUrl: pData.spriteUrl, spriteRef: pData.spriteRef }, p.x, p.y, pData.w, drawH, 'player',
          gameData.engine === 'touhou' ? 'w' : undefined);
        if (isStar) {
          ctx.restore();
        }
        // アイテム取得演出（頭上に一定時間表示、フェードアウト）
        if (itemGetRef.current) {
          const ITEM_GET_DURATION = 1200;
          const elapsed = performance.now() - itemGetRef.current.startTime;
          if (elapsed > ITEM_GET_DURATION) {
            itemGetRef.current = null;
          } else {
            const text = itemGetRef.current.text;
            const alpha = elapsed > ITEM_GET_DURATION - 300 ? Math.max(0, (ITEM_GET_DURATION - elapsed) / 300) : 1;
            const riseY = Math.min(elapsed / 40, 12);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = `bold 11px ${getPixelFontFamily()}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const px = p.x + pData.w / 2;
            const py = p.y - riseY - 4;
            const tw = ctx.measureText(text).width;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(px - tw / 2 - 4, py - 14, tw + 8, 18);
            ctx.fillStyle = '#fff';
            ctx.fillText(text, px, py);
            ctx.restore();
          }
        }
      }
      // 上層レイヤー：木の上部や屋根などプレイヤーより手前に重ねて描画。
      // プレイヤーがその真下付近にいる間は半透明化し、奥のプレイヤーが見えるようにする（gomi.html の drawMapUpper 相当）。
      if (overlayMap) {
        const ptx = Math.floor((p.x + pData.w / 2) / TILE_SIZE);
        const pty = Math.floor((p.y + pData.h) / TILE_SIZE);
        let underOverlay = false;
        for (let dy = -1; dy <= 0 && !underOverlay; dy++) {
          if ((overlayMap[pty + dy]?.[ptx] ?? 0) !== 0) underOverlay = true;
        }
        const targetAlpha = underOverlay ? 0.5 : 1.0;
        overlayAlphaRef.current += (targetAlpha - overlayAlphaRef.current) * 0.15;
        if (Math.abs(overlayAlphaRef.current - targetAlpha) < 0.01) overlayAlphaRef.current = targetAlpha;
        ctx.globalAlpha = overlayAlphaRef.current;
        for (let y = startRow; y < endRow; y++) {
          for (let x = startCol; x < endCol; x++) {
            const tileId = overlayMap[y]?.[x] ?? 0;
            const info = gameData.tiles[tileId];
            if (tileId !== 0 && info) drawTileCell(x, y, tileId, info);
          }
        }
        ctx.globalAlpha = 1;
      }
      // NPCセリフ（フキダシではなく頭上に1文字ずつ表示）。全スプライトより前面に出すため描画の最後で行う
      if (isPlaying && npcTalkRef.current) {
        const { entity: e, text, startTime, wrapped } = npcTalkRef.current;
        const shown = Math.min(text.length, Math.floor((performance.now() - startTime) / 50));
        if (shown > 0) {
          ctx.font = `bold 11px ${getPixelFontFamily()}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          
          const wrappedDisplay: string[] = [];
          if (wrapped) {
            let charsLeft = shown;
            for (const line of wrapped) {
              if (charsLeft <= 0) break;
              if (charsLeft >= line.length) {
                wrappedDisplay.push(line);
                charsLeft -= line.length;
              } else {
                wrappedDisplay.push(line.slice(0, charsLeft));
                charsLeft = 0;
              }
            }
          } else {
            const display = text.slice(0, shown);
            wrappedDisplay.push(...wrapWithKinsoku(ctx, display, Math.min(PLAY_W - 16, 220)));
          }

          const lineHeight = 14;
          const tw = Math.max(...wrappedDisplay.map(l => ctx.measureText(l).width));
          let px = e.x + (e.def.w ?? TILE_SIZE) / 2;
          px = Math.max(tw / 2 + 4, Math.min(PLAY_W - tw / 2 - 4, px));
          const boxBottom = e.y - 8;
          const boxHeight = wrappedDisplay.length * lineHeight + 6;
          const boxTop = boxBottom - boxHeight;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(px - tw / 2 - 4, boxTop, tw + 8, boxHeight);
          ctx.fillStyle = '#fff';
          wrappedDisplay.forEach((l, i) => {
            ctx.fillText(l, px, boxBottom - (wrappedDisplay.length - 1 - i) * lineHeight);
          });
        }
      }
      // onjReze：近接攻撃の描画（振っている間だけ向きに合わせて表示）
      if (gameData.engine === 'onjReze' && isPlaying && swordRef.current.active > 0) {
        const sw = swordRef.current; const reach = 26;
        let hx: number, hy: number, hw: number, hh: number;
        if (sw.dir.x !== 0) { hw = reach; hh = pData.h; hy = p.y; hx = sw.dir.x > 0 ? p.x + pData.w : p.x - reach; }
        else { hw = pData.w; hh = reach; hx = p.x; hy = sw.dir.y > 0 ? p.y + pData.h : p.y - reach; }
        ensureImage(SWORD_SPRITE_URL);
        const swordImg = imgCache.current.get(SWORD_SPRITE_URL);
        const cx = hx + hw / 2, cy = hy + hh / 2;
        if (swordImg && swordImg.complete && swordImg.naturalWidth > 0) {
          const srcImg = keyedCache.current.get(SWORD_SPRITE_URL) ?? swordImg;
          // 素材は右向きが基準。sw.dir に合わせて回転させる（右向き基準なので補正不要）。
          const angle = Math.atan2(sw.dir.y, sw.dir.x);
          const size = Math.max(hw, hh, TILE_SIZE);
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(angle);
          ctx.drawImage(srcImg, -size / 2, -size / 2, size, size);
          ctx.restore();
        } else {
          ctx.font = '18px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('⚔️', cx, cy);
        }
      }
      // onjReze：ボム・飛行ボム・爆発の描画（原作 onj-reze.html の見た目を移植）
      if (gameData.engine === 'onjReze') {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        // レゼが投げる爆弾は自身のスプライト上半分を切り離したものとして描く（それ以外は従来の絵文字）
        const drawBombVisual = (url: string | undefined, cx: number, cy: number, fallback: string) => {
          if (url) {
            ensureImage(url);
            const img = imgCache.current.get(url);
            if (img && img.complete && img.naturalWidth > 0) {
              let std = walkStdCache.get(url);
              if (!std) { std = detectStandard(img.naturalWidth, img.naturalHeight); walkStdCache.set(url, std); }
              const cell = animatedCell(std, img.naturalWidth, img.naturalHeight, { dir: 's', moving: false, timeSec: 0, fps: 7 });
              const srcImg = keyedCache.current.get(url) ?? img;
              const destW = TILE_SIZE, destH = TILE_SIZE / 2;
              ctx.drawImage(srcImg, cell.sx, cell.sy, cell.sw, cell.sh / 2, cx - destW / 2, cy - destH / 2, destW, destH);
              return;
            }
          }
          ctx.font = '18px Arial';
          ctx.fillText(fallback, cx, cy);
        };
        // 飛行中（放物線アーク + 影）
        for (const fb of onjFliesRef.current) {
          const pr = fb.t / fb.dur;
          const cx = fb.fx + (fb.tx - fb.fx) * pr, cy = fb.fy + (fb.ty - fb.fy) * pr;
          const arc = -Math.sin(pr * Math.PI) * 26;
          ctx.globalAlpha = 0.3; ctx.fillStyle = '#000';
          ctx.beginPath(); ctx.ellipse(cx, cy, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          drawBombVisual(fb.srcUrl, cx, cy + arc, fb.head ? '💀' : '💣');
        }
        // 着地済みボム（揺れ + 火花 + 残り1秒で赤光）
        for (const bm of onjBombsRef.current) {
          const pr = 1 - bm.fuse / bm.maxFuse; // 0→1
          const shake = pr > 0.7 ? (pr - 0.7) / 0.3 * 4 : pr > 0.4 ? (pr - 0.4) / 0.3 * 2 : 0;
          const ox = (Math.random() - 0.5) * shake * 2, oy = (Math.random() - 0.5) * shake * 2;
          if (bm.fuse < 60) {
            ctx.globalAlpha = 0.3 * (1 - bm.fuse / 60) * ((Math.sin(bm.fuse * 1.2) + 1) / 2);
            ctx.fillStyle = '#f00'; ctx.beginPath(); ctx.arc(bm.x, bm.y, 18, 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
          drawBombVisual(bm.srcUrl, bm.x + ox, bm.y + oy, bm.head ? '💀' : '💣');
          if (pr > 0.2) {
            const sparks = Math.floor(pr * 8);
            for (let s = 0; s < sparks; s++) {
              const a = Math.random() * Math.PI * 2, r = (5 + Math.random() * 4 * pr);
              ctx.fillStyle = s % 2 ? '#ff0' : '#f80';
              ctx.globalAlpha = 0.5 + Math.random() * 0.5;
              ctx.fillRect(bm.x + Math.cos(a) * r, bm.y + Math.sin(a) * r - 10, 2, 2);
            }
          }
        }
        // 爆発（拡がる火球 + 外周リング）
        for (const bl of onjBlastsRef.current) {
          const pr = 1 - bl.life / bl.maxLife; // 0→1
          const rad = bl.r * (0.4 + pr * 0.8);
          ctx.globalAlpha = pr > 0.7 ? 1 - (pr - 0.7) / 0.3 : 0.9;
          const g = ctx.createRadialGradient(bl.x, bl.y, 0, bl.x, bl.y, rad);
          g.addColorStop(0, '#fff6c0'); g.addColorStop(0.4, '#ff9d2a'); g.addColorStop(1, 'rgba(229,62,62,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bl.x, bl.y, rad, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = (1 - pr) * 0.8; ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(bl.x, bl.y, rad, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      if (gameData.engine === 'touhou' && isPlaying) {
        const cx = p.x + pData.w / 2, cy = p.y + pData.h / 2;
        const isSlow2 = engineRef.current.keys.has('Shift') || touchRef.current.slow;
        // グレイズ発光リング
        if (grazeFlashRef.current > 0) {
          const t = grazeFlashRef.current / 8;
          ctx.strokeStyle = `rgba(255,220,80,${t * 0.9})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cx, cy, 16 + (1 - t) * 6, 0, Math.PI * 2); ctx.stroke();
        }
        if (isSlow2) {
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke();
          // 当たり判定（赤点）：低速時のみ表示
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'red'; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }

      ctx.restore();

      // ── シーン間フェード遷移（土管・扉）──────────────────────────────────
      const fade = sceneFadeRef.current;
      if (fade) {
        fade.frame++;
        const alpha = fade.phase === 'out'
          ? fade.frame / fade.totalFrames
          : 1 - fade.frame / fade.totalFrames;
        ctx.fillStyle = `rgba(0,0,0,${Math.min(1, alpha)})`;
        ctx.fillRect(0, 0, PLAY_W, PLAY_H);
        // フェードアウト完了 → シーン切り替え → フェードイン開始
        if (fade.phase === 'out' && fade.frame >= fade.totalFrames) {
          const nextIdx = scenesRef.current.findIndex(s => s.id === fade.nextSceneId);
          if (nextIdx >= 0) {
            const next = scenesRef.current[nextIdx];
            activeSceneIdxRef.current = nextIdx;
            eng.map = JSON.parse(JSON.stringify(next.map));
            eng.entities = next.objects.map(o => ({
              x: o.col * TILE_SIZE, y: (o.row + 1) * TILE_SIZE - (o.h ?? TILE_SIZE),
              homeX: o.col * TILE_SIZE, homeY: (o.row + 1) * TILE_SIZE - (o.h ?? TILE_SIZE),
              vx: 0, vy: 0, hp: o.hp, timer: 0, talked: false,
              def: o,
            })) as unknown as Entity[];
            eng.bullets = []; eng.enemyBullets = [];
            encounterGaugeRef.current = 0; encounterNextRef.current = 0;
            eng.player.x = fade.entryX; eng.player.y = fade.entryY;
            eng.player.vx = 0; eng.player.vy = 0;
            // 入場地点付近に別のワープがあっても即座に巻き戻らないよう、離れるまで発動を抑制する
            warpCooldownRef.current = { x: fade.entryX + pData.w / 2, y: fade.entryY + pData.h / 2 };
            if (gameData.id === 'mario') {
              marioPipeRef.current = {
                phase: 'exiting',
                x: fade.entryX,
                startY: fade.entryY + 32,
                targetY: fade.entryY,
                progress: 0,
                maxProgress: 30
              };
              eng.player.y = fade.entryY + 32;
            }
            justStartedRef.current = true; // 2マスキャラ等のワープ先埋まり防止イジェクトを再実行
            resetSceneState();
            setEditSceneIdx(nextIdx);
            // シーン別BGM切り替え
            switchBgm(getCurrentFieldBgm());
          }
          sceneFadeRef.current = { ...fade, phase: 'in', frame: 0 };
        }
        // フェードイン完了 → 解除
        if (fade.phase === 'in' && fade.frame >= fade.totalFrames) {
          sceneFadeRef.current = null;
        }
      }

      // ── ロックマン風スライド遷移（部屋遷移）の更新 ──
      const trans = sceneTransRef.current;
      if (trans) {
        trans.frame++;
        const ratio = trans.frame / TRANS_FRAMES;
        // プレイヤー位置を線形補間
        p.x = trans.startX + (trans.endX - trans.startX) * ratio;
        p.y = trans.startY + (trans.endY - trans.startY) * ratio;

        // 遷移完了処理
        if (trans.frame >= TRANS_FRAMES) {
          const nextIdx = trans.nextIdx;
          const nextScene = scenesRef.current[nextIdx];
          const layout = worldLayoutRef.current;
          const nextLayout = layout?.layouts.find(l => l.sceneIdx === nextIdx);

          if (nextScene && nextLayout) {
            activeSceneIdxRef.current = nextIdx;

            // エンティティを次のシーンのものに置き換え
            engineRef.current.entities = nextScene.objects.map(o => ({
              x: (nextLayout.originX + o.col) * TILE_SIZE,
              y: (nextLayout.originY + o.row) * TILE_SIZE,
              homeX: (nextLayout.originX + o.col) * TILE_SIZE,
              homeY: (nextLayout.originY + o.row) * TILE_SIZE,
              vx: 0, vy: 0, hp: o.hp, timer: 0, talked: false,
              def: o,
            })) as unknown as Entity[];

            engineRef.current.bullets = [];
            engineRef.current.enemyBullets = [];
            encounterGaugeRef.current = 0;
            encounterNextRef.current = 0;

            // プレイヤー位置確定
            p.x = trans.entryX;
            p.y = trans.entryY;
            p.vx = 0;
            p.vy = 0;

            resetSceneState();
            setEditSceneIdx(nextIdx);
            // シーン別BGM切り替え
            switchBgm(getCurrentFieldBgm());
          }
          sceneTransRef.current = null;
        }
      }

      // ── touhou フェーズ HUD ──
      if (isPlaying && gameData.engine === 'touhou' && phaseIndexRef.current >= 0) {
        const phases = gameData.phases;
        const curPhase = phases?.[phaseIndexRef.current];
        const label = curPhase?.label ?? '道中';
        const remaining = eng.entities.filter(e => !e.def.isBoss).length + eng.entities.filter(e => !!e.def.isBoss).length;
        const text = curPhase?.kind === 'boss'
          ? label
          : `${label}  敵 ×${eng.entities.length}`;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(PLAY_W - 110, 8, 102, 18);
        ctx.fillStyle = curPhase?.kind === 'boss' ? '#ff9940' : '#ffd84d';
        ctx.font = `bold 11px ${getPixelFontFamily()}`;
        ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(text, PLAY_W - 8, 22);
        void remaining;
      }

      // ── touhou スコア HUD ──
      if (isPlaying && gameData.engine === 'touhou') {
        const sc = scoreRef.current;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(PLAY_W - 130, PLAY_H - 26, 122, 20);
        ctx.font = `bold 12px ${getPixelFontFamily()}`;
        ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#ffd84d';
        ctx.fillText(`SCORE  ${sc.toLocaleString()}`, PLAY_W - 8, PLAY_H - 10);
      }
      // ── touhou グレイズ HUD ──
      if (isPlaying && gameData.engine === 'touhou') {
        const gz = grazeRef.current;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(PLAY_W - 130, PLAY_H - 50, 122, 20);
        ctx.font = `bold 11px ${getPixelFontFamily()}`;
        ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = gz > 0 ? '#fde68a' : '#666';
        ctx.fillText(`GRAZE  ${gz}`, PLAY_W - 8, PLAY_H - 34);
      }

      // ── touhou 残機 HUD ──
      if (isPlaying && gameData.engine === 'touhou') {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(8, PLAY_H - 26, 90, 20);
        ctx.font = `bold 13px ${getPixelFontFamily()}`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        const lives = livesRef.current;
        const hearts = '❤'.repeat(Math.max(0, lives));
        ctx.fillStyle = lives > 1 ? '#ff6b8a' : '#ff3333';
        ctx.fillText(hearts || '×0', 12, PLAY_H - 10);
      }
      // ── touhou ボム数 HUD ──
      if (isPlaying && gameData.engine === 'touhou') {
        const bc = bombCountRef.current;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(8, PLAY_H - 50, 100, 20);
        ctx.font = `bold 12px ${getPixelFontFamily()}`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = bc > 0 ? '#c4b5fd' : '#555';
        ctx.fillText('💣 ×' + bc, 12, PLAY_H - 34);
      }

      // ── touhou ボスHPバー（touhou.html スタイル） ──
      if (isPlaying && gameData.engine === 'touhou') {
        const boss = eng.entities.find(e => e.def.isBoss);
        if (boss && boss.def.hp > 1) {
          const barX = 10, barY = 8, barW = PLAY_W - 20, barH = 10;
          const pct = Math.max(0, boss.hp / boss.def.hp);
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(barX, barY, barW, barH);
          const grd = ctx.createLinearGradient(barX, 0, barX + barW, 0);
          grd.addColorStop(0, '#5bd1ff'); grd.addColorStop(1, '#7a8cff');
          ctx.fillStyle = grd;
          ctx.fillRect(barX, barY, barW * pct, barH);
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 1;
          ctx.strokeRect(barX, barY, barW, barH);
          // スペル名
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fillRect(barX, barY + barH + 2, 200, 14);
          ctx.fillStyle = activeSpellCardNameRef.current ? '#ffaa44' : '#5bd1ff';
          ctx.font = `bold 10px ${getPixelFontFamily()}`;
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          ctx.fillText(activeSpellCardNameRef.current ?? boss.def.name ?? boss.def.emoji, barX + 4, barY + barH + 12);
        }
      }

      // ── action ボスHPバー ──
      if (isPlaying && gameData.engine === 'action') {
        const boss = eng.entities.find(e => e.def.isBoss);
        if (boss && boss.def.hp > 1) {
          const barX = 10, barY = 8, barW = PLAY_W - 20, barH = 10;
          const pct = Math.max(0, boss.hp / boss.def.hp);
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(barX, barY, barW, barH);
          const grd2 = ctx.createLinearGradient(barX, 0, barX + barW, 0);
          grd2.addColorStop(0, '#ff4444'); grd2.addColorStop(1, '#ff8844');
          ctx.fillStyle = grd2;
          ctx.fillRect(barX, barY, barW * pct, barH);
          ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
          ctx.strokeRect(barX, barY, barW, barH);
          ctx.fillStyle = '#ff8888'; ctx.font = `bold 10px ${getPixelFontFamily()}`;
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          ctx.fillText(`BOSS: ${boss.def.name ?? boss.def.emoji}`, barX + 4, barY + barH + 12);
        }
      }

      // ── 戦闘プレイヤーHUD（Lv / HP / MP）──
      if (isPlaying && gameData.engine === 'rpg' && gameData.battle) {
        const pr = progressRef.current;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(6, 6, 150, 68);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(6, 6, 150, 68);
        ctx.fillStyle = '#fff'; ctx.font = `bold 12px ${getPixelFontFamily()}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(`Lv ${pr.level}  ${gameData.battle.playerName}`, 12, 22);
        ctx.fillText(`HP ${Math.max(0, pr.hp)}/${pr.maxHp}`, 12, 38);
        ctx.fillStyle = '#7fd0ff'; ctx.fillText(`MP ${pr.mp}/${pr.maxMp}`, 12, 52);
        ctx.fillStyle = '#fde68a'; ctx.fillText(`G: ${pr.gold ?? 0}`, 12, 66);
      }

      // ── action 武器エネルギーゲージ ──
      if (isPlaying && gameData.engine === 'action' && actionWeaponsRef.current.length > 1) {
        const wIdx = actionWeaponIdxRef.current;
        const wId = actionWeaponsRef.current[wIdx];
        const en = actionWeaponEnergyRef.current[wId] ?? MAX_WEAPON_ENERGY;
        const segH = 4, segW = 12, segGap = 1;
        const segs = MAX_WEAPON_ENERGY;
        const filled = en;
        const gaugeH = segs * (segH + segGap);
        const gx2 = 28, gy2 = VIEW_H / 2 - gaugeH / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(gx2 - 2, gy2 - 2, segW + 4, gaugeH + 4);
        for (let i = 0; i < segs; i++) {
          const sy = gy2 + (segs - 1 - i) * (segH + segGap);
          ctx.fillStyle = i < filled ? '#ff8800' : '#2a1a00';
          ctx.fillRect(gx2, sy, segW, segH);
        }
        const wItem = (gameDataRef.current.items ?? []).find(it => it.id === wId);
        ctx.fillStyle = '#ffaa44'; ctx.font = `bold 8px ${getPixelFontFamily()}`; ctx.textAlign = 'left';
        ctx.fillText(wItem?.emoji ?? wId.slice(0, 3), gx2, gy2 - 6);
      }

      // ── action ライフゲージ（ロックマン風縦型） ──
      if (isPlaying && gameData.engine === 'action') {
        const z = onjRezeHpRef.current;
        const segH = 4, segW = 12, segGap = 1;
        const segs = z.max;
        const filled = z.hp;
        const gaugeH = segs * (segH + segGap);
        const gx = 10, gy = VIEW_H / 2 - gaugeH / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(gx - 2, gy - 2, segW + 4, gaugeH + 4);
        for (let i = 0; i < segs; i++) {
          const sy = gy + (segs - 1 - i) * (segH + segGap);
          ctx.fillStyle = i < filled ? '#28c8ff' : '#1a3a4a';
          ctx.fillRect(gx, sy, segW, segH);
        }
        // マリオ：コイン枚数＋パワー状態＋スター残り
        if (gameData.id === 'mario') {
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.font = 'bold 14px Arial';
          ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(6, 6, 150, 24);
          ctx.fillStyle = '#ffd700';
          ctx.fillText(`🪙×${coinsRef.current}`, 12, 10);
          const powerLabel = marioPowerRef.current === 'fire' ? '🔥ファイア' : '⭐スーパー';
          ctx.fillStyle = marioPowerRef.current === 'fire' ? '#ff8a3c' : '#7fd4ff';
          ctx.fillText(powerLabel, 74, 10);
          if (starTimerRef.current > 0 && Math.floor(starTimerRef.current / 6) % 2 === 0) {
            ctx.fillStyle = '#fff59d';
            ctx.fillRect(6, 32, Math.max(0, (starTimerRef.current / STAR_DURATION) * 150), 4); // 無敵ゲージ
          }
        }
      }

      // ── onjReze ハートHUD ──
      if (isPlaying && gameData.engine === 'onjReze') {
        const z = onjRezeHpRef.current;
        const maxH = Math.ceil(z.max / 2);
        const full = Math.floor(z.hp / 2);
        const half = z.hp % 2 === 1;
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(6, 6, maxH * 20 + 12, 28);
        ctx.font = '16px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        for (let i = 0; i < maxH; i++) {
          const hc = i < full ? '❤️' : (i === full && half ? '💗' : '🤍');
          ctx.fillText(hc, 12 + i * 20, 21);
        }

      }

      // 編集モードでのリアルタイム座標表示更新（右上のDOMを直接書き換え）
      if (!isPlaying && editorCoordRef.current) {
        const curX = p.x;
        const curY = p.y;
        const curW = pData.w;
        const curH = pData.h;
        const startX = gameData.player.start.x;
        const startY = gameData.player.start.y;

        const curGridX = Math.floor(curX / TILE_SIZE);
        const curGridY = Math.floor((curY + curH - TILE_SIZE) / TILE_SIZE);
        const startGridX = Math.floor(startX / TILE_SIZE);
        const startGridY = Math.floor((startY + curH - TILE_SIZE) / TILE_SIZE);

        editorCoordRef.current.innerHTML = `
          <div class="flex items-center justify-end gap-1.5">
            <span class="text-blue-400 font-bold">👤</span>
            <span class="font-semibold text-white">(${curGridX}, ${curGridY})</span>
            <span class="text-[9px] text-gray-400">px: (${Math.round(curX)}, ${Math.round(curY)})</span>
          </div>
          <div class="flex items-center justify-end gap-1.5 opacity-80">
            <span class="text-emerald-400 font-bold">🏁</span>
            <span class="font-semibold text-white">(${startGridX}, ${startGridY})</span>
            <span class="text-[9px] text-gray-400">px: (${Math.round(startX)}, ${Math.round(startY)})</span>
          </div>
        `;
      }

      eng.animId = requestAnimationFrame(loop);
    };

    const id = requestAnimationFrame(loop);
    engineRef.current.animId = id;
    return () => { cancelAnimationFrame(engineRef.current.animId); cancelAnimationFrame(id); window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [gameData, isPlaying, restart, editorTab, editSpeedMult]);

  // touch state via ref to avoid re-running the loop effect
  const touchRef = useRef({ up: false, down: false, left: false, right: false, action: false, slow: false, bomb: false, shoot: false, select: false });
  const prevActionRef = useRef(false);
  const prevZRef = useRef(false);
  const prevXRef = useRef(false);
  const prevBombRef = useRef(false);
  const [, force] = useState(0);
  const setTouch = (key: keyof typeof touchRef.current, v: boolean) => { touchRef.current[key] = v; force(n => n + 1); };

  // Canvas tap: select object (object tab) or paint tile (map tab)
  const handleCanvasAction = (e: React.MouseEvent | React.TouchEvent) => {
    if (isPlaying) return;
    let clientX: number, clientY: number;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX; clientY = e.touches[0].clientY;
      if (e.cancelable) e.preventDefault();
    } else { const me = e as React.MouseEvent; clientX = me.clientX; clientY = me.clientY; }
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // canvas px → world px（SCALE_X/SCALE_Y でズームしているため逆変換）
    const x = (clientX - rect.left) * (canvas.width / rect.width) / SCALE_X;
    const y = (clientY - rect.top) * (canvas.height / rect.height) / SCALE_Y;
    // gameData.scroll はプリセット全体の既定値でシーンごとに更新されないため、当たり判定の境界は
    // 現在編集中の実際の map(=switchEditScene で書き戻される gameData.map) の実寸を優先する。
    const worldCols = gameData.map[0]?.length ?? gameData.scroll?.worldCols ?? COLS;
    const worldRows = gameData.map.length ?? gameData.scroll?.worldRows ?? ROWS;
    // camera follows player in edit mode now
    const camX = Math.max(0, Math.min(worldCols * TILE_SIZE - VIEW_W,
      engineRef.current.player.x !== gameData.player.start.x
        ? engineRef.current.player.x + gameData.player.w / 2 - VIEW_W / 2
        : editScrollRef.current));
    const camY = Math.max(0, Math.min(worldRows * TILE_SIZE - VIEW_H,
      engineRef.current.player.y !== gameData.player.start.y
        ? engineRef.current.player.y + gameData.player.h / 2 - VIEW_H / 2
        : editScrollYRef.current));
    const col = Math.floor((x + camX) / TILE_SIZE); const row = Math.floor((y + camY) / TILE_SIZE);
    if (col < 0 || col >= worldCols || row < 0 || row >= worldRows) return;

    if (editorTab === 'map') {
      // 🏁マーカー付近クリック → 初期位置ドラッグ開始
      const startCol = Math.floor(gameData.player.start.x / TILE_SIZE);
      const startRow = Math.floor((gameData.player.start.y + gameData.player.h - TILE_SIZE) / TILE_SIZE);
      const isPointerDown = ('buttons' in e ? (e as React.MouseEvent).buttons === 1 : true);
      if (isPointerDown && !isDraggingStartRef.current && Math.abs(col - startCol) <= 1 && Math.abs(row - startRow) <= 1) {
        isDraggingStartRef.current = true;
      }
      if (isDraggingStartRef.current) {
        const sx = col * TILE_SIZE, sy = row * TILE_SIZE + TILE_SIZE - gameData.player.h;
        setGameData(prev => ({ ...prev, player: { ...prev.player, start: { x: sx, y: sy } } }));
        engineRef.current.player = { x: sx, y: sy, vx: 0, vy: 0, isGrounded: false };
        setEditScroll(Math.max(0, Math.min(worldCols * TILE_SIZE - VIEW_W, sx + gameData.player.w / 2 - VIEW_W / 2)));
        setEditScrollY(Math.max(0, Math.min(worldRows * TILE_SIZE - VIEW_H, sy + gameData.player.h / 2 - VIEW_H / 2)));
        return;
      }
      if (editMapLayer === 'overlay') {
        setGameData(prev => {
          const newOverlay = (prev.overlayMap ?? emptyGridLike(prev.map)).map(r => [...r]);
          newOverlay[row][col] = selectedTileId;
          return { ...prev, overlayMap: newOverlay };
        });
      } else {
        setGameData(prev => {
          const newMap = prev.map.map(r => [...r]);
          newMap[row][col] = selectedTileId;
          engineRef.current.map = newMap;
          return { ...prev, map: newMap };
        });
      }
    } else if (editorTab === 'object') {
      const found = gameData.objects.find(o => o.col === col && o.row === row);
      setSelectedObjId(found?.id ?? null);
    }
  };

  const padProps = (key: keyof typeof touchRef.current) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); setTouch(key, true); },
    onPointerUp: (e: React.PointerEvent) => { e.preventDefault(); setTouch(key, false); },
    onPointerLeave: (e: React.PointerEvent) => { e.preventDefault(); setTouch(key, false); },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  // ── 8方向バーチャルパッド（プレイ用） ──────────────────────────────────
  // 1枚のパッドでポインタ位置から方向を量子化する。斜め入力（東方の斜め避け・
  // アクションの走りながら方向転換）と、指を離さずスライドでの方向転換に対応。
  const dpadRef = useRef<HTMLDivElement | null>(null);
  const dpadPointerRef = useRef<number | null>(null);
  const clearDpad = () => {
    const t = touchRef.current;
    if (t.up || t.down || t.left || t.right) { t.up = t.down = t.left = t.right = false; force(n => n + 1); }
  };
  const applyDpad = (clientX: number, clientY: number) => {
    const el = dpadRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    const t = touchRef.current;
    const prev = `${t.up}${t.down}${t.left}${t.right}`;
    t.up = t.down = t.left = t.right = false;
    if (Math.hypot(dx, dy) >= r.width * 0.12) {  // 中央12%はデッドゾーン
      // 8方向量子化（45°の扇形。0=右, 時計回り）
      const oct = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
      if (oct === -1 || oct === 0 || oct === 1) t.right = true;
      if (oct === 1 || oct === 2 || oct === 3) t.down = true;
      if (oct === 3 || oct === 4 || oct === -4 || oct === -3) t.left = true;
      if (oct === -3 || oct === -2 || oct === -1) t.up = true;
    }
    if (prev !== `${t.up}${t.down}${t.left}${t.right}`) force(n => n + 1);
  };
  const dpadProps = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      dpadPointerRef.current = e.pointerId;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      applyDpad(e.clientX, e.clientY);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (dpadPointerRef.current === e.pointerId) applyDpad(e.clientX, e.clientY);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      if (dpadPointerRef.current === e.pointerId) { dpadPointerRef.current = null; clearDpad(); }
    },
    onPointerCancel: (e: React.PointerEvent) => {
      if (dpadPointerRef.current === e.pointerId) { dpadPointerRef.current = null; clearDpad(); }
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  const applyPick = (res: PickResult) => {
    const target = picker?.target;
    setPicker(null);
    if (!target) return;
    const bgmLike = () => {
      const type = res.ref.startsWith('mml:') ? 'mml' as const : res.ref.startsWith('direct:') ? 'direct' as const : 'youtube' as const;
      const src = type === 'mml' ? (res.rawMml || res.ref.replace(/^mml:/, '')) : type === 'direct' ? res.ref.replace(/^direct:/, '') : res.url;
      return { ref: res.ref, src, type };
    };
    if (target.t === 'player') setGameData(p => ({ ...p, player: { ...p.player, spriteRef: res.ref, spriteUrl: res.url } }));
    else if (target.t === 'selObjSprite') { if (selectedObjId) setGameData(p => ({ ...p, objects: p.objects.map(o => o.id === selectedObjId ? { ...o, spriteRef: res.ref, spriteUrl: res.url } : o) })); }
    else if (target.t === 'mapBg') { ensureImage(res.url); setGameData(p => ({ ...p, mapBgRef: res.ref, mapBgUrl: res.url })); }
    else if (target.t === 'objsprite') setObjTemplate(o => ({ ...o, spriteRef: res.ref, spriteUrl: res.url }));
    else if (target.t === 'bgm') setGameData(p => ({ ...p, bgm: bgmLike() }));
    else if (target.t === 'battleBgm') setGameData(p => ({ ...p, battleBgm: bgmLike() }));
    else if (target.t === 'bossBgm') setGameData(p => ({ ...p, bossBgm: bgmLike() }));
    else if (target.t === 'sfx') setGameData(p => ({ ...p, sfx: { ...p.sfx, [target.trigger]: bgmLike() } }));
    else if (target.t === 'tile') setGameData(p => ({ ...p, tiles: { ...p.tiles, [target.id]: { ...p.tiles[target.id], imageRef: res.ref, imageUrl: res.url } } }));
    else if (target.t === 'titleBg') { ensureImage(res.url); setGameData(p => p.titleScreen ? ({ ...p, titleScreen: { ...p.titleScreen, bgRef: res.ref, bgUrl: res.url } }) : p); }
    else if (target.t === 'endingBg') { ensureImage(res.url); setGameData(p => p.ending ? ({ ...p, ending: { ...p.ending, bgRef: res.ref, bgUrl: res.url } }) : p); }
    else if (target.t === 'titleBgm') setGameData(p => p.titleScreen ? ({ ...p, titleScreen: { ...p.titleScreen, bgmRef: bgmLike().ref } }) : p);
    else if (target.t === 'endingBgm') setGameData(p => p.ending ? ({ ...p, ending: { ...p.ending, bgmRef: bgmLike().ref } }) : p);
    else if (target.t === 'sceneBgm') setGameData(p => ({ ...p, scenes: p.scenes?.map((s, i) => i === target.idx ? { ...s, bgm: bgmLike() } : s) }));
    else if (target.t === 'yumeTex') {
      setGameData(p => {
        if (!p.layout25d) return p;
        const textures = { ...p.layout25d.textures };
        if (textures[target.id]) {
          textures[target.id] = { ...textures[target.id], imageRef: res.ref, imageUrl: res.url };
        }
        return { ...p, layout25d: { ...p.layout25d, textures } };
      });
    }
  };

  const addTile = () => {
    setGameData(p => {
      const ids = Object.keys(p.tiles).map(Number);
      const id = Math.max(...ids) + 1;
      return { ...p, tiles: { ...p.tiles, [id]: { name: `タイル${id}`, color: '#888888', passable: false } } };
    });
  };
  const updateTile = (id: number, patch: Partial<TileDef>) =>
    setGameData(p => ({ ...p, tiles: { ...p.tiles, [id]: { ...p.tiles[id], ...patch } } }));
  const deleteTile = (id: number) => {
    if (id === 0) return;
    setGameData(p => {
      const tiles = { ...p.tiles }; delete tiles[id];
      const map = p.map.map(r => r.map(c => (c === id ? 0 : c)));
      return { ...p, tiles, map };
    });
    if (selectedTileId === id) setSelectedTileId(0);
  };

  const buildManifest = (): GameManifestDraft => ({
    preset: gameData.id, engine: gameData.engine, name: title.trim() || gameData.name,
    gravity: gameData.gravity, friction: gameData.friction,
    player: {
      emoji: gameData.player.emoji, color: gameData.player.color, speed: gameData.player.speed,
      jumpPower: gameData.player.jumpPower, w: gameData.player.w, h: gameData.player.h,
      start: gameData.player.start, spriteRef: gameData.player.spriteRef,
      bombCount: gameData.player.bombCount,
      bombSpellName: gameData.player.bombSpellName,
      bombCutinCharName: gameData.player.bombCutinCharName,
      bombCutinImageUrl: gameData.player.bombCutinImageUrl,
      bombCutinImageX: gameData.player.bombCutinImageX,
      bombCutinImageY: gameData.player.bombCutinImageY,
      bombCutinScale: gameData.player.bombCutinScale,
    },
    tiles: Object.fromEntries(Object.entries(gameData.tiles).map(([k, t]) => [k, {
      name: t.name, color: t.color, passable: t.passable, special: t.special, imageRef: t.imageRef,
    }])),
    map: gameData.map,
    overlayMap: gameData.overlayMap,
    objects: gameData.objects.map(({ spriteUrl, ...o }) => o),
    mapBgRef: gameData.mapBgRef,
    scroll: gameData.scroll,
    bgm: gameData.bgm?.ref || 'none',
    battleBgm: gameData.battleBgm?.ref,
    bossBgm: gameData.bossBgm?.ref,
    sfx: Object.fromEntries(Object.entries(gameData.sfx).map(([k, v]) => [k, v?.ref])) as Partial<Record<SfxTrigger, string>>,
    switches: gameData.switches,
    items: gameData.items,
    phases: gameData.phases,
    titleScreen: gameData.titleScreen ? (({ bgUrl: _u, ...t }) => t)(gameData.titleScreen) : undefined,
    ending: gameData.ending ? (({ bgUrl: _u, ...e }) => e)(gameData.ending) : undefined,
    battle: gameData.battle,
    layout25d: gameData.layout25d,
    scenes: gameData.scenes?.map(s => ({
      id: s.id, name: s.name, exits: s.exits,
      map: s.map,
      overlayMap: s.overlayMap,
      objects: s.objects.map(({ spriteUrl, ...o }) => o),
      bgm: s.bgm?.ref,
      randomEncounters: s.randomEncounters,
      encounterRate: s.encounterRate,
    })),
  });

  const handleSave = () => onSave?.(buildManifest(), { title: title.trim() || gameData.name, preset: gameData.id });

  const handleExport = () => {
    const json = JSON.stringify(buildManifest(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${(title.trim() || gameData.name).replace(/\s+/g, '_')}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const importFileRef = useRef<HTMLInputElement>(null);
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const manifest = JSON.parse(ev.target?.result as string) as GameManifestDraft;
        const preset = PRESETS[manifest.preset] ? manifest.preset : 'dq';
        const base = clone(PRESETS[preset]);
        const data: PresetData = {
          ...base,
          engine: manifest.engine,
          name: manifest.name,
          gravity: manifest.gravity,
          friction: manifest.friction,
          player: { ...base.player, ...manifest.player, spriteUrl: hydrateUrlFromRef(manifest.player.spriteRef) },
          tiles: Object.fromEntries(
            Object.entries(manifest.tiles).map(([k, t]) => [k, { ...t, imageUrl: hydrateUrlFromRef(t.imageRef) }])
          ),
          map: manifest.map,
          overlayMap: manifest.overlayMap ?? emptyGridLike(manifest.map),
          objects: manifest.objects.map(o => ({ ...o, spriteUrl: hydrateUrlFromRef(o.spriteRef) })),
          mapBgRef: manifest.mapBgRef,
          mapBgUrl: undefined,
          scroll: manifest.scroll ?? base.scroll,
          phases: manifest.phases ?? base.phases,
          titleScreen: manifest.titleScreen ?? base.titleScreen,
          ending: manifest.ending ?? base.ending,
          battle: manifest.battle ?? base.battle,
          layout25d: manifest.layout25d ?? base.layout25d,
          scenes: manifest.scenes?.map(s => ({
            ...s,
            objects: s.objects.map(o => ({ ...o, spriteUrl: hydrateUrlFromRef(o.spriteRef) })),
            bgm: s.bgm ? { ref: s.bgm } : undefined,
          })),
          bgm: manifest.bgm && manifest.bgm !== 'none' ? { ref: manifest.bgm } : undefined,
          battleBgm: manifest.battleBgm ? { ref: manifest.battleBgm } : undefined,
          bossBgm: manifest.bossBgm ? { ref: manifest.bossBgm } : undefined,
          sfx: Object.fromEntries(
            Object.entries(manifest.sfx).map(([k, v]) => [k, v ? { ref: v } : undefined])
          ) as PresetData['sfx'],
        };
        setPresetId(preset);
        setGameData(data);
        setTitle(manifest.name);
        const eng = engineRef.current;
        eng.player = { ...data.player.start, vx: 0, vy: 0, isGrounded: false };
        eng.map = JSON.parse(JSON.stringify(data.map));
        eng.bullets = []; eng.enemyBullets = []; eng.entities = [];
        setIsPlaying(false); setSelectedObjId(null);
      } catch { alert('JSONの解析に失敗しました'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── シーン管理ヘルパー ────────────────────────────────────────────────────
  /** エディタで選択シーンを切り替える。現在の map/objects を scenes に書き戻してから切り替え。 */
  const switchEditScene = useCallback((newIdx: number) => {
    setGameData(prev => {
      if (!prev.scenes) return prev;
      const scenes = prev.scenes.map((s, i) =>
        i === editSceneIdx ? { ...s, map: prev.map, overlayMap: prev.overlayMap, objects: prev.objects } : s
      );
      const next = scenes[newIdx];
      return { ...prev, scenes, map: next.map, overlayMap: next.overlayMap, objects: next.objects };
    });
    setEditSceneIdx(newIdx);
    setSelectedObjId(null);
    // エンジンにも反映
    const next = gameData.scenes?.[newIdx];
    if (next) {
      engineRef.current.map = JSON.parse(JSON.stringify(next.map));
      const startPos = gameData.player.start;
      engineRef.current.player = { ...startPos, vx: 0, vy: 0, isGrounded: false };
    }
  }, [editSceneIdx, gameData.scenes, gameData.player.start]);

  /** 現在の map/objects を scenes に書き戻す（タブ切替前に呼ぶ）。 */
  const flushSceneEdits = useCallback(() => {
    setGameData(prev => {
      if (!prev.scenes) return prev;
      const scenes = prev.scenes.map((s, i) =>
        i === editSceneIdx ? { ...s, map: prev.map, overlayMap: prev.overlayMap, objects: prev.objects } : s
      );
      return { ...prev, scenes };
    });
  }, [editSceneIdx]);

  /** シーン追加。 */
  const addScene = useCallback(() => {
    const newId = uid();
    const emptyMap = Array.from({ length: ROWS }, (_, y) =>
      Array.from({ length: COLS }, (_, x) => (y >= ROWS - 2 ? 1 : 0))
    );
    const emptyOverlay = emptyGridLike(emptyMap);
    const newScene: SceneDef = { id: newId, name: `シーン${(gameData.scenes?.length ?? 0) + 1}`, map: emptyMap, overlayMap: emptyOverlay, objects: [] };
    flushSceneEdits();
    setGameData(prev => {
      const scenes = [...(prev.scenes ?? []), newScene];
      return { ...prev, scenes, map: newScene.map, overlayMap: newScene.overlayMap, objects: newScene.objects };
    });
    setEditSceneIdx((gameData.scenes?.length ?? 0));
    setSelectedObjId(null);
  }, [gameData.scenes, flushSceneEdits]);

  /** シーン削除（最後の1つは削除不可）。 */
  const removeScene = useCallback((idx: number) => {
    if ((gameData.scenes?.length ?? 0) <= 1) return;
    setGameData(prev => {
      if (!prev.scenes) return prev;
      const scenes = prev.scenes.filter((_, i) => i !== idx);
      const nextIdx = Math.min(editSceneIdx, scenes.length - 1);
      return { ...prev, scenes, map: scenes[nextIdx].map, overlayMap: scenes[nextIdx].overlayMap, objects: scenes[nextIdx].objects };
    });
    setEditSceneIdx(prev => Math.max(0, prev - (idx <= editSceneIdx ? 1 : 0)));
    setSelectedObjId(null);
  }, [gameData.scenes, editSceneIdx]);

  /** シーン出口を更新。 */
  const updateSceneExit = useCallback((sceneId: string, dir: keyof SceneExit, targetId: string) => {
    flushSceneEdits();
    setGameData(prev => {
      if (!prev.scenes) return prev;
      const scenes = prev.scenes.map(s =>
        s.id === sceneId ? { ...s, exits: { ...s.exits, [dir]: targetId || undefined } } : s
      );
      return { ...prev, scenes };
    });
  }, [flushSceneEdits]);

  const tpl = objTemplate;
  const setTpl = (patch: Partial<ObjectDef>) => setObjTemplate(o => ({ ...o, ...patch }));
  const selObj = selectedObjId ? gameData.objects.find(o => o.id === selectedObjId) ?? null : null;
  const updObj = (patch: Partial<ObjectDef>) => { if (!selectedObjId) return; setGameData(p => ({ ...p, objects: p.objects.map(o => o.id === selectedObjId ? { ...o, ...patch } : o) })); };
  const delObj = () => { if (!selectedObjId) return; setGameData(p => ({ ...p, objects: p.objects.filter(o => o.id !== selectedObjId) })); setSelectedObjId(null); };
  const moveObj = (dc: number, dr: number) => { if (!selectedObjId) return; setGameData(p => ({ ...p, objects: p.objects.map(o => o.id === selectedObjId ? { ...o, col: o.col + dc, row: o.row + dr } : o) })); };
  const placeObj = () => { const p = engineRef.current.player; setGameData(prev => ({ ...prev, objects: [...prev.objects, { ...objTemplate, id: uid(), col: Math.floor((p.x + 12) / TILE_SIZE), row: Math.floor((p.y + 12) / TILE_SIZE) }] })); };

  // ── タイトル／エンディング画面の更新ヘルパ ──
  const updTitle = (patch: Partial<TitleScreenConfig>) => setGameData(p => p.titleScreen ? ({ ...p, titleScreen: { ...p.titleScreen, ...patch } }) : p);
  const updEnding = (patch: Partial<EndingScreenConfig>) => setGameData(p => p.ending ? ({ ...p, ending: { ...p.ending, ...patch } }) : p);
  const startFromTitle = () => { setShowTitle(false); setIsPlaying(true); };

  // SELECT ボタンが押されたとき
  const handleSelectPress = () => {
    if (introOpen) return;
    if (!isPlaying) {
      // 編集モード：速度切り替え (1x => 2x => 4x)
      setEditSpeedMult(prev => {
        const speeds = [1, 2, 4];
        return speeds[(speeds.indexOf(prev) + 1) % speeds.length];
      });
    } else {
      // プレイ中
      if (gameData.engine === 'rpg') {
        // どうぐ袋をトグル
        const hasOverlay = !!activeDialogue || !!gameMsg || !!shopModal || !!eventChoice || !!gameOverResult;
        if (gameData.battle && !battle && !hasOverlay) {
          setBagOpen(prev => !prev);
        }
      } else if (gameData.engine === 'yume25d') {
        setTouch('select', true);
        setTimeout(() => setTouch('select', false), 80);
      } else {
        // その他：速度切り替え (Fキー相当) もできるようにしておくと便利
        setEditSpeedMult(prev => {
          const speeds = [1, 2, 4];
          return speeds[(speeds.indexOf(prev) + 1) % speeds.length];
        });
      }
    }
  };

  // START ボタンが押されたとき
  const handleStartPress = () => {
    if (introOpen) {
      enterPlayFromIntro();
      return;
    }
    if (isPlaying) {
      // 編集に戻る
      resetSceneState();
      invulnRef.current = 0;
      bombInvulnRef.current = 0;
      isPlayerDeadRef.current = false;
      roundOverRef.current = false;
      setBattle(null);
      battleRef.current = { active: false, entity: null, enemyName: '', enemyHp: 0, enemyMaxHp: 0, enemyAtk: 0, enemyDef: 0, enemyMoves: [], exp: 0, gold: 0, isBoss: false, mercy: 0 };
      const pp = engineRef.current.player;
      const pw = gameData.player.w, ph = gameData.player.h;
      setEditScroll(Math.max(0, Math.min(((gameData.scroll?.worldCols ?? COLS) * TILE_SIZE - VIEW_W), pp.x + pw / 2 - VIEW_W / 2)));
      setEditScrollY(Math.max(0, Math.min(((gameData.scroll?.worldRows ?? ROWS) * TILE_SIZE - VIEW_H), pp.y + ph / 2 - VIEW_H / 2)));
      setShowEnding(false);
      setIsPlaying(false);
    } else {
      // テストプレイ開始
      setActivePreviewKey(null);
      flushSceneEdits();
      if (gameData.titleScreen?.enabled) {
        setShowTitle(true);
      } else {
        setIsPlaying(true);
        justStartedRef.current = true;
      }
    }
  };

  return (
    <div className={embedded ? "flex flex-col h-full bg-[#07080b] text-gray-100 overflow-hidden" : "absolute inset-0 z-50 flex flex-col bg-[#07080b] text-gray-100 overflow-hidden"}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0f0f11] border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {!embedded && <button onClick={onClose} className="p-1 text-gray-400 hover:bg-gray-100/10 shrink-0"><X size={16} /></button>}
          <span className="text-xs font-bold text-white shrink-0">{embedded ? '▶ プレイ中' : 'ゲーム作成'}</span>
          {!isPlaying && !playOnly && (
            <select value={presetId} onChange={e => resetGame(e.target.value as PresetId)}
              className="bg-gray-800 border border-gray-700 px-2 py-1 text-[11px] text-gray-200 outline-none max-w-[110px]">
              {PRESET_ORDER.map(id => (
                <option key={id} value={id}>{PRESETS[id].name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* 設定ボタン */}
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setSettingsOpen(v => !v)}
              className={`p-2 ${settingsOpen ? 'bg-gray-600 text-white' : 'bg-gray-700/50 text-gray-400 hover:text-white'} ${debugInvincible ? 'ring-1 ring-yellow-400' : ''}`}
              title="設定"
            >
              <Settings size={14} />
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-[#1a1a2e] border border-gray-700 shadow-2xl p-2 space-y-1">
                {/* 無敵モード */}
                <button
                  onClick={() => setDebugInvincible(v => !v)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold transition ${debugInvincible ? 'bg-yellow-500/20 text-yellow-300' : 'text-gray-400 hover:bg-gray-700'}`}
                >
                  {debugInvincible ? <Shield size={13} /> : <ShieldOff size={13} />}
                  無敵モード {debugInvincible ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={() => { setOnlineTestMode(v => !v); setSettingsOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold transition ${onlineTestMode ? 'bg-blue-500/20 text-blue-300' : 'text-gray-400 hover:bg-gray-700'}`}
                >
                  🌐 オンラインテスト {onlineTestMode ? 'ON' : 'OFF'}
                </button>

                <div className="border-t border-gray-700 my-1" />
                {/* エクスポート */}
                <button
                  onClick={() => { handleExport(); setSettingsOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:bg-gray-700 hover:text-white transition"
                >
                  <Download size={13} />データをエクスポート (.json)
                </button>
                {/* インポート */}
                <button
                  onClick={() => { importFileRef.current?.click(); setSettingsOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:bg-gray-700 hover:text-white transition"
                >
                  <Upload size={13} />データをインポート (.json)
                </button>
                <input ref={importFileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
                {/* SMC素材クレジット（マリオプリセット使用時） */}
                {gameData.id === 'mario' && (
                  <>
                    <div className="border-t border-gray-700 my-1" />
                    <div className="px-3 py-2 text-[10px] text-gray-500 leading-relaxed">
                      <div className="font-bold text-gray-400 mb-1">🎨 素材クレジット</div>
                      <div>キャラクタースプライト:</div>
                      <div>© Smuglutena, Cube, Fesh, Nitrox, NotAToon, Noveni, Red Bun, TheCrushedJoycon, Tristaph</div>
                      <div className="mt-1">
                        <a
                          href="https://github.com/Level-Share-Square/SMC-released-sprites"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 underline"
                          onClick={e => e.stopPropagation()}
                        >
                          SMC-released-sprites
                        </a>
                        {' '}(非商用)
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <button onClick={restart} className="p-2 text-gray-400 hover:text-white bg-gray-700/50" title="リスタート"><RotateCcw size={14} /></button>
          <button onClick={() => {
            if (introOpen) {
              enterEditFromIntro();
              return;
            }
            if (isPlaying) {
              resetSceneState();
              invulnRef.current = 0;
              bombInvulnRef.current = 0;
              isPlayerDeadRef.current = false;
              roundOverRef.current = false;
              setBattle(null);
              battleRef.current = { active: false, entity: null, enemyName: '', enemyHp: 0, enemyMaxHp: 0, enemyAtk: 0, enemyDef: 0, enemyMoves: [], exp: 0, gold: 0, isBoss: false, mercy: 0 };
              const pp = engineRef.current.player;
              const pw = gameData.player.w, ph = gameData.player.h;
              setEditScroll(Math.max(0, Math.min(((gameData.scroll?.worldCols ?? COLS) * TILE_SIZE - VIEW_W), pp.x + pw / 2 - VIEW_W / 2)));
              setEditScrollY(Math.max(0, Math.min(((gameData.scroll?.worldRows ?? ROWS) * TILE_SIZE - VIEW_H), pp.y + ph / 2 - VIEW_H / 2)));
            }
            if (isPlaying) { setShowEnding(false); setIsPlaying(false); return; }
            setActivePreviewKey(null);
            flushSceneEdits();
            if (gameData.titleScreen?.enabled) { setShowTitle(true); return; }
            setIsPlaying(true);
            justStartedRef.current = true;
          }}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold ${isPlaying ? 'bg-yellow-500 text-yellow-900' : 'bg-green-500 text-green-900'}`}>
            {isPlaying ? <><Pause size={14} /><span className="hidden sm:inline">編集</span></> : <><Play size={14} /><span className="hidden sm:inline">プレイ</span></>}
          </button>
          {onSave && (
            <button onClick={handleSave} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-blue-600 text-white hover:bg-blue-500">
              <Save size={14} /><span className="hidden sm:inline">投稿に添付</span>
            </button>
          )}
        </div>
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Canvas */}
        <div className={`flex flex-col items-center justify-center bg-black overflow-hidden ${isPlaying ? 'flex-1 max-h-[55vh] md:max-h-full' : 'flex-1 portrait:flex-none'}`}>
          <div className="relative w-full mx-auto overflow-hidden ring-2 ring-gray-700 touch-none shrink-0"
            style={{ aspectRatio: `${PLAY_W}/${PLAY_H}`, maxWidth: PLAY_W + 'px' }}>
            {gameData.engine === 'yume25d' ? (
              <Yume25DMaker
                ref={yume25dMakerRef}
                layout={gameData.layout25d!}
                onLayoutChange={updater => setGameData(prev => prev.layout25d ? { ...prev, layout25d: updater(prev.layout25d) } : prev)}
                isPlaying={isPlaying}
                demo={introOpen}
                playerAppearance={{ emoji: gameData.player.emoji, color: gameData.player.color, spriteUrl: gameData.player.spriteUrl, spriteRef: gameData.player.spriteRef }}
                onPickImage={(target) => setPicker({ mode: 'image', target })}
                virtualKeys={touchRef.current}
                view={yume25dView}
                tool={yume25dTool}
                level={yume25dLevel}
                selFloor={yume25dSelFloor}
                selWall={yume25dSelWall}
                selSprite={yume25dSelSprite}
                talkTargetId={yume25dTalkTargetId}
                onTalkTargetChange={setYume25dTalkTargetId}
                hoverMode={yume25dHoverMode}
                onHoverModeChange={setYume25dHoverMode}
              />
            ) : (
              <canvas ref={canvasRef} width={PLAY_W} height={PLAY_H}
                className={`block w-full h-full ${!isPlaying ? 'cursor-crosshair' : ''}`}
                style={{ imageRendering: 'pixelated' }}
                onMouseDown={handleCanvasAction}
                onMouseMove={e => editorTab !== 'object' && (e.buttons & 1) === 1 && handleCanvasAction(e)}
                onMouseUp={() => { isDraggingStartRef.current = false; }}
                onTouchStart={handleCanvasAction}
                onTouchMove={e => editorTab !== 'object' && handleCanvasAction(e)}
                onTouchEnd={() => { isDraggingStartRef.current = false; }} />
            )}

            {/* SMC素材クレジットバッジ（マリオプリセット プレイ中） */}
            {isPlaying && gameData.id === 'mario' && (
              <a
                href="https://github.com/Level-Share-Square/SMC-released-sprites"
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-1 right-1 z-30 bg-black text-[8px] text-gray-400 hover:text-white px-1.5 py-0.5 select-none leading-none font-pixel"
                title="Sprites: SMC-released-sprites © Smuglutena, Cube, Fesh, Nitrox, NotAToon, Noveni, Red Bun, TheCrushedJoycon, Tristaph (non-commercial)"
                onClick={e => e.stopPropagation()}
              >
                🎨 SMC sprites
              </a>
            )}

            {/* ゲーム編集時は主人公の現在座標および初期位置を表示(x,y) */}
            {gameData.engine !== 'yume25d' && !isPlaying && !introOpen && !showTitle && !showEnding && (
              <div
                ref={editorCoordRef}
                className="absolute top-2 right-2 z-30 bg-black/85 text-[11px] font-pixel text-gray-200 px-2.5 py-2 border border-white/20 rounded shadow-lg select-none flex flex-col gap-1 pointer-events-none text-right min-w-[140px]"
              />
            )}
            {/* ── タイトル画面オーバーレイ ── */}
            {showTitle && gameData.titleScreen && (
              <div className="absolute inset-0 z-40 overflow-hidden" style={{ background: 'linear-gradient(160deg,#0b1020,#1a1030)' }}>
                {gameData.titleScreen.bgUrl && /* eslint-disable-next-line @next/next/no-img-element */ (
                  <img src={gameData.titleScreen.bgUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                )}
                {!embedded && (
                  <button onClick={() => setShowTitle(false)} className="absolute top-2 right-2 z-20 p-1.5 bg-black/50 text-white/80 hover:text-white"><X size={16} /></button>
                )}
                <div className="relative z-10 w-full h-full flex flex-col items-center justify-center gap-3 px-6 text-center select-none"
                  style={{ color: gameData.titleScreen.textColor ?? '#ffffff' }}>
                  <h1 className="text-2xl sm:text-4xl font-pixel" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.85)' }}>{gameData.titleScreen.heading}</h1>
                  {gameData.titleScreen.subtitle && <p className="text-sm font-pixel opacity-90" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.85)' }}>{gameData.titleScreen.subtitle}</p>}
                  <div className="flex flex-col gap-2 mt-2 w-52 max-w-full">
                    {gameData.titleScreen.menu.map((mi, i) => (
                      <button key={i} onClick={startFromTitle}
                        className="px-4 py-2 bg-white/15 hover:bg-white/25 border-2 border-white/40 font-pixel text-sm">{mi.label}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── エンディング画面オーバーレイ ── */}
            {showEnding && gameData.ending && (
              <div className="absolute inset-0 z-40 overflow-hidden" style={{ background: 'linear-gradient(160deg,#100b1a,#05080f)' }}>
                {gameData.ending.bgUrl && /* eslint-disable-next-line @next/next/no-img-element */ (
                  <img src={gameData.ending.bgUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                )}
                <div className="relative z-10 w-full h-full flex flex-col items-center justify-center gap-3 px-6 text-center select-none"
                  style={{ color: gameData.ending.textColor ?? '#ffffff' }}>
                  <h1 className="text-2xl sm:text-4xl font-pixel" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.85)' }}>{gameData.ending.heading}</h1>
                  {gameData.ending.message && <p className="text-sm font-pixel opacity-90 whitespace-pre-wrap" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.85)' }}>{gameData.ending.message}</p>}
                  <div className="flex gap-2 mt-3">
                    {gameData.titleScreen && (
                      <button onClick={() => { setShowEnding(false); setShowTitle(true); }}
                        className="px-4 py-2 bg-white/15 hover:bg-white/25 border-2 border-white/40 font-pixel text-sm">タイトルへ</button>
                    )}
                    <button onClick={() => setShowEnding(false)}
                      className="px-4 py-2 bg-white/15 hover:bg-white/25 border-2 border-white/40 font-pixel text-sm">とじる</button>
                  </div>
                </div>
              </div>
            )}

            {/* ── 入口ヒーロー：カルーセル式ゲーム選択 ── */}
            {introOpen && (() => {
              const PRESET_BOX_GRADIENT: Record<PresetId, string> = {
                onjReze: 'from-orange-950 via-gray-900 to-gray-950',
                dq:      'from-blue-950  via-gray-900 to-gray-950',
                mario:   'from-red-950   via-gray-900 to-gray-950',
                touhou:  'from-purple-950 via-gray-900 to-gray-950',
                rockman: 'from-cyan-950  via-gray-900 to-gray-950',
                undertale: 'from-rose-950 via-gray-950 to-black',
                yume: 'from-violet-950 via-gray-950 to-black',
              };
              const PRESET_RING: Record<PresetId, string> = {
                onjReze: 'ring-orange-500/50',
                dq:      'ring-blue-500/50',
                mario:   'ring-red-500/50',
                touhou:  'ring-purple-500/50',
                rockman: 'ring-cyan-500/50',
                undertale: 'ring-rose-500/50',
                yume: 'ring-violet-500/50',
              };
              return (
                <div className="absolute inset-0 z-[45] flex flex-col select-none"
                  style={{ background: 'rgba(7,8,11,0.78)', backdropFilter: 'blur(3px)' }}>

                  {/* ヘッダー */}
                  <div className="shrink-0 pt-3 pb-1 px-4 text-center">
                    <span className="text-[9px] font-black tracking-[0.35em] text-white/35">GAME MAKER</span>
                    <p className="text-[10px] text-white/55 mt-0.5">ゲームを選んで改造しよう</p>
                  </div>

                  {/* カルーセル */}
                  <div className="flex-1 flex items-center justify-center relative overflow-hidden">
                    {/* 左矢印 */}
                    <button onClick={() => navigateIntro(-1)}
                      className="absolute left-1 z-10 w-10 h-16 flex items-center justify-center text-white/50 hover:text-white/90 text-3xl font-thin active:scale-90 transition">
                      ‹
                    </button>

                    {/* ゲームボックス */}
                    <div key={presetId}
                      style={{ animation: `${introAnim === 'right' ? 'introCardInRight' : 'introCardInLeft'} 0.22s ease both` }}
                      className="flex flex-col items-center gap-3 px-12">
                      {/* パッケージ風カード */}
                      <div className={`w-28 h-36 bg-gradient-to-b ${PRESET_BOX_GRADIENT[presetId]} ring-2 ${PRESET_RING[presetId]} shadow-2xl flex flex-col items-center justify-center gap-2 relative overflow-hidden`}>
                        <div className="absolute inset-0 opacity-10"
                          style={{ backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)', backgroundSize: '6px 6px' }} />
                        <span className="text-5xl leading-none relative z-10">{PRESET_EMOJI[presetId]}</span>
                        <span className="text-[9px] font-black tracking-wider text-white/50 relative z-10">GAME</span>
                      </div>
                      {/* タイトル */}
                      <div className="text-center">
                        <div className="font-black text-base text-white leading-tight">{PRESETS[presetId].name}</div>
                        <div className="text-[10px] text-white/50 mt-0.5">{PRESET_TAGLINE[presetId]}</div>
                      </div>
                    </div>

                    {/* 右矢印 */}
                    <button onClick={() => navigateIntro(1)}
                      className="absolute right-1 z-10 w-10 h-16 flex items-center justify-center text-white/50 hover:text-white/90 text-3xl font-thin active:scale-90 transition">
                      ›
                    </button>
                  </div>

                  {/* ドットインジケーター */}
                  <div className="shrink-0 flex justify-center gap-2 pb-3">
                    {PRESET_ORDER.map(id => (
                      <button key={id} onClick={() => { setIntroAnim('right'); previewPresetInIntro(id); }}
                        className={` transition-all duration-200 ${id === presetId ? 'w-5 h-2 bg-white' : 'w-2 h-2 bg-white/25 hover:bg-white/50'}`} />
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ニコニコ弾幕レイヤー */}
            {danmakuItems.length > 0 && (
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {danmakuItems.map(item => (
                  <span
                    key={item.id}
                    className="danmaku-comment"
                    style={{ top: item.row * 22 + 4, color: item.color }}
                  >
                    {item.text}
                  </span>
                ))}
              </div>
            )}

            {/* ゲーム内メッセージ（DQ風） */}
            {gameMsg && (
              <div
                className="absolute inset-x-2 bottom-2 cursor-pointer select-none"
                onClick={dismissGameMsg}
                onTouchEnd={e => { e.preventDefault(); dismissGameMsg(); }}
              >
                <div className="bg-[#1a1a2e] border-2 border-gray-400 px-4 py-3 font-pixel"
                  style={{ imageRendering: 'pixelated' }}>
                  <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{gameMsg.text}</p>
                  <div className="flex justify-end mt-1.5 h-4">
                    {gameMsgReadyRef.current
                      ? <span className="text-yellow-300 text-xs animate-bounce">▼</span>
                      : <span className="text-gray-500 text-[10px]">しばらくおまちください…</span>
                    }
                  </div>
                </div>
              </div>
            )}

            {/* ── ゲームオーバー リザルト画面 ── */}
            {gameOverResult && (
              gameOverResult.marioDeathAnim
              ? (
                /* ── マリオ専用ゲームオーバー演出 ── */
                <div className="absolute inset-0 flex flex-col items-center justify-center z-50 font-pixel-en"
                  style={{ background: 'rgba(0,0,0,0.88)' }}>
                  {/* GAME OVER タイトル */}
                  <div style={{ animation: 'marioGoFadeIn 0.6s ease-out forwards', opacity: 0 }}>
                    <p style={{
                      color: '#ff3030', fontSize: 22, fontWeight: 900, letterSpacing: 6,
                      textShadow: '2px 2px 0 #800000, 4px 4px 0 #400000',
                      lineHeight: 1
                    }}>GAME OVER</p>
                  </div>
                  {/* コイン残数 */}
                  <div style={{ marginTop: 24, color: '#ffd700', fontSize: 13, letterSpacing: 2 }}>
                    🪙 × {coinsRef.current}
                  </div>
                  {/* スコア */}
                  {gameOverResult.score > 0 && (
                    <div style={{ marginTop: 8, color: '#aaa', fontSize: 11, letterSpacing: 2 }}>
                      SCORE {gameOverResult.score.toLocaleString()}
                    </div>
                  )}
                  {/* ボタン */}
                  <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 10, width: 180 }}>
                    <button
                      onClick={handleGameOverRetry}
                      style={{ padding: '9px 0', background: '#1060d0', color: '#fff', border: '2px solid #4090ff',
                        fontSize: 12, fontWeight: 'bold', letterSpacing: 2, cursor: 'pointer' }}
                    >▶ RETRY</button>
                    <button
                      onClick={handleGameOverExit}
                      style={{ padding: '9px 0', background: '#333', color: '#aaa', border: '2px solid #555',
                        fontSize: 12, fontWeight: 'bold', letterSpacing: 2, cursor: 'pointer' }}
                    >✕ QUIT</button>
                  </div>
                </div>
              )
              : (
                /* ── 汎用ゲームオーバー画面 ── */
                <div className="absolute inset-0 flex items-center justify-center bg-black/75 z-50">
                  <div className="bg-gray-950 border-2 border-red-600 px-8 py-7 text-center min-w-[200px] space-y-4 font-pixel">
                    <p className="text-red-400 text-2xl font-bold tracking-widest">GAME OVER</p>
                    {gameOverResult.score > 0 && (
                      <div className="border border-gray-700 px-4 py-2">
                        <p className="text-gray-400 text-[11px] tracking-widest">SCORE</p>
                        <p className="text-yellow-300 text-xl font-bold">{gameOverResult.score.toLocaleString()}</p>
                      </div>
                    )}
                    <div className="flex flex-col gap-2 pt-1">
                      <button
                        onClick={handleGameOverRetry}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-bold tracking-wide transition-colors"
                      >
                        ▶ リトライ
                      </button>
                      <button
                        onClick={handleGameOverExit}
                        className="w-full py-2 bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-gray-200 text-sm font-bold tracking-wide transition-colors"
                      >
                        ✕ 終了
                      </button>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* ── セリフカットシーン（ゲーム中） ── */}
            {activeDialogue && (
              <DialogueCutscene
                ref={dialogueCutsceneRef}
                lines={activeDialogue}
                onComplete={onDialogueComplete}
              />
            )}

            {/* ── スペルカードカットイン ── */}
            {spellCutin && (
              <SpellCutscene
                key={spellCutin.key}
                mode={spellCutin.mode}
                charName={spellCutin.charName}
                spellName={spellCutin.spellName}
                imageUrl={spellCutin.imageUrl}
                imageX={spellCutin.imageX}
                imageY={spellCutin.imageY}
                imageScale={spellCutin.imageScale}
                onComplete={() => setSpellCutin(null)}
              />
            )}

            {/* ── セリフプレビュー（最後に操作した行を常に表示） ── */}
            {(() => {
              if (!activePreviewKey) return null;
              let line: DialogueLine | undefined;
              if (activePreviewKey.startsWith('outro-')) {
                const [, piStr, diStr] = activePreviewKey.split('-');
                line = gameData.phases?.[+piStr]?.outroDialogue?.[+diStr];
              } else if (activePreviewKey.startsWith('boss-outro-')) {
                const [,, , idxStr] = activePreviewKey.split('-');
                const obj = gameData.objects.find(o => o.id === selectedObjId);
                line = obj?.outroDialogue?.[+idxStr];
              } else {
                const [piStr, diStr] = activePreviewKey.split('-');
                line = gameData.phases?.[+piStr]?.dialogue?.[+diStr];
              }
              return line ? (
                <DialogueCutscene
                  key={activePreviewKey}
                  lines={[line]}
                  onComplete={() => setActivePreviewKey(null)}
                />
              ) : null;
            })()}

            {/* ── スペルカードカットインプレビュー（エディタ） ── */}
            {!isPlaying && spellCutinPreview && (
              <SpellCutscene
                key={spellCutinPreview.key}
                mode={spellCutinPreview.mode}
                charName={spellCutinPreview.charName}
                spellName={spellCutinPreview.spellName}
                imageUrl={spellCutinPreview.imageUrl}
                imageX={spellCutinPreview.imageX}
                imageY={spellCutinPreview.imageY}
                imageScale={spellCutinPreview.imageScale}
                onComplete={() => setSpellCutinPreview(null)}
              />
            )}

            {/* ── イベント選択肢 ── */}
            {eventChoice && !battle && (
              <div className="absolute inset-0 flex items-end justify-center pb-16 px-4 font-pixel">
                <div className="bg-[#1a1a2e] border-2 border-gray-400 p-3 shadow-2xl w-full max-w-xs">
                  <p className="text-white text-sm leading-relaxed mb-2 whitespace-pre-wrap">{eventChoice.text}</p>
                  <div className="space-y-1.5">
                    {eventChoice.choices.map((ch, i) => (
                      <button key={i} onClick={() => eventChoice.onPick(i)}
                        className="w-full py-1.5 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white text-xs font-bold text-left px-3">
                        {ch.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── ターン制戦闘オーバーレイ ── */}
            {/* ── アンダーテール風戦闘（soul）── */}
            {battle && battleStyle === 'soul' && (() => {
              const pr = progressRef.current;
              const bd = gameData.battle!;
              const canMenu = battle.canAct && !battle.over && soulPhase === 'menu';
              const ready = spareReady(battle);
              return (
                <div className="absolute inset-0 flex flex-col p-2 sm:p-3 bg-black/70 font-pixel select-none">
                  {/* 敵 */}
                  <div className="flex flex-col items-center mt-1 shrink-0">
                    <div className={`text-5xl sm:text-6xl leading-none drop-shadow transition-transform ${soulPhase === 'dodge' ? 'scale-90' : ''}`}>{battle.enemyEmoji}</div>
                    <div className={`mt-1 text-xs sm:text-sm ${ready ? 'text-yellow-300' : 'text-white'}`}>{battle.enemyName}{ready ? ' ✦' : ''}</div>
                    <div className="w-40 h-2 bg-gray-700 mt-1 overflow-hidden">
                      <div className="h-full bg-green-500 transition-all" style={{ width: `${Math.max(0, (battle.enemyHp / battle.enemyMaxHp) * 100)}%` }} />
                    </div>
                    <div className="w-40 h-1 bg-gray-800 mt-0.5 overflow-hidden">
                      <div className="h-full bg-yellow-400 transition-all" style={{ width: `${battle.mercy}%` }} />
                    </div>
                  </div>
                  {/* バトルボックス（白枠がシームレスに変形する） */}
                  <div className="flex-1 flex items-center justify-center min-h-0">
                    <div className="bg-black border-4 border-white relative overflow-hidden"
                      style={{
                        width: soulPhase === 'dodge' ? 184 : 'min(100%, 440px)',
                        height: soulPhase === 'dodge' ? 184 : 128,
                        transition: 'width 0.35s ease-in-out, height 0.35s ease-in-out',
                      }}>
                      {soulPhase === 'dodge' ? (
                        <canvas ref={soulCanvasRef} width={176} height={176}
                          className="w-full h-full touch-none cursor-crosshair" style={{ imageRendering: 'pixelated' }}
                          onPointerMove={soulPointerMove} onPointerDown={soulPointerMove} />
                      ) : soulPhase === 'attack' ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center px-3 gap-1.5">
                          <div className="text-white/70 text-[10px]">タイミングよく タップ / Zキー！</div>
                          <div className="relative w-full h-10 border-2 border-white/80 bg-[#0c0c14] overflow-hidden">
                            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[14%] bg-emerald-500/25" />
                            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[4%] bg-emerald-400/70" />
                            <div ref={soulBarElRef} className="absolute inset-y-0 w-1 bg-white" style={{ left: '0%' }} />
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 p-2.5 text-white text-[11px] sm:text-sm leading-relaxed overflow-hidden">
                          {soulMenu === 'root' && battle.log.slice(-3).map((l, i) => <p key={i}>＊ {l}</p>)}
                          {soulMenu === 'act' && (
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                              {bd.moves.map((m, i) => (
                                <button key={i} disabled={!canMenu || pr.mp < m.cost}
                                  onClick={() => { setSoulMenu('root'); doMove(m); }}
                                  className="text-left text-white hover:text-yellow-300 disabled:opacity-40 text-[11px] sm:text-xs py-0.5">
                                  ❤ {m.name}{m.cost > 0 && <span className="text-cyan-300 ml-1">{m.cost}</span>}
                                </button>
                              ))}
                              <button onClick={() => setSoulMenu('root')} className="text-left text-gray-400 hover:text-white text-[11px] sm:text-xs py-0.5">❤ もどる</button>
                            </div>
                          )}
                          {soulMenu === 'item' && (
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                              {usableItems().map(it => (
                                <button key={it.id} disabled={!canMenu}
                                  onClick={() => { setSoulMenu('root'); useHealItem(it, true); }}
                                  className="text-left text-white hover:text-yellow-300 disabled:opacity-40 text-[11px] sm:text-xs py-0.5">
                                  ❤ {it.name} <span className="text-gray-400">×{inventory[it.id] ?? 0}</span>
                                </button>
                              ))}
                              {usableItems().length === 0 && <p className="text-gray-500">もちものが ない…</p>}
                              <button onClick={() => setSoulMenu('root')} className="text-left text-gray-400 hover:text-white text-[11px] sm:text-xs py-0.5">❤ もどる</button>
                            </div>
                          )}
                          {soulMenu === 'mercy' && (
                            <div className="flex flex-col gap-1">
                              <button disabled={!canMenu} onClick={() => { setSoulMenu('root'); doSpare(); }}
                                className={`text-left text-[11px] sm:text-xs py-0.5 disabled:opacity-40 ${ready ? 'text-yellow-300 animate-pulse' : 'text-white hover:text-yellow-300'}`}>
                                ❤ {bd.labels.mercy ?? 'みのがす'}{ready ? ' ✦' : ''}
                              </button>
                              <button disabled={!canMenu} onClick={() => { setSoulMenu('root'); doFlee(); }}
                                className="text-left text-white hover:text-yellow-300 disabled:opacity-40 text-[11px] sm:text-xs py-0.5">
                                ❤ {bd.labels.flee}
                              </button>
                              <button onClick={() => setSoulMenu('root')} className="text-left text-gray-400 hover:text-white text-[11px] sm:text-xs py-0.5">❤ もどる</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* プレイヤーステータス */}
                  <div className="text-center text-[10px] sm:text-xs text-white mb-1.5 shrink-0">
                    {bd.playerName}　LV {pr.level}　<span className="text-red-400">HP</span> {pr.hp}/{pr.maxHp}　<span className="text-cyan-300">MP</span> {pr.mp}/{pr.maxMp}
                  </div>
                  {/* FIGHT / ACT / ITEM / MERCY */}
                  <div className="flex justify-center gap-1.5 sm:gap-2 shrink-0">
                    {([
                      { label: bd.labels.attack, sel: false, onClick: () => canMenu && setSoulPhase('attack') },
                      { label: bd.labels.move, sel: soulMenu === 'act', onClick: () => canMenu && setSoulMenu(m => m === 'act' ? 'root' : 'act') },
                      { label: bd.labels.item ?? 'アイテム', sel: soulMenu === 'item', onClick: () => canMenu && setSoulMenu(m => m === 'item' ? 'root' : 'item') },
                      { label: bd.labels.mercy ?? 'みのがす', sel: soulMenu === 'mercy', mercy: true, onClick: () => canMenu && setSoulMenu(m => m === 'mercy' ? 'root' : 'mercy') },
                    ] as { label: string; sel: boolean; mercy?: boolean; onClick: () => void }[]).map((c, i) => (
                      <button key={i} onClick={c.onClick} disabled={!canMenu}
                        className={`flex-1 max-w-[104px] py-2 border-2 bg-black text-[10px] sm:text-xs font-bold tracking-wider transition
                          ${c.sel ? 'border-yellow-300 text-yellow-300' : c.mercy && ready ? 'border-yellow-400 text-yellow-300 animate-pulse' : 'border-orange-400 text-orange-300 hover:border-yellow-300 hover:text-yellow-300'}
                          disabled:opacity-40`}>
                        {c.sel ? '❤ ' : ''}{c.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {battle && battleStyle !== 'soul' && (
              <div className="absolute inset-0 flex flex-col justify-between p-2 sm:p-3 bg-black/40 font-pixel">
                {/* 敵 */}
                <div className="flex flex-col items-center mt-2">
                  <div className="text-5xl sm:text-6xl leading-none drop-shadow">{battle.enemyEmoji}</div>
                  {/* みのがし可能になったら敵名が黄色くなる（アンダーテール風） */}
                  <div className={`mt-1 text-xs sm:text-sm ${gameData.battle?.labels.mercy && spareReady(battle) ? 'text-yellow-300' : 'text-white'}`}>{battle.enemyName}</div>
                  <div className="w-40 h-2 bg-gray-700 mt-1 overflow-hidden">
                    <div className="h-full bg-red-500 transition-all" style={{ width: `${Math.max(0, (battle.enemyHp / battle.enemyMaxHp) * 100)}%` }} />
                  </div>
                  {gameData.battle?.labels.mercy && (
                    <div className="w-40 h-1 bg-gray-800 mt-0.5 overflow-hidden">
                      <div className="h-full bg-yellow-400 transition-all" style={{ width: `${battle.mercy}%` }} />
                    </div>
                  )}
                </div>
                {/* ログ + コマンド */}
                <div className="bg-[#1a1a2e] border-2 border-gray-400 p-2 sm:p-3 shadow-2xl">
                  <div className="text-white text-[11px] sm:text-sm leading-relaxed min-h-[3.5em] mb-2">
                    {battle.log.slice(-3).map((l, i) => <p key={i}>{l}</p>)}
                  </div>
                  {battle.canAct && !battle.over && (battleItemsOpen ? (
                    <div className="space-y-1.5">
                      {usableItems().map(it => (
                        <button key={it.id} onClick={() => useHealItem(it, true)}
                          className="w-full flex justify-between items-center px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-[11px] font-bold">
                          <span>{it.emoji} {it.name}</span>
                          <span className="text-gray-400">×{inventory[it.id] ?? 0}</span>
                        </button>
                      ))}
                      <button onClick={() => setBattleItemsOpen(false)}
                        className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-bold">もどる</button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      <button onClick={doAttack} className="py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold">{gameData.battle?.labels.attack}</button>
                      <button onClick={doFlee} className="py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold">{gameData.battle?.labels.flee}</button>
                      {(gameData.battle?.moves ?? []).map((m, i) => (
                        <button key={i} onClick={() => doMove(m)} disabled={progressRef.current.mp < m.cost}
                          className={`py-1.5 disabled:opacity-40 text-white text-[11px] font-bold ${m.mercy != null ? 'bg-teal-700 hover:bg-teal-600' : 'bg-indigo-700 hover:bg-indigo-600'}`}>
                          {m.name}{m.cost > 0 && <span className={`ml-1 ${m.mercy != null ? 'text-teal-300' : 'text-indigo-300'}`}>{m.cost}</span>}
                        </button>
                      ))}
                      {gameData.battle?.labels.mercy && (
                        <button onClick={doSpare}
                          className={`py-1.5 text-[11px] font-bold ${spareReady(battle) ? 'bg-yellow-500 hover:bg-yellow-400 text-black animate-pulse' : 'bg-yellow-900 hover:bg-yellow-800 text-yellow-200/70'}`}>
                          {gameData.battle.labels.mercy}
                        </button>
                      )}
                      {usableItems().length > 0 && (
                        <button onClick={() => setBattleItemsOpen(true)}
                          className="py-1.5 bg-amber-700 hover:bg-amber-600 text-white text-xs font-bold">
                          {gameData.battle?.labels.item ?? 'どうぐ'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── ショップモーダル ── */}
            {shopModal && (
              <div className="absolute inset-0 flex items-end justify-center pb-4 z-30">
                <div className="bg-gray-900 border border-yellow-600 p-4 w-full max-w-xs mx-3 font-pixel">
                  <div className="text-yellow-400 font-bold text-sm mb-2">🏪 お店</div>
                  <div className="text-yellow-300 text-xs mb-3">所持金: {progressRef.current.gold ?? 0} G</div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {shopModal.items.map(si => {
                      const itemDef = (gameData.items ?? []).find(it => it.id === si.itemId);
                      const canAfford = (progressRef.current.gold ?? 0) >= si.price;
                      return (
                        <button
                          key={si.itemId}
                          disabled={!canAfford}
                          onClick={() => {
                            progressRef.current.gold = (progressRef.current.gold ?? 0) - si.price;
                            setInventory(p => { const n = { ...p }; n[si.itemId] = (n[si.itemId] ?? 0) + 1; return n; });
                            // 武器・防具は購入と同時に装備（giveItem コマンドと同じ挙動）
                            if (itemDef?.category === 'weapon' || itemDef?.category === 'armor') {
                              const eq = { ...equipmentRef.current };
                              if (itemDef.category === 'weapon') eq.weapon = itemDef.id;
                              if (itemDef.category === 'armor') eq.armor = itemDef.id;
                              setEquipment(eq);
                              applyEquipment(eq);
                            }
                            playSfx(sfxRef.current.purchase);
                            itemGetRef.current = { text: `${itemDef?.emoji ?? '?'} ${itemDef?.name ?? si.itemId} を買った！`, startTime: performance.now() };
                            setShopModal(null);
                            forceHud(n => n + 1);
                          }}
                          className={`w-full flex justify-between items-center px-3 py-2 text-xs ${canAfford ? 'bg-gray-700 text-white active:bg-yellow-600/30' : 'bg-gray-800 text-gray-500'}`}
                        >
                          <span>{itemDef?.emoji ?? '?'} {itemDef?.name ?? si.itemId}</span>
                          <span className={canAfford ? 'text-yellow-400' : 'text-gray-600'}>{si.price} G</span>
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => setShopModal(null)} className="mt-3 w-full py-2 bg-gray-700 text-gray-300 text-xs active:bg-gray-600">とじる</button>
                </div>
              </div>
            )}

            {bagOpen && !battle && (
              <div className="absolute inset-0 flex items-end justify-center pb-4 z-30 bg-black/30" onClick={() => setBagOpen(false)}>
                <div className="bg-gray-900 border border-amber-600 p-4 w-full max-w-xs mx-3 font-pixel" onClick={e => e.stopPropagation()}>
                  <div className="text-amber-400 font-bold text-sm mb-2">🎒 どうぐ</div>
                  <div className="text-yellow-300 text-xs mb-3">所持金: {progressRef.current.gold ?? 0} G</div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {(gameData.items ?? []).filter(it => (inventory[it.id] ?? 0) > 0).length === 0 && (
                      <p className="text-[11px] text-gray-500">なにも もっていない。</p>
                    )}
                    {(gameData.items ?? []).filter(it => (inventory[it.id] ?? 0) > 0).map(it => {
                      const equipped = equipment.weapon === it.id || equipment.armor === it.id;
                      const usable = !!(it.healHp || it.healMp);
                      return (
                        <div key={it.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-800 text-xs text-white">
                          <span className="min-w-0 truncate">
                            {it.emoji} {it.name}
                            {equipped && <span className="text-green-400 ml-1 font-bold">E</span>}
                            <span className="text-gray-500 ml-1">×{inventory[it.id] ?? 0}</span>
                          </span>
                          {usable && (
                            <button onClick={() => useHealItem(it, false)}
                              className="shrink-0 px-2.5 py-1 bg-amber-700 active:bg-amber-600 text-white font-bold">つかう</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={() => setBagOpen(false)} className="mt-3 w-full py-2 bg-gray-700 text-gray-300 text-xs active:bg-gray-600">とじる</button>
                </div>
              </div>
            )}
            {/* 操作方法のナビ */}
            {showControlGuide && (
              <div className="absolute inset-0 flex items-start justify-start p-3 z-50 pointer-events-none transition-opacity duration-300">
                <div className="bg-gray-900/95 backdrop-blur-md border border-white/20 p-4 rounded-xl max-w-xs text-white text-center shadow-2xl pointer-events-auto">
                  <h4 className="text-violet-400 font-bold text-xs mb-2.5">🎮 操作方法</h4>
                  <div className="space-y-2 text-[10px] text-gray-300 text-left">
                    <div className="flex items-center justify-between gap-4">
                      <span>移動</span>
                      <span className="font-mono bg-gray-800 border border-gray-700 px-1 py-0.5 rounded text-white">[矢印キー] / [WASD]</span>
                    </div>

                    {gameData.engine === 'action' && (
                      <>
                        <div className="flex items-center justify-between gap-4">
                          <span>ジャンプ</span>
                          <span className="font-mono bg-gray-800 border border-gray-700 px-1 py-0.5 rounded text-white">[Space] / [Z]</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>ショット / 攻撃</span>
                          <span className="font-mono bg-gray-800 border border-gray-700 px-1 py-0.5 rounded text-white">[X]</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>ダッシュ</span>
                          <span className="font-mono bg-gray-800 border border-gray-700 px-1 py-0.5 rounded text-white">[Shift] / [C]</span>
                        </div>
                        {gameData.id === 'rockman' && (
                          <div className="flex items-center justify-between gap-4">
                            <span>武器切替</span>
                            <span className="font-mono bg-gray-800 border border-gray-700 px-1 py-0.5 rounded text-white">[Q] / [E]</span>
                          </div>
                        )}
                      </>
                    )}

                    {gameData.engine === 'rpg' && (
                      <>
                        <div className="flex items-center justify-between gap-4">
                          <span>決定 / 調べる / 話す</span>
                          <span className="font-mono bg-gray-800 border border-gray-700 px-1 py-0.5 rounded text-white">[Z] / [Enter]</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>キャンセル</span>
                          <span className="font-mono bg-gray-800 border border-gray-700 px-1 py-0.5 rounded text-white">[X]</span>
                        </div>
                      </>
                    )}

                    {gameData.engine === 'touhou' && (
                      <>
                        <div className="flex items-center justify-between gap-4">
                          <span>ショット</span>
                          <span className="font-mono bg-gray-800 border border-gray-700 px-1 py-0.5 rounded text-white">[Z]</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>ボム</span>
                          <span className="font-mono bg-gray-800 border border-gray-700 px-1 py-0.5 rounded text-white">[X]</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>低速移動</span>
                          <span className="font-mono bg-gray-800 border border-gray-700 px-1 py-0.5 rounded text-white">[Shift]</span>
                        </div>
                      </>
                    )}

                    {gameData.engine === 'onjReze' && (
                      <>
                        <div className="flex items-center justify-between gap-4">
                          <span>剣攻撃</span>
                          <span className="font-mono bg-gray-800 border border-gray-700 px-1 py-0.5 rounded text-white">[Z]</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>ボム設置</span>
                          <span className="font-mono bg-gray-800 border border-gray-700 px-1 py-0.5 rounded text-white">[C]</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>ボム投擲</span>
                          <span className="font-mono bg-gray-800 border border-gray-700 px-1 py-0.5 rounded text-white">[X]</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>首爆弾投擲</span>
                          <span className="font-mono bg-gray-800 border border-gray-700 px-1 py-0.5 rounded text-white">[V]</span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="mt-3 text-[9px] text-gray-400 border-t border-gray-800 pt-2">
                    操作を行うとガイドは非表示になります
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className={`bg-[#0a0a0d] flex flex-col border-t md:border-t-0 md:border-l border-gray-800 ${(isPlaying || playOnly || editModeType === 'move_place') ? 'w-full md:w-auto' : 'portrait:flex-1 flex-none max-h-[40vh] md:max-h-none overflow-y-auto md:w-80 md:flex-none'}`}>
          {!isPlaying && !playOnly && (
            <div className="flex p-2 bg-gray-900 border-b border-gray-800 gap-2 shrink-0">
              <button
                onClick={() => setEditModeType('move_place')}
                className={`flex-1 py-1.5 rounded text-xs font-bold font-pixel flex items-center justify-center gap-1.5 transition ${editModeType === 'move_place' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-gray-800 text-gray-400 hover:text-gray-300'}`}
              >
                🕹️ 移動・設置モード
              </button>
              <button
                onClick={() => setEditModeType('panel_input')}
                className={`flex-1 py-1.5 rounded text-xs font-bold font-pixel flex items-center justify-center gap-1.5 transition ${editModeType === 'panel_input' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-gray-800 text-gray-400 hover:text-gray-300'}`}
              >
                📝 パネル編集モード
              </button>
            </div>
          )}

          {(isPlaying || playOnly || editModeType === 'move_place') ? (
            <div className="flex-1 flex flex-col p-4 select-none bg-[#0e0f14] min-h-[220px]">
              {/* コントローラーのヘッダー情報 */}
              <div className="flex justify-between items-center px-1 mb-2 text-[9px] text-gray-500 font-pixel font-bold leading-none">
                <span>SYSTEM: {gameData.engine.toUpperCase()} ENGINE</span>
                <span>{isPlaying ? "MODE: PLAY" : `MODE: EDIT (${editSpeedMult}x)`}</span>
              </div>

              <div className="flex-1 flex items-center justify-center">
                <div className="flex justify-between items-center max-w-sm w-full gap-6">
                  {/* 左側：十字キー */}
                  <div ref={dpadRef} {...dpadProps} className="relative w-32 h-32 touch-none cursor-pointer select-none bg-[#1d1f27] rounded-full shadow-2xl border-4 border-gray-900 flex items-center justify-center">
                    <div className="absolute w-24 h-8 bg-gray-800 rounded shadow pointer-events-none"></div>
                    <div className="absolute w-8 h-24 bg-gray-800 rounded shadow pointer-events-none"></div>
                    <div className="absolute w-8 h-8 bg-gray-900 rounded-full z-10 pointer-events-none border border-gray-800/80"></div>
                    <div className={`absolute top-0.5 left-1/2 -translate-x-1/2 w-8 h-8 pointer-events-none transition-colors rounded-t ${touchRef.current.up ? 'bg-indigo-500/30' : ''} flex items-start justify-center pt-1`}>
                      <span className={`text-[8px] leading-none ${touchRef.current.up ? 'text-indigo-400' : 'text-gray-600'}`}>▲</span>
                    </div>
                    <div className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-8 pointer-events-none transition-colors rounded-b ${touchRef.current.down ? 'bg-indigo-500/30' : ''} flex items-end justify-center pb-1`}>
                      <span className={`text-[8px] leading-none ${touchRef.current.down ? 'text-indigo-400' : 'text-gray-600'}`}>▼</span>
                    </div>
                    <div className={`absolute left-0.5 top-1/2 -translate-y-1/2 w-8 h-8 pointer-events-none transition-colors rounded-l ${touchRef.current.left ? 'bg-indigo-500/30' : ''} flex items-center justify-start pl-1`}>
                      <span className={`text-[8px] leading-none ${touchRef.current.left ? 'text-indigo-400' : 'text-gray-600'}`}>◀</span>
                    </div>
                    <div className={`absolute right-0.5 top-1/2 -translate-y-1/2 w-8 h-8 pointer-events-none transition-colors rounded-r ${touchRef.current.right ? 'bg-indigo-500/30' : ''} flex items-center justify-end pr-1`}>
                      <span className={`text-[8px] leading-none ${touchRef.current.right ? 'text-indigo-400' : 'text-gray-600'}`}>▶</span>
                    </div>
                  </div>

                  {/* 右側：ボタン群 */}
                  {introOpen ? (
                    <div className="flex flex-col gap-2 items-center">
                      <button onClick={enterPlayFromIntro}
                        className="w-28 h-12 border-b-4 border-green-900 active:border-b-0 active:translate-y-1 bg-green-500 active:bg-green-400 text-green-950 font-black text-xs shadow-lg shadow-green-500/30 flex items-center justify-center gap-1.5 transition touch-none select-none">
                        <Play size={12} /> あそぶ
                      </button>
                      <button onClick={enterEditFromIntro}
                        className="w-28 h-9 border border-white/25 bg-white/10 active:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition touch-none select-none">
                        ✏ 改造する
                      </button>
                    </div>
                  ) : (() => {
                    let btnAActive = false; let btnALabel = "";
                    let btnBActive = false; let btnBLabel = "";
                    let btnXActive = false; let btnXLabel = "";
                    let btnYActive = false; let btnYLabel = "";

                    if (!isPlaying && gameData.engine === 'yume25d') {
                      // ゆめにっき3D：十字キーでカーソルを動かし、Aボタンで現在のツール（床/壁/スプライト/開始等）を配置する。
                      btnAActive = true; btnALabel = yume25dTool === 'erase' ? '消す' : '配置';
                    } else if (!isPlaying) {
                      btnAActive = true; btnALabel = "PUT";
                      btnBActive = selectedObjId !== null || selectedObjIdRef.current !== null; btnBLabel = "DEL";
                    } else if (gameData.engine === 'action') {
                      btnAActive = true; btnALabel = "JUMP";
                      btnBActive = true; btnBLabel = "SHOT";
                      btnYActive = true; btnYLabel = "RUN";
                    } else if (gameData.engine === 'touhou') {
                      btnAActive = true; btnALabel = "SHOT";
                      btnBActive = true; btnBLabel = "BOMB";
                      btnYActive = true; btnYLabel = "低速";
                    } else if (gameData.engine === 'onjReze') {
                      btnAActive = true; btnALabel = "⚔️ 攻撃";
                      btnBActive = true; btnBLabel = "🎯 投擲";
                      btnYActive = true; btnYLabel = "💣 ボム";
                      btnXActive = true; btnXLabel = "💀 首爆";
                    } else if (gameData.engine === 'rpg') {
                      btnAActive = true; btnALabel = "決定";
                      btnBActive = true; btnBLabel = "取消";
                    } else if (gameData.engine === 'yume25d') {
                      btnAActive = true; btnALabel = "JUMP";
                      btnBActive = true; btnBLabel = "話す";
                      btnYActive = true; btnYLabel = "DASH";
                    }

                    return (
                      <div className="relative w-32 h-32 flex items-center justify-center select-none shrink-0">
                        {/* Yボタン (左) */}
                        <button disabled={!btnYActive} {...padProps('slow')}
                          className={`absolute left-0 w-11 h-11 rounded-full border-b-4 shadow-lg flex flex-col items-center justify-center transition touch-none select-none
                            ${btnYActive ? 'bg-amber-600 border-amber-800 active:border-b-0 active:translate-y-0.5 active:bg-amber-500 text-white' : 'bg-gray-800/20 border-gray-900/20 text-gray-700 opacity-20 pointer-events-none'}`}>
                          <span className="text-[9px] font-bold leading-none">Y</span>
                          {btnYLabel && <span className="text-[6px] font-pixel scale-90 mt-0.5 leading-none">{btnYLabel}</span>}
                        </button>
                        {/* Xボタン (上) */}
                        <button disabled={!btnXActive} {...padProps('slow')}
                          className={`absolute top-0 w-11 h-11 rounded-full border-b-4 shadow-lg flex flex-col items-center justify-center transition touch-none select-none
                            ${btnXActive ? 'bg-purple-600 border-purple-800 active:border-b-0 active:translate-y-0.5 active:bg-purple-500 text-white' : 'bg-gray-800/20 border-gray-900/20 text-gray-700 opacity-20 pointer-events-none'}`}>
                          <span className="text-[9px] font-bold leading-none">X</span>
                          {btnXLabel && <span className="text-[6px] font-pixel scale-90 mt-0.5 leading-none">{btnXLabel}</span>}
                        </button>
                        {/* Bボタン (下) */}
                        <button disabled={!btnBActive} {...padProps('shoot')}
                          className={`absolute bottom-0 w-11 h-11 rounded-full border-b-4 shadow-lg flex flex-col items-center justify-center transition touch-none select-none
                            ${btnBActive ? 'bg-blue-600 border-blue-800 active:border-b-0 active:translate-y-0.5 active:bg-blue-500 text-white' : 'bg-gray-800/20 border-gray-900/20 text-gray-700 opacity-20 pointer-events-none'}`}>
                          <span className="text-[9px] font-bold leading-none">B</span>
                          {btnBLabel && <span className="text-[6px] font-pixel scale-90 mt-0.5 leading-none">{btnBLabel}</span>}
                        </button>
                        {/* Aボタン (右) */}
                        <button disabled={!btnAActive} {...padProps('action')}
                          className={`absolute right-0 w-11 h-11 rounded-full border-b-4 shadow-lg flex flex-col items-center justify-center transition touch-none select-none
                            ${btnAActive ? 'bg-red-600 border-red-800 active:border-b-0 active:translate-y-0.5 active:bg-red-500 text-white font-bold' : 'bg-gray-800/20 border-gray-900/20 text-gray-700 opacity-20 pointer-events-none'}`}>
                          <span className="text-[9px] font-bold leading-none">A</span>
                          {btnALabel && <span className="text-[6px] font-pixel scale-90 mt-0.5 leading-none">{btnALabel}</span>}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* 中央下部：SELECT / START ボタン */}
              {!introOpen && (
                <div className="flex gap-8 justify-center items-center mt-3 pt-1 border-t border-gray-800/40 w-full shrink-0 select-none">
                  {/* SELECT */}
                  <div className="flex flex-col items-center gap-0.5">
                    <button onClick={handleSelectPress}
                      className="w-11 h-3.5 bg-gray-700 active:bg-gray-600 rounded-full border border-gray-900 shadow-md transform rotate-12 active:translate-y-0.5 transition touch-none cursor-pointer"
                      title="SELECT" />
                    <span className="text-[7px] font-pixel font-bold text-gray-600 tracking-wider">SELECT</span>
                  </div>
                  {/* START */}
                  <div className="flex flex-col items-center gap-0.5">
                    <button onClick={handleStartPress}
                      className="w-11 h-3.5 bg-gray-700 active:bg-gray-600 rounded-full border border-gray-900 shadow-md transform rotate-12 active:translate-y-0.5 transition touch-none cursor-pointer"
                      title="START" />
                    <span className="text-[7px] font-pixel font-bold text-gray-600 tracking-wider">START</span>
                  </div>
                </div>
              )}

              {/* 浮遊（ホバー）操作：ゆめにっき3D編集中・3Dビュー表示時のみ。Minecraft創造飛行風。 */}
              {!isPlaying && gameData.engine === 'yume25d' && yume25dView === '3d' && (
                <div className="flex items-center justify-center gap-1.5 mt-3 pt-2 border-t border-gray-800/40 w-full shrink-0 select-none touch-none">
                  {yume25dHoverMode && (
                    <>
                      <button
                        onPointerDown={e => { e.preventDefault(); yume25dMakerRef.current?.setFlyUp(true); }}
                        onPointerUp={() => yume25dMakerRef.current?.setFlyUp(false)}
                        onPointerCancel={() => yume25dMakerRef.current?.setFlyUp(false)}
                        className="w-11 h-11 bg-emerald-700/85 active:bg-emerald-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">
                        ▲上昇
                      </button>
                      <button
                        onPointerDown={e => { e.preventDefault(); yume25dMakerRef.current?.setFlyDown(true); }}
                        onPointerUp={() => yume25dMakerRef.current?.setFlyDown(false)}
                        onPointerCancel={() => yume25dMakerRef.current?.setFlyDown(false)}
                        className="w-11 h-11 bg-sky-700/85 active:bg-sky-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">
                        ▼下降
                      </button>
                    </>
                  )}
                  <button
                    onPointerDown={e => { e.preventDefault(); setYume25dHoverMode(h => !h); }}
                    className={`h-11 px-3 rounded-full text-[10px] font-bold flex items-center justify-center border ${yume25dHoverMode ? 'bg-violet-600 border-violet-300 text-white' : 'bg-gray-800/85 border-gray-500 text-gray-200'}`}>
                    {yume25dHoverMode ? '浮遊中' : '浮遊'}
                  </button>
                </div>
              )}

              {/* ダイアログ送りボタン等 */}
              {isPlaying && activeDialogue && (
                <button
                  className="w-full py-2.5 mt-2 bg-yellow-700/80 border border-yellow-500 text-yellow-100 font-bold text-xs active:bg-yellow-600 touch-none select-none rounded"
                  onPointerDown={e => { e.preventDefault(); dialogueCutsceneRef.current?.advance(); }}
                >
                  次へ ▼
                </button>
              )}

              {/* コメント欄 */}
              {isPlaying && postId && onComment && (
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    const t = commentText.trim();
                    if (!t) return;
                    onComment(t, userId);
                    setCommentText('');
                  }}
                  className="flex gap-1.5 mt-2"
                >
                  <input
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    placeholder="コメントを送る…"
                    maxLength={50}
                    className="flex-1 bg-gray-700/80 border border-gray-600 px-3 py-1.5 text-xs text-white outline-none placeholder:text-gray-500"
                  />
                  <button
                    type="submit"
                    disabled={!commentText.trim()}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs text-white font-bold shrink-0"
                  >
                    送信
                  </button>
                </form>
              )}
            </div>
          ) : (
            <>
              {/* ── タブバー：基本3つ＋詳細▼ で圧迫感を抑える ── */}
              <div className="flex flex-wrap border-b border-gray-800 shrink-0">
                {/* 基本タブ（常時表示） */}
                {([
                  ['map', 'マップ'],
                  ...(gameData.engine !== 'touhou' ? [['object', 'オブジェ']] : []),
                  ['char', 'キャラ'],
                ] as [EditorTab, string][]).map(([id, label]) => (
                  <button key={id} onClick={() => setEditorTab(id)}
                    className={`flex-none py-3 px-3.5 text-[11px] font-bold transition ${editorTab === id ? 'text-blue-400 border-b-2 border-blue-500 bg-[#0f0f11]' : 'text-gray-500 hover:text-gray-300'}`}>
                    {label}
                  </button>
                ))}

                {/* 詳細タブ（showAdvancedTabs=trueのとき表示） */}
                {showAdvancedTabs && ([
                  ['asset', 'アセット'], ['sound', 'サウンド'],
                  ...(gameData.engine !== 'touhou' ? [['screen', '画面']] : []),
                  ...(gameData.engine === 'touhou' ? [['spell', '会話']] : []),
                ] as [EditorTab, string][]).map(([id, label]) => (
                  <button key={id} onClick={() => setEditorTab(id)}
                    className={`flex-none py-3 px-3 text-[11px] font-bold transition ${editorTab === id ? 'text-blue-400 border-b-2 border-blue-500 bg-[#0f0f11]' : 'text-gray-600 hover:text-gray-400'}`}>
                    {label}
                  </button>
                ))}

                  {/* シーンタブ（scenes 定義済み preset のみ） */}
                {gameData.scenes && (
                  <button onClick={() => setEditorTab('scene' as EditorTab)}
                    className={`flex-none py-3 px-3.5 text-[11px] font-bold transition ${editorTab === ('scene' as EditorTab) ? 'text-violet-400 border-b-2 border-violet-500 bg-[#0f0f11]' : 'text-gray-500 hover:text-gray-300'}`}>
                    シーン
                  </button>
                )}

              {/* 詳細トグル */}
                <button
                  onClick={() => {
                    setShowAdvancedTabs(v => {
                      if (v && !['map', 'object', 'char'].includes(editorTab)) setEditorTab('map');
                      return !v;
                    });
                  }}
                  className="ml-auto flex-none py-3 px-3 text-[10px] font-bold text-gray-600 hover:text-gray-400 transition whitespace-nowrap">
                  {showAdvancedTabs ? '詳細 ▲' : '詳細 ▼'}
                </button>
              </div>





              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {/* ── SPELL（弾幕スクリプト） ── */}
                {editorTab === 'spell' && (
                  <div className="space-y-3">
                    {/* ── フェーズ構成エディタ ── */}
                    <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-bold text-yellow-300">フェーズ構成</p>
                        <button
                          onClick={() => {
                            const newPhase: StagePhase = { id: uid(), kind: 'wave', label: `フェーズ ${(gameData.phases?.length ?? 0)}` };
                            setGameData(p => ({ ...p, phases: [...(p.phases ?? []), newPhase] }));
                          }}
                          className="inline-flex items-center text-[11px] text-blue-400 border border-blue-700 rounded-md px-3 py-1.5 active:bg-blue-500/10">
                          + 追加
                        </button>
                      </div>
                      {(gameData.phases ?? []).length === 0 && (
                        <p className="text-[10px] text-gray-600">フェーズ未定義（自動2フェーズ）</p>
                      )}
                      {(gameData.phases ?? []).map((ph, pi) => (
                        <div key={ph.id} className="rounded border border-gray-700 bg-gray-800 p-2 space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-gray-500 w-4">{pi}</span>
                            <input value={ph.label ?? ''}
                              onChange={e => setGameData(p => ({ ...p, phases: p.phases!.map((x, i) => i === pi ? { ...x, label: e.target.value } : x) }))}
                              placeholder="ラベル"
                              className="flex-1 bg-gray-700 rounded px-1.5 py-1 text-[11px] text-white outline-none" />
                            <select value={ph.kind}
                              onChange={e => setGameData(p => ({ ...p, phases: p.phases!.map((x, i) => i === pi ? { ...x, kind: e.target.value as 'wave'|'boss' } : x) }))}
                              className="bg-gray-700 text-[11px] rounded px-1 py-1 text-white outline-none">
                              <option value="wave">雑魚戦</option>
                              <option value="boss">ボス戦</option>
                            </select>
                            <button onClick={() => setGameData(p => ({ ...p, phases: p.phases!.filter((_, i) => i !== pi) }))}
                              className="shrink-0 grid place-items-center w-8 h-8 -my-1 rounded-lg text-red-400 hover:text-red-300 active:bg-red-500/20 text-sm">✕</button>
                          </div>
                          {/* セリフ行 */}
                          <div className="space-y-2">
                            {(ph.dialogue ?? []).map((dl, di) => {
                              const previewKey = `${pi}-${di}`;
                              const isActive = activePreviewKey === previewKey;
                              const activatePreview = () => setActivePreviewKey(previewKey);
                              const updDl = (patch: Partial<DialogueLine>) => {
                                setGameData(p => ({
                                  ...p,
                                  phases: p.phases!.map((x, i) => i !== pi ? x : {
                                    ...x, dialogue: x.dialogue!.map((d, j) => j === di ? { ...d, ...patch } : d)
                                  })
                                }));
                                setActivePreviewKey(previewKey);
                              };
                              return (
                                <div key={di}
                                  className={`rounded-lg border p-2 space-y-1.5 transition-colors ${isActive ? 'border-blue-500 bg-blue-950/30' : 'border-gray-600 bg-gray-800'}`}>
                                  {/* 1行目：絵文字・話者・削除 */}
                                  <div className="flex gap-1 items-center">
                                    <input value={dl.emoji ?? ''} placeholder="🎀"
                                      onChange={e => updDl({ emoji: e.target.value })}
                                      onFocus={activatePreview}
                                      className="w-8 bg-gray-700 rounded px-1 py-1.5 text-base text-center text-white outline-none" />
                                    <input value={dl.speaker}
                                      onChange={e => updDl({ speaker: e.target.value })}
                                      onFocus={activatePreview}
                                      placeholder="話者名"
                                      className="flex-1 bg-gray-700 rounded px-2 py-1.5 text-[12px] text-white outline-none" />
                                    <button onClick={() => {
                                      if (isActive) setActivePreviewKey(null);
                                      setGameData(p => ({
                                        ...p,
                                        phases: p.phases!.map((x, i) => i !== pi ? x : { ...x, dialogue: x.dialogue!.filter((_, j) => j !== di) })
                                      }));
                                    }} className="shrink-0 grid place-items-center w-8 h-8 -my-1 rounded-lg text-red-400 hover:text-red-300 active:bg-red-500/20 text-sm">✕</button>
                                  </div>
                                  {/* 2行目：立ち絵 URL */}
                                  <input value={dl.imageSrc ?? ''}
                                    onChange={e => updDl({ imageSrc: e.target.value || undefined })}
                                    onFocus={activatePreview}
                                    placeholder="立ち絵URL (省略でemoji)"
                                    className="w-full bg-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-300 outline-none" />
                                  {/* 3行目：位置・倍率（changeイベントで反映） */}
                                  <div className="flex gap-1 items-center flex-wrap">
                                    <span className="text-[9px] text-gray-500 shrink-0">位置</span>
                                    <label className="text-[9px] text-gray-400 flex items-center gap-0.5">
                                      X<input type="text" inputMode="numeric" defaultValue={dl.imageX ?? 0}
                                        onFocus={activatePreview}
                                        onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updDl({ imageX: v }); }}
                                        className="w-12 ml-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" />
                                    </label>
                                    <label className="text-[9px] text-gray-400 flex items-center gap-0.5">
                                      Y<input type="text" inputMode="numeric" defaultValue={dl.imageY ?? 0}
                                        onFocus={activatePreview}
                                        onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updDl({ imageY: v }); }}
                                        className="w-12 ml-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" />
                                    </label>
                                    <label className="text-[9px] text-gray-400 flex items-center gap-0.5 ml-2">
                                      倍率<input type="text" inputMode="decimal" defaultValue={dl.imageScale ?? 1}
                                        onFocus={activatePreview}
                                        onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updDl({ imageScale: v }); }}
                                        className="w-14 ml-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" />
                                    </label>
                                  </div>
                                  {/* 4行目：セリフ textarea（最下部） */}
                                  <textarea value={dl.text}
                                    onChange={e => updDl({ text: e.target.value })}
                                    onFocus={activatePreview}
                                    placeholder="セリフテキスト（改行可）"
                                    rows={2}
                                    className="w-full bg-gray-700 rounded px-1.5 py-1 text-[10px] text-white outline-none resize-y" />
                                </div>
                              );
                            })}
                            <button onClick={() => {
                              const newLine: DialogueLine = { speaker: '', emoji: '', text: '', imageX: 0, imageY: 0, imageScale: 1 };
                              setGameData(p => ({
                                ...p,
                                phases: p.phases!.map((x, i) => i !== pi ? x : {
                                  ...x, dialogue: [...(x.dialogue ?? []), newLine]
                                })
                              }));
                            }} className="inline-flex items-center px-3 py-2 rounded-md text-[11px] text-blue-400 active:bg-blue-500/10">+ セリフ追加</button>
                          </div>
                          {/* ── アウトロセリフ（フェーズクリア後） ── */}
                          <div className="mt-2 space-y-2">
                            <p className="text-[10px] text-yellow-400/80 font-bold">撃破後セリフ</p>
                            {(ph.outroDialogue ?? []).map((dl, di) => {
                              const previewKey = `outro-${pi}-${di}`;
                              const isActive = activePreviewKey === previewKey;
                              const activatePreview = () => setActivePreviewKey(previewKey);
                              const updODl = (patch: Partial<DialogueLine>) => {
                                setGameData(p => ({
                                  ...p,
                                  phases: p.phases!.map((x, i) => i !== pi ? x : {
                                    ...x, outroDialogue: (x.outroDialogue ?? []).map((d, j) => j === di ? { ...d, ...patch } : d)
                                  })
                                }));
                                setActivePreviewKey(previewKey);
                              };
                              return (
                                <div key={di}
                                  className={`rounded-lg border p-2 space-y-1.5 transition-colors ${isActive ? 'border-yellow-500 bg-yellow-950/30' : 'border-gray-600 bg-gray-800'}`}>
                                  <div className="flex gap-1 items-center">
                                    <input value={dl.emoji ?? ''} placeholder="🎀"
                                      onChange={e => updODl({ emoji: e.target.value })}
                                      onFocus={activatePreview}
                                      className="w-8 bg-gray-700 rounded px-1 py-1.5 text-base text-center text-white outline-none" />
                                    <input value={dl.speaker}
                                      onChange={e => updODl({ speaker: e.target.value })}
                                      onFocus={activatePreview}
                                      placeholder="話者名"
                                      className="flex-1 bg-gray-700 rounded px-2 py-1.5 text-[12px] text-white outline-none" />
                                    <button onClick={() => {
                                      if (isActive) setActivePreviewKey(null);
                                      setGameData(p => ({
                                        ...p,
                                        phases: p.phases!.map((x, i) => i !== pi ? x : { ...x, outroDialogue: (x.outroDialogue ?? []).filter((_, j) => j !== di) })
                                      }));
                                    }} className="shrink-0 grid place-items-center w-8 h-8 -my-1 rounded-lg text-red-400 hover:text-red-300 active:bg-red-500/20 text-sm">✕</button>
                                  </div>
                                  <input value={dl.imageSrc ?? ''}
                                    onChange={e => updODl({ imageSrc: e.target.value || undefined })}
                                    onFocus={activatePreview}
                                    placeholder="立ち絵URL (省略でemoji)"
                                    className="w-full bg-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-300 outline-none" />
                                  <div className="flex gap-1 items-center flex-wrap">
                                    <span className="text-[9px] text-gray-500 shrink-0">位置</span>
                                    <label className="text-[9px] text-gray-400 flex items-center gap-0.5">
                                      X<input type="text" inputMode="numeric" defaultValue={dl.imageX ?? 0}
                                        onFocus={activatePreview}
                                        onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updODl({ imageX: v }); }}
                                        className="w-12 ml-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" />
                                    </label>
                                    <label className="text-[9px] text-gray-400 flex items-center gap-0.5">
                                      Y<input type="text" inputMode="numeric" defaultValue={dl.imageY ?? 0}
                                        onFocus={activatePreview}
                                        onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updODl({ imageY: v }); }}
                                        className="w-12 ml-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" />
                                    </label>
                                    <label className="text-[9px] text-gray-400 flex items-center gap-0.5 ml-2">
                                      倍率<input type="text" inputMode="decimal" defaultValue={dl.imageScale ?? 1}
                                        onFocus={activatePreview}
                                        onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updODl({ imageScale: v }); }}
                                        className="w-14 ml-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" />
                                    </label>
                                  </div>
                                  <textarea value={dl.text}
                                    onChange={e => updODl({ text: e.target.value })}
                                    onFocus={activatePreview}
                                    placeholder="セリフテキスト（改行可）"
                                    rows={2}
                                    className="w-full bg-gray-700 rounded px-1.5 py-1 text-[10px] text-white outline-none resize-y" />
                                </div>
                              );
                            })}
                            <button onClick={() => {
                              const newLine: DialogueLine = { speaker: '', emoji: '', text: '', imageX: 0, imageY: 0, imageScale: 1 };
                              setGameData(p => ({
                                ...p,
                                phases: p.phases!.map((x, i) => i !== pi ? x : {
                                  ...x, outroDialogue: [...(x.outroDialogue ?? []), newLine]
                                })
                              }));
                            }} className="inline-flex items-center px-3 py-2 rounded-md text-[11px] text-yellow-400 active:bg-yellow-500/10">+ 撃破後セリフ追加</button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* ── MiniScript エディタ（選択オブジェクト） ── */}
                    {selObj ? (
                      <>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400">
                          <span className="font-bold text-white">{selObj.emoji} {selObj.name || 'オブジェクト'}</span>
                          <span>フェーズ:</span>
                          <input type="number" min={0} max={20} value={selObj.phase ?? 0}
                            onChange={e => updObj({ phase: Number(e.target.value) })}
                            className="w-12 bg-gray-700 rounded px-1.5 py-0.5 text-white text-center outline-none text-[11px]" />
                        </div>
                        <div className="text-[9px] text-gray-500 leading-relaxed bg-gray-800/60 rounded p-2">
                          <span className="text-gray-400 font-bold">API:</span>{' '}
                          wait(f) / moveTo(x,y,f) / move(vx,vy) / stop() / exit()<br />
                          shot(deg,spd,color) / shotN(n,base,spread,spd,color) / shotPlayer(spd,color,jitter) / shotSpiral(n,base,spd,color)<br />
                          getPlayerAngle() / getX() / getY() / rand(a,b) / range(a,b,step)<br />
                          <span className="text-yellow-400">定数:</span> col row startX startY W H
                        </div>
                        <textarea
                          value={selObj.miniScript ?? ''}
                          onChange={e => updObj({ miniScript: e.target.value, bullet: 'none' })}
                          spellCheck={false}
                          rows={14}
                          placeholder={'// wave 敵の例\nwait(row * 25)\nmoveTo(startX, 96, 50)\nfor t in range(0, 3, 1)\n  shotPlayer(2.5, 5, 10)\n  wait(80)\nend for\nmoveTo(startX, 520, 70)\nexit()'}
                          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-2 text-[11px] text-green-300 font-mono resize-y outline-none leading-relaxed"
                          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
                        />
                      </>
                    ) : (
                      <div className="text-center py-4 space-y-1">
                        <p className="text-2xl">📝</p>
                        <p className="text-xs text-gray-500">オブジェクトを選択すると MiniScript を編集できます</p>
                      </div>
                    )}
                  </div>
                )}
                {/* ── MAP（yume25d は 2D 見下ろし編集/3D 確認パネルをここに吸収） ── */}
                {editorTab === 'map' && gameData.engine === 'yume25d' && (
                  <Yume25DEditorPanel
                    layout={gameData.layout25d!}
                    onLayoutChange={updater => setGameData(prev => prev.layout25d ? { ...prev, layout25d: updater(prev.layout25d) } : prev)}
                    onPickImage={(target) => setPicker({ mode: 'image', target })}
                    view={yume25dView}
                    onViewChange={setYume25dView}
                    tool={yume25dTool}
                    onToolChange={setYume25dTool}
                    level={yume25dLevel}
                    onLevelChange={setYume25dLevel}
                    selFloor={yume25dSelFloor}
                    onSelFloorChange={setYume25dSelFloor}
                    selWall={yume25dSelWall}
                    onSelWallChange={setYume25dSelWall}
                    selSprite={yume25dSelSprite}
                    onSelSpriteChange={setYume25dSelSprite}
                    settingsOpen={yume25dSettingsOpen}
                    onSettingsOpenChange={setYume25dSettingsOpen}
                    talkTargetId={yume25dTalkTargetId}
                  />
                )}
                {editorTab === 'map' && gameData.engine !== 'yume25d' && (
                  <div className="space-y-3">
                    {/* ── マップサイズ（自由拡張・東方以外）── */}
                    {gameData.engine !== 'touhou' && (
                      <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 space-y-2">
                        <p className="text-[11px] font-bold text-gray-300">マップサイズ</p>
                        <label className="flex items-center justify-between text-[10px] text-gray-400">
                          <span>横幅（タイル数・{COLS}以上）</span>
                          <input type="text" inputMode="numeric" key={`mw-${presetId}-${curWorldCols(gameData)}`} defaultValue={curWorldCols(gameData)}
                            onBlur={e => { const v = Math.max(COLS, Math.round(Number(e.target.value) || COLS)); e.target.value = String(v); setGameData(p => applyWorldSize(p, v, curWorldRows(p))); }}
                            className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 outline-none text-right" />
                        </label>
                        <label className="flex items-center justify-between text-[10px] text-gray-400">
                          <span>高さ（タイル数・{ROWS}以上）</span>
                          <input type="text" inputMode="numeric" key={`mh-${presetId}-${curWorldRows(gameData)}`} defaultValue={curWorldRows(gameData)}
                            onBlur={e => { const v = Math.max(ROWS, Math.round(Number(e.target.value) || ROWS)); e.target.value = String(v); setGameData(p => applyWorldSize(p, curWorldCols(p), v)); }}
                            className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 outline-none text-right" />
                        </label>
                        <p className="text-[10px] text-gray-500">{COLS}×{ROWS} で1画面固定。広げるとカメラが追従します。</p>
                      </div>
                    )}

                    {/* ── 描画レイヤー切り替え ── */}
                    <div className="flex rounded-lg border border-gray-700 overflow-hidden text-[11px]">
                      <button onClick={() => setEditMapLayer('base')}
                        className={`flex-1 py-1.5 ${editMapLayer === 'base' ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400'}`}>地面（当たり判定）</button>
                      <button onClick={() => setEditMapLayer('overlay')}
                        className={`flex-1 py-1.5 ${editMapLayer === 'overlay' ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400'}`}>上層（木の上部等・手前）</button>
                    </div>
                    {editMapLayer === 'overlay' && (
                      <p className="text-[10px] text-gray-500">上層はプレイヤーより手前に描画され、当たり判定を持ちません。プレイヤーが真下付近にいる間は半透明化します。</p>
                    )}
                    {/* ── タイル塗りヒント ── */}
                    <p className="text-[10px] text-gray-500 flex items-center gap-1"><Smartphone size={12} /> タイルを選択して画面をタップ／ドラッグ</p>
                    <p className="text-[10px] text-green-400 flex items-center gap-1">🏁 マーカーをドラッグしてプレイヤーの初期位置を変更</p>
                    <div className="space-y-1.5">
                      {Object.entries(gameData.tiles).map(([idStr, tile]) => {
                        const id = Number(idStr);
                        return (
                          <div key={id} className={`rounded-lg border ${selectedTileId === id ? 'border-blue-500 bg-gray-800' : 'border-gray-700 bg-gray-900'}`}>
                            <div className="flex items-center gap-2 p-2">
                              <button onClick={() => setSelectedTileId(id)} className="w-6 h-6 shrink-0 rounded border border-gray-600 overflow-hidden" style={{ backgroundColor: tile.color }}>
                                {tile.imageUrl && <SpriteThumbnail spriteUrl={tile.imageUrl} size={24} imgCache={imgCache} keyedCache={keyedCache} className="w-full h-full" />}
                              </button>
                              <input value={tile.name} onChange={e => updateTile(id, { name: e.target.value })}
                                className="flex-1 min-w-0 bg-transparent text-[11px] text-gray-200 outline-none border-b border-transparent focus:border-gray-600" />
                              <input type="color" value={tile.color} onChange={e => updateTile(id, { color: e.target.value })}
                                className="w-6 h-6 rounded bg-transparent border border-gray-700 cursor-pointer shrink-0" title="色" />
                              {id !== 0 && <button onClick={() => deleteTile(id)} className="shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={16} /></button>}
                            </div>
                            {selectedTileId === id && (
                              <div className="flex items-center gap-3 px-2 pb-2 text-[10px] text-gray-400">
                                <label className="flex items-center gap-1"><input type="checkbox" checked={tile.passable} onChange={e => updateTile(id, { passable: e.target.checked })} className="accent-blue-500" />通行可</label>
                                <select value={tile.special || ''} onChange={e => updateTile(id, { special: e.target.value || undefined })} className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 outline-none">
                                  <option value="">特殊なし</option>
                                  <option value="goal">ゴール</option>
                                  <option value="trap">トラップ</option>
                                  <option value="item">アイテム</option>
                                  <option value="grass">草むら</option>
                                </select>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={addTile} className="w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-gray-600 text-[11px] text-gray-400 hover:bg-gray-100/5"><Plus size={13} />タイルを追加</button>

                    {/* ── マップ背景画像 ── */}
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">マップ背景（画像/GIF）</label>
                      <button onClick={() => setPicker({ mode: 'image', target: { t: 'mapBg' } })}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[11px] text-gray-300">
                        <ImageIcon size={13} />背景画像を参照
                      </button>
                      {gameData.mapBgRef && (
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-400 bg-gray-900 rounded px-2 py-1.5 border border-gray-800">
                          {gameData.mapBgUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={gameData.mapBgUrl} alt="" className="w-8 h-8 object-cover rounded shrink-0" />}
                          <span className="truncate flex-1">{refLabel(gameData.mapBgRef)}</span>
                          <button onClick={() => setGameData(p => ({ ...p, mapBgRef: undefined, mapBgUrl: undefined }))} className="shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={16} /></button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── SCREEN（タイトル / エンディング画面）── */}
                {editorTab === 'screen' && (
                  <div className="space-y-4">
                    {/* ── タイトル画面 ── */}
                    <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[12px] font-bold text-gray-200">🏯 タイトル画面</p>
                        {gameData.titleScreen && (
                          <button onClick={() => setGameData(p => ({ ...p, titleScreen: undefined }))} className="shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={16} /></button>
                        )}
                      </div>
                      {!gameData.titleScreen ? (
                        <button onClick={() => setGameData(p => ({ ...p, titleScreen: { ...defaultTitleScreen(title.trim() || p.name) } }))}
                          className="w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-gray-600 text-[11px] text-gray-400 hover:bg-gray-100/5"><Plus size={13} />タイトル画面を追加</button>
                      ) : (
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-[11px] text-gray-300"><input type="checkbox" checked={gameData.titleScreen.enabled} onChange={e => updTitle({ enabled: e.target.checked })} className="accent-blue-500" />有効（プレイ開始前に表示）</label>
                          <input value={gameData.titleScreen.heading} onChange={e => updTitle({ heading: e.target.value })} placeholder="ゲームタイトル"
                            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[12px] text-gray-100 outline-none" />
                          <input value={gameData.titleScreen.subtitle ?? ''} onChange={e => updTitle({ subtitle: e.target.value })} placeholder="サブタイトル（任意）"
                            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300 outline-none" />
                          <label className="flex items-center gap-2 text-[10px] text-gray-400">文字色<input type="color" value={gameData.titleScreen.textColor ?? '#ffffff'} onChange={e => updTitle({ textColor: e.target.value })} className="w-9 h-9 rounded-lg border border-gray-700 bg-transparent cursor-pointer" /></label>
                          {/* 背景画像 */}
                          <button onClick={() => setPicker({ mode: 'image', target: { t: 'titleBg' } })} className="w-full flex items-center justify-center gap-1 py-1.5 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[10px] text-gray-300"><ImageIcon size={12} />背景画像を参照</button>
                          {gameData.titleScreen.bgRef && (
                            <div className="flex items-center gap-2 text-[9px] text-gray-400 bg-gray-800 rounded px-2 py-1 border border-gray-700">
                              {gameData.titleScreen.bgUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={gameData.titleScreen.bgUrl} alt="" className="w-7 h-7 object-cover rounded shrink-0" />}
                              <span className="truncate flex-1">{refLabel(gameData.titleScreen.bgRef)}</span>
                              <button onClick={() => updTitle({ bgRef: undefined, bgUrl: undefined })} className="shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={16} /></button>
                            </div>
                          )}
                          {/* BGM */}
                          <button onClick={() => setPicker({ mode: 'bgm', target: { t: 'titleBgm' } })} className="w-full flex items-center justify-center gap-1 py-1.5 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[10px] text-gray-300"><Music size={12} />BGMを参照</button>
                          {gameData.titleScreen.bgmRef && (
                            <>
                              <div className="flex items-center gap-2 text-[9px] text-gray-400 bg-gray-800 rounded px-2 py-1 border border-gray-700">
                                <span className="truncate flex-1">{refLabel(gameData.titleScreen.bgmRef)}</span>
                                <button onClick={() => updTitle({ bgmRef: undefined })} className="shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={16} /></button>
                              </div>
                              <BgmVolumeSettings
                                bgm={{ ref: gameData.titleScreen.bgmRef }}
                                onChange={(newRef) => updTitle({ bgmRef: newRef })}
                              />
                              <MmlLoopSettings
                                bgm={{ ref: gameData.titleScreen.bgmRef }}
                                onChange={(newRef) => updTitle({ bgmRef: newRef })}
                              />
                            </>
                          )}
                          {/* 開始ボタン */}
                          <p className="text-[10px] text-gray-400 font-bold mt-1">開始ボタンの表示名</p>
                          {gameData.titleScreen.menu.map((mi, i) => (
                            <input key={i} value={mi.label} onChange={e => updTitle({ menu: gameData.titleScreen!.menu.map((m, j) => j === i ? { ...m, label: e.target.value } : m) })}
                              className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-gray-200 outline-none" />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ── エンディング画面 ── */}
                    <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[12px] font-bold text-gray-200">🎬 エンディング画面</p>
                        {gameData.ending && (
                          <button onClick={() => setGameData(p => ({ ...p, ending: undefined }))} className="shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={16} /></button>
                        )}
                      </div>
                      {!gameData.ending ? (
                        <button onClick={() => setGameData(p => ({ ...p, ending: { ...defaultEndingScreen() } }))}
                          className="w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-gray-600 text-[11px] text-gray-400 hover:bg-gray-100/5"><Plus size={13} />エンディング画面を追加</button>
                      ) : (
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-[11px] text-gray-300"><input type="checkbox" checked={gameData.ending.enabled} onChange={e => updEnding({ enabled: e.target.checked })} className="accent-blue-500" />有効（クリア時に表示）</label>
                          <input value={gameData.ending.heading} onChange={e => updEnding({ heading: e.target.value })} placeholder="見出し（例: THE END）"
                            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[12px] text-gray-100 outline-none" />
                          <textarea value={gameData.ending.message ?? ''} onChange={e => updEnding({ message: e.target.value })} placeholder="本文（任意）" rows={2}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300 outline-none resize-y" />
                          <label className="flex items-center gap-2 text-[10px] text-gray-400">文字色<input type="color" value={gameData.ending.textColor ?? '#ffffff'} onChange={e => updEnding({ textColor: e.target.value })} className="w-9 h-9 rounded-lg border border-gray-700 bg-transparent cursor-pointer" /></label>
                          <button onClick={() => setPicker({ mode: 'image', target: { t: 'endingBg' } })} className="w-full flex items-center justify-center gap-1 py-1.5 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[10px] text-gray-300"><ImageIcon size={12} />背景画像を参照</button>
                          {gameData.ending.bgRef && (
                            <div className="flex items-center gap-2 text-[9px] text-gray-400 bg-gray-800 rounded px-2 py-1 border border-gray-700">
                              {gameData.ending.bgUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={gameData.ending.bgUrl} alt="" className="w-7 h-7 object-cover rounded shrink-0" />}
                              <span className="truncate flex-1">{refLabel(gameData.ending.bgRef)}</span>
                              <button onClick={() => updEnding({ bgRef: undefined, bgUrl: undefined })} className="shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={16} /></button>
                            </div>
                          )}
                          <button onClick={() => setPicker({ mode: 'bgm', target: { t: 'endingBgm' } })} className="w-full flex items-center justify-center gap-1 py-1.5 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[10px] text-gray-300"><Music size={12} />BGMを参照</button>
                          {gameData.ending.bgmRef && (
                            <>
                              <div className="flex items-center gap-2 text-[9px] text-gray-400 bg-gray-800 rounded px-2 py-1 border border-gray-700">
                                <span className="truncate flex-1">{refLabel(gameData.ending.bgmRef)}</span>
                                <button onClick={() => updEnding({ bgmRef: undefined })} className="shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={16} /></button>
                              </div>
                              <BgmVolumeSettings
                                bgm={{ ref: gameData.ending.bgmRef }}
                                onChange={(newRef) => updEnding({ bgmRef: newRef })}
                              />
                              <MmlLoopSettings
                                bgm={{ ref: gameData.ending.bgmRef }}
                                onChange={(newRef) => updEnding({ bgmRef: newRef })}
                              />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── OBJECT ── */}
                {editorTab === 'object' && (
                  <div className="space-y-3">
                    {/* ── 選択中オブジェクト or 新規テンプレート ── */}
                    {selObj ? (<>
                      <div key={selObj.id} className="rounded-lg border border-yellow-600/50 bg-gray-900 p-2.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-yellow-400 font-bold flex items-center gap-1">
                            <Smartphone size={11} /> 選択中
                          </span>
                          <div className="flex gap-1">
                            <button onClick={() => moveObj(0, -1)} className="grid place-items-center min-w-[2.25rem] h-9 px-2 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-lg text-sm text-gray-200" title="上に移動">↑</button>
                            <button onClick={() => moveObj(0, 1)} className="grid place-items-center min-w-[2.25rem] h-9 px-2 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-lg text-sm text-gray-200" title="下に移動">↓</button>
                            <button onClick={() => moveObj(-1, 0)} className="grid place-items-center min-w-[2.25rem] h-9 px-2 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-lg text-sm text-gray-200" title="左に移動">←</button>
                            <button onClick={() => moveObj(1, 0)} className="grid place-items-center min-w-[2.25rem] h-9 px-2 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-lg text-sm text-gray-200" title="右に移動">→</button>
                            <button onClick={() => { setSelectedObjId(null); }} className="grid place-items-center min-w-[2.25rem] h-9 px-2 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-lg text-sm text-gray-200">解除</button>
                            <button onClick={delObj} className="grid place-items-center min-w-[2.25rem] h-9 px-2 bg-red-800 hover:bg-red-700 active:bg-red-600 rounded-lg text-[11px] text-white">削除</button>
                          </div>
                        </div>
                        {/* 共通: emoji + name */}
                        <div className="flex items-center gap-2">
                          <input value={selObj.emoji} onChange={e => updObj({ emoji: e.target.value.slice(0, 2) })}
                            className="w-10 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-center text-lg" />
                          <input value={selObj.name ?? ''} onChange={e => updObj({ name: e.target.value || undefined })} placeholder="名前(任意)"
                            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 outline-none" />
                        </div>
                        {/* 種別 */}
                        <label className="text-[10px] text-gray-400 block">種別
                          <select value={selObj.objType ?? 'enemy'} onChange={e => updObj({ objType: e.target.value as ObjType })}
                            className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 outline-none">
                            {Object.entries(OBJTYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </label>
                        {/* Enemy 設定 */}
                        {(selObj.objType ?? 'enemy') === 'enemy' && (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="text-[10px] text-gray-400">挙動
                                <select value={selObj.behavior} onChange={e => updObj({ behavior: e.target.value as NpcBehavior })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 outline-none">
                                  {Object.entries(BEHAVIOR_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                </select>
                              </label>
                              <label className="text-[10px] text-gray-400">弾
                                <select value={selObj.bullet} onChange={e => updObj({ bullet: e.target.value as BulletType })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 outline-none">
                                  {Object.entries(BULLET_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                </select>
                              </label>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="text-[10px] text-gray-400">HP
                                <input type="text" inputMode="numeric" defaultValue={selObj.hp} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ hp: v }); }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" />
                              </label>
                              <label className="text-[10px] text-gray-400">速さ
                                <input type="text" inputMode="decimal" defaultValue={selObj.speed} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ speed: v }); }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" />
                              </label>
                            </div>
                            {gameData.battle && (
                              <>
                                <div className="grid grid-cols-3 gap-2">
                                  <label className="text-[10px] text-gray-400">攻撃
                                    <input type="text" inputMode="numeric" defaultValue={selObj.atk ?? Math.round(selObj.hp)} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ atk: v }); }}
                                      className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" />
                                  </label>
                                  <label className="text-[10px] text-gray-400">防御
                                    <input type="text" inputMode="numeric" defaultValue={selObj.def ?? Math.round(selObj.hp * 0.4)} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ def: v }); }}
                                      className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" />
                                  </label>
                                  <label className="text-[10px] text-gray-400">経験値
                                    <input type="text" inputMode="numeric" defaultValue={selObj.exp ?? Math.round(selObj.hp * 1.5)} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ exp: v }); }}
                                      className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" />
                                  </label>
                                  <label className="text-[10px] text-gray-400">ゴールド
                                    <input type="text" inputMode="numeric" defaultValue={selObj.gold ?? Math.round((selObj.exp ?? Math.round(selObj.hp * 1.5)) * 0.6)} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ gold: v }); }}
                                      className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" />
                                  </label>
                                </div>

                                <div className="mt-2.5 space-y-2.5 border-t border-gray-800 pt-2.5">
                                  <p className="text-[10px] text-gray-300 font-bold">敵の行動パターン設定</p>
                                  
                                  {/* 1. 通常攻撃の弾幕 (soul style only) */}
                                  {gameData.battle.style === 'soul' && (
                                    <label className="block text-[10px] text-gray-400">通常攻撃の弾幕 (MiniScript)
                                      <textarea value={selObj.miniScript ?? ''} onChange={e => {
                                        const v = e.target.value;
                                        updObj(v ? { miniScript: v, bullet: 'none' } : { miniScript: undefined });
                                      }} placeholder={'// 例:\nwhile true\n  shotRain(1.8, 4, 1)\n  wait(10)\nend while'}
                                        rows={4} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-1.5 text-[11px] text-green-300 font-mono outline-none resize-y" />
                                      <p className="mt-1 text-[10px] text-gray-500 leading-relaxed">shot(x,y,vx,vy,r,色) / shotAngle(x,y,角度,速,r,色) / shotPlayer(x,y,速) / shotAimed(速) / shotRain(速) / shotSide(左?,y,速) / wait n / setDuration(f) / getPlayerX() / rand / range / sin / cos ・ 色=0〜8 ・ 画面=W×H(176px)</p>
                                    </label>
                                  )}

                                  {/* 2. 特技/呪文の追加/編集 */}
                                  <div className="space-y-1.5">
                                    <div className="flex justify-between items-center">
                                      <span className="text-[10px] text-gray-400 font-bold">特技 / 呪文</span>
                                      <button onClick={() => updObj({
                                        moves: [...(selObj.moves ?? []), { name: '新しいわざ', power: 10 }]
                                      })} className="inline-flex items-center px-3 py-1.5 rounded-md text-[11px] text-emerald-400 border border-emerald-700 active:bg-emerald-500/10 font-bold">+ 追加</button>
                                    </div>
                                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                      {(selObj.moves ?? []).length === 0 && <p className="text-[10px] text-gray-500">（通常攻撃のみ）</p>}
                                      {(selObj.moves ?? []).map((m, i) => (
                                        <div key={i} className="bg-gray-850 rounded border border-gray-700 p-2 space-y-1.5">
                                          <div className="flex gap-1.5 items-center">
                                            <input value={m.name} onChange={e => {
                                              const copy = [...(selObj.moves ?? [])];
                                              copy[i] = { ...copy[i], name: e.target.value };
                                              updObj({ moves: copy });
                                            }} className="flex-1 min-w-0 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" placeholder="わざ名" />
                                            <button onClick={() => {
                                              const copy = [...(selObj.moves ?? [])]; copy.splice(i, 1);
                                              updObj({ moves: copy.length > 0 ? copy : undefined });
                                            }} className="shrink-0 grid place-items-center w-8 h-8 -my-1 rounded-lg text-gray-400 hover:text-red-400 active:bg-red-500/20 text-sm">✕</button>
                                          </div>
                                          <div className="grid grid-cols-2 gap-1.5">
                                            <label className="text-[10px] text-gray-400">威力/回復量
                                              <input type="text" inputMode="numeric" value={m.power} onChange={e => {
                                                const copy = [...(selObj.moves ?? [])];
                                                const v = parseInt(e.target.value);
                                                copy[i] = { ...copy[i], power: !isNaN(v) ? v : 0 };
                                                updObj({ moves: copy });
                                              }} className="w-full mt-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white text-right outline-none" />
                                            </label>
                                            <label className="text-[10px] text-gray-400 block">回復フラグ
                                              <select value={m.heal ? 'true' : 'false'} onChange={e => {
                                                const copy = [...(selObj.moves ?? [])];
                                                copy[i] = { ...copy[i], heal: e.target.value === 'true' };
                                                updObj({ moves: copy });
                                              }} className="w-full mt-0.5 bg-gray-700 rounded px-1 py-1.5 text-[11px] text-white outline-none">
                                                <option value="false">攻撃</option>
                                                <option value="true">回復</option>
                                              </select>
                                            </label>
                                          </div>
                                          {gameData.battle?.style === 'soul' && !m.heal && (
                                            <label className="block text-[10px] text-gray-400">弾幕スクリプト (MiniScript)
                                              <textarea value={m.miniScript ?? ''} onChange={e => {
                                                const copy = [...(selObj.moves ?? [])];
                                                const val = e.target.value;
                                                copy[i] = { ...copy[i], miniScript: val || undefined };
                                                updObj({ moves: copy });
                                              }} placeholder="// この技専用の弾幕（省略時は通常攻撃の弾幕）"
                                                rows={3} className="w-full mt-0.5 bg-gray-700 border border-gray-600 rounded px-1.5 py-1.5 text-[11px] text-green-300 font-mono outline-none resize-y" />
                                            </label>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                            {selObj.bullet !== 'none' && (
                              <div className="grid grid-cols-3 gap-2 items-end">
                                <label className="text-[10px] text-gray-400">発射間隔(f)
                                  <input type="text" inputMode="numeric" defaultValue={selObj.fireRate} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ fireRate: v }); }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" />
                                </label>
                                <label className="text-[10px] text-gray-400">弾速
                                  <input type="text" inputMode="decimal" defaultValue={selObj.bulletSpeed} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ bulletSpeed: v }); }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" />
                                </label>
                                <label className="text-[10px] text-gray-400 flex items-center gap-1">弾色<input type="color" value={selObj.bulletColor} onChange={e => updObj({ bulletColor: e.target.value })} className="w-9 h-9 rounded-lg border border-gray-700 bg-transparent cursor-pointer" /></label>
                              </div>
                            )}
                            <label className="flex items-center gap-1 text-[10px] text-gray-400"><input type="checkbox" checked={selObj.hazard} onChange={e => updObj({ hazard: e.target.checked })} className="accent-red-500" />接触でミス(敵)</label>
                            <label className="flex items-center gap-1 text-[10px] text-gray-400"><input type="checkbox" checked={!!selObj.isBoss} onChange={e => updObj({ isBoss: e.target.checked || undefined })} className="accent-yellow-500" />ボス（倒すまでクリア不可）</label>
                            {selObj.isBoss && (
                              <div className="mt-1 space-y-2">
                                <p className="text-[10px] text-yellow-400/80 font-bold">撃破後セリフ</p>
                                {(selObj.outroDialogue ?? []).map((dl, di) => {
                                  const previewKey = `boss-outro-${di}`;
                                  const isActive = activePreviewKey === previewKey;
                                  const activatePv = () => setActivePreviewKey(previewKey);
                                  const updBODl = (patch: Partial<DialogueLine>) => {
                                    updObj({ outroDialogue: (selObj.outroDialogue ?? []).map((d, j) => j === di ? { ...d, ...patch } : d) });
                                    setActivePreviewKey(previewKey);
                                  };
                                  return (
                                    <div key={di} className={`rounded-lg border p-2 space-y-1.5 transition-colors ${isActive ? 'border-yellow-500 bg-yellow-950/30' : 'border-gray-600 bg-gray-800'}`}>
                                      <div className="flex gap-1 items-center">
                                        <input value={dl.emoji ?? ''} placeholder="🎀"
                                          onChange={e => updBODl({ emoji: e.target.value })} onFocus={activatePv}
                                          className="w-8 bg-gray-700 rounded px-1 py-1.5 text-base text-center text-white outline-none" />
                                        <input value={dl.speaker} onChange={e => updBODl({ speaker: e.target.value })} onFocus={activatePv}
                                          placeholder="話者名" className="flex-1 bg-gray-700 rounded px-2 py-1.5 text-[12px] text-white outline-none" />
                                        <button onClick={() => {
                                          if (isActive) setActivePreviewKey(null);
                                          updObj({ outroDialogue: (selObj.outroDialogue ?? []).filter((_, j) => j !== di) });
                                        }} className="shrink-0 grid place-items-center w-8 h-8 -my-1 rounded-lg text-red-400 hover:text-red-300 active:bg-red-500/20 text-sm">✕</button>
                                      </div>
                                      <input value={dl.imageSrc ?? ''} onChange={e => updBODl({ imageSrc: e.target.value || undefined })} onFocus={activatePv}
                                        placeholder="立ち絵URL (省略でemoji)" className="w-full bg-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-300 outline-none" />
                                      <div className="flex gap-1 items-center flex-wrap">
                                        <span className="text-[9px] text-gray-500 shrink-0">位置</span>
                                        <label className="text-[9px] text-gray-400 flex items-center gap-0.5">
                                          X<input type="text" inputMode="numeric" defaultValue={dl.imageX ?? 0} onFocus={activatePv}
                                            onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updBODl({ imageX: v }); }}
                                            className="w-12 ml-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" />
                                        </label>
                                        <label className="text-[9px] text-gray-400 flex items-center gap-0.5">
                                          Y<input type="text" inputMode="numeric" defaultValue={dl.imageY ?? 0} onFocus={activatePv}
                                            onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updBODl({ imageY: v }); }}
                                            className="w-12 ml-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" />
                                        </label>
                                        <label className="text-[9px] text-gray-400 flex items-center gap-0.5 ml-2">
                                          倍率<input type="text" inputMode="decimal" defaultValue={dl.imageScale ?? 1} onFocus={activatePv}
                                            onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updBODl({ imageScale: v }); }}
                                            className="w-14 ml-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" />
                                        </label>
                                      </div>
                                      <textarea value={dl.text} onChange={e => updBODl({ text: e.target.value })} onFocus={activatePv}
                                        placeholder="セリフテキスト" rows={2}
                                        className="w-full bg-gray-700 rounded px-1.5 py-1 text-[10px] text-white outline-none resize-y" />
                                    </div>
                                  );
                                })}
                                <button onClick={() => updObj({ outroDialogue: [...(selObj.outroDialogue ?? []), { speaker: '', emoji: '', text: '', imageX: 0, imageY: 0, imageScale: 1 }] })}
                                  className="inline-flex items-center px-3 py-2 rounded-md text-[11px] text-yellow-400 active:bg-yellow-500/10">+ 撃破後セリフ追加</button>
                              </div>
                            )}
                            {/* ── スペルカード（touhou ボス） ── */}
                            {selObj.isBoss && gameData.engine === 'touhou' && (
                              <div className="mt-3 space-y-2">
                                <p className="text-[10px] text-red-400/80 font-bold">スペルカード</p>
                                {(selObj.spellCards ?? []).map((card, ci) => (
                                  <div key={ci} className="rounded-lg border border-red-800/60 bg-red-950/20 p-2 space-y-1.5">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[9px] text-red-400 shrink-0 font-bold">#{ci + 1}</span>
                                      <input value={card.name}
                                        onChange={e => updObj({ spellCards: (selObj.spellCards ?? []).map((c, j) => j === ci ? { ...c, name: e.target.value } : c) })}
                                        placeholder="スペルカード名"
                                        className="flex-1 bg-gray-800 rounded px-1 py-0.5 text-[10px] text-white outline-none" />
                                      <button onClick={() => updObj({ spellCards: (selObj.spellCards ?? []).filter((_, j) => j !== ci) })}
                                        className="shrink-0 grid place-items-center w-8 h-8 -my-1 rounded-lg text-red-400 hover:text-red-300 active:bg-red-500/20 text-sm">✕</button>
                                    </div>
                                    <label className="text-[9px] text-gray-400 flex items-center gap-1 flex-wrap">
                                      発動HP（以下）
                                      <input type="text" inputMode="numeric" defaultValue={card.triggerHp}
                                        onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ spellCards: (selObj.spellCards ?? []).map((c, j) => j === ci ? { ...c, triggerHp: v } : c) }); }}
                                        className="w-16 ml-0.5 bg-gray-800 rounded px-1 py-0.5 text-[9px] text-white outline-none" />
                                    </label>
                                    {/* 発動前セリフ */}
                                    <p className="text-[9px] text-gray-500">発動前セリフ（会話パート）</p>
                                    {(card.dialogue ?? []).map((line, li) => (
                                      <div key={li} className="rounded border border-gray-700 bg-gray-900 p-1.5 space-y-1">
                                        <div className="flex gap-1">
                                          <input value={line.speaker}
                                            onChange={e => updObj({ spellCards: (selObj.spellCards ?? []).map((c, j) => j === ci ? { ...c, dialogue: (c.dialogue ?? []).map((l, k) => k === li ? { ...l, speaker: e.target.value } : l) } : c) })}
                                            placeholder="話者名"
                                            className="w-20 bg-gray-800 rounded px-1 py-0.5 text-[9px] text-white outline-none" />
                                          <input value={line.emoji ?? ''}
                                            onChange={e => updObj({ spellCards: (selObj.spellCards ?? []).map((c, j) => j === ci ? { ...c, dialogue: (c.dialogue ?? []).map((l, k) => k === li ? { ...l, emoji: e.target.value || undefined } : l) } : c) })}
                                            placeholder="😊"
                                            className="w-10 bg-gray-800 rounded px-1 py-0.5 text-[9px] text-white outline-none" />
                                          <button onClick={() => updObj({ spellCards: (selObj.spellCards ?? []).map((c, j) => j === ci ? { ...c, dialogue: (c.dialogue ?? []).filter((_, k) => k !== li) } : c) })}
                                            className="ml-auto text-red-500 text-[9px] px-0.5">✕</button>
                                        </div>
                                        <input value={line.imageSrc ?? ''}
                                          onChange={e => updObj({ spellCards: (selObj.spellCards ?? []).map((c, j) => j === ci ? { ...c, dialogue: (c.dialogue ?? []).map((l, k) => k === li ? { ...l, imageSrc: e.target.value || undefined } : l) } : c) })}
                                          placeholder="立ち絵URL（省略可）"
                                          className="w-full bg-gray-800 rounded px-1 py-0.5 text-[9px] text-gray-300 outline-none" />
                                        <textarea value={line.text}
                                          onChange={e => updObj({ spellCards: (selObj.spellCards ?? []).map((c, j) => j === ci ? { ...c, dialogue: (c.dialogue ?? []).map((l, k) => k === li ? { ...l, text: e.target.value } : l) } : c) })}
                                          placeholder="セリフ"
                                          rows={2}
                                          className="w-full bg-gray-800 rounded px-1 py-0.5 text-[9px] text-white outline-none resize-none" />
                                      </div>
                                    ))}
                                    <button onClick={() => updObj({ spellCards: (selObj.spellCards ?? []).map((c, j) => j === ci ? { ...c, dialogue: [...(c.dialogue ?? []), { speaker: '', text: '', imageX: 0, imageY: 0, imageScale: 1 }] } : c) })}
                                      className="inline-flex items-center px-3 py-2 rounded-md text-[11px] text-purple-400 active:bg-purple-500/10">+ セリフ追加</button>
                                    <p className="text-[9px] text-gray-500">弾幕スクリプト（MiniScript）</p>
                                    <textarea value={card.miniScript}
                                      onChange={e => updObj({ spellCards: (selObj.spellCards ?? []).map((c, j) => j === ci ? { ...c, miniScript: e.target.value } : c) })}
                                      placeholder="// MiniScript 記述欄"
                                      rows={3}
                                      className="w-full bg-gray-900 border border-gray-800 rounded px-1.5 py-1 text-[9px] text-green-300 font-mono outline-none resize-y" />
                                    <p className="text-[9px] text-gray-500">カットイン設定</p>
                                    {(() => {
                                      const firePreview = (overrides?: Partial<typeof spellCutinPreview>) => setSpellCutinPreview({
                                        key: Date.now(), mode: 'player',
                                        charName: card.cutinCharName ?? selObj.name ?? selObj.emoji,
                                        spellName: card.name,
                                        imageUrl: card.cutinImageUrl ?? 'https://i.imgur.com/4M92pLV.png',
                                        imageX: card.cutinImageX ?? 0, imageY: card.cutinImageY ?? -50, imageScale: card.cutinScale ?? 1,
                                        ...overrides,
                                      });
                                      return (
                                        <>
                                          <input value={card.cutinCharName ?? ''}
                                            onChange={e => updObj({ spellCards: (selObj.spellCards ?? []).map((c, j) => j === ci ? { ...c, cutinCharName: e.target.value || undefined } : c) })}
                                            onFocus={() => firePreview()}
                                            placeholder="キャラクター名"
                                            className="w-full bg-gray-800 rounded px-1 py-0.5 text-[10px] text-white outline-none" />
                                          <p className="text-[9px] text-blue-400/80">立ち絵</p>
                                          <input value={card.cutinImageUrl ?? ''}
                                            onChange={e => updObj({ spellCards: (selObj.spellCards ?? []).map((c, j) => j === ci ? { ...c, cutinImageUrl: e.target.value || undefined } : c) })}
                                            onFocus={() => firePreview()}
                                            placeholder={'https://i.imgur.com/4M92pLV.png'}
                                            className="w-full bg-gray-800 rounded px-1 py-0.5 text-[9px] text-gray-300 outline-none" />
                                          <div className="flex gap-1 items-center flex-wrap">
                                            <label className="text-[9px] text-gray-400 flex items-center gap-0.5">
                                              X<input type="text" inputMode="numeric" defaultValue={card.cutinImageX ?? 0}
                                                onFocus={() => firePreview()}
                                                onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ spellCards: (selObj.spellCards ?? []).map((c, j) => j === ci ? { ...c, cutinImageX: v } : c) }); firePreview({ imageX: v }); }}
                                                className="w-12 ml-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" />
                                            </label>
                                            <label className="text-[9px] text-gray-400 flex items-center gap-0.5">
                                              Y<input type="text" inputMode="numeric" defaultValue={card.cutinImageY ?? -50}
                                                onFocus={() => firePreview()}
                                                onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ spellCards: (selObj.spellCards ?? []).map((c, j) => j === ci ? { ...c, cutinImageY: v } : c) }); firePreview({ imageY: v }); }}
                                                className="w-12 ml-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" />
                                            </label>
                                            <label className="text-[9px] text-gray-400 flex items-center gap-0.5 ml-1">
                                              倍率<input type="text" inputMode="decimal" defaultValue={card.cutinScale ?? 1}
                                                onFocus={() => firePreview()}
                                                onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ spellCards: (selObj.spellCards ?? []).map((c, j) => j === ci ? { ...c, cutinScale: v } : c) }); firePreview({ imageScale: v }); }}
                                                className="w-12 ml-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" />
                                            </label>
                                          </div>
                                          <button onClick={() => firePreview()}
                                            className="inline-flex items-center px-3 py-2 rounded-md text-[11px] text-violet-400 hover:text-violet-300 active:bg-violet-500/10">▶ プレビュー</button>
                                        </>
                                      );
                                    })()}
                                  </div>
                                ))}
                                <button onClick={() => updObj({ spellCards: [...(selObj.spellCards ?? []), {
                                  name: `スペルカード${(selObj.spellCards?.length ?? 0) + 1}`,
                                  triggerHp: Math.floor(selObj.hp * 0.5),
                                  miniScript: '// 弾幕パターンをMiniScriptで記述\nwait 60\naimed 2.0',
                                } as SpellCardDef] })}
                                  className="inline-flex items-center px-3 py-2 rounded-md text-[11px] text-red-400 active:bg-red-500/10">+ スペルカード追加</button>
                                <label className="text-[9px] text-gray-500 flex items-center gap-1 mt-1">
                                  ボムドロップ確率
                                  <input type="text" inputMode="decimal" defaultValue={selObj.bombDrop ?? 0}
                                    onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ bombDrop: Math.max(0, Math.min(1, v)) }); }}
                                    className="w-14 ml-0.5 bg-gray-800 rounded px-1 py-0.5 text-[9px] text-white outline-none" />
                                  <span className="text-gray-600">（0〜1）</span>
                                </label>
                              </div>
                            )}
                          </>
                        )}
                        {/* NPC 設定 */}
                        {(selObj.objType ?? 'enemy') === 'npc' && (
                          <>
                            <label className="text-[10px] text-gray-400 block">挙動
                              <select value={selObj.behavior} onChange={e => updObj({ behavior: e.target.value as NpcBehavior })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 outline-none">
                                {Object.entries(BEHAVIOR_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </select>
                            </label>
                            <textarea value={selObj.message} onChange={e => updObj({ message: e.target.value })} placeholder="会話メッセージ"
                              rows={2} className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 outline-none resize-none" />
                          </>
                        )}
                        {/* Item 設定 */}
                        {(selObj.objType ?? 'enemy') === 'item' && (
                          <label className="text-[10px] text-gray-400 block">入手アイテム
                            <select value={selObj.itemId ?? ''} onChange={e => updObj({ itemId: e.target.value || undefined })}
                              className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 outline-none text-[10px]">
                              <option value="">（nameをID扱い）</option>
                              {(gameData.items ?? []).map(it => <option key={it.id} value={it.id}>{it.emoji} {it.name}</option>)}
                            </select>
                          </label>
                        )}
                        {/* Warp 設定 */}
                        {(selObj.objType ?? 'enemy') === 'warp' && (
                          <div className="space-y-2">
                            {/* シーン間ワープ（シーンが複数あるときのみ表示） */}
                            {(gameData.scenes?.length ?? 0) > 0 && (
                              <div className="space-y-1.5">
                                <label className="text-[10px] text-gray-400 flex items-center gap-1">
                                  🚪 遷移先シーン
                                </label>
                                <select value={selObj.warpSceneId ?? ''}
                                  onChange={e => updObj({ warpSceneId: e.target.value || undefined })}
                                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 outline-none">
                                  <option value="">（同シーン内ワープ）</option>
                                  {(gameData.scenes ?? []).map(s => (
                                    <option key={s.id} value={s.id}>{s.name ?? s.id}</option>
                                  ))}
                                </select>
                                {selObj.warpSceneId && (
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <label className="text-[10px] text-gray-400">入場X(列)
                                      <input type="number" value={selObj.warpEntryCol ?? 1}
                                        onChange={e => updObj({ warpEntryCol: Number(e.target.value) })}
                                        className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" />
                                    </label>
                                    <label className="text-[10px] text-gray-400">入場Y(行)
                                      <input type="number" value={selObj.warpEntryRow ?? 1}
                                        onChange={e => updObj({ warpEntryRow: Number(e.target.value) })}
                                        className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" />
                                    </label>
                                  </div>
                                )}
                              </div>
                            )}
                            {/* 同シーン内ワープ座標（シーン間ワープ未選択時のみ） */}
                            {!selObj.warpSceneId && (
                              <div className="grid grid-cols-2 gap-2">
                                <label className="text-[10px] text-gray-400">ワープ先X(列)
                                  <input type="number" value={selObj.warpTarget?.col ?? 0} onChange={e => updObj({ warpTarget: { ...selObj.warpTarget ?? { col: 0, row: 0 }, col: Number(e.target.value) } })}
                                    className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" />
                                </label>
                                <label className="text-[10px] text-gray-400">ワープ先Y(行)
                                  <input type="number" value={selObj.warpTarget?.row ?? 0} onChange={e => updObj({ warpTarget: { ...selObj.warpTarget ?? { col: 0, row: 0 }, row: Number(e.target.value) } })}
                                    className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" />
                                </label>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    {/* ── イベントページエディタ（全objType共通） ── */}
                    {selObj && (
                      <EventPageEditor
                        pages={selObj.pages ?? []}
                        setPages={pages => updObj({ pages: pages.length > 0 ? pages : undefined })}
                        switches={gameData.switches ?? []}
                        items={gameData.items ?? []}
                      />
                    )}
                    </> ) : (
                      <div className="rounded-lg border border-gray-700 bg-gray-900 p-2.5 space-y-2.5">
                        <p className="text-[10px] text-gray-400 flex items-center gap-1"><Smartphone size={11} /> プレイヤーで重なるかキャンバスをタップで選択</p>
                        <div className="flex items-center gap-2">
                          <input value={tpl.emoji} onChange={e => setTpl({ emoji: e.target.value.slice(0, 2), spriteRef: undefined, spriteUrl: undefined })}
                            className="w-10 bg-gray-800 border border-gray-700 rounded px-1 py-1.5 text-center text-lg" />
                          <button onClick={() => setPicker({ mode: 'image', target: { t: 'objsprite' } })} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[10px] text-gray-300"><ImageIcon size={12} />画像参照</button>
                          {tpl.spriteUrl && <button onClick={() => setTpl({ spriteRef: undefined, spriteUrl: undefined })} className="shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={16} /></button>}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-[10px] text-gray-400">種別
                            <select value={tpl.objType ?? 'enemy'} onChange={e => setTpl({ objType: e.target.value as ObjType })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 outline-none">
                              {Object.entries(OBJTYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          </label>
                          <label className="text-[10px] text-gray-400">挙動
                            <select value={tpl.behavior} onChange={e => setTpl({ behavior: e.target.value as NpcBehavior })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 outline-none">
                              {Object.entries(BEHAVIOR_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          </label>
                          <label className="text-[10px] text-gray-400">弾
                            <select value={tpl.bullet} onChange={e => setTpl({ bullet: e.target.value as BulletType })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 outline-none">
                              {Object.entries(BULLET_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-[10px] text-gray-400">HP
                            <input type="text" inputMode="numeric" defaultValue={tpl.hp} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setTpl({ hp: v }); }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" />
                          </label>
                          <label className="text-[10px] text-gray-400">速さ
                            <input type="text" inputMode="decimal" defaultValue={tpl.speed} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setTpl({ speed: v }); }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" />
                          </label>
                        </div>
                        {(tpl.objType ?? 'enemy') === 'enemy' && (
                          <>
                            {tpl.bullet !== 'none' && (
                              <div className="grid grid-cols-3 gap-2 items-end">
                                <label className="text-[10px] text-gray-400">発射間隔(f)
                                  <input type="text" inputMode="numeric" defaultValue={tpl.fireRate} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setTpl({ fireRate: v }); }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" />
                                </label>
                                <label className="text-[10px] text-gray-400">弾速
                                  <input type="text" inputMode="decimal" defaultValue={tpl.bulletSpeed} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setTpl({ bulletSpeed: v }); }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" />
                                </label>
                                <label className="text-[10px] text-gray-400 flex items-center gap-1">弾色<input type="color" value={tpl.bulletColor} onChange={e => setTpl({ bulletColor: e.target.value })} className="w-9 h-9 rounded-lg border border-gray-700 bg-transparent cursor-pointer" /></label>
                              </div>
                            )}
                            <label className="flex items-center gap-1 text-[10px] text-gray-400"><input type="checkbox" checked={tpl.hazard} onChange={e => setTpl({ hazard: e.target.checked })} className="accent-red-500" />接触でミス(敵)</label>
                          </>
                        )}
                        {(tpl.objType ?? 'enemy') === 'npc' && (
                          <input value={tpl.message} onChange={e => setTpl({ message: e.target.value })} placeholder="会話メッセージ(NPC)"
                            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 outline-none" />
                        )}
                        <button onClick={placeObj} className="w-full flex items-center justify-center gap-1 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-[11px] text-white font-bold">
                          <Plus size={13} />プレイヤー位置に新規配置
                        </button>
                      </div>
                    )}
                    {/* ── 全オブジェクト一覧 ── */}
                    <div>
                      <div className="text-[10px] text-gray-500 mb-1.5">全{gameData.objects.length}個</div>
                      <div className="max-h-28 overflow-y-auto space-y-0.5">
                        {gameData.objects.map(o => (
                          <button key={o.id} onClick={() => setSelectedObjId(o.id)}
                            className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[10px] text-left ${selectedObjId === o.id ? 'bg-yellow-800/40 text-yellow-200' : 'bg-gray-800/40 text-gray-400 hover:bg-gray-700/40'}`}>
                            <span>{o.emoji}</span>
                            <span className="truncate flex-1">{o.name || o.objType || '敵'}</span>
                            <span className="text-gray-600">({o.col},{o.row})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── CHAR (non-touhou) ── */}
                {editorTab === 'char' && gameData.engine !== 'touhou' && (
                  <div className="space-y-4">
                    {/* ④ 主人公を自分にする（最初の一手）導線 */}
                    <button
                      onClick={() => setPicker({ mode: 'image', target: { t: 'player' } })}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-gradient-to-r from-violet-900/60 to-blue-900/50 border border-violet-600/40 hover:border-violet-500/70 active:scale-[0.98] transition text-left">
                      <SpriteThumbnail spriteRef={gameData.player.spriteRef} spriteUrl={gameData.player.spriteUrl} emoji={gameData.player.emoji} size={32} imgCache={imgCache} keyedCache={keyedCache} className="text-2xl" />
                      <div className="min-w-0">
                        <div className="text-xs font-black text-white">主人公を自分にする</div>
                        <div className="text-[10px] text-violet-300/80 mt-0.5">投稿画像・歩行グラを選択して差し替え</div>
                      </div>
                      <ImageIcon size={16} className="ml-auto shrink-0 text-violet-400" />
                    </button>
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">見た目</label>
                      <div className="flex items-center gap-2">
                        <input type="text" value={gameData.player.emoji} onChange={e => setGameData(p => ({ ...p, player: { ...p.player, emoji: e.target.value.slice(0, 2), spriteRef: undefined, spriteUrl: undefined } }))}
                          className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-center text-xl" />
                        <button onClick={() => setPicker({ mode: 'image', target: { t: 'player' } })}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[11px] text-gray-300"><ImageIcon size={13} />画像/歩行グラを参照</button>
                      </div>
                      {gameData.player.spriteRef && (
                        <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400 bg-gray-900 rounded px-2 py-1.5 border border-gray-800">
                          <SpriteThumbnail spriteRef={gameData.player.spriteRef} spriteUrl={gameData.player.spriteUrl} emoji={gameData.player.emoji} size={24} imgCache={imgCache} keyedCache={keyedCache} />
                          <span className="truncate flex-1">{refLabel(gameData.player.spriteRef)}</span>
                          <button onClick={() => setGameData(p => ({ ...p, player: { ...p.player, spriteRef: undefined, spriteUrl: undefined } }))} className="shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={16} /></button>
                        </div>
                      )}
                    </div>
                    <label className="flex items-center justify-between text-[11px] text-gray-400">
                      <span>移動速度</span>
                      <input type="text" inputMode="decimal" key={`spd-${presetId}`} defaultValue={gameData.player.speed}
                        onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setGameData(p => ({ ...p, player: { ...p.player, speed: v } })); }}
                        className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 outline-none text-right" />
                    </label>
                    {gameData.engine === 'action' && (
                      <label className="flex items-center justify-between text-[11px] text-gray-400">
                        <span>ジャンプ力（負で上向き）</span>
                        <input type="text" inputMode="numeric" key={`jmp-${presetId}`} defaultValue={gameData.player.jumpPower}
                          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setGameData(p => ({ ...p, player: { ...p.player, jumpPower: v } })); }}
                          className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 outline-none text-right" />
                      </label>
                    )}
                    {gameData.battle && (
                      <div className="border-t border-gray-700 pt-3 space-y-4">
                        <p className="text-[12px] font-bold text-yellow-400 flex items-center gap-1">⚔ 戦闘設定 (RPG)</p>
                        
                        {/* 1. 基本ステータス */}
                        <div className="space-y-2 rounded-lg border border-gray-700 bg-gray-900/40 p-2.5">
                          <p className="text-[10px] text-gray-300 font-bold">基本ステータス</p>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="text-[10px] text-gray-400">プレイヤー名
                              <input type="text" value={gameData.battle.playerName} onChange={e => {
                                const playerName = e.target.value;
                                setGameData(p => ({ ...p, battle: { ...p.battle!, playerName } }));
                              }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none" />
                            </label>
                            <label className="text-[10px] text-gray-400">初期最大HP
                              <input type="text" inputMode="numeric" value={gameData.battle.maxHp} onChange={e => {
                                const v = parseInt(e.target.value); if (!isNaN(v)) setGameData(p => ({ ...p, battle: { ...p.battle!, maxHp: v } }));
                              }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none" />
                            </label>
                            <label className="text-[10px] text-gray-400">初期最大MP
                              <input type="text" inputMode="numeric" value={gameData.battle.maxMp} onChange={e => {
                                const v = parseInt(e.target.value); if (!isNaN(v)) setGameData(p => ({ ...p, battle: { ...p.battle!, maxMp: v } }));
                              }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none" />
                            </label>
                            <label className="text-[10px] text-gray-400">初期攻撃力
                              <input type="text" inputMode="numeric" value={gameData.battle.atk} onChange={e => {
                                const v = parseInt(e.target.value); if (!isNaN(v)) setGameData(p => ({ ...p, battle: { ...p.battle!, atk: v } }));
                              }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none" />
                            </label>
                            <label className="text-[10px] text-gray-400">初期防御力
                              <input type="text" inputMode="numeric" value={gameData.battle.def} onChange={e => {
                                const v = parseInt(e.target.value); if (!isNaN(v)) setGameData(p => ({ ...p, battle: { ...p.battle!, def: v } }));
                              }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none" />
                            </label>
                            <label className="text-[10px] text-gray-400">初期ゴールド
                              <input type="text" inputMode="numeric" value={gameData.battle.gold ?? 0} onChange={e => {
                                const v = parseInt(e.target.value); if (!isNaN(v)) setGameData(p => ({ ...p, battle: { ...p.battle!, gold: v } }));
                              }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none" />
                            </label>
                          </div>
                          <label className="block text-[10px] text-gray-400">戦闘スタイル
                            <select value={gameData.battle.style ?? 'classic'} onChange={e => {
                              const style = e.target.value as 'classic' | 'soul';
                              setGameData(p => ({ ...p, battle: { ...p.battle!, style } }));
                            }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-1.5 text-[11px] text-gray-200 outline-none">
                              <option value="classic">コマンド戦闘（ドラクエ風）</option>
                              <option value="soul">ハート弾幕よけ（アンダーテール風）</option>
                            </select>
                          </label>
                        </div>

                        {/* 1.5 コマンド表示名 */}
                        <div className="space-y-2 rounded-lg border border-gray-700 bg-gray-900/40 p-2.5">
                          <p className="text-[10px] text-gray-300 font-bold">コマンド表示名</p>
                          <div className="grid grid-cols-2 gap-2">
                            {([
                              ['attack', 'こうげき', false], ['move', 'とくぎ/こうどう', false],
                              ['flee', 'にげる', false], ['item', 'どうぐ', false],
                            ] as [('attack' | 'move' | 'flee' | 'item'), string, boolean][]).map(([key, ph]) => (
                              <label key={key} className="text-[10px] text-gray-400">{ph}
                                <input type="text" value={gameData.battle!.labels[key] ?? ''} placeholder={ph} onChange={e => {
                                  const v = e.target.value;
                                  setGameData(p => ({ ...p, battle: { ...p.battle!, labels: { ...p.battle!.labels, [key]: key === 'item' ? (v || undefined) : v } } }));
                                }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-1.5 text-[11px] text-gray-200 outline-none" />
                              </label>
                            ))}
                            <label className="text-[10px] text-gray-400 col-span-2">みのがす（空欄にすると「みのがす」コマンド自体が無効）
                              <input type="text" value={gameData.battle.labels.mercy ?? ''} placeholder="例: みのがす（空欄=無効）" onChange={e => {
                                const v = e.target.value;
                                setGameData(p => ({ ...p, battle: { ...p.battle!, labels: { ...p.battle!.labels, mercy: v || undefined } } }));
                              }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-1.5 text-[11px] text-gray-200 outline-none" />
                            </label>
                          </div>
                        </div>

                        {/* 2. みのがし条件 */}
                        {gameData.battle.labels.mercy && (
                          <div className="space-y-2 rounded-lg border border-gray-700 bg-gray-900/40 p-2.5">
                            <p className="text-[10px] text-gray-300 font-bold">みのがし条件</p>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="text-[10px] text-gray-400">ゲージ満タンの閾値 (%)
                                <input type="text" inputMode="numeric" placeholder="100" defaultValue={gameData.battle.mercyThreshold ?? 100} onBlur={e => {
                                  const v = parseInt(e.target.value);
                                  setGameData(p => ({ ...p, battle: { ...p.battle!, mercyThreshold: !isNaN(v) ? v : undefined } }));
                                }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none" />
                              </label>
                              <label className="text-[10px] text-gray-400">HP割合の閾値 (%)
                                <input type="text" inputMode="numeric" placeholder="20" defaultValue={gameData.battle.hpSpareThreshold ?? 20} onBlur={e => {
                                  const v = parseInt(e.target.value);
                                  setGameData(p => ({ ...p, battle: { ...p.battle!, hpSpareThreshold: !isNaN(v) ? v : undefined } }));
                                }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none" />
                              </label>
                            </div>
                          </div>
                        )}

                        {/* 3. 技 / 呪文 (Moves) */}
                        <div className="space-y-2 rounded-lg border border-gray-700 bg-gray-900/40 p-2.5">
                          <div className="flex justify-between items-center">
                            <p className="text-[10px] text-gray-300 font-bold">戦闘コマンド・こうどう・魔法</p>
                            <button onClick={() => setGameData(p => {
                              const b = p.battle!;
                              return { ...p, battle: { ...b, moves: [...b.moves, { name: '新しい技', cost: 0, power: 10 }] } };
                            })} className="inline-flex items-center px-3 py-1.5 rounded-md text-[11px] text-emerald-400 border border-emerald-700 active:bg-emerald-500/10 font-bold">+ 追加</button>
                          </div>
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {gameData.battle.moves.map((m, i) => (
                              <div key={i} className="bg-gray-850 rounded border border-gray-700 p-2 space-y-1.5">
                                <div className="flex gap-1.5 items-center">
                                  <input value={m.name} onChange={e => setGameData(p => {
                                    const b = p.battle!; const next = [...b.moves];
                                    next[i] = { ...next[i], name: e.target.value };
                                    return { ...p, battle: { ...b, moves: next } };
                                  })} className="flex-1 min-w-0 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" placeholder="技名" />
                                  <button onClick={() => setGameData(p => {
                                    const b = p.battle!; const next = [...b.moves]; next.splice(i, 1);
                                    return { ...p, battle: { ...b, moves: next } };
                                  })} className="shrink-0 grid place-items-center w-8 h-8 -my-1 rounded-lg text-gray-400 hover:text-red-400 active:bg-red-500/20 text-sm">✕</button>
                                </div>
                                <div className="grid grid-cols-3 gap-1.5">
                                  <label className="text-[10px] text-gray-400">消費MP
                                    <input type="text" inputMode="numeric" value={m.cost} onChange={e => setGameData(p => {
                                      const b = p.battle!; const next = [...b.moves];
                                      const v = parseInt(e.target.value);
                                      next[i] = { ...next[i], cost: !isNaN(v) ? v : 0 };
                                      return { ...p, battle: { ...b, moves: next } };
                                    })} className="w-full mt-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white text-right outline-none" />
                                  </label>
                                  <label className="text-[10px] text-gray-400">{m.mercy != null ? 'ゲージ上昇' : '威力/回復量'}
                                    <input type="text" inputMode="numeric" value={m.mercy != null ? m.mercy : m.power} onChange={e => setGameData(p => {
                                      const b = p.battle!; const next = [...b.moves];
                                      const v = parseInt(e.target.value);
                                      if (m.mercy != null) {
                                        next[i] = { ...next[i], mercy: !isNaN(v) ? v : 0 };
                                      } else {
                                        next[i] = { ...next[i], power: !isNaN(v) ? v : 0 };
                                      }
                                      return { ...p, battle: { ...b, moves: next } };
                                    })} className="w-full mt-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white text-right outline-none" />
                                  </label>
                                  <label className="text-[10px] text-gray-400 block">種別
                                    <select value={m.mercy != null ? 'mercy' : m.heal ? 'heal' : 'attack'} onChange={e => setGameData(p => {
                                      const b = p.battle!; const next = [...b.moves];
                                      const type = e.target.value;
                                      if (type === 'mercy') {
                                        next[i] = { name: next[i].name, cost: next[i].cost, power: 0, mercy: 40 };
                                      } else if (type === 'heal') {
                                        next[i] = { name: next[i].name, cost: next[i].cost, power: next[i].power || 10, heal: true };
                                      } else {
                                        next[i] = { name: next[i].name, cost: next[i].cost, power: next[i].power || 10 };
                                      }
                                      return { ...p, battle: { ...b, moves: next } };
                                    })} className="w-full mt-0.5 bg-gray-700 rounded px-1 py-1.5 text-[11px] text-white outline-none">
                                      <option value="attack">ダメージ</option>
                                      <option value="heal">HP回復</option>
                                      {gameData.battle?.labels.mercy && <option value="mercy">こうどう(敵意)</option>}
                                    </select>
                                  </label>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 4. レベルアップ成長テーブル */}
                        <div className="space-y-2 rounded-lg border border-gray-700 bg-gray-900/40 p-2.5">
                          <div className="flex justify-between items-center">
                            <p className="text-[10px] text-gray-300 font-bold">レベルアップ成長表</p>
                            <button onClick={() => setGameData(p => {
                              const b = p.battle!;
                              const table = b.levelTable ?? [];
                              const nextLv = table.length > 0 ? Math.max(...table.map(e => e.level)) + 1 : 2;
                              const prevExp = table.length > 0 ? table[table.length - 1].exp : 0;
                              return { ...p, battle: { ...b, levelTable: [...table, { level: nextLv, exp: prevExp + 10, maxHp: b.maxHp + 8, maxMp: b.maxMp + 2, atk: b.atk + 3, def: b.def + 2 }] } };
                            })} className="inline-flex items-center px-3 py-1.5 rounded-md text-[11px] text-emerald-400 border border-emerald-700 active:bg-emerald-500/10 font-bold">+ 追加</button>
                          </div>
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {(gameData.battle.levelTable ?? []).length === 0 && <p className="text-[10px] text-gray-500 px-1">（なし - レベル固定）</p>}
                            {(gameData.battle.levelTable ?? []).map((le, i) => (
                              <div key={i} className="bg-gray-850 rounded border border-gray-700 p-2 space-y-1">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] text-yellow-400 font-bold">Lv {le.level}</span>
                                  <button onClick={() => setGameData(p => {
                                    const b = p.battle!; const next = [...(b.levelTable ?? [])]; next.splice(i, 1);
                                    return { ...p, battle: { ...b, levelTable: next } };
                                  })} className="shrink-0 grid place-items-center w-8 h-8 -my-1 rounded-lg text-gray-400 hover:text-red-400 active:bg-red-500/20 text-sm">✕</button>
                                </div>
                                <div className="grid grid-cols-3 gap-1.5">
                                  <label className="text-[10px] text-gray-400">必要累計EXP
                                    <input type="text" inputMode="numeric" value={le.exp} onChange={e => setGameData(p => {
                                      const b = p.battle!; const next = [...(b.levelTable ?? [])];
                                      const v = parseInt(e.target.value);
                                      next[i] = { ...next[i], exp: !isNaN(v) ? v : 0 };
                                      return { ...p, battle: { ...b, levelTable: next } };
                                    })} className="w-full mt-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white text-right outline-none" />
                                  </label>
                                  <label className="text-[10px] text-gray-400">最大HP
                                    <input type="text" inputMode="numeric" value={le.maxHp ?? ''} onChange={e => setGameData(p => {
                                      const b = p.battle!; const next = [...(b.levelTable ?? [])];
                                      const v = parseInt(e.target.value);
                                      next[i] = { ...next[i], maxHp: !isNaN(v) ? v : undefined };
                                      return { ...p, battle: { ...b, levelTable: next } };
                                    })} className="w-full mt-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white text-right outline-none" />
                                  </label>
                                  <label className="text-[10px] text-gray-400">最大MP
                                    <input type="text" inputMode="numeric" value={le.maxMp ?? ''} onChange={e => setGameData(p => {
                                      const b = p.battle!; const next = [...(b.levelTable ?? [])];
                                      const v = parseInt(e.target.value);
                                      next[i] = { ...next[i], maxMp: !isNaN(v) ? v : undefined };
                                      return { ...p, battle: { ...b, levelTable: next } };
                                    })} className="w-full mt-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white text-right outline-none" />
                                  </label>
                                  <label className="text-[10px] text-gray-400">攻撃力
                                    <input type="text" inputMode="numeric" value={le.atk ?? ''} onChange={e => setGameData(p => {
                                      const b = p.battle!; const next = [...(b.levelTable ?? [])];
                                      const v = parseInt(e.target.value);
                                      next[i] = { ...next[i], atk: !isNaN(v) ? v : undefined };
                                      return { ...p, battle: { ...b, levelTable: next } };
                                    })} className="w-full mt-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white text-right outline-none" />
                                  </label>
                                  <label className="text-[10px] text-gray-400">防御力
                                    <input type="text" inputMode="numeric" value={le.def ?? ''} onChange={e => setGameData(p => {
                                      const b = p.battle!; const next = [...(b.levelTable ?? [])];
                                      const v = parseInt(e.target.value);
                                      next[i] = { ...next[i], def: !isNaN(v) ? v : undefined };
                                      return { ...p, battle: { ...b, levelTable: next } };
                                    })} className="w-full mt-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white text-right outline-none" />
                                  </label>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-gray-500">マップの広さやプレイヤー初期位置は「マップ」タブで設定できます。</p>
                  </div>
                )}

                {/* ── CHAR (touhou 5-section) ── */}
                {editorTab === 'char' && gameData.engine === 'touhou' && (() => {
                  const phases = gameData.phases ?? [];
                  const midPhase = Math.floor(phases.length / 2);
                  const bossPhases = phases.map((p, i) => ({ p, i })).filter(({ p }) => p.kind === 'boss');
                  const lastBossPhaseIdx = bossPhases.length > 0 ? bossPhases[bossPhases.length - 1].i : -1;
                  const isBossPhase = (ph: number) => ph === lastBossPhaseIdx;
                  const bossList = gameData.objects.filter(o => o.isBoss && isBossPhase(o.phase ?? 0));
                  const midBossList = gameData.objects.filter(o => !!o.isBoss && phases.length > 0 && !isBossPhase(o.phase ?? 0) && phases[o.phase ?? 0]?.kind === 'boss');
                  const zenhanList = gameData.objects.filter(o => !o.isBoss && (phases.length === 0 || (o.phase ?? 0) < midPhase));
                  const kohanList = gameData.objects.filter(o => !o.isBoss && phases.length > 0 && (o.phase ?? 0) >= midPhase);
                  const SUB_LABELS = { jiki: '自機', zenhan: '前半道中', midboss: '中ボス', kohan: '後半道中', boss: 'ボス' } as const;
                  const curList: typeof bossList = charSubTab === 'boss' ? bossList : charSubTab === 'midboss' ? midBossList : charSubTab === 'zenhan' ? zenhanList : charSubTab === 'kohan' ? kohanList : [];
                  const activeSelObj = selObj && curList.some(o => o.id === selObj.id) ? selObj : null;

                  const SpriteRow = ({ obj }: { obj: typeof selObj }) => obj ? (
                    <>
                      <button onClick={() => setPicker({ mode: 'image', target: { t: 'selObjSprite' } })}
                        className="w-full flex items-center justify-center gap-1 py-1.5 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[10px] text-gray-300"><ImageIcon size={12} />スプライト画像参照</button>
                      {obj.spriteRef && (
                        <div className="flex items-center gap-2 text-[9px] text-gray-400 bg-gray-800 rounded px-2 py-1 border border-gray-700">
                          <SpriteThumbnail spriteRef={obj.spriteRef} spriteUrl={obj.spriteUrl} emoji={obj.emoji} size={20} imgCache={imgCache} keyedCache={keyedCache} className="rounded" />
                          <span className="truncate flex-1">{refLabel(obj.spriteRef)}</span>
                          <button onClick={() => updObj({ spriteRef: undefined, spriteUrl: undefined })} className="shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={16} /></button>
                        </div>
                      )}
                    </>
                  ) : null;

                  return (
                    <div className="space-y-3">
                      {/* サブタブナビ */}
                      <div className="flex flex-wrap border-b border-gray-700 -mx-3">
                        {(Object.keys(SUB_LABELS) as Array<keyof typeof SUB_LABELS>).map(id => (
                          <button key={id} onClick={() => { setCharSubTab(id); if (id !== charSubTab) setSelectedObjId(null); }}
                            className={`flex-none py-2.5 px-3 text-[11px] font-bold transition ${charSubTab === id ? 'text-blue-400 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-400'}`}>
                            {SUB_LABELS[id]}
                          </button>
                        ))}
                      </div>

                      {/* ── 自機 ── */}
                      {charSubTab === 'jiki' && (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-[11px] text-gray-400 mb-1">見た目</label>
                            <div className="flex items-center gap-2">
                              <input type="text" value={gameData.player.emoji} onChange={e => setGameData(p => ({ ...p, player: { ...p.player, emoji: e.target.value.slice(0, 2), spriteRef: undefined, spriteUrl: undefined } }))}
                                className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-center text-xl" />
                              <button onClick={() => setPicker({ mode: 'image', target: { t: 'player' } })}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[11px] text-gray-300"><ImageIcon size={13} />画像/歩行グラを参照</button>
                            </div>
                            {gameData.player.spriteRef && (
                              <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400 bg-gray-900 rounded px-2 py-1.5 border border-gray-800">
                                <SpriteThumbnail spriteRef={gameData.player.spriteRef} spriteUrl={gameData.player.spriteUrl} emoji={gameData.player.emoji} size={24} imgCache={imgCache} keyedCache={keyedCache} />
                                <span className="truncate flex-1">{refLabel(gameData.player.spriteRef)}</span>
                                <button onClick={() => setGameData(p => ({ ...p, player: { ...p.player, spriteRef: undefined, spriteUrl: undefined } }))} className="shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={16} /></button>
                              </div>
                            )}
                          </div>
                          <label className="flex items-center justify-between text-[11px] text-gray-400">
                            <span>移動速度</span>
                            <input type="text" inputMode="decimal" key={`spd-t-${presetId}`} defaultValue={gameData.player.speed}
                              onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setGameData(p => ({ ...p, player: { ...p.player, speed: v } })); }}
                              className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 outline-none text-right" />
                          </label>
                          <div className="space-y-3">
                            <p className="text-[11px] text-violet-400 font-bold">ボム（カットイン）設定</p>
                            <label className="flex items-center justify-between text-[11px] text-gray-400">
                              <span>初期ボム数</span>
                              <input type="text" inputMode="numeric" key={`bomb-${presetId}`} defaultValue={gameData.player.bombCount ?? 3}
                                onChange={e => { const v = Math.max(0, Math.round(parseFloat(e.target.value))); if (!isNaN(v)) setGameData(p => ({ ...p, player: { ...p.player, bombCount: v } })); }}
                                className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 outline-none text-right" />
                            </label>
                            <label className="block text-[11px] text-gray-400">スペルカード名
                              <input type="text" value={gameData.player.bombSpellName ?? ''} onChange={e => setGameData(p => ({ ...p, player: { ...p.player, bombSpellName: e.target.value || undefined } }))}
                                placeholder="恋符「マスタースパーク」" className="w-full mt-0.5 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 outline-none" />
                            </label>
                            <label className="block text-[11px] text-gray-400">キャラクター名
                              <input type="text" value={gameData.player.bombCutinCharName ?? ''} onChange={e => setGameData(p => ({ ...p, player: { ...p.player, bombCutinCharName: e.target.value || undefined } }))}
                                placeholder="魔理沙" className="w-full mt-0.5 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 outline-none" />
                            </label>
                              <label className="block text-[11px] text-gray-400">立ち絵URL
                              <input type="text" value={gameData.player.bombCutinImageUrl ?? 'https://i.imgur.com/4M92pLV.png'} onChange={e => setGameData(p => ({ ...p, player: { ...p.player, bombCutinImageUrl: e.target.value || undefined } }))}
                                placeholder="https://i.imgur.com/4M92pLV.png" className="w-full mt-0.5 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 outline-none" />
                            </label>
                            <div className="flex gap-2 items-center flex-wrap">
                              <label className="text-[10px] text-gray-400 flex items-center gap-1">X<input type="text" inputMode="numeric" defaultValue={gameData.player.bombCutinImageX ?? 0} onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setGameData(p => ({ ...p, player: { ...p.player, bombCutinImageX: v } })); }} className="w-16 ml-0.5 bg-gray-900 border border-gray-700 rounded px-1 py-1 text-[10px] text-gray-200 outline-none" /></label>
                              <label className="text-[10px] text-gray-400 flex items-center gap-1">Y<input type="text" inputMode="numeric" defaultValue={gameData.player.bombCutinImageY ?? -50} onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setGameData(p => ({ ...p, player: { ...p.player, bombCutinImageY: v } })); }} className="w-16 ml-0.5 bg-gray-900 border border-gray-700 rounded px-1 py-1 text-[10px] text-gray-200 outline-none" /></label>
                              <label className="text-[10px] text-gray-400 flex items-center gap-1">倍率<input type="text" inputMode="decimal" defaultValue={gameData.player.bombCutinScale ?? 1} onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setGameData(p => ({ ...p, player: { ...p.player, bombCutinScale: v } })); }} className="w-16 ml-0.5 bg-gray-900 border border-gray-700 rounded px-1 py-1 text-[10px] text-gray-200 outline-none" /></label>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ── ボス / 中ボス ── */}
                      {(charSubTab === 'boss' || charSubTab === 'midboss') && (() => {
                        const ph = charSubTab === 'boss'
                          ? (lastBossPhaseIdx >= 0 ? lastBossPhaseIdx : 0)
                          : (bossPhases.length > 0 ? bossPhases[0].i : Math.max(0, midPhase - 1));
                        const omit = curList.length === 0;
                        return (
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-[11px] text-gray-300 cursor-pointer">
                            <input type="checkbox" checked={!omit} onChange={e => {
                              if (e.target.checked) {
                                const o = newObject({ isBoss: true, bullet: 'none', hp: 200, speed: 0, behavior: 'still', phase: ph });
                                setGameData(p => ({ ...p, objects: [...p.objects, o] }));
                                setSelectedObjId(o.id);
                              } else {
                                curList.forEach(o => { setGameData(p => ({ ...p, objects: p.objects.filter(x => x.id !== o.id) })); });
                                setSelectedObjId(null);
                              }
                            }} className="accent-red-500" />
                            {SUB_LABELS[charSubTab]}を使う
                          </label>
                          {!omit && curList[0] && (
                            <div key={curList[0].id} className="rounded-lg border border-yellow-600/50 bg-gray-900 p-2.5 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-yellow-400 font-bold">{curList[0].name || SUB_LABELS[charSubTab]} <span className="text-gray-500 font-normal">HP:{curList[0].hp}</span></span>
                                <button onClick={() => {
                                  setGameData(p => ({ ...p, objects: p.objects.filter(x => x.id !== curList[0].id) }));
                                  setSelectedObjId(null);
                                }} className="grid place-items-center min-w-[2.25rem] h-9 px-2 bg-red-800 hover:bg-red-700 active:bg-red-600 rounded-lg text-[11px] text-white">削除</button>
                              </div>
                              <div className="flex items-center gap-2">
                                <input value={curList[0].emoji} onChange={e => updObj({ emoji: e.target.value.slice(0, 2) })} className="w-10 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-center text-lg" />
                                <input value={curList[0].name ?? ''} onChange={e => updObj({ name: e.target.value || undefined })} placeholder="名前" className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 outline-none" />
                              </div>
                              <SpriteRow obj={curList[0]} />
                              <div className="grid grid-cols-2 gap-2">
                                <label className="text-[10px] text-gray-400">HP<input type="text" inputMode="numeric" defaultValue={curList[0].hp} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ hp: v }); }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" /></label>
                                <label className="text-[10px] text-gray-400">速さ<input type="text" inputMode="decimal" defaultValue={curList[0].speed} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ speed: v }); }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" /></label>
                              </div>
                              {/* 撃破後セリフ */}
                              <div className="space-y-2">
                                <p className="text-[10px] text-yellow-400/80 font-bold">撃破後セリフ</p>
                                {(curList[0].outroDialogue ?? []).map((dl, di) => {
                                  const previewKey = `boss-outro-${di}`;
                                  const isActive = activePreviewKey === previewKey;
                                  const activatePv = () => setActivePreviewKey(previewKey);
                                  const updBODl = (patch: Partial<DialogueLine>) => { updObj({ outroDialogue: (curList[0].outroDialogue ?? []).map((d, j) => j === di ? { ...d, ...patch } : d) }); setActivePreviewKey(previewKey); };
                                  return (
                                    <div key={di} className={`rounded-lg border p-2 space-y-1.5 ${isActive ? 'border-yellow-500 bg-yellow-950/30' : 'border-gray-600 bg-gray-800'}`}>
                                      <div className="flex gap-1 items-center">
                                        <input value={dl.emoji ?? ''} placeholder="🎀" onChange={e => updBODl({ emoji: e.target.value })} onFocus={activatePv} className="w-8 bg-gray-700 rounded px-1 py-1.5 text-base text-center text-white outline-none" />
                                        <input value={dl.speaker} onChange={e => updBODl({ speaker: e.target.value })} onFocus={activatePv} placeholder="話者名" className="flex-1 bg-gray-700 rounded px-2 py-1.5 text-[12px] text-white outline-none" />
                                        <button onClick={() => { if (isActive) setActivePreviewKey(null); updObj({ outroDialogue: (curList[0].outroDialogue ?? []).filter((_, j) => j !== di) }); }} className="shrink-0 grid place-items-center w-8 h-8 -my-1 rounded-lg text-red-400 hover:text-red-300 active:bg-red-500/20 text-sm">✕</button>
                                      </div>
                                      <input value={dl.imageSrc ?? ''} onChange={e => updBODl({ imageSrc: e.target.value || undefined })} onFocus={activatePv} placeholder="立ち絵URL" className="w-full bg-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-300 outline-none" />
                                      <div className="flex gap-1 items-center flex-wrap">
                                        <label className="text-[9px] text-gray-400 flex items-center gap-0.5">X<input type="text" inputMode="numeric" defaultValue={dl.imageX ?? 0} onFocus={activatePv} onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updBODl({ imageX: v }); }} className="w-12 ml-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" /></label>
                                        <label className="text-[9px] text-gray-400 flex items-center gap-0.5">Y<input type="text" inputMode="numeric" defaultValue={dl.imageY ?? 0} onFocus={activatePv} onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updBODl({ imageY: v }); }} className="w-12 ml-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" /></label>
                                        <label className="text-[9px] text-gray-400 flex items-center gap-0.5 ml-2">倍率<input type="text" inputMode="decimal" defaultValue={dl.imageScale ?? 1} onFocus={activatePv} onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updBODl({ imageScale: v }); }} className="w-14 ml-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" /></label>
                                      </div>
                                      <textarea value={dl.text} onChange={e => updBODl({ text: e.target.value })} onFocus={activatePv} placeholder="セリフテキスト" rows={2} className="w-full bg-gray-700 rounded px-1.5 py-1 text-[10px] text-white outline-none resize-y" />
                                    </div>
                                  );
                                })}
                                <button onClick={() => updObj({ outroDialogue: [...(curList[0].outroDialogue ?? []), { speaker: '', emoji: '', text: '', imageX: 0, imageY: 0, imageScale: 1 }] })} className="inline-flex items-center px-3 py-2 rounded-md text-[11px] text-yellow-400 active:bg-yellow-500/10">+ セリフ追加</button>
                              </div>
                              {/* スペルカード */}
                              <div className="mt-1 space-y-2">
                                <p className="text-[10px] text-red-400/80 font-bold">スペルカード</p>
                                {(curList[0].spellCards ?? []).map((card, ci) => (
                                  <div key={ci} className="rounded-lg border border-red-800/60 bg-red-950/20 p-2 space-y-1.5">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[9px] text-red-400 shrink-0 font-bold">#{ci + 1}</span>
                                      <input value={card.name} onChange={e => updObj({ spellCards: (curList[0].spellCards ?? []).map((c, j) => j === ci ? { ...c, name: e.target.value } : c) })} placeholder="スペルカード名" className="flex-1 bg-gray-800 rounded px-1 py-0.5 text-[10px] text-white outline-none" />
                                      <button onClick={() => updObj({ spellCards: (curList[0].spellCards ?? []).filter((_, j) => j !== ci) })} className="shrink-0 grid place-items-center w-8 h-8 -my-1 rounded-lg text-red-400 hover:text-red-300 active:bg-red-500/20 text-sm">✕</button>
                                    </div>
                                    <label className="text-[9px] text-gray-400 flex items-center gap-1 flex-wrap">発動HP（以下）
                                      <input type="text" inputMode="numeric" defaultValue={card.triggerHp} onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ spellCards: (curList[0].spellCards ?? []).map((c, j) => j === ci ? { ...c, triggerHp: v } : c) }); }} className="w-16 ml-0.5 bg-gray-800 rounded px-1 py-0.5 text-[9px] text-white outline-none" />
                                    </label>
                                    <p className="text-[9px] text-gray-500">発動前セリフ</p>
                                    {(card.dialogue ?? []).map((line, li) => (
                                      <div key={li} className="rounded border border-gray-700 bg-gray-900 p-1.5 space-y-1">
                                        <div className="flex gap-1">
                                          <input value={line.speaker} onChange={e => updObj({ spellCards: (curList[0].spellCards ?? []).map((c, j) => j === ci ? { ...c, dialogue: (c.dialogue ?? []).map((l, k) => k === li ? { ...l, speaker: e.target.value } : l) } : c) })} placeholder="話者名" className="w-20 bg-gray-800 rounded px-1 py-0.5 text-[9px] text-white outline-none" />
                                          <input value={line.emoji ?? ''} onChange={e => updObj({ spellCards: (curList[0].spellCards ?? []).map((c, j) => j === ci ? { ...c, dialogue: (c.dialogue ?? []).map((l, k) => k === li ? { ...l, emoji: e.target.value || undefined } : l) } : c) })} placeholder="😊" className="w-10 bg-gray-800 rounded px-1 py-0.5 text-[9px] text-white outline-none" />
                                          <button onClick={() => updObj({ spellCards: (curList[0].spellCards ?? []).map((c, j) => j === ci ? { ...c, dialogue: (c.dialogue ?? []).filter((_, k) => k !== li) } : c) })} className="ml-auto text-red-500 text-[9px] px-0.5">✕</button>
                                        </div>
                                        <input value={line.imageSrc ?? ''} onChange={e => updObj({ spellCards: (curList[0].spellCards ?? []).map((c, j) => j === ci ? { ...c, dialogue: (c.dialogue ?? []).map((l, k) => k === li ? { ...l, imageSrc: e.target.value || undefined } : l) } : c) })} placeholder="立ち絵URL（省略可）" className="w-full bg-gray-800 rounded px-1 py-0.5 text-[9px] text-gray-300 outline-none" />
                                        <textarea value={line.text} onChange={e => updObj({ spellCards: (curList[0].spellCards ?? []).map((c, j) => j === ci ? { ...c, dialogue: (c.dialogue ?? []).map((l, k) => k === li ? { ...l, text: e.target.value } : l) } : c) })} placeholder="セリフ" rows={2} className="w-full bg-gray-800 rounded px-1 py-0.5 text-[9px] text-white outline-none resize-none" />
                                      </div>
                                    ))}
                                    <button onClick={() => updObj({ spellCards: (curList[0].spellCards ?? []).map((c, j) => j === ci ? { ...c, dialogue: [...(c.dialogue ?? []), { speaker: '', text: '', imageX: 0, imageY: 0, imageScale: 1 }] } : c) })} className="inline-flex items-center px-3 py-2 rounded-md text-[11px] text-purple-400 active:bg-purple-500/10">+ セリフ追加</button>
                                    <p className="text-[9px] text-gray-500">弾幕スクリプト（MiniScript）</p>
                                    <textarea value={card.miniScript} onChange={e => updObj({ spellCards: (curList[0].spellCards ?? []).map((c, j) => j === ci ? { ...c, miniScript: e.target.value } : c) })} placeholder="// MiniScript 記述欄" rows={3} className="w-full bg-gray-900 border border-gray-800 rounded px-1.5 py-1 text-[9px] text-green-300 font-mono outline-none resize-y" />
                                    <p className="text-[9px] text-gray-500">カットイン設定</p>
                                    {(() => {
                                      const firePreview = (overrides?: Partial<typeof spellCutinPreview>) => setSpellCutinPreview({
                                        key: Date.now(), mode: 'boss',
                                        charName: card.cutinCharName ?? curList[0].name ?? curList[0].emoji,
                                        spellName: card.name,
                                        imageUrl: card.cutinImageUrl ?? 'https://i.imgur.com/lf3x8xR.png',
                                        imageX: card.cutinImageX ?? 350, imageY: card.cutinImageY ?? 100, imageScale: card.cutinScale ?? 0.5,
                                        ...overrides,
                                      });
                                      return (
                                        <>
                                          <input value={card.cutinCharName ?? ''} onChange={e => updObj({ spellCards: (curList[0].spellCards ?? []).map((c, j) => j === ci ? { ...c, cutinCharName: e.target.value || undefined } : c) })} onFocus={() => firePreview()} placeholder="キャラクター名" className="w-full bg-gray-800 rounded px-1 py-0.5 text-[10px] text-white outline-none" />
                                          <p className="text-[9px] text-blue-400/80">立ち絵</p>
                                          <input value={card.cutinImageUrl ?? ''} onChange={e => updObj({ spellCards: (curList[0].spellCards ?? []).map((c, j) => j === ci ? { ...c, cutinImageUrl: e.target.value || undefined } : c) })} onFocus={() => firePreview()} placeholder="https://i.imgur.com/lf3x8xR.png" className="w-full bg-gray-800 rounded px-1 py-0.5 text-[9px] text-gray-300 outline-none" />
                                          <div className="flex gap-1 items-center flex-wrap">
                                            <label className="text-[9px] text-gray-400 flex items-center gap-0.5">X<input type="text" inputMode="numeric" defaultValue={card.cutinImageX ?? 350} onFocus={() => firePreview()} onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ spellCards: (curList[0].spellCards ?? []).map((c, j) => j === ci ? { ...c, cutinImageX: v } : c) }); firePreview({ imageX: v }); }} className="w-12 ml-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" /></label>
                                            <label className="text-[9px] text-gray-400 flex items-center gap-0.5">Y<input type="text" inputMode="numeric" defaultValue={card.cutinImageY ?? 100} onFocus={() => firePreview()} onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ spellCards: (curList[0].spellCards ?? []).map((c, j) => j === ci ? { ...c, cutinImageY: v } : c) }); firePreview({ imageY: v }); }} className="w-12 ml-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" /></label>
                                            <label className="text-[9px] text-gray-400 flex items-center gap-0.5 ml-1">倍率<input type="text" inputMode="decimal" defaultValue={card.cutinScale ?? 0.5} onFocus={() => firePreview()} onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ spellCards: (curList[0].spellCards ?? []).map((c, j) => j === ci ? { ...c, cutinScale: v } : c) }); firePreview({ imageScale: v }); }} className="w-12 ml-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" /></label>
                                          </div>
                                          <button onClick={() => firePreview()} className="inline-flex items-center px-3 py-2 rounded-md text-[11px] text-violet-400 hover:text-violet-300 active:bg-violet-500/10">▶ プレビュー</button>
                                        </>
                                      );
                                    })()}
                                  </div>
                                ))}
                                <button onClick={() => updObj({ spellCards: [...(curList[0].spellCards ?? []), { name: `スペルカード${(curList[0].spellCards?.length ?? 0) + 1}`, triggerHp: Math.floor(curList[0].hp * 0.5), miniScript: '// 弾幕パターンをMiniScriptで記述\nwait 60\naimed 2.0' } as SpellCardDef] })} className="inline-flex items-center px-3 py-2 rounded-md text-[11px] text-red-400 active:bg-red-500/10">+ スペルカード追加</button>
                                <label className="text-[9px] text-gray-500 flex items-center gap-1 mt-1">ボムドロップ確率
                                  <input type="text" inputMode="decimal" defaultValue={curList[0].bombDrop ?? 0} onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ bombDrop: Math.max(0, Math.min(1, v)) }); }} className="w-14 ml-0.5 bg-gray-800 rounded px-1 py-0.5 text-[9px] text-white outline-none" />
                                  <span className="text-gray-600">（0〜1）</span>
                                </label>
                              </div>
                            </div>
                          )}
                        </div>
                        );
                      })()}

                      {/* ── 前半道中 / 後半道中 ── */}
                      {(charSubTab === 'zenhan' || charSubTab === 'kohan') && (() => {
                        // この道中（半分）に属する wave フェーズ + 敵を持つフェーズを列挙
                        const groupIdxs = Array.from(new Set([
                          ...phases.map((ph, i) => ({ ph, i }))
                            .filter(({ ph, i }) => ph.kind !== 'boss' && (charSubTab === 'kohan' ? i >= midPhase : i < midPhase))
                            .map(({ i }) => i),
                          ...curList.map(o => o.phase ?? 0),
                        ])).sort((a, b) => a - b);
                        const defaultPhase = charSubTab === 'kohan' ? Math.max(midPhase, 0) : 0;
                        const hasContent = phases.length > 0 && groupIdxs.length > 0;
                        return (
                        <div className="space-y-3">
                          <label className="flex items-center gap-2 text-[11px] text-gray-300 cursor-pointer">
                            <input type="checkbox" checked={hasContent} onChange={e => {
                              if (e.target.checked) {
                                const newId = `${charSubTab}-${Date.now()}`;
                                const label = charSubTab === 'zenhan' ? '道中前半' : '道中後半';
                                const insertAt = charSubTab === 'kohan' ? Math.max(midPhase, 0) : 0;
                                setGameData(p => {
                                  const phs = p.phases ?? [];
                                  const before = phs.slice(0, insertAt);
                                  const after = phs.slice(insertAt);
                                  // Shift object phase references for phases after insertion point
                                  const shifted = p.objects.map(o => o.phase !== undefined && o.phase >= insertAt ? { ...o, phase: o.phase + 1 } : o);
                                  return { ...p, phases: [...before, { id: newId, kind: 'wave' as const, label }, ...after], objects: [...shifted, newObject({ phase: insertAt })] };
                                });
                              } else {
                                const removeIdxs = new Set(groupIdxs);
                                const sorted = [...removeIdxs].sort((a, b) => a - b);
                                setGameData(p => {
                                  const keptPhases = p.phases?.filter((_, i) => !removeIdxs.has(i));
                                  const keptObjects = p.objects.filter(o => {
                                    const ph = o.phase ?? 0;
                                    if (removeIdxs.has(ph)) return false;
                                    return true;
                                  }).map(o => {
                                    const ph = o.phase ?? 0;
                                    const shift = sorted.filter(i => i < ph).length;
                                    return shift > 0 ? { ...o, phase: ph - shift } : o;
                                  });
                                  return { ...p, phases: keptPhases, objects: keptObjects };
                                });
                              }
                            }} className="accent-cyan-500" />
                            {SUB_LABELS[charSubTab]}を使う
                          </label>
                          {!hasContent && (
                            <p className="text-[10px] text-gray-500">未設定（オミット）</p>
                          )}
                          {hasContent && groupIdxs.map(idx => {
                            const ph = phases[idx];
                            const isWave = ph?.kind !== 'boss';
                            const enemies = curList.filter(o => (o.phase ?? 0) === idx);
                            return (
                              <div key={idx} className="rounded-lg border border-gray-700 bg-gray-900/50 p-2 space-y-2">
                                <p className="text-[10px] font-bold text-cyan-400">フェーズ{idx}{ph?.label ? `：${ph.label}` : ''}{!isWave && <span className="text-red-400/70 ml-1">(ボス)</span>}</p>
                                {/* 敵テンプレート一覧（spawn() の参照名） */}
                                <div className="space-y-1">
                                  {enemies.map((o, ei) => (
                                    <button key={o.id} onClick={() => setSelectedObjId(o.id)}
                                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[10px] text-left border ${activeSelObj?.id === o.id ? 'bg-blue-800/40 border-blue-600/50 text-blue-200' : 'bg-gray-800/40 border-gray-700/40 text-gray-400 hover:bg-gray-700/40'}`}>
                                      <SpriteThumbnail spriteRef={o.spriteRef} spriteUrl={o.spriteUrl} emoji={o.emoji} size={20} imgCache={imgCache} keyedCache={keyedCache} className="rounded" />
                                      <span className="truncate flex-1">{o.name || '敵'}</span>
                                      <code className="text-cyan-500/80 text-[9px] shrink-0">{o.name ? `"${o.name}"` : ei + 1}</code>
                                    </button>
                                  ))}
                                </div>
                                <button onClick={() => {
                                  const o = newObject({ phase: idx });
                                  setGameData(p => ({ ...p, objects: [...p.objects, o] }));
                                  setSelectedObjId(o.id);
                                }} className="w-full flex items-center justify-center gap-1 py-1 rounded border border-dashed border-gray-600 text-[10px] text-gray-400 hover:bg-gray-100/5">
                                  <Plus size={11} />敵テンプレ追加
                                </button>
                                {/* wave 出現スクリプト */}
                                {isWave && (
                                  <div className="space-y-1">
                                    <p className="text-[9px] text-cyan-400/80 font-bold">wave 出現スクリプト（MiniScript）</p>
                                    <textarea
                                      value={ph?.spawnScript ?? ''}
                                      onChange={e => setGameData(p => ({ ...p, phases: p.phases!.map((x, i) => i === idx ? { ...x, spawnScript: e.target.value } : x) }))}
                                      rows={5}
                                      placeholder={'// 数・タイミング・配置を記述（空欄なら全敵を一斉配置）\nwait(60)\nspawnRow(1, 5, -20, 80, 80)\nwait(90)\nfor i in range(0, 7, 1)\n  spawn("青ザコ", rand(40, W-40), -20)\n  wait(35)\nend for'}
                                      className="w-full bg-gray-950 border border-gray-800 rounded px-1.5 py-1 text-[9px] text-green-300 font-mono outline-none resize-y" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {phases.length === 0 && (
                            <button onClick={() => {
                              const o = newObject({ phase: defaultPhase });
                              setGameData(p => ({ ...p, objects: [...p.objects, o] }));
                              setSelectedObjId(o.id);
                            }} className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-gray-600 text-[10px] text-gray-400 hover:bg-gray-100/5">
                              <Plus size={11} />敵追加
                            </button>
                          )}
                          {/* spawn() リファレンス */}
                          <details className="text-[9px] text-gray-500 bg-gray-900/40 rounded border border-gray-800">
                            <summary className="cursor-pointer px-2 py-1 text-cyan-400/70">spawn() 関数リファレンス</summary>
                            <div className="px-2 pb-2 space-y-0.5 font-mono leading-relaxed">
                              <p><code>spawn(敵, x, y)</code> 敵を1体配置（x省略=中央, y省略=画面上）</p>
                              <p><code>spawnRow(敵, 個数, y, x開始, 間隔)</code> 横一列に配置</p>
                              <p><code>wait(f)</code> f フレーム待機 / <code>count</code> 敵テンプレ数</p>
                              <p><code>rand(a,b) randF(a,b) range(a,b,s)</code> / <code>W H</code> 画面幅高</p>
                              <p className="text-gray-600">敵は名前 <code>&quot;名前&quot;</code> か番号(1始まり)で指定</p>
                            </div>
                          </details>
                          {activeSelObj && (
                            <div key={activeSelObj.id} className="rounded-lg border border-blue-600/50 bg-gray-900 p-2.5 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-blue-400 font-bold">選択中: {activeSelObj.name || '敵'}</span>
                                <button onClick={delObj} className="grid place-items-center min-w-[2.25rem] h-9 px-2 bg-red-800 hover:bg-red-700 active:bg-red-600 rounded-lg text-[11px] text-white">削除</button>
                              </div>
                              <div className="flex items-center gap-2">
                                <input value={activeSelObj.emoji} onChange={e => updObj({ emoji: e.target.value.slice(0, 2) })} className="w-10 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-center text-lg" />
                                <input value={activeSelObj.name ?? ''} onChange={e => updObj({ name: e.target.value || undefined })} placeholder="名前（spawn の参照名）" className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 outline-none" />
                              </div>
                              <SpriteRow obj={activeSelObj} />
                              <label className="text-[10px] text-gray-400 flex items-center gap-1">フェーズ
                                <input type="number" min={0} max={20} value={activeSelObj.phase ?? 0} onChange={e => updObj({ phase: Number(e.target.value) })} className="w-16 ml-1 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-200 outline-none text-center" />
                              </label>
                              <div className="grid grid-cols-2 gap-2">
                                <label className="text-[10px] text-gray-400">HP<input type="text" inputMode="numeric" defaultValue={activeSelObj.hp} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ hp: v }); }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" /></label>
                                <label className="text-[10px] text-gray-400">速さ<input type="text" inputMode="decimal" defaultValue={activeSelObj.speed} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ speed: v }); }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" /></label>
                              </div>
                              <div className="grid grid-cols-3 gap-2 items-end">
                                <label className="text-[10px] text-gray-400">発射間隔(f)<input type="text" inputMode="numeric" defaultValue={activeSelObj.fireRate} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ fireRate: v }); }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" /></label>
                                <label className="text-[10px] text-gray-400">弾速<input type="text" inputMode="decimal" defaultValue={activeSelObj.bulletSpeed} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updObj({ bulletSpeed: v }); }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" /></label>
                                <label className="text-[10px] text-gray-400 flex items-center gap-1">弾色<input type="color" value={activeSelObj.bulletColor} onChange={e => updObj({ bulletColor: e.target.value })} className="w-9 h-9 rounded-lg border border-gray-700 bg-transparent cursor-pointer" /></label>
                              </div>
                              <label className="block text-[10px] text-gray-400">動き・弾幕スクリプト（MiniScript / 任意）
                                <textarea value={activeSelObj.miniScript ?? ''}
                                  onChange={e => { const v = e.target.value; updObj(v ? { miniScript: v, bullet: 'none' } : { miniScript: undefined }); }}
                                  rows={4}
                                  placeholder={'// 例：下へ移動しつつ自機狙い3連射\nmoveTo(getX(), H+40, 200)\nfor t in range(0, 2, 1)\n  shotPlayer(3, 5, 8)\n  wait(40)\nend for'}
                                  className="w-full mt-0.5 bg-gray-950 border border-gray-800 rounded px-1.5 py-1 text-[9px] text-green-300 font-mono outline-none resize-y" />
                              </label>
                              <label className="flex items-center gap-1 text-[10px] text-gray-400"><input type="checkbox" checked={activeSelObj.hazard} onChange={e => updObj({ hazard: e.target.checked })} className="accent-red-500" />接触でミス</label>
                            </div>
                          )}
                        </div>
                        );
                      })()}
                    </div>
                  );
                })()}

                {/* ── SOUND ── */}
                {editorTab === 'sound' && (
                  <div className="space-y-4">
                    {/* 道中BGM */}
                    <div>
                      <label className="flex text-[11px] text-gray-400 mb-1 items-center gap-1">
                        <Music size={12} />{gameData.engine === 'touhou' ? '道中BGM' : 'BGM'}
                      </label>
                      <button onClick={() => setPicker({ mode: 'bgm', target: { t: 'bgm' } })}
                        className="w-full flex items-center justify-between py-2 px-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[11px] text-gray-300">
                        <span className="truncate">{gameData.bgm ? refLabel(gameData.bgm.ref) : '未設定（YouTube / MML / URL）'}</span>
                        <Music size={13} className="shrink-0 ml-1" />
                      </button>
                      {gameData.bgm && (
                        <>
                          <div className="mt-1 flex items-center gap-2">
                            <button onClick={() => previewMmlAsset('bgm', gameData.bgm)} className="px-2.5 py-1.5 rounded-md text-[11px] text-emerald-300 hover:text-emerald-200 active:bg-emerald-500/15">試聴</button>
                            <button onClick={() => setGameData(p => ({ ...p, bgm: undefined }))} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] text-gray-400 hover:text-red-400 active:bg-red-500/15"><Trash2 size={13} />外す</button>
                          </div>
                          <BgmVolumeSettings
                            bgm={gameData.bgm}
                            onChange={(newRef) => setGameData(p => ({ ...p, bgm: p.bgm ? { ...p.bgm, ref: newRef } : undefined }))}
                          />
                          <MmlLoopSettings
                            bgm={gameData.bgm}
                            onChange={(newRef) => setGameData(p => ({ ...p, bgm: p.bgm ? { ...p.bgm, ref: newRef } : undefined }))}
                          />
                        </>
                      )}
                    </div>

                    {/* 通常戦闘BGM（RPGのみ） */}
                    {gameData.engine === 'rpg' && (
                      <div>
                        <label className="flex text-[11px] text-gray-400 mb-1 items-center gap-1">
                          <Music size={12} />通常戦闘BGM
                        </label>
                        <button onClick={() => setPicker({ mode: 'bgm', target: { t: 'battleBgm' } })}
                          className="w-full flex items-center justify-between py-2 px-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[11px] text-gray-300">
                          <span className="truncate">{gameData.battleBgm ? refLabel(gameData.battleBgm.ref) : '未設定（空欄=マップBGMのまま）'}</span>
                          <Music size={13} className="shrink-0 ml-1" />
                        </button>
                        {gameData.battleBgm && (
                          <>
                            <div className="mt-1 flex items-center gap-2">
                              <button onClick={() => previewMmlAsset('battleBgm', gameData.battleBgm)} className="px-2.5 py-1.5 rounded-md text-[11px] text-emerald-300 hover:text-emerald-200 active:bg-emerald-500/15">試聴</button>
                              <button onClick={() => setGameData(p => ({ ...p, battleBgm: undefined }))} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] text-gray-400 hover:text-red-400 active:bg-red-500/15"><Trash2 size={13} />外す</button>
                            </div>
                            <BgmVolumeSettings
                              bgm={gameData.battleBgm}
                              onChange={(newRef) => setGameData(p => ({ ...p, battleBgm: p.battleBgm ? { ...p.battleBgm, ref: newRef } : undefined }))}
                            />
                            <MmlLoopSettings
                              bgm={gameData.battleBgm}
                              onChange={(newRef) => setGameData(p => ({ ...p, battleBgm: p.battleBgm ? { ...p.battleBgm, ref: newRef } : undefined }))}
                            />
                          </>
                        )}
                        <p className="text-[10px] text-gray-600 mt-1">通常エンカウント開始時に切り替え。空欄ならマップBGMのまま。</p>
                      </div>
                    )}

                    {/* ボス戦BGM（東方・RPG） */}
                    {(gameData.engine === 'touhou' || gameData.engine === 'rpg') && (
                      <div>
                        <label className="flex text-[11px] text-gray-400 mb-1 items-center gap-1">
                          <Music size={12} />ボス戦BGM
                        </label>
                        <button onClick={() => setPicker({ mode: 'bgm', target: { t: 'bossBgm' } })}
                          className="w-full flex items-center justify-between py-2 px-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[11px] text-gray-300">
                          <span className="truncate">{gameData.bossBgm ? refLabel(gameData.bossBgm.ref) : '未設定（空欄=通常戦闘と同じ）'}</span>
                          <Music size={13} className="shrink-0 ml-1" />
                        </button>
                        {gameData.bossBgm && (
                          <>
                            <div className="mt-1 flex items-center gap-2">
                              <button onClick={() => previewMmlAsset('bossBgm', gameData.bossBgm)} className="px-2.5 py-1.5 rounded-md text-[11px] text-emerald-300 hover:text-emerald-200 active:bg-emerald-500/15">試聴</button>
                              <button onClick={() => setGameData(p => ({ ...p, bossBgm: undefined }))} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] text-gray-400 hover:text-red-400 active:bg-red-500/15"><Trash2 size={13} />外す</button>
                            </div>
                            <BgmVolumeSettings
                              bgm={gameData.bossBgm}
                              onChange={(newRef) => setGameData(p => ({ ...p, bossBgm: p.bossBgm ? { ...p.bossBgm, ref: newRef } : undefined }))}
                            />
                            <MmlLoopSettings
                              bgm={gameData.bossBgm}
                              onChange={(newRef) => setGameData(p => ({ ...p, bossBgm: p.bossBgm ? { ...p.bossBgm, ref: newRef } : undefined }))}
                            />
                          </>
                        )}
                        <p className="text-[10px] text-gray-600 mt-1">{gameData.engine === 'touhou' ? 'ボスフェーズ（kind: boss）開始時に自動切り替え。空欄なら道中BGMのまま。' : 'ボス戦開始時に切り替え。空欄なら通常戦闘BGMのまま。'}</p>
                      </div>
                    )}

                    {/* 効果音 */}
                    <div>
                      <label className="flex text-[11px] text-gray-400 mb-1.5 items-center gap-1"><Volume2 size={12} />効果音(SE)</label>
                      <div className="space-y-1.5">
                        {(Object.keys(SFX_LABELS) as SfxTrigger[]).filter(trig => {
                          // 東方専用SE は東方エンジンのときだけ表示
                          if (trig === 'graze' || trig === 'spellcard') return gameData.engine === 'touhou';
                          return true;
                        }).map(trig => (
                          <div key={trig} className="bg-gray-900 rounded-lg p-2 border border-gray-800 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-400 w-20 shrink-0">{SFX_LABELS[trig]}</span>
                              <button onClick={() => setPicker({ mode: 'bgm', target: { t: 'sfx', trigger: trig } })} className="flex-1 min-w-0 text-left text-[10px] text-gray-300 truncate">{gameData.sfx[trig] ? refLabel(gameData.sfx[trig]!.ref) : '未設定'}</button>
                              {gameData.sfx[trig] && <button onClick={() => previewMmlAsset(`sfx-${trig}`, gameData.sfx[trig])} className="shrink-0 px-2.5 py-1.5 rounded-md text-[11px] text-emerald-300 hover:text-emerald-200 active:bg-emerald-500/15">試聴</button>}
                              {gameData.sfx[trig] && <button onClick={() => setGameData(p => { const s = { ...p.sfx }; delete s[trig]; return { ...p, sfx: s }; })} className="shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={16} /></button>}
                            </div>
                            {gameData.sfx[trig] && (
                              <BgmVolumeSettings
                                bgm={gameData.sfx[trig]}
                                onChange={(newRef) => setGameData(p => ({ ...p, sfx: { ...p.sfx, [trig]: { ...p.sfx[trig]!, ref: newRef } } }))}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-600 mt-1.5">MML推奨（即時再生）。MP3直リンクはURLタブで入力。</p>
                    </div>
                  </div>
                )}

                {/* ── ASSET ── */}
                {/* ── SCENE ── */}
                {editorTab === ('scene' as EditorTab) && gameData.scenes && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-400 font-bold">シーン一覧</span>
                      <button onClick={addScene}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-violet-700 hover:bg-violet-600 text-[10px] text-white font-bold">
                        <Plus size={11} />追加
                      </button>
                    </div>

                    {gameData.scenes.map((sc, idx) => {
                      const isActive = idx === editSceneIdx;
                      return (
                        <div key={sc.id}
                          className={`rounded-xl border p-3 space-y-2 transition ${isActive ? 'border-violet-500 bg-violet-900/20' : 'border-gray-700 bg-gray-900/40'}`}>
                          {/* ヘッダー */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500 font-mono shrink-0">{idx + 1}</span>
                            <input value={sc.name ?? `シーン${idx + 1}`}
                              onChange={e => setGameData(prev => ({
                                ...prev,
                                scenes: prev.scenes!.map((s, i) => i === idx ? { ...s, name: e.target.value } : s)
                              }))}
                              className="flex-1 bg-transparent border-b border-gray-700 focus:border-violet-500 text-[11px] text-white outline-none pb-0.5" />
                            {isActive
                              ? <span className="text-[9px] font-black text-violet-400 bg-violet-400/10 rounded px-1.5 py-0.5">編集中</span>
                              : <button onClick={() => { flushSceneEdits(); switchEditScene(idx); }}
                                  className="text-[9px] text-gray-500 hover:text-white border border-gray-700 hover:border-gray-500 rounded px-2 py-0.5 transition">選択</button>}
                            {gameData.scenes!.length > 1 && (
                              <button onClick={() => removeScene(idx)}
                                className="text-gray-600 hover:text-red-400 transition"><X size={12} /></button>
                            )}
                          </div>

                          {/* 出口設定 */}
                          <div className="grid grid-cols-2 gap-1.5">
                            {(['right', 'left', 'down', 'up'] as (keyof SceneExit)[]).map(dir => {
                              const label = { right: '右→', left: '←左', down: '下↓', up: '↑上' }[dir];
                              return (
                                <label key={dir} className="flex items-center gap-1 text-[10px] text-gray-500">
                                  <span className="w-6 shrink-0">{label}</span>
                                  <select value={sc.exits?.[dir] ?? ''}
                                    onChange={e => updateSceneExit(sc.id, dir, e.target.value)}
                                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-200 outline-none min-w-0">
                                    <option value="">（なし）</option>
                                    {gameData.scenes!.filter((_, i) => i !== idx).map(s2 => (
                                      <option key={s2.id} value={s2.id}>{s2.name ?? `シーン${gameData.scenes!.indexOf(s2) + 1}`}</option>
                                    ))}
                                  </select>
                                </label>
                              );
                            })}
                          </div>

                          {/* シーンBGM設定 */}
                          <div className="space-y-1.5 pt-1.5 border-t border-gray-850">
                            <div className="flex items-center justify-between text-[9px] text-gray-400">
                              <span>シーン固有BGM (空欄=全体のBGM)</span>
                              {sc.bgm && (
                                <button onClick={() => setGameData(p => ({ ...p, scenes: p.scenes!.map((s, i) => i === idx ? { ...s, bgm: undefined } : s) }))}
                                  className="text-gray-500 hover:text-red-400">外す</button>
                              )}
                            </div>
                            <button onClick={() => setPicker({ mode: 'bgm', target: { t: 'sceneBgm', idx } })}
                              className="w-full flex items-center justify-between py-1 px-1.5 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[10px] text-gray-300">
                              <span className="truncate">{sc.bgm ? refLabel(sc.bgm.ref) : '未設定（全体のBGMを使用）'}</span>
                              <Music size={11} className="shrink-0 ml-1" />
                            </button>
                            {sc.bgm && (
                              <>
                                <BgmVolumeSettings
                                  bgm={sc.bgm}
                                  onChange={(newRef) => setGameData(p => ({
                                    ...p,
                                    scenes: p.scenes!.map((s, i) => i === idx ? { ...s, bgm: { ...s.bgm!, ref: newRef } } : s)
                                  }))}
                                />
                                <MmlLoopSettings
                                  bgm={sc.bgm}
                                  onChange={(newRef) => setGameData(p => ({
                                    ...p,
                                    scenes: p.scenes!.map((s, i) => i === idx ? { ...s, bgm: { ...s.bgm!, ref: newRef } } : s)
                                  }))}
                                />
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    <p className="text-[9px] text-gray-600 leading-relaxed">
                      シーンを選択するとマップ・オブジェクトタブで編集できます。<br />
                      プレイ中に指定した辺に到達するとスライドで遷移します。
                    </p>
                  </div>
                )}

                {editorTab === 'asset' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">タイトル</label>
                      <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200" />
                    </div>

                    {/* ── スイッチ一覧エディタ ── */}
                    <div>
                      <label className="flex text-[11px] text-gray-400 mb-1.5 items-center gap-1">🔘 スイッチ</label>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {(gameData.switches ?? []).length === 0 && <p className="text-[9px] text-gray-500 px-1">（なし）</p>}
                        {(gameData.switches ?? []).map((s, i) => (
                          <div key={s.id} className="flex items-center gap-1 bg-gray-900 rounded px-1.5 py-1 border border-gray-800">
                            <input value={s.name} onChange={e => setGameData(p => {
                              const copy = [...(p.switches ?? [])]; copy[i] = { ...copy[i], name: e.target.value }; return { ...p, switches: copy };
                            })} className="flex-1 min-w-0 bg-transparent text-[10px] text-gray-300 outline-none" />
                            <span className={`text-[9px] ${switchVals[s.id] ? 'text-green-400' : 'text-gray-500'}`}>
                              {switchVals[s.id] ? 'ON' : 'OFF'}
                            </span>
                            <button onClick={() => setGameData(p => {
                              const copy = [...(p.switches ?? [])]; copy.splice(i, 1); return { ...p, switches: copy.length > 0 ? copy : undefined };
                            })} className="shrink-0 px-2.5 py-1.5 rounded-md text-[11px] text-red-400 hover:text-red-300 active:bg-red-500/15">削除</button>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => setGameData(p => {
                        const arr = p.switches ?? []; const id = arr.length > 0 ? Math.max(...arr.map(s => s.id)) + 1 : 1;
                        return { ...p, switches: [...arr, { id, name: `スイッチ${id}` }] };
                      })} className="w-full flex items-center justify-center gap-1 py-1.5 rounded border border-dashed border-gray-600 text-[10px] text-gray-400 hover:bg-gray-100/5 mt-1">
                        <Plus size={11} />スイッチ追加</button>
                    </div>
                    {/* ── アイテム一覧エディタ ── */}
                    <div>
                      <label className="flex text-[11px] text-gray-400 mb-1.5 items-center gap-1">🎒 アイテム</label>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {(gameData.items ?? []).length === 0 && <p className="text-[9px] text-gray-500 px-1">（なし）</p>}
                        {(gameData.items ?? []).map((it, i) => (
                          <div key={it.id} className="flex items-center gap-1 bg-gray-900 rounded px-1.5 py-1 border border-gray-800">
                            <input value={it.emoji} onChange={e => setGameData(p => {
                              const copy = [...(p.items ?? [])]; copy[i] = { ...copy[i], emoji: e.target.value.slice(0, 2) }; return { ...p, items: copy };
                            })} className="w-6 bg-transparent text-center text-sm outline-none" />
                            <input value={it.name} onChange={e => setGameData(p => {
                              const copy = [...(p.items ?? [])]; copy[i] = { ...copy[i], name: e.target.value }; return { ...p, items: copy };
                            })} className="flex-1 min-w-0 bg-transparent text-[10px] text-gray-300 outline-none" />
                            <span className="text-[9px] text-gray-500">×{inventory[it.id] ?? 0}</span>
                            <button onClick={() => setGameData(p => {
                              const copy = [...(p.items ?? [])]; copy.splice(i, 1); return { ...p, items: copy.length > 0 ? copy : undefined };
                            })} className="shrink-0 px-2.5 py-1.5 rounded-md text-[11px] text-red-400 hover:text-red-300 active:bg-red-500/15">削除</button>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => setGameData(p => {
                        const arr = p.items ?? []; const id = `item${Date.now()}`;
                        return { ...p, items: [...arr, { id, name: `アイテム${arr.length + 1}`, emoji: '💊' }] };
                      })} className="w-full flex items-center justify-center gap-1 py-1.5 rounded border border-dashed border-gray-600 text-[10px] text-gray-400 hover:bg-gray-100/5 mt-1">
                        <Plus size={11} />アイテム追加</button>
                    </div>

                    <div>
                      <label className="flex text-[11px] text-gray-400 mb-1.5 items-center gap-1"><ImageIcon size={12} />タイル画像（任意・参照のみ）</label>
                      <div className="space-y-1.5">
                        {Object.entries(gameData.tiles).filter(([id]) => Number(id) !== 0).map(([id, tile]) => (
                          <div key={id} className="flex items-center gap-2 bg-gray-900 rounded-lg px-2 py-1.5 border border-gray-800">
                            <div className="w-6 h-6 shrink-0 rounded border border-gray-600 overflow-hidden" style={{ backgroundColor: tile.color }}>
                              {tile.imageUrl && <SpriteThumbnail spriteUrl={tile.imageUrl} size={24} imgCache={imgCache} keyedCache={keyedCache} className="w-full h-full" />}
                            </div>
                            <span className="text-[10px] text-gray-400 flex-1 truncate">{tile.name}</span>
                            {tile.imageRef && <button onClick={() => setGameData(p => ({ ...p, tiles: { ...p.tiles, [id]: { ...p.tiles[Number(id)], imageRef: undefined, imageUrl: undefined } } }))} className="shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={16} /></button>}
                            <button onClick={() => setPicker({ mode: 'image', target: { t: 'tile', id: Number(id) } })} className="text-[10px] text-blue-400 hover:text-blue-300 shrink-0">参照</button>
                          </div>
                        ))}
                      </div>
                      <button onClick={addTile} className="w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-gray-600 text-[11px] text-gray-400 hover:bg-gray-100/5"> <Plus size={13} />タイル定義を増やす</button>
                      <p className="text-[10px] text-gray-600 mt-1.5">画像は既存の投稿・歩行グラ・URLを参照（実体は保存しません）。</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {picker && (
        <ContentPicker
          mode={picker.mode}
          bgmKind={picker.target.t === 'sfx' ? 'sfx' : 'bgm'}
          userId={userId}
          onPick={applyPick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

// ── イベントページエディタ ──

const COMMAND_LABELS: Record<EventCommand['type'], string> = {
  message: 'メッセージ', choice: '選択肢', ifSwitch: 'スイッチ条件分岐', ifItem: 'アイテム条件分岐',
  ifGold: 'ゴールド条件分岐', setSwitch: 'スイッチ変更', setSelfSwitch: 'セルフスイッチ',
  giveItem: 'アイテム入手', removeItem: 'アイテム削除', changeGold: 'ゴールド増減',
  restoreHp: 'HP回復', restoreMp: 'MP回復',
  warp: 'ワープ', wait: 'ウェイト', comment: 'コメント', label: 'ラベル', jump: 'ジャンプ',
};

const NEW_COMMAND = (): EventCommand => ({ type: 'message', text: '' });

function EventPageEditor({ pages, setPages, switches, items }:
  { pages: EventPage[]; setPages: (p: EventPage[]) => void; switches: SwitchDef[]; items: ItemDef[] }) {
  const [expanded, setExpanded] = useState<number>(0);
  const addPage = () => {
    setPages([...pages, { name: `ページ${pages.length + 1}`, conditions: {}, commands: [] }]);
    setExpanded(pages.length);
  };
  const setPage = (i: number, patch: Partial<EventPage>) => {
    const copy = pages.map((p, j) => j === i ? { ...p, ...patch } : p);
    setPages(copy);
  };
  const delPage = (i: number) => {
    const copy = pages.filter((_, j) => j !== i);
    setPages(copy);
    if (expanded >= copy.length) setExpanded(Math.max(0, copy.length - 1));
  };

  // command helpers
  const setCmds = (pi: number, cmds: EventCommand[]) => setPage(pi, { commands: cmds });
  const addCmd = (pi: number) => setCmds(pi, [...pages[pi].commands, NEW_COMMAND()]);
  const updCmd = (pi: number, ci: number, patch: Partial<EventCommand>) => {
    const cmds = pages[pi].commands.map((c, j) => j === ci ? { ...c, ...patch } as EventCommand : c);
    setCmds(pi, cmds);
  };
  const delCmd = (pi: number, ci: number) => setCmds(pi, pages[pi].commands.filter((_, j) => j !== ci));
  const moveCmd = (pi: number, ci: number, dir: -1 | 1) => {
    const cmds = [...pages[pi].commands];
    const ni = ci + dir;
    if (ni < 0 || ni >= cmds.length) return;
    [cmds[ci], cmds[ni]] = [cmds[ni], cmds[ci]];
    setCmds(pi, cmds);
  };

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400 font-bold">イベントページ</span>
        <button onClick={addPage}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-800 hover:bg-blue-700 text-[9px] text-white">
          <Plus size={10} />ページ追加
        </button>
      </div>
      {pages.length === 0 && <p className="text-[9px] text-gray-500">ページがありません。追加してイベントを定義してください。</p>}
      {pages.map((page, pi) => (
        <div key={pi} className="border border-gray-700/60 rounded bg-gray-800/30 overflow-hidden">
          <button onClick={() => setExpanded(expanded === pi ? -1 : pi)}
            className="w-full flex items-center gap-1 px-2 py-1.5 text-[10px] text-left font-bold text-gray-300 hover:bg-gray-700/30">
            <span className="text-gray-500">{expanded === pi ? '▼' : '▶'}</span>
            <span className="flex-1 truncate">{page.name}</span>
            <span className="text-[9px] text-gray-500">{page.commands.length}コマンド</span>
            {pages.length > 1 && <button onClick={e => { e.stopPropagation(); delPage(pi); }}
              className="text-red-400 hover:text-red-300 text-[9px] px-1">削除</button>}
          </button>
          {expanded === pi && (
            <div className="px-2 pb-2 space-y-1.5">
              {/* ページ名 */}
              <input value={page.name ?? ''} onChange={e => setPage(pi, { name: e.target.value })}
                placeholder="ページ名" className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-gray-200 outline-none" />
              {/* 条件 */}
              <div className="text-[9px] text-gray-400 font-bold">発生条件（すべてAND / 空=常時）</div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {switches.length > 0 ? (
                  <select value={page.conditions.switchId ?? ''} onChange={e => setPage(pi, { conditions: { ...page.conditions, switchId: e.target.value ? Number(e.target.value) : undefined } })}
                    className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] outline-none text-gray-200">
                    <option value="">スイッチなし</option>
                    {switches.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                ) : <span className="text-[9px] text-gray-500">スイッチ未定義</span>}
                {page.conditions.switchId != null && (
                  <select value={page.conditions.switchValue ? 'ON' : 'OFF'} onChange={e => setPage(pi, { conditions: { ...page.conditions, switchValue: e.target.value === 'ON' } })}
                    className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] outline-none text-gray-200">
                    <option value="ON">ON</option><option value="OFF">OFF</option>
                  </select>
                )}
              </div>
              {/* コマンド一覧 */}
              <div className="text-[9px] text-gray-400 font-bold mt-1">コマンド</div>
              {page.commands.length === 0 && <p className="text-[9px] text-gray-500">（なし）</p>}
              {page.commands.map((cmd, ci) => (
                <CommandEditor key={ci} cmd={cmd} index={ci} count={page.commands.length}
                  switches={switches} items={items}
                  onChange={patch => updCmd(pi, ci, patch)}
                  onDelete={() => delCmd(pi, ci)}
                  onMove={dir => moveCmd(pi, ci, dir)}
                />
              ))}
              <button onClick={() => addCmd(pi)}
                className="w-full flex items-center justify-center gap-0.5 py-1 rounded border border-dashed border-gray-600 text-[9px] text-gray-400 hover:bg-gray-100/5">
                <Plus size={10} />コマンド追加
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── 単一イベントコマンドエディタ ──

function CommandEditor({ cmd, index, count, switches, items, onChange, onDelete, onMove }:
  { cmd: EventCommand; index: number; count: number; switches: SwitchDef[]; items: ItemDef[];
    onChange: (patch: Partial<EventCommand>) => void; onDelete: () => void; onMove: (dir: -1 | 1) => void }) {
  const type = cmd.type;
  const setType = (t: EventCommand['type']) => {
    // reset fields when switching type
    const base: EventCommand = (() => {
      switch (t) {
        case 'message': return { type: 'message', text: '' };
        case 'choice': return { type: 'choice', text: '', choices: [], cancelIndex: undefined };
        case 'ifSwitch': return { type: 'ifSwitch', switchId: 0, value: true, then: [], else: undefined };
        case 'ifItem': return { type: 'ifItem', itemId: '', has: true, then: [], else: undefined };
        case 'setSwitch': return { type: 'setSwitch', switchId: 0, value: true };
        case 'setSelfSwitch': return { type: 'setSelfSwitch', id: 'A', value: true };
        case 'giveItem': return { type: 'giveItem', itemId: '', count: 1 };
        case 'removeItem': return { type: 'removeItem', itemId: '', count: 1 };
        case 'changeGold': return { type: 'changeGold', amount: 0 };
        case 'restoreHp': return { type: 'restoreHp', amount: undefined };
        case 'restoreMp': return { type: 'restoreMp', amount: undefined };
        case 'ifGold': return { type: 'ifGold', amount: 0, then: [], else: undefined };
        case 'warp': return { type: 'warp', col: 0, row: 0 };
        case 'wait': return { type: 'wait', frames: 30 };
        case 'comment': return { type: 'comment', text: '' };
        case 'label': return { type: 'label', name: '' };
        case 'jump': return { type: 'jump', label: '' };
        case 'ifGold': return { type: 'ifGold', amount: 0, then: [], else: undefined };
        case 'changeGold': return { type: 'changeGold', amount: 0 };
        case 'restoreHp': return { type: 'restoreHp' };
        case 'restoreMp': return { type: 'restoreMp' };
      }
    })();
    onChange(base);
  };
  const inputCls = 'bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none w-full';
  return (
    <div className="flex items-start gap-1 bg-gray-900/50 rounded p-1">
      <div className="flex flex-col gap-0.5 shrink-0">
        <button onClick={() => onMove(-1)} disabled={index === 0}
          className="text-[9px] text-gray-500 hover:text-white disabled:opacity-20 leading-none">▲</button>
        <button onClick={() => onMove(1)} disabled={index === count - 1}
          className="text-[9px] text-gray-500 hover:text-white disabled:opacity-20 leading-none">▼</button>
        <button onClick={onDelete} className="text-[9px] text-red-400 hover:text-red-300 leading-none">×</button>
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <select value={type} onChange={e => setType(e.target.value as EventCommand['type'])}
          className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] outline-none text-gray-200 w-full">
          {(Object.keys(COMMAND_LABELS) as EventCommand['type'][]).map(t =>
            <option key={t} value={t}>{COMMAND_LABELS[t]}</option>)}
        </select>
        {/* type-specific controls */}
        {type === 'message' && (
          <textarea value={(cmd as any).text ?? ''} onChange={e => onChange({ text: e.target.value })}
            rows={2} className={inputCls} placeholder="メッセージ" />
        )}
        {type === 'choice' && (
          <div className="space-y-0.5">
            <textarea value={(cmd as any).text ?? ''} onChange={e => onChange({ text: e.target.value })}
              rows={1} className={inputCls} placeholder="質問文" />
            <div className="text-[8px] text-gray-500">選択肢はコード編集が必要です（準備中）</div>
          </div>
        )}
        {type === 'ifSwitch' && (
          <div className="flex items-center gap-1">
            {switches.length > 0 ? (
              <select value={(cmd as any).switchId ?? 0} onChange={e => onChange({ switchId: Number(e.target.value) })}
                className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] outline-none text-gray-200 flex-1">
                {switches.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : <span className="text-[8px] text-gray-500">スイッチ未定義</span>}
            <select value={(cmd as any).value ? 'ON' : 'OFF'} onChange={e => onChange({ value: e.target.value === 'ON' })}
              className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] outline-none text-gray-200">
              <option value="ON">ON</option><option value="OFF">OFF</option>
            </select>
          </div>
        )}
        {type === 'ifItem' && (
          <div className="flex items-center gap-1">
            {items.length > 0 ? (
              <select value={(cmd as any).itemId ?? ''} onChange={e => onChange({ itemId: e.target.value })}
                className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] outline-none text-gray-200 flex-1">
                {items.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : <span className="text-[8px] text-gray-500">アイテム未定義</span>}
            <select value={(cmd as any).has ? 'あり' : 'なし'} onChange={e => onChange({ has: e.target.value === 'あり' })}
              className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] outline-none text-gray-200">
              <option value="あり">持っている</option><option value="なし">持っていない</option>
            </select>
          </div>
        )}
        {type === 'setSwitch' && (
          <div className="flex items-center gap-1">
            {switches.length > 0 ? (
              <select value={(cmd as any).switchId ?? 0} onChange={e => onChange({ switchId: Number(e.target.value) })}
                className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] outline-none text-gray-200 flex-1">
                {switches.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : <span className="text-[8px] text-gray-500">スイッチ未定義</span>}
            <select value={(cmd as any).value ? 'ON' : 'OFF'} onChange={e => onChange({ value: e.target.value === 'ON' })}
              className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] outline-none text-gray-200">
              <option value="ON">ON</option><option value="OFF">OFF</option>
            </select>
          </div>
        )}
        {type === 'setSelfSwitch' && (
          <div className="flex items-center gap-1">
            <select value={(cmd as any).id ?? 'A'} onChange={e => onChange({ id: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] outline-none text-gray-200">
              {['A', 'B', 'C', 'D'].map(s => <option key={s} value={s}>セルフ{s}</option>)}
            </select>
            <select value={(cmd as any).value ? 'ON' : 'OFF'} onChange={e => onChange({ value: e.target.value === 'ON' })}
              className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] outline-none text-gray-200">
              <option value="ON">ON</option><option value="OFF">OFF</option>
            </select>
          </div>
        )}
        {(type === 'giveItem' || type === 'removeItem') && (
          <div className="flex items-center gap-1">
            {items.length > 0 ? (
              <select value={(cmd as any).itemId ?? ''} onChange={e => onChange({ itemId: e.target.value })}
                className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] outline-none text-gray-200 flex-1">
                {items.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : <span className="text-[8px] text-gray-500">アイテム未定義</span>}
            <input type="number" min={1} value={(cmd as any).count ?? 1} onChange={e => onChange({ count: Math.max(1, Number(e.target.value)) })}
              className="w-10 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none text-center" />
          </div>
        )}
        {type === 'warp' && (
          <div className="flex items-center gap-1">
            <input type="number" value={(cmd as any).col ?? 0} onChange={e => onChange({ col: Number(e.target.value) })}
              className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none" placeholder="X" />
            <input type="number" value={(cmd as any).row ?? 0} onChange={e => onChange({ row: Number(e.target.value) })}
              className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none" placeholder="Y" />
          </div>
        )}
        {type === 'wait' && (
          <input type="number" min={1} max={600} value={(cmd as any).frames ?? 30}
            onChange={e => onChange({ frames: Number(e.target.value) })}
            className="w-16 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none" />
        )}
        {(type === 'comment' || type === 'label' || type === 'jump') && (
          <input value={(cmd as any).text ?? (cmd as any).name ?? ''}
            onChange={e => onChange(type === 'comment' ? { text: e.target.value } : { name: e.target.value, ...(type === 'jump' ? { label: e.target.value } : {}) })}
            className={inputCls} placeholder={type === 'comment' ? 'コメント' : type === 'label' ? 'ラベル名' : 'ジャンプ先ラベル'} />
        )}
      </div>
    </div>
  );
}

interface MmlLoopSettingsProps {
  bgm?: { ref: string };
  onChange: (newRef: string) => void;
}

const MmlLoopSettings: React.FC<MmlLoopSettingsProps> = ({ bgm, onChange }) => {
  if (!bgm || !bgm.ref.startsWith('mml:')) return null;

  const hasLoop = bgm.ref.includes('#loop=');
  const loop = parseLoopFromRef(bgm.ref) || { type: 'bar', val: 2, endType: 'none', endVal: 4 };

  const endType = loop.endType || 'none';
  const endVal = loop.endVal !== undefined ? loop.endVal : 4;

  return (
    <div className="mt-2 p-2 rounded bg-gray-900 border border-gray-800 space-y-2">
      <label className="flex items-center gap-1.5 text-[10px] text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          checked={hasLoop}
          onChange={(e) => {
            const enabled = e.target.checked;
            const newRef = updateRefLoop(bgm.ref, enabled, loop);
            onChange(newRef);
          }}
          className="accent-emerald-500"
        />
        <span>ループ設定を有効にする</span>
      </label>
      {hasLoop && (
        <div className="space-y-2 pl-4 text-[10px] text-gray-400">
          <div className="flex items-center gap-2">
            <span className="w-10">開始:</span>
            <select
              value={loop.type}
              onChange={(e) => {
                const nextType = e.target.value as 'bar' | 'step' | 'seconds';
                const newRef = updateRefLoop(bgm.ref, true, { ...loop, type: nextType });
                onChange(newRef);
              }}
              className="bg-gray-950 border border-gray-800 text-gray-300 text-[10px] rounded px-1 py-0.5"
            >
              <option value="bar">小節 (BAR)</option>
              <option value="step">ステップ (STEP)</option>
              <option value="seconds">秒 (SECONDS)</option>
            </select>
            <input
              type="number"
              value={loop.val}
              onChange={(e) => {
                const nextVal = parseFloat(e.target.value) || 0;
                const newRef = updateRefLoop(bgm.ref, true, { ...loop, val: nextVal });
                onChange(newRef);
              }}
              className="w-14 bg-gray-950 border border-gray-800 text-center text-[10px] text-gray-300 rounded py-0.5"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-10">終了:</span>
            <select
              value={endType}
              onChange={(e) => {
                const nextEndType = e.target.value as 'none' | 'bar' | 'step' | 'seconds';
                const newRef = updateRefLoop(bgm.ref, true, { ...loop, endType: nextEndType, endVal });
                onChange(newRef);
              }}
              className="bg-gray-950 border border-gray-800 text-gray-300 text-[10px] rounded px-1 py-0.5"
            >
              <option value="none">曲の終端 (NONE)</option>
              <option value="bar">小節 (BAR)</option>
              <option value="step">ステップ (STEP)</option>
              <option value="seconds">秒 (SECONDS)</option>
            </select>
            {endType !== 'none' && (
              <input
                type="number"
                value={endVal}
                onChange={(e) => {
                  const nextEndVal = parseFloat(e.target.value) || 0;
                  const newRef = updateRefLoop(bgm.ref, true, { ...loop, endVal: nextEndVal });
                  onChange(newRef);
                }}
                className="w-14 bg-gray-950 border border-gray-800 text-center text-[10px] text-gray-300 rounded py-0.5"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface BgmVolumeSettingsProps {
  bgm?: { ref: string };
  onChange: (newRef: string) => void;
}

const BgmVolumeSettings: React.FC<BgmVolumeSettingsProps> = ({ bgm, onChange }) => {
  if (!bgm) return null;
  const volume = getBgmVolume(bgm.ref);

  return (
    <div className="mt-2 p-2 rounded bg-gray-900 border border-gray-800 flex items-center gap-2">
      <span className="text-[10px] text-gray-400 shrink-0 w-8">音量:</span>
      <input
        type="range"
        min="0"
        max="100"
        value={volume}
        onChange={(e) => {
          const nextVol = parseInt(e.target.value, 10);
          const params = parseBgmParams(bgm.ref);
          params.volume = nextVol;
          const newRef = updateRefBgmParams(bgm.ref, params);
          onChange(newRef);
        }}
        className="grow accent-emerald-500 h-1 cursor-pointer"
      />
      <span className="text-[9px] text-gray-400 w-8 text-right font-mono">{volume}%</span>
    </div>
  );
};

