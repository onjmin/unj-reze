"use client";

import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { api } from "@/lib/api";
import type { Post } from "@/lib/types";

/**
 * 返信一覧は「直近N件」の窓しかサーバーから来ない（lib/db/interface.ts の
 * REPLIES_PAGE_SIZE、docs/NEON_EGRESS.md）。1000レスのスレを開いただけで全件
 * 引くと Neon の転送量枠を食い潰すため、古いレスは**上へスクロールしたときだけ**
 * 追加で読む。
 */

/** スクロール位置がこの値より上に来たら過去レスを追加で読む（px） */
const LOAD_OLDER_THRESHOLD_PX = 600;

/**
 * `>>N` 安価ジャンプのために遡れるページ数の上限。
 * クリック1回で無制限に遡ると、1000レスのスレで `>>2` を踏まれた瞬間に全件取得と
 * 同じことになる（それを避けるための窓なので本末転倒）。
 */
const MAX_JUMP_PAGES = 5;

export interface OlderRepliesController {
	/** まだ読んでいない過去レスが残っているか */
	hasOlder: boolean;
	/** 追加読み込み中 */
	loadingOlder: boolean;
	/** 手動トリガ（一覧の先頭に置く「過去のレスを読む」ボタン用）。
	 *  画面が短くてスクロールが発生しない場合はこれが唯一の導線になる。 */
	loadOlder: () => void;
	/**
	 * 指定のレス番号が読み込まれるまで遡る（掲示板モードの `>>N` 安価ジャンプ用）。
	 * 届いたら true。上限ページ数まで遡っても届かなければ false。
	 */
	loadOlderUntil: (num: number) => Promise<boolean>;
}

/**
 * スレッドの過去レスを上方向にページングする。
 *
 * カーソルはレス番号（`Post.num`）。配列の添字ではなく num を使うのは、窓で
 * 切り取った一覧では添字が実際のレス番と一致しないため。
 */
