import { spHour } from "@yutopia/shared";
import { config } from "./config.ts";
import { metrics } from "./metrics.ts";
import { startWorldServer } from "./server.ts";

const server = await startWorldServer(config.port);
console.log(`[yutopia] world-server on :${config.port}${config.offline ? " (offline)" : ""}`);

// the world's hour is São Paulo's, by arithmetic (shared clock.ts): say so if the
// zone's rules ever change (Brazil bringing daylight saving back)
try {
  const now = Date.now();
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(now)
    .split(":")
    .map(Number);
  const off = ((h * 60 + m - Math.floor(spHour(now) * 60) + 2160) % 1440) - 720;
  if (Math.abs(off) > 1)
    console.warn(`[clock] São Paulo is ${off} min off spHour (shared clock.ts): the offset needs a look`);
} catch (e) {
  console.warn("[clock] couldn't check São Paulo's hour against Intl:", (e as Error).message);
}

// What nothing else caught (a plain setTimeout's callback, a promise no one awaited): logged and
// counted, the world kept up — a feature's bug shouldn't drop everyone (docs/plan/72-the-3d-core.md,
// phase 1). A storm of them (STORM in a minute) says the process is in a bad way: it exits, and
// the container's restart policy brings it back.
const STORM = 30;
let recent: number[] = [];
function caught(kind: string, e: unknown) {
  metrics.inc(kind === "uncaughtException" ? "uncaught_exceptions_total" : "unhandled_rejections_total");
  console.error(`[world] ${kind}:`, (e as Error)?.stack ?? e);
  const now = Date.now();
  recent = recent.filter((t) => now - t < 60_000);
  recent.push(now);
  if (recent.length >= STORM) {
    console.error(`[world] ${STORM} uncaught errors in a minute: exiting for a clean restart`);
    process.exit(1);
  }
}
process.on("uncaughtException", (e) => caught("uncaughtException", e));
process.on("unhandledRejection", (e) => caught("unhandledRejection", e));

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => void server.gracefullyShutdown(true));
}
