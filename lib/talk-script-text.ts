// かけあい動画の台本をテキストで入出力する。設計: docs/talk-video-feature-design.md §6.1
//
// 書式（1 行 = 1 セリフ。書き出しは「」形、読みは「話者: 本文」形も受け付ける）:
//
//   ボケ「こんにちは」
//   ツッコミ(おこり, 間0.8)「なんでやねん」
//   ボケ「一行目
//     二行目（閉じ括弧 」 が来るまで同じセリフの続き）」
//   ボケ: コロン形でも書ける
//     行頭の空白 = 直前のセリフの続き
//   話者を書かない行は前の行と別の話者になる
//   # 先頭が # か // の行はコメント
//
// 話者の後の括弧に、表情（ふつう/うれしい/かなしい/おこり/おどろき か英語値）、
// 声（声:happy）、間（間0.5 / 0.5秒 / 0.5s）を「,」「、」空白区切りで並べる。
// 字幕だけ変えたいときは「本文 ｜ 字幕」。
// 話者は登場人物の名前で引く（無い名前は新しいキャラとして足す）。

import {
	DEFAULT_TALK_GAP_SEC,
	TALK_EXPRESSIONS,
	type TalkCharacter,
	type TalkCue,
	type TalkEmotion,
	type TalkExpression,
	type TalkManifest,
} from "./talk-config";

const EMOTIONS: ReadonlyArray<{ value: TalkEmotion; label: string }> = [
	{ value: "neutral", label: "ふつう" },
	{ value: "happy", label: "うれしい" },
	{ value: "sad", label: "かなしい" },
	{ value: "angry", label: "おこり" },
];

const expressionLabel = (v: TalkExpression): string => TALK_EXPRESSIONS.find((o) => o.value === v)?.label ?? v;
const emotionLabel = (v: TalkEmotion): string => EMOTIONS.find((o) => o.value === v)?.label ?? v;

const parseExpression = (s: string): TalkExpression | undefined =>
	TALK_EXPRESSIONS.find((o) => o.value === s || o.label === s)?.value;
const parseEmotion = (s: string): TalkEmotion | undefined =>
	EMOTIONS.find((o) => o.value === s || o.label === s)?.value;

const fmtNum = (n: number): string => String(Math.round(n * 100) / 100);

/** 台本（cues）をテキストにする。話者はキャラの名前で書く。 */
export const talkManifestToScriptText = (manifest: TalkManifest): string => {
	const nameOf = (id: string): string => {
		const c = manifest.characters.find((x) => x.id === id);
		return (c?.name || c?.id || id).trim() || "?";
	};
	const lines: string[] = [];
	for (const cue of manifest.cues) {
		const attrs: string[] = [];
		if (cue.expression && cue.expression !== "neutral") attrs.push(expressionLabel(cue.expression));
		if (cue.emotion) attrs.push(`声:${emotionLabel(cue.emotion)}`);
		if (cue.gapSec !== undefined && cue.gapSec !== DEFAULT_TALK_GAP_SEC) attrs.push(`間${fmtNum(cue.gapSec)}`);
		const head = `${nameOf(cue.speaker)}${attrs.length ? `(${attrs.join(", ")})` : ""}`;
		const body = cue.subtitle?.trim() ? `${cue.text} ｜ ${cue.subtitle.trim()}` : cue.text;
		const [first = "", ...rest] = body.split(/\r?\n/);
		if (rest.length === 0) {
			lines.push(`${head}「${first}」`);
			continue;
		}
		lines.push(`${head}「${first}`);
		rest.forEach((r, i) => lines.push(`  ${r}${i === rest.length - 1 ? "」" : ""}`));
	}
	return lines.join("\n");
};

export interface TalkScriptParseResult {
	cues: TalkCue[];
	/** 台本に出てきたが登場人物に無かった名前（順不同ではなく出現順）。取り込むときに新しいキャラとして足す。 */
	newSpeakers: string[];
	/** 読めなかった属性など。行番号は 1 始まり。 */
	warnings: string[];
}

interface ParsedHead {
	speaker: string;
	attrs: string;
	text: string;
	/** 「 を開いたまま行が終わった（閉じ括弧 」 の行まで本文が続く）。 */
	open: boolean;
}

