"use client";

// mmo3d専用の編集パネル（MAPタブに吸収）。レンダラー切替と掲示板の対象スレッドIDだけを持つ、
// 最小限のUI。マップ配置編集（武器/ダミー配置・地形）はまだ無い（docs/mmo3d-feature-design.md参照）。

import {
	MMD_MODEL_CATALOG,
	MMD_MOTION_CATALOG,
} from "./game-presets/model-catalog";
import type { Mmo3dRenderer } from "./game-presets/shared";

export default function Mmo3dEditorPanel({
	renderer,
	onRendererChange,
	boardPostId,
	onBoardPostIdChange,
	pmxUrl = "",
	onPmxUrlChange,
	vmdUrl = "",
	onVmdUrlChange,
}: {
	renderer: Mmo3dRenderer;
	onRendererChange: (renderer: Mmo3dRenderer) => void;
	boardPostId: string;
	onBoardPostIdChange: (postId: string) => void;
	pmxUrl?: string;
	onPmxUrlChange?: (url: string) => void;
	vmdUrl?: string;
	onVmdUrlChange?: (url: string) => void;
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
											? "bg-purple-600 border-purple-400 text-white"
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

					{/* VMD モーションプリセット */}
					<div className="space-y-1.5">
						<p className="text-[10px] text-gray-400 font-bold">2. MMD モーション (.vmd)</p>
						<div className="grid grid-cols-2 gap-1">
							<button
								type="button"
								onClick={() => onVmdUrlChange?.("")}
								className={`px-2 py-1 rounded text-[10px] border transition ${
									!vmdUrl
										? "bg-purple-600 border-purple-400 text-white"
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
											? "bg-purple-600 border-purple-400 text-white"
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
				</div>
			)}

			<div className="bg-gray-800/60 rounded-lg p-2.5 space-y-2">
				<p className="text-[11px] font-bold text-gray-300">掲示板（本SNSの投稿を参照）</p>
				<p className="text-[10px] text-gray-500 leading-tight">
					指定した投稿IDのスレッドを、ワールド上の掲示板から閲覧・返信できるようにします（three版のみ）。空欄なら埋め込み先の投稿を自動で使います。
				</p>
				<input
					value={boardPostId}
					onChange={(e) => onBoardPostIdChange(e.target.value)}
					placeholder="投稿ID（例: 18）"
					className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 outline-none focus:border-blue-500"
				/>
			</div>
		</div>
	);
}
