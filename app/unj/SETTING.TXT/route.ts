import { settingTxtResponse } from "@/lib/bbs/setting-txt";

// 専ブラ対応: GET /unj/SETTING.TXT (板ルート。専ブラが板を認識する本来の場所)
// 仕様: https://info.5ch.io/index.php/SETTING.TXT
// 板ID("unj" = board_id:1 うんでも実況J。C:\_own\git\_users\onjmin\unj\src\common\request\board.ts 参照)配下に配置。
// 実体は lib/bbs/setting-txt.ts（サイトルート app/SETTING.TXT/route.ts と共有）。
export async function GET() {
	return settingTxtResponse();
}
