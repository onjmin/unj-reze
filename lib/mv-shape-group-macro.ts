import {
	MV_BEATS_PER_BAR,
	MV_H,
	MV_STEPS_PER_BEAT,
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

/**
 * コマ列を `total` コマの枠の `offset` 位置から置き、残りは空白（""）で埋める。
 * 空白コマはエンジン側（`drawShapeLayer` の `!fr.path` スキップ）で何も描かれない。
 * "duet" 構図の「1拍の中で別々の構図が交互に出る」を作る要。
 */
function placeFrames(frames: string[], offset: number, total: number): string[] {
	const out: string[] = new Array(total).fill("");
	for (let i = 0; i < frames.length && offset + i < total; i++) {
		out[offset + i] = frames[i];
	}
	return out;
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

/** 「ベースの拍」に選べる値。半拍〜8小節。 */
export const MV_SHAPE_BASE_BEATS_OPTIONS: { value: number; label: string }[] = [
	{ value: 0.5, label: "半拍（倍速）" },
	{ value: 1, label: "1拍（既定）" },
	{ value: 2, label: "2拍" },
	{ value: 4, label: "1小節（4拍）" },
	{ value: 8, label: "2小節（8拍）" },
	{ value: 16, label: "4小節（16拍）" },
	{ value: 32, label: "8小節（32拍）" },
];

/**
 * 「拍の組み合わせ」の候補となる絶対の周期(拍)。`MV_SHAPE_BASE_BEATS_OPTIONS`の
 * 整数拍ぶんと揃えてある（0.5拍は「ベースの拍」専用の特殊値なのでここには含めない）。
 */
const BEAT_COMBO_LEVELS = [1, 2, 4, 8, 16, 32];

/**
 * 周期(拍)と位相(拍)の組。位相0が表拍、位相=周期/2が「裏拍」
 * （その周期のちょうど半分ずらした位置）を表す。
 */
interface BeatCombo {
	periodBeats: number;
	phaseBeats: number;
}

/**
 * ベースの拍から「選んだ拍以上の周期 × 表拍/裏拍」の全組み合わせを作る。
 *
 * 例: ベース1拍 → 1,2,4,8,16,32拍のそれぞれに表拍・裏拍の2通り＝12通り。
 *     ベース4拍 → 4,8,16,32拍（1,2拍はベース未満なので除外）の2通り＝8通り。
 * （ユーザー要件の列挙どおり。ベースが `BEAT_COMBO_LEVELS` に無い半端な値
 * （半拍など）でもベース自身は必ず候補へ含める。）
 */
function buildBeatCombos(baseBeats: number): BeatCombo[] {
	const periods = BEAT_COMBO_LEVELS.filter((p) => p >= baseBeats);
	if (!periods.includes(baseBeats)) periods.unshift(baseBeats);
	const combos: BeatCombo[] = [];
	for (const p of periods) {
		combos.push({ periodBeats: p, phaseBeats: 0 });
		combos.push({ periodBeats: p, phaseBeats: p / 2 });
	}
	return combos;
}

/** 「組み合わせ密度」の既定値。1（全部）だと拍だけで12〜8種を同時に踏み過ぎて
 * うるさくなる（ユーザー指摘の「過剰」）ため、既定は半分ほどに間引く。 */
export const DEFAULT_BEAT_COMBO_DENSITY = 0.5;

/**
 * 密度(0..1)ぶんだけ組み合わせを間引く。1個も残らなかった場合はベースの表拍
 * だけを保証で残す（間引きすぎて「何も動かないグループ」になるのを防ぐ）。
 */
function thinBeatCombos(
	combos: BeatCombo[],
	density: number,
	baseBeats: number,
): BeatCombo[] {
	const d = Math.min(1, Math.max(0, density));
	const kept = combos.filter(() => chance(d));
	if (kept.length > 0) return kept;
	return [{ periodBeats: baseBeats, phaseBeats: 0 }];
}

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
	 * "duet" = **1拍の中で「横並びの列」と「中央の大きなエンブレム」が交互に出る**。
	 *   参考動画（チョウチン少女）を30fpsで全249フレーム定量解析した結果、通常ループの
	 *   正体は「複数レイヤーが同時に見えている」のではなく、1拍(約0.43秒)を8コマに割り、
	 *   前半4コマ=横並びの小さな図形列 / 後半3コマ=中央の大きなエンブレム / 最後1コマ=無
	 *   という**画面まるごとの構図の交互切り替え**だった（バウンディングボックスが
	 *   269x67〜345x105（横長）と165x165（正方形）を毎拍往復し、両方が同時に出る
	 *   フレームは通常ループ中に1枚も無い）。これを iconCycle の空白コマで実装する。
	 * duet 以外は**中央の横一線から外れない**——参考動画に上下バラバラの配置は無い。
	 * "ripple" = form:'ripple'（輪が広がって消える）を、`baseBeats`以上の
	 *   拍の組み合わせ（`buildBeatCombos`/`comboDensity`）で複数周期重ね置く。
	 *   単一周期だと単調な「毎小節同じ輪」にしかならないため、遅い輪の中を
	 *   速い輪がくぐるような多層のリズムにしてある。
	 */
	clusterType?: "centered" | "scattered" | "bars" | "duet" | "ripple";
	/**
	 * 「ベースの拍」以上の周期（1/2/4/8/16/32拍）× 表拍/裏拍のうち、実際に
	 * 組み合わせへ使う割合(0..1)。未指定は `DEFAULT_BEAT_COMBO_DENSITY`(0.5)。
	 * 1にすると全組み合わせ（ベース1拍なら12種、4拍なら8種）を一度に使うが、
	 * 過剰に賑やかになりやすいので既定は半分ほどに間引いてある。
	 */
	comboDensity?: number;
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
	/** このグループ1回ぶんに実際に使う「周期×表拍/裏拍」の組み合わせ（間引き済み）。 */
	beatCombos: BeatCombo[];
}

/**
 * 要素ごとに割り当てる周期・位相の組を、グループの `beatCombos`
 * （ベースの拍以上の周期×表拍/裏拍を密度で間引いたプール）から順番に回して返す。
 *
 * 全要素が同じ周期・位相だと、いくら要素を増やしても1枚の絵が明滅しているだけに
 * 見える。プールを使い切ったら先頭へ戻って再利用する（要素数がプールより多くても
 * 必ず全種類が最低1回は使われることを保証するため、確率抽選ではなく巡回にしてある）。
 */
function makeComboCycler(combos: BeatCombo[]): () => BeatCombo {
	let i = 0;
	return () => combos[i++ % combos.length];
}

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
		/** この要素が受け持つ周期・位相（`plan.beatCombos` から巡回で割り当てたもの）。 */
		combo: BeatCombo;
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
	const periodBeats = roundTo(opts.combo.periodBeats, 2);
	// スロットによる均等な位相ずらしに、コンボの表拍/裏拍オフセットを重ねる。
	// 周期でmodulo済みにしておかないと、遅い要素（periodBeatsが大きい）で
	// 足したぶんが周期を超えて位相が意図とズレる。
	const rawPhaseOffset =
		(opts.slot % plan.slots) * (periodBeats / plan.slots) + opts.combo.phaseBeats;
	const phaseOffset = roundTo(
		((rawPhaseOffset % periodBeats) + periodBeats) % periodBeats,
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
		beatCombos: thinBeatCombos(
			buildBeatCombos(baseBeats),
			options.comboDensity ?? DEFAULT_BEAT_COMBO_DENSITY,
			baseBeats,
		),
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

	// 要素ごとの周期・位相。`plan.beatCombos`（ベース拍以上の周期×表拍/裏拍を
	// 密度で間引いたプール）を巡回で割り当てる。
	const nextCombo = makeComboCycler(plan.beatCombos);

	if (clusterType === "duet") {
		// ── 1拍の中で「横並びの列」と「中央エンブレム」が交互に出る構図 ──
		// 参考動画の通常ループの実測構造そのもの（clusterType の doc コメント参照）。
		// 1拍を8コマに割り、前半4コマ＝横並びの小さな図形列、後半3コマ＝中央の
		// 大きなエンブレム、最後の1コマ＝空白。両者は同時には絶対に出ない。
		const FRAMES = 8;
		const baseBeats = plan.baseBeats;

		// 中央エンブレム（大）。モチーフのコマ送りを後半3コマに置く。
		const emblemFrames = motifFrames(buildRandomMotifStrokes()).slice(0, 3);
		const emblemSize = randRange(85, 120);
		layers.push({
			kind: "shape",
			form: "path",
			id: mvUid("shp"),
			groupId,
			x: axisX,
			y: baseY,
			z: nextZ(),
			rotation: 0,
			color: plan.mainColor,
			filled: false,
			thickness: roundTo(plan.baseThickness, 1),
			size: emblemSize,
			count: 1,
			spread: 0,
			spin: 0,
			blend: "normal",
			path: emblemFrames[0],
			pathBox: [0, 0, 100, 100],
			iconCycle: {
				paths: placeFrames(emblemFrames, 4, FRAMES),
				beats: baseBeats,
				crossfade: 0.35,
			},
			modulators: crispModulators({
				size: emblemSize,
				thickness: plan.baseThickness,
				periodBeats: baseBeats,
				phaseOffset: 0,
				phraseBars: plan.phraseBars,
				swell: plan.swell,
			}),
		});
		// 芯の塗り四角。エンブレムと同じ後半コマだけ出る。
		layers.push({
			kind: "shape",
			form: "path",
			id: mvUid("shp"),
			groupId,
			x: axisX,
			y: baseY,
			z: nextZ(),
			rotation: 0,
			color: plan.mainColor,
			filled: true,
			thickness: 2,
			size: roundTo(emblemSize * randRange(0.32, 0.45), 1),
			count: 1,
			spread: 0,
			spin: 0,
			blend: "normal",
			path: rectPath(20, 20, 80, 80),
			pathBox: [0, 0, 100, 100],
			iconCycle: {
				paths: placeFrames(
					[rectPath(20, 20, 80, 80), rectPath(24, 24, 76, 76), rectPath(28, 28, 72, 72)],
					4,
					FRAMES,
				),
				beats: baseBeats,
				crossfade: 0.35,
			},
			modulators: [],
		});

		// 横並びの列（小）。左右対称ペア×2〜3組。前半4コマだけ出る。
		const pairCount = options.pairCount ?? pick([2, 2, 3]);
		let cursor = randRange(60, 95);
		for (let i = 0; i < pairCount; i++) {
			if (cursor > MV_W / 2 - 24) break;
			const size = randRange(16, 32);
			const rowFrames = motifFrames(buildRandomMotifStrokes()).slice(0, 4);
			for (const sign of [-1, 1]) {
				layers.push({
					kind: "shape",
					form: "path",
					id: mvUid("shp"),
					groupId,
					x: roundTo(axisX + cursor * sign, 1),
					y: baseY,
					z: nextZ(),
					rotation: 0,
					color: plan.mainColor,
					filled: false,
					thickness: roundTo(Math.min(plan.baseThickness, size * 0.25), 1),
					size,
					count: 1,
					spread: 0,
					spin: 0,
					blend: "normal",
					path: rowFrames[0],
					pathBox: [0, 0, 100, 100],
					iconCycle: {
						paths: placeFrames(rowFrames, 0, FRAMES),
						beats: baseBeats,
						crossfade: 0.35,
					},
					modulators: [],
				});
			}
			cursor += size * randRange(1.4, 2.2) + randRange(16, 40);
		}
		return layers;
	}

	if (clusterType === "ripple") {
		// ── 波紋（form:'ripple'）を複数周期で重ねる ──
		// 単一周期だと「毎小節同じ輪」の単調な絵にしかならない。`plan.beatCombos`
		// （ベース拍以上の周期×表拍/裏拍を密度で間引いたプール）を1つずつ輪へ
		// 割り当て、遅く大きい輪の中を速く小さい輪がくぐるような多層のリズムを作る。
		const ringCount = Math.min(8, plan.beatCombos.length);
		const palette = [plan.mainColor, plan.accentColor];
		for (let i = 0; i < ringCount; i++) {
			const combo = nextCombo();
			// 遅い(=大きい周期の)輪ほど大きく描く——速い輪が外まで広がりきる前に
			// 遅い輪の内側をくぐる、という重なりの階層を作るため。
			const periodRank = BEAT_COMBO_LEVELS.indexOf(combo.periodBeats);
			const outerSize =
				randRange(70, 150) * (1 + Math.max(0, periodRank) * 0.35);
			layers.push({
				kind: "shape",
				form: "ripple",
				id: mvUid("shp"),
				groupId,
				x: axisX,
				y: baseY,
				z: nextZ(),
				rotation: 0,
				color: i === 0 ? plan.mainColor : pick(palette),
				filled: false,
				thickness: roundTo(plan.baseThickness * randRange(0.6, 1), 1),
				size: roundTo(outerSize, 1),
				count: 1,
				spread: 0,
				spin: 0,
				blend: "normal",
				pathBox: [0, 0, 100, 100],
				rippleBeats: combo.periodBeats,
				ripplePhaseOffset: roundTo(combo.phaseBeats, 2),
				modulators: [],
			});
		}
		return layers;
	}

	if (isCentered) {
		// ── 同心に積むエンブレム構図 ──
		// **段は1〜2枚まで**。モチーフ自体が既に「枠の中に枠、その中に芯」という
		// 入れ子を持っているので、そこへ同心の段を3枚重ねると入れ子が二重にかかり、
		// 画面の真ん中に細かい模様が固まっただけの絵になる（実際そうなっていた）。
		// 参考動画も主役は大きなモチーフ1つ＋小さな脇役、という構成。
		const outer = randRange(95, 140);
		// コメント通り「主役1つ＋小さな脇役」が基本形なので、常に2段にする
		// （以前は `chance(0.4)?2:1` で単段が60%、直近の修正でも25%残っていた——
		// 「1個だけの寂しい絵」になる理由が無いので、抽選自体をやめて固定した）。
		const tierCount = options.pairCount ?? 2;
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
					combo: nextCombo(),
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
			// 差し色の棒は本体の列(baseBeats固定)と違う周期・位相を割り当てる
			// ——「選んだ拍以上の組み合わせ」が列の中にも混ざるようにするため。
			const combo = nextCombo();
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
						periodBeats: roundTo(combo.periodBeats, 2),
						phaseOffset: roundTo(combo.phaseBeats, 2),
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
						combo: nextCombo(),
						z: nextZ(),
					}),
				);
			}
			let cursor = randRange(30, 55);
			for (let i = 0; i < sideCount; i++) {
				if (cursor > MV_W / 2 - 16) break;
				const size = randRange(18, 54);
				const s = nextSlot();
				const combo = nextCombo();
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
						combo,
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
						combo,
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
						combo: nextCombo(),
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


// ───────────────── 特殊アレンジ用のグリフ（塗り主体） ─────────────────
//
// 参考動画の割り込み区間（実測1.93〜3.63秒）の終盤に出る「画面のあちこちに
// 散らばる要素」は、通常ループの線画モチーフとは別種の**塗りつぶし主体の
// グリフ**（バーチャート・縞の入った箱・目盛りの列）だった。ここはその語彙を
// 新しく起こす——元レイヤーの変形では作れない絵なので、アレンジが自前で
// グリフを発明する（「無から参考エフェクトを生み出す」ためのパーツ）。

/**
 * 塗りグリフの「部品分解＋アンカー付き成長」共通ヘルパー。
 *
 * 全体を一様スケールする（＝ズームにしか見えない）のではなく、各部品ごとに
 * 「固定される辺（アンカー）」と「伸びる軸」を持たせ、成長進度 t(0..1) に応じて
 * アンカー側は動かさず反対側の辺だけをアンカーへ向けて縮める＝t=0 で
 * 「アンカー際の細い線」、t=1 で「本来の形」になるようにする。
 * イージングは easeOutCubic（勢いよく伸びて着地）で統一。
 */
function easeOutCubic(t: number): number {
	const c = Math.min(1, Math.max(0, t));
	return 1 - (1 - c) ** 3;
}

/** 縦方向（下辺アンカー）に伸びる矩形1本の、進度tでのパス。 */
function growUpRect(x: number, w: number, bottomY: number, fullH: number, t: number): string {
	const minH = 2;
	const h = minH + (fullH - minH) * easeOutCubic(t);
	return rectPath(x, bottomY - h, x + w, bottomY);
}

/** 中心線を軸に上下対称へ伸びる矩形1本の、進度tでのパス。 */
function growFromCenterYRect(x: number, w: number, centerY: number, fullH: number, t: number): string {
	const minH = 2;
	const h = minH + (fullH - minH) * easeOutCubic(t);
	return rectPath(x, centerY - h / 2, x + w, centerY + h / 2);
}

/** 中心点を軸に左右対称へ伸びる横長矩形の、進度tでのパス。 */
function growFromCenterXRect(centerX: number, y0: number, y1: number, fullW: number, t: number): string {
	const minW = 2;
	const w = minW + (fullW - minW) * easeOutCubic(t);
	return rectPath(centerX - w / 2, y0, centerX + w / 2, y1);
}

/** 上辺アンカーで下方向に伸びる矩形。 */
function growDownRect(x: number, w: number, topY: number, fullH: number, t: number): string {
	const minH = 2;
	const h = minH + (fullH - minH) * easeOutCubic(t);
	return rectPath(x, topY, x + w, topY + h);
}

/** 左辺アンカーで右方向に伸びる矩形。 */
function growRightRect(y0: number, y1: number, leftX: number, fullW: number, t: number): string {
	const minW = 2;
	const w = minW + (fullW - minW) * easeOutCubic(t);
	return rectPath(leftX, y0, leftX + w, y1);
}

/** 右辺アンカーで左方向に伸びる矩形。 */
function growLeftRect(y0: number, y1: number, rightX: number, fullW: number, t: number): string {
	const minW = 2;
	const w = minW + (fullW - minW) * easeOutCubic(t);
	return rectPath(rightX - w, y0, rightX, y1);
}

/** 中心点アンカーで縦横それぞれ独立の寸法(fullW/fullH)へ伸びる矩形。 */
function growFromCenterWH(
	cx: number,
	cy: number,
	fullW: number,
	fullH: number,
	t: number,
): string {
	const min = 2;
	const w = min + (fullW - min) * easeOutCubic(t);
	const h = min + (fullH - min) * easeOutCubic(t);
	return rectPath(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
}

// ───────────────── 幾何学模様の無限生成（再帰的矩形分割） ─────────────────
//
// 手作りの語彙（bar/can/tick/cross/dots/frame）は結局は有限個の型しか作れない。
// ここでは一般的な生成アート手法である「再帰的矩形分割」（別名 guillotine cut /
// Mondrian式BSP——箱を毎回ランダムな向き・比率で2分割し、葉に達したら矩形として
// 残す）を実装し、深さ・分割比・アンカー・隙間をすべて乱数にすることで
// 理論上無限のバリエーションを出せるようにする。矩形の集合という出力形式は
// 既存の「部品分解＋アンカー付き成長」パイプラインとそのまま噛み合う——
// 分割で生まれた各葉に、どの辺を固定して伸ばすか（アンカー）を1つ乱数で
// 割り当てるだけで、成長アニメーションが手作りグリフと同じ枠組みで動く。

type GeoAnchor = "bottom" | "top" | "left" | "right" | "centerX" | "centerY" | "center";
const GEO_ANCHORS: GeoAnchor[] = [
	"bottom",
	"top",
	"left",
	"right",
	"centerX",
	"centerY",
	"center",
];

interface GeoCell {
	x: number;
	y: number;
	w: number;
	h: number;
	anchor: GeoAnchor;
}

interface GeoPlan {
	cells: GeoCell[];
}

/**
 * 箱(x,y,w,h)を再帰的に2分割し、葉（分割をやめた箱）を隙間ぶん内側に縮めて
 * セルとして採用する。分割の向き・比率・深さ・葉を採用するかどうか・隙間の量
 * ——すべて乱数なので、同じ呼び出しでも毎回まったく違う構図が出る。
 */
function planGeo(): GeoPlan {
	const cells: GeoCell[] = [];
	const gapRatio = randRange(0.06, 0.16);
	const maxDepth = 2 + Math.floor(Math.random() * 3); // 2〜4階層
	const subdivide = (x: number, y: number, w: number, h: number, depth: number) => {
		// 深いほど「もう分割せず葉にする」確率が上がる（無限に細かくならないように）。
		const stopChance = depth <= 0 ? 1 : 0.28 + (maxDepth - depth) * 0.12;
		if (w < 10 || h < 10 || Math.random() < stopChance) {
			// 葉を間引くことで「隙間（負の空間）」も生まれ、格子で埋め尽くされた
			// 単調な絵にならない。
			if (Math.random() < 0.82) {
				const gapX = w * gapRatio;
				const gapY = h * gapRatio;
				const cx = x + gapX;
				const cy = y + gapY;
				const cw = Math.max(3, w - gapX * 2);
				const ch = Math.max(3, h - gapY * 2);
				cells.push({
					x: cx,
					y: cy,
					w: cw,
					h: ch,
					anchor: pick(GEO_ANCHORS),
				});
			}
			return;
		}
		const vertical = chance(0.5);
		const ratio = randRange(0.32, 0.68);
		if (vertical) {
			const w1 = w * ratio;
			subdivide(x, y, w1, h, depth - 1);
			subdivide(x + w1, y, w - w1, h, depth - 1);
		} else {
			const h1 = h * ratio;
			subdivide(x, y, w, h1, depth - 1);
			subdivide(x, y + h1, w, h - h1, depth - 1);
		}
	};
	subdivide(4, 4, 92, 92, maxDepth);
	if (cells.length === 0) {
		cells.push({ x: 30, y: 30, w: 40, h: 40, anchor: "center" });
	}
	return { cells };
}

/** 各セルのアンカーに応じた成長関数へ振り分けて描画する。 */
function renderGeo(plan: GeoPlan, t: number): string {
	return plan.cells
		.map((c) => {
			switch (c.anchor) {
				case "bottom":
					return growUpRect(c.x, c.w, c.y + c.h, c.h, t);
				case "top":
					return growDownRect(c.x, c.w, c.y, c.h, t);
				case "left":
					return growRightRect(c.y, c.y + c.h, c.x, c.w, t);
				case "right":
					return growLeftRect(c.y, c.y + c.h, c.x + c.w, c.w, t);
				case "centerX":
					return growFromCenterXRect(c.x + c.w / 2, c.y, c.y + c.h, c.w, t);
				case "centerY":
					return growFromCenterYRect(c.x, c.w, c.y + c.h / 2, c.h, t);
				case "center":
					return growFromCenterWH(c.x + c.w / 2, c.y + c.h / 2, c.w, c.h, t);
			}
		})
		.join(" ");
}

interface BarChartPlan {
	x: number;
	w: number;
	h: number;
}

/** イコライザー風の縦棒列。高さは1本ずつ独立に振れる。 */
function planBarChart(): BarChartPlan[] {
	const n = 4 + Math.floor(Math.random() * 4); // 4〜7本
	const gap = randRange(3, 6);
	const w = randRange(6, 11);
	let x = 50 - ((w + gap) * n - gap) / 2;
	const plan: BarChartPlan[] = [];
	for (let i = 0; i < n; i++) {
		const h = randRange(15, 60);
		plan.push({ x, w, h });
		x += w + gap;
	}
	return plan;
}

/** 底辺(y=80)を固定したまま、進度tぶん各バーの高さだけを成長させる。 */
function renderBarChart(plan: BarChartPlan[], t: number): string {
	return plan.map((b) => growUpRect(b.x, b.w, 80, b.h, t)).join(" ");
}

interface CanisterPlan {
	stripes: { x: number; w: number }[];
}

/** 上下に細いラインを持つ、縦縞の入った箱（参考動画の左右の主役）。 */
function planCanister(): CanisterPlan {
	const stripes = 3 + Math.floor(Math.random() * 2); // 3〜4本
	const gap = randRange(2.5, 5);
	const span = 70;
	const w = (span - gap * (stripes - 1)) / stripes;
	let x = 15;
	const list: { x: number; w: number }[] = [];
	for (let i = 0; i < stripes; i++) {
		list.push({ x, w });
		x += w + gap;
	}
	return { stripes: list };
}

/**
 * 上下の横線は中心(x=50)から左右へ、縦縞は中心線(y=50)から上下へ、
 * それぞれアンカーを動かさず進度tぶん伸ばす。
 */
function renderCanister(plan: CanisterPlan, t: number): string {
	const parts = [
		growFromCenterXRect(50, 10, 16, 80, t),
		growFromCenterXRect(50, 84, 90, 80, t),
		...plan.stripes.map((s) => growFromCenterYRect(s.x, s.w, 50, 52, t)),
	];
	return parts.join(" ");
}

interface TicksPlan {
	x: number;
	w: number;
	h: number;
}

/** 目盛りのような小さな短冊の列。 */
function planTicks(): TicksPlan[] {
	const n = 3 + Math.floor(Math.random() * 4); // 3〜6個
	const plan: TicksPlan[] = [];
	let x = 10;
	for (let i = 0; i < n; i++) {
		const w = randRange(4, 14);
		const h = randRange(6, 14);
		plan.push({ x, w, h });
		x += w + randRange(4, 10);
		if (x > 92) break;
	}
	return plan;
}

/** 各短冊の中心線(y=50)を軸に、進度tぶん上下へ伸ばす。 */
function renderTicks(plan: TicksPlan[], t: number): string {
	return plan.map((s) => growFromCenterYRect(s.x, s.w, 50, s.h, t)).join(" ");
}

/** 自身の中心点を軸に、縦横とも進度tぶん伸びる正方形（ドット向け）。 */
function growFromCenterRect(cx: number, cy: number, fullSize: number, t: number): string {
	const min = 1.5;
	const s = min + (fullSize - min) * easeOutCubic(t);
	return rectPath(cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2);
}

interface CrossPlan {
	armW: number;
	armLen: number;
}

/** 中心で交差する十字。 */
function planCross(): CrossPlan {
	return { armW: randRange(8, 14), armLen: randRange(30, 42) };
}

/** 横棒は中心(x=50)から左右へ、縦棒は中心線(y=50)から上下へ、それぞれ伸ばす。 */
function renderCross(plan: CrossPlan, t: number): string {
	const { armW, armLen } = plan;
	return [
		growFromCenterXRect(50, 50 - armW / 2, 50 + armW / 2, armLen * 2, t),
		growFromCenterYRect(50 - armW / 2, armW, 50, armLen * 2, t),
	].join(" ");
}

interface DotsPlan {
	dots: { x: number; y: number; size: number }[];
}

/** 不規則な間隔で散らばる小さな点の集まり。 */
function planDots(): DotsPlan {
	const cols = 2 + Math.floor(Math.random() * 2); // 2〜3列
	const rows = 2 + Math.floor(Math.random() * 2); // 2〜3行
	const dots: { x: number; y: number; size: number }[] = [];
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			if (Math.random() < 0.25) continue; // 均等な格子に見えすぎないよう間引く
			dots.push({
				x: 15 + (c / Math.max(1, cols - 1)) * 70 + randRange(-4, 4),
				y: 15 + (r / Math.max(1, rows - 1)) * 70 + randRange(-4, 4),
				size: randRange(7, 14),
			});
		}
	}
	if (dots.length === 0) dots.push({ x: 50, y: 50, size: 10 });
	return { dots };
}

