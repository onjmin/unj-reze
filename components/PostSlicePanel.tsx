"use client";

import { ArrowLeft, Loader2, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { parseWalkRef } from "@/lib/asset-ref";
import { tryCapturePointer } from "@/lib/pointer-capture";
import type { Post } from "@/lib/types";
import { walkPresetToStdId } from "@/lib/walk-cycle";
import {
	animatedCellInRect,
	detectStandard,
	loadImage,
	rowAnimCellInRect,
	standardById,
	WALK_STANDARDS,
	WAY,
	type WalkStandard,
	type WayKey,
} from "@/lib/walk-sprite";
import type { PickResult } from "./ContentPicker";
import SpriteImage from "./SpriteImage";

interface PostSlicePanelProps {
	userId?: string;
	onPick: (res: PickResult) => void;
	/** 使用履歴からの再編集用。指定時はこの画像・切り出し設定から直接エディタを開く。 */
	initialAsset?: { ref: string; url: string; label?: string };
	/** アップロードした画像も切り出し元にできるようにする（素材定義パネル用）。 */
	allowUpload?: boolean;
	/** 切り出し確定ボタンの文言（既定「この範囲を使う」）。素材定義では「マイシートに保存」等に差し替える。 */
	confirmLabel?: string;
	/** 選択画面の説明文（省略時は既定の切り出し説明）。 */
	hint?: string;
}

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}
interface SliceImage {
	id: string | number;
	url: string;
	/** 投稿の walk_preset から復元済みの WalkStandard.id。分かっていれば規格選択を自動化する */
	walkStdId?: string;
}

const DISPLAY_MAX = 320;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// 投稿画像から矩形を切り出してスプライト素材化するパネル。
// 1枚の画像に複数キャラが入ったシート（RPGEN/RPGツクール風）でも、
// 自由な矩形選択 or グリッド分割で好きな位置から切り出せる。
export default function PostSlicePanel({
	userId,
	onPick,
	initialAsset,
	allowUpload,
	confirmLabel,
	hint,
}: PostSlicePanelProps) {
	const [posts, setPosts] = useState<Post[]>([]);
	const [failedPostIds, setFailedPostIds] = useState<Set<string>>(new Set());
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<SliceImage | null>(
		initialAsset ? { id: "history", url: initialAsset.url } : null,
	);
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		let alive = true;
		if (!userId) {
			Promise.resolve().then(() => setLoading(false));
			return;
		}
		Promise.resolve().then(() => {
			if (alive) setLoading(true);
		});
		const trimmedQ = query.trim();
		const req = trimmedQ
			? api.search.posts(trimmedQ, userId)
			: api.posts.list(userId, { hasImage: true, limit: 50 });
		req
			.then((data) => {
				if (alive) setPosts(Array.isArray(data) ? data : []);
			})
			.catch(() => {
				if (alive) setPosts([]);
			})
			.finally(() => {
				if (alive) setLoading(false);
			});
		return () => {
			alive = false;
		};
	}, [userId, query]);

	const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		setUploadError(null);
		if (!file.type.startsWith("image/")) {
			setUploadError("画像ファイルを選択してください");
			return;
		}
		if (file.size > MAX_UPLOAD_BYTES) {
			setUploadError("5MB以下の画像を選択してください");
			return;
		}
		const reader = new FileReader();
		reader.onload = async () => {
			setUploading(true);
			try {
				// アップロードしてURL化する。参照は絶対URLになるので、他の人の画面でも表示される。
				const res = await api.upload.image({ image: reader.result as string });
				setSelected({ id: "upload", url: res.url });
			} catch {
				setUploadError("アップロードに失敗しました");
			} finally {
				setUploading(false);
			}
		};
		reader.readAsDataURL(file);
	};

	const q = query.trim().toLowerCase();
	const allPostsAndReplies = useMemo(() => {
		const list: Post[] = [];
		const seen = new Set<string>();
		for (const p of posts) {
			if (!seen.has(p.id)) {
				seen.add(p.id);
				list.push(p);
			}
			if (p.replies) {
				for (const r of p.replies) {
					if (!seen.has(r.id)) {
						seen.add(r.id);
						list.push(r);
					}
				}
			}
		}
		return list;
	}, [posts]);

	const imagePosts = allPostsAndReplies.filter(
		(p) =>
			p.hasImage &&
			p.imageSrc &&
			(!q ||
				p.content.toLowerCase().includes(q) ||
				p.displayName.toLowerCase().includes(q)),
	);

	if (selected) {
		return (
			<SliceEditor
				image={selected}
				initialRef={selected.id === "history" ? initialAsset?.ref : undefined}
				onBack={() => setSelected(null)}
				onPick={onPick}
				confirmLabel={confirmLabel}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			<p className="text-[10px] text-gray-600 px-0.5">
				{hint ??
					"投稿画像から矩形を切り出してスプライトにします。複数キャラが入ったシートでも好きな位置を選べます。"}
			</p>
			{allowUpload && (
				<>
					<input
						ref={fileRef}
						type="file"
						accept="image/*"
						className="hidden"
						onChange={handleUpload}
					/>
					<button
						onClick={() => {
							setUploadError(null);
							fileRef.current?.click();
						}}
						disabled={uploading}
						className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[11px] text-gray-300 disabled:opacity-50"
					>
						{uploading ? (
							<Loader2 size={13} className="animate-spin" />
						) : (
							<Upload size={13} />
						)}
						画像をアップロードして切り出す
					</button>
					{uploadError && (
						<p className="text-[10px] text-red-400 px-0.5">{uploadError}</p>
					)}
					<p className="text-[10px] text-gray-600 px-0.5">
						または投稿から選ぶ:
					</p>
				</>
			)}
			<div className="relative">
				<Search
					size={13}
					className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500"
				/>
				<input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="投稿を検索"
					className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-7 pr-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
				/>
			</div>
			{loading ? (
				<div className="flex justify-center py-8">
					<Loader2 size={20} className="animate-spin text-gray-500" />
				</div>
			) : (
				<div className="grid grid-cols-3 gap-2">
					{imagePosts
						.filter((p) => !failedPostIds.has(p.id))
						.map((p) => (
							<button
								key={p.id}
								onClick={() =>
									setSelected({
										id: p.id,
										url: p.imageSrc!,
										walkStdId: walkPresetToStdId(p.walkPreset),
									})
								}
								className="aspect-square rounded-lg overflow-hidden border border-gray-700 hover:border-blue-500 bg-gray-900 group relative gimp-checkered-background-white"
							>
								<SpriteImage
									src={p.imageSrc}
									alt=""
									onError={() =>
										setFailedPostIds((prev) => new Set(prev).add(p.id))
									}
									className="w-full h-full object-cover"
									fit="cover"
									animFrames={p.animFrames}
									animFps={p.animFps}
									walkPreset={p.walkPreset}
									animate={false}
								/>
								<span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-gray-300 px-1 truncate">
									#{p.id}
								</span>
							</button>
						))}
					{imagePosts.filter((p) => !failedPostIds.has(p.id)).length === 0 && (
						<p className="col-span-3 text-center text-[11px] text-gray-600 py-8">
							該当する投稿がありません
						</p>
					)}
				</div>
			)}
		</div>
	);
}

