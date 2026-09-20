"use client";

// かけあい動画のエディタ。設計: docs/talk-video-feature-design.md §6
//
// 画面は 3 枚だけ（台本 / キャラ / 見た目）。MvMaker は流用せず小さく作る。
// パネルの見た目は GameMaker の規約（グレーセクション・破線の追加・青の参照ボタン・紫は使わない）に合わせる。

import { ChevronDown, ChevronUp, Image as ImageIcon, Play, Plus, Save, Square, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ContentPicker, { type PickResult } from "@/components/ContentPicker";
import TalkPlayer from "@/components/TalkPlayer";
import { buildPsdRef, imageRefToUrl, isPsdRef, parseRef, walkRefFrameCrop } from "@/lib/asset-ref";
import { getStudio } from "@/lib/dtm";
import { DEFAULT_VOICE_MODEL, loadVoiceModelGroups, VOICE_STYLES, type VoiceModelGroup } from "@/lib/game-voice";
import { clearAutosave, getAutosave, getStorageKey, saveAutosave, saveHistory } from "@/lib/history";
import { DEFAULT_MV_BLINK } from "@/lib/mv-blink";
import type { MvAssetRef, MvVowel } from "@/lib/mv-config";
import { listPsdLayerPaths, type PsdLayerInfo } from "@/lib/mv-psd";
import { planTalkCues, registerTalkVoicebanks } from "@/lib/talk-audio";
import {
	createDefaultTalkStage,
	DEFAULT_TALK_GAP_SEC,
	emotionForExpression,
	TALK_EXPRESSIONS,
	TALK_W,
	type TalkCharacter,
	type TalkCue,
	talkCustomVoiceKey,
	type TalkExpression,
	type TalkManifest,
	type TalkStyle,
} from "@/lib/talk-config";

export interface TalkMakerProps {
	onClose: () => void;
	onSave: (data: { manifest: TalkManifest; title: string }) => void;
	userId: string;
	initialManifest?: TalkManifest;
	isEditing?: boolean;
	/** 既存の投稿を編集しているときの talks.id（作業履歴のスコープ）。未指定は "new"。 */
	talkId?: string;
}

const SECTION = "rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 space-y-2";
const HEADING = "text-[12px] font-bold text-gray-200";
const SUBHEAD = "text-[10px] font-bold text-gray-400 pt-1.5 mt-1 border-t border-gray-700/50";
const INPUT = "w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[12px] text-gray-100 outline-none";
const BTN_REF = "flex items-center gap-1 rounded border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:text-blue-300 px-2 py-1 text-[11px]";
const BTN_ADD = "w-full flex items-center justify-center gap-1 rounded border border-dashed border-gray-600 text-gray-400 hover:bg-gray-100/5 py-1.5 text-[11px]";
const BTN_DEL = "p-1 rounded text-gray-400 hover:text-red-400 hover:bg-red-500/10";
const BTN_ICON = "p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700/60 disabled:opacity-30";

type Tab = "script" | "chars" | "look";

/** 参照先のフィールド（ContentPicker の結果を入れる先）。 */
type PickTarget =
	| { kind: "bg" }
	| { kind: "face"; charId: string; expression: TalkExpression }
	| { kind: "eyes"; charId: string; which: "open" | "closed" }
	| { kind: "mouth"; charId: string; which: "open" | "closed" | MvVowel };

/** 音源の選択肢のうち「カスタム音源を追加…」を表す値（dtm の DAW と同じ見た目にする）。 */
const CUSTOM_VOICE_ADD = "+custom";

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

export const createDefaultTalkManifest = (): TalkManifest => ({
	version: 1,
	title: "",
	stage: createDefaultTalkStage(),
	characters: [
		{
			id: "a",
			name: "ボケ",
			color: "#f9a8d4",
			side: "left",
			scale: 1,
			y: 0,
			faces: { neutral: { ref: "emoji:🐱" }, happy: { ref: "emoji:😸" }, sad: { ref: "emoji:😿" }, angry: { ref: "emoji:😾" }, surprised: { ref: "emoji:🙀" } },
			voice: { model: DEFAULT_VOICE_MODEL, style: "lively" },
		},
		{
			id: "b",
			name: "ツッコミ",
			color: "#93c5fd",
			side: "right",
			scale: 1,
			y: 0,
			flipH: true,
			faces: { neutral: { ref: "emoji:🐶" }, happy: { ref: "emoji:🐕" }, angry: { ref: "emoji:🐺" } },
			voice: { model: "teto", pitchOffset: -2, style: "calm" },
		},
	],
	cues: [
		{ id: newId("c"), speaker: "a", text: "" },
		{ id: newId("c"), speaker: "b", text: "" },
	],
});

/** 参照のサムネ（絵文字はそのまま、画像は img、psd は文字）。 */
function RefThumb({ asset, size = 40 }: { asset?: MvAssetRef; size?: number }) {
	if (!asset) {
		return <div className="rounded border border-dashed border-gray-700 bg-gray-800/60" style={{ width: size, height: size }} />;
	}
	const parsed = parseRef(asset.ref);
	if (parsed?.scheme === "emoji") {
		return (
			<div className="rounded border border-gray-700 bg-gray-800 flex items-center justify-center" style={{ width: size, height: size, fontSize: size * 0.6 }}>
				{parsed.value}
			</div>
		);
	}
	if (isPsdRef(asset.ref)) {
		return (
			<div className="rounded border border-gray-700 bg-gray-800 flex items-center justify-center text-[10px] text-gray-300" style={{ width: size, height: size }}>
				psd
			</div>
		);
	}
	const url = asset.url ?? imageRefToUrl(asset.ref);
	if (!url) {
		return <div className="rounded border border-gray-700 bg-gray-800" style={{ width: size, height: size }} />;
	}
	// eslint-disable-next-line @next/next/no-img-element
	return <img src={url} alt="" className="rounded border border-gray-700 bg-gray-800 object-contain" style={{ width: size, height: size, imageRendering: "pixelated" }} />;
}

export default function TalkMaker({ onClose, onSave, userId, initialManifest, isEditing, talkId }: TalkMakerProps) {
	const [manifest, setManifest] = useState<TalkManifest>(() => initialManifest ?? createDefaultTalkManifest());
	const [tab, setTab] = useState<Tab>("script");
	const [picker, setPicker] = useState<PickTarget | null>(null);
	const [voiceGroups, setVoiceGroups] = useState<VoiceModelGroup[] | null>(null);
	const [measuring, setMeasuring] = useState(false);
	const [speakingCueId, setSpeakingCueId] = useState<string | null>(null);
	const speakRef = useRef<{ stop: () => void } | null>(null);
	const storageKey = useMemo(() => getStorageKey("talk", talkId), [talkId]);
	const restoredRef = useRef(false);

	// 音源名
	useEffect(() => {
		let alive = true;
		loadVoiceModelGroups().then((g) => { if (alive) setVoiceGroups(g); }).catch(() => {});
		return () => { alive = false; };
	}, []);

	// 自動保存の復元（新規作成時だけ）と保存
	useEffect(() => {
		if (initialManifest || restoredRef.current) return;
		restoredRef.current = true;
		void getAutosave<TalkManifest>(storageKey).then((saved) => {
			if (saved?.data?.version === 1 && saved.data.cues.length > 0) setManifest(saved.data);
		});
	}, [initialManifest, storageKey]);
	useEffect(() => {
		const t = setTimeout(() => void saveAutosave(storageKey, manifest), 800);
		return () => clearTimeout(t);
	}, [manifest, storageKey]);

	const stopSpeak = useCallback(() => {
		speakRef.current?.stop();
		speakRef.current = null;
		setSpeakingCueId(null);
	}, []);
	useEffect(() => () => stopSpeak(), [stopSpeak]);

	// ── 更新ヘルパ ──
	const update = useCallback((patch: Partial<TalkManifest>) => setManifest((m) => ({ ...m, ...patch })), []);
	const updateChar = useCallback((id: string, fn: (c: TalkCharacter) => TalkCharacter) => {
		setManifest((m) => ({ ...m, characters: m.characters.map((c) => (c.id === id ? fn(c) : c)) }));
	}, []);
	const updateCue = useCallback((id: string, patch: Partial<TalkCue>) => {
		setManifest((m) => ({ ...m, cues: m.cues.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
	}, []);
	const moveCue = (index: number, dir: -1 | 1) => {
		setManifest((m) => {
			const next = [...m.cues];
			const j = index + dir;
			if (j < 0 || j >= next.length) return m;
			[next[index], next[j]] = [next[j], next[index]];
			return { ...m, cues: next };
		});
	};
	const removeCue = (id: string) => setManifest((m) => ({ ...m, cues: m.cues.filter((c) => c.id !== id) }));
	const addCue = (afterIndex?: number) => {
		setManifest((m) => {
			const prev = afterIndex !== undefined ? m.cues[afterIndex] : m.cues[m.cues.length - 1];
			// 直前の行と別の話者を既定にする（掛け合いなので交互が普通）
			const other = m.characters.find((c) => c.id !== prev?.speaker) ?? m.characters[0];
			const cue: TalkCue = { id: newId("c"), speaker: other?.id ?? "", text: "" };
			const next = [...m.cues];
			next.splice(afterIndex !== undefined ? afterIndex + 1 : next.length, 0, cue);
			return { ...m, cues: next };
		});
	};

	// ── 参照の受け取り ──
	const handlePick = (result: PickResult) => {
		const target = picker;
		setPicker(null);
		if (!target) return;
		const crop = walkRefFrameCrop(result.ref, 0);
		const asset: MvAssetRef = { ref: result.ref, url: result.url, ...(crop ? { crop } : {}) };
		applyAsset(target, asset);
	};
	const applyAsset = (target: PickTarget, asset: MvAssetRef) => {
		if (target.kind === "bg") {
			update({ stage: { ...manifest.stage, bg: asset } });
			return;
		}
		updateChar(target.charId, (c) => {
			if (target.kind === "face") return { ...c, faces: { ...c.faces, [target.expression]: asset } };
			if (target.kind === "eyes") {
				const eyes = c.eyes ?? { open: asset, closed: asset, blink: { ...DEFAULT_MV_BLINK, enabled: true, seed: Math.floor(Math.random() * 1000) } };
				return { ...c, eyes: { ...eyes, [target.which]: asset } };
			}
			const mouth = c.mouth ?? { closed: asset, open: asset };
			if (target.which === "open" || target.which === "closed") return { ...c, mouth: { ...mouth, [target.which]: asset } };
			return { ...c, mouth: { ...mouth, vowels: { ...mouth.vowels, [target.which]: asset } } };
		});
	};

	// ── 試聴 ──
	const speakCue = async (cue: TalkCue) => {
		if (speakingCueId === cue.id) { stopSpeak(); return; }
		stopSpeak();
		const ch = manifest.characters.find((c) => c.id === cue.speaker);
		const text = cue.text.trim();
		if (!ch || !text) return;
		setSpeakingCueId(cue.id);
		const abort = new AbortController();
		speakRef.current = { stop: () => abort.abort() };
		try {
			await registerTalkVoicebanks(manifest);
			const studio = await getStudio();
			const h = await studio.speak(text, {
				model: ch.voice.model,
				pitchOffset: ch.voice.pitchOffset ?? 0,
				style: ch.voice.style ?? "neutral",
				emotion: cue.emotion ?? emotionForExpression(cue.expression),
				signal: abort.signal,
			});
			if (!h) { if (!abort.signal.aborted) stopSpeak(); return; }
			speakRef.current = { stop: () => { abort.abort(); h.stop(); } };
			updateCue(cue.id, { measuredSec: Math.round(h.durationSec * 10) / 10 });
			void h.ended.then(() => setSpeakingCueId((cur) => (cur === cue.id ? null : cur)));
		} catch {
			stopSpeak();
		}
	};

	/** 全行の長さを計る（measuredSec を埋める。読み上げはしない）。 */
	const measureAll = async () => {
		setMeasuring(true);
		try {
			const plans = await planTalkCues(manifest);
			setManifest((m) => ({
				...m,
				cues: m.cues.map((c) => {
					const p = plans.get(c.id);
					return p ? { ...c, measuredSec: Math.round(p.durationSec * 10) / 10 } : c;
				}),
			}));
		} finally {
			setMeasuring(false);
		}
	};

	// 全行の長さが計れているときだけ合計を出す（未計測の行があると当てにならない）。
	const measuredAll = manifest.cues.length > 0 && manifest.cues.every((c) => c.measuredSec !== undefined || !c.text.trim());
	const totalSec = measuredAll
		? manifest.cues.reduce((s, c) => s + (c.measuredSec ?? 0) + (c.gapSec ?? DEFAULT_TALK_GAP_SEC), 0)
		: 0;

	// ── 保存 ──
	const handleSave = () => {
		stopSpeak();
		const title = manifest.title.trim() || "無題のかけあい動画";
		const cues = manifest.cues.filter((c) => c.text.trim());
		const finalManifest: TalkManifest = { ...manifest, title, cues };
		void saveHistory(storageKey, finalManifest, "talk", 30);
		void clearAutosave(storageKey);
		onSave({ manifest: finalManifest, title });
	};

	const charById = (id: string) => manifest.characters.find((c) => c.id === id);

	return (
		<div className="fixed inset-0 z-[100] bg-gray-950 text-gray-100 flex flex-col">
			{/* ヘッダー */}
			<div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-800 bg-gray-900/80">
				<button type="button" onClick={onClose} className={BTN_ICON} title="閉じる"><X size={16} /></button>
				<input
					value={manifest.title}
					onChange={(e) => update({ title: e.target.value })}
					placeholder="タイトル"
					className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[13px] outline-none"
				/>
				<button type="button" onClick={handleSave} className="flex items-center gap-1 rounded bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 text-[12px] font-bold">
					<Save size={13} /> {isEditing ? "更新" : "投稿に添付"}
				</button>
			</div>

			{/* プレビュー（MvMaker と同じく常時表示。編集した台本はそのまま映る） */}
			<div className="shrink-0 border-b border-gray-800 bg-[#0a0c12] p-3">
				<div className="mx-auto" style={{ maxWidth: TALK_W }}>
					<TalkPlayer manifest={manifest} />
				</div>
			</div>

			{/* タブ */}
			<div className="shrink-0 flex gap-1 px-3 pt-2">
				{([["script", "台本"], ["chars", "キャラ"], ["look", "見た目"]] as [Tab, string][]).map(([k, label]) => (
					<button
						key={k}
						type="button"
						onClick={() => setTab(k)}
						className={`px-3 py-1 rounded-t text-[12px] font-bold border border-b-0 ${tab === k ? "bg-gray-900 border-gray-700 text-white" : "bg-gray-950 border-transparent text-gray-500 hover:text-gray-300"}`}
					>
						{label}
					</button>
				))}
			</div>

			<div className="flex-1 overflow-y-auto px-3 pb-24 pt-2 space-y-3">
				{tab === "script" && (
					<div className="space-y-2">
						<div className="flex items-center justify-between text-[11px] text-gray-400">
							<span>{manifest.cues.length} 行 ・ 約 {totalSec ? Math.round(totalSec) : "?"} 秒</span>
							<button type="button" onClick={measureAll} disabled={measuring} className={BTN_REF}>
								{measuring ? "計測中…" : "長さを計る"}
							</button>
						</div>
						{manifest.cues.map((cue, i) => {
							const ch = charById(cue.speaker);
							return (
								<div key={cue.id} className={SECTION} style={{ borderLeftColor: ch?.color, borderLeftWidth: 3 }}>
									<div className="flex items-center gap-1">
										{manifest.characters.map((c) => (
											<button
												key={c.id}
												type="button"
												onClick={() => updateCue(cue.id, { speaker: c.id })}
												className={`px-2 py-0.5 rounded text-[11px] font-bold border ${cue.speaker === c.id ? "bg-blue-600 border-blue-500 text-white" : "border-gray-700 text-gray-400 hover:text-gray-200"}`}
											>
												{c.name || "?"}
											</button>
										))}
										<span className="flex-1" />
										<span className="text-[10px] text-gray-500 tabular-nums w-10 text-right">{cue.measuredSec ? `${cue.measuredSec}s` : ""}</span>
										<button type="button" onClick={() => moveCue(i, -1)} disabled={i === 0} className={BTN_ICON} title="上へ"><ChevronUp size={14} /></button>
										<button type="button" onClick={() => moveCue(i, 1)} disabled={i === manifest.cues.length - 1} className={BTN_ICON} title="下へ"><ChevronDown size={14} /></button>
										<button type="button" onClick={() => removeCue(cue.id)} className={BTN_DEL} title="削除"><Trash2 size={14} /></button>
									</div>
									<textarea
										value={cue.text}
										onChange={(e) => updateCue(cue.id, { text: e.target.value })}
										rows={2}
										placeholder="セリフ（漢字・数字もそのまま読みます）"
										className={INPUT}
									/>
									<div className="flex items-center gap-2">
										<select
											value={cue.expression ?? "neutral"}
											onChange={(e) => updateCue(cue.id, { expression: e.target.value === "neutral" ? undefined : (e.target.value as TalkExpression) })}
											className="bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none"
										>
											{TALK_EXPRESSIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
										</select>
										<label className="flex items-center gap-1 text-[10px] text-gray-400">
											間
											<input
												type="number"
												step={0.1}
												min={0}
												max={5}
												value={cue.gapSec ?? DEFAULT_TALK_GAP_SEC}
												onChange={(e) => updateCue(cue.id, { gapSec: Math.max(0, Number(e.target.value) || 0) })}
												className="w-14 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[11px] text-gray-200 outline-none"
											/>
											秒
										</label>
										<span className="flex-1" />
										<button type="button" onClick={() => void speakCue(cue)} disabled={!cue.text.trim()} className={BTN_REF}>
											{speakingCueId === cue.id ? <Square size={11} /> : <Play size={11} />}
											{speakingCueId === cue.id ? "停止" : "試聴"}
										</button>
										<button type="button" onClick={() => addCue(i)} className={BTN_ICON} title="この下に行を追加"><Plus size={14} /></button>
									</div>
								</div>
							);
						})}
						<button type="button" onClick={() => addCue()} className={BTN_ADD}><Plus size={12} /> 行を追加</button>
					</div>
				)}

				{tab === "chars" && (
					<div className="space-y-3">
						{manifest.characters.map((c) => (
							<CharacterPanel
								key={c.id}
								character={c}
								voiceGroups={voiceGroups}
								onChange={(fn) => updateChar(c.id, fn)}
								onPick={(target) => setPicker(target)}
								onAssign={(target, asset) => applyAsset(target, asset)}
							/>
						))}
					</div>
				)}

				{tab === "look" && (
					<div className="space-y-3">
						<div className={SECTION}>
							<div className={HEADING}>🖼 背景</div>
							<div className="flex items-center gap-2">
								<RefThumb asset={manifest.stage.bg} size={48} />
								<button type="button" onClick={() => setPicker({ kind: "bg" })} className={BTN_REF}><ImageIcon size={12} /> 画像を参照</button>
								{manifest.stage.bg && (
									<button type="button" onClick={() => update({ stage: { ...manifest.stage, bg: undefined } })} className="text-[11px] text-gray-400 hover:text-white">解除</button>
								)}
								<label className="flex items-center gap-1 text-[11px] text-gray-300 ml-auto">
									色
									<input type="color" value={manifest.stage.bgColor} onChange={(e) => update({ stage: { ...manifest.stage, bgColor: e.target.value } })} className="w-7 h-7 bg-transparent border-0 p-0" />
								</label>
							</div>
						</div>
						<div className={SECTION}>
							<div className={HEADING}>💬 字幕</div>
							<div className="grid grid-cols-2 gap-2">
								<label className="text-[10px] text-gray-400">形
									<select value={manifest.stage.subtitle.style} onChange={(e) => update({ stage: { ...manifest.stage, subtitle: { ...manifest.stage.subtitle, style: e.target.value as "window" | "band" } } })} className={INPUT}>
										<option value="window">ウィンドウ</option>
										<option value="band">帯</option>
									</select>
								</label>
								<label className="text-[10px] text-gray-400">文字の大きさ
									<input type="number" min={14} max={36} value={manifest.stage.subtitle.fontSize} onChange={(e) => update({ stage: { ...manifest.stage, subtitle: { ...manifest.stage.subtitle, fontSize: Number(e.target.value) || 22 } } })} className={INPUT} />
								</label>
								<label className="text-[10px] text-gray-400 flex items-center gap-2">文字色
									<input type="color" value={manifest.stage.subtitle.color} onChange={(e) => update({ stage: { ...manifest.stage, subtitle: { ...manifest.stage.subtitle, color: e.target.value } } })} className="w-7 h-7 bg-transparent border-0 p-0" />
								</label>
								<label className="text-[10px] text-gray-400 flex items-center gap-2">縁取り
									<input type="color" value={manifest.stage.subtitle.outline} onChange={(e) => update({ stage: { ...manifest.stage, subtitle: { ...manifest.stage.subtitle, outline: e.target.value } } })} className="w-7 h-7 bg-transparent border-0 p-0" />
								</label>
							</div>
						</div>
						<div className={SECTION}>
							<div className={HEADING}>📝 クレジット</div>
							<textarea value={manifest.credit ?? ""} onChange={(e) => update({ credit: e.target.value || undefined })} rows={2} placeholder="素材の出典など（音源と HTS モデルの表記は自動で付きます）" className={INPUT} />
						</div>
					</div>
				)}
			</div>

			{picker && (
				<ContentPicker
					mode="image"
					userId={userId}
					onPick={handlePick}
					onClose={() => setPicker(null)}
				/>
			)}
		</div>
	);
}

// ── キャラクター 1 人ぶんのパネル ────────────────────────────

function CharacterPanel({
	character: c,
	voiceGroups,
	onChange,
	onPick,
	onAssign,
}: {
	character: TalkCharacter;
	voiceGroups: VoiceModelGroup[] | null;
	onChange: (fn: (c: TalkCharacter) => TalkCharacter) => void;
	onPick: (target: PickTarget) => void;
	onAssign: (target: PickTarget, asset: MvAssetRef) => void;
}) {
	const [emojiInput, setEmojiInput] = useState("");
	const [emojiTarget, setEmojiTarget] = useState<TalkExpression>("neutral");
	const [customOpen, setCustomOpen] = useState(false);
	const [customUrl, setCustomUrl] = useState("");
	const [customLabel, setCustomLabel] = useState("");
	const set = (patch: Partial<TalkCharacter>) => onChange((prev) => ({ ...prev, ...patch }));

	const openCustom = () => {
		setCustomUrl(c.voice.custom?.url ?? "");
		setCustomLabel(c.voice.custom?.label ?? "");
		setCustomOpen(true);
	};
	const applyCustom = () => {
		const url = customUrl.trim();
		if (!url) return;
		const label = customLabel.trim() || "カスタム音源";
		set({ voice: { ...c.voice, model: talkCustomVoiceKey(url), custom: { url, label } } });
		setCustomOpen(false);
	};

	return (
		<div className={SECTION}>
			<div className="flex items-center gap-2">
				<span className={HEADING}>🎭 {c.name || "キャラ"}</span>
				<span className="flex-1" />
				<label className="flex items-center gap-1 text-[10px] text-gray-400">色
					<input type="color" value={c.color} onChange={(e) => set({ color: e.target.value })} className="w-6 h-6 bg-transparent border-0 p-0" />
				</label>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<label className="text-[10px] text-gray-400">名前
					<input value={c.name} onChange={(e) => set({ name: e.target.value })} className={INPUT} />
				</label>
				<label className="text-[10px] text-gray-400">位置
					<select value={c.side} onChange={(e) => set({ side: e.target.value as "left" | "right" })} className={INPUT}>
						<option value="left">左</option>
						<option value="right">右</option>
					</select>
				</label>
				<label className="text-[10px] text-gray-400">大きさ {c.scale.toFixed(2)}
					<input type="range" min={0.5} max={1.6} step={0.05} value={c.scale} onChange={(e) => set({ scale: Number(e.target.value) })} className="w-full accent-blue-500" />
				</label>
				<label className="text-[10px] text-gray-400">上下 {c.y}
					<input type="range" min={-80} max={80} step={2} value={c.y} onChange={(e) => set({ y: Number(e.target.value) })} className="w-full accent-blue-500" />
				</label>
			</div>
			<label className="flex items-center gap-1.5 text-[11px] text-gray-300">
				<input type="checkbox" checked={!!c.flipH} onChange={(e) => set({ flipH: e.target.checked || undefined })} className="accent-blue-500 w-3.5 h-3.5" />
				左右反転
			</label>

			<div className={SUBHEAD}>表情ごとの立ち絵</div>
			<div className="flex flex-wrap gap-2">
				{TALK_EXPRESSIONS.map((o) => (
					<div key={o.value} className="flex flex-col items-center gap-1">
						<button type="button" onClick={() => onPick({ kind: "face", charId: c.id, expression: o.value })} title="画像を参照" className="rounded hover:ring-2 hover:ring-blue-500/60">
							<RefThumb asset={c.faces[o.value]} size={44} />
						</button>
						<span className="text-[10px] text-gray-400">{o.label}</span>
					</div>
				))}
			</div>
			<div className="flex items-center gap-1">
				<select value={emojiTarget} onChange={(e) => setEmojiTarget(e.target.value as TalkExpression)} className="bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none">
					{TALK_EXPRESSIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
				</select>
				<input value={emojiInput} onChange={(e) => setEmojiInput(e.target.value)} placeholder="絵文字で代用" className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[12px] outline-none" />
				<button
					type="button"
					disabled={!emojiInput.trim()}
					onClick={() => { onAssign({ kind: "face", charId: c.id, expression: emojiTarget }, { ref: `emoji:${emojiInput.trim()}` }); setEmojiInput(""); }}
					className={BTN_REF}
				>
					設定
				</button>
				{TALK_EXPRESSIONS.some((o) => o.value !== "neutral" && c.faces[o.value]) && (
					<button type="button" onClick={() => set({ faces: { neutral: c.faces.neutral } })} className="text-[10px] text-gray-400 hover:text-white ml-auto">ふつう以外を消す</button>
				)}
			</div>

			<div className={SUBHEAD}>目（瞬き）と口（口パク）</div>
			<p className="text-[10px] text-gray-500">立ち絵と同じ大きさの、目だけ／口だけの画像を重ねます。無ければ立ち絵の差し替えだけで動きます。</p>
			<div className="flex flex-wrap gap-3">
				{([["eyes", "open", "目 開"], ["eyes", "closed", "目 閉"], ["mouth", "closed", "口 閉"], ["mouth", "open", "口 開"]] as const).map(([kind, which, label]) => {
					const asset = kind === "eyes" ? c.eyes?.[which as "open" | "closed"] : c.mouth?.[which as "open" | "closed"];
					return (
						<div key={label} className="flex flex-col items-center gap-1">
							<button type="button" onClick={() => onPick(kind === "eyes" ? { kind: "eyes", charId: c.id, which: which as "open" | "closed" } : { kind: "mouth", charId: c.id, which: which as "open" | "closed" })} className="rounded hover:ring-2 hover:ring-blue-500/60">
								<RefThumb asset={asset} size={40} />
							</button>
							<span className="text-[10px] text-gray-400">{label}</span>
						</div>
					);
				})}
				{(["a", "i", "u", "e", "o"] as MvVowel[]).map((v) => (
					<div key={v} className="flex flex-col items-center gap-1">
						<button type="button" onClick={() => onPick({ kind: "mouth", charId: c.id, which: v })} className="rounded hover:ring-2 hover:ring-blue-500/60">
							<RefThumb asset={c.mouth?.vowels?.[v]} size={40} />
						</button>
						<span className="text-[10px] text-gray-400">口 {v}</span>
					</div>
				))}
			</div>
			{(c.eyes || c.mouth) && (
				<button type="button" onClick={() => set({ eyes: undefined, mouth: undefined })} className="text-[10px] text-gray-400 hover:text-white">目と口の設定を消す</button>
			)}
			<PsdAssign charId={c.id} onAssign={onAssign} />

			<div className={SUBHEAD}>声</div>
			<div className="grid grid-cols-2 gap-2">
				<label className="text-[10px] text-gray-400">音源
					<select
						value={c.voice.model}
						onChange={(e) => {
							const v = e.target.value;
							// 「追加…」は選択ではなく入力欄を開くだけ（音源は変えない）
							if (v === CUSTOM_VOICE_ADD) { openCustom(); return; }
							set({ voice: { ...c.voice, model: v, custom: undefined } });
						}}
						className={INPUT}
					>
						{voiceGroups
							? voiceGroups.map((g) => (
								<optgroup key={g.label} label={g.label}>
									{g.models.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
								</optgroup>
							))
							: <option value={c.voice.model}>{c.voice.model}</option>}
						<optgroup label="カスタム音源">
							{c.voice.custom && <option value={c.voice.model}>{c.voice.custom.label || c.voice.model}</option>}
							<option value={CUSTOM_VOICE_ADD}>カスタム音源を追加…</option>
						</optgroup>
					</select>
				</label>
				<label className="text-[10px] text-gray-400">話し方
					<select value={c.voice.style ?? "neutral"} onChange={(e) => set({ voice: { ...c.voice, style: e.target.value === "neutral" ? undefined : (e.target.value as TalkStyle) } })} className={INPUT}>
						{VOICE_STYLES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
					</select>
				</label>
				<label className="text-[10px] text-gray-400 col-span-2">高さ {(c.voice.pitchOffset ?? 0) > 0 ? "+" : ""}{c.voice.pitchOffset ?? 0}
					<input type="range" min={-12} max={12} step={1} value={c.voice.pitchOffset ?? 0} onChange={(e) => set({ voice: { ...c.voice, pitchOffset: Number(e.target.value) || 0 } })} className="w-full accent-blue-500" />
				</label>
				{c.voice.custom && !customOpen && (
					<div className="col-span-2 flex items-center gap-2 text-[10px] text-gray-400">
						<span className="truncate">持ち込み音源: {c.voice.custom.label}</span>
						<button type="button" onClick={openCustom} className="text-blue-400 hover:text-blue-300 shrink-0">変更</button>
						<button
							type="button"
							onClick={() => set({ voice: { ...c.voice, model: DEFAULT_VOICE_MODEL, custom: undefined } })}
							className="hover:text-white shrink-0"
						>
							解除
						</button>
					</div>
				)}
				{customOpen && (
					<div className="col-span-2 space-y-1.5 rounded-lg border border-gray-800 bg-gray-950/40 p-2.5">
						<p className="text-[10px] text-gray-500 leading-relaxed">
							UTAU 音源を koe 形式にした <code>.koe</code> ファイルの URL を入れます。別のサイトに置いたファイルは CORS の許可が要ります。
							権利表記はクレジット欄に自分で書いてください。
						</p>
						<input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder=".koe の URL" className={INPUT} />
						<input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="表示名（例: 自前の音源）" className={INPUT} />
						<div className="flex gap-1">
							<button type="button" onClick={applyCustom} disabled={!customUrl.trim()} className={BTN_REF}>設定</button>
							<button type="button" onClick={() => setCustomOpen(false)} className="text-[11px] text-gray-400 hover:text-white px-2">やめる</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

/** psd の URL からレイヤーを読み、立ち絵・目・口へ割り当てる（MvMaker と同じ方式。自動関連付けはしない）。 */
function PsdAssign({ charId, onAssign }: { charId: string; onAssign: (target: PickTarget, asset: MvAssetRef) => void }) {
	const [url, setUrl] = useState("");
	const [layers, setLayers] = useState<PsdLayerInfo[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selected, setSelected] = useState<string[]>([]);
	const [target, setTarget] = useState<string>("face:neutral");
	const [open, setOpen] = useState(false);

	const targets: { value: string; label: string; target: PickTarget }[] = [
		...TALK_EXPRESSIONS.map((o) => ({ value: `face:${o.value}`, label: `立ち絵 ${o.label}`, target: { kind: "face", charId, expression: o.value } as PickTarget })),
		{ value: "eyes:open", label: "目 開", target: { kind: "eyes", charId, which: "open" } },
		{ value: "eyes:closed", label: "目 閉", target: { kind: "eyes", charId, which: "closed" } },
		{ value: "mouth:closed", label: "口 閉", target: { kind: "mouth", charId, which: "closed" } },
		{ value: "mouth:open", label: "口 開", target: { kind: "mouth", charId, which: "open" } },
		...(["a", "i", "u", "e", "o"] as MvVowel[]).map((v) => ({ value: `mouth:${v}`, label: `口 ${v}`, target: { kind: "mouth", charId, which: v } as PickTarget })),
	];

	const load = async () => {
		const trimmed = url.trim();
		if (!trimmed) return;
		setLoading(true);
		setError(null);
		try {
			setLayers(await listPsdLayerPaths(trimmed));
			setSelected([]);
		} catch {
			setError("psd の読み込みに失敗しました（URL と CORS 設定を確認してください）");
			setLayers([]);
		} finally {
			setLoading(false);
		}
	};

	if (!open) {
		return <button type="button" onClick={() => setOpen(true)} className="text-[11px] text-blue-400 hover:text-blue-300">psd から素材を選ぶ…</button>;
	}
	return (
		<div className="space-y-2 rounded-lg border border-gray-800 bg-gray-950/40 p-2.5">
			<div className="flex gap-1">
				<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="psd の URL" className={INPUT} />
				<button type="button" onClick={load} disabled={loading || !url.trim()} className={BTN_REF}>{loading ? "読込中" : "読込"}</button>
			</div>
			{error && <p className="text-[10px] text-red-400">{error}</p>}
			{layers.length > 0 && (
				<>
					<div className="max-h-40 overflow-y-auto space-y-0.5">
						{layers.map((l) => (
							<label key={l.path} className="flex items-center gap-1.5 text-[11px] text-gray-300">
								<input type="checkbox" checked={selected.includes(l.path)} onChange={() => setSelected((p) => (p.includes(l.path) ? p.filter((x) => x !== l.path) : [...p, l.path]))} className="accent-blue-500 w-3.5 h-3.5" />
								<span className="truncate">{l.path}</span>
							</label>
						))}
					</div>
					<div className="flex gap-1">
						<select value={target} onChange={(e) => setTarget(e.target.value)} className={INPUT}>
							{targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
						</select>
						<button
							type="button"
							disabled={selected.length === 0}
							onClick={() => {
								const t = targets.find((x) => x.value === target);
								if (t) onAssign(t.target, { ref: buildPsdRef(url.trim(), selected) });
							}}
							className={BTN_REF}
						>
							割り当て
						</button>
					</div>
				</>
			)}
		</div>
	);
}
