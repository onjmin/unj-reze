import type { GameManifestDraft } from "@/components/game/GameMaker";
import type { Message, Trend } from "./mock-db";
import type { MvManifest, MvPresetKind } from "@/lib/mv/mv-config";
import {
	AnonymousUser,
	FollowUser,
	GameVoteCandidate,
	OriginType,
	OshiItemKind,
} from "@/lib/types";
import {
	DbGameRecord,
	DbMediaSearchPost,
	DbMvRecord,
	DbTalkRecord,
	DbOtomadRecord,
	DbNotification,
	DbOshiItem,
	DbPost,
} from "@/lib/types-db";

/**
 * manifest 本体はブラウザが uploader-worker へ直接上げ、DBにはURLだけが渡る。
 * サーバーは manifest を一度も受け取らない（docs/NEON_EGRESS.md）。
 * bgRef / bgUrl はサムネイル用の非正規化値で、manifest を引かずに一覧を出すために持つ。
 */
export interface ManifestRef {
	manifestUrl: string;
	manifestDeleteId?: string;
	manifestDeleteHash?: string;
}

export interface CreateGameParams extends ManifestRef {
	preset: string;
	title: string;
	bgRef?: string;
	creatorSlug?: string;
}

export interface CreateMvParams extends ManifestRef {
	preset: MvPresetKind;
	title: string;
	bgUrl?: string;
	creatorSlug?: string;
}

export interface UpdateGameParams extends ManifestRef {
	title: string;
	bgRef?: string;
}

export interface UpdateMvParams extends ManifestRef {
	title: string;
	bgUrl?: string;
}

export interface CreateTalkParams extends ManifestRef {
	title: string;
	bgUrl?: string;
	creatorSlug?: string;
}

export interface UpdateTalkParams extends ManifestRef {
	title: string;
	bgUrl?: string;
}

export interface CreateOtomadParams extends ManifestRef {
	title: string;
	bgUrl?: string;
	creatorSlug?: string;
}

export interface UpdateOtomadParams extends ManifestRef {
	title: string;
	bgUrl?: string;
}

export interface RecordGamePlayParams {
	/** クリアまで到達したか（false ならゲームオーバー/中断） */
	cleared: boolean;
	/** そのプレイのスコア。ハイスコア更新の判定に使う。 */
	score?: number;
	/** ハイスコアを更新したときに残す表示名 */
	displayName?: string;
	/** プレイ回数を加算するか（同一プレイ中の再挑戦では false にする） */
	countPlay?: boolean;
}

export interface AddOshiItemParams {
	kind: OshiItemKind;
	trackId?: number;
	collectionId?: number;
	artistId?: number;
	title: string;
	subtitle?: string;
	artworkUrl?: string;
	viewUrl?: string;
	previewUrl?: string;
}

/**
 * MML本文の保存先。ブラウザが uploader-worker へ直接上げ、DBにはURLだけが渡る。
 * content 側にはマーカー（`#mml`）だけが残り、本文は入らない。
 */
export interface MmlRef {
	mmlUrl?: string;
	mmlDeleteId?: string;
	mmlDeleteHash?: string;
}

/**
 * 添付画像の削除トークン。画像はブラウザが uploader へ直接上げ（lib/uploader.ts uploadImage）、
 * DBには imageSrc（URL）とこのトークンが渡る。DELETE_SECRET_PEPPER は uploader 側にしか無く
 * 後から再計算できないので、保存しておかないと投稿を消しても画像の実体を消せない。
 * 値は lib/assets/manifest-ref.ts parseImageDeleteRef で imageSrc のキーと突き合わせ済みのものだけ。
 */
export interface ImageDeleteRef {
	imageDeleteId?: string;
	imageDeleteHash?: string;
}

