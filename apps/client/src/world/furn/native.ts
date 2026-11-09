import {
  CATALOG,
  entry,
  isFreeThing,
  isKind,
  isOpening,
  quarterOf,
  SURFACE,
  TEXT_DEFAULT,
  variantOf,
  type WorldObjectDef,
} from "@yutopia/shared";
import { cleanText } from "@yutopia/shared/glyphs";
import { frameOf } from "@yutopia/shared/shapes";
import { slotTrackOf } from "@yutopia/shared/slotcar";
import { BufferGeometry, Euler, Float32BufferAttribute, type Group, type Material, Matrix4, Vector3 } from "three";
import { Out } from "../tp/kit3d";
import { poolTable3 } from "../tp/pooltable3d";
import {
  bayBoardLook,
  bayBoardModel,
  carLook,
  carModel,
  elevatorLook,
  elevatorModel,
  flightModel,
  stairsModel,
} from "./building-native";
import {
  bowl,
  column,
  DECOR_LOOKS,
  DECOR_THINGS,
  FIREPLACE_LOOKS,
  fireplace,
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
import { coffeeMachine, computer, DESK_THINGS, DESKTOP_LOOKS, LAVA_LOOKS, lavaLamp, radio, turntable } from "./desktop";
import { FAM_DRAW, FAM_LOOKS } from "./fam";
import { type LivePart, type Look, Model } from "./kit";
import { KIT_MATS } from "./life-mats";
import { liveAt, liveGroup } from "./liveparts";
import { CEL_ALPHA } from "./look";
import { openingLook, openingModel } from "./openings";
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
import { armchair, beanbag, bench, chair, LOOKS, LOVESEAT_LOOKS, loveseat, sofa } from "./seating";
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
  marqueeSign,
  neon,
  noticeBoard,
  pictureFrame,
  poster,
  screenWall,
  splitFlap,
  vfdTicker,
  WALL_LOOKS,
  WORD_LOOKS,
  whiteboard,
} from "./walls";
import {
  adventCalendar,
  adventDay,
  candleArch,
  candyCane,
  cocoaStation,
  garland,
  gingerbreadHouse,
  inflatableSnowman,
  mistletoe,
  nutcracker,
  poinsettia,
  presents,
  reindeer,
  sleigh,
  snowGlobe,
  stocking,
  wrappingTable,
  wreath,
  XMAS_LOOKS,
  xmasTree,
  xmasTreeSmall,
  xmasVillage,
} from "./xmas";

// The kinds the kit draws in the world (docs/plan/67-the-furniture.md, phase 1): World3.drawObject
// asks here. Each model is built once a look (its kind and what changes it: the
// fabric), in its own frame — x across its footprint, z down it, y up, metres — and turned into the
// world's buffers as the physics' shapes are turned (shared shapes turnPoint), its vertices marked
// for the cel (look.ts). `signed`: its family's signed off, drawn for everyone; otherwise only with
// ?furn=new.

interface Kind {
  signed: boolean;
  /** new since plan 67: nothing else draws it, so the kit does even before it's signed off (it's
   *  kept out of the panel till then) */
  fresh?: boolean;
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
  ...WORD_LOOKS,
  ...DECOR_LOOKS,
  ...STAPLE_LOOKS,
  // plan 68's
  loveseat: LOVESEAT_LOOKS,
  fireplace: FIREPLACE_LOOKS,
  lava_lamp: LAVA_LOOKS,
  ...XMAS_LOOKS,
  // plan 68's families (fam/*.ts)
  ...FAM_LOOKS,
  // (plan 68 phase 13: the doors and windows, one look each)
  ...Object.fromEntries(
    Object.keys(CATALOG)
      .filter(isOpening)
      .map((k) => [k, [entry(k).label]]),
  ),
};

/** A thing's seed for an id (FNV-1a, as art/seed.ts seedOf and world/games/room.ts): what picked a look unset. */
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
 *  game room's LCD does) — its fabric or paint, its seed, sat on. */
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
    const l = lookOf(o);
    // (the life look: its picked colour's parts are cloth)
    m.fabric = l.fabric;
    draw(m, l);
    return m.geometry();
  },
});

