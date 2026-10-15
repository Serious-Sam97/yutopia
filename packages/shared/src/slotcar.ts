// The slot-car track (autorama): one geometry and one set of physics for the
// world-server (it checks what racers report), the item's drawing (the track
// painted on the table) and the live cars.
//
// A track lies on the table's top in local tiles at rot 0 (x along the 4-tile
// side, y towards the room). It's a loop of straights and arcs; four lanes run
// beside its centre line. Each racer drives their own car (their throttle, their
// physics, at once) and reports it; the server checks it and everyone sees it.
//
// There are several tracks (SLOT_TRACKS): the table shows the one in its
// `props.track`, picked at the console. And three difficulties (SLOT_DIFFS),
// picked per race: free (flat out everywhere, the car never leaves its slot),
// medium (the tuned one) and hard (less grip, it goes sooner).
//
// Fair lanes: the physics runs on the centre line — progress `s` is distance on
// it, and every curve is as tight for every lane — and each lane draws that
// progress on its own line, so the outer car looks faster in a corner but no
// lane is shorter.

export const SLOT_LANES = 4;
export const SLOT_LANE_GAP = 0.12; // tiles between lanes
export const SLOT_HALF_WIDTH = 0.29; // centre line to the track's edge (with the kerb)
export const SLOT_TOP = 23; // px: the table's top, where the track lies
export const SLOT_LAPS = [3, 5, 10] as const;
export const SLOT_REACH = 2.6; // how far from the table you can hold a controller
// each lane's car (and its stripe on the grid): red, blue, amber, green
export const SLOT_COLORS = ["#c4402b", "#4f86c6", "#f0a12c", "#7fa34a"] as const;
// the start lights hang over the line on a gantry this high over the track
export const SLOT_GANTRY = 15;

// Physics, in tiles and seconds.
export const SLOT_VMAX = 4; // flat out
export const SLOT_ACCEL = 9; // pull at a standstill with the trigger down
export const SLOT_BRAKE = 15; // the motor brakes as soon as you let go
// Medium: tuned against simulated drivers (timing and speed misjudged, lifting
// when they feel the tail go) — someone who overcooks corners by 10 % flies off
// about once in six laps, a reckless one once or twice a lap, flat out every corner.
export const SLOT_GRIP = 7; // the sideways pull (v² / r) it holds; past it, it slides…
export const SLOT_SLIDE_TIME = 0.3; // …and flies off if it slides this long (lift and it's saved)
export const SLOT_SNAP = 1.6; // or at once when the pull is this many times the grip
export const SLOT_SCRUB = 4; // a slide scrubs off speed (tiles / s² per share over the grip)
export const SLOT_SLIDE = 0.72; // over this share of the grip the tail steps out
export const SLOT_OFF_TIME = 1.6; // s: flying off, then a marshal puts it back
const STEP = 1 / 240;

// Countdown: five red lights, one by one, then they go out (GO) after a
// random pause, like Formula 1.
export const SLOT_LIGHT_MS = 650;

// ── difficulty ──────────────────────────────────────────────────────────────
export const SLOT_DIFFS = ["free", "medium", "hard"] as const;
export type SlotDiff = (typeof SLOT_DIFFS)[number];
export const isSlotDiff = (d: unknown): d is SlotDiff =>
  typeof d === "string" && (SLOT_DIFFS as readonly string[]).includes(d);
export const slotDiffOf = (d: unknown): SlotDiff => (isSlotDiff(d) ? d : "medium");

