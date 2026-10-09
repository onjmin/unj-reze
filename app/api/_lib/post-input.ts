/**
 * 投稿・返信・編集・プロフィール更新の入力検証（サーバー側）。
 *
 * クライアントの入力欄に上限が無くても、API は公開されているので直接叩かれる。
 * 本文や画像URLは threads/res の行にそのまま入り、フィードを開くたびに Neon から読まれる
 * ので（docs/NEON_EGRESS.md）、巨大な本文や data: URL を入れさせない。
 * また、その行は unj の板・スレにも出るので、unj の本文規則（不可視文字・URL の本数と行き先）を
 * ここで揃える（unj-text-rules.ts）。投稿系ルートの catch 節の共通処理（errorResponse）もここに置く。
 *
 * `_lib` はアンダースコア始まりなので Next のルートにはならない（private folder）。
 */
import { NextResponse } from "next/server";
import { stripMmlLine } from "@/lib/mml/mml";
import { ORIGIN_TYPE_OPTIONS, type OriginType } from "@/lib/types";
import { isUploaderAvailable } from "@/lib/uploader";
import {
	countUrlsInText,
	disallowedUrlsInText,
	MAX_URLS_IN_TEXT,
} from "./unj-text-rules";

/** 本文（MML行を除いた部分）の上限。unj 本家は 1024 字だが、AA や長文を見込んで広めに取る */
export const MAX_POST_TEXT_LENGTH = 5000;
/**
 * MML行を含めた本文全体の上限。MML はふつうクライアントが R2 へ外部化して URL だけ
 * 送るが、外部化に失敗したとき（uploader 未設定のローカル開発など）は本文に
 * インラインで残るので、曲1本ぶんは通す。
 */
export const MAX_POST_CONTENT_LENGTH = 200_000;
/** 画像URLの上限。data: URL を弾いた後なので、ふつうのURLならこれで足りる */
const MAX_IMAGE_URL_LENGTH = 2048;
export const MAX_DISPLAY_NAME_LENGTH = 32;
export const MAX_BIO_LENGTH = 500;

/**
 * 保存前に本文から取り除く文字。reze の書き込みは unj と同じ threads/res の行に入り unj でも
 * 表示されるので、unj の SAFE_TEXT（src/common/request/content-schema.ts）が書き込みを
 * 拒否する種類の文字は、ここで先に消しておく（拒否ではなく除去なのは、コピペで紛れ込んだ
 * ゼロ幅文字ひとつで投稿全体が失敗するのを避けるため）。
 *
 * - C0 制御文字（\t \n \r は残す）・DEL・C1 制御文字
 * - 双方向テキスト制御（U+061C, U+200E, U+200F, U+202A-U+202E, U+2066-U+2069）：
 *   表示順を入れ替えて、URL や名前を別物に見せかけられる
 * - ゼロ幅・不可視（U+200B, U+200C, U+2060-U+2064, U+FEFF, U+180E, U+FFF9-U+FFFB）：
 *   同じ見た目の別文字列を作れる（NG ワード・ブラックリストのすり抜け）
 *
 * - 対になっていないサロゲート（{@link LONE_SURROGATE_RE}）。unj の
 *   `/[\uD800-\uDFFF]/u` は u フラグ付きなので、正しいサロゲートペア（絵文字など BMP 外の文字）
 *   には当たらず、壊れた片割れだけを拒否している。ここも片割れだけを消し、絵文字は残す
 *   （片割れは Postgres の UTF-8 にも入らず、そのまま流すと 500 になる）
 *
 * unj と**意図的に揃えていない**点:
 * - U+200D（ZWJ）と異体字セレクタ（U+FE00-U+FE0F, U+E0100-U+E01EF）は残す。
 *   家族の絵文字（人＋ZWJ＋人…）のような結合絵文字や肌色・テキスト/絵文字表示の指定が壊れるため。
 *   unj の不可視文字の判定は U+200D も含むので、ZWJ 入りの絵文字は unj からは書けないが
 *   reze からは書け、unj でもそのまま表示される。
 * - 私用領域（U+E000-U+F8FF）も unj は拒否するが、見えない文字ではないのでここでは触らない。
 */
const STRIPPED_CHARS_RE =
	/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u180E\uFEFF\uFFF9-\uFFFB]/g;

