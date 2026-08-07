"use client";

import { Check, Link2, Share2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { copyText, shareOrCopy, xIntentUrl } from "@/lib/share";

interface ShareButtonProps {
	/** 共有する絶対URL */
	url: string;
	/** X に流すときの本文（URLは別で付くので含めない） */
	text: string;
	/** アイコンのサイズ。フィードの操作列は 14、詳細画面は 16 相当。 */
	size?: number;
	/** ボタンに添えるラベル（省略時はアイコンのみ） */
	label?: string;
	className?: string;
}

/**
 * 投稿・ゲームの「リンク」を配るためのボタン。
 * ネイティブ共有シートが使える端末ではそれを最優先し、
 * 使えない場合に備えて X / リンクコピーも同じメニューから選べるようにしている。
 */
export default function ShareButton({
	url,
	text,
	size = 14,
	label,
	className,
}: ShareButtonProps) {
	const [open, setOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	const [canNativeShare, setCanNativeShare] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
		},
		[],
	);

	useEffect(() => {
		if (!open) return;
		const onDocClick = (e: MouseEvent) => {
			if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onDocClick);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDocClick);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const flashCopied = useCallback(() => {
		setCopied(true);
		if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
		copiedTimerRef.current = setTimeout(() => setCopied(false), 1600);
	}, []);

	const handleCopy = useCallback(
		async (e: React.MouseEvent) => {
			e.stopPropagation();
			if (await copyText(url)) flashCopied();
			setOpen(false);
		},
		[url, flashCopied],
	);

	const handleNativeShare = useCallback(
		async (e: React.MouseEvent) => {
			e.stopPropagation();
			setOpen(false);
			const result = await shareOrCopy({ url, text });
			if (result === "copied") flashCopied();
		},
		[url, text, flashCopied],
	);

	const handleX = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			setOpen(false);
			window.open(xIntentUrl(text, url), "_blank", "noopener,noreferrer");
		},
		[url, text],
	);

	return (
		<div ref={rootRef} className="relative">
			<button
				type="button"
				aria-label="共有"
				aria-expanded={open}
				onClick={(e) => {
					e.stopPropagation();
					// SSR とハイドレーションのズレを避けるため、判定は開くときまで遅らせる
					setCanNativeShare(
						typeof navigator !== "undefined" && !!navigator.share,
					);
					setOpen((v) => !v);
				}}
				className={`flex items-center space-x-1 transition-colors ${copied ? "text-green-400" : "hover:text-sky-400"} ${className ?? ""}`}
			>
				{copied ? <Check size={size} /> : <Share2 size={size} />}
				{(label || copied) && (
					<span className="text-[11px]">
						{copied ? "コピーしました" : label}
					</span>
				)}
			</button>

			{open && (
				<div
					role="menu"
					className="absolute right-0 bottom-full mb-1.5 z-50 w-44 rounded-lg border border-gray-700 bg-[#131720] shadow-xl py-1 text-xs"
					onClick={(e) => e.stopPropagation()}
				>
					{canNativeShare && (
						<button
							role="menuitem"
							onClick={handleNativeShare}
							className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors"
						>
							<Share2 size={12} className="shrink-0" />
							<span>共有する…</span>
						</button>
					)}
					<button
						role="menuitem"
						onClick={handleX}
						className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors"
					>
						<span className="shrink-0 w-3 text-center font-bold leading-none">
							𝕏
						</span>
						<span>Xでポスト</span>
					</button>
					<button
						role="menuitem"
						onClick={handleCopy}
						className="flex items-center gap-2.5 w-full px-3 py-2 text-gray-300 hover:bg-gray-100/10 text-left transition-colors"
					>
						<Link2 size={12} className="shrink-0" />
						<span>リンクをコピー</span>
					</button>
				</div>
			)}
		</div>
	);
}
