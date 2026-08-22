"use client";

import type { DawMode, ModeSwitchInstance } from "@onjmin/dtm";
import {
	Download,
	History,
	Loader2,
	Music,
	Settings,
	Upload,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import HistoryModal from "@/components/HistoryModal";
import VolumeControl from "@/components/VolumeControl";
import { getStudio } from "@/lib/dtm";
import {
	clearAutosave,
	getAutosave,
	getStorageKey,
	saveAutosave,
	saveHistory,
} from "@/lib/history";

interface MmlEditorProps {
	onClose: () => void;
	onSave: (mml: string) => void;
	initialMml?: string;
	isEditing?: boolean;
}

// 再編集時: アドバンスモードで作られたMMLを開いたら自動的にアドバンスモードへ切り替える。
// 判定基準は @onjmin/dtm 側の「シンプルモードで読み込むと上級者モードへの切替を提案する」
// 条件（mergedTrackCount > 0 || meta.mode === 'advanced'）に合わせる。
function detectMode(dtm: typeof import("@onjmin/dtm"), mml?: string): DawMode {
	if (!mml) return "simple";
	try {
		if (dtm.parseMmlMeta(mml).mode === "advanced") return "advanced";
		const { mergedTrackCount } = dtm.parseMML(mml, {
			clampTrackCount: dtm.TRACKS_SIMPLE.length,
		});
		return mergedTrackCount > 0 ? "advanced" : "simple";
	} catch {
		return "simple";
	}
}

// 編集UIは @onjmin/dtm の createDtmStudio().mountModeSwitch() に差し替え。
// mountModeSwitch はシンプル/アドバンスのモード切替UIを差し込み、編集UI（mountEditor）の
// マウント・再マウント（MML引き継ぎ）まで面倒を見る。ピアノロール・楽器プリセット・ドラム・
// MIDI読込・コード進行入力まで全部入り。アプリ側はオーバーレイの枠（キャンセル/投稿）を担当。
//
// 音量まわり: DAWの masterVolume（#volume=）は曲自体が持つ音量として一切加工せず、
// MMLの内容そのままDAWへ渡す・そのまま保存する。サイト全体の音量（読者の好み）は
// getStudio() 内で studio.setMasterVolume() に一本化済みなので、ここでは一切関与しない
// （2つの音量軸を別々に保つことで、loadMML() のたびに片方が失われる事故を避けている）。
export default function MmlEditor({
	onClose,
	onSave,
	initialMml,
	isEditing,
}: MmlEditorProps) {
	const mountRef = useRef<HTMLDivElement>(null);
	const modeSwitchRef = useRef<ModeSwitchInstance | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// History / Autosave state
	const [showHistory, setShowHistory] = useState(false);
	const [hasAutosave, setHasAutosave] = useState(false);
	const [autosaveData, setAutosaveData] = useState<string | null>(null);
	const storageKey = getStorageKey("mml");

	// 設定メニュー（歯車）：履歴・スナップショット／エクスポート・インポート
	const [settingsOpen, setSettingsOpen] = useState(false);
	const settingsRef = useRef<HTMLDivElement>(null);
	const importFileRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (!settingsOpen) return;
		const onDown = (e: MouseEvent) => {
			if (settingsRef.current && !settingsRef.current.contains(e.target as Node))
				setSettingsOpen(false);
		};
		document.addEventListener("mousedown", onDown);
		return () => document.removeEventListener("mousedown", onDown);
	}, [settingsOpen]);

	useEffect(() => {
		let disposed = false;

		Promise.all([getStudio(), import("@onjmin/dtm")])
			.then(([studio, dtm]) => {
				if (disposed) return;
				if (mountRef.current) {
					modeSwitchRef.current = studio.mountModeSwitch(mountRef.current, {
						editorTarget: mountRef.current,
						mode: detectMode(dtm, initialMml),
						position: "prepend",
						editorOptions: {
							...(initialMml ? { initialMML: initialMml } : undefined),
						},
					});
				}
				setLoading(false);
			})
			.catch((e) => {
				console.error("[MmlEditor] getStudio failed", e);
				if (!disposed) {
					setError("音源の読み込みに失敗しました。通信環境をご確認ください。");
					setLoading(false);
				}
			});

		return () => {
			disposed = true;
			try {
				modeSwitchRef.current?.destroy();
			} catch {}
			modeSwitchRef.current = null;
		};
	}, []);

	// Check autosave on mount
	useEffect(() => {
		const autosave = getAutosave<string>(storageKey);
		if (autosave && autosave.data && autosave.data !== initialMml) {
			const data = autosave.data;
			Promise.resolve().then(() => {
				setAutosaveData(data);
				setHasAutosave(true);
			});
		}
	}, [initialMml, storageKey]);

	// Periodic autosave (every 10s) and history snapshot (every 30m)
	useEffect(() => {
		const autosaveInterval = setInterval(() => {
			const daw = modeSwitchRef.current?.getDaw();
			if (!daw) return;
			try {
				const currentMml = daw.getMML()?.minified?.trim();
				if (currentMml) {
					saveAutosave(storageKey, currentMml);
				}
			} catch (e) {
				// ignore if getMML fails during mode switch
			}
		}, 10000);

		const historyInterval = setInterval(() => {
			const daw = modeSwitchRef.current?.getDaw();
			if (!daw) return;
			try {
				const currentMml = daw.getMML()?.minified?.trim();
				if (currentMml) {
					saveHistory(storageKey, currentMml, "mml", 50);
				}
			} catch (e) {
				// ignore
			}
		}, 1800000);

		return () => {
			clearInterval(autosaveInterval);
			clearInterval(historyInterval);
		};
	}, [storageKey]);

	const handleRestoreAutosave = () => {
		if (!autosaveData) return;
		const daw = modeSwitchRef.current?.getDaw();
		if (daw) {
			try {
				daw.loadMML(autosaveData);
			} catch (e) {
				console.error("Failed to load autosaved MML", e);
			}
		}
		setHasAutosave(false);
		clearAutosave(storageKey);
	};

	const handleIgnoreAutosave = () => {
		setHasAutosave(false);
		clearAutosave(storageKey);
	};

	const handleRestoreHistory = (restoredMml: string) => {
		const daw = modeSwitchRef.current?.getDaw();
		if (daw) {
			try {
				daw.loadMML(restoredMml);
			} catch (e) {
				console.error("Failed to load MML history", e);
			}
		}
	};

	const handleExport = () => {
		const daw = modeSwitchRef.current?.getDaw();
		if (!daw) return;
		let mml: string | null = null;
		try {
			mml = daw.getMML()?.minified?.trim() || null;
		} catch (e) {
			mml = null;
		}
		if (!mml) return;
		const blob = new Blob([mml], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "mml.mml";
		a.click();
		URL.revokeObjectURL(url);
	};

	const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			const text = (ev.target?.result as string)?.trim();
			if (!text) return;
			const daw = modeSwitchRef.current?.getDaw();
			if (!daw) return;
			try {
				daw.loadMML(text);
			} catch (err) {
				console.error("Failed to load imported MML", err);
				alert("MMLの読み込みに失敗しました。ファイルの内容をご確認ください。");
			}
		};
		reader.readAsText(file);
		e.target.value = "";
	};

	const getCurrentMml = () => {
		const daw = modeSwitchRef.current?.getDaw();
		if (!daw) return null;
		try {
			return daw.getMML()?.minified?.trim() || null;
		} catch (e) {
			return null;
		}
	};

	const handleSave = useCallback(() => {
		// モード切替で daw が差し替わるため、現在の DawInstance を都度取得する。
		const daw = modeSwitchRef.current?.getDaw();
		if (!daw) return;
		const mml = daw.getMML().minified.trim();
		if (mml) {
			saveHistory(storageKey, mml, "mml", 50);
			// Clear autosave on manual save/post
			clearAutosave(storageKey);
			onSave(mml);
		}
	}, [onSave, storageKey]);

	return (
		<div className="fixed inset-0 bg-[#0b0e14] z-50 flex flex-col select-none">
			<div className="flex items-center px-3.5 py-2.5 border-b border-gray-800 shrink-0 bg-[#0b0e14]">
				<button
					onClick={onClose}
					className="mr-2 text-gray-400 hover:bg-gray-100/10 p-1.5 rounded transition-colors"
				>
					<X size={20} />
				</button>
				<span className="font-bold text-xs text-gray-300">キャンセル</span>
				<span className="text-gray-600 mx-1.5 text-[10px]">›</span>
				<span className="text-gray-400 text-xs">MML作曲エディタ</span>
				<div className="flex-1" />

				<div className="mr-2">
					<VolumeControl />
				</div>

				{/* 設定ボタン & ドロップダウン */}
				<div className="relative mr-2" ref={settingsRef}>
					<button
						onClick={() => setSettingsOpen((v) => !v)}
						disabled={loading || !!error}
						className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
							settingsOpen
								? "bg-gray-700 text-white"
								: "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
						}`}
						title="設定"
					>
						<Settings size={14} />
					</button>
					<input
						ref={importFileRef}
						type="file"
						accept=".mml,.txt"
						className="hidden"
						onChange={handleImport}
					/>
					{settingsOpen && (
						<div className="absolute right-0 top-full mt-1 z-[100] w-52 bg-[#161622] border border-gray-700 shadow-2xl p-2 rounded-lg space-y-1">
							<button
								onClick={() => {
									setShowHistory(true);
									setSettingsOpen(false);
								}}
								className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white rounded transition"
							>
								<History size={13} />
								<span>履歴・スナップショット</span>
							</button>
							<div className="border-t border-gray-800 my-1" />
							<button
								onClick={() => {
									handleExport();
									setSettingsOpen(false);
								}}
								className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white rounded transition"
							>
								<Download size={13} />
								<span>データをエクスポート (.mml)</span>
							</button>
							<button
								onClick={() => {
									importFileRef.current?.click();
									setSettingsOpen(false);
								}}
								className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white rounded transition"
							>
								<Upload size={13} />
								<span>データをインポート (.mml)</span>
							</button>
						</div>
					)}
				</div>

				<button
					onClick={handleSave}
					disabled={loading || !!error}
					className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 px-3.5 rounded-lg text-[11px] disabled:opacity-50 flex items-center space-x-1.5 transition-colors"
				>
					<Music size={13} /> <span>{isEditing ? "再編集" : "投稿"}</span>
				</button>
			</div>

			{hasAutosave && (
				<div className="bg-yellow-600/20 border-b border-yellow-800/30 px-4 py-2 flex items-center justify-between text-xs text-yellow-200 shrink-0">
					<span className="flex items-center gap-1.5">
						⚠️ 未保存のデータ（自動保存）があります。復元しますか？
					</span>
					<div className="flex gap-2">
						<button
							onClick={handleRestoreAutosave}
							className="bg-yellow-600 hover:bg-yellow-500 text-gray-900 font-bold px-3 py-1 rounded text-[10px] active:scale-95 transition-transform"
						>
							復元する
						</button>
						<button
							onClick={handleIgnoreAutosave}
							className="text-gray-400 hover:text-gray-200 px-2 py-1 rounded text-[10px]"
						>
							無視
						</button>
					</div>
				</div>
			)}

			<div className="flex-1 overflow-auto bg-[#0a0c12] relative">
				<div ref={mountRef} />
				{loading && (
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-400 pointer-events-none">
						<Loader2 size={28} className="animate-spin" />
						<span className="text-xs">音源を読み込み中…</span>
					</div>
				)}
				{error && (
					<div className="absolute inset-0 flex items-center justify-center px-8 text-center text-xs text-red-400">
						{error}
					</div>
				)}
			</div>

			<HistoryModal
				isOpen={showHistory}
				onClose={() => setShowHistory(false)}
				storageKey={storageKey}
				type="mml"
				onRestore={handleRestoreHistory}
				getCurrentData={getCurrentMml}
			/>
		</div>
	);
}
