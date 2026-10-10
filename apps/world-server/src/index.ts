import { config } from "./config.ts";
import { startWorldServer } from "./server.ts";

const server = await startWorldServer(config.port);
console.log(`[yutopia] world-server on :${config.port}${config.offline ? " (offline)" : ""}`);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => void server.gracefullyShutdown(true));
}
