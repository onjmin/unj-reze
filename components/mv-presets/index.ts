import type { MvManifest, MvPresetKind } from '@/lib/mv-config';
import { COURIER_PRESET } from './courier';
import { GEOMETRIC_PRESET } from './geometric';
import { LANTERN_PRESET } from './lantern';
import { PIANO_ROLL_PRESET } from './piano-roll';
import { PIXEL_STAGE_PRESET } from './pixel-stage';
import { SEQUENCER_PRESET } from './sequencer';
import { STAGE_CAST_PRESET } from './stage-cast';
import { WINDOW_FRAME_PRESET } from './window-frame';
import type { MvPresetEntry } from './shared';

export type { MvPresetEntry } from './shared';

/**
 * 表示順。素材ゼロで完成するものを先頭に置き、用意する素材が多いものほど後ろへ。
 * `kind` は保存時の分類（3種）で、プリセット自体はそれより細かい単位で並ぶ。
 *
 * どのプリセットも 64小節ぶんの曲と 8〜16 の場面を持つ。
 * 場面が2つしか無いと、2分の曲でも同じ画がずっと映っているだけになるため。
 */
export const MV_PRESETS: MvPresetEntry[] = [
  GEOMETRIC_PRESET,
  LANTERN_PRESET,
  SEQUENCER_PRESET,
  PIANO_ROLL_PRESET,
  WINDOW_FRAME_PRESET,
  PIXEL_STAGE_PRESET,
  STAGE_CAST_PRESET,
  COURIER_PRESET,
];

/** プリセット名から引く（同じ kind のプリセットが複数あるため名前で識別する）。 */
export function findMvPresetByName(name: string): MvPresetEntry | undefined {
  return MV_PRESETS.find(p => p.name === name);
}

export function findMvPreset(kind: MvPresetKind): MvPresetEntry | undefined {
  return MV_PRESETS.find(p => p.kind === kind);
}

export function buildMvPreset(kind: MvPresetKind): MvManifest {
  return (findMvPreset(kind) ?? MV_PRESETS[0]).build();
}
