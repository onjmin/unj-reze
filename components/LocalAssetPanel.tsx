"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { buildWalkRef } from "@/lib/asset-ref";
import {
	DQ_CHARACTERS,
	LOCAL_TILE_SHEETS,
	type LocalMvSprite,
	type LocalTileSheet,
	localTileUrl,
	MV_LOCAL_SPRITES,
	mvSpriteRef,
} from "@/lib/local-assets";
import { loadImage } from "@/lib/walk-sprite";
import type { PickResult } from "./ContentPicker";
import WalkSpritePreview from "./WalkSpritePreview";

interface LocalAssetPanelProps {
	onPick: (res: PickResult) => void;
}

const TILES_PER_CHUNK = 160;

// パネル自体はモーダルの閉じ→開き直しで毎回アンマウントされるため、選んでいたサブタブを
// モジュール変数で覚えておき、再度開いたときも同じサブタブ（キャラ/各シート）を表示する。
let lastLocalSection = "mv";

// 内蔵素材タブ: リポジトリ同梱のスプライトシート（MV素材 + DQ風キャラ + 16pxタイルセット）。
export default function LocalAssetPanel({ onPick }: LocalAssetPanelProps) {
	const [section, setSectionState] = useState<string>(lastLocalSection);
	const [failedChars, setFailedChars] = useState<Set<number>>(new Set());
	const setSection = (s: string) => {
		lastLocalSection = s;
		setSectionState(s);
	};

	const secBtn = (active: boolean) =>
		`shrink-0 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${active ? "bg-blue-600 text-white border-blue-500" : "bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800"}`;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap gap-1.5">
				<button
					className={secBtn(section === "mv")}
					onClick={() => setSection("mv")}
				>
					MV素材
				</button>
				<button
					className={secBtn(section === "chars")}
					onClick={() => setSection("chars")}
				>
					キャラ
				</button>
				{LOCAL_TILE_SHEETS.map((s) => (
					<button
						key={s.id}
						className={secBtn(section === s.id)}
						onClick={() => setSection(s.id)}
					>
						{s.name}
					</button>
				))}
			</div>

			{section === "mv" ? (
				<MvSpriteGrid onPick={onPick} />
			) : section === "chars" ? (
				<>
					<p className="text-[10px] text-gray-600 px-0.5">
						DQ風キャラ（RPGEN 16px・2フレーム×4方向）
					</p>
					<div className="grid grid-cols-6 gap-1.5">
						{DQ_CHARACTERS.filter((c) => !failedChars.has(c.surface)).map(
							(c) => (
								<button
									key={c.surface}
									onClick={() =>
										onPick({
											ref: buildWalkRef("rpgen", { kind: "url", url: c.url }),
											url: c.url,
											label: c.name,
										})
									}
									className="pixel-select-hover flex flex-col items-center gap-1 p-1.5 rounded-lg border border-gray-800 hover:border-blue-500 bg-[#11131a] gimp-checkered-background group"
								>
									<WalkSpritePreview
										url={c.url}
										stdId="rpgen"
										size={44}
										onError={() =>
											setFailedChars((prev) => new Set(prev).add(c.surface))
										}
									/>
									<span className="text-[9px] font-bold text-gray-400 group-hover:text-blue-400 truncate w-full text-center">
										{c.name}
									</span>
								</button>
							),
						)}
					</div>
				</>
			) : (
				<LocalTileGrid
					key={section}
					sheet={LOCAL_TILE_SHEETS.find((s) => s.id === section)!}
					onPick={onPick}
				/>
			)}
		</div>
	);
}

/**
 * MV用アニメ素材の一覧。1行＝1アニメーションのシートは行ごとに1つのコマとして並べる。
 * サムネはストリップの先頭コマを CSS で切り出して出す（Canvas を使わないので軽い）。
 */
