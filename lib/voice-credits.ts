// ボーカル（koe の UTAU 音源）のクレジット。
//
// MV（MML の歌詞トラック @@n）とかけあい動画（TalkCharacter.voice）は、どちらも
// @onjmin/koe の UTAU 音源で声を作る。音源には配布元の利用規約があり、**再生する側にも
// 規約へ辿れる導線が要る**ので、埋め込み（MvBox / TalkBox）とエディタのプレビューに
// クレジットを出す。文言と規約 URL の対応表はライブラリ側（dtm の KOE_VOICEBANK_TERMS /
// KOE_VOICEBANK_LABELS）が持っている——音源を増やすのは dtm なので、こちらへ写さない。
//
// dtm は動的インポート必須（静的インポートは Edge/サーバー評価時にクラッシュする。
// lib/mv-engine.ts と同じ理由）。

import type { TalkManifest } from "./talk-config";

export interface VoiceCredit {
	/** 音源キー。内蔵音源なら koe のキーワード、持ち込みなら MML のキー／talkCustomVoiceKey の値。 */
	model: string;
	/** 表示名（内蔵音源は dtm の和名、持ち込みは投稿者が付けた名前）。 */
	label: string;
	/** 利用規約 URL。dtm に載っていない音源では undefined（名前だけ出す）。 */
	termsUrl?: string;
	/** 持ち込み音源（.koe の URL 指定）なら true。 */
	custom?: boolean;
}

/** 声を作らない合成モデル（規約の対象外）。 */
const SYNTH_MODELS = new Set(["klatt"]);

const sortCredits = (credits: VoiceCredit[]): VoiceCredit[] =>
	credits.sort((a, b) => a.label.localeCompare(b.label, "ja"));

/**
 * 音源キーの一覧をクレジットへ変換する。
 * `customLabels` に載っているキーは持ち込み音源として扱う（規約 URL は無い）。
 */
export async function voiceCreditsOf(
	models: Iterable<string>,
	customLabels: Record<string, string> = {},
): Promise<VoiceCredit[]> {
	const keys = [...new Set(models)].filter(
		(m) => m && !SYNTH_MODELS.has(m.toLowerCase()),
	);
	if (keys.length === 0) return [];
	const { KOE_VOICEBANK_LABELS, KOE_VOICEBANK_NAMES, KOE_VOICEBANK_TERMS } =
		await import("@onjmin/dtm");
	const out: VoiceCredit[] = [];
	for (const model of keys) {
		const key = model.toLowerCase();
		const builtin = KOE_VOICEBANK_LABELS[key] ?? KOE_VOICEBANK_NAMES[key];
		if (builtin) {
			out.push({ model: key, label: builtin, termsUrl: KOE_VOICEBANK_TERMS[key] });
			continue;
		}
		const custom = customLabels[model] ?? customLabels[key];
		if (custom !== undefined) {
			out.push({ model, label: custom || "持ち込み音源", custom: true });
		}
		// 内蔵にも持ち込みにも無いキーは、音源として鳴らないので出さない。
	}
	return sortCredits(out);
}

/**
 * MV の MML から使っている音源を拾う。
 * 歌詞トラック（`@@n モデル名 …`）のモデル名が、内蔵音源のキーワードか、
 * カスタムボーカル宣言（`@@key icon_url koe_url`）のキーのどちらか。
 */
export async function collectMvVoiceCredits(
	mml: string | undefined,
): Promise<VoiceCredit[]> {
	if (!mml?.trim()) return [];
	try {
		const dtm = await import("@onjmin/dtm");
		const customLabels: Record<string, string> = {};
		for (const def of dtm.parseCustomVocals(mml)) customLabels[def.key] = def.key;
		const lyrics = dtm.parseLyrics(dtm.stripCustomVocals(mml));
		const models = [...lyrics.values()].map((t) => t.model);
		return await voiceCreditsOf(models, customLabels);
	} catch (e) {
		console.error("[voice-credits] failed to read mml", e);
		return [];
	}
}

/** かけあい動画の登場人物から使っている音源を拾う。 */
export async function collectTalkVoiceCredits(
	manifest: TalkManifest | null | undefined,
): Promise<VoiceCredit[]> {
	if (!manifest) return [];
	const customLabels: Record<string, string> = {};
	for (const c of manifest.characters) {
		const custom = c.voice.custom;
		if (custom?.url.trim()) customLabels[c.voice.model] = custom.label.trim();
	}
	return await voiceCreditsOf(
		manifest.characters.map((c) => c.voice.model),
		customLabels,
	);
}
