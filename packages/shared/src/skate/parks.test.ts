// The skate's parks (docs/plan/103-the-skate.md F6a, F7c): the hall's and the outdoor park's pieces inside them, on
// their floors, none in another; the racks; the build menu's pieces as pieces (their footprints, their solids under
// the ridden face, every turn and free); and a board pushed down each park's lines rolls on without a wall bail.
import assert from "node:assert/strict";
import { test } from "node:test";
import { quarterYaw, type WorldObjectDef } from "../catalog.ts";
import * as FAM_SK from "../fam/skate.ts";
import { BUILDINGS, groundSurfaceAt, INSIDES, terrainAt, treesIn } from "../grounds.ts";
import { openFloor } from "../move/floor.ts";
import { STEP_DT } from "../move/spec.ts";
import { type MoveEnv, NO_INPUT, newBody, stepBody } from "../move/step.ts";
import { groundSolidsIn } from "../shapes/grounds.ts";
import { kindSolids } from "../shapes/index.ts";
import {
  parkPieces,
  pieceBoxes,
  piecesOfThings,
  SKATE_FITS,
  SKATE_HALL,
  SKATE_SHOP,
  SKATE_YARD,
  skateKindParts,
  TOWN_PARKS,
  townSkatePieces,
} from "./parks.ts";
import { PIECES, type PiecePlace, pieceFoot, SkatePark } from "./pieces.ts";
import { SKATE_RACKS } from "./racks.ts";
import { NO_KEYS, type SkateEvents, skateEnv, startSkate } from "./step.ts";

