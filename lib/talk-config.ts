// かけあい動画（talk）の型定義。設計: docs/talk-video-feature-design.md
//
// MV（lib/mv-config.ts）とは別の投稿種別。時間軸は台本の行で、各行の長さは読み上げの
// 計画（@onjmin/dtm の studio.planSpeech）から決まる。画像参照は MV と同じ MvAssetRef。

import type { MvBlinkSetting } from "./mv-blink";
import type { MvAssetRef, MvVowel } from "./mv-config";

export const TALK_W = 640;
export const TALK_H = 360;

/** 行と行の間（秒）の既定。 */
export const DEFAULT_TALK_GAP_SEC = 0.35;

/** 立ち絵の表情。neutral は必須で、無い表情は neutral にフォールバックする。 */
export type TalkExpression = "neutral" | "happy" | "sad" | "angry" | "surprised";
export const TALK_EXPRESSIONS: ReadonlyArray<{
	value: TalkExpression;
	label: string;
}> = [
	{ value: "neutral", label: "ふつう" },
	{ value: "happy", label: "うれしい" },
	{ value: "sad", label: "かなしい" },
	{ value: "angry", label: "おこり" },
	{ value: "surprised", label: "おどろき" },
];

/** 声の感情（dtm の SpeechEmotion と同じ値）。 */
export type TalkEmotion = "neutral" | "happy" | "sad" | "angry";
/** 話し方（koe の SpeakingStyleName と同じ値）。 */
export type TalkStyle = "neutral" | "calm" | "lively";
export const TALK_STYLES: ReadonlyArray<{ value: TalkStyle; label: string }> = [
	{ value: "neutral", label: "ふつう" },
	{ value: "calm", label: "おだやか" },
	{ value: "lively", label: "いきいき" },
];
/** 声の感情の表示名（TalkEmotion）。 */
export const TALK_EMOTIONS: ReadonlyArray<{ value: TalkEmotion; label: string }> = [
	{ value: "neutral", label: "ふつう" },
	{ value: "happy", label: "うれしい" },
	{ value: "sad", label: "かなしい" },
	{ value: "angry", label: "おこり" },
];

/** 表情から声の感情を引く（cue.emotion 省略時）。 */
export const emotionForExpression = (expr?: TalkExpression): TalkEmotion => {
	switch (expr) {
		case "happy":
		case "surprised":
			return "happy";
		case "sad":
			return "sad";
		case "angry":
			return "angry";
		default:
			return "neutral";
	}
};

export interface TalkSubtitleStyle {
	/** 下部ウィンドウ / 帯 */
	style: "window" | "band";
	fontSize: number;
	color: string;
	outline: string;
}

export interface TalkStage {
	/** 背景画像（無ければ bgColor の単色）。 */
	bg?: MvAssetRef;
	bgColor: string;
	subtitle: TalkSubtitleStyle;
}

export interface TalkEyes {
	open: MvAssetRef;
	closed: MvAssetRef;
	blink: MvBlinkSetting;
}

export interface TalkMouth {
	closed: MvAssetRef;
	open: MvAssetRef;
	/** 母音別の口。未設定の母音は open にフォールバックする。 */
	vowels?: Partial<Record<MvVowel, MvAssetRef>>;
}

/** 持ち込みの UTAU 音源（koe 形式 .koe のファイル）。 */
export interface TalkCustomVoice {
	/** .koe ファイルの URL。別オリジンなら CORS の許可が要る。 */
	url: string;
	/** 選択 UI に出す名前。 */
	label: string;
}

export interface TalkVoice {
	/**
	 * 音源のキー。内蔵音源なら koe 音源キーワード（dtm の KOE_VOICEBANK_NAMES のキー）、
	 * カスタム音源なら {@link talkCustomVoiceKey} が作ったキー（`custom_` 始まり）。
	 */
	model: string;
	/** 素の声からの半音オフセット。 */
	pitchOffset?: number;
	style?: TalkStyle;
	/** カスタム音源。あるときは model がこの音源のキー。再生前にカタログへ登録する。 */
	custom?: TalkCustomVoice;
}

