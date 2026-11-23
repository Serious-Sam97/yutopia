// Plan 116: a cut part closed where the cut opened it, never where the part was open anyway.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CylinderGeometry } from "three";
import { capCut } from "./capcut";

test("a tube cut out of a closed cylinder gets both its ends closed", () => {
  const whole = new CylinderGeometry(0.05, 0.05, 0.3, 12, 1, false);
  // the cut: the side's triangles alone (its first group), over the same attributes
  const side = whole.groups[0];
  const cut = whole.clone();
  const idx = whole.getIndex();
  assert.ok(idx);
  cut.setIndex(Array.from({ length: side.count }, (_, i) => idx.getX(side.start + i)));
  cut.clearGroups();
  const capped = capCut(cut, whole);
  // two loops of 12 edges: a fan of 12 triangles each
  assert.equal((capped.getIndex()?.count ?? 0) - side.count, 2 * 12 * 3);
  assert.equal(capped.getAttribute("position").count, whole.getAttribute("position").count + 2);
  // (each new vertex at a loop's middle: on the axis, at an end)
  const p = capped.getAttribute("position");
  const ends = [p.count - 2, p.count - 1].map((i) => [p.getX(i), p.getY(i), p.getZ(i)]);
  for (const [x, y, z] of ends) {
    assert.ok(Math.hypot(x, z) < 1e-6, "on the axis");
    assert.ok(Math.abs(Math.abs(y) - 0.15) < 1e-6, "at an end");
  }
});

test("a part open of itself (a sleeve's cuff) is left open", () => {
  const whole = new CylinderGeometry(0.05, 0.05, 0.3, 12, 1, true);
  const capped = capCut(whole.clone(), whole);
  assert.equal(capped.getIndex()?.count, whole.getIndex()?.count);
});

test("the cut's fade: none at the cut, whole 10 cm on, and whole everywhere on a part with no cut", () => {
  const whole = new CylinderGeometry(0.05, 0.05, 0.6, 12, 12, false);
  // the cut: the triangles of its lower half (the bottom's cap too) — one loop opened, at y = 0
  const idx = whole.getIndex();
  assert.ok(idx);
  const p = whole.getAttribute("position");
  const keep: number[] = [];
  for (let t = 0; t < idx.count; t += 3) {
    const v = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
    if (v.every((i) => p.getY(i) <= 1e-6)) keep.push(...v);
  }
  const cut = whole.clone();
  cut.setIndex(keep);
  cut.clearGroups();
  const f = capCut(cut, whole).getAttribute("cutFade");
  assert.ok(f, "a fade");
  const cp = capCut(cut, whole).getAttribute("position");
  let seen5 = 0;
  for (let i = 0; i < p.count; i++) {
    const y = cp.getY(i);
    const r = Math.hypot(cp.getX(i), cp.getZ(i));
    if (r < 0.04) continue;
    if (Math.abs(y) < 1e-6) assert.equal(f.getX(i), 0, "at the cut: none of it");
    if (Math.abs(y + 0.05) < 1e-6) seen5++;
    if (Math.abs(y + 0.05) < 1e-6) assert.ok(f.getX(i) > 0.3 && f.getX(i) < 0.5, `5 cm on: part (${f.getX(i)})`);
    if (y < -0.15) assert.equal(f.getX(i), 1, "far from it: whole");
  }
  assert.ok(seen5 > 0, "a ring 5 cm on");
  const open = new CylinderGeometry(0.05, 0.05, 0.3, 12, 1, true);
  const g = open.clone();
  const nf = capCut(g, open).getAttribute("cutFade");
  assert.ok(nf);
  for (let i = 0; i < nf.count; i++) assert.equal(nf.getX(i), 1);
});
