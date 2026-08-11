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

// ───────────────── グリフ（形の語彙） ─────────────────

/**
 * 参考動画から起こした矩形基調のグリフ集。設計座標系は 0..100 の正方形
 * （`pathBox` の既定と同じ）で、中心は 50,50。
 *
 * 同じ「族」の中だけでコマ送りさせると、形が変わっても絵の調子が揃う。
 * 族をまたいでシャッフルすると（枠→縞→破線→塊…）参考動画には無い
 * 散らかった印象になるので、1つのグループは1族に閉じる。
 */
const GLYPH_FAMILIES = {
	/** 枠・かぎ括弧。参考動画1の主役の register。 */
	frame: [
		"M10 10H90V90H10Z",
		"M12 34V12H88V34 M12 66V88H88V66",
		"M10 32V10H32 M68 10H90V32 M90 68V90H68 M32 90H10V68",
		"M6 6H94V94H6Z M28 28H72V72H28Z",
		"M8 22H92V78H8Z M26 40H42V60H26Z M58 40H74V60H58Z",
		"M34 10H10V90H34 M66 10H90V90H66",
		"M4 4H96V96H4Z M20 20H80V80H20Z M36 36H64V64H36Z",
		"M14 14H86V86H14Z M14 50H86",
		"M20 6H80V94H20Z M6 20H94 M6 80H94",
		"M10 10H90V90H10Z M10 10L90 90 M90 10L10 90",
		"M24 24H76V76H24Z",
	],
	/** 棒・破線・目盛。参考動画2の縦棒ペアと、参考動画1の破線2段。 */
	bar: [
		"M34 10V90 M66 10V90",
		"M34 12V28 M34 38V56 M34 66V88 M66 12V34 M66 44V62 M66 72V88",
		"M12 40V60 M31 40V60 M50 40V60 M69 40V60 M88 40V60",
		"M4 38H20 M28 38H48 M56 38H72 M80 38H96 M4 62H16 M24 62H44 M52 62H68 M76 62H96",
		"M4 42H96 M4 58H96",
		"M8 30V70 M22 38V62 M36 30V70 M50 38V62 M64 30V70 M78 38V62 M92 30V70",
		"M20 6V94 M50 20V80 M80 6V94",
		"M6 50H94 M20 36V64 M50 30V70 M80 36V64",
		"M34 30V70 M66 30V70",
		"M10 46H34 M66 46H90 M10 54H34 M66 54H90",
	],
	/** 塊・縞箱。参考動画1の「▫▪▫」、参考動画2の「四角＋下の帯」。 */
	block: [
		"M2 34H26V66H2Z M38 28H62V72H38Z M74 34H98V66H74Z",
		"M28 8H72V56H28Z M14 66H86V92H14Z",
		"M4 36H96V64H4Z",
		"M8 26H92V74H8Z M29 26V74 M50 26V74 M71 26V74",
		"M20 14H40V86H20Z M60 14H80V86H60Z",
		"M36 36H64V64H36Z",
		"M6 44H38V56H6Z M62 44H94V56H62Z",
		"M30 30H70V70H30Z M6 46H24 M76 46H94",
		"M12 12H46V46H12Z M54 54H88V88H54Z",
	],
} satisfies Record<string, string[]>;

type GlyphFamily = keyof typeof GLYPH_FAMILIES;

const GLYPH_FAMILY_IDS = Object.keys(GLYPH_FAMILIES) as GlyphFamily[];

/** `shapeStyle:'round'` 用。矩形グリフの代わりに使う丸い原始図形。 */
const ROUND_FORMS: MvShapeForm[] = ["ring", "circle", "ripple"];

const FALLBACK_PALETTE = ["#ffffff", "#a3e635", "#38bdf8", "#fbbf24", "#f472b6"];
const MONOCHROME_PALETTE = ["#ffffff", "#e5e5e5", "#bdbdbd"];

/**
 * グリフの差し替え間隔（拍）。
 *
 * 参考動画を60fpsのまま1コマずつ白画素で測った結果、**どちらも1つの状態が
 * ちょうど3〜4コマ（0.05〜0.067秒）で入れ替わっていた**。1周期は
 * チョウチン少女=26コマ(0.433秒/138BPM)、2026-08-09=30コマ(0.5秒/120BPM)で、
 * どちらも「1拍でひと巡り・その中に8前後の状態」になる＝**1/8拍ごとの差し替え**。
 * 目視で 1/2拍くらいに見えていたのは、隣り合う状態が似ていて数えきれていなかっただけ。
 */
