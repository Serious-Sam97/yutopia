import { entry, type WorldObjectDef } from "@yutopia/shared";
import type { BufferGeometry } from "three";
import type { Out } from "../tp/kit3d";
import { FURN } from "./flag";
import { type Look, Model } from "./kit";
import { CEL_ALPHA } from "./look";
import { armchair, beanbag, bench, chair, LOOKS, sofa } from "./seating";
import { bookcase, cartShelf, cupboard, discRack, locker, STORAGE_LOOKS, tapeShelf } from "./storage";
import { coffeeTable, counter, desk, meetingTable, reception, sideTable, TABLE_LOOKS } from "./tables";

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
export const LOOK_NAMES: Record<string, readonly string[]> = { ...LOOKS, ...TABLE_LOOKS, ...STORAGE_LOOKS };

/** A placed thing's look: its picked variant (look 0 unset: a room's chairs match), its fabric or
 *  paint, its seed, sat on. */
function lookOf(o: WorldObjectDef): Look {
  const n = LOOK_NAMES[o.kind]?.length ?? 1;
  const v = o.props?.variant;
  return {
    look: typeof v === "number" && Number.isInteger(v) && v >= 0 && v < n ? v : 0,
    fabric: hexOf(o.props?.color),
    seed: seedOf(o.id),
    occupied: !!o.props?.occupied,
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
};

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

/** Draw a placed thing into `out`: its model turned onto its footprint (rot as turnPoint: each turn
 *  (u, v) → (h − v, u)), pulled the way it faces by `props.pull`, `lift` m up, and its contact
 *  shadow on the floor under it. */
export function nativeInto(out: Out, o: WorldObjectDef, lift = 0): void {
  const g = modelOf(o);
  const e = entry(o.kind);
  const rot = (o.rot ?? 0) & 3;
  // (a desk's chair sat on: pulled in to it, the way it faces — plan 62's props.pull, tiles)
  const pull = Number(o.props?.pull) || 0;
  const pos = g.attributes.position.array;
  const nor = g.attributes.normal.array;
  const col = g.attributes.color.array;
  const turn = (u: number, v: number, n: boolean): [number, number] => {
    let X = u;
    let Y = v;
    let H = e.h;
    let W = e.w;
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
