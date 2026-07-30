# Neon 転送量の抑え方

Neon の無料枠は **公衆網転送 5GB/月**。これを 1タブ・1ユーザーで数日で使い切り、
`NeasonDbError: Server error (HTTP status 402) Your project has exceeded the data transfer quota`
で全断した。その再発防止のための決めごとをまとめる。

## 何が食っていたか

| 経路 | 頻度 | 中身 |
|---|---|---|
| フィード再取得 `getPosts` | 15秒 | `SELECT p.*` で20スレッド + **全スレッドの全返信**（`getThreadReplies` に上限なし）+ ハート数の相関サブクエリ20本 |
| `attachGameInfo` → `getGamesByIds` | 同上 | `SELECT *` で **`games.manifest` 全文**（ゲーム1本＝スプライトやマップ込みで数百KB〜）。実際に使うのは `title` と `bgRef` 1本だけ |
| `/api/games/players` | 2秒 | upsert + `SELECT` + **位置更新のたびに全表 `DELETE ... WHERE updated_at < now()-15s`** |
| `/api/posts/[id]/replies` | 2〜3秒 | 返信リスト全文を毎回取り直して差分計算（実況コメント用） |
| 通知一覧 | 20秒 | `SELECT *` LIMIT 20 |

内訳としては「1回あたりが太い」問題（manifest・返信全件）と
「頻度が高い」問題（2〜3秒ポーリング）が掛け算になっていた。

## 決めごと

### 1. 射影を絞る

- **`posts` に `SELECT p.*` を使わない。** `lib/db/pg.ts` の `POST_COLUMNS` を使う。
- `POST_COLUMNS` は **`display_name` を含まない**。`anonymous_users` との JOIN で
  `COALESCE(au.display_name, p.display_name) as display_name` を必ず併記すること。
  忘れると全投稿の投稿者が「名無し」になる（`rowToPost` のフォールバック）。
- `liked` / `disliked` は `post_votes` 由来の値で必ず上書きされる死に列なので含めない。
- 通知スニペットのために `content` 全文を引かない。`LEFT(content, 20)` で足りる。

### 2. `games.manifest` を一覧クエリで引かない

`getGamesByIds` は `substring(g.manifest::text from '"bgRef"...')` で
サムネイルURLだけを DB 側で抜き、manifest 列自体は転送しない。

> POSIX 正規表現側で `\s` ではなく `[[:space:]]` を使っているのは、
> JS のテンプレートリテラルで `\s` が `s` に潰れるため。

### 3. 集計は非正規化列で持つ

ハート数は `posts.hearts_total`。`COUNT(*) FROM post_hearts` の相関サブクエリは使わない。
書き込み側（`heartPost`）がカウンタを加算する責任を持つ。

> 移行時の注意: この列は以前から存在したが **一度も更新されていなかった**。
> migration `11_denormalize_hearts_total` が既存分を実数へ backfill する。
> これを飛ばすと全投稿のハートが 0 に見える。

### 4. フィードの返信に上限をかける

`FEED_REPLIES_PER_THREAD`（20件）。ウィンドウ関数でスレッドごとに新しい順で絞る。
スレッド詳細（`getPost`）は従来どおり全件読む。

副作用: フィードの「メディア」「返信」サブタブは、各スレッドの新しい20件からしか拾わない。

### 5. カウンタ更新APIは返信を返さない

いいね／低評価／ハート／リポストのレスポンスは `replies: []`。
クライアントは `mergePostCounters`（`lib/post-merge.ts`）で手元の返信を保持したままマージする。
素で置き換えると画面から返信が消える。

### 6. 読み取りはエッジでキャッシュする

`withEdgeCache`（`lib/edge-cache.ts`）を通す。

> **Cloudflare Workers は Worker が生成したレスポンスを `Cache-Control` だけでは CDN に載せない。**
> 共有キャッシュに載せるには Cache API（`caches.default`）を明示的に叩く必要がある。
> ヘッダだけ足しても Neon へのヒットは1件も減らない。

`userId` 付き（パーソナライズ済み）のレスポンスは `private` に留め、エッジには載せない。

| ルート | TTL | 種別 |
|---|---|---|
| `GET /api/posts` | 10s | 匿名は public / userId 付きは private |
| `GET /api/posts/[id]/replies` | 5s | 同上 |
| `GET /api/notifications` | 10s | 常に private |
| `GET /api/search/trends` | 300s | public（全投稿を舐める重い集計） |
| `GET /api/games/ranking` | 60s | public |

### 7. 定期ポーリングを増やさない

新しい「◯秒ごとに取りに行く」処理を足す前に、
リアルタイムハブへの push で代替できないか検討すること（[services/realtime](../services/realtime/README.md)）。

ハブ設定時、クライアント側の残りのポーリングは取りこぼし用の保険であり、
間隔は `pollInterval(未設定時, ハブあり時)` で切り替える（`lib/hooks/useRealtime.ts`）。

## 索引

`scripts/migrate.mjs` の migration `12_indexes_for_feed_queries` / `13_game_players_cleanup_index`。
特に `idx_posts_thread_id_id (thread_id, id DESC)` が無いと返信の上限付き取り出しが全表走査になる。
