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
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { notifyCorsProxyUsed, wrapCorsProxyUrl } from "@/lib/cors-proxy";
import { MMO3D_BUILTIN_MODELS } from "@/lib/mmo3d-asset-catalog";
import type { RealtimePlayer } from "@/lib/realtime/channels";

/** トゥーン(セルシェーディング)用の3階調グラデーションマップ。参考にした外部プロダクト
 *  （docs/mmo3d-feature-design.md参照。コードは流用せずobserved機能のみ着想として使う）の
 *  「トゥーン+bloom」の見た目に寄せるため、MeshToonMaterial全体で共有する。
 *  NearestFilterでバンド境界をくっきりさせる（補間すると通常のグラデーション影になり
 *  トゥーンらしさが失われる）。 */
function createToonGradientMap(): THREE.DataTexture {
	const data = new Uint8Array([80, 150, 210, 255]);
	const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
	tex.needsUpdate = true;
	tex.minFilter = THREE.NearestFilter;
	tex.magFilter = THREE.NearestFilter;
	tex.generateMipmaps = false;
	return tex;
}

/** 空のグラデーション（水平線に近いほど白く抜ける）。大きな球のBackSideに貼るだけの
 *  軽量な手続き空。lib/yume25d.tsの「手続き的な空」と同じ方針（外部テクスチャ非依存）。 */
function createSkyMaterial(): THREE.ShaderMaterial {
	return new THREE.ShaderMaterial({
		uniforms: {
			topColor: { value: new THREE.Color(0x4fa8e0) },
			bottomColor: { value: new THREE.Color(0xdff3ff) },
		},
		vertexShader: `
			varying vec3 vWorldPos;
			void main() {
				vec4 worldPos = modelMatrix * vec4(position, 1.0);
				vWorldPos = worldPos.xyz;
				gl_Position = projectionMatrix * viewMatrix * worldPos;
			}
		`,
		fragmentShader: `
			uniform vec3 topColor;
			uniform vec3 bottomColor;
			varying vec3 vWorldPos;
			void main() {
				float h = clamp(normalize(vWorldPos).y * 0.5 + 0.5, 0.0, 1.0);
				gl_FragColor = vec4(mix(bottomColor, topColor, pow(h, 0.55)), 1.0);
			}
		`,
		side: THREE.BackSide,
		depthWrite: false,
		fog: false,
	});
}

/** 移動キー入力の論理状態。lib/yume25d.ts の操作感（前後移動と旋回を別キーに分離した
 *  「タンク操作」）をベースに、フェーズ22でストレイフを廃止しシンプル化した
 *  （W/S=前後移動、A/D=旋回。矢印キーも同じ役割の別バインドとして残す）。forwardは
 *  facingを一切変更せず、その向きに前進/後退するだけ。旋回はturnL/turnRの専用入力でしか
 *  起きない。これにより「後退キーで向きが変わる」ような直感に反する挙動を構造的に防ぐ
 *  （moveキーがfacingの計算に一切関与しないため、自己参照バグも原理的に起こりえない）。 */
export interface Mmo3dInputState {
	forward: boolean;
	back: boolean;
	turnL: boolean;
	turnR: boolean;
	run: boolean;
}

type AnimState = "idle" | "walk" | "run";

const WALK_SPEED = 2.2; // m/s
const RUN_SPEED = 5.5; // m/s
const TURN_SPEED = 2.4; // ラジアン/秒（lib/yume25d.ts のTURN_SPEEDと同値）
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
const NPC_INTERACT_RANGE = 2.5; // m

// ── フェーズ25: SD(デフォルメ)体型のプレースホルダー。参考にした外部プロダクト
// （docs/mmo3d-feature-design.md参照、observed機能のみ着想として使用）の「頭でっかち」な
// チビキャラの見た目に寄せた。実モデル（GLTF差し替え時）はこの寸法の影響を受けない。 ──
const CHIBI_BODY_RADIUS = 0.42;
const CHIBI_BODY_LENGTH = 0.2;
const CHIBI_BODY_CENTER_Y = CHIBI_BODY_RADIUS + CHIBI_BODY_LENGTH / 2; // 地面からの体センター高さ
const CHIBI_HEAD_RADIUS = 0.34;
const CHIBI_HEAD_LOCAL_Y = CHIBI_HEAD_RADIUS * 0.55; // 体センターからの相対高さ（少しめり込ませて継ぎ目を隠す）

