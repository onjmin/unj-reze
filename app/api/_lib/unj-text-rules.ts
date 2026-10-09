/**
 * unj（姉妹リポジトリ `unj`）の本文規則のうち、URL に関するものの移植。
 *
 * reze の投稿・返信・bbs.cgi の書き込みは unj と同じ threads/res の行に入り、unj の
 * 板一覧・スレでもそのまま表示・リンクされる。unj は自分の書き込みに
 * src/common/request/content-schema.ts の SAFE_TEXT_MULTILINE（URL は 8 本まで・
 * ダークウェブ/短縮URL/アップローダのブラックリスト）を掛けているが、reze 経由の行は
 * それを通らないので、同じ判定をここで掛ける（app/api/_lib/post-input.ts contentError）。
 *
 * 判定は unj の content-schema.ts（urlRegex・sliceDomain・isAllowedInText・MAX_URLS_IN_TEXT）を
 * そのまま写している。ブラックリストのデータは unj の
 * src/common/request/blacklist/{dark-web/domain1,shortened-url/domain2,shortened-url/domain3,
 * uploader/domain2,uploader/domain3}.ts から写したもの（出典もそちらのコメントにある）。
 * **unj 側を更新したらここも揃えること**（片方だけだと、一方で弾かれる URL が他方から入る）。
 *
 * `_lib` はアンダースコア始まりなので Next のルートにはならない（private folder）。
 */

/** unj src/common/request/blacklist/dark-web/domain1.ts（3 件） */
const BLACKLIST_DARK_WEB_1 = new Set<string>([
	"onion",
	"bit",
	"i2p",
]);

/** unj src/common/request/blacklist/shortened-url/domain2.ts（184 件） */
const BLACKLIST_SHORTENED_URL_2 = new Set<string>([
	"0.gp",
	"000.fo",
	"00m.in",
	"069.biz",
	"0e0.pw",
	"0x.co",
	"110.vg",
	"128.pl",
	"1lil.li",
	"1sl.pw",
	"2.gp",
	"2.ly",
	"2rs.me",
	"3.ly",
	"3.sv",
	"301.link",
	"302.to",
	"33-4.me",
	"4.gp",
	"4.ly",
	"443.cyou",
	"4e.fi",
	"4z.no",
	"5.gp",
	"52.nu",
	"6.gp",
	"6.ly",
	"7.ly",
	"73.nu",
	"8.ly",
	"985.so",
	"9lick.me",
	"9m.no",
	"a.info",
	"aic.la",
	"alturl.com",
	"amz.run",
	"archive.today",
	"beautylinks.net",
	"bit.ly",
	"bitly.cx",
	"bitly.lc",
	"bitly.pk",
	"bly.to",
	"c.je",
	"cl.gy",
	"clickmoe.link",
	"clickurl.link",
	"cut.onl",
	"cutt.ly",
	"cxy.jp",
	"da.gd",
	"directmeto.site",
	"doturl.link",
	"dym.icu",
	"e.vg",
	"etinyurl.com",
	"f.ht",
	"flu.yt",
	"ft.ax",
	"g.asia",
	"g.vu",
	"g5.vc",
	"g60.jp",
	"gg.gg",
	"ggle.in",
	"grabify.link",
	"grabify.org",
	"gyo.tc",
	"h-ref.com",
	"heh.st",
	"i.gg",
	"iii.im",
	"inx.lv",
	"iplog.co",
	"is.gd",
	"iwe.re",
	"kawaii.st",
	"kik.to",
	"ko.fm",
	"koaku.ma",
	"kuku.lu",
	"kutt.uk",
	"lel.st",
	"linkify.me",
	"links.tube",
	"llili.li",
	"lnk.farm",
	"md.ly",
	"microurl.org",
	"miniurl.be",
	"miniurl.pro",
	"minurls.com",
	"mixi.bz",
	"mq.gy",
	"myu.pw",
	"n9.cl",
	"nolog.link",
	"nullrefer.me",
	"o0o.jp",
	"p.asia",
	"pro-url.com",
	"qr1.jp",
	"quick2.link",
	"r.sv",
	"rb.gy",
	"rebrand.ly",
	"redir.lat",
	"redirect.bio",
	"rid.ee",
	"rssfeed.news",
	"ryaku.jp",
	"s.id",
	"sdigo.app",
	"short-link.me",
	"short.af",
	"shortifyme.co",
	"shortpals.online",
	"shorturl.at",
	"shorturl.re",
	"sht.moe",
	"smallurl.co",
	"ss.ly",
	"ssurl.at",
	"su2.me",
	"surl.li",
	"surlz.com",
	"swit.as",
	"t.co",
	"t.ly",
	"tgr.jp",
	"tin.al",
	"tinu.be",
	"tiny.cc",
	"tiny.ee",
	"tinylink.at",
	"tinylink.net",
	"tinylink.onl",
	"tinylinks.cc",
	"tinyurl.com",
	"tinyurl.mobi",
	"tinyurl.one",
	"tinyurl.ph",
	"tinyurl.top",
	"to.lk",
	"tr.ee",
	"tt.vg",
	"tto.jp",
	"u.to",
	"u301.co",
	"upto.site",
	"ur0.cc",
	"ur0.jp",
	"ur3.us",
	"ur7.cc",
	"url-s.xyz",
	"url.ba",
	"url.beauty",
	"url.rw",
	"url.sa",
	"url2.fun",
	"urlc.net",
	"urls.cat",
	"urls.fr",
	"urls.wtf",
	"urlshortener.biz",
	"urlsmall.com",
	"urlsrt.io",
	"urlto.me",
	"urlty.co",
	"urly.it",
	"urlz.fr",
	"v.af",
	"v.gd",
	"v.vin",
	"webinfo.link",
	"x-short.plus",
	"x.gd",
	"xn--s7y.xn--tckwe",
	"yoro.cc",
	"your.ls",
	"ytub.ee",
	"zizi.ly",
	"zzb.bz",
]);

