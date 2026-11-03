import { doorShut, ISO_PX, openingCut } from "@yutopia/shared";
import { type BufferGeometry, CylinderGeometry, ExtrudeGeometry, Path, Shape, TorusGeometry } from "three";
import { ball, box, cyl, Model, merged } from "./kit";
import { P, shade } from "./palette";

// Doors and windows (docs/plan/68-more-furniture.md, phase 13): set into a wall, redrawn by the kit.
// Each in its own frame: x along the wall across its edges (0..n), y up, z across the wall — the
// wall's middle at z 0, its faces at ±0.1 (shared openings.ts cuts the hole; the frame lines it,
// the casings round it on both faces). `a0`/`a1`: where the frame stops at either end (a post in the
// wall there: its half thickness in). A door's leaves shut in the frame, or swung open square to the
// wall (props.swing −1: to the other side) while it's open or someone's passing; a barn door and the
// automatic doors slide; the revolving door's wings turn (live) while someone's passing.

const T = 0.1; // the wall's half thickness (art/items/walls.ts WALL_HALF_T)
const Z = (px: number) => px / ISO_PX;
const GLASS = 0xcfe3ea;

export interface OpeningLook {
  kind: string;
  n: number;
  a0: number;
  a1: number;
  shut: boolean;
  locked: boolean;
  side: 1 | -1;
  glass: boolean;
  color: number | null;
  passing: boolean;
}

/** What makes two of a kind look different (the cache's key). */
export function openingLook(
  o: { kind: string; props?: Record<string, unknown> },
  n: number,
  a0: number,
  a1: number,
): OpeningLook {
  const c = o.props?.color;
  return {
    kind: o.kind,
    n,
    a0,
    a1,
    shut: doorShut(o),
    locked: o.props?.state === "locked",
    side: Number(o.props?.swing) < 0 ? -1 : 1,
    glass: !!o.props?.glass,
    color: typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? Number.parseInt(c.slice(1), 16) : null,
    passing: !!o.props?.passing,
  };
}

// ── the frame ────────────────────────────────────────────────────────────────────────────────────

/** The lining of the hole x0..x1 × y0..y1 (through the wall), and its casings on both faces;
 *  `apron`: a casing under it too (a window). */
function frame(m: Model, x0: number, x1: number, y0: number, y1: number, c: number, apron: boolean, w = 0.075) {
  const d = 2 * T + 0.01;
  const lt = 0.03;
  m.add(box([lt, y1 - y0, d]), c, { at: [x0 + lt / 2, (y0 + y1) / 2, 0] });
  m.add(box([lt, y1 - y0, d]), c, { at: [x1 - lt / 2, (y0 + y1) / 2, 0] });
  m.add(box([x1 - x0, lt, d]), c, { at: [(x0 + x1) / 2, y1 - lt / 2, 0] });
  if (apron) m.add(box([x1 - x0, lt, d]), c, { at: [(x0 + x1) / 2, y0 + lt / 2, 0] });
  const f = shade(c, 0.94);
  for (const s of [-1, 1]) {
    const z = s * (T + 0.008);
    m.add(box([w, y1 - y0 + w, 0.016], 0.003), f, {
      at: [x0 - w / 2 + 0.01, (y0 + y1 + w) / 2 - (apron ? w / 2 : 0), z],
    });
    m.add(box([w, y1 - y0 + w, 0.016], 0.003), f, {
      at: [x1 + w / 2 - 0.01, (y0 + y1 + w) / 2 - (apron ? w / 2 : 0), z],
    });
    m.add(box([x1 - x0 + 2 * w - 0.02, w, 0.018], 0.003), f, { at: [(x0 + x1) / 2, y1 + w / 2, z] });
    if (apron) m.add(box([x1 - x0 + 2 * w - 0.02, w, 0.016], 0.003), f, { at: [(x0 + x1) / 2, y0 - w / 2, z] });
  }
}

