import { sAnimUrl as sa, spriteUrl as sp } from "@/lib/rpgen-assets";
import { newObject, type PresetData, ROWS, COLS } from "./shared";

const ir = (id: string) => `url:${sp(id)}`;

export const rockman: PresetData = {
	id: "rockman",
	name: "ロック(アクション)",
	engine: "action",
	gravity: 0.25,
	friction: 0.1,
	sfx: {},
	player: {
		emoji: "👦",
		color: "#0073F6",
		speed: 3,
		jumpPower: -11,
		w: 16,
		h: 16,
		start: { x: 32, y: 32 },
		spriteRef: `walk:auto:u:${sa("BwH9lB")}`,
		spriteUrl: sa("BwH9lB"),
	},
	tiles: {
		0: {
			name: "空",
			color: "#0d1826",
			passable: true,
			imageRef: ir("X1lgbYC"),
			imageUrl: sp("X1lgbYC"),
		},
		1: {
			name: "鉄",
			color: "#b4b6b4",
			passable: false,
			imageRef: ir("wF7vf3V"),
			imageUrl: sp("wF7vf3V"),
		},
	},
	map: Array.from({ length: ROWS }, (_, y) =>
		Array.from({ length: COLS }, (_, x) =>
			y === ROWS - 1 || x === 0 || x === COLS - 1 ? 1 : 0,
		),
	),
	phases: [
		{
			id: "stage1",
			kind: "stage",
			label: "ステージ 1",
		},
	],
	objects: [
		newObject({
			emoji: "🤖",
			col: 8,
			row: ROWS - 2,
			phase: 0,
			hp: 3,
			isEnemy: true,
			name: "メットール",
			spriteRef: `walk:auto:u:${sa("722x2w")}`,
			spriteUrl: sa("722x2w"),
			miniScript: `
while true
  wait(60)
  shotPlayer(2, 4, 10)
end while
`.trim(),
		}),
	],
};
