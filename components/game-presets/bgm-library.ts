// ゲームプリセット用のオリジナルBGM（MML）。
//
// どれも手書きの新曲で、既存の曲（ゲーム音楽・アニメ・ボカロ等）の旋律は借りていない。
// プリセットのBGMは YouTube の転載や原作音源に頼らず、ここの曲を使うこと
// （商用ゲームの音源・公式チャンネルの埋め込みはプリセットに置かない方針）。
//
// 書式は @onjmin/dtm の MML:
//   `#inst=…#volume=…#t0inst=…;`（曲全体とトラックごとの宣言）→ `@0t…v…<音符>;` … → `#end;`
// 1小節 = 192 ステップ（dtm の DEFAULT_STEPS_PER_BAR）、4/4 拍子。
//
// ■ ループ
// dtm のループは「いちばん最後に鳴り終わる音の終わり」で折り返す（休符は数えない）。
// なので各曲とも、白玉のパッドや低音が最終小節の小節線ちょうどまで鳴るように書いてある。
// 旋律・伴奏を書き換えるときは、全トラックの長さが同じ小節数ぴったりになるよう検算すること
// （どこか1本でも最後の音が小節線より手前で終わると、そこでループが縮んで拍がずれる）。
// 最終小節は頭の小節へ戻る和音（Ⅴ→Ⅰ など）にしてあるので、切れ目なく一周する。
//
// ■ 書き方
// bars は4小節ずつの文字列。空白で区切った1かたまりが1小節で、小節の頭で必ず `o`（オクターブ）を
// 書き直してあるので、小節単位でそのまま差し替えられる（MML のパーサは空白を無視する）。
// 旋律トラックの上のコメントがその4小節のコード。
//
// ■ 音量（#volume=）
// 曲の大きさは walksim（src/data/bgm.ts 冒頭の実測表）と同じ物差しで、楽器の数・密度・ドラムの有無が
// 近い曲の値から見積もった（まばらな環境音楽ほど大きく、ドラム入りの密な曲ほど小さい）。
// 実測はしていないので、揃え直すなら walksim の dev/bgm.html と同じ手順で -23 LUFS に合わせる。
// 注意: dtm の playMML / studio.play は MML に #volume= があると呼び出し側の volume を使わない
// （lib/mml.ts の説明）。ゲーム側の BGM 音量をこれらの曲に効かせるのは BgmManager の仕事。

import type { BgmState } from "./shared";

/** 曲全体の宣言（MML 先頭の `#inst=…;` になる）。 */
interface BgmHead {
	/** 楽器プリセット名（dtm の INSTRUMENT_PRESETS）。各トラックの楽器は BgmTrack.inst で上書きする */
	inst: string;
	/** ドラムパターン名（dtm の DRUM_PATTERNS）。省略するとドラムなし */
	drum?: string;
	/** 曲全体の音量（#volume=） */
	volume: number;
	/** マスタリバーブの掛かり具合 0-100（#reverb=） */
	reverb: number;
	/** リバーブの長さ（秒×10、#reverbdecay=） */
	decay: number;
	/** リバーブのプリディレイ ms（#reverbpredelay=、既定 20） */
	predelay?: number;
}

/** トラックごとの音作り（#t<n>rev= など）。 */
type BgmTrackFx = Partial<
	Record<"rev" | "dly" | "pan" | "width" | "comp" | "eqlo" | "eqhi", number>
>;

interface BgmTrack {
	/** GM 楽器名（#t<n>inst=） */
	inst: string;
	/** ベロシティ 0-127 */
	v: number;
	fx: BgmTrackFx;
	/** 4小節ずつの MML（冒頭の説明を参照） */
	bars: string[];
}

interface BgmSong {
	tempo: number;
	head: BgmHead;
	tracks: BgmTrack[];
}

const buildMml = ({ tempo, head, tracks }: BgmSong): string => {
	const decl = [
		`#inst=${head.inst}`,
		...(head.drum
			? [`#drum=${head.drum}`, "#drumfont=FluidR3_GM_sf2_file:0"]
			: []),
		`#volume=${head.volume}`,
		...(head.drum ? ["#drumvolume=80"] : []),
		`#reverb=${head.reverb}`,
		`#reverbdecay=${head.decay}`,
		`#reverbpredelay=${head.predelay ?? 20}`,
		`#mastercomp=${head.drum ? 25 : 20}`,
		"#mode=simple",
		...tracks.flatMap((t, i) => [
			`#t${i}inst=${t.inst}`,
			...Object.entries(t.fx)
				.filter(([, v]) => v !== undefined)
				.map(([k, v]) => `#t${i}${k}=${v}`),
		]),
	].join("");
	const body = tracks
		.map((t, i) => `@${i}t${tempo}v${t.v}${t.bars.join(" ")};`)
		.join("");
	return `${decl};${body}#end;`;
};

/** 曲 → BgmState。ref は `mml:<MML本文>`、src は MML 本文そのもの（再生側は src を直接鳴らす）。 */
const mmlBgm = (song: BgmSong): BgmState => {
	const mml = buildMml(song);
	return { ref: `mml:${mml}`, src: mml, type: "mml" };
};

// ════════════════════ 不殺RPG（fusatsu） ════════════════════

/**
 * 不殺RPG フィールド — ヘ長調・92BPM・16小節（約42秒で一周）。のんびり歩く、あてのない道。
 * フルートの旋律・ハープの8分の分散和音・アコースティックベース・薄い弦。
 * 6小節目の E♭maj7（♭VII）で少しだけ寄り道し、16小節目の C7 から頭の A へ戻る。
 */
export const FUSATSU_FIELD: BgmState = mmlBgm({
	tempo: 92,
	head: { inst: "fantasy_rpg", volume: 60, reverb: 30, decay: 20 },
	tracks: [
		{
			// 旋律
			inst: "Flute",
			v: 92,
			fx: { rev: 22, dly: 10 },
			bars: [
				// Fmaj7 | C/E | Dm7 | B♭maj7
				"o5a2g8f8e4 o5g4.e8c2 o5d4f4a4o6c4 o5b-2.a8g8",
				// F | E♭maj7 | B♭ | Csus4 C
				"o5a4.o6c8o5a4f4 o5g2e-4f8g8 o5f4.d8o4b-2 o5f2e4r4",
				// Dm | Am7 | B♭maj7 | F/A
				"o5d4e8f8a4o6d4 o6c4.o5a8e2 o5f4g4a4o6d4 o6c2.r4",
				// Gm7 | Am7 | B♭ | Csus4 C7
				"o5b-4.a8g4f4 o5e4.f8g2 o5f4d4o4b-4o5d4 o5c2e4g4",
			],
		},
		{
			// 分散和音
			inst: "Orchestral Harp",
			v: 62,
			fx: { rev: 26, pan: 76 },
			bars: [
				"o3f8o4c8e8a8e8c8e8a8 o3e8o4c8g8o5c8o4g8c8g8o5c8 o3d8a8o4c8f8c8o3a8o4c8f8 o2b-8o3f8a8o4d8o3a8f8a8o4d8",
				"o3f8o4c8f8a8f8c8f8a8 o3e-8b-8o4d8g8d8o3b-8o4d8g8 o2b-8o3f8b-8o4d8o3b-8f8b-8o4d8 o3c8g8o4c8f8o3c8g8o4c8e8",
				"o3d8a8o4d8f8d8o3a8o4d8f8 o2a8o3e8g8o4c8o3g8e8g8o4c8 o2b-8o3f8a8o4d8o3a8f8a8o4d8 o2a8o3f8a8o4c8o3a8f8a8o4c8",
				"o2g8o3d8f8b-8f8d8f8b-8 o2a8o3e8g8o4c8o3g8e8g8o4c8 o2b-8o3f8b-8o4d8o3b-8f8b-8o4d8 o3c8g8o4c8f8o3c8g8b-8o4e8",
			],
		},
		{
			// ベース
			inst: "Acoustic Bass",
			v: 78,
			fx: { rev: 6 },
			bars: [
				"o2f2o3c2 o2e2g2 o2d2a2 o1b-2o2f2",
				"o2f2o3c2 o2e-2b-2 o1b-2o2d2 o2c2.o1g4",
				"o2d2a2 o1a2o2e2 o1b-2o2f2 o1a2o2c2",
				"o1g2o2d2 o1a2o2e2 o1b-2o2f2 o2c2d4e4",
			],
		},
		{
			// 弦
			inst: "String Ensemble 1",
			v: 34,
			fx: { rev: 30, eqhi: -4, pan: 50 },
			bars: [
				"[o3ao4ce]1 [o3go4ce]1 [o3fao4c]1 [o3fao4d]1",
				"[o3fao4c]1 [o3gb-o4d]1 [o3fb-o4d]1 [o3fgo4c]2[o3ego4c]2",
				"[o3fao4d]1 [o3go4ce]1 [o3fao4d]1 [o3fao4c]1",
				"[o3fb-o4d]1 [o3go4ce]1 [o3fb-o4d]1 [o3fgo4c]2[o3egb-]2",
			],
		},
	],
});

