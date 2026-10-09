/**
 * 投稿・返信・編集・プロフィール更新の入力検証（サーバー側）。
 *
 * クライアントの入力欄に上限が無くても、API は公開されているので直接叩かれる。
 * 本文や画像URLは threads/res の行にそのまま入り、フィードを開くたびに Neon から読まれる
 * ので（docs/NEON_EGRESS.md）、巨大な本文や data: URL を入れさせない。
 *
 * `_lib` はアンダースコア始まりなので Next のルートにはならない（private folder）。
 */
import { stripMmlLine } from "@/lib/mml/mml";
import { isUploaderAvailable } from "@/lib/uploader";

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

/** 本文が上限内か。超えていればエラーメッセージを返す */
export function contentError(content: unknown): string | null {
	if (content === undefined || content === null) return null;
	if (typeof content !== "string") return "content must be a string";
	if (content.length > MAX_POST_CONTENT_LENGTH) return "content too long";
	if (stripMmlLine(content).length > MAX_POST_TEXT_LENGTH)
		return `content too long (max ${MAX_POST_TEXT_LENGTH} chars)`;
	return null;
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
 * 編集（PATCH）で差し替える画像URL。編集モーダルには「本文中の画像URLを添付画像に
 * 昇格する」導線（components/post/EditPostModal.tsx）があり、外部の直リンクも正当に
 * 来るので https なら通す。空文字は「画像を外す」。
 */
export function isAcceptableEditedImageSrc(src: unknown): boolean {
	if (src === undefined || src === null || src === "") return true;
	if (isAcceptableNewImageSrc(src)) return true;
	return (
		typeof src === "string" &&
		src.length <= MAX_IMAGE_URL_LENGTH &&
		isHttpUrl(src, false)
	);
}

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
