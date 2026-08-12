import {
	mvUid,
	type MvBlend,
	type MvLayer,
	type MvLayerGroup,
	type MvManifest,
} from "./mv-config";

/**
 * レイヤーの入れ子グループを操作するヘルパ一式。
 *
 * `manifest.layers` は今までどおりフラットな配列のまま——グループは実体を持つ
 * "kind:'group'" レイヤーではなく、同じ `groupId` を持つレイヤーの集まりとして表現する
 * （エンジンの描画ループを一切変えずに済む）。ただし「同じグループのレイヤーは配列中で
 * 必ず連続している」という不変条件があり、これを崩すと一覧でグループの一部だけ
 * 離れた場所に取り残されて見える壊れ方をする。**グループに関わる配列の並び替えは
 * すべてこのファイルの関数を通すこと**（直接 `manifest.layers` をいじらない）。
 */

/** 配列中の連続した塊（グループ、または groupId を持たない単独レイヤー1枚）。 */
interface LayerUnit {
	groupId: string | null;
	start: number;
	/** 排他的（この添字は含まない）。 */
	end: number;
}

/** レイヤー配列を「グループの塊」と「単独レイヤー」の並びへ分解する。 */
function computeUnits(layers: MvLayer[]): LayerUnit[] {
	const units: LayerUnit[] = [];
	let i = 0;
	while (i < layers.length) {
		const gid = layers[i].groupId ?? null;
		if (gid === null) {
			units.push({ groupId: null, start: i, end: i + 1 });
			i++;
			continue;
		}
		let j = i + 1;
		while (j < layers.length && (layers[j].groupId ?? null) === gid) j++;
		units.push({ groupId: gid, start: i, end: j });
		i = j;
	}
	return units;
}

/**
 * 選んだレイヤー(2枚以上)を1つのグループにまとめる。
 * 元の並び順は保ったまま、先頭に選ばれていたレイヤーの位置へ集約する
 * （バラバラの位置にあった選択レイヤーを一箇所に寄せ集める）。
 */
export function groupSelectedLayers(
	manifest: MvManifest,
	layerIds: string[],
	name?: string,
): MvManifest {
	const idSet = new Set(layerIds);
	if (idSet.size < 2) return manifest;
	const layers = manifest.layers;
	const selected = layers.filter((l) => idSet.has(l.id));
	if (selected.length < 2) return manifest;
	// 既にグループへ属しているレイヤーが混ざっていたら、先にそのグループから外しておく
	// （グループのグループ化はできない——1段だけのフラットなグループ構造にしてある）。
	const groupId = mvUid("grp");
	const insertAt = layers.findIndex((l) => idSet.has(l.id));
	const rest = layers.filter((l) => !idSet.has(l.id));
	const grouped = selected.map((l) => ({ ...l, groupId }));
	const restInsertIdx = rest.findIndex(
		(l) => layers.indexOf(l) >= insertAt,
	);
	const at = restInsertIdx < 0 ? rest.length : restInsertIdx;
	const nextLayers = [...rest.slice(0, at), ...grouped, ...rest.slice(at)];
	// 作った直後は畳んでおく。展開したままだと一覧がグループの枚数分だけ一気に伸びて煩雑になる。
	const group: MvLayerGroup = {
		id: groupId,
		name: name ?? "グループ",
		collapsed: true,
	};
	return {
		...manifest,
		layers: nextLayers,
		groups: [...(manifest.groups ?? []), group],
	};
}

/** グループを解除する（レイヤーは今の位置に残る。中身は消えない）。 */
export function ungroupLayers(manifest: MvManifest, groupId: string): MvManifest {
	return {
		...manifest,
		layers: manifest.layers.map((l) =>
			l.groupId === groupId ? { ...l, groupId: undefined } : l,
		),
		groups: (manifest.groups ?? []).filter((g) => g.id !== groupId),
	};
}

/** グループとその中身のレイヤーをまとめて削除する。 */
export function deleteGroup(manifest: MvManifest, groupId: string): MvManifest {
	return {
		...manifest,
		layers: manifest.layers.filter((l) => l.groupId !== groupId),
		groups: (manifest.groups ?? []).filter((g) => g.id !== groupId),
	};
}

