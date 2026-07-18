import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { AnonymousUser, OriginType } from '../types';
import { DbPost as Post, DbNotification as Notification, DbOshiItem } from '../types-db';
import type { Message, Trend } from '../mock-db';
import type { DataStore, CreatePostParams, ReplyParams, MessageParams, ReportParams } from './interface';
import { formatRelativeTime } from '../time';
// kvIncr / kvDecr / kvGet: no longer used for read-path; KV writes removed as DB is source of truth

// Node.js環境（マイグレーション実行時など）での WebSocket ポリフィル
if (typeof window === 'undefined' && !process.env.NEXT_RUNTIME) {
  const getRequire = () => {
    try {
      return new Function('name', 'return require(name)');
    } catch {
      return null;
    }
  };
  const req = getRequire();
  if (req) {
    try {
      neonConfig.webSocketConstructor = req('ws');
    } catch {}
  }
}

let pool: any = null;


function getPool(): any {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || 'postgresql://neon:neon@localhost:5432/unj_reze';
    const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    if (isLocal) {
      // ローカルの wsproxy (8080ポート) への WebSocket トンネリング接続を有効化。
      // wsproxy は Docker ネットワーク内で動くため、接続先アドレスは
      // ホスト側の DATABASE_URL の host(localhost)ではなく、
      // wsproxy から解決できる db-neon:5432 を明示的に指定する。
      neonConfig.wsProxy = () => 'localhost:8080/v1?address=db-neon:5432';
      neonConfig.useSecureWebSocket = false;
      // postgres:16-alpine はデフォルトで scram-sha-256(SASL)認証のため、
      // クリアテキストパスワード専用の pipelineConnect は使えない。
      neonConfig.pipelineConnect = false;
    }
    pool = new NeonPool({ connectionString });
  }
  return pool;
}

function rowToOshiItemPg(row: any): DbOshiItem {
  const createdAt = typeof row.created_at === 'object' && row.created_at?.toISOString
    ? row.created_at.toISOString() : String(row.created_at);
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
    createdAt,
  };
}

async function rowToPost(row: any): Promise<Post> {
  const createdAt = typeof row.created_at === 'object' && row.created_at?.toISOString
    ? row.created_at.toISOString()
    : String(row.created_at);

  const likes = row.likes;
  const dislikes = row.dislikes;

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
    avatarUrl: row.avatar_url ?? undefined,
    hasCollabButton: row.has_collab_button,
    heartsTotal: row.hearts_total ?? 0,
    hasGame: row.has_game,
    gameId: row.game_id ?? undefined,
    originType: row.origin_type ?? undefined,
    isFalseDeclaration: row.is_false_declaration ?? false,
    isEdited: row.is_edited ?? false,
    checkeredDark: row.checkered_dark != null ? !!row.checkered_dark : undefined,
    threadId: row.thread_id,
    parentPostId: row.parent_post_id ?? undefined,
    replies: [],
  };
}

async function getThreadReplies(client: any, threadIds: number[]): Promise<Map<number, Post[]>> {
  if (threadIds.length === 0) return new Map();
  const result = await client.query(
    `SELECT p.*,
       COALESCE(au.display_name, p.display_name) as display_name,
       au.avatar_url as avatar_url
     FROM posts p
     LEFT JOIN anonymous_users au ON p.slug = au.slug
     WHERE p.thread_id = ANY($1::int[]) AND p.id != p.thread_id ORDER BY p.id`,
    [threadIds]
  );
  const map = new Map<number, Post[]>();
  const posts = await Promise.all(result.rows.map((row: any) => rowToPost(row)));
  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows[i];
    const post = posts[i];
    const pid = row.thread_id;
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid)!.push(post);
  }
  return map;
}