/** 各点が自分の中心から進度tぶん膨らむ。 */
function renderDots(plan: DotsPlan, t: number): string {
	return plan.dots.map((d) => growFromCenterRect(d.x, d.y, d.size, t)).join(" ");
}

interface FramePlan {
	corners: { x: number; y: number }[];
	size: number;
}

/** 四隅に置かれた小さな正方形（カメラのフォーカス枠のような構図）。 */
function planFrame(): FramePlan {
	const inset = randRange(14, 22);
	return {
		corners: [
			{ x: inset, y: inset },
			{ x: 100 - inset, y: inset },
			{ x: inset, y: 100 - inset },
			{ x: 100 - inset, y: 100 - inset },
		],
		size: randRange(10, 16),
	};
}

/** 各隅の正方形が自分の中心から進度tぶん膨らむ。 */
function renderFrame(plan: FramePlan, t: number): string {
	return plan.corners.map((c) => growFromCenterRect(c.x, c.y, plan.size, t)).join(" ");
}

interface SpokePlan {
	arms: { angle: number; len: number; w: number }[];
}

/** 中心から放射状に伸びる細い腕（矩形ではなく回転した4点ポリゴン）。 */
function planSpokes(): SpokePlan {
	const n = 3 + Math.floor(Math.random() * 5); // 3〜7本
	const arms: SpokePlan["arms"] = [];
	for (let i = 0; i < n; i++) {
		arms.push({
			angle: (i / n) * Math.PI * 2 + randRange(-0.25, 0.25, 3),
			len: randRange(26, 42),
			w: randRange(5, 11),
		});
	}
	return { arms };
}

