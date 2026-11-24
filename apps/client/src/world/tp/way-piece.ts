import { groundAt, groundsRng, KART_LAND, KART_TURN, LOT, WAYS, type Way, wayHalf } from "@yutopia/shared/grounds";
import { BufferAttribute, BufferGeometry } from "three";
import { G, type V } from "./campus";
import { streetCorners, wayDressing } from "./roads3d";
import { bankAlong } from "./snow3d";

// A way's ground — its asphalt, lines, verges, kerbs, the plough's banks, a trail's or walk's ribbon — worked out
// as geometry alone, no materials: on the main thread (Grounds3.ways) or, a district's piece of it, in the land's
// workers (land-block.worker.ts), the main thread only making the meshes (docs/plan/91-the-big-map.md phase 3: a
// district's road pieces were a third of a slow CPU's main thread arriving out on the long road — the ground's
// height under every vertex, the ways near every bank's).

export type Near = (x: number, z: number, pad?: number) => boolean;
type Rect = { x0: number; z0: number; x1: number; z1: number };
/** A district's square, less the rest's circle (what that draws). */
export type Own = Rect & { skip: { cx: number; cz: number; r: number } };
/** The rest's: its circle — a way of it made whole there, as Grounds3.ways makes it (docs/plan/122: a way made again
 *  by a publish, its banks 15–55 ms of a frame). */
export type RestOwn = { circle: { cx: number; cz: number; r: number } };

/** Where a way's geometry goes, by what it's drawn with (Grounds3 gives each its material). */
export type Slot = "asphalt" | "lines" | "paint" | "slabs" | "trail" | "walk" | "banks";
export const SLOTS: readonly Slot[] = ["asphalt", "lines", "paint", "slabs", "trail", "walk", "banks"];

/** The distance from (x, z) to a way's line (its samples). */
export function nearLine(w: Way, x: number, z: number): number {
  // (a quick "nowhere near": its box)
  const b = (boxes.get(w) ?? boxOf(w)) as Rect & { x1: number };
  if (x < b.x0 - 12 || x > b.x1 + 12 || z < b.z0 - 12 || z > b.z1 + 12) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < w.line.length; i += 2) {
    const d = Math.hypot(w.line[i][0] - x, w.line[i][1] - z);
    if (d < best) best = d;
  }
  return best;
}
// (a way's: made again with god mode's edits, a new object)
const boxes = new WeakMap<Way, { x0: number; x1: number; z0: number; z1: number }>();
export function boxOf(w: Way) {
  const xs = w.line.map((p) => p[0]);
  const zs = w.line.map((p) => p[1]);
  const b = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  boxes.set(w, b);
  return b;
}

/** The samples of `w` within 40 m of a piece, and 8 either side (null: none there). */
export function spanOf(w: Way, q: Rect): [number, number] | null {
  let a = -1;
  let b = -1;
  for (const [i, [x, z]] of w.line.entries())
    if (x > q.x0 - 40 && x < q.x1 + 40 && z > q.z0 - 40 && z < q.z1 + 40) {
      if (a < 0) a = i;
      b = i;
    }
  return a < 0 ? null : [Math.max(0, a - 8), Math.min(w.line.length - 1, b + 8)];
}

/** A ribbon along a way's line, `width` wide, `off` to its side, `lift` over the ground (its picture `texLen`
 *  a repeat along it): the samples `from`…`to`, those `near` drawn. */
