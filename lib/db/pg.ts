import { neon, neonConfig } from '@neondatabase/serverless';
import { AnonymousUser, OriginType } from '../types';
import { DbPost as Post, DbNotification as Notification, DbOshiItem } from '../types-db';
import type { Message, Trend } from '../mock-db';
import type { DataStore, CreatePostParams, ReplyParams, MessageParams, ReportParams } from './interface';
import { formatRelativeTime } from '../time';
import { publishRealtime } from '../realtime/publish';
import { chUser } from '../realtime/channels';

// Worker環境で Fetch API を明示的に使用するように設定
neonConfig.fetchConnectionCache = true;

export function getDb() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://neon:neon@localhost:5432/unj_reze';
  return neon(connectionString, { fullResults: true });
}

function getClient() {
  const sql = getDb();
  return {
    async query(text: string, params: any[] = []) {
      const res = await sql.query(text, params, { fullResults: true });
      return res as { rows: any[]; rowCount?: number; fields?: any[]; command?: string };
    },
    release() {}
  };
}

function getPool(): { connect: () => Promise<ReturnType<typeof getClient>> } {
  return {
    connect: async () => getClient(),
  };
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

/**
 * 一覧系で転送する posts の列。`SELECT p.*` は Neon の下り転送量をそのまま食うので使わない。
 * - display_name は COALESCE(au.display_name, p.display_name) を別名で足すので含めない。
 * - liked / disliked は post_votes 由来の値で必ず上書きされる死に列なので含めない。
 */
const POST_COLUMNS = [
  'p.id', 'p.thread_id', 'p.parent_post_id', 'p.slug', 'p.created_at', 'p.content',
  'p.likes', 'p.dislikes', 'p.replies_count', 'p.reposts', 'p.reposted',
  'p.has_image', 'p.image_src', 'p.image_alt', 'p.avatar_color', 'p.has_collab_button',
  'p.hearts_total', 'p.has_game', 'p.game_id', 'p.origin_type',
  'p.is_false_declaration', 'p.is_edited',
].join(', ');

/**
 * フィード1スレッドあたりに載せる返信の上限。スレッドが伸びても転送量が線形に増えないようにする。
 *
 * 一時期 CPU 都合で 5 件まで絞っていたが、ID を sqids から生の数値に変えて
 * エンコード費用が消えた（lib/sqids.ts 参照）ため、転送量基準の 20 件へ戻した。
 */
const FEED_REPLIES_PER_THREAD = 20;

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
    threadId: row.thread_id,
    parentPostId: row.parent_post_id ?? undefined,
    replies: [],
  };
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

