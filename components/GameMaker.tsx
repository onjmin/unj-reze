'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync, createPortal } from 'react-dom';
import { X, Play, Pause, RotateCcw, Smartphone, Image as ImageIcon, Music, Trash2, Save, Plus, Volume2, Shield, ShieldOff, Download, Upload, Settings, History } from 'lucide-react';
import { bgmManager } from '@/lib/BgmManager';
import VolumeControl from '@/components/VolumeControl';
import { bgmRefToAsset, refLabel, parseWalkRef, imageRefToUrl, isImageRef, parseLoopFromRef, updateRefLoop, getLoopOption, getBgmVolume, parseBgmParams, updateRefBgmParams } from '@/lib/asset-ref';
import { applyMasterVolume } from '@/lib/master-volume';
import HistoryModal from './HistoryModal';
import { getStorageKey, getAutosave, saveAutosave, clearAutosave, saveHistory, HistoryItem } from '@/lib/history';
import { undertaleSfxUrl } from '@/lib/undertale-engine-sfx';
import { tldrSfxUrl, TLDR_UNDERTALE_SPRITE, TLDR_UI_SPRITES } from '@/lib/deltarune-tldr-assets';
import {
  detectStandard, standardById, animatedCell, animatedCellInRect, dirFromDelta, resolveSpriteRect,
  type WayKey, type WalkStandard,
} from '@/lib/walk-sprite';
import { smcFrameRect, smcFrameCount } from '@/lib/smc-sprite';
import ContentPicker, { type PickResult } from './ContentPicker';
import WalkSpritePreview from './WalkSpritePreview';
import { resolveSMCUrl, getSmcMetadata } from '@/lib/smc-helper';
import { segment } from '@/lib/tiny-segmenter';
import { parseRpgen } from '@/lib/rpgen-parser';
import { MINECRAFT_SKIN_PRESETS } from '@/lib/minecraft-model';

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
  type BattleMove, type SwitchDef, type ItemDef, type EquipmentDef, type BattleConfig, type UndertaleMode, type EnemyDialogueLine,
  type GrowthType, type StatGrowth, expToNextLevel,
  type PartySpell, type PartyMember, type BattleSpriteAnim, type PartyBattleSprites, type EnemyBattleSprite,
  type EffectPreset,
  type EventCommand, type EventPage, type EventCondition,
  type TitleScreenConfig, type EndingScreenConfig, type DeathScreenConfig, type DeathScreenStyle,
  defaultTitleScreen, defaultEndingScreen, defaultDeathScreen,
  type Layout25D, type Billboard25D,
  chest, SYSTEM_TILE_TEMPLATES, type SystemTileTemplate,
  SYS_TILE_WARP_SFX, SYS_TILE_DAMAGE_SFX, SYS_TILE_DOOR_SFX,
  convertMapToLayout25D, convertLayout25DToMap,
} from './game-presets/shared';
import type { SceneDef, SceneExit, EncounterGroup, EncounterEnemy } from './game-presets/shared';
import { PRESETS, PRESET_ORDER, PRESET_EMOJI, PRESET_TAGLINE } from './game-presets';
import SpellEditor, { defaultBlock } from './SpellEditor';
import DialogueCutscene, { type DialogueCutsceneHandle } from './DialogueCutscene';
import SpellCutscene from './SpellCutscene';
import { parseMiniScript, runMiniScript, type MiniEnv } from './MiniScriptVM';
import Yume25DMaker, { type Yume25DMakerHandle, type Yume25DTool, yume25dTexList } from './Yume25DMaker';
import Yume25DEditorPanel from './Yume25DEditorPanel';
import { generateTopDownTerrain, generateSideViewTerrain, type TerrainWater } from '@/lib/terrain-gen';

export type { PresetId };

/** ランダムエンカウントの抽選。encounterGroups があれば weight で重み付き抽選→グループ内は均等抽選、
 *  無ければ旧形式の randomEncounters から均等抽選する。 */
function pickRandomEncounter(groups: EncounterGroup[] | undefined, table: EncounterEnemy[] | undefined): EncounterEnemy | undefined {
  if (groups?.length) {
    const totalWeight = groups.reduce((sum, g) => sum + Math.max(0, g.weight ?? 1), 0);
    if (totalWeight > 0) {
      let r = Math.random() * totalWeight;
      const group = groups.find(g => (r -= Math.max(0, g.weight ?? 1)) < 0) ?? groups[groups.length - 1];
      return group.enemies[Math.floor(Math.random() * group.enemies.length)];
    }
  }
  if (table?.length) return table[Math.floor(Math.random() * table.length)];
  return undefined;
}

/** 主人公のレベルに応じて、まだ覚えていない（learnLevel未到達）戦闘コマンドを除いた一覧を返す。 */
function availableMoves(moves: BattleMove[], level: number): BattleMove[] {
  return moves.filter(m => (m.learnLevel ?? 1) <= level);
}

/** party[0]（レベル管理される主人公）の呪文だけ learnLevel でフィルタする。同行者は個別レベルを持たないため常に全て使える。 */
function availableSpells(spells: PartySpell[], memberIdx: number, level: number): PartySpell[] {
  return memberIdx === 0 ? spells.filter(s => (s.learnLevel ?? 1) <= level) : spells;
}

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

type EditorTab = 'map' | 'object' | 'char' | 'battle' | 'character' | 'switch' | 'item' | 'weapon' | 'armor' | 'spell' | 'sound' | 'screen' | 'scene' | 'effect';

/** 保存マニフェストは表示URLを持たないため、URL由来の参照(url:/walk:...:u:)だけロード時に復元する。
 *  post: 等の投稿参照は解決不能なので undefined のまま（従来挙動）。 */
const hydrateUrlFromRef = (ref?: string): string | undefined => {
  if (!ref) return undefined;
  const url = imageRefToUrl(ref);
  return url && (url.startsWith('http') || url.startsWith('/') || url.startsWith('data:')) ? url : undefined;
};

const hydrateBgmFromRef = (ref?: string): { ref: string; src?: string; type?: 'youtube' | 'mml' | 'direct' } | undefined => {
  if (!ref || ref === 'none') return undefined;
  const type = ref.startsWith('mml:') ? 'mml' : ref.startsWith('direct:') ? 'direct' : 'youtube';
  const src = type === 'mml' ? ref.replace(/^mml:/, '') : type === 'direct' ? ref.replace(/^direct:/, '') : `https://www.youtube.com/watch?v=${ref.replace(/^youtube:/, '')}`;
  return { ref, type, src };
};


/** 保存用マニフェスト（テキスト/参照のみ）。docs/game-feature-design.md §4 */
export interface GameManifestDraft {
  preset: PresetId; engine: EngineKind; name: string; gravity: number; friction: number;
  /** つるつる床の強制スライド速度（px/frame）。未指定時は既定値。 */
  iceSlideSpeed?: number;
  player: {
    emoji: string; color: string; speed: number; jumpPower: number; w: number; h: number; start: { x: number; y: number }; spriteRef?: string; minecraftSkin?: string;
    bombCount?: number; bombSpellName?: string; bombCutinCharName?: string; bombCutinImageUrl?: string; bombCutinImageX?: number; bombCutinImageY?: number; bombCutinScale?: number;
  };
  tiles: Record<number, {
    name: string; color: string; passable: boolean; special?: string; imageRef?: string; imageUrl?: string;
    warpSceneId?: string; warpEntryCol?: number; warpEntryRow?: number; damageAmount?: number
  }>;
  map: number[][];
  overlayMap?: number[][];
  overheadMap?: number[][];
  objects: Array<Omit<ObjectDef, 'spriteUrl'>>;
  bgm: string;
  battleBgm?: string;
  bossBgm?: string;
  sfx: Partial<Record<SfxTrigger, string>>;
  mapBgRef?: string;
  scroll?: { worldCols: number; worldRows?: number };
  switches?: SwitchDef[];
  items?: ItemDef[];
  weapons?: EquipmentDef[];
  armors?: EquipmentDef[];
  /** 汎用エフェクトアニメーション一覧。imageUrl は post: 参照の解決済みキャッシュのため保存しない。 */
  effects?: Array<Omit<EffectPreset, 'imageUrl'> & { imageUrl?: string }>;
  phases?: StagePhase[];
  titleScreen?: Omit<TitleScreenConfig, 'bgUrl'>;
  ending?: Omit<EndingScreenConfig, 'bgUrl'>;
  deathScreen?: DeathScreenConfig;
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
  overheadMap: number[][];
  layouts: Array<{ sceneIdx: number; originX: number; originY: number; sceneW: number; sceneH: number }>;
  worldCols: number;
  worldRows: number;
} {
  if (!scenes.length) return {
    map: Array.from({ length: ROWS }, () => Array(COLS).fill(0)),
    overlayMap: Array.from({ length: ROWS }, () => Array(COLS).fill(0)),
    overheadMap: Array.from({ length: ROWS }, () => Array(COLS).fill(0)),
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
  const overheadMap: number[][] = Array.from({ length: maxR }, () => Array(maxC).fill(0));
  for (const { sceneIdx, originX, originY, sceneW, sceneH } of layouts) {
    const sm = scenes[sceneIdx].map;
    const som = scenes[sceneIdx].overlayMap;
    const sohm = scenes[sceneIdx].overheadMap;
    for (let r = 0; r < sceneH; r++) for (let c = 0; c < sceneW; c++) {
      map[originY + r][originX + c] = sm[r]?.[c] ?? 0;
      overlayMap[originY + r][originX + c] = som?.[r]?.[c] ?? 0;
      overheadMap[originY + r][originX + c] = sohm?.[r]?.[c] ?? 0;
    }
  }
  return { map, overlayMap, overheadMap, layouts, worldCols: maxC, worldRows: maxR };
}

/** map と同サイズの空グリッド（overlayMap の既定値）を作る。 */
const emptyGridLike = (map: number[][]): number[][] =>
  map.map(row => new Array(row.length).fill(0));

const BEHAVIOR_LABELS: Record<NpcBehavior, string> = { still: '静止', random: 'ランダム', randomDash: 'ランダムダッシュ', randomHop: 'ランダムジャンプ', chase: '追尾', flee: '逃走', patrolH: '左右往復', patrolV: '上下往復', walker: '歩行（崖で反転）' };
const BULLET_LABELS: Record<BulletType, string> = { none: 'なし', aimed: '狙い弾', spread: '拡散', spiral: '回転' };
const OBJECT_KIND_LABELS: Record<ObjectKind, string> = { npc: 'NPC / 敵', tile: 'タイル', bullet: '弾 / 攻撃' };
const OBJTYPE_LABELS: Record<ObjType, string> = { enemy: '敵', npc: 'NPC', item: 'アイテム', warp: 'ワープ', event: 'イベント', platform: '動くリフト' };
const SFX_LABELS: Record<SfxTrigger, string> = { jump: 'ジャンプ', shot: 'ショット', clear: 'クリア', damage: 'ミス/被弾', graze: 'グレイズ', spellcard: 'スペルカード', levelup: 'レベルアップ', purchase: '購入', inn: '宿泊/回復', coin: 'コイン', save: 'セーブ' };

// ── システムタイル（宝箱以外）: ワープ床・どく沼/ダメージ床・つるつる床 ──────────
// special の値ごとに固定の効果音・挙動を持つ。画像は /assets/rpgen/map.png の16pxグリッドから
// 切り出す（`localTileUrl` と同じ #sx,sy,16,16 記法）。効果音URLは yume25d と共有（shared.ts）。
const ICE_DIRS: Record<string, [number, number]> = {
  'ice-up': [0, -1], 'ice-right': [1, 0], 'ice-down': [0, 1], 'ice-left': [-1, 0],
};
/** つるつる床の強制スライド既定速度（px/frame）。プレイヤーの通常移動速度より明確に速くする。
 *  gameData.iceSlideSpeed で上書き可能（rpg/onjReze のみ対象。action は friction ベースの物理挙動）。 */
const DEFAULT_ICE_SLIDE_SPEED = 6;

const clone = (d: PresetData): PresetData => JSON.parse(JSON.stringify(d));

/** 保存/エクスポートされたマニフェストから編集用 PresetData を再構築する
 *  （既存ゲームの初期ロード・履歴復元・JSONインポートの共通処理）。
 *  欠けている項目はプリセットの既定値で補い、古い/部分的なマニフェストでも読み込めるようにする。 */
const manifestToPresetData = (manifest: GameManifestDraft): { presetId: PresetId; data: PresetData } => {
  const presetId = PRESETS[manifest.preset] ? manifest.preset : 'dq';
  const base = clone(PRESETS[presetId]);
  const map = manifest.map ?? base.map;
  const data: PresetData = {
    ...base,
    engine: manifest.engine ?? base.engine,
    name: manifest.name ?? base.name,
    gravity: manifest.gravity ?? base.gravity,
    friction: manifest.friction ?? base.friction,
    iceSlideSpeed: manifest.iceSlideSpeed ?? base.iceSlideSpeed,
    player: { ...base.player, ...manifest.player, spriteUrl: hydrateUrlFromRef(manifest.player?.spriteRef) },
    tiles: manifest.tiles
      ? Object.fromEntries(
        Object.entries(manifest.tiles).map(([k, t]) => [k, { ...t, imageUrl: hydrateUrlFromRef(t.imageRef) ?? t.imageUrl }])
      )
      : base.tiles,
    map,
    overlayMap: manifest.overlayMap ?? emptyGridLike(map),
    overheadMap: manifest.overheadMap ?? emptyGridLike(map),
    objects: (manifest.objects ?? []).map(o => ({ ...o, spriteUrl: hydrateUrlFromRef(o.spriteRef) })),
    mapBgRef: manifest.mapBgRef,
    mapBgUrl: undefined,
    scroll: manifest.scroll ?? base.scroll,
    switches: manifest.switches ?? base.switches,
    items: manifest.items ?? base.items,
    weapons: manifest.weapons ?? base.weapons,
    armors: manifest.armors ?? base.armors,
    effects: (manifest.effects ?? base.effects)?.map(ef => ({
      ...ef,
      imageUrl: ef.imageRef.startsWith('url:') ? (imageRefToUrl(ef.imageRef) ?? undefined) : (hydrateUrlFromRef(ef.imageRef) ?? ef.imageUrl),
    })),
    phases: manifest.phases ?? base.phases,
    titleScreen: manifest.titleScreen ?? base.titleScreen,
    ending: manifest.ending ?? base.ending,
    deathScreen: manifest.deathScreen ?? base.deathScreen,
    battle: manifest.battle ?? base.battle,
    layout25d: manifest.layout25d ?? base.layout25d,
    scenes: manifest.scenes?.map(s => ({
      ...s,
      overheadMap: s.overheadMap ?? emptyGridLike(s.map),
      objects: (s.objects ?? []).map(o => ({ ...o, spriteUrl: hydrateUrlFromRef(o.spriteRef) })),
      bgm: hydrateBgmFromRef(s.bgm),
    })),
    bgm: hydrateBgmFromRef(manifest.bgm),
    battleBgm: hydrateBgmFromRef(manifest.battleBgm),
    bossBgm: hydrateBgmFromRef(manifest.bossBgm),
    sfx: Object.fromEntries(
      Object.entries(manifest.sfx ?? {}).map(([k, v]) => [k, v ? { ref: v } : undefined])
    ) as PresetData['sfx'],
  };
  return { presetId, data };
};

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
  const overheadMap = resizeGrid(d.overheadMap ?? emptyGridLike(d.map), w, h);
  return { ...d, map, overlayMap, overheadMap, scroll: (w > COLS || h > ROWS) ? { worldCols: w, worldRows: h } : undefined };
};

async function playSfx(s?: SfxRef) {
  if (!s || !s.src) return;
  const volume = applyMasterVolume(s.ref ? getBgmVolume(s.ref) : 50);
  if (s.type === 'direct') {
    const a = new Audio(s.src);
    a.volume = (volume / 100) * 0.7;
    a.play().catch(() => { });
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
  spriteRef?: string; spriteUrl?: string;
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
  /** つるつる床の強制スライド中の目標タイル（プレイヤーの iceSlideRef と同等の仕組みを敵/NPCにも適用）。 */
  iceSlide?: { targetX: number; targetY: number };
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
      (env.moveTo as (x: unknown, y: unknown, f: unknown) => Promise<void>)(x, y, frames),

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
  /** 現在アクティブなシーンの置物/天蓋レイヤー。ワープ／シーン切替のたびに map と一緒に差し替える
   *  （worldLayoutRef はシーンに exits が無い場合 scenesRef.current[0] のみを含んだまま固定されるため、
   *   ワープ先シーンの overlayMap/overheadMap を反映できない）。 */
  overlayMap?: number[][];
  overheadMap?: number[][];
  player: { x: number; y: number; vx: number; vy: number; isGrounded: boolean; spriteRef?: string; spriteUrl?: string };
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
  /** モバイルの仮想コントローラーを画面全体に固定表示する（フィード等の小さい埋め込み領域用） */
  fixedControls?: boolean;
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
  | { t: 'yumeTex'; id: number }
  | { t: 'yumeSky' }
  | { t: 'yumeTexSound'; id: number }
  | { t: 'yumeMcSkin' }
  | { t: 'playerMcSkin' }
  | { t: 'effectImage'; id: string }
  | { t: 'effectSfx'; id: string };

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
    } else if (walk?.crop && walk.stdId === 'smc') {
      const [csx, csy, csw, csh] = walk.crop;
      const frames = smcFrameCount(walk.crop, walk.frames);
      sw = csw / frames;
      sh = csh;
      sx = csx;
      sy = csy;
    } else {
      const rect = resolveSpriteRect(walk, imgW, imgH, resolvedUrl);
      sx = rect.sx; sy = rect.sy; sw = rect.sw; sh = rect.sh;
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

/** 汎用エフェクトアニメーション（横一列スプライトシート）を再生する小さな DOM コンポーネント。
 *  バトル演出（1回だけ再生→onDone）と、エディタのプレビュー（loop=true で繰り返し再生）の両方から使う。
 *  クラシックな「スプライトストリップ」手法: 外側 div を1コマ分の幅で overflow:hidden にし、
 *  内側の img を frameCount 倍の幅で敷いて translateX でずらす。 */
function EffectSpriteAnim({
  effect, url, sizePx = 64, loop = false, onDone,
}: { effect: EffectPreset; url: string; sizePx?: number; loop?: boolean; onDone?: () => void }) {
  const [frame, setFrame] = useState(0);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const frameCount = Math.max(1, effect.frameCount || 1);
  const fps = effect.fps ?? 12;

  useEffect(() => {
    setFrame(0);
    setNatural(null);
    let alive = true;
    const img = new Image();
    img.onload = () => { if (alive) setNatural({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.src = url;
    return () => { alive = false; };
  }, [url]);

  useEffect(() => {
    if (!natural) return;
    let raf = 0;
    let start = performance.now();
    let done = false;
    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      let f = Math.floor(elapsed * fps);
      if (f >= frameCount) {
        if (loop) { start = now; f = 0; }
        else { f = frameCount - 1; if (!done) { done = true; onDone?.(); } setFrame(f); return; }
      }
      setFrame(f);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural, frameCount, fps, loop]);

  if (!natural) return <div style={{ width: sizePx, height: sizePx }} className="bg-gray-800/50 rounded" />;
  const frameDisplayW = sizePx * (natural.w / frameCount / natural.h);
  return (
    <div style={{ width: frameDisplayW, height: sizePx, overflow: 'hidden', position: 'relative' }}>
      <img
        src={url}
        style={{
          position: 'absolute', left: 0, top: 0,
          width: frameDisplayW * frameCount, height: sizePx,
          transform: `translateX(${-frame * frameDisplayW}px)`,
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}

/** 組み込みのエフェクトアニメーションプリセット（id は追加時に uid() で採番）。RPGEN のスペルシートを流用。 */
const BUILT_IN_EFFECT_PRESETS: Omit<EffectPreset, 'id'>[] = [
  { name: 'ファイアボール', imageRef: 'url:https://rpgen.org/dq/spells/7/spell.png', imageUrl: 'https://rpgen.org/dq/spells/7/spell.png', frameCount: 10, fps: 15, sfx: { ref: 'direct:https://rpgen-search.pages.dev/data/audio/sound/HDbV5i.mp3', src: 'https://rpgen-search.pages.dev/data/audio/sound/HDbV5i.mp3', type: 'direct' } },
  { name: '炎', imageRef: 'url:https://rpgen.org/dq/spells/18/spell.png', imageUrl: 'https://rpgen.org/dq/spells/18/spell.png', frameCount: 8, fps: 15, sfx: { ref: 'direct:https://rpgen-search.pages.dev/data/audio/sound/HDbV5i.mp3', src: 'https://rpgen-search.pages.dev/data/audio/sound/HDbV5i.mp3', type: 'direct' } },
  { name: '爆発', imageRef: 'url:https://rpgen.org/dq/spells/6/spell.png', imageUrl: 'https://rpgen.org/dq/spells/6/spell.png', frameCount: 10, fps: 15, sfx: { ref: 'direct:https://rpgen-search.pages.dev/data/audio/sound/hR4B8I.mp3', src: 'https://rpgen-search.pages.dev/data/audio/sound/hR4B8I.mp3', type: 'direct' } },
  { name: 'かぜ', imageRef: 'url:https://rpgen.org/dq/spells/3/spell.png', imageUrl: 'https://rpgen.org/dq/spells/3/spell.png', frameCount: 16, fps: 20, sfx: { ref: 'direct:https://rpgen-search.pages.dev/data/audio/sound/XoGbTD.mp3', src: 'https://rpgen-search.pages.dev/data/audio/sound/XoGbTD.mp3', type: 'direct' } },
  { name: 'こおり', imageRef: 'url:https://rpgen.org/dq/spells/15/spell.png', imageUrl: 'https://rpgen.org/dq/spells/15/spell.png', frameCount: 16, fps: 20, sfx: { ref: 'direct:https://rpgen-search.pages.dev/data/audio/sound/QSRAPG.mp3', src: 'https://rpgen-search.pages.dev/data/audio/sound/QSRAPG.mp3', type: 'direct' } },
];

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

/** バトル用スプライトアニメ（フレーム順の画像URLを fps で回す）。
 *  once=true は最終フレームで停止（attack など1周モノは親がタイマーで idle に戻すが、
 *  親の切替が遅れてもループ頭に巻き戻って見えないように）。高さ h に収めて幅は auto。
 *  全フレームを一度に <img> として置き display を切り替える（src 差し替え方式だと
 *  フレーム送りのたびに前のリクエストが abort されて初回表示がチラつくため）。 */
function BattleAnimSprite({ anim, h, once = false, className = '', style }: {
  anim: BattleSpriteAnim; h: number | string; once?: boolean; className?: string; style?: React.CSSProperties;
}) {
  const [fi, setFi] = useState(0);
  useEffect(() => {
    setFi(0);
    if (anim.frames.length <= 1) return;
    const id = setInterval(() => {
      setFi(i => {
        const next = i + 1;
        if (next >= anim.frames.length) return once ? i : 0;
        return next;
      });
    }, 1000 / (anim.fps ?? 8));
    return () => clearInterval(id);
  }, [anim, once]);
  const cur = Math.min(fi, anim.frames.length - 1);
  return (
    <span className={`inline-block ${className}`} style={{ height: h, ...style }}>
      {anim.frames.map((f, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={f} alt="" draggable={false}
          style={{ height: h, width: 'auto', imageRendering: 'pixelated', display: i === cur ? 'block' : 'none' }} />
      ))}
    </span>
  );
}

/** MOTHER3風「ドラムロール」HP表示の1桁ぶん。0〜9を縦に並べた帯を transform: translateY で回し、
 *  桁が変わるたびに CSS トランジションでスクロールさせる（数値を書き換えるだけの実装だと一瞬で切り替わってしまう）。
 *  dir='up'（回復方向）なら常に前方向（0→1→…→9→0…）へ、dir='down'（被弾方向）なら常に後方向へだけ回転させ、
 *  桁の繰り上がり/繰り下がり（例: 9→0, 0→9）でも回転方向が逆転しないよう、内部で "論理位置"（0〜9に収まらない
 *  連続値）を保持して片方向にだけ進める。 */
// 論理位置（0〜9に収まらない連続値）が届きうる範囲を先読みで帯に用意しておく数（片側）。
// この範囲を超えて同方向へ回り続けた場合だけ、帯の外＝空白になる（実運用のHP変動量なら十分な余裕）。
const DIGIT_REEL_PAD = 30;
// 帯そのものは「論理位置 p → 表示する数字」の固定テーブルなので、桁の値に関係なく全インスタンスで共有できる。
const DIGIT_REEL_STRIP = Array.from({ length: DIGIT_REEL_PAD * 2 + 1 }, (_, i) => ((((i - DIGIT_REEL_PAD) % 10) + 10) % 10));
function DigitReel({ digit, dir, cellH = 16 }: { digit: number; dir: 'up' | 'down' | null; cellH?: number }) {
  // 論理位置(pos)は 0〜9 に丸めない連続値。帯の中で pos に対応する数字が必ず digit と一致するよう、
  // 初期値は digit そのもの（帯の中央 = 論理位置0 に相当する要素の数字は 0 なので、
  // 実際に表示すべき要素の帯インデックスは pos + DIGIT_REEL_PAD）。
  const posRef = useRef(digit);
  const [pos, setPos] = useState(digit);
  useEffect(() => {
    const cur = posRef.current;
    const curMod = ((cur % 10) + 10) % 10;
    if (curMod === digit) return; // 桁は変わっていない
    let next = cur;
    if (dir === 'down') {
      // 後方向へ：目標桁に到達するまで1ずつ減らす
      do { next -= 1; } while (((next % 10) + 10) % 10 !== digit);
    } else {
      // 既定は前方向（回復・不明時も含む）：目標桁に到達するまで1ずつ増やす
      do { next += 1; } while (((next % 10) + 10) % 10 !== digit);
    }
    posRef.current = next;
    setPos(next);
  }, [digit, dir]);
  const stripIdx = Math.max(0, Math.min(DIGIT_REEL_STRIP.length - 1, pos + DIGIT_REEL_PAD));
  return (
    <span className="relative overflow-hidden inline-block bg-white" style={{ width: cellH * 0.8, height: cellH }}>
      <span className="absolute left-0 top-0 w-full transition-transform ease-out"
        style={{ transitionDuration: '260ms', transform: `translateY(${-stripIdx * cellH}px)` }}>
        {DIGIT_REEL_STRIP.map((val, i) => (
          <span key={i} className="flex items-center justify-center text-black font-mono font-bold" style={{ height: cellH, fontSize: cellH * 0.72, lineHeight: `${cellH}px` }}>{val}</span>
        ))}
      </span>
      {/* 円筒シェーディング：上下を暗く・中央を明るくして、ドラムが回っているように見せる */}
      <span className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0.08) 30%, rgba(255,255,255,0.15) 50%, rgba(0,0,0,0.08) 70%, rgba(0,0,0,0.45))' }} />
    </span>
  );
}

/** 弾幕よけキャンバス用の画像キャッシュ（UNDERTALEハートなど）。 */
const dodgeImgCache: Record<string, HTMLImageElement> = {};
function getDodgeImg(url: string): HTMLImageElement {
  let img = dodgeImgCache[url];
  if (!img) { img = new Image(); img.src = url; dodgeImgCache[url] = img; }
  return img;
}

export default function GameMaker({ onClose, userId, onSave, initialManifest, playOnly, embedded, fixedControls, ghostPlayers, onPositionChange, postId, danmakuComments, onComment }: GameMakerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // canvas エリア（親フレックス）の実測サイズを ResizeObserver で追いかけ、PLAY_W:PLAY_H を保った
  // まま contain フィットさせる。CSS の aspect-ratio + width:auto;height:auto だけに頼ると、親の高さが
  // 子（このボックス）に依存し子の高さが親に依存する循環になり、ブラウザ/構成によって 0px に潰れる
  // ケースがあった（特に yume25d の Three.js canvas が absolute inset-0 で追従して 0x0 になる）ため、
  // JS で実測して明示的な px を与える。
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const [canvasAreaSize, setCanvasAreaSize] = useState({ w: 0, h: 0 });
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const box = entries[0]?.contentRect;
      if (box) setCanvasAreaSize({ w: box.width, h: box.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
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
  /** エディタの「エフェクト」タブで、プレビュー再生中の EffectPreset.id（1件のみ）。 */
  const [playingEffectPreview, setPlayingEffectPreview] = useState<string | null>(null);
  /** 詳細タブ（設定・サウンド・画面・フェーズ）の表示フラグ。初回は非表示で圧迫感を減らす。 */
  const [showAdvancedTabs, setShowAdvancedTabs] = useState(false);
  /** マップタブの編集ツール（tile のみ。初期位置は🏁ドラッグで変更）。 */
  const [mapTool] = useState<'tile'>('tile');
  const isDraggingStartRef = useRef(false);
  const justStartedRef = useRef(false);
  const editorCoordRef = useRef<HTMLDivElement>(null);

  // ── プレビュー用 ──
  const [previewCommand, setPreviewCommand] = useState<EventCommand | null>(null);
  const previewCommandRef = useRef<EventCommand | null>(null);
  previewCommandRef.current = previewCommand;

  // ── タイトル／エンディング画面ランタイム ──
  const [showTitle, setShowTitle] = useState(false);
  const showTitleRef = useRef(false);
  showTitleRef.current = showTitle;
  const [showEnding, setShowEnding] = useState(false);
  const endingRef = useRef<EndingScreenConfig | undefined>(undefined);
  endingRef.current = gameData.ending;
  const [showDeathScreen, setShowDeathScreen] = useState(false);
  const deathScreenRef = useRef<DeathScreenConfig | undefined>(undefined);
  deathScreenRef.current = gameData.deathScreen;
  const [selectedTileId, setSelectedTileId] = useState(1);
  /** マップ編集タブでどちらのレイヤーに描画するか。'base'=地面(当たり判定あり) / 'overlay'=置物(当たり判定あり・プレイヤーの後ろ) / 'overhead'=天蓋(当たり判定なし・手前・半透明化)。 */
  const [editMapLayer, setEditMapLayer] = useState<'base' | 'overlay' | 'overhead'>('base');
  /** 地形自動生成マクロの「水の量」（見下ろし型のみ。actionは横視点の起伏地形なので使わない）。 */
  const [terrainWater, setTerrainWater] = useState<TerrainWater>('mid');
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
  // ── バッチ選択（複数オブジェクトをまとめて編集） ──
  const [batchIds, setBatchIds] = useState<Set<string>>(new Set());
  const batchIdsRef = useRef<Set<string>>(new Set());
  batchIdsRef.current = batchIds;
  const lastClickedIdRef = useRef<string | null>(null);
  // ── イベントランタイム ──
  const [switchVals, setSwitchVals] = useState<Record<number, boolean>>({});
  const switchValsRef = useRef<Record<number, boolean>>({});
  switchValsRef.current = switchVals;
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const inventoryRef = useRef<Record<string, number>>({});
  inventoryRef.current = inventory;
  /** スロットベースの持ち物（最大8個）。UI表示と操作はこちらを使う。 */
  const MAX_INVENTORY = 8;
  const [invSlots, setInvSlots] = useState<string[]>([]);
  const invSlotsRef = useRef<string[]>([]);
  invSlotsRef.current = invSlots;
  const [invOpen, setInvOpen] = useState(false);
  const invOpenRef = useRef(false);
  invOpenRef.current = invOpen;
  const [invMenu, setInvMenu] = useState<{ slotIdx: number } | null>(null);
  const invMenuRef = useRef<{ slotIdx: number } | null>(null);
  invMenuRef.current = invMenu;
  const [invDetail, setInvDetail] = useState<string | null>(null);
  const invDetailRef = useRef<string | null>(null);
  invDetailRef.current = invDetail;
  /** 十字キー操作用カーソル：フィールドの持ち物一覧（2列グリッド） */
  const [invCursor, setInvCursor] = useState(0);
  const invCursorRef = useRef(0);
  invCursorRef.current = invCursor;
  /** 十字キー操作用カーソル：アイテムアクションメニュー（つかう/せつめい/すてる/もどる） */
  const [invMenuCursor, setInvMenuCursor] = useState(0);
  const invMenuCursorRef = useRef(0);
  invMenuCursorRef.current = invMenuCursor;
  const [shopModal, setShopModal] = useState<{ npcId: string; items: import('./game-presets/shared').ShopItem[] } | null>(null);
  const shopModalRef = useRef<typeof shopModal>(null);
  shopModalRef.current = shopModal;
  const [equipment, setEquipment] = useState<{ weapon?: string; armor?: string }>({});
  const equipmentRef = useRef<{ weapon?: string; armor?: string }>({});
  /** 同行者(party[1..])ごとの装備。PartyMember.id をキーにする。主人公の equipment/equipmentRef は別管理のまま。 */
  const [partyEquipment, setPartyEquipment] = useState<Record<string, { weapon?: string; armor?: string }>>({});
  const partyEquipmentRef = useRef<Record<string, { weapon?: string; armor?: string }>>({});
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
    map: [], overlayMap: [], overheadMap: [], player: { x: 50, y: 50, vx: 0, vy: 0, isGrounded: false },
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
  /** 現在のカメラのワールド座標オフセット。エンカウント演出でスクリーン固定位置へ変換するために毎フレーム更新する。 */
  const camXRef = useRef(0);
  const camYRef = useRef(0);
  const [cameraPan, setCameraPan] = useState({ x: 0, y: 0 });
  const cameraPanRef = useRef({ x: 0, y: 0 });
  type OverlayImageType = {
    url: string; x: number; y: number; w?: number; h?: number; opacity?: number; isPercent?: boolean;
    m?: boolean; c?: boolean; sxp?: boolean; swp?: boolean; xp?: boolean; wp?: boolean; lp?: boolean;
    ms?: number;
    startTime?: number;
    pausedAt?: number;
    pauseOffset?: number;
    frames?: { url: string; sx: number; sy: number; sw: number; sh: number; ox: number; oy: number; r: number; a: number; }[];
  };
  const [overlayImages, setOverlayImages] = useState<Record<string, OverlayImageType>>({});
  const overlayImagesRef = useRef<Record<string, OverlayImageType>>({});
  overlayImagesRef.current = overlayImages;

  type FollowImageType = {
    targetObjId: string;
    directions: Record<'U' | 'D' | 'L' | 'R', any>;
  };
  const [followImages, setFollowImages] = useState<Record<string, FollowImageType>>({});
  const followImagesRef = useRef<Record<string, FollowImageType>>({});
  followImagesRef.current = followImages;

  const [screenEffect, setScreenEffect] = useState<{ effects: { type: 'solid' | 'gradient'; color: string; c1: string; c2: string; pos: string; stops: string }[] } | null>(null);
  const screenEffectRef = useRef<{ effects: { type: 'solid' | 'gradient'; color: string; c1: string; c2: string; pos: string; stops: string }[] } | null>(null);
  screenEffectRef.current = screenEffect;

  const camOverrideRef = useRef<{ startX: number; startY: number; endX: number; endY: number; startTime: number; duration: number; easing?: number } | null>(null);
  const originalMapBgRef = useRef<{ ref?: string; url?: string } | null>(null);

  // ── ターン制戦闘 ──
  // mercy: こうどう技で溜まる「敵意がなくなった度」ゲージ 0〜100（アンダーテール系。labels.mercy 設定時のみUIに出る）
  /** undertale/deltarune 戦闘の敵1体ぶん。1回のエンカウントで同種の敵が1〜3体現れ（foes 配列）、
   *  HP・敵意ゲージ・撃破/みのがし状態は1体ずつ独立に持つ。atk/def/moves/弾幕は同種なので battleRef 共有。 */
  interface BattleFoe { name: string; emoji: string; sprite?: EnemyBattleSprite; hp: number; maxHp: number; mercy: number; exp: number; gold: number; gone?: 'dead' | 'spared'; dialogue?: (string | EnemyDialogueLine)[]; }
  interface BattleView { enemyName: string; enemyEmoji: string; enemySprite?: EnemyBattleSprite; enemyHp: number; enemyMaxHp: number; mercy: number; foes: BattleFoe[]; log: string[]; canAct: boolean; over: boolean; }
  const [battle, setBattle] = useState<BattleView | null>(null);
  const battleViewRef = useRef<BattleView | null>(null);
  battleViewRef.current = battle;
  const battleRef = useRef<{ active: boolean; entity: Entity | null; enemyName: string; enemyHp: number; enemyMaxHp: number; enemyAtk: number; enemyDef: number; enemyMoves: { name: string; power: number; heal?: boolean; miniScript?: string; undertaleMode?: UndertaleMode; dialogue?: (string | EnemyDialogueLine)[] }[]; exp: number; gold: number; isBoss: boolean; mercy: number; foes: BattleFoe[]; miniScript?: string; undertaleMode?: UndertaleMode; dialogue?: (string | EnemyDialogueLine)[] }>(
    { active: false, entity: null, enemyName: '', enemyHp: 0, enemyMaxHp: 0, enemyAtk: 0, enemyDef: 0, enemyMoves: [], exp: 0, gold: 0, isBoss: false, mercy: 0, foes: [], miniScript: undefined, undertaleMode: undefined, dialogue: undefined });
  /** undertale 戦闘：プレイヤーが直前に使った「こうどう」技名（敵セリフの actUsed 条件判定用）。バトル開始時にリセット。 */
  const lastActRef = useRef<string | null>(null);
  /** バトル開始時のプレイヤー座標。終了後にここへ正確に戻す（シンボルエンカウントで敵側へ押し出されるのを防ぐ）。 */
  const battleReturnPosRef = useRef<{ x: number; y: number } | null>(null);
  // baseAtk/baseDef は装備ボーナスを含まないレベル基礎値。atk/def = base + 装備ボーナス。
  const progressRef = useRef({ hp: 0, mp: 0, maxHp: 0, maxMp: 0, atk: 0, def: 0, baseAtk: 0, baseDef: 0, level: 1, exp: 0, expNext: 10, gold: 0 });
  const invulnRef = useRef(0);
  /** 天蓋タイル(overhead)の描画アルファ。プレイヤーが真下にいる間だけ滑らかに半透明化する。 */
  const overheadAlphaRef = useRef(1);
  /** 戦闘コマンド「どうぐ」のサブメニュー開閉。 */
  const [battleItemsOpen, setBattleItemsOpen] = useState(false);
  const battleItemsOpenRef = useRef(false);
  battleItemsOpenRef.current = battleItemsOpen;
  // ── 十字キー操作用カーソル（選択メニュー各種：常にトップの項目がデフォルト） ──
  const [eventChoiceCursor, setEventChoiceCursor] = useState(0);
  const eventChoiceCursorRef = useRef(0);
  eventChoiceCursorRef.current = eventChoiceCursor;
  const [shopCursor, setShopCursor] = useState(0);
  const shopCursorRef = useRef(0);
  shopCursorRef.current = shopCursor;
  const [battleItemsCursor, setBattleItemsCursor] = useState(0);
  const battleItemsCursorRef = useRef(0);
  battleItemsCursorRef.current = battleItemsCursor;
  const [classicBattleCursor, setClassicBattleCursor] = useState(0);
  const classicBattleCursorRef = useRef(0);
  classicBattleCursorRef.current = classicBattleCursor;
  const [titleCursor, setTitleCursor] = useState(0);
  const titleCursorRef = useRef(0);
  titleCursorRef.current = titleCursor;
  useEffect(() => { setEventChoiceCursor(0); }, [eventChoice]);
  useEffect(() => { setShopCursor(0); }, [shopModal]);
  useEffect(() => { setBattleItemsCursor(0); }, [battleItemsOpen]);
  useEffect(() => { if (battle) setClassicBattleCursor(0); }, [battle?.canAct]);
  // ── アンダーテール風戦闘（battle.style === 'undertale'）──
  // menu: コマンド選択 / attack: タイミングバー / dodge: バトルボックス内で弾幕よけ
  const [undertalePhase, setUndertalePhase] = useState<'menu' | 'attack' | 'dodge'>('menu');
  const undertalePhaseRef = useRef(undertalePhase);
  undertalePhaseRef.current = undertalePhase;
  const [undertaleMenu, setUndertaleMenu] = useState<'root' | 'act' | 'item' | 'mercy' | 'target'>('root');
  const undertaleMenuRef = useRef(undertaleMenu);
  undertaleMenuRef.current = undertaleMenu;
  // ── 複数体戦のターゲット選択 ──
  /** 対象選択待ちの保留アクション。fight＝たたかう（確定後タイミングバーへ）、act＝こうどう、spell＝攻撃呪文。
   *  生存敵が1体だけのときは選択メニューを出さず即実行する。 */
  const [undertaleTargetSel, setUndertaleTargetSel] = useState<{ kind: 'fight' | 'act' | 'spell'; move?: BattleMove; spell?: PartySpell } | null>(null);
  const undertaleTargetSelRef = useRef<typeof undertaleTargetSel>(null);
  undertaleTargetSelRef.current = undertaleTargetSel;
  /** ターゲット選択カーソル（foes 配列のインデックス。生存敵の間だけを巡回する）。 */
  const [undertaleTargetCursor, setUndertaleTargetCursor] = useState(0);
  const undertaleTargetCursorRef = useRef(0);
  undertaleTargetCursorRef.current = undertaleTargetCursor;
  /** 確定済みの「たたかう」対象（タイミングバー解決時に参照。倒れていれば自動で付け替え）。 */
  const attackTargetRef = useRef(0);
  /** 十字キー操作用カーソル：FIGHT/ACT/ITEM/MERCY（0-3） */
  const [undertaleRootCursor, setUndertaleRootCursor] = useState(0);
  const undertaleRootCursorRef = useRef(0);
  undertaleRootCursorRef.current = undertaleRootCursor;
  /** 十字キー操作用カーソル：ACT/ITEM/MERCY サブメニュー内の項目 */
  const [undertaleSubCursor, setUndertaleSubCursor] = useState(0);
  const undertaleSubCursorRef = useRef(0);
  undertaleSubCursorRef.current = undertaleSubCursor;
  useEffect(() => { setUndertaleSubCursor(0); }, [undertaleMenu]);
  // ── デルタルーン風パーティ戦闘（battle.style === 'deltarune'）──
  // 'undertale' の弾幕よけ・タイミング攻撃はそのまま流用し、行動選択の手前にパーティ1人ずつの
  // ターンを挟む。TPはMPとは独立の共有リソース（毎戦闘0開始・グレイズ/まもるで加算・呪文で消費）。
  const [tp, setTp] = useState(0);
  const tpRef = useRef(0);
  tpRef.current = tp;
  /** 2人目以降のパーティメンバーの戦闘中HP（先頭メンバーはフィールドの pr.hp を共有するためここには含めない）。
   *  戦闘終了で破棄する一時状態＝フィールドへは持ち越さない。 */
  const [partyExtraHp, setPartyExtraHp] = useState<Record<string, number>>({});
  const partyExtraHpRef = useRef<Record<string, number>>({});
  partyExtraHpRef.current = partyExtraHp;
  /** 現在の行動選択ターンが party 配列の何番目か。生存者だけを順に進む。 */
  const [dtTurnIdx, setDtTurnIdx] = useState(0);
  const dtTurnIdxRef = useRef(0);
  dtTurnIdxRef.current = dtTurnIdx;
  /** このラウンドで「まもる」を選んだメンバーID（次の被弾ダメージを軽減）。 */
  const dtDefendedRef = useRef<Set<string>>(new Set());
  /** デルタルーン戦闘専用の追加SE（tlDR Engine 由来。undertale 側には対応音源が無いものたち）。 */
  const DT_SFX = {
    weaponPull: { ref: 'direct:dt-weaponpull', src: tldrSfxUrl('weaponPull'), type: 'direct' as const },
    attack: { ref: 'direct:dt-attack', src: tldrSfxUrl('attack'), type: 'direct' as const },
    crit: { ref: 'direct:dt-crit', src: tldrSfxUrl('criticalSwing'), type: 'direct' as const },
    graze: { ref: 'direct:dt-graze', src: tldrSfxUrl('graze'), type: 'direct' as const },
    spellCast: { ref: 'direct:dt-spellcast', src: tldrSfxUrl('spellCast'), type: 'direct' as const },
    cure: { ref: 'direct:dt-cure', src: tldrSfxUrl('spellCure'), type: 'direct' as const },
    spare: { ref: 'direct:dt-spare', src: tldrSfxUrl('spare'), type: 'direct' as const },
    mercyAdd: { ref: 'direct:dt-mercyadd', src: tldrSfxUrl('mercyAdd'), type: 'direct' as const },
  };

  const [, forceRender] = useState(0);

  // ── History & Autosave Integration ──
  interface SavedGameplayState {
    activeSceneIdx: number;
    playerX: number;
    playerY: number;
    checkpoint: { x: number; y: number } | null;
    progress: typeof progressRef.current;
    inventory: typeof inventoryRef.current;
    invSlots: string[];
    equipment: { weapon?: string; armor?: string };
    partyEquipment?: Record<string, { weapon?: string; armor?: string }>;
    switchVals: Record<number, boolean>;
    selfSwitches: Record<string, Record<string, boolean>>;
    tp: number;
    partyExtraHp: Record<string, number>;
  }

  const [showHistory, setShowHistory] = useState(false);
  const [hasAutosaveEdit, setHasAutosaveEdit] = useState(false);
  const [autosaveEditData, setAutosaveEditData] = useState<GameManifestDraft | null>(null);
  const [hasAutosavePlay, setHasAutosavePlay] = useState(false);
  const [autosavePlayData, setAutosavePlayData] = useState<SavedGameplayState | null>(null);

  const suffix = postId ? `post-${postId}` : (initialManifest?.preset ? `preset-${initialManifest.preset}` : 'new');
  const editStorageKey = `unj-gamemaker-history-${suffix}`;
  const playStorageKey = `unj-gameplay-history-${suffix}`;

  // Check autosave on mount (Edit mode)
  useEffect(() => {
    if (playOnly) return;
    const autosave = getAutosave(editStorageKey);
    if (autosave && autosave.data) {
      setAutosaveEditData(autosave.data);
      setHasAutosaveEdit(true);
    }
  }, [editStorageKey, playOnly]);

  // Check autosave when entering play mode
  useEffect(() => {
    if (isPlaying || playOnly) {
      const autosave = getAutosave(playStorageKey);
      if (autosave && autosave.data) {
        setAutosavePlayData(autosave.data);
        setHasAutosavePlay(true);
      }
    }
  }, [playStorageKey, isPlaying, playOnly]);

  // Periodic autosave (every 10s) and history snapshot (every 30m)
  useEffect(() => {
    const autosaveInterval = setInterval(() => {
      if (isPlaying || playOnly) {
        const state = getCurrentPlayState();
        if (state) saveAutosave(playStorageKey, state);
      } else {
        const manifest = buildManifest();
        if (manifest) saveAutosave(editStorageKey, manifest);
      }
    }, 10000);

    const historyInterval = setInterval(() => {
      if (isPlaying || playOnly) {
        const state = getCurrentPlayState();
        if (state) saveHistory(playStorageKey, state, 'gameplay', 50);
      } else {
        const manifest = buildManifest();
        if (manifest) saveHistory(editStorageKey, manifest, 'gamemaker', 50);
      }
    }, 1800000);

    return () => {
      clearInterval(autosaveInterval);
      clearInterval(historyInterval);
    };
  }, [editStorageKey, playStorageKey, isPlaying, playOnly, title, gameData]);

  const handleRestoreEditAutosave = () => {
    if (!autosaveEditData) return;
    loadManifest(autosaveEditData);
    setHasAutosaveEdit(false);
    clearAutosave(editStorageKey);
  };

  const handleIgnoreEditAutosave = () => {
    setHasAutosaveEdit(false);
    clearAutosave(editStorageKey);
  };

  const handleRestorePlayAutosave = () => {
    if (!autosavePlayData) return;
    handleRestorePlayState(autosavePlayData);
    setHasAutosavePlay(false);
    clearAutosave(playStorageKey);
  };

  const handleIgnorePlayAutosave = () => {
    setHasAutosavePlay(false);
    clearAutosave(playStorageKey);
  };

  const getCurrentPlayState = (): SavedGameplayState | null => {
    if (!engineRef.current?.player) return null;
    return {
      activeSceneIdx: activeSceneIdxRef.current,
      playerX: engineRef.current.player.x,
      playerY: engineRef.current.player.y,
      checkpoint: checkpointRef.current,
      progress: progressRef.current,
      inventory: inventoryRef.current,
      invSlots: invSlotsRef.current,
      equipment: equipmentRef.current,
      partyEquipment: partyEquipmentRef.current,
      switchVals: switchValsRef.current,
      selfSwitches: selfSwitchesRef.current,
      tp: tpRef.current,
      partyExtraHp: partyExtraHpRef.current
    };
  };

  const handleRestorePlayState = (state: SavedGameplayState) => {
    if (!state) return;
    activeSceneIdxRef.current = state.activeSceneIdx;
    if (engineRef.current?.player) {
      engineRef.current.player.x = state.playerX;
      engineRef.current.player.y = state.playerY;
      engineRef.current.player.vx = 0;
      engineRef.current.player.vy = 0;
    }
    checkpointRef.current = state.checkpoint;
    progressRef.current = state.progress;
    inventoryRef.current = state.inventory;
    setInventory(state.inventory);
    setInvSlots(state.invSlots);
    equipmentRef.current = state.equipment;
    setEquipment(state.equipment);
    partyEquipmentRef.current = state.partyEquipment ?? {};
    setPartyEquipment(state.partyEquipment ?? {});
    setSwitchVals(state.switchVals);
    selfSwitchesRef.current = state.selfSwitches;
    setTp(state.tp);
    setPartyExtraHp(state.partyExtraHp);
    forceRender(n => n + 1);
  };

  const loadManifest = (manifest: GameManifestDraft, titleOverride?: string) => {
    const { presetId: preset, data } = manifestToPresetData(manifest);
    applyPresetData(preset, data, titleOverride || manifest.name || data.name);
  };

  const handleRestoreHistory = (data: any) => {
    if (isPlaying || playOnly) {
      handleRestorePlayState(data);
    } else {
      loadManifest(data);
    }
  };

  const getCurrentDataForHistory = () => {
    if (isPlaying || playOnly) {
      return getCurrentPlayState();
    } else {
      return buildManifest();
    }
  };

  // ── パーティ制ターン戦闘（battle.style === 'ff' | 'mother3' | 'milky'）──
  // deltarune と同じ battle.party 設定を流用しつつ、弾幕よけを使わない独自のターン進行を持つ。
  // 2人目以降のHPは partyExtraHp（deltarune と共用）、MPは ptExtraMp に持つ（先頭は pr.hp/pr.mp を共有）。
  // ff/mother3＝全員のコマンドを選んでから一斉実行するラウンド制（mother3 はローリングHP、下記参照）。
  // milky＝行動値（av）が最小の者から行動するCTB。強い技ほど行動値コストが大きい。
  interface PtAction { memberId: string; kind: 'attack' | 'skill' | 'item' | 'defend'; move?: BattleMove; item?: ItemDef; target?: number; targetMemberId?: string; }
  interface PtView {
    /** select=コマンド選択中 / exec=キュー実行中 / enemy=敵ターン / idle=milkyの時間進行待ち */
    phase: 'select' | 'exec' | 'enemy' | 'idle';
    /** ff/mother3/milky: いま行動選択中のメンバー index */
    turnIdx: number;
    menu: 'root' | 'skill' | 'item' | 'target' | 'member';
    /** 対象選択待ちの保留行動（target=敵、member=味方）。 */
    pending: { kind: 'attack' | 'skill' | 'item'; move?: BattleMove; item?: ItemDef } | null;
    /** このラウンド「ぼうぎょ」中のメンバーID（被弾半減） */
    defended: string[];
    /** 現在のメニュー内でのキーボードカーソル位置（root/skill/item/target/member 共通）。 */
    menuCursor: number;
  }
  const PT_INIT: PtView = { phase: 'select', turnIdx: 0, menu: 'root', pending: null, defended: [], menuCursor: 0 };
  const [pt, setPt] = useState<PtView>(PT_INIT);
  const ptRef = useRef(pt);
  ptRef.current = pt;
  /** ref を同期更新しつつ state を書く（同フレーム内の連続ハンドラで最新値を読めるように）。
   *  menu/pending が変わるときはキーボードカーソルを自動で先頭へ戻す。 */
  const ptPatch = (patch: Partial<PtView>) => {
    const menuChanged = ('menu' in patch && patch.menu !== ptRef.current.menu) || ('pending' in patch && patch.pending !== ptRef.current.pending);
    const next = { ...ptRef.current, ...patch, ...(menuChanged && !('menuCursor' in patch) ? { menuCursor: 0 } : {}) };
    ptRef.current = next; setPt(next);
  };
  const ptQueueRef = useRef<PtAction[]>([]);
  const ptExecPosRef = useRef(0);
  /** 2人目以降のメンバーの戦闘中MP（先頭はフィールドの pr.mp を共有）。戦闘終了で破棄。 */
  const [ptExtraMp, setPtExtraMp] = useState<Record<string, number>>({});
  const ptExtraMpRef = useRef<Record<string, number>>({});
  ptExtraMpRef.current = ptExtraMp;
  /** mother3: メンバーごとの「表示中のHP」（実HPへ向けて1ティックずつ回転しながら増減する）。
   *  実HPが0以下になっても、この表示値が0へ落ちきるまでは戦闘不能にならない
   *  （回復すれば表示値はそこから実HPへ向けて戻り、致命傷から生還できる＝MOTHER3のローリングHP）。 */
  const mother3RollRef = useRef<Record<string, number>>({});
  /** mother3: 実HPが0以下なのに表示がまだ残っている（＝虫の息）メンバーID集合。演出の多重発火防止に使う。 */
  const mother3CritRef = useRef<Set<string>>(new Set());
  /** milky: 行動値。キーは 'm:<memberId>' / 'f:<foeIdx>'。値が最小の者から行動する。 */
  const milkyAvRef = useRef<Record<string, number>>({});
  const milkyActorRef = useRef<string | null>(null);
  /** milky: 行動値が0になって「選ばれた」が、まだ実行されていない予約中の行動（もう一度0に達したら実行）。 */
  const milkyPendingRef = useRef<Record<string, () => boolean | void>>({});
  /** milky: 行動値を同時カウントダウンさせる interval（常に1本だけ）。 */
  const milkyTickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** milky: 現在選択中（予約中）の技名。常時表示のステータス窓に出す。 */
  const [milkyAllySkillName, setMilkyAllySkillName] = useState('');
  const [milkyEnemySkillName, setMilkyEnemySkillName] = useState('');
  /** パーティ制戦闘の進行タイマー（常に1本だけ。戦闘終了時は active/over ガードで自然消滅）。 */
  const ptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ptDelay = (fn: () => void, ms: number) => {
    if (ptTimerRef.current) clearTimeout(ptTimerRef.current);
    ptTimerRef.current = setTimeout(() => {
      ptTimerRef.current = null;
      if (!battleRef.current.active || battleViewRef.current?.over) return;
      fn();
    }, ms);
  };
  useEffect(() => () => {
    if (ptTimerRef.current) clearTimeout(ptTimerRef.current);
    if (milkyTickTimerRef.current) clearInterval(milkyTickTimerRef.current);
  }, []);

  /** エンカウント和音用の AudioContext（遅延生成・単一インスタンス）とデコード済み音源キャッシュ。
   *  レンダリングのたびに new AudioContext() すると同時生成数のブラウザ上限（Chrome で約6個）に
   *  当たって以降の生成が例外になり音が出なくなるため、ref で一度だけ作って使い回す。
   *  バッファは Promise ごとキャッシュして、並行呼び出し時のフェッチ重複も防ぐ。 */
  const dtChordCtxRef = useRef<AudioContext | null>(null);
  const dtChordBufRef = useRef<Promise<AudioBuffer> | null>(null);

  /** デルタルーンのエンカウント演出音：単一の音源（snd_tensionhorn）を Web Audio API の
   *  AudioBufferSourceNode.playbackRate で再生する。HTMLMediaElement の playbackRate と違い
   *  ピッチ補正（タイムストレッチ）が入らないため、速度＝音程として確実にピッチが変わる。
   *  tlDR Engine 準拠：o_enc_anim の Create_0（pitch 1.0）→ alarm[0]=8 フレーム後の
   *  Alarm_0（pitch 1.1）＝ 30fps の 8f ≈ 266ms 遅れで高い方を重ねる。 */
  const playDtEncounterChord = async () => {
    const volume = applyMasterVolume(getBgmVolume('direct:dt-tensionhorn-chord')) / 100 * 0.7;
    try {
      const ctx = (dtChordCtxRef.current ??= new AudioContext());
      // ユーザー操作前に生成されていた場合は autoplay 制限で suspended のままなので起こす
      if (ctx.state === 'suspended') await ctx.resume();

      // 初回だけフェッチ＋デコードし、以降はデコード済みバッファを即座に使い回す
      dtChordBufRef.current ??= fetch(tldrSfxUrl('tensionHorn'))
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
        .then(ab => ctx.decodeAudioData(ab));
      const audioBuffer = await dtChordBufRef.current;

      const gainNode = ctx.createGain();
      gainNode.gain.value = volume;
      gainNode.connect(ctx.destination);

      const startTime = ctx.currentTime;
      for (const { rate, delay } of [{ rate: 1.0, delay: 0 }, { rate: 1.1, delay: 0.266 }]) {
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = rate;
        source.connect(gainNode);
        source.start(startTime + delay);
      }
    } catch (err: unknown) {
      // フェッチ/デコード失敗を Promise ごとキャッシュしたままにすると二度と鳴らなくなるので捨てる
      dtChordBufRef.current = null;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Unable to fetch or play the audio file. Error: ${message}`);
    }
  };
  /** デルタルーン風パーティ戦闘：全員のコマンド選択が終わるまでは実行せず、選び終わってから
   *  action_order（tlDR Engine 準拠：こうどう→アイテム→まほう→たたかう→まもる）で1件ずつ処理する。
   *  'select'＝選択中（メニューを回している）／'execute'＝選択済みキューを順に実行中。 */
  const dtStageRef = useRef<'select' | 'execute'>('select');
  const dtQueueRef = useRef<{ idx: number; kind: 'act' | 'item' | 'spell' | 'attack' | 'defend'; move?: BattleMove; item?: ItemDef; spell?: PartySpell; target?: number }[]>([]);
  /** 選択フェーズで確定済みの行動の履歴（Xキーで1つ前のメンバーへ戻って取り消すため。tlDR o_enc の
   *  CANCEL 処理＝action_queue の末尾 pop ＋ cancel() 準拠）。まもる(defend)はキューに積まれず選択時に
   *  即適用されるため、取り消しに必要な undo 情報（メンバーID・実際に増えたTP量）を持つ。 */
  const dtSelLogRef = useRef<{ idx: number; kind: 'act' | 'item' | 'spell' | 'attack' | 'defend'; memberId?: string; tpGained?: number }[]>([]);
  const dtExecPosRef = useRef(0);
  /** 実行フェーズ開始時に確定する「たたかう」担当メンバー一覧（キュー内の順）。参考実装（o_enc_fight）
   *  同様、選択が終わった全員ぶんのタイミングバーを縦に並べて同時表示し、1行ずつ順番に反応させる。 */
  const dtAttackRowsRef = useRef<number[]>([]);
  /** 各メンバーの解決結果。pos＝止めた瞬間の棒の位置（1=右端→0=左端）で、行の表示を凍結するのに使う。 */
  const [dtAttackDone, setDtAttackDone] = useState<Record<number, { result: 'hit' | 'crit' | 'miss'; pos: number }>>({});
  /** 各行の走る棒のDOM要素。全行が並行して毎フレーム動くため、React再レンダリングを避けて直接 style.left を書く。 */
  const dtStickElsRef = useRef<Record<number, HTMLDivElement | null>>({});
  /** タイミングバーの的（パーフェクト）中心位置。左端固定（tlDR o_enc_fightstick の x84-90 相当）。
   *  棒の位置 s は 1=右端 → 0=左端 で表す。 */
  const DT_FIGHT_TARGET = 0.08;
  /** メンバーごとの一時アニメ（attack/act/spell/item/hurt）。値が無いメンバーは idle
   *  （倒れていれば defeat、まもる中なら defend）を表示する。seq は古いタイマーの誤消去防止。 */
  const [dtAnimFx, setDtAnimFx] = useState<Record<string, { kind: keyof PartyBattleSprites; seq: number } | undefined>>({});
  const dtAnimSeqRef = useRef(0);
  /** メンバー被弾時に、そのキャラの頭上へダメージ量をポップアップ表示する（敵側の演出と同型）。 */
  const [dtDmgPopups, setDtDmgPopups] = useState<Record<string, { text: string; id: number } | undefined>>({});
  const dtDmgFxIdRef = useRef(0);
  const triggerMemberDamageFx = (memberId: string, dmg: number) => {
    const id = ++dtDmgFxIdRef.current;
    setDtDmgPopups(p => ({ ...p, [memberId]: { text: String(dmg), id } }));
    setTimeout(() => setDtDmgPopups(p => (p[memberId]?.id === id ? { ...p, [memberId]: undefined } : p)), 700);
  };
  const dtPlayMemberAnim = (memberId: string, kind: keyof PartyBattleSprites, ms: number) => {
    if (gameDataRef.current.battle?.style !== 'deltarune') return;
    const seq = ++dtAnimSeqRef.current;
    setDtAnimFx(p => ({ ...p, [memberId]: { kind, seq } }));
    setTimeout(() => setDtAnimFx(p => (p[memberId]?.seq === seq ? { ...p, [memberId]: undefined } : p)), ms);
  };
  const undertaleDodgeRef = useRef<{
    frames: number; duration: number; pattern: number; dmg: number;
    /** 弾幕を放っている敵の数（生存数）。スクリプト/内蔵パターンがこの数だけ並走し、敵が減ると弾幕も薄くなる */
    attackers: number;
    bullets: { x: number; y: number; vx: number; vy: number; r: number; color?: string; grazed?: boolean }[];
    hx: number; hy: number; invuln: number; miniScript?: string; scriptCtx?: { cancelled: boolean };
    mode: UndertaleMode;
    grazeFx?: number;                                // deltarune: グレイズ演出の残フレーム
    gvy: number; grounded: boolean;                 // blue: 重力速度・接地判定
    jumpHeld: number;                                // blue: ジャンプキー押下継続フレーム（可変ジャンプ）
    shieldDir: 'up' | 'down' | 'left' | 'right' | null; // green: シールド方向
    lane: number;                                    // purple: 現在のレーン(0-2)
    shots: { x: number; y: number; vy: number }[];   // yellow: 自機弾
    shotCool: number;                                // yellow: 連射防止クールダウン
  } | null>(null);
  const undertaleBarRef = useRef({ pos: 0 });
  const undertaleBarElRef = useRef<HTMLDivElement | null>(null);
  const undertaleCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
  /** つるつる床（システムタイル）：強制スライド中の目標座標。null なら通常操作。 */
  const iceSlideRef = useRef<{ targetX: number; targetY: number } | null>(null);
  /** つるつる床の多重発動防止：直近に発動開始したタイル座標キー。 */
  const lastIceTileRef = useRef<string | null>(null);
  /** システムタイル（どく沼/ダメージ床/ワープ床）：無敵時間中の多重発動防止に invulnRef を流用。 */
  const roundOverRef = useRef(false);    // ミス/ゲームオーバー/クリア演出中（操作・進行を凍結）
  const isPlayerDeadRef = useRef(false); // 残機制：死亡→復帰待ち中
  const gameOverActiveRef = useRef(false); // ゲームオーバー画面表示中（プレイヤーを非表示にする）
  const livesRef = useRef(3);            // 残機数
  const scoreRef = useRef(0);            // スコア
  const actionDirRef = useRef<1 | -1>(1);     // action エンジン：プレイヤー向き
  /** rpg/touhou: 入力中の方向（移動不可でも向きを更新するために使用）*/
  const playerInputDirRef = useRef<WayKey | null>(null);
  /** rpg: ブロックされたときの向き（静止中に overrideDir として渡すために保持）*/
  const playerBlockedDirRef = useRef<WayKey | null>(null);
  /** rpg: 直前フレームのプレイヤー描画位置（静止判定に使用）*/
  const lastDrawnPlayerPosRef = useRef<{ x: number; y: number } | null>(null);
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
  // thrown: プレイヤーが投げたボム（🎯/💀）のみ true。爆発時の地形破壊はこのボムだけが起こす。
  const onjBombsRef = useRef<{ x: number; y: number; fuse: number; maxFuse: number; r: number; dmg: number; head: boolean; thrown?: boolean; srcUrl?: string; owner?: Entity }[]>([]);   // 着地済み・導火線カウント中のボム（中心座標）
  const onjFliesRef = useRef<{ fx: number; fy: number; tx: number; ty: number; t: number; dur: number; fuse: number; r: number; dmg: number; head: boolean; srcUrl?: string; owner?: Entity }[]>([]); // 放物線で飛行中のボム/首
  const onjBlastsRef = useRef<{ x: number; y: number; life: number; maxLife: number; r: number }[]>([]);  // 爆発エフェクト
  const onjBombCoolRef = useRef(0);   // 💣設置のクールダウン（長押し連打）
  const onjThrowCoolRef = useRef(0);  // 🎯投げ／💀首爆弾のクールダウン

  const bossDefeatedRef = useRef(false);
  /** NPCに接触中のセリフ表示（フキダシではなく頭上に1文字ずつ表示） */
  const npcTalkRef = useRef<{ entity: Entity; text: string; startTime: number; wrapped?: string[]; lastShown: number } | null>(null);
  /** アイテム取得演出（メッセージウィンドウではなく頭上に一定時間表示） */
  const itemGetRef = useRef<{ text: string; startTime: number } | null>(null);
  /** アンダーテール風戦闘：敵へのダメージ数値ポップアップ（黒文字・赤フチ・見崎フォント）。
   *  複数体戦に対応するため foes 配列のインデックスをキーに敵ごとへ独立表示する。
   *  miss=true はダメージ数値の代わりに灰色の「MISS」を出す（こうげきをハズしたとき）。 */
  const [enemyDmgPopup, setEnemyDmgPopup] = useState<Record<number, { text: string; id: number; miss?: boolean } | undefined>>({});
  /** アンダーテール風戦闘：敵HPゲージ（敵ごと）。被ダメージ時のみ一時的に表示し、減少アニメーション後に隠す */
  const [enemyGaugeAnim, setEnemyGaugeAnim] = useState<Record<number, { pct: number; id: number } | undefined>>({});
  const [enemyShakeFx, setEnemyShakeFx] = useState<Record<number, { id: number } | undefined>>({});
  /** バトル演出用エフェクトアニメーション（EffectPreset）の再生中インスタンス一覧。
   *  foeIdx 指定時は該当する敵スロット内に重ねて表示し、未指定（パーティ側）は現状 castSpell/doMove の
   *  攻撃系（敵へ命中）のみ配線済み。「見方が受ける」側の演出（EnemyMove 由来）は今回未配線。 */
  const [battleEffects, setBattleEffects] = useState<{ key: string; effect: EffectPreset; url: string; foeIdx?: number }[]>([]);
  const spawnBattleEffect = (effectId: string | undefined, foeIdx?: number) => {
    if (!effectId) return;
    const effect = (gameDataRef.current.effects ?? []).find(e => e.id === effectId);
    if (!effect) return;
    const url = imageRefToUrl(effect.imageRef) ?? effect.imageUrl;
    if (!url) return;
    const key = `${effectId}-${Date.now()}-${Math.random()}`;
    setBattleEffects(list => [...list, { key, effect, url, foeIdx }]);
  };
  const removeBattleEffect = (key: string) => setBattleEffects(list => list.filter(e => e.key !== key));
  /** アンダーテール/デルタルーン風戦闘：撃破演出中（発光→分解して消える）の敵。foes 配列のインデックスをキーに
   *  独立管理し、演出が終わるまでは f.gone=true でも描画を続ける（消える瞬間まで枠を占有させ、演出後に
   *  ビュートランジションで残りの敵をなめらかに詰める）。 */
  const [dyingFoes, setDyingFoes] = useState<Record<number, { id: number } | undefined>>({});
  const enemyFxIdRef = useRef(0);
  const ENEMY_DMG_POPUP_MS = 700;
  const ENEMY_DEFEAT_FX_MS = 650;
  const ENEMY_BUBBLE_CHAR_MS = 45;
  const ENEMY_BUBBLE_HOLD_MS = 520;
  const ENEMY_BUBBLE_TO_COMBAT_MS = 120;
  const queuedUndertaleTurnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enemyBubbleClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undertaleCombatStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearQueuedUndertaleTurnTimer = () => {
    if (queuedUndertaleTurnTimerRef.current) clearTimeout(queuedUndertaleTurnTimerRef.current);
    queuedUndertaleTurnTimerRef.current = null;
  };
  const clearEnemyBubbleTimers = () => {
    if (enemyBubbleClearTimerRef.current) clearTimeout(enemyBubbleClearTimerRef.current);
    if (undertaleCombatStartTimerRef.current) clearTimeout(undertaleCombatStartTimerRef.current);
    enemyBubbleClearTimerRef.current = null;
    undertaleCombatStartTimerRef.current = null;
  };
  useEffect(() => () => {
    clearQueuedUndertaleTurnTimer();
    clearEnemyBubbleTimers();
  }, []);
  /** 対象の敵へダメージを与えた際に、ダメージ数値とHPゲージの減少演出をまとめて発火する。 */
  const triggerEnemyDamageFx = (foeIdx: number, dmg: number, beforeHp: number, afterHp: number, maxHp: number) => {
    const id = ++enemyFxIdRef.current;
    const beforePct = Math.max(0, Math.min(100, (beforeHp / maxHp) * 100));
    const afterPct = Math.max(0, Math.min(100, (afterHp / maxHp) * 100));
    setEnemyDmgPopup(p => ({ ...p, [foeIdx]: { text: String(dmg), id } }));
    setEnemyGaugeAnim(p => ({ ...p, [foeIdx]: { pct: beforePct, id } }));
    setEnemyShakeFx(p => ({ ...p, [foeIdx]: { id } }));
    // 次のフレームで実際のHP%へ更新し、CSSトランジションで減少アニメーションを見せる
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setEnemyGaugeAnim(p => (p[foeIdx]?.id === id ? { ...p, [foeIdx]: { pct: afterPct, id } } : p));
    }));
    setTimeout(() => setEnemyDmgPopup(p => (p[foeIdx]?.id === id ? { ...p, [foeIdx]: undefined } : p)), ENEMY_DMG_POPUP_MS);
    setTimeout(() => setEnemyGaugeAnim(p => (p[foeIdx]?.id === id ? { ...p, [foeIdx]: undefined } : p)), 1200);
    setTimeout(() => setEnemyShakeFx(p => (p[foeIdx]?.id === id ? { ...p, [foeIdx]: undefined } : p)), 400);
  };
  /** こうげきをハズしたとき：ダメージ数値の代わりに対象の敵の頭上へ「MISS」を出す（HPゲージは出さない）。 */
  const triggerEnemyMissFx = (foeIdx: number) => {
    const id = ++enemyFxIdRef.current;
    setEnemyDmgPopup(p => ({ ...p, [foeIdx]: { text: 'MISS', id, miss: true } }));
    setTimeout(() => setEnemyDmgPopup(p => (p[foeIdx]?.id === id ? { ...p, [foeIdx]: undefined } : p)), ENEMY_DMG_POPUP_MS);
  };
  /** ブラウザが View Transitions API に対応していれば使い、残りの敵が新しい位置へなめらかに詰まるように
   *  する（各敵の枠に viewTransitionName を振っているため、対応ブラウザでは個別に位置/サイズが補間される）。
   *  非対応ブラウザでは通常どおり即時に反映する。 */
  const withViewTransition = (fn: () => void) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
    if (typeof doc.startViewTransition === 'function') {
      doc.startViewTransition(() => flushSync(fn));
    } else {
      fn();
    }
  };
  /** 敵を撃破したとき：一瞬発光してから分解して消えるヴェイパライズ演出＋SEを再生する。
   *  f.gone は damageFoe 側で即座に立てているのでゲームロジックはそのまま進むが、描画上は
   *  ENEMY_DEFEAT_FX_MS の間だけ枠を残し、消える瞬間に残りの敵をビュートランジションで詰める。 */
  const triggerEnemyDefeatFx = (foeIdx: number) => {
    const id = ++enemyFxIdRef.current;
    setDyingFoes(p => ({ ...p, [foeIdx]: { id } }));
    if (undertaleSfx) playSfx(undertaleSfx.defeat);
    setTimeout(() => {
      withViewTransition(() => {
        setDyingFoes(p => (p[foeIdx]?.id === id ? { ...p, [foeIdx]: undefined } : p));
      });
    }, ENEMY_DEFEAT_FX_MS);
  };
  const bossWarnRef = useRef(false);    // ゴールでのボス未撃破警告を一度だけ出す
  const bossOutroRef = useRef<DialogueLine[] | null>(null); // ボス撃破後のセリフ
  /** アンダーテール風エンカウント演出：頭上に「！」→ プレイヤーがハートに変わって明滅しつつ
   *  バトル画面のコマンド位置へ直線移動 → バトル開始 */
  const encounterAlertRef = useRef<{
    startTime: number; fire: () => void; phase: 'alert' | 'flash';
    fromX: number; fromY: number; toX: number; toY: number;
  } | null>(null);
  const ENCOUNTER_ALERT_MS = 650;
  const ENCOUNTER_FLASH_MS = 450; // ハートが移動しながら明滅する演出の表示時間。SEの再生完了は待たない（短く保つ）
  const UNDERTALE_SHOOT_SFX = { ref: 'direct:undertale-shoot', src: 'https://rpgen-search.pages.dev/audio/sound/pMxknZ.mp3', type: 'direct' as const };
  /** メッセージウィンドウ送り／持ち物の選択・確定・せつめい・すてる共通のUI効果音（UNDERTALE戦闘系以外のプリセット用）。 */
  const MSG_ADVANCE_SFX = { ref: 'direct:msg-advance', src: 'https://rpgen-search.pages.dev/audio/sound/OzsJfs.mp3', type: 'direct' as const };
  /** UNDERTALE戦闘（FIGHT/ACT/ITEM/MERCY・弾幕よけ）を持つプリセットごとの専用SE一式。
   *  アンダーテールとデルタルーンはどちらも同じ battle.style==='undertale' を使うが、
   *  出典が異なる音源（それぞれのエンジンのCDN）を鳴らし分ける。 */
  const UNDERTALE_SFX_BY_PRESET = {
    undertale: {
      encounter: { ref: 'direct:undertale-encounter', src: undertaleSfxUrl('snd_exclamation'), type: 'direct' as const },
      enemyDamage: { ref: 'direct:undertale-enemy-damage', src: undertaleSfxUrl('snd_damage'), type: 'direct' as const },
      battleStart: { ref: 'direct:undertale-battlestart', src: undertaleSfxUrl('snd_encounter_undertale_move'), type: 'direct' as const },
      menuSwitch: { ref: 'direct:undertale-menu-switch', src: undertaleSfxUrl('snd_menu_switch'), type: 'direct' as const },
      menuConfirm: { ref: 'direct:undertale-menu-confirm', src: undertaleSfxUrl('snd_menu_confirm'), type: 'direct' as const },
      menuCancel: { ref: 'direct:undertale-menu-cancel', src: undertaleSfxUrl('snd_menu_cancel'), type: 'direct' as const },
      textTyper: { ref: 'direct:undertale-text-typer', src: undertaleSfxUrl('snd_text_voice_typer'), type: 'direct' as const },
      textVoice: { ref: 'direct:undertale-text-voice', src: undertaleSfxUrl('snd_text_voice_default'), type: 'direct' as const },
      defeat: { ref: 'direct:undertale-defeat', src: undertaleSfxUrl('snd_vaporize'), type: 'direct' as const },
    },
    deltarune: {
      encounter: { ref: 'direct:deltarune-encounter', src: tldrSfxUrl('exclamation'), type: 'direct' as const },
      enemyDamage: { ref: 'direct:deltarune-enemy-damage', src: tldrSfxUrl('damage'), type: 'direct' as const },
      battleStart: { ref: 'direct:deltarune-battlestart', src: tldrSfxUrl('tensionHorn'), type: 'direct' as const },
      menuSwitch: { ref: 'direct:deltarune-menu-switch', src: tldrSfxUrl('uiMove'), type: 'direct' as const },
      menuConfirm: { ref: 'direct:deltarune-menu-confirm', src: tldrSfxUrl('uiSelect'), type: 'direct' as const },
      menuCancel: { ref: 'direct:deltarune-menu-cancel', src: tldrSfxUrl('uiCancel'), type: 'direct' as const },
      textTyper: { ref: 'direct:deltarune-text-typer', src: tldrSfxUrl('text'), type: 'direct' as const },
      textVoice: { ref: 'direct:deltarune-text-voice', src: tldrSfxUrl('text'), type: 'direct' as const },
      defeat: { ref: 'direct:deltarune-defeat', src: tldrSfxUrl('break1'), type: 'direct' as const },
    },
  } as const;
  const undertaleSfx = UNDERTALE_SFX_BY_PRESET[presetId as keyof typeof UNDERTALE_SFX_BY_PRESET];
  const isUndertalePreset = !!undertaleSfx;
  /** メニューで選択を決定したときのSE。UNDERTALE戦闘系プリセットは専用の決定音、それ以外は共通のUI効果音を使う。 */
  const playMenuConfirmSfx = () => playSfx(undertaleSfx ? undertaleSfx.menuConfirm : MSG_ADVANCE_SFX);
  /** メニューをキャンセル・後退したときのSE。UNDERTALE戦闘系プリセットは専用のキャンセル音、それ以外は共通のUI効果音を使う。 */
  const playMenuCancelSfx = () => playSfx(undertaleSfx ? undertaleSfx.menuCancel : MSG_ADVANCE_SFX);
  /** UNDERTALE戦闘系プリセットではバトル開始前に「！」演出を挟む。それ以外は即開始。
   *  デルタルーンはアンダーテールと違い「！」マーク・専用SEを出さない（Deltarune本編の遭遇演出に
   *  準拠）ため、'alert' フェーズを飛ばして直接 'flash'（BGM停止＋テンションホルンの和音＋
   *  剣を抜く音＋黒フラッシュ）から始める。 */
  const triggerEncounter = (fire: () => void) => {
    if (encounterAlertRef.current) return; // 演出中の多重トリガー防止
    if (presetId === 'deltarune') {
      encounterAlertRef.current = { startTime: performance.now(), fire, phase: 'flash', fromX: 0, fromY: 0, toX: 0, toY: 0 };
      switchBgm(undefined);
      playDtEncounterChord();
      setTimeout(() => playSfx(DT_SFX.weaponPull), 400);
    } else if (undertaleSfx) {
      const p2 = engineRef.current.player;
      const fromX = p2.x + (gameDataRef.current.player.w ?? TILE_SIZE) / 2;
      const fromY = p2.y + (gameDataRef.current.player.h ?? TILE_SIZE) / 2;
      // 移動先＝現在のカメラオフセットを基準に、画面上で常に中央下部（バトル画面の
      // FIGHT/ACT/ITEM/MERCYコマンド位置）に一致するワールド座標を逆算する
      // （プレイヤーがマップ端でカメラがクランプされていてもズレない）
      const toX = camXRef.current + VIEW_W / 2;
      const toY = camYRef.current + VIEW_H - 26;
      encounterAlertRef.current = { startTime: performance.now(), fire, phase: 'alert', fromX, fromY, toX, toY };
      playSfx(undertaleSfx.encounter);
    } else {
      fire();
    }
  };
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

  // ── 衝突バウンダリ表示 ──
  const [showCollisionBoundaries, setShowCollisionBoundaries] = useState(false);
  const showCollisionBoundariesRef = useRef(false);
  useEffect(() => { showCollisionBoundariesRef.current = showCollisionBoundaries; }, [showCollisionBoundaries]);

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
    setBattle(v => (v ? { ...v, enemyHp: battleRef.current.enemyHp, mercy: battleRef.current.mercy, foes: battleRef.current.foes.map(f => ({ ...f })), log: [...v.log, line].slice(-6), ...patch } : v));
  /** foes の最新状態（HP/敵意/撃破）だけをログなしで BattleView へ反映する。 */
  const syncFoesView = () =>
    setBattle(v => (v ? { ...v, foes: battleRef.current.foes.map(f => ({ ...f })) } : v));
  /** まだ戦っている（撃破もみのがしもされていない）敵の foes 配列インデックス一覧。 */
  const aliveFoeIdxs = () => battleRef.current.foes.map((f, i) => (f.gone ? -1 : i)).filter(i => i >= 0);
  /** battle.style が 'undertale' の弾幕よけ・タイミング攻撃を流用するスタイルか（'undertale' 本体 と 'deltarune'）。 */
  const isDodgeBattleStyle = (s?: string) => s === 'undertale' || s === 'deltarune';
  /** battle.style がパーティ制ターン戦闘（弾幕なし）のスタイルか（ff/mother3/milky）。 */
  const isPartyBattleStyle = (s?: string) => s === 'ff' || s === 'mother3' || s === 'milky';
  /** デルタルーン風パーティの現在の状態一覧。先頭(index 0)はフィールドの pr.hp/pr.maxHp を共有し、
   *  2人目以降は partyExtraHpRef の戦闘中一時HPを参照する。 */
  const dtParty = (): { id: string; name: string; emoji: string; hp: number; maxHp: number }[] => {
    const pr = progressRef.current;
    // party 未設定（例: エディタでスタイルだけ 'deltarune' に切り替えた場合）は
    // フィールドの操作キャラ1人だけのパーティとして扱う（'undertale' と同等の見た目にフォールバック）。
    const members = gameDataRef.current.battle?.party?.length
      ? gameDataRef.current.battle.party
      : [{ id: '__self', name: gameDataRef.current.battle?.playerName ?? 'プレイヤー', emoji: '❤️', maxHp: pr.maxHp }];
    return members.map((m, i) => i === 0
      ? { id: m.id, name: m.name, emoji: m.emoji, hp: pr.hp, maxHp: pr.maxHp }
      : { id: m.id, name: m.name, emoji: m.emoji, hp: partyExtraHpRef.current[m.id] ?? m.maxHp, maxHp: m.maxHp });
  };
  /** 指定メンバーのHPを更新する（先頭メンバーはフィールドの pr.hp、以降は戦闘専用の一時HP）。 */
  const dtSetHp = (id: string, hp: number) => {
    const members = gameDataRef.current.battle?.party;
    const clamped = Math.max(0, hp);
    if (!members?.length ? id === '__self' : members[0].id === id) { progressRef.current.hp = clamped; forceHud(n => n + 1); }
    else { const next = { ...partyExtraHpRef.current, [id]: clamped }; partyExtraHpRef.current = next; setPartyExtraHp(next); }
  };
  const dtAllDown = () => dtParty().length > 0 && dtParty().every(m => m.hp <= 0);
  /** 弾幕の被弾ダメージを受けるメンバー。tlDR Engine の敵ターン標準（生存者からランダムに1人）と同じ。 */
  const dtPickTarget = () => {
    const alive = dtParty().filter(m => m.hp > 0);
    return alive.length ? alive[Math.floor(Math.random() * alive.length)] : null;
  };
  /** 被弾処理。まもる中は 2/3 に軽減（tlDR Engine の damage() 準拠）。HP が尽きたら down（HP0で戦闘離脱、
   *  全員 down で敗北。参考実装は HP=-maxHp/2 まで掘るが、負のHP表示を持たないため 0 止まりにしている）。 */
  const dtDamageMember = (m: { id: string; hp: number }, dmg: number) => {
    const reduced = dtDefendedRef.current.has(m.id) ? Math.max(1, Math.round(dmg * 2 / 3)) : dmg;
    dtSetHp(m.id, m.hp - reduced);
    dtPlayMemberAnim(m.id, 'hurt', 500);
    triggerMemberDamageFx(m.id, reduced);
  };
  /** 回復処理（呪文用）。down 中のメンバーは、参考実装（HP=-maxHp/2 からの回復）に合わせて
   *  回復量が maxHp/2 を超えたときだけ復帰し、復帰HPは 17% を下限とする。復帰したら true を返す。 */
  const dtHealMember = (id: string, heal: number): boolean => {
    const cur = dtParty().find(x => x.id === id);
    if (!cur) return false;
    if (cur.hp <= 0) {
      const fromDown = heal - Math.floor(cur.maxHp / 2);
      if (fromDown <= 0) return false; // 回復量不足：たおれたまま
      dtSetHp(id, Math.min(cur.maxHp, Math.max(Math.ceil(cur.maxHp * 0.17), fromDown)));
      return true;
    }
    dtSetHp(id, Math.min(cur.maxHp, cur.hp + heal));
    return false;
  };

  /** パーティ制ターン戦闘のメンバー状態一覧。先頭はフィールドの pr（HP/MP/攻/防）を共有し、
   *  2人目以降のHP/MPは戦闘中の一時状態。atk/def/maxMp 未指定の同行者は先頭の現在値を流用する。 */
  const ptParty = () => {
    const pr = progressRef.current;
    const cfg = gameDataRef.current.battle;
    const members: PartyMember[] = cfg?.party?.length
      ? cfg.party
      : [{ id: '__self', name: cfg?.playerName ?? 'プレイヤー', emoji: gameDataRef.current.player.emoji || '🧝', maxHp: pr.maxHp }];
    return members.map((m, i) => i === 0
      ? { id: m.id, name: m.name, emoji: m.emoji, color: m.color, battleSprites: m.battleSprites, spriteRef: m.spriteRef ?? gameDataRef.current.player.spriteRef, spriteUrl: m.spriteUrl ?? gameDataRef.current.player.spriteUrl, hp: pr.hp, maxHp: pr.maxHp, mp: pr.mp, maxMp: pr.maxMp, atk: pr.atk, def: pr.def }
      : { id: m.id, name: m.name, emoji: m.emoji, color: m.color, battleSprites: m.battleSprites, spriteRef: m.spriteRef, spriteUrl: m.spriteUrl, hp: partyExtraHpRef.current[m.id] ?? m.maxHp, maxHp: m.maxHp, mp: ptExtraMpRef.current[m.id] ?? (m.maxMp ?? pr.maxMp), maxMp: m.maxMp ?? pr.maxMp, atk: m.atk ?? pr.atk, def: m.def ?? pr.def });
  };
  /** ff/mother3: 歩行グラ（walk:...）をその場足踏みアニメで表示する。dir='s'=正面向き（mother3）、
   *  dir='a'=左向き（FFのサイドビュー）。battleSprites が無いメンバーの絵文字フォールバックの手前で使う。 */
  const partyWalkFrame = (spriteUrl: string | undefined, spriteRef: string | undefined, dir: 'a' | 's', size: number, walking = true) => {
    if (!spriteUrl) return null;
    const stdId = spriteRef ? parseWalkRef(spriteRef)?.stdId ?? 'auto' : 'auto';
    return <WalkSpritePreview url={spriteUrl} stdId={stdId} dir={dir} walking={walking} size={size} className="[image-rendering:pixelated]" />;
  };
  /** 指定メンバーのMPを更新する（先頭はフィールドの pr.mp、以降は戦闘専用の一時MP）。 */
  const ptSetMp = (id: string, mp: number) => {
    const members = gameDataRef.current.battle?.party;
    const clamped = Math.max(0, mp);
    if (!members?.length ? id === '__self' : members[0].id === id) { progressRef.current.mp = clamped; forceHud(n => n + 1); }
    else { const next = { ...ptExtraMpRef.current, [id]: clamped }; ptExtraMpRef.current = next; setPtExtraMp(next); }
  };
  /** mother3: 現在「表示されている」HP。実HPへ向けて毎ティック回転しながら増減する演出値
   *  （mother3Tick 参照）。mother3 以外のスタイルでは実HPをそのまま返す。 */
  const ptDisplayHp = (m: { id: string; hp: number }) =>
    gameDataRef.current.battle?.style === 'mother3' ? (mother3RollRef.current[m.id] ?? m.hp) : m.hp;
  /** mother3 では表示HP（ローリング中の値）が0に落ちきるまでは戦闘不能扱いにしない。 */
  const ptIsDown = (m: { id: string; hp: number }) => ptDisplayHp(m) <= 0;
  /** パーティ制戦闘の被弾処理。ぼうぎょ中はダメージ半減。実ダメージを返す。 */
  const ptDamageMember = (m: { id: string; hp: number; maxHp: number }, dmg: number) => {
    const reduced = ptRef.current.defended.includes(m.id) ? Math.max(1, Math.ceil(dmg / 2)) : dmg;
    dtSetHp(m.id, m.hp - reduced);
    triggerMemberDamageFx(m.id, reduced);
    return reduced;
  };
  const ptAliveMembers = () => ptParty().filter(mm => !ptIsDown(mm));
  const ptAllDown = () => ptParty().every(mm => ptIsDown(mm));

  /** mother3: 表示HPを実HPへ向けて少しずつ動かす（Mother3のローリングHP演出）。実HPが0以下でも
   *  表示がまだ残っていれば「虫の息」として生存扱いのまま。表示が0へ落ちきった瞬間に本当の戦闘不能となり、
   *  そのときパーティ全滅なら敗北を確定する。回復すれば表示は現在値からそのまま新しい実HPへ向け戻る。 */
  const mother3Tick = () => {
    if (!battleRef.current.active || battleViewRef.current?.over || gameDataRef.current.battle?.style !== 'mother3') return;
    let changed = false;
    for (const m of ptParty()) {
      const disp = mother3RollRef.current[m.id] ?? m.hp;
      if (disp === m.hp) { if (m.hp > 0) mother3CritRef.current.delete(m.id); continue; }
      const diff = m.hp - disp;
      const stepMag = Math.max(1, Math.round(Math.abs(diff) * 0.14));
      let next = disp + Math.sign(diff) * stepMag;
      if ((diff > 0 && next > m.hp) || (diff < 0 && next < m.hp)) next = m.hp;
      mother3RollRef.current[m.id] = next;
      changed = true;
      if (m.hp <= 0) {
        if (!mother3CritRef.current.has(m.id) && disp > 0) {
          mother3CritRef.current.add(m.id);
          shakeRef.current = 14;
          playSfx(sfxRef.current.damage);
          appendLog(`${m.name}に クリティカルダメージ！`, { canAct: ptRef.current.phase === 'select' });
        }
        if (next <= 0) {
          mother3CritRef.current.delete(m.id);
          if (ptAllDown()) setTimeout(() => endBattle('lose'), 500);
        }
      } else {
        mother3CritRef.current.delete(m.id);
      }
    }
    if (changed) forceHud(n => n + 1);
  };
  useEffect(() => {
    if (gameData.battle?.style !== 'mother3') return;
    const iv = setInterval(mother3Tick, 60);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameData.battle?.style]);

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

  /** BGM を即時切り替えるヘルパー。src がなければ停止。
   *  type:'direct'（tlDR CDN等の直リンクmp3/ogg/wav）も他のBGM切替箇所（ボスBGM等）と同様に
   *  bgmManager へそのまま渡す（以前は 'direct' だけ除外して停止していたため、
   *  デルタルーンの battleBgm/bossBgm が一切再生されないバグになっていた）。 */
  const switchBgm = (bgm?: { src?: string; type?: 'youtube' | 'mml' | 'direct'; ref?: string }) => {
    if (bgm?.src) {
      const loopOption = getLoopOption(bgm.ref);
      const volume = getBgmVolume(bgm.ref);
      bgmManager.play({ bgm: { type: bgm.type ?? 'youtube', src: bgm.src, loop: loopOption, volume } as any, tileset: {} });
    } else {
      bgmManager.stop();
    }
  };

  const beginBattle = (opts: { name: string; emoji: string; hp: number; atk: number; def: number; exp: number; gold?: number; moves?: { name: string; power: number; heal?: boolean; miniScript?: string; undertaleMode?: UndertaleMode; dialogue?: (string | EnemyDialogueLine)[] }[]; miniScript?: string; undertaleMode?: UndertaleMode; dialogue?: (string | EnemyDialogueLine)[]; battleSprite?: EnemyBattleSprite; entity?: Entity | null; isBoss?: boolean; encounterMax?: number; outroDialogue?: DialogueLine[] }) => {
    // バトル開始位置を記録し、終了後はここへ正確に復帰させる
    const startEng = engineRef.current;
    battleReturnPosRef.current = { x: startEng.player.x, y: startEng.player.y };
    // undertale/deltarune のシンボルエンカウントは同種の敵が1〜3体現れる（ボスは常に1体、
    // encounterMax=1 のストーリーキャラも1体固定）。
    // 2体以上のときは Ａ/Ｂ/Ｃ を付けて呼び分ける（原作の Froggit Ａ/Ｂ 方式）。
    const dodgeStyle = isDodgeBattleStyle(gameDataRef.current.battle?.style);
    const partyStyle = isPartyBattleStyle(gameDataRef.current.battle?.style);
    const milkyStyle = gameDataRef.current.battle?.style === 'milky';
    const maxCount = Math.max(1, Math.min(3, opts.encounterMax ?? 3));
    // milky はミルキークエスト2風の完全1対1決闘なので、複数体エンカウントでも常に1体だけを相手にする。
    const foeCount = milkyStyle ? 1 : (dodgeStyle || partyStyle) && !opts.isBoss ? 1 + Math.floor(Math.random() * maxCount) : 1;
    const suffix = ['Ａ', 'Ｂ', 'Ｃ'];
    const foes: BattleFoe[] = Array.from({ length: foeCount }, (_, i) => ({
      name: foeCount > 1 ? `${opts.name}${suffix[i]}` : opts.name,
      emoji: opts.emoji, sprite: opts.battleSprite,
      hp: opts.hp, maxHp: opts.hp, mercy: 0,
      exp: opts.exp, gold: opts.gold ?? Math.round(opts.exp * 0.6),
      dialogue: opts.dialogue,
    }));
    battleRef.current = {
      active: true, entity: opts.entity ?? null, enemyName: opts.name, enemyHp: opts.hp, enemyMaxHp: opts.hp,
      enemyAtk: opts.atk, enemyDef: opts.def, enemyMoves: opts.moves ?? [], exp: opts.exp,
      gold: opts.gold ?? Math.round(opts.exp * 0.6), isBoss: !!opts.isBoss, mercy: 0, foes,
      miniScript: opts.miniScript, undertaleMode: opts.undertaleMode, dialogue: opts.dialogue,
    };
    lastActRef.current = null;
    setBattleItemsOpen(false); setBagOpen(false);
    setUndertalePhase('menu'); setUndertaleMenu('root'); undertaleDodgeRef.current = null;
    clearEnemyBubble();
    // デルタルーン風パーティ戦闘：TPは毎戦闘0から、2人目以降のHPは各自 maxHp から再開、行動選択は先頭メンバーから
    if (gameDataRef.current.battle?.style === 'deltarune') {
      setTp(0); tpRef.current = 0;
      const party = gameDataRef.current.battle.party ?? [];
      const initHp: Record<string, number> = {};
      party.slice(1).forEach(m => { initHp[m.id] = m.maxHp; });
      setPartyExtraHp(initHp); partyExtraHpRef.current = initHp;
      setDtTurnIdx(0); dtTurnIdxRef.current = 0;
      dtDefendedRef.current = new Set();
      dtStageRef.current = 'select'; dtQueueRef.current = []; dtSelLogRef.current = []; dtExecPosRef.current = 0;
      dtAttackRowsRef.current = []; setDtAttackDone({}); dtStickElsRef.current = {};
    }
    // パーティ制ターン戦闘（ff/mother3/milky）：同行者のHP/MPは毎戦闘 maxHp/maxMp から、
    // ローリングHP・行動値も毎戦闘リセットする
    if (partyStyle) {
      const cfg = gameDataRef.current.battle!;
      const party = cfg.party ?? [];
      const initHp: Record<string, number> = {};
      const initMp: Record<string, number> = {};
      party.slice(1).forEach(m => { initHp[m.id] = m.maxHp; initMp[m.id] = m.maxMp ?? progressRef.current.maxMp; });
      setPartyExtraHp(initHp); partyExtraHpRef.current = initHp;
      setPtExtraMp(initMp); ptExtraMpRef.current = initMp;
      mother3RollRef.current = { [party[0]?.id ?? '__self']: progressRef.current.hp, ...initHp };
      mother3CritRef.current = new Set();
      ptQueueRef.current = []; ptExecPosRef.current = 0;
      if (ptTimerRef.current) { clearTimeout(ptTimerRef.current); ptTimerRef.current = null; }
      const init: PtView = { phase: cfg.style === 'milky' ? 'idle' : 'select', turnIdx: 0, menu: 'root', pending: null, defended: [], menuCursor: 0 };
      ptRef.current = init; setPt(init);
      if (cfg.style === 'milky') {
        // 行動値の初期値：味方がわずかに先行し、敵は少し遅れて動き出す
        const av: Record<string, number> = {};
        ptParty().forEach((mm, i) => { av[`m:${mm.id}`] = 20 + i * 12; });
        foes.forEach((_, i) => { av[`f:${i}`] = 70 + i * 18 + Math.floor(Math.random() * 30); });
        milkyAvRef.current = av;
        milkyActorRef.current = null;
        milkyPendingRef.current = {};
        setMilkyAllySkillName(''); setMilkyEnemySkillName('');
        // エンカウントメッセージを見せてから時間進行を開始する
        setTimeout(() => {
          if (battleRef.current.active && gameDataRef.current.battle?.style === 'milky' && !battleViewRef.current?.over) milkyStartTicking();
        }, 900);
      }
    }
    bossOutroRef.current = opts.outroDialogue?.length ? opts.outroDialogue : null;
    setBattle({
      enemyName: opts.name, enemyEmoji: opts.emoji, enemySprite: opts.battleSprite, enemyHp: opts.hp, enemyMaxHp: opts.hp, mercy: 0,
      foes: foes.map(f => ({ ...f })),
      log: [foeCount > 1 ? `${opts.name}が ${foeCount}たい あらわれた！` : `${opts.name}が あらわれた！`], canAct: true, over: false,
    });
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
    beginBattle({ name: d.name ?? 'てき', emoji: d.emoji, hp: d.hp, atk: d.atk ?? Math.round(d.hp), def: d.def ?? Math.round(d.hp * 0.4), exp: d.exp ?? Math.round(d.hp * 1.5), gold: d.gold, moves: d.moves, miniScript: d.miniScript, undertaleMode: d.undertaleMode, dialogue: d.dialogue, battleSprite: d.battleSprite, entity: e, isBoss: d.isBoss, encounterMax: d.encounterMax, outroDialogue: d.outroDialogue });
  };

  // spare（みのがす）: 敵は撃破と同じく消えるが EXP は入らずゴールドだけ貰える。
  // ボスをみのがした場合も撃破と同様にクリア扱い（不殺ルート）。
  const endBattle = (result: 'win' | 'lose' | 'flee' | 'spare') => {
    milkyStopTicking();
    milkyPendingRef.current = {};
    const b = battleRef.current; const pr = progressRef.current; const eng = engineRef.current;
    if (result === 'lose') {
      battleRef.current.active = false; setBattle(null);
      battleBgmActiveRef.current = 'none';
      shakeRef.current = 18; playSfx(sfxRef.current.damage); showGameMsg('ゲームオーバー…', 'timed', () => { gameOverActiveRef.current = true; setGameOverResult({ score: scoreRef.current }); });
      return;
    }
    const wasBoss = b.isBoss;
    // デルタルーン／パーティ制：先頭メンバー（フィールドの操作キャラ）が down のまま勝ち抜けた場合、
    // tlDR Engine のオーバーワールド同様に最低HP1で立ち上がらせる（フィールド即ゲームオーバー防止）。
    const styleNow = gameDataRef.current.battle?.style;
    if ((styleNow === 'deltarune' || isPartyBattleStyle(styleNow)) && pr.hp <= 0) { pr.hp = 1; forceHud(n => n + 1); }
    // 複数体戦（undertale/deltarune/パーティ制）：撃破した敵から EXP＋ゴールド、みのがした敵からはゴールドのみを合算。
    // classic（常に1体・gone を使わない）は従来どおり battleRef の合計値を使う。
    const usesFoes = isDodgeBattleStyle(styleNow) || isPartyBattleStyle(styleNow);
    const expGain = usesFoes ? b.foes.reduce((s, f) => s + (f.gone === 'dead' ? f.exp : 0), 0) : b.exp;
    const goldGain = usesFoes ? b.foes.reduce((s, f) => s + (f.gone ? f.gold : 0), 0) : b.gold;
    if (result === 'spare') {
      if (b.entity) { const idx = eng.entities.indexOf(b.entity); if (idx >= 0) eng.entities.splice(idx, 1); }
      pr.gold = (pr.gold ?? 0) + goldGain;
      setBattle(v => (v ? { ...v, over: true, canAct: false, log: [...v.log, `${b.enemyName}を みのがした！${goldGain > 0 ? ` ${goldGain}G` : ''}`].slice(-6) } : v));
      if (wasBoss) bossDefeatedRef.current = true;
    }
    if (result === 'win') {
      if (b.entity) { const idx = eng.entities.indexOf(b.entity); if (idx >= 0) eng.entities.splice(idx, 1); }
      pr.exp += expGain;
      let lvUp = '';
      {
        const bd0 = gameDataRef.current.battle;
        const levelTable = bd0?.levelTable ?? [];
        const growthType: GrowthType = bd0?.growthType ?? 'standard';
        const growth: StatGrowth = bd0?.growth ?? { hp: 6, mp: 3, atk: 2, def: 1 };
        const learned: string[] = [];
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
            pr.maxHp += growth.hp; pr.maxMp += growth.mp; pr.baseAtk += growth.atk; pr.baseDef += growth.def;
            pr.hp = pr.maxHp; pr.mp = pr.maxMp;
          }
          const nextNext = levelTable.find(e => e.level === pr.level + 1);
          pr.expNext = nextNext?.exp ?? expToNextLevel(pr.level, growthType);
          // このレベルで新しく使えるようになった戦闘コマンド／呪文（主人公＝party[0]）を集めてログに出す
          (bd0?.moves ?? []).forEach(m => { if (m.learnLevel === pr.level) learned.push(m.name); });
          (bd0?.party?.[0]?.spells ?? []).forEach(s => { if (s.learnLevel === pr.level) learned.push(s.name); });
          lvUp = `レベルが ${pr.level} に あがった！`;
          playSfx(sfxRef.current.levelup);
        }
        if (learned.length) lvUp += ` ${learned.join('・')}を おぼえた！`;
        if (lvUp) applyEquipment(equipmentRef.current); // 基礎値の上に装備ボーナスを再計算
      }
      pr.gold = (pr.gold ?? 0) + goldGain;
      setBattle(v => (v ? { ...v, over: true, canAct: false, log: [...v.log, `${b.enemyName}を たおした！${expGain > 0 ? ` EXP+${expGain}` : ''}${goldGain > 0 ? ` ${goldGain}G` : ''}`, ...(lvUp ? [lvUp] : [])].slice(-6) } : v));
      if (wasBoss) bossDefeatedRef.current = true;
    }
    // バトル開始位置へ正確に戻す（再エンカウントは invulnRef の無敵時間で防止する）
    if (battleReturnPosRef.current) {
      eng.player.x = battleReturnPosRef.current.x;
      eng.player.y = battleReturnPosRef.current.y;
      battleReturnPosRef.current = null;
    }
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
  /** 1体ぶんの みのがし成立判定（複数体戦用）。 */
  const foeSpareReady = (f: { mercy: number; hp: number; maxHp: number }) =>
    spareReady({ mercy: f.mercy, enemyHp: f.hp, enemyMaxHp: f.maxHp });
  /** 全員が撃破/みのがし済みなら戦闘終了を予約する（1体でも倒していれば 'win'）。終了予約したら true。 */
  const endIfAllFoesGone = () => {
    const b = battleRef.current;
    if (!b.foes.length || !b.foes.every(f => f.gone)) return false;
    const result = b.foes.some(f => f.gone === 'dead') ? 'win' as const : 'spare' as const;
    setTimeout(() => endBattle(result), 600);
    return true;
  };
  /** 対象の敵へダメージを与える（ポップアップ・HPゲージ・撃破マーク込み）。
   *  killed＝この一撃で倒したか、over＝全滅して戦闘終了を予約したか。 */
  const damageFoe = (foeIdx: number, dmg: number): { killed: boolean; over: boolean } => {
    const b = battleRef.current;
    const f = b.foes[foeIdx];
    if (!f || f.gone) return { killed: false, over: false };
    const before = f.hp;
    f.hp = Math.max(0, f.hp - dmg);
    triggerEnemyDamageFx(foeIdx, dmg, before, f.hp, f.maxHp);
    const killed = f.hp <= 0;
    if (killed) { f.gone = 'dead'; triggerEnemyDefeatFx(foeIdx); }
    syncFoesView();
    return { killed, over: endIfAllFoesGone() };
  };
  /** 攻撃対象が既に倒れている/いなくなっている場合、生きている敵へ自動で付け替える（デルタルーン準拠）。 */
  const retargetFoe = (idx: number) => {
    const f = battleRef.current.foes[idx];
    if (f && !f.gone) return idx;
    return aliveFoeIdxs()[0] ?? idx;
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

  /** undertale: テキスト表示後、プレイヤーがボタン（Z/A）を押すまで進行を止めておくための予約関数。 */
  const undertaleAdvanceRef = useRef<(() => void) | null>(null);
  const [undertaleWaiting, setUndertaleWaiting] = useState(false);
  const waitForUndertaleAdvance = (fn: () => void) => {
    undertaleAdvanceRef.current = fn;
    setUndertaleWaiting(true);
  };

  // ── 敵の攻撃予告フキダシ（tlDR Engine の o_ui_actordialogue 相当） ─────────
  /** 敵スプライト横のフキダシ。各敵インデックスごとに1つずつ表示できる。
   *  攻撃予告（undertaleEnemyTurn）で出て、一定時間後に自動で消える。 */
  type EnemyBubbleSide = 'left' | 'right' | 'top' | 'bottom';
  type EnemyBubbleState = { text: string; reveal: number; id: number; side: EnemyBubbleSide };
  const [enemyBubbles, setEnemyBubbles] = useState<Map<number, EnemyBubbleState>>(new Map());
  const enemyBubblesRef = useRef<Map<number, EnemyBubbleState>>(new Map());
  enemyBubblesRef.current = enemyBubbles;
  const enemyBubbleIdRef = useRef(0);
  const showEnemyBubbles = (entries: { foeIdx: number; text: string; side: EnemyBubbleSide }[]) => {
    enemyBubbleIdRef.current++;
    const id = enemyBubbleIdRef.current;
    setEnemyBubbles(new Map(entries.map(entry => [
      entry.foeIdx,
      { text: entry.text, reveal: 0, id, side: entry.side },
    ])));
  };
  const clearEnemyBubble = () => {
    clearEnemyBubbleTimers();
    enemyBubbleIdRef.current++;
    setEnemyBubbles(new Map());
  };
  // フキダシのタイプライター：45ms に1文字ずつ増やし、2文字ごとに敵ボイス音を鳴らす。
  // 各敵インデックスごとに独立したタイマーを走らせる。Zキーの先送りで
  // reveal が全文に達したらそこで止まる。
  useEffect(() => {
    const cur = enemyBubblesRef.current;
    if (cur.size === 0) return;
    const ivs: ReturnType<typeof setInterval>[] = [];
    cur.forEach((b0, idx) => {
      if (b0.reveal >= b0.text.length) return;
      const id = b0.id; const text = b0.text;
      let reveal = b0.reveal;
      const iv = setInterval(() => {
        if (enemyBubbleIdRef.current !== id) { clearInterval(iv); return; }
        const latest = enemyBubblesRef.current.get(idx);
        if (latest?.id === id) reveal = Math.max(reveal, latest.reveal);
        if (reveal >= text.length) { clearInterval(iv); return; }
        const ch = text[reveal];
        reveal++;
        const r = reveal;
        setEnemyBubbles(prev => {
          const next = new Map(prev);
          const e = next.get(idx);
          if (e && e.id === id && r > e.reveal) next.set(idx, { ...e, reveal: r });
          return next;
        });
        if (ch !== ' ' && ch !== '　' && ch !== '\n' && reveal % 2 === 1) {
          playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).textVoice);
        }
      }, ENEMY_BUBBLE_CHAR_MS);
      ivs.push(iv);
    });
    return () => ivs.forEach(clearInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enemyBubbles.size, [...enemyBubbles.values()].map(b => b.id).join(',')]);
  /** フキダシの描画（tlDR o_ui_actordialogue 相当：白い箱＋敵を指すしっぽ）。
   *  side='left'＝敵の左側、'right'＝敵の右側、'top'＝敵の上側、'bottom'＝敵の下側に出す。
   *  箱の大きさは全文ぶんの不可視テキストで先に確定させ、その上に表示済み文字を重ねることで、
   *  タイプ中に箱が伸び縮みせず 参考実装と同じ「箱の中で文字が打たれていく」見た目になる。 */
  const renderEnemyBubble = (foeIdx: number) => {
    const eb = enemyBubbles.get(foeIdx);
    if (!eb) return null;
    const side = eb.side;
    const containerCls =
      side === 'left'
        ? 'top-1/2 -translate-y-1/2 right-full mr-5'
        : side === 'right'
          ? 'top-1/2 -translate-y-1/2 left-full ml-5'
          : side === 'top'
            ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
            : 'top-full left-1/2 -translate-x-1/2 mt-2';
    const bubbleCls =
      side === 'top' || side === 'bottom'
        ? 'relative bg-white text-black font-pixel text-[10px] sm:text-xs leading-snug px-2 py-1.5 w-max max-w-[7rem] sm:max-w-[8rem] text-left'
        : 'relative bg-white text-black font-pixel text-[10px] sm:text-xs leading-snug px-2 py-1.5 w-max max-w-[9.5rem] sm:max-w-[11rem] text-left';
    return (
      <div className={`absolute z-30 pointer-events-none ${containerCls}`}>
        <div className={bubbleCls}>
          <span className="invisible whitespace-pre-wrap break-words block">{eb.text}</span>
          <span className="absolute left-2 top-1.5 right-2 bottom-1.5 whitespace-pre-wrap break-words" style={{ overflowWrap: 'anywhere' }}>{eb.text.slice(0, eb.reveal)}</span>
          {/* しっぽ：敵のいる側を指す三角 */}
          <div className={`absolute w-0 h-0 ${side === 'left'
            ? 'top-1/2 -translate-y-1/2 left-full border-y-[6px] border-y-transparent border-l-[9px] border-l-white'
            : side === 'right'
              ? 'top-1/2 -translate-y-1/2 right-full border-y-[6px] border-y-transparent border-r-[9px] border-r-white'
              : side === 'top'
                ? 'top-full left-1/2 -translate-x-1/2 border-x-[6px] border-x-transparent border-t-[9px] border-t-white'
                : 'bottom-full left-1/2 -translate-x-1/2 border-x-[6px] border-x-transparent border-b-[9px] border-b-white'
            }`} />
        </div>
      </div>
    );
  };

  /** プレイヤーの行動後に敵ターンへ。undertale スタイルはテキストを読み、ボタン入力を待ってから弾幕よけへ。
   *  classic なら従来どおり一定時間後に即時ダメージ。 */
  const queueEnemyTurn = (delay = 1350) => {
    if (isDodgeBattleStyle(gameDataRef.current.battle?.style)) {
      clearQueuedUndertaleTurnTimer();
      clearEnemyBubbleTimers();
      queuedUndertaleTurnTimerRef.current = setTimeout(() => {
        queuedUndertaleTurnTimerRef.current = null;
        undertaleEnemyTurn();
      }, delay);
    } else {
      setTimeout(() => enemyTurn(), delay);
    }
  };

  /** デルタルーン風パーティ戦闘：1人の行動が終わったあとに呼ぶ。まだ行動していない生存メンバーがいれば
   *  その人の番へ進める（メニューへ戻る）。全員行動済みなら敵ターンへ進む。'undertale'（パーティなし）は無関係。 */
  const dtAdvanceTurn = () => {
    if (gameDataRef.current.battle?.style !== 'deltarune') { queueEnemyTurn(); return; }
    if (dtStageRef.current === 'execute') {
      // 実行フェーズ：キューの次の行動へ（全消化したら敵ターンへ）
      dtExecPosRef.current++;
      dtRunQueueStep();
      return;
    }
    const party = dtParty();
    const next = party.findIndex((m, i) => i > dtTurnIdxRef.current && m.hp > 0);
    if (next >= 0) {
      dtTurnIdxRef.current = next; setDtTurnIdx(next);
      setUndertaleMenu('root'); setUndertalePhase('menu');
      setUndertaleRootCursor(0); undertaleRootCursorRef.current = 0;
      // 直前の行動 appendLog で canAct=false になっているので、次のメンバーが行動できるよう戻す。
      // 原作は次のメンバーのコマンドが待ち時間なしで出る（tlDR の party_ui_lerp もボタン確定の
      // 1〜2フレーム後には表示を始める）ため、ここで遅延は入れない
      setBattle(v => (v && !v.over ? { ...v, canAct: true } : v));
    } else {
      // 全員コマンドを選び終えた → 実行フェーズへ（tlDR Engine の action_order 準拠：
      // こうどう(ACT)→アイテム→まほう(POWER)→たたかう(FIGHT)→まもる(DEFEND)の順で1件ずつ処理）
      dtStageRef.current = 'execute';
      dtSelLogRef.current = []; // 実行が始まったらXキャンセルで戻れない
      const order: Record<string, number> = { act: 0, item: 1, spell: 2, attack: 3, defend: 4 };
      dtQueueRef.current = [...dtQueueRef.current].sort((a, b) => order[a.kind] - order[b.kind]);
      dtAttackRowsRef.current = dtQueueRef.current.filter(a => a.kind === 'attack').map(a => a.idx);
      setDtAttackDone({});
      dtExecPosRef.current = 0;
      dtRunQueueStep();
    }
  };

  /** デルタルーン風パーティ戦闘：選択済みキューの現在位置の行動を実行する。
   *  たたかう(attack)はタイミングバーUIを開くだけ（結果は resolveUndertaleAttack/missUndertaleAttack が処理）、
   *  それ以外は対応する do/use 系関数を直接呼ぶ（各関数の末尾で dtAdvanceTurn を呼び、次の行動へ進む）。 */
  const dtRunQueueStep = () => {
    const q = dtQueueRef.current;
    if (dtExecPosRef.current >= q.length) {
      dtQueueRef.current = []; dtStageRef.current = 'select';
      queueEnemyTurn();
      return;
    }
    const action = q[dtExecPosRef.current];
    dtTurnIdxRef.current = action.idx; setDtTurnIdx(action.idx);
    setUndertaleMenu('root');
    // 「たたかう」が連続するあいだは 'menu' を経由させない（複数行のタイミングバーが同時表示され続けるように、
    // 行が切り替わる瞬間もオーバーレイをマウントしたままにする）。それ以外の行動は今まで通り一度 'menu' に戻す。
    if (action.kind !== 'attack') setUndertalePhase('menu');
    setBattle(v => (v && !v.over ? { ...v, canAct: true } : v));
    // 「たたかう」の対象は選択時に確定済み（対象が倒れていれば解決時に自動で付け替える）
    if (action.kind === 'attack') attackTargetRef.current = action.target ?? aliveFoeIdxs()[0] ?? 0;
    // setBattle の反映（canAct=true）を待ってから実行関数を呼ぶ（battleViewRef は render 時に同期されるため）
    setTimeout(() => {
      if (action.kind === 'attack') setUndertalePhase('attack');
      else if (action.kind === 'act' && action.move) doMove(action.move, action.target);
      else if (action.kind === 'item' && action.item) useHealItem(action.item, true);
      else if (action.kind === 'spell' && action.spell) castSpell(action.spell, action.target);
      else if (action.kind === 'defend') doDefend();
    }, 60);
  };

  /** デルタルーン風パーティ戦闘専用：「たたかう」選択。選択フェーズ中はキューに積むだけで、
   *  実際のタイミングバーは全員の選択が終わった実行フェーズで開く。 */
  const dtChooseFight = (targetIdx?: number) => {
    if (!battleViewRef.current?.canAct || battleViewRef.current.over) return;
    if (gameDataRef.current.battle?.style === 'deltarune' && dtStageRef.current === 'select') {
      dtQueueRef.current.push({ idx: dtTurnIdxRef.current, kind: 'attack', target: targetIdx });
      dtSelLogRef.current.push({ idx: dtTurnIdxRef.current, kind: 'attack' });
      setBattle(v => (v ? { ...v, canAct: false } : v));
      dtAdvanceTurn();
      return;
    }
    setUndertalePhase('attack');
  };

  /** undertale/deltarune: 敵セリフを条件で選ぶ。各行の条件（actUsed / hpBelowPct / hpAbovePct / mercyAbovePct）
   *  は AND 判定：指定された条件を1つでも満たさない行は候補から外れる。候補のうち条件数が最多
   *  （＝最も具体的）な行を採用し、同率なら hpBelowPct が小さい（より切迫した）行を優先、
   *  なお同率ならランダムに1つ選ぶ。該当なしなら null。 */
  const pickDialogue = (lines: (string | EnemyDialogueLine)[] | undefined, hpPct: number, lastAct: string | null, mercyPct = 0): string | null => {
    if (!lines?.length) return null;
    const norm = lines.map(l => typeof l === 'string' ? { text: l } as EnemyDialogueLine : l);
    const matched: { line: EnemyDialogueLine; score: number }[] = [];
    for (const l of norm) {
      let score = 0;
      if (l.actUsed != null) { if (l.actUsed !== lastAct) continue; score++; }
      if (l.hpBelowPct != null) { if (hpPct > l.hpBelowPct) continue; score++; }
      if (l.hpAbovePct != null) { if (hpPct <= l.hpAbovePct) continue; score++; }
      if (l.mercyAbovePct != null) { if (mercyPct < l.mercyAbovePct) continue; score++; }
      matched.push({ line: l, score });
    }
    if (!matched.length) return null;
    const top = Math.max(...matched.map(m => m.score));
    let best = matched.filter(m => m.score === top);
    const minHp = Math.min(...best.map(m => m.line.hpBelowPct ?? Infinity));
    if (minHp !== Infinity) best = best.filter(m => (m.line.hpBelowPct ?? Infinity) === minHp);
    return best[Math.floor(Math.random() * best.length)].line.text;
  };

  const pickEnemyBubbleSide = (foeIdx: number, alive: number[]): EnemyBubbleSide => {
    const foe = battleRef.current.foes[foeIdx];
    const pos = alive.indexOf(foeIdx);
    const last = alive.length - 1;
    const sprite = foe?.sprite?.idle;
    const spriteW = sprite?.w ?? 64;
    const spriteH = sprite?.h ?? 64;
    const tall = spriteH / Math.max(1, spriteW) >= 1.35;
    const wide = spriteW / Math.max(1, spriteH) >= 1.35;
    if (gameDataRef.current.battle?.style === 'deltarune') {
      // Deltarune: left first. Fall back by shape + position.
      if (alive.length === 1) return 'left';
      if (tall) return 'left';
      if (wide) {
        if (pos === 0) return 'bottom';
        if (pos === last) return 'top';
      }
      return 'left';
    }
    // Undertale: enemies sit in a horizontal row. A single enemy always gets the right side.
    // With exactly two, face them toward each other (left one → right, right one → left) so
    // both bubbles sit in the gap between them instead of overlapping a neighbor. With 3+,
    // there's no gap wide enough to share, so fall back to top for the whole row.
    if (alive.length === 1) return 'right';
    if (alive.length === 2) return pos === 0 ? 'left' : 'right';
    return 'top';
  };

  const beginUndertaleCombat = (move: { name: string; power: number; heal?: boolean; miniScript?: string; undertaleMode?: UndertaleMode; dialogue?: (string | EnemyDialogueLine)[] } | null, dmg: number) => {
    const b = battleRef.current;
    const script = move?.miniScript || b.entity?.def?.miniScript || b.miniScript;
    const mode: UndertaleMode = move?.undertaleMode ?? b.entity?.def?.undertaleMode ?? b.undertaleMode ?? 'red';
    const laneYs = [40, 88, 136];
    undertaleDodgeRef.current = {
      frames: 0, duration: 240, pattern: Math.floor(Math.random() * 3), dmg, bullets: [],
      attackers: Math.max(1, aliveFoeIdxs().length),
      hx: 88, hy: mode === 'purple' ? laneYs[1] : mode === 'green' ? 88 : 118, invuln: 30, miniScript: script,
      mode, gvy: 0, grounded: true, jumpHeld: 0, shieldDir: null, lane: 1, shots: [], shotCool: 0,
    };
    setUndertalePhase('dodge');
  };

  /** undertale: 敵ターン開始。ダメージ演出のあとに予告テキストを表示し、消えたら弾幕よけへ進む。 */
  const undertaleEnemyTurn = () => {
    const b = battleRef.current; const pr = progressRef.current;
    if (!b.active) return;
    clearEnemyBubbleTimers();
    const move = b.enemyMoves.length && Math.random() < 0.4 ? b.enemyMoves[Math.floor(Math.random() * b.enemyMoves.length)] : null;
    const alive = aliveFoeIdxs();
    if (move?.heal) {
      // 回復技：生きている敵 全員が回復する
      alive.forEach(i => { const f = b.foes[i]; f.hp = Math.min(f.maxHp, f.hp + move.power); });
      syncFoesView();
      if (gameDataRef.current.battle?.style === 'deltarune') {
        dtDefendedRef.current = new Set();
        const first = Math.max(0, dtParty().findIndex(m => m.hp > 0)); // downしたメンバーは飛ばして次ラウンド開始
        dtTurnIdxRef.current = first; setDtTurnIdx(first);
        appendLog(`${b.enemyName}は ${move.name}を つかった！ HPが ${move.power} かいふく`, { canAct: !dtAllDown() });
      } else {
        appendLog(`${b.enemyName}は ${move.name}を つかった！ HPが ${move.power} かいふく`, { canAct: pr.hp > 0 });
      }
      return;
    }
    // 弾1発あたりのダメージ（何発か被弾しうるので通常攻撃より小さめに割る）
    const dmg = move ? Math.max(1, Math.round(move.power * 0.35)) : Math.max(1, Math.round(calcDmg(b.enemyAtk, pr.def) * 0.4));
    const bubbleEntries = alive.flatMap(fi => {
      const f = b.foes[fi];
      const hpPct = f.maxHp > 0 ? (f.hp / f.maxHp) * 100 : 100;
      const dlg = pickDialogue(move?.dialogue, hpPct, lastActRef.current, f.mercy ?? 0)
        ?? pickDialogue(f.dialogue, hpPct, lastActRef.current, f.mercy ?? 0)
        ?? pickDialogue(b.dialogue, hpPct, lastActRef.current, f.mercy ?? 0);
      return dlg ? [{ foeIdx: fi, text: dlg, side: pickEnemyBubbleSide(fi, alive) }] : [];
    });
    const firstAlive = b.foes[alive[0] ?? 0];
    const groupLabel = alive.length > 1 ? `${b.enemyName}たち` : (firstAlive?.name ?? b.enemyName);
    appendLog(move ? `${groupLabel}の ${move.name}！` : `${groupLabel}の こうげき！`);
    if (!bubbleEntries.length) {
      undertaleCombatStartTimerRef.current = setTimeout(() => {
        undertaleCombatStartTimerRef.current = null;
        beginUndertaleCombat(move, dmg);
      }, ENEMY_BUBBLE_TO_COMBAT_MS);
      return;
    }
    showEnemyBubbles(bubbleEntries);
    const revealMs = Math.max(...bubbleEntries.map(entry => entry.text.length)) * ENEMY_BUBBLE_CHAR_MS;
    const bubbleMs = revealMs + ENEMY_BUBBLE_HOLD_MS;
    enemyBubbleClearTimerRef.current = setTimeout(() => {
      enemyBubbleClearTimerRef.current = null;
      enemyBubbleIdRef.current++;
      setEnemyBubbles(new Map());
    }, bubbleMs);
    undertaleCombatStartTimerRef.current = setTimeout(() => {
      undertaleCombatStartTimerRef.current = null;
      beginUndertaleCombat(move, dmg);
    }, bubbleMs + ENEMY_BUBBLE_TO_COMBAT_MS);
  };

  /** デルタルーン風パーティ戦闘：実行フェーズで、今解決した「たたかう」の次にまだ「たたかう」が
   *  控えているか（＝複数行のタイミングバーをオーバーレイをたたまずに連続表示できるか）。 */
  const dtNextIsAttack = () =>
    dtStageRef.current === 'execute' && dtQueueRef.current[dtExecPosRef.current + 1]?.kind === 'attack';

  /** undertale: タイミングバーの結果からダメージを与える。的（target）の有効ゾーン内で止めたときのみダメージ。
   *  ゾーン外＝ミス、ゾーン内＝ヒット、的のピンポイント内＝会心。
   *  undertale（アンダーテール）は的が中央（0.5）、デルタルーンは左端固定（DT_FIGHT_TARGET）。 */
  const resolveUndertaleAttack = (pos: number, target = 0.5) => {
    const b = battleRef.current; const pr = progressRef.current;
    const dist = Math.abs(pos - target);
    const isDR = gameDataRef.current.battle?.style === 'deltarune';
    // 的の有効ゾーン判定：デルタルーンは左端 fixed（0〜0.26）、アンダーテールは中央（±0.07）
    const inHitZone = isDR ? (pos >= 0.0 && pos <= 0.26) : dist < 0.07;
    if (!inHitZone) { missUndertaleAttack(pos); return; }
    // ピンポイント判定：デルタルーン（0.02〜0.14）、アンダーテール（±0.02）
    const inCritZone = isDR ? (pos >= 0.02 && pos <= 0.14) : dist < 0.02;
    const mult = inCritZone ? 1.6 : 1.2;
    const dmg = Math.max(1, Math.round(calcDmg(pr.atk, b.enemyDef) * mult));
    // 選択済みの対象へ（既に倒れていれば生存敵へ自動で付け替え）
    const tIdx = retargetFoe(attackTargetRef.current);
    const targetFoe = b.foes[tIdx];
    const { killed, over } = damageFoe(tIdx, dmg);
    if (isDR) {
      // 剣を振る音（会心なら専用SE重ね）＋現在ターンのメンバーの攻撃モーション
      playSfx(DT_SFX.attack);
      if (inCritZone) playSfx(DT_SFX.crit);
      // 担当メンバーの index はここで確定させて updater に埋め込む。updater 内で
      // dtTurnIdxRef.current を読むと、直後の dtAdvanceTurn が同期的に次のメンバーへ進めたあとに
      // React が updater を実行するため、結果が「次のメンバー」のキーに記録されてしまう
      // （1人目の確定で2人目の行が凍り、1人目の行が未解決のまま走り続けるバグの原因）。
      const memberIdx = dtTurnIdxRef.current;
      const attacker = dtParty()[memberIdx];
      if (attacker) dtPlayMemberAnim(attacker.id, 'attack', 700);
      setDtAttackDone(p => ({ ...p, [memberIdx]: { result: inCritZone ? 'crit' : 'hit', pos } }));
    }
    playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).enemyDamage);
    // 次も「たたかう」が控えているあいだは 'attack' のままにして、複数行のタイミングバーオーバーレイを
    // たたまずに連続表示する（reference の o_enc_fight が全員ぶんの棒を同時に見せているのを再現）。
    // ただしこの一撃で全滅させた場合は、以降の「たたかう」キューは実行されず dtAdvanceTurn も
    // 呼ばれない（over で早期 return する）ため、'attack' のまま残してしまうとタイミングバーが
    // 消えずに残り続け、この後に出す撃破/レベルアップ等のメッセージを覆い隠してしまう。
    if (over || !dtNextIsAttack()) setUndertalePhase('menu');
    const targetLabel = b.foes.length > 1 && targetFoe ? `${targetFoe.name}に ` : '';
    appendLog(`${inCritZone ? '会心の いちげき！ ' : ''}${targetLabel}${dmg}のダメージ！${killed && targetFoe ? ` ${targetFoe.name}を たおした！` : ''}`, { canAct: false });
    if (over) return;
    dtAdvanceTurn();
  };

  const missUndertaleAttack = (missPos = 0) => {
    if (gameDataRef.current.battle?.style === 'deltarune') {
      // resolveUndertaleAttack 同様、updater 実行時には dtAdvanceTurn で担当が進んでいるため先に確定させる
      const memberIdx = dtTurnIdxRef.current;
      setDtAttackDone(p => ({ ...p, [memberIdx]: { result: 'miss', pos: missPos } }));
    }
    triggerEnemyMissFx(retargetFoe(attackTargetRef.current));
    if (!dtNextIsAttack()) setUndertalePhase('menu');
    appendLog('こうげきは ハズれた！', { canAct: false });
    dtAdvanceTurn();
  };

  const doAttack = () => {
    if (!battleViewRef.current?.canAct || battleViewRef.current.over) return;
    const b = battleRef.current; const pr = progressRef.current;
    const dmg = calcDmg(pr.atk, b.enemyDef);
    b.enemyHp = Math.max(0, b.enemyHp - dmg);
    appendLog(`${gameData.battle?.playerName || '勇者'}の こうげき！ ${dmg}のダメージ`, { canAct: false });
    if (b.enemyHp <= 0) { setTimeout(() => endBattle('win'), 600); return; }
    queueEnemyTurn();
  };

  const doMove = (m: BattleMove, targetIdx?: number) => {
    if (!battleViewRef.current?.canAct || battleViewRef.current.over) return;
    if (gameDataRef.current.battle?.style === 'deltarune' && dtStageRef.current === 'select') {
      dtQueueRef.current.push({ idx: dtTurnIdxRef.current, kind: 'act', move: m, target: targetIdx });
      dtSelLogRef.current.push({ idx: dtTurnIdxRef.current, kind: 'act' });
      setBattle(v => (v ? { ...v, canAct: false } : v));
      dtAdvanceTurn();
      return;
    }
    const b = battleRef.current; const pr = progressRef.current;
    const dodge = isDodgeBattleStyle(gameDataRef.current.battle?.style);
    // 複数体戦：対象の敵（未指定・対象消滅時は生存敵の先頭へ）
    const tIdx = retargetFoe(targetIdx ?? aliveFoeIdxs()[0] ?? 0);
    const foe = b.foes[tIdx];
    if (pr.mp < m.cost) { appendLog('MPが たりない！'); return; }
    pr.mp -= m.cost; forceHud(n => n + 1);
    if (m.mercy != null) {
      // こうどう技：ダメージを与えず対象の敵意ゲージを溜める（次の敵ターンのセリフ選定用に記録）
      lastActRef.current = m.name;
      if (dodge && foe) {
        const before = foe.mercy;
        foe.mercy = Math.min(100, foe.mercy + m.mercy);
        b.mercy = Math.max(0, ...b.foes.map(f => (f.gone ? 0 : f.mercy))); // 旧UI互換の代表値
        if (gameDataRef.current.battle?.style === 'deltarune') {
          const actor = dtParty()[dtTurnIdxRef.current];
          if (actor) dtPlayMemberAnim(actor.id, 'act', 700);
          if (foe.mercy > before) playSfx(DT_SFX.mercyAdd);
        }
        const line = foe.mercy >= 100
          ? `「${m.name}」！ ${foe.name}は たたかう気を なくしたようだ…`
          : foe.mercy > before
            ? `「${m.name}」！ ${foe.name}の 敵意が やわらいだ`
            : `「${m.name}」！ しかし ${foe.name}には とどかなかった`;
        appendLog(line, { canAct: false });
      } else {
        const before = b.mercy;
        b.mercy = Math.min(100, b.mercy + m.mercy);
        const line = b.mercy >= 100
          ? `「${m.name}」！ ${b.enemyName}は たたかう気を なくしたようだ…`
          : b.mercy > before
            ? `「${m.name}」！ ${b.enemyName}の 敵意が やわらいだ`
            : `「${m.name}」！ しかし ${b.enemyName}には とどかなかった`;
        appendLog(line, { canAct: false });
      }
      dtAdvanceTurn();
      return;
    }
    if (m.heal) {
      const before = pr.hp; pr.hp = Math.min(pr.maxHp, pr.hp + m.power);
      appendLog(`${m.name}！ HPが ${pr.hp - before} かいふくした`, { canAct: false });
    } else {
      const dmg = Math.max(1, Math.round(m.power * (0.85 + Math.random() * 0.3)));
      if (dodge && foe) {
        spawnBattleEffect(m.effectId, tIdx);
        const { killed, over } = damageFoe(tIdx, dmg);
        playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).enemyDamage);
        appendLog(`${m.name}！ ${b.foes.length > 1 ? `${foe.name}に ` : ''}${dmg}のダメージ${killed ? `！ ${foe.name}を たおした` : ''}`, { canAct: false });
        if (over) return;
      } else {
        const beforeHp = b.enemyHp;
        b.enemyHp = Math.max(0, b.enemyHp - dmg);
        appendLog(`${m.name}！ ${dmg}のダメージ`, { canAct: false });
        if (b.enemyHp <= 0) { setTimeout(() => endBattle('win'), 600); return; }
      }
    }
    dtAdvanceTurn();
  };

  /** デルタルーン風パーティ戦闘専用：TPを消費して呪文をとなえる（回復は仲間全員へ・downからの復帰あり、攻撃は対象の敵へ）。 */
  const castSpell = (spell: PartySpell, targetIdx?: number) => {
    if (!battleViewRef.current?.canAct || battleViewRef.current.over) return;
    if (gameDataRef.current.battle?.style === 'deltarune' && dtStageRef.current === 'select') {
      if (tpRef.current < spell.tpCost) return;
      dtQueueRef.current.push({ idx: dtTurnIdxRef.current, kind: 'spell', spell, target: targetIdx });
      dtSelLogRef.current.push({ idx: dtTurnIdxRef.current, kind: 'spell' });
      setBattle(v => (v ? { ...v, canAct: false } : v));
      dtAdvanceTurn();
      return;
    }
    if (tpRef.current < spell.tpCost) return;
    const nextTp = tpRef.current - spell.tpCost;
    tpRef.current = nextTp; setTp(nextTp);
    const caster = dtParty()[dtTurnIdxRef.current];
    if (caster) dtPlayMemberAnim(caster.id, 'spell', 700);
    // 呪文固有の詠唱SE（ルードバスターの snd_rudebuster_swing 等）があれば共通音の代わりに鳴らす
    playSfx(spell.castSfxUrl
      ? { ref: `direct:${spell.castSfxUrl}`, src: spell.castSfxUrl, type: 'direct' as const }
      : DT_SFX.spellCast);
    const b = battleRef.current;
    if (spell.heal) {
      const party = gameDataRef.current.battle?.party ?? [];
      let revived: string | null = null;
      party.forEach(m => { if (dtHealMember(m.id, spell.power)) revived = m.name; });
      playSfx(DT_SFX.cure);
      appendLog(revived ? `「${spell.name}」！ ${revived}が たちあがった！` : `「${spell.name}」！ なかまのHPが かいふくした`, { canAct: false });
    } else {
      const dmg = Math.max(1, Math.round(spell.power * (0.85 + Math.random() * 0.3)));
      const tIdx = retargetFoe(targetIdx ?? aliveFoeIdxs()[0] ?? 0);
      const foe = b.foes[tIdx];
      spawnBattleEffect(spell.effectId, tIdx);
      const { killed, over } = damageFoe(tIdx, dmg);
      // 呪文固有の命中SE（ルードバスターの snd_rudebuster_hit 等）があれば共通音の代わりに鳴らす
      playSfx(spell.hitSfxUrl
        ? { ref: `direct:${spell.hitSfxUrl}`, src: spell.hitSfxUrl, type: 'direct' as const }
        : (undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).enemyDamage);
      appendLog(`「${spell.name}」！ ${b.foes.length > 1 && foe ? `${foe.name}に ` : ''}${dmg}のダメージ${killed && foe ? `！ ${foe.name}を たおした` : ''}`, { canAct: false });
      if (over) return;
    }
    dtAdvanceTurn();
  };

  // ── 複数体戦：行動対象の選択 ────────────────────────────────────────────
  /** 選ばれた対象で保留アクションを実行する。 */
  const dispatchTarget = (sel: { kind: 'fight' | 'act' | 'spell'; move?: BattleMove; spell?: PartySpell }, foeIdx: number) => {
    setUndertaleMenu('root');
    setUndertaleTargetSel(null); undertaleTargetSelRef.current = null;
    if (sel.kind === 'fight') {
      attackTargetRef.current = foeIdx;
      if (gameDataRef.current.battle?.style === 'deltarune') dtChooseFight(foeIdx);
      else setUndertalePhase('attack');
    } else if (sel.kind === 'act' && sel.move) {
      doMove(sel.move, foeIdx);
    } else if (sel.kind === 'spell' && sel.spell) {
      castSpell(sel.spell, foeIdx);
    }
  };
  /** 対象が必要な行動の確定時に呼ぶ入口。生存敵が1体だけならそのまま実行し、複数いれば選択メニューへ。 */
  const beginTargetSelect = (sel: { kind: 'fight' | 'act' | 'spell'; move?: BattleMove; spell?: PartySpell }) => {
    const alive = aliveFoeIdxs();
    if (alive.length <= 1) { dispatchTarget(sel, alive[0] ?? 0); return; }
    setUndertaleTargetSel(sel); undertaleTargetSelRef.current = sel;
    setUndertaleTargetCursor(alive[0]); undertaleTargetCursorRef.current = alive[0];
    setUndertaleMenu('target');
  };

  /** デルタルーン風パーティ戦闘専用：「まもる」。TPを加算し、このメンバーの次の被弾ダメージを軽減する。 */
  const doDefend = () => {
    if (!battleViewRef.current?.canAct || battleViewRef.current.over) return;
    if (gameDataRef.current.battle?.style === 'deltarune' && dtStageRef.current === 'select') {
      // 参考実装（o_enc の __order_action_queue）は defend を実行キューに積まず、選択した瞬間に
      // 効果を適用する：スプライトが即座に防御ポーズへ切り替わり、TP+16 も同じラウンドの
      // 呪文選択にすぐ使える（クリスがまもる→そのTPでラルセイが呪文、が同ラウンドで成立）。
      const member = dtParty()[dtTurnIdxRef.current];
      if (!member) return;
      dtDefendedRef.current.add(member.id);
      const nextTp = Math.min(100, tpRef.current + 16);
      // Xキャンセルで戻ったとき、100で頭打ちになった分まで引かないよう実際の増加量を記録する
      dtSelLogRef.current.push({ idx: dtTurnIdxRef.current, kind: 'defend', memberId: member.id, tpGained: nextTp - tpRef.current });
      tpRef.current = nextTp; setTp(nextTp);
      appendLog(`${member.name}は みをまもっている……`, { canAct: false });
      dtAdvanceTurn();
      return;
    }
    const member = dtParty()[dtTurnIdxRef.current];
    if (!member) return;
    dtDefendedRef.current.add(member.id);
    const nextTp = Math.min(100, tpRef.current + 16);
    tpRef.current = nextTp; setTp(nextTp);
    appendLog(`${member.name}は みをまもっている……`, { canAct: false });
    dtAdvanceTurn();
  };

  const doFlee = () => {
    if (!battleViewRef.current?.canAct || battleViewRef.current.over) return;
    if (Math.random() < 0.6) { appendLog('うまく にげきれた！', { canAct: false, over: true }); setTimeout(() => endBattle('flee'), 700); }
    else { appendLog('しかし まわりこまれてしまった！', { canAct: false }); queueEnemyTurn(); }
  };

  /** みのがす（labels.mercy 設定時のみUIに出る）。複数体戦では条件を満たした敵を まとめて解放する。
   *  1体も条件を満たしていなければターンを消費して失敗。 */
  const doSpare = () => {
    if (!battleViewRef.current?.canAct || battleViewRef.current.over) return;
    const b = battleRef.current;
    const style = gameDataRef.current.battle?.style;
    if (isDodgeBattleStyle(style)) {
      const ready = aliveFoeIdxs().filter(i => foeSpareReady(b.foes[i]));
      if (ready.length) {
        if (style === 'deltarune') playSfx(DT_SFX.spare);
        ready.forEach(i => { b.foes[i].gone = 'spared'; });
        syncFoesView();
        const names = ready.map(i => b.foes[i].name).join('と ');
        if (b.foes.every(f => f.gone)) {
          appendLog(`${names}は しずかに たちさった…`, { canAct: false, over: true });
          setTimeout(() => endBattle(b.foes.some(f => f.gone === 'dead') ? 'win' : 'spare'), 700);
        } else {
          // まだ戦う敵が残っている：みのがしはターン消費して戦闘続行
          appendLog(`${names}は しずかに たちさった…`, { canAct: false });
          if (style === 'deltarune') dtAdvanceTurn(); else queueEnemyTurn();
        }
      } else {
        appendLog(`${b.enemyName}は まだ たたかう気だ！`, { canAct: false });
        if (style === 'deltarune') dtAdvanceTurn(); else queueEnemyTurn();
      }
      return;
    }
    if (spareReady(b)) {
      appendLog(`${b.enemyName}は しずかに たちさった…`, { canAct: false, over: true });
      setTimeout(() => endBattle('spare'), 700);
    } else {
      appendLog(`${b.enemyName}は まだ たたかう気だ！`, { canAct: false });
      queueEnemyTurn();
    }
  };

  // ════════════════════════════════════════════════════════════════════════
  // パーティ制ターン戦闘（ff / mother3 / milky）の進行ロジック
  // ════════════════════════════════════════════════════════════════════════
  /** 敵1体へ確定ダメージを与えてログを出す。over＝全滅で戦闘終了を予約したか。
   *  milky ではHPが3割を切った瞬間に「つかれてきた」の一言を添える（疲労表情の演出と連動）。 */
  const ptHitFoe = (label: string, dmg: number, targetIdx?: number): boolean => {
    const b = battleRef.current;
    const tIdx = retargetFoe(targetIdx ?? aliveFoeIdxs()[0] ?? 0);
    const foe = b.foes[tIdx];
    if (!foe || foe.gone) return false;
    const beforePct = foe.maxHp > 0 ? foe.hp / foe.maxHp : 0;
    const { killed, over } = damageFoe(tIdx, dmg);
    playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).enemyDamage);
    const tiredNow = gameDataRef.current.battle?.style === 'milky' && !killed
      && beforePct > 0.3 && foe.maxHp > 0 && foe.hp / foe.maxHp <= 0.3;
    const targetLabel = b.foes.length > 1 ? `${foe.name}に ` : '';
    appendLog(`${label} ${targetLabel}${dmg}のダメージ！${killed ? ` ${foe.name}を たおした！` : tiredNow ? ` ${foe.name}は つかれてきたようだ…` : ''}`, { canAct: false });
    return over;
  };

  /** 戦闘中のどうぐ使用：対象メンバーへ healHp/healMp を適用し、所持品から1つ減らす。 */
  const ptUseItemOn = (it: ItemDef, targetMemberId: string, userName?: string, targetFoeIdx?: number) => {
    if ((inventoryRef.current[it.id] ?? 0) <= 0) return;
    const tt = it.targetType;
    // 対象メンバーごとの override（healHp/healMp）を解決する。
    const healMember = (target: { id: string; hp: number; maxHp: number; mp: number; maxMp: number }): string[] => {
      const ov = it.overrides?.find(o => o.memberId === target.id);
      const healHp = ov?.healHp ?? it.healHp;
      const healMp = ov?.healMp ?? it.healMp;
      const parts: string[] = [];
      if (healHp) { const after = Math.min(target.maxHp, target.hp + healHp); parts.push(`HPが ${after - target.hp} かいふく`); dtSetHp(target.id, after); }
      if (healMp) { const after = Math.min(target.maxMp, target.mp + healMp); parts.push(`MPが ${after - target.mp} かいふく`); ptSetMp(target.id, after); }
      return parts;
    };
    const consume = () => {
      const slotIdx = invSlotsRef.current.indexOf(it.id);
      if (slotIdx >= 0) { const copy = [...invSlotsRef.current]; copy.splice(slotIdx, 1); setInvSlots(copy); invSlotsRef.current = copy; }
      setInventory(p => { const n = { ...p }; n[it.id] = (n[it.id] ?? 0) - 1; if (n[it.id] <= 0) delete n[it.id]; return n; });
      playSfx(sfxRef.current.inn);
      forceHud(n => n + 1);
    };
    if (tt === 'enemy' || tt === 'allEnemies') {
      const dmg = it.damage ?? 0;
      const idxs = tt === 'allEnemies' ? aliveFoeIdxs() : [targetFoeIdx ?? aliveFoeIdxs()[0] ?? 0];
      consume();
      appendLog(`${userName ?? ''}は ${it.name}を つかった！`, { canAct: false });
      idxs.forEach(fi => { const foe = battleRef.current.foes[fi]; if (foe && !foe.gone && dmg > 0) { damageFoe(fi, dmg); appendLog(`${foe.name}に ${dmg}のダメージ！`, { canAct: false }); } });
      return;
    }
    if (tt === 'allAllies') {
      const members = ptParty().filter(mm => !ptIsDown(mm));
      consume();
      members.forEach(m => healMember(m));
      appendLog(`${userName ?? ''}は ${it.name}を つかった！ パーティ全員を かいふく`, { canAct: false });
      return;
    }
    const target = ptParty().find(mm => mm.id === targetMemberId);
    if (!target) return;
    const parts = healMember(target);
    consume();
    appendLog(`${userName ?? target.name}は ${it.name}を つかった！ ${target.name}の ${parts.join('、')}`, { canAct: false });
  };

  /** ff/mother3: 新しいラウンドの行動選択を開始する。
   *  milky はラウンドの概念がないので時間進行（milkyStartTicking）へ戻る。 */
  const ptBeginRound = () => {
    if (!battleRef.current.active || battleViewRef.current?.over) return;
    const style = gameDataRef.current.battle?.style;
    if (style === 'milky') {
      ptPatch({ phase: 'idle', menu: 'root', pending: null, defended: [] });
      ptDelay(milkyStartTicking, 400);
      return;
    }
    ptQueueRef.current = []; ptExecPosRef.current = 0;
    const first = ptParty().findIndex(mm => !ptIsDown(mm));
    ptPatch({
      phase: 'select', menu: 'root', pending: null, defended: [],
      turnIdx: Math.max(0, first),
    });
    setBattle(v => (v && !v.over ? { ...v, canAct: true } : v));
  };

  /** ff/mother3: 現在のメンバーの行動を確定してキューに積み、次の生存メンバーへ。全員選んだら実行フェーズへ。 */
  const ptChoose = (action: PtAction) => {
    if (ptRef.current.phase !== 'select') return;
    ptQueueRef.current.push(action);
    const next = ptParty().findIndex((mm, i) => i > ptRef.current.turnIdx && !ptIsDown(mm));
    if (next >= 0) { ptPatch({ turnIdx: next, menu: 'root', pending: null }); return; }
    ptPatch({ phase: 'exec', menu: 'root', pending: null });
    setBattle(v => (v ? { ...v, canAct: false } : v));
    ptExecPosRef.current = 0;
    ptDelay(ptRunQueue, 350);
  };

  /** ff/mother3: 選択フェーズで1つ前のメンバーの行動を取り消して戻る。 */
  const ptUndo = () => {
    if (ptRef.current.phase !== 'select' || !ptQueueRef.current.length) return;
    const last = ptQueueRef.current.pop()!;
    const idx = ptParty().findIndex(mm => mm.id === last.memberId);
    ptPatch({ turnIdx: Math.max(0, idx), menu: 'root', pending: null });
  };

  /** ff/mother3: 確定済みキューを1件ずつ実行する。 */
  const ptRunQueue = () => {
    if (!battleRef.current.active || battleViewRef.current?.over) return;
    const q = ptQueueRef.current;
    if (ptExecPosRef.current >= q.length) { ptEnemyTurn(); return; }
    const action = q[ptExecPosRef.current++];
    const roster = ptParty();
    const actorIdx = roster.findIndex(mm => mm.id === action.memberId);
    const actor = roster[actorIdx];
    if (!actor || ptIsDown(actor)) { ptRunQueue(); return; } // 選択後に倒れたメンバーは飛ばす
    ptPatch({ turnIdx: Math.max(0, actorIdx) });
    if (action.kind === 'defend') {
      ptPatch({ defended: [...ptRef.current.defended, actor.id] });
      appendLog(`${actor.name}は みをまもっている……`, { canAct: false });
      ptDelay(ptRunQueue, 650);
      return;
    }
    if (action.kind === 'item' && action.item) {
      ptUseItemOn(action.item, action.targetMemberId ?? actor.id, actor.name, action.target);
      ptDelay(ptRunQueue, 850);
      return;
    }
    if (action.kind === 'skill' && action.move) {
      const m = action.move;
      if (actor.mp < m.cost) { appendLog(`${actor.name}の ${m.name}！ しかしMPが たりない！`, { canAct: false }); ptDelay(ptRunQueue, 700); return; }
      ptSetMp(actor.id, actor.mp - m.cost);
      if (m.heal) {
        const target = roster.find(mm => mm.id === (action.targetMemberId ?? actor.id) && !ptIsDown(mm)) ?? actor;
        const after = Math.min(target.maxHp, target.hp + m.power);
        dtSetHp(target.id, after);
        appendLog(`${actor.name}の ${m.name}！ ${target.name}のHPが ${after - target.hp} かいふく`, { canAct: false });
        ptDelay(ptRunQueue, 850);
      } else {
        const dmg = Math.max(1, Math.round(m.power * (0.85 + Math.random() * 0.3)));
        const over = ptHitFoe(`${actor.name}の ${m.name}！`, dmg, action.target);
        if (!over) ptDelay(ptRunQueue, 850);
      }
      return;
    }
    // 通常攻撃
    const dmg = calcDmg(effectiveMemberAtk(actor), battleRef.current.enemyDef);
    const over = ptHitFoe(`${actor.name}の こうげき！`, dmg, action.target);
    if (!over) ptDelay(ptRunQueue, 850);
  };

  /** ff/mother3: 敵ターン。生存している敵が1体ずつ順に行動し、終わったら次のラウンドへ。 */
  const ptEnemyTurn = () => {
    if (!battleRef.current.active || battleViewRef.current?.over) return;
    ptPatch({ phase: 'enemy', menu: 'root', pending: null });
    setBattle(v => (v && !v.over ? { ...v, canAct: false } : v));
    const alive = [...aliveFoeIdxs()];
    let step = 0;
    const actOne = () => {
      if (!battleRef.current.active || battleViewRef.current?.over) return;
      if (step >= alive.length) { ptDelay(ptBeginRound, 550); return; }
      const b = battleRef.current;
      const f = b.foes[alive[step++]];
      if (!f || f.gone) { actOne(); return; }
      const move = b.enemyMoves.length && Math.random() < 0.4 ? b.enemyMoves[Math.floor(Math.random() * b.enemyMoves.length)] : null;
      if (move?.heal) {
        const before = f.hp; f.hp = Math.min(f.maxHp, f.hp + move.power); syncFoesView();
        appendLog(`${f.name}は ${move.name}を となえた！ HPが ${f.hp - before} かいふく`, { canAct: false });
      } else {
        const targets = ptAliveMembers();
        const target = targets[Math.floor(Math.random() * targets.length)];
        if (!target) return;
        const raw = move ? Math.max(1, Math.round(move.power * (0.85 + Math.random() * 0.3))) : calcDmg(b.enemyAtk, effectiveMemberDef(target));
        const dealt = ptDamageMember(target, raw);
        playSfx(sfxRef.current.damage);
        shakeRef.current = 6;
        appendLog(`${f.name}の ${move ? move.name : 'こうげき'}！ ${target.name}に ${dealt}のダメージ`, { canAct: false });
        if (ptAllDown()) { setTimeout(() => endBattle('lose'), 700); return; }
      }
      ptDelay(actOne, 950);
    };
    ptDelay(actOne, 650);
  };

  /** パーティ制スタイル共通の にげる。失敗するとラウンド全体を消費して敵ターン（milky は行動値を消費）。 */
  const ptFlee = () => {
    if (ptRef.current.phase !== 'select') return;
    setBattle(v => (v ? { ...v, canAct: false } : v));
    if (Math.random() < 0.6) {
      ptPatch({ phase: 'exec', menu: 'root', pending: null });
      appendLog('うまく にげきれた！', { canAct: false, over: true });
      setTimeout(() => endBattle('flee'), 700);
      return;
    }
    appendLog('しかし まわりこまれてしまった！', { canAct: false });
    if (gameDataRef.current.battle?.style === 'milky') {
      milkyChargeCurrent(100);
      ptPatch({ phase: 'idle', menu: 'root', pending: null });
      ptDelay(milkyStartTicking, 800);
    } else {
      ptQueueRef.current = [];
      ptPatch({ phase: 'exec', menu: 'root', pending: null });
      ptDelay(ptEnemyTurn, 800);
    }
  };

  /** 敵対象が必要な行動の入口。敵が1体ならそのまま確定、複数なら対象選択（敵をタップ）へ。 */
  const ptWithTarget = (pend: NonNullable<PtView['pending']>) => {
    const alive = aliveFoeIdxs();
    if (alive.length <= 1) {
      ptPatch({ pending: pend });
      ptPickTarget(alive[0] ?? 0);
    } else {
      ptPatch({ pending: pend, menu: 'target' });
    }
  };

  /** パーティ制戦闘：対象の敵が決まったとき、保留中の行動を確定する。 */
  const ptPickTarget = (foeIdx: number) => {
    const p = ptRef.current;
    if (p.phase !== 'select' || !p.pending) return;
    const f = battleRef.current.foes[foeIdx];
    if (!f || f.gone) return;
    const style = gameDataRef.current.battle?.style;
    const pend = p.pending;
    const roster = ptParty();
    const actor = roster[p.turnIdx] ?? roster[0];
    if (style === 'milky') {
      if (!actor) return;
      const key = `m:${actor.id}`;
      if (pend.kind === 'attack') {
        ptPatch({ pending: null, menu: 'root' });
        milkyQueueAction(key, milkyBaseAttackCost(actor.atk), 'ふつうのこうげき', () => {
          const dmg = calcDmg(effectiveMemberAtk(actor), battleRef.current.enemyDef);
          return ptHitFoe(`${actor.name}の こうげき！`, dmg, foeIdx);
        });
      } else if (pend.kind === 'skill' && pend.move) {
        const m = pend.move;
        if (actor.mp < m.cost) return;
        ptPatch({ pending: null, menu: 'root' });
        ptSetMp(actor.id, actor.mp - m.cost);
        milkyQueueAction(key, milkyMoveCost(m), m.name, () => {
          const dmg = Math.max(1, Math.round(m.power * (0.85 + Math.random() * 0.3)));
          return ptHitFoe(`${actor.name}の ${m.name}！`, dmg, foeIdx);
        });
      }
      return;
    }
    // ff：選択をキューに積む
    if (!actor) return;
    if (pend.kind === 'attack') ptChoose({ memberId: actor.id, kind: 'attack', target: foeIdx });
    else if (pend.kind === 'skill' && pend.move) ptChoose({ memberId: actor.id, kind: 'skill', move: pend.move, target: foeIdx });
    else if (pend.kind === 'item' && pend.item) ptChoose({ memberId: actor.id, kind: 'item', item: pend.item, target: foeIdx });
  };

  /** 味方対象が必要な行動（回復技・どうぐ）の対象確定。 */
  const ptPickMember = (memberId: string) => {
    const p = ptRef.current;
    if (p.phase !== 'select' || !p.pending) return;
    const pend = p.pending;
    const target = ptParty().find(mm => mm.id === memberId);
    if (!target || ptIsDown(target)) return;
    const actor = ptParty()[p.turnIdx];
    if (!actor) return;
    if (pend.kind === 'skill' && pend.move) ptChoose({ memberId: actor.id, kind: 'skill', move: pend.move, targetMemberId: memberId });
    else if (pend.kind === 'item' && pend.item) ptChoose({ memberId: actor.id, kind: 'item', item: pend.item, targetMemberId: memberId });
  };

  /** ff/mother3/milky 共通：現在のメニュー（root/skill/item/target/member）に応じた選択肢一覧を返す。
   *  JSX のボタン描画と、十字キー操作（上下でカーソル移動・Zで確定）の両方がこの1つの配列を参照することで、
   *  マウス操作とキーボード操作が常に同じ並び・同じ挙動になる。 */
  const ptMenuActions = (): { label: string; sub?: string; disabled?: boolean; onClick: () => void }[] => {
    const p = ptRef.current;
    const bd = gameDataRef.current.battle;
    if (!bd || p.phase !== 'select') return [];
    const style = bd.style;
    const roster = ptParty();
    const cur = roster[Math.min(p.turnIdx, Math.max(0, roster.length - 1))];
    const skillMoves = availableMoves(bd.moves, progressRef.current.level).filter(m => m.mercy == null);
    const items = usableItems();
    if (p.menu === 'target') {
      const list = battleRef.current.foes
        .map((f, i) => ({ f, i }))
        .filter(x => !x.f.gone)
        .map(({ f, i }) => ({ label: f.name, onClick: () => ptPickTarget(i) }));
      list.push({ label: 'もどる', onClick: () => ptPatch({ menu: 'root', pending: null }) });
      return list;
    }
    if (p.menu === 'member') {
      const list = roster.filter(m => !ptIsDown(m)).map(m => ({ label: m.name, onClick: () => ptPickMember(m.id) }));
      list.push({ label: 'もどる', onClick: () => ptPatch({ menu: 'root', pending: null }) });
      return list;
    }
    if (p.menu === 'skill') {
      if (style === 'milky') {
        const list: { label: string; sub?: string; disabled?: boolean; onClick: () => void }[] =
          milkySkillList().map(x => ({ label: x.name, sub: x.sub, disabled: x.disabled, onClick: x.onClick }));
        list.push({ label: 'もどる', onClick: () => ptPatch({ menu: 'root' }) });
        return list;
      }
      const list: { label: string; sub?: string; disabled?: boolean; onClick: () => void }[] = skillMoves.map(m => ({
        label: m.name,
        sub: m.cost > 0 ? `${m.cost}` : undefined,
        disabled: (cur?.mp ?? 0) < m.cost,
        onClick: () => {
          if (m.heal) ptPatch({ pending: { kind: 'skill', move: m }, menu: 'member' });
          else ptWithTarget({ kind: 'skill', move: m });
        },
      }));
      list.push({ label: 'もどる', onClick: () => ptPatch({ menu: 'root' }) });
      return list;
    }
    if (p.menu === 'item') {
      const list: { label: string; sub?: string; disabled?: boolean; onClick: () => void }[] = items.map(it => ({
        label: it.name, sub: `×${inventory[it.id] ?? 0}`,
        onClick: () => {
          if (style === 'milky') { milkyItem(it); return; }
          const tt = it.targetType;
          if (tt === 'allAllies' || tt === 'allEnemies') { if (cur) ptChoose({ memberId: cur.id, kind: 'item', item: it }); }
          else if (tt === 'enemy') ptWithTarget({ kind: 'item', item: it });
          else ptPatch({ pending: { kind: 'item', item: it }, menu: 'member' });
        },
      }));
      list.push({ label: 'もどる', onClick: () => ptPatch({ menu: 'root' }) });
      return list;
    }
    // root
    const list: { label: string; sub?: string; disabled?: boolean; onClick: () => void }[] = [];
    if (style === 'milky') {
      // milky: こうげきラベルはそのまま技めくり画面（← ふつうのこうげき →）への入口
      list.push({ label: bd.labels.attack || 'こうげき', onClick: () => ptPatch({ menu: 'skill', menuCursor: 0 }) });
    } else {
      list.push({ label: bd.labels.attack || 'こうげき', onClick: () => ptWithTarget({ kind: 'attack' }) });
      if (skillMoves.length > 0) list.push({ label: bd.labels.move || 'とくぎ', onClick: () => ptPatch({ menu: 'skill' }) });
    }
    if (style !== 'milky') list.push({ label: 'ぼうぎょ', onClick: () => cur && ptChoose({ memberId: cur.id, kind: 'defend' }) });
    if (items.length > 0) list.push({ label: bd.labels.item ?? 'どうぐ', onClick: () => ptPatch({ menu: 'item' }) });
    list.push({ label: bd.labels.flee || 'にげる', onClick: ptFlee });
    if (ptQueueRef.current.length > 0 && style !== 'milky') list.push({ label: '↩ ひとつもどす', onClick: ptUndo });
    return list;
  };

  // ── milky（ミルキークエスト2風CTB）───────────────────────────────────────
  /** 現在戦っている全コンバタントの行動値キー一覧。 */
  const milkyKeys = () => {
    // milky は同行者が何人いても常に先頭(生存中)の1人だけが戦う完全1対1決闘。
    const front = ptParty().find(mm => mm.hp > 0);
    return [
      ...(front ? [`m:${front.id}`] : []),
      ...aliveFoeIdxs().slice(0, 1).map(i => `f:${i}`),
    ];
  };
  /** 現在行動中の者の行動値にコストを積む。 */
  const milkyChargeCurrent = (cost: number) => {
    const cur = milkyActorRef.current;
    if (cur) milkyAvRef.current[cur] = (milkyAvRef.current[cur] ?? 0) + cost;
  };
  /** 技の行動値コスト。強い技ほど大きい（通常攻撃の基準値=100）。 */
  const milkyMoveCost = (m: BattleMove) => Math.min(260, 100 + Math.round(m.power * 1.2));
  /** ふつうのこうげきの行動値コスト。atkが高い（＝強い）ほど動きが遅く、atkが低い（＝スライムのような雑魚）ほど
   *  身軽で行動値の溜まりが早い＝手数が多くなるようにする（一律100固定だと弱い敵も強い敵も同じ頻度で動いてしまう）。 */
  const milkyBaseAttackCost = (atk: number) => Math.max(70, Math.min(160, Math.round(60 + atk * 2)));
  /** milky: 「ふつうのこうげき」を先頭に据えた、犯す(こうげき)から入る一本の技リスト（← →でめくる）。 */
  const milkySkillList = (): { name: string; sub: string; disabled?: boolean; onClick: () => void }[] => {
    const bd = gameDataRef.current.battle!;
    const roster = ptParty();
    const cur = roster[Math.min(ptRef.current.turnIdx, Math.max(0, roster.length - 1))];
    const skillMoves = availableMoves(bd.moves, progressRef.current.level).filter(m => m.mercy == null);
    const atkCost = milkyBaseAttackCost(cur?.atk ?? 10);
    const list: { name: string; sub: string; disabled?: boolean; onClick: () => void }[] = [
      { name: 'ふつうのこうげき', sub: `WT${atkCost}`, onClick: () => ptWithTarget({ kind: 'attack' }) },
    ];
    skillMoves.forEach(m => {
      list.push({
        name: m.name, sub: `WT${milkyMoveCost(m)}`,
        disabled: (cur?.mp ?? 0) < m.cost,
        onClick: () => { if (m.heal) milkySelfSkill(m); else ptWithTarget({ kind: 'skill', move: m }); },
      });
    });
    return list;
  };
  /** 行動値カウントダウンの1目盛りぶんの減少量・間隔。 */
  const MILKY_TICK_STEP = 4;
  const MILKY_TICK_MS = 90;
  /** カウントダウンを止める。 */
  const milkyStopTicking = () => {
    if (milkyTickTimerRef.current) { clearInterval(milkyTickTimerRef.current); milkyTickTimerRef.current = null; }
  };
  /** 敵味方全員の行動値を同時にカウントダウンさせる。減るたびに効果音を鳴らし、
   *  誰かが0に達したらそこで止めて行動を実行する。 */
  const milkyStartTicking = () => {
    milkyStopTicking();
    milkyTickTimerRef.current = setInterval(() => {
      if (!battleRef.current.active || battleViewRef.current?.over) { milkyStopTicking(); return; }
      const keys = milkyKeys();
      if (!keys.length) { milkyStopTicking(); return; }
      let zeroKey: string | null = null;
      for (const k of keys) {
        const next = Math.max(0, (milkyAvRef.current[k] ?? 0) - MILKY_TICK_STEP);
        milkyAvRef.current[k] = next;
        if (next <= 0 && !zeroKey) zeroKey = k;
      }
      playSfx(sfxRef.current.graze);
      forceHud(n => n + 1);
      if (zeroKey) {
        milkyStopTicking();
        playSfx(sfxRef.current.coin);
        milkyResolveActor(zeroKey);
      }
    }, MILKY_TICK_MS);
  };
  /** 行動値が0に達した者を処理する。メンバーは「選ぶ」というUI上の操作があるため予約制（選択→行動値セット→
   *  再び0で発動）にするが、敵にはその操作がないので選ぶ＝即発動でよい（でないと敵の行動値が0になっても
   *  何も起きないまま無言で再チャージするだけに見えてしまうバグになる）。すでに予約中の行動（＝メンバーが選んだ技）が
   *  あれば、そこでようやく発動させる。 */
  const milkyResolveActor = (best: string) => {
    if (!battleRef.current.active || battleViewRef.current?.over) return;
    milkyActorRef.current = best;
    const pendingFn = milkyPendingRef.current[best];
    if (pendingFn) {
      // 予約済みの行動（メンバーが選んだ技）が行動値0に達した＝発動のとき
      delete milkyPendingRef.current[best];
      const over = pendingFn();
      if (over || !battleRef.current.active || battleViewRef.current?.over) return;
      milkyAvRef.current[best] = 100;
      ptDelay(milkyStartTicking, 700);
      return;
    }
    if (best.startsWith('m:')) {
      const roster = ptParty();
      const idx = roster.findIndex(mm => `m:${mm.id}` === best);
      ptPatch({ phase: 'select', menu: 'root', pending: null, turnIdx: Math.max(0, idx) });
      setBattle(v => (v && !v.over ? { ...v, canAct: true } : v));
      return;
    }
    // 敵：選ぶと同時にその場で行動する（弱い敵ほどコストが軽く、手数が多い）
    const b = battleRef.current;
    const f = b.foes[Number(best.slice(2))];
    if (!f || f.gone) { ptDelay(milkyStartTicking, 60); return; }
    const move = b.enemyMoves.length && Math.random() < 0.4 ? b.enemyMoves[Math.floor(Math.random() * b.enemyMoves.length)] : null;
    setMilkyEnemySkillName(move?.name ?? 'ふつうのこうげき');
    if (move?.heal) {
      const before = f.hp; f.hp = Math.min(f.maxHp, f.hp + move.power); syncFoesView();
      appendLog(`${f.name}は ${move.name}を となえた！ HPが ${f.hp - before} かいふく`, { canAct: false });
    } else {
      const targets = ptAliveMembers();
      const target = targets[Math.floor(Math.random() * targets.length)];
      if (!target) { ptDelay(milkyStartTicking, 60); return; }
      const raw = move ? Math.max(1, Math.round(move.power * (0.85 + Math.random() * 0.3))) : calcDmg(b.enemyAtk, effectiveMemberDef(target));
      const dealt = ptDamageMember(target, raw);
      playSfx(sfxRef.current.damage);
      shakeRef.current = 6;
      appendLog(`${f.name}の ${move ? move.name : 'こうげき'}！ ${target.name}に ${dealt}のダメージ`, { canAct: false });
      if (ptAllDown()) { setTimeout(() => endBattle('lose'), 700); return; }
    }
    milkyAvRef.current[best] = move ? Math.min(260, 100 + Math.round(move.power * 1.2)) : milkyBaseAttackCost(b.enemyAtk);
    ptDelay(milkyStartTicking, 700);
  };
  /** milky: 選んだ行動を即実行せず予約する。行動値をコストぶんセットし、再び0になったときに実行される。 */
  const milkyQueueAction = (key: string, cost: number, skillName: string, fn: () => boolean | void) => {
    milkyPendingRef.current[key] = fn;
    milkyAvRef.current[key] = cost;
    setMilkyAllySkillName(skillName);
    ptPatch({ phase: 'idle', menu: 'root', pending: null });
    setBattle(v => (v ? { ...v, canAct: false } : v));
    ptDelay(milkyStartTicking, 500);
  };
  /** milky: 回復技は自分にかける（対象選択を挟まないぶん行動が軽い）。 */
  const milkySelfSkill = (m: BattleMove) => {
    const actor = ptParty()[ptRef.current.turnIdx];
    if (!actor || actor.mp < m.cost) return;
    ptSetMp(actor.id, actor.mp - m.cost);
    milkyQueueAction(`m:${actor.id}`, milkyMoveCost(m), m.name, () => {
      const cur = ptParty().find(mm => mm.id === actor.id);
      if (!cur) return;
      const after = Math.min(cur.maxHp, cur.hp + m.power);
      dtSetHp(cur.id, after);
      appendLog(`${cur.name}の ${m.name}！ HPが ${after - cur.hp} かいふく`, { canAct: false });
    });
  };
  /** milky: どうぐは行動中のメンバー自身に使う（行動値コスト80）。 */
  const milkyItem = (it: ItemDef) => {
    const actor = ptParty()[ptRef.current.turnIdx];
    if (!actor) return;
    milkyQueueAction(`m:${actor.id}`, 80, it.name, () => { ptUseItemOn(it, actor.id); });
  };

  const battleStyle = gameData.battle?.style ?? 'classic';
  const inBattle = !!battle;
  // アンダーテール風戦闘のログ：最新行を1文字ずつ表示するタイプライター演出
  const [logRevealCount, setLogRevealCount] = useState(0);
  const lastLogLine = battle?.log.at(-1) ?? '';
  useEffect(() => {
    if (!isDodgeBattleStyle(battleStyle) || !lastLogLine) { setLogRevealCount(0); return; }
    setLogRevealCount(0);
    let i = 0;
    const id = setInterval(() => {
      const ch = lastLogLine[i];
      i++;
      setLogRevealCount(i);
      if (ch && ch.trim()) playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).textTyper);
      if (i >= lastLogLine.length) clearInterval(id);
    }, 32);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastLogLine, battleStyle]);

  // undertale（アンダーテール系のみ）: たたかう＝タイミングバー。バーが右端まで行くとミス。
  // クリック/Z/Enter/Spaceで停止。デルタルーンは下の専用マルチバー実装（dtFightPos）を使う。
  useEffect(() => {
    if (!inBattle || !isDodgeBattleStyle(battleStyle) || battleStyle === 'deltarune' || undertalePhase !== 'attack') return;
    undertaleBarRef.current = { pos: 0 };
    let raf = 0; let alive = true;
    const step = () => {
      if (!alive) return;
      undertaleBarRef.current.pos += 0.013;
      if (undertaleBarElRef.current) undertaleBarElRef.current.style.left = `${Math.min(100, undertaleBarRef.current.pos * 100)}%`;
      if (undertaleBarRef.current.pos >= 1) { alive = false; missUndertaleAttack(undertaleBarRef.current.pos); return; }
      raf = requestAnimationFrame(step);
    };
    const stop = () => { if (!alive) return; alive = false; cancelAnimationFrame(raf); resolveUndertaleAttack(undertaleBarRef.current.pos); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'z' || e.key === 'Z' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stop(); } };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', stop);
    raf = requestAnimationFrame(step);
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', stop); };
  }, [inBattle, battleStyle, undertalePhase]);

  /** デルタルーン: 「たたかう」を選んだメンバー全員ぶんのタイミングバーを同時に動かす
   *  （tlDR o_enc_fightstick 準拠）。全行の棒が並行して右端から左端の的へ流れ、行ごとに開始が
   *  ずれるため、的への到達は上の行から順にやってくる＝参加メンバーの人数ぶん、上から順に
   *  独立した押下チャンスがある（1回の押下で全員ぶんが決まることはない）。的は左端固定。
   *  入力（Z/タップ）はキュー順の「現在の担当メンバー」の行だけに効き、棒が的を通り過ぎて
   *  左端に達するとミス。棒の毎フレーム移動は React を介さず dtStickElsRef の style.left を
   *  直接書く（巨大コンポーネントの60fps再レンダリング回避）。 */
  useEffect(() => {
    if (!inBattle || battleStyle !== 'deltarune' || undertalePhase !== 'attack') return;
    const rows = dtAttackRowsRef.current;
    if (!rows.length) return;
    const t0 = performance.now();
    let alive = true; let raf = 0;
    const resolvedLocal = new Set<number>();
    // STAGGER＝行ごとの開始ずれ。的への到達間隔もこの値になるので、1人ずつはっきり分かれた
    // 押下タイミングになるよう十分に空ける（250msだと3人が0.5秒内に集中し実質1押しで決まってしまう）。
    const STAGGER_MS = 500, DURATION_MS = 1300;
    // 押しっぱなし（キーリピート）や連打で複数行が一度に解決されないようにするガード
    let keyHeld = false;
    let inputLockUntil = 0;
    // s＝棒の位置。1=右端 → 0=左端。行 i は i*STAGGER_MS 遅れて走り出す（それまで右端で待機）。
    const sOf = (rowOrder: number) => 1 - Math.max(0, performance.now() - t0 - rowOrder * STAGGER_MS) / DURATION_MS;
    const step = () => {
      if (!alive) return;
      rows.forEach((memberIdx, i) => {
        if (resolvedLocal.has(memberIdx)) return;
        const el = dtStickElsRef.current[memberIdx];
        if (el) el.style.left = `${Math.max(0, Math.min(1, sOf(i))) * 100}%`;
      });
      const cur = dtTurnIdxRef.current;
      const curOrder = rows.indexOf(cur);
      if (curOrder >= 0 && !resolvedLocal.has(cur) && sOf(curOrder) <= 0) {
        resolvedLocal.add(cur);
        missUndertaleAttack();
      }
      raf = requestAnimationFrame(step);
    };
    // 押下が「その行への入力」として成立する棒の位置。これより右（早すぎる押下）は無視する。
    // 参考実装（o_enc_fightstick）も x が的の手前一定範囲に入るまでは押しても解決しない
    // （バーが光るだけ）。これが無いと、1回の早押しがその場でミス扱いになり、続く押下が
    // まだ流れてもいない次のメンバーの行を次々つぶしてしまう（＝1押しで全員確定に見えるバグ）。
    // 0.35＝有効ゾーン(0.26)の少し手前から。500ms間隔で流れる前後の行の受付時間が重ならない値。
    const PRESSABLE = 0.35;
    const hit = () => {
      if (performance.now() < inputLockUntil) return; // 直前の解決から間もない入力は次の行に食い込ませない
      const cur = dtTurnIdxRef.current;
      const curOrder = rows.indexOf(cur);
      if (curOrder < 0 || resolvedLocal.has(cur)) return;
      const s = sOf(curOrder);
      if (s > PRESSABLE) return; // 担当行の棒がまだ的に近づいていない：押下を無視（ミスにしない）
      resolvedLocal.add(cur);
      inputLockUntil = performance.now() + 250;
      resolveUndertaleAttack(Math.max(0, s), DT_FIGHT_TARGET);
    };
    const isFireKey = (k: string) => k === 'z' || k === 'Z' || k === 'Enter' || k === ' ';
    const onKey = (e: KeyboardEvent) => {
      if (!isFireKey(e.key)) return;
      e.preventDefault();
      if (keyHeld) return; // OSのキーリピートを無視：1押下=1回ぶんの判定
      keyHeld = true;
      hit();
    };
    const onKeyUp = (e: KeyboardEvent) => { if (isFireKey(e.key)) keyHeld = false; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerdown', hit);
    raf = requestAnimationFrame(step);
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('pointerdown', hit); };
    // 担当メンバーは dtTurnIdxRef 経由で参照し、依存に入れない（入れると担当交代のたびに
    // effect が張り直され、並行して走っている全行の棒がリセットされてしまう）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inBattle, battleStyle, undertalePhase]);

  // undertale: 敵ターン＝バトルボックス内の弾幕よけミニゲーム（176×176 の小キャンバス）。
  useEffect(() => {
    if (!inBattle || !isDodgeBattleStyle(battleStyle) || undertalePhase !== 'dodge') return;
    const cv = undertaleCanvasRef.current; const st = undertaleDodgeRef.current;
    if (!cv || !st) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const W = 176, H = 176, HR = 6;
    let raf = 0; let alive = true;

    const scriptSrc = st.miniScript;
    let scriptCtx = { cancelled: false };
    st.scriptCtx = scriptCtx;

    if (scriptSrc) {
      // 生きている敵の数（st.attackers）ぶんだけ同じ弾幕スクリプトを並走させる。
      // runnerIdx に応じて開始を数フレームずらし、完全に重なった同一弾にならないようにする。
      // 敵が倒れる/みのがされると次のターンから並走数が減り、弾幕の激しさが自然に収まる。
      const runDodgeScript = async (runnerIdx = 0) => {
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
          if (runnerIdx > 0) await wait(runnerIdx * 6); // 2体目以降は少し遅れて撃ち始める
          await runMiniScript(lines, env, {});
        } catch (e) {
          if (e !== CANCEL) console.warn('[MiniScript Dodge]', e);
        }
      };
      for (let i = 0; i < st.attackers; i++) runDodgeScript(i);
    }

    const drawHeart = (x: number, y: number, s: number, color: string, flip = false) => {
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      const dir = flip ? -1 : 1;
      ctx.moveTo(x, y + s * 0.9 * dir);
      ctx.bezierCurveTo(x + s, y + s * 0.2 * dir, x + s * 0.8, y - s * 0.8 * dir, x, y - s * 0.2 * dir);
      ctx.bezierCurveTo(x - s * 0.8, y - s * 0.8 * dir, x - s, y + s * 0.2 * dir, x, y + s * 0.9 * dir);
      ctx.fill();
      ctx.restore();
    };
    const PURPLE_LANES = [40, 88, 136];
    let prevUp = false, prevDown = false;
    const loop = () => {
      if (!alive) return;
      const pr = progressRef.current;
      st.frames++;
      // 入力（メインエンジンと同じキーセットを読む）
      const keys = engineRef.current.keys;
      const isLeft = keys.has('ArrowLeft') || keys.has('a') || keys.has('A');
      const isRight = keys.has('ArrowRight') || keys.has('d') || keys.has('D');
      const isUp = keys.has('ArrowUp') || keys.has('w') || keys.has('W');
      const isDown = keys.has('ArrowDown') || keys.has('s') || keys.has('S');
      const isFire = keys.has('z') || keys.has('Z') || keys.has('Enter') || keys.has(' ');
      const sp = 2.4;
      const mode = st.mode;

      if (mode === 'green') {
        // UNDERTALEは動かず、押した方向にシールドを構える
        st.shieldDir = isUp ? 'up' : isDown ? 'down' : isLeft ? 'left' : isRight ? 'right' : null;
      } else if (mode === 'blue') {
        // 重力モード：左右移動＋Upでジャンプ（長押しでジャンプが高くなる）
        if (isLeft) st.hx -= sp; if (isRight) st.hx += sp;
        if (st.grounded) {
          st.gvy = 0;
          if (isUp) { st.gvy = -5.2; st.grounded = false; st.jumpHeld = 1; }
        } else {
          const holding = isUp && st.jumpHeld > 0 && st.jumpHeld < 16 && st.gvy < 0;
          st.gvy += holding ? 0.18 : 0.42;
          st.jumpHeld = holding ? st.jumpHeld + 1 : 0;
        }
        st.hy += st.gvy;
        if (st.hy >= H - 9) { st.hy = H - 9; st.grounded = true; st.gvy = 0; }
        if (st.hy <= 9) { st.hy = 9; st.gvy = 0; }
      } else if (mode === 'purple') {
        // クモの糸モード：Up/Downで3本のレーンを瞬時に切り替え、Left/Rightでレーン上を移動
        if (isUp && !prevUp) st.lane = Math.max(0, st.lane - 1);
        if (isDown && !prevDown) st.lane = Math.min(PURPLE_LANES.length - 1, st.lane + 1);
        st.hy = PURPLE_LANES[st.lane];
        if (isLeft) st.hx -= sp; if (isRight) st.hx += sp;
      } else {
        // red / yellow：全方向自由移動
        if (isLeft) st.hx -= sp; if (isRight) st.hx += sp;
        if (isUp) st.hy -= sp; if (isDown) st.hy += sp;
      }
      prevUp = isUp; prevDown = isDown;
      if (mode !== 'green') {
        st.hx = Math.max(9, Math.min(W - 9, st.hx));
        st.hy = Math.max(9, Math.min(H - 9, st.hy));
      }

      // yellow：Z/Enterで前方（上方向）に弾を発射し、敵弾を撃ち落とせる
      if (mode === 'yellow') {
        if (st.shotCool > 0) st.shotCool--;
        if (isFire && st.shotCool <= 0) { st.shots.push({ x: st.hx, y: st.hy - 8, vy: -4.2 }); st.shotCool = 12; playSfx(UNDERTALE_SHOOT_SFX); }
        for (const s of st.shots) s.y += s.vy;
        st.shots = st.shots.filter(s => s.y > -10);
      }

      // 弾の生成（3パターン：あめ／ねらいうち／よこなぐり）。
      // 敵の数（st.attackers）ぶんだけ同じパターンを位相をずらして並走させ、
      // 敵が多いほど密度が上がり、減ると自然に薄くなる。
      if (!scriptSrc) {
        for (let j = 0; j < st.attackers; j++) {
          const ph = st.frames + j * 5;
          if (st.pattern === 0) {
            if (ph % 11 === 0) st.bullets.push({ x: 8 + Math.random() * (W - 16), y: -6, vx: 0, vy: 1.3 + Math.random() * 1.2, r: 4 });
          } else if (st.pattern === 1) {
            if (ph % 24 === 0) {
              const edge = Math.floor(Math.random() * 4);
              const x = edge === 0 ? -6 : edge === 1 ? W + 6 : Math.random() * W;
              const y = edge === 2 ? -6 : edge === 3 ? H + 6 : Math.random() * H;
              const d = Math.hypot(st.hx - x, st.hy - y) || 1;
              st.bullets.push({ x, y, vx: (st.hx - x) / d * 1.6, vy: (st.hy - y) / d * 1.6, r: 4.5 });
            }
          } else {
            if (ph % 16 === 0) {
              const fromLeft = Math.floor(ph / 16) % 2 === 0;
              st.bullets.push({ x: fromLeft ? -6 : W + 6, y: 10 + Math.random() * (H - 20), vx: fromLeft ? 1.9 : -1.9, vy: 0, r: 4 });
            }
          }
        }
      }
      for (const bl of st.bullets) { bl.x += bl.vx; bl.y += bl.vy; }
      st.bullets = st.bullets.filter(bl => bl.x > -20 && bl.x < W + 20 && bl.y > -20 && bl.y < H + 20);

      // yellow：自機弾が敵弾に当たったら双方を消す
      if (mode === 'yellow' && st.shots.length && st.bullets.length) {
        const shotsToRemove = new Set<number>();
        const bulletsToRemove = new Set<number>();
        st.shots.forEach((s, si) => {
          st.bullets.forEach((bl, bi) => {
            if (bulletsToRemove.has(bi)) return;
            if (Math.hypot(bl.x - s.x, bl.y - s.y) < bl.r + 3) { shotsToRemove.add(si); bulletsToRemove.add(bi); }
          });
        });
        if (shotsToRemove.size) st.shots = st.shots.filter((_, i) => !shotsToRemove.has(i));
        if (bulletsToRemove.size) st.bullets = st.bullets.filter((_, i) => !bulletsToRemove.has(i));
      }

      // 被弾判定（被弾後は無敵時間つき）
      if (st.invuln > 0) st.invuln--;
      else {
        for (const bl of st.bullets) {
          if (Math.hypot(bl.x - st.hx, bl.y - st.hy) < bl.r + HR - 1) {
            // green：構えたシールドの方向から来た弾（矢弾）はブロックしてダメージ無効
            if (mode === 'green' && st.shieldDir) {
              const horizontal = Math.abs(bl.vx) >= Math.abs(bl.vy);
              const incomingFrom = horizontal ? (bl.vx > 0 ? 'left' : 'right') : (bl.vy > 0 ? 'up' : 'down');
              if (incomingFrom === st.shieldDir) { st.invuln = 8; break; }
            }
            if (gameDataRef.current.battle?.style === 'deltarune') {
              // デルタルーン風パーティ戦闘：生存メンバーからランダムに1人が被弾（「まもる」済みなら 2/3 に軽減）。
              const target = dtPickTarget();
              if (target) {
                dtDamageMember(target, st.dmg);
                playSfx(sfxRef.current.damage);
                if (dtAllDown()) { alive = false; endBattle('lose'); return; }
              }
            } else {
              pr.hp = Math.max(0, pr.hp - st.dmg);
              playSfx(sfxRef.current.damage);
              forceHud(n => n + 1);
              if (pr.hp <= 0) { alive = false; endBattle('lose'); return; }
            }
            st.invuln = 45;
            break;
          }
        }
      }
      // デルタルーン：グレイズ（弾がハートをかすめる）でTPが溜まる（tlDR Engine の o_enc_undertale_grazer 相当）。
      // 弾1発につき1回だけ加算し、被弾直後の無敵中は判定しない。
      if (gameDataRef.current.battle?.style === 'deltarune' && st.invuln <= 0) {
        for (const bl of st.bullets) {
          if (bl.grazed) continue;
          const d = Math.hypot(bl.x - st.hx, bl.y - st.hy);
          if (d < bl.r + HR + 8 && d >= bl.r + HR - 1) {
            bl.grazed = true;
            const nextTp = Math.min(100, tpRef.current + 3);
            tpRef.current = nextTp; setTp(nextTp);
            st.grazeFx = 12;
            playSfx(DT_SFX.graze);
          }
        }
      }
      if (st.grazeFx && st.grazeFx > 0) st.grazeFx--;
      // 描画
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      if (mode === 'purple') {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        for (const ly of PURPLE_LANES) { ctx.beginPath(); ctx.moveTo(4, ly); ctx.lineTo(W - 4, ly); ctx.stroke(); }
      }
      for (const bl of st.bullets) {
        ctx.fillStyle = bl.color ?? '#fff';
        if (mode === 'green') {
          // 矢形の弾（進行方向を向く三角形）
          const ang = Math.atan2(bl.vy, bl.vx);
          ctx.save();
          ctx.translate(bl.x, bl.y);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.moveTo(bl.r + 3, 0); ctx.lineTo(-bl.r, bl.r); ctx.lineTo(-bl.r, -bl.r);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath(); ctx.arc(bl.x, bl.y, bl.r, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (mode === 'yellow') {
        ctx.fillStyle = '#ffe600';
        for (const s of st.shots) ctx.fillRect(s.x - 1, s.y - 4, 2, 6);
      }
      if (mode === 'green' && st.shieldDir) {
        ctx.fillStyle = '#5ac8ff';
        const sx = st.hx, sy = st.hy;
        if (st.shieldDir === 'left') ctx.fillRect(sx - 16, sy - 10, 4, 20);
        else if (st.shieldDir === 'right') ctx.fillRect(sx + 12, sy - 10, 4, 20);
        else if (st.shieldDir === 'up') ctx.fillRect(sx - 10, sy - 16, 20, 4);
        else ctx.fillRect(sx - 10, sy + 12, 20, 4);
      }
      if (st.invuln % 8 < 4) {
        // デルタルーンは tlDR Engine の spr_undertale をそのまま描く（未ロード時はベジェのハートでフォールバック）
        const undertaleImg = gameDataRef.current.battle?.style === 'deltarune' ? getDodgeImg(TLDR_UNDERTALE_SPRITE.frames[0]) : null;
        if (undertaleImg && undertaleImg.complete && undertaleImg.naturalWidth > 0) {
          ctx.save();
          ctx.translate(st.hx, st.hy);
          if (mode === 'yellow') ctx.rotate(Math.PI); // yellow は逆さ（砲台）向き
          ctx.drawImage(undertaleImg, -8, -8, 16, 16);
          ctx.restore();
        } else {
          drawHeart(st.hx, st.hy, HR + 2, '#ff1e3c', mode === 'yellow');
        }
      }
      if (st.grazeFx && st.grazeFx > 0) {
        // グレイズの白いリング（外→内に収束しながらフェード）
        ctx.strokeStyle = `rgba(255,255,255,${(st.grazeFx / 12) * 0.8})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(st.hx, st.hy, HR + 12 - (12 - st.grazeFx) / 2, 0, Math.PI * 2); ctx.stroke();
      }
      if (st.frames >= st.duration) {
        alive = false;
        setUndertalePhase('menu'); setUndertaleMenu('root');
        if (gameDataRef.current.battle?.style === 'deltarune') {
          // 次のラウンドへ：全員また行動選択できるように「まもる」フラグと行動順をリセット
          // （downしたメンバーは飛ばす）。弾幕をしのいだご褒美として少しTPを加算する。
          dtDefendedRef.current = new Set();
          const first = Math.max(0, dtParty().findIndex(m => m.hp > 0));
          dtTurnIdxRef.current = first; setDtTurnIdx(first);
          const nextTp = Math.min(100, tpRef.current + 8);
          tpRef.current = nextTp; setTp(nextTp);
          appendLog('…こうげきを しのいだ！', { canAct: !dtAllDown() });
        } else {
          appendLog('…こうげきを しのいだ！', { canAct: progressRef.current.hp > 0 });
        }
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; scriptCtx.cancelled = true; cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inBattle, battleStyle, undertalePhase]);

  /** undertale: タッチ/マウスでハートを直接動かす。UNDERTALE戦闘系プリセットでは方向キー操作のみに限定するため無効化。 */
  const undertalePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isUndertalePreset) return;
    const st = undertaleDodgeRef.current; const cv = undertaleCanvasRef.current;
    if (!st || !cv) return;
    const rect = cv.getBoundingClientRect();
    st.hx = Math.max(9, Math.min(167, (e.clientX - rect.left) / rect.width * 176));
    st.hy = Math.max(9, Math.min(167, (e.clientY - rect.top) / rect.height * 176));
  };

  /** healHp/healMp を持つアイテムを使う。inBattle=true ならターン消費して敵の反撃を受ける。 */
  const useHealItem = (it: ItemDef, inBattle: boolean) => {
    if (inBattle && gameDataRef.current.battle?.style === 'deltarune' && dtStageRef.current === 'select') {
      if (!battleViewRef.current?.canAct || battleViewRef.current.over) return;
      if ((inventoryRef.current[it.id] ?? 0) <= 0) return;
      dtQueueRef.current.push({ idx: dtTurnIdxRef.current, kind: 'item', item: it });
      dtSelLogRef.current.push({ idx: dtTurnIdxRef.current, kind: 'item' });
      setBattle(v => (v ? { ...v, canAct: false } : v));
      setBattleItemsOpen(false);
      dtAdvanceTurn();
      return;
    }
    const pr = progressRef.current;
    if ((inventoryRef.current[it.id] ?? 0) <= 0) return;
    const parts: string[] = [];
    // 主人公（先頭メンバー）向けの override があれば回復量を差し替える。
    const leadId = gameDataRef.current.battle?.party?.[0]?.id ?? '__self';
    const ov = it.overrides?.find(o => o.memberId === leadId);
    const healHp = ov?.healHp ?? it.healHp;
    const healMp = ov?.healMp ?? it.healMp;
    if (healHp) { const before = pr.hp; pr.hp = Math.min(pr.maxHp, pr.hp + healHp); parts.push(`HPが ${pr.hp - before} かいふく`); }
    if (healMp) { const before = pr.mp; pr.mp = Math.min(pr.maxMp, pr.mp + healMp); parts.push(`MPが ${pr.mp - before} かいふく`); }
    // 敵対象アイテム：所持する foes 配列にダメージを与える（classic の単体 enemyHp にもフォールバック）。
    if ((it.targetType === 'enemy' || it.targetType === 'allEnemies') && (ov?.damage ?? it.damage)) {
      const dmg = ov?.damage ?? it.damage ?? 0;
      if (battleRef.current.foes?.length) {
        const idxs = it.targetType === 'allEnemies' ? aliveFoeIdxs() : [retargetFoe(attackTargetRef.current)];
        idxs.forEach(fi => { const foe = battleRef.current.foes[fi]; if (foe && !foe.gone) { damageFoe(fi, dmg); parts.push(`${foe.name}に ${dmg}のダメージ`); } });
      } else {
        battleRef.current.enemyHp = Math.max(0, battleRef.current.enemyHp - dmg);
        parts.push(`てきに ${dmg}のダメージ`);
      }
    }
    // スロットからも除去
    const idx = invSlotsRef.current.indexOf(it.id);
    if (idx >= 0) {
      const copy = [...invSlotsRef.current]; copy.splice(idx, 1);
      setInvSlots(copy); invSlotsRef.current = copy;
    }
    setInventory(p => { const n = { ...p }; n[it.id] = (n[it.id] ?? 0) - 1; if (n[it.id] <= 0) delete n[it.id]; return n; });
    playSfx(sfxRef.current.inn);
    forceHud(n => n + 1);
    if (inBattle) {
      setBattleItemsOpen(false);
      if (gameDataRef.current.battle?.style === 'deltarune') {
        const user = dtParty()[dtTurnIdxRef.current];
        if (user) dtPlayMemberAnim(user.id, 'item', 700);
      }
      appendLog(`${it.name}を つかった！ ${parts.join('、')}`, { canAct: false });
      dtAdvanceTurn();
    } else {
      setBagOpen(false);
      showGameMsg(`${it.emoji} ${it.name}を つかった！\n${parts.join('、')}した`, 'instant', () => { });
    }
  };

  /** 「どうぐ」で使えるアイテム（healHp/healMp 持ちで所持数 1 以上）。 */
  const usableItems = () =>
    (gameDataRef.current.items ?? []).filter(it => (it.healHp || it.healMp || it.damage || it.targetType) && (inventoryRef.current[it.id] ?? 0) > 0);

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
    playSfx(MSG_ADVANCE_SFX);
    if (gameMsgTimerRef.current) { clearTimeout(gameMsgTimerRef.current); gameMsgTimerRef.current = null; }

    // Call onDismiss outside of the state updater to avoid React Strict Mode calling it twice!
    const onDismiss = gameMsgRef.current?.onDismiss;
    setGameMsg(null);
    gameMsgReadyRef.current = false;

    if (onDismiss) {
      onDismiss();
    }
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
  const findActivePage = useCallback((obj: { id: string; pages?: EventPage[] }): EventPage | null => {
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
    const weapons = gameDataRef.current.weapons ?? [];
    const armors = gameDataRef.current.armors ?? [];
    let atkBonus = 0, defBonus = 0;
    if (eq.weapon) { const it = weapons.find(i => i.id === eq.weapon); atkBonus += it?.atkBonus ?? 0; }
    if (eq.armor) { const it = armors.find(i => i.id === eq.armor); defBonus += it?.defBonus ?? 0; }
    // レベル基礎値（baseAtk/baseDef）に装備ボーナスを重ねる。旧データ互換で未設定なら初期値を使う。
    pr.atk = (pr.baseAtk || b.atk) + atkBonus;
    pr.def = (pr.baseDef || b.def) + defBonus;
    forceHud(n => n + 1);
  }, []);

  /** 同行者の装備ボーナス合計（atk/def）。 */
  const getMemberEquipBonus = useCallback((memberId: string): { atk: number; def: number } => {
    const eq = partyEquipmentRef.current[memberId];
    if (!eq) return { atk: 0, def: 0 };
    const weapons = gameDataRef.current.weapons ?? [];
    const armors = gameDataRef.current.armors ?? [];
    let atk = 0, def = 0;
    if (eq.weapon) { const it = weapons.find(i => i.id === eq.weapon); atk += it?.atkBonus ?? 0; }
    if (eq.armor) { const it = armors.find(i => i.id === eq.armor); def += it?.defBonus ?? 0; }
    return { atk, def };
  }, []);
  const effectiveMemberAtk = useCallback((member: { id: string; atk?: number }): number => {
    return (member.atk ?? 0) + getMemberEquipBonus(member.id).atk;
  }, [getMemberEquipBonus]);
  const effectiveMemberDef = useCallback((member: { id: string; def?: number }): number => {
    return (member.def ?? 0) + getMemberEquipBonus(member.id).def;
  }, [getMemberEquipBonus]);

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
      console.log(cmd.type)
      switch (cmd.type) {
        case 'message':
          console.log(index);
          showGameMsg(cmd.text, 'instant', advance);
          console.log(index);
          break;
        case 'overheadMessage':
          itemGetRef.current = { text: cmd.text, startTime: performance.now() };
          console.log(index);
          setTimeout(advance, 30);
          console.log(index);
          break;
        case 'playSound':
          playSfx({ ref: `direct:${cmd.src}`, src: cmd.src, type: 'direct' });
          setTimeout(advance, 0);
          break;
        case 'choice': {
          // RPGEN #SEL の c:0（既定）は選択肢を出す前に直前のメッセージウィンドウを閉じる。
          // c:1（keepMessage）のときだけ表示したままにする。
          if (!cmd.keepMessage) {
            if (gameMsgTimerRef.current) { clearTimeout(gameMsgTimerRef.current); gameMsgTimerRef.current = null; }
            setGameMsg(null);
            gameMsgReadyRef.current = false;
          }
          // RPGEN #SEL の x/y 省略時は選択肢UIを出さず、ランダムに1つ選んで即実行する。
          if (cmd.random) {
            if (cmd.choices.length === 0) { setTimeout(advance, 0); break; }
            const idx = Math.floor(Math.random() * cmd.choices.length);
            runEventCommands(objId, cmd.choices[idx].commands, advance);
            break;
          }
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
        }
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
        case 'giveItem': {
          let added = 0;
          const slots = [...invSlotsRef.current];
          for (let i = 0; i < cmd.count; i++) {
            if (slots.length >= MAX_INVENTORY) break;
            slots.push(cmd.itemId);
            added++;
          }
          if (added > 0) {
            setInvSlots(slots); invSlotsRef.current = slots;
            setInventory(p => { const n = { ...p }; n[cmd.itemId] = (n[cmd.itemId] ?? 0) + added; return n; });
          }
          const newItem = (gameDataRef.current.items ?? []).find(it => it.id === cmd.itemId);
          if (newItem?.category === 'weapon' || newItem?.category === 'armor') {
            const eq = { ...equipmentRef.current };
            if (newItem.category === 'weapon') eq.weapon = newItem.id;
            if (newItem.category === 'armor') eq.armor = newItem.id;
            setEquipment(eq);
            applyEquipment(eq);
          }
          const gotten = added > 0 ? added : 0;
          itemGetRef.current = { text: `${newItem?.emoji ?? '🎒'} ${newItem?.name ?? cmd.itemId}${gotten > 0 ? ` ×${gotten}` : ' は いっぱいで もてなかった！'}`, startTime: performance.now() };
          setTimeout(advance, 30);
          break;
        }
        case 'removeItem': {
          const slots2 = [...invSlotsRef.current];
          let removed = 0;
          for (let i = slots2.length - 1; i >= 0 && removed < cmd.count; i--) {
            if (slots2[i] === cmd.itemId) { slots2.splice(i, 1); removed++; }
          }
          if (removed > 0) {
            setInvSlots(slots2); invSlotsRef.current = slots2;
            setInventory(p => { const n = { ...p }; n[cmd.itemId] = Math.max(0, (n[cmd.itemId] ?? 0) - removed); if (n[cmd.itemId] === 0) delete n[cmd.itemId]; return n; });
          }
          setTimeout(advance, 30);
          break;
        }
        case 'warp':
          if (cmd.mapId) {
            const targetSceneId = `rpgen_map_${cmd.mapId}`;
            const ex = cmd.col * TILE_SIZE;
            const ey = cmd.row * TILE_SIZE;
            sceneFadeRef.current = { phase: 'out', frame: 0, totalFrames: 16, nextSceneId: targetSceneId, entryX: ex, entryY: ey };
            setTimeout(advance, 0);
          } else {
            engineRef.current.player.x = cmd.col * TILE_SIZE;
            engineRef.current.player.y = cmd.row * TILE_SIZE;
            setTimeout(advance, 50);
          }
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
          if (cmd.amount > 0) {
            itemGetRef.current = { text: `🪙 ${cmd.amount}ゴールド を てにいれた！`, startTime: performance.now() };
          } else if (cmd.amount < 0) {
            itemGetRef.current = { text: `🪙 ${Math.abs(cmd.amount)}ゴールド を うしなった`, startTime: performance.now() };
          }
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
          playSfx(sfxRef.current.inn);
          forceHud(n => n + 1);
          setTimeout(advance, 30);
          break;
        }
        case 'restoreMp': {
          const pr3 = progressRef.current;
          pr3.mp = cmd.amount != null ? Math.min(pr3.maxMp, pr3.mp + (cmd.amount ?? 0)) : pr3.maxMp;
          playSfx(sfxRef.current.inn);
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
        case 'changeSprite': {
          const target = !cmd.objId ? 'player' : cmd.objId;
          if (target === 'player') {
            engineRef.current.player.spriteRef = cmd.spriteRef;
            engineRef.current.player.spriteUrl = cmd.spriteUrl;
          } else {
            const obj = engineRef.current.entities?.find(o => o.def.id === target);
            if (obj) {
              obj.spriteRef = cmd.spriteRef;
              obj.spriteUrl = cmd.spriteUrl;
            }
          }
          setTimeout(advance, 0);
          break;
        }
        case 'changeBackground':
          gameDataRef.current.mapBgRef = cmd.bgRef;
          gameDataRef.current.mapBgUrl = cmd.bgUrl;
          setTimeout(advance, 0);
          break;
        case 'showImage':
          setOverlayImages(prev => ({
            ...prev, [cmd.imgId]: {
              url: cmd.url, x: cmd.x, y: cmd.y, w: cmd.w, h: cmd.h, opacity: cmd.opacity, isPercent: cmd.isPercent,
              m: cmd.m, c: cmd.c, sxp: cmd.sxp, swp: cmd.swp, xp: cmd.xp, wp: cmd.wp, lp: cmd.lp,
              ms: cmd.ms, frames: cmd.frames, startTime: Date.now()
            }
          }));
          if (cmd.frames && cmd.frames.length > 0 && !cmd.lp && cmd.ms) {
            const duration = cmd.frames.length * cmd.ms;
            setTimeout(advance, duration);
          } else {
            setTimeout(advance, 0);
          }
          break;
        case 'hideImage':
          setOverlayImages(prev => { const next = { ...prev }; delete next[cmd.imgId]; return next; });
          setFollowImages(prev => { const next = { ...prev }; delete next[cmd.imgId]; return next; });
          setTimeout(advance, 0);
          break;
        case 'followImage':
          setFollowImages(prev => ({
            ...prev,
            [cmd.imgId]: { targetObjId: cmd.targetObjId, directions: cmd.directions }
          }));
          setTimeout(advance, 0);
          break;
        case 'pauseImage':
          if (cmd.imgId) {
            const id = cmd.imgId;
            setOverlayImages(prev => {
              const img = prev[id];
              if (!img || img.pausedAt) return prev;
              return { ...prev, [id]: { ...img, pausedAt: Date.now() } };
            });
          }
          setTimeout(advance, 0);
          break;
        case 'resumeImage':
          if (cmd.imgId) {
            const id = cmd.imgId;
            setOverlayImages(prev => {
              const img = prev[id];
              if (!img || !img.pausedAt) return prev;
              const pauseDuration = Date.now() - img.pausedAt;
              return { ...prev, [id]: { ...img, pausedAt: undefined, startTime: (img.startTime || Date.now()) + pauseDuration } };
            });
          }
          setTimeout(advance, 0);
          break;
        case 'moveCamera':
          setCameraPan({ x: cmd.tx, y: cmd.ty });
          cameraPanRef.current = { x: cmd.tx, y: cmd.ty };
          setTimeout(advance, cmd.duration > 0 ? cmd.duration : 0);
          break;
        case 'moveNpc': {
          const target = !cmd.objId ? 'player' : cmd.objId;
          if (target === 'player') {
            if (cmd.tx != null) engineRef.current.player.x = cmd.tx * TILE_SIZE;
            if (cmd.ty != null) engineRef.current.player.y = cmd.ty * TILE_SIZE;
            if (cmd.dx != null) engineRef.current.player.x += cmd.dx * TILE_SIZE;
            if (cmd.dy != null) engineRef.current.player.y += cmd.dy * TILE_SIZE;
          } else {
            const obj = engineRef.current.entities?.find(o => o.def.id === target);
            if (obj) {
              if (cmd.tx != null) obj.x = cmd.tx * TILE_SIZE;
              if (cmd.ty != null) obj.y = cmd.ty * TILE_SIZE;
              if (cmd.dx != null) obj.x += cmd.dx * TILE_SIZE;
              if (cmd.dy != null) obj.y += cmd.dy * TILE_SIZE;
            }
          }
          setTimeout(advance, cmd.duration ?? 0);
          break;
        }
        case 'playEffect': {
          const effect = (gameDataRef.current.effects ?? []).find(e => e.id === cmd.effectId);
          if (effect) {
            let worldX: number, worldY: number;
            if (cmd.target === 'player') {
              worldX = engineRef.current.player.x + (gameDataRef.current.player.w ?? TILE_SIZE) / 2;
              worldY = engineRef.current.player.y + (gameDataRef.current.player.h ?? TILE_SIZE) / 2;
            } else {
              const obj = engineRef.current.entities?.find(o => o.def.id === objId);
              if (obj) {
                worldX = obj.x + TILE_SIZE / 2;
                worldY = obj.y + TILE_SIZE / 2;
              } else {
                worldX = engineRef.current.player.x + (gameDataRef.current.player.w ?? TILE_SIZE) / 2;
                worldY = engineRef.current.player.y + (gameDataRef.current.player.h ?? TILE_SIZE) / 2;
              }
            }
            spawnFieldEffect(effect, worldX, worldY);
            const durationMs = Math.round(((effect.frameCount) / (effect.fps ?? 12)) * 1000);
            setTimeout(advance, cmd.wait ? durationMs : 0);
          } else {
            setTimeout(advance, 0);
          }
          break;
        }
        case 'clearScreenEffect':
          setScreenEffect(null);
          setTimeout(advance, 0);
          break;
        case 'screenEffect':
          setScreenEffect({ effects: cmd.effects });
          setTimeout(advance, 0);
          break;
        case 'resetCamera':
          if (camOverrideRef.current) {
            const now = Date.now();
            const elapsed = now - camOverrideRef.current.startTime;
            let currentX = camOverrideRef.current.endX;
            let currentY = camOverrideRef.current.endY;
            if (elapsed < camOverrideRef.current.duration && camOverrideRef.current.duration > 0) {
              const r = elapsed / camOverrideRef.current.duration;
              currentX = camOverrideRef.current.startX + (camOverrideRef.current.endX - camOverrideRef.current.startX) * r;
              currentY = camOverrideRef.current.startY + (camOverrideRef.current.endY - camOverrideRef.current.startY) * r;
            }
            camOverrideRef.current = {
              startX: currentX, startY: currentY,
              endX: -1, endY: -1, // Use -1 as a flag to return to player
              startTime: now, duration: cmd.duration, easing: cmd.easing
            };
          }
          setTimeout(advance, cmd.duration);
          break;
        case 'moveCamera': {
          const now = Date.now();
          let startX = camXRef.current;
          let startY = camYRef.current;
          if (camOverrideRef.current) {
            const elapsed = now - camOverrideRef.current.startTime;
            if (elapsed < camOverrideRef.current.duration && camOverrideRef.current.duration > 0) {
              const r = elapsed / camOverrideRef.current.duration;
              startX = camOverrideRef.current.startX + (camOverrideRef.current.endX - camOverrideRef.current.startX) * r;
              startY = camOverrideRef.current.startY + (camOverrideRef.current.endY - camOverrideRef.current.startY) * r;
            } else {
              startX = camOverrideRef.current.endX;
              startY = camOverrideRef.current.endY;
            }
          }
          let endX = cmd.tx * TILE_SIZE;
          let endY = cmd.ty * TILE_SIZE;
          if (cmd.dx !== undefined || cmd.dy !== undefined) {
            endX = startX + (cmd.dx || 0) * TILE_SIZE;
            endY = startY + (cmd.dy || 0) * TILE_SIZE;
          }
          camOverrideRef.current = {
            startX, startY, endX, endY, startTime: now, duration: cmd.duration, easing: cmd.easing
          };
          if (cmd.blocking) {
            setTimeout(advance, cmd.duration);
          } else {
            setTimeout(advance, 0);
          }
          break;
        }
        case 'changePhase':
          // TODO: Implement phase transition if supported by engine
          setTimeout(advance, 0);
          break;
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
    setOverlayImages({});
    setFollowImages({});
    setScreenEffect(null);
    // つるつる床の強制スライド状態も編集モード移行・シーン切り替え時に必ず解除する。
    // 残ったままだと、次にプレイ再開した瞬間に本来ありえない座標へ強制移動が再開してしまう。
    iceSlideRef.current = null;
    lastIceTileRef.current = null;
    for (const e of engineRef.current.entities ?? []) { e.iceSlide = undefined; }
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
      const a = new Audio(asset.src); a.volume = applyMasterVolume(70) / 100; a.play().catch(() => { });
      previewStopRef.current = () => { a.pause(); a.currentTime = 0; };
      return;
    }
    if (asset.type === 'youtube') {
      // YouTube BGM は再生手段が bgmManager 経由の iframe 埋め込みしかないため、
      // 他タイプ同様ここで直接再生できるようにする（従来 mml/direct 以外は無反応で「試聴」が効かなかった）。
      bgmManager.play({ bgm: { type: 'youtube', src: asset.src, volume: applyMasterVolume(70) } as any, tileset: {} });
      previewStopRef.current = () => { bgmManager.stop(); };
      return;
    }
    if (asset.type !== 'mml') return;
    try {
      const { playMML } = await import('@onjmin/dtm');
      const bgm = playMML(asset.src, {
        loop: false,
        volume: applyMasterVolume(100),
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

  // ── エフェクトアニメーション（フィールド）: 再生中インスタンスの一覧 ──
  const activeFieldEffectsRef = useRef<{ key: string; effect: EffectPreset; imgUrl: string; worldX: number; worldY: number; startTime: number }[]>([]);
  /** 指定ワールド座標にエフェクトを1回再生する。画像を warm-up し、SFX があれば1回だけ再生する。 */
  const spawnFieldEffect = useCallback((effect: EffectPreset, worldX: number, worldY: number) => {
    const url = imageRefToUrl(effect.imageRef) ?? effect.imageUrl;
    if (!url) return;
    ensureImage(url);
    activeFieldEffectsRef.current.push({
      key: `${effect.id}-${Date.now()}-${Math.random()}`,
      effect, imgUrl: url, worldX, worldY, startTime: performance.now(),
    });
    if (effect.sfx) playSfx(effect.sfx);
  }, [ensureImage]);

  useEffect(() => {
    ensureImageFromRef(gameData.player.spriteRef, gameData.player.spriteUrl);
    const preloadEvents = (cmds: EventCommand[]) => {
      cmds.forEach(cmd => {
        if (cmd.type === 'showImage') {
          if (cmd.frames) {
            cmd.frames.forEach(f => {
              if (f.url) ensureImage(f.url);
            });
          }
          if (cmd.url) ensureImage(cmd.url);
        } else if (cmd.type === 'choice') {
          cmd.choices.forEach(ch => preloadEvents(ch.commands));
        } else if (cmd.type === 'changeSprite') {
          ensureImageFromRef(cmd.spriteRef, cmd.spriteUrl);
        }
      });
    };

    Object.values(gameData.tiles).forEach(t => ensureImage(t.imageUrl));
    gameData.objects.forEach(o => {
      ensureImageFromRef(o.spriteRef, o.spriteUrl);
      if (o.editorSprite) ensureImage(o.editorSprite);
      if (o.pages) o.pages.forEach(p => preloadEvents(p.commands));
    });
    ensureImageFromRef(objTemplate.spriteRef, objTemplate.spriteUrl);
    if (objTemplate.pages) objTemplate.pages.forEach(p => preloadEvents(p.commands));

    ensureImage(gameData.mapBgUrl);
    ensureImage(gameData.titleScreen?.bgUrl);
    ensureImage(gameData.ending?.bgUrl);
  }, [gameData, objTemplate, ensureImage, smcMetadata]);

  /** プリセットデータを編集ステートへ丸ごと適用する（resetGame / エンジン変更の共通処理）。 */
  const applyPresetData = useCallback((id: PresetId, data: PresetData, titleStr: string) => {
    setPresetId(id);
    setGameData(data);
    setTitle(titleStr);
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

  const resetGame = useCallback((id: PresetId) => {
    const data = clone(PRESETS[id]);
    // シーンモードなら scenes[0] の map/objects を初期表示に使う
    if (data.scenes?.length) {
      data.map = JSON.parse(JSON.stringify(data.scenes[0].map));
      data.objects = JSON.parse(JSON.stringify(data.scenes[0].objects));
    }
    applyPresetData(id, data, PRESETS[id].name);
  }, [applyPresetData]);

  /** 設定メニューの「エンジン変更」：編集中のゲームを別プリセット（別エンジン）へ切り替える。
   *  タイトル・プレイヤーの見た目・BGMを引き継いだうえで、マップは可能な範囲で変換する：
   *  - 2Dエンジン同士：タイル・3レイヤー・オブジェクト・シーンをそのまま引き継ぐ
   *  - 2D → yume25d：床/壁/ビルボードへ近似変換（convertMapToLayout25D）
   *  - yume25d → 2D：床→タイル・ビルボード→NPCへ近似変換（薄板壁は失われる） */
  const switchEngine = (id: PresetId) => {
    const prev = gameData;
    const data = clone(PRESETS[id]);
    if (data.scenes?.length) {
      data.map = JSON.parse(JSON.stringify(data.scenes[0].map));
      data.objects = JSON.parse(JSON.stringify(data.scenes[0].objects));
    }
    // ゲームの同一性に関わるタイトルと、エンジン非依存のプレイヤーの見た目・BGMは常に引き継ぐ
    data.player = { ...data.player, emoji: prev.player.emoji, color: prev.player.color, spriteRef: prev.player.spriteRef, spriteUrl: prev.player.spriteUrl, minecraftSkin: prev.player.minecraftSkin };
    if (prev.bgm) data.bgm = prev.bgm;

    const prevIs3d = prev.engine === 'yume25d', nextIs3d = data.engine === 'yume25d';
    if (!prevIs3d && !nextIs3d) {
      // 2Dエンジン同士はマップ形式が共通なので丸ごと引き継ぐ
      const keep = clone(prev);
      data.tiles = keep.tiles;
      data.map = keep.map;
      data.overlayMap = keep.overlayMap;
      data.overheadMap = keep.overheadMap;
      data.objects = keep.objects;
      data.scroll = keep.scroll;
      data.scenes = keep.scenes;
      data.player.start = { ...prev.player.start };
    } else if (!prevIs3d && nextIs3d && data.layout25d) {
      data.layout25d = convertMapToLayout25D(prev, data.layout25d);
    } else if (prevIs3d && !nextIs3d && prev.layout25d) {
      const conv = convertLayout25DToMap(prev.layout25d);
      data.tiles = conv.tiles;
      data.map = conv.map;
      data.overlayMap = conv.overlayMap;
      data.overheadMap = conv.overheadMap;
      data.objects = conv.objects;
      data.scroll = conv.scroll;
      data.scenes = undefined;
      data.player.start = conv.startPx;
    }
    applyPresetData(id, data, title);
  };

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
    gameOverActiveRef.current = false;
    roundOverRef.current = false;
    warpCooldownRef.current = null;
    setIsPlaying(false); setSelectedObjId(null);
    setShowEnding(false); setGameOverResult(null); setShowDeathScreen(false);
  }, [gameData]);

  useEffect(() => {
    if (initialManifest) {
      // 既存ゲームを読み込む
      const { presetId: preset, data } = manifestToPresetData(initialManifest);
      setPresetId(preset);
      setGameData(data);
      setTitle(data.name);
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

  const handleGameOverExit = useCallback(() => {
    if (playOnly) {
      onClose();
    } else {
      restart();
    }
  }, [playOnly, restart, onClose]);

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
    // objects/exits まで複製する（浅いコピーだと entity.def が gameData.scenes[i].objects[k] と同一参照になり、
    // プレイ中の behavior/name 書き換えが React state を直接汚染して次回プレイに持ち越ってしまうため）。
    scenesRef.current = gameData.scenes.map(s => ({
      ...s,
      objects: s.objects.map(o => ({ ...o })),
      exits: s.exits ? { ...s.exits } : s.exits,
    })) as SceneDef[];
    activeSceneIdxRef.current = 0;
    sceneTransRef.current = null;
    sceneFadeRef.current = null;
    // 全シーンを1枚のワールドマップに合成（事前ロードでシームレス遷移）
    const layout = buildWorldLayout(scenesRef.current);
    worldLayoutRef.current = layout;
    engineRef.current.map = JSON.parse(JSON.stringify(layout.map));
    engineRef.current.overlayMap = JSON.parse(JSON.stringify(layout.overlayMap));
    engineRef.current.overheadMap = JSON.parse(JSON.stringify(layout.overheadMap));
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
      a.play().then(() => { a.pause(); a.src = ''; }).catch(() => { });
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
          ? { stack: [{ script: o.spellScript, ip: 0, timesLeft: -1 as number },], frame: 0, waitLeft: 0 }
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
      if (b) progressRef.current = { hp: b.maxHp, mp: b.maxMp, maxHp: b.maxHp, maxMp: b.maxMp, atk: b.atk, def: b.def, baseAtk: b.atk, baseDef: b.def, level: 1, exp: 0, expNext: b.levelTable?.find(e => e.level === 2)?.exp ?? expToNextLevel(1, b.growthType ?? 'standard'), gold: b.gold ?? 0 };
      setEquipment({}); equipmentRef.current = {};
      setPartyEquipment({}); partyEquipmentRef.current = {};
      battleRef.current = { active: false, entity: null, enemyName: '', enemyHp: 0, enemyMaxHp: 0, enemyAtk: 0, enemyDef: 0, enemyMoves: [], exp: 0, gold: 0, isBoss: false, mercy: 0, foes: [] };
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
      setInventory({}); inventoryRef.current = {}; setInvSlots([]); invSlotsRef.current = [];
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
      }, 30_000);
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
      if (e.key === 'i' || e.key === 'I') { touchRef.current.inv = true; setTimeout(() => { touchRef.current.inv = false; }, 80); e.preventDefault(); }
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
    // 床レイヤーより上に置かれるオブジェクト層タイル（扉など）を col/row で参照する。
    const getOverlayTileAt = (col: number, row: number) => {
      if (col < 0 || col >= worldCols || row < 0 || row >= worldRows) return null;
      const overlay = engineRef.current.overlayMap ?? worldLayoutRef.current?.overlayMap ?? gameData.overlayMap;
      const id = overlay?.[row]?.[col] ?? 0;
      if (!id) return null;
      return { id, col, row, info: gameData.tiles[id] };
    };
    // セル単位の実効通行可否：オブジェクト層タイル（壁・家具・橋など）があれば、床の可否に
    // 関係なくそちらを優先する（上のレイヤーが優先）。木の上部/屋根のように意図的に通行可
    // （passable:true）で置かれているオブジェクト層タイルはそのまま通れるし、逆に床が
    // checkWalkableTile:false（通行不可）でも、上に checkWalkableTile:true のオブジェクト層
    // タイル（橋・足場等）があればそちらに従って通行可になる。オブジェクト層が無いマスは
    // 床タイルの可否をそのまま使う。
    const isCellPassable = (px: number, py: number) => {
      const overlay = getOverlayTileAt(Math.floor(px / TILE_SIZE), Math.floor(py / TILE_SIZE));
      if (overlay?.info) return overlay.info.passable;
      const floor = getTile(px, py);
      return !!floor?.info.passable;
    };
    const isAllPassable = (x: number, y: number, w: number, h: number) => {
      // 当たり判定は見た目より少し内側に絞る。プレイヤーは連続移動でタイル境界に
      // ぴったり揃わないため、余白なしだと「壁-通路-壁」の通路に対して横から
      // 進入しようとした際、当たり判定の上端/下端が隣の壁タイルへわずかに
      // はみ出して誤ってブロックされてしまう。
      const inset = Math.min(6, w / 2 - 1, h / 2 - 1);
      const ix = x + inset, iy = y + inset, iw = w - inset * 2, ih = h - inset * 2;
      const cornersOk = isCellPassable(ix, iy) && isCellPassable(ix + iw - 1, iy) &&
        isCellPassable(ix, iy + ih - 1) && isCellPassable(ix + iw - 1, iy + ih - 1);
      if (cornersOk) return true;
      // 4隅のどれかがブロックされていても、それが「壁タイルの角へ斜めにかすっただけ」
      // （T字/L字通路の内側の凹角）であれば実際には塞がっていない。辺の中点で改めて
      // 判定し、そちらが全て通行可ならブロックしない（角の誤検出による詰まりを救済）。
      const cx = ix + iw / 2, cy = iy + ih / 2;
      return isCellPassable(cx, iy) && isCellPassable(cx, iy + ih - 1) &&
        isCellPassable(ix, cy) && isCellPassable(ix + iw - 1, cy);
    };
    // 1フレーム分の移動を「軸分離＋角丸め（コーナースライド）」で解決してプレイヤー座標へ書き込む。
    // 単一方向にだけ入力しているのに壁の角へ引っかかって進めないとき、通路の開口へ向けて
    // 垂直方向へ assist px 以内で寄せ、角を回り込めるようにする。これがないと、通行可マスを
    // T字型に並べたときの「縦棒（1マス幅の通路）」へ、少しでも軸がずれていると入れなくなる。
    const resolveMoveWithCornerSlide = (
      p: { x: number; y: number },
      nx: number, ny: number, w: number, h: number, assist: number,
      input: { left: boolean; right: boolean; up: boolean; down: boolean },
      alreadyInWall: boolean,
      mobBlocks: (x: number, y: number) => boolean,
    ) => {
      const inX = input.left || input.right;
      const inY = input.up || input.down;
      const canGo = (gx: number, gy: number) =>
        gx >= 0 && gx <= worldW - w && gy >= 0 && gy <= worldH - h &&
        (alreadyInWall || isAllPassable(gx, gy, w, h)) && !mobBlocks(gx, gy);

      // 横移動
      if (nx !== p.x) {
        if (canGo(nx, p.y)) {
          p.x = nx;
        } else if (!alreadyInWall && inX && !inY) {
          // 縦に少しずらせば通れる開口を近い順に探し、見つかった側へ assist 以内で寄せる。
          for (let d = 1; d <= TILE_SIZE; d++) {
            let dir = 0;
            if (p.y + d <= worldH - h && isAllPassable(nx, p.y + d, w, h)) dir = 1;
            else if (p.y - d >= 0 && isAllPassable(nx, p.y - d, w, h)) dir = -1;
            if (dir) {
              const ay = p.y + dir * Math.min(assist, d);
              if (canGo(p.x, ay)) p.y = ay;
              break;
            }
          }
        }
      }
      // 縦移動
      if (ny !== p.y) {
        if (canGo(p.x, ny)) {
          p.y = ny;
        } else if (!alreadyInWall && inY && !inX) {
          for (let d = 1; d <= TILE_SIZE; d++) {
            let dir = 0;
            if (p.x + d <= worldW - w && isAllPassable(p.x + d, ny, w, h)) dir = 1;
            else if (p.x - d >= 0 && isAllPassable(p.x - d, ny, w, h)) dir = -1;
            if (dir) {
              const ax = p.x + dir * Math.min(assist, d);
              if (canGo(ax, p.y)) p.x = ax;
              break;
            }
          }
        }
      }
    };
    // モブ（非hazardのNPC）との衝突判定（円形）。敵(hazard)はすり抜け・接触ダメージ等の既存挙動を維持するため対象外。
    const isBlockedByMob = (x: number, y: number, w: number, h: number) => {
      const cx = x + w / 2, cy = y + h / 2;
      const playerR = Math.min(w, h) / 2 * 0.7;
      return engineRef.current.entities.some(e => {
        // 敵、ワープ、アイテム、イベントは「モブ」ではないため衝突対象から除外（踏んで/触れて発動する挙動を維持）
        if (e.def.hazard || e.def.objType === 'warp' || e.def.objType === 'item' || e.def.objType === 'event') return false;
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
            ? detectStandard(...(walk.crop ? [walk.crop[2], walk.crop[3]] as const : [img!.naturalWidth, img!.naturalHeight] as const))
            : standardById(walk.stdId);
          if (walk.stdId === 'auto' && walk.frames && walk.frames > 0) std = { ...std, frames: walk.frames };
          walkStdCache.set(resolvedUrl, std);
        }

        // 描画ソース: マット透明化済み canvas があればそれを使う（寸法は元画像から取る）。
        const srcImg: CanvasImageSource = keyedCache.current.get(resolvedUrl) ?? img!;
        const imgW = img!.naturalWidth;
        const imgH = img!.naturalHeight;
        // 下端揃え位置（下端からの距離px・既定0）と表示倍率（小数可・未指定ならセルに合わせて自動フィット）。
        const offsetY = walk.offsetY ?? 0;
        const renderScale = walk.renderScale;

        if (walk.crop && walk.stdId === 'smc') {
          // SMC専用ロジック（lib/smc-sprite.ts）: ストリップを分割。
          // 右向き素材なので、左移動時は水平反転して描く。
          const rect = smcFrameRect(walk.crop, { moving: animMoving, timeSec: performance.now() / 1000, fps: 7, frames: walk.frames });

          // 倍率指定時はそれをそのまま使い、未指定ならアスペクト比を保って縦幅をhに合わせる。
          const zoom = renderScale ?? h / rect.sh;
          const destW = rect.sw * zoom;
          const destH = rect.sh * zoom;
          const destX = x + (w - destW) / 2;
          const destY = y + (h - destH) - offsetY; // 下端揃え + オフセット

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

        if (walk.crop) {
          // 連結シートから規格（RPGEN/ツクール等）でキャラ1体分を切り出した参照。
          // crop矩形内でその規格の 方向×フレーム 格子計算を行う（stdは上のキャッシュ済みのもの）。
          const cell = animatedCellInRect(std, walk.crop, {
            dir: std.flipH ? 'd' : dir,
            moving: animMoving, timeSec: performance.now() / 1000, fps: 7,
          });
          // 倍率未指定時はセルにぴったり合わせる（従来どおり）。指定時はコマ実寸×倍率（小数可）で描く。
          const destW = renderScale ? cell.sw * renderScale : w;
          const destH = renderScale ? cell.sh * renderScale : h;
          const destX = x + (w - destW) / 2;
          const destY = y + (h - destH) - offsetY;
          const flipLeft = std.flipH && dir === 'a';
          if (flipLeft) {
            ctx.save();
            ctx.translate(destX + destW, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(srcImg, cell.sx, cell.sy, cell.sw, cell.sh, 0, destY, destW, destH);
            ctx.restore();
          } else {
            ctx.drawImage(srcImg, cell.sx, cell.sy, cell.sw, cell.sh, destX, destY, destW, destH);
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
        const srcToDraw = keyedCache.current.get(resolvedUrl!) ?? img!;
        const hashIdx = resolvedUrl!.indexOf('#');
        if (hashIdx !== -1) {
          const parts = resolvedUrl!.slice(hashIdx + 1).split(',');
          if (parts.length >= 4) {
            const sx = Number(parts[0]);
            const sy = Number(parts[1]);
            const sw = Number(parts[2]);
            const sh = Number(parts[3]);
            ctx.drawImage(srcToDraw, sx, sy, sw, sh, x, y, w, h);
            return;
          }
        }
        ctx.drawImage(srcToDraw, x, y, w, h);
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
          setTimeout(() => { gameOverActiveRef.current = true; setGameOverResult({ score: scoreRef.current, marioDeathAnim: true }); }, 1200);
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

      shakeRef.current = 18; showGameMsg(msg, 'timed', () => { gameOverActiveRef.current = true; setGameOverResult({ score: scoreRef.current }); });
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
      if (encounterAlertRef.current?.phase === 'alert' && performance.now() - encounterAlertRef.current.startTime >= ENCOUNTER_ALERT_MS) {
        // 「！」演出終了 → 現在のBGMを止め、バトル開始SEを鳴らしてハート明滅演出へ
        // （デルタルーンはそもそも 'alert' フェーズを使わないため、ここは undertale/undertale 系のみ通る）
        const alert = encounterAlertRef.current;
        alert.phase = 'flash';
        alert.startTime = performance.now();
        switchBgm(undefined);
        playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).battleStart);
      } else if (encounterAlertRef.current?.phase === 'flash' && performance.now() - encounterAlertRef.current.startTime >= ENCOUNTER_FLASH_MS) {
        const { fire } = encounterAlertRef.current;
        encounterAlertRef.current = null;
        fire();
      }

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
      const frozen = isPlaying && (roundOverRef.current || isPlayerDeadRef.current || !!sceneFadeRef.current || !!sceneTransRef.current || marioTransformingRef.current > 0 || !!marioPipeRef.current || !!marioGoalRef.current || bagOpenRef.current || invOpenRef.current || !!gameMsgRef.current || !!activeDialogueRef.current || !!eventChoiceRef.current || !!shopModalRef.current || !!encounterAlertRef.current);

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

          // ── つるつる床（システムタイル）：スライド中は入力を無視し、目標Xへ強制移動する（左右のみ対応） ──
          if (iceSlideRef.current) {
            const slide = iceSlideRef.current;
            const dxa = slide.targetX - p.x;
            p.vx = Math.sign(dxa) * Math.min(Math.abs(dxa), 4);
          }

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
          const iceSpd = gameData.iceSlideSpeed ?? DEFAULT_ICE_SLIDE_SPEED;
          const zAlreadyOverlapping0 = isBlockedByMob(p.x, p.y, pData.w, pData.h);
          const zCanStandAt = (x: number, y: number) => {
            return isAllPassable(x, y, pData.w, pData.h) && x >= 0 && x <= worldW - pData.w && y >= 0 && y <= worldH - pData.h &&
              (zAlreadyOverlapping0 || !isBlockedByMob(x, y, pData.w, pData.h));
          };
          // ── つるつる床：強制スライド中は入力を無視し、目標タイルへ直進する ──
          const zStandingTile = getTile(p.x + pData.w / 2, p.y + pData.h / 2);
          const zStandingSpecial = zStandingTile?.info?.special;
          const zOnIceTile = !!(zStandingSpecial && ICE_DIRS[zStandingSpecial]);
          if (iceSlideRef.current) {
            const slide = iceSlideRef.current;
            const dxz = slide.targetX - p.x, dyz = slide.targetY - p.y;
            const distz = Math.hypot(dxz, dyz);
            if (distz <= iceSpd || distz === 0) { p.x = slide.targetX; p.y = slide.targetY; }
            else { p.x += (dxz / distz) * iceSpd; p.y += (dyz / distz) * iceSpd; }
            if (p.x === slide.targetX && p.y === slide.targetY) {
              iceSlideRef.current = null;
              const landed = getTile(p.x, p.y);
              const nextDir = landed?.info?.special ? ICE_DIRS[landed.info.special] : undefined;
              if (nextDir) {
                const tx = p.x + nextDir[0] * TILE_SIZE, ty = p.y + nextDir[1] * TILE_SIZE;
                if (zCanStandAt(tx, ty)) iceSlideRef.current = { targetX: tx, targetY: ty };
              }
            }
          } else if (zOnIceTile) {
            // つるつる床の上に立っている間は、スライドが（モブ等で）一時的に塞がれていても
            // 自由入力を受け付けない。塞がりが解消され次第、毎フレーム再スライドを試みる。
            const [dxz, dyz] = ICE_DIRS[zStandingSpecial!];
            const tx = zStandingTile!.rect.x + dxz * TILE_SIZE, ty = zStandingTile!.rect.y + dyz * TILE_SIZE;
            if (zCanStandAt(tx, ty)) iceSlideRef.current = { targetX: tx, targetY: ty };
          } else {
            let nx = p.x, ny = p.y;
            if (isLeft) nx -= moveSpd; if (isRight) nx += moveSpd;
            if (isUp) ny -= moveSpd; if (isDown) ny += moveSpd;
            // 既にモブと重なっている場合はブロック判定を無視し、動けなくなる（すり抜けられない）事態を防ぐ
            const alreadyOverlapping = isBlockedByMob(p.x, p.y, pData.w, pData.h);
            // 既に壁に埋まっている場合も同様にブロック判定を無視し、通行可能な方向へ動けるようにする
            const alreadyInWall = !isAllPassable(p.x, p.y, pData.w, pData.h);
            resolveMoveWithCornerSlide(
              p, nx, ny, pData.w, pData.h, Math.max(3, moveSpd),
              { left: isLeft, right: isRight, up: isUp, down: isDown },
              alreadyInWall,
              (gx, gy) => !alreadyOverlapping && isBlockedByMob(gx, gy, pData.w, pData.h),
            );
          }
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
              onjBombsRef.current.push({ x: fb.tx, y: fb.ty, fuse: fb.fuse, maxFuse: fb.fuse, r: fb.r, dmg: fb.dmg, head: fb.head, thrown: !fb.owner, srcUrl: fb.srcUrl, owner: fb.owner });
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
            // 🧱 地形破壊：プレイヤーが投げたボム（🎯/💀）のみ、爆風範囲内の通行不可タイルを破壊する。
            // special 付きタイル（移動ポイント 'warp' 等の機能タイル）は破壊しない——移動ポイントを
            // 壊すとプレイヤーが脱出不能になって詰むため。ワープオブジェクト（objType==='warp'）は
            // 下の敵ダメージループで既に除外済み。eng.map / eng.overlayMap はプレイ開始時の
            // ディープコピーなので、書き換えてもエディタ側データには影響しない。
            if (bm.thrown && !bm.owner) {
              const cMin = Math.max(0, Math.floor((bm.x - bm.r) / TILE_SIZE));
              const cMax = Math.min(worldCols - 1, Math.floor((bm.x + bm.r) / TILE_SIZE));
              const rMin = Math.max(0, Math.floor((bm.y - bm.r) / TILE_SIZE));
              const rMax = Math.min(worldRows - 1, Math.floor((bm.y + bm.r) / TILE_SIZE));
              // 置き換え先の床：爆心周辺で最も多い「通行可・特殊効果なし」の床タイル（見た目を周囲に馴染ませる）
              const fillCounts = new Map<number, number>();
              for (let rr = rMin; rr <= rMax; rr++) for (let cc = cMin; cc <= cMax; cc++) {
                const id = eng.map[rr]?.[cc] ?? 0;
                const inf = gameData.tiles[id];
                if (inf?.passable && !inf.special) fillCounts.set(id, (fillCounts.get(id) ?? 0) + 1);
              }
              let fillId = -1, fillN = 0;
              fillCounts.forEach((n, id) => { if (n > fillN) { fillN = n; fillId = id; } });
              if (fillId < 0) {
                const k = Object.keys(gameData.tiles).find(key => { const ti = gameData.tiles[Number(key)]; return ti?.passable && !ti.special; });
                if (k !== undefined) fillId = Number(k);
              }
              for (let rr = rMin; rr <= rMax; rr++) for (let cc = cMin; cc <= cMax; cc++) {
                const tcx = cc * TILE_SIZE + TILE_SIZE / 2, tcy = rr * TILE_SIZE + TILE_SIZE / 2;
                if (Math.hypot(tcx - bm.x, tcy - bm.y) > bm.r) continue;
                // オブジェクト層（重ね置きの壁・木など）：通行不可なら取り除いて下の床を見せる
                const ovRow = eng.overlayMap?.[rr];
                if (ovRow?.[cc]) {
                  const oi = gameData.tiles[ovRow[cc]];
                  if (oi && !oi.passable && !oi.special) ovRow[cc] = 0;
                }
                // 床レイヤー：通行不可タイルを周囲に馴染む通行可タイルへ置き換える
                const fi = gameData.tiles[eng.map[rr]?.[cc] ?? 0];
                if (fillId >= 0 && fi && !fi.passable && !fi.special) eng.map[rr][cc] = fillId;
              }
            }
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
          const iceSpd = gameData.iceSlideSpeed ?? DEFAULT_ICE_SLIDE_SPEED;
          const prevPx = p.x, prevPy = p.y;
          const mobBlockActive = gameData.engine === 'rpg';
          const canStandAt = (x: number, y: number) => {
            return isAllPassable(x, y, pData.w, pData.h) && x >= 0 && x <= worldW - pData.w && y >= 0 && y <= worldH - pData.h &&
              (!mobBlockActive || isBlockedByMob(p.x, p.y, pData.w, pData.h) || !isBlockedByMob(x, y, pData.w, pData.h));
          };
          // ── つるつる床：強制スライド中は入力を無視し、目標タイルへ直進する ──
          const standingTile = gameData.engine === 'rpg' ? getTile(p.x + pData.w / 2, p.y + pData.h / 2) : undefined;
          const standingSpecial = standingTile?.info?.special;
          const onIceTile = !!(standingSpecial && ICE_DIRS[standingSpecial]);
          if (gameData.engine === 'rpg' && iceSlideRef.current) {
            const slide = iceSlideRef.current;
            const dx = slide.targetX - p.x, dy = slide.targetY - p.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= iceSpd || dist === 0) { p.x = slide.targetX; p.y = slide.targetY; }
            else { p.x += (dx / dist) * iceSpd; p.y += (dy / dist) * iceSpd; }
            if (p.x === slide.targetX && p.y === slide.targetY) {
              iceSlideRef.current = null;
              const landed = getTile(p.x, p.y);
              const nextDir = landed?.info?.special ? ICE_DIRS[landed.info.special] : undefined;
              if (nextDir) {
                const tx = p.x + nextDir[0] * TILE_SIZE, ty = p.y + nextDir[1] * TILE_SIZE;
                if (canStandAt(tx, ty)) iceSlideRef.current = { targetX: tx, targetY: ty };
              }
            }
          } else if (gameData.engine === 'rpg' && onIceTile) {
            // つるつる床の上に立っている間は、スライドが（モブ等で）一時的に塞がれていても
            // 自由入力を受け付けない。塞がりが解消され次第、毎フレーム再スライドを試みる。
            // これをしないと閉ループ上でも一時的に操作権が戻り、抜け出せてしまう（要修正のバグだった）。
            const [dx, dy] = ICE_DIRS[standingSpecial!];
            const tx = standingTile!.rect.x + dx * TILE_SIZE, ty = standingTile!.rect.y + dy * TILE_SIZE;
            if (canStandAt(tx, ty)) iceSlideRef.current = { targetX: tx, targetY: ty };
          } else {
            let nx = p.x, ny = p.y;
            if (isLeft) nx -= moveSpd; if (isRight) nx += moveSpd;
            if (isUp) ny -= moveSpd; if (isDown) ny += moveSpd;
            // 入力方向を記録（移動不可でも向きを更新するために使用）
            {
              const dx = nx - p.x, dy = ny - p.y;
              playerInputDirRef.current = (dx !== 0 || dy !== 0) ? (dirFromDelta(dx, dy) ?? null) : null;
            }
            // 既にモブと重なっている場合はブロック判定を無視し、動けなくなる（すり抜けられない）事態を防ぐ
            const alreadyOverlapping = mobBlockActive && isBlockedByMob(p.x, p.y, pData.w, pData.h);
            // 既に壁に埋まっている場合も同様にブロック判定を無視し、通行可能な方向へ動けるようにする
            const alreadyInWall = !isAllPassable(p.x, p.y, pData.w, pData.h);
            const preX = p.x, preY = p.y;
            resolveMoveWithCornerSlide(
              p, nx, ny, pData.w, pData.h, Math.max(3, moveSpd),
              { left: isLeft, right: isRight, up: isUp, down: isDown },
              alreadyInWall,
              (gx, gy) => mobBlockActive && !alreadyOverlapping && isBlockedByMob(gx, gy, pData.w, pData.h),
            );
            // 入力があったが、意図した軸方向へ移動できなかった場合（壁/NPCにブロックされた）→ walkInst の向きだけ更新する。
            // コーナースライドで垂直方向に動いた場合も「正面方向はブロックされた」ので向きを更新する。
            const blockedInInputDir = playerInputDirRef.current && (
              ((isLeft || isRight) && p.x === preX) ||
              ((isUp || isDown) && p.y === preY)
            );
            if (blockedInInputDir) {
              // walkInst の事前更新と合わせて、overrideDir 用の ref にも記録する
              playerBlockedDirRef.current = playerInputDirRef.current;
              walkInst.set('player', { px: p.x, py: p.y, dir: playerInputDirRef.current! });
            } else if (p.x !== preX || p.y !== preY) {
              // 実際に移動できた場合はブロック向きをクリアする（通常の向き更新に戻す）
              playerBlockedDirRef.current = null;
            }
          }
          // ── ランダムエンカウント（rpg・シーンに randomEncounters があるとき）──
          // 歩いた距離をゲージに貯め、しきい値（encounterRate 歩 ±40%）を超えたら抽選開始。
          if (isPlaying && gameData.engine === 'rpg' && gameData.battle && !dead &&
            !eventRunningRef.current && !sceneFadeRef.current && invulnRef.current <= 0 && !debugInvincibleRef.current) {
            const scene = scenesRef.current[activeSceneIdxRef.current];
            const groups = scene?.encounterGroups?.filter(g => g.enemies.length);
            const table = scene?.randomEncounters;
            const hasEncounters = (groups?.length ?? 0) > 0 || (table?.length ?? 0) > 0;
            if (hasEncounters) {
              const moved = Math.abs(p.x - prevPx) + Math.abs(p.y - prevPy);
              if (moved > 0) {
                if (encounterNextRef.current <= 0) {
                  const rate = scene!.encounterRate ?? 16;
                  encounterNextRef.current = rate * TILE_SIZE * (0.6 + Math.random() * 0.8);
                }
                encounterGaugeRef.current += moved;
                if (encounterGaugeRef.current >= encounterNextRef.current) {
                  encounterGaugeRef.current = 0; encounterNextRef.current = 0;
                  const enemy = pickRandomEncounter(groups, table);
                  if (enemy) {
                    triggerEncounter(() => beginBattle({ ...enemy, entity: null }));
                    dead = true;
                  }
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
              setSpellCutin({
                key: k, mode: 'player',
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
            const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
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
      if (isPlaying && !roundOverRef.current && !battleRef.current.active && !encounterAlertRef.current) {
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
              } else if (d.behavior === 'randomDash') {
                // ランダムダッシュ：短い駆け足（30F）と立ち止まり（60F）を繰り返す
                if (e.timer % 90 === 0) e.vx = (Math.random() < 0.5 ? -1 : 1) * sp * 2.5;
                else if (e.timer % 90 === 30) e.vx = 0;
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
          } else if (e.iceSlide) {
            // つるつる床：強制スライド中は behavior による移動を無視し、目標タイルへ直進する（プレイヤーと同様）。
            const slide = e.iceSlide;
            const slideSpd = gameData.iceSlideSpeed ?? DEFAULT_ICE_SLIDE_SPEED;
            const dx = slide.targetX - e.x, dy = slide.targetY - e.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= slideSpd || dist === 0) { e.x = slide.targetX; e.y = slide.targetY; }
            else { e.x += (dx / dist) * slideSpd; e.y += (dy / dist) * slideSpd; }
            if (e.x === slide.targetX && e.y === slide.targetY) {
              e.iceSlide = undefined;
              const landed = getTile(e.x, e.y);
              const nextDir = landed?.info?.special ? ICE_DIRS[landed.info.special] : undefined;
              if (nextDir) {
                const tx = e.x + nextDir[0] * TILE_SIZE, ty = e.y + nextDir[1] * TILE_SIZE;
                const ta = getTile(tx, ty), tb = getTile(tx + TILE_SIZE - 1, ty + TILE_SIZE - 1);
                if (ta?.info.passable && tb?.info.passable && tx >= 0 && tx <= worldW - TILE_SIZE && ty >= 0 && ty <= worldH - TILE_SIZE) {
                  e.iceSlide = { targetX: tx, targetY: ty };
                }
              }
            }
          } else {
            const eStandingTile = getTile(e.x + TILE_SIZE / 2, e.y + TILE_SIZE / 2);
            const eStandingSpecial = eStandingTile?.info?.special;
            if (eStandingSpecial && ICE_DIRS[eStandingSpecial]) {
              // つるつる床に乗った瞬間：behavior による移動を無視し、強制スライドを開始する。
              // 塞がっていて開始できない場合も自由に振る舞わせず、次フレーム以降に再試行させる。
              const [idx, idy] = ICE_DIRS[eStandingSpecial];
              const tx = eStandingTile!.rect.x + idx * TILE_SIZE, ty = eStandingTile!.rect.y + idy * TILE_SIZE;
              const ta = getTile(tx, ty), tb = getTile(tx + TILE_SIZE - 1, ty + TILE_SIZE - 1);
              if (ta?.info.passable && tb?.info.passable && tx >= 0 && tx <= worldW - TILE_SIZE && ty >= 0 && ty <= worldH - TILE_SIZE) {
                e.iceSlide = { targetX: tx, targetY: ty };
              }
            } else if (d.behavior === 'random') {
              if (e.timer % 40 === 0) { e.vx = (Math.random() * 2 - 1) * sp; e.vy = (Math.random() * 2 - 1) * sp; }
              e.x += e.vx; e.y += e.vy;
            } else if (d.behavior === 'randomDash') {
              // ランダムダッシュ：短い駆け足（30F）と立ち止まり（60F）を繰り返す
              if (e.timer % 90 === 0) {
                const th = Math.random() * Math.PI * 2;
                e.vx = Math.cos(th) * sp * 2.5; e.vy = Math.sin(th) * sp * 2.5;
              } else if (e.timer % 90 === 30) { e.vx = 0; e.vy = 0; }
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
                  setSpellCutin({
                    key: k, mode: 'boss',
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
                      particlesRef.current.push({
                        x: p.x + pData.w / 2, y: p.y + pData.h / 2,
                        vx: Math.cos(angle) * speed * (Math.random() < 0.5 ? 1 : -1), vy: -Math.sin(angle) * speed - 1.0,
                        life: 300, maxLife: 300, size: 6, color: '#ffd700', type: 'coin', bounceCount: 0
                      });
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
                      particlesRef.current.push({
                        x: p.x + pData.w / 2, y: p.y + pData.h / 2,
                        vx: Math.cos(angle) * speed * (Math.random() < 0.5 ? 1 : -1), vy: -Math.sin(angle) * speed - 1.0,
                        life: 300, maxLife: 300, size: 6, color: '#ffd700', type: 'coin', bounceCount: 0
                      });
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
                        particlesRef.current.push({
                          x: p.x + pData.w / 2, y: p.y + pData.h / 2,
                          vx: Math.cos(angle) * speed * (Math.random() < 0.5 ? 1 : -1), vy: -Math.sin(angle) * speed - 1.0,
                          life: 300, maxLife: 300, size: 6, color: '#ffd700', type: 'coin', bounceCount: 0
                        });
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
                if (gameData.engine === 'rpg' && gameData.battle) { if (invulnRef.current <= 0) { triggerEncounter(() => startBattle(e)); dead = true; } break; }
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
              npcTalkRef.current = { entity: e, text, startTime: performance.now(), wrapped, lastShown: 0 };
            }
            else if (d.message && !e.talked) {
              e.talked = true;
              const text = d.message;
              ctx.font = `bold 11px ${getPixelFontFamily()}`;
              const wrapped = wrapWithKinsoku(ctx, text, Math.min(PLAY_W - 16, 220));
              npcTalkRef.current = { entity: e, text, startTime: performance.now(), wrapped, lastShown: 0 };
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
                if (!debugInvincibleRef.current && invulnRef.current <= 0) { beginBattle({ name: boss.name, emoji: boss.emoji, hp: boss.hp, atk: boss.atk, def: boss.def, exp: boss.exp, gold: boss.gold, moves: boss.moves, miniScript: boss.miniScript, undertaleMode: boss.undertaleMode, dialogue: boss.dialogue, battleSprite: boss.battleSprite, entity: null, isBoss: true, outroDialogue: gameData.battle?.outroDialogue }); dead = true; }
              } else if (symbolBossLeft) {
                if (!bossWarnRef.current) { bossWarnRef.current = true; showGameMsg('まだ強敵がいる！倒してから来るのだ！', 'instant', () => { }); }
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
                showGameMsg('チェックポイント！', 'timed', () => { });
              }
            }
            // ── システムタイル：つるつる床（action系の到達判定・連結。rpg/onjRezeは移動処理側で自己完結） ──
            else if (gameData.engine === 'action' && iceSlideRef.current && Math.abs(p.x - iceSlideRef.current.targetX) < 1) {
              p.x = iceSlideRef.current.targetX; p.vx = 0;
              iceSlideRef.current = null;
              const landedSpecial = getTile(p.x, p.y)?.info?.special;
              if (landedSpecial === 'ice-left' || landedSpecial === 'ice-right') {
                const [ndx] = ICE_DIRS[landedSpecial];
                const ntx = p.x + ndx * TILE_SIZE;
                const nta = getTile(ntx, p.y), ntb = getTile(ntx + pData.w - 1, p.y + pData.h - 1);
                if (nta?.info.passable && ntb?.info.passable && ntx >= 0 && ntx <= worldW - pData.w) {
                  iceSlideRef.current = { targetX: ntx, targetY: p.y };
                }
              }
            }
            // ── システムタイル：シーン切替床 ──
            else if (center?.info?.special === 'warp' && center.info.warpSceneId) {
              if (scenesRef.current.length > 0 && !sceneFadeRef.current && !sceneTransRef.current && !eventRunningRef.current && !warpCooldownRef.current) {
                const tgtScene = scenesRef.current.find(s => s.id === center!.info!.warpSceneId);
                if (tgtScene) {
                  playSfx({ ref: `direct:${SYS_TILE_WARP_SFX}`, src: SYS_TILE_WARP_SFX, type: 'direct' });
                  const ex = (center.info.warpEntryCol ?? 1) * TILE_SIZE;
                  const ey = (center.info.warpEntryRow ?? 1) * TILE_SIZE;
                  sceneFadeRef.current = { phase: 'out', frame: 0, totalFrames: 16, nextSceneId: center.info.warpSceneId, entryX: ex, entryY: ey };
                  resetSceneState();
                }
              }
            }
            // ── システムタイル：どく沼/ダメージ床 ──
            else if (center?.info?.special === 'damage') {
              if (!debugInvincibleRef.current && invulnRef.current <= 0) {
                playSfx({ ref: `direct:${SYS_TILE_DAMAGE_SFX}`, src: SYS_TILE_DAMAGE_SFX, type: 'direct' });
                invulnRef.current = 45;
                const dmg = center.info.damageAmount ?? 3;
                hitShake();
                if (gameData.battle) {
                  progressRef.current.hp -= dmg; forceHud(n => n + 1);
                  if (progressRef.current.hp <= 0) { lose('どくにたおれた…'); dead = true; }
                } else {
                  onjRezeHpRef.current.hp -= dmg; forceHud(n => n + 1);
                  if (onjRezeHpRef.current.hp <= 0) { lose('やられた…'); dead = true; }
                }
              }
            }
            // ── システムタイル：つるつる床（スライド開始） ──
            // action（マリオ系）は重力に沿った物理移動のため、左右方向のみ強制スライドに対応する（上下は無効）。
            // rpg/onjReze は元々グリッド上の自由8方向移動なので4方向すべてに対応する。
            else if (center?.info?.special && ICE_DIRS[center.info.special] &&
              (gameData.engine === 'rpg' || gameData.engine === 'onjReze' ||
                (gameData.engine === 'action' && center.info.special !== 'ice-up' && center.info.special !== 'ice-down')) &&
              !iceSlideRef.current) {
              const tileKey = `${center.rect.x},${center.rect.y}`;
              if (lastIceTileRef.current !== tileKey) {
                lastIceTileRef.current = tileKey;
                const [dx, dy] = ICE_DIRS[center.info.special];
                const tx = center.rect.x + dx * TILE_SIZE, ty = center.rect.y + dy * TILE_SIZE;
                const ta = getTile(tx, ty), tb = getTile(tx + pData.w - 1, ty + pData.h - 1);
                if (ta?.info.passable && tb?.info.passable && tx >= 0 && tx <= worldW - pData.w && ty >= 0 && ty <= worldH - pData.h) {
                  if (gameData.engine === 'rpg' || gameData.engine === 'onjReze') { p.x = center.rect.x; p.y = center.rect.y; }
                  else { p.x = center.rect.x; }
                  iceSlideRef.current = { targetX: tx, targetY: (gameData.engine === 'rpg' || gameData.engine === 'onjReze') ? ty : p.y };
                }
              }
            }
            else {
              bossWarnRef.current = false;
              if (!(center?.info?.special && ICE_DIRS[center.info.special])) lastIceTileRef.current = null;
            }
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
        const pCol = Math.floor(pcx / TILE_SIZE), pRow = Math.floor(pcy / TILE_SIZE);
        const ADJ_DIRS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        const specialAt = (col: number, row: number) => getOverlayTileAt(col, row)?.info ?? getTile(col * TILE_SIZE, row * TILE_SIZE)?.info;

        // ── システムタイル：扉（examineで開いて通れるようにする。オブジェクト層に配置） ──
        const doorNeighbor = ADJ_DIRS.map(([dx, dy]) => getOverlayTileAt(pCol + dx, pRow + dy)).find(t => t?.info?.special === 'door');
        if (doorNeighbor) {
          playSfx({ ref: `direct:${SYS_TILE_DOOR_SFX}`, src: SYS_TILE_DOOR_SFX, type: 'direct' });
          const overlay = engineRef.current.overlayMap ?? worldLayoutRef.current?.overlayMap ?? gameData.overlayMap;
          if (overlay?.[doorNeighbor.row]) overlay[doorNeighbor.row][doorNeighbor.col] = 0;
        }

        // ── テーブル越しに向かい側のNPCへ話しかける（examineボタンでテーブル1マス先の相手と対話） ──
        const acrossTable = ADJ_DIRS.map(([dx, dy]) => {
          if (specialAt(pCol + dx, pRow + dy)?.special !== 'table') return undefined;
          const acrossCol = pCol + dx * 2, acrossRow = pRow + dy * 2;
          return (isPlaying ? eng.entities : gameData.objects).find(o => {
            const oc = isPlaying ? Math.floor((o as Entity).x / TILE_SIZE) : (o as ObjectDef).col;
            const or_ = isPlaying ? Math.floor((o as Entity).y / TILE_SIZE) : (o as ObjectDef).row;
            return oc === acrossCol && or_ === acrossRow;
          });
        }).find(Boolean);

        const target = acrossTable ?? (isPlaying ? eng.entities : gameData.objects).find(o => {
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
              showGameMsg(def.message, 'instant', () => { });
            }
          }
        }
      }
      prevActionRef.current = isAction;

      // ── I key / inv button: toggle inventory ──
      const isInv = touchRef.current.inv;
      if (isInv && !prevInvRef.current && isPlaying && !frozen && !activeDialogueRef.current && !eventRunningRef.current && !gameMsgRef.current && !shopModalRef.current) {
        if (invMenuRef.current || invDetailRef.current) { setInvMenu(null); invMenuRef.current = null; setInvDetail(null); invDetailRef.current = null; }
        else if (invSlotsRef.current.length === 0) { showGameMsg('なにも もっていない。', 'instant', () => { }); }
        else if (battleRef.current.active) {
          // 戦闘中は戦闘用アイテムメニューを開く
          const bs = gameDataRef.current.battle?.style ?? 'classic';
          if (isDodgeBattleStyle(bs)) { setUndertaleMenu('item'); }
          else if (isPartyBattleStyle(bs)) { if (ptRef.current.phase === 'select') ptPatch({ menu: 'item', pending: null }); }
          else { setBattleItemsOpen(true); }
        }
        else {
          const opening = !invOpenRef.current;
          setInvOpen(p => !p);
          if (opening) { setInvCursor(0); invCursorRef.current = 0; }
        }
      }
      prevInvRef.current = isInv;

      // ── 十字キーでメニューを操作（持ち物一覧・アイテムメニュー・アンダーテール戦闘コマンド） ──
      const menuUpEdge = isUp && !prevMenuUpRef.current;
      const menuDownEdge = isDown && !prevMenuDownRef.current;
      const menuLeftEdge = isLeft && !prevMenuLeftRef.current;
      const menuRightEdge = isRight && !prevMenuRightRef.current;
      prevMenuUpRef.current = isUp; prevMenuDownRef.current = isDown; prevMenuLeftRef.current = isLeft; prevMenuRightRef.current = isRight;
      // デルタルーン戦闘コマンド用の押しっぱなしリピート（tlDR InputRepeat 準拠：30fps基準の
      // predelay 10f・delay 2f を 60fps 換算で 20f/4f。押した瞬間＋一定時間後から連続入力扱い）
      const hold = menuHoldRef.current;
      hold.up = isUp ? hold.up + 1 : 0;
      hold.down = isDown ? hold.down + 1 : 0;
      hold.left = isLeft ? hold.left + 1 : 0;
      hold.right = isRight ? hold.right + 1 : 0;
      const menuRepeat = (n: number) => n === 1 || (n > 20 && (n - 20) % 4 === 0);

      if (isPlaying && invOpenRef.current && !invMenuRef.current && !invDetailRef.current && !battleRef.current.active) {
        // フィールドの持ち物一覧（2列グリッド）
        const n = invSlotsRef.current.length;
        if (n > 0 && (menuUpEdge || menuDownEdge || menuLeftEdge || menuRightEdge)) {
          let c = invCursorRef.current;
          if (menuLeftEdge) c -= 1;
          if (menuRightEdge) c += 1;
          if (menuUpEdge) c -= 2;
          if (menuDownEdge) c += 2;
          c = ((c % n) + n) % n;
          if (c !== invCursorRef.current && isUndertalePreset) playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuSwitch);
          invCursorRef.current = c; setInvCursor(c);
        }
      } else if (isPlaying && invMenuRef.current) {
        // アイテムアクションメニュー（つかう/せつめい/すてる/もどる：縦一列）
        const itemId = invSlotsRef.current[invMenuRef.current.slotIdx];
        const it = (gameDataRef.current.items ?? []).find(x => x.id === itemId);
        const usable = !!(it?.healHp || it?.healMp || it?.damage || it?.targetType);
        const discardable = it?.discardable !== false;
        const count = (usable ? 1 : 0) + 1 /* せつめい */ + (discardable ? 1 : 0) + 1 /* もどる */;
        if (count > 0 && (menuUpEdge || menuDownEdge)) {
          let c = invMenuCursorRef.current;
          if (menuUpEdge) c -= 1;
          if (menuDownEdge) c += 1;
          c = ((c % count) + count) % count;
          if (c !== invMenuCursorRef.current && isUndertalePreset) playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuSwitch);
          invMenuCursorRef.current = c; setInvMenuCursor(c);
        }
      } else if (isPlaying && battleRef.current.active && isPartyBattleStyle(gameDataRef.current.battle?.style) && ptRef.current.phase === 'select') {
        // パーティ制戦闘（ff/mother3/milky）：上下でカーソル移動、ぼうぎょ等がある行は
        // 2列表示ではなく縦一列なので上下のみで巡回する。
        // milky の技めくり画面（← →）だけは左右キーでも同じくカーソルを動かせるようにする。
        const isMilkySkill = gameDataRef.current.battle?.style === 'milky' && ptRef.current.menu === 'skill';
        const n = ptMenuActions().length;
        if (n > 0 && (menuUpEdge || menuDownEdge || (isMilkySkill && (menuLeftEdge || menuRightEdge)))) {
          let c = ptRef.current.menuCursor;
          if (menuUpEdge || (isMilkySkill && menuLeftEdge)) c -= 1;
          if (menuDownEdge || (isMilkySkill && menuRightEdge)) c += 1;
          c = ((c % n) + n) % n;
          if (c !== ptRef.current.menuCursor) playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuSwitch);
          ptPatch({ menuCursor: c });
        }
      } else if (isPlaying && battleRef.current.active && isDodgeBattleStyle(gameDataRef.current.battle?.style) && undertalePhaseRef.current === 'menu') {
        const isDt = gameDataRef.current.battle?.style === 'deltarune';
        // デルタルーンは原作同様、押しっぱなしでカーソルが高速移動する（アンダーテールはエッジのみ）
        const upMove = isDt ? menuRepeat(hold.up) : menuUpEdge;
        const downMove = isDt ? menuRepeat(hold.down) : menuDownEdge;
        const leftMove = isDt ? menuRepeat(hold.left) : menuLeftEdge;
        const rightMove = isDt ? menuRepeat(hold.right) : menuRightEdge;
        if (undertaleMenuRef.current === 'root') {
          if (leftMove || rightMove) {
            const rootCount = isDt ? 5 : 4; // デルタルーンは FIGHT/ACT/ITEM/MERCY/DEFEND の5つ
            let c = undertaleRootCursorRef.current;
            if (leftMove) c -= 1;
            if (rightMove) c += 1;
            c = ((c % rootCount) + rootCount) % rootCount;
            if (c !== undertaleRootCursorRef.current) playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuSwitch);
            undertaleRootCursorRef.current = c; setUndertaleRootCursor(c);
          }
        } else if (undertaleMenuRef.current === 'target') {
          // ターゲット選択：生きている敵の間だけをカーソルが巡回する
          const alive = aliveFoeIdxs();
          if (alive.length > 0 && (upMove || downMove || leftMove || rightMove)) {
            let n = Math.max(0, alive.indexOf(undertaleTargetCursorRef.current));
            if (upMove || leftMove) n -= 1;
            if (downMove || rightMove) n += 1;
            n = ((n % alive.length) + alive.length) % alive.length;
            const idx = alive[n];
            if (idx !== undertaleTargetCursorRef.current) playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuSwitch);
            undertaleTargetCursorRef.current = idx; setUndertaleTargetCursor(idx);
          }
        } else {
          // ACT / ITEM / MERCY サブメニュー。デルタルーンの2番目のコマンドはメンバーで中身が変わる：
          // 呪文持ち（スージー/ラルセイ）＝「まほう」で自分の呪文のみ、呪文なし（クリス）＝「こうどう」でACT技のみ
          const bd2 = gameDataRef.current.battle;
          const rawSpells2 = isDt ? (dtParty()[dtTurnIdxRef.current] ? (bd2?.party?.[dtTurnIdxRef.current]?.spells ?? []) : []) : [];
          const curSpells = availableSpells(rawSpells2, dtTurnIdxRef.current, progressRef.current.level);
          const curMoveCount = isDt && rawSpells2.length ? 0 : availableMoves(bd2?.moves ?? [], progressRef.current.level).length;
          let count = 1; let cols = 1;
          if (undertaleMenuRef.current === 'act') { count = curMoveCount + curSpells.length + 1; cols = 2; }
          else if (undertaleMenuRef.current === 'item') { count = usableItems().length + 1; cols = 2; }
          else if (undertaleMenuRef.current === 'mercy') { count = 3; cols = 1; }
          if (count > 0 && (upMove || downMove || leftMove || rightMove)) {
            let c = undertaleSubCursorRef.current;
            if (cols === 2) {
              if (leftMove) c -= 1;
              if (rightMove) c += 1;
              if (upMove) c -= 2;
              if (downMove) c += 2;
            } else {
              if (upMove) c -= 1;
              if (downMove) c += 1;
            }
            c = ((c % count) + count) % count;
            if (c !== undertaleSubCursorRef.current) playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuSwitch);
            undertaleSubCursorRef.current = c; setUndertaleSubCursor(c);
          }
        }
      } else if (isPlaying && eventChoiceRef.current) {
        // イベント選択肢（縦一列）
        const n = eventChoiceRef.current.choices.length;
        if (n > 0 && (menuUpEdge || menuDownEdge)) {
          let c = eventChoiceCursorRef.current;
          if (menuUpEdge) c -= 1;
          if (menuDownEdge) c += 1;
          c = ((c % n) + n) % n;
          if (c !== eventChoiceCursorRef.current && isUndertalePreset) playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuSwitch);
          eventChoiceCursorRef.current = c; setEventChoiceCursor(c);
        }
      } else if (isPlaying && shopModalRef.current) {
        // ショップ（アイテム一覧＋とじる：縦一列）
        const n = shopModalRef.current.items.length + 1;
        if (menuUpEdge || menuDownEdge) {
          let c = shopCursorRef.current;
          if (menuUpEdge) c -= 1;
          if (menuDownEdge) c += 1;
          c = ((c % n) + n) % n;
          if (c !== shopCursorRef.current && isUndertalePreset) playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuSwitch);
          shopCursorRef.current = c; setShopCursor(c);
        }
      } else if (isPlaying && battleRef.current.active && !isDodgeBattleStyle(gameDataRef.current.battle?.style) && !isPartyBattleStyle(gameDataRef.current.battle?.style)) {
        // ターン制（classic）戦闘コマンド
        if (battleItemsOpenRef.current) {
          const n = usableItems().length + 1;
          if (menuUpEdge || menuDownEdge) {
            let c = battleItemsCursorRef.current;
            if (menuUpEdge) c -= 1;
            if (menuDownEdge) c += 1;
            c = ((c % n) + n) % n;
            battleItemsCursorRef.current = c; setBattleItemsCursor(c);
          }
        } else {
          const bd3 = gameDataRef.current.battle;
          const n = 2 + availableMoves(bd3?.moves ?? [], progressRef.current.level).length + (bd3?.labels.mercy ? 1 : 0) + (usableItems().length > 0 ? 1 : 0);
          if (n > 0 && (menuUpEdge || menuDownEdge || menuLeftEdge || menuRightEdge)) {
            let c = classicBattleCursorRef.current;
            if (menuLeftEdge) c -= 1;
            if (menuRightEdge) c += 1;
            if (menuUpEdge) c -= 2;
            if (menuDownEdge) c += 2;
            c = ((c % n) + n) % n;
            classicBattleCursorRef.current = c; setClassicBattleCursor(c);
          }
        }
      } else if (showTitleRef.current && gameDataRef.current.titleScreen) {
        // タイトル画面メニュー（縦一列）
        const n = gameDataRef.current.titleScreen.menu.length;
        if (n > 0 && (menuUpEdge || menuDownEdge)) {
          let c = titleCursorRef.current;
          if (menuUpEdge) c -= 1;
          if (menuDownEdge) c += 1;
          c = ((c % n) + n) % n;
          if (c !== titleCursorRef.current && isUndertalePreset) playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuSwitch);
          titleCursorRef.current = c; setTitleCursor(c);
        }
      }

      // ── Z / action：メッセージ送り・会話送り・メニュー確定（優先）／ 配置（編集モード） ──
      const isZ = keys.has('z') || keys.has('Z') || touchRef.current.action;
      if (isZ && !prevZRef.current) {
        if (undertaleAdvanceRef.current) {
          const bubs = enemyBubblesRef.current;
          const hasIncomplete = [...bubs.values()].some(b => b.reveal < b.text.length);
          if (hasIncomplete) {
            // 1押し目：全てのフキダシのタイプ表示を全文まで先送り
            setEnemyBubbles(prev => {
              const updated = new Map(prev);
              updated.forEach((b, k) => { if (b.reveal < b.text.length) updated.set(k, { ...b, reveal: b.text.length }); });
              return updated;
            });
          } else {
            const advance = undertaleAdvanceRef.current;
            undertaleAdvanceRef.current = null;
            setUndertaleWaiting(false);
            clearEnemyBubble();
            advance();
          }
        } else if (gameMsgRef.current) {
          dismissGameMsg();
        } else if (activeDialogueRef.current) {
          playSfx(MSG_ADVANCE_SFX);
          dialogueCutsceneRef.current?.advance();
        } else if (invDetailRef.current) {
          playMenuCancelSfx();
          setInvDetail(null); invDetailRef.current = null;
        } else if (invMenuRef.current) {
          const itemId = invSlotsRef.current[invMenuRef.current.slotIdx];
          const it = (gameDataRef.current.items ?? []).find(x => x.id === itemId);
          if (it) {
            const usable = !!(it.healHp || it.healMp || it.damage || it.targetType);
            const discardable = it.discardable !== false;
            const actions: (() => void)[] = [];
            if (usable) actions.push(() => useInventoryItem(itemId));
            actions.push(() => { playMenuConfirmSfx(); setInvDetail(itemId); invDetailRef.current = itemId; });
            if (discardable) actions.push(() => discardInventoryItem(itemId));
            actions.push(() => { playMenuCancelSfx(); setInvMenu(null); invMenuRef.current = null; });
            const idx = Math.min(invMenuCursorRef.current, actions.length - 1);
            actions[idx]?.();
          }
        } else if (isPlaying && invOpenRef.current && invSlotsRef.current.length > 0 && !battleRef.current.active) {
          playMenuConfirmSfx();
          setInvMenu({ slotIdx: invCursorRef.current }); invMenuRef.current = { slotIdx: invCursorRef.current };
          setInvMenuCursor(0); invMenuCursorRef.current = 0;
        } else if (isPlaying && battleRef.current.active && isDodgeBattleStyle(gameDataRef.current.battle?.style) && undertalePhaseRef.current === 'menu') {
          const canMenuNow = !!battleViewRef.current?.canAct && !battleViewRef.current?.over;
          const isDt = gameDataRef.current.battle?.style === 'deltarune';
          if (undertaleMenuRef.current === 'root') {
            if (canMenuNow) {
              const r = undertaleRootCursorRef.current;
              if (isDt && r === 4) { playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuConfirm); doDefend(); }
              else if (r === 0) { playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuConfirm); beginTargetSelect({ kind: 'fight' }); }
              else {
                playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuConfirm);
                if (r === 1) setUndertaleMenu('act');
                else if (r === 2) setUndertaleMenu('item');
                else setUndertaleMenu('mercy');
              }
            }
          } else if (undertaleMenuRef.current === 'target') {
            // ターゲット選択の確定：保留していた行動を選んだ敵へ実行
            if (canMenuNow && undertaleTargetSelRef.current) {
              playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuConfirm);
              dispatchTarget(undertaleTargetSelRef.current, undertaleTargetCursorRef.current);
            }
          } else if (undertaleMenuRef.current === 'act') {
            const curMember = isDt ? gameDataRef.current.battle?.party?.[dtTurnIdxRef.current] : undefined;
            const rawSpells3 = curMember?.spells ?? [];
            const spells = availableSpells(rawSpells3, dtTurnIdxRef.current, progressRef.current.level);
            // 呪文持ちメンバーのメニューは「まほう」＝呪文のみ（ACT技は呪文なしのクリス専用）
            const moves = isDt && rawSpells3.length ? [] : availableMoves(gameDataRef.current.battle?.moves ?? [], progressRef.current.level);
            const idx = undertaleSubCursorRef.current;
            if (idx < moves.length) {
              // 自分回復のこうどうは対象不要。それ以外（敵意/ダメージ）は対象の敵を選んでから実行
              const m = moves[idx];
              if (canMenuNow) { playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuConfirm); setUndertaleMenu('root'); if (m.heal) doMove(m); else beginTargetSelect({ kind: 'act', move: m }); }
            }
            else if (idx < moves.length + spells.length) {
              const spell = spells[idx - moves.length];
              if (canMenuNow && tpRef.current >= spell.tpCost) { playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuConfirm); setUndertaleMenu('root'); if (spell.heal) castSpell(spell); else beginTargetSelect({ kind: 'spell', spell }); }
            }
            else { playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuCancel); setUndertaleMenu('root'); }
          } else if (undertaleMenuRef.current === 'item') {
            const items = usableItems();
            const idx = undertaleSubCursorRef.current;
            if (idx < items.length) { if (canMenuNow) { playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuConfirm); setUndertaleMenu('root'); useHealItem(items[idx], true); } }
            else { playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuCancel); setUndertaleMenu('root'); }
          } else if (undertaleMenuRef.current === 'mercy') {
            const idx = undertaleSubCursorRef.current;
            if (idx === 0) { if (canMenuNow) { playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuConfirm); setUndertaleMenu('root'); doSpare(); } }
            else if (idx === 1) { if (canMenuNow) { playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuConfirm); setUndertaleMenu('root'); doFlee(); } }
            else { playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuCancel); setUndertaleMenu('root'); }
          }
        } else if (isPlaying && eventChoiceRef.current) {
          const choice = eventChoiceRef.current;
          const idx = Math.min(eventChoiceCursorRef.current, choice.choices.length - 1);
          playMenuConfirmSfx();
          choice.onPick(idx);
        } else if (isPlaying && shopModalRef.current) {
          const sm = shopModalRef.current;
          const idx = shopCursorRef.current;
          if (idx >= sm.items.length) {
            playMenuCancelSfx();
            setShopModal(null);
          } else {
            const si = sm.items[idx];
            const itemDef = (gameDataRef.current.items ?? []).find(it => it.id === si.itemId);
            const canAfford = (progressRef.current.gold ?? 0) >= si.price;
            if (canAfford) {
              const slots = [...invSlotsRef.current];
              if (slots.length >= MAX_INVENTORY) {
                showGameMsg('これいじょう もちものは もてない！', 'instant', () => { });
              } else {
                progressRef.current.gold = (progressRef.current.gold ?? 0) - si.price;
                slots.push(si.itemId);
                setInvSlots(slots); invSlotsRef.current = slots;
                setInventory(p => { const n = { ...p }; n[si.itemId] = (n[si.itemId] ?? 0) + 1; return n; });
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
              }
            }
          }
        } else if (isPlaying && battleRef.current.active && isPartyBattleStyle(gameDataRef.current.battle?.style)) {
          // パーティ制戦闘：コマンド選択中はカーソルの指す項目を確定する
          if (ptRef.current.phase === 'select') {
            const actions = ptMenuActions();
            const a = actions[Math.min(ptRef.current.menuCursor, actions.length - 1)];
            if (a && !a.disabled) { playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuConfirm); a.onClick(); }
          }
        } else if (isPlaying && battleRef.current.active && !isDodgeBattleStyle(gameDataRef.current.battle?.style)) {
          const canActNow = !!battleViewRef.current?.canAct && !battleViewRef.current?.over;
          if (battleItemsOpenRef.current) {
            const items = usableItems();
            const idx = battleItemsCursorRef.current;
            if (idx < items.length) { if (canActNow) useHealItem(items[idx], true); }
            else setBattleItemsOpen(false);
          } else if (canActNow) {
            const bd4 = gameDataRef.current.battle;
            const moves = bd4?.moves ?? [];
            const hasMercy = !!bd4?.labels.mercy;
            const hasItem = usableItems().length > 0;
            const idx = classicBattleCursorRef.current;
            if (idx === 0) doAttack();
            else if (idx === 1) doFlee();
            else if (idx - 2 < moves.length) {
              const m = moves[idx - 2];
              if (progressRef.current.mp >= m.cost) doMove(m);
            } else if (hasMercy && idx === 2 + moves.length) doSpare();
            else if (hasItem && idx === 2 + moves.length + (hasMercy ? 1 : 0)) setBattleItemsOpen(true);
          }
        } else if (showTitleRef.current && gameDataRef.current.titleScreen) {
          playMenuConfirmSfx();
          startFromTitle();
        } else if (!isPlaying && !battleRef.current.active && !eventRunningRef.current) {
          placeObj();
        }
      }

      // ── X key: メニューの「キャンセル」（一段階もどる）／ オブジェクト削除（編集モード） ──
      const isX = keys.has('x') || keys.has('X') || touchRef.current.shoot;
      if (isX && !prevXRef.current) {
        if (invDetailRef.current) {
          setInvDetail(null); invDetailRef.current = null;
        } else if (invMenuRef.current) {
          setInvMenu(null); invMenuRef.current = null;
        } else if (isPlaying && invOpenRef.current) {
          setInvOpen(false);
        } else if (isPlaying && battleRef.current.active && isDodgeBattleStyle(gameDataRef.current.battle?.style) && undertaleMenuRef.current !== 'root') {
          setUndertaleMenu('root');
        } else if (isPlaying && battleRef.current.active && gameDataRef.current.battle?.style === 'deltarune'
          && undertalePhaseRef.current === 'menu' && undertaleMenuRef.current === 'root'
          && dtStageRef.current === 'select' && dtSelLogRef.current.length > 0 && !battleViewRef.current?.over) {
          // ルートメニューでのX＝1つ前に選択を確定したメンバーへ戻り、その行動を取り消す
          // （tlDR o_enc の CANCEL：party_selection を戻して action_queue 末尾を pop + cancel()）
          const last = dtSelLogRef.current.pop()!;
          if (last.kind === 'defend') {
            if (last.memberId) dtDefendedRef.current.delete(last.memberId);
            const nextTp = Math.max(0, tpRef.current - (last.tpGained ?? 0));
            tpRef.current = nextTp; setTp(nextTp);
          } else {
            dtQueueRef.current.pop();
          }
          dtTurnIdxRef.current = last.idx; setDtTurnIdx(last.idx);
          setUndertaleRootCursor(0); undertaleRootCursorRef.current = 0;
          setBattle(v => (v && !v.over ? { ...v, canAct: true } : v));
          playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).menuCancel);
        } else if (isPlaying && battleRef.current.active && isPartyBattleStyle(gameDataRef.current.battle?.style)) {
          // パーティ制戦闘のX：サブメニュー/対象選択中なら一段もどる。ルートなら直前の選択を取り消す
          if (ptRef.current.phase === 'select') {
            if (ptRef.current.menu !== 'root' || ptRef.current.pending) ptPatch({ menu: 'root', pending: null });
            else ptUndo();
          }
        } else if (isPlaying && battleRef.current.active && !isDodgeBattleStyle(gameDataRef.current.battle?.style) && battleItemsOpenRef.current) {
          setBattleItemsOpen(false);
        } else if (isPlaying && shopModalRef.current) {
          setShopModal(null);
        } else if (!isPlaying && !battleRef.current.active && !eventRunningRef.current && selectedObjIdRef.current) {
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

      // カメラ：touhou は画面固定（常に原点）、他はプレイヤー中心追従。
      // 編集モードでは「プレイヤーが初期位置から動いていない」ときだけエディタのスクロール位置を使う。
      // この判定は必ず X/Y 両軸セットで行うこと：軸ごとに個別判定すると、歩行中に片方の座標が
      // たまたま初期値と一致した瞬間（整数速度・タイルスナップで頻発）だけカメラがスクロール座標へ
      // 1フレーム飛んで戻る「瞬間テレポート」が起きる。
      const playerAtStart = p.x === gameData.player.start.x && p.y === gameData.player.start.y;
      let camX = gameData.engine === 'touhou' ? 0 : Math.max(0, Math.min(camMax,
        isPlaying || !playerAtStart
          ? p.x + pData.w / 2 - VIEW_W / 2
          : editScrollRef.current));
      let camY = gameData.engine === 'touhou' ? 0 : Math.max(0, Math.min(camMaxY,
        isPlaying || !playerAtStart
          ? p.y + pData.h / 2 - VIEW_H / 2
          : editScrollYRef.current));

      if (camOverrideRef.current) {
        const ovr = camOverrideRef.current;
        if (ovr.endX === -1) {
          const elapsed = Date.now() - ovr.startTime;
          if (elapsed >= ovr.duration || ovr.duration <= 0) {
            camOverrideRef.current = null;
          } else {
            const r = elapsed / ovr.duration;
            camX = ovr.startX + (camX - ovr.startX) * r;
            camY = ovr.startY + (camY - ovr.startY) * r;
          }
        } else {
          const elapsed = Date.now() - ovr.startTime;
          if (elapsed >= ovr.duration || ovr.duration <= 0) {
            camX = ovr.endX;
            camY = ovr.endY;
          } else {
            const r = Math.min(1, elapsed / ovr.duration);
            camX = ovr.startX + (ovr.endX - ovr.startX) * r;
            camY = ovr.startY + (ovr.endY - ovr.startY) * r;
          }
        }
      }

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

      const finalCamX = camX + cameraPanRef.current.x;
      const finalCamY = camY + cameraPanRef.current.y;
      camXRef.current = finalCamX; camYRef.current = finalCamY;

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
          if (showCollisionBoundariesRef.current && !isPlaying && !info.passable) {
            const px = x * TILE_SIZE + 5, py = y * TILE_SIZE + 5;
            const ex = x * TILE_SIZE + TILE_SIZE - 5, ey = y * TILE_SIZE + TILE_SIZE - 5;
            ctx.lineWidth = 3; ctx.strokeStyle = '#000';
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.moveTo(ex, py); ctx.lineTo(px, ey); ctx.stroke();
            ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff';
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.moveTo(ex, py); ctx.lineTo(px, ey); ctx.stroke();
          }
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
        if (showCollisionBoundariesRef.current && !isPlaying && !info.passable) {
          const px = x * TILE_SIZE + 5, py = y * TILE_SIZE + 5;
          const ex = x * TILE_SIZE + TILE_SIZE - 5, ey = y * TILE_SIZE + TILE_SIZE - 5;
          ctx.lineWidth = 3; ctx.strokeStyle = '#000';
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.moveTo(ex, py); ctx.lineTo(px, ey); ctx.stroke();
          ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff';
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.moveTo(ex, py); ctx.lineTo(px, ey); ctx.stroke();
        }
      };
      // 地面レイヤー：プレイヤーより先に描画
      for (let y = startRow; y < endRow; y++) {
        for (let x = startCol; x < endCol; x++) {
          const tileId = map[y]?.[x] ?? 0;
          const info = gameData.tiles[tileId];
          if (tileId !== 0 && info) drawTileCell(x, y, tileId, info);
        }
      }
      // 置物レイヤー（オブジェクトレイヤー）：プレイヤーより先に描画
      const overlayMap = engineRef.current.overlayMap ?? worldLayoutRef.current?.overlayMap ?? gameData.overlayMap;
      if (overlayMap) {
        for (let y = startRow; y < endRow; y++) {
          for (let x = startCol; x < endCol; x++) {
            const tileId = overlayMap[y]?.[x] ?? 0;
            const info = gameData.tiles[tileId];
            if (tileId !== 0 && info) drawTileCell(x, y, tileId, info);
          }
        }
      }

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
            const eOpened = e.def.altSpriteRef && (selfSwitchesRef.current[e.def.id]?.['A'] ?? false);
            drawSprite({
              emoji: e.def.emoji,
              spriteUrl: eOpened ? e.def.altSpriteUrl : e.def.spriteUrl,
              spriteRef: eOpened ? e.def.altSpriteRef : e.def.spriteRef,
            }, e.x, e.y, e.def.w ?? TILE_SIZE, e.def.h ?? TILE_SIZE, `ent${e.def.id}_${ei}`);
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
              ctx.moveTo(eb.x + cos * x1, eb.y + sin * x1);
              ctx.lineTo(eb.x + sin * (-y2), eb.y + cos * (-y2));  // (0,-y2) 回転
              ctx.lineTo(eb.x + cos * (-x1), eb.y + sin * (-x1));
              ctx.lineTo(eb.x - sin * (-y2), eb.y - cos * (-y2));  // (0,+y2) 回転
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
      // 死亡中またはゲームオーバー画面表示中は非表示。無敵中は点滅（action=2f周期でロックマン風、他=4f周期）
      const blinkPeriod = gameData.engine === 'action' ? 2 : 4;
      if (!isPlayerDeadRef.current && !gameOverActiveRef.current && !(invulnRef.current > 0 && Math.floor(invulnRef.current / blinkPeriod) % 2 === 0)) {
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
        // 移動不可でも入力方向があれば向きを更新する（壁際・NPC前で向きが変わる）。
        // playerBlockedDirRef に方向がある（ブロックされた）かつ静止中は overrideDir として渡す。
        // touhou は常に上向き固定。action エンジンは横向きのみで別途管理。
        const lastPos = lastDrawnPlayerPosRef.current;
        const isStationary = lastPos && p.x === lastPos.x && p.y === lastPos.y;
        const blockedOverride = gameData.engine === 'rpg' && isStationary && playerBlockedDirRef.current
          ? playerBlockedDirRef.current : undefined;
        lastDrawnPlayerPosRef.current = { x: p.x, y: p.y };
        drawSprite({ emoji: pData.emoji, spriteUrl: p.spriteUrl ?? pData.spriteUrl, spriteRef: p.spriteRef ?? pData.spriteRef }, p.x, p.y, pData.w, drawH, 'player',
          gameData.engine === 'touhou' ? 'w' : blockedOverride);
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
      // 天蓋レイヤー：木の上部や屋根などプレイヤーより手前に重ねて描画。
      // プレイヤーがその真下付近にいる間は半透明化し、奥のプレイヤーが見えるようにする（gomi.html の drawMapUpper 相当）。
      const overheadMap = engineRef.current.overheadMap ?? worldLayoutRef.current?.overheadMap ?? gameData.overheadMap;
      if (overheadMap) {
        const ptx = Math.floor((p.x + pData.w / 2) / TILE_SIZE);
        const pty = Math.floor((p.y + pData.h) / TILE_SIZE);
        let underOverhead = false;
        for (let dy = -1; dy <= 0 && !underOverhead; dy++) {
          if ((overheadMap[pty + dy]?.[ptx] ?? 0) !== 0) underOverhead = true;
        }
        const targetAlpha = underOverhead ? 0.5 : 1.0;
        overheadAlphaRef.current += (targetAlpha - overheadAlphaRef.current) * 0.15;
        if (Math.abs(overheadAlphaRef.current - targetAlpha) < 0.01) overheadAlphaRef.current = targetAlpha;
        ctx.globalAlpha = overheadAlphaRef.current;
        for (let y = startRow; y < endRow; y++) {
          for (let x = startCol; x < endCol; x++) {
            const tileId = overheadMap[y]?.[x] ?? 0;
            const info = gameData.tiles[tileId];
            if (tileId !== 0 && info) drawTileCell(x, y, tileId, info);
          }
        }
        ctx.globalAlpha = 1;
      }
      // イベントポイント・見る場所などのエディタ用マーカー：上層レイヤー（木の上部・屋根など）より
      // 手前に重ねて描画し、編集モードで常に視認できるようにする。
      if (!isPlaying) {
        for (const o of gameData.objects) {
          if (o.editorSprite) {
            ctx.save();
            ctx.globalAlpha = 0.5;
            drawSprite({ emoji: '', spriteUrl: o.editorSprite, spriteRef: undefined }, o.col * TILE_SIZE, (o.row + 1) * TILE_SIZE - (o.h ?? TILE_SIZE), o.w ?? TILE_SIZE, o.h ?? TILE_SIZE, `objEditor${o.id}`);
            ctx.restore();
          }
        }
      }
      // NPCセリフ（フキダシではなく頭上に1文字ずつ表示）。全スプライトより前面に出すため描画の最後で行う
      if (isPlaying && npcTalkRef.current) {
        const talk = npcTalkRef.current;
        const { entity: e, text, startTime, wrapped } = talk;
        const shown = Math.min(text.length, Math.floor((performance.now() - startTime) / 50));
        if (isUndertalePreset && shown > talk.lastShown) {
          if (text.slice(talk.lastShown, shown).trim()) playSfx((undertaleSfx ?? UNDERTALE_SFX_BY_PRESET.undertale).textVoice);
          talk.lastShown = shown;
        }
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
      // アンダーテール風エンカウント演出：プレイヤーの手前で明滅するハートが画面全体の
      // 明滅（黒フラッシュ）と同期しつつ、バトル画面のコマンド位置へ一直線に移動する
      if (isPlaying && encounterAlertRef.current?.phase === 'flash') {
        const alert = encounterAlertRef.current;
        const t = performance.now() - alert.startTime;
        const ratio = Math.min(1, t / ENCOUNTER_FLASH_MS);
        const eased = ratio < 0.5 ? 2 * ratio * ratio : 1 - Math.pow(-2 * ratio + 2, 2) / 2; // ease-in-out
        const visible = Math.floor(t / 90) % 2 === 0; // 明滅
        if (visible) {
          // 画面全体の黒フラッシュ（現在の座標変換をリセットしてキャンバス全体を覆う）
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.restore();
          // ハート本体（プレイヤーの手前＝プレイヤー描画より後に重ねて描く）。
          // デルタルーンは「！」演出（'alert'フェーズ）自体を使わないので、その延長のハート移動も出さない
          // （黒フラッシュの明滅のみ＝Deltarune本編の遭遇演出に合わせる）。
          if (presetId !== 'deltarune') {
            const cx = Math.round(alert.fromX + (alert.toX - alert.fromX) * eased);
            const cy = Math.round(alert.fromY + (alert.toY - alert.fromY) * eased);
            const s = 7;
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.fillStyle = '#ff3355';
            ctx.beginPath();
            ctx.moveTo(cx, cy + s * 0.9);
            ctx.bezierCurveTo(cx + s, cy + s * 0.2, cx + s * 0.8, cy - s * 0.8, cx, cy - s * 0.2);
            ctx.bezierCurveTo(cx - s * 0.8, cy - s * 0.8, cx - s, cy + s * 0.2, cx, cy + s * 0.9);
            ctx.fill();
            ctx.restore();
          }
        }
      }
      // アンダーテール風エンカウント演出：プレイヤー頭上にドット絵の吹き出し「！」を表示
      if (isPlaying && encounterAlertRef.current?.phase === 'alert') {
        const p2 = eng.player;
        const t = performance.now() - encounterAlertRef.current.startTime;
        const pop = Math.min(1, t / 120);
        const bob = Math.round(Math.sin(pop * Math.PI) * -2); // 出現時のピョコッと弾む動き
        const px = Math.round(p2.x + (gameData.player.w ?? TILE_SIZE) / 2);
        const bw = 16, bh = 14;
        const bx = px - bw / 2;
        const by = Math.round(p2.y - 10 - bh) + bob;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        // ドット吹き出し本体（黒枠+白地の角ばった矩形）
        ctx.fillStyle = '#000';
        ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
        ctx.fillStyle = '#fff';
        ctx.fillRect(bx, by, bw, bh);
        // 吹き出しの尻尾（プレイヤーを指す段差のついたピクセルノッチ）
        ctx.fillStyle = '#000';
        ctx.fillRect(px - 4, by + bh + 2, 8, 2);
        ctx.fillStyle = '#fff';
        ctx.fillRect(px - 2, by + bh, 4, 2);
        ctx.fillRect(px - 2, by + bh + 2, 4, 2);
        // 「！」本体
        ctx.fillStyle = '#000';
        ctx.font = `bold 11px ${getPixelFontFamily()}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', px, by + bh / 2 + 1);
        ctx.restore();
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

      // ── RPGEN オーバーレイ描画 ──────────────────────────────────────────
      Object.values(overlayImagesRef.current).forEach(img => {
        let currentUrl = img.url;
        let tX = 0, tY = 0, tW = 100, tH = 100, tR = 0, tA = img.opacity ?? 100, tOx = 0, tOy = 0;

        if (img.frames && img.frames.length > 0 && img.ms) {
          const now = img.pausedAt || Date.now();
          const elapsed = now - (img.startTime || now);
          const totalFrames = img.frames.length;
          const frameIdx = img.lp
            ? Math.floor(elapsed / img.ms) % totalFrames
            : Math.min(Math.floor(elapsed / img.ms), totalFrames - 1);
          const frame = img.frames[frameIdx];
          currentUrl = frame.url;
          tX = frame.sx;
          tY = frame.sy;
          tW = frame.sw;
          tH = frame.sh;
          tR = frame.r;
          tA = frame.a;
          tOx = frame.ox;
          tOy = frame.oy;
        }

        ensureImage(currentUrl);
        const domImg = imgCache.current.get(currentUrl);
        if (domImg && domImg.complete && domImg.naturalWidth > 0) {
          ctx.save();
          ctx.globalAlpha = tA / 100;

          let sW = img.swp ? tW : domImg.naturalWidth * (tW / 100);
          let sH = img.swp ? tH : domImg.naturalHeight * (tH / 100);
          let sX = img.sxp ? tX : domImg.naturalWidth * (tX / 100);
          let sY = img.sxp ? tY : domImg.naturalHeight * (tY / 100);

          let dW = sW;
          let dH = sH;
          if (img.w !== undefined && img.w !== 0) {
            dW = img.wp ? img.w : sW * (img.w / 100);
          }
          if (img.h !== undefined && img.h !== 0) {
            dH = img.wp ? img.h : sH * (img.h / 100);
          }

          let drawX = img.xp ? img.x : (img.x / 100) * PLAY_W;
          let drawY = img.xp ? img.y : (img.y / 100) * PLAY_H;

          if (img.m) {
            drawX -= camXRef.current;
            drawY -= camYRef.current;
          }

          if (img.c) {
            drawX -= dW / 2;
            drawY -= dH / 2;
          }

          ctx.translate(drawX, drawY);
          ctx.translate(tOx, tOy);
          ctx.rotate(tR * Math.PI / 180);
          ctx.translate(-tOx, -tOy);
          if (sW > 0 && sH > 0 && dW > 0 && dH > 0) {
            ctx.drawImage(domImg, sX, sY, sW, sH, 0, 0, dW, dH);
          }
          ctx.restore();
        }
      });

      // ── エフェクトアニメーション（フィールド）描画：エンティティより手前、一度きり再生 ──
      {
        const nowPerf = performance.now();
        const stillActive: typeof activeFieldEffectsRef.current = [];
        for (const fx of activeFieldEffectsRef.current) {
          const elapsed = (nowPerf - fx.startTime) / 1000;
          const fps = fx.effect.fps ?? 12;
          const frame = Math.floor(elapsed * fps);
          if (frame >= fx.effect.frameCount) continue; // 再生終了：リストから除外（stillActive に積まない）
          stillActive.push(fx);
          const domImg = imgCache.current.get(fx.imgUrl);
          if (domImg && domImg.complete && domImg.naturalWidth > 0) {
            const frameW = domImg.naturalWidth / fx.effect.frameCount;
            const destH = TILE_SIZE * 1.5;
            const destW = destH * (frameW / domImg.naturalHeight);
            const screenX = fx.worldX - camXRef.current;
            const screenY = fx.worldY - camYRef.current;
            ctx.drawImage(domImg, frame * frameW, 0, frameW, domImg.naturalHeight, screenX - destW / 2, screenY - destH / 2, destW, destH);
          }
        }
        activeFieldEffectsRef.current = stillActive;
      }

      // ── プレビュー用画像描画 (DW_IMA プレビュー) ─────────────────────────
      if (previewCommandRef.current && previewCommandRef.current.type === 'showImage') {
        const img = previewCommandRef.current as any;
        if (img.url) {
          let tX = img.x ?? 0, tY = img.y ?? 0, tW = 100, tH = 100, tR = 0, tA = img.opacity ?? 100, tOx = 0, tOy = 0;
          let currentUrl = img.url;

          if (img.frames && img.frames.length > 0) {
            const now = Date.now();
            const ms = img.ms || 100;
            const totalDuration = ms * img.frames.length;
            const elapsed = now % totalDuration;
            const frameIndex = Math.min(Math.floor(elapsed / ms), img.frames.length - 1);
            const frame = img.frames[frameIndex];
            currentUrl = frame.url || currentUrl;
            tX = frame.sx ?? 0; tY = frame.sy ?? 0;
            tW = frame.sw ?? 100; tH = frame.sh ?? 100;
            tR = frame.r ?? 0; tA = frame.a ?? 100;
            tOx = frame.ox ?? 0; tOy = frame.oy ?? 0;
          } else {
            tX = img.sx ?? 0; tY = img.sy ?? 0;
            tW = img.sw ?? 100; tH = img.sh ?? 100;
            tR = img.r ?? 0; tA = img.opacity ?? 100;
            tOx = img.ox ?? 0; tOy = img.oy ?? 0;
          }

          ensureImage(currentUrl);
          const domImg = imgCache.current.get(currentUrl);
          if (domImg && domImg.complete && domImg.naturalWidth > 0) {
            ctx.save();
            ctx.globalAlpha = tA / 100;

            let sW = img.swp ? tW : domImg.naturalWidth * (tW / 100);
            let sH = img.swp ? tH : domImg.naturalHeight * (tH / 100);
            let sX = img.sxp ? tX : domImg.naturalWidth * (tX / 100);
            let sY = img.sxp ? tY : domImg.naturalHeight * (tY / 100);

            let dW = sW;
            let dH = sH;
            if (img.w !== undefined && img.w !== 0) {
              dW = img.wp ? img.w : sW * (img.w / 100);
            }
            if (img.h !== undefined && img.h !== 0) {
              dH = img.wp ? img.h : sH * (img.h / 100);
            }

            let drawX = img.xp ? (img.x || 0) : ((img.x || 0) / 100) * PLAY_W;
            let drawY = img.xp ? (img.y || 0) : ((img.y || 0) / 100) * PLAY_H;

            if (img.m) {
              drawX -= camXRef.current;
              drawY -= camYRef.current;
            }

            if (img.c) {
              drawX -= dW / 2;
              drawY -= dH / 2;
            }

            ctx.translate(drawX, drawY);
            ctx.translate(tOx, tOy);
            ctx.rotate(tR * Math.PI / 180);
            ctx.translate(-tOx, -tOy);
            if (sW > 0 && sH > 0 && dW > 0 && dH > 0) {
              ctx.drawImage(domImg, sX, sY, sW, sH, 0, 0, dW, dH);
            }
            ctx.restore();
          }
        }
      }

      // ── RPGEN 追随画像描画 (DW_FL) ──────────────────────────────────────────
      Object.values(followImagesRef.current).forEach(img => {
        let targetEnt: any = null;
        let tDir = 'd';
        let targetW = TILE_SIZE, targetH = TILE_SIZE;

        if (img.targetObjId === 'player') {
          targetEnt = engineRef.current.player;
          targetW = gameData.player.w;
          targetH = gameData.player.h;
          tDir = walkInst.get('player')?.dir ?? 's';
        } else {
          targetEnt = engineRef.current.entities?.find(e => e.def.id === img.targetObjId) || null;
          if (targetEnt) {
            targetW = targetEnt.w;
            targetH = targetEnt.h;
            tDir = targetEnt.dir ?? 's';
          }
        }
        if (!targetEnt) return;

        const dirMapping: Record<string, 'U' | 'D' | 'L' | 'R'> = { w: 'U', s: 'D', a: 'L', d: 'R', up: 'U', down: 'D', left: 'L', right: 'R' };
        const dir = dirMapping[tDir] || 'D';
        const dirData = img.directions[dir];
        if (!dirData) return;

        ensureImage(dirData.url);
        const domImg = imgCache.current.get(dirData.url);
        if (domImg && domImg.complete && domImg.naturalWidth > 0) {
          ctx.save();
          ctx.globalAlpha = (dirData.opacity ?? 100) / 100;

          const tW = dirData.sw ?? 100;
          const tH = dirData.sh ?? 100;
          const tX = dirData.sx ?? 0;
          const tY = dirData.sy ?? 0;

          let sW = dirData.swp ? tW : domImg.naturalWidth * (tW / 100);
          let sH = dirData.swp ? tH : domImg.naturalHeight * (tH / 100);
          let sX = dirData.sxp ? tX : domImg.naturalWidth * (tX / 100);
          let sY = dirData.sxp ? tY : domImg.naturalHeight * (tY / 100);

          let dW = sW;
          let dH = sH;
          if (dirData.w !== undefined && dirData.w !== 0) {
            dW = dirData.wp ? dirData.w : sW * (dirData.w / 100);
          }
          if (dirData.h !== undefined && dirData.h !== 0) {
            dH = dirData.wp ? dirData.h : sH * (dirData.h / 100);
          }

          let drawX = dirData.xp ? (dirData.x || 0) : ((dirData.x || 0) / 100) * PLAY_W;
          let drawY = dirData.xp ? (dirData.y || 0) : ((dirData.y || 0) / 100) * PLAY_H;

          // 追随画像は対象の座標を基準にする
          const targetWorldX = targetEnt.x + (targetW / 2);
          const targetWorldY = targetEnt.y + (targetH / 2);
          const screenX = targetWorldX - camXRef.current;
          const screenY = targetWorldY - camYRef.current;

          drawX += screenX;
          drawY += screenY;

          if (dirData.c) {
            drawX -= dW / 2;
            drawY -= dH / 2;
          }

          const tOx = dirData.ox ?? 0;
          const tOy = dirData.oy ?? 0;
          const tR = dirData.r ?? 0;

          ctx.translate(drawX, drawY);
          ctx.translate(tOx, tOy);
          ctx.rotate(tR * Math.PI / 180);
          ctx.translate(-tOx, -tOy);
          if (sW > 0 && sH > 0 && dW > 0 && dH > 0) {
            ctx.drawImage(domImg, sX, sY, sW, sH, 0, 0, dW, dH);
          }
          ctx.restore();
        }
      });

      const effect = screenEffectRef.current;
      if (effect && effect.effects) {
        ctx.save();
        effect.effects.forEach(ef => {
          if (ef.type === 'solid') {
            const rgba = ef.color ? `rgba(${ef.color.split('-').map((c, i) => i === 3 ? parseInt(c) / 100 : c).join(',')})` : 'transparent';
            ctx.fillStyle = rgba;
            ctx.fillRect(0, 0, PLAY_W, PLAY_H);
          } else if (ef.type === 'gradient') {
            const [ax, ay, bx, by] = (ef.pos || '0-0-100-100').split('-').map(Number);
            const grad = ctx.createLinearGradient((ax / 100) * PLAY_W, (ay / 100) * PLAY_H, (bx / 100) * PLAY_W, (by / 100) * PLAY_H);
            const [s1, s2] = (ef.stops || '0-100').split('-').map(Number);
            const rgba1 = ef.c1 ? `rgba(${ef.c1.split('-').map((c, i) => i === 3 ? parseInt(c) / 100 : c).join(',')})` : 'transparent';
            const rgba2 = ef.c2 ? `rgba(${ef.c2.split('-').map((c, i) => i === 3 ? parseInt(c) / 100 : c).join(',')})` : 'transparent';
            grad.addColorStop(s1 / 100, rgba1);
            grad.addColorStop(s2 / 100, rgba2);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, PLAY_W, PLAY_H);
          }
        });
        ctx.restore();
      }

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
            eng.overlayMap = JSON.parse(JSON.stringify(next.overlayMap ?? emptyGridLike(next.map)));
            eng.overheadMap = JSON.parse(JSON.stringify(next.overheadMap ?? emptyGridLike(next.map)));
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
  const touchRef = useRef({ up: false, down: false, left: false, right: false, action: false, slow: false, bomb: false, shoot: false, select: false, inv: false });
  const prevActionRef = useRef(false);
  const prevZRef = useRef(false);
  const prevXRef = useRef(false);
  const prevBombRef = useRef(false);
  const prevInvRef = useRef(false);
  // メニュー（持ち物一覧・戦闘コマンド）を十字キーで操作するためのエッジ検出
  const prevMenuUpRef = useRef(false);
  const prevMenuDownRef = useRef(false);
  const prevMenuLeftRef = useRef(false);
  const prevMenuRightRef = useRef(false);
  /** デルタルーン戦闘コマンドのキー押しっぱなしリピート用ホールドフレーム数。 */
  const menuHoldRef = useRef({ up: 0, down: 0, left: 0, right: 0 });
  const [, force] = useState(0);
  const setTouch = (key: keyof typeof touchRef.current, v: boolean) => { touchRef.current[key] = v; force(n => n + 1); };

  const handleCanvasAction = (e: React.MouseEvent | React.TouchEvent) => {
    if (isPlaying || playOnly) return;
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
      } else if (editMapLayer === 'overhead') {
        setGameData(prev => {
          const newOverhead = (prev.overheadMap ?? emptyGridLike(prev.map)).map(r => [...r]);
          newOverhead[row][col] = selectedTileId;
          return { ...prev, overheadMap: newOverhead };
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
    else if (target.t === 'yumeSky') {
      setGameData(p => p.layout25d ? { ...p, layout25d: { ...p.layout25d, skyRef: res.ref, skyUrl: res.url } } : p);
    }
    else if (target.t === 'yumeMcSkin') {
      // マイクラスキン：選んだ画像（アップロード画像や素材URL）からブロック人形スプライトを新規追加する
      const lay = gameData.layout25d;
      if (lay) {
        const id = Math.max(0, ...Object.keys(lay.textures).map(Number)) + 1;
        setGameData(p => p.layout25d ? {
          ...p,
          layout25d: {
            ...p.layout25d,
            textures: {
              ...p.layout25d.textures,
              [id]: { id, name: 'マイクラスキン', kind: 'sprite' as const, color: '#7ec9a2', emoji: '👗', minecraftSkin: res.url },
            },
          },
        } : p);
        setYume25dTool('sprite');
        setYume25dSelSprite(id);
      }
    }
    else if (target.t === 'playerMcSkin') {
      setGameData(p => ({ ...p, player: { ...p.player, minecraftSkin: res.url, spriteRef: undefined, spriteUrl: undefined } }));
    }
    else if (target.t === 'effectImage') {
      ensureImage(res.url);
      setGameData(p => ({ ...p, effects: (p.effects ?? []).map(ef => ef.id === target.id ? { ...ef, imageRef: res.ref, imageUrl: res.url } : ef) }));
    }
    else if (target.t === 'effectSfx') {
      const s = bgmLike();
      setGameData(p => ({ ...p, effects: (p.effects ?? []).map(ef => ef.id === target.id ? { ...ef, sfx: { ref: s.ref, src: s.src, type: s.type } } : ef) }));
    }
    else if (target.t === 'yumeTexSound') {
      const s = bgmLike();
      setGameData(p => {
        if (!p.layout25d) return p;
        const textures = { ...p.layout25d.textures };
        if (textures[target.id]) {
          // 届く距離・音量の既存設定は保ったまま音源だけ差し替える
          textures[target.id] = { ...textures[target.id], sound: { ...textures[target.id].sound, ref: s.ref, src: s.src, type: s.type } };
        }
        return { ...p, layout25d: { ...p.layout25d, textures } };
      });
    }
  };

  const addTile = () => {
    const id = Math.max(...Object.keys(gameData.tiles).map(Number)) + 1;
    setGameData(p => ({ ...p, tiles: { ...p.tiles, [id]: { name: `タイル${id}`, color: '#888888', passable: false } } }));
    // 追加したタイルをそのまま選択し、パレット下の詳細設定を開く（yume25d の追加系と同じ流れ）
    setSelectedTileId(id);
  };
  const updateTile = (id: number, patch: Partial<TileDef>) =>
    setGameData(p => ({ ...p, tiles: { ...p.tiles, [id]: { ...p.tiles[id], ...patch } } }));
  /** 地形自動生成マクロ：編集中シーンの下層(地面)レイヤーをパーリンノイズ地形で丸ごと描き替える。
   *  action は横視点の起伏地形、それ以外は見下ろしのバイオーム塗り分け。押すたびにランダムシード。 */
  const runTerrainMacro = () => {
    setGameData(p => {
      const startCol = Math.floor(p.player.start.x / TILE_SIZE);
      const startRow = Math.floor(p.player.start.y / TILE_SIZE);
      const seed = (Math.random() * 0xffffffff) >>> 0;
      const r = p.engine === 'action'
        ? generateSideViewTerrain(p.map, p.tiles, startCol, startRow, seed)
        : generateTopDownTerrain(p.map, p.tiles, startCol, startRow, seed, terrainWater);
      return { ...p, map: r.map, tiles: r.tiles };
    });
  };
  /** システムタイル（ワープ床/どく沼・ダメージ床/つるつる床）をテンプレートから新規タイルとして追加する。 */
  const addSystemTile = (tpl: SystemTileTemplate) => {
    setGameData(p => {
      const ids = Object.keys(p.tiles).map(Number);
      const id = Math.max(...ids) + 1;
      return {
        ...p,
        tiles: {
          ...p.tiles,
          [id]: {
            name: tpl.label, color: tpl.color, passable: tpl.passable,
            special: tpl.special, imageRef: tpl.imageRef, imageUrl: tpl.imageUrl,
          },
        },
      };
    });
    setEditorTab('map');
  };
  /** 宝箱（システムオブジェクト）をプレイヤーの現在位置に配置する。 */
  const addChestObject = () => {
    const p = engineRef.current.player;
    const col = Math.floor((p.x + 12) / TILE_SIZE), row = Math.floor((p.y + 12) / TILE_SIZE);
    const obj = chest(col, row, []);
    setGameData(prev => ({ ...prev, objects: [...prev.objects, obj] }));
    setEditorTab('object');
    setSelectedObjId(obj.id);
  };
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
    gravity: gameData.gravity, friction: gameData.friction, iceSlideSpeed: gameData.iceSlideSpeed,
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
      // imageRef がない場合（RPGEN インポート等で直 URL が入っている場合）は imageUrl も保存する。
      // ロード時は hydrateUrlFromRef で imageRef → imageUrl に変換されるが、
      // imageRef がなければ imageUrl をそのまま使う。
      imageUrl: t.imageRef ? undefined : t.imageUrl,
      warpSceneId: t.warpSceneId, warpEntryCol: t.warpEntryCol, warpEntryRow: t.warpEntryRow, damageAmount: t.damageAmount,
    }])),
    map: gameData.map,
    overlayMap: gameData.overlayMap,
    overheadMap: gameData.overheadMap,
    objects: gameData.objects.map(({ spriteUrl, ...o }) => o),
    mapBgRef: gameData.mapBgRef,
    scroll: gameData.scroll,
    bgm: gameData.bgm?.ref || 'none',
    battleBgm: gameData.battleBgm?.ref,
    bossBgm: gameData.bossBgm?.ref,
    sfx: Object.fromEntries(Object.entries(gameData.sfx).map(([k, v]) => [k, v?.ref])) as Partial<Record<SfxTrigger, string>>,
    switches: gameData.switches,
    items: gameData.items,
    weapons: gameData.weapons,
    armors: gameData.armors,
    effects: gameData.effects?.map(ef => ({
      id: ef.id, name: ef.name, imageRef: ef.imageRef,
      // url: 参照は自己解決可能なので imageUrl は保存しない（post: の場合のみキャッシュとして保存）。
      imageUrl: ef.imageRef.startsWith('url:') ? undefined : ef.imageUrl,
      frameCount: ef.frameCount, fps: ef.fps, sfx: ef.sfx,
    })),
    phases: gameData.phases,
    titleScreen: gameData.titleScreen ? (({ bgUrl: _u, ...t }) => t)(gameData.titleScreen) : undefined,
    ending: gameData.ending ? (({ bgUrl: _u, ...e }) => e)(gameData.ending) : undefined,
    deathScreen: gameData.deathScreen,
    battle: gameData.battle,
    layout25d: gameData.layout25d,
    scenes: gameData.scenes?.map(s => ({
      id: s.id, name: s.name, exits: s.exits,
      map: s.map,
      overlayMap: s.overlayMap,
      overheadMap: s.overheadMap,
      objects: s.objects.map(({ spriteUrl, ...o }) => o),
      bgm: s.bgm?.ref,
      randomEncounters: s.randomEncounters,
      encounterGroups: s.encounterGroups,
      encounterRate: s.encounterRate,
    })),
  });

  const handleSave = () => {
    clearAutosave(editStorageKey);
    playSfx(sfxRef.current.save);
    onSave?.(buildManifest(), { title: title.trim() || gameData.name, preset: gameData.id });
  };

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
        const raw = JSON.parse(ev.target?.result as string);
        // DBレコードやAPIレスポンス（{ title, manifest: {...} }）で包まれていても中身を取り出す
        const manifest = (raw && typeof raw === 'object' && raw.manifest && typeof raw.manifest === 'object'
          ? raw.manifest : raw) as GameManifestDraft;
        if (!manifest || typeof manifest !== 'object' || (!manifest.map && !manifest.layout25d && !manifest.scenes)) {
          alert('ゲームのJSONではないようです（map / layout25d / scenes が見つかりません）');
          return;
        }
        loadManifest(manifest, typeof raw.title === 'string' && raw.title ? raw.title : undefined);
      } catch (err) {
        console.error('game JSON import failed', err);
        alert(`JSONの読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const [showRpgenModal, setShowRpgenModal] = useState(false);
  const [rpgenInputText, setRpgenInputText] = useState('');

  const submitRpgenImport = async () => {
    try {
      const text = rpgenInputText;
      if (!text.trim()) return;
      const manifest = await parseRpgen(text);

      // シーンモードで編集中なら、ゲーム全体を作り直すのではなく「今開いているシーン」だけを
      // 上書きする。BGM・イベント（オブジェクト）・マップは丸ごと差し替え、それ以外
      // （プリセット・エンジン・プレイヤー設定・他シーン等）はそのまま維持する。
      if (gameData.scenes && gameData.scenes.length > 0) {
        // タイルIDはゲーム全体で共有されるため、インポートしたタイルは既存タイルとIDが衝突しないよう
        // 空きIDへ振り直してからマップ/上層マップの参照を書き換える（id=0の「なし」だけは共通で再利用）。
        const existingIds = Object.keys(gameData.tiles).map(Number);
        let nextTileId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
        const tileIdRemap = new Map<number, number>([[0, 0]]);
        const mergedTiles = { ...gameData.tiles };
        for (const [idStr, tile] of Object.entries(manifest.tiles)) {
          const id = Number(idStr);
          if (id === 0) continue;
          const newId = nextTileId++;
          tileIdRemap.set(id, newId);
          mergedTiles[newId] = tile;
        }
        const remapGrid = (grid: number[][]) => grid.map(row => row.map(cell => tileIdRemap.get(cell) ?? 0));
        const remappedMap = remapGrid(manifest.map);
        const remappedOverlayMap = manifest.overlayMap ? remapGrid(manifest.overlayMap) : undefined;
        const remappedOverheadMap = manifest.overheadMap ? remapGrid(manifest.overheadMap) : undefined;
        const importedBgm = hydrateBgmFromRef(manifest.bgm);

        const idx = editSceneIdx;
        setGameData(prev => ({
          ...prev,
          tiles: mergedTiles,
          map: remappedMap,
          overlayMap: remappedOverlayMap,
          overheadMap: remappedOverheadMap,
          objects: manifest.objects,
          scenes: prev.scenes!.map((s, i) => i === idx ? {
            ...s,
            map: remappedMap,
            overlayMap: remappedOverlayMap,
            overheadMap: remappedOverheadMap,
            objects: manifest.objects,
            bgm: importedBgm,
          } : s),
        }));
        const eng = engineRef.current;
        eng.map = JSON.parse(JSON.stringify(remappedMap));
        eng.bullets = []; eng.enemyBullets = []; eng.entities = [];
        setIsPlaying(false); setSelectedObjId(null);
        setShowRpgenModal(false);
        setRpgenInputText('');
        return;
      }

      const preset = manifest.preset as PresetId;
      const base = clone(PRESETS[preset]);
      const data: PresetData = {
        ...base,
        engine: manifest.engine,
        name: manifest.name,
        gravity: manifest.gravity,
        friction: manifest.friction,
        player: manifest.player,
        tiles: manifest.tiles,
        map: manifest.map,
        overlayMap: manifest.overlayMap,
        overheadMap: manifest.overheadMap,
        objects: manifest.objects,
        mapBgRef: manifest.mapBgRef,
        bgm: hydrateBgmFromRef(manifest.bgm),
      };
      applyPresetData(preset as PresetId, data, manifest.name);
      setShowRpgenModal(false);
      setRpgenInputText('');
    } catch (err) { alert('RPGENの読み込みに失敗しました。'); console.error(err); }
  };

  // ── シーン管理ヘルパー ────────────────────────────────────────────────────
  /** エディタで選択シーンを切り替える。現在の map/objects を scenes に書き戻してから切り替え。 */
  const switchEditScene = useCallback((newIdx: number) => {
    setGameData(prev => {
      if (!prev.scenes) return prev;
      const scenes = prev.scenes.map((s, i) =>
        i === editSceneIdx ? { ...s, map: prev.map, overlayMap: prev.overlayMap, overheadMap: prev.overheadMap, objects: prev.objects } : s
      );
      const next = scenes[newIdx];
      return { ...prev, scenes, map: next.map, overlayMap: next.overlayMap, overheadMap: next.overheadMap, objects: next.objects };
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
        i === editSceneIdx ? { ...s, map: prev.map, overlayMap: prev.overlayMap, overheadMap: prev.overheadMap, objects: prev.objects } : s
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
    const emptyOverhead = emptyGridLike(emptyMap);
    const newScene: SceneDef = { id: newId, name: `シーン${(gameData.scenes?.length ?? 0) + 1}`, map: emptyMap, overlayMap: emptyOverlay, overheadMap: emptyOverhead, objects: [] };
    flushSceneEdits();
    setGameData(prev => {
      const scenes = [...(prev.scenes ?? []), newScene];
      return { ...prev, scenes, map: newScene.map, overlayMap: newScene.overlayMap, overheadMap: newScene.overheadMap, objects: newScene.objects };
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
      return { ...prev, scenes, map: scenes[nextIdx].map, overlayMap: scenes[nextIdx].overlayMap, overheadMap: scenes[nextIdx].overheadMap, objects: scenes[nextIdx].objects };
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

  /** 指定シーンを部分更新するユーティリティ（エンカウント設定編集で共用）。 */
  const updateSceneAt = useCallback((idx: number, patch: (s: SceneDef) => SceneDef) => {
    setGameData(prev => {
      if (!prev.scenes) return prev;
      return { ...prev, scenes: prev.scenes.map((s, i) => i === idx ? patch(s) : s) };
    });
  }, []);
  const addEncounterGroup = useCallback((idx: number) => {
    updateSceneAt(idx, s => ({ ...s, encounterGroups: [...(s.encounterGroups ?? []), { id: uid(), name: '', weight: 1, enemies: [] }] }));
  }, [updateSceneAt]);
  const updateEncounterGroup = useCallback((idx: number, groupId: string, patch: Partial<EncounterGroup>) => {
    updateSceneAt(idx, s => ({ ...s, encounterGroups: (s.encounterGroups ?? []).map(g => g.id === groupId ? { ...g, ...patch } : g) }));
  }, [updateSceneAt]);
  const removeEncounterGroup = useCallback((idx: number, groupId: string) => {
    updateSceneAt(idx, s => ({ ...s, encounterGroups: (s.encounterGroups ?? []).filter(g => g.id !== groupId) }));
  }, [updateSceneAt]);
  const addEncounterEnemy = useCallback((idx: number, groupId: string) => {
    updateSceneAt(idx, s => ({
      ...s, encounterGroups: (s.encounterGroups ?? []).map(g => g.id === groupId
        ? { ...g, enemies: [...g.enemies, { name: '', emoji: '👾', hp: 10, atk: 3, def: 0, exp: 1 }] } : g),
    }));
  }, [updateSceneAt]);
  const updateEncounterEnemy = useCallback((idx: number, groupId: string, enemyIdx: number, patch: Partial<EncounterEnemy>) => {
    updateSceneAt(idx, s => ({
      ...s, encounterGroups: (s.encounterGroups ?? []).map(g => g.id === groupId
        ? { ...g, enemies: g.enemies.map((en, i) => i === enemyIdx ? { ...en, ...patch } : en) } : g),
    }));
  }, [updateSceneAt]);
  const removeEncounterEnemy = useCallback((idx: number, groupId: string, enemyIdx: number) => {
    updateSceneAt(idx, s => ({
      ...s, encounterGroups: (s.encounterGroups ?? []).map(g => g.id === groupId
        ? { ...g, enemies: g.enemies.filter((_, i) => i !== enemyIdx) } : g),
    }));
  }, [updateSceneAt]);

  const tpl = objTemplate;
  const setTpl = (patch: Partial<ObjectDef>) => setObjTemplate(o => ({ ...o, ...patch }));
  const selObj = selectedObjId ? gameData.objects.find(o => o.id === selectedObjId) ?? null : null;
  const updObj = (patch: Partial<ObjectDef>) => { if (!selectedObjId) return; setGameData(p => ({ ...p, objects: p.objects.map(o => o.id === selectedObjId ? { ...o, ...patch } : o) })); };
  const delObj = () => { if (!selectedObjId) return; setGameData(p => ({ ...p, objects: p.objects.filter(o => o.id !== selectedObjId) })); setSelectedObjId(null); };
  const moveObj = (dc: number, dr: number) => { if (!selectedObjId) return; setGameData(p => ({ ...p, objects: p.objects.map(o => o.id === selectedObjId ? { ...o, col: o.col + dc, row: o.row + dr } : o) })); };
  const placeObj = () => { const p = engineRef.current.player; setGameData(prev => ({ ...prev, objects: [...prev.objects, { ...objTemplate, id: uid(), col: Math.floor((p.x + 12) / TILE_SIZE), row: Math.floor((p.y + 12) / TILE_SIZE) }] })); };

  // ── バッチ選択: Ctrl/Meta+クリックでトグル、Shift+クリックで範囲選択 ──
  const isYume25d = gameData.engine === 'yume25d';
  const orderedIds = isYume25d
    ? (gameData.layout25d?.billboards ?? []).map(b => b.id)
    : gameData.objects.map(o => o.id);
  const handleBatchClick = (id: string, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    if (e.ctrlKey || e.metaKey) {
      setBatchIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
      lastClickedIdRef.current = id;
    } else if (e.shiftKey && lastClickedIdRef.current) {
      const from = orderedIds.indexOf(lastClickedIdRef.current);
      const to = orderedIds.indexOf(id);
      if (from >= 0 && to >= 0) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        setBatchIds(prev => { const n = new Set(prev); for (let i = lo; i <= hi; i++) n.add(orderedIds[i]); return n; });
      }
    } else {
      // 通常クリック: バッチ選択をクリアして単一選択
      setBatchIds(new Set());
      lastClickedIdRef.current = null;
      if (isYume25d) { setSelectedObjId(null); setYume25dTalkTargetId(id); }
      else { setSelectedObjId(id); }
    }
  };
  const batchCount = batchIds.size;
  const clearBatch = () => setBatchIds(new Set());

  /** バッチ一括適用: ObjectDef 用 */
  const batchApplyObjects = (patch: Partial<ObjectDef>) => {
    if (batchCount === 0) return;
    setGameData(p => ({ ...p, objects: p.objects.map(o => batchIds.has(o.id) ? { ...o, ...patch } : o) }));
  };
  /** バッチ一括適用: Billboard25D 用 */
  const batchApplyBillboards = (patch: Partial<Billboard25D>) => {
    if (batchCount === 0) return;
    setGameData(p => ({
      ...p, layout25d: p.layout25d ? {
        ...p.layout25d, billboards: p.layout25d.billboards.map(b => batchIds.has(b.id) ? { ...b, ...patch } : b)
      } : p.layout25d
    }));
  };

  // ── タイトル／エンディング画面の更新ヘルパ ──
  const updTitle = (patch: Partial<TitleScreenConfig>) => setGameData(p => p.titleScreen ? ({ ...p, titleScreen: { ...p.titleScreen, ...patch } }) : p);
  const updEnding = (patch: Partial<EndingScreenConfig>) => setGameData(p => p.ending ? ({ ...p, ending: { ...p.ending, ...patch } }) : p);
  const updDeath = (patch: Partial<DeathScreenConfig>) => setGameData(p => p.deathScreen ? ({ ...p, deathScreen: { ...p.deathScreen, ...patch } }) : p);
  const startFromTitle = () => { setShowTitle(false); setIsPlaying(true); };

  // SELECT ボタンが押されたとき
  const handleSelectPress = () => {
    if (introOpen) return;
    // 編集・プレイ共通：速度切り替え (1x => 2x => 4x)
    setEditSpeedMult(prev => {
      const speeds = [1, 2, 4];
      return speeds[(speeds.indexOf(prev) + 1) % speeds.length];
    });
  };

  // START ボタンが押されたとき
  const handleStartPress = () => {
    if (introOpen) {
      enterPlayFromIntro();
      return;
    }
    if (isPlaying) {
      // STARTボタンでもちものを開閉
      setTouch('inv', true);
      setTimeout(() => setTouch('inv', false), 80);
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

  // アイテム使用（healHp/healMp + 任意効果）
  const useInventoryItem = (itemId: string) => {
    const it = (gameData.items ?? []).find(x => x.id === itemId);
    if (!it) return;
    const consumable = it.consumable ?? !!(it.healHp || it.healMp);
    // 効果適用
    let parts: string[] = [];
    const pr = progressRef.current;
    // フィールドでは常に主人公(self)対象。override があれば回復量を差し替える。敵対象アイテムはフィールドでは自己使用にフォールバック。
    const leadId = gameDataRef.current.battle?.party?.[0]?.id ?? '__self';
    const ov = it.overrides?.find(o => o.memberId === leadId);
    const healHp = ov?.healHp ?? it.healHp;
    const healMp = ov?.healMp ?? it.healMp;
    if (healHp) { const b = pr.hp; pr.hp = Math.min(pr.maxHp, pr.hp + healHp); parts.push(`HPが ${pr.hp - b} かいふく`); }
    if (healMp) { const b = pr.mp; pr.mp = Math.min(pr.maxMp, pr.mp + healMp); parts.push(`MPが ${pr.mp - b} かいふく`); }
    // 消費
    if (consumable) {
      const idx = invSlotsRef.current.indexOf(itemId);
      if (idx >= 0) {
        const copy = [...invSlotsRef.current]; copy.splice(idx, 1);
        setInvSlots(copy); invSlotsRef.current = copy;
        setInventory(p => { const n = { ...p }; n[itemId] = (n[itemId] ?? 0) - 1; if (n[itemId] <= 0) delete n[itemId]; return n; });
      }
    }
    playSfx(sfxRef.current.inn);
    playMenuConfirmSfx();
    forceHud(n => n + 1);
    setInvMenu(null); setInvDetail(null);
    const msg = it.useMessage || `${it.emoji} ${it.name}を つかった！${parts.length > 0 ? '\n' + parts.join('、') : ''}`;
    showGameMsg(msg, 'instant', () => { });
  };
  // アイテムすてる
  const discardInventoryItem = (itemId: string) => {
    const it = (gameData.items ?? []).find(x => x.id === itemId);
    if (it && it.discardable === false) { showGameMsg(`${it.name}は すてられない。`, 'instant', () => { }); return; }
    playMenuConfirmSfx();
    const idx = invSlotsRef.current.indexOf(itemId);
    if (idx >= 0) {
      const copy = [...invSlotsRef.current]; copy.splice(idx, 1);
      setInvSlots(copy); invSlotsRef.current = copy;
      setInventory(p => { const n = { ...p }; n[itemId] = (n[itemId] ?? 0) - 1; if (n[itemId] <= 0) delete n[itemId]; return n; });
    }
    setInvMenu(null); setInvDetail(null);
    showGameMsg(`${it?.emoji ?? '?'} ${it?.name ?? itemId}を すてた。`, 'instant', () => { });
  };
  return (
    <div className={embedded ? "flex flex-col h-full bg-[#07080b] text-gray-100 overflow-hidden" : "absolute inset-0 z-50 flex flex-col bg-[#07080b] text-gray-100 overflow-hidden"}
      onContextMenu={(e) => { const t = e.target as HTMLElement; if (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && t.tagName !== 'SELECT' && !t.isContentEditable) e.preventDefault(); }}>
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
          <VolumeControl />
          {/* 設定ボタン */}
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setSettingsOpen(v => !v)}
              className={`p-2 ${settingsOpen ? 'bg-gray-600 text-white' : 'bg-gray-700/50 text-gray-400 hover:text-white'} ${debugInvincible ? 'ring-1 ring-yellow-400' : ''}`}
              title="設定"
            >
              <Settings size={14} />
            </button>
            <input ref={importFileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
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
                <button
                  onClick={() => setShowCollisionBoundaries(v => !v)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold transition ${showCollisionBoundaries ? 'bg-purple-500/20 text-purple-300' : 'text-gray-400 hover:bg-gray-700'}`}
                >
                  🧱 衝突バウンダリ {showCollisionBoundaries ? 'ON' : 'OFF'}
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
                <button
                  onClick={() => { setShowRpgenModal(true); setSettingsOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:bg-gray-700 hover:text-white transition"
                >
                  <Upload size={13} />RPGENをインポート (テキスト)
                </button>
                {/* エンジン変更：編集中のゲームを別プリセット（別エンジン）へ切り替える。
                    タイトル・プレイヤーの見た目・BGMを引き継ぎ、マップは可能な範囲で変換する（ロッシー）。 */}
                {!playOnly && !isPlaying && (
                  <>
                    <div className="border-t border-gray-700 my-1" />
                    <div className="px-3 py-2">
                      <div className="text-[10px] font-bold text-gray-400 mb-1">🔧 エンジン変更</div>
                      <select
                        value={presetId}
                        onChange={e => {
                          const id = e.target.value as PresetId;
                          if (id === presetId) return;
                          if (!window.confirm(`「${PRESETS[id].name}」エンジンへ切り替えますか？\nマップはできるだけ変換して引き継ぎますが、完全には再現されません（元に戻すには再度切り替えても戻りません）`)) return;
                          switchEngine(id);
                          setSettingsOpen(false);
                        }}
                        className="w-full bg-gray-800 border border-gray-700 px-2 py-1.5 text-[11px] text-gray-200 outline-none"
                      >
                        {PRESET_ORDER.map(pid => (
                          <option key={pid} value={pid}>{PRESETS[pid].name}{pid === presetId ? '（現在）' : ''}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-[9px] text-gray-500 leading-relaxed">タイトル・見た目・BGMに加え、マップも近似変換で引き継ぎます（2D⇄3Dは一部が失われます）</p>
                    </div>
                  </>
                )}
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
          <button
            onClick={() => setShowHistory(true)}
            className="p-2 text-gray-400 hover:text-white bg-gray-700/50"
            title="履歴・スナップショット"
          >
            <History size={14} />
          </button>
          <button onClick={restart} className="p-2 text-gray-400 hover:text-white bg-gray-700/50" title="リスタート"><RotateCcw size={14} /></button>
          {!playOnly && (
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
                sceneTransRef.current = null;
                sceneFadeRef.current = null; // フェード遷移の途中で編集に戻った場合、次回プレイへ持ち越さない
                setBattle(null);
                battleRef.current = { active: false, entity: null, enemyName: '', enemyHp: 0, enemyMaxHp: 0, enemyAtk: 0, enemyDef: 0, enemyMoves: [], exp: 0, gold: 0, isBoss: false, mercy: 0, foes: [] };
                const pp = engineRef.current.player;
                const pw = gameData.player.w, ph = gameData.player.h;
                setEditScroll(Math.max(0, Math.min(((gameData.scroll?.worldCols ?? COLS) * TILE_SIZE - VIEW_W), pp.x + pw / 2 - VIEW_W / 2)));
                setEditScrollY(Math.max(0, Math.min(((gameData.scroll?.worldRows ?? ROWS) * TILE_SIZE - VIEW_H), pp.y + ph / 2 - VIEW_H / 2)));
                // プレイ中にシーンを切り替えていた場合、editSceneIdx はその都度 activeSceneIdxRef に追従するが、
                // エディタの作業バッファ（gameData.map/objects）は switchEditScene 経由でしか同期されないため、
                // ここで同期しないまま次回プレイの flushSceneEdits() が走ると「今 editSceneIdx が指しているシーン」に
                // 「実際には別シーン（最後に編集タブで開いていたシーン）の古い map/objects」を上書きしてしまい、
                // 次回プレイでそのシーンのオブジェクト座標が丸ごと入れ替わってしまう。編集に戻る瞬間に必ず同期する。
                if (gameData.scenes?.length) {
                  const activeIdx = Math.min(Math.max(0, activeSceneIdxRef.current), gameData.scenes.length - 1);
                  const activeScene = gameData.scenes[activeIdx];
                  if (activeScene && (activeIdx !== editSceneIdx || activeScene.objects !== gameData.objects)) {
                    setGameData(prev => ({ ...prev, map: activeScene.map, overlayMap: activeScene.overlayMap ?? prev.overlayMap, overheadMap: activeScene.overheadMap ?? prev.overheadMap, objects: activeScene.objects }));
                    setEditSceneIdx(activeIdx);
                  }
                }
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
          )}
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
        <div ref={canvasAreaRef} className={`flex flex-col items-center justify-center bg-black overflow-hidden ${isPlaying ? 'flex-1 max-h-[55vh] md:max-h-full' : 'flex-1 portrait:flex-none'}`}>
          <div className="relative mx-auto overflow-hidden ring-2 ring-gray-700 touch-none shrink-0"
            style={(() => {
              const { w, h } = canvasAreaSize;
              if (!w || !h) return { aspectRatio: `${PLAY_W}/${PLAY_H}`, width: 'auto', height: 'auto', maxWidth: `min(100%, ${PLAY_W}px)`, maxHeight: '100%' };
              const scale = Math.min(w / PLAY_W, h / PLAY_H, 1);
              return { width: `${PLAY_W * scale}px`, height: `${PLAY_H * scale}px` };
            })()}>
            {gameData.engine === 'yume25d' ? (
              <Yume25DMaker
                ref={yume25dMakerRef}
                layout={gameData.layout25d!}
                onLayoutChange={updater => setGameData(prev => prev.layout25d ? { ...prev, layout25d: updater(prev.layout25d) } : prev)}
                isPlaying={isPlaying}
                demo={introOpen}
                playerAppearance={{ emoji: gameData.player.emoji, color: gameData.player.color, spriteUrl: gameData.player.spriteUrl, spriteRef: gameData.player.spriteRef, minecraftSkin: gameData.player.minecraftSkin }}
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
                onDeath={() => {
                  const ds = deathScreenRef.current;
                  if (!ds || ds.style === 'none') {
                    // 死亡画面なし → エンジン側のリセットのみ（従来の動作）
                    yume25dMakerRef.current?.resetToStart();
                  } else {
                    setShowDeathScreen(true);
                  }
                }}
                onInteractBillboard={(billboardId) => {
                  const b = gameDataRef.current.layout25d?.billboards.find(bb => bb.id === billboardId);
                  if (!b || !b.pages || b.pages.length === 0) return false;
                  const page = findActivePage(b);
                  if (page && page.commands.length > 0) {
                    runEventCommands(b.id, page.commands);
                    return true;
                  }
                  return false;
                }}
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
                onTouchEnd={() => { isDraggingStartRef.current = false; }}
                onContextMenu={e => e.preventDefault()} />
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
                {!embedded && !playOnly && (
                  <button onClick={() => setShowTitle(false)} className="absolute top-2 right-2 z-20 p-1.5 bg-black/50 text-white/80 hover:text-white"><X size={16} /></button>
                )}
                <div className="relative z-10 w-full h-full flex flex-col items-center justify-center gap-3 px-6 text-center select-none"
                  style={{ color: gameData.titleScreen.textColor ?? '#ffffff' }}>
                  <h1 className="text-2xl sm:text-4xl font-pixel" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.85)' }}>{gameData.titleScreen.heading}</h1>
                  {gameData.titleScreen.subtitle && <p className="text-sm font-pixel opacity-90" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.85)' }}>{gameData.titleScreen.subtitle}</p>}
                  <div className="flex flex-col gap-2 mt-2 w-52 max-w-full">
                    {gameData.titleScreen.menu.map((mi, i) => (
                      <button key={i} onClick={() => { setTitleCursor(i); playMenuConfirmSfx(); startFromTitle(); }}
                        className={`px-4 py-2 border-2 font-pixel text-sm ${titleCursor === i ? 'bg-white/30 border-white' : 'bg-white/15 hover:bg-white/25 border-white/40'}`}>
                        {titleCursor === i ? '❤ ' : ''}{mi.label}
                      </button>
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
                  {gameData.ending.message && (
                    <p
                      className="text-sm font-pixel opacity-90 whitespace-pre-wrap break-words"
                      style={{ textShadow: '0 1px 6px rgba(0,0,0,0.85)', overflowWrap: 'anywhere' }}
                    >
                      {gameData.ending.message}
                    </p>
                  )}
                  <div className="flex gap-2 mt-3">
                    {gameData.titleScreen && (
                      <button onClick={() => { setShowEnding(false); setShowTitle(true); }}
                        className="px-4 py-2 bg-white/15 hover:bg-white/25 border-2 border-white/40 font-pixel text-sm">タイトルへ</button>
                    )}
                    <button onClick={() => {
                      setShowEnding(false);
                      if (playOnly) {
                        onClose();
                      }
                    }}
                      className="px-4 py-2 bg-white/15 hover:bg-white/25 border-2 border-white/40 font-pixel text-sm">とじる</button>
                  </div>
                </div>
              </div>
            )}

            {/* ── RPGEN インポート モーダル ── */}
            {showRpgenModal && (
              <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
                <div className="bg-gray-900 border border-gray-700 rounded p-4 w-full max-w-lg flex flex-col shadow-2xl">
                  <h3 className="text-sm font-bold text-gray-200 mb-2">RPGEN テキストをインポート</h3>
                  <textarea
                    value={rpgenInputText}
                    onChange={(e) => setRpgenInputText(e.target.value)}
                    placeholder="ここにRPGENのテキストデータを貼り付けてください"
                    className="w-full h-48 bg-gray-950 border border-gray-700 rounded p-2 text-xs text-gray-300 outline-none focus:border-blue-500 mb-3 resize-none"
                  />
                  <div className="flex justify-end gap-2 mt-auto">
                    <button
                      onClick={() => setShowRpgenModal(false)}
                      className="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 rounded transition"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={submitRpgenImport}
                      className="px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-500 rounded transition font-bold"
                    >
                      インポート実行
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── 入口ヒーロー：カルーセル式ゲーム選択 ── */}
            {introOpen && (() => {
              const PRESET_BOX_GRADIENT: Record<PresetId, string> = {
                onjReze: 'from-orange-950 via-gray-900 to-gray-950',
                dq: 'from-blue-950  via-gray-900 to-gray-950',
                mario: 'from-red-950   via-gray-900 to-gray-950',
                touhou: 'from-purple-950 via-gray-900 to-gray-950',
                rockman: 'from-cyan-950  via-gray-900 to-gray-950',
                undertale: 'from-rose-950 via-gray-950 to-black',
                deltarune: 'from-purple-950 via-gray-950 to-black',
                yume: 'from-violet-950 via-gray-950 to-black',
              };
              const PRESET_RING: Record<PresetId, string> = {
                onjReze: 'ring-orange-500/50',
                dq: 'ring-blue-500/50',
                mario: 'ring-red-500/50',
                touhou: 'ring-purple-500/50',
                rockman: 'ring-cyan-500/50',
                undertale: 'ring-rose-500/50',
                deltarune: 'ring-purple-500/50',
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
                <div className="bg-[#1a1a2e]/90 border-2 border-gray-400 px-4 py-3 font-pixel"
                  style={{ imageRendering: 'pixelated' }}>
                  <p
                    className="text-white text-sm leading-relaxed whitespace-pre-wrap break-words"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    {gameMsg.text}
                  </p>
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
                        style={{
                          padding: '9px 0', background: '#1060d0', color: '#fff', border: '2px solid #4090ff',
                          fontSize: 12, fontWeight: 'bold', letterSpacing: 2, cursor: 'pointer'
                        }}
                      >▶ RETRY</button>
                      <button
                        onClick={handleGameOverExit}
                        style={{
                          padding: '9px 0', background: '#333', color: '#aaa', border: '2px solid #555',
                          fontSize: 12, fontWeight: 'bold', letterSpacing: 2, cursor: 'pointer'
                        }}
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

            {/* ── yume25d 死亡画面 ── */}
            {showDeathScreen && gameData.deathScreen && (() => {
              const ds = gameData.deathScreen;
              const handleRespawn = () => {
                setShowDeathScreen(false);
                yume25dMakerRef.current?.resetToStart();
              };
              const handleDeathExit = () => {
                setShowDeathScreen(false);
                yume25dMakerRef.current?.resetToStart();
                if (gameData.titleScreen?.enabled) { restart(); setShowTitle(true); }
                else if (playOnly) { onClose(); }
                else { restart(); }
              };
              if (ds.style === 'minecraft') {
                return (
                  <div className="absolute inset-0 z-50 flex flex-col items-center justify-center font-pixel"
                    style={{ background: 'rgba(70,0,0,0.72)', animation: 'mcDeathFadeIn 0.6s ease-out' }}>
                    <style>{`
                      @keyframes mcDeathFadeIn { from { opacity:0 } to { opacity:1 } }
                      @keyframes mcDeathTitle { from { opacity:0; transform:translateY(-16px) } to { opacity:1; transform:translateY(0) } }
                      @keyframes mcDeathBtn { from { opacity:0; transform:scaleX(0.85) } to { opacity:1; transform:scaleX(1) } }
                    `}</style>
                    {/* 見出し */}
                    <p style={{
                      animation: 'mcDeathTitle 0.5s 0.15s ease-out both',
                      color: ds.textColor ?? '#ffffff',
                      fontSize: 28, fontWeight: 900, letterSpacing: 2,
                      textShadow: '2px 2px 0 #000, 3px 3px 8px rgba(0,0,0,0.9)',
                      marginBottom: 32, textAlign: 'center', maxWidth: 320, lineHeight: 1.3,
                    }}>{ds.heading}</p>
                    {/* ボタン */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 240, animation: 'mcDeathBtn 0.4s 0.35s ease-out both' }}>
                      <button id="yume-death-respawn" onClick={handleRespawn} style={{
                        padding: '10px 0', background: 'rgba(120,120,120,0.85)',
                        color: '#fff', border: '2px solid rgba(200,200,200,0.5)',
                        fontSize: 13, fontWeight: 'bold', letterSpacing: 1, cursor: 'pointer',
                        boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.2), inset 0 -2px 0 rgba(0,0,0,0.3)',
                        transition: 'background 0.1s',
                      }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(160,160,160,0.9)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(120,120,120,0.85)')}
                      >{ds.retryLabel}</button>
                      <button id="yume-death-exit" onClick={handleDeathExit} style={{
                        padding: '10px 0', background: 'rgba(120,120,120,0.85)',
                        color: '#fff', border: '2px solid rgba(200,200,200,0.5)',
                        fontSize: 13, fontWeight: 'bold', letterSpacing: 1, cursor: 'pointer',
                        boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.2), inset 0 -2px 0 rgba(0,0,0,0.3)',
                        transition: 'background 0.1s',
                      }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(160,160,160,0.9)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(120,120,120,0.85)')}
                      >{ds.exitLabel}</button>
                    </div>
                  </div>
                );
              }
              // style === 'gameOver' 汎用ゲームオーバー
              return (
                <div className="absolute inset-0 flex items-center justify-center bg-black/75 z-50">
                  <div className="bg-gray-950 border-2 border-red-600 px-8 py-7 text-center min-w-[200px] space-y-4 font-pixel">
                    <p className="text-red-400 text-2xl font-bold tracking-widest">{ds.heading}</p>
                    <div className="flex flex-col gap-2 pt-1">
                      <button id="yume-death-respawn2" onClick={handleRespawn}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-bold tracking-wide transition-colors">
                        ▶ {ds.retryLabel}
                      </button>
                      <button id="yume-death-exit2" onClick={handleDeathExit}
                        className="w-full py-2 bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-gray-200 text-sm font-bold tracking-wide transition-colors">
                        ✕ {ds.exitLabel}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

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
                const [, , , idxStr] = activePreviewKey.split('-');
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

            {/* ── イベント選択肢（十字キー上下・Z/Aで確定、初期カーソルは先頭） ── */}
            {eventChoice && !battle && (
              <div className="absolute inset-0 flex items-end justify-center pb-16 px-4 font-pixel">
                <div className="bg-[#1a1a2e] border-2 border-gray-400 p-3 shadow-2xl w-full max-w-xs">
                  <p
                    className="text-white text-sm leading-relaxed mb-2 whitespace-pre-wrap break-words"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    {eventChoice.text}
                  </p>
                  <div className="space-y-1.5">
                    {eventChoice.choices.map((ch, i) => (
                      <button key={i} onClick={() => { setEventChoiceCursor(i); eventChoice.onPick(i); }}
                        className={`w-full py-1.5 text-xs font-bold text-left px-3 whitespace-pre-wrap break-words ${eventChoiceCursor === i ? 'bg-gray-500 text-yellow-300' : 'bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white'}`}
                        style={{ overflowWrap: 'anywhere' }}>
                        {eventChoiceCursor === i ? '❤ ' : '  '}{ch.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── ターン制戦闘オーバーレイ ── */}
            {/* ── アンダーテール風戦闘（undertale）── */}
            {battle && battleStyle === 'undertale' && (() => {
              const pr = progressRef.current;
              const bd = gameData.battle!;
              const canMenu = battle.canAct && !battle.over && undertalePhase === 'menu';
              // 1体でも みのがし可能な敵がいれば MERCY まわりを光らせる
              const ready = battle.foes.some(f => !f.gone && foeSpareReady(f));
              return (
                <div className="absolute inset-0 flex flex-col p-2 sm:p-3 bg-black/70 font-pixel select-none">
                  {/* 敵（1〜3体を横並び）：HPゲージは被ダメージ時のみ一時的に表示（減少アニメーション付き）。
                      ブロック全体を固定の高さにして、ゲージ/ダメージ数値の表示有無でメッセージウィンドウの
                      位置がズレないようにする。撃破/みのがし済みの敵は消える。
                      フキダシ位置は敵の形状と並びに応じて上下左右を切り替える。 */}
                  {(() => {
                    const aliveIdxs = battle.foes.reduce<number[]>((a, f, i) => (f.gone && !dyingFoes[i]) ? a : [...a, i], []);
                    const gapCls = aliveIdxs.length >= 3 ? 'gap-8 sm:gap-14' : aliveIdxs.length >= 2 ? 'gap-6 sm:gap-10' : 'gap-3 sm:gap-6';
                    return (
                      <div className={`flex flex-row items-end justify-center ${gapCls} mt-4 sm:mt-6 shrink-0 h-28 sm:h-32`}>
                        {battle.foes.map((f, i) => {
                          const dying = dyingFoes[i];
                          if (f.gone && !dying) return null;
                          const pop = enemyDmgPopup[i];
                          const gauge = enemyGaugeAnim[i];
                          const shake = enemyShakeFx[i];
                          const fReady = foeSpareReady(f);
                          const targeting = undertaleMenu === 'target' && undertaleTargetCursor === i;
                          return (
                            <div key={i} className="relative flex flex-col items-center justify-end"
                              style={{
                                viewTransitionName: `enemy-slot-${i}`,
                                ...(dying ? { animation: 'enemyVaporize 0.65s ease-in forwards', pointerEvents: 'none' as const } : {}),
                              } as React.CSSProperties}>
                              <div className={`relative leading-none drop-shadow transition-transform ${undertalePhase === 'dodge' ? 'scale-90' : ''}`}>
                                {pop && (
                                  <div key={pop.id}
                                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-0.5 pointer-events-none font-misaki text-2xl sm:text-3xl whitespace-nowrap z-10"
                                    style={pop.miss ? {
                                      color: '#9ca3af',
                                      textShadow: '1px 1px #000, -1px -1px #000, 1px -1px #000, -1px 1px #000',
                                      animation: 'dmgPopUp 0.7s ease-out forwards',
                                    } : {
                                      color: '#000',
                                      textShadow: '1px 0 #e6231e, -1px 0 #e6231e, 0 1px #e6231e, 0 -1px #e6231e, 1px 1px #e6231e, -1px -1px #e6231e, 1px -1px #e6231e, -1px 1px #e6231e',
                                      animation: 'dmgPopUp 0.7s ease-out forwards',
                                    }}>
                                    {pop.text}
                                  </div>
                                )}
                                <div key={shake?.id ?? 'noshake'} style={shake ? { animation: 'enemyHitShake 0.4s ease-in-out' } : undefined}>
                                  {f.sprite ? (() => {
                                    const es = f.sprite;
                                    const anim = pop && !pop.miss && es.hurt ? es.hurt : fReady && es.spare ? es.spare : es.idle;
                                    return <BattleAnimSprite anim={anim} h={anim.h ? Math.min(80, anim.h * 1.25) : 64} />;
                                  })() : <span className="text-5xl sm:text-6xl">{f.emoji}</span>}
                                </div>
                                {gauge && (
                                  <div className="absolute left-1/2 top-1/3 -translate-x-1/2 w-16 h-1.5 overflow-hidden bg-gray-700/80 z-10">
                                    <div className="h-full bg-red-500 transition-all duration-500 ease-out" style={{ width: `${gauge.pct}%` }} />
                                  </div>
                                )}
                                {targeting && <span className="absolute -left-4 top-1/2 -translate-y-1/2 text-red-500 animate-pulse z-10">❤</span>}
                                {battleEffects.filter(be => be.foeIdx === i).map(be => (
                                  <div key={be.key} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
                                    <EffectSpriteAnim effect={be.effect} url={be.url} sizePx={72} onDone={() => removeBattleEffect(be.key)} />
                                  </div>
                                ))}
                                {renderEnemyBubble(i)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  {/* バトルボックス（白枠がシームレスに変形する） */}
                  <div className="flex-1 flex items-center justify-center min-h-0">
                    <div className="bg-black border-4 border-white relative overflow-hidden"
                      style={undertalePhase === 'dodge' ? {
                        aspectRatio: '1 / 1', width: 'auto', height: '100%', maxWidth: '184px', maxHeight: '184px',
                        transition: 'width 0.35s ease-in-out, height 0.35s ease-in-out',
                      } : {
                        width: 'min(100%, 440px)', height: 'min(128px, 32vh)', maxHeight: '100%',
                        transition: 'width 0.35s ease-in-out, height 0.35s ease-in-out',
                      }}>
                      {undertalePhase === 'dodge' ? (
                        <canvas ref={undertaleCanvasRef} width={176} height={176}
                          className="w-full h-full touch-none cursor-crosshair" style={{ imageRendering: 'pixelated' }}
                          onPointerMove={undertalePointerMove} onPointerDown={undertalePointerMove}
                          onContextMenu={e => e.preventDefault()} />
                      ) : undertalePhase === 'attack' ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center px-3 gap-1.5">
                          <div className="text-white/70 text-[10px]">タイミングよく タップ / Zキー！</div>
                          <div className="relative w-full h-10 border-2 border-white/80 bg-[#0c0c14] overflow-hidden">
                            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[14%] bg-emerald-500/25" />
                            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[4%] bg-emerald-400/70" />
                            <div ref={undertaleBarElRef} className="absolute inset-y-0 w-1 bg-white" style={{ left: '0%' }} />
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 p-1.5 sm:p-2.5 text-white text-[9px] sm:text-sm leading-snug sm:leading-relaxed overflow-hidden">
                          {undertaleMenu === 'root' && battle.log.slice(-3).map((l, i, arr) => (
                            <p key={i}>＊ {i === arr.length - 1 ? l.slice(0, logRevealCount) : l}</p>
                          ))}
                          {undertaleWaiting && undertaleMenu === 'root' && logRevealCount >= (battle.log.at(-1)?.length ?? 0)
                            && (enemyBubbles.size === 0 || [...enemyBubbles.values()].every(b => b.reveal >= b.text.length)) && (
                              <div className="absolute bottom-1 right-2 text-white animate-pulse">▼</div>
                            )}
                          {undertaleMenu === 'act' && (() => {
                            const acMoves = availableMoves(bd.moves, pr.level);
                            return (
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                              {acMoves.map((m, i) => (
                                <button key={`m${i}`} disabled={!canMenu || pr.mp < m.cost}
                                  onClick={() => { setUndertaleSubCursor(i); if (m.heal) { setUndertaleMenu('root'); doMove(m); } else beginTargetSelect({ kind: 'act', move: m }); }}
                                  className={`text-left disabled:opacity-40 text-[11px] sm:text-xs py-0.5 ${undertaleSubCursor === i ? 'text-yellow-300' : 'text-white hover:text-yellow-300'}`}>
                                  {undertaleSubCursor === i ? '❤ ' : '  '}{m.name}{m.cost > 0 && <span className="text-cyan-300 ml-1">{m.cost}</span>}
                                </button>
                              ))}
                              <button onClick={() => { setUndertaleSubCursor(acMoves.length); setUndertaleMenu('root'); }}
                                className={`text-left text-[11px] sm:text-xs py-0.5 ${undertaleSubCursor === acMoves.length ? 'text-yellow-300' : 'text-gray-400 hover:text-white'}`}>
                                {undertaleSubCursor === acMoves.length ? '❤ ' : '  '}もどる
                              </button>
                            </div>
                            );
                          })()}
                          {undertaleMenu === 'target' && (
                            <div className="flex flex-col gap-1">
                              <p className="text-gray-400 text-[10px] sm:text-xs">＊ だれに？</p>
                              {battle.foes.map((f, i) => !f.gone && (
                                <button key={i} disabled={!canMenu}
                                  onClick={() => { setUndertaleTargetCursor(i); undertaleTargetCursorRef.current = i; if (undertaleTargetSelRef.current) dispatchTarget(undertaleTargetSelRef.current, i); }}
                                  className={`text-left disabled:opacity-40 text-[11px] sm:text-xs py-0.5 ${undertaleTargetCursor === i ? 'text-yellow-300' : 'text-white hover:text-yellow-300'}`}>
                                  {undertaleTargetCursor === i ? '❤ ' : '  '}{f.name}
                                </button>
                              ))}
                            </div>
                          )}
                          {undertaleMenu === 'item' && (
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                              {usableItems().map((it, i) => (
                                <button key={it.id} disabled={!canMenu}
                                  onClick={() => { setUndertaleSubCursor(i); setUndertaleMenu('root'); useHealItem(it, true); }}
                                  className={`text-left disabled:opacity-40 text-[11px] sm:text-xs py-0.5 ${undertaleSubCursor === i ? 'text-yellow-300' : 'text-white hover:text-yellow-300'}`}>
                                  {undertaleSubCursor === i ? '❤ ' : '  '}{it.name} <span className="text-gray-400">×{inventory[it.id] ?? 0}</span>
                                </button>
                              ))}
                              {usableItems().length === 0 && <p className="text-gray-500">もちものが ない…</p>}
                              <button onClick={() => { setUndertaleSubCursor(usableItems().length); setUndertaleMenu('root'); }}
                                className={`text-left text-[11px] sm:text-xs py-0.5 ${undertaleSubCursor === usableItems().length ? 'text-yellow-300' : 'text-gray-400 hover:text-white'}`}>
                                {undertaleSubCursor === usableItems().length ? '❤ ' : '  '}もどる
                              </button>
                            </div>
                          )}
                          {undertaleMenu === 'mercy' && (
                            <div className="flex flex-col gap-1">
                              <button disabled={!canMenu} onClick={() => { setUndertaleSubCursor(0); setUndertaleMenu('root'); doSpare(); }}
                                className={`text-left text-[11px] sm:text-xs py-0.5 disabled:opacity-40 ${ready ? 'text-yellow-300 animate-pulse' : undertaleSubCursor === 0 ? 'text-yellow-300' : 'text-white hover:text-yellow-300'}`}>
                                {undertaleSubCursor === 0 ? '❤ ' : '  '}{bd.labels.mercy ?? 'みのがす'}{ready ? ' ✦' : ''}
                              </button>
                              <button disabled={!canMenu} onClick={() => { setUndertaleSubCursor(1); setUndertaleMenu('root'); doFlee(); }}
                                className={`text-left disabled:opacity-40 text-[11px] sm:text-xs py-0.5 ${undertaleSubCursor === 1 ? 'text-yellow-300' : 'text-white hover:text-yellow-300'}`}>
                                {undertaleSubCursor === 1 ? '❤ ' : '  '}{bd.labels.flee}
                              </button>
                              <button onClick={() => { setUndertaleSubCursor(2); setUndertaleMenu('root'); }}
                                className={`text-left text-[11px] sm:text-xs py-0.5 ${undertaleSubCursor === 2 ? 'text-yellow-300' : 'text-gray-400 hover:text-white'}`}>
                                {undertaleSubCursor === 2 ? '❤ ' : '  '}もどる
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* プレイヤーステータス：HPは数値だけでなく黄色いゲージでも見せる（アンダーテール本編準拠） */}
                  <div className="flex items-center justify-center flex-wrap gap-x-1.5 gap-y-0.5 text-[10px] sm:text-xs text-white mb-1.5 shrink-0">
                    <span>{bd.playerName}　LV {pr.level}</span>
                    <span className="text-red-400 font-bold">HP</span>
                    <div className="w-14 sm:w-20 h-2.5 shrink-0 bg-black border border-white/80 overflow-hidden">
                      <div className="h-full bg-yellow-300 transition-all duration-500 ease-out"
                        style={{ width: `${Math.max(0, Math.min(100, (pr.hp / pr.maxHp) * 100))}%` }} />
                    </div>
                    <span>{pr.hp}/{pr.maxHp}</span>
                    <span className="text-cyan-300 font-bold ml-1">MP</span>
                    <span>{pr.mp}/{pr.maxMp}</span>
                  </div>
                  {/* FIGHT / ACT / ITEM / MERCY（十字キー左右でカーソル移動、Z/Aで確定） */}
                  <div className="flex justify-center gap-1.5 sm:gap-2 shrink-0">
                    {([
                      { label: bd.labels.attack, sel: undertaleMenu === 'target', onClick: () => canMenu && beginTargetSelect({ kind: 'fight' }) },
                      { label: bd.labels.move, sel: undertaleMenu === 'act', onClick: () => canMenu && setUndertaleMenu(m => m === 'act' ? 'root' : 'act') },
                      { label: bd.labels.item ?? 'アイテム', sel: undertaleMenu === 'item', onClick: () => canMenu && setUndertaleMenu(m => m === 'item' ? 'root' : 'item') },
                      { label: bd.labels.mercy ?? 'みのがす', sel: undertaleMenu === 'mercy', mercy: true, onClick: () => canMenu && setUndertaleMenu(m => m === 'mercy' ? 'root' : 'mercy') },
                    ] as { label: string; sel: boolean; mercy?: boolean; onClick: () => void }[]).map((c, i) => (
                      <button key={i} onClick={() => { setUndertaleRootCursor(i); c.onClick(); }} disabled={!canMenu}
                        className={`flex-1 max-w-[104px] py-2 border-2 bg-black text-[10px] sm:text-xs font-bold tracking-wider transition
                          ${c.sel ? 'border-yellow-300 text-yellow-300' : c.mercy && ready ? 'border-yellow-400 text-yellow-300 animate-pulse' : undertaleMenu === 'root' && undertaleRootCursor === i ? 'border-yellow-300/70 text-yellow-300/90' : 'border-orange-400 text-orange-300 hover:border-yellow-300 hover:text-yellow-300'}
                          disabled:opacity-40`}>
                        {(c.sel || (undertaleMenu === 'root' && undertaleRootCursor === i)) ? '❤ ' : ''}{c.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── デルタルーン風戦闘 ──
                tlDR Engine（o_enc）のレイアウトを踏襲：左端に縦のTPバー、その隣にパーティの横向き
                スプライトが縦に並び、敵は右側。下部はメンバーごとのステータスボックス（自分の番の
                メンバーの上にコマンドボタン列が出る）＋全幅のテキスト/メニュー欄。
                弾幕よけ（バトルボックス）とこうげきタイミングバーはフィールド中央に重ねて表示する。 */}
            {battle && battleStyle === 'deltarune' && (() => {
              const bd = gameData.battle!;
              const canMenu = battle.canAct && !battle.over && undertalePhase === 'menu';
              // 1体でも みのがし可能な敵がいれば SPARE ボタンを光らせる
              const ready = battle.foes.some(f => !f.gone && foeSpareReady(f));
              const roster = dtParty();
              const curMember = bd.party?.[dtTurnIdx];
              const isSpellUser = (curMember?.spells ?? []).length > 0;
              const curSpells = availableSpells(curMember?.spells ?? [], dtTurnIdx, progressRef.current.level);
              // 呪文持ちメンバー（スージー/ラルセイ）の2番目のコマンドは「まほう」＝自分の呪文だけが並ぶ。
              // 呪文を持たないメンバー（クリス）だけが「こうどう」＝共通のACT技を使える（原作準拠：
              // tlDR Engine でも ACT は item_s_act としてクリスの spells 枠に入っている構造）。
              const curMoves = isSpellUser ? [] : availableMoves(bd.moves, progressRef.current.level);
              const memberColor = (i: number) => bd.party?.[i]?.color ?? '#ffffff';
              // コマンド5種（tlDR Engine のボタンスプライト。frame0=通常/frame1=選択中）。
              // 2番目は呪文持ちなら POWER（まほう）、それ以外は ACT（こうどう）の絵柄になる。
              const cmds = [
                { anim: TLDR_UI_SPRITES.btFight, label: bd.labels.attack, sel: undertaleMenu === 'target', onClick: () => canMenu && beginTargetSelect({ kind: 'fight' }) },
                { anim: isSpellUser ? TLDR_UI_SPRITES.btPower : TLDR_UI_SPRITES.btAct, label: isSpellUser ? 'まほう' : bd.labels.move, sel: undertaleMenu === 'act', onClick: () => canMenu && setUndertaleMenu(m => m === 'act' ? 'root' : 'act') },
                { anim: TLDR_UI_SPRITES.btItem, label: bd.labels.item ?? 'アイテム', sel: undertaleMenu === 'item', onClick: () => canMenu && setUndertaleMenu(m => m === 'item' ? 'root' : 'item') },
                { anim: TLDR_UI_SPRITES.btSpare, label: bd.labels.mercy ?? 'みのがす', sel: undertaleMenu === 'mercy', mercy: true, onClick: () => canMenu && setUndertaleMenu(m => m === 'mercy' ? 'root' : 'mercy') },
                { anim: TLDR_UI_SPRITES.btDefend, label: 'まもる', onClick: () => canMenu && doDefend() },
              ] as { anim: BattleSpriteAnim; label: string; sel?: boolean; mercy?: boolean; onClick: () => void }[];
              return (
                <div className="absolute inset-0 flex flex-col bg-black font-pixel select-none"
                  style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(147,51,234,0.12) 0 1px, transparent 1px 24px), repeating-linear-gradient(90deg, rgba(147,51,234,0.12) 0 1px, transparent 1px 24px)' }}>
                  {/* ── 上段：バトルフィールド ── */}
                  <div className="flex-1 relative min-h-0 overflow-hidden">
                    {/* TPバー（縦・左端） */}
                    <div className="absolute left-1 sm:left-2 top-2 bottom-2 flex flex-col items-center z-10 w-6">
                      <span className="text-white font-bold italic text-[10px] sm:text-xs leading-none">TP</span>
                      <div className="flex-1 w-2.5 sm:w-3 my-1 relative" style={{ background: '#8f1616' }}>
                        <div className={`absolute bottom-0 inset-x-0 transition-all duration-300 ${tp >= 100 ? 'bg-yellow-300' : 'bg-orange-500'}`} style={{ height: `${tp}%` }} />
                        {tp < 100 && <div className="absolute inset-x-0 h-0.5 bg-white transition-all duration-300" style={{ bottom: `${tp}%` }} />}
                      </div>
                      {tp >= 100
                        ? <span className="text-yellow-300 font-bold text-[9px] sm:text-[11px] leading-tight text-center">M<br />A<br />X</span>
                        : <span className="text-white font-bold text-[9px] sm:text-[11px] leading-none">{tp}<span className="text-[7px]">%</span></span>}
                    </div>
                    {/* パーティ（左・縦列） */}
                    <div className="absolute left-8 sm:left-11 inset-y-1 flex flex-col justify-center gap-0.5 z-0">
                      {roster.map((m, i) => {
                        const down = m.hp <= 0;
                        const sprites = bd.party?.[i]?.battleSprites;
                        const fx = dtAnimFx[m.id];
                        const kind: keyof PartyBattleSprites = down ? 'defeat'
                          : fx?.kind ?? (undertalePhase === 'attack' && i === dtTurnIdx ? 'attackReady'
                            : dtDefendedRef.current.has(m.id) ? 'defend' : 'idle');
                        const anim = sprites ? (sprites[kind] ?? sprites.idle) : null;
                        // defend は「まもる」中ずっと表示され続ける状態なので、1周したら最終フレームで
                        // 静止させる（ループさせると屈み込む動作を延々と繰り返して見えるため）。
                        const oneShot = kind === 'attack' || kind === 'act' || kind === 'spell' || kind === 'item' || kind === 'defend';
                        const dmgPop = dtDmgPopups[m.id];
                        return (
                          <div key={m.id} className="relative h-16 sm:h-24 flex items-end">
                            {anim
                              ? <BattleAnimSprite anim={anim} h={anim.h ? `clamp(40px, 11vw, ${Math.min(92, anim.h * 1.7)}px)` : 'clamp(32px, 9vw, 76px)'} once={oneShot}
                                className={down ? 'opacity-60' : ''} />
                              : <span className={`text-3xl sm:text-5xl ${down ? 'opacity-40 grayscale' : ''}`}>{m.emoji}</span>}
                            {/* 被弾ダメージ数値：キャラの頭上に敵側と同じ体裁（赤フチ・見崎フォント）で表示 */}
                            {dmgPop && (
                              <div key={dmgPop.id}
                                className="absolute -top-1 left-1/2 -translate-x-1/2 pointer-events-none font-misaki text-xl sm:text-2xl whitespace-nowrap z-10"
                                style={{
                                  color: '#000',
                                  textShadow: '1px 0 #e6231e, -1px 0 #e6231e, 0 1px #e6231e, 0 -1px #e6231e, 1px 1px #e6231e, -1px -1px #e6231e, 1px -1px #e6231e, -1px 1px #e6231e',
                                  animation: 'dmgPopUp 0.7s ease-out forwards',
                                }}>
                                {dmgPop.text}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* 敵（右側・1〜3体を縦に並べる。tlDR o_enc の敵スタックと同じ配置） */}
                    <div className={`absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-0 transition-transform ${undertalePhase === 'dodge' ? 'scale-90' : ''}`}>
                      {(() => {
                        const aliveCount = battle.foes.filter((f, i) => !f.gone || dyingFoes[i]).length;
                        // 複数体のときはスプライトを小さくして縦に収める
                        const sizeCap = aliveCount > 1 ? 84 : 160;
                        const sizeMul = aliveCount > 1 ? 1.4 : 2.4;
                        return battle.foes.map((f, i) => {
                          const dying = dyingFoes[i];
                          if (f.gone && !dying) return null;
                          const pop = enemyDmgPopup[i];
                          const gauge = enemyGaugeAnim[i];
                          const shake = enemyShakeFx[i];
                          const fReady = foeSpareReady(f);
                          const targeting = undertaleMenu === 'target' && undertaleTargetCursor === i;
                          return (
                            <div key={i} className="relative flex flex-col items-center"
                              style={{
                                viewTransitionName: `enemy-slot-dt-${i}`,
                                ...(dying ? { animation: 'enemyVaporize 0.65s ease-in forwards', pointerEvents: 'none' as const } : {}),
                              } as React.CSSProperties}>
                              <div className="relative leading-none">
                                {pop && (
                                  <div key={pop.id}
                                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-0.5 pointer-events-none font-misaki text-2xl sm:text-3xl whitespace-nowrap z-10"
                                    style={pop.miss ? {
                                      color: '#9ca3af',
                                      textShadow: '1px 1px #000, -1px -1px #000, 1px -1px #000, -1px 1px #000',
                                      animation: 'dmgPopUp 0.7s ease-out forwards',
                                    } : {
                                      color: '#000',
                                      textShadow: '1px 0 #e6231e, -1px 0 #e6231e, 0 1px #e6231e, 0 -1px #e6231e, 1px 1px #e6231e, -1px -1px #e6231e, 1px -1px #e6231e, -1px 1px #e6231e',
                                      animation: 'dmgPopUp 0.7s ease-out forwards',
                                    }}>
                                    {pop.text}
                                  </div>
                                )}
                                <div key={shake?.id ?? 'noshake'} style={shake ? { animation: 'enemyHitShake 0.4s ease-in-out' } : undefined}>
                                  {f.sprite ? (() => {
                                    const es = f.sprite;
                                    const anim = pop && !pop.miss && es.hurt ? es.hurt : fReady && es.spare ? es.spare : es.idle;
                                    const cap = Math.min(sizeCap, anim.h ? anim.h * sizeMul : 120);
                                    return <BattleAnimSprite anim={anim} h={`clamp(36px, ${aliveCount > 1 ? 12 : 20}vw, ${cap}px)`} />;
                                  })() : <span className={`${aliveCount > 1 ? 'text-5xl sm:text-6xl' : 'text-7xl sm:text-8xl'} leading-none drop-shadow`}>{f.emoji}</span>}
                                </div>
                                {gauge && (
                                  <div className="absolute left-1/2 top-1/3 -translate-x-1/2 w-20 h-1.5 overflow-hidden z-10" style={{ background: '#5b1010' }}>
                                    <div className="h-full bg-lime-400 transition-all duration-500 ease-out" style={{ width: `${gauge.pct}%` }} />
                                  </div>
                                )}
                                {fReady && (
                                  <img src={TLDR_UI_SPRITES.spareStar.frames[0]} alt="" draggable={false}
                                    className="absolute -top-1 -right-1 h-4 w-auto z-10" style={{ imageRendering: 'pixelated' }} />
                                )}
                                {targeting && <span className="absolute -left-4 top-1/2 -translate-y-1/2 text-red-500 animate-pulse z-10">❤</span>}
                                {battleEffects.filter(be => be.foeIdx === i).map(be => (
                                  <div key={be.key} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
                                    <EffectSpriteAnim effect={be.effect} url={be.url} sizePx={72} onDone={() => removeBattleEffect(be.key)} />
                                  </div>
                                ))}
                                {/* 攻撃予告セリフのフキダシ（敵の形状・位置に応じて自動配置） */}
                                {renderEnemyBubble(i)}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                    {/* 弾幕よけバトルボックス（メニュー中は出さない）。こうげきタイミングバーは
                        下段のテキスト/メニュー欄に重ねて表示する（参考実装の o_enc_fight 同様、
                        メッセージウィンドウの上にゲージが乗る配置）。 */}
                    {undertalePhase === 'dodge' && (
                      <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                        <div className="bg-black border-4 border-white relative overflow-hidden pointer-events-auto" style={{ aspectRatio: '1 / 1', width: 'auto', height: '100%', maxWidth: '184px', maxHeight: '184px' }}>
                          <canvas ref={undertaleCanvasRef} width={176} height={176}
                            className="w-full h-full touch-none cursor-crosshair" style={{ imageRendering: 'pixelated' }}
                            onPointerMove={undertalePointerMove} onPointerDown={undertalePointerMove}
                            onContextMenu={e => e.preventDefault()} />
                        </div>
                      </div>
                    )}
                  </div>
                  {/* ── 中段：メンバーステータスボックス（自分の番のメンバーの上にコマンドボタン列） ── */}
                  <div className="shrink-0 flex justify-center items-end px-1 gap-0.5">
                    {roster.map((m, i) => {
                      const active = i === dtTurnIdx;
                      const down = m.hp <= 0;
                      const col = memberColor(i);
                      const sprites = bd.party?.[i]?.battleSprites;
                      const hurtNow = dtAnimFx[m.id]?.kind === 'hurt';
                      const icon = hurtNow && sprites?.iconHurt ? sprites.iconHurt : sprites?.icon;
                      const hpPct = Math.max(0, Math.min(100, (m.hp / m.maxHp) * 100));
                      return (
                        <div key={m.id} className="flex flex-col w-[32%] max-w-[168px]">
                          {/* コマンドボタン（自分の番のときだけ現れる） */}
                          <div className="h-7 sm:h-8 flex justify-center items-end gap-0.5 overflow-hidden">
                            {active && canMenu && cmds.map((c, j) => {
                              const selected = c.sel || (undertaleMenu === 'root' && undertaleRootCursor === j);
                              return (
                                <button key={j} onClick={() => { setUndertaleRootCursor(j); c.onClick(); }} title={c.label} className="block shrink-0">
                                  <img src={c.anim.frames[selected ? 1 : 0]} alt={c.label} draggable={false}
                                    className={`h-6 sm:h-7 w-auto ${c.mercy && ready && !selected ? 'animate-pulse' : ''}`}
                                    style={{ imageRendering: 'pixelated' }} />
                                </button>
                              );
                            })}
                          </div>
                          <div className="bg-black px-1 py-0.5 border-x-2"
                            style={{
                              borderTop: `2px solid ${active ? col : '#2a1a45'}`,
                              borderBottom: `2px solid ${active ? col : '#2a1a45'}`,
                              borderLeftColor: active ? col : 'transparent',
                              borderRightColor: active ? col : 'transparent',
                            }}>
                            <div className="flex items-center gap-1">
                              {icon
                                ? <img src={icon.frames[0]} alt="" draggable={false} className="h-4 sm:h-5 w-auto" style={{ imageRendering: 'pixelated' }} />
                                : <span className="text-[11px] sm:text-sm">{m.emoji}</span>}
                              <span className={`text-[9px] sm:text-[11px] font-bold truncate ${down ? 'text-red-400' : 'text-white'}`}>{m.name}</span>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[7px] sm:text-[8px] text-white font-bold">HP</span>
                              <div className="flex-1 h-2 overflow-hidden" style={{ background: '#5b1010' }}>
                                <div className="h-full transition-all" style={{ width: `${hpPct}%`, background: col }} />
                              </div>
                              <span className={`text-[8px] sm:text-[9px] whitespace-nowrap ${down ? 'text-red-400 font-bold' : hpPct <= 30 ? 'text-yellow-300' : 'text-white'}`}>
                                {down ? 'DOWN' : `${m.hp}/${m.maxHp}`}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* ── 下段：テキスト／メニュー欄（全幅） ── */}
                  <div className="shrink-0 h-24 bg-black border-t-2 px-1.5 py-1 sm:px-2.5 sm:py-1.5 text-white text-[9px] sm:text-sm leading-relaxed relative overflow-hidden"
                    style={{ borderColor: '#3b2a55' }}>
                    {/* こうげきタイミングバー：参考実装（o_enc_fight / o_enc_fightstick）同様、
                        メッセージウィンドウの上にゲージを重ねる。全員のコマンド選択が終わった実行フェーズで
                        「たたかう」を選んだメンバーぶんの行が同時に現れ、全行の棒が並行して（開始をわずかに
                        ずらしながら）右端から左端の的へ流れる。的は左端固定。入力はキュー順の担当行に効く。 */}
                    {undertalePhase === 'attack' && dtAttackRowsRef.current.length > 0 && (
                      <div className="absolute inset-0 z-10 bg-black/95 flex flex-col justify-center gap-1 px-2 py-1.5 overflow-hidden">
                        {dtAttackRowsRef.current.map((memberIdx, row) => {
                          const member = roster[memberIdx];
                          if (!member) return null;
                          const col = memberColor(memberIdx);
                          const done = dtAttackDone[memberIdx];
                          const isCurrent = memberIdx === dtTurnIdx && !done;
                          return (
                            <div key={memberIdx} className="flex items-center gap-1.5"
                              style={{ animation: `dtGaugeSlideIn 0.22s ease-out ${row * 0.15}s both` }}>
                              <span className="text-base sm:text-lg w-5 text-center shrink-0">{member.emoji}</span>
                              <span className={`text-[8px] sm:text-[9px] w-8 shrink-0 tracking-wider font-bold ${done ? (done.result === 'miss' ? 'text-gray-500' : done.result === 'crit' ? 'text-yellow-300' : 'text-white') : isCurrent ? 'text-white' : 'text-white/40'}`}>
                                {done ? (done.result === 'miss' ? 'ハズレ' : done.result === 'crit' ? '会心！' : 'ヒット') : 'PRESS'}
                              </span>
                              <div className="relative flex-1 h-6 sm:h-7 border-2 overflow-hidden bg-[#0c0c14]"
                                style={{ borderColor: col, opacity: done?.result === 'miss' ? 0.5 : 1 }}>
                                {/* 的（左端固定）：外側=有効ゾーン、内側=パーフェクトゾーン */}
                                <div className="absolute inset-y-0" style={{ left: 0, width: '26%', background: `${col}22` }} />
                                <div className="absolute inset-y-0 border" style={{ left: '2%', width: '12%', borderColor: col, background: `${col}55` }} />
                                {/* 走る棒：右端→左端。未解決行は effect が毎フレーム left を書く。解決済みは止めた位置で凍結 */}
                                {done ? (
                                  <div className={`absolute inset-y-0 w-1 ${done.result === 'miss' ? 'bg-gray-600' : done.result === 'crit' ? 'bg-yellow-300' : 'bg-white'}`}
                                    style={{ left: `${Math.max(0, Math.min(1, done.pos)) * 100}%` }} />
                                ) : (
                                  <div ref={el => { dtStickElsRef.current[memberIdx] = el; }}
                                    className="absolute inset-y-0 w-1 bg-white" style={{ left: '100%' }} />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {undertaleMenu === 'root' && battle.log.slice(-3).map((l, i, arr) => (
                      <p key={i}>＊ {i === arr.length - 1 ? l.slice(0, logRevealCount) : l}</p>
                    ))}
                    {undertaleWaiting && undertaleMenu === 'root' && logRevealCount >= (battle.log.at(-1)?.length ?? 0)
                      && (enemyBubbles.size === 0 || [...enemyBubbles.values()].every(b => b.reveal >= b.text.length)) && (
                        <div className="absolute bottom-1 right-2 text-white animate-pulse">▼</div>
                      )}
                    {undertaleMenu === 'act' && (
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                        {curMoves.map((m, i) => (
                          <button key={`m${i}`} disabled={!canMenu}
                            onClick={() => { setUndertaleSubCursor(i); if (m.heal) { setUndertaleMenu('root'); doMove(m); } else beginTargetSelect({ kind: 'act', move: m }); }}
                            className={`text-left disabled:opacity-40 text-[11px] sm:text-xs py-0.5 ${undertaleSubCursor === i ? 'text-yellow-300' : 'text-white hover:text-yellow-300'}`}>
                            {undertaleSubCursor === i ? '❤ ' : '  '}{m.name}
                          </button>
                        ))}
                        {curSpells.map((sp, i) => {
                          const idx = curMoves.length + i;
                          return (
                            <button key={`s${i}`} disabled={!canMenu || tp < sp.tpCost}
                              onClick={() => { setUndertaleSubCursor(idx); if (sp.heal) { setUndertaleMenu('root'); castSpell(sp); } else beginTargetSelect({ kind: 'spell', spell: sp }); }}
                              className={`text-left disabled:opacity-40 text-[11px] sm:text-xs py-0.5 ${undertaleSubCursor === idx ? 'text-yellow-300' : 'text-white hover:text-yellow-300'}`}>
                              {undertaleSubCursor === idx ? '❤ ' : '  '}✨{sp.name}<span className="text-orange-400 ml-1">{sp.tpCost}%TP</span>
                            </button>
                          );
                        })}
                        <button onClick={() => { setUndertaleSubCursor(curMoves.length + curSpells.length); setUndertaleMenu('root'); }}
                          className={`text-left text-[11px] sm:text-xs py-0.5 ${undertaleSubCursor === curMoves.length + curSpells.length ? 'text-yellow-300' : 'text-gray-400 hover:text-white'}`}>
                          {undertaleSubCursor === curMoves.length + curSpells.length ? '❤ ' : '  '}もどる
                        </button>
                      </div>
                    )}
                    {undertaleMenu === 'target' && (
                      <div className="flex flex-col gap-1">
                        <p className="text-gray-400 text-[10px] sm:text-xs">＊ だれに？</p>
                        {battle.foes.map((f, i) => {
                          if (f.gone) return null;
                          const fHpPct = Math.max(0, Math.min(100, (f.hp / f.maxHp) * 100));
                          const fSpareReady = foeSpareReady(f);
                          const sel = undertaleTargetCursor === i;
                          return (
                            <button key={i} disabled={!canMenu}
                              onClick={() => { setUndertaleTargetCursor(i); undertaleTargetCursorRef.current = i; if (undertaleTargetSelRef.current) dispatchTarget(undertaleTargetSelRef.current, i); }}
                              className={`flex items-center gap-2 text-left disabled:opacity-40 text-[11px] sm:text-xs py-0.5 ${sel ? 'text-yellow-300' : 'text-white hover:text-yellow-300'}`}>
                              <span className="shrink-0">{sel ? '❤' : '  '}</span>
                              <span className="truncate">{f.name}</span>
                              <span className="flex items-center gap-1 ml-auto shrink-0">
                                <span className="text-[8px] sm:text-[9px] text-gray-300">HP</span>
                                <div className="w-10 h-1.5 overflow-hidden bg-gray-700">
                                  <div className={`h-full ${fHpPct <= 30 ? 'bg-red-500' : 'bg-lime-400'}`} style={{ width: `${fHpPct}%` }} />
                                </div>
                                {fSpareReady && <img src={TLDR_UI_SPRITES.spareStar.frames[0]} alt="みのがし可" draggable={false} className="h-3 w-auto" style={{ imageRendering: 'pixelated' }} />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {undertaleMenu === 'item' && (
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                        {usableItems().map((it, i) => (
                          <button key={it.id} disabled={!canMenu}
                            onClick={() => { setUndertaleSubCursor(i); setUndertaleMenu('root'); useHealItem(it, true); }}
                            className={`text-left disabled:opacity-40 text-[11px] sm:text-xs py-0.5 ${undertaleSubCursor === i ? 'text-yellow-300' : 'text-white hover:text-yellow-300'}`}>
                            {undertaleSubCursor === i ? '❤ ' : '  '}{it.name} <span className="text-gray-400">×{inventory[it.id] ?? 0}</span>
                          </button>
                        ))}
                        {usableItems().length === 0 && <p className="text-gray-500">もちものが ない…</p>}
                        <button onClick={() => { setUndertaleSubCursor(usableItems().length); setUndertaleMenu('root'); }}
                          className={`text-left text-[11px] sm:text-xs py-0.5 ${undertaleSubCursor === usableItems().length ? 'text-yellow-300' : 'text-gray-400 hover:text-white'}`}>
                          {undertaleSubCursor === usableItems().length ? '❤ ' : '  '}もどる
                        </button>
                      </div>
                    )}
                    {undertaleMenu === 'mercy' && (
                      <div className="flex flex-col gap-0.5">
                        <button disabled={!canMenu} onClick={() => { setUndertaleSubCursor(0); setUndertaleMenu('root'); doSpare(); }}
                          className={`text-left text-[11px] sm:text-xs py-0.5 disabled:opacity-40 ${ready ? 'text-yellow-300 animate-pulse' : undertaleSubCursor === 0 ? 'text-yellow-300' : 'text-white hover:text-yellow-300'}`}>
                          {undertaleSubCursor === 0 ? '❤ ' : '  '}{bd.labels.mercy ?? 'みのがす'}{ready ? ' ✦' : ''}
                        </button>
                        <button disabled={!canMenu} onClick={() => { setUndertaleSubCursor(1); setUndertaleMenu('root'); doFlee(); }}
                          className={`text-left disabled:opacity-40 text-[11px] sm:text-xs py-0.5 ${undertaleSubCursor === 1 ? 'text-yellow-300' : 'text-white hover:text-yellow-300'}`}>
                          {undertaleSubCursor === 1 ? '❤ ' : '  '}{bd.labels.flee}
                        </button>
                        <button onClick={() => { setUndertaleSubCursor(2); setUndertaleMenu('root'); }}
                          className={`text-left text-[11px] sm:text-xs py-0.5 ${undertaleSubCursor === 2 ? 'text-yellow-300' : 'text-gray-400 hover:text-white'}`}>
                          {undertaleSubCursor === 2 ? '❤ ' : '  '}もどる
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {battle && isPartyBattleStyle(battleStyle) && (() => {
              const roster = ptParty();
              const canSelect = battle.canAct && !battle.over && pt.phase === 'select';
              const curIdx = Math.min(pt.turnIdx, Math.max(0, roster.length - 1));
              const cur = roster[curIdx];
              const pickingFoe = canSelect && pt.menu === 'target' && !!pt.pending;
              const pickingMember = canSelect && pt.menu === 'member' && !!pt.pending;
              const logLines = battle.log.slice(-3);

              /** 被弾ダメージ数値のポップアップ（deltarune と同じ体裁）。 */
              const memberDmgPop = (id: string) => {
                const d = dtDmgPopups[id];
                return d ? (
                  <div key={d.id} className="absolute -top-2 left-1/2 -translate-x-1/2 pointer-events-none font-misaki text-xl sm:text-2xl whitespace-nowrap z-10"
                    style={{ color: '#000', textShadow: '1px 0 #e6231e, -1px 0 #e6231e, 0 1px #e6231e, 0 -1px #e6231e, 1px 1px #e6231e, -1px -1px #e6231e, 1px -1px #e6231e, -1px 1px #e6231e', animation: 'dmgPopUp 0.7s ease-out forwards' }}>
                    {d.text}
                  </div>
                ) : null;
              };

              /** 敵1体の描画（HPゲージ・ダメージ数値・撃破演出・milkyの疲労表情つき）。対象選択中はタップで確定。 */
              const renderFoe = (i: number, size: 'lg' | 'md') => {
                const f = battle.foes[i];
                if (!f) return null;
                const dying = dyingFoes[i];
                if (f.gone && !dying) return null;
                const pop = enemyDmgPopup[i];
                const gauge = enemyGaugeAnim[i];
                const tired = battleStyle === 'milky' && !f.gone && f.maxHp > 0 && f.hp / f.maxHp <= 0.3;
                const es = f.sprite;
                const emojiCls = size === 'lg' ? 'text-6xl sm:text-8xl' : 'text-5xl sm:text-6xl';
                const spriteCap = size === 'lg' ? 140 : 92;
                return (
                  <button key={i} disabled={!pickingFoe} onClick={() => ptPickTarget(i)}
                    className={`relative flex flex-col items-center ${pickingFoe ? 'cursor-pointer' : 'cursor-default'}`}
                    style={{
                      viewTransitionName: `enemy-slot-pt-${i}`,
                      ...(dying ? { animation: 'enemyVaporize 0.65s ease-in forwards', pointerEvents: 'none' as const } : {}),
                    } as React.CSSProperties}>
                    <div className="relative w-28 mb-0.5">
                      {pop && (
                        <div key={pop.id} className="absolute bottom-full left-1/2 -translate-x-1/2 mb-0.5 pointer-events-none font-misaki text-2xl sm:text-3xl whitespace-nowrap"
                          style={pop.miss ? {
                            color: '#9ca3af', textShadow: '1px 1px #000, -1px -1px #000, 1px -1px #000, -1px 1px #000', animation: 'dmgPopUp 0.7s ease-out forwards',
                          } : {
                            color: '#000', textShadow: '1px 0 #e6231e, -1px 0 #e6231e, 0 1px #e6231e, 0 -1px #e6231e, 1px 1px #e6231e, -1px -1px #e6231e, 1px -1px #e6231e, -1px 1px #e6231e', animation: 'dmgPopUp 0.7s ease-out forwards',
                          }}>
                          {pop.text}
                        </div>
                      )}
                      <div className="w-28 h-2 overflow-hidden mx-auto">
                        {gauge && (
                          <div className="w-full h-full" style={{ background: '#5b1010' }}>
                            <div className="h-full bg-lime-400 transition-all duration-500 ease-out" style={{ width: `${gauge.pct}%` }} />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={`relative leading-none ${tired ? 'grayscale-[45%] brightness-90' : ''} ${pickingFoe ? 'animate-pulse' : ''}`}>
                      {es ? (() => {
                        const anim = (pop && !pop.miss && es.hurt) ? es.hurt : (tired && es.hurt) ? es.hurt : es.idle;
                        return <BattleAnimSprite anim={anim} h={anim.h ? Math.min(spriteCap, anim.h * 2) : spriteCap} />;
                      })() : <span className={`${emojiCls} leading-none drop-shadow`}>{f.emoji}</span>}
                      {tired && <span className="absolute -right-2 -top-1 text-base sm:text-lg">💦</span>}
                    </div>
                    <div className={`mt-0.5 text-[10px] sm:text-xs ${pickingFoe ? 'text-yellow-300' : 'text-white'}`}>
                      {f.name}{tired ? ' 😩' : ''}
                    </div>
                  </button>
                );
              };

              /** ff/mother3: 戦場右側に立つメンバーの姿（味方対象選択中はタップで確定）。
               *  自分の番のメンバーは前へ一歩踏み出して見えるよう左へずらす（FF風のサイドビュー演出）。 */
              const memberFigure = (m: (typeof roster)[number], i: number) => {
                const down = ptIsDown(m);
                const active = canSelect && curIdx === i;
                const clickable = pickingMember && !down;
                const anim = m.battleSprites?.idle;
                // battleSprites 未設定なら、歩行グラを左向き静止フレームとして流用する（サイドビューなので左向き）。
                const walkFrame = !anim ? partyWalkFrame(m.spriteUrl, m.spriteRef, 'a', 56) : null;
                return (
                  <button key={m.id} disabled={!clickable} onClick={() => ptPickMember(m.id)}
                    className={`relative flex items-center gap-1 transition-transform duration-200 ${clickable ? 'animate-pulse cursor-pointer' : 'cursor-default'}`}
                    style={active ? { transform: 'translateX(-14px)' } : undefined}>
                    {active && <span className="text-yellow-300 text-[10px] sm:text-xs animate-pulse">▶</span>}
                    {anim
                      ? <BattleAnimSprite anim={anim} h={anim.h ? Math.min(64, anim.h * 1.5) : 52} className={down ? 'opacity-40 grayscale' : ''} />
                      : walkFrame
                        ? <div className={down ? 'opacity-40 grayscale' : ''}>{walkFrame}</div>
                        : <span className={`text-3xl sm:text-5xl ${down ? 'opacity-40 grayscale' : ''} ${active ? 'drop-shadow-[0_0_6px_rgba(250,204,21,0.6)]' : ''}`}>{m.emoji}</span>}
                    {memberDmgPop(m.id)}
                  </button>
                );
              };

              /** ff/mother3/milky 共通のコマンド窓の中身。ptMenuActions() の並びをそのまま描画し、
               *  キーボードのカーソル（pt.menuCursor）と常に同じ項目をハイライトする。選択中でなければログを流す。
               *  light=true（mother3）は黒文字＋赤ハイライト（クリーム色の窓に合わせる）、falseは白文字＋黄色ハイライト。 */
              const renderMenuWindow = (light = false) => {
                const baseText = light ? 'text-black' : 'text-white';
                const dimText = light ? 'text-black/50' : 'text-gray-500';
                const backText = light ? 'text-black/40 hover:text-black' : 'text-gray-400 hover:text-white';
                const selText = light ? 'text-red-700' : 'text-yellow-300';
                const hoverText = light ? 'hover:text-red-700 active:text-red-700' : 'hover:text-yellow-300 active:text-yellow-300';
                if (!canSelect) {
                  return <div className={`${baseText} text-[10px] sm:text-xs leading-relaxed`}>{logLines.map((l, i) => <p key={i}>{l}</p>)}</div>;
                }
                const actions = ptMenuActions();
                const heading = pt.menu === 'target' ? 'だれに？' : pt.menu === 'member' ? 'だれに つかう？' : null;
                return (
                  <div className="text-[11px] sm:text-xs">
                    {heading && <p className={`${selText} mb-0.5`}>{heading}</p>}
                    {!light && pt.menu === 'root' && cur && <p className={`${selText} mb-0.5 truncate`}>▶ {cur.name}</p>}
                    {actions.length === 0 && <p className={dimText}>（できることが ない）</p>}
                    {actions.map((a, i) => (
                      <button key={i} disabled={a.disabled} onClick={() => { ptPatch({ menuCursor: i }); a.onClick(); }}
                        className={`flex w-full justify-between gap-1 text-left py-0.5 disabled:opacity-40 ${a.label === 'もどる' ? backText : pt.menuCursor === i ? selText : `${baseText} ${hoverText}`} ${a.label.startsWith('⚡') ? 'font-bold text-rose-500 hover:text-rose-400 animate-pulse' : ''}`}>
                        <span className="truncate">{pt.menuCursor === i ? '▶ ' : '  '}{a.label}</span>
                        {a.sub && <span className={`shrink-0 ${light ? 'text-red-800/70' : battleStyle === 'milky' ? 'text-amber-300' : 'text-indigo-300'}`}>{a.sub}</span>}
                      </button>
                    ))}
                  </div>
                );
              };

              /** mother3: 実HPへ向けて回転する数値を EarthBound 風の1桁ずつの箱（オドメーター）で描く。 */
              const digitBoxes = (value: number, dir: 'up' | 'down' | null, width = 3) => {
                const str = String(Math.max(0, Math.round(value))).padStart(width, ' ');
                return str.split('').map((ch, i) => ch === ' '
                  ? <span key={i} className="inline-block w-3.5 h-4 sm:w-4 sm:h-5 bg-white border border-black/40 rounded-[2px]" />
                  : <DigitReel key={i} digit={Number(ch)} dir={dir} cellH={16} />);
              };

              // ── mother3（MOTHER3風）レイアウト：単色の戦場＋敵を中央に大きく、パーティは画面下に小さく、
              //    ステータスは丸窓＋1桁ずつの箱（オドメーター）で表示する。 ──
              if (battleStyle === 'mother3') {
                // フィールドに立つのは操作キャラ1人ぶんのスプライトだけ（原作同様、パーティは並べて立たせない）。
                // 見た目未設定（battleSprites/歩行グラともに無し）のときだけ絵文字にフォールバックする。
                const fieldMember = roster[0];
                const fieldAnim = fieldMember?.battleSprites?.idle;
                // battleSprites 未設定なら、歩行グラを正面向き（前を向いた）足踏みアニメとして流用する。
                const fieldWalkFrame = !fieldAnim && fieldMember ? partyWalkFrame(fieldMember.spriteUrl, fieldMember.spriteRef, 's', 40, true) : null;
                return (
                  <div className="absolute inset-0 flex flex-col font-pixel select-none overflow-hidden" style={{ background: '#c8621f' }}>
                    <div className="flex-1 relative min-h-0 flex items-center justify-center">
                      {/* コマンド窓：原作同様、右上に内容へフィットする小さいクリーム色の窓（黒文字＋赤ハイライト）。 */}
                      {canSelect && (
                        <div className="absolute top-1.5 right-1.5 max-w-[62%] bg-[#fbead0] border-[3px] border-black rounded-xl px-2 py-1 max-h-28 overflow-y-auto z-10">
                          {renderMenuWindow(true)}
                        </div>
                      )}
                      <div className="flex items-center justify-center gap-3">
                        {battle.foes.map((_, i) => renderFoe(i, battle.foes.length > 1 ? 'md' : 'lg'))}
                      </div>
                    </div>
                    <div className="shrink-0 px-2 pb-1 text-white text-[10px] sm:text-xs min-h-[1.2em] truncate text-center drop-shadow">{canSelect ? '' : battle.log.at(-1)}</div>
                    {/* パーティ人数ぶんだけ箱を並べて中央寄せする（1人なら1箱だけが画面中央に来る）。
                        1箱ぶんの幅は固定なので、人数が増えるほど行全体の幅が伸びて中央基準で左右へ広がる。
                        操作キャラのスプライトは常に「先頭の箱」の真上（その箱を基準に中央）に重ね、
                        箱を z 順で上に置くことでスプライトの下半分が箱の裏へ隠れる（原作同様、窓が手前）。 */}
                    <div className="shrink-0 flex justify-center gap-1 p-1.5 pt-8">
                      {roster.map((m, i) => {
                        const disp = Math.max(0, Math.round(ptDisplayHp(m)));
                        const critical = mother3CritRef.current.has(m.id);
                        return (
                          <div key={m.id} className="relative w-[92px] sm:w-[104px] shrink-0">
                            {i === 0 && fieldMember && (
                              <div className={`absolute bottom-full left-1/2 -translate-x-1/2 translate-y-1/2 z-0 ${ptIsDown(fieldMember) ? 'opacity-40 grayscale' : ''}`}>
                                {fieldAnim
                                  ? <BattleAnimSprite anim={fieldAnim} h={fieldAnim.h ? Math.min(48, fieldAnim.h) : 40} />
                                  : fieldWalkFrame ?? <span className="text-2xl sm:text-3xl leading-none">{fieldMember.emoji}</span>}
                              </div>
                            )}
                            <div className={`relative z-10 bg-[#fbead0] border-2 rounded-lg px-1 py-0.5 ${critical ? 'border-red-600 animate-pulse' : 'border-black'}`}>
                              <div className={`text-[8px] sm:text-[9px] font-bold truncate text-center ${canSelect && curIdx === i ? 'text-red-700' : 'text-black'}`}>{m.name}</div>
                              {/* HP/PP は同じ幅のラベル＋3桁ボックスで縦に並べ、桁の列が揃うようにする（原作のオドメーター窓）。 */}
                              <div className="flex items-center gap-0.5 mt-0.5">
                                <span className="text-[6px] sm:text-[7px] font-bold text-black w-3.5 shrink-0">HP</span>
                                <div className="flex gap-[1px]">{digitBoxes(disp, disp < m.hp ? 'up' : disp > m.hp ? 'down' : null, 3)}</div>
                              </div>
                              <div className="flex items-center gap-0.5 mt-0.5">
                                <span className="text-[6px] sm:text-[7px] font-bold text-black w-3.5 shrink-0">PP</span>
                                <div className="flex gap-[1px]">{digitBoxes(m.mp, null, 3)}</div>
                              </div>
                              {memberDmgPop(m.id)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {mother3CritRef.current.size > 0 && (
                      <div className="absolute inset-0 z-40 pointer-events-none flex items-start justify-center pt-6">
                        <div className="bg-red-700/90 text-white font-black text-sm sm:text-base px-3 py-1 rounded shadow-lg animate-pulse">CRITICAL DAMAGE!</div>
                      </div>
                    )}
                  </div>
                );
              }

              const shellBg = battleStyle === 'ff'
                ? { background: 'linear-gradient(180deg, #10102e 0%, #000016 65%, #000010 100%)' }
                : { background: 'linear-gradient(180deg, #34343f 0%, #17171f 100%)' };
              const menuWinCls = battleStyle === 'ff'
                ? 'bg-[#0a1c9c] border-[3px] border-white rounded shadow-[inset_0_0_0_2px_#6b8cff]'
                : 'bg-black/85 border-2 border-gray-400';

              // ── ff / milky 共通レイアウト ──
              return (
                <div className="absolute inset-0 flex flex-col font-pixel select-none overflow-hidden" style={shellBg}>
                  {/* 戦場 */}
                  <div className="flex-1 relative min-h-0 flex items-center px-3 sm:px-8 gap-2">
                    {/* milky: 完全1対1決闘。名前・HPは出さず、攻撃/防御/行動値/選択中の技だけを枠なしで常時表示する。
                        HPバーは別枠（敵＝画面左上／味方＝画面右下）に常時表示する。 */}
                    {battleStyle === 'milky' && battle.foes[0] && (() => {
                      const foe = battle.foes[0];
                      const foeHpPct = Math.max(0, Math.min(100, (foe.hp / foe.maxHp) * 100));
                      return (
                        <>
                          <div className="absolute right-1 top-1 z-10 px-2 py-1 text-right">
                            <div className="text-[9px] sm:text-[10px] text-gray-200">攻撃　{battleRef.current.enemyAtk}</div>
                            <div className="text-[9px] sm:text-[10px] text-gray-200">防御　{battleRef.current.enemyDef}</div>
                            <div className="text-[9px] sm:text-[10px] text-amber-300">行動　{Math.round(milkyAvRef.current['f:0'] ?? 0)}</div>
                            <div className="text-[9px] sm:text-[10px] text-white">技　{milkyEnemySkillName || '－'}</div>
                          </div>
                          {/* 敵HPバー：画面左上に固定表示（枠なし・数値なし） */}
                          <div className="absolute left-1 top-1 z-10 w-24 sm:w-32 h-2 bg-gray-900/70 overflow-hidden">
                            <div className="h-full bg-red-500 transition-all" style={{ width: `${foeHpPct}%` }} />
                          </div>
                        </>
                      );
                    })()}
                    {battleStyle === 'milky' && (() => {
                      const m = roster.find(mm => mm.hp > 0) ?? roster[0];
                      if (!m) return null;
                      const hpPct = Math.max(0, Math.min(100, (m.hp / m.maxHp) * 100));
                      return (
                        <>
                          <div className="absolute left-1 bottom-1 z-10 px-2 py-1 text-left">
                            <div className="text-[9px] sm:text-[10px] text-gray-200">攻撃　{m.atk}</div>
                            <div className="text-[9px] sm:text-[10px] text-gray-200">防御　{m.def}</div>
                            <div className="text-[9px] sm:text-[10px] text-amber-300">行動　{Math.round(milkyAvRef.current[`m:${m.id}`] ?? 0)}</div>
                            <div className="text-[9px] sm:text-[10px] text-white">技　{milkyAllySkillName || '－'}</div>
                            {memberDmgPop(m.id)}
                          </div>
                          {/* 味方HPバー：画面右下に固定表示（枠なし・数値なし） */}
                          <div className="absolute right-1 bottom-1 z-10 w-24 sm:w-32 h-2 bg-gray-900/70 overflow-hidden">
                            <div className="h-full bg-green-400 transition-all" style={{ width: `${hpPct}%` }} />
                          </div>
                        </>
                      );
                    })()}
                    <div className={`flex ${battle.foes.length > 1 ? 'flex-col' : ''} items-center justify-center gap-1.5 ${battleStyle === 'milky' ? 'mx-auto' : 'mr-auto'}`}>
                      {battle.foes.map((_, i) => renderFoe(i, battle.foes.length > 1 ? 'md' : 'lg'))}
                    </div>
                    {battleStyle !== 'milky' && (
                      <div className="flex flex-col items-end justify-center gap-1 ml-auto">
                        {roster.map((m, i) => memberFigure(m, i))}
                      </div>
                    )}
                  </div>
                  {/* ログ1行（選択中でも直近の出来事が見えるように） */}
                  <div className="shrink-0 px-2 pb-0.5 text-white text-[10px] sm:text-xs min-h-[1.3em] truncate">{canSelect ? battle.log.at(-1) : ''}</div>
                  {/* 下段：milkyはコマンド選択中のみ枠つきウィンドウ、それ以外（技めくり中など）は枠なしのプレーン表示。
                      ff/mother3系は従来どおりコマンド窓＋ステータス窓を横並びで常時表示する。 */}
                  {battleStyle === 'milky' ? (
                    pt.menu === 'root' ? (
                      <div className="shrink-0 flex justify-center p-1.5">
                        <div className={`${menuWinCls} w-full max-w-[230px] px-2 py-1.5 overflow-y-auto max-h-32`}>{renderMenuWindow()}</div>
                      </div>
                    ) : (
                      <div className="shrink-0 px-2 py-1.5">
                        {!canSelect && (
                          <div className="text-[10px] sm:text-xs text-white leading-relaxed">{logLines.map((l, i) => <p key={i}>{l}</p>)}</div>
                        )}
                        {canSelect && pt.menu === 'skill' && (() => {
                          const moves = milkySkillList();
                          if (!moves.length) return null;
                          const idx = Math.min(pt.menuCursor, moves.length - 1);
                          const mv = moves[idx];
                          const actor = roster[Math.min(pt.turnIdx, Math.max(0, roster.length - 1))];
                          const cycle = (d: number) => { const n = ((idx + d) % moves.length + moves.length) % moves.length; ptPatch({ menuCursor: n }); };
                          return (
                            <div className="text-[11px] sm:text-xs text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => cycle(-1)} className="text-white hover:text-yellow-300 px-1">←</button>
                                <span className="text-yellow-300 truncate">{actor?.name ?? ''}({idx + 1}/{moves.length})</span>
                                <button onClick={() => cycle(1)} className="text-white hover:text-yellow-300 px-1">→</button>
                              </div>
                              <button disabled={mv.disabled} onClick={mv.onClick}
                                className={`mt-0.5 ${mv.disabled ? 'text-gray-500' : 'text-white hover:text-yellow-300'}`}>
                                {mv.name}
                              </button>
                              <button onClick={() => ptPatch({ menu: 'root' })} className="block mx-auto mt-1 text-gray-400 hover:text-white text-[10px]">もどる</button>
                            </div>
                          );
                        })()}
                        {canSelect && pt.menu !== 'skill' && (
                          <div className="text-[11px] sm:text-xs">{renderMenuWindow()}</div>
                        )}
                      </div>
                    )
                  ) : (
                    <div className="shrink-0 flex gap-1 p-1.5 items-stretch">
                      <div className={`${menuWinCls} w-[44%] max-w-[230px] px-2 py-1.5 overflow-y-auto max-h-32`}>{renderMenuWindow()}</div>
                      <div className={`${menuWinCls} flex-1 min-w-0 px-2 py-1.5 overflow-y-auto max-h-32`}>
                        {battleStyle === 'ff' && (
                          <div className="flex flex-col justify-center gap-0.5 h-full text-[10px] sm:text-xs">
                            <div className="flex items-center gap-2 text-indigo-200 text-[9px] sm:text-[10px]">
                              <span className="flex-1" />
                              <span className="w-16 text-right">ＨＰ</span>
                              <span className="w-10 text-right">ＭＰ</span>
                            </div>
                            {roster.map((m, i) => (
                              <div key={m.id} className="relative flex items-center gap-2 leading-tight">
                                <span className={`flex-1 truncate ${canSelect && curIdx === i ? 'text-yellow-300' : m.hp <= 0 ? 'text-red-400' : 'text-white'}`}>{m.name}</span>
                                <span className={`w-16 text-right ${m.hp <= 0 ? 'text-red-400 font-bold' : m.hp / m.maxHp <= 0.25 ? 'text-yellow-300' : 'text-white'}`}>{m.hp}/{m.maxHp}</span>
                                <span className="w-10 text-right text-indigo-200">{m.mp}</span>
                                {memberDmgPop(m.id)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {battle && !isDodgeBattleStyle(battleStyle) && !isPartyBattleStyle(battleStyle) && (
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
                      {usableItems().map((it, i) => (
                        <button key={it.id} onClick={() => { setBattleItemsCursor(i); useHealItem(it, true); }}
                          className={`w-full flex justify-between items-center px-3 py-1.5 text-[11px] font-bold ${battleItemsCursor === i ? 'bg-gray-500 text-yellow-300' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}>
                          <span>{battleItemsCursor === i ? '❤ ' : '  '}{it.emoji} {it.name}</span>
                          <span className="text-gray-400">×{inventory[it.id] ?? 0}</span>
                        </button>
                      ))}
                      <button onClick={() => { setBattleItemsCursor(usableItems().length); setBattleItemsOpen(false); }}
                        className={`w-full py-1.5 text-[11px] font-bold ${battleItemsCursor === usableItems().length ? 'bg-gray-600 text-yellow-300' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}>
                        {battleItemsCursor === usableItems().length ? '❤ ' : '  '}もどる
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {([
                        { label: gameData.battle?.labels.attack, disabled: false, onClick: doAttack, cls: 'bg-gray-700 hover:bg-gray-600 text-white' },
                        { label: gameData.battle?.labels.flee, disabled: false, onClick: doFlee, cls: 'bg-gray-700 hover:bg-gray-600 text-white' },
                        ...(gameData.battle?.moves ?? []).map(m => ({
                          label: <>{m.name}{m.cost > 0 && <span className={`ml-1 ${m.mercy != null ? 'text-teal-300' : 'text-indigo-300'}`}>{m.cost}</span>}</>,
                          disabled: progressRef.current.mp < m.cost,
                          onClick: () => doMove(m),
                          cls: m.mercy != null ? 'bg-teal-700 hover:bg-teal-600 text-white' : 'bg-indigo-700 hover:bg-indigo-600 text-white',
                        })),
                        ...(gameData.battle?.labels.mercy ? [{
                          label: gameData.battle.labels.mercy, disabled: false, onClick: doSpare,
                          cls: spareReady(battle) ? 'bg-yellow-500 hover:bg-yellow-400 text-black animate-pulse' : 'bg-yellow-900 hover:bg-yellow-800 text-yellow-200/70',
                        }] : []),
                        ...(usableItems().length > 0 ? [{
                          label: gameData.battle?.labels.item ?? 'どうぐ', disabled: false, onClick: () => setBattleItemsOpen(true),
                          cls: 'bg-amber-700 hover:bg-amber-600 text-white',
                        }] : []),
                      ] as { label: React.ReactNode; disabled: boolean; onClick: () => void; cls: string }[]).map((c, i) => (
                        <button key={i} onClick={() => { setClassicBattleCursor(i); c.onClick(); }} disabled={c.disabled}
                          className={`py-1.5 disabled:opacity-40 text-[11px] sm:text-xs font-bold ${classicBattleCursor === i ? 'ring-2 ring-yellow-300 ring-inset' : ''} ${c.cls}`}>
                          {c.label}
                        </button>
                      ))}
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
                    {shopModal.items.map((si, i) => {
                      const itemDef = (gameData.items ?? []).find(it => it.id === si.itemId);
                      const canAfford = (progressRef.current.gold ?? 0) >= si.price;
                      return (
                        <button
                          key={si.itemId}
                          disabled={!canAfford}
                          onClick={() => {
                            setShopCursor(i);
                            const slots = [...invSlotsRef.current];
                            if (slots.length >= MAX_INVENTORY) {
                              showGameMsg('これいじょう もちものは もてない！', 'instant', () => { });
                              return;
                            }
                            progressRef.current.gold = (progressRef.current.gold ?? 0) - si.price;
                            slots.push(si.itemId);
                            setInvSlots(slots); invSlotsRef.current = slots;
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
                          className={`w-full flex justify-between items-center px-3 py-2 text-xs ${shopCursor === i ? 'bg-gray-600' : 'bg-gray-700'} ${canAfford ? 'text-white active:bg-yellow-600/30' : 'bg-gray-800 text-gray-500'}`}
                        >
                          <span>{shopCursor === i ? '❤ ' : '  '}{itemDef?.emoji ?? '?'} {itemDef?.name ?? si.itemId}</span>
                          <span className={canAfford ? 'text-yellow-400' : 'text-gray-600'}>{si.price} G</span>
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => { setShopCursor(shopModal.items.length); setShopModal(null); }}
                    className={`mt-3 w-full py-2 text-xs ${shopCursor === shopModal.items.length ? 'bg-gray-600 text-yellow-300' : 'bg-gray-700 text-gray-300 active:bg-gray-600'}`}>
                    {shopCursor === shopModal.items.length ? '❤ ' : '  '}とじる
                  </button>
                </div>
              </div>
            )}

            {/* ── アンダーテール風インベントリ（フィールドのみ） ── */}
            {invOpen && !invMenu && !invDetail && !battle && (
              <div className="absolute inset-0 flex items-center justify-center p-4 z-30 bg-black/50" onClick={() => setInvOpen(false)}>
                <div className="bg-black border-4 border-white p-3 sm:p-4 w-full max-w-sm font-pixel" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between text-white text-xs sm:text-sm mb-2">
                    <span className="font-bold tracking-widest">ITEM</span>
                    <span>
                      {invSlots.length}/{MAX_INVENTORY}
                      {gameData.battle && <span className="ml-3 text-yellow-300">{progressRef.current.gold ?? 0} G</span>}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 min-h-[4em] max-h-56 overflow-y-auto">
                    {invSlots.length === 0 && <p className="col-span-2 text-[11px] text-gray-500">なにも もっていない。</p>}
                    {invSlots.map((itemId, idx) => {
                      const it = (gameData.items ?? []).find(x => x.id === itemId);
                      if (!it) return null;
                      return (
                        <button key={`${itemId}-${idx}`} onClick={() => { playMenuConfirmSfx(); setInvCursor(idx); setInvMenu({ slotIdx: idx }); setInvMenuCursor(0); }}
                          className={`text-left active:text-yellow-300 text-[11px] sm:text-xs py-0.5 truncate ${invCursor === idx ? 'text-yellow-300' : 'text-white hover:text-yellow-300'}`}>
                          {invCursor === idx ? '❤ ' : '  '}{it.emoji} {it.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {/* ── アイテムアクションメニュー（Use/Details/Discard） ── */}
            {invMenu && !invDetail && (
              <div className="absolute inset-0 flex items-center justify-center p-4 z-30 bg-black/50" onClick={() => { playMenuCancelSfx(); setInvMenu(null); invMenuRef.current = null; }}>
                <div className="bg-black border-4 border-white p-3 sm:p-4 w-full max-w-xs font-pixel" onClick={e => e.stopPropagation()}>
                  {(() => {
                    const itemId = invSlots[invMenu.slotIdx];
                    const it = (gameData.items ?? []).find(x => x.id === itemId);
                    if (!it) return <p className="text-gray-500 text-xs">? ふめい</p>;
                    const usable = !!(it.healHp || it.healMp || it.damage || it.targetType);
                    const discardable = it.discardable !== false;
                    const actions: { key: string; label: string; onClick: () => void }[] = [];
                    if (usable) actions.push({ key: 'use', label: 'つかう', onClick: () => useInventoryItem(itemId) });
                    actions.push({ key: 'detail', label: 'せつめい', onClick: () => { playMenuConfirmSfx(); setInvDetail(itemId); invDetailRef.current = itemId; } });
                    if (discardable) actions.push({ key: 'discard', label: 'すてる', onClick: () => discardInventoryItem(itemId) });
                    actions.push({ key: 'back', label: 'もどる', onClick: () => { playMenuCancelSfx(); setInvMenu(null); invMenuRef.current = null; } });
                    return (
                      <>
                        <div className="text-white font-bold text-xs sm:text-sm mb-2">{it.emoji} {it.name}</div>
                        <div className="flex flex-col gap-1">
                          {actions.map((a, i) => (
                            <button key={a.key} onClick={() => { setInvMenuCursor(i); a.onClick(); }}
                              className={`text-left text-[11px] sm:text-xs py-0.5 ${a.key === 'back' ? (invMenuCursor === i ? 'text-yellow-300' : 'text-gray-400 hover:text-white') : (invMenuCursor === i ? 'text-yellow-300' : 'text-white hover:text-yellow-300')}`}>
                              {invMenuCursor === i ? '❤ ' : '  '}{a.label}
                            </button>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
            {/* ── アイテム詳細 ── */}
            {invDetail && (
              <div className="absolute inset-0 flex items-center justify-center p-4 z-30 bg-black/50" onClick={() => { playMenuCancelSfx(); setInvDetail(null); invDetailRef.current = null; }}>
                <div className="bg-black border-4 border-white p-3 sm:p-4 w-full max-w-xs font-pixel" onClick={e => e.stopPropagation()}>
                  {(() => {
                    const it = (gameData.items ?? []).find(x => x.id === invDetail);
                    if (!it) return <p className="text-gray-500 text-xs">? ふめい</p>;
                    return (
                      <>
                        <div className="text-white font-bold text-xs sm:text-sm mb-1">{it.emoji} {it.name}</div>
                        <div className="text-gray-300 text-[11px] sm:text-xs mb-3 leading-relaxed whitespace-pre-wrap">
                          {it.description || 'せつめいのない どうぐ。'}
                        </div>
                        <button onClick={() => { playMenuCancelSfx(); setInvDetail(null); invDetailRef.current = null; }}
                          className="w-full py-1.5 border-2 border-white/40 text-gray-400 hover:text-white hover:border-white text-[11px] font-bold">とじる</button>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
            {/* 操作方法のナビ */}
            {showControlGuide && (
              <div className="absolute inset-0 flex items-start justify-start p-3 z-50 pointer-events-none transition-opacity duration-300">
                <div className="bg-black border-2 border-white p-3 max-w-xs text-white font-pixel pointer-events-auto">
                  <h4 className="text-yellow-300 font-bold text-xs mb-2">操作方法</h4>
                  <ul className="text-[10px] text-white leading-relaxed list-disc list-inside marker:text-gray-500">
                    <li>移動 … [矢印キー] / [WASD]</li>

                    {gameData.engine === 'action' && (
                      <>
                        <li>ジャンプ … [Space] / [Z]</li>
                        <li>ショット / 攻撃 … [X]</li>
                        <li>ダッシュ … [Shift] / [C]</li>
                        {gameData.id === 'rockman' && <li>武器切替 … [Q] / [E]</li>}
                      </>
                    )}

                    {gameData.engine === 'rpg' && (
                      <>
                        <li>決定 / 調べる / 話す … [Z] / [Enter]</li>
                        <li>キャンセル … [X]</li>
                      </>
                    )}

                    {gameData.engine === 'touhou' && (
                      <>
                        <li>ショット … [Z]</li>
                        <li>ボム … [X]</li>
                        <li>低速移動 … [Shift]</li>
                      </>
                    )}

                    {gameData.engine === 'onjReze' && (
                      <>
                        <li>剣攻撃 … [Z]</li>
                        <li>ボム設置 … [C]</li>
                        <li>ボム投擲 … [X]</li>
                        <li>首爆弾投擲 … [V]</li>
                      </>
                    )}
                  </ul>
                  <div className="mt-2 text-[9px] text-gray-400 border-t border-white/30 pt-1.5">
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
            (() => {
              const isFixedController = fixedControls && (isPlaying || playOnly);
              const controllerEl = (
                <div className={
                  isFixedController
                    ? "fixed inset-x-0 bottom-0 z-[70] flex flex-col p-4 pb-safe select-none bg-[#0e0f14]/95 backdrop-blur border-t border-gray-800 md:hidden pointer-events-auto"
                    : `flex-1 flex flex-col p-4 select-none bg-[#0e0f14] min-h-[220px] ${(isPlaying || playOnly) ? 'md:hidden' : ''}`
                }>
                  <div className="flex justify-between items-center px-1 mb-2 text-[9px] text-gray-500 font-pixel font-bold leading-none">
                    <span>SYSTEM: {gameData.engine.toUpperCase()} ENGINE</span>
                    <span>{playOnly || isPlaying ? "MODE: PLAY" : `MODE: EDIT (${editSpeedMult}x)`}</span>
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
                        let btnXKey: keyof typeof touchRef.current = 'slow';
                        let btnYActive = false; let btnYLabel = "";

                        const hasOverlay = isPlaying && (!!activeDialogue || !!gameMsg || !!shopModal || !!eventChoice || !!gameOverResult || invOpen || !!battle);

                        if (hasOverlay) {
                          btnAActive = true; btnALabel = "決定";
                          btnBActive = true; btnBLabel = "取消";
                        } else if (!isPlaying && gameData.engine === 'yume25d') {
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
                            <button disabled={!btnXActive} {...padProps(btnXKey)}
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

                  {/* 中央下部：SELECT / START / INV ボタン */}
                  {!introOpen && (
                    <div className="flex gap-6 justify-center items-center mt-3 pt-1 border-t border-gray-800/40 w-full shrink-0 select-none">
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
                      className="w-full py-2.5 mt-2 bg-yellow-700/80 border border-yellow-500 text-yellow-100 font-pixel font-bold text-xs active:bg-yellow-600 touch-none select-none"
                      onPointerDown={e => { e.preventDefault(); playSfx(MSG_ADVANCE_SFX); dialogueCutsceneRef.current?.advance(); }}
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
              );
              return isFixedController && mounted ? createPortal(controllerEl, document.body) : controllerEl;
            })()
          ) : (
            <>
              {/* ── タイトル：どのタブからでも常に見えるよう固定表示 ── */}
              <div className="px-3 pt-3 pb-1 shrink-0">
                <label className="block text-[11px] text-gray-400 mb-1">タイトル</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200" />
              </div>

              {/* ── タブバー：基本3つ＋詳細▼ で圧迫感を抑える ── */}
              <div className="flex flex-wrap border-b border-gray-800 shrink-0">
                {/* 基本タブ（常時表示） */}
                {([
                  ['map', 'マップ'],
                  ...(gameData.engine !== 'touhou' ? [['object', 'オブジェ']] : []),
                  ['char', 'キャラ'],
                  ...(gameData.battle ? [['battle', '戦闘']] : []),
                  ...(gameData.battle ? [['character', 'キャラクター']] : []),
                  ['item', 'アイテム'],
                  ['weapon', '武器'],
                  ['armor', '防具'],
                ] as [EditorTab, string][]).map(([id, label]) => (
                  <button key={id} onClick={() => setEditorTab(id)}
                    className={`flex-none py-3 px-3.5 text-[11px] font-bold transition ${editorTab === id ? 'text-blue-400 border-b-2 border-blue-500 bg-[#0f0f11]' : 'text-gray-500 hover:text-gray-300'}`}>
                    {label}
                  </button>
                ))}

                {/* 詳細タブ（showAdvancedTabs=trueのとき表示） */}
                {showAdvancedTabs && ([
                  ['switch', 'スイッチ'], ['sound', 'サウンド'], ['effect', 'エフェクト'],
                  ...(gameData.engine !== 'touhou' ? [['screen', '画面']] : []),
                  ...(gameData.engine === 'touhou' ? [['spell', 'フェーズ']] : []),
                ] as [EditorTab, string][]).map(([id, label]) => (
                  <button key={id} onClick={() => setEditorTab(id)}
                    className={`flex-none py-3 px-3 text-[11px] font-bold transition ${editorTab === id ? 'text-blue-400 border-b-2 border-blue-500 bg-[#0f0f11]' : 'text-gray-600 hover:text-gray-400'}`}>
                    {label}
                  </button>
                ))}

                {/* シーンタブ（scenes 定義済み preset のみ） */}
                {gameData.scenes && (
                  <button onClick={() => setEditorTab('scene')}
                    className={`flex-none py-3 px-3.5 text-[11px] font-bold transition ${editorTab === 'scene' ? 'text-violet-400 border-b-2 border-violet-500 bg-[#0f0f11]' : 'text-gray-500 hover:text-gray-300'}`}>
                    シーン
                  </button>
                )}

                {/* 詳細トグル */}
                <button
                  onClick={() => {
                    setShowAdvancedTabs(v => {
                      if (v && !['map', 'object', 'char', 'battle', 'character', 'item'].includes(editorTab)) setEditorTab('map');
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
                              onChange={e => setGameData(p => ({ ...p, phases: p.phases!.map((x, i) => i === pi ? { ...x, kind: e.target.value as 'wave' | 'boss' } : x) }))}
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
                    onPickImage={(target) => setPicker({ mode: target.t === 'yumeTexSound' ? 'bgm' : 'image', target })}
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

                    {/* ── 地形の自動生成（マクロ）：パーリンノイズで下層(地面)を丸ごと描き替える ── */}
                    {gameData.engine !== 'touhou' && (
                      <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 space-y-2">
                        <p className="text-[11px] font-bold text-gray-300">🌍 地形の自動生成（マクロ）</p>
                        <div className="flex items-center gap-2 flex-wrap text-[10px] text-gray-300">
                          {gameData.engine !== 'action' && (
                            <label className="flex items-center gap-1.5">水の量
                              <select value={terrainWater} onChange={e => setTerrainWater(e.target.value as TerrainWater)}
                                className="bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-white">
                                <option value="low">少なめ</option>
                                <option value="mid">ふつう</option>
                                <option value="high">多め</option>
                              </select>
                            </label>
                          )}
                          <button onClick={runTerrainMacro}
                            className="px-2.5 py-1 rounded border-2 border-gray-600 bg-blue-600 text-white text-[11px] font-bold">
                            🎲 地形を生成
                          </button>
                        </div>
                        <p className="text-[10px] text-gray-500">
                          {gameData.engine === 'action'
                            ? 'マイクラと同じパーリンノイズで、地表の起伏（草ブロック・土・岩盤）を作ります（内蔵素材を使用）。押すたびに別の地形になり、編集中シーンの下層(地面)レイヤーを丸ごと描き替えます。スタート地点の足元は地表に均されます。'
                            : 'マイクラと同じパーリンノイズで、深い海・海・砂浜・草原・森・山を塗り分けます（内蔵素材を使用）。押すたびに別の地形になり、編集中シーンの下層(地面)レイヤーを丸ごと描き替えます（中層・天蓋・オブジェクトは残ります）。スタート周辺は草原になります。'}
                        </p>
                      </div>
                    )}

                    {/* ── 描画レイヤー切り替え ── */}
                    <div className="flex rounded-lg border border-gray-700 overflow-hidden text-[10px] sm:text-[11px]">
                      <button onClick={() => setEditMapLayer('base')}
                        className={`flex-1 py-1.5 px-1 border-r border-gray-700 ${editMapLayer === 'base' ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400'}`}>下層(地面)</button>
                      <button onClick={() => setEditMapLayer('overlay')}
                        className={`flex-1 py-1.5 px-1 border-r border-gray-700 ${editMapLayer === 'overlay' ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400'}`}>中層(置物)</button>
                      <button onClick={() => setEditMapLayer('overhead')}
                        className={`flex-1 py-1.5 px-1 ${editMapLayer === 'overhead' ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400'}`}>天蓋(手前)</button>
                    </div>
                    {editMapLayer === 'base' && (
                      <p className="text-[10px] text-gray-500">下層は最も奥に描画され、タイルの通行可/不可などの当たり判定が適用されます。</p>
                    )}
                    {editMapLayer === 'overlay' && (
                      <p className="text-[10px] text-gray-500">中層は下層の上、かつプレイヤーの後ろに描画されます。装飾や草などの配置に適しています。</p>
                    )}
                    {editMapLayer === 'overhead' && (
                      <p className="text-[10px] text-gray-500">天蓋は最も手前（プレイヤーの前面）に描画されます。プレイヤーが真下に入ると自動で半透明になります。</p>
                    )}
                    {/* ── タイル塗りヒント ── */}
                    <p className="text-[10px] text-gray-500 flex items-center gap-1"><Smartphone size={12} /> タイルを選択して画面をタップ／ドラッグ</p>
                    <p className="text-[10px] text-green-400 flex items-center gap-1">🏁 マーカーをドラッグしてプレイヤーの初期位置を変更</p>
                    {/* ── タイルパレット：yume25d と同じ横並びスウォッチ。選ぶと下に詳細設定が開く ── */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {Object.entries(gameData.tiles).map(([idStr, tile]) => {
                        const id = Number(idStr);
                        return (
                          <button key={id} onClick={() => setSelectedTileId(id)} title={tile.name}
                            className={`w-7 h-7 shrink-0 rounded border-2 overflow-hidden ${selectedTileId === id ? 'border-yellow-400' : 'border-gray-700'}`}
                            style={{ backgroundColor: tile.color }}>
                            {tile.imageUrl && <SpriteThumbnail spriteUrl={tile.imageUrl} size={24} imgCache={imgCache} keyedCache={keyedCache} className="w-full h-full" />}
                          </button>
                        );
                      })}
                      <button onClick={addTile} title="タイルを追加"
                        className="w-7 h-7 shrink-0 rounded border-2 border-dashed border-gray-600 text-gray-400 hover:bg-gray-100/5 grid place-items-center">
                        <Plus size={13} />
                      </button>
                    </div>

                    {/* 選択中タイルの詳細設定（yume25d のテクスチャ個別設定と同じ構成） */}
                    {(() => {
                      const tile = gameData.tiles[selectedTileId];
                      if (!tile) return null;
                      const id = selectedTileId;
                      return (
                        <div className="flex flex-col gap-1.5 rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 text-[10px] text-gray-300">
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] font-bold text-gray-200">🎨 {tile.name || 'タイル'} の設定</span>
                            {id !== 0 && (
                              <button onClick={() => deleteTile(id)} className="px-2 py-1 rounded text-gray-400 hover:text-red-400 hover:bg-red-500/10">削除</button>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <label className="flex items-center gap-1">名前:
                              <input value={tile.name} onChange={e => updateTile(id, { name: e.target.value })}
                                className="w-24 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-white outline-none" />
                            </label>
                            <label className="flex items-center gap-1">色:
                              <input type="color" value={tile.color} onChange={e => updateTile(id, { color: e.target.value })}
                                className="w-6 h-4 bg-transparent cursor-pointer" title="色" />
                            </label>
                            <label className="flex items-center gap-1 text-gray-400"><input type="checkbox" checked={tile.passable} onChange={e => updateTile(id, { passable: e.target.checked })} className="accent-blue-500" />通行可</label>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-gray-400">
                            <select value={tile.special || ''} onChange={e => updateTile(id, { special: e.target.value || undefined })} className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 outline-none">
                              <option value="">特殊なし</option>
                              <option value="goal">ゴール</option>
                              <option value="trap">トラップ</option>
                              <option value="item">アイテム</option>
                              <option value="grass">草むら</option>
                              <option value="warp">システム: シーン切替床</option>
                              <option value="damage">システム: どく沼/ダメージ床</option>
                              <option value="ice-up">システム: つるつる床（↑）</option>
                              <option value="ice-right">システム: つるつる床（→）</option>
                              <option value="ice-down">システム: つるつる床（↓）</option>
                              <option value="ice-left">システム: つるつる床（←）</option>
                            </select>
                          </div>
                          {tile.special === 'warp' && (gameData.scenes?.length ?? 0) > 0 && (
                            <p className="text-[10px] text-gray-500">🚪 ワープ先の設定は「シーン」タブで行えます。</p>
                          )}
                          {tile.special === 'damage' && (
                            <label className="text-[10px] text-gray-400 flex items-center gap-1">被ダメージ量
                              <input type="number" value={tile.damageAmount ?? 3} onChange={e => updateTile(id, { damageAmount: Number(e.target.value) })}
                                className="w-16 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-200 outline-none" />
                            </label>
                          )}
                          <div className="flex items-center gap-2 pt-1.5 mt-1 border-t border-gray-700/50">
                            <span className="text-[10px] text-gray-400">画像（任意）</span>
                            <button onClick={() => setPicker({ mode: 'image', target: { t: 'tile', id } })} className="text-[10px] text-blue-400 hover:text-blue-300 ml-auto flex items-center gap-1 bg-blue-500/10 px-2 py-1 rounded">
                              <ImageIcon size={12} /> {tile.imageRef ? '画像を変更' : '画像を参照'}
                            </button>
                            {tile.imageRef && (
                              <button onClick={() => updateTile(id, { imageRef: undefined, imageUrl: undefined })} className="text-gray-400 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                            )}
                          </div>
                          <p className="text-[9px] text-gray-500">画像は既存の投稿・歩行グラ・URLを参照します。</p>
                        </div>
                      );
                    })()}

                    {/* ── システムタイル（ワープ床・どく沼/ダメージ床・つるつる床）── */}
                    {(gameData.engine === 'rpg' || gameData.engine === 'onjReze' || gameData.engine === 'action') && (
                      <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 space-y-2">
                        <p className="text-[12px] font-bold text-gray-200">⚙️ システムタイル</p>
                        <p className="text-[10px] text-gray-500">クリックで既定の見た目・効果音つきの床タイルがタイル一覧に追加されるので、マップに塗ってください。
                          {gameData.engine === 'action' && '重力で移動するこのエンジンでは、つるつる床は左右方向のみ効果があります。'}
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {SYSTEM_TILE_TEMPLATES.filter(tpl => gameData.engine !== 'action' || (tpl.special !== 'ice-up' && tpl.special !== 'ice-down')).map(tpl => (
                            <button key={tpl.key} onClick={() => addSystemTile(tpl)}
                              className="flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-gray-600 text-[10px] text-gray-400 hover:bg-gray-100/5">
                              <Plus size={11} />{tpl.label}
                            </button>
                          ))}
                        </div>
                        {(gameData.engine === 'rpg' || gameData.engine === 'onjReze') && (
                          <label className="flex items-center gap-2 pt-1.5 mt-1 border-t border-gray-700/50 text-[10px] text-gray-400">
                            つるつる床のスライド速度
                            <input type="number" min={1} max={20} step={0.5}
                              value={gameData.iceSlideSpeed ?? DEFAULT_ICE_SLIDE_SPEED}
                              onChange={e => setGameData(p => ({ ...p, iceSlideSpeed: Math.max(1, Math.min(20, Number(e.target.value) || DEFAULT_ICE_SLIDE_SPEED)) }))}
                              className="w-16 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-200 outline-none" />
                            <span className="text-gray-500">px/frame</span>
                          </label>
                        )}
                      </div>
                    )}

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

                {/* ── 死亡画面（yume25d 専用） ── */}
                {editorTab === 'screen' && gameData.engine === 'yume25d' && (
                  <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] font-bold text-gray-200">💀 死亡画面</p>
                      {gameData.deathScreen && (
                        <button onClick={() => setGameData(p => ({ ...p, deathScreen: undefined }))} className="shrink-0 grid place-items-center w-9 h-9 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={16} /></button>
                      )}
                    </div>
                    {!gameData.deathScreen ? (
                      <button onClick={() => setGameData(p => ({ ...p, deathScreen: { ...defaultDeathScreen() } }))}
                        className="w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-gray-600 text-[11px] text-gray-400 hover:bg-gray-100/5"><Plus size={13} />死亡画面を追加</button>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-[10px] text-gray-400 font-bold">スタイル</p>
                        <div className="flex gap-1 flex-wrap">
                          {(['minecraft', 'gameOver', 'none'] as DeathScreenStyle[]).map(s => (
                            <button key={s} onClick={() => updDeath({ style: s })}
                              className={`px-2 py-1 rounded text-[10px] font-bold border transition ${gameData.deathScreen!.style === s ? 'bg-red-600 border-red-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}>
                              {s === 'minecraft' ? '⛏ Minecraft風' : s === 'gameOver' ? '🎮 ゲームオーバー' : '🚫 なし'}
                            </button>
                          ))}
                        </div>
                        {gameData.deathScreen.style !== 'none' && (<>
                          <input value={gameData.deathScreen.heading} onChange={e => updDeath({ heading: e.target.value })} placeholder="見出し（例: 死んでしまった！）"
                            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[12px] text-gray-100 outline-none" />
                          <input value={gameData.deathScreen.retryLabel} onChange={e => updDeath({ retryLabel: e.target.value })} placeholder="リスポーンボタン"
                            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300 outline-none" />
                          <input value={gameData.deathScreen.exitLabel} onChange={e => updDeath({ exitLabel: e.target.value })} placeholder="タイトル/終了ボタン"
                            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300 outline-none" />
                          {gameData.deathScreen.style === 'minecraft' && (
                            <label className="flex items-center gap-2 text-[10px] text-gray-400">文字色<input type="color" value={gameData.deathScreen.textColor ?? '#ffffff'} onChange={e => updDeath({ textColor: e.target.value })} className="w-9 h-9 rounded-lg border border-gray-700 bg-transparent cursor-pointer" /></label>
                          )}
                        </>)}
                      </div>
                    )}
                  </div>
                )}

                {/* ── OBJECT ── */}
                {editorTab === 'object' && (
                  <div className="space-y-3">
                    {/* ── yume25d ビルボード選択中 ── */}
                    {gameData.engine === 'yume25d' && yume25dTalkTargetId && (() => {
                      const bb = gameData.layout25d?.billboards.find(b => b.id === yume25dTalkTargetId);
                      if (!bb) return null;
                      const updBb = (patch: Partial<typeof bb>) => setGameData(p => ({
                        ...p, layout25d: p.layout25d ? {
                          ...p.layout25d, billboards: p.layout25d.billboards.map(b => b.id === bb.id ? { ...b, ...patch } : b)
                        } : p.layout25d
                      }));
                      return (
                        <div className="rounded-lg border border-yellow-600/50 bg-gray-900 p-2.5 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-yellow-400 font-bold flex items-center gap-1">
                              <Smartphone size={11} /> 選択中: {bb.message || `ビルボード#${bb.tex}`}
                            </span>
                            <button onClick={() => setYume25dTalkTargetId(null)}
                              className="grid place-items-center min-w-[2.25rem] h-6 px-2 bg-gray-700 hover:bg-gray-600 rounded text-[10px] text-gray-300">解除</button>
                          </div>
                          <label className="flex items-center gap-1.5 text-[10px] text-gray-400">
                            <input type="checkbox" checked={!!bb.interactive}
                              onChange={e => updBb({ interactive: e.target.checked || undefined })} />
                            はなせる
                          </label>
                          <label className="flex items-center gap-1.5 text-[10px] text-gray-400">
                            <input type="checkbox" checked={!!bb.collidable}
                              onChange={e => updBb({ collidable: e.target.checked || undefined })} />
                            当たり判定
                          </label>
                          <label className="text-[10px] text-gray-400 block">AI行動
                            <select value={bb.behavior ?? 'still'}
                              onChange={e => updBb({ behavior: e.target.value as NpcBehavior })}
                              className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 outline-none">
                              <option value="still">静止</option>
                              <option value="random">ランダム移動</option>
                              <option value="randomDash">ランダムダッシュ</option>
                              <option value="randomHop">ランダムジャンプ</option>
                              <option value="chase">追いかける</option>
                              <option value="flee">逃げる</option>
                              <option value="patrolH">左右巡回</option>
                              <option value="patrolV">前後巡回</option>
                            </select>
                          </label>
                          <label className="text-[10px] text-gray-400 block">メッセージ
                            <input type="text" value={bb.message ?? ''} placeholder="……"
                              onChange={e => updBb({ message: e.target.value || undefined })}
                              className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 outline-none" />
                          </label>
                          <label className="text-[10px] text-gray-400 block">選択肢（,区切り）
                            <input type="text" value={(bb.choices ?? []).join(',')}
                              onChange={e => { const v = e.target.value; updBb({ choices: v.trim() ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined }); }}
                              className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 outline-none" />
                          </label>
                          {/* イベントページ */}
                          <EventPageEditor
                            pages={bb.pages ?? []}
                            setPages={pages => updBb({ pages: pages.length > 0 ? pages : undefined })}
                            switches={gameData.switches ?? []}
                            items={gameData.items ?? []}
                            effects={gameData.effects ?? []}
                            setPreviewCommand={setPreviewCommand}
                          />
                        </div>
                      );
                    })()}
                    {/* ── 選択中オブジェクト or 新規テンプレート ── */}
                    {!(gameData.engine === 'yume25d' && yume25dTalkTargetId) && (selObj ? (<>
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

                                  {/* 1. 通常攻撃の弾幕 (undertale / deltarune のみ) */}
                                  {isDodgeBattleStyle(gameData.battle.style) && (
                                    <>
                                      <label className="block text-[10px] text-gray-400">UNDERTALE移動モード（既定）
                                        <select value={selObj.undertaleMode ?? 'red'} onChange={e => updObj({ undertaleMode: e.target.value as UndertaleMode })}
                                          className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-1.5 text-[11px] text-gray-200 outline-none">
                                          <option value="red">🔴 レッド（自由移動）</option>
                                          <option value="blue">🔵 ブルー（重力・ジャンプ）</option>
                                          <option value="green">🟢 グリーン（シールド・移動不可）</option>
                                          <option value="purple">🟣 パープル（3本の糸）</option>
                                          <option value="yellow">🟡 イエロー（自由移動＋射撃）</option>
                                        </select>
                                        <p className="mt-1 text-[10px] text-gray-500 leading-relaxed">技ごとに個別指定しない限り、この敵の弾幕よけ全体に適用される既定モード</p>
                                      </label>
                                      <label className="block text-[10px] text-gray-400">通常攻撃の弾幕 (MiniScript)
                                        <textarea value={selObj.miniScript ?? ''} onChange={e => {
                                          const v = e.target.value;
                                          updObj(v ? { miniScript: v, bullet: 'none' } : { miniScript: undefined });
                                        }} placeholder={'// 例:\nwhile true\n  shotRain(1.8, 4, 1)\n  wait(10)\nend while'}
                                          rows={4} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-1.5 text-[11px] text-green-300 font-mono outline-none resize-y" />
                                        <p className="mt-1 text-[10px] text-gray-500 leading-relaxed">shot(x,y,vx,vy,r,色) / shotAngle(x,y,角度,速,r,色) / shotPlayer(x,y,速) / shotAimed(速) / shotRain(速) / shotSide(左?,y,速) / wait n / setDuration(f) / getPlayerX() / rand / range / sin / cos ・ 色=0〜8 ・ 画面=W×H(176px)</p>
                                      </label>
                                    </>
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
                                          {isDodgeBattleStyle(gameData.battle?.style) && !m.heal && (
                                            <>
                                              <label className="block text-[10px] text-gray-400">UNDERTALE移動モード（この技専用・省略時は既定値）
                                                <select value={m.undertaleMode ?? ''} onChange={e => {
                                                  const copy = [...(selObj.moves ?? [])];
                                                  const val = e.target.value;
                                                  copy[i] = { ...copy[i], undertaleMode: (val || undefined) as UndertaleMode | undefined };
                                                  updObj({ moves: copy });
                                                }} className="w-full mt-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none">
                                                  <option value="">（既定値を使う）</option>
                                                  <option value="red">🔴 レッド（自由移動）</option>
                                                  <option value="blue">🔵 ブルー（重力・ジャンプ）</option>
                                                  <option value="green">🟢 グリーン（シールド・移動不可）</option>
                                                  <option value="purple">🟣 パープル（3本の糸）</option>
                                                  <option value="yellow">🟡 イエロー（自由移動＋射撃）</option>
                                                </select>
                                              </label>
                                              <label className="block text-[10px] text-gray-400">弾幕スクリプト (MiniScript)
                                                <textarea value={m.miniScript ?? ''} onChange={e => {
                                                  const copy = [...(selObj.moves ?? [])];
                                                  const val = e.target.value;
                                                  copy[i] = { ...copy[i], miniScript: val || undefined };
                                                  updObj({ moves: copy });
                                                }} placeholder="// この技専用の弾幕（省略時は通常攻撃の弾幕）"
                                                  rows={3} className="w-full mt-0.5 bg-gray-700 border border-gray-600 rounded px-1.5 py-1.5 text-[11px] text-green-300 font-mono outline-none resize-y" />
                                              </label>
                                            </>
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
                                <button onClick={() => updObj({
                                  spellCards: [...(selObj.spellCards ?? []), {
                                    name: `スペルカード${(selObj.spellCards?.length ?? 0) + 1}`,
                                    triggerHp: Math.floor(selObj.hp * 0.5),
                                    miniScript: '// 弾幕パターンをMiniScriptで記述\nwait 60\naimed 2.0',
                                  } as SpellCardDef]
                                })}
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
                          <WarpDestinationEditor
                            scenes={gameData.scenes}
                            sceneId={selObj.warpSceneId}
                            onSceneChange={warpSceneId => updObj({ warpSceneId })}
                            entryCol={selObj.warpEntryCol ?? 1}
                            entryRow={selObj.warpEntryRow ?? 1}
                            onEntryChange={(warpEntryCol, warpEntryRow) => updObj({ warpEntryCol, warpEntryRow })}
                            sameSceneTarget={selObj.warpTarget}
                            onSameSceneTargetChange={(col, row) => updObj({ warpTarget: { col, row } })}
                          />
                        )}
                      </div>
                      {/* ── イベントページエディタ（全objType共通） ── */}
                      {selObj && (
                        <EventPageEditor
                          pages={selObj.pages ?? []}
                          setPages={pages => updObj({ pages: pages.length > 0 ? pages : undefined })}
                          switches={gameData.switches ?? []}
                          items={gameData.items ?? []}
                          effects={gameData.effects ?? []}
                          setPreviewCommand={setPreviewCommand}
                        />
                      )}
                    </>) : (
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
                    ))}
                    {/* ── 全オブジェクト一覧 ── */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-gray-500">全{isYume25d ? (gameData.layout25d?.billboards.length ?? 0) : gameData.objects.length}個 {batchCount > 0 && <span className="text-yellow-400">({batchCount}選択中)</span>}</span>
                        {batchCount > 0 && <button onClick={clearBatch} className="text-[10px] text-gray-500 hover:text-gray-300">選択解除</button>}
                      </div>
                      <div className="max-h-28 overflow-y-auto space-y-0.5">
                        {isYume25d
                          ? (gameData.layout25d?.billboards ?? []).map(b => (
                            <button key={b.id} onClick={(e) => handleBatchClick(b.id, e)}
                              className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[10px] text-left ${batchIds.has(b.id) ? 'bg-blue-800/40 text-blue-200' : yume25dTalkTargetId === b.id ? 'bg-yellow-800/40 text-yellow-200' : 'bg-gray-800/40 text-gray-400 hover:bg-gray-700/40'}`}>
                              <input type="checkbox" checked={batchIds.has(b.id)} readOnly className="accent-blue-500 shrink-0"
                                onClick={e => { e.stopPropagation(); setBatchIds(prev => { const n = new Set(prev); n.has(b.id) ? n.delete(b.id) : n.add(b.id); return n; }); lastClickedIdRef.current = b.id; }} />
                              <span>{b.interactive ? '💬' : '🪧'}</span>
                              <span className="truncate flex-1">{b.message || `ビルボード#${b.tex}`}</span>
                              <span className="text-gray-600">({b.col},{b.row})</span>
                            </button>
                          ))
                          : gameData.objects.map(o => (
                            <button key={o.id} onClick={(e) => handleBatchClick(o.id, e)}
                              className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[10px] text-left ${batchIds.has(o.id) ? 'bg-blue-800/40 text-blue-200' : selectedObjId === o.id ? 'bg-yellow-800/40 text-yellow-200' : 'bg-gray-800/40 text-gray-400 hover:bg-gray-700/40'}`}>
                              <input type="checkbox" checked={batchIds.has(o.id)} readOnly className="accent-blue-500 shrink-0"
                                onClick={e => { e.stopPropagation(); setBatchIds(prev => { const n = new Set(prev); n.has(o.id) ? n.delete(o.id) : n.add(o.id); return n; }); lastClickedIdRef.current = o.id; }} />
                              <span>{o.emoji}</span>
                              <span className="truncate flex-1">{o.name || o.objType || '敵'}</span>
                              <span className="text-gray-600">({o.col},{o.row})</span>
                            </button>
                          ))}
                      </div>
                    </div>

                    {/* ── バッチ編集パネル（複数選択時のみ表示） ── */}
                    {batchCount >= 2 && (
                      <div className="rounded-lg border border-blue-600/50 bg-gray-900 p-2.5 space-y-2">
                        <p className="text-[11px] text-blue-400 font-bold">一括編集 ({batchCount}個)</p>
                        {isYume25d ? (
                          <>
                            <label className="text-[10px] text-gray-400 block">AI行動
                              <select value="" onChange={e => { if (e.target.value) batchApplyBillboards({ behavior: e.target.value as NpcBehavior }); }}
                                className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 outline-none">
                                <option value="">— 選択して適用 —</option>
                                <option value="still">静止</option>
                                <option value="random">ランダム移動</option>
                                <option value="randomDash">ランダムダッシュ</option>
                                <option value="randomHop">ランダムジャンプ</option>
                                <option value="chase">追いかける</option>
                                <option value="flee">逃げる</option>
                                <option value="patrolH">左右巡回</option>
                                <option value="patrolV">前後巡回</option>
                              </select>
                            </label>
                            <label className="flex items-center gap-1.5 text-[10px] text-gray-400">
                              <input type="checkbox" onChange={e => batchApplyBillboards({ interactive: e.target.checked || undefined })} className="accent-blue-500" />
                              はなせるをON
                            </label>
                            <label className="flex items-center gap-1.5 text-[10px] text-gray-400">
                              <input type="checkbox" onChange={e => batchApplyBillboards({ collidable: e.target.checked || undefined })} className="accent-blue-500" />
                              当たり判定をON
                            </label>
                          </>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="text-[10px] text-gray-400">種別
                                <select value="" onChange={e => { if (e.target.value) batchApplyObjects({ objType: e.target.value as ObjType }); }}
                                  className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 outline-none">
                                  <option value="">— 適用しない —</option>
                                  <option value="enemy">敵</option>
                                  <option value="npc">NPC</option>
                                  <option value="item">アイテム</option>
                                  <option value="warp">ワープ</option>
                                  <option value="event">イベント</option>
                                  <option value="platform">プラットフォーム</option>
                                </select>
                              </label>
                              <label className="text-[10px] text-gray-400">AI行動
                                <select value="" onChange={e => { if (e.target.value) batchApplyObjects({ behavior: e.target.value as NpcBehavior }); }}
                                  className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 outline-none">
                                  <option value="">— 適用しない —</option>
                                  <option value="still">静止</option>
                                  <option value="random">ランダム</option>
                                  <option value="randomDash">ランダムダッシュ</option>
                                  <option value="randomHop">ランダムジャンプ</option>
                                  <option value="chase">追尾</option>
                                  <option value="flee">逃走</option>
                                  <option value="patrolH">左右往復</option>
                                  <option value="patrolV">上下往復</option>
                                  <option value="walker">歩行</option>
                                </select>
                              </label>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="text-[10px] text-gray-400">弾
                                <select value="" onChange={e => { if (e.target.value) batchApplyObjects({ bullet: e.target.value as BulletType }); }}
                                  className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 outline-none">
                                  <option value="">— 適用しない —</option>
                                  <option value="none">なし</option>
                                  <option value="aimed">狙い弾</option>
                                  <option value="spread">拡散</option>
                                  <option value="spiral">回転</option>
                                </select>
                              </label>
                              <label className="flex items-center gap-1.5 text-[10px] text-gray-400 mt-4">
                                <input type="checkbox" onChange={e => batchApplyObjects({ hazard: e.target.checked })} className="accent-blue-500" />
                                接触でミスをON
                              </label>
                            </div>
                          </>
                        )}
                        <button onClick={clearBatch} className="w-full py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-[10px] text-gray-300">選択解除</button>
                      </div>
                    )}
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
                    {gameData.engine === 'yume25d' && (
                      <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-2 space-y-1.5">
                        <p className="text-[10px] text-gray-500">マイクラスキン：Minecraft のスキン画像（Slim型・64×64）からブロック人形の3Dキャラを作って主人公にできます。歩くと手足を振ります。</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {MINECRAFT_SKIN_PRESETS.map(p => (
                            <button key={p.url} onClick={() => setGameData(prev => ({ ...prev, player: { ...prev.player, minecraftSkin: p.url, spriteRef: undefined, spriteUrl: undefined } }))}
                              className="flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-gray-600 text-[10px] text-gray-400 hover:bg-gray-100/5">
                              🧍 {p.name}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input value={gameData.player.minecraftSkin ?? ''} onChange={e => setGameData(p => ({ ...p, player: { ...p.player, minecraftSkin: e.target.value || undefined } }))} placeholder="スキン画像URL（64×64）"
                            className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-[10px] text-white outline-none" />
                          <button onClick={() => setPicker({ mode: 'image', target: { t: 'playerMcSkin' } })}
                            className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:text-blue-300 text-[10px]">
                            <ImageIcon size={12} /> 参照
                          </button>
                        </div>
                        {gameData.player.minecraftSkin && (
                          <button onClick={() => setGameData(p => ({ ...p, player: { ...p.player, minecraftSkin: undefined } }))}
                            className="text-[10px] text-gray-400 hover:text-red-400">マイクラスキンを解除</button>
                        )}
                      </div>
                    )}
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

                {/* ── CHARACTER（キャラクター：編成・装備・アイテム効果） ── */}
                {editorTab === 'character' && gameData.battle && (() => {
                  const isParty = gameData.battle.style === 'deltarune' || isPartyBattleStyle(gameData.battle.style);
                  const equipDefs: ['weapon' | 'armor', string, EquipmentDef[]][] = [['weapon', '武器', gameData.weapons ?? []], ['armor', '防具', gameData.armors ?? []]];
                  const leadId = gameData.battle.party?.[0]?.id ?? '__self';
                  return (
                    <div className="space-y-4">
                      <p className="text-[12px] font-bold text-yellow-400 flex items-center gap-1">🧑 キャラクター</p>

                      {isParty ? (
                        <div className="space-y-2 rounded-lg border border-gray-700 bg-gray-900/40 p-2.5">
                          <div className="flex justify-between items-center">
                            <p className="text-[10px] text-gray-300 font-bold">パーティ編成</p>
                            <button onClick={() => setGameData(p => {
                              const b = p.battle!;
                              const party = b.party ?? [];
                              const seeded = party.length === 0
                                ? [{ id: `pm-${Date.now().toString(36)}`, name: b.playerName || '主人公', emoji: p.player.emoji || '🧝', maxHp: b.maxHp } as PartyMember]
                                : party;
                              const nm: PartyMember = {
                                id: `pm-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
                                name: `なかま${seeded.length}`, emoji: '🧑',
                                maxHp: Math.max(1, Math.round(b.maxHp * 0.9)), maxMp: b.maxMp, atk: b.atk, def: b.def,
                              };
                              return { ...p, battle: { ...b, party: [...seeded, nm] } };
                            })} className="inline-flex items-center px-3 py-1.5 rounded-md text-[11px] text-emerald-400 border border-emerald-700 active:bg-emerald-500/10 font-bold">+ 追加</button>
                          </div>
                          <p className="text-[9px] text-gray-500 leading-relaxed">先頭のメンバーが主人公（フィールドのHP/MP・レベルアップに追従）。未設定なら主人公ひとりで戦います。</p>
                          <div className="space-y-2 max-h-[28rem] overflow-y-auto">
                            {(gameData.battle.party ?? []).length === 0 && <p className="text-[10px] text-gray-500 px-1">（なし - 主人公ひとりで戦う）</p>}
                            {(gameData.battle.party ?? []).map((m, i) => (
                              <div key={m.id} className="bg-gray-850 rounded border border-gray-700 p-2 space-y-1.5">
                                <div className="flex gap-1.5 items-center">
                                  <input value={m.emoji} onChange={e => setGameData(p => {
                                    const b = p.battle!; const next = [...(b.party ?? [])];
                                    next[i] = { ...next[i], emoji: e.target.value.slice(0, 2) };
                                    return { ...p, battle: { ...b, party: next } };
                                  })} className="w-10 shrink-0 bg-gray-700 rounded px-1 py-1.5 text-center text-base outline-none" />
                                  <input value={m.name} placeholder="名前" onChange={e => setGameData(p => {
                                    const b = p.battle!; const next = [...(b.party ?? [])];
                                    next[i] = { ...next[i], name: e.target.value };
                                    return { ...p, battle: { ...b, party: next } };
                                  })} className="flex-1 min-w-0 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none" />
                                  <input type="color" value={m.color ?? '#ffffff'} title="メンバーカラー" onChange={e => setGameData(p => {
                                    const b = p.battle!; const next = [...(b.party ?? [])];
                                    next[i] = { ...next[i], color: e.target.value };
                                    return { ...p, battle: { ...b, party: next } };
                                  })} className="w-9 h-9 -my-0.5 shrink-0 bg-transparent border border-gray-700 rounded cursor-pointer" />
                                  <button onClick={() => setGameData(p => {
                                    const b = p.battle!; const next = [...(b.party ?? [])]; next.splice(i, 1);
                                    return { ...p, battle: { ...b, party: next } };
                                  })} className="shrink-0 grid place-items-center w-8 h-8 -my-1 rounded-lg text-gray-400 hover:text-red-400 active:bg-red-500/20 text-sm">✕</button>
                                </div>
                                {i === 0 ? (
                                  <p className="text-[9px] text-violet-300/80">主人公：HP/MP・攻/防は基本ステータスとレベルに追従します</p>
                                ) : (
                                  <div className="grid grid-cols-4 gap-1.5">
                                    {([
                                      ['maxHp', '最大HP'], ['maxMp', '最大MP'], ['atk', '攻撃'], ['def', '防御'],
                                    ] as ['maxHp' | 'maxMp' | 'atk' | 'def', string][]).map(([key, label]) => (
                                      <label key={key} className="text-[10px] text-gray-400">{label}
                                        <input type="text" inputMode="numeric" value={m[key] ?? ''} placeholder="主人公" onChange={e => setGameData(p => {
                                          const b = p.battle!; const next = [...(b.party ?? [])];
                                          const v = parseInt(e.target.value);
                                          next[i] = { ...next[i], [key]: key === 'maxHp' ? (!isNaN(v) ? v : next[i].maxHp) : (!isNaN(v) ? v : undefined) };
                                          return { ...p, battle: { ...b, party: next } };
                                        })} className="w-full mt-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white text-right outline-none" />
                                      </label>
                                    ))}
                                  </div>
                                )}
                                <div className="space-y-1 pt-1 border-t border-gray-700/50">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[9px] text-gray-400">呪文{i !== 0 && <span className="text-gray-600">（同行者は習得Lv欄を無視して常に使用可）</span>}</span>
                                    <button onClick={() => setGameData(p => {
                                      const b = p.battle!; const next = [...(b.party ?? [])];
                                      next[i] = { ...next[i], spells: [...(next[i].spells ?? []), { name: '新しい呪文', tpCost: 20, power: 10 }] };
                                      return { ...p, battle: { ...b, party: next } };
                                    })} className="text-[9px] text-emerald-400 hover:text-emerald-300 px-1.5 py-0.5">+ 呪文追加</button>
                                  </div>
                                  {(m.spells ?? []).map((sp, si) => (
                                    <div key={si} className="bg-gray-900/60 rounded border border-gray-700/70 p-1.5 space-y-1">
                                      <div className="flex gap-1.5 items-center">
                                        <input value={sp.name} placeholder="呪文名" onChange={e => setGameData(p => {
                                          const b = p.battle!; const next = [...(b.party ?? [])]; const sps = [...(next[i].spells ?? [])];
                                          sps[si] = { ...sps[si], name: e.target.value };
                                          next[i] = { ...next[i], spells: sps };
                                          return { ...p, battle: { ...b, party: next } };
                                        })} className="flex-1 min-w-0 bg-gray-700 rounded px-1.5 py-1 text-[10px] text-white outline-none" />
                                        <button onClick={() => setGameData(p => {
                                          const b = p.battle!; const next = [...(b.party ?? [])]; const sps = [...(next[i].spells ?? [])];
                                          sps.splice(si, 1);
                                          next[i] = { ...next[i], spells: sps };
                                          return { ...p, battle: { ...b, party: next } };
                                        })} className="shrink-0 grid place-items-center w-7 h-7 -my-1 rounded text-gray-500 hover:text-red-400 text-xs">✕</button>
                                      </div>
                                      <div className="grid grid-cols-4 gap-1">
                                        {([['tpCost', '消費TP'], ['power', '威力/回復'], ['learnLevel', '習得Lv']] as ['tpCost' | 'power' | 'learnLevel', string][]).map(([key, label]) => (
                                          <label key={key} className="text-[9px] text-gray-500">{label}
                                            <input type="text" inputMode="numeric" value={key === 'learnLevel' ? (sp[key] ?? '') : sp[key]}
                                              placeholder={key === 'learnLevel' ? '1' : undefined}
                                              onChange={e => setGameData(p => {
                                                const b = p.battle!; const next = [...(b.party ?? [])]; const sps = [...(next[i].spells ?? [])];
                                                const v = parseInt(e.target.value);
                                                sps[si] = { ...sps[si], [key]: key === 'learnLevel' ? (!isNaN(v) && v > 1 ? v : undefined) : (!isNaN(v) ? v : 0) };
                                                next[i] = { ...next[i], spells: sps };
                                                return { ...p, battle: { ...b, party: next } };
                                              })} className="w-full mt-0.5 bg-gray-700 rounded px-1 py-1 text-[10px] text-white text-right outline-none" />
                                          </label>
                                        ))}
                                        <label className="text-[9px] text-gray-500 block">種別
                                          <select value={sp.heal ? 'heal' : 'attack'} onChange={e => setGameData(p => {
                                            const b = p.battle!; const next = [...(b.party ?? [])]; const sps = [...(next[i].spells ?? [])];
                                            sps[si] = { ...sps[si], heal: e.target.value === 'heal' || undefined };
                                            next[i] = { ...next[i], spells: sps };
                                            return { ...p, battle: { ...b, party: next } };
                                          })} className="w-full mt-0.5 bg-gray-700 rounded px-0.5 py-1 text-[10px] text-white outline-none">
                                            <option value="attack">ダメージ</option>
                                            <option value="heal">HP回復</option>
                                          </select>
                                        </label>
                                      </div>
                                      <label className="text-[9px] text-gray-500 block">エフェクト
                                        <select value={sp.effectId ?? ''} onChange={e => setGameData(p => {
                                          const b = p.battle!; const next = [...(b.party ?? [])]; const sps = [...(next[i].spells ?? [])];
                                          sps[si] = { ...sps[si], effectId: e.target.value || undefined };
                                          next[i] = { ...next[i], spells: sps };
                                          return { ...p, battle: { ...b, party: next } };
                                        })} className="w-full mt-0.5 bg-gray-700 rounded px-1 py-1 text-[10px] text-white outline-none">
                                          <option value="">（なし）</option>
                                          {(gameData.effects ?? []).map(ef => <option key={ef.id} value={ef.id}>{ef.name}</option>)}
                                        </select>
                                      </label>
                                    </div>
                                  ))}
                                </div>
                                {(equipDefs[0][2].length > 0 || equipDefs[1][2].length > 0) && (
                                  <div className="space-y-1 pt-1 border-t border-gray-700/50">
                                    <span className="text-[9px] text-gray-400">装備</span>
                                    <div className="grid grid-cols-2 gap-1.5">
                                      {equipDefs.map(([slot, slotLabel, defs]) => (
                                        <label key={slot} className="text-[9px] text-gray-500 block">{slotLabel}
                                          <select
                                            value={(i === 0 ? equipment[slot] : partyEquipment[m.id]?.[slot]) ?? ''}
                                            onChange={e => {
                                              const val = e.target.value || undefined;
                                              if (i === 0) {
                                                const eq = { ...equipmentRef.current, [slot]: val };
                                                setEquipment(eq); applyEquipment(eq);
                                              } else {
                                                setPartyEquipment(pp => { const n = { ...pp, [m.id]: { ...pp[m.id], [slot]: val } }; partyEquipmentRef.current = n; return n; });
                                              }
                                            }}
                                            className="w-full mt-0.5 bg-gray-700 rounded px-1 py-1 text-[10px] text-white outline-none">
                                            <option value="">（なし）</option>
                                            {defs.filter(d => !d.restrictTo?.length || d.restrictTo.includes(m.id)).map(d => (
                                              <option key={d.id} value={d.id}>{d.emoji} {d.name}</option>
                                            ))}
                                          </select>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {(gameData.items ?? []).some(it => it.overrides?.some(o => o.memberId === m.id)) && (
                                  <div className="space-y-1 pt-1 border-t border-gray-700/50">
                                    <span className="text-[9px] text-gray-400">アイテム効果</span>
                                    <ul className="space-y-0.5">
                                      {(gameData.items ?? []).filter(it => it.overrides?.some(o => o.memberId === m.id)).map(it => {
                                        const o = it.overrides!.find(oo => oo.memberId === m.id)!;
                                        const effs = [o.healHp ? `HP+${o.healHp}` : '', o.healMp ? `MP+${o.healMp}` : '', o.damage ? `ダメージ${o.damage}` : ''].filter(Boolean).join(' / ');
                                        return <li key={it.id} className="text-[9px] text-gray-400">{it.emoji} {it.name}：{effs || '（効果なし）'}</li>;
                                      })}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2 rounded-lg border border-gray-700 bg-gray-900/40 p-2.5">
                          <p className="text-[10px] text-gray-300 font-bold">主人公</p>
                          <p className="text-[9px] text-gray-500 leading-relaxed">HP/MP・攻/防は基本ステータスとレベルに追従します。名前・ステータスは「戦闘」タブで編集できます。</p>
                          {(equipDefs[0][2].length > 0 || equipDefs[1][2].length > 0) && (
                            <div className="space-y-1 pt-1 border-t border-gray-700/50">
                              <span className="text-[9px] text-gray-400">装備</span>
                              <div className="grid grid-cols-2 gap-1.5">
                                {equipDefs.map(([slot, slotLabel, defs]) => (
                                  <label key={slot} className="text-[9px] text-gray-500 block">{slotLabel}
                                    <select
                                      value={equipment[slot] ?? ''}
                                      onChange={e => {
                                        const val = e.target.value || undefined;
                                        const eq = { ...equipmentRef.current, [slot]: val };
                                        setEquipment(eq); applyEquipment(eq);
                                      }}
                                      className="w-full mt-0.5 bg-gray-700 rounded px-1 py-1 text-[10px] text-white outline-none">
                                      <option value="">（なし）</option>
                                      {defs.filter(d => !d.restrictTo?.length || d.restrictTo.includes(leadId)).map(d => (
                                        <option key={d.id} value={d.id}>{d.emoji} {d.name}</option>
                                      ))}
                                    </select>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                          {(gameData.items ?? []).some(it => it.overrides?.some(o => o.memberId === leadId)) && (
                            <div className="space-y-1 pt-1 border-t border-gray-700/50">
                              <span className="text-[9px] text-gray-400">アイテム効果</span>
                              <ul className="space-y-0.5">
                                {(gameData.items ?? []).filter(it => it.overrides?.some(o => o.memberId === leadId)).map(it => {
                                  const o = it.overrides!.find(oo => oo.memberId === leadId)!;
                                  const effs = [o.healHp ? `HP+${o.healHp}` : '', o.healMp ? `MP+${o.healMp}` : '', o.damage ? `ダメージ${o.damage}` : ''].filter(Boolean).join(' / ');
                                  return <li key={it.id} className="text-[9px] text-gray-400">{it.emoji} {it.name}：{effs || '（効果なし）'}</li>;
                                })}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── BATTLE（RPG戦闘設定） ── */}
                {editorTab === 'battle' && gameData.battle && (
                  <div className="space-y-4">
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
                          const style = e.target.value as BattleConfig['style'];
                          setGameData(p => ({ ...p, battle: { ...p.battle!, style } }));
                        }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-1.5 text-[11px] text-gray-200 outline-none">
                          <option value="classic">コマンド戦闘（ドラクエ風）</option>
                          <option value="undertale">ハート弾幕よけ（アンダーテール風）</option>
                          <option value="deltarune">パーティ×弾幕よけ（デルタルーン風）</option>
                          <option value="ff">サイドビュー パーティ戦闘（FF風）</option>
                          <option value="mother3">ローリングHP戦闘（MOTHER3風）</option>
                          <option value="milky">行動値カウント戦闘（ミルキークエスト風）</option>
                        </select>
                      </label>
                      {(gameData.battle.style === 'deltarune' || isPartyBattleStyle(gameData.battle.style)) && (
                        <p className="text-[9px] text-gray-500 leading-relaxed">
                          {{
                            deltarune: 'パーティで1人ずつ行動を選び、敵ターンはハート弾幕よけ。',
                            ff: 'パーティ全員のコマンドを選んでから一斉に実行するラウンド制。',
                            mother3: 'ローリングHP：被弾/回復でHP表示が実際の値へ向けて1ずつ回転しながら増減する。致命傷を受けても、表示が0に落ちきる前に回復すれば生存できる（クリティカルダメージ演出）。',
                            milky: '行動値が0になった者から行動するカウント制。強い技ほど次の行動が遅れる。敵はHPが減ると疲れた表情に。',
                          }[gameData.battle.style as string]}
                        </p>
                      )}
                    </div>

                    {/* 編成は「キャラクター」タブに移動しました */}
                    <p className="text-[10px] text-gray-400">キャラクター編成は「キャラクター」タブに移動しました</p>

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
                            <div className="grid grid-cols-4 gap-1.5">
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
                              <label className="text-[10px] text-gray-400">習得Lv
                                <input type="text" inputMode="numeric" value={m.learnLevel ?? ''} placeholder="1" onChange={e => setGameData(p => {
                                  const b = p.battle!; const next = [...b.moves];
                                  const v = parseInt(e.target.value);
                                  next[i] = { ...next[i], learnLevel: !isNaN(v) && v > 1 ? v : undefined };
                                  return { ...p, battle: { ...b, moves: next } };
                                })} className="w-full mt-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white text-right outline-none" />
                              </label>
                            </div>
                            <label className="text-[10px] text-gray-400 block">エフェクト
                              <select value={m.effectId ?? ''} onChange={e => setGameData(p => {
                                const b = p.battle!; const next = [...b.moves];
                                next[i] = { ...next[i], effectId: e.target.value || undefined };
                                return { ...p, battle: { ...b, moves: next } };
                              })} className="w-full mt-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white outline-none">
                                <option value="">（なし）</option>
                                {(gameData.effects ?? []).map(ef => <option key={ef.id} value={ef.id}>{ef.name}</option>)}
                              </select>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 4. レベルアップ成長率・経験値カーブ */}
                    <div className="space-y-2 rounded-lg border border-gray-700 bg-gray-900/40 p-2.5">
                      <p className="text-[10px] text-gray-300 font-bold">レベルアップ成長率・経験値カーブ</p>
                      <p className="text-[9px] text-gray-500 leading-relaxed">主人公のレベルが上がるたびに、下の増分がステータスへ自動加算されます（下の「成長表」で特定レベルだけ手動指定した場合はそちらが優先）。</p>
                      <label className="block text-[10px] text-gray-400">経験値カーブ（成長タイプ）
                        <select value={gameData.battle.growthType ?? 'standard'} onChange={e => {
                          const v = e.target.value as GrowthType;
                          setGameData(p => ({ ...p, battle: { ...p.battle!, growthType: v } }));
                        }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-1.5 text-[11px] text-gray-200 outline-none">
                          <option value="early">早熟（序盤は少ない経験値でどんどんレベルが上がる）</option>
                          <option value="standard">標準</option>
                          <option value="late">晩成（レベルが上がるほど必要経験値が急激に増える）</option>
                        </select>
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {([
                          ['hp', '最大HP+'], ['mp', '最大MP+'], ['atk', '攻撃+'], ['def', '防御+'],
                        ] as ['hp' | 'mp' | 'atk' | 'def', string][]).map(([key, label]) => (
                          <label key={key} className="text-[10px] text-gray-400">{label}
                            <input type="text" inputMode="numeric" value={gameData.battle!.growth?.[key] ?? { hp: 6, mp: 3, atk: 2, def: 1 }[key]} onChange={e => {
                              const v = parseInt(e.target.value);
                              setGameData(p => {
                                const b = p.battle!;
                                const cur = b.growth ?? { hp: 6, mp: 3, atk: 2, def: 1 };
                                return { ...p, battle: { ...b, growth: { ...cur, [key]: !isNaN(v) ? v : cur[key] } } };
                              });
                            }} className="w-full mt-0.5 bg-gray-700 rounded px-1.5 py-1.5 text-[11px] text-white text-right outline-none" />
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* 4.5 レベルアップ成長表（手動指定・任意） */}
                    <div className="space-y-2 rounded-lg border border-gray-700 bg-gray-900/40 p-2.5">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-[10px] text-gray-300 font-bold">レベルアップ成長表（手動指定・任意）</p>
                          <p className="text-[9px] text-gray-500">特定のレベルだけ、上の自動成長ではなく指定した値に置き換えたいときに追加。</p>
                        </div>
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

                {/* ── ITEM ── */}
                {editorTab === 'item' && (
                  <div className="space-y-4">
                    <div>
                      <label className="flex text-[11px] text-gray-400 mb-1.5 items-center gap-1">🎒 アイテム定義</label>
                      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                        {(gameData.items ?? []).length === 0 && <p className="text-[9px] text-gray-500 px-1">アイテムがありません。「追加」ボタンで作成してください。</p>}
                        {(gameData.items ?? []).map((it, i) => (
                          <div key={it.id} className="bg-gray-900 rounded-lg border border-gray-800 p-2.5 space-y-2">
                            <div className="flex items-center gap-1.5">
                              <input value={it.emoji} onChange={e => setGameData(p => {
                                const copy = [...(p.items ?? [])]; copy[i] = { ...copy[i], emoji: e.target.value.slice(0, 2) }; return { ...p, items: copy };
                              })} className="w-8 bg-gray-800 border border-gray-700 rounded text-center text-sm outline-none" />
                              <input value={it.name} onChange={e => setGameData(p => {
                                const copy = [...(p.items ?? [])]; copy[i] = { ...copy[i], name: e.target.value }; return { ...p, items: copy };
                              })} placeholder="アイテム名" className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none" />
                              <button onClick={() => setGameData(p => {
                                const copy = [...(p.items ?? [])]; copy.splice(i, 1); return { ...p, items: copy.length > 0 ? copy : undefined };
                              })} className="shrink-0 px-2 py-1 rounded text-[11px] text-red-400 hover:text-red-300 active:bg-red-500/15">削除</button>
                            </div>
                            <div>
                              <textarea value={it.description ?? ''} onChange={e => setGameData(p => {
                                const copy = [...(p.items ?? [])]; copy[i] = { ...copy[i], description: e.target.value || undefined }; return { ...p, items: copy };
                              })} placeholder="せつめい（省略可）" rows={2} className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-gray-300 outline-none resize-none" />
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                              <label className="text-[9px] text-gray-400">
                                カテゴリ
                                <select value={it.category ?? ''} onChange={e => setGameData(p => {
                                  const copy = [...(p.items ?? [])]; copy[i] = { ...copy[i], category: e.target.value as any || undefined }; return { ...p, items: copy };
                                })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none">
                                  <option value="">なし</option>
                                  <option value="consumable">消費</option>
                                  <option value="weapon">武器</option>
                                  <option value="armor">防具</option>
                                  <option value="key">大事なもの</option>
                                </select>
                              </label>
                              <label className="text-[9px] text-gray-400">
                                回復HP
                                <input type="text" inputMode="numeric" value={it.healHp ?? ''} onChange={e => setGameData(p => {
                                  const v = e.target.value ? parseInt(e.target.value) : undefined;
                                  const copy = [...(p.items ?? [])]; copy[i] = { ...copy[i], healHp: v && !isNaN(v) ? v : undefined }; return { ...p, items: copy };
                                })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none text-center" />
                              </label>
                              <label className="text-[9px] text-gray-400">
                                回復MP
                                <input type="text" inputMode="numeric" value={it.healMp ?? ''} onChange={e => setGameData(p => {
                                  const v = e.target.value ? parseInt(e.target.value) : undefined;
                                  const copy = [...(p.items ?? [])]; copy[i] = { ...copy[i], healMp: v && !isNaN(v) ? v : undefined }; return { ...p, items: copy };
                                })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none text-center" />
                              </label>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              <label className="text-[9px] text-gray-400">
                                攻撃力
                                <input type="text" inputMode="numeric" value={it.atkBonus ?? ''} onChange={e => setGameData(p => {
                                  const v = e.target.value ? parseInt(e.target.value) : undefined;
                                  const copy = [...(p.items ?? [])]; copy[i] = { ...copy[i], atkBonus: v && !isNaN(v) ? v : undefined }; return { ...p, items: copy };
                                })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none text-center" />
                              </label>
                              <label className="text-[9px] text-gray-400">
                                防御力
                                <input type="text" inputMode="numeric" value={it.defBonus ?? ''} onChange={e => setGameData(p => {
                                  const v = e.target.value ? parseInt(e.target.value) : undefined;
                                  const copy = [...(p.items ?? [])]; copy[i] = { ...copy[i], defBonus: v && !isNaN(v) ? v : undefined }; return { ...p, items: copy };
                                })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none text-center" />
                              </label>
                            </div>
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-1 text-[9px] text-gray-400 cursor-pointer">
                                <input type="checkbox" checked={it.consumable ?? !!(it.healHp || it.healMp)} onChange={e => setGameData(p => {
                                  const copy = [...(p.items ?? [])]; copy[i] = { ...copy[i], consumable: e.target.checked || undefined }; return { ...p, items: copy };
                                })} className="accent-amber-500" />
                                消費する
                              </label>
                              <label className="flex items-center gap-1 text-[9px] text-gray-400 cursor-pointer">
                                <input type="checkbox" checked={it.discardable !== false} onChange={e => setGameData(p => {
                                  const copy = [...(p.items ?? [])]; copy[i] = { ...copy[i], discardable: e.target.checked || undefined }; return { ...p, items: copy };
                                })} className="accent-red-500" />
                                すてられる
                              </label>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              <label className="text-[9px] text-gray-400">
                                対象
                                <select value={it.targetType ?? ''} onChange={e => setGameData(p => {
                                  const copy = [...(p.items ?? [])]; copy[i] = { ...copy[i], targetType: (e.target.value || undefined) as ItemDef['targetType'] }; return { ...p, items: copy };
                                })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none">
                                  <option value="">未指定（自分/選択）</option>
                                  <option value="self">自分のみ</option>
                                  <option value="chooseAlly">仲間1人を選択</option>
                                  <option value="allAllies">仲間全員</option>
                                  <option value="enemy">敵1体を選択</option>
                                  <option value="allEnemies">敵全体</option>
                                </select>
                              </label>
                              {(it.targetType === 'enemy' || it.targetType === 'allEnemies') && (
                                <label className="text-[9px] text-gray-400">
                                  ダメージ
                                  <input type="text" inputMode="numeric" value={it.damage ?? ''} onChange={e => setGameData(p => {
                                    const v = e.target.value ? parseInt(e.target.value) : undefined;
                                    const copy = [...(p.items ?? [])]; copy[i] = { ...copy[i], damage: v && !isNaN(v) ? v : undefined }; return { ...p, items: copy };
                                  })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none text-center" />
                                </label>
                              )}
                            </div>
                            <div>
                              <label className="flex text-[9px] text-gray-400 mb-1 items-center gap-1">キャラ別の効果上書き（省略可）</label>
                              <div className="space-y-1">
                                {(it.overrides ?? []).map((ov, oi) => (
                                  <div key={oi} className="flex items-center gap-1">
                                    <select value={ov.memberId} onChange={e => setGameData(p => {
                                      const copy = [...(p.items ?? [])]; const ovs = [...(copy[i].overrides ?? [])];
                                      ovs[oi] = { ...ovs[oi], memberId: e.target.value }; copy[i] = { ...copy[i], overrides: ovs }; return { ...p, items: copy };
                                    })} className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none">
                                      <option value="">キャラを選択</option>
                                      {(gameData.battle?.party?.length ? gameData.battle.party : [{ id: 'self', name: '主人公' }]).map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                      ))}
                                    </select>
                                    <input type="text" inputMode="numeric" placeholder="HP" value={ov.healHp ?? ''} onChange={e => setGameData(p => {
                                      const v = e.target.value ? parseInt(e.target.value) : undefined;
                                      const copy = [...(p.items ?? [])]; const ovs = [...(copy[i].overrides ?? [])];
                                      ovs[oi] = { ...ovs[oi], healHp: v && !isNaN(v) ? v : undefined }; copy[i] = { ...copy[i], overrides: ovs }; return { ...p, items: copy };
                                    })} className="w-10 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none text-center" />
                                    <input type="text" inputMode="numeric" placeholder="MP" value={ov.healMp ?? ''} onChange={e => setGameData(p => {
                                      const v = e.target.value ? parseInt(e.target.value) : undefined;
                                      const copy = [...(p.items ?? [])]; const ovs = [...(copy[i].overrides ?? [])];
                                      ovs[oi] = { ...ovs[oi], healMp: v && !isNaN(v) ? v : undefined }; copy[i] = { ...copy[i], overrides: ovs }; return { ...p, items: copy };
                                    })} className="w-10 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none text-center" />
                                    <input type="text" inputMode="numeric" placeholder="Dmg" value={ov.damage ?? ''} onChange={e => setGameData(p => {
                                      const v = e.target.value ? parseInt(e.target.value) : undefined;
                                      const copy = [...(p.items ?? [])]; const ovs = [...(copy[i].overrides ?? [])];
                                      ovs[oi] = { ...ovs[oi], damage: v && !isNaN(v) ? v : undefined }; copy[i] = { ...copy[i], overrides: ovs }; return { ...p, items: copy };
                                    })} className="w-10 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none text-center" />
                                    <button onClick={() => setGameData(p => {
                                      const copy = [...(p.items ?? [])]; const ovs = [...(copy[i].overrides ?? [])]; ovs.splice(oi, 1);
                                      copy[i] = { ...copy[i], overrides: ovs.length > 0 ? ovs : undefined }; return { ...p, items: copy };
                                    })} className="shrink-0 px-1 py-0.5 rounded text-[9px] text-red-400 hover:text-red-300">✕</button>
                                  </div>
                                ))}
                              </div>
                              <button onClick={() => setGameData(p => {
                                const copy = [...(p.items ?? [])]; const ovs = [...(copy[i].overrides ?? []), { memberId: '' }];
                                copy[i] = { ...copy[i], overrides: ovs }; return { ...p, items: copy };
                              })} className="w-full flex items-center justify-center gap-1 py-1 rounded border border-dashed border-gray-700 text-[9px] text-gray-500 hover:bg-gray-100/5 mt-1">
                                <Plus size={10} />上書き追加</button>
                            </div>
                            <div>
                              <input value={it.useMessage ?? ''} onChange={e => setGameData(p => {
                                const copy = [...(p.items ?? [])]; copy[i] = { ...copy[i], useMessage: e.target.value || undefined }; return { ...p, items: copy };
                              })} placeholder="つかったときのメッセージ（省略可）" className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[9px] text-gray-300 outline-none" />
                            </div>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => setGameData(p => {
                        const arr = p.items ?? []; const id = `item${Date.now()}`;
                        return { ...p, items: [...arr, { id, name: `アイテム${arr.length + 1}`, emoji: '💊' }] };
                      })} className="w-full flex items-center justify-center gap-1 py-1.5 rounded border border-dashed border-gray-600 text-[10px] text-gray-400 hover:bg-gray-100/5 mt-1">
                        <Plus size={11} />アイテム追加</button>
                    </div>
                  </div>
                )}

                {/* ── WEAPON / ARMOR（装備品） ── */}
                {(editorTab === 'weapon' || editorTab === 'armor') && (() => {
                  const key = editorTab === 'weapon' ? 'weapons' : 'armors';
                  const label = editorTab === 'weapon' ? '⚔️ 武器定義' : '🛡️ 防具定義';
                  const list = (gameData[key] ?? []) as EquipmentDef[];
                  const party = gameData.battle?.party ?? [];
                  const restrictOptions = party.length ? party : [{ id: 'self', name: '主人公' }];
                  return (
                    <div className="space-y-4">
                      <div>
                        <label className="flex text-[11px] text-gray-400 mb-1.5 items-center gap-1">{label}</label>
                        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                          {list.length === 0 && <p className="text-[9px] text-gray-500 px-1">まだありません。「追加」ボタンで作成してください。</p>}
                          {list.map((it, i) => (
                            <div key={it.id} className="bg-gray-900 rounded-lg border border-gray-800 p-2.5 space-y-2">
                              <div className="flex items-center gap-1.5">
                                <input value={it.emoji} onChange={e => setGameData(p => {
                                  const copy = [...((p[key] ?? []) as EquipmentDef[])]; copy[i] = { ...copy[i], emoji: e.target.value.slice(0, 2) }; return { ...p, [key]: copy };
                                })} className="w-8 bg-gray-800 border border-gray-700 rounded text-center text-sm outline-none" />
                                <input value={it.name} onChange={e => setGameData(p => {
                                  const copy = [...((p[key] ?? []) as EquipmentDef[])]; copy[i] = { ...copy[i], name: e.target.value }; return { ...p, [key]: copy };
                                })} placeholder="名前" className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none" />
                                <button onClick={() => setGameData(p => {
                                  const copy = [...((p[key] ?? []) as EquipmentDef[])]; copy.splice(i, 1); return { ...p, [key]: copy.length > 0 ? copy : undefined };
                                })} className="shrink-0 px-2 py-1 rounded text-[11px] text-red-400 hover:text-red-300 active:bg-red-500/15">削除</button>
                              </div>
                              <div>
                                <textarea value={it.description ?? ''} onChange={e => setGameData(p => {
                                  const copy = [...((p[key] ?? []) as EquipmentDef[])]; copy[i] = { ...copy[i], description: e.target.value || undefined }; return { ...p, [key]: copy };
                                })} placeholder="せつめい（省略可）" rows={2} className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-gray-300 outline-none resize-none" />
                              </div>
                              <div className="grid grid-cols-3 gap-1.5">
                                <label className="text-[9px] text-gray-400">
                                  攻撃力
                                  <input type="text" inputMode="numeric" value={it.atkBonus ?? ''} onChange={e => setGameData(p => {
                                    const v = e.target.value ? parseInt(e.target.value) : undefined;
                                    const copy = [...((p[key] ?? []) as EquipmentDef[])]; copy[i] = { ...copy[i], atkBonus: v && !isNaN(v) ? v : undefined }; return { ...p, [key]: copy };
                                  })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none text-center" />
                                </label>
                                <label className="text-[9px] text-gray-400">
                                  防御力
                                  <input type="text" inputMode="numeric" value={it.defBonus ?? ''} onChange={e => setGameData(p => {
                                    const v = e.target.value ? parseInt(e.target.value) : undefined;
                                    const copy = [...((p[key] ?? []) as EquipmentDef[])]; copy[i] = { ...copy[i], defBonus: v && !isNaN(v) ? v : undefined }; return { ...p, [key]: copy };
                                  })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none text-center" />
                                </label>
                                <label className="text-[9px] text-gray-400">
                                  価格
                                  <input type="text" inputMode="numeric" value={it.price ?? ''} onChange={e => setGameData(p => {
                                    const v = e.target.value ? parseInt(e.target.value) : undefined;
                                    const copy = [...((p[key] ?? []) as EquipmentDef[])]; copy[i] = { ...copy[i], price: v && !isNaN(v) ? v : undefined }; return { ...p, [key]: copy };
                                  })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none text-center" />
                                </label>
                              </div>
                              <div>
                                <label className="flex text-[9px] text-gray-400 mb-1 items-center gap-1">
                                  装備可能キャラ（{(!it.restrictTo || it.restrictTo.length === 0) ? '誰でも装備可能' : `${it.restrictTo.length}人に限定`}）
                                </label>
                                <div className="flex flex-wrap gap-2">
                                  {restrictOptions.map((m, mi) => {
                                    const checked = (it.restrictTo ?? []).includes(m.id);
                                    return (
                                      <label key={m.id} className="flex items-center gap-1 text-[9px] text-gray-400 cursor-pointer">
                                        <input type="checkbox" checked={checked} onChange={e => setGameData(p => {
                                          const copy = [...((p[key] ?? []) as EquipmentDef[])];
                                          const cur = copy[i].restrictTo ?? [];
                                          const next = e.target.checked ? [...cur, m.id] : cur.filter(x => x !== m.id);
                                          copy[i] = { ...copy[i], restrictTo: next.length > 0 ? next : undefined };
                                          return { ...p, [key]: copy };
                                        })} className="accent-blue-500" />
                                        {mi === 0 && party.length === 0 ? '主人公' : m.name}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <button onClick={() => setGameData(p => {
                          const arr = (p[key] ?? []) as EquipmentDef[]; const id = `${editorTab}${Date.now()}`;
                          const created: EquipmentDef = { id, name: `${editorTab === 'weapon' ? '武器' : '防具'}${arr.length + 1}`, emoji: editorTab === 'weapon' ? '⚔️' : '🛡️' };
                          return { ...p, [key]: [...arr, created] };
                        })} className="w-full flex items-center justify-center gap-1 py-1.5 rounded border border-dashed border-gray-600 text-[10px] text-gray-400 hover:bg-gray-100/5 mt-1">
                          <Plus size={11} />{editorTab === 'weapon' ? '武器追加' : '防具追加'}</button>
                      </div>
                    </div>
                  );
                })()}

                {/* ── EFFECT（エフェクトアニメーション） ── */}
                {editorTab === 'effect' && (
                  <div className="space-y-4">
                    <div>
                      <label className="flex text-[11px] text-gray-400 mb-1.5 items-center gap-1">✨ エフェクトアニメーション</label>
                      <p className="text-[9px] text-gray-500 mb-2 leading-relaxed">
                        横一列に並んだ画像（例: 魔法エフェクトのスプライトシート）を等分割してアニメ再生します。
                        フィールドイベントの「エフェクト再生」コマンドや、呪文/技の「エフェクト」欄から使用できます。
                      </p>
                      <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
                        {(gameData.effects ?? []).length === 0 && <p className="text-[9px] text-gray-500 px-1">エフェクトがありません。下のボタンで作成してください。</p>}
                        {(gameData.effects ?? []).map((ef, i) => {
                          const url = imageRefToUrl(ef.imageRef) ?? ef.imageUrl;
                          return (
                            <div key={ef.id} className="bg-gray-900 rounded-lg border border-gray-800 p-2.5 space-y-2">
                              <div className="flex items-center gap-1.5">
                                <input value={ef.name} onChange={e => setGameData(p => {
                                  const copy = [...(p.effects ?? [])]; copy[i] = { ...copy[i], name: e.target.value }; return { ...p, effects: copy };
                                })} placeholder="エフェクト名" className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none" />
                                <button onClick={() => setGameData(p => {
                                  const copy = [...(p.effects ?? [])]; copy.splice(i, 1); return { ...p, effects: copy.length > 0 ? copy : undefined };
                                })} className="shrink-0 px-2 py-1 rounded text-[11px] text-red-400 hover:text-red-300 active:bg-red-500/15">削除</button>
                              </div>
                              <div className="flex items-center gap-2">
                                <button onClick={() => setPicker({ mode: 'image', target: { t: 'effectImage', id: ef.id } })}
                                  className="flex-1 flex items-center justify-between py-1.5 px-2 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[10px] text-gray-300">
                                  <span className="truncate">{ef.imageRef ? refLabel(ef.imageRef) : '未設定（画像を選択）'}</span>
                                  <ImageIcon size={12} className="shrink-0 ml-1" />
                                </button>
                                {url && (
                                  <div className="shrink-0 bg-gray-950 rounded border border-gray-700 overflow-hidden" style={{ width: 32, height: 32 }}>
                                    <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'left' }} />
                                  </div>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                <label className="text-[9px] text-gray-400">コマ数
                                  <input type="text" inputMode="numeric" value={ef.frameCount} onChange={e => setGameData(p => {
                                    const v = parseInt(e.target.value);
                                    const copy = [...(p.effects ?? [])]; copy[i] = { ...copy[i], frameCount: !isNaN(v) && v > 0 ? v : 1 }; return { ...p, effects: copy };
                                  })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none text-center" />
                                </label>
                                <label className="text-[9px] text-gray-400">FPS
                                  <input type="text" inputMode="numeric" value={ef.fps ?? ''} placeholder="12" onChange={e => setGameData(p => {
                                    const v = parseInt(e.target.value);
                                    const copy = [...(p.effects ?? [])]; copy[i] = { ...copy[i], fps: !isNaN(v) && v > 0 ? v : undefined }; return { ...p, effects: copy };
                                  })} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none text-center" />
                                </label>
                              </div>
                              <div className="flex items-center gap-2">
                                <button onClick={() => setPicker({ mode: 'bgm', target: { t: 'effectSfx', id: ef.id } })}
                                  className="flex-1 min-w-0 text-left text-[10px] text-gray-300 truncate bg-gray-800 border border-gray-700 rounded px-2 py-1.5">
                                  {ef.sfx ? refLabel(ef.sfx.ref) : 'SE未設定'}
                                </button>
                                {ef.sfx && <button onClick={() => previewMmlAsset(`effect-${ef.id}`, ef.sfx)} className="shrink-0 px-2 py-1.5 rounded-md text-[11px] text-emerald-300 hover:text-emerald-200 active:bg-emerald-500/15">試聴</button>}
                                {ef.sfx && <button onClick={() => setGameData(p => {
                                  const copy = [...(p.effects ?? [])]; copy[i] = { ...copy[i], sfx: undefined }; return { ...p, effects: copy };
                                })} className="shrink-0 grid place-items-center w-8 h-8 -my-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition"><Trash2 size={14} /></button>}
                              </div>
                              <div className="flex items-center gap-2 pt-1 border-t border-gray-800">
                                <button onClick={() => setPlayingEffectPreview(id => id === ef.id ? null : ef.id)}
                                  className="px-2.5 py-1 rounded-md text-[10px] text-blue-300 hover:text-blue-200 active:bg-blue-500/15 border border-blue-800">
                                  {playingEffectPreview === ef.id ? '■ 停止' : '▶ プレビュー'}
                                </button>
                                {playingEffectPreview === ef.id && url && (
                                  <EffectSpriteAnim effect={ef} url={url} sizePx={40} loop />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <button onClick={() => setGameData(p => {
                        const arr = p.effects ?? [];
                        return { ...p, effects: [...arr, { id: uid(), name: `エフェクト${arr.length + 1}`, imageRef: '', frameCount: 1, fps: 12 }] };
                      })} className="w-full flex items-center justify-center gap-1 py-1.5 rounded border border-dashed border-gray-600 text-[10px] text-gray-400 hover:bg-gray-100/5 mt-1">
                        <Plus size={11} />新規作成</button>
                    </div>

                    <div>
                      <label className="flex text-[11px] text-gray-400 mb-1.5 items-center gap-1">📦 プリセットから追加</label>
                      <div className="space-y-1.5">
                        {BUILT_IN_EFFECT_PRESETS.map(bp => (
                          <div key={bp.name} className="flex items-center justify-between bg-gray-900 rounded-lg border border-gray-800 px-2.5 py-1.5">
                            <span className="text-[11px] text-gray-300">{bp.name}</span>
                            <button onClick={() => setGameData(p => ({ ...p, effects: [...(p.effects ?? []), { ...bp, id: uid() }] }))}
                              className="px-2.5 py-1 rounded text-[10px] text-emerald-400 border border-emerald-700 active:bg-emerald-500/10 font-bold">+ 追加</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── SOUND ── */}
                {editorTab === 'sound' && (
                  <div className="space-y-4">
                    {/* 道中BGM */}
                    <div>
                      <label className="flex text-[11px] text-gray-400 mb-1 items-center gap-1">
                        <Music size={12} />{gameData.engine === 'touhou' ? '道中BGM' : 'BGM'}
                      </label>
                      {(gameData.scenes?.length ?? 0) > 0 && (
                        <p className="text-[10px] text-amber-400 mb-1.5 leading-relaxed">
                          ⚠ シーンを使用中は、シーンごとのBGM設定がここでの設定より優先されます。
                          「シーン固有BGM」が空欄のシーンだけ、ここでの設定が使われます。
                        </p>
                      )}
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
                      {gameData.scenes && gameData.scenes.length > 0 && (
                        <div className="mt-2.5 pt-2.5 border-t border-gray-700/50 space-y-2">
                          <p className="text-[10px] text-gray-400">シーンごとのBGM（空欄のシーンは上の全体BGMを使用）</p>
                          {gameData.scenes.map((sc, idx) => (
                            <div key={sc.id} className="space-y-1.5 rounded-lg border border-gray-800 bg-gray-900/60 p-2">
                              <div className="flex items-center justify-between text-[10px] text-gray-400">
                                <span className="truncate">
                                  {sc.name ?? `シーン${idx + 1}`}
                                  {idx === editSceneIdx && <span className="ml-1 text-blue-400">（編集中）</span>}
                                </span>
                                {sc.bgm && (
                                  <button onClick={() => setGameData(p => ({ ...p, scenes: p.scenes!.map((s, i) => i === idx ? { ...s, bgm: undefined } : s) }))}
                                    className="shrink-0 px-2 py-1 -my-1 text-gray-500 hover:text-red-400">外す</button>
                                )}
                              </div>
                              <button onClick={() => setPicker({ mode: 'bgm', target: { t: 'sceneBgm', idx } })}
                                className="w-full flex items-center justify-between py-1.5 px-2 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[10px] text-gray-300">
                                <span className="truncate">{sc.bgm ? refLabel(sc.bgm.ref) : '未設定（全体のBGMを使用）'}</span>
                                <Music size={12} className="shrink-0 ml-1" />
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
                          ))}
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

                {/* ── SCENE ── */}
                {editorTab === 'scene' && gameData.scenes && (
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

                          {/* ランダムエンカウント設定 */}
                          {gameData.engine === 'rpg' && (
                            <div className="space-y-1.5 pt-1.5 border-t border-gray-850">
                              <span className="text-[9px] text-gray-400">👾 ランダムエンカウント</span>
                              <label className="flex items-center gap-2 text-[10px] text-gray-400">
                                発生ステップ数
                                <input type="number" min={1} max={999} placeholder="16"
                                  value={sc.encounterRate ?? ''}
                                  onChange={e => updateSceneAt(idx, s => ({ ...s, encounterRate: e.target.value === '' ? undefined : Math.max(1, Number(e.target.value) || 16) }))}
                                  className="w-16 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-200 outline-none" />
                                <span className="text-gray-500">歩（未設定=16）</span>
                              </label>

                              {(sc.encounterGroups ?? []).map((g, gi) => (
                                <div key={g.id} className="rounded-lg border border-gray-800 bg-gray-900/60 p-2 space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <input value={g.name ?? ''} placeholder={`グループ${gi + 1}`}
                                      onChange={e => updateEncounterGroup(idx, g.id, { name: e.target.value })}
                                      className="flex-1 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-200 outline-none min-w-0" />
                                    <label className="flex items-center gap-1 text-[9px] text-gray-500 shrink-0">
                                      比重
                                      <input type="number" min={0} step={0.1} value={g.weight}
                                        onChange={e => updateEncounterGroup(idx, g.id, { weight: Math.max(0, Number(e.target.value) || 0) })}
                                        className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-200 outline-none" />
                                    </label>
                                    <button onClick={() => removeEncounterGroup(idx, g.id)} className="text-gray-600 hover:text-red-400 shrink-0"><X size={12} /></button>
                                  </div>
                                  <div className="space-y-1">
                                    {g.enemies.map((en, ei) => (
                                      <div key={ei} className="flex items-center gap-1 flex-wrap bg-gray-950/60 rounded px-1.5 py-1">
                                        <input value={en.emoji} onChange={e => updateEncounterEnemy(idx, g.id, ei, { emoji: e.target.value })}
                                          className="w-8 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-200 outline-none text-center" />
                                        <input value={en.name} onChange={e => updateEncounterEnemy(idx, g.id, ei, { name: e.target.value })} placeholder="名前"
                                          className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-200 outline-none" />
                                        {(['hp', 'atk', 'def', 'exp'] as const).map(k => (
                                          <label key={k} className="flex items-center gap-0.5 text-[9px] text-gray-500 shrink-0">
                                            {k.toUpperCase()}
                                            <input type="number" min={0} value={en[k]}
                                              onChange={e => updateEncounterEnemy(idx, g.id, ei, { [k]: Math.max(0, Number(e.target.value) || 0) })}
                                              className="w-10 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-200 outline-none" />
                                          </label>
                                        ))}
                                        <button onClick={() => removeEncounterEnemy(idx, g.id, ei)} className="text-gray-600 hover:text-red-400 shrink-0"><X size={11} /></button>
                                      </div>
                                    ))}
                                    <button onClick={() => addEncounterEnemy(idx, g.id)}
                                      className="w-full flex items-center justify-center gap-1 py-1 rounded border border-dashed border-gray-700 text-[9px] text-gray-500 hover:bg-gray-100/5">
                                      <Plus size={10} />敵を追加
                                    </button>
                                  </div>
                                </div>
                              ))}
                              <button onClick={() => addEncounterGroup(idx)}
                                className="w-full flex items-center justify-center gap-1 py-1.5 rounded border border-dashed border-gray-600 text-[10px] text-gray-400 hover:bg-gray-100/5">
                                <Plus size={11} />エンカウントグループを追加
                              </button>
                              <p className="text-[9px] text-gray-600 leading-relaxed">歩行中、比重に応じてグループを抽選→グループ内の敵から均等に1体選んで戦闘開始。グループが無い場合エンカウントなし。</p>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* ── ワープ床の設定（マップタブで special: シーン切替床 に設定したタイル） ── */}
                    {Object.entries(gameData.tiles).filter(([, t]) => t.special === 'warp').length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-gray-800">
                        <span className="text-[11px] text-gray-400 font-bold flex items-center gap-1">🚪 ワープ床の設定</span>
                        {Object.entries(gameData.tiles).filter(([, t]) => t.special === 'warp').map(([idStr, tile]) => {
                          const id = Number(idStr);
                          return (
                            <div key={id} className="rounded-lg border border-gray-700 bg-gray-900/40 p-2 space-y-1.5">
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 shrink-0 rounded border border-gray-600" style={{ backgroundColor: tile.color }} />
                                <span className="text-[10px] text-gray-300 truncate">{tile.name}</span>
                              </div>
                              <WarpDestinationEditor
                                scenes={gameData.scenes}
                                sceneId={tile.warpSceneId}
                                onSceneChange={warpSceneId => updateTile(id, { warpSceneId })}
                                entryCol={tile.warpEntryCol ?? 1}
                                entryRow={tile.warpEntryRow ?? 1}
                                onEntryChange={(warpEntryCol, warpEntryRow) => updateTile(id, { warpEntryCol, warpEntryRow })}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <p className="text-[9px] text-gray-600 leading-relaxed">
                      シーンを選択するとマップ・オブジェクトタブで編集できます。<br />
                      プレイ中に指定した辺に到達するとスライドで遷移します。
                    </p>
                  </div>
                )}

                {/* ── SWITCH（イベント制御用変数）── */}
                {editorTab === 'switch' && (
                  <div className="space-y-4">
                    {/* ── スイッチ一覧エディタ ── */}
                    <div>
                      <label className="flex text-[11px] text-gray-400 mb-1.5 items-center gap-1">🔘 スイッチ（イベントフラグ）</label>
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
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {picker && picker.mode === 'image' && (() => {
        // このゲーム内で現在使われている画像参照の一覧（履歴タブ用）。同じ ref は重複させない。
        const seen = new Set<string>();
        const usedImageAssets: { ref: string; url?: string; label: string }[] = [];
        const addUsed = (ref: string | undefined, url: string | undefined, label: string) => {
          if (!ref || !isImageRef(ref) || seen.has(ref)) return;
          seen.add(ref);
          usedImageAssets.push({ ref, url, label });
        };
        addUsed(gameData.player.spriteRef, gameData.player.spriteUrl, '主人公');
        for (const o of gameData.objects) addUsed(o.spriteRef, o.spriteUrl, o.name || `オブジェ: ${o.emoji}`);
        for (const [id, t] of Object.entries(gameData.tiles)) addUsed(t.imageRef, t.imageUrl, t.name || `タイル#${id}`);

        return (
          <ContentPicker
            mode={picker.mode}
            bgmKind={picker.target.t === 'sfx' ? 'sfx' : 'bgm'}
            userId={userId}
            usedAssets={usedImageAssets}
            onPick={applyPick}
            onClose={() => setPicker(null)}
          />
        );
      })()}
      {picker && picker.mode === 'bgm' && (() => {
        // 再編集時にタブ・URL/MML欄を復元できるよう、対象スロットの現在の参照を渡す。
        const target = picker.target;
        const currentRef =
          target.t === 'bgm' ? gameData.bgm?.ref :
            target.t === 'battleBgm' ? gameData.battleBgm?.ref :
              target.t === 'bossBgm' ? gameData.bossBgm?.ref :
                target.t === 'sfx' ? gameData.sfx[target.trigger]?.ref :
                  target.t === 'titleBgm' ? gameData.titleScreen?.bgmRef :
                    target.t === 'endingBgm' ? gameData.ending?.bgmRef :
                      target.t === 'sceneBgm' ? gameData.scenes?.[target.idx]?.bgm?.ref :
                        undefined;
        return (
          <ContentPicker
            mode={picker.mode}
            bgmKind={target.t === 'sfx' ? 'sfx' : 'bgm'}
            userId={userId}
            currentRef={currentRef}
            onPick={applyPick}
            onClose={() => setPicker(null)}
          />
        );
      })()}
      <HistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        storageKey={isPlaying || playOnly ? playStorageKey : editStorageKey}
        type={isPlaying || playOnly ? 'gameplay' : 'gamemaker'}
        onRestore={handleRestoreHistory}
        getCurrentData={getCurrentDataForHistory}
      />
    </div>
  );
}

// ── ワープ先設定（マップ:警備床タイル / オブジェ:warpオブジェクト で共用） ──
function WarpDestinationEditor({
  scenes, sceneId, onSceneChange, entryCol, entryRow, onEntryChange,
  sameSceneTarget, onSameSceneTargetChange,
}: {
  scenes: SceneDef[] | undefined;
  sceneId: string | undefined; onSceneChange: (id: string | undefined) => void;
  entryCol: number; entryRow: number; onEntryChange: (col: number, row: number) => void;
  /** オブジェクトのワープ設定のみ：シーン未選択時に同シーン内の座標へワープさせるフォールバック。 */
  sameSceneTarget?: { col: number; row: number };
  onSameSceneTargetChange?: (col: number, row: number) => void;
}) {
  const hasScenes = (scenes?.length ?? 0) > 0;
  return (
    <div className="space-y-1.5">
      {hasScenes && (
        <label className="text-[10px] text-gray-400 flex items-center gap-1">🚪 遷移先シーン
          <select value={sceneId ?? ''} onChange={e => onSceneChange(e.target.value || undefined)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-200 outline-none">
            <option value="">{onSameSceneTargetChange ? '（同シーン内ワープ）' : '（未設定）'}</option>
            {(scenes ?? []).map(s => <option key={s.id} value={s.id}>{s.name ?? s.id}</option>)}
          </select>
        </label>
      )}
      {hasScenes && sceneId && (
        <div className="grid grid-cols-2 gap-1.5">
          <label className="text-[10px] text-gray-400">入場X(列)
            <input type="number" value={entryCol} onChange={e => onEntryChange(Number(e.target.value), entryRow)}
              className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-200 outline-none" />
          </label>
          <label className="text-[10px] text-gray-400">入場Y(行)
            <input type="number" value={entryRow} onChange={e => onEntryChange(entryCol, Number(e.target.value))}
              className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-200 outline-none" />
          </label>
        </div>
      )}
      {!sceneId && onSameSceneTargetChange && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] text-gray-400">ワープ先X(列)
            <input type="number" value={sameSceneTarget?.col ?? 0}
              onChange={e => onSameSceneTargetChange(Number(e.target.value), sameSceneTarget?.row ?? 0)}
              className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" />
          </label>
          <label className="text-[10px] text-gray-400">ワープ先Y(行)
            <input type="number" value={sameSceneTarget?.row ?? 0}
              onChange={e => onSameSceneTargetChange(sameSceneTarget?.col ?? 0, Number(e.target.value))}
              className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[11px] text-gray-200 outline-none" />
          </label>
        </div>
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
  overheadMessage: '頭上メッセージ', playSound: '効果音再生',
  changeSprite: '画像変更', changeBackground: '背景変更', showImage: '画像表示', hideImage: '画像消去',
  followImage: '追随画像', pauseImage: '画像一時停止', resumeImage: '画像再開',
  moveCamera: 'カメラ移動', resetCamera: 'カメラリセット', moveNpc: 'NPC移動', screenEffect: '画面エフェクト', clearScreenEffect: '画面エフェクト消去', changePhase: 'フェーズ変更',
  playEffect: 'エフェクト再生',
};

const NEW_COMMAND = (): EventCommand => ({ type: 'message', text: '' });

function EventPageEditor({ pages, setPages, switches, items, effects, setPreviewCommand }:
  { pages: EventPage[]; setPages: (p: EventPage[]) => void; switches: SwitchDef[]; items: ItemDef[]; effects: EffectPreset[]; setPreviewCommand: (cmd: EventCommand | null) => void; }) {
  const [expanded, setExpanded] = useState<number>(0);
  const [detailsCmdIndex, setDetailsCmdIndex] = useState<{ pi: number; ci: number } | null>(null);
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
      {detailsCmdIndex && (
        <ImageCommandDetailsModal
          cmd={pages[detailsCmdIndex.pi].commands[detailsCmdIndex.ci]}
          onChange={(patch) => {
            const newCmd = { ...pages[detailsCmdIndex.pi].commands[detailsCmdIndex.ci], ...patch } as EventCommand;
            updCmd(detailsCmdIndex.pi, detailsCmdIndex.ci, patch);
            setPreviewCommand(newCmd);
          }}
          onClose={() => { setDetailsCmdIndex(null); setPreviewCommand(null); }}
        />
      )}
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
          <div onClick={() => setExpanded(expanded === pi ? -1 : pi)}
            className="w-full flex items-center gap-1 px-2 py-1.5 text-[10px] text-left font-bold text-gray-300 hover:bg-gray-700/30 cursor-pointer">
            <span className="text-gray-500">{expanded === pi ? '▼' : '▶'}</span>
            <span className="flex-1 truncate">{page.name}</span>
            <span className="text-[9px] text-gray-500">{page.commands.length}コマンド</span>
            {pages.length > 1 && <button onClick={e => { e.stopPropagation(); delPage(pi); }}
              className="text-red-400 hover:text-red-300 text-[9px] px-1">削除</button>}
          </div>
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
                  switches={switches} items={items} effects={effects}
                  onChange={patch => updCmd(pi, ci, patch)}
                  onDelete={() => delCmd(pi, ci)}
                  onMove={dir => moveCmd(pi, ci, dir)}
                  onShowDetails={() => {
                    setDetailsCmdIndex({ pi, ci });
                    setPreviewCommand(cmd);
                  }}
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

function ImageCommandDetailsModal({ cmd, onChange, onClose }: { cmd: EventCommand; onChange: (patch: Partial<EventCommand>) => void; onClose: () => void }) {
  if (cmd.type !== 'showImage' && cmd.type !== 'changeSprite') return null;
  const isImg = cmd.type === 'showImage';
  const c = cmd as any;

  const numInput = (label: string, key: string, max?: number, min?: number) => (
    <label className="flex flex-col text-[9px] text-gray-400 gap-0.5">
      {label}
      <input type="number" value={c[key] ?? 0} onChange={e => onChange({ [key]: Number(e.target.value) })}
        max={max} min={min}
        className="bg-gray-800 border border-gray-700 rounded px-1 py-1 text-gray-200 outline-none w-full" />
    </label>
  );

  const checkInput = (label: string, key: string) => (
    <label className="flex items-center gap-1 text-[9px] text-gray-300">
      <input type="checkbox" checked={!!c[key]} onChange={e => onChange({ [key]: e.target.checked })} />
      {label}
    </label>
  );

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end md:flex-row md:justify-end md:items-center p-2 md:p-4 pointer-events-none">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-sm flex flex-col max-h-[50vh] md:max-h-[90vh] pointer-events-auto mt-auto md:mt-0">
        <div className="px-3 py-2 border-b border-gray-800 flex justify-between items-center bg-gray-800/50 rounded-t-lg">
          <span className="text-[11px] font-bold text-gray-300">画像コマンド詳細 ({isImg ? 'DW_IMA' : 'DW_FL'})</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={14} /></button>
        </div>
        <div className="p-3 overflow-y-auto space-y-4">
          {/* 基本 */}
          <div className="space-y-1.5">
            <div className="text-[10px] text-gray-400 border-b border-gray-800 pb-0.5">基本設定</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col text-[9px] text-gray-400 gap-0.5">
                {isImg ? '画像ID (i)' : '対象ID (target)'}
                <input value={isImg ? (c.imgId ?? '') : (c.objId ?? '')} onChange={e => onChange(isImg ? { imgId: e.target.value } : { objId: e.target.value })}
                  className="bg-gray-800 border border-gray-700 rounded px-1 py-1 text-gray-200 outline-none" />
              </label>
              <label className="flex flex-col text-[9px] text-gray-400 gap-0.5">
                画像URL (u)
                <input value={isImg ? (c.url ?? '') : (c.spriteRef ?? '')} onChange={e => onChange(isImg ? { url: e.target.value } : { spriteRef: e.target.value })}
                  className="bg-gray-800 border border-gray-700 rounded px-1 py-1 text-gray-200 outline-none" />
              </label>
            </div>
          </div>

          {/* 描画先 */}
          <div className="space-y-1.5">
            <div className="text-[10px] text-gray-400 border-b border-gray-800 pb-0.5">描画先 (Destination)</div>
            <div className="grid grid-cols-4 gap-2">
              {numInput('X', 'x')}
              {numInput('Y', 'y')}
              {numInput('W', 'w')}
              {numInput('H', 'h')}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {checkInput('X,Yは%指定 (xp)', 'xp')}
              {checkInput('W,Hは%指定 (wp)', 'wp')}
              {isImg && checkInput('マップ座標追従 (m)', 'm')}
              {checkInput('中央基準 (c)', 'c')}
            </div>
          </div>

          {/* クロップ */}
          <div className="space-y-1.5">
            <div className="text-[10px] text-gray-400 border-b border-gray-800 pb-0.5">クロップ元 (Source)</div>
            <div className="grid grid-cols-4 gap-2">
              {numInput('Crop X (sx)', 'sx')}
              {numInput('Crop Y (sy)', 'sy')}
              {numInput('Crop W (sw)', 'sw')}
              {numInput('Crop H (sh)', 'sh')}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {checkInput('sx,syは%指定 (sxp)', 'sxp')}
              {checkInput('sw,shは%指定 (swp)', 'swp')}
            </div>
          </div>

          {/* アニメーション・その他 */}
          <div className="space-y-1.5">
            <div className="text-[10px] text-gray-400 border-b border-gray-800 pb-0.5">変形・アニメーション</div>
            <div className="grid grid-cols-4 gap-2">
              {numInput('原点 X (ox)', 'ox')}
              {numInput('原点 Y (oy)', 'oy')}
              {numInput('回転 (r)', 'r')}
              {numInput('不透明度 (a)', 'opacity', 100, 0)}
            </div>
            {isImg && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {numInput('コマ間隔ms (ms)', 'ms')}
                <div className="flex items-center mt-3">
                  {checkInput('ループ再生 (lp)', 'lp')}
                </div>
              </div>
            )}
          </div>
          <div className="text-[9px] text-gray-500 pt-2 border-t border-gray-800">
            ※プレビューはキャンバス上にリアルタイムで表示されます。
          </div>
        </div>
      </div>
    </div>
  );
}

function CommandEditor({ cmd, index, count, switches, items, effects, onChange, onDelete, onMove, onShowDetails }:
  {
    cmd: EventCommand; index: number; count: number; switches: SwitchDef[]; items: ItemDef[]; effects: EffectPreset[];
    onChange: (patch: Partial<EventCommand>) => void; onDelete: () => void; onMove: (dir: -1 | 1) => void;
    onShowDetails: () => void;
  }) {
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
        case 'overheadMessage': return { type: 'overheadMessage', text: '' };
        case 'playSound': return { type: 'playSound', src: '' };
        case 'changeSprite': return { type: 'changeSprite', spriteRef: '', objId: '' };
        case 'changeBackground': return { type: 'changeBackground', bgRef: '' };
        case 'showImage': return { type: 'showImage', imgId: '', url: '', x: 0, y: 0 };
        case 'hideImage': return { type: 'hideImage', imgId: '' };
        case 'moveCamera': return { type: 'moveCamera', tx: 0, ty: 0, duration: 0 };
        case 'resetCamera': return { type: 'resetCamera', duration: 0 };
        case 'moveNpc': return { type: 'moveNpc', objId: 'player' };
        case 'clearScreenEffect': return { type: 'clearScreenEffect' };
        case 'screenEffect': return { type: 'screenEffect', effects: [] };
        case 'changePhase': return { type: 'changePhase', phaseIndex: 0 };
        case 'playEffect': return { type: 'playEffect', effectId: '', target: 'self' };
        default: return { type: 'message', text: '' };
      }
    })();
    onChange(base as Partial<EventCommand>);
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
        {type === 'overheadMessage' && (
          <textarea value={(cmd as any).text ?? ''} onChange={e => onChange({ text: e.target.value })}
            rows={2} className={inputCls} placeholder="頭上メッセージ" />
        )}
        {type === 'playSound' && (
          <input value={(cmd as any).src ?? ''} onChange={e => onChange({ src: e.target.value })}
            className={inputCls} placeholder="効果音URL（mp3）" />
        )}
        {type === 'changeSprite' && (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <input value={(cmd as any).objId ?? ''} onChange={e => onChange({ objId: e.target.value })}
                className={inputCls} placeholder="対象ID (player 等)" />
              <input value={(cmd as any).spriteRef ?? ''} onChange={e => onChange({ spriteRef: e.target.value })}
                className={inputCls} placeholder="画像URL (sprite: 等)" />
            </div>
            {(cmd as any).spriteRef && (
              <div className="flex justify-center border border-gray-700 bg-gray-900 rounded p-1">
                <img src={(cmd as any).spriteRef.replace('sprite:', '')} className="max-h-16 object-contain" alt="preview" />
              </div>
            )}
          </div>
        )}
        {type === 'changeBackground' && (
          <div className="space-y-1">
            <input value={(cmd as any).bgRef ?? ''} onChange={e => onChange({ bgRef: e.target.value })}
              className={inputCls} placeholder="背景画像URL (bg: 等)" />
            {(cmd as any).bgRef && (
              <div className="flex justify-center border border-gray-700 bg-gray-900 rounded p-1">
                <img src={(cmd as any).bgRef.replace('bg:', '')} className="max-h-16 object-contain" alt="preview" />
              </div>
            )}
          </div>
        )}
        {type === 'showImage' && (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <input value={(cmd as any).imgId ?? ''} onChange={e => onChange({ imgId: e.target.value })}
                className="w-16 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none" placeholder="画像ID" />
              <input value={(cmd as any).url ?? ''} onChange={e => onChange({ url: e.target.value })}
                className={inputCls} placeholder="画像URL" />
              <button onClick={onShowDetails} className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white rounded px-2 py-0.5 text-[9px]">詳細</button>
            </div>
            <div className="flex items-center gap-1">
              <input type="number" value={(cmd as any).x ?? 0} onChange={e => onChange({ x: Number(e.target.value) })}
                className="w-16 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none" placeholder="X" />
              <input type="number" value={(cmd as any).y ?? 0} onChange={e => onChange({ y: Number(e.target.value) })}
                className="w-16 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none" placeholder="Y" />
            </div>
            {(cmd as any).url && (
              <div className="flex justify-center border border-gray-700 bg-gray-900 rounded p-1">
                <img src={(cmd as any).url} className="max-h-16 object-contain" alt="preview" />
              </div>
            )}
          </div>
        )}
        {type === 'hideImage' && (
          <input value={(cmd as any).imgId ?? ''} onChange={e => onChange({ imgId: e.target.value })}
            className={inputCls} placeholder="消去する画像ID" />
        )}
        {type === 'moveCamera' && (
          <div className="flex items-center gap-1">
            <input type="number" value={(cmd as any).tx ?? 0} onChange={e => onChange({ tx: Number(e.target.value) })}
              className="w-16 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none" placeholder="目標X" />
            <input type="number" value={(cmd as any).ty ?? 0} onChange={e => onChange({ ty: Number(e.target.value) })}
              className="w-16 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none" placeholder="目標Y" />
            <input type="number" value={(cmd as any).duration ?? 0} onChange={e => onChange({ duration: Number(e.target.value) })}
              className="w-16 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none" placeholder="フレーム数" />
          </div>
        )}
        {type === 'moveNpc' && (
          <input value={(cmd as any).objId ?? ''} onChange={e => onChange({ objId: e.target.value })}
            className={inputCls} placeholder="対象NPCのID" />
        )}
        {type === 'screenEffect' && (
          <input
            value={(cmd as any).effects?.[0]?.color ?? ''}
            onChange={e => {
              const color = e.target.value;
              onChange({
                effects: [
                  {
                    type: 'solid',
                    color,
                    c1: '',
                    c2: '',
                    pos: '',
                    stops: '',
                  },
                ],
              });
            }}
            className={inputCls}
            placeholder="エフェクト色 (例: 255-0-0-50)"
          />
        )}
        {type === 'changePhase' && (
          <input type="number" value={(cmd as any).phaseIndex ?? 0} onChange={e => onChange({ phaseIndex: Number(e.target.value) })}
            className={inputCls} placeholder="移行先フェーズ番号" />
        )}
        {type === 'playEffect' && (
          <div className="flex items-center gap-1 flex-wrap">
            <select value={(cmd as any).effectId ?? ''} onChange={e => onChange({ effectId: e.target.value })}
              className={inputCls} style={{ width: 'auto', flex: '1 1 auto' }}>
              <option value="">（エフェクトを選択）</option>
              {effects.map(ef => <option key={ef.id} value={ef.id}>{ef.name}</option>)}
            </select>
            <select value={(cmd as any).target ?? 'self'} onChange={e => onChange({ target: e.target.value as 'self' | 'player' })}
              className={inputCls} style={{ width: 'auto' }}>
              <option value="self">自分の位置</option>
              <option value="player">プレイヤーの位置</option>
            </select>
            <label className="flex items-center gap-0.5 text-[9px] text-gray-400 cursor-pointer shrink-0">
              <input type="checkbox" checked={!!(cmd as any).wait} onChange={e => onChange({ wait: e.target.checked || undefined })} className="accent-blue-500" />
              完了まで待つ
            </label>
          </div>
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

