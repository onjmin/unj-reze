# unj-reze
うんｊレゼ

## デプロイ構成

| モード | 用途 | ホスト |
|---|---|---|
| 静的エクスポート | デモ・確認用 | GitHub Pages |
| サーバーモード | 本番運用 | Netlify |

---

## GitHub Pages（デモ）

APIルートなし・モックデータのみの静的サイトとして自動デプロイされます。

- トリガー：`main` ブランチへの push、または Actions の手動実行
- 設定ファイル：`.github/workflows/gh-pages.yml`
- URL：`https://<user>.github.io/unj-reze/`

手動でローカルから静的ビルドを確認する場合：

```sh
NEXT_PUBLIC_STATIC_EXPORT=true pnpm build
# out/ ディレクトリに生成される
```

---

## Netlify（本番）

### 前提

- [Netlify](https://netlify.com) アカウント
- [Neon](https://neon.tech) PostgreSQL プロジェクト
- Cloudflare アカウント（R2 バケット・KV Namespace を作成済み）

### 手順

#### 1. Netlify プロジェクトを作成

Netlify ダッシュボード → **Add new site → Import an existing project** → GitHub リポジトリを選択。

ビルド設定は `netlify.toml` から自動読み込みされるため変更不要。

#### 2. Netlify Plugin をインストール

```sh
pnpm add -D @netlify/plugin-nextjs
```

> `netlify.toml` に設定済みのため、Netlify 側で自動インストールされる場合は不要。

#### 3. 環境変数を設定

Netlify ダッシュボード → **Site configuration → Environment variables** で以下を登録：

**データベース（Neon）**

| 変数名 | 値 |
|---|---|
| `DATABASE_PROVIDER` | `neon` |
| `DATABASE_URL` | Neon の接続文字列（`postgresql://...`） |

**KV（Cloudflare KV）**

まず Cloudflare ダッシュボード → **Workers & Pages → KV** で Namespace を作成する。  
その後、以下を **Netlify の環境変数**として登録：

| 変数名 | 値 |
|---|---|
| `KV_PROVIDER` | `cloudflare` |
| `KV_ACCOUNT_ID` | Cloudflare のアカウント ID |
| `KV_NAMESPACE_ID` | 作成した Namespace の ID |
| `KV_API_TOKEN` | KV 読み書き権限を持つ API Token |

API Token の作成：Cloudflare ダッシュボード → **My Profile → API Tokens → Create Token**  
テンプレート「Edit Cloudflare Workers」または権限「Account / Workers KV Storage / Edit」を付与。

**ストレージ（Cloudflare R2）**

まず Cloudflare ダッシュボード → **R2 → Create bucket** でバケットを作成する。  
その後、以下を **Netlify の環境変数**として登録：

| 変数名 | 値 |
|---|---|
| `STORAGE_PROVIDER` | `r2` |
| `R2_ACCOUNT_ID` | Cloudflare のアカウント ID |
| `R2_ACCESS_KEY_ID` | R2 API トークン（アクセスキー） |
| `R2_SECRET_ACCESS_KEY` | R2 API トークン（シークレット） |
| `R2_BUCKET` | バケット名 |
| `R2_PUBLIC_URL` | バケットのパブリック URL（例：`https://pub-xxxx.r2.dev`） |

R2 API トークンの作成：Cloudflare ダッシュボード → **R2 → Manage R2 API Tokens → Create API Token**  
権限は「Object Read & Write」を選択。

R2 パブリックアクセスの有効化：バケットの **Settings → Public access → Allow Access** をオンにする。

#### 4. データベースの初期化

自動マイグレーションは廃止されました。初回セットアップ時やデータベースをリセットする際は、手動でSQLを適用してください。

1. [data/schema.sql](./data/schema.sql) の内容をコピーします。
2. Neon のダッシュボードの **SQL Editor** を開くか、またはローカルの PostgreSQL クライアント等から接続します。
3. コピーした SQL を実行してテーブルやインデックスを作成します。

#### 5. デプロイ

`main` ブランチへの push で自動デプロイされます。手動デプロイは Netlify CLI から：

```sh
npx netlify deploy --prod
```

---

## ローカル開発

```sh
docker compose up -d      # db-neon(Postgres) + minio(R2互換) を起動
cp .env.example .env
pnpm install
pnpm dev
```

`.env.example` のデフォルト値は上の docker-compose に向いているので、Neon/R2 の契約が
無くてもこのまま動きます。DB・ストレージそれぞれ独立して本物のサービスに切り替え可能：

| 変数 | docker（デフォルト） | 本物のサービスに切り替える場合 |
|---|---|---|
| `DATABASE_PROVIDER=neon` + `DATABASE_URL` | `postgresql://neon:neon@localhost:5432/unj_reze` | Neonダッシュボードの接続文字列に差し替えるだけ（`lib/db/pg.ts` がホスト名で自動判別） |
| `STORAGE_PROVIDER=r2` + `R2_*` | `R2_ENDPOINT=http://localhost:9000`（minio） | `R2_ENDPOINT` を空にして `R2_ACCOUNT_ID` を設定するだけ（`lib/storage/r2.ts` が `R2_ENDPOINT` の有無で自動判別） |

`DATABASE_PROVIDER=mock` にすれば docker-compose すら不要（インメモリのモックデータのみ）。

---

## 環境変数一覧

`.env.example` を参照。
