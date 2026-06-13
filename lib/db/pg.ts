import { Pool } from 'pg';
import { Post, AnonymousUser } from '../types';
import type { Notification, Message, Trend } from '../mock-db';
import type { DataStore, CreatePostParams, ReplyParams, MessageParams } from './interface';
import { formatRelativeTime } from '../time';
import { kvIncr, kvDecr, kvGet } from '../kv';

let pool: Pool | null = null;
let initialized = false;

async function ensureTables(client: any) {
  if (initialized) return;

  // Migration: add sequences for tables created with INTEGER PRIMARY KEY (not SERIAL)
  const tables = ['notifications', 'messages', 'trends', 'posts', 'post_votes', 'post_hearts'];
  for (const table of tables) {
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '${table}') THEN
          IF NOT EXISTS (
            SELECT 1 FROM pg_attrdef
            JOIN pg_class ON pg_attrdef.adrelid = pg_class.oid
            JOIN pg_attribute ON pg_attrdef.adrelid = pg_attribute.attrelid AND pg_attrdef.adnum = pg_attribute.attnum
            WHERE pg_class.relname = '${table}' AND pg_attribute.attname = 'id'
          ) THEN
            CREATE SEQUENCE IF NOT EXISTS ${table}_id_seq;
            ALTER TABLE ${table} ALTER COLUMN id SET DEFAULT nextval('${table}_id_seq');
            ALTER SEQUENCE ${table}_id_seq OWNED BY ${table}.id;
            PERFORM setval('${table}_id_seq', COALESCE((SELECT MAX(id) FROM ${table}), 0));
          END IF;
        END IF;
      END $$;
    `);
  }

  // Migration: add columns to notifications table for navigation links
  for (const col of ['type', 'post_id', 'target_user']) {
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'notifications' AND column_name = '${col}'
        ) THEN
          ALTER TABLE notifications ADD COLUMN ${col} ${col === 'type' ? 'TEXT NOT NULL DEFAULT \'like\'' : col === 'post_id' ? 'INTEGER' : 'TEXT'};
        END IF;
      END $$;
    `);
  }
  // Migration: set type/post_id/target_user for existing seed rows
  await client.query(`
    UPDATE notifications SET type = 'like', post_id = 7 WHERE id = 1 AND type = 'like' AND post_id IS NULL
  `);
  await client.query(`
    UPDATE notifications SET type = 'repost', post_id = 6 WHERE id = 2 AND type = 'like' AND post_id IS NULL
  `);
  await client.query(`
    UPDATE notifications SET type = 'reply', post_id = 5 WHERE id = 3 AND type = 'like' AND post_id IS NULL
  `);
  await client.query(`
    UPDATE notifications SET type = 'follow', target_user = '名無しvFZ' WHERE id = 4 AND type = 'like' AND target_user IS NULL
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS post_votes (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      vote_type TEXT NOT NULL CHECK (vote_type IN ('like', 'dislike')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (post_id, user_id)
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS post_hearts (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'messages' AND column_name = 'recipient'
      ) THEN
        ALTER TABLE messages ADD COLUMN recipient TEXT;
      END IF;
    END $$;
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS anonymous_users (
      id TEXT PRIMARY KEY,
      ip_address TEXT NOT NULL,
      session_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      slug TEXT,
      avatar_color TEXT NOT NULL DEFAULT 'from-blue-500 to-indigo-600',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_anonymous_users_ip ON anonymous_users(ip_address)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_anonymous_users_session ON anonymous_users(session_id)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_follows (
      id SERIAL PRIMARY KEY,
      follower_id TEXT NOT NULL,
      followed_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (follower_id, followed_id)
    )
  `);
  initialized = true;
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://neon:neon@localhost:5432/unj_reze',
    });
  }
  return pool;
}

