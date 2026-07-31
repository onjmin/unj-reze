-- PostgreSQL用初期化スクリプト（Neon互換）

-- 匿名ユーザーテーブル
CREATE TABLE IF NOT EXISTS anonymous_users (
  id TEXT PRIMARY KEY,
  ip_address TEXT NOT NULL,
  session_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  slug TEXT UNIQUE,
  avatar_color TEXT NOT NULL DEFAULT 'from-blue-500 to-indigo-600',
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_anonymous_users_ip ON anonymous_users(ip_address);
CREATE INDEX IF NOT EXISTS idx_anonymous_users_session ON anonymous_users(session_id);
CREATE INDEX IF NOT EXISTS idx_anonymous_users_slug ON anonymous_users(slug);

-- 通知テーブル
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  actor_slug TEXT NOT NULL REFERENCES anonymous_users(slug) ON DELETE CASCADE,
  target_slug TEXT NOT NULL REFERENCES anonymous_users(slug) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('like', 'heart', 'reply', 'follow', 'mention', 'repost')),
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_target_slug ON notifications(target_slug, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_actor_slug ON notifications(actor_slug);

-- メッセージテーブル
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  sender TEXT NOT NULL REFERENCES anonymous_users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  recipient TEXT REFERENCES anonymous_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender, recipient, created_at DESC);

-- トレンドテーブル
CREATE TABLE IF NOT EXISTS trends (
  id SERIAL PRIMARY KEY,
  keyword TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);

-- 投稿テーブル（スレッド＋返信を単一テーブルで管理）
CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  thread_id INTEGER NOT NULL REFERENCES posts(id),
  parent_post_id INTEGER REFERENCES posts(id),
  display_name TEXT NOT NULL,
  slug TEXT REFERENCES anonymous_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  dislikes INTEGER NOT NULL DEFAULT 0,
  liked BOOLEAN NOT NULL DEFAULT FALSE,
  disliked BOOLEAN NOT NULL DEFAULT FALSE,
  replies_count INTEGER NOT NULL DEFAULT 0,
  reposts INTEGER NOT NULL DEFAULT 0,
  reposted BOOLEAN NOT NULL DEFAULT FALSE,
  has_image BOOLEAN NOT NULL DEFAULT FALSE,
  image_src TEXT,
  image_alt TEXT,
  avatar_color TEXT NOT NULL DEFAULT 'from-blue-500 to-indigo-600',
  has_collab_button BOOLEAN NOT NULL DEFAULT FALSE,
  hearts_total INTEGER NOT NULL DEFAULT 0,
  has_game BOOLEAN NOT NULL DEFAULT FALSE,
  game_id BIGINT,
  origin_type TEXT,
  is_false_declaration BOOLEAN NOT NULL DEFAULT FALSE,
  is_edited BOOLEAN NOT NULL DEFAULT FALSE
);

-- ゲームテーブル
CREATE TABLE IF NOT EXISTS games (
  id BIGSERIAL PRIMARY KEY,
  preset TEXT NOT NULL,
  title TEXT NOT NULL,
  manifest TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creator_slug TEXT REFERENCES anonymous_users(id) ON DELETE SET NULL,
  plays BIGINT NOT NULL DEFAULT 0,
  clears BIGINT NOT NULL DEFAULT 0,
  best_score BIGINT NOT NULL DEFAULT 0,
  best_score_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_games_creator ON games(creator_slug);
CREATE INDEX IF NOT EXISTS idx_games_plays ON games(plays DESC);

-- ゲームスケジュールテーブル
CREATE TABLE IF NOT EXISTS game_schedule (
  hour_slot TEXT PRIMARY KEY,
  game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE
);

-- ゲーム投票テーブル
CREATE TABLE IF NOT EXISTS game_votes (
  id SERIAL PRIMARY KEY,
  game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL,
  hour_slot TEXT NOT NULL,
  UNIQUE(ip_address, hour_slot)
);
CREATE INDEX IF NOT EXISTS idx_game_votes_game_id ON game_votes(game_id);

-- ゲームプレイヤーテーブル
CREATE TABLE IF NOT EXISTS game_players (
  session_id TEXT NOT NULL,
  game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  emoji TEXT NOT NULL DEFAULT '🎮',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, game_id)
);

-- マイグレーショントークンテーブル
CREATE TABLE IF NOT EXISTS migration_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES anonymous_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- いいね/わるい 投票テーブル (1ユーザー1投票)
CREATE TABLE IF NOT EXISTS post_votes (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES anonymous_users(id) ON DELETE CASCADE,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('like', 'dislike')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);