// 「話者(属性): 本文」「話者（属性）：本文」「話者(属性)「本文」」「話者(属性)「本文の途中…」
// 開いたままの形は行内に 」 が無いときだけ（「彼は「はい」と言った」のような地の文を話者にしない）。
const HEAD_RE = /^([^:：「()（）]{1,40}?)\s*(?:[(（]([^)）]*)[)）])?\s*(?:[:：]\s*(.*)|「(.*)」|「([^」]*))$/;

/**
 * 行頭の「話者(属性): 」を読む。知らない名前は短くて空白を含まないときだけ話者と見なす
 * （「URLは https://…」のような地の文を話者にしない）。
 */
const parseHead = (line: string, known: ReadonlySet<string>): ParsedHead | null => {
	const m = HEAD_RE.exec(line);
	if (!m) return null;
	const speaker = m[1].trim();
	if (!speaker) return null;
	if (!known.has(speaker) && (speaker.length > 16 || /\s/.test(speaker))) return null;
	return { speaker, attrs: m[2] ?? "", text: (m[3] ?? m[4] ?? m[5] ?? "").trim(), open: m[5] !== undefined };
};

const splitSubtitle = (text: string): { text: string; subtitle?: string } => {
	const i = text.search(/[|｜]/);
	if (i < 0) return { text };
	const subtitle = text.slice(i + 1).trim();
	if (!subtitle) return { text };
	return { text: text.slice(0, i).replace(/\s+$/, ""), subtitle };
};

const parseAttrs = (attrs: string, lineNo: number, warnings: string[]): Partial<TalkCue> => {
	const out: Partial<TalkCue> = {};
	for (const raw of attrs.split(/[,、\s]+/)) {
		const tok = raw.trim();
		if (!tok) continue;
		const expr = parseExpression(tok);
		if (expr) {
			if (expr !== "neutral") out.expression = expr;
			continue;
		}
		const emo = /^(?:声|voice|emotion)\s*[:：=]\s*(.+)$/i.exec(tok);
		if (emo) {
			const e = parseEmotion(emo[1].trim());
			if (e) out.emotion = e;
			else warnings.push(`${lineNo} 行目: 声「${emo[1]}」が分かりません`);
			continue;
		}
		const gap = /^(?:間|gap)\s*[:：=]?\s*([\d.]+)\s*(?:秒|s)?$/i.exec(tok) ?? /^([\d.]+)\s*(?:秒|s)$/i.exec(tok);
		if (gap) {
			const n = Number(gap[1]);
			if (Number.isFinite(n) && n >= 0) out.gapSec = Math.min(5, n);
			else warnings.push(`${lineNo} 行目: 間「${gap[1]}」が数字ではありません`);
			continue;
		}
		warnings.push(`${lineNo} 行目: 「${tok}」は表情でも間でもありません`);
	}
	return out;
};

const newCueId = () => `c_${Math.random().toString(36).slice(2, 8)}`;

/**
 * テキストを台本（cues）に読む。話者は登場人物の名前（無ければ id）で引く。
 * 見つからない名前は `newSpeakers` に集め、cue.speaker にはその名前をそのまま入れる
 * （取り込む側が {@link applyTalkScriptText} でキャラを足して id に差し替える）。
 * `id` / `measuredSec` は、同じ話者・同じ本文の既存の行があればそこから引き継ぐ。
 */
