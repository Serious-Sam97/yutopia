"use client";

import { BIKE_SPECS, type BikeKind } from "@yutopia/shared/bike";
import { type CarState, createCar, type Ground } from "@yutopia/shared/car";
import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { mixer } from "@/world/audio";
import { BikeSound, bikeBank } from "@/world/bike/sound";

// The bikes' listening bench (docs/plan/101-the-bicycles.md, phase 8): a ride made up here — how fast, pedalled or
// coasting, on what ground, the brake — heard through the game's own mix (world/bike/sound.ts), and its one-offs: the
// bell, a gear changed, a landing, a knock. Each recorded sound's candidates (public/sfx/bikes/manifest.json) picked
// here — or the one made in code —; "copy picks" gives chosen.json. Each bike's freewheel is its own (the town bike's hub hums, the BMX's
// buzzes; the fixed gear has none). Dev only (or NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//   /dev/bike-sound

const KINDS: BikeKind[] = ["bike_town", "bike_bmx", "bike_mtb", "bike_road"];
const VARIANT: Record<BikeKind, string> = {
  bike_town: "town-classic",
  bike_bmx: "bmx-free",
  bike_mtb: "mtb-trail",
  bike_road: "road-race",
};
const GROUNDS: Ground[] = ["asphalt", "snow", "deep", "slush", "path", "ice"];