interface Physics {
  grip: number; // v² / r it holds
  slideTime: number; // s sliding past the grip before it goes
  snap: number; // gone at once over this many times the grip
  scrub: number; // speed a slide scrubs off
  offs: boolean; // it can leave the slot at all
}
export const SLOT_PHYSICS: Record<SlotDiff, Physics> = {
  // as fast as you like: the tail steps out for show, the car stays in its slot
  free: { grip: SLOT_GRIP, slideTime: Number.POSITIVE_INFINITY, snap: Number.POSITIVE_INFINITY, scrub: 0, offs: false },
  medium: { grip: SLOT_GRIP, slideTime: SLOT_SLIDE_TIME, snap: SLOT_SNAP, scrub: SLOT_SCRUB, offs: true },
  // less grip, a shorter slide, more speed scrubbed: a corner taken a touch
  // too fast is gone before you can lift
  hard: { grip: 5.4, slideTime: 0.16, snap: 1.35, scrub: 6, offs: true },
};
export const SLOT_DIFF_LABELS: Record<SlotDiff, readonly [string, string]> = {
  free: ["Free", "Livre"],
  medium: ["Medium", "Médio"],
  hard: ["Hard", "Difícil"],
};

// ── the tracks ──────────────────────────────────────────────────────────────
type Seg = { k: "line"; len: number } | { k: "arc"; r: number; turn: number }; // turn: radians, signed (+ turns towards +y from +x)

function deg(d: number) {
  return (d * Math.PI) / 180;
}
const line = (len: number): Seg => ({ k: "line", len });
const arc = (r: number, turn: number): Seg => ({ k: "arc", r, turn });
const Q = -Math.PI / 2;

export interface SlotTrackDef {
  name: readonly [string, string]; // EN, PT-BR
  blurb: readonly [string, string];
  start: readonly [number, number, number]; // x, y, heading on the table (rot 0)
  layout: () => Seg[]; // built on first use: nothing here runs in bundles that never race
}

// The figure of eight: loops of radius r with centres 2d apart; the crossing
// straights are the tangents from the middle point (length t), meeting at 2a.
const F8 = { r: 0.6, d: 0.9, a: Math.asin(0.6 / 0.9), t: Math.sqrt(0.9 * 0.9 - 0.6 * 0.6) };

