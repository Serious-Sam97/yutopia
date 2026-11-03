import { ISO_PX, isKind, variantOf, type WorldObjectDef } from "@yutopia/shared";
import { frameOf } from "@yutopia/shared/shapes";
import { slotTrackOf } from "@yutopia/shared/slotcar";
import type { BufferGeometry } from "three";
import type { Out } from "../tp/kit3d";
import {
  bowl,
  column,
  DECOR_LOOKS,
  DECOR_THINGS,
  partition,
  petBed,
  petHouse,
  pkPole,
  pkRail,
  pkWall,
  plant,
  rug,
  scratchPost,
  standupMat,
  toyBox,
} from "./decor";
import { coffeeMachine, computer, DESK_THINGS, DESKTOP_LOOKS, radio, turntable } from "./desktop";
import { FURN } from "./flag";
import { type Look, Model } from "./kit";
import { CEL_ALPHA } from "./look";
import {
  arcade,
  crtTerminal,
  lamp,
  lampPost,
  micStand,
  mixingDesk,
  PLAY_LOOKS,
  piano,
  pingpongTable,
  serverRack,
  slotTrack,
  speakerCab,
  vending,
  waterCooler,
} from "./play";
import {
  cinemaScreen,
  console2600,
  consoleGb,
  consoleMd,
  consoleNes,
  consolePs1,
  consolePs1Slim,
  consoleSnes,
  crtTv,
  projector,
  projectorScreen,
  SCREEN_LOOKS,
  tvConsole,
  tvGiant,
  tvHd,
  tvPortable,
  tvWall,
} from "./screens";
import { armchair, beanbag, bench, chair, LOOKS, sofa } from "./seating";
import {
  barStool,
  coatRack,
  filingCabinet,
  fridge,
  highTable,
  microwave,
  panelLight,
  pendantLight,
  phoneBooth,
  printer,
  STAPLE_LOOKS,
  shelving,
  standingDesk,
  wallShelf,
} from "./staples";
import { bookcase, cartShelf, cupboard, discRack, locker, STORAGE_LOOKS, tapeShelf } from "./storage";
import { coffeeTable, counter, desk, meetingTable, reception, sideTable, TABLE_LOOKS } from "./tables";
import {
  acousticPanel,
  boardWall,
  clock,
  lightSwitch,
  neon,
  noticeBoard,
  pictureFrame,
  poster,
  screenWall,
  WALL_LOOKS,
  whiteboard,
} from "./walls";

// The kinds the kit draws in the world (docs/plan/67-the-furniture.md, phase 1): World3.drawObject
// asks here before the iso art. Each model is built once a look (its kind and what changes it: the
// fabric), in its own frame — x across its footprint, z down it, y up, metres — and turned into the
// world's buffers as the physics' shapes are turned (shared shapes turnPoint), its vertices marked
// for the cel (look.ts). `signed`: its family's signed off, drawn for everyone; otherwise only with
// ?furn=new.

interface Kind {
  signed: boolean;
  /** what makes two of them look different (the cache's key) */
  look: (o: WorldObjectDef) => string;
  make: (o: WorldObjectDef) => BufferGeometry;
}

const hexOf = (c: unknown): number | null =>
  typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? Number.parseInt(c.slice(1), 16) : null;

/** 0..1 from an id (a story detail's pick: the same thing always the same), in 20 steps. */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (Math.floor(((h >>> 0) % 1000) / 50) + 0.5) / 20;
}
/** The looks each kind the kit draws has, by name (its `props.variant`s). */
export const LOOK_NAMES: Record<string, readonly string[]> = {
  ...LOOKS,
  ...TABLE_LOOKS,
  ...STORAGE_LOOKS,
  ...DESKTOP_LOOKS,
  ...SCREEN_LOOKS,
  ...PLAY_LOOKS,
  ...WALL_LOOKS,
  ...DECOR_LOOKS,
  ...STAPLE_LOOKS,
};

/** The iso art's seed for an id (kit.ts seedOf, world/games/room.ts): what picked a look unset. */
function idHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
/** A placed thing's look: its picked variant — unset, as everything else in the world reads it
 *  (shared variantOf: the catalog's `look` where a room should match, else picked by its id, as the
 *  iso art and the game room's LCD do) — its fabric or paint, its seed, sat on. */
