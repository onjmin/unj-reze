import { type PresetData, type PresetId } from './shared';
import { dq } from './dq';
import { pokemon } from './pokemon';
import { mario } from './mario';
import { rockman } from './rockman';
import { touhou } from './touhou';

export * from './shared';

export const PRESETS: Record<PresetId, PresetData> = { dq, pokemon, mario, rockman, touhou };
export const PRESET_ORDER: PresetId[] = ['dq', 'mario', 'touhou', 'pokemon', 'rockman'];
export const PRESET_EMOJI: Record<PresetId, string> = { dq: '🐉', mario: '🍄', touhou: '🎀', pokemon: '⚡', rockman: '🤖' };
