"use client";
import { Gamepad2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { loadGame } from "@/lib/game-mv-client";
import { startRemix } from "@/lib/remix";
import { gameShareUrl } from "@/lib/share";
import { buildGameShareText } from "@/lib/share-text";
import { isCollabAllowed, type OriginType } from "@/lib/types";
import EmbedCollabBar from "./EmbedCollabBar";
import { GameManifestDraft } from "./GameMaker";
import ShareButton from "./ShareButton";

const GameMaker = dynamic(() => import("./GameMaker"), { ssr: false });

interface GamePreviewProps {
	gameId: string;
	postId?: string;
	userId: string;
	onClose: () => void;
	/** 元ポストの権利表記。改変NG・無断使用禁止なら改造の導線を一切出さない */
	originType?: OriginType;
	/** フィード上でその場再生する（フルスクリーンの固定オーバーレイにしない） */
	inline?: boolean;
}

export default function GamePreview({
	gameId,
	postId,
	userId,
	onClose,
	originType,
	inline,
}: GamePreviewProps) {
	const [manifest, setManifest] = useState<GameManifestDraft | null>(null);
	const [title, setTitle] = useState("");
	const [preset, setPreset] = useState("action");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);

	useEffect(() => {
		let cancelled = false;
		const load = async (attempt: number): Promise<void> => {
			try {
				// manifest はDBに無い。loadGame が /api/games/[id] とR2の両方を解決する
				const loaded = await loadGame(gameId);
				if (cancelled) return;
				if (!loaded) {
					if (attempt < 2) {
						await new Promise((r) => setTimeout(r, 400));
						return load(attempt + 1);
					}
					setError(true);
					return;
				}
				if (!cancelled) {
					setManifest(loaded.manifest);
					setTitle(loaded.record.title);
					if (loaded.record.preset) setPreset(loaded.record.preset);
					setLoading(false);
				}
			} catch {
				if (cancelled) return;
				// DBのウェブソケット接続が瞬断することがあるため、一度だけ再試行する
				if (attempt < 2) {
					await new Promise((r) => setTimeout(r, 400));
					return load(attempt + 1);
				}
				setError(true);
			}
		};
		load(0);
		return () => {
			cancelled = true;
		};
	}, [gameId]);

	const handleRemix = useCallback(
		(remixed: GameManifestDraft, meta: { title: string; preset: string }) => {
			startRemix({
				manifest: remixed,
				title: meta.title,
				preset: meta.preset,
				sourceGameId: gameId,
				sourceTitle: title,
			});
		},
		[gameId, title],
	);

	// 権利表記が改変を許していないなら、クリア画面の「改造する」（GameMaker 側）ごと塞ぐ
	const remixAllowed = isCollabAllowed(originType);

	const wrapClass = inline
		? "relative w-full h-full rounded-xl overflow-hidden border border-gray-800"
		: "fixed inset-0 z-[60]";

	if (error) {
		return (
			<div
				className={`${wrapClass} bg-black/95 flex flex-col items-center justify-center text-white`}
			>
				<p className="text-sm text-gray-400 mb-3">
					ゲームを読み込めませんでした
				</p>
				<button
					onClick={onClose}
					className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors"
				>
					閉じる
				</button>
			</div>
		);
	}

	if (loading || !manifest) {
		return (
			<div
				className={`${wrapClass} bg-black/95 flex flex-col items-center justify-center`}
			>
				<div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin mb-3" />
				<p className="text-xs text-gray-500">{title || "読み込み中..."}</p>
			</div>
		);
	}

	return (
		<div className={`${wrapClass} bg-[#07080b] flex flex-col`}>
			{/* MvBox/画像/MML と同じヘッダーバー型に統一（components/EmbedCollabBar.tsx参照） */}
			<EmbedCollabBar
				icon={Gamepad2}
				label={title || "ゲーム"}
				buttonLabel="改造する"
				colorClass="bg-red-600/80 hover:bg-red-500/90"
				onClick={
					remixAllowed
						? () =>
								startRemix({
									manifest,
									title: `${title || "ゲーム"}（改造）`,
									preset,
									sourceGameId: gameId,
									sourceTitle: title,
								})
						: undefined
				}
				extra={
					<>
						<ShareButton
							url={gameShareUrl(gameId)}
							text={buildGameShareText(title)}
							size={14}
							className="p-1.5 rounded hover:bg-gray-100/10"
						/>
						<button
							onClick={onClose}
							className="p-1.5 text-gray-400 hover:bg-gray-100/10 rounded transition-colors"
						>
							<X size={16} />
						</button>
					</>
				}
			/>
			<div className="flex-1 overflow-hidden">
				<GameMaker
					onClose={onClose}
					userId={userId}
					initialManifest={manifest}
					playOnly
					embedded={inline}
					fixedControls={inline}
					postId={postId}
					gameId={gameId}
					onRemix={remixAllowed ? handleRemix : undefined}
				/>
			</div>
		</div>
	);
}
