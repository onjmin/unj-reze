"use client";

import { useEffect, useState } from "react";
import { fetchJson, fetchText } from "./uploader";

/**
 * R2に置いた manifest / MML本文を、必要になった時点でブラウザから直接取ってくる。
 *
 * DBが返すのはURLだけなので、実体が要る画面（プレイヤー・エディタ）はここを通る。
 * unj-reze のサーバーは一切介在しない。R2は immutable で配っているので
 * 2回目以降はブラウザキャッシュから返り、往復は発生しない。
 *
 * `url` が空文字/undefined のときは何も取りに行かず loading=false のまま返す。
 */
export interface RemotePayload<T> {
	data: T | null;
	loading: boolean;
	error: string | null;
}

function useRemote<T>(
	url: string | undefined,
	load: (u: string) => Promise<T>,
): RemotePayload<T> {
	const [state, setState] = useState<RemotePayload<T>>({
		data: null,
		loading: !!url,
		error: null,
	});

	useEffect(() => {
		if (!url) {
			setState({ data: null, loading: false, error: null });
			return;
		}
		let disposed = false;
		setState({ data: null, loading: true, error: null });
		load(url)
			.then((data) => {
				if (!disposed) setState({ data, loading: false, error: null });
			})
			.catch((e) => {
				if (disposed) return;
				console.error("[uploader] failed to load payload", url, e);
				setState({
					data: null,
					loading: false,
					error: "データの読み込みに失敗しました",
				});
			});
		return () => {
			disposed = true;
		};
		// load は呼び出し側で安定している前提（モジュールスコープ関数）
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [url]);

	return state;
}

/** manifest（JSON）を取ってくる */
export function useRemoteJson<T>(url: string | undefined): RemotePayload<T> {
	return useRemote<T>(url, (u) => fetchJson<T>(u));
}

/** MML本文などのプレーンテキストを取ってくる */
export function useRemoteText(url: string | undefined): RemotePayload<string> {
	return useRemote<string>(url, fetchText);
}
