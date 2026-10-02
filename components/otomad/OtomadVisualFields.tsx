"use client";

// トラックの「窓（映像）」の設定 UI。トラックタブ（base）と場面タブ（場面ごとの上書き）で同じものを使う。
// 設計: docs/otomad-feature-design.md §8 / §10。

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
	createDefaultSlot,
	flipModeOf,
	generateSlots,
	OTOMAD_H,
	OTOMAD_HIT_STYLES,
	OTOMAD_W,
	OTOMAD_WINDOW_SHAPES,
	type OtomadFlipMode,
	type OtomadHitStyle,
	type OtomadMirror,
	type OtomadSlot,
	type OtomadSlotLayout,
	type OtomadTrackVisual,
	type OtomadWindowShape,
} from "@/lib/otomad/otomad-config";
import { BTN_ADD, BTN_DEL, BTN_REF, INPUT_SM, LABEL, NumField, Toggle } from "./otomad-ui";

export interface OtomadVisualFieldsProps {
	visual: OtomadTrackVisual;
	onChange: (fn: (v: OtomadTrackVisual) => OtomadTrackVisual) => void;
	/** この MML トラックの最大同時発音数（「数＝同時発音数」ボタン用）。 */
	maxPolyphony?: number;
	/** 選択中の窓（プレビューの枠と連動）。 */
	selectedSlot?: number | null;
	onSelectSlot?: (i: number) => void;
	/** 「表示（窓を出す／出さない）」のセレクトを出す。場面の上書きでは「非表示」を別に持つので出さない。 */
	showKind?: boolean;
}

