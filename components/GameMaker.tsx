'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, RotateCcw, Smartphone, Image as ImageIcon, Music, Trash2, Save, Plus, Volume2, Shield, ShieldOff, Download, Upload, Settings } from 'lucide-react';
import { bgmManager } from '@/lib/BgmManager';
import { bgmRefToAsset, refLabel, parseWalkRef } from '@/lib/asset-ref';
import {
  detectStandard, standardById, animatedCell, dirFromDelta,
  type WayKey, type WalkStandard,
} from '@/lib/walk-sprite';
import { mmlToNotes, playMml } from '@/lib/mml';
import ContentPicker, { type PickResult } from './ContentPicker';

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
  type BattleMove, type SwitchDef, type ItemDef,
  type EventCommand, type EventPage, type EventCondition,
  type TitleScreenConfig, type EndingScreenConfig, type ScreenMenuKind,
  defaultTitleScreen, defaultEndingScreen, SCREEN_MENU_LABELS,
} from './game-presets/shared';
import { PRESETS, PRESET_ORDER, PRESET_EMOJI, PRESET_TAGLINE } from './game-presets';
import SpellEditor, { defaultBlock } from './SpellEditor';
import DialogueCutscene, { type DialogueCutsceneHandle } from './DialogueCutscene';
import SpellCutscene from './SpellCutscene';
import { parseMiniScript, runMiniScript, type MiniEnv } from './MiniScriptVM';

export type { PresetId };

type EditorTab = 'map' | 'object' | 'char' | 'asset' | 'spell' | 'sound' | 'screen';

/** 保存用マニフェスト（テキスト/参照のみ）。docs/game-feature-design.md §4 */
export interface GameManifestDraft {
  preset: PresetId; engine: EngineKind; name: string; gravity: number; friction: number;
  player: { emoji: string; color: string; speed: number; jumpPower: number; w: number; h: number; start: { x: number; y: number }; spriteRef?: string;
    bombCount?: number; bombSpellName?: string; bombCutinCharName?: string; bombCutinImageUrl?: string; bombCutinImageX?: number; bombCutinImageY?: number; bombCutinScale?: number; };
  tiles: Record<number, { name: string; color: string; passable: boolean; special?: string; imageRef?: string }>;
  map: number[][];
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
  onjReze?: { territory: boolean; paint: boolean };
  titleScreen?: Omit<TitleScreenConfig, 'bgUrl'>;
  ending?: Omit<EndingScreenConfig, 'bgUrl'>;
}

const YT_BGM = 'https://www.youtube.com/watch?v=0_jEpB40aYw';

const BEHAVIOR_LABELS: Record<NpcBehavior, string> = { still: '静止', random: 'ランダム', chase: '追尾', flee: '逃走', patrolH: '左右往復', patrolV: '上下往復', walker: '歩行（崖で反転）' };
const BULLET_LABELS: Record<BulletType, string> = { none: 'なし', aimed: '狙い弾', spread: '拡散', spiral: '回転' };
const OBJECT_KIND_LABELS: Record<ObjectKind, string> = { npc: 'NPC / 敵', tile: 'タイル', bullet: '弾 / 攻撃' };
const OBJTYPE_LABELS: Record<ObjType, string> = { enemy: '敵', npc: 'NPC', item: 'アイテム', warp: 'ワープ', event: 'イベント' };
const SFX_LABELS: Record<SfxTrigger, string> = { jump: 'ジャンプ', shot: 'ショット', clear: 'クリア', damage: 'ミス/被弾', graze: 'グレイズ', spellcard: 'スペルカード' };

const clone = (d: PresetData): PresetData => JSON.parse(JSON.stringify(d));

/** 現在のワールド幅／高さ（タイル数）。scroll 優先、無ければマップ実寸。 */
const curWorldCols = (d: PresetData): number => d.scroll?.worldCols ?? d.map[0]?.length ?? COLS;
const curWorldRows = (d: PresetData): number => d.scroll?.worldRows ?? d.map.length ?? ROWS;

/** ワールドサイズ（幅・高さ＝タイル数）を変更する。マップを拡縮し、scroll を更新。
 *  画面サイズ（COLS×ROWS）と同じなら scroll を外して 1 画面固定に戻す。 */
const applyWorldSize = (d: PresetData, cols: number, rows: number): PresetData => {
  const w = Math.max(COLS, Math.round(cols));
  const h = Math.max(ROWS, Math.round(rows));
  let map = d.map.map(row => {
    const next = row.slice(0, w);
    while (next.length < w) next.push(0);
    return next;
  });
  map = map.slice(0, h);
  while (map.length < h) map.push(new Array(w).fill(0));
  return { ...d, map, scroll: (w > COLS || h > ROWS) ? { worldCols: w, worldRows: h } : undefined };
};

