"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import GameLandingView from "@/components/GameLandingView";
import { api } from "@/lib/api";
import { cacheGame, readCachedGame } from "@/lib/game-cache";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import type { GameRankingEntry } from "@/lib/types";
import type { OriginType } from "@/lib/types";

interface GamePageClientProps {
	id: string;
}

/**
 * /game/[id] の本体描画。page.tsx はサーバー側でDBを待たない
 * （generateMetadata 以外は id の妥当性チェックのみ）ので、ゲームデータの
 * 取得と表示はすべてここ＝クライアント側で行う。post/[id] の
 * PostPageClient と同じ狙い・同じ作り。
 *
 * 1. まず sessionStorage のキャッシュ（ランキング等から遷移した場合に
 *    game-cache.ts が置いたもの）があれば即描画する。
 * 2. 裏で最新データ（+ originType）を fetch し、成功したら差し替える。
 * 3. fetch が失敗しても、キャッシュ表示があればそのまま維持する
 *    ＝サーバー障害時でも直前まで一覧で見えていた内容は壊さない。
 */
export default function GamePageClient({ id }: GamePageClientProps) {
	const [game, setGame] = useState<
		(GameRankingEntry & { originType?: OriginType }) | null
	>(null);
	const [notFound, setNotFound] = useState(false);

	useEffect(() => {
		let cancelled = false;
		const cached = readCachedGame(id);
		if (cached) Promise.resolve().then(() => !cancelled && setGame(cached));

		api.games
			.get(id)
			.then((fresh) => {
				if (cancelled) return;
				cacheGame(fresh);
				setGame(fresh);
			})
			.catch(() => {
				if (cancelled) return;
				// キャッシュが無ければ本当に見られない＝見つからない扱いにする。
				// キャッシュがあれば何もせず、直前のスナップショット表示のまま留める。
				if (!cached) setNotFound(true);
			});

		return () => {
			cancelled = true;
		};
	}, [id]);

	useEffect(() => {
		if (!game) return;
		// ソフトナビゲーション時は generateMetadata がDBを叩かない（page.tsx参照）ので
		// <title> はここで直す。
		document.title = `${game.title || "ゲーム"} | ${SITE_NAME}`;
	}, [game]);

	useEffect(() => {
		if (!game) return;
		// JSON-LD はサーバー側の待ちを増やさないよう、データが揃った時点で
		// クライアントから注入する（構造化データはあくまで付加情報のため）。
		const script = document.createElement("script");
		script.type = "application/ld+json";
		script.text = JSON.stringify({
			"@context": "https://schema.org",
			"@type": "VideoGame",
			name: game.title,
			url: `${SITE_URL}/game/${id}`,
			datePublished: game.createdAt,
			gamePlatform: "Web browser",
			applicationCategory: "Game",
			...(game.creatorSlug
				? { author: { "@type": "Person", name: game.creatorSlug } }
				: {}),
		});
		document.head.appendChild(script);
		return () => {
			document.head.removeChild(script);
		};
	}, [game, id]);

	if (notFound) {
		return (
			<div className="bg-[#0b0e14] text-gray-100 min-h-dvh flex flex-col items-center justify-center space-y-3">
				<p className="text-gray-500 text-sm">ゲームが見つかりません</p>
				<Link href="/" className="text-blue-400 text-xs hover:underline">
					戻る
				</Link>
			</div>
		);
	}

	if (!game) {
		return (
			<div className="bg-[#0b0e14] text-gray-100 min-h-dvh w-full flex flex-col items-center justify-center">
				<style>{`@keyframes game-page-spin{to{transform:rotate(360deg)}}`}</style>
				<div
					className="w-6 h-6 rounded-full border-2 border-gray-700"
					style={{
						borderTopColor: "transparent",
						animation: "game-page-spin .6s linear infinite",
					}}
				/>
			</div>
		);
	}

	return (
		<div className="bg-[#0b0e14] text-gray-100 min-h-dvh w-full flex flex-col">
			<GameLandingView
				gameId={game.id}
				title={game.title}
				manifestUrl={game.manifestUrl}
				preset={game.preset}
				creatorSlug={game.creatorSlug}
				plays={game.plays ?? 0}
				clears={game.clears ?? 0}
				bestScore={game.bestScore ?? 0}
				bestScoreBy={game.bestScoreBy}
				postId={game.postId}
				originType={game.originType}
			/>
		</div>
	);
}
