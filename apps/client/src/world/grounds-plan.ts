import {
  BENCH,
  BUILDINGS,
  FENCE,
  GATE,
  GROUNDS,
  LAMPS,
  LOT_ROWS,
  type P,
  PLAZA,
  POND,
  RAVINE,
  RIVER,
  ROAD_CLOSED,
  STATUE,
  TOWER,
  WAYS,
} from "@yutopia/shared/grounds";

// The Grounds' site plan (docs/plan/27-the-grounds.md, phase 0): a survey
// drawn from the shared Grounds themselves — the land shaded, the woods
// stippled, the ways, the water, the buildings (the ones you can walk into
// ringed), the fence, the names. The same drawing becomes the phone's Maps.
import { LAND_PAL, type PlanData, planData, TREE_KINDS } from "./grounds-plan-data";

const PAL = {
  paper: "#e8ebee",
  ...LAND_PAL,
  ink: "#1f252b",
  dim: "#5d6873",
  fence: "#8b3a2f",
  amber: "#d8892a",
  pine: "rgba(38,56,48,0.62)",
  birch: "rgba(120,130,136,0.55)",
  bare: "rgba(80,86,94,0.5)",
};

export interface PlanOpts {
  px: number; // pixels a tile
  margin: number;
}

/** `data`: the land and trees already worked out (in a worker: the GPS), or here. */
export function drawSitePlan(c: HTMLCanvasElement, o: PlanOpts = { px: 2, margin: 90 }, data: PlanData = planData()) {
  const { px, margin } = o;
  const GW = GROUNDS.x1 - GROUNDS.x0;
  const GH = GROUNDS.z1 - GROUNDS.z0;
  const side = 420; // the legend's column
  c.width = GW * px + margin * 2 + side;
  c.height = GH * px + margin * 2;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "#d9dde1";
  g.fillRect(0, 0, c.width, c.height);
  const X = (x: number) => margin + (x - GROUNDS.x0) * px;
  const Z = (z: number) => margin + (z - GROUNDS.z0) * px;

  // ── the land: surface colours, shaded from the north-west (grounds-plan-data.ts) ──
  const img = new ImageData(data.land as ImageDataArray, GW, GH);
  const land = document.createElement("canvas");
  land.width = GW;
  land.height = GH;
  (land.getContext("2d") as CanvasRenderingContext2D).putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(land, margin, margin, GW * px, GH * px);

  // ── the woods: a dot a tree ──
  const tr = data.trees;
  for (let n = 0; n < tr.length; n += 4) {
    const kind = TREE_KINDS[tr[n + 3]];
    g.fillStyle = PAL[kind];
    g.beginPath();
    g.arc(X(tr[n]), Z(tr[n + 1]), (kind === "pine" ? 0.85 : 0.65) * px * tr[n + 2], 0, Math.PI * 2);
    g.fill();
  }

  // ── the ways ──
  const line = (pts: P[], closed = false) => {
    g.beginPath();
    for (const [i, [x, z]] of pts.entries()) i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z));
    if (closed) g.closePath();
  };
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const w of WAYS) {
    if (w.kind === "trail") {
      line(w.line, w.closed);
      g.strokeStyle = "rgba(120,96,70,0.9)";
      g.lineWidth = 1.6;
      g.setLineDash([5, 4]);
      g.stroke();
      g.setLineDash([]);
      continue;
    }
    if (w.kind === "street") {
      line(w.line);
      g.strokeStyle = "rgb(196,196,192)";
      g.lineWidth = (w.w + 5.2) * px;
      g.stroke();
    }
    line(w.line);
    g.strokeStyle = w.kind === "walk" ? "rgb(196,196,192)" : "#4a4f56";
    g.lineWidth = w.w * px;
    g.stroke();
    if (w.kind !== "walk") {
      g.strokeStyle = "rgba(230,214,150,0.55)";
      g.lineWidth = 1;
      g.setLineDash([6, 8]);
      line(w.line);
      g.stroke();
      g.setLineDash([]);
    }
    // bridges: the deck's rails
    let run: P[] = [];
    const flush = () => {
      if (run.length > 2) {
        line(run);
        g.strokeStyle = "#1f252b";
        g.lineWidth = (w.w + 1.6) * px;
        g.stroke();
        line(run);
        g.strokeStyle = w.kind === "trail" ? "#9a7a55" : "#5a6068";
        g.lineWidth = w.w * px;
        g.stroke();
      }
      run = [];
    };
    for (const [i, p] of w.line.entries()) w.bridged[i] ? run.push(p) : flush();
    flush();
  }
  // the footbridge over the ravine (a trail's bridged stretch)
  for (const w of WAYS.filter((w) => w.kind === "trail")) {
    const run = w.line.filter((_, i) => w.bridged[i]);
    if (run.length < 2) continue;
    line(run);
    g.strokeStyle = "#1f252b";
    g.lineWidth = 3.4 * px;
    g.stroke();
    line(run);
    g.strokeStyle = "#a07c52";
    g.lineWidth = 2.2 * px;
    g.stroke();
  }
  // the lot's rows of bays (the Grounds' copy of lot.ts: the lot module itself here split the
  // Grounds' chunks — docs/plan/42-the-lot.md)
  g.strokeStyle = "rgba(235,235,230,0.7)";
  g.lineWidth = 1;
  for (const [x0, x1] of LOT_ROWS.xs) {
    g.strokeRect(X(x0), Z(LOT_ROWS.z0), (x1 - x0) * px, (LOT_ROWS.z1 - LOT_ROWS.z0) * px);
    g.beginPath();
    for (let z = LOT_ROWS.z0 + LOT_ROWS.bay; z < LOT_ROWS.z1; z += LOT_ROWS.bay) {
      g.moveTo(X(x0), Z(z));
      g.lineTo(X(x1), Z(z));
    }
    g.stroke();
  }

  // ── the water's edges ──
  g.strokeStyle = "rgba(70,98,120,0.6)";
  g.lineWidth = 1.2;
  g.beginPath();
  g.ellipse(X(POND.cx), Z(POND.cz), POND.rx * px, POND.rz * px, 0, 0, Math.PI * 2);
  g.stroke();
  // the dock
  g.fillStyle = "#7a5a3c";
  g.fillRect(X(-253.5), Z(-98), 3 * px, 14 * px);
  // the ravine's rims
  for (const s of [1, -1]) {
    const rim = RAVINE.line.map(([x, z], i, a) => {
      const [x2, z2] = a[Math.min(a.length - 1, i + 1)];
      const [x1, z1] = a[Math.max(0, i - 1)];
      const l = Math.hypot(x2 - x1, z2 - z1) || 1;
      return [x - ((z2 - z1) / l) * s * (RAVINE.w / 2), z + ((x2 - x1) / l) * s * (RAVINE.w / 2)] as P;
    });
    line(rim);
    g.strokeStyle = "rgba(40,44,50,0.55)";
    g.lineWidth = 1;
    g.stroke();
    g.lineWidth = 0.8;
    g.strokeStyle = "rgba(40,44,50,0.35)";
    // hachures down into it
    for (let i = 0; i < rim.length; i += 3) {
      const [x, z] = rim[i];
      const [cx, cz] = RAVINE.line[i];
      g.beginPath();
      g.moveTo(X(x), Z(z));
      g.lineTo(X(x + (cx - x) * 0.4), Z(z + (cz - z) * 0.4));
      g.stroke();
    }
  }

  // the creek frozen in the ravine's floor
  line(RAVINE.line);
  g.strokeStyle = "rgba(150,178,198,0.95)";
  g.lineWidth = 2.2 * px;
  g.stroke();

  // ── the buildings ──
  for (const bd of BUILDINGS) {
    const x = X(bd.x0);
    const z = Z(bd.z0);
    const w = (bd.x1 - bd.x0) * px;
    const h = (bd.z1 - bd.z0) * px;
    g.fillStyle = bd.vacant ? "#4b4f55" : bd.kind === "hq" || bd.kind === "block" ? "#2a3038" : "#3a3631";
    g.fillRect(x, z, w, h);
    if (bd.enter) {
      g.strokeStyle = PAL.amber;
      g.lineWidth = 3;
      g.strokeRect(x - 2, z - 2, w + 4, h + 4);
      // its door
      const dx = bd.face === "e" ? x + w : bd.face === "w" ? x : x + w / 2;
      const dz = bd.face === "s" ? z + h : bd.face === "n" ? z : z + h / 2;
      g.fillStyle = PAL.amber;
      g.beginPath();
      g.arc(dx, dz, 4, 0, Math.PI * 2);
      g.fill();
    }
  }
  // the glazed bridge between the headquarters and the east block
  g.fillStyle = "rgba(120,150,170,0.85)";
  g.fillRect(X(48), Z(16.4), 12 * px, 3.2 * px);
  // the plaza
  g.strokeStyle = "#8e8e88";
  g.lineWidth = 1;
  g.strokeRect(X(PLAZA.x0), Z(PLAZA.z0), (PLAZA.x1 - PLAZA.x0) * px, (PLAZA.z1 - PLAZA.z0) * px);

  // ── landmarks ──
  const mark = (x: number, z: number, r: number, fill: string) => {
    g.fillStyle = fill;
    g.strokeStyle = PAL.ink;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(X(x), Z(z), r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  };
  // the water tower and its fence
  g.setLineDash([3, 3]);
  g.strokeStyle = PAL.ink;
  g.beginPath();
  g.arc(X(TOWER.x), Z(TOWER.z), 9 * px, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  mark(TOWER.x, TOWER.z, 7.4 * px, "#dfe3e6");
  mark(TOWER.x, TOWER.z, 2 * px, "#c0392b");
  mark(STATUE.x, STATUE.z, 3 * px, "#6d6a60");
  mark(BENCH.x, BENCH.z, 2.2 * px, "#f3c46b");
  // lamps
  for (const l of LAMPS) {
    g.fillStyle = l.kind === "town" || l.kind === "porch" ? "#f0b75a" : "#fff3c8";
    g.strokeStyle = "rgba(30,30,30,0.6)";
    g.lineWidth = 1;
    g.beginPath();
    g.arc(X(l.x), Z(l.z), 2.6, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  // the barrier where the road ends
  g.strokeStyle = "#c0392b";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(X(ROAD_CLOSED.x), Z(ROAD_CLOSED.z - 6));
  g.lineTo(X(ROAD_CLOSED.x), Z(ROAD_CLOSED.z + 6));
  g.stroke();

  // ── the fence ──
  g.strokeStyle = PAL.fence;
  g.lineWidth = 2;
  const gap = (x: number, z: number) => Math.abs(z - GATE.z) < 1 && Math.abs(x - GATE.x) < 5.5;
  for (let i = 0; i < FENCE.length; i++) {
    const [ax, az] = FENCE[i];
    const [bx, bz] = FENCE[(i + 1) % FENCE.length];
    const len = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t < len; t += 6) {
      const x = ax + ((bx - ax) * t) / len;
      const z = az + ((bz - az) * t) / len;
      const x2 = ax + ((bx - ax) * Math.min(len, t + 4)) / len;
      const z2 = az + ((bz - az) * Math.min(len, t + 4)) / len;
      if (gap(x, z) || gap(x2, z2)) continue;
      g.beginPath();
      g.moveTo(X(x), Z(z));
      g.lineTo(X(x2), Z(z2));
      g.stroke();
      // a tick across (the posts)
      g.beginPath();
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      g.moveTo(X(x) - nx * 3, Z(z) - nz * 3);
      g.lineTo(X(x) + nx * 3, Z(z) + nz * 3);
      g.stroke();
    }
  }

  // ── names ──
  const label = (t: string, x: number, z: number, size = 13, col = PAL.ink, rot = 0, italic = false) => {
    g.save();
    g.translate(X(x), Z(z));
    g.rotate(rot);
    g.font = `${italic ? "italic " : ""}600 ${size}px Georgia, 'Times New Roman', serif`;
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
  label("HQ", 24, 18, 13, "#f2f2ee");
  label("EAST BLOCK", 74, 9, 11, "#f2f2ee", -Math.PI / 2);
  label("SOUTH BLOCK", 23, 60, 11, "#f2f2ee");
  label("PARKING", -33, 20, 12, "#f2f2ee");
  label("THE LAWN", 60, -80, 15, PAL.dim, 0, true);
  label("WATER TOWER", TOWER.x, TOWER.z + 24, 11);
  label("FROZEN POND", POND.cx, POND.cz + 4, 15, "#2c4a5e", 0, true);
  label("BOATHOUSE", -255, -120, 10);
  label("THE RAVINE", -350, -248, 14, PAL.ink, 0.53, true);
  label("FOOTBRIDGE", -238, -236, 10);
  label("THE CLEARING", BENCH.x, BENCH.z + 22, 11, PAL.ink, 0, true);
  label("a bench, a lamp", BENCH.x, BENCH.z + 32, 10, PAL.dim, 0, true);
  label("GROUNDS SHED", -155, 132, 10);
  label("GATEHOUSE", -10, -366, 11);
  label("BUS SHELTER", -13, -426, 9);
  label("DRIVEWAY", -84, -232, 11, PAL.ink, -1.35);
  label("COUNTY ROAD", 100, -418, 12);
  label("FROZEN RIVER", 290, -150, 15, "#2c4a5e", Math.PI / 2, true);
  label("MAIN STREET", 470, -416, 10);
  label("THE SQUARE", 420, -360, 10);
  label("CHURCH ST.", 446, -488, 9, PAL.ink, -Math.PI / 2);
  label("TOWNHOUSES", 390, -476, 9, PAL.ink, -Math.PI / 2);
  label("CHURCH", 420, -566, 10);
  label("ROAD CLOSED", 506, -394, 9, "#a5281c");
  label("THE TOWN", 404, -508, 20, PAL.ink, 0, true);
  label("THE WOODS", -150, -210, 20, PAL.ink, 0, true);
  label("THE WOODS", 130, 80, 20, PAL.ink, 0, true);
  label("RIDGES", -445, -100, 16, PAL.dim, -Math.PI / 2, true);
  label("RIDGES", -100, 192, 16, PAL.dim, 0, true);
  label("RIDGES", 400, -604, 16, PAL.dim, 0, true);
  label("COMPANY PROPERTY · FENCED", -100, 160, 11, PAL.fence);
  // the town's shops
  label("DINER", 345, -373, 9);
  label("MARKET", 366, -373, 9);
  label("BAR", 456, -373, 9);
  label("HOTEL", 442, -440, 9);
  label("GAS", 317, -373, 9);

  // ── the legend ──
  const L = c.width - side + 10;
  let y = margin;
  g.fillStyle = "#f4f5f6";
  g.fillRect(L - 10, 0, side, c.height);
  g.fillStyle = PAL.ink;
  g.font = "700 30px Georgia, serif";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillText("THE GROUNDS", L + 14, y + 10);
  g.font = "italic 16px Georgia, serif";
  g.fillStyle = PAL.dim;
  g.fillText("Site plan · version 1 · all of it walkable", L + 14, y + 38);
  y += 90;
  const key = (draw: (x: number, y: number) => void, text: string) => {
    draw(L + 30, y);
    g.fillStyle = PAL.ink;
    g.font = "15px Inter, Helvetica, sans-serif";
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText(text, L + 64, y);
    y += 34;
  };
  const sw = (fill: string) => (x: number, yy: number) => {
    g.fillStyle = fill;
    g.fillRect(x - 14, yy - 9, 28, 18);
  };
  key(sw("#2a3038"), "Building");
  key((x, yy) => {
    sw("#2a3038")(x, yy);
    g.strokeStyle = PAL.amber;
    g.lineWidth = 3;
    g.strokeRect(x - 16, yy - 11, 32, 22);
  }, "Building you walk into");
  key(sw("#4a4f56"), "Road, driveway, lot");
  key(sw("rgb(196,196,192)"), "Pavement, plaza");
  key((x, yy) => {
    g.strokeStyle = "rgba(120,96,70,0.9)";
    g.lineWidth = 2;
    g.setLineDash([5, 4]);
    g.beginPath();
    g.moveTo(x - 14, yy);
    g.lineTo(x + 14, yy);
    g.stroke();
    g.setLineDash([]);
  }, "Trail (packed snow)");
  key((x, yy) => {
    for (let i = 0; i < 7; i++) {
      g.fillStyle = i % 3 ? PAL.pine : PAL.birch;
      g.beginPath();
      g.arc(x - 12 + i * 4, yy + (i % 2 ? 4 : -4), 2.4, 0, Math.PI * 2);
      g.fill();
    }
  }, "Woods (deep snow, slow)");
  key(sw("rgb(178,197,211)"), "Ice — walkable");
  key((x, yy) => {
    g.strokeStyle = PAL.fence;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x - 14, yy);
    g.lineTo(x + 14, yy);
    g.stroke();
    for (const t of [-8, 4]) {
      g.beginPath();
      g.moveTo(x + t, yy - 3);
      g.lineTo(x + t, yy + 3);
      g.stroke();
    }
  }, "The company's fence");
  key((x, yy) => {
    g.fillStyle = "#fff3c8";
    g.strokeStyle = "#333";
    g.beginPath();
    g.arc(x - 6, yy, 3, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = "#f0b75a";
    g.beginPath();
    g.arc(x + 6, yy, 3, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }, "Lamps — the only light at night");
  key((x, yy) => {
    g.strokeStyle = "#c0392b";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x, yy - 9);
    g.lineTo(x, yy + 9);
    g.stroke();
  }, "Where the world ends");
  y += 20;
  // the scale and north
  g.fillStyle = PAL.ink;
  g.fillRect(L + 16, y, 100 * px, 6);
  g.fillStyle = "#fff";
  g.fillRect(L + 16 + 50 * px, y + 1, 50 * px - 1, 4);
  g.fillStyle = PAL.ink;
  g.font = "14px Inter, Helvetica, sans-serif";
  g.fillText("0", L + 12, y + 24);
  g.fillText("100 tiles  (≈ 100 m)", L + 16 + 100 * px - 40, y + 24);
  y += 60;
  g.save();
  g.translate(L + 40, y + 30);
  g.beginPath();
  g.moveTo(0, -30);
  g.lineTo(12, 18);
  g.lineTo(0, 8);
  g.lineTo(-12, 18);
  g.closePath();
  g.fill();
  g.font = "700 18px Georgia, serif";
  g.textAlign = "center";
  g.fillText("N", 0, -40);
  g.restore();
  y += 100;
  g.font = "15px Inter, Helvetica, sans-serif";
  g.textAlign = "left";
  g.fillStyle = PAL.dim;
  const notes = [
    "About 1 km × 0.8 km. Headquarters to the town:",
    "~600 tiles — 2½ min on foot, 1½ running.",
    "",
    "Everything drawn here is a place you can reach.",
    "Past the fence, the ridges and the river's far",
    "bank: only sky and far mountains.",
    "",
    "Open on day one: Headquarters (5 floors), the",
    "east and south blocks' ground floors, the",
    "gatehouse, the diner, the market and the bar.",
    "",
    "Generated in code (shared grounds.ts, v1):",
    "the land, the woods and the ways are the same",
    "for the server and both views.",
  ];
  for (const n of notes) {
    g.fillText(n, L + 14, y);
    y += 22;
  }
  // the frame
  g.strokeStyle = PAL.ink;
  g.lineWidth = 2;
  g.strokeRect(margin, margin, GW * px, GH * px);
  // a graticule every 100 tiles, ticked on the frame
  g.font = "11px Inter, Helvetica, sans-serif";
  g.fillStyle = PAL.dim;
  g.textAlign = "center";
  for (let x = Math.ceil(GROUNDS.x0 / 100) * 100; x <= GROUNDS.x1; x += 100) {
    g.fillRect(X(x), margin - 8, 1, 8);
    g.fillText(String(x), X(x), margin - 14);
  }
  g.textAlign = "right";
  for (let z = Math.ceil(GROUNDS.z0 / 100) * 100; z <= GROUNDS.z1; z += 100) {
    g.fillRect(margin - 8, Z(z), 8, 1);
    g.fillText(String(z), margin - 12, Z(z) + 4);
  }
  // (the river is drawn as ice by the land; the label sits on it)
  void RIVER;
}