/**
 * 不殺RPG 町 — ト長調・104BPM・16小節（約37秒で一周）。暖炉のある宿屋のような、あたたかい町。
 * クラリネットの旋律（付点8分＋16分の弾み）・ナイロンギターの裏拍・歩くアコースティックベース・
 * 4小節ごとに鳴るグロッケンの合いの手。14小節目の Cm6（同主短調からの借用）で少しだけしんみりする。
 */
export const FUSATSU_TOWN: BgmState = mmlBgm({
	tempo: 104,
	head: { inst: "acoustic", volume: 64, reverb: 26, decay: 16 },
	tracks: [
		{
			// 旋律
			inst: "Clarinet",
			v: 90,
			fx: { rev: 18, dly: 6 },
			bars: [
				// Gmaj7 | Em7 | Am7 | D7
				"o5d4o4b8.o5c16d4o4g4 o5e4d8.o4b16g2 o5c4o4b8.a16o5e4c4 o4b4.a8f+4a4",
				// Bm7 | E7 | Am7 | D7
				"o5f+4d8.o4b16a4b4 o4g+4.b8o5d4e4 o5c2e4d8.c16 o4a2.r4",
				// Cmaj7 | Bm7 | Em7 | A7
				"o5e4g8.e16d4c4 o5d4.o4b8f+2 o4g4b8.o5d16e4g4 o5f+2.e8c+8",
				// Cmaj7 | Cm6 | G | Am7 D7
				"o5d4e8.d16c4o4b4 o5e-4.d8c4o4a4 o4b2g4a8.b16 o5c4o4a4f+8g8a8o5c8",
			],
		},
		{
			// ギター
			inst: "Acoustic Guitar (nylon)",
			v: 58,
			fx: { rev: 16, pan: 40, width: 110 },
			bars: [
				"r4[o3gbo4df+]4r4[o3gbo4df+]8[o3gbo4df+]8 r4[o3gbo4de]4r4[o3gbo4de]8[o3gbo4de]8 r4[o3ao4ceg]4r4[o3ao4ceg]8[o3ao4ceg]8 r4[o3f+ao4cd]4r4[o3f+ao4cd]8[o3f+ao4cd]8",
				"r4[o3f+abo4d]4r4[o3f+abo4d]8[o3f+abo4d]8 r4[o3g+bo4de]4r4[o3g+bo4de]8[o3g+bo4de]8 r4[o3ao4ceg]4r4[o3ao4ceg]8[o3ao4ceg]8 r4[o3f+ao4cd]4r4[o3f+ao4cd]8[o3f+ao4cd]8",
				"r4[o3gbo4ce]4r4[o3gbo4ce]8[o3gbo4ce]8 r4[o3f+abo4d]4r4[o3f+abo4d]8[o3f+abo4d]8 r4[o3gbo4de]4r4[o3gbo4de]8[o3gbo4de]8 r4[o3gao4c+e]4r4[o3gao4c+e]8[o3gao4c+e]8",
				"r4[o3gbo4ce]4r4[o3gbo4ce]8[o3gbo4ce]8 r4[o3gao4ce-]4r4[o3gao4ce-]8[o3gao4ce-]8 r4[o3gbo4dg]4r4[o3gbo4dg]8[o3gbo4dg]8 r8[o3ao4ceg]8r8[o3ao4ceg]8r8[o3f+ao4cd]8r8[o3f+ao4cd]8",
			],
		},
		{
			// ベース
			inst: "Acoustic Bass",
			v: 80,
			fx: { rev: 6 },
			bars: [
				"o2g4.g8d4f+4 o2e4.e8o1b4g4 o1a4.a8o2e4c4 o2d4.d8o1a4o2c4",
				"o1b4.b8o2f+4d4 o2e4.e8o1b4g+4 o1a4.a8o2e4c4 o2d4.d8o1a4b4",
				"o2c4.c8o1g4a4 o1b4.b8o2f+4d4 o2e4.e8o1b4g4 o1a4.a8o2e4c+4",
				"o2c4.c8e4g4 o2c4.c8e-4o1a4 o1g4.g8o2d4o1b4 o1a4o2e4d4f+4",
			],
		},
		{
			// 合いの手
			inst: "Glockenspiel",
			v: 44,
			fx: { rev: 30, dly: 18, pan: 84 },
			bars: [
				"r1 r1 r1 r2o5a8o6d8f+4",
				"r1 r1 r1 r4o6f+8a8o7c8o6a8d4",
				"r1 r1 r1 r2o6e8g8o7c+4",
				"r1 r1 r1 r2.o6d8f+8",
			],
		},
	],
});

/**
 * 不殺RPG 洞窟 — ニ短調・68BPM・16小節（約56秒で一周）。天井から水がしたたる、ひんやりした洞窟。
 * ビブラフォンのまばらな旋律（ディレイで反響させる）・擦弦パッド・フレットレスの持続音・
 * 高いチェレスタの「しずく」。2小節目の E♭maj7♯11（♭II）が、どこか遠くへ続いている気配を出す。
 */
