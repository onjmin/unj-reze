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
| `CLIENT_IP_SOURCE` | – | IP 単位の接続上限に使う IP の取り方。`xff`（既定: `X-Forwarded-For` を右から見る）/ `socket`。下の「クライアント IP の決め方」参照 |
| `TRUSTED_PROXY_HOPS` | – | `xff` のとき**右から何番目から見るか**（以前と同じ意味。内部アドレスも1つと数える）。既定 `1`（末尾）。そこから左へ内部アドレスだけ飛ばし、最初の公開アドレスを採る。数値でない値は `1` 扱い |
| `MAX_CONN_PER_IP` | – | 1IP あたりの同時接続上限（IPv4 はアドレス、IPv6 は /64 単位）。既定 `20`。**`0` で IP 単位の制限（接続数・/48・ルーム/チャンネル予算）を既定ではすべて止める**（個別に値を入れた env だけは効く） |
| `MAX_CONN_PER_IP48` | – | IPv6 の /48 あたりの同時接続上限（/64 を乗り換えられる回線向け。IPv4 には掛からない）。既定 `MAX_CONN_PER_IP` の4倍（`80`）、`0` で無効 |
| `MAX_CONNECTIONS` | – | 全体の同時接続上限。既定 `5000` |
| `MAX_TOTAL_CHANNELS` | – | チャンネル表の総数上限。既定 `20000` |
| `MAX_ROOMS` | – | ルーム（presence / パーティー）の総数上限。既定 `2000` |
| `MAX_GAMES_PER_CONN` | – | 1接続が presence に載れるゲーム数。既定 `4`（pos を送るのは LiveGameView / Mmo3dMaker だけで、同時に1ゲーム）。`MAX_CHANNELS_PER_CONN`（32）とは別 |
| `MAX_ROOMS_PER_IP` | – | IP キー（`MAX_CONN_PER_IP` と同じ単位）ごとの「作って、まだ残っているルーム」の数。既定 `16`（`MAX_CONN_PER_IP=0` なら `0`）、`0` で無効 |
| `MAX_CHANNELS_PER_IP` | – | IP キーごとの購読チャンネル数（その IP の全接続の合計）。既定 `128`（`MAX_CONN_PER_IP=0` なら `0`）、`0` で無効 |
| `MAX_ROOMS_PER_IP48` | – | IPv6 の /48 ごとのルーム数（/64 を乗り換えて予算を増やせないように。IPv4 には掛からない）。既定 `MAX_ROOMS_PER_IP` の4倍（`64`）、`0` で無効 |
| `MAX_CHANNELS_PER_IP48` | – | IPv6 の /48 ごとの購読チャンネル数。既定 `MAX_CHANNELS_PER_IP` の4倍（`512`）、`0` で無効 |
| `ENFORCE_USER_SUB_EXPIRY` | – | `1` のとき `user:*` 購読をトークンの期限で外し、`{"t":"resub"}` で取り直しを促す。既定は無効（今までどおり購読の瞬間にだけ検証）。**新しいクライアントが行き渡ってから** `1` にする（下の「本人性」参照） |

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

### クライアント IP の決め方

IP 単位の上限（接続数・ルーム/チャンネルの予算）に使う IP は次の順で決める（`server.mjs` の `clientIpOf`。
unj の `src/server/mylib/ip.ts` の `detectClientIp` と同じ考え方）。

1. `X-Forwarded-For` を**右から**見る。Koyeb は「Koyeb へ繋いできた IP」を末尾に足し、その後ろに
   内部ホップ（社内 LB などのプライベートアドレス）を足すことがある。左側はクライアントが自由に書ける。
2. 各要素は `net.isIP` で検証し、`::ffff:a.b.c.d`（IPv4 射影）は IPv4 に揃える。IP でない値に当たったら
   そこで止める（それより左＝偽装しうる側は見ない）。
