import { fusatsu } from "./fusatsu";
import { mmo3d } from "./mmo3d";
import { onjReze } from "./onj-reze";
import { type PresetData, type SamplePresetId } from "./shared";
import { snowForest } from "./snow-forest";
import { touhou } from "./touhou";
import { yume } from "./yume";

export * from "./shared";
export * from "./templates";

/** 見本プリセット。'blank'（まっさらテンプレートから作ったゲーム）は実体を持たないのでここには無い
 *  （土台は templates.ts の createEngineTemplate）。 */
export const PRESETS: Record<SamplePresetId, PresetData> = {
	snowForest,
	touhou,
	onjReze,
	fusatsu,
	yume,
	mmo3d,
};

/** id が見本プリセットのものか（保存データの preset は 'blank' や、削除済みの古いIDのこともある）。 */
export const isSamplePresetId = (id: unknown): id is SamplePresetId =>
	typeof id === "string" && Object.prototype.hasOwnProperty.call(PRESETS, id);

/** ギャラリー・「ゲーム切り替え」に並べる見本の順。
 *  mmo3d は外してある（PRESETS には JSON 取り込み用に残す）。 */
export const PRESET_ORDER: SamplePresetId[] = [
	"onjReze",
	"snowForest",
	"touhou",
	"fusatsu",
	"yume",
];

/** ギャラリーで各プリセットの中身を一言で伝えるキャッチコピー。 */
export const PRESET_TAGLINE: Record<SamplePresetId, string> = {
	onjReze: "爆弾で暴れるアクション",
	snowForest: "氷の足場を跳び渡る横スクロール",
	touhou: "弾幕をよけるシューティング",
	fusatsu: "ころさなくてもいいRPG",
	yume: "さまよう2.5Dの夢の世界",
	mmo3d: "三人称視点の3D MMO",
};
