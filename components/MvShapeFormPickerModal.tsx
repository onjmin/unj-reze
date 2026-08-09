"use client";

import { X } from "lucide-react";
import {
	MV_SHAPE_FORM_CATEGORY,
	MV_SHAPE_FORM_CATEGORY_LABELS,
	MV_SHAPE_FORM_DESCRIPTIONS,
	MV_SHAPE_FORM_LABELS,
	type MvShapeForm,
	type MvShapeFormCategory,
} from "@/lib/mv-config";

const CATEGORY_ORDER: MvShapeFormCategory[] = ["basic", "frame", "wave"];

const SHAPE_FORMS = Object.keys(MV_SHAPE_FORM_LABELS) as MvShapeForm[];

/**
 * グリッドの1マスに出すプレビュー。多くの形は静止したSVGの線画で十分伝わるので、
 * サムネイルを常時アニメーションさせる負荷は避ける。ただし「小節ごとに息をする」
 * doubleFrame と「小節でループする」ripple は、動きそのものが特徴なので
 * CSSアニメーションだけ軽く付けて質感を伝える（JS/canvasは使わない）。
 */
export function ShapeFormPreview({ form }: { form: MvShapeForm }) {
	const stroke = "currentColor";
	switch (form) {
		case "circle":
			return (
				<svg viewBox="0 0 100 100" className="h-full w-full">
					<circle cx={50} cy={50} r={30} fill={stroke} />
				</svg>
			);
		case "ring":
			return (
				<svg viewBox="0 0 100 100" className="h-full w-full">
					<circle cx={50} cy={50} r={28} fill="none" stroke={stroke} strokeWidth={4} />
				</svg>
			);
		case "square":
			return (
				<svg viewBox="0 0 100 100" className="h-full w-full">
					<rect x={22} y={22} width={56} height={56} fill={stroke} />
				</svg>
			);
		case "diamond":
			return (
				<svg viewBox="0 0 100 100" className="h-full w-full">
					<polygon points="50,18 82,50 50,82 18,50" fill={stroke} />
				</svg>
			);
		case "triangle":
			return (
				<svg viewBox="0 0 100 100" className="h-full w-full">
					<polygon points="50,18 84,78 16,78" fill={stroke} />
				</svg>
			);
		case "polygon":
			return (
				<svg viewBox="0 0 100 100" className="h-full w-full">
					<polygon points="50,15 79,32 79,68 50,85 21,68 21,32" fill={stroke} />
				</svg>
			);
		case "cross":
			return (
				<svg viewBox="0 0 100 100" className="h-full w-full">
					<line x1={20} y1={50} x2={80} y2={50} stroke={stroke} strokeWidth={5} />
					<line x1={50} y1={20} x2={50} y2={80} stroke={stroke} strokeWidth={5} />
				</svg>
			);
		case "bar":
			return (
				<svg viewBox="0 0 100 100" className="h-full w-full">
					<rect x={12} y={40} width={76} height={20} fill={stroke} />
				</svg>
			);
		case "path":
			return (
				<svg viewBox="0 0 100 100" className="h-full w-full">
					<path
						d="M50 15 L61 40 L88 40 L66 57 L74 84 L50 68 L26 84 L34 57 L12 40 L39 40 Z"
						fill={stroke}
					/>
				</svg>
			);
		case "doubleFrame":
			return (
				<svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
					<rect
						x={18}
						y={18}
						width={64}
						height={64}
						fill="none"
						stroke={stroke}
						strokeWidth={3}
						className="mv-shape-preview-breathe"
					/>
					<rect
						x={30}
						y={30}
						width={40}
						height={40}
						fill="none"
						stroke={stroke}
						strokeWidth={3}
						className="mv-shape-preview-breathe"
					/>
				</svg>
			);
		case "ripple":
			return (
				<svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
					<circle
						cx={50}
						cy={50}
						r={5}
						fill="none"
						stroke={stroke}
						strokeWidth={3}
						className="mv-shape-preview-ripple"
					/>
				</svg>
			);
	}
}

interface MvShapeFormPickerModalProps {
	value: MvShapeForm;
	onSelect: (form: MvShapeForm) => void;
	onClose: () => void;
}

/**
 * 図形の「形」選択をプルダウンではなくサムネイル付きのモーダルから選ぶ形にしたもの。
 * モバイルファーストで2列、画面が広がるにつれ3列まで増やす（screenshotの縦積みカードより
 * 密度を上げて一覧性を優先——形は種類が多く、スクロール量を減らしたい）。
 */
export default function MvShapeFormPickerModal({
	value,
	onSelect,
	onClose,
}: MvShapeFormPickerModalProps) {
	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
			<style>{`
				@keyframes mv-shape-preview-breathe-kf {
					0%, 100% { transform: scale(1); opacity: 0.9; }
					50% { transform: scale(1.08); opacity: 1; }
				}
				.mv-shape-preview-breathe {
					transform-origin: 50px 50px;
					animation: mv-shape-preview-breathe-kf 2s ease-in-out infinite;
				}
				@keyframes mv-shape-preview-ripple-kf {
					0% { r: 5; opacity: 1; }
					100% { r: 42; opacity: 0; }
				}
				.mv-shape-preview-ripple {
					animation: mv-shape-preview-ripple-kf 1.6s ease-out infinite;
				}
			`}</style>
			<div className="flex h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl bg-gray-900 sm:h-[88vh] sm:rounded-xl">
				<div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-3">
					<span className="text-sm font-bold text-gray-100">エフェクトを選ぶ</span>
					<button
						onClick={onClose}
						className="rounded p-1 text-gray-400 hover:bg-gray-800"
					>
						<X size={18} />
					</button>
				</div>

				<div className="flex-1 space-y-5 overflow-y-auto p-3">
					{CATEGORY_ORDER.map((cat) => {
						const forms = SHAPE_FORMS.filter(
							(f) => MV_SHAPE_FORM_CATEGORY[f] === cat,
						);
						if (forms.length === 0) return null;
						return (
							<div key={cat}>
								<p className="mb-1.5 text-[10px] font-bold text-gray-400">
									{MV_SHAPE_FORM_CATEGORY_LABELS[cat]}
								</p>
								<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
									{forms.map((form) => (
										<button
											key={form}
											onClick={() => {
												onSelect(form);
												onClose();
											}}
											className={`flex flex-col overflow-hidden rounded-lg border text-left transition-colors ${
												value === form
													? "border-blue-500 bg-blue-500/10"
													: "border-gray-700 bg-gray-800/60 hover:bg-gray-800"
											}`}
										>
											<div
												className={`flex h-20 items-center justify-center p-4 sm:h-24 ${
													value === form ? "text-blue-300" : "text-gray-200"
												}`}
											>
												<ShapeFormPreview form={form} />
											</div>
											<div className="border-t border-gray-800/80 bg-gray-900/40 p-2">
												<p
													className={`text-[11px] font-bold ${
														value === form ? "text-blue-200" : "text-gray-100"
													}`}
												>
													{MV_SHAPE_FORM_LABELS[form]}
												</p>
												<p className="mt-0.5 text-[10px] leading-snug text-gray-400">
													{MV_SHAPE_FORM_DESCRIPTIONS[form]}
												</p>
											</div>
										</button>
									))}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
