import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { Post, Reply } from '../types';
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
    heartsTotal: row.hearts_total,
    hasGame: !!row.has_game,
    replyTo: row.reply_to ?? undefined,
    replies: [],
  };
}

function rowToReply(row: any): Reply {
  const createdAt = row.created_at;
  return {
    id: row.id,
    displayName: row.display_name,
    slug: row.slug ?? undefined,
    content: row.content,
    createdAt,
    time: formatRelativeTime(createdAt),
  };
}

function deriveSlugSqlite(fullName: string): string {
  const match = fullName.match(/[a-zA-Z0-9]+$/);
  return match ? match[0] : fullName;
}

export const sqliteStore: DataStore = {
  async getPosts() {
    const d = await getDb();
    const posts = d.exec('SELECT * FROM posts ORDER BY id DESC');
    if (posts.length === 0 || posts[0].values.length === 0) return [];
    const cols = posts[0].columns;
    const rows = posts[0].values.map((v: any[]) => {
      const obj: any = {};
      cols.forEach((c, i) => { obj[c] = v[i]; });
      return obj;
    });
    const postIds = rows.map(r => r.id);
    if (postIds.length === 0) return [];

    const placeholders = postIds.map(() => '?').join(',');
    const repliesResult = d.exec(`SELECT * FROM replies WHERE post_id IN (${placeholders}) ORDER BY id`, postIds);
    const repliesByPost: Record<number, Reply[]> = {};
    if (repliesResult.length > 0) {
      const rCols = repliesResult[0].columns;
      repliesResult[0].values.forEach((v: any[]) => {
        const obj: any = {};
        rCols.forEach((c, i) => { obj[c] = v[i]; });
        const pid = obj.post_id;
        if (!repliesByPost[pid]) repliesByPost[pid] = [];
        repliesByPost[pid].push(rowToReply(obj));
      });
    }

    return rows.map(r => ({
      ...rowToPost(r),
      replies: repliesByPost[r.id] || [],
    }));
  },

  async getPost(id: number) {
    const d = await getDb();
    const result = d.exec('SELECT * FROM posts WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    const cols = result[0].columns;
    const obj: any = {};
    cols.forEach((c, i) => { obj[c] = result[0].values[0][i]; });
    const post = rowToPost(obj);

    const repliesResult = d.exec('SELECT * FROM replies WHERE post_id = ? ORDER BY id', [id]);
    if (repliesResult.length > 0) {
      const rCols = repliesResult[0].columns;
      post.replies = repliesResult[0].values.map((v: any[]) => {
        const robj: any = {};
        rCols.forEach((c, i) => { robj[c] = v[i]; });
        return rowToReply(robj);
      });
    }
    return post;
  },

  async createPost(data: CreatePostParams) {
    const d = await getDb();
    const slug = data.slug || deriveSlugSqlite(data.displayName);
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const now = new Date().toISOString();
    d.run(
      `INSERT INTO posts (id, display_name, slug, created_at, content, avatar_color, has_image, image_src, image_alt, has_collab_button)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [id, data.displayName, slug, now, data.content, data.avatarColor || 'from-blue-500 to-indigo-600',
       data.hasImage ? 1 : 0, data.imageSrc || null, data.imageAlt || null]
    );
    saveDb();
    return { ...rowToPost({ id, display_name: data.displayName, slug, created_at: now, content: data.content, likes: 0, dislikes: 0, liked: 0, disliked: 0, replies_count: 0, reposts: 0, reposted: 0, has_image: data.hasImage ? 1 : 0, image_src: data.imageSrc || null, image_alt: data.imageAlt || null, avatar_color: data.avatarColor || 'from-blue-500 to-indigo-600', has_collab_button: 1, hearts_total: 0, has_game: 0, reply_to: null }), replies: [] };
  },

  async likePost(id: number) {
    const d = await getDb();
    const result = d.exec('SELECT * FROM posts WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    const cols = result[0].columns;
    const obj: any = {};
    cols.forEach((c, i) => { obj[c] = result[0].values[0][i]; });

    const newLiked = !obj.liked;
    const likeDelta = newLiked ? 1 : -1;
    const dislikeDelta = newLiked && obj.disliked ? -1 : 0;

    d.run(
      `UPDATE posts SET liked = ?, likes = likes + ?, disliked = CASE WHEN ? THEN 0 ELSE disliked END, dislikes = MAX(dislikes + ?, 0) WHERE id = ?`,
      [newLiked ? 1 : 0, likeDelta, newLiked && obj.disliked ? 1 : 0, dislikeDelta, id]
    );
    saveDb();

    const updated = d.exec('SELECT * FROM posts WHERE id = ?', [id]);
    if (updated.length === 0) return null;
    const ucols = updated[0].columns;
    const uobj: any = {};
    ucols.forEach((c, i) => { uobj[c] = updated[0].values[0][i]; });
    return rowToPost(uobj);
  },

  async dislikePost(id: number) {
    const d = await getDb();
    const result = d.exec('SELECT * FROM posts WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    const cols = result[0].columns;
    const obj: any = {};
    cols.forEach((c, i) => { obj[c] = result[0].values[0][i]; });

    const newDisliked = !obj.disliked;
    const dislikeDelta = newDisliked ? 1 : -1;
    const likeDelta = newDisliked && obj.liked ? -1 : 0;

    d.run(
      `UPDATE posts SET disliked = ?, dislikes = dislikes + ?, liked = CASE WHEN ? THEN 0 ELSE liked END, likes = MAX(likes + ?, 0) WHERE id = ?`,
      [newDisliked ? 1 : 0, dislikeDelta, newDisliked && obj.liked ? 1 : 0, likeDelta, id]
    );
    saveDb();

    const updated = d.exec('SELECT * FROM posts WHERE id = ?', [id]);
    if (updated.length === 0) return null;
    const ucols = updated[0].columns;
    const uobj: any = {};
    ucols.forEach((c, i) => { uobj[c] = updated[0].values[0][i]; });
    return rowToPost(uobj);
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
    const result = d.exec('SELECT * FROM replies WHERE post_id = ? ORDER BY id', [postId]);
    if (result.length === 0) return [];
    const cols = result[0].columns;
    return result[0].values.map((v: any[]) => {
      const obj: any = {};
      cols.forEach((c, i) => { obj[c] = v[i]; });
      return rowToReply(obj);
    });
  },

  async addReply(postId: number, data: ReplyParams) {
    const d = await getDb();
    const slug = deriveSlugSqlite(data.displayName);
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const now = new Date().toISOString();
    d.run(
      `INSERT INTO replies (id, post_id, display_name, slug, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, postId, data.displayName, slug, data.content, now]
    );
    d.run('UPDATE posts SET replies_count = replies_count + 1 WHERE id = ?', [postId]);
    saveDb();
    return { id, displayName: data.displayName, slug, content: data.content, createdAt: now, time: formatRelativeTime(now) };
  },

  async getUserPostsBySlug(slug: string) {
    const d = await getDb();
    const result = d.exec('SELECT * FROM posts WHERE slug = ? ORDER BY id DESC', [slug]);
    if (result.length === 0 || result[0].values.length === 0) return [];
    const cols = result[0].columns;
    return result[0].values.map((v: any[]) => {
      const obj: any = {};
      cols.forEach((c, i) => { obj[c] = v[i]; });
      return rowToPost(obj);
    });
  },

  async getUserDisplayName(slug: string) {
    const d = await getDb();
    const result = d.exec('SELECT display_name FROM posts WHERE slug = ? LIMIT 1', [slug]);
    if (result.length === 0 || result[0].values.length === 0) return undefined;
    return result[0].values[0][0] as string;
  },

  async getNotifications() {
    const d = await getDb();
    const result = d.exec('SELECT * FROM notifications ORDER BY id');
    if (result.length === 0) return [];
    const cols = result[0].columns;
    return result[0].values.map((v: any[]) => {
      const obj: any = {};
      cols.forEach((c, i) => { obj[c] = v[i]; });
      return { id: obj.id, user: obj.user_name, action: obj.action, target: obj.target, createdAt: obj.created_at, time: formatRelativeTime(obj.created_at) } as Notification;
    });
  },

  async getMessages() {
    const d = await getDb();
    const result = d.exec('SELECT * FROM messages ORDER BY id');
    if (result.length === 0) return [];
    const cols = result[0].columns;
    return result[0].values.map((v: any[]) => {
      const obj: any = {};
      cols.forEach((c, i) => { obj[c] = v[i]; });
      return { id: obj.id, sender: obj.sender, text: obj.text, createdAt: obj.created_at, time: formatRelativeTime(obj.created_at) } as Message;
    });
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
    const result = d.exec('SELECT * FROM trends ORDER BY id');
    if (result.length === 0) return [];
    const cols = result[0].columns;
    return result[0].values.map((v: any[]) => {
      const obj: any = {};
      cols.forEach((c, i) => { obj[c] = v[i]; });
      return { keyword: obj.keyword, count: obj.count } as Trend;
    });
  },
};