function MvSpriteGrid({ onPick }: { onPick: (res: PickResult) => void }) {
	const groups = [...new Set(MV_LOCAL_SPRITES.map((s) => s.group))];
	return (
		<div className="flex flex-col gap-3">
			<p className="px-0.5 text-[10px] text-gray-600">
				MV用のアニメ素材（1行＝1つの動き）。コマ送りは曲のテンポに合わせて回ります。
			</p>
			{groups.map((g) => (
				<div key={g} className="flex flex-col gap-1.5">
					<p className="px-0.5 text-[10px] font-bold text-gray-500">{g}</p>
					<div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
						{MV_LOCAL_SPRITES.filter((s) => s.group === g).flatMap((s) =>
							Array.from({ length: s.rows ?? 1 }, (_, row) => (
								<MvSpriteButton
									key={`${s.id}-${row}`}
									sprite={s}
									row={row}
									onPick={onPick}
								/>
							)),
						)}
					</div>
				</div>
			))}
		</div>
	);
}

function MvSpriteButton({
	sprite,
	row,
	onPick,
}: {
	sprite: LocalMvSprite;
	row: number;
	onPick: (res: PickResult) => void;
}) {
	const label =
		(sprite.rows ?? 1) > 1 ? `${sprite.name} ${row + 1}` : sprite.name;
	const box = 48;
	const zoom = box / Math.max(sprite.cellW, sprite.cellH);
	return (
		<button
			onClick={() =>
				onPick({ ref: mvSpriteRef(sprite, row), url: sprite.url, label })
			}
			className="pixel-select-hover group flex flex-col items-center gap-1 rounded-lg border border-gray-800 bg-[#11131a] p-1.5 hover:border-blue-500"
		>
			<span
				className="block shrink-0 overflow-hidden"
				style={{ width: box, height: box }}
			>
				<span
					className="block"
					style={{
						width: sprite.cellW * sprite.frames * zoom,
						height: sprite.cellH * (sprite.rows ?? 1) * zoom,
						backgroundImage: `url(${sprite.url})`,
						backgroundSize: "100% 100%",
						imageRendering: "pixelated",
						transform: `translate(0px, ${-row * sprite.cellH * zoom}px)`,
					}}
				/>
			</span>
			<span className="w-full truncate text-center text-[9px] font-bold text-gray-400 group-hover:text-blue-400">
				{label}
			</span>
		</button>
	);
}

interface Cell {
	idx: number;
	/** 非透明ピクセルを含む実タイルか（false は整列維持用のプレースホルダー、選択不可）。 */
	opaque: boolean;
}

// シートごとの走査結果（見出しバナー行を除く全マス、opaqueフラグ付き）をキャッシュ（パネル開閉で再スキャンしない）
const cellsCache = new Map<string, Cell[]>();
// シートごとのフィルタ選択状態をキャッシュ（モーダルの閉じ→開き直しでも選択を保持する）
const activeSectionsCache = new Map<string, Set<number>>();

/** sections（見出しバナー行の一覧）から、各セクションが担当する実タイル行の範囲 [start, end] を求める。
 *  次のセクションの見出し行の手前、または（最後のセクションなら）シート末尾までがそのセクションの範囲。 */
function sectionRanges(sheet: LocalTileSheet) {
	const sections = sheet.sections ?? [];
	return sections.map((sec, i) => ({
		row: sec.row,
		label: sec.label,
		start: sec.row + 1,
		end: (sections[i + 1]?.row ?? sheet.rows) - 1,
	}));
}

/** シートを16pxグリッドで走査し、非透明ピクセルを含むマスだけをタップ選択できるグリッドで出す。
 *  シート切り替えは親が key で作り直すため、状態リセットは初期値だけで済む。 */
