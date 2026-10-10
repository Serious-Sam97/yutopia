// Minimal Prometheus metrics for the world-server (no dependency).
const counters = new Map<string, number>();
const gauges = new Map<string, () => number>();
const tick = { sum: 0, n: 0, max: 0 };

export const metrics = {
  inc(name: string, by = 1) {
    counters.set(name, (counters.get(name) ?? 0) + by);
  },
  gauge(name: string, fn: () => number) {
    gauges.set(name, fn);
  },
  tick(ms: number) {
    tick.sum += ms;
    tick.n += 1;
    tick.max = Math.max(tick.max, ms);
  },
  render(): string {
    const out: string[] = [];
    for (const [k, v] of counters) out.push(`# TYPE yutopia_${k} counter`, `yutopia_${k} ${v}`);
    for (const [k, fn] of gauges) out.push(`# TYPE yutopia_${k} gauge`, `yutopia_${k} ${fn()}`);
    out.push(
      "# TYPE yutopia_tick_ms_avg gauge",
      `yutopia_tick_ms_avg ${tick.n ? (tick.sum / tick.n).toFixed(3) : 0}`,
      "# TYPE yutopia_tick_ms_max gauge",
      `yutopia_tick_ms_max ${tick.max.toFixed(3)}`,
    );
    tick.sum = 0;
    tick.n = 0;
    tick.max = 0;
    return `${out.join("\n")}\n`;
  },
};
