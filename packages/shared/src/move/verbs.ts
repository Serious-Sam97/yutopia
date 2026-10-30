import { BODY_R, type Grid } from "../grid.ts";

type Asks = Pick<Grid, "fitsAt" | "groundAt" | "clear">;

import { MOVE, type MoveSpec } from "./spec.ts";

// The verbs (docs/plan/29-the-move.md, M4): getting over things (a vault onto
// and off a hip-high top, a mantle onto a chest-high one) found by probing the
// grid ahead, and the dodge's roll and the sprint's slide. Each is a shape in
// time — the same on the client and the server, so the server can check it.

// (adash: the air dash on the wire — the body keeps it as `airDash`, not a verb of its own:
// docs/plan/56-the-controls.md B)
export const VERBS = ["vault", "mantle", "roll", "slide", "adash"] as const;
export type VerbKind = (typeof VERBS)[number];
export const isVerb = (k: unknown): k is VerbKind => VERBS.includes(k as VerbKind);

/** Something ahead to get over (a vault) or up onto (a mantle). */
export interface Probe {
  kind: "vault" | "mantle";
  /** its top over the feet, tiles */
  h: number;
  /** where it starts (the body touches it there), and where it ends (a vault's top), ahead of the
   *  body's centre */
  near: number;
  far?: number;
  /** how far the verb carries the body, tiles */
  dist: number;
}

const DS = 0.05;

/** What's ahead of a body at (x, y), feet z up, going (dx, dy) at `speed`: something to vault
 *  or mantle, or null (nothing there, too low — a step or a hop — too high, or no room). The
 *  faster you go, the further ahead it looks (a run-up's press comes early). */
export function probeVault(
  grid: Asks,
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  speed = 0,
  spec: MoveSpec = MOVE,
): Probe | null {
  const n = Math.hypot(dx, dy);
  if (n < 1e-6) return null;
  const ux = dx / n;
  const uy = dy / n;
  const at = (d: number) => ({ x: x + ux * d, y: y + uy * d });
  // where the body first bumps into something
  let near = -1;
  const reach = Math.min(1.25, spec.vault.reach + 0.1 * speed);
  for (let d = DS; d <= reach + 1e-9; d += DS) {
    const p = at(d);
    if (!grid.fitsAt(p.x, p.y, z)) {
      near = d;
      break;
    }
  }
  if (near < 0) return null;
  // its top just inside its edge, up to a mantle's reach — the highest across its first stretch
  // (on a slope a top isn't level: one too high to step onto mustn't read too low to vault)
  const inside = near + BODY_R + 0.12;
  const q = at(inside);
  let top = Number.NEGATIVE_INFINITY;
  for (const t of [0.02, 0.12, 0.24]) {
    const e = at(near + BODY_R + t);
    top = Math.max(top, grid.groundAt(e.x, e.y, z + spec.mantle.high, 0.04));
  }
  const h = top - z;
  if (!(h >= spec.vault.low && h <= spec.mantle.high + 1e-9)) return null;
  // something to stand on (not a wall, a lamp: their tops are Infinity, never found)
  if (!grid.fitsAt(q.x, q.y, top, 0.04)) return null;
  if (h <= spec.vault.high) {
    // its far side: where the top drops away again
    let far = -1;
    for (let d = inside; d <= inside + 1.2; d += DS) {
      const p = at(d);
      if (grid.groundAt(p.x, p.y, top, 0.04) < top - 0.1) {
        far = d;
        break;
      }
    }
    if (far >= 0) {
      // ground to land on beyond it, about as high as where we started
      for (let d = far + BODY_R; d <= far + spec.vault.beyond; d += DS) {
        const p = at(d);
        const g = grid.groundAt(p.x, p.y, z + 0.3);
        if (Math.abs(g - z) < 0.3 && grid.fitsAt(p.x, p.y, g) && grid.clear({ x, y }, p, BODY_R, top + 0.02)) {
          // (landing a stride beyond it where there's room, not right at its foot)
          const q = at(d + 0.35);
          const room = Math.abs(grid.groundAt(q.x, q.y, z + 0.3) - z) < 0.3 && grid.fitsAt(q.x, q.y, z);
          return { kind: "vault", h, near, far, dist: room ? d + 0.35 : d };
        }
      }
    }
  }
  // up onto it: room to stand on the top, and nothing in the way up there
  const on = at(near + BODY_R + 0.35);
  if (grid.fitsAt(on.x, on.y, top) && grid.clear(at(near), on, BODY_R, top + 0.02))
    return { kind: "mantle", h, near, dist: near + BODY_R + 0.35 };
  return null;
}

