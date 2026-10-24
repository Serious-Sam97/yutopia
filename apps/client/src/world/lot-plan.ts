import { WAYS, wayHalf } from "@yutopia/shared/grounds";
import { CAR_COLOURS, type LotLayout, lotLayout, lotStripes } from "@yutopia/shared/lot";

// The lot, old and new, side by side in plan (docs/plan/42-the-lot.md, phase 0):
// the asphalt, the bays and the cars, the lamps, the driveway coming in, and
// the visitor's car's way to its bay and out. /dev/grounds?shot=lot-plan.

const PX = 11;
const VIEW = { x0: -66, z0: -40, x1: 6, z1: 68 };
const PANEL_W = (VIEW.x1 - VIEW.x0) * PX;
const PANEL_H = (VIEW.z1 - VIEW.z0) * PX;
const HEAD = 70;
const GAP = 40;
const FONT = `"Helvetica Neue", Arial, sans-serif`;

type Pt = [number, number];

export function drawLotPlans(c: HTMLCanvasElement) {
  c.width = PANEL_W * 2 + GAP * 3;
  c.height = PANEL_H + HEAD + 150;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "#d9dde1";
  g.fillRect(0, 0, c.width, c.height);
  panel(g, GAP, HEAD, "Today", old());
  panel(g, GAP * 2 + PANEL_W, HEAD, "Proposed", proposed());
  g.fillStyle = "#1f252b";
  g.font = `600 15px ${FONT}`;
  g.textAlign = "left";
  const key = [
    ["#c0392b", "the visitor's car: in"],
    ["#2471a3", "and out"],
    ["#e8b13a", "lamp posts"],
    ["#2f5f9e", "accessible bays"],
    ["#2e966e", "visitors' bays"],
  ];
  let x = GAP;
  for (const [col, label] of key) {
    g.fillStyle = col;
    g.fillRect(x, c.height - 34, 22, 6);
    g.fillStyle = "#1f252b";
    g.fillText(label, x + 30, c.height - 26);
    x += 60 + g.measureText(label).width;
  }
}

interface Drawn {
  rect: { x0: number; z0: number; x1: number; z1: number };
  paint: [number, number, number, number][];
  cars: { x: number; z: number; dir: number; colour: number }[];
  lamps: { x: number; z: number }[];
  mouth: Pt[]; // the driveway's line into the lot
  half?: number[]; // its half-width along it (a bellmouth); none: 4.5
  inn: Pt[];
  out: Pt[];
  extra?: (g: CanvasRenderingContext2D, X: (x: number) => number, Z: (z: number) => number) => void;
  notes: string[];
}

/** building.ts `seeded` (the old lot's own random), a copy: the index's values in a dev chunk
 *  re-split the world page's (docs/plan/42-the-lot.md). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The lot as it was before plan 42 (building.ts campusLot, a studio 36 deep), kept here to draw. */
function oldLot() {
  const lot = { x0: -56, z0: -8, x1: -10, z1: 48, bayW: 2.8, bayL: 5.6 };
  const c0 = lot.x1 - 2 - lot.bayL;
  const c1 = c0 - 6.5;
  const c2 = c1 - 2 * lot.bayL;
  const c3 = c2 - 6.5;
  const c4 = c3 - 2 * lot.bayL;
  const cols = [
    { x: c0, dir: -1 },
    { x: c1, dir: 1 },
    { x: c2, dir: -1 },
    { x: c3, dir: 1 },
    { x: c4, dir: -1 },
  ];
  const bays: { x: number; z: number; dir: number }[] = [];
  for (const col of cols)
    for (let z = lot.z0 + 3; z + lot.bayW <= lot.z1 - 3; z += lot.bayW)
      bays.push({ x: col.x - (col.dir * lot.bayL) / 2, z: z + lot.bayW / 2, dir: col.dir });
  let visitorBay = 0;
  for (let i = 0; i < bays.length; i++)
    if (bays[i].dir === -1 && bays[i].x > lot.x1 - 9 && Math.abs(bays[i].z - 24) < Math.abs(bays[visitorBay].z - 24))
      visitorBay = i;
  const taken = new Set([visitorBay]);
  const rc = seeded(123);
  const cars: { x: number; z: number; dir: number; colour: number }[] = [];
  for (let tries = 0; cars.length < 16 && tries < 200; tries++) {
    const i = Math.floor(rc() ** 1.7 * bays.length);
    if (taken.has(i)) continue;
    taken.add(i);
    rc();
    const colour = Math.floor(rc() * CAR_COLOURS.length);
    rc();
    rc();
    const z = bays[i].z + (rc() - 0.5) * 0.3;
    cars.push({ x: bays[i].x, z, dir: bays[i].dir, colour });
  }
  const lamps: { x: number; z: number }[] = [];
  for (const x of [c2, c4]) for (const z of [lot.z0 + 9, lot.z0 + 23, lot.z0 + 37]) lamps.push({ x, z });
  lamps.push({ x: lot.x1 - 1, z: lot.z0 + 4 }, { x: lot.x1 - 1, z: lot.z1 - 4 });
  return { ...lot, cols, aisles: [c0 - 3.25, c2 - 3.25], bays, cars, visitorBay, lamps };
}