function playSfx(s?: SfxRef) {
  if (!s || !s.src) return;
  if (s.type === 'direct') {
    const a = new Audio(s.src); a.volume = 0.7; a.play().catch(() => {});
    return;
  }
  if (s.type !== 'mml') return; // youtube は即時再生に不向きなので無視
  const { tracks, tempo } = mmlToNotes(s.src);
  if (tracks.some(t => t.notes.length > 0)) playMml(tracks, tempo);
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
}
interface Bullet { x: number; y: number; w: number; h: number; vy: number; vx?: number; }
interface EnemyBullet { x: number; y: number; vx: number; vy: number; r: number; color: string; grazed?: boolean; }

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
    });
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
    W: PLAY_W,
    H: PLAY_H,
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
    spawn: (ref: unknown, x: unknown = PLAY_W / 2, y: unknown = -TILE_SIZE) => {
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
    W: PLAY_W, H: PLAY_H,
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

interface GameMakerProps {
  onClose: () => void;
  userId: string;
  onSave?: (manifest: GameManifestDraft, meta: { title: string; preset: PresetId }) => void;
  initialManifest?: GameManifestDraft;
  playOnly?: boolean;
  /** 親コンテナに収める（absolute overlay ではなく h-full flex-col） */
  embedded?: boolean;
  ghostPlayers?: { sessionId: string; x: number; y: number; emoji: string }[];
  onPositionChange?: (x: number, y: number, emoji: string) => void;
  /** ゲームポストのID（コメント返信先） */
  postId?: number;
  /** ニコニコ風弾幕コメント（新しい文字列が追加されるたびに流れる） */
  danmakuComments?: string[];
  /** コメント送信コールバック */
  onComment?: (text: string, displayName: string) => void;
}

type PickTarget =
  | { t: 'player' } | { t: 'bgm' } | { t: 'battleBgm' } | { t: 'bossBgm' } | { t: 'tile'; id: number }
  | { t: 'sfx'; trigger: SfxTrigger } | { t: 'objsprite' } | { t: 'selObjSprite' } | { t: 'mapBg' }
  | { t: 'titleBg' } | { t: 'endingBg' } | { t: 'titleBgm' } | { t: 'endingBgm' };

export default function GameMaker({ onClose, userId, onSave, initialManifest, playOnly, embedded, ghostPlayers, onPositionChange, postId, danmakuComments, onComment }: GameMakerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [presetId, setPresetId] = useState<PresetId>('onjReze');
  const [gameData, setGameData] = useState<PresetData>(() => clone(PRESETS.onjReze));
  const [title, setTitle] = useState(PRESETS.onjReze.name);
  const [isPlaying, setIsPlaying] = useState(false);
  /** 新規作成時の入口ヒーロー（デモ再生＋あそぶ/改造の選択）。playOnly/編集再開/埋め込み時は出さない。 */
  const [introOpen, setIntroOpen] = useState(!playOnly && !initialManifest && !embedded);
  const [editorTab, setEditorTab] = useState<EditorTab>('map');
  /** 詳細タブ（アセット・サウンド・画面・会話）の表示フラグ。初回は非表示で圧迫感を減らす。 */
  const [showAdvancedTabs, setShowAdvancedTabs] = useState(false);
  /** マップタブの編集ツール（tile のみ。初期位置は🏁ドラッグで変更）。 */
  const [mapTool] = useState<'tile'>('tile');
  const isDraggingStartRef = useRef(false);
  // ── タイトル／エンディング画面ランタイム ──
  const [showTitle, setShowTitle] = useState(false);
  const [showEnding, setShowEnding] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const playerNameRef = useRef('');
  playerNameRef.current = playerName;
  const endingRef = useRef<EndingScreenConfig | undefined>(undefined);
  endingRef.current = gameData.ending;
  const [selectedTileId, setSelectedTileId] = useState(1);
  const [objTemplate, setObjTemplate] = useState<ObjectDef>(() => newObject());
  const [editSpeedMult, setEditSpeedMult] = useState(1);
  const [charSubTab, setCharSubTab] = useState<'jiki' | 'boss' | 'midboss' | 'zenhan' | 'kohan'>('jiki');
  const [selectedObjId, setSelectedObjId] = useState<string | null>(null);
  const selectedObjIdRef = useRef<string | null>(null);
  selectedObjIdRef.current = selectedObjId;
  // ── イベントランタイム ──
  const [switchVals, setSwitchVals] = useState<Record<number, boolean>>({});
  const switchValsRef = useRef<Record<number, boolean>>({});
  switchValsRef.current = switchVals;
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const inventoryRef = useRef<Record<string, number>>({});
  inventoryRef.current = inventory;
  const selfSwitchesRef = useRef<Record<string, Record<string, boolean>>>({});
  const eventRunningRef = useRef(false);
  const eventChoiceRef = useRef<{ text: string; choices: { label: string; commands: EventCommand[] }[]; onPick: (idx: number) => void } | null>(null);
  const [eventChoice, setEventChoice] = useState<{ text: string; choices: { label: string; commands: EventCommand[] }[]; onPick: (idx: number) => void } | null>(null);

  const [picker, setPicker] = useState<{ mode: 'image' | 'bgm'; target: PickTarget } | null>(null);
  const [gameMsg, setGameMsg] = useState<{ text: string; mode: 'instant' | 'timed'; onDismiss: () => void } | null>(null);
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
  interface BattleView { enemyName: string; enemyEmoji: string; enemyHp: number; enemyMaxHp: number; log: string[]; canAct: boolean; over: boolean; }
  const [battle, setBattle] = useState<BattleView | null>(null);
  const battleRef = useRef<{ active: boolean; entity: Entity | null; enemyName: string; enemyHp: number; enemyMaxHp: number; enemyAtk: number; enemyDef: number; enemyMoves: { name: string; power: number; heal?: boolean }[]; exp: number; isBoss: boolean }>(
    { active: false, entity: null, enemyName: '', enemyHp: 0, enemyMaxHp: 0, enemyAtk: 0, enemyDef: 0, enemyMoves: [], exp: 0, isBoss: false });
  const progressRef = useRef({ hp: 0, mp: 0, maxHp: 0, maxMp: 0, atk: 0, def: 0, level: 1, exp: 0, expNext: 10 });
  const invulnRef = useRef(0);
  /** 画面シェイク残フレーム数（0=なし）。ヒット・爆発・ゲームオーバー時にセット。 */
  const shakeRef = useRef(0);
  const roundOverRef = useRef(false);    // ミス/ゲームオーバー/クリア演出中（操作・進行を凍結）
  const isPlayerDeadRef = useRef(false); // 残機制：死亡→復帰待ち中
  const livesRef = useRef(3);            // 残機数
  const scoreRef = useRef(0);            // スコア
  const actionDirRef = useRef<1 | -1>(1);     // action エンジン：プレイヤー向き
  const actionShootCoolRef = useRef(0);        // action エンジン：射撃クールダウン
  // ── onjReze エンジン（トップビュー・アクションRPG）──
  const onjRezeDirRef = useRef<{ x: number; y: number }>({ x: 0, y: 1 });  // プレイヤーの向き（4方向）
  const swordRef = useRef<{ active: number; cool: number; dir: { x: number; y: number }; hit: Set<string> }>(
    { active: 0, cool: 0, dir: { x: 0, y: 1 }, hit: new Set() });        // 剣の振り状態
  const onjRezeHpRef = useRef<{ hp: number; max: number }>({ hp: 6, max: 6 }); // ハート（1ハート=2HP）
  // onjReze: 原作のボム挙動の再現（💣設置・🎯投げ・💀首爆弾・爆発）。すべてフレーム単位（60fps想定）。
  const onjBombsRef = useRef<{ x: number; y: number; fuse: number; maxFuse: number; r: number; dmg: number; head: boolean }[]>([]);   // 着地済み・導火線カウント中のボム（中心座標）
  const onjFliesRef = useRef<{ fx: number; fy: number; tx: number; ty: number; t: number; dur: number; fuse: number; r: number; dmg: number; head: boolean }[]>([]); // 放物線で飛行中のボム/首
  const onjBlastsRef = useRef<{ x: number; y: number; life: number; maxLife: number; r: number }[]>([]);  // 爆発エフェクト
  const onjBombCoolRef = useRef(0);   // 💣設置のクールダウン（長押し連打）
  const onjThrowCoolRef = useRef(0);  // 🎯投げ／💀首爆弾のクールダウン
  // onjReze: 陣取り(paper.io)／スプラ(塗り)のセル・グリッド。サイズ = worldCols * worldRows。
  const paintGridRef = useRef<Uint8Array | null>(null);   // 1 = スプラで塗ったセル
  const ownedGridRef = useRef<Uint8Array | null>(null);   // 1 = 占領済みの自陣セル
  const trailGridRef = useRef<Uint8Array | null>(null);   // 1 = 現在のトレイル上のセル
  const trailListRef = useRef<number[]>([]);              // トレイルのセル index（順序）
  const territoryGridWRef = useRef(0);                     // グリッドの列数（index 復元用）
  const paintCountRef = useRef(0);                         // 塗り済みセル数
  const ownedCountRef = useRef(0);                         // 占領済みセル数
  const groundCellsRef = useRef(1);                        // 占有率の母数（通行可セル数）

  const bossDefeatedRef = useRef(false);
  const bossWarnRef = useRef(false);    // ゴールでのボス未撃破警告を一度だけ出す
  const bossOutroRef = useRef<DialogueLine[] | null>(null); // ボス撃破後のセリフ
  /** 現在のフェーズインデックス（phases 定義時）。-1=未開始 */
  const phaseIndexRef = useRef(-1);
  /** 実行中の wave 出現スクリプトの停止ハンドル */
  const waveCtxRef = useRef<{ cancelled: boolean } | null>(null);
  /** wave 出現スクリプトが実行中か（フェーズ進行判定で参照） */
  const waveRunningRef = useRef(false);

  // ── 弾幕空間グリッド ──
  const bulletGridRef = useRef(new BulletGrid(PLAY_W));

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
    setBattle(v => (v ? { ...v, enemyHp: battleRef.current.enemyHp, log: [...v.log, line].slice(-6), ...patch } : v));

  /** BGM を即時切り替えるヘルパー。src がなければ停止。 */
  const switchBgm = (bgm?: { src?: string; type?: 'youtube' | 'mml' | 'direct' }) => {
    if (bgm?.src && bgm.type !== 'direct') {
      bgmManager.play({ bgm: { type: bgm.type ?? 'youtube', src: bgm.src }, tileset: {} } as never);
    } else {
      bgmManager.stop();
    }
  };

  const beginBattle = (opts: { name: string; emoji: string; hp: number; atk: number; def: number; exp: number; moves?: { name: string; power: number; heal?: boolean }[]; entity?: Entity | null; isBoss?: boolean; outroDialogue?: DialogueLine[] }) => {
    battleRef.current = {
      active: true, entity: opts.entity ?? null, enemyName: opts.name, enemyHp: opts.hp, enemyMaxHp: opts.hp,
      enemyAtk: opts.atk, enemyDef: opts.def, enemyMoves: opts.moves ?? [], exp: opts.exp, isBoss: !!opts.isBoss,
    };
    bossOutroRef.current = opts.outroDialogue?.length ? opts.outroDialogue : null;
    setBattle({ enemyName: opts.name, enemyEmoji: opts.emoji, enemyHp: opts.hp, enemyMaxHp: opts.hp, log: [`${opts.name}が あらわれた！`], canAct: true, over: false });
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
    beginBattle({ name: d.name ?? 'てき', emoji: d.emoji, hp: d.hp, atk: d.atk ?? Math.round(d.hp), def: d.def ?? Math.round(d.hp * 0.4), exp: d.exp ?? Math.round(d.hp * 1.5), moves: d.moves, entity: e, isBoss: d.isBoss, outroDialogue: d.outroDialogue });
  };

  const nudgePlayer = () => {
    const eng = engineRef.current; const b = battleRef.current; const p = eng.player; const pData = gameData.player;
    if (!b.entity) return;
    const dx = p.x - b.entity.x, dy = p.y - b.entity.y; const dist = Math.hypot(dx, dy) || 1;
    const worldW = (gameData.scroll?.worldCols ?? COLS) * TILE_SIZE;
    p.x = Math.max(0, Math.min(worldW - pData.w, p.x + (dx / dist) * TILE_SIZE * 1.3));
    p.y = Math.max(0, Math.min(PLAY_H - pData.h, p.y + (dy / dist) * TILE_SIZE * 1.3));
  };

  const endBattle = (result: 'win' | 'lose' | 'flee') => {
    const b = battleRef.current; const pr = progressRef.current; const eng = engineRef.current;
    if (result === 'lose') {
      battleRef.current.active = false; setBattle(null);
      battleBgmActiveRef.current = 'none';
      shakeRef.current = 18; playSfx(sfxRef.current.damage); showGameMsg('ゲームオーバー…', 'timed', () => setIsPlaying(false));
      return;
    }
    const wasBoss = b.isBoss;
    if (result === 'win') {
      if (b.entity) { const idx = eng.entities.indexOf(b.entity); if (idx >= 0) eng.entities.splice(idx, 1); }
      pr.exp += b.exp;
      let lvUp = '';
      while (pr.exp >= pr.expNext) { pr.exp -= pr.expNext; pr.level++; pr.maxHp += 6; pr.maxMp += 3; pr.atk += 2; pr.def += 1; pr.hp = pr.maxHp; pr.mp = pr.maxMp; pr.expNext = pr.level * 10; lvUp = `レベルが ${pr.level} に あがった！`; }
      setBattle(v => (v ? { ...v, over: true, canAct: false, log: [...v.log, `${b.enemyName}を たおした！${b.exp > 0 ? ` EXP+${b.exp}` : ''}`, ...(lvUp ? [lvUp] : [])].slice(-6) } : v));
      if (wasBoss) bossDefeatedRef.current = true;
    }
    nudgePlayer();
    invulnRef.current = 60; forceHud(n => n + 1);
    setTimeout(() => {
      battleRef.current.active = false; battleRef.current.entity = null; setBattle(null); forceHud(n => n + 1);
      // バトルBGM終了 → フィールドBGMに戻す
      if (battleBgmActiveRef.current !== 'none') {
        battleBgmActiveRef.current = 'none';
        switchBgm(gameDataRef.current.bgm);
      }
      if (result === 'win' && wasBoss) {
        const outro = bossOutroRef.current;
        if (outro?.length) {
          outroModeRef.current = true;
          pendingPhaseRef.current = -1;
          setActiveDialogue(outro);
        } else {
          playSfx(sfxRef.current.clear); showGameMsg('🎉 クリア！', 'timed', () => { setIsPlaying(false); if (endingRef.current?.enabled) setShowEnding(true); });
        }
      }
    }, result === 'win' ? 1100 : 500);
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

  const doAttack = () => {
    if (!battle?.canAct || battle.over) return;
    const b = battleRef.current; const pr = progressRef.current;
    const dmg = calcDmg(pr.atk, b.enemyDef);
    b.enemyHp = Math.max(0, b.enemyHp - dmg);
    appendLog(`${playerNameRef.current || gameData.battle?.playerName || '勇者'}の こうげき！ ${dmg}のダメージ`, { canAct: false });
    if (b.enemyHp <= 0) { setTimeout(() => endBattle('win'), 600); return; }
    setTimeout(enemyTurn, 750);
  };

  const doMove = (m: BattleMove) => {
    if (!battle?.canAct || battle.over) return;
    const b = battleRef.current; const pr = progressRef.current;
    if (pr.mp < m.cost) { appendLog('MPが たりない！'); return; }
    pr.mp -= m.cost; forceHud(n => n + 1);
    if (m.heal) {
      const before = pr.hp; pr.hp = Math.min(pr.maxHp, pr.hp + m.power);
      appendLog(`${m.name}！ HPが ${pr.hp - before} かいふくした`, { canAct: false });
    } else {
      const dmg = Math.max(1, Math.round(m.power * (0.85 + Math.random() * 0.3)));
      b.enemyHp = Math.max(0, b.enemyHp - dmg);
      appendLog(`${m.name}！ ${dmg}のダメージ`, { canAct: false });
      if (b.enemyHp <= 0) { setTimeout(() => endBattle('win'), 600); return; }
    }
    setTimeout(enemyTurn, 750);
  };

  const doFlee = () => {
    if (!battle?.canAct || battle.over) return;
    if (Math.random() < 0.6) { appendLog('うまく にげきれた！', { canAct: false, over: true }); setTimeout(() => endBattle('flee'), 700); }
    else { appendLog('しかし まわりこまれてしまった！', { canAct: false }); setTimeout(enemyTurn, 750); }
  };

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
      bgmManager.play({ bgm: { type: bossBgm.type ?? 'youtube', src: bossBgm.src }, tileset: {} } as never);
    } else if (!isBossPhase && bossBgmActiveRef.current) {
      bossBgmActiveRef.current = false;
      const normal = gameData.bgm;
      if (normal?.src) bgmManager.play({ bgm: { type: normal.type ?? 'youtube', src: normal.src }, tileset: {} } as never);
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

  const runEventCommands = useCallback((objId: string, commands: EventCommand[], onDone?: () => void) => {
    if (eventRunningRef.current && !onDone) return;
    let index = 0;
    let cmds = commands;
    const ss = selfSwitchesRef.current;
    const advance = () => { index++; runNext(); };
    const runNext = () => {
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
        default:
          setTimeout(advance, 0);
      }
    };
    eventRunningRef.current = true;
    runNext();
  }, [showGameMsg]);

  const runObjectEvent = useCallback((obj: ObjectDef) => {
    if (eventRunningRef.current) return;
    const page = findActivePage(obj);
    if (page && page.commands.length > 0) {
      runEventCommands(obj.id, page.commands);
      return true;
    }
    return false;
  }, [findActivePage, runEventCommands]);

  const previewMmlAsset = useCallback((_key: string, asset?: { src?: string; type?: 'youtube' | 'mml' | 'direct' }) => {
    previewStopRef.current?.();
    previewStopRef.current = null;
    if (!asset?.src) return;
    if (asset.type === 'direct') {
      const a = new Audio(asset.src); a.volume = 0.7; a.play().catch(() => {});
      previewStopRef.current = () => { a.pause(); a.currentTime = 0; };
      return;
    }
    if (asset.type !== 'mml') return;
    const { tracks, tempo } = mmlToNotes(asset.src);
    if (!tracks.some(t => t.notes.length > 0)) return;
    previewStopRef.current = playMml(tracks, tempo, undefined, () => {
      previewStopRef.current = null;
    });
  }, []);

  useEffect(() => () => { previewStopRef.current?.(); previewStopRef.current = null; }, []);

  const ensureImage = useCallback((url?: string) => {
    if (!url || imgCache.current.has(url)) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    imgCache.current.set(url, img);
  }, []);

  useEffect(() => {
    ensureImage(gameData.player.spriteUrl);
    Object.values(gameData.tiles).forEach(t => ensureImage(t.imageUrl));
    gameData.objects.forEach(o => ensureImage(o.spriteUrl));
    ensureImage(objTemplate.spriteUrl);
    ensureImage(gameData.mapBgUrl);
    ensureImage(gameData.titleScreen?.bgUrl);
    ensureImage(gameData.ending?.bgUrl);
  }, [gameData, objTemplate, ensureImage]);

  const resetGame = useCallback((id: PresetId) => {
    const data = clone(PRESETS[id]);
    setPresetId(id);
    setGameData(data);
    setTitle(PRESETS[id].name);
    setEditorTab('map');
    const eng = engineRef.current;
    eng.player = { ...data.player.start, vx: 0, vy: 0, isGrounded: false };
    eng.keys.clear();
    eng.bullets = []; eng.enemyBullets = []; eng.entities = [];
    actionDirRef.current = 1; actionShootCoolRef.current = 0;
    eng.map = JSON.parse(JSON.stringify(data.map));
    const sw = data.scroll?.worldCols ?? COLS; const sh = data.scroll?.worldRows ?? ROWS;
    setEditScroll(Math.max(0, Math.min(sw * TILE_SIZE - PLAY_W, data.player.start.x + data.player.w / 2 - PLAY_W / 2)));
    setEditScrollY(Math.max(0, Math.min(sh * TILE_SIZE - PLAY_H, data.player.start.y + data.player.h / 2 - PLAY_H / 2)));
    setIsPlaying(false); setSelectedObjId(null);
    setShowTitle(false); setShowEnding(false);
  }, []);

  const restart = useCallback(() => {
    const eng = engineRef.current;
    eng.player = { ...gameData.player.start, vx: 0, vy: 0, isGrounded: false };
    eng.keys.clear();
    eng.bullets = []; eng.enemyBullets = []; eng.entities = [];
    actionDirRef.current = 1; actionShootCoolRef.current = 0;
    setIsPlaying(false); setSelectedObjId(null);
    setShowEnding(false);
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
        player: { ...base.player, ...initialManifest.player, spriteUrl: undefined },
        tiles: Object.fromEntries(
          Object.entries(initialManifest.tiles).map(([k, t]) => [k, { ...t, imageUrl: undefined }])
        ),
        map: initialManifest.map,
        objects: initialManifest.objects.map(o => ({ ...o, spriteUrl: undefined })),
        scroll: initialManifest.scroll ?? base.scroll,
        phases: initialManifest.phases ?? base.phases,
        onjReze: initialManifest.onjReze ?? base.onjReze,
        titleScreen: initialManifest.titleScreen ?? base.titleScreen,
        ending: initialManifest.ending ?? base.ending,
        battle: base.battle,
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

  /** ヒーローから「あそぶ」。タイトル画面があればそれを、なければ即プレイ。 */
  const enterPlayFromIntro = useCallback(() => {
    setIntroOpen(false);
    setActivePreviewKey(null);
    if (gameData.titleScreen?.enabled) { restart(); setShowTitle(true); return; }
    restart();
    setIsPlaying(true);
  }, [gameData.titleScreen, restart]);

  /** ヒーローから「改造する」。デモを止めてエディタへ。 */
  const enterEditFromIntro = useCallback(() => {
    setIntroOpen(false);
    restart();              // デモ停止＋初期位置に戻す
  }, [restart]);

  // BGM
  useEffect(() => {
    if (isPlaying && gameData.bgm?.src) {
      const type = gameData.bgm.type;
      const src = gameData.bgm.src;
      if (type && src) bgmManager.play({ bgm: { type, src }, tileset: {} } as never);
      else {
        const asset = bgmRefToAsset(gameData.bgm.ref);
        if (asset) bgmManager.play({ bgm: asset, tileset: {} } as never); else bgmManager.stop();
      }
    } else {
      bgmManager.stop();
    }
    return () => bgmManager.stop();
  }, [isPlaying, gameData.bgm]);

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
        y: isTouhouWave(o) ? -TILE_SIZE * 2 : o.row * TILE_SIZE,
        homeX: o.col * TILE_SIZE, homeY: o.row * TILE_SIZE,
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
      if (b) progressRef.current = { hp: b.maxHp, mp: b.maxMp, maxHp: b.maxHp, maxMp: b.maxMp, atk: b.atk, def: b.def, level: 1, exp: 0, expNext: 10 };
      battleRef.current = { active: false, entity: null, enemyName: '', enemyHp: 0, enemyMaxHp: 0, enemyAtk: 0, enemyDef: 0, enemyMoves: [], exp: 0, isBoss: false };
      invulnRef.current = 0; isPlayerDeadRef.current = false; roundOverRef.current = false; livesRef.current = 3; scoreRef.current = 0;
      // onjReze：ハート・向き・剣の初期化
      const zMax = Math.max(1, gameData.player.hearts ?? 3) * 2;
      onjRezeHpRef.current = { hp: zMax, max: zMax };
      onjRezeDirRef.current = { x: 0, y: 1 };
      swordRef.current = { active: 0, cool: 0, dir: { x: 0, y: 1 }, hit: new Set() };
      onjBombsRef.current = []; onjFliesRef.current = []; onjBlastsRef.current = [];
      onjBombCoolRef.current = 0; onjThrowCoolRef.current = 0;
      // onjReze：陣取り／スプラのグリッド確保＋自陣（ホーム）の初期化
      {
        const gw = gameData.scroll?.worldCols ?? COLS;
        const gh = gameData.scroll?.worldRows ?? ROWS;
        const n = gw * gh;
        territoryGridWRef.current = gw;
        paintGridRef.current = new Uint8Array(n);
        ownedGridRef.current = new Uint8Array(n);
        trailGridRef.current = new Uint8Array(n);
        trailListRef.current = [];
        paintCountRef.current = 0; ownedCountRef.current = 0;
        // 占有率の母数＝通行可セル数
        let ground = 0;
        for (let yy = 0; yy < gh; yy++) for (let xx = 0; xx < gw; xx++) {
          if (gameData.tiles[gameData.map[yy]?.[xx] ?? 0]?.passable) ground++;
        }
        groundCellsRef.current = Math.max(1, ground);
        // スポーン周辺 5×5 を初期自陣に（陣取りの起点）
        const sc = Math.floor((gameData.player.start.x + gameData.player.w / 2) / TILE_SIZE);
        const sr = Math.floor((gameData.player.start.y + gameData.player.h / 2) / TILE_SIZE);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const cx = sc + dx, cy = sr + dy;
          if (cx < 0 || cx >= gw || cy < 0 || cy >= gh) continue;
          if (!gameData.tiles[gameData.map[cy]?.[cx] ?? 0]?.passable) continue;
          const idx = cy * gw + cx;
          if (!ownedGridRef.current[idx]) { ownedGridRef.current[idx] = 1; ownedCountRef.current++; }
        }
      }
      bossDefeatedRef.current = false; bossWarnRef.current = false; outroModeRef.current = false;
      bombCountRef.current = gameData.player.bombCount ?? 3;
      bombInvulnRef.current = 0; bombCooldownRef.current = 0;
      bombPickupsRef.current = []; spellCardTriggeredRef.current = new Set();
      activeSpellCardNameRef.current = null; setSpellCutin(null);
      grazeRef.current = 0; grazeFlashRef.current = 0;
      bossBgmActiveRef.current = false;
      setActiveDialogue(null);
      setBattle(null);
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

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    // ワールド寸法（スクロール）。world が画面を超えるとカメラが追従する。
    const worldCols = gameData.scroll?.worldCols ?? COLS;
    const worldRows = gameData.scroll?.worldRows ?? ROWS;
    const worldW = worldCols * TILE_SIZE;
    const worldH = worldRows * TILE_SIZE;
    const camMax = Math.max(0, worldW - PLAY_W);
    const camMaxY = Math.max(0, worldH - PLAY_H);

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

    // 歩行グラ用の状態: 規格の自動判定キャッシュ と 各インスタンスの向き/移動追跡。
    const walkStdCache = new Map<string, WalkStandard>();
    const walkInst = new Map<string, { px: number; py: number; dir: WayKey }>();
    const horizontalEngine = gameData.engine === 'action'; // 横スク（マリオ系）は左右のみ

    const drawSprite = (
      def: { emoji: string; spriteUrl?: string; spriteRef?: string },
      x: number, y: number, w: number, h: number,
      animKey?: string,
    ) => {
      const img = def.spriteUrl ? imgCache.current.get(def.spriteUrl) : undefined;
      const loaded = !!img && img.complete && img.naturalWidth > 0;
      const walk = def.spriteRef ? parseWalkRef(def.spriteRef) : null;

      if (loaded && walk && def.spriteUrl) {
        // 規格を判定（auto は実寸から推定）してキャッシュ
        let std = walkStdCache.get(def.spriteUrl);
        if (!std) {
          std = walk.stdId === 'auto'
            ? detectStandard(img!.naturalWidth, img!.naturalHeight)
            : standardById(walk.stdId);
          walkStdCache.set(def.spriteUrl, std);
        }
        // 向き・移動を画面上の移動量から導出（エンジン非依存）
        const key = animKey ?? def.spriteUrl;
        const prev = walkInst.get(key);
        let dx = 0, dy = 0;
        if (prev) { dx = x - prev.px; dy = y - prev.py; }
        let dir: WayKey = prev?.dir ?? 's';
        const moving = Math.hypot(dx, dy) > 0.15;
        if (moving) {
          if (horizontalEngine) dir = dx >= 0 ? (Math.abs(dx) > 0.05 ? 'd' : dir) : 'a';
          else dir = dirFromDelta(dx, dy) ?? dir;
        }
        walkInst.set(key, { px: x, py: y, dir });

        const cell = animatedCell(std, img!.naturalWidth, img!.naturalHeight, {
          dir, moving, timeSec: performance.now() / 1000, fps: 7,
        });
        ctx.drawImage(img!, cell.sx, cell.sy, cell.sw, cell.sh, x, y, w, h);
        return;
      }

      if (loaded) {
        ctx.drawImage(img!, x, y, w, h);
      } else {
        ctx.font = `${w}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(def.emoji, x + w / 2, y + h + 4);
      }
    };

    const win = () => { playSfx(sfxRef.current.clear); showGameMsg('🎉 クリア！', 'timed', () => { setIsPlaying(false); if (endingRef.current?.enabled) setShowEnding(true); }); };
    const lose = (msg: string) => { shakeRef.current = 18; showGameMsg(msg, 'timed', () => setIsPlaying(false)); };
    const hitShake = () => { shakeRef.current = Math.max(shakeRef.current, 10); };

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
          engineRef.current.bullets = [];
          invulnRef.current = 180; // 3 秒間点滅無敵
          isPlayerDeadRef.current = false;
          forceHud(n => n + 1);
        }, 1500);
      }
    };

    const loop = () => {
      const eng = engineRef.current;
      const p = eng.player;
      const pData = gameData.player;
      const keys = eng.keys;
      const t = touchRef.current;

      const isLeft = keys.has('ArrowLeft') || keys.has('a') || t.left;
      const isRight = keys.has('ArrowRight') || keys.has('d') || t.right;
      const isUp = keys.has('ArrowUp') || keys.has('w') || t.up;
      const isDown = keys.has('ArrowDown') || keys.has('s') || t.down;
      const isAction = keys.has('z') || keys.has('Z') || keys.has('Enter') || keys.has(' ') || t.action || (gameData.engine === 'action' && isUp);

      let dead = false;
      if (invulnRef.current > 0) invulnRef.current--;
      if (bombInvulnRef.current > 0) bombInvulnRef.current--;
      if (bombCooldownRef.current > 0) bombCooldownRef.current--;

      // ── player movement (both modes, paused during battle) ──
      // ミス/ゲームオーバー/クリア演出中、または残機制の死亡→復帰待ち中は操作を受け付けない
      const frozen = isPlaying && (roundOverRef.current || isPlayerDeadRef.current);
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
          if (isLeft) p.vx -= 1;
          if (isRight) p.vx += 1;
          p.vx *= gameData.friction; p.vy += gameData.gravity;
          if (isAction && !prevActionRef.current && p.isGrounded) { p.vy = gameData.player.jumpPower; p.isGrounded = false; playSfx(sfxRef.current.jump); }

          p.x += p.vx;
          let hits = [getTile(p.x + 2, p.y + 2), getTile(p.x + pData.w - 2, p.y + 2),
          getTile(p.x + 2, p.y + pData.h - 2), getTile(p.x + pData.w - 2, p.y + pData.h - 2)]
            .filter(t2 => t2 && !t2.info.passable);
          const tile = hits[0];
          if (tile) { if (p.vx > 0) p.x = tile.rect.x - pData.w; else if (p.vx < 0) p.x = tile.rect.x + TILE_SIZE; p.vx = 0; }

          p.y += p.vy; p.isGrounded = false;
          hits = [getTile(p.x + 2, p.y + 2), getTile(p.x + pData.w - 2, p.y + 2),
          getTile(p.x + 2, p.y + pData.h), getTile(p.x + pData.w - 2, p.y + pData.h)]
            .filter(t2 => t2 && !t2.info.passable);
          const tile2 = hits[0];
          if (tile2) { if (p.vy > 0) { p.y = tile2.rect.y - pData.h; p.isGrounded = true; } else if (p.vy < 0) p.y = tile2.rect.y + TILE_SIZE; p.vy = 0; }
          if (p.y > worldH && isPlaying && !debugInvincibleRef.current) { lose('ミス！'); dead = true; }
          // プレイヤー向き更新
          if (isLeft) actionDirRef.current = -1;
          else if (isRight) actionDirRef.current = 1;
          // 射撃（X キーまたはタッチ SHOT ボタン）
          if (actionShootCoolRef.current > 0) actionShootCoolRef.current--;
          const isShoot = keys.has('x') || keys.has('X') || touchRef.current.shoot;
          if (isPlaying && !dead && isShoot && actionShootCoolRef.current <= 0) {
            const dir = actionDirRef.current;
            const bw = 8, bh = 6;
            eng.bullets.push({ x: dir > 0 ? p.x + pData.w : p.x - bw, y: p.y + pData.h / 2 - bh / 2, w: bw, h: bh, vx: dir * 10, vy: 0 });
            actionShootCoolRef.current = 12;
            playSfx(sfxRef.current.shot);
          }
          // プレイヤー弾移動・範囲外削除
          for (let i = eng.bullets.length - 1; i >= 0; i--) {
            const b = eng.bullets[i];
            b.x += b.vx ?? 0; b.y += b.vy ?? 0;
            if (b.x < -16 || b.x > worldW + 16 || b.y < -16 || b.y > worldH + 16) eng.bullets.splice(i, 1);
          }
        } else if (gameData.engine === 'onjReze') {
          // onjReze: トップビュー 4/8方向移動 ＋ 剣（近接）＋ 剣ビーム（HP満タン時）
          p.vx = 0; p.vy = 0;
          const moveSpd = pData.speed;
          let nx = p.x, ny = p.y;
          if (isLeft) nx -= moveSpd; if (isRight) nx += moveSpd;
          if (isUp) ny -= moveSpd; if (isDown) ny += moveSpd;
          let zt1 = getTile(nx, p.y), zt2 = getTile(nx + pData.w - 1, p.y + pData.h - 1);
          if (zt1?.info.passable && zt2?.info.passable && nx >= 0 && nx <= worldW - pData.w) p.x = nx;
          zt1 = getTile(p.x, ny); zt2 = getTile(p.x + pData.w - 1, ny + pData.h - 1);
          if (zt1?.info.passable && zt2?.info.passable && ny >= 0 && ny <= worldH - pData.h) p.y = ny;
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
              onjBombsRef.current.push({ x: fb.tx, y: fb.ty, fuse: fb.fuse, maxFuse: fb.fuse, r: fb.r, dmg: fb.dmg, head: fb.head });
              onjFliesRef.current.splice(i, 1);
            }
          }
          // 導火線 → 爆発（範囲内の敵に範囲ダメージ）
          for (let i = onjBombsRef.current.length - 1; i >= 0; i--) {
            const bm = onjBombsRef.current[i]; bm.fuse--;
            if (bm.fuse > 0) continue;
            onjBombsRef.current.splice(i, 1);
            onjBlastsRef.current.push({ x: bm.x, y: bm.y, life: B_BLAST, maxLife: B_BLAST, r: bm.r });
            hitShake(); playSfx(sfxRef.current.damage);
            for (let k = eng.entities.length - 1; k >= 0; k--) {
              const ent = eng.entities[k];
              const ex = ent.x + TILE_SIZE / 2, ey = ent.y + TILE_SIZE / 2;
              if (Math.hypot(ex - bm.x, ey - bm.y) <= bm.r) {
                ent.hp -= bm.dmg;
                if (ent.hp <= 0) {
                  if (ent.scriptCtx) ent.scriptCtx.cancelled = true;
                  scoreRef.current += ent.def.isBoss ? 100 : 10;
                  eng.entities.splice(k, 1);
                }
              }
            }
          }
          // 爆発エフェクトの寿命
          for (let i = onjBlastsRef.current.length - 1; i >= 0; i--) {
            if (--onjBlastsRef.current[i].life <= 0) onjBlastsRef.current.splice(i, 1);
          }

          // ── 陣取り(paper.io) ／ スプラ(塗り)。gameData.onjReze で各 ON/OFF ──
          const modes = gameData.onjReze;
          const owned = ownedGridRef.current, paint = paintGridRef.current, trailG = trailGridRef.current;
          const gw = worldCols, gh = worldRows;
          if (isPlaying && !dead && owned && paint && trailG && (modes?.territory || modes?.paint)) {
            const idxOf = (cx: number, cy: number) => cy * gw + cx;
            const inb = (cx: number, cy: number) => cx >= 0 && cx < gw && cy >= 0 && cy < gh;
            const passable = (cx: number, cy: number) => !!gameData.tiles[gameData.map[cy]?.[cx] ?? 0]?.passable;
            const pcol = Math.floor((p.x + pData.w / 2) / TILE_SIZE);
            const prow = Math.floor((p.y + pData.h / 2) / TILE_SIZE);

            // スプラ：足元＋直近に発生した爆発の範囲を塗る（Splatoon 風）
            if (modes?.paint) {
              const paintCell = (cx: number, cy: number) => {
                if (inb(cx, cy) && passable(cx, cy)) { const id = idxOf(cx, cy); if (!paint[id]) { paint[id] = 1; paintCountRef.current++; } }
              };
              paintCell(pcol, prow);
              for (const bl of onjBlastsRef.current) {
                if (bl.life !== bl.maxLife - 1) continue; // 今フレーム発生した爆発のみ
                const rc = Math.ceil(bl.r / TILE_SIZE);
                const bcx = Math.floor(bl.x / TILE_SIZE), bcy = Math.floor(bl.y / TILE_SIZE);
                for (let dy = -rc; dy <= rc; dy++) for (let dx = -rc; dx <= rc; dx++) if (dx * dx + dy * dy <= rc * rc) paintCell(bcx + dx, bcy + dy);
              }
            }

            // 陣取り：自陣外でトレイルを引き、自陣に戻ると囲み込みで占領（paper.io）
            if (modes?.territory && inb(pcol, prow) && passable(pcol, prow)) {
              const cell = idxOf(pcol, prow);
              if (owned[cell]) {
                if (trailListRef.current.length > 0) {
                  // (1) トレイルを自陣化
                  for (const ti of trailListRef.current) { trailG[ti] = 0; if (!owned[ti]) { owned[ti] = 1; ownedCountRef.current++; } }
                  trailListRef.current = [];
                  // (2) 外周から到達不能な通行可セル＝囲まれた内側 → 自陣化（フラッドフィル）
                  // 連結判定は「自陣(owned)以外」を通す（壁も通す）。境界になるのは自分の陣地だけ。
                  // ※ 通行不可セルでフラッドを止めると、外周が全部壁のマップで外側に種が撒けず
                  //   reach が空になり「全域占領」になってしまう。通行可判定は最後の占領時だけ使う。
                  const reach = new Uint8Array(gw * gh);
                  const stack: number[] = [];
                  const seed = (cx: number, cy: number) => { const id = idxOf(cx, cy); if (!owned[id] && !reach[id]) { reach[id] = 1; stack.push(id); } };
                  for (let cx = 0; cx < gw; cx++) { seed(cx, 0); seed(cx, gh - 1); }
                  for (let cy = 0; cy < gh; cy++) { seed(0, cy); seed(gw - 1, cy); }
                  while (stack.length) {
                    const id = stack.pop()!; const cx = id % gw, cy = (id / gw) | 0;
                    if (inb(cx - 1, cy)) seed(cx - 1, cy);
                    if (inb(cx + 1, cy)) seed(cx + 1, cy);
                    if (inb(cx, cy - 1)) seed(cx, cy - 1);
                    if (inb(cx, cy + 1)) seed(cx, cy + 1);
                  }
                  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
                    if (!passable(cx, cy)) continue; const id = idxOf(cx, cy);
                    if (!owned[id] && !reach[id]) { owned[id] = 1; ownedCountRef.current++; }
                  }
                  playSfx(sfxRef.current.clear);
                }
              } else if (!trailG[cell]) {
                trailG[cell] = 1; trailListRef.current.push(cell);
              }
              // 敵がトレイルを横切ったら切断（＋ダメージ）。原作の「軌跡を切られると死ぬ」を再現。
              if (trailListRef.current.length > 0) {
                for (const e2 of eng.entities) {
                  const ecx = Math.floor((e2.x + TILE_SIZE / 2) / TILE_SIZE), ecy = Math.floor((e2.y + TILE_SIZE / 2) / TILE_SIZE);
                  if (inb(ecx, ecy) && trailG[idxOf(ecx, ecy)]) {
                    for (const ti of trailListRef.current) trailG[ti] = 0;
                    trailListRef.current = [];
                    if (!debugInvincibleRef.current && invulnRef.current <= 0) {
                      onjRezeHpRef.current.hp -= 1; invulnRef.current = 60; hitShake(); playSfx(sfxRef.current.damage);
                      if (onjRezeHpRef.current.hp <= 0) { lose('トレイルを切られた…'); dead = true; }
                    }
                    break;
                  }
                }
              }
            }
          }
        } else {
          // rpg / touhou: 8-dir free move
          p.vx = 0; p.vy = 0;
          const isSlow = gameData.engine === 'touhou' && (keys.has('Shift') || touchRef.current.slow);
          const moveSpd = isSlow ? pData.speed * 0.45 : pData.speed;
          let nx = p.x, ny = p.y;
          if (isLeft) nx -= moveSpd; if (isRight) nx += moveSpd;
          if (isUp) ny -= moveSpd; if (isDown) ny += moveSpd;
          let t1 = getTile(nx, p.y), t2 = getTile(nx + pData.w - 1, p.y + pData.h - 1);
          if (t1?.info.passable && t2?.info.passable && nx >= 0 && nx <= worldW - pData.w) p.x = nx;
          t1 = getTile(p.x, ny); t2 = getTile(p.x + pData.w - 1, ny + pData.h - 1);
          if (t1?.info.passable && t2?.info.passable && ny >= 0 && ny <= worldH - pData.h) p.y = ny;

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
              if (eng.bullets[i].y < -16 || eng.bullets[i].y > PLAY_H + 16 ||
                  eng.bullets[i].x < -16 || eng.bullets[i].x > PLAY_W + 16) {
                eng.bullets.splice(i, 1);
              }
            }
          }
        }
      }

      // 位置変化を通知（play only）
      if (isPlaying && onPositionChangeRef.current) onPositionChangeRef.current(p.x, p.y, pData.emoji);

      // ── play mode: entities / combat / win ──
      // ラウンド終了演出中（roundOver）は敵・弾・当たり判定も止める（残機の死亡中は継続）
      if (isPlaying && !roundOverRef.current && !battleRef.current.active) {
        const pcx = p.x + pData.w / 2, pcy = p.y + pData.h / 2;
        for (let ei = eng.entities.length - 1; ei >= 0; ei--) {
          const e = eng.entities[ei]; const d = e.def; e.timer++;
          const ecx = e.x + TILE_SIZE / 2, ecy = e.y + TILE_SIZE / 2;

          const sp = d.speed;
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
                if (e.y > PLAY_H + 64) {
                  if (e.scriptCtx) e.scriptCtx.cancelled = true;
                  eng.entities.splice(ei, 1); continue;
                }
              } else {
                e.x = Math.max(TILE_SIZE, Math.min(PLAY_W - TILE_SIZE * 2, e.x));
                e.y = Math.max(TILE_SIZE, Math.min(PLAY_H * 0.55, e.y));
              }
            } else if (!d.isBoss) {
              // Xevious フォールバック（miniScript なし wave 敵）
              e.y += sp;
              e.x = e.homeX + Math.sin(e.timer * 0.045) * 45;
              e.x = Math.max(TILE_SIZE, Math.min(PLAY_W - TILE_SIZE * 2, e.x));
              if (e.y > PLAY_H + 64) { eng.entities.splice(ei, 1); continue; }
            } else {
              // ボス（miniScript なし）: patrolH
              if (d.behavior === 'patrolH') {
                if (e.vx === 0) e.vx = sp; e.x += e.vx;
                if (e.x < TILE_SIZE * 2 || e.x > PLAY_W - TILE_SIZE * 3) e.vx *= -1;
              } else if (d.behavior === 'patrolV') {
                if (e.vy === 0) e.vy = sp; e.y += e.vy;
              }
              e.x = Math.max(TILE_SIZE, Math.min(PLAY_W - TILE_SIZE * 2, e.x));
              e.y = Math.max(TILE_SIZE, Math.min(PLAY_H * 0.4, e.y));
            }
          } else if (gameData.engine === 'action') {
            // ── 横スク（マリオ/ロックマン）：重力・地面/壁判定つき敵AI ──
            // 地面に接していなければ自由落下。walker は崖の手前で反転（赤ノコノコ型）、
            // patrolH/緑ノコノコ型は崖からそのまま落ちる。
            const ES = TILE_SIZE; // 敵の当たり判定サイズ
            if (d.behavior === 'still') {
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
                const leadX = e.vx > 0 ? nx + ES - 1 : nx;
                const wt = getTile(leadX, e.y + 2), wb = getTile(leadX, e.y + ES - 2);
                const wall = (wt && !wt.info.passable) || (wb && !wb.info.passable);
                let edge = false;
                if (d.behavior === 'walker' && e.isGrounded) {
                  const f = getTile(leadX, e.y + ES + 2);
                  edge = !f || f.info.passable;
                }
                if (wall || edge || nx < 0 || nx > worldW - ES) e.vx = -e.vx;
                else e.x = nx;
              }
              // 重力 → 垂直移動 → 地面/天井判定（接地していなければ自由落下）
              e.vy += gameData.gravity;
              e.y += e.vy;
              e.isGrounded = false;
              if (e.vy > 0) {
                const fl = getTile(e.x + 2, e.y + ES), fr = getTile(e.x + ES - 2, e.y + ES);
                const g = (fl && !fl.info.passable) ? fl : (fr && !fr.info.passable) ? fr : null;
                if (g) { e.y = g.rect.y - ES; e.vy = 0; e.isGrounded = true; }
              } else if (e.vy < 0) {
                const hl = getTile(e.x + 2, e.y), hr = getTile(e.x + ES - 2, e.y);
                const c = (hl && !hl.info.passable) ? hl : (hr && !hr.info.passable) ? hr : null;
                if (c) { e.y = c.rect.y + TILE_SIZE; e.vy = 0; }
              }
              e.x = Math.max(0, Math.min(worldW - ES, e.x));
              // 穴に落ちたら除去
              if (e.y > worldH + TILE_SIZE) { eng.entities.splice(ei, 1); continue; }
            }
          } else {
            if (d.behavior === 'random') {
              if (e.timer % 40 === 0) { e.vx = (Math.random() * 2 - 1) * sp; e.vy = (Math.random() * 2 - 1) * sp; }
              e.x += e.vx; e.y += e.vy;
            } else if (d.behavior === 'chase' || d.behavior === 'flee') {
              const dx = pcx - ecx, dy = pcy - ecy; const dist = Math.hypot(dx, dy) || 1;
              const s = (d.behavior === 'chase' ? 1 : -1) * sp;
              e.x += (dx / dist) * s; e.y += (dy / dist) * s;
            } else if (d.behavior === 'patrolH') {
              if (e.vx === 0) e.vx = sp; e.x += e.vx;
              if (e.x < e.homeX - TILE_SIZE * 3 || e.x > e.homeX + TILE_SIZE * 3) e.vx *= -1;
              if (e.x < TILE_SIZE || e.x > worldW - TILE_SIZE * 2) e.vx *= -1;
            } else if (d.behavior === 'patrolV') {
              if (e.vy === 0) e.vy = sp; e.y += e.vy;
              if (e.y < e.homeY - TILE_SIZE * 3 || e.y > e.homeY + TILE_SIZE * 3) e.vy *= -1;
              if (e.y < TILE_SIZE || e.y > worldH - TILE_SIZE * 2) e.vy *= -1;
            }
            e.x = Math.max(0, Math.min(worldW - TILE_SIZE, e.x));
            e.y = Math.max(0, Math.min(worldH - TILE_SIZE, e.y));
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
            if (b.x < e.x + TILE_SIZE && b.x + b.w > e.x && b.y < e.y + TILE_SIZE && b.y + b.h > e.y) {
              e.hp--; eng.bullets.splice(j, 1);
              if (e.hp <= 0) {
                if (e.scriptCtx) e.scriptCtx.cancelled = true;
                scoreRef.current += d.isBoss ? 100 : 10;
                if (gameData.engine === 'touhou' && d.bombDrop && Math.random() < d.bombDrop) {
                  bombPickupsRef.current.push({ x: ecx, y: ecy, life: 300 });
                }
                if (d.isBoss) activeSpellCardNameRef.current = null;
                eng.entities.splice(ei, 1); break;
              }
            }
          }
          if (e.hp <= 0) continue;

          // ── 剣（近接）の当たり判定（onjReze） ──
          if (gameData.engine === 'onjReze' && swordRef.current.active > 0 && !swordRef.current.hit.has(d.id)) {
            const sw = swordRef.current; const reach = 26;
            let hx: number, hy: number, hw: number, hh: number;
            if (sw.dir.x !== 0) { hw = reach; hh = pData.h; hy = p.y; hx = sw.dir.x > 0 ? p.x + pData.w : p.x - reach; }
            else { hw = pData.w; hh = reach; hx = p.x; hy = sw.dir.y > 0 ? p.y + pData.h : p.y - reach; }
            if (hx < e.x + TILE_SIZE && hx + hw > e.x && hy < e.y + TILE_SIZE && hy + hh > e.y) {
              sw.hit.add(d.id);
              e.hp--;
              e.x = Math.max(0, Math.min(worldW - TILE_SIZE, e.x + sw.dir.x * 12));
              e.y = Math.max(0, Math.min(worldH - TILE_SIZE, e.y + sw.dir.y * 12));
              if (e.hp <= 0) {
                if (e.scriptCtx) e.scriptCtx.cancelled = true;
                scoreRef.current += d.isBoss ? 100 : 10;
                eng.entities.splice(ei, 1);
                continue;
              }
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

          const overlap = pcx > e.x && pcx < e.x + TILE_SIZE && pcy > e.y && pcy < e.y + TILE_SIZE;
          if (overlap) {
            const ot = d.objType ?? 'enemy';
            if (ot === 'warp' && d.warpTarget) {
              if (!eventRunningRef.current) {
                engineRef.current.player.x = d.warpTarget.col * TILE_SIZE;
                engineRef.current.player.y = d.warpTarget.row * TILE_SIZE;
              }
              break;
            }
            if (ot === 'item') {
              if (!eventRunningRef.current) {
                const iid = d.itemId || d.name || d.id;
                setInventory(p => { const n = { ...p }; n[iid] = (n[iid] ?? 0) + 1; return n; });
                eng.entities.splice(ei, 1);
                const itemDef = (gameData.items ?? []).find(it => it.id === iid);
                showGameMsg(`${itemDef?.emoji ?? d.emoji} ×1 を てにいれた！`, 'instant', () => {});
              }
              break;
            }
            if (d.pages && d.pages.length > 0) {
              if (!eventRunningRef.current) {
                const page = findActivePage(d);
                if (page && page.commands.length > 0) {
                  runEventCommands(d.id, page.commands);
                }
              }
              break;
            }
            if (d.hazard) {
              if (!debugInvincibleRef.current) {
                if (gameData.engine === 'rpg' && gameData.battle) { if (invulnRef.current <= 0) { startBattle(e); dead = true; } break; }
                if (gameData.engine === 'touhou') { if (!isPlayerDeadRef.current && invulnRef.current <= 0) { handlePlayerDeath(); dead = true; } break; }
                if (gameData.engine === 'onjReze') {
                  if (invulnRef.current <= 0) {
                    const dmg = Math.max(1, Math.round((d.atk ?? 8) / 8));
                    onjRezeHpRef.current.hp -= dmg; invulnRef.current = 60;
                    // ノックバック（敵と反対方向へ）
                    const kdx = pcx - ecx, kdy = pcy - ecy; const kd = Math.hypot(kdx, kdy) || 1;
                    p.x = Math.max(0, Math.min(worldW - pData.w, p.x + (kdx / kd) * 18));
                    p.y = Math.max(0, Math.min(worldH - pData.h, p.y + (kdy / kd) * 18));
                    hitShake(); playSfx(sfxRef.current.damage); forceHud(n => n + 1);
                    if (onjRezeHpRef.current.hp <= 0) { lose('やられた…'); dead = true; }
                  }
                  break;
                }
                hitShake(); playSfx(sfxRef.current.damage); lose('ミス！'); dead = true;
              }
              break;
            }
            else if (d.message && !e.talked) { e.talked = true; showGameMsg(d.message, 'instant', () => {}); }
          } else if (!d.hazard && !d.pages) { e.talked = false; }
        }

        if (!dead) {
          const core = gameData.engine === 'touhou' ? 3 : 8;
          if (grazeFlashRef.current > 0) grazeFlashRef.current--;

          // ── 弾移動・画面外除去 ──
          for (let i = eng.enemyBullets.length - 1; i >= 0; i--) {
            const eb = eng.enemyBullets[i]; eb.x += eb.vx; eb.y += eb.vy;
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
            if (bp.life <= 0 || bp.y > PLAY_H + 16) { bombPickupsRef.current.splice(i, 1); continue; }
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
                if (!debugInvincibleRef.current && invulnRef.current <= 0) { beginBattle({ name: boss.name, emoji: boss.emoji, hp: boss.hp, atk: boss.atk, def: boss.def, exp: boss.exp, entity: null, isBoss: true, outroDialogue: gameData.battle?.outroDialogue }); dead = true; }
              } else if (symbolBossLeft) {
                if (!bossWarnRef.current) { bossWarnRef.current = true; showGameMsg('まだ強敵がいる！倒してから来るのだ！', 'instant', () => {}); }
              } else win();
            }
            else if (center?.info?.special === 'trap') { if (!debugInvincibleRef.current) { lose('ミス！'); dead = true; } }
            else bossWarnRef.current = false;
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
      if (isAction && !prevActionRef.current && !battleRef.current.active && !eventRunningRef.current && !activeDialogueRef.current) {
        const pcx = p.x + pData.w / 2, pcy = p.y + pData.h / 2;
        const target = (isPlaying ? eng.entities : gameData.objects).find(o => {
          const ox = isPlaying ? (o as Entity).x : (o as ObjectDef).col * TILE_SIZE;
          const oy = isPlaying ? (o as Entity).y : (o as ObjectDef).row * TILE_SIZE;
          return pcx > ox && pcx < ox + TILE_SIZE && pcy > oy && pcy < oy + TILE_SIZE;
        });
        if (target) {
          const def = isPlaying ? (target as Entity).def : target as ObjectDef;
          const page = def.pages && def.pages.length > 0 ? findActivePage(def) : null;
          if (page && page.commands.length > 0) {
            runEventCommands(def.id, page.commands);
          } else if (def.message) {
            showGameMsg(def.message, 'instant', () => {});
          }
        }
      }
      prevActionRef.current = isAction;

      // ── Z / X keys: place / delete object ──
      const isZ = keys.has('z') || keys.has('Z');
      const isX = keys.has('x') || keys.has('X');
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

      // カメラ：プレイ中はプレイヤー中心に追従、編集中も同様（編集スクロールは初期位置用）
      const camX = Math.max(0, Math.min(camMax,
        isPlaying || p.x !== gameData.player.start.x
          ? p.x + pData.w / 2 - PLAY_W / 2
          : editScrollRef.current));
      const camY = Math.max(0, Math.min(camMaxY,
        isPlaying || p.y !== gameData.player.start.y
          ? p.y + pData.h / 2 - PLAY_H / 2
          : editScrollYRef.current));
      // 画面シェイク（ヒット・爆発・ゲームオーバー）
      if (shakeRef.current > 0) shakeRef.current--;
      const shakeMag = shakeRef.current > 0 ? Math.min(shakeRef.current, 8) * 0.7 : 0;
      const shakeOx = shakeMag > 0 ? (Math.random() - 0.5) * shakeMag * 2 : 0;
      const shakeOy = shakeMag > 0 ? (Math.random() - 0.5) * shakeMag * 2 : 0;

      ctx.save();
      ctx.translate(shakeOx - camX, shakeOy - camY);

      const map = engineRef.current.map;
      const startCol = Math.max(0, Math.floor(camX / TILE_SIZE));
      const endCol = Math.min(worldCols, startCol + COLS + 2);
      const startRow = Math.max(0, Math.floor(camY / TILE_SIZE));
      const endRow = Math.min(worldRows, startRow + ROWS + 2);
      for (let y = startRow; y < endRow; y++) {
        for (let x = startCol; x < endCol; x++) {
          const tileId = map[y]?.[x] ?? 0;
          const info = gameData.tiles[tileId];
          if (tileId !== 0 && info) {
            const img = info.imageUrl ? imgCache.current.get(info.imageUrl) : undefined;
            if (img && img.complete && img.naturalWidth > 0) ctx.drawImage(img, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            else { ctx.fillStyle = info.color; ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE); }
            if (!isPlaying) { ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE); }
          }
        }
      }

      // ── onjReze：陣取り(自陣/トレイル)・スプラ(塗り) のセル・オーバーレイ（敵の下に描画）──
      if (isPlaying && gameData.engine === 'onjReze') {
        const gw = worldCols;
        const showTerritory = !!gameData.onjReze?.territory;
        const showPaint = !!gameData.onjReze?.paint;
        const owned = showTerritory ? ownedGridRef.current : null;
        const trailG = showTerritory ? trailGridRef.current : null;
        const paint = showPaint ? paintGridRef.current : null;
        const pcol = gameData.player.color;
        for (let y = startRow; y < endRow; y++) {
          for (let x = startCol; x < endCol; x++) {
            const id = y * gw + x;
            if (paint && paint[id]) { ctx.fillStyle = pcol; ctx.globalAlpha = 0.3; ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE); }
            if (owned && owned[id]) { ctx.fillStyle = '#3ecf3e'; ctx.globalAlpha = 0.42; ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE); }
            if (trailG && trailG[id]) { ctx.fillStyle = pcol; ctx.globalAlpha = 0.85; ctx.fillRect(x * TILE_SIZE + 4, y * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8); }
          }
        }
        ctx.globalAlpha = 1;
      }

      // objects (play: from entities, edit: from data)
      if (isPlaying) {
        for (let ei = 0; ei < eng.entities.length; ei++) {
          const e = eng.entities[ei];
          drawSprite({ emoji: e.def.emoji, spriteUrl: e.def.spriteUrl, spriteRef: e.def.spriteRef }, e.x, e.y, TILE_SIZE, TILE_SIZE, `ent${e.def.id}_${ei}`);
          if (e.def.hp > 1) { ctx.fillStyle = 'red'; ctx.fillRect(e.x, e.y - 5, TILE_SIZE * (e.hp / e.def.hp), 3); }
        }
        ctx.fillStyle = 'yellow';
        for (const b of eng.bullets) ctx.fillRect(b.x, b.y, b.w, b.h);
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
            for (const eb of bullets) { ctx.moveTo(eb.x + eb.r, eb.y); ctx.arc(eb.x, eb.y, eb.r, 0, Math.PI * 2); }
            ctx.fill();
          }
          ctx.fillStyle = 'white';
          ctx.beginPath();
          for (const eb of eng.enemyBullets) { ctx.moveTo(eb.x + eb.r * 0.5, eb.y); ctx.arc(eb.x, eb.y, eb.r * 0.5, 0, Math.PI * 2); }
          ctx.fill();
        }
      } else {
        for (const o of gameData.objects) {
          drawSprite({ emoji: o.emoji, spriteUrl: o.spriteUrl, spriteRef: o.spriteRef }, o.col * TILE_SIZE, o.row * TILE_SIZE, TILE_SIZE, TILE_SIZE, `obj${o.id}`);
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
        ctx.globalAlpha = 0.45;
        ctx.font = `${pData.w}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(ghost.emoji, ghost.x + pData.w / 2, ghost.y + pData.h + 4);
        ctx.globalAlpha = 1;
      }

      // player
      if (gameData.engine !== 'touhou') {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(p.x + pData.w / 2, p.y + pData.h, pData.w / 2, 4, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = gameData.player.color;
      // 死亡中は非表示。無敵中（復帰点滅）は 4f 周期で点滅
      if (!isPlayerDeadRef.current && !(invulnRef.current > 0 && Math.floor(invulnRef.current / 4) % 2 === 0)) {
        drawSprite({ emoji: pData.emoji, spriteUrl: pData.spriteUrl, spriteRef: pData.spriteRef }, p.x, p.y, pData.w, pData.h, 'player');
      }
      // onjReze：近接攻撃の描画（振っている間だけ向きに合わせて表示）
      if (gameData.engine === 'onjReze' && isPlaying && swordRef.current.active > 0) {
        const sw = swordRef.current; const reach = 26;
        let hx: number, hy: number, hw: number, hh: number;
        if (sw.dir.x !== 0) { hw = reach; hh = pData.h; hy = p.y; hx = sw.dir.x > 0 ? p.x + pData.w : p.x - reach; }
        else { hw = pData.w; hh = reach; hx = p.x; hy = sw.dir.y > 0 ? p.y + pData.h : p.y - reach; }
        ctx.fillStyle = 'rgba(220,235,255,0.85)';
        ctx.fillRect(hx, hy, hw, hh);
        ctx.font = '18px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⚔️', hx + hw / 2, hy + hh / 2);
      }
      // onjReze：ボム・飛行ボム・爆発の描画（原作 onj-reze.html の見た目を移植）
      if (gameData.engine === 'onjReze') {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        // 飛行中（放物線アーク + 影）
        for (const fb of onjFliesRef.current) {
          const pr = fb.t / fb.dur;
          const cx = fb.fx + (fb.tx - fb.fx) * pr, cy = fb.fy + (fb.ty - fb.fy) * pr;
          const arc = -Math.sin(pr * Math.PI) * 26;
          ctx.globalAlpha = 0.3; ctx.fillStyle = '#000';
          ctx.beginPath(); ctx.ellipse(cx, cy, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1; ctx.font = '18px Arial';
          ctx.fillText(fb.head ? '💀' : '💣', cx, cy + arc);
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
          ctx.globalAlpha = 1; ctx.font = '20px Arial';
          ctx.fillText(bm.head ? '💀' : '💣', bm.x + ox, bm.y + oy);
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
        }
        // 当たり判定（赤点）
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'red'; ctx.lineWidth = 1.5; ctx.stroke();
      }

      ctx.restore();

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
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(text, PLAY_W - 8, 22);
        void remaining;
      }

      // ── touhou スコア HUD ──
      if (isPlaying && gameData.engine === 'touhou') {
        const sc = scoreRef.current;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(PLAY_W - 130, PLAY_H - 26, 122, 20);
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#ffd84d';
        ctx.fillText(`SCORE  ${sc.toLocaleString()}`, PLAY_W - 8, PLAY_H - 10);
      }
      // ── touhou グレイズ HUD ──
      if (isPlaying && gameData.engine === 'touhou') {
        const gz = grazeRef.current;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(PLAY_W - 130, PLAY_H - 50, 122, 20);
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = gz > 0 ? '#fde68a' : '#666';
        ctx.fillText(`GRAZE  ${gz}`, PLAY_W - 8, PLAY_H - 34);
      }

      // ── touhou 残機 HUD ──
      if (isPlaying && gameData.engine === 'touhou') {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(8, PLAY_H - 26, 90, 20);
        ctx.font = 'bold 13px monospace';
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
        ctx.font = 'bold 12px monospace';
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
          ctx.font = 'bold 10px monospace';
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
          ctx.fillStyle = '#ff8888'; ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          ctx.fillText(`BOSS: ${boss.def.name ?? boss.def.emoji}`, barX + 4, barY + barH + 12);
        }
      }

      // ── 戦闘プレイヤーHUD（Lv / HP / MP）──
      if (isPlaying && gameData.engine === 'rpg' && gameData.battle) {
        const pr = progressRef.current;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(6, 6, 150, 50);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(6, 6, 150, 50);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(`Lv ${pr.level}  ${playerNameRef.current || gameData.battle.playerName}`, 12, 22);
        ctx.fillText(`HP ${Math.max(0, pr.hp)}/${pr.maxHp}`, 12, 38);
        ctx.fillStyle = '#7fd0ff'; ctx.fillText(`MP ${pr.mp}/${pr.maxMp}`, 12, 52);
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
        // 占有率 HUD（陣取り／スプラが有効なときのみ）
        const modes = gameData.onjReze;
        if (modes?.territory || modes?.paint) {
          const total = groundCellsRef.current;
          const parts: string[] = [];
          if (modes?.territory) parts.push(`占領 ${Math.round(ownedCountRef.current / total * 100)}%`);
          if (modes?.paint) parts.push(`塗り ${Math.round(paintCountRef.current / total * 100)}%`);
          const label = parts.join('  ');
          ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          const wpx = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(6, 38, wpx + 16, 22);
          ctx.fillStyle = '#9effa0'; ctx.fillText(label, 14, 49);
        }
      }

      eng.animId = requestAnimationFrame(loop);
    };

    const id = requestAnimationFrame(loop);
    engineRef.current.animId = id;
    return () => { cancelAnimationFrame(engineRef.current.animId); cancelAnimationFrame(id); window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [gameData, isPlaying, restart, editorTab, editSpeedMult]);

  // touch state via ref to avoid re-running the loop effect
  const touchRef = useRef({ up: false, down: false, left: false, right: false, action: false, slow: false, bomb: false, shoot: false });
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
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    const worldCols = gameData.scroll?.worldCols ?? COLS;
    const worldRows = gameData.scroll?.worldRows ?? ROWS;
    // camera follows player in edit mode now
    const camX = Math.max(0, Math.min((gameData.scroll?.worldCols ?? COLS) * TILE_SIZE - PLAY_W,
      engineRef.current.player.x !== gameData.player.start.x
        ? engineRef.current.player.x + gameData.player.w / 2 - PLAY_W / 2
        : editScrollRef.current));
    const camY = Math.max(0, Math.min((gameData.scroll?.worldRows ?? ROWS) * TILE_SIZE - PLAY_H,
      engineRef.current.player.y !== gameData.player.start.y
        ? engineRef.current.player.y + gameData.player.h / 2 - PLAY_H / 2
        : editScrollYRef.current));
    const col = Math.floor((x + camX) / TILE_SIZE); const row = Math.floor((y + camY) / TILE_SIZE);
    if (col < 0 || col >= worldCols || row < 0 || row >= worldRows) return;

    if (editorTab === 'map') {
      // 🏁マーカー付近クリック → 初期位置ドラッグ開始
      const startCol = Math.floor(gameData.player.start.x / TILE_SIZE);
      const startRow = Math.floor(gameData.player.start.y / TILE_SIZE);
      const isPointerDown = ('buttons' in e ? (e as React.MouseEvent).buttons === 1 : true);
      if (isPointerDown && !isDraggingStartRef.current && Math.abs(col - startCol) <= 1 && Math.abs(row - startRow) <= 1) {
        isDraggingStartRef.current = true;
      }
      if (isDraggingStartRef.current) {
        const sx = col * TILE_SIZE, sy = row * TILE_SIZE;
        setGameData(prev => ({ ...prev, player: { ...prev.player, start: { x: sx, y: sy } } }));
        engineRef.current.player = { x: sx, y: sy, vx: 0, vy: 0, isGrounded: false };
        setEditScroll(Math.max(0, Math.min(worldCols * TILE_SIZE - PLAY_W, sx + gameData.player.w / 2 - PLAY_W / 2)));
        setEditScrollY(Math.max(0, Math.min(worldRows * TILE_SIZE - PLAY_H, sy + gameData.player.h / 2 - PLAY_H / 2)));
        return;
      }
      setGameData(prev => {
        const newMap = prev.map.map(r => [...r]);
        newMap[row][col] = selectedTileId;
        engineRef.current.map = newMap;
        return { ...prev, map: newMap };
      });
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
    onjReze: gameData.onjReze,
    titleScreen: gameData.titleScreen ? (({ bgUrl: _u, ...t }) => t)(gameData.titleScreen) : undefined,
    ending: gameData.ending ? (({ bgUrl: _u, ...e }) => e)(gameData.ending) : undefined,
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
          player: { ...base.player, ...manifest.player, spriteUrl: undefined },
          tiles: Object.fromEntries(
            Object.entries(manifest.tiles).map(([k, t]) => [k, { ...t, imageUrl: undefined }])
          ),
          map: manifest.map,
          objects: manifest.objects.map(o => ({ ...o, spriteUrl: undefined })),
          mapBgRef: manifest.mapBgRef,
          mapBgUrl: undefined,
          scroll: manifest.scroll ?? base.scroll,
          phases: manifest.phases ?? base.phases,
          onjReze: manifest.onjReze ?? base.onjReze,
          titleScreen: manifest.titleScreen ?? base.titleScreen,
          ending: manifest.ending ?? base.ending,
          battle: base.battle,
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
  const addMenuItem = (kind: ScreenMenuKind) => setGameData(p => p.titleScreen ? ({ ...p, titleScreen: { ...p.titleScreen, menu: [...p.titleScreen.menu, { kind, label: SCREEN_MENU_LABELS[kind] }] } }) : p);
  /** タイトルメニュー項目を選んだときの挙動。newGame/continue=プレイ開始（continue は現状スタブ）。 */
  const startFromTitle = () => { setShowTitle(false); setIsPlaying(true); };

  return (
    <div className={embedded ? "flex flex-col h-full bg-[#07080b] text-gray-100 overflow-hidden" : "absolute inset-0 z-50 flex flex-col bg-[#07080b] text-gray-100 overflow-hidden"}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0f0f11] border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {!embedded && <button onClick={onClose} className="p-1 text-gray-400 hover:bg-gray-100/10 rounded-full shrink-0"><X size={16} /></button>}
          <span className="text-xs font-bold text-white shrink-0">{embedded ? '▶ プレイ中' : 'ゲーム作成'}</span>
          {!isPlaying && !playOnly && (
            <select value={presetId} onChange={e => resetGame(e.target.value as PresetId)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 outline-none max-w-[110px]">
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
              className={`p-2 rounded-full ${settingsOpen ? 'bg-gray-600 text-white' : 'bg-gray-700/50 text-gray-400 hover:text-white'} ${debugInvincible ? 'ring-1 ring-yellow-400' : ''}`}
              title="設定"
            >
              <Settings size={14} />
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-[#1a1a2e] border border-gray-700 rounded-xl shadow-2xl p-2 space-y-1">
                {/* 無敵モード */}
                <button
                  onClick={() => setDebugInvincible(v => !v)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition ${debugInvincible ? 'bg-yellow-500/20 text-yellow-300' : 'text-gray-400 hover:bg-gray-700'}`}
                >
                  {debugInvincible ? <Shield size={13} /> : <ShieldOff size={13} />}
                  無敵モード {debugInvincible ? 'ON' : 'OFF'}
                </button>
                {gameData.engine === 'onjReze' && (
                  <>
                    <div className="border-t border-gray-700 my-1" />
                    <button
                      onClick={() => setGameData(p => ({ ...p, onjReze: { territory: !(p.onjReze?.territory ?? false), paint: p.onjReze?.paint ?? false } }))}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition ${gameData.onjReze?.territory ? 'bg-green-500/20 text-green-300' : 'text-gray-400 hover:bg-gray-700'}`}
                    >
                      🚩 陣取りモード {gameData.onjReze?.territory ? 'ON' : 'OFF'}
                    </button>
                    <button
                      onClick={() => setGameData(p => ({ ...p, onjReze: { territory: p.onjReze?.territory ?? false, paint: !(p.onjReze?.paint ?? false) } }))}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition ${gameData.onjReze?.paint ? 'bg-pink-500/20 text-pink-300' : 'text-gray-400 hover:bg-gray-700'}`}
                    >
                      🎨 スプラ塗りモード {gameData.onjReze?.paint ? 'ON' : 'OFF'}
                    </button>
                  </>
                )}
                <div className="border-t border-gray-700 my-1" />
                {/* エクスポート */}
                <button
                  onClick={() => { handleExport(); setSettingsOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-400 hover:bg-gray-700 hover:text-white transition"
                >
                  <Download size={13} />データをエクスポート (.json)
                </button>
                {/* インポート */}
                <button
                  onClick={() => { importFileRef.current?.click(); setSettingsOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-400 hover:bg-gray-700 hover:text-white transition"
                >
                  <Upload size={13} />データをインポート (.json)
                </button>
                <input ref={importFileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
              </div>
            )}
          </div>
          <button onClick={restart} className="p-2 text-gray-400 hover:text-white rounded-full bg-gray-700/50" title="リスタート"><RotateCcw size={14} /></button>
          <button onClick={() => {
            if (isPlaying) { setGameMsg(null); setBattle(null); setEventChoice(null); setPicker(null); battleRef.current = { active: false, entity: null, enemyName: '', enemyHp: 0, enemyMaxHp: 0, enemyAtk: 0, enemyDef: 0, enemyMoves: [], exp: 0, isBoss: false }; eventRunningRef.current = false; invulnRef.current = 0; const pp = engineRef.current.player; const pw = gameData.player.w, ph = gameData.player.h; setEditScroll(Math.max(0, Math.min(((gameData.scroll?.worldCols ?? COLS) * TILE_SIZE - PLAY_W), pp.x + pw / 2 - PLAY_W / 2))); setEditScrollY(Math.max(0, Math.min(((gameData.scroll?.worldRows ?? ROWS) * TILE_SIZE - PLAY_H), pp.y + ph / 2 - PLAY_H / 2))); }
            if (isPlaying) { setShowEnding(false); setIsPlaying(false); return; }
            setActivePreviewKey(null);
            if (gameData.titleScreen?.enabled) { setShowTitle(true); return; }
            setIsPlaying(true);
          }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold ${isPlaying ? 'bg-yellow-500 text-yellow-900' : 'bg-green-500 text-green-900'}`}>
            {isPlaying ? <><Pause size={14} /><span className="hidden sm:inline">編集</span></> : <><Play size={14} /><span className="hidden sm:inline">プレイ</span></>}
          </button>
          {onSave && (
            <button onClick={handleSave} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-blue-600 text-white hover:bg-blue-500">
              <Save size={14} /><span className="hidden sm:inline">投稿に添付</span>
            </button>
          )}
        </div>
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Canvas */}
        <div className={`flex flex-col items-center justify-center bg-black overflow-hidden ${isPlaying ? 'flex-1 max-h-[55vh] md:max-h-full' : 'flex-1 portrait:flex-none'}`}>
          <div className="relative w-full mx-auto rounded-lg overflow-hidden ring-2 ring-gray-700 touch-none shrink-0"
            style={{ aspectRatio: `${PLAY_W}/${PLAY_H}`, maxWidth: PLAY_W + 'px' }}>
            <canvas ref={canvasRef} width={PLAY_W} height={PLAY_H}
              className={`block w-full h-full ${!isPlaying ? 'cursor-crosshair' : ''}`}
              style={{ imageRendering: 'pixelated' }}
              onMouseDown={handleCanvasAction}
              onMouseMove={e => editorTab !== 'object' && (e.buttons & 1) === 1 && handleCanvasAction(e)}
              onMouseUp={() => { isDraggingStartRef.current = false; }}
              onTouchStart={handleCanvasAction}
              onTouchMove={e => editorTab !== 'object' && handleCanvasAction(e)}
              onTouchEnd={() => { isDraggingStartRef.current = false; }} />

            {/* ── タイトル画面オーバーレイ ── */}
            {showTitle && gameData.titleScreen && (
              <div className="absolute inset-0 z-40 overflow-hidden" style={{ background: 'linear-gradient(160deg,#0b1020,#1a1030)' }}>
                {gameData.titleScreen.bgUrl && /* eslint-disable-next-line @next/next/no-img-element */ (
                  <img src={gameData.titleScreen.bgUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                )}
                {!embedded && (
                  <button onClick={() => setShowTitle(false)} className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-black/50 text-white/80 hover:text-white"><X size={16} /></button>
                )}
                <div className="relative z-10 w-full h-full flex flex-col items-center justify-center gap-3 px-6 text-center select-none"
                  style={{ color: gameData.titleScreen.textColor ?? '#ffffff' }}>
                  <h1 className="text-2xl sm:text-4xl font-black" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.85)' }}>{gameData.titleScreen.heading}</h1>
                  {gameData.titleScreen.subtitle && <p className="text-sm opacity-90" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.85)' }}>{gameData.titleScreen.subtitle}</p>}
                  {playerName && <p className="text-xs opacity-80" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.85)' }}>ようこそ {playerName} さん</p>}
                  <div className="flex flex-col gap-2 mt-2 w-52 max-w-full">
                    {gameData.titleScreen.menu.map((mi, i) => mi.kind === 'nameInput' ? (
                      <input key={i} value={playerName} onChange={e => setPlayerName(e.target.value.slice(0, 16))} placeholder={mi.label}
                        className="px-3 py-2 rounded-lg bg-black/45 border border-white/30 text-white text-sm text-center outline-none placeholder-white/50" />
                    ) : (
                      <button key={i} onClick={startFromTitle}
                        className="px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 border border-white/30 font-bold text-sm backdrop-blur-sm">{mi.label}</button>
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
                  <h1 className="text-2xl sm:text-4xl font-black" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.85)' }}>{gameData.ending.heading}</h1>
                  {gameData.ending.message && <p className="text-sm opacity-90 whitespace-pre-wrap" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.85)' }}>{gameData.ending.message}</p>}
                  <div className="flex gap-2 mt-3">
                    {gameData.titleScreen && (
                      <button onClick={() => { setShowEnding(false); setShowTitle(true); }}
                        className="px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 border border-white/30 font-bold text-sm backdrop-blur-sm">タイトルへ</button>
                    )}
                    <button onClick={() => setShowEnding(false)}
                      className="px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 border border-white/30 font-bold text-sm backdrop-blur-sm">とじる</button>
                  </div>
                </div>
              </div>
            )}

            {/* ── 入口ヒーロー：動くデモの上に「あそぶ / 改造する」を重ねる ── */}
            {introOpen && (
              <div className="absolute inset-0 z-[45] flex flex-col overflow-y-auto select-none"
                style={{ background: 'rgba(7,8,11,0.82)', backdropFilter: 'blur(2px)' }}>
                {/* ヘッダー */}
                <div className="shrink-0 pt-3 pb-1 px-4 text-center">
                  <span className="text-[9px] font-black tracking-[0.35em] text-white/40">GAME MAKER</span>
                  <p className="text-[11px] text-white/70 mt-0.5">完成ゲームを選んで改造しよう</p>
                </div>

                {/* ギャラリー：プリセットカード */}
                <div className="flex-1 px-3 py-2 grid grid-cols-1 gap-2">
                  {PRESET_ORDER.map(id => {
                    const active = presetId === id;
                    const p = PRESETS[id];
                    return (
                      <button key={id} onClick={() => previewPresetInIntro(id)}
                        className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition active:scale-[0.98] ${active ? 'bg-white/15 ring-2 ring-white/60' : 'bg-white/5 ring-1 ring-white/10 hover:bg-white/10'}`}>
                        {/* 絵文字アイコン */}
                        <span className={`text-3xl leading-none shrink-0 transition-transform duration-200 ${active ? 'scale-110' : ''}`}>
                          {PRESET_EMOJI[id]}
                        </span>
                        {/* テキスト */}
                        <div className="min-w-0">
                          <div className="font-black text-sm text-white">{p.name}</div>
                          <div className="text-[10px] text-white/55 mt-0.5">{PRESET_TAGLINE[id]}</div>
                        </div>
                        {/* 選択インジケーター */}
                        {active && (
                          <span className="ml-auto shrink-0 text-[9px] font-black tracking-wider text-green-400 bg-green-400/15 rounded-full px-2 py-0.5">
                            プレビュー中
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* あそぶ / 改造する */}
                <div className="shrink-0 flex flex-col gap-2 px-4 pb-4 pt-1">
                  <button onClick={enterPlayFromIntro}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full font-black text-sm bg-green-500 text-green-950 hover:bg-green-400 active:scale-95 transition shadow-lg shadow-green-500/30">
                    <Play size={16} /> {PRESET_EMOJI[presetId]} をあそぶ
                  </button>
                  <button onClick={enterEditFromIntro}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-full font-bold text-sm bg-white/10 text-white border border-white/25 hover:bg-white/20 active:scale-95 transition">
                    ✏ 改造する
                  </button>
                </div>
              </div>
            )}

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
                <div className="bg-[#1a1a2e] border-2 border-gray-400 rounded-lg px-4 py-3 shadow-2xl"
                  style={{ fontFamily: 'monospace', imageRendering: 'pixelated' }}>
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
              <div className="absolute inset-0 flex items-end justify-center pb-16 px-4"
                style={{ fontFamily: 'monospace' }}>
                <div className="bg-[#1a1a2e] border-2 border-gray-400 rounded-lg p-3 shadow-2xl w-full max-w-xs">
                  <p className="text-white text-sm leading-relaxed mb-2 whitespace-pre-wrap">{eventChoice.text}</p>
                  <div className="space-y-1.5">
                    {eventChoice.choices.map((ch, i) => (
                      <button key={i} onClick={() => eventChoice.onPick(i)}
                        className="w-full py-1.5 rounded bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white text-xs font-bold text-left px-3">
                        {ch.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── ターン制戦闘オーバーレイ ── */}
            {battle && (
              <div className="absolute inset-0 flex flex-col justify-between p-2 sm:p-3 bg-black/40" style={{ fontFamily: 'monospace' }}>
                {/* 敵 */}
                <div className="flex flex-col items-center mt-2">
                  <div className="text-5xl sm:text-6xl leading-none drop-shadow">{battle.enemyEmoji}</div>
                  <div className="mt-1 text-white text-xs sm:text-sm">{battle.enemyName}</div>
                  <div className="w-40 h-2 bg-gray-700 rounded mt-1 overflow-hidden">
                    <div className="h-full bg-red-500 transition-all" style={{ width: `${Math.max(0, (battle.enemyHp / battle.enemyMaxHp) * 100)}%` }} />
                  </div>
                </div>
                {/* ログ + コマンド */}
                <div className="bg-[#1a1a2e] border-2 border-gray-400 rounded-lg p-2 sm:p-3 shadow-2xl">
                  <div className="text-white text-[11px] sm:text-sm leading-relaxed min-h-[3.5em] mb-2">
                    {battle.log.slice(-3).map((l, i) => <p key={i}>{l}</p>)}
                  </div>
                  {battle.canAct && !battle.over && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <button onClick={doAttack} className="py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold">{gameData.battle?.labels.attack}</button>
                      <button onClick={doFlee} className="py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold">{gameData.battle?.labels.flee}</button>
                      {(gameData.battle?.moves ?? []).map((m, i) => (
                        <button key={i} onClick={() => doMove(m)} disabled={progressRef.current.mp < m.cost}
                          className="py-1.5 rounded bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 text-white text-[11px] font-bold">
                          {m.name}<span className="text-indigo-300 ml-1">{m.cost}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {!isPlaying && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute bottom-2 left-1 pointer-events-auto touch-none select-none opacity-90">
                  <div className="relative w-16 h-16">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-7 bg-gray-700 rounded-t active:bg-gray-600 flex items-center justify-center text-white text-[9px] leading-none" {...padProps('up')}>▲</div>
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-7 bg-gray-700 rounded-b active:bg-gray-600 flex items-center justify-center text-white text-[9px] leading-none" {...padProps('down')}>▼</div>
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-7 h-6 bg-gray-700 rounded-l active:bg-gray-600 flex items-center justify-center text-white text-[9px] leading-none" {...padProps('left')}>◀</div>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-7 h-6 bg-gray-700 rounded-r active:bg-gray-600 flex items-center justify-center text-white text-[9px] leading-none" {...padProps('right')}>▶</div>
                  </div>
                </div>
                <div className="absolute bottom-2 right-1 pointer-events-auto touch-none select-none opacity-90">
                  <div className="relative w-14 h-16">
                    <button onClick={placeObj}
                      className="absolute right-0 bottom-0 w-10 h-10 rounded-full bg-green-600 active:bg-green-500 shadow-lg border-b-4 border-green-800 active:border-b-0 active:translate-y-1 text-white font-bold text-[8px] flex items-center justify-center"
                      title="Zキー">PUT</button>
                    <button onClick={() => { if (selectedObjIdRef.current) { setGameData(p => ({ ...p, objects: p.objects.filter(o => o.id !== selectedObjIdRef.current) })); setSelectedObjId(null); }}}
                      className="absolute left-0 top-1 w-9 h-9 rounded-full bg-red-700 active:bg-red-600 shadow-lg border-b-4 border-red-900 active:border-b-0 active:translate-y-1 text-white font-bold text-[8px] flex items-center justify-center"
                      title="Xキー">DEL</button>
                  </div>
                </div>
                <div className="absolute top-1 left-1/2 -translate-x-1/2 pointer-events-auto touch-none select-none opacity-90">
                  <div className="flex items-center gap-1 px-2 py-1 rounded bg-black/50 text-[10px]">
                    <span className="text-gray-300">速度:</span>
                    {[1, 2, 4].map(m => (
                      <button key={m} onClick={() => setEditSpeedMult(m)}
                        className={`px-2 py-0.5 rounded font-bold transition ${editSpeedMult === m ? 'bg-blue-600 text-white' : 'bg-gray-700/70 text-gray-400 hover:bg-gray-600'}`}>
                        {m}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className={`bg-[#0a0a0d] flex flex-col border-t md:border-t-0 md:border-l border-gray-800 ${(isPlaying || playOnly) ? 'w-full md:w-auto' : 'portrait:flex-1 flex-none max-h-[40vh] md:max-h-none overflow-y-auto md:w-80 md:flex-none'}`}>
          {(isPlaying || playOnly) ? (
            <div className="flex-1 flex flex-col p-4 select-none">
              <div className="flex-1 flex items-center justify-center">
              <div className="flex justify-between items-center max-w-xs w-full gap-8">
                <div className="relative w-28 h-28">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-12 bg-gray-600 rounded-t-lg active:bg-gray-400 touch-none cursor-pointer" {...padProps('up')}></div>
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-12 bg-gray-600 rounded-b-lg active:bg-gray-400 touch-none cursor-pointer" {...padProps('down')}></div>
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-12 h-10 bg-gray-600 rounded-l-lg active:bg-gray-400 touch-none cursor-pointer" {...padProps('left')}></div>
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-12 h-10 bg-gray-600 rounded-r-lg active:bg-gray-400 touch-none cursor-pointer" {...padProps('right')}></div>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-gray-700 pointer-events-none rounded"></div>
                </div>
                {gameData.engine === 'action' && (
                  <div className="flex gap-3">
                    <button className="w-14 h-14 rounded-full border-b-4 border-gray-800 active:border-b-0 active:translate-y-1 shadow-lg text-white font-bold text-xs bg-cyan-600 active:bg-cyan-500 touch-none cursor-pointer select-none"
                      {...padProps('shoot')}>
                      SHOT
                    </button>
                    <button className="w-14 h-14 rounded-full border-b-4 border-gray-800 active:border-b-0 active:translate-y-1 shadow-lg text-white font-bold text-xs bg-blue-600 active:bg-blue-500 touch-none cursor-pointer select-none"
                      {...padProps('action')}>
                      JUMP
                    </button>
                  </div>
                )}
                {gameData.engine === 'onjReze' && (
                  <div className="grid grid-cols-2 gap-2">
                    <button className="w-14 h-14 rounded-full border-b-4 border-gray-800 active:border-b-0 active:translate-y-1 shadow-lg text-white font-bold text-lg bg-red-600 active:bg-red-500 touch-none cursor-pointer select-none"
                      {...padProps('action')}>
                      ⚔️
                    </button>
                    <button className="w-14 h-14 rounded-full border-b-4 border-gray-800 active:border-b-0 active:translate-y-1 shadow-lg text-white font-bold text-lg bg-orange-600 active:bg-orange-500 touch-none cursor-pointer select-none"
                      {...padProps('shoot')}>
                      🎯
                    </button>
                    <button className="w-14 h-14 rounded-full border-b-4 border-gray-800 active:border-b-0 active:translate-y-1 shadow-lg text-white font-bold text-lg bg-amber-600 active:bg-amber-500 touch-none cursor-pointer select-none"
                      {...padProps('bomb')}>
                      💣
                    </button>
                    <button className="w-14 h-14 rounded-full border-b-4 border-gray-800 active:border-b-0 active:translate-y-1 shadow-lg text-white font-bold text-lg bg-purple-700 active:bg-purple-600 touch-none cursor-pointer select-none"
                      {...padProps('slow')}>
                      💀
                    </button>
                  </div>
                )}
                {gameData.engine === 'touhou' && (
                  <div className="flex flex-col items-center gap-2">
                    <button className="w-14 h-10 rounded-full border border-purple-600 text-purple-300 font-bold text-[11px] touch-none cursor-pointer select-none active:bg-purple-900/50"
                      {...padProps('slow')}>
                      低速
                    </button>
                    <button className="w-14 h-10 rounded-lg border-2 border-violet-500 bg-violet-900/40 text-violet-200 font-bold text-[11px] touch-none cursor-pointer select-none active:bg-violet-700/60"
                      {...padProps('bomb')}>
                      💣 BOMB
                    </button>
                  </div>
                )}
              </div>
              </div>
              {/* セリフ送りボタン（ダイアログ表示中のみ） */}
              {activeDialogue && (
                <button
                  className="w-full py-3 mt-2 rounded-xl bg-yellow-700/80 border border-yellow-500 text-yellow-100 font-bold text-sm active:bg-yellow-600 touch-none select-none"
                  onPointerDown={e => { e.preventDefault(); dialogueCutsceneRef.current?.advance(); }}
                >
                  次へ ▼
                </button>
              )}
              {/* コメント欄 */}
              {postId && onComment && (
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
                    className="flex-1 bg-gray-700/80 border border-gray-600 rounded-full px-3 py-1.5 text-xs text-white outline-none placeholder:text-gray-500"
                  />
                  <button
                    type="submit"
                    disabled={!commentText.trim()}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-full text-xs text-white font-bold shrink-0"
                  >
                    送信
                  </button>
                </form>
              )}
            </div>
          ) : (
            <>
              {/* ── タブバー：基本3つ＋詳細▼ で圧迫感を抑える ── */}
              <div className="flex border-b border-gray-800 shrink-0 overflow-x-auto">
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

                {/* 詳細トグル */}
                <button
                  onClick={() => {
                    setShowAdvancedTabs(v => {
                      // 詳細を閉じるとき、詳細タブを選択中なら基本に戻す
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
                {/* ── MAP ── */}
                {editorTab === 'map' && (
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
                                {tile.imageUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={tile.imageUrl} alt="" className="w-full h-full object-cover" />}
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
                            <div className="flex items-center gap-2 text-[9px] text-gray-400 bg-gray-800 rounded px-2 py-1 border border-gray-700">
                              <span className="truncate flex-1">{refLabel(gameData.titleScreen.bgmRef)}</span>
                              <button onClick={() => updTitle({ bgmRef: undefined })} className="shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={16} /></button>
                            </div>
                          )}
                          {/* メニュー項目 */}
                          <p className="text-[10px] text-gray-400 font-bold mt-1">メニュー項目</p>
                          {gameData.titleScreen.menu.map((mi, i) => (
                            <div key={i} className="flex items-center gap-1">
                              <span className="text-[9px] text-gray-500 w-14 shrink-0">{SCREEN_MENU_LABELS[mi.kind]}</span>
                              <input value={mi.label} onChange={e => updTitle({ menu: gameData.titleScreen!.menu.map((m, j) => j === i ? { ...m, label: e.target.value } : m) })}
                                className="flex-1 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-gray-200 outline-none" />
                              <button onClick={() => updTitle({ menu: gameData.titleScreen!.menu.filter((_, j) => j !== i) })} className="shrink-0 grid place-items-center w-8 h-8 -my-1 rounded-lg text-red-400 hover:text-red-300 active:bg-red-500/20 text-sm">✕</button>
                            </div>
                          ))}
                          <div className="flex gap-1 flex-wrap">
                            {(['newGame', 'continue', 'nameInput'] as ScreenMenuKind[]).map(k => (
                              <button key={k} onClick={() => addMenuItem(k)} className="inline-flex items-center text-[11px] text-blue-400 border border-blue-500/40 rounded-md px-3 py-1.5 hover:bg-blue-500/10 active:bg-blue-500/20">+ {SCREEN_MENU_LABELS[k]}</button>
                            ))}
                          </div>
                          <p className="text-[9px] text-gray-500">※「つづきから」は現状スタブ（はじめからと同じ挙動）です。</p>
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
                            <div className="flex items-center gap-2 text-[9px] text-gray-400 bg-gray-800 rounded px-2 py-1 border border-gray-700">
                              <span className="truncate flex-1">{refLabel(gameData.ending.bgmRef)}</span>
                              <button onClick={() => updEnding({ bgmRef: undefined })} className="shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={16} /></button>
                            </div>
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
                              </div>
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
                      <span className="text-2xl shrink-0">
                        {gameData.player.spriteUrl
                          ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={gameData.player.spriteUrl} alt="" className="w-8 h-8 object-contain" style={{ imageRendering: 'pixelated' }} />
                          : gameData.player.emoji}
                      </span>
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
                          {gameData.player.spriteUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={gameData.player.spriteUrl} alt="" className="w-6 h-6 object-contain" style={{ imageRendering: 'pixelated' }} />}
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
                          {obj.spriteUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={obj.spriteUrl} alt="" className="w-5 h-5 object-contain shrink-0" style={{ imageRendering: 'pixelated' }} />}
                          <span className="truncate flex-1">{refLabel(obj.spriteRef)}</span>
                          <button onClick={() => updObj({ spriteRef: undefined, spriteUrl: undefined })} className="shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={16} /></button>
                        </div>
                      )}
                    </>
                  ) : null;

                  return (
                    <div className="space-y-3">
                      {/* サブタブナビ */}
                      <div className="flex border-b border-gray-700 -mx-3 overflow-x-auto">
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
                                {gameData.player.spriteUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={gameData.player.spriteUrl} alt="" className="w-6 h-6 object-contain" style={{ imageRendering: 'pixelated' }} />}
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
                                      {o.spriteUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={o.spriteUrl} alt="" className="w-5 h-5 object-contain shrink-0" style={{ imageRendering: 'pixelated' }} /> : <span className="text-base leading-none shrink-0">{o.emoji}</span>}
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
                        <div className="mt-1 flex items-center gap-2">
                          <button onClick={() => previewMmlAsset('bgm', gameData.bgm)} className="px-2.5 py-1.5 rounded-md text-[11px] text-emerald-300 hover:text-emerald-200 active:bg-emerald-500/15">試聴</button>
                          <button onClick={() => setGameData(p => ({ ...p, bgm: undefined }))} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] text-gray-400 hover:text-red-400 active:bg-red-500/15"><Trash2 size={13} />外す</button>
                        </div>
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
                          <div className="mt-1 flex items-center gap-2">
                            <button onClick={() => previewMmlAsset('battleBgm', gameData.battleBgm)} className="px-2.5 py-1.5 rounded-md text-[11px] text-emerald-300 hover:text-emerald-200 active:bg-emerald-500/15">試聴</button>
                            <button onClick={() => setGameData(p => ({ ...p, battleBgm: undefined }))} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] text-gray-400 hover:text-red-400 active:bg-red-500/15"><Trash2 size={13} />外す</button>
                          </div>
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
                          <div className="mt-1 flex items-center gap-2">
                            <button onClick={() => previewMmlAsset('bossBgm', gameData.bossBgm)} className="px-2.5 py-1.5 rounded-md text-[11px] text-emerald-300 hover:text-emerald-200 active:bg-emerald-500/15">試聴</button>
                            <button onClick={() => setGameData(p => ({ ...p, bossBgm: undefined }))} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] text-gray-400 hover:text-red-400 active:bg-red-500/15"><Trash2 size={13} />外す</button>
                          </div>
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
                          <div key={trig} className="flex items-center gap-2 bg-gray-900 rounded-lg px-2 py-1.5 border border-gray-800">
                            <span className="text-[10px] text-gray-400 w-20 shrink-0">{SFX_LABELS[trig]}</span>
                            <button onClick={() => setPicker({ mode: 'bgm', target: { t: 'sfx', trigger: trig } })} className="flex-1 min-w-0 text-left text-[10px] text-gray-300 truncate">{gameData.sfx[trig] ? refLabel(gameData.sfx[trig]!.ref) : '未設定'}</button>
                            {gameData.sfx[trig] && <button onClick={() => previewMmlAsset(`sfx-${trig}`, gameData.sfx[trig])} className="shrink-0 px-2.5 py-1.5 rounded-md text-[11px] text-emerald-300 hover:text-emerald-200 active:bg-emerald-500/15">試聴</button>}
                            {gameData.sfx[trig] && <button onClick={() => setGameData(p => { const s = { ...p.sfx }; delete s[trig]; return { ...p, sfx: s }; })} className="shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={16} /></button>}
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-600 mt-1.5">MML推奨（即時再生）。MP3直リンクはURLタブで入力。</p>
                    </div>
                  </div>
                )}

                {/* ── ASSET ── */}
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
                              {tile.imageUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={tile.imageUrl} alt="" className="w-full h-full object-cover" />}
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
        <ContentPicker mode={picker.mode} userId={userId} onPick={applyPick} onClose={() => setPicker(null)} />
      )}
    </div>
  );
}

// ── イベントページエディタ ──

const COMMAND_LABELS: Record<EventCommand['type'], string> = {
  message: 'メッセージ', choice: '選択肢', ifSwitch: 'スイッチ条件分岐', ifItem: 'アイテム条件分岐',
  setSwitch: 'スイッチ変更', setSelfSwitch: 'セルフスイッチ', giveItem: 'アイテム入手', removeItem: 'アイテム削除',
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
        case 'warp': return { type: 'warp', col: 0, row: 0 };
        case 'wait': return { type: 'wait', frames: 30 };
        case 'comment': return { type: 'comment', text: '' };
        case 'label': return { type: 'label', name: '' };
        case 'jump': return { type: 'jump', label: '' };
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
