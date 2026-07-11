// Undertale Engine (GameMaker) 同梱の効果音。assets/UndertaleEngine/undertale_engine.yyp の
// "sounds/" リソース一覧から抽出。実体はサードパーティCDN（onezhazha233/Undertale-Engine-modded-by-Zhazha）でホストされている。
const UNDERTALE_ENGINE_SFX_CDN_BASE =
  'https://raw.githubusercontent.com/onezhazha233/Undertale-Engine-modded-by-Zhazha/main/sounds';

export const UNDERTALE_ENGINE_SOUNDS = [
  'snd_break_0',
  'snd_break_1',
  'snd_damage',
  'snd_encounter_undertale_move',
  'snd_exclamation',
  'snd_flee',
  'snd_hurt',
  'snd_item_equip',
  'snd_item_heal',
  'snd_item_swallow',
  'snd_level_up',
  'snd_logo',
  'snd_menu_cancel',
  'snd_menu_confirm',
  'snd_menu_switch',
  'snd_noise',
  'snd_phone_box',
  'snd_phone_call',
  'snd_phone_status',
  'snd_save',
  'snd_slice',
  'snd_spike_disable',
  'snd_text_voice_default',
  'snd_text_voice_toriel',
  'snd_text_voice_typer',
  'snd_vaporize',
] as const;

export type UndertaleEngineSound = (typeof UNDERTALE_ENGINE_SOUNDS)[number];

/** Undertale Engine の効果音名から再生用の直リンクURLを組み立てる。 */
export function undertaleSfxUrl(name: UndertaleEngineSound): string {
  return `${UNDERTALE_ENGINE_SFX_CDN_BASE}/${name}/${name}`;
}
