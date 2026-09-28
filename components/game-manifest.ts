// ゲームの保存マニフェスト（GameManifestDraft）と、編集用データ（PresetData）との相互変換。
// GameMaker.tsx から切り出したもの：React に依存しない純粋な変換だけを置く（単体で往復を検証できるように）。
// docs/game-feature-design.md §4

import { bgmRefToAsset, imageRefToUrl } from "@/lib/asset-ref";
import {
	createEngineTemplate,
	isEngineKind,
	isSamplePresetId,
	PRESETS,
} from "./game-presets";
import type {
	BattleConfig,
	BgmState,
	DeathScreenConfig,
	EffectPreset,
	EndingScreenConfig,
	EngineKind,
	EquipmentDef,
	ItemDef,
	Layout25D,
	MvAudioMode,
	ObjectDef,
	PlayerDef,
	PresetData,
	PresetId,
	SceneDef,
	ScreenTint,
	SfxRef,
	SfxTrigger,
	StagePhase,
	SwitchDef,
	TileDef,
	TitleScreenConfig,
	WeatherDef,
} from "./game-presets/shared";

/** 保存用マニフェスト（テキスト/参照のみ）。docs/game-feature-design.md §4
 *
 *  preset は見本プリセットのIDか 'blank'（まっさらテンプレートから作ったゲーム）。
 *  読み込み時、見本のIDならその見本を、それ以外（'blank'・削除済みの古いID）なら engine の
 *  まっさらテンプレートを土台にして、マニフェストに無い項目だけを土台で補う。
 *
 *  battle / ending / titleScreen / deathScreen / phases / weather / screenTint / scroll、プレイヤーの
 *  airSpriteRef / landSpriteRefs は「無い」を null で明示する（buildGameManifest が必ず書く）。
 *  null＝このゲームには無い。キー自体が無いときだけ（古い保存データ）土台の値で補う。
 *  undefined のまま書くと JSON から消えて「キーが無い」と区別できず、見本の戦闘やエンディングが
 *  外したはずなのに読み込み時に復活してしまう。
 *  プレイヤーは player があれば土台と混ぜない（必須項目だけ土台で補う。manifestToPresetData 参照）。 */
export interface GameManifestDraft {
	preset: PresetId;
	engine: EngineKind;
	name: string;
	gravity: number;
	friction: number;
	/** つるつる床の強制スライド速度（px/frame）。未指定時は既定値。 */
	iceSlideSpeed?: number;
	/** 表示URL（spriteUrl）を除いたプレイヤー定義。 */
	player: Omit<PlayerDef, "spriteUrl" | "airSpriteRef" | "landSpriteRefs"> & {
		/** null＝空中コマ無し（キーが無いときだけ土台で補う）。 */
		airSpriteRef?: string | null;
		/** null＝着地コマ無し（キーが無いときだけ土台で補う）。 */
		landSpriteRefs?: string[] | null;
	};
	/** タイル定義。imageUrl は imageRef が無いとき（直URL）だけ保存する。 */
	tiles: Record<number, TileDef>;
	map: number[][];
	overlayMap?: number[][];
	overheadMap?: number[][];
	/** null＝天候無し（キーが無いときだけ土台で補う）。 */
	weather?: WeatherDef | null;
	/** null＝画面の色味無し（キーが無いときだけ土台で補う）。 */
	screenTint?: ScreenTint | null;
	objects: Array<Omit<ObjectDef, "spriteUrl">>;
	bgm: string;
	battleBgm?: string;
	bossBgm?: string;
	/** MML BGMの鳴らし方（ゲーム全体で1つ）。省略時は軽量な内蔵シンセ（"light"）。 */
	mmlAudioMode?: MvAudioMode;
	sfx: Partial<Record<SfxTrigger, string>>;
	mapBgRef?: string;
	/** null＝スクロール無し＝マップが1画面（キーが無いときだけ土台で補う）。 */
	scroll?: { worldCols: number; worldRows?: number } | null;
	switches?: SwitchDef[];
	items?: ItemDef[];
	weapons?: EquipmentDef[];
	armors?: EquipmentDef[];
	/** 汎用エフェクトアニメーション一覧。imageUrl は post: 参照の解決済みキャッシュのため保存しない。 */
	effects?: Array<Omit<EffectPreset, "imageUrl"> & { imageUrl?: string }>;
	/** null＝フェーズ無し（キーが無いときだけ土台で補う）。 */
	phases?: StagePhase[] | null;
	/** null＝タイトル画面無し（キーが無いときだけ土台で補う）。 */
	titleScreen?: Omit<TitleScreenConfig, "bgUrl"> | null;
	/** null＝エンディング画面無し（キーが無いときだけ土台で補う）。 */
	ending?: Omit<EndingScreenConfig, "bgUrl"> | null;
	/** null＝やられ画面無し（キーが無いときだけ土台で補う）。 */
	deathScreen?: DeathScreenConfig | null;
	/** 2.5Dエンジン（yume25d）のレイアウト。 */
	layout25d?: Layout25D;
	/** 3D MMOエンジン（mmo3d）の設定。renderer未指定時は'three'。 */
	mmo3dConfig?: PresetData["mmo3dConfig"];
	/** シーン切り替えモード。各シーンのオブジェクトは spriteUrl を除く。 */
	scenes?: Array<
		Omit<SceneDef, "objects" | "bgm"> & {
			objects: Array<Omit<ObjectDef, "spriteUrl">>;
			bgm?: string;
		}
	>;
	/** null＝戦闘無し（キーが無いときだけ土台で補う）。 */
	battle?: BattleConfig | null;
}