export const FUSATSU_CAVE: BgmState = mmlBgm({
	tempo: 68,
	head: {
		inst: "ambient_cloud",
		volume: 100,
		reverb: 44,
		decay: 32,
		predelay: 40,
	},
	tracks: [
		{
			// 旋律
			inst: "Vibraphone",
			v: 70,
			fx: { rev: 40, dly: 34, pan: 58 },
			bars: [
				// Dm9 | E♭maj7♯11 | Dm9 | C/D
				"r4o5e8a8o6d2 r2o5b-4a4 o5f2.r4 r4o5e8g8d2",
				// B♭maj7 | Gm9 | E♭maj7♯11 | A7
				"r4o5f8a8o6c4.d8 o5b-2a4f4 o5g2.r4 r4o5e8g8o6c+2",
				// Dm9 | E♭maj7♯11 | Dm9 | C/D
				"r4o6d8c8o5a2 o5g4.a8b-2 o5a2.r4 r2o5g8e8d4",
				// B♭maj7 | Gm9 | E♭maj7♯11 | A7
				"r4o5d8f8a4o6c4 o6d2o5b-4a4 o5a2.g4 r2o5e8a8o6c+4",
			],
		},
		{
			// パッド
			inst: "Pad 5 (bowed)",
			v: 34,
			fx: { rev: 36, eqhi: -6, width: 130 },
			bars: [
				"[o3dfao4ce]1 [o3e-gb-o4da]1 [o3dfao4ce]1 [o3dgo4ce]1",
				"[o2b-o3fao4d]1 [o2b-o3dfa]1 [o3e-gb-o4da]1 [o2ao3ego4c+]1",
				"[o3dfao4ce]1 [o3e-gb-o4da]1 [o3dfao4ce]1 [o3dgo4ce]1",
				"[o2b-o3fao4d]1 [o2b-o3dfa]1 [o3e-gb-o4da]1 [o2ao3ego4c+]1",
			],
		},
		{
			// ベース
			inst: "Fretless Bass",
			v: 58,
			fx: { rev: 18 },
			bars: [
				"o2d1 o2e-1 o2d1 o2d1",
				"o1b-1 o1g1 o2e-1 o1a1",
				"o2d1 o2e-1 o2d1 o2d1",
				"o1b-1 o1g1 o2e-1 o1a1",
			],
		},
		{
			// しずく
			inst: "Celesta",
			v: 40,
			fx: { rev: 44, dly: 42, pan: 88 },
			bars: [
				"r1 r8o6a8r2. r1 r2.o6e8r8",
				"r1 r8o6d8r2. r1 r2r8o6e8r4",
				"r1 r4o7d8r8r2 r1 r2.o6g8r8",
				"r1 r8o6f8r2. r1 r4o6a8r8r2",
			],
		},
	],
});

/**
 * 不殺RPG 書庫 — ハ短調・66BPM・12小節（約44秒で一周）。高い天井の石の広間、奥のとびらへ続く赤い絨毯。
 * ホルンの旋律・教会オルガンの和音・チェロの低音・ティンパニ。7小節目の D♭（ナポリの和音）と、
 * 最後の G7(♭9) で A♭→G と半音で頭の小節へ落ちるのが聞きどころ。
 */
export const FUSATSU_CASTLE: BgmState = mmlBgm({
	tempo: 66,
	head: { inst: "orchestra", volume: 50, reverb: 40, decay: 30, predelay: 30 },
	tracks: [
		{
			// 旋律
			inst: "French Horn",
			v: 94,
			fx: { rev: 30 },
			bars: [
				// Cm | A♭ | Fm | G
				"o4g2a-4g4 o5c2.o4b-4 o4a-4g4f4a-4 o4g2.r4",
				// E♭ | Fm | D♭ | Gsus4 G
				"o4e-4f4g4b-4 o5c2o4a-2 o5d-2c4o4a-4 o5c2o4b2",
				// A♭ | E♭/G | Fm6 | G7(♭9)
				"o5e-2.c4 o4b-2g4b-4 o4a-4.g8f4d4 o3b4o4d4f4a-4",
			],
		},
		{
			// オルガン
			inst: "Church Organ",
			v: 40,
			fx: { rev: 40, eqhi: -5, width: 120 },
			bars: [
				"[o3go4ce-]1 [o3a-o4ce-]1 [o3fa-o4c]1 [o3gbo4d]1",
				"[o3gb-o4e-]1 [o3fa-o4c]1 [o3fa-o4d-]1 [o3go4cd]2[o3gbo4d]2",
				"[o3a-o4ce-]1 [o3gb-o4e-]1 [o3fa-o4d]1 [o3fa-bo4d]1",
			],
		},
		{
			// 低音
			inst: "Cello",
			v: 74,
			fx: { rev: 24 },
			bars: [
				"o3c1 o2a-1 o2f1 o2g1",
				"o2e-1 o2f1 o2d-1 o2g1",
				"o2a-1 o2g1 o2f1 o2g1",
			],
		},
		{
			// ティンパニ
			inst: "Timpani",
			v: 70,
			fx: { rev: 34 },
			bars: [
				"o3c4r2. r1 r1 r2o2g8g8g4",
				"r1 r1 r1 r2.o2g16g16g16g16",
				"o2a-4r2. r1 r1 o2g8r8g8r8g16g16g16g16g4",
			],
		},
	],
});

/**
 * 不殺RPG 戦闘 — ホ短調・152BPM・16小節（約25秒で一周）。はずむけれど、どこか張りつめた通常戦闘。
 * 矩形波の旋律・シンセベースの8分（根音とオクターブ）・クラビネットの裏拍・16ビート。
 * 最後の B7 で D♯ を置いて頭の E へ解決する。
 */
