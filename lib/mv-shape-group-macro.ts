import {
	MV_BEATS_PER_BAR,
	MV_H,
	MV_STEPS_PER_BEAT,
	MV_W,
	mvUid,
	type MvLayerGroup,
	type MvModTarget,
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
 * そのため生成は「1枚ずつ乱数で置く」のをやめ、**中心に積む同心の段（tier）**
 * （`clusterType:"centered"`）、**中央線上に散らばる列**（`"scattered"`）、
 * **本数も高さも独立にばらける棒の列**（`"bars"`）という3種の構図テンプレートから
 * 組み立てる。各要素は拍のスロットを1つ受け持ち、順番に発火して1周期を埋める
 * （カスケード）。
 *
 * 左右対称にする場合は生成してから判定するのではなく、片側だけ組み立ててから
 * 鏡写しで複製することで最初から保証する（バラバラに置いてから対称に "見える"
 * ことはまず無いし、左右をそれぞれ乱数で振ると "対称のつもりが微妙にずれる"
 * という中途半端な仕上がりになる）。
 *
 * **図形そのものの語彙**（枠・かぎ括弧・棒列・十字…）も固定の完成形リストから
 * 選ぶのではなく、核（core）1つ＋装飾（deco）2〜4つをその場で組み合わせて
 * 毎回新しく作る（詳細は `buildRandomMotifStrokes` を参照）。完成形を並べるだけ
 * だと選択肢を増やしても既存の絵の延長線上にしかならないため。
 */

// ───────────────── モチーフ（線の積み重ね） ─────────────────

/**
 * 図形の語彙は固定の完成形リストではなく、**核（core）1つ＋装飾（deco）2〜4つを
 * その場で組み合わせて毎回新しく作る**。設計座標系は 0..100 の正方形
 * （`pathBox` の既定と同じ）で中心は 50,50。
 *
 * 以前は「枠」「かぎ括弧」「縦棒」…と完成済みの絵を9パターン用意して1つ選ぶ方式
 * だったが、これだと選択肢を増やすだけ増やしても「どの完成形を引くか」の
 * バリエーションにしかならず、既存の絵の延長線上を出なかった。核と装飾を
 * 別の語彙として持ち、生成のたびに独立に組み合わせることで、
 * 「かぎ括弧＋棒の列」「十字＋四隅の切り欠き」のような、あらかじめ
 * 用意していない掛け合わせが毎回できる（核4種×装飾6種から2〜4個の組み合わせ
 * ＝場合の数は数百通りになり、9個の完成形を1つ選ぶより桁違いに広い）。
 *
 * **積み重ねの順番は「核が先・装飾が後」を必ず守る**。先頭ほど核で最後まで残り、
 * 後ろほど装飾で真っ先に消える。コマ送りはこの配列を後ろから削って作るので、
 * 隣り合うコマは必ず「線1組ぶんの差」しかない。
 *
 * これが肝で、以前のように出来上がった絵を並べていると、繋ぎ目の重ね合わせが
 * 無関係な2枚の二重写しにしかならず、いくら滑らかに混ぜても「パラパラ漫画」に
 * 見えていた。差分が線1組なら、重ね合わせはそのまま**その線だけがフェードアウト
 * する**動きになり、拍で切り替わっているのに繋がって見える。
 *
 * 参考動画の1拍の中の濃さの推移（実測: 17768→8536→8108→5772 画素）も、
 * 別の絵に差し替わっているのではなく要素が減っていく形だった。
 */

/** 矩形の枠。`(x0,y0)`〜`(x1,y1)` を対角に持つ正方形/長方形のアウトライン。 */
function rectPath(x0: number, y0: number, x1: number, y1: number): string {
	return `M${roundTo(x0, 1)} ${roundTo(y0, 1)}H${roundTo(x1, 1)}V${roundTo(y1, 1)}H${roundTo(x0, 1)}Z`;
}
function lineH(x0: number, x1: number, y: number): string {
	return `M${roundTo(x0, 1)} ${roundTo(y, 1)}H${roundTo(x1, 1)}`;
}
function lineV(x: number, y0: number, y1: number): string {
	return `M${roundTo(x, 1)} ${roundTo(y0, 1)}V${roundTo(y1, 1)}`;
}

/**
 * 核（core）の生成器。モチーフの中で最後まで残る主役。
 * どれも軸に揃った矩形ベースの線画で、パラメータは呼ぶたびに振れる。
 */
const CORE_GENERATORS: (() => string[])[] = [
	// 枠の入れ子（1〜3段）。参考動画1の主役だった構図を、段数・間隔ごと乱数にした。
	() => {
		const tiers = pick([1, 1, 2, 2, 3]);
		const strokes: string[] = [];
		let inset = randRange(6, 14);
		for (let t = 0; t < tiers && inset < 44; t++) {
			strokes.push(rectPath(inset, inset, 100 - inset, 100 - inset));
			inset += randRange(15, 26);
		}
		return strokes;
	},
	// かぎ括弧が四隅に開いた枠。
	() => {
		const inset = randRange(6, 14);
		const arm = randRange(14, 28);
		const o = inset;
		const f = 100 - inset;
		return [
			`M${roundTo(o, 1)} ${roundTo(o + arm, 1)}V${roundTo(o, 1)}H${roundTo(o + arm, 1)} M${roundTo(f - arm, 1)} ${roundTo(o, 1)}H${roundTo(f, 1)}V${roundTo(o + arm, 1)} M${roundTo(f, 1)} ${roundTo(f - arm, 1)}V${roundTo(f, 1)}H${roundTo(f - arm, 1)} M${roundTo(o + arm, 1)} ${roundTo(f, 1)}H${roundTo(o, 1)}V${roundTo(f - arm, 1)}`,
		];
	},
	// 縦棒の列（3〜7本）。参考動画2のような「本数がバラける」棒の語彙。
	() => {
		const n = 3 + Math.floor(Math.random() * 5);
		const margin = randRange(6, 14);
		const span = 100 - margin * 2;
		const gap = n > 1 ? span / (n - 1) : 0;
		let d = "";
		for (let i = 0; i < n; i++) {
			const x = margin + gap * i;
			const h = randRange(20, 40);
			d += ` ${lineV(x, 50 - h, 50 + h)}`;
		}
		return [d.trim()];
	},
	// 十字。
	() => {
		const inset = randRange(6, 14);
		return [`${lineV(50, inset, 100 - inset)} ${lineH(inset, 100 - inset, 50)}`];
	},
	// 横罫（1〜2段）と目盛。
	() => {
		const rows = pick([1, 1, 2]);
		const margin = randRange(4, 10);
		if (rows === 1) return [lineH(margin, 100 - margin, 50)];
		const dy = randRange(14, 22);
		return [
			`${lineH(margin, 100 - margin, 50 - dy)} ${lineH(margin, 100 - margin, 50 + dy)}`,
		];
	},
];

/**
 * 装飾（deco）の生成器。核の上に1〜数個だけ乗る脇役。核より小さく・後から
 * 削られる前提なので、核を覆い隠すほど大きくはしない。
 */
const DECO_GENERATORS: (() => string)[] = [
	// 中央の小さな四角。
	() => {
		const h = randRange(4, 10);
		return rectPath(50 - h, 50 - h, 50 + h, 50 + h);
	},
	// 中心から左右対称に離れた小さな四角ペア。
	() => {
		const h = randRange(3, 7);
		const dx = randRange(20, 40);
		return `${rectPath(50 - dx - h, 50 - h, 50 - dx + h, 50 + h)} ${rectPath(50 + dx - h, 50 - h, 50 + dx + h, 50 + h)}`;
	},
	// 端に伸びる短い目盛りの対（上下 or 左右）。
	() => {
		const len = randRange(10, 20);
		if (chance(0.5)) {
			return `${lineH(4, 4 + len, 50)} ${lineH(96 - len, 96, 50)}`;
		}
		return `${lineV(50, 4, 4 + len)} ${lineV(50, 96 - len, 96)}`;
	},
	// 中心の十字ドット（アクセント）。
	() => {
		const y = chance(0.6) ? 50 : randRange(30, 70);
		const r = randRange(1.5, 3);
		return `${lineH(50 - r, 50 + r, y)} ${lineV(50, y - r, y + r)}`;
	},
	// 内側だけの小さな棒列。核が枠系のときに重なると「枠＋棒」という核単体には
	// 無い組み合わせが生まれる。
	() => {
		const n = 3 + Math.floor(Math.random() * 3);
		const margin = randRange(22, 32);
		const span = 100 - margin * 2;
		const gap = n > 1 ? span / (n - 1) : 0;
		let d = "";
		for (let i = 0; i < n; i++) {
			const x = margin + gap * i;
			const h = randRange(6, 16);
			d += ` ${lineV(x, 50 - h, 50 + h)}`;
		}
		return d.trim();
	},
	// 四隅の切り欠き四角。
	() => {
		const s = randRange(6, 12);
		const inset = randRange(4, 10);
		return [
			rectPath(inset, inset, inset + s, inset + s),
			rectPath(100 - inset - s, inset, 100 - inset, inset + s),
			rectPath(inset, 100 - inset - s, inset + s, 100 - inset),
			rectPath(100 - inset - s, 100 - inset - s, 100 - inset, 100 - inset),
		].join(" ");
	},
];

/**
 * 核1つ＋装飾2〜4つをその場で組み合わせて、新しいモチーフの線の積み重ねを作る。
 * 直前と同じ装飾器を連続で選ばないようにして、少ない個数でも絵の変化が偏らない
 * ようにしてある。
 */
function buildRandomMotifStrokes(): string[] {
	const core = pick(CORE_GENERATORS)();
	const decoCount = 2 + Math.floor(Math.random() * 3); // 2〜4個
	const decos: string[] = [];
	let lastIdx = -1;
	for (let i = 0; i < decoCount; i++) {
		let idx = Math.floor(Math.random() * DECO_GENERATORS.length);
		if (idx === lastIdx) idx = (idx + 1) % DECO_GENERATORS.length;
		lastIdx = idx;
		decos.push(DECO_GENERATORS[idx]());
	}
	return [...core, ...decos];
}

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
	/** 要素の本数の目安（"scattered"/"bars" では奇数寄せに換算、"centered" は段数）。未指定はランダム。 */
	pairCount?: number;
	/** 色の候補。未指定は既定パレット。空配列は既定パレットへフォールバック。 */
	palette?: string[];

	/**
	 * 配置の傾向。
	 * "centered" = 画面中央に同心で積む（エンブレム風）。主役1つで完結させる
	 *   （以前は外側に対称な小さいペアを足していたが、「小・大・小」の判子絵に
	 *   なりがちだったので廃止した）。
	 * "scattered" = 中央線上に複数の要素が散らばる列。本数（3〜6）もサイズも
	 *   要素ごとに独立にばらつかせてあり、「大きい1枚を小さいのが両脇から挟む」
	 *   という階層は作らない。対称オンなら片側だけ組んで厳密に鏡写しする。
	 * "bars" = 本数も高さも1本ずつ独立に振れる棒の列（イコライザー風）。参考動画1
	 *   はこれ。
	 * いずれも**中央の横一線から外れない**——参考動画に上下バラバラの配置は無い。
	 */
	clusterType?: "centered" | "scattered" | "bars";
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
 *
 * 以前はここから確率で1枚ずつ抽選していたが、1倍の当選比率を高くしてある
 * せいで要素数が少ないグループ（同心の2段目、帯の最初のペア等）では
 * 「ベースの拍」が1拍のとき2拍・4拍がほぼ出ない、という運任せの偏りが出ていた。
 * 内側（＝呼び出し順が早い要素）から外側へ向けて 1→2→4 の順に確実に割り当て、
 * 4枚目以降は最も遅い4のまま据え置く方式にして、要素が2つ以上あれば
 * 2拍・4拍が確実に構成要素として混ざるようにしてある。
 */
const RATE_LADDER = [1, 2, 4];

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

	const cyclePaths = motifFrames(buildRandomMotifStrokes());

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
	const clusterType = options.clusterType ?? "centered";
	const isCentered = clusterType === "centered";
	const isBars = clusterType === "bars";
	const isSymmetric = options.symmetric ?? true;

	const layers: MvShapeLayer[] = [];
	let slot = 0;
	const nextSlot = () => slot++;

	// 速さの倍率。内側（＝呼び出し順が早い要素）から 1→2→4 の順で確実に割り当てる。
	// 1枚目は必ず等倍にして拍を踏む要素を確保しつつ（全部が遅い側に振れると拍に
	// 乗っていないグループになる）、2枚目以降は確率任せにせず ladder を回して
	// 2拍・4拍が実際に構成要素として混ざることを保証する。
	let rateIdx = 0;
	const nextRate = () => RATE_LADDER[Math.min(rateIdx++, RATE_LADDER.length - 1)];

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

		// 同心の主役だけで完結させる。以前はここへ「主役の外に対称な小さいペア」を
		// 足していたが、これは形を変えただけの「小・大・小」で、結局は装飾側が
		// 削られがちな上に手数のわりに構図の幅が広がらなかった（ユーザー指摘により削除）。
		// バリエーションが欲しいときは "bars" か "scattered" を使う。
	} else if (isBars) {
		// ── イコライザー風の棒の列 ──
		// 参考動画1はこれで、"scattered" のような「大＋対称な小ペア」構図とは違い、
		// 本数も1本ずつの高さも独立にばらけるのが持ち味。エンジン組み込みの
		// count/offsetX/stagger（同一レイヤーの複製をずらして反応させる仕組み）に
		// そのまま乗るので、モチーフのコマ送りは使わない専用の組み立てにしてある。
		const barCount = options.pairCount
			? options.pairCount * 2 + 1
			: 7 + Math.floor(Math.random() * 7); // 7〜13本
		const rowWidth = MV_W * randRange(0.72, 0.92);
		const startX = axisX - rowWidth / 2;
		const offsetX = barCount > 1 ? rowWidth / (barCount - 1) : 0;
		const barAspect =
			plan.baseThickness > 6
				? randRange(0.22, 0.32)
				: randRange(0.12, 0.2, 2);
		const baseSize = randRange(14, 26);
		// stagger は「何ステップぶん過去の反応で描くか」。1本ごとに少しずつ
		// ずらすことで、同じ揺れが端から端へ伝わる波ではなく、隣同士が食い違う
		// 「本数も高さもバラバラ」なイコライザーらしい見た目になる。
		const stagger = Math.round(MV_STEPS_PER_BEAT * randRange(0.05, 0.16, 2));

		layers.push({
			kind: "shape",
			form: "bar",
			id: mvUid("shp"),
			groupId,
			x: startX,
			y: baseY,
			z: nextZ(),
			rotation: 90,
			color: plan.mainColor,
			filled: true,
			thickness: 0,
			size: baseSize,
			barAspect,
			count: barCount,
			offsetX,
			offsetY: 0,
			stagger,
			spread: 0,
			spin: 0,
			blend: "normal",
			modulators: [
				{
					source: "beat",
					target: "size",
					op: "add",
					amount: roundTo(baseSize * randRange(1.8, 3.2), 1),
					periodBeats: roundTo(plan.baseBeats, 2),
					curve: 2,
				},
			],
		});

		// 数本だけ明るい色でひときわ高く突き抜けさせる「差し色の棒」。
		// 参考動画も全部が同じ高さではなく、数本だけ白く飛び抜けている。
		const accentCount = 2 + Math.floor(Math.random() * 2); // 2〜3本
		const usedIdx = new Set<number>();
		for (let n = 0; n < accentCount; n++) {
			const idx = Math.floor(Math.random() * barCount);
			if (usedIdx.has(idx)) continue;
			usedIdx.add(idx);
			layers.push({
				kind: "shape",
				form: "bar",
				id: mvUid("shp"),
				groupId,
				x: startX + offsetX * idx,
				y: baseY,
				z: nextZ(),
				rotation: 90,
				color: plan.accentColor,
				filled: true,
				thickness: 0,
				size: baseSize * randRange(1.3, 1.7),
				barAspect: barAspect * randRange(0.8, 1),
				count: 1,
				spread: 0,
				spin: 0,
				blend: "normal",
				modulators: [
					{
						source: "beat",
						target: "size",
						op: "add",
						amount: roundTo(baseSize * randRange(2.4, 4), 1),
						periodBeats: roundTo(plan.baseBeats, 2),
						phaseOffset: roundTo(randRange(0, plan.baseBeats, 2), 2),
						curve: 2,
					},
				],
			});
		}
	} else {
		// ── 中央線上に並ぶ帯状の構図 ──
		//
		// 以前は「中央に大きい1枚＋対称な小さいペア1組」を既定にしていたが、
		// これは指摘の通り毎回同じ「小・大・小」の3枚構成にしかならず、しかも
		// 対称ペアなのに間隔・サイズの乱数幅が狭くて「対称のつもりが微妙にずれた」
		// 半端な仕上がりになりやすかった。そこで構造ごと作り直し、
		// 中心に大小の階層を持たせず、要素どうしのサイズ・間隔・モチーフを
		// 独立にばらけさせた「本数の多い列」に寄せてある（対称にするときは
		// 半分だけ作って厳密に鏡写しする＝「対称のつもりが微妙にずれる」を無くす）。
		const count = options.pairCount ? options.pairCount * 2 + 1 : pick([3, 4, 4, 5, 5, 6]);

		if (isSymmetric) {
			// 軸の右半分だけ組み立てて、そのまま鏡写しで左へ複製する。
			// 生成後に対称判定するのではなく最初から鏡写しなので、必ずぴったり揃う。
			const hasCenter = count % 2 === 1;
			const sideCount = Math.floor(count / 2);
			if (hasCenter) {
				layers.push(
					buildElement(plan, groupId, {
						x: axisX,
						y: baseY,
						size: randRange(24, 56),
						slot: nextSlot(),
						accent: chance(0.35),
						filled: chance(0.25),
						cycleShift: 0,
						rateMul: nextRate(),
						z: nextZ(),
					}),
				);
			}
			let cursor = randRange(30, 55);
			for (let i = 0; i < sideCount; i++) {
				if (cursor > MV_W / 2 - 16) break;
				const size = randRange(18, 54);
				const s = nextSlot();
				const rate = nextRate();
				const shift = 1 + i;
				layers.push(
					buildElement(plan, groupId, {
						x: axisX - cursor,
						y: baseY,
						size,
						slot: s,
						accent: chance(0.2),
						filled: false,
						cycleShift: shift,
						rateMul: rate,
						z: nextZ(),
					}),
				);
				layers.push(
					buildElement(plan, groupId, {
						x: axisX + cursor,
						y: baseY,
						size,
						slot: s,
						accent: chance(0.2),
						filled: false,
						cycleShift: shift,
						rateMul: rate,
						z: nextZ(),
					}),
				);
				// 次の間隔も独立にばらつかせる。等間隔だと本数を増やしても
				// 結局「同じ間隔で並んだ判子」に見えてしまう。
				cursor += size * randRange(1.1, 2.2) + randRange(10, 30);
			}
		} else {
			// 非対称: 軸の左右に要素を独立にばらまく。サイズ・間隔・モチーフの
			// どれも他の要素と無関係に決めるので、「大きい1枚を小さいのが
			// 両脇から挟む」ような階層は生まれない。
			let cursor = randRange(-40, 40);
			for (let i = 0; i < count; i++) {
				const x = axisX + cursor;
				if (x < 24 || x > MV_W - 24) break;
				const size = randRange(16, 56);
				layers.push(
					buildElement(plan, groupId, {
						x,
						y: baseY,
						size,
						slot: nextSlot(),
						accent: chance(0.25),
						filled: chance(0.15),
						cycleShift: i,
						rateMul: nextRate(),
						z: nextZ(),
					}),
				);
				// 左右どちらへ伸びるかも要素ごとに決め直す（一方向だけに並ぶと
				// 結局また「帯」の単調な列に戻ってしまう）。
				const dir = chance(0.5) ? 1 : -1;
				cursor += dir * (size * randRange(0.9, 1.8) + randRange(12, 34));
			}
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
 * 「特殊アレンジ」1回ぶんの既定の長さ（拍）。トリガー窓（小節に換算して
 * `MvArrangementTrigger.endBar` を決める）の既定値としても使う。
 */
export const DEFAULT_ARRANGEMENT_BEATS = 4;


/**
 * ある区間（`phaseOffsetBar` 小節目〜 `+bars` 小節ぶん）の中だけで
 * 「基準値→山→基準値」と単発で盛り上がって収まる山形を作る。
 *
 * エンジンが持つ一次波形は減衰カーブ（`beat`/`bar`）か、フレーズ境界で
 * 山になる `phrase(symmetric)`（境目=1・中央=0）の2つしか無い。後者を
 * 「1(=基準)を足してから境目=1の波形を引く」と、逆に「中央=amount・境目=0」
 * という単発の盛り上がり山になる——これを利用して `bars` に区間の長さその
 * ものを渡せば、区間の頭と終わりでは効果0（＝アレンジ元と同じ見た目）、
 * 区間の真ん中でだけ最大効果、というちょうど1回ぶんの山になる。
 * `phrase` はループする波形だが、この山を使うレイヤー自身を `barRange` で
 * その区間だけに限定しているので、区間の外で山が繰り返し鳴る心配は無い。
 */
function oneShotHump(
	target: MvModTarget,
	amount: number,
	bars: number,
	phaseOffsetBar: number,
	curve: number,
	shape?: "decay" | "bounce",
): MvModulator[] {
	return [
		{ source: "constant", target, op: "add", amount },
		{
			source: "phrase",
			target,
			op: "sub",
			amount,
			bars: Math.max(0.05, bars),
			phaseOffset: phaseOffsetBar,
			symmetric: true,
			curve,
			shape,
		},
	];
}

/**
 * 特殊アレンジの中身を作る「単発イベント」の種類。
 *
 * 以前は区間全体に1つの型（回転キック／破裂／…）を引き伸ばして適用していたが、
 * これだと型を何種類増やしても「1つの動きが速いか遅いか」の違いにしかならず、
 * 参考にした絵にある「点滅→点滅→形状変換1→形状変換2」のような、短い区間の
 * 中で何度も表情が変わる密度のアニメーションは原理的に作れなかった
 * （ユーザー指摘：「ランダム生成ロジックに根本的な欠陥がある」）。
 *
 * ここでは区間を半拍〜1拍の短いスロットに分割し、スロットごとに独立して
 * イベントを1つ選ぶ「シーケンサ」方式に作り替えてある。各スロットは
 * `MvShapeLayer.barRange` で区切った専用のレイヤーとして持ち、スロットが
 * 終われば次のスロットのレイヤーへエンジンの `isLayerVisible` がそのまま
 * 切り替えてくれる——ループを新設する必要が無く、`oneShotHump` の山も
 * そのスロットの中で頭0→中央ピーク→終わり0ときっちり収まる。
 */
type MicroEvent =
	| "blink"
	| "kick"
	| "stretch"
	| "shapeSwap"
	| "squareBurst"
	| "multiply";
const MICRO_EVENTS: MicroEvent[] = [
	"blink",
	"kick",
	"stretch",
	"shapeSwap",
	"squareBurst",
	"multiply",
];

/** 直前と同じイベントを連続で選ばない（`buildRandomMotifStrokes` と同じ考え方）。 */
function pickMicroEvent(lastEvent: MicroEvent | null): MicroEvent {
	const ev = pick(MICRO_EVENTS);
	if (ev !== lastEvent) return ev;
	return MICRO_EVENTS[(MICRO_EVENTS.indexOf(ev) + 1) % MICRO_EVENTS.length];
}

/**
 * 既存の図形グループのレイヤー配列を元にして、展開の変化に使える
 * 「特殊アレンジ」のレイヤー配列を生成する。
 *
 * `sourceGroupId` は割り込み対象（アレンジ元）のグループID。返す `group.arrangement`
 * にそのまま埋め込むので、エンジン側 (`isLayerVisible`) が「アレンジ元を止めて隠す
 * ／アレンジ側を表示する」を自動で連動させられる。割り込み位置は `trigger.triggerBar`
 * （小節、小数可）で指定する。長さは呼び出し側が `trigger.endBar` で渡した拍数を
 * そのまま使う（小節へ切り上げない——切り上げると「2拍と指定したのに1小節ぶん
 * 再生される」というズレになる）。再生し終えれば `isLayerVisible` が自動でアレンジ元
 * へ戻すので、終了位置を別途指定する必要は無い。
 */
export function generateArrangementForGroup(
	existingLayers: MvShapeLayer[],
	nextZ: () => number,
	sourceGroupId: string,
	trigger?: { triggerBar?: number; endBar?: number },
): { group: MvLayerGroup; layers: MvShapeLayer[] } {
	const newGroupId = mvUid("grp");
	const triggerBar = trigger?.triggerBar ?? 0;
	const durationBars =
		trigger?.endBar !== undefined
			? Math.max(0.05, trigger.endBar - triggerBar)
			: DEFAULT_ARRANGEMENT_BEATS / MV_BEATS_PER_BAR;
	const endBar = triggerBar + durationBars;
	const group: MvLayerGroup = {
		id: newGroupId,
		name: "特殊アレンジ",
		collapsed: true,
		arrangement: { sourceGroupId, triggerBar, endBar },
	};
	const layers: MvShapeLayer[] = [];

	const durationBeats = durationBars * MV_BEATS_PER_BAR;
	// スロット幅は半拍〜1拍。短いほどイベント数が増えて密度の高い動きになる
	// （8スロット/区間を上限にして、長い区間でレイヤー数が際限なく増えないようにする）。
	const slotBeats = pick([0.5, 0.5, 0.75, 1]);
	const slotCount = Math.min(
		8,
		Math.max(2, Math.round(durationBeats / slotBeats)),
	);
	const slotBars = durationBars / slotCount;

	// イベントはスロットごとに1つだけ選び、グループ内の全レイヤーで共有する
	// （レイヤーごとに別々のイベントを独立に選んでいた以前の実装は、同じ瞬間に
	// 図形ごとバラバラの変化が起きる寄せ集めになり、参考動画にある「その瞬間
	// 画面全体が一斉に別の表情へ切り替わる」というまとまりが出せなかった
	// ——ユーザー指摘。イベントの中身（角度・コマの選び方など）はレイヤーごとに
	// 振るが、"何をするか" と "いつ" は画面全体で揃える）。
	let lastEvent: MicroEvent | null = null;
	const slotEvents: MicroEvent[] = [];
	for (let i = 0; i < slotCount; i++) {
		const ev = pickMicroEvent(lastEvent);
		slotEvents.push(ev);
		lastEvent = ev;
	}

	for (const orig of existingLayers) {
		for (let i = 0; i < slotCount; i++) {
			const slotFrom = triggerBar + i * slotBars;
			const slotTo = slotFrom + slotBars;
			const ev = slotEvents[i];

			const newLayer: MvShapeLayer = {
				...orig,
				id: mvUid("shp"),
				groupId: newGroupId,
				z: nextZ(),
				barRange: [slotFrom, slotTo],
				modulators: [],
			};

			switch (ev) {
				case "blink":
					// 一瞬だけ暗く落ちて戻る単発の点滅。
					newLayer.modulators = [
						{
							source: "phrase",
							target: "opacity",
							op: "mul",
							amount: 1,
							bars: slotBars,
							phaseOffset: slotFrom,
							symmetric: true,
							curve: pick([4, 6, 8]),
						},
					];
					break;
				case "kick": {
					// 回転のキック。毎スロット角度・カーブを振り直すことで
					// 「同じキックの繰り返し」に見えないようにする。3回に1回くらいは
					// `bounce`（弾んで止まる振動）にして、単調な減衰だけにならないようにする。
					const kickShape = chance(0.35) ? "bounce" : "decay";
					newLayer.modulators = oneShotHump(
						"rotation",
						chance(0.5)
							? pick([90, 120, 180, 270, 360])
							: -pick([90, 120, 180, 270, 360]),
						slotBars,
						slotFrom,
						pick([2, 3, 4]),
						kickShape,
					);
					break;
				}
				case "stretch": {
					// 一瞬だけ大きく伸びて元のサイズへ戻る「ストレッチ」。
					// 伸びる瞬間は太さを細くして引き伸ばされた質感を足す。
					const stretchAmount = roundTo(
						(orig.size ?? 20) * randRange(1.4, 2.6),
						1,
					);
					const thinAmount = roundTo(
						(orig.thickness ?? 3) * randRange(0.4, 0.7),
						1,
					);
					const stretchShape = chance(0.35) ? "bounce" : "decay";
					newLayer.modulators = [
						...oneShotHump("size", stretchAmount, slotBars, slotFrom, 5, stretchShape),
						...oneShotHump("thickness", -thinAmount, slotBars, slotFrom, 5, stretchShape),
					];
					break;
				}
				case "shapeSwap": {
					// コマ送り用のコマの中から、いま出ているのとは別の1コマへ
					// パッと静止的に切り替える。コマ送りをそのまま流すより
					// 「別の形へ変換した」感が強く出る。
					if (
						orig.form === "path" &&
						orig.iconCycle &&
						orig.iconCycle.paths.length > 1
					) {
						const paths = orig.iconCycle.paths;
						const curIdx = orig.path ? paths.indexOf(orig.path) : 0;
						let idx = Math.floor(Math.random() * paths.length);
						if (idx === curIdx) idx = (idx + 1) % paths.length;
						newLayer.path = paths[idx];
						newLayer.iconCycle = undefined;
					}
					newLayer.modulators = oneShotHump(
						"size",
						roundTo((orig.size ?? 20) * randRange(0.3, 0.6), 1),
						slotBars,
						slotFrom,
						4,
					);
					break;
				}
				case "squareBurst": {
					// 元の図形は少し暗く沈めておいて、主役は図形の位置から
					// 広がって消える四角形のバースト（枠線のみ、色は元の図形と同じ）にする。
					newLayer.modulators = [
						{ source: "constant", target: "opacity", op: "mul", amount: 0.55 },
					];
					layers.push({
						kind: "shape",
						form: "path",
						id: mvUid("shp"),
						groupId: newGroupId,
						x: orig.x,
						y: orig.y,
						z: nextZ(),
						rotation: 0,
						barRange: [slotFrom, slotTo],
						color: orig.color ?? "#ffffff",
						filled: false,
						thickness: randRange(2, 4),
						size: (orig.size ?? 20) * 0.5,
						count: 1,
						spread: 0,
						spin: 0,
						blend: "normal",
						path: rectPath(15, 15, 85, 85),
						pathBox: [0, 0, 100, 100],
						modulators: [
							...oneShotHump(
								"size",
								roundTo((orig.size ?? 20) * randRange(1.8, 3), 1),
								slotBars,
								slotFrom,
								2,
							),
							{ source: "constant", target: "opacity", op: "mul", amount: 0 },
							...oneShotHump("opacity", 1, slotBars, slotFrom, 2),
						],
					});
					break;
				}
				case "multiply": {
					// 分身が湧いて弾けるように飛び散り、また1個へ戻る。
					// `offsetX`/`offsetY`/`spread`（複製の間隔・広がり半径）は
					// モジュレータで直接動かせる対象になったので、間隔を固定値のまま
					// 個数だけ増やす「静止した配置」ではなく、間隔そのものを
					// 0→最大→0と一発で振る——湧いた瞬間に画面へ飛び散り、
					// 区間の終わりには間隔も0に戻って重なった1個に見える。
					const dirX = pick([-1, 1]) * randRange(0.6, 1);
					const dirY = pick([-1, 1]) * randRange(0.6, 1);
					const spacing = randRange(30, 60);
					const copies = pick([3, 4, 5, 6]);
					newLayer.count = 1;
					newLayer.spread = 0;
					newLayer.offsetX = 0;
					newLayer.offsetY = 0;
					newLayer.spin = pick([0, 0, 20, -20]);
					// bounce にすると「湧いて弾んで散らばる」勢いが出る。decay だと
					// スッと広がって収まる落ち着いた散り方になる——どちらも混ぜて使う。
					const multiplyShape = chance(0.5) ? "bounce" : "decay";
					newLayer.modulators = [
						...oneShotHump("count", copies - 1, slotBars, slotFrom, 3, multiplyShape),
						...oneShotHump(
							"offsetX",
							roundTo(spacing * dirX, 1),
							slotBars,
							slotFrom,
							3,
							multiplyShape,
						),
						...oneShotHump(
							"offsetY",
							roundTo(spacing * dirY, 1),
							slotBars,
							slotFrom,
							3,
							multiplyShape,
						),
						...oneShotHump(
							"rotation",
							chance(0.5) ? pick([90, 180, 270]) : -pick([90, 180, 270]),
							slotBars,
							slotFrom,
							3,
							multiplyShape,
						),
					];
					break;
				}
			}

			layers.push(newLayer);
		}
	}

	return { group, layers };
}