type XY = [number, number];
/** Is (x, z) over a Jolt box (turned `a` about up, three's way: its +x to (cos a, −sin a)), `pad` m round it? */
function overBox(s: { x: number; z: number; hx: number; hz: number; a: number }, x: number, z: number, pad = 0) {
  const lx = (x - s.x) * Math.cos(s.a) - (z - s.z) * Math.sin(s.a);
  const lz = (x - s.x) * Math.sin(s.a) + (z - s.z) * Math.cos(s.a);
  return Math.abs(lx) <= s.hx + pad && Math.abs(lz) <= s.hz + pad;
}
/** A piece's ground in the plan (pieces.ts pieceFoot). */
const footprint = (pc: PiecePlace): XY[] => pieceFoot(pc);
/** A piece's height range over its floor. */
const zs = (pc: PiecePlace, h: number): [number, number] => [pc.z - h, pc.z - h + PIECES[pc.kind].height];
/** Two convex outlines overlap (more than touching: each shrunk `by` round its middle)? */
function overlap(a: XY[], b: XY[], by = 0.03): boolean {
  const shrink = (p: XY[]) => {
    const mx = p.reduce((t, q) => t + q[0], 0) / p.length;
    const my = p.reduce((t, q) => t + q[1], 0) / p.length;
    return p.map(([x, y]): XY => {
      const d = Math.hypot(x - mx, y - my) || 1;
      return [x - ((x - mx) / d) * by, y - ((y - my) / d) * by];
    });
  };
  const [A, B] = [shrink(a), shrink(b)];
  for (const P of [A, B])
    for (let i = 0; i < P.length; i++) {
      const [x0, y0] = P[i];
      const [x1, y1] = P[(i + 1) % P.length];
      const nx = y0 - y1;
      const ny = x1 - x0;
      const pa = A.map(([x, y]) => x * nx + y * ny);
      const pb = B.map(([x, y]) => x * nx + y * ny);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  return true;
}

test("the two parks: every piece inside its park, none in another, all on the floor it's levelled to", () => {
  const hall = BUILDINGS.find((b) => b.key === SKATE_HALL.key);
  assert.ok(hall && hall.kind === "warehouse" && hall.enter, "the hall is a warehouse you walk into");
  assert.ok(
    INSIDES.some((i) => i.b === hall && i.fits.length === 1 && i.fits[0].kind === "counter"),
    "nothing fitted inside it but the pro shop's counter",
  );
  // (the counter clear of every piece)
  const hallPark = new SkatePark(parkPieces(TOWN_PARKS[0]));
  for (let x = SKATE_SHOP.x - 0.5; x <= SKATE_SHOP.x + SKATE_SHOP.w + 0.5; x += 0.25)
    for (let z = SKATE_SHOP.z - 0.5; z <= SKATE_SHOP.z + SKATE_SHOP.d + 0.5; z += 0.25)
      assert.equal(hallPark.topAt(x, z, 99), null, `the counter's clear of the pieces at ${x}, ${z}`);
  for (const p of TOWN_PARKS) {
    // (the hall's within its walls' inner faces)
    const m = p.indoor ? 0.15 : 0;
    const pieces = parkPieces(p);
    const fps = pieces.map(footprint);
    for (const [i, fp] of fps.entries()) {
      const pc = pieces[i];
      const what = `${p.key} ${i} ${pc.kind}`;
      for (const [x, y] of fp) {
        assert.ok(x >= p.x0 + m && x <= p.x1 - m && y >= p.z0 + m && y <= p.z1 - m, `${what}: inside at ${x}, ${y}`);
        // (the floor there what it's levelled to: pieces stood on it as the walker is)
        const g = terrainAt(Math.min(p.x1 - 0.01, x), Math.min(p.z1 - 0.01, y));
        assert.ok(Math.abs(g - p.h) < 1e-6, `${what}: the floor at ${x.toFixed(2)}, ${y.toFixed(2)} is ${g}`);
      }
      // (none in another — one stood on another, a stair flight on its deck, only touching)
      for (let j = i + 1; j < fps.length; j++) {
        const [a0, a1] = zs(pc, p.h);
        const [b0, b1] = zs(pieces[j], p.h);
        if (a1 <= b0 + 1e-6 || b1 <= a0 + 1e-6) continue;
        assert.ok(!overlap(fp, fps[j]), `${what} overlaps ${j} ${pieces[j].kind}`);
      }
    }
    // the floor: the hall's concrete, the outdoor park's ploughed concrete with no trees on it
    for (let x = p.x0 + 0.5; x < p.x1; x += 3)
      for (let z = p.z0 + 0.5; z < p.z1; z += 3) assert.equal(groundSurfaceAt(x, z), p.indoor ? "floor" : "walk");
    for (let cx = Math.floor(p.x0 / 32); cx <= Math.floor(p.x1 / 32); cx++)
      for (let cz = Math.floor(p.z0 / 32); cz <= Math.floor(p.z1 / 32); cz++)
        for (const t of treesIn(cx, cz))
          assert.ok(!(t.x > p.x0 && t.x < p.x1 && t.z > p.z0 && t.z < p.z1), `${p.key}: a tree at ${t.x}, ${t.z}`);
  }
  // (and read off the land, the same)
  const flat = townSkatePieces();
  const read = townSkatePieces(terrainAt);
  assert.deepEqual(
    read.map((pc) => +pc.z.toFixed(6)),
    flat.map((pc) => +pc.z.toFixed(6)),
  );
  assert.ok(SKATE_YARD.x0 >= 456, "nothing of today's town west of x 448 changed (grounds-town.test)");
});

test("the racks: one in each park, on its floor, clear of its pieces", () => {
  assert.equal(SKATE_RACKS.length, TOWN_PARKS.length);
  for (const p of TOWN_PARKS) {
    const r = SKATE_RACKS.filter((k) => k.x > p.x0 && k.x < p.x1 && k.z > p.z0 && k.z < p.z1);
    assert.equal(r.length, 1, `${p.key}: a rack`);
    assert.equal(r[0].y, p.h);
    const park = new SkatePark(parkPieces(p));
    for (const [dx, dz] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 0.5],
      [0, -0.5],
    ])
      assert.equal(park.topAt(r[0].x + dx, r[0].z + dz, 99), null, `${p.key}: its rack's clear of the pieces`);
  }
});

