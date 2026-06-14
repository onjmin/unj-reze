import { BaseGameEngine } from './BaseGameEngine';

export class PlatformerEngine extends BaseGameEngine {
  private px = 0;
  private py = 0;
  private vy = 0;
  private dir = 'right';
  private frame = 0;
  private speed = 3;
  private gravity = 0.15;
  private jumpPower = -3.5;
  private onGround = false;

  get genre() { return 'platformer'; }

  protected onInit() {
    const start = this.scene.playerStart;
    this.px = start.col * this.ts + this.ts / 2;
    this.py = start.row * this.ts + this.ts / 2;
  }

  protected loop() {
    if (!this.running) return;
    this.updateCanvasScale();
    const sc = this.canvasScale;

    let dx = 0;
    if (this.input.left) dx = -1;
    if (this.input.right) dx = 1;
    if (dx > 0) this.dir = 'right';
    else if (dx < 0) this.dir = 'left';

    if (this.input.action1 && this.onGround) {
      this.vy = this.jumpPower * sc;
      this.onGround = false;
    }

    this.vy += this.gravity * sc;
    let nx = this.px + dx * this.speed * sc;
    let ny = this.py + this.vy;

    const col = Math.floor(nx / this.ts);
    const row = Math.floor(ny / this.ts);

    this.onGround = false;
    if (this.isWalkable(col, Math.floor(this.py / this.ts))) {
      this.px = nx;
    }
    if (this.isWalkable(Math.floor(this.px / this.ts), row)) {
      this.py = ny;
      if (this.vy > 0 &&
        !this.isWalkable(Math.floor(this.px / this.ts), Math.floor((ny + this.vy) / this.ts))) {
        this.onGround = true;
        this.vy = 0;
      }
    } else if (this.vy > 0) {
      this.vy = 0;
      this.onGround = true;
    }

    if (ny > this.scene.rows * this.ts) {
      this.py = 0;
      this.vy = 0;
    }

    this.frame = dx ? (this.frame + 0.15) % 3 : 0;

    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const camX = this.px - cw / 2;
    const camY = this.py - ch / 2;

    const ctx = this.ctx;
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, cw, ch);

    this.renderTiles(camX, camY);

    const px = this.px - camX;
    const py = this.py - camY;
    const sz = 10;

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(px, py, sz, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px - sz * 0.35, py - sz * 0.3, sz * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px + sz * 0.35, py - sz * 0.3, sz * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.dir === 'right' ? '#cc3333' : '#993333';
    ctx.fillRect(px + (this.dir === 'right' ? sz * 0.4 : -sz * 1.0), py - sz * 0.1, sz * 0.6, sz * 0.25);

    this.animId = requestAnimationFrame(() => this.loop());
  }
}
