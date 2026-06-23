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

/** ギャラリーで各プリセットの中身を一言で伝えるキャッチコピー。 */
export const PRESET_TAGLINE: Record<PresetId, string> = {
  onjReze: '爆弾で暴れる陣取りアクション',
  dq: 'コマンド戦闘の王道RPG',
  mario: '走って跳ぶ横スクロール',
  touhou: '弾幕をよけるシューティング',
  rockman: '撃って進むアクション',
};
