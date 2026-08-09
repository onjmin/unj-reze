import { sjisTextResponse } from "@/lib/bbs/sjis";
import { SITE_NAME } from "@/lib/site";

// 専ブラ対応: GET /bbs/SETTING.TXT
// 仕様: https://info.5ch.io/index.php/SETTING.TXT
// 専ブラはスレ一覧取得前にこれを読み、書き込み制限(文字数上限等)や名無し名を知る。
// 未対応だと「無題」表示や文字数制限0扱いなど専ブラ側で誤動作しやすい。
//
// キーの意味(使うものだけ):
//   BBS_TITLE / BBS_TITLE_ORIG  板名(表示用/検索用。同じ値でよい)
//   BBS_NONAME_NAME             名前欄を空で投稿したときのデフォルト名
//   BBS_SUBJECT_COUNT           subject.txt に載せるスレ数上限(app/bbs/subject.txt の MAX_THREADS と揃える)
//   BBS_NAME_COUNT / BBS_MAIL_COUNT / BBS_MESSAGE_COUNT  各欄の最大バイト数
//   BBS_DAT_INC_HEADER=1        dat 1行目にTITLEを含む(lib/bbs/format.ts の仕様と一致)
//   BBS_DELETE_BY_WRITER        投稿者自身の削除機能の有無(0=なし。未実装のため0)
//   BBS_MOJIBAKE=1              Shift_JIS外の文字を「?」等に代替済みであることの申告
export async function GET() {
	const lines = [
		`BBS_TITLE=${SITE_NAME}`,
		`BBS_TITLE_ORIG=${SITE_NAME}`,
		"BBS_NONAME_NAME=名無しさん",
		"BBS_SUBJECT_COUNT=300",
		"BBS_NAME_COUNT=48",
		"BBS_MAIL_COUNT=48",
		"BBS_MESSAGE_COUNT=4096",
		"BBS_THREAD_TITLE_LENGTH=30",
		"BBS_DAT_INC_HEADER=1",
		"BBS_SOKO_MADAKA_LEVEL=0",
		"BBS_DELETE_BY_WRITER=0",
		"BBS_MOJIBAKE=1",
		"",
	];
	return sjisTextResponse(lines.join("\r\n"));
}
