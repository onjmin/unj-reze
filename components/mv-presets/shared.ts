import type {
	MvManifest,
	MvPresetKind,
	MvSection,
	MvWalkSetting,
} from "@/lib/mv-config";

/** プリセット1件。build() は毎回コピーを返す（プリセット定義を編集で壊さないため）。 */
export interface MvPresetEntry {
	kind: MvPresetKind;
	name: string;
	/** どんな絵になるかの一行説明（プリセット選択UIに出す） */
	description: string;
	/** 差し替えを促したい素材の案内。空なら素材ゼロで完成している。 */
	swapHint?: string;
	build: () => MvManifest;
}

/** 内蔵のプリセット用画像。静止画をデフォルトとする。 */
export const DEFAULT_IMAGE_URL = "/icon-192.png";

// ───────────────── MV用のキャラ素材 ─────────────────
//
// UTAUキャラクター「束音ロゼ」のドット絵一式（public/assets/mv/roze/）。
// RPG用の歩行グラ（行＝方向・列＝足踏み）はMVには向かないので使わない——
// 向きを変える必要が無い代わりに、待機・揺れといった「見せる」動きが要るため。
//
// ここの素材はどれも **1行＝1つのアニメーション**（walk-sprite の `row_anim` 規格）で、
// コマ送りは拍にロックする（`loopBeats`）。秒で送るとテンポを変えた瞬間に音とずれる。

const ROZE_DIR = "/assets/mv/roze";

/**
 * 1コマ384pxのループGIF由来。どれも同じキャラの別の動き。
 *
 * 注意: `beat-a`〜`g` は目開閉・口開閉が**合成済みの一枚絵**（例: "beat-a" = 目開口閉）。
 * `MvCharacterLayer`（キャラクター表示レイヤー）が行う「土台＋目/口の別レイヤー合成」とは
 * 別物なので、character レイヤーの base/eyes/mouth にこれらをそのまま流用しないこと。
 * 目/口を分離したデフォルト素材が欲しい場合は、MvMakerのキャラクターレイヤー編集で
 * 束音ロゼ V1.01 の psd
 * (https://res.cloudinary.com/dbld5kqtz/image/upload/v1786677313/TabaneLozeV101_jnj7yb.psd) の
 * URLを直接指定できる——psdはブラウザ側で `lib/mv-psd.ts` がその場でパースし、
 * 目開/閉・口開/閉などのレイヤーをレイヤー一覧から選んで割り当てる（事前のPNG書き出しや
 * `public/assets/` へのバンドルは不要）。
 */
export const ROZE_BEATS = {
	a: { file: "beat-a", frames: 4 },
	b: { file: "beat-b", frames: 4 },
	c: { file: "beat-c", frames: 4 },
	d: { file: "beat-d", frames: 4 },
	e: { file: "beat-e", frames: 4 },
	f: { file: "beat-f", frames: 14 },
	g: { file: "beat-g", frames: 14 },
} as const;

/** 1コマ320pxの立ち絵アニメ。 */
export const ROZE_POSES = {
	a: { file: "pose-a", frames: 6, cell: 320 },
} as const;

/** 64pxセルのシート。1行＝1アニメーション（4コマ）。a は8行、b は4行。 */
export const ROZE_SHEETS = {
	a: { file: "sheet-a", rows: 8 },
	b: { file: "sheet-b", rows: 4 },
} as const;

export function rozeUrl(file: string): string {
	return `${ROZE_DIR}/${file}.png`;
}

export function rozeRef(file: string): string {
	return `walk:row_anim:u:${ROZE_DIR}/${file}.png`;
}

/**
 * 横1列のループアニメ（beat-* / pose-*）を拍にロックして回す設定。
 * `loopBeats` は1周にかける拍数——4なら1小節で1周。
 */
export function rozeLoop(
	frames: number,
	cell: number,
	loopBeats = 4,
): MvWalkSetting {
	return {
		stdId: "row_anim",
		crop: [0, 0, cell * frames, cell],
		frames,
		loopBeats,
		playMode: "loop",
	};
}

/** beat-* 用（1コマ384px）。 */
export function rozeBeat(
	key: keyof typeof ROZE_BEATS,
	loopBeats = 4,
): MvWalkSetting {
	return rozeLoop(ROZE_BEATS[key].frames, 384, loopBeats);
}

/** pose-* 用（1コマ320px）。 */
export function rozePose(
	key: keyof typeof ROZE_POSES,
	loopBeats = 4,
): MvWalkSetting {
	return rozeLoop(ROZE_POSES[key].frames, ROZE_POSES[key].cell, loopBeats);
}

