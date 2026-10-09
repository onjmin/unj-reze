import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { rejectDmReason } from "@/lib/social/dm-rules";
import { chUser } from "@/lib/realtime/channels";
import { publishRealtime } from "@/lib/realtime/publish";

export async function GET(request: NextRequest) {
	// 誰のDMを読むかは必ずセッションから決める。以前は ?userId= をそのまま信じていたので、
	// 公開情報である他人の id を渡すだけでその人のDMを全部読めた。
	// GET は本文が無いので Cookie か x-unj-session ヘッダー（lib/api.ts の fetcher）で届く。
	const user = await resolveSessionUser(request);
	if (!user?.slug) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}
	const me = user.slug;
	const partner = new URL(request.url).searchParams.get("partner") || undefined;

	// 1対1スレッド表示。受信箱(全件)ではなくこの相手との往復だけを返す。
	if (partner) {
		// int4 を超える id は DB に渡すと 22003 の 500 になる。そんな相手との往復は無い
		if (exceedsInt4(partner)) {
			return privateJson({ messages: [], gate: { sent: 0, received: 0 } });
		}
		const [messages, gate] = await Promise.all([
			db.getConversation(me, partner, 100),
			db.getDmGate(me, partner),
		]);
		return privateJson({ messages, gate });
	}

	const messages = await db.getMessages(me);
	return privateJson(messages);
}

/** 個人宛てのデータは共有キャッシュに載せない */
function privateJson(data: unknown) {
	const res = NextResponse.json(data);
	res.headers.set("Cache-Control", "private, no-store");
	return res;
}

/** DM 本文の上限（文字数）。巨大な DM を溜めて GET を繰り返すと共有 Neon の転送量を焼ける */
const MAX_DM_LENGTH = 5000;

/** pg の users.id の正規の10進表記。"05" や "5.0" のような別表記で自分宛ての判定をすり抜けさせない */
const USER_ID_RE = /^[1-9]\d{0,15}$/;

/**
 * users.id・messages.id は SERIAL（int4）。これを超える数を渡すと Postgres が
 * 22003（integer の範囲外）で落ちて 500 になるので、DB に渡す前に「無い」扱いにする。
 */
const MAX_INT4 = 2147483647;

/** 数として読むと int4 を超えるか（"99999999999" や "1e10" も。pg の toUid は Number() で読む） */
function exceedsInt4(value: string | number): boolean {
	const n = Number(value);
	return Number.isInteger(n) && n > MAX_INT4;
}

/**
 * 宛先キーとして受け付ける形か。pg では送信者・宛先とも users.id（正の整数）なので数字だけ。
 * mock（lib/db/mock-db.ts）の slug は英数字なので、送信者のキーが整数でないときだけ英数字も通す。
 */
function isRecipientKey(recipient: string, sender: string): boolean {
	if (USER_ID_RE.test(sender)) return USER_ID_RE.test(recipient);
	return /^[\w-]{1,64}$/.test(recipient);
}

/**
 * 利用者に見せてよいエラー（`expose: true` と `status` を持つ Error。db 側の入力検査など）は
 * その文言と status の JSON にする。それ以外は投げ直す（従来どおり 500）。
 */
function exposedErrorResponse(e: unknown): NextResponse {
	const err = e as {
		expose?: unknown;
		status?: unknown;
		message?: unknown;
	} | null;
	if (
		err &&
		err.expose === true &&
		typeof err.status === "number" &&
		Number.isInteger(err.status) &&
		err.status >= 400 &&
		err.status <= 599
	) {
		return NextResponse.json(
			{ error: String(err.message ?? "error") },
			{ status: err.status },
		);
	}
	throw e;
}

