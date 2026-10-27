import { GROUNDS, WAYS } from "@yutopia/shared/grounds";
import {
  BRIDGE_H,
  KART_BOWL,
  KART_CARPARK,
  KART_DESK,
  KART_FENCE,
  KART_GATE,
  KART_GROUND,
  KART_NAME,
  KART_PADDOCK,
  KART_PARK,
  KART_RACK,
  KART_ROAD,
  KART_SHED,
  KART_STANDS,
  KART_THINGS,
  KART_TOWER,
  KART_TURN,
  type KartLayoutKey,
  kartFloods,
  kartLayout,
  kartTrack,
  TRACK_W,
  type Track,
  trackAt,
} from "@yutopia/shared/kart";

// The Kart Park in plan (docs/plan/46-the-karts.md, phase 0): drawn over the Grounds' site plan
// (the new land east of the town, the road out to it), and close up — the circuit with its
// bridge, kerbs, grid, item boxes, boost pads and jump, the bowl, the stands, the tower, the
// paddock and its rack, its shed and what stands about it, the gate, the car park and the turning
// circle. /dev/karts?shot=plan and ?shot=park-plan.

const FONT = `"Helvetica Neue", Arial, sans-serif`;
const SERIF = `Georgia, 'Times New Roman', serif`;
const C = {
  paper: "#d9dde1",
  snow: "#eef1f3",
  bank: "#ffffff",
  asphalt: "#4a4f56",
  asphaltHi: "#5a6068",
  ink: "#1f252b",
  dim: "#5d6873",
  rust: "#b5562f",
  cream: "#f3ead6",
  amber: "#e8a33d",
  fence: "#8b3a2f",
  ice: "#bcd3df",
  wood: "#7a5534",
  olive: "#6b7a3a",
  bridge: "#2a2f35",
};

type XZ = (x: number, z: number) => [number, number];

/** A side of the track at sample p: + its left (−z of a heading east), − its right. */
const side = (p: { x: number; z: number; a: number }, off: number): [number, number] => [
  p.x + Math.sin(p.a) * off,
  p.z - Math.cos(p.a) * off,
];

/** The ribbon of road between `s0` and `s1` (arc length), as a closed path. */
function ribbon(g: CanvasRenderingContext2D, t: Track, P: XZ, s0: number, s1: number, half: number) {
  g.beginPath();
  for (let s = s0; s <= s1; s++) {
    const [x, z] = P(...side(trackAt(t, s), half));
    s === s0 ? g.moveTo(x, z) : g.lineTo(x, z);
  }
  for (let s = s1; s >= s0; s--) g.lineTo(...P(...side(trackAt(t, s), -half)));
  g.closePath();
}

/** The circuit and everything round it, at `px` pixels a metre through `P` (a layout of the track
 *  changer's: docs/plan/47-the-track-changer.md; today's by default). */
