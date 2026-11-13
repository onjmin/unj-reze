"use client";

import { useSyncExternalStore } from "react";

// 開発者モード。端末ごとの表示設定で、localStorage にだけ持つ（サーバーへは送らない）。
// 誰でも自分で ON にできるので、これで出し分けてよいのは「見せるかどうか」だけ。
// 権限や制限の判定には絶対に使わないこと（判定は必ずサーバー側で）。
const KEY = "unj_dev_mode";
const EVENT = "unj:dev-mode";

function read(): boolean {
	try {
		return localStorage.getItem(KEY) === "1";
	} catch {
		return false;
	}
}

function subscribe(onChange: () => void): () => void {
	// storage は別タブでの変更、EVENT は同じタブでの変更
	window.addEventListener("storage", onChange);
	window.addEventListener(EVENT, onChange);
	return () => {
		window.removeEventListener("storage", onChange);
		window.removeEventListener(EVENT, onChange);
	};
}

export function isDeveloperMode(): boolean {
	return typeof window !== "undefined" && read();
}

export function setDeveloperMode(on: boolean): void {
	try {
		if (on) localStorage.setItem(KEY, "1");
		else localStorage.removeItem(KEY);
	} catch {
		/* 保存できない環境（プライベートウィンドウ等）では切り替わらない */
	}
	window.dispatchEvent(new Event(EVENT));
}

/** 開発者モードが ON か。SSR と初回描画は false。 */
export function useDeveloperMode(): boolean {
	return useSyncExternalStore(subscribe, read, () => false);
}
