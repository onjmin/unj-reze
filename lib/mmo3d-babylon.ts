// mmo3d の Babylon.js バックエンド（lib/mmo3d.ts の three.js版と対になる実装）。
// three-stdlib と babylon-mmd は同じ<canvas>のWebGLコンテキストを共有できないため、
// ゲームごとに `Mmo3dRenderer`（components/game-presets/shared.ts）でどちらか片方だけを選ぶ。
//
// フェーズ2: 地面 + プレースホルダーキャラクター。
// フェーズ7: babylon-mmd の PmxLoader を登録し、MMD(PMX)モデルをCORSプロキシ経由リトライ付きで
// 読み込めるようにした（loadMmdModel）。
// フェーズ13: MmdRuntime + VmdLoader を使ったVMDモーション再生（loadMmdModelAndPlay）を追加。
// 参考: docs/mmo3d-feature-design.md

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Vector3 } from "@babylonjs/core/Maths/math";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Meshes/meshBuilder";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { RegisterPmxLoader } from "babylon-mmd/esm/Loader/pmxLoader";
import { VmdLoader } from "babylon-mmd/esm/Loader/vmdLoader";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeModelAnimation"; // MmdAnimationにcreateRuntimeModelAnimationを生やす副作用import
import type { MmdSkinnedMesh } from "babylon-mmd/esm/Runtime/mmdMesh";
import type { MmdModel } from "babylon-mmd/esm/Runtime/mmdModel";
import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import type { MmdRuntimeAnimationHandle } from "babylon-mmd/esm/Runtime/mmdRuntimeAnimationHandle";
import { notifyCorsProxyUsed, wrapCorsProxyUrl } from "@/lib/cors-proxy";
import type { Mmo3dInputState } from "@/lib/mmo3d";
import type { RealtimePlayer } from "@/lib/realtime/channels";

const WALK_SPEED = 2.2; // m/s（three版 lib/mmo3d.ts と揃える）
const RUN_SPEED = 5.5; // m/s
const TURN_SPEED = 2.4; // ラジアン/秒（three版・lib/yume25d.ts と同値）

// ── 簡易近接戦闘（three版 lib/mmo3d.ts と同じ数値。フェーズ15でbabylon版にも移植）。 ──
const ATTACK_COOLDOWN_SEC = 0.6;
const ATTACK_SWING_SEC = 0.25;
const ATTACK_RANGE = 2.2; // m
const ATTACK_HALF_ANGLE = Math.PI / 3; // ±60°の扇状判定
const ATTACK_DAMAGE = 20;
const PLAYER_MAX_HP = 100;
const DUMMY_MAX_HP = 60;
const DUMMY_RESPAWN_SEC = 3;
const BOARD_INTERACT_RANGE = 2.5; // m
const BOARD_DEFAULT_Y = 1.2;

// ── フェーズ25: キャラ育成（three版と同じ数値）。TODO(persist): 永続化未着手。 ──
const XP_PER_DUMMY_KILL = 25;
const XP_TO_NEXT_BASE = 50;
const HP_GROWTH_PER_LEVEL = 15;
const ATTACK_GROWTH_PER_LEVEL = 4;

// ── フェーズ26: 装備（武器種）・複数スキル選択（three版 lib/mmo3d.ts と同じ定義）。
// TODO(persist): エンジン内メモリのみ。 ──
interface WeaponDef {
	id: string;
	label: string;
	dmgMult: number;
	rangeMult: number;
	cooldownMult: number;
}
const WEAPON_TYPES: readonly WeaponDef[] = [
	{ id: "sword", label: "剣", dmgMult: 1.0, rangeMult: 1.0, cooldownMult: 1.0 },
	{ id: "spear", label: "槍", dmgMult: 0.8, rangeMult: 1.4, cooldownMult: 1.05 },
	{ id: "axe", label: "斧", dmgMult: 1.45, rangeMult: 0.8, cooldownMult: 1.35 },
];
const DEFAULT_WEAPON_ID = WEAPON_TYPES[0].id;

interface SkillDef {
	id: string;
	label: string;
	dmgMult: number;
	range: number;
	cooldownSec: number;
	aoe: boolean;
	swingSec: number;
}
const SKILL_TYPES: readonly SkillDef[] = [
	{ id: "burst", label: "回転斬り", dmgMult: 2.4, range: 3.4, cooldownSec: 3.0, aoe: true, swingSec: 0.4 },
	{ id: "pierce", label: "貫き突き", dmgMult: 3.6, range: 4.2, cooldownSec: 4.5, aoe: false, swingSec: 0.3 },
];
const DEFAULT_SKILL_ID = SKILL_TYPES[0].id;
const PIERCE_HALF_ANGLE = Math.PI / 10;

