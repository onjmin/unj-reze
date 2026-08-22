import localforage from "localforage";
import type { WalkPreset } from "./walk-cycle";

export interface SavedLayer {
	name: string;
	visible: boolean;
	locked: boolean;
	opacity?: number;
	dataUrl: string;
}

export interface SavedFrame {
	id?: number;
	layers: SavedLayer[];
}

export interface HistoryItem<T = unknown> {
	id: string;
	timestamp: number;
	data: T;
	previewUrl?: string; // used for drawings/dotdrawings
	previewText?: string; // used for MML/GameMaker/GamePlay
}

export interface DrawingEditorState {
	mode: "standard" | "anim" | "walk";
	width: number;
	height: number;
	gridW: number;
	gridH: number;
	zoom: number;
	layers?: SavedLayer[];
	frames?: SavedFrame[];
	currentFrame?: number;
	fps?: number;
	walkPreset?: WalkPreset;
	walkActiveIndex?: number;
	walkLayers?: [number, SavedLayer[]][];
}

/** キャンバス上の「生」レイヤー。oekaki の LayeredCanvas インスタンス、
 *  および復元後の frames/walkLayers 内のプレーンオブジェクトの両方が満たす形。 */
export interface LiveLayer {
	name: string;
	visible: boolean;
	locked: boolean;
	opacity: number;
	data: Uint8ClampedArray;
}

export interface LiveFrame {
	id?: number;
	layers: LiveLayer[];
}

const layerToDataUrl = (
	data: Uint8ClampedArray,
	w: number,
	h: number,
): string => {
	if (typeof document === "undefined") return "";
	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");
	if (ctx) {
		const imgData = ctx.createImageData(w, h);
		imgData.data.set(data);
		ctx.putImageData(imgData, 0, 0);
	}
	return canvas.toDataURL("image/png");
};

const dataUrlToLayerData = async (
	dataUrl: string,
	w: number,
	h: number,
): Promise<Uint8ClampedArray> => {
	return new Promise((resolve) => {
		if (typeof window === "undefined") {
			resolve(new Uint8ClampedArray(w * h * 4));
			return;
		}
		const img = new Image();
		img.src = dataUrl;
		img.onload = () => {
			const canvas = document.createElement("canvas");
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext("2d");
			if (ctx) {
				ctx.drawImage(img, 0, 0);
				resolve(ctx.getImageData(0, 0, w, h).data);
			} else {
				resolve(new Uint8ClampedArray(w * h * 4));
			}
		};
		img.onerror = () => {
			resolve(new Uint8ClampedArray(w * h * 4));
		};
	});
};

export const serializeLayers = (
	layers: LiveLayer[],
	w: number,
	h: number,
): SavedLayer[] => {
	return layers.map((l) => ({
		name: l.name,
		visible: l.visible,
		locked: l.locked,
		opacity: l.opacity ?? 100,
		dataUrl: layerToDataUrl(l.data, w, h),
	}));
};

export const deserializeLayers = async (
	savedLayers: SavedLayer[],
	w: number,
	h: number,
): Promise<LiveLayer[]> => {
	const promises = savedLayers.map(async (sl) => {
		const data = await dataUrlToLayerData(sl.dataUrl, w, h);
		return {
			name: sl.name,
			visible: sl.visible,
			locked: sl.locked,
			opacity: sl.opacity ?? 100,
			data,
		};
	});
	return Promise.all(promises);
};

export const serializeFrames = (
	frames: LiveFrame[],
	w: number,
	h: number,
): SavedFrame[] => {
	return frames.map((f) => ({
		id: f.id,
		layers: serializeLayers(f.layers, w, h),
	}));
};

export const deserializeFrames = async (
	savedFrames: SavedFrame[],
	w: number,
	h: number,
): Promise<LiveFrame[]> => {
	const promises = savedFrames.map(async (sf, i) => {
		const layers = await deserializeLayers(sf.layers, w, h);
		return {
			id: sf.id ?? i + 1,
			layers,
		};
	});
	return Promise.all(promises);
};

export const serializeWalkLayers = (
	walkLayers: Map<number, { layers: LiveLayer[] }>,
	w: number,
	h: number,
): [number, SavedLayer[]][] => {
	const entries: [number, SavedLayer[]][] = [];
	walkLayers.forEach((val, key) => {
		entries.push([key, serializeLayers(val.layers, w, h)]);
	});
	return entries;
};

