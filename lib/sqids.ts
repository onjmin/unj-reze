import Sqids from "sqids";
import type {
	GameRecord as ApiGame,
	MvRecord as ApiMv,
	Notification as ApiNotification,
	OshiItem as ApiOshiItem,
	Post as ApiPost,
} from "./types";
import type {
	DbGameRecord,
	DbMvRecord,
	DbNotification,
	DbOshiItem,
	DbPost,
} from "./types-db";

/**
 * ID は数値をそのまま文字列にして返す（旧実装は sqids でエンコードしていた）。
 *
 * なぜやめたか:
 * Cloudflare Workers の無料枠は1リクエストあたり CPU 10ms しかない。
 * `sqids.encode` は1回あたり約15µs かかり、`encodePost` は1投稿につき
 * id / threadId / parentPostId / gameId を変換する。フィードは「スレッド＋返信」を
 * 全部encodeするので、420投稿で **ID変換だけで約17ms** に達し、
 * `Error: Worker exceeded CPU time limit` で /api/posts と /post/[id] が落ちていた。
 * 生の数値なら `String(id)` で済み、実測 17ms → 0.02ms になる。
 *
 * 隠す必要が無い理由:
 * 権限判定はどこも userId / slug / target_user の照合で行っており、
 * IDの推測困難性には一切依存していない（例: 通知は `AND target_user = $1`、
 * 投稿の編集・削除は display_name / slug の一致を見る）。
 * 投稿自体も公開フィードに出ているので、IDを隠しても得られる情報は増えない。
 *
 * sqids は**旧URLを読むためだけ**に残してある。
 */
const LEGACY_SQIDS_MIN_LENGTH = 6;

const legacySqids = new Sqids({
	alphabet: "FsaJLNPRTVXZbdfhjklnpqrtvwxyz8u64o20mYWGUSQOMKIECAegicBDH31975",
	minLength: LEGACY_SQIDS_MIN_LENGTH,
});

function getChecksum(id: number): number {
	return (id * 17 + 5) % 97;
}

/** 旧 sqids 形式のIDを読む。checksum が合わなければ null。 */
function decodeLegacySqid(value: string): number | null {
	try {
		const numbers = legacySqids.decode(value);
		if (numbers.length !== 2) return null;
		const [id, checksum] = numbers;
		return getChecksum(id) === checksum ? id : null;
	} catch {
		return null;
	}
}

function parseRawId(value: string): number | null {
	const n = Number(value);
	return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function encodeId(id: number): string {
	return String(id);
}

/**
 * IDを読む。新形式（生の数値）と旧形式（sqids）の両方を受ける。
 *
 * 曖昧さの扱い: 旧 sqids は最短6文字で、英数字なので「全部数字」の旧IDもあり得る。
 * そのため 5桁以下の数字だけが新形式だと確定でき、6桁以上の数字列は
 * まず旧形式として checksum 込みで検証し、駄目なら生の数値として扱う。
 * （既存の投稿IDは連番で当面5桁に収まるため、実際に衝突する余地はほぼ無い。）
 */
export function decodeId(value: string): number | null {
	if (!value) return null;

	if (/^\d+$/.test(value)) {
		if (value.length < LEGACY_SQIDS_MIN_LENGTH) return parseRawId(value);
		return decodeLegacySqid(value) ?? parseRawId(value);
	}

	// 数字以外を含むものは旧形式か、そもそもIDではない（楽観更新の `temp-...` など）
	return decodeLegacySqid(value);
}

export function decodeIdOrThrow(
	sqid: string,
	errorMessage = "Invalid ID",
): number {
	const id = decodeId(sqid);
	if (id === null) {
		throw new Error(errorMessage);
	}
	return id;
}

/**
 * R2の削除トークンは**絶対にAPIレスポンスへ載せない**。
 *
 * delete_hash は「そのオブジェクトを消せる」ことと等価で、DELETE_SECRET_PEPPER が
 * uploader 側にしか無いので他の誰にも再計算できない。逆に言えば、一度でも
 * レスポンスに混ざると、それを見た全員が他人のMML・manifest を消せるようになる。
 *
 * 本人が編集で旧オブジェクトを消す経路では、作者判定を通したうえで
 * PATCH のレスポンスに `previousManifest` として明示的に載せている。
 */
function stripDeleteTokens<T extends Record<string, unknown>>(record: T) {
	const {
		manifestDeleteId: _a,
		manifestDeleteHash: _b,
		mmlDeleteId: _c,
		mmlDeleteHash: _d,
		...rest
	} = record as T & {
		manifestDeleteId?: string;
		manifestDeleteHash?: string;
		mmlDeleteId?: string;
		mmlDeleteHash?: string;
	};
	return rest;
}

export function encodePost(post: DbPost): ApiPost {
	return {
		...stripDeleteTokens(post as unknown as Record<string, unknown>),
		id: encodeId(post.id),
		parentPostId: post.parentPostId ? encodeId(post.parentPostId) : undefined,
		gameId: post.gameId ? encodeId(post.gameId) : undefined,
		mvId: post.mvId ? encodeId(post.mvId) : undefined,
		threadId: encodeId(post.threadId),
		replies: post.replies ? post.replies.map(encodePost) : [],
	} as ApiPost;
}

export function encodeMv(mv: DbMvRecord): ApiMv {
	return {
		...stripDeleteTokens(mv as unknown as Record<string, unknown>),
		id: encodeId(mv.id),
	} as ApiMv;
}

export function encodeGame(game: DbGameRecord): ApiGame {
	return {
		...stripDeleteTokens(game as unknown as Record<string, unknown>),
		id: encodeId(game.id),
	} as ApiGame;
}

export function encodeOshiItem(item: DbOshiItem): ApiOshiItem {
	return {
		id: encodeId(item.id),
		kind: item.kind,
		trackId: item.trackId,
		collectionId: item.collectionId,
		artistId: item.artistId,
		title: item.title,
		subtitle: item.subtitle,
		artworkUrl: item.artworkUrl,
		viewUrl: item.viewUrl,
		previewUrl: item.previewUrl,
		position: item.position,
	};
}

export function encodeNotification(
	notification: DbNotification,
): ApiNotification {
	return {
		...notification,
		id: encodeId(notification.id),
		postId: notification.postId ? encodeId(notification.postId) : undefined,
	} as ApiNotification;
}
