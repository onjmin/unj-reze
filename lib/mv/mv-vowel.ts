// 口パク（母音対応版）用の、かな1文字 → 母音 の簡易推定。
//
// 参考: https://rpgen3.github.io/ust2lab/ の考え方（歌詞の1音を五十音の行から母音へ
// 落とし込む）を、外部ソースの取得はせず一般的な五十音表として自前実装したもの。
// 厳密なUST/ローマ字変換ではなく、MvLyricLine のかな文字から現在発音中の1文字を
// 拾って母音を当てる用途に絞った近似。

import type { MvVowel } from "./mv-config";

const ROWS: [string, MvVowel][] = [
	["あかさたなはまやらわぁゃァヵ", "a"],
	["いきしちにひみりぃィ", "i"],
	["うくすつぬふむゆるぅゅゥゔ", "u"],
	["えけせてねへめれぇェヶ", "e"],
	["おこそとのほもよろをぉょォ", "o"],
	// 濁音・半濁音も同じ行の母音に揃う
	["がざだばぱ", "a"],
	["ぎじぢびぴ", "i"],
	["ぐずづぶぷ", "u"],
	["げぜでべぺ", "e"],
	["ごぞどぼぽ", "o"],
];

const VOWEL_MAP: Record<string, MvVowel> = {};
for (const [chars, vowel] of ROWS) {
	for (const ch of chars) {
		VOWEL_MAP[ch] = vowel;
		// カタカナ（コードポイント+0x60）も同じ母音にする
		VOWEL_MAP[String.fromCharCode(ch.charCodeAt(0) + 0x60)] = vowel;
	}
}
VOWEL_MAP["ん"] = "n";
VOWEL_MAP["ン"] = "n";

/**
 * かな1文字（またはローマ字1文字目）から母音を推定する。
 * 未知の文字（記号・長音符「ー」・空白など）は "n"（口を閉じる）にフォールバックする。
 */
export function estimateVowel(char: string): MvVowel {
	if (!char) return "n";
	const mapped = VOWEL_MAP[char];
	if (mapped) return mapped;
	// ローマ字書きの歌詞にもゆるく対応（先頭文字だけで判定する簡易版）
	const lower = char[0]?.toLowerCase();
	if (lower === "a" || lower === "i" || lower === "u" || lower === "e" || lower === "o")
		return lower;
	if (lower === "n") return "n";
	return "n";
}

/**
 * `MvLyricLine.text`（1行ぶんのかな）と、その行の再生位置( 0..1 )から、
 * 現在発音中とおぼしき1文字を取り出して母音を推定する。
 * 音節ごとの厳密なタイミングは持っていないため、行内での経過割合から文字位置を線形に見積もる近似。
 */
export function estimateVowelAtProgress(text: string, progress01: number): MvVowel {
	if (!text) return "n";
	const clamped = progress01 < 0 ? 0 : progress01 > 1 ? 1 : progress01;
	const idx = Math.min(text.length - 1, Math.floor(clamped * text.length));
	return estimateVowel(text[idx] ?? "");
}
