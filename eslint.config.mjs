import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// eslint-plugin-react-hooks v6 のルールの大半は React Compiler でコンポーネント全体を
// 解析するため、巨大な単一コンポーネントではヒープを食い潰して OOM で落ちる
// (components/GameMaker.tsx は約19,000行。--max-old-space-size=8192 でも不足)。
// 対象ファイルだけコンパイラ系ルールを無効化する。exhaustive-deps はコンパイラを
// 使わない従来実装（19,000行でも約100ms）なので維持する。
// ルール名を直書きせずプラグイン側の一覧から導出するため、v6 系がルールを追加しても追従する。
const COMPILER_SAFE_REACT_HOOKS_RULES = new Set(["react-hooks/exhaustive-deps"]);
const reactCompilerRulesOff = Object.fromEntries(
  nextVitals
    .flatMap((entry) => Object.keys(entry.rules ?? {}))
    .filter((name) => name.startsWith("react-hooks/") && !COMPILER_SAFE_REACT_HOOKS_RULES.has(name))
    .map((name) => [name, "off"]),
);

const eslintConfig = defineConfig([
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "tmp/**",
      "scratch/**",
      "scripts/**",
    ]
  },
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          "paths": [
            {
              "name": "@onjmin/dtm",
              "message": "Edge/サーバー評価時にクラッシュするため @onjmin/dtm の静的インポートは禁止です。playMMLなどのロードには await import('@onjmin/dtm') による動的インポートを使用してください。",
              "allowTypeImports": true
            }
          ]
        }
      ]
    }
  },
  {
    files: ["lib/db/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  {
    files: ["components/GameMaker.tsx"],
    rules: reactCompilerRulesOff
  }
]);

export default eslintConfig;