const dayOf = (o: WorldObjectDef) => (typeof o.props?._day === "number" ? o.props._day : adventDay());

/** A door or window (plan 68 phase 13: furn/openings.ts) as the catalog's pictures and the bench
 *  draw it: on its own, no posts at its ends. */
const opening = (_kind: string): Kind => {
  const L = (o: WorldObjectDef) => openingLook(o, entry(o.kind).w, 0, entry(o.kind).w);
  return { signed: true, look: (o) => JSON.stringify(L(o)), make: (o) => openingModel(L(o)) };
};

/** A model from what something draws into an Out (its lit faces, what glows): the kit's frame. */
function outModel(draw: (out: Out) => void): BufferGeometry {
  const out = new Out();
  draw(out);
  const geo = (g: Out["lit"]) => {
    const b = new BufferGeometry();
    b.setAttribute("position", new Float32BufferAttribute(g.pos, 3));
    b.setAttribute("normal", new Float32BufferAttribute(g.nor, 3));
    const c = new Float32Array((g.col.length / 4) * 3);
    for (let i = 0, j = 0; i < g.col.length; i += 4, j += 3) c.set([g.col[i], g.col[i + 1], g.col[i + 2]], j);
    b.setAttribute("color", new Float32BufferAttribute(c, 3));
    b.computeBoundingBox();
    b.computeBoundingSphere();
    return b;
  };
  const g = geo(out.lit);
  g.userData.glow = out.glow.empty ? null : geo(out.glow);
  g.userData.clear = null;
  g.userData.live = [];
  return g;
}

/** A kind built from its props (plan 72 phase 12: the sketches' last kinds). */
const propKind = (look: (o: WorldObjectDef) => string, draw: (m: Model, o: WorldObjectDef) => void): Kind => ({
  signed: true,
  look,
  make: (o) => {
    const m = new Model(2);
    draw(m, o);
    return m.geometry();
  },
});

