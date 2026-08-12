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
import { notifyCorsProxyUsed, wrapCorsProxyUrl } from "@/lib/cors-proxy";
import type { Mmo3dInputState } from "@/lib/mmo3d";
import type { RealtimePlayer } from "@/lib/realtime/channels";

const WALK_SPEED = 2.2; // m/s（three版 lib/mmo3d.ts と揃える）
const RUN_SPEED = 5.5; // m/s
const TURN_LERP = 10; // 1秒あたりの回転追従係数

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

	// ── 移動入力（フェーズ14: babylon版にもthree版と同じWASD/矢印+Shiftを配線）。 ──
	private input: Mmo3dInputState = {
		forward: false,
		back: false,
		left: false,
		right: false,
		run: false,
	};

	// ── 他プレイヤー（ゴースト）。three版と同じく簡易カプセルのみ、実モデルは持たない。 ──
	private ghostMat: StandardMaterial;
	private ghosts = new Map<string, AbstractMesh>();

	// ── 簡易近接戦闘（フェーズ15: three版からの移植）。 ──
	private weapon: AbstractMesh | null = null;
	private attackCooldown = 0;
	private attackSwingT = -1; // -1=非攻撃中、0〜ATTACK_SWING_SECでスイング中
	private playerHp = PLAYER_MAX_HP;
	private dummies: BabylonDummy[] = [];
	private elapsedSec = 0;
	private onPlayerDamaged: ((hp: number, max: number) => void) | null = null;
	private onDummyDamaged: ((index: number, hp: number, max: number) => void) | null = null;

	// ── ゲーム内掲示板（フェーズ15: three版からの移植）。 ──
	private boards: { mesh: AbstractMesh; threadPostId: string }[] = [];

	constructor(
		canvas: HTMLCanvasElement,
		pmxUrl?: string,
		vmdUrl?: string,
		dummyPositions?: { x: number; z: number }[],
		obstacleSpecs?: { x: number; z: number; w: number; d: number; h: number; color?: string }[],
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

		// 簡易地形障害物（見た目のみ。当たり判定はthree版のみ対応 — 既知の制限）。
		for (const spec of obstacleSpecs ?? []) {
			const box = MeshBuilder.CreateBox(
				`obstacle-${this.scene.meshes.length}`,
				{ width: spec.w, height: spec.h, depth: spec.d },
				this.scene,
			);
			box.position.set(spec.x, spec.h / 2, spec.z);
			const mat = new StandardMaterial(`obstacleMat-${this.scene.meshes.length}`, this.scene);
			mat.diffuseColor = spec.color ? Color3.FromHexString(spec.color) : new Color3(0.47, 0.33, 0.28);
			box.material = mat;
		}

		if (pmxUrl) {
			player.isVisible = false;
			this.loadMmdModelAndPlay(pmxUrl, vmdUrl).catch((err) => {
				console.warn("Failed to load initial MMD model, falling back to placeholder:", err);
				player.isVisible = true;
			});
		}

		this.scene.onBeforeRenderObservable.add(() => {
			const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.1);
			this.updateMovement(dt);
			this.updateCombat(dt);
		});

		this.engine.runRenderLoop(() => {
			if (this.disposed) return;
			this.scene.render();
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

	/** カメラ相対で移動する。ArcRotateCameraの現在の向き（ユーザーがドラッグで自由に回せる）
	 *  を基準に前後左右を解決するため、three版のような「移動方向にカメラが強制的に振られる」
	 *  違和感が出ない（このプリセットの主な不具合修正の方針を踏襲）。 */
	private updateMovement(dt: number) {
		const { forward, back, left, right, run } = this.input;
		let lz = 0; // 前(+1)/後(-1) ローカル
		let lx = 0; // 右(+1)/左(-1) ローカル
		if (forward) lz += 1;
		if (back) lz -= 1;
		if (left) lx -= 1;
		if (right) lx += 1;
		if (lx === 0 && lz === 0) return;
		const len = Math.hypot(lx, lz);
		lx /= len;
		lz /= len;

		const camForward = this.camera.target.subtract(this.camera.position);
		camForward.y = 0;
		if (camForward.lengthSquared() < 1e-6) camForward.set(0, 0, 1);
		camForward.normalize();
		const camRight = Vector3.Cross(Vector3.Up(), camForward).normalize();

		const moveDir = camForward.scale(lz).add(camRight.scale(lx));
		if (moveDir.lengthSquared() < 1e-6) return;
		moveDir.normalize();

		const targetFacing = Math.atan2(moveDir.x, moveDir.z);
		let diff = targetFacing - this.facing;
		diff = Math.atan2(Math.sin(diff), Math.cos(diff));
		this.facing += diff * Math.min(1, TURN_LERP * dt);
		this.playerRoot.rotation.y = this.facing;

		const speed = run ? RUN_SPEED : WALK_SPEED;
		this.playerRoot.position.x += moveDir.x * speed * dt;
		this.playerRoot.position.z += moveDir.z * speed * dt;

		// カメラは向きを強制せず、狙点だけプレイヤーに追従させる（ユーザーのドラッグ操作を尊重）。
		this.camera.target.x = this.playerRoot.position.x;
		this.camera.target.z = this.playerRoot.position.z;
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

	/** 攻撃キー/クリックのエッジで呼ぶ。クールダウン中は無視する（three版と同じ数値仕様）。 */
	triggerAttack() {
		if (this.attackCooldown > 0 || this.playerHp <= 0) return;
		this.attackCooldown = ATTACK_COOLDOWN_SEC;
		this.attackSwingT = 0;
		this.resolveAttackHits();
	}

	private resolveAttackHits() {
		const px = this.playerRoot.position.x;
		const pz = this.playerRoot.position.z;
		for (const d of this.dummies) {
			if (d.respawnAt !== null) continue;
			const dx = d.mesh.position.x - px;
			const dz = d.mesh.position.z - pz;
			const dist = Math.hypot(dx, dz);
			if (dist > ATTACK_RANGE) continue;
			const angleToTarget = Math.atan2(dx, dz);
			let diff = angleToTarget - this.facing;
			diff = Math.atan2(Math.sin(diff), Math.cos(diff));
			if (Math.abs(diff) > ATTACK_HALF_ANGLE) continue;
			this.damageDummy(d, ATTACK_DAMAGE);
		}
	}

	private damageDummy(d: BabylonDummy, amount: number) {
		d.hp = Math.max(0, d.hp - amount);
		const idx = this.dummies.indexOf(d);
		this.onDummyDamaged?.(idx, d.hp, DUMMY_MAX_HP);
		if (d.hp <= 0) {
			d.respawnAt = this.elapsedSec + DUMMY_RESPAWN_SEC;
			d.mesh.isVisible = false;
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
		this.onPlayerDamaged?.(this.playerHp, PLAYER_MAX_HP);
	}

	getPlayerHp(): { hp: number; max: number } {
		return { hp: this.playerHp, max: PLAYER_MAX_HP };
	}

	/** HP変化の通知先を登録する（UI表示用、three版と同じ）。 */
	setCombatCallbacks(handlers: {
		onPlayerDamaged?: (hp: number, max: number) => void;
		onDummyDamaged?: (index: number, hp: number, max: number) => void;
	}) {
		this.onPlayerDamaged = handlers.onPlayerDamaged ?? null;
		this.onDummyDamaged = handlers.onDummyDamaged ?? null;
	}

	private updateCombat(dt: number) {
		this.elapsedSec += dt;
		if (this.attackCooldown > 0) this.attackCooldown -= dt;

		if (this.weapon && this.attackSwingT >= 0) {
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

	/** リアルタイムハブへ送る自分の位置/向き。three版 getLocalState と同じ形（x/y=world x/z）。
	 *  babylon版はアニメ状態を持たないため anim は常に "idle" を返す（既知の制限）。 */
	getLocalState(): { x: number; y: number; rotY: number; anim: "idle" } {
		return {
			x: this.playerRoot.position.x,
			y: this.playerRoot.position.z,
			rotY: this.facing,
			anim: "idle",
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

	/** MMD(PMX)モデルを読み込み、指定があればVMDモーションを再生する。
	 *  MmdRuntimeはこのメソッドを初めて呼んだときに1回だけ生成・登録する。*/
	async loadMmdModelAndPlay(
		pmxUrl: string,
		vmdUrl?: string,
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

		if (vmdUrl) {
			const vmdLoader = new VmdLoader(this.scene);
			const loadVmd = (url: string) => vmdLoader.loadAsync("motion", url);
			let animation: Awaited<ReturnType<typeof loadVmd>>;
			try {
				animation = await loadVmd(vmdUrl);
			} catch (err) {
				const proxied = wrapCorsProxyUrl(vmdUrl);
				if (proxied === vmdUrl) throw err;
				notifyCorsProxyUsed();
				animation = await loadVmd(proxied);
			}
			const handle = mmdModel.createRuntimeAnimation(animation);
			mmdModel.setRuntimeAnimation(handle);
			await this.mmdRuntime.playAnimation();
		}

		return mmdModel;
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
