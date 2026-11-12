"use client";

import { DEFAULT_AVATAR } from "@yutopia/shared";
import { AIM_BLADE } from "@yutopia/shared/beam";
import { packMv } from "@yutopia/shared/move";
import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Dev only: the revolver's bench (docs/plan/80-the-revolver.md, F6a). The game's own person (tp/person3d.ts,
// the life look) with the life revolver in her hand, as the world draws her: the low ready, the aim (its
// pitch), the torch, running; the reload scrubbed. Turn round her (drag, the wheel), or a view by key. The
// hold's checks read out each frame (Person3D.revolverCheck): the gun's lean off upright, the barrel off
// the look, the left fingers against the right hand and the grip, each wrist short of its place or past
// its reach.
//   /dev/revolver?pose=aim&pitch=0.3&torch=1&view=side&run=0&t=0.5&gender=masculine
// Keys: 1–7 the views (side, left, front, back, shoulder, hands, hands-left) · A aim · T the torch
// window.__revolver = { ready, check(), set({...}) } for the checks (e2e/revolver-bench.mts).

const VIEWS = ["side", "left", "front", "back", "shoulder", "hands", "hands-left"] as const;
type View = (typeof VIEWS)[number];
type Pose = "ready" | "aim" | "reload";
interface State {
  pose: Pose;
  pitch: number;
  torch: boolean;
  run: number;
  /** the reload scrubbed, 0..1 (the server's three steps: open, load, shut) */
  t: number;
  view: View;
}

// (references to key from — linked, not copied: docs/plan/80-the-revolver.md)
const REFS: [string, string][] = [
  ["Miculek's slow speedloader reload", "https://www.youtube.com/watch?v=0FbUMqoyjDw"],
  ["AW2's weapons (80.lv)", "https://80.lv/articles/"],
  ["RE4 Remake: the low ready", "https://www.google.com/search?q=re4+remake+leon+low+ready&tbm=isch"],
];

export default function RevolverPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const [q, setQ] = useState<URLSearchParams | null>(null);
  useEffect(() => setQ(new URLSearchParams(window.location.search)), []);
  return q ? <Bench q={q} /> : null;
}

