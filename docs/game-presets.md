# ゲームの見本プリセットとまっさらテンプレート

ゲームエディタ（`components/GameMaker.tsx`）でゲームを作り始める入口は2種類ある。
このドキュメントは、その2つの違い、保存データとの関係、見本の足し方、第三者IPの方針とその経緯、
内蔵の効果音・エフェクトの作り方、見本がどれだけ開かれたかを数える `preset_opens` をまとめる。

- 型・共通定義: [components/game-presets/shared.ts](../components/game-presets/shared.ts)（`PresetId` / `SamplePresetId` / `PresetData`）
- 見本の登録: [components/game-presets/index.ts](../components/game-presets/index.ts)（`PRESETS` / `PRESET_ORDER` / `PRESET_TAGLINE` / `isSamplePresetId`）
- まっさらテンプレート: [components/game-presets/templates.ts](../components/game-presets/templates.ts)（`createEngineTemplate` / `TEMPLATE_ENGINES` / `ENGINE_LABELS` / `ENGINE_TAGLINES`）
- 保存データとの相互変換: [components/game-manifest.ts](../components/game-manifest.ts)（`buildGameManifest` / `manifestToPresetData`）
- 見本のオリジナルBGM: [components/game-presets/bgm-library.ts](../components/game-presets/bgm-library.ts)
- 内蔵効果音: [lib/game-sfx.ts](../lib/game-sfx.ts)

---

## 1. 見本プリセットとまっさらテンプレート

| | 見本プリセット（sample preset） | まっさらテンプレート（engine template） |
|---|---|---|
| 中身 | そのまま遊べる完成した見本ゲーム（キャラ・台詞・マップ・BGM） | 特定のゲームの中身を一切持たない、そのエンジンで遊べる最小限 |
| 実体 | `PRESETS[id]`（`components/game-presets/<名前>.ts`） | `createEngineTemplate(engine)` が毎回新しく作る |
| ID | 見本のID（`SamplePresetId`） | `'blank'`（`PRESETS` に実体は無い） |
| 単位 | 見本ごと | エンジンごと（`TEMPLATE_ENGINES`: rpg / action / onjReze / touhou / yume25d） |
| エディタでの入口 | ギャラリーの見本一覧、設定の「ゲーム切り替え」 | ギャラリーの「まっさらから作る」、設定の「まっさらにする」「エンジン変換」 |

以前は見本プリセットがエンジンの雛形を兼ねていた（エンジンへの入口が見本しか無く、保存データの
preset が見本に無いIDだと `dq` を土台にしていた）。そのため見本を消すとエンジンへの入口ごと消え、
見本の中身が別のゲームへ混ざることもあった。2026-09-28 に両者を切り離した。

### `'blank'` になる経路

どれも `presetId` が `'blank'` になり、読み込み時はエンジンのまっさらテンプレートが土台になる。

- ギャラリーの「まっさらから作る」でエンジンを選んだ（`startFromTemplate`）
- 設定の「まっさらにする」（いまのエンジンのテンプレートで作り直す。ゲーム名だけ引き継ぐ）
- 設定の「エンジン変換」（`switchEngine`。変換先エンジン固有の設定＝物理・プレイヤーの大きさ・
  弾幕のフェーズ・`layout25d` などはテンプレートから取り、タイトル・見た目・BGM・効果音・スイッチ・
  アイテム・装備・エフェクト・戦闘・画面はそのまま引き継ぐ）
- RPGEN の取り込み（`lib/rpgen-parser.ts` が `preset: 'blank'` を書く。以前は `'onjReze'` と記録していた）
- 保存データの preset が見本に無いID（削除した `dq` / `deltarune` / `rockman` / `undertale` など）

テンプレートは「そのまま遊べる最小限」に留める。マップは地面（と外周の壁）だけ、置物は東方の
ボス1体（ボスがいないとステージが即終わる）とアクションのゴール旗だけ。アクションのタイル一覧には
はしご・すり抜け床・壊せるブロック・チェックポイントも入れてあり、塗るだけで使える。
`mmo3d` にもファクトリはあるが、ギャラリーとエンジン変換には出さない（`engine: 'mmo3d'` の `'blank'` を
読み込むときの土台としてだけ使う）。チェックポイントのタイルは通るだけで記録される（action エンジン。以前は
ジャンプ／決定キーを押している間しか記録されなかった）。

