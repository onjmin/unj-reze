// かけあい動画の見本台本。設計: docs/talk-video-feature-design.md §6
//
// MV の見本（components/mv-presets/）と同じ位置づけ。「まず見本を選んで、セリフと絵を
// 差し替えれば完成」の入口にする。立ち絵は絵文字（emoji: 参照）なので何も選ばなくても動く。
// 台本の書き方の手本も兼ねるので、表情・話し方・間の使い分けを意図的に入れてある。
// 各行の style は「この行だけ」の指定で、無い行はキャラの voice.style に従う。

import { DEFAULT_VOICE_MODEL } from "./game-voice";
import {
	createDefaultTalkStage,
	type TalkCharacter,
	type TalkCue,
	type TalkManifest,
} from "./talk-config";

export interface TalkPresetEntry {
	name: string;
	description: string;
	build: () => TalkManifest;
}

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

/** 絵文字だけの立ち絵（表情ぶん）。 */
const emojiFaces = (
	neutral: string,
	rest: Partial<Record<"happy" | "sad" | "angry" | "surprised", string>> = {},
): TalkCharacter["faces"] => ({
	neutral: { ref: `emoji:${neutral}` },
	...(rest.happy ? { happy: { ref: `emoji:${rest.happy}` } } : {}),
	...(rest.sad ? { sad: { ref: `emoji:${rest.sad}` } } : {}),
	...(rest.angry ? { angry: { ref: `emoji:${rest.angry}` } } : {}),
	...(rest.surprised ? { surprised: { ref: `emoji:${rest.surprised}` } } : {}),
});

const leftChar = (id: string, name: string, color: string, faces: TalkCharacter["faces"], voice: TalkCharacter["voice"]): TalkCharacter => ({
	id,
	name,
	color,
	side: "left",
	scale: 1,
	y: 0,
	faces,
	voice,
});
const rightChar = (id: string, name: string, color: string, faces: TalkCharacter["faces"], voice: TalkCharacter["voice"]): TalkCharacter => ({
	...leftChar(id, name, color, faces, voice),
	side: "right",
	flipH: true,
});

/** 台本を短く書くための行ビルダ。`[話者, 本文, 属性]`。 */
type Line = [speaker: string, text: string, attrs?: Omit<TalkCue, "id" | "speaker" | "text">];
const cues = (lines: Line[]): TalkCue[] =>
	lines.map(([speaker, text, attrs]) => ({ id: newId("c"), speaker, text, ...(attrs ?? {}) }));

/** 何も入っていない台本（キャラ 2 人と空行 2 本）。新規作成の既定。 */
export const createDefaultTalkManifest = (): TalkManifest => ({
	version: 1,
	title: "",
	stage: createDefaultTalkStage(),
	characters: [
		leftChar("a", "ボケ", "#f9a8d4", emojiFaces("🐱", { happy: "😸", sad: "😿", angry: "😾", surprised: "🙀" }), { model: DEFAULT_VOICE_MODEL, style: "lively" }),
		rightChar("b", "ツッコミ", "#93c5fd", emojiFaces("🐶", { happy: "🐕", angry: "🐺" }), { model: "teto", pitchOffset: -2, style: "calm" }),
	],
	cues: [
		{ id: newId("c"), speaker: "a", text: "" },
		{ id: newId("c"), speaker: "b", text: "" },
	],
});

const INTRO_PRESET: TalkPresetEntry = {
	name: "うんｊレゼって なに？",
	description: "このサイトの紹介。ねこが説明して、いぬが突っ込む基本の掛け合い。表情と間の付け方の見本。",
	build: () => ({
		version: 1,
		title: "うんｊレゼって なに？",
		stage: createDefaultTalkStage(),
		characters: [
			leftChar("boke", "ねこ", "#f9a8d4", emojiFaces("🐱", { happy: "😸", sad: "😿", angry: "😾", surprised: "🙀" }), { model: DEFAULT_VOICE_MODEL, style: "lively" }),
			rightChar("tsukkomi", "いぬ", "#93c5fd", emojiFaces("🐶", { happy: "🐕", angry: "🐺" }), { model: "teto", pitchOffset: -2, style: "calm" }),
		],
		cues: cues([
			["boke", "ねえねえ、うんｊレゼって知ってる？", { expression: "happy" }],
			["tsukkomi", "知らん。なにそれ。"],
			["boke", "ログインなしで使える、ゲームもつくれるエスエヌエスだよ。", { expression: "happy" }],
			["tsukkomi", "ログインなしって、だれが誰だか分からんやろ。", { expression: "angry" }],
			["boke", "それがいいんだって。名無しで気楽に投稿できるの。", { expression: "surprised" }],
			["tsukkomi", "なるほど。で、この動画もそこで作ったんか。"],
			["boke", "そう。台本を書いただけで、声も口パクも自動。", { expression: "happy", gapSec: 0.6 }],
			["tsukkomi", "便利やな。おわり。", { expression: "happy" }],
		]),
	}),
};

