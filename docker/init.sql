-- ============================================================================
-- unj / unj-reze 統合スキーマ
--
-- 【重要】このファイルの正本は unj リポジトリの wiki/init.sql。
-- ここ（unj-reze/docker/init.sql）はローカル docker-compose (db-neon) 起動時に
-- そのまま読み込ませるための単純コピー。unj側を更新したら必ずこちらにも
-- 同じ内容をコピーすること（自動同期の仕組みは無い）。
--
-- （以下、本番Neonの実体から2026-08-07に再生成・集約した時点の内容）
--
-- unj/unj-reze のDB統合は完了済みで、以後は本番Neonが唯一の正。
-- 過去は移送用の一時マイグレーションSQL（merge_reze_*.sql等）を都度流していたが、
-- 実際に本番へ当てた変更（列追加・インデックス追加）がこのファイルへ反映し忘れる
-- ことがあった（例: oshi_items.position）。このファイルは「今の本番と一致した状態」
-- を都度メンテする consolidated schema として扱い、一時マイグレーションは作らない。
-- 本番へスキーマ変更を入れたら、その場でこのファイルも同じ内容に更新すること。
-- ============================================================================

DROP TABLE IF EXISTS game_votes CASCADE;
DROP TABLE IF EXISTS game_schedule CASCADE;
DROP TABLE IF EXISTS migration_tokens CASCADE;
DROP TABLE IF EXISTS user_mutes CASCADE;
DROP TABLE IF EXISTS user_blocks CASCADE;
DROP TABLE IF EXISTS user_follows CASCADE;
DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS oshi_items CASCADE;
DROP TABLE IF EXISTS res CASCADE;
DROP TABLE IF EXISTS threads CASCADE;
DROP TABLE IF EXISTS mvs CASCADE;
DROP TABLE IF EXISTS games CASCADE;
DROP TABLE IF EXISTS auth_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ========== users テーブル ==========
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip INET NOT NULL DEFAULT '0.0.0.0',
    auth TEXT NOT NULL DEFAULT '', -- unj側の認証情報
    ninja_pokemon SMALLINT NOT NULL DEFAULT 0, -- 忍法帖ポケモンのID「■忍【LV38,ピカチュウ,9S】◆KOSOVO//9k」
    ninja_score SMALLINT NOT NULL DEFAULT 0, -- 忍法帖スコア
    -- ここから reze（プロフィール機能）が追加した列
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    avatar_color TEXT NOT NULL DEFAULT 'from-blue-500 to-indigo-600',
    is_private BOOLEAN NOT NULL DEFAULT FALSE,
    hide_from_search BOOLEAN NOT NULL DEFAULT FALSE,
    hide_reactions BOOLEAN NOT NULL DEFAULT FALSE,
    last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ========== auth_tokens テーブル ==========
CREATE TABLE auth_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    token TEXT NOT NULL,
    ip INET NOT NULL DEFAULT '0.0.0.0',
    kind TEXT NOT NULL DEFAULT 'unj', -- 'unj' | reze側セッションの種別
    last_used_at TIMESTAMP
);

CREATE UNIQUE INDEX unq_auth_tokens_token ON auth_tokens (token);
CREATE INDEX idx_auth_tokens_user_id ON auth_tokens (user_id);
CREATE INDEX idx_auth_tokens_kind_last_used ON auth_tokens (kind, last_used_at);

-- ========== games テーブル（reze GameMaker のゲーム。manifest本体はR2） ==========
CREATE TABLE games (
    id BIGINT PRIMARY KEY,
    preset TEXT NOT NULL,
    title TEXT NOT NULL,
    manifest_url TEXT NOT NULL,
    manifest_delete_id TEXT,
    manifest_delete_hash TEXT,
    bg_ref TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    creator_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    plays BIGINT NOT NULL DEFAULT 0,
    clears BIGINT NOT NULL DEFAULT 0,
    best_score BIGINT NOT NULL DEFAULT 0,
    best_score_by TEXT
);

CREATE INDEX idx_games_plays ON games (plays DESC);
CREATE INDEX idx_games_creator_user_id ON games (creator_user_id);