function clamp(n: number, min: number, max: number) {
	return Math.min(max, Math.max(min, n));
}

interface InitialCrop {
	rect: Rect;
	outKind: "sprite" | "walk";
	templateId: string;
	fieldW: number;
	fieldH: number;
	fieldFrames: number;
	fieldWays: string;
	fieldOffsetY: number;
	fieldScale: string;
	fieldRow: number;
	fieldPlayMode: "loop" | "pingpong" | "once";
	fieldFps: number;
}

/** 既存の ref（url:...#x,y,w,h や walk:...:u:...#x,y,w,h,...）から編集用の初期状態を復元する。 */
function parseInitialCrop(ref: string): InitialCrop | null {
	if (ref.startsWith("walk:")) {
		const wr = parseWalkRef(ref);
		if (!wr || !wr.crop) return null;
		const [x, y, w, h] = wr.crop;
		let std: WalkStandard;
		if (wr.stdId === "auto") {
			std = detectStandard(w, h);
			if (wr.frames && wr.frames > 0) std = { ...std, frames: wr.frames };
		} else {
			std = standardById(wr.stdId);
		}
		return {
			rect: { x, y, w, h },
			outKind: "walk",
			templateId: wr.stdId,
			fieldW: Math.round(w / std.frames),
			fieldH: Math.round(h / std.ways.length),
			fieldFrames: wr.frames ?? std.frames,
			fieldWays: std.ways.map((k) => k.key).join(""),
			fieldOffsetY: wr.offsetY ?? 0,
			fieldScale: wr.renderScale ? String(wr.renderScale) : "",
			fieldRow: wr.row ?? 0,
			fieldPlayMode: wr.playMode ?? "loop",
			fieldFps: wr.fps ?? 6,
		};
	}
	if (ref.startsWith("url:")) {
		const hashIdx = ref.indexOf("#");
		if (hashIdx === -1) return null;
		const parts = ref
			.slice(hashIdx + 1)
			.split(",")
			.map(Number);
		if (parts.length < 4 || parts.slice(0, 4).some((n) => isNaN(n)))
			return null;
		const [x, y, w, h] = parts;
		const std = WALK_STANDARDS[0];
		return {
			rect: { x, y, w, h },
			outKind: "sprite",
			templateId: std.id,
			fieldW: std.w,
			fieldH: std.h,
			fieldFrames: std.frames,
			fieldWays: std.ways.map((k) => k.key).join(""),
			fieldOffsetY: 0,
			fieldScale: "",
			fieldRow: 0,
			fieldPlayMode: "loop",
			fieldFps: 6,
		};
	}
	return null;
}