export interface CreatePostParams extends MmlRef, ImageDeleteRef {
	displayName?: string;
	content: string;
	hasImage?: boolean;
	imageSrc?: string;
	imageAlt?: string;
	/**
	 * imageSrc が DrawingEditor/DotDrawingEditor 経由(お絵かき/ドット絵)の保存結果か。
	 * PostComposer のプレーンなファイル選択(input type=file)由来の画像は false/undefined になる。
	 * hasCollabButton は「編集可能なソースを持つ画像か」で判定するため、これが立っていない
	 * 画像は撮影写真等とみなしコラボ導線を出さない。
	 */
	imageIsDrawn?: boolean;
	avatarColor?: string;
	slug?: string;
	gameId?: number;
	mvId?: number;
	talkId?: number;
	otomadId?: number;
	/** ドット絵コラボ用のグリッド横解像度 */
	dotW?: number;
	/** ドット絵コラボ用のグリッド縦解像度 */
	dotH?: number;
	/** imageSrc が横1列のスプライトシートのときのコマ数（無ければ静止画） */
	animFrames?: number;
	/** アニメ/歩行グラの再生fps */
	animFps?: number;
	/**
	 * imageSrc が歩行グラのスプライトシートのとき、`lib/assets/walk-cycle.ts` の
	 * WalkPreset.label（例: "RPGEN"）。方向数・コマ順はこのラベルから一意に
	 * 引けるので、画像の画素サイズから推測(detectPreset)する必要が無くなる
	 * ＝別規格が同じ総ピクセルサイズになる衝突を避けられる。
	 */
	walkPreset?: string;
	/** 自己申告の権利表記。未設定なら undefined */
	originType?: OriginType;
}

/**
 * 投稿済みの画像を、後から「ドット絵素材」として（再）設定するための編集パラメータ。
 * `editPost` にこれを渡したときだけ dot_w/dot_h/anim_frames/anim_fps/walk_preset を更新する
 * （キー省略時は既存値を保つ。値を明示的に null にすればその列だけクリアできる）。
 * これを設定した画像URLはドット絵素材扱いになり、SpriteImageのアニメ/歩行グラ再生対象になる
 * ＝一般の画像投稿を後からアニメ/歩行グラ素材化する唯一の導線。
 */
export interface DotMetaEdit {
	dotW?: number | null;
	dotH?: number | null;
	animFrames?: number | null;
	animFps?: number | null;
	walkPreset?: string | null;
}

export interface ReplyParams extends MmlRef, ImageDeleteRef {
	displayName?: string;
	/** セッションから解決済みのスラッグ。省略時は displayName から導出する。 */
	slug?: string;
	content: string;
	parentPostId?: number;
	hasImage?: boolean;
	imageSrc?: string;
	imageAlt?: string;
	/** CreatePostParams.imageIsDrawn と同義（お絵かき/ドット絵編集由来か） */
	imageIsDrawn?: boolean;
	avatarColor?: string;
	gameId?: number;
	mvId?: number;
	talkId?: number;
	otomadId?: number;
	/** ドット絵コラボ用のグリッド横解像度 */
	dotW?: number;
	/** ドット絵コラボ用のグリッド縦解像度 */
	dotH?: number;
	/** imageSrc が横1列のスプライトシートのときのコマ数（無ければ静止画） */
	animFrames?: number;
	/** アニメ/歩行グラの再生fps */
	animFps?: number;
	/** imageSrc が歩行グラのスプライトシートのとき、WalkPreset.label */
	walkPreset?: string;
	originType?: OriginType;
}

export interface MessageParams {
	sender: string;
	text: string;
	recipient?: string;
}

export interface ReportParams {
	reporterSlug: string;
	targetType: string; // 'post' | 'reply' | 'user' | 'message'
	targetId: string;
	reason: string;
}

export interface GetPostsOptions {
	limit?: number;
	beforeId?: number;
	hasMml?: boolean;
	hasImage?: boolean;
	hasGame?: boolean;
	hasMv?: boolean;
	hasTalk?: boolean;
	hasOtomad?: boolean;
	/**
	 * 各スレッドに直近の返信を埋めるか（既定 true）。
	 * 返信本文を一切使わない一覧——専ブラの subject.txt や sitemap——は false にする。
	 * 300スレ×20返信の本文を読んで捨てるのは、そのまま転送量の無駄
	 * （docs/NEON_EGRESS.md）。
	 */
	withReplies?: boolean;
}

