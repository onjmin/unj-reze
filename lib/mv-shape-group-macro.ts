import {
	MV_H,
	MV_W,
	mvUid,
	type MvLayerGroup,
	type MvModulator,
	type MvShapeForm,
	type MvShapeLayer,
} from "./mv-config";

/**
 * 「幾何学的な図形のアニメーション・レイヤー群をワンボタンで生成する」マクロ。
 *
 * ── 参考動画（チョウチン少女 / 2026-08-09 収録）から読み取った規則 ──
 *
 * コマ送りで観察した結果、あの見た目を作っているのは次の4点で、いずれも
 * 「乱数の振り幅」ではなく**構造**の問題だった（以前の実装は位置・角度・形・色を
 * それぞれ独立に乱数で振っていたので、どれだけ範囲を調整しても近づかなかった）。
 *
 * 1. **形そのものが拍ごとに差し替わる**。サイズや角度が連続的に変化するのではなく、
 *    別のグリフへ丸ごと切り替わる（枠→かぎ括弧→破線→縞箱…）。これが主役の動きで、
 *    エンジンの `iconCycle`（form:'path' のコマ送り）がちょうどこれに当たる。
 * 2. **1発ごとに「小さく太く出て、膨らみながら細くなって消える」**。
 *    実測: 拍頭は太線・小さめ、0.15秒後には細線・1.4倍ほどに育って消えている。
 *    → size は `sub`（頭で縮んでいて基準へ育つ）、thickness は `add`（頭で太く）、
 *      opacity は `mul` の鋭いゲート、の3本を**同じ周期・同じ位相**で当てる。
 * 3. **すべて軸に揃っている**。斜めの図形が1つも無い。回転は常に0度。
 * 4. **同心 + 画面中央の横一線**。図形は中心を共有して入れ子になるか、
 *    中央線上に左右対称で並ぶかのどちらかで、上下左右にばら撒かれることは無い。
 *
 * そのため生成は「1枚ずつ乱数で置く」のをやめ、**中心に積む同心の段（tier）＋
 * 中央線上の左右対称な脇役（flanker）**という構図テンプレートから組み立てる。
 * 各要素は拍のスロットを1つ受け持ち、順番に発火して1周期を埋める（カスケード）。
 *
 * 左右対称は生成してから判定するのではなく、ペア単位で最初から保証する
 * （バラバラに置いてから対称に "見える" ことはまず無いため）。軸の真上に来る
 * 中心の段だけは自分自身が鏡像なので相方が要らない。
 */

// ───────────────── モチーフ（線の積み重ね） ─────────────────

/**
 * 図形の語彙。設計座標系は 0..100 の正方形（`pathBox` の既定と同じ）で中心は 50,50。
 *
 * **1つのモチーフは「完成した絵」ではなく、線を重ねる順番**で持つ。
 * 先頭ほど核で最後まで残り、後ろほど装飾で真っ先に消える。
 * コマ送りはこの配列を後ろから削って作るので、**隣り合うコマは必ず
 * 「線1組ぶんの差」しかない**。
 *
 * これが肝で、以前のように出来上がった絵を並べていると、繋ぎ目の重ね合わせが
 * 無関係な2枚の二重写しにしかならず、いくら滑らかに混ぜても「パラパラ漫画」に
 * 見えていた。差分が線1組なら、重ね合わせはそのまま**その線だけがフェードアウト
 * する**動きになり、拍で切り替わっているのに繋がって見える。
 *
 * 参考動画の1拍の中の濃さの推移（実測: 17768→8536→8108→5772 画素）も、
 * 別の絵に差し替わっているのではなく要素が減っていく形だった。
 */
