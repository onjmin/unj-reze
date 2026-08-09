import type { NextRequest } from "next/server";
import { parseSjisFormBody, sjisTextResponse } from "@/lib/bbs/sjis";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/ip";
import { CH_FEED, chThread } from "@/lib/realtime/channels";
import { publishRealtime } from "@/lib/realtime/publish";
import { encodePost } from "@/lib/sqids";

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
//   key     レス投稿時のみ、スレ番号(=dat/subject.txtで使っているDBの生ID)
//
// 不正対策: fingerprint/Turnstile は専ブラからは送れないため使わない。
// IPレート制限は middleware.ts の matcher が全パスに掛かっているのでここでも効く。

function errorPage(message: string): Response {
	return sjisTextResponse(
		`<html><head><title>ＥＲＲＯＲ！</title></head><body>ERROR:<br>\n${message}<br>\n<a href="javascript:history.back();">戻る</a></body></html>\n`,
		{ contentType: "text/html", status: 400 },
	);
}

function okPage(message: string): Response {
	return sjisTextResponse(
		`<html><head><title>書きこみました。</title></head><body>${message}</body></html>\n`,
		{ contentType: "text/html" },
	);
}

export async function POST(request: NextRequest) {
	let fields: Record<string, string>;
	try {
		const bytes = new Uint8Array(await request.arrayBuffer());
		fields = parseSjisFormBody(bytes);
	} catch (e) {
		console.error("[POST /test/bbs.cgi] parse", e);
		return errorPage("フォームの解析に失敗しました。");
	}

	const message = (fields.MESSAGE || "").trim();
	const subject = (fields.subject || "").trim();
	const key = (fields.key || "").trim();

	if (!message) {
		return errorPage("本文が空です。");
	}

	// 専ブラはセッションCookieを持たない。IPから決定的に導いたトークンで
	// createPost/addReply が要求する「解決済みの投稿者(slug)」を用意する
	// (lib/db/pg.ts の createPost 参照)。同じIPからは同じアカウントを使い回す。
	//
	// displayName はアカウント側の値を採用する(FROM欄の自己申告では上書きしない)。
	// これは /api/posts と同じ方針: 名前をリクエスト本文に委ねると他人のなりすましが
	// 成立してしまうため(lib/auth/session-server.ts のコメント参照)。
	const ip = getClientIp(request.headers);
	const anonUser = await db.getOrCreateAnonymousUser(`bbscgi:${ip}`, ip);
	const displayName = anonUser.displayName;
	const authorSlug = anonUser.slug;

	try {
		if (!key) {
			// 新規スレッド。TITLE=content 1行目という自前の規約(lib/bbs/format.ts)に
			// 合わせるため、subject を本文の先頭行として埋め込む。
			const content = subject ? `${subject}\n${message}` : message;
			const post = await db.createPost({ displayName, content, slug: authorSlug });
			const encoded = encodePost(post);
			publishRealtime({
				channel: CH_FEED,
				event: "post.created",
				data: encoded,
			});
			return okPage("新しいスレッドを立てました。");
		}

		const threadId = Number(key);
		if (!Number.isFinite(threadId) || threadId <= 0) {
			return errorPage("不正なスレッド番号です。");
		}

		const reply = await db.addReply(threadId, {
			displayName,
			slug: authorSlug,
			content: message,
		});
		if (!reply) {
			return errorPage("スレッドが見つかりません。");
		}
		const encoded = encodePost(reply);
		publishRealtime([
			{
				channel: chThread(String(threadId)),
				event: "reply.created",
				data: encoded,
			},
			{ channel: CH_FEED, event: "reply.created", data: encoded },
		]);
		return okPage("書きこみました。");
	} catch (e) {
		console.error("[POST /test/bbs.cgi]", e);
		return errorPage("サーバーエラーが発生しました。");
	}
}
