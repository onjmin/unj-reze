"use client";

import { useEffect } from "react";

/**
 * 過去に登録された Service Worker を全解除してクリーンアップする。
 *
 * 【原理的なデッドロック防止】
 * キャッシュを持たない素通しの SW であっても、fetch リスナーが存在すると
 * ブラウザ（特に Chromium）のネットワークスタックが SW プロセスの応答待ちになり、
 * プロセスの終了や再起動と競合した際に一切の通信がフリーズ（Network タブにすら
 * 記録されず無限保留）するデッドロックを引き起こす。
 *
 * 現代のブラウザ（Chrome 108+ 等）は Web App Manifest だけで PWA インストールが
 * 可能なため、オフラインキャッシュやプッシュ通知を行わない本アプリに Service Worker は不要。
 * 既存ユーザーのブラウザに残っている SW を確実に抹消する。
 */
export default function PwaRegister() {
	useEffect(() => {
		if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
			return;

		navigator.serviceWorker
			.getRegistrations()
			.then((registrations) => {
				for (const reg of registrations) {
					reg.unregister().catch(() => {});
				}
			})
			.catch(() => {});
	}, []);

	return null;
}

