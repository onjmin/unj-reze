import { sAnimUrl as sa, spriteUrl as sp } from "@/lib/rpgen-assets";
import { newObject, type PresetData, ROWS, COLS, TILE_SIZE } from "./shared";

const wr = (id: string) => `walk:auto:u:${sa(id)}`;
const ir = (id: string) => `url:${sp(id)}`;

const SPR = {
	slime: "k3vKh6",
	hero: "0yyTSP",
} as const;

export const dq: PresetData = {
	id: "dq",
	name: "DQ風RPG",
	engine: "rpg",
	gravity: 0,
	friction: 0,
	sfx: {},
	player: {
		emoji: "🧝",
		color: "#0000ff",
		speed: 3,
		jumpPower: 5,
		w: 32,
		h: 32,
		start: { x: TILE_SIZE * 3, y: TILE_SIZE * 3 },
		spriteRef: wr(SPR.hero),
		spriteUrl: sa(SPR.hero),
	},
	tiles: {
		0: {
			name: "草原",
			color: "#5c94fc",
			passable: true,
		},
		1: {
			name: "壁",
			color: "#8B4513",
			passable: false,
		},
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
			label: "フィールド",
		},
	],
	objects: [
		newObject({
			emoji: "💧",
			col: 5,
			row: 5,
			phase: 0,
			hp: 5,
			isEnemy: true,
			name: "スライム",
			spriteRef: wr(SPR.slime),
			spriteUrl: sa(SPR.slime),
			rpgEncounter: {
				bgImg: ir("X1lgbYC"),
				bgType: "fit",
				music: "",
			},
		}),
	],
};