-- ハートテーブル (無制限投票)
CREATE TABLE IF NOT EXISTS post_hearts (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES anonymous_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- フォローテーブル
CREATE TABLE IF NOT EXISTS user_follows (
  id SERIAL PRIMARY KEY,
  follower_id TEXT NOT NULL REFERENCES anonymous_users(id) ON DELETE CASCADE,
  followed_id TEXT NOT NULL REFERENCES anonymous_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (follower_id, followed_id)
);
CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_followed ON user_follows(followed_id);

-- ブロックテーブル
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_slug TEXT NOT NULL REFERENCES anonymous_users(id) ON DELETE CASCADE,
  blocked_slug TEXT NOT NULL REFERENCES anonymous_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_slug, blocked_slug)
);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_slug);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_slug);

-- ミュートテーブル
CREATE TABLE IF NOT EXISTS user_mutes (
  muter_slug TEXT NOT NULL REFERENCES anonymous_users(id) ON DELETE CASCADE,
  muted_slug TEXT NOT NULL REFERENCES anonymous_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (muter_slug, muted_slug)
);
CREATE INDEX IF NOT EXISTS idx_user_mutes_muter ON user_mutes(muter_slug);

-- 通報テーブル
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  reporter_slug TEXT NOT NULL REFERENCES anonymous_users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_slug);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);