const HOWTO_PRESET: TalkPresetEntry = {
	name: "かけあい動画の作り方",
	description: "この機能の使い方を、先輩と後輩の会話で説明する。話し方を行ごとに変える見本（後輩が最後に落ち着く）。",
	build: () => ({
		version: 1,
		title: "かけあい動画の作り方",
		stage: { ...createDefaultTalkStage(), bgColor: "#1f2a1e" },
		characters: [
			leftChar("kohai", "後輩", "#fde68a", emojiFaces("🧑‍🎓", { happy: "😆", sad: "😩", angry: "😤", surprised: "😳" }), { model: DEFAULT_VOICE_MODEL, style: "lively" }),
			rightChar("senpai", "先輩", "#a5b4fc", emojiFaces("👩‍🏫", { happy: "😊", angry: "😑" }), { model: "roze", style: "calm" }),
		],
		cues: cues([
			["kohai", "先輩、この動画ってどうやって作るんですか？", { expression: "surprised" }],
			["senpai", "台本タブに、セリフを一行ずつ書くだけよ。"],
			["kohai", "えっ、声は？ 録音するんですか？", { expression: "surprised" }],
			["senpai", "いらない。書いた文を自動で読み上げてくれるの。", { expression: "happy" }],
			["kohai", "すごい。口パクも勝手に動いてる！", { expression: "happy" }],
			["senpai", "行ごとに表情と話し方を変えられるから、使い分けてみて。"],
			["kohai", "たとえば、こうやって、しずかにしゃべったり。", { style: "calm", gapSec: 0.6 }],
			["kohai", "こうやって、元気にしゃべったり！", { expression: "happy", style: "lively" }],
			["senpai", "そうそう。キャラタブで絵と声も差し替えられるわ。", { expression: "happy" }],
			["kohai", "絵はどこから持ってくるんですか？"],
			["senpai", "投稿した画像でも、絵文字でもいいの。まずは絵文字で試すと早いわよ。"],
			["kohai", "分かりました。できたら投稿に添付、ですね。", { expression: "happy" }],
			["senpai", "そのとおり。長い説明は、短いセリフに分けるのがコツよ。", { gapSec: 0.5 }],
			["kohai", "はい！ さっそく作ってきます！", { expression: "happy", style: "lively" }],
		]),
	}),
};

const GAME_PRESET: TalkPresetEntry = {
	name: "ゲームを作ってみよう",
	description: "ゲーム作成機能の紹介。勇者とスライムの会話で、ゲームの遊び方や作り方を案内する。",
	build: () => ({
		version: 1,
		title: "ゲームを作ってみよう",
		stage: { ...createDefaultTalkStage(), bgColor: "#16213e", subtitle: { style: "band", fontSize: 22, color: "#ffffff", outline: "#000000" } },
		characters: [
			leftChar("hero", "勇者", "#fca5a5", emojiFaces("🧝", { happy: "😁", sad: "😥", angry: "😠", surprised: "😲" }), { model: "teto", style: "lively" }),
			rightChar("slime", "スライム", "#86efac", emojiFaces("👾", { happy: "😈", sad: "😢", surprised: "😱" }), { model: DEFAULT_VOICE_MODEL, pitchOffset: 3, style: "lively" }),
		],
		cues: cues([
			["hero", "この村、なにもないな。", { expression: "sad" }],
			["slime", "そりゃそうよ。まだ誰も作ってないもん。", { expression: "happy" }],
			["hero", "作ってない？ ゲームって作れるのか？", { expression: "surprised" }],
			["slime", "投稿画面から、ゲーム作成を選ぶだけよ。"],
			["hero", "マップも、イベントも？"],
			["slime", "全部。ドット絵も描けるし、音楽も作れる。", { expression: "happy" }],
			["hero", "じゃあ、お前を倒すイベントも作れるってことか。", { expression: "happy", style: "calm" }],
			["slime", "ちょっと、それは聞いてない。", { expression: "surprised", gapSec: 0.7 }],
			["hero", "冗談だ。一緒に村を作ろう。", { expression: "happy" }],
			["slime", "できたら投稿してね。みんなが遊びに来るから。", { expression: "happy" }],
		]),
	}),
};

const MANZAI_PRESET: TalkPresetEntry = {
	name: "漫才のひな形",
	description: "テーマを決めて書き直すための漫才の型。つかみ・ボケ・ツッコミ・オチの流れと、間の取り方の見本。",
	build: () => ({
		version: 1,
		title: "きょうのおやつ",
		stage: createDefaultTalkStage(),
		characters: [
			leftChar("a", "ボケ", "#f9a8d4", emojiFaces("🐱", { happy: "😸", sad: "😿", angry: "😾", surprised: "🙀" }), { model: DEFAULT_VOICE_MODEL, style: "lively" }),
			rightChar("b", "ツッコミ", "#93c5fd", emojiFaces("🐶", { happy: "🐕", angry: "🐺" }), { model: "teto", pitchOffset: -2, style: "calm" }),
		],
		cues: cues([
			["a", "どうも、よろしくおねがいします。", { expression: "happy" }],
			["b", "おねがいします。"],
			["a", "最近、おやつにハマってまして。"],
			["b", "ええやん。なに食べてるん。"],
			["a", "石。", { style: "calm", gapSec: 0.8 }],
			["b", "石はおやつちゃう。", { expression: "angry" }],
			["a", "でもね、よく噛むと甘いんですよ。", { expression: "happy" }],
			["b", "噛めてないやろ。歯が負けてるやろ。", { expression: "angry", style: "lively" }],
			["a", "じゃあ、次からはやわらかい石にします。", { expression: "sad" }],
			["b", "石から離れろ。", { gapSec: 0.6 }],
			["a", "もういいよ。", { expression: "happy" }],
			["b", "ありがとうございました。", { expression: "happy" }],
		]),
	}),
};

const BLANK_PRESET: TalkPresetEntry = {
	name: "まっさら",
	description: "キャラ 2 人と空の台本だけ。自分で最初から書くとき。",
	build: createDefaultTalkManifest,
};

/** 先頭が新規作成の既定の見本。 */
export const TALK_PRESETS: TalkPresetEntry[] = [INTRO_PRESET, HOWTO_PRESET, GAME_PRESET, MANZAI_PRESET, BLANK_PRESET];

export const findTalkPresetByName = (name: string): TalkPresetEntry | undefined =>
	TALK_PRESETS.find((p) => p.name === name);
