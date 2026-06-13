# ゲーム機能 ⇄ コンテンツ連携 設計

作成日: 2026-06-13

## 1. 目的 / 課題

現状プロダクトは「Twitter + 作曲(MML) + ゲーム」。
ゲーム機能はコンテンツ（投稿）との紐づきが弱い:

- 投稿が持つゲーム情報は `posts.has_game`（boolean）**だけ**。ゲームの内容自体は保存されていない。
- 投稿の「ゲーム」ボタン（`PostContainer` の `openGame`）は、投稿内容と無関係な汎用 `GamePlayer`（`GAME_PRESETS` を再生するだけ）を開く。
- エディタ `GameMaker.tsx` は自己完結のプレイグラウンドで、**保存・投稿への反映機構がない**。

→ 「投稿＝ゲーム作品」になっておらず、作ったゲームが流通しない。

### 既存の2系統（要統合）

| 系統 | 構成 | 性質 |
|---|---|---|
| A: マニフェスト系 | `lib/game-config.ts`(`GameManifest`) + `lib/engines/*`(rpg/platformer/bullet-hell) + `EngineRunner` + `AssetProvider` + `GamePlayer` | **テキスト(JSON)シリアライズ可能**。DB保存に向く |
| B: GameMaker系 | `components/GameMaker.tsx`（独自 `PRESETS`: action/rpg/touhou、独自ループ） | 編集UIは持つが保存不可・型がマニフェストと別 |

**方針: マニフェスト系(A)を正とし、編集UI(B)をマニフェストを生成・編集するエディタへ作り変える。**
ゲームは `GameManifest`(JSON) としてテキスト保存し、アセットは実体を埋め込まず**参照(URI)**で持つ。

---

## 2. プリセット → エンジンのマッピング

要求された5プリセットは既存3エンジンへ集約する（エンジン追加なしで成立）。差別化はタイルセット・物理パラメータ・初期マップ・スプライト・操作系で行う。

| プリセット | ラベル | genre(engine) | 特徴 |
|---|---|---|---|
| `dq` | ドラクエ | `rpg` | 4方向歩行、会話NPC、城/ダンジョン、戦闘風味 |
| `pokemon` | ポケモン | `rpg` | 4方向歩行、草むらエンカウント、建物出入り |
| `mario` | マリオ | `platformer` | 重力・ジャンプ、ブロック/ハテナ/ゴール |
| `rockman` | ロックマン | `platformer` | 重力・ジャンプ + ショット、敵/トゲ |
| `touhou` | 東方 | `bullet-hell` | 8方向移動、自機ショット、狙い弾/弾幕ボス、被弾判定(小) |

`game-config.ts` の `Genre` は3種のまま。`preset` 識別子を別フィールドで持つ。

---

## 3. アセット参照規約（容量削減の核）

ゲームデータに画像・音の**実体（base64やバイナリ）を入れない**。すべて短い参照文字列（URI）で表現する。`scheme:value` 形式。

### 3.1 BGM / 効果音(SE)
| URI | 意味 |
|---|---|
| `youtube:VIDEO_ID` | YouTube動画をBGMに（`BgmManager.playYoutube` 既存対応） |
| `mml:post:123` | 既存の**MML投稿(id=123)** を参照。投稿本文から `extractMmlFromContent` で抽出して再生 |
| `mml:T120 cdefg` | 短いインラインMML（SE用途、数十バイト程度） |
| `none` / 空 | なし |

> 既存 `BgmAsset = { type: 'midi'|'mml'|'youtube'; src }` を `AssetRef`(string) に寄せる。互換のため `BgmManager` 側でURIをパースして従来分岐へ橋渡しする。

### 3.2 画像 / スプライト
| URI | 意味 |
|---|---|
| `post:123` | 既存の**画像投稿(id=123)** の `image_src` を参照 |
| `walk:123#s0` | 既存**歩行グラ投稿(id=123)** を `walk-cycle` 規格で分割し、方向`s`(前)・フレーム`0`を使用。アニメは方向ごとに全フレーム使う |
| `walk:url:https://…#s0` | 直URLの歩行グラを規格分割 |
| `url:https://i.imgur.com/...png` | 画像URL（`lib/embed.ts` の image パーサ対応サイト or 直リンク） |
| `tile:#2d5a27` | 単色タイル（現行 `tileset[].color` 運用と互換） |
| `emoji:🍄` | 絵文字スプライト（現行 GameMaker の手軽さを継承） |

スプライト解決は `AssetProvider.resolveSprite` を実装する `ApiAssetProvider` が担当（現状 throw のスタブ）。`post:` / `walk:` は投稿APIから `image_src` を引いて `HTMLImageElement` 化、`walk:` はさらに `detectPreset`→セル切り出し。

---

## 4. データモデル / DBスキーマ（neon = Postgres）

### 4.1 新規テーブル `games`

ゲーム本体はテキスト(JSONB)で1行に保存。アセットは参照URIのみなので軽量。

```sql
CREATE TABLE IF NOT EXISTS games (
  id          SERIAL PRIMARY KEY,
  post_id     INTEGER REFERENCES posts(id) ON DELETE CASCADE, -- 紐づく投稿(下書き中はNULL)
  author_id   TEXT,                       -- anonymous_users.id
  title       TEXT NOT NULL,
  preset      TEXT NOT NULL,              -- 'dq'|'mario'|'touhou'|'pokemon'|'rockman'
  genre       TEXT NOT NULL,              -- 'rpg'|'platformer'|'bullet-hell'
  manifest    JSONB NOT NULL,            -- GameManifest本体。アセットは参照URIのみ
  version     INTEGER NOT NULL DEFAULT 1,
  plays       INTEGER NOT NULL DEFAULT 0,
  clears      INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_games_post   ON games(post_id);
CREATE INDEX IF NOT EXISTS idx_games_author ON games(author_id);
```

