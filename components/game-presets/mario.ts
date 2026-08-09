import { resolveSMCUrl } from "../../lib/smc-helper";
import {
	COLS,
	newObject,
	type PresetData,
	ROWS,
} from "./shared";

const SMC_CDN = "https://cdn.jsdelivr.net/gh/Level-Share-Square/SMC-released-sprites@main";
const smc = (path: string) => `${SMC_CDN}/${path}`;
const smcTile = (path: string, sx: number, sy: number, sw = 16, sh = 16) => `${smc(path)}#${sx},${sy},${sw},${sh}`;
const smcRef = (url: string) => `url:${url.split("#")[0]}`;

const RETRO = "SMW/Objects/Retro%20Skins/Retro_SMB1_Blocks.png";
const T = {
	brick: smcTile(RETRO, 144, 16, 16, 16),
};

export const mario: PresetData = {
	id: "mario",
	name: "アクション(SMC)",
	engine: "action",
	gravity: 0.25,
	friction: 0.1,
	player: {
		emoji: "👨🏻",
		color: "#ff0000",
		speed: 3,
		jumpPower: 5,
		w: 16,
		h: 16,
		start: { x: 32, y: 32 },
		spriteRef: `walk:smc_json:Mario`,
		spriteUrl: resolveSMCUrl("images/player-sheet0.png"),
	},
	tiles: {
		0: { name: "空", color: "#5c94fc", passable: true },
		1: {
			name: "ブロック",
			color: "#8B4513",
			passable: false,
			imageRef: smcRef(T.brick),
			imageUrl: T.brick,
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
			emoji: "🍄",
			col: 8,
			row: ROWS - 2,
			phase: 0,
			hp: 1,
			isEnemy: true,
			name: "クリボー",
			spriteRef: "walk:smc_json:Goomba",
			spriteUrl: resolveSMCUrl("images/goomba-sheet0.png"),
			miniScript: `
moveLeft()
while true
  wait(30)
end while
`.trim(),
		}),
	],
};
