import assert from "node:assert/strict";
import { test } from "node:test";
import { anchoredAt, applyEdits, BUILDINGS, CHUNK, checkEdits, groundSurfaceAt, terrainAt } from "./grounds.ts";
import { LandStroke, PaintStroke, slopeIssues } from "./grounds-brush.ts";
import { type GroundsEdits, NO_EDITS } from "./grounds-edits.ts";

// God mode's land and paint brushes (docs/plan/53-the-god-mode.md, phase 6): each changes what it
// says, only within the brush, never on what's anchored, seamless across a chunk's edge, and what
// it makes passes the rule book.

// the farm's open field (no road, no building: the land as generated), on a chunk's edge (x 416)
const FIELD = { x: 13 * CHUNK, z: -238.5 };
const lay = (e: GroundsEdits) => {
  applyEdits(e);
  return e;
};

test("raise: up in the middle, nothing past its edge, seamless across the chunks, by the rules", () => {
  lay(NO_EDITS);
  const was = terrainAt(FIELD.x, FIELD.z);
  const far = terrainAt(FIELD.x + 20, FIELD.z);
  const s = new LandStroke(NO_EDITS, "raise", 24, 50, FIELD);
  for (let i = 0; i < 10; i++) s.apply(FIELD.x, FIELD.z, 0.1);
  const e = lay(s.edits());
  assert.ok(Math.abs(terrainAt(FIELD.x, FIELD.z) - was - 2) < 0.05, `${terrainAt(FIELD.x, FIELD.z) - was} m up`);
  assert.ok(Math.abs(terrainAt(FIELD.x + 20, FIELD.z) - far) < 0.001, "past its edge: as it was");
  for (const dz of [-6, 0, 5]) {
    const l = terrainAt(FIELD.x - 0.01, FIELD.z + dz);
    const r = terrainAt(FIELD.x + 0.01, FIELD.z + dz);
    assert.ok(Math.abs(l - r) < 0.02, `across x 416 at ${dz}: ${l} | ${r}`);
  }
  assert.deepEqual(checkEdits(e), []);
  // inverted (Shift): back down again
  const back = new LandStroke(e, "raise", 24, 50, FIELD);
  for (let i = 0; i < 10; i++) back.apply(FIELD.x, FIELD.z, 0.1, true);
  lay(back.edits());
  assert.ok(Math.abs(terrainAt(FIELD.x, FIELD.z) - was) < 0.05);
  lay(NO_EDITS);
});

test("flatten to the height pressed; a ramp from one height to the other", () => {
  lay(NO_EDITS);
  // a hill, then flattened from its foot: the top comes down to it
  const up = new LandStroke(NO_EDITS, "raise", 20, 100, FIELD);
  for (let i = 0; i < 10; i++) up.apply(FIELD.x, FIELD.z, 0.1);
  const hill = lay(up.edits());
  const foot = { x: FIELD.x + 9, z: FIELD.z };
  const footH = terrainAt(foot.x, foot.z);
  const flat = new LandStroke(hill, "flatten", 30, 100, foot);
  for (let i = 0; i < 40; i++) flat.apply(FIELD.x, FIELD.z, 0.1);
  lay(flat.edits());
  assert.ok(
    Math.abs(terrainAt(FIELD.x, FIELD.z) - footH) < 0.15,
    `flattened to ${footH}: ${terrainAt(FIELD.x, FIELD.z)}`,
  );
  // a ramp: 3 m up a hill made at its far end, then a ramp from the low end to it
  lay(NO_EDITS);
  const A = { x: FIELD.x - 20, z: FIELD.z };
  const B = { x: FIELD.x + 20, z: FIELD.z };
  const top = new LandStroke(NO_EDITS, "raise", 16, 100, B);
  for (let i = 0; i < 8; i++) top.apply(B.x, B.z, 0.1);
  const raised = lay(top.edits());
  const ha = terrainAt(A.x, A.z);
  const hb = terrainAt(B.x, B.z);
  const ramp = new LandStroke(raised, "ramp", 8, 100, A);
  ramp.apply(FIELD.x, FIELD.z, 0.1); // (dragged half way…)
  ramp.apply(B.x, B.z, 0.1); // (…then all the way: made again from the start)
  lay(ramp.edits());
  const mid = terrainAt(FIELD.x, FIELD.z);
  assert.ok(Math.abs(mid - (ha + hb) / 2) < 0.2, `half way up: ${mid} (${ha} → ${hb})`);
  lay(NO_EDITS);
});

