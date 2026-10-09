import type { NextRequest } from "next/server";
import { parseSjisFormBody, sjisTextResponse } from "@/lib/bbs/sjis";
import { db } from "@/lib/db";
import { getClientIp, rateLimitKeyFromIp } from "@/lib/ip";
import {
	checkTieredRateLimit,
	getRateLimitEnv,
} from "@/lib/security/rate-limit";
import { CH_FEED, chThread } from "@/lib/realtime/channels";
import { publishRealtime } from "@/lib/realtime/publish";
import { encodePost } from "@/lib/sqids";
import {
	contentError,
	readExposedError,
	sanitizeContentText,
	unjTextRuleError,
} from "../../api/_lib/post-input";

/**
 * 専ブラ利用者のセッショントークンの接頭辞（lib/auth/session-server.ts INTERNAL_TOKEN_PREFIX と同じ値）。
 * 既存の auth_tokens 行と一致させる必要があるので変えないこと。
 */
const BBSCGI_TOKEN_PREFIX = "bbscgi:";

/** フォーム本体の上限（バイト）。本文の上限（app/api/_lib/post-input.ts）を Shift_JIS で見積もって余裕を持たせた値 */
const MAX_FORM_BYTES = 64 * 1024;

// 専ブラ対応: POST /test/bbs.cgi
// 仕様(公式には詳細記載なし): https://scrapbox.io/2chtypebbs/bbs.cgi
// 古典的な2ch bbs.cgi の慣習(フィールド名・成功/エラーページの体裁)に合わせている。
// body は application/x-www-form-urlencoded だが値は Shift_JIS バイト列。
//
// 想定フィールド:
//   FROM    投稿者名
//   mail    メール欄(sage等。今回は無視して良い)
//   MESSAGE 本文
//   subject 新規スレ立て時のみ、スレタイ
//   key     レス投稿時のみ、スレ番号(=dat/subject.txtのファイル名=DbPost.datKey。
//           DBの連番id(threadId*2等)ではない点に注意)
//
// 不正対策: fingerprint/Turnstile は専ブラからは送れないため使わない。
// IPレート制限は middleware.ts の matcher が全パスに掛かっているのでここでも効く。
// ほかに、ブラウザ経由のクロスサイト送信（isCrossSiteRequest）と Tor（cf-ipcountry: T1）を拒否し、
// 新しい投稿者（users 行）の作成は登録枠（resolveBbsCgiUser）で絞る。

/** エラーページに埋める文言のエスケープ（db の expose 付きエラーの文言もそのまま載せるため） */
function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function errorPage(message: string, status = 400): Response {
	return sjisTextResponse(
		`<html><head><title>ＥＲＲＯＲ！</title></head><body>ERROR:<br>\n${escapeHtml(message)}<br>\n<a href="javascript:history.back();">戻る</a></body></html>\n`,
		{ contentType: "text/html", status },
	);
}

function okPage(message: string): Response {
	return sjisTextResponse(
		`<html><head><title>書きこみました。</title></head><body>${message}</body></html>\n`,
		{ contentType: "text/html" },
	);
}

/**
 * ブラウザから他サイト経由で送られた書き込みか（R22）。
 *
 * このエンドポイントは IP だけで本人を決めるので、他サイトに自動送信フォームを置かれると、
 * 閲覧者の IP 名義で書き込みをさせられる（CSRF）。専ブラは Sec-Fetch-Site も Origin も
 * 送らない一方、ブラウザはクロスオリジンのフォーム POST に必ず Origin を付け、最近の
 * ブラウザは Sec-Fetch-Site も付けるので、どちらかが「よそから」を示していれば拒否する。
 */
function isCrossSiteRequest(request: NextRequest): boolean {
	const fetchSite = request.headers.get("sec-fetch-site");
	if (fetchSite === "cross-site" || fetchSite === "same-site") return true;
	const origin = request.headers.get("origin");
	if (origin === null) return false;
	const host = (
		request.headers.get("host") ?? new URL(request.url).host
	).toLowerCase();
	try {
		return new URL(origin).host.toLowerCase() !== host;
	} catch {
		// `Origin: null`（サンドボックス iframe・data: URL など）もよそから扱い
		return true;
	}
}

