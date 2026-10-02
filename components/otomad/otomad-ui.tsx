"use client";

// 音MAD エディタの小さな部品と見た目の定数。OtomadMaker と OtomadVisualFields で共有する。
// パネルの見た目は GameMaker の規約（グレーセクション・破線の追加・青の参照ボタン・紫は使わない）。

export const SECTION = "rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 space-y-2";
export const HEADING = "text-[12px] font-bold text-gray-200";
export const SUBHEAD = "text-[10px] font-bold text-gray-400 pt-1.5 mt-1 border-t border-gray-700/50";
export const INPUT = "w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[12px] text-gray-100 outline-none";
export const INPUT_SM = "bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-100 outline-none";
export const BTN_REF = "flex items-center gap-1 rounded border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:text-blue-300 px-2 py-1 text-[11px] disabled:opacity-40";
export const BTN_ADD = "w-full flex items-center justify-center gap-1 rounded border border-dashed border-gray-600 text-gray-400 hover:bg-gray-100/5 py-1.5 text-[11px]";
export const BTN_DEL = "p-1 rounded text-gray-400 hover:text-red-400 hover:bg-red-500/10";
export const BTN_ICON = "p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700/60 disabled:opacity-30";
export const LABEL = "text-[10px] text-gray-400";

/** 数値入力（空欄は undefined にできる）。 */
export function NumField({
	label,
	value,
	onChange,
	step = 0.01,
	min,
	max,
	width = 72,
	allowEmpty,
	suffix,
}: {
	label: string;
	value: number | undefined;
	onChange: (v: number | undefined) => void;
	step?: number;
	min?: number;
	max?: number;
	width?: number;
	allowEmpty?: boolean;
	suffix?: string;
}) {
	return (
		<label className="flex flex-col gap-0.5">
			<span className={LABEL}>{label}</span>
			<span className="flex items-center gap-1">
				<input
					type="number"
					value={value === undefined ? "" : value}
					step={step}
					min={min}
					max={max}
					onChange={(e) => {
						if (e.target.value === "") {
							onChange(allowEmpty ? undefined : (min ?? 0));
							return;
						}
						const n = Number(e.target.value);
						if (Number.isFinite(n)) onChange(n);
					}}
					className={INPUT_SM}
					style={{ width }}
				/>
				{suffix && <span className="text-[10px] text-gray-500">{suffix}</span>}
			</span>
		</label>
	);
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
	return (
		<label className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer select-none">
			<input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="accent-blue-500" />
			{label}
		</label>
	);
}
