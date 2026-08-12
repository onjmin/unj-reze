// mmo3d エンジンの描画実体。yume25d（lib/yume25d.ts）と同じ構造：
// setup() でシーンを組み、使い終わったら必ず dispose() を呼ぶこと。
//
// フェーズ3: 三人称スケルタルアニメ基盤。WASD/矢印キーで移動、Shiftでダッシュ、
// idle/walk/run をクロスフェードで切り替える。カメラはプレイヤーの背後を追従する。
// フェーズ5: 簡易近接戦闘。武器はボーンではなくプレイヤーOBject3Dの子として追従させる
// （サンプルモデルのボーン名が不明でも動く簡易実装。専用リグ済みモデルに差し替える際は
// ボーンソケットへの正式アタッチに切り替える）。攻撃はスイングのtweenと当たり判定のみで、
// 攻撃モーション自体はサンプルモデルにクリップが無いため見た目のクロスフェードはしない。
// 参考: docs/mmo3d-feature-design.md

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { notifyCorsProxyUsed, wrapCorsProxyUrl } from "@/lib/cors-proxy";
import { MMO3D_BUILTIN_MODELS } from "@/lib/mmo3d-asset-catalog";
import type { RealtimePlayer } from "@/lib/realtime/channels";

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

const ATTACK_COOLDOWN_SEC = 0.6;
const ATTACK_SWING_SEC = 0.25;
const ATTACK_RANGE = 2.2; // m
const ATTACK_HALF_ANGLE = Math.PI / 3; // ±60°の扇状判定
const ATTACK_DAMAGE = 20;
const PLAYER_MAX_HP = 100;
const DUMMY_MAX_HP = 60;
const DUMMY_RESPAWN_SEC = 3;
const BOARD_INTERACT_RANGE = 2.5; // m
const BOARD_POS = new THREE.Vector3(0, 1.2, 4);

