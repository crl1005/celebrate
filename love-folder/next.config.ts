import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/celebrate",
  assetPrefix: "/celebrate/",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;