function Bench({ q }: { q: URLSearchParams }) {
  const host = useRef<HTMLDivElement>(null);
  const [st, setSt] = useState<State>({
    pose: (q.get("pose") as Pose) ?? "ready",
    pitch: Number(q.get("pitch") ?? 0),
    torch: q.get("torch") === "1",
    run: Number(q.get("run") ?? 0),
    t: Number(q.get("t") ?? 0.5),
    view: (q.get("view") as View) ?? "side",
  });
  const live = useRef(st);
  live.current = st;
  const orbit = useRef<{ yaw: number; pitch: number; dist: number } | null>(null);
  const [check, setCheck] = useState<string>("loading…");

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let stop = false;
    let cleanup = () => {};
    (async () => {
      const T = await import("three");
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      const { loadChars } = await import("@/world/art/chars-load");
      const { litMaterial, setLifeEnv, adoptLife } = await import("@/world/look/lit");
      const { yuLit } = await import("@/world/look/yulit");
      const { setLifeTone } = await import("@/world/look/life-tone");
      const { loadLifeGLTF } = await import("@/world/look/life-assets");
      const { Person3D } = await import("@/world/tp/person3d");
      const C = await loadChars();
      if (stop) return;
      const W = el.clientWidth;
      const H = el.clientHeight;
      const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(W, H);
      renderer.shadowMap.enabled = true;
      el.appendChild(renderer.domElement);
      setLifeTone(renderer);
      C.setLifeHost({ renderer, lit: (m, base) => yuLit(m, { base }) });
      const scene = new T.Scene();
      scene.background = new T.Color("#9aa0a8");
      const pm = new T.PMREMGenerator(renderer);
      const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      setLifeEnv(env, 0.6);
      scene.add(new T.HemisphereLight("#dfe8f5", "#8a7563", 1.3));
      const sun = new T.DirectionalLight("#fff4e6", 2.2);
      sun.position.set(-2, 5, 3);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2 });
      scene.add(sun, sun.target);
      const floor = new T.Mesh(new T.PlaneGeometry(40, 40), new T.MeshLambertMaterial({ color: "#b9bcc0" }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);
      const grid = new T.GridHelper(10, 20, "#8d9096", "#a6a9ae");
      grid.position.y = 0.001;
      scene.add(grid);

      // the person's materials, as the view makes them (tp/view.ts chars())
      const body = litMaterial({ vertexColors: true });
      const NO = new T.MeshBasicMaterial({ visible: false });
      const props = new Map<string, InstanceType<typeof T.Material>>();
      const guns = new Map<string, InstanceType<typeof T.Object3D> | "loading">();
      const mats = {
        body,
        bodyAway: body,
        ink: NO,
        inkAway: NO,
        prop: (color: string) => {
          let m = props.get(color);
          if (!m) {
            m = new T.MeshLambertMaterial(color === "vertex" ? { vertexColors: true } : { color });
            props.set(color, m);
          }
          return m;
        },
        gun: (kind: string) => {
          const have = guns.get(kind);
          if (have === undefined) {
            guns.set(kind, "loading");
            void loadLifeGLTF(renderer, `/life/guns/${kind}.glb`).then((g) => {
              g.scene.traverse((o) => {
                const m = (o as InstanceType<typeof T.Mesh>).material as InstanceType<typeof T.MeshStandardMaterial>;
                if (m?.isMeshStandardMaterial) adoptLife(m);
              });
              guns.set(kind, g.scene);
            });
            return null;
          }
          return have === "loading" ? null : have;
        },
      };
      const gender = q.get("gender") ?? "feminine";
      const avatar = {
        ...DEFAULT_AVATAR,
        gender,
        hair: gender === "masculine" ? "short" : "bob",
        top: "coat",
        topColor: "#3d4a5c",
        bottom: "jeans",
        bottomColor: "#2a2f3a",
      } as typeof DEFAULT_AVATAR;
      const p = {
        name: "Ana",
        avatar,
        x: 0,
        y: 0,
        angle: Math.PI / 2, // (facing +z)
        a: 0,
        gun: "revolver",
        mv: packMv("still"),
        pitch: 0,
        torch: false,
      };
      const person = new Person3D("bench", C, new C.CharFactory(), mats, p as never);
      scene.add(person.root);
      const cam = new T.PerspectiveCamera(35, W / H, 0.02, 60);

      // the views: [yaw about her (0: from her front; π/2: from her right), pitch, distance, look-at height]
      const VIEW: Record<View, [number, number, number, number]> = {
        side: [-Math.PI / 2, 0.08, 2.6, 1.15],
        left: [Math.PI / 2, 0.08, 2.6, 1.15],
        front: [0, 0.1, 2.6, 1.15],
        back: [Math.PI, 0.1, 2.6, 1.15],
        shoulder: [Math.PI, 0.18, 1.6, 1.5],
        hands: [-0.9, 0.25, 0.75, 0],
        "hands-left": [0.9, 0.25, 0.75, 0],
      };
      const gunAt = new T.Vector3();
      let lastView: View | null = null;
      const place = () => {
        const s = live.current;
        if (s.view !== lastView) {
          lastView = s.view;
          const [yaw, pitch, dist] = VIEW[s.view];
          orbit.current = { yaw, pitch, dist };
        }
        const o = orbit.current ?? { yaw: 0, pitch: 0.1, dist: 2.6 };
        const [, , , h] = VIEW[s.view];
        // (the close views look at the gun; the rest at her chest)
        const g = (person as unknown as { gun: { model: { root: InstanceType<typeof T.Object3D> } } | null }).gun;
        const at =
          h === 0 && g
            ? g.model.root.getWorldPosition(gunAt)
            : s.view === "shoulder"
              ? gunAt.set(-0.62, 1.45, 3)
              : gunAt.set(0, h, 0);
        // (the game's: over her right shoulder, looking ahead, its wider lens)
        const fov = s.view === "shoulder" ? 55 : 35;
        if (cam.fov !== fov) {
          cam.fov = fov;
          cam.updateProjectionMatrix();
        }
        if (s.view === "shoulder") {
          // (it turns with her look: aiming, AIM_BLADE left of the way her feet face)
          const yaw = s.pose === "aim" ? AIM_BLADE : 0;
          const ax = Math.sin(yaw);
          const az = Math.cos(yaw);
          // (her right: −x turned with it)
          cam.position.set(-az * 0.62 - ax * 1.5, 1.72, ax * 0.62 - az * 1.5);
          cam.lookAt(cam.position.x + ax * 5, 1.45, cam.position.z + az * 5);
          return;
        }
        cam.position.set(
          at.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist,
          at.y + Math.sin(o.pitch) * o.dist,
          at.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist,
        );
        cam.lookAt(at);
      };

      // the person as the state has her: aiming, its pitch, the torch, running, the reload scrubbed
      const fx = { kick: 0, cock: 1, turn: 0, open: 0, loaded: 6, trigger: 0, reload: 0 };
      const apply = () => {
        const s = live.current;
        const aim = s.pose === "aim";
        p.mv = packMv(s.run > 0.5 ? "sprint" : s.run > 0 ? "jog" : aim ? "aim" : "still", false, aim);
        p.pitch = aim ? s.pitch : 0;
        p.torch = s.torch;
        // (the reload: open 0–0.3, the loader 0.3–0.8, shut 0.8–1 — the server's steps as F4a retimes them)
        const t = s.t;
        const reload = s.pose === "reload";
        fx.reload = reload ? 1 : 0;
        fx.open = reload ? (t < 0.3 ? t / 0.3 : t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2) : 0;
        fx.loaded = reload && t < 0.55 ? 0 : 6;
        (person as unknown as { gunFx: typeof fx | null }).gunFx = fx;
      };
      const seen = { camX: 0, camZ: 2, onScreen: true, lowQuality: false, mood: 0 };
      let raf = 0;
      let last = performance.now();
      let n = 0;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        apply();
        person.update(p as never, dt, seen);
        place();
        renderer.render(scene, cam);
        if (++n % 10 === 0) {
          const c = person.revolverCheck(p as never);
          setCheck(
            c
              ? [
                  `upright: ${deg(c.cant)}° off · barrel off the look: ${deg(c.off)}°`,
                  `left fingers to the right hand: ${cm(c.hands)} · to the grip: ${cm(c.grip)}`,
                  `right wrist: ${cm(c.R.short)} short, ${deg(c.R.over)}° past · left: ${cm(c.L.short)} short, ${deg(c.L.over)}° past`,
                  c.held ? "the hold: plan 80" : "the hold: off (the old hands)",
                ].join("\n")
              : person.ready
                ? "no life revolver in hand yet…"
                : "loading her…",
          );
        }
      };
      tick();
      (window as unknown as Record<string, unknown>).__revolver = {
        get ready() {
          return person.ready && !!person.revolverCheck(p as never);
        },
        check: () => person.revolverCheck(p as never),
        person,
        set: (s: Partial<State>) => {
          live.current = { ...live.current, ...s };
          setSt(live.current);
        },
      };

      // turn round her: drag, the wheel
      let drag: { x: number; y: number } | null = null;
      const down = (e: PointerEvent) => {
        drag = { x: e.clientX, y: e.clientY };
      };
      const move = (e: PointerEvent) => {
        if (!drag || !orbit.current) return;
        orbit.current.yaw -= (e.clientX - drag.x) * 0.008;
        orbit.current.pitch = Math.max(-0.6, Math.min(1.3, orbit.current.pitch + (e.clientY - drag.y) * 0.006));
        drag = { x: e.clientX, y: e.clientY };
      };
      const up = () => {
        drag = null;
      };
      const wheel = (e: WheelEvent) => {
        if (orbit.current) orbit.current.dist = Math.max(0.3, Math.min(8, orbit.current.dist * (1 + e.deltaY * 0.001)));
      };
      const cv = renderer.domElement;
      cv.addEventListener("pointerdown", down);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      cv.addEventListener("wheel", wheel, { passive: true });
      cleanup = () => {
        cancelAnimationFrame(raf);
        cv.removeEventListener("pointerdown", down);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        cv.removeEventListener("wheel", wheel);
        renderer.dispose();
        cv.remove();
      };
    })();
    return () => {
      stop = true;
      cleanup();
    };
  }, [q]);

  // keys
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      if (i >= 0 && i < VIEWS.length) setSt((s) => ({ ...s, view: VIEWS[i] }));
      else if (e.key === "a") setSt((s) => ({ ...s, pose: s.pose === "aim" ? "ready" : "aim" }));
      else if (e.key === "t") setSt((s) => ({ ...s, torch: !s.torch }));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const set = (s: Partial<State>) => setSt((o) => ({ ...o, ...s }));
  const row: React.CSSProperties = { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" };
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", font: "13px system-ui", color: "#1d2026" }}>
      <div ref={host} style={{ flex: 1, position: "relative" }} />
      <div
        style={{
          width: 300,
          padding: 12,
          background: "#eef0f2",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          overflowY: "auto",
        }}
      >
        <b>The revolver — plan 80</b>
        <div style={row}>
          {(["ready", "aim", "reload"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => set({ pose: k })}
              style={{ fontWeight: st.pose === k ? 700 : 400 }}
            >
              {k}
            </button>
          ))}
        </div>
        <label style={row}>
          <input type="checkbox" checked={st.torch} onChange={(e) => set({ torch: e.target.checked })} /> the torch
        </label>
        <label style={row}>
          aim pitch {st.pitch.toFixed(2)}
          <input
            type="range"
            min={-0.9}
            max={0.9}
            step={0.01}
            value={st.pitch}
            onChange={(e) => set({ pitch: Number(e.target.value) })}
          />
        </label>
        <label style={row}>
          running {st.run.toFixed(2)}
          <input
            type="range"
            min={0}
            max={1}
            step={0.5}
            value={st.run}
            onChange={(e) => set({ run: Number(e.target.value) })}
          />
        </label>
        <label style={row}>
          reload {st.t.toFixed(2)}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={st.t}
            onChange={(e) => set({ t: Number(e.target.value) })}
          />
        </label>
        <div style={row}>
          {VIEWS.map((v, i) => (
            <button
              key={v}
              type="button"
              onClick={() => set({ view: v })}
              style={{ fontWeight: st.view === v ? 700 : 400 }}
            >
              {i + 1} {v}
            </button>
          ))}
        </div>
        <pre id="check" style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 12, background: "#fff", padding: 8 }}>
          {check}
        </pre>
        <div>
          <b>References</b>
          {REFS.map(([t, u]) => (
            <div key={u}>
              <a href={u} target="_blank" rel="noreferrer">
                {t}
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const deg = (r: number) => ((r * 180) / Math.PI).toFixed(1);
const cm = (m: number | null) => (m === null ? "–" : `${(m * 100).toFixed(1)} cm`);
