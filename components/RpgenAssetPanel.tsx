"use client";

import {
	Check,
	ChevronLeft,
	ChevronRight,
	Loader2,
	Play,
	Search,
	Square,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { buildWalkRef } from "@/lib/asset-ref";
import {
	getSoundById,
	getSpriteAnimById,
	type SAnimSheetItem,
	type SAnimSheetMember,
	type SoundItem,
	type SoundSheetItem,
	type SoundSheetMember,
	type SpriteAnimItem,
	sAnimUrl,
	searchSAnimSheets,
	searchSoundSheets,
	searchSounds,
	searchSpriteAnims,
	soundUrl,
} from "@/lib/rpgen-assets";
import type { PickResult } from "./ContentPicker";
import WalkSpritePreview from "./WalkSpritePreview";

type Kind = "walk" | "sound";

interface RpgenAssetPanelProps {
	kind: Kind;
	onPick: (res: PickResult) => void;
	onPlayPreview?: (stopFn: () => void) => void;
}

const PER_PAGE = 48;

// パネルはモーダルの閉じ→開き直しや他タブへの切り替えでアンマウントされるため、検索状態・
// ページ・ドリルイン先をモジュール変数で覚えておき、再訪問時に復元する。walk/sound で別々に保持。
interface AssetCache {
	query: string;
	submitted: string;
	sheets: (SAnimSheetItem | SoundSheetItem)[];
	items: (SpriteAnimItem | SoundItem)[];
	page: number;
	pages: number;
	total: number;
	open: SAnimSheetItem | SoundSheetItem | null;
}
const emptyCache = (): AssetCache => ({
	query: "",
	submitted: "",
	sheets: [],
	items: [],
	page: 1,
	pages: 1,
	total: 0,
	open: null,
});
const caches: Record<Kind, AssetCache> = {
	walk: emptyCache(),
	sound: emptyCache(),
};

// セットのメンバー一覧は `{id}` のみで名前を含まないため、開いたセットのメンバーについて
// 単体詳細(GET /sprite-anims/:id, /sounds/:id)を引いて名前を補完する。kind別に使い回す。
const walkNameCache = new Map<string, string>();
const soundNameCache = new Map<string, string>();

function formatTime(sec: number) {
	if (!sec || isNaN(sec)) return "0:00";
	const m = Math.floor(sec / 60);
	const s = Math.floor(sec % 60);
	return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export default function RpgenAssetPanel({
	kind,
	onPick,
	onPlayPreview,
}: RpgenAssetPanelProps) {
	const cache = caches[kind];
	const [query, setQuery] = useState(cache.query);
	const [submitted, setSubmitted] = useState(cache.submitted);
	const [sheets, setSheets] = useState<(SAnimSheetItem | SoundSheetItem)[]>(
		cache.sheets,
	);
	const [items, setItems] = useState<(SpriteAnimItem | SoundItem)[]>(
		cache.items,
	);
	const [page, setPage] = useState(cache.page);
	const [pages, setPages] = useState(cache.pages);
	const [total, setTotal] = useState(cache.total);
	const [loading, setLoading] = useState(
		cache.sheets.length === 0 && cache.items.length === 0,
	);
	const [error, setError] = useState(false);

	const [open, setOpen] = useState<SAnimSheetItem | SoundSheetItem | null>(
		cache.open,
	);
	const [failedAnimIds, setFailedAnimIds] = useState<Set<string>>(new Set());
	const [previewNo, setPreviewNo] = useState<string | null>(null);
	const [soundCurrentTime, setSoundCurrentTime] = useState(0);
	const [soundDuration, setSoundDuration] = useState(0);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	// 復元直後の1回だけは、キャッシュ済みのデータをそのまま使い、二重取得・重複追加を避ける
	const skipInitialFetch = useRef(
		cache.sheets.length > 0 || cache.items.length > 0,
	);
	// 名前取得が完了するたびに再描画するためだけのカウンタ（実データは walkNameCache/soundNameCache に持つ）
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
	});

	// セットを開いている間、メンバーのうち名前未取得のものだけ単体詳細を引いて補完する
	useEffect(() => {
		if (!open) return;
		const nameCache = kind === "walk" ? walkNameCache : soundNameCache;
		const memberIds =
			kind === "walk"
				? (open as SAnimSheetItem).anim_ids.map((m) => m.id)
				: (open as SoundSheetItem).sound_ids.map((m) => m.id);
		const ids = memberIds.filter((id) => !nameCache.has(id));
		if (ids.length === 0) return;
		const ctrl = new AbortController();
		Promise.all(
			ids.map((id) =>
				(kind === "walk"
					? getSpriteAnimById(id, ctrl.signal)
					: getSoundById(id, ctrl.signal)
				).then((res) => {
					const name =
						kind === "walk"
							? (res as SpriteAnimItem | null)?.name
							: (res as SoundItem | null)?.title;
					if (name) nameCache.set(id, name);
				}),
			),
		).then(() => {
			if (!ctrl.signal.aborted) bumpNames((v) => v + 1);
		});
		return () => ctrl.abort();
	}, [open, kind]);

	// 検索語がある間は「まとめ」名ではなく、素材そのものを名前で検索する
	// （歩行グラ→/api/sprite-anims、効果音→/api/sounds）。検索語が空なら通常通りセット一覧を見る。
	useEffect(() => {
		if (skipInitialFetch.current) {
			skipInitialFetch.current = false;
			return;
		}
		const ctrl = new AbortController();
		setLoading(true);
		setError(false);
		const params = { q: submitted, page, limit: PER_PAGE, signal: ctrl.signal };
		const req = submitted
			? (kind === "walk"
					? searchSpriteAnims(params)
					: searchSounds(params)
				).then((res) => {
					setItems((prev) => (page === 1 ? res.data : [...prev, ...res.data]));
					setPages(res.meta.pages);
					setTotal(res.meta.total);
				})
			: (kind === "walk"
					? searchSAnimSheets(params)
					: searchSoundSheets(params)
				).then((res) => {
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
	}, [kind, submitted, page]);

	useEffect(
		() => () => {
			audioRef.current?.pause();
			audioRef.current = null;
		},
		[],
	);

	const runSearch = () => {
		setPage(1);
		setSubmitted(query.trim());
	};

	const toggleSoundPreview = (id: string) => {
		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current = null;
		}
		if (previewNo === id) {
			setPreviewNo(null);
			return;
		}

		onPlayPreview?.(() => {
			if (audioRef.current) {
				audioRef.current.pause();
				audioRef.current = null;
			}
			setPreviewNo(null);
		});

		const a = new Audio(soundUrl(id));
		a.volume = 0.7;
		a.ontimeupdate = () => setSoundCurrentTime(a.currentTime);
		a.onloadedmetadata = () => setSoundDuration(a.duration);
		a.onended = () => {
			setPreviewNo((cur) => (cur === id ? null : cur));
			setSoundCurrentTime(0);
		};
		a.play().catch(() => {});
		audioRef.current = a;
		setPreviewNo(id);
		setSoundCurrentTime(0);
		setSoundDuration(0);
	};

	const pickWalk = (m: SAnimSheetMember, sheetName: string) => {
		const url = sAnimUrl(m.id);
		onPick({
			ref: buildWalkRef("auto", { kind: "url", url }),
			url,
			label: walkNameCache.get(m.id) || sheetName || `歩行グラ`,
		});
	};

	const pickSound = (m: SoundSheetMember, sheetName: string) =>
		onPick({
			ref: `direct:${soundUrl(m.id)}`,
			url: soundUrl(m.id),
			label: soundNameCache.get(m.id) || sheetName || "SE",
		});

	const pickWalkItem = (item: SpriteAnimItem) => {
		const url = sAnimUrl(item.id);
		onPick({
			ref: buildWalkRef("auto", { kind: "url", url }),
			url,
			label: item.name || "歩行グラ",
		});
	};

	const pickSoundItem = (item: SoundItem) =>
		onPick({
			ref: `direct:${soundUrl(item.id)}`,
			url: soundUrl(item.id),
			label: item.title || "SE",
		});

	const searching = submitted !== "";
	const placeholder =
		kind === "sound"
			? "効果音を検索（例: 攻撃, ジャンプ）"
			: "歩行グラを検索（例: スライム, 兵士）";
	const kindLabel = kind === "sound" ? "効果音セット" : "歩行グラセット";

	// ── セット内容ビュー ──
	if (open) {
		if (kind === "walk") {
			const sheet = open as SAnimSheetItem;
			return (
				<div className="flex flex-col gap-2">
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
								{sheet.name || `セット #${sheet.no}`}
							</p>
							<p className="text-[9px] text-gray-600">
								{sheet.anim_ids.length}個の歩行グラ
								{sheet.comment && sheet.comment !== "なし"
									? ` ・ ${sheet.comment}`
									: ""}
							</p>
						</div>
					</div>
					<div className="grid grid-cols-6 gap-1">
						{sheet.anim_ids
							.filter((m) => !failedAnimIds.has(m.id))
							.map((m, i) => {
								const name = walkNameCache.get(m.id);
								return (
									<button
										key={`${m.id}-${i}`}
										onClick={() => pickWalk(m, sheet.name)}
										title={`${name ?? m.id} (${m.id})`}
										className="aspect-square rounded-lg overflow-hidden border border-gray-700 hover:border-blue-500 bg-[#11131a] relative flex items-center justify-center gimp-checkered-background-white"
									>
										<WalkSpritePreview
											url={sAnimUrl(m.id)}
											size={64}
											onError={() =>
												setFailedAnimIds((prev) => new Set(prev).add(m.id))
											}
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
					{sheet.anim_ids.length === 0 && (
						<p className="text-center text-[11px] text-gray-600 py-8">
							素材がありません
						</p>
					)}
				</div>
			);
		} else {
			const sheet = open as SoundSheetItem;
			return (
				<div className="flex flex-col gap-2">
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
								{sheet.name || `セット #${sheet.no}`}
							</p>
							<p className="text-[9px] text-gray-600">
								{sheet.sound_ids.length}個の効果音
								{sheet.comment && sheet.comment !== "なし"
									? ` ・ ${sheet.comment}`
									: ""}
							</p>
						</div>
					</div>
					<div className="space-y-1.5">
						{sheet.sound_ids.map((m, i) => {
							const name = soundNameCache.get(m.id);
							return (
								<div
									key={`${m.id}-${i}`}
									className="flex items-center gap-2 p-2 rounded-lg border border-gray-700 hover:border-blue-500 bg-gray-900"
								>
									<button
										onClick={() => toggleSoundPreview(m.id)}
										className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${previewNo === m.id ? "bg-red-600/20 text-red-400" : "bg-[#a3e635]/20 text-[#a3e635]"}`}
										title={previewNo === m.id ? "停止" : "試聴"}
									>
										{previewNo === m.id ? (
											<Square size={11} />
										) : (
											<Play size={11} className="ml-0.5" />
										)}
									</button>
									<div className="flex-1 min-w-0">
										<p className="text-[11px] text-gray-200 font-bold truncate">
											{name ?? m.id}
										</p>
										{name && (
											<p className="text-[9px] text-gray-600 font-mono truncate">
												{m.id}
											</p>
										)}
									</div>
									<button
										onClick={() => pickSound(m, sheet.name)}
										className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold shrink-0 flex items-center gap-1"
									>
										<Check size={11} />
										使う
									</button>
								</div>
							);
						})}
					</div>
					{sheet.sound_ids.length === 0 && (
						<p className="text-center text-[11px] text-gray-600 py-8">
							素材がありません
						</p>
					)}
				</div>
			);
		}
	}

	// ── セット一覧ビュー ──
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
						placeholder={placeholder}
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
					<>
						{kind === "walk" ? "歩行グラ" : "効果音"}を検索
						{total > 0 && <> ・{total.toLocaleString()}件</>}
					</>
				) : (
					<>
						{kindLabel}
						{total > 0 && <> ・全{total.toLocaleString()}セット</>}
					</>
				)}
				<span className="text-gray-700">（提供: rpgen-search）</span>
			</p>

			{error ? (
				<p className="text-center text-[11px] text-red-400 py-8">
					読み込みに失敗しました。時間をおいて再検索してください。
				</p>
			) : searching ? (
				<>
					{kind === "walk" ? (
						<div className="grid grid-cols-6 gap-1">
							{(items as SpriteAnimItem[])
								.filter((item) => !failedAnimIds.has(item.id))
								.map((item, i) => (
									<button
										key={`${item.id}-${i}`}
										onClick={() => pickWalkItem(item)}
										title={`${item.name || `#${item.no}`} (${item.id})`}
										className="aspect-square rounded-lg overflow-hidden border border-gray-700 hover:border-blue-500 bg-[#11131a] relative flex items-center justify-center gimp-checkered-background-white"
									>
										<WalkSpritePreview
											url={sAnimUrl(item.id)}
											size={64}
											onError={() =>
												setFailedAnimIds((prev) => new Set(prev).add(item.id))
											}
										/>
										<span className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] text-gray-300 px-0.5 truncate leading-tight">
											{item.name || `#${item.no}`}
										</span>
									</button>
								))}
						</div>
					) : (
						<div className="space-y-1.5">
							{(items as SoundItem[]).map((item, i) => (
								<div
									key={`${item.id}-${i}`}
									className="flex items-center gap-2 p-2 rounded-lg border border-gray-700 hover:border-blue-500 bg-gray-900"
								>
									<button
										onClick={() => toggleSoundPreview(item.id)}
										className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${previewNo === item.id ? "bg-red-600/20 text-red-400" : "bg-[#a3e635]/20 text-[#a3e635]"}`}
										title={previewNo === item.id ? "停止" : "試聴"}
									>
										{previewNo === item.id ? (
											<Square size={11} />
										) : (
											<Play size={11} className="ml-0.5" />
										)}
									</button>
									<div className="flex-1 min-w-0 flex flex-col gap-1">
										<div className="flex items-center justify-between gap-1">
											<p className="text-[11px] text-gray-200 font-bold truncate">
												{item.title || `#${item.no}`}
											</p>
											{previewNo === item.id && soundDuration > 0 && (
												<span className="text-[9px] text-gray-400 font-mono shrink-0">
													{formatTime(soundCurrentTime)} /{" "}
													{formatTime(soundDuration)}
												</span>
											)}
										</div>
										{previewNo === item.id ? (
											<input
												type="range"
												min={0}
												max={soundDuration || 100}
												step={0.1}
												value={soundCurrentTime}
												onChange={(e) => {
													const val = Number(e.target.value);
													if (audioRef.current) {
														audioRef.current.currentTime = val;
														setSoundCurrentTime(val);
													}
												}}
												onClick={(e) => e.stopPropagation()}
												className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#a3e635]"
											/>
										) : (
											<p className="text-[9px] text-gray-600 font-mono truncate">
												{item.id}
											</p>
										)}
									</div>
									<button
										onClick={() => pickSoundItem(item)}
										className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold shrink-0 flex items-center gap-1"
									>
										<Check size={11} />
										使う
									</button>
								</div>
							))}
						</div>
					)}
					{loading && (
						<div className="flex justify-center py-4">
							<Loader2 size={18} className="animate-spin text-gray-500" />
						</div>
					)}
					{!loading && items.length === 0 && (
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
						{kind === "walk"
							? (sheets as SAnimSheetItem[]).map((s) => (
									<button
										key={s.no}
										onClick={() => setOpen(s)}
										className="w-full flex items-center gap-2 p-1.5 rounded-lg border border-gray-700 hover:border-blue-500 bg-gray-900 text-left"
									>
										<div className="flex gap-0.5 shrink-0">
											{s.anim_ids
												.filter((m) => !failedAnimIds.has(m.id))
												.slice(0, 4)
												.map((m, i) => (
													<span
														key={`${m.id}-${i}`}
														className="w-8 h-8 rounded-sm bg-[#11131a] gimp-checkered-background-white overflow-hidden shrink-0 flex items-center justify-center"
													>
														<WalkSpritePreview
															url={sAnimUrl(m.id)}
															size={32}
															onError={() =>
																setFailedAnimIds((prev) =>
																	new Set(prev).add(m.id),
																)
															}
														/>
													</span>
												))}
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-[12px] text-gray-100 font-bold truncate">
												{s.name || `セット #${s.no}`}
											</p>
											<p className="text-[9px] text-gray-600">
												{s.anim_ids.length}個
											</p>
										</div>
										<ChevronRight
											size={15}
											className="text-gray-600 shrink-0"
										/>
									</button>
								))
							: (sheets as SoundSheetItem[]).map((s) => (
									<button
										key={s.no}
										onClick={() => setOpen(s)}
										className="w-full flex items-center gap-2 p-2 rounded-lg border border-gray-700 hover:border-blue-500 bg-gray-900 text-left"
									>
										<div className="flex-1 min-w-0">
											<p className="text-[12px] text-gray-100 font-bold truncate">
												{s.name || `セット #${s.no}`}
											</p>
											<p className="text-[9px] text-gray-600">
												{s.sound_ids.length}個の効果音
												{s.comment && s.comment !== "なし"
													? ` ・ ${s.comment}`
													: ""}
											</p>
										</div>
										<ChevronRight
											size={15}
											className="text-gray-600 shrink-0"
										/>
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
							該当するセットがありません
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
