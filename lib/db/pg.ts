/**
 * unj / unj-reze DB統合後のデータアクセス層。
 *
 * unj の threads / res / users / auth_tokens を単一の正として読み書きする
 * （reze 独自の posts / anonymous_users テーブルはもう使わない）。
 *
 * ## ID方式
 * reze の Post.id はフラットな1つの数値空間だが、unj は threads.id と res.id が
 * 別個の SERIAL（衝突しうる）。奇偶合成で単一空間に写像する:
 *   OP（スレッド）  postId = threadId * 2
 *   レス            postId = res.id  * 2 + 1
 * encodeId/decodeId（lib/sqids.ts）は数値を文字列化するだけなので変更不要。
 *
 * ## ユーザー識別子
 * 「slug」は廃止。AnonymousUser.id と .slug は両方とも String(users.id)。
 * リレーションは全て users.id（数値）で行う。
 * ただし投稿（DbPost）の slug / userId を埋めるのは reze 利用者の投稿だけ
 * （isRezeAuthorRow）。users は unj と共有で、unj 純正の書き込みにまで生の users.id を
 * 付けて返すと、フィードを見るだけで unj 利用者を人単位で名寄せでき、id の総当たりで
 * 全期間の書き込みを集められる（unj が日替わりの鍵付き ID で隠しているものが reze 経由で破れる）。
 * unj 由来・システム用（users.id=1）の投稿は slug / userId が undefined で、bbsId（cc_user_id）だけ残す。
 *
 * ## content_type の変換
 * unj の content_type は単一値（画像/DTM/テキスト/…のいずれか1つ）。
 * reze の Post は content 文字列 + hasImage/hasMml 等のフラグを併せ持つ形なので、
 * 双方向に変換する（deriveDisplay / deriveInsertContent）。
 * board_id=1（うんでも実況J）は unj 純正のBBS投稿とも共存する。reze固有でない
 * content_type（Gif/Video/Audio/Game/Sns/Oekaki/Encrypt等）は本文にURLを畳み込んで
 * 表示だけは保つ（reze側にネイティブな表現が無いため）。
 *
 * ## 投票・ハート・削除トークン
 * post_votes / post_hearts は持ち込んでいない。投票は unj 方式
 * （カウンタ加算のみ + lib/security/vote-guard.ts のインメモリ重複防止）。
 * そのため getLikedPosts 等の「過去に反応した投稿一覧」は提供できない
 * （空配列を返す。DBに誰が反応したかを持たない設計上の帰結）。
 *
 * ## トランザクションについて
 * @neondatabase/serverless の HTTP fetch 経路は呼び出しごとに独立して
 * 自動コミットされ、`BEGIN`/`COMMIT` を挟んでも実際には1つの実トランザクションに
 * ならない（元の reze 実装が使っていた `getPool().connect()` も同じ制約を持つ
 * フェイクの Pool だった）。逆に言えば「1つの SQL 文」は必ず1つのトランザクションで、
 * まとめて成功するかまとめて失敗する（ローカルの pg.Pool でも同じ）。
 * 原子性が要る箇所は複数の文に分けず、CTE（WITH ... INSERT/UPDATE）で1文にする。
 * SERIAL 採番（threads.id / res.id）はDB任せにして競合を消し、
 * res.num のような手計算が要る値は UNIQUE 制約 + リトライで守る。
 * レスの採番は unj（src/server/api/res.ts）と同じくスレの行を FOR UPDATE で
 * ロックしてから取る（addReply）。unj と reze が同じスレに同時に書いても、ロックで順番に並ぶ。
 * 1文の中では res のスナップショットがロック待ちの前のままなので、番号はロックで取り直した
 * threads.res_count（unj も reze も res を入れたトランザクションの中で最大のレス番号に揃える）と
 * MAX(num) の大きい方 + 1 にする。
 */
import { neon } from "@neondatabase/serverless";
import type { Pool } from "pg";
import { genBbsId } from "@/lib/bbs/cc-id";
import { sanitizeBbsUserName } from "@/lib/bbs/user-name";
import { extractChordsFromContent } from "@/lib/mml/chord";
import type { Message, Trend } from "./mock-db";
import { extractMmlFromContent, replaceMmlWithMarker } from "@/lib/mml/mml";
import { ensureMmlExternalized } from "@/lib/mml/mml-payload";
import { isUploaderAvailable } from "@/lib/uploader";
import { RES_LIMIT } from "@/lib/bbs/thread-limits";
import { formatRelativeTime } from "@/lib/time";
import { ORIGIN_TYPE_OPTIONS } from "@/lib/types";
import type {
	AnonymousUser,
	FollowUser,
	GameVoteCandidate,
	OriginType,
} from "@/lib/types";
import type {
	DbGameRecord,
	DbMediaSearchPost,
	DbMvRecord,
	DbTalkRecord,
	DbOtomadRecord,
	DbNotification,
	DbOshiItem,
	DbPost,
} from "@/lib/types-db";
import { getVoteState } from "@/lib/security/vote-guard";
import type {
	AddOshiItemParams,
	CreateGameParams,
	CreateMvParams,
	CreateTalkParams,
	CreateOtomadParams,
	CreatePostParams,
	DataStore,
	DotMetaEdit,
	ImageDeleteRef,
	GetRepliesOptions,
	MessageParams,
	MmlRef,
	RecordGamePlayParams,
	ReplyParams,
	ReportParams,
	UpdateGameParams,
	UpdateMvParams,
	UpdateTalkParams,
	UpdateOtomadParams,
} from "./interface";
import { REPLIES_PAGE_SIZE } from "./interface";

function getConnectionString() {
	return process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "";
}

function getDb() {
	return neon(getConnectionString(), { fullResults: true });
}

/**
 * ローカル開発用DB接続の判定と生成。
 *
 * @neondatabase/serverless の neon() はNeon独自の `POST /sql` HTTPプロトコルを
 * 話す前提で、docker-compose の素のPostgres(db-neon)には直接繋げない
 * （wsproxyはPostgresワイヤプロトコルのWebSocketトンネルであってこのHTTP APIは実装していない）。
 * 一方 pg(node-postgres) は普通の Postgres ワイヤプロトコルで繋がるので、
 * DATABASE_URL が localhost を指しているときだけ pg.Pool にフォールバックする。
 * 本番(Cloudflare Workers)では DATABASE_URL が localhost になることはないので、
 * このコードパスは実行されない。next.config.ts の serverExternalPackages と
 * 合わせて、pg は本番バンドルへ巻き込まれない。
 */
function isLocalDatabaseUrl(): boolean {
	const url = getConnectionString();
	return /\/\/[^@]*@?(localhost|127\.0\.0\.1)([:/]|$)/i.test(url);
}

let localPoolPromise: Promise<Pool> | null = null;
function getLocalPool(): Promise<Pool> {
	if (!localPoolPromise) {
		const pkgName = "pg";
		localPoolPromise = import(/* webpackIgnore: true */ pkgName).then(
			(m) =>
				new (m.Pool || m.default?.Pool)({
					connectionString: getConnectionString(),
				}),
		);
	}
	return localPoolPromise;
}

/**
 * Postgres/Neon クエリパラメータ型。
 * undefined の混入をコンパイルレベルで完全に禁止し、Neon HTTP 520 クラッシュを恒久防止する。
 */
export type SqlParam =
	| string
	| number
	| boolean
	| null
	| Date
	| Uint8Array
	| Buffer
	| readonly (string | number | boolean)[];

async function q<T = any>(
	text: string,
	params: readonly SqlParam[] = [],
): Promise<{ rows: T[]; rowCount?: number }> {
	const sanitizedParams = params.map((p) => (p === undefined ? null : p));
	if (isLocalDatabaseUrl()) {
		const pool = await getLocalPool();
		const res = await pool.query(text, sanitizedParams as any[]);
		return { rows: res.rows as T[], rowCount: res.rowCount ?? undefined };
	}
	const sql = getDb();
	const res = await sql.query(text, sanitizedParams as any[], { fullResults: true });
	return res as { rows: T[]; rowCount?: number };
}

// INSERT文のカラム名・プレースホルダ($N)・params配列を1箇所（entries）だけから生成する
// ビルダー。カラム名の並び・VALUES句の$N・params配列を3箇所バラバラに手で数えて揃える
// 書き方は、後からカラムを追加するときに一部だけ更新漏れがあると「個数は合うが対応が
// ズレる」バグを生み、型チェックにもlintにも引っかからない
// （実例: addReply/createPost に mml_delete_id/mml_delete_hash を足した際、
//  params配列側だけ末尾に追加してしまい has_collab_button 等がズレて
//  NOT NULL違反になった）。このビルダーならカラムと値が同じ行に書かれるので、
// 挿入・削除・並べ替えでズレようがない。新しいINSERTを書くときはこちらを使うこと。
const raw = (sql: string): { raw: string } => ({ raw: sql });
const val = (v: SqlParam): { param: SqlParam } => ({ param: v });
type InsertEntry = [column: string, value: { raw: string } | { param: SqlParam }];
function buildInsertParts(entries: InsertEntry[]) {
	const cols: string[] = [];
	const placeholders: string[] = [];
	const params: SqlParam[] = [];
	for (const [col, v] of entries) {
		cols.push(col);
		if ("raw" in v) {
			placeholders.push(v.raw);
		} else {
			params.push(v.param);
			placeholders.push(`$${params.length}`);
		}
	}
	return { cols, placeholders, params };
}
function buildInsert(table: string, entries: InsertEntry[]) {
	const { cols, placeholders, params } = buildInsertParts(entries);
	return {
		text: `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`,
		params,
	};
}
/**
 * buildInsert の `INSERT ... SELECT <値> <fromAndWhere>` 版。値の行を条件付きで入れたいとき
 * （addReply: ロックしたスレの行が上限内のときだけ入れる）に使う。カラムと値を1箇所から
 * 作る理由は buildInsert と同じ。fromAndWhere は entries 側で決まる $N（先頭の entry の $1 など）
 * だけを参照できる。同じ文の別の箇所で値を足すときは、返る params の後ろに積んで番号を続けること。
 */
function buildInsertSelect(
	table: string,
	entries: InsertEntry[],
	fromAndWhere: string,
) {
	const { cols, placeholders, params } = buildInsertParts(entries);
	return {
		text: `INSERT INTO ${table} (${cols.join(", ")}) SELECT ${placeholders.join(", ")} ${fromAndWhere}`,
		params,
	};
}

function toIso(v: unknown): string {
	if (v instanceof Date) return v.toISOString();
	if (typeof v === "string") return v;
	return String(v);
}

// ============================================================================
// ID方式: threadId*2 / res.id*2+1
// ============================================================================
const threadToPostId = (threadId: number) => threadId * 2;
const resToPostId = (resId: number) => resId * 2 + 1;
const isReplyPostId = (postId: number) => postId % 2 === 1;
const postIdToThreadId = (postId: number) => Math.floor(postId / 2);
const postIdToResId = (postId: number) => Math.floor((postId - 1) / 2);

// ============================================================================
// content_type (unj の common/request/content-schema.ts の Enum と同値)
// ============================================================================
const CT = {
	Text: 1,
	Url: 2,
	Image: 4,
	Gif: 8,
	Video: 16,
	Audio: 32,
	Game: 64,
	Sns: 128,
	Chord: 512,
	Oekaki: 1024,
	Dtm: 2048,
	Encrypt: 4096,
} as const;

/**
 * reze発スレッドの threads.cc_bitmask / content_types_bitmask 既定値。
 * unj の MakeThreadPage.svelte の既定選択と完全一致させる:
 *   ccBitmask = [1,4,8] = ID + コテハン + アイコン (自演防止ID=2 は含まない)
 *   contentTypesBitmask = 現在unjに実装済みの11種別を全許可
 * これを設定しないとDDLのデフォルト(=1、テキストのみ)に落ち、board_id=1を
 * 共有しているunj純正UIからreze発スレッドへ画像/MML付きで返信すると
 * 弾かれる（unj側の res.ts がこの値でゲートしているため）。
 */
const DEFAULT_CC_BITMASK = 1 + 4 + 8; // 13
const DEFAULT_CONTENT_TYPES_BITMASK =
	CT.Text +
	CT.Url +
	CT.Image +
	CT.Gif +
	CT.Video +
	CT.Audio +
	CT.Game +
	CT.Sns +
	CT.Chord +
	CT.Oekaki +
	CT.Dtm +
	CT.Encrypt; // 7935

interface DisplayContent {
	content: string;
	hasImage?: boolean;
	imageSrc?: string;
	hasMml?: boolean;
	mmlUrl?: string;
}

/**
 * 絶対 URL で、スキームが protocols のどれかなら元の文字列をそのまま返す（それ以外は undefined）。
 * content_url / content_data_url は unj と共有の列で、reze の編集や古い行・unj 側の書き込みから
 * `javascript:` や相対パス（`/api/auth/...` のような自サイトの URL）が入りうる。
 * それを <img src> や fetch にそのまま渡すと、閲覧者のブラウザに任意の自サイト GET を踏ませたり
 * スクリプト URL を描かせたりできるので、表示用に取り出す時点で落とす。
 * new URL は基準 URL なしで呼ぶ（相対パスは例外になる）。正規化した href ではなく元の文字列を
 * 返すのは、表示や削除トークンの照合で URL の見た目を変えないため。
 */