export function useOlderReplies(
	post: Post,
	setPost: Dispatch<SetStateAction<Post>>,
	viewerId?: string,
	/** false のあいだは何もしない（PostDetail は掲示板モードのとき
	 *  BbsThreadView 側の同じフックに任せるので、二重に読みに行かせない）。 */
	enabled = true,
): OlderRepliesController {
	const [loadingOlder, setLoadingOlder] = useState(false);
	const loadingRef = useRef(false);
	/** これ以上遡っても何も返ってこないと分かった状態（全部ミュート済み等） */
	const [exhausted, setExhausted] = useState(false);
	const exhaustedRef = useRef(false);
	/** 追加分の高さでスクロールが飛ばないよう、描画前の位置を控えておく */
	const restoreRef = useRef<{ height: number; top: number } | null>(null);
	/**
	 * 連続ページングのために、setPost の反映を待たずに読める最新の返信配列。
	 * state だけを見ると、同じターン内の2ページ目が1ページ目と同じカーソルを使ってしまう
	 * （`loadOlderUntil` が同じところをループする）。読むのはイベントハンドラと
	 * 非同期コールバックの中だけなので、同期はコミット後の effect で足りる。
	 */
	const repliesRef = useRef(post.replies);
	useEffect(() => {
		repliesRef.current = post.replies;
	}, [post.replies]);

	const oldestNum = post.replies.find((r) => r.num != null)?.num;
	// OPが>>1なので、いちばん古い読み込み済みレスが>>2ならもう先頭に着いている
	const hasOlder = enabled && !exhausted && oldestNum != null && oldestNum > 2;

	/** 1ページ遡る。返り値は実際に増えた件数（0なら打ち止め or 失敗）。 */
	const fetchOlderPage = useCallback(async (): Promise<number> => {
		if (!enabled || loadingRef.current || exhaustedRef.current) return 0;
		const before = repliesRef.current.find((r) => r.num != null)?.num;
		if (before == null || before <= 2) return 0;
		loadingRef.current = true;
		setLoadingOlder(true);
		restoreRef.current = {
			height: document.documentElement.scrollHeight,
			top: window.scrollY,
		};
		try {
			const older = await api.posts.replies.list(post.id, viewerId, { before });
			const known = new Set(repliesRef.current.map((r) => r.id));
			const fresh = older.filter((r) => !known.has(r.id));
			if (fresh.length === 0) {
				restoreRef.current = null;
				exhaustedRef.current = true;
				setExhausted(true);
				return 0;
			}
			repliesRef.current = [...fresh, ...repliesRef.current];
			setPost((p) => ({ ...p, replies: [...fresh, ...p.replies] }));
			return fresh.length;
		} catch {
			restoreRef.current = null;
			return 0;
		} finally {
			loadingRef.current = false;
			setLoadingOlder(false);
		}
	}, [enabled, post.id, setPost, viewerId]);

	const loadOlder = useCallback(() => {
		void fetchOlderPage();
	}, [fetchOlderPage]);

	const loadOlderUntil = useCallback(
		async (num: number) => {
			for (let page = 0; page < MAX_JUMP_PAGES; page++) {
				const oldest = repliesRef.current.find((r) => r.num != null)?.num;
				if (oldest == null || oldest <= num) return true;
				if ((await fetchOlderPage()) === 0) return false;
			}
			const oldest = repliesRef.current.find((r) => r.num != null)?.num;
			return oldest != null && oldest <= num;
		},
		[fetchOlderPage],
	);

	// 先頭に差し込んだぶんだけ下へ送り返す。見ていたレスがその場に留まる。
	useLayoutEffect(() => {
		const saved = restoreRef.current;
		if (!saved) return;
		restoreRef.current = null;
		const delta = document.documentElement.scrollHeight - saved.height;
		if (delta > 0) window.scrollTo(0, saved.top + delta);
	}, [post.replies.length]);

	useEffect(() => {
		if (!hasOlder) return;
		const onScroll = () => {
			if (window.scrollY <= LOAD_OLDER_THRESHOLD_PX) loadOlder();
		};
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, [hasOlder, loadOlder]);

	return { hasOlder, loadingOlder, loadOlder, loadOlderUntil };
}

/**
 * 開いた直後は最新レスが見えている状態にする（返信は直近ほど重要なので、
 * 上から読ませるより最新に着地させる）。
 *
 * 返り値の ref を一覧の末尾の空要素に付ける。ユーザーが自分でスクロール等の
 * 操作を始めたら以後は一切動かさない。
 */
export function useScrollToNewestReply(
	postId: string,
	replyCount: number,
	enabled = true,
): { anchorRef: React.RefObject<HTMLDivElement | null> } {
	const anchorRef = useRef<HTMLDivElement | null>(null);
	const doneForRef = useRef<string | null>(null);

	useEffect(() => {
		if (!enabled || doneForRef.current === postId || replyCount === 0) return;

		let cancelled = false;
		const cancel = () => {
			cancelled = true;
		};
		window.addEventListener("wheel", cancel, { passive: true });
		window.addEventListener("touchstart", cancel, { passive: true });
		window.addEventListener("keydown", cancel);

		// 「済み」を立てるのは実際に飛ばしたときだけ。effect の開始時に立てると、
		// StrictMode の mount→cleanup→mount で1回目がキャンセルされ、2回目が
		// 「済み」を見て何もしないまま終わる（開発時だけ動かない状態になる）。
		const jump = () => {
			if (cancelled) return;
			doneForRef.current = postId;
			anchorRef.current?.scrollIntoView({ block: "end" });
		};
		const raf = requestAnimationFrame(jump);
		// 画像やゲーム埋め込みが載って高さが伸びるので一度だけ追従する
		const timer = setTimeout(jump, 300);

		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
			clearTimeout(timer);
			window.removeEventListener("wheel", cancel);
			window.removeEventListener("touchstart", cancel);
			window.removeEventListener("keydown", cancel);
		};
	}, [enabled, postId, replyCount]);

	return { anchorRef };
}
