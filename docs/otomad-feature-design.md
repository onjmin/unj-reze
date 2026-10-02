# 音MAD（`otomad`）設計ドキュメント

素材の声を旋律に乗せ（音声合わせ）、素材の映像を音符ごとに切り替える（映像合わせ）
「音MAD」を作る機能。MV（[mv-feature-design.md](mv-feature-design.md)）・かけあい動画
（[talk-video-feature-design.md](talk-video-feature-design.md)）と並ぶ**別の投稿種別**で、
時間軸は MV と同じく `@onjmin/dtm` の MML から導く。

- 型定義: `lib/otomad/otomad-config.ts`
- 曲（MML→音符）: `lib/otomad/otomad-song.ts`（`lib/mv/mv-engine.ts` の `parseMvSong` を使う）
- 素材の実体（ローカルファイル・URL・デコード・コマ取り）: `lib/otomad/otomad-media.ts`
- 時間軸（音符→イベント）: `lib/otomad/otomad-timeline.ts`
- 音（AudioContext 直叩きのサンプラー＋原曲＋ガイド音）: `lib/otomad/otomad-audio.ts`
- 描画: `lib/otomad/otomad-engine.ts`
- 書き出し（mp4 / MIDI / exo）: `lib/otomad/otomad-export.ts` / `otomad-midi.ts` / `otomad-exo.ts`
- 見本: `lib/otomad/otomad-presets.ts`
- UI: `components/otomad/OtomadMaker.tsx` / `OtomadPlayer.tsx` / `OtomadBox.tsx`
- 開発用ページ: `/test/otomad`

---

## 0. 方針（決まっていること）

- **素材はサーバーに置かない。** mp4・wav・mp3 の素材はブラウザのローカル（IndexedDB）に
  置いたまま編集・再生・書き出しまで完結する。unj-reze の uploader は動画を受けないし、
  受けるつもりもない（転送量・権利の両面）。
- **投稿できるのは「素材が全部 http(s) URL で、manifest が十分小さい」ときだけ。**
  mp4 素材は Cloudinary 等の別ホスティングに置いて URL を貼る。ローカル素材が 1 つでも
  残っていれば「投稿に添付」は押せず、代わりに mp4 書き出しだけができる。
  manifest は素材の実体を含まないので、普通は数十 KB で収まる（uploader の `otomad` 種別は
  512 KB 上限）。
- **時間軸は MML。** 所有者の既存ワークフロー（dtm で打ち込み → MIDI → AviUtl）をそのまま
  ブラウザで閉じる。1 トラック（`@n`）= 1 つの素材の使い方。MML は dtm の DAW で書き、
  音MAD エディタは「どの素材をどう鳴らし、どう見せるか」だけを持つ。
- **音程合わせは再生速度方式が既定。** AudioBufferSourceNode の `playbackRate` で
  2^(半音/12) 倍。音MAD の「声が高くなると早口になる」質感はこれ。長さ保持（フォルマント
  保存）は持たない（ブラウザ単体の実装コストに対して音MAD 的な価値が薄い）。
- **原曲（off vocal）はローカル音声をそのまま重ねる。** MML のシンセ音は「ガイド音」で、
  既定でオフ・**書き出しには入れない**（dtm にオフライン描画 API が無く、実時間録音になるため）。
- **書き出しはオフライン描画。** 映像はコマ単位の同期が命なので、MV の MediaRecorder 実時間
  録画ではなく WebCodecs（`VideoEncoder` + `AudioEncoder` + `mp4-muxer`）で 1 コマずつ描く。
  音は `OfflineAudioContext` で同じスケジューラを走らせる。WebCodecs が無いブラウザでは
  MV と同じ実時間録画に落ちる。
- **AviUtl への橋渡しも持つ。** MIDI（dtm `exportMIDI`）と、拡張編集の `.exo`
  （Shift_JIS、`encoding-japanese`）を書き出せる。exo は「素材フォルダのパス」を入力して
  絶対パスに組み立てる（ブラウザはファイルの絶対パスを知らない）。
  所有者環境は AviUtl 1.10 + 音MAD五線譜（MIDI 読み）なので、MIDI だけでも仕事になる。
- **IP。** 見本に他者の映像・音声は同梱しない。見本の素材は `public/assets/otomad/` の自作
  （合成した短い声・ロゼ/ゆなぎの静止画）だけ。ユーザーが持ち込む素材の権利はユーザーの責任で、
  投稿時に `credit` 欄へ出典を書ける。

---

## 1. データモデル（`lib/otomad/otomad-config.ts`）