/**
 * 本文・スレタイから {@link STRIPPED_CHARS_RE} の文字を取り除く。
 * 文字列以外（未指定・型違い）はそのまま返すので、後段の contentError で型を検査できる。
 */
/**
 * 対になっていないサロゲート。u フラグ付きの文字クラスは文字列をコードポイント単位で見るので、
 * 正しいペア（U+10000 以上の1文字）には当たらず、片割れだけに当たる（unj の SAFE_TEXT と同じ書き方）。
 */
const LONE_SURROGATE_RE = /[\uD800-\uDFFF]/gu;

export function sanitizeContentText<T>(s: T): T {
	if (typeof s !== "string") return s;
	return s.replace(STRIPPED_CHARS_RE, "").replace(LONE_SURROGATE_RE, "") as T;
}

/**
 * 本文が上限内か・unj の URL 規則に合うか。違反していればエラーメッセージを返す。
 * 呼び出し側は {@link sanitizeContentText} 済みの本文を渡し、保存にも同じ値を使うこと。
 */
export function contentError(content: unknown): string | null {
	const lengthError = contentLengthError(content);
	if (lengthError) return lengthError;
	return typeof content === "string" ? unjTextRuleError(content) : null;
}

/**
 * {@link contentError} のうち型と長さだけ。5000 字の上限は MML 行を除いた本文で数える
 * （インラインに残った MML は 1 行で数万字になりうる）。
 * 本文 5000 字の上限は reze の仕様として unj（1024 字）とは揃えない。
 */
export function contentLengthError(content: unknown): string | null {
	if (content === undefined || content === null) return null;
	if (typeof content !== "string") return "content must be a string";
	if (content.length > MAX_POST_CONTENT_LENGTH) return "content too long";
	if (stripMmlLine(content).length > MAX_POST_TEXT_LENGTH)
		return `content too long (max ${MAX_POST_TEXT_LENGTH} chars)`;
	return null;
}

/**
 * unj の本文規則のうち URL に関するもの（app/api/_lib/unj-text-rules.ts）。違反なら利用者向けの文言。
 *
 * MML 行も含めた本文**全体**に掛けること。MML 行を除くと、`#mml https://bit.ly/...` の
 * ように行頭に `#mml` を付けるだけで本数制限もブラックリストもすり抜けられた。そうして
 * 保存された行は unj の ResPart.svelte では普通の本文としてリンクになる。正規の MML 行
 * （外部化後はマーカーだけ、インラインでも音符の並び）に `http(s)://` が入ることはない。
 */
export function unjTextRuleError(text: string): string | null {
	if (countUrlsInText(text, MAX_URLS_IN_TEXT) > MAX_URLS_IN_TEXT)
		return `URLは${MAX_URLS_IN_TEXT}個までです`;
	if (disallowedUrlsInText(text).length > 0) return "このURLは書き込めません";
	return null;
}

/** 編集で「以前からあった」と認める URL の本数の上限（判定の手間を抑えるため） */
const MAX_LEGACY_URLS_IN_TEXT = 500;

/**
 * 編集（PATCH）用の {@link unjTextRuleError}。規則を入れる前に書かれた投稿（9 本以上の URL や
 * 短縮URL を含むもの）でも、URL に手を付けない編集（誤字直し・権利表記の変更など）は通す。
 * 編集モーダルは本文を丸ごと送り直すので、そうしないと古い投稿はどこも直せなくなる。
 * 通すのは「以前の本文より URL が増えていない」かつ「書けない URL が以前の本文にもあったものだけ」のとき。
 * `previous` は保存済みの本文（{@link sanitizeContentText} 済み）。
 */
export function unjTextRuleErrorForEdit(
	text: string,
	previous: string,
): string | null {
	const error = unjTextRuleError(text);
	if (error === null) return null;
	// 以前の本文の本数は上限を超えていても数える（ただし判定が膨らまないよう 500 本で打ち切る）
	const previousCount = countUrlsInText(previous, MAX_LEGACY_URLS_IN_TEXT);
	const limit = Math.max(MAX_URLS_IN_TEXT, previousCount);
	if (countUrlsInText(text, limit) > limit)
		return `URLは${MAX_URLS_IN_TEXT}個までです`;
	const allowedBefore = new Set(disallowedUrlsInText(previous, previousCount));
	return disallowedUrlsInText(text, limit).every((u) => allowedBefore.has(u))
		? null
		: "このURLは書き込めません";
}