/** A sill board on both faces, the window's foot. */
function sills(m: Model, x0: number, x1: number, y: number, c: number) {
  for (const s of [-1, 1])
    m.add(box([x1 - x0 + 0.12, 0.03, 0.09], 0.004), c, { at: [(x0 + x1) / 2, y - 0.015, s * (T + 0.03)] });
}

/** A plate filling x0..x1 × y0..y1 through the wall, a hole cut in it (a round or an arched window,
 *  an archway): `hole` its outline (x, y) in the same frame. */
function plate(
  m: Model,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  hole: [number, number][],
  c: number,
  d = 2 * T,
) {
  const s = new Shape();
  s.moveTo(x0, y0);
  s.lineTo(x1, y0);
  s.lineTo(x1, y1);
  s.lineTo(x0, y1);
  s.closePath();
  const h = new Path();
  h.moveTo(hole[0][0], hole[0][1]);
  for (const [x, y] of hole.slice(1)) h.lineTo(x, y);
  h.closePath();
  s.holes.push(h);
  m.add(new ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -d / 2), c);
}
const arch = (cx: number, r: number, spring: number, bottom: number, seg = 14): [number, number][] => {
  const pts: [number, number][] = [
    [cx - r, bottom],
    [cx + r, bottom],
  ];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI;
    pts.push([cx + Math.cos(a) * r, spring + Math.sin(a) * r]);
  }
  return pts;
};
const circle = (cx: number, cy: number, r: number, seg = 20): [number, number][] =>
  Array.from({ length: seg }, (_, i) => {
    const a = (-i / seg) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });

// ── the leaves ───────────────────────────────────────────────────────────────────────────────────

/** A leaf's parts, in its own terms — along it from the hinge (u), up (y), through it (w, + its
 *  front) — put where it is: shut in the frame, or open square to the wall on `side`. */
function leafPutter(m: Model, hx: number, dir: 1 | -1, open: boolean, side: 1 | -1) {
  return (
    u0: number,
    u1: number,
    y0: number,
    y1: number,
    w0: number,
    w1: number,
    c: number,
    opts: { glass?: number; glow?: boolean } = {},
  ) => {
    const uc = (u0 + u1) / 2;
    const wc = (w0 + w1) / 2;
    if (!open) m.add(box([u1 - u0, y1 - y0, w1 - w0], 0.002), c, { at: [hx + dir * uc, (y0 + y1) / 2, wc], ...opts });
    else
      m.add(box([w1 - w0, y1 - y0, u1 - u0], 0.002), c, {
        at: [hx + dir * (0.025 - wc * side), (y0 + y1) / 2, side * (uc + 0.02)],
        ...opts,
      });
  };
}
type Put = ReturnType<typeof leafPutter>;
const TH = 0.042; // a leaf's thickness