export async function POST(request: NextRequest) {
	const body = await request.json();
	const { text, recipient, sessionId } = body;

	// 送信者は必ずセッション本人。body の sender を信じると、
	// 表示名も slug も公開情報なので他人になりすましてDMを送れてしまう。
	const user = await resolveSessionUser(request, sessionId);
	if (!user) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}
	// displayName は改名で変わるので送信者キーには使わない（votes と同じ理由）。
	const sender = user.slug;

	if (
		typeof text !== "string" ||
		!text.trim() ||
		typeof recipient !== "string" ||
		!recipient
	) {
		return NextResponse.json(
			{ error: "recipient and text are required" },
			{ status: 400 },
		);
	}
	if (text.length > MAX_DM_LENGTH) {
		return NextResponse.json(
			{ error: `メッセージは${MAX_DM_LENGTH}文字までです` },
			{ status: 400 },
		);
	}
	if (!isRecipientKey(recipient, sender)) {
		return NextResponse.json({ error: "invalid recipient" }, { status: 400 });
	}
	if (exceedsInt4(recipient)) {
		return NextResponse.json(
			{ error: "宛先が見つかりません" },
			{ status: 404 },
		);
	}
	// 自分宛ては初回DM制限（getDmGate）が sent=received になって外れるので受け付けない
	if (recipient === sender) {
		return NextResponse.json(
			{ error: "自分にはDMを送れません" },
			{ status: 400 },
		);
	}

	// 宛先は reze の利用者（display_name を持つ users 行）だけ。unj だけの利用者・システム用の
	// id・存在しない id は undefined（lib/db の getUserDisplayName）。未知の id をそのまま
	// INSERT すると FK 違反で 500 になり、unj 利用者の id 宛てにも DM が溜められてしまう。
	// ブロックはどちら向きでも拒否する（ブロックした相手から DM が届き続けないように）。
	const [recipientName, recipientBlocks, senderBlocks] = await Promise.all([
		db.getUserDisplayName(recipient),
		db.getBlockedSlugs(recipient),
		db.getBlockedSlugs(sender),
	]);
	if (recipientName === undefined) {
		return NextResponse.json(
			{ error: "宛先が見つかりません" },
			{ status: 404 },
		);
	}
	if (recipientBlocks.includes(sender) || senderBlocks.includes(recipient)) {
		return NextResponse.json(
			{ error: "この相手にはDMを送れません" },
			{ status: 403 },
		);
	}

	// 初回DM制限はクライアント表示だけでは意味がない（DMスパムの導線そのもの）ので
	// ここで必ず判定する。判定ロジックは lib/social/dm-rules.ts でクライアントと共有している。
	const gate = await db.getDmGate(sender, recipient);
	const rejection = rejectDmReason(gate, text);
	if (rejection) {
		return NextResponse.json({ error: rejection }, { status: 403 });
	}

	let message: Awaited<ReturnType<typeof db.addMessage>>;
	try {
		message = await db.addMessage({ sender, text, recipient });
	} catch (e) {
		return exposedErrorResponse(e);
	}

	// Koyeb Realtime WS ハブ経由で送信先および送信元に即時プッシュ配信。
	// ハブの `user:*` は users.id 名義の署名トークンでしか購読できない
	// （app/api/realtime/token/route.ts）ので、チャンネル名は必ず解決済みの users.id で作る。
	// 送信者は user.id、受信者は DB が解決して返した message.recipient（pg では
	// String(recipient_user_id)）。body の recipient 文字列をそのまま使うと、表示名などで
	// 送られたときに誰も購読していないチャンネルへ投げることになり、誰にも届かない。
	const targetChannels = new Set<string>();
	targetChannels.add(chUser(String(user.id)));
	if (message.recipient && /^\d+$/.test(message.recipient))
		targetChannels.add(chUser(message.recipient));

	publishRealtime(
		Array.from(targetChannels).map((channel) => ({
			channel,
			event: "message.created",
			data: message,
		})),
	);

	return NextResponse.json(message, { status: 201 });
}

export async function DELETE(request: NextRequest) {
	const { id, sessionId } = await request.json();
	const user = await resolveSessionUser(request, sessionId);
	if (!user) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}
	if (id == null) {
		return NextResponse.json({ error: "id is required" }, { status: 400 });
	}
	// NaN や int4 を超える id をそのまま渡すと integer 列で 22P02/22003 の 500 になる
	const messageId = Number(id);
	if (
		(typeof id !== "number" && typeof id !== "string") ||
		!Number.isInteger(messageId) ||
		messageId <= 0 ||
		exceedsInt4(messageId)
	) {
		return NextResponse.json(
			{ error: "Message not found or not owned" },
			{ status: 404 },
		);
	}
	const ok = await db.deleteMessage(messageId, user.slug);
	if (!ok)
		return NextResponse.json(
			{ error: "Message not found or not owned" },
			{ status: 404 },
		);
	return NextResponse.json({ success: true });
}
