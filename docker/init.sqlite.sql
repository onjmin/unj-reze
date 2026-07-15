-- SQLite用初期化スクリプト（Cloudflare D1互換）
-- BOOLEANの代わりにINTEGER(0/1)を使用

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'like',
  post_id INTEGER,
  target_user TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  recipient TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trends (
  id INTEGER PRIMARY KEY,
  keyword TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY,
  thread_id INTEGER NOT NULL REFERENCES posts(id),
  parent_post_id INTEGER REFERENCES posts(id),
  display_name TEXT NOT NULL,
  slug TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  content TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  dislikes INTEGER NOT NULL DEFAULT 0,
  liked INTEGER NOT NULL DEFAULT 0,
  disliked INTEGER NOT NULL DEFAULT 0,
  replies_count INTEGER NOT NULL DEFAULT 0,
  reposts INTEGER NOT NULL DEFAULT 0,
  reposted INTEGER NOT NULL DEFAULT 0,
  has_image INTEGER NOT NULL DEFAULT 0,
  image_src TEXT,
  image_alt TEXT,
  avatar_color TEXT NOT NULL DEFAULT 'from-blue-500 to-indigo-600',
  has_collab_button INTEGER NOT NULL DEFAULT 0,
  hearts_total INTEGER NOT NULL DEFAULT 0,
  has_game INTEGER NOT NULL DEFAULT 0,
  game_id INTEGER,
  origin_type TEXT,
  is_false_declaration INTEGER NOT NULL DEFAULT 0,
  is_edited INTEGER NOT NULL DEFAULT 0
);

-- ゲームテーブル
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY,
  preset TEXT NOT NULL,
  title TEXT NOT NULL,
  manifest TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  creator_slug TEXT
);

-- いいね/わるい 投票テーブル (1ユーザー1投票)
CREATE TABLE IF NOT EXISTS post_votes (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('like', 'dislike')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (post_id, user_id)
);

