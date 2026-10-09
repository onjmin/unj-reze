import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/ip";
import {
	checkTieredRateLimit,
	dedupeOnce,
	getRateLimitEnv,
} from "@/lib/security/rate-limit";
import type { AnonymousUser } from "@/lib/types";

/** lib/session.ts がクライアント側で書くセッションCookieと同名 */
export const SESSION_COOKIE = "unj_reze_session";

/**
 * GET など本文の無いリクエストで、Cookie が落ちる環境（サードパーティCookie制限など）向けに
 * セッションIDを載せるヘッダー。lib/api.ts の fetcher が付ける。
 * 本文の sessionId と同じく「秘密そのもの」なので、URL のクエリには載せないこと
 * （アクセスログ・Referer・履歴に残る）。
 */
export const SESSION_HEADER = "x-unj-session";

/**
 * 専ブラ（app/test/bbs.cgi）がIPから導くサーバー内部専用トークンの接頭辞。
 * `bbscgi:<IP>` は誰でも組み立てられる値なので、クライアントから届いたセッションIDとしては
 * 絶対に受け付けない（受け付けると、相手のIPを知っているだけでその専ブラ利用者に
 * なりすませる）。bbs.cgi 自身は db.getOrCreateAnonymousUser を直に呼ぶので影響しない。
 */
export const INTERNAL_TOKEN_PREFIX = "bbscgi:";

/** auth_tokens.token として受け付ける長さの上限。UUID（36文字）や unj 側の署名トークンより十分長い */
const MAX_SESSION_ID_LENGTH = 256;

/**
 * クライアントが名乗ってよいセッションIDか。
 * 形式は UUID に限定しない：auth_tokens は unj と共有しており、昔の reze が作った
 * UUID 以外の既存IDもありうるので、締め出さないよう「内部専用の接頭辞」と長さ・制御文字だけを弾く。
 * ただし unj の署名トークン（kind='unj'、`署名.userId.上限` 形式）はここを通っても
 * DB の照会（db.getAnonymousUserBySession）が受け付けない。unj は利用者ごとに直近4件しか
 * 有効にしていないので、reze が古いものまで通すと unj の無効化を reze 経由で迂回できてしまう。
 * 新しく作る（ユーザーを増やす）のは UUID 形式だけ（getOrCreateSessionUserById）。
 */
export function isClientSessionId(value: unknown): value is string {
	if (typeof value !== "string") return false;
	if (value.length === 0 || value.length > MAX_SESSION_ID_LENGTH) return false;
	if (value.startsWith(INTERNAL_TOKEN_PREFIX)) return false;
	if (/[\u0000-\u001f\u007f]/.test(value)) return false;
	return true;
}

/**
 * 新規作成を許すセッションIDの形（UUID）。lib/session.ts の ensureSessionId は
 * crypto.randomUUID か、それが無い環境では同じ形の乱数を作るので、正規のクライアントは必ずこの形。
 * 任意の文字列でユーザーを作らせると、共有の users / auth_tokens を好きな値で埋められる。
 */
const UUID_SESSION_ID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidSessionId(value: unknown): value is string {
	return typeof value === "string" && UUID_SESSION_ID_RE.test(value);
}

/** 利用者に見せてよいエラー（呼び出し側が `{ error: message }` と status の JSON にする）。 */
export type ExposedError = Error & { expose: true; status: number };

export function exposedError(message: string, status: number): ExposedError {
	return Object.assign(new Error(message), { expose: true as const, status });
}

export function isExposedError(err: unknown): err is ExposedError {
	const e = err as { expose?: unknown; status?: unknown } | null;
	return (
		err instanceof Error &&
		e?.expose === true &&
		typeof e.status === "number" &&
		Number.isInteger(e.status) &&
		e.status >= 400 &&
		e.status <= 599
	);
}

