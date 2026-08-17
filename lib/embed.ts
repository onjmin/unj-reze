export interface EmbeddedMedia {
	type: "image" | "video" | "audio" | "game" | "video_file" | "sns";
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
/**
 * 時間指定文字列（例: "21", "21s", "1m30s", "1h2m3s", "90s", "1:30" など）を秒数に変換する。
 */
export function parseTimeToSeconds(timeStr?: string | null): number | undefined {
	if (!timeStr) return undefined;
	const trimmed = timeStr.trim();
	if (!trimmed) return undefined;

	// 純粋な数値または秒単位表記 ("21", "21s")
	if (/^\d+s?$/i.test(trimmed)) {
		const s = parseInt(trimmed.replace(/s$/i, ""), 10);
		return Number.isNaN(s) ? undefined : s;
	}

	// "1h2m3s", "2m30s", "1h30s", "2m", "45s" など
	const hmsMatch = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
	if (hmsMatch && (hmsMatch[1] || hmsMatch[2] || hmsMatch[3])) {
		const hours = parseInt(hmsMatch[1] || "0", 10);
		const minutes = parseInt(hmsMatch[2] || "0", 10);
		const seconds = parseInt(hmsMatch[3] || "0", 10);
		return hours * 3600 + minutes * 60 + seconds;
	}

	// コロン区切り "1:23", "01:23:45"
	if (/^\d+(?::\d+)+$/.test(trimmed)) {
		const parts = trimmed.split(":").map((p) => parseInt(p, 10));
		if (parts.some((n) => Number.isNaN(n))) return undefined;
		if (parts.length === 2) {
			return parts[0] * 60 + parts[1];
		}
		if (parts.length === 3) {
			return parts[0] * 3600 + parts[1] * 60 + parts[2];
		}
	}

	const num = parseInt(trimmed, 10);
	return Number.isNaN(num) ? undefined : num;
}

export const parseVideoEmbedYouTube = (url: URL): string | undefined => {
	const path = url.pathname;
	let id = "";

	if (url.hostname === "youtu.be") {
		id = path.slice(1).split("/")[0];
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

	// 開始秒数の抽出 (t=21s, start=21, time_continue=21, ハッシュ内の #t=21s など)
	const timeParam =
		url.searchParams.get("t") ||
		url.searchParams.get("start") ||
		url.searchParams.get("time_continue") ||
		(url.hash.match(/[#&?](?:t|start|time_continue)=([^&]+)/i)?.[1] ?? "");
	const startSeconds = parseTimeToSeconds(timeParam);

	const embedUrl = new URL(`https://www.youtube.com/embed/${id}`);
	if (startSeconds !== undefined && startSeconds > 0) {
		embedUrl.searchParams.set("start", String(startSeconds));
	}
	return embedUrl.toString();
};
export const parseVideoEmbedNicovideo = (url: URL): string | undefined => {
	const id = url.pathname.match(/(sm[0-9]+|so[0-9]+|nm[0-9]+|[0-9]+)/i)?.[1];
	if (!id) return;
	const timeParam =
		url.searchParams.get("from") ||
		url.searchParams.get("start") ||
		url.searchParams.get("t") ||
		(url.hash.match(/[#&?](?:from|start|t)=([^&]+)/i)?.[1] ?? "") ||
		(url.hash.match(/^#(\d+)/)?.[1] ?? "");
	const fromSeconds = parseTimeToSeconds(timeParam);
	const from = fromSeconds !== undefined && fromSeconds > 0 ? fromSeconds : 0;
	return `https://embed.nicovideo.jp/watch/${id.startsWith("sm") || id.startsWith("so") || id.startsWith("nm") ? id : `sm${id}`}?jsapi=1&amp;from=${from}`;
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

// X(Twitter): 公式のツイート埋め込み iframe を利用。
export const parseSnsEmbedX = (url: URL): string | undefined => {
	const id = url.pathname.match(/\/status(?:es)?\/(\d+)/)?.[1];
	if (!id) return;
	return `https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=dark`;
};

interface SiteInfo {
	id: number;
	name: string;
	type: "image" | "video" | "audio" | "game" | "video_file" | "sns";
	parser: (url: URL) => string | undefined;
}

const sites: SiteInfo[] = [
	{ id: 401, name: "Imgur", type: "image", parser: parseImageEmbedImgur },
	{
		id: 402,
		name: "Nicoseiga",
		type: "image",
		parser: parseImageEmbedNicoseiga,
	},
	{ id: 403, name: "Pixiv", type: "image", parser: parseImageEmbedPixiv },
	{ id: 404, name: "ALU", type: "image", parser: parseImageEmbedAlu },
	{ id: 405, name: "Feeder", type: "image", parser: parseImageEmbedFeeder },
	{ id: 411, name: "Yonet", type: "image", parser: parseImageEmbedYonet },
	{ id: 412, name: "Imgx", type: "image", parser: parseImageEmbedImgx },
	{ id: 413, name: "ImgBB", type: "image", parser: parseImageEmbedImgBB },
	{ id: 421, name: "Gyazo", type: "image", parser: (url) => url.href },
	{ id: 431, name: "Sketch", type: "image", parser: (url) => url.href },
	{ id: 801, name: "Imgur GIF", type: "image", parser: parseGifEmbedImgur },
	{ id: 802, name: "GIPHY", type: "image", parser: parseGifEmbedGIPHY },
	{ id: 811, name: "Yonet GIF", type: "image", parser: parseGifEmbedYonet },
	{ id: 812, name: "Imgx GIF", type: "image", parser: parseGifEmbedImgx },
	{ id: 813, name: "ImgBB GIF", type: "image", parser: parseGifEmbedImgBB },
	{ id: 831, name: "GIF", type: "image", parser: (url) => url.href },
	{ id: 1601, name: "YouTube", type: "video", parser: parseVideoEmbedYouTube },
	{
		id: 1602,
		name: "Nicovideo",
		type: "video",
		parser: parseVideoEmbedNicovideo,
	},
	{
		id: 3201,
		name: "SoundCloud",
		type: "audio",
		parser: parseAudioEmbedSoundCloud,
	},
	{ id: 3202, name: "Spotify", type: "audio", parser: parseAudioEmbedSpotify },
	{ id: 3203, name: "Suno", type: "audio", parser: parseAudioEmbedSuno },
	{ id: 6401, name: "RPGEN", type: "game", parser: parseGameEmbedRPGEN },
	{
		id: 2001,
		name: "Karotter",
		type: "video_file",
		parser: parseVideoFileEmbed,
	},
	{ id: 12801, name: "X", type: "sns", parser: parseSnsEmbedX },
];

function matchSite(url: URL): SiteInfo | undefined {
	const host = url.hostname.replace(/^www\./, "");
	const hostMap: Record<string, number[]> = {
		"imgur.com": [401, 801],
		"i.imgur.com": [401, 801],
		"nicoseiga.jp": [402],
		"lohas.nicoseiga.jp": [402],
		"pixiv.net": [403],
		"www.pixiv.net": [403],
		"alu.jp": [404],
		"feeder.com": [405],
		"funakamome.com": [411, 811],
		"imgx.site": [412, 812],
		"ibb.co": [413, 813],
		"i.ibb.co": [413, 813],
		"gyazo.com": [421],
		"sketch.com": [431],
		"gif.open2ch.net": [802],
		"giphy.com": [802],
		"media3.giphy.com": [802],
		"youtube.com": [1601],
		"www.youtube.com": [1601],
		"youtu.be": [1601],
		"m.youtube.com": [1601],
		"nicovideo.jp": [1602],
		"www.nicovideo.jp": [1602],
		"soundcloud.com": [3201],
		"open.spotify.com": [3202],
		"suno.com": [3203],
		"rpgen.org": [6401],
		"api.karotter.com": [2001],
		"twitter.com": [12801],
		"x.com": [12801],
		"mobile.twitter.com": [12801],
	};
	const ids = hostMap[host];
	if (!ids) return;
	for (const siteId of ids) {
		const site = sites.find((s) => s.id === siteId);
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
	if (site) {
		const embedUrl = site.parser(url);
		if (embedUrl) {
			return {
				type: site.type,
				embedUrl,
				siteId: site.id,
				siteName: site.name,
				rawUrl,
			};
		}
	}

	// ホスト未登録でも直リンクの動画/画像は展開する
	if (/\.(mp4|webm|ogg)$/i.test(url.pathname)) {
		return {
			type: "video_file",
			embedUrl: url.href,
			siteId: 2099,
			siteName: "動画",
			rawUrl,
		};
	}
	if (/\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(url.pathname)) {
		return {
			type: "image",
			embedUrl: url.href,
			siteId: 4099,
			siteName: "画像",
			rawUrl,
		};
	}

	return null;
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

const DIRECT_IMAGE_SITE_IDS = new Set([
	401, 402, 405, 411, 412, 413, 801, 802, 811, 812, 813, 831, 4099,
]);

export function getEmbedThumbnail(embed: EmbeddedMedia): string | null {
	if (embed.siteId === 1601) {
		const m = embed.embedUrl.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
		return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null;
	}
	if (embed.siteId === 421) {
		const m = embed.rawUrl.match(/gyazo\.com\/([a-f0-9]+)/);
		return m ? `https://i.gyazo.com/${m[1]}.png` : null;
	}
	if (DIRECT_IMAGE_SITE_IDS.has(embed.siteId)) {
		return embed.embedUrl;
	}
	return null;
}
