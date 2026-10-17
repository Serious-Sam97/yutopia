"use client";

import { AVATAR_OPTIONS, type AvatarLayers, avatarFromSeed, DEFAULT_AVATAR } from "@yutopia/shared";
import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Dev-only review page for the 3D people (docs/plan/22-people-3d.md).
//   /dev/chars                 four people in a row
//   /dev/chars?turn=N          one of them from the front, ¾, side and back
//   /dev/chars?lods=N          one of them at each level of detail (L0, L1, L2)
//   /dev/chars?crowd=50        a crowd (seeded looks) swaying, with fps and draw calls
//   /dev/chars?sheet=top       every option of one part of the look (top, bottom,
//                              shoes, hair, accessory, eyewear, extra, body, gender;
//                              &back=1 from behind, &head=1 close on the heads,
//                              &hair=long&top=hoodie… sets the rest of the look)
//   /dev/chars?anim=base       people moving: base (walk, run, sit, type, sip),
//                              busy, phone, social, emote (&t=1.2 frozen at 1.2 s)
//   …&w=&h=&ink=2.4&spin=1
const CAST: AvatarLayers[] = [
  {
    ...DEFAULT_AVATAR,
    skin: "#c68a5e",
    hair: "bob",
    hairColor: "#3b2a20",
    top: "tee",
    topColor: "#e8703a",
    bottom: "jeans",
    bottomColor: "#2f3f6a",
    shoesColor: "#2fb3a0",
    gender: "neutral",
  },
  {
    ...DEFAULT_AVATAR,
    skin: "#f3d2b3",
    hair: "long",
    hairColor: "#e45c8c",
    top: "sweater",
    topColor: "#6cc4a8",
    bottom: "skirt",
    bottomColor: "#5b3f8c",
    shoesColor: "#efe4cc",
    gender: "feminine",
  },
  {
    ...DEFAULT_AVATAR,
    skin: "#7c4a2b",
    hair: "short",
    hairColor: "#1c1410",
    top: "hoodie",
    topColor: "#e8a33d",
    bottom: "shorts",
    bottomColor: "#3d5a80",
    shoesColor: "#d8423a",
    gender: "masculine",
    body: "broad",
  },
  {
    ...DEFAULT_AVATAR,
    skin: "#e4b48e",
    hair: "ponytail",
    hairColor: "#a5482a",
    top: "tee",
    topColor: "#2a8fa6",
    bottom: "trousers",
    bottomColor: "#c9b28a",
    shoesColor: "#3a2a4a",
    gender: "feminine",
    body: "slim",
  },
];

export default function CharsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const [q, setQ] = useState<URLSearchParams | null>(null);
  useEffect(() => setQ(new URLSearchParams(window.location.search)), []);
  return q ? <Sheet q={q} /> : null;
}

type Field = keyof typeof AVATAR_OPTIONS;
// what each person in an animation row is doing (MotionIn fields, by group)
type Act = {
  label: string;
  walk?: number;
  sit?: boolean;
  typing?: boolean;
  held?: boolean;
  busy?: string;
  phone?: string;
  photo?: string;
  act?: string;
  emote?: string;
  speaking?: boolean;
  ringing?: boolean;
};
const ANIMS: Record<string, Act[]> = {
  base: [
    { label: "stand" },
    { label: "walk", walk: 3.6 },
    { label: "run", walk: 6.5 },
    { label: "talk", speaking: true },
    { label: "sit", sit: true },
    { label: "type", sit: true, typing: true },
    { label: "hold · sip", held: true },
  ],
  busy: ["coffee", "throw", "arcade", "piano", "gamepad", "pool", "pong", "computer", "whiteboard"].map((b) => ({
    label: b,
    busy: b,
  })),
  phone: [
    { label: "text", phone: "text" },
    { label: "call", phone: "call", speaking: true },
    { label: "video", phone: "video" },
    { label: "photo", phone: "photo" },
    { label: "selfie", phone: "selfie" },
    { label: "peace", phone: "selfie", photo: "peace" },
    { label: "point", phone: "photo", photo: "point" },
    { label: "thumbs", phone: "selfie", photo: "thumbs" },
    { label: "ringing", ringing: true },
  ],
  social: ["wave", "highfive", "fistbump", "cheers", "give"].map((a) => ({ label: a, act: a })),
  emote: ["wave", "clap", "laugh", "heart", "question", "fire", "coffee", "tape"].map((e) => ({ label: e, emote: e })),
};