export function renameGroup(
	manifest: MvManifest,
	groupId: string,
	name: string,
): MvManifest {
	return {
		...manifest,
		groups: (manifest.groups ?? []).map((g) =>
			g.id === groupId ? { ...g, name } : g,
		),
	};
}

export function toggleGroupCollapsed(
	manifest: MvManifest,
	groupId: string,
): MvManifest {
	return {
		...manifest,
		groups: (manifest.groups ?? []).map((g) =>
			g.id === groupId ? { ...g, collapsed: !g.collapsed } : g,
		),
	};
}

/**
 * 塊(unit)を隣の塊と入れ替える共通処理。
 * 各レイヤーの `z` はレイヤーオブジェクトごと一緒に移動するので変わらない
 * （＝これは一覧の並び順という「編集のしやすさ」のための操作で、画面上の重なり順は
 * 各レイヤーの `z` が引き続き決める。重なり順ごと動かしたいときは `z` 側を編集する）。
 */
function swapAdjacentUnits(
	manifest: MvManifest,
	units: LayerUnit[],
	idx: number,
	direction: "up" | "down",
): MvManifest {
	const adjIdx = direction === "up" ? idx - 1 : idx + 1;
	if (adjIdx < 0 || adjIdx >= units.length) return manifest;
	const layers = manifest.layers;
	const a = units[idx];
	const b = units[adjIdx];
	const [lo, hi] = direction === "up" ? [b, a] : [a, b];
	const nextLayers = [
		...layers.slice(0, lo.start),
		...layers.slice(hi.start, hi.end),
		...layers.slice(lo.start, lo.end),
		...layers.slice(hi.end),
	];
	return { ...manifest, layers: nextLayers };
}

/** グループ全体を1つの塊として隣の塊（別のグループ、または単独レイヤー）と入れ替える。 */
export function moveGroupBlock(
	manifest: MvManifest,
	groupId: string,
	direction: "up" | "down",
): MvManifest {
	const units = computeUnits(manifest.layers);
	const idx = units.findIndex((u) => u.groupId === groupId);
	if (idx < 0) return manifest;
	return swapAdjacentUnits(manifest, units, idx, direction);
}

/**
 * グループに属さない単独レイヤーを、隣の塊（別の単独レイヤー、または隣接するグループ
 * まるごと）と入れ替える。グループの境界をまたいでレイヤー1枚だけが群れの中に
 * 迷い込むと「同じgroupIdは配列中で連続している」という不変条件が壊れるので、
 * 単独レイヤーの上下移動も必ずこの塊単位のスワップを通すこと
 * （かつてここを配列の隣接要素どうしの単純入れ替えにしていたため、
 * グループの隣にある単独レイヤーを動かすとグループの一部が引きちぎられていた）。
 *
 * 隣が単独レイヤー1枚どうしのときだけは `z` も一緒に入れ替える。グループ機能が入る前から
 * 「一覧の上下ボタン＝画面の重なり順も変わる」という挙動だったため（多くのレイヤーは
 * `z` を明示せず並び順に頼っている）、ここを崩すと矢印を押しても絵の重なりが変わらなく
 * なって見える回帰になる。相手がグループ（複数枚）のときは1:1で交換できる`z`が無いので
 * 並び順だけ動かす（重なりを変えたいときは各レイヤーの`z`を直接編集してもらう）。
 */
