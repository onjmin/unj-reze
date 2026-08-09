import { settingTxtResponse } from "@/lib/bbs/setting-txt";

// 専ブラ対応: GET /SETTING.TXT (サイトルート直下)
// 本来の置き場所は板ルート app/unj/SETTING.TXT だが、板ルートを見ずサイトルート直下
// (ドメイン直下)しか見ない専ブラが実在するため、フォールバックとしてここにも同じ
// 内容を配置する。実体は lib/bbs/setting-txt.ts で共有（内容の二重管理はしない）。
export async function GET() {
	return settingTxtResponse();
}