test("the parks' solids: under their pieces' faces, a step under at most where it's gentle", () => {
  for (const p of TOWN_PARKS) {
    const pieces = parkPieces(p);
    const park = new SkatePark(pieces);
    const solids = new Map<string, ReturnType<typeof groundSolidsIn>>();
    const at = (x: number, z: number) => {
      const k = `${Math.floor(x / 32)},${Math.floor(z / 32)}`;
      const had = solids.get(k);
      if (had) return had;
      const l = groundSolidsIn(Math.floor(x / 32), Math.floor(z / 32));
      solids.set(k, l);
      return l;
    };
    let checked = 0;
    let open = 0;
    // (off the pieces' own edges)
    for (let x = p.x0 + 0.263; x < p.x1; x += 0.5)
      for (let z = p.z0 + 0.237; z < p.z1; z += 0.5) {
        const t = park.topAt(x, z, 99);
        if (!t) continue;
        // (every chunk round: a box is in the chunk of its middle)
        let top = -Infinity;
        for (const [dx, dz] of [
          [0, 0],
          [32, 0],
          [-32, 0],
          [0, 32],
          [0, -32],
        ])
          for (const g of at(x + dx, z + dz)) {
            if (g.what !== "skate_wood" && g.what !== "skate_concrete") continue;
            const s = g.s;
            if (s.t === "box" && overBox(s, x, z)) top = Math.max(top, s.y + s.hy);
          }
        // (where it's gentle: under the face, a step at most; where it's steep the block stands to the coping)
        const frame = t.p.s.prof.at(t.on.l);
        if (Math.abs(frame.tz) >= 0.69) continue;
        // (between a bowl corner's sectors, a sliver open)
        if (top === -Infinity) {
          if (t.z - p.h > 0.15) open++;
          continue;
        }
        const over = top - t.z;
        assert.ok(over < 0.012, `${p.key} at ${x}, ${z}: a solid ${over.toFixed(3)} over the face`);
        if (t.z - p.h > 0.15)
          assert.ok(over > -0.14, `${p.key} at ${x}, ${z}: the solid ${(-over).toFixed(3)} under the face`);
        checked++;
      }
    assert.ok(checked > 200, `${p.key}: ${checked} points`);
    assert.ok(open < checked * 0.03, `${p.key}: ${open} points with nothing under them`);
  }
});

