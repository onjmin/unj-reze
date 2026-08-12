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

	constructor(canvas: HTMLCanvasElement, pmxUrl?: string, vmdUrl?: string) {
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

		if (pmxUrl) {
			player.isVisible = false;
			this.loadMmdModelAndPlay(pmxUrl, vmdUrl).catch((err) => {
				console.warn("Failed to load initial MMD model, falling back to placeholder:", err);
				player.isVisible = true;
			});
		}

		this.scene.onBeforeRenderObservable.add(() => {
			const dt = this.engine.getDeltaTime() / 1000;
			this.updateMovement(Math.min(dt, 0.1));
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
