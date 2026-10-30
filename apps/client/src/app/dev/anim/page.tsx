"use client";

import { DEFAULT_AVATAR } from "@yutopia/shared";
import { notFound } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Ctx, clipList, type Frame, limp, POP_RATE, pops, RATE, tabulate } from "./clips";

// Dev-only: the animation bench (docs/plan/58-the-animation.md, phase 2). Any animation by name,
// scrubbed, slowed, looped and onion-skinned; before and after side by side; on a ground grid,
// with each foot's time on the ground and its slide there shown, and pops flagged.
//   /dev/anim?clip=jog&live=1&compare=1&onion=3&speed=0.25&view=side&t=0.4&tension=0&play=0
// Keys: Space play · ← → a frame · [ ] slower / faster · O onion · C compare · L live / raw ·
// 1–5 the view (side, front, back, ¾, above)

const LOOK = {
  ...DEFAULT_AVATAR,
  skin: "#c68a5e",
  hair: "bob",
  hairColor: "#3b2a20",
  top: "tee",
  topColor: "#e8703a",
  bottom: "jeans",
  bottomColor: "#2f3f6a",
  shoesColor: "#2fb3a0",
  gender: "neutral" as const,
};
const VIEWS = ["side", "front", "back", "three-quarter", "above"] as const;
type View = (typeof VIEWS)[number];
const SPEEDS = [0.05, 0.1, 0.25, 0.5, 1];
/** a foot on the ground sliding faster than this (m/s) is flagged */
const SLIDE_LIMIT = 0.1;
const GHOST_GAP = 1 / 20;

interface Feet {
  /** per frame, per foot (L, R): on the ground, and its slide there (m/s) */
  down: [boolean, boolean][];
  slide: [number, number][];
  /** where each foot was while down, for its trail on the ground */
  trail: number[];
  /** the deepest a foot went into the floor (m) */
  sunk: number;
}

export default function AnimPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const [q, setQ] = useState<URLSearchParams | null>(null);
  useEffect(() => setQ(new URLSearchParams(window.location.search)), []);
  return q ? <Bench q={q} /> : null;
}

// (the look from the query: &top=tank&bottom=skirt&hair=long…)
const lookOf = (q: URLSearchParams) => {
  const a: Record<string, string> = { ...LOOK };
  for (const k of Object.keys(DEFAULT_AVATAR)) {
    const v = q.get(k);
    if (v) a[k] = v.startsWith("%23") || /^[0-9a-f]{6}$/i.test(v) ? `#${v.replace("%23", "")}` : v;
  }
  return a as unknown as typeof LOOK;
};

