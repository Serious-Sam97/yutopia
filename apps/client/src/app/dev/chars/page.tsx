"use client";

import {
  AVATAR_OPTIONS,
  type AvatarLayers,
  avatarFromSeed,
  DEFAULT_AVATAR,
  type JumpKind,
  jumpArc,
  jumpNowAt,
  jumpTimes,
} from "@yutopia/shared";
import { KH_FEEL } from "@yutopia/shared/move";
import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Moved, Verb } from "@/world/chars";

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
//                              busy, phone, social, emote (&t=1.2 frozen at 1.2 s);
//                              the move (docs/plan/29-the-move.md): move (the gaits,
//                              crouch, strafe, aim), run, sprint, land, vault, mantle,
//                              roll (filmstrips)
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
  jump?: JumpKind; // frozen jt s into a jump (a filmstrip: the same person, moment by moment)
  jt?: number;
  // the move's poses (chars/moves.ts), posed straight on: `mp` is the cycle's phase (frozen),
  // the verb's progress, or the landing's impact; a cycle without `mp` plays at `walk` tiles/s
  mv?: MoveKind;
  mp?: number;
  // plan 58's animations (docs/plan/58-the-animation.md, phase 0) and the mood (0 day … 1 dark)
  v2?: boolean;
  tension?: number;
  // plan 58 G (the feel): driven through the scripted loop (FEEL), `at` this far into it
  feel?: number;
  // plan 58 G.D: the eyes held looking this way (x to the left, y up; −1..1)
  eyes?: [number, number];
};
type MoveKind =
  | "jog"
  | "run"
  | "sprint"
  | "crouch"
  | "sneak"
  | "strafe"
  | "back"
  | "land"
  | "aim"
  | "aimGun"
  | "aimUp"
  | "vault"
  | "mantle"
  | "roll"
  | "slide"
  | "walkOld"
  | "walk2"
  | "run2"
  | "jog2"
  | "sprint2"
  | "slide2";
// a cycle or a verb as a filmstrip: n moments evenly through it
const moveStrip = (mv: MoveKind, n: number): Act[] =>
  Array.from({ length: n }, (_, i) => {
    const cyc = ["jog", "run", "sprint", "walkOld", "walk2", "run2", "jog2", "sprint2"].includes(mv);
    const mp = mv === "land" ? (i + 1) / n : (i + (cyc ? 0 : 0.5)) / n;
    return { label: `${mv} ${mp.toFixed(2)}`, mv, mp };
  });
// the top a vault or a mantle goes over / onto (tiles), and where it stands from the start
const TOPS: Partial<Record<MoveKind, { h: number; at: number; len: number }>> = {
  vault: { h: 0.6, at: 0.8, len: 0.3 },
  mantle: { h: 1.1, at: 0.3, len: 0.75 },
};
// a jump as a filmstrip: n moments evenly through it
const jumpStrip = (kind: JumpKind, n: number): Act[] =>
  Array.from({ length: n }, (_, i) => {
    const jt = ((i + 0.5) / n) * jumpTimes(kind).len;
    return { label: `${kind} ${jt.toFixed(2)}`, jump: kind, jt };
  });
