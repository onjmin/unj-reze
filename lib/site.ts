export const SITE_NAME = "うんｊレゼ";

export const SITE_DESCRIPTION =
	"お絵描き・ゲーム・雑談ができる匿名掲示板コミュニティ。";

/** GitHub Pages 静的デモでは /unj-reze 配下に置かれる。next.config.ts がビルド時に埋め込む。 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** basePath を考慮した公開アセットの絶対パスを作る（`/icon-192.png` → `/unj-reze/icon-192.png`） */
export const assetPath = (p: string) =>
	`${BASE_PATH}${p.startsWith("/") ? p : `/${p}`}`;

export const SITE_URL = (
	process.env.NEXT_PUBLIC_SITE_URL ||
	(process.env.URL ? process.env.URL : "") ||
	"https://unj-reze.netlify.app"
).replace(/\/$/, "");
