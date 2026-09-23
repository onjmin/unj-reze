# かけあい動画（`talk`）設計ドキュメント

2人（以上）のキャラクターが掛け合いで解説する「ゆっくりムービーメーカー風」の動画投稿。
MV（[mv-feature-design.md](mv-feature-design.md)）とは**別の投稿種別**として新設し、描画部品と
mp4 書き出しだけを MV から借りる。声は `@onjmin/dtm` の `studio.speak`（koe UtauTTS）。

- 型定義: `lib/talk-config.ts`（新規）
- 時間軸の組み立て: `lib/talk-timeline.ts`（新規）
- 描画: `lib/talk-engine.ts`（新規。`lib/mv-engine.ts` の部品を import）
- 音: `lib/talk-audio.ts`（新規。`lib/dtm.ts` の共有 studio）
- 編集UI: `components/TalkMaker.tsx` / 再生: `components/TalkPlayer.tsx` / 埋め込み: `components/TalkBox.tsx`
- 先行実装: ゲームのメッセージウィンドウ読み上げ `lib/game-voice.ts`（同じ `studio.speak` を使う）

---

## 0. 方針（決まっていること）

- **素材はゆっくりの顔ではない。** キャラ画像は本 SNS に投稿された画像（`post:`）、psd の
  レイヤー（`psd:`）、URL（`url:`）、または内蔵イラスト。ゆっくり顔素材は二次創作物なので
  使わない（マリオ除去と同じ判断軸）。
- **趣旨は「漫才形式の解説動画」。** ボケ/ツッコミの 2 人が交互に話す。台本を書けば動画になる、
  が体験の核。AviUtl 的な自由タイムラインは持たない（MV と同じ思想）。
- **時間軸は台本の行。** MV の「時間軸は MML だけ」は使わない。各行の長さは読み上げの長さで
  決まる。BGM は任意で、時計にはならない（§2）。
- **声は koe UtauTTS。** 音源ごとの利用規約と HTS モデル（tohoku-f01、CC BY 4.0）の表記が要る（§8）。

---

## 1. データモデル（`lib/talk-config.ts`）

```ts
export interface TalkManifest {
  version: 1;
  title: string;
  credit?: string;                 // 音源・素材のクレジット（§8）
  stage: TalkStage;                // 背景・字幕の見た目
  characters: TalkCharacter[];     // 通常 2 人。id で cue から参照
  cues: TalkCue[];                 // 台本。上から順に再生
  bgm?: { mml: string; volume: number };  // 任意。ループ再生、時計にはしない
}

export interface TalkStage {
  bg?: MvAssetRef;                 // 背景画像（無ければ単色）
  bgColor: string;
  subtitle: {
    style: "window" | "band";     // 下部ウィンドウ / 帯
    fontSize: number;
    color: string;
    outline: string;
  };
}

export interface TalkCharacter {
  id: string;
  name: string;                    // 字幕の話者名
  color: string;                   // 話者名と字幕縁の色
  side: "left" | "right";
  scale: number;
  y: number;                       // 足元の位置（設計座標）
  /** 表情ごとの立ち絵。neutral は必須。無い表情は neutral にフォールバック */
  faces: Partial<Record<TalkExpression, MvAssetRef>> & { neutral: MvAssetRef };
  flipH?: boolean;                 // 右側のキャラを向かい合わせにする等
  /** 瞬き・口パク。MV の character レイヤーと同じ画像の持ち方だが、lipsync の
   *  トラック指定は無い（口は読み上げのモーラ列から動かす）: TalkEyes / TalkMouth */
  eyes?: TalkEyes;
  mouth?: TalkMouth;
  voice: {
    /** 音源キー。内蔵なら koe 音源キーワード（KOE_VOICEBANK_NAMES）、
     *  持ち込みなら talkCustomVoiceKey() が作った `custom_` 始まりのキー */
    model: string;
    pitchOffset?: number;          // 半音
    style?: "neutral" | "calm" | "lively";
    /** 持ち込みの UTAU 音源（koe 形式 .koe の URL と表示名）。あるとき model はこの音源のキー */
    custom?: { url: string; label: string };
  };
}

export type TalkExpression = "neutral" | "happy" | "sad" | "angry" | "surprised";

export interface TalkCue {
  id: string;
  speaker: string;                 // TalkCharacter.id
  text: string;                    // 読み上げ・字幕の本文（漢字可。読みは jpreprocess）
  expression?: TalkExpression;     // 立ち絵の差し替え。省略時 neutral
  /** 声の感情。省略時は expression から引く（surprised→happy、それ以外は同名） */
  emotion?: "neutral" | "happy" | "sad" | "angry";
  /** この行だけの話し方。省略時はキャラの voice.style（cueStyle() で解決） */
  style?: "neutral" | "calm" | "lively";
  gapSec?: number;                 // この行の後の間。既定 0.35
  subtitle?: string;               // 字幕だけ変えたいとき（読み上げは text）
  /** 保存時に計った読み上げ長（秒）。再生前のプレビュー・サムネ・シークに使う。再生時は再計算 */
  measuredSec?: number;
}
```