export default function BikeSoundBench() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const [kind, setKind] = useState<BikeKind>("bike_town");
  const [fixed, setFixed] = useState(false);
  const [on, setOn] = useState(false);
  const [kmh, setKmh] = useState(20);
  const [pedal, setPedal] = useState(true);
  const [cad, setCad] = useState(80);
  const [ground, setGround] = useState<Ground>("asphalt");
  const [brake, setBrake] = useState(0);
  const [skid, setSkid] = useState(0);
  const [near, setNear] = useState(true);
  const snd = useRef<BikeSound | null>(null);
  const [man, setMan] = useState<Record<string, { name: string; license?: string }[]> | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});
  useEffect(() => {
    void bikeBank().then((b) => {
      if (!b) return;
      const m: Record<string, { name: string; license?: string }[]> = {};
      for (const [k, v] of Object.entries(b.man)) if (Array.isArray(v)) m[k] = v;
      setMan(m);
      setPicks((p) => ({ ...Object.fromEntries(Object.keys(m).map((k) => [k, b.chosen[k] ?? 0])), ...p }));
    });
  }, []);
  const st = useRef<CarState | null>(null);
  const live = useRef({ kmh, pedal, cad, ground, brake, skid, near });
  live.current = { kmh, pedal, cad, ground, brake, skid, near };

  useEffect(() => {
    if (!on) return;
    const ctx = mixer.ensure();
    void mixer.resume();
    const s = new BikeSound(ctx, mixer.buses.effects, { kind, variant: fixed ? "road-fixed" : VARIANT[kind] }, picks);
    snd.current = s;
    const state = createCar(BIKE_SPECS[kind], 0, 0, 0, 0);
    st.current = state;
    let last = performance.now();
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const L = live.current;
      const v = L.kmh / 3.6;
      state.v.x = v;
      state.v.z = 0;
      state.rpm = L.pedal ? L.cad : 0;
      state.thr = L.pedal ? 0.6 : 0;
      state.brk = L.brake;
      state.gear = Math.max(1, Math.min(BIKE_SPECS[kind].gears.length - 2, Math.round(v / 3)));
      for (const w of state.wheels) {
        w.contact = true;
        w.ground = L.ground;
        w.slip = L.skid;
      }
      s.update(state, { inside: L.near, dist: L.near ? 0 : 25, at: L.near ? null : { x: 12, y: 0, z: -20 } }, dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      s.dispose();
      snd.current = null;
    };
  }, [on, kind, fixed, picks]);

  const hit = (what: "ground" | "wall", j: number) => {
    const s = st.current;
    if (!s) return;
    s.hit = { j, x: 0, z: 0, what, at: performance.now() / 1000 };
  };
  const row = "flex items-center gap-3 my-2";
  return (
    <main className="p-6 max-w-2xl" style={{ color: "var(--cream)" }}>
      <h1 className="text-xl mb-2">Bikes · the listening bench</h1>
      <p className="mono text-xs mb-4" style={{ color: "var(--muted)" }}>
        A ride made up here, heard through the game's own mix. Each sound's recordings (its candidates below) or the one made in code; copy the picks into public/sfx/bikes/chosen.json.
      </p>
      <div className={row}>
        {KINDS.map((k) => (
          <button key={k} type="button" className="deck-btn" aria-pressed={k === kind} onClick={() => setKind(k)}>
            {k.replace("bike_", "")}
          </button>
        ))}
        <label className="mono text-xs">
          <input type="checkbox" checked={fixed} onChange={(e) => setFixed(e.target.checked)} /> fixed gear
        </label>
      </div>
      <div className={row}>
        <button type="button" className="deck-btn" aria-pressed={on} onClick={() => setOn(!on)}>
          {on ? "■ stop" : "▶ ride"}
        </button>
        <button
          type="button"
          className="deck-btn"
          onClick={() => snd.current?.horn(true)}
          onMouseUp={() => snd.current?.horn(false)}
        >
          🔔 bell
        </button>
        <button
          type="button"
          className="deck-btn"
          onClick={() => {
            if (st.current) st.current.gear += 1;
          }}
        >
          gear
        </button>
        <button type="button" className="deck-btn" onClick={() => hit("ground", 700)}>
          landing
        </button>
        <button type="button" className="deck-btn" onClick={() => hit("wall", 1200)}>
          knock
        </button>
      </div>
      <div className={row}>
        <span className="w-28 mono text-xs">speed {kmh} km/h</span>
        <input type="range" min={0} max={55} value={kmh} onChange={(e) => setKmh(+e.target.value)} />
      </div>
      <div className={row}>
        <label className="mono text-xs w-28">
          <input type="checkbox" checked={pedal} onChange={(e) => setPedal(e.target.checked)} /> pedalling
        </label>
        <span className="mono text-xs">cadence {cad}</span>
        <input type="range" min={20} max={140} value={cad} onChange={(e) => setCad(+e.target.value)} />
      </div>
      <div className={row}>
        {GROUNDS.map((g) => (
          <button key={g} type="button" className="deck-btn" aria-pressed={g === ground} onClick={() => setGround(g)}>
            {g}
          </button>
        ))}
      </div>
      <div className={row}>
        <span className="w-28 mono text-xs">brake {brake.toFixed(1)}</span>
        <input type="range" min={0} max={1} step={0.1} value={brake} onChange={(e) => setBrake(+e.target.value)} />
        <span className="mono text-xs">skid {skid.toFixed(1)}</span>
        <input type="range" min={0} max={6} step={0.5} value={skid} onChange={(e) => setSkid(+e.target.value)} />
      </div>
      {man &&
        Object.entries(man).map(([slot, cands]) => (
          <div key={slot} className={row}>
            <span className="w-20 mono text-xs">{slot}</span>
            {[{ name: "made in code" }, ...cands].map((c, j) => (
              <button
                key={c.name}
                type="button"
                className="deck-btn"
                aria-pressed={(picks[slot] ?? 0) === j - 1}
                title={"license" in c ? String(c.license) : ""}
                onClick={() => setPicks((p) => ({ ...p, [slot]: j - 1 }))}
              >
                {c.name}
              </button>
            ))}
          </div>
        ))}
      <div className={row}>
        <button
          type="button"
          className="deck-btn"
          onClick={() => void navigator.clipboard?.writeText(JSON.stringify(picks, null, 1))}
        >
          copy picks
        </button>
        <span className="mono text-xs" style={{ color: "var(--muted)" }}>
          → public/sfx/bikes/chosen.json
        </span>
      </div>
      <div className={row}>
        <label className="mono text-xs">
          <input type="checkbox" checked={near} onChange={(e) => setNear(e.target.checked)} /> on it (else 25 m off, to
          the right)
        </label>
      </div>
    </main>
  );
}