const MOTIFS: Record<string, string[]> = {
	/** 枠の入れ子。参考動画1の主役。 */
	frameStack: [
		"M10 10H90V90H10Z",
		"M28 28H72V72H28Z",
		"M44 44H56V56H44Z",
		"M10 50H28 M72 50H90",
		"M50 10V28 M50 72V90",
	],
	/** かぎ括弧が閉じて枠になる。 */
	corner: [
		"M10 30V10H30 M70 10H90V30 M90 70V90H70 M30 90H10V70",
		"M38 10H62 M38 90H62",
		"M10 38V62 M90 38V62",
		"M40 40H60V60H40Z",
	],
	/** 縦棒が増えていく。参考動画2の register。 */
	pillar: [
		"M34 14V86 M66 14V86",
		"M50 26V74",
		"M14 34V66 M86 34V66",
		"M4 44V56 M96 44V56",
	],
	/** 横罫と目盛。参考動画1の破線2段。 */
	rule: [
		"M6 50H94",
		"M6 34H94 M6 66H94",
		"M22 26V74 M50 26V74 M78 26V74",
		"M6 20H94 M6 80H94",
	],
	/** 中央の塊＋左右の塊。参考動画1の「▫▪▫」。 */
	triad: [
		"M38 30H62V70H38Z",
		"M4 36H26V64H4Z M74 36H96V64H74Z",
		"M44 42H56V58H44Z",
		"M30 14H70V22H30Z M30 78H70V86H30Z",
	],
	/** 縞箱。 */
	stripe: [
		"M8 26H92V74H8Z",
		"M29 26V74 M50 26V74 M71 26V74",
		"M8 50H92",
		"M18 26V74 M40 26V74 M60 26V74 M82 26V74",
	],
	/** 十字から四隅へ。 */
	cross: [
		"M50 8V92 M8 50H92",
		"M24 24H76V76H24Z",
		"M40 40H60V60H40Z",
		"M8 8H24V24H8Z M76 8H92V24H76Z M8 76H24V92H8Z M76 76H92V92H76Z",
	],
};

const MOTIF_IDS = Object.keys(MOTIFS);

/**
 * モチーフをコマ列へ展開する。線を後ろから1組ずつ削っていくので、
 * 隣り合うコマの差は必ず線1組ぶん＝重ね合わせがフェードアウトとして読める。
 *
 * **必ず折り返す（減らしきったら増やして戻る）**。減らすだけで終わらせると
 * 最後のコマ(線1組)から先頭のコマ(全部)へ戻るところで一気に線が4〜5組ぶん復活し、
 * そこだけ重ね合わせが「線のフェード」ではなく無関係な2枚の二重写しになる
 * ——1周のうち1回だけカクッとする原因になっていた。折り返せば巡回のどの位置でも
 * 差は必ず1組ぶんに保たれる。
 *
 * 副産物として1拍あたりのコマ数が倍近く（線5本なら8コマ）になり、
 * 参考動画の実測（1拍に8前後の状態）ともちょうど合う。
 */
function motifFrames(strokes: string[]): string[] {
	const down: string[] = [];
	for (let keep = strokes.length; keep >= 1; keep--) {
		down.push(strokes.slice(0, keep).join(" "));
	}
	// 両端は折り返しで重複させない（同じ絵が2コマ続くと、そこだけ間延びする）。
	return [...down, ...down.slice(1, -1).reverse()];
}

/** `shapeStyle:'round'` 用。矩形グリフの代わりに使う丸い原始図形。 */
const ROUND_FORMS: MvShapeForm[] = ["ring", "circle", "ripple"];

const FALLBACK_PALETTE = ["#ffffff", "#a3e635", "#38bdf8", "#fbbf24", "#f472b6"];
const MONOCHROME_PALETTE = ["#ffffff", "#e5e5e5", "#bdbdbd"];

/**
 * ひと巡りの既定の長さ（拍）。
 *
 * 参考動画を60fpsのまま1コマずつ白画素で測ると、1周期は
 * チョウチン少女=26コマ(0.433秒/138BPM)、2026-08-09=30コマ(0.5秒/120BPM)で
 * **どちらもちょうど1拍**。その中に8前後の状態が入っていた。だから既定は1拍。
 */
const DEFAULT_BASE_BEATS = 1;

/** 「ベースの拍」に選べる値。半拍〜1小節。 */
export const MV_SHAPE_BASE_BEATS_OPTIONS: { value: number; label: string }[] = [
	{ value: 0.5, label: "半拍（倍速）" },
	{ value: 1, label: "1拍（既定）" },
	{ value: 2, label: "2拍" },
	{ value: 4, label: "1小節（4拍）" },
];

