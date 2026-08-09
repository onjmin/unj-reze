import { sAnimUrl as sa } from "@/lib/rpgen-assets";
import { newObject, type PresetData, ROWS, COLS } from "./shared";

const wr = (id: string) => `walk:auto:u:${sa(id)}`;

const MON = {
	slime: "YwpE7Q",
};

export const onjReze: PresetData = {
	id: "onj-reze",
	name: "おんJ(レゼ)",
	engine: "onjReze",
	player: {
		emoji: "彡",
		color: "#ffaa00",
		speed: 3,
		start: { x: 3, y: 3 },
	},
	tiles: {
		0: { name: "草", color: "#3a9a4a", passable: true },
		1: { name: "壁", color: "#555555", passable: false },
	},
	map: Array.from({ length: ROWS }, (_, y) =>
		Array.from({ length: COLS }, (_, x) =>
			y === 0 || y === ROWS - 1 || x === 0 || x === COLS - 1 ? 1 : 0,
		),
	),
	phases: [
		{
			id: "field",
			kind: "rpg",
			label: "平原",
		},
	],
	objects: [
		newObject({
			emoji: "🟢",
			col: 5,
			row: 5,
			phase: 0,
			hp: 10,
			isEnemy: true,
			name: "スライム",
			spriteRef: wr(MON.slime),
			spriteUrl: sa(MON.slime),
		}),
	],
};
