"use client";

import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	getSpriteById,
	type SpriteItem,
	type SpriteSheetItem,
	type SpriteSheetMember,
	searchSpriteSheets,
	searchSprites,
	spriteUrl,
} from "@/lib/rpgen-assets";
import type { PickResult } from "./ContentPicker";

interface SpriteSheetBrowserProps {
	onPick: (res: PickResult) => void;
}

const SHEETS_PER_PAGE = 24;
const SPRITES_PER_CHUNK = 120;

// パネルはモーダルの閉じ→開き直しや他タブへの切り替えでアンマウントされるため、検索状態・
// ページ・ドリルイン先・スクロール展開数をモジュール変数で覚えておき、再訪問時に復元する。
interface BrowserCache {
	query: string;
	submitted: string;
	sheets: SpriteSheetItem[];
	items: SpriteItem[];
	page: number;
	pages: number;
	total: number;
	open: SpriteSheetItem | null;
	shown: number;
}
const cache: BrowserCache = {
	query: "",
	submitted: "",
	sheets: [],
	items: [],
	page: 1,
	pages: 1,
	total: 0,
	open: null,
	shown: SPRITES_PER_CHUNK,
};

// シートのメンバー一覧は `{id}` のみで名前を含まないため、開いたシートの表示中メンバーについて
// 単体詳細(GET /sprites/:id)を引いて名前を補完する。id→name はセッション中使い回す。
const spriteNameCache = new Map<string, string>();

