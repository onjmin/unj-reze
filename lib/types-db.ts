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
	/** ドット絵コラボ用のグリッド横解像度 */
	dotW?: number;
	/** ドット絵コラボ用のグリッド縦解像度 */
	dotH?: number;
	/** アニメ投稿: imageSrc が横1列のスプライトシートのときのコマ数（無ければ静止画） */
	animFrames?: number;
	/** アニメ投稿の再生fps */
	animFps?: number;
	/** imageSrc が歩行グラのスプライトシートのとき、WalkPreset.label */
	walkPreset?: string;
	/** 自己申告の権利表記。参照ピッカーで改変NG/無断使用禁止の導線を出さないために使う。 */
	originType?: OriginType;
	/**
	 * 検索を呼んだuserId本人の投稿か（サーバー側で判定済み）。
	 * 本人の投稿は権利表記に関わらず使える。生のuser_id/slugはクライアントへ渡さない。
	 */
	isOwner?: boolean;
}

export interface DbPost {
	id: number;
	displayName: string;
	slug?: string;
	/** 投稿者のユーザーID（users.id） */
	userId?: string;
	/** 掲示板モードの「ID:」表示専用。slug(=生のuser_id)とは別に、日替わりしない
	 *  安定ハッシュ値（lib/cc-id.ts:genBbsId）。無ければ getUserIdLabel が displayName から補う。 */
	bbsId?: string;
	/**
	 * 専ブラ向け.dat/subject.txtのファイル名に使うUnixエポック秒(BIGINT)。
	 * threads.dat_key（lib/db/pg.ts createPost参照）。返信(res)には無い＝OPのみ。
	 * 未設定(旧データ等)ならdat/subject.txtルート側でcreatedAtから都度算出する。
	 */
	datKey?: number;
	/**
	 * スレッドタイトル(threads.title列)。unj純正UIは本文(content)とは別にこれを
	 * 入力できるため、本文の1行目と食い違いうる。専ブラのTITLE欄は必ずこちらを
	 * 使うこと（lib/bbs/format.ts:titleOf）。レスには無い＝OPのみ。
	 */
	title?: string;
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
	/** ドット絵コラボ用のグリッド横解像度 */
	dotW?: number;
	/** ドット絵コラボ用のグリッド縦解像度 */
	dotH?: number;
	/** アニメ投稿: imageSrc が横1列のスプライトシートのときのコマ数（無ければ静止画） */
	animFrames?: number;
	/** アニメ投稿の再生fps */
	animFps?: number;
	/** imageSrc が歩行グラのスプライトシートのとき、WalkPreset.label */
	walkPreset?: string;
	originType?: OriginType;
	isFalseDeclaration?: boolean;
	isEdited?: boolean;
	threadId: number;
	parentPostId?: number;
	/**
	 * 返信先の**レス番号**（`res.parent_num`。OP宛なら1）。`parentPostId` と違い、
	 * 親が読み込み済みの窓の外にいても失われないので、掲示板モードの `>>N` 安価は
	 * 必ずこちらを使う（`parentPostId` は窓外の親を解決できずOPへフォールバックする）。
	 */
	parentNum?: number;
	/**
	 * スレッド内のレス番号（OP=1、以降 res.num）。返信一覧は「直近N件の窓」でしか
	 * 読まない（docs/NEON_EGRESS.md）ので、配列の添字から `>>N` を採番することは
	 * できない。窓より古いレスを追加で読むときのカーソルもこの番号を使う。
	 */
	num?: number;
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
