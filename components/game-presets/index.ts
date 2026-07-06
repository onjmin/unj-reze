import { type PresetData, type PresetId } from './shared';
import { dq } from './dq';
import { mario } from './mario';
import { rockman } from './rockman';
import { touhou } from './touhou';
import { onjReze } from './onj-reze';
import { undertale } from './undertale';

export * from './shared';

export const PRESETS: Record<PresetId, PresetData> = { dq, mario, rockman, touhou, onjReze, undertale };
export const PRESET_ORDER: PresetId[] = ['onjReze', 'dq', 'mario', 'touhou', 'rockman', 'undertale'];
export const PRESET_EMOJI: Record<PresetId, string> = { dq: '🐉', mario: '🍄', touhou: '🎀', rockman: '🤖', onjReze: '💣', undertale: '❤️' };

/** ギャラリーで各プリセットの中身を一言で伝えるキャッチコピー。 */
export const PRESET_TAGLINE: Record<PresetId, string> = {
  onjReze: '爆弾で暴れるアクション',
  dq: 'コマンド戦闘の王道RPG',
  mario: '走って跳ぶ横スクロール',
  touhou: '弾幕をよけるシューティング',
  rockman: '撃って進むアクション',
  undertale: 'ころさなくてもいいRPG',
};
