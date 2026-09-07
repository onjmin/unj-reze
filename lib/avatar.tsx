import {
	Apple,
	Bomb,
	Cat,
	Coins,
	Compass,
	Crown,
	Dog,
	Droplet,
	Flag,
	Flame,
	Gamepad2,
	Gem,
	Ghost,
	Gift,
	Hammer,
	Heart,
	Key,
	Lightbulb,
	Map,
	Music,
	Rocket,
	Shield,
	Skull,
	Sparkles,
	Star,
	Sword,
	Trophy,
	User,
	Wrench,
	Zap,
} from "lucide-react";

const AVATAR_ICONS = [
	Gamepad2,
	Sword,
	Shield,
	Crown,
	Gem,
	Rocket,
	Flame,
	Droplet,
	Zap,
	Sparkles,
	Ghost,
	Skull,
	Cat,
	Dog,
	Apple,
	Heart,
	Star,
	Compass,
	Trophy,
	Key,
	Music,
	Coins,
	Hammer,
	Wrench,
	Gift,
	Map,
	Flag,
	Bomb,
	Lightbulb,
	User,
];

/** 掲示板モードで出す「ID」表記。
 *  第2引数には post.bbsId（lib/cc-id.ts:genBbsId によるハッシュ値。日替わりしない）
 *  を渡すこと。post.slug（= 生の users.id）を直接渡すと連番IDが丸見えになるので禁止。
 *  bbsId が無い場合は表示名（例: 名無しvFZ）の末尾英数字で代用する。 */
export function getUserIdLabel(
	displayName: string | null | undefined,
	bbsId?: string | null,
): string {
	if (bbsId) return bbsId;
	const match = displayName?.match(/[a-zA-Z0-9]+$/);
	return match ? match[0] : displayName || "???";
}

/** 特殊用途の userId（1、空文字、空白のみ）かどうか判定 */
function isSpecialUserId(userId: string | number | null | undefined): boolean {
	if (userId === null || userId === undefined) return true;
	const idStr = String(userId).trim();
	return idStr === "" || idStr === "1";
}

export function getAvatarInfo(
	userId: string | number | null | undefined,
	displayName?: string | null,
	userName?: string | null,
) {
	const trimmedName = displayName?.trim() || userName?.trim();
	const trimmedId =
		userId !== null && userId !== undefined ? String(userId).trim() : "";

	if (!trimmedId && !trimmedName) {
		return {
			style: { backgroundColor: "#4b5563" },
			Icon: User,
			username: "名無し???",
		};
	}

	// userId が 1 や空文字などの特殊用途の場合は displayName / userName を優先
	const seed = isSpecialUserId(trimmedId)
		? trimmedName || trimmedId || "???"
		: trimmedId || trimmedName || "???";

	let hash = 0;
	for (let i = 0; i < seed.length; i++) {
		hash = (hash * 31 + seed.charCodeAt(i)) | 0;
	}
	const absHash = Math.abs(hash);

	// Generate dynamic color using HSL to ensure they look beautiful and vibrant
	const hue = absHash % 360;
	const style = {
		backgroundColor: `hsl(${hue}, 60%, 40%)`,
	};

	const Icon = AVATAR_ICONS[absHash % AVATAR_ICONS.length];

	let username = "";
	if (displayName) {
		username = displayName;
	} else if (userName) {
		username = userName;
	} else if (/^[a-zA-Z0-9]{15}$/.test(seed)) {
		const idPart = seed.substring(0, 3) || "???";
		username = `名無し${idPart}`;
	} else {
		username = seed;
	}

	return {
		style,
		Icon,
		username,
	};
}