```ts
export interface OtomadManifest {
  version: 1;
  title: string;
  credit?: string;                 // 素材の出典・原曲（投稿に出す）
  mml: string;                     // 時間軸。dtm MML（#tempo はここから）
  stage: OtomadStage;
  sources: OtomadSource[];         // 素材。id で track から参照
  tracks: OtomadTrack[];           // MML トラック → 鳴らし方・見せ方
  backing?: OtomadBacking;         // 原曲（off vocal）。無くても動く
  guide: { enabled: boolean; volume: number };  // MML シンセのガイド音（書き出しに入れない）
  leadInSec: number;               // 曲頭の余白（0〜2）。原曲の頭出しに使う
}

export interface OtomadStage {
  bgColor: string;
  bg?: MvAssetRef;                 // 背景画像（MV と同じ参照形式）
  bgDim: number;                   // 0〜1。背景を暗くする
}

export type OtomadSourceKind = "video" | "audio" | "image";

export interface OtomadSource {
  id: string;
  name: string;                    // 表示名（ファイル名）
  kind: OtomadSourceKind;
  /** http(s)。投稿にはこれが必須。Cloudinary 等 */
  url?: string;
  /** ローカルファイル。実体は IndexedDB（otomad-media.ts）。hash で引く */
  local?: { name: string; size: number; type: string; hash: string };
  durationSec?: number;            // 読み込んで分かった長さ（キャッシュ）
  /** 既定の切り出し。track 側の keymap で上書きできる */
  inSec: number;                   // 使い始め
  outSec?: number;                 // 使い終わり（省略＝末尾まで。音は音符の長さで切られる）
  /** 素材の音高（MIDI ノート番号、小数可）。音程合わせの基準。未設定なら音程を変えない */
  baseNote?: number;
  gainDb: number;                  // 素材ごとの音量補正
  /** 映像の既定の切り出し矩形（素材画素）。省略＝全体 */
  crop?: [number, number, number, number];
  /** クロマキー（コマ取り時に色を透明にする）。実写は抜けないので窓が四角になるが、抜ける素材は切り抜きの形で出せる */
  chromaKey?: { color: string; tolerance: number };
}

export interface OtomadBacking {
  sourceId: string;                // kind: audio か video（音だけ使う）
  /** 曲の 0 秒時点で原曲が何秒にいるか。負なら |offset| 秒後に原曲が鳴り出す */
  offsetSec: number;
  volume: number;                  // 0〜100
}

export interface OtomadTrack {
  track: number;                   // MML の @n
  label?: string;
  muted?: boolean;
  audio: OtomadTrackAudio;
  visual: OtomadTrackVisual;
}

export interface OtomadTrackAudio {
  /** 単一素材。keymap があればそちらが優先 */
  sourceId?: string;
  /** 音高の範囲ごとに素材を分ける（ドラム素材用。例: c→キック、d→スネア） */
  keymap?: { fromNote: number; toNote: number; sourceId: string; inSec?: number; outSec?: number }[];
  pitch: "follow" | "fixed";       // 音程合わせする / 素材そのまま
  length: "note" | "sample";       // 音符の長さで切る / 素材の区間ぶん鳴らす
  attackMs: number;                // 既定 2
  releaseMs: number;               // 既定 15
  nudgeMs: number;                 // 子音の頭合わせ。負で早出し。既定 0
  gainDb: number;
  pan: number;                     // -1〜1
  velocityToGain: boolean;         // MML の v を音量に反映
}

export interface OtomadTrackVisual {
  kind: "window" | "none";
  slots: OtomadSlot[];             // 窓の位置。複数なら pick で選ぶ
  pick: "cycle" | "pitch" | "random" | "velocity" | "voice";  // voice＝和音を低い順の声部として同じ窓に固定
  show: "note" | "untilNext" | "hold";  // 鳴っている間 / 次の音まで / 出しっぱなし
  flipAlternate: boolean;          // 偶数番目の音で左右反転（定番。flipMode が無い古いデータ用）
  flipMode?: "alternate" | "changed" | "none";  // changed＝その窓の音が前と変わったとき反転を切り替える
  hitStyle?: "zoom" | "bounce" | "shake" | "flash" | "spin" | "slide";  // 音の頭の演出（1 拍で戻る）
  velocityToOpacity?: boolean;     // v → 不透明度
  frame?: { color: string; width: number };  // 窓の縁取り
  orbitDegPerBeat?: number;        // 全窓を重心のまわりに回す（円形配置のアルペジオ）
  hitOnlyChanged?: boolean;        // 音の頭の拡大を「変わった窓」だけに掛ける
  fit?: "cover" | "contain";       // 窓への収め方（透過のドット絵は contain）
  hitZoom: number;                 // 音の頭で拡大（1.0〜1.5）。1 拍で戻す
  pitchY: number;                  // 音程で縦位置を変える（半音あたり px、0 で無効）
  stretch: boolean;                // 音符の長さに合わせて映像の再生速度を変える
  z: number;
  opacity: number;
}

export interface OtomadSlot {
  x: number; y: number;            // 中心（640×360 の論理座標）
  w: number; h: number;
  rotate?: number;                 // 度
}
```