/** A panelled leaf (four raised panels a face), or glazed above its lock rail; its lever, hinges. */
function panelLeaf(put: Put, lw: number, lh: number, c: number, glass: boolean) {
  const h = TH / 2;
  if (glass) {
    const st = 0.11;
    put(0, st, 0, lh, -h, h, c);
    put(lw - st, lw, 0, lh, -h, h, c);
    put(st, lw - st, lh - 0.12, lh, -h, h, c);
    put(st, lw - st, 0, 0.95, -h, h, c);
    put(st, lw - st, 0.95, lh - 0.12, -0.006, 0.006, GLASS, { glass: 0.3 });
    // (its glazing bars)
    put(lw / 2 - 0.012, lw / 2 + 0.012, 0.95, lh - 0.12, -0.012, 0.012, c);
    put(st, lw - st, (0.95 + lh - 0.12) / 2 - 0.012, (0.95 + lh - 0.12) / 2 + 0.012, -0.012, 0.012, c);
    for (const s of [-1, 1])
      put(0.2, lw - 0.2, 0.25, 0.75, s > 0 ? h : -h - 0.008, s > 0 ? h + 0.008 : -h, shade(c, 1.08));
  } else {
    put(0, lw, 0, lh, -h, h, c);
    for (const s of [-1, 1])
      for (const [y0, y1] of [
        [0.16, 0.88],
        [1.06, lh - 0.14],
      ])
        for (const [u0, u1] of [
          [0.11, lw / 2 - 0.04],
          [lw / 2 + 0.04, lw - 0.11],
        ])
          put(u0, u1, y0, y1, s > 0 ? h : -h - 0.01, s > 0 ? h + 0.01 : -h, shade(c, 1.07));
  }
  // the lever both sides, the lock's rose, the hinges
  for (const s of [-1, 1]) {
    put(lw - 0.09, lw - 0.06, 0.98, 1.02, s * (h + 0.012) - 0.008, s * (h + 0.012) + 0.008, P.brass);
    put(lw - 0.2, lw - 0.06, 1.0, 1.02, s * (h + 0.03) - 0.008, s * (h + 0.03) + 0.008, P.brass);
  }
  for (const y of [0.25, lh - 0.3]) put(-0.006, 0.012, y, y + 0.1, -0.008, 0.008, P.brass);
}

/** A recording studio's door: padded in quilted strips, a small double-glazed window, a push bar. */
function studioLeaf(put: Put, lw: number, lh: number, c: number) {
  const h = TH / 2 + 0.01;
  put(0, lw, 0, lh, -h, h, c);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const u0 = 0.08 + k * ((lw - 0.16) / 4);
      put(
        u0 + 0.01,
        u0 + (lw - 0.16) / 4 - 0.01,
        0.1,
        lh - 0.1,
        s > 0 ? h : -h - 0.014,
        s > 0 ? h + 0.014 : -h,
        shade(c, 1.1),
      );
    }
    put(0.12, lw - 0.12, 0.95, 1.0, s * (h + 0.04) - 0.012, s * (h + 0.04) + 0.012, P.steelLight);
  }
  put(lw / 2 - 0.14, lw / 2 + 0.14, 1.38, 1.7, -h - 0.016, h + 0.016, P.graphite);
  put(lw / 2 - 0.11, lw / 2 + 0.11, 1.41, 1.67, -h - 0.018, h + 0.018, GLASS, { glass: 0.35 });
}

/** A saloon door's half leaf: louvred between its rails, swinging. */
function saloonLeaf(put: Put, lw: number, c: number) {
  const [y0, y1] = [0.45, 1.45];
  const h = 0.014;
  put(0, 0.05, y0, y1, -h, h, c);
  put(lw - 0.05, lw, y0, y1 - 0.06, -h, h, c);
  put(0, lw, y0, y0 + 0.08, -h, h, c);
  put(0, lw, y1 - 0.12, y1 - 0.06, -h, h, c);
  // (its top, scalloped down from the hinge)
  put(0, lw * 0.5, y1 - 0.06, y1, -h, h, c);
  put(lw * 0.5, lw * 0.8, y1 - 0.06, y1 - 0.03, -h, h, c);
  for (let k = 0; k < 9; k++) {
    const y = y0 + 0.12 + k * 0.09;
    put(0.05, lw - 0.05, y, y + 0.05, -h * 0.6, h * 0.6, shade(c, 0.9));
  }
}

// ── the doors ────────────────────────────────────────────────────────────────────────────────────

