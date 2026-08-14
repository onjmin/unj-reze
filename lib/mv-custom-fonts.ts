"use client";

/**
 * MV作成ツールでユーザーが登録するカスタムフォント。
 * public/assets には置かず、外部URL（woff2等）を @font-face で直接参照する。
 * 定義自体は localStorage に保存して他のMV編集でも選び直せるようにし、
 * 実際に選んだフォントの name/url は manifest.stage.customFontName/Url に焼き込む
 * （投稿の再生側は localStorage を共有していないため、manifest 側が正）。
 */

export interface MvCustomFont {
	name: string;
	url: string;
}

const STORAGE_KEY = "unj_mv_custom_fonts";
const injectedFonts = new Set<string>();

export function loadCustomFonts(): MvCustomFont[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(f): f is MvCustomFont =>
				!!f && typeof f.name === "string" && typeof f.url === "string",
		);
	} catch {
		return [];
	}
}

function saveCustomFonts(fonts: MvCustomFont[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(fonts));
	} catch {
		// 容量オーバー等は無視（保存は失敗してもフォント自体は使える）
	}
}

/** 同名があれば上書きして保存後の一覧を返す。 */
export function upsertCustomFont(font: MvCustomFont): MvCustomFont[] {
	const fonts = loadCustomFonts().filter((f) => f.name !== font.name);
	fonts.push(font);
	saveCustomFonts(fonts);
	return fonts;
}

export function removeCustomFont(name: string): MvCustomFont[] {
	const fonts = loadCustomFonts().filter((f) => f.name !== name);
	saveCustomFonts(fonts);
	return fonts;
}

/**
 * カスタムフォントの @font-face を document に注入し、canvas 描画で使えるよう
 * ロードを待つ。同じ name+url は一度だけ注入する。
 */
export async function ensureCustomFontLoaded(
	name: string | undefined,
	url: string | undefined,
): Promise<void> {
	if (typeof document === "undefined" || !name || !url) return;
	const key = `${name}::${url}`;
	if (injectedFonts.has(key)) return;
	injectedFonts.add(key);
	try {
		const face = new FontFace(name, `url(${JSON.stringify(url)})`);
		await face.load();
		document.fonts.add(face);
	} catch {
		injectedFonts.delete(key);
	}
}
