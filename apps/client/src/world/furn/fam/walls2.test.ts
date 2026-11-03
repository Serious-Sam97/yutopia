import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, hangSize, ISO_PX } from "@yutopia/shared";
import { kindSolids } from "@yutopia/shared/shapes";
import type { BufferGeometry } from "three";
import type { LivePart } from "../kit";
import { liveAt } from "../liveparts";
import { modelOf } from "../native";
import { calendarPage, LOOKS, worldCities } from "./walls2";

// Plan 68 phase 12 (docs/plan/68-more-furniture.md): On the walls — every kind and look hung on its
// wall's face (z from 0.1), across its footprint, off the floor and under the ceiling, under 8k tris
// counting its glow and live parts; its hang size bracketing it; the cuckoo's pendulum swings, the
// world clocks' seconds hands sweep, the fire alarm's LED blinks; the calendar's page is the date's.

const KINDS = Object.keys(LOOKS);

function bounds(g: BufferGeometry) {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  const take = (p: ArrayLike<number>, dx = 0, dy = 0, dz = 0) => {
    for (let i = 0; i < p.length; i += 3) {
      b.x0 = Math.min(b.x0, p[i] + dx);
      b.x1 = Math.max(b.x1, p[i] + dx);
      b.y0 = Math.min(b.y0, p[i + 1] + dy);
      b.y1 = Math.max(b.y1, p[i + 1] + dy);
      b.z0 = Math.min(b.z0, p[i + 2] + dz);
      b.z1 = Math.max(b.z1, p[i + 2] + dz);
    }
  };
  take(g.attributes.position.array);
  const glow = g.userData.glow as BufferGeometry | null;
  if (glow) take(glow.attributes.position.array);
  for (const l of live(g)) take(l.geo.attributes.position.array, ...l.at);
  return b;
}
const live = (g: BufferGeometry) => (g.userData.live as LivePart[] | undefined) ?? [];
const tris = (g: BufferGeometry) => {
  const glow = g.userData.glow as BufferGeometry | null;
  return (
    (g.attributes.position.count +
      (glow?.attributes.position.count ?? 0) +
      live(g).reduce((n, l) => n + l.geo.attributes.position.count, 0)) /
    3
  );
};
const model = (kind: string, props: Record<string, unknown> = {}, id = `w-${kind}`) =>
  modelOf({ id, kind, x: 0, y: 0, rot: 0, props });

test("on the walls: every look hung on its face, across its footprint, under 8k tris, its hang size round it", () => {
  for (const kind of KINDS) {
    const e = entry(kind);
    assert.ok(e.wall && e.buildable && !e.solid, `${kind}: hung, built`);
    assert.equal(e.variants, LOOKS[kind].length, `${kind}: a look a variant`);
    const [n, lo, hi] = hangSize(kind);
    for (let variant = 0; variant < LOOKS[kind].length; variant++)
      for (const id of ["a", "b", "c", "d", "e", "f"]) {
        const g = model(kind, { variant }, `${kind}-${id}`);
        const b = bounds(g);
        const what = `${kind} ${variant} (${id})`;
        assert.ok(b.x0 >= -0.005 && b.x1 <= e.w + 0.005, `${what}: across ${b.x0.toFixed(3)}..${b.x1.toFixed(3)}`);
        assert.ok(b.z0 >= 0.098 && b.z1 <= 0.36, `${what}: on its wall, out ${b.z0.toFixed(3)}..${b.z1.toFixed(3)}`);
        assert.ok(b.y0 > 0.5 && b.y1 < 3.2, `${what}: up its wall ${b.y0.toFixed(3)}..${b.y1.toFixed(3)}`);
        assert.ok(tris(g) < 8000, `${what}: ${tris(g)} tris`);
        // (its hang size: what the wall's grid keeps free for it)
        assert.ok(
          n * 0.25 >= b.x1 - b.x0 - 0.06 && n <= e.w * 4,
          `${what}: ${n} quarters along for ${(b.x1 - b.x0).toFixed(2)} m`,
        );
        assert.ok(
          lo / ISO_PX <= b.y0 + 0.03 && hi / ISO_PX >= b.y1 - 0.03,
          `${what}: hung ${lo}..${hi} px for ${b.y0.toFixed(2)}..${b.y1.toFixed(2)}`,
        );
      }
    assert.ok(kindSolids({ id: "s", kind, x: 0, y: 0, rot: 0 }).length > 0, `${kind}: shaped`);
  }
});

test("on the walls: the pendulum swings, the seconds sweep, the LED blinks", () => {
  for (let variant = 0; variant < 3; variant++) {
    const p = live(model("cuckoo_clock", { variant })).find((l) => l.anim.kind === "nod");
    assert.ok(p, `cuckoo ${variant}: its pendulum`);
    const a = [0, 0.25, 0.5, 0.75].map((t) => liveAt(p.anim, t).turn[1]);
    assert.ok(Math.max(...a) - Math.min(...a) > 0.2, `cuckoo ${variant}: swinging`);
  }
  // the world clocks: hour, minute and seconds hands on each, each dial in its city's zone
  const hands = live(model("world_clocks")).filter((l) => l.anim.kind === "clock");
  assert.equal(hands.length, 9, "three hands on each of three dials");
  const hours = hands.filter((l) => (l.anim as { period: number }).period === 43200);
  const zones = hours.map((l) => (l.anim as { zone?: number }).zone ?? 0);
  const turn = hours.map((l) => liveAt(l.anim, 0).turn[1]);
  const apart = (((turn[1] - turn[0]) / (Math.PI * 2)) * 12 + (zones[1] - zones[0]) + 48) % 12;
  assert.ok(Math.min(apart, 12 - apart) < 0.01, "the hour hands their zones apart");
  for (let variant = 0; variant < 3; variant++) {
    const led = live(model("fire_alarm", { variant })).find((l) => l.anim.kind === "blink");
    assert.ok(led?.glow, `fire alarm ${variant}: its LED`);
    const on = Array.from({ length: 40 }, (_, k) => liveAt(led.anim, k * 0.1).shown);
    assert.ok(on.includes(true) && on.includes(false), `fire alarm ${variant}: blinking`);
  }
  // the exit sign's always lit; the smart thermostat's ring too
  for (let variant = 0; variant < 2; variant++)
    assert.ok(
      (model("exit_sign", { variant }).userData.glow as BufferGeometry | null)?.attributes.position.count,
      "the exit sign lit",
    );
  assert.ok(
    (model("thermostat", { variant: 0 }).userData.glow as BufferGeometry | null)?.attributes.position.count,
    "the dial lit",
  );
});

test("on the walls: the calendar's page is the date's; the clocks' cities and zones", () => {
  const p = calendarPage(new Date(2026, 10, 3));
  assert.deepEqual(p, { month: 10, day: 3, weekday: 2, first: 0, days: 30 });
  assert.equal(calendarPage(new Date(2028, 1, 29)).days, 29, "a leap February");
  assert.equal(calendarPage(new Date(2026, 1, 10)).first, 0);
  for (const seed of [0.1, 0.9]) {
    const c = worldCities(seed);
    assert.equal(c.length, 3);
    assert.ok(c.every(([name, off]) => name.length <= 8 && Math.abs(off) <= 12));
  }
  // (a story by its seed: the guitars, the pins, the pegboard's missing tool — models apart by id)
  const ids = ["g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8"];
  for (const kind of ["guitar_hooks", "members_map", "pegboard"])
    assert.ok(
      new Set(ids.map((id) => model(kind, { variant: 0 }, id).attributes.position.count)).size > 1,
      `${kind}: seeded`,
    );
});
