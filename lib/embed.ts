export interface EmbeddedMedia {
  type: 'image' | 'video' | 'audio' | 'game' | 'video_file';
  embedUrl: string;
  siteId: number;
  siteName: string;
  rawUrl: string;
}

export const parseImageEmbedImgur = (url: URL): string | undefined => {
  const id = url.pathname.slice(1).split(".")[0];
  if (!id) return;
  return `https://i.imgur.com/${id}.png`;
};
export const parseImageEmbedAlu = (url: URL): string | undefined => {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 4 || parts[0] !== "series" || parts[2] !== "crop")
    return;
  return `https://alu.jp/oembed?url=${encodeURIComponent(url.href)}`;
};
export const parseImageEmbedYonet = (url: URL): string | undefined => {
  const id = url.pathname.slice(1).match(/i\/(.+)\.(.+)/)?.[1];
  if (!id) return;
  return `https://funakamome.com/i/${id}.png`;
};
export const parseImageEmbedImgx = (url: URL): string | undefined => {
  const id = url.pathname.slice(1).match(/i\/(.+)\.(.+)/)?.[1];
  if (!id) return;
  return `https://imgx.site/i/${id}.png`;
};
export const parseImageEmbedImgBB = (url: URL): string | undefined => {
  const match = url.pathname.slice(1).match(/(.+)\/(.+)\.(.+)/);
  if (!match) return;
  return `https://i.ibb.co/${match[1]}/${match[2]}.png`;
};
export const parseImageEmbedNicoseiga = (url: URL): string | undefined => {
  const id = url.pathname.match(/im([0-9]+)/)?.[1];
  if (!id) return;
  return `https://lohas.nicoseiga.jp/thumb/${id}i`;
};
export const parseImageEmbedFeeder = (url: URL): string | undefined => {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[1] !== "pictures") return;
  return `https://${url.hostname}/${parts[0]}/${parts[1]}/${parts[2]}`;
};
export const parseImageEmbedPixiv = (url: URL): string | undefined => {
  const id = url.pathname.match(/[0-9]+/)?.[0];
  if (!id) return;
  return `https://embed.pixiv.net/decorate.php?illust_id=${id}`;
};
export const parseGifEmbedImgur = (url: URL): string | undefined => {
  const id = url.pathname.slice(1).split(".")[0];
  if (!id) return;
  return `https://i.imgur.com/${id}.gif`;
};
export const parseGifEmbedYonet = (url: URL): string | undefined => {
  const id = url.pathname.slice(1).match(/i\/(.+)\.(.+)/)?.[1];
  if (!id) return;
  return `https://funakamome.com/i/${id}.gif`;
};
export const parseGifEmbedImgx = (url: URL): string | undefined => {
  const id = url.pathname.slice(1).match(/i\/(.+)\.(.+)/)?.[1];
  if (!id) return;
  return `https://imgx.site/i/${id}.gif`;
};
export const parseGifEmbedImgBB = (url: URL): string | undefined => {
  const match = url.pathname.slice(1).match(/(.+)\/(.+)\.(.+)/);
  if (!match) return;
  return `https://i.ibb.co/${match[1]}/${match[2]}.gif`;
};
export const parseGifEmbedGIPHY = (url: URL): string | undefined => {
  let id = "";
  if (url.hostname === "gif.open2ch.net") {
    const last = url.pathname.split("/").at(-1);
    if (last) id = last;
  } else if (url.hostname === "giphy.com") {
    const last = url.pathname.split("/").at(-1)?.split("-").at(-1);
    if (last) id = last;
  } else if (url.hostname === "media3.giphy.com") {
    const last = url.pathname.split("/").at(-2);
    if (last) id = last;
  }
  if (!id) return;
  return `https://media3.giphy.com/media/${id}/giphy.gif`;
};
export const parseVideoEmbedYouTube = (url: URL): string | undefined => {
  const path = url.pathname;
  let id = "";

  if (url.hostname === "youtu.be") {
    id = path.slice(1);
  } else if (path.startsWith("/live/")) {
    const parts = path.split("/");
    id = parts[2];
  } else if (path.startsWith("/shorts/")) {
    const parts = path.split("/");
    id = parts[2];
  } else if (path.startsWith("/embed/")) {
    const parts = path.split("/");
    id = parts[2];
  } else {
    id = url.searchParams.get("v") || "";
  }

  if (!id) return;
  return `https://www.youtube.com/embed/${id}`;
};
export const parseVideoEmbedNicovideo = (url: URL): string | undefined => {
  const id = url.pathname.match(/sm([0-9]+)/)?.[1];
  if (!id) return;
  return `https://embed.nicovideo.jp/watch/sm${id}?jsapi=1&amp;from=0`;
};
export const parseAudioEmbedSoundCloud = (url: URL): string | undefined => {
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.href)}&visual=true`;
};
export const parseAudioEmbedSpotify = (url: URL): string | undefined => {
  const match = url.pathname.match(
    /\/(track|album|playlist)\/([a-zA-Z0-9]{22})/,
  );
  if (!match) return;
  const type = match[1];
  const id = match[2];
  return `https://open.spotify.com/embed/${type}/${id}?utm_source=generator`;
};
export const parseAudioEmbedSuno = (url: URL): string | undefined => {
  const match = url.pathname.match(/\/(song)\/([a-f0-9-]{36})/);
  if (!match) return;
  const id = match[2];
  return `https://suno.com/embed/${id}`;
};
export const parseGameEmbedRPGEN = (url: URL): string | undefined => {
  const id = url.searchParams.get("map");
  if (!id) return;
  return `https://rpgen.org/dq/?map=${id}`;
};

