import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session-server";
import { db } from "@/lib/db";
import { rejectDmReason } from "@/lib/dm-rules";
import { chUser } from "@/lib/realtime/channels";
import { publishRealtime } from "@/lib/realtime/publish";

export async function GET(request: NextRequest) {
	const url = new URL(request.url);
	const userId = url.searchParams.get("userId") || undefined;
	const partner = url.searchParams.get("partner") || undefined;

	// 1対1スレッド表示。受信箱(全件)ではなくこの相手との往復だけを返す。
	if (userId && partner) {
		const [messages, gate] = await Promise.all([
			db.getConversation(userId, partner, 100),
			db.getDmGate(userId, partner),
		]);
		return NextResponse.json({ messages, gate });
	}

	const messages = await db.getMessages(userId);
	return NextResponse.json(messages);
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
	// ここで必ず判定する。判定ロジックは lib/dm-rules.ts でクライアントと共有している。
	const gate = await db.getDmGate(sender, recipient);
	const rejection = rejectDmReason(gate, text);
	if (rejection) {
		return NextResponse.json({ error: rejection }, { status: 403 });
	}

	const message = await db.addMessage({ sender, text, recipient });

	// Koyeb Realtime WS ハブ経由で送信先および送信元に即時プッシュ配信
	const targetChannels = new Set<string>();
	if (sender) targetChannels.add(chUser(sender));
	if (recipient) targetChannels.add(chUser(recipient));
	if (message.sender) targetChannels.add(chUser(message.sender));
	if (message.recipient) targetChannels.add(chUser(message.recipient));

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
