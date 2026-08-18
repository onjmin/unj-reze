"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import GameLandingView from "@/components/GameLandingView";
import { readCachedGame } from "@/lib/game-cache";
import type { GameRankingEntry } from "@/lib/types";

export default function GameLoading() {
	const params = useParams();
	const id = params.id as string;
	const [game, setGame] = useState<GameRankingEntry | null>(null);

	useEffect(() => {
		// ランキング等でキャッシュ済みなら、サーバーの応答を待たずにそのまま描画する。
		// 消さずに残すので「戻る→また開く」でも即描画になる。
		Promise.resolve().then(() => setGame(readCachedGame(id)));
	}, [id]);

	if (!game) {
		return (
			<div className="bg-[#0b0e14] text-gray-100 min-h-dvh w-full flex flex-col items-center justify-center">
				<style>{`@keyframes gl-spin{to{transform:rotate(360deg)}}`}</style>
				<div
					className="w-6 h-6 rounded-full border-2 border-gray-700"
					style={{
						borderTopColor: "transparent",
						animation: "gl-spin .6s linear infinite",
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
			/>
		</div>
	);
}