const SWAP_BEATS_OPTIONS = [0.125, 0.125, 0.25, 0.25, 0.5];

/**
 * 1発ぶんのゲートの周期（拍）。
 * 参考動画はどちらもぴったり1拍でひと巡りしていたので1拍を厚めに取る。
 */
const GATE_PERIOD_OPTIONS = [1, 1, 1, 1, 2];

function pick<T>(arr: readonly T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function randRange(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

function chance(p: number): boolean {
	return Math.random() < p;
}

/** 配列から重複なく n 個取り出す（順序もシャッフルする）。 */
function sample<T>(arr: readonly T[], n: number): T[] {
	const rest = [...arr];
	const out: T[] = [];
	while (out.length < n && rest.length > 0) {
		out.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
	}
	return out;
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
}

// ───────────────── 動き（1発ぶんのインパルス） ─────────────────

interface ImpulseOptions {
	/** 基準サイズ。頭でどれだけ縮ませるかの計算に使う。 */
	size: number;
	/** 基準の太さ。頭でどれだけ太らせるかの計算に使う。 */
	thickness: number;
	/** ゲート1周期の長さ（拍）。 */
	periodBeats: number;
	/** この要素が受け持つスロット（拍数ぶん遅れて発火する）。 */
	phaseOffset: number;
	/** 立ち上がりで基準サイズの何割まで縮んでいるか。 */
	shrink: number;
	/** 立ち上がりで太さが基準の何倍になるか。 */
	swell: number;
	/** ゲートの鋭さ。大きいほど一瞬しか映らない。 */
	gateCurve: number;
}

/**
 * 「拍頭で小さく太く現れ、膨らみながら細くなって消える」1発ぶんの動き。
 *
 * 3本とも同じ `periodBeats` / `phaseOffset` で揃えるのが肝。ここがずれると
 * 「消えてから膨らむ」「太いまま残る」のようにバラけて、参考動画の
 * 打点らしさが消える。
 *
 * カーブは opacity > size にしてある。size のカーブを opacity より緩くしないと、
 * 育ちきる前に見えなくなって「ただ点滅しているだけ」に見えてしまう
 * （実際、見えている窓の中で 1.4〜1.5倍まで育つのが参考動画の見え方）。
 */
function impulseModulators(o: ImpulseOptions): MvModulator[] {
	const common = {
		source: "beat" as const,
		periodBeats: o.periodBeats,
		phaseOffset: o.phaseOffset,
	};
	return [
		{
			...common,
			target: "opacity",
			op: "mul",
			amount: 1,
			curve: o.gateCurve,
		},
		{
			...common,
			target: "size",
			op: "sub",
			amount: o.size * o.shrink,
			// 線形に近づけて、見えている間にしっかり育たせる。
			curve: 1,
		},
		{
			...common,
			target: "thickness",
			op: "add",
			amount: o.thickness * (o.swell - 1),
			curve: 3,
		},
	];
}

/**
 * 消えずに出しっぱなしにする土台用の動き。
 * 全要素がゲートで消えると画面が空になる瞬間ができてしまうので、
 * いちばん外側の段だけこちらを使うことがある（参考動画にも、薄い枠が
 * 出たままで内側だけが打点で入れ替わる小節がある）。
 */
function sustainModulators(o: {
	thickness: number;
	periodBeats: number;
}): MvModulator[] {
	return [
		{
			source: "beat",
			target: "thickness",
			op: "add",
			amount: o.thickness * 0.9,
			periodBeats: o.periodBeats,
			curve: 3,
		},
	];
}

// ───────────────── 構図テンプレート ─────────────────

/** 1要素を作るのに必要な、グループ全体で共有する決めごと。 */
interface GroupPlan {
	family: GlyphFamily;
	/** iconCycle に入れるグリフ列（族から選んだ 2〜5枚）。 */
	cyclePaths: string[];
	/** 全コマを1周するのに何拍かけるか。 */
	cycleBeats: number;
	gatePeriod: number;
	gateCurve: number;
	shrink: number;
	swell: number;
	baseThickness: number;
	mainColor: string;
	accentColor: string;
	useRound: boolean;
	/** スロット数。要素はこの数で割った位相を受け持つ。 */
	slots: number;
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
		/** ゲートを掛けず出しっぱなしにする。 */
		sustain: boolean;
		z: number;
	},
): MvShapeLayer {
	const thickness = plan.baseThickness * randRange(0.85, 1.15);
	const modulators = opts.sustain
		? sustainModulators({
				thickness,
				periodBeats: plan.gatePeriod,
			})
		: impulseModulators({
				size: opts.size,
				thickness,
				periodBeats: plan.gatePeriod,
				phaseOffset: (opts.slot % plan.slots) * (plan.gatePeriod / plan.slots),
				shrink: plan.shrink,
				swell: plan.swell,
				gateCurve: plan.gateCurve,
			});

	const base = {
		kind: "shape" as const,
		id: mvUid("shp"),
		x: opts.x,
		y: opts.y,
		z: opts.z,
		size: opts.size,
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

	return {
		...base,
		form: "path",
		// iconCycle を UI で外したときに素の形が残るよう、1コマ目を path にも入れておく。
		path: plan.cyclePaths[0],
		pathBox: [0, 0, 100, 100],
		iconCycle: { paths: plan.cyclePaths, beats: plan.cycleBeats },
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

	const family = pick(GLYPH_FAMILY_IDS);
	const pool = GLYPH_FAMILIES[family];
	// 参考動画は1拍のあいだに8前後の状態を通る。コマ数が少ないと同じ形の点滅に
	// 見えてしまうので、族から取れるだけ多めに取る。
	const cyclePaths = sample(pool, Math.min(pool.length, 4 + Math.floor(Math.random() * 5)));
	const swapBeats = pick(SWAP_BEATS_OPTIONS);

	const thicknessMode = options.thickness ?? "random";
	let baseThickness: number;
	if (thicknessMode === "thick") baseThickness = randRange(2.5, 5);
	else if (thicknessMode === "thin") baseThickness = randRange(0.8, 1.6);
	else baseThickness = randRange(1.2, 3.2);

	const mainColor = pick(palette);
	const others = palette.filter((c) => c !== mainColor);
	const accentColor =
		others.length > 0 && chance(0.45) ? pick(others) : mainColor;

	return {
		family,
		cyclePaths,
		// `beats` は全コマを1周する長さ。1コマあたりの滞在時間が swapBeats になる。
		cycleBeats: cyclePaths.length * swapBeats,
		gatePeriod: pick(GATE_PERIOD_OPTIONS),
		// 実測では1発が拍の半分ほど見えている（2026-08-09の中央モチーフは
		// 0.5秒の拍のうち0.28秒ぶん見えてから消えた）。鋭くしすぎると
		// 形の差し替えが始まる前に消えて、ただのストロボになる。
		gateCurve: randRange(2, 4),
		// **サイズの変化は意外に小さい**。実測の外接矩形は 197→226px / 165→179px で
		// どちらも +8〜15% にすぎず、目に付く変化はもっぱら線の太さの方だった。
		// ここを大きく振ると「拍ごとに拡大縮小するだけ」の別物になる。
		shrink: randRange(0.08, 0.18),
		// 逆に太さは実測で 3.5〜5倍。頭が重く、すぐ細くなるのが打点らしさの正体。
		swell: randRange(3, 6),
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

	if (isCentered) {
		// ── 同心に積むエンブレム構図 ──
		// 外→内へ入れ子。段ごとにスロットをずらして、外から内へ順に発火させる。
		const outer = randRange(70, 115);
		const tierCount = options.pairCount ?? 2 + (chance(0.55) ? 1 : 0);
		const ratios = [1, 0.56, 0.3, 0.16];
		// いちばん外だけ出しっぱなしにすることがある（内側の打点が引き立つ）。
		const sustainOuter = chance(0.4);

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
					sustain: i === 0 && sustainOuter,
					z: nextZ(),
				}),
			);
		}

		// 中央線上の左右対称な脇役。同心の塊の外側へ、間隔を揃えて置く。
		const flankPairs = options.includeCenter === false ? 0 : chance(0.6) ? 1 : 0;
		for (let p = 0; p < flankPairs; p++) {
			const size = outer * randRange(0.22, 0.34);
			const dx = outer * randRange(1.5, 2.1);
			const s = nextSlot();
			layers.push(
				buildElement(plan, groupId, {
					x: axisX - dx,
					y: baseY,
					size,
					slot: s,
					accent: false,
					filled: false,
					sustain: false,
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
					sustain: false,
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
					sustain: chance(0.3),
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
			layers.push(
				buildElement(plan, groupId, {
					x: axisX - dx,
					y: baseY,
					size: pairSize,
					slot: s,
					accent: false,
					filled: false,
					sustain: false,
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
					sustain: false,
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
	const group: MvLayerGroup = { id: groupId, name: "自動生成図形" };
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
	const group: MvLayerGroup = { id: newGroupId, name: "特殊アレンジ" };
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
