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
    name: '10_add_checkered_dark_to_posts',
    sql: `
      ALTER TABLE posts ADD COLUMN IF NOT EXISTS checkered_dark INTEGER;
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
