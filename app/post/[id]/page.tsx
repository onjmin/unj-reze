import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { cache } from "react";
import PostPageClient from "@/components/PostPageClient";
import { db } from "@/lib/db";
import { getDisplayContent, stripAnkaPrefixForSnsDisplay } from "@/lib/mml";
import { db as mockDb } from "@/lib/mock-db";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { decodeId, encodeId, encodePost } from "@/lib/sqids";

const DEFAULT_USER_ID = "名無しvFZ";

// generateMetadata が固まる/落ちてもナビゲーション全体を巻き添えにしないための上限。
// 通常は数十msで終わる想定なので、これを超えたら汎用metadataにフォールバックする。
// （本文の描画自体はこの待ちに依存しない。下の PostPage 本体を参照）
const METADATA_TIMEOUT_MS = 800;

// generateMetadata専用の軽量フェッチ。OGP用のテキスト/画像URLしか使わないので
// attachEmbedInfo（埋め込み解決）は呼ばない。同一リクエスト内でのみメモ化。
const getMetadataPost = cache(async (decodedId: number) => {
	return db.getPost(decodedId, DEFAULT_USER_ID);
});

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
	return Promise.race([
		promise,
		new Promise<null>((resolve) => {
			setTimeout(() => resolve(null), ms);
		}),
	]);
}

export function generateStaticParams() {
	if (process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true") return [];
	const params = mockDb.getPosts().map((post) => ({ id: encodePost(post).id }));
	return params.length > 0 ? params : [{ id: encodeId(1) }];
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ id: string }>;
}): Promise<Metadata> {
	const { id } = await params;
	const decodedId = decodeId(id);
	if (decodedId === null) return {};
	const url = `${SITE_URL}/post/${id}`;

	// Next.js はクライアント側遷移（router.push/prefetch）のRSCフェッチにも
	// generateMetadata を毎回実行する。このリクエストには "RSC" ヘッダーが付くので、
	// ここで判定してDBを叩かずに返す。一覧から来た人は既にキャッシュ/クライアント
	// フェッチで正しい情報を持っている（PostPageClient側）ので、ソフトナビゲーション
	// でのmetadataは使われない。実際にDBを叩く必要があるのは直リンク・リロード・
	// クローラー（OGP展開bot等）による「フルページ読み込み」のときだけ。
	const isSoftNavigation = (await headers()).has("rsc");
	if (isSoftNavigation) {
		return { alternates: { canonical: url } };
	}

	const post = await withTimeout(
		getMetadataPost(decodedId).catch(() => null),
		METADATA_TIMEOUT_MS,
	);
	if (!post) {
		// DB未応答・タイムアウト・該当なし。ナビゲーションをこれ以上待たせず、
		// 汎用metadataだけ返す（本文はクライアント側で別途取得される）。
		return {
			title: "投稿",
			alternates: { canonical: url },
		};
	}

	const title =
		post.hasGame && post.gameTitle
			? post.gameTitle
			: `${post.displayName}の投稿`;
	const description =
		stripAnkaPrefixForSnsDisplay(getDisplayContent(post.content)).slice(
			0,
			100,
		) || `${post.displayName}による投稿です。`;
	const image = post.hasGame
		? post.gameThumbnail
		: post.hasImage
			? post.imageSrc
			: undefined;

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

export default async function PostPage({
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

	// ここでは投稿データを待たない。一覧から遷移していればキャッシュから即描画され、
	// そうでなければ PostPageClient がクライアント側で取得する。
	// これにより /post/[id] への遷移（RSCペイロード取得）自体がDBに依存しなくなる。
	return <PostPageClient id={id} />;
}
