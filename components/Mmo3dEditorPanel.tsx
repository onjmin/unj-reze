"use client";

// mmo3d専用の編集パネル（MAPタブに吸収）。レンダラー切替と掲示板の対象スレッドIDだけを持つ、
// 最小限のUI。マップ配置編集（武器/ダミー配置・地形）はまだ無い（docs/mmo3d-feature-design.md参照）。

import type { Mmo3dRenderer } from "./game-presets/shared";

export default function Mmo3dEditorPanel({
	renderer,
	onRendererChange,
	boardPostId,
	onBoardPostIdChange,
}: {
	renderer: Mmo3dRenderer;
	onRendererChange: (renderer: Mmo3dRenderer) => void;
	boardPostId: string;
	onBoardPostIdChange: (postId: string) => void;
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

			<div className="bg-gray-800/60 rounded-lg p-2.5 space-y-2">
				<p className="text-[11px] font-bold text-gray-300">📋 掲示板（本SNSの投稿を参照）</p>
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
