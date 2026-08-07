import type { DtmStudio } from "@onjmin/dtm";

let studioPromise: Promise<DtmStudio> | null = null;

export const getStudio = (): Promise<DtmStudio> => {
	if (!studioPromise) {
		studioPromise = (async () => {
			const { createDtmStudio } = await import("@onjmin/dtm");
			return createDtmStudio({
				midiSearch: {
					apiKey: process.env.NEXT_PUBLIC_RPGEN_SEARCH_TOKEN || "",
				},
			});
		})();
	}
	return studioPromise;
};