// 素材タブ: 人間がまとめた「スプライトシート（カテゴリ）」を2段階で辿る。
//  一覧（名前つきカテゴリ） → タップ → 中の素材を密なグリッドで選ぶ。
// 16pxドット絵は pixelated 拡大してセルいっぱいに表示し、余白を詰める。
export default function SpriteSheetBrowser({
	onPick,
}: SpriteSheetBrowserProps) {
	const [query, setQuery] = useState(cache.query);
	const [submitted, setSubmitted] = useState(cache.submitted);
	const [sheets, setSheets] = useState<SpriteSheetItem[]>(cache.sheets);
	const [items, setItems] = useState<SpriteItem[]>(cache.items);
	const [page, setPage] = useState(cache.page);
	const [pages, setPages] = useState(cache.pages);
	const [total, setTotal] = useState(cache.total);
	const [loading, setLoading] = useState(
		cache.sheets.length === 0 && cache.items.length === 0,
	);
	const [error, setError] = useState(false);

	const [open, setOpen] = useState<SpriteSheetItem | null>(cache.open);
	const [shown, setShown] = useState(cache.shown);
	const [failedSpriteIds, setFailedSpriteIds] = useState<Set<string>>(
		new Set(),
	);
	const scrollRef = useRef<HTMLDivElement>(null);
	// 復元直後の1回だけは、キャッシュ済みのデータをそのまま使い、二重取得・重複追加を避ける
	const skipInitialFetch = useRef(
		cache.sheets.length > 0 || cache.items.length > 0,
	);
	// 名前取得が完了するたびに再描画するためだけのカウンタ（実データは spriteNameCache に持つ）
	const [, bumpNames] = useState(0);

	useEffect(() => {
		cache.query = query;
		cache.submitted = submitted;
		cache.sheets = sheets;
		cache.items = items;
		cache.page = page;
		cache.pages = pages;
		cache.total = total;
		cache.open = open;
		cache.shown = shown;
	});

	// シートを開いている間、表示中メンバーのうち名前未取得のものだけ単体詳細を引いて補完する
	useEffect(() => {
		if (!open) return;
		const ids = open.sprite_ids
			.slice(0, shown)
			.map((m) => m.id)
			.filter((id) => !spriteNameCache.has(id));
		if (ids.length === 0) return;
		const ctrl = new AbortController();
		Promise.all(
			ids.map((id) =>
				getSpriteById(id, ctrl.signal).then((res) => {
					if (res?.name) spriteNameCache.set(id, res.name);
				}),
			),
		).then(() => {
			if (!ctrl.signal.aborted) bumpNames((v) => v + 1);
		});
		return () => ctrl.abort();
	}, [open, shown]);

	// 検索語がある間は「まとめ」名ではなく、素材そのものを名前で検索する（/api/sprites）。
	// 検索語が空のときは、人がまとめたスプライトシート一覧を通常通りブラウズする。
	useEffect(() => {
		if (skipInitialFetch.current) {
			skipInitialFetch.current = false;
			return;
		}
		const ctrl = new AbortController();
		setLoading(true);
		setError(false);
		const req = submitted
			? searchSprites({
					q: submitted,
					page,
					limit: SHEETS_PER_PAGE,
					signal: ctrl.signal,
				}).then((res) => {
					setItems((prev) => (page === 1 ? res.data : [...prev, ...res.data]));
					setPages(res.meta.pages);
					setTotal(res.meta.total);
				})
			: searchSpriteSheets({
					q: submitted,
					page,
					limit: SHEETS_PER_PAGE,
					signal: ctrl.signal,
				}).then((res) => {
					setSheets((prev) => (page === 1 ? res.data : [...prev, ...res.data]));
					setPages(res.meta.pages);
					setTotal(res.meta.total);
				});
		req
			.catch((e) => {
				if (e?.name !== "AbortError") setError(true);
			})
			.finally(() => setLoading(false));
		return () => ctrl.abort();
	}, [submitted, page]);

	const runSearch = () => {
		setPage(1);
		setSubmitted(query.trim());
	};

	const openSheet = (s: SpriteSheetItem) => {
		setOpen(s);
		setShown(SPRITES_PER_CHUNK);
		scrollRef.current?.scrollTo(0, 0);
	};

	const pick = (m: SpriteSheetMember, sheetName: string) =>
		onPick({
			ref: `url:${spriteUrl(m.id)}`,
			url: spriteUrl(m.id),
			label: spriteNameCache.get(m.id) || sheetName || `素材 (${m.id})`,
		});

	const pickItem = (item: SpriteItem) =>
		onPick({
			ref: `url:${spriteUrl(item.id)}`,
			url: spriteUrl(item.id),
			label: item.name || `素材 #${item.no}`,
		});

	// ── 詳細（シート内の素材グリッド） ──
	if (open) {
		const ids = open.sprite_ids;
		const visible = ids.slice(0, shown);
		return (
			<div className="flex flex-col gap-2" ref={scrollRef}>
				{/* 親スクロール領域の p-3 を打ち消して -mx-3/-mt-3 で埋め、sticky時に隙間なく張り付くようにする */}
				<div className="flex items-center gap-2 sticky -top-3 -mx-3 -mt-3 px-3 pt-3 pb-1 bg-[#0b0e14] z-10">
					<button
						onClick={() => setOpen(null)}
						className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-[11px] font-bold shrink-0"
					>
						<ChevronLeft size={13} />
						一覧
					</button>
					<div className="min-w-0">
						<p className="text-[12px] text-gray-100 font-bold truncate">
							{open.name || `シート #${open.no}`}
						</p>
						<p className="text-[9px] text-gray-600">
							{ids.length}個の素材
							{open.comment && open.comment !== "なし"
								? ` ・ ${open.comment}`
								: ""}
						</p>
					</div>
				</div>
				<div className="grid grid-cols-6 gap-1">
					{visible
						.filter((m) => !failedSpriteIds.has(m.id))
						.map((m, i) => {
							const name = spriteNameCache.get(m.id);
							return (
								<button
									key={`${m.id}-${i}`}
									onClick={() => pick(m, open.name)}
									className="aspect-square rounded border border-gray-800 hover:border-blue-500 bg-[#11131a] gimp-checkered-background-white relative group"
									title={`${name ?? m.id} (${m.id})`}
								>
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img
										src={spriteUrl(m.id)}
										alt=""
										onError={() =>
											setFailedSpriteIds((prev) => new Set(prev).add(m.id))
										}
										className="w-full h-full object-contain p-px"
										style={{ imageRendering: "pixelated" }}
										loading="lazy"
									/>
									{name && (
										<span className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] text-gray-300 px-0.5 truncate leading-tight">
											{name}
										</span>
									)}
								</button>
							);
						})}
				</div>
				{shown < ids.length && (
					<button
						onClick={() => setShown((s) => s + SPRITES_PER_CHUNK)}
						className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-bold"
					>
						もっと見る（{visible.length} / {ids.length}）
					</button>
				)}
			</div>
		);
	}

	// ── 一覧（カテゴリブラウズ、または検索語での素材そのもの検索） ──
	const searching = submitted !== "";
	return (
		<div className="flex flex-col gap-2">
			<div className="flex gap-1.5">
				<div className="relative flex-1">
					<Search
						size={13}
						className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500"
					/>
					<input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") runSearch();
						}}
						placeholder="素材名で検索（例: スライム, 剣）"
						className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-7 pr-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
					/>
				</div>
				<button
					onClick={runSearch}
					className="px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shrink-0"
				>
					検索
				</button>
			</div>
			<p className="text-[10px] text-gray-600 px-0.5">
				{searching ? (
					<>素材を検索{total > 0 && <> ・{total}件</>}</>
				) : (
					<>人がまとめた素材集{total > 0 && <> ・{total}まとめ</>}</>
				)}
				<span className="text-gray-700">（提供: rpgen-search）</span>
			</p>

			{error ? (
				<p className="text-center text-[11px] text-red-400 py-8">
					読み込みに失敗しました。時間をおいて再検索してください。
				</p>
			) : searching ? (
				<>
					<div className="grid grid-cols-6 gap-1">
						{items
							.filter((item) => !failedSpriteIds.has(item.id))
							.map((item, i) => (
								<button
									key={`${item.id}-${i}`}
									onClick={() => pickItem(item)}
									title={`${item.name || `#${item.no}`} (${item.id})`}
									className="aspect-square rounded border border-gray-800 hover:border-blue-500 bg-[#11131a] gimp-checkered-background-white relative group"
								>
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img
										src={spriteUrl(item.id)}
										alt=""
										onError={() =>
											setFailedSpriteIds((prev) => new Set(prev).add(item.id))
										}
										className="w-full h-full object-contain p-px"
										style={{ imageRendering: "pixelated" }}
										loading="lazy"
									/>
									<span className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] text-gray-300 px-0.5 truncate leading-tight">
										{item.name || `#${item.no}`}
									</span>
								</button>
							))}
					</div>
					{loading && (
						<div className="flex justify-center py-4">
							<Loader2 size={18} className="animate-spin text-gray-500" />
						</div>
					)}
					{!loading &&
						items.filter((item) => !failedSpriteIds.has(item.id)).length ===
							0 && (
							<p className="text-center text-[11px] text-gray-600 py-8">
								該当する素材がありません
							</p>
						)}
					{!loading && page < pages && (
						<button
							onClick={() => setPage((p) => p + 1)}
							className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-bold"
						>
							もっと見る（{items.length} / {total}）
						</button>
					)}
				</>
			) : (
				<>
					<div className="space-y-1.5">
						{sheets.map((s) => (
							<button
								key={s.no}
								onClick={() => openSheet(s)}
								className="w-full flex items-center gap-2 p-1.5 rounded-lg border border-gray-700 hover:border-blue-500 bg-gray-900 text-left"
							>
								<div className="flex gap-0.5 shrink-0">
									{s.sprite_ids
										.filter((m) => !failedSpriteIds.has(m.id))
										.slice(0, 5)
										.map((m, i) => (
											<span
												key={`${m.id}-${i}`}
												className="w-7 h-7 rounded-sm bg-[#11131a] gimp-checkered-background-white overflow-hidden shrink-0"
											>
												{/* eslint-disable-next-line @next/next/no-img-element */}
												<img
													src={spriteUrl(m.id)}
													alt=""
													onError={() =>
														setFailedSpriteIds((prev) =>
															new Set(prev).add(m.id),
														)
													}
													className="w-full h-full object-contain"
													style={{ imageRendering: "pixelated" }}
													loading="lazy"
												/>
											</span>
										))}
								</div>
								<div className="flex-1 min-w-0">
									<p className="text-[12px] text-gray-100 font-bold truncate">
										{s.name || `シート #${s.no}`}
									</p>
									<p className="text-[9px] text-gray-600">
										{s.sprite_ids.length}個
									</p>
								</div>
								<ChevronRight size={15} className="text-gray-600 shrink-0" />
							</button>
						))}
					</div>
					{loading && (
						<div className="flex justify-center py-4">
							<Loader2 size={18} className="animate-spin text-gray-500" />
						</div>
					)}
					{!loading && sheets.length === 0 && (
						<p className="text-center text-[11px] text-gray-600 py-8">
							該当するまとめがありません
						</p>
					)}
					{!loading && page < pages && (
						<button
							onClick={() => setPage((p) => p + 1)}
							className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-bold"
						>
							もっと見る（{page} / {pages}）
						</button>
					)}
				</>
			)}
		</div>
	);
}