export const deserializeWalkLayers = async (
	savedWalkLayers: [number, SavedLayer[]][],
	w: number,
	h: number,
): Promise<Map<number, { layers: LiveLayer[] }>> => {
	const map = new Map<number, { layers: LiveLayer[] }>();
	for (const [key, savedLayers] of savedWalkLayers) {
		const layers = await deserializeLayers(savedLayers, w, h);
		map.set(key, { layers });
	}
	return map;
};

export const isSimilarMml = (a: string, b: string): boolean => {
	if (a === b) return true;
	if (Math.abs(a.length - b.length) > 30) return false;

	const len1 = a.length;
	const len2 = b.length;
	if (len1 > 2000 || len2 > 2000) return false;

	const dp = Array(len2 + 1)
		.fill(0)
		.map((_, i) => i);
	for (let i = 1; i <= len1; i++) {
		let prev = i;
		for (let j = 1; j <= len2; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			const val = Math.min(dp[j] + 1, prev + 1, dp[j - 1] + cost);
			dp[j - 1] = prev;
			prev = val;
		}
		dp[len2] = prev;
	}
	return dp[len2] <= 15;
};

export const getStorageKey = (
	type: "mml" | "drawing" | "dotdrawing" | "gamemaker" | "gameplay" | "mv",
	idSuffix?: string,
): string => {
	switch (type) {
		case "mv":
			return `unj-mvmaker-history-${idSuffix || "new"}`;
		case "mml":
			return `dtm-work-history-${idSuffix || "new"}`;
		case "drawing":
			return "unj-drawing-history";
		case "dotdrawing":
			return "unj-dotdrawing-history";
		case "gamemaker":
			return `unj-gamemaker-history-${idSuffix || "new"}`;
		case "gameplay":
			return `unj-gameplay-history-${idSuffix || "unknown"}`;
	}
};

// --- 永続化バックエンド --------------------------------------------------
// localStorage(5〜10MB/オリジン)はPNG dataURLを積む用途にはすぐ枯渇するため、
// IndexedDB(桁違いに大きい・非同期)を localforage 経由で使う。
// 呼び出し側から見た関数シグネチャ(引数)は従来のlocalStorage版から変えず、
// 戻り値だけ非同期(Promise)化してある。
let _store: LocalForage | null = null;
const getStore = (): LocalForage | null => {
	if (typeof window === "undefined" || typeof indexedDB === "undefined") {
		return null;
	}
	if (!_store) {
		_store = localforage.createInstance({
			name: "unj-reze",
			storeName: "history",
		});
	}
	return _store;
};

const isQuotaExceededError = (e: unknown): boolean =>
	e instanceof DOMException &&
	(e.name === "QuotaExceededError" ||
		// Firefox の旧名
		e.name === "NS_ERROR_DOM_QUOTA_REACHED");

export const getHistory = async <T = unknown>(
	key: string,
): Promise<HistoryItem<T>[]> => {
	const store = getStore();
	if (!store) return [];
	try {
		return (await store.getItem<HistoryItem<T>[]>(key)) ?? [];
	} catch (e) {
		console.error("Failed to get history", e);
		return [];
	}
};

interface GameMakerPreviewData {
	name?: string;
	preset?: string;
}

interface GameplayPreviewData {
	progress?: { level?: number; hp?: number; maxHp?: number; gold?: number };
}

interface MvPreviewData {
	title?: string;
	preset?: string;
}

export type SaveHistoryResult =
	| "saved"
	| "duplicate"
	| "too_large"
	| "quota_exceeded"
	| "error";

