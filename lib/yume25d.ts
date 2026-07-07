// 2.5Dエンジン（yume25d）: Build エンジン風の「床＋薄板壁＋ビルボード」ワールドを
// three.js で低解像度レンダリングする。レイアウトは Layout25D（プレーンJSON）が唯一の真実で、
// setLayout() でいつでも丸ごと再構築できる。使い終わったら必ず dispose() を呼ぶこと。
import * as THREE from 'three';
import type { Layout25D, Tex25D, Dir4, Billboard25D } from '@/components/game-presets/shared';
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

// 短くポンと跳ねる程度のジャンプ（頭上の低い夢空間を想定）。
const JUMP_VELOCITY = 3.2;
const GRAVITY = 16;

/** 歩行グラ（walk: 参照）の足踏み速度。NPCビルボードは常時ゆっくりマーチ、プレイヤーは歩行時のみ。 */
const BILLBOARD_ANIM_FPS = 4;
const PLAYER_ANIM_FPS = 7;

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
}

export interface PlayerAppearance { emoji?: string; color: string; spriteUrl?: string; spriteRef?: string; }
export type PovMode = 'first' | 'third';

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
const drawPlayerCanvas = (cv: HTMLCanvasElement, a: PlayerAppearance, onUpdate?: () => void): void => {
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

export class Yume25DEngine {
  readonly input: Input25D = { forward: false, back: false, turnL: false, turnR: false, strafeL: false, strafeR: false, dash: false };
  /** デモ再生（イントロ用）：自動で前進し、壁に当たったら向きを変える。 */
  demo = false;

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

  private playerAppearance: PlayerAppearance = { color: '#ffffff' };
  private playerCanvas: HTMLCanvasElement;
  private playerTexture: THREE.CanvasTexture;
  private playerMesh: THREE.Mesh;
  private playerGeo: THREE.PlaneGeometry;
  private playerMat: THREE.MeshBasicMaterial;
  // 歩行グラプレイヤーのアニメ状態。lastKey は「向き:フレーム」で再描画の要否を判定する。
  private playerAnim: { img: HTMLImageElement; std: WalkStandard; lastKey: string } | null = null;
  private playerDir: WayKey = 'w';
  private playerMoving = false;

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
    this.playerMat = new THREE.MeshBasicMaterial({ map: this.playerTexture, alphaTest: 0.5, side: THREE.DoubleSide });
    this.playerMesh = new THREE.Mesh(this.playerGeo, this.playerMat);
    this.playerMesh.visible = this.pov === 'third';
    this.scene.add(this.playerMesh);

    this.buildScene();
    this.resetToStart();
  }

  get pose() { return { x: this.x, z: this.z, yaw: this.yaw }; }

  resetToStart() {
    const s = this.layout.start;
    this.x = s.col + 0.5; this.z = s.row + 0.5;
    this.yaw = YAW_FOR_DIR[s.dir];
    this.pitch = 0;
    this.vy = 0; this.hop = 0; this.grounded = true;
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

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (t - this.lastT) / 1000);
      this.lastT = t;
      this.step(dt);
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
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.clearWorld();
    this.playerGeo.dispose();
    this.playerMat.dispose();
    this.playerTexture.dispose();
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

    // 当たり判定用のエッジ集合
    this.hEdges.clear(); this.vEdges.clear();
    for (const w of L.walls) {
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
      const mat = new THREE.MeshBasicMaterial({
        map: this.getTex(texId),
        side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      });
      this.ownedGeometries.push(geo);
      this.ownedMaterials.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      this.scene.add(mesh);
      this.worldObjects.push(mesh);
    };

    for (const [texId, cells] of floorQuads) {
      const quads: { v: number[][] }[] = [];
      const ceil: { v: number[][] }[] = [];
      for (let i = 0; i < cells.length; i += 2) {
        const c = cells[i], r = cells[i + 1];
        // 上向きの床（反時計回り = +Y 法線）
        quads.push({ v: [[c, 0, r + 1], [c + 1, 0, r + 1], [c + 1, 0, r], [c, 0, r]] });
        if (L.ceiling) {
          ceil.push({ v: [[c, H, r], [c + 1, H, r], [c + 1, H, r + 1], [c, H, r + 1]] });
        }
      }
      makeMergedMesh(texId, quads, false);
      if (L.ceiling && ceil.length) makeMergedMesh(L.ceilingTex, ceil, false);
    }

    // ── 壁：薄板1枚。両面描画して裏からも見えるようにする ──
    const wallQuads = new Map<number, { v: number[][] }[]>();
    for (const w of L.walls) {
      const arr = wallQuads.get(w.tex) ?? [];
      if (w.dir === 0) {
        // 北辺：z=row、x∈[col, col+1]
        arr.push({ v: [[w.col, 0, w.row], [w.col + 1, 0, w.row], [w.col + 1, H, w.row], [w.col, H, w.row]] });
      } else {
        // 西辺：x=col、z∈[row, row+1]
        arr.push({ v: [[w.col, 0, w.row + 1], [w.col, 0, w.row], [w.col, H, w.row], [w.col, H, w.row + 1]] });
      }
      wallQuads.set(w.tex, arr);
    }
    for (const [texId, quads] of wallQuads) makeMergedMesh(texId, quads, true);

    // ── ビルボード：透過スプライト。alphaTest で深度バグ（奥の板が透けて欠ける）を防ぐ ──
    for (const b of L.billboards) {
      const s = b.scale ?? 1;
      const geo = new THREE.PlaneGeometry(s * 0.9, s * 0.9);
      const mat = new THREE.MeshBasicMaterial({
        map: this.getTex(b.tex),
        alphaTest: 0.5,       // transparent:false のまま切り抜き → 深度ソート不要で描画順バグが出ない
        side: THREE.DoubleSide,
      });
      this.ownedGeometries.push(geo);
      this.ownedMaterials.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.col + 0.5, (s * 0.9) / 2, b.row + 0.5);
      this.scene.add(mesh);
      this.worldObjects.push(mesh);
      this.billboardMeshes.push(mesh);
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

  private step(dt: number) {
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
    if (move !== 0 || strafe !== 0) {
      const dashMult = (inp.dash && !this.demo) ? DASH_MULT : 1;
      const ms = move * MOVE_SPEED * dashMult * dt, ss = strafe * STRAFE_SPEED * dashMult * dt;
      this.moveX(fx * ms + rx * ss);
      this.moveZ(fz * ms + rz * ss);
      this.clampToBounds();
      this.resolveWalls();
    }
    // 歩行アニメ用：移動状態と「カメラから見た向き」を更新。カメラはプレイヤーの後方に
    // 追従するので、前進中は背中(w)・後退は正面(s)・ストレイフは横向きが見える。
    this.playerMoving = move !== 0 || strafe !== 0;
    if (move > 0) this.playerDir = 'w';
    else if (move < 0) this.playerDir = 's';
    else if (strafe > 0) this.playerDir = 'd';
    else if (strafe < 0) this.playerDir = 'a';

    if (this.demo && move !== 0 && this.demoTurnFrames <= 0) {
      const moved = Math.hypot(this.x - px, this.z - pz);
      const expected = MOVE_SPEED * dt;
      // 壁に引っかかったらしばらく右に旋回して抜ける
      if (moved < expected * 0.35) this.demoTurnFrames = 25 + Math.floor(Math.random() * 50);
    }

    // ── ジャンプ（短い一段ジャンプ。地面着地でリセット） ──
    if (this.jumpQueued && this.grounded) {
      this.vy = JUMP_VELOCITY;
      this.grounded = false;
      this.jumpQueued = false;
    }
    if (!this.grounded || this.hop > 0) {
      this.vy -= GRAVITY * dt;
      this.hop += this.vy * dt;
      if (this.hop <= 0) { this.hop = 0; this.vy = 0; this.grounded = true; }
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
    // ビルボードはY軸回転のみでカメラへ正対（Buildエンジン風）
    for (const m of this.billboardMeshes) m.rotation.y = this.yaw;
  }
}
