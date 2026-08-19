# 現状のDSL/アセット参照 まとめ

ゲーム機能（GameMaker）における「テキストで記述できる仕組み」の現状を整理する。
将来の統合DSL検討の前提資料。関連: [game-feature-design.md](./game-feature-design.md)

## 1. 全体像：3層構造

| 層 | 実体 | 形式 | ファイル |
|---|---|---|---|
| ① ゲームデータ本体 | `PresetData`（配置・マップ・シーン・セリフ・イベント） | プレーンなTSオブジェクト（GUIエディタが直接編集、テキストDSLではない） | [components/game-presets/shared.ts](../components/game-presets/shared.ts) |
| ② 手続きスクリプト | 弾幕パターン等の挙動 | 独自テキストDSL「MiniScript」 | [components/MiniScriptVM.ts](../components/MiniScriptVM.ts) |
| ③ アセット参照 | 画像/BGM/SEの出典 | `scheme:value` 形式の短い文字列リファレンス | [lib/asset-ref.ts](../lib/asset-ref.ts) |

①は複数プリセット（rockman/dq/touhou/onjReze等）共通のGUI（[GameMaker.tsx](../components/GameMaker.tsx)）が直接編集する構造化データであり、現状テキストDSLとしては存在しない（テキスト化はまだ未実装の検討事項）。
②③は既に実テキスト形式として運用されている。

---

## 2. MiniScript（手続きDSL）

- 対象：touhouプリセットのボス/雑魚の弾幕パターン（`ObjectDef.miniScript` / `SpellCardDef.miniScript`）のみ。他プリセットは未使用。
- 構文：`if/end if`、`while/end while`、`for/end for`、`wait(frames)`、`shot(angle,speed,delay)`、`moveTo(x,y,frames)` 等の手続き的命令＋式評価。
- 編集UI：GameMaker.tsx内の`<textarea>`で生テキストとして直接編集（[GameMaker.tsx:5249](../components/GameMaker.tsx:5249) 等）。

---

## 3. アセット参照DSL（`lib/asset-ref.ts`）

`scheme:value` 形式の軽量リファレンス文字列。実体（base64等）は埋め込まず、短い参照だけを`ObjectDef`等のフィールドに保持する。

### 画像・スプライト系

| scheme | 例 | 意味 |
|---|---|---|
| `post:` | `post:123` | 既存の画像投稿(id=123)を参照 |
| `walk:` | `walk:rpgen:p:123` | 歩行グラ（キャラチップ）参照。詳細は §4 |
| `url:` | `url:https://i.imgur.com/xxxx.png` | 外部URL直リンク |
| `tile:` | `tile:#2d5a27` | 単色タイル（画像不要、色のみ） |
| `emoji:` | `emoji:🍄` | 絵文字スプライト（画像不要） |

### BGM・SE系

| scheme | 例 | 意味 |
|---|---|---|
| `youtube:` | `youtube:VIDEO_ID` | YouTube動画をBGM/SEとして参照（素のURLも自動変換） |
| `mml:` | `mml:post:123` / `mml:T120 cdefg` | MML（Music Macro Language）。既存MML投稿参照 or インライン記述 |
| `none` | `none` | 未設定 |

スキーム不明の文字列はすべて`url`として扱われるフォールバック設計（[asset-ref.ts:30](../lib/asset-ref.ts:30)）。

---

## 4. 歩行グラ（キャラチップ）規格 — `walk:` の中身

`walk:<stdId>:<source>` 形式。`stdId`でシート画像のグリッド規格（セルサイズ・コマ数・行=方向の並び順）を指定する。

### サポート規格一覧（[lib/walk-sprite.ts](../lib/walk-sprite.ts)）

| stdId | 名称 | セルサイズ(px) | 1方向あたりコマ数 | 備考 |
|---|---|---|---|---|
| `auto` | 自動推定 | — | — | 実寸から規格を推定（省略時デフォルト） |
| `rpgen` | RPGEN | 16×16 | 2 | 行順：後/右/前/左 |
| `rm2k` | ツクール2000 | 24×32 | 3 | 行順：後/右/前/左 |
| `rmxp` | ツクールXP | 32×48 | 4 | 行順：前/左/右/後 |
| `rmvx` | ツクールVX | 32×32 | 3 | 行順：前/左/右/後 |
| `rmmv` | ツクールMV | 48×48 | 3 | 行順：前/左/右/後 |
| `smc` | SMC（水平ストリップ） | 16×16 | 2 | 右向き1行のみ、左移動は水平反転(`flipH`)。汎用の手動クロップ規格で特定CDNに依存しない |

`source`は `u:<URL直リンク>` または `p:<投稿ID>` のいずれか。

```
walk:rpgen:u:https://rpgen-search.pages.dev/data/images/sAnims/2158.png
walk:rpgen:p:123
walk:smc:u:https://cdn.../Goombas.png#0,0,64,32       ← クロップ指定(sx,sy,sw,sh)付き
walk:smc:u:https://cdn.../Boss.png#0,0,64,64,4        ← 末尾にコマ数(frames)も指定可
```

後方互換：旧形式 `walk:123`（投稿123, 自動推定）も解釈可能。

---

## 5. サポートしている画像ファイル形式（実体ファイル）

「規格(stdId)」とは別に、画像ファイル自体のフォーマット制限は次の通り：

- **アップロード時**（`POST /api/upload`、[app/api/upload/route.ts](../app/api/upload/route.ts)）：`data:image/` で始まるデータURLであれば**拡張子・MIMEサブタイプによる絞り込みは行っていない**（PNG/JPEG/GIF/WebP等を区別せず通す）。
- **表示時**：`<img>`タグ／Canvas `drawImage()`で読み込むため、**ブラウザが標準でデコードできる形式なら何でも表示可能**（PNG・JPEG・GIF・WebP・BMP、対応ブラウザならAVIF等）。コード側での明示的なフォーマット制限はない。

つまり「対応画像形式」はコード上のホワイトリストではなく、**ブラウザのネイティブデコード能力に委ねられている**のが現状。SVGのような特殊系・アニメーションGIFの逐次再生対応などは未検証。

---

## 6. まとめ：DSL化検討との対応関係

| 既存要素 | 将来DSL化したときの位置づけ |
|---|---|
| `PresetData`（①） | テキスト化の主対象。YAML等の構造化データとして書き出し/読み込みを実装予定（未着手） |
| MiniScript（②） | そのまま流用。テキストDSL内に生文字列として埋め込む想定 |
| asset-ref（③） | 既に十分テキスト化されたミニDSL。新DSLの中でも文字列フィールドの値としてそのまま利用可能（変更不要） |
