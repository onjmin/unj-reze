import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { Post } from '../types';
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
    displayName: row.display_name,
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

  async getNotifications() {
    const d = await getDb();
    const rows = rowsToObjects(d, 'SELECT * FROM notifications ORDER BY id');
    return rows.map(r => ({ id: r.id, user: r.user_name, action: r.action, target: r.target, createdAt: r.created_at, time: formatRelativeTime(r.created_at) } as Notification));
  },

  async getMessages() {
    const d = await getDb();
    const rows = rowsToObjects(d, 'SELECT * FROM messages ORDER BY id');
    return rows.map(r => ({ id: r.id, sender: r.sender, text: r.text, createdAt: r.created_at, time: formatRelativeTime(r.created_at) } as Message));
  },

  async addMessage(data: MessageParams) {
    const d = await getDb();
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const now = new Date().toISOString();
    d.run(
      `INSERT INTO messages (id, sender, text, created_at) VALUES (?, ?, ?, ?)`,
      [id, data.sender, data.text, now]
    );
    saveDb();
    return { id, sender: data.sender, text: data.text, createdAt: now, time: formatRelativeTime(now) };
  },

  async getTrends() {
    const d = await getDb();
    const rows = rowsToObjects(d, 'SELECT * FROM trends ORDER BY id');
    return rows.map(r => ({ keyword: r.keyword, count: r.count } as Trend));
  },
};