type Mode =
  | { kind: "row" }
  | { kind: "anim"; group: string }
  | { kind: "sheet"; field: Field }
  | { kind: "turn"; look: number }
  | { kind: "lods"; look: number }
  | { kind: "crowd"; n: number };

// any part of a look can be set in the query (&hair=long&top=hoodie&gender=masculine)
function withQuery(a: AvatarLayers, q: URLSearchParams): AvatarLayers {
  const out = { ...a };
  for (const key of Object.keys(DEFAULT_AVATAR) as (keyof AvatarLayers)[]) {
    const v = q.get(key);
    if (v) out[key] = key.endsWith("Color") || key === "skin" ? `#${v.replace("#", "")}` : v;
  }
  return out;
}

// the person each sheet dresses up (a look that shows the part off)
function sheetLooks(field: Field, q: URLSearchParams): { label: string; a: AvatarLayers }[] {
  const base = withQuery({ ...CAST[0], hair: "short", accessory: "none", eyewear: "none", extra: "none" }, q);
  const opts = AVATAR_OPTIONS[field] as readonly string[];
  return opts.map((o) => {
    const a: AvatarLayers = { ...base, [field]: o };
    if (field === "accessory") a.accessoryColor = "#d8423a";
    if (field === "eyewear") a.eyewearColor = "#2a2420";
    if (field === "extra") a.extraColor = o === "earrings" || o === "necklace" ? "#e8b84a" : "#5b3f8c";
    if (field === "top") a.topColor = ["#e8703a", "#6cc4a8", "#e8a33d", "#3d6aa8"][opts.indexOf(o) % 4];
    if (field === "bottom") a.bottomColor = ["#2f3f6a", "#c9b28a", "#5b3f8c", "#6e7b3a"][opts.indexOf(o) % 4];
    return { label: o, a };
  });
}

function modeOf(q: URLSearchParams): Mode {
  const anim = q.get("anim");
  if (anim && anim in ANIMS) return { kind: "anim", group: anim };
  const sheet = q.get("sheet");
  if (sheet && sheet in AVATAR_OPTIONS) return { kind: "sheet", field: sheet as Field };
  if (q.get("crowd")) return { kind: "crowd", n: Number(q.get("crowd")) };
  if (q.get("turn")) return { kind: "turn", look: Number(q.get("turn")) };
  if (q.get("lods")) return { kind: "lods", look: Number(q.get("lods")) };
  return { kind: "row" };
}

