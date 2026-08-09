import { showToast } from "./toast";

/**
 * CORS proxy helper module.
 * Base proxy URL defaults to "https://cors-proxy.onjmin.workers.dev" and can be customized
 * via NEXT_PUBLIC_CORS_PROXY_URL or NEXT_PUBLIC_CORS_PROXY environment variables.
 */

export function getCorsProxyBase(): string {
	const envUrl =
		process.env.NEXT_PUBLIC_CORS_PROXY_URL ||
		process.env.NEXT_PUBLIC_CORS_PROXY;
	const base =
		envUrl && envUrl.trim()
			? envUrl.trim()
			: "https://cors-proxy.onjmin.workers.dev";
	return base.replace(/\/+$/, "");
}

export function wrapCorsProxyUrl(url: string): string {
	if (!url) return url;
	const proxyBase = getCorsProxyBase();
	// Skip data URLs, blob URLs, relative paths, or URLs already proxied
	if (
		url.startsWith("data:") ||
		url.startsWith("blob:") ||
		url.startsWith("/") ||
		url.startsWith(proxyBase) ||
		url.includes("cors-proxy.onjmin.workers.dev")
	) {
		return url;
	}
	if (!/^https?:\/\//i.test(url)) {
		return url;
	}
	return `${proxyBase}/?url=${encodeURIComponent(url)}`;
}

let lastToastTime = 0;

/** Show a user-facing notification when CORS proxy retry is triggered (throttled to avoid spam) */
export function notifyCorsProxyUsed() {
	const now = Date.now();
	if (now - lastToastTime > 3000) {
		lastToastTime = now;
		if (typeof window !== "undefined") {
			showToast("info", "CORSを検出したためプロキシ経由で画像を取得しました");
		}
	}
}

/**
 * React `<img onError={handleImgError} />` handler.
 * Automatically retries loading the image via CORS proxy on initial error.
 */
export function handleImgError(
	e: React.SyntheticEvent<HTMLImageElement, Event>,
) {
	const img = e.currentTarget;
	const currentSrc = img.src;
	const proxied = wrapCorsProxyUrl(currentSrc);
	if (proxied !== currentSrc && img.getAttribute("data-proxied") !== "true") {
		img.setAttribute("data-proxied", "true");
		img.src = proxied;
		notifyCorsProxyUsed();
	}
}

/**
 * Retries fetch with CORS proxy if the initial fetch fails due to CORS or network error.
 */
export async function fetchWithCorsProxy(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> {
	const url =
		typeof input === "string"
			? input
			: input instanceof URL
				? input.toString()
				: input.url;
	try {
		const res = await fetch(input, init);
		if (!res.ok && res.status === 0) {
			throw new TypeError("Failed to fetch (status 0)");
		}
		return res;
	} catch (err) {
		const proxied = wrapCorsProxyUrl(url);
		if (proxied !== url) {
			notifyCorsProxyUsed();
			const proxiedInput =
				typeof input === "string"
					? proxied
					: input instanceof URL
						? new URL(proxied)
						: new Request(proxied, input);
			return await fetch(proxiedInput, init);
		}
		throw err;
	}
}
