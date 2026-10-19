"use client";

import { Grid, isTheme, openingsIntoWalls, screenInputToWorld, splitAll, studio } from "@yutopia/shared";
import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";
// (static, like the world page: the lazy chunks it shares — themes, items,
// people — then come out the same as the world page's, not a second copy)
import { WorldEngine } from "@/world/engine";

// Third-person demo: the Studio offline (no server), you plus a few people who
// wander and sit, seen by a three.js camera behind you — or, with V, by the
// normal iso engine at the same spot, from the same people data. Dev only (or
// a build with NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//   /dev/3p?crowd=8&hour=12&cam=chase|free|first&view=3p|iso&theme=clouds&x=&y=&yaw=&pitch=&dist=&frozen=1
//   &me=phone:text|held:mug|type|busy:coffee|emote:wave|act:highfive  (what you're doing: first person's hands)
type Tp = typeof import("@/world/tp/view");
type Demo = typeof import("@/world/tp/demo");

interface Hud {
  view: "3p" | "iso";
  cam: "chase" | "free" | "first";
  hour: number;
  lean: number;
  fps: number;
  calls: number;
  tris: number;
  build: string;
  ready: boolean;
}

export default function ThirdPersonDemo() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const tpHost = useRef<HTMLDivElement>(null);
  const isoHost = useRef<HTMLDivElement>(null);
  const api = useRef<{
    setView: (v: Hud["view"]) => void;
    setCam: (c: Hud["cam"]) => void;
    setHour: (h: number) => void;
    setLean: (l: number) => void;
  } | null>(null);
  const [hud, setHud] = useState<Hud>({
    view: "3p",
    cam: "chase",
    hour: 12,
    lean: 0.55,
    fps: 0,
    calls: 0,
    tris: 0,
    build: "",
    ready: false,
  });

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const theme = q.get("theme");
    // as the world-server loads it: doors and windows set into the walls
    const into = openingsIntoWalls(studio, splitAll(studio.objects).objects);
    const map = { ...into.map, theme: isTheme(theme) ? theme : "clouds" };
    const objects = into.objects;
    // ?slot=<track id>: a slot-car table with that track, on the first clear
    // 4 × 3 patch of floor near where you start (a look at the track in 3D)
    // ?table=pool_table|pingpong_table: the same for a game table (4 × 2)
    const slot = q.get("slot");
    const table = q.get("table");
    if (slot || table) {
      const [fw, fh] = table ? [4, 2] : [4, 3];
      const grid = Grid.from(map, objects);
      const sx = Number(q.get("x")) || map.spawn.x;
      const sy = Number(q.get("y")) || map.spawn.y;
      let best: { x: number; y: number; d: number } | null = null;
      for (let y = 1; y < map.height - fh - 1; y++)
        for (let x = 1; x < map.width - fw - 1; x++) {
          let ok = true;
          for (let dy = -1; dy <= fh && ok; dy++)
            for (let dx = -1; dx <= fw && ok; dx++)
              ok = grid.ok(x + dx, y + dy) && Math.hypot(x + dx + 0.5 - sx, y + dy + 0.5 - sy) > 1.2;
          const d = Math.hypot(x + fw / 2 - sx, y + fh / 2 - sy);
          if (ok && (!best || d < best.d)) best = { x, y, d };
        }
      if (best && table)
        objects.push({
          id: "demo-table",
          kind: table,
          x: best.x,
          y: best.y,
          rot: 0,
          props: { variant: Number(q.get("v") ?? 0) },
        });
      else if (best)
        objects.push({ id: "demo-slot", kind: "slot_track", x: best.x, y: best.y, rot: 0, props: { track: slot } });
      (window as unknown as { __demoSlot?: unknown }).__demoSlot = best;
    }
    let stop = false;
    let raf = 0;
    let iso: WorldEngine | null = null;
    let isoLoading: Promise<void> | null = null;
    const cleanup: (() => void)[] = [];
    void (async () => {
      const [{ ThirdPersonView }, { DemoWorld }, P, items, themes] = await Promise.all([
        import("@/world/tp/view") as Promise<Tp>,
        import("@/world/tp/demo") as Promise<Demo>,
        import("@/world/art/people-load").then((m) => m.loadPeople()),
        import("@/world/art/scene").then((m) => m.loadItemArt() as Promise<typeof import("@/world/art/items")>),
        import("@/world/art/themes-load").then((m) => m.loadThemes()),
      ]);
      if (stop || !tpHost.current) return;
      const demo = new DemoWorld(map, objects, Number(q.get("crowd") ?? 8));
      const x = Number(q.get("x"));
      const y = Number(q.get("y"));
      if (x && y) Object.assign(demo.me, { x, y });
      // what you're doing, held every frame (the demo's own life would change it)
      const [doing, what = ""] = (q.get("me") ?? "").split(":");
      const since = Date.now();
      const meState: Record<string, unknown> | null =
        doing === "phone"
          ? { phone: what || "text", phoneCase: "walnut" }
          : doing === "held"
            ? { held: what || "mug", heldAt: since }
            : doing === "type"
              ? { a: 2, typing: true }
              : doing === "busy"
                ? { busy: what || "coffee" }
                : doing === "emote"
                  ? { emote: what || "wave" }
                  : doing === "act"
                    ? { act: what || "wave", actAt: since }
                    : null;
      const view = new ThirdPersonView(map, objects, P, items, { theme: map.theme, themes });
      view.mount(tpHost.current);
      cleanup.push(() => view.destroy());
      const st = view.world.stats;
      let state: Hud = {
        view: q.get("view") === "iso" ? "iso" : "3p",
        cam: q.get("cam") === "free" ? "free" : q.get("cam") === "first" ? "first" : "chase",
        hour: Number(q.get("hour") ?? 12),
        lean: Number(q.get("lean") ?? 0.55),
        fps: 0,
        calls: 0,
        tris: 0,
        build: `${Math.round(st.triangles / 1000)}k tris · ${st.meshes} meshes · ${st.cards} cards · ${Math.round(st.ms)} ms`,
        ready: true,
      };
      const push = () => setHud({ ...state });
      view.setMode(state.cam);
      const quality = q.get("quality");
      if (quality === "medium" || quality === "low") view.setQuality(quality);
      view.setHour(state.hour);
      view.lean = state.lean;
      if (q.get("yaw")) view.yaw = Number(q.get("yaw"));
      if (q.get("pitch")) view.pitch = Number(q.get("pitch"));
      if (q.get("dist")) view.dist = Number(q.get("dist"));

      // the iso engine, made the first time you switch to it
      const ensureIso = () => {
        isoLoading ??= (async () => {
          if (stop || !isoHost.current) return;
          const e = new WorldEngine(map);
          await e.init(isoHost.current, { quality: "high", reducedMotion: false });
          if (stop) return e.destroy();
          e.setObjects(objects);
          e.setClock(state.hour);
          e.localId = "me";
          iso = e;
          cleanup.push(() => e.destroy());
        })();
        return isoLoading;
      };
      const setView = (v: Hud["view"]) => {
        state = { ...state, view: v };
        if (v === "iso") void ensureIso();
        push();
      };
      api.current = {
        setView,
        setCam: (c) => {
          state = { ...state, cam: c };
          view.setMode(c);
          push();
        },
        setHour: (h) => {
          state = { ...state, hour: h };
          view.setHour(h);
          iso?.setClock(h);
          push();
        },
        setLean: (l) => {
          state = { ...state, lean: l };
          view.lean = l;
          push();
        },
      };
      if (state.view === "iso") void ensureIso();
      push();

      const isoKeys = new Set<string>();
      const onKey = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement) return;
        if (e.type === "keydown") {
          isoKeys.add(e.code);
          if (e.code === "KeyV") setView(state.view === "3p" ? "iso" : "3p");
          if (e.code === "KeyC")
            api.current?.setCam(state.cam === "chase" ? "free" : state.cam === "free" ? "first" : "chase");
          if (e.code === "BracketLeft") api.current?.setHour((state.hour + 23) % 24);
          if (e.code === "BracketRight") api.current?.setHour((state.hour + 1) % 24);
        } else isoKeys.delete(e.code);
      };
      window.addEventListener("keydown", onKey);
      window.addEventListener("keyup", onKey);
      cleanup.push(() => {
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("keyup", onKey);
      });

      const frozen = q.get("frozen") === "1";
      let last = performance.now();
      let fpsT = 0;
      let frames = 0;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const now = performance.now();
        const dt = frozen ? 0 : Math.min(0.05, (now - last) / 1000);
        last = now;
        if (state.view === "3p") {
          const { move, run } = view.input();
          demo.step(dt, move, run);
          if (meState) Object.assign(demo.me, meState);
          // (an act plays again every 2.5 s, so there's always one to look at)
          if (meState?.act) Object.assign(demo.me, { actAt: Math.floor(Date.now() / 2500) * 2500 });
          view.frame(dt, demo.all(), "me");
          for (const m of demo.said.splice(0)) view.say(m.id, m.text);
        } else {
          // iso: WASD is screen-relative, as in the real client
          const k = isoKeys;
          const ix = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
          const iy = (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) - (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0);
          const run = k.has("ShiftLeft") || k.has("ShiftRight");
          demo.step(dt, screenInputToWorld(ix, iy), run);
          if (meState) Object.assign(demo.me, meState);
          if (meState?.act) Object.assign(demo.me, { actAt: Math.floor(Date.now() / 2500) * 2500 });
          if (iso)
            for (const b of demo.all())
              iso.upsertAvatar(
                b.id,
                {
                  name: b.name,
                  avatar: b.avatar,
                  x: b.x,
                  y: b.y,
                  d: b.d,
                  a: b.a,
                  status: b.status,
                  speaking: b.speaking,
                  emote: b.emote,
                  mic: b.mic,
                  held: b.held,
                  heldAt: b.heldAt,
                  ...(b.id === "me" && meState
                    ? {
                        phone: meState.phone as string | undefined,
                        phoneCase: meState.phoneCase as string | undefined,
                        busy: (meState.busy ?? (meState.typing ? "computer" : undefined)) as string | undefined,
                        act: meState.act as string | undefined,
                        actAt: (b as { actAt?: number }).actAt,
                      }
                    : {}),
                },
                b.id === "me",
              );
          for (const m of demo.said.splice(0)) iso?.say(m.id, m.text);
          iso?.update(dt);
        }
        frames++;
        fpsT += dt;
        if (fpsT >= 0.5) {
          const i = view.info();
          state = { ...state, fps: Math.round(frames / fpsT), calls: i.calls, tris: i.triangles };
          frames = 0;
          fpsT = 0;
          push();
        }
      };
      raf = requestAnimationFrame(loop);
      Object.assign(window as object, { __tp: { view, demo, api: api.current, iso: () => iso } });
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      for (const c of cleanup.reverse()) c();
    };
  }, []);

  const a = api.current;
  return (
    <main className="fixed inset-0 overflow-hidden bg-[#17110d] text-[#f3e7d3]">
      <div ref={tpHost} className="absolute inset-0" style={{ visibility: hud.view === "3p" ? "visible" : "hidden" }} />
      <div
        ref={isoHost}
        className="absolute inset-0"
        style={{ visibility: hud.view === "iso" ? "visible" : "hidden" }}
      />
      <div className="absolute top-3 left-3 w-[300px] max-w-[calc(100vw-24px)] rounded-xl bg-black/60 p-3 text-xs leading-relaxed backdrop-blur">
        <div className="mb-2 font-semibold text-sm">Third person · demo</div>
        {!hud.ready && <div>Building the Studio in 3D…</div>}
        {hud.ready && (
          <>
            <Row label="View">
              <Seg on={hud.view === "3p"} onClick={() => a?.setView("3p")}>
                3rd person
              </Seg>
              <Seg on={hud.view === "iso"} onClick={() => a?.setView("iso")}>
                Iso
              </Seg>
            </Row>
            <Row label="Camera">
              <Seg on={hud.cam === "chase"} onClick={() => a?.setCam("chase")}>
                Chase
              </Seg>
              <Seg on={hud.cam === "free"} onClick={() => a?.setCam("free")}>
                Free orbit
              </Seg>
              <Seg on={hud.cam === "first"} onClick={() => a?.setCam("first")}>
                First person
              </Seg>
            </Row>
            <Row label={`Hour ${String(Math.floor(hud.hour)).padStart(2, "0")}:00`}>
              <input
                type="range"
                min={0}
                max={23}
                value={hud.hour}
                onChange={(e) => a?.setHour(Number(e.target.value))}
                className="w-full"
              />
            </Row>
            <Row label={`People lean ${Math.round(hud.lean * 100)}%`}>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(hud.lean * 100)}
                onChange={(e) => a?.setLean(Number(e.target.value) / 100)}
                className="w-full"
              />
            </Row>
            <div className="mt-2 opacity-80">
              WASD move · Shift run · drag / Q E look · wheel zoom · C camera · V iso · [ ] hour
            </div>
            <div className="mt-1 font-mono opacity-60">
              {hud.fps} fps · {hud.calls} calls · {Math.round(hud.tris / 1000)}k tris
              <br />
              {hud.build}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <div className="w-[92px] shrink-0 opacity-75">{label}</div>
      <div className="flex flex-1 gap-1">{children}</div>
    </div>
  );
}

function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md px-2 py-1 ${on ? "bg-[#e8a33d] text-[#2a1a12]" : "bg-white/10 hover:bg-white/20"}`}
    >
      {children}
    </button>
  );
}