const KINDS: Record<string, Kind> = {
  // plan 72 phase 12: the sketches' last kinds (signed off 2026-11-06)
  stairs: propKind(
    () => "",
    (m) => stairsModel(m),
  ),
  elevator: propKind(elevatorLook, (m, o) => elevatorModel(m, o.props ?? {})),
  car: propKind(
    (o) => `${carLook(o)}|${lookOf(o).look}`,
    (m, o) => carModel(m, o.props ?? {}, lookOf(o).look),
  ),
  flight: propKind(
    (o) => String(o.props?.rise ?? ""),
    (m, o) => flightModel(m, o.props ?? {}),
  ),
  bayboard: propKind(bayBoardLook, (m, o) => bayBoardModel(m, o.props ?? {})),
  // (the pool table's own model, tp/pooltable3d.ts, as a kit model: its pictures)
  pool_table: {
    signed: true,
    look: (o) => String(Math.floor(lookOf(o).seed * 4)),
    make: (o) => outModel((out) => poolTable3(out, { x: 0, y: 0 }, 0, lookOf(o).seed)),
  },
  // plan 68 phase 13: the doors and windows (drawn in their walls by openingInto)
  ...Object.fromEntries(
    Object.keys(CATALOG)
      .filter(isOpening)
      .map((k) => [k, opening(k)]),
  ),
  // plan 68's families, phases 3–20 (fam/*.ts)
  ...Object.fromEntries(Object.entries(FAM_DRAW).map(([k, draw]) => [k, drawn(draw, true)])),
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
    // (its picture by props.seed, 0.5 unset)
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
  // plan 68 phase 0: the bench's heroes (signed off, in the world 2026-11-03)
  loveseat: drawn(loveseat, true),
  fireplace: drawn((m, o) => fireplace(m, o, SURFACE.fireplace), true),
  lava_lamp: drawn(lavaLamp, true),
  // plan 68 phase 1: words on things (props.text; the ticker's and the split-flap's drawn live)
  marquee_sign: {
    signed: true,
    look: (o) => wordsOf(o),
    make: (o) => {
      const m = new Model(2);
      marqueeSign(m, wordsOf(o));
      return m.geometry();
    },
  },
  vfd_ticker: drawn(vfdTicker, true),
  split_flap: drawn(splitFlap, true),
  // plan 68 phase 2: Christmas (signed off, in the world 2026-11-03)
  xmas_tree: drawn(xmasTree, true),
  xmas_tree_small: drawn(xmasTreeSmall, true),
  present: drawn(presents, true),
  stocking: {
    signed: true,
    // (full from Christmas Day: December's date, or the bench's `_day`)
    look: (o) => `${JSON.stringify(lookOf(o))}|${wordsOf(o)}|${dayOf(o) >= 25}`,
    make: (o) => {
      const m = new Model(2);
      stocking(m, lookOf(o), wordsOf(o), dayOf(o) >= 25);
      return m.geometry();
    },
  },
  wreath: drawn(wreath, true),
  garland: drawn(garland, true),
  mistletoe: drawn(mistletoe, true),
  cocoa_station: drawn(cocoaStation, true),
  gingerbread_house: drawn(gingerbreadHouse, true),
  xmas_village: drawn(xmasVillage, true),
  nutcracker: drawn(nutcracker, true),
  candle_arch: drawn(candleArch, true),
  poinsettia: drawn(poinsettia, true),
  // (opened to today: December's date, or the bench's `_day`)
  advent_calendar: {
    signed: true,
    look: (o) => `${JSON.stringify(lookOf(o))}|${dayOf(o)}`,
    make: (o) => {
      const m = new Model(2);
      adventCalendar(m, lookOf(o), dayOf(o));
      return m.geometry();
    },
  },
  wrapping_table: drawn(wrappingTable, true),
  candy_cane: drawn(candyCane, true),
  reindeer: drawn(reindeer, true),
  sleigh: drawn(sleigh, true),
  inflatable_snowman: drawn(inflatableSnowman, true),
  snow_globe: drawn(snowGlobe, true),
  // (plan 68 phase 12: open at today's page — drawn again once the date's moved on)
  wall_calendar: {
    signed: true,
    look: (o) => `${JSON.stringify(lookOf(o))}|${new Date().toDateString()}`,
    make: (o) => {
      const m = new Model(2);
      FAM_DRAW.wall_calendar(m, lookOf(o));
      return m.geometry();
    },
  },
  // plan 68 phases 23–24: the chess table, the dartboard with its darts (the room's). Plan 70: the table
  // without its men — they're the living men, drawn apart from the room's game (chessmen3d.ts), so a
  // move never redraws the table; only its picture has them, set out to start
  chess_table: {
    signed: true,
    look: (o) => `${JSON.stringify(lookOf(o))}${o.props?._thumb ? "|men" : ""}`,
    make: (o) => {
      const m = new Model(2);
      FAM_DRAW.chess_table(m, { ...lookOf(o), men: !!o.props?._thumb } as Look);
      return m.geometry();
    },
  },
  dartboard: {
    signed: true,
    look: (o) => `${JSON.stringify(lookOf(o))}|${JSON.stringify(o.props?.darts ?? null)}`,
    make: (o) => {
      const m = new Model(2);
      const darts = Array.isArray(o.props?.darts) ? (o.props.darts as [number, number][]) : null;
      FAM_DRAW.dartboard(m, { ...lookOf(o), ...(darts ? { darts } : {}) } as Look);
      return m.geometry();
    },
  },
  tabletop: {
    signed: true,
    // (what it is, its look's seed in 20 steps, a lamp switched off)
    look: (o) => `${o.props?.d}|${thingSeed(o.props?.seed)}|${o.props?.on !== false}`,
    make: (o) => thing(String(o.props?.d), thingSeed(o.props?.seed), o.props?.on !== false),
  },
};

/** A sign's words: its own, or its kind's default (shared TEXT_DEFAULT), as the face draws them. */
export function wordsOf(o: WorldObjectDef): string {
  const max = (isKind(o.kind) && entry(o.kind).text) || 0;
  const t = typeof o.props?.text === "string" ? o.props.text : (TEXT_DEFAULT[o.kind] ?? "");
  return cleanText(t, max);
}
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

/** Does the kit draw this kind here (signed off; plan 72 phase 12: the old art's switch gone)? */
export function isNative(kind: string): boolean {
  const k = KINDS[kind];
  return !!k && (k.signed || !!k.fresh);
}

