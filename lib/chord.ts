/**
 * コード進行の本文マーカー。unjの content-schema.ts の CHORD_MARKER と同値。
 * 本文中で「ここから先はコード進行データ」を示す目印であり、getDisplayContent が
 * 自由コメント部分とコード進行データ部分を切り分けるのに使う唯一の手がかりでもある。
 * 埋め込み(ChordPlayer)を描画する際は、この目印自体も本文側に残して表示する
 * （unjのResPart.svelteが埋め込みの直前に "#コード進行" ラベルを出すのと同じ理由）。
 */
export const CHORD_MARKER = "#コード進行";

export function extractChordsFromContent(
	content: string,
): { chords: string; startLine: number } | null {
	const idx = content.indexOf(CHORD_MARKER);
	if (idx === -1) return null;
	const before = content.slice(0, idx);
	const startLine = before.split("\n").length - 1;
	const after = content.slice(idx + CHORD_MARKER.length).trim();
	return { chords: after, startLine };
}