// Every track stays on the 4 × 3 table: its centre line within x 0.45…3.55,
// y 0.5…2.56 (room for the kerbs, the grandstand along the far edge and the
// sponsor boards along the front), no arc tighter than r 1/3.
export const SLOT_TRACKS = {
  // Anticlockwise seen from above: along the front straight (the side towards
  // the room) to the right, up the right side, back along the far side through a
  // chicane that dips into the infield, down the left side.
  classic: {
    name: ["Classic", "Clássico"],
    blurb: [
      "Two hairpins and a chicane: the one that came in the box.",
      "Dois grampos e uma chicane: a pista da caixa.",
    ],
    start: [1.0, 2.5, 0],
    layout: () => {
      // (the far side is as long as the front straight: two runs, the chicane between)
      const run = (2 - 0.3 - 4 * 0.45 * Math.sin(deg(50))) / 2;
      return [
        line(2.0), // the front straight (start / finish)
        arc(0.55, Q),
        line(0.9),
        arc(0.55, Q),
        line(run),
        arc(0.45, -deg(50)), // the chicane: in…
        arc(0.45, deg(50)),
        line(0.3),
        arc(0.45, deg(50)), // …and out
        arc(0.45, -deg(50)),
        line(run),
        arc(0.55, Q),
        line(0.9),
        arc(0.55, Q),
      ];
    },
  },
  // An oval: two long straights, two wide bends — nearly flat out all the way round.
  speedway: {
    name: ["Speedway", "Oval"],
    blurb: ["Two straights, two sweeping bends: keep it pinned.", "Duas retas, duas curvas largas: pé embaixo."],
    start: [1.3, 2.5, 0],
    layout: () => [line(1.4), arc(0.8, -Math.PI), line(1.4), arc(0.8, -Math.PI)],
  },
  // A figure of eight: two loops joined by straights that cross in the middle
  // of the table — the cars cross each other's path twice a lap.
  figure8: {
    name: ["Figure 8", "Oito"],
    blurb: ["The lanes cross in the middle. Don't blink.", "As pistas se cruzam no meio. Não pisque."],
    // half-way along the first crossing straight, out of the middle
    start: [2 + (F8.t / 2) * Math.cos(F8.a), 1.5 - (F8.t / 2) * Math.sin(F8.a), -F8.a],
    layout: () => {
      const { r, a, t } = F8;
      return [line(t / 2), arc(r, Math.PI + 2 * a), line(t), line(t), arc(r, -(Math.PI + 2 * a)), line(1.5 * t)];
    },
  },
  // Four leaves out of one crossing: every lap goes through the middle four times.
  clover: {
    name: ["Cloverleaf", "Trevo"],
    blurb: [
      "Four loops through one crossing — traffic from every side.",
      "Quatro laços por um só cruzamento — trânsito de todo lado.",
    ],
    start: [2.25, 1.5, 0],
    layout: () => {
      const r = 0.5;
      const leaf = (first: number, last: number) => [line(first), arc(r, (3 * Math.PI) / 2), line(last)];
      return [...leaf(r / 2, r), ...leaf(r, r), ...leaf(r, r), ...leaf(r, 1.5 * r)];
    },
  },
  // Four rows of straight joined by hairpins, down one side and back up the other.
  switchback: {
    name: ["Switchback", "Grampos"],
    blurb: [
      "Three hairpins in a row: brake, turn, floor it, again.",
      "Três grampos em fila: freia, vira, acelera, de novo.",
    ],
    start: [1.3, 2.5, 0],
    layout: () => {
      const r = 1 / 3;
      return [
        line(1.85),
        arc(r, -Math.PI),
        line(1.95),
        arc(r, Math.PI),
        line(1.95),
        arc(r, -Math.PI),
        line(2.3),
        arc(0.35, Q),
        line(1.3),
        arc(0.35, Q),
        line(0.45),
      ];
    },
  },
  // A loop whose far side wriggles: a run of S-bends you take in one rhythm.
  snake: {
    name: ["Snake", "Serpente"],
    blurb: ["The far side wriggles — find the rhythm.", "O lado de lá serpenteia — ache o ritmo."],
    start: [0.95, 2.55, 0],
    layout: () => {
      // two S-bends, one to each side of the line (each: in, over, back)
      const w = 0.35;
      const s = (k: number) => [arc(w, k * deg(45)), arc(w, -k * deg(90)), arc(w, k * deg(45))];
      const gap = 2.0 - 8 * w * Math.sin(deg(45));
      return [
        line(2.0),
        arc(0.5, Q),
        line(0.8),
        arc(0.5, Q),
        ...s(1),
        ...s(-1),
        line(gap),
        arc(0.5, Q),
        line(0.8),
        arc(0.5, Q),
      ];
    },
  },
  // Three loops out of one crossing, each turning 240°: a pretzel.
  pretzel: {
    name: ["Pretzel", "Pretzel"],
    blurb: [
      "Three tight loops, one crossing, no two corners alike.",
      "Três laços apertados, um cruzamento, nenhuma curva igual.",
    ],
    start: [2 + (0.35 * Math.sqrt(3)) / 2, 1.5, 0],
    layout: () => {
      const r = 0.35;
      const t = r * Math.sqrt(3);
      const leaf = (first: number, last: number) => [line(first), arc(r, -(4 * Math.PI) / 3), line(last)];
      return [...leaf(t / 2, t), ...leaf(t, t), ...leaf(t, 1.5 * t)];
    },
  },
  // The oval with a bus stop: a quick left-right-right-left on the back straight.
  busstop: {
    name: ["Bus stop", "Chicane"],
    blurb: ["The oval, with a bus stop on the back straight.", "O oval, com uma chicane na reta de trás."],
    start: [1.3, 2.5, 0],
    layout: () => {
      const r = 0.4;
      const a = deg(45);
      const run = (1.4 - 4 * r * Math.sin(a)) / 3;
      return [
        line(1.4),
        arc(0.8, -Math.PI),
        line(run),
        arc(r, a),
        arc(r, -a),
        line(run),
        arc(r, -a),
        arc(r, a),
        line(run),
        arc(0.8, -Math.PI),
      ];
    },
  },
} as const satisfies Record<string, SlotTrackDef>;

