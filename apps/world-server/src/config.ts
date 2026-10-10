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
};