### 戦闘は後から付け外しする

戦闘タブは、以前は `gameData.battle` がある時（＝戦闘付きの見本から始めた時）しか出ず、戦闘を作る手段が
無かった。いまは rpg エンジンなら戦闘が無くても戦闘タブを出し、「戦闘を有効にする」で
`createDefaultBattleConfig()`（`shared.ts`。スタイル `'classic'`、技は攻撃と回復を1つずつ、既定値に
固有名詞なし）を入れる。「戦闘を無効にする」で `battle` を外せる（Ctrl+Z で戻せる）。

### 見本ごとの挙動はデータで持つ

`gameData.id === '<見本>'` や `presetId` で挙動を分けない。見本にしか無い演出が要るなら、`PresetData` /
`PlayerDef` / `ObjectDef` / `SceneDef` / `BattleConfig` にフィールドを足し、見本のデータでそれを設定する。
こうしておけば、見本を改造したゲームやまっさらから作ったゲームでも同じ演出が使え、見本を消しても
エンジンに死んだ分岐が残らない。2026-09-28 にデータへ移したもの:

| 以前の判定 | いまのフィールド |
|---|---|
| `id === 'snowForest'` のジャンプ・着地コマ差し替え | `player.airSpriteRef` / `player.landSpriteRefs` |
| `id === 'snowForest'` の光の精霊 | `player.companionLight` |
| `id === 'snowForest'` の寒色の乗算タイント | `PresetData.screenTint`（`{ color, alpha }`） |
| ボス名が `'レゼ'` のときの爆弾投げAI | `ObjectDef.ai: 'bomber'`（onjReze エンジン） |
| `undertale` / `deltarune` 見本のときだけの効果音・エンカウント演出・カーソル音 | 内蔵効果音（§6）と `battle.encounterEffect` / `battle.dodgePointer` |
| `id === 'rockman'` の武器切替（`player.weapons`） | 削除（ロックマン専用だったため） |

---

## 2. 保存データ（manifest）との関係

投稿・履歴・自動保存・JSON エクスポートはどれも `buildGameManifest`、読み込み（既存ゲームの初期ロード・
履歴復元・JSON 取り込み）は `manifestToPresetData` を通る（`components/game-manifest.ts`）。

- **土台**: manifest の `preset` が見本のIDならその見本の複製、それ以外は
  `createEngineTemplate(manifest.engine ?? 'rpg')`。`dq` へのフォールバックはもう無い。
- **「無い」は null で書く**: `battle` / `ending` / `titleScreen` / `deathScreen` / `phases` / `weather` /
  `screenTint` / `scroll`、プレイヤーの `airSpriteRef` / `landSpriteRefs` は、無いときに `null` を書く
  （`companionLight` は `false` も書く）。読み込み側は `null`＝このゲームには無い、**キー自体が無い時だけ**
  土台の値で補う。undefined のまま書くと JSON からキーごと消え、見本から外したはずの戦闘やエンディング、
  やられ画面、広いマップのスクロール範囲（縮めた 20 マスのマップに 96 マス分のカメラ）が読み込み時に復活していた。
- **プレイヤーは土台と混ぜない**: manifest に `player` があれば、土台（見本）からは必須項目（絵文字・色・
  速さ・大きさ・開始位置）だけを補い、任意項目（`spriteRef` / `minecraftSkin` / ボム・カットインの設定など）は
  混ぜない。混ぜると、外した歩行グラや東方のカットイン名が見本から復活していた。
- **背景の表示URLは参照から戻す**: `mapBgUrl` とタイトル／エンディングの `bgUrl` は保存しないので、読み込み時に
  `mapBgRef` / `bgRef` から戻す（`url:` / `tile:` のように参照だけで解決できるもの。`post:` は従来どおり戻らない）。
- **シーン制のゲーム**: GameMaker の `buildManifest` は、編集中のシーンの map/objects を写しの上で
  `scenes[editSceneIdx]` へ書き戻してから保存し、トップレベルの map/objects にはシーン0を書く
  （書き戻しはシーン切替・プレイ開始の `flushSceneEdits` だけだったので、塗った直後に投稿すると scenes が古いままだった）。
