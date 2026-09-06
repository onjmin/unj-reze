"use client";

// ゲーム内掲示板オーバーレイ。本SNS自身の投稿(postId)を2ch風の一覧+返信フォームで表示する。
// 外部サイト（open2ch.net等）へは一切アクセスしない — 既存の投稿/返信APIをそのまま使うだけ。
// 2D/3Dどちらのエンジンからも呼べる共通コンポーネント（現状はmmo3dから使用）。
// 参考: docs/mmo3d-feature-design.md「ゲーム内BBS機能」

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { getAvatarInfo } from "@/lib/avatar";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";

interface ThreadReply {
	id: string;
	displayName: string;
	userId?: string;
	slug?: string;
	bbsId?: string;
	content: string;
	createdAt?: string;
}

export default function GameThreadBoard({
	postId,
	onClose,
}: {
	/** 対象スレッド（本SNSの投稿ID）。ゲーム作者が配置時に指定する想定。 */
	postId: string;
	onClose: () => void;
}) {
	const currentUser = useCurrentUser();
	const [threadTitle, setThreadTitle] = useState<string | null>(null);
	const [replies, setReplies] = useState<ThreadReply[]>([]);
	const [loading, setLoading] = useState(true);
	const [draft, setDraft] = useState("");
	const [posting, setPosting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		Promise.all([
			fetch(`/api/posts/${postId}`).then((r) => (r.ok ? r.json() : null)),
			fetch(`/api/posts/${postId}/replies`).then((r) => (r.ok ? r.json() : [])),
		])
			.then(([post, replyList]) => {
				if (cancelled) return;
				setThreadTitle(post?.content ?? null);
				setReplies(Array.isArray(replyList) ? replyList : []);
			})
			.catch(() => {
				if (!cancelled) setError("読み込みに失敗しました");
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [postId]);

	const handleSubmit = async () => {
		const content = draft.trim();
		if (!content || posting) return;
		setPosting(true);
		setError(null);
		try {
			const res = await fetch(`/api/posts/${postId}/replies`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					content,
					parentPostId: postId,
				}),
			});
			if (!res.ok) throw new Error("failed");
			const reply: ThreadReply = await res.json();
			setReplies((prev) => [...prev, reply]);
			setDraft("");
		} catch {
			setError("書き込みに失敗しました");
		} finally {
			setPosting(false);
		}
	};

	return (
		<div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
			<div className="w-full max-w-md max-h-[80%] flex flex-col rounded-lg border border-gray-700 bg-[#0f0f11] text-gray-100 shadow-xl">
				<div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 shrink-0">
					<span className="text-xs font-bold text-gray-300">
						{threadTitle ? threadTitle.slice(0, 40) : "掲示板"}
					</span>
					<button
						type="button"
						onClick={onClose}
						className="text-gray-400 hover:text-gray-200"
						aria-label="閉じる"
					>
						<X size={16} />
					</button>
				</div>

				<div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-xs">
					{loading ? (
						<p className="text-gray-500 text-center py-4">読み込み中…</p>
					) : replies.length === 0 ? (
						<p className="text-gray-500 text-center py-4">まだレスがありません</p>
					) : (
						replies.map((r, i) => (
							<div key={r.id} className="border-b border-gray-800/60 pb-1.5">
								<div className="text-gray-500">
									{i + 1} 名前：
									{
										getAvatarInfo(
											r.bbsId || r.userId,
											r.displayName,
										).username
									}
								</div>
								<div className="text-gray-200 whitespace-pre-wrap break-words">
									{r.content}
								</div>
							</div>
						))
					)}
					{error && <p className="text-red-400">{error}</p>}
				</div>

				<div className="flex items-center gap-1.5 px-3 py-2 border-t border-gray-800 shrink-0">
					<input
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								handleSubmit();
							}
						}}
						placeholder="レスを書く…"
						className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
					/>
					<button
						type="button"
						onClick={handleSubmit}
						disabled={posting || !draft.trim()}
						className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-bold disabled:opacity-40"
					>
						書き込む
					</button>
				</div>
			</div>
		</div>
	);
}
