"use client";

import { useEffect, useRef } from "react";
import type { RealtimeMessage } from "@/lib/realtime/channels";
import { getRealtimeClient, realtimeConfigured } from "@/lib/realtime/client";

export { realtimeConfigured };

/**
 * 指定チャンネルを購読し、届いたメッセージを handler に渡す。
 *
 * handler は ref 経由で呼ぶので、毎レンダリング新しい関数を渡しても
 * 購読が張り直されない（＝再接続やイベント取りこぼしが起きない）。
 * channels は毎回同じ内容でも配列の同一性が変わりがちなので、中身の文字列で比較する。
 */
export function useRealtimeSubscription(
	channels: string[],
	handler: (msg: RealtimeMessage) => void,
	enabled = true,
) {
	const handlerRef = useRef(handler);
	// レンダリング中に ref を書き換えない（react-hooks/refs）。ハンドラが呼ばれるのは
	// WebSocket の受信時＝コミット後なので、ここで差し替えれば間に合う。
	useEffect(() => {
		handlerRef.current = handler;
	});

	const key = channels.join("|");

	useEffect(() => {
		if (!enabled) return;
		const client = getRealtimeClient();
		if (!client) return;
		const list = key ? key.split("|") : [];
		if (list.length === 0) return;

		const offHandler = client.addHandler((msg) => handlerRef.current(msg));
		const offChannels = client.subscribe(list);
		return () => {
			offChannels();
			offHandler();
		};
	}, [key, enabled]);
}

/**
 * ポーリング間隔を決める。
 * ハブが設定されていれば push が来るので、保険としての再取得だけを長い間隔で回す。
 * 未設定なら従来どおりの間隔でポーリングする。
 */
export function pollInterval(withoutHubMs: number, withHubMs: number): number {
	return realtimeConfigured ? withHubMs : withoutHubMs;
}
