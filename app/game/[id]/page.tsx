import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import GamePageClient from "@/components/GamePageClient";
import { db } from "@/lib/db";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { decodeId, encodeId } from "@/lib/sqids";

// generateMetadata と本体で同じゲームを二重フェッチしないようリクエスト単位でメモ化する
const getCachedGame = cache(async (id: number) => db.getGame(id));

// generateMetadataが固まる/落ちてもナビゲーション全体を巻き添えにしないための上限。
// 本文の描画自体はこの待ちに依存しない（下の GamePage 本体を参照）。
const METADATA_TIMEOUT_MS = 800;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
	return Promise.race([
		promise,
		new Promise<null>((resolve) => {
			setTimeout(() => resolve(null), ms);
		}),
	]);
}

/** タイトル画面の背景がURLで保存されていればOGP画像に使う（内蔵アセット参照はサーバーで解決できない） */
/**
 * OGP画像。manifest がR2に出たのでサーバーでは開けない。
 * 保存時に写しておいた非正規化列 bg_ref をそのまま使う。
 */
function thumbnailOf(bgRef: string | undefined): string | undefined {
	return typeof bgRef === "string" && bgRef.startsWith("http")
		? bgRef
		: undefined;
}

export function generateStaticParams() {
	if (process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true") return [];
	return [{ id: encodeId(1) }];
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ id: string }>;
}): Promise<Metadata> {
	const { id } = await params;
	const decodedId = decodeId(id);
	if (decodedId === null) return {};
	const url = `${SITE_URL}/game/${id}`;

	const game = await withTimeout(
		getCachedGame(decodedId).catch(() => null),
		METADATA_TIMEOUT_MS,
	);
	if (!game) {
		// DB未応答・タイムアウト・該当なし。ナビゲーションをこれ以上待たせず、
		// 汎用metadataだけ返す（本文はクライアント側で別途取得される）。
		return {
			title: "ゲーム",
			alternates: { canonical: url },
		};
	}

	const title = game.title || "ゲーム";
	const plays = game.plays ?? 0;
	const description =
		plays > 0
			? `${plays}回あそばれています。登録なしでそのまま遊べます。`
			: "ブラウザでそのまま遊べます。登録は要りません。";
	const image = thumbnailOf(game.bgRef);

	return {
		title,
		description,
		alternates: { canonical: url },
		openGraph: {
			title,
			description,
			url,
			siteName: SITE_NAME,
			type: "article",
			locale: "ja_JP",
			...(image ? { images: [{ url: image }] } : {}),
		},
		twitter: {
			card: image ? "summary_large_image" : "summary",
			title,
			description,
			...(image ? { images: [image] } : {}),
		},
	};
}

export default async function GamePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const decodedId = decodeId(id);
	if (decodedId === null) {
		return (
			<div className="bg-[#0b0e14] text-gray-100 min-h-dvh flex flex-col items-center justify-center space-y-3">
				<p className="text-gray-500 text-sm">不正なIDです</p>
				<Link href="/" className="text-blue-400 text-xs hover:underline">
					戻る
				</Link>
			</div>
		);
	}

	// ここではゲームデータを待たない。ランキング等から遷移していればキャッシュから
	// 即描画され、そうでなければ GamePageClient がクライアント側で取得する。
	// これにより /game/[id] への遷移（RSCペイロード取得）自体がDBに依存しなくなる。
	return <GamePageClient id={id} />;
}