export default function OtomadVisualFields({ visual: v, onChange, maxPolyphony, selectedSlot, onSelectSlot, showKind = true }: OtomadVisualFieldsProps) {
	const [layoutGen, setLayoutGen] = useState<{ layout: OtomadSlotLayout; count: number; size: number; gap: number }>({ layout: "row", count: 4, size: 120, gap: 8 });
	const set = (patch: Partial<OtomadTrackVisual>) => onChange((x) => ({ ...x, ...patch }));
	const updateSlot = (si: number, patch: Partial<OtomadSlot>) => onChange((x) => ({ ...x, slots: x.slots.map((s, i) => (i === si ? { ...s, ...patch } : s)) }));

	return (
		<>
			<div className="flex flex-wrap items-end gap-2">
				{showKind && (
					<label className="flex flex-col gap-0.5">
						<span className={LABEL}>表示</span>
						<select value={v.kind} onChange={(e) => set({ kind: e.target.value as "window" | "none" })} className={INPUT_SM}>
							<option value="window">窓を出す</option>
							<option value="none">出さない（音だけ）</option>
						</select>
					</label>
				)}
				{v.kind === "window" && (
					<>
						<label className="flex flex-col gap-0.5">
							<span className={LABEL}>いつまで出す</span>
							<select value={v.show} onChange={(e) => set({ show: e.target.value as OtomadTrackVisual["show"] })} className={INPUT_SM}>
								<option value="note">鳴っている間</option>
								<option value="untilNext">次の音まで</option>
								<option value="hold">出しっぱなし</option>
							</select>
						</label>
						<label className="flex flex-col gap-0.5">
							<span className={LABEL}>窓の選び方（複数のとき）</span>
							<select value={v.pick} onChange={(e) => set({ pick: e.target.value as OtomadTrackVisual["pick"] })} className={INPUT_SM}>
								<option value="cycle">順番に</option>
								<option value="pitch">音の高さで</option>
								<option value="velocity">強さで</option>
								<option value="random">ランダム</option>
								<option value="voice">和音の声部ごと（低い順に固定）</option>
							</select>
						</label>
						<label className="flex flex-col gap-0.5">
							<span className={LABEL}>形</span>
							<select value={v.shape ?? "rect"} onChange={(e) => set({ shape: e.target.value as OtomadWindowShape })} className={INPUT_SM}>
								{OTOMAD_WINDOW_SHAPES.map((s) => (
									<option key={s.value} value={s.value}>
										{s.label}
									</option>
								))}
							</select>
						</label>
						<label className="flex flex-col gap-0.5">
							<span className={LABEL}>収め方</span>
							<select value={v.fit ?? "cover"} onChange={(e) => set({ fit: e.target.value as "cover" | "contain" })} className={INPUT_SM}>
								<option value="cover">窓を埋める（端を切る）</option>
								<option value="contain">全体を収める</option>
							</select>
						</label>
						<label className="flex flex-col gap-0.5">
							<span className={LABEL}>鏡像の複製</span>
							<select value={v.mirror ?? "none"} onChange={(e) => set({ mirror: e.target.value as OtomadMirror })} className={INPUT_SM}>
								<option value="none">なし</option>
								<option value="horizontal">左右対称にもう 1 つ</option>
								<option value="vertical">上下対称にもう 1 つ</option>
								<option value="quad">四方に（計 4 つ）</option>
							</select>
						</label>
						<label className="flex flex-col gap-0.5">
							<span className={LABEL}>左右反転</span>
							<select value={flipModeOf(v)} onChange={(e) => set({ flipMode: e.target.value as OtomadFlipMode, flipAlternate: e.target.value === "alternate" })} className={INPUT_SM}>
								<option value="alternate">奇数番の音で（定番）</option>
								<option value="changed">窓の音が変わったとき</option>
								<option value="none">しない</option>
							</select>
						</label>
						<label className="flex flex-col gap-0.5">
							<span className={LABEL}>音の頭の演出</span>
							<select value={v.hitStyle ?? "zoom"} onChange={(e) => set({ hitStyle: e.target.value as OtomadHitStyle })} className={INPUT_SM}>
								{OTOMAD_HIT_STYLES.map((h) => (
									<option key={h.value} value={h.value}>
										{h.label}
									</option>
								))}
							</select>
						</label>
						<NumField label="演出の強さ（1〜1.5）" value={v.hitZoom} onChange={(n) => set({ hitZoom: Math.max(1, Math.min(1.5, n ?? 1)) })} step={0.01} min={1} max={1.5} width={60} />
						<Toggle label="演出は変わった窓だけ" value={!!v.hitOnlyChanged} onChange={(b) => set({ hitOnlyChanged: b })} />
						<Toggle label="強さで薄くする（v→不透明度）" value={!!v.velocityToOpacity} onChange={(b) => set({ velocityToOpacity: b })} />
						<NumField label="音程で上下（px/半音）" value={v.pitchY} onChange={(n) => set({ pitchY: n ?? 0 })} step={1} min={-30} max={30} width={60} />
						<Toggle label="音符の長さに合わせて早回し" value={v.stretch} onChange={(b) => set({ stretch: b })} />
						<Toggle label="縁取り" value={!!v.frame} onChange={(b) => set({ frame: b ? { color: "#ffffff", width: 4 } : undefined })} />
						{v.frame && (
							<>
								<label className="flex flex-col gap-0.5">
									<span className={LABEL}>縁の色</span>
									<input type="color" value={v.frame.color} onChange={(e) => set({ frame: { ...v.frame!, color: e.target.value } })} className="h-7 w-10 bg-transparent" />
								</label>
								<NumField label="縁の太さ" value={v.frame.width} onChange={(n) => set({ frame: { ...v.frame!, width: Math.max(1, n ?? 4) } })} step={1} min={1} max={40} width={50} />
							</>
						)}
						<NumField label="拍で脈打つ（0〜0.5）" value={v.beatPulse ?? 0} onChange={(n) => set({ beatPulse: n || undefined })} step={0.02} min={0} max={0.5} width={55} />
						<NumField label="窓全体を回す（度/拍）" value={v.orbitDegPerBeat ?? 0} onChange={(n) => set({ orbitDegPerBeat: n || undefined })} step={5} min={-360} max={360} width={60} />
						<NumField label="流す X（px/拍）" value={v.scrollPerBeat?.x ?? 0} onChange={(n) => set({ scrollPerBeat: n || v.scrollPerBeat?.y ? { x: n ?? 0, y: v.scrollPerBeat?.y ?? 0 } : undefined })} step={5} width={55} />
						<NumField label="流す Y（px/拍）" value={v.scrollPerBeat?.y ?? 0} onChange={(n) => set({ scrollPerBeat: n || v.scrollPerBeat?.x ? { x: v.scrollPerBeat?.x ?? 0, y: n ?? 0 } : undefined })} step={5} width={55} />
						<NumField label="重なり順（z）" value={v.z} onChange={(n) => set({ z: n ?? 0 })} step={1} min={-10} max={10} width={50} />
						<NumField label="不透明度" value={v.opacity} onChange={(n) => set({ opacity: Math.max(0, Math.min(1, n ?? 1)) })} step={0.05} min={0} max={1} width={55} />
					</>
				)}
			</div>
			{v.kind === "window" && (
				<div className="space-y-1">
					{v.slots.map((s, si) => (
						<div
							key={si}
							className={`flex flex-wrap items-end gap-2 rounded px-1.5 py-1 ${selectedSlot === si ? "bg-blue-500/10" : ""}`}
							onClick={(e) => {
								e.stopPropagation();
								onSelectSlot?.(si);
							}}
						>
							<span className="text-[10px] text-gray-400 w-7">#{si + 1}</span>
							<NumField label="X" value={s.x} onChange={(n) => updateSlot(si, { x: n ?? 0 })} step={1} width={55} />
							<NumField label="Y" value={s.y} onChange={(n) => updateSlot(si, { y: n ?? 0 })} step={1} width={55} />
							<NumField label="幅" value={s.w} onChange={(n) => updateSlot(si, { w: Math.max(8, n ?? 8) })} step={1} min={8} width={55} />
							<NumField label="高さ" value={s.h} onChange={(n) => updateSlot(si, { h: Math.max(8, n ?? 8) })} step={1} min={8} width={55} />
							<NumField label="回転" value={s.rotate ?? 0} onChange={(n) => updateSlot(si, { rotate: n ?? 0 })} step={1} width={50} />
							<button type="button" onClick={() => updateSlot(si, { x: OTOMAD_W - s.x })} className={BTN_REF} title="左右対称の位置へ">
								左右対称
							</button>
							<button type="button" onClick={() => onChange((x) => ({ ...x, slots: x.slots.filter((_, i) => i !== si) }))} disabled={v.slots.length <= 1} className={BTN_DEL}>
								<Trash2 size={13} />
							</button>
						</div>
					))}
					<div className="flex flex-wrap items-end gap-2 rounded border border-dashed border-gray-700 px-2 py-1.5">
						<span className="text-[10px] text-gray-400 w-full">窓を並べる（和音の構成音ぶん、または画面いっぱいの敷き詰め。選び方「声部ごと」で各構成音が同じ窓に固定される）</span>
						<label className="flex flex-col gap-0.5">
							<span className={LABEL}>並べ方</span>
							<select value={layoutGen.layout} onChange={(e) => setLayoutGen({ ...layoutGen, layout: e.target.value as OtomadSlotLayout })} className={INPUT_SM}>
								<option value="row">横一列</option>
								<option value="column">縦一列</option>
								<option value="grid">正方形（格子）</option>
								<option value="hexgrid">蜂の巣（半分ずらし）</option>
								<option value="circle">円</option>
								<option value="tile">画面いっぱいに敷き詰め</option>
							</select>
						</label>
						<NumField label="数" value={layoutGen.count} onChange={(n) => setLayoutGen({ ...layoutGen, count: Math.max(1, Math.min(64, n ?? 4)) })} step={1} min={1} max={64} width={50} />
						<NumField label="一辺（px）" value={layoutGen.size} onChange={(n) => setLayoutGen({ ...layoutGen, size: Math.max(8, n ?? 120) })} step={4} min={8} width={60} />
						<NumField label="間隔" value={layoutGen.gap} onChange={(n) => setLayoutGen({ ...layoutGen, gap: Math.max(0, n ?? 8) })} step={2} min={0} width={50} />
						<button
							type="button"
							onClick={() => {
								const c = v.slots[0] ? { x: v.slots[0].x, y: v.slots[0].y } : undefined;
								onChange((x) => ({ ...x, slots: generateSlots(layoutGen.layout, layoutGen.count, layoutGen.size, c, layoutGen.gap), pick: x.pick === "cycle" && layoutGen.layout !== "tile" ? "voice" : x.pick }));
							}}
							className={BTN_REF}
						>
							並べる（いまの窓を置き換え）
						</button>
						{maxPolyphony !== undefined && (
							<button type="button" onClick={() => setLayoutGen({ ...layoutGen, count: maxPolyphony })} className={BTN_REF} title="この MML トラックで同時に鳴る音の最大数を「数」に入れる">
								数＝同時発音数（{maxPolyphony}）
							</button>
						)}
					</div>
					<button
						type="button"
						onClick={() =>
							onChange((x) => {
								const last = x.slots[x.slots.length - 1] ?? createDefaultSlot();
								return { ...x, slots: [...x.slots, { ...last, x: Math.min(OTOMAD_W - 20, last.x + 40), y: Math.min(OTOMAD_H - 20, last.y + 24) }] };
							})
						}
						className={BTN_ADD}
					>
						<Plus size={11} /> 窓を追加（音符ごとに巡回）
					</button>
				</div>
			)}
		</>
	);
}
