"use client";

// 音MAD のエディタ。設計: docs/otomad-feature-design.md §8
//
// 画面は 見本 / 曲 / 素材 / トラック / 仕上げ の 5 タブ＋常時表示のプレビュー（OtomadPlayer）。
// 素材はローカルファイルを IndexedDB に置くだけでサーバーには送らない。投稿できるのは
// 全素材が URL のときだけ（otomadPostability）で、それ以外は mp4 書き出しで手元に残す。
// パネルの見た目は GameMaker の規約（グレーセクション・破線の追加・青の参照ボタン・紫は使わない）。

import {
	AlertTriangle,
	Download,
	FileAudio,
	FileImage,
	FileVideo,
	Link2,
	Music,
	Plus,
	Save,
	Square,
	Trash2,
	Upload,
	Volume2,
	X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ContentPicker, { type PickResult } from "@/components/assets/ContentPicker";
import OtomadPlayer, { type OtomadPlayerHandle } from "@/components/otomad/OtomadPlayer";
import OtomadVisualFields from "@/components/otomad/OtomadVisualFields";
import { BTN_ADD, BTN_DEL, BTN_ICON, BTN_REF, HEADING, INPUT, INPUT_SM, LABEL, NumField, SECTION, SUBHEAD, Toggle } from "@/components/otomad/otomad-ui";
import { useSaveShortcut } from "@/lib/hooks/useSaveShortcut";
import { getStudio } from "@/lib/mml/dtm";
import { EMPTY_SONG, type MvSong } from "@/lib/mv/mv-engine";
import { auditionSample, recordMmlBacking } from "@/lib/otomad/otomad-audio";
import {
	audibleMmlTracks,
	effectiveStage,
	effectiveVisual,
	OTOMAD_TRANSITIONS,
	type OtomadScene,
	type OtomadTrackVisual,
	type OtomadTransitionStyle,
	sortedScenes,
	createDefaultSource,
	createDefaultTrack,
	type OtomadKeymapEntry,
	type OtomadManifest,
	type OtomadSlot,
	type OtomadSource,
	type OtomadSourceKind,
	type OtomadTrack,
	OTOMAD_H,
	OTOMAD_W,
	otomadPostability,
	normalizeOtomadManifest,
	playbackRateFor,
	resolveNoteSource,
	sourceHasAudio,
	sourceIsLocal,
	stripMmlTracks,
} from "@/lib/otomad/otomad-config";
import { buildOtomadExo } from "@/lib/otomad/otomad-exo";
import { canExportOffline, exportOtomadMp4, exportOtomadRealtime } from "@/lib/otomad/otomad-export";
import {
	estimateBaseNote,
	findAudioOnset,
	noteNameOf,
	type OtomadMediaWarning,
	probeSourceDuration,
	putLocalFile,
	resolveSourceUrl,
} from "@/lib/otomad/otomad-media";
import { buildOtomadMidi, downloadBlob } from "@/lib/otomad/otomad-midi";
import { MV_STEPS_PER_BAR } from "@/lib/mv/mv-config";
import { applyOtomadStyle, guessRole, OTOMAD_ROLES, OTOMAD_STYLES, type OtomadRole, otomadStyleById } from "@/lib/otomad/otomad-styles";
import { sceneIndexAtSec } from "@/lib/otomad/otomad-timeline";
import { audioBufferToWav, renderSynthBacking } from "@/lib/otomad/otomad-synth";
import { BUILTIN_SOURCES, createDefaultOtomadManifest, OTOMAD_PRESETS } from "@/lib/otomad/otomad-presets";
import { clearAutosave, getAutosave, getStorageKey, saveAutosave, saveHistory } from "@/lib/ui/history";

const MmlEditor = dynamic(() => import("@/components/mml/MmlEditor"), { ssr: false });

export interface OtomadMakerProps {
	onClose: () => void;
	onSave: (data: { manifest: OtomadManifest; title: string }) => void;
	userId: string;
	initialManifest?: OtomadManifest;
	isEditing?: boolean;
	/** 既存の投稿を編集しているときの otomads.id（作業履歴のスコープ）。未指定は "new"。 */
	otomadId?: string;
}

type Tab = "preset" | "song" | "sources" | "tracks" | "scenes" | "finish";

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

const kindOfFile = (nameOrType: string): OtomadSourceKind => {
	const s = nameOrType.toLowerCase();
	if (s.startsWith("video/") || /\.(mp4|webm|mov|mkv|m4v|avi)(\?|$)/.test(s)) return "video";
	if (s.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac|opus)(\?|$)/.test(s)) return "audio";
	if (s.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/.test(s)) return "image";
	return "video";
};

const KIND_LABEL: Record<OtomadSourceKind, string> = { video: "動画", audio: "音声", image: "画像" };
const KindIcon = ({ kind, size = 12 }: { kind: OtomadSourceKind; size?: number }) =>
	kind === "video" ? <FileVideo size={size} /> : kind === "audio" ? <FileAudio size={size} /> : <FileImage size={size} />;

const fmtSec = (s: number | undefined) => (s === undefined ? "?" : `${s.toFixed(2)}s`);

