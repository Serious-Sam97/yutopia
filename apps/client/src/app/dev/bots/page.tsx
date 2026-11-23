"use client";

import { mapBoxes, STRIKE_MAPS, type StrikeMap } from "@yutopia/shared/strike";
import { type BotLevel, type Know, knowOf, type LabFrame, type LabResult, lab } from "@yutopia/shared/strike/bots";
import { notFound } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

// The bots' overlay (docs/plan/117-bot-brains.md, phase 2): a Strike map from above with what the bots know of it —
// its areas, the routes each side takes, the entrances, the spots each side holds, the grenades' lineups — and a lab
// match of bots played back over it: where each one is, which way it looks, its order and why, who it's on, its path,
// the grenades, the charge, the radio. Dev only (or NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//   /dev/bots?map=sawmill&seed=7&rounds=6&l0=normal&l1=normal&t=40&mode=retakes&size=4
// Keys: Space play / pause · ← → a second · [ ] a round · 1–6 the layers

const LAYERS = ["areas", "routes", "spots", "lineups", "paths", "radio"] as const;
type Layer = (typeof LAYERS)[number];
const TEAM = { r: "#e8a33a", w: "#6fa3c7" } as const;

export default function BotsBench() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const [mapKey, setMapKey] = useState(q.get("map") ?? "sawmill");
  const [seed, setSeed] = useState(Number(q.get("seed") ?? 7));
  const [rounds, setRounds] = useState(Number(q.get("rounds") ?? 6));
  const [levels, setLevels] = useState<[BotLevel, BotLevel]>([
    (q.get("l0") as BotLevel) ?? "normal",
    (q.get("l1") as BotLevel) ?? "normal",
  ]);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({
    areas: true,
    routes: true,
    spots: true,
    lineups: false,
    paths: true,
    radio: true,
  });
  const [res, setRes] = useState<LabResult | null>(null);
  const [fi, setFi] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const map = useMemo(() => STRIKE_MAPS.find((m) => m.key === mapKey) as StrikeMap, [mapKey]);
  const know = useMemo<Know | null>(() => (map ? knowOf(map) : null), [map]);
  const boxes = useMemo(() => (map ? mapBoxes(map) : []), [map]);

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      const mode = q.get("mode");
      const size = q.get("size");
      const r = lab({
        map: mapKey,
        seed,
        rounds,
        levels,
        record: true,
        ...(mode ? { mode: mode as never } : {}),
        ...(size ? { size: Number(size) } : {}),
      });
      setRes(r);
      const t0 = Number(q.get("t") ?? 0);
      const first = r.frames.findIndex((f) => f.phase === "live");
      setFi(Math.max(0, first + Math.round(t0 * 4)));
      setBusy(false);
      (window as unknown as { __bots?: unknown }).__bots = { res: r, know };
    }, 20);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: a run on load
  useEffect(() => {
    run();
  }, []);
  useEffect(() => {
    if (!playing || !res) return;
    const id = setInterval(() => setFi((f) => Math.min(res.frames.length - 1, f + 1)), 250);
    return () => clearInterval(id);
  }, [playing, res]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!res) return;
      if (e.code === "Space") setPlaying((p) => !p);
      if (e.code === "ArrowRight") setFi((f) => Math.min(res.frames.length - 1, f + 4));
      if (e.code === "ArrowLeft") setFi((f) => Math.max(0, f - 4));
      const round = res.frames[fi]?.round ?? 1;
      if (e.code === "BracketRight")
        setFi(
          Math.max(
            0,
            res.frames.findIndex((f) => f.round > round),
          ),
        );
      if (e.code === "BracketLeft")
        setFi(
          Math.max(
            0,
            res.frames.findIndex((f) => f.round >= round - 1),
          ),
        );
      const n = Number(e.key);
      if (n >= 1 && n <= LAYERS.length) setLayers((l) => ({ ...l, [LAYERS[n - 1]]: !l[LAYERS[n - 1]] }));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [res, fi]);

  const frame: LabFrame | null = res?.frames[fi] ?? null;
  // ── the drawing ──
  useEffect(() => {
    const c = canvas.current;
    if (!c || !map || !know) return;
    const W = c.width;
    const H = c.height;
    const S = map.size;
    const sc = Math.min(W / (S.x1 - S.x0), H / (S.z1 - S.z0));
    const X = (x: number) => (x - S.x0) * sc;
    const Y = (z: number) => (z - S.z0) * sc;
    const g = c.getContext("2d");
    if (!g) return;
    g.fillStyle = "#15171b";
    g.fillRect(0, 0, W, H);
    // the areas
    if (layers.areas)
      know.areas.forEach((a, i) => {
        g.fillStyle = `hsla(${(i * 47) % 360},40%,40%,0.16)`;
        g.fillRect(X(a.r.x0), Y(a.r.z0), (a.r.x1 - a.r.x0) * sc, (a.r.z1 - a.r.z0) * sc);
        g.fillStyle = "rgba(236,230,218,0.55)";
        g.font = "11px system-ui";
        g.fillText(a.name, X(a.x) - 20, Y(a.z));
      });
    // the map's solids (their footprints; taller lighter)
    for (const b of boxes) {
      if (b.y + b.hy < 0.4) continue;
      g.save();
      g.translate(X(b.x), Y(b.z));
      g.rotate(-b.a);
      const tall = Math.min(1, (b.y + b.hy) / 6);
      g.fillStyle = `rgba(${90 + tall * 80},${90 + tall * 80},${100 + tall * 80},0.85)`;
      g.fillRect(-b.hx * sc, -b.hz * sc, b.hx * 2 * sc, b.hz * 2 * sc);
      g.restore();
    }
    // the sites, the hostages, the rescue
    for (const [k, r] of Object.entries(map.sites ?? {})) {
      if (!r) continue;
      g.strokeStyle = "#e8584a";
      g.lineWidth = 2;
      g.strokeRect(X(r.x0), Y(r.z0), (r.x1 - r.x0) * sc, (r.z1 - r.z0) * sc);
      g.fillStyle = "#e8584a";
      g.font = "bold 16px system-ui";
      g.fillText(k, X(r.x0) + 4, Y(r.z0) + 16);
    }
    for (const [x, z] of map.hostages ?? []) {
      g.fillStyle = "#f0e070";
      g.fillRect(X(x) - 3, Y(z) - 3, 6, 6);
    }
    // the routes
    if (layers.routes)
      for (const r of know.routes) {
        g.strokeStyle = r.team === "r" ? "rgba(232,163,58,0.35)" : "rgba(111,163,199,0.35)";
        g.lineWidth = 2;
        g.beginPath();
        r.nodes.forEach((n, i) => {
          const [x, , z] = nodePos(know, n);
          if (i) g.lineTo(X(x), Y(z));
          else g.moveTo(X(x), Y(z));
        });
        g.stroke();
      }
    // the entrances, the spots and what they watch
    if (layers.spots) {
      for (const e of know.entrances) {
        g.strokeStyle = TEAM[e.team];
        g.lineWidth = 2;
        g.beginPath();
        g.arc(X(e.x), Y(e.z), 6, 0, Math.PI * 2);
        g.stroke();
      }
      for (const s of know.spots) {
        g.strokeStyle = s.kind === "post" ? "rgba(232,163,58,0.4)" : "rgba(111,163,199,0.4)";
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(X(s.x), Y(s.z));
        g.lineTo(X(s.wx), Y(s.wz));
        g.stroke();
        g.fillStyle = s.kind === "post" ? TEAM.r : s.kind === "sniper" ? "#b48cf0" : TEAM.w;
        g.fillRect(X(s.x) - 2.5, Y(s.z) - 2.5, 5, 5);
      }
    }
    if (layers.lineups)
      for (const l of know.lineups) {
        g.strokeStyle =
          l.kind === "smoke"
            ? "#c8c8c8"
            : l.kind === "flash"
              ? "#ffffff"
              : l.kind === "molotov"
                ? "#ff7a2a"
                : "#7ae05a";
        g.setLineDash([4, 4]);
        g.beginPath();
        g.moveTo(X(l.x), Y(l.z));
        g.lineTo(X(l.lx), Y(l.lz));
        g.stroke();
        g.setLineDash([]);
      }
    // the match's moment
    if (frame) {
      for (const n of frame.nades) {
        if (n.state === "smoke") {
          g.fillStyle = "rgba(200,200,200,0.45)";
          g.beginPath();
          g.arc(X(n.x), Y(n.z), 4.2 * sc, 0, Math.PI * 2);
          g.fill();
        } else if (n.state === "fire") {
          g.fillStyle = "rgba(255,110,40,0.45)";
          g.beginPath();
          g.arc(X(n.x), Y(n.z), 3 * sc, 0, Math.PI * 2);
          g.fill();
        } else {
          g.fillStyle = "#fff";
          g.fillRect(X(n.x) - 2, Y(n.z) - 2, 4, 4);
        }
      }
      if (frame.charge && frame.charge.state !== "carried") {
        g.fillStyle = frame.charge.state === "planted" ? "#ff3030" : "#ffb030";
        g.fillRect(X(frame.charge.x) - 5, Y(frame.charge.z) - 5, 10, 10);
      }
      for (const b of frame.bots) {
        if (layers.paths && b.alive && b.path.length) {
          g.strokeStyle = b.team === "r" ? "rgba(232,163,58,0.7)" : "rgba(111,163,199,0.7)";
          g.setLineDash([2, 3]);
          g.beginPath();
          g.moveTo(X(b.x), Y(b.z));
          for (const [x, z] of b.path) g.lineTo(X(x), Y(z));
          g.stroke();
          g.setLineDash([]);
        }
        const x = X(b.x);
        const y = Y(b.z);
        if (!b.alive) {
          g.strokeStyle = TEAM[b.team];
          g.beginPath();
          g.moveTo(x - 4, y - 4);
          g.lineTo(x + 4, y + 4);
          g.moveTo(x + 4, y - 4);
          g.lineTo(x - 4, y + 4);
          g.stroke();
          continue;
        }
        // its view's cone
        g.fillStyle = b.on ? "rgba(255,80,80,0.22)" : "rgba(255,255,255,0.08)";
        g.beginPath();
        g.moveTo(x, y);
        g.arc(x, y, 40, b.yaw - 0.5, b.yaw + 0.5);
        g.fill();
        g.fillStyle = TEAM[b.team];
        g.beginPath();
        g.arc(x, y, b.crouch ? 4 : 5.5, 0, Math.PI * 2);
        g.fill();
        if (b.still) {
          g.strokeStyle = "#fff";
          g.lineWidth = 1;
          g.stroke();
        }
        g.fillStyle = "#ece6da";
        g.font = "10px system-ui";
        g.fillText(`${b.id.slice(4)} ${b.hp}`, x + 7, y - 4);
      }
    }
  }, [map, know, boxes, frame, layers]);

  const said =
    res && frame
      ? res.log.filter((l) => {
          const [rt] = l.split(" ");
          const [r, t] = rt.split(":").map(Number);
          return r === frame.round && t <= frame.t && t > frame.t - 12;
        })
      : [];
  return (
    <div style={{ display: "flex", height: "100vh", background: "#0e0f12", color: "#ece6da", font: "13px system-ui" }}>
      <canvas ref={canvas} width={900} height={900} style={{ width: "min(100vh, 62vw)", height: "min(100vh, 62vw)" }} />
      <div style={{ flex: 1, padding: 12, overflow: "auto" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <select value={mapKey} onChange={(e) => setMapKey(e.target.value)}>
            {STRIKE_MAPS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.name}
              </option>
            ))}
          </select>
          seed{" "}
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} style={{ width: 54 }} />
          rounds{" "}
          <input
            type="number"
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value))}
            style={{ width: 44 }}
          />
          {[0, 1].map((i) => (
            <select
              key={i}
              value={levels[i]}
              onChange={(e) =>
                setLevels((l) => (i ? [l[0], e.target.value as BotLevel] : [e.target.value as BotLevel, l[1]]))
              }
            >
              {["easy", "normal", "hard", "expert"].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          ))}
          <button type="button" onClick={run} disabled={busy}>
            {busy ? "playing…" : "Play a match"}
          </button>
          <button type="button" onClick={() => setPlaying((p) => !p)}>
            {playing ? "Pause" : "Play"}
          </button>
        </div>
        <div style={{ marginTop: 6 }}>
          {LAYERS.map((l, i) => (
            <label key={l} style={{ marginRight: 10 }}>
              <input type="checkbox" checked={layers[l]} onChange={() => setLayers((x) => ({ ...x, [l]: !x[l] }))} />{" "}
              {i + 1} {l}
            </label>
          ))}
        </div>
        {res && (
          <>
            <input
              type="range"
              min={0}
              max={res.frames.length - 1}
              value={fi}
              onChange={(e) => setFi(Number(e.target.value))}
              style={{ width: "100%" }}
            />
            <div>
              round {frame?.round} · {frame?.phase} · {frame?.t.toFixed(1)} s · Raiders: {frame?.plays.r} · Wardens:{" "}
              {frame?.plays.w}
            </div>
            <div style={{ opacity: 0.8, margin: "6px 0" }}>
              {res.rounds} rounds · R {res.sides.r} W {res.sides.w} · {JSON.stringify(res.why)} · lines/side/round{" "}
              {res.linesPerRound.toFixed(1)} · bunched {(res.bunched * 100).toFixed(0)}% · blind deaths{" "}
              {(res.blindDeaths * 100).toFixed(0)}% · plants {(res.plantShare * 100).toFixed(0)}% · know{" "}
              {Math.round(know?.ms ?? 0)} ms
            </div>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <tbody>
                {frame?.bots.map((b) => (
                  <tr key={b.id} style={{ color: b.alive ? TEAM[b.team] : "#666" }}>
                    <td>{b.id.slice(4)}</td>
                    <td>{b.hp}</td>
                    <td>{b.kind}</td>
                    <td>{b.why}</td>
                    <td>{b.on ? `on ${b.on.slice(4)}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {layers.radio && (
              <div style={{ marginTop: 8, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                {said.map((l) => (
                  <div key={l}>{l}</div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function nodePos(k: Know, n: number): [number, number, number] {
  const g = k.g;
  const c = g.cellOf[n];
  const i = c % g.nx;
  const j = (c - i) / g.nx;
  return [g.x0 + (i + 0.5) * 0.5, g.hs[n], g.z0 + (j + 0.5) * 0.5];
}
