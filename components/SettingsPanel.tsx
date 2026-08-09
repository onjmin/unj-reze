"use client";

import {
	ChevronRight,
	Cookie,
	Copy,
	ExternalLink,
	Eye,
	EyeOff,
	FileText,
	Heart,
	Info,
	KeyRound,
	Lock,
	Shield,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ensureSessionId } from "@/lib/session";
import { AnonymousUser } from "@/lib/types";

// 専ブラ(2ch専用ブラウザ)向けの配信URL。app/unj/subject.txt/route.ts が実体。
// "unj"は板ID(board_id:1 うんでも実況J。unjリポジトリのsrc/common/request/board.ts参照)。
// 本番デプロイ先(Cloudflare Workers)は固定ドメインなので直書きしている。
const SENBURA_SUBJECT_URL =
	"https://unj-reze.onjmin.workers.dev/unj/subject.txt";

interface SettingsPanelProps {
	userId: string;
	bbsMode: string;
	setBbsMode: (m: string) => void;
	currentUser?: AnonymousUser | null;
}

function PrivacyToggle({
	label,
	desc,
	icon: Icon,
	active,
	onClick,
}: {
	label: string;
	desc: string;
	icon: React.ElementType;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			onClick={onClick}
			className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-800 hover:bg-gray-100/5 transition-colors text-left"
		>
			<Icon
				size={14}
				className={
					active ? "text-[#a3e635] shrink-0" : "text-gray-500 shrink-0"
				}
			/>
			<div className="flex-1 min-w-0">
				<div className="text-xs text-gray-200">{label}</div>
				<div className="text-[9px] text-gray-500">{desc}</div>
			</div>
			<span
				className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${active ? "bg-[#a3e635]" : "bg-gray-700"}`}
			>
				<span
					className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${active ? "left-[18px]" : "left-0.5"}`}
				/>
			</span>
		</button>
	);
}