- `MvAssetRef` は MV のものをそのまま使う（背景だけ）。素材は `OtomadSource` で持ち、MV の
  `image` レイヤーとは混ぜない（動画と音の実体を伴うため）。
- `local.hash` は内容の SHA-256（先頭 1MB・末尾 1MB・サイズから。大きい mp4 を全量ハッシュ
  しないため）。同じファイルを選び直せば同じ hash になり、下書きから復元できる。
- manifest に dataURL は入れない。画像素材も投稿時は http URL が要る（MV の `url:` 参照と同じ）。
- **投稿可否**は `otomadPostability(manifest)` が決める: ローカル素材の有無、manifest の
  JSON サイズ（gzip 前 512 KB 以下の目安として 400 KB で警告）。

---

## 2. 曲と時間軸（`otomad-song.ts` / `otomad-timeline.ts`）

MML → `parseMvSong`（MV と共有。dtm `parseMML` のステップ列、1 小節 192 ステップ、BPM は
MML の `t`）→ `MvSong.notes`。音MAD はこれを**秒**に落として使う:

```
secPerStep = 60 / bpm / 48
event = {
  trackIdx, noteIdx(そのトラックで何番目か), startSec = leadInSec + startStep*secPerStep,
  endSec, pitch(MIDI), velocity,
  sourceId, inSec, outSec,          // keymap / source の既定から解決
  rate = 2^((pitch - baseNote)/12)  // pitch: "fixed" か baseNote 未設定なら 1
  slot, flip, …                     // visual の pick / flipAlternate から
}
```

- テンポ変更は dtm が 1 曲 1 BPM なので持たない（MV と同じ制約）。
- 同時発音（和音）は全部鳴らす。映像の窓は同時に出るぶんだけ別の slot を使う（`pick: "cycle"`
  は同時発音を順に別 slot へ）。
- `show: "untilNext"` は同じトラックの次の音の頭まで表示（音MAD五線譜の「表示数 1」相当）。
- **コードの構成音を並べる**: `pick: "voice"` で同時に鳴る音を低い順に声部とみなし、声部 i を slot i に
  固定する。エディタの「窓を並べる」（横一列・縦一列・正方形・円、数は同時発音数から取れる）で slot を
  生成する。各イベントは `changed`（その窓の音高か素材が前と違う）を持ち、`flipMode: "changed"` なら
  変わった声部だけ反転が切り替わり、`hitOnlyChanged` なら拡大も変わった声部だけ。低音・コードも
  ふつうに窓を持てる（低音は 1 窓、コードは声部ぶんの窓、というのが典型）。

---

## 3. 素材の実体（`otomad-media.ts`）

ブラウザ側だけのモジュール（`typeof window` ガード、`useEffect` から呼ぶ）。

### ローカルファイル

- `putLocalFile(file) → OtomadSource.local` … hash を計算して IndexedDB（localforage、
  store `unj-otomad-files`）に Blob を入れる。下書き（manifest）は `lib/ui/history.ts` の
  `"otomad"` 種別で別に保存し、Blob はこちらにだけ残す。
- `getLocalBlob(hash) → Blob | null` … 無ければ UI が「ファイルを選び直してください」を出す
  （ブラウザのストレージ削除・別端末）。
- 容量は IndexedDB 任せ。古い hash の掃除は「manifest から参照されていない Blob」を
  エディタを開いたときに消す（下書き履歴 30 件が参照している hash は残す）。

### デコードとコマ取り（`OtomadMediaCache`）

- 音: `AudioContext.decodeAudioData` → `AudioBuffer`（素材 1 つにつき 1 回）。
  URL 素材は `fetch`（CORS 必須。Cloudinary は `Access-Control-Allow-Origin: *` を返す）。
- 映像: **使う区間だけ**コマを取る。時間軸の全イベントから素材ごとに
  `[inSec, inSec + 使う長さ]` の和集合を作り、`OTOMAD_FRAME_FPS = 30` で
  非表示の `<video>`（`crossOrigin="anonymous"`、ローカルは `URL.createObjectURL`）を
  `currentTime` で送って `createImageBitmap` する。1 コマは長辺 `OTOMAD_FRAME_MAX = 640` に縮小。
  `<video>` の seek は 50〜200 ms かかるので、**再生中に seek はしない**。全部先に取る。
  総コマ数が `OTOMAD_FRAME_BUDGET = 1800`（約 60 秒ぶん）を超えたら警告して fps を半分にする。
