// This build's version (docs/plan/40-the-version.md), baked in by next.config.ts:
// 0.1.<commits> — one more with every commit pushed —, the commit and its date.
export const VERSION = {
  version: process.env.NEXT_PUBLIC_YUTOPIA_VERSION ?? "dev",
  commit: process.env.NEXT_PUBLIC_YUTOPIA_COMMIT ?? "",
  date: process.env.NEXT_PUBLIC_YUTOPIA_DATE ?? "",
};
