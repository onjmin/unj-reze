# 3D MMO プリセット（`mmo3d`）設計ドキュメント

三人称視点・スケルタルアニメ・簡易マルチプレイ戦闘を持つ新しいゲームエンジン種別。
`components/GameMaker.tsx`（canvas 2D）にも `yume25d`（一人称2.5D探索）にも混ぜず、
**独立した `EngineKind` として新設**する。理由は下記「なぜ既存に混ぜないか」を参照。

参考にした外部プロダクト（[스피키 키우기](https://speakirpg.overture.io.kr/)）はソース非公開の
個人開発MMOで、コードの流用はしない。observed機能（三人称+FBXスケルタルアニメ+武器アタッチ
メント+トゥーン+bloom+地形高低差）を仕様の着想としてのみ扱う。

---

## なぜ既存エンジンに混ぜないか

- `yume25d` は一人称・夢空間探索という前提で照明/色空間/システムタイルが設計済み
  （`lib/yume25d.ts`、`Yume25DMaker.tsx`）。三人称+スケルタルアニメ+武器戦闘とは
  前提が違いすぎ、混ぜると照明・色パイプラインの整合が壊れる。
- `GameMaker.tsx` は既に19k行で React Compiler が OOM するため lint 除外中（AGENTS.md）。
  ここにMMOの巨大な状態機械を追加するのはリスクが高い。
- `services/realtime/` は現状「ゴーストプレイヤーのプレゼンス配信（DB書き込みゼロ）」止まり。
  スケルタルアニメ状態の同期は既存 `chGame` チャンネルの `RealtimePlayer` を拡張する形で
  段階的に対応する（後述）。
- Neon 無料枠の egress 制約（[docs/NEON_EGRESS.md](NEON_EGRESS.md)）があるため、位置/アニメ
  状態のような高頻度更新はDB経由にしない。realtimeハブが主経路。

---

## スコープ（release MVP）

やる:
- 1マップ・三人称カメラ・スケルタルアニメ（idle/walk/run/attack/hit/death）
- 簡易近接戦闘（1種の武器、1つの通常攻撃、簡易HP）
- 同一ゲームルーム内の他プレイヤーが見える（位置+アニメ状態の同期、既存 `chGame` 拡張）
- 投稿への埋め込み・一覧からの起動（`GameBox`/`GamePreview` 相当）

やらない（release MVP時点）:
- クラス/スキルツリー、装備強化、経済システム
- サーバー権威の物理演算・不正対策（クライアント予測のみ）
- 大規模同時接続の負荷対策（既存の単一インスタンスKoyebハブの制約をそのまま継承）

---

## モデル/アニメ素材（訂正: yume25dの基盤をそのまま再利用できる）

`lib/yume25d.ts` の `loadModel()` は既に `GLTFLoader` でURL指定の3Dモデル（アニメ付き）を
ビルボード配置にロードできる（キャッシュ＆クローンで使い回す仕組みも既存）。つまり
「ゆめにっき3Dで選べる素材」＝GLTFモデルはmmo3dでもそのまま同じローダーを再利用してよい。
フェーズ3のスケルタルアニメ基盤は「ゼロから作る」のではなく「`loadModel`が返す
`THREE.AnimationClip[]` を `AnimationMixer` で再生する層を足す」だけで済む。

### 外部素材のCORS対応

`lib/cors-proxy.ts`（`NEXT_PUBLIC_CORS_PROXY_URL`、既定 `https://cors-proxy.onjmin.workers.dev`）
を使い、直リンクが失敗したときだけプロキシ経由で再取得する（“フェイルオープン”方式、既存の
Minecraftスキン読み込みと同じパターン）。**`loadModel`（GLTF）にも同じ retry を追加済み**
（本ドキュメント更新時点で反映）。これで一般公開されている3D素材（GLTF/GLB）はURLを直打ちす
るだけでyume25d/mmo3d双方から呼び出せる。

### MMD（PMX/PMD）モデルとレンダラー選択

three.js は r150前後で `MMDLoader`/`MMDAnimationHelper` を examples から削除しており、
`three-stdlib`（2.36.1）にも同梱されていない。MMDを読むには Babylon.js 用の
コミュニティプラグイン **`babylon-mmd`** を使う（導入済み）。

**three-stdlib（threeベース）と babylon-mmd（Babylonベース）は同じ`<canvas>`のWebGL
コンテキストを共有できない**ため、1ゲームにつきレンダラーをどちらか一方だけ選ぶ
（`Mmo3dRenderer`, `components/game-presets/shared.ts`）。ゲーム作者が編集画面で選択する。

| | `three`（既定） | `babylon` |
|---|---|---|
| 実装 | `lib/mmo3d.ts` | `lib/mmo3d-babylon.ts` |
| 強み | yume25dと描画基盤を共有、GLTF/GLBが軽量、既存のCORSプロキシ運用実績あり | `babylon-mmd`でMMD(PMX)モデル＋モーション(VMD)がそのまま読める、Havok物理(`@babylonjs/havok`)が公式 |
| 弱み | MMDモデルは非対応（GLTFへの変換が必要） | バンドルサイズが大きい、yume25dの照明/色パイプラインとは別系統になる |
| 向いている用途 | 既存GLTF素材中心のワールド | ユーザー投稿MMDモデルを主役にしたいワールド |

`babylonjs-inspector`（デバッグ用ビューア）はバンドルサイズが大きいため
`devDependencies`に移し、`lib/mmo3d-babylon.ts`でも
`process.env.NODE_ENV !== "production"`の動的importでしか読み込まない
（本番バンドルから除外）。

MMD(PMX)モデルの実ロード（`babylon-mmd`のローダー登録→`SceneLoader.ImportMeshAsync`）は
未着手（#7継続）。エンジン初期化（地面+プレースホルダーキャラ）まではthree版と対で完成。

### フェーズ7完了メモ（MMDローダー実配線）

- `lib/mmo3d-babylon.ts`に`loadMmdModel(url)`を追加。`babylon-mmd/esm/Loader/pmxLoader`の
  `RegisterPmxLoader()`を初回呼び出し時に1回だけ実行し、`@babylonjs/core`の
  `ImportMeshAsync(url, scene)`でPMXファイルを読み込む。直リンク失敗時は
  `lib/cors-proxy.ts`経由で1回だけ再試行する（three版`loadModel`と同じフェイルオープン方式）。
**検証**: 実在しないPMX URLに対して`loadMmdModel()`を呼び出し、(1)直リンクで失敗
→(2)`cors-proxy.onjmin.workers.dev`経由のURLへ自動フォールバック→(3)それも失敗して例外が
投げられる、という一連の経路をブラウザで実行して確認（エラーメッセージにプロキシ済みURLが
含まれることを確認）。`RegisterPmxLoader()`自体はエラー無く完了。

### フェーズ13完了メモ（VMDモーション再生）

- `lib/mmo3d-babylon.ts`に`loadMmdModelAndPlay(pmxUrl, vmdUrl?)`を追加。
  - `MmdRuntime`を初回呼び出し時に1回だけ生成・`register(scene)`。
  - `MmdRuntime.createMmdModel(root)`でPMXモデルを登録。
  - `vmdUrl`があれば`VmdLoader.loadAsync()`でVMDを解析（CORSプロキシへのフェイルオーバー
    付き）→`model.createRuntimeAnimation()`→`setRuntimeAnimation()`→
    `runtime.playAnimation()`で再生する。
  - **ハマった点**: `VmdLoader`が返す`MmdAnimation`は素の状態では
    `IMmdBindableModelAnimation`（`createRuntimeModelAnimation`を持つ型）を実装していない。
    babylon-mmdは`babylon-mmd/esm/Runtime/Animation/mmdRuntimeModelAnimation`を副作用import
    すると、その中の`RegisterMmdRuntimeModelAnimation()`が`MmdAnimationBase.prototype`に
    `createRuntimeModelAnimation`を生やす設計になっている（`PmxLoader`の`RegisterPmxLoader()`
    と同じ「副作用importで機能を有効化する」パターン）。これを追加してtypecheckが通った。

### フェーズ3完了メモ（三人称スケルタルアニメ基盤）

`lib/mmo3d.ts` に実装:
- WASD/矢印キー移動 + Shiftダッシュ（`setInput()`経由、`Mmo3dMaker.tsx`がキーイベントを中継）
- 最短角度補間による向き変更、プレイヤー背後追従カメラ
- idle/walk/run のクロスフェード切替（`AnimationMixer`）

**既知の制限**: Khronos公式配布の`Fox.glb`はCDN配信バリアントによって「Survey/Walk/Run」の
3クリップ名で来る場合と、単一の結合クリップ（`animation_0`）1つだけになる場合がある
（原因未特定、jsdelivrのキャッシュ差分の可能性）。`loadPlayerModel()`は名前一致→本数一致
（3つ以上を順番でidle/walk/run割当）→単一クリップ使い回し、の順でフォールバックする。
実際に見た目のアニメが3種切り替わることを保証したい場合は、専用に用意した
（クリップ名がCLIP_NAMESと一致する）モデルへの差し替えを推奨。移動/回転/カメラ追従/状態
遷移そのものはクリップ本数によらず正しく動作することを確認済み。

---

## データモデル

- `EngineKind` に `'mmo3d'` を追加（`components/game-presets/shared.ts`）。
- キャラクターモデル・アニメーションはビルトインアセット1〜2種のみで開始
  （`assets/` 内蔵シートの仕組みを踏襲、外部FBXの著作権がクリアなもの、または自作モデルに限定）。
- 永続化は既存 `games` テーブルの `manifest`（JSON）に mmo3d 用の設定を格納。新規カラムは
  作らない（`mock.ts`/`pg.ts`両対応、`POST_COLUMNS`/`games.manifest`一覧非取得ルールを踏襲）。

## リアルタイム同期

`lib/realtime/channels.ts` の `RealtimePlayer` に任意フィールドを追加する方針
（既存フィールドとの後方互換を崩さない）:

```ts
export interface RealtimePlayer {
	sessionId: string;
	x: number;
	y: number;
	emoji: string;
	// mmo3d 用（任意）
	rotY?: number;
	anim?: "idle" | "walk" | "run" | "attack" | "hit" | "death";
}
```

サーバー権威なし・クライアントが自分の状態を publish するだけ。攻撃判定はクライアント
ローカルで完結させ、他プレイヤーへの影響は演出のみ（MVP)。