/** 保存マニフェストは表示URLを持たないため、URL由来の参照(url:/walk:...:u:)だけロード時に復元する。
 *  post: 等の投稿参照は解決不能なので undefined のまま（従来挙動）。 */
export const hydrateUrlFromRef = (ref?: string): string | undefined => {
	if (!ref) return undefined;
	const url = imageRefToUrl(ref);
	return url &&
		(url.startsWith("http") || url.startsWith("/") || url.startsWith("data:"))
		? url
		: undefined;
};

/** 保存された BGM の参照から再生用の BgmState を組み立てる。
 *  解釈は bgmRefToAsset に任せる（`#loop=…&vol=…` の再生パラメータを src に混ぜない・
 *  `https://www.youtube.com/…` のような scheme 無しの URL もそのまま読める）。
 *  src を作れない参照（投稿 MML・ニコニコ等）は ref だけ返し、再生側が bgmRefToAsset で読み直す。 */
export const hydrateBgmFromRef = (ref?: string): BgmState | undefined => {
	if (!ref || ref === "none") return undefined;
	const asset = bgmRefToAsset(ref);
	if (
		asset &&
		(asset.type === "youtube" || asset.type === "mml" || asset.type === "direct")
	) {
		return { ref, type: asset.type, src: asset.src };
	}
	return { ref };
};

/** 保存された効果音の参照（ref 文字列）から再生用の SfxRef を組み立てる。
 *  マニフェストには ref しか残らないので、src/type を戻さないと playSfx が黙って何も鳴らさない。 */
export const hydrateSfxFromRef = (ref: string): SfxRef => {
	const asset = bgmRefToAsset(ref);
	if (
		asset &&
		(asset.type === "direct" || asset.type === "mml" || asset.type === "youtube")
	) {
		return { ref, src: asset.src, type: asset.type };
	}
	return { ref };
};

/** map と同サイズの空グリッド（overlayMap / overheadMap の既定値）を作る。 */
export const emptyGridLike = (map: number[][]): number[][] =>
	map.map((row) => new Array(row.length).fill(0));

const clonePreset = (d: PresetData): PresetData =>
	JSON.parse(JSON.stringify(d));

