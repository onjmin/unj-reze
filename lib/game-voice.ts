// ゲームのメッセージウィンドウ読み上げ（@onjmin/dtm の studio.speak ＝ koe UtauTTS）。
//
// - 音は BGM/SFX と同じ共有 studio（getStudio）で鳴らすので、サイト全体の音量に従う。
// - 初回は TTS アセット約 45MB を取得する。プレイ開始時に prepareGameVoice() で先に
//   取っておき、最初のセリフで待たせない（2 回目以降は Cache API から一瞬）。
// - 頭上 1 文字ずつ表示との同期はしない。ウィンドウが出たら鳴らし、閉じたら止めるだけ。
// - 鳴らし方は `awaitRender: "first-chunk"`（最初のチャンクが出来てから頭から鳴らす。合成が
//   追いつかなければ後ろをずらす＝`lateChunks: "shift"`）。既定（false）は合成が間に合わないと
//   セリフの頭が欠ける（遅い音源では行の大半が欠けた）。

import type { SpeechHandle, VoiceModelGroup } from "@onjmin/dtm";
import type {
	EventCommand,
	EventPage,
	MessageVoice,
	MessageVoiceEmotion,
	MessageVoiceStyle,
	PresetData,
} from "@/components/game-presets/shared";
import { getStudio, speechMinBufferSec } from "./dtm";

export type { SpeechHandle };

/** 音源選択 UI の大分類（`<optgroup>` 1 つぶん）。dtm の型をそのまま使う。 */
export type { VoiceModelGroup } from "@onjmin/dtm";

/**
 * 音源一覧を大分類（kusaプリセット / おんJ / 一般 / クッキー☆ …）に分けて返す。
 * 分類表も分け方も dtm 側（`groupVoiceModels`）が持つ——音源を増やすのは dtm なので、
 * こちらに写すと増えた音源が「その他」に落ちたきり誰も直さない。
 * klatt（軽量ロボ声）は語れないので、読み上げ用の一覧には最初から入らない。
 */
export const loadVoiceModelGroups = async (): Promise<VoiceModelGroup[]> => {
	const { KOE_VOICEBANK_NAMES, groupVoiceModels } = await import("@onjmin/dtm");
	return groupVoiceModels(KOE_VOICEBANK_NAMES);
};

/** 既定の音源（dtm の DEFAULT_SPEECH_MODEL と同じ値。静的 import を避けるため文字列で持つ）。 */
export const DEFAULT_VOICE_MODEL = "tsukuyomi";

/** 感情の選択肢と表示名（dtm の SpeechEmotion）。 */
export const VOICE_EMOTIONS: ReadonlyArray<{
	value: MessageVoiceEmotion;
	label: string;
}> = [
	{ value: "neutral", label: "ふつう" },
	{ value: "happy", label: "うれしい" },
	{ value: "sad", label: "かなしい" },
	{ value: "angry", label: "おこり" },
];

/** 話し方の選択肢と表示名（koe の SpeakingStyleName）。 */
export const VOICE_STYLES: ReadonlyArray<{
	value: MessageVoiceStyle;
	label: string;
}> = [
	{ value: "neutral", label: "ふつう" },
	{ value: "calm", label: "おだやか（朗読調）" },
	{ value: "lively", label: "いきいき" },
];

/** ゲームが読み上げに必要とするもの（先取り用）。 */
export interface VoiceNeeds {
	models: string[];
	emotions: MessageVoiceEmotion[];
}

/** コマンド列を入れ子（選択肢・条件分岐）まで辿る。 */
const forEachCommand = (
	commands: EventCommand[] | undefined,
	visit: (cmd: EventCommand) => void,
): void => {
	if (!commands) return;
	for (const cmd of commands) {
		visit(cmd);
		if (cmd.type === "choice") {
			for (const ch of cmd.choices) forEachCommand(ch.commands, visit);
		} else if (
			cmd.type === "ifSwitch" ||
			cmd.type === "ifItem" ||
			cmd.type === "ifGold"
		) {
			forEachCommand(cmd.then, visit);
			forEachCommand(cmd.else, visit);
		}
	}
};

/** ゲーム全体（全シーン・全イベントページ・yume25d ビルボード）で使われている読み上げ音源と感情の一覧。 */
export const collectVoiceNeeds = (gameData: PresetData): VoiceNeeds => {
	const models = new Set<string>();
	const emotions = new Set<MessageVoiceEmotion>();
	const visit = (cmd: EventCommand) => {
		if (cmd.type !== "message" || !cmd.voice?.model) return;
		models.add(cmd.voice.model);
		if (cmd.voice.emotion && cmd.voice.emotion !== "neutral") {
			emotions.add(cmd.voice.emotion);
		}
	};
	const scanPaged = (
		items: ReadonlyArray<{ pages?: EventPage[] }> | undefined,
	) => {
		for (const it of items ?? []) {
			for (const page of it.pages ?? []) forEachCommand(page.commands, visit);
		}
	};
	scanPaged(gameData.objects);
	for (const scene of gameData.scenes ?? []) scanPaged(scene.objects);
	scanPaged(gameData.layout25d?.billboards);
	return { models: [...models], emotions: [...emotions] };
};

/**
 * 読み上げに必要なもの（TTS アセット＋音源マニフェスト＋感情モデル）を先に取る。
 * 失敗しても投げない（声が出ないだけでゲームは進む）。
 */
export const prepareGameVoice = async (
	needs: VoiceNeeds,
	onProgress?: (loaded: number, total: number) => void,
): Promise<void> => {
	if (needs.models.length === 0) return;
	try {
		const studio = await getStudio();
		await studio.prepareSpeech(needs.models, {
			emotions: needs.emotions,
			onProgress,
		});
	} catch (e) {
		console.warn("[game-voice] 読み上げの準備に失敗しました", e);
	}
};

/**
 * 1 つのメッセージを読み上げる。計画できない本文や音源ロード失敗は null。
 * ユーザー操作の延長（イベント実行中）から呼ばれる前提。
 */
export const speakGameMessage = async (
	text: string,
	voice: MessageVoice,
	signal?: AbortSignal,
): Promise<SpeechHandle | null> => {
	const body = text.trim();
	if (!body) return null;
	try {
		const studio = await getStudio();
		return await studio.speak(body, {
			model: voice.model,
			pitchOffset: voice.pitchOffset ?? 0,
			emotion: voice.emotion ?? "neutral",
			style: voice.style ?? "neutral",
			// 頭を欠かさず、最初のチャンクが出来しだい鳴らす（遅れた後続は後ろへずらす）。
			awaitRender: "first-chunk",
			lateChunks: "shift",
			minBufferSec: speechMinBufferSec(voice.model),
			signal,
		});
	} catch (e) {
		console.warn("[game-voice] 読み上げに失敗しました", e);
		return null;
	}
};