const cache = new Map<string, BufferGeometry>();
// (the kinds drawn by their state — the darts in a board, today's page — keep only each
// one's latest model: a game's every move would otherwise stay in memory)
const STATEFUL = new Set(["dartboard", "wall_calendar", "advent_calendar"]);
const stateKey = new Map<string, string>();
/** The model of a placed thing (built once a look). */
export function modelOf(o: WorldObjectDef): BufferGeometry {
  const k = KINDS[o.kind];
  const key = `${o.kind}|${k.look(o)}`;
  if (STATEFUL.has(o.kind)) {
    const was = stateKey.get(o.id);
    if (was !== undefined && was !== key) {
      stateKey.set(o.id, key);
      if (![...stateKey.values()].includes(was)) cache.delete(was);
    } else stateKey.set(o.id, key);
  }
  let g = cache.get(key);
  if (!g) {
    g = k.make(o);
    if (!STATEFUL.has(o.kind)) g = once(g);
    cache.set(key, g);
  }
  return g;
}

// Looks that come out the same kept once (plan 72 phase 13's memory pass): a look's key has its seed,
// and most kinds draw no differently for it — an office's chairs and desks were 20 models a kind, the
// same numbers each (~45 MB of a page's ~1 GB). By what's in them, exactly; those with live parts
// (their own state) each their own.
const sameAs = new Map<number, BufferGeometry[]>();
function once(g: BufferGeometry): BufferGeometry {
  const u = g.userData as { glow?: BufferGeometry | null; clear?: BufferGeometry | null; live?: unknown[] };
  const plain = Object.keys(u).every((k) => k === "glow" || k === "clear" || k === "live") && !u.live?.length;
  if (!plain) return g;
  const h = hashOf([g, u.glow ?? null, u.clear ?? null]);
  const list = sameAs.get(h) ?? [];
  for (const c of list) {
    const cu = c.userData as typeof u;
    if (sameGeo(c, g) && sameGeo(cu.glow ?? null, u.glow ?? null) && sameGeo(cu.clear ?? null, u.clear ?? null)) {
      g.dispose();
      u.glow?.dispose();
      u.clear?.dispose();
      return c;
    }
  }
  list.push(g);
  sameAs.set(h, list);
  return g;
}
/** The arrays of each attribute (by name) and the index, as their raw bytes (in words where they
 *  divide): the same bytes, the same. */
function wordsOfGeo(g: BufferGeometry): [string, number, Uint32Array | Uint8Array][] {
  const raw = (v: ArrayBufferView) =>
    v.byteLength % 4 === 0 && v.byteOffset % 4 === 0
      ? new Uint32Array(v.buffer, v.byteOffset, v.byteLength / 4)
      : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  const out: [string, number, Uint32Array | Uint8Array][] = [];
  for (const name of Object.keys(g.attributes).sort()) {
    const a = g.attributes[name] as unknown as { array: ArrayBufferView; itemSize: number };
    out.push([name, a.itemSize, raw(a.array)]);
  }
  if (g.index)
    out.push([
      "index",
      (g.index.array as unknown as Uint32Array).BYTES_PER_ELEMENT,
      raw(g.index.array as unknown as ArrayBufferView),
    ]);
  return out;
}
function hashOf(gs: (BufferGeometry | null)[]): number {
  let h = 2166136261;
  for (const g of gs) {
    h = Math.imul(h ^ (g ? 1 : 0), 16777619);
    if (!g) continue;
    for (const [name, size, w] of wordsOfGeo(g)) {
      h = Math.imul(h ^ (name.length * 31 + size + w.length * 7), 16777619);
      for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w[i], 16777619);
    }
  }
  return h >>> 0;
}
function sameGeo(a: BufferGeometry | null, b: BufferGeometry | null): boolean {
  if (!a || !b) return a === b;
  if (Object.keys(a.morphAttributes).length || Object.keys(b.morphAttributes).length) return false;
  const wa = wordsOfGeo(a);
  const wb = wordsOfGeo(b);
  if (wa.length !== wb.length) return false;
  for (let i = 0; i < wa.length; i++) {
    const [na, sa, xa] = wa[i];
    const [nb, sb, xb] = wb[i];
    if (na !== nb || sa !== sb || xa.length !== xb.length) return false;
    for (let j = 0; j < xa.length; j++) if (xa[j] !== xb[j]) return false;
  }
  return true;
}

