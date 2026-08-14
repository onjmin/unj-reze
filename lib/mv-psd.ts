// client-only: このモジュールは ag-psd（ブラウザの `document`/canvas を暗黙に使う）と
// `fetch`/`Image`/`HTMLCanvasElement` に依存する。SSR・route handler・ビルドスクリプトなど
// Node実行時からは絶対にimportしないこと。呼び出しは useEffect 等、マウント後のブラウザ実行時
// （`typeof window !== "undefined"` が真の場所）に限定する。
//
// キャラクターレイヤーの psd: 参照を解決する。psdファイルを事前にPNGへ書き出して
// public/assets へバンドルする運用はしない ―― ユーザーが指定したpsd URLをその場でfetchし、
// ag-psd でパースしてレイヤーをレイヤー名パス("!目/*開" のような "/" 区切り)で切り出す。
//
// ag-psd はブラウザ環境では `document` が存在するため initializeCanvas を呼ばなくても
// 自動的に `document.createElement('canvas')` を使う実装になっている
// (node_modules/ag-psd/dist/helpers.js)。Node側では絶対に評価されないよう、
// ag-psd自体もこのファイル内で動的importする。

import { buildPsdRef, isPsdRef, parsePsdRef } from "./asset-ref";

export { buildPsdRef, isPsdRef, parsePsdRef };

export interface PsdLayerInfo {
	path: string;
	width: number;
	height: number;
}

interface PsdLayerIndex {
	width: number;
	height: number;
	/** レイヤーパス("!目/*開")→ psd全体と同じ幅・高さに位置合わせ済みのcanvas。 */
	layers: Map<string, HTMLCanvasElement>;
}

function assertBrowser(): void {
	if (typeof window === "undefined" || typeof document === "undefined") {
		throw new Error("lib/mv-psd.ts はブラウザ実行時にのみ呼び出せます");
	}
}

// url → パース結果(レイヤーindex) のキャッシュ。同じURLは再パースしない。
const psdIndexCache = new Map<string, Promise<PsdLayerIndex>>();

// biome-disable-next-line -- ag-psd の型は any 寄りなので緩めに扱う
type AgPsdLayer = {
	name?: string;
	left?: number;
	top?: number;
	canvas?: HTMLCanvasElement;
	children?: AgPsdLayer[];
};

function collectLayers(
	nodes: AgPsdLayer[] | undefined,
	prefix: string,
	width: number,
	height: number,
	out: Map<string, HTMLCanvasElement>,
): void {
	for (const node of nodes ?? []) {
		const name = node.name ?? "";
		const path = prefix ? `${prefix}/${name}` : name;
		if (node.children && node.children.length > 0) {
			collectLayers(node.children, path, width, height, out);
			continue;
		}
		if (!node.canvas) continue;
		// 個々のレイヤーは left/top がズレているため、psd全体と同じ大きさのcanvasへ
		// オフセット込みで描き直しておく（土台と重ねる側で位置合わせを気にしなくて済む）。
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		if (!ctx) continue;
		ctx.drawImage(node.canvas, node.left ?? 0, node.top ?? 0);
		out.set(path, canvas);
	}
}

async function fetchAndParsePsd(url: string): Promise<PsdLayerIndex> {
	assertBrowser();
	const [{ readPsd }, res] = await Promise.all([
		import("ag-psd"),
		fetch(url),
	]);
	if (!res.ok) {
		throw new Error(`psdの取得に失敗しました (${res.status}): ${url}`);
	}
	const buffer = await res.arrayBuffer();
	const psd = readPsd(buffer, {
		skipCompositeImageData: true,
		skipThumbnail: true,
	});
	const width = psd.width ?? 0;
	const height = psd.height ?? 0;
	const layers = new Map<string, HTMLCanvasElement>();
	collectLayers(psd.children as AgPsdLayer[] | undefined, "", width, height, layers);
	return { width, height, layers };
}

/** psd URLをfetch→パース。結果はURL単位でキャッシュする（同じURLの再パースはしない）。 */
export function parsePsdFromUrl(url: string): Promise<PsdLayerIndex> {
	assertBrowser();
	let p = psdIndexCache.get(url);
	if (!p) {
		p = fetchAndParsePsd(url).catch((err) => {
			psdIndexCache.delete(url);
			throw err;
		});
		psdIndexCache.set(url, p);
	}
	return p;
}

/** UIのレイヤー選択に使う一覧。 */
export async function listPsdLayerPaths(url: string): Promise<PsdLayerInfo[]> {
	const idx = await parsePsdFromUrl(url);
	return [...idx.layers.entries()].map(([path, canvas]) => ({
		path,
		width: canvas.width,
		height: canvas.height,
	}));
}

/** 個別レイヤー1枚を(位置合わせ済みcanvasとして)返す。存在しなければ null。 */
export async function resolvePsdLayerImage(
	url: string,
	path: string,
): Promise<HTMLCanvasElement | null> {
	const idx = await parsePsdFromUrl(url);
	return idx.layers.get(path) ?? null;
}

/**
 * 指定したレイヤーパス群を、渡した順に重ね合成した1枚を返す。
 * 例: 色塗り+線画を合成してbase画像を作る、目開/口開のような単一レイヤーもこの関数で1枚返せる。
 */
export async function resolvePsdBaseImage(
	url: string,
	layerPaths: string[],
): Promise<HTMLCanvasElement | null> {
	const idx = await parsePsdFromUrl(url);
	if (idx.width === 0 || idx.height === 0) return null;
	const canvas = document.createElement("canvas");
	canvas.width = idx.width;
	canvas.height = idx.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	let drew = false;
	for (const path of layerPaths) {
		const layer = idx.layers.get(path);
		if (!layer) continue;
		ctx.drawImage(layer, 0, 0);
		drew = true;
	}
	return drew ? canvas : null;
}

// ───────────────── 描画ループ用の同期peekキャッシュ ─────────────────
// lib/walk-sprite.ts の loadImage/peekImage と同じ形にしてある: 事前に preloadPsdRef で
// 非同期に解決しておき、描画時は同期の peekPsdImage だけを呼ぶ。

const resolvedCache = new Map<string, HTMLCanvasElement>();
const resolvingCache = new Map<string, Promise<void>>();

/** `psd:` 参照(ref文字列そのもの)を事前解決してキャッシュする。psd参照でなければ何もしない。 */
export function preloadPsdRef(ref: string): Promise<void> {
	const parsed = parsePsdRef(ref);
	if (!parsed || parsed.paths.length === 0) return Promise.resolve();
	if (resolvedCache.has(ref)) return Promise.resolve();
	let p = resolvingCache.get(ref);
	if (!p) {
		p = resolvePsdBaseImage(parsed.url, parsed.paths)
			.then((canvas) => {
				if (canvas) resolvedCache.set(ref, canvas);
			})
			.finally(() => {
				resolvingCache.delete(ref);
			});
		resolvingCache.set(ref, p);
	}
	return p;
}

/** 事前解決済みの合成canvasを同期で取得（未解決/失敗なら undefined）。 */
export function peekPsdImage(ref: string): HTMLCanvasElement | undefined {
	return resolvedCache.get(ref);
}
