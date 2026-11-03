import {
  avatarFromSeed,
  DEFAULT_AVATAR,
  DESK_PULL,
  emptyEdges,
  entry,
  type MapDef,
  SEAT_NEXT,
  SEAT_SPEC,
  SURFACE,
  SURFACE_NEXT,
  setEdge,
  type WorldObjectDef,
} from "@yutopia/shared";
import * as T from "three";
import { Post3 } from "../tp/post3d";
import { legOf, SEATS, type SeatShape, seatFit } from "../tp/seats3d";
import { DESK_TOP, FOOT, type Hero, heroModel, SEAT } from "./heroes";
import { lambert, type Tier, toon } from "./kit";
import { LOOK_NAMES, modelOf, seedOf } from "./native";

/** The shading: soft Lambert, the people's cel, or a bolder cel (the bench's option). */
export type Look = "lambert" | "toon" | "toon2";
const material = (l: Look) => (l === "lambert" ? lambert() : toon(l === "toon2"));

// /dev/furniture (docs/plan/67-the-furniture.md): the furniture bench. In a row: today's piece (drawn
// by the game's own World3, as the world draws it) and the new ones — phase 0's heroes in their three
// tiers, or (`kind`) every look of a kind as the world will draw it (world/furn/native.ts) — in a room
// of the game's, with people at their real size, sat on the seats, stood by the rest. The game's post
// (ink, bloom, grain) over all of it.

/** The kinds the bench shows look by look (the families built so far). */
export type BenchKind = string;
export const BENCH_KINDS = Object.keys(LOOK_NAMES);

export interface BenchOpts {
  hero: Hero;
  /** a kind's looks instead of the hero's tiers */
  kind: BenchKind | null;
  /** with their story details (a cardigan on the back, a blanket on the arm…) */
  story: boolean;
  look: Look;
  night: boolean;
  /** frame one column (0 today, then the tiers or the looks) close, or the whole row */
  col: number | null;
  /** the camera's turn round the row (radians; 0 square on from the front) */
  turn: number;
  spin: boolean;
  /** the columns' names and counts over the floor */
  labels: boolean;
  /** the people kept in a close look at one column */
  sitters: boolean;
  w: number;
  h: number;
}