- `MvAssetRef` は `lib/mv-config.ts` からそのまま使う。`emoji:` 参照は絵文字を fillText で描く（内蔵イラストが
  無い段階の代用と、開発用ページのサンプルに使う）。
  psd の目/口レイヤー割り当て UI（`CharacterLayerFields`）も流用対象。
- 表情は「立ち絵の差し替え」（`faces`）と「声の感情」（`emotion`）の 2 系統。UI では
  `expression` 1 つを選ばせ、`emotion` は省略時に表情から導く。声だけ変えたい上級者向けに
  `emotion` を残す。
- `measuredSec` は**キャッシュであって真実ではない**。TTS のバージョンや音源が変わると
  長さは変わるので、再生時は必ず計画し直す（§2）。
- 音源の選択 UI は dtm の歌唱モデル選択と同じ大分類（kusaプリセット / おんJ / 一般 / クッキー☆）に
  分ける。**分類表は dtm が持つ**（`VOICE_MODEL_CATEGORIES` / `groupVoiceModels`）——音源を増やすのは
  dtm 側なので、こちらに写すと増えた音源が「その他」に落ちたまま放置される。reze は
  `loadVoiceModelGroups()`（`lib/game-voice.ts`）で `KOE_VOICEBANK_NAMES` を渡すだけ
  （語れない `klatt` はこの一覧に無いので自然に外れる）。
- **カスタム音源**は `.koe` の URL を持つだけで、ファイルはこのアプリでは預からない（CORS 必須）。
  キーは URL から決まる（`talkCustomVoiceKey`。日本語名で英数字が残らないため URL のハッシュを混ぜる）。
  読み上げ・計画・先取りの前に `registerTalkVoicebanks()`（`lib/talk-audio.ts`）で
  `studio.singingVoices.registerVoicebanks()` へ流し込む。権利表記は投稿者がクレジット欄に書く（§8）。

---

## 2. 時間軸（`lib/talk-timeline.ts`）

MV と決定的に違う点。台本の各行の長さは**読み上げてみないと分からない**。

```
cues → (全行を計画+合成) → durations → timeline { cue, startSec, endSec }
```

1. 再生開始時に `studio.prepareSpeech(models, { emotions })` でアセットを取り、全行を
   `studio.speak(text, { ..., at: <未来の絶対時刻>, awaitRender: true })` ではなく、まず
   **計画だけ**を全行ぶん行って長さを得る。dtm の `singingVoices.planSpeech(model, text)` が
   長さを返す（感情・話し方を含む版が要る → §7 のライブラリ改修 (a)）。
   計画はメインスレッドで行数に比例して掛かるので、その前に最初の行の合成を鳴らさずに始めて
   おく（`prerenderTalkHead`。dtm は合成した音を本文・声・話し方・感情ごとに取っておき、
   3. で同じ行を置くとその音を使う）。計画と合成が重なるので、最初のチャンクの合成が
   頭出しの余裕（0.2 秒）より長く掛かるとき（遅い音源・重い端末）に初回の鳴り出しが早まる。
