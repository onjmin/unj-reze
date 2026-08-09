import type { DbPost } from "@/lib/types-db";

const WEEKDAY_KANJI = ["日", "月", "火", "水", "木", "金", "土"];

/** dat/subject.txt の区切り文字 `<>` と衝突しないようにエスケープする。 */
function escapeDatField(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/** 本文中の改行を <br> に変換(dat仕様)。エスケープ後に行う。 */
function commentToDat(content: string): string {
	return escapeDatField(content).replace(/\r\n|\r|\n/g, "<br>");
}

/** JSTの `YYYY/MM/DD(曜) HH:MM:SS` 形式。 */
function formatJstDate(iso: string): string {
	const d = new Date(iso);
	const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
	const y = jst.getUTCFullYear();
	const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
	const day = String(jst.getUTCDate()).padStart(2, "0");
	const weekday = WEEKDAY_KANJI[jst.getUTCDay()];
	const hh = String(jst.getUTCHours()).padStart(2, "0");
	const mm = String(jst.getUTCMinutes()).padStart(2, "0");
	const ss = String(jst.getUTCSeconds()).padStart(2, "0");
	return `${y}/${m}/${day}(${weekday}) ${hh}:${mm}:${ss}`;
}

/** INFO欄: `DATE ID:xxxxxxxx` */
function formatInfo(post: DbPost): string {
	const id = post.bbsId || post.slug || "????????";
	return `${formatJstDate(post.createdAt)} ID:${id}`;
}

/** dat の1行 (末尾 `\n` 込み)。isOp=true のときだけ TITLE を入れる。 */
export function formatDatLine(
	post: DbPost,
	isOp: boolean,
	title: string,
): string {
	const name = escapeDatField(post.displayName || "名無しさん");
	const mail = "";
	const info = formatInfo(post);
	const comment = commentToDat(post.content || "");
	const titleField = isOp ? escapeDatField(title) : "";
	return `${name}<>${mail}<>${info}<>${comment}<>${titleField}\n`;
}

/** subject.txt の1行 (末尾 `\n` 込み)。datKey は dat のファイル名(Unixエポック秒、DbPost.datKey)。 */
export function formatSubjectLine(
	datKey: number,
	title: string,
	resCount: number,
): string {
	return `${datKey}.dat<>${escapeDatField(title || "無題")} (${resCount})\n`;
}

/** DbPost.datKey が未設定(旧データ)でも createdAt から都度算出してdatファイル名を出す。 */
export function datKeyOf(post: { datKey?: number; createdAt: string }): number {
	return post.datKey ?? Math.floor(new Date(post.createdAt).getTime() / 1000);
}

/** タイトルは本文の1行目のみ(datのTITLE仕様どおり)。 */
export function firstLineTitle(content: string): string {
	const line = (content || "").split(/\r\n|\r|\n/)[0].trim();
	return line || "無題";
}
