'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, RotateCcw, Smartphone, Image as ImageIcon, Music, Trash2, Save, Plus, Volume2 } from 'lucide-react';
import { bgmManager } from '@/lib/BgmManager';
import { bgmRefToAsset, refLabel } from '@/lib/asset-ref';
import { mmlToNotes, playMml } from '@/lib/mml';
import ContentPicker, { type PickResult } from './ContentPicker';

import {
  TILE_SIZE, COLS, ROWS, PLAY_W, PLAY_H,
  uid, newObject,
  SPELL_PALETTE,
  type SpellBlock,
  type DialogueLine,
  type StagePhase,
  type PresetId, type EngineKind, type NpcBehavior, type BulletType, type SfxTrigger,
  type ObjectKind, type TileDef, type SfxRef, type ObjectDef, type PresetData,
  type ObjType, type WarpTarget,
  type BattleMove, type SwitchDef, type ItemDef,
  type EventCommand, type EventPage, type EventCondition,
} from './game-presets/shared';
import { PRESETS, PRESET_ORDER } from './game-presets';
import SpellEditor, { defaultBlock } from './SpellEditor';
import DialogueCutscene from './DialogueCutscene';
import { parseMiniScript, runMiniScript, type MiniEnv } from './MiniScriptVM';

export type { PresetId };

type EditorTab = 'map' | 'object' | 'char' | 'asset' | 'spell';

/** 保存用マニフェスト（テキスト/参照のみ）。docs/game-feature-design.md §4 */
export interface GameManifestDraft {
  preset: PresetId; engine: EngineKind; name: string; gravity: number; friction: number;
  player: { emoji: string; color: string; speed: number; jumpPower: number; w: number; h: number; start: { x: number; y: number }; spriteRef?: string };
  tiles: Record<number, { name: string; color: string; passable: boolean; special?: string; imageRef?: string }>;
  map: number[][];
  objects: Array<Omit<ObjectDef, 'spriteUrl'>>;
  bgm: string;
  sfx: Partial<Record<SfxTrigger, string>>;
  scroll?: { worldCols: number; worldRows?: number };
  switches?: SwitchDef[];
  items?: ItemDef[];
  phases?: StagePhase[];
}

const YT_BGM = 'https://www.youtube.com/watch?v=0_jEpB40aYw';

const BEHAVIOR_LABELS: Record<NpcBehavior, string> = { still: '静止', random: 'ランダム', chase: '追尾', flee: '逃走', patrolH: '左右往復', patrolV: '上下往復' };
const BULLET_LABELS: Record<BulletType, string> = { none: 'なし', aimed: '狙い弾', spread: '拡散', spiral: '回転' };
const OBJECT_KIND_LABELS: Record<ObjectKind, string> = { npc: 'NPC / 敵', tile: 'タイル', bullet: '弾 / 攻撃' };
const OBJTYPE_LABELS: Record<ObjType, string> = { enemy: '敵', npc: 'NPC', item: 'アイテム', warp: 'ワープ', event: 'イベント' };
const SFX_LABELS: Record<SfxTrigger, string> = { jump: 'ジャンプ', shot: 'ショット', clear: 'クリア', damage: 'ミス/被弾' };

const clone = (d: PresetData): PresetData => JSON.parse(JSON.stringify(d));

/** ワールド幅（列数）を変更する。各行を拡縮し、scroll を更新。COLS と同じなら scroll を外す。 */
const resizeWorld = (d: PresetData, cols: number): PresetData => {
  const w = Math.max(COLS, Math.round(cols));
  const map = d.map.map(row => {
    const next = row.slice(0, w);
    while (next.length < w) next.push(0);
    return next;
  });
  return { ...d, map, scroll: w > COLS ? { worldCols: w } : undefined };
};

function playSfx(s?: SfxRef) {
  if (!s || !s.src || s.type !== 'mml') return; // youtube SFXは即時再生に不向きなので参照保持のみ
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
  spellState?: SpellExecState;
  moveTarget?: MoveTarget;
  scriptCtx?: { cancelled: boolean };
}
interface Bullet { x: number; y: number; w: number; h: number; vy: number; }
interface EnemyBullet { x: number; y: number; vx: number; vy: number; r: number; color: string; }

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
  | { t: 'player' } | { t: 'bgm' } | { t: 'tile'; id: number }
  | { t: 'sfx'; trigger: SfxTrigger } | { t: 'objsprite' };

