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
| `REALTIME_PUBLISH_SECRET` | ✅ | `/publish` の共有シークレット。Next 側の同名変数と一致させる。未設定だと `/publish` は全拒否 |
| `ALLOWED_ORIGINS` | – | WS接続を許可する Origin のカンマ区切り。空なら制限なし（ローカル用） |

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

### WebSocket `/ws`

クライアント → サーバー:

```jsonc
{"t":"sub","channels":["feed","thread:AbC"]}   // 購読
{"t":"unsub","channels":["feed"]}              // 解除
{"t":"pos","game":"XyZ","sessionId":"...","x":10,"y":20,"emoji":"🎮"}  // 位置
{"t":"leave","game":"XyZ"}                     // 退出
{"t":"ping"}
```

サーバー → クライアント:

```jsonc
{"t":"welcome","presenceTtlMs":10000}
{"t":"event","channel":"feed","event":"post.created","data":{...}}
{"t":"presence","game":"XyZ","players":[{"sessionId":"...","x":10,"y":20,"emoji":"🎮"}]}
{"t":"pong"}
```

`presence` は直列化を1回で済ませるため **自分を含む全員** を配る。除外はクライアント側で行う。

チャンネル名は `lib/realtime/channels.ts` の関数で組み立てること（手書きしない）。

### HTTP

- `GET /healthz` — 稼働確認と統計（接続数・部屋数・配信数）
- `POST /publish` — `Authorization: Bearer <REALTIME_PUBLISH_SECRET>` 必須。
  ボディは `{channel, event, data}` か `{events:[...]}`（最大100件）

### 制限

1接続あたり: 購読32チャンネル / 10秒あたり120メッセージ / 1メッセージ16KB。
1ルームあたり presence 200人。TTL 10秒で自動退出、30秒ごとに ping で死活監視。
