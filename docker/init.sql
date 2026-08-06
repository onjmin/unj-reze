DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS threads CASCADE;
DROP TABLE IF EXISTS res CASCADE;
-- ========== users テーブル ==========
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip INET NOT NULL DEFAULT '0.0.0.0',
    ninja_pokemon SMALLINT NOT NULL DEFAULT 0, -- 忍法帖ポケモンのID「■忍【LV38,ピカチュウ,9S】◆KOSOVO//9k」
    ninja_score SMALLINT NOT NULL DEFAULT 0 -- 忍法帖スコア
);

-- ========== auth_tokens テーブル ==========
CREATE TABLE auth_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    token TEXT NOT NULL,
    ip INET NOT NULL DEFAULT '0.0.0.0'
);

-- 検索効率向上のためのインデックス
CREATE INDEX idx_auth_tokens_user_id ON auth_tokens(user_id);
CREATE INDEX idx_auth_tokens_token ON auth_tokens(token);

-- ========== threads テーブル ==========
CREATE TABLE threads (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
    cc_user_id TEXT NOT NULL DEFAULT '',
    cc_user_name TEXT NOT NULL DEFAULT '',
    cc_user_avatar SMALLINT NOT NULL DEFAULT 0,
    content_text TEXT NOT NULL DEFAULT '',
    content_url TEXT NOT NULL DEFAULT '',
    content_type SMALLINT NOT NULL DEFAULT 1,
    -- DTM(2048)・暗号レス(4096) の本文の保存先URL（R2）。本文そのものは入れない。
    -- MMLは encodeMml 後でも5000文字を超えうるのでカラムには収まらない。
    content_data_url TEXT NOT NULL DEFAULT ''
);

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
    command_result TEXT NOT NULL DEFAULT '',
    UNIQUE (thread_id, num)  -- スレッド内でのレス番号の一意性を保証
);

-- threads 一覧（板 + 論理削除）
CREATE INDEX idx_threads_board_deleted
ON threads (board_id, deleted_at);

-- res 採番用
CREATE INDEX idx_res_thread_num_desc
ON res (thread_id, num DESC);

-- res 新着順
CREATE INDEX idx_res_created_at
ON res (created_at DESC);

-- threads 新着順
CREATE INDEX idx_threads_created_at
ON threads (created_at DESC);

-- 検索用（pg_trgm）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_res_search_cc_user_id
ON res USING gin (LOWER(cc_user_id) gin_trgm_ops);
CREATE INDEX idx_res_search_content_text
ON res USING gin (LOWER(content_text) gin_trgm_ops);
CREATE INDEX idx_res_search_content_url
ON res USING gin (LOWER(content_url) gin_trgm_ops);

CREATE INDEX idx_threads_search_cc_user_id
ON threads USING gin (LOWER(cc_user_id) gin_trgm_ops);
CREATE INDEX idx_threads_search_content_text
ON threads USING gin (LOWER(content_text) gin_trgm_ops);
CREATE INDEX idx_threads_search_content_url
ON threads USING gin (LOWER(content_url) gin_trgm_ops);