const NPC_INTERACT_RANGE = 2.5; // m

interface BabylonDummy {
	mesh: AbstractMesh;
	mat: StandardMaterial;
	hp: number;
	respawnAt: number | null;
	baseX: number;
	baseZ: number;
}

let pmxLoaderRegistered = false;
/** 副作用importは呼ぶたびに再登録されないよう1回だけ実行する。 */
function ensurePmxLoaderRegistered() {
	if (pmxLoaderRegistered) return;
	RegisterPmxLoader();
	pmxLoaderRegistered = true;
}

export class Mmo3dBabylonEngine {
	private engine: Engine;
	private scene: Scene;
	private camera: ArcRotateCamera;
	private disposed = false;
	private mmdRuntime: MmdRuntime | null = null;

	private placeholderPlayer: AbstractMesh | null = null;
	/** プレイヤーの位置/向きの実体。プレースホルダーもMMDモデルもこの子として追従する。 */
	private playerRoot: TransformNode;
	private facing = 0; // ラジアン、three版 lib/mmo3d.ts の facing と同じ定義（+Zを0とする）

	// ── 移動入力（フェーズ22: ストレイフ廃止のタンク操作。three版と共有の型）。 ──
	private input: Mmo3dInputState = {
		forward: false,
		back: false,
		turnL: false,
		turnR: false,
		run: false,
	};

	// ── 他プレイヤー（ゴースト）。three版と同じく簡易カプセルのみ、実モデルは持たない。 ──
	private ghostMat: StandardMaterial;
	private ghosts = new Map<string, AbstractMesh>();

	// ── 簡易近接戦闘（フェーズ15: three版からの移植→フェーズ25でスキル攻撃追加）。 ──
	private weapon: AbstractMesh | null = null;
	private weaponMat: StandardMaterial | null = null;
	private attackCooldown = 0;
	private attackSwingT = -1; // -1=非攻撃中、0〜ATTACK_SWING_SECでスイング中
	private skillCooldown = 0;
	private skillSwingT = -1;
	private activeSkillSwingSec = 0.4;
	private playerHp = PLAYER_MAX_HP;
	private dummies: BabylonDummy[] = [];
	private elapsedSec = 0;
	private onPlayerDamaged: ((hp: number, max: number) => void) | null = null;
	private onDummyDamaged: ((index: number, hp: number, max: number) => void) | null = null;

	// ── フェーズ25: キャラ育成。TODO(persist): 永続化未着手（three版と同じ方針）。 ──
	private level = 1;
	private xp = 0;
	private onLevelChanged:
		| ((level: number, xp: number, xpToNext: number) => void)
		| null = null;

	// ── フェーズ26: 装備（武器種）・スキル選択。TODO(persist): エンジン内メモリのみ。 ──
	private weaponId: string = DEFAULT_WEAPON_ID;
	private skillId: string = DEFAULT_SKILL_ID;

	// ── フェーズ26: NPC会話（three版と同じ、投稿等は行わない一方向メッセージ）。 ──
	private npcs: { mesh: AbstractMesh; name: string; message: string }[] = [];

	// ── ゲーム内掲示板（フェーズ15: three版からの移植）。 ──
	private boards: { mesh: AbstractMesh; threadPostId: string }[] = [];

	// ── 簡易地形障害物（フェーズ16: three版と同じ軸分離AABB当たり判定をbabylon版にも移植）。 ──
	private obstacles: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
	private readonly PLAYER_RADIUS = 0.4;

	// ── フェーズ18: walkable指定の障害物は「足場」になる（three版と同じ仕様をbabylon版にも移植）。 ──
	private platforms: {
		minX: number;
		maxX: number;
		minZ: number;
		maxZ: number;
		height: number;
	}[] = [];

	// ── アニメ状態（フェーズ16: idle/walk/run。フェーズ21でMMDモデルのVMDクリップ自動切替に対応）。 ──
	private curAnim: "idle" | "walk" | "run" = "idle";
	/** MMD用: state別のVMDランタイムアニメーションハンドル。読み込めなかったstateは未登録のまま
	 *  （その場合は直前のアニメーションを維持する。1つも読み込めなければ静止ポーズのまま）。 */
	private mmdModel: MmdModel | null = null;
	private mmdAnimHandles: Partial<Record<"idle" | "walk" | "run", MmdRuntimeAnimationHandle>> =
		{};
	private mmdCurAnimKey: "idle" | "walk" | "run" | null = null;