export default function GameMaker({ onClose, userId, onSave, initialManifest, playOnly, embedded, ghostPlayers, onPositionChange, postId, danmakuComments, onComment }: GameMakerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [presetId, setPresetId] = useState<PresetId>('dq');
  const [gameData, setGameData] = useState<PresetData>(() => clone(PRESETS.dq));
  const [title, setTitle] = useState(PRESETS.dq.name);
  const [isPlaying, setIsPlaying] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>('map');
  const [selectedTileId, setSelectedTileId] = useState(1);
  const [objTemplate, setObjTemplate] = useState<ObjectDef>(() => newObject());
  const [editSpeedMult, setEditSpeedMult] = useState(1);
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
  const isPlayerDeadRef = useRef(false); // 残機制：死亡→復帰待ち中
  const livesRef = useRef(3);            // 残機数
  const scoreRef = useRef(0);            // スコア

  const bossDefeatedRef = useRef(false);
  const bossWarnRef = useRef(false);    // ゴールでのボス未撃破警告を一度だけ出す
  /** 現在のフェーズインデックス（phases 定義時）。-1=未開始 */
  const phaseIndexRef = useRef(-1);
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
  const [, forceHud] = useState(0);

  const calcDmg = (atk: number, def: number) => Math.max(1, Math.round((atk - def / 2) * (0.85 + Math.random() * 0.3)));
  const appendLog = (line: string, patch: Partial<BattleView> = {}) =>
    setBattle(v => (v ? { ...v, enemyHp: battleRef.current.enemyHp, log: [...v.log, line].slice(-6), ...patch } : v));

  const beginBattle = (opts: { name: string; emoji: string; hp: number; atk: number; def: number; exp: number; moves?: { name: string; power: number; heal?: boolean }[]; entity?: Entity | null; isBoss?: boolean }) => {
    battleRef.current = {
      active: true, entity: opts.entity ?? null, enemyName: opts.name, enemyHp: opts.hp, enemyMaxHp: opts.hp,
      enemyAtk: opts.atk, enemyDef: opts.def, enemyMoves: opts.moves ?? [], exp: opts.exp, isBoss: !!opts.isBoss,
    };
    setBattle({ enemyName: opts.name, enemyEmoji: opts.emoji, enemyHp: opts.hp, enemyMaxHp: opts.hp, log: [`${opts.name}が あらわれた！`], canAct: true, over: false });
  };
  // シンボルエンカウント（フィールド上の敵に接触）。ボスにも使う。
  const startBattle = (e: Entity) => {
    const d = e.def;
    beginBattle({ name: d.name ?? 'てき', emoji: d.emoji, hp: d.hp, atk: d.atk ?? Math.round(d.hp), def: d.def ?? Math.round(d.hp * 0.4), exp: d.exp ?? Math.round(d.hp * 1.5), moves: d.moves, entity: e, isBoss: d.isBoss });
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
      playSfx(sfxRef.current.damage); showGameMsg('ゲームオーバー…', 'timed', () => setIsPlaying(false));
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
      if (result === 'win' && wasBoss) { playSfx(sfxRef.current.clear); showGameMsg('🎉 クリア！', 'timed', () => setIsPlaying(false)); }
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
    appendLog(`${gameData.battle?.playerName ?? '勇者'}の こうげき！ ${dmg}のダメージ`, { canAct: false });
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
    const pending = pendingPhaseRef.current;
    const wasOutro = outroModeRef.current;
    outroModeRef.current = false;
    if (pending === null) return;
    pendingPhaseRef.current = null;
    const eng = engineRef.current;
    eng.bullets = []; eng.enemyBullets = [];

    // outro 完了後の -1 → クリア
    if (pending === -1) {
      playSfx(sfxRef.current.clear);
      showGameMsg('🎉 クリア！', 'timed', () => setIsPlaying(false));
      return;
    }

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
    const entities: Entity[] = (gameData.objects ?? [])
      .filter(o => (o.phase ?? 0) === pending)
      .map(o => ({
        def: o, x: o.col * TILE_SIZE,
        y: (gameData.engine === 'touhou' && !o.isBoss) ? -TILE_SIZE * 2 : o.row * TILE_SIZE,
        homeX: o.col * TILE_SIZE, homeY: o.row * TILE_SIZE,
        hp: o.hp, timer: 0, vx: 0, vy: 0, talked: false,
        spellState: o.spellScript?.length
          ? { stack: [{ script: o.spellScript, ip: 0, timesLeft: -1 }], frame: 0, waitLeft: 0 }
          : undefined,
      }));
    entities.forEach(e => { if (e.def.miniScript) runEntityScript(e.def.miniScript, e, eng, () => eng.player); });
    eng.entities = entities;
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

  const previewMmlAsset = useCallback((_key: string, asset?: { src?: string; type?: 'youtube' | 'mml' }) => {
    previewStopRef.current?.();
    previewStopRef.current = null;
    if (!asset?.src || asset.type !== 'mml') return;
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
  }, [gameData, objTemplate, ensureImage]);

  const resetGame = useCallback((id: PresetId) => {
    const data = clone(PRESETS[id]);
    setPresetId(id);
    setGameData(data);
    setTitle(PRESETS[id].name);
    const eng = engineRef.current;
    eng.player = { ...data.player.start, vx: 0, vy: 0, isGrounded: false };
    eng.keys.clear();
    eng.bullets = []; eng.enemyBullets = []; eng.entities = [];
    eng.map = JSON.parse(JSON.stringify(data.map));
    const sw = data.scroll?.worldCols ?? COLS; const sh = data.scroll?.worldRows ?? ROWS;
    setEditScroll(Math.max(0, Math.min(sw * TILE_SIZE - PLAY_W, data.player.start.x + data.player.w / 2 - PLAY_W / 2)));
    setEditScrollY(Math.max(0, Math.min(sh * TILE_SIZE - PLAY_H, data.player.start.y + data.player.h / 2 - PLAY_H / 2)));
    setIsPlaying(false); setSelectedObjId(null);
  }, []);

  const restart = useCallback(() => {
    const eng = engineRef.current;
    eng.player = { ...gameData.player.start, vx: 0, vy: 0, isGrounded: false };
    eng.keys.clear();
    eng.bullets = []; eng.enemyBullets = []; eng.entities = [];
    setIsPlaying(false); setSelectedObjId(null);
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
        battle: base.battle,
        bgm: initialManifest.bgm && initialManifest.bgm !== 'none'
          ? { ref: initialManifest.bgm }
          : undefined,
        sfx: Object.fromEntries(
          Object.entries(initialManifest.sfx).map(([k, v]) => [k, v ? { ref: v } : undefined])
        ) as PresetData['sfx'],
      };
      setPresetId(preset);
      setGameData(data);
      setTitle(initialManifest.name);
      const eng = engineRef.current;
      eng.player = { ...data.player.start, vx: 0, vy: 0, isGrounded: false };
      eng.map = JSON.parse(JSON.stringify(data.map));
      if (playOnly) setIsPlaying(true);
    } else {
      resetGame('dq');
    }
  }, [initialManifest, playOnly, resetGame]);

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
          eng.entities = spawnEntities(gameData.objects.filter(o => (o.phase ?? 0) === 0).map(makeEntity));
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
      invulnRef.current = 0; isPlayerDeadRef.current = false; livesRef.current = 3; scoreRef.current = 0;
      bossDefeatedRef.current = false; bossWarnRef.current = false; outroModeRef.current = false;
      setActiveDialogue(null);
      setBattle(null);
      setSwitchVals({}); switchValsRef.current = {};
      setInventory({}); inventoryRef.current = {};
      selfSwitchesRef.current = {};
      eventRunningRef.current = false;
    } else {
      eng.map = gameData.map;
      eng.entities = [];
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

    const drawSprite = (def: { emoji: string; spriteUrl?: string }, x: number, y: number, w: number, h: number) => {
      const img = def.spriteUrl ? imgCache.current.get(def.spriteUrl) : undefined;
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, x, y, w, h);
      } else {
        ctx.font = `${w}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(def.emoji, x + w / 2, y + h + 4);
      }
    };

    const win = () => { playSfx(sfxRef.current.clear); showGameMsg('🎉 クリア！', 'timed', () => setIsPlaying(false)); };
    const lose = (msg: string) => { playSfx(sfxRef.current.damage); showGameMsg(msg, 'timed', () => setIsPlaying(false)); };

    // 残機制：touhou 専用の死亡ハンドラ
    const handlePlayerDeath = () => {
      const eng = engineRef.current;
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
          engineRef.current.enemyBullets = [];
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

      // ── player movement (both modes, paused during battle) ──
      if (!battleRef.current.active) {
        if (!isPlaying) {
          p.vx = 0; p.vy = 0; p.isGrounded = false;
          const es = pData.speed * editSpeedMult;
          if (isLeft) p.x -= es; if (isRight) p.x += es;
          if (isUp) p.y -= es; if (isDown) p.y += es;
          p.x = Math.max(0, Math.min(worldW - pData.w, p.x));
          p.y = Math.max(0, Math.min(worldH - pData.h, p.y));
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
          if (p.y > worldH && isPlaying) { lose('ミス！'); dead = true; }
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

          // touhou shooting: play mode only（死亡中は撃たない）
          if (!dead && !isPlayerDeadRef.current && gameData.engine === 'touhou') {
            eng.shotTimer++;
            if (eng.shotTimer > 6) {
              eng.bullets.push({ x: p.x + pData.w / 2 - 4, y: p.y, w: 8, h: 16, vy: -12 });
              eng.shotTimer = 0; playSfx(sfxRef.current.shot);
            }
            for (let i = eng.bullets.length - 1; i >= 0; i--) {
              eng.bullets[i].y += eng.bullets[i].vy;
              if (eng.bullets[i].y < 0) eng.bullets.splice(i, 1);
            }
          }
        }
      }

      // 位置変化を通知（play only）
      if (isPlaying && onPositionChangeRef.current) onPositionChangeRef.current(p.x, p.y, pData.emoji);

      // ── play mode: entities / combat / win ──
      if (isPlaying && !battleRef.current.active) {
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
                // スコア加算（ボス100点、雑魚10点）
                scoreRef.current += d.isBoss ? 100 : 10;
                eng.entities.splice(ei, 1); break;
              }
            }
          }
          if (e.hp <= 0) continue;

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
              if (gameData.engine === 'rpg' && gameData.battle) { if (invulnRef.current <= 0) { startBattle(e); dead = true; } break; }
              if (gameData.engine === 'touhou') { if (!isPlayerDeadRef.current && invulnRef.current <= 0) { handlePlayerDeath(); dead = true; } break; }
              lose('ミス！'); dead = true; break;
            }
            else if (d.message && !e.talked) { e.talked = true; showGameMsg(d.message, 'instant', () => {}); }
          } else if (!d.hazard && !d.pages) { e.talked = false; }
        }

        if (!dead) {
          const core = gameData.engine === 'touhou' ? 3 : 8;
          for (let i = eng.enemyBullets.length - 1; i >= 0; i--) {
            const eb = eng.enemyBullets[i]; eb.x += eb.vx; eb.y += eb.vy;
            if (eb.x < -10 || eb.x > worldW + 10 || eb.y < -10 || eb.y > worldH + 10) { eng.enemyBullets.splice(i, 1); continue; }
            // 死亡中・無敵中は被弾しない
            if (!isPlayerDeadRef.current && invulnRef.current <= 0 && Math.hypot(eb.x - pcx, eb.y - pcy) < eb.r + core) {
              if (gameData.engine === 'rpg' && gameData.battle) {
                eng.enemyBullets.splice(i, 1);
                progressRef.current.hp -= 6; invulnRef.current = 45; forceHud(n => n + 1);
                if (progressRef.current.hp <= 0) { lose('やられた…'); dead = true; break; }
                continue;
              }
              if (gameData.engine === 'touhou') { handlePlayerDeath(); dead = true; break; }
              lose('ミス！'); dead = true; break;
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
                if (invulnRef.current <= 0) { beginBattle({ name: boss.name, emoji: boss.emoji, hp: boss.hp, atk: boss.atk, def: boss.def, exp: boss.exp, entity: null, isBoss: true }); dead = true; }
              } else if (symbolBossLeft) {
                if (!bossWarnRef.current) { bossWarnRef.current = true; showGameMsg('まだ強敵がいる！倒してから来るのだ！', 'instant', () => {}); }
              } else win();
            }
            else if (center?.info?.special === 'trap') { lose('ミス！'); dead = true; }
            else bossWarnRef.current = false;
          } else if (gameData.engine === 'touhou') {
            // フェーズシステム（dialogue 表示中はエンティティが 0 でもスキップ）
            const phases = gameData.phases;
            if (
              eng.entities.length === 0 &&
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
                  win();
                } else {
                  const nextPhase = phases[nextIdx];
                  if (nextPhase?.dialogue?.length) {
                    pendingPhaseRef.current = nextIdx;
                    setActiveDialogue(nextPhase.dialogue);
                  } else {
                    const nextEntities: Entity[] = gameData.objects
                      .filter(o => (o.phase ?? 0) === nextIdx)
                      .map(o => ({
                        def: o, x: o.col * TILE_SIZE,
                        y: (gameData.engine === 'touhou' && !o.isBoss) ? -TILE_SIZE * 2 : o.row * TILE_SIZE,
                        homeX: o.col * TILE_SIZE, homeY: o.row * TILE_SIZE,
                        hp: o.hp, timer: 0, vx: 0, vy: 0, talked: false,
                        spellState: o.spellScript?.length
                          ? { stack: [{ script: o.spellScript, ip: 0, timesLeft: -1 }], frame: 0, waitLeft: 0 }
                          : undefined,
                      }));
                    nextEntities.forEach(e => { if (e.def.miniScript) runEntityScript(e.def.miniScript, e, eng, () => eng.player); });
                    eng.entities = nextEntities;
                    phaseIndexRef.current = nextIdx;
                  }
                }
              }
            }
          }
        }
      }

      // ── action key: trigger event/message on overlapping object ──
      if (isAction && !prevActionRef.current && !battleRef.current.active && !eventRunningRef.current) {
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

      // カメラ：プレイ中はプレイヤー中心に追従、編集中も同様（編集スクロールは初期位置用）
      const camX = Math.max(0, Math.min(camMax,
        isPlaying || p.x !== gameData.player.start.x
          ? p.x + pData.w / 2 - PLAY_W / 2
          : editScrollRef.current));
      const camY = Math.max(0, Math.min(camMaxY,
        isPlaying || p.y !== gameData.player.start.y
          ? p.y + pData.h / 2 - PLAY_H / 2
          : editScrollYRef.current));
      ctx.save();
      ctx.translate(-camX, -camY);

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

      // objects (play: from entities, edit: from data)
      if (isPlaying) {
        for (const e of eng.entities) {
          drawSprite({ emoji: e.def.emoji, spriteUrl: e.def.spriteUrl }, e.x, e.y, TILE_SIZE, TILE_SIZE);
          if (e.def.hp > 1) { ctx.fillStyle = 'red'; ctx.fillRect(e.x, e.y - 5, TILE_SIZE * (e.hp / e.def.hp), 3); }
        }
        ctx.fillStyle = 'yellow';
        for (const b of eng.bullets) ctx.fillRect(b.x, b.y, b.w, b.h);
        for (const eb of eng.enemyBullets) {
          if (gameData.engine === 'touhou') {
            // touhou.html スタイルのダイヤモンド弾
            ctx.save();
            ctx.translate(eb.x, eb.y);
            ctx.rotate(Math.atan2(eb.vy, eb.vx));
            ctx.fillStyle = eb.color;
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = 0.5;
            const s = eb.r * 1.1;
            ctx.beginPath();
            ctx.moveTo(s * 1.2, 0); ctx.lineTo(0, -s * 0.85);
            ctx.lineTo(-s * 1.2, 0); ctx.lineTo(0, s * 0.85);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.beginPath(); ctx.arc(0, 0, s * 0.32, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          } else {
            ctx.fillStyle = eb.color; ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r * 0.5, 0, Math.PI * 2); ctx.fill();
          }
        }
      } else {
        for (const o of gameData.objects) {
          drawSprite({ emoji: o.emoji, spriteUrl: o.spriteUrl }, o.col * TILE_SIZE, o.row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
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
        drawSprite({ emoji: pData.emoji, spriteUrl: pData.spriteUrl }, p.x, p.y, pData.w, pData.h);
      }
      if (gameData.engine === 'touhou' && isPlaying) {
        const cx = p.x + pData.w / 2, cy = p.y + pData.h / 2;
        const isSlow2 = engineRef.current.keys.has('Shift') || touchRef.current.slow;
        if (isSlow2) {
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke();
        }
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
          ctx.fillStyle = '#5bd1ff';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          ctx.fillText(boss.def.name ?? boss.def.emoji, barX + 4, barY + barH + 12);
        }
      }

      // ── 戦闘プレイヤーHUD（Lv / HP / MP）──
      if (isPlaying && gameData.engine === 'rpg' && gameData.battle) {
        const pr = progressRef.current;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(6, 6, 150, 50);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(6, 6, 150, 50);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(`Lv ${pr.level}  ${gameData.battle.playerName}`, 12, 22);
        ctx.fillText(`HP ${Math.max(0, pr.hp)}/${pr.maxHp}`, 12, 38);
        ctx.fillStyle = '#7fd0ff'; ctx.fillText(`MP ${pr.mp}/${pr.maxMp}`, 12, 52);
      }



      eng.animId = requestAnimationFrame(loop);
    };

    const id = requestAnimationFrame(loop);
    engineRef.current.animId = id;
    return () => { cancelAnimationFrame(engineRef.current.animId); cancelAnimationFrame(id); window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [gameData, isPlaying, restart, editorTab, editSpeedMult]);

  // touch state via ref to avoid re-running the loop effect
  const touchRef = useRef({ up: false, down: false, left: false, right: false, action: false, slow: false });
  const prevActionRef = useRef(false);
  const prevZRef = useRef(false);
  const prevXRef = useRef(false);
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
      const type = res.ref.startsWith('mml:') ? 'mml' as const : 'youtube' as const;
      const src = type === 'mml' ? (res.rawMml || res.ref.replace(/^mml:/, '')) : res.url;
      return { ref: res.ref, src, type };
    };
    if (target.t === 'player') setGameData(p => ({ ...p, player: { ...p.player, spriteRef: res.ref, spriteUrl: res.url } }));
    else if (target.t === 'objsprite') setObjTemplate(o => ({ ...o, spriteRef: res.ref, spriteUrl: res.url }));
    else if (target.t === 'bgm') setGameData(p => ({ ...p, bgm: bgmLike() }));
    else if (target.t === 'sfx') setGameData(p => ({ ...p, sfx: { ...p.sfx, [target.trigger]: bgmLike() } }));
    else if (target.t === 'tile') setGameData(p => ({ ...p, tiles: { ...p.tiles, [target.id]: { ...p.tiles[target.id], imageRef: res.ref, imageUrl: res.url } } }));
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
    },
    tiles: Object.fromEntries(Object.entries(gameData.tiles).map(([k, t]) => [k, {
      name: t.name, color: t.color, passable: t.passable, special: t.special, imageRef: t.imageRef,
    }])),
    map: gameData.map,
    objects: gameData.objects.map(({ spriteUrl, ...o }) => o),
    scroll: gameData.scroll,
    bgm: gameData.bgm?.ref || 'none',
    sfx: Object.fromEntries(Object.entries(gameData.sfx).map(([k, v]) => [k, v?.ref])) as Partial<Record<SfxTrigger, string>>,
    switches: gameData.switches,
    items: gameData.items,
    phases: gameData.phases,
  });

  const handleSave = () => onSave?.(buildManifest(), { title: title.trim() || gameData.name, preset: gameData.id });

  const tpl = objTemplate;
  const setTpl = (patch: Partial<ObjectDef>) => setObjTemplate(o => ({ ...o, ...patch }));
  const selObj = selectedObjId ? gameData.objects.find(o => o.id === selectedObjId) ?? null : null;
  const updObj = (patch: Partial<ObjectDef>) => { if (!selectedObjId) return; setGameData(p => ({ ...p, objects: p.objects.map(o => o.id === selectedObjId ? { ...o, ...patch } : o) })); };
  const delObj = () => { if (!selectedObjId) return; setGameData(p => ({ ...p, objects: p.objects.filter(o => o.id !== selectedObjId) })); setSelectedObjId(null); };
  const moveObj = (dc: number, dr: number) => { if (!selectedObjId) return; setGameData(p => ({ ...p, objects: p.objects.map(o => o.id === selectedObjId ? { ...o, col: o.col + dc, row: o.row + dr } : o) })); };
  const placeObj = () => { const p = engineRef.current.player; setGameData(prev => ({ ...prev, objects: [...prev.objects, { ...objTemplate, id: uid(), col: Math.floor((p.x + 12) / TILE_SIZE), row: Math.floor((p.y + 12) / TILE_SIZE) }] })); };

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
          <button onClick={restart} className="p-2 text-gray-400 hover:text-white rounded-full bg-gray-700/50" title="リスタート"><RotateCcw size={14} /></button>
          <button onClick={() => {
            if (isPlaying) { setGameMsg(null); setBattle(null); setEventChoice(null); setPicker(null); battleRef.current = { active: false, entity: null, enemyName: '', enemyHp: 0, enemyMaxHp: 0, enemyAtk: 0, enemyDef: 0, enemyMoves: [], exp: 0, isBoss: false }; eventRunningRef.current = false; invulnRef.current = 0; const pp = engineRef.current.player; const pw = gameData.player.w, ph = gameData.player.h; setEditScroll(Math.max(0, Math.min(((gameData.scroll?.worldCols ?? COLS) * TILE_SIZE - PLAY_W), pp.x + pw / 2 - PLAY_W / 2))); setEditScrollY(Math.max(0, Math.min(((gameData.scroll?.worldRows ?? ROWS) * TILE_SIZE - PLAY_H), pp.y + ph / 2 - PLAY_H / 2))); }
            if (!isPlaying) setActivePreviewKey(null);
            setIsPlaying(p => !p);
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
              onTouchStart={handleCanvasAction}
              onTouchMove={e => editorTab !== 'object' && handleCanvasAction(e)} />
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
                lines={activeDialogue}
                onComplete={onDialogueComplete}
              />
            )}

            {/* ── セリフプレビュー（最後に操作した行を常に表示） ── */}
            {(() => {
              if (!activePreviewKey) return null;
              const [piStr, diStr] = activePreviewKey.split('-');
              const line = gameData.phases?.[+piStr]?.dialogue?.[+diStr];
              return line ? (
                <DialogueCutscene
                  key={activePreviewKey}
                  lines={[line]}
                  onComplete={() => setActivePreviewKey(null)}
                />
              ) : null;
            })()}

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
                  <button className="w-16 h-16 rounded-full border-b-4 border-gray-800 active:border-b-0 active:translate-y-1 shadow-lg text-white font-bold text-xs bg-blue-600 active:bg-blue-500 touch-none cursor-pointer select-none"
                    {...padProps('action')}>
                    JUMP
                  </button>
                )}
                {gameData.engine === 'touhou' && (
                  <button className="w-14 h-12 rounded-full border border-purple-600 text-purple-300 font-bold text-[11px] touch-none cursor-pointer select-none active:bg-purple-900/50"
                    {...padProps('slow')}>
                    低速
                  </button>
                )}
              </div>
              </div>
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
              <div className="flex border-b border-gray-800 shrink-0 overflow-x-auto">
                {([
                  ['map', 'マップ'], ['object', 'オブジェクト'], ['char', 'キャラ'], ['asset', 'アセット'],
                  ...(gameData.engine === 'touhou' ? [['spell', '会話']] : []),
                ] as [EditorTab, string][]).map(([id, label]) => (
                  <button key={id} onClick={() => setEditorTab(id)}
                    className={`flex-none py-2.5 px-2 text-[10px] font-bold transition ${editorTab === id ? 'text-blue-400 border-b-2 border-blue-500 bg-[#0f0f11]' : 'text-gray-500'}`}>
                    {label}
                  </button>
                ))}
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
                          className="text-[10px] text-blue-400 border border-blue-700 rounded px-1.5 py-0.5 active:opacity-60">
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
                              className="text-red-500 text-[11px] px-1 active:opacity-60">✕</button>
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
                                      className="w-8 bg-gray-700 rounded px-1 py-0.5 text-[11px] text-center text-white outline-none" />
                                    <input value={dl.speaker}
                                      onChange={e => updDl({ speaker: e.target.value })}
                                      onFocus={activatePreview}
                                      placeholder="話者名"
                                      className="flex-1 bg-gray-700 rounded px-1 py-0.5 text-[10px] text-white outline-none" />
                                    <button onClick={() => {
                                      if (isActive) setActivePreviewKey(null);
                                      setGameData(p => ({
                                        ...p,
                                        phases: p.phases!.map((x, i) => i !== pi ? x : { ...x, dialogue: x.dialogue!.filter((_, j) => j !== di) })
                                      }));
                                    }} className="text-red-500 text-[10px] px-0.5 shrink-0">✕</button>
                                  </div>
                                  {/* 2行目：立ち絵 URL */}
                                  <input value={dl.imageSrc ?? ''}
                                    onChange={e => updDl({ imageSrc: e.target.value || undefined })}
                                    onFocus={activatePreview}
                                    placeholder="立ち絵URL (省略でemoji)"
                                    className="w-full bg-gray-700 rounded px-1.5 py-0.5 text-[9px] text-gray-300 outline-none" />
                                  {/* 3行目：位置・倍率（changeイベントで反映） */}
                                  <div className="flex gap-1 items-center flex-wrap">
                                    <span className="text-[9px] text-gray-500 shrink-0">位置</span>
                                    <label className="text-[9px] text-gray-400 flex items-center gap-0.5">
                                      X<input type="text" inputMode="numeric" defaultValue={dl.imageX ?? 0}
                                        onFocus={activatePreview}
                                        onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updDl({ imageX: v }); }}
                                        className="w-12 ml-0.5 bg-gray-700 rounded px-1 py-0.5 text-[9px] text-white outline-none" />
                                    </label>
                                    <label className="text-[9px] text-gray-400 flex items-center gap-0.5">
                                      Y<input type="text" inputMode="numeric" defaultValue={dl.imageY ?? 0}
                                        onFocus={activatePreview}
                                        onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updDl({ imageY: v }); }}
                                        className="w-12 ml-0.5 bg-gray-700 rounded px-1 py-0.5 text-[9px] text-white outline-none" />
                                    </label>
                                    <label className="text-[9px] text-gray-400 flex items-center gap-0.5 ml-2">
                                      倍率<input type="text" inputMode="decimal" defaultValue={dl.imageScale ?? 1}
                                        onFocus={activatePreview}
                                        onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updDl({ imageScale: v }); }}
                                        className="w-14 ml-0.5 bg-gray-700 rounded px-1 py-0.5 text-[9px] text-white outline-none" />
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
                            }} className="text-[10px] text-blue-400 active:opacity-60">+ セリフ追加</button>
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
                    <p className="text-[10px] text-gray-500 flex items-center gap-1"><Smartphone size={12} /> 選択して画面をタップ／ドラッグ</p>
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
                              {id !== 0 && <button onClick={() => deleteTile(id)} className="text-gray-500 hover:text-red-400 shrink-0"><Trash2 size={13} /></button>}
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
                            <button onClick={() => moveObj(0, -1)} className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-[9px] text-gray-300" title="上に移動">↑</button>
                            <button onClick={() => moveObj(0, 1)} className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-[9px] text-gray-300" title="下に移動">↓</button>
                            <button onClick={() => moveObj(-1, 0)} className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-[9px] text-gray-300" title="左に移動">←</button>
                            <button onClick={() => moveObj(1, 0)} className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-[9px] text-gray-300" title="右に移動">→</button>
                            <button onClick={() => { setSelectedObjId(null); }} className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-[9px] text-gray-300">解除</button>
                            <button onClick={delObj} className="px-1.5 py-0.5 bg-red-800 hover:bg-red-700 rounded text-[9px] text-white">削除</button>
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
                                <label className="text-[10px] text-gray-400 flex items-center gap-1">弾色<input type="color" value={selObj.bulletColor} onChange={e => updObj({ bulletColor: e.target.value })} className="w-6 h-6 rounded border border-gray-700 bg-transparent" /></label>
                              </div>
                            )}
                            <label className="flex items-center gap-1 text-[10px] text-gray-400"><input type="checkbox" checked={selObj.hazard} onChange={e => updObj({ hazard: e.target.checked })} className="accent-red-500" />接触でミス(敵)</label>
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
                          {tpl.spriteUrl && <button onClick={() => setTpl({ spriteRef: undefined, spriteUrl: undefined })} className="text-gray-500 hover:text-red-400"><Trash2 size={13} /></button>}
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
                                <label className="text-[10px] text-gray-400 flex items-center gap-1">弾色<input type="color" value={tpl.bulletColor} onChange={e => setTpl({ bulletColor: e.target.value })} className="w-6 h-6 rounded border border-gray-700 bg-transparent" /></label>
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

                {/* ── CHAR ── */}
                {editorTab === 'char' && (
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
                          <button onClick={() => setGameData(p => ({ ...p, player: { ...p.player, spriteRef: undefined, spriteUrl: undefined } }))} className="text-gray-500 hover:text-red-400"><Trash2 size={12} /></button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="flex justify-between text-[11px] text-gray-400 mb-1"><span>移動速度</span><span className="text-blue-400">{gameData.player.speed}</span></label>
                      <input type="range" min={1} max={10} step={0.5} value={gameData.player.speed} onChange={e => setGameData(p => ({ ...p, player: { ...p.player, speed: Number(e.target.value) } }))} className="w-full accent-blue-500" />
                    </div>
                    {gameData.engine === 'action' && (
                      <div>
                        <label className="flex justify-between text-[11px] text-gray-400 mb-1"><span>ジャンプ力</span><span className="text-blue-400">{gameData.player.jumpPower}</span></label>
                        <input type="range" min={-20} max={-5} step={1} value={gameData.player.jumpPower} onChange={e => setGameData(p => ({ ...p, player: { ...p.player, jumpPower: Number(e.target.value) } }))} className="w-full accent-blue-500" />
                      </div>
                    )}
                    {/* 横スクロール幅：action エンジン専用の固有パラメータ */}
                    {gameData.engine === 'action' && (
                      <div>
                        <label className="flex justify-between text-[11px] text-gray-400 mb-1"><span>ワールド幅（横スクロール / タイル数）</span><span className="text-blue-400">{gameData.scroll?.worldCols ?? COLS}</span></label>
                        <input type="range" min={COLS} max={80} step={1} value={gameData.scroll?.worldCols ?? COLS}
                          onChange={e => { const v = Number(e.target.value); setEditScroll(0); setGameData(p => resizeWorld(p, v)); }} className="w-full accent-blue-500" />
                        <p className="text-[10px] text-gray-500 mt-0.5">{COLS} で1画面固定。増やすとカメラ追従の横スクロールになります。</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── ASSET ── */}
                {editorTab === 'asset' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">タイトル</label>
                      <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200" />
                    </div>

                    <div>
                      <label className="flex text-[11px] text-gray-400 mb-1 items-center gap-1"><Music size={12} />BGM</label>
                      <button onClick={() => setPicker({ mode: 'bgm', target: { t: 'bgm' } })}
                        className="w-full flex items-center justify-between py-2 px-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[11px] text-gray-300">
                        <span className="truncate">{gameData.bgm ? refLabel(gameData.bgm.ref) : 'BGMを選択（YouTube / MML投稿 / 直接）'}</span>
                        <Music size={13} className="shrink-0 ml-1" />
                      </button>
                      {gameData.bgm && <div className="mt-1 flex items-center gap-2"> <button onClick={() => previewMmlAsset('bgm', gameData.bgm)} className="text-[10px] text-emerald-300 hover:text-emerald-200">試聴</button> <button onClick={() => setGameData(p => ({ ...p, bgm: undefined }))} className="text-[10px] text-gray-500 hover:text-red-400 flex items-center gap-1"><Trash2 size={11} />外す</button></div>}
                    </div>

                    <div>
                      <label className="flex text-[11px] text-gray-400 mb-1.5 items-center gap-1"><Volume2 size={12} />効果音(SE)</label>
                      <div className="space-y-1.5">
                        {(Object.keys(SFX_LABELS) as SfxTrigger[]).map(trig => (
                          <div key={trig} className="flex items-center gap-2 bg-gray-900 rounded-lg px-2 py-1.5 border border-gray-800">
                            <span className="text-[10px] text-gray-400 w-16 shrink-0">{SFX_LABELS[trig]}</span>
                            <button onClick={() => setPicker({ mode: 'bgm', target: { t: 'sfx', trigger: trig } })} className="flex-1 min-w-0 text-left text-[10px] text-gray-300 truncate">{gameData.sfx[trig] ? refLabel(gameData.sfx[trig]!.ref) : '未設定'}</button>
                            {gameData.sfx[trig] && <button onClick={() => previewMmlAsset(`sfx-${trig}`, gameData.sfx[trig])} className="text-[10px] text-emerald-300 hover:text-emerald-200 shrink-0">試聴</button>}
                            {gameData.sfx[trig] && <button onClick={() => setGameData(p => { const s = { ...p.sfx }; delete s[trig]; return { ...p, sfx: s }; })} className="text-gray-500 hover:text-red-400 shrink-0"><Trash2 size={12} /></button>}
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-600 mt-1.5">SEはMML推奨（即時再生）。YouTube参照はBGM向け。</p>
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
                            })} className="text-red-400 hover:text-red-300 text-[9px]">削除</button>
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
                            })} className="text-red-400 hover:text-red-300 text-[9px]">削除</button>
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
                            {tile.imageRef && <button onClick={() => setGameData(p => ({ ...p, tiles: { ...p.tiles, [id]: { ...p.tiles[Number(id)], imageRef: undefined, imageUrl: undefined } } }))} className="text-gray-500 hover:text-red-400"><Trash2 size={12} /></button>}
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
