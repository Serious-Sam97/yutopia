// The slot-car track (autorama): one geometry and one set of physics for the
// world-server (it checks what racers report), the item's drawing (the track
// painted on the table) and the live cars.
//
// The track lies on the table's top in local tiles at rot 0 (x along the 4-tile
// side, y towards the room). It's a loop of straights and arcs; four lanes run
// beside its centre line. Each racer drives their own car (their throttle, their
// physics, at once) and reports it; the server checks it and everyone sees it.
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

// ── the track ───────────────────────────────────────────────────────────────
type Seg = { k: "line"; len: number } | { k: "arc"; r: number; turn: number }; // turn: radians, signed (+ turns towards +y from +x)

// Anticlockwise seen from above: along the front straight (the side towards
// the room) to the right, up the right side, back along the far side through a
// chicane that dips into the infield, down the left side.
// (the far side is as long as the front straight: two runs, the chicane between)
// Built on first use: nothing here runs in bundles that never race.
function layout(): Seg[] {
  const run = (2 - 0.3 - 4 * 0.45 * Math.sin(deg(50))) / 2;
  const q = -Math.PI / 2;
  return [
    { k: "line", len: 2.0 }, // the front straight (start / finish)
    { k: "arc", r: 0.55, turn: q },
    { k: "line", len: 0.9 },
    { k: "arc", r: 0.55, turn: q },
    { k: "line", len: run },
    { k: "arc", r: 0.45, turn: -deg(50) }, // the chicane: in…
    { k: "arc", r: 0.45, turn: deg(50) },
    { k: "line", len: 0.3 },
    { k: "arc", r: 0.45, turn: deg(50) }, // …and out
    { k: "arc", r: 0.45, turn: -deg(50) },
    { k: "line", len: run },
    { k: "arc", r: 0.55, turn: q },
    { k: "line", len: 0.9 },
    { k: "arc", r: 0.55, turn: q },
  ];
}
const START: [number, number, number] = [1.0, 2.5, 0]; // x, y, heading (on the front straight)

function deg(d: number) {
  return (d * Math.PI) / 180;
}

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

function place(): { segs: Placed[]; length: number } {
  let [x, y, h] = START;
  let s = 0;
  const segs: Placed[] = [];
  for (const g of layout()) {
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

let placed: ReturnType<typeof place> | null = null;
const track = () => {
  placed ??= place();
  return placed;
};
export const SLOT_LAP: number = /* @__PURE__ */ track().length; // one lap, in tiles of centre line

function segAt(s: number): Placed {
  const segs = track().segs;
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].s0 <= s) lo = mid;
    else hi = mid - 1;
  }
  return segs[lo];
}

const wrap = (s: number) => ((s % SLOT_LAP) + SLOT_LAP) % SLOT_LAP;

// How hard the track turns at `s` (1 / radius; 0 on straights).
export function slotCurve(s: number): number {
  const g = segAt(wrap(s));
  return g.k === "arc" ? 1 / g.r : 0;
}

// …and which way: + turns from +x towards +y (as the layout's turns), − the other way.
export function slotBend(s: number): number {
  const g = segAt(wrap(s));
  return g.k === "arc" ? Math.sign(g.turn) / g.r : 0;
}

// Sideways offset of a lane from the centre line (+ is to the left of travel:
// the infield on this anticlockwise loop; lane 0 is the outside one).
export function laneOffset(lane: number): number {
  return (lane - (SLOT_LANES - 1) / 2) * SLOT_LANE_GAP;
}

// A point on the track at progress `s`, `off` tiles to the left of the centre
// line (rot-0 table tiles), and the heading there.
export function slotPoint(s: number, off = 0): { x: number; y: number; h: number } {
  const t = wrap(s);
  const g = segAt(t);
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
export function slotPath(off: number, step = 0.06): [number, number][] {
  const out: [number, number][] = [];
  const n = Math.ceil(SLOT_LAP / step);
  for (let i = 0; i <= n; i++) {
    const p = slotPoint((i / n) * SLOT_LAP, off);
    out.push([p.x, p.y]);
  }
  return out;
}

// Where to cut the track for drawing it: every segment's start, and arcs every
// `step` tiles (straights need no more), up to the lap. Each stop says whether
// it's on a curve.
export function slotStops(step = 0.05): { s: number; curve: boolean }[] {
  const out: { s: number; curve: boolean }[] = [];
  for (const g of track().segs) {
    const n = g.k === "arc" ? Math.max(2, Math.ceil(g.len / step)) : 1;
    for (let i = 0; i < n; i++) out.push({ s: g.s0 + (g.len * i) / n, curve: g.k === "arc" });
  }
  out.push({ s: SLOT_LAP, curve: false });
  return out;
}

// The five start lamps sit on top of the gantry's bar, across the track
// (rot-0 table tiles, z in px).
export function slotLamps(): { x: number; y: number; z: number }[] {
  return [-2, -1, 0, 1, 2].map((i) => {
    const p = slotPoint(0.02, i * 0.1);
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
export function slotSlip(c: CarState): number {
  return c.off ? 0 : (c.v * c.v * slotCurve(c.s)) / SLOT_GRIP;
}

// One step of the car with the trigger at `u` (0..1). Returns true the moment
// it flies off. While off it slides away, then sits back in its slot.
export function stepCar(c: CarState, u: number, dt: number): boolean {
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
    const pull = (c.v * c.v * slotCurve(c.s)) / SLOT_GRIP;
    if (pull > 1) c.v = Math.max(0, c.v - SLOT_SCRUB * (pull - 1) * h);
    c.slide = pull > 1 ? (c.slide ?? 0) + h : Math.max(0, (c.slide ?? 0) - h * 2);
    if (pull > SLOT_SNAP || c.slide > SLOT_SLIDE_TIME) {
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
export function slotCrash(c: CarState, lane: number): { x: number; y: number; h: number; spin: number; out: number } {
  const p = slotPoint(c.s, laneOffset(lane));
  const t = Math.min(c.off, 0.7);
  const dist = Math.max(0, c.ov * t - 0.5 * (c.ov / 0.7) * t * t); // slides to a stop in 0.7 s
  // the tail goes out: away from the corner's centre, mostly forwards
  const g = segAt(wrap(c.s));
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
export function plausibleCar(prev: CarState, next: CarState, dt: number): boolean {
  const nums = [next.s, next.v, next.off, next.ov];
  if (!nums.every(Number.isFinite)) return false;
  if (next.v < 0 || next.v > SLOT_VMAX * 1.01 || next.ov < 0 || next.ov > SLOT_VMAX * 1.01) return false;
  if (next.off < 0 || next.off > SLOT_OFF_TIME + 0.1) return false;
  const ds = next.s - prev.s;
  if (ds < -0.001 || ds > SLOT_VMAX * Math.max(dt, 0.05) * 1.35 + 0.15) return false;
  // on the track in a corner faster than it can be
  if (!next.off && next.v * next.v * slotCurve(next.s) > SLOT_GRIP * (SLOT_SNAP + 0.05)) return false;
  return true;
}
