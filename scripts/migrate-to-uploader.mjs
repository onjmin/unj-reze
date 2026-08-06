/**
 * 既存の manifest / MML本文を uploader-worker 経由で R2 へ移送し、URLを書き戻す。
 *
 * スキーマ変更（列追加）は scripts/migrate.mjs の '22_externalize_payloads_to_r2'、
 * 旧列の削除は '23_drop_inline_payloads' が行う。このスクリプトはその間に流す。
 * 実データの移送はHTTPアップロードが要るのでSQLでは書けない。
 *
 *   node scripts/migrate-to-uploader.mjs             # 本番実行
 *   node scripts/migrate-to-uploader.mjs --dry-run   # 書き込まずに件数だけ見る
 *
 * 必要な環境変数:
 *   DATABASE_URL                              既存のものと同じ
 *   UPLOADER_URL                              uploader-worker のURL
 *   UPLOADER_CLIENT_ID                        wrangler.toml の CLIENT_ID
 *   UPLOADER_UPLOAD_SECRET_PEPPER             wrangler.toml の UPLOAD_SECRET_PEPPER
 *
 * 何度流しても安全。移送済みの行（manifest_url が埋まっている / mml_url が埋まっている）は飛ばす。
 * 1件でも失敗したら非ゼロで終了する。全件成功するまで migration 23 を流してはいけない。
 */
import pg from 'pg';
import { webcrypto as crypto } from 'node:crypto';

const DRY_RUN = process.argv.includes('--dry-run');

const {
  DATABASE_URL,
  UPLOADER_URL,
  UPLOADER_CLIENT_ID,
  UPLOADER_UPLOAD_SECRET_PEPPER,
} = process.env;

for (const [name, value] of Object.entries({
  DATABASE_URL, UPLOADER_URL, UPLOADER_CLIENT_ID, UPLOADER_UPLOAD_SECRET_PEPPER,
})) {
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

/** Worker のレート制限は10秒3回。余裕をみて4秒に1回まで落とす */
const RATE_LIMIT_INTERVAL_MS = 4000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sha256(message) {
  const bytes = new TextEncoder().encode(message);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function gzip(text) {
  const stream = new Response(new TextEncoder().encode(text)).body
    .pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

/** mv/game のJSONは30倍近く縮む。mml は encodeMml 済みなので圧縮は効かない */
const NEEDS_GZIP = { mml: false, mv: true, game: true };

async function uploadText(kind, text) {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  // 署名対象は展開後のテキスト。gzipの有無でハッシュは変わらない
  const requestHash = await sha256(`${kind}\n${nonce}\n${text}` + UPLOADER_UPLOAD_SECRET_PEPPER);

  const useGzip = NEEDS_GZIP[kind];
  const params = new URLSearchParams({ kind, nonce });
  if (useGzip) params.set('gzip', '1');

  const res = await fetch(`${UPLOADER_URL}/text?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      Authorization: `Client-ID ${UPLOADER_CLIENT_ID}`,
      'X-Request-Hash': requestHash,
    },
    body: useGzip ? await gzip(text) : text,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.data;
}

/**
 * 汎用の移送ループ。
 * `select` で未処理行を引き、`payloadOf` で本文を取り出し、`update` でURLを書き戻す。
 */
async function migrate(label, { select, payloadOf, kind, update }) {
  const { rows } = await pool.query(select);
  console.log(`[${label}] 対象 ${rows.length} 件`);

  let done = 0;
  const failed = [];

  for (const row of rows) {
    const payload = payloadOf(row);
    if (!payload) {
      console.warn(`[${label}] id=${row.id} 本文が空。スキップ`);
      continue;
    }
    if (DRY_RUN) { done++; continue; }
    try {
      const uploaded = await uploadText(kind, payload);
      await pool.query(update, [uploaded.link, uploaded.delete_id, uploaded.delete_hash, row.id]);
      done++;
      if (done % 25 === 0) console.log(`[${label}] ${done}/${rows.length} 完了`);
    } catch (e) {
      console.error(`[${label}] id=${row.id} 失敗:`, e.message ?? e);
      failed.push(row.id);
    }
    await sleep(RATE_LIMIT_INTERVAL_MS);
  }

  console.log(`[${label}] 移送 ${done} / 失敗 ${failed.length}`);
  if (failed.length) console.error(`[${label}] 失敗したid:`, failed);
  return failed.length;
}

/**
 * content 埋め込みのMMLを取り出す。lib/mml.ts の extractMmlFromContent と同じ規則。
 * マーカー行だけを対象にし、それ以降を全部飲み込まない。
 */
const MML_MARKERS = ['#mml', '#MML作曲'];
function extractMml(content) {
  if (!content) return null;
  const lines = content.split('\n');
  const idx = lines.findIndex((line) => {
    const t = line.trim().toLowerCase();
    return MML_MARKERS.some((m) => t.startsWith(m.toLowerCase()));
  });
  if (idx === -1) return null;
  const line = lines[idx].trim();
  const marker = MML_MARKERS.find((m) => line.toLowerCase().startsWith(m.toLowerCase()));
  const body = line.slice(marker.length).trim();
  return body || null;
}

async function main() {
  if (DRY_RUN) console.log('--dry-run: 書き込みは行いません\n');
  let failures = 0;

  failures += await migrate('games', {
    select: `SELECT id, manifest FROM games WHERE manifest_url = '' ORDER BY id`,
    payloadOf: (r) => (typeof r.manifest === 'string' ? r.manifest : JSON.stringify(r.manifest)),
    kind: 'game',
    update: `UPDATE games SET manifest_url = $1, manifest_delete_id = $2, manifest_delete_hash = $3 WHERE id = $4`,
  });

  failures += await migrate('mvs', {
    select: `SELECT id, manifest FROM mvs WHERE manifest_url = '' ORDER BY id`,
    payloadOf: (r) => (typeof r.manifest === 'string' ? r.manifest : JSON.stringify(r.manifest)),
    kind: 'mv',
    update: `UPDATE mvs SET manifest_url = $1, manifest_delete_id = $2, manifest_delete_hash = $3 WHERE id = $4`,
  });

  // MMLは本文をR2へ出したうえで、content 側はマーカーだけに置き換える。
  // 行ごと消さないのは getDisplayContent が「この行を埋め込みに差し替える」目印に使うため。
  const mmlFailures = await migrate('posts(mml)', {
    select: `SELECT id, content FROM posts WHERE has_mml = TRUE AND mml_url IS NULL ORDER BY id`,
    payloadOf: (r) => extractMml(r.content),
    kind: 'mml',
    update: `UPDATE posts
                SET mml_url = $1, mml_delete_id = $2, mml_delete_hash = $3,
                    content = regexp_replace(content, '(?m)^(\\s*)(#mml|#MML作曲)[^\\n]*$', '\\1\\2')
              WHERE id = $4`,
  });
  failures += mmlFailures;

  await pool.end();

  if (failures) {
    console.error(
      `\n${failures} 件失敗。もう一度流せば失敗分だけ再試行される。` +
      `\n全件成功するまで migration '23_drop_inline_payloads' を流さないこと。`
    );
    process.exit(1);
  }
  console.log("\n全件完了。migration '23_drop_inline_payloads' を流してよい。");
}

main().catch((e) => {
  console.error('移送に失敗:', e);
  process.exit(1);
});