// plan 58 G (the feel): a body driven through a loop — standing, a start, a run, a sprint, a hard
// stop (the skid), settling, a pivot round, a run back, an arc, a run's stop, standing — its speed
// and turn as KH_FEEL's body would have them (speeding up 30 t/s², slowing 28.5), so each change
// plays the same every time. [from s, the speed wanted, the turn rad/s]
const FEEL: [number, number, number][] = [
  [0, 0, 0],
  [1.2, 5.8, 0],
  [2.6, 8.2, 0],
  [4.2, 0, 0],
  [5.6, 0, 20],
  [5.75, 5.8, 0],
  [6.4, 5.8, 2.6],
  [7.0, 5.8, 0],
  [7.4, 0, 0],
];
const FEEL_LEN = 9.5;
type FeelState = {
  t: number;
  v: number;
  acc: number;
  yaw: number;
  loco: InstanceType<typeof import("@/world/chars")["Locomotion"]>;
  last: Moved | null;
};
/** A feel row's body stepped on to `to` s into the loop (from the start of it, a 60th at a time). */
function feelStep(C: typeof import("@/world/chars"), st: FeelState, to: number): Moved {
  let mo: Moved | null = st.last;
  const dt = 1 / 60;
  while (st.t < to - 1e-6 || !mo) {
    const u = st.t % FEEL_LEN;
    let seg = FEEL[0];
    for (const f of FEEL) if (u >= f[0]) seg = f;
    const was = st.v;
    const rate = seg[1] > st.v ? 30 : 28.5;
    st.v += Math.max(-rate * dt, Math.min(rate * dt, seg[1] - st.v));
    st.acc += ((st.v - was) / dt - st.acc) * Math.min(1, dt * 10);
    st.yaw += seg[2] * dt;
    mo = st.loco.update(
      dt,
      {
        dist: st.v * dt,
        speed: st.v,
        ahead: st.v,
        left: 0,
        crouch: false,
        aim: false,
        pitch: 0,
        yaw: 0,
        turn: seg[2],
        accel: st.acc,
        up: false,
        jump: null,
        verb: null,
        reduced: false,
      },
      C.heroNow()?.idle2Pose(st.t, 0, 2, true),
    );
    st.t += dt;
  }
  st.last = mo;
  return mo;
}

// plan 58, phase 0: a filmstrip of a cycle in a mood
const strip2 = (mv: MoveKind, n: number, tension = 0): Act[] =>
  Array.from({ length: n }, (_, i) => ({ label: `${mv} ${(i / n).toFixed(2)}`, mv, mp: i / n, tension }));
// …of a jump, the new one or the old (one person, frozen moment by moment)
const jumpStrip2 = (kind: JumpKind, n: number, v2: boolean): Act[] =>
  Array.from({ length: n }, (_, i) => {
    const jt = ((i + 0.5) / n) * jumpTimes(kind).len;
    return { label: `${v2 ? "new" : "old"} ${jt.toFixed(2)}`, jump: kind, jt, v2 };
  });