export const saveHistory = async <T = unknown>(
	key: string,
	data: T,
	type: "mml" | "drawing" | "dotdrawing" | "gamemaker" | "gameplay" | "mv",
	maxItems = 50,
): Promise<SaveHistoryResult> => {
	const store = getStore();
	if (!store) return "error";
	try {
		const serializedData = JSON.stringify(data);
		if (serializedData.length > 1500000) {
			console.warn(
				"Skipping snapshot: data is excessively large",
				serializedData.length,
			);
			return "too_large";
		}

		const history = await getHistory<T>(key);
		const lastItem = history[0]?.data;

		// Check similarity/duplicates
		if (lastItem) {
			if (
				type === "mml" &&
				typeof data === "string" &&
				typeof lastItem === "string"
			) {
				if (isSimilarMml(data, lastItem)) {
					return "duplicate";
				}
			} else if (type === "drawing" || type === "dotdrawing") {
				if (serializedData === JSON.stringify(lastItem)) {
					return "duplicate";
				}
			} else {
				if (serializedData === JSON.stringify(lastItem)) {
					return "duplicate";
				}
			}
		}

		// Create preview
		let previewUrl: string | undefined;
		let previewText: string | undefined;

		if (type === "drawing" || type === "dotdrawing") {
			const drawingState = data as DrawingEditorState;
			if (drawingState.layers && drawingState.layers.length > 0) {
				previewUrl = drawingState.layers[0].dataUrl;
			} else if (
				drawingState.frames &&
				drawingState.frames.length > 0 &&
				drawingState.frames[0].layers.length > 0
			) {
				previewUrl = drawingState.frames[0].layers[0].dataUrl;
			} else if (
				drawingState.walkLayers &&
				drawingState.walkLayers.length > 0 &&
				drawingState.walkLayers[0][1].length > 0
			) {
				previewUrl = drawingState.walkLayers[0][1][0].dataUrl;
			}
		} else if (type === "mml") {
			const mml = data as string;
			previewText = mml.slice(0, 40) + (mml.length > 40 ? "..." : "");
		} else if (type === "gamemaker") {
			const gm = data as GameMakerPreviewData;
			previewText = `${gm.name || "無題"} (${gm.preset || "preset"})`;
		} else if (type === "gameplay") {
			const gp = data as GameplayPreviewData;
			previewText = `Lv.${gp.progress?.level || 1} HP:${gp.progress?.hp || 0}/${gp.progress?.maxHp || 0} G:${gp.progress?.gold || 0}`;
		} else if (type === "mv") {
			const mv = data as MvPreviewData;
			previewText = `${mv.title || "無題"} (${mv.preset || "preset"})`;
		}

		const newItem: HistoryItem<T> = {
			id: Math.random().toString(36).substring(2) + "-" + Date.now(),
			timestamp: Date.now(),
			data,
			previewUrl,
			previewText,
		};

		history.unshift(newItem);
		let sliced = history.slice(0, maxItems);
		try {
			await store.setItem(key, sliced);
			return "saved";
		} catch (e) {
			if (!isQuotaExceededError(e)) throw e;
			// 容量オーバー: 古いスナップショットを間引きながらリトライする。
			// 新規追加分(先頭)は残し、末尾から半分ずつ捨てる。
			while (sliced.length > 1) {
				sliced = sliced.slice(0, Math.ceil(sliced.length / 2));
				try {
					await store.setItem(key, sliced);
					return "saved";
				} catch (e2) {
					if (!isQuotaExceededError(e2)) throw e2;
				}
			}
			// 新規分1件だけでも容量が足りない
			console.error("Failed to save history: storage quota exceeded", e);
			return "quota_exceeded";
		}
	} catch (e) {
		console.error("Failed to save history", e);
		return "error";
	}
};

export const deleteHistoryItem = async (
	key: string,
	id: string,
): Promise<void> => {
	const store = getStore();
	if (!store) return;
	try {
		const history = await getHistory(key);
		const filtered = history.filter((item) => item.id !== id);
		await store.setItem(key, filtered);
	} catch (e) {
		console.error("Failed to delete history item", e);
	}
};

export const clearHistory = async (key: string): Promise<void> => {
	const store = getStore();
	if (!store) return;
	try {
		await store.removeItem(key);
	} catch (e) {
		console.error("Failed to clear history", e);
	}
};

export const saveAutosave = async <T = unknown>(
	key: string,
	data: T,
): Promise<void> => {
	const store = getStore();
	if (!store) return;
	try {
		const serializedData = JSON.stringify(data);
		if (serializedData.length > 1500000) {
			console.warn(
				"Skipping autosave: data is excessively large",
				serializedData.length,
			);
			return;
		}
		await store.setItem(key + "-autosave", {
			timestamp: Date.now(),
			data,
		});
	} catch (e) {
		console.error("Failed to save autosave", e);
	}
};

export const getAutosave = async <T = unknown>(
	key: string,
): Promise<{ timestamp: number; data: T } | null> => {
	const store = getStore();
	if (!store) return null;
	try {
		return (
			(await store.getItem<{ timestamp: number; data: T }>(
				key + "-autosave",
			)) ?? null
		);
	} catch (e) {
		console.error("Failed to get autosave", e);
		return null;
	}
};

export const clearAutosave = async (key: string): Promise<void> => {
	const store = getStore();
	if (!store) return;
	try {
		await store.removeItem(key + "-autosave");
	} catch (e) {
		console.error("Failed to clear autosave", e);
	}
};
