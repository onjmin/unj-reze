import { deltarune } from "./deltarune";
import { dq } from "./dq";
import { mario } from "./mario";
import { mmo3d } from "./mmo3d";
import { onjReze } from "./onj-reze";
import { rockman } from "./rockman";
import { type PresetData, type PresetId } from "./shared";
import { touhou } from "./touhou";
import { undertale } from "./undertale";
import { yume } from "./yume";

export * from "./shared";

export const PRESETS: Record<PresetId, PresetData> = {
	dq,
	mario,
	rockman,
	touhou,
	onjReze,
	undertale,
	deltarune,
	yume,
	mmo3d,
};
export const PRESET_ORDER: PresetId[] = [
	"onjReze",
	"dq",
	"mario",
	"touhou",
	"rockman",
	"undertale",
	"deltarune",
	"yume",
	"mmo3d",
];
export const PRESET_EMOJI: Record<PresetId, string> = {
	dq: "",
	mario: "",
	touhou: "",
	rockman: "",
	onjReze: "",
	undertale: "",
	deltarune: "",
	yume: "",
	mmo3d: "",
};

/** ギャラリーで各プリセットの中身を一言で伝えるキャッチコピー。 */
export const PRESET_TAGLINE: Record<PresetId, string> = {
	onjReze: "爆弾で暴れるアクション",
	dq: "コマンド戦闘の王道RPG",
	mario: "走って跳ぶ横スクロール",
	touhou: "弾幕をよけるシューティング",
	rockman: "撃って進むアクション",
	undertale: "ころさなくてもいいRPG",
	deltarune: "くらやみの世界をめぐる不殺RPG",
	yume: "さまよう2.5Dの夢の世界",
	mmo3d: "三人称視点の3D MMO",
};