`manifest` の中身（参照のみ＝軽量。代表例）:
```json
{
  "preset": "mario",
  "genre": "platformer",
  "name": "1-1 リメイク",
  "scene": {
    "cols": 20, "rows": 15, "tileSize": 16,
    "tiles": [[0,0,1,...], ...],
    "playerStart": { "col": 3, "row": 3 },
    "npcs": [{ "id":"n1","col":10,"row":5,"sprite":"emoji:🐢","color":"#393","script":"hello" }]
  },
  "assets": {
    "bgm": "youtube:0_jEpB40aYw",
    "player": "walk:42#s0",
    "tileset": { "1": "tile:#8B4513", "2": "tile:#FFD700" }
  }
}
```

### 4.2 `posts` への紐づけ

```sql
ALTER TABLE posts ADD COLUMN IF NOT EXISTS game_id INTEGER REFERENCES games(id);
```
- 投稿がゲーム作品なら `game_id` をセット、`has_game=true`（既存フラグは互換維持）。
- フィード/詳細は `game_id` から `games` を引き、その `manifest` で **その投稿固有のゲーム**を起動する（＝紐づきの強化）。

> 代替案: `posts.content` に `game:42` テキスト規約を埋め、`embed.ts` の延長で解決する方式（画像/動画と同じ「本文URL検出」哲学に揃う）。本設計では検索・集計しやすい **FK(`game_id`)方式を主**とし、本文規約は将来の外部共有用に予約。

### 4.3 sqlite / mock の整合

`lib/db/{sqlite,mock}.ts` と `docker/init.sql` / `init.sqlite.sql` にも同等のテーブル/カラムを追加し、`DataStore` に以下を足す:
```ts
createGame(data): Promise<Game>;
getGame(id): Promise<Game | null>;
updateGame(id, data): Promise<Game | null>;
attachGameToPost(postId, gameId): Promise<void>;
```

---

## 5. 投稿フロー（紐づきの強化）

```
[投稿コンポーザ] --ゲームボタン--> [ゲームエディタ(プリセット選択→編集→テストプレイ)]
   └ 保存 → games へ INSERT(post_idはまだNULL) → gameId 取得
            → コンポーザに戻り、下書きに gameId を保持・サムネ表示
   └ 投稿 → createPost 後に attachGameToPost(postId, gameId)
            → posts.game_id, has_game=true
[フィード] post.game_id があれば GamePlayer(manifest=その投稿のゲーム) を起動
```

- エディタの導線は `app/page.tsx` の `activeScreen==='gamemaker'`（既存）を流用。`onSave(gameId, summary)` を追加。
- `GamePlayer` は `GAME_PRESETS` 固定再生をやめ、`manifest` を props で受けて起動できるようにする（プリセット切替は新規作成時のみ）。

---

## 6. エディタUI（モバイルファースト / リッチ）

`GameMaker` を再構成。ヘッダ + キャンバス + 下部タブ(モバイルは縦積み)。

- **プリセット**: ドラクエ / マリオ / 東方 / ポケモン / ロックマン（5枚カード or セレクト）
- **タブ**:
  1. `マップ`: タイルパレット選択→キャンバスをタップ/ドラッグで配置（既存挙動を継承）
  2. `キャラ`: プレイヤー見た目（絵文字 / 画像投稿 / 歩行グラ から選択）、速度・ジャンプ等パラメータ
  3. `アセット`: BGM/SE（YouTube URL / 既存MML投稿ピッカー / インラインMML）、タイル画像（画像投稿・歩行グラ・URLピッカー）
  4. `テスト`: その場プレイ（タッチパッド）
- **コンテンツピッカー**（新規共通UI）: 既存投稿（画像/MML/歩行グラ）を検索して参照URIを生成。`ImportDialog`(URL/ファイル/歩行グラ検出) の作法を踏襲。

---

## 7. 実装フェーズ

1. **データ層**: `games` テーブル + `posts.game_id`、`DataStore` 拡張（pg/sqlite/mock）、`docker/init*.sql`、`lib/api.ts` に `games` エンドポイント。型 `Game` / `GameManifest` 拡張(`preset`)。
2. **アセット参照**: `lib/asset-ref.ts`（URIパーサ/シリアライザ）、`ApiAssetProvider.resolveSprite` 実装、`BgmManager` をURI対応に。
3. **プリセット**: `game-presets.ts` を5プリセットへ拡張（preset識別子付き）。
4. **エディタ**: `GameMaker` 再構成（タブ/プリセット/ピッカー）+ `ContentPicker` 新規。保存→`onSave(gameId)`。
5. **プレイ統合**: `GamePlayer` を `manifest` 駆動に。`PostContainer` の `openGame` をその投稿の `game_id` で起動。
6. **検証**: dev サーバでコンポーザ→エディタ→保存→投稿→フィードで起動、を確認。

---

## 8. 留意点

- `AGENTS.md`: この Next.js は破壊的変更あり。実装前に `node_modules/next/dist/docs/` の該当ガイドを参照。
- 既存 `has_game` 投稿（シードデータ）は `game_id` NULL のまま → 従来どおり汎用 `GamePlayer` フォールバック可。
- 容量目標: 1ゲーム = マップ(20x15=300 int) + 参照URI数本 ≒ 数KB のJSON。画像/音の実体は持たない。
