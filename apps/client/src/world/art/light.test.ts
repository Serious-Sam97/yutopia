import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEdges, getMap, levelMap, type TileMap, type WorldObjectDef } from "@yutopia/shared";
import { finishWorld } from "@yutopia/shared/structure/finish";
import { localThing, localView } from "@yutopia/shared/structure/fold";
import { LightMap } from "./light";
import { LightVolume } from "./light-volume";

// Docs/plan/72 phases 8–9 (an edit's cost): a floor's light volume after an edit is made from the one
// before — only the sources whose reach meets what changed added again. It must be the volume made
// afresh.

const studio = getMap("studio");
const done = finishWorld(studio, studio.objects, { fresh: true, building: true });
const lm = levelMap(done.map, 4) as TileMap;
const floor: TileMap = localView(lm);
const things: WorldObjectDef[] = done.objects.filter((o) => (o.props?.level ?? 4) === 4).map((o) => localThing(lm, o));

const same = (a: LightVolume, b: LightVolume, what: string) => {
  let worst = 0;
  for (let i = 0; i < a.data.length; i++) worst = Math.max(worst, Math.abs(a.at(i) - b.at(i)));
  assert.ok(worst < 1e-4, `${what}: off by ${worst}`);
};
const vol = (map: TileMap, objs: WorldObjectDef[], prev?: LightVolume) =>
  new LightVolume(new LightMap(map, objs), prev);

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

test("walls drawn free cast the light's shadows (plan 72 phase 11): an open door through them lets it by", () => {
  const f3 = localView(levelMap(done.map, 3) as TileMap);
  const lamp = { x: 20, y: 10, color: 0xffffff, radius: 9, intensity: 1 };
  // a wall at 45° between the lamp and (22, 14)
  const wall = {
    id: "w45",
    pts: [
      [19, 13],
      [23, 11],
    ] as [number, number][],
    ch: "p",
  };
  const bare = new LightMap(f3, []);
  assert.equal(bare.sees(lamp, 22, 14), true, "nothing in the way");
  const walled = new LightMap(f3, [], [wall]);
  assert.equal(walled.sees(lamp, 22, 14), false, "the wall in the way");
  assert.equal(walled.sees(lamp, 21, 10), true, "this side of it");
  // a rail: light goes over it
  assert.equal(new LightMap(f3, [], [{ ...wall, height: 1.1 }]).sees(lamp, 22, 14), true);
  // a door in it where the line crosses (the line from the lamp meets the wall at (21.333, 12.333)):
  // open, the light gets by; shut, not
  const L = Math.hypot(4, 2);
  const at = (Math.hypot(21.333 - 19, 12.333 - 13) / L) * L;
  const door = (state: string): WorldObjectDef => ({
    id: "d",
    kind: "door",
    x: 0,
    y: 0,
    yaw: 0,
    props: { free: true, on: { wall: "w45", at }, state },
  });
  assert.equal(new LightMap(f3, [door("open")], [wall]).sees(lamp, 22, 14), true, "through the open door");
  assert.equal(new LightMap(f3, [door("closed")], [wall]).sees(lamp, 22, 14), false, "a shut one");
});