3. 右から `TRUSTED_PROXY_HOPS` 番目（既定 1 = 末尾。内部アドレスも1つと数える、以前と同じ位置）から左へ、
   プライベート/内部アドレス（10/8・172.16/12・192.168/16・127/8・0/8・169.254/16・100.64/10・
   `::1`・`fc00::/7`・`fe80::/10`）だけを飛ばし、最初の公開アドレスを採る。開始位置より右（信頼するプロキシが
   足した分）は採らず、公開アドレスを飛ばして左（クライアントが書ける側）へ進むこともない。
   例: `<偽装>, <接続元>, 10.0.0.3` → 既定の `1` で `<接続元>`。Koyeb の前に公開 IP を持つプロキシ（CDN 等）が
   1段あり、さらに内部ホップも付くなら、末尾から `<CDN>`・`<内部>` を数えて `3`。
4. 要素が `TRUSTED_PROXY_HOPS` 個に足りないとき・ヘッダが無いときはソケットの接続元を使う
   （`CLIENT_IP_SOURCE=socket` なら常にソケット）。
5. 数える単位（IP キー）は IPv4 はアドレス、IPv6 は **/64**。IPv6 はさらに **/48** でも数える
   （`MAX_CONN_PER_IP48` / `MAX_ROOMS_PER_IP48` / `MAX_CHANNELS_PER_IP48`）。切断時にすべてのカウンタを戻す。

公開アドレスが取れなかった接続は「不明」として IP 単位の上限・予算を掛けない（プロキシ構成の読み違いで
全員が1IPに見えて全停止するのを避ける fail-open）。不明な接続が来たらプロセスごとに1回だけ
`client ip unknown; per-ip limits are not applied …` をログに出し、件数を統計の `unknownIpConnections` に出す。

**再デプロイの前に（今の版で）:** `curl -H "X-Admin-Secret: …" https://<hub>/healthz` で `connections` と
`ips` を控え、Koyeb の `MAX_CONN_PER_IP` / `TRUSTED_PROXY_HOPS` の今の値も見ておく。`connections` が 1 以上なのに
`ips` が 0 なら、今の版では末尾の内部ホップを拾って全接続が「不明」になり、IP 単位の上限は一度も効いていない。
その場合は今回の再デプロイで初めて「1IP 20接続・ルーム16・チャンネル128」が効き始める（同じ IP を共有する
携帯回線・学校・会社などに当たりうる）。

**IP の取り方の確認（デプロイ直後に1回）:** 同じ `/healthz` で `ips`（接続元 IP キーの種類数）・`maxConnPerIp`・
`unknownIpConnections`・`rejectedConnections` を見る。複数人が繋いでいるのに `ips` が 1 ならプロキシの IP を
拾っている（`TRUSTED_PROXY_HOPS` を見直す）。`unknownIpConnections` が接続のたびに増えるなら公開アドレスが
取れていない（上限が効いていない）。上限で切ったときは1分に1回 `reject connection (per-ip cap) ip=… xff=…`
（/48 なら `per-ip48 cap`）をログに出すので、それでも確かめられる。おかしければ **`MAX_CONN_PER_IP=0` で
IP 単位の制限（接続数・ルーム/チャンネル予算）をまとめて止められる**（個別の値を入れていない限り）。

> `TRUSTED_PROXY_HOPS` の意味（右から何番目から見るか。内部アドレスも数える）は以前と同じ。以前と違うのは、
> その位置が内部アドレスだったとき「不明」にせず、左へ内部アドレスを飛ばして公開アドレスを探すことだけ。
> 今の設定値はそのままでよい。

### 再デプロイ（オーナー作業）

