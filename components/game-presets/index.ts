import { type PresetData, type PresetId } from './shared';
import { dq } from './dq';
import { mario } from './mario';
import { rockman } from './rockman';
import { touhou } from './touhou';
import { onjReze } from './onj-reze';

export * from './shared';

export const PRESETS: Record<PresetId, PresetData> = { dq, mario, rockman, touhou, onjReze };
export const PRESET_ORDER: PresetId[] = ['onjReze', 'dq', 'mario', 'touhou', 'rockman'];
export const PRESET_EMOJI: Record<PresetId, string> = { dq: '🐉', mario: '🍄', touhou: '🎀', rockman: '🤖', onjReze: '💣' };
