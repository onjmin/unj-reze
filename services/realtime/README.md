# unj-reze リアルタイムハブ

Neon(Postgres)から「常時動き続ける処理」を剥がすための小さな WebSocket サービス。
Next.js アプリとは別にデプロイする（Koyeb 想定）。

このサービスが引き受けるもの:

| 以前 | 現在 |
|---|---|
| ゴーストプレイヤーの位置を2秒ごとに `game_players` へ upsert し、毎回 `DELETE ... WHERE updated_at < now()-15s` を撃つ | ハブのメモリ上だけ。**DB書き込みゼロ** |
| 新着投稿を確認するためのフィード再取得（15秒） | 投稿時に `post.created` を push |
| 実況コメント用の返信ポーリング（2〜3秒） | 返信時に `reply.created` を push |
| 通知一覧の定期再取得（20秒） | 通知発生時に本人へ `notify` を push（中身は取りに行く） |

**状態は一切永続化しない。** 再起動で消えて構わないデータだけを扱う。

---

## 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `PORT` | – | 待ち受けポート。既定 `8000` |
| `REALTIME_PUBLISH_SECRET` | ✅ | `/publish` の共有シークレット。`user:*` 購読トークンの HMAC 鍵も兼ねる。Next 側の同名変数と一致させる。未設定だと `/publish` も `user:*` 購読も全拒否 |
| `ALLOWED_ORIGINS` | – | WS接続を許可する Origin のカンマ区切り。空なら制限なし（ローカル用） |
| `REALTIME_ADMIN_SECRET` | – | `GET /healthz` に `X-Admin-Secret: <値>` を付けたときだけ内部統計を返す。未設定なら常に `{"ok":true}` だけ |
| `CLIENT_IP_SOURCE` | – | IP 単位の接続上限に使う IP の取り方。`xff`（既定: `X-Forwarded-For` を右から数える）/ `socket` |
| `TRUSTED_PROXY_HOPS` | – | `xff` のとき右から何番目を採るか。既定 `1`（最も手前のプロキシが付けた値） |
| `MAX_CONN_PER_IP` | – | 1IPあたりの同時接続上限。既定 `20`、`0` で無効 |
| `MAX_CONNECTIONS` | – | 全体の同時接続上限。既定 `5000` |
| `MAX_TOTAL_CHANNELS` | – | チャンネル表の総数上限。既定 `20000` |

Next.js アプリ側には次を設定する:

```
REALTIME_URL=https://<koyeb-app>.koyeb.app      # サーバー→ハブ (publish)
NEXT_PUBLIC_REALTIME_URL=wss://<koyeb-app>.koyeb.app/ws   # ブラウザ→ハブ (購読)
REALTIME_PUBLISH_SECRET=<同じ値>
```

**3つとも未設定なら push は丸ごと無効になり、クライアントは従来のポーリングにフォールバックする。**
他のバックエンド（DB / KV / ストレージ）と同じく「既定は外部サービス不要」を保っている。

---

## ローカルで動かす

Docker Compose:

```bash
docker compose -f services/realtime/docker-compose.yml up --build
```

Docker なしで直接:

```bash
cd services/realtime
npm install
REALTIME_PUBLISH_SECRET=dev-secret node server.mjs
```

動作確認:

```bash
curl http://localhost:8000/healthz
```

---

## Koyeb へのデプロイ

Koyeb はコンテナでデプロイするので、`services/realtime/Dockerfile` をそのまま使う。
**ビルドコンテキストはリポジトリルートではなく `services/realtime`** にすること。

Web UI から:

1. Create Service → GitHub → このリポジトリを選択
2. Builder: **Dockerfile**
3. Work directory: `services/realtime`
4. Dockerfile location: `Dockerfile`
5. Ports: `8000` / protocol `HTTP`（Koyeb の HTTP プロキシは WebSocket のアップグレードをそのまま通す）
6. Health check: HTTP `GET /healthz`
7. Environment variables: `REALTIME_PUBLISH_SECRET`, `ALLOWED_ORIGINS`

CLI から:

```bash
koyeb app init unj-reze-realtime \
  --git github.com/<owner>/unj-reze \
  --git-branch main \
  --git-builder docker \
  --git-docker-dockerfile services/realtime/Dockerfile \
  --git-workdir services/realtime \
  --ports 8000:http \
  --routes /:8000 \
  --health-checks 8000:http:/healthz \
  --env REALTIME_PUBLISH_SECRET=@realtime-secret \
  --env ALLOWED_ORIGINS=https://unj-reze.onjmin.workers.dev
```

**IP の取り方の確認（デプロイ直後に1回）:** Koyeb のプロキシが `X-Forwarded-For` をどう積むかは
このリポジトリでは確かめていない。`curl -H "X-Admin-Secret: …" https://<hub>/healthz` で
`ips`（接続元IPの種類数）と `maxConnPerIp` を見て、複数人が繋いでいるのに `ips` が 1 なら
プロキシのIPを拾っている（`TRUSTED_PROXY_HOPS` を増やすか `MAX_CONN_PER_IP=0`）。プライベート
アドレスしか取れなかった接続は「不明」として IP 上限を掛けない（全員が1IPに見えて全停止するのを
避ける fail-open）。上限で切ったときは1分に1回 `reject connection (per-ip cap) ip=… xff=…` を
ログに出すので、それでも確かめられる。

デプロイ後、Next 側（Cloudflare Workers）に `REALTIME_URL` / `NEXT_PUBLIC_REALTIME_URL` /
`REALTIME_PUBLISH_SECRET` を設定して再デプロイする。
`NEXT_PUBLIC_` 付きはビルド時にバンドルへ焼き込まれるので、**設定してからビルドし直すこと**。