/** Draw a placed thing into `out`: its model turned onto its frame as the physics' shapes are
 *  (shared shapes frameOf, turnPoint: each turn (u, v) → (h − v, u); a thing on a surface round its
 *  middle, lifted to it), pulled the way it faces by `props.pull`, and its contact shadow on the
 *  floor under it. */
export function nativeInto(out: Out, o: WorldObjectDef): void {
  const f = frameOf(o);
  into(out, modelOf(o), f, Number(o.props?.pull) || 0);
}

/** How a seat that moves while it's sat in (the egg chair's swivel, the rocking chair's rock, the
 *  hanging chair's and the hammock's sway) is turned at time `t` (s, the live parts' clock): the axis
 *  and the point it turns about in the floor's frame (tiles, m up), and by how much — its sitter goes
 *  with it. Read from its live part, placed exactly as `liveInto` places it; null if it has none. */
export function seatMotion(o: WorldObjectDef, t: number): { pivot: Vector3; axis: Vector3; angle: number } | null {
  if (!KINDS[o.kind] || isOpening(o.kind)) return null;
  const part = ((modelOf(o).userData.live as LivePart[] | undefined) ?? []).find((p) => p.anim.kind === "nod");
  if (!part) return null;
  const f = frameOf(o);
  const [tx, tz] = frameTurn(f)(0, Number(o.props?.pull) || 0, false);
  const place = new Matrix4().makeRotationY(-(f.rot & 3) * (Math.PI / 2)).setPosition(f.x + tx, f.lift, f.y + tz);
  // (a nod turns the part round its own z, the part turned by its rest: liveparts.ts animateLive)
  const axis = new Vector3(0, 0, 1)
    .applyEuler(new Euler(part.rot[0], part.rot[1], part.rot[2], "YXZ"))
    .transformDirection(place);
  return { pivot: new Vector3(...part.at).applyMatrix4(place), axis, angle: liveAt(part.anim, t).turn[1] };
}

/** Where a placed thing's model goes in the floor's frame (tiles, m up): turned by its frame, pulled
 *  — as `into` turns it into the world's buffers and `liveInto` places its live parts. */
export function placeOf(o: WorldObjectDef): Matrix4 {
  const f = frameOf(o);
  const [tx, tz] = frameTurn(f)(0, Number(o.props?.pull) || 0, false);
  return new Matrix4().makeRotationY(-(f.rot & 3) * (Math.PI / 2)).setPosition(f.x + tx, f.lift, f.y + tz);
}

/** A placed thing's live parts (plan 68: a lava lamp's blobs, a fire's flames) as a group, placed
 *  exactly as its model is turned into the world's buffers (`into`: turned by its frame, pulled),
 *  or null when it has none. */
export function liveInto(o: WorldObjectDef, lit: Material, glow: Material, glass: Material): Group | null {
  // (whether the kit draws it here is the caller's: World3 asks isNative, the bench draws them all)
  if (!KINDS[o.kind]) return null;
  const geo = modelOf(o);
  // (in the world's own materials: their colours as the buffers have them — RGBA, the cel's mark on
  // the lit ones, look.ts)
  for (const p of (geo.userData.live as LivePart[] | undefined) ?? []) rgba(p.geo, p.glow || p.glass ? 1 : CEL_ALPHA);
  const g = liveGroup(geo, lit, glow, glass);
  if (!g) return null;
  if (isOpening(o.kind)) {
    // (in its wall: along it from its first edge, turned for a west one — as openingInto places it)
    g.position.set(o.x, 0, o.y);
    // (in a wall drawn free: turned by its heading — phase 11.6)
    g.rotation.y = o.props?.free === true ? -(o.yaw ?? 0) : quarterOf(o) % 2 === 1 ? -Math.PI / 2 : 0;
    return g;
  }
  // (placed free — plan 72 phase 11.9: where it'd be at no turn with its middle at the origin, turned
  // by its yaw and set at its middle)
  const free = isFreeThing(o);
  const at = free
    ? { ...o, x: -entry(o.kind).w / 2, y: -entry(o.kind).h / 2, yaw: 0, props: { ...o.props, free: false } }
    : o;
  const f = frameOf(at);
  const [tx, tz] = frameTurn(f)(0, Number(o.props?.pull) || 0, false);
  if (free) {
    const [lx, lz] = [f.x + tx, f.y + tz];
    const [c, s] = [Math.cos(o.yaw ?? 0), Math.sin(o.yaw ?? 0)];
    g.position.set(o.x + lx * c - lz * s, f.lift, o.y + lx * s + lz * c);
    g.rotation.y = -(o.yaw ?? 0);
    return g;
  }
  g.position.set(f.x + tx, f.lift, f.y + tz);
  g.rotation.y = -(f.rot & 3) * (Math.PI / 2);
  return g;
}

