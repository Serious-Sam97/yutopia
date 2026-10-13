import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@yutopia/shared"],
  reactStrictMode: true,
  poweredByHeader: false,
  // `next dev` is reached through the cloudflared tunnel, not localhost
  allowedDevOrigins: ["yutopia.yondra.net"],
  // production builds go to their own folder so they never clobber `next dev`
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  webpack(config, { dev, isServer }) {
    // `next dev` names lazy chunks `static/chunks/<name>.js` with no hash, so a
    // browser that holds on to an old copy keeps running it after a rebuild
    // (seen with Firefox: a stale games/room chunk next to fresh page code).
    // Hashing the name like production does gives every rebuilt chunk a new
    // URL, so a page reload can never pick up stale code.
    if (dev && !isServer) {
      config.output.chunkFilename = "static/chunks/[name].[contenthash:8].js";
    }
    return config;
  },
};

export default nextConfig;
