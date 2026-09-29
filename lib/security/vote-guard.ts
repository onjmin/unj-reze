/**
 * いいね／わるいねの重複投票防止。
 *
 * unj とDBを統合するにあたり、投票は unj 側の方式に揃える。
 * unj は `threads.good_count` / `bad_count` の**カウンタ加算だけ**を持ち、
 * 「誰が押したか」はDBに残さない。重複防止はサーバープロセスのメモリ上の
 * Set（`userId###threadId`）で行う（unj の src/server/api/like.ts と同じ）。
 *
 * 結果としてプロセス再起動で再投票が可能になるが、これは許容された仕様。
 * DBに投票行を持たないので、フィード取得のたびに投票テーブルを引く必要がなくなり、
 * 転送量の面でも有利になる（docs/NEON_EGRESS.md）。
 *
 * 【重要】このモジュールはインメモリなので、複数インスタンスにスケールすると
 * インスタンスごとに1票ずつ入る。unj も同じ性質を持つ既知の割り切り。
 * 厳密さが要るようになったら KV（KV_PROVIDER）へ移すこと。
 */

const DELIMITER = "###";

/** 押下済みの (ユーザー, 投稿) 。プロセス生存中のみ保持する */
const voted = new Set<string>();
const hearted = new Set<string>();
/**
 * 投票の種別記録。`voted` だけでは「押した/押していない」しか分からず、
 * DbPost.liked / disliked の表示（フィルの塗り分け）に使えないため別に持つ。
 * unj の done Set と同じく「1投稿1票（いいね/わるいねのどちらか）」の前提で、
 * 同じ postId に2種類目が来ることは tryVote が弾くので、上書きにはならない。
 */
const voteTypeByKey = new Map<string, "like" | "dislike">();

/**
 * 無制限に太らないよう上限を設ける。超えたら丸ごと捨てる（＝再投票可能に戻る）。
 * 1エントリ約60バイトとして、20万件で12MB程度。
 */
const MAX_ENTRIES = 200_000;

function keyOf(actorId: string, postId: number): string {
	return `${actorId}${DELIMITER}${postId}`;
}

function mark(set: Set<string>, actorId: string, postId: number): boolean {
	if (!actorId) return true; // 身元が取れないなら重複判定はできない。通す
	const key = keyOf(actorId, postId);
	if (set.has(key)) return false;
	if (set.size >= MAX_ENTRIES) set.clear();
	set.add(key);
	return true;
}

/**
 * いいね／わるいねを受け付けてよいか。
 * `false` なら既に投票済み（呼び出し側はカウンタを触らないこと）。
 */
export function tryVote(
	actorId: string,
	postId: number,
	type: "like" | "dislike",
): boolean {
	const ok = mark(voted, actorId, postId);
	if (ok && actorId) voteTypeByKey.set(keyOf(actorId, postId), type);
	return ok;
}

/** ハートも同じ扱い。1投稿につき1回まで */
export function tryHeart(actorId: string, postId: number): boolean {
	return mark(hearted, actorId, postId);
}

/**
 * 表示用の読み取り専用チェック。カウンタは変更しない。
 * このプロセスが起動してから actorId が postId に投票/ハートしたことがあるかだけを返す
 * （プロセス再起動やスケールアウトで false に戻りうる、既知の割り切り）。
 */
export function getVoteState(
	actorId: string,
	postId: number,
): { liked: boolean; disliked: boolean } {
	if (!actorId) return { liked: false, disliked: false };
	const type = voteTypeByKey.get(keyOf(actorId, postId));
	return { liked: type === "like", disliked: type === "dislike" };
}

export function hasHearted(actorId: string, postId: number): boolean {
	if (!actorId) return false;
	return hearted.has(keyOf(actorId, postId));
}

/** テスト用。本番では呼ばない */
export function __resetVoteGuard() {
	voted.clear();
	hearted.clear();
	voteTypeByKey.clear();
}