export type SlotTrackId = keyof typeof SLOT_TRACKS;
export const SLOT_TRACK_IDS = Object.keys(SLOT_TRACKS) as SlotTrackId[];
export const isSlotTrack = (id: unknown): id is SlotTrackId => typeof id === "string" && Object.hasOwn(SLOT_TRACKS, id);
// the track a table shows (its props), the classic for none
export const slotTrackOf = (props?: Record<string, unknown> | null): SlotTrackId =>
  isSlotTrack(props?.track) ? props.track : "classic";

// What a race runs on: the table's track and the race's difficulty.
export interface SlotSetup {
  track: SlotTrackId;
  diff: SlotDiff;
}
export const SLOT_DEFAULT: SlotSetup = { track: "classic", diff: "medium" };

interface Placed {
  k: "line" | "arc";
  s0: number; // where it starts along the centre line
  len: number;
  x: number; // its start
  y: number;
  h: number; // heading at its start
  r: number; // arcs: radius
  turn: number; // arcs: signed turn
  cx: number; // arcs: centre
  cy: number;
}

interface Track {
  segs: Placed[];
  length: number;
}

function place(def: SlotTrackDef): Track {
  let [x, y, h] = def.start;
  let s = 0;
  const segs: Placed[] = [];
  for (const g of def.layout()) {
    if (g.k === "line") {
      segs.push({ k: "line", s0: s, len: g.len, x, y, h, r: 0, turn: 0, cx: 0, cy: 0 });
      x += Math.cos(h) * g.len;
      y += Math.sin(h) * g.len;
      s += g.len;
    } else {
      const side = Math.sign(g.turn); // the centre is to this side of the heading
      const cx = x - Math.sin(h) * g.r * side;
      const cy = y + Math.cos(h) * g.r * side;
      const len = Math.abs(g.turn) * g.r;
      segs.push({ k: "arc", s0: s, len, x, y, h, r: g.r, turn: g.turn, cx, cy });
      h += g.turn;
      x = cx + Math.sin(h) * g.r * side;
      y = cy - Math.cos(h) * g.r * side;
      s += len;
    }
  }
  return { segs, length: s };
}

const placed = new Map<SlotTrackId, Track>();
const track = (id: SlotTrackId): Track => {
  let t = placed.get(id);
  if (!t) {
    t = place(SLOT_TRACKS[id]);
    placed.set(id, t);
  }
  return t;
};

// One lap of a track, in tiles of centre line.
export function slotLap(id: SlotTrackId = "classic"): number {
  return track(id).length;
}
// (the classic's lap, for what predates the other tracks)
export const SLOT_LAP: number = /* @__PURE__ */ slotLap("classic");

function segAt(s: number, id: SlotTrackId): Placed {
  const segs = track(id).segs;
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].s0 <= s) lo = mid;
    else hi = mid - 1;
  }
  return segs[lo];
}

const wrap = (s: number, id: SlotTrackId) => {
  const lap = track(id).length;
  return ((s % lap) + lap) % lap;
};

// How hard the track turns at `s` (1 / radius; 0 on straights).
export function slotCurve(s: number, id: SlotTrackId = "classic"): number {
  const g = segAt(wrap(s, id), id);
  return g.k === "arc" ? 1 / g.r : 0;
}

// …and which way: + turns from +x towards +y (as the layout's turns), − the other way.
export function slotBend(s: number, id: SlotTrackId = "classic"): number {
  const g = segAt(wrap(s, id), id);
  return g.k === "arc" ? Math.sign(g.turn) / g.r : 0;
}

// Sideways offset of a lane from the centre line (+ is to the left of travel:
// the infield on an anticlockwise loop; lane 0 is the outside one).
export function laneOffset(lane: number): number {
  return (lane - (SLOT_LANES - 1) / 2) * SLOT_LANE_GAP;
}