const parseVideoFileEmbed = (url: URL): string | undefined => {
  if (!url.pathname.match(/\.(mp4|webm|ogg)$/i)) return;
  return url.href;
};

interface SiteInfo {
  id: number;
  name: string;
  type: 'image' | 'video' | 'audio' | 'game' | 'video_file';
  parser: (url: URL) => string | undefined;
}

const sites: SiteInfo[] = [
  { id: 401, name: 'Imgur', type: 'image', parser: parseImageEmbedImgur },
  { id: 402, name: 'Nicoseiga', type: 'image', parser: parseImageEmbedNicoseiga },
  { id: 403, name: 'Pixiv', type: 'image', parser: parseImageEmbedPixiv },
  { id: 404, name: 'ALU', type: 'image', parser: parseImageEmbedAlu },
  { id: 405, name: 'Feeder', type: 'image', parser: parseImageEmbedFeeder },
  { id: 411, name: 'Yonet', type: 'image', parser: parseImageEmbedYonet },
  { id: 412, name: 'Imgx', type: 'image', parser: parseImageEmbedImgx },
  { id: 413, name: 'ImgBB', type: 'image', parser: parseImageEmbedImgBB },
  { id: 421, name: 'Gyazo', type: 'image', parser: (url) => url.href },
  { id: 431, name: 'Sketch', type: 'image', parser: (url) => url.href },
  { id: 801, name: 'Imgur GIF', type: 'image', parser: parseGifEmbedImgur },
  { id: 802, name: 'GIPHY', type: 'image', parser: parseGifEmbedGIPHY },
  { id: 811, name: 'Yonet GIF', type: 'image', parser: parseGifEmbedYonet },
  { id: 812, name: 'Imgx GIF', type: 'image', parser: parseGifEmbedImgx },
  { id: 813, name: 'ImgBB GIF', type: 'image', parser: parseGifEmbedImgBB },
  { id: 831, name: 'GIF', type: 'image', parser: (url) => url.href },
  { id: 1601, name: 'YouTube', type: 'video', parser: parseVideoEmbedYouTube },
  { id: 1602, name: 'Nicovideo', type: 'video', parser: parseVideoEmbedNicovideo },
  { id: 3201, name: 'SoundCloud', type: 'audio', parser: parseAudioEmbedSoundCloud },
  { id: 3202, name: 'Spotify', type: 'audio', parser: parseAudioEmbedSpotify },
  { id: 3203, name: 'Suno', type: 'audio', parser: parseAudioEmbedSuno },
  { id: 6401, name: 'RPGEN', type: 'game', parser: parseGameEmbedRPGEN },
  { id: 2001, name: 'Karotter', type: 'video_file', parser: parseVideoFileEmbed },
];

function matchSite(url: URL): SiteInfo | undefined {
  const host = url.hostname.replace(/^www\./, '');
  const hostMap: Record<string, number[]> = {
    'imgur.com': [401, 801],
    'i.imgur.com': [401, 801],
    'nicoseiga.jp': [402],
    'lohas.nicoseiga.jp': [402],
    'pixiv.net': [403],
    'www.pixiv.net': [403],
    'alu.jp': [404],
    'feeder.com': [405],
    'funakamome.com': [411, 811],
    'imgx.site': [412, 812],
    'ibb.co': [413, 813],
    'i.ibb.co': [413, 813],
    'gyazo.com': [421],
    'sketch.com': [431],
    'gif.open2ch.net': [802],
    'giphy.com': [802],
    'media3.giphy.com': [802],
    'youtube.com': [1601],
    'www.youtube.com': [1601],
    'youtu.be': [1601],
    'm.youtube.com': [1601],
    'nicovideo.jp': [1602],
    'www.nicovideo.jp': [1602],
    'soundcloud.com': [3201],
    'open.spotify.com': [3202],
    'suno.com': [3203],
    'rpgen.org': [6401],
    'api.karotter.com': [2001],
  };
  const ids = hostMap[host];
  if (!ids) return;
  for (const siteId of ids) {
    const site = sites.find(s => s.id === siteId);
    if (site) return site;
  }
}

export function parseMediaUrl(rawUrl: string): EmbeddedMedia | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const site = matchSite(url);
  if (!site) return null;
  const embedUrl = site.parser(url);
  if (!embedUrl) return null;
  return {
    type: site.type,
    embedUrl,
    siteId: site.id,
    siteName: site.name,
    rawUrl,
  };
}

export function extractFirstEmbed(content: string): EmbeddedMedia | null {
  const urlRegex = /https?:\/\/[^\s<>"']+/g;
  const urls = content.match(urlRegex);
  if (!urls) return null;
  for (const rawUrl of urls) {
    const result = parseMediaUrl(rawUrl);
    if (result) return result;
  }
  return null;
}