/**
 * 同じオリジンのページからのリクエストか（ログイン CSRF・セッション固定の対策）。
 *  - `Sec-Fetch-Site` があれば same-origin か none（アドレスバー直打ち等）だけを通す
 *  - `Origin` があればそのホストがリクエストの Host と一致するものだけを通す
 * どちらのヘッダも無い古いクライアント（専ブラ・curl など）は通す。これらはブラウザに
 * 他サイトから送らせる経路ではないので、CSRF の対象にならない。
 */
export function isSameOriginRequest(request: NextRequest): boolean {
	const site = request.headers.get("sec-fetch-site");
	if (site && site !== "same-origin" && site !== "none") return false;
	const origin = request.headers.get("origin");
	if (origin) {
		const host = request.headers.get("host") ?? request.nextUrl.host;
		let originHost: string;
		try {
			// "null"（サンドボックス iframe・リダイレクト後など）は URL として読めないので拒否
			originHost = new URL(origin).host;
		} catch {
			return false;
		}
		if (originHost.toLowerCase() !== host.toLowerCase()) return false;
	}
	return true;
}

/** Cookie → ヘッダー → 本文 の順で、クライアントが名乗ったセッションIDを取り出す */
function clientSessionId(
	request: NextRequest,
	bodySessionId?: unknown,
): string | undefined {
	const candidates: unknown[] = [
		request.cookies.get(SESSION_COOKIE)?.value,
		request.headers.get(SESSION_HEADER),
		bodySessionId,
	];
	for (const c of candidates) {
		if (isClientSessionId(c)) return c;
	}
	return undefined;
}

/**
 * 書き込み系APIの本人確認。
 *
 * このアプリはログイン不要なので、セッションID（Cookie、無ければヘッダー／リクエストボディ）が
 * 唯一の秘密情報になる。**誰を更新するかをリクエスト本文に書かせてはいけない**：
 * slug も displayName も公開情報なので、それを鍵にすると他人のプロフィールや設定を
 * 誰でも書き換えられてしまう（実際にそうなっていた）。
 *
 * 呼び出し側は必ず「戻り値のユーザー」だけを更新すること。
 * 未知のセッションでは null を返す（ここでアカウントを作ってはいけない。
 * 作ると「名乗れば通る」に逆戻りする）。
 */
export async function resolveSessionUser(
	request: NextRequest,
	bodySessionId?: unknown,
): Promise<AnonymousUser | null> {
	const sessionId = clientSessionId(request, bodySessionId);
	if (!sessionId) return null;
	return await db.getAnonymousUserBySession(sessionId);
}

/**
 * 読み取り系 GET の「誰として見るか」（ブロック/ミュートの適用・いいね済み表示など）。
 *
 * クエリの userId は「パーソナライズしてほしい」という合図としてだけ使い、
 * 実際の身元はセッションから取る。クエリの値をそのまま信じると、他人の id を渡すだけで
 * その人のブロック/ミュート一覧（＝フィードから消える投稿者）や投票状態が覗けてしまう。
 * セッションと食い違うときは匿名扱い（undefined）にする。
 *
 * クエリが無いときはDBを引かない：パーソナライズ不要の一覧はエッジキャッシュに載せたいので
 * （lib/edge-cache.ts）、そこで毎回 auth_tokens を引くと Neon の転送量が増える。
 */
export async function resolveViewerId(
	request: NextRequest,
	claimed: string | null | undefined,
): Promise<string | undefined> {
	if (!claimed) return undefined;
	const user = await resolveSessionUser(request);
	if (!user) return undefined;
	// pg では id と slug はどちらも String(users.id)。mock は別物なので両方と照合し、
	// 呼び出し側には名乗られた方（DataStore が期待する形）をそのまま返す。
	return claimed === user.id || claimed === user.slug ? claimed : undefined;
}