### フェーズ4完了メモ（リアルタイム位置/アニメ同期）

- `services/realtime/server.mjs`: `pos`メッセージで`rotY`/`anim`を受け取り、presenceに保持して
  ブロードキャストに含める（値が無ければ省略、既存の2D勢は影響を受けない完全後方互換）。
- `lib/realtime/client.ts`: `sendPosition()`に`{rotY, anim}`の任意第6引数を追加。
- `lib/mmo3d.ts`: `getLocalState()`（送信用）と`setRemotePlayers()`（他プレイヤーを簡易カプセル
  で表示、sessionId単位で生成/更新/消去）を追加。
- `components/Mmo3dMaker.tsx`: `gameId`/`sessionId`を渡すとthree版のみ200ms間隔で送受信する
  （既存2Dゲームの2000ms間隔より短い。移動が速いため）。babylon版は未対応（#7と合わせて
  今後）。

**検証**: 実際にハブ(`services/realtime/server.mjs`)をローカル起動し、2つのWebSocket接続で
`pos`(rotY=1.23, anim='run')を送信→もう一方が`presence`イベントでその値をそのまま受信する
ことを確認済み（テストスクリプトは検証後に削除）。

**未着手**: `GameMaker.tsx`/`LiveGameView.tsx`への実配線（`gameId`/`sessionId`をmmo3dゲームに
実際に流し込む部分）はフェーズ6で行う。ゴーストは現状カプセルのみで、他プレイヤーの
`anim`値を見た目のアニメ切替には使っていない（実モデルを共有していないため）。

### フェーズ5完了メモ（簡易近接戦闘・武器アタッチメント）

- 武器はボーンソケットではなく`player`(Object3D)の子として追従させる簡易実装
  （`gltf.scene`差し替え時に付け替える）。専用リグ済みモデルに移行する際は正式なボーン
  アタッチへ切り替える。
- Space/クリックで攻撃。クールダウン0.6秒、扇状判定（射程2.2m・±60°）、ダメージ20。
- ダミー敵2体（HP60）を設置。撃破で非表示→3秒後にHP全回復・元の座標で再出現。
- HPバーHUDは`Mmo3dMaker`側で`engine.setCombatCallbacks()`のコールバックを`useState`に
  反映して表示（自分のHP + ダミーのHP）。

**検証**: エンジンの内部メソッドを直接呼び出すシミュレーションで、ダミーへの3連続攻撃
(60→40→20→0 HP)→撃破時`visible:false`/`respawnAt`セット→約4秒後に自動リスポーン
(HP60・`visible:true`・座標復元)までを実機で確認済み。

---

### フェーズ6完了メモ（DB永続化・投稿埋め込み・release準備）

- `PresetId`/`EngineKind`に`'mmo3d'`を追加し、`components/game-presets/mmo3d.ts`を新設
  （`components/game-presets/index.ts`の`PRESETS`/`PRESET_ORDER`/`PRESET_EMOJI`/`PRESET_TAGLINE`
  にも登録）。
- `GameManifestDraft`/`PresetData`に`mmo3dConfig?: { renderer: Mmo3dRenderer }`を追加。
- `GameMaker.tsx`のcanvasレンダー分岐を3分岐に拡張:
  `gameData.engine === 'mmo3d'` → `Mmo3dMaker`（`gameId`/`ensureSessionId()`をそのまま渡す）
  → `yume25d` → 通常canvas、の優先順位。新規propは増やさず、既存の`gameId`propと
  `lib/session.ts`の`ensureSessionId()`をrefで1回だけ読む方式にした（GameMakerProps・
  呼び出し元は無改造）。
- **DB永続化は追加コード不要だった**: `games.manifest`はJSONとして丸ごと保存/復元される
  既存経路のみで、APIルート側は`engine`の値でバリデーションしていない（opaque JSON）ため、
  `'mmo3d'`もそのまま保存・復元できる。設計ドキュメント冒頭の方針（新規カラム/クエリ不要）通り。
- 投稿への埋め込みは`GameBox`→`GamePreview`→`GameMaker`という既存パイプラインをそのまま通る
  ため、追加配線なしで機能する（`LiveGameView`のリアルタイム実況経路も同様）。

**検証**: `GameMaker`に`initialManifest={PRESETS.mmo3d}`を渡してブラウザで実描画を確認
（canvas中央のピクセルが地面の緑色になっている＝mmo3dシーンが実際にレンダリングされている）。
typecheck / lint（新規warning・errorゼロ、既存の`MvMaker.tsx`の未関連エラー1件のみ）通過。

**既知の制限（release前に要対応）**:
- 武器/ダミー配置・地形などのマップ編集UIはまだ無い（決め打ちのワールドで遊べる段階）。
- 掲示板の位置は固定（(0,1.2,4)）で、複数掲示板を置いたり位置を編集するUIは無い。

### フェーズ11完了メモ（エディタUI：レンダラー切替・掲示板postID）

- [components/Mmo3dEditorPanel.tsx](../components/Mmo3dEditorPanel.tsx)を新設。MAPタブが
  `gameData.engine === 'mmo3d'`のときこのパネルに差し替わる（yume25dの
  `Yume25DEditorPanel`と同じ吸収パターン）。
  - レンダラー（three/babylon）をボタンで切替、`gameData.mmo3dConfig.renderer`に反映。
  - 掲示板の対象投稿ID（`boardPostId`）をテキスト入力、空なら埋め込み先の投稿を使う説明を明記。
- エンジン変更・プリセット読込のプルダウンは`PRESET_ORDER`に`mmo3d`が入っている時点で
  既に対応済みだった（追加コード不要）。
- 2D専用のレイヤーsoloボタン・タイル編集UIは`gameData.engine !== 'mmo3d'`を追加して除外。

