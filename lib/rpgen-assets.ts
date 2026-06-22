// RPGen Search（https://rpgen-search.pages.dev）のアセットをアプリから扱うためのクライアント。
//
// - 検索系の JSON API は自前プロキシ（/api/rpgen/*）経由で叩く（認証トークンはサーバー側で付与）。
// - 画像/音声の実体は CDN を直リンク（<img>/<audio> でそのまま読める。CORS は許可済み）。
//
// 参照: tmp/asset_collect_guide.md, rpgen-crawler/deploy/api

const PROXY = '/api/rpgen';

// ───────────────── アセット実体URL ─────────────────
// 自前プロキシ(/api/rpgen/data/...)経由。上流CDNがCORSを返さないため、
// 同一オリジン化して crossOrigin 画像・canvas書き出しを安全にする（route.ts 参照）。

/** 単体スプライト（16x16 ドット絵）。`no` は /api/sprites の no。 */
export const spriteUrl = (no: number) => `${PROXY}/data/images/sprites/${no}.png`;

/** スプライトアニメ/歩行シート（例 32x64 = 2フレーム×4方向）。`no` は /api/sprite-anims の no。 */
export const sAnimUrl = (no: number) => `${PROXY}/data/images/sAnims/${no}.png`;

/** 効果音/BGM（mp3）。`no` は /api/sounds の no。 */
export const soundUrl = (no: number) => `${PROXY}/data/audio/sound/${no}.mp3`;

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
  name: string;
  comment: string;
  image_path: string;
  author_site?: string;
  rgb_r_median?: number;
  rgb_g_median?: number;
  rgb_b_median?: number;
}

export interface SpriteAnimItem {
  no: number;
  name: string;
  comment: string;
  image_path: string;
  author_site?: string;
  rgb_r_median?: number;
  rgb_g_median?: number;
  rgb_b_median?: number;
}

export interface SoundItem {
  no: number;
  title: string;
  comment: string;
  category1: number;
  category2: number;
  file_size: number;
}

// 人間がまとめたスプライトのコレクション（カテゴリ）。sprite_ids がメンバーのスプライト番号。
export interface SpriteSheetItem {
  no: number;
  name: string;
  comment: string;
  author_site?: string;
  sprite_ids: number[];
}

export interface SearchParams {
  q?: string;
  page?: number;
  limit?: number;
  category1?: number;
  category2?: number;
  signal?: AbortSignal;
}

// ───────────────── 検索（プロキシ経由） ─────────────────

async function get<T>(endpoint: string, params: SearchParams = {}): Promise<RpgenList<T>> {
  const usp = new URLSearchParams();
  if (params.q?.trim()) usp.set('q', params.q.trim());
  if (params.page) usp.set('page', String(params.page));
  usp.set('limit', String(params.limit ?? 60));
  if (params.category1 != null) usp.set('category1', String(params.category1));
  if (params.category2 != null) usp.set('category2', String(params.category2));
  const res = await fetch(`${PROXY}/${endpoint}?${usp.toString()}`, { signal: params.signal });
  if (!res.ok) throw new Error(`rpgen ${endpoint} ${res.status}`);
  return res.json();
}

export const searchSprites = (p?: SearchParams) => get<SpriteItem>('sprites', p);
export const searchSpriteAnims = (p?: SearchParams) => get<SpriteAnimItem>('sprite-anims', p);
export const searchSounds = (p?: SearchParams) => get<SoundItem>('sounds', p);
/** 人間がまとめたスプライトシート（カテゴリ）一覧。`/api/sheets/sprite` */
export const searchSpriteSheets = (p?: SearchParams) => get<SpriteSheetItem>('sheets/sprite', p);