	constructor(
		canvas: HTMLCanvasElement,
		pmxUrl?: string,
		vmdUrl?: string,
		dummyPositions?: { x: number; z: number }[],
		obstacleSpecs?: {
			x: number;
			z: number;
			w: number;
			d: number;
			h: number;
			color?: string;
			walkable?: boolean;
		}[],
		/** 歩行/走行時に切り替えるVMD（フェーズ21）。未指定のstateは直前のアニメを維持する
		 *  （1つも指定が無ければvmdUrlの静止ポーズ/ループのまま）。 */
		vmdWalkUrl?: string,
		vmdRunUrl?: string,
		/** NPC（フェーズ26、three版と同じ一方向メッセージのみの簡易会話）。 */
		npcSpecs?: { x: number; z: number; name: string; message: string }[],
	) {
		this.engine = new Engine(canvas, true, { stencil: true });
		this.scene = new Scene(this.engine);

		this.playerRoot = new TransformNode("playerRoot", this.scene);

		const camera = new ArcRotateCamera(
			"cam",
			-Math.PI / 2,
			Math.PI / 3,
			8,
			new Vector3(0, 1, 0),
			this.scene,
		);
		camera.attachControl(canvas, true);
		this.camera = camera;

		new HemisphericLight("hemi", new Vector3(0, 1, 0), this.scene);
		const sun = new DirectionalLight(
			"sun",
			new Vector3(-1, -2, -1),
			this.scene,
		);
		sun.intensity = 0.8;

		const ground = MeshBuilder.CreateGround(
			"ground",
			{ width: 40, height: 40 },
			this.scene,
		);
		const groundMat = new StandardMaterial("groundMat", this.scene);
		groundMat.diffuseColor = new Color3(0.3, 0.68, 0.31);
		ground.material = groundMat;

		const player = MeshBuilder.CreateCapsule(
			"player",
			{ height: 1.8, radius: 0.4 },
			this.scene,
		);
		player.position.y = 0.9;
		player.parent = this.playerRoot;
		const playerMat = new StandardMaterial("playerMat", this.scene);
		playerMat.diffuseColor = new Color3(1, 0.7, 0);
		player.material = playerMat;
		this.placeholderPlayer = player;

		this.ghostMat = new StandardMaterial("ghostMat", this.scene);
		this.ghostMat.diffuseColor = new Color3(0.27, 0.53, 1);
		this.ghostMat.alpha = 0.85;

		// 武器: ボーンアタッチではなくplayerRootの子として追従させる簡易実装（three版と同じ方針）。
		const weapon = MeshBuilder.CreateBox(
			"weapon",
			{ width: 0.08, height: 0.08, depth: 1.1 },
			this.scene,
		);
		weapon.position.set(0.5, 1.0, 0.3);
		weapon.rotation.x = -Math.PI / 2.5;
		weapon.parent = this.playerRoot;
		const weaponMat = new StandardMaterial("weaponMat", this.scene);
		weaponMat.diffuseColor = new Color3(0.8, 0.8, 0.8);
		weapon.material = weaponMat;
		this.weapon = weapon;
		this.weaponMat = weaponMat;

		// 簡易ダミー敵。指定が無ければthree版と同じ既定2体を配置。
		const dummySpots = dummyPositions?.length
			? dummyPositions.map(({ x, z }) => [x, z] as const)
			: ([
					[3, -3],
					[-3, -4],
				] as const);
		for (const [x, z] of dummySpots) {
			const mesh = MeshBuilder.CreateCapsule(
				`dummy-${this.dummies.length}`,
				{ height: 1.1, radius: 0.45 },
				this.scene,
			);
			mesh.position.set(x, 0.95, z);
			const mat = new StandardMaterial(`dummyMat-${this.dummies.length}`, this.scene);
			mat.diffuseColor = new Color3(0.9, 0.22, 0.21);
			mesh.material = mat;
			this.dummies.push({ mesh, mat, hp: DUMMY_MAX_HP, respawnAt: null, baseX: x, baseZ: z });
		}

		// NPC（フェーズ26、three版と同じ一方向メッセージのみの簡易会話）。攻撃対象にはしない。
		if (npcSpecs?.length) {
			const npcMat = new StandardMaterial("npcMat", this.scene);
			npcMat.diffuseColor = new Color3(0.15, 0.65, 0.6);
			for (const spec of npcSpecs) {
				const mesh = MeshBuilder.CreateCapsule(
					`npc-${this.npcs.length}`,
					{ height: 1.1, radius: 0.42 },
					this.scene,
				);
				mesh.position.set(spec.x, 0.95, spec.z);
				mesh.material = npcMat;
				this.npcs.push({ mesh, name: spec.name, message: spec.message });
			}
		}

		// 簡易地形障害物。walkable指定は「壁」ではなく「足場」になる（three版と同じ方式）。
		for (const spec of obstacleSpecs ?? []) {
			const box = MeshBuilder.CreateBox(
				`obstacle-${this.scene.meshes.length}`,
				{ width: spec.w, height: spec.h, depth: spec.d },
				this.scene,
			);
			box.position.set(spec.x, spec.h / 2, spec.z);
			const mat = new StandardMaterial(`obstacleMat-${this.scene.meshes.length}`, this.scene);
			mat.diffuseColor = spec.color
				? Color3.FromHexString(spec.color)
				: spec.walkable
					? new Color3(0.62, 0.62, 0.36)
					: new Color3(0.47, 0.33, 0.28);
			box.material = mat;
			const bounds = {
				minX: spec.x - spec.w / 2,
				maxX: spec.x + spec.w / 2,
				minZ: spec.z - spec.d / 2,
				maxZ: spec.z + spec.d / 2,
			};
			if (spec.walkable) {
				this.platforms.push({ ...bounds, height: spec.h });
			} else {
				this.obstacles.push(bounds);
			}
		}

		if (pmxUrl) {
			player.isVisible = false;
			this.loadMmdModelAndPlay(pmxUrl, {
				idle: vmdUrl,
				walk: vmdWalkUrl,
				run: vmdRunUrl,
			}).catch((err) => {
				console.warn("Failed to load initial MMD model, falling back to placeholder:", err);
				player.isVisible = true;
			});
		}

		// フェーズ27: three版と同じ理由（フリーズ不具合の対策）でtry/catchを追加。
		// onBeforeRenderObservableのハンドラ内で例外が起きるとBabylonの内部レンダーループ自体に
		// 影響しうるため、フレーム単位の例外がループを止めないようにする。
		this.scene.onBeforeRenderObservable.add(() => {
			try {
				const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.1);
				this.updateMovement(dt);
				this.updateCombat(dt);
			} catch (err) {
				console.error(
					"mmo3d(babylon): 描画ループ中に例外が発生しました（次フレームも継続します）:",
					err,
				);
			}
		});

