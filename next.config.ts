import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  async rewrites() {
    return [
      { source: "/proposal", destination: "/proposal/index.html" },
      { source: "/proposal/", destination: "/proposal/index.html" },
      { source: "/mock", destination: "/mock/index.html" },
      { source: "/mock/", destination: "/mock/index.html" },
    ];
  },
};

export default nextConfig;
