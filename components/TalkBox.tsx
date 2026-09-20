"use client";
import { Loader2, MessagesSquare } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadTalk } from "@/lib/game-mv-client";
import { TALK_H, TALK_W, type TalkManifest } from "@/lib/talk-config";
import EmbedCollabBar from "./EmbedCollabBar";
import TalkPlayer from "./TalkPlayer";

const THUMBNAIL_HEIGHT = 120;
const ANIMATION_MS = 400;

const HEADER_HEIGHT = 36;
/** TalkPlayer の進行バーぶん */
const CONTROLS_HEIGHT = 20;

interface TalkBoxProps {
	talkId: string;
	postId: string;
	talkTitle: string;
	talkThumbnail?: string;
	talkPlays?: number;
	className?: string;
}

/**
 * フィードに置くかけあい動画の埋め込み。MvBox と同じ「サムネ → タップで展開して再生」。
 *
 * manifest はサムネの時点では持たない（フィードの転送量を増やさないため。docs/NEON_EGRESS.md）。
 * 展開したときにはじめて /api/talks/[id] から取りにいく。
 */
export default function TalkBox({
	talkId,
	postId,
	talkTitle,
	talkThumbnail,
	talkPlays = 0,
	className,
}: TalkBoxProps) {
	const [phase, setPhase] = useState<"closed" | "opening" | "open" | "closing">(
		"closed",
	);
	const [measuredWidth, setMeasuredWidth] = useState(0);
	const [manifest, setManifest] = useState<TalkManifest | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const instanceIdRef = useRef(`talk_${postId}_${talkId}`);
	const countedRef = useRef(false);

	useEffect(() => {
		if (!containerRef.current) return;
		const obs = new ResizeObserver((entries) => {
			for (const e of entries) setMeasuredWidth(e.contentRect.width);
		});
		obs.observe(containerRef.current);
		return () => obs.disconnect();
	}, []);

	const fullHeight =
		measuredWidth > 0
			? measuredWidth * (TALK_H / TALK_W) + HEADER_HEIGHT + CONTROLS_HEIGHT
			: THUMBNAIL_HEIGHT;
	const isOpen = phase === "opening" || phase === "open";
	const currentHeight = isOpen ? fullHeight : THUMBNAIL_HEIGHT;

	const handleClose = useCallback(() => {
		setPhase((prev) =>
			prev === "open" || prev === "opening" ? "closing" : prev,
		);
	}, []);

	const handleOpen = useCallback(() => {
		// ゲーム/MV と再生の主導権を共有する（同時に2つ鳴らない）
		window.dispatchEvent(
			new CustomEvent("unj-game-box-open", {
				detail: { id: instanceIdRef.current },
			}),
		);
		setPhase((prev) =>
			prev === "closed" || prev === "closing" ? "opening" : prev,
		);

		if (manifest || loading) return;
		setLoading(true);
		setError(null);
		loadTalk(talkId)
			.then((loaded) => {
				if (!loaded) throw new Error("not found");
				setManifest(loaded.manifest);
			})
			.catch(() => setError("かけあい動画を読み込めませんでした"))
			.finally(() => setLoading(false));

		if (!countedRef.current) {
			countedRef.current = true;
			fetch(`/api/talks/${talkId}/play`, { method: "POST" }).catch(() => {});
		}
	}, [talkId, manifest, loading]);

	useEffect(() => {
		const handleOtherOpen = (e: Event) => {
			const customEvent = e as CustomEvent<{ id: string }>;
			if (customEvent.detail?.id !== instanceIdRef.current) handleClose();
		};
		window.addEventListener("unj-game-box-open", handleOtherOpen);
		return () =>
			window.removeEventListener("unj-game-box-open", handleOtherOpen);
	}, [handleClose]);

	const handleTransitionEnd = useCallback((e: React.TransitionEvent) => {
		if (e.propertyName !== "height") return;
		setPhase((prev) => {
			if (prev === "opening") return "open";
			if (prev === "closing") return "closed";
			return prev;
		});
	}, []);

	return (
		<div
			ref={containerRef}
			className={`relative w-full overflow-hidden rounded-xl border border-gray-800 ${className ?? ""}`}
			style={{
				height: currentHeight,
				transition: `height ${ANIMATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
			}}
			onTransitionEnd={handleTransitionEnd}
		>
			{/* サムネイル */}
			<div
				onClick={phase === "closed" ? handleOpen : undefined}
				className="group absolute inset-0 flex cursor-pointer flex-col items-center justify-center bg-gray-900"
				style={{
					opacity: phase === "closed" || phase === "closing" ? 1 : 0,
					transition: "opacity 200ms",
					pointerEvents: phase === "closed" ? "auto" : "none",
				}}
			>
				{talkThumbnail && (
					<div
						className="absolute inset-0 bg-cover bg-center opacity-30 transition-opacity group-hover:opacity-40"
						style={{ backgroundImage: `url('${talkThumbnail}')` }}
					/>
				)}
				<div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
				<div className="z-10 flex flex-col items-center space-y-1">
					<div className="rounded-full bg-amber-600 p-3 shadow-[0_0_15px_rgba(217,119,6,0.5)] transition-transform group-hover:scale-110">
						<MessagesSquare size={26} className="text-white" />
					</div>
					<span className="mt-1.5 rounded bg-black/60 px-2 py-0.5 text-[9px] font-bold tracking-widest text-gray-400 backdrop-blur">
						TAP TO PLAY
					</span>
				</div>
				<div className="absolute bottom-2 left-2.5 z-10 flex items-center gap-1.5">
					<span className="rounded bg-amber-600/90 px-2 py-0.5 text-xs font-bold text-white">
						{talkTitle || "かけあい動画"}
					</span>
					{talkPlays > 0 && (
						<span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-gray-300 backdrop-blur">
							▶ {talkPlays.toLocaleString()}
						</span>
					)}
				</div>
			</div>

			{/* 本体 */}
			{phase !== "closed" && (
				<div
					className="absolute inset-0 z-10 flex flex-col bg-black"
					style={{
						opacity: phase === "closing" ? 0 : 1,
						transition: "opacity 200ms",
					}}
				>
					<EmbedCollabBar
						icon={MessagesSquare}
						label={talkTitle || "かけあい動画"}
						buttonLabel="改造する"
						colorClass="bg-amber-600/90 hover:bg-amber-500"
						onClick={undefined}
						extra={
							<button
								onClick={handleClose}
								className="rounded-full bg-gray-800 px-2.5 py-1 text-[10px] font-bold text-gray-200 transition-colors hover:bg-gray-700"
							>
								閉じる
							</button>
						}
					/>

					{manifest ? (
						<div className="flex-1 overflow-hidden bg-black px-0">
							<TalkPlayer manifest={manifest} />
						</div>
					) : (
						<div className="flex flex-1 items-center justify-center gap-2 text-[11px] text-gray-500">
							{loading && <Loader2 size={14} className="animate-spin" />}
							{error ?? (loading ? "読み込み中…" : "")}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