function Sheet({ q }: { q: URLSearchParams }) {
  const ref = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState("");
  const [labels, setLabels] = useState<{ text: string; x: number }[]>([]);
  const [mode] = useState(() => modeOf(q));
  const W = Number(q.get("w") ?? 1800);
  const H = Number(q.get("h") ?? 1000);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let stop = false;
    let cleanup = () => {};
    (async () => {
      const T = await import("three");
      const C = await import("@/world/chars");
      if (stop) return;
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(W, H);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFShadowMap;
      host.appendChild(renderer.domElement);
      C.inkResolution(W, H);
      C.INK.px.value = Number(q.get("ink") ?? 2.4);
      const scene = new T.Scene();
      const key = new T.DirectionalLight("#ffffff", 2);
      key.position.set(-3.5, 6, 5);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      Object.assign(key.shadow.camera, { left: -8, right: 8, top: 6, bottom: -6 });
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.01;
      scene.add(key);
      const floor = new T.Mesh(new T.PlaneGeometry(60, 60), new T.ShadowMaterial({ color: "#3a4a78", opacity: 0.2 }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);

      const f = new C.CharFactory();
      type Model = InstanceType<typeof C.PersonModel>;
      const items: { m: Model; phase: number }[] = [];
      const add = (a: AvatarLayers, lod: 0 | 1 | 2, x: number, z: number, yaw: number) => {
        const m = new C.PersonModel(f, a, lod);
        m.root.position.set(x, 0, z);
        m.root.rotation.y = yaw;
        scene.add(m.root);
        items.push({ m, phase: items.length * 0.7 });
      };
      const back = q.get("back") === "1";
      const acts = mode.kind === "anim" ? ANIMS[mode.group] : [];
      const motions = acts.map((_, i) => new C.Motion3(i * 0.137 + 0.05));
      if (mode.kind === "anim")
        acts.forEach((a, i) => {
          const look = withQuery({ ...CAST[i % CAST.length], accessory: "none" }, q);
          // (&yaw= turns everyone: π shows their backs)
          const turn = Number(q.get("yaw") ?? 0);
          add(look, 0, (i - (acts.length - 1) / 2) * 0.95, 0, (a.walk ? Math.PI / 2 - 0.5 : 0.4) + turn);
        });
      // a stool for whoever sits (a lathe, like everything else)
      const stools: InstanceType<typeof T.Mesh>[] = [];
      const seatY = 0.46;
      acts.forEach((a, i) => {
        if (!a.sit) return;
        const g = new T.LatheGeometry(
          [
            new T.Vector2(0, 0),
            new T.Vector2(0.17, 0.01),
            new T.Vector2(0.15, seatY - 0.04),
            new T.Vector2(0.22, seatY - 0.02),
            new T.Vector2(0.22, seatY),
            new T.Vector2(0, seatY),
          ],
          24,
        );
        const m = new T.Mesh(g, new T.MeshBasicMaterial({ color: "#b5562f" }));
        m.position.set((i - (acts.length - 1) / 2) * 0.95, 0, 0.18);
        scene.add(m);
        stools.push(m);
      });
      const from = Number(q.get("from") ?? 0);
      const sheet = mode.kind === "sheet" ? sheetLooks(mode.field, q).slice(from, from + Number(q.get("n") ?? 99)) : [];
      if (mode.kind === "sheet")
        sheet.forEach((it, i) => {
          add(it.a, 0, (i - (sheet.length - 1) / 2) * 0.82, 0, back ? Math.PI - 0.35 : 0.35);
        });
      else if (mode.kind === "row")
        CAST.forEach((a, i) => {
          add(a, 0, (i - 1.5) * 1.15, 0, [0.3, -0.15, 0.2, Math.PI - 0.55][i]);
        });
      else if (mode.kind === "turn")
        [0, 0.7, Math.PI / 2, Math.PI].forEach((yaw, i) => {
          add(withQuery(CAST[mode.look % CAST.length], q), 0, (i - 1.5) * 1.0, 0, yaw);
        });
      else if (mode.kind === "lods")
        ([0, 1, 2] as const).forEach((l, i) => {
          add(CAST[mode.look % CAST.length], l, (i - 1) * 1.1, 0, 0.5);
        });
      else if (mode.kind === "crowd") {
        const side = Math.ceil(Math.sqrt(mode.n));
        for (let i = 0; i < mode.n; i++)
          add(
            avatarFromSeed(i + 1),
            1,
            ((i % side) - (side - 1) / 2) * 1.1,
            (Math.floor(i / side) - (side - 1) / 2) * 1.1,
            (i * 1.3) % 6.28,
          );
      }

      const tall = 1.7;
      const cam = new T.PerspectiveCamera(20, W / H, 0.1, 200);
      if (mode.kind === "crowd") {
        const side = Math.ceil(Math.sqrt(mode.n));
        cam.position.set(0, side * 1.2 + 2, side * 2.6 + 3);
        cam.lookAt(0, 0.5, 0);
      } else if (mode.kind === "anim") {
        const span = acts.length * 0.95 + 0.6;
        cam.position.set(0, tall * 0.62 + 0.5, Math.max(6.6, span / (2 * Math.tan((10 * Math.PI) / 180) * (W / H))));
        cam.lookAt(0, tall * 0.5, 0);
      } else if (mode.kind === "sheet") {
        // fit the row across the sheet (20° tall → about 35° wide here)
        const span = sheet.length * 0.82 + 0.5;
        const fit = span / (2 * Math.tan((10 * Math.PI) / 180) * (W / H));
        if (q.get("head") === "1") {
          cam.position.set(0, tall * 0.9, Math.max(3, fit));
          cam.lookAt(0, tall * 0.8, 0);
        } else {
          cam.position.set(0, tall * 0.62 + 0.4, Math.max(6.6, fit));
          cam.lookAt(0, tall * 0.5, 0);
        }
      } else {
        cam.position.set(0, tall * 0.62 + 0.6, mode.kind === "row" ? 8.6 : 7.4);
        cam.lookAt(0, tall * 0.47, 0);
      }
      const labelled = mode.kind === "anim" ? acts.map((a) => a.label) : sheet.map((it) => it.label);
      const step = mode.kind === "anim" ? 0.95 : 0.82;
      setLabels(
        labelled.map((text, i) => ({
          text,
          x: ((new T.Vector3((i - (labelled.length - 1) / 2) * step, 0, 0).project(cam).x + 1) / 2) * W,
        })),
      );
      // play the actions (frozen at &t= for a still)
      const since = performance.now();
      const mugs: Record<number, InstanceType<typeof T.Group>> = {}; // (kept upright, tipped for a sip)
      const animate = (dt: number, at: number) => {
        acts.forEach((a, i) => {
          const m = items[i].m;
          const mo = motions[i].update(dt, {
            dist: a.walk ? a.walk * dt : 0,
            walking: !!a.walk,
            speed: a.walk ?? 0,
            sit: !!a.sit,
            typing: !!a.typing,
            speaking: !!a.speaking,
            emote: a.emote ?? "",
            reduced: false,
            held: a.held ? { kind: "mug", since: (at * 1000) % 6000 } : null,
            busy: a.busy,
            act: a.act ? { what: a.act, t: at % 1.6, len: 1.6 } : null,
            phone: a.phone || a.ringing ? { state: a.phone ?? "", pose: a.photo ?? "", ringing: !!a.ringing } : null,
          });
          const drop = a.sit ? m.sitDrop(seatY) : 0;
          m.setPose(mo.pose, [mo.lift[0], mo.lift[1] + drop * mo.settle, mo.lift[2]], mo.reach);
          m.setFace(mo.blink, mo.talk);
          if (mugs[i]) C.keepUpright(mugs[i], "mug", m.root, mo.sip * 1.05);
        });
      };
      // what they hold: the mug for "hold · sip", the phone for the phone row
      const propMats: InstanceType<typeof T.MeshBasicMaterial>[] = [];
      const propMat = (c: string) => {
        const m = new T.MeshBasicMaterial({ color: c });
        propMats.push(m);
        return m;
      };
      const props: { dispose: () => void }[] = [];
      const pendingProps: (() => boolean)[] = [];
      acts.forEach((a, i) => {
        const kind = a.held ? "mug" : a.phone ? "phone" : null;
        const hand = kind ? items[i].m.bone("wristR") : null;
        if (!kind) return;
        const attach = () => {
          const bone = items[i].m.bone("wristR");
          if (!bone) return false;
          const pr = C.buildProp(kind, kind === "mug" ? "#efe4cc" : "#3d4a5c", propMat);
          C.inHand(pr.root, kind);
          pr.setLevel?.(0.7);
          bone.add(pr.root);
          props.push(pr);
          if (kind === "mug") mugs[i] = pr.root;
          return true;
        };
        if (!hand) pendingProps.push(attach);
        else attach();
      });
      const freeze = q.get("t");
      let last = performance.now();

      let raf = 0;
      let frozenDone = false;
      let frames = 0;
      let t0 = performance.now();
      const spin = q.get("spin") === "1";
      const sway = mode.kind === "crowd";
      const frame = (now: number) => {
        const built = f.pump(mode.kind === "crowd" ? 6 : 1000);
        let ready = 0;
        for (const it of items) {
          if (it.m.update()) ready++;
        }
        if (mode.kind === "anim") {
          if (ready === items.length && pendingProps.length) {
            for (const f of pendingProps.splice(0)) f();
          }
          if (freeze !== null) {
            // run the motion up to the frozen moment once everyone is built
            if (ready === items.length && !frozenDone) {
              const T1 = Number(freeze);
              for (let s = 0; s < T1 * 60; s++) animate(1 / 60, s / 60);
              frozenDone = true;
            }
          } else animate(Math.min(0.05, (now - last) / 1000), (now - since) / 1000);
        }
        last = now;
        for (const it of items) {
          if (spin) it.m.root.rotation.y += 0.006;
          if (sway) {
            const s = Math.sin(now / 400 + it.phase);
            it.m.setPose({
              ...C.REST,
              shoulderL: [s * 0.5, 0, 0.13],
              shoulderR: [-s * 0.5, 0, -0.13],
              thighL: [-s * 0.4, 0, 0],
              thighR: [s * 0.4, 0, 0],
              kneeL: [Math.max(0, s) * 0.6, 0, 0],
              kneeR: [Math.max(0, -s) * 0.6, 0, 0],
              head: [0, s * 0.2, 0],
            });
          }
        }
        renderer.render(scene, cam);
        frames++;
        if (now - t0 > 1000) {
          const tris = items.reduce((n, it) => n + it.m.tris, 0);
          setStats(
            `${Math.round((frames * 1000) / (now - t0))} fps · ${renderer.info.render.calls} draws · ${Math.round(tris / 1000)}k tris · ${ready}/${items.length} ready · ${f.size} models, ${f.pending} queued`,
          );
          frames = 0;
          t0 = now;
        }
        (window as unknown as { __chars: unknown }).__chars = {
          ready:
            ready === items.length && f.pending === 0 && (mode.kind !== "anim" || q.get("t") === null || frozenDone),
          built,
          items: items.map((it) => ({ lod: it.m.shownLod, tris: it.m.tris })),
          info: { calls: renderer.info.render.calls, tris: renderer.info.render.triangles },
          C,
          scene,
          cam,
          renderer,
          f,
          models: items.map((it) => it.m),
        };
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      cleanup = () => {
        cancelAnimationFrame(raf);
        for (const it of items) it.m.dispose();
        for (const st of stools) st.geometry.dispose();
        for (const pr of props) pr.dispose();
        for (const m of propMats) m.dispose();
        f.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();
    return () => {
      stop = true;
      cleanup();
    };
  }, [mode, W, H, q]);

  const title =
    mode.kind === "anim"
      ? `Motion · ${mode.group}`
      : mode.kind === "sheet"
        ? `Wardrobe · ${mode.field}`
        : mode.kind === "crowd"
          ? `Crowd of ${mode.n}`
          : mode.kind === "lods"
            ? "Levels of detail"
            : mode.kind === "turn"
              ? "Turnaround"
              : "Ligne Claire";
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#120c1c",
        display: "grid",
        placeItems: "center",
        padding: 24,
        fontFamily: "ui-sans-serif, system-ui",
      }}
    >
      <div
        id="sheet"
        style={{
          position: "relative",
          width: W,
          height: H,
          borderRadius: 18,
          overflow: "hidden",
          background: "linear-gradient(#cfe3ee 0 58%, #f1e8d2 58% 100%)",
        }}
      >
        <div ref={ref} style={{ position: "absolute", inset: 0 }} />
        <div style={{ position: "absolute", left: 36, top: 28, color: "#2a1430" }}>
          <div style={{ fontSize: 13, letterSpacing: 4, textTransform: "uppercase", opacity: 0.7 }}>
            Yutopia · 3D people
          </div>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>{title}</div>
          <div id="stats" className="mono" style={{ fontSize: 15, opacity: 0.8 }}>
            {stats}
          </div>
        </div>
        {labels.map((l) => (
          <div
            key={l.text}
            style={{
              position: "absolute",
              bottom: 36,
              left: l.x - 80,
              width: 160,
              textAlign: "center",
              color: "#2a1430",
              fontWeight: 700,
              fontSize: 17,
            }}
          >
            {l.text}
          </div>
        ))}
        {mode.kind === "lods" && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 40,
              display: "flex",
              justifyContent: "center",
              gap: 200,
              color: "#2a1430",
              fontWeight: 700,
              fontSize: 22,
            }}
          >
            <span>L0 · close</span>
            <span>L1 · room</span>
            <span>L2 · far</span>
          </div>
        )}
      </div>
    </main>
  );
}