function Bench({ q }: { q: URLSearchParams }) {
  const clips = useMemo(clipList, []);
  const look = useMemo(() => lookOf(q), [q]);
  const [clipName, setClipName] = useState(q.get("clip") ?? "jog");
  const clip = clips.find((c) => c.name === clipName) ?? clips[0];
  const [live, setLive] = useState(q.get("live") === "1" || (!clip.raw && !!clip.live));
  const [compare, setCompare] = useState(q.get("compare") !== "0");
  const [onion, setOnion] = useState(Number(q.get("onion") ?? 0));
  const [speed, setSpeed] = useState(Number(q.get("speed") ?? 1));
  const [playing, setPlaying] = useState(q.get("play") !== "0" && q.get("t") === null);
  const [view, setView] = useState<View>((q.get("view") as View) ?? "side");
  const [tension, setTension] = useState(Number(q.get("tension") ?? 0));
  const [trail, setTrail] = useState(q.get("trail") !== "0");
  const [t, setT] = useState(Number(q.get("t") ?? 0));
  const [report, setReport] = useState<{ pops: { t: number; what: string }[]; feet: Feet | null; len: number }>({
    pops: [],
    feet: null,
    len: clip.len,
  });
  const live_ = live && !!clip.live ? true : !clip.raw;

  const host = useRef<HTMLDivElement>(null);
  const lane = useRef<HTMLCanvasElement>(null);
  // what the render loop reads (set from the state, never through React in the loop)
  const st = useRef({ t, playing, speed, onion, compare, view, trail, clip, live: live_, tension });
  st.current = { ...st.current, playing, speed, onion, compare, view, trail, clip, live: live_, tension };
  const seek = useRef<number | null>(null);
  const bench = useRef<{
    x: Ctx | null;
    after: Frame[] | null;
    before: Frame[] | null;
    feet: Feet | null;
    key: string;
    redo: () => void;
  }>({ x: null, after: null, before: null, feet: null, key: "", redo: () => {} });

  // ── the scene: once
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let stop = false;
    let cleanup = () => {};
    (async () => {
      const T = await import("three");
      const C = await import("@/world/chars");
      const H = await C.loadHero();
      if (stop) return;
      const W = el.clientWidth;
      const Hh = el.clientHeight;
      const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(W, Hh);
      renderer.setClearColor("#e9e2d2");
      renderer.shadowMap.enabled = true;
      el.appendChild(renderer.domElement);
      C.inkResolution(W, Hh);
      const scene = new T.Scene();
      const sun = new T.DirectionalLight("#ffffff", 2);
      sun.position.set(-3, 6, 4);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
      scene.add(sun, sun.target);
      const floor = new T.Mesh(
        new T.PlaneGeometry(400, 400),
        new T.ShadowMaterial({ color: "#3a4a78", opacity: 0.22 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);
      // the ground grid: every half metre, every metre darker
      const grid = new T.GridHelper(200, 400, "#9c917c", "#cfc5b0");
      grid.position.y = 0.001;
      scene.add(grid);
      const cam = new T.PerspectiveCamera(24, W / Hh, 0.05, 300);

      const f = new C.CharFactory();
      const after = new C.PersonModel(f, look, 0);
      const before = new C.PersonModel(f, { ...look, topColor: "#8a8f9c" }, 0);
      scene.add(after.root, before.root);
      // the onion: ghosts of the moments before, fading
      const ghostMats: InstanceType<typeof T.MeshBasicMaterial>[] = [];
      const hidden = new T.MeshBasicMaterial({ visible: false });
      const ghosts = Array.from({ length: 6 }, (_, i) => {
        const g = new C.PersonModel(f, look, 1);
        const m = new T.MeshBasicMaterial({
          color: "#4a5bd6",
          transparent: true,
          opacity: 0.26 * (1 - i / 7),
          depthWrite: false,
        });
        ghostMats.push(m);
        g.setMaterials(m, hidden);
        scene.add(g.root);
        return g;
      });
      // the feet's trail on the ground: where each foot was while down
      const trailGeo = new T.BufferGeometry();
      const trailPts = new T.Points(trailGeo, new T.PointsMaterial({ color: "#2b7a4b", size: 0.025 }));
      scene.add(trailPts);
      const v = new T.Vector3();

      const place = (m: InstanceType<typeof C.PersonModel>, fr: Frame, dx: number, dz = 0) => {
        m.root.position.set(fr.root.x + dx, fr.root.y, fr.root.z + dz);
        m.root.rotation.y = fr.root.yaw;
        m.setPose(fr.pose, fr.lift, fr.reach);
        m.handsTo(fr.hands ?? null);
        m.setFace(fr.blink, 0);
        m.setEyes(fr.eyes[0], fr.eyes[1]);
      };
      // the feet: posed frame by frame, each ankle read where it is
      // (4f: a clip's own ground — a ramp, stairs — drawn as a heightfield over the floor)
      let land: InstanceType<typeof T.Mesh> | null = null;
      const showGround = (G?: (x: number, z: number) => number) => {
        if (land) {
          scene.remove(land);
          land.geometry.dispose();
          land = null;
        }
        if (!G) return;
        const geo = new T.PlaneGeometry(6, 16, 60, 800);
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, 0, 6);
        const at = geo.getAttribute("position");
        for (let i = 0; i < at.count; i++) at.setY(i, G(at.getX(i), at.getZ(i)) + 0.002);
        geo.computeVertexNormals();
        land = new T.Mesh(geo, new T.MeshLambertMaterial({ color: "#d8cdb6" }));
        land.receiveShadow = true;
        scene.add(land);
      };
      const propMeshes: InstanceType<typeof T.Mesh>[] = [];
      const propMat = new T.MeshLambertMaterial({ color: "#a39a88" });
      // (5c: a clip's pole, swung round)
      const pole = new T.Mesh(
        new T.CylinderGeometry(0.06, 0.06, 3, 12),
        new T.MeshLambertMaterial({ color: "#7a7f86" }),
      );
      pole.visible = false;
      scene.add(pole);
      const feetOf = (frames: Frame[], G?: (x: number, z: number) => number): Feet => {
        // each foot's two contacts, frame by frame: the ankle (its heel down) and the ball (the toe's
        // joint: up on its toes — a sprinter's ankle never comes down), over the ground
        const pts: number[][] = [];
        for (const fr of frames) {
          place(after, fr, 0);
          after.root.updateMatrixWorld(true);
          for (const S of ["L", "R"] as const) {
            const an = after.bone(`ankle${S}`);
            const toe = after.bone(`toe${S}`);
            if (!an || !toe) return { down: [], slide: [], trail: [], sunk: 0 };
            // (over the ground under each: the clip's own, else the body's)
            an.getWorldPosition(v);
            const ax = v.x;
            const ay = v.y - (G ? G(v.x, v.z) : fr.root.y);
            const az = v.z;
            toe.getWorldPosition(v);
            pts.push([ax, ay, az, v.x, v.y - (G ? G(v.x, v.z) : fr.root.y), v.z]);
          }
        }
        // (down: within 5 mm of where each is standing at rest, or under it — a foot pushed into the
        // floor counts, and how far it went is kept)
        const rest = { pose: { ...C.REST }, lift: [0, 0, 0] as [number, number, number] };
        place(
          after,
          { pose: rest.pose, lift: rest.lift, root: { x: 0, y: 0, z: 0, yaw: 0 }, eyes: [0, 0], blink: 0 },
          0,
        );
        after.root.updateMatrixWorld(true);
        after.bone("ankleL")?.getWorldPosition(v);
        const lowAnkle = v.y;
        after.bone("toeL")?.getWorldPosition(v);
        const lowBall = v.y;
        let sunk = 0;
        const down: [boolean, boolean][] = [];
        const slide: [number, number][] = [];
        const trail: number[] = [];
        // (which contact: the heel's when it's down, else the ball's)
        const contact = (q: number[]) => (q[1] < lowAnkle + 0.005 ? [q[0], q[2]] : [q[3], q[5]]);
        for (let i = 0; i < frames.length; i++) {
          const d: [boolean, boolean] = [false, false];
          const s: [number, number] = [0, 0];
          for (let k = 0; k < 2; k++) {
            const q = pts[i * 2 + k];
            const heel = q[1] < lowAnkle + 0.005;
            const ball = q[4] < lowBall + 0.005;
            d[k] = heel || ball;
            if (heel) sunk = Math.max(sunk, lowAnkle - q[1]);
            if (ball) sunk = Math.max(sunk, lowBall - q[4]);
            // (its slide once it's down: from its second frame there — touching down, a foot's still
            // braking from its swing)
            // (the same contact both frames: the heel's handing on to the ball isn't a slide)
            const was = pts[(i - 1 + (i > 0 ? 0 : 1)) * 2 + k];
            const same = i > 0 && was[1] < lowAnkle + 0.005 === heel;
            if (d[k] && same && i > 1 && down[i - 1][k] && down[i - 2][k]) {
              const [x0, z0] = contact(was);
              const [x1, z1] = contact(q);
              s[k] = Math.hypot(x1 - x0, z1 - z0) * RATE;
            }
            if (d[k]) {
              const [x1, z1] = contact(q);
              trail.push(x1, 0.004, z1);
            }
          }
          down.push(d);
          slide.push(s);
        }
        return { down, slide, trail, sunk };
      };

      // (&gait=bouncy: the walk's style, plan 58 4e)
      const x: Ctx = { C, H, T: 0, gait: q.get("gait") ?? undefined };
      bench.current.x = x;
      bench.current.redo = () => {
        const s = st.current;
        x.T = s.tension;
        const key = `${s.clip.name}|${s.live}|${s.tension}`;
        if (bench.current.key === key) return;
        bench.current.key = key;
        bench.current.after = tabulate(x, s.clip, "after", s.live);
        ragDone = false;
        bench.current.before = tabulate(x, s.clip, "before", s.live);
        bench.current.feet = null;
        showGround(s.clip.ground);
        pole.visible = !!s.clip.pole;
        // (6: the clip's things — a seat, a desk)
        for (const b of propMeshes.splice(0)) {
          scene.remove(b);
          b.geometry.dispose();
        }
        for (const b of s.clip.props ?? []) {
          const mesh = new T.Mesh(new T.BoxGeometry(b.hx * 2, b.hy * 2, b.hz * 2), propMat);
          mesh.position.set(b.x, b.y, b.z);
          mesh.castShadow = mesh.receiveShadow = true;
          scene.add(mesh);
          propMeshes.push(mesh);
        }
        if (s.clip.pole) pole.position.set(s.clip.pole[0], 1.5, s.clip.pole[1]);
        // (pops on their own fine table)
        setReport({ pops: pops(tabulate(x, s.clip, "after", s.live, POP_RATE) ?? []), feet: null, len: s.clip.len });
      };

      let ragDone = false;
      let puffs: InstanceType<NonNullable<ReturnType<typeof C.lifeNow>>["Puffs"]> | null = null;
      let ragWorld: import("@yutopia/shared/physics").PhysicsWorld | null = null;
      let raf = 0;
      let last = performance.now();
      const frame = (now: number) => {
        f.pump(1000);
        const ready = after.update() && before.update() && ghosts.every((g) => g.update());
        const s = st.current;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        bench.current.redo();
        const A = bench.current.after;
        // (5d: a limp clip's ragdoll worked out on Jolt with her own model, once it's built)
        if (ready && A && s.clip.rag && !ragDone) {
          ragDone = true;
          const clip = s.clip;
          void (async () => {
            const P = await import("@yutopia/shared/physics");
            ragWorld ??= await P.PhysicsWorld.create(P.loadJolt, P.sizesFor({ statics: 8, things: 32 }));
            const w = ragWorld;
            w.remove("ledge");
            if (clip.rag?.solids) w.setStatic("ledge", clip.rag.solids);
            if (!w.has("land"))
              w.setLand("land", { x0: -40, z0: -40, n: 161, step: 0.5, h: new Float32Array(161 * 161) });
            w.settle();
            const air = C.airNow();
            if (!air || st.current.clip !== clip || bench.current.after !== A) return;
            limp(A, clip, after, w, air);
            bench.current.feet = null;
          })();
        }
        if (ready && A) {
          // the feet, once the model's built (they're read off its bones)
          if (!bench.current.feet) {
            bench.current.feet = feetOf(A, st.current.clip.ground);
            const feet = bench.current.feet;
            setReport((r) => ({ ...r, feet }));
            trailGeo.setAttribute("position", new T.Float32BufferAttribute(feet.trail, 3));
          }
          if (seek.current !== null) {
            s.t = seek.current;
            seek.current = null;
          } else if (s.playing) s.t = (s.t + dt * s.speed) % s.clip.len;
          const i = Math.min(A.length - 1, Math.round(s.t * RATE));
          const B = bench.current.before;
          const gap = s.compare && B ? 0.62 : 0;
          // the camera on the body, from the view's side; before and after side by side across it
          const r = A[i].root;
          const cx = r.x;
          const cz = r.z;
          // (&zoom=3&at=1.0: closer, on that height — the hands, the feet)
          const zoom = Number(q.get("zoom") ?? 1);
          const lookY = Number(q.get("at") ?? 0.62);
          // (&ahead=0.4: aimed that far ahead of the body, along its facing)
          const fwd = Number(q.get("ahead") ?? 0);
          const d = (4.2 + gap * 2) / zoom;
          const [ox, oz] = {
            side: [d, 0],
            front: [0, d],
            back: [0, -d],
            "three-quarter": [d * 0.72, d * 0.72],
            above: [0, d],
          }[s.view];
          // (across the view: after on the left of the picture, before on the right)
          const ax = (-oz / d) * gap;
          const az = (ox / d) * gap;
          // (6d: a pair's other one where they stand, facing her — not beside her)
          const two = !!s.clip.pair;
          place(after, A[i], two ? 0 : ax, two ? 0 : az);
          before.root.visible = !!((s.compare || two) && B);
          if (B && (s.compare || two)) place(before, B[Math.min(B.length - 1, i)], two ? 0 : -ax, two ? 0 : -az);
          // (the springs swing as it plays; scrubbed, they hold)
          const sdt = s.playing ? dt * s.speed : 0;
          // (9: the breath a puff in the cold air)
          const L9 = C.lifeNow();
          if (L9 && A[i].cold) {
            puffs ??= new L9.Puffs(scene);
            after.root.updateMatrixWorld(true);
            const head = after.bone("head");
            if (head) {
              const ahead9 = new T.Vector3(0, 0, 1).applyQuaternion(after.root.quaternion);
              const mouth = head
                .getWorldPosition(new T.Vector3())
                .addScaledVector(ahead9, 0.1)
                .add(new T.Vector3(0, 0.04, 0));
              puffs.update(sdt, mouth, ahead9, A[i].breath ?? 0, A[i].cold ?? 0);
            }
          }
          after.step(sdt);
          before.step(sdt);
          ghosts.forEach((g, k) => {
            g.root.visible = k < s.onion;
            if (k >= s.onion) return;
            const j = Math.round((s.t - (k + 1) * GHOST_GAP) * RATE);
            place(g, A[((j % A.length) + A.length) % A.length], ax, az);
          });
          trailPts.visible = s.trail;
          trailPts.position.set(ax, 0, az);
          if (s.view === "above") {
            cam.position.set(cx, 6.5, cz + 0.5);
            cam.lookAt(cx, 0, cz);
          } else {
            const fx = Math.sin(r.yaw) * fwd;
            const fz = Math.cos(r.yaw) * fwd;
            // (on a clip's own ground — stairs, a ramp — up and down with her; a jump's arc it doesn't)
            const ry = s.clip.ground ? r.y : 0;
            cam.position.set(cx + fx + ox, ry + lookY + 0.38 / zoom, cz + fz + oz);
            cam.lookAt(cx + fx, ry + lookY, cz + fz);
          }
          sun.position.set(cx - 3, 6, cz + 4);
          sun.target.position.set(cx, 0, cz);
          setT(s.t);
          drawLane(lane.current, s.t, s.clip.len, bench.current.feet, report_.current);
        }
        renderer.render(scene, cam);
        (window as unknown as { __anim: unknown }).__anim = {
          ready: !!(ready && A && bench.current.feet),
          t: s.t,
          clips: clips.map((c) => c.name),
          report: () => ({
            pops: report_.current.length,
            popsAt: report_.current,
            feet: summary(bench.current.feet),
          }),
          bench: bench.current,
          // (a still at a moment: e2e/anim-strip.mts)
          seek: (to: number) => {
            st.current.t = to;
          },
        };
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      cleanup = () => {
        cancelAnimationFrame(raf);
        after.dispose();
        before.dispose();
        for (const g of ghosts) g.dispose();
        for (const m of ghostMats) m.dispose();
        hidden.dispose();
        trailGeo.dispose();
        f.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();
    return () => {
      stop = true;
      cleanup();
    };
  }, [clips, look]);

  const report_ = useRef(report.pops);
  report_.current = report.pops;

  // the keys
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "SELECT" || (e.target as HTMLElement).tagName === "INPUT") return;
      const s = st.current;
      if (e.code === "Space") setPlaying((p) => !p);
      else if (e.code === "ArrowRight" || e.code === "ArrowLeft") {
        setPlaying(false);
        seek.current = (s.t + (e.code === "ArrowRight" ? 1 : -1) / 60 + s.clip.len) % s.clip.len;
      } else if (e.code === "BracketLeft") setSpeed((v) => SPEEDS[Math.max(0, SPEEDS.indexOf(v) - 1)] ?? 0.25);
      else if (e.code === "BracketRight")
        setSpeed((v) => SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(v) + 1)] ?? 1);
      else if (e.code === "KeyO") setOnion((n) => (n === 0 ? 3 : n === 3 ? 6 : 0));
      else if (e.code === "KeyC") setCompare((c) => !c);
      else if (e.code === "KeyL") setLive((l) => !l);
      else if (/^Digit[1-5]$/.test(e.code)) setView(VIEWS[Number(e.code.slice(5)) - 1]);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  // a click or a drag on the timeline: there
  const scrub = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons === 0 && e.type !== "pointerdown") return;
    const r = e.currentTarget.getBoundingClientRect();
    setPlaying(false);
    seek.current = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * clip.len * 0.9999;
  };

  const groups = [...new Set(clips.map((c) => c.group))];
  const sum = summary(report.feet);
  const nearPop = report.pops.find((p) => Math.abs(p.t - t) < 0.02);
  return (
    <main style={{ position: "fixed", inset: 0, background: "#e9e2d2", fontFamily: "ui-sans-serif, system-ui" }}>
      <div ref={host} id="stage" style={{ position: "absolute", inset: "0 0 96px 0" }} />
      <div
        style={{
          position: "absolute",
          left: 16,
          top: 16,
          width: 300,
          padding: 14,
          borderRadius: 12,
          background: "rgba(255,250,242,0.92)",
          color: "#2a2230",
          fontSize: 13,
          lineHeight: 1.5,
          display: "grid",
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18 }}>Animation bench</div>
        <select value={clip.name} onChange={(e) => setClipName(e.target.value)} style={{ fontSize: 14 }}>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {clips
                .filter((c) => c.group === g)
                .map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Toggle on={!live_} disabled={!clip.raw} onClick={() => setLive(false)} label="raw keys" />
          <Toggle on={live_} disabled={!clip.live} onClick={() => setLive(true)} label="live (L)" />
          <Toggle on={compare} onClick={() => setCompare(!compare)} label="before (C)" />
          <Toggle on={trail} onClick={() => setTrail(!trail)} label="feet trail" />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SPEEDS.map((v) => (
            <Toggle key={v} on={speed === v} onClick={() => setSpeed(v)} label={`${v}×`} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {VIEWS.map((v, i) => (
            <Toggle key={v} on={view === v} onClick={() => setView(v)} label={`${i + 1} ${v}`} />
          ))}
        </div>
        <label>
          onion (O): {onion}
          <input
            type="range"
            min={0}
            max={6}
            value={onion}
            onChange={(e) => setOnion(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
        <label>
          mood: {tension.toFixed(2)} (0 day … 1 the dark)
          <input
            type="range"
            min={0}
            max={1}
            step={0.25}
            value={tension}
            onChange={(e) => setTension(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
        <div style={{ fontVariantNumeric: "tabular-nums" }}>
          <div>
            {t.toFixed(3)} / {clip.len.toFixed(2)} s · frame {Math.round(t * RATE)} · {playing ? "playing" : "paused"}{" "}
            (Space)
          </div>
          <div style={{ color: sum && sum.worst > SLIDE_LIMIT ? "#b5452f" : "#2b7a4b" }}>
            feet on the ground:{" "}
            {sum
              ? `L ${Math.round(sum.down[0] * 100)}%, R ${Math.round(sum.down[1] * 100)}% of the time; sliding at most ${(sum.worst * 100).toFixed(1)} cm/s; in the floor up to ${(sum.sunk * 100).toFixed(1)} cm`
              : "…"}
          </div>
          <div style={{ color: report.pops.length ? "#c06a12" : "#2b7a4b" }}>
            pops: {report.pops.length}
            {nearPop ? ` · here: ${nearPop.what}` : ""}
          </div>
          {compare && (
            <div style={{ opacity: 0.7 }}>
              left: after (now) · right: before ({live_ ? "plan 58 off" : "the old keys"})
            </div>
          )}
        </div>
      </div>
      <canvas
        ref={lane}
        id="lane"
        width={1600}
        height={80}
        onPointerDown={scrub}
        onPointerMove={scrub}
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 8,
          height: 80,
          width: "calc(100% - 32px)",
          cursor: "ew-resize",
        }}
      />
    </main>
  );
}

function Toggle({
  on,
  onClick,
  label,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: "3px 8px",
        borderRadius: 6,
        border: "1px solid #b9ab92",
        background: on ? "#2a2230" : "transparent",
        color: on ? "#fffaf2" : disabled ? "#b9ab92" : "#2a2230",
        fontSize: 12,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

/** Each foot's worst slide while on the ground (m/s), and its share of the time there (a foot that
 *  never rests reads no slide: this shows it). */
function summary(f: Feet | null): { L: number; R: number; worst: number; down: [number, number]; sunk: number } | null {
  if (!f || !f.slide.length) return null;
  let L = 0;
  let R = 0;
  const down: [number, number] = [0, 0];
  f.slide.forEach(([l, r], i) => {
    L = Math.max(L, l);
    R = Math.max(R, r);
    if (f.down[i][0]) down[0]++;
    if (f.down[i][1]) down[1]++;
  });
  const n = f.slide.length;
  return { L, R, worst: Math.max(L, R), down: [down[0] / n, down[1] / n], sunk: f.sunk };
}

/** The timeline: each foot's time on the ground (green; red where it slides), the pops, where we are. */
function drawLane(c: HTMLCanvasElement | null, t: number, len: number, feet: Feet | null, ps: { t: number }[]) {
  const g = c?.getContext("2d");
  if (!c || !g) return;
  const W = c.width;
  const H = c.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = "rgba(255,250,242,0.92)";
  g.fillRect(0, 0, W, H);
  if (feet) {
    const n = feet.down.length;
    for (let k = 0; k < 2; k++) {
      const y = 14 + k * 22;
      g.fillStyle = "#6b6070";
      g.font = "12px ui-sans-serif";
      g.fillText(k ? "R" : "L", 4, y + 12);
      for (let i = 0; i < n; i++) {
        if (!feet.down[i][k]) continue;
        g.fillStyle = feet.slide[i][k] > SLIDE_LIMIT ? "#b5452f" : "#3f9a63";
        g.fillRect(18 + (i / n) * (W - 24), y, Math.ceil((W - 24) / n), 16);
      }
    }
  }
  g.fillStyle = "#e08a1e";
  for (const p of ps) g.fillRect(18 + (p.t / len) * (W - 24) - 1, 60, 3, 16);
  g.fillStyle = "#2a2230";
  g.fillRect(18 + (t / len) * (W - 24) - 1, 0, 3, H);
}