const ANIMS: Record<string, Act[]> = {
  // plan 58 G.D: the eyes' two morphs — looking right, ahead, left and up
  eyes: [
    { label: "eyes right", eyes: [-1, 0] },
    { label: "eyes ahead", eyes: [0, 0] },
    { label: "eyes left, up", eyes: [1, 0.8] },
  ],
  // plan 58 G: the feel loop, played; and its moments, frozen
  feel: [{ label: "the feel loop", feel: 0 }],
  feelstrip: [1.3, 1.45, 1.6, 4.3, 4.45, 4.6, 5.62, 5.7, 6.7, 7.5].map((t) => ({
    label: `feel ${t.toFixed(2)}`,
    feel: t,
  })),
  feelstop: [7.2, 7.28, 7.36, 7.44, 7.52, 7.6, 7.7, 7.85].map((t) => ({ label: `stop ${t.toFixed(2)}`, feel: t })),
  feelpivot: [5.58, 5.62, 5.66, 5.7, 5.74, 5.78, 5.84, 5.92].map((t) => ({ label: `pivot ${t.toFixed(2)}`, feel: t })),
  // plan 58, phase 0: the hero animations, old beside new (day) and new in the dark
  hero: [
    { label: "idle · old" },
    { label: "idle · new", v2: true },
    { label: "idle · new, dark", v2: true, tension: 1 },
    { label: "walk · old", mv: "walkOld", walk: 2.2 },
    { label: "walk · new", mv: "walk2", walk: 2.2 },
    { label: "walk · new, dark", mv: "walk2", walk: 1.8, tension: 1 },
    { label: "run · old", mv: "run", walk: 5.8 },
    { label: "run · new", mv: "run2", walk: 5.8 },
    { label: "sprint · old", mv: "sprint", walk: 8.2 },
    { label: "sprint · new", mv: "sprint2", walk: 8.2 },
  ],
  idles: [
    { label: "idle · old" },
    { label: "idle · new", v2: true },
    { label: "idle · new, dusk", v2: true, tension: 0.5 },
    { label: "idle · new, dark", v2: true, tension: 1 },
  ],
  walkold: strip2("walkOld", 8),
  walk2: strip2("walk2", 8),
  walk2dark: strip2("walk2", 8, 1),
  run2: strip2("run2", 8),
  // (the jog, the run without Shift: 2026-10-30)
  jog2: strip2("jog2", 8),
  sprint2: strip2("sprint2", 8),
  slide2: moveStrip("slide2", 8),
  leap2: jumpStrip2("leap", 10, true),
  hopold: jumpStrip2("hop", 10, false),
  hop2: jumpStrip2("hop", 10, true),
  flipold: jumpStrip2("flip", 12, false),
  flip2: jumpStrip2("flip", 12, true),
  jumps2: [
    { label: "hop · old", jump: "hop", v2: false },
    { label: "hop · new", jump: "hop", v2: true },
    { label: "flip · old", jump: "flip", v2: false },
    { label: "flip · new", jump: "flip", v2: true },
    { label: "leap · new (running)", jump: "leap", v2: true },
  ],
  slides: [
    { label: "slide · old", mv: "slide" },
    { label: "slide · new", mv: "slide2" },
  ],
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
  hop: jumpStrip("hop", 10),
  flip: jumpStrip("flip", 12),
  move: [
    { label: "walk", walk: 2.2 },
    { label: "jog", mv: "jog", walk: 4.2 },
    { label: "run", mv: "run", walk: 5.6 },
    { label: "sprint", mv: "sprint", walk: 6.8 },
    { label: "crouch", mv: "crouch" },
    { label: "sneak", mv: "sneak", walk: 1.6 },
    { label: "strafe", mv: "strafe", walk: 2 },
    { label: "back up", mv: "back", walk: 2 },
    { label: "slide", mv: "slide", mp: 0.5 },
    { label: "aim · torch", mv: "aim" },
    { label: "aim · gun", mv: "aimGun" },
    { label: "aim · up", mv: "aimUp" },
  ],
  jog: moveStrip("jog", 8),
  run: moveStrip("run", 8),
  sprint: moveStrip("sprint", 8),
  land: moveStrip("land", 4),
  vault: moveStrip("vault", 8),
  mantle: moveStrip("mantle", 8),
  roll: moveStrip("roll", 9),
  slide: moveStrip("slide", 8),
  // the verbs played over and over (for a recording)
  verbs: [
    { label: "vault", mv: "vault" },
    { label: "mantle", mv: "mantle" },
    { label: "roll", mv: "roll" },
    { label: "slide", mv: "slide" },
    { label: "land", mv: "land" },
  ],
};
// how far apart each in a row stands
const SPACING: Record<string, number> = {
  vault: 1.35,
  mantle: 1.5,
  roll: 1.35,
  land: 1.2,
  slide: 1.4,
  verbs: 2.2,
  hero: 1.15,
  idles: 1.1,
  jumps2: 2.6,
  feel: 2.4,
  feelstrip: 1.25,
  feelstop: 1.3,
  feelpivot: 1.3,
  slides: 3.2,
};
// a jump's time: frozen at `jt`, or played over and over with a breath between
const jtOf = (a: Act, at: number) => a.jt ?? at % (jumpTimes(a.jump ?? "hop").len + 0.6);

/** The pose for one of the move's acts (`at`: seconds in, for one playing live: a cycle at
 *  `walk` tiles/s, a verb over and over with a pause between). */
// plan 58's animations (loaded before the page draws: `loadHero`)
const hero = (C: typeof import("@/world/chars")) => {
  const H = C.heroNow();
  if (!H) throw new Error("plan 58's animations aren't in");
  return H;
};