/** 各腕は中心をアンカーに、進度tぶん外向きに伸びる（回転した矩形＝4点ポリゴン）。 */
function renderSpokes(plan: SpokePlan, t: number): string {
	const cx = 50;
	const cy = 50;
	return plan.arms
		.map((a) => {
			const minLen = 2;
			const len = minLen + (a.len - minLen) * easeOutCubic(t);
			const dx = Math.cos(a.angle);
			const dy = Math.sin(a.angle);
			// 進行方向に直交する向きへ半幅ぶんオフセットして、腕の断面(4点)を作る。
			const px = -dy;
			const py = dx;
			const hw = a.w / 2;
			const x0 = cx + px * hw;
			const y0 = cy + py * hw;
			const x1 = cx - px * hw;
			const y1 = cy - py * hw;
			const x2 = x1 + dx * len;
			const y2 = y1 + dy * len;
			const x3 = x0 + dx * len;
			const y3 = y0 + dy * len;
			return `M${roundTo(x0, 1)} ${roundTo(y0, 1)}L${roundTo(x1, 1)} ${roundTo(y1, 1)}L${roundTo(x2, 1)} ${roundTo(y2, 1)}L${roundTo(x3, 1)} ${roundTo(y3, 1)}Z`;
		})
		.join(" ");
}

