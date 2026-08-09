import {
	newObject,
	normalizeWall25D,
	type PresetData,
	ROWS,
	COLS,
	type Wall25D,
} from "./shared";

// 外周の壁（1マスずつ薄板を積む）。yume25d は 2D の map/tiles とは別のレイヤー（layout25d）を使うため、
// 2D側の外周1マス壁だけでは何も起きない。
const walls: Wall25D[] = [];
for (let c = 0; c < COLS; c++) {
	walls.push(normalizeWall25D(c, 0, 0, 1), normalizeWall25D(c, ROWS - 1, 2, 1));
}
for (let r = 0; r < ROWS; r++) {
	walls.push(normalizeWall25D(0, r, 3, 1), normalizeWall25D(COLS - 1, r, 1, 1));
}

export const yume: PresetData = {
	id: "yume",
	name: "ゆめ(2.5D)",
	engine: "yume25d",
	gravity: 0,
	friction: 0,
	sfx: {},
	player: {
		emoji: "👧",
		color: "#ff88ff",
		speed: 0.1,
		jumpPower: 0,
		w: 32,
		h: 32,
		start: { x: 3, y: 3 },
	},
	tiles: {
		0: { name: "床", color: "#5c94fc", passable: true },
		1: { name: "壁", color: "#8B4513", passable: false },
	},
	map: Array.from({ length: ROWS }, (_, y) =>
		Array.from({ length: COLS }, (_, x) =>
			y === 0 || y === ROWS - 1 || x === 0 || x === COLS - 1 ? 1 : 0,
		),
	),
    layout25d: {
        cols: COLS,
        rows: ROWS,
        // 以前は床グリッドが壁テクスチャ(id:1, kind:'wall')を指しており、床用テクスチャが1つも
        // 登録されていなかった（「床」ツールのパレットが常に空になるバグ）。床(id:2, kind:'floor')を
        // 別途用意して指す。また walls が空で外周の壁も実際には存在していなかったので生成する。
        floor: Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 2)),
        ceiling: false,
        ceilingTex: 0,
        walls,
        billboards: [],
        textures: {
            1: { id: 1, name: "壁", kind: "wall", color: "#8B4513", imageUrl: "/assets/yume-textures/wall.png" },
            2: { id: 2, name: "ゆか", kind: "floor", color: "#5c94fc" },
        },
        wallHeight: 1,
        skyColor: "#000000",
        fogColor: "#000000",
        fogNear: 1,
        fogFar: 10,
        start: { col: 3, row: 3, dir: 0 },
    },
	phases: [
		{
			id: "room",
			kind: "rpg",
			label: "へや",
		},
	],
	objects: [
		newObject({
			id: "1",
			emoji: "🚪",
			col: 5,
			row: 5,
			phase: 0,
			name: "とびら",
			pages: [{ conditions: {}, commands: [{ type: "message", text: "とびらだ。" }] }],
		}),
	],
};
