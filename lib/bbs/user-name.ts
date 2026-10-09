/**
 * 名前から消す文字の一覧（下の sanitizeBbsUserName のコメントの分類）。範囲は `\u` エスケープで
 * 書く（制御文字・不可視文字をソースに直接置くと、エディタでもレビューでも見えないため）。
 */
const INVISIBLE_CHARS_RE = new RegExp(
	[
		"[",
		"\\u0000-\\u001f\\u007f-\\u009f", // C0/C1 制御文字・DEL
		"\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069", // 双方向テキストの制御
		"\\u200b-\\u200d\\u2060-\\u2064\\ufeff\\u180e\\ufff9-\\ufffb", // ゼロ幅・不可視
		// 文字としては在るが空白にしか見えないもの: ソフトハイフン、結合書記素接続子、
		// ハングルの穴埋め文字（U+115F/U+1160/U+3164/U+FFA0）、クメールの不可視母音、
		// 点字の空白、行・段落の区切り
		"\\u00ad\\u034f\\u115f\\u1160\\u17b4\\u17b5\\u2028\\u2029\\u2800\\u3164\\uffa0",
		"]",
	].join(""),
	"g",
);

/**
 * タグ文字（U+E0000-U+E007F）。表示されないので、上と同じく見分けのつかない別名を作れる。
 * BMP の外なので UTF-16 のサロゲートペアのまま照合する（`u` フラグに頼らない）。
 */
const TAG_CHARS_RE = new RegExp("\\udb40[\\udc00-\\udc7f]", "g");

/**
 * 結合文字（異体字セレクタを含む）と空白だけの名前。単独では土台の文字が無いので、
 * 空に見える名前になる。
 */
const NO_BASE_CHAR_RE = new RegExp("^[\\p{M}\\p{Z}\\s]*$", "u");

/**
 * reze の表示名（users.display_name）を、unj と共有する掲示板の名前欄（cc_user_name）や
 * 画面表示に使える形にする。
 *
 * unj は名前欄の記号で身分を見分ける: `★` はキャップ（ResPart が赤字で出す）、`◆` はトリップ、
 * `■忍【…】` は忍法帖。unj 自身は書き込み時に escapeUserName（src/server/mylib/cc.ts）で
 * 利用者の入力からこれらを潰しているが、reze 経由の書き込みはそこを通らないので、
 * 何もしないと「管理人 ★」が unj で本物のキャップと同じ見た目になる。置換表は unj と同じにする。
 *
 * 併せて、見た目を偽装できる不可視文字を消す:
 * - C0/C1 制御文字と DEL
 * - 双方向テキストの制御（U+061C, U+200E, U+200F, U+202A-U+202E, U+2066-U+2069）。
 *   後ろに続く文字列（ID やトリップ）を逆向きに見せられる
 * - ゼロ幅・不可視（U+200B-U+200D, U+2060-U+2064, U+FEFF, U+180E, U+FFF9-U+FFFB）。
 *   「管理人」と見分けのつかない別名や、空に見える名前を作れる
 * - 空白にしか見えない文字（U+00AD, U+034F, U+115F, U+1160, U+17B4, U+17B5, U+2028, U+2029,
 *   U+2800, U+3164, U+FFA0）とタグ文字（U+E0000-U+E007F）
 *
 * 結果が空、または結合文字と空白しか残らないなら「名無し」。
 *
 * 通してよいのは users.display_name 由来の文字列だけ。unj が書いた cc_user_name には
 * 本物のキャップ・トリップが入っているので、表示時にこれを通してはいけない
 * （lib/db/pg.ts resolveDisplayName）。
 *
 * mock（lib/db/mock-db.ts）はクライアントにも束ねられるので、サーバー専用の import をしないこと。
 */
export function sanitizeBbsUserName(name: string): string {
	const cleaned = String(name ?? "")
		.replace(INVISIBLE_CHARS_RE, "")
		.replace(TAG_CHARS_RE, "")
		.replace(/◆/g, "◇")
		.replace(/■/g, "□")
		.replace(/★/g, "☆")
		.replace(/●/g, "○")
		.replace(/【/g, "｛")
		.replace(/】/g, "｝")
		.trim();
	return cleaned && !NO_BASE_CHAR_RE.test(cleaned) ? cleaned : "名無し";
}
