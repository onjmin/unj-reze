"use client";

import { Check, Pause, Play, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
	applyMasterVolume,
	subscribeMasterVolume,
	subscribeMuted,
} from "@/lib/master-volume";
import { OshiItem, OshiItemKind } from "@/lib/types";

interface MusicShareModalProps {
	userSlug: string;
	oshiItems: OshiItem[];
	onAdd: (item: OshiItem) => void;
	onRemove: (id: string) => void;
	onClose: () => void;
}

interface AppleMusicResult {
	trackId?: number;
	collectionId?: number;
	artistId?: number;
	trackName?: string;
	collectionName?: string;
	artistName?: string;
	artworkUrl100?: string;
	trackViewUrl?: string;
	collectionViewUrl?: string;
	artistViewUrl?: string;
	previewUrl?: string;
}

const TABS: {
	id: OshiItemKind;
	entity: "song" | "album" | "musicArtist";
	label: string;
}[] = [
	{ id: "song", entity: "song", label: "曲" },
	{ id: "album", entity: "album", label: "アルバム" },
	{ id: "artist", entity: "musicArtist", label: "アーティスト" },
];

function resultToItem(
	kind: OshiItemKind,
	r: AppleMusicResult,
): {
	kind: OshiItemKind;
	trackId?: number;
	collectionId?: number;
	artistId?: number;
	title: string;
	subtitle?: string;
	artworkUrl?: string;
	viewUrl?: string;
	previewUrl?: string;
} {
	if (kind === "song") {
		return {
			kind,
			trackId: r.trackId,
			title: r.trackName || "",
			subtitle: `${r.artistName || ""} · ${r.collectionName || ""}`,
			artworkUrl: r.artworkUrl100,
			viewUrl: r.trackViewUrl,
			previewUrl: r.previewUrl,
		};
	}
	if (kind === "album") {
		return {
			kind,
			collectionId: r.collectionId,
			title: r.collectionName || "",
			subtitle: r.artistName,
			artworkUrl: r.artworkUrl100,
			viewUrl: r.collectionViewUrl,
			previewUrl: r.previewUrl,
		};
	}
	return {
		kind,
		artistId: r.artistId,
		title: r.artistName || "",
		subtitle: "アーティスト",
		artworkUrl: r.artworkUrl100,
		viewUrl: r.artistViewUrl,
	};
}

function matchKey(kind: OshiItemKind, r: AppleMusicResult): string {
	if (kind === "song") return `song:${r.trackId}`;
	if (kind === "album") return `album:${r.collectionId}`;
	return `artist:${r.artistId}`;
}

function itemKey(item: OshiItem): string {
	if (item.kind === "song") return `song:${item.trackId}`;
	if (item.kind === "album") return `album:${item.collectionId}`;
	return `artist:${item.artistId}`;
}

