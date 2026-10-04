import * as oekaki from "@onjmin/oekaki";

/**
 * 操作の一括適用（歩行グラの同じ方向・同じ番目のコマ、アニメの全フレーム）
 *
 * 編集中のレイヤーへの操作を、一括適用先のコマの「同じ重ね順のレイヤー」にも反映する。
 * 書き込み先が足りなければ一番上のレイヤー、レイヤーが無いコマには新しく作る。
 *
 * - ペン・消しゴム・塗りつぶし・全消し・1px移動 … 結果の画素（差分）を写す
 * - 範囲選択・移動・拡縮・回転・削除・貼り付け … 操作を記録し、選択が終わった時に再生する
 *   （選択範囲はライブラリ全体で1つしか持てないため、選択中に再生すると今の選択が壊れる）
 * - レイヤーの追加・表示切替・不透明度・並び替え
 * - Undo/Redo … 写した先も、写す前の画素に戻す
 *
 * コマの持ち方（歩行グラは画素データ、アニメはレイヤーそのもの）はエディタ側が SyncHost で吸収する
 */
export interface SyncHost {
	/** 一括適用先のコマ番号（編集中のコマは含まない） */
	targets(): number[];
	/**
	 * コマのレイヤー（下から順）を oekaki に載せて fn を呼ぶ。
	 * 終わったら oekaki を編集中のコマに戻し、コマを保存してサムネイルも更新する
	 *
	 * @param create レイヤーが無いコマに空のレイヤーを1枚作るか（作らないなら fn を呼ばない）
	 */
	withCell(
		cell: number,
		fn: (layers: oekaki.LayeredCanvas[]) => void,
		create: boolean,
	): void;
}

let host: SyncHost | null = null;
export const setSyncHost = (next: SyncHost | null) => {
	host = next;
};

const orderOf = (layer: oekaki.LayeredCanvas) =>
	Math.max(0, oekaki.getLayers().indexOf(layer));

// ───────────────────────────────────────────────────────
// Undo/Redo の連動
// ───────────────────────────────────────────────────────
// 各レイヤーの履歴（trace()の回数とUndo/Redoの位置）を写し取り、
// 写した先の変化（変わった画素の前後）を、元のレイヤーの履歴に紐づけておく。
// 元のレイヤーでUndo/Redoすると、写した先も前後の画素に戻す。
// 歩行グラのコマは開き直すとレイヤーが作り直されるので、レイヤーではなく「コマ番号＋重ね順」で覚える

type Change = {
	cell: number;
	order: number;
	/** 変わった画素の位置（RGBA の先頭） */
	index: Uint32Array;
	before: Uint32Array;
	after: Uint32Array;
};
type History = { entries: Change[][]; pos: number };
const histories = new WeakMap<oekaki.LayeredCanvas, History>();
const historyOf = (layer: oekaki.LayeredCanvas) => {
	let h = histories.get(layer);
	if (!h) {
		h = { entries: [], pos: 0 };
		histories.set(layer, h);
	}
	return h;
};

