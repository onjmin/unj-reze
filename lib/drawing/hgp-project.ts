import JSZip from "jszip";
import {
	customWalkPresetLabel,
	presets as walkPresets,
	type Way,
	type WalkPreset,
	way,
} from "@/lib/assets/walk-cycle";
import type {
	DrawingEditorState,
	SavedFrame,
	SavedLayer,
} from "@/lib/ui/history";

/**
 * HGペイント（rpgen-walk）のプロジェクトファイル（.hgp）
 *
 * 中身はZIPで、以下を含む
 * - project.json : キャンバス設定・コマごとのレイヤー情報
 * - layers/{コマ番号}/{重ね順}.png : 各レイヤーの絵（1ドット=1px の等倍、0 が一番下）
 * - sheet.png : 全コマを合成した歩行グラ（確認用。読み込みには使わない）
 *
 * 歩行グラ（方向×コマ）が基本の形。アニメ（1方向×コマ）と1枚絵（1方向×1コマ）も同じ形で表す。
 * HGペイントと行き来できるよう、こちら独自の情報は mode にだけ入れる（HGペイントは読み飛ばす）
 */
export const HGP_FORMAT = "hg-paint-project";
export const HGP_VERSION = 1;
export const HGP_EXTENSION = ".hgp";

type HgpLayer = {
	name: string;
	file: string;
	visible?: boolean;
	opacity?: number;
	locked?: boolean;
	alphaLocked?: boolean;
};

type HgpProject = {
	format: typeof HGP_FORMAT;
	version: number;
	width: number;
	height: number;
	frames: number;
	ways: string;
	fps?: number;
	preview?: number;
	/** こちら独自。無ければ方向数・コマ数から決める */
	mode?: DrawingEditorState["mode"];
	chips: { index: number; layers: HgpLayer[] }[];
};

const loadImage = (src: string) =>
	new Promise<HTMLImageElement>((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("画像を読み込めません"));
		img.src = src;
	});

const toBlob = (canvas: HTMLCanvasElement) =>
	new Promise<Blob>((resolve, reject) =>
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))),
			"image/png",
		),
	);

const newCanvas = (w: number, h: number) => {
	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Failed to get 2D rendering context");
	ctx.imageSmoothingEnabled = false;
	return { canvas, ctx };
};

/** キャンバスの大きさとドットの大きさ（DotDrawingEditor の初期化と同じ計算） */
const canvasGeometry = (
	mode: DrawingEditorState["mode"],
	w: number,
	h: number,
	canvasSize: number,
) => {
	const width = mode === "walk" ? Math.floor(canvasSize * (w / h)) : canvasSize;
	const height = canvasSize;
	// oekaki.setDotSize(1, h) と同じ
	const dotSize = Math.floor(canvasSize / h);
	return { width, height, dotSize };
};

const presetToWays = (preset: WalkPreset) =>
	preset.ways.map((v) => v.key).join("");

const waysToPresetWays = (str: string): Way[] =>
	str
		.split("")
		.map((v) =>
			v in way ? way[v as keyof typeof way] : { key: v, label: "" },
		);

/** 規格に一致すれば既存の規格、しなければカスタムの規格（ラベルに方向の並びを入れる）を返す */
const findPreset = (
	w: number,
	h: number,
	frames: number,
	ways: string,
): WalkPreset =>
	walkPresets.find(
		(p) =>
			p.w === w && p.h === h && p.frames === frames && presetToWays(p) === ways,
	) ?? {
		label: customWalkPresetLabel(waysToPresetWays(ways)),
		w,
		h,
		frames,
		ways: waysToPresetWays(ways),
	};

/**
 * 今の状態を .hgp にする
 *
 * @param dotSize oekaki.getDotSize()
 */
export const exportHgp = async (
	state: DrawingEditorState,
	dotSize: number,
	fps: number,
): Promise<Blob> => {
	const walk = state.mode === "walk" ? state.walkPreset : undefined;
	const w = walk ? walk.w : state.gridW;
	const h = walk ? walk.h : state.gridH;

	// コマ番号 → レイヤー
	const chips = new Map<number, SavedLayer[]>();
	let frames = 1;
	let ways = "s";
	if (walk) {
		frames = walk.frames;
		ways = presetToWays(walk);
		for (const [i, layers] of state.walkLayers ?? []) chips.set(i, layers);
	} else if (state.mode === "anim") {
		const list: SavedFrame[] = state.frames ?? [];
		frames = Math.max(1, list.length);
		list.forEach((f, i) => chips.set(i, f.layers));
	} else {
		chips.set(0, state.layers ?? []);
	}

	const zip = new JSZip();
	const sheet = newCanvas(w * frames, h * ways.length);
	const project: HgpProject = {
		format: HGP_FORMAT,
		version: HGP_VERSION,
		width: w,
		height: h,
		frames,
		ways,
		fps,
		mode: state.mode,
		chips: [],
	};
	for (const [index, layers] of [...chips].sort((a, b) => a[0] - b[0])) {
		const chip: HgpProject["chips"][number] = { index, layers: [] };
		// SavedLayer も HGペイントと同じく 0 が一番下
		const composed = newCanvas(w, h);
		for (const [order, layer] of layers.entries()) {
			const small = newCanvas(w, h);
			if (layer.dataUrl) {
				const img = await loadImage(layer.dataUrl);
				small.ctx.drawImage(img, 0, 0, w * dotSize, h * dotSize, 0, 0, w, h);
			}
			const file = `layers/${index}/${order}.png`;
			zip.file(file, await toBlob(small.canvas));
			const opacity = layer.opacity ?? 100;
			chip.layers.push({
				name: layer.name,
				file,
				visible: layer.visible,
				opacity,
				locked: layer.locked,
			});
			if (layer.visible) {
				composed.ctx.globalAlpha = opacity / 100;
				composed.ctx.drawImage(small.canvas, 0, 0);
			}
		}
		project.chips.push(chip);
		const x = index % frames;
		const y = Math.floor(index / frames);
		sheet.ctx.drawImage(composed.canvas, x * w, y * h);
	}
	zip.file("sheet.png", await toBlob(sheet.canvas));
	zip.file("project.json", JSON.stringify(project, null, "\t"));
	return zip.generateAsync({ type: "blob" });
};

