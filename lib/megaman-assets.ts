// megamanjs（pomle/megamanjs, ロックマン2 WebGLファンリメイク）の音源。
// GitHub raw CDN で直接配信されている .ogg を利用する。
// リポジトリにライセンス表記なし。SEはオリジナル実装音、BGMはCapcomロックマン2楽曲の抽出のため、商用利用は避け素材出典として明記すること。
const MEGAMANJS_CDN = 'https://raw.githubusercontent.com/pomle/megamanjs/master/public/resource';

/** ステージBGM（.ogg）。 */
export const MEGAMAN_MUSIC = {
  airman: 'levels/airman/music.ogg',
  bubbleman: 'levels/bubbleman/music.ogg',
  crashman: 'levels/crashman/music.ogg',
  flashman: 'levels/flashman/music.ogg',
  heatman: 'levels/heatman/music.ogg',
  metalman: 'levels/metalman/music.ogg',
  quickman: 'levels/quickman/music.ogg',
  woodman: 'levels/woodman/music.ogg',
  stageSelect: 'stage-select/wait-music.ogg',
  intro: 'intro/intro.ogg',
} as const;

/** 効果音（.ogg）。 */
export const MEGAMAN_SFX = {
  shot: 'characters/megaman/plasma.ogg',
  airShot: 'characters/megaman/airshot.ogg',
  metalBlade: 'characters/megaman/metalblade.ogg',
  jump: 'characters/megaman/jump-land.ogg',
  damage: 'characters/megaman/damage.ogg',
  death: 'characters/megaman/death.ogg',
  teleportIn: 'characters/megaman/teleport-in.ogg',
  teleportOut: 'characters/megaman/teleport-out.ogg',
  explosion: 'explosion.ogg',
  hit: 'hit.ogg',
  energyFill: 'energy-fill.ogg',
  crashBombAttach: 'crash-bomb-attach.ogg',
  stageChangeSelection: 'stage-select/change-selection.ogg',
  stageMakeSelection: 'stage-select/make-selection.ogg',
  bossReveal: 'stage-select/boss-reveal.ogg',
} as const;

export type MegamanMusicKey = keyof typeof MEGAMAN_MUSIC;
export type MegamanSfxKey = keyof typeof MEGAMAN_SFX;

export function megamanMusicUrl(key: MegamanMusicKey): string {
  return `${MEGAMANJS_CDN}/${MEGAMAN_MUSIC[key]}`;
}

export function megamanSfxUrl(key: MegamanSfxKey): string {
  return `${MEGAMANJS_CDN}/${MEGAMAN_SFX[key]}`;
}
