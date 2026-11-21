// Plan 112 — the town's buildings' insides as floors of the one structure: laid from every building you walk into,
// walked into from the land and up their own stairs, their shells kept, their walls their storey's height.
import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutOf } from "../building-styles.ts";
import { hearingGain } from "../hearing.ts";
import { aboveOf, belowOf, elevOf, riseOf, setSpaceFloors, spaceGroundAt } from "../levels.ts";
import { kindSolids } from "../shapes/index.ts";
import { floorAt, stairsRamps, stairsRise } from "../stairs.ts";
import { WALL_H } from "../units.ts";
import { wallsEdit, wallsSet } from "./edit.ts";
import { FURNISHED } from "./furnish-layouts.ts";
import { frameOf } from "./furnishings.ts";
import { layoutProblems } from "./furnishings-check.ts";
import { applyOps } from "./ops.ts";
import { slabUnder } from "./query.ts";
import {
  floorsOfSpace,
  furnitureOf,
  layoutFor,
  laySpace,
  spaceBuildings,
  spaceShrinkWhy,
  spacesFix,
  storeysOf,
} from "./spaces.ts";

import type { Structure } from "./types.ts";
import { viewOf } from "./view.ts";

const FURNISHED_KEYS = new Set(Object.keys(FURNISHED));

function town(): { st: Structure; things: ReturnType<typeof laySpace>[] } {
  let st: Structure = {
    version: 4,
    key: "t",
    name: "t",
    home: 0,
    spawn: [0, 0],
    floors: [{ index: 0, name: "ground", z: 0, grid: { x0: 0, y0: 0, w: 20, h: 20 } }],
    slabs: [],
    walls: [],
    rooms: [],
  };
  const things: ReturnType<typeof laySpace>[] = [];
  for (const b of spaceBuildings()) {
    const s = laySpace(st, b);
    assert.ok(s, `${b.key}: laid`);
    things.push(s);
    st = {
      ...st,
      floors: [...st.floors, ...s.floors],
      walls: [...st.walls, ...s.walls],
      slabs: [...st.slabs, ...s.slabs],
    };
  }
  return { st, things };
}

test("every building walked into gets a space: a floor a storey, its shell with its openings", () => {
  const { st, things } = town();
  assert.ok(things.length >= 30, `${things.length} spaces`);
  const ids = new Set(st.floors.map((f) => f.index));
  assert.equal(ids.size, st.floors.length, "no index twice");
  for (const f of st.floors.filter((q) => q.space)) {
    assert.ok(f.index >= 32 && f.index < 256, `${f.name}: index ${f.index}`);
    const shell = st.walls.filter((w) => w.floor === f.index && w.shell);
    assert.equal(shell.length, 4, `${f.name}: four shell walls`);
    assert.ok(
      st.slabs.some((s) => s.floor === f.index && Math.abs(s.z - f.z) < 1e-6),
      `${f.name}: a slab`,
    );
    assert.ok((f.ceil ?? 0) >= 2.2, `${f.name}: ceiling ${f.ceil}`);
  }
  // (every ground storey's door: a gap in its shell)
  for (const t of things) {
    const g = t?.floors[0];
    assert.ok(g);
    const gaps = t.walls.filter((w) => w.floor === g.index).flatMap((w) => w.gaps ?? []);
    assert.ok(
      gaps.some((q) => q[2] < 0.1 && q[3] > 1.9),
      `${g.name}: a doorway`,
    );
  }
});

