// 3D MMOプリセット。マップの実体は Mmo3dMaker（three.js/Babylon.js）が持つため、
// 既存の map/tiles/objects は使わない（yume25dプリセットと同じ「型を満たすだけの空データ」方針）。
// 参考: docs/mmo3d-feature-design.md

import { COLS, defaultDeathScreen, type PresetData, ROWS, TILE_SIZE } from "./shared";

export const mmo3d: PresetData = {
	id: "mmo3d",
	name: "3D MMO",
	engine: "mmo3d",
	gravity: 0,
	friction: 0,
	player: {
		emoji: "🧑",
		color: "#ffb300",
		speed: 2,
		jumpPower: 0,
		w: 24,
		h: 24,
		start: { x: TILE_SIZE * 8, y: TILE_SIZE * 8 },
	},
	tiles: { 0: { name: "なし", color: "#000000", passable: true } },
	map: Array.from({ length: ROWS }, () => Array(COLS).fill(0)),
	objects: [],
	sfx: {},
	titleScreen: {
		enabled: true,
		heading: "3D MMO",
		subtitle: "ドラッグで視点移動 ／ WASDで移動 ／ Shiftダッシュ ／ タップで攻撃",
		textColor: "#ffe0a0",
		menu: [{ kind: "newGame", label: "はじめる" }],
	},
	deathScreen: defaultDeathScreen(),
	mmo3dConfig: { renderer: "three" },
};
