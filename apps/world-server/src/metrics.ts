// Minimal Prometheus metrics for the world-server (no dependency).
// Timings (docs/plan/38-the-lag.md): the features' tick, every message handler (by type),
// the hearing pass and the patch encode, each as avg/max ms since the last scrape, plus
// the event loop's delay (how late timers ran: anything that blocks the process shows here).
import { monitorEventLoopDelay } from "node:perf_hooks";

const counters = new Map<string, number>();
const gauges = new Map<string, () => number>();
type Timing = { sum: number; n: number; max: number };
const timings = new Map<string, Timing>();
const messages = new Map<string, Timing>();
const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();

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
  },
  tick(ms: number) {
    add(timings, "tick", ms);
  },
  /** A message handler's time, by message type. */
  message(type: string, ms: number) {
    add(messages, type, ms);
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
    );
    timings.clear();
    messages.clear();
    loop.reset();
    return `${out.join("\n")}\n`;
  },
};
