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