export function ribbon(
  w: Way,
  width: number,
  off: number,
  lift: number,
  texLen: number,
  into: G,
  near: Near,
  from = 0,
  to = w.line.length - 1,
  widthAt?: (i: number) => number,
) {
  const L = w.line;
  // (its picture along it from the line's start, on past what's not drawn here: a district's
  // piece took it up from nought, a seam in the asphalt at every piece's edge)
  let v = 0;
  for (let i = 0; i < from; i++) v += Math.hypot(L[i + 1][0] - L[i][0], L[i + 1][1] - L[i][1]) / texLen;
  // (a bridge's deck: flush with the way — shared deckAt; the driveway's last two tiles eased
  // down to the lot's own asphalt, so where they meet is no step for the ink to outline)
  const ease = (x: number, z: number) => (x > LOT.x0 && x < LOT.x1 ? Math.min(1, Math.max(0, (LOT.z0 - z) / 2)) : 1);
  const yAt = (i: number, x: number, z: number) => (w.bridged[i] ? w.h[i] : groundAt(x, z)) + lift * ease(x, z);
  for (let i = from; i < to; i++) {
    const [ax, az] = L[i];
    const [bx, bz] = L[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const v1 = v + len / texLen;
    if (!near(ax, az, 20)) {
      v = v1;
      continue;
    }
    const tn = (k: number) => {
      const [px, pz] = L[Math.max(0, k - 1)];
      const [qx, qz] = L[Math.min(L.length - 1, k + 1)];
      const l = Math.hypot(qx - px, qz - pz) || 1;
      return [-(qz - pz) / l, (qx - px) / l];
    };
    const [anx, anz] = tn(i);
    const [bnx, bnz] = tn(i + 1);
    const wk = (k: number) => (widthAt ? widthAt(k) : width);
    const P = (x: number, z: number, nx: number, nz: number, s: number, k: number): V => {
      const px = x + nx * (off + s * wk(k) * 0.5);
      const pz = z + nz * (off + s * wk(k) * 0.5);
      return [px, yAt(k, px, pz), pz];
    };
    // (narrower: the picture's middle, so across it still counts the way's own tiles)
    const U = (s: number, k: number) => 0.5 + (s * wk(k)) / (2 * width);
    into.quad(
      P(ax, az, anx, anz, -1, i),
      P(ax, az, anx, anz, 1, i),
      P(bx, bz, bnx, bnz, 1, i + 1),
      P(bx, bz, bnx, bnz, -1, i + 1),
      [0, 1, 0],
      [
        [U(-1, i), v],
        [U(1, i), v],
        [U(1, i + 1), v1],
        [U(-1, i + 1), v1],
      ],
    );
    v = v1;
  }
}

/** What's shared by a way's step: where all but its asphalt and lines go. */
export interface Sinks {
  paint: G;
  slabs: G;
  trail: G;
  walk: G;
  banks: G;
}
export const sinks = (): Sinks => ({ paint: new G(), slabs: new G(), trail: new G(), walk: new G(), banks: new G() });

/** One way's ground (`span`: only those samples; `near`: whose to draw): its own asphalt and lines back, the rest
 *  into `s`. `r`: the banks' wobble (one for a ways() call, as the main thread's always was). */
export function wayGeo(
  w: Way,
  near: Near,
  span: [number, number] | null,
  r: ReturnType<typeof groundsRng>,
  s: Sinks,
): { asphalt: G; lines: G } {
  const ctx = {
    near,
    yAt: (u: Way, i: number, x: number, z: number) => (u.bridged[i] ? u.h[i] : groundAt(x, z)),
    span: span ?? undefined,
  };
  const asphalt = new G();
  const lines = new G();
  if (w.kind === "trail") {
    ribbon(w, w.w + 0.8, 0, 0.03, 9, s.trail, near, span?.[0], span?.[1]);
    // trodden down: the snow either side stands a little higher (a low berm, open where
    // another way crosses and on the footbridge)
    for (const side of [1, -1] as const)
      bankAlong(s.banks, w.line, w.w / 2 + 0.75, side, groundAt, r, {
        h: 0.2,
        w: 1.1,
        span: span ?? undefined,
        own: (x, z) => near(x, z, 10),
        skip: (x, z, i) => w.bridged[i] || WAYS.some((u) => u !== w && nearLine(u, x, z) < u.w / 2 + 1.2),
      });
  } else if (w.kind === "walk") ribbon(w, w.w, 0, 0.04, 6, s.walk, near, span?.[0], span?.[1]);
  else {
    // the asphalt, its own picture by its width; the lines, verges, kerbs and pavements over it
    // (roads3d.ts)
    ribbon(w, w.w, 0, 0.05, 9, asphalt, near, span?.[0], span?.[1], w.flare ? (i) => 2 * wayHalf(w, i) : undefined);
    wayDressing(w, ctx, nearLine, s.paint, s.slabs, lines);
    streetCorners(w, ctx, nearLine, s.banks);
    // the plough's banks beyond a road's verges: a ridge each side (none on a bridge, across
    // another way's mouth or the lot's, nor out of reach; a street's kerbs: streetCorners)
    if (w.kind !== "street")
      for (const side of [1, -1] as const)
        bankAlong(s.banks, w.line, (i) => wayHalf(w, i) + 1.2, side, groundAt, r, {
          h: 0.55,
          w: 1.8,
          span: span ?? undefined,
          own: (x, z) => near(x, z, 10),
          skip: (x, z, i) =>
            w.bridged[i] ||
            WAYS.some((u) => u !== w && u.kind !== "trail" && nearLine(u, x, z) < u.w / 2 + 1.5) ||
            (x > LOT.x0 - 2 && x < LOT.x1 + 2 && z > LOT.z0 - 2 && z < LOT.z1 + 2) ||
            (KART_LAND && Math.hypot(x - KART_TURN.x, z - KART_TURN.z) < KART_TURN.r + 7),
        });
  }
  return { asphalt, lines };
}

/** A district's piece: whose it is to draw — the piece, less the rest's circle at the same pad. */
export function pieceNear(piece: Rect, own: Own): Near {
  return (x, z, pad = 0) =>
    x >= piece.x0 &&
    x < piece.x1 &&
    z >= piece.z0 &&
    z < piece.z1 &&
    Math.hypot(x - own.skip.cx, z - own.skip.cz) >= own.skip.r + pad;
}

/** A way's ground in a district's piece, by slot (empty slots left out) — **from the piece's corner** (`at.x0`,
 *  `at.z0`: its mesh is put there), worked out in doubles before it's made floats: 150 km out a float has 1.6 cm,
 *  the asphalt's edges and lines would come out in steps (plan 91 phase 7). */
export function wayPiece(w: Way, piece: Rect, own: Own | RestOwn): { slot: Slot; geo: BufferGeometry }[] {
  const rest = "circle" in own ? own.circle : null;
  const span = rest ? null : spanOf(w, piece);
  if (!rest && !span) return [];
  const s = sinks();
  const r = groundsRng(77 + WAYS.indexOf(w));
  const near: Near = rest
    ? (x, z, pad = 0) => Math.hypot(x - rest.cx, z - rest.cz) < rest.r + pad
    : pieceNear(piece, own as Own);
  const { asphalt, lines } = wayGeo(w, near, span, r, s);
  const by: Record<Slot, G> = { asphalt, lines, ...s };
  return SLOTS.filter((k) => !by[k].empty).map((k) => {
    const pos = by[k].pos;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] -= piece.x0;
      pos[i + 2] -= piece.z0;
    }
    return { slot: k, geo: by[k].build() };
  });
}