test("nothing on what's anchored: a brush over the HQ's site lifts only round it", () => {
  lay(NO_EDITS);
  // (the campus's site ends at x −60: the brush across that edge)
  const at = { x: -60, z: 0 };
  assert.ok(anchoredAt(at.x + 1, at.z) && !anchoredAt(at.x - 1, at.z), "the campus's west edge");
  const inside = terrainAt(at.x + 8, at.z);
  const outside = terrainAt(at.x - 8, at.z);
  const s = new LandStroke(NO_EDITS, "raise", 64, 100, at);
  for (let i = 0; i < 5; i++) s.apply(at.x, at.z, 0.1);
  const e = lay(s.edits());
  assert.deepEqual(checkEdits(e), [], "by the rules");
  assert.equal(terrainAt(at.x + 8, at.z), inside, "inside the campus: as it was");
  assert.ok(terrainAt(at.x - 8, at.z) - outside > 1, `outside: up ${terrainAt(at.x - 8, at.z) - outside} m`);
  lay(NO_EDITS);
});

test("paint: a path along the way it went, and back as generated", () => {
  lay(NO_EDITS);
  const was = groundSurfaceAt(FIELD.x + 5.5, FIELD.z);
  const p = new PaintStroke(NO_EDITS, "path", 3);
  p.apply(FIELD.x, FIELD.z);
  p.apply(FIELD.x + 12, FIELD.z); // (a long step: dabbed all along it)
  const e = lay(p.edits());
  for (const dx of [0.5, 5.5, 11.5]) assert.equal(groundSurfaceAt(FIELD.x + dx, FIELD.z), "path");
  assert.deepEqual(checkEdits(e), []);
  const g = new PaintStroke(e, "generated", 6);
  g.apply(FIELD.x + 6, FIELD.z);
  g.apply(FIELD.x + 6, FIELD.z);
  lay(g.edits());
  assert.equal(groundSurfaceAt(FIELD.x + 5.5, FIELD.z), was);
  lay(NO_EDITS);
});

test("what stands on it: a building's plot tipped by half a stroke is said; one lifted whole isn't", () => {
  lay(NO_EDITS);
  const b = BUILDINGS.find((d) => d.kind === "house" && !anchoredAt((d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2));
  assert.ok(b, "a house anywhere not anchored");
  const corner = { x: b.x0, z: b.z0 };
  const tip = new LandStroke(NO_EDITS, "raise", 10, 100, corner);
  for (let i = 0; i < 5; i++) tip.apply(corner.x, corner.z, 0.1);
  const tipped = tip.edits();
  assert.ok(
    slopeIssues(NO_EDITS, tipped).some((s) => s.startsWith(b.name)),
    slopeIssues(NO_EDITS, tipped).join("; "),
  );
  const mid = { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 };
  const whole = new LandStroke(NO_EDITS, "raise", 64, 100, mid);
  whole.apply(mid.x, mid.z, 0.02);
  assert.ok(!slopeIssues(NO_EDITS, whole.edits()).some((s) => s.startsWith(b.name)));
  lay(NO_EDITS);
});

test("a brush held a long time is a smooth hill: no steps where a frame's bit is under a centimetre", async () => {
  const { terrainAt, applyEdits } = await import("./grounds.ts");
  applyEdits(NO_EDITS);
  const s = new LandStroke(NO_EDITS, "raise", 24, 40, FIELD);
  for (let i = 0; i < 90; i++) s.apply(FIELD.x, FIELD.z, 1 / 60);
  applyEdits(s.edits());
  // along a radius, half a metre a step: never more than a few cm between neighbours
  let worst = 0;
  for (let d = 0; d < 12; d += 0.5) {
    const a = terrainAt(FIELD.x + d, FIELD.z) - terrainAt(FIELD.x + 30, FIELD.z);
    const b = terrainAt(FIELD.x + d + 0.5, FIELD.z) - terrainAt(FIELD.x + 30, FIELD.z);
    worst = Math.max(worst, Math.abs(a - b));
  }
  assert.ok(worst < 0.15, `a step of ${worst} m`);
  applyEdits(NO_EDITS);
});