- `stretch: true` の窓は、音符の長さ × 再生速度ぶん先まで必要なので、区間をその分広げる。
- 進捗は `onProgress({ done, total, label })` でプレイヤーに出す（「素材を読み込み中 12/40」）。
- canvas が汚染（CORS 無し URL）されると書き出しが失敗するので、取れたコマは
  `ctx.getImageData(0,0,1,1)` を 1 回試して汚染を検知し、警告にする。

---

## 4. 音（`otomad-audio.ts`）

- 共有 studio（`lib/mml/dtm.ts` の `getStudio()`）の `audioContext` と `masterGain` を使う。
  **2 つ目の AudioContext は作らない**（サイト共通の音量・`getAudioStreamTrack` に乗せるため）。
- 時計は `ctx.currentTime`。`t0 = ctx.currentTime + 0.15` を基準に `now = ctx.currentTime - t0`。
  dtm の `onTick` は使わない（サンプラーは自前で予約するので、同じ時計で揃うほうが正確）。
- **スケジューラ**: 50 ms ごとに `now + 0.25` 秒先までのイベントを `AudioBufferSourceNode`
  で予約（`start(t0 + startSec + nudge, inSec, len)`、`playbackRate.value = rate`、
  `GainNode` で attack/release のエンベロープ、`StereoPannerNode`）。鳴り終わった node は捨てる。
  `scheduleEvents(ctx, destination, events, fromSec, toSec, t0)` は**純粋**にしてあり、
  実時間（AudioContext）とオフライン（OfflineAudioContext）で同じ関数を使う。
- **原曲**: `AudioBuffer` を `start(t0 + max(0, -offset), max(0, offset) + seekSec)` で置く。
  dtm の `createBackingAudio` は使わない（YouTube 対応や `<audio>` フォールバックが要らず、
  オフライン描画でも同じコードを通したい）。
- **原曲を MML から作る**（曲タブ）。声に差し替えるトラックを抜いた off vocal を 2 通りで作れる:
  (a) `recordMmlBacking`（`otomad-audio.ts`）= dtm の SoundFont で実時間再生しながら
  `studio.startWavRecording` で録る。音質は良いが曲の長さぶん掛かり、音が出る。
  `pauseWhenHidden: false` で裏タブでも止めない。dtm は `play()` から `SEQUENCER_START_DELAY` 後に
  曲の 0 秒を置くので、録音開始との差を `backing.offsetSec` に入れる。
  (b) `renderSynthBacking`（`otomad-synth.ts`）= OfflineAudioContext に発振器＋エンベロープを置く
  簡易シンセ。即時・無音で、音は chiptune 寄り。rAF の止まる環境（検証用ブラウザ）でも動く。
  どちらも結果の WAV はローカル素材として IndexedDB に入り、`backing` に登録される（投稿には使えない）。
- 原曲の WAV は `document.hidden` な環境では (a) が無音になる（dtm の再生ループが rAF 駆動）。
  検証用ブラウザで原曲が要るときは (b) を使うこと。
- **ガイド音**: `enabled` のときだけ `studio.playNoteEvent({ when: 相対秒, pitchUnits, duration, … })`
  を同じスケジューラから投げる。書き出しには入れない。
- **一時停止**: 予約済み node を全部 `stop()`、位置を覚える。**再開・シーク**は任意の秒から。
  途中の音符は `offset` を進めて頭から鳴らさずに続きから鳴らせる（TTS と違いサンプルなので
  正確にできる）。
- 音量: `masterGain` の下に `otomadGain`（原曲・素材・ガイドをまとめる）。

---

## 5. 描画（`otomad-engine.ts`）

キャンバスは MV と同じ 640×360 の論理座標＋ `transform: scale`。1 フレーム =
`drawOtomadFrame(ctx, manifest, timeline, media, timeSec)`:

1. 背景（`stage.bg` か `bgColor`、`bgDim`）。
2. 各トラックの窓を `z` 順に。表示中のイベント（`show` に従う）ごとに:
   - コマ = `media.frameAt(sourceId, inSec + (timeSec - startSec) * (stretch ? rate : 1))`。
     `image` 素材はその画像、`audio` 素材は窓を出さない。
   - `flip` なら `scale(-1, 1)`。`hitZoom` は `1 + (hitZoom-1) * max(0, 1 - 経過拍)`。
   - `pitchY` は `(pitch - トラックの中央音) * pitchY` だけ縦にずらす（五線譜っぽく）。
   - 窓は `crop` → slot の矩形へ `cover` で描く。
