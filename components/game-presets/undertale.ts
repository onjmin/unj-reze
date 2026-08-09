import { sAnimUrl as sa } from "@/lib/rpgen-assets";
import { newObject, type PresetData, ROWS, COLS } from "./shared";

const wr = (id: string) => `walk:auto:u:${sa(id)}`;

export const undertale: PresetData = {
	id: "undertale",
	name: "アンダー(RPG)",
	engine: "rpg",
	player: {
		emoji: "😐",
		color: "#ffea00",
		speed: 3,
		start: { x: 3, y: 3 },
	},
	tiles: {
		0: { name: "ゆか", color: "#574370", passable: true },
		1: { name: "かべ", color: "#2b2142", passable: false },
	},
	map: Array.from({ length: ROWS }, (_, y) =>
		Array.from({ length: COLS }, (_, x) =>
			y === 0 || y === ROWS - 1 || x === 0 || x === COLS - 1 ? 1 : 0,
		),
	),
	phases: [
		{
			id: "ruins",
			kind: "rpg",
			label: "いせき",
		},
	],
	objects: [
		newObject({
			emoji: "🐸",
			col: 5,
			row: 5,
			phase: 0,
			hp: 10,
			isEnemy: true,
			name: "フロギー",
		}),
	],
};