function pick<T>(arr: readonly T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function roundTo(val: number, decimals = 1): number {
	const factor = Math.pow(10, decimals);
	return Math.round(val * factor) / factor;
}

function randRange(min: number, max: number, decimals = 1): number {
	return roundTo(min + Math.random() * (max - min), decimals);
}

function chance(p: number): boolean {
	return Math.random() < p;
}

export interface SymmetricShapeGroupOptions {
	/** 何組（ペア）作るか。未指定はランダム。 */
	pairCount?: number;
	/** 軸の真上に相方無しの1枚を足すか。未指定は確率で決める。 */
	includeCenter?: boolean;
	/** 色の候補。未指定は既定パレット。空配列は既定パレットへフォールバック。 */
	palette?: string[];

	/**
	 * 配置の傾向。
	 * "centered" = 画面中央に同心で積む（エンブレム風）。
	 * "scattered" = 中央線上へ左右対称に散らす（帯状に並ぶ）。
	 * どちらも**中央の横一線から外れない**——参考動画に上下バラバラの配置は無い。
	 */
	clusterType?: "centered" | "scattered";
	/** 図形の種類の傾向。"sharp" (矩形グリフ) / "round" (丸い原始図形) / "all" (混在) */
	shapeStyle?: "sharp" | "round" | "all";
	/** 線の太さ。"thick" (太め) / "thin" (細め) / "random" (ランダム) */
	thickness?: "thick" | "thin" | "random";
	/** モノクロ配色にするか（白・グレー基調） */
	monochrome?: boolean;
	/** 左右対称に配置するかどうか */
	symmetric?: boolean;
	/**
	 * 動きの質感。
	 * "crisp" (既定) = 参考動画準拠。コマの間はぴたりと静止し、切り替わりだけが動く。
	 * "smooth" = 拍の踏み込みを弱め、フレーズ単位の連続した揺れを主役にする。
	 *
	 * どちらもコマの繋ぎ目は重ね合わせ(`crossfade`)で溶かす——ここが無いと
	 * 形が飛ぶだけの「パラパラ漫画」になる。crisp は短く(キレを残す)、
	 * smooth は長く(ほぼ溶け合う)取る。
	 */
	motionFeel?: "crisp" | "smooth";
	/**
	 * ひと巡りの長さ＝この動きが乗る拍（既定1拍）。
	 *
	 * コマ数はモチーフの線の本数で決まるので、1コマの長さは `これ ÷ コマ数` として
	 * 自動で割り出す。**「1コマ何拍」を先に決めてはいけない**——5コマ×0.125拍=0.625拍
	 * のように半端になり、何周かするうちに拍からずれていく。ここを基準にすれば
	 * コマ数が何枚でも必ず拍に乗る。拍の踏み込みの周期も同じ値に揃える。
	 */
	baseBeats?: number;
}

// ───────────────── 動き ─────────────────

interface MotionOptions {
	size: number;
	thickness: number;
	/** 拍の踏み込みの周期（拍）。 */
	periodBeats: number;
	/** この要素が受け持つスロット（拍数ぶん遅れて発火する）。 */
	phaseOffset: number;
	/** 連続した揺れの周期（小節）。smooth でのみ使う。 */
	phraseBars: number;
	/** 立ち上がりで太さが基準の何倍になるか。 */
	swell: number;
}

/**
 * 濃さを 0 まで落とさずに脈打たせる2本組。
 *
 * `op:"mul"` だけだと拍の谷で完全に消え、次の拍でいきなり戻る＝点滅になる。
 * `source:"constant"`(常に1) を後から足して下駄を履かせると `floor..1` の範囲に
 * 収まり、消えずに息をしているだけになる。順序が意味を持つので入れ替えないこと
 * （mul が先、add が後）。
 */
function flooredOpacity(
	floor: number,
	periodBeats: number,
	phaseOffset: number,
	curve: number,
): MvModulator[] {
	return [
		{
			source: "beat",
			target: "opacity",
			op: "mul",
			amount: roundTo(1 - floor, 2),
			periodBeats: roundTo(periodBeats, 2),
			phaseOffset: roundTo(phaseOffset, 2),
			curve,
		},
		{ source: "constant", target: "opacity", op: "add", amount: roundTo(floor, 2) },
	];
}

/**
 * "crisp": 参考動画準拠。**コマとコマの間は一切動かさない**。
 *
 * 実測で参考動画は全コマの約7割が前のコマと完全に同一だった。濃さの推移は
 * 連続的なフェードではなく、濃い絵から薄い絵へコマが並んでいることで起きている。
 * だからここで size/opacity を毎フレーム動かすと、参考動画には無い「常時じわじわ
 * 動く」成分が乗り、決まるべき瞬間がぼやける（実際そうなっていた——
 * 変化時のΔが参考動画の 15.7 に対して 3.3 まで落ちていた）。
 *
 * 拍の踏み込みは太さにだけ残す。太さは実測でも1拍のあいだに 3.5〜5倍動いており、
 * かつ形の輪郭を変えないので「ぬるぬる動いている」ようには見えない。
 */
function crispModulators(o: MotionOptions): MvModulator[] {
	return [
		{
			source: "beat",
			target: "thickness",
			op: "add",
			amount: roundTo(o.thickness * (o.swell - 1), 1),
			periodBeats: roundTo(o.periodBeats, 2),
			phaseOffset: roundTo(o.phaseOffset, 2),
			curve: 3,
		},
	];
}

/**
 * "smooth": 拍の踏み込みを弱め、フレーズ単位の連続した揺れを主役にする。
 *
 * `source:"phrase"` + `symmetric` は境目で1・中間で0の山なので、`beat` のような
 * 「終端から先頭へ飛ぶ」不連続が無く、ずっと繋がって動き続ける。大きさと縦の
 * 揺れで周期を変えて、往復が同時に折り返さないようにしてある。
 */
function smoothModulators(o: MotionOptions): MvModulator[] {
	return [
		{
			source: "phrase",
			target: "size",
			op: "add",
			amount: roundTo(o.size * 0.22, 1),
			bars: o.phraseBars,
			symmetric: true,
			curve: 1.5,
		},
		{
			source: "phrase",
			target: "y",
			op: "add",
			amount: 10,
			bars: o.phraseBars * 2,
			symmetric: true,
			curve: 1.2,
		},
		...flooredOpacity(0.45, o.periodBeats, o.phaseOffset, 1.2),
		{
			source: "beat",
			target: "thickness",
			op: "add",
			amount: roundTo(o.thickness * (o.swell - 1) * 0.4, 1),
			periodBeats: roundTo(o.periodBeats, 2),
			phaseOffset: roundTo(o.phaseOffset, 2),
			curve: 2,
		},
	];
}

// ───────────────── 構図テンプレート ─────────────────

/** 1要素を作るのに必要な、グループ全体で共有する決めごと。 */
interface GroupPlan {
	feel: "crisp" | "smooth";
	/** iconCycle に入れるコマ列。モチーフから線を1組ずつ削って作ったもの。 */
	cyclePaths: string[];
	/** ひと巡りの基準の長さ（拍）。要素ごとの実際の周期はこれの整数倍。 */
	baseBeats: number;
	/** コマの終わり何割を次のコマとの重ね合わせに使うか（0..1）。 */
	crossfade: number;
	phraseBars: number;
	swell: number;
	baseThickness: number;
	mainColor: string;
	accentColor: string;
	useRound: boolean;
	/** スロット数。要素はこの数で割った位相を受け持つ。 */
	slots: number;
}

/**
 * 要素ごとの速さの倍率。ベースの拍に対して 1倍・1/2倍速・1/4倍速を織り交ぜる。
 *
 * 全部が同じ速さだと、いくら要素を増やしても1枚の絵が明滅しているだけに見える。
 * 遅い要素が混ざると、速い要素の裏でゆっくり形が変わっていく層ができて厚みが出る。
 * **整数倍だけにしてあるので、何倍速が混ざっても小節の頭で必ず全部が揃う**
 * （3倍のような値を混ぜると何小節も揃わず、拍から浮いて聞こえる）。
 * 1倍を多めにして、拍を踏む要素が常に主役になるようにしてある。
 */
const RATE_MULTIPLIERS = [1, 1, 1, 1, 1, 2, 2, 4];

/** コマ列を k コマぶん回す。脇役を主役と違うコマから始めるのに使う。 */
function rotateCycle(paths: string[], k: number): string[] {
	if (paths.length < 2) return paths;
	const s = ((k % paths.length) + paths.length) % paths.length;
	return [...paths.slice(s), ...paths.slice(0, s)];
}

function buildElement(
	plan: GroupPlan,
	groupId: string,
	opts: {
		x: number;
		y: number;
		size: number;
		slot: number;
		accent: boolean;
		filled: boolean;
		/** コマ列の開始位置をずらす（脇役を主役と別の絵にする）。 */
		cycleShift: number;
		/** ベースの拍に対する周期の倍率（1 / 2 / 4）。 */
		rateMul: number;
		z: number;
	},
): MvShapeLayer {
	// 太さは図形の大きさに対して頭打ちにする。グループ内で太さを共通にすると、
	// 大きい段はちょうど良くても小さい脇役が塗り潰れて「点」になってしまう
	// （太くする指定ほどここが効く）。
	const rawThickness = Math.min(
		plan.baseThickness * randRange(0.85, 1.15, 2),
		opts.size * 0.3,
	);
	const thickness = roundTo(rawThickness, 1);
	// 形のひと巡りと拍の踏み込みは同じ周期にする。片方だけ別の速さにすると、
	// 形が一巡する頭と踏み込む頭がずれて拍に乗っていないように見える。
	const periodBeats = roundTo(plan.baseBeats * opts.rateMul, 2);
	const phaseOffset = roundTo(
		(opts.slot % plan.slots) * (periodBeats / plan.slots),
		2,
	);
	const size = roundTo(opts.size, 1);
	const x = roundTo(opts.x, 1);
	const y = roundTo(opts.y, 1);
	const motion: MotionOptions = {
		size,
		thickness,
		periodBeats,
		phaseOffset,
		phraseBars: plan.phraseBars,
		swell: plan.swell,
	};
	const modulators =
		plan.feel === "smooth" ? smoothModulators(motion) : crispModulators(motion);

	const base = {
		kind: "shape" as const,
		id: mvUid("shp"),
		x,
		y,
		z: opts.z,
		size,
		// 参考動画に斜めの図形は1つも無い。ここを乱数にすると
		// 何を作っても「散らかった図形の寄せ集め」になる。
		rotation: 0,
		color: opts.accent ? plan.accentColor : plan.mainColor,
		filled: opts.filled,
		thickness,
		count: 1,
		spread: 0,
		spin: 0,
		blend: "normal" as const,
		modulators,
		groupId,
	};

	if (plan.useRound) {
		const form = pick(ROUND_FORMS);
		return {
			...base,
			form,
			// circle は塗り前提、ripple は自前で拡がるので filled を素通しにしない。
			filled: form === "circle" ? true : false,
		};
	}

	const paths = rotateCycle(plan.cyclePaths, opts.cycleShift);
	return {
		...base,
		form: "path",
		// iconCycle を UI で外したときに素の形が残るよう、1コマ目を path にも入れておく。
		path: paths[0],
		pathBox: [0, 0, 100, 100],
		iconCycle: {
			paths,
			beats: periodBeats,
			crossfade: plan.crossfade,
		},
	};
}

function makePlan(options: SymmetricShapeGroupOptions): GroupPlan {
	const basePalette =
		options.palette && options.palette.length > 0
			? options.palette
			: FALLBACK_PALETTE;
	const palette = options.monochrome ? MONOCHROME_PALETTE : basePalette;

	const style = options.shapeStyle ?? "sharp";
	// "all" は族の混在ではなく「丸い原始図形も候補に入る」の意味にしてある。
	// 族を混ぜると調子が揃わないので、族は必ず1つに閉じる。
	const useRound = style === "round" || (style === "all" && chance(0.35));

	const feel = options.motionFeel ?? "crisp";

	const motif = MOTIFS[pick(MOTIF_IDS)];
	const cyclePaths = motifFrames(motif);

	const thicknessMode = options.thickness ?? "random";
	let baseThickness: number;
	if (thicknessMode === "thick") baseThickness = randRange(5, 9);
	else if (thicknessMode === "thin") baseThickness = randRange(1.8, 3.2);
	else baseThickness = randRange(3, 6);

	const mainColor = pick(palette);
	const others = palette.filter((c) => c !== mainColor);
	const accentColor =
		others.length > 0 && chance(0.45) ? pick(others) : mainColor;

	// ひと巡りも拍の踏み込みも同じ「ベースの拍」に揃える。片方だけ別の周期に
	// すると、形が一巡する頭と踏み込む頭がずれて、拍に乗っていないように見える。
	const baseBeats = options.baseBeats ?? DEFAULT_BASE_BEATS;

	return {
		feel,
		cyclePaths,
		baseBeats,
		// コマの繋ぎ。**0 にしてはいけない**——隣り合うコマは線1組ぶんしか違わないので、
		// ここを効かせるとその線が消える／現れる動きになる。0 だと一瞬で消えるだけの
		// 点滅になり、差分が小さいぶん逆に「カクついた」印象が強く出る。
		// crisp でも長めに取ってよい（形は1組ぶんしか変わらないので鈍らない）。
		crossfade: feel === "smooth" ? randRange(0.75, 1) : randRange(0.5, 0.8),
		phraseBars: pick([2, 2, 4]),
		// 太さは実測で1拍のあいだに 3.5〜5倍動く。輪郭の位置を変えずに濃さだけ
		// 変わるので、拍を効かせても「ぬるぬる動く」ようには見えない。
		// ただし基準そのものを太くしたぶん、倍率は控えめにしないと潰れる。
		swell: randRange(1.8, 3),
		baseThickness,
		mainColor,
		accentColor,
		useRound,
		slots: pick([2, 2, 4]),
	};
}

/**
 * 対称な図形グループの中身（レイヤー配列）を新しく作る。グループの実体
 * （`MvLayerGroup` レコード）は呼び出し側で保持している既存のIDを使うか
 * 新規に払い出すか選べるよう、ここでは受け取った `groupId` をそのまま全レイヤーへ
 * 付けるだけにしてある（グループの新規作成／中身の作り直しの両方から使えるように）。
 */
export function buildSymmetricShapeGroupLayers(
	groupId: string,
	nextZ: () => number,
	options: SymmetricShapeGroupOptions = {},
): MvShapeLayer[] {
	const axisX = MV_W / 2;
	// 参考動画はどちらも要素が画面中央の横一線に乗っている。ここを乱数で
	// 散らすと、他をどれだけ揃えても「たまたま並んだ図形」に見えてしまう。
	const baseY = MV_H / 2;

	const plan = makePlan(options);
	const isCentered = (options.clusterType ?? "centered") === "centered";
	const isSymmetric = options.symmetric ?? true;

	const layers: MvShapeLayer[] = [];
	let slot = 0;
	const nextSlot = () => slot++;

	// 速さの倍率。1枚目だけは必ず等倍にして、拍を踏む要素が確実に1つ居るようにする
	// （全部が遅い側に振れると、拍に乗っていないグループができてしまう）。
	let firstRate = true;
	const nextRate = () => {
		if (firstRate) {
			firstRate = false;
			return 1;
		}
		return pick(RATE_MULTIPLIERS);
	};

	if (isCentered) {
		// ── 同心に積むエンブレム構図 ──
		// **段は1〜2枚まで**。モチーフ自体が既に「枠の中に枠、その中に芯」という
		// 入れ子を持っているので、そこへ同心の段を3枚重ねると入れ子が二重にかかり、
		// 画面の真ん中に細かい模様が固まっただけの絵になる（実際そうなっていた）。
		// 参考動画も主役は大きなモチーフ1つ＋小さな脇役、という構成。
		const outer = randRange(95, 140);
		const tierCount = options.pairCount ?? (chance(0.4) ? 2 : 1);
		const ratios = [1, 0.42];

		for (let i = 0; i < Math.min(tierCount, ratios.length); i++) {
			layers.push(
				buildElement(plan, groupId, {
					x: axisX,
					y: baseY,
					size: outer * ratios[i] * randRange(0.94, 1.06),
					slot: nextSlot(),
					accent: i > 0 && chance(0.5),
					// 芯にあたるいちばん内側だけ塗りになることがある（参考動画にもある）。
					filled: i === Math.min(tierCount, ratios.length) - 1 && chance(0.4),
					// 段ごとにコマをずらす。同じ絵が入れ子になるだけだと、
					// せっかく段を重ねても1枚の図形にしか見えない。
					cycleShift: i,
					// 段ごとに速さも変える。内側が拍を刻み、外側がゆっくり形を
					// 変えていく層になると、同心の入れ子に厚みが出る。
					rateMul: nextRate(),
					z: nextZ(),
				}),
			);
		}

		// 中央線上の左右対称な脇役。同心の塊の外側へ、間隔を揃えて置く。
		const flankPairs = options.includeCenter === false ? 0 : chance(0.6) ? 1 : 0;
		for (let p = 0; p < flankPairs; p++) {
			const size = outer * randRange(0.2, 0.3);
			// 主役の外へ確実に出す。近すぎると主役の入れ子の一部に見えてしまう。
			const dx = Math.min(outer * randRange(1.15, 1.5), MV_W / 2 - size - 10);
			const s = nextSlot();
			// 脇役は主役より先のコマを出す＝主役が薄いときに脇が濃い、と噛み合う。
			const shift = 1 + Math.floor(Math.random() * 3);
			// ペアは左右で速さを揃える。片方だけ遅いと左右対称に見えない。
			const flankRate = nextRate();
			layers.push(
				buildElement(plan, groupId, {
					x: axisX - dx,
					y: baseY,
					size,
					slot: s,
					accent: false,
					filled: false,
					cycleShift: shift,
					rateMul: flankRate,
					z: nextZ(),
				}),
			);
			layers.push(
				buildElement(plan, groupId, {
					x: isSymmetric ? axisX + dx : axisX + dx * randRange(0.7, 1.3),
					y: baseY,
					size,
					// 対称なら相方と同時に、非対称なら1スロット遅らせて撃つ。
					slot: isSymmetric ? s : nextSlot(),
					accent: false,
					filled: false,
					// 対称なら相方と同じ絵。非対称ならさらにずらす。
					cycleShift: isSymmetric ? shift : shift + 1,
					rateMul: flankRate,
					z: nextZ(),
				}),
			);
		}
	} else {
		// ── 中央線上に並ぶ帯状の構図 ──
		// 中央に1枚、その左右へ等間隔でペアを足していく。上下には広げない。
		const pairCount = options.pairCount ?? 1 + Math.floor(Math.random() * 3);
		const size = randRange(30, 58);
		// 隣とぶつからない最小の間隔を確保したうえで、余白ぶんだけ広げる。
		const gap = size * randRange(2.3, 3.2);
		const includeCenter = options.includeCenter ?? chance(0.65);

		if (includeCenter) {
			layers.push(
				buildElement(plan, groupId, {
					x: axisX,
					y: baseY,
					size: size * randRange(1.1, 1.5),
					slot: nextSlot(),
					accent: chance(0.4),
					filled: chance(0.25),
					cycleShift: 0,
					rateMul: nextRate(),
					z: nextZ(),
				}),
			);
		}

		for (let i = 1; i <= pairCount; i++) {
			const dx = gap * i;
			// 画面外へ出るぶんは作らない（見えないレイヤーだけが増えるのを防ぐ）。
			if (axisX + dx - size > MV_W) break;
			const s = nextSlot();
			const pairSize = size * randRange(0.85, 1.05);
			// ペアは左右で速さを揃える。片方だけ遅いと左右対称に見えない。
			const pairRate = nextRate();
			// 中央から外へ1コマずつずらす＝波が外向きに伝わって見える。
			layers.push(
				buildElement(plan, groupId, {
					x: axisX - dx,
					y: baseY,
					size: pairSize,
					slot: s,
					accent: false,
					filled: false,
					cycleShift: i,
					rateMul: pairRate,
					z: nextZ(),
				}),
			);
			layers.push(
				buildElement(plan, groupId, {
					x: axisX + dx,
					y: baseY,
					size: isSymmetric ? pairSize : pairSize * randRange(0.75, 1.25),
					slot: isSymmetric ? s : nextSlot(),
					accent: false,
					filled: false,
					cycleShift: isSymmetric ? i : i + 1,
					rateMul: pairRate,
					z: nextZ(),
				}),
			);
		}
	}

	return layers;
}

/** 新規グループ一式（グループレコード＋中身のレイヤー）を作る。 */
export function generateSymmetricShapeGroup(
	nextZ: () => number,
	options: SymmetricShapeGroupOptions = {},
): { group: MvLayerGroup; layers: MvShapeLayer[] } {
	const groupId = mvUid("grp");
	const layers = buildSymmetricShapeGroupLayers(groupId, nextZ, options);
	// 自動生成は一度にたくさんのレイヤーを作るので、展開したままだと一覧がその枚数分
	// 一気に伸びて煩雑になる。畳んだ状態で出す。
	const group: MvLayerGroup = {
		id: groupId,
		name: "自動生成図形",
		collapsed: true,
	};
	return { group, layers };
}

/**
 * 既存の図形グループのレイヤー配列を元にして、展開の変化に使える
 * 「特殊アレンジ」のレイヤー配列を生成する。
 */
export function generateArrangementForGroup(
	existingLayers: MvShapeLayer[],
	nextZ: () => number,
): { group: MvLayerGroup; layers: MvShapeLayer[] } {
	const newGroupId = mvUid("grp");
	const group: MvLayerGroup = {
		id: newGroupId,
		name: "特殊アレンジ",
		collapsed: true,
	};
	const layers: MvShapeLayer[] = [];

	// 元のレイヤーをベースに、動きを倍速にした複製を作る
	for (const orig of existingLayers) {
		const newLayer: MvShapeLayer = {
			...orig,
			id: mvUid("shp"),
			groupId: newGroupId,
			z: nextZ(),
			modulators:
				orig.modulators?.map((m) =>
					m.source === "beat"
						? { ...m, periodBeats: (m.periodBeats ?? 1) / 2 }
						: m,
				) ?? [],
		};

		// コマ送りも倍速にする（形の切り替わりだけ元の速さのまま取り残されないように）。
		if (newLayer.iconCycle && !("advance" in newLayer.iconCycle)) {
			newLayer.iconCycle = {
				...newLayer.iconCycle,
				beats: newLayer.iconCycle.beats / 2,
			};
		}

		// 回転のキックを足す。角度は90度刻みに揃える——中途半端な角度で回すと
		// 矩形基調のグリフが軸から外れて、元のグループと絵の調子が繋がらなくなる。
		newLayer.modulators.push({
			source: "beat",
			target: "rotation",
			op: "add",
			amount: orig.x < MV_W / 2 ? 90 : -90,
			periodBeats: 0.5,
			curve: 3,
		});

		layers.push(newLayer);
	}

	// 画面いっぱいに広がる閃光用のバー（十字）を追加
	for (let i = 0; i < 2; i++) {
		layers.push({
			kind: "shape",
			form: "bar",
			id: mvUid("shp"),
			groupId: newGroupId,
			x: MV_W / 2,
			y: MV_H / 2,
			z: nextZ(),
			rotation: i === 0 ? 0 : 90,
			color: "#ffffff",
			size: MV_W,
			thickness: 4,
			filled: false,
			count: 1,
			spread: 0,
			spin: 0,
			blend: "normal",
			modulators: [
				{
					source: "beat",
					target: "size",
					op: "add",
					amount: MV_W,
					periodBeats: 0.5,
				},
				{
					source: "beat",
					target: "thickness",
					op: "add",
					amount: 10,
					periodBeats: 0.5,
				},
			],
		});
	}

	return { group, layers };
}