2. `startSec[i] = startSec[i-1] + duration[i-1] + gap[i-1]` で並べる。
3. 再生は AudioContext の時計 `t0 = ctx.currentTime + 0.2`（頭出しの余裕）を基準に、各行を
   `studio.speak(text, { at: t0 + startSec[i], awaitRender: "first-chunk", lateChunks: "shift" })`
   で置く（`lib/talk-audio.ts` の `scheduleTalkSpeech`）。
   - どの行も**最初のチャンクが出来てから頭から鳴らし**、合成が再生に追いつかなければ
     **声を後ろへずらす**（言葉は欠けない）。既定の `awaitRender: false` / `lateChunks: "skip"` は
     予定時刻を過ぎて届いたチャンクを飛ばすので、頭や途中が欠け、丸ごと過ぎた行は無音になる。
     合成の遅い音源（roze・持ち込み .koe）は `minBufferSec` を多めにして途中の間を減らす。
   - **全行を先に投げない。** voice worker は同時に投げた発話の合成を分け合うので、全行を先に
     投げると全部が再生に追いつかない。先頭の行の鳴り出しが決まったら再生を始め、残りは
     前の行の鳴り出しが決まってから、予定の 1.5 秒前に 1 行ずつ投げる。
   - **絵は声に合わせる。** 行が予定より遅れて鳴り出した・行の途中で後ろへずれたときは `t0` を
     後ろへ動かす（鳴っている行では `SpeechHandle.position()` に合わせる。合成待ちで空いた間は
     進まない）。次の行の声がまだ鳴っていなければ、絵はその行の頭で待つ。投げたあとで前の行が
     ずれ込んだら、鳴り出す前に今の `t0` で置き直す（合成済みの音は dtm のキャッシュから置くだけ）。
4. 描画側は発話セッションの時計 `session.timeSec()`（上の `t0` で声に合わせた秒）で現在秒を取り、
   timeline から現在の cue と経過割合を引く。
   MV の `onTick(step)` に相当するものは無く、`timeSec` だけを渡す。

- **一時停止**: 発話ハンドルをすべて `stop()` して、再開時は現在秒以降の行を再スケジュール
  する（途中の行は頭から言い直す。行の途中から再開する精度は要らない）。
- **シーク**: 行単位。行の頭へ飛ぶ。
- **BGM**: `bgm.mml` があれば `playMML`（light モード）でループ再生し、音量だけ下げる。
  時計には使わない。MV と違い拍同期の演出は持たない。
- **読み上げが無い行**（音源ロード失敗・読みが取れない本文）は文字数 × 0.12 秒 + 0.6 秒で
  代用し、字幕だけ出す。動画は必ず最後まで進む。

---

## 3. 描画（`lib/talk-engine.ts`）

`lib/mv-engine.ts` から次を **export に昇格**して借りる（現状は module-private）:
`drawCharacterLayer`、`resolveAssetRefImage`、`DrawCtx`。画像の事前ロードは既存の
`preloadMvImages` / `collectMvPsdRefs` を manifest の型だけ差し替えて呼ぶ。

1 フレーム = `drawTalkFrame(ctx, manifest, timeline, timeSec)`:

1. 背景（`stage.bg` か `bgColor`）。
2. キャラ 2 人。話している側はその行の `expression` の立ち絵、聞いている側は**直前の自分の
   セリフの表情**を保つ（まだ喋っていなければ `neutral`）。行が変わるたびに ふつう へ戻すと
   表情がコロコロして不自然なので、次に自分が喋るまで持ち越す。
   話者は少し前（scale ×1.03）・聞き手は少し暗く（alpha 0.85）して「誰が話しているか」を
   画面だけで分からせる。
3. 口パク。話者は「音の有無」で開閉させるのが第一段階。第二段階で読み上げ計画の
   モーラ（`timeline.units[].alias` と `position_ms`）から母音を**推定なしで**引き、
   `mouth.vowels` に流す（§7 (b)）。MV の `mv-vowel.ts` の推定より正確になる。
