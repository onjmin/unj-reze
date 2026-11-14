import Encoding from "encoding-japanese";
import { NextResponse } from "next/server";

/**
 * 専ブラ(2ch専用ブラウザ)対応。subject.txt / dat / bbs.cgi応答は Shift_JIS が原則
 * (docs: https://scrapbox.io/2chtypebbs/ 各ページ参照)。
 * Cloudflare Workers上でも動く純JS実装(encoding-japanese)を使う。
 *
 * SJISで表現できない文字(絵文字など)は数値文字参照 `&#129299;` で出す。専ブラはこれを
 * 文字に戻して表示する（本家 2ch と同じ）。受け取る側は decodeNumericCharRefs を参照。
 * 呼び出し側は先に `&` を `&amp;` にエスケープしておくこと（lib/bbs/format.ts）。
 */
export function utf8ToSjisBytes(text: string): Uint8Array {
	const unicodeArray = Encoding.stringToCode(text);
	const sjisArray = Encoding.convert(unicodeArray, {
		to: "SJIS",
		from: "UNICODE",
		fallback: "html-entity",
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
		const value = decodeNumericCharRefs(
			sjisBytesToUtf8(unpercentToBytes(rawValue)),
		);
		result[key] = value;
	}
	return result;
}

/**
 * 専ブラ・ブラウザは Shift_JIS で送れない文字（絵文字など）を `&#129299;` / `&#x1F913;` の
 * 数値文字参照にして送ってくる。そのまま保存すると Web でも subject.txt でも `&#129299;` と
 * 文字のまま出るので、ここで文字に戻す。
 *
 * 戻すのは非 ASCII（U+0080 以上）の有効なコードポイントだけ。`&#60;` のような ASCII は
 * 書いたとおりの文字列として残す（`<` に化けさせる理由が無い）。サロゲート単体と範囲外も残す。
 */
export function decodeNumericCharRefs(text: string): string {
	return text.replace(
		/&#(?:([0-9]{1,7})|[xX]([0-9a-fA-F]{1,6}));/g,
		(whole, dec: string | undefined, hex: string | undefined) => {
			const cp = dec !== undefined ? Number(dec) : parseInt(hex ?? "", 16);
			if (cp < 0x80 || cp > 0x10ffff) return whole;
			if (cp >= 0xd800 && cp <= 0xdfff) return whole;
			return String.fromCodePoint(cp);
		},
	);
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
