-- PostgreSQL用初期化スクリプト（Neon互換）

-- 通知テーブル
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- メッセージテーブル
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- トレンドテーブル
CREATE TABLE IF NOT EXISTS trends (
  id INTEGER PRIMARY KEY,
  keyword TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);

-- 投稿テーブル
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL,
  slug TEXT,
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
  reply_to INTEGER REFERENCES posts(id)
);

-- 返信テーブル
CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  slug TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === 通知データ ===
INSERT INTO notifications (id, user_name, action, target, created_at) VALUES
  (1, '名無しXz9', 'がいいねしました', '青空の写真', NOW() - INTERVAL '3 minutes'),
  (2, '名無しLm8', 'がリポストしました', 'ドット絵の練習中', NOW() - INTERVAL '8 minutes'),
  (3, '名無しBn5', 'が返信しました', '作業用BGM何聴いてる？', NOW() - INTERVAL '15 minutes'),
  (4, '名無しVc1', 'がフォローしました', '', NOW() - INTERVAL '1 hour');

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

-- === 投稿データ ===
INSERT INTO posts (id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game, reply_to) VALUES
  (1, '名無しaB3', 'aB3', NOW() - INTERVAL '3 hours', E'#お絵描き\n今日の落書き 天気いいから外でスケッチした', 42, 0, false, false, 12, 5, false, true, 'sketch_01.png', '公園のベンチで描いたスケッチ', 'from-sky-400 to-blue-500', true, 320, false, NULL),
  (2, '名無しR9k', 'R9k', NOW() - INTERVAL '5 hours', E'今週の #ゲーム 進捗\nステージ3のボス戦やっと実装できた\nあとは調整だけどバグが取れない…', 18, 3, false, false, 7, 1, false, false, NULL, NULL, 'from-red-500 to-rose-600', true, 95, true, NULL),
  (3, '名無しLm8', 'Lm8', NOW() - INTERVAL '8 hours', E'朝起きたら雪積もっててびっくりした\nもう春だと思ってたのに', 56, 2, false, false, 19, 8, false, true, 'snow_morning.jpg', '朝の雪景色', 'from-gray-300 to-slate-400', false, 612, false, NULL),
  (4, '名無しVc1', 'Vc1', NOW() - INTERVAL '12 hours', E'#お絵描き\n久しぶりに描いた 練習帳', 33, 1, false, false, 9, 3, false, true, 'practice_sketch.png', 'キャラクターの表情練習', 'from-purple-400 to-violet-500', true, 278, false, NULL),
  (5, '名無しBn5', 'Bn5', NOW() - INTERVAL '1 day', E'作業用BGM何聴いてる？\n最近はlofiばかり', 21, 0, false, false, 31, 2, false, false, NULL, NULL, 'from-emerald-400 to-teal-500', false, 45, false, NULL),
  (6, '名無しQp7', 'Qp7', NOW() - INTERVAL '2 days', E'#お絵描き #ゲーム\nドット絵の練習中\nキャラチップ自作すると愛着湧くね', 67, 4, false, false, 15, 12, false, true, 'dot_character.png', '自作のドット絵キャラクター', 'from-amber-400 to-yellow-500', true, 890, false, NULL),
  (7, '名無しNe4', 'Ne4', NOW() - INTERVAL '3 days', E'今週のお題「青空」に参加\nみんなの投稿も見に行こう', 12, 0, false, false, 4, 0, false, true, 'blue_sky.jpg', '青空と雲の写真', 'from-cyan-400 to-indigo-500', true, 67, false, NULL),
  (8, '名無しXz9', 'Xz9', NOW() - INTERVAL '4 days', E'#お絵描き\n描きためたイラストまとめ\n今月は10枚描けたぞ', 89, 2, false, false, 22, 15, false, true, 'illust_summary.png', '今月描いたイラスト集', 'from-pink-400 to-rose-500', true, 1250, false, NULL),
  (9, '名無しMm1', 'Mm1', NOW() - INTERVAL '2 hours', E'てすや\n#mml @0t135q50v100r8o4d+8e8r8f+8r8d+8c8c+8<b8>c+8f+8g+8r8f+8e8f+8r8e8c+8d+8e8d+8c8c+8r4<b8>c+8d+8e8d+8r8e8g+8r8f+8r8b8r8f+8g+8f+8d+8e8r8c+8d+8e8r8d+8c8d+8e8d+8c8c+8r4r8;@1t135q50v95;@2t135q50v88;@3t135q50v76[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2[o3f+o3ao4c+o4eo4g+]2[o3g+o4co4d+o4f+o5e]2[o3c+o3eo3g+o3bo4d+]2[o3bo4d+o4f+o4ao5c+o5eo5g+]2', 15, 0, false, false, 3, 2, false, false, NULL, NULL, 'from-pink-400 to-rose-500', false, 88, false, NULL);
