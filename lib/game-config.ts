// BGM・素材参照まわりの共通型（lib/asset-ref.ts・lib/AssetProvider.ts・lib/BgmManager.ts が使う）。
// ゲームの保存データの型は components/game-manifest.ts の GameManifestDraft。
// （以前ここにあった旧形式の GameManifest / SceneData などは、唯一の利用者だった
//  lib/game-presets.ts ごと削除した。）

export interface BgmAsset {
	type: "midi" | "mml" | "youtube" | "nicovideo" | "soundcloud" | "direct";
	src: string;
	volume?: number;
	start?: number;
	loop?:
		| boolean
		| {
				start?: {
					bar?: number;
					step?: number;
					seconds?: number;
				};
				end?: {
					bar?: number;
					step?: number;
					seconds?: number;
				};
		  };
}

export interface SpriteMap {
	[name: string]: string;
}

export interface Tileset {
	[tileType: number]: { color: string; label?: string };
}

export interface AssetManifest {
	bgm?: BgmAsset;
	tileset: Tileset;
	sprites?: SpriteMap;
}