function lookOf(o: WorldObjectDef): Look {
  const n = LOOK_NAMES[o.kind]?.length ?? 1;
  const v = isKind(o.kind) ? variantOf(o, idHash(o.id)) : 0;
  return {
    look: Number.isInteger(v) && v >= 0 && v < n ? v : 0,
    fabric: hexOf(o.props?.color),
    seed: seedOf(o.id),
    occupied: !!o.props?.occupied,
    ...(typeof o.props?.on === "boolean" ? { on: o.props.on } : {}),
  };
}
const drawn = (draw: (m: Model, l: Look) => void, signed = false): Kind => ({
  signed,
  look: (o) => JSON.stringify(lookOf(o)),
  make: (o) => {
    const m = new Model(2);
    draw(m, lookOf(o));
    return m.geometry();
  },
});

const KINDS: Record<string, Kind> = {
  // phase 2: seating (signed off, in the world 2026-11-03)
  chair: drawn(chair, true),
  armchair: drawn(armchair, true),
  sofa: drawn(sofa, true),
  beanbag: drawn(beanbag, true),
  bench: drawn(bench, true),
  // phase 3: desks, tables, storage (signed off, in the world 2026-11-03)
  desk: drawn(desk, true),
  meeting_table: drawn(meetingTable, true),
  coffee_table: drawn(coffeeTable, true),
  side_table: drawn(sideTable, true),
  reception: drawn(reception, true),
  counter: drawn(counter, true),
  cupboard: drawn(cupboard, true),
  bookcase: drawn(bookcase, true),
  tape_shelf: drawn(tapeShelf, true),
  locker: drawn(locker, true),
  cart_shelf: drawn(cartShelf, true),
  disc_rack: drawn(discRack, true),
  // phase 4: on desks (signed off, in the world 2026-11-03)
  computer: drawn(computer, true),
  radio: drawn(radio, true),
  turntable: drawn(turntable, true),
  coffee_machine: drawn(coffeeMachine, true),
  // phase 5: screens and games (in the world 2026-11-03)
  crt_tv: drawn(crtTv, true),
  tv_console: drawn(tvConsole, true),
  tv_portable: drawn(tvPortable, true),
  projector: drawn(projector, true),
  tv_wall: drawn(tvWall, true),
  tv_hd: drawn(tvHd, true),
  tv_giant: drawn(tvGiant, true),
  projector_screen: drawn(projectorScreen, true),
  cinema_screen: drawn(cinemaScreen, true),
  console_2600: drawn(console2600, true),
  console_nes: drawn(consoleNes, true),
  console_snes: drawn(consoleSnes, true),
  console_md: drawn(consoleMd, true),
  console_gb: drawn(consoleGb, true),
  console_ps1: drawn(consolePs1, true),
  console_ps1_slim: drawn(consolePs1Slim, true),
  // phase 6: play, tech, music, the lights (in the world 2026-11-03: "finish all phases")
  arcade: drawn(arcade, true),
  vending: drawn(vending, true),
  water_cooler: drawn(waterCooler, true),
  piano: drawn(piano, true),
  pingpong_table: drawn(pingpongTable, true),
  server_rack: drawn(serverRack, true),
  crt_terminal: drawn(crtTerminal, true),
  mixing_desk: drawn(mixingDesk, true),
  speaker_cab: drawn(speakerCab, true),
  mic_stand: drawn(micStand, true),
  lamp: drawn(lamp, true),
  lamp_post: drawn(lampPost, true),
  slot_track: {
    signed: true,
    // (the circuit on it: props.track)
    look: (o) => slotTrackOf(o.props),
    make: (o) => {
      const m = new Model(2);
      slotTrack(m, slotTrackOf(o.props));
      return m.geometry();
    },
  },
  // phase 7: on the walls (in the world 2026-11-03)
  board_wall: drawn(boardWall, true),
  screen_wall: drawn(screenWall, true),
  whiteboard: drawn(whiteboard, true),
  notice_board: drawn(noticeBoard, true),
  acoustic_panel: drawn(acousticPanel, true),
  neon: drawn(neon, true),
  light_switch: drawn(lightSwitch, true),
  clock: {
    signed: true,
    // (a picture of it shows ten past ten: the world draws its hands live, tp/live.ts)
    look: (o) => (o.props?._thumb ? "thumb" : ""),
    make: (o) => {
      const m = new Model(2);
      clock(m, { ...lookOf(o), thumb: !!o.props?._thumb });
      return m.geometry();
    },
  },
  poster: {
    signed: true,
    look: (o) => String(o.props?.art ?? "tape"),
    make: (o) => {
      const m = new Model(2);
      poster(m, String(o.props?.art ?? "tape"));
      return m.geometry();
    },
  },
  frame: {
    signed: true,
    // (its picture by props.seed, the iso art's 0.5 unset)
    look: (o) => frameSeed(o.props?.seed).toFixed(3),
    make: (o) => {
      const m = new Model(2);
      pictureFrame(m, frameSeed(o.props?.seed));
      return m.geometry();
    },
  },
  // phase 8: decor, the floor, pets, outside (in the world 2026-11-03)
  plant: drawn(plant, true),
  partition: drawn(partition, true),
  column: drawn(column, true),
  rug: drawn(rug, true),
  standup_mat: drawn(standupMat, true),
  pet_bed: drawn(petBed, true),
  pet_bowl: portioned(false),
  water_bowl: portioned(true),
  scratch_post: drawn(scratchPost, true),
  pet_house: drawn(petHouse, true),
  toy_box: drawn(toyBox, true),
  pk_rail: drawn((m) => pkRail(m, 4), true),
  pk_rail_long: drawn((m) => pkRail(m, 8), true),
  pk_wall: drawn((m) => pkWall(m, 3.2), true),
  pk_wall_tall: drawn((m) => pkWall(m, 6), true),
  pk_pole: drawn((m) => pkPole(m, 3), true),
  pk_pole_tall: drawn((m) => pkPole(m, 5.5), true),
  decor: {
    signed: true,
    // (what it is, props.d — a plant unset — and its seed in 20 steps)
    look: (o) => `${decorOf(o)}|${thingSeed(o.props?.seed)}`,
    make: (o) => thing(decorOf(o), thingSeed(o.props?.seed), true),
  },
  // phase 8b: the office staples (new kinds, in the world 2026-11-03)
  standing_desk: drawn(standingDesk, true),
  filing_cabinet: drawn(filingCabinet, true),
  printer: drawn(printer, true),
  shelving: drawn(shelving, true),
  fridge: drawn(fridge, true),
  microwave: drawn(microwave, true),
  bar_stool: drawn(barStool, true),
  high_table: drawn(highTable, true),
  phone_booth: drawn(phoneBooth, true),
  coat_rack: drawn(coatRack, true),
  wall_shelf: drawn(wallShelf, true),
  pendant_light: drawn(pendantLight, true),
  panel_light: drawn(panelLight, true),
  tabletop: {
    signed: true,
    // (what it is, its look's seed in 20 steps, a lamp switched off)
    look: (o) => `${o.props?.d}|${thingSeed(o.props?.seed)}|${o.props?.on !== false}`,
    make: (o) => thing(String(o.props?.d), thingSeed(o.props?.seed), o.props?.on !== false),
  },
};

