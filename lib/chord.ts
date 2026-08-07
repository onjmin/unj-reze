export function extractChordsFromContent(
	content: string,
): { chords: string; startLine: number } | null {
	const idx = content.indexOf("#コード進行");
	if (idx === -1) return null;
	const before = content.slice(0, idx);
	const startLine = before.split("\n").length - 1;
	const after = content.slice(idx + "#コード進行".length).trim();
	return { chords: after, startLine };
}