export async function runBench(el: HTMLElement, o: BenchOpts): Promise<() => void> {
  const items = await import("../art/items");
  const { World3 } = await import("../tp/build");
  const C = await import("../chars");
  await C.loadHero();

  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(o.w, o.h);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  el.appendChild(renderer.domElement);
  C.inkResolution(o.w, o.h);

  const scene = new T.Scene();
  scene.background = new T.Color(o.night ? "#14161c" : "#cfc8bb");
  const camera = new T.PerspectiveCamera(30, o.w / o.h, 0.1, 200);

  // ── what's in the row: today's, then the new ones ──
  const subject = o.kind ?? o.hero;
  const fw = entry(subject).w;
  const fh = entry(subject).h;
  interface Col {
    label: string;
    geo: T.BufferGeometry | null; // (null: today's, by World3)
    seat: SeatShape | null;
  }
  const isSeat = (k: string) => k in SEATS;
  const next = (k: string): SeatShape | null => SEAT_NEXT[k] ?? SEAT_SPEC[k] ?? null;
  const cols: Col[] = [{ label: "Today", geo: null, seat: isSeat(subject) ? SEATS[subject] : null }];
  if (o.kind) {
    // (an id whose story is none — or, with `story`, the last one's)
    let id = "look";
    for (let i = 0; i < 400; i++)
      if (o.story ? seedOf(`s${i}`) > 0.95 : Math.abs(seedOf(`s${i}`) - 0.425) < 0.03) {
        id = `s${i}`;
        break;
      }
    LOOK_NAMES[o.kind].forEach((label, v) => {
      cols.push({
        label,
        geo: modelOf({ id, kind: o.kind as string, x: 0, y: 0, props: { variant: v } }),
        seat: next(o.kind as string),
      });
    });
  } else
    (["Clean", "Crafted", "Rich"] as const).forEach((label, t) => {
      cols.push({
        label,
        geo: heroModel(o.hero, t as Tier),
        seat: t === 1 && (o.hero === "chair" || o.hero === "sofa") ? (SEAT[o.hero] ?? null) : null,
      });
    });
  const n = cols.length;

  // ── the room: a wood floor, a plaster wall behind the row ──
  const S = fw + 1; // tiles between the columns
  const X0 = 2;
  const ROW = 3; // the row's tile y (the wall along y = 1)
  const W = X0 + n * S + 4;
  const H = 9;
  const map: MapDef = {
    key: "bench",
    name: "bench",
    width: W,
    height: H,
    tiles: [" ".repeat(W), ...Array.from({ length: H - 1 }, () => ` ${".".repeat(W - 1)}`)],
    ...emptyEdges(W, H),
    spawn: { x: 2.5, y: 4.5 },
    areas: [],
    objects: [],
  };
  for (let x = 1; x < W; x++) setEdge(map, { x, y: 1, dir: "h" }, "p");
  for (let y = 1; y < H; y++) setEdge(map, { x: 1, y, dir: "v" }, "p");
  // today's: as the world places it (the desk turned to face us, its user's side south)
  const rot = subject === "desk" ? 2 : 0;
  const objects: WorldObjectDef[] = [
    { id: `old-${subject}`, kind: subject, x: X0, y: ROW, rot, props: { variant: 0 } },
  ];
  // (a desk: its chair in front on the sitter's side, pulled in and sat on, someone typing at it)
  const atDesk = subject === "desk";
  if (atDesk)
    objects.push({
      id: "old-chair",
      kind: "chair",
      x: X0,
      y: ROW + 1,
      rot: 2,
      props: { pull: DESK_PULL, occupied: true },
    });
  const world = new World3(items, map, objects, 8);
  scene.add(world.root);
  world.root.updateMatrixWorld(true);

  // ── the new ones, a column each ──
  const mat = material(o.look);
  cols.forEach((c, i) => {
    if (!c.geo) return;
    if (atDesk) {
      // the new chair at the new desk, turned to it and pulled in ("c0": an id with no story on it)
      const chair = new T.Mesh(
        modelOf({ id: "c0", kind: "chair", x: 0, y: 0, props: { variant: 0, occupied: true } }),
        mat,
      );
      chair.rotation.y = Math.PI;
      chair.position.set(X0 + i * S + 1, 0, ROW + 2 - DESK_PULL);
      chair.castShadow = true;
      scene.add(chair);
    }
    const mesh = new T.Mesh(c.geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const x = X0 + i * S;
    if (rot === 2) {
      // turned half round its footprint's middle, as World3 turns today's
      mesh.rotation.y = Math.PI;
      mesh.position.set(x + fw, 0, ROW + fh);
    } else mesh.position.set(x, 0, ROW);
    scene.add(mesh);
    const glow = c.geo.userData.glow as T.BufferGeometry | null;
    if (glow) {
      const gm = new T.Mesh(glow, new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
      gm.position.copy(mesh.position);
      gm.rotation.copy(mesh.rotation);
      scene.add(gm);
    }
  });

  // ── light: a soft sky, a key from the front left, a little fill; at night one warm lamp ──
  const hemi = new T.HemisphereLight("#f3efe6", "#6c5f50", o.night ? 0.12 : 0.85);
  scene.add(hemi);
  const key = new T.DirectionalLight("#fff3e0", o.night ? 0.08 : 1.5);
  const mid = X0 + (n / 2) * S;
  key.position.set(mid + 6, 9, ROW + 8);
  key.target.position.set(mid, 0, ROW);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -W / 2 - 2;
  sc.right = W / 2 + 2;
  sc.top = 8;
  sc.bottom = -8;
  sc.near = 1;
  sc.far = 40;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  if (o.night) {
    const lamp = new T.PointLight("#ffb46a", 7, 10, 1.4);
    lamp.position.set(mid + 0.5, 2.9, ROW - 0.2);
    scene.add(lamp);
  }

  // ── the people: sat on the old seat and the crafted one, one stood at the end of the row ──
  const f = new C.CharFactory();
  interface Who {
    m: InstanceType<typeof C.PersonModel>;
    mo: InstanceType<typeof C.Motion3>;
    at: [number, number];
    seat: SeatShape | null;
    yaw: number;
    /** typing at a desk: its top's height and where its keyboard is (z) */
    desk?: { top: number; kbZ: number };
  }
  const people: Who[] = [];
  const add = (seed: number, at: [number, number], seat: SeatShape | null, yaw = 0, desk?: Who["desk"]) => {
    const m = new C.PersonModel(f, seed ? avatarFromSeed(seed) : DEFAULT_AVATAR, 0);
    scene.add(m.root);
    people.push({ m, mo: new C.Motion3(0.3 + seed * 0.01), at, seat, yaw, desk });
  };
  // (on every seat in the row; a close look at one has none, unless asked)
  if (o.col === null || o.sitters)
    cols.forEach((c, i) => {
      const who = [0, 7, 11, 5, 9, 2][i % 6];
      if (atDesk) {
        // sat at the desk, typing: today's chair at today's desk, the new at the new
        const top = SURFACE_NEXT.desk ?? SURFACE.desk;
        add(who, [X0 + i * S + 0.5, ROW + 1.5 - DESK_PULL], SEAT_NEXT.chair ?? SEATS.chair, Math.PI, {
          top,
          kbZ: ROW + 0.76,
        });
      } else if (c.seat) add(who, [X0 + i * S + fw / 2, ROW + fh / 2], c.seat);
    });
  if (o.col === null) add(3, [X0 + n * S + 0.4, ROW + 0.5], null, -0.5);

  // ── labels ──
  const labels = cols.map((c, i) => {
    const d = document.createElement("div");
    d.textContent = c.geo
      ? `${c.label} · ${Math.round(c.geo.attributes.position.count / 3).toLocaleString()} tris`
      : c.label;
    Object.assign(d.style, {
      position: "absolute",
      transform: "translate(-50%, 0)",
      font: "600 13px ui-sans-serif, system-ui",
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: o.night ? "#e8dcc4" : "#2b2118",
      background: o.night ? "rgba(20,22,28,.6)" : "rgba(239,233,222,.75)",
      padding: "3px 8px",
      borderRadius: "4px",
      whiteSpace: "nowrap",
      pointerEvents: "none",
    });
    el.appendChild(d);
    return { d, at: new T.Vector3(X0 + i * S + fw / 2, 0, ROW + fh + 0.35) };
  });

  // ── the camera ──
  const target = new T.Vector3();
  let span: number;
  if (o.col === null) {
    target.set(X0 + (n * S + 0.5) / 2 - 0.25, 0.8, ROW + fh / 2);
    span = n * S + 2.2;
  } else {
    target.set(X0 + o.col * S + fw / 2, subject === "plant" ? 0.62 : subject === "chair" ? 0.55 : 0.45, ROW + fh / 2);
    span = Math.max(fw, 1) + (fw === 1 ? 1.0 : 0.6);
  }
  const hfov = 2 * Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
  const dist = span / 2 / Math.tan(hfov / 2);
  const tilt = o.col === null ? 0.2 : 0.34;
  const place = (turn: number) => {
    camera.position.set(
      target.x + Math.sin(turn) * dist * Math.cos(tilt),
      target.y + dist * Math.sin(tilt),
      target.z + Math.cos(turn) * dist * Math.cos(tilt),
    );
    camera.lookAt(target);
  };
  place(o.turn);

  const post = new Post3(renderer, scene, camera);
  post.setSize(o.w, o.h, renderer.getPixelRatio());
  post.setNight(o.night ? 1 : 0);

  // ── run ──
  let stop = false;
  let frames = 0;
  const v = new T.Vector3();
  const fwd = new T.Vector3();
  const pose = (p: Who) => {
    const m = p.m;
    if (!m.ready) return false;
    m.root.position.set(p.at[0], 0, p.at[1]);
    m.root.rotation.y = p.yaw;
    if (!p.seat) {
      const out = p.mo.update(1 / 60, {
        dist: 0,
        walking: false,
        speed: 0,
        sit: false,
        typing: false,
        speaking: false,
        emote: "",
        reduced: true,
      });
      m.setPose(out.pose, out.lift, out.reach);
      return true;
    }
    // sat as the world sits them (person3d.ts seatOf): the hips along the seat, the lean, the drop
    const leg = legOf((j) => m.bone(j));
    const { along, recline } = seatFit(p.seat, leg.thigh);
    const drop = m.sitDrop(p.seat.top);
    const fit = {
      drop,
      stand: leg.hipY,
      floor: 0,
      recline,
      ahead: p.seat.solid ? p.seat.front - along + 0.06 : 0,
      arms: p.seat.arms ?? null,
    };
    p.mo.v2 = true;
    // (facing +z at yaw 0; at a desk, the keys in her own space: ahead of her root, at the top)
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const rootZ = p.at[1] + along * fz;
    const keys: [number, number, number, number] | undefined = p.desk
      ? [0, p.desk.top + 0.015, (p.desk.kbZ - rootZ) * fz, 0.18]
      : undefined;
    const inp = {
      dist: 0,
      walking: false,
      speed: 0,
      sit: true,
      typing: !!p.desk,
      speaking: false,
      emote: "",
      reduced: false,
      seat: fit,
      keys,
    };
    let out = p.mo.update(1 / 60, inp);
    for (let i = 0; i < 150 && (out.settle < 1 || i < 60); i++) out = p.mo.update(1 / 60, inp);
    m.root.position.set(p.at[0] + along * fx, 0, rootZ);
    m.setPose(out.pose, [out.lift[0], out.lift[1] + drop * out.settle, out.lift[2]], out.reach);
    m.handsTo(out.hands ?? null);
    return true;
  };
  const tick = () => {
    if (stop) return;
    let ready = 0;
    f.pump(40);
    for (const p of people) {
      p.m.update();
      if (pose(p)) ready++;
    }
    if (o.spin) place(o.turn + frames * 0.004);
    camera.updateMatrixWorld();
    camera.getWorldDirection(fwd);
    const face = Math.atan2(-fwd.x, -fwd.z);
    for (const c of world.cards) c.rotation.y = face;
    post.render(false);
    for (const l of labels) {
      v.copy(l.at).project(camera);
      const show =
        o.labels &&
        v.z < 1 &&
        Math.abs(v.x) < 1.05 &&
        Math.abs(v.y) < 1.05 &&
        (o.col === null || labels.indexOf(l) === o.col);
      l.d.style.display = show ? "block" : "none";
      l.d.style.left = `${((v.x + 1) / 2) * o.w}px`;
      l.d.style.top = `${((1 - v.y) / 2) * o.h}px`;
    }
    frames++;
    if (ready === people.length && frames > 30) (window as unknown as { __shot?: boolean }).__shot = true;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  (window as unknown as { __bench?: unknown }).__bench = { scene, camera, world, DESK_TOP };

  return () => {
    stop = true;
    world.dispose();
    renderer.dispose();
    el.innerHTML = "";
  };
}

/** A catalog picture (phase 9's, tried here for the panel's mock): one model on nothing, from
 *  three-quarters above, the game's ink over it. */
export async function runThumb(
  el: HTMLElement,
  o: { hero: Hero; tier: Tier; look: Look; size: number; turn: number },
): Promise<() => void> {
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(o.size, o.size);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  el.appendChild(renderer.domElement);
  const scene = new T.Scene();
  const mesh = new T.Mesh(heroModel(o.hero, o.tier), material(o.look));
  const [fw, fh] = FOOT[o.hero];
  mesh.position.set(-fw / 2, 0, -fh / 2);
  scene.add(mesh);
  scene.add(new T.HemisphereLight("#f6f2ea", "#8a7a66", 1.6));
  const key = new T.DirectionalLight("#fff3e0", 2.2);
  key.position.set(3, 6, 5);
  // (on nothing: the page under the canvas too)
  for (const e of [document.documentElement, document.body]) e.style.background = "transparent";
  scene.add(key);
  const box = new T.Box3().setFromObject(mesh);
  const sphere = box.getBoundingSphere(new T.Sphere());
  const camera = new T.PerspectiveCamera(24, 1, 0.05, 50);
  const dist = (sphere.radius * 1.08) / Math.sin(T.MathUtils.degToRad(12));
  const tilt = 0.42;
  camera.position.set(
    sphere.center.x + Math.sin(o.turn) * Math.cos(tilt) * dist,
    sphere.center.y + Math.sin(tilt) * dist,
    sphere.center.z + Math.cos(o.turn) * Math.cos(tilt) * dist,
  );
  camera.lookAt(sphere.center);
  const post = new Post3(renderer, scene, camera, true);
  post.setSize(o.size, o.size, 1);
  post.setNight(0);
  let n = 0;
  let stop = false;
  const tick = () => {
    if (stop) return;
    post.render(false);
    if (++n > 4) (window as unknown as { __shot?: boolean }).__shot = true;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => {
    stop = true;
    renderer.dispose();
    el.innerHTML = "";
  };
}
