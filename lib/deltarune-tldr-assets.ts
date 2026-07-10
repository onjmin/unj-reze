// tlDR Engine（tweenko/tldr-engine, Deltarune風GameMakerエンジン）の音源。
// GitHub raw CDN で直接配信されている .wav/.ogg を利用する。
// リポジトリ自体はMITライセンスだがエンジンのコードに対するもの。音源はDeltarune本編からの抽出のため、商用利用は避け素材出典として明記すること。
const TLDR_CDN = 'https://raw.githubusercontent.com/tweenko/tldr-engine/main/sounds';

/** BGM（.ogg）。 */
export const TLDR_MUSIC = {
  battle: 'mus_battle/mus_battle.ogg',
  charJoin: 'mus_charjoin/mus_charjoin.ogg',
  darkness: 'mus_darkness/mus_darkness.ogg',
  defeat: 'mus_defeat/mus_defeat.ogg',
  drone: 'mus_drone/mus_drone.ogg',
  menu: 'mus_menu/mus_menu.ogg',
  story: 'mus_story/mus_story.ogg',
  exChurch: 'mus_ex_church/mus_ex_church.ogg',
  exCity: 'mus_ex_city/mus_ex_city.ogg',
  exForest: 'mus_ex_forest/mus_ex_forest.ogg',
  exShop: 'mus_ex_hip_shop/mus_ex_hip_shop.ogg',
  exSpawn: 'mus_ex_spawn/mus_ex_spawn.ogg',
} as const;

/** 効果音（.wav / .ogg）。 */
export const TLDR_SFX = {
  attack: 'snd_attack/snd_attack.wav',
  criticalSwing: 'snd_criticalswing/snd_criticalswing.wav',
  swing: 'snd_swing/snd_swing.wav',
  damage: 'snd_damage/snd_damage.wav',
  hurt: 'snd_hurt/snd_hurt.wav',
  heal: 'snd_heal/snd_heal.wav',
  levelup: 'snd_levelup/snd_levelup.wav',
  save: 'snd_save/snd_save.wav',
  spare: 'snd_spare/snd_spare.wav',
  mercyAdd: 'snd_mercyadd/snd_mercyadd.wav',
  equip: 'snd_equip/snd_equip.wav',
  jump: 'snd_jump/snd_jump.wav',
  bump: 'snd_bump/snd_bump.wav',
  step1: 'snd_step1/snd_step1.wav',
  step2: 'snd_step2/snd_step2.wav',
  doorOpen: 'snd_dooropen/snd_dooropen.wav',
  doorClose: 'snd_doorclose/snd_doorclose.wav',
  exclamation: 'snd_exclamation/snd_exclamation.wav',
  graze: 'snd_graze/snd_graze.wav',
  won: 'snd_won/snd_won.wav',
  smile: 'snd_smile/snd_smile.wav',
  text: 'snd_text/snd_text.wav',
  textNoelle: 'snd_text_noelle/snd_text_noelle.wav',
  textRalsei: 'snd_text_ralsei/snd_text_ralsei.wav',
  textSusie: 'snd_text_susie/snd_text_susie.wav',
  uiMove: 'snd_ui_move/snd_ui_move.wav',
  uiSelect: 'snd_ui_select/snd_ui_select.wav',
  uiCancel: 'snd_ui_cancel/snd_ui_cancel.wav',
  uiCantSelect: 'snd_ui_cant_select/snd_ui_cant_select.wav',
  spellCast: 'snd_spellcast/snd_spellcast.wav',
  rudeBusterSwing: 'snd_rudebuster_swing/snd_rudebuster_swing.wav',
  rudeBusterHit: 'snd_rudebuster_hit/snd_rudebuster_hit.wav',
  spearRise: 'snd_spearrise/snd_spearrise.wav',
  swallow: 'snd_swallow/snd_swallow.wav',
  splat: 'snd_splat/snd_splat.wav',
  noise: 'snd_noise/snd_noise.wav',
  ominous: 'snd_ominous/snd_ominous.wav',
  tensionHorn: 'snd_tensionhorn/snd_tensionhorn.wav',
  weaponPull: 'snd_weaponpull/snd_weaponpull.wav',
  spellPacify: 'snd_spell_pacify/snd_spell_pacify.ogg',
  spellCure: 'snd_spell_cure_slight_smaller/snd_spell_cure_slight_smaller.wav',
  defeatRun: 'snd_defeatrun/snd_defeatrun.wav',
  break1: 'snd_break1/snd_break1.wav',
  break2: 'snd_break2/snd_break2.wav',
  impact: 'snd_impact/snd_impact.wav',
} as const;

