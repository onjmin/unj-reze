import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
  }
]);

export default eslintConfig;