function old(): Drawn {
  const l = oldLot();
  const bay = l.bays[l.visitorBay];
  const aisle = l.aisles[0];
  // (the old stripes: building.ts lotStripes, from the lot's rectangle)
  const paint: Drawn["paint"] = [];
  for (const col of l.cols) {
    const far = col.x - col.dir * l.bayL;
    const a = Math.min(col.x, far);
    for (const b of l.bays.filter((q) => q.dir === col.dir && Math.abs(q.x - (col.x - (col.dir * l.bayL) / 2)) < 0.01))
      paint.push([a, b.z - l.bayW / 2 - 0.045, l.bayL, 0.09]);
    paint.push([far - 0.045, l.z0 + 3, 0.09, l.z1 - 3 - (l.z0 + 3)]);
  }
  return {
    rect: l,
    paint,
    cars: l.cars,
    lamps: l.lamps,
    mouth: [
      [-40, -50],
      [-44, -30],
      [-48, -9],
    ],
    inn: [
      [-47, -14],
      [-48, -9],
      [-40, -6.5],
      [aisle, -6.5],
      [aisle, bay.z],
      [bay.x, bay.z],
    ],
    out: [
      [bay.x, bay.z + 0.5],
      [aisle + 0.5, bay.z + 0.5],
      [aisle + 0.5, -6],
      [-40, -6],
      [-47.5, -8.5],
      [-46.5, -14],
    ],
    notes: [
      "The driveway lands on the back of two rows: parked cars in its mouth.",
      "No cross aisle: a 3-tile strip at the top, two dead-end aisles.",
      "The west row faces a 3-tile strip, not an aisle. Lamps in bay mouths.",
      "Prod's studio is 48 deep: its asphalt runs on to z 60 unpainted.",
    ],
  };
}

function proposed(): Drawn {
  const l = lotLayout(18);
  const bay = l.bays[l.visitorBay];
  const [aw, ae] = l.aisles;
  const zN = (l.cross[0].z0 + l.cross[0].z1) / 2;
  const zS = (l.cross[1].z0 + l.cross[1].z1) / 2;
  const d = WAYS.find((w) => w.key === "driveway");
  const mouth: Pt[] = (d?.line.slice(0, 45) ?? []).map(([x, z]) => [x, z] as Pt).reverse();
  const half = (d?.line.slice(0, 45) ?? []).map((_, i) => (d ? wayHalf(d, i) : 4.5)).reverse();
  return {
    rect: l,
    paint: lotStripes(l),
    cars: l.cars,
    lamps: l.lamps,
    mouth,
    half,
    // (keeping right: in down the driveway's west lane, out up its east one)
    inn: [
      [aw - 1.6, -16],
      [aw - 1.6, zN + 1],
      [ae - 1.4, zN + 1],
      [ae - 1.4, bay.z],
      [bay.x, bay.z],
    ],
    out: [
      [bay.x, bay.z + 0.5],
      [ae - 0.8, bay.z + 0.5],
      [ae - 0.8, zS - 1],
      [aw + 1.2, zS - 1],
      [aw + 1.2, zN],
      [aw + 1.6, -16],
    ],
    extra: (g, X, Z) => dressing(g, l, X, Z),
    notes: [
      "The driveway lands on aisle W through a bellmouth; cross aisles at both ends.",
      "The aisles loop: in, park, out with no reversing up an aisle.",
      "Lamps on kerbed islands; a dump for the plough's snow on the west strip.",
      "A pavement along the building; accessible and visitors' bays by the doors.",
    ],
  };
}