export function moveTopLevelLayer(
	manifest: MvManifest,
	layerId: string,
	direction: "up" | "down",
): MvManifest {
	const layers = manifest.layers;
	const idx = layers.findIndex((l) => l.id === layerId);
	if (idx < 0 || layers[idx].groupId) return manifest;
	const units = computeUnits(layers);
	const unitIdx = units.findIndex((u) => u.start === idx && u.groupId === null);
	if (unitIdx < 0) return manifest;

	const adjIdx = direction === "up" ? unitIdx - 1 : unitIdx + 1;
	const adjUnit = units[adjIdx];
	if (adjUnit && adjUnit.groupId === null) {
		// 単独どうし：zを入れ替えてから位置も入れ替える（従来どおりの挙動）。
		// 同じzのまま位置だけ入れ替えても見た目の重なりが変わらないので、
		// その場合だけ並び順から作った値へ割り当て直す（tie-break）。
		const otherIdx = adjUnit.start;
		const nextLayers = layers.map((l, i) => ({
			...l,
			z: l.z ?? (i + 1) * 10,
		}));
		const zA = nextLayers[idx].z as number;
		const zB = nextLayers[otherIdx].z as number;
		if (zA === zB) {
			nextLayers[idx].z = (idx + 1) * 10;
			nextLayers[otherIdx].z = (otherIdx + 1) * 10;
		} else {
			nextLayers[idx].z = zB;
			nextLayers[otherIdx].z = zA;
		}
		[nextLayers[idx], nextLayers[otherIdx]] = [
			nextLayers[otherIdx],
			nextLayers[idx],
		];
		return { ...manifest, layers: nextLayers };
	}
	return swapAdjacentUnits(manifest, units, unitIdx, direction);
}

/** そのグループの中で、1枚だけを上下に動かす（グループの外へは出ない）。 */
export function moveLayerWithinGroup(
	manifest: MvManifest,
	layerId: string,
	direction: "up" | "down",
): MvManifest {
	const layers = manifest.layers;
	const idx = layers.findIndex((l) => l.id === layerId);
	if (idx < 0) return manifest;
	const groupId = layers[idx].groupId;
	if (!groupId) return manifest;
	const adjIdx = direction === "up" ? idx - 1 : idx + 1;
	if (adjIdx < 0 || adjIdx >= layers.length) return manifest;
	if (layers[adjIdx].groupId !== groupId) return manifest;
	const nextLayers = [...layers];
	[nextLayers[idx], nextLayers[adjIdx]] = [nextLayers[adjIdx], nextLayers[idx]];
	return { ...manifest, layers: nextLayers };
}

/**
 * 新しいレイヤーをグループの末尾に追加する（呼び出し側で作ったレイヤーに groupId を
 * 付けてから、そのグループの最後のメンバーの直後へ挿入する）。
 */
export function addLayerToGroup(
	manifest: MvManifest,
	groupId: string,
	layer: MvLayer,
): MvManifest {
	const layers = manifest.layers;
	let lastIdx = -1;
	layers.forEach((l, i) => {
		if (l.groupId === groupId) lastIdx = i;
	});
	const tagged: MvLayer = { ...layer, groupId };
	if (lastIdx < 0) {
		// グループが空（起こらないはずだが保険）：末尾に足す
		return { ...manifest, layers: [...layers, tagged] };
	}
	const nextLayers = [...layers];
	nextLayers.splice(lastIdx + 1, 0, tagged);
	return { ...manifest, layers: nextLayers };
}

/** そのグループに属すレイヤーを表示順のまま返す。 */
export function groupMembers(manifest: MvManifest, groupId: string): MvLayer[] {
	return manifest.layers.filter((l) => l.groupId === groupId);
}

/**
 * グループの中身をまるごと新しいレイヤー一式へ差し替える。
 * 「同じグループの設定をワンボタンで作り直す」マクロ向け——グループ自体
 * （id・名前）は変えずに、中身だけ入れ替える。元の位置（配列中でグループが
 * あった場所）はそのまま保つので、一覧の上での場所が変わらない。
 * `newLayers` は呼び出し側で `groupId` を付け済みであること。
 */
export function replaceGroupMembers(
	manifest: MvManifest,
	groupId: string,
	newLayers: MvLayer[],
): MvManifest {
	const layers = manifest.layers;
	const idx = layers.findIndex((l) => l.groupId === groupId);
	if (idx < 0) {
		// まだ存在しないグループなら末尾に新設する（グループレコードは呼び出し側の責任）。
		return { ...manifest, layers: [...layers, ...newLayers] };
	}
	// グループの手前まではそのまま、グループ本体を新しい中身へ差し替え、
	// それより後ろで「このグループに属さない」レイヤーだけを残す。
	const untouchedBefore = layers.slice(0, idx);
	const untouchedAfter = layers
		.slice(idx)
		.filter((l) => l.groupId !== groupId);
	return {
		...manifest,
		layers: [...untouchedBefore, ...newLayers, ...untouchedAfter],
	};
}