/** unj src/common/request/blacklist/shortened-url/domain3.ts（9 件） */
const BLACKLIST_SHORTENED_URL_3 = new Set<string>([
	"125.back.jp",
	"app.udcxx.me",
	"c.shogo82148.com",
	"i188.eu.org",
	"re.tinyurls.tech",
	"redirect-project.glitch.me",
	"tools.emboma.jp",
	"u.kawaii.su",
	"urls.my.id",
]);

/** unj src/common/request/blacklist/uploader/domain2.ts（14 件） */
const BLACKLIST_UPLOADER_2 = new Set<string>([
	"dhstorage.io",
	"imepic.jp",
	"tadaup.jp",
	"media-uploader.work",
	"noary.me",
	"xxup.org",
	"postimg.cc",
	"uploader.jp",
	"gigafile.nu",
	"up300.net",
	"kopipe.net",
	"axfc.net",
	"firestorage.jp",
	"xfs.jp",
]);

/** unj src/common/request/blacklist/uploader/domain3.ts（2 件） */
const BLACKLIST_UPLOADER_3 = new Set<string>([
	"ul.h3z.jp",
	"si.nocde.net",
]);

/**
 * 本文中の URL。unj content-schema.ts の urlRegex と同じ文字クラス（ASCII の URL 文字だけ。
 * 直後の日本語は飲まない）。大文字の `HTTP://` を拾わないのも unj と同じ。
 */
export const urlRegex = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/;

/** 本文中の URL を全部拾うための g 付き版（unj の urlRegexGlobal と同じ） */
export const urlRegexGlobal = new RegExp(urlRegex.source, "g");

/** 本文 1 件に書ける URL の上限。貼り逃げスパム対策（unj と同じ値） */
export const MAX_URLS_IN_TEXT = 8;

/** 本文中の URL を全部返す。g 付き正規表現は String#match に渡すので lastIndex の状態を持ち越さない */
export function findUrlsInText(text: string): string[] {
	return text.match(urlRegexGlobal) ?? [];
}

/**
 * ドメインの末尾から n 個までを取得（unj の sliceDomain と同じ）。
 * 呼び出し側で URL として解釈できることを確かめてから使う（解釈できないと例外）。
 *
 * unj と違い、末尾のドット（FQDN 表記 `bit.ly.`）は落としてから数える。new URL は
 * `https://bit.ly./x` の hostname を `bit.ly.` のまま返すので、そのまま割ると末尾が `ly.` に
 * なり、同じ行き先なのにどのブラックリストにも当たらなかった（unj より厳しい側なので互換上の問題はない）。
 */
export function sliceDomain(url: string, n: number): string {
	return new URL(url).hostname
		.replace(/\.+$/, "")
		.split(".")
		.slice(-n)
		.join(".");
}

/**
 * 本文に書いてよい URL か（unj の isAllowedInText と同じ）。
 *
 * 本文中の URL は埋め込まずリンクにするだけなので、ホワイトリストではなく
 * 「行き先が危険でないこと」＝ブラックリストだけを見る。http(s) 以外と、
 * URL として解釈できないもの（urlRegex が記号を余分に飲むケース）は弾く。
 */
