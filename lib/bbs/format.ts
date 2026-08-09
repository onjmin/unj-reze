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

/**
 * 本文の1行目をフォールバックのタイトルとして使う(datのTITLE仕様の素朴な近似)。
 * スレの正式なスレタイは DbPost.title（threads.title列）であり、これはあくまで
 * title列が空/未設定のとき（reze発の投稿等、body先頭行=タイトルの想定のもの）用。
 */
export function firstLineTitle(content: string): string {
	const line = (content || "").split(/\r\n|\r|\n/)[0].trim();
	return line || "無題";
}

/**
 * スレタイの解決。unj純正UIは本文とは別にスレタイトルを入力できる（threads.title列）ため、
 * 本文(content_text)の1行目とは食い違いうる。subject.txt/datのTITLE欄は必ずこちらを使う
 * こと — content から再算出すると、タイトル欄と本文が違う投稿で誤ったスレタイが出る。
 */
export function titleOf(post: { title?: string; content: string }): string {
	const t = (post.title || "").trim();
	return t || firstLineTitle(post.content);
}
