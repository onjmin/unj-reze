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
