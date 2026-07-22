let studioPromise: Promise<any> | null = null;

export const getStudio = (): Promise<any> => {
  if (!studioPromise) {
    studioPromise = (async () => {
      const { createDtmStudio } = await import('@onjmin/dtm');
      return createDtmStudio({
        midiSearch: { apiKey: process.env.RPGEN_SEARCH_TOKEN },
      });
    })();
  }
  return studioPromise;
};