**検証**: `GameMaker`編集モードで`PRESETS.mmo3d`を開き、MAPタブにレンダラー切替UIが表示
されること、「babylon」ボタンのクリックで選択状態(`bg-blue-600`)に切り替わること、投稿ID
入力欄への入力が即座に反映されることをブラウザで実機確認済み。

**訂正（フェーズ10で検証）**: 上記に「タイトル画面がmmo3dで表示されない」と書いていたが、
これは未検証の思い込みだった。実際は`showTitle`のオーバーレイはHTML/CSS（`<div>`）で
canvasの上に重ねているだけで、`gameData.engine`による分岐が無いため**最初から問題なく
表示されていた**。`GameMaker`に`PRESETS.mmo3d`を渡して実機確認（タイトル表示→「はじめる」
クリック→プレイ開始）。何もコードを変更する必要はなかった。

---

## フェーズ計画

1. 設計ドキュメント（本書）
2. `EngineKind` 土台 + `Mmo3dMaker.tsx` 空コンポーネント
3. 三人称スケルタルアニメ基盤（1体をマップ上で動かせる）
4. リアルタイム位置/アニメ同期（`chGame` 拡張）
5. 簡易戦闘・武器アタッチメント
6. DB永続化・投稿埋め込み・typecheck/lint・release

各フェーズは個別のPRを想定し、フェーズ間で動作確認を挟む。

7. MMD（PMX/PMD）ローダー対応（yume25d先行導入 → mmo3dへ横展開）
8. ゲーム内BBS機能（下記）

---

## ゲーム内BBS機能（2D/3D共通）— 本SNS自身のデータを参照/追加

外部サイト（open2ch.net等）へのプロキシは**やらない**方針に変更。代わりに**本SNSの投稿
データ（自サイトのスレッド/投稿）をゲーム内から閲覧・投稿できる**機能にする。外部サイトの
利用規約やbbs.cgiプロトコル互換の懸念が丸ごと消え、既存API・DBスキーマ・認可（匿名
フィンガープリント/レート制限/ブロック等）をそのまま使えるため実装難度が大きく下がる。

- 2Dエンジン: `public/assets/rpgen/map.png` の `(11,13)` のようなタイルを「掲示板入口」として
  マップに配置し、ゲーム作者がエディタで**対象スレッド（投稿ID）**を設定する。プレイヤーが
  調べる/踏むと `BbsThreadView` をそのまま流用したオーバーレイが開き、既存の投稿/返信APIで
  閲覧・返信できる。
- 3Dエンジン(mmo3d/yume25d): 同じ設定をビルボード/オブジェクトのinteractに対応させる。
- データ層は新規テーブル不要。`games.manifest`にタイル/オブジェクトごとの
  `{ threadPostId: string }` 参照を持たせ、実データは既存の `posts`/`replies` を叩くだけ。
- 投稿（返信）はプレイヤー自身の操作としてアプリの既存投稿フローを呼ぶだけなので、
  外部送信・自動投稿の懸念は生じない（既存のレート制限/abuse scoringがそのまま効く）。

この機能はmmo3d本体のフェーズ1〜6とは独立して並行開発できる（2D/3D両対応の横断機能のため）。

### フェーズ8完了メモ（ゲーム内BBS・mmo3d向け実装）

- [components/GameThreadBoard.tsx](../components/GameThreadBoard.tsx): 汎用オーバーレイ。
  `postId`を受け取り既存の`GET /api/posts/[id]`・`GET/POST /api/posts/[id]/replies`だけで
  閲覧・返信する（外部サイトへは一切接続しない）。2D/3D共通で使える設計。
  `useCurrentUser()`で表示名を取得。
- `lib/mmo3d.ts`: `enableBoard()`でワールド上(0, 1.2, 4)に掲示板メッシュを設置、
  `isNearBoard()`で対話範囲(2.5m)判定。
- `Mmo3dMaker.tsx`: `boardPostId`propを追加。近接時に「Eキーで掲示板を開く」ヒント表示、
  Eキーで`GameThreadBoard`をトグル。
- `GameMaker.tsx`: `mmo3dConfig.boardPostId`が未指定なら埋め込み先の`postId`を暫定で使う
  （作者が個別に別スレッドを指定するエディタUIは未着手）。

**検証**: (1)`Mmo3dEngine`単体でプレイヤーを板の近く/遠くへ移動させ`isNearBoard()`が
true/falseを正しく切り替えることを確認。(2)`GameThreadBoard`単体を実在の投稿ID(`18`)で
マウントし、実際の投稿内容（`"test"`）が表示されること、レス投稿→一覧への即時反映までを
ブラウザで実機確認済み。

**未着手（残スコープ）**: 作者が掲示板の位置・対象スレッドを個別に編集するUIも無く、現状は
「埋め込み先の投稿を指すボードが1つ、固定位置に置かれる」段階。

### フェーズ12完了メモ（2Dエンジン: BBSタイル配置）

- `TileDef`に`boardPostId?: string`を追加（`components/game-presets/shared.ts`）。
- `GameMaker.tsx`の移動処理ループに`special === 'bbsBoard'`分岐を追加。既存の
  `warp`/`damage`分岐と同じ位置・同じパターンで、踏んだタイルの`boardPostId`
  （未指定なら埋め込み先の`postId`）で`GameThreadBoard`を開く。
  `bbsBoardCooldownRef`で連続トリガーを防止し、オーバーレイを閉じてから0.8秒後に解除する。
- タイル編集パネルの「特殊」セレクトに「システム: 掲示板（本SNSの投稿を参照）」を追加し、
  選択時に対象投稿ID入力欄を表示（`warp`/`damage`と同じ配置パターン）。

**検証**: マリオプリセットにこのタイルを配置した`GameManifestDraft`を`GameMaker`へ渡し、
(1)クラッシュせず読み込まれること、(2)タイル編集パネルの特殊セレクトに新オプションが
実際に表示されることを確認。**プレイ中に実際にタイルを踏んで掲示板が開くところまでは
この検証環境（Browser paneが非表示のため`requestAnimationFrame`が完全に停止する）では
確認できなかった**（`rAF frames in 1s: 0`を実測）。トリガー分岐自体は既存の`warp`/`damage`
分岐と全く同じ構造・同じ実行パスであり、typecheck/lintも通過している。

### フェーズ14完了メモ（移動ロジック修正・掲示板複数設置・babylon版移動/同期）

- **移動キーの操作性バグ修正**（`lib/mmo3d.ts` `updateMovement`）: キー入力をワールド座標に
  直結していたため、カメラが移動方向を追いかけて回るたびに「前」の意味がブレて操作感が
  滅茶苦茶になっていた。キー入力を現在の向き(`facing`)基準のローカル方向として扱い、毎フレーム
  回転してからワールド座標に変換するよう修正（カメラ相対操作）。
- **掲示板の複数設置・位置編集UI**: `enableBoard()`/`nearBoard()`を複数掲示板対応に変更
  （`isNearBoard()`は後方互換で残置）。`mmo3dConfig.boards[]`（x/z/threadPostId）を追加し、
  `Mmo3dEditorPanel`にリスト編集UI（追加/削除）を実装。`boards`が空なら`boardPostId`1枚を
  既定位置(0,1.2,4)に置くフォールバックを維持。
- **ダミー敵の配置編集UI**: `mmo3dConfig.dummies[]`（x/z）を追加、`Mmo3dEditorPanel`で編集可能に。
  空なら既定の2体（(3,-3)/(-3,-4)）。
- **babylon版のWASD移動＋リアルタイム位置同期**: それまで`ArcRotateCamera`の自由視点のみで
  移動手段が無かったbabylon版に、three版と同じキー配線＋カメラ相対移動を実装
  （`lib/mmo3d-babylon.ts` `updateMovement`。`camera.target`/`camera.position`から求めた
  カメラ前方ベクトルを基準に回転）。`getLocalState()`/`setRemotePlayers()`を追加し、
  `chGame`経由のリアルタイム同期をthree/babylon共通化（`Mmo3dMaker.tsx`の`renderer==='three'`
  ガードを撤廃）。**副次的なバグ修正**: `loadMmdModelAndPlay()`で読み込んだMMDモデルの
  ルートが`playerRoot`の子になっておらず、常にワールド原点に固定されたままだった
  （移動しても付いてこない）のを修正。