export type TldrMusicKey = keyof typeof TLDR_MUSIC;
export type TldrSfxKey = keyof typeof TLDR_SFX;

export function tldrMusicUrl(key: TldrMusicKey): string {
  return `${TLDR_CDN}/${TLDR_MUSIC[key]}`;
}

export function tldrSfxUrl(key: TldrSfxKey): string {
  return `${TLDR_CDN}/${TLDR_SFX[key]}`;
}

// ══════════════════════════════════════════════════════════════════════════
// スプライト（バトル用）
// GameMaker の sprites/<name>/<frameGUID>.png をフレーム順に列挙したもの。
// フレーム順・サイズ・再生速度は各 <name>.yy から抽出した（GUIDはファイル名なので順序が読めない）。
// ══════════════════════════════════════════════════════════════════════════
const TLDR_SPRITE_CDN = 'https://raw.githubusercontent.com/tweenko/tldr-engine/main/sprites';

/** バトル用アニメ1本ぶん。frames は再生順の画像URL。fps=0（1枚絵）は 1 に丸めてある。 */
export interface TldrAnim { frames: string[]; fps: number; w: number; h: number; }

const anim = (dir: string, w: number, h: number, fps: number, guids: string[]): TldrAnim => ({
  frames: guids.map(g => `${TLDR_SPRITE_CDN}/${dir}/${g}.png`),
  fps: Math.max(1, fps), w, h,
});

/** SOULハート（弾幕よけの自機）。frame0=通常、frame1=白抜き。 */
export const TLDR_SOUL_SPRITE: TldrAnim = anim('spr_soul', 20, 20, 1, [
  'ef311611-1808-4870-a23a-54770c7e3189',
  'fbd4d2b8-330f-4407-99cd-0b1a84f080ca',
]);

