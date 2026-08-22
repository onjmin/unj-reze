"use client";

import { Image as ImageIcon, Music } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { extractChordsFromContent } from "@/lib/chord";
import { extractFirstEmbed } from "@/lib/embed";
import { extractMmlFromContent, findMmlMarker } from "@/lib/mml";
import { isCollabAllowed, type Post } from "@/lib/types";
import ChordPlayer from "./ChordPlayer";
import EmbedCollabBar from "./EmbedCollabBar";
import EmbedPart from "./EmbedPart";
import GameBox from "./GameBox";
import MmlSource from "./MmlSource";
import MvBox from "./MvBox";
import SpriteImage from "./SpriteImage";

const MmlPlayer = dynamic(() => import("./MmlPlayer"), { ssr: false });

export interface PreviewImagePayload {
	src: string;
	alt: string;
	animFrames?: number;
	animFps?: number;
	walkPreset?: string;
}

export interface PostEmbedsProps {
	post: Post;
	/** コラボ導線（画像/MML共通）を開く。post.hasCollabButtonがtrueな添付にのみ出す */
	onOpenCollab: (post: Post) => void;
	/** 画像タップ時のプレビュー表示 */
	onPreviewImage: (img: PreviewImagePayload) => void;
	/** GameBoxの再生数計測に必要。未定義ならゲーム埋め込み自体を出さない */
	userId?: string;
	/**
	 * 表示順。"media-first"=画像→MV→ゲーム→MML/コード/汎用埋め込み（フィード/詳細/プロフィール標準）。
	 * "text-first"=MML/コード/汎用埋め込み→画像→MV→ゲーム（BBSスレ表示。本文直下に埋め込みを出す体裁）。
	 */
	order?: "media-first" | "text-first";
	imageWrapperClassName?: string;
	mvClassName?: string;
	gameClassName?: string;
	/** MML/コード進行/汎用埋め込みの外枠（BBS表示はpl-6 mt-2でインデントを揃える） */
	textEmbedWrapperClassName?: string;
	hashtagLinkClassName?: string;
	/**
	 * 画像/ゲーム/MVが既にあるとき、本文中の生URLに対する汎用埋め込みプレビューを重ねて
	 * 出すかどうかの抑制条件。呼び出し元ごとに微妙に基準が違っていた実態をそのまま踏襲する
	 * （PostContainer/PostDetail本体はhasImage||hasGameのみ、BbsThreadViewは無条件表示）。
	 */
	suppressGenericEmbedIf?: (post: Post) => boolean;
}

/**
 * 投稿本文に付く画像/MV/ゲーム/MML/コード進行/汎用URL埋め込みをまとめて描画する。
 *
 * 元々はPostContainer / PostDetail(本体・返信ReplyTreeItem) / ProfileView / BbsThreadView の
 * 5箇所にほぼ同一のJSXがコピペされており、
 * - EmbedCollabBarをMML埋め込みに足した際、ProfileViewとPostDetailのReplyTreeItemだけ
 *   反映し忘れて「画像はコラボ導線が出るのにMMLは出ない」不一致が発生した
 * - GameBox/MvBoxを実装した際もProfileViewだけ差し替えを忘れ、モックアップ時代の
 *   ダミー画像＋固定タイトルのプレースホルダーが長期間残っていた
 * という「直したつもりが1箇所しか直っていない」事故が繰り返された。
 * ここへ一本化することで、今後の変更は1箇所で全画面に反映される。
 */