export const FUSATSU_BATTLE: BgmState = mmlBgm({
	tempo: 152,
	head: {
		inst: "retro_game",
		drum: "16beat",
		volume: 26,
		reverb: 20,
		decay: 12,
	},
	tracks: [
		{
			// 旋律
			inst: "Lead 1 (square)",
			v: 96,
			fx: { rev: 12, dly: 10, eqhi: -3 },
			bars: [
				// Em | C | D | B7
				"o5e8o4b8o5e8f+8g4f+8e8 o5g8e8c8e8g4.a8 o5f+8d8o4a8o5d8f+8a8g8f+8 o5d+4.f+8a4b4",
				// Em | C | Am | B7
				"o5b8a8g8f+8e4o4b4 o5c8d8e8g8e8d8c8o4b8 o4a8o5c8e8a8g8e8c8e8 o5d+4f+4b4a8f+8",
				// C | D | Bm | Em
				"o5g4.e8c4g4 o5f+4.d8o4a4o5f+4 o5b8a8f+8d8o4b8o5d8f+8a8 o5g2e4r4",
				// Am | C | F♯m7(♭5) | B7
				"o5a8a8g8e8o6c8o5b8a8g8 o5e8g8o6c8o5b8a8g8e8g8 o5f+8a8o6c8o5a8f+8e8c8o4a8 o4b8o5d+8f+8a8b4d+4",
			],
		},
		{
			// ベース
			inst: "Synth Bass 1",
			v: 88,
			fx: { rev: 4, eqlo: 2 },
			bars: [
				"o2e8e8o3e8o2e8e8o3e8o2e8o3e8 o2c8c8o3c8o2c8c8o3c8o2c8o3c8 o2d8d8o3d8o2d8d8o3d8o2d8o3d8 o1b8b8o2b8o1b8b8o2b8o1b8o2b8",
				"o2e8e8o3e8o2e8e8o3e8o2e8o3e8 o2c8c8o3c8o2c8c8o3c8o2c8o3c8 o1a8a8o2a8o1a8a8o2a8o1a8o2a8 o1b8b8o2b8o1b8b8o2b8o1b8o2b8",
				"o2c8c8o3c8o2c8c8o3c8o2c8o3c8 o2d8d8o3d8o2d8d8o3d8o2d8o3d8 o1b8b8o2b8o1b8b8o2b8o1b8o2b8 o2e8e8o3e8o2e8e8o3e8o2e8o3e8",
				"o1a8a8o2a8o1a8a8o2a8o1a8o2a8 o2c8c8o3c8o2c8c8o3c8o2c8o3c8 o2f+8f+8o3f+8o2f+8f+8o3f+8o2f+8o3f+8 o1b8b8o2b8o1b8b8o2b8o1b8o2b8",
			],
		},
		{
			// 裏拍
			inst: "Clavinet",
			v: 54,
			fx: { rev: 14, pan: 86 },
			bars: [
				"r8[o3gbo4e]8r8[o3gbo4e]8r8[o3gbo4e]8r8[o3gbo4e]8 r8[o3go4ce]8r8[o3go4ce]8r8[o3go4ce]8r8[o3go4ce]8 r8[o3f+ao4d]8r8[o3f+ao4d]8r8[o3f+ao4d]8r8[o3f+ao4d]8 r8[o3f+abo4d+]8r8[o3f+abo4d+]8r8[o3f+abo4d+]8r8[o3f+abo4d+]8",
				"r8[o3gbo4e]8r8[o3gbo4e]8r8[o3gbo4e]8r8[o3gbo4e]8 r8[o3go4ce]8r8[o3go4ce]8r8[o3go4ce]8r8[o3go4ce]8 r8[o3ao4ce]8r8[o3ao4ce]8r8[o3ao4ce]8r8[o3ao4ce]8 r8[o3f+abo4d+]8r8[o3f+abo4d+]8r8[o3f+abo4d+]8r8[o3f+abo4d+]8",
				"r8[o3go4ce]8r8[o3go4ce]8r8[o3go4ce]8r8[o3go4ce]8 r8[o3f+ao4d]8r8[o3f+ao4d]8r8[o3f+ao4d]8r8[o3f+ao4d]8 r8[o3f+bo4d]8r8[o3f+bo4d]8r8[o3f+bo4d]8r8[o3f+bo4d]8 r8[o3gbo4e]8r8[o3gbo4e]8r8[o3gbo4e]8r8[o3gbo4e]8",
				"r8[o3ao4ce]8r8[o3ao4ce]8r8[o3ao4ce]8r8[o3ao4ce]8 r8[o3go4ce]8r8[o3go4ce]8r8[o3go4ce]8r8[o3go4ce]8 r8[o3f+ao4ce]8r8[o3f+ao4ce]8r8[o3f+ao4ce]8r8[o3f+ao4ce]8 r8[o3f+abo4d+]8r8[o3f+abo4d+]8r8[o3f+abo4d+]8r8[o3f+abo4d+]8",
			],
		},
	],
});

/**
 * 不殺RPG ボス — ニ短調・144BPM・16小節（約27秒で一周）。負けられない、でも倒したくない相手との戦い。
 * のこぎり波の長い旋律・ブラスの刻み（1拍目・2拍裏・4拍目）・シンセベースの8分・合唱の白玉・16ビート。
 * 14小節目の E♭（ナポリの和音）で最高潮、最後の A7(♭9) で B♭→A→頭の D へ戻る。
 */
export const FUSATSU_BOSS: BgmState = mmlBgm({
	tempo: 144,
	head: {
		inst: "orchestra",
		drum: "16beat",
		volume: 24,
		reverb: 24,
		decay: 14,
	},
	tracks: [
		{
			// 旋律
			inst: "Lead 2 (sawtooth)",
			v: 92,
			fx: { rev: 16, dly: 12, eqhi: -2 },
			bars: [
				// Dm | B♭ | Gm | A
				"o5d4.e8f4a4 o5b-2.a8g8 o5g4.f8d4o4b-4 o5c+2.e4",
				// Dm | B♭ | C | A7
				"o5f4.e8d4a4 o6d2.c8o5b-8 o6c4.o5b-8g4e4 o5a2o6c+4e4",
				// B♭ | C | Am | Dm
				"o6d4.c8o5b-4f4 o5g4.a8b-4o6c4 o5a2.e4 o5f4.g8a2",
				// Gm | E♭ | A | A7(♭9)
				"o5b-4.a8g4o6d4 o6e-2.d8o5b-8 o6c+2e4c+4 o5a4b-4g4e4",
			],
		},
		{
			// ブラス
			inst: "Brass Section",
			v: 70,
			fx: { rev: 18, pan: 44 },
			bars: [
				"[o4dfa]8r8r8[o4dfa]8r4[o4dfa]8r8 [o4dfb-]8r8r8[o4dfb-]8r4[o4dfb-]8r8 [o4dgb-]8r8r8[o4dgb-]8r4[o4dgb-]8r8 [o4c+ea]8r8r8[o4c+ea]8r4[o4c+ea]8r8",
				"[o4dfa]8r8r8[o4dfa]8r4[o4dfa]8r8 [o4dfb-]8r8r8[o4dfb-]8r4[o4dfb-]8r8 [o4ceg]8r8r8[o4ceg]8r4[o4ceg]8r8 [o4c+eg]8r8r8[o4c+eg]8r4[o4c+eg]8r8",
				"[o4dfb-]8r8r8[o4dfb-]8r4[o4dfb-]8r8 [o4ceg]8r8r8[o4ceg]8r4[o4ceg]8r8 [o4cea]8r8r8[o4cea]8r4[o4cea]8r8 [o4dfa]8r8r8[o4dfa]8r4[o4dfa]8r8",
				"[o4dgb-]8r8r8[o4dgb-]8r4[o4dgb-]8r8 [o4e-gb-]2.r4 [o4c+ea]8r8r8[o4c+ea]8r4[o4c+ea]8r8 [o4c+gb-]8r8[o4c+gb-]8r8[o4c+gb-]8r8[o4c+gb-]8r8",
			],
		},
		{
			// ベース
			inst: "Synth Bass 2",
			v: 90,
			fx: { rev: 4, eqlo: 2 },
			bars: [
				"o2d8d8o3d8o2d8d8o3d8o2d8o3d8 o1b-8b-8o2b-8o1b-8b-8o2b-8o1b-8o2b-8 o1g8g8o2g8o1g8g8o2g8o1g8o2g8 o1a8a8o2a8o1a8a8o2a8o1a8o2a8",
				"o2d8d8o3d8o2d8d8o3d8o2d8o3d8 o1b-8b-8o2b-8o1b-8b-8o2b-8o1b-8o2b-8 o2c8c8o3c8o2c8c8o3c8o2c8o3c8 o1a8a8o2a8o1a8a8o2a8o1a8o2a8",
				"o1b-8b-8o2b-8o1b-8b-8o2b-8o1b-8o2b-8 o2c8c8o3c8o2c8c8o3c8o2c8o3c8 o1a8a8o2a8o1a8a8o2a8o1a8o2a8 o2d8d8o3d8o2d8d8o3d8o2d8o3d8",
				"o1g8g8o2g8o1g8g8o2g8o1g8o2g8 o2e-8e-8o3e-8o2e-8e-8o3e-8o2e-8o3e-8 o1a8a8o2a8o1a8a8o2a8o1a8o2a8 o1a8a8o2a8o1a8a8o2a8o1a8o2a8",
			],
		},
		{
			// 合唱
			inst: "Choir Aahs",
			v: 40,
			fx: { rev: 34, pan: 84, eqhi: -3 },
			bars: [
				"[o3ao4df]1 [o3b-o4df]1 [o3b-o4dg]1 [o3ao4c+e]1",
				"[o3ao4df]1 [o3b-o4df]1 [o3go4ce]1 [o3go4c+e]1",
				"[o3b-o4df]1 [o3go4ce]1 [o3ao4ce]1 [o3ao4df]1",
				"[o3b-o4dg]1 [o3b-o4e-g]1 [o3ao4c+e]1 [o3gb-o4c+]1",
			],
		},
	],
});