/** パーティメンバーのバトル横向きスプライト一式（クリス/スージー/ラルセイ）。 */
export const TLDR_PARTY_SPRITES = {
  kris: {
    idle: anim('spr_bkris_idle', 36, 38, 6, [
      '31625dcb-8237-468b-83a6-d87f2df4c230', 'c4f3ae79-d444-4ca8-aec3-a5f4215c8cd6',
      '055b019e-7095-465e-9859-18bf6bbe2bef', 'ec3dd8e5-e608-4c63-a68f-81792228c346',
      '61fd3b49-81b9-4766-956a-ec283aaf2650', '3484a9c3-fee3-4cf8-a3d9-ea905097c2c4',
    ]),
    attackReady: anim('spr_bkris_attackready', 63, 50, 1, ['99006eb3-78a9-43fe-b938-d838df12b4f7']),
    attack: anim('spr_bkris_attack', 63, 50, 10, [
      'e45e795d-8424-4971-8c9d-35e4a234801b', '02794293-b56a-45be-ba27-c5ac82201274',
      'caa16d33-58f7-4115-bb5e-26c4af92869e', 'd21db8cb-6fad-47c1-8753-33164f431a41',
      '7497f0ce-9350-445b-b60b-64e120237d9b', '658cfa45-0bbd-4f41-9691-30424a70ece0',
      'e76e8d17-9979-4563-999e-7b2f96caac11',
    ]),
    hurt: anim('spr_bkris_hurt', 63, 44, 1, ['e88a0345-0763-4ee1-b200-7e86ebe882b6']),
    defend: anim('spr_bkris_defend', 35, 40, 15, [
      '6525278b-a8ad-423a-89eb-e65066d2c4d2', 'f724cbb9-ef3a-4906-94ce-b49c6293053a',
      '51d76512-b420-49d1-8b41-426abd4ec5af', '7e93d059-8b87-4bf1-b5ae-a4b6bbbb3cc5',
      '04014d11-e7ab-464d-85aa-e4fa1b91a401', '83c7ca3f-d2a5-49c2-8ee5-7534fe713cfc',
    ]),
    defeat: anim('spr_bkris_defeat', 63, 44, 1, ['a4d3eea2-821b-4e45-85fc-e2a1a061947e']),
    act: anim('spr_bkris_act', 63, 44, 15, [
      '44513be0-d815-4ae4-ac69-f9c0b1142421', 'ec644990-dd3e-4634-9c01-31f4c8cb191a',
      '73f00573-df60-4910-982d-38af1834bf25', 'adf8ec4f-041c-4519-b2de-db951e03341f',
      'a5dc822a-fdb2-4462-a903-4f33f57a9ec7', '8930115d-20d3-4be7-9608-9eb968f73438',
      '36861b44-a6d0-43cd-9abe-6e2b9ce70cfb',
    ]),
    item: anim('spr_bkris_item', 63, 44, 10, [
      'd53eceaa-5a46-453c-8169-e7b8415ec8bb', '93350661-256b-498a-935a-e41e4585b2f1',
      'd3ac0c1c-0531-4429-a594-adad7ad0f4a4', '98a3105a-3758-4ad1-9212-d61322e86caa',
      'a4348bd5-5cd1-4a31-b512-342311b9ee38', 'a72f36a2-baca-4eb8-963e-821e04ce110f',
      '0c8f51ac-7b6d-472d-8ae1-6f1c42123636',
    ]),
  },
  susie: {
    idle: anim('spr_bsusie_idle', 54, 45, 6, [
      '364a3e78-6c64-4bbb-a010-779d9aedd7cc', '3719064d-93ba-489e-84db-5c328ad5222a',
      'b057dda5-5a1f-4074-aa7e-474740e92cf1', '7c754930-d627-4b43-a7df-0e4e1c50143a',
    ]),
    attackReady: anim('spr_bsusie_attackready', 103, 71, 1, ['22376b18-020c-4844-b94d-adc317b8d26e']),
    attack: anim('spr_bsusie_attack', 103, 71, 10, [
      'c90dc9d1-bbcf-42ca-b12f-3329c302c72c', '8cd7888b-a147-4d38-8432-bb6e43a08de3',
      'bf99587b-15ff-4f2b-bdc2-dc871dc8a73a', '4b364bc6-320f-4d2b-a9c1-f2b211514064',
      'd73b5236-be13-49bc-94d4-7acf5e82ac31', 'ac0e28dc-f58b-4571-bbc6-a3668646f85e',
    ]),
    hurt: anim('spr_bsusie_hurt', 54, 45, 1, ['c0fe848f-c5cd-495f-97dd-824daf91e2df']),
    defend: anim('spr_bsusie_defend', 56, 66, 10, [
      'f048bfa2-a598-4472-b326-cbf5a27ea7a7', 'af9ce6ad-8b14-41f0-ac98-4e3a7cb35801',
      '954a5d25-9b58-471d-8306-24e3e14b2db7', '4ec4a3c4-bc11-4147-9597-587a5f6ec95c',
      '0128e967-b1cb-4583-8134-c6a44aed5f95',
    ]),
    defeat: anim('spr_bsusie_defeat', 60, 46, 1, ['697ecd0f-24b9-4457-a6f9-95ea32285b68']),
    act: anim('spr_bsusie_act', 103, 71, 15, [
      '49e9b8e9-3dfc-4ac8-8464-265b9cb52d23', '07df3855-e289-4809-b007-7eb586fff52a',
      'ffe81df6-9957-4ca9-982f-bbdcd663cebe', 'bd215c73-4e80-4fd7-b7b5-c04f2876deb3',
      '96eee57a-d4a3-4dac-b514-4cfa075ae8d5', 'f7bd8434-f32c-4e66-b8b2-85ccf6117de7',
      'e52296ec-5b37-4e06-ad52-ad4688455700',
    ]),
    spell: anim('spr_bsusie_spell', 82, 77, 15, [
      '1fb5fdd7-116f-472f-a06c-0c284426c009', '983a2b13-310e-4337-9878-3e4965eb4e6e',
      'ccb5a6d5-dfb6-41ba-9601-524bb3ee72f2', '2e54a62f-8b88-4d5e-993f-0e3ff7029f5a',
      '35b7a4bb-97a8-4f6e-8834-645b83ccd3de', 'c0b82c17-dfc1-4b34-aa70-04177d253dcb',
      '617d4391-99c5-478d-946c-0435cddf3550', '3c4d1d5e-4d71-48ac-9fd7-d4b2f7c92f0b',
    ]),
    item: anim('spr_bsusie_item', 55, 45, 15, [
      '0631daea-1f81-467c-b3c9-9a80cf89c7e8', '0d7faad6-6336-4f87-88da-ac985b084c13',
      '292cb1ad-ec31-4f3f-b60f-ba1557097546', '878786f6-3645-48af-9c00-814438c03e23',
      'b4b866c3-648c-4a0f-ab04-a2799c82901e', '1d50411a-0201-4d7b-bffe-cdadc1afe4b2',
    ]),
  },
  ralsei: {
    idle: anim('spr_bralsei_idle', 69, 47, 6, [
      'e38e59d5-8877-4125-bd1f-bf3d28f6e8f6', 'd31828af-b2d4-4199-bd6f-714576b4d13f',
      'd4ac6c28-107f-4d94-a13d-a118a750abfd', 'aa7e54bd-b2bf-4d57-ad0a-02917ee599be',
      '5a67a95e-5083-468a-b110-688135d832a8',
    ]),
    attackReady: anim('spr_bralsei_attackready', 77, 47, 1, ['08d9e793-be51-4108-be89-fc2336f94054']),
    attack: anim('spr_bralsei_attack', 77, 47, 10, [
      'f6b19062-f836-4527-9a8e-98830b7d35aa', '87174217-bfef-41e4-87b2-4b7a96cde8ee',
      '8e613215-43fb-4962-91ed-04d98c0b72f4', '84f37224-406a-4a49-9848-45359898214d',
      '0d8c8cb2-3eda-425d-9303-db3690c27ec1', '58efcd0a-b396-4710-9687-82b36f501a34',
      'f7694f42-2d02-47af-9922-6645b070f140',
    ]),
    hurt: anim('spr_bralsei_hurt', 77, 47, 1, ['0d263ff7-ae7b-4192-8a08-519840e655bd']),
    defend: anim('spr_bralsei_defend', 69, 47, 15, [
      'a662f01f-f84f-4358-96da-4de47e148754', '13dd18cd-036f-4cce-a7ed-e58f16d43b26',
      '513fc480-cdc3-4d79-81e7-699b0436e4ca', '26c86e91-d565-41bc-9949-e980c0abebbd',
      '5c845fdd-ae29-40f0-a59d-ac5c5c7645b9', '68498674-bdb4-4d8c-97e1-2394a8a5b43b',
      '1ee94c3c-9bab-46c0-800c-7831ee35a94a', '9521f5de-43b7-437c-bb30-bde41f9ad022',
    ]),
    defeat: anim('spr_bralsei_defeat', 77, 47, 1, ['a7b2017f-e8ed-46e3-8b31-0d2b633896b8']),
    act: anim('spr_bralsei_act', 69, 47, 15, [
      '60972501-e662-45b3-bf2e-ea53dca698f9', '2a8e66e3-ff17-48ed-b950-5e2be1ae2d95',
      '5dc222b7-a50e-4ca1-9f55-86d86c04a23f', '98cd81ad-1ccb-4f1c-a19b-3ff801cf6b2c',
      '518fab03-b855-43d5-a9a7-c54565e43f72', '875d7623-49d5-49f3-ba08-a09c6cc119bf',
      'ae9a68a5-ea17-409a-b8eb-4ae406a9f9bb', 'b5d809f0-129b-4f67-876e-03c0dbff9514',
      'd676d7a5-8df9-42db-b939-c148a8230425',
    ]),
    spell: anim('spr_bralsei_spell', 78, 47, 15, [
      'a059f0bf-4e1b-4f6e-950e-7c2b836d4e4b', 'bc3d43cd-4d72-475f-8c0a-4ec62b3c1d10',
      'c465d012-358c-4ea1-a719-30ccfa32714a', 'e5bcf840-9e3a-48cd-b863-e85e33f82b1b',
      '63c7b5c6-1eca-4276-8d59-6b0969db2b9f', '995c53eb-5768-4d1c-a297-92255f7d168b',
      '27904d39-25f3-4ac2-a357-4dfaeb090d2d', '0544a85f-894a-4d98-a8c1-87c830be4fd6',
    ]),
    item: anim('spr_bralsei_item', 74, 55, 15, [
      '57285612-fd5c-4a42-9891-e524bf278f87', '7b380ae9-d72a-47ea-a665-6794f2e5616f',
      '0e3249a5-03e9-431e-8117-cc78bca64ed8', '76fc4d3a-3621-4cb5-8ea3-0759cf1e5f01',
      '9fd4ece7-d74c-4d60-8604-8b4475192db7', '2d2217a3-9856-481e-a3ae-9d8ac1ee1972',
      '213ccce9-cd7d-4cf2-9a17-061d93544c2a',
    ]),
  },
} as const;