export default function PostEmbeds({
	post,
	onOpenCollab,
	onPreviewImage,
	userId,
	order = "media-first",
	imageWrapperClassName = "rounded-xl overflow-hidden border border-gray-800 mb-2.5 bg-[#1a1b26]",
	mvClassName = "mb-2.5",
	gameClassName = "mb-2.5",
	textEmbedWrapperClassName,
	hashtagLinkClassName = "text-blue-400 hover:underline mb-1 inline-block text-[15px]",
	suppressGenericEmbedIf = (p) => !!(p.hasImage || p.hasGame || p.hasMv),
}: PostEmbedsProps) {
	const router = useRouter();

	const image = post.hasImage && (
		<div className={imageWrapperClassName}>
			{post.hasCollabButton && isCollabAllowed(post.originType) && (
				<EmbedCollabBar
					icon={ImageIcon}
					label={post.dotW ? "ドット絵" : "画像"}
					buttonLabel="コラボ"
					colorClass="bg-lime-600/80 hover:bg-lime-500/90"
					onClick={(e) => {
						e.stopPropagation();
						onOpenCollab(post);
					}}
				/>
			)}
			<div
				onClick={(e) => {
					e.stopPropagation();
					if (post.imageSrc)
						onPreviewImage({
							src: post.imageSrc,
							alt: post.imageAlt || "ユーザーアート",
							animFrames: post.animFrames,
							animFps: post.animFps,
							walkPreset: post.walkPreset,
						});
				}}
				className="cursor-pointer gimp-checkered-background-white"
			>
				<SpriteImage
					src={post.imageSrc}
					alt={post.imageAlt || "ユーザーアート"}
					className="max-w-full h-auto max-h-[220px] block mx-auto"
					maxHeightPx={220}
					animFrames={post.animFrames}
					animFps={post.animFps}
					walkPreset={post.walkPreset}
					dotArt={!!post.dotW}
					onError={(e) => {
						const target = e.currentTarget;
						target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="100%" height="100%" fill="%231a1b26"/><rect x="12" y="12" width="296" height="156" rx="8" fill="none" stroke="%23374151" stroke-width="1.5" stroke-dasharray="6,6"/><text x="160" y="85" fill="%23ef4444" font-weight="900" text-anchor="middle" font-size="28" font-family="sans-serif">404</text><text x="160" y="115" fill="%239ca3af" font-weight="bold" text-anchor="middle" font-size="14" font-family="sans-serif">NOT FOUND</text></svg>`;
					}}
				/>
			</div>
		</div>
	);

	const mv = post.hasMv && post.mvId && (
		<MvBox
			mvId={post.mvId}
			postId={post.id}
			mvTitle={post.mvTitle || "MV"}
			mvThumbnail={post.mvThumbnail}
			mvPreset={post.mvPreset}
			mvPlays={post.mvPlays}
			originType={post.originType}
			className={mvClassName}
		/>
	);

	const game = post.hasGame && userId && (
		<GameBox
			gameId={post.gameId || ""}
			postId={post.id}
			gameTitle={post.gameTitle || "ゲーム"}
			gameThumbnail={post.gameThumbnail}
			gamePlays={post.gamePlays}
			gameClears={post.gameClears}
			userId={userId}
			originType={post.originType}
			className={gameClassName}
		/>
	);

	const hasMmlContent = post.hasMml || !!extractMmlFromContent(post.content);
	const chordRes = !hasMmlContent
		? extractChordsFromContent(post.content)
		: null;
	const embed =
		!hasMmlContent && !chordRes && !suppressGenericEmbedIf(post)
			? extractFirstEmbed(post.content)
			: null;

	let textEmbed: ReactNode = null;
	if (hasMmlContent) {
		const mmlMarker = findMmlMarker(post.content) ?? "#mml";
		const tagClean = mmlMarker.replace(/^#/, "");
		textEmbed = (
			<div
				className={textEmbedWrapperClassName}
				onClick={(e) => e.stopPropagation()}
			>
				<a
					href={`/hashtag/${encodeURIComponent(tagClean)}`}
					onClick={(e) => {
						e.stopPropagation();
						router.push(`/hashtag/${encodeURIComponent(tagClean)}`);
					}}
					className={hashtagLinkClassName}
				>
					{mmlMarker}
				</a>
				<div className="rounded-xl overflow-hidden border border-gray-800 bg-[#1a1b26]">
					{post.hasCollabButton && isCollabAllowed(post.originType) && (
						<EmbedCollabBar
							icon={Music}
							label="MML"
							buttonLabel="コラボ"
							colorClass="bg-pink-600/80 hover:bg-pink-500/90"
							onClick={(e) => {
								e.stopPropagation();
								onOpenCollab(post);
							}}
						/>
					)}
					<MmlSource post={post}>
						{(mml) => <MmlPlayer mml={mml} />}
					</MmlSource>
				</div>
			</div>
		);
	} else if (chordRes) {
		textEmbed = (
			<div
				className={textEmbedWrapperClassName}
				onClick={(e) => e.stopPropagation()}
			>
				<a
					href={`/hashtag/${encodeURIComponent("コード進行")}`}
					onClick={(e) => {
						e.stopPropagation();
						router.push(`/hashtag/${encodeURIComponent("コード進行")}`);
					}}
					className={hashtagLinkClassName}
				>
					#コード進行
				</a>
				<ChordPlayer chords={chordRes.chords} />
			</div>
		);
	} else if (embed) {
		textEmbed = (
			<div
				className={textEmbedWrapperClassName}
				onClick={(e) => e.stopPropagation()}
			>
				<EmbedPart embed={embed} />
			</div>
		);
	}

	const media = (
		<>
			{image}
			{mv}
			{game}
		</>
	);

	return order === "text-first" ? (
		<>
			{textEmbed}
			{media}
		</>
	) : (
		<>
			{media}
			{textEmbed}
		</>
	);
}