async function rowToPost(row: any): Promise<Post> {
  const createdAt = typeof row.created_at === 'object' && row.created_at?.toISOString
    ? row.created_at.toISOString()
    : String(row.created_at);

  let likes = row.likes;
  let dislikes = row.dislikes;
  try {
    const kvLikes = await kvGet(`post:${row.id}:likes`);
    const kvDislikes = await kvGet(`post:${row.id}:dislikes`);
    if (kvLikes !== null) likes = parseInt(kvLikes, 10);
    if (kvDislikes !== null) dislikes = parseInt(kvDislikes, 10);
  } catch {}

  return {
    id: row.id,
    displayName: row.display_name ?? '名無し',
    slug: row.slug ?? undefined,
    createdAt,
    time: formatRelativeTime(createdAt),
    content: row.content,
    likes,
    dislikes,
    liked: row.liked ?? false,
    disliked: row.disliked ?? false,
    repliesCount: row.replies_count,
    reposts: row.reposts,
    reposted: row.reposted,
    hasImage: row.has_image,
    imageSrc: row.image_src ?? undefined,
    imageAlt: row.image_alt ?? undefined,
    avatarColor: row.avatar_color,
    hasCollabButton: row.has_collab_button,
    heartsTotal: row.hearts_total ?? 0,
    hasGame: row.has_game,
    threadId: row.thread_id,
    parentPostId: row.parent_post_id ?? undefined,
    replies: [],
  };
}

async function getThreadReplies(client: any, threadIds: number[]): Promise<Map<number, Post[]>> {
  if (threadIds.length === 0) return new Map();
  const result = await client.query(
    `SELECT * FROM posts WHERE thread_id = ANY($1::int[]) AND id != thread_id ORDER BY id`,
    [threadIds]
  );
  const map = new Map<number, Post[]>();
  for (const row of result.rows) {
    const pid = row.thread_id;
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid)!.push(await rowToPost(row));
  }
  return map;
}

async function getPostsWithVotes(client: any, userId?: string): Promise<Post[]> {
  await ensureTables(client);
  let result;
  if (userId) {
    result = await client.query(`
      SELECT p.*,
        COALESCE(pv.vote_type = 'like', false) as liked,
        COALESCE(pv.vote_type = 'dislike', false) as disliked,
        (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
      FROM posts p
      LEFT JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = $1
      WHERE p.thread_id = p.id
      ORDER BY p.id DESC
    `, [userId]);
  } else {
    result = await client.query(`
      SELECT p.*,
        false as liked,
        false as disliked,
        (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
      FROM posts p
      WHERE p.thread_id = p.id
      ORDER BY p.id DESC
    `);
  }

  const rows = result.rows;
  if (rows.length === 0) return [];

  const threadIds = rows.map((r: any) => r.id);
  const repliesMap = await getThreadReplies(client, threadIds);

  return Promise.all(rows.map(async (r: any) => ({
    ...(await rowToPost(r)),
    replies: repliesMap.get(r.id) || [],
  })));
}

async function getPostWithVotes(client: any, id: number, userId?: string): Promise<Post | null> {
  await ensureTables(client);
  let result;
  if (userId) {
    result = await client.query(`
      SELECT p.*,
        COALESCE(pv.vote_type = 'like', false) as liked,
        COALESCE(pv.vote_type = 'dislike', false) as disliked,
        (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
      FROM posts p
      LEFT JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = $1
      WHERE p.id = $2
    `, [userId, id]);
  } else {
    result = await client.query(`
      SELECT p.*,
        false as liked,
        false as disliked,
        (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
      FROM posts p
      WHERE p.id = $1
    `, [id]);
  }

  if (result.rows.length === 0) return null;
  const post = await rowToPost(result.rows[0]);

  if (post.threadId === post.id) {
    // It's a thread, load replies
    const repliesResult = await client.query(
      'SELECT * FROM posts WHERE thread_id = $1 AND id != thread_id ORDER BY id',
      [id]
    );
    post.replies = repliesResult.rows.map(rowToPost);
  }

  return post;
}