// ════════════════════ こおりの森（snowForest） ════════════════════

/**
 * こおりの森 — ト長調・144BPM・16小節（約27秒で一周）。雪原の氷の足場を、軽く跳ねながら渡っていく。
 * フルートの旋律・チェレスタの8分の分散和音（氷のきらめき）・アコースティックベースの根音と5度・
 * 弦の白玉・8ビート。13小節目で最高音 G6 に一度だけ届き、最後の D7 から頭の G へ戻る。
 */
export const SNOWFOREST_FIELD: BgmState = mmlBgm({
	tempo: 144,
	head: {
		inst: "fantasy_rpg",
		drum: "8beat",
		volume: 26,
		reverb: 26,
		decay: 16,
	},
	tracks: [
		{
			// 旋律
			inst: "Flute",
			v: 90,
			fx: { rev: 20, dly: 12 },
			bars: [
				// G | D/F♯ | Em | C
				"o5d8g8b4a8g8d4 o5f+4.a8d2 o5e8g8b4o6c8o5b8g4 o5a4.g8e2",
				// G | C | Am | D
				"o5d8g8b8o6d8c4o5b4 o6c4.o5b8a8g8e4 o5a8b8o6c8e8d4c4 o5b2a4f+8a8",
				// C | D | Bm | Em
				"o6c4e4d8c8o5b4 o5a4.f+8d4f+4 o5b8o6d8f+4e8d8o5b4 o5g4.f+8e2",
				// C | D | Am7 | D7
				"o5e8g8o6c8e8g4e4 o6f+4.e8d4o5a4 o6c8o5b8a8g8a4o6c4 o5f+4a4o6c4o5a4",
			],
		},
		{
			// 分散和音
			inst: "Celesta",
			v: 50,
			fx: { rev: 24, dly: 8, pan: 84 },
			bars: [
				"o4g8b8o5d8g8d8o4b8o5d8o4b8 o4f+8a8o5d8f+8d8o4a8o5d8o4a8 o4e8g8b8o5e8o4b8g8b8g8 o4e8g8o5c8e8c8o4g8o5c8o4g8",
				"o4g8b8o5d8g8d8o4b8o5d8o4b8 o4e8g8o5c8e8c8o4g8o5c8o4g8 o4a8o5c8e8a8e8c8e8c8 o4f+8a8o5d8f+8d8o4a8o5d8o4a8",
				"o4e8g8o5c8e8c8o4g8o5c8o4g8 o4f+8a8o5d8f+8d8o4a8o5d8o4a8 o4f+8b8o5d8f+8d8o4b8o5d8o4b8 o4e8g8b8o5e8o4b8g8b8g8",
				"o4e8g8o5c8e8c8o4g8o5c8o4g8 o4f+8a8o5d8f+8d8o4a8o5d8o4a8 o4e8a8o5c8g8c8o4a8o5c8o4a8 o4f+8a8o5c8d8c8o4a8f+8a8",
			],
		},
		{
			// ベース
			inst: "Acoustic Bass",
			v: 84,
			fx: { rev: 6, eqlo: 2 },
			bars: [
				"o2g4o3d4o2g4o3d4 o2f+4a4f+4a4 o2e4b4e4b4 o2c4g4c4g4",
				"o2g4o3d4o2g4o3d4 o2c4g4c4g4 o2a4o3e4o2a4o3e4 o2d4a4d4a4",
				"o2c4g4c4g4 o2d4a4d4a4 o2b4o3f+4o2b4o3f+4 o2e4b4e4b4",
				"o2c4g4c4g4 o2d4a4d4a4 o2a4o3e4o2a4o3e4 o2d4a4o3c4o2a4",
			],
		},
		{
			// 弦
			inst: "String Ensemble 1",
			v: 36,
			fx: { rev: 28, pan: 44, eqlo: -3 },
			bars: [
				"[o3gbo4d]1 [o3f+ao4d]1 [o3gbo4e]1 [o3go4ce]1",
				"[o3gbo4d]1 [o3go4ce]1 [o3ao4ce]1 [o3f+ao4d]1",
				"[o3go4ce]1 [o3f+ao4d]1 [o3f+bo4d]1 [o3gbo4e]1",
				"[o3go4ce]1 [o3f+ao4d]1 [o3gao4ce]1 [o3f+ao4c]1",
			],
		},
	],
});

// ════════════════════ onjReze ════════════════════

/**
 * onjReze フィールド — ニ長調・138BPM・16小節（約28秒で一周）。夏の町を駆け回る、明るい8bit風の冒険曲。
 * 矩形波の旋律・もう1本の矩形波の分散和音・シンセベースのオクターブ跳ね・8ビート。
 * 1小節目と3小節目が同じ形の問いかけ、8小節目の終わりの E–F♯ で後半へ駆け込む。
 */