export default function OtomadMaker({ onClose, onSave, initialManifest, isEditing, otomadId }: OtomadMakerProps) {
	const [manifest, setManifestRaw] = useState<OtomadManifest>(() =>
		initialManifest ? normalizeOtomadManifest(initialManifest) : createDefaultOtomadManifest(),
	);
	const [tab, setTab] = useState<Tab>(initialManifest ? "tracks" : "preset");
	const [song, setSong] = useState<MvSong>(EMPTY_SONG);
	const [picker, setPicker] = useState<{ kind: "mml" } | { kind: "bg" } | null>(null);
	const [mmlEditorOpen, setMmlEditorOpen] = useState(false);
	const [builtinOpen, setBuiltinOpen] = useState(false);
	const [selected, setSelected] = useState<{ trackIdx: number; slot: number } | null>(null);
	const [warnings, setWarnings] = useState<OtomadMediaWarning[]>([]);
	const [tainted, setTainted] = useState(false);
	const [busy, setBusy] = useState<string | null>(null);
	const [exporting, setExporting] = useState<{ text: string; ratio: number } | null>(null);
	const [exportWidth, setExportWidth] = useState(1280);
	const [exoDir, setExoDir] = useState("");
	const [exoBacking, setExoBacking] = useState(true);
	/** 場面タブで開いている場面の id。 */
	const [openSceneId, setOpenSceneId] = useState<string | null>(null);
	/** 「型を当てる」で選んでいる型。 */
	const [styleId, setStyleId] = useState<string>(OTOMAD_STYLES[0].id);
	const [sceneBgPicker, setSceneBgPicker] = useState<string | null>(null);
	const [urlDraft, setUrlDraft] = useState("");
	/** 原曲を MML から録音するときに抜くトラック（@n）。null＝割り当て済みのトラック。 */
	const [backingExclude, setBackingExclude] = useState<number[] | null>(null);
	const [recording, setRecording] = useState<{ text: string; ratio: number } | null>(null);
	const recordAbort = useRef<AbortController | null>(null);
	const exportAbort = useRef<AbortController | null>(null);
	const realtimeCancel = useRef<(() => void) | null>(null);
	const playerHandle = useRef<OtomadPlayerHandle | null>(null);
	const auditionStop = useRef<(() => void) | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const replaceTarget = useRef<string | null>(null);
	const storageKey = useMemo(() => getStorageKey("otomad", otomadId), [otomadId]);
	const restoredRef = useRef(false);

	const setManifest = useCallback((fn: (m: OtomadManifest) => OtomadManifest) => setManifestRaw((m) => fn(m)), []);
	const update = useCallback((patch: Partial<OtomadManifest>) => setManifest((m) => ({ ...m, ...patch })), [setManifest]);

	// 自動保存の復元と保存
	useEffect(() => {
		if (initialManifest || restoredRef.current) return;
		restoredRef.current = true;
		void getAutosave<OtomadManifest>(storageKey).then((saved) => {
			if (saved?.data?.version === 1 && (saved.data.mml.trim() || saved.data.sources.length > 0)) {
				setManifestRaw(normalizeOtomadManifest(saved.data));
				setTab("tracks");
			}
		});
	}, [initialManifest, storageKey]);
	useEffect(() => {
		const t = setTimeout(() => void saveAutosave(storageKey, manifest), 800);
		return () => clearTimeout(t);
	}, [manifest, storageKey]);

	useEffect(
		() => () => {
			auditionStop.current?.();
			exportAbort.current?.abort();
			recordAbort.current?.abort();
			realtimeCancel.current?.();
		},
		[],
	);

	const postability = useMemo(() => otomadPostability(manifest), [manifest]);
	const handleRef = useCallback((h: OtomadPlayerHandle | null) => {
		playerHandle.current = h;
	}, []);

	// 素材の長さを manifest に書き戻す（変わったときだけ）
	const handleMediaReady = useCallback(
		(info: { durations: Map<string, number>; warnings: OtomadMediaWarning[]; tainted: boolean }) => {
			setWarnings(info.warnings);
			setTainted(info.tainted);
			setManifest((m) => {
				let changed = false;
				const sources = m.sources.map((s) => {
					const d = info.durations.get(s.id);
					if (d !== undefined && Math.abs((s.durationSec ?? -1) - d) > 0.02) {
						changed = true;
						return { ...s, durationSec: Math.round(d * 100) / 100 };
					}
					return s;
				});
				return changed ? { ...m, sources } : m;
			});
		},
		[setManifest],
	);

	// ── 見本 ──
	const applyPreset = (build: () => OtomadManifest, name: string) => {
		const has = manifest.mml.trim() || manifest.sources.some((s) => s.local);
		if (has && !window.confirm(`いまの内容を捨てて見本「${name}」で始めますか？`)) return;
		setManifestRaw(build());
		setSelected(null);
		setTab("tracks");
	};

	// ── 曲 ──
	const handlePick = (res: PickResult) => {
		if (picker?.kind === "mml" && res.rawMml) {
			update({ mml: res.rawMml });
		} else if (picker?.kind === "bg") {
			update({ stage: { ...manifest.stage, bg: { ref: res.ref, url: res.url } } });
		}
		setPicker(null);
	};

	/** MML を実時間で録音して原曲（素材 + backing）にする。抜くトラックは backingExclude（既定＝割り当て済み）。 */
	const handleRecordBacking = async () => {
		if (recording || !manifest.mml.trim()) return;
		const exclude = backingExclude ?? audibleMmlTracks(manifest);
		const mml = stripMmlTracks(manifest.mml, exclude);
		playerHandle.current?.stop();
		auditionStop.current?.();
		const ac = new AbortController();
		recordAbort.current = ac;
		const totalSteps = Math.max(1, song.totalSteps);
		const text = "原曲を録音中…（曲の長さぶん掛かります）";
		setRecording({ text, ratio: 0 });
		try {
			const studio = await getStudio();
			const expectedSec = (totalSteps / 48) * (60 / Math.max(1, song.bpm));
			const { blob, offsetSec } = await recordMmlBacking(
				studio,
				mml,
				expectedSec,
				({ step }) => setRecording({ text, ratio: Math.min(1, step / totalSteps) }),
				ac.signal,
			);
			const suffix = exclude.length ? `・@${exclude.join(",@")} 抜き` : "";
			await installBacking(blob, `原曲（MML から録音${suffix}）.wav`, offsetSec);
		} catch (err) {
			if (!(err instanceof DOMException && err.name === "AbortError")) {
				console.error("[otomad] 原曲の録音に失敗", err);
				window.alert(`原曲の録音に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
			}
		} finally {
			recordAbort.current = null;
			setRecording(null);
		}
	};

	/** 録音した／合成した原曲を素材と backing に登録する（同種の古い原曲は差し替える）。 */
	const installBacking = async (blob: Blob, name: string, offsetSec: number) => {
		const file = new File([blob], name, { type: "audio/wav" });
		const local = await putLocalFile(file);
		const src = createDefaultSource({ id: newId("src"), name: file.name, kind: "audio", local });
		setManifest((m) => ({
			...m,
			sources: [...m.sources.filter((x) => !x.name.startsWith("原曲（")), src],
			backing: { sourceId: src.id, offsetSec: Math.round(offsetSec * 1000) / 1000, volume: m.backing?.volume ?? 70 },
		}));
	};

	/** MML を簡易シンセでオフライン合成して原曲にする（即時・無音。音質は chiptune 寄り）。 */
	const handleSynthBacking = async () => {
		if (recording || song.totalSteps <= 0) return;
		const exclude = backingExclude ?? audibleMmlTracks(manifest);
		setRecording({ text: "原曲を合成中…", ratio: 0.3 });
		try {
			const buf = await renderSynthBacking(song, exclude);
			const suffix = exclude.length ? `・@${exclude.join(",@")} 抜き` : "";
			await installBacking(audioBufferToWav(buf), `原曲（簡易シンセ${suffix}）.wav`, 0);
		} catch (err) {
			console.error("[otomad] 原曲の合成に失敗", err);
			window.alert(`原曲の合成に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setRecording(null);
		}
	};

	// ── 素材 ──
	const addFiles = async (files: FileList | File[]) => {
		const list = Array.from(files);
		if (list.length === 0) return;
		setBusy("素材を取り込み中…");
		try {
			const added: OtomadSource[] = [];
			for (const f of list) {
				const local = await putLocalFile(f);
				const kind = kindOfFile(f.type || f.name);
				const src = createDefaultSource({ id: newId("src"), name: f.name, kind, local });
				if (kind !== "image") {
					const url = URL.createObjectURL(f);
					src.durationSec = await probeSourceDuration(url, kind);
					URL.revokeObjectURL(url);
				}
				added.push(src);
			}
			if (replaceTarget.current && added.length === 1) {
				const target = replaceTarget.current;
				replaceTarget.current = null;
				setManifest((m) => ({
					...m,
					sources: m.sources.map((s) =>
						s.id === target
							? { ...s, name: added[0].name, kind: added[0].kind, local: added[0].local, url: undefined, durationSec: added[0].durationSec }
							: s,
					),
				}));
			} else {
				setManifest((m) => ({ ...m, sources: [...m.sources, ...added] }));
			}
		} finally {
			setBusy(null);
		}
	};
	const addUrl = async () => {
		const url = urlDraft.trim();
		if (!/^https?:\/\//.test(url)) return;
		setUrlDraft("");
		const kind = kindOfFile(url);
		const name = decodeURIComponent(url.split("/").pop()?.split("?")[0] || url);
		const src = createDefaultSource({ id: newId("src"), name, kind, url });
		setBusy("素材を調べています…");
		try {
			if (kind !== "image") src.durationSec = await probeSourceDuration(url, kind);
		} finally {
			setBusy(null);
		}
		setManifest((m) => ({ ...m, sources: [...m.sources, src] }));
	};
	const addBuiltin = (s: OtomadSource) => {
		if (manifest.sources.some((x) => x.id === s.id)) return;
		setManifest((m) => ({ ...m, sources: [...m.sources, { ...s }] }));
	};
	const updateSource = (id: string, patch: Partial<OtomadSource>) =>
		setManifest((m) => ({ ...m, sources: m.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
	const removeSource = (id: string) => {
		const used = manifest.tracks.some(
			(t) => t.audio.sourceId === id || t.audio.keymap?.some((k) => k.sourceId === id),
		) || manifest.backing?.sourceId === id;
		if (used && !window.confirm("この素材はトラックで使われています。削除しますか？")) return;
		setManifest((m) => ({
			...m,
			sources: m.sources.filter((s) => s.id !== id),
			backing: m.backing?.sourceId === id ? undefined : m.backing,
			tracks: m.tracks.map((t) => ({
				...t,
				audio: {
					...t.audio,
					sourceId: t.audio.sourceId === id ? undefined : t.audio.sourceId,
					keymap: t.audio.keymap?.filter((k) => k.sourceId !== id),
				},
			})),
		}));
	};

	const withAudio = async (s: OtomadSource, fn: (buf: AudioBuffer) => void | Promise<void>) => {
		const h = playerHandle.current;
		if (!h) return;
		setBusy(`「${s.name}」を読み込み中…`);
		try {
			const studio = await getStudio();
			const media = h.getMedia() ?? (await h.prepare())?.media;
			if (!media) return;
			void studio;
			const buf = await media.ensureAudio(s);
			if (!buf) {
				window.alert("この素材の音を読めませんでした");
				return;
			}
			if (s.durationSec === undefined || Math.abs(s.durationSec - buf.duration) > 1e-3) updateSource(s.id, { durationSec: buf.duration });
			await fn(buf);
		} finally {
			setBusy(null);
		}
	};
	const audition = (s: OtomadSource, rate = 1) =>
		withAudio(s, async (buf) => {
			auditionStop.current?.();
			const studio = await getStudio();
			auditionStop.current = auditionSample(studio, buf, s.inSec, s.outSec, rate, s.gainDb);
		});
	const measurePitch = (s: OtomadSource) =>
		withAudio(s, (buf) => {
			const n = estimateBaseNote(buf, s.inSec, s.outSec ?? Math.min(buf.duration, s.inSec + 0.6));
			if (n === null) window.alert("音程を推定できませんでした（区間を声の母音に合わせてください）");
			else updateSource(s.id, { baseNote: n });
		});
	const trimSilence = (s: OtomadSource) =>
		withAudio(s, (buf) => {
			const onset = findAudioOnset(buf, s.inSec);
			updateSource(s.id, { inSec: Math.round(onset * 1000) / 1000 });
		});

	// ── トラック ──
	const updateTrack = (idx: number, fn: (t: OtomadTrack) => OtomadTrack) =>
		setManifest((m) => ({ ...m, tracks: m.tracks.map((t, i) => (i === idx ? fn(t) : t)) }));
	const addTrack = (mmlTrack: number) => {
		const firstAudio = manifest.sources.find(sourceHasAudio);
		setManifest((m) => ({ ...m, tracks: [...m.tracks, createDefaultTrack(mmlTrack, firstAudio?.id)] }));
		setSelected({ trackIdx: manifest.tracks.length, slot: 0 });
	};
	const removeTrack = (idx: number) => {
		setManifest((m) => ({ ...m, tracks: m.tracks.filter((_, i) => i !== idx) }));
		setSelected(null);
	};
	const maxPolyphonyOf = (mmlTrack: number): number =>
		Math.max(1, ...(song.byTrack.get(mmlTrack) ?? []).reduce((m, n) => { m.set(n.startStep, (m.get(n.startStep) ?? 0) + 1); return m; }, new Map<number, number>()).values());

	// ── 場面 ──
	const scenes = sortedScenes(manifest);
	const updateScene = (id: string, fn: (sc: OtomadScene) => OtomadScene) =>
		setManifest((m) => ({ ...m, scenes: (m.scenes ?? []).map((sc) => (sc.id === id ? fn(sc) : sc)) }));
	const removeScene = (id: string) => setManifest((m) => ({ ...m, scenes: (m.scenes ?? []).filter((sc) => sc.id !== id) }));
	/** 曲の秒 → 小節（lead を除く）。 */
	const barAtSec = (sec: number): number => {
		const secPerBar = (MV_STEPS_PER_BAR / 48) * (60 / Math.max(1, song.bpm));
		return Math.max(0, Math.floor((sec - manifest.leadInSec) / secPerBar));
	};
	const addSceneAt = (startBar: number) => {
		const id = newId("scene");
		setManifest((m) => ({ ...m, scenes: [...(m.scenes ?? []), { id, name: `場面 ${(m.scenes?.length ?? 0) + 1}`, startBar, transition: { style: "cut", beats: 1 } }] }));
		setOpenSceneId(id);
	};
	/** いま映している場面（-1 は base）。プレビューの時刻から。 */
	const currentSceneIdx = (): number => {
		const h = playerHandle.current;
		const tl = h?.getTimeline();
		if (!h || !tl) return -1;
		return sceneIndexAtSec(tl, h.getTimeSec());
	};
	/** いま映している場面を反映したトラックの見た目（ドラッグの当たり判定と書き込み先）。 */
	const visualNow = (ti: number): OtomadTrackVisual => {
		const si = currentSceneIdx();
		return effectiveVisual(manifest.tracks[ti], si >= 0 ? scenes[si] : null, ti);
	};
	/** 窓の位置を書き込む。いまの場面にそのトラックの上書きがあれば上書き側へ、無ければ base へ。 */
	const updateSlot = (trackIdx: number, slotIdx: number, patch: Partial<OtomadSlot>) => {
		const si = currentSceneIdx();
		const sc = si >= 0 ? scenes[si] : null;
		const o = sc?.tracks?.[String(trackIdx)];
		if (sc && o?.visual?.slots) {
			updateScene(sc.id, (x) => ({
				...x,
				tracks: {
					...x.tracks,
					[String(trackIdx)]: { ...o, visual: { ...o.visual, slots: o.visual!.slots!.map((s, i) => (i === slotIdx ? { ...s, ...patch } : s)) } },
				},
			}));
			return;
		}
		updateTrack(trackIdx, (t) => ({
			...t,
			visual: { ...t.visual, slots: t.visual.slots.map((s, i) => (i === slotIdx ? { ...s, ...patch } : s)) },
		}));
	};

	/** 音域の警告（再生速度方式は ±8 半音で破綻しやすい）。 */
	const pitchWarningFor = (t: OtomadTrack): string | null => {
		if (t.audio.pitch !== "follow") return null;
		const notes = song.byTrack.get(t.track) ?? [];
		let worst = 0;
		for (const n of notes) {
			const r = resolveNoteSource(manifest, t, n.pitch);
			if (!r || r.source.baseNote === undefined) continue;
			worst = Math.max(worst, Math.abs(n.pitch - r.source.baseNote));
		}
		return worst > 8 ? `素材との音程差が最大 ${worst.toFixed(1)} 半音あります。±8 を超えると声が壊れやすいので、高い声・低い声の素材を分けて keymap に割り当てるのがおすすめです。` : null;
	};

	// プレビュー上の slot ドラッグ
	const dragRef = useRef<{ trackIdx: number; slot: number; dx: number; dy: number; resize: boolean; w0: number; h0: number; x0: number; y0: number } | null>(null);
	const handleCanvasPointer = useCallback(
		(e: { type: "down" | "move" | "up"; x: number; y: number; shift: boolean }): boolean => {
			if (tab !== "tracks" && tab !== "scenes") return false;
			if (e.type === "down") {
				// 選択中の slot を優先、なければ当たった slot（いま映している場面の配置で判定）
				const hit = (ti: number, si: number) => {
					const s = visualNow(ti).slots[si];
					return !!s && Math.abs(e.x - s.x) <= s.w / 2 && Math.abs(e.y - s.y) <= s.h / 2;
				};
				let target: { trackIdx: number; slot: number } | null = null;
				if (selected && hit(selected.trackIdx, selected.slot)) target = selected;
				else {
					outer: for (let ti = manifest.tracks.length - 1; ti >= 0; ti--) {
						const vis = visualNow(ti);
						if (vis.kind !== "window") continue;
						for (let si = vis.slots.length - 1; si >= 0; si--) {
							if (hit(ti, si)) {
								target = { trackIdx: ti, slot: si };
								break outer;
							}
						}
					}
				}
				if (!target) return false;
				const s = visualNow(target.trackIdx).slots[target.slot];
				setSelected(target);
				dragRef.current = { ...target, dx: e.x - s.x, dy: e.y - s.y, resize: e.shift, w0: s.w, h0: s.h, x0: e.x, y0: e.y };
				return true;
			}
			const d = dragRef.current;
			if (!d) return false;
			if (e.type === "move") {
				if (d.resize) {
					const k = Math.max(0.1, 1 + ((e.x - d.x0) + (e.y - d.y0)) / 200);
					updateSlot(d.trackIdx, d.slot, { w: Math.round(d.w0 * k), h: Math.round(d.h0 * k) });
				} else {
					updateSlot(d.trackIdx, d.slot, {
						x: Math.round(Math.max(0, Math.min(OTOMAD_W, e.x - d.dx))),
						y: Math.round(Math.max(0, Math.min(OTOMAD_H, e.y - d.dy))),
					});
				}
				return true;
			}
			dragRef.current = null;
			return true;
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[tab, manifest.tracks, manifest.scenes, selected],
	);
	const drawOptions = useMemo(
		() => ({ highlight: tab === "tracks" || tab === "scenes" ? selected : null, showSlotOutlines: tab === "tracks" || tab === "scenes" }),
		[tab, selected],
	);

	// ── 書き出し ──
	const prepareForExport = async () => {
		const h = playerHandle.current;
		if (!h) throw new Error("プレイヤーが準備できていません");
		h.stop();
		const ready = await h.prepare();
		if (!ready) throw new Error("時間軸を作れませんでした（曲が空です）");
		return ready;
	};
	const safeTitle = () => (manifest.title.trim() || "音MAD").replace(/[\\/:*?"<>|\s]+/g, "_");
	const handleExportMp4 = async () => {
		if (exporting) return;
		try {
			setExporting({ text: "準備中…", ratio: 0 });
			const { timeline, media } = await prepareForExport();
			if (timeline.totalSec <= 0) throw new Error("曲が空です");
			if (canExportOffline()) {
				const ac = new AbortController();
				exportAbort.current = ac;
				const blob = await exportOtomadMp4({
					manifest,
					timeline,
					media,
					width: exportWidth,
					fps: 30,
					signal: ac.signal,
					onProgress: (p) =>
						setExporting({
							text: p.phase === "audio" ? "音を描いています…" : p.phase === "video" ? "映像を描いています…" : "ファイルにまとめています…",
							ratio: p.phase === "audio" ? p.ratio * 0.1 : p.phase === "video" ? 0.1 + p.ratio * 0.85 : 0.95 + p.ratio * 0.05,
						}),
				});
				downloadBlob(blob, `${safeTitle()}.mp4`);
			} else {
				// 実時間録画（WebCodecs が無いブラウザ）
				const canvas = document.querySelector<HTMLCanvasElement>("[data-otomad-preview] canvas");
				if (!canvas) throw new Error("プレビューが見つかりません");
				const studio = await getStudio();
				const audioTrack = studio.getAudioStreamTrack();
				const h = playerHandle.current;
				const run = exportOtomadRealtime({
					canvas,
					audioTrack,
					durationSec: timeline.totalSec,
					play: () => {
						// プレビューのクリックと同じ経路で頭から再生する
						(document.querySelector<HTMLButtonElement>("[data-otomad-preview] button[aria-label='再生']") ?? null)?.click();
					},
					stop: () => h?.stop(),
					onProgress: (r) => setExporting({ text: "録画中…（実時間）", ratio: r }),
				});
				realtimeCancel.current = run.cancel;
				const { blob, ext } = await run.promise;
				downloadBlob(blob, `${safeTitle()}.${ext}`);
			}
		} catch (err) {
			if (!(err instanceof DOMException && err.name === "AbortError")) {
				console.error("[otomad] 書き出しに失敗", err);
				window.alert(`書き出しに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
			}
		} finally {
			exportAbort.current = null;
			realtimeCancel.current = null;
			setExporting(null);
		}
	};
	const cancelExport = () => {
		exportAbort.current?.abort();
		realtimeCancel.current?.();
	};
	const handleExportMidi = async () => {
		if (song.totalSteps <= 0) return;
		downloadBlob(await buildOtomadMidi(song), `${safeTitle()}.mid`);
	};
	const handleExportExo = async () => {
		try {
			const { timeline } = await prepareForExport();
			const blob = buildOtomadExo(manifest, timeline, {
				width: exportWidth,
				height: Math.round((exportWidth * 9) / 16),
				fps: 30,
				assetDir: exoDir.trim(),
				includeBacking: exoBacking,
			});
			downloadBlob(blob, `${safeTitle()}.exo`);
		} catch (err) {
			window.alert(`exo の書き出しに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
		}
	};
	const handleExportJson = () => {
		const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
		downloadBlob(blob, `${safeTitle()}.json`);
	};
	useSaveShortcut(handleExportJson);
	const handleImportJson = (file: File) => {
		void file.text().then((text) => {
			try {
				setManifestRaw(normalizeOtomadManifest(JSON.parse(text)));
				setTab("tracks");
			} catch {
				window.alert("JSON を読めませんでした");
			}
		});
	};

	// ── 保存（投稿に添付） ──
	const handleSave = () => {
		if (!postability.ok) {
			window.alert(postability.reasons.join("\n"));
			return;
		}
		auditionStop.current?.();
		playerHandle.current?.stop();
		const title = manifest.title.trim() || "無題の音MAD";
		const finalManifest: OtomadManifest = { ...manifest, title };
		void saveHistory(storageKey, finalManifest, "otomad", 30);
		void clearAutosave(storageKey);
		onSave({ manifest: finalManifest, title });
	};

	const sourceOf = (id?: string) => manifest.sources.find((s) => s.id === id);
	const audioSources = manifest.sources.filter(sourceHasAudio);
	const mmlTracksUnbound = song.tracks.filter((t) => !manifest.tracks.some((x) => x.track === t));

	return (
		<div className="fixed inset-0 z-[100] bg-gray-950 text-gray-100 flex flex-col">
			{/* ヘッダー */}
			<div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-800 bg-gray-900/80">
				<button type="button" onClick={onClose} className={BTN_ICON} title="閉じる">
					<X size={16} />
				</button>
				<input
					value={manifest.title}
					onChange={(e) => update({ title: e.target.value })}
					maxLength={100}
					placeholder="タイトル"
					className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[13px] outline-none"
				/>
				<button
					type="button"
					onClick={handleSave}
					disabled={!postability.ok}
					title={postability.ok ? undefined : postability.reasons.join("\n")}
					className="flex items-center gap-1 rounded bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 text-[12px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
				>
					<Save size={13} /> {isEditing ? "更新" : "投稿に添付"}
				</button>
			</div>

			{/* プレビュー（常時表示） */}
			<div className="shrink-0 border-b border-gray-800 bg-[#0a0c12] p-3" data-otomad-preview>
				<div className="mx-auto" style={{ maxWidth: OTOMAD_W }}>
					<OtomadPlayer
						manifest={manifest}
						onMediaReady={handleMediaReady}
						onSongParsed={setSong}
						drawOptions={drawOptions}
						onCanvasPointer={handleCanvasPointer}
						handleRef={handleRef}
					/>
					{(tab === "tracks" || tab === "scenes") && (
						<p className="mt-1 text-[10px] text-gray-500">窓はドラッグで移動、Shift＋ドラッグで大きさを変えられます。場面タブでは、いま映している場面の配置を動かします。</p>
					)}
				</div>
			</div>

			{/* タブ */}
			<div className="shrink-0 flex gap-1 px-3 pt-2">
				{(
					[
						["preset", "見本"],
						["song", "曲"],
						["sources", "素材"],
						["tracks", "トラック"],
						["scenes", "場面"],
						["finish", "仕上げ"],
					] as [Tab, string][]
				).map(([k, label]) => (
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
				{(busy || warnings.length > 0 || tainted) && (
					<div className="space-y-1">
						{busy && <p className="text-[11px] text-blue-300">{busy}</p>}
						{warnings.map((w, i) => (
							<p key={i} className="flex items-start gap-1 text-[11px] text-amber-300">
								<AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w.message}
							</p>
						))}
					</div>
				)}

				{tab === "preset" && (
					<div className="space-y-2">
						<p className="text-[11px] text-gray-400 leading-relaxed">
							まず見本を選びます。「曲」で MML を差し替え、「素材」に手元の mp4 / wav を入れ、「トラック」で MML
							のトラックに素材を割り当てれば完成です。素材はこの端末のブラウザにだけ置かれ、サーバーには送られません。
						</p>
						{OTOMAD_PRESETS.map((p) => (
							<button
								key={p.id}
								type="button"
								onClick={() => applyPreset(p.build, p.name)}
								className="w-full rounded-lg border border-gray-700 bg-gray-900/60 hover:bg-gray-100/5 p-3 text-left"
							>
								<p className="text-[13px] font-bold text-gray-100">{p.name}</p>
								<p className="mt-1 text-[11px] leading-relaxed text-gray-400">{p.description}</p>
							</button>
						))}
						<div className={SECTION}>
							<p className={HEADING}>JSON から読み込む</p>
							<p className="text-[11px] text-gray-400">Ctrl+S で手元に保存した音MAD の JSON を読み込みます（ローカル素材は同じファイルを選び直せば復元されます）。</p>
							<input
								type="file"
								accept="application/json,.json"
								onChange={(e) => {
									const f = e.target.files?.[0];
									if (f) handleImportJson(f);
									e.target.value = "";
								}}
								className="text-[11px] text-gray-400"
							/>
						</div>
					</div>
				)}

				{tab === "song" && (
					<div className="space-y-2">
						<div className={SECTION}>
							<p className={HEADING}>時間軸になる曲（MML）</p>
							<div className="flex flex-wrap gap-1">
								<button type="button" onClick={() => setPicker({ kind: "mml" })} className={BTN_REF}>
									<Music size={11} /> 投稿された曲から選ぶ
								</button>
								<button type="button" onClick={() => setMmlEditorOpen(true)} className={BTN_REF}>
									MML を書く／直す
								</button>
								<button type="button" onClick={handleExportMidi} disabled={song.totalSteps <= 0} className={BTN_REF}>
									<Download size={11} /> MIDI 書き出し
								</button>
							</div>
							<textarea
								value={manifest.mml}
								onChange={(e) => update({ mml: e.target.value })}
								rows={5}
								placeholder="ここに MML を貼り付けてもよい"
								className={`${INPUT} font-mono text-[11px]`}
							/>
							<p className="text-[11px] text-gray-400">
								{song.totalSteps > 0
									? `BPM ${song.bpm} ・ ${song.totalBars} 小節 ・ トラック ${song.tracks.length} 本`
									: "曲がありません"}
							</p>
							{song.tracks.length > 0 && (
								<div className="space-y-1">
									{song.tracks.map((t) => {
										const notes = song.byTrack.get(t) ?? [];
										const lo = Math.min(...notes.map((n) => n.pitch));
										const hi = Math.max(...notes.map((n) => n.pitch));
										const bound = manifest.tracks.filter((x) => x.track === t).length;
										return (
											<div key={t} className="flex items-center gap-2 text-[11px]">
												<span className="font-mono text-gray-200 w-8">@{t}</span>
												<span className="text-gray-400">
													{notes.length} 音 ・ {noteNameOf(lo)}〜{noteNameOf(hi)}
												</span>
												<span className="flex-1" />
												{bound > 0 ? (
													<span className="text-gray-500">{bound} トラックに割り当て済み</span>
												) : (
													<button type="button" onClick={() => { addTrack(t); setTab("tracks"); }} className={BTN_REF}>
														<Plus size={11} /> トラックにする
													</button>
												)}
											</div>
										);
									})}
								</div>
							)}
							<NumField label="曲頭の余白（秒）" value={manifest.leadInSec} onChange={(v) => update({ leadInSec: Math.max(0, Math.min(2, v ?? 0)) })} step={0.05} min={0} max={2} />
						</div>
						<div className={SECTION}>
							<p className={HEADING}>原曲を MML から作る（off vocal）</p>
							<p className="text-[11px] text-gray-400 leading-relaxed">
								この MML を楽器音で鳴らしながら録音し、原曲（backing）にします。声に差し替えるトラックは抜いておくのが定石です
								（既定＝声や打楽器を鳴らすトラックの @n。絵だけのトラックは抜かない）。
							</p>
							{song.tracks.length > 0 && (
								<div className="flex flex-wrap gap-2">
									{song.tracks.map((t) => {
										const exclude = backingExclude ?? audibleMmlTracks(manifest);
										const on = exclude.includes(t);
										return (
											<Toggle
												key={t}
												label={`@${t} を抜く`}
												value={on}
												onChange={(v) => setBackingExclude(v ? [...new Set([...exclude, t])] : exclude.filter((x) => x !== t))}
											/>
										);
									})}
								</div>
							)}
							<div className="flex flex-wrap items-center gap-2">
								{recording ? (
									<button type="button" onClick={() => recordAbort.current?.abort()} className={BTN_REF}>
										<Square size={11} /> 中止
									</button>
								) : (
									<>
										<button type="button" onClick={() => void handleRecordBacking()} disabled={song.totalSteps <= 0} className={BTN_REF} title="dtm の楽器音（SoundFont）で鳴らしながら録音。曲の長さぶん掛かる">
											楽器音で録音する（実時間）
										</button>
										<button type="button" onClick={() => void handleSynthBacking()} disabled={song.totalSteps <= 0} className={BTN_REF} title="発振器の簡易シンセでその場で合成。音は chiptune 寄りだが待たない">
											簡易シンセで今すぐ作る
										</button>
									</>
								)}
								{manifest.backing && (
									<span className="text-[10px] text-gray-500">
										原曲: {sourceOf(manifest.backing.sourceId)?.name ?? "?"}（ずれ {manifest.backing.offsetSec}s）
									</span>
								)}
							</div>
							{recording && (
								<div className="space-y-1">
									<p className="text-[11px] text-blue-300">{recording.text}</p>
									<div className="h-1.5 w-full rounded bg-gray-800">
										<div className="h-1.5 rounded bg-blue-500" style={{ width: `${Math.round(recording.ratio * 100)}%` }} />
									</div>
								</div>
							)}
						</div>
					</div>
				)}

				{tab === "sources" && (
					<div className="space-y-2">
						<div className={SECTION}>
							<p className={HEADING}>素材を追加</p>
							<p className="text-[11px] text-gray-400 leading-relaxed">
								手元の mp4 / wav / mp3 / png をそのまま使えます（ブラウザ内に保存。サーバーには送りません）。投稿したいときだけ、
								Cloudinary などに置いた URL を貼ってください。
							</p>
							<div className="flex flex-wrap gap-1">
								<button type="button" onClick={() => { replaceTarget.current = null; fileInput.current?.click(); }} className={BTN_REF}>
									<Upload size={11} /> ファイルを追加
								</button>
								<button type="button" onClick={() => setBuiltinOpen((v) => !v)} className={BTN_REF}>
									内蔵素材
								</button>
							</div>
							<input
								ref={fileInput}
								type="file"
								multiple
								accept="video/*,audio/*,image/*"
								className="hidden"
								onChange={(e) => {
									if (e.target.files) void addFiles(e.target.files);
									e.target.value = "";
								}}
							/>
							<div className="flex items-center gap-1">
								<input
									value={urlDraft}
									onChange={(e) => setUrlDraft(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") void addUrl();
									}}
									placeholder="https://…/clip.mp4（CORS 許可のある URL）"
									className={INPUT}
								/>
								<button type="button" onClick={() => void addUrl()} className={BTN_REF}>
									<Link2 size={11} /> 追加
								</button>
							</div>
							{builtinOpen && (
								<div className="grid grid-cols-2 gap-1">
									{BUILTIN_SOURCES.map((s) => (
										<button
											key={s.id}
											type="button"
											disabled={manifest.sources.some((x) => x.id === s.id)}
											onClick={() => addBuiltin(s)}
											className="flex items-center gap-1 rounded border border-gray-700 bg-gray-800/60 hover:bg-gray-100/5 px-2 py-1 text-[11px] text-left disabled:opacity-40"
										>
											<KindIcon kind={s.kind} /> {s.name}
										</button>
									))}
								</div>
							)}
						</div>

						{manifest.sources.map((s) => {
							const local = sourceIsLocal(s);
							return (
								<div key={s.id} className={SECTION}>
									<div className="flex items-center gap-2">
										<KindIcon kind={s.kind} size={14} />
										<input value={s.name} onChange={(e) => updateSource(s.id, { name: e.target.value })} className={`${INPUT} flex-1`} />
										<span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${local ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"}`}>
											{local ? "ローカル（投稿不可）" : s.url ? "URL" : "参照なし"}
										</span>
										<button type="button" onClick={() => removeSource(s.id)} className={BTN_DEL} title="削除">
											<Trash2 size={14} />
										</button>
									</div>
									<p className="text-[10px] text-gray-500 truncate">
										{KIND_LABEL[s.kind]} ・ 長さ {fmtSec(s.durationSec)}
										{s.local && ` ・ ${(s.local.size / 1024 / 1024).toFixed(1)} MB`}
										{s.url && ` ・ ${s.url}`}
									</p>
									{s.kind !== "image" && (
										<div className="flex flex-wrap items-end gap-2">
											<NumField label="使い始め（秒）" value={s.inSec} onChange={(v) => updateSource(s.id, { inSec: Math.max(0, v ?? 0) })} step={0.01} min={0} />
											<NumField label="使い終わり（秒、空＝末尾）" value={s.outSec} onChange={(v) => updateSource(s.id, { outSec: v })} step={0.01} min={0} allowEmpty width={96} />
											<NumField label="音量補正（dB）" value={s.gainDb} onChange={(v) => updateSource(s.id, { gainDb: v ?? 0 })} step={1} min={-24} max={24} width={60} />
											{sourceHasAudio(s) && (
												<>
													<button type="button" onClick={() => void audition(s)} className={BTN_REF} title="区間を試聴">
														<Volume2 size={11} /> 試聴
													</button>
													<button type="button" onClick={() => auditionStop.current?.()} className={BTN_ICON} title="止める">
														<Square size={12} />
													</button>
													<button type="button" onClick={() => void trimSilence(s)} className={BTN_REF} title="頭の無音を飛ばす">
														無音を切る
													</button>
												</>
											)}
										</div>
									)}
									{sourceHasAudio(s) && (
										<div className="flex flex-wrap items-end gap-2">
											<NumField label="素材の音高（MIDI、空＝音程を変えない）" value={s.baseNote} onChange={(v) => updateSource(s.id, { baseNote: v })} step={0.1} min={0} max={127} allowEmpty width={80} suffix={s.baseNote !== undefined ? noteNameOf(s.baseNote) : ""} />
											<button type="button" onClick={() => void measurePitch(s)} className={BTN_REF}>
												音程を測る
											</button>
											{s.baseNote !== undefined && (
												<button type="button" onClick={() => void audition(s, playbackRateFor({ audio: { pitch: "follow" } } as OtomadTrack, s, 60))} className={BTN_REF} title="C4 に合わせて試聴">
													C4 で試聴
												</button>
											)}
										</div>
									)}
									{s.kind !== "audio" && (
										<div className="flex flex-wrap items-end gap-2">
											<Toggle
												label="クロマキーで抜く（グリーンバック等）"
												value={!!s.chromaKey}
												onChange={(v) => updateSource(s.id, { chromaKey: v ? { color: "#00ff00", tolerance: 30 } : undefined })}
											/>
											{s.chromaKey && (
												<>
													<label className="flex flex-col gap-0.5">
														<span className={LABEL}>抜く色</span>
														<input type="color" value={s.chromaKey.color} onChange={(e) => updateSource(s.id, { chromaKey: { ...s.chromaKey!, color: e.target.value } })} className="h-7 w-10 bg-transparent" />
													</label>
													<NumField label="許容（0〜100）" value={s.chromaKey.tolerance} onChange={(v) => updateSource(s.id, { chromaKey: { ...s.chromaKey!, tolerance: Math.max(0, Math.min(100, v ?? 30)) } })} step={1} min={0} max={100} width={55} />
												</>
											)}
										</div>
									)}
									<div className="flex flex-wrap gap-1 pt-1">
										<button type="button" onClick={() => { replaceTarget.current = s.id; fileInput.current?.click(); }} className={BTN_REF}>
											ファイルを選び直す
										</button>
										<input
											placeholder="URL に差し替える（https://…）"
											className={`${INPUT} flex-1 min-w-[160px]`}
											onKeyDown={(e) => {
												if (e.key !== "Enter") return;
												const u = (e.target as HTMLInputElement).value.trim();
												if (/^https?:\/\//.test(u)) {
													updateSource(s.id, { url: u, local: undefined });
													(e.target as HTMLInputElement).value = "";
												}
											}}
										/>
									</div>
								</div>
							);
						})}
						{manifest.sources.length === 0 && <p className="text-[11px] text-gray-500">まだ素材がありません。</p>}
					</div>
				)}

				{tab === "tracks" && (
					<div className="space-y-2">
						<div className={SECTION}>
							<p className={HEADING}>型を当てる（画面構成のテンプレート）</p>
							<p className="text-[11px] text-gray-400 leading-relaxed">
								各トラックの「役割」を見て、窓の配置と演出をまとめて差し替えます（素材の割り当てと場面は残ります）。
								型はカタログ（docs/otomad-visual-catalog.md）から組めるものを入れてあり、当てたあとは自由に直せます。
							</p>
							<div className="flex flex-wrap items-end gap-2">
								<label className="flex flex-col gap-0.5">
									<span className={LABEL}>型</span>
									<select value={styleId} onChange={(e) => setStyleId(e.target.value)} className={INPUT_SM}>
										{OTOMAD_STYLES.map((st) => (
											<option key={st.id} value={st.id}>
												{st.name}
											</option>
										))}
									</select>
								</label>
								<button
									type="button"
									onClick={() => {
										const used = new Set<OtomadRole>();
										setManifest((m) => ({
											...m,
											tracks: m.tracks.map((t) => {
												let role = guessRole(t, song, m);
												if (role === "lead" && used.has("lead")) role = "harmony";
												used.add(role);
												return { ...t, role };
											}),
										}));
									}}
									className={BTN_REF}
									disabled={song.totalSteps <= 0}
									title="音域・同時発音数・音符の長さから役割の初期値を入れる"
								>
									役割を推定
								</button>
								<button
									type="button"
									onClick={() => {
										const st = otomadStyleById(styleId);
										if (!st) return;
										if (!window.confirm(`「${st.name}」を当てます。各トラックの窓の設定は置き換わります（素材・場面はそのまま）。`)) return;
										setManifest((m) => applyOtomadStyle(m, st, song));
										setSelected(null);
									}}
									className={BTN_REF}
									disabled={song.totalSteps <= 0 || manifest.tracks.every((t) => !t.role)}
								>
									この型を当てる
								</button>
							</div>
							<p className="text-[10px] text-gray-500">{otomadStyleById(styleId)?.description}</p>
						</div>
						{manifest.tracks.map((t, ti) => {
							const warn = pitchWarningFor(t);
							const isSel = selected?.trackIdx === ti;
							return (
								<div key={ti} className={`${SECTION} ${isSel ? "border-blue-500/50" : ""}`} onClick={() => !isSel && setSelected({ trackIdx: ti, slot: 0 })}>
									<div className="flex items-center gap-2">
										<span className={LABEL}>MML</span>
										<select value={t.track} onChange={(e) => updateTrack(ti, (x) => ({ ...x, track: Number(e.target.value) }))} className={INPUT_SM}>
											{[...new Set([...song.tracks, t.track])].sort((a, b) => a - b).map((n) => (
												<option key={n} value={n}>
													@{n}
												</option>
											))}
										</select>
										<input value={t.label ?? ""} onChange={(e) => updateTrack(ti, (x) => ({ ...x, label: e.target.value }))} placeholder="名前（任意）" className={`${INPUT} flex-1`} />
										<select value={t.role ?? ""} onChange={(e) => updateTrack(ti, (x) => ({ ...x, role: (e.target.value || undefined) as OtomadRole | undefined }))} className={INPUT_SM} title="役割（型を当てるときに見る）">
											<option value="">役割なし</option>
											{OTOMAD_ROLES.map((r) => (
												<option key={r.value} value={r.value}>
													{r.label}
												</option>
											))}
										</select>
										<Toggle label="ミュート" value={!!t.muted} onChange={(v) => updateTrack(ti, (x) => ({ ...x, muted: v }))} />
										<button type="button" onClick={() => removeTrack(ti)} className={BTN_DEL} title="削除">
											<Trash2 size={14} />
										</button>
									</div>
									{warn && (
										<p className="flex items-start gap-1 text-[11px] text-amber-300">
											<AlertTriangle size={12} className="mt-0.5 shrink-0" /> {warn}
										</p>
									)}

									{/* 音 */}
									<p className={SUBHEAD}>音</p>
									<div className="flex flex-wrap items-end gap-2">
										{!t.audio.keymap && (
											<label className="flex flex-col gap-0.5">
												<span className={LABEL}>素材</span>
												<select
													value={t.audio.sourceId ?? ""}
													onChange={(e) => updateTrack(ti, (x) => ({ ...x, audio: { ...x.audio, sourceId: e.target.value || undefined } }))}
													className={INPUT_SM}
												>
													<option value="">（なし）</option>
													{manifest.sources.map((s) => (
														<option key={s.id} value={s.id}>
															{s.name}
														</option>
													))}
												</select>
											</label>
										)}
										<Toggle
											label="音高の範囲ごとに素材を分ける（keymap）"
											value={!!t.audio.keymap}
											onChange={(v) =>
												updateTrack(ti, (x) => ({
													...x,
													audio: {
														...x.audio,
														keymap: v
															? [{ fromNote: 0, toNote: 127, sourceId: x.audio.sourceId ?? audioSources[0]?.id ?? "" }]
															: undefined,
													},
												}))
											}
										/>
									</div>
									{t.audio.keymap && (
										<div className="space-y-1">
											{t.audio.keymap.map((k, ki) => {
												const setK = (patch: Partial<OtomadKeymapEntry>) =>
													updateTrack(ti, (x) => ({
														...x,
														audio: { ...x.audio, keymap: x.audio.keymap?.map((e, i) => (i === ki ? { ...e, ...patch } : e)) },
													}));
												return (
													<div key={ki} className="flex flex-wrap items-end gap-2">
														<NumField label="から（MIDI）" value={k.fromNote} onChange={(v) => setK({ fromNote: v ?? 0 })} step={1} min={0} max={127} width={60} suffix={noteNameOf(k.fromNote)} />
														<NumField label="まで" value={k.toNote} onChange={(v) => setK({ toNote: v ?? 127 })} step={1} min={0} max={127} width={60} suffix={noteNameOf(k.toNote)} />
														<label className="flex flex-col gap-0.5">
															<span className={LABEL}>素材</span>
															<select value={k.sourceId} onChange={(e) => setK({ sourceId: e.target.value })} className={INPUT_SM}>
																{manifest.sources.map((s) => (
																	<option key={s.id} value={s.id}>
																		{s.name}
																	</option>
																))}
															</select>
														</label>
														<NumField label="使い始め（空＝素材の設定）" value={k.inSec} onChange={(v) => setK({ inSec: v })} step={0.01} min={0} allowEmpty width={80} />
														<button
															type="button"
															onClick={() => updateTrack(ti, (x) => ({ ...x, audio: { ...x.audio, keymap: x.audio.keymap?.filter((_, i) => i !== ki) } }))}
															className={BTN_DEL}
														>
															<Trash2 size={13} />
														</button>
													</div>
												);
											})}
											<button
												type="button"
												onClick={() =>
													updateTrack(ti, (x) => {
														const last = x.audio.keymap?.[x.audio.keymap.length - 1];
														const from = last ? Math.min(127, last.toNote + 1) : 0;
														return { ...x, audio: { ...x.audio, keymap: [...(x.audio.keymap ?? []), { fromNote: from, toNote: 127, sourceId: audioSources[0]?.id ?? "" }] } };
													})
												}
												className={BTN_ADD}
											>
												<Plus size={11} /> 範囲を追加
											</button>
										</div>
									)}
									<div className="flex flex-wrap items-end gap-2">
										<label className="flex flex-col gap-0.5">
											<span className={LABEL}>音程</span>
											<select value={t.audio.pitch} onChange={(e) => updateTrack(ti, (x) => ({ ...x, audio: { ...x.audio, pitch: e.target.value as OtomadTrack["audio"]["pitch"] } }))} className={INPUT_SM}>
												<option value="follow">音符に合わせる（再生速度で）</option>
												<option value="fixed">素材のまま</option>
											</select>
										</label>
										{t.audio.pitch === "follow" && (
											<Toggle label="±6 半音に畳む（オクターブ移動）" value={!!t.audio.foldOctaves} onChange={(v) => updateTrack(ti, (x) => ({ ...x, audio: { ...x.audio, foldOctaves: v } }))} />
										)}
										<label className="flex flex-col gap-0.5">
											<span className={LABEL}>長さ</span>
											<select value={t.audio.length} onChange={(e) => updateTrack(ti, (x) => ({ ...x, audio: { ...x.audio, length: e.target.value as OtomadTrack["audio"]["length"] } }))} className={INPUT_SM}>
												<option value="note">音符の長さで切る</option>
												<option value="sample">素材の区間ぶん鳴らす</option>
											</select>
										</label>
										<NumField label="立ち上がり（ms）" value={t.audio.attackMs} onChange={(v) => updateTrack(ti, (x) => ({ ...x, audio: { ...x.audio, attackMs: v ?? 2 } }))} step={1} min={0} max={200} width={60} />
										<NumField label="フェードアウト（ms）" value={t.audio.releaseMs} onChange={(v) => updateTrack(ti, (x) => ({ ...x, audio: { ...x.audio, releaseMs: v ?? 20 } }))} step={1} min={0} max={500} width={60} />
										<NumField label="頭合わせ（ms、負で早出し）" value={t.audio.nudgeMs} onChange={(v) => updateTrack(ti, (x) => ({ ...x, audio: { ...x.audio, nudgeMs: v ?? 0 } }))} step={1} min={-200} max={200} width={60} />
										<NumField label="音量（dB）" value={t.audio.gainDb} onChange={(v) => updateTrack(ti, (x) => ({ ...x, audio: { ...x.audio, gainDb: v ?? 0 } }))} step={1} min={-24} max={12} width={60} />
										<NumField label="パン（-1〜1）" value={t.audio.pan} onChange={(v) => updateTrack(ti, (x) => ({ ...x, audio: { ...x.audio, pan: Math.max(-1, Math.min(1, v ?? 0)) } }))} step={0.1} min={-1} max={1} width={60} />
										<Toggle label="MML の v を音量に" value={t.audio.velocityToGain} onChange={(v) => updateTrack(ti, (x) => ({ ...x, audio: { ...x.audio, velocityToGain: v } }))} />
									</div>

									{/* 窓 */}
									<p className={SUBHEAD}>窓（映像）</p>
									<OtomadVisualFields
										visual={t.visual}
										onChange={(fn) => updateTrack(ti, (x) => ({ ...x, visual: fn(x.visual) }))}
										maxPolyphony={maxPolyphonyOf(t.track)}
										selectedSlot={isSel ? (selected?.slot ?? null) : null}
										onSelectSlot={(si) => setSelected({ trackIdx: ti, slot: si })}
									/>
									{sourceOf(t.audio.sourceId)?.kind === "audio" && t.visual.kind === "window" && !t.audio.keymap && (
										<p className="text-[10px] text-gray-500">音声だけの素材なので窓には何も出ません。絵を出すなら同じ MML トラックにもう 1 本（ミュート）を足して画像/動画を割り当ててください。</p>
									)}
								</div>
							);
						})}
						<div className="flex flex-wrap gap-1">
							{mmlTracksUnbound.map((t) => (
								<button key={t} type="button" onClick={() => addTrack(t)} className={BTN_REF}>
									<Plus size={11} /> @{t} を追加
								</button>
							))}
							{song.tracks.length > 0 && (
								<button type="button" onClick={() => addTrack(manifest.tracks[manifest.tracks.length - 1]?.track ?? song.tracks[0])} className={BTN_REF}>
									<Plus size={11} /> 同じ MML トラックにもう 1 本（絵と音を分ける）
								</button>
							)}
						</div>
						{manifest.tracks.length === 0 && <p className="text-[11px] text-gray-500">「曲」タブで MML を入れると、トラックをここに追加できます。</p>}
					</div>
				)}

				{tab === "scenes" && (
					<div className="space-y-2">
						<p className="text-[11px] text-gray-400 leading-relaxed">
							場面＝曲のパートごとの画面。開始小節から次の場面までのあいだ、背景・フィルタ・各トラックの窓の配置と演出を
							差し替えます。最初の場面より前は「トラック」タブの設定（base）がそのまま使われます。
						</p>
						<div className="flex flex-wrap gap-1">
							<button type="button" onClick={() => addSceneAt(barAtSec(playerHandle.current?.getTimeSec() ?? 0))} className={BTN_REF} disabled={song.totalSteps <= 0}>
								<Plus size={11} /> いま映している小節から場面を追加
							</button>
							<button type="button" onClick={() => addSceneAt(scenes.length ? Math.min(song.totalBars, (scenes[scenes.length - 1]?.startBar ?? 0) + 8) : 0)} className={BTN_REF} disabled={song.totalSteps <= 0}>
								<Plus size={11} /> 8 小節後に場面を追加
							</button>
						</div>
						{scenes.map((sc, si) => {
							const open = openSceneId === sc.id;
							const endBar = scenes[si + 1]?.startBar ?? song.totalBars;
							const stage = effectiveStage(manifest.stage, sc);
							return (
								<div key={sc.id} className={SECTION}>
									<div className="flex items-center gap-2">
										<button type="button" onClick={() => setOpenSceneId(open ? null : sc.id)} className="text-[12px] font-bold text-gray-100 text-left flex-1">
											{sc.name || `場面 ${si + 1}`} <span className="text-[10px] font-normal text-gray-400">小節 {sc.startBar + 1}〜{endBar}</span>
										</button>
										<button type="button" onClick={() => setManifest((m) => ({ ...m, scenes: [...(m.scenes ?? []), { ...sc, id: newId("scene"), name: `${sc.name} のコピー`, startBar: Math.min(song.totalBars, endBar) }] }))} className={BTN_REF}>
											複製
										</button>
										<button type="button" onClick={() => removeScene(sc.id)} className={BTN_DEL} title="削除">
											<Trash2 size={14} />
										</button>
									</div>
									{open && (
										<>
											<div className="flex flex-wrap items-end gap-2">
												<label className="flex flex-col gap-0.5">
													<span className={LABEL}>名前</span>
													<input value={sc.name} onChange={(e) => updateScene(sc.id, (x) => ({ ...x, name: e.target.value }))} className={INPUT_SM} />
												</label>
												<NumField label="開始小節（1 始まり）" value={sc.startBar + 1} onChange={(v) => updateScene(sc.id, (x) => ({ ...x, startBar: Math.max(0, (v ?? 1) - 1) }))} step={1} min={1} width={60} />
												<label className="flex flex-col gap-0.5">
													<span className={LABEL}>転換</span>
													<select value={sc.transition?.style ?? "cut"} onChange={(e) => updateScene(sc.id, (x) => ({ ...x, transition: { style: e.target.value as OtomadTransitionStyle, beats: x.transition?.beats ?? 1 } }))} className={INPUT_SM}>
														{OTOMAD_TRANSITIONS.map((t) => (
															<option key={t.value} value={t.value}>
																{t.label}
															</option>
														))}
													</select>
												</label>
												<NumField label="転換の長さ（拍）" value={sc.transition?.beats ?? 1} onChange={(v) => updateScene(sc.id, (x) => ({ ...x, transition: { style: x.transition?.style ?? "cut", beats: Math.max(0.25, v ?? 1) } }))} step={0.25} min={0.25} max={8} width={55} />
											</div>
											<p className={SUBHEAD}>背景（この場面だけ）</p>
											<div className="flex flex-wrap items-end gap-2">
												<Toggle label="色を変える" value={sc.stage?.bgColor !== undefined} onChange={(on) => updateScene(sc.id, (x) => ({ ...x, stage: { ...x.stage, bgColor: on ? stage.bgColor : undefined } }))} />
												{sc.stage?.bgColor !== undefined && (
													<input type="color" value={sc.stage.bgColor} onChange={(e) => updateScene(sc.id, (x) => ({ ...x, stage: { ...x.stage, bgColor: e.target.value } }))} className="h-7 w-10 bg-transparent" />
												)}
												<button type="button" onClick={() => setSceneBgPicker(sc.id)} className={BTN_REF}>
													画像を参照
												</button>
												{sc.stage?.bg !== undefined && (
													<button type="button" onClick={() => updateScene(sc.id, (x) => { const st = { ...x.stage }; delete st.bg; return { ...x, stage: st }; })} className={BTN_REF}>
														画像の上書きを外す
													</button>
												)}
												<button type="button" onClick={() => updateScene(sc.id, (x) => ({ ...x, stage: { ...x.stage, bg: null } }))} className={BTN_REF} title="全体の背景画像をこの場面では出さない">
													背景画像なしにする
												</button>
												<NumField label="暗くする（空＝全体の設定）" value={sc.stage?.bgDim} onChange={(v) => updateScene(sc.id, (x) => ({ ...x, stage: { ...x.stage, bgDim: v === undefined ? undefined : Math.max(0, Math.min(1, v)) } }))} step={0.05} min={0} max={1} allowEmpty width={60} />
												<label className="flex flex-col gap-0.5">
													<span className={LABEL}>画面フィルタ</span>
													<select
														value={["", "invert(1) grayscale(1)", "grayscale(1)", "sepia(1)", "hue-rotate(180deg)", "contrast(1.6) saturate(1.4)", "blur(2px)"].includes(sc.stage?.filter ?? "") ? (sc.stage?.filter ?? "") : "custom"}
														onChange={(e) => updateScene(sc.id, (x) => ({ ...x, stage: { ...x.stage, filter: e.target.value === "" ? undefined : e.target.value === "custom" ? (x.stage?.filter ?? "invert(1)") : e.target.value } }))}
														className={INPUT_SM}
													>
														<option value="">なし</option>
														<option value="invert(1) grayscale(1)">白黒反転（線画風）</option>
														<option value="grayscale(1)">白黒</option>
														<option value="sepia(1)">セピア</option>
														<option value="hue-rotate(180deg)">色相反転</option>
														<option value="contrast(1.6) saturate(1.4)">コントラスト強</option>
														<option value="blur(2px)">ぼかし</option>
														<option value="custom">CSS で指定…</option>
													</select>
												</label>
												{sc.stage?.filter !== undefined && (
													<input value={sc.stage.filter} onChange={(e) => updateScene(sc.id, (x) => ({ ...x, stage: { ...x.stage, filter: e.target.value } }))} className={`${INPUT} max-w-[220px]`} placeholder="invert(1) grayscale(1)" />
												)}
											</div>
											<p className={SUBHEAD}>トラックごとの見た目（この場面だけ）</p>
											{manifest.tracks.map((t, ti) => {
												const o = sc.tracks?.[String(ti)];
												const mode = o?.hidden ? "hidden" : o?.visual ? "override" : "inherit";
												return (
													<div key={ti} className="rounded border border-gray-700/60 p-2 space-y-2">
														<div className="flex items-center gap-2">
															<span className="font-mono text-[11px] text-gray-200">@{t.track}</span>
															<span className="text-[11px] text-gray-300 flex-1 truncate">{t.label || ""}</span>
															<select
																value={mode}
																onChange={(e) => {
																	const v = e.target.value;
																	updateScene(sc.id, (x) => {
																		const tracks = { ...(x.tracks ?? {}) };
																		if (v === "inherit") delete tracks[String(ti)];
																		else if (v === "hidden") tracks[String(ti)] = { hidden: true };
																		else tracks[String(ti)] = { visual: { ...t.visual, slots: t.visual.slots.map((sl) => ({ ...sl })) } };
																		return { ...x, tracks };
																	});
																}}
																className={INPUT_SM}
															>
																<option value="inherit">トラックの設定のまま</option>
																<option value="hidden">この場面では出さない</option>
																<option value="override">この場面だけ変える</option>
															</select>
														</div>
														{mode === "override" && o?.visual && (
															<OtomadVisualFields
																visual={effectiveVisual(t, sc, ti)}
																onChange={(fn) =>
																	updateScene(sc.id, (x) => ({
																		...x,
																		tracks: { ...x.tracks, [String(ti)]: { visual: fn(effectiveVisual(t, sc, ti)) } },
																	}))
																}
																maxPolyphony={maxPolyphonyOf(t.track)}
																selectedSlot={selected?.trackIdx === ti ? (selected?.slot ?? null) : null}
																onSelectSlot={(sidx) => setSelected({ trackIdx: ti, slot: sidx })}
															/>
														)}
													</div>
												);
											})}
										</>
									)}
								</div>
							);
						})}
						{scenes.length === 0 && <p className="text-[11px] text-gray-500">まだ場面がありません。曲全体が「トラック」タブの設定で描かれます。</p>}
					</div>
				)}

				{tab === "finish" && (
					<div className="space-y-2">
						<div className={SECTION}>
							<p className={HEADING}>原曲（off vocal など）</p>
							<div className="flex flex-wrap items-end gap-2">
								<label className="flex flex-col gap-0.5">
									<span className={LABEL}>素材</span>
									<select
										value={manifest.backing?.sourceId ?? ""}
										onChange={(e) =>
											update({ backing: e.target.value ? { sourceId: e.target.value, offsetSec: manifest.backing?.offsetSec ?? 0, volume: manifest.backing?.volume ?? 70 } : undefined })
										}
										className={INPUT_SM}
									>
										<option value="">（使わない）</option>
										{audioSources.map((s) => (
											<option key={s.id} value={s.id}>
												{s.name}
											</option>
										))}
									</select>
								</label>
								{manifest.backing && (
									<>
										<NumField label="曲の 0 秒で原曲は何秒か（負＝遅れて鳴る）" value={manifest.backing.offsetSec} onChange={(v) => update({ backing: { ...manifest.backing!, offsetSec: v ?? 0 } })} step={0.01} width={80} />
										<NumField label="音量" value={manifest.backing.volume} onChange={(v) => update({ backing: { ...manifest.backing!, volume: Math.max(0, Math.min(100, v ?? 70)) } })} step={1} min={0} max={100} width={55} />
									</>
								)}
							</div>
						</div>
						<div className={SECTION}>
							<p className={HEADING}>ガイド音（MML のシンセ。書き出しには入りません）</p>
							<div className="flex flex-wrap items-end gap-2">
								<Toggle label="鳴らす" value={manifest.guide.enabled} onChange={(v) => update({ guide: { ...manifest.guide, enabled: v } })} />
								<NumField label="音量" value={manifest.guide.volume} onChange={(v) => update({ guide: { ...manifest.guide, volume: Math.max(0, Math.min(100, v ?? 40)) } })} step={1} min={0} max={100} width={55} />
							</div>
						</div>
						<div className={SECTION}>
							<p className={HEADING}>背景</p>
							<div className="flex flex-wrap items-end gap-2">
								<label className="flex flex-col gap-0.5">
									<span className={LABEL}>色</span>
									<input type="color" value={manifest.stage.bgColor} onChange={(e) => update({ stage: { ...manifest.stage, bgColor: e.target.value } })} className="h-7 w-10 bg-transparent" />
								</label>
								<button type="button" onClick={() => setPicker({ kind: "bg" })} className={BTN_REF}>
									画像を参照
								</button>
								{manifest.stage.bg && (
									<button type="button" onClick={() => update({ stage: { ...manifest.stage, bg: undefined } })} className={BTN_REF}>
										画像を外す
									</button>
								)}
								<NumField label="暗くする（0〜1）" value={manifest.stage.bgDim} onChange={(v) => update({ stage: { ...manifest.stage, bgDim: Math.max(0, Math.min(1, v ?? 0)) } })} step={0.05} min={0} max={1} width={55} />
							</div>
						</div>
						<div className={SECTION}>
							<p className={HEADING}>クレジット（素材の出典・原曲）</p>
							<textarea value={manifest.credit ?? ""} onChange={(e) => update({ credit: e.target.value })} rows={2} className={INPUT} placeholder="例: 素材: ○○（自撮り） / 原曲: △△" />
						</div>
						<div className={SECTION}>
							<p className={HEADING}>書き出し（手元に保存）</p>
							<div className="flex flex-wrap items-end gap-2">
								<label className="flex flex-col gap-0.5">
									<span className={LABEL}>解像度</span>
									<select value={exportWidth} onChange={(e) => setExportWidth(Number(e.target.value))} className={INPUT_SM}>
										<option value={640}>640×360</option>
										<option value={1280}>1280×720</option>
									</select>
								</label>
								{exporting ? (
									<button type="button" onClick={cancelExport} className={BTN_REF}>
										<Square size={11} /> 中止
									</button>
								) : (
									<button type="button" onClick={() => void handleExportMp4()} disabled={song.totalSteps <= 0} className={BTN_REF}>
										<Download size={11} /> mp4 書き出し
									</button>
								)}
								<button type="button" onClick={() => void handleExportMidi()} disabled={song.totalSteps <= 0} className={BTN_REF}>
									<Download size={11} /> MIDI
								</button>
								<button type="button" onClick={handleExportJson} className={BTN_REF}>
									<Download size={11} /> JSON（Ctrl+S）
								</button>
							</div>
							{exporting && (
								<div className="space-y-1">
									<p className="text-[11px] text-blue-300">{exporting.text}</p>
									<div className="h-1.5 w-full rounded bg-gray-800">
										<div className="h-1.5 rounded bg-blue-500" style={{ width: `${Math.round(exporting.ratio * 100)}%` }} />
									</div>
								</div>
							)}
							{!canExportOffline() && <p className="text-[10px] text-amber-300">このブラウザは WebCodecs が無いので、再生しながらの実時間録画になります（コマ落ちすることがあります）。</p>}
							{tainted && <p className="text-[10px] text-amber-300">CORS 許可の無い URL 素材があるため、mp4 書き出しは失敗します。ローカルファイルか CORS 許可のある URL にしてください。</p>}
							<p className={SUBHEAD}>AviUtl へ（exo）</p>
							<p className="text-[10px] text-gray-500">音符ごとの動画・音声オブジェクトを拡張編集の exo にします。素材ファイルは AviUtl 側で読むので、素材フォルダのパスを入れてください。</p>
							<div className="flex flex-wrap items-end gap-2">
								<input value={exoDir} onChange={(e) => setExoDir(e.target.value)} placeholder="C:\\Users\\...\\素材" className={`${INPUT} flex-1 min-w-[200px]`} />
								<Toggle label="原曲も置く" value={exoBacking} onChange={setExoBacking} />
								<button type="button" onClick={() => void handleExportExo()} disabled={song.totalSteps <= 0} className={BTN_REF}>
									<Download size={11} /> exo 書き出し
								</button>
							</div>
						</div>
						<div className={SECTION}>
							<p className={HEADING}>投稿できるか</p>
							{postability.ok ? (
								<p className="text-[11px] text-emerald-300">投稿できます（{Math.round(postability.bytes / 1024)} KB）。ヘッダーの「{isEditing ? "更新" : "投稿に添付"}」から。</p>
							) : (
								<ul className="space-y-0.5">
									{postability.reasons.map((r) => (
										<li key={r} className="flex items-start gap-1 text-[11px] text-amber-300">
											<AlertTriangle size={12} className="mt-0.5 shrink-0" /> {r}
										</li>
									))}
								</ul>
							)}
							{postability.localSources.length > 0 && (
								<p className="text-[10px] text-gray-500">
									ローカル素材: {postability.localSources.map((s) => s.name).join(" / ")}。「素材」タブの各素材で URL に差し替えられます。
								</p>
							)}
						</div>
					</div>
				)}
			</div>

			{sceneBgPicker && (
				<ContentPicker
					mode="image"
					userId="otomad"
					onPick={(res) => {
						updateScene(sceneBgPicker, (x) => ({ ...x, stage: { ...x.stage, bg: { ref: res.ref, url: res.url } } }));
						setSceneBgPicker(null);
					}}
					onClose={() => setSceneBgPicker(null)}
				/>
			)}
			{picker && (
				<ContentPicker
					mode={picker.kind === "mml" ? "bgm" : "image"}
					bgmKind={picker.kind === "mml" ? "mml" : undefined}
					userId="otomad"
					onPick={handlePick}
					onClose={() => setPicker(null)}
				/>
			)}
			{mmlEditorOpen && (
				<MmlEditor
					initialMml={manifest.mml}
					isEditing
					onClose={() => setMmlEditorOpen(false)}
					onSave={(mml) => {
						update({ mml });
						setMmlEditorOpen(false);
					}}
				/>
			)}
		</div>
	);
}

/** 素材の URL を表示用に解決する（ローカルなら blob:）。エディタのプレビュー用。 */
export const useSourcePreviewUrl = (s: OtomadSource | null) => {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		if (!s) return;
		const map = new Map<string, string>();
		let alive = true;
		void resolveSourceUrl(s, map).then((u) => {
			if (alive) setUrl(u);
		});
		return () => {
			alive = false;
			for (const u of map.values()) URL.revokeObjectURL(u);
		};
	}, [s]);
	return url;
};
