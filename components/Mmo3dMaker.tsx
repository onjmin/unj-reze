"use client";

// 3D MMOエンジン（mmo3d）専用のプレイビュー雛形。
// フェーズ3: WASD/矢印キー移動 + Shiftダッシュ + idle/walk/run のスケルタルアニメ。
// フェーズ4: gameId/sessionId が渡されればリアルタイムハブ経由で位置/向き/アニメ状態を
// 同期する（DBには一切書かない、既存の chGame/LiveGameView と同じ経路の使い回し）。
// フェーズ5: Space/クリックで近接攻撃。HPをHUDに表示する。
// フェーズ8: boardPostId を渡すとワールドに掲示板を設置し、近づいてEキーで本SNSの
// 該当スレッド（GameThreadBoard）を開ける。外部サイトへは繋がず、既存の投稿/返信APIを使う。
// GameMaker.tsx への正式配線（virtualKeys等との統合）はデータ形状が固まるフェーズ6で行った。
// 参考: docs/mmo3d-feature-design.md
//
// レンダラーは three（yume25dと共有基盤・three-stdlibでFBX等を追加読込可）と
// babylon（babylon-mmdでMMD/PMXを読み込む）の2択。同じ<canvas>のWebGLコンテキストを
// 共有できないため、ゲームごとに片方だけを選ぶ（Mmo3dRenderer, shared.ts）。
// 比較は docs/mmo3d-feature-design.md の表を参照。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { realtimeConfigured, useRealtimeSubscription } from "@/lib/hooks/useRealtime";
import { Mmo3dEngine } from "@/lib/mmo3d";
import { Mmo3dBabylonEngine } from "@/lib/mmo3d-babylon";
import { chGame } from "@/lib/realtime/channels";
import { getRealtimeClient } from "@/lib/realtime/client";
import GameThreadBoard from "./GameThreadBoard";
import type { Mmo3dRenderer } from "./game-presets/shared";

const SYNC_INTERVAL_MS = 200; // 位置/アニメの送信間隔（既存2Dの2000msより短い。動きが速いため）
const BOARD_PROXIMITY_POLL_MS = 200;