function LocalTileGrid({
	sheet,
	onPick,
}: {
	sheet: LocalTileSheet;
	onPick: (res: PickResult) => void;
}) {
	const [cells, setCells] = useState<Cell[] | null>(
		() => cellsCache.get(sheet.id) ?? null,
	);
	const [shown, setShown] = useState(TILES_PER_CHUNK);
	const [error, setError] = useState(false);

	const ranges = sectionRanges(sheet);
	// 初期値は先頭セクション（仮設置用）のみアクティブ。キャッシュ済みならその選択状態を復元する。
	const [active, setActive] = useState<Set<number>>(() => {
		const cached = activeSectionsCache.get(sheet.id);
		if (cached) return new Set(cached);
		return new Set(ranges.length > 0 ? [ranges[0].row] : []);
	});

	const toggleSection = (row: number) => {
		setActive((prev) => {
			const next = new Set(prev);
			if (next.has(row)) next.delete(row);
			else next.add(row);
			activeSectionsCache.set(sheet.id, next);
			return next;
		});
		setShown(TILES_PER_CHUNK);
	};

	useEffect(() => {
		if (cellsCache.has(sheet.id)) return;
		let cancelled = false;
		// 見出しバナー行（sheet.sections）はタイルではなく作者による区切り線なので走査対象から除外する
		const bannerRows = new Set(sheet.sections?.map((s) => s.row));
		loadImage(sheet.url)
			.then((img) => {
				if (cancelled) return;
				const canvas = document.createElement("canvas");
				canvas.width = img.naturalWidth;
				canvas.height = img.naturalHeight;
				const ctx = canvas.getContext("2d", { willReadFrequently: true });
				if (!ctx) throw new Error("no 2d context");
				ctx.drawImage(img, 0, 0);
				const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
				const t = sheet.tile;

				const isOpaque = (col: number, row: number) => {
					for (let y = row * t; y < (row + 1) * t; y++) {
						const base = (y * canvas.width + col * t) * 4;
						for (let x = 0; x < t; x++) {
							if (data[base + x * 4 + 3] > 0) return true;
						}
					}
					return false;
				};

				// FNV-1a 32bit: マス内の全ピクセル(RGBA)から内容ハッシュを求める。
				// hideIdenticalBlockRows 判定（1行 = ブロック幅ぶんが全て同じチップか）にのみ使う。
				const cellHash = (col: number, row: number) => {
					let hash = 0x811c9dc5;
					for (let y = row * t; y < (row + 1) * t; y++) {
						const base = (y * canvas.width + col * t) * 4;
						for (let x = 0; x < t * 4; x++) {
							hash ^= data[base + x];
							hash = Math.imul(hash, 0x01000193);
						}
					}
					return hash;
				};

				// 透明マスも Cell として含める（opaque: false）。空マスだけを丸ごと省くと、行の途中で
				// 詰まって見た目の列が崩れる（表示グリッドの列位置とシート上の実際の並びがズレる）ため、
				// 整列維持用のプレースホルダーとして枠だけ残す。
				const found: Cell[] = [];
				const blockW = sheet.scanBlockWidth;
				if (blockW && blockW > 0) {
					// 列ブロック優先走査: 列 [0..blockW) を全行分down方向に並べてから次のブロックへ進む
					for (let colStart = 0; colStart < sheet.cols; colStart += blockW) {
						const colEnd = Math.min(colStart + blockW, sheet.cols);
						for (let row = 0; row < sheet.rows; row++) {
							if (bannerRows.has(row)) continue;
							// ブロック内の1行（colEnd-colStart 個）が全て同一チップなら、行ごと丸ごと除外する。
							// ブロック幅ちょうどの塊で間引くので、他の行・他のブロックの列位置はズレない。
							if (sheet.hideIdenticalBlockRows && colEnd - colStart > 1) {
								const firstHash = cellHash(colStart, row);
								let allSame = true;
								for (let col = colStart + 1; col < colEnd; col++) {
									if (cellHash(col, row) !== firstHash) {
										allSame = false;
										break;
									}
								}
								if (allSame) continue;
							}
							for (let col = colStart; col < colEnd; col++) {
								found.push({
									idx: row * sheet.cols + col,
									opaque: isOpaque(col, row),
								});
							}
						}
					}
				} else {
					// 既定: 行優先走査
					for (let row = 0; row < sheet.rows; row++) {
						if (bannerRows.has(row)) continue;
						for (let col = 0; col < sheet.cols; col++) {
							found.push({
								idx: row * sheet.cols + col,
								opaque: isOpaque(col, row),
							});
						}
					}
				}
				cellsCache.set(sheet.id, found);
				if (!cancelled) setCells(found);
			})
			.catch(() => {
				if (!cancelled) setError(true);
			});
		return () => {
			cancelled = true;
		};
	}, [sheet]);

	if (error)
		return (
			<p className="text-center text-[11px] text-red-400 py-8">
				シートの読み込みに失敗しました
			</p>
		);
	if (!cells)
		return (
			<div className="flex justify-center py-8">
				<Loader2 size={18} className="animate-spin text-gray-500" />
			</div>
		);

	// セクション見出しがあるシートは、アクティブなセクションの行範囲に入るマスだけに絞り込む
	// （プレースホルダーも含めて絞り込む＝セクション境界でも整列は崩れない）
	const filteredCells =
		ranges.length > 0
			? cells.filter((c) => {
					const row = (c.idx / sheet.cols) | 0;
					return ranges.some(
						(rg) => active.has(rg.row) && row >= rg.start && row <= rg.end,
					);
				})
			: cells;

	const totalTiles = filteredCells.reduce((n, c) => n + (c.opaque ? 1 : 0), 0);

	// 実タイルが `shown` 個に達するまでを表示（途中のプレースホルダーも整列のため道連れで含める）。
	// showAllAtOnce のシートはページネーションせず最初から全マスを表示する。
	let visible: Cell[] = filteredCells;
	if (!sheet.showAllAtOnce) {
		let count = 0;
		let i = 0;
		for (; i < filteredCells.length; i++) {
			if (filteredCells[i].opaque) count++;
			if (count >= shown) {
				i++;
				break;
			}
		}
		visible = filteredCells.slice(0, i);
	}
	const visibleTiles = visible.reduce((n, c) => n + (c.opaque ? 1 : 0), 0);

	const pick = (idx: number) => {
		const col = idx % sheet.cols;
		const row = (idx / sheet.cols) | 0;
		const url = localTileUrl(sheet, col, row);
		onPick({ ref: `url:${url}`, url, label: `${sheet.name} (${col},${row})` });
	};

	return (
		<div className="flex flex-col gap-2">
			<p className="text-[10px] text-gray-600 px-0.5">
				{sheet.name} ・ 全{totalTiles}マス（16px）
			</p>
			{ranges.length > 0 && (
				<div className="flex gap-1 flex-wrap px-0.5">
					{ranges.map((rg) => {
						const isActive = active.has(rg.row);
						return (
							<button
								key={rg.row}
								onClick={() => toggleSection(rg.row)}
								className={`shrink-0 whitespace-nowrap px-2 py-1 rounded-md border text-[10px] font-bold transition ${
									isActive
										? "bg-blue-600 text-white border-blue-500"
										: "bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800"
								}`}
							>
								▼{rg.label}
							</button>
						);
					})}
				</div>
			)}
			<div
				className="grid gap-1"
				style={{
					gridTemplateColumns: `repeat(${sheet.scanBlockWidth ?? 8}, minmax(0, 1fr))`,
				}}
			>
				{visible.map((c) => {
					const col = c.idx % sheet.cols;
					const row = (c.idx / sheet.cols) | 0;
					if (!c.opaque) {
						// 整列維持用のプレースホルダー（選択不可・非表示）
						return <div key={c.idx} className="aspect-square" />;
					}
					return (
						<button
							key={c.idx}
							onClick={() => pick(c.idx)}
							title={`(${col},${row})`}
							className="pixel-select-hover aspect-square rounded border border-gray-800 hover:border-blue-500 bg-[#11131a] gimp-checkered-background"
						>
							<div
								className="w-full h-full overflow-hidden"
								style={{
									backgroundImage: `url(${sheet.url})`,
									backgroundSize: `${sheet.cols * 100}% ${sheet.rows * 100}%`,
									backgroundPosition: `${sheet.cols > 1 ? (col / (sheet.cols - 1)) * 100 : 0}% ${sheet.rows > 1 ? (row / (sheet.rows - 1)) * 100 : 0}%`,
									imageRendering: "pixelated",
								}}
							/>
						</button>
					);
				})}
				{visibleTiles === 0 && (
					<p
						className="text-center text-[11px] text-gray-600 py-8"
						style={{ gridColumn: `span ${sheet.scanBlockWidth ?? 8}` }}
					>
						セクションを選択してください
					</p>
				)}
			</div>
			{!sheet.showAllAtOnce && shown < totalTiles && (
				<button
					onClick={() => setShown((s) => s + TILES_PER_CHUNK)}
					className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-bold"
				>
					もっと見る（{visibleTiles} / {totalTiles}）
				</button>
			)}
		</div>
	);
}