export const pgStore: DataStore = {
  async getPosts(userId?: string) {
    const client = await getPool().connect();
    try {
      return await getPostsWithVotes(client, userId);
    } finally {
      client.release();
    }
  },

  async getPost(id: number, userId?: string) {
    const client = await getPool().connect();
    try {
      return await getPostWithVotes(client, id, userId);
    } finally {
      client.release();
    }
  },

  async createPost(data: CreatePostParams) {
    const client = await getPool().connect();
    try {
      await ensureTables(client);
      const slug = data.slug || deriveSlugPg(data.displayName);
      const insertResult = await client.query(
        `INSERT INTO posts (id, thread_id, display_name, slug, created_at, content, avatar_color, has_image, image_src, image_alt, has_collab_button)
         VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM posts), (SELECT COALESCE(MAX(id), 0) + 1 FROM posts), $1, $2, NOW(), $3, $4, $5, $6, $7, true)
         RETURNING id`,
        [data.displayName, slug, data.content, data.avatarColor || 'from-blue-500 to-indigo-600',
         data.hasImage || false, data.imageSrc || null, data.imageAlt || null]
      );
      const newId = insertResult.rows[0].id;
      const result = await client.query('SELECT * FROM posts WHERE id = $1', [newId]);
      return { ...(await rowToPost(result.rows[0])), replies: [] };
    } finally {
      client.release();
    }
  },

  async likePost(id: number, userId: string) {
    const client = await getPool().connect();
    try {
      await ensureTables(client);
      await client.query('BEGIN');
      const postResult = await client.query('SELECT * FROM posts WHERE id = $1 FOR UPDATE', [id]);
      if (postResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const voteResult = await client.query(
        'SELECT vote_type FROM post_votes WHERE post_id = $1 AND user_id = $2 FOR UPDATE',
        [id, userId]
      );
      const existingVote = voteResult.rows[0]?.vote_type;

      if (existingVote === 'like') {
        await client.query('DELETE FROM post_votes WHERE post_id = $1 AND user_id = $2', [id, userId]);
        await client.query('UPDATE posts SET likes = GREATEST(likes - 1, 0) WHERE id = $1', [id]);
        try { await kvDecr(`post:${id}:likes`); } catch {}
      } else if (existingVote === 'dislike') {
        await client.query(
          'UPDATE post_votes SET vote_type = $1 WHERE post_id = $2 AND user_id = $3',
          ['like', id, userId]
        );
        await client.query('UPDATE posts SET likes = likes + 1, dislikes = GREATEST(dislikes - 1, 0) WHERE id = $1', [id]);
        try { await kvIncr(`post:${id}:likes`); await kvDecr(`post:${id}:dislikes`); } catch {}
      } else {
        await client.query(
          'INSERT INTO post_votes (post_id, user_id, vote_type) VALUES ($1, $2, $3)',
          [id, userId, 'like']
        );
        await client.query('UPDATE posts SET likes = likes + 1 WHERE id = $1', [id]);
        try { await kvIncr(`post:${id}:likes`); } catch {}
      }

      await client.query('COMMIT');
      return await getPostWithVotes(client, id, userId);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async dislikePost(id: number, userId: string) {
    const client = await getPool().connect();
    try {
      await ensureTables(client);
      await client.query('BEGIN');
      const postResult = await client.query('SELECT * FROM posts WHERE id = $1 FOR UPDATE', [id]);
      if (postResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const voteResult = await client.query(
        'SELECT vote_type FROM post_votes WHERE post_id = $1 AND user_id = $2 FOR UPDATE',
        [id, userId]
      );
      const existingVote = voteResult.rows[0]?.vote_type;

      if (existingVote === 'dislike') {
        await client.query('DELETE FROM post_votes WHERE post_id = $1 AND user_id = $2', [id, userId]);
        await client.query('UPDATE posts SET dislikes = GREATEST(dislikes - 1, 0) WHERE id = $1', [id]);
        try { await kvDecr(`post:${id}:dislikes`); } catch {}
      } else if (existingVote === 'like') {
        await client.query(
          'UPDATE post_votes SET vote_type = $1 WHERE post_id = $2 AND user_id = $3',
          ['dislike', id, userId]
        );
        await client.query('UPDATE posts SET dislikes = dislikes + 1, likes = GREATEST(likes - 1, 0) WHERE id = $1', [id]);
        try { await kvIncr(`post:${id}:dislikes`); await kvDecr(`post:${id}:likes`); } catch {}
      } else {
        await client.query(
          'INSERT INTO post_votes (post_id, user_id, vote_type) VALUES ($1, $2, $3)',
          [id, userId, 'dislike']
        );
        await client.query('UPDATE posts SET dislikes = dislikes + 1 WHERE id = $1', [id]);
        try { await kvIncr(`post:${id}:dislikes`); } catch {}
      }

      await client.query('COMMIT');
      return await getPostWithVotes(client, id, userId);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async heartPost(id: number, userId: string, count: number = 1) {
    const client = await getPool().connect();
    try {
      await ensureTables(client);
      const postResult = await client.query('SELECT id FROM posts WHERE id = $1', [id]);
      if (postResult.rows.length === 0) return null;

      for (let i = 0; i < count; i++) {
        await client.query(
          'INSERT INTO post_hearts (post_id, user_id) VALUES ($1, $2)',
          [id, userId]
        );
      }
      return await getPostWithVotes(client, id);
    } finally {
      client.release();
    }
  },

  async repostPost(id: number) {
    const client = await getPool().connect();
    try {
      const result = await client.query(
        `UPDATE posts SET reposted = NOT reposted, reposts = CASE WHEN reposted THEN reposts - 1 ELSE reposts + 1 END
         WHERE id = $1 RETURNING *`,
        [id]
      );
      if (result.rows.length === 0) return null;
      return await rowToPost(result.rows[0]);
    } finally {
      client.release();
    }
  },

  async getReplies(postId: number) {
    const client = await getPool().connect();
    try {
      const result = await client.query(
        'SELECT * FROM posts WHERE thread_id = $1 AND id != thread_id ORDER BY id',
        [postId]
      );
      return Promise.all(result.rows.map(rowToPost));
    } finally {
      client.release();
    }
  },

  async addReply(postId: number, data: ReplyParams) {
    const client = await getPool().connect();
    try {
      await ensureTables(client);
      const slug = deriveSlugPg(data.displayName);
      const parentPostId = data.parentPostId ?? postId;
      const result = await client.query(
        `INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, content, created_at, avatar_color)
         VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM posts), $1, $2, $3, $4, $5, NOW(), 'from-blue-500 to-indigo-600')
         RETURNING *`,
        [postId, parentPostId, data.displayName, slug, data.content]
      );
      await client.query(
        'UPDATE posts SET replies_count = replies_count + 1 WHERE id = $1',
        [postId]
      );
      return await rowToPost(result.rows[0]);
    } finally {
      client.release();
    }
  },

  async getLikedPosts(userId: string) {
    const client = await getPool().connect();
    try {
      await ensureTables(client);
      const result = await client.query(`
        SELECT p.*,
          COALESCE(pv.vote_type = 'like', false) as liked,
          COALESCE(pv.vote_type = 'dislike', false) as disliked,
          (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
        FROM posts p
        JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = $1 AND pv.vote_type = 'like'
        ORDER BY p.id DESC
      `, [userId]);
      return Promise.all(result.rows.map(rowToPost));
    } finally {
      client.release();
    }
  },

  async getDislikedPosts(userId: string) {
    const client = await getPool().connect();
    try {
      await ensureTables(client);
      const result = await client.query(`
        SELECT p.*,
          COALESCE(pv.vote_type = 'like', false) as liked,
          COALESCE(pv.vote_type = 'dislike', false) as disliked,
          (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
        FROM posts p
        JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = $1 AND pv.vote_type = 'dislike'
        ORDER BY p.id DESC
      `, [userId]);
      return Promise.all(result.rows.map(rowToPost));
    } finally {
      client.release();
    }
  },

  async getHeartedPosts(userId: string) {
    const client = await getPool().connect();
    try {
      await ensureTables(client);
      const result = await client.query(`
        SELECT p.*,
          false as liked,
          false as disliked,
          (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
        FROM posts p
        JOIN post_hearts ph ON ph.post_id = p.id AND ph.user_id = $1
        ORDER BY p.id DESC
      `, [userId]);
      return Promise.all(result.rows.map(rowToPost));
    } finally {
      client.release();
    }
  },

  async getUserPostsBySlug(slug: string, userId?: string) {
    const client = await getPool().connect();
    try {
      await ensureTables(client);
      let result;
      if (userId) {
        result = await client.query(`
          SELECT p.*,
            COALESCE(pv.vote_type = 'like', false) as liked,
            COALESCE(pv.vote_type = 'dislike', false) as disliked,
            (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
          FROM posts p
          LEFT JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = $1
          WHERE p.slug = $2 AND p.thread_id = p.id
          ORDER BY p.id DESC
        `, [userId, slug]);
      } else {
        result = await client.query(`
          SELECT p.*,
            false as liked,
            false as disliked,
            (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
          FROM posts p
          WHERE p.slug = $1 AND p.thread_id = p.id
          ORDER BY p.id DESC
        `, [slug]);
      }
      return Promise.all(result.rows.map(rowToPost));
    } finally {
      client.release();
    }
  },

  async getUserDisplayName(slug: string) {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT display_name FROM posts WHERE slug = $1 LIMIT 1', [slug]);
      return result.rows[0]?.display_name;
    } finally {
      client.release();
    }
  },

  async getNotifications(userId?: string) {
    const client = await getPool().connect();
    try {
      let result;
      if (userId) {
        result = await client.query(
          'SELECT * FROM notifications WHERE target_user = $1 ORDER BY created_at DESC LIMIT 20',
          [userId]
        );
      } else {
        result = await client.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20');
      }
      return result.rows.map(r => {
        const createdAt = typeof r.created_at === 'object' && r.created_at?.toISOString
          ? r.created_at.toISOString()
          : String(r.created_at);
        return {
          id: r.id,
          user: r.user_name,
          action: r.action,
          target: r.target,
          type: r.type || 'like',
          postId: r.post_id ?? undefined,
          targetUser: r.target_user ?? undefined,
          createdAt,
          time: formatRelativeTime(createdAt),
        } as Notification;
      });
    } finally {
      client.release();
    }
  },

  async getMessages(userId?: string) {
    const client = await getPool().connect();
    try {
      let result;
      if (userId) {
        result = await client.query(
          'SELECT * FROM messages WHERE recipient IS NULL OR sender = $1 OR recipient = $1 ORDER BY created_at DESC LIMIT 20',
          [userId]
        );
      } else {
        result = await client.query('SELECT * FROM messages ORDER BY created_at DESC LIMIT 20');
      }
      return result.rows.map(r => {
        const createdAt = typeof r.created_at === 'object' && r.created_at?.toISOString
          ? r.created_at.toISOString()
          : String(r.created_at);
        return {
          id: r.id,
          sender: r.sender,
          text: r.text,
          recipient: r.recipient ?? undefined,
          createdAt,
          time: formatRelativeTime(createdAt),
        } as Message;
      });
    } finally {
      client.release();
    }
  },

  async addMessage(data: MessageParams) {
    const client = await getPool().connect();
    try {
      const result = await client.query(
        `INSERT INTO messages (id, sender, text, recipient, created_at)
         VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM messages), $1, $2, $3, NOW()) RETURNING *`,
        [data.sender, data.text, data.recipient || null]
      );
      const r = result.rows[0];
      const createdAt = typeof r.created_at === 'object' && r.created_at?.toISOString
        ? r.created_at.toISOString()
        : String(r.created_at);
      return { id: r.id, sender: r.sender, text: r.text, recipient: r.recipient ?? undefined, createdAt, time: formatRelativeTime(createdAt) } as Message;
    } finally {
      client.release();
    }
  },

  async getTrends() {
    const client = await getPool().connect();
    try {
      let result;
      try {
        result = await client.query(`
          SELECT m[1] AS keyword, COUNT(*) AS count
          FROM posts p, LATERAL regexp_matches(p.content, '#[^\\s#]+', 'g') AS m
          GROUP BY m[1]
          ORDER BY count DESC
          LIMIT 10
        `);
      } catch {
        result = { rows: [] };
      }
      return result.rows.map(r => ({
        keyword: r.keyword,
        count: parseInt(r.count, 10),
      } as Trend));
    } finally {
      client.release();
    }
  },

  async searchPosts(query: string) {
    if (!query.trim()) return [];
    const client = await getPool().connect();
    try {
      await ensureTables(client);
      const result = await client.query(`
        SELECT p.*,
          false as liked,
          false as disliked,
          (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
        FROM posts p
        WHERE p.thread_id = p.id
          AND (p.content ILIKE $1 OR p.display_name ILIKE $1)
        ORDER BY p.id DESC
      `, [`%${query}%`]);
      return Promise.all(result.rows.map(rowToPost));
    } finally {
      client.release();
    }
  },

  async getOrCreateAnonymousUser(sessionId: string, ipAddress: string) {
    const client = await getPool().connect();
    try {
      await ensureTables(client);

      const sessionResult = await client.query(
        'SELECT * FROM anonymous_users WHERE session_id = $1',
        [sessionId]
      );
      if (sessionResult.rows.length > 0) {
        const row = sessionResult.rows[0];
        await client.query(
          'UPDATE anonymous_users SET last_seen_at = NOW() WHERE id = $1',
          [row.id]
        );
        return {
          id: row.id,
          displayName: row.display_name,
          slug: row.slug,
          avatarColor: row.avatar_color,
          createdAt: typeof row.created_at === 'object' && row.created_at?.toISOString
            ? row.created_at.toISOString() : String(row.created_at),
        } as AnonymousUser;
      }

      const ipResult = await client.query(
        'SELECT * FROM anonymous_users WHERE ip_address = $1 ORDER BY last_seen_at DESC LIMIT 1',
        [ipAddress]
      );
      if (ipResult.rows.length > 0) {
        const row = ipResult.rows[0];
        await client.query(
          'UPDATE anonymous_users SET session_id = $1, last_seen_at = NOW() WHERE id = $2',
          [sessionId, row.id]
        );
        return {
          id: row.id,
          displayName: row.display_name,
          slug: row.slug,
          avatarColor: row.avatar_color,
          createdAt: typeof row.created_at === 'object' && row.created_at?.toISOString
            ? row.created_at.toISOString() : String(row.created_at),
        } as AnonymousUser;
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const displayName = generateDisplayNamePg();
      const slug = deriveSlugPg(displayName);
      const avatarColor = randomGradientPg();

      await client.query(
        `INSERT INTO anonymous_users (id, ip_address, session_id, display_name, slug, avatar_color, created_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [id, ipAddress, sessionId, displayName, slug, avatarColor]
      );

      return {
        id,
        displayName,
        slug,
        avatarColor,
        createdAt: new Date().toISOString(),
      } as AnonymousUser;
    } finally {
      client.release();
    }
  },

  async updateUserDisplayName(userId: string, displayName: string) {
    const client = await getPool().connect();
    try {
      await ensureTables(client);
      const slug = deriveSlugPg(displayName);
      await client.query(
        'UPDATE anonymous_users SET display_name = $1, slug = $2 WHERE id = $3',
        [displayName, slug, userId]
      );
    } finally {
      client.release();
    }
  },

  async followUser(followerId: string, followedId: string) {
    const client = await getPool().connect();
    try {
      await ensureTables(client);
      await client.query(
        'INSERT INTO user_follows (follower_id, followed_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [followerId, followedId]
      );
    } finally {
      client.release();
    }
  },

  async unfollowUser(followerId: string, followedId: string) {
    const client = await getPool().connect();
    try {
      await ensureTables(client);
      await client.query(
        'DELETE FROM user_follows WHERE follower_id = $1 AND followed_id = $2',
        [followerId, followedId]
      );
    } finally {
      client.release();
    }
  },

  async isFollowing(followerId: string, followedId: string) {
    const client = await getPool().connect();
    try {
      await ensureTables(client);
      const result = await client.query(
        'SELECT 1 FROM user_follows WHERE follower_id = $1 AND followed_id = $2 LIMIT 1',
        [followerId, followedId]
      );
      return result.rows.length > 0;
    } finally {
      client.release();
    }
  },

  async getFollowCounts(userId: string) {
    const client = await getPool().connect();
    try {
      await ensureTables(client);
      const result = await client.query(`
        SELECT
          (SELECT COUNT(*) FROM user_follows WHERE followed_id = $1) AS followers,
          (SELECT COUNT(*) FROM user_follows WHERE follower_id = $1) AS following
      `, [userId]);
      return {
        followers: parseInt(result.rows[0].followers, 10),
        following: parseInt(result.rows[0].following, 10),
      };
    } finally {
      client.release();
    }
  },
};

function deriveSlugPg(fullName: string): string {
  const match = fullName.match(/[a-zA-Z0-9]+$/);
  return match ? match[0] : fullName;
}

const AVATAR_GRADIENTS_PG = [
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

function generateDisplayNamePg(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 3; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  return `名無し${suffix}`;
}

function randomGradientPg(): string {
  return AVATAR_GRADIENTS_PG[Math.floor(Math.random() * AVATAR_GRADIENTS_PG.length)];
}