/**
 * セッションIDから匿名ユーザーを取る。無ければ作る（POST /api/auth/anonymous と
 * resolveOrCreateSessionUser の共通部分）。
 *
 * users / auth_tokens は unj と共有で、無制限に作らせると連番・ストレージ・Neon の転送量を
 * 圧迫して unj まで止まる。なので新規作成だけを絞る:
 *  1. 既にあるセッションはそのまま返す。last_used_at の更新（db.touchAnonymousSession の
 *     UPDATE 1文）は DEDUPE_LIMITER で利用者ごとに 60 秒に1回までに間引く。
 *     このエンドポイントはページを開くたびに 2〜4 回呼ばれるので、毎回更新すると
 *     1 ページで Neon の往復が倍になる。掃除の目安（月単位）には分単位の精度で足りる。
 *     古い行の掃除は last_used_at を見てオーナーが手動 SQL で行う
 *  2. 新規は UUID 形式だけ（UUID 以外の既存セッションは 1 で通るので締め出さない）
 *  3. 新規は登録枠（SIGNUP_LIMITER は /64 ごと、IPv6 はさらに SIGNUP_LIMITER_48 で /48 ごと。
 *     /48 を持つ相手は /64 を乗り換えて枠を取り直せるため。バインディングが無ければ素通し）
 * 拒否は利用者向けのエラー（exposedError: 400 / 429）を投げる。呼び出し側は
 * isExposedError で拾って `{ error }` と status の JSON にすること。
 *
 * 注意: 初回訪問ではクライアントが同じ新しい ID で 2〜4 本同時に POST してくる
 * （useCurrentUser を使う部品ごと＋ページ自身）ので、登録枠は「人数」ではなく「リクエスト数」で減る。
 * 同じ ID の2本目以降だけ枠を免除すると、同じ ID を2回送るだけで枠を素通りできてしまうので
 * 免除はしない（枠の大きさ側で吸収する。wrangler.json の SIGNUP_LIMITER）。
 */
export async function getOrCreateSessionUserById(
	sessionId: string,
	ip: string,
): Promise<AnonymousUser> {
	const env = await getRateLimitEnv();
	const existing = await db.getAnonymousUserBySession(sessionId);
	if (existing) {
		// キーはセッションID（秘密）ではなく公開の user id にする。false（この 60 秒で更新済み）なら DB に行かない。
		// null（バインディング無し）は従来どおり毎回更新する
		if ((await dedupeOnce(env, `touch:${existing.id}`)) === false) {
			return existing;
		}
		// 本人は上の照会で引けているので、last_used_at の UPDATE だけを流す（SELECT をもう1回しない）
		await db.touchAnonymousSession(sessionId);
		return existing;
	}

	if (!isUuidSessionId(sessionId)) {
		throw exposedError("セッションIDの形式が不正です", 400);
	}
	const { limited } = await checkTieredRateLimit(env, ip, "signup", "signup48");
	if (limited) {
		throw exposedError(
			"新しいセッションの作成が多すぎます。しばらくしてから再試行してください",
			429,
		);
	}
	return await db.getOrCreateAnonymousUser(sessionId, ip);
}

/**
 * 投稿・返信・作品作成などの匿名書き込み用。
 * 未知のセッションならここで匿名ユーザーを作る（getOrCreateSessionUserById の制限つき）。
 *
 * セッションIDがまったく無いときは作らずに 401 を投げる。以前は誰も知らない
 * crypto.randomUUID() でユーザーを作っていたが、その ID はクライアントに返らないので
 * 二度と使えない孤児ユーザーが書き込みのたびに増えるだけだった（正規のクライアントは
 * lib/api.ts が必ず本文かヘッダにセッションIDを載せる）。
 * 失敗はすべて exposedError（401 / 400 / 429）なので、呼び出し側は isExposedError で拾うこと。
 */
export async function resolveOrCreateSessionUser(
	request: NextRequest,
	bodySessionId?: unknown,
): Promise<AnonymousUser> {
	const sessionId = clientSessionId(request, bodySessionId);
	if (!sessionId) {
		throw exposedError(
			"セッションが見つかりません。ページを再読み込みしてください",
			401,
		);
	}
	return await getOrCreateSessionUserById(
		sessionId,
		getClientIp(request.headers),
	);
}