const openings = new Map<string, BufferGeometry>();
/** A door or window in its wall (plan 68 phase 13): its model along its edges from (o.x, o.y), the
 *  wall's middle its z 0 — a west wall's (odd rot) turned a quarter, x along the wall going south;
 *  its frame stopped `a0`/`a1` in at a post. */
export function openingInto(out: Out, o: WorldObjectDef, a0: number, a1: number): void {
  const L = openingLook(o, entry(o.kind).w, a0, a1);
  const key = JSON.stringify(L);
  let g = openings.get(key);
  if (!g) {
    g = openingModel(L);
    openings.set(key, g);
  }
  const west = quarterOf(o) % 2 === 1;
  // (in a wall drawn free — phase 11.6: along its heading, any angle; the tile lines' two as they were)
  const free = o.props?.free === true;
  const [c, s] = free ? [Math.cos(o.yaw ?? 0), Math.sin(o.yaw ?? 0)] : [1, 0];
  const at = (x: number, y: number, z: number): [number, number, number] =>
    free ? [o.x + x * c - z * s, y, o.y + x * s + z * c] : west ? [o.x - z, y, o.y + x] : [o.x + x, y, o.y + z];
  const nor = (x: number, z: number): [number, number] =>
    free ? [x * c - z * s, x * s + z * c] : west ? [-z, x] : [x, z];
  for (const [geo, buf, a] of [
    [g, out.lit, CEL_ALPHA],
    [g.userData.glow as BufferGeometry | null, out.glow, 1],
  ] as const) {
    if (!geo) continue;
    const p = geo.attributes.position.array;
    const n = geo.attributes.normal.array;
    const c = geo.attributes.color.array;
    for (let t = 0; t < p.length; t += 9) {
      const [nx, nz] = nor(n[t], n[t + 2]);
      buf.tri(
        at(p[t], p[t + 1], p[t + 2]),
        at(p[t + 3], p[t + 4], p[t + 5]),
        at(p[t + 6], p[t + 7], p[t + 8]),
        [nx, n[t + 1], nz],
        [c[t], c[t + 1], c[t + 2], a],
      );
    }
  }
  clearInto(out, g, at, nor);
}

/** A model's see-through parts (kit `glass`) into `out.clear`, placed by `at`, its normals by `nor`. */
export function clearInto(
  out: Out,
  g: BufferGeometry,
  at: (x: number, y: number, z: number) => [number, number, number],
  nor: (x: number, z: number) => [number, number],
): void {
  const c = g.userData.clear as BufferGeometry | null;
  if (!c) return;
  const p = c.attributes.position.array;
  const n = c.attributes.normal.array;
  const col = c.attributes.color.array;
  const op = c.attributes.op.array;
  for (let t = 0; t < p.length; t += 9) {
    const a = at(p[t], p[t + 1], p[t + 2]);
    const b = at(p[t + 3], p[t + 4], p[t + 5]);
    const d = at(p[t + 6], p[t + 7], p[t + 8]);
    const [nx, nz] = nor(n[t], n[t + 2]);
    out.clear.tri(a, b, d, [nx, n[t + 1], nz], [col[t], col[t + 1], col[t + 2], op[t / 3]]);
  }
}

