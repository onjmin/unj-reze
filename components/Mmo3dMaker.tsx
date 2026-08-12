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
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { realtimeConfigured, useRealtimeSubscription } from "@/lib/hooks/useRealtime";
import { Mmo3dEngine, SKILL_TYPES, WEAPON_TYPES } from "@/lib/mmo3d";
import { Mmo3dBabylonEngine } from "@/lib/mmo3d-babylon";
import { chGame } from "@/lib/realtime/channels";
import type { RealtimePlayer } from "@/lib/realtime/channels";
import { getRealtimeClient } from "@/lib/realtime/client";
import GameThreadBoard from "./GameThreadBoard";
import type { Mmo3dRenderer } from "./game-presets/shared";

const SYNC_INTERVAL_MS = 200; // 位置/アニメの送信間隔（既存2Dの2000msより短い。動きが速いため）
const BOARD_PROXIMITY_POLL_MS = 200;
/** チャットログの保持件数上限（フェーズ25、DBには一切書かず画面内だけで完結する）。 */
const CHAT_LOG_MAX = 30;
/** パーティー最大人数（services/realtime/server.mjs のMAX_PARTY_SIZEと同じ値）。 */
const MAX_PARTY_SIZE = 4;

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
	npcs,
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
	/** NPC（フェーズ26）。近づいてEキーで一方向のメッセージだけ表示する簡易会話。 */
	npcs?: { x: number; z: number; name: string; message: string }[];
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
	// フェーズ25: キャラ育成HUD。TODO(persist): レベル/経験値はエンジン内メモリのみで、
	// リロードすると1に戻る（永続化未着手、docs/mmo3d-feature-design.md参照）。
	const [growth, setGrowth] = useState({ level: 1, xp: 0, xpToNext: 50 });
	// フェーズ25: ソーシャル（チャット・パーティー）。すべてリアルタイムハブ上のみで完結し、
	// DBには一切書かない（TODO(persist): 履歴を残すなら別途設計）。
	const [chatLog, setChatLog] = useState<
		{ sessionId: string; name: string; text: string; ts: number }[]
	>([]);
	const [chatInput, setChatInput] = useState("");
	const [chatOpen, setChatOpen] = useState(false);
	const [others, setOthers] = useState<RealtimePlayer[]>([]);
	const [partyMembers, setPartyMembers] = useState<{ sessionId: string; name?: string }[]>(
		[],
	);
	const [pendingInvite, setPendingInvite] = useState<{
		fromSessionId: string;
		fromName: string;
	} | null>(null);
	const [socialOpen, setSocialOpen] = useState(false);
	const me = useCurrentUser();
	const myName = me?.displayName || "名無し";

	// フェーズ26: NPC会話（一方向メッセージのみ、投稿等は一切行わない）。
	const [npcDialog, setNpcDialog] = useState<{ name: string; message: string } | null>(null);
	// フェーズ26: 装備（武器種）・スキル選択。TODO(persist): エンジン内メモリのみ。
	const [equipment, setEquipment] = useState({ weaponId: "sword", skillId: "burst" });
	// フェーズ26: ミニマップ。ポーリングでエンジンから位置を取得するだけ（DB非依存）。
	const [minimap, setMinimap] = useState<{
		player: { x: number; z: number; facing: number };
		dummies: { x: number; z: number; alive: boolean }[];
		boards: { x: number; z: number }[];
		npcs: { x: number; z: number }[];
	} | null>(null);
	// フェーズ26: 出席（デイリーボーナス）。localStorageのみ、サーバー保存はしない
	// （ブラウザ/端末を変えるとリセットされる。TODO(persist): 本格的にやるならDB）。
	const [attendanceClaimedToday, setAttendanceClaimedToday] = useState(false);

	// boards未指定ならboardPostId 1枚を既定位置に置くフォールバック（後方互換）。
	// JSON化した内容をキーにuseMemoすることで、親が毎レンダー新しい配列を渡してきても
	// 値が実質同じなら参照を安定させ、依存するuseEffectの無駄な再マウントを防ぐ。
	const boardsKey = JSON.stringify(boards ?? []);
	const dummiesKey = JSON.stringify(dummies ?? []);
	const obstaclesKey = JSON.stringify(obstacles ?? []);
	const npcsKey = JSON.stringify(npcs ?? []);
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
					npcs,
				)
			: new Mmo3dEngine(
					canvas,
					canvas.clientWidth || 640,
					canvas.clientHeight || 480,
					dummies,
					obstacles,
					npcs,
				);
		engineRef.current = engine;
		engine.setCombatCallbacks({
			onPlayerDamaged: (hpVal, max) => setHp({ hp: hpVal, max }),
			onDummyDamaged: (index, hpVal, max) =>
				setDummyHp((prev) => ({ ...prev, [index]: { hp: hpVal, max } })),
			onLevelChanged: (level, xp, xpToNext) => setGrowth({ level, xp, xpToNext }),
		});
		setEquipment(engine.getEquipment());
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
			// チャット入力欄にフォーカスがある間はゲーム操作キーを奪わない
			// （フェーズ25: チャット入力中にWキーで移動してしまう事故を防ぐ）。
			if (document.activeElement instanceof HTMLInputElement) return;
			const field = keyToInput[e.code];
			if (field) engine.setInput({ [field]: true });
			if (e.code === "ShiftLeft" || e.code === "ShiftRight")
				engine.setInput({ run: true });
			if (e.code === "Space") {
				e.preventDefault();
				engine.triggerAttack();
			}
			if (e.code === "KeyF") {
				// フェーズ25: スキル攻撃（通常攻撃より広範囲・高威力・長いクールダウン）。
				engine.triggerSkill();
			}
			if (e.code === "KeyE") {
				const target = engine.nearBoard();
				if (target !== null) {
					setActiveBoardId(target);
					setBoardOpen((prev) => !prev);
				} else {
					// フェーズ26: 掲示板が近くに無ければNPCを探す（両方近くにある場合は掲示板優先）。
					const npc = engine.nearNpc();
					setNpcDialog(npc);
				}
			}
		};
		const onKeyUp = (e: KeyboardEvent) => {
			if (document.activeElement instanceof HTMLInputElement) return;
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
		// eslint-disable-next-line react-hooks/exhaustive-deps -- effectiveBoardsはboardsKey/boardPostId由来、dummiesKey/obstaclesKey/npcsKeyで内容が変わった時だけ再マウントする
	}, [
		renderer,
		pmxUrl,
		vmdUrl,
		vmdWalkUrl,
		vmdRunUrl,
		effectiveBoards,
		dummiesKey,
		obstaclesKey,
		npcsKey,
	]);

	// ── 掲示板への近接検知。開いている間はEでの再トグルより閉じるボタン優先。 ──
	useEffect(() => {
		if (effectiveBoards.length === 0) return;
		const id = setInterval(() => {
			setNearBoardId(engineRef.current?.nearBoard() ?? null);
		}, BOARD_PROXIMITY_POLL_MS);
		return () => clearInterval(id);
	}, [effectiveBoards]);

	// ── ミニマップ更新（フェーズ26）。エンジンから位置一覧をポーリングするだけ。 ──
	useEffect(() => {
		const id = setInterval(() => {
			const data = engineRef.current?.getMinimapData();
			if (data) setMinimap(data);
		}, 300);
		return () => clearInterval(id);
	}, []);

	// ── 出席（デイリーボーナス）の既取得判定（フェーズ26、localStorageのみ）。
	// setStateをエフェクト内で同期的に呼ぶとカスケード再レンダーの警告が出るため、
	// マイクロタスクへ逃がす（他のuseEffect内setStateは非同期コールバック内なので対象外）。 ──
	useEffect(() => {
		if (!gameId) return;
		queueMicrotask(() => {
			try {
				const key = `mmo3d_attendance_${gameId}`;
				const today = new Date().toISOString().slice(0, 10);
				setAttendanceClaimedToday(localStorage.getItem(key) === today);
			} catch {
				/* localStorage不可の環境ではデイリーボーナス機能自体を諦める（noop） */
			}
		});
	}, [gameId]);

	const claimAttendance = useCallback(() => {
		if (!gameId || attendanceClaimedToday) return;
		try {
			const key = `mmo3d_attendance_${gameId}`;
			const today = new Date().toISOString().slice(0, 10);
			localStorage.setItem(key, today);
		} catch {
			/* 保存できなくても今回分のXP付与だけは行う */
		}
		engineRef.current?.grantXp(30);
		setAttendanceClaimedToday(true);
	}, [gameId, attendanceClaimedToday]);

	const selectWeapon = useCallback((id: string) => {
		engineRef.current?.setWeapon(id);
		setEquipment((prev) => ({ ...prev, weaponId: id }));
	}, []);
	const selectSkill = useCallback((id: string) => {
		engineRef.current?.setSkill(id);
		setEquipment((prev) => ({ ...prev, skillId: id }));
	}, []);

	// ── リアルタイム同期（three/babylon共通、gameId/sessionIdがある時だけ）。DBには書かない。
	// フェーズ25でlevel/nameも一緒に送るようにした（他プレイヤーのネームプレート/招待UI用）。 ──
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
			const level = engine.getPlayerLevel();
			client.sendPosition(gameId, sessionId, x, y, "🧑", {
				rotY,
				anim: safeAnim,
				level,
				name: myName,
			});
		};
		const id = setInterval(send, SYNC_INTERVAL_MS);
		return () => {
			clearInterval(id);
			client.leaveGame(gameId);
			client.sendPartyLeave(gameId, sessionId);
		};
	}, [gameId, sessionId, myName]);

	useRealtimeSubscription(
		gameId ? [chGame(gameId)] : [],
		useCallback(
			(msg) => {
				if (msg.t === "presence") {
					const rest = msg.players.filter((p) => p.sessionId !== sessionId);
					engineRef.current?.setRemotePlayers(rest);
					setOthers(rest);
					return;
				}
				if (msg.t === "chat") {
					if (msg.game !== gameId) return;
					setChatLog((prev) =>
						[...prev, msg].slice(-CHAT_LOG_MAX),
					);
					return;
				}
				if (msg.t === "partyInvite") {
					if (msg.game !== gameId) return;
					setPendingInvite({ fromSessionId: msg.fromSessionId, fromName: msg.fromName });
					setSocialOpen(true);
					return;
				}
				if (msg.t === "partyUpdate") {
					if (msg.game !== gameId) return;
					setPartyMembers(msg.members);
					return;
				}
			},
			[sessionId, gameId],
		),
		realtimeConfigured && !!gameId,
	);

	// ── パーティー操作（フェーズ25）。全部リアルタイムハブ上のみ、DBには書かない。 ──
	const invitePlayer = useCallback(
		(targetSessionId: string) => {
			if (!gameId || !sessionId) return;
			const client = getRealtimeClient();
			client?.sendPartyInvite(gameId, sessionId, targetSessionId);
		},
		[gameId, sessionId],
	);
	const acceptInvite = useCallback(() => {
		if (!gameId || !sessionId || !pendingInvite) return;
		const client = getRealtimeClient();
		client?.sendPartyAccept(gameId, sessionId, pendingInvite.fromSessionId);
		setPendingInvite(null);
	}, [gameId, sessionId, pendingInvite]);
	const declineInvite = useCallback(() => setPendingInvite(null), []);
	const leaveParty = useCallback(() => {
		if (!gameId || !sessionId) return;
		const client = getRealtimeClient();
		client?.sendPartyLeave(gameId, sessionId);
		setPartyMembers([]);
	}, [gameId, sessionId]);
	const sendChatMessage = useCallback(() => {
		const text = chatInput.trim();
		if (!text || !gameId || !sessionId) return;
		const client = getRealtimeClient();
		client?.sendChat(gameId, sessionId, myName, text);
		setChatInput("");
	}, [chatInput, gameId, sessionId, myName]);

	return (
		<div className="relative w-full h-full">
			<canvas
				ref={canvasRef}
				className="block w-full h-full outline-none"
				tabIndex={0}
				aria-label="mmo3d プレイビュー"
			/>
			{/* フェーズ26: ミニマップ。エンジンからのポーリングのみでDB非依存。 */}
			{minimap && <Minimap data={minimap} />}
			{Object.keys(dummyHp).length > 0 && (
				<div className="absolute top-24 left-2 flex flex-col gap-1 pointer-events-none">
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
			)}
			{/* フェーズ24: 見た目を参考プロダクト（docs/mmo3d-feature-design.md参照）寄りに、
			    自分のHPは画面下中央の大きなバーへ配置し直した（旧: 画面左上の小さいバー）。
			    フェーズ25: レベル/XPバーもすぐ上に追加（キャラ育成、TODO(persist): 未永続化）。 */}
			<div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-2/3 max-w-xs pointer-events-none">
				<div className="flex items-center gap-1.5 mb-0.5">
					<span className="shrink-0 text-[10px] font-bold text-white bg-amber-500/90 rounded px-1.5 py-0.5 drop-shadow">
						Lv{growth.level}
					</span>
					<div className="flex-1 h-1.5 rounded-full bg-black/50 overflow-hidden ring-1 ring-white/10">
						<div
							className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-400"
							style={{
								width: `${growth.xpToNext > 0 ? Math.max(0, Math.min(100, (growth.xp / growth.xpToNext) * 100)) : 0}%`,
							}}
						/>
					</div>
				</div>
				<div className="h-4 rounded-full bg-black/50 overflow-hidden ring-1 ring-white/20">
					<div
						className="h-full rounded-full transition-all bg-gradient-to-r from-rose-400 to-rose-500"
						style={{
							width: `${hp.max > 0 ? Math.max(0, Math.min(100, (hp.hp / hp.max) * 100)) : 0}%`,
						}}
					/>
				</div>
				<div className="text-center text-[10px] text-white drop-shadow mt-0.5">
					{hp.hp} / {hp.max}
				</div>
			</div>

			{/* フェーズ26: ホットバー（装備武器・スキル選択）。参考プロダクトの6枠ホットバーに
			    ならった配置。武器3種+スキル2種のみ選択可能で、残り枠はTODO（装備品の拡張余地）。
			    Space=通常攻撃（選択中の武器）、Fキー=スキル発動（選択中のスキル）。 */}
			<div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-1 bg-black/50 rounded-lg p-1">
				{WEAPON_TYPES.map((w) => (
					<button
						key={w.id}
						type="button"
						onClick={() => selectWeapon(w.id)}
						title={`武器: ${w.label}`}
						className={`w-9 h-9 rounded text-[10px] flex items-center justify-center border ${
							equipment.weaponId === w.id
								? "bg-amber-500 border-amber-300 text-black font-bold"
								: "bg-gray-800/80 border-gray-600 text-gray-200 hover:border-gray-400"
						}`}
					>
						{w.label}
					</button>
				))}
				<div className="w-px bg-white/20 mx-0.5" />
				{SKILL_TYPES.map((s) => (
					<button
						key={s.id}
						type="button"
						onClick={() => selectSkill(s.id)}
						title={`スキル: ${s.label}（Fキーで発動）`}
						className={`w-9 h-9 rounded text-[9px] flex items-center justify-center border leading-tight text-center ${
							equipment.skillId === s.id
								? "bg-sky-500 border-sky-300 text-black font-bold"
								: "bg-gray-800/80 border-gray-600 text-gray-200 hover:border-gray-400"
						}`}
					>
						{s.label}
					</button>
				))}
			</div>

			{nearBoardId && !boardOpen && (
				<div className="absolute bottom-32 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded bg-black/70 text-white text-xs pointer-events-none">
					Eキーで掲示板を開く
				</div>
			)}
			{boardOpen && activeBoardId && (
				<GameThreadBoard postId={activeBoardId} onClose={() => setBoardOpen(false)} />
			)}

			{/* フェーズ26: NPC会話（一方向メッセージのみ、投稿等は一切行わない）。 */}
			{npcDialog && (
				<div className="absolute inset-x-0 bottom-32 flex justify-center px-4">
					<div className="bg-white/95 text-gray-900 rounded-xl shadow-lg p-3 max-w-sm w-full flex gap-2.5">
						<div className="shrink-0 w-8 h-8 rounded-full bg-teal-500 text-white flex items-center justify-center text-xs font-bold">
							{npcDialog.name.slice(0, 1)}
						</div>
						<div className="flex-1 text-xs">
							<p className="font-bold">{npcDialog.name}</p>
							<p className="mt-0.5 leading-relaxed">{npcDialog.message}</p>
							<button
								type="button"
								onClick={() => setNpcDialog(null)}
								className="mt-1.5 text-teal-600 hover:text-teal-700 font-bold"
							>
								閉じる
							</button>
						</div>
					</div>
				</div>
			)}

			{/* フェーズ25: ソーシャル（チャット・パーティー）。realtimeConfiguredでない環境
			    （ハブ未設定）では何も送受信できないため、案内だけ出してボタンは表示しない。 */}
			{realtimeConfigured && gameId && sessionId && (
				<>
					{/* パーティー招待の通知（受信側）。 */}
					{pendingInvite && (
						<div className="absolute top-2 right-2 bg-black/80 text-white text-xs rounded-lg p-2.5 space-y-1.5 w-48">
							<p>{pendingInvite.fromName} さんからパーティー招待</p>
							<div className="flex gap-1.5">
								<button
									type="button"
									onClick={acceptInvite}
									className="flex-1 bg-emerald-600 hover:bg-emerald-500 rounded px-2 py-1"
								>
									承諾
								</button>
								<button
									type="button"
									onClick={declineInvite}
									className="flex-1 bg-gray-700 hover:bg-gray-600 rounded px-2 py-1"
								>
									辞退
								</button>
							</div>
						</div>
					)}

					{/* チャット/ソーシャルパネルの開閉ボタン。 */}
					<div className="absolute top-2 right-2 flex gap-1.5">
						<button
							type="button"
							onClick={() => setChatOpen((v) => !v)}
							className="w-8 h-8 rounded-full bg-black/70 hover:bg-black/85 text-white text-sm flex items-center justify-center"
							title="チャット"
						>
							💬
						</button>
						<button
							type="button"
							onClick={() => setSocialOpen((v) => !v)}
							className="w-8 h-8 rounded-full bg-black/70 hover:bg-black/85 text-white text-sm flex items-center justify-center relative"
							title="パーティー"
						>
							👥
							{partyMembers.length > 0 && (
								<span className="absolute -top-1 -right-1 bg-emerald-500 text-[9px] rounded-full w-4 h-4 flex items-center justify-center">
									{partyMembers.length}
								</span>
							)}
						</button>
					</div>

					{chatOpen && (
						<div className="absolute bottom-24 right-2 w-64 max-h-64 bg-black/75 rounded-lg flex flex-col overflow-hidden">
							<div className="flex-1 overflow-y-auto p-2 space-y-1 text-[11px] text-white">
								{chatLog.length === 0 && (
									<p className="text-gray-400">まだメッセージはありません</p>
								)}
								{chatLog.map((m, i) => (
									<p key={`${m.sessionId}-${m.ts}-${i}`}>
										<span className="font-bold text-amber-300">{m.name}: </span>
										<span className="break-words">{m.text}</span>
									</p>
								))}
							</div>
							<div className="flex border-t border-white/10">
								<input
									value={chatInput}
									onChange={(e) => setChatInput(e.target.value)}
									onKeyDown={(e) => {
										e.stopPropagation();
										if (e.key === "Enter") sendChatMessage();
									}}
									placeholder="メッセージを入力…"
									maxLength={200}
									className="flex-1 bg-transparent px-2 py-1.5 text-[11px] text-white outline-none placeholder:text-gray-500"
								/>
								<button
									type="button"
									onClick={sendChatMessage}
									className="px-2.5 text-[11px] text-amber-300 hover:text-amber-200"
								>
									送信
								</button>
							</div>
						</div>
					)}

					{socialOpen && (
						<div className="absolute top-12 right-2 w-56 bg-black/75 rounded-lg p-2.5 text-white text-[11px] space-y-2">
							<div>
								<p className="font-bold text-gray-300 mb-1">
									パーティー（{partyMembers.length}/{MAX_PARTY_SIZE}）
								</p>
								{partyMembers.length === 0 ? (
									<p className="text-gray-500">未編成</p>
								) : (
									<ul className="space-y-0.5">
										{partyMembers.map((m) => (
											<li key={m.sessionId}>
												{m.name || "名無し"}
												{m.sessionId === sessionId && "（自分）"}
											</li>
										))}
									</ul>
								)}
								{partyMembers.length > 0 && (
									<button
										type="button"
										onClick={leaveParty}
										className="mt-1 w-full bg-red-900/60 hover:bg-red-900 rounded px-2 py-1"
									>
										パーティーを抜ける
									</button>
								)}
							</div>
							<div>
								<p className="font-bold text-gray-300 mb-1">近くのプレイヤー</p>
								{others.length === 0 ? (
									<p className="text-gray-500">誰もいません</p>
								) : (
									<ul className="space-y-1">
										{others.map((p) => {
											const alreadyInParty = partyMembers.some(
												(m) => m.sessionId === p.sessionId,
											);
											return (
												<li key={p.sessionId} className="flex items-center justify-between gap-1">
													<span className="truncate">
														{p.name || "名無し"}
														{p.level !== undefined ? ` Lv${p.level}` : ""}
													</span>
													<button
														type="button"
														disabled={
															alreadyInParty || partyMembers.length >= MAX_PARTY_SIZE
														}
														onClick={() => invitePlayer(p.sessionId)}
														className="shrink-0 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 rounded px-1.5 py-0.5"
													>
														{alreadyInParty ? "編成済" : "招待"}
													</button>
												</li>
											);
										})}
									</ul>
								)}
							</div>

							{/* フェーズ26: 順位（同じルーム内の簡易ランキング、レベル降順）。
							    リアルタイムハブのpresenceから見えている範囲だけの即席集計で、
							    サーバー側の永続ランキングでは無い（TODO(persist)）。 */}
							<div>
								<p className="font-bold text-gray-300 mb-1">順位（このルーム内）</p>
								<ol className="space-y-0.5 list-decimal list-inside">
									{[{ sessionId: sessionId ?? "me", name: myName, level: growth.level }, ...others]
										.sort((a, b) => (b.level ?? 1) - (a.level ?? 1))
										.slice(0, 5)
										.map((p) => (
											<li key={p.sessionId}>
												{p.name || "名無し"} Lv{p.level ?? 1}
												{p.sessionId === sessionId && "（自分）"}
											</li>
										))}
								</ol>
							</div>

							{/* フェーズ26: 郵便・チャンネルはまだ未実装（TODO）。参考プロダクトに
							    あった機能だが、DMシステム/複数ルーム設計との整合が必要なため
							    今回は見送り、非活性ボタンだけ置いてある。 */}
							<div className="flex gap-1.5 pt-1 border-t border-white/10">
								<button
									type="button"
									disabled
									title="未実装（TODO）"
									className="flex-1 bg-gray-800 text-gray-500 rounded px-2 py-1 cursor-not-allowed"
								>
									📮 郵便
								</button>
								<button
									type="button"
									disabled
									title="未実装（TODO）"
									className="flex-1 bg-gray-800 text-gray-500 rounded px-2 py-1 cursor-not-allowed"
								>
									📡 チャンネル
								</button>
							</div>
						</div>
					)}
				</>
			)}

			{/* フェーズ26: 出席（デイリーボーナス）。realtimeハブ不要、localStorageのみで完結する
			    ので常時表示する（TODO(persist): サーバー側の永続化はしていない）。 */}
			{gameId && (
				<button
					type="button"
					onClick={claimAttendance}
					disabled={attendanceClaimedToday}
					title={attendanceClaimedToday ? "本日は取得済みです" : "出席してXP+30を受け取る"}
					className={`absolute top-2 left-2 text-[10px] rounded-full px-2.5 py-1 ${
						attendanceClaimedToday
							? "bg-gray-700/70 text-gray-400 cursor-not-allowed"
							: "bg-emerald-600/90 hover:bg-emerald-500 text-white"
					}`}
				>
					{attendanceClaimedToday ? "✅ 出席済み" : "📅 出席する"}
				</button>
			)}
		</div>
	);
}

