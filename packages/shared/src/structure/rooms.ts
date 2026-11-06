// Rooms found and split as walls go up (docs/plan/72-the-3d-core.md, phase 11.5; the mocks' 05 and
// the user's call: a wall across a room — the bigger part keeps it, its name, owner and lock; the
// smaller a new room). A room is what walls close round (faces.ts), so after an edit to a floor's
// walls its faces are read again:
// - a room whose region a new wall cuts: the biggest part keeps it (or it keeps its outline, when
//   what's left of it outside the new closed faces is bigger), the others are new rooms — inside it
//   when it kept its outline (a closet in a hall: one step more specific);
// - a closed face that's new and in no room: a new room, unless it's the biggest piece of the open
//   face it came from (that's the open floor going on, not a room);
// - rooms never grow on their own (a wall taken away leaves the rooms either side as they were).
// New rooms are private and called "New room" until named. Undone, the history puts the rooms back
// as they were (their operation is kept with the walls').
import { floorFaces } from "./faces.ts";
import type { StructOp } from "./ops.ts";
import { area2, inRing } from "./rings.ts";
import type { Ring, Room, Structure, XY } from "./types.ts";

type Face = { outline: Ring; holes: Ring[] };

export const NEW_ROOM = "New room";
const EPS_AREA = 0.01; // m²: the same area
const REST_MIN = 0.5; // m²: a room's leftover big enough to count

const ringArea = (r: Ring) => Math.abs(area2(r)) / 2;
const faceArea = (f: Face) => ringArea(f.outline) - f.holes.reduce((s, h) => s + ringArea(h), 0);
const inFace = (f: Face, p: XY) => inRing(f.outline, p[0], p[1]) && !f.holes.some((h) => inRing(h, p[0], p[1]));
// (a face as it reads, to tell one that was there from a new one)
const sig = (f: Face) => {
  const r = (q: Ring) =>
    q
      .map(([x, y]) => `${Math.round(x * 100)},${Math.round(y * 100)}`)
      .sort()
      .join(" ");
  return `${r(f.outline)}|${f.holes.map(r).sort().join("/")}`;
};

/** A point inside a face (in its outline, in none of its holes). */
export function pointIn(f: Face): XY | null {
  const xs = f.outline.map((p) => p[0]);
  const ys = f.outline.map((p) => p[1]);
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  for (const k of [0.5, 0.3, 0.7, 0.15, 0.85, 0.41, 0.59]) {
    const y = y0 + (y1 - y0) * k + 1e-4;
    // where the outline and the holes cross this line, in order: inside between each pair
    const cuts: number[] = [];
    for (const r of [f.outline, ...f.holes])
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [ax, ay] = r[j];
        const [bx, by] = r[i];
        if (ay > y !== by > y) cuts.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
    cuts.sort((a, b) => a - b);
    let best: XY | null = null;
    let wide = 0;
    for (let i = 0; i + 1 < cuts.length; i += 2)
      if (cuts[i + 1] - cuts[i] > wide) {
        wide = cuts[i + 1] - cuts[i];
        best = [(cuts[i] + cuts[i + 1]) / 2, y];
      }
    if (best && inFace(f, best)) return best;
  }
  const c: XY = [xs.reduce((a, b) => a + b, 0) / xs.length, ys.reduce((a, b) => a + b, 0) / ys.length];
  return inFace(f, c) ? c : null;
}

const prio = (r: Room) => Number(r.props.priority ?? 0) || 0;
const rectOf = (o: Ring): [number, number, number, number] => {
  const xs = o.map((p) => p[0]);
  const ys = o.map((p) => p[1]);
  return [
    Math.floor(Math.min(...xs)),
    Math.floor(Math.min(...ys)),
    Math.ceil(Math.max(...xs)),
    Math.ceil(Math.max(...ys)),
  ];
};

