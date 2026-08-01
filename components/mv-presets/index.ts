import type { MvManifest, MvPresetKind } from '@/lib/mv-config';
import { GEOMETRIC_PRESET } from './geometric';
import { PIANO_ROLL_PRESET } from './piano-roll';
import { PIXEL_STAGE_PRESET } from './pixel-stage';
import { SEQUENCER_PRESET } from './sequencer';
import { STAGE_CAST_PRESET } from './stage-cast';
import type { MvPresetEntry } from './shared';

export type { MvPresetEntry } from './shared';

/**
 * 表示順。素材ゼロで完成するものを先頭に置き、用意する素材が多いものほど後ろへ。
 * `kind` は保存時の分類（3種）で、プリセット自体はそれより細かい単位で並ぶ。
 */
export const MV_PRESETS: MvPresetEntry[] = [
  GEOMETRIC_PRESET,
  SEQUENCER_PRESET,
  PIANO_ROLL_PRESET,
  PIXEL_STAGE_PRESET,
  STAGE_CAST_PRESET,
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