### フェーズ15完了メモ（babylon版の戦闘/掲示板・簡易地形障害物）

- **babylon版に近接戦闘を移植**: three版と同じ定数（クールダウン0.6秒、扇状判定±60°・射程
  2.2m、ダメージ20、ダミーHP60・3秒リスポーン）で`triggerAttack()`/`resolveAttackHits()`/
  `damageDummy()`/`takeDamage()`/`setCombatCallbacks()`を実装。武器は`playerRoot`の子として
  追従する簡易ボックス。
- **babylon版に掲示板を移植**: `enableBoard()`/`nearBoard()`をthree版と同じ形で実装。
- **`Mmo3dMaker.tsx`をthree/babylon共通の1本のrefに統合**: 両エンジンが同じメソッド一式
  （`setInput`/`triggerAttack`/`nearBoard`/`enableBoard`/`setCombatCallbacks`/`getLocalState`/
  `setRemotePlayers`/`dispose`）を持つようになったため、`engineRef`を`Mmo3dEngine |
  Mmo3dBabylonEngine`の union 型1本にまとめ、HP HUD・掲示板ヒント・Space攻撃・Eキー掲示板
  操作をレンダラー問わず共通化した。
- **簡易地形障害物（直方体）**: `mmo3dConfig.obstacles[]`（中心x/z・幅w・奥行きd・高さh・
  任意色）を追加。three版はプレイヤー移動に対して軸分離スライド式のAABB当たり判定あり
  （`resolveObstacleCollision`）、babylon版は見た目のみ（既知の制限、下記参照）。
  `Mmo3dEditorPanel`にリスト編集UIを実装。

**既知の制限（release前に要検討）**:
- 地形は直方体障害物のみ（高低差・スロープ・凹凸のある地形は未対応）。

### フェーズ16完了メモ（babylon版: 地形当たり判定・移動状態の同期）

- **babylon版の地形障害物に当たり判定を追加**: three版と全く同じ軸分離スライド式AABB判定
  （`resolveObstacleCollision`）を`lib/mmo3d-babylon.ts`にも実装。ArcRotateCameraの自由視点
  移動（カメラ相対）とも問題なく共存する（移動先座標に対して当たり判定するだけなので、
  カメラの向きには依存しない）。
- **babylon版に移動状態(idle/walk/run)の判定を追加**: 実モデルのスケルタルクリップ切替は
  無いままだが（MMDモデルの標準ポーズ/VMDモーション任せ）、`getLocalState().anim`は入力
  から判定した実際の状態を返すようになった。他プレイヤーのゴースト表示にも反映
  （walk/runでカプセルの高さをわずかに伸縮させる簡易表現）。
- **残る制限**: MMDモデル自体のアニメクリップをidle/walk/runで自動切替する仕組みはまだ無い
  （VMDモーションは`vmdUrl`で指定した1本を再生し続けるのみ）。

### フェーズ17完了メモ（実機検証・旋回速度バグ修正）

- **実機検証（Browser pane）**: mmo3dプリセットをGameMaker上で実際にプレイし、以下を確認。
  - キー入力→カメラ相対移動（フェーズ14の修正）が実際に動作し、方向転換のたびにカメラが
    追従することを確認。
  - フェーズ15/16の地形障害物・当たり判定が実際に機能し、プレイヤーが障害物の手前で止まる
    ことをthree版で確認（babylon版は移動自体の動作を確認、当たり判定は同一ロジックのため
    static reasoningで妥当性を確認）。
  - フェーズ14〜16で追加した掲示板/ダミー敵/障害物の編集UIが実際に表示・入力できることを
    確認。
- **旋回速度バグを発見・修正**（ユーザー報告「旋回が異常に高速」）: `updateMovement`の向き
  補間が`this.facing += diff * Math.min(1, TURN_LERP * dt)`という線形式だった。`TURN_LERP=10`
  なので`dt`が0.1秒以上に跳ねた瞬間（フレームレートが10fps以下に落ちた瞬間、Browser pane
  やスペックの低い端末では珍しくない）に係数がちょうど1.0になり、その1フレームで向きが
  完全にスナップしてしまう＝旋回が一瞬で終わって見える不具合があった。線形式を指数減衰
  `this.facing += diff * (1 - Math.exp(-TURN_LERP * dt))`に置き換え、`dt`が多少跳ねても
  係数が1.0に張り付かないようにした（`lib/mmo3d.ts`・`lib/mmo3d-babylon.ts`両方）。
  実機で0.15秒刻みのスクリーンショットを比較し、旋回が複数フレームにわたって滑らかに
  進行することを確認。

### フェーズ18完了メモ（高低差のある簡易地形: walkable足場）

- **地形の「高低差」対応を追加**: `mmo3dConfig.obstacles[]`に`walkable?: boolean`を追加。
  `true`にすると障害物は「壁」ではなく「足場（プラットフォーム）」になり、水平方向の
  移動はブロックせず、その範囲に立っている間だけプレイヤーのY座標をその高さに引き上げる
  （`standHeightAt()` / `applyStandHeight()`、three/babylon両対応）。段差・階段状のマップを
  組めるようになった（傾斜やなめらかな凹凸までは対応しない — 引き続き既知の制限）。
- `Mmo3dEditorPanel`に「足場にする」チェックボックスを追加。
- **実機検証**: three版でwalkable障害物を配置し、プレイヤーがブロックされずに通過できる
  ことを確認（`walkable=false`の場合との対比で軸分離ブロックが正しく効くことは既に
  フェーズ17で確認済み）。Y座標の上昇そのものは、追従カメラが常に±1段（1m前後）の
  差では大きく画角が変わらないため、スクリーンショット上での明瞭な確認はできなかった
  （コードパスは`resolveObstacleCollision`と同じ検証済みのAABB判定ロジックを流用しており、
  静的な妥当性は高いと判断）。

**既知の制限（引き続き）**: 地形はあくまで水平の直方体の集合（壁 or 足場）であり、傾斜面・
曲面・凹凸のある自然な地形メッシュは未対応。MMDモデル自体のアニメクリップをidle/walk/runで
自動切替する仕組みも未着手（VMDモーションは`vmdUrl`で指定した1本を再生し続けるのみ）。

### フェーズ19完了メモ（three版: Wキー無限旋回バグの修正）

- **重大バグを発見・修正**（ユーザー報告「Wキー押したときに旋回しまくる」「初期位置もおかしい」）:
  フェーズ14で導入した「カメラ相対移動」（`this.facing`を軸に入力ローカル方向を回転させて
  targetFacingを求める式）に自己参照バグがあった。前キー単体（`localZ=-1`）だと、
  `mx = localX*cosθ + localZ*sinθ`、`mz = -localX*sinθ + localZ*cosθ`という式は、どんな`θ`
  （＝その時点の`this.facing`）に対しても`targetFacing = θ + π`という**θに追従して常に180°先を
  指す不動点なしの関係**になっていた。`facing`を`targetFacing`へ近づけるほど`targetFacing`
  自体も`facing`につれて180°先へ移動し続けるため、`facing`は永遠に収束せず毎フレーム同じ量
  だけ回転し続ける＝無限旋回になっていた（フェーズ17の指数減衰化は回転速度を遅くしただけで
  無限旋回そのものは解消していなかった）。
  副作用として、この式は`facing=0`が実質「後ろ向き」を意味する変な対応関係になっており、
  プレイヤー/カメラの初期姿勢が「前」の直感と一致しない問題も引き起こしていた。
- **修正**: targetFacingの計算を`this.facing`から完全に独立させ、押しているキーの組み合わせ
  だけで決まる固定値に戻した（`mx,mz`を`this.facing`で回転させるのをやめ、`localX,localZ`を
  正規化してそのまま使う）。同時に符号を`forward: localZ+1`（旧: `localZ-1`）に統一し、
  `facing=0`が「前」に対応するよう修正（babylon版はすでにこの符号だったため、three/babylon
  で一貫した規約になった）。