export interface GetRepliesOptions {
	/** 返す最大件数。既定 REPLIES_PAGE_SIZE、上限 REPLIES_PAGE_MAX。 */
	limit?: number;
	/** このレス番号より古い側を返すキーセットカーソル。省略時は最新側から。 */
	beforeNum?: number;
}

/** 返信一覧の既定ページサイズ（フィード埋め込みの件数とも揃える） */
export const REPLIES_PAGE_SIZE = 20;
/**
 * クライアント（GET /api/posts/[id]/replies）が要求できる上限。
 * ストア側の上限はスレのレス数上限 RES_LIMIT で、こちらとは別物
 * ——専ブラ向け .dat だけはプロトコル上スレ全文が必要なので
 * `limit: RES_LIMIT` を明示して全件引く（app/unj/dat/[id]/route.ts）。
 */
export const REPLIES_PAGE_MAX = 50;

/**
 * 共通の約束:
 * - 投稿（DbPost）の `slug` / `userId`（= String(users.id)）は reze 利用者の投稿にだけ付く。
 *   unj 純正の投稿者（users.display_name が NULL）とシステム用の users.id=1 の投稿では undefined で、
 *   `bbsId`（cc_user_id）だけが残る。UI はこれが無い投稿にプロフィール・DM・フォロー等を出さない
 *   （生の users.id を出すと unj 利用者を名寄せできてしまう。lib/db/pg.ts 先頭「ユーザー識別子」）。
 * - 利用者に見せてよい失敗は `Object.assign(new Error("<日本語の文言>"), { expose: true, status })`
 *   で投げる。ルートは `expose === true` のときだけ message と status を返し、それ以外は一般的な 500 にする。
 * - reze が扱う板は board_id=1 だけ。読み取り・返信・編集・削除のどれも板1以外のスレ（とそのレス）は
 *   「無い」扱い。削除済み（deleted_at あり）のスレとそのレスも、読み取り・返信・編集では「無い」扱い
 *   （削除だけは、自分の投稿なら消せる）。
 */