function door(m: Model, L: OpeningLook) {
  const D = Z(openingCut(L.kind)[1]);
  const [x0, x1] = [L.a0, L.a1];
  const open = !L.shut;
  const kind = L.kind;
  const studio = kind === "door_studio";
  const casing = studio ? P.graphite : kind === "door_auto" || kind === "door_revolving" ? P.alumDark : P.cream;
  const col =
    L.color ??
    (studio
      ? 0x7a2a22
      : kind === "door_saloon"
        ? P.teak
        : kind === "door_barn"
          ? 0x7a4a2c
          : kind === "door_garage"
            ? P.white
            : L.glass
              ? P.walnutDark
              : P.walnut);
  if (kind !== "door_barn") frame(m, x0, x1, 0, D, casing, false);
  // the threshold
  m.add(box([x1 - x0, 0.012, 2 * T], 0.002), studio ? P.graphite : P.oak, { at: [(x0 + x1) / 2, 0.006, 0] });
  // (a locked one: a little red lamp over it, lit)
  if (L.locked)
    m.add(box([0.08, 0.04, 0.02], 0.004), 0xff4a3a, { at: [(x0 + x1) / 2, D + 0.12, T + 0.02], glow: true });
  const inner0 = x0 + 0.03;
  const inner1 = x1 - 0.03;
  const lh = D - 0.03 - 0.014;
  switch (kind) {
    case "door":
    case "door_studio": {
      const put = leafPutter(m, inner0 + 0.004, 1, open, L.side);
      const lw = inner1 - inner0 - 0.008;
      if (studio) {
        studioLeaf(put, lw, lh, col);
        // ON AIR over it, lit while it's shut
        m.add(box([0.36, 0.12, 0.05], 0.008), P.ink, { at: [(x0 + x1) / 2, D + 0.2, T + 0.03] });
        m.add(box([0.3, 0.07, 0.01]), L.shut ? 0xff3a2a : 0x4a1a16, {
          at: [(x0 + x1) / 2, D + 0.2, T + 0.057],
          glow: L.shut,
        });
      } else panelLeaf(put, lw, lh, col, L.glass);
      break;
    }
    case "door_double": {
      const lw = (inner1 - inner0) / 2 - 0.006;
      panelLeaf(leafPutter(m, inner0 + 0.003, 1, open, L.side), lw, lh, col, true);
      panelLeaf(leafPutter(m, inner1 - 0.003, -1, open, L.side), lw, lh, col, true);
      break;
    }
    case "door_saloon": {
      const lw = (inner1 - inner0) / 2 - 0.01;
      saloonLeaf(leafPutter(m, inner0 + 0.005, 1, open, L.side), lw, col);
      saloonLeaf(leafPutter(m, inner1 - 0.005, -1, open, L.side), lw, col);
      break;
    }
    case "door_barn": {
      // on the face: the rail over the opening, the leaf hung from it (slid aside when open)
      const z = L.side * (T + 0.04);
      const w = x1 - x0 + 0.12;
      const dx = open ? L.side * w * 0.95 : 0;
      m.add(box([2 * w + 0.1, 0.04, 0.02], 0.004), P.graphite, {
        at: [(x0 + x1) / 2 + L.side * w * 0.5, D + 0.14, L.side * (T + 0.012)],
      });
      const cx = (x0 + x1) / 2 + dx;
      for (let k = 0; k < 5; k++)
        m.add(box([w / 5 - 0.006, D + 0.04, 0.035], 0.003), shade(col, k % 2 ? 1 : 0.92), {
          at: [cx - w / 2 + (k + 0.5) * (w / 5), (D + 0.04) / 2, z],
        });
      for (const y of [0.25, D - 0.2])
        m.add(box([w, 0.12, 0.02], 0.003), shade(col, 0.82), { at: [cx, y, z + L.side * 0.025] });
      m.add(box([Math.hypot(w, D - 0.45) - 0.1, 0.11, 0.02], 0.003), shade(col, 0.82), {
        at: [cx, D / 2 - 0.02, z + L.side * 0.025],
        rot: [0, 0, Math.atan2(D - 0.45, w)],
      });
      for (const s of [-1, 1])
        m.add(cyl(0.035, 0.035, 0.03, 10).rotateX(Math.PI / 2), P.graphite, { at: [cx + s * w * 0.32, D + 0.1, z] });
      m.add(box([0.03, 0.3, 0.03], 0.006), P.graphite, { at: [cx - L.side * w * 0.38, 1.0, z + L.side * 0.04] });
      break;
    }
    case "door_auto": {
      // two glass leaves in aluminium, sliding apart (behind the side panes) as anyone comes near;
      // the header with its sensor
      const half = (inner1 - inner0) / 2;
      const slide = open ? half * 0.85 : 0;
      for (const s of [-1, 1]) {
        const cx = (inner0 + inner1) / 2 + s * (half / 2 + slide);
        const zz = 0.03;
        m.add(box([half, lh, 0.012]), 0xa9cdd8, { at: [cx, lh / 2, zz], glass: 0.38 });
        for (const ex of [-1, 1])
          m.add(box([0.035, lh, 0.04], 0.003), P.alumDark, { at: [cx + ex * (half / 2 - 0.0175), lh / 2, zz] });
        m.add(box([half, 0.05, 0.04], 0.003), P.alumDark, { at: [cx, lh - 0.025, zz] });
        m.add(box([half, 0.07, 0.04], 0.003), P.alumDark, { at: [cx, 0.035, zz] });
        // (the fixed side panes it slides behind)
        m.add(box([half * 0.8, lh, 0.012]), 0xa9cdd8, {
          at: [(inner0 + inner1) / 2 + s * half * 0.62, lh / 2, -0.03],
          glass: 0.3,
        });
      }
      m.add(box([x1 - x0 + 0.1, 0.16, 0.12], 0.008), P.alumDark, { at: [(x0 + x1) / 2, D + 0.1, T + 0.04] });
      m.add(box([0.12, 0.03, 0.02], 0.004), open ? 0x7fe08a : 0xff6a4a, {
        at: [(x0 + x1) / 2, D + 0.04, T + 0.105],
        glow: true,
      });
      break;
    }
    case "door_revolving": {
      // the drum: curved glass to either side, a canopy over, its four wings round a post (turning,
      // live, while someone's in it)
      const cx = (x0 + x1) / 2;
      const r = Math.min(1.05, (x1 - x0) / 2 + 0.05);
      for (const s of [0, Math.PI]) {
        m.add(new CylinderGeometry(r, r, lh, 20, 1, true, s + Math.PI * 0.18, Math.PI * 0.64), GLASS, {
          at: [cx, lh / 2, 0],
          glass: 0.36,
        });
        for (const y of [0.03, lh - 0.03])
          m.add(
            new TorusGeometry(r, 0.02, 4, 14, Math.PI * 0.64).rotateX(Math.PI / 2).rotateY(-(s + Math.PI * 0.18)),
            P.alumDark,
            {
              at: [cx, y, 0],
            },
          );
      }
      m.add(cyl(r + 0.06, r + 0.06, 0.14, 24), P.alumDark, { at: [cx, D - 0.03, 0] });
      m.add(cyl(r + 0.02, r + 0.02, 0.012, 24), P.stone, { at: [cx, 0, 0] });
      const wings: BufferGeometry[] = [];
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        wings.push(
          box([r - 0.06, lh - 0.1, 0.012])
            .translate((r - 0.06) / 2 + 0.03, lh / 2, 0)
            .rotateY(a),
        );
      }
      const frameG = merged([
        cyl(0.045, 0.045, lh, 10),
        ...Array.from({ length: 4 }, (_, k) =>
          box([r - 0.04, 0.05, 0.03])
            .translate((r - 0.04) / 2 + 0.03, lh - 0.07, 0)
            .rotateY((k * Math.PI) / 2 + Math.PI / 4),
        ),
        ...Array.from({ length: 4 }, (_, k) =>
          box([r - 0.04, 0.08, 0.03])
            .translate((r - 0.04) / 2 + 0.03, 0.06, 0)
            .rotateY((k * Math.PI) / 2 + Math.PI / 4),
        ),
      ]);
      if (L.passing) {
        m.live(merged(wings), GLASS, { kind: "spin", axis: "y", speed: 1.1 }, { at: [cx, 0, 0], glass: true });
        m.live(frameG, P.alumDark, { kind: "spin", axis: "y", speed: 1.1 }, { at: [cx, 0, 0] });
      } else {
        m.add(merged(wings), 0xa9cdd8, { at: [cx, 0, 0], glass: 0.36 });
        m.add(frameG, P.alumDark, { at: [cx, 0, 0] });
      }
      break;
    }
    case "door_garage": {
      // a roller door: its slats down in the opening, or rolled up into the box over it; the guides
      for (const x of [x0 + 0.03, x1 - 0.03]) m.add(box([0.05, D, 0.08], 0.004), P.alumDark, { at: [x, D / 2, -0.02] });
      m.add(box([x1 - x0, 0.32, 0.3], 0.01), shade(col, 0.9), { at: [(x0 + x1) / 2, D - 0.16, -0.01] });
      if (!open) {
        const n = 14;
        const sh = (D - 0.32) / n;
        for (let k = 0; k < n; k++)
          m.add(box([inner1 - inner0, sh - 0.008, 0.04], 0.004), k % 2 ? col : shade(col, 0.95), {
            at: [(inner0 + inner1) / 2, k * sh + sh / 2, -0.02],
          });
        m.add(box([0.3, 0.035, 0.03], 0.006), P.graphite, { at: [(inner0 + inner1) / 2, 0.18, 0.02] });
      }
      break;
    }
  }
}