async function getPostsWithVotes(client: any, userId?: string): Promise<Post[]> {
  let result;
  if (userId) {
    result = await client.query(`
      SELECT p.*,
        COALESCE(au.display_name, p.display_name) as display_name,
        au.avatar_url as avatar_url,
        COALESCE(pv.vote_type = 'like', false) as liked,
        COALESCE(pv.vote_type = 'dislike', false) as disliked,
        (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
      FROM posts p
      LEFT JOIN anonymous_users au ON p.slug = au.slug
      LEFT JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = $1
      WHERE p.thread_id = p.id
      ORDER BY p.id DESC
    `, [userId]);
  } else {
    result = await client.query(`
      SELECT p.*,
        COALESCE(au.display_name, p.display_name) as display_name,
        au.avatar_url as avatar_url,
        false as liked,
        false as disliked,
        (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
      FROM posts p
      LEFT JOIN anonymous_users au ON p.slug = au.slug
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
  let result;
  if (userId) {
    result = await client.query(`
      SELECT p.*,
        COALESCE(au.display_name, p.display_name) as display_name,
        au.avatar_url as avatar_url,
        COALESCE(pv.vote_type = 'like', false) as liked,
        COALESCE(pv.vote_type = 'dislike', false) as disliked,
        (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
      FROM posts p
      LEFT JOIN anonymous_users au ON p.slug = au.slug
      LEFT JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = $1
      WHERE p.id = $2
    `, [userId, id]);
  } else {
    result = await client.query(`
      SELECT p.*,
        COALESCE(au.display_name, p.display_name) as display_name,
        au.avatar_url as avatar_url,
        false as liked,
        false as disliked,
        (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
      FROM posts p
      LEFT JOIN anonymous_users au ON p.slug = au.slug
      WHERE p.id = $1
    `, [id]);
  }

  if (result.rows.length === 0) return null;
  const post = await rowToPost(result.rows[0]);

  if (post.threadId === post.id) {
    // It's a thread, load replies
    const repliesResult = await client.query(
      `SELECT p.*,
         COALESCE(au.display_name, p.display_name) as display_name,
         au.avatar_url as avatar_url
       FROM posts p
       LEFT JOIN anonymous_users au ON p.slug = au.slug
       WHERE p.thread_id = $1 AND p.id != p.thread_id ORDER BY p.id`,
      [id]
    );
    post.replies = await Promise.all(repliesResult.rows.map(rowToPost));
  }

  return post;
}

function snippetPg(text: string): string {
  return text.length > 20 ? text.slice(0, 20) + '…' : text;
}

/** 通知を挿入。自己宛は生成しない。 */
async function insertNotificationPg(client: any, d: { recipientId: string; actor: string; type: string; action: string; target?: string; postId?: number }): Promise<void> {
  if (!d.recipientId || d.recipientId === d.actor) return;
  try {
    await client.query(
      `INSERT INTO notifications (user_name, action, target, type, post_id, target_user, read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, NOW())`,
      [d.actor, d.action, d.target ?? '', d.type, d.postId ?? null, d.recipientId]
    );
  } catch { /* notifications テーブル未整備時は無視 */ }
}

/** userId(匿名ID/displayName/slug) から slug を解決。 */
async function resolveViewerSlug(client: any, userId: string): Promise<string> {
  const u = await client.query(
    'SELECT slug FROM anonymous_users WHERE id = $1 OR display_name = $1 OR slug = $1 LIMIT 1',
    [userId]
  );
  return u.rows[0]?.slug ?? deriveSlugPg(userId);
}

/** 閲覧者に対して非表示にすべき slug 集合(自分がブロック/ミュート ＋ 自分をブロックした相手)。 */
async function getHiddenSlugs(client: any, userId?: string): Promise<Set<string>> {
  const hidden = new Set<string>();
  if (!userId) return hidden;
  const viewerSlug = await resolveViewerSlug(client, userId);
  if (!viewerSlug) return hidden;
  const [blocks, mutes] = await Promise.all([
    client.query(
      'SELECT blocker_slug, blocked_slug FROM user_blocks WHERE blocker_slug = $1 OR blocked_slug = $1',
      [viewerSlug]
    ),
    client.query('SELECT muted_slug FROM user_mutes WHERE muter_slug = $1', [viewerSlug])
  ]);
  for (const r of blocks.rows) {
    if (r.blocker_slug === viewerSlug) hidden.add(r.blocked_slug);
    if (r.blocked_slug === viewerSlug) hidden.add(r.blocker_slug);
  }
  for (const r of mutes.rows) hidden.add(r.muted_slug);
  return hidden;
}

export const pgStore: DataStore = {
  async getPosts(userId?: string) {
    const client = await getPool().connect();
    try {
      // Run posts query and hidden-slugs lookup concurrently — they are independent.
      const [posts, hidden] = await Promise.all([
        getPostsWithVotes(client, userId),
        getHiddenSlugs(client, userId),
      ]);
      if (hidden.size === 0) return posts;
      return posts
        .filter(p => !hidden.has(p.slug ?? ''))
        .map(p => ({ ...p, replies: p.replies.filter(r => !hidden.has(r.slug ?? '')) }));
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
      const insertResult = await client.query(
        `INSERT INTO posts (id, thread_id, display_name, slug, created_at, content, avatar_color, has_image, image_src, image_alt, has_collab_button, has_game, game_id, origin_type, checkered_dark)
         VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM posts), (SELECT COALESCE(MAX(id), 0) + 1 FROM posts), $1, $2, NOW(), $3, $4, $5, $6, $7, true, $8, $9, $10, $11)
         RETURNING *`,
        [data.displayName, slug, data.content, data.avatarColor || 'from-blue-500 to-indigo-600',
         data.hasImage || false, data.imageSrc || null, data.imageAlt || null,
         !!data.gameId, data.gameId || null, data.originType ?? null, data.checkeredDark != null ? (data.checkeredDark ? 1 : 0) : null]
      );
      return { ...(await rowToPost(insertResult.rows[0])), replies: [] };
    } finally {
      client.release();
    }
  },

  async likePost(id: number, userId: string) {
    const client = await getPool().connect();
    try {
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
        const author = postResult.rows[0];
        await insertNotificationPg(client, { recipientId: author.display_name, actor: userId, type: 'like', action: 'がいいねしました', target: snippetPg(author.content ?? ''), postId: id });
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
      const postResult = await client.query('SELECT id, display_name, content FROM posts WHERE id = $1', [id]);
      if (postResult.rows.length === 0) return null;

      const insertPromises = [];
      for (let i = 0; i < count; i++) {
        insertPromises.push(
          client.query(
            'INSERT INTO post_hearts (post_id, user_id) VALUES ($1, $2)',
            [id, userId]
          )
        );
      }
      await Promise.all(insertPromises);
      const author = postResult.rows[0];
      await insertNotificationPg(client, { recipientId: author.display_name, actor: userId, type: 'heart', action: 'がハートを送りました', target: snippetPg(author.content ?? ''), postId: id });
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

  async getReplies(postId: number, userId?: string) {
    const client = await getPool().connect();
    try {
      const result = await client.query(
        'SELECT * FROM posts WHERE thread_id = $1 AND id != thread_id ORDER BY id',
        [postId]
      );
      const replies = await Promise.all(result.rows.map(rowToPost));
      const hidden = await getHiddenSlugs(client, userId);
      return hidden.size === 0 ? replies : replies.filter(r => !hidden.has(r.slug ?? ''));
    } finally {
      client.release();
    }
  },

  async addReply(postId: number, data: ReplyParams) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      // 同時投稿によるID重複(採番の競合)を防ぐため、ID採番からINSERTまでをアドバイザリロックで直列化する。
      await client.query('SELECT pg_advisory_xact_lock(42)');
      const slug = deriveSlugPg(data.displayName);
      const parentPostId = data.parentPostId ?? postId;
      const result = await client.query(
        `INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, content, created_at, avatar_color, has_image, image_src, image_alt, has_game, game_id, origin_type, checkered_dark)
         VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM posts), $1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          postId, parentPostId, data.displayName, slug, data.content,
          data.avatarColor || 'from-blue-500 to-indigo-600',
          data.hasImage || false, data.imageSrc || null, data.imageAlt || null,
          !!data.gameId, data.gameId || null, data.originType ?? null, data.checkeredDark != null ? (data.checkeredDark ? 1 : 0) : null
        ]
      );
      await client.query(
        'UPDATE posts SET replies_count = replies_count + 1 WHERE id = $1',
        [postId]
      );
      const parentRes = await client.query('SELECT display_name FROM posts WHERE id = $1', [parentPostId]);
      const parentAuthor = parentRes.rows[0]?.display_name;
      if (parentAuthor) {
        await insertNotificationPg(client, { recipientId: parentAuthor, actor: data.displayName, type: 'reply', action: 'が返信しました', target: snippetPg(data.content), postId: result.rows[0].id });
      }
      const mentions = data.content.match(/@([A-Za-z0-9]+)/g);
      if (mentions) {
        const seen = new Set<string>();
        const mentionPromises = [];
        for (const m of mentions) {
          const slug = m.slice(1);
          if (seen.has(slug)) continue;
          seen.add(slug);
          mentionPromises.push((async () => {
            const mres = await client.query('SELECT display_name FROM posts WHERE slug = $1 LIMIT 1', [slug]);
            const mname = mres.rows[0]?.display_name;
            if (mname && mname !== parentAuthor) {
              await insertNotificationPg(client, { recipientId: mname, actor: data.displayName, type: 'mention', action: 'があなたにメンションしました', target: snippetPg(data.content), postId: result.rows[0].id });
            }
          })());
        }
        await Promise.all(mentionPromises);
      }
      await client.query('COMMIT');
      return await rowToPost(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async editPost(id: number, userId: string, content: string, originType?: OriginType | null, imageSrc?: string, checkeredDark?: boolean) {
    const client = await getPool().connect();
    try {
      const [postResult, viewerSlug] = await Promise.all([
        client.query('SELECT slug, display_name, content, origin_type FROM posts WHERE id = $1', [id]),
        resolveViewerSlug(client, userId)
      ]);
      if (postResult.rows.length === 0) return null;
      const row = postResult.rows[0];
      if (row.display_name !== userId && row.slug !== viewerSlug) return null;

      const hasContentChanged = row.content !== content;
      const hasOriginTypeChanged = originType !== undefined && (row.origin_type !== (originType ?? null));
      const shouldMarkEdited = hasContentChanged || hasOriginTypeChanged || imageSrc !== undefined;

      const sets: string[] = ['content = $1'];
      const values: unknown[] = [content];
      if (originType !== undefined) {
        sets.push(`origin_type = $${values.length + 1}`);
        values.push(originType);
      }
      if (imageSrc !== undefined) {
        sets.push(`image_src = $${values.length + 1}`);
        values.push(imageSrc);
      }
      if (checkeredDark !== undefined) {
        sets.push(`checkered_dark = $${values.length + 1}`);
        values.push(checkeredDark ? 1 : 0);
      }
      if (shouldMarkEdited) sets.push('is_edited = TRUE');
      values.push(id);
      await client.query(`UPDATE posts SET ${sets.join(', ')} WHERE id = $${values.length}`, values);

      return await getPostWithVotes(client, id, userId);
    } finally {
      client.release();
    }
  },

  async deletePost(id: number, userId: string) {
    const client = await getPool().connect();
    try {
      const postResult = await client.query('SELECT * FROM posts WHERE id = $1', [id]);
      if (postResult.rows.length === 0) return false;
      const post = postResult.rows[0];
      const viewerSlug = await resolveViewerSlug(client, userId);
      if (post.display_name !== userId && post.slug !== viewerSlug) return false;

      const isReply = post.parent_post_id != null && post.thread_id !== post.id;
      const childCount = await client.query('SELECT COUNT(*) AS cnt FROM posts WHERE thread_id = $1 AND id != thread_id', [id]);
      const hasChildren = parseInt(childCount.rows[0].cnt, 10) > 0;

      if (!isReply && hasChildren) {
        await client.query(
          `UPDATE posts SET content = '(削除されました)', has_image = false, image_src = NULL, has_game = false, game_id = NULL WHERE id = $1`,
          [id]
        );
      } else {
        await client.query('DELETE FROM posts WHERE id = $1', [id]);
        if (isReply) {
          await client.query('UPDATE posts SET replies_count = GREATEST(replies_count - 1, 0) WHERE id = $1', [post.thread_id]);
        }
      }
      return true;
    } finally {
      client.release();
    }
  },

  async deleteMessage(id: number, userId: string) {
    const client = await getPool().connect();
    try {
      const msgResult = await client.query('SELECT sender FROM messages WHERE id = $1', [id]);
      if (msgResult.rows.length === 0) return false;
      const sender = msgResult.rows[0].sender;
      const viewerSlug = await resolveViewerSlug(client, userId);
      if (sender !== userId && deriveSlugPg(sender) !== viewerSlug) return false;
      await client.query('DELETE FROM messages WHERE id = $1', [id]);
      return true;
    } finally {
      client.release();
    }
  },

  async getLikedPosts(userId: string) {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT p.*,
          COALESCE(au.display_name, p.display_name) as display_name,
          au.avatar_url as avatar_url,
          COALESCE(pv.vote_type = 'like', false) as liked,
          COALESCE(pv.vote_type = 'dislike', false) as disliked,
          (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
        FROM posts p
        LEFT JOIN anonymous_users au ON p.slug = au.slug
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
      const result = await client.query(`
        SELECT p.*,
          COALESCE(au.display_name, p.display_name) as display_name,
          au.avatar_url as avatar_url,
          COALESCE(pv.vote_type = 'like', false) as liked,
          COALESCE(pv.vote_type = 'dislike', false) as disliked,
          (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
        FROM posts p
        LEFT JOIN anonymous_users au ON p.slug = au.slug
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
      const result = await client.query(`
        SELECT p.*,
          COALESCE(au.display_name, p.display_name) as display_name,
          au.avatar_url as avatar_url,
          false as liked,
          false as disliked,
          (SELECT COUNT(*) FROM post_hearts ph2 WHERE ph2.post_id = p.id) as hearts_total
        FROM posts p
        LEFT JOIN anonymous_users au ON p.slug = au.slug
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
      let result;
      if (userId) {
        result = await client.query(`
          SELECT p.*,
            COALESCE(au.display_name, p.display_name) as display_name,
            au.avatar_url as avatar_url,
            COALESCE(pv.vote_type = 'like', false) as liked,
            COALESCE(pv.vote_type = 'dislike', false) as disliked,
            (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
          FROM posts p
          LEFT JOIN anonymous_users au ON p.slug = au.slug
          LEFT JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = $1
          WHERE p.slug = $2
          ORDER BY p.id DESC
        `, [userId, slug]);
      } else {
        result = await client.query(`
          SELECT p.*,
            COALESCE(au.display_name, p.display_name) as display_name,
            au.avatar_url as avatar_url,
            false as liked,
            false as disliked,
            (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
          FROM posts p
          LEFT JOIN anonymous_users au ON p.slug = au.slug
          WHERE p.slug = $1
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
      const r1 = await client.query('SELECT display_name FROM anonymous_users WHERE slug = $1 LIMIT 1', [slug]);
      if (r1.rows.length > 0) return r1.rows[0].display_name;
      const result = await client.query('SELECT display_name FROM posts WHERE slug = $1 LIMIT 1', [slug]);
      return result.rows[0]?.display_name;
    } finally {
      client.release();
    }
  },

  async getUserAvatarUrl(slug: string) {
    const client = await getPool().connect();
    try {
      const r = await client.query('SELECT avatar_url FROM anonymous_users WHERE slug = $1 LIMIT 1', [slug]);
      return r.rows.length > 0 ? r.rows[0].avatar_url || undefined : undefined;
    } finally {
      client.release();
    }
  },

  async getUserBio(slug: string) {
    const client = await getPool().connect();
    try {
      const r = await client.query('SELECT bio FROM anonymous_users WHERE slug = $1 LIMIT 1', [slug]);
      return r.rows.length > 0 ? r.rows[0].bio || undefined : undefined;
    } finally {
      client.release();
    }
  },

  async listOshiItems(userSlug: string) {
    const client = await getPool().connect();
    try {
      const r = await client.query('SELECT * FROM oshi_items WHERE user_slug = $1 ORDER BY position ASC, id ASC', [userSlug]);
      return r.rows.map(rowToOshiItemPg);
    } finally {
      client.release();
    }
  },

  async addOshiItem(userSlug: string, data) {
    const client = await getPool().connect();
    try {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const posRes = await client.query('SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM oshi_items WHERE user_slug = $1', [userSlug]);
      const position = posRes.rows[0].next_pos;
      const result = await client.query(
        `INSERT INTO oshi_items (id, user_slug, kind, track_id, collection_id, artist_id, title, subtitle, artwork_url, view_url, preview_url, position, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
         RETURNING *`,
        [id, userSlug, data.kind, data.trackId ?? null, data.collectionId ?? null, data.artistId ?? null, data.title, data.subtitle ?? null, data.artworkUrl ?? null, data.viewUrl ?? null, data.previewUrl ?? null, position]
      );
      return rowToOshiItemPg(result.rows[0]);
    } finally {
      client.release();
    }
  },

  async removeOshiItem(userSlug: string, id: number) {
    const client = await getPool().connect();
    try {
      await client.query('DELETE FROM oshi_items WHERE id = $1 AND user_slug = $2', [id, userSlug]);
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
      return result.rows.map((r: any) => {
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
          recipientId: r.target_user ?? undefined,
          read: !!r.read,
          createdAt,
          time: formatRelativeTime(createdAt),
        } as Notification;
      });
    } finally {
      client.release();
    }
  },

  async markNotificationRead(id: number, userId: string) {
    const client = await getPool().connect();
    try {
      await client.query('UPDATE notifications SET read = true WHERE id = $1 AND target_user = $2', [id, userId]);
    } finally { client.release(); }
  },

  async markAllNotificationsRead(userId: string) {
    const client = await getPool().connect();
    try {
      await client.query('UPDATE notifications SET read = true WHERE target_user = $1', [userId]);
    } finally { client.release(); }
  },

  async deleteNotification(id: number, userId: string) {
    const client = await getPool().connect();
    try {
      await client.query('DELETE FROM notifications WHERE id = $1 AND target_user = $2', [id, userId]);
    } finally { client.release(); }
  },

  async getUnreadCount(userId: string) {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT COUNT(*) AS cnt FROM notifications WHERE target_user = $1 AND read = false', [userId]);
      return parseInt(result.rows[0].cnt, 10);
    } finally { client.release(); }
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
      return result.rows.map((r: any) => {
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
          FROM (
            SELECT regexp_replace(
              regexp_replace(content, '^#(mml|MML作曲)[^\\n]*(\\n|$)', '', 'gni'),
              'https?://[^\\s]+|www\\.[^\\s]+', '', 'gi'
            ) AS cleaned_content
            FROM posts
          ) p, LATERAL regexp_matches(p.cleaned_content, '#[^\\s#]+', 'g') AS m
          WHERE m[1] != '#'
            AND m[1] !~ '^#\\d+$'
            AND m[1] !~ '^#[\\x21-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\x7e]+$'
            AND m[1] !~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'
          GROUP BY m[1]
          ORDER BY count DESC
          LIMIT 10
        `);
      } catch {
        result = { rows: [] };
      }
      return result.rows.map((r: any) => ({
        keyword: r.keyword,
        count: parseInt(r.count, 10),
      } as Trend));
    } finally {
      client.release();
    }
  },

  async searchPosts(query: string, userId?: string) {
    if (!query.trim()) return [];
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT p.*,
          COALESCE(au.display_name, p.display_name) as display_name,
          au.avatar_url as avatar_url,
          false as liked,
          false as disliked,
          (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
        FROM posts p
        LEFT JOIN anonymous_users au ON p.slug = au.slug
        WHERE p.thread_id = p.id
          AND (p.content ILIKE $1 OR p.display_name ILIKE $1 OR au.display_name ILIKE $1)
          AND COALESCE((SELECT au2.hide_from_search FROM anonymous_users au2 WHERE au2.slug = p.slug LIMIT 1), false) = false
        ORDER BY p.id DESC
      `, [`%${query}%`]);
      const [posts, hidden] = await Promise.all([
        Promise.all(result.rows.map(rowToPost)),
        getHiddenSlugs(client, userId)
      ]);
      return hidden.size === 0 ? posts : posts.filter(p => !hidden.has(p.slug ?? ''));
    } finally {
      client.release();
    }
  },

  async getPostsByHashtag(tag: string, userId?: string) {
    const normalized = tag.startsWith('#') ? tag : `#${tag}`;
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT p.*,
          COALESCE(au.display_name, p.display_name) as display_name,
          au.avatar_url as avatar_url,
          false as liked,
          false as disliked,
          (SELECT COUNT(*) FROM post_hearts ph WHERE ph.post_id = p.id) as hearts_total
        FROM posts p
        LEFT JOIN anonymous_users au ON p.slug = au.slug
        WHERE p.thread_id = p.id
          AND p.content ~ ('(^|[[:space:]])' || $1 || '([[:space:]]|$)')
          AND COALESCE((SELECT au.hide_from_search FROM anonymous_users au WHERE au.slug = p.slug LIMIT 1), false) = false
        ORDER BY p.id DESC
      `, [normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')]);
      const [posts, hidden] = await Promise.all([
        Promise.all(result.rows.map(rowToPost)),
        getHiddenSlugs(client, userId)
      ]);
      return hidden.size === 0 ? posts : posts.filter(p => !hidden.has(p.slug ?? ''));
    } finally {
      client.release();
    }
  },

  async getOrCreateAnonymousUser(sessionId: string, ipAddress: string) {
    const client = await getPool().connect();
    try {

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
          avatarUrl: row.avatar_url ?? undefined,
          bio: row.bio ?? undefined,
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
          avatarUrl: row.avatar_url ?? undefined,
          bio: row.bio ?? undefined,
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
        avatarUrl: undefined,
        createdAt: new Date().toISOString(),
      } as AnonymousUser;
    } finally {
      client.release();
    }
  },

  async updateUserDisplayName(userId: string, displayName: string, avatarUrl?: string, bio?: string) {
    const client = await getPool().connect();
    try {
      let userRes = await client.query('SELECT id, slug FROM anonymous_users WHERE id = $1', [userId]);
      if (userRes.rows.length === 0) {
        userRes = await client.query('SELECT id, slug FROM anonymous_users WHERE slug = $1', [userId]);
      }
      if (userRes.rows.length === 0) {
        userRes = await client.query('SELECT id, slug FROM anonymous_users WHERE display_name = $1', [userId]);
      }
      if (userRes.rows.length === 0) {
        return;
      }
      const realId = userRes.rows[0].id;
      const oldSlug = userRes.rows[0].slug;

      const slug = deriveSlugPg(displayName);
      const sets = ['display_name = $1', 'slug = $2'];
      const values: unknown[] = [displayName, slug];
      if (avatarUrl !== undefined) {
        sets.push(`avatar_url = $${values.length + 1}`);
        values.push(avatarUrl);
      }
      if (bio !== undefined) {
        sets.push(`bio = $${values.length + 1}`);
        values.push(bio);
      }
      values.push(realId);
      await client.query(`UPDATE anonymous_users SET ${sets.join(', ')} WHERE id = $${values.length}`, values);

      if (oldSlug) {
        await client.query(
          'UPDATE posts SET display_name = $1, slug = $2 WHERE slug = $3',
          [displayName, slug, oldSlug]
        );
      }
    } finally {
      client.release();
    }
  },

  async getUserSettings(slug: string) {
    const client = await getPool().connect();
    try {
      const r = await client.query('SELECT is_private, hide_from_search, hide_reactions FROM anonymous_users WHERE slug = $1 LIMIT 1', [slug]);
      const row = r.rows[0];
      return {
        isPrivate: !!row?.is_private,
        hideFromSearch: !!row?.hide_from_search,
        hideReactions: !!row?.hide_reactions,
      };
    } finally {
      client.release();
    }
  },

  async updateUserSettings(slug: string, settings: Partial<{ isPrivate: boolean; hideFromSearch: boolean; hideReactions: boolean }>) {
    const client = await getPool().connect();
    try {
      const sets: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (settings.isPrivate !== undefined) { sets.push(`is_private = $${i++}`); vals.push(settings.isPrivate); }
      if (settings.hideFromSearch !== undefined) { sets.push(`hide_from_search = $${i++}`); vals.push(settings.hideFromSearch); }
      if (settings.hideReactions !== undefined) { sets.push(`hide_reactions = $${i++}`); vals.push(settings.hideReactions); }
      if (sets.length === 0) return;
      vals.push(slug);
      await client.query(`UPDATE anonymous_users SET ${sets.join(', ')} WHERE slug = $${i}`, vals);
    } finally {
      client.release();
    }
  },

  async issueMigrationToken(userId: string) {
    const client = await getPool().connect();
    try {
      const token = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      await client.query('INSERT INTO migration_tokens (token, user_id) VALUES ($1, $2)', [token, userId]);
      return token;
    } finally {
      client.release();
    }
  },

  async redeemMigrationToken(token: string, newSessionId: string) {
    const client = await getPool().connect();
    try {
      const r = await client.query('SELECT user_id FROM migration_tokens WHERE token = $1', [token]);
      if (r.rows.length === 0) return null;
      const userId = r.rows[0].user_id;
      const ur = await client.query('SELECT * FROM anonymous_users WHERE id = $1', [userId]);
      if (ur.rows.length === 0) return null;
      await client.query('UPDATE anonymous_users SET session_id = $1, last_seen_at = NOW() WHERE id = $2', [newSessionId, userId]);
      await client.query('DELETE FROM migration_tokens WHERE token = $1', [token]);
      const row = ur.rows[0];
      return {
        id: row.id,
        displayName: row.display_name,
        slug: row.slug,
        avatarColor: row.avatar_color,
        createdAt: typeof row.created_at === 'object' && row.created_at?.toISOString ? row.created_at.toISOString() : String(row.created_at),
      } as AnonymousUser;
    } finally {
      client.release();
    }
  },

  async followUser(followerId: string, followedId: string) {
    const client = await getPool().connect();
    try {
      const ins = await client.query(
        'INSERT INTO user_follows (follower_id, followed_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [followerId, followedId]
      );
      if (ins.rowCount && ins.rowCount > 0) {
        await insertNotificationPg(client, { recipientId: followedId, actor: followerId, type: 'follow', action: 'がフォローしました', target: '' });
      }
    } finally {
      client.release();
    }
  },

  async unfollowUser(followerId: string, followedId: string) {
    const client = await getPool().connect();
    try {
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

  async blockUser(blockerSlug: string, blockedSlug: string) {
    if (blockerSlug === blockedSlug) return;
    const client = await getPool().connect();
    try {
      await client.query(
        'INSERT INTO user_blocks (blocker_slug, blocked_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [blockerSlug, blockedSlug]
      );
    } finally { client.release(); }
  },

  async unblockUser(blockerSlug: string, blockedSlug: string) {
    const client = await getPool().connect();
    try {
      await client.query('DELETE FROM user_blocks WHERE blocker_slug = $1 AND blocked_slug = $2', [blockerSlug, blockedSlug]);
    } finally { client.release(); }
  },

  async getBlockedSlugs(blockerSlug: string) {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT blocked_slug FROM user_blocks WHERE blocker_slug = $1', [blockerSlug]);
      return result.rows.map((r: any) => r.blocked_slug);
    } finally { client.release(); }
  },

  async muteUser(muterSlug: string, mutedSlug: string) {
    if (muterSlug === mutedSlug) return;
    const client = await getPool().connect();
    try {
      await client.query(
        'INSERT INTO user_mutes (muter_slug, muted_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [muterSlug, mutedSlug]
      );
    } finally { client.release(); }
  },

  async unmuteUser(muterSlug: string, mutedSlug: string) {
    const client = await getPool().connect();
    try {
      await client.query('DELETE FROM user_mutes WHERE muter_slug = $1 AND muted_slug = $2', [muterSlug, mutedSlug]);
    } finally { client.release(); }
  },

  async getMutedSlugs(muterSlug: string) {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT muted_slug FROM user_mutes WHERE muter_slug = $1', [muterSlug]);
      return result.rows.map((r: any) => r.muted_slug);
    } finally { client.release(); }
  },

  async reportContent(data: ReportParams) {
    const client = await getPool().connect();
    try {
      await client.query(
        'INSERT INTO reports (reporter_slug, target_type, target_id, reason) VALUES ($1, $2, $3, $4)',
        [data.reporterSlug, data.targetType, data.targetId, data.reason]
      );
    } finally { client.release(); }
  },

  async createGame(data) {
    const client = await getPool().connect();
    try {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const now = new Date().toISOString();
      await client.query(
        `INSERT INTO games (id, preset, title, manifest, created_at, creator_slug) VALUES ($1, $2, $3, $4, NOW(), $5)`,
        [id, data.preset, data.title, JSON.stringify(data.manifest), data.creatorSlug || null]
      );
      return { id, preset: data.preset, title: data.title, manifest: data.manifest, createdAt: now, creatorSlug: data.creatorSlug };
    } finally {
      client.release();
    }
  },

  async getGame(id) {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT * FROM games WHERE id = $1', [id]);
      if (result.rows.length === 0) return null;
      const r = result.rows[0];
      const createdAt = typeof r.created_at === 'object' ? r.created_at.toISOString() : String(r.created_at);
      return { id: r.id, preset: r.preset, title: r.title, manifest: JSON.parse(r.manifest), createdAt, creatorSlug: r.creator_slug ?? undefined };
    } finally {
      client.release();
    }
  },

  async updateGame(id, data) {
    const client = await getPool().connect();
    try {
      const result = await client.query(
        `UPDATE games SET title = $1, manifest = $2 WHERE id = $3 RETURNING *`,
        [data.title, JSON.stringify(data.manifest), id]
      );
      if (result.rows.length === 0) return null;
      const r = result.rows[0];
      const createdAt = typeof r.created_at === 'object' ? r.created_at.toISOString() : String(r.created_at);
      return { id: r.id, preset: r.preset, title: r.title, manifest: JSON.parse(r.manifest), createdAt, creatorSlug: r.creator_slug ?? undefined };
    } finally {
      client.release();
    }
  },

  async listAllGames() {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT * FROM games ORDER BY id DESC');
      return result.rows.map((r: any) => {
        const createdAt = typeof r.created_at === 'object' ? r.created_at.toISOString() : String(r.created_at);
        return { id: r.id, preset: r.preset, title: r.title, manifest: JSON.parse(r.manifest), createdAt };
      });
    } finally {
      client.release();
    }
  },

  async getLiveGameInfo(ipAddress: string) {
    const client = await getPool().connect();
    try {
      const slot = new Date().toISOString().slice(0, 13);
      const schedResult = await client.query('SELECT game_id FROM game_schedule WHERE hour_slot = $1', [slot]);
      let gameId: number | null = null;
      if (schedResult.rows.length > 0) {
        gameId = schedResult.rows[0].game_id;
      } else {
        const lastSlot = new Date(Date.now() - 3600000).toISOString().slice(0, 13);
        const voteResult = await client.query('SELECT game_id, COUNT(*) as cnt FROM game_votes WHERE hour_slot = $1 GROUP BY game_id ORDER BY cnt DESC LIMIT 1', [lastSlot]);
        if (voteResult.rows.length > 0) {
          gameId = voteResult.rows[0].game_id;
        } else {
          const randResult = await client.query('SELECT id FROM games ORDER BY RANDOM() LIMIT 1');
          if (randResult.rows.length > 0) gameId = randResult.rows[0].id;
        }
        if (gameId) {
          await client.query('INSERT INTO game_schedule (hour_slot, game_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [slot, gameId]);
        }
      }
      let gameTitle = '', gamePreset = '';
      if (gameId) {
        const gr = await client.query('SELECT preset, title FROM games WHERE id = $1', [gameId]);
        if (gr.rows.length > 0) { gameTitle = gr.rows[0].title; gamePreset = gr.rows[0].preset; }
      }
      const allGames = await client.query('SELECT id, preset, title, created_at FROM games ORDER BY id DESC');
      const vcResult = await client.query('SELECT game_id, COUNT(*) as cnt FROM game_votes WHERE hour_slot = $1 GROUP BY game_id', [slot]);
      const voteCounts = new Map(vcResult.rows.map((r: any) => [String(r.game_id), Number(r.cnt)]));
      const myVoteResult = await client.query('SELECT game_id FROM game_votes WHERE ip_address = $1 AND hour_slot = $2', [ipAddress, slot]);
      const myVote = myVoteResult.rows.length > 0 ? myVoteResult.rows[0].game_id : null;
      const nextCandidates = allGames.rows.map((g: any) => {
        const createdAt = typeof g.created_at === 'object' ? g.created_at.toISOString() : String(g.created_at);
        return { game: { id: g.id, preset: g.preset, title: g.title, createdAt }, votes: voteCounts.get(String(g.id)) ?? 0 };
      }).sort((a: any, b: any) => b.votes - a.votes);
      let postId: number | null = null;
      if (gameId) {
        const pr = await client.query('SELECT id FROM posts WHERE game_id = $1 ORDER BY id ASC LIMIT 1', [gameId]);
        if (pr.rows.length > 0) postId = pr.rows[0].id;
      }
      return { gameId: gameId as number | null, gameTitle, gamePreset, hourSlot: slot, postId, nextCandidates, myVote };
    } finally {
      client.release();
    }
  },

  async voteGame(gameId: number, ipAddress: string) {
    const client = await getPool().connect();
    try {
      const slot = new Date().toISOString().slice(0, 13);
      await client.query('INSERT INTO game_votes (game_id, ip_address, hour_slot) VALUES ($1, $2, $3) ON CONFLICT (ip_address, hour_slot) DO UPDATE SET game_id = $1', [gameId, ipAddress, slot]);
    } finally {
      client.release();
    }
  },

  async updatePlayerPosition(sessionId: string, gameId: number, x: number, y: number, emoji: string) {
    const client = await getPool().connect();
    try {
      await client.query('INSERT INTO game_players (session_id, game_id, x, y, emoji, updated_at) VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (session_id, game_id) DO UPDATE SET x=$3, y=$4, emoji=$5, updated_at=NOW()', [sessionId, gameId, x, y, emoji]);
      await client.query("DELETE FROM game_players WHERE updated_at < NOW() - INTERVAL '15 seconds'");
    } finally {
      client.release();
    }
  },

  async getGamePlayers(gameId: number, excludeSession: string) {
    const client = await getPool().connect();
    try {
      const result = await client.query("SELECT * FROM game_players WHERE game_id = $1 AND session_id != $2 AND updated_at > NOW() - INTERVAL '10 seconds'", [gameId, excludeSession]);
      return result.rows.map((r: any) => ({ sessionId: r.session_id, x: r.x, y: r.y, emoji: r.emoji, updatedAt: r.updated_at?.toISOString?.() }));
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
  let result = '';
  for (let i = 0; i < 15; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

function randomGradientPg(): string {
  return AVATAR_GRADIENTS_PG[Math.floor(Math.random() * AVATAR_GRADIENTS_PG.length)];
}