/** かぎ括弧（コーナーブラケット）。`flip` で対角側の向きになる。破線混じり。 */
function cornerBracketGlyph(flip: boolean): string {
	const arm = randRange(55, 75);
	const parts: string[] = [];
	if (!flip) {
		// 左上向き: 縦線(左)＋横線(上)。破線のダッシュを数個添える。
		parts.push(`M10 ${roundTo(10 + arm, 1)}V10H${roundTo(10 + arm, 1)}`);
		parts.push(rectPath(10 + arm + 8, 8, 10 + arm + 18, 12));
		parts.push(rectPath(6, 10 + arm + 8, 10, 10 + arm + 16));
	} else {
		// 右下向き。
		parts.push(`M90 ${roundTo(90 - arm, 1)}V90H${roundTo(90 - arm, 1)}`);
		parts.push(rectPath(90 - arm - 18, 88, 90 - arm - 8, 92));
		parts.push(rectPath(90, 90 - arm - 16, 94, 90 - arm - 8));
	}
	return parts.join(" ");
}

/**
 * 「フレーム間で突拍子もなく出現する」レイヤー（ハードカットで急に現れる幕頭の
 * 塗り四角・エンブレム・角括弧・幕またぎのfadeBridgeなど）に足す、size の
 * ポップイン成長。part単位のアンカー成長（第4幕の `renderBarChart` 等）と違い、
 * これらは単発の単純図形（矩形1枚・パス1本）なので中心スケールでも
 * 「部品がバラバラに寄る」違和感が出ない——むしろ「中心から湧き出す」勢いが
 * 参考動画の急な出現に合う。既存のopacity/thicknessモジュレータと**併用**する
 * 前提（置き換えではない）。
 */
