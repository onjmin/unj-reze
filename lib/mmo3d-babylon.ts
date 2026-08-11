// mmo3d の Babylon.js バックエンド（lib/mmo3d.ts の three.js版と対になる実装）。
// three-stdlib と babylon-mmd は同じ<canvas>のWebGLコンテキストを共有できないため、
// ゲームごとに `Mmo3dRenderer`（components/game-presets/shared.ts）でどちらか片方だけを選ぶ。
//
// フェーズ2: 地面 + プレースホルダーキャラクター。
// フェーズ7: babylon-mmd の PmxLoader を登録し、MMD(PMX)モデルをCORSプロキシ経由リトライ付きで
// 読み込めるようにした（loadMmdModel）。既定カタログにはライセンス未確認の版元不明モデルを
// 一切含めない（docs/mmo3d-feature-design.md参照）ため、呼び出し側がURLを渡す形のみ提供する。
// VMDモーション再生（MmdRuntime経由）は今後の課題。
// 参考: docs/mmo3d-feature-design.md

import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Vector3 } from "@babylonjs/core/Maths/math";
import "@babylonjs/core/Meshes/meshBuilder";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { RegisterPmxLoader } from "babylon-mmd/esm/Loader/pmxLoader";
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

	constructor(canvas: HTMLCanvasElement) {
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
		const sun = new DirectionalLight("sun", new Vector3(-1, -2, -1), this.scene);
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

		this.engine.runRenderLoop(() => {
			if (this.disposed) return;
			this.scene.render();
		});

		// デバッグ用インスペクタは開発環境でのみ動的import（本番バンドルに含めない）。
		if (process.env.NODE_ENV !== "production") {
			import("babylonjs-inspector").catch(() => {});
		}
	}

	/** MMD(PMX)モデルをURLから読み込み、シーンへ追加する。ローダーは初回呼び出し時に1回だけ登録する。
	 *  版元不明モデルの既定同梱はしない方針のため、URLは常に呼び出し側が渡す
	 *  （docs/mmo3d-feature-design.md参照）。CORS失敗時は lib/cors-proxy.ts 経由で1回だけ再試行する。 */
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

	/** Havok物理はWASM初期化が非同期のため、必要になったフェーズで呼び出す。 */
	async enablePhysics() {
		const { default: HavokPhysics } = await import("@babylonjs/havok");
		const havok = await HavokPhysics();
		this.scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));
	}

	resize() {
		this.engine.resize();
	}

	dispose() {
		this.disposed = true;
		this.engine.dispose();
	}
}
