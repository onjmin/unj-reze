import { newObject, type PresetData, ROWS, COLS } from "./shared";

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
        floor: Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 1)),
        ceiling: false,
        ceilingTex: 0,
        walls: [],
        billboards: [],
        textures: {
            1: { id: 1, name: "壁", kind: "wall", color: "#8B4513", imageUrl: "/assets/yume-textures/wall.png" },
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
