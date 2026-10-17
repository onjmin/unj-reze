# セキュリティレビューの進め方（High / Medium を埋め込まないために）

機能を作る・直すたびに、この手順とチェックリストで確かめる。
AGENTS.md の「Security & Anti-Abuse」と [ANTI_ABUSE.md](ANTI_ABUSE.md) が仕組みの説明で、この文書は「新しいコードで穴を作らないための確認項目」。

## 前提（攻撃者ができること）

- ブラウザから届く値（本文・クエリ・パス・ヘッダー・セッション ID・作品 ID）はすべて偽造できる。
- `NEXT_PUBLIC_*` の値と、クライアントに入るコードはすべて読める。
- 投稿ゲームの manifest・MML・弾幕スクリプト・作品データは、他人が書いた値として他人のブラウザで動く。
- 1人が複数の IP（IPv6 なら /48 の中の /64 を自由に）・複数のセッションを使い捨てられる。
- Workers の CPU は 1 リクエスト 10ms、Neon の転送は月 5GB。重い処理を1回させるだけでも全員に効く。

## 手順

1. **設計するとき**：新しく生まれる「外から届く値」と「その値が届く先」（DB・HTML・URL・iframe・Audio・他人の画面・他人の作品・リアルタイムのチャンネル・共有の枠）を書き出す。
2. **実装するとき**：下のチェックリストに沿って書く。
3. **コミットする前**：`app/` `components/` `lib/` `services/` `middleware.ts` を変えたら、security-reviewer agent に差分を見てもらう（agent の定義は下の「agent の定義」）。
   - High / Medium が出たら、直してからコミットする。
   - 直せない・仕様として受け入れる場合は、所有者に確認する。
   - Low は報告するだけでよい。
4. **新しい種類の穴が見つかったら**：チェックリストに1行足す（過去の穴は、下の各項目の末尾に例として残す）。

## 深刻度の基準

- **High**：認証なしで、他人のなりすまし・他人のデータの改ざんや削除・秘密の漏洩・任意のスクリプト実行（他人のブラウザでの XSS を含む）・サービスの停止が、1人でできる。
- **Medium**：条件付きの XSS・HTML 差し込み、レート制限や Turnstile のすり抜け、少数の回線で共有の枠や Neon / Workers の予算を使い切れる、検査の回避、他人の非公開情報（DM・通知・セッション）が見える。
- **Low**：多重防御が足りない・理論上の問題・影響が小さい。

## チェックリスト

### 身元と権限
- 「誰として操作するか」は必ず `lib/auth/session-server.ts`（`resolveSessionUser` / `resolveOrCreateSessionUser` / `resolveViewerId`）で裏を取る。本文やクエリの `userId` / `viewerId` / `slug` をそのまま信じない。
- 他人のものを参照・添付・編集・削除する操作は、持ち主を確かめる（例：作品の添付は `workOwnershipError`）。ID が公開情報かどうかに関係なく確かめる。
  - 過去の例：他人の作品 ID を自分の投稿に付け、投稿を消すと作品ごと消せた（9906152e）。
- 個人宛のリアルタイムチャンネル（`chUser`）は、ハブが検証する署名トークンなしで購読できないようにする。
  - 過去の例：ハブのセッションが漏れていた（c83d0eb8）。
- 状態を変える API は POST などにし、同一オリジンの確認（`isSameOriginRequest`）を通す。

### 入力
- 文字列の長さ・配列の件数・数値の範囲を必ず決める（`app/api/_lib/post-input.ts` の上限を使う）。
- ID は `toUid()` / `decodeId` を通し、`NaN` や文字列を整数の列に渡さない。
- 外部に転送するパスは許可リストで絞る（例：rpgen プロキシ）。

### 表示とスクリプト（XSS）
- `dangerouslySetInnerHTML`・`innerHTML` に外から来た値を渡さない。
- 他人の値が `href` / `src` / `iframe.src` / `fetch` / `Audio` に入るときは、scheme を確かめる（`isSafeMediaUrl`。タブ・改行・制御文字を除いてから判定する）。
  - 過去の例：弾幕スクリプトと BGM の URL から XSS できた（ce810ab1）。
- 投稿ゲームのスクリプト（`MiniScriptVM` など）に、`eval` / `Function` / グローバルへの到達経路を作らない。ループ・再帰・配列の大きさに上限を付け、タブを固まらせない。
  - 過去の例：投稿ゲームでタブを壊せた（d571796d）。
- 新しい外部オリジンは `lib/security/csp.ts` に足す。ホスト全体ではなくパスまで固定する。

### 乱用・DoS・予算
- 書き込みは `guardNewPost()` を通す（Turnstile とスコア）。新しい投稿経路は `api.posts.create` などを使う。
- 新しい API には `checkTieredRateLimit` で IPv6 の /64 と /48 の両方の制限を付ける。IP は `getClientIp` → `rateLimitKeyFromIp` / `rateLimitKey48FromIp` を通し、生の文字列を比べない。
- 検索・一覧は全件走査にしない（インデックスに乗る形にし、件数に上限を付ける）。
  - 過去の例：検索が全件走査になっていた（d571796d）。
- 1 リクエストの CPU（10ms）と Neon の転送量を増やさない。詳しくは [NEON_EGRESS.md](NEON_EGRESS.md)。

### 秘密とヘッダー
- トークン・API キーは server-only にし、`NEXT_PUBLIC_*` にしない。
- `x-ja4-fingerprint` などの信頼ヘッダーは `middleware.ts` が上書き・削除したものだけを読む（`readTlsSignalsFromHeaders()`）。
- アップロードは uploader worker を通す。R2 に直接書かない。
- エラー応答に内部の情報を出さない（`errorResponse` / `exposedError` を使う）。

### DB
- SQL はプレースホルダで書く。`mock.ts` と `pg.ts` を両方直す。
- 他人の非公開データ（DM・通知・ブロック）を返すクエリは、必ず裏を取った viewer で絞る。

## agent の定義

`.claude/` は git の対象外なので、各自の手元で `.claude/agents/security-reviewer.md` を作る。中身は次のとおり（このファイルが正本。変えるときはここを直してから写す）。

```markdown
---
name: security-reviewer
description: unj-reze の変更差分を、セキュリティの観点で見直す。app/ components/ lib/ services/ middleware.ts を変えたあと、コミットする前に使う。
tools: Read, Grep, Glob, Bash
---

あなたは unj-reze（ログインなしの匿名 SNS。Next.js on Cloudflare Workers + Neon）のセキュリティ担当です。
ファイルは変更せず、読むだけで調べます。

- まず docs/SECURITY_REVIEW.md を読み、前提・深刻度の基準・チェックリストに従う。リストにない種類の穴も探す。
- 範囲の指定がなければ、`git diff HEAD` と、まだ git に追加されていないファイル（`git status --short`）を見る。
- 差分だけで判断しない。値がどこから来て（ブラウザ・他人の投稿や作品）どこへ届くか（DB・HTML・URL・他人の画面）を、呼び出し元・呼び出し先まで読んで追う。
- 実際のコードを読んで確かめたものだけを書く。推測で書かない。

報告は日本語で短く、各指摘を「深刻度 / ファイル:行 / 何が問題か / 攻撃の手順 / 直し方」の形で書く。
最後に「High: n件 / Medium: n件 / Low: n件」と、コミットしてよいか（High・Medium が 0 件か）を書く。
```