// ── between a worker and the main thread ──

export interface PieceAsk {
  /** the piece's key (a district's own: its corner, the way's key, the piece's corner) */
  piece: string;
  way: string;
  at: Rect;
  own: Own | RestOwn;
}
export interface PieceGeo {
  slot: Slot;
  attrs: { name: string; array: Float32Array; size: number }[];
}
export interface PieceData {
  piece: string;
  /** the edits it was made under (grounds' editsVersion, the main thread's) */
  v: number;
  geos: PieceGeo[];
}

export function pieceData(a: PieceAsk, v: number): PieceData {
  const w = WAYS.find((u) => u.key === a.way);
  const geos: PieceGeo[] = [];
  if (w)
    for (const { slot, geo } of wayPiece(w, a.at, a.own)) {
      geos.push({
        slot,
        attrs: Object.entries(geo.attributes).map(([name, at]) => ({
          name,
          array: at.array as Float32Array,
          size: at.itemSize,
        })),
      });
      // (its arrays go with the message: the geometry's own is let go)
    }
  return { piece: a.piece, v, geos };
}
export const pieceBuffers = (d: PieceData): ArrayBuffer[] =>
  d.geos.flatMap((g) => g.attrs.map((a) => a.array.buffer as ArrayBuffer));

/** (its arrays taken as they are: a Float32BufferAttribute would copy them) */
export function pieceGeometry(g: PieceGeo): BufferGeometry {
  const geo = new BufferGeometry();
  for (const a of g.attrs) geo.setAttribute(a.name, new BufferAttribute(a.array, a.size));
  return geo;
}