export function drawPark(g: CanvasRenderingContext2D, P: XZ, px: number, close: boolean, t: Track = kartTrack()) {
  const H = TRACK_W / 2;
  const lw = (m: number) => Math.max(1, m * px);
  // the park's ground: ploughed hard-pack inside the fence
  const [fx0, fz0] = P(KART_FENCE.x0, KART_FENCE.z0);
  const [fx1, fz1] = P(KART_FENCE.x1, KART_FENCE.z1);
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.fillRect(fx0, fz0, fx1 - fx0, fz1 - fz0);

  // the snow banks either side of the track (the walls you bounce off)
  g.lineJoin = "round";
  for (const [s0, s1] of [[0, t.len]] as const) {
    ribbon(g, t, P, s0, s1, H + 2.4);
    g.fillStyle = C.bank;
    g.fill();
    g.strokeStyle = "rgba(120,140,155,0.45)";
    g.lineWidth = 1;
    g.stroke();
  }
  // the road, the bridge's span drawn again on top, over the road it crosses (there only for a
  // layout over it)
  const bridge = t.pts.filter((p) => p.y > 0).map((p) => p.s);
  const b0 = Math.min(...bridge);
  const b1 = Math.max(...bridge);
  const road = (s0: number, s1: number) => {
    ribbon(g, t, P, s0, s1, H);
    g.fillStyle = C.asphalt;
    g.fill();
  };
  road(0, t.len - 1);
  road(t.len - 2, t.len + 1);
  // (the centre line: dashed, as the town's)
  const centre = (s0: number, s1: number) => {
    g.beginPath();
    for (let s = s0; s <= s1; s++) {
      const [x, z] = P(...side(trackAt(t, s), 0));
      s === s0 ? g.moveTo(x, z) : g.lineTo(x, z);
    }
    g.strokeStyle = "rgba(230,214,150,0.45)";
    g.lineWidth = 1;
    g.setLineDash([lw(3), lw(5)]);
    g.stroke();
    g.setLineDash([]);
  };
  centre(0, t.len);
  // kerbs on the inside of every corner: rust and cream blocks
  const kerbs = (s0: number, s1: number) => {
    for (let s = s0; s < s1; s += 1) {
      const p = trackAt(t, s);
      if (Math.abs(p.k) < 1 / 45 || p.y > 0) continue;
      const k = Math.sign(p.k);
      // (the corner's inside: towards its centre)
      const a = side(p, -k * H);
      const b = side(p, -k * (H - 1.1));
      const q = trackAt(t, s + 1);
      const c = side(q, -k * (H - 1.1));
      const d = side(q, -k * H);
      g.beginPath();
      g.moveTo(...P(...a));
      g.lineTo(...P(...b));
      g.lineTo(...P(...c));
      g.lineTo(...P(...d));
      g.closePath();
      g.fillStyle = Math.floor(s / 2) % 2 ? C.rust : C.cream;
      g.fill();
    }
  };
  kerbs(0, t.len);
  if (bridge.length) {
    g.save();
    g.translate(lw(1.6), lw(2.2));
    ribbon(g, t, P, b0 + 8, b1 - 8, H + 0.8);
    g.fillStyle = "rgba(10,14,20,0.35)";
    g.fill();
    g.restore();
    ribbon(g, t, P, b0 + 6, b1 - 6, H + 0.9);
    g.fillStyle = C.bridge;
    g.fill();
    ribbon(g, t, P, b0, b1, H);
    g.fillStyle = C.asphaltHi;
    g.fill();
    centre(b0, b1);
    for (const k of [1, -1]) {
      g.beginPath();
      for (let s = b0 + 6; s <= b1 - 6; s++) {
        const [x, z] = P(...side(trackAt(t, s), k * (H + 0.5)));
        s === b0 + 6 ? g.moveTo(x, z) : g.lineTo(x, z);
      }
      g.strokeStyle = C.cream;
      g.lineWidth = lw(0.5);
      g.stroke();
    }
  }
  // the start line: a chequered strip across, and the grid's slots behind it
  {
    const p = trackAt(t, 0);
    const n = 12;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < 2; j++) {
        const o0 = -H + (i * TRACK_W) / n;
        const o1 = o0 + TRACK_W / n;
        const q0 = trackAt(t, j * 0.9 - 0.9);
        const q1 = trackAt(t, j * 0.9);
        g.beginPath();
        g.moveTo(...P(...side(q0, o0)));
        g.lineTo(...P(...side(q0, o1)));
        g.lineTo(...P(...side(q1, o1)));
        g.lineTo(...P(...side(q1, o0)));
        g.closePath();
        g.fillStyle = (i + j) % 2 ? C.ink : C.cream;
        g.fill();
      }
    if (close)
      for (const [i, s] of t.grid.entries()) {
        const [x, z] = P(s.x, s.z);
        g.save();
        g.translate(x, z);
        g.rotate(Math.atan2(Math.sin(s.a), Math.cos(s.a)));
        g.strokeStyle = C.cream;
        g.lineWidth = 1.2;
        g.strokeRect(-lw(1), -lw(0.9), lw(2), lw(1.8));
        g.rotate(-Math.atan2(Math.sin(s.a), Math.cos(s.a)));
        g.fillStyle = C.cream;
        g.font = `700 ${Math.max(9, px * 1.6)}px ${FONT}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(i + 1), 0, 0);
        g.restore();
      }
    void p;
  }
  // the jumps: snow kickers across the track
  for (const jump of t.jumps) {
    const s = jump.s;
    ribbon(g, t, P, s - jump.len, s, H - 0.3);
    g.fillStyle = "#f7f9fb";
    g.fill();
    g.strokeStyle = C.dim;
    g.lineWidth = 1;
    g.stroke();
    // (its lip)
    g.beginPath();
    g.moveTo(...P(...side(trackAt(t, s), H - 0.3)));
    g.lineTo(...P(...side(trackAt(t, s), -H + 0.3)));
    g.strokeStyle = C.rust;
    g.lineWidth = lw(0.5);
    g.stroke();
  }
  // boost pads: amber chevrons
  for (const b of t.pads) {
    const o = b.side * (H / 2);
    for (let c = 0; c < 3; c++) {
      const p = trackAt(t, b.s + c * 1.6);
      const tip = side(trackAt(t, b.s + c * 1.6 + 1.4), o);
      g.beginPath();
      g.moveTo(...P(...side(p, o + 1.6)));
      g.lineTo(...P(...tip));
      g.lineTo(...P(...side(p, o - 1.6)));
      g.strokeStyle = C.amber;
      g.lineWidth = lw(0.55);
      g.stroke();
    }
  }
  // item boxes: four across
  for (const s of t.boxes) {
    const p = trackAt(t, s);
    for (let i = 0; i < 4; i++) {
      const [x, z] = P(...side(p, -H + 1.5 + i * ((TRACK_W - 3) / 3)));
      const r = lw(0.6);
      g.save();
      g.translate(x, z);
      g.rotate(p.a + Math.PI / 4);
      g.fillStyle = C.amber;
      g.strokeStyle = C.ink;
      g.lineWidth = 1;
      g.fillRect(-r, -r, r * 2, r * 2);
      g.strokeRect(-r, -r, r * 2, r * 2);
      g.restore();
    }
  }
  // which way the lap runs
  if (close)
    for (let s = 40; s < t.len; s += 70) {
      const p = trackAt(t, s);
      if (Math.abs(p.k) > 1 / 40) continue;
      const [x, z] = P(p.x, p.z);
      g.save();
      g.translate(x, z);
      g.rotate(p.a);
      g.beginPath();
      g.moveTo(lw(2.2), 0);
      g.lineTo(-lw(1.2), -lw(1.6));
      g.lineTo(-lw(0.4), 0);
      g.lineTo(-lw(1.2), lw(1.6));
      g.closePath();
      g.fillStyle = "rgba(243,234,214,0.8)";
      g.fill();
      g.restore();
    }

  // ── the bowl: a flat floor walled round by banked snow, a terrace round its rim ──
  {
    const [x, z] = P(KART_BOWL.x, KART_BOWL.z);
    const r = KART_BOWL.r * px;
    g.beginPath();
    g.arc(x, z, r + KART_BOWL.rim * px, 0, Math.PI * 2);
    g.fillStyle = "#c9c2b4"; // the terrace's boards
    g.fill();
    const grad = g.createRadialGradient(x, z, KART_BOWL.floor * px * 0.6, x, z, r);
    grad.addColorStop(0, "#5a6068");
    grad.addColorStop(0.72, "#4a4f56");
    grad.addColorStop(0.74, "#dfe6eb");
    grad.addColorStop(1, "#ffffff");
    g.beginPath();
    g.arc(x, z, r, 0, Math.PI * 2);
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = C.ink;
    g.lineWidth = 1.2;
    g.stroke();
    // the floor's markings: a ring and a cross, the boxes, the spawns round the edge
    g.strokeStyle = "rgba(230,214,150,0.6)";
    g.lineWidth = 1;
    g.beginPath();
    g.arc(x, z, KART_BOWL.floor * px * 0.5, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const rr = (i % 2 ? 0.55 : 0.25) * KART_BOWL.floor * px;
      g.save();
      g.translate(x + Math.cos(a) * rr, z + Math.sin(a) * rr);
      g.rotate(Math.PI / 4);
      g.fillStyle = C.amber;
      g.fillRect(-lw(0.6), -lw(0.6), lw(1.2), lw(1.2));
      g.strokeStyle = C.ink;
      g.strokeRect(-lw(0.6), -lw(0.6), lw(1.2), lw(1.2));
      g.restore();
    }
    if (close)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.fillStyle = C.rust;
        g.beginPath();
        g.arc(
          x + Math.cos(a) * KART_BOWL.floor * px * 0.88,
          z + Math.sin(a) * KART_BOWL.floor * px * 0.88,
          lw(0.8),
          0,
          Math.PI * 2,
        );
        g.fill();
      }
  }

  // ── the stands, the tower ──
  for (const s of KART_STANDS) {
    const [x0, z0] = P(s.x0, s.z);
    const [x1] = P(s.x1, s.z);
    const d = s.rows * 1.2 * px;
    g.fillStyle = C.wood;
    g.fillRect(x0, z0, x1 - x0, d);
    g.strokeStyle = "rgba(243,234,214,0.5)";
    g.lineWidth = 1;
    for (let r = 1; r < s.rows; r++) {
      g.beginPath();
      g.moveTo(x0, z0 + r * 1.2 * px);
      g.lineTo(x1, z0 + r * 1.2 * px);
      g.stroke();
    }
    // the roof's shadow line
    g.fillStyle = "rgba(20,24,30,0.25)";
    g.fillRect(x0, z0 + d, x1 - x0, lw(1.2));
  }
  {
    const [x, z] = P(KART_TOWER.x, KART_TOWER.z);
    g.fillStyle = C.ink;
    g.fillRect(x - lw(2.5), z - lw(1.5), lw(5), lw(3));
    g.fillStyle = C.amber;
    g.fillRect(x - lw(2), z - lw(1.5), lw(4), lw(0.6));
  }
  // ── the paddock and its rack, the gate, the car park, the fence ──
  {
    const [x0, z0] = P(KART_PADDOCK.x0, KART_PADDOCK.z0);
    const [x1, z1] = P(KART_PADDOCK.x1, KART_PADDOCK.z1);
    g.fillStyle = "#c9cdd0";
    g.fillRect(x0, z0, x1 - x0, z1 - z0);
    const cols = ["#b5562f", "#2f4a3b", "#e8a33d", "#3d4a5c", "#6b2430", "#cdbf9f", "#4a5a73", "#8b8f93"];
    for (let i = 0; i < KART_RACK.n; i++) {
      const [x, z] = P(KART_RACK.x, KART_RACK.z0 + i * KART_RACK.dz);
      g.fillStyle = cols[i];
      g.strokeStyle = C.ink;
      g.lineWidth = 1;
      g.fillRect(x - lw(0.95), z - lw(0.65), lw(1.9), lw(1.3));
      g.strokeRect(x - lw(0.95), z - lw(0.65), lw(1.9), lw(1.3));
    }
    // the lobby's desk by the rack
    const [dx, dz] = P(KART_DESK.x, KART_DESK.z);
    g.fillStyle = C.wood;
    g.fillRect(dx - lw(2), dz - lw(0.7), lw(4), lw(1.4));
    // the shed's outline, what stands about (race control, the podium, the fire, the cocoa cart…)
    if (close) {
      const [sx0, sz0] = P(KART_SHED.x0, KART_SHED.z0);
      const [sx1, sz1] = P(KART_SHED.x1, KART_SHED.z1);
      g.strokeStyle = C.wood;
      g.lineWidth = 1.5;
      g.strokeRect(sx0, sz0, sx1 - sx0, sz1 - sz0);
      for (const t of KART_THINGS) {
        const [ax, az] = P(t.x - t.hx, t.z - t.hz);
        const [bx, bz] = P(t.x + t.hx, t.z + t.hz);
        g.fillStyle =
          t.kind === "hut" ? "#2f4a3b" : t.kind === "fire" ? C.amber : t.kind === "podium" ? "#e9e3d6" : C.wood;
        g.fillRect(ax, az, bx - ax, bz - az);
      }
    }
  }
  {
    // the car park: its bays either side of one aisle, the footway, the turning circle and its island
    const K = KART_CARPARK;
    const T = KART_TURN;
    g.fillStyle = "#bdbbb4";
    const [wx0, wz0] = P(K.x0, K.walk[0]);
    const [wx1, wz1] = P(T.x, K.walk[1]);
    g.fillRect(wx0, wz0, wx1 - wx0, wz1 - wz0);
    const [x0, z0] = P(K.x0, K.z0);
    const [x1, z1] = P(K.x1, K.z1);
    g.fillStyle = C.asphalt;
    g.fillRect(x0, z0, x1 - x0, z1 - z0);
    const [cx, cz] = P(T.x, T.z);
    g.beginPath();
    g.arc(cx, cz, lw(T.r), 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#f7fafc";
    g.beginPath();
    g.arc(cx, cz, lw(T.island), 0, Math.PI * 2);
    g.fill();
    if (close) {
      g.strokeStyle = "rgba(243,234,214,0.7)";
      g.lineWidth = 1;
      for (let i = 0; i <= K.bays; i++)
        for (const [a, b] of [
          [K.z0, K.aisle[0]],
          [K.aisle[1], K.z1],
        ]) {
          g.beginPath();
          g.moveTo(...P(K.bx + i * 2.7, a));
          g.lineTo(...P(K.bx + i * 2.7, b));
          g.stroke();
        }
    }
  }
  // the fence: posts and wire, a gap at the gate
  g.strokeStyle = C.fence;
  g.lineWidth = close ? 2 : 1.5;
  const F = KART_FENCE;
  const ring: [number, number][] = [
    [F.x0, F.z0],
    [F.x1, F.z0],
    [F.x1, F.z1],
    [F.x0, F.z1],
  ];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s < len; s += 6) {
      const x = ax + ((bx - ax) * s) / len;
      const z = az + ((bz - az) * s) / len;
      if (Math.abs(z - KART_GATE.z) < 1 && Math.abs(x - KART_GATE.x) < KART_GATE.w / 2) continue;
      const x2 = ax + ((bx - ax) * Math.min(len, s + 4)) / len;
      const z2 = az + ((bz - az) * Math.min(len, s + 4)) / len;
      g.beginPath();
      g.moveTo(...P(x, z));
      g.lineTo(...P(x2, z2));
      g.stroke();
    }
  }
  // the gate's arch: two posts
  for (const k of [-1, 1]) {
    const [x, z] = P(KART_GATE.x + (k * KART_GATE.w) / 2, KART_GATE.z);
    g.fillStyle = C.ink;
    g.fillRect(x - lw(0.6), z - lw(0.6), lw(1.2), lw(1.2));
  }
  // floodlight masts
  for (const f of kartFloods()) {
    const [x, z] = P(f.x, f.z);
    g.fillStyle = "#e8b13a";
    g.strokeStyle = C.ink;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(x, z, Math.max(2.5, lw(0.9)), 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
}

const label = (
  g: CanvasRenderingContext2D,
  t: string,
  x: number,
  z: number,
  size = 13,
  col = C.ink,
  rot = 0,
  italic = false,
  font = SERIF,
) => {
  g.save();
  g.translate(x, z);
  g.rotate(rot);
  g.font = `${italic ? "italic " : ""}600 ${size}px ${font}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const sp = t.split("").join(String.fromCharCode(8202));
  g.lineWidth = 3.5;
  g.strokeStyle = "rgba(236,240,244,0.85)";
  g.strokeText(sp, 0, 0);
  g.fillStyle = col;
  g.fillText(sp, 0, 0);
  g.restore();
};

/** Over the Grounds' site plan (drawSitePlan, its default 2 px a tile and 90 px margin): the park in
 *  its clearing, the road in, the ground opened north for it (ringed). */
export function drawParkOnSitePlan(c: HTMLCanvasElement, px = 2, margin = 90) {
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const P: XZ = (x, z) => [margin + (x - GROUNDS.x0) * px, margin + (z - GROUNDS.z0) * px];
  drawPark(g, P, px, false);
  const at = (x: number, z: number) => P(x, z);
  label(g, KART_NAME, ...at(KART_PARK.x + 14, KART_FENCE.z0 - 14), 15);
  label(g, "KART PARK ROAD", ...at(KART_GATE.x - 12, KART_GATE.z + 26), 9, C.ink, -Math.PI / 2);
  // (the ground opened north of where the land ended: what phase 2 adds to the Grounds)
  const [x0, z0] = P(KART_GROUND.x0, KART_GROUND.z0);
  const [x1, z1] = P(KART_GROUND.x1, -580);
  g.strokeStyle = C.amber;
  g.lineWidth = 3;
  g.setLineDash([12, 8]);
  g.strokeRect(x0, z0, x1 - x0, z1 - z0);
  g.setLineDash([]);
  label(g, "NEW LAND", x0 + 60, z0 + 16, 12, "#a5641c", 0, false, FONT);
  label(g, "RIDGES", ...at(KART_PARK.x + 14, KART_GROUND.z0 - 22), 16, C.dim, 0, true);
}

/** The park close up: the circuit and all round it, named, with the numbers (a layout of the track
 *  changer's, either way round: today's by default). */
export function drawParkPlan(c: HTMLCanvasElement, layout: KartLayoutKey = "eight", reverse = false) {
  const t = kartTrack(layout, reverse);
  const lay = kartLayout(layout);
  const V = { x0: KART_FENCE.x0 - 22, z0: KART_FENCE.z0 - 18, x1: KART_FENCE.x1 + 22, z1: KART_FENCE.z1 + 52 };
  const PX = 5;
  const HEAD = 84;
  const FOOT = 190;
  const M = 30;
  c.width = (V.x1 - V.x0) * PX + M * 2;
  c.height = (V.z1 - V.z0) * PX + HEAD + FOOT;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = C.paper;
  g.fillRect(0, 0, c.width, c.height);
  const P: XZ = (x, z) => [M + (x - V.x0) * PX, HEAD + (z - V.z0) * PX];
  // the clearing: snow
  const [vx0, vz0] = P(V.x0, V.z0);
  const [vx1, vz1] = P(V.x1, V.z1);
  g.fillStyle = C.snow;
  g.fillRect(vx0, vz0, vx1 - vx0, vz1 - vz0);
  // the county road along the bottom, the road in up to the gate
  const roadLine = (pts: [number, number][], w: number) => {
    g.beginPath();
    for (const [i, [x, z]] of pts.entries()) i ? g.lineTo(...P(x, z)) : g.moveTo(...P(x, z));
    g.strokeStyle = C.asphalt;
    g.lineWidth = w * PX;
    g.lineCap = "butt";
    g.lineJoin = "round";
    g.stroke();
    g.strokeStyle = "rgba(230,214,150,0.55)";
    g.lineWidth = 1.2;
    g.setLineDash([16, 20]);
    g.stroke();
    g.setLineDash([]);
  };
  g.save();
  g.beginPath();
  g.rect(vx0, vz0, vx1 - vx0, vz1 - vz0);
  g.clip();
  const county = WAYS.find((w) => w.key === "road");
  if (county)
    roadLine(
      county.line.filter(([x]) => x > V.x0 - 20 && x < V.x1 + 20),
      county.w,
    );
  const road = WAYS.find((w) => w.key === "kart-road");
  roadLine(road ? road.line : KART_ROAD, 9);
  g.restore();
  // (the way from the gate up into the paddock)
  g.beginPath();
  g.moveTo(...P(KART_GATE.x, KART_GATE.z));
  g.lineTo(...P(KART_GATE.x, KART_PADDOCK.z1 - 2));
  g.strokeStyle = "#c9cdd0";
  g.lineWidth = 6 * PX;
  g.stroke();
  drawPark(g, P, PX, true, t);

  // names
  const L = (s: string, x: number, z: number, size = 13, col = C.ink, rot = 0, italic = false) =>
    label(g, s, ...P(x, z), size, col, rot, italic, FONT);
  const startP = trackAt(t, 0);
  L("START / FINISH", startP.x, startP.z - 11, 13, C.ink);
  if (lay.bridge === "both") L(`THE BRIDGE · ${BRIDGE_H} m`, t.cross.x + 22, t.cross.z - 8, 12);
  for (const jump of t.jumps) {
    const j = trackAt(t, jump.s);
    L("THE JUMP", j.x, j.z - 12, 12);
  }
  const hp = t.pts.filter((p) => p.y === 0 && p.s > 60).reduce((a, b) => (Math.abs(b.k) > Math.abs(a.k) ? b : a));
  // (a hairpin only where there's one: under 25 m round)
  if (Math.abs(hp.k) > 1 / 25)
    L("THE HAIRPIN", hp.x + Math.sin(hp.a) * Math.sign(hp.k) * 22, hp.z - Math.cos(hp.a) * Math.sign(hp.k) * 22, 12);
  L("THE BOWL · BATTLE", KART_BOWL.x, KART_BOWL.z + KART_BOWL.r + 8, 13, C.rust);
  L("STANDS", (KART_STANDS[0].x0 + KART_STANDS[1].x1) / 2, KART_STANDS[0].z + 12, 12);
  L("TOWER", KART_TOWER.x, KART_TOWER.z + 5, 10);
  L("PADDOCK", (KART_PADDOCK.x0 + KART_PADDOCK.x1) / 2, KART_PADDOCK.z1 - 3, 11);
  L("KART RACK · LOBBY", KART_DESK.x, KART_RACK.z0 - 11, 10);
  L("GATE", KART_GATE.x + 14, KART_GATE.z + 4, 11);
  L("CAR PARK", (KART_CARPARK.x0 + KART_CARPARK.x1) / 2, KART_CARPARK.z1 + 5, 11);
  L("TURNING CIRCLE", KART_TURN.x + 22, KART_TURN.z + 2, 10);
  const pod = KART_THINGS.find((t) => t.kind === "podium");
  if (pod) L("PODIUM", pod.x, pod.z - 4, 9);
  L("RACE CONTROL", KART_DESK.x + 9, KART_DESK.z + 3, 9);
  {
    // (the road in runs on south off the plan, to the county road)
    const rl = road ? road.line : KART_ROAD;
    let len = 0;
    for (let i = 1; i < rl.length; i++) len += Math.hypot(rl[i][0] - rl[i - 1][0], rl[i][1] - rl[i - 1][1]);
    const out = rl.find(([, z]) => z < V.z1) ?? rl[0];
    L(`↓ ${Math.round(len)} m TO THE COUNTY ROAD AND ITS BILLBOARD`, out[0] - 60, V.z1 - 6, 11, C.dim);
  }
  L("THE WOODS", KART_FENCE.x0 + 30, KART_FENCE.z0 - 9, 15, C.dim, 0, true);
  L("THE WOODS", KART_FENCE.x1 - 40, KART_FENCE.z0 - 9, 15, C.dim, 0, true);
  // the title
  g.fillStyle = C.ink;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.font = `700 30px ${SERIF}`;
  g.fillText(`Yutopia Kart Park — ${lay.name}${reverse ? ", reversed" : ""}`, M, 44);
  g.font = `500 15px ${FONT}`;
  g.fillStyle = C.dim;
  g.fillText(
    "In the woods north of the county road, between the gatehouse and the river. North up, 5 px a metre, laps run the way of the arrows.",
    M,
    68,
  );
  // the numbers, the key
  const y0 = c.height - FOOT + 34;
  const facts = [
    `Lap ${t.len} m · track ${TRACK_W} m wide · ~${Math.round(t.len / 21)} s a clean lap`,
    lay.blurb,
    `8 karts on the grid, two by two · ${t.boxes.length} rows of item boxes · ${t.pads.length} boost pads · ${t.jumps.length} jump${t.jumps.length > 1 ? "s" : ""}`,
    `The bowl: ${KART_BOWL.r * 2} m across, walled ${KART_BOWL.wall} m high in banked snow, a terrace round its rim`,
    `${kartFloods().length} floodlight masts · the stands for ~240 · the tower shows the order`,
  ];
  g.font = `500 15px ${FONT}`;
  g.fillStyle = C.ink;
  for (const [i, f] of facts.entries()) g.fillText(f, M, y0 + i * 24);
  const key: [string, string][] = [
    [C.amber, "item boxes, boost pads"],
    [C.rust, "kerbs, battle spawns"],
    [C.bank, "snow banks (soft walls)"],
    ["#e8b13a", "floodlights"],
    [C.fence, "the park's fence"],
  ];
  let ky = y0;
  for (const [col, s] of key) {
    g.fillStyle = col;
    g.strokeStyle = C.ink;
    g.lineWidth = 1;
    g.fillRect(c.width - 330, ky - 11, 24, 12);
    g.strokeRect(c.width - 330, ky - 11, 24, 12);
    g.fillStyle = C.ink;
    g.fillText(s, c.width - 296, ky);
    ky += 24;
  }
}
