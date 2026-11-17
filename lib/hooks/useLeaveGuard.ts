"use client";

import { useEffect } from "react";

/**
 * 作成画面を開いている間、タブを閉じる・再読み込み・外部へ移動しようとしたら
 * ブラウザの「このサイトを離れますか？」を出す（beforeunload）。
 *
 * どのエディタも 10 秒ごとに自動保存しているが、直前の数秒ぶんは消えるし、
 * 自動保存があること自体に気づいていない人も多い。
 *
 * 「何か変えたか」はエディタごとに持ち方がばらばら（oekaki・DAW は命令的で state に出ない）なので、
 * ここでは**開いてから一度でも操作したら**守る、で揃えている。エディタはどれも全画面モーダルなので、
 * 開いている間の document への操作＝エディタへの操作とみなしてよい。開いて何も触らずに閉じる・
 * 再読み込みするときは何も出ない。
 *
 * - Ctrl/Cmd/Alt 付きのキーと F1〜F12 は数えない。数えると F5 / Ctrl+R そのものが
 *   「操作」になって、何も描いていないのに確認が出る。
 * - アプリ内の画面遷移（Next のクライアント遷移）は beforeunload を通らないので対象外。
 *   エディタが閉じれば（unmount）リスナーも外れる。
 * - `enabled` が false の間（再生専用の埋め込みなど）は何もしない。
 */
export function useLeaveGuard(enabled = true) {
	useEffect(() => {
		if (!enabled) return;
		let touched = false;

		const markPointer = () => {
			touched = true;
		};
		const markKey = (e: KeyboardEvent) => {
			if (e.ctrlKey || e.metaKey || e.altKey) return;
			if (/^F\d+$/.test(e.key)) return;
			touched = true;
		};
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			if (!touched) return;
			e.preventDefault();
			// 古い Chrome / Safari は returnValue に何か入っていないと確認を出さない。
			e.returnValue = "";
		};

		const opts = { capture: true, passive: true } as const;
		document.addEventListener("pointerdown", markPointer, opts);
		document.addEventListener("input", markPointer, opts);
		document.addEventListener("drop", markPointer, opts);
		document.addEventListener("keydown", markKey, opts);
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => {
			document.removeEventListener("pointerdown", markPointer, opts);
			document.removeEventListener("input", markPointer, opts);
			document.removeEventListener("drop", markPointer, opts);
			document.removeEventListener("keydown", markKey, opts);
			window.removeEventListener("beforeunload", onBeforeUnload);
		};
	}, [enabled]);
}
