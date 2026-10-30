import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorldObjectDef } from "@yutopia/shared";
import { type TargetHost, Targets } from "./targets";

// The focus (docs/plan/56-the-controls.md C): what's in front of me, near, wins; behind me only
// what's right by me; the one I had holds on a little; [ ] cycles the stack; out of reach, gone.

const map = <T>(o: Record<string, T>) => new Map(Object.entries(o));
function host(o: {
  players?: Record<string, { x: number; y: number; level?: number; name?: string }>;
  pets?: Record<string, { x: number; y: number; floor?: number; level?: number }>;
  objects?: WorldObjectDef[];
  facing?: number;
}): TargetHost {
  return {
    room: {
      sessionId: "me",
      state: {
        players: map({ me: { x: 0, y: 0, level: 0, name: "Me" }, ...(o.players ?? {}) }),
        pets: map(
          Object.fromEntries(
            Object.entries(o.pets ?? {}).map(([k, p]) => [k, { alive: true, name: k, floor: 0, level: 3, ...p }]),
          ),
        ),
        npcs: new Map(),
        toys: new Map(),
      },
    },
    level: 0,
    me: () => ({ x: 0, y: 0 }),
    facing: () => o.facing ?? 0,
    camYaw: () => o.facing ?? 0,
    objects: () => o.objects ?? [],
    reach: (ob) => Math.hypot(ob.x + 0.5, ob.y + 0.5),
    cable: () => false,
    inLift: () => false,
    menuFor: (t) => (t.type === "person" ? { title: "", items: [{ act: "wave", ok: true }] } : null),
  };
}

test("ahead and near wins; behind me only right by me", () => {
  const t = new Targets(
    host({
      players: {
        ahead: { x: 1.5, y: 0.2, name: "Ahead" },
        behind: { x: -1.5, y: 0, name: "Behind" },
        aside: { x: 0.2, y: 1.6, name: "Aside" },
      },
    }),
  );
  t.update();
  assert.equal(t.focus?.key, "p:ahead");
  assert.ok(!t.list.some((x) => x.key === "p:behind"), "behind me, not right by me: out");
  assert.equal(t.focus?.act, "wave");
});

test("the one I had holds on a little; [ ] cycles; out of reach it's gone", () => {
  const h = host({ players: { a: { x: 1.5, y: 0.1 }, b: { x: 1.45, y: -0.4 } } });
  const t = new Targets(h);
  t.update();
  const first = t.focus?.key;
  assert.ok(first);
  t.update();
  assert.equal(t.focus?.key, first, "no flicker");
  t.cycle(1);
  assert.notEqual(t.focus?.key, first);
  t.cycle(1);
  assert.equal(t.focus?.key, first, "round the stack");
  const far = new Targets(host({ players: { far: { x: 5, y: 0 } } }));
  far.update();
  assert.equal(far.focus, null);
});

test("a pet by its floor (its `level` is how far it's come on), not on another floor", () => {
  const on = new Targets(host({ pets: { rex: { x: 1.2, y: 0, floor: 0, level: 5 } } }));
  on.update();
  assert.equal(on.focus?.key, "pet:rex");
  const up = new Targets(host({ pets: { rex: { x: 1.2, y: 0, floor: 2, level: 0 } } }));
  up.update();
  assert.equal(up.focus, null);
});
