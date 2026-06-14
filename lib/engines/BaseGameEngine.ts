import type { GameManifest, SceneData } from '../game-config';
import type { AssetProvider } from '../AssetProvider';

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  action1: boolean;
  action2: boolean;
}

export interface EngineInitOptions {
  canvas: HTMLCanvasElement;
  manifest: GameManifest;
  assets: AssetProvider;
}

export abstract class BaseGameEngine {
  protected canvas!: HTMLCanvasElement;
  protected ctx!: CanvasRenderingContext2D;
  protected manifest!: GameManifest;
  protected scene!: SceneData;
  protected assets!: AssetProvider;
  protected input: InputState = { left: false, right: false, up: false, down: false, action1: false, action2: false };
  protected animId = 0;
  protected running = false;
  protected ts = 32;
  /** キャンバスの初期論理幅（デザイン基準）。init() 時に確定する。 */
  private _nominalW = 0;
  /** 現在のキャンバス幅 / デザイン基準幅。動的リサイズに追従する。 */
  protected canvasScale = 1;
  private _resizeObserver?: ResizeObserver;

  abstract get genre(): string;

  init(opts: EngineInitOptions) {
    this.canvas = opts.canvas;
    this.ctx = opts.canvas.getContext('2d')!;
    this.manifest = opts.manifest;
    this.scene = opts.manifest.scene;
    this.assets = opts.assets;
    this.ts = (this.scene.tileSize || 16) * 2;
    this._nominalW = opts.canvas.width;
    this.canvasScale = 1;
    this._resizeObserver = new ResizeObserver(() => this.updateCanvasScale());
    this._resizeObserver.observe(opts.canvas);
    this.onInit();
  }

  /** canvas.width が変わった際に canvasScale を再計算する。loop の先頭でも呼ぶこと。 */
  protected updateCanvasScale() {
    if (this._nominalW > 0 && this.canvas.width > 0) {
      this.canvasScale = this.canvas.width / this._nominalW;
    }
  }

  protected onInit() { }

  start() {
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.animId);
  }

  destroy() {
    this.stop();
    this._resizeObserver?.disconnect();
    this.onDestroy();
  }

  protected onDestroy() { }

  setInputState(state: Partial<InputState>) {
    Object.assign(this.input, state);
  }

  protected abstract loop(): void;

  protected worldToScreen(wx: number, wy: number, camX: number, camY: number) {
    return { x: wx - camX, y: wy - camY };
  }

  protected renderTiles(camX: number, camY: number) {
    const { ctx, scene, ts } = this;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    const startCol = Math.floor(camX / ts);
    const startRow = Math.floor(camY / ts);
    const endCol = startCol + Math.ceil(cw / ts) + 2;
    const endRow = startRow + Math.ceil(ch / ts) + 2;

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        if (col < 0 || col >= scene.cols || row < 0 || row >= scene.rows) continue;
        const t = scene.tiles[row][col];
        const sx = col * ts - camX;
        const sy = row * ts - camY;
        ctx.fillStyle = this.assets.getTileColor(t, this.manifest.assets);
        ctx.fillRect(sx, sy, ts, ts);
      }
    }
  }

  protected isWalkable(col: number, row: number): boolean {
    const wallTypes = [1, 4, 2, 5, 6, 7];
    const t = this.scene.tiles[row]?.[col];
    return t !== undefined && !wallTypes.includes(t);
  }
}
