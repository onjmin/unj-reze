/**
 * ピクセルアート（角ドット）風の天候エフェクトシステム。
 * アンチエイリアスや滑らかな円を使わず、全てピクセル単位（fillRect / 角ドットパターン）で描画します。
 */

export type WeatherKind =
	| "none"
	| "rain"
	| "storm"
	| "snow"
	| "blizzard"
	| "cherryBlossom"
	| "leaves"
	| "fog"
	| "sandstorm"
	| "sparkles"
	| "sunbeams";

export interface WeatherConfig {
	kind: WeatherKind;
	/** 強さ・量 (0.1 〜 3.0, 既定 1.0) */
	intensity?: number;
	/** 速度倍率 (0.2 〜 3.0, 既定 1.0) */
	speed?: number;
	/** 風の強さ・向き (-3.0 〜 3.0, 既定 0.0) */
	wind?: number;
	/** カスタム色（省略時は天候ごとの標準カラー） */
	color?: string;
	/** ドットの基準サイズ (1〜4px, 既定 2) */
	pixelSize?: number;
	/** 不透明度倍率 (0.0 〜 1.0, 既定 1.0) */
	opacity?: number;
}

export const WEATHER_LABELS: Record<WeatherKind, string> = {
	none: "なし（快晴）",
	rain: "雨",
	storm: "豪雨・嵐",
	snow: "雪",
	blizzard: "吹雪",
	cherryBlossom: "桜吹雪",
	leaves: "落ち葉（紅葉）",
	fog: "霧・もや",
	sandstorm: "砂嵐",
	sparkles: "星屑・光の粉",
	sunbeams: "木漏れ日",
};

interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	size: number;
	color: string;
	alpha: number;
	life: number;
	maxLife: number;
	phase: number;
	variant: number;
}

interface Splash {
	x: number;
	y: number;
	life: number;
	maxLife: number;
	color: string;
}

interface Lightning {
	active: boolean;
	alpha: number;
	points: { x: number; y: number }[];
	flashAlpha: number;
}

export class PixelWeatherSimulator {
	private particles: Particle[] = [];
	private splashes: Splash[] = [];
	private lightning: Lightning = {
		active: false,
		alpha: 0,
		points: [],
		flashAlpha: 0,
	};
	private lastWidth = 0;
	private lastHeight = 0;
	private lastKind: WeatherKind = "none";
	private lightningTimer = 0;
	private simTime = 0;

	public reset(): void {
		this.particles = [];
		this.splashes = [];
		this.lightning = {
			active: false,
			alpha: 0,
			points: [],
			flashAlpha: 0,
		};
		this.lightningTimer = 0;
		this.simTime = 0;
	}

