import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Vector3 } from "three";
import { actFaults, type Fault } from "./act-faults";
import { actAt, type Doorway, ENTER_S, EXIT_S, newActPose } from "./getin";

// Plan 100: the get-in act through every door of every vehicle the world parks (measured in the game:
// e2e/car-ways.mts → ways.fixture.json), in and out, at every moment — none of the bench's faults. (A seat far behind
// its door — a pickup's bed, a snowcat's back cabin — is climbed into: no door act, not here.)

type Raw = {
  s: number;
  op: Doorway["op"];
  hip: [number, number, number];
  floor: number;
  stand: number;
  satHip: number;
  satFeet: [number, number, number][];
  k: number;
  driver: boolean;
  belt: number | null;
};
const ways = JSON.parse(readFileSync(new URL("./ways.fixture.json", import.meta.url), "utf8")) as Record<string, Raw>;
const v = (a: [number, number, number]) => new Vector3(a[0], a[1], a[2]);
const wayOf = (r: Raw): Doorway => ({
  s: r.s,
  op: r.op,
  hip: v(r.hip),
  floor: r.floor,
  stand: r.stand,
  satHip: r.satHip,
  satFeet: [v(r.satFeet[0]), v(r.satFeet[1])],
  k: r.k,
  driver: r.driver,
  belt: r.belt ?? undefined,
});

/** Every fault of a whole act through a doorway (in from where the walk ends: the door's stance). */
export function faultsOf(d: Doorway, leaving: boolean): Fault[] {
  const p = newActPose();
  const all: Fault[] = [];
  const len = leaving ? EXIT_S : ENTER_S;
  for (let t = 0; t <= len + 1e-6; t += 0.02) {
    actAt(d, t, leaving, null, null, p);
    all.push(...actFaults(d, p, +t.toFixed(2)));
  }
  return all;
}

const summary = (fs: Fault[]) => {
  const by = new Map<string, { n: number; most: number; t0: number; t1: number }>();
  for (const f of fs) {
    const k = `${f.what} (${f.part})`;
    const b = by.get(k) ?? { n: 0, most: 0, t0: f.t, t1: f.t };
    b.n++;
    b.most = Math.max(b.most, f.by);
    b.t1 = f.t;
    by.set(k, b);
  }
  return [...by].map(([k, b]) => `${k} ×${b.n} up to ${b.most.toFixed(3)} m, ${b.t0}–${b.t1} s`);
};

for (const [name, raw] of Object.entries(ways).filter(([, r]) => r.hip[0] <= r.op.x1 + 0.4))
  for (const leaving of [false, true])
    test(`plan 100: ${name} ${leaving ? "out" : "in"} — no faults`, () => {
      const fs = faultsOf(wayOf(raw), leaving);
      assert.deepEqual(summary(fs), []);
    });
