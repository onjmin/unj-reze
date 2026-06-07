import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/unj-reze",
  assetPrefix: "/unj-reze/",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
