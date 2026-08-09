import { sAnimUrl as sa } from "@/lib/rpgen-assets";
import { newObject, type PresetData, ROWS, COLS, TILE_SIZE } from "./shared";

const wr = (id: string) => `walk:auto:u:${sa(id)}`;

const MON = {
	slime: "YwpE7Q",
	reze: "US6LgA", // レゼ（ボス本人）
};

export const onjReze: PresetData = {
	id: "onjReze",
	name: "おんJ(レゼ)",
	engine: "onjReze",
	gravity: 0,
	friction: 0,
	sfx: {},
	player: {
		emoji: "彡",
		color: "#ffaa00",
		speed: 3,
		jumpPower: 5,
		w: 32,
		h: 32,
		start: { x: TILE_SIZE * 3, y: TILE_SIZE * 3 },
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
		// isBoss: true が onjReze エンジンのクリア判定（フィールド上の isBoss を全滅させたら
		// outroDialogue → エンディング）を発火させる。これが無いとゲームがクリア不能になる。
		newObject({
			emoji: "🧨",
			name: "レゼ",
			col: 14,
			row: 10,
			phase: 0,
			behavior: "chase",
			speed: 0.9,
			hp: 50,
			atk: 30,
			def: 18,
			exp: 60,
			hazard: true,
			isEnemy: true,
			isBoss: true,
			spriteRef: wr(MON.reze),
			spriteUrl: sa(MON.reze),
			outroDialogue: [
				{
					speaker: "レゼ",
					emoji: "🧨",
					text: "あはっ……　つよいんだね、キミ。",
				},
				{
					speaker: "レゼ",
					emoji: "🧨",
					text: "ねえ、いっしょに　いかない？\nここじゃない　どこかへ。",
				},
				{
					speaker: "なんJ民",
					emoji: "🧑",
					side: "right",
					text: "……悪いけど、ワイにはこの街があるんや。",
				},
				{
					speaker: "レゼ",
					emoji: "🧨",
					text: "そっか。……ざんねん。\nでも、たのしかったよ。ありがとう。",
				},
			],
		}),
	],
};