function dressing(g: CanvasRenderingContext2D, l: LotLayout, X: (x: number) => number, Z: (z: number) => number) {
  const box = (r: { x0: number; z0: number; x1: number; z1: number }) =>
    [X(r.x0), Z(r.z0), X(r.x1) - X(r.x0), Z(r.z1) - Z(r.z0)] as const;
  g.fillStyle = "#e9edf0";
  g.fillRect(...box(l.dump));
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.strokeStyle = "rgba(120,130,140,0.6)";
  g.lineWidth = 1;
  for (let z = l.z0 + 2; z < l.z1 - 1; z += 3) {
    if (Math.abs(z - 22) < 3) continue;
    g.beginPath();
    g.ellipse(X(l.x0 + 3), Z(z), 2.6 * PX, 1.4 * PX, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  g.fillStyle = "#bdbcb6";
  g.fillRect(...box(l.pavement));
  for (const i of l.islands) {
    g.fillStyle = "#f2f5f7";
    g.strokeStyle = "#7d838a";
    g.lineWidth = 2;
    g.fillRect(...box(i));
    g.strokeRect(...box(i));
  }
  for (const b of l.bays) {
    if (b.kind === "plain") continue;
    g.fillStyle = b.kind === "accessible" ? "rgba(47,95,158,0.9)" : "rgba(46,150,110,0.9)";
    g.fillRect(X(b.x - l.bayL / 2 + 0.3), Z(b.z - l.bayW / 2 + 0.3), (l.bayL - 0.6) * PX, (l.bayW - 0.6) * PX);
  }
  for (const h of l.hatches) {
    g.strokeStyle = "rgba(240,240,240,0.9)";
    g.lineWidth = 1.5;
    g.strokeRect(...box(h));
  }
  // the sign
  g.fillStyle = "#1f3554";
  g.fillRect(X(l.sign.x) - 8, Z(l.sign.z) - 4, 16, 8);
}

function panel(g: CanvasRenderingContext2D, ox: number, oy: number, title: string, d: Drawn) {
  const X = (x: number) => ox + (x - VIEW.x0) * PX;
  const Z = (z: number) => oy + (z - VIEW.z0) * PX;
  g.save();
  g.beginPath();
  g.rect(ox, oy, PANEL_W, PANEL_H);
  g.clip();
  g.fillStyle = "#f4f6f8";
  g.fillRect(ox, oy, PANEL_W, PANEL_H);
  // the headquarters (a 48-wide studio, 36 deep here) and its doors
  g.fillStyle = "#59626c";
  g.fillRect(X(0), Z(0), 48 * PX, 36 * PX);
  g.fillStyle = "#bdbcb6";
  g.fillRect(X(d.rect.x1), Z(16), (0 - d.rect.x1) * PX, 4 * PX);
  g.fillStyle = "#f4f6f8";
  g.font = `600 13px ${FONT}`;
  g.save();
  g.translate(X(2.5), Z(18));
  g.rotate(-Math.PI / 2);
  g.textAlign = "center";
  g.fillText("DOORS", 0, 0);
  g.restore();
  // the driveway
  g.lineCap = "round";
  g.lineJoin = "round";
  if (d.half) {
    // as a band: each side offset by its half-width (the bellmouth opening out at the lot)
    const side = (sg: number) =>
      d.mouth.map(([x, z], i): Pt => {
        const [ax, az] = d.mouth[Math.max(0, i - 1)];
        const [bx, bz] = d.mouth[Math.min(d.mouth.length - 1, i + 1)];
        const l = Math.hypot(bx - ax, bz - az) || 1;
        const h = (d.half as number[])[i];
        return [x - ((bz - az) / l) * h * sg, z + ((bx - ax) / l) * h * sg];
      });
    const band = [...side(1), ...side(-1).reverse()];
    g.fillStyle = "#7c838b";
    g.beginPath();
    line(g, band, X, Z);
    g.fill();
  } else {
    g.strokeStyle = "#7c838b";
    g.lineWidth = 9 * PX;
    g.beginPath();
    line(g, d.mouth, X, Z);
    g.stroke();
  }
  // the asphalt
  g.fillStyle = "#4a4f56";
  g.fillRect(X(d.rect.x0), Z(d.rect.z0), (d.rect.x1 - d.rect.x0) * PX, (d.rect.z1 - d.rect.z0) * PX);
  d.extra?.(g, X, Z);
  g.fillStyle = "rgba(240,240,240,0.9)";
  for (const [x, z, w, h] of d.paint) g.fillRect(X(x), Z(z), Math.max(1.2, w * PX), Math.max(1.2, h * PX));
  // the cars (5 × 2, a dark nose)
  for (const c of d.cars) {
    g.fillStyle = `#${CAR_COLOURS[c.colour].toString(16).padStart(6, "0")}`;
    g.fillRect(X(c.x - 2.4), Z(c.z - 0.9), 4.8 * PX, 1.8 * PX);
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.lineWidth = 1;
    g.strokeRect(X(c.x - 2.4), Z(c.z - 0.9), 4.8 * PX, 1.8 * PX);
    g.fillStyle = "rgba(0,0,0,0.55)";
    const nose = c.dir > 0 ? c.x - 2.4 : c.x + 1.6;
    g.fillRect(X(nose), Z(c.z - 0.9), 0.8 * PX, 1.8 * PX);
  }
  // the lamps
  for (const m of d.lamps) {
    g.fillStyle = "#e8b13a";
    g.strokeStyle = "#1f252b";
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(X(m.x), Z(m.z), 5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  // the visitor's way in and out
  const path = (pts: Pt[], col: string) => {
    g.strokeStyle = col;
    g.lineWidth = 3;
    g.setLineDash([9, 6]);
    g.beginPath();
    line(g, pts, X, Z);
    g.stroke();
    g.setLineDash([]);
    const [ax, az] = pts[pts.length - 2];
    const [bx, bz] = pts[pts.length - 1];
    const a = Math.atan2(Z(bz) - Z(az), X(bx) - X(ax));
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(X(bx), Z(bz));
    g.lineTo(X(bx) - 12 * Math.cos(a - 0.4), Z(bz) - 12 * Math.sin(a - 0.4));
    g.lineTo(X(bx) - 12 * Math.cos(a + 0.4), Z(bz) - 12 * Math.sin(a + 0.4));
    g.fill();
  };
  path(d.inn, "#c0392b");
  path(d.out, "#2471a3");
  // the north arrow
  g.fillStyle = "#1f252b";
  g.font = `700 16px ${FONT}`;
  g.textAlign = "center";
  g.fillText("N ↑", X(VIEW.x1 - 3), Z(VIEW.z0 + 3));
  g.restore();
  // the title and notes
  g.fillStyle = "#1f252b";
  g.textAlign = "left";
  g.font = `700 24px ${FONT}`;
  g.fillText(title, ox, oy - 38);
  g.font = `500 13px ${FONT}`;
  for (const [i, n] of d.notes.entries()) g.fillText(n, ox, oy + PANEL_H + 20 + i * 17);
}

/** A polyline through `pts` (the lot's coords) into the current path. */
function line(g: CanvasRenderingContext2D, pts: Pt[], X: (x: number) => number, Z: (z: number) => number) {
  for (const [i, [x, z]] of pts.entries()) {
    if (i) g.lineTo(X(x), Z(z));
    else g.moveTo(X(x), Z(z));
  }
}
