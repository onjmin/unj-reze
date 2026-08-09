import { sAnimUrl as sa } from "@/lib/rpgen-assets";
import { newObject, type PresetData, ROWS, COLS } from "./shared";

const wr = (id: string) => `walk:auto:u:${sa(id)}`;

const SPR = {
	bikeOni: "m9nxuZ", 
} as const;

export const deltarune: PresetData = {
	id: "deltarune",
	name: "デルタ(RPG)",
	engine: "rpg",
	player: {
		emoji: "👦",
		color: "#5c94fc",
		speed: 3,
		start: { x: 3, y: 3 },
	},
	tiles: {
		0: { name: "地面", color: "#3a2a5c", passable: true },
		1: { name: "壁", color: "#1b1230", passable: false },
	},
	map: Array.from({ length: ROWS }, (_, y) =>
		Array.from({ length: COLS }, (_, x) =>
			y === 0 || y === ROWS - 1 || x === 0 || x === COLS - 1 ? 1 : 0,
		),
	),
	phases: [
		{
			id: "dark",
			kind: "rpg",
			label: "くらやみ",
		},
	],
	objects: [
		newObject({
			emoji: "🏍️",
			col: 5,
			row: 5,
			phase: 0,
			hp: 10,
			isEnemy: true,
			name: "バイク鬼",
			spriteRef: wr(SPR.bikeOni),
			spriteUrl: sa(SPR.bikeOni),
		}),
	],
};