const isInt = (v: unknown, min: number, max: number): v is number =>
	typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/**
 * .hgp を読んで、エディタの復元用の状態にする
 *
 * @param canvasSize DotDrawingEditor のキャンバスの一辺
 * @returns 状態と再生fps（fps はファイルに無ければ undefined）
 */
export const importHgp = async (
	file: Blob,
	canvasSize: number,
): Promise<{ state: DrawingEditorState; fps?: number }> => {
	const zip = await JSZip.loadAsync(file);
	const json = await zip.file("project.json")?.async("string");
	if (!json) throw new Error("project.json がありません");
	const p = JSON.parse(json) as Partial<HgpProject>;
	if (p.format !== HGP_FORMAT)
		throw new Error("HGペイントのファイルではありません");
	if (!isInt(p.version, 1, HGP_VERSION))
		throw new Error("新しすぎる形式のファイルです");
	if (!isInt(p.width, 1, 256) || !isInt(p.height, 1, 256))
		throw new Error("大きさが不正です");
	if (!isInt(p.frames, 1, 256)) throw new Error("コマ数が不正です");
	if (typeof p.ways !== "string" || !/^[a-z]+$/.test(p.ways))
		throw new Error("方向が不正です");
	if (!Array.isArray(p.chips)) throw new Error("レイヤー情報がありません");
	const { width: w, height: h, frames, ways } = p;

	const mode: DrawingEditorState["mode"] =
		p.mode === "walk" || p.mode === "anim" || p.mode === "standard"
			? p.mode
			: ways.length > 1
				? "walk"
				: frames > 1
					? "anim"
					: "standard";
	const geo = canvasGeometry(mode, w, h, canvasSize);

	// 等倍の絵 → キャンバスの大きさのレイヤー
	const readChip = async (index: number): Promise<SavedLayer[]> => {
		const chip = p.chips?.find((c) => c.index === index);
		const layers: SavedLayer[] = [];
		for (const meta of chip?.layers ?? []) {
			const blob = await zip.file(meta.file)?.async("blob");
			if (!blob) throw new Error(`${meta.file} がありません`);
			const bitmap = await createImageBitmap(blob);
			const big = newCanvas(geo.width, geo.height);
			big.ctx.drawImage(
				bitmap,
				0,
				0,
				w,
				h,
				0,
				0,
				w * geo.dotSize,
				h * geo.dotSize,
			);
			layers.push({
				name: meta.name,
				visible: meta.visible ?? true,
				locked: meta.locked ?? false,
				opacity: meta.opacity ?? 100,
				dataUrl: big.canvas.toDataURL("image/png"),
			});
		}
		return layers;
	};

	const fps =
		typeof p.fps === "number" && p.fps > 0 && p.fps <= 120 ? p.fps : undefined;
	const base = {
		mode,
		width: geo.width,
		height: geo.height,
		gridW: w,
		gridH: h,
		zoom: 1,
	};
	if (mode === "walk") {
		const preset = findPreset(w, h, frames, ways);
		const walkLayers: [number, SavedLayer[]][] = [];
		for (let i = 0; i < frames * ways.length; i++) {
			const layers = await readChip(i);
			if (layers.length) walkLayers.push([i, layers]);
		}
		return {
			state: { ...base, walkPreset: preset, walkActiveIndex: 0, walkLayers },
			fps,
		};
	}
	if (mode === "anim") {
		const count = frames * ways.length;
		const list: SavedFrame[] = [];
		for (let i = 0; i < count; i++)
			list.push({ id: i + 1, layers: await readChip(i) });
		return {
			state: { ...base, frames: list, currentFrame: 0, fps: fps ?? 8 },
			fps,
		};
	}
	return { state: { ...base, layers: await readChip(0) }, fps };
};
