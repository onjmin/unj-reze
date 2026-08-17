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
 * （カウンタ加算のみ + lib/vote-guard.ts のインメモリ重複防止）。
 * そのため getLikedPosts 等の「過去に反応した投稿一覧」は提供できない
 * （空配列を返す。DBに誰が反応したかを持たない設計上の帰結）。
 *
 * ## トランザクションについて
 * @neondatabase/serverless の HTTP fetch 経路は呼び出しごとに独立して
 * 自動コミットされ、`BEGIN`/`COMMIT` を挟んでも実際には1つの実トランザクションに
 * ならない（元の reze 実装が使っていた `getPool().connect()` も同じ制約を持つ
 * フェイクの Pool だった）。真のトランザクションが要る箇所は作らず、
 * SERIAL 採番（threads.id / res.id）はDB任せにして競合класを消し、
 * res.num のような手計算が要る値は UNIQUE 制約 + リトライで守る。
 */
import { neon } from "@neondatabase/serverless";
import type { Pool } from "pg";
import { genBbsId } from "../cc-id";
import { extractChordsFromContent } from "../chord";
import type { Message, Trend } from "../mock-db";
import { extractMmlFromContent } from "../mml";
import { ensureMmlExternalized } from "../mml-payload";
import { CH_FEED, chThread, chUser } from "../realtime/channels";
import { publishRealtime } from "../realtime/publish";
import { isThreadFull, RES_LIMIT } from "../thread-limits";
import { formatRelativeTime } from "../time";
import type {
	AnonymousUser,
	FollowUser,
	GameVoteCandidate,
	OriginType,
} from "../types";
import type {
	DbGameRecord,
	DbMediaSearchPost,
	DbMvRecord,
	DbNotification,
	DbOshiItem,
	DbPost,
} from "../types-db";
import { getVoteState } from "../vote-guard";
import type {
	AddOshiItemParams,
	CreateGameParams,
	CreateMvParams,
	CreatePostParams,
	DataStore,
	MessageParams,
	MmlRef,
	RecordGamePlayParams,
	ReplyParams,
	ReportParams,
	UpdateGameParams,
	UpdateMvParams,
} from "./interface";

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

async function q<T = any>(
	text: string,
	params: any[] = [],
): Promise<{ rows: T[]; rowCount?: number }> {
	const sanitizedParams = params.map((p) => (p === undefined ? null : p));
	if (isLocalDatabaseUrl()) {
		const pool = await getLocalPool();
		const res = await pool.query(text, sanitizedParams);
		return { rows: res.rows as T[], rowCount: res.rowCount ?? undefined };
	}
	const sql = getDb();
	const res = await sql.query(text, sanitizedParams, { fullResults: true });
	return res as { rows: T[]; rowCount?: number };
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
			imageSrc: row.content_url || undefined,
		};
	}
	if (t === CT.Dtm) {
		return {
			content: text,
			hasMml: true,
			mmlUrl: row.content_data_url || undefined,
		};
	}
	if (t === CT.Text || t === CT.Chord) {
		return { content: text };
	}
	// reze にネイティブな表現が無い種別(Url/Gif/Video/Audio/Game/Sns/Oekaki/Encrypt等)。
	// unj純正のBBS投稿も同じ board_id を共有するため、表示だけは保つ。
	if (row.content_url) {
		return { content: text ? `${text}\n${row.content_url}` : row.content_url };
	}
	return { content: text };
}

/** reze の投稿データ → unj の content_type/content_text/content_url/content_data_url */
function deriveInsertContent(data: {
	content: string;
	hasImage?: boolean;
	imageSrc?: string;
	mmlUrl?: string;
}) {
	const content = data.content ?? "";
	if (data.mmlUrl || extractMmlFromContent(content)) {
		return {
			contentType: CT.Dtm,
			contentText: content,
			contentUrl: "",
			contentDataUrl: data.mmlUrl || null,
		};
	}
	if (data.hasImage && data.imageSrc) {
		return {
			contentType: CT.Image,
			contentText: content,
			contentUrl: data.imageSrc,
			contentDataUrl: "",
		};
	}
	// コード進行(#コード進行)はMMLと違ってR2へ外部化されず、本文にそのまま残る
	// （lib/mml-payload.ts の externalizeMml は #mml/#MML作曲 行しか見ない）。
	// そのため mmlUrl/imageSrc のどちらでもない場合でも本文を見て判定する。
	if (extractChordsFromContent(content)) {
		return {
			contentType: CT.Chord,
			contentText: content,
			contentUrl: "",
			contentDataUrl: "",
		};
	}
	return {
		contentType: CT.Text,
		contentText: content,
		contentUrl: "",
		contentDataUrl: "",
	};
}