const DUMMY_BODY_RADIUS = 0.46;
const DUMMY_BODY_LENGTH = 0.22;
const DUMMY_BODY_CENTER_Y = DUMMY_BODY_RADIUS + DUMMY_BODY_LENGTH / 2;
const DUMMY_HEAD_RADIUS = 0.37;
const DUMMY_HEAD_LOCAL_Y = DUMMY_HEAD_RADIUS * 0.55;

// ── フェーズ25: キャラ育成（レベル/ステータス成長）。完全にエンジン内メモリのみで完結する。
// TODO(persist): 現状レベル/経験値はリロードで消える。永続化するなら`games.manifest`か
// 専用テーブルの設計が必要（AGENTS.mdのNeon egress予算・POST_COLUMNS方針を踏まえること）。 ──
const XP_PER_DUMMY_KILL = 25;
const XP_TO_NEXT_BASE = 50; // レベルNをN+1にするのに必要な経験値 = XP_TO_NEXT_BASE * N
const HP_GROWTH_PER_LEVEL = 15;
const ATTACK_GROWTH_PER_LEVEL = 4;

// ── フェーズ26: 装備（武器種）と複数スキルの選択制。TODO(persist): 選択状態はエンジン内
// メモリのみ（リロードで既定に戻る）。ダメージ/範囲/クールダウンは基礎値（ATTACK_*系）への
// 倍率として持たせ、レベル成長（getAttackDamage）とは独立して掛け合わせる。 ──
export interface WeaponDef {
	id: string;
	label: string;
	dmgMult: number;
	rangeMult: number;
	cooldownMult: number;
	color: number;
}
export const WEAPON_TYPES: readonly WeaponDef[] = [
	{ id: "sword", label: "剣", dmgMult: 1.0, rangeMult: 1.0, cooldownMult: 1.0, color: 0xeeeeee },
	{ id: "spear", label: "槍", dmgMult: 0.8, rangeMult: 1.4, cooldownMult: 1.05, color: 0xb0c4de },
	{ id: "axe", label: "斧", dmgMult: 1.45, rangeMult: 0.8, cooldownMult: 1.35, color: 0xcd853f },
];
const DEFAULT_WEAPON_ID = WEAPON_TYPES[0].id;

