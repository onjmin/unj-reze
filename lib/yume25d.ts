// 2.5Dエンジン（yume25d）: Build エンジン風の「床＋薄板壁＋ビルボード」ワールドを
// three.js で低解像度レンダリングする。レイアウトは Layout25D（プレーンJSON）が唯一の真実で、
// setLayout() でいつでも丸ごと再構築できる。使い終わったら必ず dispose() を呼ぶこと。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneWithSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SYS_TILE_WARP_SFX, SYS_TILE_DAMAGE_SFX, type Layout25D, type Tex25D, type Dir4, type Billboard25D } from '@/components/game-presets/shared';
import { detectStandard, standardById, cellRect, walkFrameIndex, type WalkStandard, type WayKey } from '@/lib/walk-sprite';
import { parseWalkRef, type WalkRef } from '@/lib/asset-ref';
import { buildMinecraftModel, type MinecraftLimbs } from '@/lib/minecraft-model';
import { applyMasterVolume } from '@/lib/master-volume';

/** 内部レンダリング解像度。CSS 側で pixelated 拡大してドット感を出す。 */
export const RENDER_W = 320;
export const RENDER_H = 240;

const PLAYER_RADIUS = 0.22;
const MOVE_SPEED = 2.4;    // マス/秒
const STRAFE_SPEED = 2.0;  // マス/秒
const TURN_SPEED = 2.4;    // ラジアン/秒
const DASH_MULT = 1.8;     // Shift（ダッシュ）中の速度倍率
const AI_DASH_MULT = 2.6;  // NPCランダムダッシュの速度倍率（AI基準速度1.0マス/秒に対して）
const EPS = 1e-3;

// 短くポンと跳ねる程度のジャンプ（頭上の低い夢空間を想定）。レイアウト jumpHeight で上書き可。
const JUMP_VELOCITY_DEFAULT = 3.2;
const GRAVITY = 16;

// 編集モードの空中浮遊：上昇/下降速度（マス/秒）と高度上限（マス）。
const FLY_SPEED = 2.6;
const FLY_MAX_ALT = 48;

// ── システム床（Tex25D.special 付きの床）: 2Dエンジンのシステムタイルの yume25d 版 ──
// warp=同一マップ内の座標転送（シーンが無いため）、damage=ゆめから さめて スタートへ戻る（HPが無いため）、
// ice-*=矢印方向への強制スライド。ジャンプ中（hop>0）は床の効果を受けない＝飛び越えられる。
const ICE_SLIDE_SPEED = 3.6;  // マス/秒。歩行より速く「滑ってる」感を出す
const ICE_DIR_VEC: Record<string, [number, number]> = {
  'ice-up': [0, -1], 'ice-right': [1, 0], 'ice-down': [0, 1], 'ice-left': [-1, 0],
};
const FADE_OUT_SEC = 0.25;
const FADE_IN_SEC = 0.4;

// ── 遊べるオブジェクト（システムスプライト） ──
// ボール：本物の球体メッシュ（模様なし・単色＋焼き込み陰影）。プレイヤーが触れると
// 蹴った方向へ転がり、壁・マップ端で跳ね返って減速する。常に重力で自由落下する。
const BALL_RADIUS = 0.22;    // 半径の既定値（Tex25D.ballRadius で変更可）
const KICK_SPEED = 4.5;      // 蹴った直後の水平速度（マス/秒）
const KICK_UP = 2.2;         // 蹴った直後の上向き速度（軽く浮いてバウンドする）
const BALL_FRICTION = 1.4;   // 接地中の転がり減速（1秒あたりの速度割合）。空中では効かない
const BALL_BOUNCE = 0.7;     // 壁反射の反発係数
const BALL_BOUNCE_Y = 0.5;   // 地面バウンドの反発係数
const BALL_STOP_EPS = 0.05;  // これ未満の速度は停止扱い
// ブロック：一辺1マスの立方体（サイズ固定）。上に乗れる・接地中は2段までよじ登れる（Build/Doom風の階段）。
// よじ登りは瞬間ワープではなく CLIMB_SPEED で「よいしょ」と時間をかけて上る。
const BLOCK_SIZE = 1;
const BLOCK_CLIMB_MAX = BLOCK_SIZE * 2 + 0.05;  // 自動でよじ登れる最大段差（2段まで。3段以上は壁）
const CLIMB_SPEED = 3.4;                        // よじ登りの上昇速度（マス/秒）≒1段0.3秒
const PLAYER_BODY_H = 0.9;              // ブロック側面判定に使う体の高さ
// 海（水面）：waterLevel から下がすべて水。落下は水の抵抗で沈降速度へ収束し「ゆっくり沈む」。
const WATER_SINK_V = -0.7;    // 沈降速度（マス/秒）
const WATER_DRAG = 3.0;       // 水の抵抗（1/秒。落下の勢いがこの速さで沈降速度へ収束）
const SWIM_UP_V = 1.7;        // ひとかき（ジャンプ入力）の上昇速度
const WATER_MOVE_MULT = 0.55; // 水中の移動速度倍率
const WATER_DEFAULT_COLOR = '#2f7fa8';
const LAVA_DEFAULT_COLOR = '#d35400';  // waterKind==='lava' の既定色（マグマ色）
// 水没ダメージ（layout.waterDamage で対象別に有効化）：浸かっている間、1秒おきに削る。溶岩は倍。
const SUBMERGE_DMG_INTERVAL = 1.0;
const SUBMERGE_DMG_WATER = 2;      // 1ハート/秒
const SUBMERGE_DMG_LAVA = 4;       // 2ハート/秒
const NPC_SUBMERGE_SEC = 3;        // 住人（NPC/敵）が水没から倒れるまでの秒数（溶岩は半分）
// 酸素（layout.oxygen で有効化）：Minecraft風。頭まで潜ると減り、尽きたら1秒おきに窒息ダメージ。
// 水面に出れば倍速で回復する。
const OXYGEN_MAX_SEC = 10;         // 息が続く秒数（＝ゲージ10目盛り）
const OXYGEN_RECOVER_MULT = 4;     // 回復は消費の4倍速
const DROWN_DMG = 2;               // 窒息ダメージ（1ハート/秒）
// 空腹ゲージ（layout.hunger で有効化）：Minecraft準拠の簡略版。20ポイント＝🍗10個（1個=2ポイント）。
const HUNGER_MAX = 20;
const HUNGER_DASH_DRAIN = 0.35;    // ダッシュ移動中の消費（ポイント/秒）。ごくゆっくり減る
const HUNGER_SPRINT_MIN = 6;       // 🍗3個以下ではダッシュできない（Minecraftと同じ閾値）
const HUNGER_REGEN_MIN = 18;       // 🍗9個以上でHPが自然回復する
const HUNGER_REGEN_INTERVAL = 2.0; // 自然回復の間隔（秒）。1回で 1HP 回復し空腹を少し消費
const HUNGER_REGEN_COST = 0.6;
const STARVE_INTERVAL = 2.0;       // 空腹0の飢餓ダメージ間隔（秒）
const STARVE_MIN_HP = 2;           // 飢餓では1ハートまでしか減らない（Minecraftノーマル相当＝飢えでは死なない）
const FOOD_DEFAULT_VALUE = 6;      // 食べ物1個の回復量（🍗3個ぶん）
const SYS_FOOD_SFX = 'https://rpgen-search.pages.dev/audio/sound/lFPiWw.mp3';
// 波：水面はプレーンな板ではなく分割メッシュで、動き（プレイヤー・NPC・ボールの移動）があるとき
// だけ頂点変位のさざ波を立てる。静止すると凪に戻る。波の陰影は水面専用のライトレイヤーで付ける
// （ワールドは環境光のみなので、専用ライトが無いと頂点変位が見えない）。
const WATER_LIGHT_LAYER = 2;      // 水面だけを照らすライトのレイヤー番号
const WAVE_SEG_MAX = 80;          // 水面メッシュの最大分割数（負荷上限）
const WAVE_RADIUS = 5;            // 波源1つのさざ波が届く距離（マス）
const WAVE_SRC_MAX = 8;           // 1フレームに拾う波源の最大数
const WAVE_FADE = 2.2;            // 波の立ち上がり/凪への収束速度（1/秒）
// 水中：カメラが水面下に入ったら視界を海の色に合わせて狭め、プレイヤーから泡を出す
const UNDERWATER_FOG_NEAR = 0.4;
const UNDERWATER_FOG_FAR = 8;
const BUBBLE_MAX = 24;            // 泡パーティクルのプール数
const BUBBLE_RISE_V = 0.9;        // 泡の上昇速度（マス/秒）
const BUBBLE_INTERVAL = 0.16;     // 泡の発生間隔（秒）。泳いで動いている間は倍出る
// スピーカー：距離減衰は逆二乗の「近似」として (1 - d/radius)² を使う。
// 真の 1/d² は d→0 で発散し、無限遠までゼロにならないため結局クランプ＋カットオフが必要になる。
// この近似は d=0 で最大音量・radius でちょうど 0 になり、パラメータが直感的で計算も安い。
const SPEAKER_DEFAULT_RADIUS = 8;
const SPEAKER_DEFAULT_VOLUME = 0.7;
const SPEAKER_PAUSE_EPS = 0.005;  // これ未満の音量になったら pause してリソースを空ける

// ── 照明・背景 ──
// three の物理ライティングでは AmbientLight(白, π) × MeshLambertMaterial ＝ テクスチャ等倍
// （従来の MeshBasicMaterial と同じ見た目）になる。ambientLight=1 がフルブライトの基準。
const AMBIENT_SCALE = Math.PI;
// ランタン（プレイヤー光源）：intensity 1 で約1マス先がほぼ等倍で照る強さ。
const LANTERN_SCALE = 4 * Math.PI;
const LANTERN_DEFAULT_COLOR = '#ffd9a0';
// 背景画像（円筒パノラマ）：霧より遠く・カメラの far(100) より近い半径で常にカメラへ追従する。
const SKY_RADIUS = 45;
const SKY_HEIGHT = 36;

// ダメージ床のHP制。2Dエンジン（既定3ダメージ・45フレーム≒0.75秒無敵）に合わせ、
// 一発で「ゆめから さめる」のではなく HP が尽きたときだけスタートへ戻す。
const YUME_MAX_HP = 20;            // 1ハート=2HP × 10ハート（Minecraftのデフォルトと同じ）
const DAMAGE_DEFAULT = 3;          // Tex25D.damageAmount 未指定時の被ダメージ量
const DAMAGE_INVULN_SEC = 0.75;
const HIT_FLASH_PEAK = 0.45;       // 非致死ヒットの赤フラッシュの最大不透明度

/** システム床の効果音。GameMaker の playSfx（direct・既定音量50）と同じ聞こえ方に合わせる。 */
const playSysSfx = (src: string) => {
  if (typeof Audio === 'undefined') return;
  try {
    const a = new Audio(src);
    a.volume = applyMasterVolume(35) / 100;
    a.play().catch(() => {});
  } catch { /* noop */ }
};

/** 歩行グラ（walk: 参照）の足踏み速度。NPCビルボードは常時ゆっくりマーチ、プレイヤーは歩行時のみ。 */
const BILLBOARD_ANIM_FPS = 4;
const PLAYER_ANIM_FPS = 7;

// ── NPC頭上セリフ（プレイ中、interactive+message のビルボードへ近づくと1文字ずつ表示）──
const SPEECH_RANGE = 0.8;        // セリフが見え始める距離（マス）。INTERACT_RANGE より広く、近づく途中から読める
const SPEECH_CHAR_MS = 50;       // 1文字あたりの表示間隔。2Dエンジンの頭上セリフと同じテンポ
const SPEECH_FONT_PX = 16;
const SPEECH_LINE_H = 22;
const SPEECH_MAX_W = 240;        // 折り返し幅（canvas px）
const SPEECH_PAD = 8;
const SPEECH_PX_PER_UNIT = 130;  // canvas px → ワールド単位の縮尺
const SPEECH_MARGIN_Y = 0.12;    // ビルボード上端からの隙間（ワールド単位）

/** 行頭に来てはいけない文字（禁則）。頭上セリフの折り返し用の簡易版。 */
const SPEECH_KINSOKU = new Set(
  '、。，．・：；？！ー…ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ）」』】〉》,.!?)]'.split(''),
);

let speechFontFamily: string | null = null;
/** HUD等と同じピクセルフォント（next/font の CSS 変数）をセリフ描画にも使う。 */
const speechFont = (): string => {
  if (speechFontFamily === null) {
    const raw = typeof document !== 'undefined'
      ? getComputedStyle(document.documentElement).getPropertyValue('--font-pixel').trim()
      : '';
    speechFontFamily = raw || 'monospace';
  }
  return `bold ${SPEECH_FONT_PX}px ${speechFontFamily}`;
};

/** \n を段落区切りとして、測定幅ベース＋簡易禁則で折り返す。 */
const wrapSpeech = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of para) {
      const cand = line + ch;
      // 禁則文字は行頭へ送らず、多少はみ出しても現在行に残す
      if (line && ctx.measureText(cand).width > maxWidth && !SPEECH_KINSOKU.has(ch)) {
        lines.push(line);
        line = ch;
      } else {
        line = cand;
      }
    }
    lines.push(line);
  }
  return lines;
};

/** 頭上セリフ1件分の表示状態。ビルボードidごとに生成し、離れたら破棄する。 */
interface SpeechEntry {
  lines: string[];
  totalChars: number;
  start: number;   // 表示開始時刻（ms）
  shown: number;   // 直近に描画した文字数（-1=未描画）
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  mat: THREE.MeshBasicMaterial;
  geo: THREE.PlaneGeometry;
  mesh: THREE.Mesh;
}

const POV_MIN_DIST = 0.4;
const POV_MAX_DIST = 3.5;
const POV_HEIGHT_ABOVE_EYE = 0.22;  // 三人称視点：目線より上から見下ろす高さ
const PITCH_LIMIT = (55 * Math.PI) / 180;  // 見上げ/見下ろしの可動域
const INTERACT_RANGE = 1.4;                // 「はなす」が届く距離（マス単位）

/** 方角 → ヨー角。カメラ前方は (-sin yaw, -cos yaw)。 */
const YAW_FOR_DIR: Record<Dir4, number> = { 0: 0, 1: -Math.PI / 2, 2: Math.PI, 3: Math.PI / 2 };

export interface Input25D {
  forward: boolean; back: boolean;
  turnL: boolean; turnR: boolean;
  strafeL: boolean; strafeR: boolean;
  /** Shift（ダッシュ）。押している間だけ移動速度が上がる。 */
  dash: boolean;
  /** 浮遊（ホバー）モード中の昇降。押している間だけ上昇/下降する（Minecraft創造飛行風）。 */
  flyUp: boolean; flyDown: boolean;
}

export interface PlayerAppearance { emoji?: string; color: string; spriteUrl?: string; spriteRef?: string; }
export type PovMode = 'first' | 'third';

/** 3Dビュー編集時の配置プレビュー（ゴースト）。カーソル位置のツール適用先を半透明で示す。
 *  wall の col/row/dir は normalizeWall25D 済み（dir=0:北辺 / 3:西辺）を渡すこと。 */
export type GhostSpec =
  | { kind: 'floor'; col: number; row: number; tex: number }
  | { kind: 'wall'; col: number; row: number; dir: Dir4; level: number; tex: number }
  | { kind: 'sprite'; col: number; row: number; level: number; tex: number; dir?: Dir4 }
  | { kind: 'cell'; col: number; row: number; level: number; color: string };

const GHOST_OPACITY = 0.45;

/** 歩行グラシートの足踏みアニメ状態。lastFrame/lastKey が変わったコマだけ再描画する。 */
interface WalkAnimState { img: HTMLImageElement; std: WalkStandard; lastFrame: number; }

/** テクスチャ実体。fallback キャンバスに画像を後から重ね描きする（Texture の差し替え不要）。
 *  url は「いま canvas に反映している imageUrl」。差し替え検知に使う。 */
interface TexEntry {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  url?: string;
  anim?: WalkAnimState;
}

/** walk: 参照のうち、この2.5Dエンジンでシート分割アニメできる形式か
 *  （SMCアトラス系のクロップ/JSON形式は対象外＝静止画として扱う）。 */
const isAnimatableWalk = (walk: WalkRef | null): walk is WalkRef =>
  !!walk && walk.stdId !== 'smc_json' && !walk.crop;

/** url 末尾の #sx,sy,sw,sh クロップ指定を分離する（内蔵シートから切り出す単体スプライト用）。 */
const splitCropUrl = (raw: string): { url: string; crop: [number, number, number, number] | null } => {
  const hashIdx = raw.indexOf('#');
  if (hashIdx === -1) return { url: raw, crop: null };
  const parts = raw.slice(hashIdx + 1).split(',').map(Number);
  const ok = parts.length >= 4 && parts.slice(0, 4).every(n => !Number.isNaN(n));
  return { url: raw.slice(0, hashIdx), crop: ok ? [parts[0], parts[1], parts[2], parts[3]] : null };
};

/** シートの1セルを canvas へ contain・下端合わせで描く（キャラの足元が揃う）。 */
const drawCellContain = (
  cv: HTMLCanvasElement, img: HTMLImageElement,
  sx: number, sy: number, sw: number, sh: number,
) => {
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cv.width, cv.height);
  const sc = Math.min(cv.width / sw, cv.height / sh);
  const w = sw * sc, h = sh * sc;
  ctx.drawImage(img, sx, sy, sw, sh, (cv.width - w) / 2, cv.height - h, w, h);
};