- **実機検証**: three版でWキー・Aキーをそれぞれ2秒間ホールドし、旧コードで見られた無限回転が
  発生せず、単発のスムーズな旋回で収束して静止することを画面キャプチャで確認。
- **設計上のトレードオフ**: この修正により、three版の移動は「カメラ相対（現在向いている
  方向が前）」ではなく「ワールド絶対（キーごとに固定の方向）」に戻った。カメラは引き続き
  移動方向を追いかけて滑らかに回転するため、方向を変えるたびに視点が回るという体験は残るが、
  無限旋回という致命的な不具合と比べて優先度は低いと判断した。babylon版はArcRotateCameraの
  実カメラ向きを基準にしており自己参照が起きないため、この問題は無く、カメラ相対操作のまま。

### フェーズ20完了メモ（lib/yume25d.ts 準拠のタンク操作に統一）

- **ユーザー指摘**（「下キー押したら旋回するのおかしい。ゆめにっき3Dの操作感を踏襲すれば
  いいのでは」）を受けて、フェーズ19の「ワールド絶対」方式（移動キーの組み合わせから毎回
  向きを逆算する）もやめ、`lib/yume25d.ts`と同じ**タンク操作**（前後移動・ストレイフは
  facingを一切変更せず、旋回は専用キーでしか起きない）に全面的に統一した。
  - `Mmo3dInputState`を`{ forward, back, strafeL, strafeR, turnL, turnR, run }`に変更
    （旧`left`/`right`はキー入力の意味が曖昧だったため廃止）。
  - `this.facing += turn * TURN_SPEED * dt`で旋回キー入力を直接facingに積分する
    （lib/yume25d.tsの`this.yaw += turn * TURN_SPEED * dt`と同じ形）。移動側は
    `forward/back`→前方ベクトル、`strafeL/strafeR`→右方ベクトルへの単純な射影で、
    facingの計算に一切関与しない。これにより「後退キーで向きが変わる」という直感に反した
    挙動も、facingの自己参照による無限回転も、構造的に起こりえなくなった。
  - `TURN_SPEED = 2.4`ラジアン/秒、`STRAFE_SPEED = 2.0`m/sはいずれも`lib/yume25d.ts`と
    同値・同じ比率感覚に揃えた。
  - babylon版もthree版と全く同じロジックに統一（旧: ArcRotateCameraの向きを毎フレーム
    参照する「カメラ相対」実装だったが、そちらもfacingの自己参照リスクを抱えていたため
    廃止）。ArcRotateCameraのドラッグ操作自体は引き続き有効で、視点は自由に見回せる
    （移動方向には影響しない）。
  - [Mmo3dMaker.tsx](../components/Mmo3dMaker.tsx)のキー配列を`lib/yume25d.ts`
    （Minecraft創造モード風）と完全に揃えた: 矢印キー＝前後移動＋旋回、WASD＝前後移動＋
    左右ストレイフ、Shift＝ダッシュ、Space＝攻撃、E＝掲示板。
- **実機検証**: three版でSキー（後退）を1.5秒ホールドし、キャラクターの向きが一切変わらず
  まっすぐ後退することを画面キャプチャで確認。ArrowLeft（旋回）を1秒ホールドし、単発の
  安定した旋回で収束し、それ以上回転し続けないことも確認。

### フェーズ21完了メモ（babylon版: MMDモデルのidle/walk/run自動切替）

- **VMDモーションのstate別自動切替を実装**（`lib/mmo3d-babylon.ts`）: `loadMmdModelAndPlay()`
  を`{ idle?, walk?, run? }`の3state対応に拡張。各stateのVMDをそれぞれ`MmdModel.
  createRuntimeAnimation()`でハンドル化して保持し（`mmdAnimHandles`）、`updateMovement()`で
  求めた`curAnim`（idle/walk/run）が変化した時だけ`MmdModel.setRuntimeAnimation()`で
  切り替える（`syncMmdAnimation()`）。読み込みに失敗したstateは警告ログのみでスキップし、
  1つも読み込めなければ静止ポーズのまま動作を継続する（フェイルオープン、既存のCORS
  プロキシ再試行パターンを踏襲）。
- `mmo3dConfig`に`vmdWalkUrl`/`vmdRunUrl`を追加（既存`vmdUrl`はidle用として扱う）。
  `Mmo3dEditorPanel.tsx`に「3. 歩行・走行モーション（任意、自動切替）」セクションを追加。
  ウォークサイクル用VMDはビルトインカタログの`MMD_MOTION_CATALOG`に無かったため
  （ダンス/カメラモーションのみ）、URL直接入力のみのシンプルなUIにした。
- **実機検証の制約**: `lib/cors-proxy.ts`のプロキシ（`cors-proxy.onjmin.workers.dev`）は
  Access-Control-Allow-Originを`https://onjmin.github.io`（本番オリジン）のみに絞っており、
  ローカル検証環境（`localhost`）からはPMX/VMDの取得がCORSでブロックされる（既存の制約で
  今回のフェーズにより新たに生じたものではない）。そのためBrowser paneでは実際のMMD
  モデル・アニメーション切替を目視確認できなかったが、(1)ロード失敗時のフェイルオープン
  経路（プレースホルダーのカプセルへ自動フォールバック）が例外を出さず正しく動作すること、
  (2)UIの新規入力欄（歩行/走行VMD URL）が正しく表示・入力できること、(3)コンソールに
  この変更由来の新規エラーが出ていないこと、は確認済み。実際のアニメーション切替そのものは
  `typecheck`が通る型安全なコードパスとして実装されている（babylon-mmdの型定義
  `MmdModel.createRuntimeAnimation()`/`setRuntimeAnimation()`のシグネチャに準拠）。
  本番オリジンでの実際の目視確認は今後の課題。

### フェーズ22完了メモ（右方向ベクトルの符号バグ修正・ストレイフ廃止でA/D=旋回に統一）

- **A/Dキーの左右移動が逆になるバグを発見・修正**（ユーザー報告）: `updateMovement`の
  右方ベクトルの式`rx = cosθ, rz = -sinθ`が、実際のカメラの画面右方向と符号が逆だった。
  `updateCamera`のカメラ配置（前方=(sinθ,0,cosθ)、up=(0,1,0)）から`cross(forward, up)`で
  画面右方向を正しく導出すると`(-cosθ, 0, sinθ)`になる。旧式はこれの符号違いになっており、
  ストレイフ移動が画面上で左右反転していた（three/babylon両方）。
- ユーザーから続けて「A/Dキーはそもそもカメラ旋回の方が妥当では」という指摘があり、
  ストレイフ自体を廃止してA/Dを旋回に統合する方針に変更した（AskUserQuestionでストレイフの
  扱いを確認し「廃止する」を選択）。
  - `Mmo3dInputState`から`strafeL`/`strafeR`を削除し、`{ forward, back, turnL, turnR, run }`
    のみに簡略化。`STRAFE_SPEED`定数・右方ベクトルの計算も削除（前方ベクトルのみで完結）。
  - [Mmo3dMaker.tsx](../components/Mmo3dMaker.tsx)のキー配列を変更: `KeyA`/`ArrowLeft`→
    `turnL`、`KeyD`/`ArrowRight`→`turnR`（W/S・矢印上下は前後移動のまま）。lib/yume25d.ts
    とは異なる配列になった（yume25dはA/D=ストレイフ、矢印=旋回）が、mmo3dは三人称視点で
    ストレイフの必要性が薄く、A/D=旋回の方が直感的という判断。
- **実機検証**: three版でDキーを1秒ホールドし、カメラ/キャラクターが右方向へ旋回する
  （ダミーが画面左から右へ移っていく）ことを確認。続けてAキーを2秒ホールドし、逆方向
  （右から左）へ旋回して戻ることも確認。ストレイフ（真横移動）が発生しないことも
  画面上の動き方から確認済み。

### フェーズ23完了メモ（three版: トゥーン＋bloom＋影＋空グラデーションの見た目強化）

