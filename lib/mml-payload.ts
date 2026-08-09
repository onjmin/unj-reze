import { extractMmlFromContent, replaceMmlWithMarker } from "./mml";
import { isUploaderAvailable, uploadText } from "./uploader";

/**
 * 投稿本文からMMLを切り出してR2へ逃がす。
 *
 * 11トラックの曲は生45000文字に達する。これを content に埋めたままにすると、
 * 15秒ごとのフィード再取得で毎回全文が Neon から流れる（docs/NEON_EGRESS.md）。
 * content にはマーカーだけを残し、本文はR2へ置いてURLを持つ。
 *
 * 投稿系APIの入口（lib/api.ts）で必ず通す。ここを唯一の書き込み経路にしておくと、
 * コンポーザ・返信・編集のどこから来ても同じ扱いになる。
 */
export interface MmlPayloadResult {
	content: string;
	mmlUrl?: string;
	mmlDeleteId?: string;
	mmlDeleteHash?: string;
}

export async function externalizeMml(
	content: string,
): Promise<MmlPayloadResult> {
	const mml = extractMmlFromContent(content);
	// MMLが無い投稿、マーカーだけで本文が空の投稿はそのまま通す
	if (!mml) return { content };

	if (!isUploaderAvailable) {
		// アップローダ未設定の環境（ローカルのmockなど）では従来どおり content に残す。
		// has_mml は立たないが、投稿自体は失敗させない。
		console.warn("[mml] uploader が未設定のため MML を content に残します");
		return { content };
	}

	const { link, deleteId, deleteHash } = await uploadText("mml", mml);
	return {
		content: replaceMmlWithMarker(content),
		mmlUrl: link,
		mmlDeleteId: deleteId,
		mmlDeleteHash: deleteHash,
	};
}

/**
 * MML外部化の「サーバ側の最終防衛ライン」。
 *
 * 本来ブラウザが投稿前に externalizeMml() を通して mmlUrl を持ってくるはずだが、
 * クライアントバンドルのビルド時に NEXT_PUBLIC_UPLOADER_URL が空で焼き込まれた・
 * アップロードが例外で失敗した等の理由で mmlUrl が付かないまま届くことがある。
 * その場合 content には生のMML本文（`#mml <...>`行）がそのまま残っている。
 *
 * これを deriveInsertContent（lib/db/pg.ts, mock.ts）に渡すと、mmlUrl が無い＝
 * MMLではない、と誤判定されて content_type=Text で保存されてしまう
 * （生のMML本文がそのまま content_text に漏れて残る事故）。
 *
 * ここでは「クライアントが既に mmlUrl を持ってきたか」を信じつつ、持ってきて
 * いなければ content 自体を見て自前でR2へ外部化し直す。サーバ側は
 * process.env を毎回ライブに読むので、クライアントバンドルのビルド時埋め込みが
 * 壊れていてもここは影響を受けない。投稿系API（app/api/posts/**）は必ずこれを
 * 通してから db.createPost / addReply / editPost に渡すこと。
 */
export async function ensureMmlExternalized(
	content: string,
	clientRef?: {
		mmlUrl?: string;
		mmlDeleteId?: string;
		mmlDeleteHash?: string;
	} | null,
): Promise<MmlPayloadResult> {
	if (clientRef?.mmlUrl) {
		return {
			content,
			mmlUrl: clientRef.mmlUrl,
			mmlDeleteId: clientRef.mmlDeleteId,
			mmlDeleteHash: clientRef.mmlDeleteHash,
		};
	}
	// クライアントが外部化できなかった場合のフォールバック。マーカー行が無ければ
	// そもそもMML投稿ではないので何もしない。
	if (extractMmlFromContent(content) === null) return { content };
	return externalizeMml(content);
}