function rgba(g: BufferGeometry, a: number) {
  const c = g.attributes.color;
  if (!c || c.itemSize === 4) return;
  const out = new Float32Array(c.count * 4);
  for (let i = 0; i < c.count; i++) out.set([c.getX(i), c.getY(i), c.getZ(i), a], i * 4);
  g.setAttribute("color", new Float32BufferAttribute(out, 4));
}

/** A frame's turn (shared shapes turnPoint): each quarter turn (u, v) → (h − v, u); normals turn
 *  without the shift. */
function frameTurn(fr: { rot: number; w: number; h: number }) {
  const rot = fr.rot & 3;
  return (u: number, v: number, n: boolean): [number, number] => {
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
 *  round its middle (x, y), `z` m up, unturned. */
export function nativeDressInto(out: Out, d: { kind: string; x: number; y: number; z: number; seed: number }): void {
  const seed = thingSeed(d.seed);
  const key = `${d.kind}|${seed}`;
  let g = dressCache.get(key);
  if (!g) {
    g = thing(d.kind, seed, true);
    dressCache.set(key, g);
  }
  into(out, g, { x: d.x - 0.5, y: d.y - 0.5, rot: 0, w: 1, h: 1, lift: d.z }, 0);
}

function into(
  out: Out,
  g: BufferGeometry,
  fr: { x: number; y: number; rot: number; w: number; h: number; lift: number },
  pull: number,
): void {
  const o = fr;
  const lift = fr.lift;
  const pos = g.attributes.position.array;
  const nor = g.attributes.normal.array;
  const col = g.attributes.color.array;
  const turn = frameTurn(fr);
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  const v: [number, number, number][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  // (the life look's kit: a material a point, its own normal and UVs — into its material's bucket, or
  // smooth into `lit` for a drawer that has none)
  const matA = g.attributes.mat?.array as Float32Array | undefined;
  const uvA = g.attributes.uv?.array as Float32Array | undefined;
  const P9: number[] = new Array(9).fill(0);
  const N9: number[] = new Array(9).fill(0);
  const U6: number[] = new Array(6).fill(0);
  const C12: number[] = new Array(12).fill(0);
  for (let t = 0; t < pos.length; t += 9) {
    if (matA && uvA) {
      const tv = t / 3;
      for (let k = 0; k < 3; k++) {
        const i = t + k * 3;
        const [X, Y] = turn(pos[i], pos[i + 2] + pull, false);
        P9[k * 3] = o.x + X;
        P9[k * 3 + 1] = pos[i + 1] + lift;
        P9[k * 3 + 2] = o.y + Y;
        const [nx, nz] = turn(nor[i], nor[i + 2], true);
        N9[k * 3] = nx;
        N9[k * 3 + 1] = nor[i + 1];
        N9[k * 3 + 2] = nz;
        U6[k * 2] = uvA[(tv + k) * 2];
        U6[k * 2 + 1] = uvA[(tv + k) * 2 + 1];
        C12[k * 4] = col[i];
        C12[k * 4 + 1] = col[i + 1];
        C12[k * 4 + 2] = col[i + 2];
        C12[k * 4 + 3] = CEL_ALPHA;
        if (pos[i + 1] < 0.2) {
          x0 = Math.min(x0, P9[k * 3]);
          x1 = Math.max(x1, P9[k * 3]);
          y0 = Math.min(y0, P9[k * 3 + 2]);
          y1 = Math.max(y1, P9[k * 3 + 2]);
        }
      }
      (out.textured ? out.mat(KIT_MATS[matA[tv]] ?? "plain") : out.lit).tri3(P9, N9, U6, C12);
      continue;
    }
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
  // what's see-through (a window's panes): into the clear buffers, its own opacity
  clearInto(
    out,
    g,
    (x, y, z) => {
      const [X, Y] = turn(x, z + pull, false);
      return [o.x + X, y + lift, o.y + Y];
    },
    (x, z) => turn(x, z, true),
  );
  // (what stands low makes the shadow on the floor: a chair's base, a sofa's plinth)
  if (Number.isFinite(x0) && lift === 0)
    out.soft.rects.push({ x0: x0 + 0.04, y0: y0 + 0.04, x1: x1 - 0.04, y1: y1 - 0.04, op: 0.32, round: 0.35 });
}
