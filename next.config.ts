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
  ...(isGhPages && {
    output: "export",
    basePath: "/unj-reze",
    assetPrefix: "/unj-reze/",
  }),
  images: {
    unoptimized: true,
  },
  // basePath はクライアント側（Service Worker の登録パスや manifest のアイコン URL）でも
  // 必要になるが、Next は basePath を公開してくれないのでビルド時に環境変数として埋め込む。
  env: {
    NEXT_PUBLIC_BASE_PATH: isGhPages ? "/unj-reze" : "",
  },
  allowedDevOrigins: [getLocalIp(), `localhost:${process.env.PORT || 3000}`],
};

export default nextConfig;