test("a built piece is its piece: in its footprint at every turn and free, its solids under its face", () => {
  for (const [kind, f] of Object.entries(SKATE_FITS)) {
    const def = PIECES[f.piece];
    const turns: { o: WorldObjectDef; rect: XY[] }[] = [];
    for (const q of [0, 1, 2, 3]) {
      const [w, h] = q % 2 ? [f.h, f.w] : [f.w, f.h];
      const o = { id: `t-${kind}`, kind, x: 10, y: 20, yaw: quarterYaw(q), props: {} };
      turns.push({
        o,
        rect: [
          [10, 20],
          [10 + w, 20],
          [10 + w, 20 + h],
          [10, 20 + h],
        ],
      });
    }
    for (const yaw of [0.3, 2.1, -1.2]) {
      const o = { id: `f-${kind}`, kind, x: 10, y: 20, yaw, props: { free: true } };
      const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
      turns.push({
        o,
        rect: (
          [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ] as XY[]
        ).map(([a, b]): XY => {
          const [u, v] = [(a * f.w) / 2, (b * f.h) / 2];
          return [10 + u * c - v * s, 20 + u * s + v * c];
        }),
      });
    }
    for (const { o, rect } of turns) {
      const what = `${kind} yaw ${(o.yaw ?? 0).toFixed(2)}${o.props?.free ? " free" : ""}`;
      const pieces = piecesOfThings([o]);
      assert.equal(pieces.length, 1, what);
      const pc = pieces[0];
      assert.equal(pc.kind, f.piece);
      assert.ok(Math.abs(pc.z - f.lift) < 1e-9);
      // its ground inside the footprint (the rails' bar inside too)
      const big: XY[] = rect;
      for (const [x, y] of footprint(pc)) {
        const inside = big.every(([x0, y0], i) => {
          const [x1, y1] = big[(i + 1) % 4];
          return (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0) >= -1e-6;
        });
        assert.ok(inside, `${what}: its piece's corner ${x.toFixed(2)}, ${y.toFixed(2)} out of its footprint`);
      }
      // its solids (kindSolids, as Jolt has them) under its face, gentle stretches a step under at most
      const solids = kindSolids(o, 0);
      const park = new SkatePark(pieces);
      let hits = 0;
      for (const s of def.surfaces) {
        if (s.sweep !== "line") continue;
        for (let k = 0.04; k < 1; k += 0.08)
          for (const kw of [0.2, 0.5, 0.8]) {
            const pt = s.prof.at(s.prof.total * k);
            const u = (s.du ?? 0) + (s.turn ? -pt.u : pt.u);
            const w = s.w0 + (s.w1 - s.w0) * kw;
            const [c, sn] = [Math.cos(pc.yaw), Math.sin(pc.yaw)];
            const x = pc.x + u * c - w * sn;
            const y = pc.y + u * sn + w * c;
            const t = park.topAt(x, y, 99);
            assert.ok(t, `${what}: its face at ${x}, ${y}`);
            let top = -Infinity;
            for (const b of solids) if (b.t === "box" && overBox(b, x, y, 1e-6)) top = Math.max(top, b.y + b.hy);
            if (Math.abs(pt.tz) >= 0.69) continue;
            assert.ok(top < t.z + 0.012, `${what}: a solid ${(top - t.z).toFixed(3)} over its face at ${u}, ${w}`);
            if (t.z > f.lift + 0.15) {
              assert.ok(top > t.z - 0.14, `${what}: its solids ${(t.z - top).toFixed(3)} under its face at ${u}, ${w}`);
              hits++;
            }
          }
      }
      if (def.surfaces.length) assert.ok(hits > 0, `${what}: checked`);
      // its rails: a solid under the bar along it
      for (const ln of def.lines)
        if (ln.what === "rail")
          for (const [u, w, z] of ln.pts) {
            const [c, sn] = [Math.cos(pc.yaw), Math.sin(pc.yaw)];
            const x = pc.x + u * c - w * sn;
            const y = pc.y + u * sn + w * c;
            const near = solids.some(
              (b) => b.t === "box" && overBox(b, x, y, 0.02) && Math.abs(b.y + b.hy - (z + f.lift)) < 0.9,
            );
            assert.ok(near, `${what}: a solid under its rail at ${u}`);
          }
    }
  }
  // (upstairs, or not a park piece: not a piece)
  assert.deepEqual(
    piecesOfThings([
      { kind: "sk_ledge", x: 0, y: 0, yaw: 0, props: { level: 1 } },
      { kind: "chair", x: 0, y: 0, yaw: 0 },
    ]),
    [],
  );
  // (on a floor that isn't level: its z the ground's there)
  assert.equal(piecesOfThings([{ kind: "sk_ledge", x: 0, y: 0, yaw: 0 }], () => 2.5)[0].z, 2.5);
  // (the boxes the solids are made of: a ramp's under its face, a rail's thin)
  for (const b of pieceBoxes({ kind: "rail" })) assert.ok(b.rail && b.hw <= 0.03);
});

/** A board pushed off from (x, y) heading `yaw`, ridden for `secs`: its events, and the modes it was in. */
function ride(park: SkatePark, h: number, z0: number, x: number, y: number, yaw: number, secs: number, push = 1.4) {
  const env: MoveEnv = { grid: openFloor(() => h), footing: () => "walk", skate: skateEnv(park) };
  const b = newBody(x, y, z0, yaw);
  startSkate(b, "street-pop", 1);
  if (b.skate) b.skate.s = 3;
  const evs: SkateEvents[] = [];
  const modes = new Set<string>();
  let top = h;
  const n = Math.round(secs / STEP_DT);
  for (let i = 0; i < n && b.skate; i++) {
    const ev = stepBody(b, { ...NO_INPUT, skate: { ...NO_KEYS, brk: i * STEP_DT < push } }, env);
    if (ev.skate) evs.push(ev.skate);
    if (b.skate) modes.add(b.skate.mode);
    top = Math.max(top, b.z);
  }
  return { evs, modes, top, b };
}

