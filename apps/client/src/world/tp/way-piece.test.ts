import assert from "node:assert/strict";
import { test } from "node:test";
import { groundsRng, WAYS } from "@yutopia/shared/grounds";
import { SPINE } from "@yutopia/shared/longroad";
import { pieceData, pieceGeometry, sinks, wayGeo, wayPiece } from "./way-piece";

// A district's road piece made off the main thread (docs/plan/91-the-big-map.md phase 3): what a worker sends is
// what the main thread would have made.

const long = WAYS.find((w) => w.key === "long-road");
// a piece of the long road 2 km on, in its district (512 m squares), the rest's circle far off
const [px, pz] = SPINE[1400];
const at = { x0: Math.floor(px / 32) * 32, z0: Math.floor(pz / 32) * 32, x1: 0, z1: 0 };
at.x1 = at.x0 + 32;
at.z1 = at.z0 + 32;
const D = { x0: Math.floor(px / 512) * 512, z0: Math.floor(pz / 512) * 512 };
const own = { ...D, x1: D.x0 + 512, z1: D.z0 + 512, skip: { cx: 0, cz: 0, r: 900 } };

test("a long road piece: its asphalt, its lines, its banks", () => {
  assert.ok(long, "the long road");
  const slots = wayPiece(long, at, own).map((s) => s.slot);
  assert.ok(slots.includes("asphalt"), slots.join());
  assert.ok(slots.includes("banks"), slots.join());
  // (from the piece's corner: a few tens of metres, not kilometres — plan 91 phase 7)
  for (const { geo } of wayPiece(long, at, own)) {
    const p = geo.getAttribute("position").array as Float32Array;
    for (let i = 0; i < p.length; i += 3)
      assert.ok(Math.abs(p[i]) < 100 && Math.abs(p[i + 2]) < 100, `${p[i]}, ${p[i + 2]}`);
  }
});

test("what a worker sends is the same geometry, its arrays taken as they are", () => {
  assert.ok(long);
  const here = wayPiece(long, at, own);
  const sent = pieceData({ piece: "k", way: long.key, at, own }, 7);
  assert.equal(sent.v, 7);
  assert.deepEqual(
    sent.geos.map((g) => g.slot),
    here.map((h) => h.slot),
  );
  for (const [i, g] of sent.geos.entries()) {
    const geo = pieceGeometry(g);
    for (const name of Object.keys(here[i].geo.attributes)) {
      const a = here[i].geo.getAttribute(name).array as Float32Array;
      const b = geo.getAttribute(name).array as Float32Array;
      assert.equal(b.length, a.length, `${g.slot} ${name}`);
      assert.ok(
        a.every((v, k) => v === b[k]),
        `${g.slot} ${name} the same`,
      );
      assert.equal(b, g.attrs.find((x) => x.name === name)?.array, "not copied");
    }
  }
});

test("a piece the way doesn't pass: nothing", () => {
  assert.ok(long);
  const far = { x0: -100000, z0: -100000, x1: -99968, z1: -99968 };
  assert.deepEqual(wayPiece(long, far, own), []);
});

// docs/plan/122: a way of the rest made again behind what's shown, made whole by a worker for the rest's circle — the
// same as the main thread's (Grounds3.ways), from the way's own corner.
test("the rest's way made whole: the main thread's, moved to its corner", () => {
  const w = WAYS.find((u) => u.key !== "long-road" && u.line.length > 40) ?? WAYS[0];
  const xs = w.line.map((p) => p[0]);
  const zs = w.line.map((p) => p[1]);
  const box = { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) };
  const circle = { cx: (box.x0 + box.x1) / 2, cz: (box.z0 + box.z1) / 2, r: 400 };
  const s = sinks();
  const { asphalt, lines } = wayGeo(
    w,
    (x, z, pad = 0) => Math.hypot(x - circle.cx, z - circle.cz) < circle.r + pad,
    null,
    groundsRng(77 + WAYS.indexOf(w)),
    s,
  );
  const main: Record<string, number[]> = {};
  for (const [k, g] of Object.entries({ asphalt, lines, ...s }))
    if (!g.empty) main[k] = Array.from(g.build().getAttribute("position").array);
  const made = wayPiece(w, box, { circle });
  assert.deepEqual(made.map((m) => m.slot).sort(), Object.keys(main).sort());
  for (const { slot, geo } of made) {
    const p = geo.getAttribute("position").array as Float32Array;
    const q = main[slot];
    assert.equal(p.length, q.length, slot);
    for (let i = 0; i < p.length; i += 3) {
      assert.ok(Math.abs(p[i] + box.x0 - q[i]) < 1e-3, `${slot} x ${i}`);
      assert.ok(Math.abs(p[i + 1] - q[i + 1]) < 1e-6, `${slot} y ${i}`);
      assert.ok(Math.abs(p[i + 2] + box.z0 - q[i + 2]) < 1e-3, `${slot} z ${i}`);
    }
  }
});
