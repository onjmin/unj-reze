import type { MvManifest, MvPresetKind } from "@/lib/mv-config";
import { GEOMETRIC_PRESET } from "./geometric";
import { LANTERN_PRESET } from "./lantern";
import { PIANO_ROLL_PRESET } from "./piano-roll";
import type { MvPresetEntry } from "./shared";

export type { MvPresetEntry } from "./shared";

/**
 * 表示順は指定どおり: 音ゲー風演奏(旧ピアノロール) → ドット絵PV(旧灯りのステージ)
 * → 音ハメサークル(旧ジオメトリック)。先頭がプリセット選択のdefaultになる。
 * `kind` は保存時の分類（3種）で、プリセット自体はそれより細かい単位で並ぶ。
 *
 * どのプリセットも 64小節ぶんの曲と 8〜16 の場面を持つ。
 * 場面が2つしか無いと、2分の曲でも同じ画がずっと映っているだけになるため。
 *
 * シーケンサ／窓のステージ／ドット絵ステージ／ステージ整列／運び屋の5つは
 * 参考動画との再現率が低く（コマ送り検証未実施のまま作られたAI slop）撤去した。
 * 復元する場合は git 履歴（components/mv-presets/{sequencer,window-frame,
 * pixel-stage,stage-cast,courier}.ts）から。
 */
export const MV_PRESETS: MvPresetEntry[] = [
	PIANO_ROLL_PRESET,
	LANTERN_PRESET,
	GEOMETRIC_PRESET,
];

/** プリセット名から引く（同じ kind のプリセットが複数あるため名前で識別する）。 */
export function findMvPresetByName(name: string): MvPresetEntry | undefined {
	return MV_PRESETS.find((p) => p.name === name);
}

export function findMvPreset(kind: MvPresetKind): MvPresetEntry | undefined {
	return MV_PRESETS.find((p) => p.kind === kind);
}

export function buildMvPreset(kind: MvPresetKind): MvManifest {
	return (findMvPreset(kind) ?? MV_PRESETS[0]).build();
}