test("walked in from the land, up the stairs and out again: the floor from where the feet are", () => {
  const { st, things } = town();
  setSpaceFloors(st.floors);
  const m = viewOf(st);
  const slab = (l: number, q: { x: number; y: number }, z?: number) => {
    void z;
    return !!slabUnder(st, l, q.x, q.y);
  };
  const t = things.find((s) => s && s.floors.length >= 2 && s.things.length);
  assert.ok(t);
  const [g, up] = t.floors;
  const inside = { x: g.grid.x0 + g.grid.w / 2, y: g.grid.y0 + g.grid.h / 2 };
  assert.equal(spaceGroundAt(inside.x, inside.y)?.index, g.index);
  // (on the land at its floor's height inside its plot: on its ground storey)
  const inn = floorAt(m, 0, inside, g.z + 0.02, slab);
  assert.equal(inn?.level, g.index);
  assert.ok(Math.abs((inn?.dz ?? 0) + g.z) < 1e-9);
  assert.equal(aboveOf(g.index), up.index);
  assert.equal(belowOf(up.index), g.index);
  assert.equal(belowOf(g.index), null);
  assert.ok(Math.abs(riseOf(g.index) - (up.z - g.z)) < 1e-9);
  assert.equal(elevOf(up.index), up.z);
  // (up past its band: on the storey over it)
  const climbed = floorAt(m, g.index, inside, riseOf(g.index) - 0.1, slab);
  assert.equal(climbed?.level, up.index);
  // (out of its plot: the land again, its height the world's)
  const out = floorAt(m, g.index, { x: g.grid.x0 - 2, y: g.grid.y0 - 2 }, 0, slab);
  assert.equal(out?.level, 0);
  assert.ok(Math.abs((out?.dz ?? 0) - g.z) < 1e-9);
  // (the stairs go up their storey's own rise)
  const stairs = t.things[0];
  assert.ok(Math.abs(stairsRise(stairs) - riseOf(g.index)) < 1e-9);
  const top = Math.max(...stairsRamps(stairs).map((r) => Math.max(r.h0, r.h1)));
  assert.ok(Math.abs(top - riseOf(g.index)) < 1e-9);
  // (the HQ's own floors as they were)
  assert.equal(elevOf(1), 3.5);
  assert.equal(aboveOf(0), 1);
});

test("a shell stays: never taken away, never made higher; painted inside; new walls a storey high", () => {
  const { st } = town();
  setSpaceFloors(st.floors);
  const f = st.floors.find((q) => q.space && (q.ceil ?? 9) < WALL_H);
  assert.ok(f);
  const shell = st.walls.find((w) => w.floor === f.index && w.shell);
  assert.ok(shell);
  let n = 0;
  const id = () => `w${n++}`;
  assert.deepEqual(wallsEdit(st, f.index, [], [shell.id], id), { why: "the building's own wall" });
  assert.deepEqual(wallsSet(st, f.index, [{ id: shell.id, height: 1 }]), { why: "the building's own wall" });
  const painted = wallsSet(st, f.index, [{ id: shell.id, front: "b" }]);
  assert.ok("op" in painted, JSON.stringify(painted));
  const cx = f.grid.x0 + f.grid.w / 2;
  const drawn = wallsEdit(st, f.index, [{ a: [cx, f.grid.y0 + 1], b: [cx, f.grid.y0 + 3], front: "p" }], [], id);
  assert.ok("added" in drawn, JSON.stringify(drawn));
  assert.equal(drawn.added[0].height, f.ceil);
  assert.equal(drawn.added[0].base, f.z);
  // (off its plot: off the floor)
  const off = wallsEdit(
    st,
    f.index,
    [{ a: [f.grid.x0 - 3, f.grid.y0], b: [f.grid.x0 - 1, f.grid.y0], front: "p" }],
    [],
    id,
  );
  assert.deepEqual(off, { why: "off the floor" });
});