function sizePopModulator(fullSize: number, phaseOffset: number, bars: number, curve = 2): MvModulator {
	return {
		source: "phrase",
		target: "size",
		op: "sub",
		amount: roundTo(fullSize * 0.45, 1),
		bars: Math.max(0.01, bars),
		phaseOffset,
		symmetric: false,
		curve,
		// このポップは「育ちきったらそこで止まる」一発もの。layer の barRange は
		// 次の幕まで（＝bars よりずっと長く）続くので、once を外すと bars を
		// 過ぎるたびに1→0→1…と折り返して「ズーム→縮小→再ズーム」を繰り返す
		// バグになる（ユーザー報告どおりの現象）。
		once: true,
	};
}

/**
 * 第4幕グリフの内部生成方式。UIには出さず、`generateArrangementForGroup` が
 * 毎回この中からアルゴリズムで（重み付き）ランダムに選ぶ——「有限リストから
 * ユーザーが選ぶ」のではなく「無限に組み合わせを吐けるジェネレータの集合から
 * 実行時に選ぶ」という設計。`geo`（再帰的矩形分割）と`spokes`（放射状の腕）は
 * パラメータ空間が連続でほぼ無限に組み合わせがあるため重めに、残りは
 * 手作りモチーフとしての語彙の厚みを添える程度の軽い重みにしてある。
 */
export type MvArrangementGlyphKind =
	| "bar"
	| "can"
	| "tick"
	| "cross"
	| "dots"
	| "frame"
	| "geo"
	| "spokes";

/** 特殊アレンジ生成の見た目パラメータ。未指定分はこれまでどおりの既定挙動。 */
export interface ArrangementGenOptions {
	/** 第4幕（画面各所にグリフが同時多発）で使う個数。未指定は4〜6を乱数で。 */
	act4Count?: 4 | 5 | 6;
	/** 第4幕で許可するグリフ種。未指定は全種類から選ぶ。 */
	act4Kinds?: MvArrangementGlyphKind[];
	/**
	 * 第4幕のグリフが種から本来の形へ育つ速さ。fast: 幕頭の15%で育ちきる／
	 * normal(既定): 30%／slow: 45%。長いほど「育っている最中」がよく見える。
	 */
	growthSpeed?: "fast" | "normal" | "slow";
	/**
	 * 突拍子もなく出現するレイヤー（幕頭の四角・エンブレム・角括弧・
	 * fadeBridge・第4幕の1コマ目）に、中心からのsizeポップインを併用するか。
	 * 既定 true。
	 */
	centerPop?: boolean;
}

const GROWTH_SPEED_FRACTION: Record<NonNullable<ArrangementGenOptions["growthSpeed"]>, number> = {
	fast: 0.15,
	normal: 0.3,
	slow: 0.45,
};

