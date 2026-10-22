import assert from "node:assert/strict";
import { test } from "node:test";
import { groundAt, groundsRng, WAYS, type Way } from "@yutopia/shared/grounds";
import { G } from "./campus";
import { streetCorners, wayDressing } from "./roads3d";
import { wobble } from "./snow3d";

// The ways' dressing stays by its way: a street's slush, kerbs and snow, a road's verges, each
// within its carriageway and pavements of its line (a ragged edge eased off a negative distance
// once flung Main Street's gutter slush a hundred tiles across the county road).

const nearLine = (u: Way, x: number, z: number) => {
  let b = Number.POSITIVE_INFINITY;
  for (const p of u.line) b = Math.min(b, Math.hypot(p[0] - x, p[1] - z));
  return b;
};
const ctx = { near: () => true, yAt: (_w: Way, _i: number, x: number, z: number) => groundAt(x, z) };

test("a ragged edge stays in −1..1 either side of its start", () => {
  const w = wobble(groundsRng(7), 3.1);
  for (let t = -60; t <= 60; t += 0.37) assert.ok(Math.abs(w(t)) <= 1, `wobble(${t}) = ${w(t)}`);
});

test("every way's dressing lies along it", () => {
  for (const w of WAYS) {
    if (w.kind === "trail" || w.kind === "walk") continue;
    const gs = { paint: new G(), slabs: new G(), lines: new G(), banks: new G() };
    wayDressing(w, ctx, nearLine, gs.paint, gs.slabs, gs.lines);
    streetCorners(w, ctx, nearLine, gs.banks);
    const reach = w.w / 2 + w.pave + 4;
    for (const [name, g] of Object.entries(gs)) {
      if (g.empty) continue;
      const p = g.build().getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        const d = nearLine(w, p.getX(i), p.getZ(i));
        assert.ok(d < reach, `${w.key} ${name}: a vertex ${d.toFixed(1)} tiles off its line`);
      }
    }
  }
});