export interface TalkCharacter {
	id: string;
	/** 字幕の話者名。 */
	name: string;
	/** 話者名と字幕縁の色。 */
	color: string;
	side: "left" | "right";
	/** 立ち絵の拡大率（1 = 画面高の約 6 割）。 */
	scale: number;
	/** 足元の縦オフセット px（設計座標、+で下）。 */
	y: number;
	/** 左右反転（右側のキャラを向かい合わせにするなど）。 */
	flipH?: boolean;
	/** 表情ごとの立ち絵。 */
	faces: Partial<Record<TalkExpression, MvAssetRef>> & { neutral: MvAssetRef };
	eyes?: TalkEyes;
	mouth?: TalkMouth;
	voice: TalkVoice;
}

export interface TalkCue {
	id: string;
	/** TalkCharacter.id */
	speaker: string;
	/** 読み上げと字幕の本文（漢字可。読みは jpreprocess が決める）。 */
	text: string;
	/** 立ち絵の表情。省略時 neutral。 */
	expression?: TalkExpression;
	/** 声の感情。省略時は expression から引く。 */
	emotion?: TalkEmotion;
	/** この行だけの話し方。省略時はキャラの voice.style。 */
	style?: TalkStyle;
	/** この行の後の間（秒）。省略時 DEFAULT_TALK_GAP_SEC。 */
	gapSec?: number;
	/** 字幕だけ変えたいとき（読み上げは text）。 */
	subtitle?: string;
	/** 保存時に計った読み上げ長（秒）。キャッシュであって真実ではない（再生時は再計算）。 */
	measuredSec?: number;
}

export interface TalkManifest {
	version: 1;
	title: string;
	/** 音源・素材のクレジット。 */
	credit?: string;
	stage: TalkStage;
	characters: TalkCharacter[];
	cues: TalkCue[];
	/** 任意の BGM（MML）。ループ再生し、時計にはしない。 */
	bgm?: { mml: string; volume: number };
}

export const createDefaultTalkStage = (): TalkStage => ({
	bgColor: "#1e2433",
	subtitle: {
		style: "window",
		fontSize: 22,
		color: "#ffffff",
		outline: "#000000",
	},
});

/** 読み上げが無い行の代用長（秒）。文字数 × 0.12 + 0.6。 */
export const estimateCueSec = (text: string): number =>
	Math.max(0.8, text.replace(/\s/g, "").length * 0.12 + 0.6);

/** 行の声の感情（cue.emotion 省略時は表情から）。 */
export const cueEmotion = (cue: Pick<TalkCue, "emotion" | "expression">): TalkEmotion =>
	cue.emotion ?? emotionForExpression(cue.expression);

/** 行の話し方（行の指定 → キャラの既定 → neutral）。 */
export const cueStyle = (
	cue: Pick<TalkCue, "style">,
	character: Pick<TalkCharacter, "voice"> | undefined,
): TalkStyle => cue.style ?? character?.voice.style ?? "neutral";

export const talkCharacterOf = (
	manifest: TalkManifest,
	id: string,
): TalkCharacter | undefined => manifest.characters.find((c) => c.id === id);

/**
 * カスタム音源のキー（内蔵キーワードと衝突しないよう `custom_` を付ける）。
 * ファイル名は日本語だと英数字が残らない（残っても版数だけ）ので、URL のハッシュを必ず混ぜて
 * 別の音源が同じキーにならないようにする。同じ URL なら必ず同じキーになる。
 */
export const talkCustomVoiceKey = (url: string): string => {
	let name = "";
	try {
		const path = new URL(url).pathname;
		name = decodeURIComponent(path.slice(path.lastIndexOf("/") + 1));
	} catch {
		name = "";
	}
	name = name
		.replace(/\.[^.]*$/, "")
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 24);
	let h = 0;
	for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0;
	const hash = Math.abs(h).toString(36);
	return `custom_${name ? `${name}_` : ""}${hash}`;
};

/** 台本で使われているカスタム音源（音源キー → .koe の URL）。 */
export const collectTalkCustomVoices = (
	manifest: TalkManifest,
): Record<string, string> => {
	const out: Record<string, string> = {};
	for (const c of manifest.characters) {
		const url = c.voice.custom?.url.trim();
		if (url) out[c.voice.model] = url;
	}
	return out;
};
