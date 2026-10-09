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

	if (!text || !recipient) {
		return NextResponse.json(
			{ error: "recipient and text are required" },
			{ status: 400 },
		);
	}

	// 初回DM制限はクライアント表示だけでは意味がない（DMスパムの導線そのもの）ので
	// ここで必ず判定する。判定ロジックは lib/social/dm-rules.ts でクライアントと共有している。
	const gate = await db.getDmGate(sender, recipient);
	const rejection = rejectDmReason(gate, text);
	if (rejection) {
		return NextResponse.json({ error: rejection }, { status: 403 });
	}

	const message = await db.addMessage({ sender, text, recipient });

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
	const ok = await db.deleteMessage(Number(id), user.slug);
	if (!ok)
		return NextResponse.json(
			{ error: "Message not found or not owned" },
			{ status: 404 },
		);
	return NextResponse.json({ success: true });
}
