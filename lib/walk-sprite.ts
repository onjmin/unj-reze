// 歩行グラ（キャラチップ）の規格定義・スライス・アニメーション。
//
// rpgen-walk/src/lib/anime.ts（規格）と PreviewWalkPart.svelte（足踏みサイクル）を移植・整理したもの。
// 1枚のシート画像を「方向(行) × フレーム(列)」のグリッドとみなし、向きと時間からセル矩形を求める。
//
// シート配置: index = frame + way * frames（= anime.ts の toI）。行=方向, 列=フレーム。

export type WayKey = "w" | "a" | "s" | "d" | "q" | "e" | "z" | "c";

export interface Way {
	key: WayKey;
	label: string;
}

export const WAY: Record<WayKey, Way> = {
	w: { key: "w", label: "後" },
	a: { key: "a", label: "左" },
	s: { key: "s", label: "前" },
	d: { key: "d", label: "右" },
	q: { key: "q", label: "左後" },
	e: { key: "e", label: "右後" },
	z: { key: "z", label: "左前" },
	c: { key: "c", label: "右前" },
};

export interface WalkStandard {
	id: string;
	label: string;
	/** 1セルの幅(px) */
	w: number;
	/** 1セルの高さ(px) */
	h: number;
	/** 1方向あたりのフレーム数（=列数） */
	frames: number;
	/** シートの行順（上から）。方向の並びは規格ごとに異なる */
	ways: Way[];
	/**
	 * true の場合、左移動（'a'）のときにキャンバスを水平反転して描画する。
	 * SMC (Super Mario Construct) 形式: 右向きの1行ストリップのみ、左は反転。
	 */
	flipH?: boolean;
}

// rpgen-walk/src/lib/anime.ts より移植
export const RPGEN: WalkStandard = {
	id: "rpgen",
	label: "RPGEN",
	w: 16,
	h: 16,
	frames: 2,
	ways: [WAY.w, WAY.d, WAY.s, WAY.a],
};
export const RPGMAKER_2000: WalkStandard = {
	id: "rm2k",
	label: "ツクール2000",
	w: 24,
	h: 32,
	frames: 3,
	ways: [WAY.w, WAY.d, WAY.s, WAY.a],
};
export const RPGMAKER_XP: WalkStandard = {
	id: "rmxp",
	label: "ツクールXP",
	w: 32,
	h: 48,
	frames: 4,
	ways: [WAY.s, WAY.a, WAY.d, WAY.w],
};
export const RPGMAKER_VX: WalkStandard = {
	id: "rmvx",
	label: "ツクールVX",
	w: 32,
	h: 32,
	frames: 3,
	ways: [WAY.s, WAY.a, WAY.d, WAY.w],
};
export const RPGMAKER_MV: WalkStandard = {
	id: "rmmv",
	label: "ツクールMV",
	w: 48,
	h: 48,
	frames: 3,
	ways: [WAY.s, WAY.a, WAY.d, WAY.w],
};

/**
 * SMC (Super Mario Construct) 水平ストリップ規格。
 * 右向き1行のみ持ち、左移動時は水平反転する。
 * アトラス内のクロップは WalkRef.crop で指定する。
 */
export const SMC_STRIP: WalkStandard = {
	id: "smc",
	label: "SMC (水平ストリップ)",
	w: 16,
	h: 16,
	frames: 2,
	ways: [WAY.d],
	flipH: true,
};

/**
 * 簡易アニメーション規格（行指定・方向固定）。
 * 指定した1行のコマ群を ループ / 往復(ピンポン) / 単発 で再生する。向きによらず同一の表示となる。
 */
export const ROW_ANIM: WalkStandard = {
	id: "row_anim",
	label: "簡易アニメ（方向固定）",
	w: 16,
	h: 16,
	frames: 4,
	ways: [WAY.s],
};

export const WALK_STANDARDS: WalkStandard[] = [
	RPGEN,
	RPGMAKER_2000,
	RPGMAKER_XP,
	RPGMAKER_VX,
	RPGMAKER_MV,
	SMC_STRIP,
	ROW_ANIM,
];

export function standardById(id: string): WalkStandard {
	return WALK_STANDARDS.find((s) => s.id === id) ?? RPGEN;
}