interface Dummy {
	mesh: THREE.Mesh;
	hp: number;
	respawnAt: number | null;
	basePos: THREE.Vector3;
}

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

	// ── 他プレイヤー（ゴースト）。実モデルは持たず、簡易カプセルで表示する。 ──
	private ghostGeo: THREE.CapsuleGeometry;
	private ghostMat: THREE.MeshStandardMaterial;
	private ghosts = new Map<string, THREE.Mesh>();

	// ── 簡易近接戦闘（フェーズ5） ──
	private weaponGeo: THREE.BoxGeometry;
	private weaponMat: THREE.MeshStandardMaterial;
	private weapon: THREE.Mesh;
	private attackCooldown = 0;
	private attackSwingT = -1; // -1=非攻撃中、0〜ATTACK_SWING_SECでスイング中
	private playerHp = PLAYER_MAX_HP;
	private dummyGeo: THREE.CapsuleGeometry;
	private dummyMat: THREE.MeshStandardMaterial;
	private dummies: Dummy[] = [];
	private onPlayerDamaged: ((hp: number, max: number) => void) | null = null;
	private onDummyDamaged: ((index: number, hp: number, max: number) => void) | null = null;

	// ── ゲーム内掲示板（フェーズ8→フェーズ14で複数設置対応）。本SNSの投稿を参照するだけで、
	// 外部サイトへは繋がない。 ──
	private boardGeo: THREE.BoxGeometry | null = null;
	private boardMat: THREE.MeshStandardMaterial | null = null;
	private boards: { mesh: THREE.Mesh; threadPostId: string }[] = [];

	// ── 簡易地形（フェーズ15: 直方体障害物）。プレイヤー/ダミーとの軸分離当たり判定つき。 ──
	private obstacles: {
		minX: number;
		maxX: number;
		minZ: number;
		maxZ: number;
	}[] = [];
	private obstacleGeos: THREE.BoxGeometry[] = [];
	private obstacleMats: THREE.MeshStandardMaterial[] = [];
	private readonly PLAYER_RADIUS = 0.4;

	/** 現在の入力状態。setInput() で外部（キーボード/仮想パッド）から更新する。 */
	private input: Mmo3dInputState = {
		forward: false,
		back: false,
		left: false,
		right: false,
		run: false,
	};
	private facing = 0; // ラジアン、+Zを0とする

	constructor(
		canvas: HTMLCanvasElement,
		width: number,
		height: number,
		dummyPositions?: { x: number; z: number }[],
		obstacleSpecs?: { x: number; z: number; w: number; d: number; h: number; color?: string }[],
	) {
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

		this.ghostGeo = new THREE.CapsuleGeometry(0.4, 1.0, 4, 8);
		this.ghostMat = new THREE.MeshStandardMaterial({
			color: 0x4488ff,
			transparent: true,
			opacity: 0.85,
		});

		// 武器: ボーンアタッチではなくプレイヤーの子として追従させる簡易実装（クラス冒頭コメント参照）。
		this.weaponGeo = new THREE.BoxGeometry(0.08, 0.08, 1.1);
		this.weaponMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6 });
		this.weapon = new THREE.Mesh(this.weaponGeo, this.weaponMat);
		this.weapon.position.set(0.5, 1.0, 0.3);
		this.weapon.rotation.x = -Math.PI / 2.5;
		this.player.add(this.weapon);

		// 簡易ダミー敵を2体、原点付近に配置。
		this.dummyGeo = new THREE.CapsuleGeometry(0.45, 1.1, 4, 8);
		this.dummyMat = new THREE.MeshStandardMaterial({ color: 0xe53935 });
		const dummySpots = dummyPositions?.length
			? dummyPositions.map(({ x, z }) => [x, z] as const)
			: ([
					[3, -3],
					[-3, -4],
				] as const);
		for (const [x, z] of dummySpots) {
			const mesh = new THREE.Mesh(this.dummyGeo, this.dummyMat.clone());
			mesh.position.set(x, 0.95, z);
			this.scene.add(mesh);
			this.dummies.push({
				mesh,
				hp: DUMMY_MAX_HP,
				respawnAt: null,
				basePos: new THREE.Vector3(x, 0.95, z),
			});
		}

		// 簡易地形障害物（直方体）。当たり判定はAABB（軸分離スライド、updateMovement側で使用）。
		for (const spec of obstacleSpecs ?? []) {
			const geo = new THREE.BoxGeometry(spec.w, spec.h, spec.d);
			const mat = new THREE.MeshStandardMaterial({ color: spec.color ?? 0x795548 });
			const mesh = new THREE.Mesh(geo, mat);
			mesh.position.set(spec.x, spec.h / 2, spec.z);
			this.scene.add(mesh);
			this.obstacleGeos.push(geo);
			this.obstacleMats.push(mat);
			this.obstacles.push({
				minX: spec.x - spec.w / 2,
				maxX: spec.x + spec.w / 2,
				minZ: spec.z - spec.d / 2,
				maxZ: spec.z + spec.d / 2,
			});
		}

		this.clock = new THREE.Clock();

		const sample = MMO3D_BUILTIN_MODELS.find((m) => m.hasAnimations);
		if (sample) this.loadPlayerModel(sample.url);
	}

	/** キーボード/仮想パッドから移動入力を渡す。呼び出し側（Mmo3dMaker）が随時更新する。 */
	setInput(next: Partial<Mmo3dInputState>) {
		Object.assign(this.input, next);
	}

	/** 掲示板の目印（📋の看板）をワールドに設置する。1つ以上、任意位置に配置できる。
	 *  postIdはそれぞれ個別に持つ（本SNSのデータ取得自体はMmo3dMaker側の責務）。 */
	enableBoard(boards?: { x: number; z: number; threadPostId: string }[]) {
		if (this.boards.length) return;
		this.boardGeo = new THREE.BoxGeometry(1, 1.4, 0.1);
		this.boardMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63 });
		const spots = boards?.length
			? boards
			: [{ x: BOARD_POS.x, z: BOARD_POS.z, threadPostId: "" }];
		for (const spot of spots) {
			const mesh = new THREE.Mesh(this.boardGeo, this.boardMat);
			mesh.position.set(spot.x, BOARD_POS.y, spot.z);
			this.scene.add(mesh);
			this.boards.push({ mesh, threadPostId: spot.threadPostId });
		}
	}

	/** プレイヤーが掲示板の対話範囲内にいれば、その掲示板のthreadPostId（空文字なら
	 *  呼び出し側フォールバック分）を返す。範囲内に無ければnull。複数近接時は最短距離を優先。 */
	nearBoard(): string | null {
		let best: { threadPostId: string; dist: number } | null = null;
		for (const b of this.boards) {
			const dist = this.player.position.distanceTo(b.mesh.position);
			if (dist > BOARD_INTERACT_RANGE) continue;
			if (!best || dist < best.dist) best = { threadPostId: b.threadPostId, dist };
		}
		return best ? best.threadPostId : null;
	}

	/** @deprecated nearBoard() を使う。後方互換のため残す。 */
	isNearBoard(): boolean {
		return this.nearBoard() !== null;
	}

	/** リアルタイムハブへ送る自分の位置/向き/アニメ状態。呼び出し側が定期的に読んで publish する。
	 *  RealtimePlayer.x/y には world の x/z をそのまま使う（mmo3dルーム内で閉じた座標系）。 */
	getLocalState(): { x: number; y: number; rotY: number; anim: AnimState } {
		return {
			x: this.player.position.x,
			y: this.player.position.z,
			rotY: this.facing,
			anim: this.curAnim ?? "idle",
		};
	}

	/** 他プレイヤーの最新一覧を反映する。存在しなくなったsessionIdのゴーストは消す。
	 *  実モデルは持たないため、簡易カプセル＋向きのみで表現する（アニメ切替は今後）。 */
	setRemotePlayers(players: RealtimePlayer[]) {
		const seen = new Set<string>();
		for (const p of players) {
			seen.add(p.sessionId);
			let mesh = this.ghosts.get(p.sessionId);
			if (!mesh) {
				mesh = new THREE.Mesh(this.ghostGeo, this.ghostMat);
				this.ghosts.set(p.sessionId, mesh);
				this.scene.add(mesh);
			}
			mesh.position.set(p.x, 0.9, p.y);
			if (p.rotY !== undefined) mesh.rotation.y = p.rotY;
		}
		for (const [sessionId, mesh] of this.ghosts) {
			if (seen.has(sessionId)) continue;
			this.scene.remove(mesh);
			this.ghosts.delete(sessionId);
		}
	}

	/** 攻撃キー/クリックのエッジで呼ぶ。クールダウン中は無視する。 */
	triggerAttack() {
		if (this.attackCooldown > 0 || this.playerHp <= 0) return;
		this.attackCooldown = ATTACK_COOLDOWN_SEC;
		this.attackSwingT = 0;
		this.resolveAttackHits();
	}

	/** 現在のプレイヤー座標・向きから扇状範囲内のダミーへダメージを与える。 */
	private resolveAttackHits() {
		const px = this.player.position.x;
		const pz = this.player.position.z;
		for (const d of this.dummies) {
			if (d.respawnAt !== null) continue; // 撃破後リスポーン待ち
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

	private damageDummy(d: Dummy, amount: number) {
		d.hp = Math.max(0, d.hp - amount);
		const idx = this.dummies.indexOf(d);
		this.onDummyDamaged?.(idx, d.hp, DUMMY_MAX_HP);
		const mat = d.mesh.material as THREE.MeshStandardMaterial;
		if (d.hp <= 0) {
			d.respawnAt = this.clock.elapsedTime + DUMMY_RESPAWN_SEC;
			d.mesh.visible = false;
		} else {
			// 被弾フィードバック: 一瞬明るくして戻す。
			mat.emissive = new THREE.Color(0xffffff);
			mat.emissiveIntensity = 0.6;
			setTimeout(() => {
				mat.emissiveIntensity = 0;
			}, 100);
		}
	}

	/** 自分がダメージを受けたときの経路（将来: 敵AI・他プレイヤーからの攻撃を受ける経路で呼ぶ）。 */
	takeDamage(amount: number) {
		if (this.playerHp <= 0) return;
		this.playerHp = Math.max(0, this.playerHp - amount);
		this.onPlayerDamaged?.(this.playerHp, PLAYER_MAX_HP);
	}

	getPlayerHp(): { hp: number; max: number } {
		return { hp: this.playerHp, max: PLAYER_MAX_HP };
	}

	/** HP変化の通知先を登録する（UI表示用）。 */
	setCombatCallbacks(handlers: {
		onPlayerDamaged?: (hp: number, max: number) => void;
		onDummyDamaged?: (index: number, hp: number, max: number) => void;
	}) {
		this.onPlayerDamaged = handlers.onPlayerDamaged ?? null;
		this.onDummyDamaged = handlers.onDummyDamaged ?? null;
	}

	private updateCombat(dt: number) {
		if (this.attackCooldown > 0) this.attackCooldown -= dt;

		// 武器のスイング演出（アニメクリップが無いモデルでも見た目の反応を出す簡易tween）。
		if (this.attackSwingT >= 0) {
			this.attackSwingT += dt;
			const t = Math.min(1, this.attackSwingT / ATTACK_SWING_SEC);
			const swing = Math.sin(t * Math.PI) * (Math.PI / 2);
			this.weapon.rotation.z = -swing;
			if (this.attackSwingT >= ATTACK_SWING_SEC) {
				this.attackSwingT = -1;
				this.weapon.rotation.z = 0;
			}
		}

		// リスポーン処理
		const now = this.clock.elapsedTime;
		for (const d of this.dummies) {
			if (d.respawnAt !== null && now >= d.respawnAt) {
				d.hp = DUMMY_MAX_HP;
				d.mesh.position.copy(d.basePos);
				d.mesh.visible = true;
				d.respawnAt = null;
				const idx = this.dummies.indexOf(d);
				this.onDummyDamaged?.(idx, d.hp, DUMMY_MAX_HP);
			}
		}
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
				gltf.scene.add(this.weapon); // プレイヤー差し替えに追従して武器も付け替える
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
		// キー入力はプレイヤーの現在の向き（this.facing）を基準にしたローカル方向。
		// これをワールド座標へ回転してから移動・目標向きを決める（カメラ相対操作）。
		// ワールド直交で扱うと、直前の移動で向きが変わるたびに「前」の意味がブレて
		// 操作感が滅茶苦茶になる（例: 右に動いてカメラが追従した後だと、次の「前」が
		// 画面上は右や斜めに見える）。
		let localX = 0;
		let localZ = 0;
		if (forward) localZ -= 1;
		if (back) localZ += 1;
		if (left) localX -= 1;
		if (right) localX += 1;
		const moving = localX !== 0 || localZ !== 0;

		if (moving) {
			const len = Math.hypot(localX, localZ);
			localX /= len;
			localZ /= len;
			const theta = this.facing;
			const cos = Math.cos(theta);
			const sin = Math.sin(theta);
			// facing=0 のとき恒等変換になる回転（updateCamera の (sinθ, cosθ) 前方定義と整合）。
			const mx = localX * cos + localZ * sin;
			const mz = -localX * sin + localZ * cos;
			const targetFacing = Math.atan2(mx, mz);
			// 最短角度差でラープ（±πをまたぐ跳躍を防ぐ）。
			let diff = targetFacing - this.facing;
			diff = Math.atan2(Math.sin(diff), Math.cos(diff));
			this.facing += diff * Math.min(1, TURN_LERP * dt);

			const speed = run ? RUN_SPEED : WALK_SPEED;
			const [nx, nz] = this.resolveObstacleCollision(
				this.player.position.x,
				this.player.position.z,
				mx * speed * dt,
				mz * speed * dt,
			);
			this.player.position.x = nx;
			this.player.position.z = nz;
		}
		this.player.rotation.y = this.facing;

		if (this.mixer) {
			this.setAnim(moving ? (run ? "run" : "walk") : "idle");
		} else {
			// モデル未ロード時（プレースホルダーカプセル）だけの仮アイドルモーション。
			this.player.position.y = 0.9 + Math.sin(this.clock.elapsedTime * 2) * 0.05;
		}
	}

	/** 障害物との軸分離スライド判定。x/zを別々に試し、衝突する軸だけ移動をキャンセルする
	 *  （壁沿いに滑るような自然な挙動になる。斜め移動時に片方だけブロックされても止まらない）。 */
	private resolveObstacleCollision(
		x: number,
		z: number,
		dx: number,
		dz: number,
	): [number, number] {
		const r = this.PLAYER_RADIUS;
		let nx = x + dx;
		if (this.obstacles.some((o) => nx > o.minX - r && nx < o.maxX + r && z > o.minZ - r && z < o.maxZ + r)) {
			nx = x;
		}
		let nz = z + dz;
		if (this.obstacles.some((o) => nx > o.minX - r && nx < o.maxX + r && nz > o.minZ - r && nz < o.maxZ + r)) {
			nz = z;
		}
		return [nx, nz];
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
			this.updateCombat(dt);
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
		this.ghostGeo.dispose();
		this.ghostMat.dispose();
		this.weaponGeo.dispose();
		this.weaponMat.dispose();
		this.dummyGeo.dispose();
		this.dummyMat.dispose();
		for (const d of this.dummies) (d.mesh.material as THREE.Material).dispose();
		this.boardGeo?.dispose();
		this.boardMat?.dispose();
		for (const geo of this.obstacleGeos) geo.dispose();
		for (const mat of this.obstacleMats) mat.dispose();
		this.renderer.dispose();
	}
}