export default function MusicShareModal({
	userSlug,
	oshiItems,
	onAdd,
	onRemove,
	onClose,
}: MusicShareModalProps) {
	const [activeTab, setActiveTab] = useState<OshiItemKind>("song");
	const [term, setTerm] = useState("");
	const [results, setResults] = useState<AppleMusicResult[]>([]);
	const [loading, setLoading] = useState(false);
	const [pendingKey, setPendingKey] = useState<string | null>(null);
	const [playingUrl, setPlayingUrl] = useState<string | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const entity = TABS.find((t) => t.id === activeTab)!.entity;
	const addedKeys = new Set(oshiItems.map(itemKey));

	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		if (!term.trim()) {
			Promise.resolve().then(() => setResults([]));
			return;
		}
		Promise.resolve().then(() => {
			setLoading(true);
			debounceRef.current = setTimeout(() => {
				api.music
					.search(term.trim(), entity)
					.then((data) => setResults(data.results || []))
					.catch(() => setResults([]))
					.finally(() => setLoading(false));
			}, 350);
		});
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [term, entity]);

	useEffect(
		() => () => {
			audioRef.current?.pause();
		},
		[],
	);

	// マスター音量/ミュートの変更を再生中のプレビューへ即時反映する。
	useEffect(() => {
		const applyVolume = () => {
			if (audioRef.current)
				audioRef.current.volume = applyMasterVolume(100) / 100;
		};
		const unsubVolume = subscribeMasterVolume(applyVolume);
		const unsubMuted = subscribeMuted(applyVolume);
		return () => {
			unsubVolume();
			unsubMuted();
		};
	}, []);

	const togglePreview = (url?: string) => {
		if (!url) return;
		if (playingUrl === url) {
			audioRef.current?.pause();
			setPlayingUrl(null);
			return;
		}
		audioRef.current?.pause();
		const audio = new Audio(url);
		audio.volume = applyMasterVolume(100) / 100;
		audio.play().catch(() => {});
		audio.onended = () => setPlayingUrl(null);
		audioRef.current = audio;
		setPlayingUrl(url);
	};

	const handleToggleOshi = async (r: AppleMusicResult) => {
		const key = matchKey(activeTab, r);
		const existing = oshiItems.find((o) => itemKey(o) === key);
		setPendingKey(key);
		try {
			if (existing) {
				await api.oshi.remove(userSlug, existing.id);
				onRemove(existing.id);
			} else {
				const data = resultToItem(activeTab, r);
				const created = await api.oshi.add(userSlug, data);
				onAdd(created);
			}
		} catch {
		} finally {
			setPendingKey(null);
		}
	};

	return (
		<div
			className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto bg-black/70 backdrop-blur-sm p-3 pt-6"
			onClick={(e) => e.stopPropagation()}
		>
			<div className="relative w-full max-w-md bg-[#0b0e14] rounded-2xl border border-gray-800 shadow-2xl flex flex-col animate-fade-in-up max-h-[calc(100vh-3rem)]">
				<div className="p-4 border-b border-gray-800 flex justify-between items-center shrink-0">
					<span className="font-bold text-sm text-gray-200">Music を共有</span>
					<button
						onClick={onClose}
						className="text-gray-400 hover:text-white transition-colors"
					>
						<X size={18} />
					</button>
				</div>

				<div className="flex px-3 pt-3 gap-4 border-b border-gray-800 shrink-0">
					{TABS.map((t) => (
						<button
							key={t.id}
							onClick={() => setActiveTab(t.id)}
							className={`pb-2.5 text-sm font-bold transition-colors border-b-2 ${activeTab === t.id ? "text-pink-500 border-pink-500" : "text-gray-500 border-transparent hover:text-gray-300"}`}
						>
							{t.label}
						</button>
					))}
				</div>

				<div className="p-3 shrink-0">
					<div className="relative">
						<Search
							size={14}
							className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
						/>
						<input
							type="text"
							value={term}
							onChange={(e) => setTerm(e.target.value)}
							placeholder="曲名・アーティスト名で検索"
							className="w-full bg-gray-900 border border-gray-800 focus:border-pink-500 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-gray-600 outline-none transition-colors"
						/>
						{term && (
							<button
								onClick={() => setTerm("")}
								className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
							>
								<X size={13} />
							</button>
						)}
					</div>
				</div>

				<div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5 min-h-[240px]">
					{loading && (
						<div className="text-center text-[11px] text-gray-600 py-6">
							検索中...
						</div>
					)}
					{!loading && term.trim() && results.length === 0 && (
						<div className="text-center text-[11px] text-gray-600 py-6">
							見つかりませんでした
						</div>
					)}
					{!loading &&
						results.map((r, i) => {
							const key = matchKey(activeTab, r);
							const isAdded = addedKeys.has(key);
							const isPending = pendingKey === key;
							const artwork = r.artworkUrl100;
							const title =
								activeTab === "artist"
									? r.artistName
									: activeTab === "album"
										? r.collectionName
										: r.trackName;
							const subtitle =
								activeTab === "artist"
									? "アーティスト"
									: activeTab === "album"
										? r.artistName
										: `${r.artistName || ""} · ${r.collectionName || ""}`;
							return (
								<div
									key={`${key}-${i}`}
									className="flex items-center gap-2.5 px-1.5 py-2 rounded-lg hover:bg-gray-100/5 transition-colors"
								>
									<div className="relative w-11 h-11 rounded-lg overflow-hidden bg-gray-800 shrink-0">
										{artwork && (
											<img
												src={artwork}
												alt={title || ""}
												className="w-full h-full object-cover"
											/>
										)}
										{activeTab !== "artist" && r.previewUrl && (
											<button
												onClick={() => togglePreview(r.previewUrl)}
												className="absolute inset-0 bg-black/40 flex items-center justify-center text-white hover:bg-black/60 transition-colors"
											>
												{playingUrl === r.previewUrl ? (
													<Pause size={14} />
												) : (
													<Play size={14} />
												)}
											</button>
										)}
									</div>
									<div className="flex-1 min-w-0">
										<div className="text-xs text-gray-200 font-bold truncate">
											{title}
										</div>
										<div className="text-[10px] text-gray-500 truncate">
											{subtitle}
										</div>
									</div>
									<button
										onClick={() => handleToggleOshi(r)}
										disabled={isPending}
										className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors disabled:opacity-50 flex items-center gap-1 ${
											isAdded
												? "bg-gray-700 text-gray-300"
												: "bg-pink-600 text-white hover:bg-pink-500"
										}`}
									>
										{isAdded && <Check size={11} />}
										{isAdded ? "済" : "推し"}
									</button>
								</div>
							);
						})}
				</div>
			</div>
		</div>
	);
}
