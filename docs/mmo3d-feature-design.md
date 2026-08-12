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
