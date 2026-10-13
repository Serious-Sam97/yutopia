// Environment for the world-server. Secrets must match Yondra's backend .env.
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 2567),
  worldSecret: () => req("YUTOPIA_WORLD_SECRET"),
  internalSecret: () => req("YUTOPIA_INTERNAL_SECRET"),
  yondraApi: process.env.YONDRA_API_INTERNAL ?? "http://localhost",
  livekit: {
    url: process.env.LIVEKIT_HTTP_URL ?? "",
    key: process.env.LIVEKIT_API_KEY ?? "",
    secret: process.env.LIVEKIT_API_SECRET ?? "",
  },
  // Lets tests and the bot swarm run without Laravel (bots get synthetic tokens).
  offline: process.env.YUTOPIA_OFFLINE === "1",
  // Dev only: accept "bot:<id>:<name>" tokens next to real people (perf swarm).
  allowBots: process.env.YUTOPIA_OFFLINE === "1" || process.env.YUTOPIA_ALLOW_BOTS === "1",
  // Map v2 (walls on edges): spaces saved as v1 are converted when they load.
  // With this on, the conversion is written back to Yondra right away (layout +
  // moved boards/doors); otherwise only when a builder edits the map.
  saveMigrations: process.env.YUTOPIA_MAP_V2_SAVE === "1",
  // Media on TVs (docs/plan/10-media.md). Jellyfin: the server, an API key
  // (never leaves this process) and the Jellyfin user whose libraries Yutopia
  // shows (default: the first administrator). YouTube: a Data API key for
  // search and lengths (optional: without it, links only).
  jellyfin: {
    url: (process.env.YUTOPIA_JELLYFIN_URL ?? "").replace(/\/$/, ""),
    key: process.env.YUTOPIA_JELLYFIN_KEY ?? "",
    user: process.env.YUTOPIA_JELLYFIN_USER ?? "",
    // the most a TV's stream may carry (bits/s)
    bitrate: Number(process.env.YUTOPIA_JELLYFIN_BITRATE ?? 4_000_000),
  },
  youtubeKey: process.env.YUTOPIA_YOUTUBE_KEY ?? "",
};