/**
 * 専ブラはセッションCookieを持たない。IPから決定的に導いたトークンで
 * createPost/addReply が要求する「解決済みの投稿者(slug)」を用意する
 * (lib/db/pg.ts の createPost 参照)。同じIPからは同じアカウントを使い回す。
 *
 * 既存の利用者は従来どおり `bbscgi:<IPアドレス>` で引く（IPv6 の人もアドレス単位の行が
 * すでにあるので、キーを変えると別人になってしまう）。新しく作るときだけ
 * `bbscgi:<rateLimitKeyFromIp>` にする：IPv4 はアドレスそのままで従来と同じ、IPv6 は /64 に
 * 丸める。IPv6 は利用者1人に /64 が丸ごと割り当てられるのが普通で、アドレス単位だと
 * 末尾を変えるだけで共有の users 行を無限に作れた（R7/R20）。
 *
 * 見つかったときも getOrCreateAnonymousUser を通すのは、auth_tokens.last_used_at を
 * 更新するため（同じトークンなので新しいユーザーは作られない）。古い行の掃除は
 * last_used_at を見てオーナーが手動で行うので、照会だけで返すと書き込み中の専ブラ利用者が
 * 使われていないように見える（lib/auth/session-server.ts getOrCreateSessionUserById と同じ）。
 *
 * 新規作成は Web の匿名ユーザー作成（lib/auth/session-server.ts getOrCreateSessionUserById）と
 * 同じ登録枠を通す。/64 ごとに別人になるので、/48 を持つ相手は /64 を乗り換えるたびに users と
 * auth_tokens の行を足せた。/64（IPv4 はアドレス）ごとの SIGNUP_LIMITER に加え、IPv6 は /48 ごとの
 * SIGNUP_LIMITER_48 でも数える（バインディングが無ければ素通し）。
 *
 * `bbscgi:` は誰でも組み立てられるので、Web側（Cookie / 本文の sessionId）から
 * 名乗られた場合は lib/auth/session-server.ts の isClientSessionId が必ず弾く。
 * このトークンで引けるのはこの bbs.cgi だけ、という前提を崩さないこと。
 */
async function resolveBbsCgiUser(ip: string) {
	const tokens = [
		...new Set([
			`${BBSCGI_TOKEN_PREFIX}${ip}`,
			`${BBSCGI_TOKEN_PREFIX}${rateLimitKeyFromIp(ip)}`,
		]),
	];
	for (const token of tokens) {
		if (await db.getAnonymousUserBySession(token)) {
			return await db.getOrCreateAnonymousUser(token, ip);
		}
	}
	const { limited } = await checkTieredRateLimit(
		await getRateLimitEnv(),
		ip,
		"signup",
		"signup48",
	);
	if (limited) {
		// catch 節で errorPage にする（readExposedError が拾う形）
		throw Object.assign(
			new Error(
				"新規の書き込みが多すぎます。しばらくしてから再試行してください。",
			),
			{ expose: true as const, status: 429 },
		);
	}
	return await db.getOrCreateAnonymousUser(tokens[tokens.length - 1], ip);
}

/**
 * フォーム本体を MAX_FORM_BYTES まで読む。超えたら null。
 * request.arrayBuffer() は全部をメモリに載せてから長さが分かるので、Content-Length の無い
 * chunked 送信だと上限の何倍でも isolate に溜め込めた。宣言が大きければ読まずに、
 * 読みながら超えたらその時点で打ち切る。
 */