/** obj から key を除いた浅いコピー（表示用に解決済みのURLを保存データから外すのに使う）。 */
const without = <T extends object, K extends keyof T>(
	obj: T,
	key: K,
): Omit<T, K> => {
	const copy = { ...obj };
	delete copy[key];
	return copy;
};

/** 省略可能なマニフェスト項目の読み方（D3）：null＝「無い」、キーが無い（undefined）＝土台で補う。 */
const manifestOr = <T>(
	value: T | null | undefined,
	fallback: T | undefined,
): T | undefined =>
	value === null ? undefined : value === undefined ? fallback : value;

/** タイトル／エンディング画面の背景の表示URLを参照から戻す（保存時に bgUrl を落としているため）。
 *  url: / tile: のように参照だけで解決できるものに限る（post: などは従来どおり undefined）。 */
const withBgUrl = <T extends { bgRef?: string; bgUrl?: string }>(
	screen: T | undefined,
): T | undefined =>
	screen
		? { ...screen, bgUrl: screen.bgUrl ?? hydrateUrlFromRef(screen.bgRef) }
		: screen;

/** マニフェストの player から PlayerDef を組み立てる。
 *  player があるときは土台（見本）の任意項目を混ぜない：spriteRef・minecraftSkin・ボムやカットインの
 *  設定などは、外したときに JSON からキーごと消えるので、混ぜると見本の値が読み込み時に復活してしまう
 *  （見本のキャラの歩行グラが、絵文字に替えたはずのゲームに戻ってくる、等）。
 *  壊れた／古いマニフェストでも動くよう、必須の項目だけは土台で補う。 */
const playerFromManifest = (
	mp: GameManifestDraft["player"] | undefined,
	base: PlayerDef,
): PlayerDef => {
	if (!mp) return base;
	const { airSpriteRef, landSpriteRefs, ...rest } = mp;
	return {
		...rest,
		emoji: rest.emoji ?? base.emoji,
		color: rest.color ?? base.color,
		speed: rest.speed ?? base.speed,
		jumpPower: rest.jumpPower ?? base.jumpPower,
		w: rest.w ?? base.w,
		h: rest.h ?? base.h,
		start: rest.start ?? base.start,
		spriteUrl: hydrateUrlFromRef(mp.spriteRef),
		airSpriteRef: airSpriteRef ?? undefined,
		landSpriteRefs: landSpriteRefs ?? undefined,
	};
};

/** 保存/エクスポートされたマニフェストから編集用 PresetData を再構築する
 *  （既存ゲームの初期ロード・履歴復元・JSONインポートの共通処理）。
 *  土台は preset が見本ならその見本、'blank' や見本に無いID（削除済みの古い見本など）なら
 *  engine のまっさらテンプレート。欠けている項目は土台の値で補い、古い/部分的なマニフェストでも読み込めるようにする。 */