- **ユーザー指摘**（「参考にした外部プロダクトの見た目に達していない、もっと作り込まれて
  いたはず」）を受けて、`docs/mmo3d-feature-design.md`冒頭に記載していた設計方針
  「observed機能（三人称+FBXスケルタルアニメ+武器アタッチメント+トゥーン+bloom+地形高低差）」
  のうち、まだ未着手だった**トゥーン+bloom**の見た目をthree版に実装した。
  参考サイトはアカウント登録が必須で実際のプレイ画面は閲覧していない（アカウント作成は
  ユーザー本人が行うべき操作のため代行しない方針）。タイトル/言語選択/ニックネーム設定
  画面までは閲覧し、以降は本ドキュメントに既存記載の仕様着想（トゥーン+bloom+地形高低差）
  のみを頼りに実装した。ソースコード・アセットの流用は一切していない。
- **トゥーン(セルシェーディング)**: `THREE.MeshToonMaterial` + 4階調グラデーションマップ
  (`createToonGradientMap()`、`DataTexture`+`NearestFilter`で段差をくっきりさせる)に、
  プレイヤー/ダミー/地面/掲示板/障害物のマテリアルを統一（武器のみメタリック表現を
  活かすため`MeshStandardMaterial`のまま維持）。
- **bloom**: `EffectComposer`(`RenderPass`→`UnrealBloomPass`→`OutputPass`)を追加。
  武器のハイライトや攻撃スイングの光り方が強調される。`resize()`/`dispose()`にも
  composer/bloomPassの後始末を追加。
- **影**: `renderer.shadowMap`を有効化（`PCFSoftShadowMap`）。太陽光(`DirectionalLight`)に
  `castShadow`、地面に`receiveShadow`、プレイヤー/ダミー/掲示板/障害物/読み込んだGLTF
  モデル全メッシュに`castShadow`を設定。
- **空**: 大きな球のBackSideにグラデーションシェーダー(`createSkyMaterial()`)を貼った
  手続き的な空に変更（`lib/yume25d.ts`の「手続き的な空」と同じ外部テクスチャ非依存の方針）。
  加えて`THREE.Fog`で遠景をなだらかに霞ませ、奥行きの単調さを緩和した。
- **実機検証**: three版でmmo3dをプレイし、(1)空のグラデーション（上が濃い青、地平線側が
  白っぽく抜ける）と遠景のフォグが実際に見えること、(2)プレイヤー/ダミーの足元に影が
  落ちていること、(3)Wキー移動中も含めクラッシュや新規コンソールエラーが出ないこと、を
  スクリーンショットで確認。トゥーンの階調バンドは平坦な照明下の地面では目立ちにくく、
  丸みのあるカプセル形状（プレイヤー/ダミー）でわずかに視認できる程度だった。
- **未着手（引き続き）**: babylon版（MMDモデル向け）にはこの見た目強化を適用していない
  （MMDモデル自体のマテリアル/トゥーンシェーダーはbabylon-mmd側の表現に依存するため、
  対応するなら別途検討が必要）。

### フェーズ24開始メモ（ユーザーが実際にログイン→ゲーム性の大幅なギャップが判明）

ユーザー本人が参考サイトにアカウント登録してプレイ画面を見せてくれた（アカウント作成は
ユーザー自身が行った。復旧コード等の認証情報はこちらでは記録・利用していない）。実際は
「見た目を近づける」以上に作り込まれた**ソーシャル育成RPG**で、想定より大幅にスコープが
大きいことが判明した。観測した実際の機能（コードは見ていない、画面から読み取れる仕様のみ）:

- **カメラ**: 三人称肩越しではなく、固定角度の見下ろし視点（アイソメトリック風、旋回しても
  カメラは振られない）
- **ビジュアル**: デフォルメSD体型（頭でっかち）、タイル床グリッド、暖色パステル
- **他プレイヤー**: 同じ広場に大勢の実プレイヤーが同時表示、頭上に「Lv+ニックネーム」の
  ネームプレート
- **NPC会話**: ポートレート付き吹き出しダイアログ
- **パーティー**: 他プレイヤーをクリックして招待（最大4人）
- **ホットバー**: 6枠、Lv10/20/30などレベル別アイテムを装備
- **ミニマップ**: 常時右上表示
- **ソーシャルメニュー**: 郵便・出席（デイリー）・順位（ランキング）・チャンネル切替
- **チャット**: 画面下にテキストチャット
- **操作**: WASD歩行 + Gジャンプ

ユーザーは4項目（見た目/カメラ、キャラ育成、戦闘深化、ソーシャル）すべてに着手する意向。
ソーシャル機能は既存の`services/realtime/`（Koyeb, socket.io）を拡張する方針（新規基盤は
不要）。GameMaker側には「オンラインテスト」というダミーオンラインユーザーでの動作確認
機能が既にあり（設定パネル内）、これを使えば実プレイヤーが複数人いなくてもソーシャル
機能のテストプレイができる。

**フェーズ24（見た目・カメラ）で着手した内容**:
- `updateCamera()`を、facingに追従して回転する三人称肩越しカメラから、
  「位置だけ追従し、常に一定角度で見下ろす」固定角カメラに変更（`CAM_OFFSET = (0, 16, 13)`）。
  旋回してもカメラが振り回されない、参考サイトのアイソメトリック風の見た目に近づいた。
- カメラFOVを60→35に狭め、望遠寄りにしてパースの歪みを減らした（見下ろしMMOに典型的な
  平坦な見え方）。
- HPバーを画面左上の小さい表示から、画面下中央の大きなピル型バーへ移動
  （[Mmo3dMaker.tsx](../components/Mmo3dMaker.tsx)）。敵のHPバーは左上に残置。
- **実機検証**: three版でプレイし、(1)見下ろしアングルのカメラで地面・ダミー・プレイヤーが
  一望できること、(2)Wキー移動中もカメラが振り回されず追従し続けること、(3)HPバーが画面下
  中央の大きなバーで表示されること、(4)新規コンソールエラーが出ないこと、を確認。

### フェーズ25完了メモ（SD体型・キャラ育成・スキル攻撃・ソーシャル機能）

ユーザーから「全部進めてください、DB保存処理等はTODOにしてください」という指示を受け、
フェーズ24の残タスク（SD体型・キャラ育成・戦闘深化・ソーシャル）に一括着手した。
**永続化は一切実装していない**（下記すべてTODOコメント付きでエンジン内メモリ／リアルタイム
ハブのインメモリのみに留めている。リロード・再起動で消える）。

- **SD体型**（`lib/mmo3d.ts`）: プレイヤー/ダミー/ゴーストのプレースホルダーを、短く丸い胴体
  カプセル＋大きめの頭球の2パーツ構成に変更（`CHIBI_BODY_*`/`CHIBI_HEAD_*`,
  `DUMMY_BODY_*`/`DUMMY_HEAD_*`定数）。ルートオブジェクト自体は従来通り胴体カプセル1個
  のままなので、移動/カメラ/当たり判定の既存コードは変更不要だった（頭は子メッシュとして
  載せただけ）。実機で丸みのあるチビキャラ然としたシルエットになったことを確認。
- **キャラ育成**（`lib/mmo3d.ts`/`lib/mmo3d-babylon.ts`、TODO(persist)）: ダミー撃破でXP獲得
  →レベルアップで最大HP・攻撃力が成長する仕組みを追加（`level`/`xp`/`xpToNext`、
  `HP_GROWTH_PER_LEVEL`/`ATTACK_GROWTH_PER_LEVEL`）。レベルアップ時はHP全回復。
  `setCombatCallbacks`に`onLevelChanged`を追加し、`Mmo3dMaker.tsx`のHUDにLvバッジ＋XPバーを
  表示。実機でHUDにLv1バッジとXPバーが表示されることを確認。
- **戦闘システムの深化**（three/babylon両対応、TODO: 装備・複数スキルの選択制は未着手）:
  通常攻撃（Space）に加えて、範囲・威力に優れるがクールダウンが長いスキル攻撃
  （Fキー、`triggerSkill()`）を追加。全方位AOEで通常攻撃との差別化とした。
  攻撃力自体もレベルに応じて成長する（`getAttackDamage()`）。実機でFキーがエラー無く
  発火することを確認（位置がワールド端に流れてしまい、実際にダミーへ命中する場面までは
  確認できなかった — ロジック自体は`resolveAttackHits()`を通常/スキルで共有しており、
  通常攻撃側は既存フェーズで検証済みの経路と同じ）。
