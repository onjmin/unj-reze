/**
 * items を最大 limit 本ずつ並列に fn へ通す。一覧を開いた瞬間に詳細を 100 本以上 Promise.all で
 * 一斉に投げると、サーバーの読み取り枠（READ_LIMITER）を1回で食い、続けて開いた一覧が 429 になる。
 * 1件の失敗で残りを止めない（失敗は fn の中で扱うか無視する）。signal が中断されたら次を始めない。
 */
export async function forEachLimit<T>(
	items: readonly T[],
	limit: number,
	fn: (item: T) => Promise<unknown>,
	signal?: AbortSignal,
): Promise<void> {
	let next = 0;
	const worker = async () => {
		while (next < items.length && !signal?.aborted) {
			const item = items[next++];
			try {
				await fn(item);
			} catch {
				// 1件の失敗（中断を含む）で他を止めない
			}
		}
	};
	await Promise.all(
		Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker),
	);
}