// A point on the track at progress `s`, `off` tiles to the left of the centre
// line (rot-0 table tiles), and the heading there.
export function slotPoint(s: number, off = 0, id: SlotTrackId = "classic"): { x: number; y: number; h: number } {
  const t = wrap(s, id);
  const g = segAt(t, id);
  const u = Math.min(g.len, Math.max(0, t - g.s0));
  let x: number;
  let y: number;
  let h: number;
  if (g.k === "line") {
    h = g.h;
    x = g.x + Math.cos(h) * u;
    y = g.y + Math.sin(h) * u;
  } else {
    const side = Math.sign(g.turn);
    h = g.h + (u / g.r) * side;
    x = g.cx + Math.sin(h) * g.r * side;
    y = g.cy - Math.cos(h) * g.r * side;
  }
  // left of travel (y grows towards the room): (sin h, −cos h)
  return { x: x + Math.sin(h) * off, y: y - Math.cos(h) * off, h };
}

// The line of a lane (or an edge) as points, for drawing: `step` tiles apart
// on the centre line, closed (the last point is the first).
export function slotPath(off: number, step = 0.06, id: SlotTrackId = "classic"): [number, number][] {
  const out: [number, number][] = [];
  const lap = track(id).length;
  const n = Math.ceil(lap / step);
  for (let i = 0; i <= n; i++) {
    const p = slotPoint((i / n) * lap, off, id);
    out.push([p.x, p.y]);
  }
  return out;
}

// Where to cut the track for drawing it: every segment's start, and arcs every
// `step` tiles (straights need no more), up to the lap. Each stop says whether
// it's on a curve.
export function slotStops(step = 0.05, id: SlotTrackId = "classic"): { s: number; curve: boolean }[] {
  const out: { s: number; curve: boolean }[] = [];
  const t = track(id);
  for (const g of t.segs) {
    const n = g.k === "arc" ? Math.max(2, Math.ceil(g.len / step)) : 1;
    for (let i = 0; i < n; i++) out.push({ s: g.s0 + (g.len * i) / n, curve: g.k === "arc" });
  }
  out.push({ s: t.length, curve: false });
  return out;
}

// How far a point on the table is from the track's centre line (for standing
// things in the infield where the track isn't).
export function slotDistance(x: number, y: number, id: SlotTrackId = "classic"): number {
  let best = Number.POSITIVE_INFINITY;
  for (const [px, py] of slotPath(0, 0.04, id)) best = Math.min(best, Math.hypot(px - x, py - y));
  return best;
}

// The five start lamps sit on top of the gantry's bar, across the track
// (rot-0 table tiles, z in px).
export function slotLamps(id: SlotTrackId = "classic"): { x: number; y: number; z: number }[] {
  return [-2, -1, 0, 1, 2].map((i) => {
    const p = slotPoint(0.02, i * 0.1, id);
    return { x: p.x, y: p.y, z: SLOT_TOP + SLOT_GANTRY + 4 };
  });
}

// ── a car ───────────────────────────────────────────────────────────────────
export interface CarState {
  s: number; // progress on the centre line since the start (laps count up)
  v: number; // tiles / s along it
  off: number; // 0 on the track; else seconds since it flew off
  ov: number; // the speed it flew off at (where the slide goes)
  slide?: number; // seconds it has been sliding past its grip (the driver's own car)
}

export function newCar(): CarState {
  return { s: 0, v: 0, off: 0, ov: 0, slide: 0 };
}

// How close to flying off it is right now (0 calm … 1 gone).
export function slotSlip(c: CarState, setup: SlotSetup = SLOT_DEFAULT): number {
  return c.off ? 0 : (c.v * c.v * slotCurve(c.s, setup.track)) / SLOT_PHYSICS[setup.diff].grip;
}