- **ソーシャル（チャット・パーティー）**（`services/realtime/server.mjs`、TODO(persist)）:
  既存のインメモリ実況ハブ（Koyeb, socket.io系のwsサーバー）に`chat`/`partyInvite`/
  `partyAccept`/`partyLeave`/`partyUpdate`メッセージ種別を追加。チャットは同じゲーム
  ルームの購読者全員へそのまま中継するだけ（履歴保存なし）。パーティーは`Set`共有方式で
  管理し（同じSetオブジェクトを指せば同じパーティー）、招待・承諾はpresenceのws参照へ
  直接送信、最大4人（`MAX_PARTY_SIZE`）。presence配信にも`level`/`name`を追加し、他
  プレイヤーのネームプレート・招待UIで使えるようにした。`Mmo3dMaker.tsx`に💬チャット
  パネル・👥パーティーパネル（近くのプレイヤー一覧から招待、招待通知の承諾/辞退、
  パーティー脱退）を追加。**ローカル検証環境は`NEXT_PUBLIC_REALTIME_URL`が未設定のため、
  実際の送受信は確認できていない**（`realtimeConfigured`がfalseになりチャット/パーティー
  UIごと非表示になる、既存の設計方針通り）。`node --check`でサーバー側の構文エラーが
  無いことのみ確認済み。GameMakerの「オンラインテスト」（ダミーオンラインユーザーでの
  動作確認機能）は今回変更していないため、実機での動作確認は次回以降の課題。
- **実機検証**: three版でmmo3dをプレイし、(1)Lv1バッジ+XPバーがHUDに表示されること、
  (2)ダミー/プレイヤーがSD体型（丸い頭でっかちシルエット）で描画されること、(3)Fキーで
  スキル攻撃がエラー無く発火すること、(4)チャット/パーティーUIはrealtimeConfigured=false
  の環境で意図通り非表示になること、(5)新規コンソールエラーが出ないこと、を確認。

### フェーズ26完了メモ（装備・複数スキル、NPC会話、ミニマップ、出席/順位、ホットバー）

ユーザーから「未着手部分に着手、チャット/パーティーの実機検証は保留でよい」という指示を
受けて、フェーズ25で未着手だった残り項目に着手した。**引き続き永続化は一切していない**
（すべてTODO(persist)コメント付き。育成/装備選択はエンジン内メモリ、出席のみ
`localStorage`でその場しのぎ、サーバー側のDB保存は無い）。

- **装備（武器種）・複数スキルの選択制**（`lib/mmo3d.ts`/`lib/mmo3d-babylon.ts`、
  `WEAPON_TYPES`/`SKILL_TYPES`をexport）: 武器3種（剣/槍/斧、ダメージ・射程・クールダウンの
  倍率がそれぞれ異なる）とスキル2種（回転斬り=全方位AOE、貫き突き=正面の狭い扇状だが
  射程・威力に優れる）を追加。`setWeapon()`/`setSkill()`/`getEquipment()`をエンジンに追加し、
  `triggerAttack()`/`triggerSkill()`は選択中の定義を参照するよう変更。
- **NPC会話**（three/babylon両対応、`nearNpc()`）: `mmo3dConfig.npcs[]`
  （座標・名前・メッセージ）を追加。近づいてEキーを押すと一方向のメッセージだけを
  吹き出し風オーバーレイで表示する簡易実装（選択肢・分岐は無い、本SNSへの投稿等も
  一切行わない）。掲示板が近くにある場合はそちらを優先する。`Mmo3dEditorPanel.tsx`に
  NPC一覧編集UIを追加。
- **ホットバー**（`Mmo3dMaker.tsx`）: 参考プロダクトの6枠ホットバーの見た目を踏まえ、
  武器3種+スキル2種を選択できるボタン列を画面下部に追加。選択中はハイライト表示。
  Space=選択中の武器で通常攻撃、Fキー=選択中のスキルを発動、という対応。
- **ミニマップ**（`getMinimapData()`）: プレイヤーを中心固定し、ダミー（赤）・掲示板（黄）・
  NPC（青緑）を相対位置のドットで表示する円形ミニマップを右上に追加。300ms間隔のポーリング
  のみで、DBには依存しない。北固定（プレイヤーの向きには追従しない）。
- **出席（デイリーボーナス）**: `localStorage`のみで「本日取得済みか」を判定し、未取得なら
  ボタンからXP+30を受け取れる（`grantXp()`公開メソッド）。サーバー保存は無いため、
  ブラウザ/端末を変えると再度受け取れてしまう（TODO(persist)、既知の制限として明記）。
- **順位（ランキング）**: パーティーパネル内に、自分+`others`（同ルームのpresenceで見えている
  範囲）をレベル降順ソートした簡易ランキングを追加。サーバー側の永続ランキングでは無い、
  あくまで今見えている範囲だけの即席集計（TODO(persist)）。
- **郵便・チャンネルは見送り**: 参考プロダクトにあった機能だが、既存のDMシステム/
  複数ルーム設計との整合検討が必要なため、今回は非活性の「未実装」ボタンのみ置いた
  （フェイク機能を作らず、正直に「まだ無い」と示す方針）。
- **実機検証**: three版でmmo3dをプレイし、(1)ホットバーの武器/スキル選択ボタンが
  クリックでハイライト切替すること（剣→槍に切替）、(2)ミニマップにダミー2体の相対位置が
  赤ドットとして実際の配置と整合する位置に表示されること、(3)`Mmo3dEditorPanel`に
  NPC編集セクションが実際に表示されること、(4)新規コンソールエラーが出ないこと、を確認。
  出席ボタンは`gameId`が未確定な編集下書き状態では表示されない仕様（既存の`gameId`依存
  機能と同じゲート）のため、投稿として保存された状態での実機確認は未実施。
  NPC会話ダイアログ自体の表示・チャット/パーティーの実機検証はユーザー指示により保留。

**未着手（引き続き）**:
- チャット/パーティー/NPC会話ダイアログ/出席ボタンの実機検証（保留、realtimeハブや
  保存済みgameIdが必要な環境での確認）
- 育成・装備選択・パーティー状態の永続化（`games.manifest`か専用テーブルかの設計要）
- 郵便・チャンネル（本実装。DM/複数ルーム設計との整合検討が必要）

### フェーズ27完了メモ（カメラ距離の調整・フリーズ不具合の対策）

ユーザーから「カメラが遠い」「何かフリーズしてます」という報告を受けた。

- **カメラ距離**: `CAM_OFFSET`を`(0, 16, 13)`→`(0, 8, 6.5)`に変更（`lib/mmo3d.ts`
  `updateCamera()`）。フェーズ24でFOVを60→35に狭めた際、疑似アイソメトリック効果を狙って
  オフセットも大きく取りすぎていた。
- **フリーズ不具合の原因調査と対策**: **実機での再現確認はできなかった**
  （このセッションではBrowser paneのcompositingが失敗し続け、画面キャプチャ/操作による
  検証ができない状態だった。正直に申告する）。代わりにコードレビューで構造的リスクを
  特定し、対策を入れた。
  - **three版の`start()`のtickループ**: `requestAnimationFrame(tick)`の呼び出しが
    フレーム処理の**最後**に置かれていた。つまりその手前（`updateMovement`/
    `updateCombat`/`updateCamera`/`mixer.update`/`composer.render`のいずれか）で
    1回でも例外が投げられると、次フレームのRAFが二度とスケジュールされず、
    キャンバスがその場で完全に停止する（HUDなどReact側は動き続けるため
    「一部だけ固まる」ように見える）。これはフェーズ23〜26で追加したコード
    （bloom/トゥーン/装備/NPC/ミニマップ等）のどこかに未知の例外があった場合、
    今までは1回のエラーで即座に永久フリーズしていたことを意味する。
  - **対策**: `this.rafId = requestAnimationFrame(tick)`をフレーム処理の**先頭**に
    移動し、実処理全体を`try/catch`で包んだ。これにより、フレーム内で例外が起きても
    ループ自体は止まらず、次フレームも継続する（エラーはconsole.errorに出力され、
    原因調査は引き続き可能）。
  - **babylon版**: `onBeforeRenderObservable`のハンドラと`runRenderLoop`のコールバックに
    同様のtry/catchを追加（Babylon側のObservable通知で例外が伝播し内部ループに影響する
    リスクへの対策）。
