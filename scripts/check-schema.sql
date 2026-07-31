-- Neon(PostgreSQL) のスキーマと、アプリが想定する現在のスキーマ（テーブルとカラム）に乖離がないかチェックするSQL
-- NeonコンソールのSQL Editorやクライアントツールで実行してください。
-- 結果が 0 件（空）になれば、乖離なし（完全一致）です。

WITH expected_schema (table_name, column_name) AS (
  VALUES
    -- notifications
    ('notifications', 'id'),
    ('notifications', 'actor_slug'),
    ('notifications', 'target_slug'),
    ('notifications', 'type'),
    ('notifications', 'post_id'),
    ('notifications', 'read'),
    ('notifications', 'created_at'),

    -- messages
    ('messages', 'id'),
    ('messages', 'sender'),
    ('messages', 'text'),
    ('messages', 'recipient'),
    ('messages', 'created_at'),

    -- trends
    ('trends', 'id'),
    ('trends', 'keyword'),
    ('trends', 'count'),

    -- posts
    ('posts', 'id'),
    ('posts', 'thread_id'),
    ('posts', 'parent_post_id'),
    ('posts', 'display_name'),
    ('posts', 'slug'),
    ('posts', 'created_at'),
    ('posts', 'content'),
    ('posts', 'likes'),
    ('posts', 'dislikes'),
    ('posts', 'liked'),
    ('posts', 'disliked'),
    ('posts', 'replies_count'),
    ('posts', 'reposts'),
    ('posts', 'reposted'),
    ('posts', 'has_image'),
    ('posts', 'image_src'),
    ('posts', 'image_alt'),
    ('posts', 'avatar_color'),
    ('posts', 'has_collab_button'),
    ('posts', 'hearts_total'),
    ('posts', 'has_game'),
    ('posts', 'game_id'),
    ('posts', 'origin_type'),
    ('posts', 'is_false_declaration'),
    ('posts', 'is_edited'),

    -- post_votes
    ('post_votes', 'id'),
    ('post_votes', 'post_id'),
    ('post_votes', 'user_id'),
    ('post_votes', 'vote_type'),
    ('post_votes', 'created_at'),

    -- post_hearts
    ('post_hearts', 'id'),
    ('post_hearts', 'post_id'),
    ('post_hearts', 'user_id'),
    ('post_hearts', 'created_at'),

    -- anonymous_users
    ('anonymous_users', 'id'),
    ('anonymous_users', 'ip_address'),
    ('anonymous_users', 'session_id'),
    ('anonymous_users', 'display_name'),
    ('anonymous_users', 'slug'),
    ('anonymous_users', 'avatar_color'),
    ('anonymous_users', 'created_at'),
    ('anonymous_users', 'last_seen_at'),
    ('anonymous_users', 'is_private'),
    ('anonymous_users', 'hide_from_search'),
    ('anonymous_users', 'hide_reactions'),

    -- user_follows
    ('user_follows', 'id'),
    ('user_follows', 'follower_id'),
    ('user_follows', 'followed_id'),
    ('user_follows', 'created_at'),

    -- games
    ('games', 'id'),
    ('games', 'preset'),
    ('games', 'title'),
    ('games', 'manifest'),
    ('games', 'created_at'),

    -- game_schedule
    ('game_schedule', 'hour_slot'),
    ('game_schedule', 'game_id'),

    -- game_votes
    ('game_votes', 'id'),
    ('game_votes', 'game_id'),
    ('game_votes', 'ip_address'),
    ('game_votes', 'hour_slot'),

    -- game_players
    ('game_players', 'session_id'),
    ('game_players', 'game_id'),
    ('game_players', 'x'),
    ('game_players', 'y'),
    ('game_players', 'emoji'),
    ('game_players', 'updated_at'),

    -- user_blocks
    ('user_blocks', 'blocker_slug'),
    ('user_blocks', 'blocked_slug'),
    ('user_blocks', 'created_at'),

    -- user_mutes
    ('user_mutes', 'muter_slug'),
    ('user_mutes', 'muted_slug'),
    ('user_mutes', 'created_at'),

    -- reports
    ('reports', 'id'),
    ('reports', 'reporter_slug'),
    ('reports', 'target_type'),
    ('reports', 'target_id'),
    ('reports', 'reason'),
    ('reports', 'created_at'),

    -- migration_tokens
    ('migration_tokens', 'token'),
    ('migration_tokens', 'user_id'),
    ('migration_tokens', 'created_at')
),
actual_schema AS (
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
)
SELECT
  COALESCE(e.table_name, a.table_name) AS table_name,
  COALESCE(e.column_name, a.column_name) AS column_name,
  CASE
    WHEN e.column_name IS NULL THEN '不要なカラム/テーブルが存在します (Actual extra)'
    WHEN a.column_name IS NULL THEN 'カラム/テーブルが不足しています (Actual missing)'
    ELSE 'OK'
  END AS check_result,
  a.data_type AS actual_data_type
FROM expected_schema e
FULL OUTER JOIN actual_schema a
  ON e.table_name = a.table_name
 AND e.column_name = a.column_name
WHERE e.column_name IS NULL OR a.column_name IS NULL
ORDER BY table_name, column_name;
