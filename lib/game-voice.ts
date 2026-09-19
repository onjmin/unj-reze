// ゲームのメッセージウィンドウ読み上げ（@onjmin/dtm の studio.speak ＝ koe UtauTTS）。
//
// - 音は BGM/SFX と同じ共有 studio（getStudio）で鳴らすので、サイト全体の音量に従う。
// - 初回は TTS アセット約 45MB を取得する。プレイ開始時に prepareGameVoice() で先に
//   取っておき、最初のセリフで待たせない（2 回目以降は Cache API から一瞬）。
// - 頭上 1 文字ずつ表示との同期はしない。ウィンドウが出たら鳴らし、閉じたら止めるだけ。

import type { SpeechHandle } from "@onjmin/dtm";
import type {
	EventCommand,
	EventPage,
	MessageVoice,
	PresetData,
} from "@/components/game-presets/shared";
import { getStudio } from "./dtm";

export type { SpeechHandle };

/** 音源選択 UI 用の一覧（キーワード → 表示名）。dtm の KOE_VOICEBANK_NAMES をそのまま返す。 */
export const loadVoiceModelNames = async (): Promise<Record<string, string>> => {
	const { KOE_VOICEBANK_NAMES } = await import("@onjmin/dtm");
	return KOE_VOICEBANK_NAMES;
};

/** 既定の音源（dtm の DEFAULT_SPEECH_MODEL と同じ値。静的 import を避けるため文字列で持つ）。 */
export const DEFAULT_VOICE_MODEL = "tsukuyomi";

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

/** ゲーム全体（全シーン・全イベントページ・yume25d ビルボード）で使われている読み上げ音源のキーワード一覧。 */
export const collectVoiceModels = (gameData: PresetData): string[] => {
	const models = new Set<string>();
	const visit = (cmd: EventCommand) => {
		if (cmd.type === "message" && cmd.voice?.model) models.add(cmd.voice.model);
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
	return [...models];
};

/**
 * 読み上げに必要なもの（TTS アセット＋音源マニフェスト）を先に取る。
 * 失敗しても投げない（声が出ないだけでゲームは進む）。
 */
export const prepareGameVoice = async (
	models: string[],
	onProgress?: (loaded: number, total: number) => void,
): Promise<void> => {
	if (models.length === 0) return;
	try {
		const studio = await getStudio();
		await studio.prepareSpeech(models, { onProgress });
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
			signal,
		});
	} catch (e) {
		console.warn("[game-voice] 読み上げに失敗しました", e);
		return null;
	}
};