function absoluteUrlOf(
	raw: unknown,
	protocols: readonly string[],
): string | undefined {
	if (typeof raw !== "string" || raw === "") return undefined;
	// 大半の行はここで決まる。URL の組み立て（CPU）は http(s) らしいものにだけ払う
	if (!/^https?:\/\//i.test(raw)) return undefined;
	try {
		return protocols.includes(new URL(raw).protocol) ? raw : undefined;
	} catch {
		return undefined;
	}
}
const HTTP_PROTOCOLS = ["http:", "https:"] as const;
const HTTPS_ONLY = ["https:"] as const;

/**
 * ローカル開発のファイル置き場（lib/storage/s3.ts）が返す相対パス `/uploads/<時刻>-<乱数>.<拡張子>`。
 * 相対パスの中でこれだけは通す（uploader なしのローカル開発で画像投稿が消えないように）。
 * 形を画像ファイル名に限っているので、`/api/...` のような自サイトの API には向けられない。
 * 通すのは uploader が無いときだけ（ルートの isAcceptableNewImageSrc と同じ条件）。本番の共有行に
 * 相対パスを入れると、unj（URL は http(s) だけの前提）の画面で unj 自身のパスとして読まれる。
 */
const LOCAL_UPLOAD_PATH_RE = /^\/uploads\/[\w-]+\.(?:png|jpe?g|gif|webp)$/;

/** 添付画像（content_url）として扱ってよい URL。絶対 http(s) か、ローカル開発の置き場のパス */
function imageUrlOf(raw: unknown): string | undefined {
	if (
		!isUploaderAvailable &&
		typeof raw === "string" &&
		LOCAL_UPLOAD_PATH_RE.test(raw)
	)
		return raw;
	return absoluteUrlOf(raw, HTTP_PROTOCOLS);
}

/**
 * 昔の行に残っている data: の画像（uploader 導入前、Workers で lib/storage/s3.ts の uploadImage が
 * ファイルに書けずに data URL をそのまま返していた頃のもの）。<img src> の data: 画像はスクリプトを
 * 動かせないので、表示（deriveDisplay）だけは通す。新しく保存する側（deriveInsertContent）と、
 * 選んだ画像を投稿に再利用するメディア検索では通さない（ルートが data: を弾くので使い回せない）。
 * SVG は含めない。
 */
const DATA_IMAGE_URL_RE = /^data:image\/(?:png|jpe?g|gif|webp);base64,/i;
function displayImageUrlOf(raw: unknown): string | undefined {
	const url = imageUrlOf(raw);
	if (url) return url;
	return typeof raw === "string" && DATA_IMAGE_URL_RE.test(raw) ? raw : undefined;
}

/** row（content_type/content_text/content_url/content_data_url）→ reze の表示フィールド */
function deriveDisplay(row: any): DisplayContent {
	const t = Number(row.content_type);
	const text: string = row.content_text ?? "";
	if (t === CT.Image || t === CT.Oekaki) {
		// お絵描き(1024)は表示時点では単なる画像。unjの専用UIで描かれた投稿も
		// board_id=1 を共有するreze側では「画像投稿」として同じ枠(gimp-checkered
		// 背景つき)で描く。ここで弾くと本文へURLが畳み込まれ、汎用embed
		// （白背景なし）扱いになってしまう。
		return {
			content: text,
			hasImage: true,
			imageSrc: displayImageUrlOf(row.content_url),
		};
	}
	if (t === CT.Dtm) {
		// MML はクライアントが fetch して読む。R2 / uploader の URL は常に https なので http は通さない
		return {
			content: text,
			hasMml: true,
			mmlUrl: absoluteUrlOf(row.content_data_url, HTTPS_ONLY),
		};
	}
	if (t === CT.Text || t === CT.Chord) {
		return { content: text };
	}
	// reze にネイティブな表現が無い種別(Url/Gif/Video/Audio/Game/Sns/Oekaki/Encrypt等)。
	// unj純正のBBS投稿も同じ board_id を共有するため、表示だけは保つ。
	// content_url を本文へ追記するとURLが二重表示になりがち（extractFirstEmbed が
	// 本文中のURLからどのみち埋め込みを作るし、埋め込み非対応でも大抵は本文側に
	// 同じURLが既に書かれている）ため、content_url は付け足さず本文のみ表示する。
	return { content: text };
}

/** reze の投稿データ → unj の content_type/content_text/content_url/content_data_url */
function deriveInsertContent(data: {
	content: string;
	hasImage?: boolean;
	imageSrc?: string;
	mmlUrl?: string;
	mmlDeleteId?: string;
	mmlDeleteHash?: string;
}) {
	const content = data.content ?? "";
	if (data.mmlUrl || extractMmlFromContent(content)) {
		return {
			contentType: CT.Dtm,
			contentText: content,
			contentUrl: "",
			contentDataUrl: data.mmlUrl || null,
			// 削除トークンはR2へ実際に上げた(mmlUrlがある)ときだけ持つ。外部化に失敗して
			// 本文に生MMLが残っているだけの場合はR2に実体が無いのでnullのまま。
			mmlDeleteId: data.mmlUrl ? data.mmlDeleteId || null : null,
			mmlDeleteHash: data.mmlUrl ? data.mmlDeleteHash || null : null,
		};
	}
	// 画像として保存するのは表示側（deriveDisplay）が描ける URL だけ。それ以外（相対パス・
	// javascript: など）を content_type=Image で共有行に入れると、unj の EmbedPart は
	// ホワイトリストを見ずにそのまま <img> にする。落とした場合は下の本文だけの扱いになる。
	const imageSrc = data.hasImage ? imageUrlOf(data.imageSrc) : undefined;
	if (imageSrc) {
		return {
			contentType: CT.Image,
			contentText: content,
			contentUrl: imageSrc,
			contentDataUrl: "",
			mmlDeleteId: null,
			mmlDeleteHash: null,
		};
	}
	// コード進行(#コード進行)はMMLと違ってR2へ外部化されず、本文にそのまま残る
	// （lib/mml/mml-payload.ts の externalizeMml は #mml/#MML作曲 行しか見ない）。
	// そのため mmlUrl/imageSrc のどちらでもない場合でも本文を見て判定する。
	if (extractChordsFromContent(content)) {
		return {
			contentType: CT.Chord,
			contentText: content,
			contentUrl: "",
			contentDataUrl: "",
			mmlDeleteId: null,
			mmlDeleteHash: null,
		};
	}
	return {
		contentType: CT.Text,
		contentText: content,
		contentUrl: "",
		contentDataUrl: "",
		mmlDeleteId: null,
		mmlDeleteHash: null,
	};
}

/**
 * threads.latest_res（unj の板一覧に出る最新レスの抜粋）。本文の最初の空でない行を64字まで。
 * createPost / addReply 共通。
 */
function latestResPreview(content: string | undefined): string {
	return (
		(content || "")
			.split("\n")
			.find((l) => l.trim())
			?.slice(0, 64) || ""
	);
}

/** 1件のレスから送るメンション通知の上限。@ を大量に並べた1レスで通知を撒けないように */
const MAX_MENTIONS_PER_REPLY = 5;
/** users.id（SERIAL = int4）の上限。超える数字を ::int[] に渡すと 22003 で文ごと失敗する */
const MAX_INT4 = 2147483647;

/**
 * 本文の `@<数字>` からメンション先の users.id を取り出す（重複なし・最大 MAX_MENTIONS_PER_REPLY 件）。
 * 投稿者本人とスレ主（返信の通知が別に届く）は除く。11桁以上の数字の先頭だけを拾って別人に
 * 届かないよう、数字の途中で切れる一致は取らない。
 */
function mentionTargetsOf(
	content: string | undefined,
	authorId: number,
	threadOwnerId: number,
): number[] {
	const ids = new Set<number>();
	for (const m of (content || "").matchAll(/@(\d{1,10})(?!\d)/g)) {
		const id = Number(m[1]);
		if (id < 1 || id > MAX_INT4 || id === authorId || id === threadOwnerId)
			continue;
		ids.add(id);
		if (ids.size >= MAX_MENTIONS_PER_REPLY) break;
	}
	return Array.from(ids);
}

/**
 * 削除確定した行から、消すべきR2オブジェクト（MML）の削除トークンを取り出す。
 * content_type===Dtm のときだけ content_data_url がR2実体を指す（deriveDisplay と同じ判定）。
 * deletePost（投稿/レス削除）が使う。ゲーム/MVの manifest は orphanedManifestRefsOf が別に扱う
 * （games/mvs は他の投稿からも参照されうるため、単純な「消えたら即削除」にはできない）。
 */
/**
 * 削除確定した行から、添付画像の削除トークンを取り出す（mmlDeleteRefOf の画像版）。
 * 画像を URL で借りている他人のゲーム/MV/かけあい動画があっても消す——DBからは
 * その参照が見えないので、所有者の削除を優先する（lib/db/interface.ts deletePost）。
 */
function imageDeleteRefOf(row: {
	content_url?: string | null;
	image_delete_id?: string | null;
	image_delete_hash?: string | null;
}): { imageDeleteId?: string; imageDeleteHash?: string } {
	if (row.content_url && row.image_delete_id && row.image_delete_hash) {
		return {
			imageDeleteId: row.image_delete_id,
			imageDeleteHash: row.image_delete_hash,
		};
	}
	return {};
}

/**
 * 権利表記（origin_type）として保存してよい値か。共有の threads/res 行に入り unj の readThread でも
 * 毎回読まれるので、ルートの検査に加えてここでも ORIGIN_TYPE_OPTIONS の値に限る（多層防御）。
 */
const ORIGIN_TYPE_VALUES = new Set<string>(ORIGIN_TYPE_OPTIONS.map((o) => o.value));
function validOriginType(v: unknown): OriginType | null {
	return typeof v === "string" && ORIGIN_TYPE_VALUES.has(v)
		? (v as OriginType)
		: null;
}

/**
 * ドット絵メタ（dot_w/dot_h/anim_frames/anim_fps）の値。範囲は PATCH の parseDotMeta
 * （app/api/posts/[id]/route.ts）と同じ。列は SMALLINT なので、範囲外や NaN をそのまま渡すと
 * 22003/22P02 で 500 になる。作成時は範囲外を null（メタ無し）に落とす。
 */
const DOT_META_MAX = { dotW: 512, dotH: 512, animFrames: 256, animFps: 60 } as const;
function dotMetaValue(v: unknown, max: number): number | null {
	return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= max
		? v
		: null;
}

/** 挿入する行が画像投稿のときだけトークンを保存する（MML優先の分岐で画像が落ちた時は捨てる） */
function imageTokensForInsert(
	contentUrl: string,
	ref: { imageDeleteId?: string; imageDeleteHash?: string },
): [string | null, string | null] {
	return contentUrl && ref.imageDeleteId && ref.imageDeleteHash
		? [ref.imageDeleteId, ref.imageDeleteHash]
		: [null, null];
}

function mmlDeleteRefOf(row: {
	content_type: unknown;
	content_data_url?: string | null;
	mml_delete_id?: string | null;
	mml_delete_hash?: string | null;
}): { mmlDeleteId?: string; mmlDeleteHash?: string } {
	if (
		Number(row.content_type) === CT.Dtm &&
		row.content_data_url &&
		row.mml_delete_id
	) {
		return {
			mmlDeleteId: row.mml_delete_id,
			mmlDeleteHash: row.mml_delete_hash ?? undefined,
		};
	}
	return {};
}

/** 検索語の上限（文字数）。app/api/search・media-search も同じ値で弾く */
const MAX_SEARCH_QUERY_LENGTH = 100;

/**
 * LIKE/ILIKE のワイルドカード（% _）を文字どおりに扱わせる。エスケープ文字は '!'
 * （SQL 側は `ESCAPE '!'`）。バックスラッシュにすると JS のテンプレート文字列と
 * SQL の文字列リテラルで二重にエスケープが要って間違えやすいので避けた。
 * これが無いと `%` や `_` だけの検索語で、意図しない全件一致を作れてしまう。
 */
function escapeLike(term: string): string {
	return term.replace(/[!%_]/g, "!$&");
}

/**
 * 利用者にそのまま見せてよい失敗。ルートは `expose === true` のときだけ e.message を返し、
 * それ以外の例外（Postgres のエラー文など）は一般的な 500 にする。
 */
function userError(message: string, status: number): Error {
	return Object.assign(new Error(message), { expose: true as const, status });
}

/**
 * 削除した投稿（スレの OP・レスとも論理削除）の本文。deletePost が書き、editPost はこの本文で
 * 添付の無い行を「削除済み」とみなして編集させない（削除で R2 の実体を消したあとに書き戻させない）。
 */
const DELETED_POST_TEXT = "(削除されました)";

/**
 * スレの content_types_bitmask に照らして、保存する content_type を決める（unj の規則に合わせる）。
 * - NULL は制限なし（unj の既定値は 1 で、NULL は列を足す前の行だけ）
 * - コード進行（#コード進行）が許されていないスレではテキストとして保存する。unj も本文の
 *   マーカーで Chord に切り替えるのは許されているスレだけで、それ以外はテキストのまま送る
 *   （unj src/client/pages/ThreadPage.svelte）。
 * - それ以外の許されていない種別は投げる（C1 400）
 * 純粋な関数なので、R2 への書き込みより前の判定にも、保存する値の決定にも同じものを使う。
 */
function threadContentType(bitmask: unknown, contentType: number): number {
	if (bitmask == null) return contentType;
	const bm = Number(bitmask);
	const t = contentType === CT.Chord && (bm & CT.Chord) === 0 ? CT.Text : contentType;
	if ((bm & t) === 0) {
		throw userError("このスレッドでは、この種類の投稿はできません", 400);
	}
	return t;
}

/** レスの書き込みを止めるスレ規則（unj src/server/api/res.ts と同じ）。違反なら C1 を投げる */
function assertReplyAllowed(
	thread: { bals_res_num?: unknown; varsan?: unknown },
	isOwner: boolean,
): void {
	if (Number(thread.bals_res_num ?? 0) !== 0) {
		throw userError("このスレッドは終了しています", 403);
	}
	// unj は !バルサン中でも忍法帖 LV8 以上なら書けるが、reze の利用者には忍法帖のレベルが
	// 無いのでスレ主だけにする
	if (thread.varsan && !isOwner) {
		throw userError("このスレッドは書き込みが制限されています（!バルサン）", 403);
	}
}

/** スレの書き込み上限。unj の res_limit と RES_LIMIT（num は SMALLINT、lib/bbs/thread-limits.ts）の小さい方 */
function replyLimitOf(thread: { res_limit?: unknown }): number {
	return Math.min(Number(thread.res_limit ?? RES_LIMIT) || RES_LIMIT, RES_LIMIT);
}

const threadFullError = (limit: number) =>
	userError(`このスレッドは上限（${limit}レス）に達しています`, 409);

/** レスの採番が 23505 で衝突したときの待ち時間（ms）。同時に投げた側どうしが同じ瞬間にやり直さないよう揺らす */
const sleepBeforeRetry = () =>
	new Promise<void>((resolve) =>
		setTimeout(resolve, 20 + Math.floor(Math.random() * 80)),
	);

/**
 * auth_tokens の行を reze のセッションとして受け付けてよいかの SQL 条件（`alias` は auth_tokens の別名）。
 *
 * unj は4日ごとに発行し直すトークン（`署名.userId.期限` のドット区切り3つ）を毎回 kind='unj'
 * （列の既定値）で auth_tokens に積み、そのうち直近4件だけを有効にしている（unj auth.ts の
 * reloginQuery）。reze がトークンの新しさを見ずに照会すると、unj が無効にした古いトークンでも
 * その unj 利用者として振る舞えてしまう（他人の投稿の編集・削除、DM・通知の閲覧）。
 * reze が unj の利用者として振る舞う必要は無いので、unj 形式のトークンは新旧を問わず受け付けない。
 *
 * 締め出さないもの: UUID（ドットなし）のまま既定値 kind='unj' で入った昔の reze セッション、
 * `bbscgi:<IPv4>`（ドット3つ＝4つに分かれる。kind='reze'）。
 * 正規表現のドットは `\.` ではなく `[.]` で書く（バックスラッシュは JS のテンプレート文字列と
 * SQL の文字列リテラルで二重にエスケープが要り、standard_conforming_strings の設定次第で
 * 意味まで変わる。escapeLike の `ESCAPE '!'` と同じ理由）。
 */
const rezeTokenOk = (alias = "t") =>
	`NOT (${alias}.kind = 'unj' AND ${alias}.token ~ '^[^.]+[.][^.]+[.][^.]+$')`;

/** DM 本文の上限（文字数）。app/api/messages の MAX_DM_LENGTH と同じ値 */
const MAX_MESSAGE_LENGTH = 5000;
/**
 * messages を読むときの列。rowToMessage が使う分だけにし、本文は MAX_MESSAGE_LENGTH で頭打ちにする
 * （上限を入れる前に保存された巨大な DM が、読み出しのたびに転送量を食わないように）。
 */
const MESSAGE_COLUMNS = `id, sender_user_id, recipient_user_id, LEFT(text, ${MAX_MESSAGE_LENGTH}) AS text, created_at`;

/** 推しリストの件数の上限（1人あたり）。一覧は LIMIT もこの値で引く */
const MAX_OSHI_ITEMS = 100;

/** 1人が1日に送れる通報の件数（reportContent） */
const MAX_REPORTS_PER_DAY = 50;

/** 移行トークンの有効期限（分）。発行から過ぎたものは引き換えできない */
const MIGRATION_TOKEN_TTL_MINUTES = 30;

/** 移行トークン。128bit の暗号論的乱数を base64url で（22文字） */
function generateMigrationToken(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * game_id/mv_id が、削除確定した行以外の投稿からまだ参照されているか。
 * スレッドは論理削除（deleted_at）されるとどのみち二度と表示されないので、
 * 「参照している」扱いから除外する（MMLの後始末と同じ「非表示＝もう消してよい」判断）。
 */
async function hasOtherPostRef(
	column: "game_id" | "mv_id" | "talk_id" | "otomad_id",
	id: number,
): Promise<boolean> {
	const { rows } = await q(
		`SELECT EXISTS (
			SELECT 1 FROM threads WHERE ${column} = $1 AND deleted_at IS NULL
			UNION ALL
			SELECT 1 FROM res WHERE ${column} = $1
		) AS has_ref`,
		[id],
	);
	return !!rows[0]?.has_ref;
}

/**
 * 削除確定した投稿/レスに game_id/mv_id が付いていたとき、他の投稿からもう参照されて
 * いなければ games/mvs 行自体を削除し、R2 manifest の削除トークンを返す
 * （呼び出し側=クライアントがR2実体を消す。previousMmlと同じ「DB確定後に消す」流儀）。
 * 参照が残っていれば何もしない（他の投稿の再生/改造の起点として生きているため）。
 */
async function orphanedManifestRefsOf(
	row: {
		game_id?: number | string | null;
		mv_id?: number | string | null;
		talk_id?: number | string | null;
		otomad_id?: number | string | null;
	},
	/**
	 * 削除した投稿の作者（users.id）。作品行と manifest を消すのは作者本人の作品
	 * （と作者不明の古い行）だけにする。他人の作品を自分の投稿に添付できた頃の行が残っていると、
	 * それを消すだけで他人の作品と R2 の実体まで消せてしまうため（削除トークンも返さない）。
	 */
	ownerUid: number,
): Promise<{
	gameManifestDeleteId?: string;
	gameManifestDeleteHash?: string;
	mvManifestDeleteId?: string;
	mvManifestDeleteHash?: string;
	talkManifestDeleteId?: string;
	talkManifestDeleteHash?: string;
	otomadManifestDeleteId?: string;
	otomadManifestDeleteHash?: string;
}> {
	const out: {
		gameManifestDeleteId?: string;
		gameManifestDeleteHash?: string;
		mvManifestDeleteId?: string;
		mvManifestDeleteHash?: string;
		talkManifestDeleteId?: string;
		talkManifestDeleteHash?: string;
		otomadManifestDeleteId?: string;
		otomadManifestDeleteHash?: string;
	} = {};
	const gameId = row.game_id != null ? Number(row.game_id) : null;
	if (gameId != null && !(await hasOtherPostRef("game_id", gameId))) {
		// games行を消せば game_schedule/game_votes は ON DELETE CASCADE で連動して消える
		// （docker/init.sql参照）。game_players のようなDB書き込みは元々存在しない。
		const { rows } = await q(
			`DELETE FROM games WHERE id = $1 AND (creator_user_id IS NULL OR creator_user_id = $2) RETURNING manifest_delete_id, manifest_delete_hash`,
			[gameId, ownerUid],
		);
		if (rows[0]?.manifest_delete_id) {
			out.gameManifestDeleteId = rows[0].manifest_delete_id;
			out.gameManifestDeleteHash = rows[0].manifest_delete_hash ?? undefined;
		}
	}
	const mvId = row.mv_id != null ? Number(row.mv_id) : null;
	if (mvId != null && !(await hasOtherPostRef("mv_id", mvId))) {
		const { rows } = await q(
			`DELETE FROM mvs WHERE id = $1 AND (creator_user_id IS NULL OR creator_user_id = $2) RETURNING manifest_delete_id, manifest_delete_hash`,
			[mvId, ownerUid],
		);
		if (rows[0]?.manifest_delete_id) {
			out.mvManifestDeleteId = rows[0].manifest_delete_id;
			out.mvManifestDeleteHash = rows[0].manifest_delete_hash ?? undefined;
		}
	}
	const talkId = row.talk_id != null ? Number(row.talk_id) : null;
	if (talkId != null && !(await hasOtherPostRef("talk_id", talkId))) {
		const { rows } = await q(
			`DELETE FROM talks WHERE id = $1 AND (creator_user_id IS NULL OR creator_user_id = $2) RETURNING manifest_delete_id, manifest_delete_hash`,
			[talkId, ownerUid],
		);
		if (rows[0]?.manifest_delete_id) {
			out.talkManifestDeleteId = rows[0].manifest_delete_id;
			out.talkManifestDeleteHash = rows[0].manifest_delete_hash ?? undefined;
		}
	}
	const otomadId = row.otomad_id != null ? Number(row.otomad_id) : null;
	if (otomadId != null && !(await hasOtherPostRef("otomad_id", otomadId))) {
		const { rows } = await q(
			`DELETE FROM otomads WHERE id = $1 AND (creator_user_id IS NULL OR creator_user_id = $2) RETURNING manifest_delete_id, manifest_delete_hash`,
			[otomadId, ownerUid],
		);
		if (rows[0]?.manifest_delete_id) {
			out.otomadManifestDeleteId = rows[0].manifest_delete_id;
			out.otomadManifestDeleteHash = rows[0].manifest_delete_hash ?? undefined;
		}
	}
	return out;
}

// ============================================================================
// row → DbPost
// ============================================================================

/**
 * システム用の users.id。unj の次スレ立て（src/server/mylib/next-thread.ts）や管理画面の
 * スレ立て・書き込み（src/server/admin/thread/*）はこの id の名義で書く。人ではないので
 * プロフィール・DM・フォローの対象にせず、users.display_name も表示に使わない。
 */
const SYSTEM_USER_ID = 1;

/**
 * この行（threads/res に AUTHOR_SELECT を足したもの）の投稿者が reze の利用者か。
 * 判定は users.display_name が NULL でないこと:
 * - unj は display_name を一度も書かない（unj の auth.ts は `INSERT INTO users (ip, ninja_pokemon)` だけ）
 * - reze はどの作成経路（getOrCreateAnonymousUser。bbs.cgi の `bbscgi:` も含む）でも必ず書く
 * ほかの印は使えない: origin_type 'fal_1_3' は unj の既定値だが reze の OriginType にもある。
 * ip '0.0.0.0' は reze の書き込みだけでなく unj のシステム投稿にも使われている。
 *
 * **呼び出し側の行には必ず author_display_name を載せること**（AUTHOR_SELECT か、createPost /
 * addReply のように明示的に代入）。載せ忘れると reze 利用者でも slug が付かず、
 * プロフィールへの導線が黙って消える。
 */
function isRezeAuthorRow(row: any): boolean {
	return (
		row.author_display_name != null && Number(row.user_id) !== SYSTEM_USER_ID
	);
}

/**
 * フォロー・ブロック・ミュートの相手にしてよい users.id か（`param` は `$2::int` などの SQL 式）。
 * isRezeAuthorRow と同じ基準で、unj だけの利用者と SYSTEM_USER_ID は対象にしない。
 * 投稿に slug を出さなくても、API に任意の id を渡してミュート/ブロックし「どの投稿が消えるか」を
 * 見れば、unj 利用者の投稿を users.id で名寄せできてしまう（スレ・日をまたいだ追跡）ため。
 */
const rezeTargetSql = (param: string) =>
	`EXISTS (SELECT 1 FROM users WHERE id = ${param} AND display_name IS NOT NULL AND id <> ${SYSTEM_USER_ID})`;

function resolveDisplayName(row: any): string {
	// reze 利用者の表示名は users.display_name。保存時にも通しているが、それより前に保存された
	// 名前もあるので表示時にも unj の名前エスケープと不可視文字の除去を掛ける。
	// cc_user_name は通さない（unj が書いた本物のキャップ・トリップを潰してしまう）。
	// システム用 id の display_name は使わない（次スレなどに特定の名前が出てしまう）。
	const rezeName =
		row.author_display_name && Number(row.user_id) !== SYSTEM_USER_ID
			? sanitizeBbsUserName(row.author_display_name)
			: "";
	const raw = (rezeName || row.cc_user_name || "").trim();
	if (raw && raw !== "名無し") return raw;
	if (row.cc_user_id) return `名無し${row.cc_user_id}`;
	return "名無し";
}

function threadRowToPost(row: any, replies: DbPost[] = []): DbPost {
	const postId = threadToPostId(Number(row.id));
	const disp = deriveDisplay(row);
	// unj 由来・システム用の投稿者には生の users.id を出さない（ファイル先頭「ユーザー識別子」）
	const authorKey = isRezeAuthorRow(row) ? String(row.user_id) : undefined;
	return {
		id: postId,
		displayName: resolveDisplayName(row),
		slug: authorKey,
		userId: authorKey,
		bbsId: row.cc_user_id || undefined,
		datKey:
			row.dat_key != null
				? Number(row.dat_key)
				: Math.floor(new Date(toIso(row.created_at)).getTime() / 1000),
		title: row.title || undefined,
		createdAt: toIso(row.created_at),
		time: formatRelativeTime(toIso(row.created_at)),
		latestResAt:
			row.latest_res_at != null ? toIso(row.latest_res_at) : undefined,
		content: disp.content,
		likes: row.good_count ?? 0,
		dislikes: row.bad_count ?? 0,
		liked: false,
		disliked: false,
		repliesCount: Math.max(Number(row.res_count ?? 1) - 1, 0),
		reposts: row.reposts ?? 0,
		// threads/res.reposted 列は全員共通のフラグだった名残で、もう読まない（ドロップ可）。
		// 閲覧者ごとの値は finalizeForViewer が post_reposts から埋める。
		reposted: false,
		authorIsPrivate: !!row.author_is_private,
		reactionsHidden: !!row.author_hide_reactions,
		hasImage: disp.hasImage,
		imageSrc: disp.imageSrc,
		avatarColor: row.avatar_color || "from-blue-500 to-indigo-600",
		avatarUrl: row.author_avatar_url ?? undefined,
		hasCollabButton: row.has_collab_button ?? false,
		heartsTotal: row.hearts_total ?? 0,
		hasGame: !!row.game_id,
		gameId: row.game_id != null ? Number(row.game_id) : undefined,
		hasMv: !!row.mv_id,
		mvId: row.mv_id != null ? Number(row.mv_id) : undefined,
		hasTalk: !!row.talk_id,
		talkId: row.talk_id != null ? Number(row.talk_id) : undefined,
		hasOtomad: !!row.otomad_id,
		otomadId: row.otomad_id != null ? Number(row.otomad_id) : undefined,
		hasMml: disp.hasMml,
		mmlUrl: disp.mmlUrl,
		mmlDeleteId: row.mml_delete_id ?? undefined,
		mmlDeleteHash: row.mml_delete_hash ?? undefined,
		dotW: row.dot_w != null ? Number(row.dot_w) : undefined,
		dotH: row.dot_h != null ? Number(row.dot_h) : undefined,
		animFrames: row.anim_frames != null ? Number(row.anim_frames) : undefined,
		animFps: row.anim_fps != null ? Number(row.anim_fps) : undefined,
		walkPreset: row.walk_preset ?? undefined,
		originType: row.origin_type ?? undefined,
		isFalseDeclaration: row.is_false_declaration ?? false,
		isEdited: row.is_edited ?? false,
		threadId: postId,
		// OPは常に1レス目（>>1）
		num: 1,
		parentPostId: undefined,
		replies,
	};
}

function resRowToPost(row: any): DbPost {
	const postId = resToPostId(Number(row.id));
	const threadPostId = threadToPostId(Number(row.thread_id));
	const disp = deriveDisplay(row);
	// threadRowToPost と同じく reze 利用者の投稿だけに users.id を付ける
	const authorKey = isRezeAuthorRow(row) ? String(row.user_id) : undefined;
	return {
		id: postId,
		displayName: resolveDisplayName(row),
		slug: authorKey,
		userId: authorKey,
		bbsId: row.cc_user_id || undefined,
		createdAt: toIso(row.created_at),
		time: formatRelativeTime(toIso(row.created_at)),
		content: disp.content,
		likes: row.good_count ?? 0,
		dislikes: row.bad_count ?? 0,
		liked: false,
		disliked: false,
		repliesCount: 0,
		reposts: row.reposts ?? 0,
		// threads/res.reposted 列は全員共通のフラグだった名残で、もう読まない（ドロップ可）。
		// 閲覧者ごとの値は finalizeForViewer が post_reposts から埋める。
		reposted: false,
		authorIsPrivate: !!row.author_is_private,
		reactionsHidden: !!row.author_hide_reactions,
		hasImage: disp.hasImage,
		imageSrc: disp.imageSrc,
		avatarColor: row.avatar_color || "from-blue-500 to-indigo-600",
		avatarUrl: row.author_avatar_url ?? undefined,
		hasCollabButton: row.has_collab_button ?? false,
		heartsTotal: row.hearts_total ?? 0,
		hasGame: !!row.game_id,
		gameId: row.game_id != null ? Number(row.game_id) : undefined,
		hasMv: !!row.mv_id,
		mvId: row.mv_id != null ? Number(row.mv_id) : undefined,
		hasTalk: !!row.talk_id,
		talkId: row.talk_id != null ? Number(row.talk_id) : undefined,
		hasOtomad: !!row.otomad_id,
		otomadId: row.otomad_id != null ? Number(row.otomad_id) : undefined,
		hasMml: disp.hasMml,
		mmlUrl: disp.mmlUrl,
		mmlDeleteId: row.mml_delete_id ?? undefined,
		mmlDeleteHash: row.mml_delete_hash ?? undefined,
		dotW: row.dot_w != null ? Number(row.dot_w) : undefined,
		dotH: row.dot_h != null ? Number(row.dot_h) : undefined,
		animFrames: row.anim_frames != null ? Number(row.anim_frames) : undefined,
		animFps: row.anim_fps != null ? Number(row.anim_fps) : undefined,
		walkPreset: row.walk_preset ?? undefined,
		originType: row.origin_type ?? undefined,
		isFalseDeclaration: row.is_false_declaration ?? false,
		isEdited: row.is_edited ?? false,
		threadId: threadPostId,
		num: row.num != null ? Number(row.num) : undefined,
		parentNum: row.parent_num != null ? Number(row.parent_num) : 1,
		parentPostId:
			row.parent_num != null
				? Number(row.parent_num) === 1
					? threadPostId
					: undefined /* 後段でnum→idを解決 */
				: threadPostId,
		replies: [],
	};
}

/** viewer視点の liked/disliked をその場で埋め込む（インメモリのvote-guard参照） */
function withViewerVoteState(
	post: DbPost,
	viewerId: string | undefined,
): DbPost {
	if (!viewerId) return post;
	const state = getVoteState(viewerId, post.id);
	return { ...post, liked: state.liked, disliked: state.disliked };
}

// author_is_private / author_hide_reactions は行→DbPost 変換で authorIsPrivate /
// reactionsHidden になる（閲覧者ごとの最終判定は finalizeForViewer）。
const AUTHOR_SELECT = `u.display_name AS author_display_name, u.avatar_url AS author_avatar_url, u.hide_from_search AS author_hide_from_search, u.is_private AS author_is_private, u.hide_reactions AS author_hide_reactions`;

/**
 * dat_key(専ブラ向け.datファイル名)のフォールバック計算。
 * `t.*` の dat_key(NULL方向)を後段のこの式で上書きするため、必ず `t.*` の後に置く。
 * 注意: JS側(new Date(row.created_at))で代わりに計算しないこと。node-pgが
 * `timestamp without time zone` を非ISO文字列として素朴にDateへ渡す関係で、
 * 実行環境のprocess.env.TZ次第でずれる(開発機がJSTだと-9h)。SQL側は常に
 * セッションTimeZone基準で一貫するので、必ずここで計算して行に含める。
 */
const DAT_KEY_SELECT = `COALESCE(t.dat_key, FLOOR(EXTRACT(EPOCH FROM t.created_at))::BIGINT) AS dat_key`;

// ============================================================================
// ブロック/ミュート（隠す判定）。unj方式のカウンタと同じく強い一貫性は要らないので
// 60秒キャッシュ（元reze実装のTTLを踏襲）。
// ============================================================================
const hiddenCache = new Map<
	string,
	{ hidden: Set<number>; expiresAt: number }
>();
function clearHiddenCache() {
	hiddenCache.clear();
}

/**
 * **ユーザーのキーは常に `users.id`（整数）**。このストアの `userId` / `slug` /
 * `viewerId` / `*Slug` 引数はすべてこれを指す。
 *
 * `slug` はDBカラムではなく `String(users.id)` の表示用エイリアスにすぎない。
 * テキストキーの列やインデックスを持たせないのは意図的で、Neon 無料枠の
 * ストレージ/転送量を食わないための設計方針（docs/NEON_EGRESS.md）。
 * したがって slug や displayName で引く経路を新設してはいけない。
 *
 * **displayName（「名無しxxx」）を渡してはいけない**：ここで NaN になり、
 * Postgres の integer 列に渡って `invalid input syntax for type integer` で
 * 500 になる（通知ページがそれで落ちていた）。
 *
 * 呼び出し側が誤った値を渡しても API 全体が 500 にならないよう、数値化はすべて
 * このヘルパを通し、不正なら null を返して各メソッドが空を返す（fail-open）。
 */
function toUid(userId: string | null | undefined): number | null {
	if (userId == null || userId === "") return null;
	const n = Number(userId);
	// users.id などの SERIAL は int4。超える値（"99999999999" や "1e10"）を渡すと 22003 の 500 になる
	return Number.isInteger(n) && n > 0 && n <= 2147483647 ? n : null;
}

async function getHiddenUserIds(viewerId?: string): Promise<Set<number>> {
	if (!viewerId) return new Set();
	const now = Date.now();
	const cached = hiddenCache.get(viewerId);
	if (cached && cached.expiresAt > now) return cached.hidden;
	const vid = toUid(viewerId);
	if (vid === null) return new Set();
	const { rows } = await q<{ other: number }>(
		`SELECT blocker_user_id AS other FROM user_blocks WHERE blocked_user_id = $1
     UNION
     SELECT blocked_user_id AS other FROM user_blocks WHERE blocker_user_id = $1
     UNION
     SELECT muted_user_id AS other FROM user_mutes WHERE muter_user_id = $1`,
		[vid],
	);
	const hidden = new Set(rows.map((r) => Number(r.other)));
	hiddenCache.set(viewerId, { hidden, expiresAt: now + 60_000 });
	return hidden;
}

// ============================================================================
// 鍵アカウント・検索除外・リアクション非公開（users.is_private / hide_from_search /
// hide_reactions）。仕様:
// - is_private: 投稿（スレ・レスとも）は「投稿者本人」と「投稿者がフォローしている人」に
//   だけ見える。許可リストは投稿者のフォロー一覧そのもので、承認フローは無い（フォロワー
//   側から自分で閲覧権を得ることはできない）。それ以外の人には、フィード・プロフィール・
//   検索・ハッシュタグ・メディア検索・個別ページ（404）・公開スレ内のレス一覧・専ブラの
//   dat/subject.txt のどこにも出さない。リアルタイム配信もしない（API層で authorIsPrivate を見る）。
// - hide_from_search: 検索・ハッシュタグ・メディア検索・トレンドから外す（本人の検索には出る）。
//   フィードとプロフィールには出る。
// - hide_reactions: 本人以外には いいね/だめね/リポスト/ハート の数を 0 で返し、
//   reactionsHidden=true を立てる（UI は数を出さない）。
//
// 匿名（viewer 無し）の結果はエッジの共有キャッシュに載る（lib/edge-cache.ts）ので、
// そこでは鍵アカの投稿を単純に除外する。viewer がいるときだけ「本人」「投稿者が viewer を
// フォローしている」を足す。user_follows の主キー (follower_user_id, followed_user_id) で
// EXISTS が1回のインデックス参照になるので、新しいインデックスは要らない。
// `u` は投稿者の users を LEFT JOIN した別名（全クエリ共通）。
// ============================================================================

/** 投稿者 `authorCol` の投稿を viewer が見てよいかの SQL 条件。viewerUid は params に積む。 */
function authorVisibleSql(
	authorCol: string,
	params: any[],
	viewerUid: number | null,
	usersAlias = "u",
): string {
	if (viewerUid === null) return `COALESCE(${usersAlias}.is_private, FALSE) = FALSE`;
	params.push(viewerUid);
	const v = `$${params.length}`;
	return `(COALESCE(${usersAlias}.is_private, FALSE) = FALSE OR ${authorCol} = ${v}
    OR EXISTS (SELECT 1 FROM user_follows vf WHERE vf.follower_user_id = ${authorCol} AND vf.followed_user_id = ${v}))`;
}

/** 検索系（検索・ハッシュタグ・メディア検索）に出してよいかの SQL 条件。本人の投稿は出す。 */
function searchableSql(
	authorCol: string,
	params: any[],
	viewerUid: number | null,
): string {
	if (viewerUid === null) return `COALESCE(u.hide_from_search, FALSE) = FALSE`;
	params.push(viewerUid);
	return `(COALESCE(u.hide_from_search, FALSE) = FALSE OR ${authorCol} = $${params.length})`;
}

/** DbPost の id 群を threads.id / res.id に振り分ける（返信も辿る）。 */
function collectRawIds(posts: DbPost[], onlyReposted: boolean) {
	const threadIds: number[] = [];
	const resIds: number[] = [];
	const walk = (p: DbPost) => {
		if (!onlyReposted || p.reposts > 0) {
			if (isReplyPostId(p.id)) resIds.push(postIdToResId(p.id));
			else threadIds.push(postIdToThreadId(p.id));
		}
		for (const r of p.replies ?? []) walk(r);
	};
	for (const p of posts) walk(p);
	return { threadIds, resIds };
}

/**
 * 読み取り系の戻り値を閲覧者向けに仕上げる。全ての読み取りメソッドの出口で通すこと
 * （通さない経路があると hide_reactions の数が漏れる）。
 * - liked/disliked（インメモリの vote-guard）
 * - reposted（post_reposts。viewer がいて、かつ reposts>0 の投稿があるときだけ1クエリ）
 * - hide_reactions の数の伏せ字（本人以外）
 * 返信（replies）も再帰的に処理する。
 */
async function finalizeForViewer(
	posts: DbPost[],
	viewerId: string | undefined,
): Promise<DbPost[]> {
	const viewerUid = toUid(viewerId);
	let reposted: Set<string> | null = null;
	if (viewerUid !== null) {
		// 公開キャッシュ（viewer 無し）には reposted を載せない＝常に false。
		// reposts=0 の投稿は誰もリポストしていないので引くまでもない。
		const { threadIds, resIds } = collectRawIds(posts, true);
		if (threadIds.length + resIds.length > 0) {
			const { rows } = await q<{ post_kind: number; target_id: number }>(
				`SELECT post_kind, target_id FROM post_reposts
          WHERE user_id = $1
            AND ((post_kind = ${REPOST_KIND_THREAD} AND target_id = ANY($2::int[]))
              OR (post_kind = ${REPOST_KIND_RES} AND target_id = ANY($3::int[])))`,
				[viewerUid, threadIds, resIds],
			);
			reposted = new Set(
				rows.map((r) => `${Number(r.post_kind)}:${Number(r.target_id)}`),
			);
		}
	}
	const viewerKey = viewerUid !== null ? String(viewerUid) : undefined;
	const finish = (p: DbPost): DbPost => {
		const out = withViewerVoteState(p, viewerId);
		if (reposted) {
			const key = isReplyPostId(p.id)
				? `${REPOST_KIND_RES}:${postIdToResId(p.id)}`
				: `${REPOST_KIND_THREAD}:${postIdToThreadId(p.id)}`;
			out.reposted = reposted.has(key);
		}
		if (out.reactionsHidden) {
			if (viewerKey !== undefined && out.userId === viewerKey) {
				out.reactionsHidden = false;
			} else {
				out.likes = 0;
				out.dislikes = 0;
				out.reposts = 0;
				out.heartsTotal = 0;
			}
		}
		if (out.replies?.length) out.replies = out.replies.map(finish);
		return out;
	};
	return posts.map(finish);
}

async function finalizeOneForViewer(
	post: DbPost | null,
	viewerId: string | undefined,
): Promise<DbPost | null> {
	if (!post) return null;
	return (await finalizeForViewer([post], viewerId))[0];
}

/**
 * games 一覧・ランキング・live の候補から鍵アカの作品を外す条件（listAllGames / listTopGames /
 * getLiveGameInfo）。`alias` は games の別名（JOIN するクエリ用）。
 */
const publicCreatorSql = (alias?: string) => {
	const col = alias ? `${alias}.creator_user_id` : "creator_user_id";
	return `(${col} IS NULL OR ${col} NOT IN (SELECT id FROM users WHERE is_private))`;
};
const PUBLIC_CREATOR_SQL = publicCreatorSql();

/** post_reposts.post_kind。threads と res は id 空間が別なので種別で分ける。 */
const REPOST_KIND_THREAD = 0;
const REPOST_KIND_RES = 1;

// ============================================================================
// フィード用: スレッドに付随する返信を軽量に埋め込む（全件は引かない）
// ============================================================================
const FEED_REPLIES_PER_THREAD = REPLIES_PAGE_SIZE;

async function attachRepliesToThreads(
	threads: DbPost[],
	threadDbIds: number[],
	viewerUid: number | null = null,
): Promise<void> {
	if (threadDbIds.length === 0) return;
	// 鍵アカの返信は窓（直近N件）を切る前に落とす。後から捨てると窓が欠けて件数が減る。
	const params: any[] = [threadDbIds, FEED_REPLIES_PER_THREAD];
	const visible = authorVisibleSql("r.user_id", params, viewerUid);
	const { rows } = await q(
		`SELECT * FROM (
       SELECT r.*, ${AUTHOR_SELECT},
         ROW_NUMBER() OVER (PARTITION BY r.thread_id ORDER BY r.num DESC) AS rn
       FROM res r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.thread_id = ANY($1::int[]) AND ${visible}
     ) x WHERE rn <= $2 ORDER BY thread_id, num`,
		params,
	);
	const byThread = new Map<number, any[]>();
	for (const row of rows) {
		const tid = Number(row.thread_id);
		if (!byThread.has(tid)) byThread.set(tid, []);
		byThread.get(tid)!.push(row);
	}
	// parent_num → 実postId の解決（同一スレッド内）
	for (const post of threads) {
		const tid = postIdToThreadId(post.id);
		const rowsForThread = byThread.get(tid) ?? [];
		const numToPostId = new Map<number, number>([[1, post.id]]);
		for (const r of rowsForThread)
			numToPostId.set(Number(r.num), resToPostId(Number(r.id)));
		post.replies = rowsForThread.map((r) => {
			const reply = resRowToPost(r);
			const parentNum = r.parent_num != null ? Number(r.parent_num) : 1;
			reply.parentPostId = numToPostId.get(parentNum) ?? post.id;
			return reply;
		});
	}
}

// ============================================================================
// DataStore 実装
// ============================================================================
export const pgStore: DataStore = {
	async getPosts(userId?, limitOrOptions?, beforeIdArg?, optionsArg?) {
		const options =
			typeof limitOrOptions === "object" ? limitOrOptions : optionsArg || {};
		const limit = Math.max(
			1,
			Math.min(
				(typeof limitOrOptions === "number" ? limitOrOptions : options.limit) ||
					20,
				50,
			),
		);
		const cursor = beforeIdArg ?? options.beforeId;
		const cursorThreadId =
			cursor != null ? postIdToThreadId(Number(cursor)) : null;

		const hidden = await getHiddenUserIds(userId);
		const viewerUid = toUid(userId);

		const where: string[] = ["t.deleted_at IS NULL", "t.board_id = 1"];
		const params: any[] = [];
		where.push(authorVisibleSql("t.user_id", params, viewerUid));
		if (cursorThreadId != null) {
			// age(上げ)順ページネーション: t.id ではなく「最終レス時刻」がソート基準なので、
			// カーソルも同じ基準(latest_res_at, id)のkeysetで組む。カーソル自身が既に
			// 削除済み等で見えない場合は id ベースにフォールバックする。
			const { rows: cursorRows } = await q<{ latest_res_at: string }>(
				`SELECT latest_res_at FROM threads WHERE id = $1`,
				[cursorThreadId],
			);
			const cursorLatestResAt = cursorRows[0]?.latest_res_at;
			if (cursorLatestResAt != null) {
				params.push(cursorLatestResAt);
				const latestParam = params.length;
				params.push(cursorThreadId);
				const idParam = params.length;
				where.push(
					`(t.latest_res_at < $${latestParam} OR (t.latest_res_at = $${latestParam} AND t.id < $${idParam}))`,
				);
			} else {
				params.push(cursorThreadId);
				where.push(`t.id < $${params.length}`);
			}
		}
		if (options.hasMml !== undefined)
			where.push(`t.content_type ${options.hasMml ? "=" : "<>"} ${CT.Dtm}`);
		if (options.hasImage !== undefined)
			where.push(`t.content_type ${options.hasImage ? "=" : "<>"} ${CT.Image}`);
		if (options.hasGame !== undefined)
			where.push(`t.game_id IS ${options.hasGame ? "NOT NULL" : "NULL"}`);
		if (options.hasMv !== undefined)
			where.push(`t.mv_id IS ${options.hasMv ? "NOT NULL" : "NULL"}`);
		if (options.hasTalk !== undefined)
			where.push(`t.talk_id IS ${options.hasTalk ? "NOT NULL" : "NULL"}`);
		if (options.hasOtomad !== undefined)
			where.push(`t.otomad_id IS ${options.hasOtomad ? "NOT NULL" : "NULL"}`);
		if (hidden.size > 0) {
			params.push(Array.from(hidden));
			where.push(`t.user_id <> ALL($${params.length})`);
		}
		params.push(limit);

		// 2ch的な「age(上げ)」順: スレ作成時刻ではなく最終レス時刻で並べる。
		// レス投稿のたびに threads.latest_res_at を更新している(addReply参照)ので、
		// 古いスレでも新着レスが付けば正しく浮上する。
		const { rows } = await q(
			`SELECT t.*, ${DAT_KEY_SELECT}, ${AUTHOR_SELECT} FROM threads t
       LEFT JOIN users u ON u.id = t.user_id
       WHERE ${where.join(" AND ")}
       ORDER BY t.latest_res_at DESC, t.id DESC LIMIT $${params.length}`,
			params,
		);
		const filtered = rows.filter((r) => !hidden.has(Number(r.user_id)));
		const posts = filtered.map((r) => threadRowToPost(r));
		if (options.withReplies !== false) {
			await attachRepliesToThreads(
				posts,
				filtered.map((r) => Number(r.id)),
				viewerUid,
			);
		}
		return finalizeForViewer(posts, userId);
	},

	async getPost(
		id: number,
		userId?: string,
		options?: { withReplies?: boolean },
	) {
		const viewerUid = toUid(userId);
		if (isReplyPostId(id)) {
			const resId = postIdToResId(id);
			// レス自身の投稿者に加えて、スレ主が鍵アカでスレごと見えない場合も null
			// （getReplies と同じ扱い。レス単体のURLからスレの中身を覗けないように）。
			// 削除済みのスレ（unj の !timer・強制削除）と板1以外のスレのレスも出さない。
			// reze が扱う板は板1だけで、ここを素通しにするとレス単体の URL から読めてしまう。
			const params: any[] = [resId];
			const visible = authorVisibleSql("r.user_id", params, viewerUid);
			const threadVisible = authorVisibleSql(
				"t.user_id",
				params,
				viewerUid,
				"tu",
			);
			const { rows } = await q(
				`SELECT r.*, ${AUTHOR_SELECT} FROM res r LEFT JOIN users u ON u.id = r.user_id
           JOIN threads t ON t.id = r.thread_id LEFT JOIN users tu ON tu.id = t.user_id
          WHERE r.id = $1 AND t.deleted_at IS NULL AND t.board_id = 1
            AND ${visible} AND ${threadVisible}`,
				params,
			);
			if (rows.length === 0) return null;
			const row = rows[0];
			const post = resRowToPost(row);
			const parentNum = row.parent_num != null ? Number(row.parent_num) : 1;
			// 親1件を引くためにスレ内の全 num を舐めない（1000レスのスレでレス1件を
			// 開くだけで全行読み出しになっていた。docs/NEON_EGRESS.md）。
			if (parentNum === 1) {
				post.parentPostId = post.threadId;
			} else {
				const { rows: parentRows } = await q<{ id: number }>(
					`SELECT id FROM res WHERE thread_id = $1 AND num = $2`,
					[row.thread_id, parentNum],
				);
				post.parentPostId =
					parentRows[0]?.id != null
						? resToPostId(Number(parentRows[0].id))
						: post.threadId;
			}
			return finalizeOneForViewer(post, userId);
		}

		const threadId = postIdToThreadId(id);
		const params: any[] = [threadId];
		const visible = authorVisibleSql("t.user_id", params, viewerUid);
		const { rows } = await q(
			`SELECT t.*, ${DAT_KEY_SELECT}, ${AUTHOR_SELECT} FROM threads t LEFT JOIN users u ON u.id = t.user_id WHERE t.id = $1 AND t.deleted_at IS NULL AND t.board_id = 1 AND ${visible}`,
			params,
		);
		if (rows.length === 0) return null;
		const post = threadRowToPost(rows[0]);
		if (options?.withReplies !== false) {
			await attachRepliesToThreads([post], [threadId], viewerUid);
		}
		return finalizeOneForViewer(post, userId);
	},

	async getPostByDatKey(datKey: number, userId?: string) {
		// 専ブラ（dat / bbs.cgi）は viewer 無しで呼ぶので鍵アカのスレは見つからない扱い。
		// 板1以外・削除済みのスレも出さない（reze が扱う板は板1だけ）。
		//
		// 以前は `COALESCE(dat_key, FLOOR(EXTRACT(EPOCH FROM created_at)))= $1` の1文だったが、
		// 式の比較はどのインデックスにも乗らず、存在しない key を投げるだけで threads を
		// 全件走査させられた。2段に分けてそれぞれインデックスに乗せる:
		// 1) reze が採番した dat_key（unq_threads_dat_key）
		// 2) dat_key 未採番の行（unj のスレは dat_key を書かない）は created_at の範囲
		//    （idx_threads_created_at）。created_at は TIMESTAMP（タイムゾーンなし）で、
		//    その EXTRACT(EPOCH) はタイムゾーンを見ない素朴な 1970-01-01 からの秒数なので、
		//    `epoch + k秒 <= created_at < epoch + (k+1)秒` は FLOOR(...) = k とちょうど同じ条件になる。
		// dat の URL（/^(\d+)\.dat$/）や bbs.cgi の key は利用者が自由に書ける。BIGINT に入らない値・
		// 小数は 22P02、年 10000 を超える秒数は 2) の timestamp 計算が 22008 になり、どちらも 500 に
		// なっていた。そんなスレは存在しないので、問い合わせる前に「見つからない」で返す。
		if (!Number.isSafeInteger(datKey) || datKey <= 0) return null;
		const viewerUid = toUid(userId);
		const datKeyQuery = async (where: string) => {
			const params: any[] = [datKey];
			const visible = authorVisibleSql("t.user_id", params, viewerUid);
			const { rows } = await q(
				`SELECT t.*, ${DAT_KEY_SELECT}, ${AUTHOR_SELECT} FROM threads t LEFT JOIN users u ON u.id = t.user_id
         WHERE ${where} AND t.deleted_at IS NULL AND t.board_id = 1 AND ${visible}
         LIMIT 1`,
				params,
			);
			return rows;
		};
		let rows = await datKeyQuery(`t.dat_key = $1`);
		// 253402300800 = 10000-01-01T00:00:00Z の秒数。created_at はこれより先にならない
		if (rows.length === 0 && datKey < 253402300800) {
			rows = await datKeyQuery(
				`t.dat_key IS NULL
           AND t.created_at >= TIMESTAMP 'epoch' + ($1::bigint) * INTERVAL '1 second'
           AND t.created_at < TIMESTAMP 'epoch' + ($1::bigint + 1) * INTERVAL '1 second'`,
			);
		}
		if (rows.length === 0) return null;
		const threadId = Number(rows[0].id);
		const post = threadRowToPost(rows[0]);
		await attachRepliesToThreads([post], [threadId], viewerUid);
		return finalizeOneForViewer(post, userId);
	},

	async createPost(data: CreatePostParams) {
		// クライアントが mmlUrl を付け損ねていても、本文に生MMLマーカーが残っていれば
		// ここで自前でR2へ外部化し直す（詳細: lib/mml/mml-payload.ts の ensureMmlExternalized）。
		const mmlResolved = await ensureMmlExternalized(data.content, data);
		const c = deriveInsertContent({ ...data, ...mmlResolved });
		const authorId = data.slug ? Number(data.slug) : null;
		if (authorId == null || !Number.isFinite(authorId)) {
			throw new Error(
				"createPost には解決済みの投稿者(slug=users.id)が必要です",
			);
		}
		// 投稿者の行は INSERT の前に引く。鍵アカなら latest_res（unj の板一覧に本文の抜粋として
		// 出る列）を空にするため（addReply と同じ扱い）。返す行の表示名・アイコンにもこれを使う。
		const { rows: userRows } = await q(
			`SELECT display_name, avatar_url, is_private FROM users WHERE id = $1`,
			[authorId],
		);
		const authorIsPrivate = !!userRows[0]?.is_private;
		// dat_key は手計算(UNIQUE)なので、同一秒の同時スレ立てで衝突したらリトライする
		// （lib/db/pg.ts addReply の num 採番と同じ方式）。
		let row: any = null;
		for (let attempt = 0; attempt < 5 && !row; attempt++) {
			try {
				// title は空文字のまま保存する（threads.title は NOT NULL 制約）。
				// unj純正スレは投稿フォームでスレタイ(title列)と本文が別入力だが、reze発の
				// 投稿にはスレタイ入力欄が無い。以前は本文1行目を title に複製していたが、
				// 見出しと本文で同じ文言が二重表示される原因だった（unj側 ThreadPage.svelte /
				// HeadlinePage.svelte は thread.title をそのまま見出しとして描画するため）。
				// title が空＝reze発、という前提で unj/reze 双方の表示側が振り分ける
				// （reze側は lib/post/post-title.ts の getDistinctTitle 参照）。
				// title は空文字のまま保存する（threads.title は NOT NULL 制約）。
				// board_id は固定で 1。cc_user_avatar も reze発は常に0（既存踏襲）。
				const { text: insertSql, params: insertParams } = buildInsert("threads", [
					["created_at", raw("CURRENT_TIMESTAMP")],
					[
						"dat_key",
						raw(`GREATEST(
               FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP))::BIGINT,
               (SELECT COALESCE(MAX(dat_key), 0) + 1 FROM threads)
             )`),
					],
					["ip", raw("'0.0.0.0'::inet")],
					["res_count", val(1)],
					[
						"latest_res",
						val(authorIsPrivate ? "" : latestResPreview(mmlResolved.content)),
					],
					["latest_res_at", raw("CURRENT_TIMESTAMP")],
					["title", val("")],
					["board_id", val(1)],
					["res_limit", val(RES_LIMIT)],
					["cc_bitmask", val(DEFAULT_CC_BITMASK)],
					["content_types_bitmask", val(DEFAULT_CONTENT_TYPES_BITMASK)],
					["user_id", val(authorId)],
					// cc_user_id は reze の掲示板モード（lib/social/avatar.tsx:getUserIdLabel）が
					// 「ID:」として表示する値。生の users.id (=String(authorId)) をそのまま
					// 入れると連番が丸見えになるため genBbsId でハッシュ化する。
					["cc_user_id", val(genBbsId(authorId, 1))],
					// unj で ★（キャップ）◆（トリップ）に見えないよう unj と同じ名前エスケープを掛ける
					// （cc_bitmask は DEFAULT_CC_BITMASK 固定で、名前表示(4)を含む）
					["cc_user_name", val(sanitizeBbsUserName(data.displayName || "名無し"))],
					["cc_user_avatar", val(0)],
					["avatar_color", val(data.avatarColor ?? null)],
					["content_text", val(c.contentText)],
					["content_url", val(c.contentUrl)],
					["content_type", val(c.contentType)],
					["content_data_url", val(c.contentDataUrl)],
					["mml_delete_id", val(c.mmlDeleteId)],
					["mml_delete_hash", val(c.mmlDeleteHash)],
					["image_delete_id", val(imageTokensForInsert(c.contentUrl, data)[0])],
					["image_delete_hash", val(imageTokensForInsert(c.contentUrl, data)[1])],
					// お絵描き投稿もコラボの起点になる（CollabSelector→DrawingEditor/DotDrawingEditor）。
					// ここに hasImage を足し忘れると post.hasImage && post.hasCollabButton が
					// 常にfalseになり、画像に「コラボ」ボタンが一度も出ないまま導線が死ぬ。
					// MML投稿（c.contentType===CT.Dtm）も同じ理由で足し忘れると、MML埋め込みに
					// 「コラボ」ボタンが一度も出ないまま導線が死ぬ（表示側はhasCollabButtonを
					// 見るだけなので、ここで立てなければ何も表示されない）。
					// 画像は imageIsDrawn（DrawingEditor/DotDrawingEditor経由）のときだけ対象。
					// スマホ撮影写真等のプレーンアップロードには「コラボ」を出さない
					// （編集可能なソースを持たず、コラボという行為自体が成立しないため）。
					[
						"has_collab_button",
						val(
							!!(
								data.gameId ||
								data.mvId ||
								data.talkId ||
								data.otomadId ||
								// 画像は実際に画像として保存されるときだけ（deriveInsertContent が落とした URL は数えない）
								(c.contentType === CT.Image && data.imageIsDrawn) ||
								c.contentType === CT.Dtm
							),
						),
					],
					["game_id", val(data.gameId ?? null)],
					["mv_id", val(data.mvId ?? null)],
					["talk_id", val(data.talkId ?? null)],
					["otomad_id", val(data.otomadId ?? null)],
					// 権利表記・ドット絵メタはルートでも検査しているが、共有行に入る値なのでここでも絞る
					["origin_type", val(validOriginType(data.originType))],
					["dot_w", val(dotMetaValue(data.dotW, DOT_META_MAX.dotW))],
					["dot_h", val(dotMetaValue(data.dotH, DOT_META_MAX.dotH))],
					["anim_frames", val(dotMetaValue(data.animFrames, DOT_META_MAX.animFrames))],
					["anim_fps", val(dotMetaValue(data.animFps, DOT_META_MAX.animFps))],
					["walk_preset", val(data.walkPreset ?? null)],
				]);
				const { rows } = await q(`${insertSql} RETURNING *`, insertParams);
				row = rows[0];
			} catch (e: any) {
				if (e?.code !== "23505" || attempt === 4) throw e;
			}
		}
		// isRezeAuthorRow（slug を付けるか）と表示名はこの値で決まる。AUTHOR_SELECT の代わり
		row.author_display_name = userRows[0]?.display_name;
		row.author_avatar_url = userRows[0]?.avatar_url;
		// 呼び出し側（app/api/posts/route.ts）が鍵アカの投稿をリアルタイム配信しない判定に使う
		row.author_is_private = authorIsPrivate;
		return threadRowToPost(row, []);
	},

	async likePost(id: number, userId: string) {
		const post = await voteOnPost(id, "good_count", userId);
		// 見えない投稿（鍵アカ・削除済み・他板）には加算も通知もしない
		if (post) await notifyPostAction(id, userId, "like");
		return post;
	},
	async dislikePost(id: number, userId: string) {
		return voteOnPost(id, "bad_count", userId);
	},

	async heartPost(id: number, userId: string, count = 1) {
		const table = isReplyPostId(id) ? "res" : "threads";
		const rawId = isReplyPostId(id) ? postIdToResId(id) : postIdToThreadId(id);
		// 先に押した本人の視点で見えるかを確かめる（voteOnPost と同じ理由）。
		// viewer 無しで引くと鍵アカの投稿が null（＝404）になる
		const post = await pgStore.getPost(id, userId, { withReplies: false });
		if (!post) return null;
		// 上限はルート側（app/api/posts/[id]/route.ts MAX_HEARTS_PER_REQUEST）で切る。
		// ここでは負数・小数で hearts_total を減らせないことと、INTEGER の上限で
		// 22003（以後その投稿へのハートが全部 500）にならないことだけ保証する。
		const n = Math.max(1, Math.floor(Number(count) || 1));
		const { rows } = await q<{ n: number }>(
			`UPDATE ${table} SET hearts_total = LEAST(hearts_total::bigint + $1, 2147483647)
        WHERE id = $2 RETURNING hearts_total AS n`,
			[n, rawId],
		);
		await notifyPostAction(id, userId, "heart");
		// 読み直さずに加算後の値だけ差し替える（hide_reactions で伏せている数は伏せたまま）
		if (rows[0] && !post.reactionsHidden) post.heartsTotal = Number(rows[0].n);
		return post;
	},

	/**
	 * リポストのトグル。誰がリポストしたかは post_reposts に1行ずつ持つ（以前は
	 * threads/res.reposted という全員共通のフラグを反転していたので、誰かが押すと
	 * 全員の表示が切り替わっていた）。reposts は非正規化した件数で、行が実際に
	 * 増えた/減ったときだけ ±1 する（連打の競合でも件数と行がずれない）。
	 * 呼び出し側（PUT /api/posts/[id]）でセッション必須。
	 */
	async repostPost(id: number, userId?: string) {
		const uid = toUid(userId);
		if (uid === null) return null;
		const isReply = isReplyPostId(id);
		const table = isReply ? "res" : "threads";
		const kind = isReply ? REPOST_KIND_RES : REPOST_KIND_THREAD;
		const rawId = isReply ? postIdToResId(id) : postIdToThreadId(id);
		// 見えない投稿（鍵アカ・削除済み）には押させない
		const visible = await pgStore.getPost(id, userId, { withReplies: false });
		if (!visible) return null;
		const { rows: removed } = await q(
			`DELETE FROM post_reposts WHERE user_id = $1 AND post_kind = $2 AND target_id = $3 RETURNING 1`,
			[uid, kind, rawId],
		);
		if (removed.length > 0) {
			await q(
				`UPDATE ${table} SET reposts = GREATEST(reposts - 1, 0) WHERE id = $1`,
				[rawId],
			);
		} else {
			const { rows: added } = await q(
				`INSERT INTO post_reposts (user_id, post_kind, target_id) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING RETURNING 1`,
				[uid, kind, rawId],
			);
			if (added.length > 0) {
				await q(`UPDATE ${table} SET reposts = reposts + 1 WHERE id = $1`, [
					rawId,
				]);
				// リポスト解除ではなく「リポストした」瞬間だけ通知する
				await notifyPostAction(id, String(uid), "repost");
			}
		}
		return pgStore.getPost(id, userId, { withReplies: false });
	},

	async getReplies(postId: number, userId?: string, options?: GetRepliesOptions) {
		// postId はOPを指す想定だが、レスのidが来ても同じスレッドへ解決する
		const threadId = isReplyPostId(postId)
			? Number(
					(
						await q<{ thread_id: number }>(
							`SELECT thread_id FROM res WHERE id = $1`,
							[postIdToResId(postId)],
						)
					).rows[0]?.thread_id,
				)
			: postIdToThreadId(postId);
		if (!Number.isFinite(threadId)) return [];
		const hidden = await getHiddenUserIds(userId);
		// 常に「新しい順に limit 件」だけ引く。スレ全件を返すと1000レスのスレを
		// 開いただけで転送量枠を持っていかれる（docs/NEON_EGRESS.md）。
		// beforeNum があればそれより古い側の直近 limit 件＝上スクロールの追加読み込み。
		const limit = Math.max(
			1,
			Math.min(options?.limit ?? REPLIES_PAGE_SIZE, RES_LIMIT),
		);
		const params: any[] = [threadId];
		let cursorWhere = "";
		if (options?.beforeNum != null && Number.isFinite(options.beforeNum)) {
			params.push(options.beforeNum);
			cursorWhere = ` AND r.num < $${params.length}`;
		}
		// 鍵アカのレスは除外（窓を切る前に落とす）。スレ主が鍵アカで見えないスレは
		// レスも丸ごと返さない（相関しない EXISTS なので1回だけ評価される）。
		// 削除済みのスレ（unj の !timer・強制削除）と板1以外のスレも同じく丸ごと返さない。
		// threads.res_count は除外ぶんも数えたまま＝「N件の返信」は見えない分を含む。
		// 番号（num）は欠番になる（削除と同じ見え方）。
		const viewerUid = toUid(userId);
		const visible = authorVisibleSql("r.user_id", params, viewerUid);
		const threadVisible = authorVisibleSql("t.user_id", params, viewerUid, "tu");
		params.push(limit);
		const { rows: desc } = await q(
			`SELECT r.*, ${AUTHOR_SELECT} FROM res r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.thread_id = $1${cursorWhere} AND ${visible}
         AND EXISTS (SELECT 1 FROM threads t LEFT JOIN users tu ON tu.id = t.user_id
                      WHERE t.id = $1 AND t.deleted_at IS NULL AND t.board_id = 1
                        AND ${threadVisible})
       ORDER BY r.num DESC LIMIT $${params.length}`,
			params,
		);
		// 表示は常に古い→新しいの昇順。
		const rows = desc.reverse();
		const filtered = rows.filter((r) => !hidden.has(Number(r.user_id)));
		const numToPostId = new Map<number, number>([
			[1, threadToPostId(threadId)],
		]);
		for (const r of filtered)
			numToPostId.set(Number(r.num), resToPostId(Number(r.id)));
		return finalizeForViewer(
			filtered.map((r) => {
				const post = resRowToPost(r);
				const parentNum = r.parent_num != null ? Number(r.parent_num) : 1;
				post.parentPostId =
					numToPostId.get(parentNum) ?? threadToPostId(threadId);
				return post;
			}),
			userId,
		);
	},
	async addReply(postId: number, data: ReplyParams) {
		// DataStore.addReply(postId, ...) の postId は「返信先スレッド」＝OPのid。
		// レスのidが渡ってきた場合も同じスレッドへ解決する（API層は基本OPのidを渡す）。
		const threadId = isReplyPostId(postId)
			? Number(
					(
						await q<{ thread_id: number }>(
							`SELECT thread_id FROM res WHERE id = $1`,
							[postIdToResId(postId)],
						)
					).rows[0]?.thread_id,
				)
			: postIdToThreadId(postId);
		if (!Number.isFinite(threadId)) return null;
		const authorId = data.slug ? Number(data.slug) : null;
		if (authorId == null || !Number.isFinite(authorId)) {
			throw new Error("addReply には解決済みの投稿者(slug=users.id)が必要です");
		}

		// 鍵アカのスレには、スレ主本人とスレ主がフォローしている人しか書き込めない
		// （見えないスレに返信できると、返信の通知や res_count から存在が漏れる）。
		// reze が書けるのは板1の生きているスレだけ（unj の他の板・削除済みのスレには書かせない）。
		// unj のスレ規則（!バルス・!バルサン・投稿種別・ID/名前の表示・強制sage）もここで読む。
		// 書けなかったとき（下の INSERT が0行）に理由を確かめるためにもう一度読むので関数にする。
		const readThread = async () => {
			const threadParams: any[] = [threadId];
			const threadVisible = authorVisibleSql(
				"t.user_id",
				threadParams,
				authorId,
			);
			const { rows } = await q(
				`SELECT t.id, t.user_id, t.board_id, t.res_limit, t.res_count, t.bals_res_num, t.varsan, t.sage,
               t.content_types_bitmask, t.cc_bitmask, COALESCE(u.is_private, FALSE) AS owner_is_private
          FROM threads t LEFT JOIN users u ON u.id = t.user_id
         WHERE t.id = $1 AND t.deleted_at IS NULL AND t.board_id = 1 AND ${threadVisible}`,
				threadParams,
			);
			return rows[0] ?? null;
		};
		const thread = await readThread();
		if (!thread) return null;
		const isOwner = authorId === Number(thread.user_id);

		// unj（src/server/api/res.ts）と同じスレ規則。reze から書けば素通りできてしまわないように。
		// 判定は MML の外部化（R2 への書き込み）より前に済ませる（弾く書き込みのために R2 へ上げると、
		// 削除トークンも返せない孤児が残る）。外部化しても content_type は変わらない
		// （生MMLが残っていても URL に置き換わっても Dtm）ので、ここで決まる種別で足りる。
		// 同じ条件は下の INSERT でもロックした行に対して見直す（外部化の間に !バルス された場合など）。
		assertReplyAllowed(thread, isOwner);
		threadContentType(
			thread.content_types_bitmask,
			deriveInsertContent(data).contentType,
		);
		const resLimit = replyLimitOf(thread);
		// 埋まっているスレも外部化の前に弾く（res_count は unj と同じく最大のレス番号）。
		// 正式な判定は下の INSERT（同時に書かれた分はそちらで止まる）
		if (Number(thread.res_count ?? 1) >= resLimit) throw threadFullError(resLimit);

		const { rows: userRows } = await q(
			`SELECT display_name, avatar_url, is_private FROM users WHERE id = $1`,
			[authorId],
		);
		const authorIsPrivate = !!userRows[0]?.is_private;

		let parentNum = 1;
		if (
			data.parentPostId != null &&
			data.parentPostId !== threadToPostId(threadId)
		) {
			if (isReplyPostId(data.parentPostId)) {
				const parentResId = postIdToResId(data.parentPostId);
				const { rows: pr } = await q(
					`SELECT num FROM res WHERE id = $1 AND thread_id = $2`,
					[parentResId, threadId],
				);
				if (pr.length) parentNum = Number(pr[0].num);
			}
		}

		const mmlResolved = await ensureMmlExternalized(data.content, data);
		const c = deriveInsertContent({ ...data, ...mmlResolved });
		// 保存する種別（コード進行が許されていないスレではテキスト）。同じ判定を上で通っているので、
		// ここで投げることはない
		const contentType = threadContentType(
			thread.content_types_bitmask,
			c.contentType,
		);
		// ID・名前の表示はスレの cc_bitmask に従う（unj cc.ts の makeCcUserId / makeCcUserName と同じ判定:
		// 1|2 なら ID、4 なら名前）。NULL は reze 発スレの既定値と同じ扱い。
		const ccBitmask =
			thread.cc_bitmask != null ? Number(thread.cc_bitmask) : DEFAULT_CC_BITMASK;
		// 強制sageのスレではレスも sage にし、スレを上げない（latest_res_at を進めない）
		const sage = !!thread.sage;
		// num はSERIALではなく手計算(UNIQUE(thread_id,num))。unj と同じくスレの行を FOR UPDATE で
		// ロックしてから番号を取り、スレ規則と上限の判定・res の INSERT・threads の更新を1文で行う
		// （neon の HTTP 経路は1文＝1トランザクション。ファイル先頭「トランザクションについて」）。
		// 1文なので、ロックを待ったあとも res を読むサブクエリのスナップショットは古いまま
		// （待っている間に入ったレスが見えない）。一方 FOR UPDATE で取った threads の行は、待ったあとの
		// 最新版になる（READ COMMITTED の再評価）。unj も reze も、res を入れたトランザクションの中で
		// res_count を最大のレス番号に揃えるので、番号は GREATEST(t.res_count, MAX(num)) + 1 で取る。
		// res_count を揃えない書き込みとはそれでもぶつかりうる（23505）ので、少し待って文ごとやり直す。
		let inserted: any = null;
		for (let attempt = 0; attempt < 5; attempt++) {
			try {
				// thread_id は必ず先頭のentry = $1 にする（"num"の相関サブクエリと、
				// ロックする CTE の WHERE が thread_id=$1 を直接参照しているため）。
				const threadIdEntry: InsertEntry = ["thread_id", val(threadId)];
				// このスレの最大のレス番号（採番と上限の判定で共通）。t はロックした threads の行
				const maxNumSql =
					"GREATEST(t.res_count, (SELECT COALESCE(MAX(num),1) FROM res WHERE thread_id=$1))";
				const { text: insertSql, params } = buildInsertSelect(
					"res",
					[
						threadIdEntry,
						["num", raw(`${maxNumSql}+1`)],
						["created_at", raw("CURRENT_TIMESTAMP")],
						["ip", raw("'0.0.0.0'::inet")],
						["is_owner", val(isOwner)],
						["sage", val(sage)],
						["user_id", val(authorId)],
						// cc_user_id は createPost と同じく genBbsId でハッシュ化する（board_id固定1）
						["cc_user_id", val((ccBitmask & 3) !== 0 ? genBbsId(authorId, 1) : "")],
						// 名前は unj の名前エスケープを掛けてから（★◆ を偽装させない）
						[
							"cc_user_name",
							val(
								(ccBitmask & 4) !== 0
									? sanitizeBbsUserName(data.displayName || "名無し")
									: "",
							),
						],
						["cc_user_avatar", val(0)],
						["avatar_color", val(data.avatarColor ?? null)],
						["content_text", val(c.contentText)],
						["content_url", val(c.contentUrl)],
						["content_type", val(contentType)],
						["content_data_url", val(c.contentDataUrl)],
						["mml_delete_id", val(c.mmlDeleteId)],
						["mml_delete_hash", val(c.mmlDeleteHash)],
						["image_delete_id", val(imageTokensForInsert(c.contentUrl, data)[0])],
						["image_delete_hash", val(imageTokensForInsert(c.contentUrl, data)[1])],
						// createPost と同じ理由でhasImage/MMLも起点にする。
						// 画像はimageIsDrawn（お絵かき/ドット絵編集由来）のときだけ対象。
						[
							"has_collab_button",
							val(
								!!(
									data.gameId ||
									data.mvId ||
									data.talkId ||
									data.otomadId ||
									(c.contentType === CT.Image && data.imageIsDrawn) ||
									c.contentType === CT.Dtm
								),
							),
						],
						["game_id", val(data.gameId ?? null)],
						["mv_id", val(data.mvId ?? null)],
						["talk_id", val(data.talkId ?? null)],
						["otomad_id", val(data.otomadId ?? null)],
						["parent_num", val(parentNum)],
						// createPost と同じく共有行に入る値を絞る
						["origin_type", val(validOriginType(data.originType))],
						["dot_w", val(dotMetaValue(data.dotW, DOT_META_MAX.dotW))],
						["dot_h", val(dotMetaValue(data.dotH, DOT_META_MAX.dotH))],
						["anim_frames", val(dotMetaValue(data.animFrames, DOT_META_MAX.animFrames))],
						["anim_fps", val(dotMetaValue(data.animFps, DOT_META_MAX.animFps))],
						["walk_preset", val(data.walkPreset ?? null)],
					],
					// 上限は unj の res_limit と RES_LIMIT の小さい方（num は SMALLINT、
					// lib/bbs/thread-limits.ts）。ロックした行が無い（下の条件を満たさない）か上限なら0行
					`FROM t WHERE ${maxNumSql} < LEAST(COALESCE(t.res_limit, ${RES_LIMIT}), ${RES_LIMIT})`,
				);
				// 上のコメント通り thread_id が $1 になっていることを保証する
				if (params[0] !== threadId) {
					throw new Error(
						"addReply: thread_id が $1 ではありません（num の相関サブクエリが壊れます）",
					);
				}
				// ロックする行の条件。上で確かめたスレ規則（!バルス・!バルサン・種別・鍵アカのスレ）を、
				// ロックした最新の行でもう一度見る（MML の外部化の間に unj で !バルス されていても書かない）
				params.push(authorId);
				const authorParam = `$${params.length}`;
				params.push(contentType);
				const typeParam = `$${params.length}`;
				const lockVisible = authorVisibleSql("th.user_id", params, authorId);
				// res_count は unj と同じく「最大のレス番号」（unj は res_count=num）。
				// ±1 で数えると、レスの削除や unj 側の書き込みとずれていく。
				const threadSets = ["res_count = GREATEST(threads.res_count, ins.num)"];
				// latest_res は unj 側の一覧に本文の抜粋として出るので、鍵アカのレスでは書き換えない
				if (!authorIsPrivate) {
					params.push(latestResPreview(data.content));
					threadSets.push(`latest_res = $${params.length}`);
				}
				if (!sage) threadSets.push("latest_res_at = CURRENT_TIMESTAMP");
				const { rows } = await q(
					`WITH t AS (
             SELECT th.id, th.res_limit, th.res_count
               FROM threads th LEFT JOIN users u ON u.id = th.user_id
              WHERE th.id = $1 AND th.deleted_at IS NULL AND th.board_id = 1
                AND th.bals_res_num = 0 AND (NOT th.varsan OR th.user_id = ${authorParam})
                AND (th.content_types_bitmask IS NULL OR (th.content_types_bitmask & ${typeParam}) <> 0)
                AND ${lockVisible}
              FOR UPDATE OF th
           ), ins AS (
             ${insertSql}
             RETURNING *
           ), upd AS (
             UPDATE threads SET ${threadSets.join(", ")}
               FROM ins WHERE threads.id = ins.thread_id
             RETURNING threads.id
           )
           SELECT ins.* FROM ins`,
					params,
				);
				inserted = rows[0] ?? null;
				break;
			} catch (e: any) {
				if (e?.code !== "23505" || attempt === 4) throw e;
				await sleepBeforeRetry();
			}
		}
		if (!inserted) {
			// 0行＝ロックした時点で書けなくなっていた。理由を読み直して返す: スレが消えた・板が変わった・
			// 見えなくなったなら null、!バルス・!バルサン・種別なら 403/400、どれでもなければ上限（409）
			const latest = await readThread();
			if (!latest) return null;
			assertReplyAllowed(latest, isOwner);
			threadContentType(latest.content_types_bitmask, contentType);
			throw threadFullError(replyLimitOf(latest));
		}

		// ここから下はレスを保存した後。通知の失敗で 500 を返すと、利用者が再送して
		// 同じレスが二重に入るので、失敗はログだけにする。
		// 宛先は reze の利用者（display_name あり）だけで、システム用 id とブロック関係
		// （どちら向きでも）の相手には送らない。
		const blockFree = `NOT EXISTS (SELECT 1 FROM user_blocks b
          WHERE (b.blocker_user_id = u.id AND b.blocked_user_id = $1)
             OR (b.blocker_user_id = $1 AND b.blocked_user_id = u.id))`;
		// 宛先がこのレスを読めること（getPost / getReplies と同じ可視性）。読めない相手に通知すると、
		// 投稿者・スレ・レスの存在が漏れる（通知を開いても getPost は null）。
		// 鍵アカの投稿者のレスは、投稿者がフォローしている相手にしか見えない。
		const replyVisible = authorIsPrivate
			? ` AND EXISTS (SELECT 1 FROM user_follows af WHERE af.follower_user_id = $1 AND af.followed_user_id = u.id)`
			: "";
		// 通知（返信先の投稿者へ）。自分自身への返信は通知しない。スレ主は自分のスレを常に読める
		if (!isOwner) {
			try {
				await q(
					`INSERT INTO notifications (type, actor_user_id, target_user_id, thread_id, res_num)
           SELECT 'reply', $1, u.id, $3, $4 FROM users u
            WHERE u.id = $2 AND u.display_name IS NOT NULL AND u.id <> ${SYSTEM_USER_ID}
              AND ${blockFree}${replyVisible}`,
					[authorId, Number(thread.user_id), threadId, inserted.num],
				);
			} catch (e) {
				console.warn("[addReply] 返信の通知に失敗しました（レスは保存済み）", e);
			}
		}
		// @メンション通知。content 中の @<数値ID> を宛先として解釈する。
		// 1文の INSERT ... SELECT にまとめる（1件ずつ SELECT と INSERT を流すと、@ を並べるだけで
		// Workers のサブリクエスト上限まで DB を叩かせられた）。
		const mentionIds = mentionTargetsOf(
			data.content,
			authorId,
			Number(thread.user_id),
		);
		if (mentionIds.length > 0) {
			try {
				const mentionParams: SqlParam[] = [
					authorId,
					mentionIds,
					threadId,
					inserted.num,
				];
				// 鍵アカのスレのレスは、スレ主がフォローしている相手にしか見えない（スレ主はメンションの
				// 宛先から外してある）。使わない $N を渡すと型が決まらず文ごと失敗するので、要るときだけ足す
				let threadVisibleToTarget = "";
				if (thread.owner_is_private) {
					mentionParams.push(Number(thread.user_id));
					threadVisibleToTarget = ` AND EXISTS (SELECT 1 FROM user_follows tf WHERE tf.follower_user_id = $${mentionParams.length} AND tf.followed_user_id = u.id)`;
				}
				await q(
					`INSERT INTO notifications (type, actor_user_id, target_user_id, thread_id, res_num)
           SELECT 'mention', $1, u.id, $3, $4 FROM users u
            WHERE u.id = ANY($2::int[]) AND u.display_name IS NOT NULL AND u.id <> ${SYSTEM_USER_ID}
              AND ${blockFree}${replyVisible}${threadVisibleToTarget}`,
					mentionParams,
				);
			} catch (e) {
				console.warn("[addReply] メンションの通知に失敗しました（レスは保存済み）", e);
			}
		}

		inserted.author_display_name = userRows[0]?.display_name;
		inserted.author_avatar_url = userRows[0]?.avatar_url;
		// 呼び出し側が鍵アカのレスをリアルタイム配信しない判定に使う
		inserted.author_is_private = authorIsPrivate;
		const post = resRowToPost(inserted);
		post.parentPostId =
			parentNum === 1 ? threadToPostId(threadId) : post.parentPostId;

		// 配信は呼び出し側（app/api/posts/[id]/replies/route.ts）が担う。ここでも publish
		// すると mock では出ないpg限定の二重配信になり、しかもここは attachEmbedInfo 前の
		// 素のpostなのでゲーム/MV埋め込み情報が欠けたデータが先に飛んでしまう。
		return post;
	},

	async editPost(
		id: number,
		userId: string,
		content: string,
		originType?: OriginType | null,
		imageSrc?: string,
		mml?: MmlRef,
		dotMeta?: DotMetaEdit,
		imageRef?: ImageDeleteRef,
	) {
		const isReply = isReplyPostId(id);
		const table = isReply ? "res" : "threads";
		const rawId = isReply ? postIdToResId(id) : postIdToThreadId(id);
		// 編集できるのは板1の生きているスレとそのレスだけ（reze が扱う板は板1だけ。
		// unj の他の板や削除済みのスレの行を reze から書き換えさせない）。
		// is_deleted は deletePost が残したプレースホルダか（本文は大きくなりうるので SQL 側で比べる）
		const deletedSql = (a: string) =>
			`(${a}.content_type = ${CT.Text} AND ${a}.content_url = '' AND ${a}.content_text = $2) AS is_deleted`;
		const { rows } = await q(
			isReply
				? `SELECT r.user_id, r.content_type, r.content_url, r.content_data_url, r.mml_delete_id, r.mml_delete_hash, r.image_delete_id, r.image_delete_hash,
                  ${deletedSql("r")}, t.bals_res_num, t.content_types_bitmask
             FROM res r JOIN threads t ON t.id = r.thread_id
            WHERE r.id = $1 AND t.board_id = 1 AND t.deleted_at IS NULL`
				: `SELECT t.user_id, t.content_type, t.content_url, t.content_data_url, t.mml_delete_id, t.mml_delete_hash, t.image_delete_id, t.image_delete_hash,
                  ${deletedSql("t")}
             FROM threads t WHERE t.id = $1 AND t.board_id = 1 AND t.deleted_at IS NULL`,
			[rawId, DELETED_POST_TEXT],
		);
		if (rows.length === 0 || String(rows[0].user_id) !== userId) return null;
		const prevRow = rows[0];
		// 削除済み（プレースホルダ）は書き戻させない。削除で返した削除トークンでクライアントが R2 の
		// 実体を消したあとに中身を戻せると、番号を保ったままの行が「削除した」はずの内容を指し直す
		// （通知や >>N アンカーもそのまま生き返る）
		if (prevRow.is_deleted) return null;
		// !バルス で終わったスレのレスは書き換えさせない（unj にレスの編集は無く、終わったスレは凍結。
		// reze から書けば素通りできてしまわないように）。削除はできる
		if (isReply && Number(prevRow.bals_res_num ?? 0) !== 0) {
			throw userError("このスレッドは終了しています", 403);
		}

		const sets: string[] = [];
		const vals: any[] = [];
		const push = (col: string, v: unknown) => {
			vals.push(v);
			sets.push(`${col} = $${vals.length}`);
		};

		// 旧MMLの削除トークン。content_data_url を実際に別の値へ差し替える分岐でだけ埋める。
		// 新しい値が旧URLと同じ（無編集の再送）ときは何もしない — DBがまだ指している
		// 実体をここで消してしまうと、他の閲覧者から見て再生不能になる事故になる。
		let previousMml: { deleteId: string; deleteHash: string } | undefined;
		const capturePreviousMmlIfReplaced = (
			newDataUrl: string | null | undefined,
		) => {
			if (
				Number(prevRow.content_type) === CT.Dtm &&
				prevRow.mml_delete_id &&
				prevRow.content_data_url &&
				prevRow.content_data_url !== (newDataUrl || "")
			) {
				previousMml = {
					deleteId: prevRow.mml_delete_id,
					deleteHash: prevRow.mml_delete_hash,
				};
			}
		};

		// 画像も同じ考え方。content_url が実際に変わったときだけ、旧画像のトークンを
		// 返し（DB確定後にクライアントが消す）、新しい画像のトークンを書く。
		// 同じURLの再送（本文だけ直した編集でも imageSrc は送られてくる）で
		// トークンを上書きすると、クライアントは旧トークンを持っていないので消えてしまう。
		let previousImage: { deleteId: string; deleteHash: string } | undefined;
		const setImageTokensIfReplaced = (newContentUrl: string) => {
			if ((prevRow.content_url || "") === newContentUrl) return;
			const [newId, newHash] = imageTokensForInsert(newContentUrl, imageRef ?? {});
			push("image_delete_id", newId);
			push("image_delete_hash", newHash);
			const prevRef = imageDeleteRefOf(prevRow);
			if (prevRef.imageDeleteId && prevRef.imageDeleteHash) {
				previousImage = {
					deleteId: prevRef.imageDeleteId,
					deleteHash: prevRef.imageDeleteHash,
				};
			}
		};

		// content_type は content_url/content_data_url と必ず連動させる。
		// text列だけ書き換えてtypeを放置すると、hasImage/hasMml が deriveDisplay で
		// 導出できなくなる（画像を足したのに反映されない/消したのにhasImageが残る事故）。
		//
		// 自動補正: 過去の不具合（クライアントの外部化失敗）で content_text に生の
		// `#mml` 本文がそのまま残ってしまった投稿は、本文だけの編集（mml未指定）で
		// 再編集しても content が丸ごと再送されてくるので、ここで毎回マーカーの
		// 有無を確認し、見つかれば都度SQLを流さなくても再編集のタイミングで
		// content_type/content_data_url を修復する。
		const hasInlineMml = extractMmlFromContent(content) !== null;
		const rewritesMml = mml !== undefined || hasInlineMml;
		// 保存済みの添付画像の再送（本文だけ直した編集でもモーダルは imageSrc を送り直す）は、添付に
		// 触れない本文だけの編集として扱う。新規保存の規則（deriveInsertContent）に掛け直すと、規則より
		// 前の行（data: の画像など）の画像や、unj のお絵描き（1024）の種別が編集のたびに落ちる。
		// 表示でも描かない URL（javascript: など）は保たない（下の分岐で落とす）。
		const keepsImage =
			typeof imageSrc === "string" &&
			imageSrc === (prevRow.content_url || "") &&
			displayImageUrlOf(imageSrc) !== undefined &&
			(Number(prevRow.content_type) === CT.Image ||
				Number(prevRow.content_type) === CT.Oekaki);
		const rewritesImage = !rewritesMml && imageSrc !== undefined && !keepsImage;
		// 種別が変わるレスの編集はスレの content_types_bitmask に従う（addReply と同じ規則。テキストで
		// 書いてから画像や MML に書き換えれば素通りできてしまわないように）。種別が変わらない編集は
		// 見ない（書いたあとにスレの設定が変わっても、本文の誤字直しはできるように）。スレの OP は
		// 自分のスレなので見ない（unj のスレ主は reze から編集できない）。
		const typeFor = (planned: number) =>
			isReply && planned !== Number(prevRow.content_type)
				? threadContentType(prevRow.content_types_bitmask, planned)
				: planned;
		// 判定は MML の外部化（R2 への書き込み）より前に済ませる（弾く編集のために R2 へ上げない）。
		// 外部化しても種別は変わらない（生MMLが残っても URL に置き換わっても Dtm）
		if (rewritesMml || rewritesImage) {
			typeFor(
				deriveInsertContent({
					content,
					mmlUrl: mml?.mmlUrl,
					hasImage: !!imageSrc,
					imageSrc,
				}).contentType,
			);
		}
		const mmlResolved = await ensureMmlExternalized(content, mml);
		const needsMmlRewrite = !!mmlResolved.mmlUrl;
		if (rewritesMml || needsMmlRewrite) {
			const c = deriveInsertContent({
				content: mmlResolved.content,
				mmlUrl: mmlResolved.mmlUrl,
				mmlDeleteId: mmlResolved.mmlDeleteId,
				mmlDeleteHash: mmlResolved.mmlDeleteHash,
				hasImage: !!imageSrc,
				imageSrc,
			});
			push("content_text", c.contentText);
			push("content_url", c.contentUrl);
			push("content_type", typeFor(c.contentType));
			push("content_data_url", c.contentDataUrl);
			push("mml_delete_id", c.mmlDeleteId);
			push("mml_delete_hash", c.mmlDeleteHash);
			capturePreviousMmlIfReplaced(c.contentDataUrl);
			setImageTokensIfReplaced(c.contentUrl);
			// MML編集（この分岐）も画像編集（下の分岐）と同じくコラボの起点にする。
			// c.contentType===CT.Dtm を見落とすとMML埋め込みだけ「コラボ」ボタンが
			// 一度も出ないまま導線が死ぬ（createPost/addReplyと同じ罠）。
			// 画像は deriveInsertContent が画像として残したときだけ（不正な URL は落ちている）
			if (c.contentType === CT.Image || c.contentType === CT.Dtm)
				push("has_collab_button", true);
		} else if (rewritesImage) {
			const c = deriveInsertContent({
				content,
				hasImage: !!imageSrc,
				imageSrc,
			});
			push("content_text", c.contentText);
			push("content_url", c.contentUrl);
			push("content_type", typeFor(c.contentType));
			push("content_data_url", c.contentDataUrl);
			push("mml_delete_id", c.mmlDeleteId);
			push("mml_delete_hash", c.mmlDeleteHash);
			capturePreviousMmlIfReplaced(c.contentDataUrl);
			setImageTokensIfReplaced(c.contentUrl);
			// 画像を新たに足した／差し替えた編集はコラボの起点にする。createPost/addReply
			// と同じ理由（お絵描き投稿は自動的にコラボ可能にする設計）。
			if (c.contentType === CT.Image) push("has_collab_button", true);
		} else {
			// 添付には触れない、本文だけの編集（同じ画像の再送を含む）。既存の content_type/URL は保つ
			push("content_text", content);
		}
		// null は「権利表記を外す」。ORIGIN_TYPE_OPTIONS に無い値は書かない（既存値を保つ。
		// ルートも検査しているが、共有行に任意の文字列を入れさせない多層防御）
		if (
			originType !== undefined &&
			(originType === null || validOriginType(originType) !== null)
		)
			push("origin_type", originType);
		// ドット絵素材メタの後付け編集。キーが渡された列だけ更新する（省略キーは既存値を保つ、
		// 値がnullならその列だけクリア）。これを設定した画像は SpriteImage のアニメ/歩行グラ
		// 再生対象になる＝一般の画像投稿を後からドット絵素材化する唯一の導線。
		// 範囲外の値（ルートの parseDotMeta が弾くはずのもの）は書かない（SMALLINT の 22003 を避ける）。
		if (dotMeta) {
			const pushDot = (
				col: string,
				v: number | null | undefined,
				max: number,
			) => {
				if (v == null) push(col, null);
				else if (dotMetaValue(v, max) !== null) push(col, v);
			};
			if ("dotW" in dotMeta) pushDot("dot_w", dotMeta.dotW, DOT_META_MAX.dotW);
			if ("dotH" in dotMeta) pushDot("dot_h", dotMeta.dotH, DOT_META_MAX.dotH);
			if ("animFrames" in dotMeta)
				pushDot("anim_frames", dotMeta.animFrames, DOT_META_MAX.animFrames);
			if ("animFps" in dotMeta)
				pushDot("anim_fps", dotMeta.animFps, DOT_META_MAX.animFps);
			if ("walkPreset" in dotMeta) push("walk_preset", dotMeta.walkPreset ?? null);
		}
		push("is_edited", true);

		vals.push(rawId);
		await q(
			`UPDATE ${table} SET ${sets.join(", ")} WHERE id = $${vals.length}`,
			vals,
		);
		const result = await pgStore.getPost(id, userId);
		// 旧オブジェクトの削除トークンをここにだけ載せて返す。DB更新が確定したあとに
		// 呼び出し側（app/api/posts/[id]/route.ts）がレスポンスに載せ、クライアントが
		// 消す（lib/post/game-mv-client.ts の updateGame/updateMv と同じ順序）。
		if (result) {
			const r = result as DbPost & {
				previousMml?: typeof previousMml;
				previousImage?: typeof previousImage;
			};
			r.previousMml = previousMml;
			r.previousImage = previousImage;
		}
		return result;
	},

	async deletePost(id: number, userId: string) {
		if (isReplyPostId(id)) {
			const resId = postIdToResId(id);
			// 消せるのは板1のスレのレスだけ（editPost と同じ）
			const { rows } = await q(
				`SELECT r.thread_id, r.user_id, r.content_type, r.content_url, r.content_data_url, r.mml_delete_id, r.mml_delete_hash, r.image_delete_id, r.image_delete_hash, r.game_id, r.mv_id, r.talk_id, r.otomad_id
           FROM res r JOIN threads t ON t.id = r.thread_id
          WHERE r.id = $1 AND t.board_id = 1`,
				[resId],
			);
			if (rows.length === 0 || String(rows[0].user_id) !== userId) return false;
			const row = rows[0];
			// レスもスレの OP と同じく論理削除（本文を「(削除されました)」に差し替えて添付を全部外す）。
			// 物理削除すると MAX(num)+1 の採番が消えた番号を再利用し、通知・!age・>>N アンカー・
			// 専ブラの dat のバイト位置が別のレスを指すようになる。res_count（=最大のレス番号）も減らさない。
			await q(
				`UPDATE res SET content_text = $1, content_url = '', content_type = $2,
         content_data_url = '', mml_delete_id = NULL, mml_delete_hash = NULL,
         image_delete_id = NULL, image_delete_hash = NULL,
         game_id = NULL, mv_id = NULL, talk_id = NULL, otomad_id = NULL, dot_w = NULL, dot_h = NULL,
         anim_frames = NULL, anim_fps = NULL, walk_preset = NULL
       WHERE id = $3`,
				[DELETED_POST_TEXT, CT.Text, resId],
			);
			// 本文・添付は二度と戻らないので、この時点でMML/画像/ゲーム・MVのR2オブジェクトを
			// 消しても復元不能事故にはならない（editPostのpreviousMmlと同じトークンの流儀）。
			// トークンは書き換える前に読んだ行から返す。orphanedManifestRefsOf は game_id 等を
			// 外した後に呼ぶ（このレス自身の参照を「まだ使われている」と数えないように）。
			return {
				threadId: threadToPostId(Number(row.thread_id)),
				...mmlDeleteRefOf(row),
				...imageDeleteRefOf(row),
				...(await orphanedManifestRefsOf(row, Number(userId))),
			};
		}
		const threadId = postIdToThreadId(id);
		const { rows } = await q(
			`SELECT user_id, content_type, content_url, content_data_url, mml_delete_id, mml_delete_hash, image_delete_id, image_delete_hash, game_id, mv_id, talk_id, otomad_id, res_count FROM threads WHERE id = $1 AND board_id = 1`,
			[threadId],
		);
		if (rows.length === 0 || String(rows[0].user_id) !== userId) return false;
		const row = rows[0];
		// res_count は OP自身を含む（返信0件なら1）。生きた返信が残っているスレに
		// deleted_at を立てて丸ごと隠すと、以後どのクエリも t.deleted_at IS NULL で
		// 除外するため、その返信は物理削除もされないまま「DB上は存在し件数にも数えられるが、
		// フィード/ハッシュタグ/最新レスのどこからも二度と辿れない」迷子状態になる
		// （当時の返信=物理削除・スレ=論理削除という非対称性が原因。実際にこれで
		// 表示不能になった返信を踏んだ。今は返信もプレースホルダ化する論理削除なので、
		// 返信が1件でも付いたスレは消しても生き続ける）。mock.ts（MockDb.deletePost）は元々これを避けて
		// 「子を持つ親はプレースホルダ化」する実装だったので、pg側もそれに合わせる：
		// deleted_at は立てず、本文だけ「(削除されました)」に差し替えて画像/MML/ゲーム/MV/
		// ドット絵メタを全部クリアする。スレ自体は生き続けるので返信は今まで通り辿れる。
		if (Number(row.res_count ?? 1) > 1) {
			await q(
				`UPDATE threads SET content_text = $1, content_url = '', content_type = $2,
         content_data_url = '', mml_delete_id = NULL, mml_delete_hash = NULL,
         image_delete_id = NULL, image_delete_hash = NULL,
         game_id = NULL, mv_id = NULL, talk_id = NULL, otomad_id = NULL, dot_w = NULL, dot_h = NULL,
         anim_frames = NULL, anim_fps = NULL, walk_preset = NULL
       WHERE id = $3`,
				[DELETED_POST_TEXT, CT.Text, threadId],
			);
			// 本文/添付は消えるが行自体とres_countは残るので、消えたR2実体だけ道連れにする
			// （deleted_atパスと同じ「DB確定後にR2を消す」順序、他投稿から参照が残っていれば
			// orphanedManifestRefsOf側でスキップされる）。
			return {
				threadId: threadToPostId(threadId),
				...mmlDeleteRefOf(row),
				...imageDeleteRefOf(row),
				...(await orphanedManifestRefsOf(row, Number(userId))),
			};
		}
		await q(`UPDATE threads SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1`, [
			threadId,
		]);
		// スレッドは論理削除（deleted_at）で、以後どのクエリも WHERE deleted_at IS NULL で
		// 除外するため復元・再表示の経路は無い（削除後に「元に戻す」があるのは、
		// DELETE APIが失敗したときのクライアント側の楽観更新ロールバックのみ）。
		// よってここも安全にR2側のMML/ゲーム・MVを消せる（返信が残っていない＝上のガードで
		// 保証済みなので、迷子になる返信も存在しない）。
		return {
			threadId: threadToPostId(threadId),
			...mmlDeleteRefOf(row),
			...imageDeleteRefOf(row),
			...(await orphanedManifestRefsOf(row, Number(userId))),
		};
	},

	async deleteMessage(id: number, userId: string) {
		const { rows } = await q(
			`SELECT sender_user_id FROM messages WHERE id = $1`,
			[id],
		);
		if (rows.length === 0 || String(rows[0].sender_user_id) !== userId)
			return false;
		await q(`DELETE FROM messages WHERE id = $1`, [id]);
		return true;
	},

	async getUserPostsBySlug(
		slug: string,
		userId?: string,
		limit = 20,
		before?: string,
	) {
		const uid = toUid(slug);
		// システム用 id（次スレ・管理画面の書き込み）は人ではないのでプロフィールを持たない
		if (!uid || uid === SYSTEM_USER_ID) return [];
		const safeLimit = Math.max(1, Math.min(limit, 50));
		const beforeDate =
			before && !Number.isNaN(Date.parse(before))
				? new Date(before).toISOString()
				: null;

		// 鍵アカのプロフィールは、本人と本人がフォローしている人以外には投稿0件
		// （ヘッダー＝名前・アイコン・自己紹介は見せる。app/api/users/[id] が isPrivate を返す）。
		// 出すのは reze 利用者（display_name あり）の、板1の、生きているスレとそのレスだけ。
		// users は unj と共有なので、ここを素通しにすると id を総当たりするだけで unj 利用者の
		// 全期間・全板の書き込みを人単位で集められる（ファイル先頭「ユーザー識別子」）。
		// レスはスレ主の可視性（鍵アカのスレ）も見る（getReplies と同じ）。
		const viewerUid = toUid(userId);
		const tParams: any[] = beforeDate ? [uid, beforeDate, safeLimit] : [uid, safeLimit];
		const tVisible = authorVisibleSql("t.user_id", tParams, viewerUid);
		const tScope = `t.board_id = 1 AND t.deleted_at IS NULL AND u.display_name IS NOT NULL`;
		const tQuery = beforeDate
			? `SELECT t.*, ${DAT_KEY_SELECT}, ${AUTHOR_SELECT} FROM threads t LEFT JOIN users u ON u.id = t.user_id
       WHERE t.user_id = $1 AND ${tScope} AND t.created_at < $2 AND ${tVisible} ORDER BY t.created_at DESC, t.id DESC LIMIT $3`
			: `SELECT t.*, ${DAT_KEY_SELECT}, ${AUTHOR_SELECT} FROM threads t LEFT JOIN users u ON u.id = t.user_id
       WHERE t.user_id = $1 AND ${tScope} AND ${tVisible} ORDER BY t.id DESC LIMIT $2`;

		const rParams: any[] = beforeDate ? [uid, beforeDate, safeLimit] : [uid, safeLimit];
		const rVisible = authorVisibleSql("r.user_id", rParams, viewerUid);
		const rThreadVisible = authorVisibleSql("t.user_id", rParams, viewerUid, "tu");
		const rFrom = `FROM res r LEFT JOIN users u ON u.id = r.user_id
       JOIN threads t ON t.id = r.thread_id LEFT JOIN users tu ON tu.id = t.user_id`;
		const rScope = `t.board_id = 1 AND t.deleted_at IS NULL AND u.display_name IS NOT NULL AND ${rThreadVisible}`;
		const rQuery = beforeDate
			? `SELECT r.*, ${AUTHOR_SELECT} ${rFrom}
       WHERE r.user_id = $1 AND ${rScope} AND r.created_at < $2 AND ${rVisible} ORDER BY r.created_at DESC, r.id DESC LIMIT $3`
			: `SELECT r.*, ${AUTHOR_SELECT} ${rFrom}
       WHERE r.user_id = $1 AND ${rScope} AND ${rVisible} ORDER BY r.id DESC LIMIT $2`;

		const [{ rows: tRows }, { rows: rRows }] = await Promise.all([
			q(tQuery, tParams),
			q(rQuery, rParams),
		]);

		const posts = [
			...tRows.map((r) => threadRowToPost(r)),
			...rRows.map((r) => resRowToPost(r)),
		]
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
			.slice(0, safeLimit);
		return finalizeForViewer(posts, userId);
	},

	async getUserDisplayName(slug: string) {
		// reze 利用者でない（display_name が NULL の unj 利用者・システム用 id・存在しない id）なら
		// undefined。/api/users/[id] と DM の宛先検査はこれで「reze 利用者か」を見分ける。
		// Number() だと "1.5" が通って integer 列で 22P02 の 500 になるので toUid を通す。
		const uid = toUid(slug);
		if (uid === null || uid === SYSTEM_USER_ID) return undefined;
		const { rows } = await q(`SELECT display_name FROM users WHERE id = $1`, [
			uid,
		]);
		const name = rows[0]?.display_name;
		return name == null ? undefined : sanitizeBbsUserName(name);
	},

	async getLikedPosts() {
		return [];
	},
	async getDislikedPosts() {
		return [];
	},
	async getHeartedPosts() {
		return [];
	},

	// 既読になった通知は「もう見た」ので一覧には出さない（未読のみ返す）
	async getNotifications(userId?: string) {
		const uid = toUid(userId);
		if (uid === null) return [];
		const { rows } = await q(
			`SELECT n.*, au.display_name AS actor_name, t.title AS thread_title, r.id AS res_id
         FROM notifications n
         LEFT JOIN users au ON au.id = n.actor_user_id
         LEFT JOIN threads t ON t.id = n.thread_id
         LEFT JOIN res r ON r.thread_id = n.thread_id AND r.num = n.res_num
        WHERE n.target_user_id = $1 AND n.read = FALSE
        ORDER BY n.id DESC LIMIT 50`,
			[uid],
		);
		return rows.map((r): DbNotification => {
			// res_num > 1 は返信そのものを指す（JOIN で拾った res.id からリンク先を作る）。
			// 対応する res 行が見つからない（削除済み等）場合だけリンク無しにする。
			const postId =
				r.thread_id == null
					? undefined
					: r.res_num != null && Number(r.res_num) > 1
						? r.res_id != null
							? resToPostId(Number(r.res_id))
							: undefined
						: threadToPostId(Number(r.thread_id));
			return {
				id: Number(r.id),
				actorSlug:
					r.actor_user_id != null ? String(r.actor_user_id) : undefined,
				targetSlug: String(r.target_user_id),
				// users.display_name 由来なので resolveDisplayName と同じく不可視文字・★◆ を潰す
				user: sanitizeBbsUserName(r.actor_name || ""),
				action: formatNotificationAction(r.type),
				target: r.thread_title || "",
				type: r.type,
				postId,
				targetUser: String(r.target_user_id),
				recipientId: String(r.target_user_id),
				read: !!r.read,
				createdAt: toIso(r.created_at),
				time: formatRelativeTime(toIso(r.created_at)),
			};
		});
	},

	async markNotificationRead(id: number, userId: string) {
		const uid = toUid(userId);
		if (uid === null) return;
		await q(
			`UPDATE notifications SET read = TRUE WHERE id = $1 AND target_user_id = $2`,
			[id, uid],
		);
	},
	async markAllNotificationsRead(userId: string) {
		const uid = toUid(userId);
		if (uid === null) return;
		await q(`UPDATE notifications SET read = TRUE WHERE target_user_id = $1`, [
			uid,
		]);
	},
	async deleteNotification(id: number, userId: string) {
		const uid = toUid(userId);
		if (uid === null) return;
		await q(`DELETE FROM notifications WHERE id = $1 AND target_user_id = $2`, [
			id,
			uid,
		]);
	},
	async getUnreadCount(userId: string) {
		const uid = toUid(userId);
		if (uid === null) return 0;
		const { rows } = await q(
			`SELECT COUNT(*) AS cnt FROM notifications WHERE target_user_id = $1 AND read = FALSE`,
			[uid],
		);
		return parseInt(rows[0]?.cnt ?? "0", 10);
	},

	async getMessages(userId?: string) {
		const uid = toUid(userId);
		if (uid === null) return [];
		// 本文は MAX_MESSAGE_LENGTH で頭打ちにして読む。上限を入れる前に保存された巨大な DM を
		// GET の繰り返しで読ませて共有 Neon の転送量を焼かれないように（列も rowToMessage が使う分だけ）
		const { rows } = await q(
			`SELECT ${MESSAGE_COLUMNS} FROM messages WHERE sender_user_id = $1 OR recipient_user_id = $1 ORDER BY created_at DESC LIMIT 100`,
			[uid],
		);
		return rows.map(rowToMessage);
	},
	async getConversation(userId: string, partnerId: string, limit = 100) {
		const uid = toUid(userId);
		const pid = toUid(partnerId);
		if (uid === null || pid === null) return [];
		const { rows } = await q(
			`SELECT ${MESSAGE_COLUMNS} FROM messages WHERE (sender_user_id=$1 AND recipient_user_id=$2) OR (sender_user_id=$2 AND recipient_user_id=$1)
       ORDER BY created_at DESC LIMIT $3`,
			[uid, pid, Math.max(1, Math.min(Number(limit) || 100, 100))],
		);
		return rows.map(rowToMessage);
	},
	async getDmGate(userId: string, partnerId: string) {
		const uid = toUid(userId);
		const pid = toUid(partnerId);
		if (uid === null || pid === null) return { sent: 0, received: 0 };
		const { rows } = await q(
			`SELECT COUNT(*) FILTER (WHERE sender_user_id=$1) AS sent,
              COUNT(*) FILTER (WHERE sender_user_id=$2) AS received
         FROM messages WHERE (sender_user_id=$1 AND recipient_user_id=$2) OR (sender_user_id=$2 AND recipient_user_id=$1)`,
			[uid, pid],
		);
		return {
			sent: parseInt(rows[0]?.sent ?? "0", 10),
			received: parseInt(rows[0]?.received ?? "0", 10),
		};
	},
	async addMessage(data: MessageParams) {
		const senderId = toUid(data.sender);
		if (senderId === null) throw new Error("invalid sender");
		// recipient 未指定は公開メッセージ。指定があるのに users.id として読めない場合は
		// null に落とすと DM が公開投稿に化けるので、ここは fail-open にしない。
		const recipientId = data.recipient ? toUid(data.recipient) : null;
		if (data.recipient && recipientId === null)
			throw new Error("invalid recipient");
		// ルート（app/api/messages）も検査するが、DM は読み出しのたびに転送量になるので
		// 保存する側でも型と長さを縛る。自分宛ては初回DM制限（getDmGate）が外れるので不可
		if (
			typeof data.text !== "string" ||
			!data.text.trim() ||
			data.text.length > MAX_MESSAGE_LENGTH
		) {
			throw userError(
				`メッセージは1〜${MAX_MESSAGE_LENGTH}文字で入力してください`,
				400,
			);
		}
		if (recipientId !== null && recipientId === senderId) {
			throw userError("自分にはDMを送れません", 400);
		}
		let rows: any[];
		try {
			// 初回DM制限（lib/social/dm-rules.ts canSendDm: 相手から返信があるか、まだ1通も送っていない）を
			// INSERT と同じ1文でも見る。ルートの getDmGate と INSERT の間に同時に投げた分が全部
			// 「sent=0」で通らないように（READ COMMITTED なので完全ではないが、すり抜けられる幅はずっと狭い。
			// addOshiItem と同じ考え方）
			({ rows } = await q(
				`INSERT INTO messages (sender_user_id, recipient_user_id, text)
         SELECT $1::int, $2::int, $3::text
          WHERE $2::int IS NULL
             OR EXISTS (SELECT 1 FROM messages WHERE sender_user_id = $2::int AND recipient_user_id = $1::int)
             OR NOT EXISTS (SELECT 1 FROM messages WHERE sender_user_id = $1::int AND recipient_user_id = $2::int)
         RETURNING ${MESSAGE_COLUMNS}`,
				[senderId, recipientId, data.text],
			));
		} catch (e: any) {
			// 23503 = 外部キー違反＝存在しない users.id 宛て。500 にせず利用者向けの 404 にする
			if (e?.code === "23503") throw userError("宛先が見つかりません", 404);
			throw e;
		}
		if (rows.length === 0) {
			throw userError("相手から返信があるまで、送れるのは1通までです", 403);
		}
		// 配信は呼び出し側（app/api/messages/route.ts）が担う。そちらは
		// chUser(sender)/chUser(recipient) 双方へ送る（送信者自身の他タブにも
		// 即時反映するため）ので、ここでも publish すると mock には無いpg限定の
		// 二重配信になる。
		return rowToMessage(rows[0]);
	},

	async getTrends() {
		try {
			// 鍵アカ・検索除外（is_private / hide_from_search）の投稿はトレンドに数えない。
			// 該当ユーザーは少数なので NOT IN のハッシュ化サブプランで足りる。
			// レスは板1の生きているスレのものだけ（他の板・削除済みのスレの本文を数えない）。
			// 鍵アカのスレに付いたレスは閲覧者に見えないので、スレ主が鍵アカなら数えない。
			const { rows } = await q(`
        WITH excluded AS (SELECT id FROM users WHERE is_private OR hide_from_search),
             private_owners AS (SELECT id FROM users WHERE is_private)
        SELECT '#' || m[1] AS keyword, COUNT(*) AS count FROM (
          SELECT regexp_replace(content_text, 'https?://[^\\s]+|www\\.[^\\s]+', '', 'gi') AS cleaned
          FROM (
            SELECT content_text FROM threads WHERE board_id = 1 AND deleted_at IS NULL
              AND user_id NOT IN (SELECT id FROM excluded)
            UNION ALL
            SELECT r.content_text FROM res r JOIN threads t ON t.id = r.thread_id
             WHERE t.board_id = 1 AND t.deleted_at IS NULL
               AND r.user_id NOT IN (SELECT id FROM excluded)
               AND t.user_id NOT IN (SELECT id FROM private_owners)
          ) c
        ) p, LATERAL regexp_matches(p.cleaned, '(?:^|\\s)#([^\\s#]+)', 'g') AS m
        WHERE m[1] !~ '^\\d+$'
          AND m[1] !~ '^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'
        GROUP BY m[1] ORDER BY count DESC LIMIT 10
      `);
			return rows.map(
				(r): Trend => ({ keyword: r.keyword, count: parseInt(r.count, 10) }),
			);
		} catch {
			return [];
		}
	},

	async searchPosts(query: string, userId?: string, limit = 20) {
		if (!query.trim()) return [];
		const safeLimit = Math.max(1, Math.min(limit, 50));
		const like = `%${escapeLike(query.trim().slice(0, MAX_SEARCH_QUERY_LENGTH))}%`;
		const hidden = await getHiddenUserIds(userId);
		const viewerUid = toUid(userId);
		const tParams: any[] = [like, safeLimit];
		const tFilter = `${authorVisibleSql("t.user_id", tParams, viewerUid)} AND ${searchableSql("t.user_id", tParams, viewerUid)}`;
		const { rows: tRows } = await q(
			`SELECT t.*, ${DAT_KEY_SELECT}, ${AUTHOR_SELECT} FROM threads t LEFT JOIN users u ON u.id = t.user_id
       WHERE t.board_id=1 AND t.deleted_at IS NULL
         AND (t.content_text ILIKE $1 ESCAPE '!' OR COALESCE(u.display_name,t.cc_user_name) ILIKE $1 ESCAPE '!')
         AND ${tFilter}
       ORDER BY t.id DESC LIMIT $2`,
			tParams,
		);
		// レスは板1の生きているスレのものだけ、スレ主が鍵アカで見えないスレのレスも出さない
		// （getReplies と同じ。検索からスレの中身を覗けないように）
		const rParams: any[] = [like, safeLimit];
		const rFilter = `${authorVisibleSql("r.user_id", rParams, viewerUid)} AND ${searchableSql("r.user_id", rParams, viewerUid)}
         AND t.board_id = 1 AND t.deleted_at IS NULL AND ${authorVisibleSql("t.user_id", rParams, viewerUid, "tu")}`;
		const { rows: rRows } = await q(
			`SELECT r.*, ${AUTHOR_SELECT} FROM res r LEFT JOIN users u ON u.id = r.user_id
         JOIN threads t ON t.id = r.thread_id LEFT JOIN users tu ON tu.id = t.user_id
       WHERE (r.content_text ILIKE $1 ESCAPE '!' OR COALESCE(u.display_name,r.cc_user_name) ILIKE $1 ESCAPE '!')
         AND ${rFilter}
       ORDER BY r.id DESC LIMIT $2`,
			rParams,
		);
		const posts = [
			...tRows
				.filter((r) => !hidden.has(Number(r.user_id)))
				.map((r) => threadRowToPost(r)),
			...rRows
				.filter((r) => !hidden.has(Number(r.user_id)))
				.map((r) => resRowToPost(r)),
		]
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
			.slice(0, safeLimit);
		return finalizeForViewer(posts, userId);
	},

	async searchMedia(
		kind: "image" | "mml",
		query: string,
		userId?: string,
		limit = 50,
		offset = 0,
		before?: string,
	) {
		// 51 まで。ルート（app/api/media-search）は hasMore の判定に limit+1 件を要求するので、
		// 50 で切ると hasMore が常に false になっていた
		const safeLimit = Math.max(1, Math.min(limit, 51));
		const beforeDate = before ? new Date(before) : null;
		const cursor =
			beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : null;
		const safeOffset = cursor ? 0 : Math.max(0, offset);
		// offset で深く遡らせない（1回で threads/res を各数百行読ませて転送量を焼けた）。
		// 深く遡るのは before カーソルで行う（タイムラインのメディア欄はそちらを使う）
		if (safeOffset > 100) return [];
		// threads/res をマージしてから offset+limit 件目で切るため、各テーブルからは
		// 「新しい順で offset+limit 件」だけ引けば十分（全件取得は egress を壊す）。
		const fetchEach = Math.min(safeOffset + safeLimit, 151);
		const contentType = kind === "image" ? CT.Image : CT.Dtm;
		const trimmed = query.trim().slice(0, MAX_SEARCH_QUERY_LENGTH);
		const params: any[] = [contentType];
		const viewerUid = toUid(userId);
		// 鍵アカ・検索除外は threads/res のどちらにも同じ条件で掛ける。投稿者の列名
		// （素の user_id）も下の scoped() で t./r. に差し替わる。
		let where = `content_type = $1 AND ${authorVisibleSql("user_id", params, viewerUid)} AND ${searchableSql("user_id", params, viewerUid)}`;
		if (trimmed) {
			params.push(`%${escapeLike(trimmed)}%`);
			where += ` AND (content_text ILIKE $${params.length} ESCAPE '!' OR COALESCE(u.display_name, cc_user_name) ILIKE $${params.length} ESCAPE '!')`;
		}
		if (cursor) {
			params.push(cursor.toISOString());
			where += ` AND created_at < $${params.length}`;
		}
		const scoped = (alias: string) =>
			where.replace(
				/\b(content_type|content_text|cc_user_name|created_at|user_id)\b/g,
				`${alias}.$1`,
			);
		// レス側だけはスレ主の可視性（鍵アカのスレ）も見る。params を分けるのは、使わない $N が
		// 混ざると Postgres が型を決められずに文ごと失敗するため。scoped() の置き換えの後に足す
		// （置き換えに掛けると t.user_id が t.r.user_id に化ける）。
		const rParams = [...params];
		const rThreadVisible = authorVisibleSql("t.user_id", rParams, viewerUid, "tu");
		params.push(fetchEach);
		const tLimit = params.length;
		rParams.push(fetchEach);
		const rLimit = rParams.length;
		// ピッカーに要るのは本文の見出しだけ。MML は data URL があれば本文は見出しで足り、
		// 外部化されていない古い投稿だけ本文そのもの（インライン MML）が要る（ContentPicker）
		const contentCol = (a: string) =>
			kind === "image"
				? `LEFT(${a}.content_text, 200) AS content_text`
				: `CASE WHEN ${a}.content_data_url <> '' THEN LEFT(${a}.content_text, 200) ELSE ${a}.content_text END AS content_text`;

		// thread と res は id 空間が別なので、両者を混ぜて並べるのは created_at で行う。
		// どちらも板1・生きているスレのものだけ（reze が扱う板は板1だけ）。
		const [{ rows: tRows }, { rows: rRows }] = await Promise.all([
			q(
				`SELECT t.id, t.user_id, ${contentCol("t")}, t.content_url, t.content_data_url, t.origin_type, t.dot_w, t.dot_h, t.anim_frames, t.anim_fps, t.walk_preset, t.created_at, t.good_count, t.bad_count, t.res_count, ${AUTHOR_SELECT}
           FROM threads t LEFT JOIN users u ON u.id=t.user_id
          WHERE t.deleted_at IS NULL AND t.board_id = 1 AND ${scoped("t")}
          ORDER BY t.created_at DESC LIMIT $${tLimit}`,
				params,
			),
			q(
				`SELECT r.id, r.thread_id, r.user_id, ${contentCol("r")}, r.content_url, r.content_data_url, r.origin_type, r.dot_w, r.dot_h, r.anim_frames, r.anim_fps, r.walk_preset, r.created_at, r.good_count, r.bad_count, ${AUTHOR_SELECT}
           FROM res r LEFT JOIN users u ON u.id=r.user_id
           JOIN threads t ON t.id = r.thread_id LEFT JOIN users tu ON tu.id = t.user_id
          WHERE ${scoped("r")}
            AND t.deleted_at IS NULL AND t.board_id = 1 AND ${rThreadVisible}
          ORDER BY r.created_at DESC LIMIT $${rLimit}`,
				rParams,
			),
		]);
		// hide_reactions の投稿者は本人以外に数を見せない（finalizeForViewer と同じ扱い）
		const reactionCount = (r: any, n: unknown) =>
			r.author_hide_reactions && String(r.user_id) !== userId
				? 0
				: Number(n ?? 0);
		// 表示名は reze 利用者の display_name だけ（resolveDisplayName と同じく名前エスケープを掛け、
		// システム用 id の名前は出さない）
		const mediaName = (r: any) =>
			r.author_display_name && Number(r.user_id) !== SYSTEM_USER_ID
				? sanitizeBbsUserName(r.author_display_name)
				: "名無し";
		// data URL がある MML 行の本文は上の SQL で 200 字に切ってある。そこにインラインの MML 行が
		// 残っていると（クライアントが行をマーカーに差し替えずに mmlUrl だけ送った行など）、ピッカーは
		// URL より本文の MML を優先するので、途中で切れた曲を丸ごとの曲として使ってしまう。
		// 切った本文ではマーカー行をマーカーだけにして、曲は必ず mmlUrl から取らせる。
		const mediaContent = (r: any): string => {
			const text: string = r.content_text ?? "";
			return kind === "mml" && r.content_data_url
				? replaceMmlWithMarker(text)
				: text;
		};
		const out: DbMediaSearchPost[] = [
			...tRows.map(
				(r): DbMediaSearchPost => ({
					id: threadToPostId(Number(r.id)),
					displayName: mediaName(r),
					content: mediaContent(r),
					imageSrc: imageUrlOf(r.content_url),
					mmlUrl:
						kind === "mml"
							? absoluteUrlOf(r.content_data_url, HTTPS_ONLY)
							: undefined,
					dotW: r.dot_w != null ? Number(r.dot_w) : undefined,
					dotH: r.dot_h != null ? Number(r.dot_h) : undefined,
					animFrames: r.anim_frames != null ? Number(r.anim_frames) : undefined,
					animFps: r.anim_fps != null ? Number(r.anim_fps) : undefined,
					walkPreset: r.walk_preset ?? undefined,
					originType: r.origin_type || undefined,
					isOwner: userId ? String(r.user_id) === userId : false,
					createdAt: toIso(r.created_at),
					likes: reactionCount(r, r.good_count),
					dislikes: reactionCount(r, r.bad_count),
					repliesCount: Math.max(Number(r.res_count ?? 1) - 1, 0),
				}),
			),
			...rRows.map(
				(r): DbMediaSearchPost => ({
					id: resToPostId(Number(r.id)),
					displayName: mediaName(r),
					content: mediaContent(r),
					imageSrc: imageUrlOf(r.content_url),
					mmlUrl:
						kind === "mml"
							? absoluteUrlOf(r.content_data_url, HTTPS_ONLY)
							: undefined,
					dotW: r.dot_w != null ? Number(r.dot_w) : undefined,
					dotH: r.dot_h != null ? Number(r.dot_h) : undefined,
					animFrames: r.anim_frames != null ? Number(r.anim_frames) : undefined,
					animFps: r.anim_fps != null ? Number(r.anim_fps) : undefined,
					walkPreset: r.walk_preset ?? undefined,
					originType: r.origin_type || undefined,
					isOwner: userId ? String(r.user_id) === userId : false,
					createdAt: toIso(r.created_at),
					likes: reactionCount(r, r.good_count),
					dislikes: reactionCount(r, r.bad_count),
					repliesCount: 0,
				}),
			),
		];
		out.sort(
			(a, b) =>
				new Date(b.createdAt ?? 0).getTime() -
				new Date(a.createdAt ?? 0).getTime(),
		);
		return out.slice(safeOffset, safeOffset + safeLimit);
	},

	async getPostsByHashtag(tag: string, userId?: string, limit = 20) {
		const rawTag = tag.startsWith("#") ? tag : `#${tag}`;
		const escapedTag = rawTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const safeLimit = Math.max(1, Math.min(limit, 50));
		const hidden = await getHiddenUserIds(userId);
		const viewerUid = toUid(userId);
		const params: any[] = [escapedTag, safeLimit];
		const filter = `${authorVisibleSql("t.user_id", params, viewerUid)} AND ${searchableSql("t.user_id", params, viewerUid)}`;
		const { rows } = await q(
			`SELECT t.*, ${DAT_KEY_SELECT}, ${AUTHOR_SELECT} FROM threads t LEFT JOIN users u ON u.id=t.user_id
       WHERE t.board_id=1 AND t.deleted_at IS NULL
         AND t.content_text ~ ('(^|[[:space:]])' || $1 || '([[:space:]]|$)')
         AND ${filter}
       ORDER BY t.id DESC LIMIT $2`,
			params,
		);
		return finalizeForViewer(
			rows
				.filter((r) => !hidden.has(Number(r.user_id)))
				.map((r) => threadRowToPost(r)),
			userId,
		);
	},

	// ==========================================================================
	// 認証・プロフィール
	// ==========================================================================
	async getOrCreateAnonymousUser(sessionId: string, ipAddress: string) {
		// 既存のセッションか。unj の署名トークンは reze のセッションとして扱わない（rezeTokenOk）。
		// 以前は kind='reze' だけを見ていたので、既定値 kind='unj' のまま入った昔の reze セッションは
		// 見つからず、トークンの INSERT が衝突して黙って捨てられたまま毎回新しいユーザーを作っていた
		// （孤児の users 行が増え、本人は元のアカウントに戻れない）。
		// reze_ok で「行はあるが使えないトークン」も同じ1回の照会で見分ける。
		const lookup = async () => {
			const { rows } = await q(
				`SELECT u.*, ${rezeTokenOk("t")} AS reze_ok FROM auth_tokens t JOIN users u ON u.id = t.user_id
          WHERE t.token = $1 LIMIT 1`,
				[sessionId],
			);
			return rows[0] as (Record<string, any> & { reze_ok: boolean }) | undefined;
		};
		const usableOrThrow = (row: { reze_ok: boolean }) => {
			// unj のトークン（他人の unj アカウント）。孤児を作らず、利用者向けの 400 にする
			if (!row.reze_ok) throw userError("このセッションIDは使えません", 400);
		};
		const existing = await lookup();
		if (existing) {
			usableOrThrow(existing);
			// unj が書いた行には触らない（ここに来るのは rezeTokenOk を満たす行だけだが念のため同じ条件）
			await q(
				`UPDATE auth_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token = $1 AND ${rezeTokenOk("auth_tokens")}`,
				[sessionId],
			);
			return userRowToAnonymousUser(existing);
		}
		// 新規ユーザー。unj同様、表示名は「名無し」+ ランダム3文字
		const suffix = Math.random().toString(36).slice(2, 5);
		const displayName = `名無し${suffix}`;
		const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(ipAddress) ? ipAddress : null;
		const { rows } = await q(
			`INSERT INTO users (created_at, updated_at, last_seen_at, ip, display_name, avatar_color)
       VALUES (CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, COALESCE($1::inet,'0.0.0.0'::inet), $2, 'from-blue-500 to-indigo-600')
       RETURNING *`,
			[ipv4, displayName],
		);
		const user = rows[0];
		const { rows: tokenRows } = await q(
			`INSERT INTO auth_tokens (user_id, token, ip, kind) VALUES ($1,$2,COALESCE($3::inet,'0.0.0.0'::inet),'reze')
       ON CONFLICT (token) DO NOTHING RETURNING id`,
			[user.id, sessionId, ipv4],
		);
		if (tokenRows.length === 0) {
			// 同じセッションIDでの同時作成に負けた。いま作ったユーザーは誰にも紐づかない孤児になるので
			// 消して、先に入ったトークンの持ち主を返す
			await q(`DELETE FROM users WHERE id = $1`, [user.id]);
			const winner = await lookup();
			if (!winner) {
				throw userError(
					"セッションの作成が混み合っています。もう一度お試しください",
					409,
				);
			}
			usableOrThrow(winner);
			return userRowToAnonymousUser(winner);
		}
		return userRowToAnonymousUser(user);
	},

	/**
	 * 照会だけ（作成しない）。unj の署名トークンは除外する（rezeTokenOk）。
	 * `bbscgi:` のトークン（kind='reze'）は引ける。bbs.cgi が IPv6 の旧キーの利用者を探すのに使う。
	 */
	async getAnonymousUserBySession(sessionId: string) {
		const { rows } = await q(
			`SELECT u.* FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token = $1 AND ${rezeTokenOk("t")} LIMIT 1`,
			[sessionId],
		);
		if (!rows.length) return null;
		return userRowToAnonymousUser(rows[0]);
	},

	async touchAnonymousSession(sessionId: string) {
		// getOrCreateAnonymousUser の既存セッションの経路と同じ UPDATE だけ（SELECT を省く）
		await q(
			`UPDATE auth_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token = $1 AND ${rezeTokenOk("auth_tokens")}`,
			[sessionId],
		);
	},

	async updateUserDisplayName(
		userId: string,
		displayName?: string,
		avatarUrl?: string,
		bio?: string,
	) {
		const uid = toUid(userId);
		if (uid === null) return;
		const sets: string[] = [];
		const vals: any[] = [];
		const push = (col: string, v: unknown) => {
			vals.push(v);
			sets.push(`${col} = $${vals.length}`);
		};
		// 表示名は unj の名前エスケープ（★◆■●【】）と不可視文字の除去を掛けてから保存する。
		// そのまま cc_user_name に写ると unj でキャップ・トリップに見えるため（lib/bbs/user-name.ts）
		if (displayName !== undefined)
			push("display_name", sanitizeBbsUserName(displayName));
		if (avatarUrl !== undefined) push("avatar_url", avatarUrl);
		if (bio !== undefined) push("bio", bio);
		if (sets.length === 0) return;
		vals.push(uid);
		await q(
			`UPDATE users SET ${sets.join(", ")} WHERE id = $${vals.length}`,
			vals,
		);
	},

	async getUserAvatarUrl(slug: string) {
		const uid = toUid(slug);
		if (uid === null) return undefined;
		const { rows } = await q(`SELECT avatar_url FROM users WHERE id = $1`, [
			uid,
		]);
		return rows[0]?.avatar_url ?? undefined;
	},
	async getUserBio(slug: string) {
		const uid = toUid(slug);
		if (uid === null) return undefined;
		const { rows } = await q(`SELECT bio FROM users WHERE id = $1`, [uid]);
		return rows[0]?.bio ?? undefined;
	},

	async listOshiItems(userSlug: string) {
		const uid = toUid(userSlug);
		if (uid === null) return [];
		// 件数の上限を入れる前に溜まった分があっても、一覧で読むのは MAX_OSHI_ITEMS 件まで
		const { rows } = await q(
			`SELECT * FROM oshi_items WHERE owner_user_id = $1 ORDER BY position LIMIT ${MAX_OSHI_ITEMS}`,
			[uid],
		);
		return rows.map(rowToOshiItem);
	},
	async addOshiItem(userSlug: string, data: AddOshiItemParams) {
		const uid = toUid(userSlug);
		if (uid === null) throw new Error("invalid userSlug");
		// iTunes の ID は BIGINT 列。NaN や小数をそのまま渡すと 22P02 で 500 になるので、
		// 正の安全な整数以外は「無し」にする
		const itunesId = (v: unknown) =>
			typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null;
		// 件数の上限（上限なしだとプロフィールを開くたびの読み出しが際限なく膨らむ）と次の並び順を、
		// INSERT と同じ1文で見る。数えてから別の文で入れると、同時に投げたぶんが全部上限の判定を
		// すり抜けた（READ COMMITTED なので完全には防げないが、すり抜けられる幅はずっと狭い）
		const { rows } = await q(
			`INSERT INTO oshi_items (owner_user_id, kind, track_id, collection_id, artist_id, title, subtitle, artwork_url, view_url, preview_url, position)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
              (SELECT COALESCE(MAX(position),-1)+1 FROM oshi_items WHERE owner_user_id = $1)
        WHERE (SELECT COUNT(*) FROM oshi_items WHERE owner_user_id = $1) < ${MAX_OSHI_ITEMS}
       RETURNING *`,
			[
				uid,
				data.kind,
				itunesId(data.trackId),
				itunesId(data.collectionId),
				itunesId(data.artistId),
				data.title,
				data.subtitle ?? null,
				data.artworkUrl ?? null,
				data.viewUrl ?? null,
				data.previewUrl ?? null,
			],
		);
		if (rows.length === 0) {
			throw userError(`推しリストは${MAX_OSHI_ITEMS}件までです`, 400);
		}
		return rowToOshiItem(rows[0]);
	},
	async removeOshiItem(userSlug: string, id: number) {
		const uid = toUid(userSlug);
		if (uid === null) return;
		await q(`DELETE FROM oshi_items WHERE id = $1 AND owner_user_id = $2`, [
			id,
			uid,
		]);
	},

	async getUserSettings(slug: string) {
		const uid = toUid(slug);
		const { rows } =
			uid === null
				? { rows: [] as any[] }
				: await q(
						`SELECT is_private, hide_from_search, hide_reactions FROM users WHERE id = $1`,
						[uid],
					);
		const row = rows[0];
		return {
			isPrivate: !!row?.is_private,
			hideFromSearch: !!row?.hide_from_search,
			hideReactions: !!row?.hide_reactions,
		};
	},
	async updateUserSettings(slug: string, settings) {
		const uid = toUid(slug);
		if (uid === null) return;
		const sets: string[] = [];
		const vals: any[] = [];
		const push = (col: string, v: unknown) => {
			vals.push(v);
			sets.push(`${col} = $${vals.length}`);
		};
		if (settings.isPrivate !== undefined)
			push("is_private", settings.isPrivate);
		if (settings.hideFromSearch !== undefined)
			push("hide_from_search", settings.hideFromSearch);
		if (settings.hideReactions !== undefined)
			push("hide_reactions", settings.hideReactions);
		if (sets.length === 0) return;
		vals.push(uid);
		await q(
			`UPDATE users SET ${sets.join(", ")} WHERE id = $${vals.length}`,
			vals,
		);
	},

	async issueMigrationToken(userId: string) {
		const uid = toUid(userId);
		if (uid === null) throw new Error("invalid userId");
		// アカウント乗っ取りと同じ重みを持つ秘密なので、推測できない乱数で作る
		// （Math.random + 時刻だった頃は推測の余地があった）
		const token = generateMigrationToken();
		// 生きているトークンは1人1つ（発行し直したら古いものは無効）。期限切れの行もついでに掃除する。
		await q(
			`DELETE FROM migration_tokens
        WHERE user_id = $1 OR created_at < CURRENT_TIMESTAMP - make_interval(mins => $2)`,
			[uid, MIGRATION_TOKEN_TTL_MINUTES],
		);
		await q(`INSERT INTO migration_tokens (token, user_id) VALUES ($1,$2)`, [
			token,
			uid,
		]);
		return token;
	},
	async redeemMigrationToken(token: string, newSessionId: string) {
		// 引き換えと同時に消す（DELETE ... RETURNING）。SELECT してから DELETE だと、
		// 同じトークンを同時に2回出されたとき両方通ってしまう。期限切れもここで弾き、
		// 期限切れの行はついでに掃除する。
		const { rows } = await q(
			`DELETE FROM migration_tokens WHERE token = $1
       RETURNING user_id, created_at > CURRENT_TIMESTAMP - make_interval(mins => $2) AS fresh`,
			[token, MIGRATION_TOKEN_TTL_MINUTES],
		);
		if (!rows.length || !rows[0].fresh) return null;
		const userId = Number(rows[0].user_id);
		const { rows: userRows } = await q(`SELECT * FROM users WHERE id = $1`, [
			userId,
		]);
		if (!userRows.length) return null;
		// 引き換える側のセッションはページを開いた時点で新規ユーザーに紐づいている
		// （getOrCreateAnonymousUser）。DO NOTHING だとその紐づけが残って引き換えが空振りする
		// ので、既存の行を移行元のユーザーへ付け替える（mock の sessionToUser.set と同じ）。
		// ただし unj の署名トークンの行（unj が書いた行）は付け替えない（rezeTokenOk）。
		// 付け替えを許すと、reze から unj の行の user_id を書き換えられ、unj が無効にした
		// トークンを reze のセッションとして生き返らせる経路にもなる。
		// 更新されなければ 0 行で、引き換えは失敗（移行トークンは上で消費済み）。
		const { rows: bound } = await q(
			`INSERT INTO auth_tokens (user_id, token, kind) VALUES ($1,$2,'reze')
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, last_used_at = CURRENT_TIMESTAMP
       WHERE ${rezeTokenOk("auth_tokens")}
       RETURNING user_id`,
			[userId, newSessionId],
		);
		if (bound.length === 0) return null;
		return userRowToAnonymousUser(userRows[0]);
	},

	// ==========================================================================
	// フォロー・ブロック・ミュート
	// ==========================================================================
	async followUser(followerId: string, followedId: string) {
		if (followerId === followedId) return;
		const from = toUid(followerId);
		const to = toUid(followedId);
		if (from === null || to === null) return;
		await q(
			`INSERT INTO user_follows (follower_user_id, followed_user_id) SELECT $1::int, $2::int WHERE ${rezeTargetSql("$2::int")} ON CONFLICT DO NOTHING`,
			[from, to],
		);
		// 未読の同一フォロー通知が既にあれば増やさない（フォロー解除→再フォロー連打での重複対策）
		await q(
			`INSERT INTO notifications (type, actor_user_id, target_user_id)
       SELECT 'follow', $1, $2
       WHERE ${rezeTargetSql("$2::int")} AND NOT EXISTS (
         SELECT 1 FROM notifications
          WHERE type = 'follow' AND actor_user_id = $1 AND target_user_id = $2 AND read = FALSE
       )`,
			[from, to],
		);
	},
	async unfollowUser(followerId: string, followedId: string) {
		const from = toUid(followerId);
		const to = toUid(followedId);
		if (from === null || to === null) return;
		await q(
			`DELETE FROM user_follows WHERE follower_user_id=$1 AND followed_user_id=$2`,
			[from, to],
		);
	},
	async isFollowing(followerId: string, followedId: string) {
		const from = toUid(followerId);
		const to = toUid(followedId);
		if (from === null || to === null) return false;
		const { rows } = await q(
			`SELECT 1 FROM user_follows WHERE follower_user_id=$1 AND followed_user_id=$2`,
			[from, to],
		);
		return rows.length > 0;
	},
	async getFollowCounts(userId: string) {
		const uid = toUid(userId);
		if (uid === null) return { followers: 0, following: 0 };
		const [{ rows: fr }, { rows: gr }] = await Promise.all([
			q(`SELECT COUNT(*) AS c FROM user_follows WHERE followed_user_id=$1`, [
				uid,
			]),
			q(`SELECT COUNT(*) AS c FROM user_follows WHERE follower_user_id=$1`, [
				uid,
			]),
		]);
		return {
			followers: parseInt(fr[0]?.c ?? "0", 10),
			following: parseInt(gr[0]?.c ?? "0", 10),
		};
	},
	async getFollowers(userId: string, viewerId?: string, limit = 50) {
		const uid = toUid(userId);
		if (uid === null) return [];
		const { rows } = await q(
			`SELECT u.id, u.display_name, u.avatar_url FROM user_follows f JOIN users u ON u.id=f.follower_user_id
       WHERE f.followed_user_id=$1 ORDER BY f.created_at DESC LIMIT $2`,
			[uid, Math.min(limit, 100)],
		);
		return rowsToFollowUsers(rows, viewerId);
	},
	async getFollowing(userId: string, viewerId?: string, limit = 50) {
		const uid = toUid(userId);
		if (uid === null) return [];
		const { rows } = await q(
			`SELECT u.id, u.display_name, u.avatar_url FROM user_follows f JOIN users u ON u.id=f.followed_user_id
       WHERE f.follower_user_id=$1 ORDER BY f.created_at DESC LIMIT $2`,
			[uid, Math.min(limit, 100)],
		);
		return rowsToFollowUsers(rows, viewerId);
	},

	async blockUser(blockerSlug: string, blockedSlug: string) {
		if (blockerSlug === blockedSlug) return;
		const from = toUid(blockerSlug);
		const to = toUid(blockedSlug);
		if (from === null || to === null) return;
		clearHiddenCache();
		await q(
			`INSERT INTO user_blocks (blocker_user_id, blocked_user_id) SELECT $1::int, $2::int WHERE ${rezeTargetSql("$2::int")} ON CONFLICT DO NOTHING`,
			[from, to],
		);
	},
	async unblockUser(blockerSlug: string, blockedSlug: string) {
		const from = toUid(blockerSlug);
		const to = toUid(blockedSlug);
		if (from === null || to === null) return;
		clearHiddenCache();
		await q(
			`DELETE FROM user_blocks WHERE blocker_user_id=$1 AND blocked_user_id=$2`,
			[from, to],
		);
	},
	async getBlockedSlugs(blockerSlug: string) {
		const uid = toUid(blockerSlug);
		if (uid === null) return [];
		const { rows } = await q(
			`SELECT blocked_user_id FROM user_blocks WHERE blocker_user_id=$1`,
			[uid],
		);
		return rows.map((r) => String(r.blocked_user_id));
	},
	async muteUser(muterSlug: string, mutedSlug: string) {
		if (muterSlug === mutedSlug) return;
		const from = toUid(muterSlug);
		const to = toUid(mutedSlug);
		if (from === null || to === null) return;
		clearHiddenCache();
		await q(
			`INSERT INTO user_mutes (muter_user_id, muted_user_id) SELECT $1::int, $2::int WHERE ${rezeTargetSql("$2::int")} ON CONFLICT DO NOTHING`,
			[from, to],
		);
	},
	async unmuteUser(muterSlug: string, mutedSlug: string) {
		const from = toUid(muterSlug);
		const to = toUid(mutedSlug);
		if (from === null || to === null) return;
		clearHiddenCache();
		await q(
			`DELETE FROM user_mutes WHERE muter_user_id=$1 AND muted_user_id=$2`,
			[from, to],
		);
	},
	async getMutedSlugs(muterSlug: string) {
		const uid = toUid(muterSlug);
		if (uid === null) return [];
		const { rows } = await q(
			`SELECT muted_user_id FROM user_mutes WHERE muter_user_id=$1`,
			[uid],
		);
		return rows.map((r) => String(r.muted_user_id));
	},

	async reportContent(data: ReportParams) {
		// 同じ人の同じ対象への通報は1件だけ、1人1日 MAX_REPORTS_PER_DAY 件まで（連打で reports を
		// 膨らませない）。弾いても呼び出し側は成功として返すので、ここは黙って何もしない
		const reporter = toUid(data.reporterSlug);
		await q(
			`INSERT INTO reports (reporter_user_id, target_type, target_id, reason)
       SELECT $1::int, $2::text, $3::text, $4::text
        WHERE $1::int IS NULL
           OR (NOT EXISTS (SELECT 1 FROM reports WHERE reporter_user_id = $1::int AND target_type = $2::text AND target_id = $3::text)
               AND (SELECT COUNT(*) FROM reports WHERE reporter_user_id = $1::int
                     AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 day') < ${MAX_REPORTS_PER_DAY})`,
			[reporter, data.targetType, data.targetId, data.reason],
		);
	},

	// ==========================================================================
	// ゲーム / MV
	// ==========================================================================
	async createGame(data: CreateGameParams) {
		const id = Date.now() + Math.floor(Math.random() * 1000);
		const { rows } = await q(
			`INSERT INTO games (id,preset,title,manifest_url,manifest_delete_id,manifest_delete_hash,bg_ref,creator_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
			[
				id,
				data.preset,
				data.title,
				data.manifestUrl,
				data.manifestDeleteId ?? null,
				data.manifestDeleteHash ?? null,
				data.bgRef ?? null,
				toUid(data.creatorSlug),
			],
		);
		return rowToGame(rows[0]);
	},
	async getGame(id: number) {
		const { rows } = await q(`SELECT * FROM games WHERE id = $1`, [id]);
		return rows.length ? rowToGame(rows[0]) : null;
	},
	async getGamesByIds(ids: number[]) {
		if (!ids.length) return [];
		const { rows } = await q(
			`SELECT * FROM games WHERE id = ANY($1::bigint[])`,
			[ids],
		);
		return rows.map(rowToGame);
	},
	async updateGame(id: number, data: UpdateGameParams) {
		const { rows: prev } = await q(
			`SELECT manifest_delete_id, manifest_delete_hash FROM games WHERE id=$1`,
			[id],
		);
		const { rows } = await q(
			`UPDATE games SET title=$1, manifest_url=$2, manifest_delete_id=$3, manifest_delete_hash=$4, bg_ref=$5 WHERE id=$6 RETURNING *`,
			[
				data.title,
				data.manifestUrl,
				data.manifestDeleteId ?? null,
				data.manifestDeleteHash ?? null,
				data.bgRef ?? null,
				id,
			],
		);
		if (!rows.length) return null;
		const result = rowToGame(rows[0]);
		(result as any).previousManifest = prev[0]?.manifest_delete_id
			? {
					deleteId: prev[0].manifest_delete_id,
					deleteHash: prev[0].manifest_delete_hash,
				}
			: undefined;
		return result;
	},
	async listAllGames(limit = 30) {
		// 鍵アカが作ったゲームは一覧・ランキングに出さない（投稿が見えないのに作品だけ出ると
		// 存在が漏れる）。該当ユーザーは少数なので NOT IN のハッシュ化サブプランで足りる。
		const { rows } = await q(
			`SELECT * FROM games WHERE ${PUBLIC_CREATOR_SQL} ORDER BY id DESC LIMIT $1`,
			[Math.min(limit, 50)],
		);
		return rows.map(rowToGame);
	},

	async createMv(data: CreateMvParams) {
		const id = Date.now() + Math.floor(Math.random() * 1000);
		const { rows } = await q(
			`INSERT INTO mvs (id,preset,title,manifest_url,manifest_delete_id,manifest_delete_hash,bg_url,creator_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
			[
				id,
				data.preset,
				data.title,
				data.manifestUrl,
				data.manifestDeleteId ?? null,
				data.manifestDeleteHash ?? null,
				data.bgUrl ?? null,
				toUid(data.creatorSlug),
			],
		);
		return rowToMv(rows[0]);
	},
	async getMv(id: number) {
		const { rows } = await q(`SELECT * FROM mvs WHERE id = $1`, [id]);
		return rows.length ? rowToMv(rows[0]) : null;
	},
	async getMvsByIds(ids: number[]) {
		if (!ids.length) return [];
		const { rows } = await q(`SELECT * FROM mvs WHERE id = ANY($1::bigint[])`, [
			ids,
		]);
		return rows.map(rowToMv);
	},
	async updateMv(id: number, data: UpdateMvParams) {
		const { rows: prev } = await q(
			`SELECT manifest_delete_id, manifest_delete_hash FROM mvs WHERE id=$1`,
			[id],
		);
		const { rows } = await q(
			`UPDATE mvs SET title=$1, manifest_url=$2, manifest_delete_id=$3, manifest_delete_hash=$4, bg_url=$5 WHERE id=$6 RETURNING *`,
			[
				data.title,
				data.manifestUrl,
				data.manifestDeleteId ?? null,
				data.manifestDeleteHash ?? null,
				data.bgUrl ?? null,
				id,
			],
		);
		if (!rows.length) return null;
		const result = rowToMv(rows[0]);
		(result as any).previousManifest = prev[0]?.manifest_delete_id
			? {
					deleteId: prev[0].manifest_delete_id,
					deleteHash: prev[0].manifest_delete_hash,
				}
			: undefined;
		return result;
	},
	async recordMvPlay(id: number) {
		await q(`UPDATE mvs SET plays = COALESCE(plays,0)+1 WHERE id = $1`, [id]);
	},

	// かけあい動画（talks）。mvs と同じ形（docs/talk-video-feature-design.md §5）
	async createTalk(data: CreateTalkParams) {
		const id = Date.now() + Math.floor(Math.random() * 1000);
		const { rows } = await q(
			`INSERT INTO talks (id,title,manifest_url,manifest_delete_id,manifest_delete_hash,bg_url,creator_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
			[
				id,
				data.title,
				data.manifestUrl,
				data.manifestDeleteId ?? null,
				data.manifestDeleteHash ?? null,
				data.bgUrl ?? null,
				toUid(data.creatorSlug),
			],
		);
		return rowToTalk(rows[0]);
	},
	async getTalk(id: number) {
		const { rows } = await q(`SELECT * FROM talks WHERE id = $1`, [id]);
		return rows.length ? rowToTalk(rows[0]) : null;
	},
	async getTalksByIds(ids: number[]) {
		if (!ids.length) return [];
		const { rows } = await q(
			`SELECT * FROM talks WHERE id = ANY($1::bigint[])`,
			[ids],
		);
		return rows.map(rowToTalk);
	},
	async updateTalk(id: number, data: UpdateTalkParams) {
		const { rows: prev } = await q(
			`SELECT manifest_delete_id, manifest_delete_hash FROM talks WHERE id=$1`,
			[id],
		);
		const { rows } = await q(
			`UPDATE talks SET title=$1, manifest_url=$2, manifest_delete_id=$3, manifest_delete_hash=$4, bg_url=$5 WHERE id=$6 RETURNING *`,
			[
				data.title,
				data.manifestUrl,
				data.manifestDeleteId ?? null,
				data.manifestDeleteHash ?? null,
				data.bgUrl ?? null,
				id,
			],
		);
		if (!rows.length) return null;
		const result = rowToTalk(rows[0]);
		(result as any).previousManifest = prev[0]?.manifest_delete_id
			? {
					deleteId: prev[0].manifest_delete_id,
					deleteHash: prev[0].manifest_delete_hash,
				}
			: undefined;
		return result;
	},
	async recordTalkPlay(id: number) {
		await q(`UPDATE talks SET plays = COALESCE(plays,0)+1 WHERE id = $1`, [id]);
	},

	// 音MAD（otomads）。talks と同じ形（docs/otomad-feature-design.md §7）
	async createOtomad(data: CreateOtomadParams) {
		const id = Date.now() + Math.floor(Math.random() * 1000);
		const { rows } = await q(
			`INSERT INTO otomads (id,title,manifest_url,manifest_delete_id,manifest_delete_hash,bg_url,creator_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
			[
				id,
				data.title,
				data.manifestUrl,
				data.manifestDeleteId ?? null,
				data.manifestDeleteHash ?? null,
				data.bgUrl ?? null,
				toUid(data.creatorSlug),
			],
		);
		return rowToOtomad(rows[0]);
	},
	async getOtomad(id: number) {
		const { rows } = await q(`SELECT * FROM otomads WHERE id = $1`, [id]);
		return rows.length ? rowToOtomad(rows[0]) : null;
	},
	async getOtomadsByIds(ids: number[]) {
		if (!ids.length) return [];
		const { rows } = await q(
			`SELECT * FROM otomads WHERE id = ANY($1::bigint[])`,
			[ids],
		);
		return rows.map(rowToOtomad);
	},
	async updateOtomad(id: number, data: UpdateOtomadParams) {
		const { rows: prev } = await q(
			`SELECT manifest_delete_id, manifest_delete_hash FROM otomads WHERE id=$1`,
			[id],
		);
		const { rows } = await q(
			`UPDATE otomads SET title=$1, manifest_url=$2, manifest_delete_id=$3, manifest_delete_hash=$4, bg_url=$5 WHERE id=$6 RETURNING *`,
			[
				data.title,
				data.manifestUrl,
				data.manifestDeleteId ?? null,
				data.manifestDeleteHash ?? null,
				data.bgUrl ?? null,
				id,
			],
		);
		if (!rows.length) return null;
		const result = rowToOtomad(rows[0]);
		(result as any).previousManifest = prev[0]?.manifest_delete_id
			? {
					deleteId: prev[0].manifest_delete_id,
					deleteHash: prev[0].manifest_delete_hash,
				}
			: undefined;
		return result;
	},
	async recordOtomadPlay(id: number) {
		await q(`UPDATE otomads SET plays = COALESCE(plays,0)+1 WHERE id = $1`, [
			id,
		]);
	},

	async recordGamePlay(gameId: number, data: RecordGamePlayParams) {
		const score = Number(data.score) || 0;
		const { rows } = await q(
			`UPDATE games SET
         plays = plays + $2, clears = clears + $3,
         best_score = CASE WHEN $4 > COALESCE(best_score,0) THEN $4 ELSE best_score END,
         best_score_by = CASE WHEN $4 > COALESCE(best_score,0) THEN $5 ELSE best_score_by END
       WHERE id = $1 RETURNING *`,
			[
				gameId,
				data.countPlay === false ? 0 : 1,
				data.cleared ? 1 : 0,
				score,
				// ハイスコア欄に出る名前。表示名と同じく不可視文字・★◆ を潰す
				sanitizeBbsUserName(data.displayName || "名無し"),
			],
		);
		return rows.length ? rowToGame(rows[0]) : null;
	},

	async listTopGames(limit = 30) {
		const { rows } = await q(
			`SELECT * FROM games WHERE ${PUBLIC_CREATOR_SQL} ORDER BY COALESCE(plays,0) DESC, id DESC LIMIT $1`,
			[Math.min(limit, 50)],
		);
		// ランキング表示は最大50件なので、postId解決のN+1は許容範囲
		const withPostIds = await Promise.all(
			rows.map(async (r) => ({
				...rowToGame(r),
				postId: (await pgStore.getPostIdByGameId(Number(r.id))) ?? undefined,
			})),
		);
		return withPostIds;
	},

	async getPostIdByGameId(gameId: number) {
		const { rows: t } = await q(
			`SELECT id FROM threads WHERE game_id = $1 ORDER BY id ASC LIMIT 1`,
			[gameId],
		);
		if (t.length) return threadToPostId(Number(t[0].id));
		const { rows: r } = await q(
			`SELECT id FROM res WHERE game_id = $1 ORDER BY id ASC LIMIT 1`,
			[gameId],
		);
		if (r.length) return resToPostId(Number(r[0].id));
		return null;
	},

	async getLiveGameInfo(ipAddress: string) {
		const slot = new Date().toISOString().slice(0, 13);
		const { rows: sched } = await q(
			`SELECT game_id FROM game_schedule WHERE hour_slot = $1`,
			[slot],
		);
		let gameId: number | null = null;
		if (sched.length) {
			gameId = Number(sched[0].game_id);
		} else {
			const lastSlot = new Date(Date.now() - 3600_000)
				.toISOString()
				.slice(0, 13);
			// 鍵アカが作ったゲームは投票の勝者・抽選・候補のどれにも出さない（listAllGames と同じ。
			// 投稿が見えないのに作品だけ「今の注目ゲーム」として全員に出ると存在が漏れる）
			const { rows: vote } = await q(
				`SELECT v.game_id, COUNT(*) AS cnt FROM game_votes v JOIN games g ON g.id = v.game_id
          WHERE v.hour_slot=$1 AND ${publicCreatorSql("g")}
          GROUP BY v.game_id ORDER BY cnt DESC LIMIT 1`,
				[lastSlot],
			);
			if (vote.length) gameId = Number(vote[0].game_id);
			else {
				const { rows: rnd } = await q(
					`SELECT id FROM games WHERE ${PUBLIC_CREATOR_SQL} ORDER BY RANDOM() LIMIT 1`,
				);
				if (rnd.length) gameId = Number(rnd[0].id);
			}
			if (gameId)
				await q(
					`INSERT INTO game_schedule (hour_slot, game_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
					[slot, gameId],
				);
		}
		let gameTitle = "";
		let gamePreset = "";
		if (gameId) {
			// 枠が決まったあと（この変更より前に決まった枠や、作者が後から鍵アカにした場合）でも、
			// 鍵アカの作品は出さない。その枠は「今のゲーム無し」として返す（投稿 id も題名も返さない）
			const { rows } = await q(
				`SELECT preset, title FROM games WHERE id=$1 AND ${PUBLIC_CREATOR_SQL}`,
				[gameId],
			);
			if (rows.length) {
				gameTitle = rows[0].title;
				gamePreset = rows[0].preset;
			} else {
				gameId = null;
			}
		}
		const { rows: all } = await q(
			`SELECT id, preset, title, created_at FROM games WHERE ${PUBLIC_CREATOR_SQL} ORDER BY id DESC LIMIT 30`,
		);
		const { rows: vc } = await q(
			`SELECT game_id, COUNT(*) AS cnt FROM game_votes WHERE hour_slot=$1 GROUP BY game_id`,
			[slot],
		);
		const voteCounts = new Map(
			vc.map((r: any) => [String(r.game_id), Number(r.cnt)]),
		);
		const { rows: mv } = await q(
			`SELECT game_id FROM game_votes WHERE ip_address=$1 AND hour_slot=$2`,
			[ipAddress, slot],
		);
		const myVote = mv.length ? Number(mv[0].game_id) : null;
		const nextCandidates: GameVoteCandidate[] = all
			.map((g: any) => ({
				game: {
					id: Number(g.id),
					preset: g.preset,
					title: g.title,
					createdAt: toIso(g.created_at),
				},
				votes: voteCounts.get(String(g.id)) ?? 0,
			}))
			.sort((a, b) => b.votes - a.votes);
		const postId = gameId ? await pgStore.getPostIdByGameId(gameId) : null;
		return {
			gameId,
			gameTitle,
			gamePreset,
			hourSlot: slot,
			postId,
			nextCandidates,
			myVote,
		};
	},

	async voteGame(gameId: number, ipAddress: string) {
		const slot = new Date().toISOString().slice(0, 13);
		await q(
			`INSERT INTO game_votes (game_id, ip_address, hour_slot) VALUES ($1,$2,$3)
             ON CONFLICT (ip_address, hour_slot) DO UPDATE SET game_id=$1`,
			[gameId, ipAddress, slot],
		);
	},

	async recordPresetOpen(preset: string) {
		// 日付は JST で切る（now() は timestamptz なのでセッションの TimeZone に依らない）。
		// 1行=プリセット×日なので行数は開いた回数では増えない。RETURNING なしで転送量も最小。
		await q(
			`INSERT INTO preset_opens (preset, day, opens)
       VALUES ($1, (now() AT TIME ZONE 'Asia/Tokyo')::date, 1)
       ON CONFLICT (preset, day) DO UPDATE SET opens = preset_opens.opens + 1`,
			[preset],
		);
	},

	// ゴーストプレイヤーの位置はDBに持たない（lib/db/interface.ts参照）。
};

// ============================================================================
// 補助関数
// ============================================================================
async function voteOnPost(
	id: number,
	column: "good_count" | "bad_count",
	actorId: string,
): Promise<DbPost | null> {
	const table = isReplyPostId(id) ? "res" : "threads";
	const rawId = isReplyPostId(id) ? postIdToResId(id) : postIdToThreadId(id);
	// 先に押した本人の視点で見えるかを確かめる。id を直接指定すれば鍵アカ・削除済み・他板の
	// 投稿にも加算・通知できていた（見えない投稿の存在確認にもなる）。
	// viewer 無しで引くと鍵アカの投稿が null＝404 になるので本人の視点で引く。
	const post = await pgStore.getPost(id, actorId, { withReplies: false });
	if (!post) return null;
	// good_count/bad_count は SMALLINT。32767 を超える加算は 22003 になり、以後その投稿への
	// いいねが unj・reze の両方で失敗し続けるので頭打ちにする。
	const { rows } = await q<{ n: number }>(
		`UPDATE ${table} SET ${column} = LEAST(${column} + 1, 32767) WHERE id = $1 RETURNING ${column} AS n`,
		[rawId],
	);
	// 読み直さずに加算後の値だけ差し替える（hide_reactions で伏せている数は伏せたまま）
	if (rows[0] && !post.reactionsHidden) {
		if (column === "good_count") post.likes = Number(rows[0].n);
		else post.dislikes = Number(rows[0].n);
	}
	return post;
}

// like/heart/repost の相手に通知する。自分の投稿への自作自演と、未読の同一通知の
// 重複（連打対策）は作らない。target が見つからない（削除済み等）場合も何もしない。
async function notifyPostAction(
	postId: number,
	actorUserId: string,
	type: "like" | "heart" | "repost",
) {
	const actorUid = toUid(actorUserId);
	if (actorUid === null) return;
	const isReply = isReplyPostId(postId);
	const rawId = isReply ? postIdToResId(postId) : postIdToThreadId(postId);
	const { rows } = await q(
		isReply
			? `SELECT user_id, thread_id, num FROM res WHERE id = $1`
			: `SELECT user_id, id AS thread_id, 1::int AS num FROM threads WHERE id = $1`,
		[rawId],
	);
	const row = rows[0];
	if (!row || row.user_id == null) return;
	const targetUid = Number(row.user_id);
	if (targetUid === actorUid || targetUid === SYSTEM_USER_ID) return;
	const threadId = Number(row.thread_id);
	const resNum = isReply ? Number(row.num) : null;
	// 宛先は reze の利用者（display_name あり）だけ。unj だけの利用者は reze の通知を読む手段が無く
	// （unj のトークンは reze のセッションにならない: rezeTokenOk）、共有 DB に読まれない行が溜まるだけ。
	await q(
		`INSERT INTO notifications (type, actor_user_id, target_user_id, thread_id, res_num)
     SELECT $1, $2, $3, $4, $5
     WHERE EXISTS (SELECT 1 FROM users WHERE id = $3 AND display_name IS NOT NULL)
       AND NOT EXISTS (
       SELECT 1 FROM notifications
        WHERE type = $1 AND actor_user_id = $2 AND target_user_id = $3
          AND thread_id = $4 AND res_num IS NOT DISTINCT FROM $5 AND read = FALSE
     )`,
		[type, actorUid, targetUid, threadId, resNum],
	);
}

function userRowToAnonymousUser(row: any): AnonymousUser {
	return {
		id: String(row.id),
		// 保存時にも通しているが、それより前に保存された表示名があるので読み出しでも通す
		displayName: sanitizeBbsUserName(row.display_name || ""),
		slug: String(row.id),
		avatarColor: row.avatar_color || "from-blue-500 to-indigo-600",
		avatarUrl: row.avatar_url ?? undefined,
		bio: row.bio ?? undefined,
		createdAt: toIso(row.created_at),
	};
}

function rowToMessage(row: any): Message {
	return {
		id: Number(row.id),
		sender: String(row.sender_user_id),
		text: row.text,
		recipient:
			row.recipient_user_id != null ? String(row.recipient_user_id) : undefined,
		createdAt: toIso(row.created_at),
		time: formatRelativeTime(toIso(row.created_at)),
	};
}

function rowToOshiItem(row: any): DbOshiItem {
	return {
		id: Number(row.id),
		userSlug: String(row.owner_user_id),
		kind: row.kind,
		trackId: row.track_id ?? undefined,
		collectionId: row.collection_id ?? undefined,
		artistId: row.artist_id ?? undefined,
		title: row.title,
		subtitle: row.subtitle ?? undefined,
		artworkUrl: row.artwork_url ?? undefined,
		viewUrl: row.view_url ?? undefined,
		previewUrl: row.preview_url ?? undefined,
		position: Number(row.position),
		createdAt: toIso(row.created_at),
	};
}

function rowToGame(row: any): DbGameRecord {
	return {
		id: Number(row.id),
		preset: row.preset,
		title: row.title,
		manifestUrl: row.manifest_url ?? "",
		manifestDeleteId: row.manifest_delete_id ?? undefined,
		manifestDeleteHash: row.manifest_delete_hash ?? undefined,
		bgRef: row.bg_ref ?? undefined,
		createdAt: toIso(row.created_at),
		creatorSlug:
			row.creator_user_id != null ? String(row.creator_user_id) : undefined,
		plays: Number(row.plays ?? 0),
		clears: Number(row.clears ?? 0),
		bestScore: Number(row.best_score ?? 0),
		bestScoreBy: row.best_score_by ?? undefined,
	};
}

function rowToTalk(row: any): DbTalkRecord {
	return {
		id: Number(row.id),
		title: row.title,
		manifestUrl: row.manifest_url ?? "",
		manifestDeleteId: row.manifest_delete_id ?? undefined,
		manifestDeleteHash: row.manifest_delete_hash ?? undefined,
		bgUrl: row.bg_url ?? undefined,
		createdAt: toIso(row.created_at),
		creatorSlug:
			row.creator_user_id != null ? String(row.creator_user_id) : undefined,
		plays: Number(row.plays ?? 0),
	};
}

function rowToOtomad(row: any): DbOtomadRecord {
	return {
		id: Number(row.id),
		title: row.title,
		manifestUrl: row.manifest_url ?? "",
		manifestDeleteId: row.manifest_delete_id ?? undefined,
		manifestDeleteHash: row.manifest_delete_hash ?? undefined,
		bgUrl: row.bg_url ?? undefined,
		createdAt: toIso(row.created_at),
		creatorSlug:
			row.creator_user_id != null ? String(row.creator_user_id) : undefined,
		plays: Number(row.plays ?? 0),
	};
}

function rowToMv(row: any): DbMvRecord {
	return {
		id: Number(row.id),
		preset: row.preset,
		title: row.title,
		manifestUrl: row.manifest_url ?? "",
		manifestDeleteId: row.manifest_delete_id ?? undefined,
		manifestDeleteHash: row.manifest_delete_hash ?? undefined,
		bgUrl: row.bg_url ?? undefined,
		createdAt: toIso(row.created_at),
		creatorSlug:
			row.creator_user_id != null ? String(row.creator_user_id) : undefined,
		plays: Number(row.plays ?? 0),
	};
}

async function rowsToFollowUsers(
	rows: any[],
	viewerId?: string,
): Promise<FollowUser[]> {
	const vid = toUid(viewerId);
	let followingSet = new Set<number>();
	if (vid != null && rows.length) {
		const { rows: fr } = await q(
			`SELECT followed_user_id FROM user_follows WHERE follower_user_id=$1 AND followed_user_id = ANY($2::int[])`,
			[vid, rows.map((r) => Number(r.id))],
		);
		followingSet = new Set(fr.map((r) => Number(r.followed_user_id)));
	}
	return rows.map((r) => ({
		userId: String(r.id),
		slug: String(r.id),
		displayName: sanitizeBbsUserName(r.display_name || ""),
		avatarUrl: r.avatar_url ?? undefined,
		isFollowing: vid != null ? followingSet.has(Number(r.id)) : undefined,
		isSelf: vid != null ? vid === Number(r.id) : undefined,
	}));
}

function formatNotificationAction(type: string): string {
	switch (type) {
		case "reply":
			return "が返信しました";
		case "like":
			return "がいいねしました";
		case "heart":
			return "がハートを送りました";
		case "follow":
			return "がフォローしました";
		case "mention":
			return "があなたにメンションしました";
		case "repost":
			return "がリポストしました";
		default:
			return "がいいねしました";
	}
}
