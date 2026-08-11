// mmo3d エンジンの描画実体。yume25d（lib/yume25d.ts）と同じ構造：
// setup() でシーンを組み、使い終わったら必ず dispose() を呼ぶこと。
//
// フェーズ2時点では「地面 + プレースホルダーキャラクター（カプセル）」のみ。
// スケルタルアニメ（idle/walk/run/attack/hit/death）はフェーズ3で追加する。
// 参考: docs/mmo3d-feature-design.md

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { notifyCorsProxyUsed, wrapCorsProxyUrl } from "@/lib/cors-proxy";
import { MMO3D_BUILTIN_MODELS } from "@/lib/mmo3d-asset-catalog";

export class Mmo3dEngine {
	private renderer: THREE.WebGLRenderer;
	private scene: THREE.Scene;
	private camera: THREE.PerspectiveCamera;
	private player: THREE.Object3D;
	private mixer: THREE.AnimationMixer | null = null;
	private clock: THREE.Clock;
	private rafId: number | null = null;
	private disposed = false;

	private groundGeo: THREE.PlaneGeometry;
	private groundMat: THREE.MeshStandardMaterial;
	private playerGeo: THREE.CapsuleGeometry;
	private playerMat: THREE.MeshStandardMaterial;
	private placeholderMesh: THREE.Mesh;

	constructor(canvas: HTMLCanvasElement, width: number, height: number) {
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
		this.renderer.setSize(width, height, false);
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color(0x87ceeb);

		this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 200);
		// 三人称・見下ろし気味の固定オフセット（フェーズ3でキャラ追従に差し替え）。
		this.camera.position.set(0, 4, 7);
		this.camera.lookAt(0, 1, 0);

		const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
		this.scene.add(hemi);
		const sun = new THREE.DirectionalLight(0xffffff, 1.0);
		sun.position.set(5, 10, 5);
		this.scene.add(sun);

		this.groundGeo = new THREE.PlaneGeometry(40, 40);
		this.groundMat = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
		const ground = new THREE.Mesh(this.groundGeo, this.groundMat);
		ground.rotation.x = -Math.PI / 2;
		this.scene.add(ground);

		this.playerGeo = new THREE.CapsuleGeometry(0.4, 1.0, 4, 8);
		this.playerMat = new THREE.MeshStandardMaterial({ color: 0xffb300 });
		this.placeholderMesh = new THREE.Mesh(this.playerGeo, this.playerMat);
		this.placeholderMesh.position.set(0, 0.9, 0);
		this.player = this.placeholderMesh;
		this.scene.add(this.player);

		this.clock = new THREE.Clock();

		// カタログ先頭（アニメ付き）のGLTFをCORSプロキシ経由リトライ付きで読み込み、
		// 成功したらプレースホルダーのカプセルと差し替える。失敗時はカプセルのまま。
		const sample = MMO3D_BUILTIN_MODELS.find((m) => m.hasAnimations);
		if (sample) this.loadPlayerModel(sample.url);
	}

	private loadPlayerModel(url: string) {
		const loader = new GLTFLoader();
		loader
			.loadAsync(url)
			.catch((err) => {
				const proxied = wrapCorsProxyUrl(url);
				if (proxied !== url) {
					notifyCorsProxyUsed();
					return loader.loadAsync(proxied);
				}
				throw err;
			})
			.then((gltf) => {
				if (this.disposed) return;
				this.scene.remove(this.placeholderMesh);
				gltf.scene.position.set(0, 0, 0);
				this.scene.add(gltf.scene);
				this.player = gltf.scene;
				if (gltf.animations.length > 0) {
					this.mixer = new THREE.AnimationMixer(gltf.scene);
					this.mixer.clipAction(gltf.animations[0]).play();
				}
			})
			.catch((err) => {
				console.warn("mmo3d: サンプルモデルのロードに失敗、プレースホルダーを継続:", err);
			});
	}

	resize(width: number, height: number) {
		this.renderer.setSize(width, height, false);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
	}

	start() {
		const tick = () => {
			if (this.disposed) return;
			const dt = this.clock.getDelta();
			if (this.mixer) {
				this.mixer.update(dt);
			} else {
				// モデル未ロード時（プレースホルダーカプセル）だけの仮アイドルモーション。
				this.player.position.y = 0.9 + Math.sin(this.clock.elapsedTime * 2) * 0.05;
			}
			this.renderer.render(this.scene, this.camera);
			this.rafId = requestAnimationFrame(tick);
		};
		tick();
	}

	dispose() {
		this.disposed = true;
		if (this.rafId !== null) cancelAnimationFrame(this.rafId);
		this.groundGeo.dispose();
		this.groundMat.dispose();
		this.playerGeo.dispose();
		this.playerMat.dispose();
		this.renderer.dispose();
	}
}
