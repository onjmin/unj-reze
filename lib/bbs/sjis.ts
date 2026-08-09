import Encoding from "encoding-japanese";
import { NextResponse } from "next/server";

/**
 * 専ブラ(2ch専用ブラウザ)対応。subject.txt / dat / bbs.cgi応答は Shift_JIS が原則
 * (docs: https://scrapbox.io/2chtypebbs/ 各ページ参照)。
 * Cloudflare Workers上でも動く純JS実装(encoding-japanese)を使う。
 *
 * SJISで表現できない文字(絵文字など)は encoding-japanese が既定で "?" 等に
 * 代替する。取りこぼしは許容する(専ブラ対応が主目的で、絵文字の完全再現は諦める)。
 */
export function utf8ToSjisBytes(text: string): Uint8Array {
	const unicodeArray = Encoding.stringToCode(text);
	const sjisArray = Encoding.convert(unicodeArray, {
		to: "SJIS",
		from: "UNICODE",
	});
	return new Uint8Array(sjisArray);
}

export function sjisBytesToUtf8(bytes: Uint8Array): string {
	const unicodeArray = Encoding.convert(Array.from(bytes), {
		to: "UNICODE",
		from: "SJIS",
	});
	return Encoding.codeToString(unicodeArray);
}

/** Content-Type: text/plain; charset=Shift_JIS な生レスポンスを作る。 */
export function sjisTextResponse(
	text: string,
	init?: { status?: number; contentType?: string; headers?: HeadersInit },
): NextResponse {
	const body = utf8ToSjisBytes(text);
	const headers = new Headers(init?.headers);
	headers.set(
		"Content-Type",
		`${init?.contentType ?? "text/plain"}; charset=Shift_JIS`,
	);
	// bytesは確定長なのでContent-Lengthも明示しておく(Rangeの計算に使う専ブラがいる)。
	headers.set("Content-Length", String(body.byteLength));
	return new NextResponse(body as BodyInit, {
		status: init?.status ?? 200,
		headers,
	});
}

/**
 * application/x-www-form-urlencoded だが値は Shift_JIS バイト列というbbs.cgi特有の
 * エンコーディングをパースする。キー/区切り文字(%XX含む)は必ずASCIIなので、
 * まず生バイトをそのままASCII文字列として読み、%XXを実バイトに戻してからSJIS→UTF-8変換する。
 */
export function parseSjisFormBody(bytes: Uint8Array): Record<string, string> {
	let raw = "";
	for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);

	const result: Record<string, string> = {};
	for (const pair of raw.split("&")) {
		if (!pair) continue;
		const eq = pair.indexOf("=");
		const rawKey = eq === -1 ? pair : pair.slice(0, eq);
		const rawValue = eq === -1 ? "" : pair.slice(eq + 1);
		const key = sjisBytesToUtf8(unpercentToBytes(rawKey));
		const value = sjisBytesToUtf8(unpercentToBytes(rawValue));
		result[key] = value;
	}
	return result;
}

function unpercentToBytes(field: string): Uint8Array {
	const out: number[] = [];
	for (let i = 0; i < field.length; i++) {
		const ch = field[i];
		if (ch === "+") {
			out.push(0x20);
		} else if (ch === "%" && i + 2 < field.length) {
			const hex = field.slice(i + 1, i + 3);
			const code = parseInt(hex, 16);
			if (!Number.isNaN(code)) {
				out.push(code);
				i += 2;
				continue;
			}
			out.push(field.charCodeAt(i));
		} else {
			out.push(field.charCodeAt(i) & 0xff);
		}
	}
	return new Uint8Array(out);
}