const frameSeed = (s: unknown) => (typeof s === "number" && Number.isFinite(s) ? s : 0.5);
/** A pet's bowl: what's left in it (props.portions) changes it too. */
function portioned(water: boolean): Kind {
  return {
    signed: true,
    look: (o) => `${JSON.stringify(lookOf(o))}|${Number(o.props?.portions ?? 0)}`,
    make: (o) => {
      const m = new Model(2);
      bowl(m, lookOf(o), water, Number(o.props?.portions ?? 0));
      return m.geometry();
    },
  };
}
const decorOf = (o: WorldObjectDef) => {
  const d = String(o.props?.d ?? "plant");
  return d in DECOR_THINGS ? d : "plant";
};
/** A desk thing's seed (props.seed, 0..1; the catalog's 0.37 unset) in 20 steps. */
const thingSeed = (s: unknown) => (Math.floor((typeof s === "number" && s >= 0 && s < 1 ? s : 0.37) * 20) + 0.5) / 20;
function thing(d: string, seed: number, on: boolean): BufferGeometry {
  const m = new Model(2);
  // (none said: the mug, the one the physics' shape is: shared shapes)
  if (d === "frame") pictureFrame(m, seed);
  else if (d in DECOR_THINGS) DECOR_THINGS[d](m, seed);
  else (DESK_THINGS[d] ?? DESK_THINGS.mug)(m, seed, on);
  return m.geometry();
}

/** Does the kit draw this kind here (signed off, or ?furn=new; never with ?furn=old)? */
export function isNative(kind: string): boolean {
  const k = KINDS[kind];
  return !!k && FURN !== "old" && (k.signed || FURN === "new");
}

const cache = new Map<string, BufferGeometry>();
/** The model of a placed thing (built once a look). */
export function modelOf(o: WorldObjectDef): BufferGeometry {
  const k = KINDS[o.kind];
  const key = `${o.kind}|${k.look(o)}`;
  let g = cache.get(key);
  if (!g) {
    g = k.make(o);
    cache.set(key, g);
  }
  return g;
}

