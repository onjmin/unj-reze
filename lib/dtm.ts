import type { DtmStudio } from "@onjmin/dtm";
import { applyMasterVolume, subscribeMasterVolume } from "./master-volume";

let studioPromise: Promise<DtmStudio> | null = null;

export const getStudio = (): Promise<DtmStudio> => {
	if (!studioPromise) {
		studioPromise = (async () => {
			const { createDtmStudio } = await import("@onjmin/dtm");
			const studio = await createDtmStudio({
				midiSearch: {
					apiKey: process.env.NEXT_PUBLIC_RPGEN_SEARCH_TOKEN || "",
				},
				masterVolume: applyMasterVolume(100),
			});
			// サイト全体の音量（読者の好み）は studio.masterGain（このstudioを共有する
			// 全ての mountEditor / mountPlayer / mountChordPlayer / playSingingMML が
			// 合流する出力段）に一本化する。曲データ側の #volume=（DawInstance.setMasterVolume /
			// mountEditor・mountPlayer の masterVolume オプション）とは完全に独立しており、
			// loadMML() 等の影響を一切受けない。曲側の値には触れないこと。
			subscribeMasterVolume(() => {
				studio.setMasterVolume(applyMasterVolume(100));
			});
			return studio;
		})();
	}
	return studioPromise;
};

/** 合成の遅い内蔵音源（最初のチャンクだけで鳴らし始めると、行の途中に間が空きやすい）。 */
const SLOW_SPEECH_MODELS: ReadonlySet<string> = new Set(["roze"]);

/**
 * セリフの読み上げ（`studio.speak` の `awaitRender: "first-chunk"`）で、鳴らし始める前に
 * 合成しておく秒数（`minBufferSec`）。最初のチャンクは数モーラしかないので、合成の遅い音源は
 * 2 つ目が間に合わず行の途中に間が空く（`lateChunks: "shift"` で後ろへずれる）。遅い音源だけ
 * 多めに貯める（鳴り出しはそのぶん遅れる）。`slow` は呼び出し側だけが知っている遅さ
 * （持ち込みの .koe は URL 配信でユニットの音を 1 つずつ取りに行くので初回が遅い）。
 */
export const speechMinBufferSec = (model: string, slow = false): number =>
	slow || SLOW_SPEECH_MODELS.has(model) ? 0.4 : 0.2;
