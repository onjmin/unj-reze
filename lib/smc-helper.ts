// Shared utilities for loading SMC assets from zynq-platform/super-mario-construct repository CDN

export function resolveSMCUrl(image: string): string {
	// Normalize to png if it ends with webp (since the repo zynq-platform/super-mario-construct hosts PNG files)
	const normalized = image.replace(/\.webp$/, ".png");
	return `https://cdn.jsdelivr.net/gh/zynq-platform/super-mario-construct@main/${normalized}`;
}

// Construct 3 プロジェクト書き出しの生JSONは位置ベースの配列（タプル）形式で、
// フィールド数・型はインデックスごとに固定だがオブジェクト全体の型は提供されない。
type SmcImagePoint = [name: string, x: number, y: number];
type SmcRawFrame = [
	image: string,
	_1: unknown,
	x: number,
	y: number,
	w: number,
	h: number,
	mirrored: boolean,
	duration: number,
	originX: number,
	originY: number,
	imagePoints: SmcImagePoint[] | undefined,
	collisionPoly: unknown[] | undefined,
];
type SmcRawAnimation = [
	name: string,
	speed: number,
	loop: boolean,
	repeatCount: number,
	repeatTo: number,
	pingPong: boolean,
	_6: unknown,
	frames: SmcRawFrame[],
];

export interface SmcFrame {
	image: string;
	x: number;
	y: number;
	w: number;
	h: number;
	mirrored: boolean;
	duration: number;
	originX: number;
	originY: number;
	imagePoints: Array<{ name: string; x: number; y: number }>;
	collisionPoly: unknown[];
}

export interface SmcAnimation {
	name: string;
	speed: number;
	loop: boolean;
	repeatCount: number;
	repeatTo: number;
	pingPong: boolean;
	frames: SmcFrame[];
}

export interface SmcObjectMetadata {
	name: string;
	animations: Record<string, SmcAnimation>;
}

export type SmcMetadata = Record<string, SmcObjectMetadata>;

export function extractSmcMetadata(dataJson: unknown): SmcMetadata | null {
	const proj = (dataJson as { project?: unknown[] })?.project;
	if (!proj || !Array.isArray(proj[3])) return null;
	const objectTypes = proj[3] as unknown[][];
	const results: SmcMetadata = {};
	for (const obj of objectTypes) {
		const name = obj[0] as string;
		const isFamily = obj[2];
		if (isFamily) continue;

		let animsField: SmcRawAnimation[] | null = null;
		for (const field of obj) {
			if (
				Array.isArray(field) &&
				field.length > 0 &&
				Array.isArray(field[0]) &&
				typeof field[0][0] === "string" &&
				Array.isArray(field[0][7])
			) {
				animsField = field as SmcRawAnimation[];
				break;
			}
		}
		if (!animsField) continue;

		results[name] = {
			name: name,
			animations: {},
		};

		for (const anim of animsField) {
			const animName = anim[0];
			const speed = anim[1];
			const loop = anim[2];
			const repeatCount = anim[3];
			const repeatTo = anim[4];
			const pingPong = anim[5];
			const frames = anim[7];

			results[name].animations[animName] = {
				name: animName,
				speed: speed,
				loop: loop,
				repeatCount: repeatCount,
				repeatTo: repeatTo,
				pingPong: pingPong,
				frames: frames.map((f) => {
					const imagePath = f[0].replace(/\.webp$/, ".png");
					return {
						image: imagePath,
						x: f[2],
						y: f[3],
						w: f[4],
						h: f[5],
						mirrored: f[6],
						duration: f[7],
						originX: f[8],
						originY: f[9],
						imagePoints: f[10]
							? f[10].map((ip) => ({ name: ip[0], x: ip[1], y: ip[2] }))
							: [],
						collisionPoly: f[11] || [],
					};
				}),
			};
		}
	}

	// --- Compatibility Shim (Older Construct 3 Version on GitHub to Newer Version Mapping) ---

	// 1. Alias Mario to PlayerSprite
	if (results["Mario"]) {
		results["PlayerSprite"] = {
			name: "PlayerSprite",
			animations: {},
		};
		for (const [animName, anim] of Object.entries(
			results["Mario"].animations,
		)) {
			if (animName.startsWith("0Idle")) {
				results["PlayerSprite"].animations["2Idle0_3"] = anim;
				results["PlayerSprite"].animations["2Idle0_0"] = anim;
				results["PlayerSprite"].animations["2Idle0_1"] = anim;
			} else if (animName.startsWith("0Walk")) {
				results["PlayerSprite"].animations["2Walk0_3"] = anim;
				results["PlayerSprite"].animations["2Walk0_0"] = anim;
				results["PlayerSprite"].animations["2Walk0_1"] = anim;
			} else if (animName.startsWith("0Jump")) {
				results["PlayerSprite"].animations["2Jump0_3"] = anim;
				results["PlayerSprite"].animations["2Jump0_0"] = anim;
				results["PlayerSprite"].animations["2Jump0_1"] = anim;
			} else {
				results["PlayerSprite"].animations[animName] = anim;
			}
		}
	}

	// 2. Alias Toad to NPC
	// Toad の実データは <番号>Idle (0〜11) で、番号はキノコの色違い（10 はキノピコ）。
	// ピーチ姫・ロゼッタは存在しない。全バリエーションを 1NPC<番号>(_Walk) として公開する
	// （1NPC0/1NPC1 を参照する既存プリセットとランタイムの `${base}_Walk` 規約を維持）。
	if (results["Toad"]) {
		results["NPC"] = {
			name: "NPC",
			animations: {},
		};
		for (const [animName, anim] of Object.entries(results["Toad"].animations)) {
			const m = animName.match(/^(\d+)Idle$/);
			if (m) {
				results["NPC"].animations[`1NPC${m[1]}`] = anim;
				results["NPC"].animations[`1NPC${m[1]}_Walk`] = anim;
			}
		}
	}

	// 3. Alias BobOmb to Bobomb
	if (results["BobOmb"]) {
		results["Bobomb"] = results["BobOmb"];
	}

	return results;
}

let metadataPromise: Promise<SmcMetadata | null> | null = null;

export function getSmcMetadata(): Promise<SmcMetadata | null> {
	if (!metadataPromise) {
		metadataPromise = fetch(
			"https://cdn.jsdelivr.net/gh/zynq-platform/super-mario-construct@main/data.json",
		)
			.then((res) => res.json())
			.then((data) => {
				const extracted = extractSmcMetadata(data);
				return extracted;
			})
			.catch((e) => {
				metadataPromise = null; // reset cache on failure
				console.error(
					"Failed to load or parse SMC data.json from GitHub CDN:",
					e,
				);
				throw e;
			});
	}
	return metadataPromise;
}