4. 瞬きは MV の `resolveBlinkState` をそのまま使う（seed 決定論）。拍位置の代わりに秒を渡す。
5. 字幕。`stage.subtitle.style` に従い下部に話者名＋本文。行の頭で全文を出す（YMM 風）。
   1 行が長いときは自動改行、2 行まで。それ以上は台本側で分けることをエディタが促す。

キャンバスは MV と同じ 640×360 の論理座標＋ `transform: scale`。

---

## 4. 音（`lib/talk-audio.ts`）

- 共有 studio（`lib/dtm.ts` の `getStudio()`）を使う。**2 つ目の studio は作らない**
  （音量がサイト共通の masterGain に乗る）。
- `speakGameMessage` と同じく `studio.speak` を呼ぶが、`at` で絶対時刻を渡す点が違う。
- 初回は TTS アセット約 43MB。`TalkBox` を開いた瞬間に `prepareSpeech` を始め、
  進捗をサムネの上に出す（ゲームの「ボイス準備中」と同じ見た目）。
- 感情モデルは使う分だけ（各約 2MB）。`cues` から集めて `prepareSpeech({ emotions })` に渡す。

---

## 5. 投稿への紐づけ（MV と同じ形）

MV の実装を**そのまま複製**する。差分は名前だけ。

| 層 | MV | talk |
|---|---|---|
| テーブル | `mvs` | `talks`（`id, title, manifest_url, manifest_delete_id, manifest_delete_hash, bg_url, created_at, creator_user_id, plays`）。`preset` 列は持たない |
| 投稿側 FK | `threads.mv_id` / `res.mv_id` | `threads.talk_id` / `res.talk_id`（`ON DELETE SET NULL`、部分インデックス） |
| DataStore | `createMv/getMv/getMvsByIds/updateMv/recordMvPlay` | 同名の talk 版を `interface.ts` / `mock.ts` / `pg.ts` の 3 つに |
| 孤児 GC | `hasOtherPostRef("mv_id")` / `collectOrphanManifests` / `deletePost` の delete token | `talk_id` を追加 |
| API | `app/api/mvs/…` 3 ルート | `app/api/talks/…` 3 ルート（GET は `withEdgeCache`） |
| 種別の登録 | `UploadKind`、`isValidPayloadUrl`、`parseManifestRef`、`saveHistory` の type、`discardType` | それぞれに `"talk"` を追加 |
| クライアント保存 | `lib/game-mv-client.ts` | `createTalk/updateTalk/loadTalk` を同ファイルへ |
| ID | `encodeMv`、`encodePost` の id 変換 | `encodeTalk` を追加、`encodePost` に `talkId` |
| 投稿 | `mvDraft` / `onOpenMvMaker` / チップ / 送信 2 箇所 | `talkDraft` 一式 |
| フィード | `PostEmbeds` → `MvBox` → `MvPlayer` | `TalkBox` → `TalkPlayer`（`unj-game-box-open` の排他イベントも同じ） |
| `DbPost` | `hasMv/mvId/mvTitle/mvThumbnail/mvPlays` | `hasTalk/talkId/talkTitle/talkThumbnail/talkPlays` |

- manifest は **uploader-worker へ直接**上げる（サーバーを経由しない。[NEON_EGRESS.md](NEON_EGRESS.md)）。
- `bg_url` は背景画像かキャラ 1 人目の立ち絵を非正規化して持ち、一覧では manifest を読まない。
- スキーマは `docker/init.sql` に足し、`unj/wiki/init.sql` にも同じ変更を入れる（AGENTS.md）。

### 本番（Neon）への移行 SQL（手で当てる。`docker/init.sql` と同じ内容）

```sql
CREATE TABLE talks (
    id BIGINT PRIMARY KEY,
    title TEXT NOT NULL,
    manifest_url TEXT NOT NULL,
    manifest_delete_id TEXT,
    manifest_delete_hash TEXT,
    bg_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    creator_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    plays BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_talks_plays ON talks (plays DESC);
CREATE INDEX idx_talks_creator_user_id ON talks (creator_user_id);
ALTER TABLE threads ADD COLUMN talk_id BIGINT REFERENCES talks(id) ON DELETE SET NULL;
ALTER TABLE res ADD COLUMN talk_id BIGINT REFERENCES talks(id) ON DELETE SET NULL;
CREATE INDEX idx_res_talk_id ON res (talk_id) WHERE talk_id IS NOT NULL;
```

