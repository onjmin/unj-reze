"use client";

// mmo3d専用の編集パネル（MAPタブに吸収）。レンダラー切替・掲示板・ダミー敵・地形障害物の
// 配置編集を持つ（docs/mmo3d-feature-design.md参照）。

import {
	MMD_MODEL_CATALOG,
	MMD_MOTION_CATALOG,
} from "./game-presets/model-catalog";
import type { Mmo3dRenderer } from "./game-presets/shared";

type BoardSpot = { x: number; z: number; threadPostId: string };
type DummySpot = { x: number; z: number };
type ObstacleSpot = {
	x: number;
	z: number;
	w: number;
	d: number;
	h: number;
	color?: string;
	walkable?: boolean;
};

export default function Mmo3dEditorPanel({
	renderer,
	onRendererChange,
	boardPostId,
	onBoardPostIdChange,
	boards = [],
	onBoardsChange,
	dummies = [],
	onDummiesChange,
	obstacles = [],
	onObstaclesChange,
	pmxUrl = "",
	onPmxUrlChange,
	vmdUrl = "",
	onVmdUrlChange,
	vmdWalkUrl = "",
	onVmdWalkUrlChange,
	vmdRunUrl = "",
	onVmdRunUrlChange,
}: {
	renderer: Mmo3dRenderer;
	onRendererChange: (renderer: Mmo3dRenderer) => void;
	boardPostId: string;
	onBoardPostIdChange: (postId: string) => void;
	/** ワールド上の任意位置に置く掲示板一覧。空ならboardPostId 1枚を既定位置に置く。 */
	boards?: BoardSpot[];
	onBoardsChange?: (boards: BoardSpot[]) => void;
	/** ダミー敵の配置座標一覧。空なら既定の2体を使う。 */
	dummies?: DummySpot[];
	onDummiesChange?: (dummies: DummySpot[]) => void;
	/** 簡易地形の障害物（直方体）一覧。three/babylon両対応で当たり判定あり。 */
	obstacles?: ObstacleSpot[];
	onObstaclesChange?: (obstacles: ObstacleSpot[]) => void;
	pmxUrl?: string;
	onPmxUrlChange?: (url: string) => void;
	/** idle（静止/未移動時）用VMD。 */
	vmdUrl?: string;
	onVmdUrlChange?: (url: string) => void;
	/** 歩行時に切り替えるVMD。未指定ならvmdUrlのまま。 */
	vmdWalkUrl?: string;
	onVmdWalkUrlChange?: (url: string) => void;
	/** 走行時（Shift+移動）に切り替えるVMD。 */
	vmdRunUrl?: string;
	onVmdRunUrlChange?: (url: string) => void;
}) {
	return (
		<div className="space-y-3">
			<div className="bg-gray-800/60 rounded-lg p-2.5 space-y-2">
				<p className="text-[11px] font-bold text-gray-300">レンダラー</p>
				<p className="text-[10px] text-gray-500 leading-tight">
					three-stdlibとbabylon-mmdは同じ画面上で共存できないため、ゲームごとにどちらか一方を選びます。
				</p>
				<div className="flex gap-1.5">
					<button
						type="button"
						onClick={() => onRendererChange("three")}
						className={`flex-1 px-2 py-1.5 rounded text-[11px] border transition ${
							renderer === "three"
								? "bg-blue-600 border-blue-400 text-white"
								: "bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-600"
						}`}
					>
						three
						<span className="block text-[9px] opacity-80">GLTF/GLB中心・軽量</span>
					</button>
					<button
						type="button"
						onClick={() => onRendererChange("babylon")}
						className={`flex-1 px-2 py-1.5 rounded text-[11px] border transition ${
							renderer === "babylon"
								? "bg-blue-600 border-blue-400 text-white"
								: "bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-600"
						}`}
					>
						babylon
						<span className="block text-[9px] opacity-80">MMD(PMX)対応・Havok物理</span>
					</button>
				</div>
			</div>

			{renderer === "babylon" && (
				<div className="bg-gray-800/60 rounded-lg p-2.5 space-y-3 border border-purple-900/40">
					<div className="flex items-center justify-between">
						<p className="text-[11px] font-bold text-purple-300 flex items-center gap-1">
							MMD素材（PMXモデル / VMDモーション）
						</p>
						<span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
							babylon-mmd
						</span>
					</div>

					{/* PMX モデルプリセット */}
					<div className="space-y-1.5">
						<p className="text-[10px] text-gray-400 font-bold">1. MMD 3Dモデル (.pmx / .pmd)</p>
						<div className="grid grid-cols-3 gap-1">
							<button
								type="button"
								onClick={() => {
									onPmxUrlChange?.("");
									onVmdUrlChange?.("");
								}}
								className={`px-2 py-1 rounded text-[10px] border transition ${
									!pmxUrl
										? "bg-purple-600 border-purple-400 text-white"
										: "bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-600"
								}`}
							>
								なし（カプセル）
							</button>
							{MMD_MODEL_CATALOG.map((m) => (
								<button
									key={m.key}
									type="button"
									onClick={() => {
										onPmxUrlChange?.(m.url);
										if (m.defaultMotionUrl && !vmdUrl) {
											onVmdUrlChange?.(m.defaultMotionUrl);
										}
									}}
									className={`px-2 py-1 rounded text-[10px] border transition flex items-center justify-center gap-1 truncate ${
										pmxUrl === m.url
											? "bg-purple-600 border-purple-400 text-white font-bold"
											: "bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-600"
									}`}
									title={m.label}
								>
									<span className="truncate">{m.label}</span>
								</button>
							))}
						</div>
						<input
							value={pmxUrl}
							onChange={(e) => onPmxUrlChange?.(e.target.value)}
							placeholder="カスタム PMX/PMD URL (https://...)"
							className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-200 outline-none focus:border-purple-500"
						/>
					</div>

					{/* VMD モーションプリセット（idle用） */}
					<div className="space-y-1.5">
						<p className="text-[10px] text-gray-400 font-bold">
							2. MMD モーション (.vmd) — 静止時（idle）用
						</p>
						<div className="grid grid-cols-2 gap-1">
							<button
								type="button"
								onClick={() => onVmdUrlChange?.("")}
								className={`px-2 py-1 rounded text-[10px] border transition ${
									!vmdUrl
										? "bg-purple-600 border-purple-400 text-white font-bold"
										: "bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-600"
								}`}
							>
								なし（ポーズ固定）
							</button>
							{MMD_MOTION_CATALOG.map((m) => (
								<button
									key={m.key}
									type="button"
									onClick={() => onVmdUrlChange?.(m.url)}
									className={`px-2 py-1 rounded text-[10px] border transition flex items-center justify-center gap-1 truncate ${
										vmdUrl === m.url
											? "bg-purple-600 border-purple-400 text-white font-bold"
											: "bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-600"
									}`}
									title={m.label}
								>
									<span className="truncate">{m.label}</span>
								</button>
							))}
						</div>
						<input
							value={vmdUrl}
							onChange={(e) => onVmdUrlChange?.(e.target.value)}
							placeholder="カスタム VMD URL (https://...)"
							className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-200 outline-none focus:border-purple-500"
						/>
					</div>

					{/* 歩行/走行モーション（自動切替、任意） */}
					<div className="space-y-1.5">
						<p className="text-[10px] text-gray-400 font-bold">
							3. 歩行・走行モーション（任意、自動切替）
						</p>
						<p className="text-[9px] text-gray-500 leading-tight">
							指定すると移動状態（歩行/Shift+移動でダッシュ）に応じてVMDを自動で切り替えます。空欄なら上のidle用モーションのまま変わりません。ウォークサイクル用のVMDはビルトインカタログに無いため、URLを直接入力してください。
						</p>
						<input
							value={vmdWalkUrl}
							onChange={(e) => onVmdWalkUrlChange?.(e.target.value)}
							placeholder="歩行モーション VMD URL（任意, https://...）"
							className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-200 outline-none focus:border-purple-500"
						/>
						<input
							value={vmdRunUrl}
							onChange={(e) => onVmdRunUrlChange?.(e.target.value)}
							placeholder="走行モーション VMD URL（任意, https://...）"
							className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-200 outline-none focus:border-purple-500"
						/>
					</div>
				</div>
			)}

			<div className="bg-gray-800/60 rounded-lg p-2.5 space-y-2">
				<p className="text-[11px] font-bold text-gray-300">掲示板（本SNSの投稿を参照）</p>
				<p className="text-[10px] text-gray-500 leading-tight">
					下の「複数の掲示板」が空のときだけ使う既定1枚分の投稿ID。空欄なら埋め込み先の投稿を自動で使います。
				</p>
				<input
					value={boardPostId}
					onChange={(e) => onBoardPostIdChange(e.target.value)}
					placeholder="投稿ID（例: 18）"
					className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 outline-none focus:border-blue-500"
				/>
			</div>

			<div className="bg-gray-800/60 rounded-lg p-2.5 space-y-2">
				<p className="text-[11px] font-bold text-gray-300">複数の掲示板（任意位置）</p>
					<p className="text-[10px] text-gray-500 leading-tight">
						ワールド座標(x, z)と対象投稿IDを指定して、複数の掲示板を好きな場所に置けます。1つ以上あれば上の既定1枚には代わりに使われます。
					</p>
					{boards.map((b, i) => (
						<div
							key={`board-${i}`}
							className="flex items-center gap-1"
						>
							<input
								type="number"
								value={b.x}
								onChange={(e) => {
									const next = [...boards];
									next[i] = { ...b, x: Number(e.target.value) || 0 };
									onBoardsChange?.(next);
								}}
								placeholder="x"
								className="w-14 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-gray-200 outline-none focus:border-blue-500"
							/>
							<input
								type="number"
								value={b.z}
								onChange={(e) => {
									const next = [...boards];
									next[i] = { ...b, z: Number(e.target.value) || 0 };
									onBoardsChange?.(next);
								}}
								placeholder="z"
								className="w-14 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-gray-200 outline-none focus:border-blue-500"
							/>
							<input
								value={b.threadPostId}
								onChange={(e) => {
									const next = [...boards];
									next[i] = { ...b, threadPostId: e.target.value };
									onBoardsChange?.(next);
								}}
								placeholder="投稿ID"
								className="flex-1 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-gray-200 outline-none focus:border-blue-500"
							/>
							<button
								type="button"
								onClick={() => onBoardsChange?.(boards.filter((_, j) => j !== i))}
								className="px-2 py-1 rounded text-[10px] bg-red-900/60 text-red-200 border border-red-800 hover:bg-red-900"
							>
								削除
							</button>
						</div>
					))}
					<button
						type="button"
						onClick={() =>
							onBoardsChange?.([...boards, { x: 0, z: 0, threadPostId: "" }])
						}
						className="w-full px-2 py-1.5 rounded text-[10px] border border-dashed border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200 transition"
					>
						+ 掲示板を追加
					</button>
			</div>

			<div className="bg-gray-800/60 rounded-lg p-2.5 space-y-2">
				<p className="text-[11px] font-bold text-gray-300">ダミー敵の配置</p>
				<p className="text-[10px] text-gray-500 leading-tight">
					ワールド座標(x, z)を指定します。0体なら既定の2体（(3,-3) と (-3,-4)）が使われます。
				</p>
					{dummies.map((d, i) => (
						<div
							key={`dummy-${i}`}
							className="flex items-center gap-1"
						>
							<input
								type="number"
								value={d.x}
								onChange={(e) => {
									const next = [...dummies];
									next[i] = { ...d, x: Number(e.target.value) || 0 };
									onDummiesChange?.(next);
								}}
								placeholder="x"
								className="w-16 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-gray-200 outline-none focus:border-blue-500"
							/>
							<input
								type="number"
								value={d.z}
								onChange={(e) => {
									const next = [...dummies];
									next[i] = { ...d, z: Number(e.target.value) || 0 };
									onDummiesChange?.(next);
								}}
								placeholder="z"
								className="w-16 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-gray-200 outline-none focus:border-blue-500"
							/>
							<button
								type="button"
								onClick={() => onDummiesChange?.(dummies.filter((_, j) => j !== i))}
								className="flex-1 px-2 py-1 rounded text-[10px] bg-red-900/60 text-red-200 border border-red-800 hover:bg-red-900"
							>
								削除
							</button>
						</div>
					))}
					<button
						type="button"
						onClick={() => onDummiesChange?.([...dummies, { x: 0, z: -3 }])}
						className="w-full px-2 py-1.5 rounded text-[10px] border border-dashed border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200 transition"
					>
						+ ダミー敵を追加
					</button>
			</div>

			<div className="bg-gray-800/60 rounded-lg p-2.5 space-y-2">
				<p className="text-[11px] font-bold text-gray-300">地形の障害物（直方体）</p>
				<p className="text-[10px] text-gray-500 leading-tight">
					中心座標(x, z)・幅(w)・奥行き(d)・高さ(h)を指定した直方体を配置します。「足場」にチェックすると壁ではなく段差になり、上に乗るとその高さまで登れます（プラットフォーム的な高低差地形）。three/babylon版とも当たり判定・足場ともに対応済みです。
				</p>
				{obstacles.map((o, i) => (
					<div key={`obstacle-${i}`} className="space-y-1 border-b border-gray-700/60 pb-1.5 last:border-0 last:pb-0">
						<div className="flex items-center gap-1">
							<input
								type="number"
								value={o.x}
								onChange={(e) => {
									const next = [...obstacles];
									next[i] = { ...o, x: Number(e.target.value) || 0 };
									onObstaclesChange?.(next);
								}}
								placeholder="x"
								className="w-14 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-gray-200 outline-none focus:border-blue-500"
							/>
							<input
								type="number"
								value={o.z}
								onChange={(e) => {
									const next = [...obstacles];
									next[i] = { ...o, z: Number(e.target.value) || 0 };
									onObstaclesChange?.(next);
								}}
								placeholder="z"
								className="w-14 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-gray-200 outline-none focus:border-blue-500"
							/>
							<input
								type="number"
								value={o.w}
								min={0.1}
								onChange={(e) => {
									const next = [...obstacles];
									next[i] = { ...o, w: Math.max(0.1, Number(e.target.value) || 1) };
									onObstaclesChange?.(next);
								}}
								placeholder="幅w"
								className="w-14 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-gray-200 outline-none focus:border-blue-500"
							/>
							<input
								type="number"
								value={o.d}
								min={0.1}
								onChange={(e) => {
									const next = [...obstacles];
									next[i] = { ...o, d: Math.max(0.1, Number(e.target.value) || 1) };
									onObstaclesChange?.(next);
								}}
								placeholder="奥行d"
								className="w-14 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-gray-200 outline-none focus:border-blue-500"
							/>
							<input
								type="number"
								value={o.h}
								min={0.1}
								onChange={(e) => {
									const next = [...obstacles];
									next[i] = { ...o, h: Math.max(0.1, Number(e.target.value) || 1) };
									onObstaclesChange?.(next);
								}}
								placeholder="高さh"
								className="w-14 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-gray-200 outline-none focus:border-blue-500"
							/>
							<button
								type="button"
								onClick={() => onObstaclesChange?.(obstacles.filter((_, j) => j !== i))}
								className="flex-1 px-2 py-1 rounded text-[10px] bg-red-900/60 text-red-200 border border-red-800 hover:bg-red-900"
							>
								削除
							</button>
						</div>
						<label className="flex items-center gap-1.5 text-[10px] text-gray-400">
							<input
								type="checkbox"
								checked={!!o.walkable}
								onChange={(e) => {
									const next = [...obstacles];
									next[i] = { ...o, walkable: e.target.checked };
									onObstaclesChange?.(next);
								}}
								className="accent-blue-500"
							/>
							足場にする（壁ではなく段差・上に乗れる）
						</label>
					</div>
				))}
				<button
					type="button"
					onClick={() =>
						onObstaclesChange?.([...obstacles, { x: 0, z: 0, w: 2, d: 2, h: 1.5 }])
					}
					className="w-full px-2 py-1.5 rounded text-[10px] border border-dashed border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200 transition"
				>
					+ 障害物を追加
				</button>
			</div>
		</div>
	);
}