/**
 * ドット絵素材メタの範囲。PATCH（app/api/posts/[id]/route.ts parseDotMeta）と
 * 新規投稿・返信で同じ値を使う。列は SMALLINT なので、範囲外や小数を DB まで流すと 500 になる。
 * animFrames はお絵描きの HGP 読み込み（lib/drawing/hgp-project.ts、256 コマまで）に合わせる
 * （lib/db/pg.ts の DOT_META_MAX・EditPostModal のコマ数欄と同じ値）。
 */
export const DOT_META_MAX = {
	dotW: 512,
	dotH: 512,
	animFrames: 256,
	animFps: 60,
} as const;

/** 1..max の整数なら値、null ならクリア指定、それ以外は "invalid" */
export function parseDotMetaInt(
	v: unknown,
	max: number,
): number | null | "invalid" {
	if (v === null) return null;
	if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > max)
		return "invalid";
	return v;
}

/**
 * 新規投稿・返信の dotW/dotH/animFrames/animFps。未指定（undefined / null）は undefined、
 * 数値でないもの（文字列・NaN・Infinity など）は "invalid"（呼び出し側は 400）。以前は
 * `Number(x)` をそのまま渡していたので、NaN や巨大値が SMALLINT 列に当たって 500 になっていた。
 *
 * 数値の範囲外は 400 にせず丸める・捨てる（PATCH の parseDotMeta より緩い）。描画エディタ
 * （components/drawing/AnimationBar.tsx）は FPS を 0〜120 の小数まで受け付け、.hgp の読み込み
 * （lib/drawing/hgp-project.ts）は 256 コマまで通すので、厳密に弾くとスプライトシートを R2 へ
 * 上げた後で投稿だけ失敗する。
 * - animFps: 正の数なら四捨五入して 1..60 に収める（再生速度は近い値に保つ）。0 以下は捨てる
 * - dotW/dotH/animFrames: 範囲内の整数だけ採り、それ以外は捨てる（lib/db/pg.ts dotMetaValue と同じ扱い）
 */
export function parseCreateDotMeta(body: unknown):
	| {
			dotW?: number;
			dotH?: number;
			animFrames?: number;
			animFps?: number;
	  }
	| "invalid" {
	const b = (body ?? {}) as Record<string, unknown>;
	const out: {
		dotW?: number;
		dotH?: number;
		animFrames?: number;
		animFps?: number;
	} = {};
	for (const key of ["dotW", "dotH", "animFrames", "animFps"] as const) {
		const raw = b[key];
		if (raw === undefined || raw === null) continue;
		if (typeof raw !== "number" || !Number.isFinite(raw)) return "invalid";
		if (key === "animFps") {
			if (raw > 0)
				out.animFps = Math.min(
					DOT_META_MAX.animFps,
					Math.max(1, Math.round(raw)),
				);
			continue;
		}
		const v = parseDotMetaInt(raw, DOT_META_MAX[key]);
		if (typeof v === "number") out[key] = v;
	}
	return out;
}

const ORIGIN_TYPE_VALUES = new Set<string>(
	ORIGIN_TYPE_OPTIONS.map((o) => o.value),
);

/**
 * 権利表記（originType）として受け付けるか。未指定（undefined / null）か
 * ORIGIN_TYPE_OPTIONS の値だけ。任意の文字列を通すと、共有の threads/res 行に
 * 好きな長さの文字列を置けてしまう（unj の readThread でも毎回読まれる）。
 */
export function isAcceptableOriginType(
	v: unknown,
): v is OriginType | null | undefined {
	return (
		v === undefined ||
		v === null ||
		(typeof v === "string" && ORIGIN_TYPE_VALUES.has(v))
	);
}

/**
 * 利用者に見せてよいエラー（`Error & { expose: true, status }`）か。
 * db.addReply（スレ満杯・バルス等）や resolveOrCreateSessionUser（セッション無し・登録枠）が投げる。
 * それ以外の例外は Postgres のメッセージ等を含みうるので、呼び出し側は文言を返さないこと。
 */