/** Draw a placed thing into `out`: its model turned onto its frame as the physics' shapes are
 *  (shared shapes frameOf, turnPoint: each turn (u, v) → (h − v, u); a thing on a surface round its
 *  middle, lifted to it), pulled the way it faces by `props.pull`, and its contact shadow on the
 *  floor under it. */
export function nativeInto(out: Out, o: WorldObjectDef): void {
  const f = frameOf(o);
  into(out, modelOf(o), f, Number(o.props?.pull) || 0);
}

/** Does the kit draw this piece of the rooms' dressing (a mug, papers, a monitor…) here? */
export function isNativeDress(kind: string): boolean {
  return (
    (kind in DESK_THINGS && isNative("tabletop")) ||
    (kind in DECOR_THINGS && isNative("decor")) ||
    // (a frame the room hangs itself: in its wall's frame, as one hung by hand — build.ts dressAt)
    (kind === "frame" && isNative("frame"))
  );
}
const dressCache = new Map<string, BufferGeometry>();
/** A piece of the rooms' dressing (shared dressing.ts), drawn as the same thing put down by hand is:
 *  round its middle (x, y), `z` iso px up, unturned. */
export function nativeDressInto(out: Out, d: { kind: string; x: number; y: number; z: number; seed: number }): void {
  const seed = thingSeed(d.seed);
  const key = `${d.kind}|${seed}`;
  let g = dressCache.get(key);
  if (!g) {
    g = thing(d.kind, seed, true);
    dressCache.set(key, g);
  }
  into(out, g, { x: d.x - 0.5, y: d.y - 0.5, rot: 0, w: 1, h: 1, lift: d.z / ISO_PX }, 0);
}

function into(
  out: Out,
  g: BufferGeometry,
  fr: { x: number; y: number; rot: number; w: number; h: number; lift: number },
  pull: number,
): void {
  const o = fr;
  const lift = fr.lift;
  const rot = fr.rot & 3;
  const pos = g.attributes.position.array;
  const nor = g.attributes.normal.array;
  const col = g.attributes.color.array;
  const turn = (u: number, v: number, n: boolean): [number, number] => {
    let X = u;
    let Y = v;
    let H = fr.h;
    let W = fr.w;
    for (let i = 0; i < rot; i++) {
      [X, Y] = [(n ? 0 : H) - Y, X];
      [W, H] = [H, W];
    }
    return [X, Y];
  };
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  const v: [number, number, number][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let t = 0; t < pos.length; t += 9) {
    for (let k = 0; k < 3; k++) {
      const i = t + k * 3;
      const [X, Y] = turn(pos[i], pos[i + 2] + pull, false);
      v[k] = [o.x + X, pos[i + 1] + lift, o.y + Y];
      if (pos[i + 1] < 0.2) {
        x0 = Math.min(x0, v[k][0]);
        x1 = Math.max(x1, v[k][0]);
        y0 = Math.min(y0, v[k][2]);
        y1 = Math.max(y1, v[k][2]);
      }
    }
    const [nx, nz] = turn(nor[t], nor[t + 2], true);
    out.lit.tri(v[0], v[1], v[2], [nx, nor[t + 1], nz], [col[t], col[t + 1], col[t + 2], CEL_ALPHA]);
  }
  // what glows: into the glow buffers as it is (unshaded; it blooms after dark)
  const glow = g.userData.glow as BufferGeometry | null;
  if (glow) {
    const gp = glow.attributes.position.array;
    const gn = glow.attributes.normal.array;
    const gc = glow.attributes.color.array;
    const w: [number, number, number][] = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (let t = 0; t < gp.length; t += 9) {
      for (let k = 0; k < 3; k++) {
        const i = t + k * 3;
        const [X, Y] = turn(gp[i], gp[i + 2] + pull, false);
        w[k] = [o.x + X, gp[i + 1] + lift, o.y + Y];
      }
      const [nx, nz] = turn(gn[t], gn[t + 2], true);
      out.glow.tri(w[0], w[1], w[2], [nx, gn[t + 1], nz], [gc[t], gc[t + 1], gc[t + 2], 1]);
    }
  }
  // (what stands low makes the shadow on the floor: a chair's base, a sofa's plinth)
  if (Number.isFinite(x0) && lift === 0)
    out.soft.rects.push({ x0: x0 + 0.04, y0: y0 + 0.04, x1: x1 - 0.04, y1: y1 - 0.04, op: 0.32, round: 0.35 });
}
