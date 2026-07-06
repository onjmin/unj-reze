// 2.5Dエンジン（yume25d）: Build エンジン風の「床＋薄板壁＋ビルボード」ワールドを
// three.js で低解像度レンダリングする。レイアウトは Layout25D（プレーンJSON）が唯一の真実で、
// setLayout() でいつでも丸ごと再構築できる。使い終わったら必ず dispose() を呼ぶこと。
import * as THREE from 'three';
import type { Layout25D, Tex25D, Dir4 } from '@/components/game-presets/shared';

/** 内部レンダリング解像度。CSS 側で pixelated 拡大してドット感を出す。 */
export const RENDER_W = 320;
export const RENDER_H = 240;

const PLAYER_RADIUS = 0.22;
const MOVE_SPEED = 2.4;    // マス/秒
const TURN_SPEED = 2.4;    // ラジアン/秒
const EPS = 1e-3;

/** 方角 → ヨー角。カメラ前方は (-sin yaw, -cos yaw)。 */
const YAW_FOR_DIR: Record<Dir4, number> = { 0: 0, 1: -Math.PI / 2, 2: Math.PI, 3: Math.PI / 2 };

export interface Input25D { forward: boolean; back: boolean; turnL: boolean; turnR: boolean; }

/** テクスチャ実体。fallback キャンバスに画像を後から重ね描きする（Texture の差し替え不要）。 */
interface TexEntry { texture: THREE.CanvasTexture; canvas: HTMLCanvasElement; }

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

export class Yume25DEngine {
  readonly input: Input25D = { forward: false, back: false, turnL: false, turnR: false };
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
  private buildGen = 0;

  // ワールド状態
  private x = 0; private z = 0; private yaw = 0;
  private hEdges = new Set<string>();  // セル(c,r)の北辺（z=r, x∈[c,c+1]）
  private vEdges = new Set<string>();  // セル(c,r)の西辺（x=c, z∈[r,r+1]）
  private billboardMeshes: THREE.Mesh[] = [];
  private worldObjects: THREE.Object3D[] = [];
  private ownedGeometries: THREE.BufferGeometry[] = [];
  private ownedMaterials: THREE.Material[] = [];
  private texEntries = new Map<number, TexEntry>();
  private demoTurnFrames = 0;

  constructor(canvas: HTMLCanvasElement, layout: Layout25D) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(RENDER_W, RENDER_H, false);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, RENDER_W / RENDER_H, 0.05, 100);
    this.camera.rotation.order = 'YXZ';
    this.layout = layout;
    this.buildScene();
    this.resetToStart();
  }

  get pose() { return { x: this.x, z: this.z, yaw: this.yaw }; }

  resetToStart() {
    const s = this.layout.start;
    this.x = s.col + 0.5; this.z = s.row + 0.5;
    this.yaw = YAW_FOR_DIR[s.dir];
    this.clampToBounds();
  }

  /** レイアウト差し替え。シーンを丸ごと作り直す（カメラ位置は維持）。 */
  setLayout(layout: Layout25D) {
    this.layout = layout;
    this.buildScene();
    this.clampToBounds();
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
    for (const e of this.texEntries.values()) e.texture.dispose();
    this.texEntries.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
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
    const cached = this.texEntries.get(id);
    const def = this.layout.textures[id];
    if (cached) {
      // 定義が変わっている可能性があるので描き直すだけ（Texture は同一実体を維持）
      if (def && !def.imageUrl) { texCanvasDraw(cached.canvas, def); cached.texture.needsUpdate = true; }
      return cached.texture;
    }
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const fallback: Tex25D = def ?? { id, name: '?', kind: 'wall', color: '#ff00ff' };
    texCanvasDraw(cv, fallback);
    const texture = new THREE.CanvasTexture(cv);
    // ドット絵前提：常に最近傍補間・ミップマップなし
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    const entry: TexEntry = { texture, canvas: cv };
    this.texEntries.set(id, entry);
    if (def?.imageUrl) {
      const gen = this.buildGen;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (this.disposed || gen !== this.buildGen) return;
        const ctx = cv.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, 64, 64);
        // アスペクト比を保って contain 描画（下端合わせ：立て看板やキャラの足元が揃う）
        const sc = Math.min(64 / img.width, 64 / img.height);
        const w = img.width * sc, h = img.height * sc;
        ctx.drawImage(img, (64 - w) / 2, 64 - h, w, h);
        texture.needsUpdate = true;
      };
      img.src = def.imageUrl;
    }
    return texture;
  }

  private buildScene() {
    this.buildGen++;
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

  private step(dt: number) {
    const inp = this.input;
    let turn = (inp.turnL ? 1 : 0) - (inp.turnR ? 1 : 0);
    let move = (inp.forward ? 1 : 0) - (inp.back ? 1 : 0);

    if (this.demo) {
      move = 1;
      if (this.demoTurnFrames > 0) { this.demoTurnFrames--; turn = -1; }
    }

    this.yaw += turn * TURN_SPEED * dt;
    const px = this.x, pz = this.z;
    if (move !== 0) {
      const s = move * MOVE_SPEED * dt;
      this.moveX(-Math.sin(this.yaw) * s);
      this.moveZ(-Math.cos(this.yaw) * s);
      this.clampToBounds();
    }
    if (this.demo && move !== 0 && this.demoTurnFrames <= 0) {
      const moved = Math.hypot(this.x - px, this.z - pz);
      const expected = MOVE_SPEED * dt;
      // 壁に引っかかったらしばらく右に旋回して抜ける
      if (moved < expected * 0.35) this.demoTurnFrames = 25 + Math.floor(Math.random() * 50);
    }

    const eyeY = this.layout.wallHeight * 0.52;
    this.camera.position.set(this.x, eyeY, this.z);
    this.camera.rotation.y = this.yaw;
    // ビルボードはY軸回転のみでカメラへ正対（Buildエンジン風）
    for (const m of this.billboardMeshes) m.rotation.y = this.yaw;
  }
}
