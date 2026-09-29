import { createHash } from "node:crypto";

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
 */
export function genBbsId(userId: number, boardId: number): string {
	return createHash("sha256")
		.update([userId, boardId, "reze"].join("###"))
		.digest("hex")
		.slice(0, 4);
}