/**
 * 既存の図形グループのレイヤー配列を元にして、展開の変化に使える
 * 「特殊アレンジ」のレイヤー配列を生成する。
 *
 * ── 設計は参考動画（チョウチン少女）の割り込み区間（実測1.93〜3.63秒≒4拍）を
 * 30fpsで1フレームずつ定量解析した結果に基づく。観測された台本は4幕構成：
 *
 *   第1幕 [0〜25%]   小さな塗り四角だけが中央に静止（長めのタメ）→ 末尾で完全暗転
 *                    （実測: 73x73の塗り四角が約0.15秒静止 → 白画素0が約0.1秒）
 *   第2幕 [25〜50%]  太い線幅の中央エンブレムが点滅的に2回フラッシュして減衰
 *                    （実測: 白画素17.6k→19.4kと通常最大14.8kを大きく超える太さ）
 *   第3幕 [50〜75%]  対角のかぎ括弧＋中央の塗り四角（バウンディングボックスが
 *                    195x179→247x201と、初めて縦方向へはみ出し始める）
 *   第4幕 [75〜100%] 画面のあちこち（上下左右、bbox 345x261≒画面の9割）に
 *                    塗り主体の別語彙グリフ（バーチャート・縞箱・目盛り）が
 *                    同時多発的に出る → 窓が終わると通常ループへ自動復帰
 *
 * 幕の骨格は固定（毎回この順で流れる）だが、各幕の中身——グリフの形・本数・
 * 配置・サイズ——は呼ぶたびに乱数で振れる。以前のランダムなイベント抽選では
 * この台本が運任せでしか出なかったため、構成そのものを台本化した。
 *
 * `sourceGroupId` は割り込み対象（アレンジ元）のグループID。返す `group.arrangement`
 * にそのまま埋め込むので、エンジン側 (`isLayerVisible`) が「アレンジ元を止めて隠す
 * ／アレンジ側を表示する」を自動で連動させられる。第1幕末尾の暗転は「その区間に
 * レイヤーを1枚も置かない」だけで実現している（アレンジ元は窓の間ずっと隠れている）。
 */
