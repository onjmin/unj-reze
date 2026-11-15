// 投稿欄で最後に選んだ権利表記を覚えておき、次の投稿・返信で最初から選ばれているようにする。
//
// 覚えるのは自作の表記（own_*）とライセンス（FAL 1.3・CC BY-SA 4.0）だけ。
// 「not自作 …」はその投稿の中身で決まるので、次の投稿へ持ち越すと誤った表記になりやすい。
// それを選んだとき・「申告なし」に戻したときは、覚えていた値を消す。
// コラボ導線が自動で入れる others_modify_ok は savePreferredOriginType を通らないので覚えない。
//
// 端末ごとの好みにすぎないので localStorage に置く。読めない環境（プライベートモード等）では
// 何も覚えず、従来どおり「申告なし」から始まる。

import { ORIGIN_TYPE_OPTIONS, type OriginType } from "@/lib/types";

const KEY = "unj_last_origin_type";

const REMEMBERABLE: ReadonlySet<OriginType> = new Set<OriginType>([
	"own_modify_ok",
	"own_modify_ng",
	"own_no_unauthorized_use",
	"fal_1_3",
	"cc_by_sa_4_0",
]);

const KNOWN = new Set<string>(ORIGIN_TYPE_OPTIONS.map((o) => o.value));

function isRememberable(v: unknown): v is OriginType {
	return (
		typeof v === "string" && KNOWN.has(v) && REMEMBERABLE.has(v as OriginType)
	);
}

/** 覚えている権利表記。無い・読めない・知らない値なら undefined（申告なし）。 */
export function loadPreferredOriginType(): OriginType | undefined {
	try {
		if (typeof localStorage === "undefined") return undefined;
		const v = localStorage.getItem(KEY);
		return isRememberable(v) ? v : undefined;
	} catch {
		return undefined;
	}
}

/** 利用者が投稿欄で選んだ権利表記を覚える（覚えない種類なら消す）。 */
export function savePreferredOriginType(v: OriginType | undefined): void {
	try {
		if (typeof localStorage === "undefined") return;
		if (isRememberable(v)) localStorage.setItem(KEY, v);
		else localStorage.removeItem(KEY);
	} catch {
		// 保存できなくても投稿には影響しない
	}
}
