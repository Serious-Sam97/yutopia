// Plan 104's pieces (docs/plan/104-the-skate-again.md F6a): the 4 ft and 8 ft quarters, their corner, the hips (a
// convex corner: a turn sweep rising inward), the bank, the pyramid, the 4 ft spine, the decks, the stairs, the
// vert with its extension, the railing — on the module, their surfaces meeting without a step, the hips' frames
// right, a board carried round a hip without a knock.
import assert from "node:assert/strict";
import { test } from "node:test";
import { openFloor } from "../move/floor.ts";
import { STEP_DT } from "../move/spec.ts";
import { type MoveEnv, NO_INPUT, newBody, stepBody } from "../move/step.ts";
import { MODULE, PIECES, type PieceKind, pieceFoot, SkatePark, STAIRS, toLocal, toWorld } from "./pieces.ts";
import { NO_KEYS, type SkateEvents, skateEnv, startSkate } from "./step.ts";

const NEW: PieceKind[] = [
  "qp4",
  "qp8",
  "qp4corner",
  "hip",
  "bowlhip",
  "bank",
  "pyramid",
  "spine4",
  "deck4",
  "deck8",
  "stairs",
  "stairs8",
  "halfext",
  "railing",
];
const one = (kind: PieceKind, yaw = 0.4) => new SkatePark([{ kind, x: 10, y: 20, z: 1.5, yaw }]);
const close = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;

test("plan 104's pieces: on the 4 ft steps, their copings at their lips, their feet round their surfaces", () => {
  const S = MODULE.step;
  assert.ok(close(PIECES.qp4.height, S), `qp4 ${PIECES.qp4.height}`);
  assert.ok(close(PIECES.qp8.height, 2 * S), `qp8 ${PIECES.qp8.height}`);
  assert.ok(close(PIECES.hip.height, S) && close(PIECES.qp4corner.height, S) && close(PIECES.spine4.height, S));
  assert.ok(close(PIECES.bank.height, S) && close(PIECES.deck4.height, S) && close(PIECES.deck8.height, 2 * S));
  assert.ok(close(PIECES.halfext.height, 3.55 + S, 1e-9), `the extension ${PIECES.halfext.height}`);
  for (const kind of NEW) {
    const d = PIECES[kind];
    for (const s of d.surfaces)
      for (const c of s.prof.copings) {
        const at = s.prof.at(c);
        assert.ok(at.z > 0.5, `${kind}: a coping at ${at.z}`);
      }
    // (every surface's points inside the foot, placed anywhere)
    const park = one(kind);
    const foot = pieceFoot(park.pieces[0]);
    const inFoot = (x: number, y: number) =>
      foot.every(([x0, y0], i) => {
        const [x1, y1] = foot[(i + 1) % 4];
        return (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0) >= -1e-6;
      });
    for (const p of park.placed)
      for (let k = 0; k <= 10; k++)
        for (const kw of [0, 0.5, 1]) {
          const pt = p.s.prof.at((p.s.prof.total * k) / 10);
          const q = toWorld(p, pt.u, p.s.w0 + (p.s.w1 - p.s.w0) * kw);
          assert.ok(
            inFoot(q.x, q.y),
            `${kind} surface ${p.surf}: ${q.x.toFixed(2)}, ${q.y.toFixed(2)} out of its foot`,
          );
        }
    for (const ln of park.lines)
      for (const [x, y] of ln.pts) assert.ok(inFoot(x, y) || ln.what === "rail", `${kind}: its line out of its foot`);
  }
});