- **engine は知っている名前だけ**: 投稿された manifest の `engine` は `isEngineKind()`（`templates.ts`）で確かめ、
  知らない名前（`'constructor'` のような `Object.prototype` のキーを含む）は土台のエンジンにする。
- **プレイヤー・タイル・オブジェクト・シーン**は「表示用URL以外は全部」書く（列挙ではなく除外で書く）。
  以前は列挙していたので、`SceneDef.weather` や `TileDef.imageOverflowTop` / `imageScale2x` が黙って
  保存から落ちていた。`PresetData` の直下に項目を足すときは、`GameManifestDraft` の型・
  `buildGameManifest`・`manifestToPresetData` の3か所に足すこと（省略可能な項目なら null の規約に従う）。
- `mmo3dConfig` も保存・復元する。

後方互換は取っていない。2026-09-28 時点で本番の `games` 表はテスト用に投稿した1本だけで、
所有者がいつ壊れても消してもよいと言っているため（§7）。削除した見本のIDで保存されたデータは
`'blank'` ＋ エンジンのテンプレートを土台に読まれる（manifest に書かれていない項目は、元の見本ではなく
テンプレートの値で補われる）。`undertale` から `fusatsu` への読み替えもしない。

---

## 3. いまの見本

ギャラリーと「ゲーム切り替え」に並ぶ順（`PRESET_ORDER`）。

| ID | 名前 | エンジン | キャッチコピー | メモ |
|---|---|---|---|---|
| `onjReze` | おんｊレゼ | onjReze | 爆弾で暴れるアクション | レゼという名前はサイトの由来なので残す。人物像はオリジナル（花火大会が中止になった夏に、祖父の花火玉を投げて回る花火屋の孫娘）。台詞・BGMもオリジナル。ボスは `ai: 'bomber'` |
| `snowForest` | こおりの森 | action | 氷の足場を跳び渡る横スクロール | 終盤に はしご・すり抜け床 の見本区間。`screenTint` / `companionLight` / 空中・着地コマの見本。BGM は `SNOWFOREST_FIELD` |
| `touhou` | 東方(弾幕) | touhou | 弾幕をよけるシューティング | 東方Projectの二次創作。タイトル画面とエンディングにその旨を明記 |
| `fusatsu` | 不殺RPG | rpg | ころさなくてもいいRPG | オリジナルの不殺RPG「ログのはざま」（スレの中へ吸い込まれ、谷→ほしゅ横丁→地底湖→書庫を抜けて、1000を超えたスレを閉じる「1001」を開いて次スレへ出る）。敵・番人・宿はネット掲示板の文化から作った（くさ・ぬるぽ・みっかぼうず、sageけいさつ、ネットカフェ等）。パーティ制の弾幕よけ戦闘（TP・呪文・みのがし・HP で変わる敵の台詞）の見本 |
| `yume` | まよいゆめ | yume25d | さまよう2.5Dの夢の世界 | 旧名「ゆめにっき3D」 |

`mmo3d` は `PRESET_ORDER` から外した（ギャラリー・ゲーム切り替え・エンジン変換に出ない）が、
JSON 取り込みのために `PRESETS` には残してある。`Mmo3dMaker` は `next/dynamic` で遅延読み込みし、
Babylon.js / babylon-mmd が他のゲームの GameMaker チャンクに入らないようにした。

---

## 4. 見本を足す手順

1. `shared.ts` の `PresetId` に ID を足す（`SamplePresetId` は `'blank'` を除いたものなので自動で増える）。
2. `components/game-presets/<名前>.ts` で `PresetData` を export する（`id` は 1. と同じ）。
   土台は `createEngineTemplate(engine)` から始めると必須項目を取りこぼさない。
3. `index.ts` の `PRESETS` と `PRESET_TAGLINE` に足し、ギャラリーに出すなら `PRESET_ORDER` にも足す。
4. `app/api/games/preset-open/route.ts` の `SAMPLE_PRESETS` に足す（`Record<Exclude<PresetId, 'blank'>, true>`
   なので、足し忘れると型エラーになる）。
