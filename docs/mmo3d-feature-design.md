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

### MMD（PMX/PMD）モデルは追加実装が必要

three.js は r150前後で `MMDLoader`/`MMDAnimationHelper` を examples から削除しており、
現在の依存（three 0.185.1）には同梱されていない。単純な横展開ではなく、以下のいずれかが必要:

- サードパーティの MMD ローダー実装を依存追加する
- 旧 three.js examples の MMDLoader 系ファイルを `lib/vendor/` 相当に自前で移植する

どちらもライセンス/メンテナンスコストの検討が要るため、**別タスクとして切り出す**
（本体のGLTFパイプラインとは独立に進められる）。

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

## ゲーム内BBS機能（2D/3D共通）

`BbsBoardView.tsx`/`BbsThreadView.tsx` は**自サイトの投稿を2ch風に見せる内製UI**であり、
外部の実サイト（`open2ch.net`など）を読みに行くプロキシではない。今回の要望は新規機能:

### 案A: タイル/配置トリガー型（作者が事前配置）
- 2Dエンジン: `public/assets/rpgen/map.png` の `(11,13)` のようなタイルを「BBS入口」として
  マップに配置。ゲーム作者がエディタでタイルごとに対象スレッドURL（または内部スレッドID）を
  設定する。プレイヤーが調べる/踏むと `BbsThreadView` 相当のオーバーレイが開く。
- 3Dエンジン(mmo3d/yume25d): 同じ考え方をビルボード/オブジェクトのinteractに対応させる。
- 外部2ch/Open2ch系サイトを読む場合は、`subject.txt`/`dat`形式を解釈するサーバー側プロキシ
  ルート（`app/api/bbs-proxy/[...]`相当、新設）が要る。**書き込み（レス投稿）は外部サイトの
  bbs.cgiプロトコルに準拠する必要があり、対象サイトの利用規約・レート制限を踏まえて別途設計
  する**（無条件の自動書き込み機能は乱用リスクが高いため、原案では「閲覧のみ」を先に実装し、
  書き込みは要検討区分とする）。

### 案B: シームレス型（oz.open2ch.net 的な常時アクセス）
- ゲーム内の特定エリア/UIから、外部スレッド一覧・スレッドをシームレスに閲覧できるビュー。
  案Aのプロキシ層ができれば、UIをタイル起点からマップ常設パネルに変えるだけで実現できる
  ため、**案Aのプロキシ実装が前提**。

この機能はmmo3d本体のフェーズ1〜6とは独立して並行開発できる（2D/3D両対応の横断機能のため）。