export const ONJREZE_FIELD: BgmState = mmlBgm({
	tempo: 138,
	head: {
		inst: "retro_game",
		drum: "8beat",
		volume: 26,
		reverb: 18,
		decay: 10,
	},
	tracks: [
		{
			// 旋律
			inst: "Lead 1 (square)",
			v: 92,
			fx: { rev: 12, dly: 8, eqhi: -3 },
			bars: [
				// D | A/C♯ | Bm | G
				"o4a8o5d8f+4e8d8a4 o5e4.c+8o4a2 o4b8o5d8f+4e8d8b4 o5a4.g8d2",
				// D | G | Em | A
				"o5f+8e8d8e8f+4a4 o5b4.a8g4d4 o5e8f+8g8a8b4g4 o5a2r4e8f+8",
				// G | A | F♯m | Bm
				"o5g4d8g8b4a8g8 o5a4.e8c+4e4 o5f+8a8o6c+4o5b8a8f+4 o5d4.f+8b2",
				// G | A | Em7 | Asus4 A
				"o6d4.o5b8g4b4 o6c+4.o5a8e4a4 o5g8f+8e8d8e4o4b4 o5d4c+4e2",
			],
		},
		{
			// 分散和音
			inst: "Lead 1 (square)",
			v: 40,
			fx: { rev: 14, dly: 10, pan: 88, eqhi: -6 },
			bars: [
				"o3f+8a8o4d8f+8d8o3a8o4d8o3a8 o3e8a8o4c+8e8c+8o3a8o4c+8o3a8 o3f+8b8o4d8f+8d8o3b8o4d8o3b8 o3g8b8o4d8g8d8o3b8o4d8o3b8",
				"o3f+8a8o4d8f+8d8o3a8o4d8o3a8 o3g8b8o4d8g8d8o3b8o4d8o3b8 o3g8b8o4e8g8e8o3b8o4e8o3b8 o3e8a8o4c+8e8c+8o3a8o4c+8o3a8",
				"o3g8b8o4d8g8d8o3b8o4d8o3b8 o3e8a8o4c+8e8c+8o3a8o4c+8o3a8 o3f+8a8o4c+8f+8c+8o3a8o4c+8o3a8 o3f+8b8o4d8f+8d8o3b8o4d8o3b8",
				"o3g8b8o4d8g8d8o3b8o4d8o3b8 o3e8a8o4c+8e8c+8o3a8o4c+8o3a8 o3g8b8o4d8e8d8o3b8o4d8o3b8 o3e8a8o4d8e8o3e8a8o4c+8e8",
			],
		},
		{
			// ベース
			inst: "Synth Bass 1",
			v: 86,
			fx: { rev: 4, eqlo: 2 },
			bars: [
				"o2d8o3d8o2d8o3d8o2d8o3d8o2d8o3d8 o2c+8o3c+8o2c+8o3c+8o2c+8o3c+8o2c+8o3c+8 o1b8o2b8o1b8o2b8o1b8o2b8o1b8o2b8 o1g8o2g8o1g8o2g8o1g8o2g8o1g8o2g8",
				"o2d8o3d8o2d8o3d8o2d8o3d8o2d8o3d8 o1g8o2g8o1g8o2g8o1g8o2g8o1g8o2g8 o2e8o3e8o2e8o3e8o2e8o3e8o2e8o3e8 o1a8o2a8o1a8o2a8o1a8o2a8o1a8o2a8",
				"o1g8o2g8o1g8o2g8o1g8o2g8o1g8o2g8 o1a8o2a8o1a8o2a8o1a8o2a8o1a8o2a8 o2f+8o3f+8o2f+8o3f+8o2f+8o3f+8o2f+8o3f+8 o1b8o2b8o1b8o2b8o1b8o2b8o1b8o2b8",
				"o1g8o2g8o1g8o2g8o1g8o2g8o1g8o2g8 o1a8o2a8o1a8o2a8o1a8o2a8o1a8o2a8 o2e8o3e8o2e8o3e8o2e8o3e8o2e8o3e8 o1a8o2a8o1a8o2a8o1a8o2a8o1a8o2a8",
			],
		},
	],
});

/**
 * onjReze ボス — ト短調・168BPM・16小節（約23秒で一周）。時間がない、走り続ける決戦。
 * のこぎり波の連打する旋律・矩形波の8分オスティナート・シンセベースの8分・16ビート。
 * 13〜14小節目で2拍ずつ上へ積み上げ、最後の D7 から頭の G へ戻る。
 */
export const ONJREZE_BOSS: BgmState = mmlBgm({
	tempo: 168,
	head: {
		inst: "retro_game",
		drum: "16beat",
		volume: 24,
		reverb: 18,
		decay: 10,
	},
	tracks: [
		{
			// 旋律
			inst: "Lead 2 (sawtooth)",
			v: 90,
			fx: { rev: 12, dly: 8, eqhi: -3 },
			bars: [
				// Gm | Gm | E♭ | F
				"o5g8g8r8f8g8r8b-4 o5a8g8f8d8f4g4 o5g8g8r8f8g8r8b-8o6c8 o5a4.f8o6c4o5a4",
				// Gm | Gm | Cm | D7
				"o6d8d8r8c8o5b-8r8a8b-8 o5g4.d8g4a4 o5b-8a8g8e-8c4e-4 o5f+4.a8o6d4c4",
				// E♭ | F | Dm | Gm
				"o5b-4.g8e-4g4 o6c8o5a8f8a8o6c4e-4 o6d4.c8o5a4f4 o5g8a8b-8o6c8d4r4",
				// Cm | E♭ | D | D7
				"o6e-8d8c8o5g8o6e-8d8c8o5g8 o5b-8g8e-8g8b-8o6c8d8e-8 o6d4.o5a8f+4a4 o6c4o5a4f+4a4",
			],
		},
		{
			// オスティナート
			inst: "Lead 1 (square)",
			v: 46,
			fx: { rev: 10, pan: 30, eqhi: -6 },
			bars: [
				"o3g8o4d8o3b-8o4d8o3g8o4d8o3b-8o4d8 o3g8o4d8o3b-8o4d8o3g8o4d8o3b-8o4d8 o3g8o4e-8o3b-8o4e-8o3g8o4e-8o3b-8o4e-8 o3f8o4c8o3a8o4c8o3f8o4c8o3a8o4c8",
				"o3g8o4d8o3b-8o4d8o3g8o4d8o3b-8o4d8 o3g8o4d8o3b-8o4d8o3g8o4d8o3b-8o4d8 o3g8o4e-8c8e-8o3g8o4e-8c8e-8 o3f+8o4c8o3a8o4c8o3f+8o4c8o3a8o4c8",
				"o3g8o4e-8o3b-8o4e-8o3g8o4e-8o3b-8o4e-8 o3f8o4c8o3a8o4c8o3f8o4c8o3a8o4c8 o3f8o4d8o3a8o4d8o3f8o4d8o3a8o4d8 o3g8o4d8o3b-8o4d8o3g8o4d8o3b-8o4d8",
				"o3g8o4e-8c8e-8o3g8o4e-8c8e-8 o3g8o4e-8o3b-8o4e-8o3g8o4e-8o3b-8o4e-8 o3f+8o4d8o3a8o4d8o3f+8o4d8o3a8o4d8 o3f+8o4c8o3a8o4c8o3f+8o4c8o3a8o4c8",
			],
		},
		{
			// ベース
			inst: "Synth Bass 2",
			v: 92,
			fx: { rev: 4, eqlo: 2 },
			bars: [
				"o1g8g8o2g8o1g8g8o2g8o1g8o2g8 o1g8g8o2g8o1g8g8o2g8o1g8o2g8 o2e-8e-8o3e-8o2e-8e-8o3e-8o2e-8o3e-8 o1f8f8o2f8o1f8f8o2f8o1f8o2f8",
				"o1g8g8o2g8o1g8g8o2g8o1g8o2g8 o1g8g8o2g8o1g8g8o2g8o1g8o2g8 o2c8c8o3c8o2c8c8o3c8o2c8o3c8 o2d8d8o3d8o2d8d8o3d8o2d8o3d8",
				"o2e-8e-8o3e-8o2e-8e-8o3e-8o2e-8o3e-8 o1f8f8o2f8o1f8f8o2f8o1f8o2f8 o2d8d8o3d8o2d8d8o3d8o2d8o3d8 o1g8g8o2g8o1g8g8o2g8o1g8o2g8",
				"o2c8c8o3c8o2c8c8o3c8o2c8o3c8 o2e-8e-8o3e-8o2e-8e-8o3e-8o2e-8o3e-8 o2d8d8o3d8o2d8d8o3d8o2d8o3d8 o2d8d8o3d8o2d8d8o3d8o2d8o3d8",
			],
		},
	],
});

// ════════════════════ 夢（yume） ════════════════════

/**
 * 夢 — ハのリディア（♯11）を軸に長3度ずつ転がる・54BPM・12小節（約53秒で一周）。
 * 覚めない夢の中を歩く、ぼんやりして少し気味の悪い環境音楽。オルゴールのまばらな音（G→F♯ の半音）・
 * halo パッドの長7の和音（Cmaj7→A♭maj7→Emaj7 と長3度で漂う）・コントラバスの持続音。拍感はほとんど出さない。
 */
