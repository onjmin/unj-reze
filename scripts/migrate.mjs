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