export const manifestToPresetData = (
	manifest: GameManifestDraft,
): { presetId: PresetId; data: PresetData } => {
	const presetId: PresetId = isSamplePresetId(manifest.preset)
		? manifest.preset
		: "blank";
	// 投稿されたマニフェストは誰でも書けるので、engine も知っている名前かどうか確かめる
	// （'constructor' などを素通しすると土台づくりで落ち、閲覧者のページごと止まる）。
	const engine = isEngineKind(manifest.engine) ? manifest.engine : undefined;
	const base =
		presetId === "blank"
			? createEngineTemplate(engine ?? "rpg")
			: clonePreset(PRESETS[presetId]);
	const map = manifest.map ?? base.map;
	const data: PresetData = {
		...base,
		engine: engine ?? base.engine,
		name: manifest.name ?? base.name,
		gravity: manifest.gravity ?? base.gravity,
		friction: manifest.friction ?? base.friction,
		iceSlideSpeed: manifest.iceSlideSpeed ?? base.iceSlideSpeed,
		player: playerFromManifest(manifest.player, base.player),
		tiles: manifest.tiles
			? Object.fromEntries(
					Object.entries(manifest.tiles).map(([k, t]) => [
						k,
						// 保存された imageUrl は「imageRef からは復元できない表示URL」なのでそちらを優先する
						{ ...t, imageUrl: t.imageUrl ?? hydrateUrlFromRef(t.imageRef) },
					]),
				)
			: base.tiles,
		map,
		overlayMap: manifest.overlayMap ?? emptyGridLike(map),
		overheadMap: manifest.overheadMap ?? emptyGridLike(map),
		weather: manifestOr(manifest.weather, base.weather),
		screenTint: manifestOr(manifest.screenTint, base.screenTint),
		objects: (manifest.objects ?? []).map((o) => ({
			...o,
			spriteUrl: hydrateUrlFromRef(o.spriteRef),
		})),
		mapBgRef: manifest.mapBgRef,
		mapBgUrl: hydrateUrlFromRef(manifest.mapBgRef),
		scroll: manifestOr(manifest.scroll, base.scroll),
		switches: manifest.switches ?? base.switches,
		items: manifest.items ?? base.items,
		weapons: manifest.weapons ?? base.weapons,
		armors: manifest.armors ?? base.armors,
		effects: (manifest.effects ?? base.effects)?.map((ef) => ({
			...ef,
			imageUrl: ef.imageRef?.startsWith("url:")
				? (imageRefToUrl(ef.imageRef) ?? undefined)
				: (hydrateUrlFromRef(ef.imageRef) ?? ef.imageUrl),
		})),
		phases: manifestOr(manifest.phases, base.phases),
		titleScreen: withBgUrl(manifestOr(manifest.titleScreen, base.titleScreen)),
		ending: withBgUrl(manifestOr(manifest.ending, base.ending)),
		deathScreen: manifestOr(manifest.deathScreen, base.deathScreen),
		battle: manifestOr(manifest.battle, base.battle),
		layout25d: manifest.layout25d ?? base.layout25d,
		mmo3dConfig: manifest.mmo3dConfig ?? base.mmo3dConfig,
		scenes: manifest.scenes?.map((s) => ({
			...s,
			overheadMap: s.overheadMap ?? emptyGridLike(s.map),
			objects: (s.objects ?? []).map((o) => ({
				...o,
				spriteUrl: hydrateUrlFromRef(o.spriteRef),
			})),
			bgm: hydrateBgmFromRef(s.bgm),
		})),
		bgm: hydrateBgmFromRef(manifest.bgm),
		battleBgm: hydrateBgmFromRef(manifest.battleBgm),
		bossBgm: hydrateBgmFromRef(manifest.bossBgm),
		mmlAudioMode: manifest.mmlAudioMode ?? base.mmlAudioMode,
		sfx: Object.fromEntries(
			Object.entries(manifest.sfx ?? {}).map(([k, v]) => [
				k,
				v ? hydrateSfxFromRef(v) : undefined,
			]),
		) as PresetData["sfx"],
	};
	return { presetId, data };
};

/** タイルの imageUrl のうち、保存しないと読み込み時に復元できないものだけを返す（buildGameManifest 参照）。 */
const tileImageUrlToSave = (t: TileDef): string | undefined => {
	if (!t.imageRef) return t.imageUrl;
	const fromRef = hydrateUrlFromRef(t.imageRef);
	return fromRef !== undefined && t.imageUrl && fromRef !== t.imageUrl
		? t.imageUrl
		: undefined;
};

/** 編集中の PresetData を保存用マニフェストへ（投稿・履歴・自動保存・JSONエクスポートの共通処理）。
 *  表示用に解決済みのURL（spriteUrl / 投稿参照以外の imageUrl / bgUrl / BGM・SE の src）は落とし、
 *  参照だけを残す。プレイヤー・タイル・オブジェクト・シーンは「表示URL以外は全部」を書く
 *  （項目を足したときに保存漏れで黙って消えないように、列挙ではなく除外で書く）。 */
