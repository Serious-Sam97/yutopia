import { spHour } from "@yutopia/shared";
import { config } from "./config.ts";
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

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => void server.gracefullyShutdown(true));
}