// ───────────────── 方向の決定 ─────────────────

/** 移動ベクトル(dx,dy: 画面座標, y下向き正)から4方向のWayKeyを返す。停止時は null。 */
export function dirFromDelta(dx: number, dy: number): WayKey | null {
	if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) return null;
	if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "d" : "a";
	return dy >= 0 ? "s" : "w"; // 下(s=前) / 上(w=後)
}

/** シート上で、その方向の行が存在しなければ前(s)→後(w)→右(d)→左(a) の順でフォールバック。 */
function resolveWay(std: WalkStandard, key: WayKey): Way {
	const order: WayKey[] = [key, "s", "d", "a", "w"];
	for (const k of order) {
		const found = std.ways.find((w) => w.key === k);
		if (found) return found;
	}
	return std.ways[0];
}

// ───────────────── フレームサイクル（PreviewWalkPart より移植） ─────────────────

/**
 * 足踏みフレーム番号(0..frames-1)を求める。
 * - frames!==3: step % frames（例 2フレーム=0,1,0,1 / 4フレーム=0,1,2,3）
 * - frames===3: 2 - |2 - (step%4)| → 0,1,2,1 のピンポン（ツクール標準の中→端→中→端）
 */
export function walkFrameIndex(std: WalkStandard, step: number): number {
	const n = std.frames;
	return n !== 3
		? ((step % n) + n) % n
		: 2 - Math.abs(2 - (((step % 4) + 4) % 4));
}

export interface SpriteRect {
	sx: number;
	sy: number;
	sw: number;
	sh: number;
}

// Chromium系のCanvas実装のctx.drawImageのバグ対策
// 隣のセルへのサンプリング回り込みを防ぐため、切り出し幅・高さをわずかに内側に狭める
// 16px に対して 15.9px にすることで、右隣の境界線（32px目）のサンプリングを完全に回避する
const SAFE_OFFSET_XY = 0.1;
const SAFE_OFFSET_WH = 0.2;

/**
 * シート画像の実寸(imgW,imgH)から、指定の向き・フレームの矩形を求める。
 * 規格のセル寸法ではなく「実寸 / グリッド数」でセルを割り出すので、拡大縮小されたシートでも破綻しない。
 */
export function cellRect(
	std: WalkStandard,
	imgW: number,
	imgH: number,
	key: WayKey,
	frame: number,
	rowOffset: number = 0,
): SpriteRect {
	const cols = std.frames;
	const rows = std.ways.length;
	const cw = imgW / cols;
	const ch = imgH / rows;
	const way = resolveWay(std, key);
	const baseRowIdx = std.ways.indexOf(way);
	const rowIdx = baseRowIdx + rowOffset * rows;
	const colIdx = ((frame % cols) + cols) % cols;
	return {
		sx: colIdx * cw + SAFE_OFFSET_XY,
		sy: rowIdx * ch + SAFE_OFFSET_XY,
		sw: cw - SAFE_OFFSET_WH,
		sh: ch - SAFE_OFFSET_WH,
	};
}

/**
 * 「向き」と「経過時間/移動状態」から描画すべきセル矩形を返す高レベルヘルパ。
 * 停止中は中央フレーム（待機ポーズ）を出す。
 */
export function animatedCell(
	std: WalkStandard,
	imgW: number,
	imgH: number,
	opts: {
		dir: WayKey;
		moving: boolean;
		timeSec: number;
		fps?: number;
		row?: number;
	},
): SpriteRect {
	const fps = opts.fps ?? 6;
	const step = opts.moving
		? Math.floor(opts.timeSec * fps)
		: std.frames === 3
			? 0
			: 0;
	const idleFrame = std.frames === 3 ? 1 : 0; // 3フレーム規格は中央が待機
	const frame = opts.moving ? walkFrameIndex(std, step) : idleFrame;
	return cellRect(std, imgW, imgH, opts.dir, frame, opts.row ?? 0);
}

/**
 * 大きな1枚のシート内、キャラ1体分の矩形(crop)だけを対象に animatedCell と同じ計算を行う。
 * 複数キャラが連結したシートから、テンプレート規格（RPGEN/ツクール等）でキャラ単位に
 * 切り出した際の描画に使う（WalkRef.crop + 汎用stdId の組み合わせ）。
 * SMC専用のストリップ分割（lib/smc-sprite.ts）とは別物。
 */