function movePose(C: typeof import("@/world/chars"), a: Act, at: number): Moved {
  const cyc = (stride: number) => a.mp ?? ((at * (a.walk ?? 0)) / stride) % 1;
  const breath = (at / 3.6) % 1;
  switch (a.mv) {
    case "jog":
      return C.runPose(cyc(C.runStride(0)), 0);
    case "run":
      return C.runPose(cyc(C.runStride(0.5)), 0.5);
    case "sprint":
      return C.runPose(cyc(C.runStride(1)), 1);
    case "walkOld":
      return C.walkPose(cyc(C.STRIDE), 1) as Moved;
    case "walk2":
      return hero(C).walk2Pose(cyc(hero(C).walk2Stride(a.tension ?? 0)), a.tension ?? 0);
    case "run2":
      return hero(C).run2Pose(cyc(C.runStride(0.5)), 0.5, a.tension ?? 0);
    case "jog2":
      return hero(C).run2Pose(cyc(hero(C).run2Stride(0)), 0, a.tension ?? 0);
    case "sprint2":
      return hero(C).run2Pose(cyc(C.runStride(1)), 1, a.tension ?? 0);
    case "slide2":
      return hero(C).slide2Pose(verbAt(C, a, at));
    case "crouch":
      return C.crouchPose(breath);
    case "sneak":
      return C.crouchWalkPose(cyc(C.SNEAK_STRIDE));
    case "strafe":
      return C.strafePose(cyc(C.STRAFE_STRIDE), 1);
    case "back":
      return C.backpedalPose(cyc(C.BACK_STRIDE));
    case "land":
      return C.landPose(a.mp ?? Math.sin(Math.PI * Math.min(1, (at % 1.4) / 0.7)));
    case "aim":
      return C.aimPose(0, 0, false, breath);
    case "aimGun":
      return C.aimPose(0, 0, true, breath);
    case "aimUp":
      return C.aimPose(0.5, 0.35, false, breath);
    default:
      return C.verbPose(a.mv as Verb, verbAt(C, a, at));
  }
}
/** How far through its verb an act is: frozen at `mp`, or played over and over. */
function verbAt(C: typeof import("@/world/chars"), a: Act, at: number): number {
  if (a.mp !== undefined) return a.mp;
  const len = C.VERB_LEN[(a.mv === "slide2" ? "slide" : a.mv) as Verb];
  return Math.min(1, (at % (len + 0.7)) / len);
}

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
      // (plan 58's animations: their own chunk, in before anything's drawn)
      await C.loadHero();
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
      const motions = acts.map((a, i) => {
        const m = new C.Motion3(i * 0.137 + 0.05);
        m.v2 = !!a.v2;
        m.tension = a.tension ?? 0;
        return m;
      });
      const step = mode.kind === "anim" ? (SPACING[mode.group] ?? 0.95) : 0.82;
      if (mode.kind === "anim")
        acts.forEach((a, i) => {
          // (a jump's filmstrip: one person, side on, going left to right)
          const strip =
            a.jump ||
            a.mp !== undefined ||
            a.feel !== undefined ||
            ["vault", "mantle", "roll", "slide", "slide2", "land"].includes(a.mv ?? "");
          const look = withQuery({ ...CAST[strip ? 0 : i % CAST.length], accessory: "none" }, q);
          // (&yaw= turns everyone: π shows their backs)
          const turn = Number(q.get("yaw") ?? 0);
          const yaw = strip ? Math.PI / 2 : a.walk ? Math.PI / 2 - 0.5 : 0.4;
          add(look, 0, (i - (acts.length - 1) / 2) * step, 0, yaw + turn);
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
      // what a vault goes over and a mantle climbs onto (moved under the person: a treadmill)
      if (acts.some((a) => a.mv && TOPS[a.mv])) scene.add(new T.HemisphereLight("#fff8ee", "#9a8b76", 2.2));
      const tops: (InstanceType<typeof T.Mesh> | null)[] = acts.map((a, i) => {
        const top = a.mv ? TOPS[a.mv] : undefined;
        if (!top) return null;
        const m = new T.Mesh(new T.BoxGeometry(top.len, top.h, 0.9), new T.MeshLambertMaterial({ color: "#9a8b76" }));
        m.position.set((i - (acts.length - 1) / 2) * step, top.h / 2, 0);
        m.castShadow = true;
        m.receiveShadow = true;
        scene.add(m);
        stools.push(m);
        return m;
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
        const span = acts.length * step + 0.6;
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
      setLabels(
        labelled.map((text, i) => ({
          text,
          x: ((new T.Vector3((i - (labelled.length - 1) / 2) * step, 0, 0).project(cam).x + 1) / 2) * W,
        })),
      );
      // play the actions (frozen at &t= for a still)
      const since = performance.now();
      const mugs: Record<number, InstanceType<typeof T.Group>> = {}; // (kept upright, tipped for a sip)
      const feels = new Map<number, FeelState>();
      const animate = (dt: number, at: number) => {
        acts.forEach((a, i) => {
          const m = items[i].m;
          if (a.feel !== undefined) {
            // (the loop played on; a moment of it frozen at its own time)
            let st = feels.get(i);
            if (!st) {
              const loco = new C.Locomotion(KH_FEEL);
              loco.v2 = true;
              loco.seed = 2;
              st = { t: 0, v: 0, acc: 0, yaw: 0, loco, last: null };
              feels.set(i, st);
            }
            const mo = feelStep(C, st, a.feel === 0 ? at : a.feel);
            m.root.rotation.y = Math.PI / 2 + st.yaw;
            m.setPose(mo.pose, mo.lift);
            // (the gaze's eyes and blink: plan 58 G.D)
            const gz = st.loco.gazeOut;
            m.setFace(gz?.blink ?? 0, 0);
            m.setEyes(gz?.eyes[0] ?? 0, gz?.eyes[1] ?? 0);
            return;
          }
          if (a.mv) {
            const mo = movePose(C, a, at);
            const x = (i - (acts.length - 1) / 2) * step;
            const verb =
              a.mv === "slide2"
                ? "slide"
                : a.mv === "vault" || a.mv === "mantle" || a.mv === "roll" || a.mv === "slide"
                  ? a.mv
                  : null;
            const top = a.mv ? TOPS[a.mv] : undefined;
            const go = verb ? C.verbRoot(verb, verbAt(C, a, at), top?.h) : { ahead: 0, up: 0 };
            m.root.position.y = go.up;
            const box = tops[i];
            if (box && top) box.position.x = x + top.at + top.len / 2 - go.ahead;
            m.setPose(mo.pose, mo.lift);
            m.step(dt);
            m.setFace(0, 0);
            return;
          }
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
            jump: a.jump ? jumpNowAt(a.jump, jtOf(a, at)) : null,
          });
          if (a.jump) m.root.position.y = jumpArc(a.jump, jtOf(a, at)).h;
          const drop = a.sit ? m.sitDrop(seatY) : 0;
          m.setPose(mo.pose, [mo.lift[0], mo.lift[1] + drop * mo.settle, mo.lift[2]], mo.reach);
          m.step(dt);
          m.setFace(a.eyes ? 0 : mo.blink, mo.talk);
          if (a.eyes) m.setEyes(a.eyes[0], a.eyes[1]);
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
        // (aiming: the phone's torch in the left hand)
        const wrist = a.mv?.startsWith("aim") ? "wristL" : "wristR";
        const kind = a.held ? "mug" : a.phone || wrist === "wristL" ? "phone" : null;
        const hand = kind ? items[i].m.bone(wrist) : null;
        if (!kind) return;
        const attach = () => {
          const bone = items[i].m.bone(wrist);
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
