"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SyncedYouTube, SyncStats } from "@/world/media/youtube";

// Dev only: synced media on its own (Fita 10 M0 spike). A YouTube video plays at
// (server now − at) with repeat; open it in two tabs and both should be at the
// same second. ?v=<video id>&at=<server ms>&world=<world-server http url>.
// Without `at`, the start of the current 10-minute window, so tabs opened apart
// still share it. ?defer=1 waits for a click before the player starts. Window hooks for e2e / measuring: __mediaDev.

interface Summary {
  n: number;
  meanAbs: number;
  p95: number;
  max: number;
}

function summarize(log: number[]): Summary {
  const a = log.map(Math.abs).sort((x, y) => x - y);
  if (!a.length) return { n: 0, meanAbs: 0, p95: 0, max: 0 };
  return {
    n: a.length,
    meanAbs: a.reduce((s, x) => s + x, 0) / a.length,
    p95: a[Math.min(a.length - 1, Math.floor(a.length * 0.95))],
    max: a[a.length - 1],
  };
}

declare global {
  interface Window {
    __mediaDev?: { stats: () => SyncStats | null; summary: () => Summary; clock: () => unknown; reset: () => void };
  }
}

export default function MediaDev() {
  if (process.env.NODE_ENV === "production") notFound();
  const host = useRef<HTMLDivElement>(null);
  const yt = useRef<SyncedYouTube | null>(null);
  const [info, setInfo] = useState<{ v: string; at: number; clock: string; status: string }>({
    v: "",
    at: 0,
    clock: "…",
    status: "idle",
  });
  const [stats, setStats] = useState<SyncStats | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const q = new URLSearchParams(location.search);
      const world = q.get("world") ?? `http://${location.hostname}:2567`;
      const clock = await import("@/world/media/clock");
      const c = await clock.syncClock(world);
      const at = Number(q.get("at")) || Math.floor(clock.serverNow() / 600_000) * 600_000;
      const v = q.get("v") ?? "M7lc1UVf-VE";
      if (!alive) return;
      setInfo({
        v,
        at,
        clock: `offset ${c.offset.toFixed(1)} ms · rtt ${c.rtt.toFixed(1)} ms`,
        status: "loading",
      });
      // ?defer=1: wait for a click first, like the world (you clicked to get in)
      if (q.get("defer")) await new Promise((r) => window.addEventListener("pointerdown", r, { once: true }));
      const { SyncedYouTube } = await import("@/world/media/youtube");
      const p = new SyncedYouTube(host.current as HTMLDivElement, v, { at, dur: 0, loop: true });
      yt.current = p;
      window.__mediaDev = {
        stats: () => yt.current?.stats ?? null,
        summary: () => summarize(yt.current?.stats.driftLog ?? []),
        clock: () => clock.clockSample(),
        reset: () => {
          if (yt.current) yt.current.stats.driftLog = [];
        },
      };
      try {
        await p.start();
        if (alive) setInfo((i) => ({ ...i, status: "ready" }));
      } catch (e) {
        if (alive) setInfo((i) => ({ ...i, status: `failed: ${e instanceof Error ? e.message : String(e)}` }));
      }
    })();
    const t = setInterval(() => setStats(yt.current ? { ...yt.current.stats } : null), 500);
    return () => {
      alive = false;
      clearInterval(t);
      yt.current?.destroy();
    };
  }, []);

  const s = stats ? summarize(stats.driftLog) : null;
  return (
    <main className="p-6 space-y-4" style={{ background: "#1b1612", color: "#efe4cf", minHeight: "100vh" }}>
      <h1 className="text-xl">Media spike — synced YouTube</h1>
      <p className="mono text-xs">
        v={info.v} · at={info.at} · {info.clock} · {info.status}
      </p>
      <div ref={host} style={{ width: 480, height: 270, background: "#000" }} />
      {stats && s && (
        <table className="mono text-xs" data-testid="media-stats">
          <tbody>
            <tr>
              <td>state</td>
              <td>{stats.state}</td>
            </tr>
            <tr>
              <td>drift</td>
              <td>{stats.drift.toFixed(3)} s</td>
            </tr>
            <tr>
              <td>|drift| mean / p95 / max</td>
              <td>
                {s.meanAbs.toFixed(3)} / {s.p95.toFixed(3)} / {s.max.toFixed(3)} s (n={s.n})
              </td>
            </tr>
            <tr>
              <td>seeks · lead</td>
              <td>
                {stats.seeks} · {stats.lead.toFixed(2)} s
              </td>
            </tr>
            <tr>
              <td>rate · nudges ok</td>
              <td>
                {stats.rate} · {String(stats.nudges)}
              </td>
            </tr>
            <tr>
              <td>autoplay · muted · error · started</td>
              <td>
                {stats.autoplay} · {String(stats.muted)} · {String(stats.error)} ·{" "}
                {stats.startedMs === null ? "—" : `${stats.startedMs.toFixed(0)} ms`}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </main>
  );
}
