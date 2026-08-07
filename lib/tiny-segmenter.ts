// @ts-expect-error tiny-segmenter has no type definitions
import TinySegmenter from "tiny-segmenter";

const segmenter = new TinySegmenter();

/** 日本語テキストを形態素（単語）単位に分割する。改行ロジックの単語単位グルーピングに使う。 */
export function segment(input: string): string[] {
	if (!input) return [];
	return segmenter.segment(input);
}