test("the town's spaces kept with its buildings: laid once, moved with one, out of the world when it goes", () => {
  const base: Structure = {
    version: 4,
    key: "t",
    name: "t",
    home: 0,
    spawn: [0, 0],
    floors: [{ index: 0, name: "ground", z: 0, grid: { x0: 0, y0: 0, w: 20, h: 20 } }],
    slabs: [],
    walls: [],
    rooms: [],
  };
  const all = spaceBuildings();
  const first = spacesFix(base, all);
  assert.equal(first.laid.length, all.length);
  let st = applyOps(base, first.ops);
  assert.deepEqual(spacesFix(st, all).ops, [], "laid once: nothing the second time");
  // (a wall built in the bar, then the bar moved 3 m east)
  const bar = all.find((b) => b.key === "bar");
  assert.ok(bar);
  const g = st.floors.find((f) => f.space === "bar" && f.storey === 0);
  assert.ok(g);
  const cx = (bar.x0 + bar.x1) / 2;
  st = applyOps(st, [
    {
      op: "walls",
      remove: [],
      add: [
        { id: "mine", floor: g.index, a: [cx, bar.z0 + 2], b: [cx, bar.z0 + 5], base: g.z, height: 2.5, front: "p" },
      ],
    },
  ]);
  const moved = { ...bar, x0: bar.x0 + 3, x1: bar.x1 + 3 };
  const fix = spacesFix(
    st,
    all.map((b) => (b.key === "bar" ? moved : b)),
  );
  assert.equal(fix.laid.length, 0);
  assert.ok(
    fix.moves.some((m) => m.level === g.index && m.dx === 3 && m.dy === 0),
    JSON.stringify(fix.moves),
  );
  const after = applyOps(st, fix.ops);
  const w = after.walls.find((q) => q.id === "mine");
  assert.deepEqual(w?.a, [cx + 3, bar.z0 + 2]);
  assert.equal(after.floors.find((f) => f.index === g.index)?.grid.x0, bar.x0 + 3);
  assert.ok(
    after.walls.some((q) => q.floor === g.index && q.shell && q.a[0] === bar.x0 + 3),
    "its shell laid again there",
  );
  // (taken away: kept, out of the world; back: in it again)
  const gone = applyOps(
    after,
    spacesFix(
      after,
      all.filter((b) => b.key !== "bar"),
    ).ops,
  );
  assert.ok(gone.floors.filter((f) => f.space === "bar").every((f) => f.away));
  assert.ok(
    gone.walls.some((q) => q.id === "mine"),
    "what was built in it kept",
  );
  const back = applyOps(
    gone,
    spacesFix(
      gone,
      all.map((b) => (b.key === "bar" ? moved : b)),
    ).ops,
  );
  assert.ok(back.floors.filter((f) => f.space === "bar").every((f) => !f.away));
  // (smaller than what's built: refused; as big: fine)
  const things = [
    // (its tile corner: the sofa from x1 − 3.25 to x1 − 0.75, all of it inside)
    { id: "sofa", kind: "sofa", x: bar.x1 - 3.5, y: bar.z0 + 4, yaw: 0, refId: null, props: { level: g.index } },
  ];
  assert.match(spaceShrinkWhy(st, bar, { ...bar, x1: bar.x1 - 4 }, things) ?? "", /smaller than what's built/);
  assert.equal(spaceShrinkWhy(st, bar, moved, things), null);
  // (a resize that still holds it: grown 4 m east, the sofa and an admin's wall snapped to the west shell in it —
  // plan 113 review: the only-moved shortcut was all the old test reached)
  const snapped = applyOps(st, [
    {
      op: "walls",
      remove: [],
      add: [
        {
          id: "snap",
          floor: g.index,
          a: [bar.x0, bar.z0 + 6],
          b: [bar.x0 + 3, bar.z0 + 6],
          base: g.z,
          height: 2.5,
          front: "p",
        },
      ],
    },
  ]);
  assert.equal(spaceShrinkWhy(snapped, bar, { ...bar, x1: bar.x1 + 4 }, things), null, "grown: it fits");
  // (an admin's floor — a mezzanine slab — past the new east edge: refused, as a thing would be)
  const slabbed = applyOps(st, [
    {
      op: "slabs",
      floor: g.index,
      slabs: [
        ...st.slabs.filter((x) => x.floor === g.index),
        {
          id: "deck",
          floor: g.index,
          z: g.z + 2,
          top: ".",
          outline: [
            [bar.x1 - 3, bar.z0 + 1],
            [bar.x1 - 0.5, bar.z0 + 1],
            [bar.x1 - 0.5, bar.z0 + 3],
            [bar.x1 - 3, bar.z0 + 3],
          ],
          holes: [],
        },
      ],
    },
  ]);
  assert.match(spaceShrinkWhy(slabbed, bar, { ...bar, x1: bar.x1 - 2 }, []) ?? "", /smaller than what's built/);
  assert.equal(spaceShrinkWhy(slabbed, bar, { ...bar, x1: bar.x1 + 2 }, []), null);
});

test("a ground storey hears the street at its door; the storey over it only by its stairs", () => {
  const { st } = town();
  setSpaceFloors(st.floors);
  const m = viewOf(st);
  const [g, up] = st.floors.filter((f) => f.space === "bar").sort((a, b) => (a.storey ?? 0) - (b.storey ?? 0));
  assert.ok(g && up);
  const x = g.grid.x0 + g.grid.w / 2;
  const inside = { x, y: g.grid.y0 + 2, level: g.index };
  const street = { x, y: g.grid.y0 - 2, level: 0 };
  assert.ok(hearingGain(m, inside, street) > 0, "in at the door, out on the street");
  assert.equal(hearingGain(m, { ...inside, level: up.index }, street), 0, "upstairs, not");
  assert.ok(
    hearingGain(m, { ...inside, level: up.index, stairs: true }, { ...inside, stairs: true }) > 0,
    "up and down its stairwell",
  );
});

test("a building turned to face another way: its space laid again in its new frame; refused with what's built in it", () => {
  const base: Structure = {
    version: 4,
    key: "t",
    name: "t",
    home: 0,
    spawn: [0, 0],
    floors: [{ index: 0, name: "ground", z: 0, grid: { x0: 0, y0: 0, w: 20, h: 20 } }],
    slabs: [],
    walls: [],
    rooms: [],
  };
  const all = spaceBuildings();
  const first = spacesFix(base, all);
  const st = applyOps(base, first.ops);
  setSpaceFloors(st.floors);
  const bar = all.find((b) => b.key === "bar");
  assert.ok(bar);
  const face = ({ n: "s", s: "n", e: "w", w: "e" } as const)[bar.face];
  const turned = { ...bar, face };
  const q = frameOf(turned)?.q;
  assert.notEqual(q, frameOf(bar)?.q, "its frame turned with its door");
  const was = st.floors
    .filter((f) => f.space === "bar")
    .map((f) => f.index)
    .sort();
  const fix = spacesFix(
    st,
    all.map((b) => (b.key === "bar" ? turned : b)),
  );
  const r = fix.relaid.find((x) => x.key === "bar");
  assert.ok(r, "laid again");
  assert.equal(fix.moves.length, 0, "not moved: laid again");
  const after = applyOps(st, fix.ops);
  const now = after.floors.filter((f) => f.space === "bar" && !f.away);
  assert.deepEqual(now.map((f) => f.index).sort(), was, "its floors keep their numbers");
  assert.ok(
    now.every((f) => f.turn === q),
    "each one knows its turn",
  );
  // (its stairs turned with it; its shell's openings where the turned building has them)
  const s0 = first.things.find((t) => t.id.startsWith("sp-bar-") && t.kind === "stairs");
  const s1 = r.things.find((t) => t.kind === "stairs");
  assert.ok(s0 && s1);
  assert.notEqual(s1.yaw, s0.yaw);
  // (its shell laid again: its front door — where the turned building's layout has it — in a gap down to the floor)
  const g0 = now.find((f) => f.storey === 0);
  assert.ok(g0);
  const d = layoutOf(turned)?.door;
  assert.ok(d);
  const open = after.walls.some((w) => {
    if (w.floor !== g0.index || !w.shell) return false;
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const u = ((d.x - w.a[0]) * (w.b[0] - w.a[0]) + (d.z - w.a[1]) * (w.b[1] - w.a[1])) / L;
    const off = Math.abs((d.x - w.a[0]) * (w.b[1] - w.a[1]) - (d.z - w.a[1]) * (w.b[0] - w.a[0])) / L;
    return off < 0.2 && (w.gaps ?? []).some((q) => q[2] < 0.05 && u > q[0] && u < q[1]);
  });
  assert.ok(open, "its front door open in its new shell");
  assert.deepEqual(
    spacesFix(
      after,
      all.map((b) => (b.key === "bar" ? turned : b)),
    ).ops,
    [],
    "laid once",
  );
  // (refused with anything an admin built in it — a sofa of their own; its own laid things are laid again)
  const g = st.floors.find((f) => f.space === "bar" && f.storey === 0);
  assert.ok(g);
  const sofa = {
    id: "sofa",
    kind: "sofa",
    x: bar.x0 + 3,
    y: bar.z0 + 4,
    yaw: 0,
    refId: null,
    props: { level: g.index },
  };
  assert.match(spaceShrinkWhy(st, bar, turned, [sofa]) ?? "", /turned with what's built/);
  assert.equal(
    spaceShrinkWhy(
      st,
      bar,
      turned,
      first.things.filter((t) => t.id.startsWith("sp-bar-")),
    ),
    null,
  );
});

test("a storey stood off the tiles is a floor of whole tiles over its plot (the rest hut out on the long road)", () => {
  const { st } = town();
  setSpaceFloors(st.floors);
  const f = st.floors.find((q) => q.space === "rest-hut");
  assert.ok(f && !Number.isInteger(f.grid.x0), "its plot off the tiles");
  const lm = viewOf(st).levels?.find((l) => l.index === f.index);
  assert.ok(lm);
  assert.ok(
    Number.isInteger(lm.ox) && Number.isInteger(lm.oy) && Number.isInteger(lm.width) && Number.isInteger(lm.height),
  );
  assert.ok(lm.ox <= f.grid.x0 && lm.ox + lm.width >= f.grid.x0 + f.grid.w, "all of it");
  assert.ok(lm.oy <= f.grid.y0 && lm.oy + lm.height >= f.grid.y0 + f.grid.h);
});

test("a town staircase's treads up to its own storey over it, not the HQ's (the bar's: 4.2 m)", () => {
  const { st, things } = town();
  setSpaceFloors(st.floors);
  const [g, up] = st.floors.filter((f) => f.space === "bar").sort((a, b) => (a.storey ?? 0) - (b.storey ?? 0));
  assert.ok(g && up);
  const stairs = things.flatMap((t) => t?.things ?? []).find((o) => o.kind === "stairs" && o.props?.level === g.index);
  assert.ok(stairs);
  const top = Math.max(...kindSolids(stairs).map((s) => (s.t === "cyl" ? s.y1 : s.y + s.hy)));
  assert.ok(Math.abs(top - (up.z - g.z)) < 1e-6, `its top tread at ${top}, the storey over it ${up.z - g.z} up`);
});

// (plan 113's second review: what a God mode publish can do to a building's inside, each kept right)
const fresh = (): Structure => ({
  version: 4,
  key: "t",
  name: "t",
  home: 0,
  spawn: [0, 0],
  floors: [{ index: 0, name: "ground", z: 0, grid: { x0: 0, y0: 0, w: 20, h: 20 } }],
  slabs: [],
  walls: [],
  rooms: [],
});

test("a restyle with another storey: its stairs laid up to it, its floor open over them; one fewer: none up to it", () => {
  const all = spaceBuildings();
  const first = spacesFix(fresh(), all);
  const st = applyOps(fresh(), first.ops);
  setSpaceFloors(st.floors);
  const e0 = all.find((b) => b.key === "house-e0");
  assert.ok(e0);
  const two = { ...e0, style: "colonial" };
  assert.equal(storeysOf(e0).length, 1);
  assert.equal(storeysOf(two).length, 2);
  const fix = spacesFix(
    st,
    all.map((b) => (b.key === "house-e0" ? two : b)),
  );
  const r = fix.relaid.find((q) => q.key === "house-e0");
  assert.ok(r && r.prefix === "sp-house-e0-stairs-", "its stairs laid again, nothing else of it");
  const after = applyOps(st, fix.ops);
  const [g, up] = floorsOfSpace(after, "house-e0").sort((a, b) => (a.storey ?? 0) - (b.storey ?? 0));
  assert.ok(g && up && !up.away);
  const stairs = r.things.find((o) => o.kind === "stairs");
  assert.equal(stairs?.props?.level, g.index, "up from its ground storey");
  const slab = after.slabs.find((x) => x.floor === up.index && x.id === "sp-house-e0-1");
  assert.equal(slab?.holes.length, 1, "its floor open over them");
  // (and back to one storey: no stairs up to a storey it hasn't)
  setSpaceFloors(after.floors);
  const back = spacesFix(after, all).relaid.find((q) => q.key === "house-e0");
  assert.ok(back);
  assert.deepEqual(back.things, []);
});

test("a storey out of the world while its building moved comes back with it, its stairwell over its stairs", () => {
  const all = spaceBuildings();
  let st = applyOps(fresh(), spacesFix(fresh(), all).ops);
  setSpaceFloors(st.floors);
  const w0 = all.find((b) => b.key === "house-w0");
  assert.ok(w0 && storeysOf(w0).length === 2);
  const step = (b: typeof w0) => {
    const f = spacesFix(
      st,
      all.map((q) => (q.key === "house-w0" ? b : q)),
    );
    st = applyOps(st, f.ops);
    setSpaceFloors(st.floors);
    return f;
  };
  const cape = { ...w0, style: "cape" };
  step(cape);
  const moved = { ...cape, z0: cape.z0 + 20, z1: cape.z1 + 20 };
  step(moved);
  step({ ...moved, style: w0.style });
  const up = floorsOfSpace(st, "house-w0").find((f) => f.storey === 1);
  assert.ok(up && !up.away);
  assert.equal(up.grid.y0, moved.z0, "back where its building is");
  const slab = st.slabs.find((x) => x.floor === up.index && x.id === "sp-house-w0-1");
  assert.ok(slab);
  for (const h of slab.holes)
    for (const [x, y] of h) {
      assert.ok(x >= moved.x0 && x <= moved.x1 && y >= moved.z0 && y <= moved.z1, "its stairwell in its plot");
    }
});

test("a building's key given again to another building: the old inside kept apart, a new one laid", () => {
  const all = spaceBuildings();
  const bar = all.find((b) => b.key === "bar");
  assert.ok(bar);
  let st = applyOps(fresh(), spacesFix(fresh(), all).ops);
  const was = floorsOfSpace(st, "bar").map((f) => f.index);
  // (taken away: out of the world)
  st = applyOps(
    st,
    spacesFix(
      st,
      all.filter((b) => b.key !== "bar"),
    ).ops,
  );
  // (a smaller building given its key)
  const other = { ...bar, x1: bar.x0 + 10, z1: bar.z0 + 8 };
  const fix = spacesFix(
    st,
    all.map((b) => (b.key === "bar" ? other : b)),
  );
  assert.ok(fix.laid.includes("bar"), "a new inside laid");
  assert.ok(
    fix.relaid.some((r) => r.key === "bar" && !r.prefix),
    "the old one's laid things made way for the new",
  );
  const after = applyOps(st, fix.ops);
  const kept = after.floors.filter((f) => was.includes(f.index));
  assert.ok(
    kept.every((f) => f.away && f.space !== "bar"),
    "the old floors kept apart, out of the world",
  );
  const now = floorsOfSpace(after, "bar").filter((f) => !f.away);
  assert.ok(now.length && now.every((f) => !was.includes(f.index) && f.grid.w === 10));
  // (the same building put back — a rollback: its own inside back)
  const st2 = applyOps(fresh(), spacesFix(fresh(), all).ops);
  const gone = applyOps(
    st2,
    spacesFix(
      st2,
      all.filter((b) => b.key !== "bar"),
    ).ops,
  );
  const put = spacesFix(gone, all);
  assert.ok(!put.laid.includes("bar"));
  assert.deepEqual(
    floorsOfSpace(applyOps(gone, put.ops), "bar")
      .map((f) => f.index)
      .sort(),
    floorsOfSpace(st2, "bar")
      .map((f) => f.index)
      .sort(),
  );
});

test("furnished, a building without a layout of its own: plan 112's fits, none in its stairs", () => {
  const st = fresh();
  for (const b of spaceBuildings()) {
    if (FURNISHED_KEYS.has(b.key)) continue;
    const on = { ...b, enter: true };
    const s = laySpace(st, on);
    if (!s) continue;
    const levels = s.floors.map((f) => f.index);
    const lay = layoutFor(on);
    const things = [...s.things, ...furnitureOf(on, lay, levels)];
    const stairs = layoutProblems(on, lay ?? { pieces: [] }, s.floors, s.walls, things).filter((p) =>
      /in the stairs/.test(p),
    );
    assert.deepEqual(stairs, [], b.key);
  }
});

test("a wall no higher than its storey's ceiling, drawn or set (a house's 2.6 m ground storey)", () => {
  const all = spaceBuildings();
  const st = applyOps(fresh(), spacesFix(fresh(), all).ops);
  const g = floorsOfSpace(st, "house-w0").find((f) => f.storey === 0);
  assert.ok(g && (g.ceil ?? 3) < 3.2);
  const at = (h: number) =>
    wallsEdit(
      st,
      g.index,
      [{ a: [g.grid.x0 + 2, g.grid.y0 + 3], b: [g.grid.x0 + 4, g.grid.y0 + 3], front: "p", height: h }],
      [],
      () => "w",
    );
  assert.deepEqual(at(3.2), { why: "not a wall's height" });
  assert.ok("op" in at(2.4));
});