/** 64pxシートの row 行目（4コマ）を拍にロックして回す設定。 */
export function rozeSheetRow(row: number, loopBeats = 4): MvWalkSetting {
	return {
		stdId: "row_anim",
		crop: [0, row * 64, 256, 64],
		frames: 4,
		loopBeats,
		playMode: "loop",
	};
}

// ───────────────── 「クッキー☆」声優キャラ ─────────────────
//
// public/assets/mv/cookie/。1コマ 160×240 の横ストリップで、こちらも拍にロックして回す。
// 3人ぶん居るので、横一列に並べる絵（ステージ整列）はここから配る。

const COOKIE_DIR = "/assets/mv/cookie";

/** ファイル名 → コマ数。GIFごとにコマ数が違うので表で持つ。 */
export const COOKIE_CAST = {
	"mgr-a": 4,
	"mgr-b": 2,
	"mgr-c": 2,
	"mot-a": 4,
	"mot-b": 4,
	"mot-c": 4,
	"nyn-a": 3,
	"nyn-b": 3,
	"nyn-c": 3,
	"nyn-d": 3,
} as const;

export type CookieKey = keyof typeof COOKIE_CAST;

export function cookieUrl(key: CookieKey): string {
	return `${COOKIE_DIR}/${key}.png`;
}

export function cookieRef(key: CookieKey): string {
	return `walk:row_anim:u:${COOKIE_DIR}/${key}.png`;
}

/** 1コマ160×240のストリップを拍にロックして回す設定。 */
export function cookieWalk(key: CookieKey, loopBeats = 4): MvWalkSetting {
	const frames = COOKIE_CAST[key];
	return {
		stdId: "row_anim",
		crop: [0, 0, 160 * frames, 240],
		frames,
		loopBeats,
		playMode: "loop",
	};
}

/** 夜の海辺（4コマ・256×192）。背景として全画面に敷く。 */
export const BEACH_NIGHT = {
	url: "/assets/mv/beach-night.png",
	frames: 4,
	w: 256,
	h: 192,
};

export function beachWalk(loopBeats = 8): MvWalkSetting {
	return {
		stdId: "row_anim",
		crop: [0, 0, BEACH_NIGHT.w * BEACH_NIGHT.frames, BEACH_NIGHT.h],
		frames: BEACH_NIGHT.frames,
		loopBeats,
		playMode: "loop",
	};
}

// ───────────────── MMLの組み立て ─────────────────

/**
 * 1トラックぶんのMMLを「1要素＝1小節」の断片から組み立てる。
 *
 * 参考動画級の長さ（64小節）を1本の文字列で書くと、どこかの小節が1拍足りなくても気づけない。
 * トラック間で小節数がずれると `totalBars` が中途半端になり、後半の画面が丸ごと空になる。
 * そこで小節を配列で持ち、本数を `expectBars` と突き合わせる。
 *
 * 断片を書くときの約束:
 *   - 断片は必ず「ちょうど1小節」にする（`l8` なら8音ぶん）
 *   - オクターブは断片の中で必ず元へ戻す（`>c<` の形にする）。持ち越すと繰り返しで音程がずれる
 */
export function mvTrack(
	header: string,
	bars: string[],
	expectBars: number,
): string {
	if (process.env.NODE_ENV !== "production" && bars.length !== expectBars) {
		console.error(
			`[mv-presets] "${header}" は ${expectBars} 小節のはずが ${bars.length} 小節あります`,
		);
	}
	return `${header} ${bars.join(" ")};`;
}

/** 同じ小節の並びを n 回くり返す。 */
export function rep(n: number, ...bars: string[]): string[] {
	const out: string[] = [];
	for (let i = 0; i < n; i++) out.push(...bars);
	return out;
}

/** n 小節ぶんの休み。 */
export function rest(n: number): string[] {
	return new Array(n).fill("r1");
}

// ───────────────── 場面 ─────────────────

/**
 * 8小節ごとに場面を切る定型。参考動画の場面転換はどれも 4/8/16小節の周期に乗っている
 * （C.mp4 は16秒＝8小節ごと、チョウチン少女は約6.8秒＝4小節ごとにモチーフが替わる）。
 */
export function sectionsEvery(
	startBar: number,
	everyBars: number,
	defs: { id: string; label: string; section?: Partial<MvSection> }[],
): MvSection[] {
	return defs.map((def, i) => ({
		id: def.id,
		label: def.label,
		startBar: startBar + everyBars * i,
		...def.section,
	}));
}

export function cloneManifest(m: MvManifest): MvManifest {
	return JSON.parse(JSON.stringify(m)) as MvManifest;
}
