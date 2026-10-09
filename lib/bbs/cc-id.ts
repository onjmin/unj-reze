import { createHash, createHmac } from "node:crypto";

/** REZE_BBS_ID_SECRET として受け付ける最短の長さ。短い鍵は総当たりで割れるので鍵なしと同じ扱いにする */
const MIN_SECRET_LENGTH = 16;

/**
 * unj 掲示板モードの「ID:」表示用ハッシュID。
 *
 * unj本体( src/server/mylib/cc.ts の genId )は JST日付を混ぜて日替わりにするが、
 * reze 経由の投稿はセッション/フィンガープリントベースで運用しており日替わりの
 * 自演防止という前提がそもそも無いので、日付は混ぜない（同じユーザーは常に同じID）。
 *
 * 生の users.id（unj/reze で共有しているDBの連番PK）をそのまま表示すると
 * ユーザー数やアカウント作成順が推測できてしまうため、必ずこの関数を通してから
 * cc_user_id へ保存・表示すること。post.slug（= String(users.id)）はプロフィール
 * URLやフォロー/ブロックなど内部的な同一性判定に使う別物なので、これで置き換えない。
 *
 * 鍵: 任意の env `REZE_BBS_ID_SECRET`（16字以上）があれば HMAC-SHA256 にする。
 * 鍵なしの sha256 は入力が「連番の users.id と板ID」だけなので、表示された4桁から
 * 総当たりで users.id を絞り込める（unj の genId も同じ理由で HMAC にした）。
 * 未設定・短すぎるときは従来どおりの sha256（デプロイ順に関係なく動くように）。
 * 計算するのは新しい投稿のときだけで、保存済みの cc_user_id は書き換えない
 * （鍵を入れた時点から、同じ人でも新しい投稿の ID が変わる）。
 * unj の genId と同じ値である必要はない（unj と reze の身元は同じ users.id のセッションを共有しない）。
 */
export function genBbsId(userId: number, boardId: number): string {
	const input = [userId, boardId, "reze"].join("###");
	const secret = process.env.REZE_BBS_ID_SECRET;
	if (secret && secret.length >= MIN_SECRET_LENGTH) {
		return createHmac("sha256", secret).update(input).digest("hex").slice(0, 4);
	}
	return createHash("sha256").update(input).digest("hex").slice(0, 4);
}