export const YUME_DREAM: BgmState = mmlBgm({
	tempo: 54,
	head: {
		inst: "ambient_cloud",
		volume: 120,
		reverb: 46,
		decay: 36,
		predelay: 40,
	},
	tracks: [
		{
			// オルゴール
			inst: "Music Box",
			v: 52,
			fx: { rev: 44, dly: 40, pan: 62 },
			bars: [
				// Cmaj7♯11 | A♭maj7/C | Emaj7 | Cmaj7♯11
				"r4o5g8f+8r2 r2o6c4r4 o6d+2r2 r1",
				// Fm(maj7) | D♭maj7♯11 | Amaj7 | Fmaj7♯11
				"r4o5e8a-8o6c2 o5g2.r4 r2o6c+4o5g+4 o5b2r2",
				// Cmaj7♯11 | E♭maj7 | D♭maj7♯11 | Dm9/G
				"r4o5f+8g8b2 r2o6d4o5b-4 o6c2.r4 r2o5e4d4",
			],
		},
		{
			// パッド
			inst: "Pad 7 (halo)",
			v: 36,
			fx: { rev: 40, eqhi: -6, width: 140 },
			bars: [
				"[o3egbo4f+]1 [o3e-ga-o4c]1 [o3eg+bo4d+]1 [o3egbo4f+]1",
				"[o3fa-o4ce]1 [o3fa-o4cg]1 [o3eg+ao4c+]1 [o3fabo4e]1",
				"[o3egbo4f+]1 [o3e-gb-o4d]1 [o3fa-o4cg]1 [o3fao4ce]1",
			],
		},
		{
			// 持続音
			inst: "Contrabass",
			v: 40,
			fx: { rev: 30, eqhi: -6 },
			bars: [
				"o2c1 o2c1 o2e1 o2c1",
				"o2f1 o2d-1 o1a1 o2f1",
				"o2c1 o2e-1 o2d-1 o1g1",
			],
		},
	],
});

// ════════════════════ 東方二次創作（touhou） ════════════════════

/**
 * 東方二次創作 道中 — イ長調・164BPM・16小節（約23秒で一周）。空を飛んで弾幕をくぐる、速くて明るいシューティング。
 * のこぎり波の旋律（8分と16分の駆け上がり）・ピアノの刻み・シンセベースの8分・弦の白玉・16ビート。
 * 8小節目の C♯7（Ⅵ への属和音）で転がり、15小節目で最高音 F♯6 に一度だけ届く。
 */
export const TOUHOU_STAGE: BgmState = mmlBgm({
	tempo: 164,
	head: {
		inst: "synth_pop",
		drum: "16beat",
		volume: 22,
		reverb: 20,
		decay: 12,
	},
	tracks: [
		{
			// 旋律
			inst: "Lead 2 (sawtooth)",
			v: 90,
			fx: { rev: 14, dly: 10, eqhi: -2 },
			bars: [
				// A | E/G♯ | F♯m | D
				"o5e8a8o6c+8o5b8a8e8a4 o5g+8e8b4a8g+8e4 o5f+8a8o6c+8e8d8c+8o5a4 o6d4.c+8o5b8a8f+4",
				// Bm | E | A | C♯7
				"o5b8a8f+8d8o4b8o5d8f+8a8 o5g+4.b8o6e4d4 o6c+16d16c+8o5b8a8e4a4 o5g+8f8c+8f8g+8b8o6c+4",
				// D | E | C♯m | F♯m
				"o6d4o5a8f+8a8o6d8e4 o6e4.d8o5b4g+4 o6c+8o5b8g+8e8g+8b8o6c+8e8 o6c+4.o5a8f+2",
				// Bm | C♯m | D | Esus4 E
				"o6d8c+8o5b8f+8o6d8c+8o5b8f+8 o6e8c+8o5g+8o6c+8e8c+8o5g+8e8 o5f+8a8o6d8f+8e4d4 o5a4b4o6d8c+8o5b4",
			],
		},
		{
			// ピアノ
			inst: "Acoustic Grand Piano",
			v: 60,
			fx: { rev: 14, pan: 40, width: 115 },
			bars: [
				"[o4c+ea]4r8[o4c+ea]8r8[o4c+ea]8[o4c+ea]4 [o3bo4eg+]4r8[o3bo4eg+]8r8[o3bo4eg+]8[o3bo4eg+]4 [o4c+f+a]4r8[o4c+f+a]8r8[o4c+f+a]8[o4c+f+a]4 [o4df+a]4r8[o4df+a]8r8[o4df+a]8[o4df+a]4",
				"[o4df+b]4r8[o4df+b]8r8[o4df+b]8[o4df+b]4 [o3bo4eg+]4r8[o3bo4eg+]8r8[o3bo4eg+]8[o3bo4eg+]4 [o4c+ea]4r8[o4c+ea]8r8[o4c+ea]8[o4c+ea]4 [o3bo4fg+]4r8[o3bo4fg+]8r8[o3bo4fg+]8[o3bo4fg+]4",
				"[o4df+a]4r8[o4df+a]8r8[o4df+a]8[o4df+a]4 [o3bo4eg+]4r8[o3bo4eg+]8r8[o3bo4eg+]8[o3bo4eg+]4 [o4c+eg+]4r8[o4c+eg+]8r8[o4c+eg+]8[o4c+eg+]4 [o4c+f+a]4r8[o4c+f+a]8r8[o4c+f+a]8[o4c+f+a]4",
				"[o4df+b]4r8[o4df+b]8r8[o4df+b]8[o4df+b]4 [o4c+eg+]4r8[o4c+eg+]8r8[o4c+eg+]8[o4c+eg+]4 [o4df+a]4r8[o4df+a]8r8[o4df+a]8[o4df+a]4 [o3bo4ea]4r8[o3bo4ea]8[o3bo4eg+]4r8[o3bo4eg+]8",
			],
		},
		{
			// ベース
			inst: "Synth Bass 1",
			v: 86,
			fx: { rev: 4, eqlo: 2 },
			bars: [
				"o1a8a8o2a8o1a8a8o2a8o1a8o2a8 o1g+8g+8o2g+8o1g+8g+8o2g+8o1g+8o2g+8 o1f+8f+8o2f+8o1f+8f+8o2f+8o1f+8o2f+8 o2d8d8o3d8o2d8d8o3d8o2d8o3d8",
				"o1b8b8o2b8o1b8b8o2b8o1b8o2b8 o2e8e8o3e8o2e8e8o3e8o2e8o3e8 o1a8a8o2a8o1a8a8o2a8o1a8o2a8 o2c+8c+8o3c+8o2c+8c+8o3c+8o2c+8o3c+8",
				"o2d8d8o3d8o2d8d8o3d8o2d8o3d8 o2e8e8o3e8o2e8e8o3e8o2e8o3e8 o2c+8c+8o3c+8o2c+8c+8o3c+8o2c+8o3c+8 o1f+8f+8o2f+8o1f+8f+8o2f+8o1f+8o2f+8",
				"o1b8b8o2b8o1b8b8o2b8o1b8o2b8 o2c+8c+8o3c+8o2c+8c+8o3c+8o2c+8o3c+8 o2d8d8o3d8o2d8d8o3d8o2d8o3d8 o2e8e8o3e8o2e8e8o3e8o2e8o3e8",
			],
		},
		{
			// 弦
			inst: "String Ensemble 1",
			v: 38,
			fx: { rev: 24, pan: 90, eqlo: -3 },
			bars: [
				"[o3eao4c+]1 [o3eg+b]1 [o3f+ao4c+]1 [o3f+ao4d]1",
				"[o3f+bo4d]1 [o3eg+b]1 [o3eao4c+]1 [o3fg+b]1",
				"[o3f+ao4d]1 [o3eg+b]1 [o3eg+o4c+]1 [o3f+ao4c+]1",
				"[o3f+bo4d]1 [o3eg+o4c+]1 [o3f+ao4d]1 [o3eab]2[o3eg+b]2",
			],
		},
	],
});