const smoother = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};
const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

// the vault's feet: down, onto the top (a step), a little over it pushing off, down beyond
const VAULT_UP: [number, number][] = [
  [0, 0],
  [0.2, 0],
  [0.36, 1],
  [0.52, 1.1],
  [0.7, 0.75],
  [0.86, 0],
  [1, 0],
];
function keyed(keys: [number, number][], t: number): number {
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
  const [t0, a] = keys[i];
  const [t1, b] = keys[i + 1];
  return a + (b - a) * smooth((t - t0) / (t1 - t0));
}

/** Where a verb has the feet `t` (0..1) through it, from where it started: tiles ahead and up.
 *  `h` the top (vault, mantle), `dist` how far it carries (the probe's). The roll and the
 *  slide are moved by the ground (step.ts); theirs is the nominal shape, for previews. */
export function verbPath(
  kind: VerbKind,
  t: number,
  h = 0.6,
  dist?: number,
  spec: MoveSpec = MOVE,
  near?: number,
  far?: number,
): { ahead: number; up: number } {
  const x = Math.max(0, Math.min(1, t));
  switch (kind) {
    case "vault": {
      const ahead = (dist ?? 1.6) * x;
      if (near === undefined || far === undefined) return { ahead, up: h * keyed(VAULT_UP, x) };
      // by the distances (a deep top as well as a thin one): up onto it by the time the body's
      // over its edge, along it till its far side is cleared, down beyond
      const clear = far + BODY_R;
      const rise = smooth((ahead - (near - 0.45)) / 0.45);
      const fall = smooth((ahead - clear) / Math.max(0.15, (dist ?? clear) - clear));
      return { ahead, up: h * 1.08 * rise * (1 - fall) };
    }
    case "mantle":
      // up to the top first, then onto it
      if (near === undefined) return { ahead: (dist ?? 0.8) * smoother((x - 0.5) / 0.45), up: h * smoother(x / 0.55) };
      // (docs/plan/58 5b: in to the face first — the hands take the edge — then up, then onto it)
      return {
        ahead: near * smoother(x / 0.22) + ((dist ?? near + 0.6) - near) * smoother((x - 0.5) / 0.42),
        up: h * smoother((x - 0.08) / 0.52),
      };
    case "roll": {
      const L = spec.roll.len * spec.roll.speed;
      return { ahead: L * (1.3 * x - 0.35 * x * x), up: 0 };
    }
    default:
      return { ahead: 3.6 * (1 - (1 - x) ** 1.8), up: 0 };
  }
}

/** The roll's speed `t` (0..1) through it, tiles / s: a burst easing off. */
export const rollSpeed = (t: number, spec: MoveSpec = MOVE) =>
  spec.roll.speed * (1.3 - 0.7 * Math.max(0, Math.min(1, t)));

/** How far through its verb a body is, for its pose (0..1): a slide's middle lasts as long as it
 *  slides (by the speed it has lost). */
export function verbProgress(
  v: { kind: VerbKind; t: number; len: number; h: number; dist: number },
  spec: MoveSpec = MOVE,
): number {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  if (v.kind !== "slide") return clamp(v.t / v.len);
  if (v.t < 0.2) return clamp(v.t / 0.2) * 0.3;
  return 0.3 + 0.45 * clamp((v.h - v.dist) / Math.max(0.1, v.h - spec.slide.minSpeed));
}

/** How long a verb takes, s. */
export function verbLen(kind: VerbKind, spec: MoveSpec = MOVE): number {
  return kind === "vault"
    ? spec.vault.len
    : kind === "mantle"
      ? spec.mantle.len
      : kind === "roll"
        ? spec.roll.len
        : kind === "adash"
          ? (spec.airDash?.len ?? 0.18)
          : spec.slide.len;
}