5. 素材は §5 の方針に従う。BGM は `bgm-library.ts` にオリジナル MML を書いて `mmlBgm()` で使う。
   効果音は `gameSfxRef('<役割>')`（`lib/game-sfx.ts`）か、インライン MML。
6. 見本にしか無い挙動が要るなら、ID で分岐せずフィールドを足す（§1）。
7. `pnpm typecheck` / `pnpm lint`。ギャラリーから開く → 保存 → 読み込みの往復で中身が変わらないこと、
   外した戦闘などが復活しないことを確かめる。

---

## 5. 第三者IPの方針

対象は**サイトが同梱して配るものすべて**: 見本プリセット、まっさらテンプレート、エンジンの既定値
（既定の効果音・既定の文言・既定の画像）、エディタの内蔵素材タブ。利用者が自作のゲームで何を参照するかは
この方針の対象ではない（それは投稿のルールの話）。

- **市販ゲームから抜き出した画像・効果音・音楽を使わない。** 抜き出し素材をホストしている第三者の
  CDN・GitHub raw・`rpgen.org/dq/spells` のような置き場への直リンクも同じ扱い。
- **市販ゲームの題名・キャラクター名を、利用者に見える見本やエンジン既定値に出さない。** 見本名・
  キャッチコピー・エディタの表示名（「〜風」を含む）が対象。内部ID（戦闘スタイル `'undertale'` /
  `'deltarune'`、エンカウント演出 `'undertale'` など）は保存データ互換のため残し、表示名だけを
  「弾幕よけ（ひとり）」「弾幕よけ（パーティ）」「！→ハート」にした。コードのコメントで元ネタに触れるのは構わない。
  例外は東方Project（下記）と、サイトの由来である `onjReze` の「レゼ」という名前だけ（所有者の判断で名前は残し、
  台詞・BGM はオリジナルに差し替えた）。
- **見本の BGM はオリジナル MML。** YouTube の転載はもちろん、公式チャンネルの動画の埋め込みも置かない
  （公式でも「その曲を見本の BGM にしてよい」という許諾ではないため）。
- **RPGEN 素材（rpgen-search）は1つずつ出どころを確かめる。** 利用者投稿のフリー素材 DB だが、市販ゲームからの
  抜き出しも混ざっている。題名が「ﾄﾞﾗｸｴ…」「[ポケ]…」「桃/…」のように元のゲームを示すものは使わない。
- **二次創作は、権利者のガイドラインが認める範囲だけ。** いまは東方Projectだけ（下記）。
- **挙動を見本のIDで分けない**（§1）。IPに寄った見本を消したときに、エンジンに専用分岐が残らないように。

### 経緯