// ── the windows ──────────────────────────────────────────────────────────────────────────────────

function window(m: Model, L: OpeningLook) {
  const [p0, p1] = openingCut(L.kind);
  const y0 = Z(p0);
  const y1 = Z(p1);
  const [x0, x1] = [L.a0, L.a1];
  const kind = L.kind;
  const studio = kind === "window_studio";
  const c = studio ? P.graphite : kind === "window_stained" ? P.walnut : kind === "window_high" ? P.alumDark : P.white;
  const pane = (px0: number, px1: number, py0: number, py1: number, col = GLASS, op = 0.26, z = 0) =>
    m.add(box([px1 - px0, py1 - py0, 0.01]), col, { at: [(px0 + px1) / 2, (py0 + py1) / 2, z], glass: op });
  const bar = (bx0: number, bx1: number, by0: number, by1: number, d = 0.045) =>
    m.add(box([bx1 - bx0, by1 - by0, d], 0.002), c, { at: [(bx0 + bx1) / 2, (by0 + by1) / 2, 0] });
  const i0 = x0 + 0.05;
  const i1 = x1 - 0.05;
  const j0 = y0 + 0.05;
  const j1 = y1 - 0.05;
  if (kind === "window_round") {
    // a porthole: the plate round it, its ring both faces, the glass
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const r = Math.min(x1 - x0, y1 - y0) / 2 - 0.06;
    plate(m, x0, x1, y0, y1, circle(cx, cy, r), P.cream);
    for (const s of [-1, 1])
      m.add(new TorusGeometry(r + 0.02, 0.03, 6, 24), P.brass, { at: [cx, cy, s * (T + 0.012)] });
    m.add(cyl(r, r, 0.01, 24).rotateX(Math.PI / 2), GLASS, { at: [cx, cy, 0], glass: 0.26 });
    return;
  }
  if (kind === "window_arched") {
    const cx = (x0 + x1) / 2;
    const r = (x1 - x0) / 2 - 0.08;
    const spring = y1 - r - 0.06;
    plate(m, x0, x1, y0, y1, arch(cx, r, spring, y0 + 0.05), P.cream);
    frame(m, x0, x1, y0, y1, P.white, true);
    sills(m, x0, x1, y0, P.white);
    m.add(box([2 * r, spring - y0 - 0.05, 0.01]), GLASS, { at: [cx, (spring + y0 + 0.05) / 2, 0], glass: 0.26 });
    m.add(new CylinderGeometry(r, r, 0.01, 18, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), GLASS, {
      at: [cx, spring, 0],
      glass: 0.26,
    });
    // its bars: up the middle, across at the spring, the fan in the arch
    m.add(box([0.035, y1 - y0 - 0.15, 0.04]), P.white, { at: [cx, (y0 + y1) / 2 - 0.05, 0] });
    m.add(box([2 * r, 0.035, 0.04]), P.white, { at: [cx, spring, 0] });
    for (const a of [Math.PI / 4, (3 * Math.PI) / 4])
      m.add(box([r, 0.03, 0.04]), P.white, {
        at: [cx + (Math.cos(a) * r) / 2, spring + (Math.sin(a) * r) / 2, 0],
        rot: [0, 0, a],
      });
    return;
  }
  frame(m, x0, x1, y0, y1, c, true, studio ? 0.05 : 0.075);
  if (kind !== "window_high") sills(m, x0, x1, y0, studio ? P.graphite : P.white);
  switch (kind) {
    case "window":
    case "window_blinds": {
      // two casements, each of two lights
      pane(i0, i1, j0, j1);
      bar((i0 + i1) / 2 - 0.025, (i0 + i1) / 2 + 0.025, j0, j1, 0.06);
      bar(i0, i1, (j0 + j1) / 2 - 0.018, (j0 + j1) / 2 + 0.018);
      if (kind === "window_blinds") {
        // the blinds let down two thirds, on the room's side; their cord
        const down = j1 - (j1 - j0) * 0.68;
        for (let y = j1 - 0.03; y > down; y -= 0.045)
          m.add(box([i1 - i0 + 0.04, 0.006, 0.05], 0.001), P.paper, {
            at: [(i0 + i1) / 2, y, T + 0.05],
            rot: [0.5, 0, 0],
          });
        m.add(box([i1 - i0 + 0.06, 0.05, 0.06], 0.006), P.paper, { at: [(i0 + i1) / 2, j1 + 0.01, T + 0.05] });
        m.add(box([i1 - i0 + 0.04, 0.02, 0.05], 0.004), shade(P.paper, 0.9), { at: [(i0 + i1) / 2, down, T + 0.05] });
        m.add(cyl(0.003, 0.003, j1 - down + 0.1, 4), P.paper, { at: [i1 - 0.03, down - 0.1, T + 0.08] });
        m.add(ball(0.012, 5), P.paper, { at: [i1 - 0.03, down - 0.11, T + 0.08] });
      }
      break;
    }
    case "window_wide":
    case "window_high": {
      pane(i0, i1, j0, j1);
      const k = kind === "window_high" ? 3 : 3;
      for (let i = 1; i < k; i++)
        bar(i0 + ((i1 - i0) * i) / k - 0.022, i0 + ((i1 - i0) * i) / k + 0.022, j0, j1, 0.055);
      if (kind === "window_wide") bar(i0, i1, j1 - (j1 - j0) * 0.28, j1 - (j1 - j0) * 0.28 + 0.035);
      break;
    }
    case "window_tall": {
      // a tall casement under a transom
      const tr = j1 - 0.38;
      pane(i0, i1, j0, j1);
      bar(i0, i1, tr - 0.02, tr + 0.02, 0.055);
      bar((i0 + i1) / 2 - 0.02, (i0 + i1) / 2 + 0.02, j0, tr);
      for (const y of [j0 + (tr - j0) / 3, j0 + (2 * (tr - j0)) / 3]) bar(i0, i1, y - 0.014, y + 0.014);
      break;
    }
    case "window_stained": {
      // coloured glass in lead: a rose in a border
      const cols = [0xb83a3a, 0x2f5fa8, 0xd8a83a, 0x3f8a52, 0x8a4aa8];
      const nx = 3;
      const ny = 5;
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < ny; j++) {
          const border = i === 0 || i === nx - 1 || j === 0 || j === ny - 1;
          const col = border ? cols[(i + j) % 2 ? 1 : 2] : cols[(i * 3 + j) % cols.length];
          pane(
            i0 + ((i1 - i0) * i) / nx,
            i0 + ((i1 - i0) * (i + 1)) / nx,
            j0 + ((j1 - j0) * j) / ny,
            j0 + ((j1 - j0) * (j + 1)) / ny,
            col,
            0.55,
          );
        }
      for (let i = 1; i < nx; i++)
        bar(i0 + ((i1 - i0) * i) / nx - 0.008, i0 + ((i1 - i0) * i) / nx + 0.008, j0, j1, 0.02);
      for (let j = 1; j < ny; j++)
        bar(i0, i1, j0 + ((j1 - j0) * j) / ny - 0.008, j0 + ((j1 - j0) * j) / ny + 0.008, 0.02);
      m.add(new TorusGeometry(0.16, 0.012, 4, 18), P.ink, { at: [(i0 + i1) / 2, (j0 + j1) / 2, 0] });
      break;
    }
    case "window_studio": {
      // steel and double glazing: two panes a hand apart, a mullion
      for (const z of [-0.04, 0.04]) pane(i0, i1, j0, j1, 0xbcd0d8, 0.22, z);
      bar((i0 + i1) / 2 - 0.03, (i0 + i1) / 2 + 0.03, j0, j1, 0.14);
      for (const y of [j0 + 0.02, j1 - 0.02]) bar(i0, i1, y - 0.02, y + 0.02, 0.14);
      break;
    }
    default:
      pane(i0, i1, j0, j1);
  }
}

