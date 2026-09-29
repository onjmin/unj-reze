/** ポインタキャプチャの安全な取得。
 *
 *  `Element.setPointerCapture()` は「アクティブなポインタが見つからない」という理由で
 *  例外を投げることがある（マルチタッチの取りこぼし、pointerdown と実際の呼び出しの間に
 *  ポインタが失われた場合など）。素で呼ぶとハンドラがその場で中断し、**キャプチャの成否とは
 *  無関係な後続の状態更新まで丸ごと飛ぶ**（例: GameMaker の十字キーは押しても一切反応しない）。
 *
 *  ドラッグ自体は各コンポーネントが ref でポインタIDを手動追跡しているため、キャプチャが
 *  取れなくても機能は継続できる。よってここで握りつぶし、呼び出し元を止めない。
 */
export const tryCapturePointer = (
	el: Element | null | undefined,
	pointerId: number,
): void => {
	try {
		el?.setPointerCapture?.(pointerId);
	} catch {
		/* noop: キャプチャが取れなくてもドラッグは手動追跡で継続する */
	}
};