| 日付 | 変更 | 理由 |
|---|---|---|
| 2026-06-16 | `pokemon` / `zelda` 見本を削除（`PokemonBattle.tsx` も） | 市販ゲームそのものを題にした見本 |
| 2026-08-19 | `mario` 見本を削除し、オリジナルの `snowForest` を新設。「SMC素材」タブ（`SMCAssetPanel.tsx`）、`lib/smc-helper.ts`、`lib/mario-sm127-assets.ts`、GameMaker の mario 専用分岐（約90か所）も削除 | 任天堂のIP（SMC-released-sprites 経由のスプライト）。汎用の機構（踏みつけ `stompable`、手動切り出しの `smc` 歩行グラ規格）は残した |
| 2026-09-28 | `dq` 見本を削除 | DQ1 の縮約版（城・町の名前もそのまま）。BGM は YouTube 参照（6曲）、呪文エフェクトは `rpgen.org/dq/spells` の抜き出し画像への直リンク |
| 2026-09-28 | `deltarune` 見本を削除（`lib/deltarune-tldr-assets.ts` も） | tlDR Engine（ファン製エンジン）の GitHub raw から、本編から抜き出した音楽・効果音・スプライトを直リンク。パーティ戦の機構は `fusatsu` に移した |
| 2026-09-28 | `rockman` 見本を削除（`lib/megaman-assets.ts`、`vglc-stages.ts`、`scripts/import-vglc.mjs`、`vglc` スクリプトも） | ロックマン2の楽曲の抽出（ファンリメイク megamanjs の GitHub raw から直リンク）と、VGLC（市販ゲームのステージを文字化したコーパス）経由の初代ロックマンのステージ配置。はしご・すり抜け床・壊せるブロックはタイル特殊のプルダウンに救出し、どのアクションでも使えるようにした。ロックマン専用の武器切替は削除 |
| 2026-09-28 | `undertale` → `fusatsu`（中身は全面的に書き直し、`lib/undertale-engine-sfx.ts` も削除） | Undertale Engine 同梱の効果音を第三者の GitHub raw から直リンクしており、しかも全ての弾幕よけ・パーティ戦の既定音になっていた。作者 Toby Fox は公式 Tumblr（2016年2月）の音楽の二次利用についての案内で、ゲームの効果音と原曲のサンプルは使わないよう明言している（カバー曲向けの案内だが、ここでは用途を問わない禁止として扱う） |
| 2026-09-28 | `onjReze` を差し替え | BGM が YouTube の「IRIS OUT」8bit アレンジ、台詞の一部がチェンソーマン本編の逐語・固有の設定への言及、ボスAIがキャラ名 `'レゼ'` で分岐、アイテム名がDQ由来（キメラのつばさ等）、RPGEN 効果音に市販ゲームの抜き出しが混ざっていた。台詞・BGM・アイテム名・効果音をオリジナル／汎用のものへ |
| 2026-09-28 | `yume` を差し替え | 見本名「ゆめにっき3D」が既存作品名、BGM がマインクラフトの BGM の再アップロード。「まよいゆめ」とオリジナル MML へ |
| 2026-09-28 | `touhou` を差し替え | BGM が ZUN 氏の原曲の再アップロード2本 → オリジナル MML。二次創作の明記を追加。エンジン既定のボムカットイン（魔理沙・恋符「マスタースパーク」・imgur の立ち絵）を中立の文言・画像なしへ |
| 2026-09-28 | エンジン全体 | 上記の効果音 → 内蔵のオリジナル合成音（§6）。戦闘のコマンドボタン画像（tlDR 由来）→ CSS/絵文字、ハートの画像 → ベジェで描くハート。内蔵エフェクト（`rpgen.org/dq/spells` 直リンク）→ 生成したスプライトシート。効果音ピッカーの「他ゲーム音源」タブ（`BuiltinGameSoundPanel.tsx`: undertale / deltarune / megaman）→ 「内蔵SE」タブ（`EngineSfxPanel.tsx`）。「アンダーテール風」などの表示名を中立の名前へ |

教訓は「見本を消してもIPは消えない」。2026-09-28 の棚卸しで見つかったIPのかなりの部分は見本ではなく、
エンジンの既定値（全弾幕よけ戦闘の既定音、戦闘UIの画像、内蔵エフェクト、東方の既定カットイン）と
エディタの素材タブに埋まっていた。

### 東方Projectを残している理由