/** An archway: the plate round its arch, the keystone, its casing round the arch on both faces. */
function archway(m: Model, L: OpeningLook) {
  const D = Z(openingCut(L.kind)[1]);
  const [x0, x1] = [L.a0, L.a1];
  const cx = (x0 + x1) / 2;
  const r = (x1 - x0) / 2 - 0.05;
  const spring = D - r - 0.04;
  // the spandrels over the arch's springing, either side of its crown; the piers up to them
  for (const side of [-1, 1]) {
    const sh = new Shape();
    const xo = side < 0 ? x0 : x1;
    sh.moveTo(xo, spring);
    sh.lineTo(cx + side * r, spring);
    for (let i = 1; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2);
      sh.lineTo(cx + side * Math.cos(a) * r, spring + Math.sin(a) * r);
    }
    sh.lineTo(cx, D);
    sh.lineTo(xo, D);
    sh.closePath();
    m.add(new ExtrudeGeometry(sh, { depth: 2 * T + 0.01, bevelEnabled: false }).translate(0, 0, -T - 0.005), P.cream);
    m.add(box([0.05, spring, 2 * T + 0.01]), P.cream, { at: [xo - side * 0.025, spring / 2, 0] });
  }
  for (const s of [-1, 1]) {
    m.add(new TorusGeometry(r + 0.04, 0.035, 5, 16, Math.PI), P.stone, { at: [cx, spring, s * (T + 0.01)] });
    for (const ex of [-1, 1])
      m.add(box([0.07, spring, 0.03], 0.004), P.stone, { at: [cx + ex * (r + 0.04), spring / 2, s * (T + 0.01)] });
    m.add(box([0.12, 0.16, 0.04], 0.006), P.stone, { at: [cx, spring + r + 0.02, s * (T + 0.012)] });
  }
}

/** A door's or window's model in its frame (see the head of this file). */
export function openingModel(L: OpeningLook): BufferGeometry {
  const m = new Model(2);
  if (L.kind === "archway") archway(m, L);
  else if (L.kind.startsWith("window")) window(m, L);
  else door(m, L);
  return m.geometry();
}
