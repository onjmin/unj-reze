# ディレクトリ構成

`components/` と `lib/` は機能別のフォルダに分かれている。新しいファイルは、まず該当する機能フォルダに置く。

## components/

| フォルダ | 内容 |
|---|---|
| `layout/` | アプリの枠（AppShell、Header、サイドバー、BottomNav、TopTabs など） |
| `ui/` | 複数機能で使う汎用部品（Toast、VolumeControl、HistoryModal、ImagePreview、ShareButton、VoiceCredits など） |
| `post/` | 投稿の作成・表示・編集、フィード、埋め込み、コラボ選択 |
| `bbs/` | 2ch風の掲示板ビュー |
| `dm/` | ダイレクトメッセージ |
| `user/` | プロフィール、フォロー一覧、通知、ユーザー操作メニュー |
| `discover/` | 検索・ハッシュタグ |
| `pages/` | 静的ページ（About、規約、プライバシー、設定、リンク集） |
| `assets/` | 素材ピッカー（ContentPicker）と各素材パネル、SpriteImage |
| `game/` | ゲームエディタ本体・プレイヤー・ランディング。`presets/`（見本とテンプレート）、`yume25d/`、`mmo3d/` を含む |
| `mv/` | ミュージックビデオ。`presets/` を含む |
| `talk/` | かけあい動画 |
| `drawing/` | お絵描き・ドット絵・マンガエディタと、その共通パーツ（レイヤー、アニメーションバーなど） |
| `mml/` | MMLエディタ・プレイヤー、コード進行プレイヤー |

## lib/

| フォルダ | 内容 |
|---|---|
| （直下） | 全体で使う基盤: `api.ts`、`db.ts`、`types.ts`、`types-db.ts`、`site.ts`、`session.ts`、`sqids.ts`、`edge-cache.ts`、`uploader.ts` など |
| `db/` `kv/` `storage/` `realtime/` `security/` `auth/` | バックエンド各層（`db/` にはモックデータも置く。`security/` には fingerprint・geo も） |
| `hooks/` | React フック |
| `post/` `social/` `bbs/` | 投稿（ゲーム・MV・かけあい動画の保存クライアント `game-mv-client.ts` を含む）、ユーザー間の機能（DM・共有・アバター・既読）、掲示板 |
| `game/` `yume25d/` `mmo3d/` | ゲーム関連 |
| `assets/` | 素材参照、歩行グラ、ローカル素材 |
| `mv/` `talk/` `mml/` `manga/` `drawing/` `audio/` | 各制作ツールと音声（`audio/` にはボーカル音源のクレジット表示も） |
| `ui/` | ポインタ操作、undo履歴などの UI 補助 |
