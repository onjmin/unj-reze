# ゲーム機能 設計メモ

## DBスキーマ

### `games` テーブル（新規）
```sql
CREATE TABLE games (
  id INTEGER PRIMARY KEY,
  preset TEXT NOT NULL,
  title TEXT NOT NULL,
  manifest TEXT NOT NULL,  -- JSON (GameManifestDraft)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `posts` テーブル
```sql
ALTER TABLE posts ADD COLUMN game_id INTEGER REFERENCES games(id);
```

## アセット参照規約
- `mml:post:123`   — MML投稿参照
- `yt:VIDEO_ID`    — YouTube ID
- `post:123`       — 投稿画像参照
- `walk:123#s0`    — 歩行グラ参照
- `url:https://…`  — 外部URL

## フロー
1. ゲームボタン → GameMaker開く
2. 編集 → 「投稿に添付」→ gameDraft に保持
3. 「投稿」→ POST /api/games → game_id取得 → POST /api/posts に含める
4. 投稿からゲームアイコン → GET /api/games/:id → GamePlayer再生