const texCanvasDraw = (cv: HTMLCanvasElement, def: Tex25D) => {
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (def.kind === 'sprite') {
    // スプライトは透過背景。emoji があれば中央に大きく描く、無ければ色付きの菱形。
    if (def.emoji) {
      ctx.font = '52px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(def.emoji, 32, 36);
    } else {
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.moveTo(32, 4); ctx.lineTo(58, 32); ctx.lineTo(32, 60); ctx.lineTo(6, 32);
      ctx.closePath(); ctx.fill();
    }
    return;
  }
  // 床・壁は不透明。ベタ塗り＋うっすらチェッカーでのっぺり感を消す。
  ctx.fillStyle = def.color;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    if ((x + y) % 2 === 0) ctx.fillRect(x * 16, y * 16, 16, 16);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.strokeRect(0.5, 0.5, 63, 63);
};

/** プレイヤー自身のビルボード用テクスチャ（三人称視点でのみ表示）。
 *  spriteUrl がある場合は単体スプライト画像として丸ごと描く（#sx,sy,sw,sh クロップ対応・非同期）。
 *  歩行グラ（walk: 参照）はここを通らず、エンジンの updatePlayerAnim() がシート分割アニメを描く。
 *  ロード完了後に onUpdate() を呼び出してテクスチャを更新すること。 */
export const drawPlayerCanvas = (cv: HTMLCanvasElement, a: PlayerAppearance, onUpdate?: () => void): void => {
  const ctx = cv.getContext('2d')!;
  const drawFallback = () => {
    ctx.clearRect(0, 0, 64, 64);
    if (a.emoji) {
      ctx.font = '52px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(a.emoji, 32, 36);
    } else {
      ctx.fillStyle = a.color;
      ctx.beginPath();
      ctx.arc(32, 24, 14, 0, Math.PI * 2); ctx.fill();  // 頭
      ctx.fillRect(20, 34, 24, 24);                      // 胴
    }
  };
  if (a.spriteUrl) {
    const { url, crop } = splitCropUrl(a.spriteUrl);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (crop) drawCellContain(cv, img, crop[0], crop[1], crop[2], crop[3]);
      else drawCellContain(cv, img, 0, 0, img.naturalWidth, img.naturalHeight);
      onUpdate?.();
    };
    img.onerror = () => { drawFallback(); onUpdate?.(); };
    img.src = url;
    drawFallback();  // ロード待ちの間は絵文字/色で暫定表示
    return;
  }
  drawFallback();
};

/** 2D見下ろしエディタのカーソル等、静止状態でプレイヤーの見た目を表示する用途向け。
 *  歩行グラ（walk: 参照）なら正面（下向き）1コマ目を切り出して描く。それ以外は drawPlayerCanvas と同じ。 */
export const drawPlayerIconCanvas = (cv: HTMLCanvasElement, a: PlayerAppearance, onUpdate?: () => void): void => {
  const walk = a.spriteRef ? parseWalkRef(a.spriteRef) : null;
  const sheetUrl = isAnimatableWalk(walk) ? (a.spriteUrl ?? (walk.source.kind === 'url' ? walk.source.url : undefined)) : undefined;
  if (walk && sheetUrl) {
    drawPlayerCanvas(cv, { emoji: a.emoji, color: a.color }, onUpdate);  // ロード完了までは絵文字/色で暫定表示
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const std = walk.stdId === 'auto' ? detectStandard(img.naturalWidth, img.naturalHeight) : standardById(walk.stdId);
      const rect = cellRect(std, img.naturalWidth, img.naturalHeight, 's', 0);
      drawCellContain(cv, img, rect.sx, rect.sy, rect.sw, rect.sh);
      onUpdate?.();
    };
    img.src = sheetUrl;
    return;
  }
  drawPlayerCanvas(cv, a, onUpdate);
};

export interface BillboardInstance {
  data: Billboard25D;
  object: THREE.Object3D;
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  aiTimer: number;
  startX: number;
  startZ: number;
  mixer?: THREE.AnimationMixer;
  /** 3Dモデルの移動用アニメ一式。idle/run は該当クリップが無いモデルでは undefined
   *  （idle なし＝歩きを先頭コマで固定、run なし＝歩きの早回しで代用）。 */
  anims?: { idle?: THREE.AnimationAction; walk: THREE.AnimationAction; run?: THREE.AnimationAction };
  currentAction?: THREE.AnimationAction | null;
  /** 水没ダメージ（layout.waterDamage.npc/enemy）用の残り体力（秒換算）。未定義＝満タン。 */
  submergeHp?: number;
  /** 水没で倒れた（非表示・AI/当たり判定/会話から除外）。リスポーンで復活する。 */
  dead?: boolean;
  /** 歩行グラNPC専用：向き別（正面/横/背面）表示のための個別キャンバス。
   *  共有テクスチャ（texEntries）は正面固定なので、向きを持つNPCは自分専用の板絵を持つ。 */
  dirCanvas?: HTMLCanvasElement;
  dirTexture?: THREE.CanvasTexture;
  dirLastKey?: string;
  /** NPC自身の向き（単位ベクトル）。移動で更新され、停止中は最後の向きを保つ。歩行グラNPCのみ使用。 */
  faceX?: number;
  faceZ?: number;
  /** マイクラモデル専用：腕脚のピボット（歩行スイング用）と位相。 */
  mcLimbs?: MinecraftLimbs;
  mcPhase?: number;
  /** マイクラ/3Dモデル停止時の最後の向き。移動中に記録し、停止中にこの値を維持する。 */
  lastYaw?: number;
}

export class Yume25DEngine {
  readonly input: Input25D = { forward: false, back: false, turnL: false, turnR: false, strafeL: false, strafeR: false, dash: false, flyUp: false, flyDown: false };
  /** デモ再生（イントロ用）：自動で前進し、壁に当たったら向きを変える。 */
  demo = false;
  /** 編集モード（3D確認ビュー）。ピッキングの空中面フォールバックと onEditFrame が有効になる。 */
  editMode = false;
  /** 浮遊（ホバー）モード。editMode 中のみ有効。Minecraft創造飛行風に重力を切り、flyUp/flyDown で昇降する。
   *  false に戻すと通常の落下モード（重力あり・ジャンプ可）。 */
  hover = false;
  /** editMode 中に毎フレーム呼ばれるフック。呼び出し側が配置プレビューをカメラ移動へ追従させるのに使う。 */
  onEditFrame: (() => void) | null = null;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private layout: Layout25D;
  private raf = 0;
  private running = false;
  private lastT = 0;
  private disposed = false;

  // ワールド状態
  private x = 0; private z = 0; private yaw = 0; private pitch = 0;
  private vy = 0; private hop = 0; private grounded = true;
  private jumpQueued = false;
  private pov: PovMode = 'first';
  private povDistance = 1.6;
  private hEdges = new Set<string>();  // セル(c,r)の北辺（z=r, x∈[c,c+1]）
  private vEdges = new Set<string>();  // セル(c,r)の西辺（x=c, z∈[r,r+1]）
  private billboardMeshes: THREE.Mesh[] = [];
  private worldObjects: THREE.Object3D[] = [];
  private ownedGeometries: THREE.BufferGeometry[] = [];
  private ownedMaterials: THREE.Material[] = [];
  private texEntries = new Map<number, TexEntry>();
  private demoTurnFrames = 0;
  // NPC頭上セリフ（ビルボードid → 表示状態）。接近で生成・離脱/再構築で破棄。
  private speeches = new Map<string, SpeechEntry>();

  // 配置プレビュー（ゴースト）。1メッシュを使い回し、ツール対象に応じてジオメトリ/姿勢を差し替える。
  private ghostMesh: THREE.Mesh;
  private ghostMat: THREE.MeshBasicMaterial;
  private ghostPlaneGeo: THREE.PlaneGeometry;  // 1×1 共用（床・壁・セルハイライト）
  private ghostBillGeo: THREE.PlaneGeometry;   // スプライト用（ビルボードと同寸）
  private ghostKind: GhostSpec['kind'] | null = null;

  private playerAppearance: PlayerAppearance = { color: '#ffffff' };
  private playerCanvas: HTMLCanvasElement;
  private playerTexture: THREE.CanvasTexture;
  private playerMesh: THREE.Mesh;
  private playerGeo: THREE.PlaneGeometry;
  private playerMat: THREE.MeshLambertMaterial;

  // ── 遊べるオブジェクト ──
  /** 蹴れるボール（special==='ball' のスプライト）。home はレイアウト上の定位置で、リセットで戻る。
   *  y/vy は自由落下用（2段目以上に置くと落ちてくる）。r は球の半径。 */
  private balls: {
    mesh: THREE.Mesh; r: number;
    homeX: number; homeZ: number; homeY: number;
    x: number; z: number; y: number;
    vx: number; vz: number; vy: number;
  }[] = [];
  /** 球体ボール用の焼き込み陰影テクスチャ（上が明るい縦グラデ）。環境光だけでも球に見せる。 */
  private ballShadeTex: THREE.CanvasTexture | null = null;
  /** ブロック（special==='block'）の上面高さ一覧。key='c,r'。足場・側面判定に使う。 */
  private blockTops = new Map<string, number[]>();

