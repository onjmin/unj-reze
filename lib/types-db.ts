import type { GameManifestDraft } from "@/components/GameMaker";
import type { MvManifest, MvPresetKind } from "./mv-config";
import type { OriginType, OshiItemKind } from "./types";

/**
 * ゲーム/MVエディタの素材ピッカー（画像/MML検索）専用の軽量な行。
 * スレッド構造・投票数・ハート数などは持たない（docs/NEON_EGRESS.md）。
 */
export interface DbMediaSearchPost {
	id: number;
	displayName: string;
	content: string;
	imageSrc?: string;
	imageAlt?: string;
	/** MML本文の保存先URL（R2）。外部化済みの投稿は content にマーカーしか残らないため必要。 */
	mmlUrl?: string;
}

export interface DbPost {
	id: number;
	displayName: string;
	slug?: string;
	createdAt: string;
	time: string;
	content: string;
	likes: number;
	dislikes: number;
	liked: boolean;
	disliked: boolean;
	repliesCount: number;
	reposts: number;
	reposted: boolean;
	hasImage?: boolean;
	imageSrc?: string;
	imageAlt?: string;
	avatarColor: string;
	avatarUrl?: string;
	hasCollabButton?: boolean;
	heartsTotal: number;
	hasGame?: boolean;
	gameId?: number;
	gameTitle?: string;
	gameThumbnail?: string;
	/** ゲームの累計プレイ数（フィードのサムネに出す） */
	gamePlays?: number;
	/** ゲームの累計クリア数 */
	gameClears?: number;
	hasMv?: boolean;
	mvId?: number;
	mvTitle?: string;
	mvThumbnail?: string;
	mvPreset?: MvPresetKind;
	/** MVの累計再生数 */
	mvPlays?: number;
	hasMml?: boolean;
	/**
	 * MML本文の保存先URL（R2）。content にはマーカー（`#mml`）だけが残る。
	 * 本文は再生・編集のときだけブラウザから直接このURLを fetch する。
	 */
	mmlUrl?: string;
	/** 差し替え時に旧オブジェクトを消すためのトークン */
	mmlDeleteId?: string;
	mmlDeleteHash?: string;
	originType?: OriginType;
	isFalseDeclaration?: boolean;
	isEdited?: boolean;
	threadId: number;
	parentPostId?: number;
	replies: DbPost[];
}

export interface DbGameRecord {
	id: number;
	preset: string;
	title: string;
	/**
	 * manifest 本体の保存先URL（R2）。DBは本体を持たない。
	 * 再生に必要な manifest は、ユーザーが実際に展開したときだけ
	 * ブラウザから直接このURLを fetch する（unj-reze のサーバーは通らない）。
	 */
	manifestUrl: string;
	/** 差し替え時に旧オブジェクトを消すためのトークン。無いと二度と消せない */
	manifestDeleteId?: string;
	manifestDeleteHash?: string;
	/**
	 * サムネイル用の背景参照。manifest.titleScreen.bgRef の非正規化。
	 * 一覧クエリで manifest を引かずにサムネを出すために持つ。
	 */
	bgRef?: string;
	createdAt: string;
	creatorSlug?: string;
	/** 累計プレイ回数 */
	plays?: number;
	/** 累計クリア回数 */
	clears?: number;
	/** 記録されたハイスコア */
	bestScore?: number;
	/** ハイスコア保持者の表示名 */
	bestScoreBy?: string;
	/** ひもづく投稿ID（ランキングからコメントへ飛ぶ用） */
	postId?: number;
}

export interface DbMvRecord {
	id: number;
	preset: MvPresetKind;
	title: string;
	/** manifest 本体の保存先URL（R2）。DbGameRecord.manifestUrl と同じ扱い */
	manifestUrl: string;
	manifestDeleteId?: string;
	manifestDeleteHash?: string;
	/** サムネイル用。manifest.stage.bgUrl の非正規化 */
	bgUrl?: string;
	createdAt: string;
	creatorSlug?: string;
	/** 累計再生回数 */
	plays?: number;
}

export interface DbOshiItem {
	id: number;
	userSlug: string;
	kind: OshiItemKind;
	trackId?: number;
	collectionId?: number;
	artistId?: number;
	title: string;
	subtitle?: string;
	artworkUrl?: string;
	viewUrl?: string;
	previewUrl?: string;
	position: number;
	createdAt: string;
}

export interface DbNotification {
	id: number;
	actorSlug?: string;
	targetSlug?: string;
	user: string;
	action: string;
	target: string;
	type: string;
	postId?: number;
	targetUser?: string;
	recipientId?: string;
	read?: boolean;
	createdAt: string;
	time: string;
}