export function isAllowedInText(input: string): boolean {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return false;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return false;
	return (
		!BLACKLIST_DARK_WEB_1.has(sliceDomain(input, 1)) &&
		!BLACKLIST_SHORTENED_URL_2.has(sliceDomain(input, 2)) &&
		!BLACKLIST_SHORTENED_URL_3.has(sliceDomain(input, 3)) &&
		!BLACKLIST_UPLOADER_2.has(sliceDomain(input, 2)) &&
		!BLACKLIST_UPLOADER_3.has(sliceDomain(input, 3))
	);
}

/** リンク先候補 1 件として切り出す長さの上限。ホスト名はこの範囲に必ず収まる */
const MAX_LINK_TARGET_LENGTH = 2048;

/**
 * reze の表示側がリンクにする文字列（href になる値）を、本文の先頭から最大 `limit + 1` 件返す。
 *
 * unj は urlRegex（ASCII の URL 文字だけ）に当たった部分しかリンクにしないが、reze の
 * PostContainer / PostDetail（空白区切りの語）と BbsThreadView（`>>N` で区切った断片）は
 * 「`http(s)://` で始まる塊」を丸ごと href にする。ブラウザは href の全角英字や `｡` `．` を
 * ASCII に読み替える（IDNA）ので、`https://ｂｉｔ.ly/x` は urlRegex には当たらないのに
 * reze では bit.ly へのリンクになる。そこで reze がリンクにする塊も別に拾って判定する。
 *
 * - 塊の始まり: 本文・行の先頭、空白の直後、数字の直後（`>>12https://...` の断片）。
 *   `?to=https://...` のような URL の途中の `https://` はどちらの表示でもリンクの始まりに
 *   ならないので数えない
 * - 塊の終わり: 半角空白か改行（PostContainer の区切り）。BbsThreadView の `>>数字` での
 *   区切りは {@link disallowedUrlsInText} 側で切り直す
 * - 塊の途中から始まる次の塊（`a.com>>1https://...`）も拾えるよう、次は今の `https://` の直後から探す
 * 件数を `limit + 1` で打ち切るのは、`https://` を大量に並べた本文で判定が膨らまないようにするため
 * （超えた時点で呼び出し側は件数超過として弾く）。
 */
export function findLinkTargetsInText(text: string, limit: number): string[] {
	const out: string[] = [];
	const re = /https?:\/\//g;
	for (let m = re.exec(text); m !== null; m = re.exec(text)) {
		const start = m.index;
		const prev = start > 0 ? text[start - 1] : "\n";
		if (prev !== " " && prev !== "\n" && !/[0-9]/.test(prev)) continue;
		if (out.length > limit) break;
		const max = Math.min(text.length, start + MAX_LINK_TARGET_LENGTH);
		let end = start + m[0].length;
		while (end < max && text[end] !== " " && text[end] !== "\n") end++;
		out.push(text.slice(start, end));
	}
	return out;
}

/**
 * 本文中の書いてはいけない URL（重複あり）。unj と同じ urlRegex の一致は
 * {@link isAllowedInText} に通らないもの全部、reze がリンクにする塊
 * （{@link findLinkTargetsInText}。先頭から `maxTargets + 1` 件まで）とそれを `>>数字` で
 * 切った形は、URL として解釈でき、かつ通らないものだけ（解釈できない塊はブラウザも
 * どこへも飛ばないので見逃してよい）。
 */
export function disallowedUrlsInText(
	text: string,
	maxTargets: number = MAX_URLS_IN_TEXT,
): string[] {
	const bad = findUrlsInText(text).filter((u) => !isAllowedInText(u));
	for (const word of findLinkTargetsInText(text, maxTargets)) {
		const beforeAnchor = word.split(/>>[0-9]/, 1)[0];
		for (const target of beforeAnchor === word ? [word] : [word, beforeAnchor]) {
			try {
				new URL(target);
			} catch {
				continue;
			}
			if (!isAllowedInText(target)) bad.push(target);
		}
	}
	return bad;
}

/**
 * 本文の URL の本数。unj の数え方（urlRegex の一致数）と、reze がリンクにする塊の数の
 * 多い方（全角ホストなど urlRegex に当たらない塊も reze ではリンクになるため）。
 * 塊は `limit + 1` 件で数えるのをやめるので、戻り値が limit を超えたかどうかだけを見ること。
 */
export function countUrlsInText(text: string, limit: number): number {
	return Math.max(
		findUrlsInText(text).length,
		findLinkTargetsInText(text, limit).length,
	);
}