/**
 * 東方二次創作 ボス — ヘ短調・170BPM・16小節（約23秒で一周）。スペルカードが飛び交う、激しい短調のボス戦。
 * 太いリードの旋律・ピアノの16分の分散和音・シンセベースの8分・シンセ弦の白玉・16ビート。
 * 前半は Fm–E♭–D♭–C（下降する4和音）を2回、15小節目で最高音 A♭6、最後の C7(♭9) で頭の F へ落ちる。
 */
export const TOUHOU_BOSS: BgmState = mmlBgm({
	tempo: 170,
	head: {
		inst: "synth_pop",
		drum: "16beat",
		volume: 22,
		reverb: 20,
		decay: 12,
	},
	tracks: [
		{
			// 旋律
			inst: "Lead 8 (bass + lead)",
			v: 86,
			fx: { rev: 14, dly: 10, eqhi: -2 },
			bars: [
				// Fm | E♭ | D♭ | C
				"o5f8g8a-8o6c8o5b-8a-8g8a-8 o5g4.e-8o4b-4o5e-4 o5f8a-8o6d-8c8o5a-8f8a-4 o5e4.g8o6c4o5b-4",
				// Fm | E♭ | D♭ | C7
				"o5a-8g8f8c8f8g8a-8b-8 o5g8b-8o6e-4d8o5b-8g4 o5a-4.f8d-4f4 o5e8g8b-8o6c8d-4c4",
				// B♭m | C | Fm | D♭
				"o6d-4.c8o5b-4f4 o5e4.f8g4o6c4 o5a-8o6c8f8e-8c8o5a-8f4 o6d-2c4o5a-4",
				// B♭m | E♭ | A♭ | C7(♭9)
				"o5b-8o6d-8f8d-8o5b-8f8d-8f8 o6e-4.d8o5b-4g4 o6c8e-8a-4g4e-4 o6e8d-8o5b-8g8e8d-8c4",
			],
		},
		{
			// ピアノ
			inst: "Acoustic Grand Piano",
			v: 52,
			fx: { rev: 14, pan: 36, width: 115 },
			bars: [
				"o3f16o4c16f16a-16c16f16a-16f16o3f16o4c16f16a-16c16f16a-16f16 o3e-16b-16o4e-16g16o3b-16o4e-16g16e-16o3e-16b-16o4e-16g16o3b-16o4e-16g16e-16 o3d-16a-16o4d-16f16o3a-16o4d-16f16d-16o3d-16a-16o4d-16f16o3a-16o4d-16f16d-16 o3c16g16o4c16e16o3g16o4c16e16c16o3c16g16o4c16e16o3g16o4c16e16c16",
				"o3f16o4c16f16a-16c16f16a-16f16o3f16o4c16f16a-16c16f16a-16f16 o3e-16b-16o4e-16g16o3b-16o4e-16g16e-16o3e-16b-16o4e-16g16o3b-16o4e-16g16e-16 o3d-16a-16o4d-16f16o3a-16o4d-16f16d-16o3d-16a-16o4d-16f16o3a-16o4d-16f16d-16 o3c16g16b-16o4e16o3g16b-16o4e16o3b-16c16g16b-16o4e16o3g16b-16o4e16o3b-16",
				"o2b-16o3f16b-16o4d-16o3f16b-16o4d-16o3b-16o2b-16o3f16b-16o4d-16o3f16b-16o4d-16o3b-16 o3c16g16o4c16e16o3g16o4c16e16c16o3c16g16o4c16e16o3g16o4c16e16c16 o3f16o4c16f16a-16c16f16a-16f16o3f16o4c16f16a-16c16f16a-16f16 o3d-16a-16o4d-16f16o3a-16o4d-16f16d-16o3d-16a-16o4d-16f16o3a-16o4d-16f16d-16",
				"o2b-16o3f16b-16o4d-16o3f16b-16o4d-16o3b-16o2b-16o3f16b-16o4d-16o3f16b-16o4d-16o3b-16 o3e-16b-16o4e-16g16o3b-16o4e-16g16e-16o3e-16b-16o4e-16g16o3b-16o4e-16g16e-16 o2a-16o3e-16a-16o4c16o3e-16a-16o4c16o3a-16o2a-16o3e-16a-16o4c16o3e-16a-16o4c16o3a-16 o3c16e16b-16o4d-16o3e16b-16o4d-16o3b-16c16e16b-16o4d-16o3e16b-16o4d-16o3b-16",
			],
		},
		{
			// ベース
			inst: "Synth Bass 2",
			v: 90,
			fx: { rev: 4, eqlo: 2 },
			bars: [
				"o1f8f8o2f8o1f8f8o2f8o1f8o2f8 o2e-8e-8o3e-8o2e-8e-8o3e-8o2e-8o3e-8 o2d-8d-8o3d-8o2d-8d-8o3d-8o2d-8o3d-8 o2c8c8o3c8o2c8c8o3c8o2c8o3c8",
				"o1f8f8o2f8o1f8f8o2f8o1f8o2f8 o2e-8e-8o3e-8o2e-8e-8o3e-8o2e-8o3e-8 o2d-8d-8o3d-8o2d-8d-8o3d-8o2d-8o3d-8 o2c8c8o3c8o2c8c8o3c8o2c8o3c8",
				"o1b-8b-8o2b-8o1b-8b-8o2b-8o1b-8o2b-8 o2c8c8o3c8o2c8c8o3c8o2c8o3c8 o1f8f8o2f8o1f8f8o2f8o1f8o2f8 o2d-8d-8o3d-8o2d-8d-8o3d-8o2d-8o3d-8",
				"o1b-8b-8o2b-8o1b-8b-8o2b-8o1b-8o2b-8 o2e-8e-8o3e-8o2e-8e-8o3e-8o2e-8o3e-8 o1a-8a-8o2a-8o1a-8a-8o2a-8o1a-8o2a-8 o2c8c8o3c8o2c8c8o3c8o2c8o3c8",
			],
		},
		{
			// 弦
			inst: "Synth Strings 1",
			v: 38,
			fx: { rev: 24, pan: 92, eqlo: -3 },
			bars: [
				"[o3fa-o4c]1 [o3e-gb-]1 [o3fa-o4d-]1 [o3ego4c]1",
				"[o3fa-o4c]1 [o3e-gb-]1 [o3fa-o4d-]1 [o3egb-]1",
				"[o3fb-o4d-]1 [o3ego4c]1 [o3fa-o4c]1 [o3fa-o4d-]1",
				"[o3fb-o4d-]1 [o3e-gb-]1 [o3e-a-o4c]1 [o3eb-o4d-]1",
			],
		},
	],
});