/**
 * レイヤー一覧を「先頭に来た順」でグループ／単独レイヤーへ振り分ける。
 * エディタの一覧描画で、グループはヘッダー1つ＋中身をまとめて出すために使う。
 */
export interface LayerListRow {
	kind: "single" | "group";
	layer?: MvLayer;
	group?: MvLayerGroup;
	members?: MvLayer[];
}

// ───────────────── グループ一括編集 ─────────────────
// 「相対」＝各レイヤーの現在値へ value を加算（レイヤーごとの元の差は保ったまま動かす）。
// 「絶対」＝グループ全員を value（またはそこから敷き直した値）へ揃える。

export type MvGroupEditMode = "relative" | "absolute";

/**
 * グループの重なり順(z)を一括変更する。
 * 相対：全員の z へ value を加算。絶対：一覧の並び順に沿って value, value+10, value+20... と
 * 敷き直す（絶対値をそのまま全員に入れると同順位になり、重なり順のタイブレークが並び順頼みの
 * 別の場所（moveTopLevelLayer 等）と食い違う——常に間隔を空けて割り当てる）。
 */
export function shiftGroupZ(
	manifest: MvManifest,
	groupId: string,
	mode: MvGroupEditMode,
	value: number,
): MvManifest {
	let i = 0;
	return {
		...manifest,
		layers: manifest.layers.map((l, idx) => {
			if (l.groupId !== groupId) return l;
			const z =
				mode === "relative"
					? (l.z ?? (idx + 1) * 10) + value
					: value + i * 10;
			i++;
			return { ...l, z };
		}),
	};
}

/**
 * グループの座標を一括変更する。visualizer は rect.x/rect.y、それ以外は x/y を持つ
 * レイヤーだけが対象（effect 等、位置を持たない kind は素通り）。
 * 相対：dx/dy を加算。絶対：全員を同じ座標 (x, y) へ上書き。
 */
export function applyGroupPosition(
	manifest: MvManifest,
	groupId: string,
	mode: MvGroupEditMode,
	x: number,
	y: number,
): MvManifest {
	return {
		...manifest,
		layers: manifest.layers.map((l) => {
			if (l.groupId !== groupId) return l;
			if (l.kind === "visualizer") {
				const rect = l.rect;
				return {
					...l,
					rect: {
						...rect,
						x: mode === "relative" ? rect.x + x : x,
						y: mode === "relative" ? rect.y + y : y,
					},
				};
			}
			if ("x" in l && "y" in l) {
				const curX = l.x ?? 0;
				const curY = l.y ?? 0;
				return {
					...l,
					x: mode === "relative" ? curX + x : x,
					y: mode === "relative" ? curY + y : y,
				};
			}
			return l;
		}),
	};
}

/**
 * グループの不透明度を一括変更する。相対：現在値へ value を加算。絶対：全員 value に上書き。
 * どちらも 0..1 にクランプする（レイヤーの opacity は「掛け算の1要素」ではなくそのまま
 * globalAlpha に使われるので、範囲外の値は描画側で不定な見え方になる）。
 */
export function applyGroupOpacity(
	manifest: MvManifest,
	groupId: string,
	mode: MvGroupEditMode,
	value: number,
): MvManifest {
	return {
		...manifest,
		layers: manifest.layers.map((l) => {
			if (l.groupId !== groupId) return l;
			const cur = l.opacity ?? 1;
			const next = mode === "relative" ? cur + value : value;
			return { ...l, opacity: Math.min(1, Math.max(0, next)) };
		}),
	};
}

/**
 * グループのサイズ（拡大率/px）を一括変更する。
 */
