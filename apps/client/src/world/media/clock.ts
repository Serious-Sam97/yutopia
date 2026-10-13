// The world-server's clock, as seen from here. Synced media plays at
// (serverNow − at), so everyone has to agree on "now" better than their own
// clocks do (laptops drift by seconds). NTP-style: a few round trips to
// `/time`, keep the one with the shortest round trip, assume the reply was
// stamped halfway through it.

export interface ClockSample {
  offset: number; // server − local, ms
  rtt: number; // ms
}

let best: ClockSample | null = null;

export async function syncClock(worldHttp: string, samples = 6): Promise<ClockSample> {
  const url = `${worldHttp.replace(/\/$/, "")}/time`;
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    const w0 = Date.now();
    let server: number;
    try {
      server = Number(await (await fetch(url, { cache: "no-store" })).text());
    } catch {
      continue;
    }
    const rtt = performance.now() - t0;
    if (!Number.isFinite(server)) continue;
    const s = { offset: server - (w0 + rtt / 2), rtt };
    if (!best || s.rtt <= best.rtt) best = s;
  }
  return best ?? { offset: 0, rtt: Number.POSITIVE_INFINITY };
}

export function serverNow(): number {
  return Date.now() + (best?.offset ?? 0);
}

export function clockSample(): ClockSample | null {
  return best;
}

// ws://host:2567 → http://host:2567 (the world-server serves both).
export function worldHttpUrl(worldUrl: string): string {
  return worldUrl.replace(/^ws(s?):/, "http$1:");
}