3. 曲頭・曲尾のフェード（MV と同じ 0.3 秒）。

MV のエフェクト/ビジュアライザは借りない。音MAD の画は「素材の窓」が主役で、演出は
`flipAlternate` / `hitZoom` / `pitchY` の 3 つで参考動画の 8 割が再現できる（§10）。

---

## 6. 書き出し（`otomad-export.ts` / `otomad-midi.ts` / `otomad-exo.ts`）

### mp4（オフライン）

1. 音: `OfflineAudioContext(2, 48000 * 長さ)` に §4 の `scheduleEvents` と原曲を置いて
   `startRendering()`。ガイド音は入れない。
2. 映像: `VideoEncoder`（`avc1.42001f`、1280×720 または 640×360 を選択、30 fps、
   `bitrate` 6 Mbps）に、§5 の描画を 1/30 秒刻みで `VideoFrame` にして投入。
   音は `AudioEncoder`（`mp4a.40.2`）へ `AudioData` を 1024 サンプルずつ。
3. `mp4-muxer`（`ArrayBufferTarget`）で多重化 → Blob → ダウンロード。
4. `VideoEncoder` が無い（Firefox/Safari の古い版）ときは MV の `startExportMp4` と同じ
   `canvas.captureStream + studio.getAudioStreamTrack() + MediaRecorder` に落ちる（実時間）。

### MIDI

`parseMvSong` の音符を dtm の `Note`（`pitchUnits`）に戻して `exportMIDI({ tracks, bpm, stepsPerBar: 192 })`。
各 MML トラック = MIDI トラック。音MAD五線譜・RPPtoEXO にそのまま読ませる。

### exo（AviUtl 1.x 拡張編集）