export const buildGameManifest = (
	gameData: PresetData,
	title: string,
): GameManifestDraft => {
	const player = without(gameData.player, "spriteUrl");
	return {
		preset: gameData.id,
		engine: gameData.engine,
		name: title.trim() || gameData.name,
		gravity: gameData.gravity,
		friction: gameData.friction,
		iceSlideSpeed: gameData.iceSlideSpeed,
		player: {
			...player,
			airSpriteRef: player.airSpriteRef ?? null,
			landSpriteRefs: player.landSpriteRefs?.length ? player.landSpriteRefs : null,
			// false も書く（未指定だと土台＝見本の true が読み込み時に復活する）
			companionLight: !!player.companionLight,
		},
		tiles: Object.fromEntries(
			Object.entries(gameData.tiles).map(([k, t]) => [
				k,
				{
					...t,
					// imageUrl は基本的に imageRef から復元できるので保存しない。保存するのは
					// - imageRef が無い（RPGEN インポート等で直 URL が入っている）とき
					// - imageRef から復元した URL と違う（`url:<シート>` ＋ imageUrl に `#x,y,w,h` の切り出し、等）とき
					//   ＝落とすと読み込み後にシート全体が1マスに描かれてしまう
					// post: 参照は復元できない（undefined）が、従来どおり解決済みURLは保存しない。
					imageUrl: tileImageUrlToSave(t),
				},
			]),
		),
		map: gameData.map,
		overlayMap: gameData.overlayMap,
		overheadMap: gameData.overheadMap,
		weather: gameData.weather ?? null,
		screenTint: gameData.screenTint ?? null,
		objects: gameData.objects.map((o) => without(o, "spriteUrl")),
		mapBgRef: gameData.mapBgRef,
		// null＝1画面のマップ（マップを縮めると scroll は外れる。書かないと見本の広さが読み込み時に戻り、
		// 20マスのマップに 96マス分のカメラ・当たり範囲が付く）
		scroll: gameData.scroll ?? null,
		bgm: gameData.bgm?.ref || "none",
		battleBgm: gameData.battleBgm?.ref,
		bossBgm: gameData.bossBgm?.ref,
		mmlAudioMode: gameData.mmlAudioMode,
		sfx: Object.fromEntries(
			Object.entries(gameData.sfx).map(([k, v]) => [k, v?.ref]),
		) as Partial<Record<SfxTrigger, string>>,
		switches: gameData.switches,
		items: gameData.items,
		weapons: gameData.weapons,
		armors: gameData.armors,
		effects: gameData.effects?.map((ef) => ({
			id: ef.id,
			name: ef.name,
			imageRef: ef.imageRef,
			// url: 参照は自己解決可能なので imageUrl は保存しない（post: の場合のみキャッシュとして保存）。
			imageUrl: ef.imageRef.startsWith("url:") ? undefined : ef.imageUrl,
			frameCount: ef.frameCount,
			fps: ef.fps,
			sfx: ef.sfx,
		})),
		// battle / ending / titleScreen / deathScreen / phases は「無い」を null で明示する（undefined だと
		// JSON からキーごと消え、読み込み時に土台＝見本の値で補われて、外したはずの戦闘等が復活する）。
		phases: gameData.phases ?? null,
		titleScreen: gameData.titleScreen
			? without(gameData.titleScreen, "bgUrl")
			: null,
		ending: gameData.ending ? without(gameData.ending, "bgUrl") : null,
		deathScreen: gameData.deathScreen ?? null,
		battle: gameData.battle ?? null,
		layout25d: gameData.layout25d,
		mmo3dConfig: gameData.mmo3dConfig,
		scenes: gameData.scenes?.map(({ objects, bgm, ...s }) => ({
			...s,
			objects: objects.map((o) => without(o, "spriteUrl")),
			bgm: bgm?.ref,
		})),
	};
};