INSERT INTO posts (id, display_name, slug, created_at, content, likes, dislikes, liked, disliked, replies_count, reposts, reposted, has_image, image_src, image_alt, avatar_color, has_collab_button, hearts_total, has_game, reply_to) VALUES
  (10, '名無しTb7', 'Tb7', NOW() - INTERVAL '30 minutes', E'#mml @0 t135 q50 v100 r2 r2 o4e8 r8 e8 e8 g+8 r8 f+8 r8 c8 b8 b8 b8 g+8 r8 e8 g+8 >e8 r4 e8 e8 r8 d+8 c+8 <b8 >c+8 <b8 a8 g+8 r8 d8 r8 e8 e8 e8 e8 c+8 c+8 a8 f+8 g+8 f+8 e8 g+8 f+8 c8 g+8 f+8 e8 r8 e8 e8 c+8 r8 f+8 r8 g+8 f+8 e8 g+8 e8 r8 c+8 d+8 e8 r8 e8 e8 g+8 r8 f+8 r8 c8 b8 b8 b8 g+8 r8 e8 g+8 >e8 r4 e8 e8 r8 d+8 c+8 <b8 >c+8 <b8 a8 g+8 r8 d8 r8 e8 e8 e8 e8 c+8 c+8 a8 f+8 g+8 f+8 e8 g+8 f+8 c8 g+8 f+8 e8 r8 e8 e8 c+8 r8 f+8 r8 g+8 f+8 e8 g+8 e8 r8 c+8 d+8;@1 t135 q50 v95 r2 r2 r2 r2 r2 r2 r2 r2 r4 r8 o6e8 b8 a24 b24 a24 g+8 f+8 g+8 r4 r8 r2 r2 r2 r2 r2 r8 e8 f+8 g8 g+8 f+24 g+24 f+24 e8 g+8 e8 r4 r8 r2 r2 r2 r2 r2 r4 r8 e8 b8 a24 b24 a24 g+8 f+8 g+8 r4 r8 r2 r2 r2 r2 r2 r8 e8 f+8 g8 g+8 f+24 g+24 f+24 e8 g+8 e8 r4 r8;@2 t135 q50 v88 r2 r2 o2f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <g+8 >g+8 <g+8 >g+8 <g+8 >g+8 r16 <g+16 >g+8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <g+8 >g+8 <g+8 >g+8 <g+8 >g+8 <g+8 >g+8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <a8 >a8 <a8 >a8 <a8 >a8 <a8 >a8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <g+8 >g+8 <g+8 >g+8 <g+8 >g+8 r16 <g+16 >g+8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <f+8 >f+8 <g+8 >g+8 <g+8 >g+8 <g+8 >g+8 <g+8 >g+8 <e8 >e8 <e8 >e8 <e8 >e8 <e8 >e8 <a8 >a8 <a8 >a8 <a8 >a8 <a8 >a8;@3 t135 q50 v76 r2 r2 [o3f+o3ao4c+o4e]2 r2 [o3g+o4co4d+o4f+o5e]2 r2 [o3c+o3eo3g+o3b]2 r2 [o3eo3g+o3bo4d]2 r2 [o3f+o3ao4c+o4e]2 r2 [o3g+o4co4d+o4f+o5e]2 r2 [o3c+o3eo3g+o3b]2 r2 [o3f+o3ao4g+o4c+]2 [o4eo3ao3f+]2 [o3f+o3ao4c+o4e]2 r2 [o3g+o4co4d+o4f+o5e]2 r2 [o3c+o3eo3g+o3b]2 r2 [o3eo3g+o3bo4d]2 r2 [o3f+o3ao4c+o4e]2 r2 [o3g+o4co4d+o4f+o5e]2 r2 [o3c+o3eo3g+o3b]2 r2 [o3f+o3ao4g+o4c+]2 [o4eo3ao3f+]2', 7, 1, false, false, 1, 0, false, false, NULL, NULL, 'from-cyan-400 to-blue-500', false, 23, false, NULL),
  (11, '名無しJk8', 'Jk8', NOW() - INTERVAL '10 minutes', E'#chord\n# t185\n# Bメロ\n|Am7(b5)/G|F6|Dm7|Gm\n|Cm7Dm7|EbDm7|EbF/Eb|D7F/G\n\n# サビ\n|Gm|F6|Eb|Gm7\n|Cm6D|DmGm7|Cm6Dm7|GM7\n\n|Eb|F|Dm7|Gm7\n|EbM7|F|Gm7|G', 15, 0, false, false, 2, 2, false, false, NULL, NULL, 'from-rose-400 to-pink-600', false, 45, false, NULL),
  (12, '名無しvFZ', 'vFZ', NOW() - INTERVAL '1 minute', E'https://www.youtube.com/watch?v=nHyQq2FUxig\n\nこんなアレンジ見つけたよ\n[東方風アレンジ] サマータイム・ラプソディ・オブ・ア・ディイング・ワールド (東方眠世界)\nFanTouhouMusic', 8, 0, false, false, 2, 1, false, false, NULL, NULL, 'from-purple-500 to-pink-600', false, 34, false, NULL),
  (13, '名無しKt1', 'Kt1', NOW(), E'https://api.karotter.com/uploads/posts/346ec30c-dcb6-41d7-8cf7-7ef5ef7e92dc.mp4\n\n作曲したコード進行の動画です\nAメロ→Bメロ→サビの構成、7thやdimを交えたおしゃれめ進行', 3, 0, false, false, 1, 0, false, false, NULL, NULL, 'from-green-400 to-teal-500', false, 12, false, 11),
  (14, '名無しWk2', 'Wk2', NOW() - INTERVAL '30 seconds', E'このコード進行ほんとおしゃれ…BメロのAm7(b5)が効いてる', 5, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-orange-400 to-red-500', false, 8, false, 11),
  (15, '名無しQm9', 'Qm9', NOW(), E'7thとdimの組み合わせがオシャレすぎる', 2, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-teal-400 to-cyan-500', false, 3, false, 13),
  (16, '名無しRf6', 'Rf6', NOW() - INTERVAL '2 hours', E'外スケッチいいな！私も今度やってみよう', 8, 1, false, false, 0, 0, false, false, NULL, NULL, 'from-sky-400 to-indigo-500', false, 14, false, 1),
  (17, '名無しHn3', 'Hn3', NOW() - INTERVAL '15 minutes', E'lofiは作業効率上がるよね、自分も愛用してる', 4, 0, false, false, 0, 0, false, false, NULL, NULL, 'from-lime-400 to-green-500', false, 6, false, 5),
  (18, '名無しPz5', 'Pz5', NOW() - INTERVAL '5 hours', E'こちらはもう桜が咲き始めましたよ〜春ですね', 11, 0, false, false, 0, 1, false, false, NULL, NULL, 'from-pink-300 to-rose-400', false, 28, false, 3);

-- === 返信データ ===
INSERT INTO replies (id, post_id, display_name, slug, content, created_at) VALUES
  (101, 1, '名無しxY7', 'xY7', E'いい感じ！色使いが好き', NOW() - INTERVAL '2 hours'),
  (102, 1, '名無しQw3', 'Qw3', E'外で描くの気持ちいいよね', NOW() - INTERVAL '1 hour'),
  (401, 1, '名無しRf6', 'Rf6', E'外スケッチいいな！私も今度やってみよう', NOW() - INTERVAL '2 hours'),
  (103, 2, '名無しTp4', 'Tp4', E'デバッグ頑張って！', NOW() - INTERVAL '4 hours'),
  (104, 3, '名無しDf2', 'Df2', E'こっちはもう桜咲きそう', NOW() - INTERVAL '7 hours'),
  (105, 3, '名無しGh6', 'Gh6', E'地域によって違うよね〜', NOW() - INTERVAL '6 hours'),
  (106, 3, '名無しJk9', 'Jk9', E'写真綺麗！', NOW() - INTERVAL '5 hours'),
  (601, 3, '名無しPz5', 'Pz5', E'こちらはもう桜が咲き始めましたよ〜春ですね', NOW() - INTERVAL '5 hours'),
  (107, 5, '名無しWx8', 'Wx8', E'自分は環境音派', NOW() - INTERVAL '20 hours'),
  (108, 5, '名無しYz2', 'Yz2', E'シティポップおすすめ', NOW() - INTERVAL '18 hours'),
  (501, 5, '名無しHn3', 'Hn3', E'lofiは作業効率上がるよね、自分も愛用してる', NOW() - INTERVAL '15 minutes'),
  (109, 6, '名無しRt3', 'Rt3', E'かわいい！使っていい？', NOW() - INTERVAL '1 day'),
  (110, 6, '名無しUv6', 'Uv6', E'ドット絵いいな、僕も始めよう', NOW() - INTERVAL '1 day'),
  (111, 8, '名無しAs5', 'As5', E'全部素敵！特に3枚目が好き', NOW() - INTERVAL '3 days'),
  (112, 8, '名無しDf9', 'Df9', E'ペースすごいな、尊敬する', NOW() - INTERVAL '3 days'),
  (113, 8, '名無しGh2', 'Gh2', E'もっと見たいです！', NOW() - INTERVAL '2 days'),
  (114, 9, '名無しJk3', 'Jk3', E'かっこいい！コード進行いいね', NOW() - INTERVAL '1 hour'),
  (201, 11, '名無しKt1', 'Kt1', E'作曲したコード進行の動画です Aメロ→Bメロ→サビの構成、7thやdimを交えたおしゃれめ進行', NOW()),
  (202, 11, '名無しWk2', 'Wk2', E'このコード進行ほんとおしゃれ…BメロのAm7(b5)が効いてる', NOW() - INTERVAL '30 seconds'),
  (115, 12, '名無しLz9', 'Lz9', E'このアレンジ良すぎる', NOW()),
  (301, 13, '名無しQm9', 'Qm9', E'7thとdimの組み合わせがオシャレすぎる', NOW());
