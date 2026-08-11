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
	private disposed = false;
	private mmdRuntime: MmdRuntime | null = null;

	private placeholderPlayer: AbstractMesh | null = null;

	constructor(canvas: HTMLCanvasElement, pmxUrl?: string, vmdUrl?: string) {
		this.engine = new Engine(canvas, true, { stencil: true });
		this.scene = new Scene(this.engine);

		const camera = new ArcRotateCamera(
			"cam",
			-Math.PI / 2,
			Math.PI / 3,
			8,
			new Vector3(0, 1, 0),
			this.scene,
		);
		camera.attachControl(canvas, true);

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
		const playerMat = new StandardMaterial("playerMat", this.scene);
		playerMat.diffuseColor = new Color3(1, 0.7, 0);
		player.material = playerMat;
		this.placeholderPlayer = player;

		if (pmxUrl) {
			player.isVisible = false;
			this.loadMmdModelAndPlay(pmxUrl, vmdUrl).catch((err) => {
				console.warn("Failed to load initial MMD model, falling back to placeholder:", err);
				player.isVisible = true;
			});
		}

		this.engine.runRenderLoop(() => {
			if (this.disposed) return;
			this.scene.render();
		});

		// デバッグ用インスペクタは開発環境でのみ動的import（本番バンドルに含めない）。
		// ※文字列で import() すると、Cloudflare Workersのデプロイ時（esbuild）に
		// devDependenciesであっても静的解析されて巨大なファイルが混入してしまうためコメントアウト。
		// 必要な場合のみローカルでコメントを外して使用してください。
		// if (process.env.NODE_ENV !== "production") {
		// 	import("babylonjs-inspector").catch(() => {});
		// }
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