### ⚠️ 単一インスタンス前提

presence と購読者リストはプロセス内メモリにある。**インスタンスを2つ以上に増やすと、
別インスタンスに繋がった利用者どうしでゴーストが見えず、push も片方にしか届かない。**
スケールさせるときは Redis Pub/Sub 等の共有バスを挟む必要がある
（`broadcast()` と `presence` の2箇所を差し替える）。

Koyeb の無料枠は1インスタンスなので、当面はこの前提で足りる。

---

## プロトコル

### 本人性（重要）

このアプリにはログインが無く、**セッションID（Cookie `unj_reze_session`）が唯一の秘密情報**。
以前はクライアントがセッションIDを `sessionId` として送り、ハブが presence・チャット・パーティーで
ルームの購読者全員へ配っていた＝ `game:<id>` を購読するだけで他人のセッションを集めて
アカウントを乗っ取れた。今は次の形になっている。

- **ハブは接続ごとに乱数の公開ID `playerId` を振り、`welcome` で本人にだけ知らせる。**
  presence / chat / partyInvite / partyUpdate に出るのはこの `playerId` だけ。
- クライアントが送ってくる `sessionId` / `playerId` は**一切読まない**。誰として振る舞うかは
  WebSocket 接続で決まるので、他人の位置・チャット・パーティー操作を偽装できない。
  （新クライアントは旧ハブ互換のため `sessionId` にページごとの乱数を入れて送る。セッションIDではない。）
- `partyAccept` は、相手から実際に `partyInvite` が届いている（60秒以内・1回限り）ときだけ通る。
- `chat` は、そのルームの presence に載っている接続だけが書ける。
- **`user:<id>`（DM本文・通知）は署名トークンが無いと購読できない。** Next 側
  `POST /api/realtime/token` が Cookie のセッションから本人を引き、
  `<userId>.<expiryUnixSec>.<base64url(HMAC-SHA256(REALTIME_PUBLISH_SECRET, "user:"+userId+"."+expiry))>`
  （有効1時間）を返す。ハブは `sub` の `token` を検証し、合わないチャンネルは黙って捨てる。
  トークンは購読の瞬間にだけ見るので、張った購読は接続が続く限り生きる。再接続時はクライアントが
  期限の近いトークンを取り直す（`lib/realtime/client.ts`）。ハブ未設定ならトークンAPIは 204 を返し、
  クライアントは従来のポーリングで動く。
- `feed` / `thread:<id>` / `game:<id>` は公開情報（投稿・返信の公開JSON、ゴーストの位置、
  ルーム内チャット）だけなので購読に認証は無い。ここへ非公開のデータを流さないこと。

### WebSocket `/ws`

クライアント → サーバー:

```jsonc
{"t":"sub","channels":["feed","thread:AbC"]}            // 購読
{"t":"sub","channels":["user:3918"],"token":"3918.1790000000.xxxx"}  // 個人宛はトークン必須
{"t":"unsub","channels":["feed"]}                       // 解除
{"t":"pos","game":"XyZ","x":10,"y":20,"emoji":"🎮"}      // 位置（誰の位置かは接続で決まる）
{"t":"leave","game":"XyZ"}                              // 退出
{"t":"chat","game":"XyZ","name":"名無し","text":"..."}
{"t":"partyInvite","game":"XyZ","targetPlayerId":"<相手のplayerId>"}
{"t":"partyAccept","game":"XyZ","targetPlayerId":"<招待してきた人のplayerId>"}
{"t":"partyLeave","game":"XyZ"}
{"t":"ping"}
```

サーバー → クライアント:

```jsonc
{"t":"welcome","presenceTtlMs":10000,"playerId":"<この接続の公開ID>"}
{"t":"event","channel":"feed","event":"post.created","data":{...}}
{"t":"presence","game":"XyZ","players":[{"playerId":"...","x":10,"y":20,"emoji":"🎮"}]}
{"t":"chat","game":"XyZ","playerId":"...","name":"名無し","text":"...","ts":0}
{"t":"partyInvite","game":"XyZ","fromPlayerId":"...","fromName":"名無し"}
{"t":"partyUpdate","game":"XyZ","members":[{"playerId":"...","name":"名無し"}]}
{"t":"pong"}
```

`presence` は直列化を1回で済ませるため **自分を含む全員** を配る。除外はクライアント側で
`getRealtimeClient().getSelfId()`（＝ welcome の `playerId`）と比べて行う。`playerId` は再接続で変わる。

チャンネル名は `lib/realtime/channels.ts` の関数で組み立てること（手書きしない）。ハブは
`feed` / `thread:<id>` / `game:<id>` / `user:<id>`（id は英数字・`_-` で64文字以内）以外を購読させない。
新しい種類を足すときは `server.mjs` の `CHANNEL_RE` も直すこと。

### HTTP

- `GET /healthz` — 死活確認。`{"ok":true}` だけを返す。`X-Admin-Secret: <REALTIME_ADMIN_SECRET>` を
  付けたときだけ統計（接続数・IP 種類数・部屋数・配信数・拒否数）を返す
- `POST /publish` — `Authorization: Bearer <REALTIME_PUBLISH_SECRET>` 必須。
  ボディは `{channel, event, data}` か `{events:[...]}`（最大100件）

### 制限

1接続あたり: 購読32チャンネル / 10秒あたり120メッセージ / 1メッセージ16KB（超えると切断）/
未承諾の招待16件。1IPあたり同時接続20、全体5000、チャンネル表2万、ルーム2000。
1ルームあたり presence 200人。TTL 10秒で自動退出、30秒ごとに ping で死活監視。