		this.engine.runRenderLoop(() => {
			if (this.disposed) return;
			try {
				this.scene.render();
			} catch (err) {
				console.error(
					"mmo3d(babylon): scene.render()中に例外が発生しました（次フレームも継続します）:",
					err,
				);
			}
		});

		// デバッグ用インスペクタは開発環境でのみ動的import（本番バンドルに含めない）。
		if (process.env.NODE_ENV !== "production") {
			import("babylonjs-inspector").catch(() => {});
		}
	}

	/** キーボード/仮想パッドから移動入力を渡す（three版 Mmo3dEngine.setInput と同じ形）。 */
	setInput(next: Partial<Mmo3dInputState>) {
		Object.assign(this.input, next);
	}

	/** タンク操作（three版 lib/mmo3d.ts と共通のロジック、フェーズ22でストレイフ廃止）。
	 *  前後移動はfacingを変更せず、旋回は専用入力(turnL/turnR、A/Dと矢印キー左右の両方)
	 *  でしか起きない。以前はArcRotateCameraの向きを毎フレーム参照する「カメラ相対」実装
	 *  だったが、後退キーで向きが変わって見える・facingを自己参照して回転先を決めるため
	 *  無限回転するリスクがある、という構造的な問題があった（three版で実際にこのバグが
	 *  発生した。フェーズ19参照）。ArcRotateCameraのドラッグ操作自体は引き続きでき、
	 *  視点を自由に見回せる（移動には影響しない）。 */
	private updateMovement(dt: number) {
		const { forward, back, turnL, turnR, run } = this.input;

		const turn = (turnL ? 1 : 0) - (turnR ? 1 : 0);
		this.facing += turn * TURN_SPEED * dt;
		this.playerRoot.rotation.y = this.facing;

		const move = (forward ? 1 : 0) - (back ? 1 : 0);
		const moving = move !== 0;

		if (moving) {
			const fx = Math.sin(this.facing);
			const fz = Math.cos(this.facing);

			const runMult = run ? RUN_SPEED / WALK_SPEED : 1;
			const ms = move * WALK_SPEED * runMult * dt;

			const [nx, nz] = this.resolveObstacleCollision(
				this.playerRoot.position.x,
				this.playerRoot.position.z,
				fx * ms,
				fz * ms,
			);
			this.playerRoot.position.x = nx;
			this.playerRoot.position.z = nz;
			this.curAnim = run ? "run" : "walk";
		} else {
			this.curAnim = "idle";
		}
		this.applyStandHeight();
		this.syncMmdAnimation();

		// カメラの狙点だけプレイヤーに追従させる（alpha/beta/radiusはユーザーのドラッグ操作のまま）。
		this.camera.target.x = this.playerRoot.position.x;
		this.camera.target.z = this.playerRoot.position.z;
	}

	/** walkable障害物（足場）に乗っていれば、その高さをplayerRootのYに反映する
	 *  （フェーズ18: three版と同じ仕様）。 */
	private applyStandHeight() {
		const { x, z } = this.playerRoot.position;
		let best = 0;
		for (const p of this.platforms) {
			if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue;
			if (p.height > best) best = p.height;
		}
		this.playerRoot.position.y = best;
	}

	/** 障害物との軸分離スライド判定（three版 resolveObstacleCollision と同じロジック）。 */
	private resolveObstacleCollision(
		x: number,
		z: number,
		dx: number,
		dz: number,
	): [number, number] {
		const r = this.PLAYER_RADIUS;
		let nx = x + dx;
		if (
			this.obstacles.some(
				(o) => nx > o.minX - r && nx < o.maxX + r && z > o.minZ - r && z < o.maxZ + r,
			)
		) {
			nx = x;
		}
		let nz = z + dz;
		if (
			this.obstacles.some(
				(o) => nx > o.minX - r && nx < o.maxX + r && nz > o.minZ - r && nz < o.maxZ + r,
			)
		) {
			nz = z;
		}
		return [nx, nz];
	}

	/** 掲示板の目印（看板）をワールドに設置する。1つ以上、任意位置に配置できる（three版と同じ形）。 */
	enableBoard(boards?: { x: number; z: number; threadPostId: string }[]) {
		if (this.boards.length) return;
		const spots = boards?.length ? boards : [{ x: 0, z: 4, threadPostId: "" }];
		const mat = new StandardMaterial("boardMat", this.scene);
		mat.diffuseColor = new Color3(0.55, 0.43, 0.39);
		for (const spot of spots) {
			const mesh = MeshBuilder.CreateBox(
				`board-${this.boards.length}`,
				{ width: 1, height: 1.4, depth: 0.1 },
				this.scene,
			);
			mesh.position.set(spot.x, BOARD_DEFAULT_Y, spot.z);
			mesh.material = mat;
			this.boards.push({ mesh, threadPostId: spot.threadPostId });
		}
	}

	/** プレイヤーが掲示板の対話範囲内にいれば、その掲示板のthreadPostIdを返す（three版と同じ）。 */
	nearBoard(): string | null {
		let best: { threadPostId: string; dist: number } | null = null;
		const p = this.playerRoot.position;
		for (const b of this.boards) {
			const dist = Vector3.Distance(p, b.mesh.position);
			if (dist > BOARD_INTERACT_RANGE) continue;
			if (!best || dist < best.dist) best = { threadPostId: b.threadPostId, dist };
		}
		return best ? best.threadPostId : null;
	}

	/** レベルNをN+1にするのに必要な経験値。 */
	private xpToNext(): number {
		return XP_TO_NEXT_BASE * this.level;
	}

	private getPlayerMaxHp(): number {
		return PLAYER_MAX_HP + (this.level - 1) * HP_GROWTH_PER_LEVEL;
	}

	private getAttackDamage(): number {
		return ATTACK_DAMAGE + (this.level - 1) * ATTACK_GROWTH_PER_LEVEL;
	}

	private addXp(amount: number) {
		this.xp += amount;
		let leveledUp = false;
		while (this.xp >= this.xpToNext()) {
			this.xp -= this.xpToNext();
			this.level++;
			leveledUp = true;
		}
		if (leveledUp) {
			this.playerHp = this.getPlayerMaxHp();
			this.onPlayerDamaged?.(this.playerHp, this.getPlayerMaxHp());
		}
		this.onLevelChanged?.(this.level, this.xp, this.xpToNext());
	}

	getPlayerLevel(): number {
		return this.level;
	}

	/** 出席ボーナス等、キル以外の経路でXPを付与する（フェーズ26）。TODO(persist): 未永続化。 */
	grantXp(amount: number) {
		this.addXp(amount);
	}

	/** 近くにいるNPCの{name, message}を返す（フェーズ26、three版と同じ）。 */
	nearNpc(): { name: string; message: string } | null {
		let best: { name: string; message: string; dist: number } | null = null;
		const p = this.playerRoot.position;
		for (const n of this.npcs) {
			const dist = Vector3.Distance(p, n.mesh.position);
			if (dist > NPC_INTERACT_RANGE) continue;
			if (!best || dist < best.dist) best = { name: n.name, message: n.message, dist };
		}
		return best ? { name: best.name, message: best.message } : null;
	}

	/** 装備中の武器/スキルID一覧と選択状態（フェーズ26）。 */
	getEquipment(): { weaponId: string; skillId: string } {
		return { weaponId: this.weaponId, skillId: this.skillId };
	}

	setWeapon(id: string) {
		if (!WEAPON_TYPES.some((w) => w.id === id)) return;
		this.weaponId = id;
	}

	setSkill(id: string) {
		if (!SKILL_TYPES.some((s) => s.id === id)) return;
		this.skillId = id;
	}

	/** ミニマップ描画用のエンティティ位置一覧（フェーズ26、three版と同じ形）。 */
	getMinimapData(): {
		player: { x: number; z: number; facing: number };
		dummies: { x: number; z: number; alive: boolean }[];
		boards: { x: number; z: number }[];
		npcs: { x: number; z: number }[];
	} {
		return {
			player: {
				x: this.playerRoot.position.x,
				z: this.playerRoot.position.z,
				facing: this.facing,
			},
			dummies: this.dummies.map((d) => ({
				x: d.mesh.position.x,
				z: d.mesh.position.z,
				alive: d.respawnAt === null,
			})),
			boards: this.boards.map((b) => ({ x: b.mesh.position.x, z: b.mesh.position.z })),
			npcs: this.npcs.map((n) => ({ x: n.mesh.position.x, z: n.mesh.position.z })),
		};
	}

	/** 攻撃キー/クリックのエッジで呼ぶ。クールダウン中は無視する。
	 *  フェーズ26: 装備中の武器種でダメージ/範囲/クールダウンが変わる（three版と同じ）。 */
	triggerAttack() {
		if (this.attackCooldown > 0 || this.playerHp <= 0) return;
		const weapon = WEAPON_TYPES.find((w) => w.id === this.weaponId) ?? WEAPON_TYPES[0];
		this.attackCooldown = ATTACK_COOLDOWN_SEC * weapon.cooldownMult;
		this.attackSwingT = 0;
		this.resolveAttackHits(
			ATTACK_RANGE * weapon.rangeMult,
			ATTACK_HALF_ANGLE,
			Math.round(this.getAttackDamage() * weapon.dmgMult),
		);
	}

	/** スキル攻撃。フェーズ26で選択制になった（three版と同じSKILL_TYPES）。 */
	triggerSkill() {
		if (this.skillCooldown > 0 || this.playerHp <= 0) return;
		const skill = SKILL_TYPES.find((s) => s.id === this.skillId) ?? SKILL_TYPES[0];
		this.skillCooldown = skill.cooldownSec;
		this.skillSwingT = 0;
		this.activeSkillSwingSec = skill.swingSec;
		this.resolveAttackHits(
			skill.range,
			skill.aoe ? Math.PI : PIERCE_HALF_ANGLE,
			Math.round(this.getAttackDamage() * skill.dmgMult),
		);
	}

	private resolveAttackHits(range: number, halfAngle: number, damage: number) {
		const px = this.playerRoot.position.x;
		const pz = this.playerRoot.position.z;
		for (const d of this.dummies) {
			if (d.respawnAt !== null) continue;
			const dx = d.mesh.position.x - px;
			const dz = d.mesh.position.z - pz;
			const dist = Math.hypot(dx, dz);
			if (dist > range) continue;
			if (halfAngle < Math.PI) {
				const angleToTarget = Math.atan2(dx, dz);
				let diff = angleToTarget - this.facing;
				diff = Math.atan2(Math.sin(diff), Math.cos(diff));
				if (Math.abs(diff) > halfAngle) continue;
			}
			this.damageDummy(d, damage);
		}
	}

	private damageDummy(d: BabylonDummy, amount: number) {
		d.hp = Math.max(0, d.hp - amount);
		const idx = this.dummies.indexOf(d);
		this.onDummyDamaged?.(idx, d.hp, DUMMY_MAX_HP);
		if (d.hp <= 0) {
			d.respawnAt = this.elapsedSec + DUMMY_RESPAWN_SEC;
			d.mesh.isVisible = false;
			this.addXp(XP_PER_DUMMY_KILL);
		} else {
			d.mat.emissiveColor = new Color3(1, 1, 1);
			setTimeout(() => {
				d.mat.emissiveColor = new Color3(0, 0, 0);
			}, 100);
		}
	}

	/** 自分がダメージを受けたときの経路（three版と同じ）。 */
	takeDamage(amount: number) {
		if (this.playerHp <= 0) return;
		this.playerHp = Math.max(0, this.playerHp - amount);
		this.onPlayerDamaged?.(this.playerHp, this.getPlayerMaxHp());
	}

	getPlayerHp(): { hp: number; max: number } {
		return { hp: this.playerHp, max: this.getPlayerMaxHp() };
	}

	/** HP/レベル変化の通知先を登録する（UI表示用、three版と同じ）。 */
	setCombatCallbacks(handlers: {
		onPlayerDamaged?: (hp: number, max: number) => void;
		onDummyDamaged?: (index: number, hp: number, max: number) => void;
		onLevelChanged?: (level: number, xp: number, xpToNext: number) => void;
	}) {
		this.onPlayerDamaged = handlers.onPlayerDamaged ?? null;
		this.onDummyDamaged = handlers.onDummyDamaged ?? null;
		this.onLevelChanged = handlers.onLevelChanged ?? null;
	}

	private updateCombat(dt: number) {
		this.elapsedSec += dt;
		if (this.attackCooldown > 0) this.attackCooldown -= dt;
		if (this.skillCooldown > 0) this.skillCooldown -= dt;

		if (this.weapon && this.skillSwingT >= 0) {
			this.skillSwingT += dt;
			const t = Math.min(1, this.skillSwingT / this.activeSkillSwingSec);
			const swing = Math.sin(t * Math.PI) * Math.PI;
			this.weapon.rotation.z = -swing;
			if (this.skillSwingT >= this.activeSkillSwingSec) {
				this.skillSwingT = -1;
				this.weapon.rotation.z = 0;
			}
		} else if (this.weapon && this.attackSwingT >= 0) {
			this.attackSwingT += dt;
			const t = Math.min(1, this.attackSwingT / ATTACK_SWING_SEC);
			const swing = Math.sin(t * Math.PI) * (Math.PI / 2);
			this.weapon.rotation.z = -swing;
			if (this.attackSwingT >= ATTACK_SWING_SEC) {
				this.attackSwingT = -1;
				this.weapon.rotation.z = 0;
			}
		}

		for (const d of this.dummies) {
			if (d.respawnAt !== null && this.elapsedSec >= d.respawnAt) {
				d.hp = DUMMY_MAX_HP;
				d.mesh.position.set(d.baseX, 0.95, d.baseZ);
				d.mesh.isVisible = true;
				d.respawnAt = null;
				const idx = this.dummies.indexOf(d);
				this.onDummyDamaged?.(idx, d.hp, DUMMY_MAX_HP);
			}
		}
	}

	/** リアルタイムハブへ送る自分の位置/向き/移動状態。three版 getLocalState と同じ形
	 *  （x/y=world x/z）。実モデルのクリップ切替は無いが、移動状態(idle/walk/run)自体は
	 *  入力から判定して返す（フェーズ16でthree版と揃えた）。 */
	getLocalState(): { x: number; y: number; rotY: number; anim: "idle" | "walk" | "run" } {
		return {
			x: this.playerRoot.position.x,
			y: this.playerRoot.position.z,
			rotY: this.facing,
			anim: this.curAnim,
		};
	}

	/** 他プレイヤーの最新一覧を反映する（three版 setRemotePlayers と同じ挙動、簡易カプセルのみ）。 */
	setRemotePlayers(players: RealtimePlayer[]) {
		const seen = new Set<string>();
		for (const p of players) {
			seen.add(p.sessionId);
			let mesh = this.ghosts.get(p.sessionId);
			if (!mesh) {
				mesh = MeshBuilder.CreateCapsule(
					`ghost-${p.sessionId}`,
					{ height: 1.8, radius: 0.4 },
					this.scene,
				);
				mesh.material = this.ghostMat;
				this.ghosts.set(p.sessionId, mesh);
			}
			mesh.position.set(p.x, 0.9, p.y);
			if (p.rotY !== undefined) mesh.rotation.y = p.rotY;
			// 実モデルもクリップも持たないため、移動状態はカプセルの高さで簡易的に見分ける
			// （idle=等倍、walk/run=わずかに縦伸縮させる）。three版のアニメ切替の代替表現。
			mesh.scaling.y = p.anim === "run" ? 1.08 : p.anim === "walk" ? 1.04 : 1;
		}
		for (const [sessionId, mesh] of this.ghosts) {
			if (seen.has(sessionId)) continue;
			mesh.dispose();
			this.ghosts.delete(sessionId);
		}
	}

	/** MMD(PMX)モデルをURLから読み込み、シーンへ追加する。ローダーは初回呼び出し時に1回だけ登録する。CORS失敗時は lib/cors-proxy.ts 経由で1回だけ再試行する。 */
	async loadMmdModel(url: string): Promise<AbstractMesh[]> {
		ensurePmxLoaderRegistered();
		try {
			const result = await ImportMeshAsync(url, this.scene);
			return result.meshes;
		} catch (err) {
			const proxied = wrapCorsProxyUrl(url);
			if (proxied === url) throw err;
			notifyCorsProxyUsed();
			const result = await ImportMeshAsync(proxied, this.scene);
			return result.meshes;
		}
	}

	/** MMD(PMX)モデルを読み込み、指定があればstate別（idle/walk/run）のVMDモーションを
	 *  読み込んで自動切替できるようにする（フェーズ21）。MmdRuntimeはこのメソッドを初めて
	 *  呼んだときに1回だけ生成・登録する。読み込みに失敗したstateは警告のみでスキップする
	 *  （1つでも読み込めれば動作は継続する）。 */
	async loadMmdModelAndPlay(
		pmxUrl: string,
		vmdUrls?: { idle?: string; walk?: string; run?: string },
	): Promise<MmdModel> {
		const meshes = await this.loadMmdModel(pmxUrl);
		const root = meshes[0] as unknown as MmdSkinnedMesh;
		// playerRootの子にして移動/向きに追従させる（外していると常にワールド原点に固定されたままになる）。
		root.parent = this.playerRoot;

		if (!this.mmdRuntime) {
			this.mmdRuntime = new MmdRuntime(this.scene);
			this.mmdRuntime.register(this.scene);
		}
		const mmdModel = this.mmdRuntime.createMmdModel(root);
		this.mmdModel = mmdModel;
		this.mmdAnimHandles = {};
		this.mmdCurAnimKey = null;

		const vmdLoader = new VmdLoader(this.scene);
		const loadVmd = (name: string, url: string) => vmdLoader.loadAsync(name, url);
		const entries: ["idle" | "walk" | "run", string | undefined][] = [
			["idle", vmdUrls?.idle],
			["walk", vmdUrls?.walk],
			["run", vmdUrls?.run],
		];
		for (const [key, url] of entries) {
			if (!url) continue;
			try {
				let animation: Awaited<ReturnType<typeof loadVmd>>;
				try {
					animation = await loadVmd(key, url);
				} catch (err) {
					const proxied = wrapCorsProxyUrl(url);
					if (proxied === url) throw err;
					notifyCorsProxyUsed();
					animation = await loadVmd(key, proxied);
				}
				this.mmdAnimHandles[key] = mmdModel.createRuntimeAnimation(animation);
			} catch (err) {
				console.warn(`mmo3d(babylon): VMDモーション"${key}"の読み込みに失敗:`, err);
			}
		}

		// 初期状態はidle（無ければ読み込めた中から適当な1つ）で開始する。
		const initialKey =
			this.mmdAnimHandles.idle !== undefined
				? "idle"
				: (Object.keys(this.mmdAnimHandles)[0] as "idle" | "walk" | "run" | undefined);
		if (initialKey !== undefined) {
			const handle = this.mmdAnimHandles[initialKey];
			if (handle !== undefined) {
				mmdModel.setRuntimeAnimation(handle);
				this.mmdCurAnimKey = initialKey;
				await this.mmdRuntime.playAnimation();
			}
		}

		return mmdModel;
	}

	/** curAnim（idle/walk/run）の変化に応じて、読み込み済みのVMDハンドルへ切り替える。
	 *  該当stateのVMDが無ければ何もしない（直前のアニメーションを維持する）。 */
	private syncMmdAnimation() {
		if (!this.mmdModel || this.mmdCurAnimKey === this.curAnim) return;
		const handle = this.mmdAnimHandles[this.curAnim];
		if (handle === undefined) return;
		this.mmdModel.setRuntimeAnimation(handle);
		this.mmdCurAnimKey = this.curAnim;
	}

	/** Havok物理はWASM初期化が非同期のため、必要になったフェーズで呼び出す。 */
	async enablePhysics() {
		const { default: HavokPhysics } = await import("@babylonjs/havok");
		const havok = await HavokPhysics();
		this.scene.enablePhysics(
			new Vector3(0, -9.81, 0),
			new HavokPlugin(true, havok),
		);
	}

	resize() {
		this.engine.resize();
	}

	dispose() {
		this.disposed = true;
		if (this.mmdRuntime) this.mmdRuntime.dispose(this.scene);
		this.engine.dispose();
	}
}