/** フェーズ26: ミニマップ。プレイヤーを常に中央に固定し、周囲のダミー/掲示板/NPCを
 *  相対位置のドットで表示するだけの簡易実装（回転はプレイヤーの向きに追従しない、
 *  北固定=ワールドZ- が常に上）。 */
function Minimap({
	data,
}: {
	data: {
		player: { x: number; z: number; facing: number };
		dummies: { x: number; z: number; alive: boolean }[];
		boards: { x: number; z: number }[];
		npcs: { x: number; z: number }[];
	};
}) {
	const SIZE = 96;
	const RANGE = 16; // m四方（この範囲外のエンティティはドットを描かない）
	const scale = SIZE / 2 / RANGE;
	const toXY = (x: number, z: number) => {
		const dx = x - data.player.x;
		const dz = z - data.player.z;
		return { left: SIZE / 2 + dx * scale, top: SIZE / 2 + dz * scale };
	};
	return (
		<div
			className="absolute top-12 right-2 rounded-full bg-black/60 ring-1 ring-white/20 overflow-hidden"
			style={{ width: SIZE, height: SIZE }}
		>
			{data.boards.map((b, i) => {
				const p = toXY(b.x, b.z);
				return (
					<div
						key={`b-${i}`}
						className="absolute w-1.5 h-1.5 bg-amber-400 rounded-sm -translate-x-1/2 -translate-y-1/2"
						style={{ left: p.left, top: p.top }}
					/>
				);
			})}
			{data.npcs.map((n, i) => {
				const p = toXY(n.x, n.z);
				return (
					<div
						key={`n-${i}`}
						className="absolute w-1.5 h-1.5 bg-teal-400 rounded-full -translate-x-1/2 -translate-y-1/2"
						style={{ left: p.left, top: p.top }}
					/>
				);
			})}
			{data.dummies.map((d, i) => {
				if (!d.alive) return null;
				const p = toXY(d.x, d.z);
				return (
					<div
						key={`d-${i}`}
						className="absolute w-1.5 h-1.5 bg-red-500 rounded-full -translate-x-1/2 -translate-y-1/2"
						style={{ left: p.left, top: p.top }}
					/>
				);
			})}
			{/* 自分（常に中央、向きを三角で表す）。 */}
			<div
				className="absolute w-0 h-0 -translate-x-1/2 -translate-y-1/2"
				style={{
					left: SIZE / 2,
					top: SIZE / 2,
					borderLeft: "4px solid transparent",
					borderRight: "4px solid transparent",
					borderBottom: "7px solid #4ade80",
					transform: `translate(-50%, -50%) rotate(${(data.player.facing * 180) / Math.PI}deg)`,
				}}
			/>
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
