import { Pool } from 'pg';
import { Post, Reply } from '../types';
import type { Notification, Message, Trend } from '../mock-db';
import type { DataStore, CreatePostParams, ReplyParams, MessageParams } from './interface';
import { formatRelativeTime } from '../time';

let pool: Pool | null = null;
let initialized = false;

async function ensureTables(client: any) {
  if (initialized) return;
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

function rowToPost(row: any): Post {
  const createdAt = typeof row.created_at === 'object' && row.created_at?.toISOString
    ? row.created_at.toISOString()
    : String(row.created_at);
  return {
    id: row.id,
    displayName: row.display_name,
    slug: row.slug ?? undefined,
    createdAt,
    time: formatRelativeTime(createdAt),
    content: row.content,
    likes: row.likes,
    dislikes: row.dislikes,
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
    replyTo: row.reply_to ?? undefined,
    replies: [],
  };
}

function rowToReply(row: any): Reply {
  const createdAt = typeof row.created_at === 'object' && row.created_at?.toISOString
    ? row.created_at.toISOString()
    : String(row.created_at);
  return {
    id: row.id,
    displayName: row.display_name,
    slug: row.slug ?? undefined,
    content: row.content,
    createdAt,
    time: formatRelativeTime(createdAt),
  };
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
      ORDER BY p.id DESC
    `, [userId]);
  } else {
    result = await client.query(`
      SELECT p.*,
        false as liked,
        false as disliked,
        (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
      FROM posts p
      ORDER BY p.id DESC
    `);
  }

  const rows = result.rows;
  const postIds = rows.map(r => r.id);
  if (postIds.length === 0) return [];

  const repliesResult = await client.query(
    'SELECT * FROM replies WHERE post_id = ANY($1::int[]) ORDER BY id',
    [postIds]
  );
  const repliesByPost: Record<number, Reply[]> = {};
  for (const r of repliesResult.rows) {
    const pid = r.post_id;
    if (!repliesByPost[pid]) repliesByPost[pid] = [];
    repliesByPost[pid].push(rowToReply(r));
  }

  return rows.map(r => ({
    ...rowToPost(r),
    replies: repliesByPost[r.id] || [],
  }));
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
  const post = rowToPost(result.rows[0]);
  const repliesResult = await client.query('SELECT * FROM replies WHERE post_id = $1 ORDER BY id', [id]);
  post.replies = repliesResult.rows.map(rowToReply);
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
      const slug = data.slug || deriveSlugPg(data.displayName);
      const result = await client.query(
        `INSERT INTO posts (display_name, slug, created_at, content, avatar_color, has_image, image_src, image_alt, has_collab_button)
         VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, true)
         RETURNING *`,
        [data.displayName, slug, data.content, data.avatarColor || 'from-blue-500 to-indigo-600',
         data.hasImage || false, data.imageSrc || null, data.imageAlt || null]
      );
      return { ...rowToPost(result.rows[0]), replies: [] };
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
      } else if (existingVote === 'dislike') {
        await client.query(
          'UPDATE post_votes SET vote_type = $1 WHERE post_id = $2 AND user_id = $3',
          ['like', id, userId]
        );
        await client.query('UPDATE posts SET likes = likes + 1, dislikes = GREATEST(dislikes - 1, 0) WHERE id = $1', [id]);
      } else {
        await client.query(
          'INSERT INTO post_votes (post_id, user_id, vote_type) VALUES ($1, $2, $3)',
          [id, userId, 'like']
        );
        await client.query('UPDATE posts SET likes = likes + 1 WHERE id = $1', [id]);
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
      } else if (existingVote === 'like') {
        await client.query(
          'UPDATE post_votes SET vote_type = $1 WHERE post_id = $2 AND user_id = $3',
          ['dislike', id, userId]
        );
        await client.query('UPDATE posts SET dislikes = dislikes + 1, likes = GREATEST(likes - 1, 0) WHERE id = $1', [id]);
      } else {
        await client.query(
          'INSERT INTO post_votes (post_id, user_id, vote_type) VALUES ($1, $2, $3)',
          [id, userId, 'dislike']
        );
        await client.query('UPDATE posts SET dislikes = dislikes + 1 WHERE id = $1', [id]);
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
      return rowToPost(result.rows[0]);
    } finally {
      client.release();
    }
  },

  async getReplies(postId: number) {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT * FROM replies WHERE post_id = $1 ORDER BY id', [postId]);
      return result.rows.map(rowToReply);
    } finally {
      client.release();
    }
  },

  async addReply(postId: number, data: ReplyParams) {
    const client = await getPool().connect();
    try {
      const slug = deriveSlugPg(data.displayName);
      const result = await client.query(
        `INSERT INTO replies (post_id, display_name, slug, content, created_at)
         VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
        [postId, data.displayName, slug, data.content]
      );
      await client.query(
        'UPDATE posts SET replies_count = replies_count + 1 WHERE id = $1',
        [postId]
      );
      return rowToReply(result.rows[0]);
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
          WHERE p.slug = $2
          ORDER BY p.id DESC
        `, [userId, slug]);
      } else {
        result = await client.query(`
          SELECT p.*,
            false as liked,
            false as disliked,
            (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
          FROM posts p
          WHERE p.slug = $1
          ORDER BY p.id DESC
        `, [slug]);
      }
      return result.rows.map(rowToPost);
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

  async getNotifications() {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT * FROM notifications ORDER BY id');
      return result.rows.map(r => {
        const createdAt = typeof r.created_at === 'object' && r.created_at?.toISOString
          ? r.created_at.toISOString()
          : String(r.created_at);
        return {
          id: r.id,
          user: r.user_name,
          action: r.action,
          target: r.target,
          createdAt,
          time: formatRelativeTime(createdAt),
        } as Notification;
      });
    } finally {
      client.release();
    }
  },

  async getMessages() {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT * FROM messages ORDER BY id');
      return result.rows.map(r => {
        const createdAt = typeof r.created_at === 'object' && r.created_at?.toISOString
          ? r.created_at.toISOString()
          : String(r.created_at);
        return {
          id: r.id,
          sender: r.sender,
          text: r.text,
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
        `INSERT INTO messages (sender, text, created_at) VALUES ($1, $2, NOW()) RETURNING *`,
        [data.sender, data.text]
      );
      const r = result.rows[0];
      const createdAt = typeof r.created_at === 'object' && r.created_at?.toISOString
        ? r.created_at.toISOString()
        : String(r.created_at);
      return { id: r.id, sender: r.sender, text: r.text, createdAt, time: formatRelativeTime(createdAt) } as Message;
    } finally {
      client.release();
    }
  },

  async getTrends() {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT * FROM trends ORDER BY id');
      return result.rows.map(r => ({
        keyword: r.keyword,
        count: r.count,
      } as Trend));
    } finally {
      client.release();
    }
  },
};

function deriveSlugPg(fullName: string): string {
  const match = fullName.match(/[a-zA-Z0-9]+$/);
  return match ? match[0] : fullName;
}
