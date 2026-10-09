import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/ip";
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
 * 形式は UUID に限定しない：auth_tokens は unj と共有しており、unj 側の署名トークン
 * （kind='unj'）など別形式の既存IDもあるので、締め出さないよう「内部専用の接頭辞」と
 * 長さ・制御文字だけを弾く。
 */
export function isClientSessionId(value: unknown): value is string {
	if (typeof value !== "string") return false;
	if (value.length === 0 || value.length > MAX_SESSION_ID_LENGTH) return false;
	if (value.startsWith(INTERNAL_TOKEN_PREFIX)) return false;
	if (/[\u0000-\u001f\u007f]/.test(value)) return false;
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
 * 投稿・返信などの匿名書き込み用。
 * 未知のセッションまたは初回アクセスの場合は自動的に匿名ユーザーを作成・取得する。
 */
export async function resolveOrCreateSessionUser(
	request: NextRequest,
	bodySessionId?: unknown,
): Promise<AnonymousUser> {
	const sessionId =
		clientSessionId(request, bodySessionId) || crypto.randomUUID();
	const ip = getClientIp(request.headers);
	return await db.getOrCreateAnonymousUser(sessionId, ip);
}
