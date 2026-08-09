import { type PresetData, ROWS, COLS } from "./shared";

export const yume: PresetData = {
	id: "yume",
	name: "ゆめ(2.5D)",
	engine: "yume25d",
	player: {
		emoji: "👧",
		color: "#ff88ff",
		speed: 0.1,
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
        walls: [],
        floor: Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 1)),
        textures: {
            1: "url:/assets/yume-textures/wall.png",
        },
        billboards: [],
    },
	phases: [
		{
			id: "room",
			kind: "rpg",
			label: "へや",
		},
	],
	objects: [
		{
			id: "1",
			emoji: "🚪",
			col: 5,
			row: 5,
			phase: 0,
			name: "とびら",
			pages: [{ commands: [{ code: "showText", text: "とびらだ。" }] }],
		},
	],
};