ハブのコード・依存（`ws`）を変えたら Koyeb で再デプロイする（`git push` だけでは反映されない設定なら
Koyeb の画面から Redeploy）。2026-10 のセキュリティ修正（`GET ///` での落ち、ws 8.22.0、IPv6 /64・/48、
ルーム/チャンネル予算、チャットのバケット、`resub`）もハブの再デプロイで初めて効く。
`ENFORCE_USER_SUB_EXPIRY=1` は、`resub` を扱う新しいクライアント（Next 側）がデプロイされて行き渡ってから設定する。

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
  既定ではトークンを購読の瞬間にだけ見るので、張った購読は接続が続く限り生きる。再接続時はクライアントが
  期限の近いトークンを取り直す（`lib/realtime/client.ts`）。ハブ未設定ならトークンAPIは 204 を返し、
  クライアントは従来のポーリングで動く。
- ハブは購読ごとにトークンの期限を覚えている。`ENFORCE_USER_SUB_EXPIRY=1` のときは、期限の約1分前に
  `{"t":"resub","channel":"user:<id>"}` を送り、期限を過ぎたら購読を外してもう一度 `resub` を送る。
  クライアントはトークンを取り直して同じチャンネルを `sub` し直す（購読中なら期限が延びるだけ）。
  `resub` を知らない旧クライアントは期限で push が止まる（ポーリングには落ちる）ので、既定は無効。
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
{"t":"resub","channel":"user:3918"}   // ENFORCE_USER_SUB_EXPIRY=1 のときだけ。トークンを取り直して sub し直す
{"t":"pong"}
```

クライアントは知らない `t` を無視すること（新しい種類を足しても旧クライアントが壊れないように）。

`presence` は直列化を1回で済ませるため **自分を含む全員** を配る。除外はクライアント側で
`getRealtimeClient().getSelfId()`（＝ welcome の `playerId`）と比べて行う。`playerId` は再接続で変わる。

チャンネル名は `lib/realtime/channels.ts` の関数で組み立てること（手書きしない）。ハブは
`feed` / `thread:<id>` / `game:<id>` / `user:<id>`（id は英数字・`_-` で64文字以内）以外を購読させない。
新しい種類を足すときは `server.mjs` の `CHANNEL_RE` も直すこと。

### HTTP

- `GET /healthz` — 死活確認。`{"ok":true}` だけを返す。`X-Admin-Secret: <REALTIME_ADMIN_SECRET>` を
  付けたときだけ統計（接続数・IP キー/48 の種類数と最大接続数・IP 不明の接続数・IP ごとのルーム/チャンネルの最大・
  部屋数・配信数・拒否数・期限で外した `user:*` 購読数）を返す。パスは request-target を `?` で切って見るだけ
  （absolute-form の `GET http://h/healthz` はパス部分）で、Host ヘッダや URL パーサは使わない
  （`GET ///` や不正な Host で落ちないように）
- `POST /publish` — `Authorization: Bearer <REALTIME_PUBLISH_SECRET>` 必須。
  ボディは `{channel, event, data}` か `{events:[...]}`（最大100件）

### 制限

1接続あたり: 購読32チャンネル / presence に載れるゲーム4 / 10秒あたり120メッセージ /
チャットは別枠で毎秒1通（5通まで溜まる）/ 1メッセージ16KB（超えると切断）/ 未承諾の招待16件。
1IP キー（IPv4 アドレス / IPv6 /64）あたり: 同時接続20、作って残っているルーム16、購読チャンネル合計128。
IPv6 /48 あたり: 同時接続80、ルーム64、購読チャンネル合計512。全体: 同時接続5000、チャンネル表2万、ルーム2000。
1ルームあたり presence 200人。TTL 10秒で自動退出、30秒ごとに ping で死活監視。
どれも上限を超えた分は黙って無視する（接続数の上限だけは接続を閉じる）。数値は env で変えられる（上の表）。

ルームの予算は「そのルームを作った IP キー」（IPv6 なら /48 にも）に数える。作った人が抜けてもルームが残るなら、
残っている人のうち予算に余裕のある人の IP キーへ帰属を移す（余裕のある人がいなければ作った人の予算に数えたまま、
次に誰かが抜けたときに移し直す）。空になったルームはその場で消して予算を返す。