export default function Mmo3dMaker({
	renderer = "three",
	gameId,
	sessionId,
	boardPostId,
	boards,
	dummies,
	obstacles,
	pmxUrl,
	vmdUrl,
	vmdWalkUrl,
	vmdRunUrl,
}: {
	renderer?: Mmo3dRenderer;
	/** 指定するとリアルタイムハブ経由で他プレイヤーと位置/アニメ状態を同期する（three/babylon共通対応）。 */
	gameId?: string;
	sessionId?: string;
	/** 掲示板1枚のフォールバック（boardsが空のとき既定位置に置く）。近づいてEキーで開ける（three/babylon共通対応）。 */
	boardPostId?: string;
	/** ワールド上の任意位置に複数の掲示板を配置する。空ならboardPostId 1枚にフォールバック。 */
	boards?: { x: number; z: number; threadPostId: string }[];
	/** ダミー敵の配置座標。空なら既定の2体を使う。 */
	dummies?: { x: number; z: number }[];
	/** 簡易地形の障害物。walkable=trueで「足場」（乗ると高さが上がる）になる。
	 *  three/babylon両対応で当たり判定あり。 */
	obstacles?: {
		x: number;
		z: number;
		w: number;
		d: number;
		h: number;
		color?: string;
		walkable?: boolean;
	}[];
	/** MMD(PMX/PMD)モデルURL（babylon版のみ） */
	pmxUrl?: string;
	/** MMD(VMD)モーションURL（babylon版のみ）。idle（静止/未移動時）用。 */
	vmdUrl?: string;
	/** 歩行時に切り替えるVMDモーション（babylon版のみ）。未指定ならvmdUrlのまま。 */
	vmdWalkUrl?: string;
	/** 走行時（Shift+移動）に切り替えるVMDモーション（babylon版のみ）。 */
	vmdRunUrl?: string;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	/** three/babylon 共通API（移動・戦闘・掲示板・位置同期）。フェーズ15でbabylon版もthree版と
	 *  同じメソッド一式を持つようになったため、レンダラーを問わず1本のrefで扱える。 */
	const engineRef = useRef<Mmo3dEngine | Mmo3dBabylonEngine | null>(null);
	const [hp, setHp] = useState({ hp: 100, max: 100 });
	const [dummyHp, setDummyHp] = useState<Record<number, { hp: number; max: number }>>({});
	const [nearBoardId, setNearBoardId] = useState<string | null>(null);
	const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
	const [boardOpen, setBoardOpen] = useState(false);

	// boards未指定ならboardPostId 1枚を既定位置に置くフォールバック（後方互換）。
	// JSON化した内容をキーにuseMemoすることで、親が毎レンダー新しい配列を渡してきても
	// 値が実質同じなら参照を安定させ、依存するuseEffectの無駄な再マウントを防ぐ。
	const boardsKey = JSON.stringify(boards ?? []);
	const dummiesKey = JSON.stringify(dummies ?? []);
	const obstaclesKey = JSON.stringify(obstacles ?? []);
	const effectiveBoards = useMemo(
		() =>
			boards && boards.length > 0
				? boards
				: boardPostId
					? [{ x: 0, z: 4, threadPostId: boardPostId }]
					: [],
		// boardsKeyで内容の変化を検知する（boards自体は参照が毎レンダー変わり得るため使わない）。
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[boardsKey, boardPostId],
	);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const isBabylon = renderer === "babylon";
		const engine = isBabylon
			? new Mmo3dBabylonEngine(
					canvas,
					pmxUrl,
					vmdUrl,
					dummies,
					obstacles,
					vmdWalkUrl,
					vmdRunUrl,
				)
			: new Mmo3dEngine(
					canvas,
					canvas.clientWidth || 640,
					canvas.clientHeight || 480,
					dummies,
					obstacles,
				);
		engineRef.current = engine;
		engine.setCombatCallbacks({
			onPlayerDamaged: (hpVal, max) => setHp({ hp: hpVal, max }),
			onDummyDamaged: (index, hpVal, max) =>
				setDummyHp((prev) => ({ ...prev, [index]: { hp: hpVal, max } })),
		});
		if (effectiveBoards.length) engine.enableBoard(effectiveBoards);
		if (engine instanceof Mmo3dEngine) engine.start();

		const ro = engine instanceof Mmo3dBabylonEngine
			? (() => {
					const babylonEngine = engine;
					const observer = new ResizeObserver(() => babylonEngine.resize());
					observer.observe(canvas);
					return observer;
				})()
			: (() => {
					const observer = new ResizeObserver(([entry]) => {
						const { width, height } = entry.contentRect;
						if (width > 0 && height > 0)
							(engine as Mmo3dEngine).resize(width, height);
					});
					observer.observe(canvas);
					return observer;
				})();

		// タンク操作（フェーズ22でストレイフ廃止）: W/S・矢印上下=前後移動、A/D・矢印左右=旋回。
		// Shift=ダッシュ、Space=攻撃、E=掲示板。three/babylon共通。
		const keyToInput: Record<string, "forward" | "back" | "turnL" | "turnR"> = {
			KeyW: "forward",
			ArrowUp: "forward",
			KeyS: "back",
			ArrowDown: "back",
			KeyA: "turnL",
			ArrowLeft: "turnL",
			KeyD: "turnR",
			ArrowRight: "turnR",
		};
		const onKeyDown = (e: KeyboardEvent) => {
			const field = keyToInput[e.code];
			if (field) engine.setInput({ [field]: true });
			if (e.code === "ShiftLeft" || e.code === "ShiftRight")
				engine.setInput({ run: true });
			if (e.code === "Space") {
				e.preventDefault();
				engine.triggerAttack();
			}
			if (e.code === "KeyE") {
				const target = engine.nearBoard();
				if (target !== null) {
					setActiveBoardId(target);
					setBoardOpen((prev) => !prev);
				}
			}
		};
		const onKeyUp = (e: KeyboardEvent) => {
			const field = keyToInput[e.code];
			if (field) engine.setInput({ [field]: false });
			if (e.code === "ShiftLeft" || e.code === "ShiftRight")
				engine.setInput({ run: false });
		};
		const onClick = () => engine.triggerAttack();
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		canvas.addEventListener("click", onClick);

		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
			canvas.removeEventListener("click", onClick);
			ro.disconnect();
			engine.dispose();
			engineRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- effectiveBoardsはboardsKey/boardPostId由来、dummiesKey/obstaclesKeyで内容が変わった時だけ再マウントする
	}, [
		renderer,
		pmxUrl,
		vmdUrl,
		vmdWalkUrl,
		vmdRunUrl,
		effectiveBoards,
		dummiesKey,
		obstaclesKey,
	]);

	// ── 掲示板への近接検知。開いている間はEでの再トグルより閉じるボタン優先。 ──
	useEffect(() => {
		if (effectiveBoards.length === 0) return;
		const id = setInterval(() => {
			setNearBoardId(engineRef.current?.nearBoard() ?? null);
		}, BOARD_PROXIMITY_POLL_MS);
		return () => clearInterval(id);
	}, [effectiveBoards]);

	// ── リアルタイム同期（three/babylon共通、gameId/sessionIdがある時だけ）。DBには書かない。 ──
	useEffect(() => {
		if (!realtimeConfigured || !gameId || !sessionId) return;
		const client = getRealtimeClient();
		if (!client) return;
		const send = () => {
			const engine = engineRef.current;
			if (!engine) return;
			const { x, y, rotY, anim } = engine.getLocalState();
			// babylon版はアニメ状態を持たないため常に"idle"を返す（既知の制限）。
			// ハブが受け付けない値("attack"/"hit"/"death")は送らない。
			const safeAnim = anim === "walk" || anim === "run" ? anim : "idle";
			client.sendPosition(gameId, sessionId, x, y, "🧑", { rotY, anim: safeAnim });
		};
		const id = setInterval(send, SYNC_INTERVAL_MS);
		return () => {
			clearInterval(id);
			client.leaveGame(gameId);
		};
	}, [gameId, sessionId]);

	useRealtimeSubscription(
		gameId ? [chGame(gameId)] : [],
		useCallback(
			(msg) => {
				if (msg.t !== "presence") return;
				const others = msg.players.filter((p) => p.sessionId !== sessionId);
				engineRef.current?.setRemotePlayers(others);
			},
			[sessionId],
		),
		realtimeConfigured && !!gameId,
	);

	return (
		<div className="relative w-full h-full">
			<canvas
				ref={canvasRef}
				className="block w-full h-full outline-none"
				tabIndex={0}
				aria-label="mmo3d プレイビュー"
			/>
			<div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none">
				<HpBar label="HP" hp={hp.hp} max={hp.max} color="#4ade80" />
				{Object.entries(dummyHp).map(([idx, v]) => (
					<HpBar
						key={idx}
						label={`敵${Number(idx) + 1}`}
						hp={v.hp}
						max={v.max}
						color="#f87171"
					/>
				))}
			</div>
			{nearBoardId && !boardOpen && (
				<div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded bg-black/70 text-white text-xs pointer-events-none">
					Eキーで掲示板を開く
				</div>
			)}
			{boardOpen && activeBoardId && (
				<GameThreadBoard postId={activeBoardId} onClose={() => setBoardOpen(false)} />
			)}
		</div>
	);
}

function HpBar({
	label,
	hp,
	max,
	color,
}: {
	label: string;
	hp: number;
	max: number;
	color: string;
}) {
	const pct = max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
	return (
		<div className="w-32 text-[10px] text-white drop-shadow">
			<div className="flex justify-between px-0.5">
				<span>{label}</span>
				<span>
					{hp}/{max}
				</span>
			</div>
			<div className="h-1.5 rounded bg-black/50 overflow-hidden">
				<div
					className="h-full transition-all"
					style={{ width: `${pct}%`, background: color }}
				/>
			</div>
		</div>
	);
}
