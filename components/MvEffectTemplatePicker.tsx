"use client";

import { useEffect, useRef, useState } from "react";
import {
	DEFAULT_TEMPLATE_PARAMS,
	type MvEffectTemplateDef,
	type MvEffectTemplateParams,
	MV_EFFECT_TEMPLATE_CATEGORY_LABELS,
	MV_EFFECT_TEMPLATES,
} from "@/lib/mv-effect-templates";
import {
	EMPTY_SONG,
	drawMvFrame,
	type MvFrameState,
} from "@/lib/mv-engine";
import type { MvManifest } from "@/lib/mv-config";
import { MV_H, MV_W } from "@/lib/mv-config";

/**
 * テンプレート1個を小さいcanvasでループ再生するプレビュー。
 * モーダルのグリッドに並ぶ「これがどう動くか」を選ぶ前に見せるためのもの。
 */
function TemplatePreview({
	template,
	params,
}: {
	template: MvEffectTemplateDef;
	params: MvEffectTemplateParams;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const manifest: MvManifest = {
			version: 1,
			preset: "geometric",
			title: "",
			mml: "",
			audio: { mode: "soundfontKoe" },
			stage: {
				bgColor: "#111113",
				bgFit: "cover",
				pulse: "none",
				fadeIn: false,
				fadeOut: false,
				palette: [],
			},
			sections: [],
			layers: template.build(params),
		};

		// プレビュー専用の固定BPM(120)。テンプレートは bar/phrase ソースだけで
		// 組んであるので曲データに依存せず、EMPTY_SONGのbpmだけ使えば十分。
		const song = { ...EMPTY_SONG, bpm: 120 };
		const stepsPerSec = (song.bpm / 60) * 48; // MV_STEPS_PER_BEAT=48相当
		let raf = 0;
		const start = performance.now();
		const loop = () => {
			const elapsed = (performance.now() - start) / 1000;
			const frame: MvFrameState = {
				step: elapsed * stepsPerSec,
				timeSec: elapsed,
			};
			drawMvFrame(ctx, manifest, song, frame);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [template, params]);

	return (
		<canvas
			ref={canvasRef}
			width={MV_W}
			height={MV_H}
			className="block h-auto w-full rounded bg-black"
			style={{ aspectRatio: `${MV_W} / ${MV_H}` }}
		/>
	);
}

interface MvEffectTemplatePickerProps {
	/** 追加を確定したときに呼ばれる。パラメータはこの時点のプレビュー値。 */
	onPick: (template: MvEffectTemplateDef, params: MvEffectTemplateParams) => void;
	onClose: () => void;
}

/**
 * テンプレート選択モーダル。モバイル前提で1カラムの縦並び、各行にプレビューを
 * 常時再生しておく（タップしてから探すのではなく、動きを見て選べるように）。
 */
export default function MvEffectTemplatePicker({
	onPick,
	onClose,
}: MvEffectTemplatePickerProps) {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [params, setParams] = useState<MvEffectTemplateParams>(
		DEFAULT_TEMPLATE_PARAMS,
	);

	const selected = MV_EFFECT_TEMPLATES.find((t) => t.id === selectedId) ?? null;

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
			<div className="flex h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-xl bg-gray-900 sm:h-[85vh] sm:rounded-xl">
				<div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-3">
					<span className="text-sm font-bold text-gray-100">
						{selected ? "パラメータを調整" : "エフェクトを選ぶ"}
					</span>
					<button
						onClick={selected ? () => setSelectedId(null) : onClose}
						className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-800"
					>
						{selected ? "一覧へ戻る" : "閉じる"}
					</button>
				</div>

				{!selected ? (
					<div className="flex-1 space-y-3 overflow-y-auto p-3">
						{MV_EFFECT_TEMPLATES.map((t) => (
							<button
								key={t.id}
								onClick={() => setSelectedId(t.id)}
								className="block w-full rounded-lg border border-gray-700 bg-gray-800/60 p-2 text-left active:scale-[0.99]"
							>
								<TemplatePreview template={t} params={DEFAULT_TEMPLATE_PARAMS} />
								<div className="mt-2 flex items-center gap-2">
									<span className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300">
										{MV_EFFECT_TEMPLATE_CATEGORY_LABELS[t.category]}
									</span>
									<span className="text-[13px] font-bold text-gray-100">
										{t.name}
									</span>
								</div>
								<p className="mt-1 text-[11px] leading-relaxed text-gray-400">
									{t.description}
								</p>
							</button>
						))}
					</div>
				) : (
					<div className="flex-1 space-y-3 overflow-y-auto p-3">
						<TemplatePreview template={selected} params={params} />

						<label className="block space-y-0.5">
							<span className="text-[10px] text-gray-400">
								何小節で1周するか
							</span>
							<input
								type="range"
								min={1}
								max={8}
								step={1}
								value={params.barsPerLoop}
								onChange={(e) =>
									setParams((p) => ({
										...p,
										barsPerLoop: Number(e.target.value),
									}))
								}
								className="w-full min-h-8"
							/>
							<span className="text-[11px] text-gray-300">
								{params.barsPerLoop}小節
							</span>
						</label>

						<label className="block space-y-0.5">
							<span className="text-[10px] text-gray-400">大きさ</span>
							<input
								type="range"
								min={10}
								max={120}
								step={1}
								value={params.size}
								onChange={(e) =>
									setParams((p) => ({ ...p, size: Number(e.target.value) }))
								}
								className="w-full min-h-8"
							/>
						</label>

						<label className="block space-y-0.5">
							<span className="text-[10px] text-gray-400">濃さ</span>
							<input
								type="range"
								min={0.1}
								max={1}
								step={0.05}
								value={params.opacity}
								onChange={(e) =>
									setParams((p) => ({ ...p, opacity: Number(e.target.value) }))
								}
								className="w-full min-h-8"
							/>
						</label>

						<label className="block space-y-0.5">
							<span className="text-[10px] text-gray-400">
								本数・角数（対応するテンプレートのみ）
							</span>
							<input
								type="range"
								min={3}
								max={16}
								step={1}
								value={params.count}
								onChange={(e) =>
									setParams((p) => ({ ...p, count: Number(e.target.value) }))
								}
								className="w-full min-h-8"
							/>
						</label>

						<label className="flex items-center gap-2">
							<span className="text-[10px] text-gray-400 shrink-0">色</span>
							<input
								type="color"
								value={params.color}
								onChange={(e) =>
									setParams((p) => ({ ...p, color: e.target.value }))
								}
								className="h-9 w-16 shrink-0 rounded border border-gray-700 bg-gray-800"
							/>
						</label>

						<div className="grid grid-cols-2 gap-2">
							<label className="block space-y-0.5">
								<span className="text-[10px] text-gray-400">X</span>
								<input
									type="number"
									value={params.x}
									onChange={(e) =>
										setParams((p) => ({ ...p, x: Number(e.target.value) }))
									}
									className="min-h-9 w-full rounded border border-gray-700 bg-gray-800 px-2 text-[13px] text-gray-100"
								/>
							</label>
							<label className="block space-y-0.5">
								<span className="text-[10px] text-gray-400">Y</span>
								<input
									type="number"
									value={params.y}
									onChange={(e) =>
										setParams((p) => ({ ...p, y: Number(e.target.value) }))
									}
									className="min-h-9 w-full rounded border border-gray-700 bg-gray-800 px-2 text-[13px] text-gray-100"
								/>
							</label>
						</div>

						<button
							onClick={() => {
								onPick(selected, params);
								onClose();
							}}
							className="w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white active:scale-[0.99]"
						>
							このエフェクトを追加
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