uploader-worker 側にも `talk` 種別（prefix `talk`、gzip JSON）を足してデプロイする
（`uploader/src/index.ts` の `TEXT_KINDS`）。デプロイ前は `uploadJson("talk", …)` が
`Unsupported 'kind'` で失敗するので、投稿はできない。


---

## 6. 編集UI（`components/TalkMaker.tsx`）

MvMaker（8.6k 行）は流用せず、小さく作る。画面は「見本」＋ 3 枚。

0. **見本**（`lib/talk-presets.ts` の `TALK_PRESETS`）: MV の見本と同じ入口。新規作成はこのタブから始まり、
   選ぶと台本タブへ移る（台本に中身があれば confirm）。見本はキャラ・台本込みの完成した manifest で、
   表情・行ごとの話し方・間の使い分けの手本を兼ねる（サイト紹介 / この機能の使い方 / ゲーム作成の紹介 /
   漫才のひな形 / まっさら）。立ち絵は絵文字なので何も選ばなくても動く。`createDefaultTalkManifest` もここにある。
1. **キャラ**: 2 枠。立ち絵（表情ごと）・目/口（psd レイヤー割り当て UI を流用）・音源・
   高さ・話し方。内蔵イラストを初期値に入れ、何も選ばなくても動くようにする。
2. **台本**: 1 行 = 話者トグル（左/右）＋本文＋表情＋話し方（空欄＝キャラの設定）。行の追加は Enter、並べ替えは上下ボタン
   （[[gamemaker-mobile-ui]] の規約）。各行に「試聴」。行の右に `measuredSec` を出す。
3. **見た目と書き出し**: 背景・字幕スタイル・BGM（MML）・タイトル・クレジット。mp4 書き出し（§7 (c)）。

プレビューは MvMaker と同じく**ヘッダーの下に出しっぱなし**（タブを切り替えても消えない）。
台本を編集すると `TalkPlayer` は計画済みの時間軸を捨てて idle に戻る（再生中・準備中なら、進行中の
開始処理を無効にして発話を止めてから捨てる。見本の切り替えで古い台本の声が鳴り続けないように）。

パネルの見た目は [[gamemaker-panel-design]] に従う（グレーセクション、青の参照ボタン、紫は使わない）。
自動保存は `lib/history.ts` に `"talk"` を足して使う。

### 6.1 台本のテキスト入出力（`lib/talk-script-text.ts`）

台本タブの「テキスト」ボタンで、台本（`cues`）をプレーンテキストに書き出し／取り込みできる。
LLM に書かせた台本を貼る、他所で書いた台本を持ち込む、既存の台本をまとめて手直しする用途。
キャラ・見た目はテキストに含めない（話者は**キャラの名前**で引く）。

```
# 先頭が # か // の行はコメント
ボケ「こんにちは」
ツッコミ(おこり, 間0.8)「なんでやねん」
ボケ「一行目
  閉じ括弧 」 が来るまで同じセリフの続き（複数行の本文）」
ボケ: コロン形でも書ける（行頭に空白を置くと直前のセリフの続き）
話者を書かない行は直前と別の話者になる（掛け合いなので交互）
ボケ「読み上げる本文 ｜ 字幕だけ差し替える文」
```

- 1 行 = 1 セリフ。書き出しは視認性の高い「話者「本文」」形。読みは「話者: 本文」「話者：本文」も受け付ける。
  括弧・コロンは全角半角どちらも可。「 を開いたまま行が終わったら、」 で終わる行まで本文が続く。
- 話者の後の括弧に属性を「,」「、」空白区切りで並べる: 表情（`ふつう/うれしい/かなしい/おこり/おどろき` か
  `neutral/happy/sad/angry/surprised`）、声（`声:うれしい` / `voice:happy`、省略時は表情から）、
  話し方（`話し方:いきいき` / `style:lively`、表示名は前方一致。省略時はキャラの既定）、
  間（`間0.5` / `0.5秒` / `0.5s`、0〜5）。読めない属性は警告に出して無視する。
