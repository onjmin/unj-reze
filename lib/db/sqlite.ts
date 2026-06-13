import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { Post, AnonymousUser } from '../types';
import type { Notification, Message, Trend } from '../mock-db';
import type { DataStore, CreatePostParams, ReplyParams, MessageParams } from './interface';
import { formatRelativeTime } from '../time';

let db: SqlJsDatabase | null = null;

async function getDb(): Promise<SqlJsDatabase> {
  if (db) return db;

  const SQL = await initSqlJs();
  const dbPath = process.env.D1_DATABASE_PATH || path.join(process.cwd(), 'data', 'd1.sqlite');

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
  const initPath = path.join(process.cwd(), 'docker', 'init.sqlite.sql');
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
}

function saveDb() {
  const dbPath = process.env.D1_DATABASE_PATH || path.join(process.cwd(), 'data', 'd1.sqlite');
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

    return rows.map(r => ({
      ...rowToPost(r),
      replies: repliesMap.get(r.id) || [],
    }));
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
      `INSERT INTO posts (id, thread_id, display_name, slug, created_at, content, avatar_color, has_image, image_src, image_alt, has_collab_button)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [id, id, data.displayName, slug, now, data.content, data.avatarColor || 'from-blue-500 to-indigo-600',
       data.hasImage ? 1 : 0, data.imageSrc || null, data.imageAlt || null]
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
        has_collab_button: 1, hearts_total: 0, has_game: 0,
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

  async getReplies(postId: number) {
    const d = await getDb();
    const rows = rowsToObjects(
      d,
      'SELECT * FROM posts WHERE thread_id = ? AND id != thread_id ORDER BY id',
      [postId]
    );
    return rows.map(rowToPost);
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
      createdAt: r.created_at, time: formatRelativeTime(r.created_at),
    } as Notification));
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

  async searchPosts(query: string) {
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
      ORDER BY p.id DESC`,
      [`%${query}%`, `%${query}%`]
    );
    return rows.map(rowToPost);
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

  async followUser(followerId: string, followedId: string) {
    const d = await getDb();
    d.run(
      'INSERT OR IGNORE INTO user_follows (follower_id, followed_id) VALUES (?, ?)',
      [followerId, followedId]
    );
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
};
