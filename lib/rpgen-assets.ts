// RPGen Search（https://rpgen-search.pages.dev）のアセットをアプリから扱うためのクライアント。
//
// - 検索系の JSON API は自前プロキシ（/api/rpgen/*）経由で叩く（認証トークンはサーバー側で付与）。
// - 画像/音声の実体は CDN を直リンク（<img>/<audio> でそのまま読める。CORS は許可済み）。
//
// 参照: tmp/asset_collect_guide.md, rpgen-crawler/deploy/api

const CDN = "https://rpgen-search.pages.dev";
const PUBLIC_TOKEN = process.env.NEXT_PUBLIC_RPGEN_SEARCH_TOKEN || "";

// ───────────────── アセット実体URL ─────────────────
// rpgen-search.pages.dev はCORSヘッダーを返すため直リンクで安全に扱える。
//
// 重要: 実体ファイル名は API の `id`（image_path のハッシュ、例 'YUmdEb'）で決まる。
// 旧来の `${no}.png` 方式は廃止され、no とファイル名は完全に分離した
// （`/sprites/999.png` は無関係な古い画像を返す）。必ず検索結果の `id` を渡すこと。

/** 単体スプライト（16x16 ドット絵）。`id` は /api/sprites の id。 */
export const spriteUrl = (id: string) => `${CDN}/data/images/sprites/${id}.png`;

/** スプライトアニメ/歩行シート（例 32x64 = 2フレーム×4方向）。`id` は /api/sprite-anims の id。 */
export const sAnimUrl = (id: string) => `${CDN}/data/images/sAnims/${id}.png`;

/** 効果音/BGM（mp3）。`id` は /api/sounds の id。 */
export const soundUrl = (id: string) => `${CDN}/data/audio/sound/${id}.mp3`;

// ───────────────── 型 ─────────────────

export interface RpgenMeta {
	total: number;
	page: number;
	limit: number;
	pages: number;
}
export interface RpgenList<T> {
	data: T[];
	meta: RpgenMeta;
}

export interface SpriteItem {
	no: number;
	id: string;
	name: string;
	comment: string;
	image_path?: string;
	author_site?: string;
	rgb_r_median?: number;
	rgb_g_median?: number;
	rgb_b_median?: number;
}

export interface SpriteAnimItem {
	no: number;
	id: string;
	name: string;
	comment: string;
	image_path?: string;
	author_site?: string;
	rgb_r_median?: number;
	rgb_g_median?: number;
	rgb_b_median?: number;
}

export interface SoundItem {
	no: number;
	id: string;
	title: string;
	comment: string;
	category1: number;
	category2: number;
	file_size: number;
}

/** スプライトシートのメンバー（id が実体ファイル名=key。no/name は含まれない）。 */
export interface SpriteSheetMember {
	id: string;
}

// 人間がまとめたスプライトのコレクション（カテゴリ）。sprite_ids がメンバー。
export interface SpriteSheetItem {
	no: number;
	id: string;
	name: string;
	comment: string;
	author_site?: string;
	sprite_ids: SpriteSheetMember[];
}

/** スプライトアニメシートのメンバー（id が実体ファイル名）。 */
export interface SAnimSheetMember {
	id: string;
}

/** 人間がまとめた歩行グラコレクション。anim_ids がメンバー。 */
export interface SAnimSheetItem {
	no: number;
	id: string;
	name: string;
	comment: string;
	author_site?: string;
	anim_ids: SAnimSheetMember[];
}

/** 効果音シートのメンバー（id が実体ファイル名）。 */
export interface SoundSheetMember {
	id: string;
}

/** 人間がまとめた効果音コレクション。sound_ids がメンバー。 */
export interface SoundSheetItem {
	no: number;
	id: string;
	name: string;
	comment: string;
	author_site?: string;
	sound_ids: SoundSheetMember[];
}

export interface SearchParams {
	q?: string;
	page?: number;
	limit?: number;
	category1?: number;
	category2?: number;
	signal?: AbortSignal;
}

// ───────────────── 検索（フロントエンド直叩き） ─────────────────

async function get<T>(
	endpoint: string,
	params: SearchParams = {},
): Promise<RpgenList<T>> {
	const usp = new URLSearchParams();
	if (params.q?.trim()) usp.set("q", params.q.trim());
	if (params.page) usp.set("page", String(params.page));
	usp.set("limit", String(params.limit ?? 60));
	if (params.category1 != null) usp.set("category1", String(params.category1));
	if (params.category2 != null) usp.set("category2", String(params.category2));
	const res = await fetch(`${CDN}/api/rpgen/${endpoint}?${usp.toString()}`, {
		headers: { Authorization: `Bearer ${PUBLIC_TOKEN}` },
		signal: params.signal,
	});
	if (!res.ok) throw new Error(`rpgen ${endpoint} ${res.status}`);
	return res.json();
}

export const searchSprites = (p?: SearchParams) =>
	get<SpriteItem>("sprites", p);
export const searchSpriteAnims = (p?: SearchParams) =>
	get<SpriteAnimItem>("sprite-anims", p);
export const searchSounds = (p?: SearchParams) => get<SoundItem>("sounds", p);
/** 人間がまとめたスプライトシート（カテゴリ）一覧。`/api/sheets/sprite` */
export const searchSpriteSheets = (p?: SearchParams) =>
	get<SpriteSheetItem>("sheets/sprite", p);
/** 人間がまとめた歩行グラセット一覧。`/api/sheets/sanim` */
export const searchSAnimSheets = (p?: SearchParams) =>
	get<SAnimSheetItem>("sheets/sanim", p);
/** 人間がまとめた効果音セット一覧。`/api/sheets/sound` */
export const searchSoundSheets = (p?: SearchParams) =>
	get<SoundSheetItem>("sheets/sound", p);

// ───────────────── 単体詳細（フロントエンド直叩き） ─────────────────
// `sheets/*` のメンバー配列は `{id}` のみ（name等は含まれない）。名前を出すには
// メンバーの id ごとに単体詳細（GET /sprites/:id 等）を引く必要がある。

async function getById<T>(
	endpoint: string,
	id: string,
	signal?: AbortSignal,
): Promise<T | null> {
	try {
		const res = await fetch(
			`${CDN}/api/rpgen/${endpoint}/${encodeURIComponent(id)}`,
			{
				headers: { Authorization: `Bearer ${PUBLIC_TOKEN}` },
				signal,
			},
		);
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}

export const getSpriteById = (id: string, signal?: AbortSignal) =>
	getById<SpriteItem>("sprites", id, signal);
export const getSpriteAnimById = (id: string, signal?: AbortSignal) =>
	getById<SpriteAnimItem>("sprite-anims", id, signal);
export const getSoundById = (id: string, signal?: AbortSignal) =>
	getById<SoundItem>("sounds", id, signal);
