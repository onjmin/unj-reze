import { BaseGameEngine } from './BaseGameEngine';

interface Bullet {
  x: number; y: number; vx: number; vy: number; life: number;
}

export class BulletHellEngine extends BaseGameEngine {
  private px = 0;
  private py = 0;
  private speed = 2.5;
  private bullets: Bullet[] = [];
  private frame = 0;
  private score = 0;
  private time = 0;

  get genre() { return 'bullet-hell'; }

  protected onInit() {
    const start = this.scene.playerStart;
    this.px = start.col * this.ts + this.ts / 2;
    this.py = start.row * this.ts + this.ts / 2;
  }

  protected loop() {
    if (!this.running) return;

    this.time++;

    let dx = 0, dy = 0;
    if (this.input.left) dx = -1;
    if (this.input.right) dx = 1;
    if (this.input.up) dy = -1;
    if (this.input.down) dy = 1;
    if (dx && dy) { dx *= 0.707; dy *= 0.707; }

    const nx = this.px + dx * this.speed;
    const ny = this.py + dy * this.speed;
    const col = Math.floor(nx / this.ts);
    const row = Math.floor(ny / this.ts);
    if (this.isWalkable(col, row)) {
      this.px = nx;
      this.py = ny;
    }

    if (this.input.action1 && this.time % 8 === 0) {
      this.bullets.push({ x: this.px, y: this.py, vx: 0, vy: -4, life: 120 });
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx;
      b.y += b.vy;
      b.life--;
      if (b.life <= 0 || b.x < 0 || b.x > this.scene.cols * this.ts || b.y < 0 || b.y > this.scene.rows * this.ts) {
        this.bullets.splice(i, 1);
      }
    }

    if (this.time % 30 === 0) {
      const centerCol = this.scene.cols / 2;
      const centerRow = this.scene.rows / 2;
      const cx = centerCol * this.ts;
      const cy = centerRow * this.ts;
      const angle = Math.random() * Math.PI * 2;
      const spd = 1.5;
      this.bullets.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
        life: 200,
      });
    }

    for (let i = 0; i < this.bullets.length; i++) {
      const b = this.bullets[i];
      const dist = Math.sqrt((b.x - this.px) ** 2 + (b.y - this.py) ** 2);
      if (dist < 10) {
        this.bullets.splice(i, 1);
        this.score++;
      }
    }

    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const camX = this.px - cw / 2;
    const camY = this.py - ch / 2;

    const ctx = this.ctx;
    ctx.fillStyle = '#07080b';
    ctx.fillRect(0, 0, cw, ch);

    this.renderTiles(camX, camY);

    const px = this.px - camX;
    const py = this.py - camY;
    const sz = 8;

    ctx.fillStyle = '#e11d48';
    ctx.beginPath();
    ctx.arc(px, py, sz, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff6b8a';
    ctx.beginPath();
    ctx.arc(px - sz * 0.3, py - sz * 0.3, sz * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px + sz * 0.3, py - sz * 0.3, sz * 0.3, 0, Math.PI * 2);
    ctx.fill();

    for (const b of this.bullets) {
      const bx = b.x - camX;
      const by = b.y - camY;
      ctx.fillStyle = '#ffaa00';
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffdd44';
      ctx.beginPath();
      ctx.arc(bx, by, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.fillText(`SCORE: ${this.score}`, 8, 16);

    this.animId = requestAnimationFrame(() => this.loop());
  }
}