- **未検証（要フォローアップ）**: 上記は「例外によるフリーズ」という**最も疑わしい仮説**への
  対策であり、実際にどの処理が例外を投げていたかは特定できていない。次回もし同じ症状が
  再現したら、`console.error`に出力されるようになったエラーメッセージ・スタックトレースを
  共有してもらえれば、根本原因を特定できる。フレームレート低下（bloom/shadow/fogの
  重さ）による「体感的なフリーズ」の可能性も残っており、切り分けが必要。

### フェーズ28完了メモ（操作系の全面刷新：カメラ相対移動＋ドラッグ視点回転＋タッチ操作）

ユーザーから「3D MMOのクオリティが低い」「操作性が悪い」「**ゆめにっき3Dのような視点移動が
できない**」という指摘を受けての改修。フェーズ22〜27の操作系（タンク操作＋固定角カメラ）を
撤去し、一般的な三人称MMOの操作へ置き換えた。参考プロダクトは
[스피키 키우기](https://speakirpg.overture.io.kr/) のままだが、実プレイの確認はニックネーム
登録（＝アカウント作成）が必須のため行っていない。仕様は引き続きobserved機能の着想のみ。

**1. オービットカメラ（`turnBy` / `adjustCameraDistance`）**
- 旧: `CAM_OFFSET`固定の見下ろしカメラ。視点は一切動かせなかった。
- 新: `camYaw` / `camElev` / `camDist` を持ち、キャンバスのドラッグで回す。API名と符号は
  `lib/yume25d.ts` の `turnBy(deltaYaw, deltaPitch)` に合わせてある（横=旋回、縦=見上げ/
  見下ろし、ホイール/ピンチ=距離）。注視点は`CAM_FOLLOW_LERP`でプレイヤーへ滑らかに追従し、
  地面/足場より下へ潜らないようクランプする。
- FOVは35°→48°に戻した。35°は「固定角の疑似アイソメトリック」前提の望遠設定で、視点を
  回せるようになると狭すぎて周囲が掴めない。
- babylon版は`ArcRotateCamera`の組み込み操作を`detachControl()`で切り、同じ
  `camYaw/camElev/camDist`から毎フレーム`alpha = atan2(-cos camYaw, -sin camYaw)`、
  `beta = π/2 - camElev`を算出する（camYaw=0でbabylon既定の背面カメラ位置に一致）。
  両方を有効にすると1ドラッグで二重に回るので、必ず片方だけにすること。

**2. カメラ相対移動（`Mmo3dInputState` に `left`/`right` を追加）**
- 旧: W/S=前後・A/D=旋回のタンク操作。
- 新: W/S=カメラ奥/手前、A/D=カメラ基準の平行移動、矢印左右=カメラ旋回。
  キャラの見た目の向きだけが`PLAYER_TURN_LERP`で入力方向へ追いつき、**移動そのものは
  入力方向へ即座に**行われる（回転待ちが無いのでキビキビ動く）。
- **フェーズ19の「Wキーで無限に回る」自己参照バグが再発しない理由**: 目標角を
  `camYaw`と入力ベクトルだけから算出し、`facing`を一切参照しないため。`camYaw`は
  `turnBy()`/旋回キーでしか変化せず`facing`に依存しないので、
  `facing → 目標角 → facing` のループが構造的に存在しない。カメラをキャラの背後へ
  自動整列させる処理を入れるとこの独立性が壊れるので、入れていない。

**3. タッチ操作（それまでモバイルには移動手段が皆無だった）**
- `Mmo3dMaker.tsx`に仮想スティック（左下）とアクションボタン（右下：⚔攻撃/✨スキル/💬調べる）
  を追加。`(pointer: coarse)`のときだけ表示する。スティックは倒し具合がそのまま速度になり
  （`setAnalogMove`）、目一杯倒すと自動でダッシュになる。
- キャンバスは`touch-action: none`必須。付けないとタッチのドラッグがブラウザのスクロール/
  ピンチズームに吸われて視点が回らない。
- 攻撃は`click`イベントではなく**ポインタのタップ判定**（`TAP_MAX_MOVE`以下の移動で離した
  とき）から呼ぶ。キャンバス全面が視点回転ドラッグになったため、旧`click`のままだと
  ドラッグを離すたびに攻撃が暴発する。
- モバイルのプレイ領域は375x281px程度しかないので、HUD（ホットバー/HP/敵HP）はタッチ時
  だけ配置を変える。**上部中央には置けない**（GameMakerのヘッダーがプレイ領域の上端
  48px程度に重なる）。

**4. GameMakerの固定コントローラを配線（`virtualKeys`）**
- mmo3dだけ`virtualKeys`未接続で、画面に出ているのに何を押しても反応しなかった。
  十字キー=カメラ相対移動、B=攻撃、X=スキル、A=話す、Y=ダッシュを割り当てた。
- 入力ソースが3系統（キーボード / 仮想スティック / 固定コントローラ）になったため、
  各系統は`inputSrcRef`に状態を溜めるだけにし、**`engine.setInput()`を呼ぶのは
  統合ループ1箇所だけ**にした。系統ごとに直接呼ぶと、片方の「押していない」が
  もう片方の入力を打ち消す。

**5. ワールド境界（`WORLD_HALF_SIZE`）**
- 地面は40x40しかないのに境界判定が無く、外の「何も無い空間」へ延々と歩けてしまい、
  一度出ると目印が無いので戻れなくなっていた（実機で98m先まで歩けることを確認）。
  `clampToWorld()`で±19.6mに制限した（three/babylon両方）。

**実機検証**（prodビルド + `.env.production.local`でmock、検証後に削除）:
- ドラッグ100pxで`camYaw`が-34.4°回り、前進後の`facing`もその値に一致（three/babylon両方で
  期待値と一致）。矢印キー旋回0.5秒→+69.2°も期待どおり。
- A/Dのカメラ相対平行移動＝`facing`が`camYaw-90°`になることを数値で確認。
- 仮想スティック: 全開で6.0m/s（ダッシュ）、半分で1.6m/1.2秒（歩き2.6m/s×0.5）、離すと即停止。
- タップ＝攻撃（敵HP 60→40）、ドラッグ＝攻撃が出ない、を同一シーケンスで確認。
- GameMakerの十字キーで移動、Bボタンで攻撃（敵を撃破しXPバーが50%＝1体分に）を確認。
- ワールド境界: ダッシュで走り続けても19.6mで停止する。
- 操作ガイド（30秒無操作で出る）にmmo3d用の項目が出ることを確認。

**検証環境の注意（次回のため）**: Browser paneのタブは`document.hidden=true`のことが多く、
その間`requestAnimationFrame`が発火しないためエンジンが完全に止まる。スクリーンショットを
撮った瞬間だけ数フレーム進むので、「動かない」と見えても不具合とは限らない。位置の観測は
ミニマップのDOM（ドットの`style.left/top`とプレイヤー三角の`rotate()`）から読むのが確実。
`lib/mmo3d.ts`には開発ビルド限定で`window.__mmo3d`ハンドルを追加した（`__yume25d`と同じ方針）。

**未対応（既知）**:
- `GameMaker.tsx`の`dpadProps.onPointerDown`が`setPointerCapture`を素で呼んでおり、
  例外が出るとその場で入力処理が中断する（`Yume25DMaker.tsx`の`tryCapturePointer`のように
  try/catchで包むべき）。全エンジン共通のコードなのでフェーズ28では触っていない。
- babylon版のプレースホルダーは頭を持たないカプセルのままで、空（スカイ）・影も無い。
  three版との見た目の差は未解消。