test("down each park's lines: pushed off, it rolls through the pieces without a wall bail", () => {
  const H = Math.PI / 2;
  const lines: Record<string, [number, number, number, number?][]> = {
    hall: [
      // the vert from its flat, east, west into the extension and beside it
      [463.54, -529.6, 0],
      [463.54, -529.6, Math.PI],
      [463.54, -533.5, Math.PI],
      // along the mezzanine down the roll-in; off its drop; down its stairs
      [463, -509.7, 0],
      [463, -509.7, -H, 0.4],
      [457.825, -510, -H, 0.4],
      // the spine from the west; the island's hip; the north wall; the east wall; the corner
      [474, -527, 0],
      [481.5, -524.5, 0],
      [483, -529.5, -H],
      [494.5, -516, 0],
      [492, -529, -0.8],
      // the seven off its deck; the island's bank from the south
      [493.525, -526, H, 0.4],
      [486.5, -513, -H],
    ],
    yard: [
      // the bowl from its middle: east, north, into the pocket, at the hip
      [494, -474.5, 0],
      [494, -474.5, -H],
      [490.5, -470, H],
      [492, -473.5, 0.98],
      // up its bank from the east
      [507, -474.5, Math.PI],
      // the mini ramp from its flat; at the spine; the pyramid; off the platform down the stairs; the kickers
      [468.05, -489.4, 0],
      [474, -489.4, 0],
      [469, -459.5, 0],
      [467.525, -474, H, 0.4],
      // (plan 107: a push is whole strokes now — 1.2 s of Shift is the old 1.4 s of W's speed, ~8 m/s)
      [465.5, -473, H, 1.2],
    ],
  };
  for (const p of TOWN_PARKS) {
    const park = new SkatePark(parkPieces(p));
    for (const [x, y, yaw, push] of lines[p.key]) {
      // (the stairs' deck: started up on it)
      const t = park.topAt(x, y, 99);
      const r = ride(park, p.h, t ? t.z : p.h, x, y, yaw, 8, push);
      const what = `${p.key} from ${x}, ${y} heading ${yaw.toFixed(2)}`;
      const walls = r.evs.filter((e) => e.bail === "wall");
      assert.equal(
        walls.length,
        0,
        `${what}: into a wall (modes ${[...r.modes]}, at ${r.b.x.toFixed(1)}, ${r.b.y.toFixed(1)})`,
      );
      assert.ok(r.top > p.h + 0.5, `${what}: up a piece (${(r.top - p.h).toFixed(2)} m)`);
    }
  }
});

test("the build menu's numbers (fam/skate.ts, plain on the page) are the pieces' own", () => {
  assert.deepEqual(Object.keys(FAM_SK.CATALOG).sort(), Object.keys(SKATE_FITS).sort());
  for (const [kind, f] of Object.entries(SKATE_FITS)) {
    const e = FAM_SK.CATALOG[kind as keyof typeof FAM_SK.CATALOG];
    assert.deepEqual([e.label, e.w, e.h], [f.label, f.w, f.h], kind);
    const want = skateKindParts(kind);
    const have = FAM_SK.SHAPES[kind as keyof typeof FAM_SK.SHAPES].parts;
    assert.equal(have.length, want.length, kind);
    for (const [i, p] of have.entries()) {
      assert.equal(p.t, "box");
      if (p.t !== "box") continue;
      // (to the millimetre or two: a hair wider, never higher)
      const off = { u0: want[i].u0 - p.u0, v0: want[i].v0 - p.v0, u1: p.u1 - want[i].u1, v1: p.v1 - want[i].v1 };
      for (const [k, d] of Object.entries(off)) assert.ok(d > -1e-9 && d < 0.0021, `${kind} part ${i} ${k}: ${d}`);
      assert.equal(p.y0, want[i].y0);
      assert.ok(want[i].y1 - p.y1 > -1e-9 && want[i].y1 - p.y1 < 0.0011, `${kind} part ${i} y1`);
    }
  }
});
