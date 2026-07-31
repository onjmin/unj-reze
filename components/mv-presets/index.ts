import type { MvManifest, MvPresetKind } from '@/lib/mv-config';
import { GEOMETRIC_PRESET } from './geometric';
import { PIANO_ROLL_PRESET } from './piano-roll';
import { PIXEL_STAGE_PRESET } from './pixel-stage';
import type { MvPresetEntry } from './shared';

export type { MvPresetEntry } from './shared';

/** 表示順。素材ゼロで完成するものを先頭に置く。 */
export const MV_PRESETS: MvPresetEntry[] = [
  GEOMETRIC_PRESET,
  PIANO_ROLL_PRESET,
  PIXEL_STAGE_PRESET,
];

export function findMvPreset(kind: MvPresetKind): MvPresetEntry | undefined {
  return MV_PRESETS.find(p => p.kind === kind);
}

export function buildMvPreset(kind: MvPresetKind): MvManifest {
  return (findMvPreset(kind) ?? MV_PRESETS[0]).build();
}