// One step of the car with the trigger at `u` (0..1). Returns true the moment
// it flies off. While off it slides away, then sits back in its slot.
export function stepCar(c: CarState, u: number, dt: number, setup: SlotSetup = SLOT_DEFAULT): boolean {
  const ph = SLOT_PHYSICS[setup.diff];
  let flew = false;
  let left = Math.min(dt, 0.25);
  while (left > 1e-9) {
    const h = Math.min(STEP, left);
    left -= h;
    if (c.off) {
      c.off += h;
      if (c.off >= SLOT_OFF_TIME) {
        c.off = 0;
        c.ov = 0;
        c.v = 0;
      }
      continue;
    }
    const want = Math.max(0, Math.min(1, u));
    const k = want * SLOT_VMAX > c.v ? SLOT_ACCEL : SLOT_BRAKE;
    c.v = Math.max(0, Math.min(SLOT_VMAX, c.v + k * (want - c.v / SLOT_VMAX) * h));
    c.s += c.v * h;
    const pull = (c.v * c.v * slotCurve(c.s, setup.track)) / ph.grip;
    if (pull > 1) c.v = Math.max(0, c.v - ph.scrub * (pull - 1) * h);
    c.slide = pull > 1 ? (c.slide ?? 0) + h : Math.max(0, (c.slide ?? 0) - h * 2);
    if (ph.offs && (pull > ph.snap || c.slide > ph.slideTime)) {
      c.slide = 0;
      c.off = 1e-6;
      c.ov = c.v;
      c.v = 0;
      flew = true;
    }
  }
  return flew;
}

// Where a car that flew off is (a slide out of its lane, spinning), as an
// offset from the point where it left, in table tiles, and its spin (radians).
export function slotCrash(
  c: CarState,
  lane: number,
  id: SlotTrackId = "classic",
): { x: number; y: number; h: number; spin: number; out: number } {
  const p = slotPoint(c.s, laneOffset(lane), id);
  const t = Math.min(c.off, 0.7);
  const dist = Math.max(0, c.ov * t - 0.5 * (c.ov / 0.7) * t * t); // slides to a stop in 0.7 s
  // the tail goes out: away from the corner's centre, mostly forwards
  const g = segAt(wrap(c.s, id), id);
  const away = g.k === "arc" ? -Math.sign(g.turn) : 1;
  const a = p.h + away * -0.55;
  return {
    x: p.x + Math.cos(a) * dist,
    y: p.y + Math.sin(a) * dist,
    h: p.h,
    spin: away * (t / 0.7) * Math.PI * 1.6,
    out: Math.min(1, c.off / 0.12),
  };
}

// ── the table, turned ────────────────────────────────────────────────────────
// rot-0 table tiles → the object's turned footprint (same turn as the items'
// drawings: 90° clockwise steps), plus world heading.
export function slotTurn(x: number, y: number, rot: number, w = 4, h = 3): [number, number] {
  let X = x;
  let Y = y;
  let W = w;
  let H = h;
  for (let i = 0; i < (rot & 3); i++) {
    [X, Y] = [H - Y, X];
    [W, H] = [H, W];
  }
  return [X, Y];
}

// ── checking what a racer reports (world-server) ────────────────────────────
// `prev` what we had, `next` what they say, `dt` seconds between the two.
export function plausibleCar(prev: CarState, next: CarState, dt: number, setup: SlotSetup = SLOT_DEFAULT): boolean {
  const ph = SLOT_PHYSICS[setup.diff];
  const nums = [next.s, next.v, next.off, next.ov];
  if (!nums.every(Number.isFinite)) return false;
  if (next.v < 0 || next.v > SLOT_VMAX * 1.01 || next.ov < 0 || next.ov > SLOT_VMAX * 1.01) return false;
  if (next.off < 0 || next.off > SLOT_OFF_TIME + 0.1) return false;
  if (!ph.offs && next.off > 0) return false; // it can't leave the slot on this setting
  const ds = next.s - prev.s;
  if (ds < -0.001 || ds > SLOT_VMAX * Math.max(dt, 0.05) * 1.35 + 0.15) return false;
  // on the track in a corner faster than it can be
  if (ph.offs && !next.off && next.v * next.v * slotCurve(next.s, setup.track) > ph.grip * (ph.snap + 0.05))
    return false;
  return true;
}
