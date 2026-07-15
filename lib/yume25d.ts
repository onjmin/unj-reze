// 2.5Dエンジン（yume25d）: Build エンジン風の「床＋薄板壁＋ビルボード」ワールドを
// three.js で低解像度レンダリングする。レイアウトは Layout25D（プレーンJSON）が唯一の真実で、
// setLayout() でいつでも丸ごと再構築できる。使い終わったら必ず dispose() を呼ぶこと。
import * as THREE from 'three';
import { SYS_TILE_WARP_SFX, SYS_TILE_DAMAGE_SFX, type Layout25D, type Tex25D, type Dir4, type Billboard25D } from '@/components/game-presets/shared';
import { detectStandard, standardById, cellRect, walkFrameIndex, type WalkStandard, type WayKey } from '@/lib/walk-sprite';
import { parseWalkRef, type WalkRef } from '@/lib/asset-ref';

/** 内部レンダリング解像度。CSS 側で pixelated 拡大してドット感を出す。 */
export const RENDER_W = 320;
export const RENDER_H = 240;

const PLAYER_RADIUS = 0.22;
const MOVE_SPEED = 2.4;    // マス/秒
const STRAFE_SPEED = 2.0;  // マス/秒
const TURN_SPEED = 2.4;    // ラジアン/秒
const DASH_MULT = 1.8;     // Shift（ダッシュ）中の速度倍率
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
// ボール：プレイヤーが触れると離れる方向へ転がり、壁・マップ端で跳ね返って減速する。
const BALL_RADIUS = 0.22;
const KICK_SPEED = 4.5;      // 蹴った直後の速度（マス/秒）
const BALL_FRICTION = 1.4;   // 転がり減速（1秒あたりの速度割合）
const BALL_BOUNCE = 0.7;     // 壁反射の反発係数
const BALL_STOP_EPS = 0.05;  // これ未満の速度は停止扱い
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
const YUME_MAX_HP = 6;             // 1ハート=2HP × 3ハート（2DのonjReze初期値と同じ）
const DAMAGE_DEFAULT = 3;          // Tex25D.damageAmount 未指定時の被ダメージ量
const DAMAGE_INVULN_SEC = 0.75;
const HIT_FLASH_PEAK = 0.45;       // 非致死ヒットの赤フラッシュの最大不透明度