上海アリス幻樂団の[東方Project二次創作ガイドライン](https://touhou-project.news/guideline/)は、個人のファン活動と
してのゲーム制作を認めている。条件は「東方Projectの二次創作であることを明記する」ことと、スクリーンショット・
プレイ動画以外の**原作ゲームの素材（画像・音楽・効果音）を使わない**こと。そのため `touhou` はキャラクター名
（霊夢・チルノ）とスペルカード名は使い、画像・音声・楽曲は一切使わず（BGM は `bgm-library.ts` の MML、効果音は
内蔵音）、タイトル画面とエンディングに東方Projectの二次創作である旨（原作：上海アリス幻樂団）を出す。
スペルカードと道中の wave は、以前の版（`git show b54ff4fc^:components/game-presets/touhou.ts`）を元に見本として戻した。

### レビューで追加で直したもの（2026-09-28）

- `snowForest` の BGM（既存曲のアレンジ動画 `ugPZI3ldPhk` への YouTube 参照）→ オリジナル MML `SNOWFOREST_FIELD`。
  これで見本の BGM はすべて `bgm-library.ts` の曲になった。
- エンジン既定の効果音のうち rpgen-search の mp3 へ直リンクしていたもの（メッセージ送り `OzsJfs`、
  システム床のワープ／ダメージ床／扉、宝箱 `chest()`、yume25d の食事・被ダメージ・着地）→ 内蔵のオリジナル合成音
  （`msgAdvance` / `warp` / `floorDamage` / `door` / `chestOpen` / `eat` / `hurt` / `land`）。出どころを確かめていない
  素材を、まっさらテンプレートから作ったゲームでも鳴らしていたため。
- パーティ戦のエンカウント音（`encounterParty`）が、既存作品の合図（同じ和音を少し高くして2回→得物を構える音、
  8フレーム間隔）の形をなぞっていた → ふくらむノイズから上がる3音へ作り直した。
- `fusatsu` の地域の並びと敵・NPC の役まわりが既存の不殺RPGをなぞっていた（上から落ちてくる導入、カエル・蝶・
  おばけの最初の3体、雪の町の犬・雪だるま・うさぎの宿・鎧の番人、魚・クラゲの水辺、地下に残れと頼む王）→
  吸い込まれる導入、ネット掲示板の文化から作った敵・番人・宿、スレを閉じる「1001」に書き直した。
- `onjReze` の筋書きが既存作品の章をなぞっていた（喫茶店の店員、実は仕事で街に来た爆弾使い、異国育ちの示唆、
  「一緒にどこかへ行かないか」）→ 花火屋の孫娘の話に書き直した。「やくそう」→「麦茶」。
- 内蔵素材タブの見出し「DQ風キャラ」→「内蔵キャラ」。マイクラスキンの見本から Splatoon・アイドルマスターの
  キャラクターを外した。使われていなかった `lib/game-presets.ts`（IRIS OUT の YouTube 参照と「Mario Jump」を含む旧形式の
  見本）を削除した。

### 残っている外部参照（2026-09-28 時点）

- `onjReze` / `snowForest` / `fusatsu` は RPGEN（rpgen-search）の歩行グラを使い、`onjReze` は出自の書かれていない
  RPGEN 効果音も2つ使う（「斬撃」「決定」）。`onjReze` のボスの歩行グラは RPGEN 上の題名が「レゼ」の素材。

---

## 6. 内蔵の効果音とエフェクト（生成スクリプト）

どちらも外部素材を使わずにスクリプトで作り、生成物（WAV / PNG）をリポジトリに入れている。
固定シードの疑似乱数なので、何度実行しても同じバイト列になる（差分が出たら中身を作り直したということ）。

### 効果音: `scripts/make-game-sfx.mjs` → `public/assets/game-sfx/*.wav`

```
node scripts/make-game-sfx.mjs
```

- 矩形波・三角波・サイン波・ノイズとエンベロープだけで合成する（22050Hz / モノラル / 16bit PCM）。
- 役割（キー）とファイル名の対応は `lib/game-sfx.ts` の `GAME_SFX_FILES`、エディタ表示名は `GAME_SFX_LABELS`。
  音を足すときはスクリプトの `SOUNDS` と `lib/game-sfx.ts` の両方に足す。
- エンジンが既定音として鳴らすときは `GAME_SFX.<役割>`、見本・テンプレートの `sfx` に入れるときは
  `gameSfxRef('<役割>')`（`direct:/assets/game-sfx/…` の参照になり、保存・読み込みしても同じ音に戻る）。
- どの見本でも同じ既定音が鳴る（見本ごとの鳴らし分けはしない）。メニュー・セリフの UI 音は
  `SfxTrigger` の `confirm` / `cancel` / `text` で差し替えられる。
- フィールドの既定音（メッセージ送り・システム床・宝箱・yume25d の食事／被ダメージ／着地）もここから引く
  （`shared.ts` の `SYS_TILE_*_SFX` と `chest()`、`lib/yume25d.ts`）。外部の効果音への直リンクを既定値に置かない。
- エディタの効果音ピッカーの「内蔵SE」タブ（`components/EngineSfxPanel.tsx`）で試聴して選べる。

### エフェクト: `scripts/make-effect-sheets.mjs` → `public/assets/game-effects/*.png`

```
node scripts/make-effect-sheets.mjs                  # 書き出す
node scripts/make-effect-sheets.mjs --preview=DIR    # 確認用の拡大シート（背景3色×全コマ）も DIR へ
                                    [--scale=N]      # 確認用シートの拡大率（既定4）
```

- 火の玉・炎・爆発・風・氷・回復の6本。1コマ 24x24px の横一列（`EffectPreset` の形式）。
  フィールドでは2倍、戦闘では3倍で描かれるので、どちらでも整数倍になる。
- 最終コマは「消えかけ」にしてある（戦闘のエフェクトアニメは最終コマのまま終わりを待つため）。
- GameMaker の `BUILT_IN_EFFECT_PRESETS`（エフェクト → プリセットから追加）が `url:/assets/game-effects/…` と
  対応する内蔵効果音（`effectFire` など）で参照する。

戦闘オーバーレイのスプライト（`battleSprite` / `battleSprites`）はデータで指定する仕組みとして残してある。
見本で使うならオリジナルの画像だけを入れること。

---

## 7. 見本の需要を数える（`preset_opens`）

### なぜ数えるか

2026-09-28 の棚卸しの時点で、本番の `games` 表には**テスト用に投稿したゲームが1本**しか無かった。
これでは、どの見本が使われているかから残す・直す・消すを決めることができない。しかも `games.preset` は
もともと需要の指標にならない:

- RPGEN の取り込みが `'onjReze'` として記録されていた（いまは `'blank'`）。
- 改造（remix）は元のゲームの preset を引き継ぐ。
- ギャラリーで見本を開いただけでは何も残らない（投稿まで行ったゲームしか数えられない）。

そこで、ギャラリーで見本／テンプレートが**開かれた回数**を日別に数える表を足した。

### 仕組み

- 表: `preset_opens(preset TEXT, day DATE, opens INT, PRIMARY KEY(preset, day))`。1行＝キー×日（JST）なので、
  行数は開いた回数では増えない。IP・ユーザーIDなど個人に結びつく値は持たない。
- `DataStore.recordPresetOpen(preset)`（`lib/db/interface.ts` / `mock.ts` / `pg.ts`）。pg は
  `INSERT … ON CONFLICT (preset, day) DO UPDATE SET opens = preset_opens.opens + 1`（RETURNING なし）。
- `POST /api/games/preset-open`（`app/api/games/preset-open/route.ts`）、ボディ `{ preset }`。
  キーは見本ID・`'blank'`・`template:<エンジン>`（例 `template:rpg`）だけを受け付け、それ以外は 400。
  受け付けたキーは、数えても・間引いても・DB が失敗しても 204（エディタを止めない）。
  表が無い（移行SQL未適用、`42P01`）ときはアイソレートごとに1回だけ警告を出して黙って数え漏らす。
  同じ IP・同じキーは 10 分間 KV で間引く（IP は KV の間引きキーにだけ使い、DB には残さない）。
- クライアント: `recordPresetOpen(key)`（`lib/game-mv-client.ts`）。投げっぱなし・`keepalive`・失敗は無視。
  ギャラリーで見本を選んだ時、「まっさらから作る」でエンジンを選んだ時、選び直さずに既定の見本のまま
  進んだ時に呼ぶ。同じキーは GameMaker を開いている間に1回だけ送る。

### 移行SQL

`docker/init.sql` と unj リポジトリの `wiki/init.sql` には入っている。稼働中の Neon には
[README.md](../README.md) の「既存DBへの移行SQL」にある次の SQL を当てる（当てるまでは数え漏らすだけで、
エディタは壊れない）。

```sql
CREATE TABLE IF NOT EXISTS preset_opens (
    preset TEXT NOT NULL,
    day DATE NOT NULL,
    opens INT NOT NULL DEFAULT 0,
    PRIMARY KEY (preset, day)
);
```

集計（直近30日、多い順）:

```sql
SELECT preset, SUM(opens) AS opens
  FROM preset_opens
 WHERE day >= (now() AT TIME ZONE 'Asia/Tokyo')::date - 30
 GROUP BY preset
 ORDER BY opens DESC;
```

---

## 8. 見本にしなかったもの（所有者の旧作）

所有者の旧作 rpg / roguelike / walksim（GitHub Pages）は、それぞれ独立したエンジン（2〜3.7万行）で、
全編を GameMaker へ移すと劣化コピーにしかならない（roguelike は新しい `EngineKind` も要る）。
代わりに `lib/embed.ts` の `type: 'game'` で `https://onjmin.github.io/rpg/` / `/roguelike/` / `/walksim/` 配下を
許可し、URL を投稿すればフィードで原作をそのまま遊べるようにした。
