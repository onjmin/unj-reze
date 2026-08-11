// mmo3d エンジンの描画実体。yume25d（lib/yume25d.ts）と同じ構造：
// setup() でシーンを組み、使い終わったら必ず dispose() を呼ぶこと。
//
// フェーズ3: 三人称スケルタルアニメ基盤。WASD/矢印キーで移動、Shiftでダッシュ、
// idle/walk/run をクロスフェードで切り替える。カメラはプレイヤーの背後を追従する。
// attack/hit/death はフェーズ5（簡易戦闘）で追加する。
// 参考: docs/mmo3d-feature-design.md

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { notifyCorsProxyUsed, wrapCorsProxyUrl } from "@/lib/cors-proxy";
import { MMO3D_BUILTIN_MODELS } from "@/lib/mmo3d-asset-catalog";

/** 移動キー入力の論理状態（GameMaker.tsx の virtualKeys 相当と将来揃える）。 */
export interface Mmo3dInputState {
	forward: boolean;
	back: boolean;
	left: boolean;
	right: boolean;
	run: boolean;
}

type AnimState = "idle" | "walk" | "run";

const WALK_SPEED = 2.2; // m/s
const RUN_SPEED = 5.5; // m/s
const TURN_LERP = 10; // 1秒あたりの回転追従係数
const CROSSFADE_SEC = 0.25;

/** サンプルモデル(Fox.glb)の実クリップ名。将来ユーザー差し替えモデルでは
 *  クリップ名マッピングをゲームデータ側に持たせる（フェーズ6）。 */
const CLIP_NAMES: Record<AnimState, string> = {
	idle: "Survey",
	walk: "Walk",
	run: "Run",
};

export class Mmo3dEngine {
	private renderer: THREE.WebGLRenderer;
	private scene: THREE.Scene;
	private camera: THREE.PerspectiveCamera;
	private player: THREE.Object3D;
	private mixer: THREE.AnimationMixer | null = null;
	private actions: Partial<Record<AnimState, THREE.AnimationAction>> = {};
	private curAnim: AnimState | null = null;
	private clock: THREE.Clock;
	private rafId: number | null = null;
	private disposed = false;

	private groundGeo: THREE.PlaneGeometry;
	private groundMat: THREE.MeshStandardMaterial;
	private playerGeo: THREE.CapsuleGeometry;
	private playerMat: THREE.MeshStandardMaterial;
	private placeholderMesh: THREE.Mesh;

	/** 現在の入力状態。setInput() で外部（キーボード/仮想パッド）から更新する。 */
	private input: Mmo3dInputState = {
		forward: false,
		back: false,
		left: false,
		right: false,
		run: false,
	};
	private facing = 0; // ラジアン、+Zを0とする

	constructor(canvas: HTMLCanvasElement, width: number, height: number) {
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
		this.renderer.setSize(width, height, false);
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color(0x87ceeb);

		this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 200);
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

		const sample = MMO3D_BUILTIN_MODELS.find((m) => m.hasAnimations);
		if (sample) this.loadPlayerModel(sample.url);
	}

	/** キーボード/仮想パッドから移動入力を渡す。呼び出し側（Mmo3dMaker）が随時更新する。 */
	setInput(next: Partial<Mmo3dInputState>) {
		Object.assign(this.input, next);
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

				this.mixer = new THREE.AnimationMixer(gltf.scene);
				const states: AnimState[] = ["idle", "walk", "run"];
				const byName = new Map(gltf.animations.map((c) => [c.name, c]));
				const namedMatch = states.every((s) => byName.has(CLIP_NAMES[s]));
				if (namedMatch) {
					// 理想ケース: クリップ名がCLIP_NAMESと一致（サンプルGLTFの本来の形）。
					for (const s of states) {
						const action = this.mixer.clipAction(byName.get(CLIP_NAMES[s])!);
						this.actions[s] = action;
					}
				} else if (gltf.animations.length >= 3) {
					// 名前が一致しないが3つ以上ある場合は並び順(idle/walk/run想定)で割り当てる。
					states.forEach((s, i) => {
						this.actions[s] = this.mixer!.clipAction(gltf.animations[i]);
					});
				} else if (gltf.animations.length > 0) {
					// クリップが1〜2個しか無いCDN配信バリアント。state問わず同じクリップを
					// 使い回す（見た目のidle/walk/run切替は無いが、移動/カメラ/回転の
					// 状態機械自体は正しく動く。専用モデル差し替え時にnamedMatch経路へ移行）。
					const fallback = this.mixer.clipAction(gltf.animations[0]);
					for (const s of states) this.actions[s] = fallback;
				}
				this.setAnim("idle");
			})
			.catch((err) => {
				console.warn("mmo3d: サンプルモデルのロードに失敗、プレースホルダーを継続:", err);
			});
	}

	private setAnim(next: AnimState) {
		if (this.curAnim === next) return;
		const nextAction = this.actions[next];
		if (!nextAction) return;
		const prevAction = this.curAnim ? this.actions[this.curAnim] : undefined;
		nextAction.reset().play();
		if (prevAction) {
			prevAction.crossFadeTo(nextAction, CROSSFADE_SEC, false);
		} else {
			nextAction.fadeIn(CROSSFADE_SEC);
		}
		this.curAnim = next;
	}

	private updateMovement(dt: number) {
		const { forward, back, left, right, run } = this.input;
		let mx = 0;
		let mz = 0;
		if (forward) mz -= 1;
		if (back) mz += 1;
		if (left) mx -= 1;
		if (right) mx += 1;
		const moving = mx !== 0 || mz !== 0;

		if (moving) {
			const len = Math.hypot(mx, mz);
			mx /= len;
			mz /= len;
			const targetFacing = Math.atan2(mx, mz);
			// 最短角度差でラープ（±πをまたぐ跳躍を防ぐ）。
			let diff = targetFacing - this.facing;
			diff = Math.atan2(Math.sin(diff), Math.cos(diff));
			this.facing += diff * Math.min(1, TURN_LERP * dt);

			const speed = run ? RUN_SPEED : WALK_SPEED;
			this.player.position.x += mx * speed * dt;
			this.player.position.z += mz * speed * dt;
		}
		this.player.rotation.y = this.facing;

		if (this.mixer) {
			this.setAnim(moving ? (run ? "run" : "walk") : "idle");
		} else {
			// モデル未ロード時（プレースホルダーカプセル）だけの仮アイドルモーション。
			this.player.position.y = 0.9 + Math.sin(this.clock.elapsedTime * 2) * 0.05;
		}
	}

	private updateCamera() {
		// プレイヤーの背後・少し上から追従する三人称オフセット。
		const dist = 6;
		const height = 3;
		const camX = this.player.position.x - Math.sin(this.facing) * dist;
		const camZ = this.player.position.z - Math.cos(this.facing) * dist;
		this.camera.position.set(camX, this.player.position.y + height, camZ);
		this.camera.lookAt(
			this.player.position.x,
			this.player.position.y + 1,
			this.player.position.z,
		);
	}

	resize(width: number, height: number) {
		this.renderer.setSize(width, height, false);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
	}

	start() {
		const tick = () => {
			if (this.disposed) return;
			const dt = Math.min(this.clock.getDelta(), 0.1);
			this.updateMovement(dt);
			this.updateCamera();
			this.mixer?.update(dt);
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
