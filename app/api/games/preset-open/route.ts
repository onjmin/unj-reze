import { NextRequest, NextResponse } from "next/server";
import type { EngineKind, PresetId } from "@/components/game/presets/shared";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/ip";
import { kvExists, kvSetEx } from "@/lib/kv";

/**
 * ゲームエディタのギャラリーで見本プリセット／まっさらテンプレートが開かれた回数を数える
 * （preset_opens 表、日別）。どの見本が使われているかを見て、残す・直す・消すを決めるための集計。
 *
 * 数えるのはおまけなので、何があってもエディタ側を止めない:
 *  - 数えた・間引いた・DB が失敗した（移行SQL未適用で表が無い等）のどれでも 204。500 は返さない。
 *  - 書き込みなので withEdgeCache は通さない（あれは読み取り GET 専用）。
 * レート制限は middleware.ts の書き込み共通のものに任せ、ここでは同じIPからの
 * 開き直しだけを間引く（/api/games/[id]/play と同じ方式）。IP は KV の間引きキーにしか使わず、
 * DB には一切残さない。
 */

/** 同じIPが同じ見本を開き直しても数えない猶予（秒） */
const PRESET_OPEN_DEDUPE_SEC = 600;

// 受け付けるキーの一覧。Record にしているのは、PresetId / EngineKind に値を足したり消したり
// したとき、ここを直し忘れると型エラーで気付けるようにするため（足りないキーも余計なキーも落ちる）。
// mmo3d はギャラリーから外したが JSON 取り込み用に PRESETS に残っているので、見本側には並べておく。
const SAMPLE_PRESETS: Record<Exclude<PresetId, "blank">, true> = {
	onjReze: true,
	snowForest: true,
	touhou: true,
	fusatsu: true,
	yume: true,
	mmo3d: true,
};
// まっさらテンプレートがあるエンジン（mmo3d はテンプレートを出さない）
const TEMPLATE_ENGINES: Record<Exclude<EngineKind, "mmo3d">, true> = {
	action: true,
	rpg: true,
	onjReze: true,
	touhou: true,
	yume25d: true,
};

/** 見本プリセットID・'blank'・`template:${エンジン}` */
const KNOWN_KEYS = new Set<string>([
	...Object.keys(SAMPLE_PRESETS),
	"blank",
	...Object.keys(TEMPLATE_ENGINES).map((engine) => `template:${engine}`),
]);

/** 移行SQL未適用の警告はアイソレートごとに1回だけ出す（開かれるたびにログを汚さない） */
let warnedMissingTable = false;

export async function POST(request: NextRequest) {
	let preset: unknown;
	try {
		const body = await request.json();
		if (body && typeof body === "object")
			preset = (body as { preset?: unknown }).preset;
	} catch {
		// 空ボディ・壊れた JSON は下の検証で弾く
	}
	if (typeof preset !== "string" || !KNOWN_KEYS.has(preset)) {
		return NextResponse.json({ error: "unknown preset" }, { status: 400 });
	}

	const dedupeKey = `presetopen:${preset}:${getClientIp(request.headers)}`;
	try {
		if (await kvExists(dedupeKey))
			return new NextResponse(null, { status: 204 });
		await kvSetEx(dedupeKey, "1", PRESET_OPEN_DEDUPE_SEC);
	} catch {
		// KV が落ちていても数えること自体は続ける
	}

	try {
		await db.recordPresetOpen(preset);
	} catch (err) {
		// Postgres の 42P01 = undefined_table（README の移行SQLがまだ当たっていない）
		if ((err as { code?: unknown } | null)?.code === "42P01") {
			if (!warnedMissingTable) {
				warnedMissingTable = true;
				console.warn(
					"[preset-open] preset_opens 表がありません。README の移行SQLを当ててください",
				);
			}
		} else {
			console.warn("[preset-open] 記録に失敗", err);
		}
	}
	return new NextResponse(null, { status: 204 });
}