/** 戦闘UIパーツ。コマンドボタン（日本語版）は frame0=通常（橙）/ frame1=選択中（黄）。 */
export const TLDR_UI_SPRITES = {
  btFight: anim('spr_ui_enc_bt_fight_ja', 31, 32, 1, ['81aedb78-3c20-4c03-8d71-e7423d921278', 'f73a8c2d-9f96-4373-936e-25636d3e0601']),
  btAct: anim('spr_ui_enc_bt_act_ja', 31, 32, 1, ['c70aa009-0e83-444b-99a1-27aceed77151', 'b3aeb782-8f90-4158-82a7-e9bad191b03b']),
  btPower: anim('spr_ui_enc_bt_power_ja', 31, 32, 1, ['0a3a8edf-00e8-410f-9277-1b312ef8c2f6', '4a11978a-f9ef-4015-ba95-d8083155637b']),
  btItem: anim('spr_ui_enc_bt_item_ja', 31, 32, 1, ['b79e83ea-970d-4d30-bb28-94490577f9ba', 'ef108a79-d401-49cc-a673-17a635ace7bf']),
  btSpare: anim('spr_ui_enc_bt_spare_ja', 31, 32, 1, ['887c5c8c-f7aa-48b7-8e79-0b16a9ff144c', '2e77e319-1b59-4a0b-9405-5f99a657820e']),
  btDefend: anim('spr_ui_enc_bt_defend_ja', 31, 32, 1, ['82ee5c2e-d5d5-4517-9771-1cd8378a1cff', '2caa8fb1-0d79-41bc-ae4a-1bd2f1ec4597']),
  soulCursor: anim('spr_uisoul', 16, 16, 1, ['9e060760-3c10-4460-8e56-44c785b000b9']),
  spareStar: anim('spr_ui_enc_sparestar', 16, 16, 1, ['eb3f1425-acf6-4bef-9c5a-8908f186cf22']),
} as const;

