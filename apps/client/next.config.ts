import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// The client's version (docs/plan/40-the-version.md), baked in: 0.1.<commits> with the
// commit's hash and date, from git (the prod image's build gets .git handed in: its
// Dockerfile). With no git, "dev" and the commit read off .git by hand. `next dev` adds "-dev".
interface Version {
  version: string;
  commit: string;
  date: string;
}
const root = path.resolve(__dirname, "../..");
function headCommit(): string {
  try {
    let dir = path.join(root, ".git");
    if (statSync(dir).isFile()) dir = path.resolve(root, readFileSync(dir, "utf8").replace("gitdir:", "").trim());
    const head = readFileSync(path.join(dir, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref:")) return head.slice(0, 7);
    const ref = head.slice(4).trim();
    const common = existsSync(path.join(dir, "commondir"))
      ? path.resolve(dir, readFileSync(path.join(dir, "commondir"), "utf8").trim())
      : dir;
    for (const d of [dir, common])
      if (existsSync(path.join(d, ref))) return readFileSync(path.join(d, ref), "utf8").slice(0, 7);
    const packed = readFileSync(path.join(common, "packed-refs"), "utf8");
    return (
      packed
        .split("\n")
        .find((l) => l.endsWith(` ${ref}`))
        ?.slice(0, 7) ?? ""
    );
  } catch {
    return "";
  }
}
function version(dev: boolean): Version {
  let v: Version;
  try {
    const git = (...a: string[]) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8", stdio: "pipe" }).trim();
    const [major, minor] = (
      JSON.parse(readFileSync(path.join(__dirname, "package.json"), "utf8")).version ?? "0.1.0"
    ).split(".");
    const [commit, date] = git("log", "-1", "--format=%h %cs").split(" ");
    v = { version: `${major}.${minor}.${git("rev-list", "--count", "HEAD")}`, commit, date };
  } catch {
    v = { version: "dev", commit: headCommit(), date: "" };
  }
  return dev && v.version !== "dev" ? { ...v, version: `${v.version}-dev` } : v;
}

const nextConfig = (phase: string): NextConfig => ({
  transpilePackages: ["@yutopia/shared"],
  env: (() => {
    const v = version(phase === PHASE_DEVELOPMENT_SERVER);
    return {
      NEXT_PUBLIC_YUTOPIA_VERSION: v.version,
      NEXT_PUBLIC_YUTOPIA_COMMIT: v.commit,
      NEXT_PUBLIC_YUTOPIA_DATE: v.date,
    };
  })(),
  reactStrictMode: true,
  poweredByHeader: false,
  // `next dev` is reached through the cloudflared tunnel, not localhost
  allowedDevOrigins: ["yutopia.yondra.net"],
  // production builds go to their own folder so they never clobber `next dev`
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  webpack(config, { dev, isServer, webpack }) {
    // Jolt (jolt-physics, docs/plan/50-the-volume.md) reaches for `node:module` only when it runs
    // under Node; webpack (the docker stack's `next dev`) can't read `node:` at all — Turbopack
    // (`next build`) leaves it be
    if (!isServer) config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^node:module$/ }));
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
});

export default nextConfig;