	public updateAndDraw(
		ctx: CanvasRenderingContext2D,
		width: number,
		height: number,
		config: WeatherConfig,
		deltaTime = 16.67,
		camDeltaX = 0,
		camDeltaY = 0,
	): void {
		if (config.kind === "none") {
			if (this.particles.length > 0) this.reset();
			return;
		}

		if (
			this.lastKind !== config.kind ||
			this.lastWidth !== width ||
			this.lastHeight !== height
		) {
			this.initParticles(width, height, config);
			this.lastKind = config.kind;
			this.lastWidth = width;
			this.lastHeight = height;
		}

		const dt = Math.min(deltaTime, 50) / 16.67; // 基準フレーム(60fps)に対する比率
		this.simTime += deltaTime * 0.001;

		const pixelSize = Math.max(1, Math.round(config.pixelSize ?? 2));
		const intensity = Math.max(0.1, config.intensity ?? 1.0);
		const speed = Math.max(0.1, config.speed ?? 1.0);
		const wind = config.wind ?? 0.0;
		const baseOpacity = Math.max(0, Math.min(1, config.opacity ?? 1.0));

		const targetCount = Math.floor(
			this.getBaseParticleCount(config.kind, width, height) * intensity,
		);
		while (this.particles.length < targetCount) {
			this.particles.push(
				this.createParticle(width, height, config, Math.random() * height),
			);
		}
		if (this.particles.length > targetCount) {
			this.particles.length = targetCount;
		}

		// ── パーティクル更新 ──
		for (let i = 0; i < this.particles.length; i++) {
			const p = this.particles[i];
			p.x += (p.vx * speed + wind * 1.5 - camDeltaX * 0.7) * dt;
			p.y += (p.vy * speed - camDeltaY * 0.7) * dt;
			p.life += dt;
			p.phase += 0.05 * speed * dt;

			// 画面外判定とリサイクル
			const margin = 40;
			if (p.y > height + margin) {
				// 雨なら地面スプラッシュを生成
				if (
					(config.kind === "rain" || config.kind === "storm") &&
					Math.random() < 0.35 * intensity
				) {
					this.createSplash(p.x, height - Math.random() * 8, p.color);
				}
				this.recycleParticle(p, width, height, config, true);
			} else if (p.y < -margin && p.vy < 0) {
				this.recycleParticle(p, width, height, config, false);
			}

			if (p.x > width + margin) {
				p.x = -margin;
				p.y = Math.random() * height;
			} else if (p.x < -margin) {
				p.x = width + margin;
				p.y = Math.random() * height;
			}
		}

		// ── スプラッシュ更新 ──
		for (let i = this.splashes.length - 1; i >= 0; i--) {
			const s = this.splashes[i];
			s.life += dt;
			if (s.life >= s.maxLife) {
				this.splashes.splice(i, 1);
			}
		}

		// ── 嵐の雷・稲妻更新 ──
		if (config.kind === "storm") {
			this.lightningTimer += deltaTime * 0.001;
			if (this.lightningTimer > 5 + Math.random() * 7) {
				this.triggerLightning(width, height);
				this.lightningTimer = 0;
			}
			if (this.lightning.active) {
				this.lightning.alpha -= 0.04 * dt;
				this.lightning.flashAlpha -= 0.06 * dt;
				if (this.lightning.alpha <= 0 && this.lightning.flashAlpha <= 0) {
					this.lightning.active = false;
				}
			}
		}

		// ── 描画実行 ──
		ctx.save();

		// 1. 雷フラッシュ描画
		if (this.lightning.active && this.lightning.flashAlpha > 0) {
			ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, this.lightning.flashAlpha * baseOpacity * 0.6)})`;
			ctx.fillRect(0, 0, width, height);
		}

		// 2. 特殊背景（霧・もや / 砂嵐の環境トーン / 木漏れ日の光芒）
		if (config.kind === "fog") {
			this.drawPixelFog(ctx, width, height, config, pixelSize, baseOpacity);
		} else if (config.kind === "sunbeams") {
			this.drawPixelSunbeams(
				ctx,
				width,
				height,
				config,
				pixelSize,
				baseOpacity,
			);
		} else if (config.kind === "sandstorm") {
			this.drawSandstormHaze(ctx, width, height, baseOpacity);
		}

		// 3. パーティクル本体描画（全て角ドット）
		for (let i = 0; i < this.particles.length; i++) {
			const p = this.particles[i];
			this.drawPixelParticle(
				ctx,
				p,
				config,
				pixelSize,
				baseOpacity,
				width,
				height,
			);
		}

		// 4. 水しぶき（スプラッシュ）描画
		for (let i = 0; i < this.splashes.length; i++) {
			const s = this.splashes[i];
			this.drawPixelSplash(ctx, s, pixelSize, baseOpacity);
		}

		// 5. 稲妻ライン描画
		if (this.lightning.active && this.lightning.alpha > 0) {
			this.drawPixelLightning(ctx, pixelSize, baseOpacity);
		}

		ctx.restore();
	}

	private getBaseParticleCount(
		kind: WeatherKind,
		w: number,
		h: number,
	): number {
		const area = (w * h) / (640 * 360);
		switch (kind) {
			case "rain":
				return Math.round(90 * area);
			case "storm":
				return Math.round(180 * area);
			case "snow":
				return Math.round(75 * area);
			case "blizzard":
				return Math.round(160 * area);
			case "cherryBlossom":
				return Math.round(55 * area);
			case "leaves":
				return Math.round(45 * area);
			case "sandstorm":
				return Math.round(120 * area);
			case "sparkles":
				return Math.round(50 * area);
			case "sunbeams":
				return Math.round(35 * area);
			case "fog":
				return Math.round(30 * area);
			default:
				return 0;
		}
	}

	private initParticles(
		w: number,
		h: number,
		config: WeatherConfig,
	): void {
		this.particles = [];
		const count = Math.floor(
			this.getBaseParticleCount(config.kind, w, h) *
				(config.intensity ?? 1.0),
		);
		for (let i = 0; i < count; i++) {
			this.particles.push(
				this.createParticle(w, h, config, Math.random() * h),
			);
		}
	}

	private createParticle(
		w: number,
		h: number,
		config: WeatherConfig,
		y?: number,
	): Particle {
		const pY = y ?? -10 - Math.random() * 20;
		const pX = Math.random() * (w + 40) - 20;
		const kind = config.kind;

		let vx = 0;
		let vy = 1;
		let size = 1;
		let color = config.color || "#ffffff";
		let alpha = 0.8;
		const maxLife = 100 + Math.random() * 100;
		const phase = Math.random() * Math.PI * 2;
		const variant = Math.floor(Math.random() * 4);

		switch (kind) {
			case "rain": {
				vx = 1.2 + Math.random() * 0.6;
				vy = 9 + Math.random() * 5;
				size = Math.random() < 0.3 ? 2 : 1;
				color = config.color || "#90c5ef";
				alpha = 0.55 + Math.random() * 0.35;
				break;
			}
			case "storm": {
				vx = 4 + Math.random() * 3;
				vy = 13 + Math.random() * 6;
				size = Math.random() < 0.4 ? 2 : 1;
				color = config.color || "#b8dcff";
				alpha = 0.65 + Math.random() * 0.35;
				break;
			}
			case "snow": {
				vx = (Math.random() - 0.5) * 0.6;
				vy = 1.2 + Math.random() * 1.4;
				size = Math.floor(Math.random() * 3) + 1; // 1, 2, 3
				color = config.color || "#ffffff";
				alpha = 0.65 + Math.random() * 0.35;
				break;
			}
			case "blizzard": {
				vx = 6 + Math.random() * 5;
				vy = 3 + Math.random() * 3;
				size = Math.floor(Math.random() * 3) + 1;
				color = config.color || "#f0f8ff";
				alpha = 0.7 + Math.random() * 0.3;
				break;
			}
			case "cherryBlossom": {
				vx = 0.8 + Math.random() * 1.2;
				vy = 1.2 + Math.random() * 1.0;
				size = Math.floor(Math.random() * 2) + 1;
				const pinks = ["#ffb7c5", "#ff9ebb", "#ffc0cb", "#f8a5c2"];
				color = config.color || pinks[Math.floor(Math.random() * pinks.length)];
				alpha = 0.75 + Math.random() * 0.25;
				break;
			}
			case "leaves": {
				vx = 0.9 + Math.random() * 1.4;
				vy = 1.0 + Math.random() * 1.2;
				size = Math.floor(Math.random() * 2) + 1;
				const leafColors = ["#e67e22", "#d35400", "#f39c12", "#c0392b", "#b7950b"];
				color =
					config.color ||
					leafColors[Math.floor(Math.random() * leafColors.length)];
				alpha = 0.8 + Math.random() * 0.2;
				break;
			}
			case "fog": {
				vx = 0.3 + Math.random() * 0.4;
				vy = (Math.random() - 0.5) * 0.15;
				size = Math.floor(Math.random() * 3) + 2;
				color = config.color || "#e8f4f8";
				alpha = 0.25 + Math.random() * 0.25;
				break;
			}
			case "sandstorm": {
				vx = 7 + Math.random() * 6;
				vy = 0.5 + Math.random() * 1.5;
				size = Math.floor(Math.random() * 2) + 1;
				const sandColors = ["#d4ac0d", "#ca6f1e", "#b7950b", "#ba4a00", "#edbb99"];
				color =
					config.color ||
					sandColors[Math.floor(Math.random() * sandColors.length)];
				alpha = 0.6 + Math.random() * 0.35;
				break;
			}
			case "sparkles": {
				vx = (Math.random() - 0.5) * 0.4;
				vy = -0.3 - Math.random() * 0.5;
				size = Math.floor(Math.random() * 3) + 1;
				const sparkleColors = ["#ffffff", "#ffeaa7", "#81ecec", "#74b9ff", "#fab1a0"];
				color =
					config.color ||
					sparkleColors[Math.floor(Math.random() * sparkleColors.length)];
				alpha = 0.4 + Math.random() * 0.6;
				break;
			}
			case "sunbeams": {
				vx = 0.2 + Math.random() * 0.4;
				vy = -0.2 - Math.random() * 0.4;
				size = Math.floor(Math.random() * 2) + 1;
				color = config.color || "#fff8d6";
				alpha = 0.3 + Math.random() * 0.5;
				break;
			}
		}

		return {
			x: pX,
			y: pY,
			vx,
			vy,
			size,
			color,
			alpha,
			life: 0,
			maxLife,
			phase,
			variant,
		};
	}

	private recycleParticle(
		p: Particle,
		w: number,
		h: number,
		config: WeatherConfig,
		fromTop = true,
	): void {
		p.x = Math.random() * (w + 40) - 20;
		p.y = fromTop ? -10 - Math.random() * 20 : h + 10 + Math.random() * 20;
		p.life = 0;
		p.phase = Math.random() * Math.PI * 2;
	}

	private createSplash(x: number, y: number, color: string): void {
		if (this.splashes.length > 40) return;
		this.splashes.push({
			x,
			y,
			life: 0,
			maxLife: 6 + Math.random() * 4,
			color,
		});
	}

	private triggerLightning(w: number, h: number): void {
		this.lightning.active = true;
		this.lightning.alpha = 1.0;
		this.lightning.flashAlpha = 0.9;
		this.lightning.points = [];

		let cx = Math.floor((Math.random() * 0.6 + 0.2) * w);
		let cy = 0;
		this.lightning.points.push({ x: cx, y: cy });

		while (cy < h) {
			cy += Math.floor(12 + Math.random() * 18);
			cx += Math.floor((Math.random() - 0.5) * 36);
			this.lightning.points.push({ x: cx, y: cy });
		}
	}

	// ── ドット描画ルーチン群 ──

	private drawPixelParticle(
		ctx: CanvasRenderingContext2D,
		p: Particle,
		config: WeatherConfig,
		ps: number,
		baseOpacity: number,
		w: number,
		h: number,
	): void {
		const kind = config.kind;
		// ピクセル格子にスナップ
		const px = Math.floor(p.x / ps) * ps;
		const py = Math.floor(p.y / ps) * ps;

		if (px < -ps * 4 || px > w + ps * 4 || py < -ps * 4 || py > h + ps * 4) {
			return;
		}

		ctx.save();
		ctx.fillStyle = p.color;

		switch (kind) {
			case "rain": {
				ctx.globalAlpha = p.alpha * baseOpacity;
				// 雨筋：斜めの角ドットライン（1x4 〜 2x6 ドット）
				const length = p.size === 1 ? 3 : 5;
				for (let step = 0; step < length; step++) {
					ctx.fillRect(px + step * ps, py + step * ps * 2, ps, ps * 2);
				}
				break;
			}
			case "storm": {
				ctx.globalAlpha = p.alpha * baseOpacity;
				const length = p.size === 1 ? 5 : 8;
				for (let step = 0; step < length; step++) {
					ctx.fillRect(px + step * ps * 2, py + step * ps * 2, ps, ps * 2);
				}
				break;
			}
			case "snow": {
				ctx.globalAlpha = p.alpha * baseOpacity;
				// 左右にゆらゆら揺らす
				const sway = Math.sin(p.phase) * 6;
				const spx = Math.floor((p.x + sway) / ps) * ps;

				if (p.size === 1) {
					// 1ドット
					ctx.fillRect(spx, py, ps, ps);
				} else if (p.size === 2) {
					// 2x2 角ドット
					ctx.fillRect(spx, py, ps * 2, ps * 2);
				} else {
					// 3x3 十字ドット
					ctx.fillRect(spx + ps, py, ps, ps * 3);
					ctx.fillRect(spx, py + ps, ps * 3, ps);
				}
				break;
			}
			case "blizzard": {
				ctx.globalAlpha = p.alpha * baseOpacity;
				const sway = Math.sin(p.phase * 2) * 3;
				const spx = Math.floor((p.x + sway) / ps) * ps;
				// 横に流れる角ドット
				ctx.fillRect(spx, py, ps * (p.size + 2), ps);
				break;
			}
			case "cherryBlossom": {
				ctx.globalAlpha = p.alpha * baseOpacity;
				const sway = Math.sin(p.phase) * 12;
				const spx = Math.floor((p.x + sway) / ps) * ps;
				const spin = Math.floor(Math.sin(p.phase * 1.5) * 3); // -2, -1, 0, 1, 2

				// 花びら形状パターン
				if (spin === 0) {
					// 正方形 2x2
					ctx.fillRect(spx, py, ps * 2, ps * 2);
				} else if (Math.abs(spin) === 1) {
					// ひし形 3x3
					ctx.fillRect(spx + ps, py, ps, ps * 3);
					ctx.fillRect(spx, py + ps, ps * 3, ps);
				} else {
					// 横/縦平べったい角ドット
					ctx.fillRect(spx, py, ps * 3, ps);
				}
				break;
			}
			case "leaves": {
				ctx.globalAlpha = p.alpha * baseOpacity;
				const sway = Math.sin(p.phase) * 15;
				const spx = Math.floor((p.x + sway) / ps) * ps;
				const frame = Math.floor(p.phase * 2) % 4;

				// 枯葉の回転パターン
				switch (frame) {
					case 0:
						ctx.fillRect(spx, py, ps * 3, ps * 2);
						ctx.fillRect(spx + ps, py + ps * 2, ps, ps);
						break;
					case 1:
						ctx.fillRect(spx + ps, py, ps * 2, ps * 3);
						break;
					case 2:
						ctx.fillRect(spx, py + ps, ps * 3, ps * 2);
						break;
					case 3:
						ctx.fillRect(spx, py, ps * 2, ps * 2);
						break;
				}
				break;
			}
			case "sandstorm": {
				ctx.globalAlpha = p.alpha * baseOpacity;
				// 横長の高速砂粒
				const len = p.size === 1 ? 2 : 4;
				ctx.fillRect(px, py, ps * len, ps);
				break;
			}
			case "sparkles": {
				// キラキラ点滅
				const pulse = (Math.sin(p.phase * 3) + 1) * 0.5; // 0..1
				ctx.globalAlpha = p.alpha * pulse * baseOpacity;

				if (pulse > 0.6) {
					// 5x5 大十字
					ctx.fillRect(px + ps * 2, py, ps, ps * 5);
					ctx.fillRect(px, py + ps * 2, ps * 5, ps);
					ctx.fillRect(px + ps, py + ps, ps * 3, ps * 3);
				} else if (pulse > 0.25) {
					// 3x3 小十字
					ctx.fillRect(px + ps, py, ps, ps * 3);
					ctx.fillRect(px, py + ps, ps * 3, ps);
				} else {
					// 1ドット
					ctx.fillRect(px + ps, py + ps, ps, ps);
				}
				break;
			}
			case "sunbeams": {
				const pulse = (Math.sin(p.phase * 2) + 1) * 0.5;
				ctx.globalAlpha = p.alpha * pulse * baseOpacity;
				// 上昇する光の微粒子（2x2 or 十字）
				if (p.size === 1) {
					ctx.fillRect(px, py, ps, ps);
				} else {
					ctx.fillRect(px, py, ps * 2, ps * 2);
				}
				break;
			}
			case "fog": {
				ctx.globalAlpha = p.alpha * baseOpacity * 0.7;
				// 霧の塊（角ドットクラスター）
				const s = p.size;
				ctx.fillRect(px, py, ps * s * 3, ps * s * 2);
				ctx.fillRect(px + ps * s, py - ps * s, ps * s * 2, ps * s * 4);
				break;
			}
		}

		ctx.restore();
	}

	private drawPixelSplash(
		ctx: CanvasRenderingContext2D,
		s: Splash,
		ps: number,
		baseOpacity: number,
	): void {
		const progress = s.life / s.maxLife; // 0..1
		const alpha = (1 - progress) * 0.7 * baseOpacity;
		if (alpha <= 0) return;

		const sx = Math.floor(s.x / ps) * ps;
		const sy = Math.floor(s.y / ps) * ps;
		const spread = Math.floor(progress * 4) * ps;

		ctx.save();
		ctx.fillStyle = s.color;
		ctx.globalAlpha = alpha;

		// 左右に跳ねる水滴ドット
		ctx.fillRect(sx - spread, sy - Math.floor((1 - progress) * 3) * ps, ps, ps);
		ctx.fillRect(sx + spread, sy - Math.floor((1 - progress) * 3) * ps, ps, ps);
		// 中央の着地点
		ctx.fillRect(sx, sy, ps * 2, ps);

		ctx.restore();
	}

	private drawPixelLightning(
		ctx: CanvasRenderingContext2D,
		ps: number,
		baseOpacity: number,
	): void {
		const pts = this.lightning.points;
		if (pts.length < 2) return;

		ctx.save();
		ctx.fillStyle = "#ffffff";
		ctx.globalAlpha = this.lightning.alpha * baseOpacity;

		for (let i = 0; i < pts.length - 1; i++) {
			const p1 = pts[i];
			const p2 = pts[i + 1];

			// 角ドットのブレゼンハム風直線描画
			const x0 = Math.floor(p1.x / ps) * ps;
			const y0 = Math.floor(p1.y / ps) * ps;
			const x1 = Math.floor(p2.x / ps) * ps;
			const y1 = Math.floor(p2.y / ps) * ps;

			const dx = Math.abs(x1 - x0);
			const dy = Math.abs(y1 - y0);
			const sx = x0 < x1 ? ps : -ps;
			const sy = y0 < y1 ? ps : -ps;
			let err = dx - dy;

			let currX = x0;
			let currY = y0;

			while (true) {
				ctx.fillRect(currX, currY, ps * 2, ps * 2);
				if (Math.abs(currX - x1) < ps && Math.abs(currY - y1) < ps) break;
				const e2 = 2 * err;
				if (e2 > -dy) {
					err -= dy;
					currX += sx;
				}
				if (e2 < dx) {
					err += dx;
					currY += sy;
				}
			}
		}

		ctx.restore();
	}

	private drawPixelFog(
		ctx: CanvasRenderingContext2D,
		w: number,
		h: number,
		config: WeatherConfig,
		ps: number,
		baseOpacity: number,
	): void {
		ctx.save();
		const alpha = (config.opacity ?? 0.35) * baseOpacity;
		ctx.fillStyle = config.color || "rgba(220, 235, 245, 0.4)";
		ctx.globalAlpha = alpha;

		// 2x2 市松模様（ディザリング）の霧バンドを2層スクロール
		const offset1 = Math.floor((this.simTime * 20) % (ps * 4));
		const offset2 = Math.floor((this.simTime * -12) % (ps * 4));

		const bandHeight = Math.floor(h / 3);
		// 上層
		ctx.fillRect(0, 0, w, bandHeight);
		// 下層
		ctx.fillRect(0, h - bandHeight, w, bandHeight);

		// ディザリング風ストライプ
		for (let y = 0; y < h; y += ps * 4) {
			const shift = (y / (ps * 4)) % 2 === 0 ? offset1 : offset2;
			for (let x = -ps * 4; x < w + ps * 4; x += ps * 4) {
				ctx.fillRect(x + shift, y, ps * 2, ps * 2);
			}
		}

		ctx.restore();
	}

	private drawPixelSunbeams(
		ctx: CanvasRenderingContext2D,
		w: number,
		h: number,
		config: WeatherConfig,
		ps: number,
		baseOpacity: number,
	): void {
		ctx.save();
		const alpha = (config.opacity ?? 0.25) * baseOpacity;
		ctx.fillStyle = config.color || "#fff8d6";
		ctx.globalAlpha = alpha;

		// 斜めの光条バンド（角ドットステップ）
		const beamCount = 4;
		const beamWidth = Math.floor(w / (beamCount * 2));

		for (let i = 0; i < beamCount; i++) {
			const startX = Math.floor((w / beamCount) * i + Math.sin(this.simTime * 0.5 + i) * 20);
			for (let y = 0; y < h; y += ps * 3) {
				const x = startX + Math.floor(y * 0.6);
				const beamAlpha = Math.sin((y / h) * Math.PI) * alpha;
				ctx.globalAlpha = beamAlpha;
				ctx.fillRect(
					Math.floor(x / ps) * ps,
					y,
					Math.floor(beamWidth / ps) * ps,
					ps * 3,
				);
			}
		}

		ctx.restore();
	}

	private drawSandstormHaze(
		ctx: CanvasRenderingContext2D,
		w: number,
		h: number,
		baseOpacity: number,
	): void {
		ctx.save();
		ctx.fillStyle = "rgba(180, 130, 60, 0.18)";
		ctx.globalAlpha = baseOpacity;
		ctx.fillRect(0, 0, w, h);
		ctx.restore();
	}
}

/** 単発または共有インスタンスで描画するためのユーティリティ関数 */
let defaultSimulator: PixelWeatherSimulator | null = null;

export function drawPixelWeather(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	config: WeatherConfig,
	deltaTime = 16.67,
	camDeltaX = 0,
	camDeltaY = 0,
): void {
	if (!defaultSimulator) {
		defaultSimulator = new PixelWeatherSimulator();
	}
	defaultSimulator.updateAndDraw(
		ctx,
		width,
		height,
		config,
		deltaTime,
		camDeltaX,
		camDeltaY,
	);
}