/** パーティメンバーの顔アイコン（ステータスボックス用）とメンバーカラー（GameMaker の c_aqua/c_fuchsia/c_lime）。 */
export const TLDR_PARTY_UI = {
  kris: {
    color: '#00ffff',
    icon: anim('spr_ui_kris_icon', 35, 24, 1, ['e66ea8cc-a921-4325-b182-cd6542539bfc']),
    iconHurt: anim('spr_ui_kris_icon_hurt', 35, 24, 1, ['cde59eea-67b2-4e64-8427-c099ff8f8d99']),
  },
  susie: {
    color: '#ff00ff',
    icon: anim('spr_ui_susie_icon', 35, 24, 1, ['a0464309-00e5-455a-845d-e0034e85ea29']),
    iconHurt: anim('spr_ui_susie_icon_hurt', 35, 24, 1, ['cde59eea-67b2-4e64-8427-c099ff8f8d99']),
  },
  ralsei: {
    color: '#00ff00',
    icon: anim('spr_ui_ralsei_icon', 35, 24, 1, ['3e538a2a-b8bf-4181-ab34-b39615e068d5']),
    iconHurt: anim('spr_ui_ralsei_icon_hurt', 36, 24, 1, ['cde59eea-67b2-4e64-8427-c099ff8f8d99']),
  },
} as const;

/** 敵のバトルスプライト（tlDR Engine に収録されている Deltarune 敵はウイルスくんのみ）。 */
export const TLDR_ENEMY_SPRITES = {
  virovirokun: {
    idle: anim('spr_e_virovirokun_idle', 48, 58, 6, [
      '0b315709-97a6-4f85-be60-a8408df38638', '343be061-6c1a-4ec7-b892-658a29edaa5b',
      '799b8847-814c-4502-a493-0dfc6cf4adb9', '749eae06-df55-43f4-bd6f-06b3009a99ee',
      'ed93f4a6-955f-4113-8a3c-f9319376abe1', 'd4e45f63-f354-470d-bb83-7ffe2baf469e',
    ]),
    hurt: anim('spr_e_virovirokun_hurt', 43, 53, 1, ['15a14024-0811-41da-8688-6c70a5451fe6']),
    spare: anim('spr_e_virovirokun_spare', 40, 51, 1, ['6ccf22cf-a943-4664-b153-846699590af6']),
  },
} as const;