export function readExposedError(
	e: unknown,
): { message: string; status: number } | null {
	if (!(e instanceof Error)) return null;
	const x = e as Error & { expose?: unknown; status?: unknown };
	if (x.expose !== true) return null;
	const status =
		typeof x.status === "number" &&
		Number.isInteger(x.status) &&
		x.status >= 400 &&
		x.status < 600
			? x.status
			: 400;
	return { message: x.message, status };
}

/**
 * ルートの catch 節用。expose 付きならその文言と status、それ以外はログに残して
 * 一般的な文言の 500 を返す（以前は Postgres のエラーメッセージをそのまま返していた）。
 */
export function errorResponse(tag: string, e: unknown): NextResponse {
	const exposed = readExposedError(e);
	if (exposed) {
		return NextResponse.json(
			{ error: exposed.message },
			{ status: exposed.status },
		);
	}
	console.error(tag, e);
	return NextResponse.json(
		{ error: "サーバーエラーが発生しました" },
		{ status: 500 },
	);
}

/**
 * uploader-worker が返す画像の公開URL（uploader の wrangler.toml PUBLIC_URL_BASE）の origin。
 * 環境変数 UPLOADER_IMAGE_ORIGINS（カンマ区切り）で差し替えられる。カスタムドメインへ移すときは
 * 旧 origin も残しておくこと。テキスト側（lib/assets/manifest-ref.ts の UPLOADER_TEXT_ORIGINS）と同じ流儀。
 */
const DEFAULT_IMAGE_ORIGINS = [
	"https://pub-d049c945dab44db6b75372fdf9cb8401.r2.dev",
];