-- 推しアイテムテーブル
CREATE TABLE IF NOT EXISTS oshi_items (
  id BIGINT PRIMARY KEY,
  user_slug TEXT NOT NULL REFERENCES anonymous_users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  track_id BIGINT,
  collection_id BIGINT,
  artist_id BIGINT,
  title TEXT NOT NULL,
  subtitle TEXT,
  artwork_url TEXT,
  view_url TEXT,
  preview_url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oshi_items_user_slug ON oshi_items(user_slug);

-- === 匿名ユーザーデータ（通知・投稿・メッセージの外部キー参照を満たすための初期ユーザー） ===
INSERT INTO anonymous_users (id, ip_address, session_id, display_name, slug, avatar_color) VALUES
  ('usr_Xz9', '127.0.0.1', 'seed_session_1', '名無しXz9', 'Xz9', 'from-pink-400 to-rose-500'),
  ('usr_Lm8', '127.0.0.1', 'seed_session_2', '名無しLm8', 'Lm8', 'from-gray-300 to-slate-400'),
  ('usr_Bn5', '127.0.0.1', 'seed_session_3', '名無しBn5', 'Bn5', 'from-emerald-400 to-teal-500'),
  ('usr_Vc1', '127.0.0.1', 'seed_session_4', '名無しVc1', 'Vc1', 'from-purple-400 to-violet-500'),
  ('usr_vFZ', '127.0.0.1', 'seed_session_5', '名無しvFZ', 'vFZ', 'from-purple-500 to-pink-600'),
  ('usr_Qp7', '127.0.0.1', 'seed_session_6', '名無しQp7', 'Qp7', 'from-amber-400 to-yellow-500'),
  ('usr_aB3', '127.0.0.1', 'seed_session_7', '名無しaB3', 'aB3', 'from-sky-400 to-blue-500'),
  ('usr_R9k', '127.0.0.1', 'seed_session_8', '名無しR9k', 'R9k', 'from-red-500 to-rose-600'),
  ('usr_Ne4', '127.0.0.1', 'seed_session_9', '名無しNe4', 'Ne4', 'from-cyan-400 to-indigo-500'),
  ('usr_Mm1', '127.0.0.1', 'seed_session_10', '名無しMm1', 'Mm1', 'from-pink-400 to-rose-500'),
  ('usr_Tb7', '127.0.0.1', 'seed_session_11', '名無しTb7', 'Tb7', 'from-cyan-400 to-blue-500'),
  ('usr_Jk8', '127.0.0.1', 'seed_session_12', '名無しJk8', 'Jk8', 'from-rose-400 to-pink-600'),
  ('usr_xY7', '127.0.0.1', 'seed_session_13', '名無しxY7', 'xY7', 'from-blue-400 to-indigo-500'),
  ('usr_Qw3', '127.0.0.1', 'seed_session_14', '名無しQw3', 'Qw3', 'from-blue-400 to-indigo-500'),
  ('usr_Tp4', '127.0.0.1', 'seed_session_15', '名無しTp4', 'Tp4', 'from-blue-400 to-indigo-500'),
  ('usr_Df2', '127.0.0.1', 'seed_session_16', '名無しDf2', 'Df2', 'from-blue-400 to-indigo-500'),
  ('usr_Gh6', '127.0.0.1', 'seed_session_17', '名無しGh6', 'Gh6', 'from-blue-400 to-indigo-500'),
  ('usr_Jk9', '127.0.0.1', 'seed_session_18', '名無しJk9', 'Jk9', 'from-blue-400 to-indigo-500'),
  ('usr_Wx8', '127.0.0.1', 'seed_session_19', '名無しWx8', 'Wx8', 'from-blue-400 to-indigo-500'),
  ('usr_Yz2', '127.0.0.1', 'seed_session_20', '名無しYz2', 'Yz2', 'from-blue-400 to-indigo-500'),
  ('usr_Rt3', '127.0.0.1', 'seed_session_21', '名無しRt3', 'Rt3', 'from-blue-400 to-indigo-500'),
  ('usr_Uv6', '127.0.0.1', 'seed_session_22', '名無しUv6', 'Uv6', 'from-blue-400 to-indigo-500'),
  ('usr_As5', '127.0.0.1', 'seed_session_23', '名無しAs5', 'As5', 'from-blue-400 to-indigo-500'),
  ('usr_Df9', '127.0.0.1', 'seed_session_24', '名無しDf9', 'Df9', 'from-blue-400 to-indigo-500'),
  ('usr_Gh2', '127.0.0.1', 'seed_session_25', '名無しGh2', 'Gh2', 'from-blue-400 to-indigo-500'),
  ('usr_Jk3', '127.0.0.1', 'seed_session_26', '名無しJk3', 'Jk3', 'from-blue-400 to-indigo-500'),
  ('usr_Lz9', '127.0.0.1', 'seed_session_27', '名無しLz9', 'Lz9', 'from-blue-400 to-indigo-500'),
  ('usr_Kt1', '127.0.0.1', 'seed_session_28', '名無しKt1', 'Kt1', 'from-green-400 to-teal-500'),
  ('usr_Wk2', '127.0.0.1', 'seed_session_29', '名無しWk2', 'Wk2', 'from-orange-400 to-red-500'),
  ('usr_Qm9', '127.0.0.1', 'seed_session_30', '名無しQm9', 'Qm9', 'from-teal-400 to-cyan-500'),
  ('usr_Rf6', '127.0.0.1', 'seed_session_31', '名無しRf6', 'Rf6', 'from-sky-400 to-indigo-500'),
  ('usr_Hn3', '127.0.0.1', 'seed_session_32', '名無しHn3', 'Hn3', 'from-lime-400 to-green-500'),
  ('usr_Pz5', '127.0.0.1', 'seed_session_33', '名無しPz5', 'Pz5', 'from-pink-300 to-rose-400')
ON CONFLICT (id) DO NOTHING;

-- === 通知データ ===
INSERT INTO notifications (id, actor_slug, target_slug, type, post_id, created_at) VALUES
  (1, 'Xz9', 'vFZ', 'like', 7, NOW() - INTERVAL '3 minutes'),
  (2, 'Lm8', 'vFZ', 'repost', 6, NOW() - INTERVAL '8 minutes'),
  (3, 'Bn5', 'vFZ', 'reply', 5, NOW() - INTERVAL '15 minutes'),
  (4, 'Vc1', 'vFZ', 'follow', NULL, NOW() - INTERVAL '1 hour');

-- === メッセージデータ ===
INSERT INTO messages (id, sender, text, created_at) VALUES
  (1, '名無しLm8', 'おはよう！今日の雪写真見た？', NOW() - INTERVAL '7 hours'),
  (2, '名無しXz9', 'イラストまとめ見てくれてありがとう！', NOW() - INTERVAL '2 days'),
  (3, '名無しQp7', 'ドット絵のコツ教えてくれる？', NOW() - INTERVAL '1 day');

-- === トレンドデータ ===
INSERT INTO trends (id, keyword, count) VALUES
  (1, '#お絵描き', 150),
  (2, '#ゲーム制作', 125),
  (3, 'ドット絵講座', 100),
  (4, '作業用BGM', 75),
  (5, '名無しBBS', 50),
  (6, '春のイラスト祭', 40),
  (7, '青空フォト', 30),
  (8, 'lofi beats', 25);

-- === 投稿データ（スレッド＋返信一括） ===
-- thread_id = id はスレッド, thread_id != id は返信
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (1, 1, NULL, '名無しaB3', 'aB3', NOW() - INTERVAL '3 hours', E'#お絵描き\n今日の落書き 天気いいから外でスケッチした', 42, 0, false, false, 12, 5, false, false, NULL, NULL, 'from-sky-400 to-blue-500', true, 320, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (2, 2, NULL, '名無しR9k', 'R9k', NOW() - INTERVAL '5 hours', E'今週の #ゲーム 進捗\nステージ3のボス戦やっと実装できた\nあとは調整だけどバグが取れない…', 18, 3, false, false, 7, 1, false, false, NULL, NULL, 'from-red-500 to-rose-600', true, 95, true);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (3, 3, NULL, '名無しLm8', 'Lm8', NOW() - INTERVAL '8 hours', E'朝起きたら雪積もっててびっくりした\nもう春だと思ってたのに', 56, 2, false, false, 19, 8, false, false, NULL, NULL, 'from-gray-300 to-slate-400', false, 612, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (4, 4, NULL, '名無しVc1', 'Vc1', NOW() - INTERVAL '12 hours', E'#お絵描き\n久しぶりに描いた 練習帳', 33, 1, false, false, 9, 3, false, false, NULL, NULL, 'from-purple-400 to-violet-500', true, 278, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (5, 5, NULL, '名無しBn5', 'Bn5', NOW() - INTERVAL '1 day', E'作業用BGM何聴いてる？\n最近はlofiばかり', 21, 0, false, false, 31, 2, false, false, NULL, NULL, 'from-emerald-400 to-teal-500', false, 45, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (6, 6, NULL, '名無しQp7', 'Qp7', NOW() - INTERVAL '2 days', E'#お絵描き #ゲーム\nドット絵の練習中\nキャラチップ自作すると愛着湧くね', 67, 4, false, false, 15, 12, false, false, NULL, NULL, 'from-amber-400 to-yellow-500', true, 890, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (7, 7, NULL, '名無しNe4', 'Ne4', NOW() - INTERVAL '3 days', E'今週のお題「青空」に参加\nみんなの投稿も見に行こう', 12, 0, false, false, 4, 0, false, false, NULL, NULL, 'from-cyan-400 to-indigo-500', true, 67, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (8, 8, NULL, '名無しXz9', 'Xz9', NOW() - INTERVAL '4 days', E'#お絵描き\n描きためたイラストまとめ\n今月は10枚描けたぞ', 89, 2, false, false, 22, 15, false, false, NULL, NULL, 'from-pink-400 to-rose-500', true, 1250, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (9, 9, NULL, '名無しMm1', 'Mm1', NOW() - INTERVAL '2 hours', E'てすや\n#mml @0t135q50v100r8o4d+8e8r8f+8r8d+8c8c+8<b8>c+8f+8g+8r8f+8e8f+8r8e8c+8d+8e8d+8c8c+8r4<b8>c+8d+8e8d+8r8e8g+8r8f+8r8b8r8f+8g+8f+8d+8e8r8c+8d+8e8r8d+8c8d+8e8d+8c8c+8r4r8;@1t135q50v95;@2t135q50v88;@3t135q50v76[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2', 15, 0, false, false, 3, 2, false, false, NULL, NULL, 'from-pink-400 to-rose-500', false, 88, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (10, 10, NULL, '名無しTb7', 'Tb7', NOW() - INTERVAL '30 minutes', E'#mml @0 t135 q50 v100 r2 r2 o4e8 r8 e8 e8 g+8 r8 f+8 r8 c8 b8 b8 b8 g+8 r8 e8 g+8 >e8 r4 e8 e8 r8 d+8 c+8 <b8 >c+8 <b8 a8 g+8 r8 d8 r8 e8 e8 e8 e8 c+8 c+8 a8 f+8 g+8 f+8 e8 g+8 f+8 c8 g+8 f+8 e8 r8 e8 e8 c+8 r8 f+8 r8 g+8 f+8 e8 g+8 e8 r8 c+8 d+8 e8 r8 e8 e8 g+8 r8 f+8 r8 c8 b8 b8 b8 g+8 r8 e8 g+8 >e8 r4 e8 e8 r8 d+8 c+8 <b8 >c+8 <b8 a8 g+8 r8 d8 r8 e8 e8 e8 e8 c+8 c+8 a8 f+8 g+8 f+8 e8 g+8 f+8 c8 g+8 f+8 e8 r8 e8 e8 c+8 r8 f+8 r8 g+8 f+8 e8 g+8 e8 r8 c+8 d+8;@1 t135 q50 v95 r2 r2 r2 r2 r2 r2 r2 r2 r4 r8 o6e8 b8 a24 b24 a24 g+8 f+8 g+8 r4 r8 r2 r2 r2 r2 r2 r8 e8 f+8 g8 g+8 f+24 g+24 f+24 e8 g+8 e8 r4 r8 r2 r2 r2 r2 r2 r4 r8 e8 b8 a24 b24 a24 g+8 f+8 g+8 r4 r8 r2 r2 r2 r2 r2 r8 e8 f+8 g8 g+8 f+24 g+24 f+24 e8 g+8 e8 r4 r8;@2 t135 q50 v88 r2 r2 o2f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <g+8 >g+8 <g+8 >g+8 <g+8 >g+8 r16 <g+16 >g+8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <g+8 >g+8 <g+8 >g+8 <g+8 >g+8 <g+8 >g+8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <a8 >a8 <a8 >a8 <a8 >a8 <a8 >a8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <g+8 >g+8 <g+8 >g+8 <g+8 >g+8 r16 <g+16 >g+8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <g+8 >g+8 <g+8 >g+8 <g+8 >g+8 <g+8 >g+8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <a8 >a8 <a8 >a8 <a8 >a8 <a8 >a8;@3 t135 q50 v76 r2 r2 [o3f+o3ao4c+o4e]2 r2 [o3g+o4co4d+o4f+o5e]2 r2 [o3c+o3eo3g+o3b]2 r2 [o3eo3g+o3bo4d]2 r2 [o3f+o3ao4c+o4e]2 r2 [o3g+o4co4d+o4f+o5e]2 r2 [o3c+o3eo3g+o3b]2 r2 [o3f+o3ao4g+o4c+]2 [o4eo3ao3f+]2 [o3f+o3ao4c+o4e]2 r2 [o3g+o4co4d+o4f+o5e]2 r2 [o3c+o3eo3g+o3b]2 r2 [o3eo3g+o3bo4d]2 r2 [o3f+o3ao4c+o4e]2 r2 [o3g+o4co4d+o4f+o5e]2 r2 [o3c+o3eo3g+o3b]2 r2 [o3f+o3ao4g+o4c+]2 [o4eo3ao3f+]2', 7, 1, false, false, 1, 0, false, false, NULL, NULL, 'from-cyan-400 to-blue-500', false, 23, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (11, 11, NULL, '名無しJk8', 'Jk8', NOW() - INTERVAL '10 minutes', E'#コード進行\n# t185\n# Bメロ\n|Am7(b5)/G|F6|Dm7|Gm\n|Cm7Dm7|EbDm7|EbF/Eb|D7F/G\n\n# サビ\n|Gm|F6|Eb|Gm7\n|Cm6D|DmGm7|Cm6Dm7|GM7\n\n|Eb|F|Dm7|Gm7\n|EbM7|F|Gm7|G', 15, 0, false, false, 2, 2, false, false, NULL, NULL, 'from-rose-400 to-pink-600', false, 45, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (12, 12, NULL, '名無しvFZ', 'vFZ', NOW() - INTERVAL '1 minute', E'https://www.youtube.com/watch?v=nHyQq2FUxig\n\nこんなアレンジ見つけたよ\n[東方風アレンジ] サマータイム・ラプソディ・オブ・ア・ディイング・ワールド (東方眠世界)\nFanTouhouMusic', 8, 0, false, false, 2, 1, false, false, NULL, NULL, 'from-purple-500 to-pink-600', false, 34, false);
-- 返信（thread_idで紐付け）
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (101, 1, 1, '名無しxY7', 'xY7', NOW() - INTERVAL '2 hours', E'いい感じ！色使いが好き', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (102, 1, 1, '名無しQw3', 'Qw3', NOW() - INTERVAL '1 hour', E'外で描くの気持ちいいよね', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (103, 2, 2, '名無しTp4', 'Tp4', NOW() - INTERVAL '4 hours', E'デバッグ頑張って！', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (104, 3, 3, '名無しDf2', 'Df2', NOW() - INTERVAL '7 hours', E'こっちはもう桜咲きそう', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (105, 3, 3, '名無しGh6', 'Gh6', NOW() - INTERVAL '6 hours', E'地域によって違うよね〜', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (106, 3, 3, '名無しJk9', 'Jk9', NOW() - INTERVAL '5 hours', E'写真綺麗！', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (107, 5, 5, '名無しWx8', 'Wx8', NOW() - INTERVAL '20 hours', E'自分は環境音派', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (108, 5, 5, '名無しYz2', 'Yz2', NOW() - INTERVAL '18 hours', E'シティポップおすすめ', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (109, 6, 6, '名無しRt3', 'Rt3', NOW() - INTERVAL '1 day', E'かわいい！使っていい？', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (110, 6, 6, '名無しUv6', 'Uv6', NOW() - INTERVAL '1 day', E'ドット絵いいな、僕も始めよう', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (111, 8, 8, '名無しAs5', 'As5', NOW() - INTERVAL '3 days', E'全部素敵！特に3枚目が好き', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (112, 8, 8, '名無しDf9', 'Df9', NOW() - INTERVAL '3 days', E'ペースすごいな、尊敬する', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (113, 8, 8, '名無しGh2', 'Gh2', NOW() - INTERVAL '2 days', E'もっと見たいです！', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (114, 9, 9, '名無しJk3', 'Jk3', NOW() - INTERVAL '1 hour', E'かっこいい！コード進行いいね', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (115, 12, 12, '名無しLz9', 'Lz9', NOW(), E'このアレンジ良すぎる', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (201, 11, 11, '名無しKt1', 'Kt1', NOW(), E'https://api.karotter.com/uploads/posts/346ec30c-dcb6-41d7-8cf7-7ef5ef7e92dc.mp4\n\n作曲したコード進行の動画です Aメロ→Bメロ→サビの構成、7thやdimを交えたおしゃれめ進行', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (202, 11, 11, '名無しWk2', 'Wk2', NOW() - INTERVAL '30 seconds', E'このコード進行ほんとおしゃれ…BメロのAm7(b5)が効いてる', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (301, 11, 11, '名無しQm9', 'Qm9', NOW(), E'7thとdimの組み合わせがオシャレすぎる', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (401, 1, 1, '名無しRf6', 'Rf6', NOW() - INTERVAL '2 hours', E'外スケッチいいな！私も今度やってみよう', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (501, 5, 5, '名無しHn3', 'Hn3', NOW() - INTERVAL '15 minutes', E'lofiは作業効率上がるよね、自分も愛用してる', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (601, 3, 3, '名無しPz5', 'Pz5', NOW() - INTERVAL '5 hours', E'こちらはもう桜が咲き始めましたよ〜春ですね', 0, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-blue-400 to-indigo-500', false, 0, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (13, 11, 11, '名無しKt1', 'Kt1', NOW(), E'https://api.karotter.com/uploads/posts/346ec30c-dcb6-41d7-8cf7-7ef5ef7e92dc.mp4\n\n作曲したコード進行の動画です\nAメロ→Bメロ→サビの構成、7thやdimを交えたおしゃれめ進行', 3, 0, false, false, 1, 0, false, false, NULL, NULL, 'from-green-400 to-teal-500', false, 12, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (14, 11, 11, '名無しWk2', 'Wk2', NOW() - INTERVAL '30 seconds', E'このコード進行ほんとおしゃれ…BメロのAm7(b5)が効いてる', 5, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-orange-400 to-red-500', false, 8, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (15, 11, 11, '名無しQm9', 'Qm9', NOW(), E'7thとdimの組み合わせがオシャレすぎる', 2, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-teal-400 to-cyan-500', false, 3, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (16, 1, 1, '名無しRf6', 'Rf6', NOW() - INTERVAL '2 hours', E'外スケッチいいな！私も今度やってみよう', 8, 1, false, false, 0, 0, false, false, NULL, NULL, 'from-sky-400 to-indigo-500', false, 14, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (17, 5, 5, '名無しHn3', 'Hn3', NOW() - INTERVAL '15 minutes', E'lofiは作業効率上がるよね、自分も愛用してる', 4, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-lime-400 to-green-500', false, 6, false);
INSERT INTO posts (id, thread_id, parent_post_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (18, 3, 3, '名無しPz5', 'Pz5', NOW() - INTERVAL '5 hours', E'こちらはもう桜が咲き始めましたよ〜春ですね', 11, 0, false, false, 0, 1, false, false, NULL, NULL, 'from-pink-300 to-rose-400', false, 28, false);

-- シーケンスを手動INSERTした最大値に合わせる
SELECT setval('notifications_id_seq', (SELECT MAX(id) FROM notifications));
SELECT setval('messages_id_seq', (SELECT MAX(id) FROM messages));
SELECT setval('trends_id_seq', (SELECT MAX(id) FROM trends));
SELECT setval('posts_id_seq', (SELECT MAX(id) FROM posts));