/** システム床の効果音。GameMaker の playSfx（direct・既定音量50）と同じ聞こえ方に合わせる。 */
const playSysSfx = (src: string) => {
  if (typeof Audio === 'undefined') return;
  try {
    const a = new Audio(src);
    a.volume = 0.35;
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
  | { kind: 'sprite'; col: number; row: number; level: number; tex: number }
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
  /** 蹴れるボール（special==='ball' のスプライト）。home はレイアウト上の定位置で、リセットで戻る。 */
  private balls: { mesh: THREE.Mesh; homeX: number; homeZ: number; x: number; z: number; vx: number; vz: number }[] = [];
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
    this.vy = 0; this.hop = 0; this.grounded = true;
    this.warpCooldown = false;
    this.iceBlockedCell = null;
    this.hp = this.maxHp;
    this.invuln = 0;
    this.onHpChange?.(this.hp, this.maxHp);
    // ボールを定位置へ戻す（プレイ開始・ゆめから さめたとき）
    for (const b of this.balls) {
      b.x = b.homeX; b.z = b.homeZ; b.vx = 0; b.vz = 0;
      b.mesh.position.x = b.x; b.mesh.position.z = b.z;
    }
    this.clampToBounds();
    this.resolveWalls();
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

  /** その場でポンと短く跳ねる。地面にいるときのみ発動（多重ジャンプ防止）。 */
  jump() {
    if (this.grounded) this.jumpQueued = true;
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
        m.rotation.y = this.yaw;  // 以後は step() がビルボード同様カメラへ正対させる
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
      if (!b.interactive) continue;
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
      if (!b.interactive || !b.message) continue;
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
      if (this.editMode) this.onEditFrame?.();  // 移動・浮遊でカメラが動いてもプレビューを追従させる
      this.updateSpeeches(t);
      this.updateTexAnimations(t / 1000);
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
    const speakerCells = new Map<number, [number, number][]>();  // texId -> スピーカー位置
    for (const b of L.billboards) {
      const s = b.scale ?? 1;
      const geo = new THREE.PlaneGeometry(s * 0.9, s * 0.9);
      const mat = new THREE.MeshLambertMaterial({
        map: this.getTex(b.tex),
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

      // 遊べるオブジェクト：テクスチャの special で判定（システム床と同じパターン）
      const def = L.textures[b.tex];
      if (def?.special === 'ball' && (b.level ?? 0) === 0) {
        this.balls.push({ mesh, homeX: b.col + 0.5, homeZ: b.row + 0.5, x: b.col + 0.5, z: b.row + 0.5, vx: 0, vz: 0 });
      } else if (def?.special === 'speaker' && def.sound?.src && (def.sound.type ?? 'direct') === 'direct') {
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

  /** 遊べるオブジェクトの毎フレーム更新。編集モード中はボールを定位置へ戻し、音も止める。 */
  private updatePlayObjects(dt: number) {
    // ── ボール：触れると離れる方向へ転がり、壁・マップ端で跳ね返って減速する ──
    if (this.editMode) {
      for (const b of this.balls) {
        if (b.x !== b.homeX || b.z !== b.homeZ) {
          b.x = b.homeX; b.z = b.homeZ; b.vx = 0; b.vz = 0;
          b.mesh.position.x = b.x; b.mesh.position.z = b.z;
        }
      }
    } else {
      for (const b of this.balls) {
        // 蹴る（ジャンプで頭上を越えているときは触れない）
        const dx = b.x - this.x, dz = b.z - this.z;
        const d = Math.hypot(dx, dz);
        if (d < PLAYER_RADIUS + BALL_RADIUS && this.hop < this.layout.wallHeight * 0.5) {
          const inv = d > 1e-4 ? 1 / d : 0;
          b.vx = (inv ? dx * inv : 1) * KICK_SPEED;
          b.vz = (inv ? dz * inv : 0) * KICK_SPEED;
        }
        if (b.vx === 0 && b.vz === 0) continue;
        const decel = Math.max(0, 1 - BALL_FRICTION * dt);
        b.vx *= decel; b.vz *= decel;
        if (Math.hypot(b.vx, b.vz) < BALL_STOP_EPS) { b.vx = 0; b.vz = 0; continue; }
        // X → Z の順に進め、壁の辺・マップ端で速度を反転（プレイヤーと同じ辺集合を使う）
        let nx = b.x + b.vx * dt;
        if (b.vx > 0) {
          const c0 = Math.floor(b.x + BALL_RADIUS), c1 = Math.floor(nx + BALL_RADIUS);
          if ((c1 > c0 && this.blockedV(c1, b.z)) || nx > this.layout.cols - BALL_RADIUS) { nx = b.x; b.vx = -b.vx * BALL_BOUNCE; }
        } else if (b.vx < 0) {
          const c0 = Math.floor(b.x - BALL_RADIUS), c1 = Math.floor(nx - BALL_RADIUS);
          if ((c1 < c0 && this.blockedV(c0, b.z)) || nx < BALL_RADIUS) { nx = b.x; b.vx = -b.vx * BALL_BOUNCE; }
        }
        b.x = nx;
        let nz = b.z + b.vz * dt;
        if (b.vz > 0) {
          const r0 = Math.floor(b.z + BALL_RADIUS), r1 = Math.floor(nz + BALL_RADIUS);
          if ((r1 > r0 && this.blockedH(r1, b.x)) || nz > this.layout.rows - BALL_RADIUS) { nz = b.z; b.vz = -b.vz * BALL_BOUNCE; }
        } else if (b.vz < 0) {
          const r0 = Math.floor(b.z - BALL_RADIUS), r1 = Math.floor(nz - BALL_RADIUS);
          if ((r1 < r0 && this.blockedH(r0, b.x)) || nz < BALL_RADIUS) { nz = b.z; b.vz = -b.vz * BALL_BOUNCE; }
        }
        b.z = nz;
        b.mesh.position.x = b.x;
        b.mesh.position.z = b.z;
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
      const vol = audible ? Math.min(1, s.volume * t * t) : 0;
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

  // ── 移動・当たり判定 ─────────────────────────────────────────────────────
  private clampToBounds() {
    this.x = Math.max(PLAYER_RADIUS + EPS, Math.min(this.layout.cols - PLAYER_RADIUS - EPS, this.x));
    this.z = Math.max(PLAYER_RADIUS + EPS, Math.min(this.layout.rows - PLAYER_RADIUS - EPS, this.z));
  }

  /** x=c の縦辺が、プレイヤーの z 範囲のどこかで壁になっているか。 */
  private blockedV(c: number, z: number): boolean {
    const r0 = Math.floor(z - PLAYER_RADIUS * 0.9), r1 = Math.floor(z + PLAYER_RADIUS * 0.9);
    for (let r = r0; r <= r1; r++) if (this.vEdges.has(`${c},${r}`)) return true;
    return false;
  }
  /** z=r の横辺が、プレイヤーの x 範囲のどこかで壁になっているか。 */
  private blockedH(r: number, x: number): boolean {
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
  }

  private moveX(dx: number) {
    if (dx === 0) return;
    let nx = this.x + dx;
    if (dx > 0) {
      const b = Math.floor(this.x + PLAYER_RADIUS), nb = Math.floor(nx + PLAYER_RADIUS);
      if (nb > b && this.blockedV(nb, this.z)) nx = nb - PLAYER_RADIUS - EPS;
    } else {
      const b = Math.floor(this.x - PLAYER_RADIUS), nb = Math.floor(nx - PLAYER_RADIUS);
      if (nb < b && this.blockedV(b, this.z)) nx = b + PLAYER_RADIUS + EPS;
    }
    this.x = nx;
  }
  private moveZ(dz: number) {
    if (dz === 0) return;
    let nz = this.z + dz;
    if (dz > 0) {
      const b = Math.floor(this.z + PLAYER_RADIUS), nb = Math.floor(nz + PLAYER_RADIUS);
      if (nb > b && this.blockedH(nb, this.x)) nz = nb - PLAYER_RADIUS - EPS;
    } else {
      const b = Math.floor(this.z - PLAYER_RADIUS), nb = Math.floor(nz - PLAYER_RADIUS);
      if (nb < b && this.blockedH(b, this.x)) nz = b + PLAYER_RADIUS + EPS;
    }
    this.z = nz;
  }

  /** 三人称カメラが壁にめり込まないよう、プレイヤーから backX/backZ 方向へ壁に当たるまでの距離を測る
   *  （粗いレイマーチ。壁の薄板1枚ぶんの精度があれば十分なので細かい解析式は使わない）。 */
  private raycastClamp(backX: number, backZ: number, maxDist: number): number {
    const STEPS = 24;
    let px = this.x, pz = this.z;
    for (let i = 1; i <= STEPS; i++) {
      const t = (maxDist * i) / STEPS;
      const nx = this.x + backX * t, nz = this.z + backZ * t;
      const bx0 = Math.floor(px), bx1 = Math.floor(nx);
      if (bx1 !== bx0 && this.vEdges.has(`${Math.max(bx0, bx1)},${Math.floor(nz)}`)) return Math.max(POV_MIN_DIST, (maxDist * (i - 1)) / STEPS);
      const bz0 = Math.floor(pz), bz1 = Math.floor(nz);
      if (bz1 !== bz0 && this.hEdges.has(`${Math.floor(nx)},${Math.max(bz0, bz1)}`)) return Math.max(POV_MIN_DIST, (maxDist * (i - 1)) / STEPS);
      px = nx; pz = nz;
    }
    return maxDist;
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
      const dashMult = (inp.dash && !this.demo) ? DASH_MULT : 1;
      const ms = move * MOVE_SPEED * dashMult * dt, ss = strafe * STRAFE_SPEED * dashMult * dt;
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
          this.hp = Math.max(0, this.hp - (tex?.damageAmount ?? DAMAGE_DEFAULT));
          this.onHpChange?.(this.hp, this.maxHp);
          if (this.hp <= 0) this.startFade('#4a0a14', () => this.resetToStart());
          else this.startFlash('#a01828', HIT_FLASH_PEAK);
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
      this.grounded = this.hop <= 0;
      this.jumpQueued = false;
    } else {
      // ジャンプ（短い一段ジャンプ。地面着地でリセット）
      if (this.jumpQueued && this.grounded) {
        this.vy = this.layout.jumpHeight ?? JUMP_VELOCITY_DEFAULT;
        this.grounded = false;
        this.jumpQueued = false;
      }
      if (!this.grounded || this.hop > 0) {
        this.vy -= GRAVITY * dt;
        this.hop += this.vy * dt;
        if (this.hop <= 0) { this.hop = 0; this.vy = 0; this.grounded = true; }
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

    // ビルボードはY軸回転のみでカメラへ正対（Buildエンジン風）
    for (const m of this.billboardMeshes) m.rotation.y = this.yaw;
    if (this.ghostKind === 'sprite') this.ghostMesh.rotation.y = this.yaw;

    this.updateFade(dt);
  }
}
