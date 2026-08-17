"use client";

import {
	Download,
	FileUp,
	Image as ImageIcon,
	Link2,
	Loader2,
	Pencil,
	Plus,
	Scissors,
	Search,
	Trash2,
	Upload,
} from "lucide-react";
import {
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { api } from "@/lib/api";
import { buildWalkRef } from "@/lib/asset-ref";
import type { Post } from "@/lib/types";
import {
	addUserSheet,
	exportUserSheet,
	importUserSheet,
	removeUserSheet,
	subscribeUserSheets,
	type UserSheet,
	updateUserSheet,
	userSheetCellRef,
	userSheetCellUrl,
	userSheetsServerSnapshot,
	userSheetsSnapshot,
} from "@/lib/user-sheets";
import { walkPresetRows } from "@/lib/walk-cycle";
import { loadImage, WALK_STANDARDS } from "@/lib/walk-sprite";
import AssetThumb from "./AssetThumb";
import type { PickResult } from "./ContentPicker";
import PostSlicePanel from "./PostSlicePanel";
import SpriteImage from "./SpriteImage";
import WalkSpritePreview from "./WalkSpritePreview";

interface UserSheetPanelProps {
	/** マスを選んだときの通知。管理だけしたい場合は省略できる（選択不可になる）。 */
	onPick?: (res: PickResult) => void;
	/** 投稿画像から取り込むためのユーザーID。省略時は投稿タブが使えず直リンクURLのみになる。 */
	userId?: string;
}

const CELLS_PER_CHUNK = 240;

/** マイシート：投稿画像や直リンクを「マス目サイズ」で切り出して素材として使う。
 *  内蔵素材タブ（LocalAssetPanel）と同じ url:#crop 参照を作るので、
 *  タイル・オブジェクト・歩行グラなど既存の参照先すべてにそのまま使える。 */
export default function UserSheetPanel({
	onPick,
	userId,
}: UserSheetPanelProps) {
	const sheets = useSyncExternalStore(
		subscribeUserSheets,
		userSheetsSnapshot,
		userSheetsServerSnapshot,
	);
	const [openId, setOpenId] = useState<string | null>(null);
	const [adding, setAdding] = useState(false);
	const [cropping, setCropping] = useState(false);
	const [importError, setImportError] = useState<string | null>(null);
	const importRef = useRef<HTMLInputElement>(null);
	// 「歩行グラを切り出す」は素材定義（管理モード＝onPick なし）でのみ出す。
	// 投稿画像やアップロード画像から1体ぶんを切り出し、pickRef 付きマイシートとして保存する。
	const canDefine = !onPick && !!userId;

	const open = sheets.find((s) => s.id === openId) ?? null;

	/** 1シートを .json として書き出す。 */
	const handleExport = (sheet: UserSheet) => {
		const blob = new Blob([exportUserSheet(sheet)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${(sheet.name || "sheet").replace(/[\\/:*?"<>|\s]+/g, "_")}.sheet.json`;
		a.click();
		URL.revokeObjectURL(url);
	};

	/** 書き出した .json を取り込んで登録する。 */
	const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		setImportError(null);
		const reader = new FileReader();
		reader.onload = () => {
			const created = importUserSheet(String(reader.result ?? ""));
			if (created) setOpenId(created.id);
			else setImportError("このファイルはマイシートの定義ではありません");
		};
		reader.onerror = () => setImportError("ファイルを読み込めませんでした");
		reader.readAsText(file);
	};

	return (
		<div className="flex flex-col gap-2">
			{/* 登録済みシートの一覧：小さなプレビュー付きで、どのシートかひと目で分かるようにする。 */}
			<div className="flex items-center gap-1.5 flex-wrap">
				{sheets.map((s) => (
					<button
						key={s.id}
						onClick={() => setOpenId(openId === s.id ? null : s.id)}
						title={`${s.name} ・ ${s.cellW}×${s.cellH}px`}
						className={`shrink-0 whitespace-nowrap flex items-center gap-1 pl-1 pr-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${openId === s.id ? "bg-blue-600 text-white border-blue-500" : "bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800"}`}
					>
						<span className="w-5 h-5 rounded overflow-hidden bg-[#11131a] gimp-checkered-background shrink-0">
							{s.pickRef ? (
								<AssetThumb refStr={s.pickRef} url={s.url} size={20} />
							) : (
								/* eslint-disable-next-line @next/next/no-img-element */
								<img
									src={s.url}
									alt=""
									onError={(e) => {
										e.currentTarget.style.visibility = "hidden";
									}}
									className="w-full h-full object-cover"
									style={{ imageRendering: "pixelated" }}
								/>
							)}
						</span>
						{s.name}
					</button>
				))}
				<button
					onClick={() => {
						setAdding((v) => !v);
						setCropping(false);
					}}
					className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${adding ? "bg-gray-700 text-white border-gray-600" : "bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800"}`}
				>
					<Plus size={11} className="inline -mt-0.5 mr-0.5" />
					アセットシートを追加
				</button>
				{canDefine && (
					<button
						onClick={() => {
							setCropping((v) => !v);
							setAdding(false);
						}}
						className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${cropping ? "bg-gray-700 text-white border-gray-600" : "bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800"}`}
					>
						<Scissors size={11} className="inline -mt-0.5 mr-0.5" />
						歩行グラを切り出す
					</button>
				)}
				<input
					ref={importRef}
					type="file"
					accept=".json,application/json"
					className="hidden"
					onChange={handleImportFile}
				/>
				<button
					onClick={() => {
						setImportError(null);
						importRef.current?.click();
					}}
					title="書き出したアセットシート定義（.json）を取り込む"
					className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800 transition"
				>
					<FileUp size={11} className="inline -mt-0.5 mr-0.5" />
					アセットシートを取り込む
				</button>
			</div>

			{importError && (
				<p className="text-[10px] text-red-400 px-0.5">{importError}</p>
			)}

			{adding && (
				<AddSheetForm
					userId={userId}
					onDone={(id) => {
						setAdding(false);
						setOpenId(id);
					}}
					onPick={onPick}
				/>
			)}

			{cropping && canDefine && (
				<div className="rounded-lg border border-gray-700 bg-gray-900/60 p-2.5">
					<PostSlicePanel
						userId={userId!}
						allowUpload
						confirmLabel="この歩行グラをマイシートに保存"
						hint="投稿画像やアップロード画像から、1体ぶんの歩行グラ（または1コマ）を切り出してマイシートに保存します。保存した素材は「画像を参照」→「マイシート」からいつでも使えます。"
						onPick={(res) => {
							if (!res.url) return;
							const created = addUserSheet({
								name: res.label || "切り出し素材",
								url: res.url,
								cellW: 16,
								cellH: 16,
								pickRef: res.ref,
							});
							setCropping(false);
							setOpenId(created.id);
						}}
					/>
				</div>
			)}

			{sheets.length === 0 && !adding && !cropping && (
				<p className="text-[10px] text-gray-500 px-0.5 leading-relaxed">
					投稿画像や画像URLを登録して、素材として使えます。
					1枚絵はそのまま、スプライトシートはマス目で切り出して使えます。
					{canDefine &&
						"「歩行グラを切り出す」でスプライトシートから1体ぶんを切り出して保存もできます。"}
				</p>
			)}

			{open &&
				(open.pickRef ? (
					<PickRefSheetView
						key={open.id}
						sheet={open}
						userId={userId}
						onPick={onPick}
						onExport={() => handleExport(open)}
						onDelete={() => {
							removeUserSheet(open.id);
							setOpenId(null);
						}}
					/>
				) : (
					<SheetGrid
						key={open.id}
						sheet={open}
						userId={userId}
						onPick={onPick}
						onExport={() => handleExport(open)}
						onDelete={() => {
							removeUserSheet(open.id);
							setOpenId(null);
						}}
					/>
				))}
		</div>
	);
}

/** pickRef 付きマイシート（切り出し済みの1体素材）の詳細ビュー。マス目選択ではなく、そのまま使う。 */
function PickRefSheetView({
	sheet,
	userId,
	onPick,
	onExport,
	onDelete,
}: {
	sheet: UserSheet;
	userId?: string;
	onPick?: (res: PickResult) => void;
	onExport: () => void;
	onDelete: () => void;
}) {
	const isWalk = sheet.pickRef?.startsWith("walk:");
	const [editing, setEditing] = useState(false);
	const [editName, setEditName] = useState(sheet.name);

	if (editing) {
		return (
			<div className="rounded-lg border border-blue-500 bg-gray-900/80 p-2.5 space-y-2">
				<div className="flex items-center justify-between gap-2">
					<p className="text-[11px] text-blue-400 font-bold">
						切り出し設定を再編集
					</p>
					<button
						onClick={() => setEditing(false)}
						className="text-[10px] text-gray-400 hover:text-white px-2 py-0.5 rounded bg-gray-800 border border-gray-700"
					>
						キャンセル
					</button>
				</div>
				<div className="space-y-1">
					<label className="text-[10px] text-gray-400">素材名</label>
					<input
						value={editName}
						onChange={(e) => setEditName(e.target.value)}
						placeholder="素材名"
						className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 outline-none focus:border-blue-500"
					/>
				</div>
				<PostSlicePanel
					userId={userId}
					allowUpload
					initialAsset={{
						ref: sheet.pickRef!,
						url: sheet.url,
						label: editName,
					}}
					confirmLabel="定義を更新"
					hint="クロップ位置や歩行グラ規格・コマ数・表示倍率などのパラメータを再編集できます。"
					onPick={(res) => {
						if (!res.ref) return;
						const finalName = editName.trim() || res.label || sheet.name;
						updateUserSheet(sheet.id, { name: finalName, pickRef: res.ref });
						setEditing(false);
					}}
				/>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2 px-0.5">
				<p className="text-[10px] text-gray-500 flex-1 truncate">
					{sheet.name} ・{" "}
					{isWalk ? "歩行グラ（切り出し）" : "切り出しスプライト"}
				</p>
				<button
					onClick={() => {
						setEditName(sheet.name);
						setEditing(true);
					}}
					className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 transition"
				>
					<Pencil size={11} />
					編集
				</button>
				<button
					onClick={onExport}
					className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 transition"
				>
					<Download size={11} />
					アセットシートを書き出す
				</button>
				<button
					onClick={onDelete}
					className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition"
				>
					<Trash2 size={11} />
					削除
				</button>
			</div>
			<div className="flex items-center gap-3">
				<div className="shrink-0 grid place-items-center w-16 h-16 rounded-lg border border-gray-800 bg-[#11131a] gimp-checkered-background overflow-hidden">
					<AssetThumb refStr={sheet.pickRef!} url={sheet.url} size={56} />
				</div>
				<p className="text-[10px] text-gray-500 leading-relaxed flex-1">
					{onPick
						? "切り出し済みの素材です。そのままタイル・キャラ・オブジェクトに使えます。"
						: "この素材は「画像を参照」→「マイシート」から使えます。"}
				</p>
			</div>
			{onPick && (
				<button
					onClick={() =>
						onPick({ ref: sheet.pickRef!, url: sheet.url, label: sheet.name })
					}
					className="w-full py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-[11px] text-white font-bold"
				>
					この素材を使う
				</button>
			)}
		</div>
	);
}

/** 画像ファイル、投稿画像、直リンクURLのいずれかから、1枚絵として使う・シートとして登録する共通フォーム。 */
function AddSheetForm({
	userId,
	onDone,
	onPick,
}: {
	userId?: string;
	onDone: (id: string) => void;
	onPick?: (res: PickResult) => void;
}) {
	const [name, setName] = useState("");
	const [url, setUrl] = useState("");
	const [cellW, setCellW] = useState(16);
	const [cellH, setCellH] = useState(16);
	const [busy, setBusy] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	/** 画像の取り込み元。'upload'=ファイル選択 / 'post'=SNS投稿画像 / 'url'=直リンクURL。 */
	const [source, setSource] = useState<"upload" | "post" | "url">("upload");
	const fileRef = useRef<HTMLInputElement>(null);

	const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		setError(null);
		if (!file.type.startsWith("image/")) {
			setError("画像ファイルを選択してください");
			return;
		}
		const reader = new FileReader();
		reader.onload = async () => {
			setUploading(true);
			try {
				const res = await api.upload.image({ image: reader.result as string });
				setUrl(res.url);
				if (!name.trim() && file.name) {
					setName(file.name.replace(/\.[^/.]+$/, ""));
				}
			} catch {
				setError("画像のアップロードに失敗しました");
			} finally {
				setUploading(false);
			}
		};
		reader.readAsDataURL(file);
	};

	/** 切り出さず、画像1枚をそのままスプライトとして使う（旧「URL」タブ相当）。 */
	const useWhole = async () => {
		setError(null);
		if (!url.trim()) {
			setError("画像を選ぶか、URLを入力してください");
			return;
		}
		if (!onPick) return;
		setBusy(true);
		try {
			await loadImage(url.trim()); // 読めない画像はここで弾く
			onPick({
				ref: `url:${url.trim()}`,
				url: url.trim(),
				label: name.trim() || url.trim().slice(0, 26),
			});
		} catch {
			setError("画像を読み込めませんでした（URLとCORSを確認してください）");
		} finally {
			setBusy(false);
		}
	};

	const submit = async () => {
		setError(null);
		if (!url.trim()) {
			setError("画像を選ぶか、URLを入力してください");
			return;
		}
		if (cellW <= 0 || cellH <= 0) {
			setError("マス目サイズは1以上にしてください");
			return;
		}
		setBusy(true);
		try {
			// 読めない画像／マス目より小さい画像はここで弾く（登録後に空グリッドになるのを防ぐ）
			const img = await loadImage(url.trim());
			if (img.naturalWidth < cellW || img.naturalHeight < cellH) {
				setError("画像がマス目サイズより小さいです");
				return;
			}
			const created = addUserSheet({
				name: name.trim() || "マイシート",
				url: url.trim(),
				cellW,
				cellH,
			});
			onDone(created.id);
		} catch {
			setError("画像を読み込めませんでした（URLとCORSを確認してください）");
		} finally {
			setBusy(false);
		}
	};

	const numInput =
		"w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none focus:border-blue-500";
	const srcBtn = (active: boolean) =>
		`flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${active ? "bg-blue-600 text-white border-blue-500" : "bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-750"}`;

	return (
		<div className="rounded-lg border border-gray-800 bg-gray-900/80 p-2.5 space-y-2">
			<input
				value={name}
				onChange={(e) => setName(e.target.value)}
				placeholder="シート名（任意）"
				className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 outline-none focus:border-blue-500"
			/>

			{/* 取り込み元の切り替え（ファイル選択 / SNS投稿 / 直リンクURL） */}
			<div className="flex items-center gap-1.5 flex-wrap">
				<input
					ref={fileRef}
					type="file"
					accept="image/*"
					className="hidden"
					onChange={handleFileUpload}
				/>
				<button
					type="button"
					onClick={() => setSource("upload")}
					className={srcBtn(source === "upload")}
				>
					<Upload size={12} />
					ファイル選択
				</button>
				{userId && (
					<button
						type="button"
						onClick={() => setSource("post")}
						className={srcBtn(source === "post")}
					>
						<ImageIcon size={12} />
						投稿から選ぶ
					</button>
				)}
				<button
					type="button"
					onClick={() => setSource("url")}
					className={srcBtn(source === "url")}
				>
					<Link2 size={12} />
					直リンクURL
				</button>
			</div>

			{source === "upload" && (
				<div className="space-y-1.5">
					<button
						type="button"
						onClick={() => fileRef.current?.click()}
						disabled={uploading}
						className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[11px] text-gray-200 font-bold disabled:opacity-50 transition"
					>
						{uploading ? (
							<Loader2 size={13} className="animate-spin" />
						) : (
							<Upload size={13} />
						)}
						{url ? "別の画像ファイルを選択" : "画像ファイルを選択"}
					</button>
				</div>
			)}
			{source === "post" &&
				(userId ? (
					<PostImageGrid
						userId={userId}
						selectedUrl={url.trim()}
						onSelect={(u, id) => {
							setUrl(u);
							if (!name.trim()) setName(`投稿#${id}`);
						}}
					/>
				) : (
					<p className="text-[10px] text-gray-500 px-0.5">
						投稿から取り込むにはログインが必要です。
					</p>
				))}
			{source === "url" && (
				<input
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					placeholder="画像の直リンクURL"
					className="w-full min-w-0 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 outline-none focus:border-blue-500"
				/>
			)}

			{/* 1枚絵ならそのまま使える。素材選びの場でだけ出す（管理タブでは登録のみ）。 */}
			{onPick && (
				<button
					onClick={useWhole}
					disabled={busy || uploading || !url.trim()}
					className="w-full flex items-center justify-center gap-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-[11px] text-white font-bold transition"
				>
					{busy ? <Loader2 size={13} className="animate-spin" /> : null}
					この画像を1枚絵として使う
				</button>
			)}

			<div className="border-t border-gray-800 pt-2 space-y-2">
				<p className="text-[10px] text-gray-500">
					スプライトシートとして登録（マス目で切り出す）
				</p>
				<div className="flex items-center gap-2 text-[10px] text-gray-400">
					<label className="flex flex-wrap items-center gap-1">
						マス目
						<input
							type="number"
							min={1}
							value={cellW}
							onChange={(e) => setCellW(Number(e.target.value))}
							className={numInput}
						/>
					</label>
					<span>×</span>
					<input
						type="number"
						min={1}
						value={cellH}
						onChange={(e) => setCellH(Number(e.target.value))}
						className={numInput}
					/>
					<span>px</span>
					<div className="flex gap-1 ml-auto">
						{[16, 32, 48, 64].map((n) => (
							<button
								key={n}
								type="button"
								onClick={() => {
									setCellW(n);
									setCellH(n);
								}}
								className="px-1.5 py-1 rounded bg-gray-800 border border-gray-700 text-[10px] text-gray-300 hover:bg-gray-700 transition"
							>
								{n}
							</button>
						))}
					</div>
				</div>

				{/* プレビュー：登録前に、実寸の画像へマス目（青い格子）を重ねて切り出し結果を確認できる。 */}
				{url.trim() && (
					<SheetPreview url={url.trim()} cellW={cellW} cellH={cellH} />
				)}

				{error && <p className="text-[10px] text-red-400">{error}</p>}
				<button
					onClick={submit}
					disabled={busy || uploading || !url.trim()}
					className="w-full flex items-center justify-center gap-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-50 text-[11px] text-gray-200 font-bold transition"
				>
					{busy ? (
						<Loader2 size={13} className="animate-spin" />
					) : (
						<Plus size={13} />
					)}
					シートに登録
				</button>
			</div>
		</div>
	);
}

/** SNS投稿の画像から1枚を選ぶグリッド。選ぶとその画像URLを取り込み元にする。 */
function PostImageGrid({
	userId,
	selectedUrl,
	onSelect,
}: {
	userId: string;
	selectedUrl: string;
	onSelect: (url: string, id: string) => void;
}) {
	const [posts, setPosts] = useState<Post[]>([]);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState("");

	useEffect(() => {
		let alive = true;
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

	return (
		<div className="space-y-1.5">
			<div className="relative">
				<Search
					size={12}
					className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500"
				/>
				<input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="投稿を検索"
					className="w-full bg-gray-800 border border-gray-700 rounded pl-7 pr-2 py-1.5 text-[11px] text-gray-200 outline-none"
				/>
			</div>
			{loading ? (
				<div className="flex justify-center py-6">
					<Loader2 size={16} className="animate-spin text-gray-500" />
				</div>
			) : (
				<div className="grid grid-cols-4 gap-1.5 max-h-52 overflow-y-auto scrollbar-none">
					{imagePosts.map((p) => {
						const active = selectedUrl === p.imageSrc;
						return (
							<button
								key={p.id}
								type="button"
								onClick={() => onSelect(p.imageSrc!, p.id)}
								title={`#${p.id}`}
								className={`aspect-square rounded-lg overflow-hidden border bg-gray-900 relative gimp-checkered-background ${active ? "border-blue-500 ring-1 ring-blue-500" : "border-gray-700 hover:border-blue-500"}`}
							>
								<SpriteImage
									src={p.imageSrc}
									alt=""
									className="w-full h-full object-cover"
									style={{ imageRendering: "pixelated" }}
									animFrames={p.animFrames}
									animFps={p.animFps}
									rows={walkPresetRows(p.walkPreset)}
									animate={false}
								/>
							</button>
						);
					})}
					{imagePosts.length === 0 && (
						<p className="col-span-4 text-center text-[11px] text-gray-600 py-6">
							画像投稿がありません
						</p>
					)}
				</div>
			)}
		</div>
	);
}

/** 登録前プレビュー：画像にマス目（格子）を重ねて、何マスに割れるかを可視化する。 */
function SheetPreview({
	url,
	cellW,
	cellH,
}: {
	url: string;
	cellW: number;
	cellH: number;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [dim, setDim] = useState<{ cols: number; rows: number } | null>(null);
	const [error, setError] = useState(false);

	useEffect(() => {
		let cancelled = false;
		loadImage(url)
			.then((img) => {
				if (cancelled) return;
				const ctx = canvasRef.current?.getContext("2d");
				const cols = cellW > 0 ? Math.floor(img.naturalWidth / cellW) : 0;
				const rows = cellH > 0 ? Math.floor(img.naturalHeight / cellH) : 0;
				setError(false);
				setDim({ cols, rows });
				const canvas = canvasRef.current;
				if (!ctx || !canvas) return;

				const MAX = 280;
				const scale = Math.min(1, MAX / img.naturalWidth);
				const dw = Math.max(1, Math.round(img.naturalWidth * scale));
				const dh = Math.max(1, Math.round(img.naturalHeight * scale));
				const dpr = Math.min(window.devicePixelRatio || 1, 2);
				canvas.width = dw * dpr;
				canvas.height = dh * dpr;
				canvas.style.width = `${dw}px`;
				canvas.style.height = `${dh}px`;
				ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
				ctx.imageSmoothingEnabled = false;
				ctx.clearRect(0, 0, dw, dh);
				ctx.drawImage(img, 0, 0, dw, dh);

				if (cellW > 0 && cellH > 0) {
					ctx.strokeStyle = "rgba(59,130,246,0.55)";
					ctx.lineWidth = 1;
					for (let x = cellW; x < img.naturalWidth; x += cellW) {
						const px = Math.round(x * scale) + 0.5;
						ctx.beginPath();
						ctx.moveTo(px, 0);
						ctx.lineTo(px, dh);
						ctx.stroke();
					}
					for (let y = cellH; y < img.naturalHeight; y += cellH) {
						const py = Math.round(y * scale) + 0.5;
						ctx.beginPath();
						ctx.moveTo(0, py);
						ctx.lineTo(dw, py);
						ctx.stroke();
					}
				}
			})
			.catch(() => {
				if (!cancelled) {
					setError(true);
					setDim(null);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [url, cellW, cellH]);

	// canvas は常にマウントしておく（エラー時に外すと、URL修正後も参照が取れず再描画できなくなるため）。
	return (
		<div className="flex flex-col items-center gap-1">
			<div
				className={`max-w-full overflow-auto rounded-lg border border-gray-800 bg-[#11131a] p-1 gimp-checkered-background ${error ? "hidden" : ""}`}
			>
				<canvas
					ref={canvasRef}
					className="block"
					style={{ imageRendering: "pixelated" }}
				/>
			</div>
			{error ? (
				<p className="text-[10px] text-red-400 self-start px-0.5">
					画像を読み込めませんでした（URLとCORSを確認してください）
				</p>
			) : (
				<p className="text-[10px] text-gray-500 self-start px-0.5">
					プレビュー
					{dim
						? ` ・ ${dim.cols}×${dim.rows}マス（${dim.cols * dim.rows}コマ）`
						: ""}
				</p>
			)}
		</div>
	);
}

interface Cell {
	col: number;
	row: number;
	opaque: boolean;
}

/** 登録シートをマス目で走査し、中身のあるマスだけ選べるグリッドにする。 */
function SheetGrid({
	sheet,
	userId,
	onPick,
	onExport,
	onDelete,
}: {
	sheet: UserSheet;
	userId?: string;
	onPick?: (res: PickResult) => void;
	onExport: () => void;
	onDelete: () => void;
}) {
	const [cells, setCells] = useState<Cell[] | null>(null);
	const [size, setSize] = useState<{ cols: number; rows: number } | null>(null);
	const [shown, setShown] = useState(CELLS_PER_CHUNK);
	const [error, setError] = useState(false);
	/** マス（1コマの静止画）を選ぶか、画像全体を歩行グラ（アニメ）として使うか。 */
	const [mode, setMode] = useState<"cell" | "walk">("cell");
	/** 歩行グラの規格（auto=実寸から自動推定）。 */
	const [walkStd, setWalkStd] = useState("auto");

	const [editing, setEditing] = useState(false);
	const [editName, setEditName] = useState(sheet.name);
	const [editUrl, setEditUrl] = useState(sheet.url);
	const [editCellW, setEditCellW] = useState(sheet.cellW);
	const [editCellH, setEditCellH] = useState(sheet.cellH);
	const [editError, setEditError] = useState<string | null>(null);
	const [editBusy, setEditBusy] = useState(false);

	const [editSource, setEditSource] = useState<"upload" | "post" | "url">(
		"url",
	);
	const [editUploading, setEditUploading] = useState(false);
	const editFileRef = useRef<HTMLInputElement>(null);

	const handleEditFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		setEditError(null);
		if (!file.type.startsWith("image/")) {
			setEditError("画像ファイルを選択してください");
			return;
		}
		const reader = new FileReader();
		reader.onload = async () => {
			setEditUploading(true);
			try {
				const res = await api.upload.image({ image: reader.result as string });
				setEditUrl(res.url);
			} catch {
				setEditError("画像のアップロードに失敗しました");
			} finally {
				setEditUploading(false);
			}
		};
		reader.readAsDataURL(file);
	};

	useEffect(() => {
		let cancelled = false;
		loadImage(sheet.url)
			.then((img) => {
				if (cancelled) return;
				const cols = Math.floor(img.naturalWidth / sheet.cellW);
				const rows = Math.floor(img.naturalHeight / sheet.cellH);
				const canvas = document.createElement("canvas");
				canvas.width = img.naturalWidth;
				canvas.height = img.naturalHeight;
				const ctx = canvas.getContext("2d", { willReadFrequently: true });
				if (!ctx) {
					setError(true);
					return;
				}
				ctx.drawImage(img, 0, 0);
				let data: Uint8ClampedArray | null = null;
				try {
					data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
				} catch {
					// 他オリジンの画像は getImageData が使えない（CORS）。その場合は全マスを選択可能にする。
					data = null;
				}
				const list: Cell[] = [];
				for (let row = 0; row < rows; row++) {
					for (let col = 0; col < cols; col++) {
						let opaque = true;
						if (data) {
							opaque = false;
							for (
								let y = row * sheet.cellH;
								y < (row + 1) * sheet.cellH && !opaque;
								y++
							) {
								const base = (y * canvas.width + col * sheet.cellW) * 4;
								for (let x = 0; x < sheet.cellW; x++) {
									if (data[base + x * 4 + 3] > 0) {
										opaque = true;
										break;
									}
								}
							}
						}
						list.push({ col, row, opaque });
					}
				}
				setSize({ cols, rows });
				setCells(list);
			})
			.catch(() => {
				if (!cancelled) setError(true);
			});
		return () => {
			cancelled = true;
		};
	}, [sheet.url, sheet.cellW, sheet.cellH]);

	const header = (
		<div className="flex items-center gap-2 px-0.5">
			<p className="text-[10px] text-gray-500 flex-1 truncate">
				{sheet.name} ・ {sheet.cellW}×{sheet.cellH}px
				{size ? ` ・ ${size.cols}×${size.rows}マス` : ""}
			</p>
			<button
				onClick={() => {
					setEditName(sheet.name);
					setEditUrl(sheet.url);
					setEditCellW(sheet.cellW);
					setEditCellH(sheet.cellH);
					setEditError(null);
					setEditing(true);
				}}
				className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 transition"
			>
				<Pencil size={11} />
				編集
			</button>
			<button
				onClick={onExport}
				className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 transition"
			>
				<Download size={11} />
				アセットシートを書き出す
			</button>
			<button
				onClick={onDelete}
				className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition"
			>
				<Trash2 size={11} />
				削除
			</button>
		</div>
	);

	// マス選択 / 歩行グラ の切り替えタブ（onPick がある＝素材を選ぶ用途のときだけ出す）
	const modeTabs = onPick ? (
		<div className="flex gap-1 px-0.5">
			{(
				[
					["cell", "マス（1コマ）"],
					["walk", "歩行グラ（アニメ）"],
				] as const
			).map(([m, label]) => (
				<button
					key={m}
					onClick={() => setMode(m)}
					className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${mode === m ? "bg-blue-600 text-white border-blue-500" : "bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800"}`}
				>
					{label}
				</button>
			))}
		</div>
	) : null;

	if (editing) {
		const handleSave = async () => {
			setEditError(null);
			if (!editUrl.trim()) {
				setEditError("URLを入力してください");
				return;
			}
			if (editCellW <= 0 || editCellH <= 0) {
				setEditError("マス目サイズは1以上にしてください");
				return;
			}
			setEditBusy(true);
			try {
				const img = await loadImage(editUrl.trim());
				if (img.naturalWidth < editCellW || img.naturalHeight < editCellH) {
					setEditError("画像がマス目サイズより小さいです");
					return;
				}
				updateUserSheet(sheet.id, {
					name: editName.trim() || "マイシート",
					url: editUrl.trim(),
					cellW: editCellW,
					cellH: editCellH,
				});
				setEditing(false);
			} catch {
				setEditError(
					"画像を読み込めませんでした（URLとCORSを確認してください）",
				);
			} finally {
				setEditBusy(false);
			}
		};

		const numInput =
			"w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none focus:border-blue-500";
		const srcBtn = (active: boolean) =>
			`flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${active ? "bg-blue-600 text-white border-blue-500" : "bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-750"}`;

		return (
			<div className="rounded-lg border border-blue-500/60 bg-gray-900/90 p-2.5 space-y-2">
				<div className="flex items-center justify-between gap-2">
					<p className="text-[11px] text-blue-400 font-bold">
						アセットシート定義を再編集
					</p>
					<button
						onClick={() => setEditing(false)}
						className="text-[10px] text-gray-400 hover:text-white px-2 py-0.5 rounded bg-gray-800 border border-gray-700 transition"
					>
						キャンセル
					</button>
				</div>

				<div className="space-y-1">
					<label className="text-[10px] text-gray-400">シート名</label>
					<input
						value={editName}
						onChange={(e) => setEditName(e.target.value)}
						placeholder="シート名"
						className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 outline-none focus:border-blue-500"
					/>
				</div>

				<div className="space-y-1.5">
					<label className="text-[10px] text-gray-400">取り込み元</label>
					<div className="flex items-center gap-1.5 flex-wrap">
						<input
							ref={editFileRef}
							type="file"
							accept="image/*"
							className="hidden"
							onChange={handleEditFileUpload}
						/>
						<button
							type="button"
							onClick={() => setEditSource("upload")}
							className={srcBtn(editSource === "upload")}
						>
							<Upload size={12} />
							ファイル選択
						</button>
						{userId && (
							<button
								type="button"
								onClick={() => setEditSource("post")}
								className={srcBtn(editSource === "post")}
							>
								<ImageIcon size={12} />
								投稿から選ぶ
							</button>
						)}
						<button
							type="button"
							onClick={() => setEditSource("url")}
							className={srcBtn(editSource === "url")}
						>
							<Link2 size={12} />
							直リンクURL
						</button>
					</div>

					{editSource === "upload" && (
						<button
							type="button"
							onClick={() => editFileRef.current?.click()}
							disabled={editUploading}
							className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[11px] text-gray-200 font-bold disabled:opacity-50 transition"
						>
							{editUploading ? (
								<Loader2 size={13} className="animate-spin" />
							) : (
								<Upload size={13} />
							)}
							{editUrl ? "別の画像ファイルを選択" : "画像ファイルを選択"}
						</button>
					)}
					{editSource === "post" &&
						(userId ? (
							<PostImageGrid
								userId={userId}
								selectedUrl={editUrl.trim()}
								onSelect={(u) => setEditUrl(u)}
							/>
						) : (
							<p className="text-[10px] text-gray-500 px-0.5">
								投稿から取り込むにはログインが必要です。
							</p>
						))}
					{editSource === "url" && (
						<input
							value={editUrl}
							onChange={(e) => setEditUrl(e.target.value)}
							placeholder="画像の直リンクURL"
							className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 outline-none focus:border-blue-500"
						/>
					)}
				</div>

				<div className="border-t border-gray-800 pt-2 space-y-2">
					<div className="flex items-center gap-2 text-[10px] text-gray-400">
						<label className="flex items-center gap-1">
							マス目
							<input
								type="number"
								min={1}
								value={editCellW}
								onChange={(e) => setEditCellW(Number(e.target.value))}
								className={numInput}
							/>
						</label>
						<span>×</span>
						<input
							type="number"
							min={1}
							value={editCellH}
							onChange={(e) => setEditCellH(Number(e.target.value))}
							className={numInput}
						/>
						<span>px</span>
						<div className="flex gap-1 ml-auto">
							{[16, 32, 48, 64].map((n) => (
								<button
									key={n}
									type="button"
									onClick={() => {
										setEditCellW(n);
										setEditCellH(n);
									}}
									className="px-1.5 py-1 rounded bg-gray-800 border border-gray-700 text-[10px] text-gray-300 hover:bg-gray-700"
								>
									{n}
								</button>
							))}
						</div>
					</div>

					{editUrl.trim() && (
						<SheetPreview
							url={editUrl.trim()}
							cellW={editCellW}
							cellH={editCellH}
						/>
					)}

					{editError && <p className="text-[10px] text-red-400">{editError}</p>}

					<button
						onClick={handleSave}
						disabled={editBusy || !editUrl.trim()}
						className="w-full flex items-center justify-center gap-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-[11px] text-white font-bold"
					>
						{editBusy ? <Loader2 size={13} className="animate-spin" /> : null}
						定義を更新
					</button>
				</div>
			</div>
		);
	}

	if (error)
		return (
			<>
				{header}
				<p className="text-center text-[11px] text-red-400 py-6">
					画像を読み込めませんでした
				</p>
			</>
		);
	if (!cells || !size)
		return (
			<>
				{header}
				<div className="flex justify-center py-8">
					<Loader2 size={18} className="animate-spin text-gray-500" />
				</div>
			</>
		);

	// ── 歩行グラモード：画像全体を歩行グラシートとして扱い walk: 参照を作る ──
	if (onPick && mode === "walk") {
		return (
			<>
				{header}
				{modeTabs}
				<div className="rounded-lg border border-gray-700 bg-gray-900/60 p-2.5 space-y-2">
					<div className="flex items-center gap-2">
						<span className="text-[10px] text-gray-500 shrink-0">規格</span>
						<select
							value={walkStd}
							onChange={(e) => setWalkStd(e.target.value)}
							className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none"
						>
							<option value="auto">自動（実寸から推定）</option>
							{WALK_STANDARDS.map((s) => (
								<option key={s.id} value={s.id}>
									{s.label}
								</option>
							))}
						</select>
					</div>
					<div className="flex items-center gap-3">
						<div className="shrink-0 grid place-items-center w-16 h-16 rounded-lg border border-gray-800 bg-[#11131a] gimp-checkered-background">
							<WalkSpritePreview url={sheet.url} stdId={walkStd} size={56} />
						</div>
						<p className="text-[10px] text-gray-500 leading-relaxed flex-1">
							画像全体を1体分の歩行グラとして、方向×コマに分けてアニメーションします。
							向きやコマ割りが合わないときは規格を変えてください。
						</p>
					</div>
					<button
						onClick={() =>
							onPick({
								ref: buildWalkRef(walkStd, { kind: "url", url: sheet.url }),
								url: sheet.url,
								label: `${sheet.name}（歩行グラ）`,
							})
						}
						className="w-full py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-[11px] text-white font-bold"
					>
						この歩行グラを使う
					</button>
				</div>
			</>
		);
	}

	const usable = cells.filter((c) => c.opaque);
	const visible = usable.slice(0, shown);
	const cols = Math.min(8, Math.max(4, size.cols));

	return (
		<>
			{header}
			{modeTabs}
			<div
				className="grid gap-0.5"
				style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
			>
				{visible.map((c) => (
					<button
						key={`${c.col},${c.row}`}
						onClick={() =>
							onPick?.({
								ref: userSheetCellRef(sheet, c.col, c.row),
								url: userSheetCellUrl(sheet, c.col, c.row),
								label: `${sheet.name} (${c.col},${c.row})`,
							})
						}
						disabled={!onPick}
						title={`(${c.col},${c.row})`}
						className="pixel-select-hover aspect-square rounded border border-gray-800 hover:border-blue-500 bg-[#11131a] gimp-checkered-background disabled:hover:border-gray-800"
					>
						<div
							className="w-full h-full overflow-hidden"
							style={{
								backgroundImage: `url(${sheet.url})`,
								backgroundSize: `${size.cols * 100}% ${size.rows * 100}%`,
								backgroundPosition: `${size.cols > 1 ? (c.col / (size.cols - 1)) * 100 : 0}% ${size.rows > 1 ? (c.row / (size.rows - 1)) * 100 : 0}%`,
								imageRendering: "pixelated",
							}}
						/>
					</button>
				))}
			</div>
			{shown < usable.length && (
				<button
					onClick={() => setShown((s) => s + CELLS_PER_CHUNK)}
					className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-bold"
				>
					もっと見る（{visible.length} / {usable.length}）
				</button>
			)}
		</>
	);
}