function uploaderImageOrigins(): Set<string> {
	const fromEnv = (process.env.UPLOADER_IMAGE_ORIGINS ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.flatMap((s) => {
			try {
				return [new URL(s).origin];
			} catch {
				return [];
			}
		});
	return new Set(fromEnv.length ? fromEnv : DEFAULT_IMAGE_ORIGINS);
}

/**
 * 画像URLの生の文字列に入っていてはいけない文字（空白・制御文字・引用符・括弧・`\`・`<>`・`` ` ``）。
 * 検証は new URL で解釈した結果に掛けるが、保存・表示されるのは生の文字列で、表示側には
 * CSS の `backgroundImage: url(...)`（components/assets/SpriteImage.tsx など）がある。表示側は
 * JSON.stringify で引用して埋めるようにしたが、古いクライアントや unj の表示もあるので保存側でも弾く。
 * `https://i.imgur.com/a.png),url(https://evil.example/x` のような値はホストの検査を通るのに、
 * CSS では別の URL を読ませられる（許可ホストを絞った意味が消える）。正規の uploader や
 * 許可ホストの画像URLにこれらの文字は入らないので、文字列の段階で弾く。
 */
const UNSAFE_IMAGE_URL_CHARS_RE = /[\s'"()\\<>`\u0000-\u001F\u007F]/;

/** uploader が返す画像URL（`https://<公開バケット>/<8桁hex>.<ext>`）か */
function isUploaderImageUrl(url: URL): boolean {
	if (url.protocol !== "https:") return false;
	if (!/^\/[0-9a-f]{8}\.(png|jpe?g|gif|webp)$/.test(url.pathname)) return false;
	return uploaderImageOrigins().has(url.origin);
}

/**
 * 新規投稿・返信の添付画像URLとして受け付けるか。
 *
 * - 本番（uploader あり）: uploader が返した画像URLだけ。添付画像はコンポーザで
 *   必ず uploader へ上げてから送るので、それ以外が来るのは直叩きだけ。
 * - ローカル開発（uploader なし）: /api/upload が返す `/uploads/...` か、
 *   ローカルの R2 互換（minio）の http(s) URL。
 * - data: / javascript: などは常に不可（data: は DB に画像本体が入って転送量を壊す）。
 *
 * 未指定（undefined / 空文字）は「添付なし」なので通す。
 */
export function isAcceptableNewImageSrc(src: unknown): boolean {
	if (src === undefined || src === null || src === "") return true;
	if (typeof src !== "string" || src.length > MAX_IMAGE_URL_LENGTH) return false;
	if (UNSAFE_IMAGE_URL_CHARS_RE.test(src)) return false;
	if (!isUploaderAvailable) {
		if (/^\/uploads\/[\w.-]+$/.test(src)) return true;
		return isHttpUrl(src, true);
	}
	try {
		return isUploaderImageUrl(new URL(src));
	} catch {
		return false;
	}
}

/**
 * 編集で外部の直リンク画像を添付にしてよいホスト。unj の
 * src/common/request/whitelist/image.ts（各 SiteInfo の src のホスト名＋hostnames）と同じ。
 * **unj 側を更新したらここも揃えること。**
 *
 * 添付画像は content_type=Image（4）として共有の行に入り、unj の EmbedPart.svelte は
 * Image をホワイトリストを見ずにそのまま `<img>` にする。任意の https を通すと、
 * 攻撃者のサーバーの画像を unj・reze の閲覧者全員に読ませる（IP の収集＝トラッキング
 * ピクセル）ことができたので、unj が画像として埋め込みを許すホストに絞る。
 */
const EDITED_IMAGE_HOSTNAMES = new Set<string>([
	// Imgur
	"imgur.com",
	"i.imgur.com",
	// アル
	"alu.jp",
	// よねっと / imgx / ImgBB
	"funakamome.com",
	"imgx.site",
	"i.ibb.co",
	// ニコニコ静画
	"seiga.nicovideo.jp",
	"sp.seiga.nicovideo.jp",
	// Pixiv
	"www.pixiv.net",
	// Feeder
	"www2.x-feeder.info",
	"www1.x-feeder.info",
	// Cloudflare R2（uploader の画像バケットと、unj が許可しているもう1つのバケット）
	"pub-d049c945dab44db6b75372fdf9cb8401.r2.dev",
	"pub-1bb6b377333b47d180596c0756cc5fe2.r2.dev",
	// 画像うｐろだつくってみた
	"imgu.jp",
]);

/**
 * 編集（PATCH）で差し替える画像URL。空文字は「画像を外す」。
 *
 * 編集モーダルには「本文中の画像URLを添付画像に昇格する」導線
 * （components/post/EditPostModal.tsx）があり外部の直リンクも正当に来るが、
 * 受け付けるのは uploader の画像か、{@link EDITED_IMAGE_HOSTNAMES} のホストの
 * https URL（ユーザー名・パスワード付きは不可）だけ。
 */
export function isAcceptableEditedImageSrc(src: unknown): boolean {
	if (src === undefined || src === null || src === "") return true;
	if (isAcceptableNewImageSrc(src)) return true;
	if (typeof src !== "string" || src.length > MAX_IMAGE_URL_LENGTH) return false;
	if (UNSAFE_IMAGE_URL_CHARS_RE.test(src)) return false;
	let url: URL;
	try {
		url = new URL(src);
	} catch {
		return false;
	}
	if (url.protocol !== "https:") return false;
	if (url.username || url.password) return false;
	return EDITED_IMAGE_HOSTNAMES.has(url.hostname);
}

/** PATCH で {@link isAcceptableEditedImageSrc} に通らなかったときの文言 */
export const EDITED_IMAGE_REJECTED_MESSAGE =
	"この画像URLは添付にできません（許可されたホストの画像だけ添付にできます）";

/** プロフィールアイコン。アイコンもアップロード経由なので新規添付と同じ基準。空文字は「外す」 */
export function isAcceptableAvatarUrl(src: unknown): boolean {
	return isAcceptableNewImageSrc(src);
}

function isHttpUrl(src: string, allowHttp: boolean): boolean {
	try {
		const u = new URL(src);
		return u.protocol === "https:" || (allowHttp && u.protocol === "http:");
	} catch {
		return false;
	}
}

/**
 * アバター色。値は Tailwind のグラデーションクラス（`from-blue-500 to-indigo-600`）で、
 * 表示側はそのまま className に流し込む。形の合わないものは捨てて既定色に任せる
 * （400 にはしない：古いクライアントの投稿を落とさないため）。
 * 指示された「#rrggbb」形式も念のため通す。
 */
export function sanitizeAvatarColor(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	if (/^from-[a-z]+-\d{2,3} to-[a-z]+-\d{2,3}$/.test(value)) return value;
	if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
	return undefined;
}
