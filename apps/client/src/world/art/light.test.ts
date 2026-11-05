import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEdges, getMap, levelMap, type MapDef, type WorldObjectDef } from "@yutopia/shared";
import { finishWorld } from "@yutopia/shared/structure/finish";
import { localThing, localView } from "@yutopia/shared/structure/fold";
import { LightMap } from "./light";
import { LightVolume } from "./light-volume";

// Docs/plan/72 phases 8–9 (an edit's cost): a floor's light volume after an edit is made from the one
// before — only the sources whose reach meets what changed added again. It must be the volume made
// afresh.

const studio = getMap("studio");
const done = finishWorld(studio, studio.objects, { fresh: true, building: true });
const lm = levelMap(done.map, 4) as MapDef;
const floor: MapDef = localView(lm);
const things: WorldObjectDef[] = done.objects.filter((o) => (o.props?.level ?? 4) === 4).map((o) => localThing(lm, o));

const same = (a: LightVolume, b: LightVolume, what: string) => {
  let worst = 0;
  for (let i = 0; i < a.data.length; i++) worst = Math.max(worst, Math.abs(a.at(i) - b.at(i)));
  assert.ok(worst < 1e-4, `${what}: off by ${worst}`);
};
const vol = (map: MapDef, objs: WorldObjectDef[], prev?: LightVolume) => new LightVolume(new LightMap(map, objs), prev);

test("an edit's light volume, made from the one before, is the volume made afresh", () => {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  let map = floor;
  let prev = vol(map, things);
  for (let i = 0; i < 25; i++) {
    const dir = rnd() < 0.5 ? "h" : "v";
    const x = Math.floor(rnd() * (map.width - 1));
    const y = Math.floor(rnd() * (map.height - 1));
    const ch = rnd() < 0.5 ? "p" : ".";
    map = applyEdges(map, [{ dir, x, y, ch }]);
    const fresh = vol(map, things);
    const again = vol(map, things, prev);
    same(again, fresh, `edit ${i} (${dir} ${x},${y} ${ch})`);
    prev = again;
  }
});

test("a lamp moved, or a door shut: the same as afresh", () => {
  const before = vol(floor, things);
  const lamp = things.find((o) => /lamp/.test(o.kind));
  assert.ok(lamp, "a lamp on floor 4");
  const moved = things.map((o) => (o === lamp ? { ...o, x: o.x + 3 } : o));
  same(vol(floor, moved, before), vol(floor, moved), "the lamp moved");
  const door = things.find((o) => o.kind.startsWith("door"));
  if (door) {
    const shut = things.map((o) =>
      o === door ? { ...o, props: { ...o.props, state: o.props?.state === "open" ? "closed" : "open" } } : o,
    );
    same(vol(floor, shut, before), vol(floor, shut), "a door the other way");
  }
});