// ============================================================================
// row → DbPost
// ============================================================================
function threadRowToPost(row: any, replies: DbPost[] = []): DbPost {
	const postId = threadToPostId(Number(row.id));
	const disp = deriveDisplay(row);
	return {
		id: postId,
		displayName: row.author_display_name || row.cc_user_name || "名無し",
		slug: String(row.user_id),
		bbsId: row.cc_user_id || undefined,
		datKey:
			row.dat_key != null
				? Number(row.dat_key)
				: Math.floor(new Date(toIso(row.created_at)).getTime() / 1000),
		title: row.title || undefined,
		createdAt: toIso(row.created_at),
		time: formatRelativeTime(toIso(row.created_at)),
		content: disp.content,
		likes: row.good_count ?? 0,
		dislikes: row.bad_count ?? 0,
		liked: false,
		disliked: false,
		repliesCount: Math.max(Number(row.res_count ?? 1) - 1, 0),
		reposts: row.reposts ?? 0,
		reposted: !!row.reposted,
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
		hasMml: disp.hasMml,
		mmlUrl: disp.mmlUrl,
		dotW: row.dot_w != null ? Number(row.dot_w) : undefined,
		dotH: row.dot_h != null ? Number(row.dot_h) : undefined,
		originType: row.origin_type ?? undefined,
		isFalseDeclaration: row.is_false_declaration ?? false,
		isEdited: row.is_edited ?? false,
		threadId: postId,
		parentPostId: undefined,
		replies,
	};
}