  // ── サンプル3Dモデル（Tex25D.modelUrl） ──
  private modelLoader: GLTFLoader | null = null;
  /** URL → ロード済みシーン（原本）とアニメーション。配置ごとに clone して使い回す。失敗は null。 */
  private modelCache = new Map<string, Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] } | null>>();
  /** Minecraftスキン画像のキャッシュ（URL → テクスチャ）。モデルは配置ごとに組み立てる。失敗は null。 */
  private mcSkinCache = new Map<string, Promise<THREE.Texture | null>>();
  private mixers: THREE.AnimationMixer[] = [];
  private activeBillboards: BillboardInstance[] = [];
  /** buildScene の世代番号。非同期ロード完了時に古い世代への差し込みを防ぐ。 */
  private buildGen = 0;

  // ── 海（水面） ──
  private waterMesh: THREE.Mesh | null = null;
  private waterMat: THREE.MeshLambertMaterial | null = null;
  private waterGeo: THREE.PlaneGeometry | null = null;
  private waterSun: THREE.DirectionalLight | null = null;  // 水面専用ライト（波の陰影用）
  private waterGeoCols = 0;  // 波用ジオメトリを作ったときのマップサイズ（変わったら作り直す）
  private waterGeoRows = 0;
  private waveT = 0;         // 波アニメの経過時間
  private waveEnergy = 0;    // 波の強さ 0〜1（動きがあると立ち上がり、静止すると凪へ収束）
  private waterFlat = true;  // 頂点が平らな状態か（凪のとき毎フレームの頂点更新を省く）
  private underwater = false;  // カメラが水面下にあるか（視界・背景の切り替え済みか）
  private bubblePts: THREE.Points | null = null;
  private bubbleGeo: THREE.BufferGeometry | null = null;
  private bubbleMat: THREE.PointsMaterial | null = null;
  /** 泡パーティクルのプール。y<0 は非アクティブ。 */
  private bubbles: { x: number; y: number; z: number; vy: number; phase: number }[] = [];
  private bubbleSpawnT = 0;
  private peakHop = 0;
  // ── 水没ダメージ・酸素 ──
  private submergeDmgT = 0;   // プレイヤー水没ダメージの次ティックまでの残り秒
  private oxygen = OXYGEN_MAX_SEC;
  private oxygenShown = OXYGEN_MAX_SEC;  // onOxygenChange 通知済みの目盛り（Math.ceil）
  private drownT = 0;         // 窒息ダメージの次ティックまでの残り秒
  /** 水没で倒れた住人・食べられた食べ物のビルボードid。セリフ・会話対象からも除外する。 */
  private deadIds = new Set<string>();
  // ── 空腹ゲージ ──
  private hunger = HUNGER_MAX;
  private hungerShown = HUNGER_MAX;  // onHungerChange 通知済みの値（Math.ceil）
  private regenT = 0;   // 自然回復の経過秒
  private starveT = 0;  // 飢餓ダメージの経過秒
  /** スピーカー（special==='speaker'）。同じ音源のスプライト群を1本の Audio にまとめ、最寄り距離で音量を決める。 */
  private speakers: { src: string; positions: [number, number][]; radius: number; volume: number }[] = [];
  private speakerAudio = new Map<string, HTMLAudioElement>();

  // ── 照明・背景 ──
  private ambientLightObj!: THREE.AmbientLight;
  private lantern!: THREE.PointLight;
  private skyMesh: THREE.Mesh | null = null;
  private skyMat: THREE.MeshBasicMaterial | null = null;
  private skyGeo: THREE.CylinderGeometry | null = null;
  private skyCanvas: HTMLCanvasElement | null = null;
  private skyTexture: THREE.CanvasTexture | null = null;
  private skyUrlLoaded: string | undefined;
  // 歩行グラプレイヤーのアニメ状態。lastKey は「向き:フレーム」で再描画の要否を判定する。
  private playerAnim: { img: HTMLImageElement; std: WalkStandard; lastKey: string } | null = null;
  private playerDir: WayKey = 'w';
  private playerMoving = false;

  // ── システム床の実行状態 ──
  // 画面フェード：カメラ直付けの板の不透明度を out→（onMid 実行）→in と往復させる。
  private fadeMesh: THREE.Mesh;
  private fadeMat: THREE.MeshBasicMaterial;
  private fadeGeo: THREE.PlaneGeometry;
  private fadeState: { phase: 'out' | 'in'; t: number; onMid: (() => void) | null; peak?: number } | null = null;
  /** ワープ床の多重発動防止。転送先もワープ床のとき、降りるまで再発動しない。 */
  private warpCooldown = false;
  /** つるつる床：壁で止められたセル。同じセルに居る間は滑走を諦めて通常操作に戻す（ハマり防止）。 */
  private iceBlockedCell: string | null = null;
  /** ダメージ床のHP制。尽きたときだけ「ゆめから さめて」スタートへ戻る（戻ったら全回復）。 */
  hp = YUME_MAX_HP;
  readonly maxHp = YUME_MAX_HP;
  private invuln = 0;
  /** HP変化通知（HUD用）。被弾・リセットでの全回復の両方で呼ばれる。 */
  onHpChange: ((hp: number, max: number) => void) | null = null;
  /** 酸素の残り通知（HUD用）。表示目盛り（Math.ceil）が変わったときだけ呼ばれる。 */
  onOxygenChange: ((sec: number, max: number) => void) | null = null;
  get oxygenState() { return { sec: this.oxygen, max: OXYGEN_MAX_SEC }; }
  /** 空腹の残り通知（HUD用）。表示値（Math.ceil）が変わったときだけ呼ばれる。 */
  onHungerChange: ((pts: number, max: number) => void) | null = null;
  get hungerState() { return { pts: this.hunger, max: HUNGER_MAX }; }
  /** HP が 0 になったとき（フェードアウト開始直前）に呼ばれる。死亡画面表示用。 */
  onDeath: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, layout: Layout25D, playerAppearance?: PlayerAppearance) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(RENDER_W, RENDER_H, false);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, RENDER_W / RENDER_H, 0.05, 100);
    this.camera.rotation.order = 'YXZ';
    this.layout = layout;
    this.pov = layout.pov ?? 'first';
    this.povDistance = layout.povDistance ?? 1.6;
    if (playerAppearance) this.playerAppearance = playerAppearance;

    // プレイヤー自身のビルボード（三人称視点のときだけ表示）。
    this.playerCanvas = document.createElement('canvas');
    this.playerCanvas.width = 64; this.playerCanvas.height = 64;
    this.playerTexture = new THREE.CanvasTexture(this.playerCanvas);
    this.playerTexture.magFilter = THREE.NearestFilter;
    this.playerTexture.minFilter = THREE.NearestFilter;
    this.playerTexture.generateMipmaps = false;
    this.playerTexture.colorSpace = THREE.SRGBColorSpace;
    this.applyPlayerAppearance();
    this.playerGeo = new THREE.PlaneGeometry(0.8, 0.8);
    this.playerMat = new THREE.MeshLambertMaterial({ map: this.playerTexture, alphaTest: 0.5, side: THREE.DoubleSide });
    this.playerMesh = new THREE.Mesh(this.playerGeo, this.playerMat);
    this.playerMesh.visible = this.pov === 'third';
    this.scene.add(this.playerMesh);

    // システム床の画面フェード：カメラの目の前に貼る板。カメラごとシーンへ入れて子を描画対象にする。
    this.scene.add(this.camera);
    this.fadeGeo = new THREE.PlaneGeometry(1, 1);
    this.fadeMat = new THREE.MeshBasicMaterial({
      color: '#000000', transparent: true, opacity: 0,
      depthTest: false, depthWrite: false, fog: false, side: THREE.DoubleSide,
    });
    this.fadeMesh = new THREE.Mesh(this.fadeGeo, this.fadeMat);
    this.fadeMesh.position.set(0, 0, -0.15);  // near(0.05) より奥・視野全体を覆う距離
    this.fadeMesh.renderOrder = 2000;         // 頭上セリフ（999）より前面
    this.fadeMesh.visible = false;
    this.camera.add(this.fadeMesh);

    // 配置プレビュー（ゴースト）：worldObjects に入れず、buildScene のシーン再構築後も生き残らせる。
    this.ghostPlaneGeo = new THREE.PlaneGeometry(1, 1);
    this.ghostBillGeo = new THREE.PlaneGeometry(0.9, 0.9);
    this.ghostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: GHOST_OPACITY, depthWrite: false, side: THREE.DoubleSide });
    this.ghostMesh = new THREE.Mesh(this.ghostPlaneGeo, this.ghostMat);
    this.ghostMesh.visible = false;
    this.scene.add(this.ghostMesh);

    // 照明：環境光（全体の明るさ/色）＋プレイヤー光源（ランタン）。
    // ワールドの材質は Lambert なので、環境光 π（=ambientLight 1.0）でフルブライトになる。
    this.ambientLightObj = new THREE.AmbientLight('#ffffff', AMBIENT_SCALE);
    this.scene.add(this.ambientLightObj);
    this.lantern = new THREE.PointLight(LANTERN_DEFAULT_COLOR, 0, 8, 2);
    this.lantern.visible = false;
    this.scene.add(this.lantern);

    this.buildScene();
    this.resetToStart();

    // 開発時のみ：ブラウザコンソールから位置・ボール等の内部状態を確認するためのハンドル
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
      (window as unknown as { __yume25d?: Yume25DEngine }).__yume25d = this;
    }
  }

  get pose() { return { x: this.x, z: this.z, yaw: this.yaw }; }

  resetToStart() {
    const s = this.layout.start;
    this.x = s.col + 0.5; this.z = s.row + 0.5;
    this.yaw = YAW_FOR_DIR[s.dir];
    this.pitch = 0;
    // スタート地点にブロックが積んであれば、その頂面から開始する（ブロック内に埋まってのスポーン防止）
    this.vy = 0; this.hop = this.groundAt(this.x, this.z, Number.POSITIVE_INFINITY); this.grounded = true;
    this.warpCooldown = false;
    this.iceBlockedCell = null;
    this.hp = this.maxHp;
    this.invuln = 0;
    this.onHpChange?.(this.hp, this.maxHp);
    // 酸素・水没ダメージ・空腹の状態もリセット（リスポーンで満タンから）
    this.oxygen = OXYGEN_MAX_SEC;
    this.oxygenShown = OXYGEN_MAX_SEC;
    this.submergeDmgT = 0;
    this.drownT = 0;
    this.onOxygenChange?.(this.oxygen, OXYGEN_MAX_SEC);
    this.hunger = HUNGER_MAX;
    this.hungerShown = HUNGER_MAX;
    this.regenT = 0;
    this.starveT = 0;
    this.onHungerChange?.(this.hunger, HUNGER_MAX);
    this.deadIds.clear();
    // ボールを定位置へ戻す（プレイ開始・ゆめから さめたとき）
    for (const b of this.balls) {
      b.x = b.homeX; b.z = b.homeZ; b.y = b.homeY;
      b.vx = 0; b.vz = 0; b.vy = 0;
      b.mesh.position.set(b.x, b.y, b.z);
    }
    const H = this.layout.wallHeight;
    for (const ab of this.activeBillboards) {
      ab.x = ab.data.col + 0.5;
      ab.z = ab.data.row + 0.5;
      ab.y = (ab.data.level ?? 0) * H;
      ab.vx = 0;
      ab.vz = 0;
      ab.aiTimer = 0;
      ab.startX = ab.x;
      ab.startZ = ab.z;
      // 水没で倒れた住人も復活させる
      ab.dead = false;
      ab.submergeHp = undefined;
      ab.object.visible = true;
      // 歩行グラNPCの向きも初期（配置の dir、未指定は南向き）へ戻す
      if (ab.dirTexture) {
        const fy = YAW_FOR_DIR[ab.data.dir ?? 2];
        ab.faceX = -Math.sin(fy);
        ab.faceZ = -Math.cos(fy);
        ab.dirLastKey = undefined;
      }
      ab.lastYaw = undefined;

      const s = ab.data.scale ?? 1;
      const is3DModel = this.isModel3D(ab.data.tex);
      const objectY = is3DModel ? ab.y : ab.y + (s * 0.9) / 2;
      ab.object.position.set(ab.x, objectY, ab.z);
      if (is3DModel) {
        ab.object.rotation.y = ab.data.dir !== undefined ? YAW_FOR_DIR[ab.data.dir] : 0;
      }
      this.applyModelAnim(ab, 'idle');
    }
    this.clampToBounds();
    this.resolveWalls();
    this.peakHop = this.hop;
  }

  /** レイアウト差し替え。シーンを丸ごと作り直す（カメラ位置は維持）。 */
  setLayout(layout: Layout25D) {
    this.layout = layout;
    this.pov = layout.pov ?? this.pov;
    this.povDistance = layout.povDistance ?? this.povDistance;
    this.playerMesh.visible = this.pov === 'third';
    this.buildScene();
    this.clampToBounds();
    this.resolveWalls();  // 編集で足元に壁が置かれた場合のめり込みを解消
  }

  /** プレイヤー自身の見た目（絵文字/色/spriteUrl/spriteRef）を更新。ジオメトリは使い回し、キャンバスだけ再描画する。
   *  呼び出し側は毎レンダーで新しいオブジェクトを渡してくるため、内容が同じなら何もしない
   *  （歩行グラの再ロード＆アニメ状態リセットを防ぐ）。 */
  setPlayerAppearance(appearance: PlayerAppearance) {
    const p = this.playerAppearance;
    if (p.emoji === appearance.emoji && p.color === appearance.color
      && p.spriteUrl === appearance.spriteUrl && p.spriteRef === appearance.spriteRef) return;
    this.playerAppearance = appearance;
    this.applyPlayerAppearance();
  }

  /** 見た目をキャンバスへ反映。spriteRef が歩行グラ（walk:）ならシートをロードして
   *  歩行アニメ対象にし、以後の描画はレンダリングループの updatePlayerAnim() が行う。 */
  private applyPlayerAppearance() {
    const a = this.playerAppearance;
    this.playerAnim = null;
    const walk = a.spriteRef ? parseWalkRef(a.spriteRef) : null;
    const sheetUrl = isAnimatableWalk(walk)
      ? (a.spriteUrl ?? (walk.source.kind === 'url' ? walk.source.url : undefined))
      : undefined;
    if (walk && sheetUrl) {
      // ロード完了までは絵文字/色で暫定表示
      drawPlayerCanvas(this.playerCanvas, { emoji: a.emoji, color: a.color }, () => { this.playerTexture.needsUpdate = true; });
      this.playerTexture.needsUpdate = true;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (this.disposed || this.playerAppearance !== a) return;
        const std = walk.stdId === 'auto' ? detectStandard(img.naturalWidth, img.naturalHeight) : standardById(walk.stdId);
        this.playerAnim = { img, std, lastKey: '' };  // 次フレームの updatePlayerAnim() が描画する
      };
      img.src = sheetUrl;
      return;
    }
    drawPlayerCanvas(this.playerCanvas, a, () => { this.playerTexture.needsUpdate = true; });
    this.playerTexture.needsUpdate = true;
  }

  setPov(mode: PovMode, distance?: number) {
    this.pov = mode;
    if (distance !== undefined) this.povDistance = Math.max(POV_MIN_DIST, Math.min(POV_MAX_DIST, distance));
    this.playerMesh.visible = this.pov === 'third';
  }

  /** その場でポンと短く跳ねる。地面にいるときのみ発動（多重ジャンプ防止）。
   *  水中では接地していなくても「ひとかき」として使え、連打で上昇できる。 */
  jump() {
    const waterLv = this.layout.waterLevel ?? 0;
    const inWater = waterLv > 0 && this.hop < waterLv - 1e-3;
    if (this.grounded || inWater) this.jumpQueued = true;
  }

  /** マウスホイール等で三人称カメラの距離を調整する（一人称では何もしない）。 */
  adjustPovDistance(delta: number) {
    if (this.pov !== 'third') return;
    this.povDistance = Math.max(POV_MIN_DIST, Math.min(POV_MAX_DIST, this.povDistance + delta));
  }

  /** ドラッグ操作によるカメラ回転（ラジアン加算）。turnL/turnR とは独立に毎フレーム呼べる。
   *  deltaPitch は上下見回し（見上げ/見下ろし）。可動域を超えないようクランプする。 */
  turnBy(deltaYaw: number, deltaPitch = 0) {
    this.yaw += deltaYaw;
    if (deltaPitch !== 0) this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch + deltaPitch));
  }

  /** 編集用ピッキング：画面NDC座標からレイを飛ばし、配置対象のワールド座標と段（高さ）を返す。
   *  1) 床・壁・ビルボードなど実ジオメトリとの最近交点を最優先し、当たった高さから段を割り出す
   *     （壁の上の方を指せば上の段、NPCを指せばそのNPCの段）。
   *  2) 何もない空中を指しているときは、プレイヤーの浮遊高度の段の水平面で拾う
   *     （飛べば飛ぶほど高い段へ置ける）。
   *  preferGeometry=true（消す/会話/開始/床など既存物を対象にするツール）は、浮遊面より遠くても
   *  実ジオメトリの交点を優先する（上空から見下ろしても指した物そのものに当たる）。
   *  どちらも霧の彼方（fogFar超・見えない場所）は対象外。該当なしは null。 */
  pickTarget(ndcX: number, ndcY: number, preferGeometry = false): { x: number; z: number; level: number } | null {
    this.camera.updateMatrixWorld();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    raycaster.far = this.layout.fogFar;
    const H = this.layout.wallHeight;

    // 実ジオメトリ（床・壁・ビルボード）との最近交点
    const hit = raycaster.intersectObjects(this.worldObjects, false)[0];

    // 空中フォールバック：浮遊高度に最も近い段の水平面
    const flightLevel = Math.max(0, Math.round(this.hop / H));
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(flightLevel * H));
    const pt = new THREE.Vector3();
    const planeHit = raycaster.ray.intersectPlane(plane, pt);
    const planeDist = planeHit ? pt.distanceTo(raycaster.ray.origin) : Infinity;

    if (hit && (preferGeometry || hit.distance <= planeDist)) {
      // 面上ぴったりだとセルが裏側に落ちるので、視点側へ僅かに戻した点でセルを判定する
      const p = hit.point.clone().addScaledVector(raycaster.ray.direction, -1e-3);
      const bbLevel = hit.object.userData.bbLevel as number | undefined;
      const level = bbLevel ?? Math.max(0, Math.floor(p.y / H));
      return { x: p.x, z: p.z, level };
    }
    if (planeHit && planeDist <= this.layout.fogFar) return { x: pt.x, z: pt.z, level: flightLevel };
    return null;
  }

  /** 配置プレビュー：ツールが適用される場所へ半透明ゴーストを表示する（null で非表示）。 */
  setGhost(spec: GhostSpec | null) {
    const m = this.ghostMesh, mat = this.ghostMat;
    if (!spec) {
      m.visible = false;
      this.ghostKind = null;
      return;
    }
    const H = this.layout.wallHeight;
    this.ghostKind = spec.kind;
    const hadMap = mat.map !== null;
    m.rotation.set(0, 0, 0);
    m.scale.set(1, 1, 1);
    if (spec.kind === 'cell') {
      // 開始/会話設定/消去など「マスを指す」だけのツールは色付きハイライト
      m.geometry = this.ghostPlaneGeo;
      mat.map = null;
      mat.color.set(spec.color);
      m.rotation.x = -Math.PI / 2;
      m.position.set(spec.col + 0.5, spec.level * H + 0.02, spec.row + 0.5);
    } else {
      mat.map = this.getTex(spec.tex);
      mat.color.set('#ffffff');
      if (spec.kind === 'floor') {
        m.geometry = this.ghostPlaneGeo;
        m.rotation.x = -Math.PI / 2;
        m.position.set(spec.col + 0.5, 0.02, spec.row + 0.5);
      } else if (spec.kind === 'wall') {
        m.geometry = this.ghostPlaneGeo;
        m.scale.y = H;
        const y = spec.level * H + H / 2;
        if (spec.dir === 0) m.position.set(spec.col + 0.5, y, spec.row);            // 北辺
        else { m.rotation.y = Math.PI / 2; m.position.set(spec.col, y, spec.row + 0.5); }  // 西辺
      } else {
        m.geometry = this.ghostBillGeo;
        m.userData.tex = spec.tex;
        const is3DModel = this.isModel3D(spec.tex);
        if (is3DModel) {
          m.rotation.y = spec.dir !== undefined ? YAW_FOR_DIR[spec.dir] : 0;
        } else {
          m.rotation.y = this.yaw;  // 以後は step() がビルボード同様カメラへ正対させる
        }
        m.position.set(spec.col + 0.5, spec.level * H + 0.45, spec.row + 0.5);
      }
    }
    if (hadMap !== (mat.map !== null)) mat.needsUpdate = true;  // map の有無切替はシェーダ再コンパイルが要る
    m.visible = true;
  }

  /** 近くの「はなせる」ビルボードを1つ返す（範囲内で最も近いもの。無ければ null）。 */
  getInteractable(): Billboard25D | null {
    let best: Billboard25D | null = null;
    let bestDist = INTERACT_RANGE;
    for (const b of this.layout.billboards) {
      if (!b.interactive || this.deadIds.has(b.id)) continue;
      const dist = Math.hypot(b.col + 0.5 - this.x, b.row + 0.5 - this.z);
      if (dist < bestDist) { best = b; bestDist = dist; }
    }
    return best;
  }

  // ── NPC頭上セリフ ────────────────────────────────────────────────────────
  /** 毎フレーム：セリフ持ちビルボードとの距離を見て、接近中は1文字ずつ表示・離脱で破棄する。
   *  板はビルボード同様Y軸回転のみでカメラへ正対し、depthTest なしで壁越しでも読める。 */
  private updateSpeeches(nowMs: number) {
    if (this.editMode) {
      if (this.speeches.size) this.clearSpeeches();
      return;
    }
    const active = new Set<string>();
    for (const b of this.layout.billboards) {
      if (!b.interactive || !b.message || this.deadIds.has(b.id)) continue;
      const dist = Math.hypot(b.col + 0.5 - this.x, b.row + 0.5 - this.z);
      if (dist > SPEECH_RANGE) continue;
      active.add(b.id);
      let e = this.speeches.get(b.id);
      if (!e) {
        e = this.createSpeech(b, nowMs);
        this.speeches.set(b.id, e);
      }
      const shown = Math.min(e.totalChars, Math.floor((nowMs - e.start) / SPEECH_CHAR_MS));
      if (shown !== e.shown) {
        e.shown = shown;
        this.drawSpeech(e);
      }
      e.mesh.rotation.y = this.yaw;
    }
    for (const [id, e] of this.speeches) {
      if (!active.has(id)) {
        this.removeSpeech(e);
        this.speeches.delete(id);
      }
    }
  }

  private createSpeech(b: Billboard25D, nowMs: number): SpeechEntry {
    const canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d')!;
    ctx.font = speechFont();
    const lines = wrapSpeech(ctx, b.message ?? '', SPEECH_MAX_W);
    const textW = Math.max(1, ...lines.map(l => ctx.measureText(l).width));
    canvas.width = Math.ceil(textW) + SPEECH_PAD * 2;
    canvas.height = lines.length * SPEECH_LINE_H + SPEECH_PAD;
    ctx = canvas.getContext('2d')!;  // サイズ変更で描画状態が消えるため取り直す

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,   // 鳥居や壁が手前にあっても読めるよう常に最前面へ
      depthWrite: false,
      fog: false,         // 霧で薄れると読めないので除外
      side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(canvas.width / SPEECH_PX_PER_UNIT, canvas.height / SPEECH_PX_PER_UNIT);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 999;
    const s = b.scale ?? 1;
    const topY = (b.level ?? 0) * this.layout.wallHeight + s * 0.9;  // ビルボード上端
    mesh.position.set(b.col + 0.5, topY + SPEECH_MARGIN_Y + (canvas.height / SPEECH_PX_PER_UNIT) / 2, b.row + 0.5);
    mesh.rotation.y = this.yaw;
    this.scene.add(mesh);
    const totalChars = lines.reduce((n, l) => n + l.length, 0);
    return { lines, totalChars, start: nowMs, shown: -1, canvas, texture, mat, geo, mesh };
  }

  /** 表示済み文字数（e.shown）までを canvas へ描き直す。上から順に行が増える。 */
  private drawSpeech(e: SpeechEntry) {
    const ctx = e.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, e.canvas.width, e.canvas.height);
    if (e.shown > 0) {
      let left = e.shown;
      const disp: string[] = [];
      for (const l of e.lines) {
        if (left <= 0) break;
        disp.push(left >= l.length ? l : l.slice(0, left));
        left -= l.length;
      }
      ctx.font = speechFont();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const tw = Math.max(1, ...disp.map(l => ctx.measureText(l).width));
      const cx = e.canvas.width / 2;
      // 2Dエンジンの頭上セリフと同じ半透明の下地（フキダシは使わない）
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(cx - tw / 2 - 4, 0, tw + 8, disp.length * SPEECH_LINE_H + 6);
      ctx.fillStyle = '#fff';
      disp.forEach((l, i) => ctx.fillText(l, cx, 3 + i * SPEECH_LINE_H + (SPEECH_LINE_H - SPEECH_FONT_PX) / 2));
    }
    e.texture.needsUpdate = true;
  }

  private removeSpeech(e: SpeechEntry) {
    this.scene.remove(e.mesh);
    e.geo.dispose();
    e.mat.dispose();
    e.texture.dispose();
  }

  private clearSpeeches() {
    for (const e of this.speeches.values()) this.removeSpeech(e);
    this.speeches.clear();
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (t - this.lastT) / 1000);
      this.lastT = t;
      this.step(dt);
      this.updateBillboardAI(dt);

      for (const mixer of this.mixers) {
        mixer.update(dt);
      }

      if (this.editMode) this.onEditFrame?.();  // 移動・浮遊でカメラが動いてもプレビューを追従させる
      this.updateSpeeches(t);
      this.updateTexAnimations(t / 1000);
      this.updateBillboardDirSprites(t / 1000);
      this.updatePlayerAnim(t / 1000);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    // 3Dビューを離れてもループ再生が残らないようスピーカーを止める
    for (const audio of this.speakerAudio.values()) audio.pause();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.clearWorld();
    this.playerGeo.dispose();
    this.playerMat.dispose();
    this.playerTexture.dispose();
    this.ghostPlaneGeo.dispose();
    this.ghostBillGeo.dispose();
    this.ghostMat.dispose();
    this.fadeGeo.dispose();
    this.fadeMat.dispose();
    this.skyGeo?.dispose();
    this.skyMat?.dispose();
    this.skyTexture?.dispose();
    for (const audio of this.speakerAudio.values()) audio.pause();
    this.speakerAudio.clear();
    this.ballShadeTex?.dispose();
    this.waterGeo?.dispose();
    this.waterMat?.dispose();
    this.bubbleGeo?.dispose();
    this.bubbleMat?.dispose();
    // 3Dモデルキャッシュ：原本のジオメトリ/マテリアル/テクスチャを解放（クローンは共有なので原本だけでよい）
    for (const p of this.modelCache.values()) {
      p.then(res => res?.scene.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) { (m as THREE.MeshLambertMaterial).map?.dispose(); m.dispose(); }
      }));
    }
    this.modelCache.clear();
    for (const p of this.mcSkinCache.values()) p.then(t => t?.dispose());
    this.mcSkinCache.clear();
    for (const e of this.texEntries.values()) e.texture.dispose();
    this.texEntries.clear();
    // forceContextLoss() は呼ばない：canvas 要素が同一のまま Strict Mode の
    // マウント→アンマウント→再マウント（開発時の二重実行）で作り直されると、
    // 一度失った WebGL コンテキストを再取得することになり、
    // WebGLRenderer の初期化が「Cannot read properties of null (reading 'precision')」で落ちる。
    // dispose() だけで GPU リソース（テクスチャ・プログラム等）は十分に解放される。
    this.renderer.dispose();
  }

  // ── シーン構築 ──────────────────────────────────────────────────────────
  private clearWorld() {
    this.clearSpeeches();  // レイアウト差し替えでビルボードが変わる/破棄時のリソース解放
    for (const o of this.worldObjects) this.scene.remove(o);
    this.worldObjects = [];
    this.billboardMeshes = [];
    this.mixers = [];
    for (const ab of this.activeBillboards) ab.dirTexture?.dispose();  // 歩行グラNPC個別テクスチャ
    this.activeBillboards = [];
    this.deadIds.clear();  // レイアウト差し替えで住人が作り直されるので、水没死の記録もリセット
    for (const g of this.ownedGeometries) g.dispose();
    this.ownedGeometries = [];
    for (const m of this.ownedMaterials) m.dispose();
    this.ownedMaterials = [];
    // テクスチャはキャンバス実体を使い回すため、ここでは破棄しない（dispose() でまとめて破棄）。
  }

  private getTex(id: number): THREE.CanvasTexture {
    const def = this.layout.textures[id];
    const fallback: Tex25D = def ?? { id, name: '?', kind: 'wall', color: '#ff00ff' };
    let entry = this.texEntries.get(id);
    if (!entry) {
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 64;
      texCanvasDraw(cv, fallback);
      const texture = new THREE.CanvasTexture(cv);
      // ドット絵前提：常に最近傍補間・ミップマップなし
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      entry = { texture, canvas: cv };
      this.texEntries.set(id, entry);
    }
    if (!def?.imageUrl) {
      // 画像なし（または消去された）→ 色/絵文字を描き直す（Texture は同一実体を維持）
      entry.url = undefined;
      entry.anim = undefined;
      texCanvasDraw(entry.canvas, fallback);
      entry.texture.needsUpdate = true;
      return entry.texture;
    }
    if (entry.url !== def.imageUrl) {
      // 画像が新規指定/差し替えされた → ロードして描く。歩行グラ（walk:）ならアニメ登録。
      const url = def.imageUrl;
      entry.url = url;
      entry.anim = undefined;
      const walk = def.imageRef ? parseWalkRef(def.imageRef) : null;
      // 単体スプライトの内蔵シート切り出し（url:...#sx,sy,sw,sh）に対応
      const { url: loadUrl, crop } = splitCropUrl(url);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const e = this.texEntries.get(id);
        if (this.disposed || !e || e.url !== url) return;  // ロード中に差し替え/消去された
        if (isAnimatableWalk(walk)) {
          const std = walk.stdId === 'auto' ? detectStandard(img.naturalWidth, img.naturalHeight) : standardById(walk.stdId);
          e.anim = { img, std, lastFrame: -1 };
          // 停止中（2D編集ビュー）でも見えるよう正面1コマ目を即描画。以後はループが足踏みさせる。
          const rect = cellRect(std, img.naturalWidth, img.naturalHeight, 's', 0);
          drawCellContain(e.canvas, img, rect.sx, rect.sy, rect.sw, rect.sh);
        } else if (crop) {
          drawCellContain(e.canvas, img, crop[0], crop[1], crop[2], crop[3]);
        } else {
          // アスペクト比を保って contain 描画（下端合わせ：立て看板やキャラの足元が揃う）
          drawCellContain(e.canvas, img, 0, 0, img.naturalWidth, img.naturalHeight);
        }
        e.texture.needsUpdate = true;
      };
      img.onerror = () => {
        const e = this.texEntries.get(id);
        if (this.disposed || !e || e.url !== url) return;
        texCanvasDraw(e.canvas, fallback);
        e.texture.needsUpdate = true;
      };
      img.src = loadUrl;
    }
    return entry.texture;
  }

  /** walk: 参照のテクスチャ（NPCビルボード等）を常時ゆっくり足踏みさせる。
   *  ビルボードはカメラへ正対するので正面（s）の行を使う。変化したコマだけ再描画。 */
  private updateTexAnimations(timeSec: number) {
    for (const entry of this.texEntries.values()) {
      const a = entry.anim;
      if (!a) continue;
      const frame = walkFrameIndex(a.std, Math.floor(timeSec * BILLBOARD_ANIM_FPS));
      if (frame === a.lastFrame) continue;
      a.lastFrame = frame;
      const rect = cellRect(a.std, a.img.naturalWidth, a.img.naturalHeight, 's', frame);
      drawCellContain(entry.canvas, a.img, rect.sx, rect.sy, rect.sw, rect.sh);
      entry.texture.needsUpdate = true;
    }
  }

  /** Minecraftスキン画像をロードしてキャッシュする（ドット絵前提：最近傍・ミップマップなし）。 */
  private loadMcSkin(url: string): Promise<THREE.Texture | null> {
    let p = this.mcSkinCache.get(url);
    if (!p) {
      p = new THREE.TextureLoader().loadAsync(url).then(t => {
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
        t.generateMipmaps = false;
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      }).catch(() => null);
      this.mcSkinCache.set(url, p);
    }
    return p;
  }

  /** このテクスチャIDが3Dモデル（GLTF/マイクラスキン）として描画されるか。
   *  向き（rotation.y）の扱いがビルボード（常にカメラ正対）と異なる箇所で使う。 */
  private isModel3D(texId: number): boolean {
    const t = this.layout.textures[texId];
    return !!(t?.modelUrl || t?.minecraftSkin);
  }

  /** 歩行グラNPCの向き別表示：NPC自身の向きとカメラの向きから、見えるべき行（正面/横/背面）を選んで
   *  そのNPC専用のキャンバスへ描く。板自体は従来どおりカメラへ正対し、絵柄だけで向きを表現する（Doom風）。 */
  private updateBillboardDirSprites(timeSec: number) {
    const camFx = -Math.sin(this.yaw), camFz = -Math.cos(this.yaw);
    const camRx = Math.cos(this.yaw), camRz = -Math.sin(this.yaw);
    for (const ab of this.activeBillboards) {
      if (!ab.dirTexture || !ab.dirCanvas || ab.dead) continue;
      const a = this.texEntries.get(ab.data.tex)?.anim;
      if (!a) continue;  // シート未ロード（作成時にコピーした仮絵のまま待つ）
      const fx = ab.faceX ?? 0, fz = ab.faceZ ?? 1;
      // カメラ前方・右方向への射影で行を決める：カメラと同じ向き＝背面(w)、逆向き＝正面(s)、横は横顔(a/d)
      const dotF = fx * camFx + fz * camFz;
      const dotR = fx * camRx + fz * camRz;
      const way: WayKey = Math.abs(dotF) >= Math.abs(dotR) ? (dotF > 0 ? 'w' : 's') : (dotR > 0 ? 'd' : 'a');
      const frame = walkFrameIndex(a.std, Math.floor(timeSec * BILLBOARD_ANIM_FPS));
      const key = `${way}:${frame}`;
      if (key === ab.dirLastKey) continue;
      ab.dirLastKey = key;
      const rect = cellRect(a.std, a.img.naturalWidth, a.img.naturalHeight, way, frame);
      drawCellContain(ab.dirCanvas, a.img, rect.sx, rect.sy, rect.sw, rect.sh);
      ab.dirTexture.needsUpdate = true;
    }
  }

  /** 歩行グラプレイヤーを向き・足踏みに応じて描き替える。
   *  静止中もその場で足踏みを続ける（NPCと同じゆっくりテンポ。移動中は速める）。 */
  private updatePlayerAnim(timeSec: number) {
    const a = this.playerAnim;
    if (!a) return;
    const fps = this.playerMoving ? PLAYER_ANIM_FPS : BILLBOARD_ANIM_FPS;
    const frame = walkFrameIndex(a.std, Math.floor(timeSec * fps));
    const key = `${this.playerDir}:${frame}`;
    if (key === a.lastKey) return;
    a.lastKey = key;
    const rect = cellRect(a.std, a.img.naturalWidth, a.img.naturalHeight, this.playerDir, frame);
    drawCellContain(this.playerCanvas, a.img, rect.sx, rect.sy, rect.sw, rect.sh);
    this.playerTexture.needsUpdate = true;
  }

  private buildScene() {
    this.clearWorld();
    const L = this.layout;
    const H = L.wallHeight;

    this.scene.background = new THREE.Color(L.skyColor);
    this.scene.fog = new THREE.Fog(new THREE.Color(L.fogColor), L.fogNear, L.fogFar);
    this.underwater = false;  // フォグを通常に戻したので、水中なら次フレームで再適用される

    // 照明：環境光（明るさ・色）とランタン（プレイヤー光源）の設定を反映
    this.ambientLightObj.color.set(L.ambientColor ?? '#ffffff');
    this.ambientLightObj.intensity = (L.ambientLight ?? 1) * AMBIENT_SCALE;
    const pl = L.playerLight;
    this.lantern.visible = !!pl?.enabled;
    if (pl?.enabled) {
      this.lantern.color.set(pl.color ?? LANTERN_DEFAULT_COLOR);
      this.lantern.intensity = (pl.intensity ?? 1) * LANTERN_SCALE;
      this.lantern.distance = pl.distance ?? 8;
    }
    this.updateSky(L);
    this.updateWater(L);

    // 当たり判定用のエッジ集合。上段（level>0）の壁は当たり判定なし＝下をくぐれる。
    this.hEdges.clear(); this.vEdges.clear();
    for (const w of L.walls) {
      if ((w.level ?? 0) !== 0) continue;
      if (w.dir === 0) this.hEdges.add(`${w.col},${w.row}`);
      else if (w.dir === 3) this.vEdges.add(`${w.col},${w.row}`);
    }

    // ── 床・天井：テクスチャIDごとに1ジオメトリへマージ ──
    const floorQuads = new Map<number, number[]>();  // texId -> [c,r, ...]
    for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
      const t = L.floor[r]?.[c] ?? 0;
      if (t <= 0) continue;
      const arr = floorQuads.get(t) ?? [];
      arr.push(c, r);
      floorQuads.set(t, arr);
    }
    const pushQuad = (pos: number[], uv: number[], idx: number[], v: number[][]) => {
      const base = pos.length / 3;
      for (const p of v) pos.push(p[0], p[1], p[2]);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const makeMergedMesh = (texId: number, quads: { v: number[][] }[], doubleSided: boolean) => {
      const pos: number[] = []; const uv: number[] = []; const idx: number[] = [];
      for (const q of quads) pushQuad(pos, uv, idx, q.v);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();  // Lambert（照明対応）に必要
      const mat = new THREE.MeshLambertMaterial({
        map: this.getTex(texId),
        side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      });
      this.ownedGeometries.push(geo);
      this.ownedMaterials.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      this.scene.add(mesh);
      this.worldObjects.push(mesh);
    };

    // 天井は最上段の壁の上面に張る（多段構造でも壁を貫かない）
    const topLevel = L.walls.reduce((m, w) => Math.max(m, w.level ?? 0), 0);
    const ceilY = H * (topLevel + 1);

    for (const [texId, cells] of floorQuads) {
      const quads: { v: number[][] }[] = [];
      const ceil: { v: number[][] }[] = [];
      for (let i = 0; i < cells.length; i += 2) {
        const c = cells[i], r = cells[i + 1];
        // 上向きの床（反時計回り = +Y 法線）
        quads.push({ v: [[c, 0, r + 1], [c + 1, 0, r + 1], [c + 1, 0, r], [c, 0, r]] });
        if (L.ceiling) {
          ceil.push({ v: [[c, ceilY, r], [c + 1, ceilY, r], [c + 1, ceilY, r + 1], [c, ceilY, r + 1]] });
        }
      }
      makeMergedMesh(texId, quads, false);
      if (L.ceiling && ceil.length) makeMergedMesh(L.ceilingTex, ceil, false);
    }

    // ── 壁：薄板1枚。両面描画して裏からも見えるようにする。
    //    level の段だけ上（y = level*H 〜 (level+1)*H）に積み上げる ──
    const wallQuads = new Map<number, { v: number[][] }[]>();
    for (const w of L.walls) {
      const arr = wallQuads.get(w.tex) ?? [];
      const y0 = (w.level ?? 0) * H, y1 = y0 + H;
      if (w.dir === 0) {
        // 北辺：z=row、x∈[col, col+1]
        arr.push({ v: [[w.col, y0, w.row], [w.col + 1, y0, w.row], [w.col + 1, y1, w.row], [w.col, y1, w.row]] });
      } else {
        // 西辺：x=col、z∈[row, row+1]
        arr.push({ v: [[w.col, y0, w.row + 1], [w.col, y0, w.row], [w.col, y1, w.row], [w.col, y1, w.row + 1]] });
      }
      wallQuads.set(w.tex, arr);
    }
    for (const [texId, quads] of wallQuads) makeMergedMesh(texId, quads, true);

    // ── ビルボード：透過スプライト。alphaTest で深度バグ（奥の板が透けて欠ける）を防ぐ ──
    this.balls = [];
    this.speakers = [];
    this.blockTops.clear();
    this.buildGen++;
    const speakerCells = new Map<number, [number, number][]>();  // texId -> スピーカー位置
    // 地形マクロ等でブロックは数千個になり得るため、ジオメトリ1個＋テクスチャ毎のマテリアルを共有する
    let blockGeoShared: THREE.BoxGeometry | null = null;
    const blockMatShared = new Map<number, THREE.MeshLambertMaterial>();
    for (const b of L.billboards) {
      const def = L.textures[b.tex];

      // サンプル3Dモデル：非同期ロードして正規化（最大辺=modelScaleマス・足元をセルの床へ）した実体を差し込む。
      // 当たり判定は持たない（すり抜け）。編集ピッキング用に不可視のプロキシ箱だけ置く。
      if (def?.modelUrl) {
        const s = (b.scale ?? 1) * (def.modelScale ?? 1);
        const baseY = (b.level ?? 0) * H;
        const holder = new THREE.Group();
        holder.position.set(b.col + 0.5, baseY, b.row + 0.5);
        if (b.dir !== undefined) {
          holder.rotation.y = YAW_FOR_DIR[b.dir];
        }
        this.scene.add(holder);
        this.worldObjects.push(holder);  // clearWorld でシーンから外すため（Group はレイキャスト対象外）
        const abInstance: BillboardInstance = {
          data: b,
          object: holder,
          x: b.col + 0.5,
          z: b.row + 0.5,
          y: baseY,
          vx: 0,
          vz: 0,
          aiTimer: 0,
          startX: b.col + 0.5,
          startZ: b.row + 0.5,
        };
        this.activeBillboards.push(abInstance);
        const proxyGeo = new THREE.BoxGeometry(Math.min(1, s * 0.8), s, Math.min(1, s * 0.8));
        const proxyMat = new THREE.MeshBasicMaterial();
        this.ownedGeometries.push(proxyGeo);
        this.ownedMaterials.push(proxyMat);
        const proxy = new THREE.Mesh(proxyGeo, proxyMat);
        proxy.visible = false;  // 不可視でもレイキャストには当たる（編集の消去・配置先判定用）
        proxy.position.set(b.col + 0.5, baseY + s / 2, b.row + 0.5);
        proxy.userData.bbLevel = b.level ?? 0;
        this.scene.add(proxy);
        this.worldObjects.push(proxy);
        const gen = this.buildGen;
        this.loadModel(def.modelUrl).then(res => {
          if (this.disposed || gen !== this.buildGen || !res) return;
          const { scene: root, animations } = res;
          // SkinnedMesh（Fox/Soldier等）は通常の clone だと骨の参照が壊れるため SkeletonUtils を使う
          const inst = cloneWithSkeleton(root);

          // 移動用アニメ：クリップ名から idle/walk/run を拾う（Fox の Survey/Walk/Run、
          // Soldier の Idle/Walk/Run 等）。walk 相当が無ければ先頭クリップを歩きとして使う。
          if (animations && animations.length > 0) {
            const mixer = new THREE.AnimationMixer(inst);
            const find = (words: string[]) => animations.find(c => {
              const name = c.name.toLowerCase();
              return words.some(w => name.includes(w));
            });
            const walkClip = find(['walk', 'fly', 'swim']) ?? animations[0];
            const runClip = find(['run', 'gallop', 'dash']);
            const idleClip = find(['idle', 'survey', 'stand', 'wait']);
            abInstance.anims = {
              walk: mixer.clipAction(walkClip),
              run: runClip && runClip !== walkClip ? mixer.clipAction(runClip) : undefined,
              idle: idleClip && idleClip !== walkClip ? mixer.clipAction(idleClip) : undefined,
            };
            this.mixers.push(mixer);
            abInstance.mixer = mixer;
            // 初期状態：still は直立、それ以外は歩きから始めてAI更新に引き継ぐ
            this.applyModelAnim(abInstance, (b.behavior || 'still') === 'still' ? 'idle' : 'walk');
          }

          // 正規化：最大辺が s マスになる縮尺 → 足元(バウンディングボックスの底)を床・中心をセル中央へ
          const box = new THREE.Box3().setFromObject(inst);
          const size = new THREE.Vector3();
          box.getSize(size);
          inst.scale.setScalar(s / Math.max(size.x, size.y, size.z, 1e-6));
          const box2 = new THREE.Box3().setFromObject(inst);
          inst.position.set(
            -(box2.min.x + box2.max.x) / 2,
            -box2.min.y,
            -(box2.min.z + box2.max.z) / 2,
          );
          holder.add(inst);
        });
        continue;
      }

      // マイクラスキン：Minecraft（Slim型）のプレイヤーモデルをスキン画像から組み立てて配置する。
      // GLTFモデルと同じくホルダー原点＝足元・当たり判定なし。編集ピッキング用の不可視プロキシを置く。
      if (def?.minecraftSkin) {
        const s = b.scale ?? 1;
        const baseY = (b.level ?? 0) * H;
        const holder = new THREE.Group();
        holder.position.set(b.col + 0.5, baseY, b.row + 0.5);
        if (b.dir !== undefined) holder.rotation.y = YAW_FOR_DIR[b.dir];
        this.scene.add(holder);
        this.worldObjects.push(holder);
        const abInstance: BillboardInstance = {
          data: b,
          object: holder,
          x: b.col + 0.5,
          z: b.row + 0.5,
          y: baseY,
          vx: 0,
          vz: 0,
          aiTimer: 0,
          startX: b.col + 0.5,
          startZ: b.row + 0.5,
        };
        this.activeBillboards.push(abInstance);
        const proxyGeo = new THREE.BoxGeometry(0.55 * s, 0.95 * s, 0.35 * s);
        const proxyMat = new THREE.MeshBasicMaterial();
        this.ownedGeometries.push(proxyGeo);
        this.ownedMaterials.push(proxyMat);
        const proxy = new THREE.Mesh(proxyGeo, proxyMat);
        proxy.visible = false;  // 不可視でもレイキャストには当たる（編集の消去・配置先判定用）
        proxy.position.set(b.col + 0.5, baseY + (0.95 * s) / 2, b.row + 0.5);
        proxy.userData.bbLevel = b.level ?? 0;
        this.scene.add(proxy);
        this.worldObjects.push(proxy);
        const gen = this.buildGen;
        this.loadMcSkin(def.minecraftSkin).then(tex => {
          if (this.disposed || gen !== this.buildGen || !tex) return;
          const { group, limbs } = buildMinecraftModel(tex, 0.95 * s);
          group.traverse(o => {
            const m = o as THREE.Mesh;
            if (m.isMesh) {
              this.ownedGeometries.push(m.geometry);
              this.ownedMaterials.push(m.material as THREE.Material);
            }
          });
          holder.add(group);
          abInstance.mcLimbs = limbs;
        });
        continue;
      }

      // 立方体ブロック：一辺1マスの箱。上に乗れる足場になる（段=BLOCK_SIZE単位で積める）
      if (def?.special === 'block') {
        const base = (b.level ?? 0) * BLOCK_SIZE;
        if (!blockGeoShared) {
          blockGeoShared = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
          this.ownedGeometries.push(blockGeoShared);
        }
        let mat = blockMatShared.get(b.tex);
        if (!mat) {
          mat = new THREE.MeshLambertMaterial({ map: this.getTex(b.tex) });
          blockMatShared.set(b.tex, mat);
          this.ownedMaterials.push(mat);
        }
        const mesh = new THREE.Mesh(blockGeoShared, mat);
        mesh.position.set(b.col + 0.5, base + BLOCK_SIZE / 2, b.row + 0.5);
        mesh.userData.bbLevel = b.level ?? 0;
        this.scene.add(mesh);
        this.worldObjects.push(mesh);
        const key = `${b.col},${b.row}`;
        const tops = this.blockTops.get(key) ?? [];
        tops.push(base + BLOCK_SIZE);
        this.blockTops.set(key, tops);
        continue;
      }

      // ボールはビルボードではなく本物の球体（模様なし・単色×焼き込み陰影）。
      // 2段目以上に置くと自由落下で落ちてくる（重力は updatePlayObjects が常時かける）。
      if (def?.special === 'ball') {
        const r = def.ballRadius ?? BALL_RADIUS;
        const geo = new THREE.SphereGeometry(r, 12, 8);
        const mat = new THREE.MeshLambertMaterial({ map: this.getBallShadeTex(), color: def.color });
        this.ownedGeometries.push(geo);
        this.ownedMaterials.push(mat);
        const mesh = new THREE.Mesh(geo, mat);
        const x = b.col + 0.5, z = b.row + 0.5;
        const y = (b.level ?? 0) * H + r;
        mesh.position.set(x, y, z);
        mesh.userData.bbLevel = b.level ?? 0;
        this.scene.add(mesh);
        this.worldObjects.push(mesh);
        this.balls.push({ mesh, r, homeX: x, homeZ: z, homeY: y, x, z, y, vx: 0, vz: 0, vy: 0 });
        continue;
      }

      const s = b.scale ?? 1;
      const geo = new THREE.PlaneGeometry(s * 0.9, s * 0.9);
      const sharedTex = this.getTex(b.tex);  // 共有テクスチャ（ロードのトリガも兼ねる）
      // 歩行グラ（walk:シート）のNPCは向き（正面/横/背面）を持つので、共有テクスチャではなく
      // 自分専用のキャンバスを持ち、見る角度に応じた行を描き分ける。単体画像は従来どおり常に正面。
      const walkRef = def?.imageRef ? parseWalkRef(def.imageRef) : null;
      const hasDir = !!def?.imageUrl && isAnimatableWalk(walkRef);
      let dirCanvas: HTMLCanvasElement | undefined;
      let dirTexture: THREE.CanvasTexture | undefined;
      if (hasDir) {
        dirCanvas = document.createElement('canvas');
        dirCanvas.width = 64; dirCanvas.height = 64;
        const shared = this.texEntries.get(b.tex);
        if (shared) dirCanvas.getContext('2d')!.drawImage(shared.canvas, 0, 0);  // ロード完了までの仮絵
        dirTexture = new THREE.CanvasTexture(dirCanvas);
        dirTexture.magFilter = THREE.NearestFilter;
        dirTexture.minFilter = THREE.NearestFilter;
        dirTexture.generateMipmaps = false;
        dirTexture.colorSpace = THREE.SRGBColorSpace;
      }
      const mat = new THREE.MeshLambertMaterial({
        map: dirTexture ?? sharedTex,
        alphaTest: 0.5,       // transparent:false のまま切り抜き → 深度ソート不要で描画順バグが出ない
        side: THREE.DoubleSide,
      });
      this.ownedGeometries.push(geo);
      this.ownedMaterials.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      // level 段ぶん浮かせる（足元が y = level*H に揃う）
      mesh.position.set(b.col + 0.5, (b.level ?? 0) * H + (s * 0.9) / 2, b.row + 0.5);
      // 編集ピッキング用：交点の y からではなくビルボード自身の段を採用する（壁の高さと縮尺が違うため）
      mesh.userData.bbLevel = b.level ?? 0;
      this.scene.add(mesh);
      this.worldObjects.push(mesh);
      this.billboardMeshes.push(mesh);
      // 初期の向き：配置の dir（未指定は南向き＝カメラ既定位置から正面が見える）
      const faceYaw = YAW_FOR_DIR[b.dir ?? 2];
      this.activeBillboards.push({
        data: b,
        object: mesh,
        x: b.col + 0.5,
        z: b.row + 0.5,
        y: (b.level ?? 0) * H,
        vx: 0,
        vz: 0,
        aiTimer: 0,
        startX: b.col + 0.5,
        startZ: b.row + 0.5,
        dirCanvas,
        dirTexture,
        faceX: hasDir ? -Math.sin(faceYaw) : undefined,
        faceZ: hasDir ? -Math.cos(faceYaw) : undefined,
      });

      // スピーカー：テクスチャの special で判定（システム床と同じパターン）
      if (def?.special === 'speaker' && def.sound?.src && (def.sound.type ?? 'direct') === 'direct') {
        const arr = speakerCells.get(b.tex) ?? [];
        arr.push([b.col + 0.5, b.row + 0.5]);
        speakerCells.set(b.tex, arr);
      }
    }
    for (const [texId, positions] of speakerCells) {
      const snd = L.textures[texId].sound!;
      this.speakers.push({
        src: snd.src!, positions,
        radius: snd.radius ?? SPEAKER_DEFAULT_RADIUS,
        volume: snd.volume ?? SPEAKER_DEFAULT_VOLUME,
      });
    }
    // 参照されなくなった音源は止めて破棄する（編集で消した/差し替えたケース）
    const liveSrcs = new Set(this.speakers.map(s => s.src));
    for (const [src, audio] of this.speakerAudio) {
      if (!liveSrcs.has(src)) { audio.pause(); this.speakerAudio.delete(src); }
    }
  }

  /** 背景画像（skyUrl）：横360°の円筒パノラマとしてカメラに追従させる。
   *  ワールドより先に描き（renderOrder 負・depthWrite なし）、霧の影響は受けない。
   *  画像ロード中や上下の余白には scene.background（skyColor）が見える。 */
  private updateSky(L: Layout25D) {
    if (!L.skyUrl) {
      this.skyUrlLoaded = undefined;
      if (this.skyMesh) this.skyMesh.visible = false;
      return;
    }
    if (!this.skyMesh) {
      this.skyCanvas = document.createElement('canvas');
      this.skyCanvas.width = 1024; this.skyCanvas.height = 512;
      this.skyTexture = new THREE.CanvasTexture(this.skyCanvas);
      this.skyTexture.magFilter = THREE.NearestFilter;
      this.skyTexture.minFilter = THREE.NearestFilter;
      this.skyTexture.generateMipmaps = false;
      this.skyTexture.colorSpace = THREE.SRGBColorSpace;
      this.skyGeo = new THREE.CylinderGeometry(SKY_RADIUS, SKY_RADIUS, SKY_HEIGHT, 24, 1, true);
      this.skyMat = new THREE.MeshBasicMaterial({
        map: this.skyTexture, side: THREE.BackSide, fog: false,
        transparent: true, depthWrite: false,
      });
      this.skyMesh = new THREE.Mesh(this.skyGeo, this.skyMat);
      this.skyMesh.renderOrder = -1000;
      this.skyMesh.frustumCulled = false;
      this.scene.add(this.skyMesh);
    }
    this.skyMesh.visible = true;
    if (this.skyUrlLoaded !== L.skyUrl) {
      this.skyUrlLoaded = L.skyUrl;
      const { url, crop } = splitCropUrl(L.skyUrl);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (this.disposed || this.skyUrlLoaded !== L.skyUrl || !this.skyCanvas || !this.skyTexture) return;
        const cv = this.skyCanvas;
        const ctx = cv.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, cv.width, cv.height);
        const [sx, sy, sw, sh] = crop ?? [0, 0, img.naturalWidth, img.naturalHeight];
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
        this.skyTexture.needsUpdate = true;
      };
      img.src = url;
    }
  }

  /** (x,z) のセルで below 以下にある最も高い足場（地面0＋ブロック上面）。
   *  薄壁の上端は足場にしない（壁のそばの空中に見えない床ができてしまうため）。 */
  private groundAt(x: number, z: number, below: number): number {
    const tops = this.blockTops.get(`${Math.floor(x)},${Math.floor(z)}`);
    let g = 0;
    if (tops) for (const t of tops) if (t <= below + 1e-3 && t > g) g = t;
    return g;
  }

  /** 高さ範囲 [y0,y1] がセル(c,r)のブロックと重なるか（側面すり抜け防止用）。 */
  private blockSolidAt(c: number, r: number, y0: number, y1: number): boolean {
    const tops = this.blockTops.get(`${c},${r}`);
    if (!tops) return false;
    for (const t of tops) if (t - BLOCK_SIZE < y1 && t > y0) return true;
    return false;
  }

  /** 海（水面）：マップ全面を覆う半透明の板と、入水中の波紋リングを用意/更新する。 */
  private updateWater(L: Layout25D) {
    const lv = L.waterLevel ?? 0;
    if (lv <= 0) {
      if (this.waterMesh) this.waterMesh.visible = false;
      if (this.bubblePts) this.bubblePts.visible = false;
      this.setUnderwater(false);
      return;
    }
    if (!this.waterMesh) {
      this.waterMat = new THREE.MeshLambertMaterial({
        color: WATER_DEFAULT_COLOR, transparent: true, opacity: 0.55,
        side: THREE.DoubleSide, depthWrite: false,
      });
      this.waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.waterMat);
      this.waterMesh.rotation.x = -Math.PI / 2;
      // 波の陰影用ライト：ワールドは環境光（無指向）だけなので、専用の平行光を水面レイヤーにだけ当てる
      this.waterMesh.layers.enable(WATER_LIGHT_LAYER);
      this.scene.add(this.waterMesh);
      this.waterSun = new THREE.DirectionalLight('#ffffff', 1.1);
      this.waterSun.position.set(0.45, 1, 0.3);
      this.waterSun.layers.set(WATER_LIGHT_LAYER);
      this.scene.add(this.waterSun);

      // 泡パーティクル（水中でプレイヤーから立ちのぼる）。プール方式で使い回す
      this.bubbles = Array.from({ length: BUBBLE_MAX }, () => ({ x: 0, y: -1, z: 0, vy: 0, phase: 0 }));
      this.bubbleGeo = new THREE.BufferGeometry();
      this.bubbleGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BUBBLE_MAX * 3).fill(-100), 3));
      this.bubbleMat = new THREE.PointsMaterial({
        color: '#dff4ff', size: 0.07, sizeAttenuation: true, transparent: true, opacity: 0.75, depthWrite: false,
      });
      this.bubblePts = new THREE.Points(this.bubbleGeo, this.bubbleMat);
      this.bubblePts.frustumCulled = false;
      this.scene.add(this.bubblePts);
    }
    // 波の頂点変位用に分割したジオメトリ。マップサイズが変わったときだけ作り直す
    if (!this.waterGeo || this.waterGeoCols !== L.cols || this.waterGeoRows !== L.rows) {
      this.waterGeo?.dispose();
      const segX = Math.min(WAVE_SEG_MAX, L.cols * 2), segY = Math.min(WAVE_SEG_MAX, L.rows * 2);
      this.waterGeo = new THREE.PlaneGeometry(L.cols, L.rows, segX, segY);
      this.waterMesh.geometry = this.waterGeo;
      this.waterGeoCols = L.cols; this.waterGeoRows = L.rows;
      this.waterFlat = true;
    }
    this.waterMesh.visible = true;
    this.waterMesh.scale.set(1, 1, 1);
    this.waterMesh.position.set(L.cols / 2, lv, L.rows / 2);
    // 色は自由に変えられる。溶岩は不透明寄り＋自己発光（暗いワールドでもマグマらしく光って見える）
    const lava = (L.waterKind ?? 'water') === 'lava';
    this.waterMat!.color.set(this.waterBaseColor());
    this.waterMat!.opacity = lava ? 0.85 : 0.55;
    this.waterMat!.emissive.set(lava ? new THREE.Color(this.waterBaseColor()).multiplyScalar(0.55) : new THREE.Color('#000000'));
    if (this.bubbleMat) this.bubbleMat.color.set(lava ? '#ffd27a' : '#dff4ff');
    if (this.bubblePts) this.bubblePts.visible = true;
  }

  /** 水面の基準色。未指定なら種類（水/溶岩）ごとの既定色。 */
  private waterBaseColor(): string {
    return this.layout.waterColor ?? ((this.layout.waterKind ?? 'water') === 'lava' ? LAVA_DEFAULT_COLOR : WATER_DEFAULT_COLOR);
  }

  /** カメラが水面下に入った/出たときの視界切り替え：海の色に合わせた濃いフォグと背景。 */
  private setUnderwater(on: boolean) {
    if (on === this.underwater) return;
    this.underwater = on;
    const L = this.layout;
    if (on) {
      const wc = new THREE.Color(this.waterBaseColor()).multiplyScalar(0.55);
      this.scene.fog = new THREE.Fog(wc, UNDERWATER_FOG_NEAR, UNDERWATER_FOG_FAR);
      this.scene.background = wc;
      if (this.skyMesh) this.skyMesh.visible = false;
    } else {
      this.scene.fog = new THREE.Fog(new THREE.Color(L.fogColor), L.fogNear, L.fogFar);
      this.scene.background = new THREE.Color(L.skyColor);
      if (this.skyMesh) this.skyMesh.visible = !!L.skyUrl && this.skyUrlLoaded === L.skyUrl;
    }
  }

  /** 海面の波と水中演出（毎フレーム）。波は「動き」があるときだけ立つ：プレイヤー・NPC・ボールの
   *  移動を波源として集め、各波源から同心円のさざ波を頂点変位で立てる。全員が静止すると凪へ戻る。 */
  private updateWaterFX(dt: number, inWater: boolean, waterLv: number) {
    if (waterLv <= 0 || !this.waterMesh?.visible || !this.waterGeo) {
      this.setUnderwater(false);
      return;
    }
    this.waveT += dt;

    // ── 波源集め：動いているものだけが水面を揺らす ──
    const srcs: { x: number; z: number; amp: number }[] = [];
    if (inWater && this.playerMoving) srcs.push({ x: this.x, z: this.z, amp: 1 });
    for (const ab of this.activeBillboards) {
      if (srcs.length >= WAVE_SRC_MAX) break;
      if ((Math.abs(ab.vx) > 0.05 || Math.abs(ab.vz) > 0.05) && ab.y < waterLv) {
        srcs.push({ x: ab.x, z: ab.z, amp: 0.7 });
      }
    }
    for (const b of this.balls) {
      if (srcs.length >= WAVE_SRC_MAX) break;
      if (Math.hypot(b.vx, b.vz) > BALL_STOP_EPS && b.y - b.r < waterLv) {
        srcs.push({ x: b.x, z: b.z, amp: 0.6 });
      }
    }
    const target = srcs.length > 0 ? 1 : 0;
    this.waveEnergy += (target - this.waveEnergy) * Math.min(1, WAVE_FADE * dt);

    // ── 頂点変位：凪（エネルギーほぼ0）のときは一度だけ平らへ戻して以降スキップ ──
    const E = this.waveEnergy;
    if (E < 0.02) {
      if (!this.waterFlat) {
        const pos = this.waterGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setZ(i, 0);
        pos.needsUpdate = true;
        this.waterGeo.computeVertexNormals();
        this.waterFlat = true;
      }
    } else {
      const pos = this.waterGeo.attributes.position;
      const cx = this.waterMesh.position.x, cz = this.waterMesh.position.z;
      const t = this.waveT;
      for (let i = 0; i < pos.count; i++) {
        const wx = pos.getX(i) + cx, wz = cz - pos.getY(i);
        // ゆるいうねり＋波源からの同心円さざ波（距離減衰つき）
        let y = 0.02 * Math.sin(wx * 1.7 + t * 1.6) * Math.sin(wz * 1.4 + t * 1.1);
        for (const s of srcs) {
          const d = Math.hypot(wx - s.x, wz - s.z);
          if (d >= WAVE_RADIUS) continue;
          y += s.amp * 0.035 * (1 - d / WAVE_RADIUS) * Math.sin(d * 5.5 - t * 7);
        }
        pos.setZ(i, y * E);
      }
      pos.needsUpdate = true;
      this.waterGeo.computeVertexNormals();
      this.waterFlat = false;
    }

    // ── 水中の視界と泡：カメラが水面下に入ったら発動 ──
    this.setUnderwater(this.camera.position.y < waterLv - 0.02);
    if (this.bubbleGeo && this.bubblePts?.visible) {
      const submerged = inWater && this.hop + 0.55 < waterLv;  // 頭まで水中
      this.bubbleSpawnT -= dt;
      if (submerged && this.bubbleSpawnT <= 0) {
        this.bubbleSpawnT = this.playerMoving ? BUBBLE_INTERVAL * 0.5 : BUBBLE_INTERVAL;
        const b = this.bubbles.find(v => v.y < 0);
        if (b) {
          b.x = this.x + (Math.random() - 0.5) * 0.3;
          b.z = this.z + (Math.random() - 0.5) * 0.3;
          b.y = Math.max(0.05, this.hop + 0.2 + Math.random() * 0.35);
          b.vy = BUBBLE_RISE_V * (0.7 + Math.random() * 0.6);
          b.phase = Math.random() * Math.PI * 2;
        }
      }
      const arr = this.bubbleGeo.attributes.position;
      for (let i = 0; i < this.bubbles.length; i++) {
        const b = this.bubbles[i];
        if (b.y < 0) { arr.setXYZ(i, -100, -100, -100); continue; }
        b.y += b.vy * dt;
        if (b.y >= waterLv - 0.03) { b.y = -1; arr.setXYZ(i, -100, -100, -100); continue; }
        arr.setXYZ(i, b.x + Math.sin(this.waveT * 5 + b.phase) * 0.04, b.y, b.z);
      }
      arr.needsUpdate = true;
    }
  }

  /** サンプル3Dモデルのロード（URLごとに1回だけ。配置ごとに clone して使い回す）。
   *  PBR（Standard）素材はエンジンの見た目に合わせて Lambert へ変換する
   *  （環境マップの無いこのエンジンでは金属マテリアルが真っ黒になるため）。 */
  private loadModel(url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] } | null> {
    let p = this.modelCache.get(url);
    if (!p) {
      this.modelLoader ??= new GLTFLoader();
      p = this.modelLoader.loadAsync(url).then(gltf => {
        const root = gltf.scene;
        root.traverse(o => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const conv = (m: THREE.Material): THREE.Material => {
            const src = m as THREE.MeshStandardMaterial;
            return new THREE.MeshLambertMaterial({
              map: src.map ?? null,
              color: src.color ? src.color.clone() : new THREE.Color('#ffffff'),
              transparent: src.transparent,
              opacity: src.opacity,
              alphaTest: src.alphaTest,
              side: src.side,
            });
          };
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material);
        });
        return { scene: root, animations: gltf.animations };
      }).catch(err => {
        console.warn('yume25d: 3Dモデルのロードに失敗:', url, err);
        return null;
      });
      this.modelCache.set(url, p);
    }
    return p;
  }

  /** 球体ボール用の焼き込み陰影（上ほど明るい縦グラデ）。環境光しかない場面でも球に見えるようにする。
   *  material.color と乗算されるので、テクスチャの color がそのままボールの色になる。 */
  private getBallShadeTex(): THREE.CanvasTexture {
    if (!this.ballShadeTex) {
      const cv = document.createElement('canvas');
      cv.width = 8; cv.height = 64;
      const ctx = cv.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.55, '#cfcfcf');
      g.addColorStop(1, '#5e5e66');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cv.width, cv.height);
      this.ballShadeTex = new THREE.CanvasTexture(cv);
      this.ballShadeTex.colorSpace = THREE.SRGBColorSpace;
    }
    return this.ballShadeTex;
  }

  /** 遊べるオブジェクトの毎フレーム更新。編集モード中はボールを定位置へ戻し、音も止める。 */
  private updatePlayObjects(dt: number) {
    // ── ボール：触れると蹴った方向へ転がり、壁・マップ端で跳ね返って減速する。
    //    高さ方向は例外なく常に自由落下（2段目以上に置かれたボールも落ちてくる） ──
    if (this.editMode) {
      for (const b of this.balls) {
        if (b.x !== b.homeX || b.z !== b.homeZ || b.y !== b.homeY) {
          b.x = b.homeX; b.z = b.homeZ; b.y = b.homeY;
          b.vx = 0; b.vz = 0; b.vy = 0;
          b.mesh.position.set(b.x, b.y, b.z);
        }
      }
    } else {
      for (const b of this.balls) {
        // 蹴る（足の届く高さにあるときだけ。ジャンプで頭上を越えているときは触れない）
        const dx = b.x - this.x, dz = b.z - this.z;
        const d = Math.hypot(dx, dz);
        if (d < PLAYER_RADIUS + b.r && this.hop < this.layout.wallHeight * 0.5 && b.y - b.r < 0.6) {
          const inv = d > 1e-4 ? 1 / d : 0;
          b.vx = (inv ? dx * inv : 1) * KICK_SPEED;
          b.vz = (inv ? dz * inv : 0) * KICK_SPEED;
          b.vy = KICK_UP;
        }

        // 高さ方向：常に重力。足場（地面0＋ブロック上面）でバウンドし、弱くなったら静止する
        const floorY = this.groundAt(b.x, b.z, b.y) + b.r;
        const wasAirborne = b.y > floorY + 1e-3;
        b.vy -= GRAVITY * dt;
        b.y += b.vy * dt;
        if (b.y <= floorY) {
          b.y = floorY;
          b.vy = b.vy < -1 ? -b.vy * BALL_BOUNCE_Y : 0;
        }

        // 水平方向：接地中だけ転がり摩擦をかける（空中では減速しない）
        if (b.vx !== 0 || b.vz !== 0) {
          if (!wasAirborne) {
            const decel = Math.max(0, 1 - BALL_FRICTION * dt);
            b.vx *= decel; b.vz *= decel;
            if (Math.hypot(b.vx, b.vz) < BALL_STOP_EPS) { b.vx = 0; b.vz = 0; }
          }
          // X → Z の順に進め、壁の辺・ブロック側面・マップ端で速度を反転（壁はプレイヤーと同じ辺集合）。
          // 壁より高く飛んでいる間は壁を越えられる（当たり判定があるのは地上段の壁のみ）
          const hitsWall = b.y - b.r < this.layout.wallHeight;
          const by0 = b.y - b.r * 0.6, by1 = b.y + b.r * 0.6;
          let nx = b.x + b.vx * dt;
          if (b.vx > 0) {
            const c0 = Math.floor(b.x + b.r), c1 = Math.floor(nx + b.r);
            const blocked = c1 > c0 && ((hitsWall && this.blockedV(c1, b.z)) || this.blockSolidAt(c1, Math.floor(b.z), by0, by1));
            if (blocked || nx > this.layout.cols - b.r) { nx = b.x; b.vx = -b.vx * BALL_BOUNCE; }
          } else if (b.vx < 0) {
            const c0 = Math.floor(b.x - b.r), c1 = Math.floor(nx - b.r);
            const blocked = c1 < c0 && ((hitsWall && this.blockedV(c0, b.z)) || this.blockSolidAt(c1, Math.floor(b.z), by0, by1));
            if (blocked || nx < b.r) { nx = b.x; b.vx = -b.vx * BALL_BOUNCE; }
          }
          b.x = nx;
          let nz = b.z + b.vz * dt;
          if (b.vz > 0) {
            const r0 = Math.floor(b.z + b.r), r1 = Math.floor(nz + b.r);
            const blocked = r1 > r0 && ((hitsWall && this.blockedH(r1, b.x)) || this.blockSolidAt(Math.floor(b.x), r1, by0, by1));
            if (blocked || nz > this.layout.rows - b.r) { nz = b.z; b.vz = -b.vz * BALL_BOUNCE; }
          } else if (b.vz < 0) {
            const r0 = Math.floor(b.z - b.r), r1 = Math.floor(nz - b.r);
            const blocked = r1 < r0 && ((hitsWall && this.blockedH(r0, b.x)) || this.blockSolidAt(Math.floor(b.x), r1, by0, by1));
            if (blocked || nz < b.r) { nz = b.z; b.vz = -b.vz * BALL_BOUNCE; }
          }
          b.z = nz;
        }
        b.mesh.position.set(b.x, b.y, b.z);
      }
    }

    // ── スピーカー：最寄りのスプライトまでの距離 d から音量 = volume × (1 - d/radius)²。
    //    逆二乗則の近似（0距離で有限・radius でちょうど無音）。プレイ中のみ鳴らす。 ──
    const audible = !this.editMode && !this.demo;
    for (const s of this.speakers) {
      let d2 = Infinity;
      for (const [px, pz] of s.positions) {
        const dd = (px - this.x) * (px - this.x) + (pz - this.z) * (pz - this.z);
        if (dd < d2) d2 = dd;
      }
      const t = Math.max(0, 1 - Math.sqrt(d2) / s.radius);
      const vol = audible ? Math.min(1, s.volume * t * t) * (applyMasterVolume(100) / 100) : 0;
      let audio = this.speakerAudio.get(s.src);
      if (vol > SPEAKER_PAUSE_EPS) {
        if (!audio) {
          audio = new Audio(s.src);
          audio.loop = true;
          audio.crossOrigin = 'anonymous';
          this.speakerAudio.set(s.src, audio);
        }
        audio.volume = vol;
        // 初回はブラウザの自動再生制限で失敗することがある。操作後のフレームで再試行される
        if (audio.paused) audio.play().catch(() => {});
      } else if (audio && !audio.paused) {
        audio.pause();
      }
    }
  }

  /** 空腹値の変更（クランプ＋表示値が変わったときだけHUDへ通知）。 */
  private setHunger(v: number) {
    this.hunger = Math.max(0, Math.min(HUNGER_MAX, v));
    const shown = Math.ceil(this.hunger);
    if (shown !== this.hungerShown) {
      this.hungerShown = shown;
      this.onHungerChange?.(this.hunger, HUNGER_MAX);
    }
  }

  /** ダッシュ可能か：空腹ゲージ有効時は🍗3個（6ポイント）以下で走れない（Minecraft準拠）。 */
  private canDash(): boolean {
    return !this.layout.hunger || this.hunger > HUNGER_SPRINT_MIN;
  }

  private takeDamage(amount: number) {
    if (this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.onHpChange?.(this.hp, this.maxHp);
    playSysSfx('https://rpgen-search.pages.dev/audio/sound/XaNbgp.mp3');

    if (this.hp <= 0) {
      // onDeath が登録されている場合は呼び出し元が死亡画面を管理する（リセットは resetToStart() を呼ぶ）
      if (this.onDeath) {
        this.startFade('#4a0a14', () => { this.onDeath?.(); });
      } else {
        this.startFade('#4a0a14', () => this.resetToStart());
      }
    } else {
      this.startFlash('#a01828', HIT_FLASH_PEAK);
    }
  }

  private resolveBillboardWalls(ab: BillboardInstance) {
    const r = 0.22;
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      const c0 = Math.ceil(ab.x - r), c1 = Math.floor(ab.x + r);
      for (let c = c0; c <= c1; c++) {
        const r0 = Math.floor(ab.z - r * 0.9), r1 = Math.floor(ab.z + r * 0.9);
        let blocked = false;
        for (let row = r0; row <= r1; row++) {
          if (this.vEdges.has(`${c},${row}`)) { blocked = true; break; }
        }
        if (blocked) {
          ab.x = ab.x < c ? c - r - EPS : c + r + EPS;
          moved = true;
        }
      }
      const r0 = Math.ceil(ab.z - r), r1 = Math.floor(ab.z + r);
      for (let rr = r0; rr <= r1; rr++) {
        const c0_v = Math.floor(ab.x - r * 0.9), c1_v = Math.floor(ab.x + r * 0.9);
        let blocked = false;
        for (let col = c0_v; col <= c1_v; col++) {
          if (this.hEdges.has(`${col},${rr}`)) { blocked = true; break; }
        }
        if (blocked) {
          ab.z = ab.z < rr ? rr - r - EPS : rr + r + EPS;
          moved = true;
        }
      }
      if (!moved) break;
    }

    const r_bound = 0.22;
    ab.x = Math.max(r_bound + EPS, Math.min(this.layout.cols - r_bound - EPS, ab.x));
    ab.z = Math.max(r_bound + EPS, Math.min(this.layout.rows - r_bound - EPS, ab.z));
    this.resolveBillboardCollisionsForNpc(ab);
  }

  private resolveBillboardCollisions() {
    const pr = PLAYER_RADIUS;
    const H = this.layout.wallHeight;
    const playerLevel = Math.round(this.hop / H);
    
    for (const ab of this.activeBillboards) {
      if (!ab.data.collidable || ab.dead) continue;
      const abLevel = ab.data.level ?? 0;
      if (abLevel !== playerLevel) continue;

      const br = 0.22 * (ab.data.scale ?? 1);
      const dx = this.x - ab.x;
      const dz = this.z - ab.z;
      const dist = Math.hypot(dx, dz);
      const minDist = pr + br;
      if (dist < minDist) {
        const pushDist = minDist - dist;
        if (dist > 1e-4) {
          this.x += (dx / dist) * pushDist;
          this.z += (dz / dist) * pushDist;
        } else {
          this.x += minDist;
        }
      }
    }
  }

  private resolveBillboardCollisionsForNpc(ab: BillboardInstance) {
    const pr = 0.22;
    for (const other of this.activeBillboards) {
      if (other === ab || other.dead || !other.data.collidable) continue;
      
      const abLevel = ab.data.level ?? 0;
      const otherLevel = other.data.level ?? 0;
      if (abLevel !== otherLevel) continue;

      const br = 0.22 * (other.data.scale ?? 1);
      const dx = ab.x - other.x;
      const dz = ab.z - other.z;
      const dist = Math.hypot(dx, dz);
      const minDist = pr + br;
      if (dist < minDist) {
        const pushDist = minDist - dist;
        if (dist > 1e-4) {
          ab.x += (dx / dist) * pushDist;
          ab.z += (dz / dist) * pushDist;
        } else {
          ab.x += minDist;
        }
      }
    }
  }

  /** 3Dモデルのアニメを移動状態に合わせて切り替える（クロスフェード付き）。
   *  idle クリップが無いモデルは歩きを先頭コマで固定して直立、run が無ければ歩きの早回しで代用する。 */
  private applyModelAnim(ab: BillboardInstance, mode: 'idle' | 'walk' | 'run', timeScale = 1) {
    const anims = ab.anims;
    if (!anims) return;
    if (mode === 'idle' && !anims.idle) {
      if (ab.currentAction && ab.currentAction !== anims.walk) ab.currentAction.stop();
      anims.walk.play();
      anims.walk.paused = true;
      anims.walk.time = 0;
      anims.walk.timeScale = 1;
      ab.currentAction = anims.walk;
      return;
    }
    let target: THREE.AnimationAction;
    if (mode === 'idle') {
      target = anims.idle!;
    } else if (mode === 'run') {
      target = anims.run ?? anims.walk;
      if (!anims.run) timeScale *= 1.6;
    } else {
      target = anims.walk;
    }
    if (ab.currentAction !== target) {
      const prev = ab.currentAction;
      target.reset().play();
      if (prev) target.crossFadeFrom(prev, 0.2, false);
      ab.currentAction = target;
    }
    target.paused = false;
    target.timeScale = timeScale;
  }

  private updateBillboardAI(dt: number) {
    if (this.editMode) return;
    const speed = 1.0;
    const waterLv = this.layout.waterLevel ?? 0;
    const wd = this.layout.waterDamage;
    const lavaSea = (this.layout.waterKind ?? 'water') === 'lava';
    for (const ab of this.activeBillboards) {
      if (ab.dead) continue;
      const b = ab.data;
      const behavior = b.behavior || 'still';

      // ── 水没ダメージ（住人）：浸かっている間じわじわ弱り、尽きると倒れて消える（リスポーンで復活）。
      //    「追尾」の住人は敵扱いで waterDamage.enemy、それ以外は waterDamage.npc に従う。溶岩は倍速。 ──
      if (waterLv > 0 && !this.demo && wd && (behavior === 'chase' ? wd.enemy : wd.npc) && ab.y < waterLv - 1e-3) {
        ab.submergeHp = (ab.submergeHp ?? NPC_SUBMERGE_SEC) - dt * (lavaSea ? 2 : 1);
        if (ab.submergeHp <= 0) {
          ab.dead = true;
          this.deadIds.add(b.id);
          ab.object.visible = false;
          ab.vx = 0; ab.vz = 0;
          continue;
        }
        // 残りわずかで点滅させて「溺れている」ことを見せる
        ab.object.visible = ab.submergeHp > 1.0 || Math.floor(ab.submergeHp * 8) % 2 === 0;
      } else if (ab.submergeHp !== undefined && ab.submergeHp < NPC_SUBMERGE_SEC) {
        ab.submergeHp = Math.min(NPC_SUBMERGE_SEC, ab.submergeHp + dt);  // 陸に上がれば回復
        ab.object.visible = true;
      }
      if (behavior === 'still') {
        ab.vx = 0;
        ab.vz = 0;
        this.applyModelAnim(ab, 'idle');
        if (this.isModel3D(b.tex)) {
          ab.object.rotation.y = b.dir !== undefined ? YAW_FOR_DIR[b.dir] : 0;
        }
        continue;
      }

      const prevX = ab.x;
      const prevZ = ab.z;

      if (behavior === 'random') {
        ab.aiTimer -= dt;
        if (ab.aiTimer <= 0) {
          if (ab.vx === 0 && ab.vz === 0) {
            const theta = Math.random() * Math.PI * 2;
            ab.vx = Math.cos(theta) * speed;
            ab.vz = Math.sin(theta) * speed;
            ab.aiTimer = 1.0 + Math.random() * 2.0;
          } else {
            ab.vx = 0;
            ab.vz = 0;
            ab.aiTimer = 0.5 + Math.random() * 1.5;
          }
        }
      } else if (behavior === 'randomDash') {
        // ランダムダッシュ：ランダム移動の駆け足版。短く一気に駆けて、止まって息継ぎする
        ab.aiTimer -= dt;
        if (ab.aiTimer <= 0) {
          if (ab.vx === 0 && ab.vz === 0) {
            const theta = Math.random() * Math.PI * 2;
            ab.vx = Math.cos(theta) * speed * AI_DASH_MULT;
            ab.vz = Math.sin(theta) * speed * AI_DASH_MULT;
            ab.aiTimer = 0.35 + Math.random() * 0.5;
          } else {
            ab.vx = 0;
            ab.vz = 0;
            ab.aiTimer = 0.6 + Math.random() * 1.6;
          }
        }
      } else if (behavior === 'chase') {
        const dx = this.x - ab.x;
        const dz = this.z - ab.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 8.0 && dist > 0.5) {
          ab.vx = (dx / dist) * speed;
          ab.vz = (dz / dist) * speed;
        } else {
          ab.vx = 0;
          ab.vz = 0;
        }
      } else if (behavior === 'flee') {
        const dx = ab.x - this.x;
        const dz = ab.z - this.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 5.0) {
          ab.vx = (dx / dist) * speed * 1.3;
          ab.vz = (dz / dist) * speed * 1.3;
        } else {
          ab.vx = 0;
          ab.vz = 0;
        }
      } else if (behavior === 'patrolH') {
        if (ab.vx === 0) ab.vx = speed;
      } else if (behavior === 'patrolV') {
        if (ab.vz === 0) ab.vz = speed;
      } else if (behavior === 'walker') {
        if (ab.vx === 0 && ab.vz === 0) {
          const theta = Math.random() * Math.PI * 2;
          ab.vx = Math.cos(theta) * speed;
          ab.vz = Math.sin(theta) * speed;
        }
      }

      ab.x += ab.vx * dt;
      ab.z += ab.vz * dt;

      this.resolveBillboardWalls(ab);

      if (behavior === 'patrolH' && Math.abs(ab.x - prevX) < 1e-4) {
        ab.vx = -ab.vx;
      } else if (behavior === 'patrolV' && Math.abs(ab.z - prevZ) < 1e-4) {
        ab.vz = -ab.vz;
      } else if (behavior === 'walker' && Math.hypot(ab.x - prevX, ab.z - prevZ) < 1e-4 * speed) {
        const theta = Math.random() * Math.PI * 2;
        ab.vx = Math.cos(theta) * speed;
        ab.vz = Math.sin(theta) * speed;
      } else if (behavior === 'randomDash' && (ab.vx !== 0 || ab.vz !== 0)
        && Math.hypot(ab.x - prevX, ab.z - prevZ) < 1e-4) {
        // 壁に頭から突っ込んだら、そこでダッシュを打ち切って息継ぎへ
        ab.vx = 0;
        ab.vz = 0;
        ab.aiTimer = 0.4 + Math.random() * 0.8;
      }

      // 移動速度に応じたアニメ：ダッシュ級なら走り、通常は歩き（速度でテンポも変える）、停止中は直立
      const sp = Math.hypot(ab.vx, ab.vz);
      // 歩行グラNPCの向き：動いている間は進行方向を向き、止まったら最後の向きを保つ
      if (ab.dirTexture && sp > 1e-4) {
        ab.faceX = ab.vx / sp;
        ab.faceZ = ab.vz / sp;
      }
      if (sp > 1e-4) {
        if (sp > speed * 1.5) this.applyModelAnim(ab, 'run');
        else this.applyModelAnim(ab, 'walk', Math.min(1.6, Math.max(0.75, sp / speed)));
      } else {
        this.applyModelAnim(ab, 'idle');
      }

      // マイクラモデルの手足スイング：移動中は速度に合わせて前後に振り、停止でゆっくり直立へ戻す
      if (ab.mcLimbs) {
        const L = ab.mcLimbs;
        if (sp > 1e-4) {
          ab.mcPhase = (ab.mcPhase ?? 0) + dt * (5 + sp * 4);
          const a = Math.sin(ab.mcPhase) * Math.min(0.8, 0.35 + sp * 0.25);
          L.rArm.rotation.x = a; L.lArm.rotation.x = -a;
          L.rLeg.rotation.x = -a; L.lLeg.rotation.x = a;
        } else {
          const k = Math.max(0, 1 - dt * 8);
          for (const limb of [L.rArm, L.lArm, L.rLeg, L.lLeg]) limb.rotation.x *= k;
        }
      }

      const s = b.scale ?? 1;
      const is3DModel = this.isModel3D(b.tex);
      const objectY = is3DModel ? ab.y : ab.y + (s * 0.9) / 2;
      ab.object.position.set(ab.x, objectY, ab.z);

      if (is3DModel) {
        if (ab.vx !== 0 || ab.vz !== 0) {
          ab.lastYaw = Math.atan2(ab.vx, ab.vz);
        }
        ab.object.rotation.y = ab.lastYaw ?? (b.dir !== undefined ? YAW_FOR_DIR[b.dir] : Math.atan2(ab.vx || 0, ab.vz || 0));
      }
    }
  }

  // ── 移動・当たり判定 ─────────────────────────────────────────────────────
  private clampToBounds() {
    this.x = Math.max(PLAYER_RADIUS + EPS, Math.min(this.layout.cols - PLAYER_RADIUS - EPS, this.x));
    this.z = Math.max(PLAYER_RADIUS + EPS, Math.min(this.layout.rows - PLAYER_RADIUS - EPS, this.z));
  }

  /** 壁（地上段）は y ∈ [0, wallHeight] の範囲だけ実体がある。足元がその上端以上にあるときは
   *  遮らない（壁の上の空間に見えない当たり判定が伸びないように）。 */
  private aboveWalls(): boolean {
    return this.hop >= this.layout.wallHeight - 1e-3;
  }
  /** x=c の縦辺が、プレイヤーの z 範囲のどこかで壁になっているか。 */
  private blockedV(c: number, z: number): boolean {
    if (this.aboveWalls()) return false;
    const r0 = Math.floor(z - PLAYER_RADIUS * 0.9), r1 = Math.floor(z + PLAYER_RADIUS * 0.9);
    for (let r = r0; r <= r1; r++) if (this.vEdges.has(`${c},${r}`)) return true;
    return false;
  }
  /** z=r の横辺が、プレイヤーの x 範囲のどこかで壁になっているか。 */
  private blockedH(r: number, x: number): boolean {
    if (this.aboveWalls()) return false;
    const c0 = Math.floor(x - PLAYER_RADIUS * 0.9), c1 = Math.floor(x + PLAYER_RADIUS * 0.9);
    for (let c = c0; c <= c1; c++) if (this.hEdges.has(`${c},${r}`)) return true;
    return false;
  }

  /** プレイヤー円と壁面の重なりを、中心のある側へ押し出して解消する。
   *  moveX/moveZ は「前縁が境界をまたいだ瞬間」しか見ないため、通路や壁の端で壁面を
   *  またいだ状態のまま横滑りすると壁の内側へ入れてしまう（垂直に突っ込むと抜ける報告の正体）。
   *  毎フレーム最後に重なり自体を解消することで、進入経路によらずすり抜けを防ぐ。
   *  押し出しで別の壁と重なることがあるので2回まで反復する。 */
  private resolveWalls() {
    const r = PLAYER_RADIUS;
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      const c0 = Math.ceil(this.x - r), c1 = Math.floor(this.x + r);
      for (let c = c0; c <= c1; c++) {
        if (!this.blockedV(c, this.z)) continue;
        this.x = this.x < c ? c - r - EPS : c + r + EPS;
        moved = true;
      }
      const r0 = Math.ceil(this.z - r), r1 = Math.floor(this.z + r);
      for (let rr = r0; rr <= r1; rr++) {
        if (!this.blockedH(rr, this.x)) continue;
        this.z = this.z < rr ? rr - r - EPS : rr + r + EPS;
        moved = true;
      }
      if (!moved) break;
    }
    this.resolveBillboardCollisions();
  }

  /** ブロック側面：これから入るセル(c,r)がブロックで塞がっているか。
   *  接地中は2段（BLOCK_CLIMB_MAX）までの段差を「よじ登れる」として通し、実際の持ち上げは
   *  step() の足場処理が時間をかけて行う。3段以上の壁面はよじ登れず進入不可。
   *  よじ登り先の足場の上に体高（PLAYER_BODY_H）ぶんの空きが無い場合も進入不可。
   *  空中では側面をすり抜けない（段差 0.05 のみ許容）。 */
  private blockedByBlockCell(c: number, r: number): boolean {
    const tops = this.blockTops.get(`${c},${r}`);
    if (!tops || tops.length === 0) return false;
    // 入った後に立つことになる足場：今の足元から climb 以内で登れる最も高い上面（無ければ今の高さ）
    const climb = this.grounded ? BLOCK_CLIMB_MAX : 0.05;
    let ng = this.hop;
    for (const t of tops) if (t <= this.hop + climb + 1e-3 && t > ng) ng = t;
    // その足場の上に体が収まらなければ（登れない高さの側面・低すぎる天井）進入禁止
    return this.blockSolidAt(c, r, ng + 1e-3, ng + PLAYER_BODY_H);
  }
  private blockedByBlockX(c: number, z: number): boolean {
    const r0 = Math.floor(z - PLAYER_RADIUS * 0.9), r1 = Math.floor(z + PLAYER_RADIUS * 0.9);
    for (let r = r0; r <= r1; r++) if (this.blockedByBlockCell(c, r)) return true;
    return false;
  }
  private blockedByBlockZ(r: number, x: number): boolean {
    const c0 = Math.floor(x - PLAYER_RADIUS * 0.9), c1 = Math.floor(x + PLAYER_RADIUS * 0.9);
    for (let c = c0; c <= c1; c++) if (this.blockedByBlockCell(c, r)) return true;
    return false;
  }

  private moveX(dx: number) {
    if (dx === 0) return;
    let nx = this.x + dx;
    if (dx > 0) {
      const b = Math.floor(this.x + PLAYER_RADIUS), nb = Math.floor(nx + PLAYER_RADIUS);
      if (nb > b && (this.blockedV(nb, this.z) || this.blockedByBlockX(nb, this.z))) nx = nb - PLAYER_RADIUS - EPS;
    } else {
      const b = Math.floor(this.x - PLAYER_RADIUS), nb = Math.floor(nx - PLAYER_RADIUS);
      if (nb < b && (this.blockedV(b, this.z) || this.blockedByBlockX(nb, this.z))) nx = b + PLAYER_RADIUS + EPS;
    }
    this.x = nx;
  }
  private moveZ(dz: number) {
    if (dz === 0) return;
    let nz = this.z + dz;
    if (dz > 0) {
      const b = Math.floor(this.z + PLAYER_RADIUS), nb = Math.floor(nz + PLAYER_RADIUS);
      if (nb > b && (this.blockedH(nb, this.x) || this.blockedByBlockZ(nb, this.x))) nz = nb - PLAYER_RADIUS - EPS;
    } else {
      const b = Math.floor(this.z - PLAYER_RADIUS), nb = Math.floor(nz - PLAYER_RADIUS);
      if (nb < b && (this.blockedH(b, this.x) || this.blockedByBlockZ(nb, this.x))) nz = b + PLAYER_RADIUS + EPS;
    }
    this.z = nz;
  }

  /** 三人称カメラが壁にめり込まないよう、プレイヤーから backX/backZ 方向へ壁に当たるまでの距離を測る。
   *  マーチはセル辺の検出にだけ使い、返す距離は「辺と交差する正確な距離」を解析的に出す
   *  （ステップ幅へ量子化すると、壁際・マップ端でカメラ距離が段階的に飛んでカクつくため）。
   *  マップ境界の外へもカメラを出さない（境界面までの距離は連続値なので滑らかに縮む）。 */
  private raycastClamp(backX: number, backZ: number, maxDist: number): number {
    const MARGIN = 0.05;
    // マップ境界面まででレイの長さを先に制限する（連続値）
    let limit = maxDist;
    if (backX > 1e-6) limit = Math.min(limit, (this.layout.cols - MARGIN - this.x) / backX);
    else if (backX < -1e-6) limit = Math.min(limit, (MARGIN - this.x) / backX);
    if (backZ > 1e-6) limit = Math.min(limit, (this.layout.rows - MARGIN - this.z) / backZ);
    else if (backZ < -1e-6) limit = Math.min(limit, (MARGIN - this.z) / backZ);
    limit = Math.max(POV_MIN_DIST, Math.min(maxDist, limit));

    const STEPS = 24;
    let px = this.x, pz = this.z;
    for (let i = 1; i <= STEPS; i++) {
      const t = (limit * i) / STEPS;
      const nx = this.x + backX * t, nz = this.z + backZ * t;
      const bx0 = Math.floor(px), bx1 = Math.floor(nx);
      if (bx1 !== bx0 && this.vEdges.has(`${Math.max(bx0, bx1)},${Math.floor(nz)}`)) {
        // 交差した縦辺（x=整数）までの正確な距離
        const tHit = Math.abs(backX) > 1e-6 ? (Math.max(bx0, bx1) - this.x) / backX : (limit * (i - 1)) / STEPS;
        return Math.max(POV_MIN_DIST, Math.min(limit, tHit - MARGIN));
      }
      const bz0 = Math.floor(pz), bz1 = Math.floor(nz);
      if (bz1 !== bz0 && this.hEdges.has(`${Math.floor(nx)},${Math.max(bz0, bz1)}`)) {
        const tHit = Math.abs(backZ) > 1e-6 ? (Math.max(bz0, bz1) - this.z) / backZ : (limit * (i - 1)) / STEPS;
        return Math.max(POV_MIN_DIST, Math.min(limit, tHit - MARGIN));
      }
      px = nx; pz = nz;
    }
    return limit;
  }

  // ── システム床（ワープ/ダメージ/つるつる） ────────────────────────────────
  /** 足元セルの床テクスチャ定義（床なし・範囲外は undefined）。 */
  private floorTexAt(x: number, z: number): Tex25D | undefined {
    const c = Math.floor(x), r = Math.floor(z);
    if (c < 0 || r < 0 || c >= this.layout.cols || r >= this.layout.rows) return undefined;
    const t = this.layout.floor[r]?.[c] ?? 0;
    return t > 0 ? this.layout.textures[t] : undefined;
  }

  /** 画面フェード開始。暗転しきったところで onMid（テレポート等）を実行し、明転して終わる。 */
  private startFade(color: string, onMid: () => void) {
    this.fadeMat.color.set(color);
    this.fadeMat.opacity = 0;
    this.fadeMesh.visible = true;
    this.fadeState = { phase: 'out', t: 0, onMid };
  }

  /** 非致死ダメージの赤フラッシュ。暗転（out）を経ずに peak → 0 へ明転だけ行う。 */
  private startFlash(color: string, peak: number) {
    this.fadeMat.color.set(color);
    this.fadeMat.opacity = peak;
    this.fadeMesh.visible = true;
    this.fadeState = { phase: 'in', t: 0, onMid: null, peak };
  }

  private updateFade(dt: number) {
    const f = this.fadeState;
    if (!f) return;
    f.t += dt;
    if (f.phase === 'out') {
      this.fadeMat.opacity = Math.min(1, f.t / FADE_OUT_SEC);
      if (f.t >= FADE_OUT_SEC) {
        f.onMid?.();
        f.onMid = null;
        f.phase = 'in';
        f.t = 0;
      }
    } else {
      this.fadeMat.opacity = Math.max(0, 1 - f.t / FADE_IN_SEC) * (f.peak ?? 1);
      if (f.t >= FADE_IN_SEC) {
        this.fadeState = null;
        this.fadeMesh.visible = false;
        this.fadeMat.opacity = 0;
      }
    }
  }

  private step(dt: number) {
    if (this.invuln > 0) this.invuln -= dt;
    const inp = this.input;
    let turn = (inp.turnL ? 1 : 0) - (inp.turnR ? 1 : 0);
    let move = (inp.forward ? 1 : 0) - (inp.back ? 1 : 0);
    let strafe = (inp.strafeR ? 1 : 0) - (inp.strafeL ? 1 : 0);

    // 死亡中（死亡画面の表示中）：リスポーン（resetToStart で HP 全回復）まで操作を受け付けない
    if (this.hp <= 0 && !this.editMode) {
      turn = 0; move = 0; strafe = 0;
      this.jumpQueued = false;
    }

    if (this.demo) {
      move = 1; strafe = 0;
      if (this.demoTurnFrames > 0) { this.demoTurnFrames--; turn = -1; }
    }

    this.yaw += turn * TURN_SPEED * dt;
    const px = this.x, pz = this.z;
    // 前方 = (-sin yaw, -cos yaw)、右方 = (cos yaw, -sin yaw)
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const H = this.layout.wallHeight;
    const hovering = this.editMode && this.hover;
    // 海：waterLevel より足元が下なら入水中（泳ぎ・沈降・水没ダメージのすべてに使う）
    const waterLv = this.layout.waterLevel ?? 0;
    const inWater = waterLv > 0 && this.hop < waterLv - 1e-3 && !hovering;

    // ── つるつる床：地面に立っている間は矢印方向へ強制スライド（移動入力は無効）。
    //    壁で進めなくなったらそのセルでは滑走を諦めて通常操作へ戻す（ハマり防止）。
    //    ジャンプ中（hop>0）・編集/デモ中は床の効果を受けない。 ──
    const specActive = !this.editMode && !this.demo && !hovering && this.grounded && this.hop <= 0;
    let slideVec: [number, number] | null = null;
    if (specActive) {
      const cellKey = `${Math.floor(this.x)},${Math.floor(this.z)}`;
      if (this.iceBlockedCell && this.iceBlockedCell !== cellKey) this.iceBlockedCell = null;
      const vec = ICE_DIR_VEC[this.floorTexAt(this.x, this.z)?.special ?? ''];
      if (vec && this.iceBlockedCell !== cellKey) {
        const d = ICE_SLIDE_SPEED * dt;
        const sx = this.x, sz = this.z;
        this.moveX(vec[0] * d); this.moveZ(vec[1] * d);
        this.clampToBounds();
        this.resolveWalls();
        if (Math.hypot(this.x - sx, this.z - sz) < d * 0.25) this.iceBlockedCell = cellKey;
        else slideVec = vec;
      }
    } else {
      this.iceBlockedCell = null;
    }

    if (!slideVec && (move !== 0 || strafe !== 0)) {
      const dashMult = (inp.dash && !this.demo && this.canDash()) ? DASH_MULT : 1;
      // ダッシュ移動中は空腹がごくゆっくり減る
      if (dashMult > 1 && this.layout.hunger && !this.editMode) this.setHunger(this.hunger - HUNGER_DASH_DRAIN * dt);
      const swimMult = inWater ? WATER_MOVE_MULT : 1;  // 水中は泳ぎでゆっくり進む
      const ms = move * MOVE_SPEED * dashMult * swimMult * dt, ss = strafe * STRAFE_SPEED * dashMult * swimMult * dt;
      if (hovering && this.hop >= H) {
        // 壁の上端より高く浮遊している間は遮る物がない（当たり判定を持つのは地上段の壁のみ）
        this.x += fx * ms + rx * ss;
        this.z += fz * ms + rz * ss;
        this.clampToBounds();
      } else {
        this.moveX(fx * ms + rx * ss);
        this.moveZ(fz * ms + rz * ss);
        this.clampToBounds();
        this.resolveWalls();
      }
    }
    // 歩行アニメ用：移動状態と「カメラから見た向き」を更新。カメラはプレイヤーの後方に
    // 追従するので、前進中は背中(w)・後退は正面(s)・ストレイフは横向きが見える。
    this.playerMoving = !!slideVec || move !== 0 || strafe !== 0;
    if (slideVec) {
      // 強制スライド中はスライド方向をカメラ相対の向きへ変換して足踏みさせる
      const df = slideVec[0] * fx + slideVec[1] * fz, dr = slideVec[0] * rx + slideVec[1] * rz;
      this.playerDir = Math.abs(df) >= Math.abs(dr) ? (df > 0 ? 'w' : 's') : (dr > 0 ? 'd' : 'a');
    }
    else if (move > 0) this.playerDir = 'w';
    else if (move < 0) this.playerDir = 's';
    else if (strafe > 0) this.playerDir = 'd';
    else if (strafe < 0) this.playerDir = 'a';

    if (this.demo && move !== 0 && this.demoTurnFrames <= 0) {
      const moved = Math.hypot(this.x - px, this.z - pz);
      const expected = MOVE_SPEED * dt;
      // 壁に引っかかったらしばらく右に旋回して抜ける
      if (moved < expected * 0.35) this.demoTurnFrames = 25 + Math.floor(Math.random() * 50);
    }

    // ── ワープ床/ダメージ床：移動後の足元セルで判定。フェード中は再判定しない ──
    if (specActive && !this.fadeState) {
      const tex = this.floorTexAt(this.x, this.z);
      const s = tex?.special;
      if (s === 'warp') {
        if (!this.warpCooldown) {
          // 転送先もワープ床の場合に備え、ワープ床から降りるまで再発動しない
          this.warpCooldown = true;
          playSysSfx(SYS_TILE_WARP_SFX);
          const dest = tex!.warpDest;
          this.startFade('#000000', () => {
            this.x = (dest?.col ?? this.layout.start.col) + 0.5;
            this.z = (dest?.row ?? this.layout.start.row) + 0.5;
            if (dest?.dir !== undefined) this.yaw = YAW_FOR_DIR[dest.dir];
            this.iceBlockedCell = null;
            this.clampToBounds();
            this.resolveWalls();
          });
        }
      } else {
        this.warpCooldown = false;
        if (s === 'damage' && this.invuln <= 0) {
          // 2Dエンジンと同じHP制：無敵時間つきで削り、尽きたら「ゆめから さめて スタート地点へ戻る」
          this.invuln = DAMAGE_INVULN_SEC;
          playSysSfx(SYS_TILE_DAMAGE_SFX);
          this.takeDamage(tex?.damageAmount ?? DAMAGE_DEFAULT);
        }
      }
    }

    // ── 遊べるオブジェクト（ボール・スピーカー） ──
    this.updatePlayObjects(dt);

    // ── 高さ方向：浮遊（ホバー）中は押している間だけ上昇/下降・重力なし。
    //    それ以外（プレイ中・編集の通常モード・浮遊解除直後）は重力とジャンプが働く ──
    if (hovering) {
      const fly = (inp.flyUp ? 1 : 0) - (inp.flyDown ? 1 : 0);
      if (fly !== 0) {
        this.hop = Math.max(0, Math.min(FLY_MAX_ALT, this.hop + fly * FLY_SPEED * dt));
        if (this.hop < H) this.resolveWalls();  // 壁の高さより下へ降りたら壁の中に居座らないよう押し出す
      }
      this.vy = 0;
      this.grounded = this.hop <= this.groundAt(this.x, this.z, this.hop) + 1e-3;
      this.jumpQueued = false;
    } else {
      // ジャンプ（地上）／ひとかき上昇（水中はいつでも）
      if (this.jumpQueued && (this.grounded || inWater)) {
        this.vy = inWater ? SWIM_UP_V : (this.layout.jumpHeight ?? JUMP_VELOCITY_DEFAULT);
        this.grounded = false;
        this.jumpQueued = false;
      }
      // 足場＝地面0＋ブロック上面。
      // 接地中はブロック2段まで自動でよじ登る（moveX/Z が通した段差）。持ち上げは瞬間ではなく
      // CLIMB_SPEED で時間をかけて上る（よじ登りモーション）。
      const ground = this.groundAt(this.x, this.z, this.hop + (this.grounded ? BLOCK_CLIMB_MAX : 0));
      if (this.grounded && this.hop < ground) this.hop = Math.min(ground, this.hop + CLIMB_SPEED * dt);  // 段差をよいしょと上がる
      else if (this.grounded && this.hop > ground + 1e-3) this.grounded = false;  // 足場から出た → 落下開始
      if (!this.grounded || this.hop > ground) {
        if (inWater) {
          // 水中：自由落下せず、水の抵抗で沈降速度へ収束する（高所から飛び込んでも急減速してゆっくり沈む）
          this.vy += (WATER_SINK_V - this.vy) * Math.min(1, WATER_DRAG * dt);
          this.peakHop = this.hop;
        } else {
          this.vy -= GRAVITY * dt;
        }
        this.hop += this.vy * dt;

        if (!inWater && !hovering) {
          this.peakHop = Math.max(this.peakHop, this.hop);
        } else {
          this.peakHop = this.hop;
        }

        if (this.vy <= 0 && this.hop <= ground) {
          const fallDist = this.peakHop - ground;
          this.hop = ground;
          this.vy = 0;
          this.grounded = true;

          if (!inWater && !hovering) {
            if (fallDist > 1.2) {
              playSysSfx('https://rpgen-search.pages.dev/audio/sound/PUMNHM.mp3');
            }
            if (fallDist > 3.0) {
              const damage = Math.floor((fallDist - 3.0) * 2.0);
              if (damage > 0) {
                this.takeDamage(damage);
              }
            }
          }
          this.peakHop = ground;
        }
      } else {
        this.peakHop = this.hop;
      }
    }

    const eyeY = this.layout.wallHeight * 0.52 + this.hop;
    // プレイヤー本体（三人称のときだけ見える）は常に最新の位置・向き・高さへ追従
    this.playerMesh.position.set(this.x, this.hop + 0.42, this.z);
    this.playerMesh.rotation.y = this.yaw;

    if (this.pov === 'third') {
      const backX = Math.sin(this.yaw), backZ = Math.cos(this.yaw);
      const dist = this.raycastClamp(backX, backZ, this.povDistance);
      this.camera.position.set(this.x + backX * dist, eyeY + POV_HEIGHT_ABOVE_EYE, this.z + backZ * dist);
      this.camera.rotation.y = this.yaw;
      // 肩越しの俯瞰チルト＋ユーザーの上下見回し操作分を加算
      this.camera.rotation.x = -Math.atan2(POV_HEIGHT_ABOVE_EYE + 0.1, Math.max(0.35, dist)) + this.pitch;
    } else {
      this.camera.position.set(this.x, eyeY, this.z);
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
    }
    // ランタンはプレイヤー位置（目の高さ）から照らし、背景パノラマはカメラへ追従させる
    if (this.lantern.visible) this.lantern.position.set(this.x, eyeY, this.z);
    if (this.skyMesh?.visible) this.skyMesh.position.copy(this.camera.position);

    // 海面の波（動きがあるときだけ立つ）・水中の視界・泡
    this.updateWaterFX(dt, inWater, waterLv);

    // ── 水没ダメージ（プレイヤー）と酸素。プレイ中のみ（編集・デモ・浮遊は対象外） ──
    const playActive = !this.editMode && !this.demo && !hovering;
    const lavaSea = (this.layout.waterKind ?? 'water') === 'lava';
    if (playActive && !this.fadeState && this.layout.waterDamage?.player && inWater) {
      // 入水した瞬間に1発目、以降は1秒おき（溶岩は倍のダメージ）
      this.submergeDmgT -= dt;
      if (this.submergeDmgT <= 0) {
        this.submergeDmgT = SUBMERGE_DMG_INTERVAL;
        this.takeDamage(lavaSea ? SUBMERGE_DMG_LAVA : SUBMERGE_DMG_WATER);
      }
    } else if (!inWater) {
      this.submergeDmgT = 0;
    }
    // 酸素：頭まで潜っている間だけ減る。尽きたら1秒おきに窒息ダメージ。水面に出れば倍速回復
    if (this.layout.oxygen) {
      const headUnder = inWater && this.hop + 0.55 < waterLv;
      if (playActive && headUnder) {
        this.oxygen = Math.max(0, this.oxygen - dt);
        if (this.oxygen <= 0 && !this.fadeState) {
          this.drownT -= dt;
          if (this.drownT <= 0) {
            this.drownT = SUBMERGE_DMG_INTERVAL;
            this.takeDamage(DROWN_DMG);
          }
        }
      } else {
        this.oxygen = Math.min(OXYGEN_MAX_SEC, this.oxygen + dt * OXYGEN_RECOVER_MULT);
        this.drownT = 0;
      }
    } else if (this.oxygen < OXYGEN_MAX_SEC) {
      this.oxygen = OXYGEN_MAX_SEC;  // 設定で無効化されたらゲージを満タンに戻す
    }
    const oxyShown = Math.ceil(this.oxygen);
    if (oxyShown !== this.oxygenShown) {
      this.oxygenShown = oxyShown;
      this.onOxygenChange?.(this.oxygen, OXYGEN_MAX_SEC);
    }

    // ── 空腹ゲージ（Minecraft準拠の簡略版）。減少はダッシュ移動時（移動ブロック内）に行う ──
    if (this.layout.hunger && playActive) {
      // 🍗9個以上あるとHPが自然回復し、そのぶん空腹を少し消費する
      if (this.hunger >= HUNGER_REGEN_MIN && this.hp > 0 && this.hp < this.maxHp && !this.fadeState) {
        this.regenT += dt;
        if (this.regenT >= HUNGER_REGEN_INTERVAL) {
          this.regenT = 0;
          this.hp = Math.min(this.maxHp, this.hp + 1);
          this.onHpChange?.(this.hp, this.maxHp);
          this.setHunger(this.hunger - HUNGER_REGEN_COST);
        }
      } else {
        this.regenT = 0;
      }
      // 空腹0：飢餓ダメージ。1ハート（2HP）までで止まる＝飢えでは死なない（Minecraftノーマル相当）
      if (this.hunger <= 0 && this.hp > STARVE_MIN_HP && !this.fadeState) {
        this.starveT += dt;
        if (this.starveT >= STARVE_INTERVAL) {
          this.starveT = 0;
          this.takeDamage(1);
        }
      } else {
        this.starveT = 0;
      }
      // 食べ物（special==='food'）：触れると食べる。満腹のときは食べない（Minecraft準拠）
      if (this.hunger < HUNGER_MAX - 1e-3) {
        for (const ab of this.activeBillboards) {
          if (ab.dead) continue;
          const t = this.layout.textures[ab.data.tex];
          if (t?.special !== 'food') continue;
          if (Math.abs(ab.y - this.hop) > 1.0 || Math.hypot(ab.x - this.x, ab.z - this.z) > 0.55) continue;
          ab.dead = true;
          this.deadIds.add(ab.data.id);
          ab.object.visible = false;
          this.setHunger(this.hunger + (t.foodValue ?? FOOD_DEFAULT_VALUE));
          // もぐもぐ音を数回鳴らす（Minecraftの食事音風）
          for (let i = 0; i < 3; i++) setTimeout(() => playSysSfx(SYS_FOOD_SFX), i * 260);
          break;  // 1フレームに食べるのは1個
        }
      }
    }

    // ビルボードはY軸回転のみでカメラへ正対（Buildエンジン風）
    for (const m of this.billboardMeshes) m.rotation.y = this.yaw;
    if (this.ghostKind === 'sprite') {
      if (!this.isModel3D(this.ghostMesh.userData.tex)) {
        this.ghostMesh.rotation.y = this.yaw;
      }
    }

    this.updateFade(dt);
  }
}
