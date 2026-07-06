<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# RPGenアセット検索

ゲーム素材(歩行グラ/スプライト/効果音/マップ/タグ等)を検索・取得するタスクに着手する前に、
`.agents/skills/rpgen-search/SKILL.md` を読むこと(認証トークンを含むためgitignore対象・ローカル限定)。

# データベーススキーマ変更時のルール

データベーススキーマ（`lib/db/sqlite.ts` や `lib/db/pg.ts`、あるいはテーブル定義クエリなど）を変更・追加した際は、開発者が Neon データベース等とのスキーマ乖離を簡易検証できるようにするため、必ず [check-schema.sql](file:///c:/_own/git/_users/onjmin/unj-reze/scripts/check-schema.sql) の期待されるテーブル・カラム構成リストも同期して更新すること。