async function readFormBytes(request: NextRequest): Promise<Uint8Array | null> {
	const declared = Number(request.headers.get("content-length") ?? "0");
	if (Number.isFinite(declared) && declared > MAX_FORM_BYTES) return null;
	if (!request.body) return new Uint8Array(0);
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_FORM_BYTES) {
			await reader.cancel().catch(() => {});
			return null;
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

export async function POST(request: NextRequest) {
	if (isCrossSiteRequest(request)) {
		return errorPage("このページからは書き込めません。", 403);
	}
	// Tor（Cloudflare の国コード T1）からは書かせない。ここで書いたスレ・レスは unj の板にも
	// 出るので unj の Tor 拒否と揃える（Web 側は lib/security/post-guard.ts torBlockedResponse）
	if (request.headers.get("cf-ipcountry")?.toUpperCase() === "T1") {
		return errorPage("Tor からの書き込みはできません。", 403);
	}

	let fields: Record<string, string>;
	try {
		const bytes = await readFormBytes(request);
		if (!bytes) {
			return errorPage("本文が長すぎます。");
		}
		fields = parseSjisFormBody(bytes);
	} catch (e) {
		console.error("[POST /test/bbs.cgi] parse", e);
		return errorPage("フォームの解析に失敗しました。");
	}

	// 不可視・bidi・制御文字は保存前に除去してから trim する（Web の投稿と同じ。
	// app/api/_lib/post-input.ts sanitizeContentText）。検証・保存はこの値で行う
	const message = sanitizeContentText(fields.MESSAGE || "").trim();
	const subject = sanitizeContentText(fields.subject || "").trim();
	const key = (fields.key || "").trim();

	if (!message) {
		return errorPage("本文が空です。");
	}
	// スレタイは本文の1行目として入るので、本文の規則も合算で見る
	const content = subject ? `${subject}\n${message}` : message;
	// unj の URL 規則（8本まで・ブラックリスト）は理由をそのまま見せる。MML 行も含めた
	// 本文全体に掛ける（`#mml` 行に URL を隠してすり抜けさせない。post-input.ts unjTextRuleError）
	const ruleError = unjTextRuleError(content);
	if (ruleError) {
		return errorPage(`${ruleError}。`);
	}
	// 本文の上限は /api/posts と同じ
	if (contentError(content)) {
		return errorPage("本文が長すぎます。");
	}

	try {
		// displayName はアカウント側の値を採用する(FROM欄の自己申告では上書きしない)。
		// これは /api/posts と同じ方針: 名前をリクエスト本文に委ねると他人のなりすましが
		// 成立してしまうため(lib/auth/session-server.ts のコメント参照)。
		// 投稿者の解決（＝新規なら users 行の作成）は、書き込み先が確かめられてから行う
		// （存在しないスレ番号への送信でユーザーだけ増えないように）。
		const ip = getClientIp(request.headers);

		if (!key) {
			// 新規スレッド。TITLE=content 1行目という自前の規約(lib/bbs/format.ts)に
			// 合わせるため、subject を本文の先頭行として埋め込む。
			const anonUser = await resolveBbsCgiUser(ip);
			const post = await db.createPost({
				displayName: anonUser.displayName,
				content,
				slug: anonUser.slug,
			});
			const encoded = encodePost(post);
			// 鍵アカの投稿は配信しない（app/api/posts と同じ）
			if (!post.authorIsPrivate)
				publishRealtime({
					channel: CH_FEED,
					event: "post.created",
					data: encoded,
				});
			return okPage("新しいスレッドを立てました。");
		}

		const datKey = Number(key);
		if (!Number.isFinite(datKey) || datKey <= 0) {
			return errorPage("不正なスレッド番号です。");
		}

		// key はdatファイル名(datKey)であってDBの生idではないので、まず実IDへ解決する。
		const op = await db.getPostByDatKey(datKey);
		if (!op) {
			return errorPage("スレッドが見つかりません。");
		}

		const anonUser = await resolveBbsCgiUser(ip);
		const reply = await db.addReply(op.id, {
			displayName: anonUser.displayName,
			slug: anonUser.slug,
			content: message,
		});
		if (!reply) {
			return errorPage("スレッドが見つかりません。");
		}
		const encoded = encodePost(reply);
		// 鍵アカのレスは配信しない（app/api/posts/[id]/replies と同じ）
		if (!reply.authorIsPrivate) publishRealtime([
			{
				channel: chThread(String(op.id)),
				event: "reply.created",
				data: encoded,
			},
			{ channel: CH_FEED, event: "reply.created", data: encoded },
		]);
		return okPage("書きこみました。");
	} catch (e) {
		// スレ満杯・バルス等（db.addReply）や登録枠（resolveBbsCgiUser・db.getOrCreateAnonymousUser）は
		// expose 付きなので理由と status を見せる。それ以外は中身（Postgres のメッセージ等）を出さない
		const exposed = readExposedError(e);
		if (exposed) return errorPage(exposed.message, exposed.status);
		console.error("[POST /test/bbs.cgi]", e);
		return errorPage("サーバーエラーが発生しました。");
	}
}
