import { BaseGameEngine } from './BaseGameEngine';

export class RPGEngine extends BaseGameEngine {
  private px = 0;
  private py = 0;
  private dir = 'down';
  private frame = 0;
  private speed = 2.5;

  get genre() { return 'rpg'; }

  protected onInit() {
    const start = this.scene.playerStart;
    this.px = start.col * this.ts + this.ts / 2;
    this.py = start.row * this.ts + this.ts / 2;
  }

  protected loop() {
    if (!this.running) return;
    this.updateCanvasScale();
    const sc = this.canvasScale;

    let dx = 0, dy = 0;
    if (this.input.left) dx = -1;
    if (this.input.right) dx = 1;
    if (this.input.up) dy = -1;
    if (this.input.down) dy = 1;
    if (dx && dy) { dx *= 0.707; dy *= 0.707; }

    if (dx || dy) {
      const nx = this.px + dx * this.speed * sc;
      const ny = this.py + dy * this.speed * sc;
      const col = Math.floor(nx / this.ts);
      const row = Math.floor(ny / this.ts);
      if (this.isWalkable(col, row)) {
        this.px = nx;
        this.py = ny;
      }
      if (dx > 0) this.dir = 'right';
      else if (dx < 0) this.dir = 'left';
      if (dy > 0) this.dir = 'down';
      else if (dy < 0) this.dir = 'up';
      this.frame = (this.frame + 0.12) % 3;
    } else {
      this.frame = 0;
    }

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
    const sz = 12;

    ctx.save();
    ctx.shadowColor = '#84cc1640';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#84cc16';
    ctx.beginPath();
    ctx.arc(px, py, sz, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#65a30d';
    ctx.beginPath();
    ctx.arc(px - sz * 0.35, py - sz * 0.3, sz * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px + sz * 0.35, py - sz * 0.3, sz * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4a7a0a';
    const da = { down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 }[this.dir] || 0;
    ctx.beginPath();
    ctx.arc(px + Math.cos(da) * sz * 0.6, py + Math.sin(da) * sz * 0.6, 3, 0, Math.PI * 2);
    ctx.fill();

    this.animId = requestAnimationFrame(() => this.loop());
  }
}