export function animatedCellInRect(
	std: WalkStandard,
	crop: [number, number, number, number],
	opts: {
		dir: WayKey;
		moving: boolean;
		timeSec: number;
		fps?: number;
		row?: number;
	},
): SpriteRect {
	const [csx, csy, csw, csh] = crop;
	const cell = animatedCell(std, csw, csh, opts);
	const rowOffsetY = (opts.row ?? 0) * (cell.sh * std.ways.length);
	return {
		sx: csx + cell.sx,
		sy: csy + cell.sy + rowOffsetY,
		sw: cell.sw,
		sh: cell.sh,
	};
}

// ───────────────── 簡易アニメーション (Row Animation) ─────────────────

export type AnimPlayMode = "loop" | "pingpong" | "once";

/**
 * 簡易アニメーション（行指定）のフレームインデックス(0..frames-1)を求める。
 * - loop: 0, 1, 2, ..., N-1, 0, 1, 2, ...
 * - pingpong: 0, 1, 2, ..., N-1, N-2, ..., 1, 0, 1, ...
 * - once: 0, 1, 2, ..., N-1（最終コマで停止）
 */
export function rowAnimFrameIndex(
	frames: number,
	playMode: AnimPlayMode = "loop",
	timeSec: number,
	fps: number = 6,
): number {
	if (frames <= 1) return 0;
	const step = Math.floor(timeSec * fps);
	if (playMode === "once") {
		return Math.min(step, frames - 1);
	}
	if (playMode === "pingpong") {
		const period = 2 * (frames - 1);
		const cycle = ((step % period) + period) % period;
		return cycle < frames ? cycle : period - cycle;
	}
	// 'loop'
	return ((step % frames) + frames) % frames;
}

/**
 * 簡易アニメーション（行指定・方向固定）のセル矩形を求める。
 * - crop: 行/アトラスの切り出し領域 [csx, csy, csw, csh]
 * - opts: コマ数(frames), 行番号(row), 再生モード(playMode: loop/pingpong/once), 速度(fps), 経過時間(timeSec)
 */
export function rowAnimCellInRect(
	crop: [number, number, number, number],
	opts: {
		frames?: number;
		row?: number;
		playMode?: AnimPlayMode;
		fps?: number;
		timeSec: number;
	},
): SpriteRect {
	const [csx, csy, csw, csh] = crop;
	const numFrames = opts.frames && opts.frames > 0 ? opts.frames : 1;
	const rowIndex = opts.row ?? 0;
	const frameIdx = rowAnimFrameIndex(
		numFrames,
		opts.playMode ?? "loop",
		opts.timeSec,
		opts.fps ?? 6,
	);

	const cw = csw / numFrames;
	const ch = csh;
	return {
		sx: csx + frameIdx * cw + SAFE_OFFSET_XY,
		sy: csy + rowIndex * ch + SAFE_OFFSET_XY,
		sw: cw - SAFE_OFFSET_WH,
		sh: ch - SAFE_OFFSET_WH,
	};
}

// ───────────────── 規格の自動推定 ─────────────────

/**
 * 画像実寸から最も妥当な規格を推定する。
 * 1) セル寸法が完全一致する規格を優先（RPGEN 16x16 等）。
 * 2) 無ければアスペクト比からの近似で選ぶ。最後は RPGEN。
 */
export function detectStandard(imgW: number, imgH: number): WalkStandard {
	// 完全一致（cols=frames, rows=ways.length でセルが規格寸と一致）
	for (const s of WALK_STANDARDS) {
		if (imgW === s.w * s.frames && imgH === s.h * s.ways.length) return s;
	}
	// セル寸が割り切れて規格セル寸に一致するもの
	for (const s of WALK_STANDARDS) {
		if (imgW % s.frames === 0 && imgH % s.ways.length === 0) {
			const cw = imgW / s.frames;
			const ch = imgH / s.ways.length;
			if (cw === s.w && ch === s.h) return s;
		}
	}
	// アスペクト比近似（1セルの w:h）
	let best = RPGEN;
	let bestDiff = Infinity;
	for (const s of WALK_STANDARDS) {
		const cellAspect = s.w / s.h;
		const imgAspect = imgW / s.frames / (imgH / s.ways.length);
		const diff = Math.abs(cellAspect - imgAspect);
		if (diff < bestDiff) {
			bestDiff = diff;
			best = s;
		}
	}
	return best;
}

