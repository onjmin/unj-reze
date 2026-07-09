// Super Mario 127（Godotファンゲーム, Level-Share-Square/SuperMario127）の音源。
// GitHub raw CDN で直接配信されている .wav/.ogg を利用する。
// README: 「free to clone and use wherever you need」（コードのライセンスは明示なし。
// 楽曲・SEは主に既存Nintendo作品からの抽出音源のため、商用利用は避け素材出典として明記すること）。
const SM127_CDN = 'https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master';

/** BGM（.ogg）。パスは拡張子込みでそのまま指定する。 */
export const SM127_MUSIC = {
  overworld: 'assets/music/bob_omb_battlefield.ogg',
  underground: 'assets/music/smw_underground_edit.ogg',
  secretCourse: 'assets/music/secret_course.ogg',
  caveDungeon: 'assets/music/cave_dungeon.ogg',
  castle: 'assets/music/inside_castle.ogg',
  bossBattle: 'assets/music/sm64_boss_battle.ogg',
  courseClear: 'assets/music/course_clear.ogg',
  titleScreen: 'assets/music/sm63_title_screen.ogg',
  starGet: 'assets/music/rainbow_mario.ogg',
  desert: 'assets/music/gritzy_desert.ogg',
  iceMountain: 'assets/music/ice_mountain.ogg',
  underwater: 'assets/music/beach_bowl_galaxy_underwater.ogg',
} as const;

/** 効果音（.wav / .ogg）。パスは拡張子込みでそのまま指定する。 */
export const SM127_SFX = {
  jump: 'scenes/actors/mario/sounds_misc/jump.wav',
  doubleJump: 'scenes/actors/mario/sounds_misc/double_jump.wav',
  tripleJump: 'scenes/actors/mario/sounds_mario/TripleJump1.wav',
  wallJump: 'scenes/actors/mario/sounds_misc/wall_jump.wav',
  damage: 'scenes/actors/mario/sounds_mario/Damage1.wav',
  death: 'assets/sounds/death.wav',
  powerup: 'scenes/actors/mario/sounds_misc/powerup.wav',
  stomp: 'scenes/actors/objects/goomba/stomp.wav',
  goombaPoof: 'scenes/actors/objects/goomba/poof.wav',
  coin: 'scenes/actors/objects/yellow_coin/sound.wav',
  redCoinLast: 'scenes/actors/objects/red_coin/sound_last.wav',
  blockHit: 'scenes/actors/objects/block/block_hit.wav',
  breakableBlock: 'scenes/actors/objects/breakable_block/break.wav',
  pipe: 'scenes/actors/objects/pipe/sound.wav',
  bobOmbExplosion: 'scenes/actors/objects/bob_omb/explosion_sound.wav',
  bulletBill: 'scenes/actors/objects/bullet_bill/sound.wav',
  booLaugh: 'scenes/actors/objects/boo/laugh.wav',
  door: 'scenes/actors/objects/door/nsmbwiiDoor1.wav',
  checkpoint: 'scenes/actors/objects/checkpoint/use.wav',
  starCoin: 'scenes/actors/objects/star_coin/collect.wav',
  shineCollect: 'scenes/actors/objects/shine/collect.wav',
  bowserLaugh: 'scenes/actors/scene_transitions/bowser_laugh.wav',
  menuOpen: 'classes/menu_open.wav',
  menuClose: 'classes/menu_close.wav',
  messageAppear: 'classes/message_appear.wav',
  messageDisappear: 'classes/message_disappear.wav',
  switchMenu: 'scenes/menu/level_portal/sounds/dsimenu_switch.wav',
  selectMenu: 'scenes/menu/level_portal/sounds/dsimenu_select.wav',
  click: 'assets/sounds/click.wav',
  pSwitch: 'scenes/actors/objects/p_switch/press.wav',
  noteBlock: 'scenes/actors/objects/note_block/strong_bounce.wav',
} as const;

export type SM127MusicKey = keyof typeof SM127_MUSIC;
export type SM127SfxKey = keyof typeof SM127_SFX;

export function sm127MusicUrl(key: SM127MusicKey): string {
  return `${SM127_CDN}/${SM127_MUSIC[key]}`;
}

export function sm127SfxUrl(key: SM127SfxKey): string {
  return `${SM127_CDN}/${SM127_SFX[key]}`;
}
