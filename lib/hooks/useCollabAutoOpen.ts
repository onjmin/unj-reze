"use client";

import { useEffect, useRef } from "react";
import { COLLAB_QUERY_PARAM } from "@/lib/collab-link";
import type { Post } from "@/lib/types";

/**
 * 一覧画面（ハッシュタグ/検索/プロフィール）から `?collab=1` で飛んできたときに
 * コラボ導線を自動で開く。あちらはコンポーザもエディタも載せていないので、
 * コラボの実処理はポスト詳細へ委譲されている（lib/collab-link.ts 参照）。
 *
 * useSearchParams ではなく window.location を読むのは、これを使う画面が
 * 静的シェル生成の対象に入ったときに Suspense 境界を要求されないようにするため。
 * 一度開いたらクエリを落とし、リロードや戻るで二重に開かないようにする。
 *
 * `enabled` は「この画面がコラボを開ける側か」。SNSモードと掲示板モードで
 * 実装が別（PostDetail / BbsThreadView）なので、開けない側がクエリだけ
 * 消費してしまわないよう、モード確定後に true を渡すこと。
 */
export function useCollabAutoOpen(
	post: Post,
	openCollab: (post: Post) => void,
	enabled: boolean,
) {
	const openedRef = useRef(false);
	useEffect(() => {
		if (!enabled || openedRef.current) return;
		// ソフト遷移の最中は「前に開いていたポスト」の画面もまだマウントされていて、
		// そちらの effect が先に走ることがある。URL のポストIDが自分と一致するときだけ
		// 消費しないと、前の画面がクエリを横取りして（画面には何も出ないまま）
		// 遷移先ではコラボが開かない、という取りこぼしが起きる。
		if (!window.location.pathname.endsWith(`/post/${post.id}`)) return;
		const params = new URLSearchParams(window.location.search);
		if (params.get(COLLAB_QUERY_PARAM) !== "1") return;
		openedRef.current = true;
		params.delete(COLLAB_QUERY_PARAM);
		const qs = params.toString();
		window.history.replaceState(
			null,
			"",
			`${window.location.pathname}${qs ? `?${qs}` : ""}`,
		);
		openCollab(post);
	}, [enabled, post, openCollab]);
}
