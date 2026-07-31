import type { Database as SqlJsDatabase } from 'sql.js';
import { INIT_SQL } from './init-sql';
import { AnonymousUser, OriginType } from '../types';
import { DbPost as Post, DbNotification as Notification, DbOshiItem } from '../types-db';
import type { Message, Trend } from '../mock-db';
import type { DataStore, CreatePostParams, ReplyParams, MessageParams, ReportParams } from './interface';
import { formatRelativeTime } from '../time';
import { cleanContentForTrends, isValidTrendKeyword } from '../mml';
import { publishRealtime } from '../realtime/publish';
import { chUser } from '../realtime/channels';


let db: SqlJsDatabase | null = null;

async function getDb(): Promise<SqlJsDatabase> {
  if (db) return db;

  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();

  try {
    db = new SQL.Database();
    await runInitSql(db);
  } catch {
    db = new SQL.Database();
    await runInitSql(db);
  }

  ensureAnonymousUsersTable(db);
  ensureTableMigrations(db);
  return db;
}

async function runInitSql(database: SqlJsDatabase) {
  database.run(INIT_SQL);
  saveDb();
}

function ensureAnonymousUsersTable(d: SqlJsDatabase) {
  d.run(`CREATE TABLE IF NOT EXISTS anonymous_users (
    id TEXT PRIMARY KEY,
    ip_address TEXT NOT NULL,
    session_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    slug TEXT,
    avatar_color TEXT NOT NULL DEFAULT 'from-blue-500 to-indigo-600',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  d.run(`CREATE INDEX IF NOT EXISTS idx_anonymous_users_ip ON anonymous_users(ip_address)`);
  d.run(`CREATE INDEX IF NOT EXISTS idx_anonymous_users_session ON anonymous_users(session_id)`);
  d.run(`CREATE TABLE IF NOT EXISTS user_follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id TEXT NOT NULL,
    followed_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (follower_id, followed_id)
  )`);
}

function ensureTableMigrations(d: SqlJsDatabase) {
  const cols = d.exec("PRAGMA table_info(notifications)");
  const colNames = cols.length > 0 ? cols[0].values.map((v: any) => v[1]) : [];
  if (!colNames.includes('type')) {
    d.run("ALTER TABLE notifications ADD COLUMN type TEXT NOT NULL DEFAULT 'like'");
  }
  if (!colNames.includes('post_id')) {
    d.run("ALTER TABLE notifications ADD COLUMN post_id INTEGER");
  }
  if (!colNames.includes('target_user')) {
    d.run("ALTER TABLE notifications ADD COLUMN target_user TEXT");
  }
  const userCols = d.exec("PRAGMA table_info(anonymous_users)");
  const userColNames = userCols.length > 0 ? userCols[0].values.map((v: any) => v[1]) : [];
  if (!userColNames.includes('avatar_url')) {
    d.run("ALTER TABLE anonymous_users ADD COLUMN avatar_url TEXT");
  }
  if (!userColNames.includes('bio')) {
    d.run("ALTER TABLE anonymous_users ADD COLUMN bio TEXT");
  }
  const msgCols = d.exec("PRAGMA table_info(messages)");
  const msgColNames = msgCols.length > 0 ? msgCols[0].values.map((v: any) => v[1]) : [];
  if (!msgColNames.includes('recipient')) {
    d.run("ALTER TABLE messages ADD COLUMN recipient TEXT");
  }
  d.run(`CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY,
    preset TEXT NOT NULL,
    title TEXT NOT NULL,
    manifest TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    creator_slug TEXT
  )`);
  const gameCols = d.exec("PRAGMA table_info(games)");
  const gameColNames = gameCols.length > 0 ? gameCols[0].values.map((v: any) => v[1]) : [];
  if (!gameColNames.includes('creator_slug')) {
    d.run("ALTER TABLE games ADD COLUMN creator_slug TEXT");
  }
  if (!gameColNames.includes('plays')) {
    d.run("ALTER TABLE games ADD COLUMN plays INTEGER NOT NULL DEFAULT 0");
  }
  if (!gameColNames.includes('clears')) {
    d.run("ALTER TABLE games ADD COLUMN clears INTEGER NOT NULL DEFAULT 0");
  }
  if (!gameColNames.includes('best_score')) {
    d.run("ALTER TABLE games ADD COLUMN best_score INTEGER NOT NULL DEFAULT 0");
  }
  if (!gameColNames.includes('best_score_by')) {
    d.run("ALTER TABLE games ADD COLUMN best_score_by TEXT");
  }
  d.run(`CREATE TABLE IF NOT EXISTS game_schedule (
    hour_slot TEXT PRIMARY KEY,
    game_id INTEGER NOT NULL
  )`);
  d.run(`CREATE TABLE IF NOT EXISTS game_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    ip_address TEXT NOT NULL,
    hour_slot TEXT NOT NULL,
    UNIQUE(ip_address, hour_slot)
  )`);
  d.run(`CREATE TABLE IF NOT EXISTS game_players (
    session_id TEXT NOT NULL,
    game_id INTEGER NOT NULL,
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    emoji TEXT NOT NULL DEFAULT '🎮',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (session_id, game_id)
  )`);
  const postCols = d.exec("PRAGMA table_info(posts)");
  const postColNames = postCols.length > 0 ? postCols[0].values.map((v: any) => v[1]) : [];
  if (!postColNames.includes('game_id')) {
    d.run("ALTER TABLE posts ADD COLUMN game_id INTEGER");
  }
  if (!postColNames.includes('is_original')) {
    d.run("ALTER TABLE posts ADD COLUMN is_original INTEGER");
  }
  if (!postColNames.includes('origin_type')) {
    d.run("ALTER TABLE posts ADD COLUMN origin_type TEXT");
  }
  // Migration: 旧 is_original(boolean) の値を origin_type(自作/他作/AI作品) に引き継ぐ
  d.run(`UPDATE posts SET origin_type = CASE WHEN is_original THEN 'original' ELSE 'derivative' END
         WHERE origin_type IS NULL AND is_original IS NOT NULL`);
  if (!postColNames.includes('is_false_declaration')) {
    d.run("ALTER TABLE posts ADD COLUMN is_false_declaration INTEGER NOT NULL DEFAULT 0");
  }
  if (!postColNames.includes('is_edited')) {
    d.run("ALTER TABLE posts ADD COLUMN is_edited INTEGER NOT NULL DEFAULT 0");
  }
  d.run(`CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_slug TEXT NOT NULL,
    blocked_slug TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (blocker_slug, blocked_slug)
  )`);
  d.run(`CREATE TABLE IF NOT EXISTS user_mutes (
    muter_slug TEXT NOT NULL,
    muted_slug TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (muter_slug, muted_slug)
  )`);
  d.run(`CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_slug TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  d.run(`CREATE TABLE IF NOT EXISTS migration_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const auCols = d.exec("PRAGMA table_info(anonymous_users)");
  const auColNames = auCols.length > 0 ? auCols[0].values.map((v: any) => v[1]) : [];
  if (!auColNames.includes('is_private')) d.run("ALTER TABLE anonymous_users ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0");
  if (!auColNames.includes('hide_from_search')) d.run("ALTER TABLE anonymous_users ADD COLUMN hide_from_search INTEGER NOT NULL DEFAULT 0");
  if (!auColNames.includes('hide_reactions')) d.run("ALTER TABLE anonymous_users ADD COLUMN hide_reactions INTEGER NOT NULL DEFAULT 0");
  if (!colNames.includes('read')) d.run("ALTER TABLE notifications ADD COLUMN read INTEGER NOT NULL DEFAULT 0");
  d.run(`CREATE TABLE IF NOT EXISTS oshi_items (
    id INTEGER PRIMARY KEY,
    user_slug TEXT NOT NULL,
    kind TEXT NOT NULL,
    track_id INTEGER,
    collection_id INTEGER,
    artist_id INTEGER,
    title TEXT NOT NULL,
    subtitle TEXT,
    artwork_url TEXT,
    view_url TEXT,
    preview_url TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const oshiCols = d.exec("PRAGMA table_info(oshi_items)");
  const oshiColNames = oshiCols.length > 0 ? oshiCols[0].values.map((v: any) => v[1]) : [];
  if (!oshiColNames.includes('preview_url')) d.run("ALTER TABLE oshi_items ADD COLUMN preview_url TEXT");
}

function snippetSqlite(text: string): string {
  return text.length > 20 ? text.slice(0, 20) + '…' : text;
}

/** 通知を挿入。自己宛は生成しない。 */
function insertNotificationSqlite(d: SqlJsDatabase, data: { recipientId: string; actor: string; type: string; action: string; target?: string; postId?: number }): void {
  if (!data.recipientId || data.recipientId === data.actor) return;
  try {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    d.run(
      `INSERT INTO notifications (id, user_name, action, target, type, post_id, target_user, read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [id, data.actor, data.action, data.target ?? '', data.type, data.postId ?? null, data.recipientId, new Date().toISOString()]
    );
    // pg 側と同じく、宛先本人へ「1件届いた」だけを push する（lib/db/pg.ts の同関数を参照）。
    publishRealtime({ channel: chUser(data.recipientId), event: 'notify', data: { type: data.type } });
  } catch { /* notifications 未整備時は無視 */ }
}

/** userId(匿名ID/displayName/slug) から slug を解決。 */
function resolveViewerSlugSqlite(d: SqlJsDatabase, userId: string): string {
  const u = rowsToObjects(d, 'SELECT slug FROM anonymous_users WHERE id = ? OR display_name = ? OR slug = ? LIMIT 1', [userId, userId, userId]);
  return u.length > 0 ? u[0].slug : deriveSlugSqlite(userId);
}

/** 閲覧者に対して非表示にすべき slug 集合(ブロック双方向 + 自分のミュート)。 */
function getHiddenSlugsSqlite(d: SqlJsDatabase, userId?: string): Set<string> {
  const hidden = new Set<string>();
  if (!userId) return hidden;
  const viewerSlug = resolveViewerSlugSqlite(d, userId);
  if (!viewerSlug) return hidden;
  const blocks = rowsToObjects(d, 'SELECT blocker_slug, blocked_slug FROM user_blocks WHERE blocker_slug = ? OR blocked_slug = ?', [viewerSlug, viewerSlug]);
  for (const r of blocks) {
    if (r.blocker_slug === viewerSlug) hidden.add(r.blocked_slug);
    if (r.blocked_slug === viewerSlug) hidden.add(r.blocker_slug);
  }
  const mutes = rowsToObjects(d, 'SELECT muted_slug FROM user_mutes WHERE muter_slug = ?', [viewerSlug]);
  for (const r of mutes) hidden.add(r.muted_slug);
  return hidden;
}

function saveDb() {
  // インメモリSQLモックのため、物理ファイルへの保存は行いません。
}

function rowToOshiItemSqlite(row: any): DbOshiItem {
  return {
    id: row.id,
    userSlug: row.user_slug,
    kind: row.kind,
    trackId: row.track_id ?? undefined,
    collectionId: row.collection_id ?? undefined,
    artistId: row.artist_id ?? undefined,
    title: row.title,
    subtitle: row.subtitle ?? undefined,
    artworkUrl: row.artwork_url ?? undefined,
    viewUrl: row.view_url ?? undefined,
    previewUrl: row.preview_url ?? undefined,
    position: row.position,
    createdAt: row.created_at,
  };
}

function rowToPost(row: any): Post {
  const createdAt = row.created_at;
  return {
    id: row.id,
    displayName: row.display_name ?? '名無し',
    slug: row.slug ?? undefined,
    createdAt,
    time: formatRelativeTime(createdAt),
    content: row.content,
    likes: row.likes,
    dislikes: row.dislikes,
    liked: !!row.liked,
    disliked: !!row.disliked,
    repliesCount: row.replies_count,
    reposts: row.reposts,
    reposted: !!row.reposted,
    hasImage: !!row.has_image,
    imageSrc: row.image_src ?? undefined,
    imageAlt: row.image_alt ?? undefined,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_url ?? undefined,
    hasCollabButton: !!row.has_collab_button,
    heartsTotal: row.hearts_total ?? 0,
    hasGame: !!row.has_game,
    gameId: row.game_id ?? undefined,
    originType: row.origin_type ?? undefined,
    isFalseDeclaration: !!row.is_false_declaration,
    isEdited: !!row.is_edited,
    threadId: row.thread_id,
    parentPostId: row.parent_post_id ?? undefined,
    replies: [],
  };
}

function deriveSlugSqlite(fullName: string): string {
  const match = fullName.match(/[a-zA-Z0-9]+$/);
  return match ? match[0] : fullName;
}

const AVATAR_GRADIENTS_SQLITE = [
  'from-blue-500 to-indigo-600',
  'from-red-500 to-rose-600',
  'from-emerald-400 to-teal-500',
  'from-purple-400 to-violet-500',
  'from-amber-400 to-yellow-500',
  'from-pink-400 to-rose-500',
  'from-cyan-400 to-indigo-500',
  'from-lime-400 to-green-500',
  'from-orange-400 to-red-500',
  'from-teal-400 to-cyan-500',
];

function generateDisplayNameSqlite(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 15; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

function randomGradientSqlite(): string {
  return AVATAR_GRADIENTS_SQLITE[Math.floor(Math.random() * AVATAR_GRADIENTS_SQLITE.length)];
}

/** games 行からプレイ統計を取り出す。列が未マイグレーションでも 0 として扱う。 */
function gameStatsFromRow(row: any) {
  return {
    plays: Number(row.plays ?? 0),
    clears: Number(row.clears ?? 0),
    bestScore: Number(row.best_score ?? 0),
    bestScoreBy: row.best_score_by ?? undefined,
  };
}

function rowsToObjects(d: SqlJsDatabase, sql: string, params: any[] = []): any[] {
  const result = d.exec(sql, params);
  if (result.length === 0 || result[0].values.length === 0) return [];
  const cols = result[0].columns;
  return result[0].values.map((v: any[]) => {
    const obj: any = {};
    cols.forEach((c, i) => { obj[c] = v[i]; });
    return obj;
  });
}

/** フィード1スレッドあたりに載せる返信の上限（lib/db/pg.ts と揃える）。 */
const FEED_REPLIES_PER_THREAD = 20;

const VOTED_SELECT = `
  SELECT p.*,
    COALESCE(au.display_name, p.display_name) as display_name,
    au.avatar_url as avatar_url,
    COALESCE((SELECT vote_type FROM post_votes pv WHERE pv.post_id = p.id AND pv.user_id = ?), '') as vote_type
  FROM posts p
  LEFT JOIN anonymous_users au ON p.slug = au.slug
`;

const UNVOTED_SELECT = `
  SELECT p.*,
    COALESCE(au.display_name, p.display_name) as display_name,
    au.avatar_url as avatar_url,
    0 as liked, 0 as disliked
  FROM posts p
  LEFT JOIN anonymous_users au ON p.slug = au.slug
`;

function applyVoteRow(obj: any, userId?: string): any {
  if (userId) {
    obj.liked = obj.vote_type === 'like' ? 1 : 0;
    obj.disliked = obj.vote_type === 'dislike' ? 1 : 0;
  } else {
    obj.liked = 0;
    obj.disliked = 0;
  }
  delete obj.vote_type;
  return obj;
}

async function getThreadRepliesSqlite(d: SqlJsDatabase, threadIds: number[]): Promise<Map<number, Post[]>> {
  if (threadIds.length === 0) return new Map();
  const placeholders = threadIds.map(() => '?').join(',');
  const rows = rowsToObjects(
    d,
    `SELECT p.*,
       COALESCE(au.display_name, p.display_name) as display_name,
       au.avatar_url as avatar_url
     FROM posts p
     LEFT JOIN anonymous_users au ON p.slug = au.slug
     WHERE p.thread_id IN (${placeholders}) AND p.id != p.thread_id
       AND p.id > COALESCE((
         SELECT q.id FROM posts q
          WHERE q.thread_id = p.thread_id AND q.id != q.thread_id
          ORDER BY q.id DESC LIMIT 1 OFFSET ${FEED_REPLIES_PER_THREAD}
       ), -1)
     ORDER BY p.id`,
    threadIds
  );
  const map = new Map<number, Post[]>();
  for (const row of rows) {
    const pid = row.thread_id;
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid)!.push(rowToPost(row));
  }
  return map;
}

export const sqliteStore: DataStore = {
  async getPosts(userId?: string, limit?: number, beforeId?: number) {
    const d = await getDb();
    const limitClause = limit ? ` LIMIT ${Math.max(1, Math.min(limit, 100))}` : '';
    // キーセットページング（lib/db/pg.ts と同じ意味）: カーソルより古いスレッドだけ返す
    const cursorClause = beforeId ? ' AND p.id < ?' : '';
    const cursorParams = beforeId ? [beforeId] : [];
    let rows;
    if (userId) {
      rows = rowsToObjects(
        d,
        `${VOTED_SELECT} WHERE p.thread_id = p.id${cursorClause} ORDER BY p.id DESC${limitClause}`,
        [userId, ...cursorParams]
      );
    } else {
      rows = rowsToObjects(
        d,
        `${UNVOTED_SELECT} WHERE p.thread_id = p.id${cursorClause} ORDER BY p.id DESC${limitClause}`,
        cursorParams
      );
    }
    if (rows.length === 0) return [];
    rows.forEach(r => applyVoteRow(r, userId));

    const threadIds = rows.map(r => r.id);
    const repliesMap = await getThreadRepliesSqlite(d, threadIds);

    const hidden = getHiddenSlugsSqlite(d, userId);
    return rows.map(r => ({
      ...rowToPost(r),
      replies: (repliesMap.get(r.id) || []).filter(rep => !hidden.has(rep.slug ?? '')),
    })).filter(p => !hidden.has(p.slug ?? ''));
  },

  async getPost(id: number, userId?: string) {
    const d = await getDb();
    let rows;
    if (userId) {
      rows = rowsToObjects(d, `${VOTED_SELECT} WHERE p.id = ?`, [userId, id]);
    } else {
      rows = rowsToObjects(
        d,
        `${UNVOTED_SELECT} WHERE p.id = ?`,
        [id]
      );
    }
    if (rows.length === 0) return null;
    applyVoteRow(rows[0], userId);
    const post = rowToPost(rows[0]);

    if (post.threadId === post.id) {
      const repliesRows = rowsToObjects(
        d,
        `SELECT p.*,
           COALESCE(au.display_name, p.display_name) as display_name,
           au.avatar_url as avatar_url
         FROM posts p
         LEFT JOIN anonymous_users au ON p.slug = au.slug
         WHERE p.thread_id = ? AND p.id != p.thread_id ORDER BY p.id`,
        [id]
      );
      post.replies = repliesRows.map(rowToPost);
    }

    return post;
  },

  async createPost(data: CreatePostParams) {
    const d = await getDb();
    const slug = data.slug || deriveSlugSqlite(data.displayName);
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const now = new Date().toISOString();
    const originTypeVal = data.originType ?? null;
    d.run(
      `INSERT INTO posts (id, thread_id, display_name, slug, created_at, content, avatar_color, has_image, image_src, image_alt, has_collab_button, has_game, game_id, origin_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [id, id, data.displayName, slug, now, data.content, data.avatarColor || 'from-blue-500 to-indigo-600',
       data.hasImage ? 1 : 0, data.imageSrc || null, data.imageAlt || null,
       data.gameId ? 1 : 0, data.gameId || null, originTypeVal]
    );
    saveDb();
    return {
      ...rowToPost({
        id, thread_id: id, display_name: data.displayName, slug,
        created_at: now, content: data.content,
        likes: 0, dislikes: 0, liked: 0, disliked: 0,
        replies_count: 0, reposts: 0, reposted: 0,
        has_image: data.hasImage ? 1 : 0,
        image_src: data.imageSrc || null, image_alt: data.imageAlt || null,
        avatar_color: data.avatarColor || 'from-blue-500 to-indigo-600',
        has_collab_button: 1, hearts_total: 0, has_game: data.gameId ? 1 : 0,
        game_id: data.gameId || null, origin_type: originTypeVal,
      }),
      replies: []
    };
  },

  async likePost(id: number, userId: string) {
    const d = await getDb();
    const voteRows = rowsToObjects(d, 'SELECT vote_type FROM post_votes WHERE post_id = ? AND user_id = ?', [id, userId]);
    const existingVote = voteRows.length > 0 ? voteRows[0].vote_type : null;

    if (existingVote === 'like') {
      d.run('DELETE FROM post_votes WHERE post_id = ? AND user_id = ?', [id, userId]);
      d.run('UPDATE posts SET likes = MAX(likes - 1, 0) WHERE id = ?', [id]);
    } else if (existingVote === 'dislike') {
      d.run('UPDATE post_votes SET vote_type = ? WHERE post_id = ? AND user_id = ?', ['like', id, userId]);
      d.run('UPDATE posts SET likes = likes + 1, dislikes = MAX(dislikes - 1, 0) WHERE id = ?', [id]);
    } else {
      d.run('INSERT INTO post_votes (post_id, user_id, vote_type) VALUES (?, ?, ?)', [id, userId, 'like']);
      d.run('UPDATE posts SET likes = likes + 1 WHERE id = ?', [id]);
      const authorRows = rowsToObjects(d, 'SELECT display_name, content FROM posts WHERE id = ?', [id]);
      if (authorRows.length > 0) {
        insertNotificationSqlite(d, { recipientId: authorRows[0].display_name, actor: userId, type: 'like', action: 'がいいねしました', target: snippetSqlite(authorRows[0].content ?? ''), postId: id });
      }
    }
    saveDb();

    const rows = rowsToObjects(d, `${VOTED_SELECT} WHERE p.id = ?`, [userId, id]);
    if (rows.length === 0) return null;
    applyVoteRow(rows[0], userId);
    return rowToPost(rows[0]);
  },

  async dislikePost(id: number, userId: string) {
    const d = await getDb();
    const voteRows = rowsToObjects(d, 'SELECT vote_type FROM post_votes WHERE post_id = ? AND user_id = ?', [id, userId]);
    const existingVote = voteRows.length > 0 ? voteRows[0].vote_type : null;

    if (existingVote === 'dislike') {
      d.run('DELETE FROM post_votes WHERE post_id = ? AND user_id = ?', [id, userId]);
      d.run('UPDATE posts SET dislikes = MAX(dislikes - 1, 0) WHERE id = ?', [id]);
    } else if (existingVote === 'like') {
      d.run('UPDATE post_votes SET vote_type = ? WHERE post_id = ? AND user_id = ?', ['dislike', id, userId]);
      d.run('UPDATE posts SET dislikes = dislikes + 1, likes = MAX(likes - 1, 0) WHERE id = ?', [id]);
    } else {
      d.run('INSERT INTO post_votes (post_id, user_id, vote_type) VALUES (?, ?, ?)', [id, userId, 'dislike']);
      d.run('UPDATE posts SET dislikes = dislikes + 1 WHERE id = ?', [id]);
    }
    saveDb();

    const rows = rowsToObjects(d, `${VOTED_SELECT} WHERE p.id = ?`, [userId, id]);
    if (rows.length === 0) return null;
    applyVoteRow(rows[0], userId);
    return rowToPost(rows[0]);
  },

  async heartPost(id: number, userId: string, count: number = 1) {
    const d = await getDb();
    const postRows = rowsToObjects(d, 'SELECT id FROM posts WHERE id = ?', [id]);
    if (postRows.length === 0) return null;

    const n = Math.max(1, Math.floor(count) || 1);
    for (let i = 0; i < n; i++) {
      d.run('INSERT INTO post_hearts (post_id, user_id) VALUES (?, ?)', [id, userId]);
    }
    d.run('UPDATE posts SET hearts_total = COALESCE(hearts_total, 0) + ? WHERE id = ?', [n, id]);
    const heartAuthor = rowsToObjects(d, 'SELECT display_name, substr(content, 1, 20) AS snippet FROM posts WHERE id = ?', [id]);
    if (heartAuthor.length > 0) {
      insertNotificationSqlite(d, { recipientId: heartAuthor[0].display_name, actor: userId, type: 'heart', action: 'がハートを送りました', target: heartAuthor[0].snippet ?? '', postId: id });
    }
    saveDb();

    const rows = rowsToObjects(
      d,
      `SELECT p.*, 0 as liked, 0 as disliked FROM posts p WHERE p.id = ?`,
      [id]
    );
    if (rows.length === 0) return null;
    return rowToPost(rows[0]);
  },

  async repostPost(id: number) {
    const d = await getDb();
    d.run(
      `UPDATE posts SET reposted = CASE WHEN reposted THEN 0 ELSE 1 END, reposts = CASE WHEN reposted THEN reposts - 1 ELSE reposts + 1 END WHERE id = ?`,
      [id]
    );
    saveDb();
    const result = d.exec('SELECT * FROM posts WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    const cols = result[0].columns;
    const obj: any = {};
    cols.forEach((c, i) => { obj[c] = result[0].values[0][i]; });
    return rowToPost(obj);
  },

  async getReplies(postId: number, userId?: string) {
    const d = await getDb();
    const rows = rowsToObjects(
      d,
      'SELECT * FROM posts WHERE thread_id = ? AND id != thread_id ORDER BY id',
      [postId]
    );
    const hidden = getHiddenSlugsSqlite(d, userId);
    return rows.map(rowToPost).filter(r => !hidden.has(r.slug ?? ''));
  },

  async addReply(postId: number, data: ReplyParams) {
    const d = await getDb();
    const slug = deriveSlugSqlite(data.displayName);
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const now = new Date().toISOString();
    const parentPostId = data.parentPostId ?? postId;
    d.run(
      `INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, content, created_at, avatar_color, has_image, image_src, image_alt, has_game, game_id, origin_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, postId, parentPostId, data.displayName, slug, data.content, now, data.avatarColor || 'from-blue-500 to-indigo-600',
       data.hasImage ? 1 : 0, data.imageSrc || null, data.imageAlt || null, data.gameId ? 1 : 0, data.gameId || null, data.originType || null]
    );
    d.run('UPDATE posts SET replies_count = replies_count + 1 WHERE id = ?', [postId]);
    const parentRows = rowsToObjects(d, 'SELECT display_name FROM posts WHERE id = ?', [parentPostId]);
    const parentAuthor = parentRows[0]?.display_name;
    if (parentAuthor) {
      insertNotificationSqlite(d, { recipientId: parentAuthor, actor: data.displayName, type: 'reply', action: 'が返信しました', target: snippetSqlite(data.content), postId: id });
    }
    const mentions = data.content.match(/@([A-Za-z0-9]+)/g);
    if (mentions) {
      const seen = new Set<string>();
      for (const m of mentions) {
        const mslug = m.slice(1);
        if (seen.has(mslug)) continue;
        seen.add(mslug);
        const mrows = rowsToObjects(d, 'SELECT display_name FROM posts WHERE slug = ? LIMIT 1', [mslug]);
        const mname = mrows[0]?.display_name;
        if (mname && mname !== parentAuthor) {
          insertNotificationSqlite(d, { recipientId: mname, actor: data.displayName, type: 'mention', action: 'があなたにメンションしました', target: snippetSqlite(data.content), postId: id });
        }
      }
    }
    saveDb();
    return {
      ...rowToPost({
        id, thread_id: postId, parent_post_id: parentPostId, display_name: data.displayName, slug,
        created_at: now, content: data.content,
        likes: 0, dislikes: 0, liked: 0, disliked: 0,
        replies_count: 0, reposts: 0, reposted: 0,
        has_image: data.hasImage ? 1 : 0, image_src: data.imageSrc || null, image_alt: data.imageAlt || null,
        avatar_color: data.avatarColor || 'from-blue-500 to-indigo-600',
        has_collab_button: 0, hearts_total: 0, has_game: data.gameId ? 1 : 0,
        game_id: data.gameId || null, origin_type: data.originType || null,
      }),
      replies: [],
    };
  },

  async editPost(id: number, userId: string, content: string, originType?: OriginType | null, imageSrc?: string) {
    const d = await getDb();
    const rows = rowsToObjects(d, 'SELECT slug, display_name, content, origin_type FROM posts WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    const viewerSlug = resolveViewerSlugSqlite(d, userId);
    if (rows[0].display_name !== userId && rows[0].slug !== viewerSlug) return null;

    const hasContentChanged = rows[0].content !== content;
    const hasOriginTypeChanged = originType !== undefined && (rows[0].origin_type !== (originType ?? null));
    const shouldMarkEdited = hasContentChanged || hasOriginTypeChanged || imageSrc !== undefined;

    const sets: string[] = ['content = ?'];
    const values: (string | number)[] = [content];
    if (originType !== undefined) {
      sets.push('origin_type = ?');
      values.push(originType as string);
    }
    if (imageSrc !== undefined) {
      sets.push('image_src = ?');
      values.push(imageSrc);
    }
    if (shouldMarkEdited) sets.push('is_edited = 1');
    values.push(id);
    d.run(`UPDATE posts SET ${sets.join(', ')} WHERE id = ?`, values);
    saveDb();
    const updated = rowsToObjects(d, `${VOTED_SELECT} WHERE p.id = ?`, [userId, id]);
    if (updated.length === 0) return null;
    applyVoteRow(updated[0], userId);
    return rowToPost(updated[0]);
  },

  async deletePost(id: number, userId: string) {
    const d = await getDb();
    const rows = rowsToObjects(d, 'SELECT * FROM posts WHERE id = ?', [id]);
    if (rows.length === 0) return false;
    const post = rows[0];
    const viewerSlug = resolveViewerSlugSqlite(d, userId);
    if (post.display_name !== userId && post.slug !== viewerSlug) return false;

    const isReply = post.parent_post_id != null && post.thread_id !== post.id;
    const childRows = rowsToObjects(d, 'SELECT COUNT(*) AS cnt FROM posts WHERE thread_id = ? AND id != thread_id', [id]);
    const hasChildren = (childRows[0]?.cnt ?? 0) > 0;

    if (!isReply && hasChildren) {
      d.run(`UPDATE posts SET content = '(削除されました)', has_image = 0, image_src = NULL, has_game = 0, game_id = NULL WHERE id = ?`, [id]);
    } else {
      d.run('DELETE FROM posts WHERE id = ?', [id]);
      if (isReply) d.run('UPDATE posts SET replies_count = MAX(replies_count - 1, 0) WHERE id = ?', [post.thread_id]);
    }
    saveDb();
    return true;
  },

  async deleteMessage(id: number, userId: string) {
    const d = await getDb();
    const rows = rowsToObjects(d, 'SELECT sender FROM messages WHERE id = ?', [id]);
    if (rows.length === 0) return false;
    const sender = rows[0].sender;
    const viewerSlug = resolveViewerSlugSqlite(d, userId);
    if (sender !== userId && deriveSlugSqlite(sender) !== viewerSlug) return false;
    d.run('DELETE FROM messages WHERE id = ?', [id]);
    saveDb();
    return true;
  },

  async getLikedPosts(userId: string, limit?: number) {
    const d = await getDb();
    const safeLimit = Math.max(1, Math.min(limit || 20, 50));
    const rows = rowsToObjects(
      d,
      `${VOTED_SELECT} JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = ? AND pv.vote_type = 'like' ORDER BY p.id DESC LIMIT ${safeLimit}`,
      [userId]
    );
    rows.forEach(r => applyVoteRow(r, userId));
    return rows.map(rowToPost);
  },

  async getDislikedPosts(userId: string, limit?: number) {
    const d = await getDb();
    const safeLimit = Math.max(1, Math.min(limit || 20, 50));
    const rows = rowsToObjects(
      d,
      `${VOTED_SELECT} JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = ? AND pv.vote_type = 'dislike' ORDER BY p.id DESC LIMIT ${safeLimit}`,
      [userId]
    );
    rows.forEach(r => applyVoteRow(r, userId));
    return rows.map(rowToPost);
  },

  async getHeartedPosts(userId: string, limit?: number) {
    const d = await getDb();
    const safeLimit = Math.max(1, Math.min(limit || 20, 50));
    const rows = rowsToObjects(
      d,
      `SELECT p.*,
         COALESCE(au.display_name, p.display_name) as display_name,
         au.avatar_url as avatar_url,
         0 as liked, 0 as disliked
       FROM posts p
       LEFT JOIN anonymous_users au ON p.slug = au.slug
       -- 1ハート1行なので投稿単位に畳んでからJOINする（重複＆LIMIT食い潰し防止）
       JOIN (SELECT DISTINCT post_id FROM post_hearts WHERE user_id = ?) ph ON ph.post_id = p.id
       ORDER BY p.id DESC LIMIT ${safeLimit}`,
      [userId]
    );
    return rows.map(rowToPost);
  },

  async getUserPostsBySlug(slug: string, userId?: string, limit?: number) {
    const d = await getDb();
    const safeLimit = Math.max(1, Math.min(limit || 20, 50));
    let rows;
    if (userId) {
      rows = rowsToObjects(
        d,
        `${VOTED_SELECT} WHERE p.slug = ? ORDER BY p.id DESC LIMIT ${safeLimit}`,
        [userId, slug]
      );
    } else {
      rows = rowsToObjects(
        d,
        `${UNVOTED_SELECT} WHERE p.slug = ? ORDER BY p.id DESC LIMIT ${safeLimit}`,
        [slug]
      );
    }
    rows.forEach(r => applyVoteRow(r, userId));
    return rows.map(rowToPost);
  },

  async getUserDisplayName(slug: string) {
    const d = await getDb();
    const userRows = rowsToObjects(d, 'SELECT display_name FROM anonymous_users WHERE slug = ? LIMIT 1', [slug]);
    if (userRows.length > 0) return userRows[0].display_name;
    const rows = rowsToObjects(d, 'SELECT display_name FROM posts WHERE slug = ? LIMIT 1', [slug]);
    return rows.length > 0 ? rows[0].display_name : undefined;
  },

  async getUserAvatarUrl(slug: string) {
    const d = await getDb();
    const rows = rowsToObjects(d, 'SELECT avatar_url FROM anonymous_users WHERE slug = ? LIMIT 1', [slug]);
    return rows.length > 0 ? rows[0].avatar_url || undefined : undefined;
  },

  async getUserBio(slug: string) {
    const d = await getDb();
    const rows = rowsToObjects(d, 'SELECT bio FROM anonymous_users WHERE slug = ? LIMIT 1', [slug]);
    return rows.length > 0 ? rows[0].bio || undefined : undefined;
  },

  async listOshiItems(userSlug: string) {
    const d = await getDb();
    const rows = rowsToObjects(d, 'SELECT * FROM oshi_items WHERE user_slug = ? ORDER BY position ASC, id ASC', [userSlug]);
    return rows.map(rowToOshiItemSqlite);
  },

  async addOshiItem(userSlug: string, data) {
    const d = await getDb();
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const posRows = rowsToObjects(d, 'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM oshi_items WHERE user_slug = ?', [userSlug]);
    const position = posRows[0].next_pos;
    const now = new Date().toISOString();
    d.run(
      `INSERT INTO oshi_items (id, user_slug, kind, track_id, collection_id, artist_id, title, subtitle, artwork_url, view_url, preview_url, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userSlug, data.kind, data.trackId ?? null, data.collectionId ?? null, data.artistId ?? null, data.title, data.subtitle ?? null, data.artworkUrl ?? null, data.viewUrl ?? null, data.previewUrl ?? null, position, now]
    );
    saveDb();
    const rows = rowsToObjects(d, 'SELECT * FROM oshi_items WHERE id = ?', [id]);
    return rowToOshiItemSqlite(rows[0]);
  },

  async removeOshiItem(userSlug: string, id: number) {
    const d = await getDb();
    d.run('DELETE FROM oshi_items WHERE id = ? AND user_slug = ?', [id, userSlug]);
    saveDb();
  },

  async getNotifications(userId?: string) {
    const d = await getDb();
    let rows;
    if (userId) {
      rows = rowsToObjects(
        d,
        `SELECT n.*, COALESCE(au.display_name, n.user_name) as resolved_name
         FROM notifications n
         LEFT JOIN anonymous_users au ON n.user_name = au.id OR n.user_name = au.slug OR n.user_name = au.display_name
         WHERE n.target_user = ? OR n.target_user = (SELECT slug FROM anonymous_users WHERE id = ? LIMIT 1)
         ORDER BY n.id DESC LIMIT 20`,
        [userId, userId]
      );
    } else {
      rows = rowsToObjects(
        d,
        `SELECT n.*, COALESCE(au.display_name, n.user_name) as resolved_name
         FROM notifications n
         LEFT JOIN anonymous_users au ON n.user_name = au.id OR n.user_name = au.slug OR n.user_name = au.display_name
         ORDER BY n.id DESC LIMIT 20`
      );
    }
    return rows.map(r => ({
      id: r.id, user: r.resolved_name || r.user_name, action: r.action, target: r.target,
      type: r.type || 'like', postId: r.post_id ?? undefined, targetUser: r.target_user ?? undefined,
      recipientId: r.target_user ?? undefined, read: !!r.read,
      createdAt: r.created_at, time: formatRelativeTime(r.created_at),
    } as Notification));
  },

  async markNotificationRead(id: number, userId: string) {
    const d = await getDb();
    d.run('UPDATE notifications SET read = 1 WHERE id = ? AND target_user = ?', [id, userId]);
    saveDb();
  },

  async markAllNotificationsRead(userId: string) {
    const d = await getDb();
    d.run('UPDATE notifications SET read = 1 WHERE target_user = ? AND read = 0', [userId]);
    saveDb();
  },

  async deleteNotification(id: number, userId: string) {
    const d = await getDb();
    d.run('DELETE FROM notifications WHERE id = ? AND target_user = ?', [id, userId]);
    saveDb();
  },

  async getUnreadCount(userId: string) {
    const d = await getDb();
    const rows = rowsToObjects(d, 'SELECT COUNT(*) AS cnt FROM notifications WHERE target_user = ? AND read = 0', [userId]);
    return rows[0]?.cnt ?? 0;
  },

  async getMessages(userId?: string) {
    const d = await getDb();
    let rows;
    if (userId) {
      rows = rowsToObjects(
        d,
        `SELECT m.*, 
                COALESCE(s.display_name, m.sender) as sender_name,
                COALESCE(r.display_name, m.recipient) as recipient_name
         FROM messages m
         LEFT JOIN anonymous_users s ON m.sender = s.id OR m.sender = s.slug OR m.sender = s.display_name
         LEFT JOIN anonymous_users r ON m.recipient = r.id OR m.recipient = r.slug OR m.recipient = r.display_name
         WHERE m.sender = ? OR m.recipient = ? OR s.id = ? OR r.id = ? OR s.slug = ? OR r.slug = ?
         ORDER BY m.id DESC LIMIT 50`,
        [userId, userId, userId, userId, userId, userId]
      );
    } else {
      rows = rowsToObjects(
        d,
        `SELECT m.*, 
                COALESCE(s.display_name, m.sender) as sender_name,
                COALESCE(r.display_name, m.recipient) as recipient_name
         FROM messages m
         LEFT JOIN anonymous_users s ON m.sender = s.id OR m.sender = s.slug OR m.sender = s.display_name
         LEFT JOIN anonymous_users r ON m.recipient = r.id OR m.recipient = r.slug OR m.recipient = r.display_name
         WHERE m.recipient IS NOT NULL
         ORDER BY m.id DESC LIMIT 50`
      );
    }
    return rows.map(r => ({ id: r.id, sender: r.sender_name || r.sender, text: r.text, recipient: r.recipient_name || r.recipient || undefined, createdAt: r.created_at, time: formatRelativeTime(r.created_at) } as Message));
  },

  async addMessage(data: MessageParams) {
    const d = await getDb();
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const now = new Date().toISOString();
    d.run(
      `INSERT INTO messages (id, sender, text, recipient, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, data.sender, data.text, data.recipient || null, now]
    );
    saveDb();
    return { id, sender: data.sender, text: data.text, recipient: data.recipient, createdAt: now, time: formatRelativeTime(now) } as Message;
  },

  async getTrends() {
    const d = await getDb();
    const rows = rowsToObjects(d, 'SELECT content FROM posts');
    const freq = new Map<string, number>();
    for (const row of rows) {
      if (!row.content) continue;
      const cleaned = cleanContentForTrends(row.content);
      const tags = cleaned.match(/#[^\s#]+/g);
      if (tags) {
        for (const tag of tags) {
          if (isValidTrendKeyword(tag)) {
            freq.set(tag, (freq.get(tag) || 0) + 1);
          }
        }
      }
    }
    return Array.from(freq.entries())
      .map(([keyword, count]) => ({ keyword, count } as Trend))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  },

  async searchPosts(query: string, userId?: string, limit?: number) {
    if (!query.trim()) return [];
    const d = await getDb();
    const safeLimit = Math.max(1, Math.min(limit || 20, 50));
    const rows = rowsToObjects(
      d,
      `${UNVOTED_SELECT}
      WHERE p.thread_id = p.id
        AND (p.content LIKE ? OR p.display_name LIKE ? OR (au.display_name IS NOT NULL AND au.display_name LIKE ?))
        AND COALESCE((SELECT au2.hide_from_search FROM anonymous_users au2 WHERE au2.slug = p.slug LIMIT 1), 0) = 0
      ORDER BY p.id DESC LIMIT ${safeLimit}`,
      [`%${query}%`, `%${query}%`, `%${query}%`]
    );
    const hidden = getHiddenSlugsSqlite(d, userId);
    return rows.map(rowToPost).filter(p => !hidden.has(p.slug ?? ''));
  },

  async getPostsByHashtag(tag: string, userId?: string, limit?: number) {
    const normalized = tag.startsWith('#') ? tag : `#${tag}`;
    const d = await getDb();
    const safeLimit = Math.max(1, Math.min(limit || 20, 50));
    const rows = rowsToObjects(
      d,
      `${UNVOTED_SELECT}
      WHERE p.thread_id = p.id
        AND p.content LIKE ?
        AND COALESCE((SELECT au2.hide_from_search FROM anonymous_users au2 WHERE au2.slug = p.slug LIMIT 1), 0) = 0
      ORDER BY p.id DESC LIMIT ${safeLimit}`,
      [`%${normalized}%`]
    );
    const hidden = getHiddenSlugsSqlite(d, userId);
    return rows
      .map(rowToPost)
      .filter(p => {
        const tags: string[] = p.content.match(/#[^\s#]+/g) ?? [];
        return tags.includes(normalized);
      })
      .filter(p => !hidden.has(p.slug ?? ''));
  },

  async getOrCreateAnonymousUser(sessionId: string, ipAddress: string) {
    const d = await getDb();

    const sessionRows = rowsToObjects(
      d,
      'SELECT * FROM anonymous_users WHERE session_id = ?',
      [sessionId]
    );
    if (sessionRows.length > 0) {
      const row = sessionRows[0];
      d.run('UPDATE anonymous_users SET last_seen_at = ? WHERE id = ?', [new Date().toISOString(), row.id]);
      saveDb();
      return {
        id: row.id,
        displayName: row.display_name,
        slug: row.slug,
        avatarColor: row.avatar_color,
        avatarUrl: row.avatar_url ?? undefined,
        bio: row.bio ?? undefined,
        createdAt: row.created_at,
      } as AnonymousUser;
    }

    // 注意: 以前は ip_address が一致する既存ユーザーに割り当てる同一IPフォールバックがあったが、
    // Netlify環境ではロードバランサーのアドレスしか取得できず（context.ip 含む）、
    // 全訪問者が同一IPとして扱われ他人のアカウントに merge される実害があったため削除。
    // ip_address 自体は分析/レート制限用に引き続き保存するが、本人確認には使わない。

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const displayName = generateDisplayNameSqlite();
    const slug = deriveSlugSqlite(displayName);
    const avatarColor = randomGradientSqlite();
    const now = new Date().toISOString();

    d.run(
      `INSERT INTO anonymous_users (id, ip_address, session_id, display_name, slug, avatar_color, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, ipAddress, sessionId, displayName, slug, avatarColor, now, now]
    );
    saveDb();

    return { id, displayName, slug, avatarColor, avatarUrl: undefined, createdAt: now } as AnonymousUser;
  },

  async updateUserDisplayName(userId: string, displayName: string, avatarUrl?: string, bio?: string) {
    const d = await getDb();
    let userRows = rowsToObjects(d, 'SELECT id, slug FROM anonymous_users WHERE id = ?', [userId]);
    if (userRows.length === 0) {
      userRows = rowsToObjects(d, 'SELECT id, slug FROM anonymous_users WHERE slug = ?', [userId]);
    }
    if (userRows.length === 0) {
      userRows = rowsToObjects(d, 'SELECT id, slug FROM anonymous_users WHERE display_name = ?', [userId]);
    }
    if (userRows.length === 0) {
      return;
    }
    const realId = userRows[0].id;
    const oldSlug = userRows[0].slug;

    const slug = deriveSlugSqlite(displayName);
    const sets: string[] = ['display_name = ?', 'slug = ?'];
    const values: (string | number)[] = [displayName, slug];
    if (avatarUrl !== undefined) {
      sets.push('avatar_url = ?');
      values.push(avatarUrl);
    }
    if (bio !== undefined) {
      sets.push('bio = ?');
      values.push(bio);
    }
    values.push(realId);
    d.run(`UPDATE anonymous_users SET ${sets.join(', ')} WHERE id = ?`, values);

    if (oldSlug) {
      d.run(
        'UPDATE posts SET display_name = ?, slug = ? WHERE slug = ?',
        [displayName, slug, oldSlug]
      );
    }
    saveDb();
  },

  async getUserSettings(slug: string) {
    const d = await getDb();
    const rows = rowsToObjects(d, 'SELECT is_private, hide_from_search, hide_reactions FROM anonymous_users WHERE slug = ? LIMIT 1', [slug]);
    const row = rows[0];
    return {
      isPrivate: !!row?.is_private,
      hideFromSearch: !!row?.hide_from_search,
      hideReactions: !!row?.hide_reactions,
    };
  },

  async updateUserSettings(slug: string, settings: Partial<{ isPrivate: boolean; hideFromSearch: boolean; hideReactions: boolean }>) {
    const d = await getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    if (settings.isPrivate !== undefined) { sets.push('is_private = ?'); vals.push(settings.isPrivate ? 1 : 0); }
    if (settings.hideFromSearch !== undefined) { sets.push('hide_from_search = ?'); vals.push(settings.hideFromSearch ? 1 : 0); }
    if (settings.hideReactions !== undefined) { sets.push('hide_reactions = ?'); vals.push(settings.hideReactions ? 1 : 0); }
    if (sets.length === 0) return;
    vals.push(slug);
    d.run(`UPDATE anonymous_users SET ${sets.join(', ')} WHERE slug = ?`, vals);
    saveDb();
  },

  async issueMigrationToken(userId: string) {
    const d = await getDb();
    const token = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    d.run('INSERT INTO migration_tokens (token, user_id) VALUES (?, ?)', [token, userId]);
    saveDb();
    return token;
  },

  async redeemMigrationToken(token: string, newSessionId: string) {
    const d = await getDb();
    const tr = rowsToObjects(d, 'SELECT user_id FROM migration_tokens WHERE token = ?', [token]);
    if (tr.length === 0) return null;
    const userId = tr[0].user_id;
    const ur = rowsToObjects(d, 'SELECT * FROM anonymous_users WHERE id = ?', [userId]);
    if (ur.length === 0) return null;
    d.run('UPDATE anonymous_users SET session_id = ?, last_seen_at = ? WHERE id = ?', [newSessionId, new Date().toISOString(), userId]);
    d.run('DELETE FROM migration_tokens WHERE token = ?', [token]);
    saveDb();
    const row = ur[0];
    return { id: row.id, displayName: row.display_name, slug: row.slug, avatarColor: row.avatar_color, createdAt: row.created_at } as AnonymousUser;
  },

  async followUser(followerId: string, followedId: string) {
    const d = await getDb();
    const followerSlug = resolveViewerSlugSqlite(d, followerId);
    const followedSlug = resolveViewerSlugSqlite(d, followedId);
    // 同一ユーザーを id / display_name / slug の別表記で指した自己フォローを防ぐ。
    if (followerSlug === followedSlug) return;
    const before = rowsToObjects(d, 'SELECT 1 FROM user_follows WHERE (follower_id = ? OR follower_id = ?) AND (followed_id = ? OR followed_id = ?) LIMIT 1', [followerSlug, followerId, followedSlug, followedId]);
    d.run(
      'INSERT OR IGNORE INTO user_follows (follower_id, followed_id) VALUES (?, ?)',
      [followerSlug, followedSlug]
    );
    if (before.length === 0) {
      insertNotificationSqlite(d, { recipientId: followedSlug, actor: followerSlug, type: 'follow', action: 'がフォローしました', target: '' });
    }
    saveDb();
  },

  async unfollowUser(followerId: string, followedId: string) {
    const d = await getDb();
    const followerSlug = resolveViewerSlugSqlite(d, followerId);
    const followedSlug = resolveViewerSlugSqlite(d, followedId);
    d.run(
      'DELETE FROM user_follows WHERE (follower_id = ? OR follower_id = ?) AND (followed_id = ? OR followed_id = ?)',
      [followerSlug, followerId, followedSlug, followedId]
    );
    saveDb();
  },

  async isFollowing(followerId: string, followedId: string) {
    const d = await getDb();
    const followerSlug = resolveViewerSlugSqlite(d, followerId);
    const followedSlug = resolveViewerSlugSqlite(d, followedId);
    const rows = rowsToObjects(
      d,
      'SELECT 1 FROM user_follows WHERE (follower_id = ? OR follower_id = ?) AND (followed_id = ? OR followed_id = ?) LIMIT 1',
      [followerSlug, followerId, followedSlug, followedId]
    );
    return rows.length > 0;
  },

  async getFollowCounts(userId: string) {
    const d = await getDb();
    const slug = resolveViewerSlugSqlite(d, userId);
    const followers = rowsToObjects(d, 'SELECT COUNT(*) AS cnt FROM user_follows WHERE followed_id = ? OR followed_id = ?', [slug, userId]);
    const following = rowsToObjects(d, 'SELECT COUNT(*) AS cnt FROM user_follows WHERE follower_id = ? OR follower_id = ?', [slug, userId]);
    return {
      followers: followers[0]?.cnt ?? 0,
      following: following[0]?.cnt ?? 0,
    };
  },

  async blockUser(blockerSlug: string, blockedSlug: string) {
    if (blockerSlug === blockedSlug) return;
    const d = await getDb();
    d.run('INSERT OR IGNORE INTO user_blocks (blocker_slug, blocked_slug) VALUES (?, ?)', [blockerSlug, blockedSlug]);
    saveDb();
  },

  async unblockUser(blockerSlug: string, blockedSlug: string) {
    const d = await getDb();
    d.run('DELETE FROM user_blocks WHERE blocker_slug = ? AND blocked_slug = ?', [blockerSlug, blockedSlug]);
    saveDb();
  },

  async getBlockedSlugs(blockerSlug: string) {
    const d = await getDb();
    return rowsToObjects(d, 'SELECT blocked_slug FROM user_blocks WHERE blocker_slug = ?', [blockerSlug]).map((r: any) => r.blocked_slug);
  },

  async muteUser(muterSlug: string, mutedSlug: string) {
    if (muterSlug === mutedSlug) return;
    const d = await getDb();
    d.run('INSERT OR IGNORE INTO user_mutes (muter_slug, muted_slug) VALUES (?, ?)', [muterSlug, mutedSlug]);
    saveDb();
  },

  async unmuteUser(muterSlug: string, mutedSlug: string) {
    const d = await getDb();
    d.run('DELETE FROM user_mutes WHERE muter_slug = ? AND muted_slug = ?', [muterSlug, mutedSlug]);
    saveDb();
  },

  async getMutedSlugs(muterSlug: string) {
    const d = await getDb();
    return rowsToObjects(d, 'SELECT muted_slug FROM user_mutes WHERE muter_slug = ?', [muterSlug]).map((r: any) => r.muted_slug);
  },

  async reportContent(data: ReportParams) {
    const d = await getDb();
    d.run('INSERT INTO reports (reporter_slug, target_type, target_id, reason) VALUES (?, ?, ?, ?)', [data.reporterSlug, data.targetType, data.targetId, data.reason]);
    saveDb();
  },

  async createGame(data) {
    const d = await getDb();
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const now = new Date().toISOString();
    d.run(
      `INSERT INTO games (id, preset, title, manifest, created_at, creator_slug) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, data.preset, data.title, JSON.stringify(data.manifest), now, data.creatorSlug || null]
    );
    saveDb();
    return { id, preset: data.preset, title: data.title, manifest: data.manifest, createdAt: now, creatorSlug: data.creatorSlug };
  },

  async getGame(id) {
    const d = await getDb();
    const rows = rowsToObjects(d, 'SELECT * FROM games WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, preset: r.preset, title: r.title, manifest: JSON.parse(r.manifest), createdAt: r.created_at, creatorSlug: r.creator_slug ?? undefined, ...gameStatsFromRow(r) };
  },

  async recordGamePlay(id, data) {
    const d = await getDb();
    const score = Number(data.score) || 0;
    d.run(
      `UPDATE games
          SET plays = COALESCE(plays, 0) + ?,
              clears = COALESCE(clears, 0) + ?,
              best_score = CASE WHEN ? > COALESCE(best_score, 0) THEN ? ELSE COALESCE(best_score, 0) END,
              best_score_by = CASE WHEN ? > COALESCE(best_score, 0) THEN ? ELSE best_score_by END
        WHERE id = ?`,
      [data.countPlay === false ? 0 : 1, data.cleared ? 1 : 0, score, score, score, data.displayName || '名無し', id]
    );
    saveDb();
    return this.getGame(id);
  },

  async listTopGames(limit?: number) {
    const d = await getDb();
    const safeLimit = Math.max(1, Math.min(limit || 30, 50));
    const rows = rowsToObjects(d, `
      SELECT g.id, g.preset, g.title, g.created_at, g.creator_slug, g.plays, g.clears, g.best_score, g.best_score_by,
             (SELECT p.id FROM posts p WHERE p.game_id = g.id ORDER BY p.id ASC LIMIT 1) AS post_id
        FROM games g
       ORDER BY COALESCE(g.plays, 0) DESC, g.id DESC
       LIMIT ${safeLimit}`, []);
    return rows.map(r => ({
      id: r.id, preset: r.preset, title: r.title, manifest: {} as any, createdAt: r.created_at,
      creatorSlug: r.creator_slug ?? undefined,
      postId: r.post_id ?? undefined,
      ...gameStatsFromRow(r),
    }));
  },

  async getPostIdByGameId(gameId: number) {
    const d = await getDb();
    const rows = rowsToObjects(d, 'SELECT id FROM posts WHERE game_id = ? ORDER BY id ASC LIMIT 1', [gameId]);
    return rows.length > 0 ? Number(rows[0].id) : null;
  },

  async getGamesByIds(ids) {
    if (!ids || ids.length === 0) return [];
    const d = await getDb();
    const placeholders = ids.map(() => '?').join(',');
    const rows = rowsToObjects(d, `SELECT id, preset, title, manifest, created_at, creator_slug, plays, clears, best_score, best_score_by FROM games WHERE id IN (${placeholders})`, ids);
    return rows.map(r => {
      let manifest: any = {};
      if (typeof r.manifest === 'string') {
        const match = r.manifest.match(/"bgRef"\s*:\s*"(https?:\/\/[^"]+)"/);
        manifest = match ? { titleScreen: { bgRef: match[1] } } : {};
      } else if (r.manifest && typeof r.manifest === 'object') {
        manifest = r.manifest;
      }
      return { id: r.id, preset: r.preset, title: r.title, manifest, createdAt: r.created_at, creatorSlug: r.creator_slug ?? undefined, ...gameStatsFromRow(r) };
    });
  },

  async updateGame(id, data) {
    const d = await getDb();
    d.run('UPDATE games SET title = ?, manifest = ? WHERE id = ?', [data.title, JSON.stringify(data.manifest), id]);
    saveDb();
    return this.getGame(id);
  },

  async listAllGames(limit?: number) {
    const d = await getDb();
    const safeLimit = Math.max(1, Math.min(limit || 30, 50));
    const rows = rowsToObjects(d, `SELECT * FROM games ORDER BY id DESC LIMIT ${safeLimit}`, []);
    return rows.map(r => ({ id: r.id, preset: r.preset, title: r.title, manifest: JSON.parse(r.manifest), createdAt: r.created_at, ...gameStatsFromRow(r) }));
  },

  async getLiveGameInfo(ipAddress: string) {
    const d = await getDb();
    const slot = new Date().toISOString().slice(0, 13);
    const schedRows = rowsToObjects(d, 'SELECT game_id FROM game_schedule WHERE hour_slot = ?', [slot]);
    let gameId: number | null = null;
    if (schedRows.length > 0) {
      gameId = schedRows[0].game_id;
    } else {
      const lastSlot = new Date(Date.now() - 3600000).toISOString().slice(0, 13);
      const voteRows = rowsToObjects(d, 'SELECT game_id, COUNT(*) as cnt FROM game_votes WHERE hour_slot = ? GROUP BY game_id ORDER BY cnt DESC LIMIT 1', [lastSlot]);
      if (voteRows.length > 0) {
        gameId = voteRows[0].game_id;
      } else {
        const allGames = rowsToObjects(d, 'SELECT id FROM games ORDER BY RANDOM() LIMIT 1', []);
        if (allGames.length > 0) gameId = allGames[0].id;
      }
      if (gameId) {
        d.run('INSERT OR IGNORE INTO game_schedule (hour_slot, game_id) VALUES (?, ?)', [slot, gameId]);
        saveDb();
      }
    }
    let gameTitle = '', gamePreset = '';
    if (gameId) {
      const gr = rowsToObjects(d, 'SELECT preset, title FROM games WHERE id = ?', [gameId]);
      if (gr.length > 0) { gameTitle = gr[0].title; gamePreset = gr[0].preset; }
    }
    const allGames = rowsToObjects(d, 'SELECT id, preset, title, created_at FROM games ORDER BY id DESC LIMIT 30', []);
    const vcRows = rowsToObjects(d, 'SELECT game_id, COUNT(*) as cnt FROM game_votes WHERE hour_slot = ? GROUP BY game_id', [slot]);
    const voteCounts = new Map(vcRows.map((r: any) => [r.game_id, Number(r.cnt)]));
    const myVoteRows = rowsToObjects(d, 'SELECT game_id FROM game_votes WHERE ip_address = ? AND hour_slot = ?', [ipAddress, slot]);
    const myVote = myVoteRows.length > 0 ? myVoteRows[0].game_id : null;
    const nextCandidates = allGames.map((g: any) => ({
      game: { id: g.id, preset: g.preset, title: g.title, createdAt: g.created_at },
      votes: voteCounts.get(g.id) ?? 0,
    })).sort((a: any, b: any) => b.votes - a.votes);
    let postId: number | null = null;
    if (gameId) {
      const pr = rowsToObjects(d, 'SELECT id FROM posts WHERE game_id = ? ORDER BY id ASC LIMIT 1', [gameId]);
      if (pr.length > 0) postId = pr[0].id;
    }
    return { gameId: gameId as number | null, gameTitle, gamePreset, hourSlot: slot, postId, nextCandidates, myVote };
  },

  async voteGame(gameId: number, ipAddress: string) {
    const d = await getDb();
    const slot = new Date().toISOString().slice(0, 13);
    d.run('INSERT OR REPLACE INTO game_votes (game_id, ip_address, hour_slot) VALUES (?, ?, ?)', [gameId, ipAddress, slot]);
    saveDb();
  },

  async updatePlayerPosition(sessionId: string, gameId: number, x: number, y: number, emoji: string) {
    const d = await getDb();
    const now = new Date().toISOString();
    d.run('INSERT OR REPLACE INTO game_players (session_id, game_id, x, y, emoji, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [sessionId, gameId, x, y, emoji, now]);
    d.run("DELETE FROM game_players WHERE datetime(updated_at) < datetime('now', '-15 seconds')");
    saveDb();
  },

  async getGamePlayers(gameId: number, excludeSession: string) {
    const d = await getDb();
    const rows = rowsToObjects(d, "SELECT * FROM game_players WHERE game_id = ? AND session_id != ? AND datetime(updated_at) > datetime('now', '-10 seconds')", [gameId, excludeSession]);
    return rows.map((r: any) => ({ sessionId: r.session_id, x: r.x, y: r.y, emoji: r.emoji, updatedAt: r.updated_at }));
  },
};
