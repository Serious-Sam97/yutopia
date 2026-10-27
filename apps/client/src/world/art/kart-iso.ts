import type * as GroundsModule from "@yutopia/shared/grounds";

// The Kart Park in the iso view's land pictures (docs/plan/46-the-karts.md): what lies flat — the
// circuit (its asphalt, kerbs, centre line, the chequered line and the grid, the boost pads, the
// kicker), the bridge's shadow (the bridge itself drawn up at its height: grounds-iso.ts), the bowl (its floor, its banked walls, its terrace),
// the paddock's concrete, the car park's bays, the turning circle and its island. What stands up (the stands, the tower, the gate,
// the floodlights, the rack's karts, the fence) are things of their own (grounds-items.ts).

type G = typeof GroundsModule;
type Ctx = CanvasRenderingContext2D;

/** Over a chunk's picture (`px` a tile, its corner at x0, z0): the park's part of it, if any. */
export function drawKartPark(g: Ctx, G: G, x0: number, z0: number, px: number, size: number) {
  const F = G.KART_FENCE;
  const pad = 40;
  if (x0 + size < F.x0 - pad || x0 > F.x1 + pad || z0 + size < F.z0 - pad || z0 > F.z1 + pad) return;
  // the circuit raced (docs/plan/47-the-track-changer.md); the bridge, the Figure Eight's, there
  // only for a layout over it (its deck and ramps drawn from it)
  const t = G.kartTrackNow();
  const deck = G.kartTrack();
  const H = G.TRACK_W / 2;
  const X = (x: number) => (x - x0) * px;
  const Z = (z: number) => (z - z0) * px;
  const side = (p: { x: number; z: number; a: number }, off: number): [number, number] => [
    X(p.x + Math.sin(p.a) * off),
    Z(p.z - Math.cos(p.a) * off),
  ];
  const ribbon = (s0: number, s1: number, a: number, b: number, tr = t) => {
    g.beginPath();
    for (let s = s0; s <= s1; s++) {
      const [x, z] = side(G.trackAt(tr, s), a);
      s === s0 ? g.moveTo(x, z) : g.lineTo(x, z);
    }
    for (let s = s1; s >= s0; s--) g.lineTo(...side(G.trackAt(tr, s), b));
    g.closePath();
  };
  const seg = (ax: number, az: number, bx: number, bz: number) => {
    g.beginPath();
    g.moveTo(X(ax), Z(az));
    g.lineTo(X(bx), Z(bz));
    g.stroke();
  };
  g.save();
  g.globalCompositeOperation = "source-over";
  // the paddock's concrete (its joints, the bays' lines, the walk from the gate in amber), the car
  // park's asphalt and the turning circle's, the footway's paving, the bays (two blue), the arrows
  const P = G.KART_PADDOCK;
  g.fillStyle = "#c4c6c3";
  g.fillRect(X(P.x0), Z(P.z0), (P.x1 - P.x0) * px, (P.z1 - P.z0) * px);
  g.strokeStyle = "rgba(110,112,110,0.4)";
  g.lineWidth = Math.max(1, px * 0.06);
  for (let x = P.x0 + 4; x < P.x1; x += 4) seg(x, P.z0, x, P.z1);
  for (let z = P.z0 + 4; z < P.z1; z += 4) seg(P.x0, z, P.x1, z);
  const R = G.KART_RACK;
  g.strokeStyle = "rgba(243,234,214,0.9)";
  g.lineWidth = px * 0.1;
  for (let i = 0; i <= R.n; i++) seg(R.x - 1.6, R.z0 - R.dz / 2 + i * R.dz, R.x + 1.6, R.z0 - R.dz / 2 + i * R.dz);
  g.strokeStyle = "rgba(232,163,61,0.85)";
  g.lineWidth = px * 0.18;
  for (const x of [G.KART_GATE.x - 1.6, G.KART_GATE.x + 1.6]) seg(x, G.KART_DESK.z + 3, x, P.z1);
  const C = G.KART_CARPARK;
  const T = G.KART_TURN;
  const gw = G.KART_GATE.w / 2 + 1;
  g.fillStyle = "#bdbbb4";
  g.fillRect(X(C.x0), Z(C.walk[0]), (T.x - C.x0) * px, (C.walk[1] - C.walk[0]) * px);
  g.fillRect(X(G.KART_GATE.x - gw), Z(G.KART_FENCE.z1), 2 * gw * px, (C.walk[1] - G.KART_FENCE.z1) * px);
  g.fillStyle = "#565a61";
  g.fillRect(X(C.x0), Z(C.z0), (C.x1 - C.x0) * px, (C.z1 - C.z0) * px);
  g.beginPath();
  g.arc(X(T.x), Z(T.z), T.r * px, 0, Math.PI * 2);
  g.fill();
  // its mouth to the south, where the road in comes: flared out to the road's edges, its asphalt
  // fading down the road (as the 3D's: tp/kart/park3d.ts carMouth)
  {
    const RW = 4.5;
    const f = 3;
    const half = RW + f;
    const zf = T.z + Math.sqrt((T.r + f) ** 2 - half * half);
    const zA = T.z + Math.sqrt(T.r * T.r - RW * RW);
    for (const k of [1, -1]) {
      const cx = T.x + k * half;
      // (along the road's edge to the circle, round it to where the flare's curve meets it, and
      // back down that curve)
      g.beginPath();
      g.moveTo(X(T.x + k * RW), Z(zf));
      g.lineTo(X(T.x + k * RW), Z(zA));
      g.arc(X(T.x), Z(T.z), T.r * px, Math.atan2(zA - T.z, k * RW), Math.atan2(zf - T.z, k * half), k > 0);
      g.arc(X(cx), Z(zf), f * px, Math.atan2(T.z - zf, T.x - cx), k > 0 ? Math.PI : 0, k > 0);
      g.closePath();
      g.fill();
    }
    const z0m = T.z + T.r - 0.5;
    const z1m = T.z + T.r + 11;
    const gr = g.createLinearGradient(0, Z(z0m), 0, Z(z1m));
    gr.addColorStop(0, "rgba(86,90,97,1)");
    gr.addColorStop(0.55, "rgba(86,90,97,0.45)");
    gr.addColorStop(1, "rgba(86,90,97,0)");
    g.fillStyle = gr;
    g.fillRect(X(T.x - RW), Z(z0m), 2 * RW * px, (z1m - z0m) * px);
  }
  g.fillStyle = "rgba(52,96,160,0.8)";
  for (let i = C.bays - 2; i < C.bays; i++)
    g.fillRect(X(C.bx + i * 2.7), Z(C.z0 + 0.3), 2.7 * px, (C.aisle[0] - C.z0 - 0.3) * px);
  g.strokeStyle = "rgba(243,234,214,0.8)";
  g.lineWidth = px * 0.12;
  for (let i = 0; i <= C.bays; i++) {
    const x = C.bx + i * 2.7;
    seg(x, C.z0 + 0.3, x, C.aisle[0]);
    seg(x, C.aisle[1], x, C.z1 - 0.3);
  }
  const am = (C.aisle[0] + C.aisle[1]) / 2;
  g.lineWidth = px * 0.25;
  for (let x = C.bx + 6; x < C.bx + C.bays * 2.7 - 4; x += 12) {
    seg(x - 1.4, am - 1.6, x + 1.4, am - 1.6);
    seg(x - 1.4, am + 1.6, x + 1.4, am + 1.6);
  }
  // the circle's island: a kerb round a bed of snow
  g.beginPath();
  g.arc(X(T.x), Z(T.z), T.island * px, 0, Math.PI * 2);
  g.fillStyle = "#f4f7fa";
  g.fill();
  g.strokeStyle = "#c9c5bc";
  g.lineWidth = px * 0.25;
  g.stroke();
  // the snow banks either side (white, soft-edged), then the road
  ribbon(0, t.len, H + 2.6, -H - 2.6);
  g.fillStyle = "#f7fafc";
  g.fill();
  // (the bridge's raised stretch is drawn up at its height: grounds-iso.ts parkBridge)
  const flat: [number, number][] = [];
  for (let s = 0; s < t.len; s++) {
    if (t.pts[s].y > 0.05) continue;
    const last = flat[flat.length - 1];
    if (last && last[1] === s - 1) last[1] = s;
    else flat.push([s, s]);
  }
  g.fillStyle = "#4b5057";
  for (const [s0, s1] of flat) {
    // (a metre on either end, under the bridge's own: no snow between them at a ramp's foot)
    ribbon(s0 - 1, s1 + 1, H, -H);
    g.fill();
  }
  // kerbs on the inside of the corners
  for (let s = 0; s < t.len; s++) {
    const p = G.trackAt(t, s);
    if (Math.abs(p.k) < 1 / 45 || p.y > 0) continue;
    const k = -Math.sign(p.k);
    ribbon(s, s + 1, k * H, k * (H - 1.1));
    g.fillStyle = Math.floor(s / 1.5) % 2 ? "#b5562f" : "#efe4cc";
    g.fill();
  }
  // the centre line
  g.strokeStyle = "rgba(230,214,150,0.6)";
  g.lineWidth = px * 0.16;
  g.setLineDash([px * 3, px * 5]);
  for (const [s0, s1] of flat) {
    g.beginPath();
    for (let s = s0; s <= s1 + 1; s++) {
      const [x, z] = side(G.trackAt(t, s), 0);
      s === s0 ? g.moveTo(x, z) : g.lineTo(x, z);
    }
    g.stroke();
  }
  g.setLineDash([]);
  // the bridge: its shadow on the snow (it's drawn up at its height: grounds-iso.ts parkBridge)
  if (G.kartBridged()) {
    const up = deck.pts.filter((p) => p.y > 0.3).map((p) => p.s);
    const b0 = Math.min(...up);
    const b1 = Math.max(...up);
    g.save();
    g.translate(px * 1.4, px * 2.4);
    ribbon(b0 + 10, b1 - 10, H + 0.4, -H - 0.4, deck);
    g.fillStyle = "rgba(20,26,34,0.35)";
    g.fill();
    g.restore();
  }
  // the start line, chequered, and the grid's boxes
  {
    const n = 12;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < 2; j++) {
        const o0 = -H + (i * G.TRACK_W) / n;
        const q0 = G.trackAt(t, j * 0.9 - 0.9);
        const q1 = G.trackAt(t, j * 0.9);
        g.beginPath();
        g.moveTo(...side(q0, o0));
        g.lineTo(...side(q0, o0 + G.TRACK_W / n));
        g.lineTo(...side(q1, o0 + G.TRACK_W / n));
        g.lineTo(...side(q1, o0));
        g.closePath();
        g.fillStyle = (i + j) % 2 ? "#151515" : "#f3ead6";
        g.fill();
      }
    g.strokeStyle = "#f3ead6";
    g.lineWidth = px * 0.12;
    for (const gs of t.grid) {
      g.beginPath();
      const c = Math.cos(gs.a);
      const sn = Math.sin(gs.a);
      g.moveTo(X(gs.x + c * 1.3 - sn * 1.2), Z(gs.z + sn * 1.3 + c * 1.2));
      g.lineTo(X(gs.x + c * 1.3 + sn * 1.2), Z(gs.z + sn * 1.3 - c * 1.2));
      g.stroke();
    }
  }
  // the boost pads: amber chevrons
  g.strokeStyle = "#e8a33d";
  g.lineWidth = px * 0.5;
  g.lineJoin = "round";
  for (const b of t.pads)
    for (let c = 0; c < 3; c++) {
      const p = G.trackAt(t, b.s + c * 1.6);
      const o = b.side * (H / 2);
      g.beginPath();
      g.moveTo(...side(p, o + 1.6));
      g.lineTo(...side(G.trackAt(t, b.s + c * 1.6 + 1.4), o));
      g.lineTo(...side(p, o - 1.6));
      g.stroke();
    }
  // the kickers: snow across the road, their lips painted
  for (const j of t.jumps) {
    ribbon(j.s - j.len, j.s, H - 0.2, -H + 0.2);
    g.fillStyle = "#f7fafc";
    g.fill();
    g.strokeStyle = "#b5562f";
    g.lineWidth = px * 0.3;
    g.beginPath();
    g.moveTo(...side(G.trackAt(t, j.s), H - 0.2));
    g.lineTo(...side(G.trackAt(t, j.s), -H + 0.2));
    g.stroke();
  }
  // the bowl: its terrace, its banked walls shaded towards the floor, the floor and its marks
  {
    const B = G.KART_BOWL;
    const cx = X(B.x);
    const cz = Z(B.z);
    g.beginPath();
    g.arc(cx, cz, (B.r + B.rim + 3.5) * px, 0, Math.PI * 2);
    g.fillStyle = "#eef2f5";
    g.fill();
    g.beginPath();
    g.arc(cx, cz, (B.r + B.rim) * px, 0, Math.PI * 2);
    g.fillStyle = "#9a7a5a";
    g.fill();
    const grd = g.createRadialGradient(cx - 6 * px, cz - 8 * px, B.floor * px * 0.9, cx, cz, B.r * px);
    grd.addColorStop(0, "#ffffff");
    grd.addColorStop(1, "#d3dce3");
    g.beginPath();
    g.arc(cx, cz, B.r * px, 0, Math.PI * 2);
    g.fillStyle = grd;
    g.fill();
    g.beginPath();
    g.arc(cx, cz, B.floor * px, 0, Math.PI * 2);
    g.fillStyle = "#4b5057";
    g.fill();
    g.strokeStyle = "rgba(230,214,150,0.65)";
    g.lineWidth = px * 0.3;
    g.beginPath();
    g.arc(cx, cz, B.floor * 0.5 * px, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = "#b5562f";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.arc(cx + Math.cos(a) * B.floor * 0.88 * px, cz + Math.sin(a) * B.floor * 0.88 * px, 0.8 * px, 0, Math.PI * 2);
      g.stroke();
    }
  }
  g.restore();
}

/** A kart's sprite props by its colour's slot (shared kart/net.ts KART_COLOURS, kept here: the
 *  iso chunk doesn't take the karts' module for eight colours). */
const COLS: [string, string][] = [
  ["#b5562f", "#f3ead6"],
  ["#2f4a3b", "#e8a33d"],
  ["#e8a33d", "#2a2018"],
  ["#3d4a5c", "#f3ead6"],
  ["#6b2430", "#e8a33d"],
  ["#cdbf9f", "#b5562f"],
  ["#4a5a73", "#f3ead6"],
  ["#20262c", "#e8a33d"],
];
export const kartLook = (i: number) => ({ c: COLS[i % 8][0], t: COLS[i % 8][1] });
