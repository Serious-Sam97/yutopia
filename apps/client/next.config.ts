import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@yutopia/shared"],
  reactStrictMode: true,
  poweredByHeader: false,
  // production builds go to their own folder so they never clobber `next dev`
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
