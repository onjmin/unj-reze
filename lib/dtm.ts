
const SOUNDFONT_CDN = {
  soundFont: 'https://rpgen3.github.io/soundfont/mjs/surikov/SoundFont.mjs',
  soundFontDrum: 'https://rpgen3.github.io/soundfont/mjs/surikov/SoundFont_drum.mjs',
  soundFontList: 'https://rpgen3.github.io/soundfont/mjs/surikov/SoundFont_list.mjs',
};

// Turbopack/Webpack は import(変数) を静的解析できないため、バンドラから不可視な動的 import を使う。
const runtimeImport = new Function('url', 'return import(url)') as (
  url: string,
) => Promise<Record<string, unknown>>;

async function loadEngine(url: string, name: string): Promise<unknown> {
  const mod = await runtimeImport(url);
  return mod[name] ?? mod.default;
}

let studioPromise: Promise<any> | null = null;

export const getStudio = (): Promise<any> => {
  if (!studioPromise) {
    studioPromise = (async () => {
      const [SoundFont, SoundFont_drum, SoundFont_list] = await Promise.all([
        loadEngine(SOUNDFONT_CDN.soundFont, 'SoundFont'),
        loadEngine(SOUNDFONT_CDN.soundFontDrum, 'SoundFont_drum'),
        loadEngine(SOUNDFONT_CDN.soundFontList, 'SoundFont_list'),
      ]);
      const { createDtmStudio } = await import('@onjmin/dtm');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return createDtmStudio({
        engines: { SoundFont, SoundFont_drum, SoundFont_list } as any,
        midiSearch: { apiKey: process.env.RPGEN_SEARCH_TOKEN },
      });
    })();
  }
  return studioPromise;
};