// ───────────────── 画像ロード（キャッシュ付き） ─────────────────

const imgCache = new Map<string, HTMLImageElement>();
const imgPromises = new Map<string, Promise<HTMLImageElement>>();

/** 画像をロードしてキャッシュ。crossOrigin 付きで CDN 画像も canvas へ転写できるようにする。 */
export function loadImage(url: string): Promise<HTMLImageElement> {
	const cached = imgCache.get(url);
	if (cached) return Promise.resolve(cached);
	const inflight = imgPromises.get(url);
	if (inflight) return inflight;
	const p = new Promise<HTMLImageElement>((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.decoding = "async";
		img.onload = () => {
			imgCache.set(url, img);
			imgPromises.delete(url);
			resolve(img);
		};
		img.onerror = () => {
			imgPromises.delete(url);
			reject(new Error(`failed to load ${url}`));
		};
		img.src = url;
	});
	imgPromises.set(url, p);
	return p;
}

export function peekImage(url: string): HTMLImageElement | undefined {
	return imgCache.get(url);
}

/**
 * spriteRef / spriteUrl / walk:/url#fragment から、サムネイル描画に使うソース矩形を求める。
 * 画像の実寸(imgW,imgH)と resolvedUrl（URL フラグメント込み）を受け取り、{ sx, sy, sw, sh } を返す。
 * walk: 参照がある場合は正面(idle)フレーム、url:#fragment は指定矩形、それ以外は画像全体。
 */
export function resolveSpriteRect(
	walk: {
		stdId: string;
		crop?: [number, number, number, number];
		frames?: number;
		row?: number;
		source: { kind: string };
	} | null,
	imgW: number,
	imgH: number,
	resolvedUrl: string | undefined,
): SpriteRect {
	if (walk?.crop && walk.stdId === "row_anim") {
		return rowAnimCellInRect(walk.crop, {
			frames: walk.frames ?? 4,
			timeSec: 0,
			row: walk.row,
		});
	}
	// walk: + crop → 連結シートから規格でキャラ1体分を切り出した参照
	if (walk?.crop && walk.source.kind !== "smc_json") {
		let std =
			walk.stdId === "auto"
				? detectStandard(walk.crop[2], walk.crop[3])
				: standardById(walk.stdId);
		if (walk.stdId === "auto" && walk.frames && walk.frames > 0)
			std = { ...std, frames: walk.frames };
		return animatedCellInRect(std, walk.crop, {
			dir: "s",
			moving: false,
			timeSec: 0,
			row: walk.row,
		});
	}
	// walk: + no crop → 1枚のシートを規格グリッドで分割
	if (walk) {
		const std =
			walk.stdId === "auto"
				? detectStandard(imgW, imgH)
				: standardById(walk.stdId);
		const sw = imgW / std.frames;
		const sh = imgH / std.ways.length;
		const idleCol = std.frames === 3 ? 1 : 0;
		const frontIdx = std.ways.findIndex((w) => w.key === "s");
		return {
			sx: idleCol * sw,
			sy: (frontIdx >= 0 ? frontIdx : 0) * sh,
			sw,
			sh,
		};
	}
	// url:#sx,sy,sw,sh → フラグメントでクロップ
	if (resolvedUrl) {
		const hashIdx = resolvedUrl.indexOf("#");
		if (hashIdx !== -1) {
			const parts = resolvedUrl
				.slice(hashIdx + 1)
				.split(",")
				.map(Number);
			if (parts.length >= 4 && parts.slice(0, 4).every((n) => !isNaN(n))) {
				let sw = parts[2];
				const sh = parts[3];
				if (parts.length >= 5 && parts[4] > 1) sw = sw / parts[4];
				return { sx: parts[0], sy: parts[1], sw, sh };
			}
		}
	}
	// フォールバック: 画像全体
	return { sx: 0, sy: 0, sw: imgW, sh: imgH };
}