function resRowToPost(row: any): DbPost {
	const postId = resToPostId(Number(row.id));
	const threadPostId = threadToPostId(Number(row.thread_id));
	const disp = deriveDisplay(row);
	return {
		id: postId,
		displayName: row.author_display_name || row.cc_user_name || "名無し",
		slug: String(row.user_id),
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
		reposted: !!row.reposted,
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
		hasMml: disp.hasMml,
		mmlUrl: disp.mmlUrl,
		dotW: row.dot_w != null ? Number(row.dot_w) : undefined,
		dotH: row.dot_h != null ? Number(row.dot_h) : undefined,
		originType: row.origin_type ?? undefined,
		isFalseDeclaration: row.is_false_declaration ?? false,
		isEdited: row.is_edited ?? false,
		threadId: threadPostId,
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

const AUTHOR_SELECT = `u.display_name AS author_display_name, u.avatar_url AS author_avatar_url, u.hide_from_search AS author_hide_from_search`;

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
	return Number.isInteger(n) && n > 0 ? n : null;
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
// フィード用: スレッドに付随する返信を軽量に埋め込む（全件は引かない）
// ============================================================================
const FEED_REPLIES_PER_THREAD = 20;

async function attachRepliesToThreads(
	threads: DbPost[],
	threadDbIds: number[],
): Promise<void> {
	if (threadDbIds.length === 0) return;
	const { rows } = await q(
		`SELECT * FROM (
       SELECT r.*, ${AUTHOR_SELECT},
         ROW_NUMBER() OVER (PARTITION BY r.thread_id ORDER BY r.num DESC) AS rn
       FROM res r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.thread_id = ANY($1::int[])
     ) x WHERE rn <= $2 ORDER BY thread_id, num`,
		[threadDbIds, FEED_REPLIES_PER_THREAD],
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

		const where: string[] = ["t.deleted_at IS NULL", "t.board_id = 1"];
		const params: any[] = [];
		if (cursorThreadId != null) {
			params.push(cursorThreadId);
			where.push(`t.id < $${params.length}`);
		}
		if (options.hasMml !== undefined)
			where.push(`t.content_type ${options.hasMml ? "=" : "<>"} ${CT.Dtm}`);
		if (options.hasImage !== undefined)
			where.push(`t.content_type ${options.hasImage ? "=" : "<>"} ${CT.Image}`);
		if (options.hasGame !== undefined)
			where.push(`t.game_id IS ${options.hasGame ? "NOT NULL" : "NULL"}`);
		if (options.hasMv !== undefined)
			where.push(`t.mv_id IS ${options.hasMv ? "NOT NULL" : "NULL"}`);
		params.push(limit);

		const { rows } = await q(
			`SELECT t.*, ${DAT_KEY_SELECT}, ${AUTHOR_SELECT} FROM threads t
       LEFT JOIN users u ON u.id = t.user_id
       WHERE ${where.join(" AND ")}
       ORDER BY t.id DESC LIMIT $${params.length}`,
			params,
		);
		const filtered = rows.filter((r) => !hidden.has(Number(r.user_id)));
		const posts = filtered.map((r) => threadRowToPost(r));
		await attachRepliesToThreads(
			posts,
			filtered.map((r) => Number(r.id)),
		);
		return posts.map((p) => withViewerVoteState(p, userId));
	},

	async getPost(id: number, userId?: string) {
		if (isReplyPostId(id)) {
			const resId = postIdToResId(id);
			const { rows } = await q(
				`SELECT r.*, ${AUTHOR_SELECT} FROM res r LEFT JOIN users u ON u.id = r.user_id WHERE r.id = $1`,
				[resId],
			);
			if (rows.length === 0) return null;
			const row = rows[0];
			const { rows: parentRows } = await q(
				`SELECT num, id FROM res WHERE thread_id = $1`,
				[row.thread_id],
			);
			const numToPostId = new Map<number, number>([
				[1, threadToPostId(Number(row.thread_id))],
			]);
			for (const p of parentRows)
				numToPostId.set(Number(p.num), resToPostId(Number(p.id)));
			const post = resRowToPost(row);
			const parentNum = row.parent_num != null ? Number(row.parent_num) : 1;
			post.parentPostId = numToPostId.get(parentNum) ?? post.threadId;
			return withViewerVoteState(post, userId);
		}

		const threadId = postIdToThreadId(id);
		const { rows } = await q(
			`SELECT t.*, ${DAT_KEY_SELECT}, ${AUTHOR_SELECT} FROM threads t LEFT JOIN users u ON u.id = t.user_id WHERE t.id = $1 AND t.deleted_at IS NULL`,
			[threadId],
		);
		if (rows.length === 0) return null;
		const post = threadRowToPost(rows[0]);
		await attachRepliesToThreads([post], [threadId]);
		return withViewerVoteState(post, userId);
	},

	async getPostByDatKey(datKey: number, userId?: string) {
		// 旧データ(dat_key未採番)も引けるよう、NULLならcreated_atから都度算出して比較する。
		const { rows } = await q(
			`SELECT t.*, ${DAT_KEY_SELECT}, ${AUTHOR_SELECT} FROM threads t LEFT JOIN users u ON u.id = t.user_id
         WHERE t.deleted_at IS NULL
           AND COALESCE(t.dat_key, FLOOR(EXTRACT(EPOCH FROM t.created_at))::BIGINT) = $1`,
			[datKey],
		);
		if (rows.length === 0) return null;
		const threadId = Number(rows[0].id);
		const post = threadRowToPost(rows[0]);
		await attachRepliesToThreads([post], [threadId]);
		return withViewerVoteState(post, userId);
	},

	async createPost(data: CreatePostParams) {
		// クライアントが mmlUrl を付け損ねていても、本文に生MMLマーカーが残っていれば
		// ここで自前でR2へ外部化し直す（詳細: lib/mml-payload.ts の ensureMmlExternalized）。
		const mmlResolved = await ensureMmlExternalized(data.content, data);
		const c = deriveInsertContent({ ...data, ...mmlResolved });
		const authorId = data.slug ? Number(data.slug) : null;
		if (authorId == null || !Number.isFinite(authorId)) {
			throw new Error(
				"createPost には解決済みの投稿者(slug=users.id)が必要です",
			);
		}
		// dat_key は手計算(UNIQUE)なので、同一秒の同時スレ立てで衝突したらリトライする
		// （lib/db/pg.ts addReply の num 採番と同じ方式）。
		let row: any = null;
		for (let attempt = 0; attempt < 5 && !row; attempt++) {
			try {
				const { rows } = await q(
					`INSERT INTO threads (
             created_at, dat_key, ip, res_count, latest_res, latest_res_at, title, board_id, res_limit,
             cc_bitmask, content_types_bitmask,
             user_id, cc_user_id, cc_user_name, cc_user_avatar, avatar_color,
             content_text, content_url, content_type, content_data_url,
             has_collab_button, game_id, mv_id, origin_type, dot_w, dot_h
           ) VALUES (
             CURRENT_TIMESTAMP,
             GREATEST(
               FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP))::BIGINT,
               (SELECT COALESCE(MAX(dat_key), 0) + 1 FROM threads)
             ),
             '0.0.0.0'::inet,1,$1,CURRENT_TIMESTAMP,$2,1,${RES_LIMIT},
                     ${DEFAULT_CC_BITMASK},${DEFAULT_CONTENT_TYPES_BITMASK},
                     $3,$4,$5,0,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           RETURNING *`,
					[
						(mmlResolved.content || "")
							.split("\n")
							.find((l) => l.trim())
							?.slice(0, 64) || "",
						(mmlResolved.content || "")
							.split("\n")
							.find((l) => l.trim())
							?.slice(0, 64) || "無題",
						// cc_user_id は reze の掲示板モード（lib/avatar.tsx:getUserIdLabel）が
						// 「ID:」として表示する値。生の users.id (=String(authorId)) をそのまま
						// 入れると連番が丸見えになるため genBbsId でハッシュ化する。
						// board_id は上のVALUES句と同じく固定で 1。
						authorId,
						genBbsId(authorId, 1),
						data.displayName,
						data.avatarColor ?? null,
						c.contentText,
						c.contentUrl,
						c.contentType,
						c.contentDataUrl,
						// お絵描き投稿もコラボの起点になる（CollabSelector→DrawingEditor/DotDrawingEditor）。
						// ここに hasImage を足し忘れると post.hasImage && post.hasCollabButton が
						// 常にfalseになり、画像に「コラボ」ボタンが一度も出ないまま導線が死ぬ。
						!!(data.gameId || data.mvId || (data.hasImage && data.imageSrc)),
						data.gameId ?? null,
						data.mvId ?? null,
						data.originType ?? null,
						data.dotW ?? null,
						data.dotH ?? null,
					],
				);
				row = rows[0];
			} catch (e: any) {
				if (e?.code !== "23505" || attempt === 4) throw e;
			}
		}
		const { rows: userRows } = await q(
			`SELECT display_name, avatar_url FROM users WHERE id = $1`,
			[authorId],
		);
		row.author_display_name = userRows[0]?.display_name;
		row.author_avatar_url = userRows[0]?.avatar_url;
		return threadRowToPost(row, []);
	},

	async likePost(id: number, userId: string) {
		return voteOnPost(id, "good_count");
	},
	async dislikePost(id: number, userId: string) {
		return voteOnPost(id, "bad_count");
	},

	async heartPost(id: number, userId: string, count = 1) {
		const table = isReplyPostId(id) ? "res" : "threads";
		const rawId = isReplyPostId(id) ? postIdToResId(id) : postIdToThreadId(id);
		await q(
			`UPDATE ${table} SET hearts_total = hearts_total + $1 WHERE id = $2`,
			[count, rawId],
		);
		return pgStore.getPost(id);
	},

	async repostPost(id: number) {
		const table = isReplyPostId(id) ? "res" : "threads";
		const rawId = isReplyPostId(id) ? postIdToResId(id) : postIdToThreadId(id);
		await q(
			`UPDATE ${table} SET reposted = NOT reposted,
         reposts = CASE WHEN reposted THEN GREATEST(reposts - 1, 0) ELSE reposts + 1 END
       WHERE id = $1`,
			[rawId],
		);
		return pgStore.getPost(id);
	},

	async getReplies(postId: number, userId?: string) {
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
		const { rows } = await q(
			`SELECT r.*, ${AUTHOR_SELECT} FROM res r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.thread_id = $1 ORDER BY r.num`,
			[threadId],
		);
		const filtered = rows.filter((r) => !hidden.has(Number(r.user_id)));
		const numToPostId = new Map<number, number>([
			[1, threadToPostId(threadId)],
		]);
		for (const r of filtered)
			numToPostId.set(Number(r.num), resToPostId(Number(r.id)));
		return filtered.map((r) => {
			const post = resRowToPost(r);
			const parentNum = r.parent_num != null ? Number(r.parent_num) : 1;
			post.parentPostId =
				numToPostId.get(parentNum) ?? threadToPostId(threadId);
			return withViewerVoteState(post, userId);
		});
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
		const authorId = data.slug ? Number(data.slug) : null;
		if (authorId == null || !Number.isFinite(authorId)) {
			throw new Error("addReply には解決済みの投稿者(slug=users.id)が必要です");
		}

		const { rows: threadRows } = await q(
			`SELECT id, user_id, res_count FROM threads WHERE id = $1 AND deleted_at IS NULL`,
			[threadId],
		);
		if (threadRows.length === 0) return null;
		const thread = threadRows[0];
		if (isThreadFull(Number(thread.res_count ?? 1))) {
			throw new Error(`このスレッドは上限（${RES_LIMIT}レス）に達しています`);
		}

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
		// num はSERIALではなく手計算(UNIQUE(thread_id,num))なので、競合時はリトライする
		let inserted: any = null;
		for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
			try {
				const { rows } = await q(
					`INSERT INTO res (
             thread_id, num, created_at, ip, is_owner, sage,
             user_id, cc_user_id, cc_user_name, cc_user_avatar, avatar_color,
             content_text, content_url, content_type, content_data_url,
             has_collab_button, game_id, mv_id, parent_num, origin_type, dot_w, dot_h
           ) VALUES ($1, (SELECT COALESCE(MAX(num),1)+1 FROM res WHERE thread_id=$1),
                     CURRENT_TIMESTAMP,'0.0.0.0'::inet,$2,FALSE,$3,$4,$5,0,$6,
                     $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           RETURNING *`,
					[
						// cc_user_id は createPost と同じく genBbsId でハッシュ化する（board_id固定1）
						threadId,
						authorId === Number(thread.user_id),
						authorId,
						genBbsId(authorId, 1),
						data.displayName,
						data.avatarColor ?? null,
						c.contentText,
						c.contentUrl,
						c.contentType,
						c.contentDataUrl,
						// createPost と同じ理由でhasImageも起点にする
						!!(data.gameId || data.mvId || (data.hasImage && data.imageSrc)),
						data.gameId ?? null,
						data.mvId ?? null,
						parentNum,
						data.originType ?? null,
						data.dotW ?? null,
						data.dotH ?? null,
					],
				);
				inserted = rows[0];
			} catch (e: any) {
				if (e?.code !== "23505" || attempt === 4) throw e;
			}
		}

		await q(
			`UPDATE threads SET res_count = res_count + 1, latest_res = $1, latest_res_at = CURRENT_TIMESTAMP WHERE id = $2`,
			[
				(data.content || "")
					.split("\n")
					.find((l) => l.trim())
					?.slice(0, 64) || "",
				threadId,
			],
		);

		// 通知（返信先の投稿者へ）。自分自身への返信は通知しない
		if (Number(thread.user_id) !== authorId) {
			await q(
				`INSERT INTO notifications (type, actor_user_id, target_user_id, thread_id, res_num)
         VALUES ('reply', $1, $2, $3, $4)`,
				[authorId, thread.user_id, threadId, inserted.num],
			);
		}
		// @メンション通知。content 中の @<数値ID> を宛先として解釈する
		const mentions = [...(data.content || "").matchAll(/@(\d+)/g)].map((m) =>
			Number(m[1]),
		);
		for (const mentionedId of new Set(mentions)) {
			if (mentionedId === authorId || mentionedId === Number(thread.user_id))
				continue;
			const exists = await q(`SELECT 1 FROM users WHERE id = $1`, [
				mentionedId,
			]);
			if (exists.rows.length) {
				await q(
					`INSERT INTO notifications (type, actor_user_id, target_user_id, thread_id, res_num)
           VALUES ('mention', $1, $2, $3, $4)`,
					[authorId, mentionedId, threadId, inserted.num],
				);
			}
		}

		const { rows: userRows } = await q(
			`SELECT display_name, avatar_url FROM users WHERE id = $1`,
			[authorId],
		);
		inserted.author_display_name = userRows[0]?.display_name;
		inserted.author_avatar_url = userRows[0]?.avatar_url;
		const post = resRowToPost(inserted);
		post.parentPostId =
			parentNum === 1 ? threadToPostId(threadId) : post.parentPostId;

		publishRealtime({
			channel: chThread(String(threadToPostId(threadId))),
			event: "reply.created",
			data: post,
		});
		publishRealtime({ channel: CH_FEED, event: "reply.created", data: post });
		return post;
	},

	async editPost(
		id: number,
		userId: string,
		content: string,
		originType?: OriginType | null,
		imageSrc?: string,
		mml?: MmlRef,
	) {
		const table = isReplyPostId(id) ? "res" : "threads";
		const rawId = isReplyPostId(id) ? postIdToResId(id) : postIdToThreadId(id);
		const { rows } = await q(`SELECT user_id FROM ${table} WHERE id = $1`, [
			rawId,
		]);
		if (rows.length === 0 || String(rows[0].user_id) !== userId) return null;

		const sets: string[] = [];
		const vals: any[] = [];
		const push = (col: string, v: unknown) => {
			vals.push(v);
			sets.push(`${col} = $${vals.length}`);
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
		const mmlResolved = await ensureMmlExternalized(content, mml);
		const needsMmlRewrite = !!mmlResolved.mmlUrl;
		const hasInlineMml = extractMmlFromContent(content) !== null;
		if (mml !== undefined || needsMmlRewrite || hasInlineMml) {
			const c = deriveInsertContent({
				content: mmlResolved.content,
				mmlUrl: mmlResolved.mmlUrl,
				hasImage: !!imageSrc,
				imageSrc,
			});
			push("content_text", c.contentText);
			push("content_url", c.contentUrl);
			push("content_type", c.contentType);
			push("content_data_url", c.contentDataUrl);
			if (imageSrc) push("has_collab_button", true);
		} else if (imageSrc !== undefined) {
			const c = deriveInsertContent({
				content,
				hasImage: !!imageSrc,
				imageSrc,
			});
			push("content_text", c.contentText);
			push("content_url", c.contentUrl);
			push("content_type", c.contentType);
			push("content_data_url", c.contentDataUrl);
			// 画像を新たに足した／差し替えた編集はコラボの起点にする。createPost/addReply
			// と同じ理由（お絵描き投稿は自動的にコラボ可能にする設計）。
			if (imageSrc) push("has_collab_button", true);
		} else {
			// 添付には触れない、本文だけの編集。既存の content_type/URL は保つ
			push("content_text", content);
		}
		if (originType !== undefined) push("origin_type", originType);
		push("is_edited", true);

		vals.push(rawId);
		await q(
			`UPDATE ${table} SET ${sets.join(", ")} WHERE id = $${vals.length}`,
			vals,
		);
		return pgStore.getPost(id, userId);
	},

	async deletePost(id: number, userId: string) {
		if (isReplyPostId(id)) {
			const resId = postIdToResId(id);
			const { rows } = await q(
				`SELECT thread_id, user_id FROM res WHERE id = $1`,
				[resId],
			);
			if (rows.length === 0 || String(rows[0].user_id) !== userId) return false;
			await q(`DELETE FROM res WHERE id = $1`, [resId]);
			await q(
				`UPDATE threads SET res_count = GREATEST(res_count - 1, 1) WHERE id = $1`,
				[rows[0].thread_id],
			);
			return true;
		}
		const threadId = postIdToThreadId(id);
		const { rows } = await q(`SELECT user_id FROM threads WHERE id = $1`, [
			threadId,
		]);
		if (rows.length === 0 || String(rows[0].user_id) !== userId) return false;
		await q(`UPDATE threads SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1`, [
			threadId,
		]);
		return true;
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

	async getUserPostsBySlug(slug: string, userId?: string, limit = 20) {
		const uid = Number(slug);
		if (!Number.isFinite(uid)) return [];
		const safeLimit = Math.max(1, Math.min(limit, 50));
		const { rows: tRows } = await q(
			`SELECT t.*, ${DAT_KEY_SELECT}, ${AUTHOR_SELECT} FROM threads t LEFT JOIN users u ON u.id = t.user_id
       WHERE t.user_id = $1 AND t.deleted_at IS NULL ORDER BY t.id DESC LIMIT $2`,
			[uid, safeLimit],
		);
		const { rows: rRows } = await q(
			`SELECT r.*, ${AUTHOR_SELECT} FROM res r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.user_id = $1 ORDER BY r.id DESC LIMIT $2`,
			[uid, safeLimit],
		);
		const posts = [
			...tRows.map((r) => threadRowToPost(r)),
			...rRows.map((r) => resRowToPost(r)),
		]
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
			.slice(0, safeLimit);
		return posts.map((p) => withViewerVoteState(p, userId));
	},

	async getUserDisplayName(slug: string) {
		const uid = Number(slug);
		if (!Number.isFinite(uid)) return undefined;
		const { rows } = await q(`SELECT display_name FROM users WHERE id = $1`, [
			uid,
		]);
		return rows[0]?.display_name ?? undefined;
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

	async getNotifications(userId?: string) {
		const uid = toUid(userId);
		if (uid === null) return [];
		const { rows } = await q(
			`SELECT n.*, au.display_name AS actor_name, t.title AS thread_title
         FROM notifications n
         LEFT JOIN users au ON au.id = n.actor_user_id
         LEFT JOIN threads t ON t.id = n.thread_id
        WHERE n.target_user_id = $1
        ORDER BY n.id DESC LIMIT 50`,
			[uid],
		);
		return rows.map((r): DbNotification => {
			const postId =
				r.thread_id != null
					? r.res_num != null && Number(r.res_num) > 1
						? undefined
						: threadToPostId(Number(r.thread_id))
					: undefined;
			return {
				id: Number(r.id),
				actorSlug:
					r.actor_user_id != null ? String(r.actor_user_id) : undefined,
				targetSlug: String(r.target_user_id),
				user: r.actor_name || "名無し",
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
		const { rows } = await q(
			`SELECT * FROM messages WHERE sender_user_id = $1 OR recipient_user_id = $1 ORDER BY created_at DESC LIMIT 100`,
			[uid],
		);
		return rows.map(rowToMessage);
	},
	async getConversation(userId: string, partnerId: string, limit = 100) {
		const uid = toUid(userId);
		const pid = toUid(partnerId);
		if (uid === null || pid === null) return [];
		const { rows } = await q(
			`SELECT * FROM messages WHERE (sender_user_id=$1 AND recipient_user_id=$2) OR (sender_user_id=$2 AND recipient_user_id=$1)
       ORDER BY created_at DESC LIMIT $3`,
			[uid, pid, limit],
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
		const { rows } = await q(
			`INSERT INTO messages (sender_user_id, recipient_user_id, text) VALUES ($1,$2,$3) RETURNING *`,
			[senderId, recipientId, data.text],
		);
		if (recipientId != null) {
			publishRealtime({
				channel: chUser(String(recipientId)),
				event: "message.created",
				data: rowToMessage(rows[0]),
			});
		}
		return rowToMessage(rows[0]);
	},

	async getTrends() {
		try {
			const { rows } = await q(`
        SELECT m[1] AS keyword, COUNT(*) AS count FROM (
          SELECT regexp_replace(content_text, 'https?://[^\\s]+|www\\.[^\\s]+', '', 'gi') AS cleaned
          FROM (
            SELECT content_text FROM threads WHERE board_id = 1 AND deleted_at IS NULL
            UNION ALL
            SELECT content_text FROM res
          ) c
        ) p, LATERAL regexp_matches(p.cleaned, '#[^\\s#]+', 'g') AS m
        WHERE m[1] != '#'
          AND m[1] !~ '^#\\d+$'
          AND m[1] !~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'
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
		const like = `%${query.trim()}%`;
		const hidden = await getHiddenUserIds(userId);
		const { rows: tRows } = await q(
			`SELECT t.*, ${DAT_KEY_SELECT}, ${AUTHOR_SELECT} FROM threads t LEFT JOIN users u ON u.id = t.user_id
       WHERE t.board_id=1 AND t.deleted_at IS NULL
         AND (t.content_text ILIKE $1 OR COALESCE(u.display_name,t.cc_user_name) ILIKE $1)
       ORDER BY t.id DESC LIMIT $2`,
			[like, safeLimit],
		);
		const { rows: rRows } = await q(
			`SELECT r.*, ${AUTHOR_SELECT} FROM res r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.content_text ILIKE $1 OR COALESCE(u.display_name,r.cc_user_name) ILIKE $1
       ORDER BY r.id DESC LIMIT $2`,
			[like, safeLimit],
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
		return posts.map((p) => withViewerVoteState(p, userId));
	},

	async searchMedia(
		kind: "image" | "mml",
		query: string,
		userId?: string,
		limit = 50,
		offset = 0,
	) {
		const safeLimit = Math.max(1, Math.min(limit, 50));
		const safeOffset = Math.max(0, offset);
		// threads/res をマージしてから offset+limit 件目で切るため、各テーブルからは
		// 「id降順で offset+limit 件」だけ引けば十分（全件取得は egress を壊す）。
		const fetchEach = Math.min(safeOffset + safeLimit, 200);
		const contentType = kind === "image" ? CT.Image : CT.Dtm;
		const trimmed = query.trim();
		const params: any[] = [contentType];
		let where = `content_type = $1 AND COALESCE(u.hide_from_search, false) = false`;
		if (trimmed) {
			params.push(`%${trimmed}%`);
			where += ` AND (content_text ILIKE $${params.length} OR COALESCE(u.display_name, cc_user_name) ILIKE $${params.length})`;
		}
		params.push(fetchEach);

		const [{ rows: tRows }, { rows: rRows }] = await Promise.all([
			q(
				`SELECT t.id, t.user_id, t.content_text, t.content_url, t.content_data_url, t.origin_type, t.dot_w, t.dot_h, ${AUTHOR_SELECT}
           FROM threads t LEFT JOIN users u ON u.id=t.user_id
          WHERE t.deleted_at IS NULL AND ${where
						.replace(/content_type/g, "t.content_type")
						.replace(/content_text/g, "t.content_text")
						.replace(/cc_user_name/g, "t.cc_user_name")}
          ORDER BY t.id DESC LIMIT $${params.length}`,
				params,
			),
			q(
				`SELECT r.id, r.thread_id, r.user_id, r.content_text, r.content_url, r.content_data_url, r.origin_type, r.dot_w, r.dot_h, ${AUTHOR_SELECT}
           FROM res r LEFT JOIN users u ON u.id=r.user_id
          WHERE ${where
						.replace(/content_type/g, "r.content_type")
						.replace(/content_text/g, "r.content_text")
						.replace(/cc_user_name/g, "r.cc_user_name")}
          ORDER BY r.id DESC LIMIT $${params.length}`,
				params,
			),
		]);
		const out: DbMediaSearchPost[] = [
			...tRows.map(
				(r): DbMediaSearchPost => ({
					id: threadToPostId(Number(r.id)),
					displayName: r.author_display_name || "名無し",
					content: r.content_text ?? "",
					imageSrc: r.content_url || undefined,
					mmlUrl: kind === "mml" ? r.content_data_url || undefined : undefined,
					dotW: r.dot_w != null ? Number(r.dot_w) : undefined,
					dotH: r.dot_h != null ? Number(r.dot_h) : undefined,
					originType: r.origin_type || undefined,
					isOwner: userId ? r.user_id === userId : false,
				}),
			),
			...rRows.map(
				(r): DbMediaSearchPost => ({
					id: resToPostId(Number(r.id)),
					displayName: r.author_display_name || "名無し",
					content: r.content_text ?? "",
					imageSrc: r.content_url || undefined,
					mmlUrl: kind === "mml" ? r.content_data_url || undefined : undefined,
					dotW: r.dot_w != null ? Number(r.dot_w) : undefined,
					dotH: r.dot_h != null ? Number(r.dot_h) : undefined,
					originType: r.origin_type || undefined,
					isOwner: userId ? r.user_id === userId : false,
				}),
			),
		];
		// thread と res の id 空間は別なので、ここではソート順は投稿順に近似する程度でよい
		// （新しい順の目安として大きいID優先）。
		out.sort((a, b) => Number(b.id) - Number(a.id));
		return out.slice(safeOffset, safeOffset + safeLimit);
	},

	async getPostsByHashtag(tag: string, userId?: string, limit = 20) {
		const rawTag = tag.startsWith("#") ? tag : `#${tag}`;
		const escapedTag = rawTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const safeLimit = Math.max(1, Math.min(limit, 50));
		const hidden = await getHiddenUserIds(userId);
		const { rows } = await q(
			`SELECT t.*, ${DAT_KEY_SELECT}, ${AUTHOR_SELECT} FROM threads t LEFT JOIN users u ON u.id=t.user_id
       WHERE t.board_id=1 AND t.deleted_at IS NULL
         AND t.content_text ~ ('(^|[[:space:]])' || $1 || '([[:space:]]|$)')
       ORDER BY t.id DESC LIMIT $2`,
			[escapedTag, safeLimit],
		);
		return rows
			.filter((r) => !hidden.has(Number(r.user_id)))
			.map((r) => withViewerVoteState(threadRowToPost(r), userId));
	},

	// ==========================================================================
	// 認証・プロフィール
	// ==========================================================================
	async getOrCreateAnonymousUser(sessionId: string, ipAddress: string) {
		const { rows: tokRows } = await q(
			`SELECT u.* FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token = $1 AND t.kind = 'reze' LIMIT 1`,
			[sessionId],
		);
		if (tokRows.length) {
			await q(
				`UPDATE auth_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token = $1`,
				[sessionId],
			);
			return userRowToAnonymousUser(tokRows[0]);
		}
		// 新規ユーザー。unj同様、表示名は「名無し」+ ランダム3文字
		const suffix = Math.random().toString(36).slice(2, 5);
		const displayName = `名無し${suffix}`;
		const { rows } = await q(
			`INSERT INTO users (created_at, updated_at, last_seen_at, ip, display_name, avatar_color)
       VALUES (CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, COALESCE($1::inet,'0.0.0.0'::inet), $2, 'from-blue-500 to-indigo-600')
       RETURNING *`,
			[
				/^\d{1,3}(\.\d{1,3}){3}$/.test(ipAddress) ? ipAddress : null,
				displayName,
			],
		);
		const user = rows[0];
		await q(
			`INSERT INTO auth_tokens (user_id, token, ip, kind) VALUES ($1,$2,COALESCE($3::inet,'0.0.0.0'::inet),'reze')
       ON CONFLICT (token) DO NOTHING`,
			[
				user.id,
				sessionId,
				/^\d{1,3}(\.\d{1,3}){3}$/.test(ipAddress) ? ipAddress : null,
			],
		);
		return userRowToAnonymousUser(user);
	},

	async getAnonymousUserBySession(sessionId: string) {
		const { rows } = await q(
			`SELECT u.* FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token = $1 LIMIT 1`,
			[sessionId],
		);
		if (!rows.length) return null;
		return userRowToAnonymousUser(rows[0]);
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
		if (displayName !== undefined) push("display_name", displayName);
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
		const { rows } = await q(
			`SELECT * FROM oshi_items WHERE owner_user_id = $1 ORDER BY position`,
			[uid],
		);
		return rows.map(rowToOshiItem);
	},
	async addOshiItem(userSlug: string, data: AddOshiItemParams) {
		const uid = toUid(userSlug);
		if (uid === null) throw new Error("invalid userSlug");
		const { rows: posRows } = await q(
			`SELECT COALESCE(MAX(position),-1)+1 AS next_pos FROM oshi_items WHERE owner_user_id = $1`,
			[uid],
		);
		const position = posRows[0].next_pos;
		const { rows } = await q(
			`INSERT INTO oshi_items (owner_user_id, kind, track_id, collection_id, artist_id, title, subtitle, artwork_url, view_url, preview_url, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
			[
				uid,
				data.kind,
				data.trackId ?? null,
				data.collectionId ?? null,
				data.artistId ?? null,
				data.title,
				data.subtitle ?? null,
				data.artworkUrl ?? null,
				data.viewUrl ?? null,
				data.previewUrl ?? null,
				position,
			],
		);
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
		const token = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
		await q(`INSERT INTO migration_tokens (token, user_id) VALUES ($1,$2)`, [
			token,
			uid,
		]);
		return token;
	},
	async redeemMigrationToken(token: string, newSessionId: string) {
		const { rows } = await q(
			`SELECT user_id FROM migration_tokens WHERE token = $1`,
			[token],
		);
		if (!rows.length) return null;
		const userId = Number(rows[0].user_id);
		const { rows: userRows } = await q(`SELECT * FROM users WHERE id = $1`, [
			userId,
		]);
		if (!userRows.length) return null;
		await q(
			`INSERT INTO auth_tokens (user_id, token, kind) VALUES ($1,$2,'reze') ON CONFLICT (token) DO NOTHING`,
			[userId, newSessionId],
		);
		await q(`DELETE FROM migration_tokens WHERE token = $1`, [token]);
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
			`INSERT INTO user_follows (follower_user_id, followed_user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
			[from, to],
		);
		await q(
			`INSERT INTO notifications (type, actor_user_id, target_user_id) VALUES ('follow',$1,$2)`,
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
			`INSERT INTO user_blocks (blocker_user_id, blocked_user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
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
			`INSERT INTO user_mutes (muter_user_id, muted_user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
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
		await q(
			`INSERT INTO reports (reporter_user_id, target_type, target_id, reason) VALUES ($1,$2,$3,$4)`,
			[
				Number(data.reporterSlug) || null,
				data.targetType,
				data.targetId,
				data.reason,
			],
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
		const { rows } = await q(`SELECT * FROM games ORDER BY id DESC LIMIT $1`, [
			Math.min(limit, 50),
		]);
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
				data.displayName || "名無し",
			],
		);
		return rows.length ? rowToGame(rows[0]) : null;
	},

	async listTopGames(limit = 30) {
		const { rows } = await q(
			`SELECT * FROM games ORDER BY COALESCE(plays,0) DESC, id DESC LIMIT $1`,
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
			const { rows: vote } = await q(
				`SELECT game_id, COUNT(*) AS cnt FROM game_votes WHERE hour_slot=$1 GROUP BY game_id ORDER BY cnt DESC LIMIT 1`,
				[lastSlot],
			);
			if (vote.length) gameId = Number(vote[0].game_id);
			else {
				const { rows: rnd } = await q(
					`SELECT id FROM games ORDER BY RANDOM() LIMIT 1`,
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
			const { rows } = await q(`SELECT preset, title FROM games WHERE id=$1`, [
				gameId,
			]);
			if (rows.length) {
				gameTitle = rows[0].title;
				gamePreset = rows[0].preset;
			}
		}
		const { rows: all } = await q(
			`SELECT id, preset, title, created_at FROM games ORDER BY id DESC LIMIT 30`,
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

	// ゴーストプレイヤーの位置はDBに持たない（lib/db/interface.ts参照）。
};

// ============================================================================
// 補助関数
// ============================================================================
async function voteOnPost(
	id: number,
	column: "good_count" | "bad_count",
): Promise<DbPost | null> {
	const table = isReplyPostId(id) ? "res" : "threads";
	const rawId = isReplyPostId(id) ? postIdToResId(id) : postIdToThreadId(id);
	await q(`UPDATE ${table} SET ${column} = ${column} + 1 WHERE id = $1`, [
		rawId,
	]);
	return pgStore.getPost(id);
}

function userRowToAnonymousUser(row: any): AnonymousUser {
	return {
		id: String(row.id),
		displayName: row.display_name || "名無し",
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
		slug: String(r.id),
		displayName: r.display_name || "名無し",
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