-- ハートテーブル (無制限投票)
CREATE TABLE IF NOT EXISTS post_hearts (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 匿名ユーザーテーブル
CREATE TABLE IF NOT EXISTS anonymous_users (
  id TEXT PRIMARY KEY,
  ip_address TEXT NOT NULL,
  session_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  slug TEXT,
  avatar_color TEXT NOT NULL DEFAULT 'from-blue-500 to-indigo-600',
  avatar_url TEXT,
  bio TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_anonymous_users_ip ON anonymous_users(ip_address);
CREATE INDEX IF NOT EXISTS idx_anonymous_users_session ON anonymous_users(session_id);

-- フォローテーブル
CREATE TABLE IF NOT EXISTS user_follows (
  id INTEGER PRIMARY KEY,
  follower_id TEXT NOT NULL,
  followed_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (follower_id, followed_id)
);

-- ブロックテーブル
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_slug TEXT NOT NULL,
  blocked_slug TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (blocker_slug, blocked_slug)
);

-- ミュートテーブル
CREATE TABLE IF NOT EXISTS user_mutes (
  muter_slug TEXT NOT NULL,
  muted_slug TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (muter_slug, muted_slug)
);

-- 通報テーブル
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_slug TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 推しアイテムテーブル
CREATE TABLE IF NOT EXISTS oshi_items (
  id INTEGER PRIMARY KEY,
  user_slug TEXT NOT NULL,
  kind TEXT NOT NULL,
  track_id INTEGER,
  collection_id INTEGER,
  artist_id INTEGER,
  title TEXT NOT NULL,
  subtitle TEXT,
  artwork_url TEXT,
  view_url TEXT,
  preview_url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oshi_items_user_slug ON oshi_items(user_slug);

-- 通知データ
INSERT INTO notifications (id, user_name, action, target, created_at) VALUES
  (1, '名無しXz9', 'がいいねしました', '青空の写真', datetime('now', '-3 minutes')),
  (2, '名無しLm8', 'がリポストしました', 'ドット絵の練習中', datetime('now', '-8 minutes')),
  (3, '名無しBn5', 'が返信しました', '作業用BGM何聴いてる？', datetime('now', '-15 minutes')),
  (4, '名無しVc1', 'がフォローしました', '', datetime('now', '-1 hours'));

-- メッセージデータ
INSERT INTO messages (id, sender, text, created_at) VALUES
  (1, '名無しLm8', 'おはよう！今日の雪写真見た？', datetime('now', '-7 hours')),
  (2, '名無しXz9', 'イラストまとめ見てくれてありがとう！', datetime('now', '-2 days')),
  (3, '名無しQp7', 'ドット絵のコツ教えてくれる？', datetime('now', '-1 days'));

-- トレンドデータ
INSERT INTO trends (id, keyword, count) VALUES
  (1, '#お絵描き', 150),
  (2, '#ゲーム制作', 125),
  (3, 'ドット絵講座', 100),
  (4, '作業用BGM', 75),
  (5, '名無しBBS', 50),
  (6, '春のイラスト祭', 40),
  (7, '青空フォト', 30),
  (8, 'lofi beats', 25);

-- 投稿データ（スレッド＋返信一括）
INSERT INTO posts (id, thread_id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game) VALUES
  (1, 1, NULL, '名無しaB3', 'aB3', datetime('now', '-3 hours'), '#お絵描き' || char(10) || '今日の落書き 天気いいから外でスケッチした', 42, 0, 0, 0, 12, 5, 0, 1, 'sketch_01.png', '公園のベンチで描いたスケッチ', 'from-sky-400 to-blue-500', 1, 320, 0),
  (2, 2, NULL, '名無しR9k', 'R9k', datetime('now', '-5 hours'), '今週の #ゲーム 進捗' || char(10) || 'ステージ3のボス戦やっと実装できた' || char(10) || 'あとは調整だけどバグが取れない…', 18, 3, 0, 0, 7, 1, 0, 0, NULL, NULL, 'from-red-500 to-rose-600', 1, 95, 1),
  (3, 3, NULL, '名無しLm8', 'Lm8', datetime('now', '-8 hours'), '朝起きたら雪積もっててびっくりした' || char(10) || 'もう春だと思ってたのに', 56, 2, 0, 0, 19, 8, 0, 1, 'snow_morning.jpg', '朝の雪景色', 'from-gray-300 to-slate-400', 0, 612, 0),
  (4, 4, NULL, '名無しVc1', 'Vc1', datetime('now', '-12 hours'), '#お絵描き' || char(10) || '久しぶりに描いた 練習帳', 33, 1, 0, 0, 9, 3, 0, 1, 'practice_sketch.png', 'キャラクターの表情練習', 'from-purple-400 to-violet-500', 1, 278, 0),
  (5, 5, NULL, '名無しBn5', 'Bn5', datetime('now', '-1 days'), '作業用BGM何聴いてる？' || char(10) || '最近はlofiばかり', 21, 0, 0, 0, 31, 2, 0, 0, NULL, NULL, 'from-emerald-400 to-teal-500', 0, 45, 0),
  (6, 6, NULL, '名無しQp7', 'Qp7', datetime('now', '-2 days'), '#お絵描き #ゲーム' || char(10) || 'ドット絵の練習中' || char(10) || 'キャラチップ自作すると愛着湧くね', 67, 4, 0, 0, 15, 12, 0, 1, 'dot_character.png', '自作のドット絵キャラクター', 'from-amber-400 to-yellow-500', 1, 890, 0),
  (7, 7, NULL, '名無しNe4', 'Ne4', datetime('now', '-3 days'), '今週のお題「青空」に参加' || char(10) || 'みんなの投稿も見に行こう', 12, 0, 0, 0, 4, 0, 0, 1, 'blue_sky.jpg', '青空と雲の写真', 'from-cyan-400 to-indigo-500', 1, 67, 0),
  (8, 8, NULL, '名無しXz9', 'Xz9', datetime('now', '-4 days'), '#お絵描き' || char(10) || '描きためたイラストまとめ' || char(10) || '今月は10枚描けたぞ', 89, 2, 0, 0, 22, 15, 0, 1, 'illust_summary.png', '今月描いたイラスト集', 'from-pink-400 to-rose-500', 1, 1250, 0),
  (9, 9, NULL, '名無しMm1', 'Mm1', datetime('now', '-2 hours'), 'てすや' || char(10) || '#mml @0t135q50v100r8o4d+8e8r8f+8r8d+8c8c+8<b8>c+8f+8g+8r8f+8e8f+8r8e8c+8d+8e8d+8c8c+8r4<b8>c+8d+8e8d+8r8e8g+8r8f+8r8b8r8f+8g+8f+8d+8e8r8c+8d+8e8r8d+8c8d+8e8d+8c8c+8r4r8;@1t135q50v95;@2t135q50v88;@3t135q50v76[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2', 15, 0, 0, 0, 3, 2, 0, 0, NULL, NULL, 'from-pink-400 to-rose-500', 0, 88, 0),
  (10, 10, NULL, '名無しTb7', 'Tb7', datetime('now', '-30 minutes'), '#mml @0 t135 q50 v100 r2 r2 o4e8 r8 e8 e8 g+8 r8 f+8 r8 c8 b8 b8 b8 g+8 r8 e8 g+8 >e8 r4 e8 e8 r8 d+8 c+8 <b8 >c+8 <b8 a8 g+8 r8 d8 r8 e8 e8 e8 e8 c+8 c+8 a8 f+8 g+8 f+8 e8 g+8 f+8 c8 g+8 f+8 e8 r8 e8 e8 c+8 r8 f+8 r8 g+8 f+8 e8 g+8 e8 r8 c+8 d+8;@1 t135 q50 v95 r2 r2 r2 r2 r2 r2 r2 r2 r4 r8 o6e8 b8 a24 b24 a24 g+8 f+8 g+8 r4 r8 r2 r2 r2 r2 r2 r8 e8 f+8 g8 g+8 f+24 g+24 f+24 e8 g+8 e8 r4 r8 r2 r2 r2 r2 r2 r4 r8 e8 b8 a24 b24 a24 g+8 f+8 g+8 r4 r8 r2 r2 r2 r2 r2 r8 e8 f+8 g8 g+8 f+24 g+24 f+24 e8 g+8 e8 r4 r8;@2 t135 q50 v88 r2 r2 o2f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <g+8 >g+8 <g+8 >g+8 <g+8 >g+8 r16 <g+16 >g+8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <g+8 >g+8 <g+8 >g+8 <g+8 >g+8 <g+8 >g+8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <a8 >a8 <a8 >a8 <a8 >a8 <a8 >a8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <g+8 >g+8 <g+8 >g+8 <g+8 >g+8 r16 <g+16 >g+8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <g+8 >g+8 <g+8 >g+8 <g+8 >g+8 <g+8 >g+8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <a8 >a8 <a8 >a8 <a8 >a8 <a8 >a8;@3 t135 q50 v76 r2 r2 [o3f+o3ao4c+o4e]2 r2 [o3g+o4co4d+o4f+o5e]2 r2 [o3c+o3eo3g+o3b]2 r2 [o3eo3g+o3bo4d]2 r2 [o3f+o3ao4c+o4e]2 r2 [o3g+o4co4d+o4f+o5e]2 r2 [o3c+o3eo3g+o3b]2 r2 [o3f+o3ao4g+o4c+]2 [o4eo3ao3f+]2 [o3f+o3ao4c+o4e]2 r2 [o3g+o4co4d+o4f+o5e]2 r2 [o3c+o3eo3g+o3b]2 r2 [o3eo3g+o3bo4d]2 r2 [o3f+o3ao4c+o4e]2 r2 [o3g+o4co4d+o4f+o5e]2 r2 [o3c+o3eo3g+o3b]2 r2 [o3f+o3ao4g+o4c+]2 [o4eo3ao3f+]2', 7, 1, 0, 0, 1, 0, 0, 0, NULL, NULL, 'from-cyan-400 to-blue-500', 0, 23, 0),
  (11, 11, NULL, '名無しJk8', 'Jk8', datetime('now', '-10 minutes'), '#コード進行' || char(10) || '# t185' || char(10) || '# Bメロ' || char(10) || '|Am7(b5)/G|F6|Dm7|Gm' || char(10) || '|Cm7Dm7|EbDm7|EbF/Eb|D7F/G' || char(10) || char(10) || '# サビ' || char(10) || '|Gm|F6|Eb|Gm7' || char(10) || '|Cm6D|DmGm7|Cm6Dm7|GM7' || char(10) || char(10) || '|Eb|F|Dm7|Gm7' || char(10) || '|EbM7|F|Gm7|G', 15, 0, 0, 0, 2, 2, 0, 0, NULL, NULL, 'from-rose-400 to-pink-600', 0, 45, 0),
  (12, 12, NULL, '名無しvFZ', 'vFZ', datetime('now', '-1 minutes'), 'https://www.youtube.com/watch?v=nHyQq2FUxig' || char(10) || char(10) || 'こんなアレンジ見つけたよ' || char(10) || '[東方風アレンジ] サマータイム・ラプソディ・オブ・ア・ディイング・ワールド (東方眠世界)' || char(10) || 'FanTouhouMusic', 8, 0, 0, 0, 2, 1, 0, 0, NULL, NULL, 'from-purple-500 to-pink-600', 0, 34, 0),
  (13, 11, 11, '名無しKt1', 'Kt1', datetime('now'), 'https://api.karotter.com/uploads/posts/346ec30c-dcb6-41d7-8cf7-7ef5ef7e92dc.mp4' || char(10) || char(10) || '作曲したコード進行の動画です' || char(10) || 'Aメロ→Bメロ→サビの構成、7thやdimを交えたおしゃれめ進行', 3, 0, 0, 0, 1, 0, 0, 0, NULL, NULL, 'from-green-400 to-teal-500', 0, 12, 0),
  (14, 11, 11, '名無しWk2', 'Wk2', datetime('now', '-30 seconds'), 'このコード進行ほんとおしゃれ…BメロのAm7(b5)が効いてる', 5, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-orange-400 to-red-500', 0, 8, 0),
  (15, 11, 11, '名無しQm9', 'Qm9', datetime('now'), '7thとdimの組み合わせがオシャレすぎる', 2, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-teal-400 to-cyan-500', 0, 3, 0),
  (16, 1, 1, '名無しRf6', 'Rf6', datetime('now', '-2 hours'), '外スケッチいいな！私も今度やってみよう', 8, 1, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-sky-400 to-indigo-500', 0, 14, 0),
  (17, 5, 5, '名無しHn3', 'Hn3', datetime('now', '-15 minutes'), 'lofiは作業効率上がるよね、自分も愛用してる', 4, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-lime-400 to-green-500', 0, 6, 0),
  (18, 3, 3, '名無しPz5', 'Pz5', datetime('now', '-5 hours'), 'こちらはもう桜が咲き始めましたよ〜春ですね', 11, 0, 0, 0, 0, 1, 0, 0, NULL, NULL, 'from-pink-300 to-rose-400', 0, 28, 0),
  (101, 1, 1, '名無しxY7', 'xY7', datetime('now', '-2 hours'), 'いい感じ！色使いが好き', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (102, 1, 1, '名無しQw3', 'Qw3', datetime('now', '-1 hours'), '外で描くの気持ちいいよね', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (103, 2, 2, '名無しTp4', 'Tp4', datetime('now', '-4 hours'), 'デバッグ頑張って！', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (104, 3, 3, '名無しDf2', 'Df2', datetime('now', '-7 hours'), 'こっちはもう桜咲きそう', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (105, 3, 3, '名無しGh6', 'Gh6', datetime('now', '-6 hours'), '地域によって違うよね〜', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (106, 3, 3, '名無しJk9', 'Jk9', datetime('now', '-5 hours'), '写真綺麗！', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (107, 5, 5, '名無しWx8', 'Wx8', datetime('now', '-20 hours'), '自分は環境音派', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (108, 5, 5, '名無しYz2', 'Yz2', datetime('now', '-18 hours'), 'シティポップおすすめ', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (109, 6, 6, '名無しRt3', 'Rt3', datetime('now', '-1 days'), 'かわいい！使っていい？', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (110, 6, 6, '名無しUv6', 'Uv6', datetime('now', '-1 days'), 'ドット絵いいな、僕も始めよう', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (111, 8, 8, '名無しAs5', 'As5', datetime('now', '-3 days'), '全部素敵！特に3枚目が好き', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (112, 8, 8, '名無しDf9', 'Df9', datetime('now', '-3 days'), 'ペースすごいな、尊敬する', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (113, 8, 8, '名無しGh2', 'Gh2', datetime('now', '-2 days'), 'もっと見たいです！', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (114, 9, 9, '名無しJk3', 'Jk3', datetime('now', '-1 hours'), 'かっこいい！コード進行いいね', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (115, 12, 12, '名無しLz9', 'Lz9', datetime('now'), 'このアレンジ良すぎる', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (201, 11, 11, '名無しKt1', 'Kt1', datetime('now'), '作曲したコード進行の動画です Aメロ→Bメロ→サビの構成、7thやdimを交えたおしゃれめ進行', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (202, 11, 11, '名無しWk2', 'Wk2', datetime('now', '-30 seconds'), 'このコード進行ほんとおしゃれ…BメロのAm7(b5)が効いてる', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (301, 11, 11, '名無しQm9', 'Qm9', datetime('now'), '7thとdimの組み合わせがオシャレすぎる', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (401, 1, 1, '名無しRf6', 'Rf6', datetime('now', '-2 hours'), '外スケッチいいな！私も今度やってみよう', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (501, 5, 5, '名無しHn3', 'Hn3', datetime('now', '-15 minutes'), 'lofiは作業効率上がるよね、自分も愛用してる', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0),
  (601, 3, 3, '名無しPz5', 'Pz5', datetime('now', '-5 hours'), 'こちらはもう桜が咲き始めましたよ〜春ですね', 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'from-blue-400 to-indigo-500', 0, 0, 0);
