"use client";
import { Clapperboard, Loader2, Pencil } from "lucide-react";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadMv } from "@/lib/game-mv-client";
import {
	MV_H,
	MV_PRESET_LABELS,
	MV_W,
	type MvManifest,
	type MvPresetKind,
} from "@/lib/mv-config";
import { startMvRemix } from "@/lib/remix";
import { isCollabAllowed, type OriginType } from "@/lib/types";
import MvPlayer from "./MvPlayer";

const THUMBNAIL_HEIGHT = 120;
const ANIMATION_MS = 400;

const HEADER_HEIGHT = 36;
const CONTROLS_HEIGHT = 53;

interface MvBoxProps {
	mvId: string;
	postId: string;
	mvTitle: string;
	mvThumbnail?: string;
	mvPreset?: MvPresetKind;
	mvPlays?: number;
	/** 元ポストの権利表記。改変NG・無断使用禁止なら「改造する」を出さない */
	originType?: OriginType;
	className?: string;
}

/**
 * フィードに置くMVの埋め込み。GameBox と同じ「サムネ → タップで展開して再生」。
 *
 * manifest はサムネの時点では持たない（フィードの転送量を増やさないため。docs/NEON_EGRESS.md）。
 * 展開したときにはじめて /api/mvs/[id] から取りにいく。
 */
export default function MvBox({
	mvId,
	postId,
	mvTitle,
	mvThumbnail,
	mvPreset,
	mvPlays = 0,
	originType,
	className,
}: MvBoxProps) {
	const [phase, setPhase] = useState<"closed" | "opening" | "open" | "closing">(
		"closed",
	);
	const [measuredWidth, setMeasuredWidth] = useState(0);
	const [manifest, setManifest] = useState<MvManifest | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const instanceIdRef = useRef(`mv_${postId}_${mvId}`);
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
			? measuredWidth * (MV_H / MV_W) + HEADER_HEIGHT + CONTROLS_HEIGHT
			: THUMBNAIL_HEIGHT;
	const isOpen = phase === "opening" || phase === "open";
	const currentHeight = isOpen ? fullHeight : THUMBNAIL_HEIGHT;

	const handleClose = useCallback(() => {
		setPhase((prev) =>
			prev === "open" || prev === "opening" ? "closing" : prev,
		);
	}, []);

	const handleOpen = useCallback(() => {
		// ゲームとMVで再生の主導権を共有する（同時に2つ鳴らない）
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
		// manifest 本体はR2。展開したときにはじめて1往復する
		loadMv(mvId)
			.then((loaded) => {
				if (!loaded) throw new Error("not found");
				setManifest(loaded.manifest);
			})
			.catch(() => setError("MVを読み込めませんでした"))
			.finally(() => setLoading(false));

		if (!countedRef.current) {
			countedRef.current = true;
			fetch(`/api/mvs/${mvId}/play`, { method: "POST" }).catch(() => {});
		}
	}, [mvId, manifest, loading]);

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
				{mvThumbnail && (
					<div
						className="absolute inset-0 bg-cover bg-center opacity-30 transition-opacity group-hover:opacity-40"
						style={{ backgroundImage: `url('${mvThumbnail}')` }}
					/>
				)}
				<div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
				<div className="z-10 flex flex-col items-center space-y-1">
					<div className="rounded-full bg-cyan-600 p-3 shadow-[0_0_15px_rgba(8,145,178,0.5)] transition-transform group-hover:scale-110">
						<Clapperboard size={26} className="text-white" />
					</div>
					<span className="mt-1.5 rounded bg-black/60 px-2 py-0.5 text-[9px] font-bold tracking-widest text-gray-400 backdrop-blur">
						TAP TO PLAY MV
					</span>
				</div>
				<div className="absolute bottom-2 left-2.5 z-10 flex items-center gap-1.5">
					<span className="rounded bg-cyan-600/90 px-2 py-0.5 text-xs font-bold text-white">
						{mvTitle || "MV"}
					</span>
					{mvPreset && (
						<span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-gray-300 backdrop-blur">
							{MV_PRESET_LABELS[mvPreset]}
						</span>
					)}
					{mvPlays > 0 && (
						<span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-gray-300 backdrop-blur">
							▶ {mvPlays.toLocaleString()}
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
					{/* ヘッダーバー（動画の外側上部） */}
					<div className="flex h-9 shrink-0 items-center justify-between border-b border-gray-800/80 bg-gray-950/90 px-3">
						<span className="text-xs font-bold text-gray-200 truncate">
							{mvTitle || "MV"}
						</span>
						<div className="flex items-center gap-1.5 shrink-0">
							{manifest && isCollabAllowed(originType) && (
								<button
									onClick={() =>
										startMvRemix({
											manifest,
											title: `${mvTitle}（改造）`,
											preset: mvPreset || "pianoRoll",
											sourceMvId: mvId,
											sourceTitle: mvTitle,
										})
									}
									className="flex items-center gap-1 rounded-full bg-cyan-600/90 px-2.5 py-1 text-[10px] font-bold text-white transition-colors hover:bg-cyan-500"
								>
									<Pencil size={10} /> 改造する
								</button>
							)}
							<button
								onClick={handleClose}
								className="rounded-full bg-gray-800 px-2.5 py-1 text-[10px] font-bold text-gray-200 transition-colors hover:bg-gray-700"
							>
								閉じる
							</button>
						</div>
					</div>

					{manifest ? (
						<MvPlayer manifest={manifest} autoPlay tapToToggle className="rounded-none" />
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
