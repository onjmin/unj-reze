// MvCharacterLayer の瞬き(まばたき)スケジューリング。
//
// 「乱数で毎フレーム決める」のではなく、**seed値から曲頭を基準にした発生スケジュールを
// 一度だけ組み立てて、拍位置(beatPos)からその時点の開閉状態を引く**方式にしてある。
// 毎フレーム乱数を振ると同じ再生位置へシークし直したときに瞬きの有無が変わってしまい、
// 「保存したはずの見た目が再生ごとに違う」という事故になるため。

/** 瞬きオプション。 */
export interface MvBlinkSetting {
	enabled: boolean;
	/** 発生スケジュールの種。同じ値なら常に同じ瞬きパターンになる。 */
	seed: number;
	/** 瞬きの間隔（拍）の下限。未指定は12。 */
	intervalBeatsMin?: number;
	/** 瞬きの間隔（拍）の上限。未指定は28。 */
	intervalBeatsMax?: number;
	/** 目を閉じている長さ（拍）。未指定は0.6。 */
	closedBeats?: number;
	/** 2連瞬き（1回閉じてすぐもう1回閉じる）を挟む確率 0..1。未指定は0.2。 */
	doubleBlinkChance?: number;
}

export const DEFAULT_MV_BLINK: MvBlinkSetting = {
	enabled: false,
	seed: 1,
	intervalBeatsMin: 12,
	intervalBeatsMax: 28,
	closedBeats: 0.6,
	doubleBlinkChance: 0.2,
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** mulberry32: 軽量なシード付き擬似乱数生成器。 */
function mulberry32(seed: number): () => number {
	let t = seed >>> 0;
	return () => {
		t += 0x6d2b79f5;
		let x = t;
		x = Math.imul(x ^ (x >>> 15), x | 1);
		x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
		return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
	};
}

/** 曲頭から何拍ぶん先までスケジュールを作っておくか。十分に長い曲でも足りる値。 */
const SCHEDULE_HORIZON_BEATS = 20000;

/**
 * シードから決定論的な瞬き発生スケジュール（目を閉じ始める拍位置の昇順配列）を作る。
 * `doubleBlinkChance` に当たった回は、直後（0.5〜1拍後）にもう一度閉じる瞬きを差し込む
 * （＝2連瞬き）。
 */
function buildBlinkSchedule(blink: MvBlinkSetting): number[] {
	const rand = mulberry32(Math.floor(blink.seed) || 1);
	const min = Math.max(0.5, blink.intervalBeatsMin ?? 12);
	const max = Math.max(min, blink.intervalBeatsMax ?? 28);
	const doubleChance = clamp01(blink.doubleBlinkChance ?? 0.2);
	const schedule: number[] = [];
	let t = min + rand() * (max - min);
	while (t < SCHEDULE_HORIZON_BEATS) {
		schedule.push(t);
		if (rand() < doubleChance) {
			const gap = 0.5 + rand() * 0.5;
			t += gap;
			schedule.push(t);
		}
		t += min + rand() * (max - min);
	}
	return schedule;
}

const scheduleCache = new Map<string, number[]>();

function getBlinkSchedule(blink: MvBlinkSetting): number[] {
	const key = `${blink.seed}|${blink.intervalBeatsMin}|${blink.intervalBeatsMax}|${blink.doubleBlinkChance}`;
	const cached = scheduleCache.get(key);
	if (cached) return cached;
	const schedule = buildBlinkSchedule(blink);
	scheduleCache.set(key, schedule);
	return schedule;
}

/**
 * 現在の拍位置（曲頭からの経過拍数、小数可）における目の開閉状態を返す。
 * `enabled: false` なら常に "open"。
 */
export function resolveBlinkState(
	blink: MvBlinkSetting,
	beatPos: number,
): "open" | "closed" {
	if (!blink.enabled || beatPos < 0) return "open";
	const closedBeats = Math.max(0.05, blink.closedBeats ?? 0.6);
	const schedule = getBlinkSchedule(blink);
	let lo = 0;
	let hi = schedule.length - 1;
	let idx = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (schedule[mid] <= beatPos) {
			idx = mid;
			lo = mid + 1;
		} else hi = mid - 1;
	}
	if (idx < 0) return "open";
	return beatPos - schedule[idx] < closedBeats ? "closed" : "open";
}