-- ========== mvs テーブル（reze MVメーカーのMV。manifest本体はR2） ==========
CREATE TABLE mvs (
    id BIGINT PRIMARY KEY,
    preset TEXT NOT NULL,
    title TEXT NOT NULL,
    manifest_url TEXT NOT NULL,
    manifest_delete_id TEXT,
    manifest_delete_hash TEXT,
    bg_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    creator_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    plays BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_mvs_plays ON mvs (plays DESC);
CREATE INDEX idx_mvs_creator_user_id ON mvs (creator_user_id);

-- ========== threads テーブル ==========
CREATE TABLE threads (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- 専ブラ向け.dat/subject.txtのファイル名（Unixエポック秒）。
    -- threads.id をそのまま使うと極端に小さい数値（例:591）になり、専ブラが
    -- エポック秒として誤読して「1970年」表示になる（実質56年前）。作成時に
    -- created_atのエポック秒 or 直前値+1の大きい方で採番し、UNIQUEで秒重複を防ぐ
    -- （lib/db/pg.ts createPost 参照）。
    dat_key BIGINT,
    deleted_at TIMESTAMP, -- 論理削除の予定日時（!timer用）
    ip INET NOT NULL DEFAULT '0.0.0.0',
    res_count SMALLINT NOT NULL DEFAULT 1, -- count()よりも軽量。レス投稿後に発行されるIDが真の値。
    latest_res TEXT NOT NULL DEFAULT '', -- 最終レス
    latest_res_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 最終レスの日時
    first_cursor INT NOT NULL DEFAULT 0, -- 削除予定カラム
    latest_cursor INT NOT NULL DEFAULT 0, -- 削除予定カラム
    -- 基本的な情報
    title TEXT NOT NULL DEFAULT '',
    board_id SMALLINT DEFAULT 0,
    -- 高度な設定
    varsan BOOLEAN NOT NULL DEFAULT FALSE, -- !バルサン
    sage BOOLEAN NOT NULL DEFAULT FALSE, -- 強制sage進行
    cc_bitmask SMALLINT DEFAULT 1, -- 写しの取り方
    content_types_bitmask SMALLINT DEFAULT 1, -- 投稿可能なコンテンツの種類
    res_limit SMALLINT NOT NULL DEFAULT 1000, -- レスの上限
    -- 動的なデータ
    ps TEXT NOT NULL DEFAULT '', -- !add機能で>>1の末尾に追記する内容
    age_res_num INT NOT NULL DEFAULT 0, -- !age機能で表示するレスのID（0の場合はage無し）
    bals_res_num INT NOT NULL DEFAULT 0, -- !バルス
    lol_count SMALLINT NOT NULL DEFAULT 0, -- 草ボタン
    good_count SMALLINT NOT NULL DEFAULT 0, -- ｲｲ!(・∀・)
    bad_count SMALLINT NOT NULL DEFAULT 0, -- (・Ａ・)ｲｸﾅｲ!
    -- 書き込み内容
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cc_user_id TEXT NOT NULL DEFAULT '', -- lib/cc-id.ts:genBbsId（reze由来）/ unj cc.ts:genId（unj由来）
    cc_user_name TEXT NOT NULL DEFAULT '',
    cc_user_avatar SMALLINT NOT NULL DEFAULT 0,
    content_text TEXT NOT NULL DEFAULT '',
    content_url TEXT NOT NULL DEFAULT '',
    content_type SMALLINT NOT NULL DEFAULT 1,
    -- DTM(2048)・暗号レス(4096) の本文の保存先URL（R2）。本文そのものは入れない。
    -- MMLは encodeMml 後でも5000文字を超えうるのでカラムには収まらない。
    content_data_url TEXT NOT NULL DEFAULT '',
    -- content_data_url（MML）の削除トークン。games/mvsのmanifest_delete_id/hashと同じ役目。
    -- 編集で新しいR2オブジェクトへ上げ直すたびに、これが無いと旧オブジェクトを二度と消せず
    -- R2にゴミが溜まり続ける（lib/db/pg.ts editPost 参照）。
    mml_delete_id TEXT,
    mml_delete_hash TEXT,
    -- ここから reze 由来（unj/unj-reze DB統合時に追加）
    hearts_total INTEGER NOT NULL DEFAULT 0,
    reposts INTEGER NOT NULL DEFAULT 0,
    origin_type TEXT, -- 自己申告の権利表記。改造導線（コラボ）の出し分けに使う
    is_false_declaration BOOLEAN NOT NULL DEFAULT FALSE,
    has_collab_button BOOLEAN NOT NULL DEFAULT FALSE,
    is_edited BOOLEAN NOT NULL DEFAULT FALSE, -- unjには編集機能が無いが、rezeから来た投稿は編集済みでありうる
    avatar_color TEXT, -- 投稿者のアバター色。unjのcc_user_avatar(SMALLINT)はアイコン番号で意味が違うため別に持つ
    reposted BOOLEAN NOT NULL DEFAULT FALSE,
    reze_origin_post_id INTEGER, -- 移送の追跡と冪等性。reze の posts.id を控える（新規投稿では使わない）
    game_id BIGINT REFERENCES games(id) ON DELETE SET NULL,
    mv_id BIGINT REFERENCES mvs(id) ON DELETE SET NULL,
    dot_w SMALLINT, -- ドット絵コラボ用のグリッド横解像度（例: 16, 24, 32, 48, 64）
    dot_h SMALLINT, -- ドット絵コラボ用のグリッド縦解像度
    -- 別カラムで持つ。歩行グラの方向数/コマ順はwalk_presetのラベルから
    anim_frames SMALLINT, -- スプライトシートのコマ数（横の列数。歩行グラは方向あたりのコマ数）
    anim_fps SMALLINT, -- 再生fps
    walk_preset TEXT -- 歩行グラのとき lib/walk-cycle.ts の WalkPreset.label。アニメ絵ならNULL
);

CREATE INDEX idx_threads_board_deleted ON threads (board_id, deleted_at);
CREATE INDEX idx_threads_created_at ON threads (created_at DESC);
CREATE UNIQUE INDEX unq_threads_reze_origin_post_id
    ON threads (reze_origin_post_id) WHERE reze_origin_post_id IS NOT NULL;
CREATE UNIQUE INDEX unq_threads_dat_key
    ON threads (dat_key) WHERE dat_key IS NOT NULL;

-- ========== res テーブル ==========
CREATE TABLE res (
    id SERIAL PRIMARY KEY,
    thread_id INT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    num SMALLINT NOT NULL DEFAULT 2, -- レス番号（各スレッド内で連番）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip INET NOT NULL DEFAULT '0.0.0.0',
    is_owner BOOLEAN NOT NULL DEFAULT FALSE, -- スレ主フラグ
    sage BOOLEAN NOT NULL DEFAULT FALSE,
    -- 書き込み内容
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cc_user_id TEXT NOT NULL DEFAULT '',
    cc_user_name TEXT NOT NULL DEFAULT '',
    cc_user_avatar SMALLINT NOT NULL DEFAULT 0,
    content_text TEXT NOT NULL DEFAULT '',
    content_url TEXT NOT NULL DEFAULT '',
    content_type SMALLINT NOT NULL DEFAULT 1,
    -- threads と同じくR2の保存先URL。本文そのものは入れない。
    content_data_url TEXT NOT NULL DEFAULT '',
    -- threads.mml_delete_id/hash と同じ役目（このレスのMMLの削除トークン）。
    mml_delete_id TEXT,
    mml_delete_hash TEXT,
    command_result TEXT NOT NULL DEFAULT '',
    -- ここから reze 由来（unj/unj-reze DB統合時に追加）
    good_count SMALLINT NOT NULL DEFAULT 0, -- unjのresには元々いいね系の列が無かった
    bad_count SMALLINT NOT NULL DEFAULT 0,
    hearts_total INTEGER NOT NULL DEFAULT 0,
    reposts INTEGER NOT NULL DEFAULT 0,
    origin_type TEXT,
    is_false_declaration BOOLEAN NOT NULL DEFAULT FALSE,
    has_collab_button BOOLEAN NOT NULL DEFAULT FALSE,
    is_edited BOOLEAN NOT NULL DEFAULT FALSE,
    avatar_color TEXT,
    parent_num SMALLINT, -- 返信の親。unjは本文の>>nアンカーしか持たないため別カラムで保持
    reposted BOOLEAN NOT NULL DEFAULT FALSE,
    reze_origin_post_id INTEGER,
    game_id BIGINT REFERENCES games(id) ON DELETE SET NULL,
    mv_id BIGINT REFERENCES mvs(id) ON DELETE SET NULL,
    dot_w SMALLINT,
    dot_h SMALLINT,
    anim_frames SMALLINT,
    anim_fps SMALLINT,
    walk_preset TEXT,
    UNIQUE (thread_id, num) -- スレッド内でのレス番号の一意性を保証
);

CREATE INDEX idx_res_thread_num_desc ON res (thread_id, num DESC);
CREATE INDEX idx_res_created_at ON res (created_at DESC);
CREATE INDEX idx_res_game_id ON res (game_id) WHERE game_id IS NOT NULL;
CREATE INDEX idx_res_mv_id ON res (mv_id) WHERE mv_id IS NOT NULL;
CREATE UNIQUE INDEX unq_res_reze_origin_post_id
    ON res (reze_origin_post_id) WHERE reze_origin_post_id IS NOT NULL;

-- 検索用（pg_trgm）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_res_search_cc_user_id ON res USING gin (LOWER(cc_user_id) gin_trgm_ops);
CREATE INDEX idx_res_search_content_text ON res USING gin (LOWER(content_text) gin_trgm_ops);
CREATE INDEX idx_res_search_content_url ON res USING gin (LOWER(content_url) gin_trgm_ops);

CREATE INDEX idx_threads_search_cc_user_id ON threads USING gin (LOWER(cc_user_id) gin_trgm_ops);
CREATE INDEX idx_threads_search_content_text ON threads USING gin (LOWER(content_text) gin_trgm_ops);
CREATE INDEX idx_threads_search_content_url ON threads USING gin (LOWER(content_url) gin_trgm_ops);

-- ========== oshi_items テーブル ==========
-- unj-reze のプロフィール「推しリスト」機能。unj本体のcc.tsは関与せず、
-- reze側 (lib/db/pg.ts) が owner_user_id = users.id で直接読み書きする。
CREATE TABLE oshi_items (
    id SERIAL PRIMARY KEY,
    owner_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, -- 'song' | 'album' | 'artist'
    track_id BIGINT,
    collection_id BIGINT,
    artist_id BIGINT,
    title TEXT NOT NULL,
    subtitle TEXT,
    artwork_url TEXT, -- artist の場合はApple Music側が返さないので常にNULL
    view_url TEXT,
    preview_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    position INTEGER NOT NULL DEFAULT 0 -- 表示順（追加順に連番）。列追加が一時マイグレーションに反映されていなかった実績あり
);

CREATE INDEX idx_oshi_items_owner ON oshi_items (owner_user_id);

-- ========== notifications テーブル ==========
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'like', -- 'like' | 'reply' | 'mention' | ...
    actor_user_id INT REFERENCES users(id) ON DELETE CASCADE,
    target_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    thread_id INT REFERENCES threads(id) ON DELETE CASCADE,
    res_num SMALLINT,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_target ON notifications (target_user_id, read, created_at DESC);

-- ========== messages テーブル（DM） ==========
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    sender_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_user_id INT REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_conversation ON messages (sender_user_id, recipient_user_id, created_at DESC);

-- ========== reports テーブル（通報） ==========
CREATE TABLE reports (
    id SERIAL PRIMARY KEY,
    reporter_user_id INT REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ========== user_follows テーブル ==========
CREATE TABLE user_follows (
    follower_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followed_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_user_id, followed_user_id)
);

CREATE INDEX idx_user_follows_followed ON user_follows (followed_user_id);

-- ========== user_blocks テーブル ==========
CREATE TABLE user_blocks (
    blocker_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (blocker_user_id, blocked_user_id)
);

-- ========== user_mutes テーブル ==========
CREATE TABLE user_mutes (
    muter_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    muted_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (muter_user_id, muted_user_id)
);

-- ========== migration_tokens テーブル（reze旧セッション→アカウント移行用） ==========
CREATE TABLE migration_tokens (
    token TEXT PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ========== game_schedule テーブル（時間帯ごとの「今の注目ゲーム」） ==========
CREATE TABLE game_schedule (
    hour_slot TEXT PRIMARY KEY,
    game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE
);

-- ========== game_votes テーブル（時間帯ごとのゲーム投票、IP+枠で1票） ==========
CREATE TABLE game_votes (
    id SERIAL PRIMARY KEY,
    game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    ip_address TEXT NOT NULL,
    hour_slot TEXT NOT NULL,
    UNIQUE (ip_address, hour_slot)
);
