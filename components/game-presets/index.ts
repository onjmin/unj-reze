import { type PresetData, type PresetId } from './shared';
import { dq } from './dq';
import { pokemon } from './pokemon';
import { mario } from './mario';
import { rockman } from './rockman';
import { touhou } from './touhou';
import { zelda } from './zelda';

export * from './shared';

export const PRESETS: Record<PresetId, PresetData> = { dq, pokemon, mario, rockman, touhou, zelda };
export const PRESET_ORDER: PresetId[] = ['zelda', 'dq', 'mario', 'touhou', 'pokemon', 'rockman'];
export const PRESET_EMOJI: Record<PresetId, string> = { dq: '🐉', mario: '🍄', touhou: '🎀', pokemon: '⚡', rockman: '🤖', zelda: '🗡️' };