function SliceEditor({
	image,
	initialRef,
	onBack,
	onPick,
	confirmLabel,
}: {
	image: SliceImage;
	initialRef?: string;
	onBack: () => void;
	onPick: (res: PickResult) => void;
	confirmLabel?: string;
}) {
	const initialCrop = useMemo(
		() => (initialRef ? parseInitialCrop(initialRef) : null),
		[initialRef],
	);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const wrapRef = useRef<HTMLDivElement>(null);
	const [img, setImg] = useState<HTMLImageElement | null>(null);
	const [error, setError] = useState(false);
	const [scale, setScale] = useState(1);
	const [rect, setRect] = useState<Rect | null>(initialCrop?.rect ?? null);
	const draggingRef = useRef<{ startX: number; startY: number } | null>(null);
	const didInitRef = useRef(false);

	const [gridMode, setGridMode] = useState(false);
	const [tileW, setTileW] = useState(32);
	const [tileH, setTileH] = useState(32);

	// 投稿の walk_preset から規格が分かっていれば(=歩行グラモードで保存された投稿)、
	// initialRef が無くても自動的に「歩行グラ」モード＆その規格を初期値にする。
	// pixel-size推測(detectStandard)に頼らず、保存時に確定した規格をそのまま使う。
	const presetStd = image.walkStdId ? standardById(image.walkStdId) : null;

	const [outKind, setOutKind] = useState<"sprite" | "walk">(
		initialCrop?.outKind ?? (presetStd ? "walk" : "sprite"),
	);

	// 歩行グラの「コマ数/サイズ」。テンプレ選択時は既定値を一度だけ流し込むだけで、
	// 以後は自由に編集できる入力欄にする（選択に連動して固定はしない）。
	const [templateId, setTemplateId] = useState<string>(
		initialCrop?.templateId ?? presetStd?.id ?? WALK_STANDARDS[0].id,
	);
	const [fieldW, setFieldW] = useState<number>(
		initialCrop?.fieldW ?? presetStd?.w ?? WALK_STANDARDS[0].w,
	);
	const [fieldH, setFieldH] = useState<number>(
		initialCrop?.fieldH ?? presetStd?.h ?? WALK_STANDARDS[0].h,
	);
	const [fieldFrames, setFieldFrames] = useState<number>(
		initialCrop?.fieldFrames ?? presetStd?.frames ?? WALK_STANDARDS[0].frames,
	);
	const [fieldWays, setFieldWays] = useState<string>(
		initialCrop?.fieldWays ??
			(presetStd ?? WALK_STANDARDS[0]).ways.map((w) => w.key).join(""),
	);
	const [fieldRow, setFieldRow] = useState<number>(initialCrop?.fieldRow ?? 0);
	const [fieldPlayMode, setFieldPlayMode] = useState<
		"loop" | "pingpong" | "once"
	>(initialCrop?.fieldPlayMode ?? "loop");
	const [fieldFps, setFieldFps] = useState<number>(initialCrop?.fieldFps ?? 6);

	const applyTemplate = (id: string) => {
		setTemplateId(id);
		const std = standardById(id);
		setFieldW(std.w);
		setFieldH(std.h);
		setFieldFrames(std.frames);
		setFieldWays(std.ways.map((w) => w.key).join(""));
	};

	const wayKeys = useMemo(
		() =>
			fieldWays
				.toLowerCase()
				.split("")
				.filter((c): c is WayKey => c in WAY),
		[fieldWays],
	);

	// 描画時のセル下端揃え位置（下端からの距離px・既定0・負値可）と表示倍率（小数可・未指定はセルに自動フィット）。
	const [fieldOffsetY, setFieldOffsetY] = useState(
		initialCrop?.fieldOffsetY ?? 0,
	);
	const [fieldScale, setFieldScale] = useState(initialCrop?.fieldScale ?? "");
	const alignCanvasRef = useRef<HTMLCanvasElement>(null);

	// 「方向×フレーム」1体分の固定サイズブロック。複数キャラが連結したシートでも、
	// クリックした地点を幅/高さ単位のグリッドに吸着させて好きな1体を起点に選べる。
	const isWalkTemplateReady =
		outKind === "walk" &&
		fieldW > 0 &&
		fieldH > 0 &&
		fieldFrames > 0 &&
		wayKeys.length > 0;
	const blockW = isWalkTemplateReady ? fieldW * fieldFrames : tileW;
	const blockH = isWalkTemplateReady ? fieldH * wayKeys.length : tileH;

	const url = image.url;

	useEffect(() => {
		let alive = true;
		loadImage(url)
			.then((im) => {
				if (!alive) return;
				setImg(im);
				const s = Math.min(
					1,
					DISPLAY_MAX / Math.max(im.naturalWidth, im.naturalHeight),
				);
				setScale(s);
			})
			.catch(() => {
				if (alive) setError(true);
			});
		return () => {
			alive = false;
		};
	}, [url]);

	// 初期選択: 既存の切り出し設定があればそれを復元、無ければ (0,0) 起点のデフォルト範囲を選択しておく。
	useEffect(() => {
		if (!img || didInitRef.current) return;
		didInitRef.current = true;
		if (!initialCrop) {
			Promise.resolve().then(() =>
				setRect({
					x: 0,
					y: 0,
					w: Math.min(blockW, img.naturalWidth),
					h: Math.min(blockH, img.naturalHeight),
				}),
			);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [img]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !img) return;
		const dw = Math.round(img.naturalWidth * scale);
		const dh = Math.round(img.naturalHeight * scale);
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = dw * dpr;
		canvas.height = dh * dpr;
		canvas.style.width = `${dw}px`;
		canvas.style.height = `${dh}px`;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, dw, dh);
		ctx.drawImage(img, 0, 0, dw, dh);

		if (gridMode || isWalkTemplateReady) {
			ctx.strokeStyle = "rgba(59,130,246,0.35)";
			ctx.lineWidth = 1;
			for (let x = 0; x <= dw; x += blockW * scale) {
				ctx.beginPath();
				ctx.moveTo(x + 0.5, 0);
				ctx.lineTo(x + 0.5, dh);
				ctx.stroke();
			}
			for (let y = 0; y <= dh; y += blockH * scale) {
				ctx.beginPath();
				ctx.moveTo(0, y + 0.5);
				ctx.lineTo(dw, y + 0.5);
				ctx.stroke();
			}
		}

		if (rect) {
			ctx.strokeStyle = "#3b82f6";
			ctx.lineWidth = 2;
			ctx.strokeRect(
				rect.x * scale,
				rect.y * scale,
				rect.w * scale,
				rect.h * scale,
			);
			ctx.fillStyle = "rgba(59,130,246,0.15)";
			ctx.fillRect(
				rect.x * scale,
				rect.y * scale,
				rect.w * scale,
				rect.h * scale,
			);
		}
	}, [
		img,
		scale,
		rect,
		gridMode,
		tileW,
		tileH,
		isWalkTemplateReady,
		blockW,
		blockH,
	]);

	// 下端揃え位置プレビュー: 切り出したコマを「セル」内に実際の描画ルールで配置し、
	// 揃え位置のライン（下線）を重ねてアニメーション表示する。オフセット/倍率を数値だけで調整するより分かりやすくする。
	useEffect(() => {
		const canvas = alignCanvasRef.current;
		if (
			!canvas ||
			!img ||
			outKind !== "walk" ||
			!rect ||
			rect.w <= 0 ||
			rect.h <= 0 ||
			wayKeys.length === 0
		)
			return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const std = {
			id: "preview",
			label: "",
			w: rect.w / fieldFrames,
			h: rect.h / wayKeys.length,
			frames: fieldFrames,
			ways: wayKeys.map((k) => WAY[k]),
		};
		const showDirs = wayKeys.length > 1 ? wayKeys : [wayKeys[0]];
		let raf = 0;

		const render = (t: DOMHighResTimeStamp) => {
			raf = requestAnimationFrame(render);
			const timeSec = t / 1000;
			let cell;
			if (templateId === "row_anim") {
				cell = rowAnimCellInRect([rect.x, rect.y, rect.w, rect.h], {
					frames: fieldFrames,
					row: fieldRow,
					playMode: fieldPlayMode,
					fps: fieldFps,
					timeSec,
				});
			} else {
				const curDir = showDirs[Math.floor(timeSec / 1) % showDirs.length];
				cell = animatedCellInRect(std, [rect.x, rect.y, rect.w, rect.h], {
					dir: curDir,
					moving: true,
					timeSec,
					fps: 6,
					row: fieldRow,
				});
			}

			const CW = canvas.width,
				CH = canvas.height;
			const CELL = 64; // 「セル」の想定サイズ(px)。仮想タイル1マス分。
			const FLOOR_Y = CH - 16; // セル下端（床）のyプレビュー座標
			ctx.clearRect(0, 0, CW, CH);

			// 市松模様の背景（透過部分を分かりやすく）
			const check = 8;
			for (let y = 0; y < CH; y += check) {
				for (let x = 0; x < CW; x += check) {
					ctx.fillStyle =
						(x / check + y / check) % 2 === 0 ? "#1a1d26" : "#12141a";
					ctx.fillRect(x, y, check, check);
				}
			}

			const userScale = parseFloat(fieldScale);
			const zoom =
				!isNaN(userScale) && userScale > 0 ? userScale : CELL / cell.sh;
			const destW = cell.sw * zoom;
			const destH = cell.sh * zoom;
			const destX = (CW - destW) / 2;
			const destY = FLOOR_Y - destH - fieldOffsetY * zoom;

			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(
				img,
				cell.sx,
				cell.sy,
				cell.sw,
				cell.sh,
				destX,
				destY,
				destW,
				destH,
			);

			// セル枠（想定タイル1マス分）
			ctx.strokeStyle = "rgba(255,255,255,0.25)";
			ctx.lineWidth = 1;
			ctx.strokeRect(
				(CW - CELL) / 2 + 0.5,
				FLOOR_Y - CELL + 0.5,
				CELL - 1,
				CELL - 1,
			);

			// 床（セル下端）ライン
			ctx.strokeStyle = "rgba(255,255,255,0.5)";
			ctx.setLineDash([]);
			ctx.beginPath();
			ctx.moveTo(0, FLOOR_Y + 0.5);
			ctx.lineTo(CW, FLOOR_Y + 0.5);
			ctx.stroke();

			// 揃え位置（下線）: 下端揃え位置pxぶん床から動かした位置（負値なら床より下）
			const alignY = FLOOR_Y - fieldOffsetY * zoom;
			ctx.strokeStyle = "#f59e0b";
			ctx.lineWidth = 2;
			ctx.setLineDash([4, 3]);
			ctx.beginPath();
			ctx.moveTo(0, alignY + 0.5);
			ctx.lineTo(CW, alignY + 0.5);
			ctx.stroke();
			ctx.setLineDash([]);
		};
		raf = requestAnimationFrame(render);
		return () => cancelAnimationFrame(raf);
	}, [
		img,
		outKind,
		rect,
		fieldFrames,
		wayKeys,
		fieldOffsetY,
		fieldScale,
		templateId,
		fieldRow,
		fieldPlayMode,
		fieldFps,
	]);

	const toImagePoint = (clientX: number, clientY: number) => {
		const canvas = canvasRef.current;
		if (!canvas || !img) return null;
		const box = canvas.getBoundingClientRect();
		const x = clamp((clientX - box.left) / scale, 0, img.naturalWidth);
		const y = clamp((clientY - box.top) / scale, 0, img.naturalHeight);
		return { x, y };
	};

	const handlePointerDown = (e: React.PointerEvent) => {
		if (!img) return;
		const p = toImagePoint(e.clientX, e.clientY);
		if (!p) return;
		tryCapturePointer(e.target as Element, e.pointerId);

		if (isWalkTemplateReady) {
			// 歩行グラモード: クリックした地点を「幅」「高さ」の単位グリッドに吸着させ、その位置をブロックの左上にする。
			// 連結したシートでも、目的のキャラの左上に近い場所をクリックすれば起点に選べる。
			const snapX = Math.floor(p.x / fieldW) * fieldW;
			const snapY = Math.floor(p.y / fieldH) * fieldH;
			const x = clamp(snapX, 0, Math.max(0, img.naturalWidth - blockW));
			const y = clamp(snapY, 0, Math.max(0, img.naturalHeight - blockH));
			const w = Math.min(blockW, img.naturalWidth - x);
			const h = Math.min(blockH, img.naturalHeight - y);
			setRect({
				x: Math.round(x),
				y: Math.round(y),
				w: Math.round(w),
				h: Math.round(h),
			});

			if (blockH > 0) {
				const clickedRow = Math.floor(snapY / blockH);
				if (clickedRow >= 0) setFieldRow(clickedRow);
			}
			return;
		}

		if (gridMode) {
			const col = Math.floor(p.x / tileW);
			const row = Math.floor(p.y / tileH);
			const x = clamp(col * tileW, 0, img.naturalWidth);
			const y = clamp(row * tileH, 0, img.naturalHeight);
			const w = Math.min(tileW, img.naturalWidth - x);
			const h = Math.min(tileH, img.naturalHeight - y);
			setRect({ x, y, w, h });
			return;
		}

		draggingRef.current = { startX: p.x, startY: p.y };
		setRect({ x: p.x, y: p.y, w: 0, h: 0 });
	};

	const handlePointerMove = (e: React.PointerEvent) => {
		if (isWalkTemplateReady || gridMode || !draggingRef.current || !img) return;
		const p = toImagePoint(e.clientX, e.clientY);
		if (!p) return;
		const { startX, startY } = draggingRef.current;
		const x = Math.min(startX, p.x);
		const y = Math.min(startY, p.y);
		const w = Math.abs(p.x - startX);
		const h = Math.abs(p.y - startY);
		setRect({
			x: Math.round(x),
			y: Math.round(y),
			w: Math.round(w),
			h: Math.round(h),
		});
	};

	const handlePointerUp = () => {
		draggingRef.current = null;
	};

	const updateRectField = (key: keyof Rect, value: number) => {
		setRect((prev) => {
			const base = prev ?? { x: 0, y: 0, w: 0, h: 0 };
			const next = { ...base, [key]: Math.max(0, Math.round(value || 0)) };
			if (img) {
				next.x = clamp(next.x, 0, img.naturalWidth);
				next.y = clamp(next.y, 0, img.naturalHeight);
				next.w = clamp(next.w, 0, img.naturalWidth - next.x);
				next.h = clamp(next.h, 0, img.naturalHeight - next.y);
			}
			return next;
		});
	};

	const canConfirm = !!rect && rect.w > 0 && rect.h > 0;

	const confirm = () => {
		if (!rect || !canConfirm) return;
		if (outKind === "sprite") {
			const crop = `${rect.x},${rect.y},${rect.w},${rect.h}`;
			onPick({
				ref: `url:${url}#${crop}`,
				url,
				label: `画像 #${image.id} 切り出し`,
			});
		} else {
			// 幅/高さ/コマ数/方向転換が既知の規格と完全一致すればその規格IDを使う。
			// 自由に編集済みでどれとも一致しなければ stdId=auto + コマ数指定（方向の並びは自動判定に委ねる）。
			const waysStr = wayKeys.join("");
			const matched = WALK_STANDARDS.find(
				(s) =>
					s.w === fieldW &&
					s.h === fieldH &&
					s.frames === fieldFrames &&
					s.ways.map((w) => w.key).join("") === waysStr,
			);
			const stdId = matched ? matched.id : "auto";

			// #sx,sy,sw,sh[,frames[,offsetY[,scale]]]（asset-ref.ts の parseWalkRef と対応）。
			// offsetY/scale を使う場合は位置合わせのため frames 欄を必ず埋める。
			const scaleN = parseFloat(fieldScale);
			const hasScale = !isNaN(scaleN) && scaleN > 0;
			const hasOffset = fieldOffsetY !== 0;
			const isRowAnim = stdId === "row_anim";
			const hasRow = isRowAnim || fieldRow !== 0;
			const hasPlayMode = isRowAnim || fieldPlayMode !== "loop";
			const hasFps = isRowAnim || fieldFps !== 6;

			const parts: (number | string)[] = [rect.x, rect.y, rect.w, rect.h];
			if (!matched || hasOffset || hasScale || hasRow || hasPlayMode || hasFps)
				parts.push(fieldFrames);
			if (hasOffset || hasScale || hasRow || hasPlayMode || hasFps)
				parts.push(fieldOffsetY);
			if (hasScale || hasRow || hasPlayMode || hasFps)
				parts.push(hasScale ? scaleN : 1);
			if (hasRow || hasPlayMode || hasFps) parts.push(fieldRow);
			if (hasPlayMode || hasFps) parts.push(fieldPlayMode);
			if (hasFps) parts.push(fieldFps);
			const crop = parts.join(",");

			const label = matched
				? `画像 #${image.id} アニメ切り出し（${matched.label}）`
				: `画像 #${image.id} アニメ切り出し`;
			onPick({ ref: `walk:${stdId}:u:${url}#${crop}`, url, label });
		}
	};

	const btn = (active: boolean) =>
		`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${active ? "bg-blue-600 text-white border-blue-500" : "bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800"}`;

	if (error) {
		return (
			<div className="flex flex-col gap-2">
				<button
					onClick={onBack}
					className="flex items-center gap-1 text-[10px] text-blue-500 hover:underline font-bold w-fit"
				>
					<ArrowLeft size={11} />
					投稿一覧に戻る
				</button>
				<p className="text-center text-[11px] text-red-500 py-8">
					画像の読み込みに失敗しました。
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<button
				onClick={onBack}
				className="flex items-center gap-1 text-[10px] text-blue-500 hover:underline font-bold w-fit"
			>
				<ArrowLeft size={11} />
				投稿一覧に戻る
			</button>

			{!img ? (
				<div className="flex justify-center py-8">
					<Loader2 size={20} className="animate-spin text-gray-500" />
				</div>
			) : (
				<>
					<div
						ref={wrapRef}
						className="flex justify-center bg-black/40 border border-gray-800 rounded-lg p-2 overflow-auto gimp-checkered-background-white"
					>
						<canvas
							ref={canvasRef}
							onPointerDown={handlePointerDown}
							onPointerMove={handlePointerMove}
							onPointerUp={handlePointerUp}
							onPointerLeave={handlePointerUp}
							style={{
								imageRendering: "pixelated",
								touchAction: "none",
								cursor:
									gridMode || isWalkTemplateReady ? "pointer" : "crosshair",
							}}
						/>
					</div>

					<div className="flex flex-wrap gap-1.5">
						<button
							className={btn(outKind === "sprite")}
							onClick={() => setOutKind("sprite")}
						>
							スプライト（静止画）
						</button>
						<button
							className={btn(outKind === "walk")}
							onClick={() => setOutKind("walk")}
						>
							歩行グラ / 簡易アニメ
						</button>
					</div>

					{outKind === "sprite" && (
						<>
							<div className="flex flex-wrap gap-1.5">
								<button
									className={btn(!gridMode)}
									onClick={() => setGridMode(false)}
								>
									自由選択
								</button>
								<button
									className={btn(gridMode)}
									onClick={() => setGridMode(true)}
								>
									▦ グリッド分割
								</button>
							</div>

							{gridMode && (
								<div className="flex items-center gap-2 text-[10px] text-gray-500">
									<span>マスサイズ(px):</span>
									<input
										type="number"
										min={1}
										value={tileW}
										onChange={(e) =>
											setTileW(Math.max(1, parseInt(e.target.value, 10) || 1))
										}
										className="w-14 bg-gray-900 border border-gray-800 rounded px-1.5 py-1 text-gray-200"
									/>
									<span>×</span>
									<input
										type="number"
										min={1}
										value={tileH}
										onChange={(e) =>
											setTileH(Math.max(1, parseInt(e.target.value, 10) || 1))
										}
										className="w-14 bg-gray-900 border border-gray-800 rounded px-1.5 py-1 text-gray-200"
									/>
									<span className="text-gray-600">
										（RPGツクール/RPGEN規格: 16, 32, 48等）
									</span>
								</div>
							)}
						</>
					)}

					{outKind === "walk" && (
						<div className="flex flex-col gap-2 p-2.5 rounded-lg border border-gray-800 bg-[#11131a]">
							<div>
								<div className="text-xs font-bold text-gray-200">
									コマ数 / サイズ変更
								</div>
								<p className="text-[10px] text-gray-600">
									歩行グラ規格・簡易アニメ（1行ストリップ）に対応できます
								</p>
							</div>

							<label className="flex flex-col gap-0.5 text-[10px] text-gray-500">
								テンプレ
								<select
									value={templateId}
									onChange={(e) => applyTemplate(e.target.value)}
									className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
								>
									{WALK_STANDARDS.map((s) => (
										<option key={s.id} value={s.id}>
											{s.label}
										</option>
									))}
								</select>
							</label>

							{templateId === "row_anim" && (
								<div className="p-2 rounded bg-blue-950/40 border border-blue-900/60 space-y-2 text-[10px]">
									<p className="text-blue-300 font-bold">
										簡易アニメ（行指定・方向固定）設定
									</p>

									<div className="grid grid-cols-2 gap-1.5">
										<label className="flex flex-col gap-0.5 text-gray-400">
											再生モード
											<select
												value={fieldPlayMode}
												onChange={(e) =>
													setFieldPlayMode(
														e.target.value as "loop" | "pingpong" | "once",
													)
												}
												className="bg-gray-900 border border-gray-800 rounded px-1.5 py-1 text-gray-200 outline-none focus:border-blue-500"
											>
												<option value="loop">ループ (標準)</option>
												<option value="pingpong">往復 (ピンポン)</option>
												<option value="once">単発 (1回のみ / 技・攻撃)</option>
											</select>
										</label>

										<label className="flex flex-col gap-0.5 text-gray-400">
											速度 (FPS)
											<input
												type="number"
												min={1}
												max={30}
												value={fieldFps}
												onChange={(e) =>
													setFieldFps(
														Math.max(1, parseInt(e.target.value, 10) || 1),
													)
												}
												className="bg-gray-900 border border-gray-800 rounded px-1.5 py-1 text-gray-200 outline-none focus:border-blue-500"
											/>
										</label>
									</div>
								</div>
							)}

							<label className="flex flex-col gap-0.5 text-[10px] text-gray-500">
								対象行インデックス (0始まり)
								<input
									type="number"
									min={0}
									value={fieldRow}
									onChange={(e) =>
										setFieldRow(Math.max(0, parseInt(e.target.value, 10) || 0))
									}
									className="bg-gray-900 border border-gray-800 rounded px-1.5 py-1 text-gray-200 outline-none focus:border-blue-500"
								/>
							</label>
							<p className="text-[10px] text-gray-600">
								複数キャラ・素材が縦に並んだシートから対象の行（0, 1,
								2…）を選択できます。画像上のキャラをクリックしても移動できます。
							</p>

							<div className="grid grid-cols-2 gap-1.5">
								<label className="flex flex-col gap-0.5 text-[10px] text-gray-500">
									幅
									<input
										type="number"
										min={1}
										value={fieldW}
										onChange={(e) =>
											setFieldW(Math.max(1, parseInt(e.target.value, 10) || 1))
										}
										className="bg-gray-900 border border-gray-800 rounded px-1.5 py-1 text-gray-200"
									/>
								</label>
								<label className="flex flex-col gap-0.5 text-[10px] text-gray-500">
									高さ
									<input
										type="number"
										min={1}
										value={fieldH}
										onChange={(e) =>
											setFieldH(Math.max(1, parseInt(e.target.value, 10) || 1))
										}
										className="bg-gray-900 border border-gray-800 rounded px-1.5 py-1 text-gray-200"
									/>
								</label>
							</div>

							<label className="flex flex-col gap-0.5 text-[10px] text-gray-500">
								コマ数
								<input
									type="number"
									min={1}
									value={fieldFrames}
									onChange={(e) =>
										setFieldFrames(
											Math.max(1, parseInt(e.target.value, 10) || 1),
										)
									}
									className="bg-gray-900 border border-gray-800 rounded px-1.5 py-1 text-gray-200"
								/>
							</label>

							{templateId !== "row_anim" && (
								<>
									<label className="flex flex-col gap-0.5 text-[10px] text-gray-500">
										方向転換
										<input
											value={fieldWays}
											onChange={(e) => setFieldWays(e.target.value)}
											className="bg-gray-900 border border-gray-800 rounded px-1.5 py-1 text-gray-200 font-mono"
										/>
									</label>
									<p className="text-[10px] text-gray-600">
										wasd(前後左右)+qezc(ナナメ)
									</p>
								</>
							)}

							<div className="grid grid-cols-2 gap-1.5">
								<label className="flex flex-col gap-0.5 text-[10px] text-gray-500">
									下端揃え位置(px)
									<input
										type="number"
										step={1}
										value={fieldOffsetY}
										onChange={(e) =>
											setFieldOffsetY(parseInt(e.target.value, 10) || 0)
										}
										className="bg-gray-900 border border-gray-800 rounded px-1.5 py-1 text-gray-200"
									/>
								</label>
								<label className="flex flex-col gap-0.5 text-[10px] text-gray-500">
									表示倍率
									<input
										type="number"
										min={0}
										step={0.1}
										value={fieldScale}
										onChange={(e) => setFieldScale(e.target.value)}
										placeholder="自動"
										className="bg-gray-900 border border-gray-800 rounded px-1.5 py-1 text-gray-200"
									/>
								</label>
							</div>
							<p className="text-[10px] text-gray-600">
								下端揃え位置:
								セル下端からの距離(px)。正で上、負で下にずれます。表示倍率:
								小数も可（未指定はセルに自動フィット）。
							</p>

							{rect && rect.w > 0 && rect.h > 0 && wayKeys.length > 0 && (
								<div className="flex flex-col gap-1 items-center">
									<span className="text-[10px] text-gray-500 self-start">
										揃え位置プレビュー（オレンジの下線が揃え位置）
									</span>
									<canvas
										ref={alignCanvasRef}
										width={160}
										height={110}
										className="rounded-lg border border-gray-800"
										style={{ imageRendering: "pixelated" }}
									/>
								</div>
							)}

							{isWalkTemplateReady && (
								<p className="text-[10px] text-gray-600">
									画像をクリックすると、その地点を含む「幅×高さ」の単位マスに吸着してキャラの左上にします。複数キャラが連結していても、目的のキャラの近くをクリックすれば起点に選べます。
								</p>
							)}
						</div>
					)}

					<div className="grid grid-cols-4 gap-1.5 text-[10px] text-gray-500">
						<label className="flex flex-col gap-0.5">
							X
							<input
								type="number"
								value={rect?.x ?? 0}
								onChange={(e) => updateRectField("x", Number(e.target.value))}
								className="bg-gray-900 border border-gray-800 rounded px-1.5 py-1 text-gray-200"
							/>
						</label>
						<label className="flex flex-col gap-0.5">
							Y
							<input
								type="number"
								value={rect?.y ?? 0}
								onChange={(e) => updateRectField("y", Number(e.target.value))}
								className="bg-gray-900 border border-gray-800 rounded px-1.5 py-1 text-gray-200"
							/>
						</label>
						<label className="flex flex-col gap-0.5">
							幅
							<input
								type="number"
								value={rect?.w ?? 0}
								onChange={(e) => updateRectField("w", Number(e.target.value))}
								className="bg-gray-900 border border-gray-800 rounded px-1.5 py-1 text-gray-200"
							/>
						</label>
						<label className="flex flex-col gap-0.5">
							高さ
							<input
								type="number"
								value={rect?.h ?? 0}
								onChange={(e) => updateRectField("h", Number(e.target.value))}
								className="bg-gray-900 border border-gray-800 rounded px-1.5 py-1 text-gray-200"
							/>
						</label>
					</div>

					<button
						onClick={confirm}
						disabled={!canConfirm}
						className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold"
					>
						{confirmLabel ?? "この範囲を使う"}
					</button>
				</>
			)}
		</div>
	);
}
