// Minimal Prometheus metrics for the world-server (no dependency).
// Timings (docs/plan/38-the-lag.md): the features' tick, every message handler (by type),
// the hearing pass and the patch encode, each as avg/max ms since the last scrape, plus
// the event loop's delay (how late timers ran: anything that blocks the process shows here).
import { monitorEventLoopDelay, PerformanceObserver } from "node:perf_hooks";

const counters = new Map<string, number>();
const gauges = new Map<string, () => number>();
type Timing = { sum: number; n: number; max: number };
const timings = new Map<string, Timing>();
const messages = new Map<string, Timing>();
const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();

// Stalls (docs/plan/41-the-snap.md): a timer every 100 ms; one that runs late by more than
// STALL_MS means nothing ran meanwhile — every message queued, every player's moves handed
// over at once after. Each is logged with when, how long, the longest piece of our own work
// in it (a feature's tick, a message, the patch), and what the process did meanwhile: CPU
// time near the stall's length is busy (our code, the GC); far under it, the process wasn't
// running (the host: CPU, swap — major page faults count reads from disk).
const STALL_MS = 250;
const EVERY_MS = 100;
let longest: { what: string; ms: number } | null = null; // since the last check
const gcs: { at: number; ms: number }[] = [];
try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      gcs.push({ at: e.startTime, ms: e.duration });
      if (gcs.length > 64) gcs.shift();
    }
  }).observe({ entryTypes: ["gc"] });
} catch {
  // (no GC entries here: the stall line says so)
}
let stalls = 0;
let stallMax = 0;
let checkAt = performance.now();
let cpuAt = process.cpuUsage();
let faultsAt = process.resourceUsage().majorPageFault;
setInterval(() => {
  const now = performance.now();
  const late = now - checkAt - EVERY_MS;
  const cpu = process.cpuUsage(cpuAt);
  const faults = process.resourceUsage().majorPageFault;
  if (late > STALL_MS) {
    stalls++;
    if (late > stallMax) stallMax = late;
    const from = checkAt;
    const work = longest;
    const busy = (cpu.user + cpu.system) / 1000;
    const disk = faults - faultsAt;
    const wall = new Date().toISOString();
    // (the GC's entries arrive a moment after: then)
    setTimeout(() => {
      const gc = gcs.filter((g) => g.at + g.ms > from && g.at < now).reduce((n, g) => n + g.ms, 0);
      console.warn(
        `[stall] ${late.toFixed(0)} ms, ending ${wall} — our longest work: ${work ? `${work.what} ${work.ms.toFixed(0)} ms` : "none timed"}; CPU ${busy.toFixed(0)} ms of ${(now - from).toFixed(0)} (${busy > (now - from) * 0.6 ? "busy" : "not running"}); GC ${gc.toFixed(0)} ms; page reads from disk ${disk}`,
      );
    }, 30).unref();
  }
  longest = null;
  checkAt = now;
  cpuAt = process.cpuUsage();
  faultsAt = faults;
}, EVERY_MS).unref();

const worst = (what: string, ms: number) => {
  if (!longest || ms > longest.ms) longest = { what, ms };
};

const add = (m: Map<string, Timing>, name: string, ms: number) => {
  let t = m.get(name);
  if (!t) {
    t = { sum: 0, n: 0, max: 0 };
    m.set(name, t);
  }
  t.sum += ms;
  t.n += 1;
  if (ms > t.max) t.max = ms;
};

export const metrics = {
  inc(name: string, by = 1) {
    counters.set(name, (counters.get(name) ?? 0) + by);
  },
  gauge(name: string, fn: () => number) {
    gauges.set(name, fn);
  },
  /** One run of something timed (`tick`, `hearing`, `patch`), in ms. */
  time(name: string, ms: number) {
    add(timings, name, ms);
    worst(name, ms);
  },
  /** The features' tick; `whose`: its slowest feature's name and time. */
  tick(ms: number, whose = "") {
    add(timings, "tick", ms);
    worst(whose ? `tick (${whose})` : "tick", ms);
  },
  /** A message handler's time, by message type. */
  message(type: string, ms: number) {
    add(messages, type, ms);
    worst(`message ${type}`, ms);
  },
  render(): string {
    const out: string[] = [];
    for (const [k, v] of counters) out.push(`# TYPE yutopia_${k} counter`, `yutopia_${k} ${v}`);
    for (const [k, fn] of gauges) out.push(`# TYPE yutopia_${k} gauge`, `yutopia_${k} ${fn()}`);
    if (!timings.has("tick")) timings.set("tick", { sum: 0, n: 0, max: 0 });
    for (const [k, t] of timings)
      out.push(
        `# TYPE yutopia_${k}_ms_avg gauge`,
        `yutopia_${k}_ms_avg ${t.n ? (t.sum / t.n).toFixed(3) : 0}`,
        `# TYPE yutopia_${k}_ms_max gauge`,
        `yutopia_${k}_ms_max ${t.max.toFixed(3)}`,
      );
    if (messages.size) {
      out.push(
        "# TYPE yutopia_message_ms_sum gauge",
        "# TYPE yutopia_message_ms_max gauge",
        "# TYPE yutopia_message_count gauge",
      );
      for (const [k, t] of messages)
        out.push(
          `yutopia_message_ms_sum{type="${k}"} ${t.sum.toFixed(3)}`,
          `yutopia_message_ms_max{type="${k}"} ${t.max.toFixed(3)}`,
          `yutopia_message_count{type="${k}"} ${t.n}`,
        );
    }
    out.push(
      "# TYPE yutopia_event_loop_delay_ms_p99 gauge",
      `yutopia_event_loop_delay_ms_p99 ${(loop.percentile(99) / 1e6).toFixed(3)}`,
      "# TYPE yutopia_event_loop_delay_ms_max gauge",
      `yutopia_event_loop_delay_ms_max ${(loop.max / 1e6).toFixed(3)}`,
      "# TYPE yutopia_stalls gauge",
      `yutopia_stalls ${stalls}`,
      "# TYPE yutopia_stall_ms_max gauge",
      `yutopia_stall_ms_max ${stallMax.toFixed(0)}`,
    );
    stalls = 0;
    stallMax = 0;
    timings.clear();
    messages.clear();
    loop.reset();
    return `${out.join("\n")}\n`;
  },
};
