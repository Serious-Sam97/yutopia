import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEdges, getMap, levelMap, type MapDef, type WorldObjectDef } from "@yutopia/shared";
import { finishWorld } from "@yutopia/shared/structure/finish";
import { localThing, localView } from "@yutopia/shared/structure/fold";
import { LightMap } from "./light";

// Docs/plan/72 phase 8 (an edit's cost): a floor's light map after an edit is made from the one
// before — only the lamps whose reach meets what changed added again. It must be the light map
// made afresh.

const studio = getMap("studio");
const done = finishWorld(studio, studio.objects, { fresh: true, building: true });
const lm = levelMap(done.map, 4) as MapDef;
const floor: MapDef = localView(lm);
const things: WorldObjectDef[] = done.objects.filter((o) => (o.props?.level ?? 4) === 4).map((o) => localThing(lm, o));

const same = (a: LightMap, b: LightMap, what: string) => {
  let worst = 0;
  for (let i = 0; i < a.light.length; i++) worst = Math.max(worst, Math.abs(a.light[i] - b.light[i]));
  for (let i = 0; i < a.win.length; i++) worst = Math.max(worst, Math.abs(a.win[i] - b.win[i]));
  assert.ok(worst < 1e-4, `${what}: off by ${worst}`);
};

test("an edit's light map, made from the one before, is the light map made afresh", () => {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  let map = floor;
  let prev = new LightMap(map, things);
  for (let i = 0; i < 25; i++) {
    const dir = rnd() < 0.5 ? "h" : "v";
    const x = Math.floor(rnd() * (map.width - 1));
    const y = Math.floor(rnd() * (map.height - 1));
    const ch = rnd() < 0.5 ? "p" : ".";
    map = applyEdges(map, [{ dir, x, y, ch }]);
    const fresh = new LightMap(map, things);
    const again = new LightMap(map, things, prev);
    same(again, fresh, `edit ${i} (${dir} ${x},${y} ${ch})`);
    prev = again;
  }
});

test("a lamp moved, or a door shut: the same as afresh", () => {
  const before = new LightMap(floor, things);
  const lamp = things.find((o) => /lamp/.test(o.kind));
  assert.ok(lamp, "a lamp on floor 4");
  const moved = things.map((o) => (o === lamp ? { ...o, x: o.x + 3 } : o));
  same(new LightMap(floor, moved, before), new LightMap(floor, moved), "the lamp moved");
  const door = things.find((o) => o.kind.startsWith("door"));
  if (door) {
    const shut = things.map((o) =>
      o === door ? { ...o, props: { ...o.props, state: o.props?.state === "open" ? "closed" : "open" } } : o,
    );
    same(new LightMap(floor, shut, before), new LightMap(floor, shut), "a door the other way");
  }
});