export function generateArrangementForGroup(
	existingLayers: MvShapeLayer[],
	nextZ: () => number,
	sourceGroupId: string,
	trigger?: { triggerBar?: number; endBar?: number },
	genOptions?: ArrangementGenOptions,
): { group: MvLayerGroup; layers: MvShapeLayer[] } {
	const centerPop = genOptions?.centerPop ?? true;
	const growthFraction = GROWTH_SPEED_FRACTION[genOptions?.growthSpeed ?? "normal"];
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

	// 窓の中の位置(0..1)を絶対小節へ。
	const at = (f: number) => roundTo(triggerBar + durationBars * f, 4);

	// 中心・色・太さ・基準サイズはアレンジ元から引き継ぐ。
	const shapeSources = existingLayers.filter((l) => l.kind === "shape");
	const cx = shapeSources.length
		? shapeSources.reduce((s, l) => s + l.x, 0) / shapeSources.length
		: MV_W / 2;
	const cy = shapeSources.length
		? shapeSources.reduce((s, l) => s + l.y, 0) / shapeSources.length
		: MV_H / 2;
	const color = shapeSources[0]?.color ?? "#e5e5e5";
	const baseThickness = shapeSources[0]?.thickness ?? 5;
	const baseSize = Math.max(60, ...shapeSources.map((l) => l.size ?? 0));

	const common = {
		kind: "shape" as const,
		groupId: newGroupId,
		rotation: 0,
		count: 1,
		spread: 0,
		spin: 0,
		blend: "normal" as const,
		pathBox: [0, 0, 100, 100] as [number, number, number, number],
		color,
	};

	// ── 第1幕: 小さな塗り四角のタメ → 完全暗転 ──
	// [0, 0.19] だけレイヤーを置き、[0.19, 0.25] は何も置かない＝暗転。
	// アレンジ元からの切り替わりが「パッと現れる」ハードカットにならないよう、
	// 頭の一瞬（この幕の最初の15%）だけ不透明度0→1のフェードインを掛ける
	// （減衰の周期をこの幕の最初の15%ぶんに揃えてあるので、幕の外へループして
	// 点滅する心配は無い）。
	{
		const act1Size = roundTo(baseSize * randRange(0.32, 0.42), 1);
		const act1Bars = Math.max(0.01, durationBars * 0.15);
		layers.push({
			...common,
			form: "path",
			id: mvUid("shp"),
			x: cx,
			y: cy,
			z: nextZ(),
			filled: true,
			thickness: 2,
			size: act1Size,
			path: rectPath(25, 25, 75, 75),
			barRange: [at(0), at(0.19)],
			modulators: [
				{
					source: "phrase",
					target: "opacity",
					op: "sub",
					amount: 1,
					bars: act1Bars,
					phaseOffset: at(0),
					symmetric: false,
					curve: 1,
					once: true,
				},
				...(centerPop ? [sizePopModulator(act1Size, at(0), act1Bars)] : []),
			],
		});
	}

	// ── 第2幕: 太い中央エンブレムの2連フラッシュ ──
	// アレンジ元がコマ送りを持っていれば、そのいちばん密なコマ（paths[0]）を使う。
	const emblemPath =
		shapeSources.find((l) => l.iconCycle && l.iconCycle.paths.length > 0)
			?.iconCycle?.paths[0] ??
		shapeSources.find((l) => l.path)?.path ??
		`${rectPath(12, 12, 88, 88)} ${rectPath(34, 34, 66, 66)}`;
	const pulseCount = pick([2, 2, 3]);
	const pulseSpan = 0.25 / pulseCount;
	for (let i = 0; i < pulseCount; i++) {
		const from = 0.25 + pulseSpan * i;
		const pulseSize = roundTo(baseSize * randRange(0.95, 1.1), 1);
		const pulseBars = Math.max(0.05, durationBars * pulseSpan);
		layers.push({
			...common,
			form: "path",
			id: mvUid("shp"),
			x: cx,
			y: cy,
			z: nextZ(),
			filled: false,
			thickness: roundTo(baseThickness, 1),
			size: pulseSize,
			path: emblemPath,
			barRange: [at(from), at(from + pulseSpan)],
			// 幕の頭で太さが最大（通常の2.5〜3.5倍）→減衰。実測の「白画素が通常最大を
			// 大きく超えて出現し、すぐ収縮する」に対応する。phrase の位相は
			// 絶対小節で指定するので、この幕の開始小節をそのまま渡す。
			modulators: [
				{
					source: "phrase",
					target: "thickness",
					op: "add",
					amount: roundTo(baseThickness * randRange(1.5, 2.5), 1),
					bars: pulseBars,
					phaseOffset: at(from),
					curve: pick([3, 4]),
					once: true,
				},
				// 各フラッシュも「中心から湧く」ポップインを併用（各パルスは短命な
				// 単発図形なので、部品アンカー成長ではなく中心スケールで問題ない）。
				...(centerPop ? [sizePopModulator(pulseSize, at(from), pulseBars)] : []),
			],
		});
	}

	// ── 第3幕: 対角のかぎ括弧＋中央の塗り四角 ──
	const diagDx = randRange(70, 100);
	const diagDy = randRange(45, 70);
	const act3BracketBars = Math.max(0.05, durationBars * 0.15);
	for (const flip of [false, true]) {
		const bracketSize = randRange(50, 70);
		layers.push({
			...common,
			form: "path",
			id: mvUid("shp"),
			x: roundTo(cx + (flip ? diagDx : -diagDx), 1),
			y: roundTo(cy + (flip ? diagDy : -diagDy), 1),
			z: nextZ(),
			filled: false,
			thickness: roundTo(baseThickness * randRange(0.5, 0.8), 1),
			size: roundTo(bracketSize, 1),
			path: cornerBracketGlyph(flip),
			barRange: [at(0.5), at(0.75)],
			modulators: centerPop
				? [sizePopModulator(bracketSize, at(0.5), act3BracketBars)]
				: [],
		});
	}
	{
		const act3SquareSize = roundTo(baseSize * randRange(0.3, 0.4), 1);
		layers.push({
			...common,
			form: "path",
			id: mvUid("shp"),
			x: cx,
			y: cy,
			z: nextZ(),
			filled: true,
			thickness: 2,
			size: act3SquareSize,
			path: rectPath(25, 25, 75, 75),
			barRange: [at(0.5), at(0.75)],
			// ゆっくり暗く沈む（実測: 明灰→暗灰→黒と段階的に落ちる塗り四角）。
			modulators: [
				{
					source: "phrase",
					target: "opacity",
					op: "mul",
					amount: 1,
					bars: Math.max(0.05, durationBars * 0.25),
					phaseOffset: at(0.5),
					curve: 1.2,
					once: true,
				},
				...(centerPop
					? [sizePopModulator(act3SquareSize, at(0.5), act3BracketBars)]
					: []),
			],
		});
	}

	// ── 幕と幕の境目をつなぐクロスフェード ──
	// 幕はそれぞれ別形状のレイヤーを barRange で頭出しするだけなので、境目では
	// 前の幕のレイヤーが barRange 終了で消えると同時に次の幕のレイヤーが
	// barRange 開始で現れる、という完全なハードカットになる（暗転を挟む
	// 第1幕→第2幕の境目は元々そういう仕様で問題ないが、第2幕→第3幕・
	// 第3幕→第4幕は参考動画のような滑らかな繋がりが無く、コマが連続していない
	// という指摘の通りだった）。ここは各幕の中身を直接ブレンドするのではなく、
	// 境目をまたぐ短い「フェード専用のレイヤー」を追加で足す——出ていく幕の
	// 代表図形を1枚だけ、境目のちょうど前後で不透明度0↔1に単発で振ることで
	// ブリッジする。フェード用モジュレータの周期＝そのレイヤー自身の
	// barRange の長さぴったりに揃えてあるので、ループして点滅する心配は無い
	// （barRange が切れた瞬間にちょうど減衰しきる／育ちきる）。
	const fadeBridge = (
		boundary: number,
		outPath: string,
		outSize: number,
		inPath: string,
		inSize: number,
	) => {
		const xfade = 0.025;
		layers.push({
			...common,
			form: "path",
			id: mvUid("shp"),
			x: cx,
			y: cy,
			z: nextZ(),
			filled: false,
			thickness: roundTo(baseThickness * 0.7, 1),
			size: outSize,
			path: outPath,
			barRange: [at(boundary), at(boundary + xfade)],
			modulators: [
				{
					source: "phrase",
					target: "opacity",
					op: "mul",
					amount: 1,
					bars: Math.max(0.01, durationBars * xfade),
					phaseOffset: at(boundary),
					symmetric: false,
					curve: 1,
					once: true,
				},
			],
		});
		const inBars = Math.max(0.01, durationBars * xfade);
		layers.push({
			...common,
			form: "path",
			id: mvUid("shp"),
			x: cx,
			y: cy,
			z: nextZ(),
			filled: false,
			thickness: roundTo(baseThickness * 0.7, 1),
			size: inSize,
			path: inPath,
			barRange: [at(boundary - xfade), at(boundary)],
			modulators: [
				{
					source: "phrase",
					target: "opacity",
					op: "sub",
					amount: 1,
					bars: inBars,
					phaseOffset: at(boundary - xfade),
					symmetric: false,
					curve: 1,
					once: true,
				},
				// 出ていく側(outPath)は既存図形の残像なのでポップは付けない。入ってくる
				// 側だけ「中心から湧く」ポップインを併用する。
				...(centerPop ? [sizePopModulator(inSize, at(boundary - xfade), inBars)] : []),
			],
		});
	};
	fadeBridge(
		0.5,
		emblemPath,
		roundTo(baseSize * randRange(0.95, 1.1), 1),
		cornerBracketGlyph(false),
		randRange(50, 70),
	);
	fadeBridge(
		0.75,
		cornerBracketGlyph(true),
		randRange(50, 70),
		renderBarChart(planBarChart(), 1),
		randRange(38, 52),
	);

	// ── 第4幕: 画面のあちこちに塗りグリフが同時多発 ──
	// 「決め打ちの語彙リストからユーザーが種類を選ぶ」のをやめ、置く場所（座標の
	// プール）と生成方式（グリフの中身）を分離した。方式は毎回このリストから
	// アルゴリズム側で重み付きランダムに選ぶ——`geo`（再帰的矩形分割）と
	// `spokes`（放射状の腕）はパラメータが連続で組み合わせがほぼ無限なので
	// 重めに、残りは手作りモチーフとして軽く混ぜる。`genOptions.act4Kinds` を
	// 渡せば選択候補を絞れるが、既定は全方式が対象。
	const GLYPH_KIND_WEIGHTS: [MvArrangementGlyphKind, number][] = [
		["geo", 3],
		["spokes", 2],
		["bar", 1],
		["can", 1],
		["tick", 1],
		["cross", 1],
		["dots", 1],
		["frame", 1],
	];
	const pickGlyphKind = (): MvArrangementGlyphKind => {
		const pool = genOptions?.act4Kinds?.length
			? GLYPH_KIND_WEIGHTS.filter(([k]) => genOptions.act4Kinds?.includes(k))
			: GLYPH_KIND_WEIGHTS;
		const total = pool.reduce((s, [, w]) => s + w, 0);
		let r = Math.random() * total;
		for (const [k, w] of pool) {
			r -= w;
			if (r <= 0) return k;
		}
		return pool[pool.length - 1][0];
	};
	const positionSlots: { x: number; y: number; size: number }[] = [
		{ x: MV_W * 0.42, y: MV_H * 0.16, size: randRange(36, 54) },
		{ x: MV_W * 0.87, y: MV_H * 0.32, size: randRange(30, 46) },
		{ x: MV_W * 0.16, y: MV_H * 0.5, size: randRange(46, 66) },
		{ x: MV_W * 0.84, y: MV_H * 0.5, size: randRange(46, 66) },
		{ x: MV_W * 0.1, y: MV_H * 0.78, size: randRange(28, 42) },
		{ x: MV_W * 0.56, y: MV_H * 0.85, size: randRange(36, 52) },
		{ x: MV_W * 0.5, y: MV_H * 0.12, size: randRange(32, 46) },
		{ x: MV_W * 0.24, y: MV_H * 0.86, size: randRange(40, 58) },
		{ x: MV_W * 0.76, y: MV_H * 0.14, size: randRange(40, 58) },
		{ x: MV_W * 0.5, y: MV_H * 0.5, size: randRange(46, 64) },
		{ x: MV_W * 0.68, y: MV_H * 0.68, size: randRange(38, 54) },
	];
	const useCount = genOptions?.act4Count ?? pick([4, 5, 6, 6]);
	const chosen = [...positionSlots]
		.sort(() => Math.random() - 0.5)
		.slice(0, useCount)
		.map((slot) => ({ ...slot, kind: pickGlyphKind() }));
	// 幕の頭でグリフが最終形のまま静止出現していた（参考動画は逆に「部品ごとに
	// アンカーされた辺から線が伸びて」最終形へ到達する）。size を一様スケール
	// すると全部品が中心へ向かって縮む＝ズームにしか見えないので、部品分解した
	// 形状（renderBarChart/renderCanister/renderTicks）を成長進度tで静的パスに
	// 焼き、幕の頭ぶん（`growthFraction`）を数コマの離散フレームとして barRange
	// を刻んで積み重ねる（=== 第2/3幕境目の `fadeBridge` と同じ「離散フレーム」
	// 路線。iconCycle は絶対タイムラインの拍位相でコマが進むため、トリガー位置に
	// 依存せず「出現の瞬間に必ず種から始まる」保証ができず不採用）。
	// さらに `centerPop` が有効なら、部品アンカー成長と**併用**で size のポップ
	// インも重ねる——1コマ目だけの単発ではなく、成長ウィンドウ全体に渡って
	// 同じ phaseOffset/bars のenvelopeを共有する連続的なポップとして掛ける
	// （フレームがレイヤーとして切り替わっても、envelope自体は絶対小節基準の
	// 連続関数なので、コマをまたいでも滑らかにサイズが乗ってくる）。
	const growthBars = Math.max(0.02, durationBars * 0.25 * growthFraction);
	const growthFrameCount = 5;
	const growthProgress = [0.12, 0.32, 0.54, 0.78, 1];
	const buildGlyphRender: Record<MvArrangementGlyphKind, () => (t: number) => string> = {
		bar: () => {
			const plan = planBarChart();
			return (t) => renderBarChart(plan, t);
		},
		can: () => {
			const plan = planCanister();
			return (t) => renderCanister(plan, t);
		},
		tick: () => {
			const plan = planTicks();
			return (t) => renderTicks(plan, t);
		},
		cross: () => {
			const plan = planCross();
			return (t) => renderCross(plan, t);
		},
		dots: () => {
			const plan = planDots();
			return (t) => renderDots(plan, t);
		},
		frame: () => {
			const plan = planFrame();
			return (t) => renderFrame(plan, t);
		},
		geo: () => {
			const plan = planGeo();
			return (t) => renderGeo(plan, t);
		},
		spokes: () => {
			const plan = planSpokes();
			return (t) => renderSpokes(plan, t);
		},
	};
	for (const s of chosen) {
		const render = buildGlyphRender[s.kind]();
		const sliceLen = growthBars / growthFrameCount;
		// 各コマを完全なハードカットで並べると、部品成長の見た目自体は連続でも
		// 「コマが変わった瞬間」がそのまま1回のポップに見え、5コマぶん＝
		// 複数回ポップして見える（ユーザー報告の「2回ポップイン」の実体：
		// フェードインの掛かる1コマ目→無地の残りのコマへの切り替わりが、
		// 別々の出現イベントとして視認できてしまっていた）。隣接コマの
		// barRangeをわずかに重ねて、その重なりぶんだけ前コマがフェードアウト・
		// 次コマがフェードインするようにし（=== `fadeBridge` と同じ手口）、
		// 1回の連続した成長に見えるようにする。
		const xfade = Math.min(sliceLen * 0.4, growthBars * 0.08);
		for (let i = 0; i < growthFrameCount; i++) {
			const nominalStart = at(0.75) + sliceLen * i;
			const nominalEnd = i === growthFrameCount - 1 ? at(0.75) + growthBars : nominalStart + sliceLen;
			const isFirst = i === 0;
			const isLast = i === growthFrameCount - 1;
			const barStart = isFirst ? nominalStart : nominalStart - xfade;
			const barEnd = isLast ? nominalEnd : nominalEnd + xfade;
			layers.push({
				...common,
				form: "path",
				id: mvUid("shp"),
				x: roundTo(s.x, 1),
				y: roundTo(s.y, 1),
				z: nextZ(),
				filled: true,
				thickness: 2,
				size: roundTo(s.size, 1),
				path: render(growthProgress[i]),
				barRange: [roundTo(barStart, 4), roundTo(barEnd, 4)],
				modulators: [
					// 先頭コマは種から0→1、以降のコマは重なり区間ぶんだけ
					// フェードインして前コマと入れ替わる。
					{
						source: "phrase" as const,
						target: "opacity" as const,
						op: "sub" as const,
						amount: 1,
						bars: Math.max(0.01, isFirst ? nominalEnd - nominalStart : xfade),
						phaseOffset: roundTo(barStart, 4),
						symmetric: false,
						curve: 1,
						once: true as const,
					},
					// 最終コマ以外は、自分の末尾の重なり区間ぶんフェードアウトして
					// 次コマへ溶け込む。
					...(isLast
						? []
						: [
								{
									source: "phrase" as const,
									target: "opacity" as const,
									op: "mul" as const,
									amount: 1,
									bars: xfade,
									phaseOffset: roundTo(nominalEnd, 4),
									symmetric: false,
									curve: 1,
									once: true as const,
								},
							]),
					// 部品アンカー成長に、中心からのsizeポップインを併用する。
					...(centerPop ? [sizePopModulator(s.size, at(0.75), growthBars)] : []),
				],
			});
		}
		// 成長が終わった残り（最後のコマ〜幕の終わり）は完成形を維持し、区間の
		// 終わりだけ不透明度1→0のフェードアウトでアレンジ元への復帰を和らげる。
		layers.push({
			...common,
			form: "path",
			id: mvUid("shp"),
			x: roundTo(s.x, 1),
			y: roundTo(s.y, 1),
			z: nextZ(),
			filled: true,
			thickness: 2,
			size: roundTo(s.size, 1),
			path: render(1),
			barRange: [roundTo(at(0.75) + growthBars, 4), at(1)],
			modulators: [
				{
					source: "phrase",
					target: "opacity",
					op: "mul",
					amount: 1,
					bars: Math.max(0.01, durationBars * 0.15),
					phaseOffset: at(1) - durationBars * 0.15,
					symmetric: false,
					curve: 1,
					once: true,
				},
			],
		});
	}

	return { group, layers };
}
