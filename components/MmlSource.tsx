"use client";

import type { ReactNode } from "react";
import { extractMmlFromContent } from "@/lib/mml";
import type { Post } from "@/lib/types";
import { useRemoteText } from "@/lib/use-remote-payload";

/**
 * 投稿のMML本文を解決して children に渡す。
 *
 * MML本文はもう content に入っていない（posts.mml_url からR2を引く）。
 * フィードに並んでいるだけの投稿では取りに行かず、実際に鳴らす/描く段になって
 * はじめて1往復する。R2は immutable なので2回目以降はブラウザキャッシュから返る。
 *
 * `post.content` にMMLが残っている古い投稿（アップローダ未設定の環境で作られたもの）は
 * そのまま使う。移行スクリプトが流れるまでの猶予でもある。
 */
interface Props {
	post: Pick<Post, "content" | "mmlUrl">;
	/** 読み込み中に出すもの。省略すると何も出さない */
	fallback?: ReactNode;
	children: (mml: string) => ReactNode;
}

export default function MmlSource({ post, fallback = null, children }: Props) {
	const inline = extractMmlFromContent(post.content);
	// content に本文が残っていればそれを使い、R2へは行かない
	const { data, loading, error } = useRemoteText(
		inline ? undefined : post.mmlUrl,
	);

	const mml = inline || data;
	if (mml) return <>{children(mml)}</>;
	if (loading) return <>{fallback}</>;
	if (error) {
		return (
			<div className="text-[11px] text-red-400">
				MMLの読み込みに失敗しました
			</div>
		);
	}
	return null;
}

/**
 * コンポーネント境界を挟みたくない場所むけ。使い方は MmlSource と同じ。
 * フックなので map/filter のコールバック内では呼べない点に注意。
 */
export function useMmlSource(
	post: Pick<Post, "content" | "mmlUrl"> | null | undefined,
) {
	const inline = post ? extractMmlFromContent(post.content) : null;
	const { data, loading, error } = useRemoteText(
		inline ? undefined : post?.mmlUrl,
	);
	return { mml: inline || data, loading, error };
}