export function applyGroupSize(
	manifest: MvManifest,
	groupId: string,
	mode: MvGroupEditMode,
	value: number,
): MvManifest {
	return {
		...manifest,
		layers: manifest.layers.map((l) => {
			if (l.groupId !== groupId) return l;
			if ("size" in l && typeof l.size === "number") {
				const cur = l.size;
				const next = mode === "relative" ? cur + value : value;
				return { ...l, size: Math.max(1, Math.round(next * 10) / 10) };
			}
			if (
				"scale" in l &&
				typeof (l as unknown as Record<string, unknown>).scale === "number"
			) {
				const cur =
					((l as unknown as Record<string, unknown>).scale as number) ?? 1;
				const next = mode === "relative" ? cur + value : value;
				return { ...l, scale: Math.max(0.01, Math.round(next * 100) / 100) };
			}
			if (l.kind === "visualizer") {
				const rect = l.rect;
				if (mode === "relative") {
					return {
						...l,
						rect: {
							...rect,
							w: Math.max(10, Math.round((rect.w + value) * 10) / 10),
							h: Math.max(10, Math.round((rect.h + value) * 10) / 10),
						},
					};
				} else {
					return {
						...l,
						rect: {
							...rect,
							w: Math.max(10, Math.round(value * 10) / 10),
							h: Math.max(10, Math.round(value * 10) / 10),
						},
					};
				}
			}
			return l;
		}),
	};
}

/**
 * グループの回転角を一括変更する。
 */
export function applyGroupRotation(
	manifest: MvManifest,
	groupId: string,
	mode: MvGroupEditMode,
	value: number,
): MvManifest {
	return {
		...manifest,
		layers: manifest.layers.map((l) => {
			if (l.groupId !== groupId) return l;
			if (
				"rotation" in l &&
				typeof (l as unknown as Record<string, unknown>).rotation === "number"
			) {
				const cur =
					((l as unknown as Record<string, unknown>).rotation as number) ?? 0;
				const next = mode === "relative" ? cur + value : value;
				return { ...l, rotation: Math.round(next * 10) / 10 };
			}
			return l;
		}),
	};
}

/**
 * グループの線の太さを一括変更する。
 */
export function applyGroupThickness(
	manifest: MvManifest,
	groupId: string,
	mode: MvGroupEditMode,
	value: number,
): MvManifest {
	return {
		...manifest,
		layers: manifest.layers.map((l) => {
			if (l.groupId !== groupId) return l;
			if (
				"thickness" in l &&
				typeof (l as unknown as Record<string, unknown>).thickness === "number"
			) {
				const cur =
					((l as unknown as Record<string, unknown>).thickness as number) ?? 2;
				const next = mode === "relative" ? cur + value : value;
				return { ...l, thickness: Math.max(0.1, Math.round(next * 10) / 10) };
			}
			return l;
		}),
	};
}

/**
 * グループの色を一括変更する。
 */
export function applyGroupColor(
	manifest: MvManifest,
	groupId: string,
	color: string,
): MvManifest {
	return {
		...manifest,
		layers: manifest.layers.map((l) => {
			if (l.groupId !== groupId) return l;
			if (
				"color" in l &&
				typeof (l as unknown as Record<string, unknown>).color === "string"
			) {
				return { ...l, color };
			}
			return l;
		}),
	};
}

/**
 * グループの描画モード（ブレンド）を一括変更する。
 */
export function applyGroupBlend(
	manifest: MvManifest,
	groupId: string,
	blend: MvBlend,
): MvManifest {
	return {
		...manifest,
		layers: manifest.layers.map((l) => {
			if (l.groupId !== groupId) return l;
			return { ...l, blend };
		}),
	};
}

export function buildLayerListRows(manifest: MvManifest): LayerListRow[] {
	const units = computeUnits(manifest.layers);
	const groupsById = new Map((manifest.groups ?? []).map((g) => [g.id, g]));
	return units.map((u) => {
		if (u.groupId === null) {
			return { kind: "single", layer: manifest.layers[u.start] };
		}
		const members = manifest.layers.slice(u.start, u.end);
		const group = groupsById.get(u.groupId) ?? {
			id: u.groupId,
			name: "グループ",
		};
		return { kind: "group", group, members };
	});
}
