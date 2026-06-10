import type { NextConfig } from "next";

const isGhPages = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true" || process.env.GITHUB_ACTIONS === "true";

const nextConfig: NextConfig = {
  ...(isGhPages && {
    output: "export",
    basePath: "/unj-reze",
    assetPrefix: "/unj-reze/",
  }),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
