// ゲームエンジン内蔵の効果音（オリジナル合成音）。
//
// 実体は scripts/make-game-sfx.mjs が矩形波・三角波・ノイズから合成して
// public/assets/game-sfx/ に書き出した WAV で、外部の音源は一切使っていない。
// エンジンは「役割」（キー）で音を引くだけなので、音を差し替えるときはスクリプト側を直して
// 作り直せばよい。ここに役割を足したらスクリプトの SOUNDS にも同名のファイルを足すこと。

const GAME_SFX_BASE = "/assets/game-sfx";

/** 役割 → ファイル名。 */
export const GAME_SFX_FILES = {
	/** メニューのカーソル移動 */
	menuMove: "menu_move.wav",
	/** メニューの決定 */
	menuConfirm: "menu_confirm.wav",
	/** メニューのキャンセル */
	menuCancel: "menu_cancel.wav",
	/** 戦闘ログの1文字ごとのタイプ音 */
	textTyper: "text_typer.wav",
	/** セリフ（フキダシ・頭上セリフ）の1文字ごとの声 */
	textVoice: "text_voice.wav",
	/** エンカウントの「！」 */
	encounter: "encounter.wav",
	/** ハートがコマンド位置へ飛ぶ／戦闘開始 */
	battleStart: "battle_start.wav",
	/** パーティ戦のエンカウント（ふくらむノイズから上がる3音） */
	encounterParty: "encounter_party.wav",
	/** 敵に攻撃が当たった */
	enemyDamage: "enemy_damage.wav",
	/** 敵が崩れて消える */
	enemyVanish: "enemy_vanish.wav",
	/** 得物を構える */
	weaponDraw: "weapon_draw.wav",
	/** 通常攻撃（斬撃） */
	slash: "slash.wav",
	/** 会心の一撃 */
	slashCritical: "slash_critical.wav",
	/** 弾をかすめた（グレイズ） */
	graze: "graze.wav",
	/** 呪文をとなえる */
	spellCast: "spell_cast.wav",
	/** 回復 */
	heal: "heal.wav",
	/** みのがした */
	spare: "spare.wav",
	/** みのがしゲージが上がった */
	mercyUp: "mercy_up.wav",
	/** ハートの射撃 */
	shoot: "shoot.wav",
	/** レベルアップ */
	levelUp: "level_up.wav",
	/** セーブ */
	save: "save.wav",
	/** 自分が被弾した */
	hurt: "hurt.wav",
	/** クリアのジングル */
	clear: "clear.wav",
	/** メッセージウィンドウ送り（メニューの決定・キャンセルの既定音も兼ねる） */
	msgAdvance: "msg_advance.wav",
	/** システム床：ワープ */
	warp: "warp.wav",
	/** システム床：ダメージ床 */
	floorDamage: "floor_damage.wav",
	/** システム床：扉 */
	door: "door.wav",
	/** 宝箱を開けた */
	chestOpen: "chest_open.wav",
	/** 食べる（2.5D の空腹ゲージ） */
	eat: "eat.wav",
	/** 高いところから着地した（2.5D） */
	land: "land.wav",
	/** エフェクト：炎 */
	effectFire: "effect_fire.wav",
	/** エフェクト：爆発 */
	effectExplosion: "effect_explosion.wav",
	/** エフェクト：風 */
	effectWind: "effect_wind.wav",
	/** エフェクト：氷 */
	effectIce: "effect_ice.wav",
	/** エフェクト：回復 */
	effectHeal: "effect_heal.wav",
} as const;

export type GameSfxKey = keyof typeof GAME_SFX_FILES;

/** エディタ（効果音ピッカーの「内蔵SE」タブ）に出す日本語名。 */
export const GAME_SFX_LABELS: Record<GameSfxKey, string> = {
	menuMove: "カーソル移動",
	menuConfirm: "決定",
	menuCancel: "キャンセル",
	textTyper: "文字送り（タイプ）",
	textVoice: "文字送り（声）",
	encounter: "「！」",
	battleStart: "戦闘開始",
	encounterParty: "エンカウント（上昇3音）",
	enemyDamage: "敵にダメージ",
	enemyVanish: "敵が消える",
	weaponDraw: "構える",
	slash: "斬撃",
	slashCritical: "会心の一撃",
	graze: "かすり",
	spellCast: "呪文",
	heal: "回復",
	spare: "みのがす",
	mercyUp: "ゲージ上昇",
	shoot: "射撃",
	levelUp: "レベルアップ",
	save: "セーブ",
	hurt: "被弾",
	clear: "クリア",
	msgAdvance: "メッセージ送り",
	warp: "ワープ",
	floorDamage: "ダメージ床",
	door: "扉",
	chestOpen: "宝箱",
	eat: "食べる",
	land: "着地",
	effectFire: "エフェクト：炎",
	effectExplosion: "エフェクト：爆発",
	effectWind: "エフェクト：風",
	effectIce: "エフェクト：氷",
	effectHeal: "エフェクト：回復",
};

/** 内蔵SEの再生用URL（アプリと同一オリジンの静的ファイル）。 */
export function gameSfxUrl(key: GameSfxKey): string {
	return `${GAME_SFX_BASE}/${GAME_SFX_FILES[key]}`;
}

/** SfxRef（components/game-presets/shared.ts）と同じ形。プリセットの sfx にそのまま入れられる。 */
export interface GameSfxRef {
	ref: string;
	src: string;
	type: "direct";
}

/** 内蔵SEを SfxRef として返す。ref は `direct:/assets/game-sfx/…` で、保存・読み込みしても同じ音に戻る。 */
export function gameSfxRef(key: GameSfxKey): GameSfxRef {
	const url = gameSfxUrl(key);
	return { ref: `direct:${url}`, src: url, type: "direct" };
}

/** 全役割の SfxRef。エンジンが既定音として鳴らすときに使う。 */
export const GAME_SFX = Object.fromEntries(
	(Object.keys(GAME_SFX_FILES) as GameSfxKey[]).map((k) => [k, gameSfxRef(k)]),
) as Record<GameSfxKey, GameSfxRef>;