export default function SettingsPanel({
	userId,
	bbsMode,
	setBbsMode,
	currentUser,
}: SettingsPanelProps) {
	const [privacy, setPrivacy] = useState({
		isPrivate: false,
		hideFromSearch: false,
		hideReactions: false,
	});
	const [migrationToken, setMigrationToken] = useState("");
	const [redeemInput, setRedeemInput] = useState("");
	const [redeemMsg, setRedeemMsg] = useState("");

	const displayName = currentUser?.displayName || userId;

	useEffect(() => {
		if (currentUser?.slug) {
			api.auth
				.getSettings(currentUser.slug)
				.then(setPrivacy)
				.catch(() => {});
		}
	}, [currentUser?.slug]);

	const togglePrivacy = async (
		key: "isPrivate" | "hideFromSearch" | "hideReactions",
	) => {
		if (!currentUser?.slug) return;
		const next = { ...privacy, [key]: !privacy[key] };
		setPrivacy(next);
		try {
			await api.auth.updateSettings({ [key]: next[key] });
		} catch {
			setPrivacy(privacy); // 失敗時ロールバック
		}
	};

	const handleIssueToken = async () => {
		if (!currentUser?.id) return;
		try {
			const { token } = await api.auth.issueMigrationToken();
			setMigrationToken(token);
		} catch {
			/* noop */
		}
	};

	const handleCopyToken = () => {
		if (migrationToken) navigator.clipboard.writeText(migrationToken);
	};

	const handleRedeem = async () => {
		const token = redeemInput.trim();
		if (!token) return;
		const sessionId = ensureSessionId();
		try {
			const user = await api.auth.redeemMigrationToken(token, sessionId);
			setRedeemMsg(
				`「${user.displayName}」として復元しました。再読み込みします…`,
			);
			setTimeout(() => {
				if (typeof window !== "undefined") window.location.reload();
			}, 800);
		} catch {
			setRedeemMsg("トークンが無効か期限切れです。");
		}
	};

	return (
		<div className="flex flex-col">
			<div className="p-4 space-y-5">
				<div className="space-y-2">
					<label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
						あなたのID
					</label>
					<div className="flex items-center gap-2 bg-gray-100/5 border border-gray-800 rounded-lg px-3 py-2">
						{currentUser?.avatarColor && (
							<span
								className={`w-6 h-6 rounded-full bg-gradient-to-br ${currentUser.avatarColor} shrink-0 border border-gray-700/50`}
							/>
						)}
						<span className="flex-1 text-xs font-bold text-gray-200 truncate">
							{displayName || "名無し"}
						</span>
						<Lock size={12} className="text-gray-500 shrink-0" />
					</div>
					<p className="text-[9px] text-gray-500">
						※IDは固定です（変更不可）。別の端末やセッションへは下部の移行トークンで引き継げます。
					</p>
				</div>

				<div className="space-y-2">
					<label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
						表示モード切替
					</label>
					<div className="grid grid-cols-2 gap-2">
						<button
							onClick={() => setBbsMode("掲示板モード")}
							className={`py-2 text-xs font-bold rounded-lg border transition-all ${
								bbsMode === "掲示板モード"
									? "bg-[#a3e635]/15 text-[#a3e635] border-[#a3e635]/55"
									: "bg-transparent text-gray-400 border-gray-800 hover:bg-gray-100/5"
							}`}
						>
							掲示板モード
						</button>
						<button
							onClick={() => setBbsMode("SNSモード")}
							className={`py-2 text-xs font-bold rounded-lg border transition-all ${
								bbsMode === "SNSモード"
									? "bg-blue-500/15 text-blue-400 border-blue-500/55"
									: "bg-transparent text-gray-400 border-gray-800 hover:bg-gray-100/5"
							}`}
						>
							SNSモード
						</button>
					</div>
					{bbsMode === "掲示板モード" && (
						<div className="space-y-1.5 bg-gray-100/5 border border-gray-800 rounded-lg px-3 py-2.5">
							<p className="text-[11px] font-bold text-gray-300">専ブラ用URL</p>
							<p className="text-[9px] text-gray-500">
								2ch専用ブラウザにはこのURLを板として登録してください。
							</p>
							<div className="flex items-center gap-2">
								<code className="flex-1 text-[10px] text-gray-300 break-all select-all">
									{SENBURA_SUBJECT_URL}
								</code>
								<button
									onClick={() =>
										navigator.clipboard.writeText(SENBURA_SUBJECT_URL)
									}
									className="p-1.5 rounded-md border border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-100/5 shrink-0"
									aria-label="URLをコピー"
								>
									<Copy size={12} />
								</button>
							</div>
						</div>
					)}
				</div>

				<div className="h-px bg-gray-800" />

				<div className="space-y-2">
					<label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
						プライバシー
					</label>
					<div className="space-y-1.5">
						<PrivacyToggle
							label="鍵アカウント"
							desc="フォロワーのみに投稿を公開"
							icon={Lock}
							active={privacy.isPrivate}
							onClick={() => togglePrivacy("isPrivate")}
						/>
						<PrivacyToggle
							label="検索から除外"
							desc="検索・トレンドに自分の投稿を出さない"
							icon={EyeOff}
							active={privacy.hideFromSearch}
							onClick={() => togglePrivacy("hideFromSearch")}
						/>
						<PrivacyToggle
							label="リアクション履歴を非公開"
							desc="いいね／ハート等の履歴を隠す"
							icon={Heart}
							active={privacy.hideReactions}
							onClick={() => togglePrivacy("hideReactions")}
						/>
					</div>
				</div>

				<div className="h-px bg-gray-800" />

				<div className="space-y-2">
					<label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block flex items-center gap-1.5">
						<KeyRound size={12} /> アカウント移行トークン
					</label>
					<p className="text-[9px] text-gray-500">
						セッションが変わっても過去のアカウントを復元できます。
					</p>
					<button
						onClick={handleIssueToken}
						className="w-full flex items-center justify-center gap-1.5 bg-[#a3e635]/15 hover:bg-[#a3e635]/25 border border-[#a3e635]/55 rounded-lg py-2 text-xs font-bold text-[#a3e635] transition-colors"
					>
						<KeyRound size={13} />
						移行トークンを発行
					</button>
					{migrationToken && (
						<div className="flex items-center gap-1.5 bg-gray-100/5 border border-gray-800 rounded-lg px-2 py-1.5">
							<code className="flex-1 text-[10px] text-[#a3e635] truncate">
								{migrationToken}
							</code>
							<button
								onClick={handleCopyToken}
								className="text-gray-400 hover:text-white p-1 shrink-0"
								title="コピー"
							>
								<Copy size={12} />
							</button>
						</div>
					)}
					<div className="flex space-x-1.5">
						<input
							type="text"
							value={redeemInput}
							onChange={(e) => setRedeemInput(e.target.value)}
							placeholder="トークンを入力して復元"
							className="flex-1 bg-gray-100/5 hover:bg-gray-100/10 focus:bg-gray-100/10 rounded-lg px-2.5 py-1.5 text-xs outline-none text-white border border-gray-800 focus:border-blue-500/55 transition-colors"
						/>
						<button
							onClick={handleRedeem}
							className="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors shrink-0"
						>
							復元
						</button>
					</div>
					{redeemMsg && <p className="text-[9px] text-gray-400">{redeemMsg}</p>}
				</div>

				<div className="h-px bg-gray-800" />

				<div className="space-y-2">
					<label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
						規約・ポリシー・アクセシビリティ
					</label>
					<div className="space-y-1">
						<Link
							href="/about"
							className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-800 hover:bg-gray-100/5 transition-colors text-xs text-gray-300"
						>
							<Info size={14} className="text-blue-400 shrink-0" />
							<span className="flex-1">サイトについて</span>
							<ChevronRight size={14} className="text-gray-600 shrink-0" />
						</Link>
						<Link
							href="/terms"
							className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-800 hover:bg-gray-100/5 transition-colors text-xs text-gray-300"
						>
							<FileText size={14} className="text-blue-400 shrink-0" />
							<span className="flex-1">利用規約</span>
							<ChevronRight size={14} className="text-gray-600 shrink-0" />
						</Link>
						<Link
							href="/privacy"
							className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-800 hover:bg-gray-100/5 transition-colors text-xs text-gray-300"
						>
							<Shield size={14} className="text-emerald-400 shrink-0" />
							<span className="flex-1">プライバシーポリシー</span>
							<ChevronRight size={14} className="text-gray-600 shrink-0" />
						</Link>
						<Link
							href="/cookies"
							className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-800 hover:bg-gray-100/5 transition-colors text-xs text-gray-300"
						>
							<Cookie size={14} className="text-amber-400 shrink-0" />
							<span className="flex-1">Cookie・ストレージポリシー</span>
							<ChevronRight size={14} className="text-gray-600 shrink-0" />
						</Link>
						<Link
							href="/accessibility"
							className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-800 hover:bg-gray-100/5 transition-colors text-xs text-gray-300"
						>
							<Eye size={14} className="text-purple-400 shrink-0" />
							<span className="flex-1">アクセシビリティ方針</span>
							<ChevronRight size={14} className="text-gray-600 shrink-0" />
						</Link>
					</div>
				</div>
			</div>

			<div className="p-4 border-t border-gray-800 space-y-3">
				<a
					href="https://unj.netlify.app/"
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center justify-center gap-2 w-full py-2 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-100/5 rounded-lg transition-colors"
				>
					<ExternalLink size={14} className="text-gray-500 shrink-0" />
					<span>うんjに戻る</span>
				</a>
				<div className="text-center text-[10px] text-gray-600">
					うんｊレゼ v0.1.0
				</div>
			</div>
		</div>
	);
}