test("a hip's frame: up the ramp is in toward its centre; (u, w) there and back", () => {
  const park = one("hip", 0.7);
  const hip = park.placed.find((p) => p.s.inward);
  assert.ok(hip);
  for (const [u, w] of [
    [0.1, 0.2],
    [1.2, 1.0],
    [1.9, 0.05],
  ]) {
    const q = toWorld(hip, u, w);
    const back = toLocal(hip, q.x, q.y);
    assert.ok(close(back.u, u, 1e-9) && close(back.w, w, 1e-9), `${u}, ${w} → ${back.u}, ${back.w}`);
    // (+u in toward the centre: a step along it nearer)
    const r0 = Math.hypot(q.x - hip.ox, q.y - hip.oy);
    const r1 = Math.hypot(q.x + q.ux * 0.01 - hip.ox, q.y + q.uy * 0.01 - hip.oy);
    assert.ok(r1 < r0, "up the hip is inward");
    assert.ok(close(q.ux * q.wx + q.uy * q.wy, 0, 1e-12), "across is square to up");
  }
});

test("the hip's surfaces meet without a step: its legs, its round, its platform; its coping one line", () => {
  for (const kind of ["hip", "bowlhip"] as const) {
    const park = one(kind, 0);
    const def = PIECES[kind];
    const rIn = def.surfaces[2].rIn ?? 0;
    // round the hip at radii up its transition and on its deck: the height the same either side of each seam
    for (const r of [rIn * 0.95, rIn * 0.7, rIn * 0.4, 0.2]) {
      let last: number | null = null;
      for (let a = -0.6; a <= Math.PI / 2 + 0.6; a += 0.02) {
        // (past the legs' seams the legs run straight: their points at that radius from the seam)
        const [x, y] =
          a < 0
            ? [10 + r, 20 + a * r]
            : a > Math.PI / 2
              ? [10 - (a - Math.PI / 2) * r, 20 + r]
              : [10 + r * Math.cos(a), 20 + r * Math.sin(a)];
        const t = park.topAt(x, y, 99);
        assert.ok(t, `${kind} r ${r.toFixed(2)} a ${a.toFixed(2)}: a top`);
        if (last !== null)
          assert.ok(Math.abs(t.z - last) < 0.004, `${kind} r ${r.toFixed(2)} a ${a.toFixed(2)}: ${t.z} after ${last}`);
        last = t.z;
      }
    }
    // the platform behind: flat at its height everywhere
    const h = def.height;
    for (let u = -2.9; u < 0.25; u += 0.37)
      for (let w = -2.9; w < 0.25; w += 0.41) {
        if (kind === "bowlhip" && (u < -1.9 || w < -1.9)) continue;
        const t = park.topAt(10 + u, 20 + w, 99);
        assert.ok(t && close(t.z, 1.5 + h, 1e-6), `${kind} platform at ${u}, ${w}: ${t?.z}`);
      }
    // the coping: one line, round the ring
    const cop = park.lines.filter((l) => l.what === "coping");
    assert.equal(cop.length, 1);
    for (const [x, y, z] of cop[0].pts) assert.ok(close(z, 1.5 + h, 1e-9) && (x <= 10.3 + 1e-9 || y <= 20.3 + 1e-9));
  }
});

test("the pyramid's banks and corners meet without a step; its top's four edges steel", () => {
  const park = one("pyramid", 0);
  const d = PIECES.pyramid;
  const R = d.foot[2];
  for (const r of [R - 0.2, R - 0.9, R - 1.6]) {
    // round a square of half-side r… (the banks) and across each corner's cone
    let last: number | null = null;
    for (let a = 0; a <= 2 * Math.PI + 1e-9; a += 0.01) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const k = 1 / Math.max(Math.abs(c), Math.abs(s));
      const t = park.topAt(10 + c * r * k * 0.999, 20 + s * r * k * 0.999, 99);
      if (!t) continue;
      if (last !== null)
        assert.ok(Math.abs(t.z - last) < 0.03, `pyramid r ${r} a ${a.toFixed(2)}: ${t.z} after ${last}`);
      last = t.z;
    }
  }
  const top = park.topAt(10, 20, 99);
  assert.ok(top && close(top.z, 1.5 + d.height, 1e-9));
  assert.equal(park.lines.filter((l) => l.what === "ledge").length, 4);
});