export interface DataStore {
	/** `beforeId` はキーセットページング用のカーソル（そのIDより古いスレッドを返す）。 */
	getPosts(
		userId?: string,
		limitOrOptions?: number | GetPostsOptions,
		beforeId?: number,
		options?: GetPostsOptions,
	): Promise<DbPost[]>;
	getPost(
		id: number,
		userId?: string,
		options?: { withReplies?: boolean },
	): Promise<DbPost | null>;
	/**
	 * 専ブラ向け。dat/bbs.cgi の `key`（=dat ファイル名の数値、DbPost.datKey）から
	 * スレッド(OP)を引く。内部DBの連番id（threadId*2等）とは別の採番空間なので
	 * getPost(id) では引けない。
	 */
	getPostByDatKey(datKey: number, userId?: string): Promise<DbPost | null>;
	createPost(data: CreatePostParams): Promise<DbPost>;
	/**
	 * いいね / だめね / ハート。userId の視点で見えない投稿（鍵アカ・削除済み・板1以外）には
	 * 加算も通知もせず null。数は列の上限（SMALLINT / INTEGER）で頭打ち。
	 */
	likePost(id: number, userId: string): Promise<DbPost | null>;
	dislikePost(id: number, userId: string): Promise<DbPost | null>;
	heartPost(id: number, userId: string, count?: number): Promise<DbPost | null>;
	/**
	 * userId（users.id）のリポストをトグルする。リポストはユーザーごと（post_reposts 表）で、
	 * 戻り値の `reposted` はその人の状態。userId が無ければ何もせず null。
	 * 読み取り系の `reposted` も閲覧者ごとで、viewer 無し（公開キャッシュ）では常に false。
	 */
	repostPost(id: number, userId?: string): Promise<DbPost | null>;
	/**
	 * スレッドの返信を**新しい順に limit 件だけ**返す（返り値自体は num の昇順）。
	 * 全件返してはいけない: 1000レスのスレを個別ページや実況ポーリングで丸ごと
	 * 引くと、それだけで Neon の転送量枠を食い潰す（docs/NEON_EGRESS.md）。
	 * `beforeNum` を渡すと「その番号より古い側」の直近 limit 件を返す＝
	 * 上スクロールでの追加読み込み用カーソル。
	 */
	getReplies(
		postId: number,
		userId?: string,
		options?: GetRepliesOptions,
	): Promise<DbPost[]>;
	/**
	 * 返信する。スレが見えない・無い（鍵アカ・削除済み・板1以外）なら null。
	 * unj のスレ規則に反するときは expose 付きのエラーを投げる:
	 * !バルス済み（403）、!バルサン中でスレ主以外（403）、スレの投稿種別（content_types_bitmask）に
	 * 無い種類（400）、レス数の上限（409）。ID・名前の表示（cc_bitmask）と強制sage にも従う。
	 * コード進行（#コード進行）が許されていないスレではテキストとして保存する（unj と同じ）。
	 * レス番号は unj と同じくスレの行をロックして採る（res_count = 最大のレス番号）。
	 */
	addReply(postId: number, data: ReplyParams): Promise<DbPost | null>;
	/**
	 * 投稿/レスを編集する。所有者不一致・存在しない・見えない（板1以外・削除済みのスレ）・
	 * 削除済みのプレースホルダなら null。レスは !バルス済みのスレなら expose 付きの 403、
	 * 種別が変わる編集（画像・MML の追加など）がスレの content_types_bitmask に無ければ 400。
	 */
	editPost(
		id: number,
		userId: string,
		content: string,
		originType?: OriginType | null,
		imageSrc?: string,
		mml?: MmlRef,
		dotMeta?: DotMetaEdit,
		/** 画像を差し替える編集で、新しい画像の削除トークン */
		imageRef?: ImageDeleteRef,
	): Promise<DbPost | null>;
	/**
	 * 投稿/レスを削除する。所有者不一致・存在しないID・板1以外は false。
	 * レスは本文を「(削除されました)」のプレースホルダに差し替え、添付をすべて外す論理削除
	 * （行と番号は残し、res_count も減らさない。物理削除すると MAX(num)+1 の採番が番号を
	 * 再利用し、通知・>>N・専ブラの dat のバイト位置が別のレスを指してしまう）。
	 * スレ（OP）は生きた返信（repliesCount > 0）が無ければ
	 * 論理削除（deleted_at）、あれば本文を「(削除されました)」のプレースホルダに
	 * 差し替えるだけで行自体とdeleted_at=NULLは残す——スレを丸ごと論理削除すると
	 * 以後どのクエリも deleted_at IS NULL で除外するため、返信は
	 * 「DB上は存在し件数にも数えられるが、フィード/ハッシュタグ/最新レスの
	 * どこからも二度と辿れない」迷子状態になってしまう（当時の返信は物理削除・スレは
	 * 論理削除という非対称性が原因、実際にこれで表示不能になった返信を踏んだ）。
	 * 成功時は消えたMML/添付画像/ゲーム・MV manifestの削除トークン（無ければ空オブジェクト）を返す。
	 * 画像は他人のゲーム/MV/かけあい動画が URL で借りていることがあるが、DBからは見えない。
	 * 所有者の削除を優先して消す（2026-09-23 所有者判断。借りた側は以後その画像が欠ける）。
	 * ゲーム/MVは他の投稿からまだ参照されていれば消さない（実装側でorphan判定する）。
	 * 呼び出し側（app/api/posts/[id]/route.ts）がこれをレスポンスに載せ、
	 * クライアント（lib/api.ts posts.remove）がDB削除確定後にR2の実体を消す
	 * （editPostのpreviousMmlと同じ「DB確定後に消す」順序）。
	 *
	 * threadId（属するスレッドのpostId）も併せて返す。呼び出し側はリアルタイム配信の
	 * チャンネル名（chThread）にこれを使う。削除後のスレは getPost で引けない（論理削除）し、
	 * レスもプレースホルダになっているので、事前に getPost を撃つ代わりにここで返す — 事前取得だと
	 * スレ配下の全レスを読むうえ、所有者チェック前なので他人のスレへのDELETE試行だけで
	 * 無駄な全件読み出しを誘発できてしまう（docs/NEON_EGRESS.md）。
	 */
	deletePost(
		id: number,
		userId: string,
	): Promise<
		| {
				threadId?: number;
				mmlDeleteId?: string;
				mmlDeleteHash?: string;
				imageDeleteId?: string;
				imageDeleteHash?: string;
				gameManifestDeleteId?: string;
				gameManifestDeleteHash?: string;
				mvManifestDeleteId?: string;
				mvManifestDeleteHash?: string;
				talkManifestDeleteId?: string;
				talkManifestDeleteHash?: string;
				otomadManifestDeleteId?: string;
				otomadManifestDeleteHash?: string;
		  }
		| false
	>;
	deleteMessage(id: number, userId: string): Promise<boolean>;
	getUserPostsBySlug(
		slug: string,
		userId?: string,
		limit?: number,
		before?: string,
	): Promise<DbPost[]>;
	/**
	 * reze 利用者の表示名。reze 利用者でない（display_name が NULL の unj 利用者・システム用の
	 * users.id=1・存在しない id）なら undefined。/api/users/[id] と DM の宛先検査はこれで
	 * 「reze 利用者か」を見分ける。
	 */
	getUserDisplayName(slug: string): Promise<string | undefined>;
	getLikedPosts(userId: string, limit?: number): Promise<DbPost[]>;
	getDislikedPosts(userId: string, limit?: number): Promise<DbPost[]>;
	getHeartedPosts(userId: string, limit?: number): Promise<DbPost[]>;
	getNotifications(userId?: string): Promise<DbNotification[]>;
	markNotificationRead(id: number, userId: string): Promise<void>;
	markAllNotificationsRead(userId: string): Promise<void>;
	deleteNotification(id: number, userId: string): Promise<void>;
	getUnreadCount(userId: string): Promise<number>;
	getMessages(userId?: string): Promise<Message[]>;
	/** userId と partnerId の1対1スレッドだけを新しい順に返す。 */
	getConversation(
		userId: string,
		partnerId: string,
		limit?: number,
	): Promise<Message[]>;
	/** 初回DM制限の判定材料。sent=自分が送った通数 / received=相手から届いた通数。 */
	getDmGate(
		userId: string,
		partnerId: string,
	): Promise<{ sent: number; received: number }>;
	/**
	 * DM を保存する。本文が空・5000字超・自分宛ては expose 付きの 400、存在しない宛先は 404。
	 * 読み出し（getMessages / getConversation）の本文も 5000 字で頭打ち。
	 */
	addMessage(data: MessageParams): Promise<Message>;
	getTrends(): Promise<Trend[]>;
	searchPosts(
		query: string,
		userId?: string,
		limit?: number,
	): Promise<DbPost[]>;
	/**
	 * ゲーム/MVエディタの素材ピッカー専用の軽量検索。`kind` で `has_image` / `has_mml` を絞り込み、
	 * スレッド構造・返信は一切引かない（docs/NEON_EGRESS.md）。新しい順（created_at）。
	 * `before`（ISO）を渡すとそれより古いものを limit 件返し、offset は無視する
	 * （タイムラインのメディア欄が過去へ遡るためのカーソル。offset は浅い所しか引けない）。
	 * limit は 51 まで（ルートが hasMore の判定に limit+1 を要求するため）、offset が 100 を
	 * 超えると空配列。本文（content）は見出しの 200 字まで（外部化されていない MML だけ全文）。
	 */
	searchMedia(
		kind: "image" | "mml",
		query: string,
		userId?: string,
		limit?: number,
		offset?: number,
		before?: string,
	): Promise<DbMediaSearchPost[]>;
	getPostsByHashtag(
		tag: string,
		userId?: string,
		limit?: number,
	): Promise<DbPost[]>;
	/**
	 * セッションIDの本人を引き、無ければ作る。unj の署名トークン（`署名.userId.期限`、kind='unj'）は
	 * reze のセッションとして扱わず、expose 付きの 400 を投げる（他人の unj アカウントにならない・
	 * 孤児ユーザーも作らない）。同じIDでの同時作成に負けたときは先に入った持ち主を返し、
	 * それも引けなければ expose 付きの 409。
	 */
	getOrCreateAnonymousUser(
		sessionId: string,
		ipAddress: string,
	): Promise<AnonymousUser>;
	/**
	 * セッションIDから本人を引く。**作成はしない**（未知のセッションは null）。
	 * 書き込み系APIの本人確認に使うので、ここで作ってしまうと「名乗れば通る」に戻る。
	 * unj の署名トークンは引かない（unj が無効にした古いトークンで unj 利用者になれないように）。
	 * サーバー内部の `bbscgi:` トークン（kind='reze'）は引ける（bbs.cgi の旧キーでの照会に使う）。
	 */
	getAnonymousUserBySession(sessionId: string): Promise<AnonymousUser | null>;
	/**
	 * 既存セッションの auth_tokens.last_used_at だけを更新する（UPDATE 1文。照会も作成もしない）。
	 * getAnonymousUserBySession で見つけた後の「使用中」の印に使う。unj の署名トークンの行には触らない。
	 */
	touchAnonymousSession(sessionId: string): Promise<void>;
	/**
	 * プロフィールを更新する。`displayName` を省略すればアイコン/自己紹介だけを更新できる。
	 * slug は所有者キーなので、このメソッドでは**絶対に**書き換えない。
	 * 表示名は unj の名前エスケープ（★◆■●【】）と不可視文字の除去を掛けて保存する
	 * （lib/bbs/user-name.ts sanitizeBbsUserName）。
	 */
	updateUserDisplayName(
		userId: string,
		displayName?: string,
		avatarUrl?: string,
		bio?: string,
	): Promise<void>;
	getUserAvatarUrl(slug: string): Promise<string | undefined>;
	getUserBio(slug: string): Promise<string | undefined>;
	/** 推しリスト。読むのは先頭 100 件まで。 */
	listOshiItems(userSlug: string): Promise<DbOshiItem[]>;
	/** 1人 100 件まで（超えると expose 付きの 400）。iTunes の ID は正の安全な整数以外を無しにする。 */
	addOshiItem(userSlug: string, data: AddOshiItemParams): Promise<DbOshiItem>;
	removeOshiItem(userSlug: string, id: number): Promise<void>;
	getUserSettings(
		slug: string,
	): Promise<{
		isPrivate: boolean;
		hideFromSearch: boolean;
		hideReactions: boolean;
	}>;
	updateUserSettings(
		slug: string,
		settings: Partial<{
			isPrivate: boolean;
			hideFromSearch: boolean;
			hideReactions: boolean;
		}>,
	): Promise<void>;
	issueMigrationToken(userId: string): Promise<string>;
	/**
	 * 移行トークンを引き換え、newSessionId を移行元のユーザーに紐づける。
	 * newSessionId が unj の署名トークンの行だった場合は付け替えずに null（unj が書いた行は触らない）。
	 */
	redeemMigrationToken(
		token: string,
		newSessionId: string,
	): Promise<AnonymousUser | null>;
	followUser(followerId: string, followedId: string): Promise<void>;
	unfollowUser(followerId: string, followedId: string): Promise<void>;
	isFollowing(followerId: string, followedId: string): Promise<boolean>;
	getFollowCounts(
		userId: string,
	): Promise<{ followers: number; following: number }>;
	/** userId をフォローしているユーザー一覧。viewerId を渡すと isFollowing / isSelf が埋まる。 */
	getFollowers(
		userId: string,
		viewerId?: string,
		limit?: number,
	): Promise<FollowUser[]>;
	/** userId がフォローしているユーザー一覧。 */
	getFollowing(
		userId: string,
		viewerId?: string,
		limit?: number,
	): Promise<FollowUser[]>;
	// ブロック / ミュート / 通報（slug 単位で識別）
	blockUser(blockerSlug: string, blockedSlug: string): Promise<void>;
	unblockUser(blockerSlug: string, blockedSlug: string): Promise<void>;
	getBlockedSlugs(blockerSlug: string): Promise<string[]>;
	muteUser(muterSlug: string, mutedSlug: string): Promise<void>;
	unmuteUser(muterSlug: string, mutedSlug: string): Promise<void>;
	getMutedSlugs(muterSlug: string): Promise<string[]>;
	reportContent(data: ReportParams): Promise<void>;
	createGame(data: CreateGameParams): Promise<DbGameRecord>;
	getGame(id: number): Promise<DbGameRecord | null>;
	getGamesByIds(ids: number[]): Promise<DbGameRecord[]>;
	updateGame(id: number, data: UpdateGameParams): Promise<DbGameRecord | null>;
	listAllGames(limit?: number): Promise<DbGameRecord[]>;
	createMv(data: CreateMvParams): Promise<DbMvRecord>;
	getMv(id: number): Promise<DbMvRecord | null>;
	/**
	 * 投稿一覧に埋めるMV情報をまとめて引く。
	 * manifest 本体はもうDBに無いので、返るのは manifestUrl と bgUrl だけ。
	 */
	getMvsByIds(ids: number[]): Promise<DbMvRecord[]>;
	updateMv(id: number, data: UpdateMvParams): Promise<DbMvRecord | null>;
	/** MVの再生数を1加算する。 */
	recordMvPlay(id: number): Promise<void>;
	createTalk(data: CreateTalkParams): Promise<DbTalkRecord>;
	getTalk(id: number): Promise<DbTalkRecord | null>;
	/** 投稿一覧に埋めるかけあい動画の情報をまとめて引く（manifest 本体は載らない）。 */
	getTalksByIds(ids: number[]): Promise<DbTalkRecord[]>;
	updateTalk(id: number, data: UpdateTalkParams): Promise<DbTalkRecord | null>;
	/** かけあい動画の再生数を1加算する。 */
	recordTalkPlay(id: number): Promise<void>;
	createOtomad(data: CreateOtomadParams): Promise<DbOtomadRecord>;
	getOtomad(id: number): Promise<DbOtomadRecord | null>;
	/** 投稿一覧に埋める音MADの情報をまとめて引く（manifest 本体は載らない）。 */
	getOtomadsByIds(ids: number[]): Promise<DbOtomadRecord[]>;
	updateOtomad(
		id: number,
		data: UpdateOtomadParams,
	): Promise<DbOtomadRecord | null>;
	/** 音MADの再生数を1加算する。 */
	recordOtomadPlay(id: number): Promise<void>;
	/** プレイ結果を記録する。plays/clears を加算し、スコアが上回っていればハイスコアを更新する。 */
	recordGamePlay(
		gameId: number,
		data: RecordGamePlayParams,
	): Promise<DbGameRecord | null>;
	/** プレイ数の多い順のゲームランキング。postId を含む。 */
	listTopGames(limit?: number): Promise<DbGameRecord[]>;
	/** ゲームにひもづく最初の投稿ID（コメント欄への導線に使う） */
	getPostIdByGameId(gameId: number): Promise<number | null>;
	/**
	 * 今の注目ゲームと次の候補。鍵アカが作ったゲームは抽選・投票の勝者・候補に出さない。
	 * `ipAddress` は投票者のキー（IPv6 は /64 に丸めたもの。voteGame と同じキーを渡すこと）。
	 */
	getLiveGameInfo(
		ipAddress: string,
	): Promise<{
		gameId: number | null;
		gameTitle: string;
		gamePreset: string;
		hourSlot: string;
		postId: number | null;
		nextCandidates: GameVoteCandidate[];
		myVote: number | null;
	}>;
	voteGame(gameId: number, ipAddress: string): Promise<void>;
	/**
	 * ゲームエディタのギャラリーで見本プリセット／まっさらテンプレートが開かれた回数を
	 * 日別（JST）に1加算する。どの見本が使われているかを見て、残す・直す・消すを決めるための集計。
	 * `preset` の妥当性は呼び出し側（app/api/games/preset-open）で検証済みであること。
	 */
	recordPresetOpen(preset: string): Promise<void>;
	// ゴーストプレイヤーの位置同期はDBに一切持たない。ハブ（Koyeb）のメモリ上のみで
	// 完結する仕組みに一本化した（components/game/LiveGameView.tsx）。ハブ未設定時は
	// プレゼンス機能自体を出さない。DB書き込みへのフォールバックは意図的に作らない。
}