async function getThreadReplies(client: any, threadIds: number[]): Promise<Map<number, Post[]>> {
  if (threadIds.length === 0) return new Map();
  // スレッドごとに新しい順で FEED_REPLIES_PER_THREAD 件までに絞ってから取り出す。
  // 絞らないと「500レスのスレッド」がフィードのポーリングのたびに丸ごと流れる。
  const result = await client.query(
    `SELECT * FROM (
       SELECT ${POST_COLUMNS},
         COALESCE(au.display_name, p.display_name) as display_name,
         au.avatar_url as avatar_url,
         ROW_NUMBER() OVER (PARTITION BY p.thread_id ORDER BY p.id DESC) AS rn
       FROM posts p
       LEFT JOIN anonymous_users au ON p.slug = au.slug
       WHERE p.thread_id = ANY($1::bigint[]) AND p.id != p.thread_id
     ) t
     WHERE t.rn <= $2
     ORDER BY t.id`,
    [threadIds, FEED_REPLIES_PER_THREAD]
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

/**
 * フィードのスレッド一覧。
 *
 * `beforeId` はキーセット（カーソル）ページング用で、「そのIDより古いスレッド」を返す。
 * OFFSET を使わないのは、件数が増えるほど読み飛ばしぶんのコストが増えるのと、
 * 読み込み中に新規投稿が入ると境界がずれて重複・取りこぼしが起きるため。
 */
async function getPostsWithVotes(client: any, userId?: string, limit?: number, beforeId?: number): Promise<Post[]> {
  let result;
  const safeLimit = Math.max(1, Math.min(limit || 20, 50));
  const limitClause = ` LIMIT ${safeLimit}`;
  const cursor = beforeId ?? null;
  if (userId) {
    result = await client.query(`
      SELECT ${POST_COLUMNS},
        COALESCE(au.display_name, p.display_name) as display_name,
        au.avatar_url as avatar_url,
        COALESCE(pv.vote_type = 'like', false) as liked,
        COALESCE(pv.vote_type = 'dislike', false) as disliked
      FROM posts p
      LEFT JOIN anonymous_users au ON p.slug = au.slug
      LEFT JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = $1
      WHERE p.thread_id = p.id
        AND ($2::bigint IS NULL OR p.id < $2::bigint)
      ORDER BY p.id DESC${limitClause}
    `, [userId, cursor]);
  } else {
    result = await client.query(`
      SELECT ${POST_COLUMNS},
        COALESCE(au.display_name, p.display_name) as display_name,
        au.avatar_url as avatar_url,
        false as liked,
        false as disliked
      FROM posts p
      LEFT JOIN anonymous_users au ON p.slug = au.slug
      WHERE p.thread_id = p.id
        AND ($1::bigint IS NULL OR p.id < $1::bigint)
      ORDER BY p.id DESC${limitClause}
    `, [cursor]);
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

/**
 * 単体の投稿を取得する。
 * `withReplies` が false のときは返信を読まない — いいね/ハートのように「更新後の1件を返すだけ」の
 * 経路でスレッド全体を引き直すと、書き込みのたびにスレッド丸ごとの転送が発生する。
 */
async function getPostWithVotes(client: any, id: number, userId?: string, withReplies = true): Promise<Post | null> {
  let result;
  if (userId) {
    result = await client.query(`
      SELECT ${POST_COLUMNS},
        COALESCE(au.display_name, p.display_name) as display_name,
        au.avatar_url as avatar_url,
        COALESCE(pv.vote_type = 'like', false) as liked,
        COALESCE(pv.vote_type = 'dislike', false) as disliked
      FROM posts p
      LEFT JOIN anonymous_users au ON p.slug = au.slug
      LEFT JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = $1
      WHERE p.id = $2
    `, [userId, id]);
  } else {
    result = await client.query(`
      SELECT ${POST_COLUMNS},
        COALESCE(au.display_name, p.display_name) as display_name,
        au.avatar_url as avatar_url,
        false as liked,
        false as disliked
      FROM posts p
      LEFT JOIN anonymous_users au ON p.slug = au.slug
      WHERE p.id = $1
    `, [id]);
  }

  if (result.rows.length === 0) return null;
  const post = await rowToPost(result.rows[0]);

  if (withReplies && post.threadId === post.id) {
    // It's a thread, load replies
    const repliesResult = await client.query(
      `SELECT ${POST_COLUMNS},
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
    // 通知はすべてこの関数を通るので、ここで push すれば いいね/ハート/返信/メンション/フォロー を
    // まとめて拾える。宛先本人だけに「1件届いた」と知らせ、中身の取得はクライアントに任せる
    // （このイベント自体に通知本文を載せると、他人の投稿内容がハブ経由で広がりうるため）。
    // トランザクションがこの後ロールバックした場合は空振りの再取得になるだけで害はない。
    publishRealtime({
      channel: chUser(d.recipientId),
      event: 'notify',
      data: { type: d.type },
    });
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

const hiddenSlugsCache = new Map<string, { hidden: Set<string>; expiresAt: number }>();

export function clearHiddenSlugsCache(userId?: string) {
  if (userId) {
    hiddenSlugsCache.delete(userId);
  } else {
    hiddenSlugsCache.clear();
  }
}

/** 閲覧者に対して非表示にすべき slug 集合(自分がブロック/ミュート ＋ 自分をブロックした相手)。 */
async function getHiddenSlugs(client: any, userId?: string): Promise<Set<string>> {
  if (!userId) return new Set();
  const now = Date.now();
  const cached = hiddenSlugsCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.hidden;
  }
  const res = await client.query(
    `WITH viewer AS (
       SELECT slug FROM anonymous_users 
       WHERE id = $1 OR display_name = $1 OR slug = $1 
       LIMIT 1
     ),
     v_slug AS (
       SELECT COALESCE((SELECT slug FROM viewer), $1) as slug
     )
     SELECT blocker_slug as other_slug FROM user_blocks WHERE blocked_slug = (SELECT slug FROM v_slug)
     UNION
     SELECT blocked_slug as other_slug FROM user_blocks WHERE blocker_slug = (SELECT slug FROM v_slug)
     UNION
     SELECT muted_slug as other_slug FROM user_mutes WHERE muter_slug = (SELECT slug FROM v_slug)`,
    [userId]
  );
  const hidden = new Set<string>();
  for (const r of res.rows) {
    if (r.other_slug) hidden.add(r.other_slug);
  }
  hiddenSlugsCache.set(userId, { hidden, expiresAt: now + 60000 });
  return hidden;
}

export const pgStore: DataStore = {
  async getPosts(userId?: string, limit?: number, beforeId?: number) {
    const client = await getPool().connect();
    try {
      // Run posts query and hidden-slugs lookup concurrently — they are independent.
      const [posts, hidden] = await Promise.all([
        getPostsWithVotes(client, userId, limit, beforeId),
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
        `INSERT INTO posts (id, thread_id, display_name, slug, created_at, content, avatar_color, has_image, image_src, image_alt, has_collab_button, has_game, game_id, origin_type)
         VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM posts), (SELECT COALESCE(MAX(id), 0) + 1 FROM posts), $1, $2, NOW(), $3, $4, $5, $6, $7, true, $8, $9, $10)
         RETURNING *`,
        [data.displayName, slug, data.content, data.avatarColor || 'from-blue-500 to-indigo-600',
         data.hasImage || false, data.imageSrc || null, data.imageAlt || null,
         !!data.gameId, data.gameId || null, data.originType ?? null]
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
      // 行ロックと通知スニペットのためだけなので全列は引かない。
      const postResult = await client.query(
        'SELECT id, display_name, LEFT(content, 20) AS snippet FROM posts WHERE id = $1 FOR UPDATE',
        [id]
      );
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
        await insertNotificationPg(client, { recipientId: author.display_name, actor: userId, type: 'like', action: 'がいいねしました', target: author.snippet ?? '', postId: id });
      }

      await client.query('COMMIT');
      // 投票のレスポンスにスレッド全体の返信は要らない（クライアントはカウンタしか使わない）。
      return await getPostWithVotes(client, id, userId, false);
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
      const postResult = await client.query('SELECT id FROM posts WHERE id = $1 FOR UPDATE', [id]);
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
      // 投票のレスポンスにスレッド全体の返信は要らない（クライアントはカウンタしか使わない）。
      return await getPostWithVotes(client, id, userId, false);
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
      // 通知スニペットにしか使わないので content 全文は引かない（LEFT で20文字だけ）。
      const postResult = await client.query(
        'SELECT id, display_name, LEFT(content, 20) AS snippet FROM posts WHERE id = $1',
        [id]
      );
      if (postResult.rows.length === 0) return null;

      const n = Math.max(1, Math.floor(count) || 1);
      // count 回ぶんの INSERT を1往復にまとめる。Neon は HTTP 越しなので
      // 往復数がそのままレイテンシと転送量になる。
      await client.query(
        `INSERT INTO post_hearts (post_id, user_id)
         SELECT $1, $2 FROM generate_series(1, $3)`,
        [id, userId, n]
      );
      // 非正規化カウンタを更新して、一覧側の相関サブクエリ COUNT(*) を不要にする。
      await client.query('UPDATE posts SET hearts_total = COALESCE(hearts_total, 0) + $2 WHERE id = $1', [id, n]);

      const author = postResult.rows[0];
      await insertNotificationPg(client, { recipientId: author.display_name, actor: userId, type: 'heart', action: 'がハートを送りました', target: author.snippet ?? '', postId: id });
      return await getPostWithVotes(client, id, undefined, false);
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
        `SELECT ${POST_COLUMNS},
           COALESCE(au.display_name, p.display_name) as display_name,
           au.avatar_url as avatar_url
         FROM posts p
         LEFT JOIN anonymous_users au ON p.slug = au.slug
         WHERE p.thread_id = $1 AND p.id != p.thread_id ORDER BY p.id`,
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
        `INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, content, created_at, avatar_color, has_image, image_src, image_alt, has_game, game_id, origin_type)
         VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM posts), $1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          postId, parentPostId, data.displayName, slug, data.content,
          data.avatarColor || 'from-blue-500 to-indigo-600',
          data.hasImage || false, data.imageSrc || null, data.imageAlt || null,
          !!data.gameId, data.gameId || null, data.originType ?? null
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

  async editPost(id: number, userId: string, content: string, originType?: OriginType | null, imageSrc?: string) {
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
      const postResult = await client.query(
        'SELECT id, thread_id, parent_post_id, display_name, slug FROM posts WHERE id = $1',
        [id]
      );
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

  async getLikedPosts(userId: string, limit?: number) {
    const client = await getPool().connect();
    try {
      const safeLimit = Math.max(1, Math.min(limit || 20, 50));
      const result = await client.query(`
        SELECT ${POST_COLUMNS},
          COALESCE(au.display_name, p.display_name) as display_name,
          au.avatar_url as avatar_url,
          COALESCE(pv.vote_type = 'like', false) as liked,
          COALESCE(pv.vote_type = 'dislike', false) as disliked
        FROM posts p
        LEFT JOIN anonymous_users au ON p.slug = au.slug
        JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = $1 AND pv.vote_type = 'like'
        ORDER BY p.id DESC
        LIMIT ${safeLimit}
      `, [userId]);
      return Promise.all(result.rows.map(rowToPost));
    } finally {
      client.release();
    }
  },

  async getDislikedPosts(userId: string, limit?: number) {
    const client = await getPool().connect();
    try {
      const safeLimit = Math.max(1, Math.min(limit || 20, 50));
      const result = await client.query(`
        SELECT ${POST_COLUMNS},
          COALESCE(au.display_name, p.display_name) as display_name,
          au.avatar_url as avatar_url,
          COALESCE(pv.vote_type = 'like', false) as liked,
          COALESCE(pv.vote_type = 'dislike', false) as disliked
        FROM posts p
        LEFT JOIN anonymous_users au ON p.slug = au.slug
        JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = $1 AND pv.vote_type = 'dislike'
        ORDER BY p.id DESC
        LIMIT ${safeLimit}
      `, [userId]);
      return Promise.all(result.rows.map(rowToPost));
    } finally {
      client.release();
    }
  },

  async getHeartedPosts(userId: string, limit?: number) {
    const client = await getPool().connect();
    try {
      const safeLimit = Math.max(1, Math.min(limit || 20, 50));
      const result = await client.query(`
        SELECT ${POST_COLUMNS},
          COALESCE(au.display_name, p.display_name) as display_name,
          au.avatar_url as avatar_url,
          false as liked,
          false as disliked
        FROM posts p
        LEFT JOIN anonymous_users au ON p.slug = au.slug
        -- post_hearts は1ハート1行なので、そのままJOINすると同じ投稿がハート数だけ重複し、
        -- LIMITを食い潰して他の投稿が出てこなくなる。投稿単位に畳んでからJOINする。
        JOIN (SELECT DISTINCT post_id FROM post_hearts WHERE user_id = $1) ph ON ph.post_id = p.id
        ORDER BY p.id DESC
        LIMIT ${safeLimit}
      `, [userId]);
      return Promise.all(result.rows.map(rowToPost));
    } finally {
      client.release();
    }
  },

  async getUserPostsBySlug(slug: string, userId?: string, limit?: number) {
    const client = await getPool().connect();
    try {
      const safeLimit = Math.max(1, Math.min(limit || 20, 50));
      let result;
      if (userId) {
        result = await client.query(`
          SELECT ${POST_COLUMNS},
            COALESCE(au.display_name, p.display_name) as display_name,
            au.avatar_url as avatar_url,
            COALESCE(pv.vote_type = 'like', false) as liked,
            COALESCE(pv.vote_type = 'dislike', false) as disliked
          FROM posts p
          LEFT JOIN anonymous_users au ON p.slug = au.slug
          LEFT JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = $1
          WHERE p.slug = $2
          ORDER BY p.id DESC
          LIMIT ${safeLimit}
        `, [userId, slug]);
      } else {
        result = await client.query(`
          SELECT ${POST_COLUMNS},
            COALESCE(au.display_name, p.display_name) as display_name,
            au.avatar_url as avatar_url,
            false as liked,
            false as disliked
          FROM posts p
          LEFT JOIN anonymous_users au ON p.slug = au.slug
          WHERE p.slug = $1
          ORDER BY p.id DESC
          LIMIT ${safeLimit}
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

  async getNotifications(userId?: string) {
    const client = await getPool().connect();
    try {
      let result;
      if (userId) {
        result = await client.query(
          `SELECT n.*, COALESCE(au.display_name, n.user_name) as resolved_name
           FROM notifications n
           LEFT JOIN anonymous_users au ON n.user_name = au.id OR n.user_name = au.slug OR n.user_name = au.display_name
           WHERE n.target_user = $1 OR n.target_user = (SELECT slug FROM anonymous_users WHERE id = $1 LIMIT 1)
           ORDER BY n.created_at DESC LIMIT 20`,
          [userId]
        );
      } else {
        result = await client.query(
          `SELECT n.*, COALESCE(au.display_name, n.user_name) as resolved_name
           FROM notifications n
           LEFT JOIN anonymous_users au ON n.user_name = au.id OR n.user_name = au.slug OR n.user_name = au.display_name
           ORDER BY n.created_at DESC LIMIT 20`
        );
      }
      return result.rows.map((r: any) => {
        const createdAt = typeof r.created_at === 'object' && r.created_at?.toISOString
          ? r.created_at.toISOString()
          : String(r.created_at);
        return {
          id: r.id,
          user: r.resolved_name || r.user_name,
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

  async getMessages(userId?: string) {
    const client = await getPool().connect();
    try {
      let result;
      if (userId) {
        result = await client.query(
          `SELECT m.*, 
                  COALESCE(s.display_name, m.sender) as sender_name,
                  COALESCE(r.display_name, m.recipient) as recipient_name
           FROM messages m
           LEFT JOIN anonymous_users s ON m.sender = s.id OR m.sender = s.slug OR m.sender = s.display_name
           LEFT JOIN anonymous_users r ON m.recipient = r.id OR m.recipient = r.slug OR m.recipient = r.display_name
           WHERE m.sender = $1 OR m.recipient = $1 OR s.id = $1 OR r.id = $1 OR s.slug = $1 OR r.slug = $1
           ORDER BY m.created_at DESC LIMIT 50`,
          [userId]
        );
      } else {
        result = await client.query(
          `SELECT m.*, 
                  COALESCE(s.display_name, m.sender) as sender_name,
                  COALESCE(r.display_name, m.recipient) as recipient_name
           FROM messages m
           LEFT JOIN anonymous_users s ON m.sender = s.id OR m.sender = s.slug OR m.sender = s.display_name
           LEFT JOIN anonymous_users r ON m.recipient = r.id OR m.recipient = r.slug OR m.recipient = r.display_name
           WHERE m.recipient IS NOT NULL
           ORDER BY m.created_at DESC LIMIT 50`
        );
      }
      return result.rows.map((r: any) => {
        const createdAt = typeof r.created_at === 'object' && r.created_at?.toISOString
          ? r.created_at.toISOString()
          : String(r.created_at);
        return {
          id: r.id,
          sender: r.sender_name || r.sender,
          text: r.text,
          recipient: r.recipient_name || r.recipient || undefined,
          createdAt,
          time: formatRelativeTime(createdAt),
        } as Message;
      });
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

  async markNotificationRead(id: number, userId: string) {
    const client = await getPool().connect();
    try {
      await client.query('UPDATE notifications SET read = true WHERE id = $1 AND target_user = $2', [id, userId]);
    } finally { client.release(); }
  },

  async markAllNotificationsRead(userId: string) {
    const client = await getPool().connect();
    try {
      // read = false の行だけ更新する（自動既読で毎回呼ばれるため、全行の書き換えは避ける）
      await client.query('UPDATE notifications SET read = true WHERE target_user = $1 AND read = false', [userId]);
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

  async searchPosts(query: string, userId?: string, limit?: number) {
    if (!query.trim()) return [];
    const client = await getPool().connect();
    try {
      const safeLimit = Math.max(1, Math.min(limit || 20, 50));
      const result = await client.query(`
        SELECT ${POST_COLUMNS},
          COALESCE(au.display_name, p.display_name) as display_name,
          au.avatar_url as avatar_url,
          false as liked,
          false as disliked
        FROM posts p
        LEFT JOIN anonymous_users au ON p.slug = au.slug
        WHERE p.thread_id = p.id
          AND (p.content ILIKE $1 OR p.display_name ILIKE $1 OR au.display_name ILIKE $1)
          AND COALESCE((SELECT au2.hide_from_search FROM anonymous_users au2 WHERE au2.slug = p.slug LIMIT 1), false) = false
        ORDER BY p.id DESC
        LIMIT ${safeLimit}
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

  async getPostsByHashtag(tag: string, userId?: string, limit?: number) {
    const normalized = tag.startsWith('#') ? tag : `#${tag}`;
    const client = await getPool().connect();
    try {
      const safeLimit = Math.max(1, Math.min(limit || 20, 50));
      const result = await client.query(`
        SELECT ${POST_COLUMNS},
          COALESCE(au.display_name, p.display_name) as display_name,
          au.avatar_url as avatar_url,
          false as liked,
          false as disliked
        FROM posts p
        LEFT JOIN anonymous_users au ON p.slug = au.slug
        WHERE p.thread_id = p.id
          AND p.content ~ ('(^|[[:space:]])' || $1 || '([[:space:]]|$)')
          AND COALESCE((SELECT au.hide_from_search FROM anonymous_users au WHERE au.slug = p.slug LIMIT 1), false) = false
        ORDER BY p.id DESC
        LIMIT ${safeLimit}
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

      // 注意: 以前は ip_address が一致する既存ユーザーに割り当てる同一IPフォールバックがあったが、
      // Netlify環境ではロードバランサーのアドレスしか取得できず（context.ip 含む）、
      // 全訪問者が同一IPとして扱われ他人のアカウントに merge される実害があったため削除。
      // ip_address 自体は分析/レート制限用に引き続き保存するが、本人確認には使わない。

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
      // 同一ユーザーを id / display_name / slug の別表記で指した自己フォローを防ぐ。
      const [followerSlug, followedSlug] = await Promise.all([
        resolveViewerSlug(client, followerId),
        resolveViewerSlug(client, followedId),
      ]);
      if (followerSlug === followedSlug) return;
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
    clearHiddenSlugsCache();
    const client = await getPool().connect();
    try {
      await client.query(
        'INSERT INTO user_blocks (blocker_slug, blocked_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [blockerSlug, blockedSlug]
      );
    } finally { client.release(); }
  },

  async unblockUser(blockerSlug: string, blockedSlug: string) {
    clearHiddenSlugsCache();
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
    clearHiddenSlugsCache();
    const client = await getPool().connect();
    try {
      await client.query(
        'INSERT INTO user_mutes (muter_slug, muted_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [muterSlug, mutedSlug]
      );
    } finally { client.release(); }
  },

  async unmuteUser(muterSlug: string, mutedSlug: string) {
    clearHiddenSlugsCache();
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
      return { id: r.id, preset: r.preset, title: r.title, manifest: JSON.parse(r.manifest), createdAt, creatorSlug: r.creator_slug ?? undefined, ...gameStatsFromRow(r) };
    } finally {
      client.release();
    }
  },

  async getGamesByIds(ids) {
    if (!ids || ids.length === 0) return [];
    const client = await getPool().connect();
    try {
      // フィードの主要導線。ここで manifest を丸ごと引くと、ゲーム1本ぶんのデータ
      // （スプライトやマップを含む数百KB〜）がフィードのポーリングのたびに Neon から流れる。
      // 実際に使うのは title と titleScreen.bgRef の1本だけなので、
      // bgRef の抽出は DB 側でやって列自体は転送しない。
      const BG_REF_SQL = `substring(g.manifest::text from '"bgRef"[[:space:]]*:[[:space:]]*"(https?://[^"]+)"')`;
      const COLUMNS = `g.id, g.preset, g.title, g.created_at, g.creator_slug,
                       g.plays, g.clears, g.best_score, g.best_score_by,
                       ${BG_REF_SQL} AS bg_ref`;
      let result;
      try {
        result = await client.query(
          `SELECT ${COLUMNS} FROM games g WHERE g.id = ANY($1::bigint[])`,
          [ids]
        );
      } catch {
        // プレイ統計（migration 10）が未適用の環境でも投稿一覧ごと 500 にしない。
        // gameStatsFromRow が欠けた列を 0 として扱う。
        result = await client.query(
          `SELECT g.id, g.preset, g.title, g.created_at, g.creator_slug, ${BG_REF_SQL} AS bg_ref
             FROM games g WHERE g.id = ANY($1::bigint[])`,
          [ids]
        );
      }
      return result.rows.map((r: any) => {
        const createdAt = typeof r.created_at === 'object' ? r.created_at.toISOString() : String(r.created_at);
        const manifest: any = r.bg_ref ? { titleScreen: { bgRef: r.bg_ref } } : {};
        return { id: r.id, preset: r.preset, title: r.title, manifest, createdAt, creatorSlug: r.creator_slug ?? undefined, ...gameStatsFromRow(r) };
      });
    } finally {
      client.release();
    }
  },

  async recordGamePlay(id, data) {
    const client = await getPool().connect();
    try {
      const score = Number(data.score) || 0;
      // ハイスコアは「上回ったときだけ」置き換える。GREATEST では保持者名がずれるので CASE で揃える。
      const result = await client.query(
        `UPDATE games
            SET plays = COALESCE(plays, 0) + $2,
                clears = COALESCE(clears, 0) + $3,
                best_score = CASE WHEN $4 > COALESCE(best_score, 0) THEN $4 ELSE COALESCE(best_score, 0) END,
                best_score_by = CASE WHEN $4 > COALESCE(best_score, 0) THEN $5 ELSE best_score_by END
          WHERE id = $1
          RETURNING *`,
        [id, data.countPlay === false ? 0 : 1, data.cleared ? 1 : 0, score, data.displayName || '名無し']
      );
      if (result.rows.length === 0) return null;
      const r = result.rows[0];
      const createdAt = typeof r.created_at === 'object' ? r.created_at.toISOString() : String(r.created_at);
      return { id: r.id, preset: r.preset, title: r.title, manifest: JSON.parse(r.manifest), createdAt, creatorSlug: r.creator_slug ?? undefined, ...gameStatsFromRow(r) };
    } finally {
      client.release();
    }
  },

  async listTopGames(limit?: number) {
    const client = await getPool().connect();
    try {
      const safeLimit = Math.max(1, Math.min(limit || 30, 50));
      // manifest は重いので取らない（ランキング表示には不要）
      const result = await client.query(
        `SELECT g.id, g.preset, g.title, g.created_at, g.creator_slug, g.plays, g.clears, g.best_score, g.best_score_by,
                (SELECT p.id FROM posts p WHERE p.game_id = g.id ORDER BY p.id ASC LIMIT 1) AS post_id
           FROM games g
          ORDER BY COALESCE(g.plays, 0) DESC, g.id DESC
          LIMIT ${safeLimit}`
      );
      return result.rows.map((r: any) => {
        const createdAt = typeof r.created_at === 'object' ? r.created_at.toISOString() : String(r.created_at);
        return {
          id: r.id, preset: r.preset, title: r.title, manifest: {} as any, createdAt,
          creatorSlug: r.creator_slug ?? undefined,
          postId: r.post_id ? Number(r.post_id) : undefined,
          ...gameStatsFromRow(r),
        };
      });
    } finally {
      client.release();
    }
  },

  async getPostIdByGameId(gameId: number) {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT id FROM posts WHERE game_id = $1 ORDER BY id ASC LIMIT 1', [gameId]);
      return result.rows.length > 0 ? Number(result.rows[0].id) : null;
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

  async listAllGames(limit?: number) {
    const client = await getPool().connect();
    try {
      const safeLimit = Math.max(1, Math.min(limit || 30, 50));
      const result = await client.query(`SELECT * FROM games ORDER BY id DESC LIMIT ${safeLimit}`);
      return result.rows.map((r: any) => {
        const createdAt = typeof r.created_at === 'object' ? r.created_at.toISOString() : String(r.created_at);
        return { id: r.id, preset: r.preset, title: r.title, manifest: JSON.parse(r.manifest), createdAt, ...gameStatsFromRow(r) };
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
      const allGames = await client.query('SELECT id, preset, title, created_at FROM games ORDER BY id DESC LIMIT 30');
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
      // 掃除は毎回やらない。位置更新は1人あたり2秒に1回来るので、そのたびに
      // 全表 DELETE を撃つと参加人数×更新頻度ぶんの無駄な書き込みになる。
      // 5% の確率で回せば、実用上は数十秒以内に必ず掃除される。
      // ※そもそも REALTIME_URL を設定していればこの経路自体を通らない（presence はハブのメモリ上）。
      if (Math.random() < 0.05) {
        await client.query("DELETE FROM game_players WHERE updated_at < NOW() - INTERVAL '15 seconds'");
      }
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