test("the stairs: treads 1/n of the deck down, the rails 0.8 over the nosings; the extension's copings", () => {
  for (const [kind, n] of [
    ["stairs", 7],
    ["stairs8", 14],
  ] as const) {
    const d = PIECES[kind];
    const h = (n === 7 ? 1 : 2) * MODULE.step;
    assert.equal(d.surfaces.length, n - 1);
    d.surfaces.forEach((s, i) => {
      const z = s.prof.at(0).z;
      assert.ok(close(z, h - ((i + 1) * h) / n, 1e-9), `${kind} tread ${i}: ${z}`);
      assert.ok(close(s.prof.uMin, i * STAIRS.run, 1e-9));
    });
    for (const ln of d.lines) {
      assert.equal(ln.what, "rail");
      // (over each nosing: 0.8)
      const [, a, b] = ln.pts;
      const slope = (b[2] - a[2]) / (b[0] - a[0]);
      assert.ok(close(slope, -h / n / STAIRS.run, 1e-9), `${kind}: its rail parallel to the nosings`);
      assert.ok(close(a[2], h + STAIRS.rail, 1e-9));
    }
  }
  const e = PIECES.halfext;
  const tops = e.lines.map((l) => l.pts[0][2]).sort((a, b) => a - b);
  assert.deepEqual(
    tops.map((z) => +z.toFixed(3)),
    [3.55, 3.55, 3.55, 4.77],
  );
  // (the extension's sections side by side: across the wall, the same transition below the low coping)
  const park = one("halfext", 0);
  let last: number | null = null;
  for (let w = -6; w <= 6; w += 0.05) {
    const t = park.topAt(10 - 2.44 - 1.0, 20 + w, 99);
    assert.ok(t);
    if (last !== null) assert.ok(Math.abs(t.z - last) < 1e-6, `the vert's wall at w ${w}: ${t.z} after ${last}`);
    last = t.z;
  }
});

/** A board pushed off from (x, y) heading `yaw` over one piece's park: its events. */
function ride(park: SkatePark, x: number, y: number, yaw: number, secs: number, s0 = 4) {
  const env: MoveEnv = { grid: openFloor(() => 1.5), footing: () => "walk", skate: skateEnv(park) };
  const b = newBody(x, y, park.topAt(x, y, 99)?.z ?? 1.5, yaw);
  startSkate(b, "street-pop", 1);
  if (b.skate) b.skate.s = s0;
  const evs: SkateEvents[] = [];
  let top = 0;
  for (let i = 0; i < Math.round(secs / STEP_DT) && b.skate; i++) {
    const ev = stepBody(b, { ...NO_INPUT, skate: { ...NO_KEYS } }, env);
    if (ev.skate) evs.push(ev.skate);
    top = Math.max(top, b.z);
  }
  return { evs, top, b };
}

test("round a hip: carved across its legs and its round, up it and off its platform — never into a wall", () => {
  const park = one("hip", 0);
  // (along leg A's face, across: w toward the round, then on past it along B)
  const r1 = ride(park, 10 + 1.2, 20 - 2.5, Math.PI / 2, 1.2, 3);
  assert.equal(r1.evs.filter((e) => e.bail === "wall").length, 0, "across the hip's face");
  // (straight at the hip's round from the floor)
  const r2 = ride(park, 10 + 4, 20 + 4, -3 * (Math.PI / 4), 3, 6);
  assert.equal(r2.evs.filter((e) => e.bail === "wall").length, 0, "up the hip");
  assert.ok(r2.top > 1.5 + 0.6, `up the hip ${r2.top}`);
  // (and the pyramid, over its top)
  const py = one("pyramid", 0);
  const r3 = ride(py, 10 - 5, 20, 0, 3, 5);
  assert.equal(r3.evs.filter((e) => e.bail === "wall").length, 0, "over the pyramid");
});