`[exedit]` ヘッダ（width/height/rate/scale/length/audio_rate/audio_ch）＋ 音符ごとに
`[n]`（start/end/layer/overlay/camera）→ `[n.0]` 動画ファイル（`再生位置`=inSec のフレーム、
`再生速度`=stretch なら rate×100、`file`=素材フォルダ＋ファイル名）→ `[n.1]` 標準描画
（X/Y/拡大率/反転）。音声は `[n.0]` 音声ファイル（`再生位置`、`再生速度`＝rate×100 で
音程合わせ）を別レイヤーに。Shift_JIS、CRLF。レイヤーは track ごとに 2 本（映像・音声）。
素材のパスは UI の「素材フォルダ」欄（例 `C:\Users\...\素材\`）＋ `source.name`。

---

## 7. 投稿への紐づけ（talk と同じ形）

talk の実装を**そのまま複製**する。差分は名前だけ。

| 層 | talk | otomad |
|---|---|---|
| テーブル | `talks` | `otomads`（同じ列。`preset` 列は持たない） |
| 投稿側 FK | `threads.talk_id` / `res.talk_id` | `threads.otomad_id` / `res.otomad_id`（`ON DELETE SET NULL`、部分インデックス） |
| DataStore | `createTalk/getTalk/getTalksByIds/updateTalk/recordTalkPlay` | 同名の otomad 版を `interface.ts` / `mock.ts` / `mock-db.ts` / `pg.ts` に |
| 孤児 GC | `hasOtherPostRef("talk_id")` / `orphanedManifestRefsOf` | `otomad_id` を追加 |
| API | `app/api/talks/…` 3 ルート | `app/api/otomads/…` 3 ルート（GET は `withEdgeCache`） |
| 種別の登録 | `UploadKind`、`isValidPayloadUrl`、`parseManifestRef`、`saveHistory` の type、`discardType` | それぞれに `"otomad"` を追加 |
| クライアント保存 | `lib/post/game-mv-client.ts` の talk 3 関数 | `createOtomad/updateOtomad/loadOtomad` |
| ID | `encodeTalk`、`encodePost` の `talkId` | `encodeOtomad`、`otomadId` |
| 投稿 | `talkDraft` / `onOpenTalkMaker` / チップ / 送信 2 箇所 | `otomadDraft` 一式（page.tsx / PostDetail / BbsThreadView） |
| フィード | `PostEmbeds` → `TalkBox` → `TalkPlayer` | `OtomadBox` → `OtomadPlayer` |
| `DbPost` | `hasTalk/talkId/talkTitle/talkThumbnail/talkPlays` | `hasOtomad/otomadId/otomadTitle/otomadThumbnail/otomadPlays` |
| 失敗時退避 | `unj_failed_post_draft` の talk | otomad も同じ形で `savedId` 付き |

- `bg_url` は背景画像か最初の `image` 素材の URL。動画素材はサムネに使えない（R2 外の URL を
  `<img>` で出せないため）ので、無ければ既定のサムネ（音MAD アイコン）。
- 投稿前チェック（§1 の `otomadPostability`）に通らない manifest は `createOtomad` が投げる。
- talk で見つかった取りこぼし（DELETE が `previousTalkManifest` を返さない、`BbsBoardView` の
  アイコン、`talkClassName` を渡していない呼び出し）は otomad では最初から埋める。

### 本番（Neon）への移行 SQL（手で当てる。`docker/init.sql` と同じ内容）

```sql
CREATE TABLE otomads (
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
CREATE INDEX idx_otomads_plays ON otomads (plays DESC);
CREATE INDEX idx_otomads_creator_user_id ON otomads (creator_user_id);
ALTER TABLE threads ADD COLUMN otomad_id BIGINT REFERENCES otomads(id) ON DELETE SET NULL;
ALTER TABLE res ADD COLUMN otomad_id BIGINT REFERENCES otomads(id) ON DELETE SET NULL;
CREATE INDEX idx_res_otomad_id ON res (otomad_id) WHERE otomad_id IS NOT NULL;
```

uploader-worker 側にも `otomad` 種別（prefix `otomad`、gzip JSON、512 KB）を足してデプロイする
（`uploader/src/index.ts` の `TEXT_KINDS`）。デプロイ前は `uploadJson("otomad", …)` が
`Unsupported 'kind'` で失敗するので投稿はできない。`unj/wiki/init.sql` も同期する。

---

## 8. 編集UI（`components/otomad/OtomadMaker.tsx`）

TalkMaker と同じ構成（ヘッダー＋常時表示のプレビュー＋タブ）。タブは 4 枚。

0. **見本**（`otomad-presets.ts`）: まっさら / 内蔵素材のデモ（自作の短い声＋静止画で
   「音程合わせ・反転・拡大」が全部入った 8 小節）。新規作成はここから。
1. **曲**: MML（`ContentPicker mode="bgm"` で投稿曲から選ぶ、または MmlEditor で書く）。
   BPM・小節数・トラック一覧（音符数つき）を表示。MIDI 書き出しボタンもここ。
2. **素材**: ファイル追加（`<input type=file multiple accept="video/*,audio/*,image/*">`）・
   URL 追加・一覧。各素材: 名前、長さ、`inSec/outSec` の区間（波形の簡易表示＋試聴）、
   `baseNote`（「音程を測る」ボタン＝区間の自己相関で基本周波数を推定して埋める）、音量、
   映像のクロップ。ローカル素材には「投稿不可（ローカル）」のバッジ。
3. **トラック**: MML トラックごとのカード。素材の割り当て（単一 / keymap）、音の設定、
   窓の設定（slot をプレビュー上でドラッグ、追加/削除、`pick`、`show`、`flipAlternate`、
   `hitZoom`、`pitchY`、`stretch`）。「このトラックだけ試聴」。
4. **仕上げ**: 原曲（素材から選ぶ、offset はスライダーと「頭を合わせる」ボタン）、ガイド音、
   背景、タイトル、クレジット、**書き出し**（mp4 / MIDI / exo＋素材フォルダ欄）、
   投稿可否の表示（ローカル素材の一覧と「URL に差し替える」導線）。

- プレビューは `OtomadPlayer`。manifest の `mml`・`sources`・`tracks` が変わったら時間軸と
  コマキャッシュを捨てる（コマは素材と区間が同じなら再利用）。
- 自動保存は `lib/ui/history.ts` の `"otomad"`（manifest のみ）。Blob は §3。
- パネルの見た目は [[gamemaker-panel-design]]（グレーセクション・青の参照ボタン・紫は使わない）。

---

## 9. 段階

1. **型・曲・素材・時間軸・音・描画・プレイヤー**（DB なし）: `/test/otomad` で内蔵素材の見本を
   再生できる。ローカル mp4 を読み、音程合わせして窓が切り替わるところまで。
2. **エディタ**: 4 タブ。ローカル素材の追加・区間・baseNote 推定・トラック割り当て・slot ドラッグ。
3. **書き出し**: mp4（WebCodecs）・MIDI・exo。
4. **投稿・DB・API・フィード**: §7 の複製。
5. 余力: 長さ保持の音程合わせ（élastique 相当。グラニュラー SOLA をブラウザで、または dtm 側に
   WORLD）、五線譜流し（音MAD五線譜の見た目）、残像・点滅・小窓の縁、字幕（歌詞トラック `@@n` から）、
   トラックの小節範囲（場面ごとの配置替え）、素材のノイズゲート。

---

## 10. 準拠する作法（音MAD 制作講座から）

ヘーベルの人「音MAD制作講座」、ytpmv.info、Garech の RPPtoEXO 文書、捻挫・泥人形・ますとも各氏の
note など 30 本超の講座から拾った定石。**実装はこれを既定値にする**（出典は調査メモ、2026-10-02）。

### 音

- **音程合わせの原則**: 「ピッチが合っていない音MADは聞くに堪えない」。素材の音高は測ってから
  合わせる（人声は音階からずれているのでセント単位で測る）→ `baseNote` は小数で持ち、
  「音程を測る」で自己相関から推定する。
- **音域の広い旋律**（鉱石風respect の主旋律は 61〜94）は、keymap で 1 オクターブごとに別の素材
  （内蔵の「あ」は E4 / E5 / E6 の 3 つ）に振るか、`foldOctaves`（±6 半音に畳む）で 1 素材に収める。
- **ピッチの変え方は 2 系統**: 現在の REAPER 制作では élastique（長さを変えずにピッチだけ）が
  事実上の標準で、再生速度でピッチを変える方式（2 倍速＝1 オクターブ上）は AviUtl 単体・
  RPPtoEXO の系譜＝「昔ながらの音MAD」の音。本機能はまず**再生速度方式**（`playbackRate`）で
  始める（ブラウザ単体で確実、exo の `再生速度` にそのまま写る）。長さ保持は余力（§9）。
- **限界の目安**: 速度を変えないピッチ変更は ±8 半音を超えるとノイズ、原型を残すなら ±5。
  再生速度方式はもっと破綻が早い → エディタは `|pitch − baseNote| > 8` の音符があるトラックに
  警告を出し、オクターブ違いの素材（高い声・低い声）を keymap で分けることを促す。
- **頭の無音は必ず切る**（全体が遅れる最大の原因）→ 素材パネルに「無音を切る」（しきい値で
  `inSec` を進める）。**子音は削らない**（さ行・は行は子音が長い）→ 切り出しは母音の手前で止め、
  頭合わせは `nudgeMs`（負で早出し）で行う。
- **長さ合わせは伸ばすより削る＋短いフェードアウト**（「0.02 秒のフェードアウトで歯切れ」）
  → `releaseMs` の既定 20。`attackMs` 2。音符同士の隙間は空けない（`length: "note"` は次の
  音符の頭で切れる）。
- **音量**: 切り出し時にノーマライズ、メインは原曲より少し大きめ、ハモリは小、ベースは
  「意識すると聞こえる」程度。音圧を欲張らず「思い切って下げる」。マスターは 0 dB を超えない
  → バスの末尾に簡易リミッター（`DynamicsCompressorNode`、threshold −3 dB、ratio 20）。
  `velocityToGain` 既定オン（MML の v で強弱を付ける）。
- **ドラム素材**: キックは加工済みの低い音、スネアは打撃音、ハイハットは**サ行の摩擦音**
  （さ・す・せ・そ＝高め、し＝低め）。似た音を重ねない、16 分の裏で刻む → `keymap` で
  音高の範囲に素材を割り当てる（`pitch: "fixed"`、`length: "sample"`）。
- **パン**: メイン・ベースは中央、ハモリは左右 70%、刻みは 30〜60%、ドラムは 5〜10% ずらす。

### 映像

- **原則「音素材と同じ動画素材を 1 音符 1 オブジェクト」**（RPPtoEXO の出力そのもの）。
- **左右反転を奇数/偶数番目で交互**、**拡大率を縮小↔通常でイーズ**（音の頭で大きく、戻る）、
  X ±450 の左右配置、X/Y を −1 倍した四隅配置、小窓（クリッピング＋縁）、残像、点滅、
  グループ回転。→ `flipAlternate` / `hitZoom`（2 乗で戻す）/ 複数 `slots` の巡回が既定。
- **音程→高さ**は音MAD五線譜系（MIDI を読んで五線譜上に流す）の表現 → `pitchY`。
- 字幕・口パク（RPPtoEXO-Lyric の「あいうえおん」口形）は余力。

### パートごとの定番（講座・作者ブログの調査、2026-10-02）

出典: ytpmv.info「How to Make YTPMV 6」、youcanjp84「視聴者が音を聴き取りやすくなる映像のコツ」、
とせ「ドラム素材動かし方研究」、アェテ・パムゴン・メモタルトの note、OtomadHelper v4 docs、RPPtoEXO。

| パート | 定番 | 本機能での設定 |
|---|---|---|
| 主旋律 | 最大サイズ・画面中央。「とにかく目立たせる」 | 中央 1 窓、`hitStyle: zoom`、`flipMode: alternate` |
| ハモリ | 同じ素材を 3 つ並べる（中央と ±450） | 3 窓 `pick: voice` か `cycle` |
| ベース | 画面下。横移動。オクターブは縦移動・反転で | 下に 1〜2 窓、`hitStyle: slide`、`pitchY` |
| キック | 拡大率で激しく | `hitStyle: zoom`、強さ大 |
| スネア | 減衰振動で「プルン」 | `hitStyle: bounce` |
| ハイハット | 横ブラー、最初だけ光る | `hitStyle: shake` か `flash` |
| シンバル | 最初だけ光らせて放射ブラー | `hitStyle: flash` |
| ドラム全体 | まとめて置き、線対称・点対称に整列。1 音色 1 窓 | keymap で音色ごとに `pick: pitch`、「窓を並べる」 |
| 和音 | 同じ素材が 3〜4 つ横並び。声部ごとに窓を分けるのは「タイミングがずれる時」 | `pick: voice`＋`flipMode: changed`＋`hitOnlyChanged` |
| アルペジオ | 円形配置を回転させる | `generateSlots("circle")`＋`orbitDegPerBeat` |
| 効果音 | 拡大と回転を 3 つ並べる | `hitStyle: spin` |
| 共通 | 強弱→動きの強弱・不透明度、常に少し動かす、窓に縁取りと影 | `velocityToOpacity`、`frame` |

### 参考動画の実測（2026-10-02、0.2 秒刻みのフレームで確認）

- **柴又**（Dot nigou）: 全面の背景（街の実写、ループ）の上に、**中央の大きな窓**（主旋律。音符ごとに
  左右反転し、看板の文字が鏡像になる）、**左右どちらかに現れる中くらいの窓**（別パート。音符ごとに
  左右の位置を交互に変える＝2 窓の巡回）、**四隅の小窓**（短く出て消える＝打楽器。`show: "note"`）。
  場面が変わると配置ごと変わる（150 秒付近は背景を差し替えて中央 1 窓だけ）。
- **andesite.mp4**（10／2号）: 暗い模様の背景、中央に主旋律の窓（音符ごとに表情違いの絵へ切り替え）、
  その左右に**鏡像のペア**で出る窓（和音系。鳴っている間だけ出る）、縁に写真の小窓（常駐・ループ）。
- 窓が**四角いのはクロマキーできない実写素材だから**（所有者の指摘）。透過 PNG やグリーンバックで
  抜ける素材なら、窓は矩形ではなく切り抜きの形で出す。→ 画像は α をそのまま描き、動画・画像の
  `chromaKey` でコマ取り時に抜く。
- 共通する文法: **背景 1 枚＋中央＝主役＋左右対称＝伴奏＋縁・隅＝打楽器**。左右は鏡像で揃える。
  パートごとに窓の大きさ・位置・出し方（鳴っている間だけ／次の音まで）を変えて役割を見せる。
- 実装への対応: 中央 1 窓＋反転＝`slots` 1 つ＋`flipMode: "alternate"`、左右交互＝`slots` 2 つ＋
  `pick: "cycle"`、四隅の打楽器＝`slots` 4 つ＋`pick: "pitch"`＋`show: "note"`、和音の鏡像ペア＝
  `pick: "voice"`＋対称配置（「左右対称」ボタン）＋`flipMode: "changed"`。

### 構成

- 曲→素材→「ここはセリフ合わせ、ここは音合わせ」の構成を先に決め、**サビから作る**。
  フィルイン（特にサビ前）・イントロ/アウトロ・リードの頭と尾を優先。
- ハモリは 5 半音下か 3 度上、線はあまり動かさない。ベースは「ん」「お」の低い音を使う。
- 「同じ景色を 2 回見せない」→ 場面ごとに slot 配置を変えるのはトラックを分けて `barRange` 相当で
  行う（余力。現状は 1 トラック 1 配置）。

---

## 11. 転送量と CPU

- manifest はサーバーを通らない。素材の実体は**一切**サーバーに触れない。
- 一覧は `bg_url` と `title` だけ。URL 素材の再生はブラウザ→ホスティング直。
- 書き出しの重さはブラウザ内で完結（Workers の 10 ms CPU は無関係）。
- コマキャッシュは最大 1800 コマ × 640×360 × 4 B ≒ 1.6 GB になり得るので、`ImageBitmap`
  ではなく長辺 640 で `OffscreenCanvas` に描いた `ImageBitmap`（GPU 側）を使い、
  `OTOMAD_FRAME_BUDGET` 超過で fps を落とす（§3）。
