import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { Post, AnonymousUser } from '../types';
import type { Notification, Message, Trend } from '../mock-db';
import type { DataStore, CreatePostParams, ReplyParams, MessageParams, ReportParams } from './interface';
import { formatRelativeTime } from '../time';

let db: SqlJsDatabase | null = null;

async function getDb(): Promise<SqlJsDatabase> {
  if (db) return db;

  const SQL = await initSqlJs();
  const dbPath = process.env.D1_DATABASE_PATH || './data/d1.sqlite';

  try {
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await runInitSql(db);
    }
  } catch {
    db = new SQL.Database();
    await runInitSql(db);
  }

  ensureAnonymousUsersTable(db);
  ensureTableMigrations(db);
  return db;
}

async function runInitSql(database: SqlJsDatabase) {
  const initPath = './docker/init.sqlite.sql';
  if (fs.existsSync(initPath)) {
    const sql = fs.readFileSync(initPath, 'utf-8');
    database.run(sql);
    saveDb();
  }
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
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
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
  const dbPath = process.env.D1_DATABASE_PATH || './data/d1.sqlite';
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(dbPath, buffer);
  }
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
    hasCollabButton: !!row.has_collab_button,
    heartsTotal: row.hearts_total ?? 0,
    hasGame: !!row.has_game,
    gameId: row.game_id ?? undefined,
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
  let suffix = '';
  for (let i = 0; i < 3; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  return `名無し${suffix}`;
}