export const parseTalkScriptText = (text: string, manifest: TalkManifest): TalkScriptParseResult => {
	const warnings: string[] = [];
	const newSpeakers: string[] = [];
	const idByName = new Map<string, string>();
	for (const c of manifest.characters) {
		idByName.set(c.id, c.id);
		const name = c.name.trim();
		if (name && !idByName.has(name)) idByName.set(name, c.id);
	}
	const known: ReadonlySet<string> = new Set(idByName.keys());
	const resolveSpeaker = (name: string): string => {
		const id = idByName.get(name);
		if (id) return id;
		if (!newSpeakers.includes(name)) newSpeakers.push(name);
		return name;
	};

	const cues: TalkCue[] = [];
	const lines = text.replace(/\r\n?/g, "\n").split("\n");
	const append = (cue: TalkCue, line: string) => {
		cue.text = cue.text ? `${cue.text}\n${line}` : line;
	};
	/** 「 を開いたまま続いているセリフ。 */
	let openCue: TalkCue | null = null;
	lines.forEach((rawLine, i) => {
		const lineNo = i + 1;
		const trimmed = rawLine.trim();
		// 「 が開いている間は、閉じ括弧 」 で終わる行まで本文の続き（コメント行も本文）
		if (openCue) {
			if (trimmed.endsWith("」")) {
				const body = trimmed.slice(0, -1).trim();
				if (body) append(openCue, body);
				openCue = null;
			} else if (trimmed) {
				append(openCue, trimmed);
			}
			return;
		}
		if (!trimmed) return;
		if (/^(#|\/\/)/.test(trimmed)) return;
		const last = cues[cues.length - 1];
		// 行頭が空白なら直前のセリフの続き
		if (/^\s/.test(rawLine) && last) {
			append(last, trimmed);
			return;
		}
		const head = parseHead(trimmed, known);
		if (head) {
			const speaker = resolveSpeaker(head.speaker);
			const attrs = parseAttrs(head.attrs, lineNo, warnings);
			const cue: TalkCue = { id: newCueId(), speaker, text: head.text, ...attrs };
			cues.push(cue);
			if (head.open) openCue = cue;
			return;
		}
		// 話者なし: 直前と別の話者（掛け合いなので交互）。最初の行なら先頭のキャラ。
		const chars = manifest.characters;
		let speaker = chars[0]?.id ?? "";
		if (last) speaker = chars.find((c) => c.id !== last.speaker)?.id ?? last.speaker;
		const bare = /^「(.*)」$/.exec(trimmed);
		cues.push({ id: newCueId(), speaker, text: bare ? bare[1].trim() : trimmed });
	});

	// 「本文 ｜ 字幕」は続きの行まで足してから分ける（字幕は最後の行に書かれる）
	for (const c of cues) {
		const body = splitSubtitle(c.text);
		c.text = body.text;
		if (body.subtitle) c.subtitle = body.subtitle;
	}

	// 同じ話者・同じ本文の行からは id と計測値を引き継ぐ（未変更の行の measuredSec を捨てない）
	const pool = new Map<string, TalkCue[]>();
	for (const c of manifest.cues) {
		const k = `${c.speaker}\n${c.text}`;
		const arr = pool.get(k);
		if (arr) arr.push(c);
		else pool.set(k, [c]);
	}
	for (const c of cues) {
		const prev = pool.get(`${c.speaker}\n${c.text}`)?.shift();
		if (!prev) continue;
		c.id = prev.id;
		if (prev.measuredSec !== undefined && (prev.emotion ?? "") === (c.emotion ?? "") && (prev.expression ?? "") === (c.expression ?? "")) {
			c.measuredSec = prev.measuredSec;
		}
	}

	return { cues, newSpeakers, warnings };
};

const NEW_CHAR_COLORS = ["#fde68a", "#86efac", "#c4b5fd", "#fdba74", "#67e8f9"];

/**
 * 読んだ台本を manifest に当てる。`newSpeakers` は、既定の見た目（絵文字）と先頭キャラの声を
 * 写した新しいキャラとして足し、左右は交互にする。
 */
export const applyTalkScriptText = (manifest: TalkManifest, parsed: TalkScriptParseResult): TalkManifest => {
	const characters = [...manifest.characters];
	const idOfNew = new Map<string, string>();
	parsed.newSpeakers.forEach((name, i) => {
		const base = manifest.characters[0];
		const used = new Set(characters.map((c) => c.id));
		let id = `n${i + 1}`;
		while (used.has(id)) id = `n${Math.random().toString(36).slice(2, 6)}`;
		const lefts = characters.filter((c) => c.side === "left").length;
		const rights = characters.length - lefts;
		const side: TalkCharacter["side"] = lefts <= rights ? "left" : "right";
		characters.push({
			id,
			name,
			color: NEW_CHAR_COLORS[i % NEW_CHAR_COLORS.length],
			side,
			scale: 1,
			y: 0,
			...(side === "right" ? { flipH: true } : {}),
			faces: { neutral: { ref: "emoji:🙂" }, happy: { ref: "emoji:😄" }, sad: { ref: "emoji:😢" }, angry: { ref: "emoji:😠" }, surprised: { ref: "emoji:😮" } },
			voice: base ? { ...base.voice } : { model: "teto" },
		});
		idOfNew.set(name, id);
	});
	const cues = parsed.cues.map((c) => {
		const id = idOfNew.get(c.speaker);
		return id ? { ...c, speaker: id } : c;
	});
	return { ...manifest, characters, cues };
};

/** 台本テキストの書式の解説（モーダルで見せる／コピーする全文）。弾幕スクリプトの MINISCRIPT_HELP_TEXT と同じ位置づけ。 */
export const TALK_SCRIPT_HELP_TEXT = `かけあい動画の台本は、次の書式のプレーンテキストで書けます。

【基本】1 行 = 1 セリフ。「話者「本文」」の形で書きます。
ボケ「こんにちは」
ツッコミ「なんでやねん」

- 「話者: 本文」「話者：本文」の形でも読めます（コロンは半角・全角どちらでも可）。
- 空行は無視します。先頭が # か // の行はコメントです。
- 本文の漢字・数字はそのまま読み上げます（読みは自動で決まります）。

【属性】話者の直後の括弧に、「,」「、」か空白で区切って並べます（括弧は半角・全角どちらでも可）。
ツッコミ(おこり, 間0.8)「なんでやねん」
- 表情: ふつう / うれしい / かなしい / おこり / おどろき（英語 neutral / happy / sad / angry / surprised も可）。省略時は「ふつう」。
- 声の感情: 声:うれしい のように書きます（ふつう / うれしい / かなしい / おこり）。省略時は表情から自動で決まるので、ふつうは書きません。
- 間: 間0.8 / 0.8秒 / 0.8s（この行の後に空ける秒数、0〜5）。省略時は 0.35 秒。

【複数行の本文】「 を閉じずに行を終えると、」 で終わる行まで同じセリフの続きになります。
ボケ「一行目
  二行目」
- 「話者: 本文」の形では、行頭に空白を置いた行が直前のセリフの続きになります。

【話者を書かない行】直前の行と別の話者のセリフになります（掛け合いなので交互）。
【字幕だけ変える】本文の後に ｜ を置いて字幕を書きます（読み上げは ｜ の前）。
ボケ「読み上げる本文 ｜ 画面に出す字幕」

【登場人物】話者は「キャラ」タブの名前で引きます。無い名前を書くと、その名前の新しいキャラが自動で追加されます。`;

/**
 * チャット AI（ChatGPT / Claude 等）に台本を書いてもらうためのコピペ用プロンプト。
 * 登場人物の名前と現在の台本を埋め込むので、そのまま貼ってテーマを書き足せば使える。
 */
export const buildTalkScriptAiPrompt = (manifest: TalkManifest): string => {
	const chars = manifest.characters.map((c) => `- ${c.name.trim() || c.id}（${c.side === "left" ? "左" : "右"}側）`).join("\n");
	const current = talkManifestToScriptText({ ...manifest, cues: manifest.cues.filter((c) => c.text.trim()) }).trim();
	return `あなたは 2 人のキャラクターが掛け合いで話す解説動画（漫才形式）の台本を書く放送作家です。
以下の書式で、指定したテーマの台本を書いてください。

# 台本の書式
${TALK_SCRIPT_HELP_TEXT}

# 登場人物（この名前をそのまま話者に使ってください。増やさないでください）
${chars || "- （登場人物が未設定です。名前を 2 つ決めて使ってください）"}
${current ? `\n# 現在の台本（続きを書く・書き直す場合の参考。不要なら無視してください）\n${current}\n` : ""}
# 依頼内容
- テーマ・伝えたいこと:（ここに自由に書いてください。例：「ログイン不要の匿名 SNS の魅力を紹介する」）
- 雰囲気:（例：「ボケが天然でツッコミが冷静」「テンポよく短い掛け合い」など）
- 長さの目安:（例：「20 行くらい」「1 分程度」。1 行は 1 セリフで、だいたい 3〜4 秒です）

# 出力形式
- 説明文は不要です。台本のテキストだけをコードブロックで出力してください。
- 1 行 1 セリフ、「話者「本文」」の形で書き、話者は上の登場人物の名前だけを使ってください。
- 1 セリフは 1〜2 文（40 文字程度まで）にし、長い説明は複数のセリフに分けてください。
- 表情は変化があるところにだけ付け、間は必要なところにだけ付けてください。
- そのまま「台本をテキストで編集」の欄に貼り付けて使います。`;
};