export interface SkillDef {
	id: string;
	label: string;
	dmgMult: number; // getAttackDamage()に対する倍率
	range: number; // m
	cooldownSec: number;
	aoe: boolean; // true=全方位、false=正面の狭い扇状（貫き系）
	swingSec: number;
}
export const SKILL_TYPES: readonly SkillDef[] = [
	{
		id: "burst",
		label: "回転斬り",
		dmgMult: 2.4,
		range: 3.4,
		cooldownSec: 3.0,
		aoe: true,
		swingSec: 0.4,
	},
	{
		id: "pierce",
		label: "貫き突き",
		dmgMult: 3.6,
		range: 4.2,
		cooldownSec: 4.5,
		aoe: false,
		swingSec: 0.3,
	},
];
const DEFAULT_SKILL_ID = SKILL_TYPES[0].id;
const PIERCE_HALF_ANGLE = Math.PI / 10; // 「貫き突き」の扇状判定（狭い正面のみ）

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

	// ── フェーズ23: トゥーン＋bloomの見た目（docs/mmo3d-feature-design.md参照）。 ──
	private composer: EffectComposer;
	private bloomPass: UnrealBloomPass;
	private toonGradientMap: THREE.DataTexture;
	private skyGeo: THREE.SphereGeometry;
	private skyMat: THREE.ShaderMaterial;

	private groundGeo: THREE.PlaneGeometry;
	private groundMat: THREE.MeshToonMaterial;
	private playerGeo: THREE.CapsuleGeometry;
	private playerMat: THREE.MeshToonMaterial;
	private placeholderMesh: THREE.Mesh;
	/** SD体型の頭（プレイヤー/ゴースト共有、フェーズ25）。 */
	private headGeo: THREE.SphereGeometry;
	private dummyHeadGeo: THREE.SphereGeometry;

	// ── 他プレイヤー（ゴースト）。実モデルは持たず、簡易カプセルで表示する。 ──
	private ghostGeo: THREE.CapsuleGeometry;
	private ghostMat: THREE.MeshToonMaterial;
	private ghosts = new Map<string, THREE.Mesh>();

	// ── 簡易近接戦闘（フェーズ5→フェーズ25でスキル攻撃を追加） ──
	private weaponGeo: THREE.BoxGeometry;
	private weaponMat: THREE.MeshStandardMaterial;
	private weapon: THREE.Mesh;
	private attackCooldown = 0;
	private attackSwingT = -1; // -1=非攻撃中、0〜ATTACK_SWING_SECでスイング中
	private skillCooldown = 0;
	private skillSwingT = -1;
	private activeSkillSwingSec = 0.4; // triggerSkill()で選択中のスキルのswingSecに更新される
	private playerHp = PLAYER_MAX_HP;
	private dummyGeo: THREE.CapsuleGeometry;
	private dummyMat: THREE.MeshToonMaterial;
	private dummies: Dummy[] = [];
	private onPlayerDamaged: ((hp: number, max: number) => void) | null = null;
	private onDummyDamaged: ((index: number, hp: number, max: number) => void) | null = null;

	// ── フェーズ25: キャラ育成。TODO(persist): エンジン破棄で消える（永続化は未着手）。 ──
	private level = 1;
	private xp = 0;
	private onLevelChanged:
		| ((level: number, xp: number, xpToNext: number) => void)
		| null = null;

	// ── フェーズ26: 装備（武器種）・スキル選択。TODO(persist): エンジン内メモリのみ。 ──
	private weaponId: string = DEFAULT_WEAPON_ID;
	private skillId: string = DEFAULT_SKILL_ID;

	// ── フェーズ26: NPC会話。本SNSへの投稿等は行わない、その場限りの案内メッセージのみ。 ──
	private npcGeo: THREE.CapsuleGeometry | null = null;
	private npcHeadGeo: THREE.SphereGeometry | null = null;
	private npcMat: THREE.MeshToonMaterial | null = null;
	private npcs: { mesh: THREE.Mesh; name: string; message: string }[] = [];

	// ── ゲーム内掲示板（フェーズ8→フェーズ14で複数設置対応）。本SNSの投稿を参照するだけで、
	// 外部サイトへは繋がない。 ──
	private boardGeo: THREE.BoxGeometry | null = null;
	private boardMat: THREE.MeshToonMaterial | null = null;
	private boards: { mesh: THREE.Mesh; threadPostId: string }[] = [];

	// ── 簡易地形（フェーズ15: 直方体障害物）。プレイヤー/ダミーとの軸分離当たり判定つき。 ──
	private obstacles: {
		minX: number;
		maxX: number;
		minZ: number;
		maxZ: number;
	}[] = [];
	private obstacleGeos: THREE.BoxGeometry[] = [];
	private obstacleMats: THREE.MeshToonMaterial[] = [];
	private readonly PLAYER_RADIUS = 0.4;

	// ── フェーズ18: walkable指定の障害物は「壁」ではなく「足場（プラットフォーム）」になる。
	// 水平方向はブロックせず、その上に乗っている間だけプレイヤーのY座標をその高さに引き上げる
	// （高低差のある簡易地形。傾斜/凹凸までは対応しない — 既知の制限）。 ──
	private platforms: {
		minX: number;
		maxX: number;
		minZ: number;
		maxZ: number;
		height: number;
	}[] = [];

	/** 現在の入力状態。setInput() で外部（キーボード/仮想パッド）から更新する。 */
	private input: Mmo3dInputState = {
		forward: false,
		back: false,
		turnL: false,
		turnR: false,
		run: false,
	};
	private facing = 0; // ラジアン、+Zを0とする

	constructor(
		canvas: HTMLCanvasElement,
		width: number,
		height: number,
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
		/** NPC（フェーズ26）。近づいてEキーで一方向のメッセージだけ表示する簡易会話。
		 *  本SNSへの投稿等は一切行わない。 */
		npcSpecs?: { x: number; z: number; name: string; message: string }[],
	) {
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
		this.renderer.setSize(width, height, false);
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		// トゥーン＋bloomの見た目に寄せるため、影も有効化する（PCFSoftShadowMapは
		// トゥーンの硬いエッジと相性が良い）。
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		this.scene = new THREE.Scene();
		this.scene.fog = new THREE.Fog(0xdff3ff, 30, 90);

		// FOVを狭めて疑似アイソメトリック（望遠寄りにするとパースの歪みが減り、見下ろし
		// アングルの固定カメラと組み合わせた時に「見下ろしMMO」らしい平坦な見え方になる）。
		this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 200);
		this.camera.position.set(0, 4, 7);
		this.camera.lookAt(0, 1, 0);

		// 手続き的な空（大きな球のBackSideにグラデーションシェーダーを貼るだけ、外部テクスチャ非依存）。
		this.skyGeo = new THREE.SphereGeometry(150, 24, 16);
		this.skyMat = createSkyMaterial();
		const sky = new THREE.Mesh(this.skyGeo, this.skyMat);
		this.scene.add(sky);

		this.toonGradientMap = createToonGradientMap();

		const hemi = new THREE.HemisphereLight(0xffffff, 0x6b8f5a, 1.1);
		this.scene.add(hemi);
		const sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
		sun.position.set(6, 12, 6);
		sun.castShadow = true;
		sun.shadow.mapSize.set(1024, 1024);
		sun.shadow.camera.left = -20;
		sun.shadow.camera.right = 20;
		sun.shadow.camera.top = 20;
		sun.shadow.camera.bottom = -20;
		sun.shadow.bias = -0.0015;
		this.scene.add(sun);

		this.groundGeo = new THREE.PlaneGeometry(40, 40);
		this.groundMat = new THREE.MeshToonMaterial({
			color: 0x4caf50,
			gradientMap: this.toonGradientMap,
		});
		const ground = new THREE.Mesh(this.groundGeo, this.groundMat);
		ground.rotation.x = -Math.PI / 2;
		ground.receiveShadow = true;
		this.scene.add(ground);

		// SD体型: 短く丸い胴体カプセル＋大きめの頭球。頭を子メッシュとして胴体に載せる
		// （ルートオブジェクト自体は引き続き胴体カプセル1つなので、移動/カメラ/当たり判定の
		// 既存コードは変更不要）。
		this.playerGeo = new THREE.CapsuleGeometry(
			CHIBI_BODY_RADIUS,
			CHIBI_BODY_LENGTH,
			4,
			8,
		);
		this.playerMat = new THREE.MeshToonMaterial({
			color: 0xffb300,
			gradientMap: this.toonGradientMap,
		});
		this.placeholderMesh = new THREE.Mesh(this.playerGeo, this.playerMat);
		this.placeholderMesh.position.set(0, CHIBI_BODY_CENTER_Y, 0);
		this.placeholderMesh.castShadow = true;
		this.player = this.placeholderMesh;
		this.scene.add(this.player);

		this.headGeo = new THREE.SphereGeometry(CHIBI_HEAD_RADIUS, 16, 12);
		const playerHead = new THREE.Mesh(this.headGeo, this.playerMat);
		playerHead.position.set(0, CHIBI_HEAD_LOCAL_Y, 0);
		playerHead.castShadow = true;
		this.placeholderMesh.add(playerHead);

		this.ghostGeo = new THREE.CapsuleGeometry(
			CHIBI_BODY_RADIUS,
			CHIBI_BODY_LENGTH,
			4,
			8,
		);
		this.ghostMat = new THREE.MeshToonMaterial({
			color: 0x4488ff,
			gradientMap: this.toonGradientMap,
			transparent: true,
			opacity: 0.85,
		});

		// 武器: ボーンアタッチではなくプレイヤーの子として追従させる簡易実装（クラス冒頭コメント参照）。
		// 金属光沢を見せたいのでトゥーンにはせず標準マテリアルのまま（bloomでハイライトが映える）。
		this.weaponGeo = new THREE.BoxGeometry(0.06, 0.06, 0.8);
		this.weaponMat = new THREE.MeshStandardMaterial({
			color: 0xeeeeee,
			metalness: 0.8,
			roughness: 0.25,
		});
		this.weapon = new THREE.Mesh(this.weaponGeo, this.weaponMat);
		this.weapon.position.set(0.42, CHIBI_BODY_CENTER_Y + 0.05, 0.15);
		this.weapon.rotation.x = -Math.PI / 2.5;
		this.weapon.castShadow = true;
		this.player.add(this.weapon);

		// 簡易ダミー敵を2体、原点付近に配置。
		this.dummyGeo = new THREE.CapsuleGeometry(
			DUMMY_BODY_RADIUS,
			DUMMY_BODY_LENGTH,
			4,
			8,
		);
		this.dummyMat = new THREE.MeshToonMaterial({
			color: 0xe53935,
			gradientMap: this.toonGradientMap,
		});
		this.dummyHeadGeo = new THREE.SphereGeometry(DUMMY_HEAD_RADIUS, 16, 12);
		const dummySpots = dummyPositions?.length
			? dummyPositions.map(({ x, z }) => [x, z] as const)
			: ([
					[3, -3],
					[-3, -4],
				] as const);
		for (const [x, z] of dummySpots) {
			const mat = this.dummyMat.clone();
			const mesh = new THREE.Mesh(this.dummyGeo, mat);
			mesh.position.set(x, DUMMY_BODY_CENTER_Y, z);
			mesh.castShadow = true;
			const head = new THREE.Mesh(this.dummyHeadGeo, mat);
			head.position.set(0, DUMMY_HEAD_LOCAL_Y, 0);
			head.castShadow = true;
			mesh.add(head);
			this.scene.add(mesh);
			this.dummies.push({
				mesh,
				hp: DUMMY_MAX_HP,
				respawnAt: null,
				basePos: new THREE.Vector3(x, DUMMY_BODY_CENTER_Y, z),
			});
		}

		// 簡易地形障害物（直方体）。walkable指定は「壁」ではなく「足場」になる
		// （水平ブロックなし、上に乗るとY座標がその高さに上がる）。
		for (const spec of obstacleSpecs ?? []) {
			const geo = new THREE.BoxGeometry(spec.w, spec.h, spec.d);
			const mat = new THREE.MeshToonMaterial({
				color: spec.color ?? (spec.walkable ? 0x9e9e5c : 0x795548),
				gradientMap: this.toonGradientMap,
			});
			const mesh = new THREE.Mesh(geo, mat);
			mesh.position.set(spec.x, spec.h / 2, spec.z);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			this.scene.add(mesh);
			this.obstacleGeos.push(geo);
			this.obstacleMats.push(mat);
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

		// NPC（フェーズ26）。ダミー敵と同じチビ体型だが、別の色・別カテゴリのメッシュとして扱う
		// （攻撃対象にはしない、当たり判定もしない、ただの目印+会話トリガー）。
		if (npcSpecs?.length) {
			this.npcGeo = new THREE.CapsuleGeometry(CHIBI_BODY_RADIUS, CHIBI_BODY_LENGTH, 4, 8);
			this.npcHeadGeo = new THREE.SphereGeometry(CHIBI_HEAD_RADIUS, 16, 12);
			this.npcMat = new THREE.MeshToonMaterial({
				color: 0x26a69a,
				gradientMap: this.toonGradientMap,
			});
			for (const spec of npcSpecs) {
				const mesh = new THREE.Mesh(this.npcGeo, this.npcMat);
				mesh.position.set(spec.x, CHIBI_BODY_CENTER_Y, spec.z);
				mesh.castShadow = true;
				const head = new THREE.Mesh(this.npcHeadGeo, this.npcMat);
				head.position.set(0, CHIBI_HEAD_LOCAL_Y, 0);
				head.castShadow = true;
				mesh.add(head);
				this.scene.add(mesh);
				this.npcs.push({ mesh, name: spec.name, message: spec.message });
			}
		}

		this.clock = new THREE.Clock();

		// bloomはUnrealBloomPass（RenderPassの結果に高輝度部分だけを加算する後処理）。
		// 武器のメタリック反射や攻撃スイングのハイライトが映えるようにしている。
		this.composer = new EffectComposer(this.renderer);
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		this.bloomPass = new UnrealBloomPass(
			new THREE.Vector2(width, height),
			0.55, // strength
			0.4, // radius
			0.82, // threshold（この値未満の輝度は光らせない）
		);
		this.composer.addPass(this.bloomPass);
		this.composer.addPass(new OutputPass());

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
		this.boardMat = new THREE.MeshToonMaterial({
			color: 0x8d6e63,
			gradientMap: this.toonGradientMap,
		});
		const spots = boards?.length
			? boards
			: [{ x: BOARD_POS.x, z: BOARD_POS.z, threadPostId: "" }];
		for (const spot of spots) {
			const mesh = new THREE.Mesh(this.boardGeo, this.boardMat);
			mesh.position.set(spot.x, BOARD_POS.y, spot.z);
			mesh.castShadow = true;
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

	/** 近くにいるNPCの{name, message}を返す（フェーズ26）。範囲内に無ければnull。 */
	nearNpc(): { name: string; message: string } | null {
		let best: { name: string; message: string; dist: number } | null = null;
		for (const n of this.npcs) {
			const dist = this.player.position.distanceTo(n.mesh.position);
			if (dist > NPC_INTERACT_RANGE) continue;
			if (!best || dist < best.dist) best = { name: n.name, message: n.message, dist };
		}
		return best ? { name: best.name, message: best.message } : null;
	}

	/** 装備中の武器/スキルID一覧と選択状態（フェーズ26）。ホットバーUI用。 */
	getEquipment(): { weaponId: string; skillId: string } {
		return { weaponId: this.weaponId, skillId: this.skillId };
	}

	/** 武器種を切り替える（フェーズ26、TODO(persist): 未永続化）。武器メッシュの色も差し替える。 */
	setWeapon(id: string) {
		const def = WEAPON_TYPES.find((w) => w.id === id);
		if (!def) return;
		this.weaponId = id;
		this.weaponMat.color.setHex(def.color);
	}

	/** スキル種を切り替える（フェーズ26、TODO(persist): 未永続化）。 */
	setSkill(id: string) {
		if (!SKILL_TYPES.some((s) => s.id === id)) return;
		this.skillId = id;
	}

	/** ミニマップ描画用のエンティティ位置一覧（フェーズ26）。ワールド座標そのまま返し、
	 *  中心合わせ・スケーリングは呼び出し側（React）に任せる。 */
	getMinimapData(): {
		player: { x: number; z: number; facing: number };
		dummies: { x: number; z: number; alive: boolean }[];
		boards: { x: number; z: number }[];
		npcs: { x: number; z: number }[];
	} {
		return {
			player: { x: this.player.position.x, z: this.player.position.z, facing: this.facing },
			dummies: this.dummies.map((d) => ({
				x: d.mesh.position.x,
				z: d.mesh.position.z,
				alive: d.respawnAt === null,
			})),
			boards: this.boards.map((b) => ({ x: b.mesh.position.x, z: b.mesh.position.z })),
			npcs: this.npcs.map((n) => ({ x: n.mesh.position.x, z: n.mesh.position.z })),
		};
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
				const head = new THREE.Mesh(this.headGeo, this.ghostMat);
				head.position.set(0, CHIBI_HEAD_LOCAL_Y, 0);
				mesh.add(head);
				this.ghosts.set(p.sessionId, mesh);
				this.scene.add(mesh);
			}
			mesh.position.set(p.x, CHIBI_BODY_CENTER_Y, p.y);
			if (p.rotY !== undefined) mesh.rotation.y = p.rotY;
		}
		for (const [sessionId, mesh] of this.ghosts) {
			if (seen.has(sessionId)) continue;
			this.scene.remove(mesh);
			this.ghosts.delete(sessionId);
		}
	}

	/** レベルNをN+1にするのに必要な経験値。 */
	private xpToNext(): number {
		return XP_TO_NEXT_BASE * this.level;
	}

	/** レベルに応じた最大HP（フェーズ25: キャラ育成）。 */
	private getPlayerMaxHp(): number {
		return PLAYER_MAX_HP + (this.level - 1) * HP_GROWTH_PER_LEVEL;
	}

	/** レベルに応じた通常攻撃力。 */
	private getAttackDamage(): number {
		return ATTACK_DAMAGE + (this.level - 1) * ATTACK_GROWTH_PER_LEVEL;
	}

	/** 経験値を加算し、必要ならレベルアップする（複数レベル分の一気上げにも対応）。
	 *  レベルアップ時は最大HPが増え、HPを全回復する。 */
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

	/** 攻撃キー/クリックのエッジで呼ぶ。クールダウン中は無視する。
	 *  フェーズ26: 装備中の武器種（WEAPON_TYPES）でダメージ/範囲/クールダウンが変わる。 */
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

	/** スキル攻撃。フェーズ26で選択制になった（SKILL_TYPES）。「回転斬り」は全方位AOE、
	 *  「貫き突き」は正面の狭い扇状だが射程・威力に優れる。 */
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

	/** 現在のプレイヤー座標・向きから扇状範囲内のダミーへダメージを与える
	 *  （halfAngle=Math.PIなら実質360°、通常攻撃/スキル攻撃で共有する）。 */
	private resolveAttackHits(range: number, halfAngle: number, damage: number) {
		const px = this.player.position.x;
		const pz = this.player.position.z;
		for (const d of this.dummies) {
			if (d.respawnAt !== null) continue; // 撃破後リスポーン待ち
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

	private damageDummy(d: Dummy, amount: number) {
		d.hp = Math.max(0, d.hp - amount);
		const idx = this.dummies.indexOf(d);
		this.onDummyDamaged?.(idx, d.hp, DUMMY_MAX_HP);
		const mat = d.mesh.material as THREE.MeshToonMaterial;
		if (d.hp <= 0) {
			d.respawnAt = this.clock.elapsedTime + DUMMY_RESPAWN_SEC;
			d.mesh.visible = false;
			// フェーズ25: 撃破でXP獲得→キャラ育成。
			this.addXp(XP_PER_DUMMY_KILL);
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
		this.onPlayerDamaged?.(this.playerHp, this.getPlayerMaxHp());
	}

	getPlayerHp(): { hp: number; max: number } {
		return { hp: this.playerHp, max: this.getPlayerMaxHp() };
	}

	/** HP/レベル変化の通知先を登録する（UI表示用）。 */
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
		if (this.attackCooldown > 0) this.attackCooldown -= dt;
		if (this.skillCooldown > 0) this.skillCooldown -= dt;

		// 武器のスイング演出（アニメクリップが無いモデルでも見た目の反応を出す簡易tween）。
		// スキルの方が振りが大きく、優先して表示する（同時発火は無い想定）。
		if (this.skillSwingT >= 0) {
			this.skillSwingT += dt;
			const t = Math.min(1, this.skillSwingT / this.activeSkillSwingSec);
			const swing = Math.sin(t * Math.PI) * Math.PI;
			this.weapon.rotation.z = -swing;
			if (this.skillSwingT >= this.activeSkillSwingSec) {
				this.skillSwingT = -1;
				this.weapon.rotation.z = 0;
			}
		} else if (this.attackSwingT >= 0) {
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
				gltf.scene.traverse((obj) => {
					if (obj instanceof THREE.Mesh) obj.castShadow = true;
				});
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
		const { forward, back, turnL, turnR, run } = this.input;
		// lib/yume25d.ts をベースにした「タンク操作」: 前後移動はfacingを一切変更せず、
		// 旋回は専用入力(turnL/turnR、A/Dと矢印キー左右の両方をこれにバインドする)でしか
		// 起きない。以前は移動キーの入力からfacingの目標角度を毎フレーム逆算していたが、
		// 後退キー単体でも「後ろを向く」ような目標角度が出てしまい（直感に反する回転）、
		// さらにfacing自身を参照して目標を再計算する構造だったため自己参照ループによる
		// 無限回転バグ（Wキー押しっぱなしで回り続ける）も引き起こしていた。移動とfacingの
		// 計算を完全に分離することで、両方の問題を構造的に防ぐ。フェーズ22でストレイフは
		// 廃止し、A/Dキーは旋回専用にした（ユーザー指摘: A/D=旋回の方が直感的）。
		const turn = (turnL ? 1 : 0) - (turnR ? 1 : 0);
		this.facing += turn * TURN_SPEED * dt;

		const move = (forward ? 1 : 0) - (back ? 1 : 0);
		const moving = move !== 0;

		if (moving) {
			const fx = Math.sin(this.facing);
			const fz = Math.cos(this.facing);

			const runMult = run ? RUN_SPEED / WALK_SPEED : 1;
			const ms = move * WALK_SPEED * runMult * dt;

			const [nx, nz] = this.resolveObstacleCollision(
				this.player.position.x,
				this.player.position.z,
				fx * ms,
				fz * ms,
			);
			this.player.position.x = nx;
			this.player.position.z = nz;
		}
		this.player.rotation.y = this.facing;

		// walkable障害物（足場）の上に乗っていれば、その高さをY座標のベースにする
		// （フェーズ18: 高低差のある簡易地形）。
		const groundY = this.standHeightAt(this.player.position.x, this.player.position.z);

		if (this.mixer) {
			this.setAnim(moving ? (run ? "run" : "walk") : "idle");
			this.player.position.y = groundY;
		} else {
			// モデル未ロード時（プレースホルダーカプセル）だけの仮アイドルモーション。
			this.player.position.y =
				groundY + CHIBI_BODY_CENTER_Y + Math.sin(this.clock.elapsedTime * 2) * 0.04;
		}
	}

	/** その地点で足場（walkable障害物）に乗っているなら最も高いものの高さを、無ければ0（地面）
	 *  を返す。重なった足場があれば高い方を優先する。 */
	private standHeightAt(x: number, z: number): number {
		let best = 0;
		for (const p of this.platforms) {
			if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue;
			if (p.height > best) best = p.height;
		}
		return best;
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

	/** カメラの見下ろしオフセット（フェーズ24）。参考にした外部プロダクト
	 *  （docs/mmo3d-feature-design.md参照、observed機能のみを着想として使用）の見た目に
	 *  寄せ、プレイヤーの向き(facing)に追従して回転する三人称肩越しカメラから、
	 *  「常に一定角度で見下ろす、位置だけ追従する」固定角アイソメトリック風カメラに変更した。
	 *  キャラは画面上でほぼ中央に留まり続け、旋回してもカメラは振り回されない
	 *  （アイソメトリックMMOに典型的な視点）。 */
	// フェーズ27: ユーザー報告「カメラが遠い」を受けて距離を縮めた（旧: (0,16,13)、FOV35との
	// 組み合わせでキャラが小さく見えすぎていた）。
	private static readonly CAM_OFFSET = new THREE.Vector3(0, 8, 6.5);

	private updateCamera() {
		const camX = this.player.position.x + Mmo3dEngine.CAM_OFFSET.x;
		const camY = this.player.position.y + Mmo3dEngine.CAM_OFFSET.y;
		const camZ = this.player.position.z + Mmo3dEngine.CAM_OFFSET.z;
		this.camera.position.set(camX, camY, camZ);
		this.camera.lookAt(
			this.player.position.x,
			this.player.position.y + 0.6,
			this.player.position.z,
		);
	}

	resize(width: number, height: number) {
		this.renderer.setSize(width, height, false);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
		this.composer.setSize(width, height);
		this.bloomPass.setSize(width, height);
	}

	start() {
		// フェーズ27: 「フリーズする」不具合の恐らくの原因を修正。旧実装は
		// requestAnimationFrame(tick) をフレーム処理の最後に置いていたため、その手前の
		// どこか（例: 新規追加したcombat/movement/composerのいずれか）で例外が1回でも
		// 投げられると、次フレームのRAFが二度とスケジュールされずキャンバスがそのまま
		// 固まる（HUD等のReact側は動き続けるので「一部だけ固まる」ように見える）。
		// 次フレームのRAFを先に予約し、本処理はtry/catchで包むことで、フレーム内の例外が
		// 起きてもループ自体は止まらないようにした（エラーはコンソールに出して原因調査可能にする）。
		const tick = () => {
			if (this.disposed) return;
			this.rafId = requestAnimationFrame(tick);
			try {
				const dt = Math.min(this.clock.getDelta(), 0.1);
				this.updateMovement(dt);
				this.updateCombat(dt);
				this.updateCamera();
				this.mixer?.update(dt);
				this.composer.render();
			} catch (err) {
				console.error(
					"mmo3d: 描画ループ中に例外が発生しました（次フレームも継続します）:",
					err,
				);
			}
		};
		tick();
	}

	dispose() {
		this.disposed = true;
		if (this.rafId !== null) cancelAnimationFrame(this.rafId);
		this.composer.dispose();
		this.skyGeo.dispose();
		this.skyMat.dispose();
		this.toonGradientMap.dispose();
		this.groundGeo.dispose();
		this.groundMat.dispose();
		this.playerGeo.dispose();
		this.playerMat.dispose();
		this.headGeo.dispose();
		this.dummyHeadGeo.dispose();
		this.ghostGeo.dispose();
		this.ghostMat.dispose();
		this.weaponGeo.dispose();
		this.weaponMat.dispose();
		this.dummyGeo.dispose();
		this.dummyMat.dispose();
		for (const d of this.dummies) (d.mesh.material as THREE.Material).dispose();
		this.boardGeo?.dispose();
		this.boardMat?.dispose();
		this.npcGeo?.dispose();
		this.npcHeadGeo?.dispose();
		this.npcMat?.dispose();
		for (const geo of this.obstacleGeos) geo.dispose();
		for (const mat of this.obstacleMats) mat.dispose();
		this.renderer.dispose();
	}
}