- 登場人物に無い名前は**新しいキャラとして足す**（絵文字の既定顔・先頭キャラの声・左右は交互）。
  取り込み前に「新しいキャラ: X」と出すので、打ち間違いはそこで気付ける。
  知らない名前は 16 文字以下で空白を含まないときだけ話者扱い（「URLは https://…」を話者にしない）。
- 取り込み時、同じ話者・同じ本文の既存行があれば `id` と `measuredSec` を引き継ぐ（表情・声・話し方が同じとき）。
  未変更の行の計測値を捨てないため。
- 書き出しは既定値（表情 neutral・間 0.35）を省く。往復変換で cues が変わらないことを確認済み。
- モーダル内の「書式の解説・チャットAIに台本を書いてもらう」（弾幕スクリプトの「使い方を見る」と同じ構成）から、
  解説全文 `TALK_SCRIPT_HELP_TEXT` と、登場人物名・現在の台本・依頼欄を埋め込んだ AI 依頼プロンプト
  `buildTalkScriptAiPrompt(manifest)` をコピーできる。書式を変えたら解説文も同じファイルで直す。

---

## 7. 段階とライブラリ側の改修

### 段階

1. **型・時間軸・プレイヤー**（DB なし）: 固定 manifest を `TalkPlayer` で再生できる。
   計画→タイムライン→スケジュール→描画の一巡を確かめる。
2. **エディタ**: 台本を書いて試聴できる。`saveHistory` で下書き保持。
3. **投稿・DB・API・フィード**: §5 の複製。
4. **mp4 書き出し**と**計画由来の口パク**。
5. 余力: BGM、効果音行（`kind: "se"`）、キャラ 3 人目、字幕の縦書き。

### ライブラリ側（先に dtm/koe へ入れるもの）

(a) `singingVoices.planSpeech(model, text)` に `style` / `emotion` を受ける口を足し、
    `studio.planSpeech(text, { model, style, emotion })` として公開する。今は本文だけの
    長さしか引けない（感情で長さが変わる）。
(b) `SpeechHandle`（または `planSpeech` の戻り値）に **モーラ列**
    `{ startSec, endSec, alias }[]` を含める。口パクの母音を推定なしで引くため。
(c) mp4 書き出しは `MvPlayer.startExportMp4` の中身（`canvas.captureStream(30)` +
    `studio.getAudioStreamTrack()` + `MediaRecorder`）を `lib/mv-export.ts` へ切り出して
    両プレイヤーから呼ぶ。reze 内の改修で、ライブラリは触らない。

(a)(b) は dtm の publish を伴うので、段階 1 に入る前に済ませる。段階 1 は (a) が無くても
`studio.speak(..., { awaitRender: true })` の `durationSec` で代用して始められる。

---

## 8. 権利表記

- 音源ごとの利用規約（つくよみちゃん等）に従う。プレイヤーの下部に「声: <音源名>」を常時出し、
  `credit` に台本作者が追記できる。
- HTS 音声モデル tohoku-f01（東北大学 伊藤・能勢研究室、CC BY 4.0）の表記をプレイヤーの
  クレジット欄に固定で入れる。mp4 書き出しにも末尾 2 秒のクレジット画面として焼く。
- 投稿画像を立ち絵に使うときは MV と同じく `post:` 参照で元投稿へ辿れるようにする。

---

## 9. 転送量と CPU

- manifest はサーバーを通らない。一覧は `bg_url` と `title` だけ。
- TTS アセットは GitHub Pages から取り Cache API に残る。感情モデルは使う分だけ。
- 合成は dtm の voice worker で行われ、メインスレッドは計画（1 行数十 ms）だけ。
  合成は鳴る少し前に 1 行ずつ投げるので、長い台本（50 行超）でも合成の待ちは増えない。
  ただし初回の再生は、準備と全行の計画（行数に比例）で時間軸を作ってから始まる
  （最初の行の合成はその前に始めて重ねる。§2 の 1.）。時間軸があれば（2 回目以降・再開・シーク）
  待つのは始める行の最初のチャンクの合成だけ。
