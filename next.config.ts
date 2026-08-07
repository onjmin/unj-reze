import type { NextConfig } from "next";
import os from "os";

const isGhPages = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true" || process.env.GITHUB_ACTIONS === "true";

// ローカルIPアドレスを自動取得する関数
const getLocalIp = (): string => {
  const interfaces = os.networkInterfaces();
  for (const interfaceName in interfaces) {
    const networkInterface = interfaces[interfaceName];
    if (networkInterface) {
      for (const net of networkInterface) {
        // IPv4 かつ ループバック（127.0.0.1）でないものを探す
        if (net.family === "IPv4" && !net.internal) {
          return net.address;
        }
      }
    }
  }
  return "localhost"; // 見つからなかった場合のフォールバック
};

const nextConfig: NextConfig = {
  // ローカル開発時のみ lib/db/pg.ts が動的importする `pg`(node-postgres) をバンドルさせない。
  // 本番(Cloudflare Workers)では常に @neondatabase/serverless の neon() 経由でHTTPアクセスするため
  // このコードパスは実行されないが、esbuildにバンドルさせないことで node:net 等の
  // Workers非互換依存を巻き込むリスクごと切り離す。
  serverExternalPackages: ["pg"],
  ...(isGhPages && {
    output: "export",
    basePath: "/unj-reze",
    assetPrefix: "/unj-reze/",
  }),
  images: {
    unoptimized: true,
  },
  // basePath や .env / .env.production 内の NEXT_PUBLIC_* 変数が
  // next.config.ts の env 指定によって上書き消失しないよう、すべての NEXT_PUBLIC_* を明示的にパススルーする。
  env: {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key.startsWith("NEXT_PUBLIC_"))
    ),
    NEXT_PUBLIC_BASE_PATH: isGhPages ? "/unj-reze" : "",
  },
  allowedDevOrigins: [getLocalIp(), `localhost:${process.env.PORT || 3000}`],
};

export default nextConfig;
