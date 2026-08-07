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