const pack = (data: Uint8ClampedArray, i: number) =>
	((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>>
	0;
const unpack = (data: Uint8ClampedArray, i: number, v: number) => {
	data[i] = v >>> 24;
	data[i + 1] = (v >>> 16) & 255;
	data[i + 2] = (v >>> 8) & 255;
	data[i + 3] = v & 255;
};

/** 2つの画素データの差分。変わっていなければ null */
const diff = (
	cell: number,
	order: number,
	before: Uint8ClampedArray,
	after: Uint8ClampedArray,
): Change | null => {
	const index: number[] = [];
	for (let i = 0; i < after.length; i += 4) {
		if (
			before[i] !== after[i] ||
			before[i + 1] !== after[i + 1] ||
			before[i + 2] !== after[i + 2] ||
			before[i + 3] !== after[i + 3]
		)
			index.push(i);
	}
	if (!index.length) return null;
	return {
		cell,
		order,
		index: Uint32Array.from(index),
		before: Uint32Array.from(index, (i) => pack(before, i)),
		after: Uint32Array.from(index, (i) => pack(after, i)),
	};
};

/** 元のレイヤーの最新の履歴に、写した先の変化を紐づける */
const linkHistory = (from: oekaki.LayeredCanvas, change: Change) => {
	const h = historyOf(from);
	h.entries[h.pos - 1]?.push(change);
};

let following = false;
const follow = (changes: Change[], method: "undo" | "redo") => {
	if (following || !changes.length || !host) return;
	following = true;
	try {
		for (const c of changes) {
			host.withCell(
				c.cell,
				(layers) => {
					const layer = layers[c.order];
					if (!layer) return;
					const data = layer.data;
					const values = method === "undo" ? c.before : c.after;
					c.index.forEach((i, k) => unpack(data, i, values[k]));
					layer.data = data;
				},
				false,
			);
		}
	} finally {
		following = false;
	}
};

const proto = oekaki.LayeredCanvas.prototype as unknown as Record<
	string,
	(this: oekaki.LayeredCanvas, ...args: unknown[]) => unknown
>;
// 開発中の再読み込みで二重に包まないように
const PATCHED = Symbol.for("unj-reze.sync-edit.patched");
const patched = (proto as unknown as Record<symbol, boolean>)[PATCHED];
if (!patched) {
	(proto as unknown as Record<symbol, boolean>)[PATCHED] = true;
	const { trace, undo, redo } = proto;
	proto.trace = function () {
		trace.call(this);
		const h = historyOf(this);
		h.entries.length = h.pos;
		h.entries.push([]);
		h.pos++;
	};
	proto.undo = function () {
		const h = historyOf(this);
		const movable = this.editable && h.pos > 1;
		undo.call(this);
		if (!movable) return;
		h.pos--;
		follow(h.entries[h.pos], "undo");
	};
	proto.redo = function () {
		const h = historyOf(this);
		const movable = this.editable && h.pos < h.entries.length;
		redo.call(this);
		if (!movable) return;
		follow(h.entries[h.pos], "redo");
		h.pos++;
	};
}

/**
 * 一括適用先の同じ重ね順のレイヤーで fn を呼び、変わった分を履歴に紐づける
 */
const applyToTargets = (
	layer: oekaki.LayeredCanvas,
	fn: (target: oekaki.LayeredCanvas) => void,
	options: { create: boolean; exact?: boolean } = { create: true },
) => {
	if (!host) return;
	const targets = host.targets();
	if (!targets.length) return;
	const order = orderOf(layer);
	for (const cell of targets) {
		host.withCell(
			cell,
			(layers) => {
				if (options.exact && order >= layers.length) return;
				const targetOrder = Math.min(order, layers.length - 1);
				const target = layers[targetOrder];
				if (!target) return;
				const before = target.data.slice();
				fn(target);
				const change = diff(cell, targetOrder, before, target.data);
				if (!change) return;
				target.trace();
				target.used = true;
				linkHistory(layer, change);
			},
			options.create,
		);
	}
};

// ───────────────────────────────────────────────────────
// 画素の差分
// ───────────────────────────────────────────────────────

/** 直前に確定した時点の画素（差分を取るための基準） */
let base: { layer: oekaki.LayeredCanvas; data: Uint8ClampedArray } | null =
	null;

/**
 * 差分の基準を今の画素で取り直す
 *
 * ひと筆の始め（ドラッグ開始）や、全消しの直前に呼ぶ
 */
export const resetSyncBase = (layer: oekaki.LayeredCanvas | undefined) => {
	base = layer ? { layer, data: layer.data.slice() } : null;
};

/** 基準から変わった画素を、一括適用先にも書き込む */
export const syncEdit = (layer: oekaki.LayeredCanvas | undefined) => {
	if (!layer || !base || base.layer !== layer) {
		resetSyncBase(layer);
		return;
	}
	const before = base.data;
	const after = layer.data;
	resetSyncBase(layer);
	const change = diff(-1, 0, before, after);
	if (!change) return;
	applyToTargets(layer, (target) => {
		const data = target.data;
		change.index.forEach((i, k) => unpack(data, i, change.after[k]));
		target.data = data;
	});
};

/**
 * 一括適用先の同じ重ね順のレイヤーにも同じ処理をする（1px移動など、画素の位置が変わる操作）
 */
export const syncApply = (
	layer: oekaki.LayeredCanvas | undefined,
	fn: (target: oekaki.LayeredCanvas) => void,
) => {
	if (!layer) return;
	applyToTargets(layer, fn, { create: false });
	resetSyncBase(layer);
};

// ───────────────────────────────────────────────────────
// レイヤーの追加・表示切替・不透明度・並び替え
// ───────────────────────────────────────────────────────

/** 一括適用先のコマにも同じ名前のレイヤーを一番上に追加する */
export const syncAddLayer = (name: string) => {
	if (!host) return;
	for (const cell of host.targets()) {
		host.withCell(cell, () => new oekaki.LayeredCanvas(name), true);
	}
};

/** 一括適用先の同じ重ね順のレイヤーにも、表示・非表示や不透明度を反映する */
export const syncLayerProps = (
	layer: oekaki.LayeredCanvas | undefined,
	props: { visible?: boolean; opacity?: number },
) => {
	if (!layer || !host) return;
	const order = orderOf(layer);
	for (const cell of host.targets()) {
		host.withCell(
			cell,
			(layers) => {
				const target = layers[Math.min(order, layers.length - 1)];
				if (!target) return;
				if (props.visible !== undefined) target.visible = props.visible;
				if (props.opacity !== undefined) target.opacity = props.opacity;
			},
			false,
		);
	}
};

/**
 * 一括適用先でも、重ね順 from のレイヤーを to へ動かす（どちらも 0 が一番下）
 *
 * そのコマに from のレイヤーが無ければ何もしない
 */
export const syncReorderLayer = (from: number, to: number) => {
	if (!host || from === to) return;
	for (const cell of host.targets()) {
		host.withCell(
			cell,
			(layers) => {
				if (from >= layers.length) return;
				const next = [...layers];
				const [moved] = next.splice(from, 1);
				next.splice(Math.min(to, next.length), 0, moved);
				oekaki.setLayers(next);
			},
			false,
		);
	}
};

// ───────────────────────────────────────────────────────
// 範囲選択・移動の連動
// ───────────────────────────────────────────────────────
// 操作そのものを記録しておき、選択が終わった時（解除・新しい選択・コマ切り替え等）に
// 一括適用先のレイヤーで再生する。
// ドット単位の移動・回転は累積値を持つので、ライブラリが累積を戻すタイミング（ドラッグ開始）を
// "reset"として記録し、再生時も同じ所で戻す。そうすれば全く同じ結果になる

type Op = { method: string; args: unknown[] } | "reset";
type Session = { layer: oekaki.LayeredCanvas; ops: Op[] };
let session: Session | null = null;
let replaying = false;
let depth = 0;

/** 新しい選択を始めるメソッド（前の選択は解除される） */
const STARTERS = new Set([
	"select",
	"selectByDot",
	"selectFreehand",
	"selectFreehandByDot",
	"paste",
]);
/** 絵を変えるメソッド（これを含まない記録は再生しても何も変わらない） */
const MUTATORS = new Set([
	"paste",
	"moveSelection",
	"moveSelectionByDot",
	"resizeSelection",
	"resizeSelectionByDot",
	"rotateSelection",
	"rotateSelectionByDot",
	"deleteSelection",
]);

/** ドット単位の移動・回転の累積値を戻す（setDotSize() が中で resetTranslation() を呼ぶ） */
const resetAccumulation = () => {
	const size = oekaki.getDotSize();
	if (!size) return;
	// 同じドットの大きさになる引数で呼び直す
	oekaki.setDotSize(1, 1, size);
};

if (!patched) {
	for (const method of [...STARTERS, ...MUTATORS, "deselect"]) {
		const original = proto[method];
		proto[method] = function (...args: unknown[]) {
			// 再生中や、メソッドの中から呼ばれた分（selectByDot→select等）は記録しない
			if (replaying || depth > 0) {
				depth++;
				try {
					return original.apply(this, args);
				} finally {
					depth--;
				}
			}
			if (STARTERS.has(method) || session?.layer !== this) flushSelectionSync();
			if (!session && method !== "deselect") session = { layer: this, ops: [] };
			session?.ops.push({ method, args });
			depth++;
			try {
				return original.apply(this, args);
			} finally {
				depth--;
				if (method === "deselect") flushSelectionSync();
			}
		};
	}
}

/** ドラッグ開始（ライブラリが累積値を戻す時）を記録する */
export const markDragStart = () => {
	session?.ops.push("reset");
};

/** 絵を変える操作（移動・貼り付けなど）を記録したまま、まだ再生していないか */
export const hasPendingSelectionMove = () =>
	!!session?.ops.some((op) => op !== "reset" && MUTATORS.has(op.method));

/**
 * 記録した操作を一括適用先のレイヤーで再生し、記録を終える
 *
 * 再生すると選択範囲は解除される（ライブラリ全体で1つしか持てないため）
 */
export const flushSelectionSync = () => {
	const s = session;
	session = null;
	if (!s || replaying) return;
	if (!s.ops.some((op) => op !== "reset" && MUTATORS.has(op.method))) return;
	replaying = true;
	try {
		applyToTargets(
			s.layer,
			(target) => {
				resetAccumulation();
				for (const op of s.ops) {
					if (op === "reset") resetAccumulation();
					else proto[op.method].apply(target, op.args);
				}
				target.deselect();
			},
			{ create: false },
		);
	} finally {
		resetAccumulation();
		replaying = false;
	}
};