function randomGradientSqlite(): string {
  return AVATAR_GRADIENTS_SQLITE[Math.floor(Math.random() * AVATAR_GRADIENTS_SQLITE.length)];
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

const VOTED_SELECT = `
  SELECT p.*,
    COALESCE((SELECT vote_type FROM post_votes pv WHERE pv.post_id = p.id AND pv.user_id = ?), '') as vote_type,
    (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
  FROM posts p
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
    `SELECT * FROM posts WHERE thread_id IN (${placeholders}) AND id != thread_id ORDER BY id`,
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
  async getPosts(userId?: string) {
    const d = await getDb();
    let rows;
    if (userId) {
      rows = rowsToObjects(
        d,
        `${VOTED_SELECT} WHERE p.thread_id = p.id ORDER BY p.id DESC`,
        [userId]
      );
    } else {
      rows = rowsToObjects(
        d,
        `SELECT p.*, 0 as liked, 0 as disliked, (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total FROM posts p WHERE p.thread_id = p.id ORDER BY p.id DESC`
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
        `SELECT p.*, 0 as liked, 0 as disliked, (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total FROM posts p WHERE p.id = ?`,
        [id]
      );
    }
    if (rows.length === 0) return null;
    applyVoteRow(rows[0], userId);
    const post = rowToPost(rows[0]);

    if (post.threadId === post.id) {
      const repliesRows = rowsToObjects(
        d,
        'SELECT * FROM posts WHERE thread_id = ? AND id != thread_id ORDER BY id',
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
    d.run(
      `INSERT INTO posts (id, thread_id, display_name, slug, created_at, content, avatar_color, has_image, image_src, image_alt, has_collab_button, has_game, game_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, id, data.displayName, slug, now, data.content, data.avatarColor || 'from-blue-500 to-indigo-600',
       data.hasImage ? 1 : 0, data.imageSrc || null, data.imageAlt || null,
       data.gameId ? 1 : 0, data.gameId || null]
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
        game_id: data.gameId || null,
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

    for (let i = 0; i < count; i++) {
      d.run('INSERT INTO post_hearts (post_id, user_id) VALUES (?, ?)', [id, userId]);
    }
    const heartAuthor = rowsToObjects(d, 'SELECT display_name, content FROM posts WHERE id = ?', [id]);
    if (heartAuthor.length > 0) {
      insertNotificationSqlite(d, { recipientId: heartAuthor[0].display_name, actor: userId, type: 'heart', action: 'がハートを送りました', target: snippetSqlite(heartAuthor[0].content ?? ''), postId: id });
    }
    saveDb();

    const rows = rowsToObjects(
      d,
      `SELECT p.*, 0 as liked, 0 as disliked, (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total FROM posts p WHERE p.id = ?`,
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
      `INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, content, created_at, avatar_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'from-blue-500 to-indigo-600')`,
      [id, postId, parentPostId, data.displayName, slug, data.content, now]
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
        id, thread_id: postId, display_name: data.displayName, slug,
        created_at: now, content: data.content,
        likes: 0, dislikes: 0, liked: 0, disliked: 0,
        replies_count: 0, reposts: 0, reposted: 0,
        has_image: 0, image_src: null, image_alt: null,
        avatar_color: 'from-blue-500 to-indigo-600',
        has_collab_button: 0, hearts_total: 0, has_game: 0,
      }),
      replies: [],
    };
  },

  async editPost(id: number, userId: string, content: string) {
    const d = await getDb();
    const rows = rowsToObjects(d, 'SELECT slug, display_name FROM posts WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    const viewerSlug = resolveViewerSlugSqlite(d, userId);
    if (rows[0].display_name !== userId && rows[0].slug !== viewerSlug) return null;
    d.run('UPDATE posts SET content = ? WHERE id = ?', [content, id]);
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

  async getLikedPosts(userId: string) {
    const d = await getDb();
    const rows = rowsToObjects(
      d,
      `${VOTED_SELECT} JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = ? AND pv.vote_type = 'like' ORDER BY p.id DESC`,
      [userId]
    );
    rows.forEach(r => applyVoteRow(r, userId));
    return rows.map(rowToPost);
  },

  async getDislikedPosts(userId: string) {
    const d = await getDb();
    const rows = rowsToObjects(
      d,
      `${VOTED_SELECT} JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = ? AND pv.vote_type = 'dislike' ORDER BY p.id DESC`,
      [userId]
    );
    rows.forEach(r => applyVoteRow(r, userId));
    return rows.map(rowToPost);
  },

  async getHeartedPosts(userId: string) {
    const d = await getDb();
    const rows = rowsToObjects(
      d,
      `SELECT p.*, 0 as liked, 0 as disliked, (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total FROM posts p JOIN post_hearts ph ON ph.post_id = p.id AND ph.user_id = ? ORDER BY p.id DESC`,
      [userId]
    );
    return rows.map(rowToPost);
  },

  async getUserPostsBySlug(slug: string, userId?: string) {
    const d = await getDb();
    let rows;
    if (userId) {
      rows = rowsToObjects(
        d,
        `${VOTED_SELECT} WHERE p.slug = ? AND p.thread_id = p.id ORDER BY p.id DESC`,
        [userId, slug]
      );
    } else {
      rows = rowsToObjects(
        d,
        `SELECT p.*, 0 as liked, 0 as disliked, (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total FROM posts p WHERE p.slug = ? AND p.thread_id = p.id ORDER BY p.id DESC`,
        [slug]
      );
    }
    rows.forEach(r => applyVoteRow(r, userId));
    return rows.map(rowToPost);
  },

  async getUserDisplayName(slug: string) {
    const d = await getDb();
    const rows = rowsToObjects(d, 'SELECT display_name FROM posts WHERE slug = ? LIMIT 1', [slug]);
    return rows.length > 0 ? rows[0].display_name : undefined;
  },

  async getNotifications(userId?: string) {
    const d = await getDb();
    let rows;
    if (userId) {
      rows = rowsToObjects(d, 'SELECT * FROM notifications WHERE target_user = ? ORDER BY id', [userId]);
    } else {
      rows = rowsToObjects(d, 'SELECT * FROM notifications ORDER BY id');
    }
    return rows.map(r => ({
      id: r.id, user: r.user_name, action: r.action, target: r.target,
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
    d.run('UPDATE notifications SET read = 1 WHERE target_user = ?', [userId]);
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
      rows = rowsToObjects(d, 'SELECT * FROM messages WHERE recipient IS NULL OR sender = ? OR recipient = ? ORDER BY id', [userId, userId]);
    } else {
      rows = rowsToObjects(d, 'SELECT * FROM messages ORDER BY id');
    }
    return rows.map(r => ({ id: r.id, sender: r.sender, text: r.text, recipient: r.recipient ?? undefined, createdAt: r.created_at, time: formatRelativeTime(r.created_at) } as Message));
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
      const tags = row.content?.match(/#[^\s#]+/g);
      if (tags) {
        for (const tag of tags) {
          freq.set(tag, (freq.get(tag) || 0) + 1);
        }
      }
    }
    return Array.from(freq.entries())
      .map(([keyword, count]) => ({ keyword, count } as Trend))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  },

  async searchPosts(query: string, userId?: string) {
    if (!query.trim()) return [];
    const d = await getDb();
    const rows = rowsToObjects(
      d,
      `SELECT p.*,
        0 as liked,
        0 as disliked,
        (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
      FROM posts p
      WHERE p.thread_id = p.id
        AND (p.content LIKE ? OR p.display_name LIKE ?)
        AND COALESCE((SELECT au.hide_from_search FROM anonymous_users au WHERE au.slug = p.slug LIMIT 1), 0) = 0
      ORDER BY p.id DESC`,
      [`%${query}%`, `%${query}%`]
    );
    const hidden = getHiddenSlugsSqlite(d, userId);
    return rows.map(rowToPost).filter(p => !hidden.has(p.slug ?? ''));
  },

  async getPostsByHashtag(tag: string, userId?: string) {
    const normalized = tag.startsWith('#') ? tag : `#${tag}`;
    const d = await getDb();
    const rows = rowsToObjects(
      d,
      `SELECT p.*, 0 as liked, 0 as disliked,
        (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
      FROM posts p
      WHERE p.thread_id = p.id
        AND p.content LIKE ?
        AND COALESCE((SELECT au.hide_from_search FROM anonymous_users au WHERE au.slug = p.slug LIMIT 1), 0) = 0
      ORDER BY p.id DESC`,
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
        createdAt: row.created_at,
      } as AnonymousUser;
    }

    const ipRows = rowsToObjects(
      d,
      'SELECT * FROM anonymous_users WHERE ip_address = ? ORDER BY last_seen_at DESC LIMIT 1',
      [ipAddress]
    );
    if (ipRows.length > 0) {
      const row = ipRows[0];
      d.run(
        'UPDATE anonymous_users SET session_id = ?, last_seen_at = ? WHERE id = ?',
        [sessionId, new Date().toISOString(), row.id]
      );
      saveDb();
      return {
        id: row.id,
        displayName: row.display_name,
        slug: row.slug,
        avatarColor: row.avatar_color,
        createdAt: row.created_at,
      } as AnonymousUser;
    }

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

    return { id, displayName, slug, avatarColor, createdAt: now } as AnonymousUser;
  },

  async updateUserDisplayName(userId: string, displayName: string) {
    const d = await getDb();
    const slug = deriveSlugSqlite(displayName);
    d.run(
      'UPDATE anonymous_users SET display_name = ?, slug = ? WHERE id = ?',
      [displayName, slug, userId]
    );
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
    const before = rowsToObjects(d, 'SELECT 1 FROM user_follows WHERE follower_id = ? AND followed_id = ? LIMIT 1', [followerId, followedId]);
    d.run(
      'INSERT OR IGNORE INTO user_follows (follower_id, followed_id) VALUES (?, ?)',
      [followerId, followedId]
    );
    if (before.length === 0) {
      insertNotificationSqlite(d, { recipientId: followedId, actor: followerId, type: 'follow', action: 'がフォローしました', target: '' });
    }
    saveDb();
  },

  async unfollowUser(followerId: string, followedId: string) {
    const d = await getDb();
    d.run(
      'DELETE FROM user_follows WHERE follower_id = ? AND followed_id = ?',
      [followerId, followedId]
    );
    saveDb();
  },

  async isFollowing(followerId: string, followedId: string) {
    const d = await getDb();
    const rows = rowsToObjects(
      d,
      'SELECT 1 FROM user_follows WHERE follower_id = ? AND followed_id = ? LIMIT 1',
      [followerId, followedId]
    );
    return rows.length > 0;
  },

  async getFollowCounts(userId: string) {
    const d = await getDb();
    const followers = rowsToObjects(d, 'SELECT COUNT(*) AS cnt FROM user_follows WHERE followed_id = ?', [userId]);
    const following = rowsToObjects(d, 'SELECT COUNT(*) AS cnt FROM user_follows WHERE follower_id = ?', [userId]);
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
      `INSERT INTO games (id, preset, title, manifest, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, data.preset, data.title, JSON.stringify(data.manifest), now]
    );
    saveDb();
    return { id, preset: data.preset, title: data.title, manifest: data.manifest, createdAt: now };
  },

  async getGame(id) {
    const d = await getDb();
    const rows = rowsToObjects(d, 'SELECT * FROM games WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, preset: r.preset, title: r.title, manifest: JSON.parse(r.manifest), createdAt: r.created_at };
  },

  async listAllGames() {
    const d = await getDb();
    const rows = rowsToObjects(d, 'SELECT * FROM games ORDER BY id DESC', []);
    return rows.map(r => ({ id: r.id, preset: r.preset, title: r.title, manifest: JSON.parse(r.manifest), createdAt: r.created_at }));
  },

  async getLiveGameInfo(ipAddress: string) {
    const d = await getDb();
    const slot = new Date().toISOString().slice(0, 13);
    let schedRows = rowsToObjects(d, 'SELECT game_id FROM game_schedule WHERE hour_slot = ?', [slot]);
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
    const allGames = rowsToObjects(d, 'SELECT id, preset, title, created_at FROM games ORDER BY id DESC', []);
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
