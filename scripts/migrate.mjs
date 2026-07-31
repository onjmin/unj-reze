import pg from 'pg';
const { Pool } = pg;
import fs from 'fs';

// .env ファイルが存在すればロードする (Node.js 20.6.0+ 標準機能)
if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}

const connectionString = process.env.DATABASE_URL || 'postgresql://neon:neon@localhost:5432/unj_reze';

console.log(`Connecting to database...`);
const pool = new Pool({ connectionString });

// マイグレーション定義リスト (新規追加は末尾に追記していく)
const migrations = [
  {
    name: '01_add_is_edited_and_drop_is_original',
    sql: `
      ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE posts DROP COLUMN IF EXISTS is_original;
    `
  },
  {
    name: '02_add_avatar_url_to_users',
    sql: `
      ALTER TABLE anonymous_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    `
  },
  {
    name: '03_add_creator_slug_to_games',
    sql: `
      ALTER TABLE games ADD COLUMN IF NOT EXISTS creator_slug TEXT;
    `
  },
  {
    name: '04_add_bio_to_users',
    sql: `
      ALTER TABLE anonymous_users ADD COLUMN IF NOT EXISTS bio TEXT;
    `
  },
  {
    name: '05_create_oshi_items',
    sql: `
      CREATE TABLE IF NOT EXISTS oshi_items (
        id BIGINT PRIMARY KEY,
        user_slug TEXT NOT NULL,
        kind TEXT NOT NULL,
        track_id BIGINT,
        collection_id BIGINT,
        artist_id BIGINT,
        title TEXT NOT NULL,
        subtitle TEXT,
        artwork_url TEXT,
        view_url TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_oshi_items_user_slug ON oshi_items(user_slug);
    `
  },
  {
    name: '06_add_preview_url_to_oshi_items',
    sql: `
      ALTER TABLE oshi_items ADD COLUMN IF NOT EXISTS preview_url TEXT;
    `
  },
  {
    name: '07_create_blocks_mutes_reports',
    sql: `
      CREATE TABLE IF NOT EXISTS user_blocks (
        blocker_slug TEXT NOT NULL,
        blocked_slug TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (blocker_slug, blocked_slug)
      );

      CREATE TABLE IF NOT EXISTS user_mutes (
        muter_slug TEXT NOT NULL,
        muted_slug TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (muter_slug, muted_slug)
      );

      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        reporter_slug TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `
  },
  {
    name: '08_create_game_tables',
    sql: `
      CREATE TABLE IF NOT EXISTS game_schedule (
        hour_slot TEXT PRIMARY KEY,
        game_id INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS game_votes (
        id SERIAL PRIMARY KEY,
        game_id INTEGER NOT NULL,
        ip_address TEXT NOT NULL,
        hour_slot TEXT NOT NULL,
        UNIQUE(ip_address, hour_slot)
      );

      CREATE TABLE IF NOT EXISTS game_players (
        session_id TEXT NOT NULL,
        game_id INTEGER NOT NULL,
        x REAL NOT NULL DEFAULT 0,
        y REAL NOT NULL DEFAULT 0,
        emoji TEXT NOT NULL DEFAULT '🎮',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (session_id, game_id)
      );

      CREATE TABLE IF NOT EXISTS migration_tokens (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `
  },
  {
    name: '09_fix_notifications_read_and_game_id_bigint',
    sql: `
      -- Fix notifications table missing read column
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT FALSE;

      -- Fix games and reference columns to support 64-bit integer IDs (Date.now())
      ALTER TABLE games ALTER COLUMN id TYPE BIGINT;
      ALTER TABLE game_schedule ALTER COLUMN game_id TYPE BIGINT;
      ALTER TABLE game_votes ALTER COLUMN game_id TYPE BIGINT;
      ALTER TABLE game_players ALTER COLUMN game_id TYPE BIGINT;
      ALTER TABLE posts ALTER COLUMN game_id TYPE BIGINT;
    `
  },
  {
    name: '10_add_play_stats_to_games',
    sql: `
      ALTER TABLE games ADD COLUMN IF NOT EXISTS plays BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE games ADD COLUMN IF NOT EXISTS clears BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE games ADD COLUMN IF NOT EXISTS best_score BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE games ADD COLUMN IF NOT EXISTS best_score_by TEXT;

      -- ランキング（プレイ数降順）と、ゲーム→投稿の逆引き用
      CREATE INDEX IF NOT EXISTS idx_games_plays ON games(plays DESC);
      CREATE INDEX IF NOT EXISTS idx_posts_game_id ON posts(game_id);
    `
  },
  {
    name: '11_denormalize_hearts_total',
    sql: `
      -- posts.hearts_total は列としては存在していたが、これまで heartPost が
      -- post_hearts に行を挿すだけで一度も更新していなかった。一覧クエリを
      -- 相関サブクエリ (SELECT COUNT(*) FROM post_hearts ...) から列参照に切り替えるので、
      -- 既存分をここで一度だけ実数に合わせる（これを飛ばすと全投稿のハートが0に見える）。
      ALTER TABLE posts ADD COLUMN IF NOT EXISTS hearts_total BIGINT NOT NULL DEFAULT 0;

      UPDATE posts p
         SET hearts_total = c.cnt
        FROM (SELECT post_id, COUNT(*) AS cnt FROM post_hearts GROUP BY post_id) c
       WHERE c.post_id = p.id
         AND p.hearts_total IS DISTINCT FROM c.cnt;

      CREATE INDEX IF NOT EXISTS idx_post_hearts_post_id ON post_hearts(post_id);
      CREATE INDEX IF NOT EXISTS idx_post_hearts_user_id ON post_hearts(user_id);
    `
  },
  {
    name: '12_indexes_for_feed_queries',
    sql: `
      -- フィード: WHERE thread_id = id ORDER BY id DESC
      CREATE INDEX IF NOT EXISTS idx_posts_thread_self ON posts(id DESC) WHERE thread_id = id;
      -- 返信の取り出し（スレッドごと新しい順に上限N件）
      CREATE INDEX IF NOT EXISTS idx_posts_thread_id_id ON posts(thread_id, id DESC);
      -- 閲覧者ごとの投票の突き合わせ
      CREATE INDEX IF NOT EXISTS idx_post_votes_user_post ON post_votes(user_id, post_id);
      -- プロフィール一覧
      CREATE INDEX IF NOT EXISTS idx_posts_slug_id ON posts(slug, id DESC);
      -- 通知のポーリング（宛先ごと新しい順 / 未読数）
      CREATE INDEX IF NOT EXISTS idx_notifications_target_created ON notifications(target_user, created_at DESC);
    `
  },
  {
    name: '13_game_players_cleanup_index',
    sql: `
      -- リアルタイム presence を Koyeb 側へ寄せたあとも、DB フォールバック経路
      -- （REALTIME_URL 未設定時）が使う掃除クエリのために最低限の索引は残す。
      CREATE INDEX IF NOT EXISTS idx_game_players_updated_at ON game_players(updated_at);
      CREATE INDEX IF NOT EXISTS idx_game_players_game_updated ON game_players(game_id, updated_at DESC);
    `
  },
  {
    name: '14_relational_user_ids_and_fk_indexes',
    sql: `
      -- Ensure anonymous_users has unique constraint on slug
      ALTER TABLE anonymous_users ADD CONSTRAINT unq_anonymous_users_slug UNIQUE (slug);

      -- Add Foreign Key constraints and indexes to user_follows
      ALTER TABLE user_follows
        ADD CONSTRAINT fk_user_follows_follower FOREIGN KEY (follower_id) REFERENCES anonymous_users(id) ON DELETE CASCADE,
        ADD CONSTRAINT fk_user_follows_followed FOREIGN KEY (followed_id) REFERENCES anonymous_users(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id);
      CREATE INDEX IF NOT EXISTS idx_user_follows_followed ON user_follows(followed_id);

      -- Add Foreign Key constraints and indexes to user_blocks & user_mutes
      ALTER TABLE user_blocks
        ADD CONSTRAINT fk_user_blocks_blocker FOREIGN KEY (blocker_slug) REFERENCES anonymous_users(slug) ON DELETE CASCADE,
        ADD CONSTRAINT fk_user_blocks_blocked FOREIGN KEY (blocked_slug) REFERENCES anonymous_users(slug) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_slug);
      CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_slug);

      ALTER TABLE user_mutes
        ADD CONSTRAINT fk_user_mutes_muter FOREIGN KEY (muter_slug) REFERENCES anonymous_users(slug) ON DELETE CASCADE,
        ADD CONSTRAINT fk_user_mutes_muted FOREIGN KEY (muted_slug) REFERENCES anonymous_users(slug) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_user_mutes_muter ON user_mutes(muter_slug);

      -- Add Foreign Key constraints to post_votes & post_hearts
      ALTER TABLE post_votes
        ADD CONSTRAINT fk_post_votes_user FOREIGN KEY (user_id) REFERENCES anonymous_users(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_post_votes_user ON post_votes(user_id);

      ALTER TABLE post_hearts
        ADD CONSTRAINT fk_post_hearts_user FOREIGN KEY (user_id) REFERENCES anonymous_users(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_post_hearts_user ON post_hearts(user_id);

      -- Add Foreign Key constraints to posts
      ALTER TABLE posts
        ADD CONSTRAINT fk_posts_slug FOREIGN KEY (slug) REFERENCES anonymous_users(slug) ON DELETE SET NULL;

      -- Add Foreign Key constraints and indexes to reports
      ALTER TABLE reports
        ADD CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_slug) REFERENCES anonymous_users(slug) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_slug);
      CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);

      -- Add Foreign Key constraint to oshi_items
      ALTER TABLE oshi_items
        ADD CONSTRAINT fk_oshi_items_user FOREIGN KEY (user_slug) REFERENCES anonymous_users(slug) ON DELETE CASCADE;

      -- Add Foreign Key constraint and index to games
      ALTER TABLE games
        ADD CONSTRAINT fk_games_creator FOREIGN KEY (creator_slug) REFERENCES anonymous_users(slug) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_games_creator ON games(creator_slug);

      -- Add Foreign Key constraints and indexes to game tables
      ALTER TABLE game_schedule
        ADD CONSTRAINT fk_game_schedule_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

      ALTER TABLE game_votes
        ADD CONSTRAINT fk_game_votes_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_game_votes_game_id ON game_votes(game_id);

      ALTER TABLE game_players
        ADD CONSTRAINT fk_game_players_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

      -- Add Foreign Key constraint to migration_tokens
      ALTER TABLE migration_tokens
        ADD CONSTRAINT fk_migration_tokens_user FOREIGN KEY (user_id) REFERENCES anonymous_users(id) ON DELETE CASCADE;

      -- Add indexes for messages & notifications
      CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender, recipient, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_notifications_target_user ON notifications(target_user, read, created_at DESC);
    `
  },
  {
    name: '15_align_all_foreign_keys_to_user_id',
    sql: `
      -- Step 1: 既存の slug 参照データを anonymous_users の正解 id へデータ変換・補正（投稿やデータの消失を防止）
      UPDATE posts p SET slug = u.id FROM anonymous_users u WHERE p.slug = u.slug AND p.slug IS NOT NULL;
      UPDATE games g SET creator_slug = u.id FROM anonymous_users u WHERE g.creator_slug = u.slug AND g.creator_slug IS NOT NULL;
      UPDATE user_blocks b SET blocker_slug = u1.id FROM anonymous_users u1 WHERE b.blocker_slug = u1.slug;
      UPDATE user_blocks b SET blocked_slug = u2.id FROM anonymous_users u2 WHERE b.blocked_slug = u2.slug;
      UPDATE user_mutes m SET muter_slug = u1.id FROM anonymous_users u1 WHERE m.muter_slug = u1.slug;
      UPDATE user_mutes m SET muted_slug = u2.id FROM anonymous_users u2 WHERE m.muted_slug = u2.slug;
      UPDATE reports r SET reporter_slug = u.id FROM anonymous_users u WHERE r.reporter_slug = u.slug;
      UPDATE oshi_items o SET user_slug = u.id FROM anonymous_users u WHERE o.user_slug = u.slug;

      -- Step 2: 古い slug ベースの外部キー制約が存在すれば削除
      ALTER TABLE posts DROP CONSTRAINT IF EXISTS fk_posts_slug;
      ALTER TABLE games DROP CONSTRAINT IF EXISTS fk_games_creator;
      ALTER TABLE user_blocks DROP CONSTRAINT IF EXISTS fk_user_blocks_blocker, DROP CONSTRAINT IF EXISTS fk_user_blocks_blocked;
      ALTER TABLE user_mutes DROP CONSTRAINT IF EXISTS fk_user_mutes_muter, DROP CONSTRAINT IF EXISTS fk_user_mutes_muted;
      ALTER TABLE reports DROP CONSTRAINT IF EXISTS fk_reports_reporter;
      ALTER TABLE oshi_items DROP CONSTRAINT IF EXISTS fk_oshi_items_user;

      -- Step 3: 全関係テーブルに anonymous_users(id) を参照する新しい外部キー制約を付与
      ALTER TABLE posts ADD CONSTRAINT fk_posts_user_id FOREIGN KEY (slug) REFERENCES anonymous_users(id) ON DELETE SET NULL;
      ALTER TABLE games ADD CONSTRAINT fk_games_creator_id FOREIGN KEY (creator_slug) REFERENCES anonymous_users(id) ON DELETE SET NULL;
      ALTER TABLE user_blocks ADD CONSTRAINT fk_user_blocks_blocker_id FOREIGN KEY (blocker_slug) REFERENCES anonymous_users(id) ON DELETE CASCADE, ADD CONSTRAINT fk_user_blocks_blocked_id FOREIGN KEY (blocked_slug) REFERENCES anonymous_users(id) ON DELETE CASCADE;
      ALTER TABLE user_mutes ADD CONSTRAINT fk_user_mutes_muter_id FOREIGN KEY (muter_slug) REFERENCES anonymous_users(id) ON DELETE CASCADE, ADD CONSTRAINT fk_user_mutes_muted_id FOREIGN KEY (muted_slug) REFERENCES anonymous_users(id) ON DELETE CASCADE;
      ALTER TABLE reports ADD CONSTRAINT fk_reports_reporter_id FOREIGN KEY (reporter_slug) REFERENCES anonymous_users(id) ON DELETE CASCADE;
      ALTER TABLE oshi_items ADD CONSTRAINT fk_oshi_items_user_id FOREIGN KEY (user_slug) REFERENCES anonymous_users(id) ON DELETE CASCADE;

      -- Step 4: UPDATE 後のインデックス断片化解消および高速化のため、インデックスを再作成・貼り直し
      CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(slug);

      DROP INDEX IF EXISTS idx_games_creator;
      CREATE INDEX IF NOT EXISTS idx_games_creator ON games(creator_slug);

      DROP INDEX IF EXISTS idx_user_blocks_blocker;
      DROP INDEX IF EXISTS idx_user_blocks_blocked;
      CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_slug);
      CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_slug);

      DROP INDEX IF EXISTS idx_user_mutes_muter;
      CREATE INDEX IF NOT EXISTS idx_user_mutes_muter ON user_mutes(muter_slug);

      DROP INDEX IF EXISTS idx_reports_reporter;
      CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_slug);

      DROP INDEX IF EXISTS idx_oshi_items_user_slug;
      CREATE INDEX IF NOT EXISTS idx_oshi_items_user ON oshi_items(user_slug);
    `
  },
  {
    name: '16_add_game_metrics_columns',
    sql: `
      ALTER TABLE games ADD COLUMN IF NOT EXISTS plays BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE games ADD COLUMN IF NOT EXISTS clears BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE games ADD COLUMN IF NOT EXISTS best_score BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE games ADD COLUMN IF NOT EXISTS best_score_by TEXT;
      CREATE INDEX IF NOT EXISTS idx_games_plays ON games(plays DESC);
    `
  },
  {
    name: '17_restore_user_slugs_and_relink_data',
    sql: `
      -- 既存の投稿・ゲーム・ブロック・ミュート・通報・推しアイテムの紐付けを u.slug に復元（本番データの完全再リンク）
      UPDATE posts p SET slug = u.slug FROM anonymous_users u WHERE p.slug = u.id OR p.slug = u.display_name;
      UPDATE games g SET creator_slug = u.slug FROM anonymous_users u WHERE g.creator_slug = u.id OR g.creator_slug = u.display_name;
      UPDATE user_blocks b SET blocker_slug = u1.slug FROM anonymous_users u1 WHERE b.blocker_slug = u1.id OR b.blocker_slug = u1.display_name;
      UPDATE user_blocks b SET blocked_slug = u2.slug FROM anonymous_users u2 WHERE b.blocked_slug = u2.id OR b.blocked_slug = u2.display_name;
      UPDATE user_mutes m SET muter_slug = u1.slug FROM anonymous_users u1 WHERE m.muter_slug = u1.id OR m.muter_slug = u1.display_name;
      UPDATE user_mutes m SET muted_slug = u2.slug FROM anonymous_users u2 WHERE m.muted_slug = u2.id OR m.muted_slug = u2.display_name;
      UPDATE reports r SET reporter_slug = u.slug FROM anonymous_users u WHERE r.reporter_slug = u.id OR r.reporter_slug = u.display_name;
      UPDATE oshi_items o SET user_slug = u.slug FROM anonymous_users u WHERE o.user_slug = u.id OR o.user_slug = u.display_name;
    `
  }
];

async function run() {
  const client = await pool.connect();
  try {
    // マイグレーション履歴管理用のテーブルを作成
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    for (const m of migrations) {
      // 適用済みか確認
      const res = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [m.name]);
      if (res.rows.length > 0) {
        console.log(`Migration "${m.name}" already applied. Skipping.`);
        continue;
      }

      console.log(`Applying migration: "${m.name}"...`);
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [m.name]);
        await client.query('COMMIT');
        console.log(`Successfully applied "${m.name}".`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Failed to apply "${m.name}":`, err);
        process.exit(1);
      }
    }
    console.log('All migrations completed successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Migration execution failed:', err);
  process.exit(1);
});