/** The rooms of `floor` once `after`'s walls stand where `before`'s did (the walls the only change):
 *  their operation and the keys of the rooms it found (new); null when no room changes. */
export function roomsAfterWalls(
  before: Structure,
  after: Structure,
  floor: number,
  newKey: () => string,
): { op: StructOp; found: string[] } | null {
  const fb = floorFaces(before, floor);
  const fa = floorFaces(after, floor);
  const was = new Set(fb.map(sig));
  const rooms = after.rooms.filter((r) => r.floor === floor);
  // each face now: the room it's in (the most specific: highest priority, then smallest), else the
  // face it was part of
  type Group = { room?: Room; old?: Face; faces: { f: Face; area: number; fresh: boolean }[] };
  const groups = new Map<Room | Face | null, Group>();
  for (const f of fa) {
    const p = pointIn(f);
    if (!p) continue;
    const room =
      rooms
        .filter((r) => r.outline.length > 2 && inRing(r.outline, p[0], p[1]))
        .sort((a, b) => prio(b) - prio(a) || ringArea(a.outline) - ringArea(b.outline))[0] ?? null;
    const old = room ? null : (fb.filter((o) => inFace(o, p)).sort((a, b) => faceArea(a) - faceArea(b))[0] ?? null);
    const k = room ?? old;
    const g = groups.get(k) ?? { ...(room ? { room } : {}), ...(old ? { old } : {}), faces: [] };
    g.faces.push({ f, area: faceArea(f), fresh: !was.has(sig(f)) });
    groups.set(k, g);
  }
  const next = new Map(rooms.map((r) => [r.key, r]));
  const added: Room[] = [];
  const found: string[] = [];
  const make = (f: Face, priority: number) => {
    const key = newKey();
    const outline = f.outline.map(([x, y]): XY => [x, y]);
    added.push({
      key,
      floor,
      outline,
      rect: rectOf(outline),
      props: { name: NEW_ROOM, kind: "private", ...(priority ? { priority } : {}) },
    });
    found.push(key);
  };
  for (const g of groups.values()) {
    if (g.room) {
      const r = g.room;
      const whole = ringArea(r.outline);
      // its parts: the faces in it no bigger than it (a bigger one: its walls opened — it stays)
      const parts = g.faces.filter((q) => q.area <= whole + EPS_AREA).sort((a, b) => b.area - a.area);
      if (!parts.length) continue;
      const rest = whole - parts.reduce((s, q) => s + q.area, 0);
      if (rest > REST_MIN && rest > parts[0].area) {
        // what's left of it the biggest: it keeps its outline, the new faces in it rooms in it
        for (const q of parts) if (q.fresh) make(q.f, prio(r) + 1);
        continue;
      }
      // its biggest part keeps it (an outline the walls make now), the other new parts new rooms
      const [big, ...others] = parts;
      if (sig({ outline: r.outline, holes: [] }) !== sig({ outline: big.f.outline, holes: [] }))
        next.set(r.key, { ...r, outline: big.f.outline.map(([x, y]): XY => [x, y]) });
      // (one inside what it keeps — a closet walled off in it — a step more specific)
      for (const q of others) {
        if (!q.fresh) continue;
        const p = pointIn(q.f);
        make(q.f, prio(r) + (p && inRing(big.f.outline, p[0], p[1]) ? 1 : 0));
      }
      continue;
    }
    // in no room: the new faces of the open floor it came from, the biggest of them that floor
    // going on (when it came from one)
    const fresh = g.faces.filter((q) => q.fresh).sort((a, b) => b.area - a.area);
    for (const q of g.old ? fresh.slice(1) : fresh) make(q.f, 0);
  }
  const changed = rooms.some((r) => next.get(r.key) !== r);
  if (!changed && !added.length) return null;
  return {
    op: { op: "rooms", floor, rooms: [...rooms.map((r) => next.get(r.key) as Room), ...added] },
    found,
  };
}
