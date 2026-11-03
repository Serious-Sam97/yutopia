import assert from "node:assert/strict";
import { test } from "node:test";
import { canPlace } from "./build.ts";
import { entry, placedFootprint, type WorldObjectDef } from "./catalog.ts";
import { studio as STUDIO } from "./maps/studio.ts";
import { furnishedIn, furnishRoom, isRoomPlan, planFor, ROOM_PLANS, refurnished, refurnishFloor } from "./office.ts";
import { hostOf } from "./tops.ts";

// Plan 67 phase 10: a room furnished by plan fits it — every piece inside the room, put down where
// the placement rule allows, clear of its doors — and a whole floor by what its rooms are called.
test("each plan furnishes a room: inside it, where things can go, clear of its doors", () => {
  const map = STUDIO;
  for (const key of ["war-room", "lounge", "lobby", "tracking", "booth-3"]) {
    const a = map.areas.find((x) => x.key === key);
    assert.ok(a, key);
    const keep = map.objects.filter((o) => !furnishedIn(map.objects, a, map).includes(o));
    for (const { key: plan } of ROOM_PLANS) {
      const add = furnishRoom(plan, a, map, keep);
      const what = `${key} as ${plan}`;
      if (a.w >= 10 && a.h >= 8) assert.ok(add.length >= 6, `${what}: ${add.length} pieces`);
      for (const o of add) {
        const { w, h } = placedFootprint(o);
        assert.ok(
          o.x >= a.x && o.y >= a.y && o.x + w <= a.x + a.w && o.y + h <= a.y + a.h,
          `${what}: ${o.kind} inside`,
        );
      }
      // (each where it can go among what stays: furnishRoom checked them against each other as it
      // put them down; a counter's own cupboard, split from it, shares its tile)
      for (const o of add.filter((o) => o.props?.z === undefined))
        assert.ok(canPlace(map, keep, o), `${what}: ${o.kind} at ${o.x},${o.y}`);
    }
  }
});

test("a floor refurnished by what its rooms are called, its corners and corridors left alone", () => {
  assert.equal(planFor({ name: "War Room", key: "war-room" }), "meeting");
  assert.equal(planFor({ name: "Lounge", key: "lounge" }), "lounge");
  assert.equal(planFor({ name: "Lobby", key: "lobby" }), "reception");
  assert.equal(planFor({ name: "Booth 2", key: "booth-2" }), "booths");
  assert.equal(planFor({ name: "Tracking Room", key: "tracking" }), "open_plan");
  assert.ok(isRoomPlan("kitchen") && !isRoomPlan("ballroom"));
  const rooms = refurnishFloor(STUDIO, STUDIO.objects);
  const keys = rooms.map((r) => r.area.key);
  for (const k of ["standup", "stage", "server-room", "hall"]) assert.ok(!keys.includes(k), `${k} left alone`);
  assert.ok(STUDIO.areas.filter(refurnished).length === rooms.length);
  for (const r of rooms) assert.ok(r.add.length > 0, `${r.area.key}: furnished (${r.plan})`);
  // ids unique across the floor
  const ids = rooms.flatMap((r) => r.add.map((o) => o.id));
  assert.equal(new Set(ids).size, ids.length);
});

// (the review's: seats at a table's ends turned to it; what stands on a removed top goes with it;
// someone's own desk stays)
test("seats face what they're at; a top's things go with it; an owned desk stays", () => {
  const map = STUDIO;
  const facing = (rot: number) =>
    [
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 0],
    ][rot & 3];
  for (const [key, plan, seat, at] of [
    ["war-room", "meeting", "chair", "meeting_table"],
    ["lounge", "lounge", "armchair", "coffee_table"],
    ["live-room", "kitchen", "bar_stool", "high_table"],
  ] as const) {
    const a = map.areas.find((x) => x.key === key);
    assert.ok(a);
    const keep = map.objects.filter((o) => !furnishedIn(map.objects, a, map).includes(o));
    const add = furnishRoom(plan, a, map, keep);
    const tables = add.filter((o) => o.kind === at);
    for (const s of add.filter((o) => o.kind === seat)) {
      const t = tables.reduce((b, o) => (Math.hypot(o.x - s.x, o.y - s.y) < Math.hypot(b.x - s.x, b.y - s.y) ? o : b));
      const tw = placedFootprint(t);
      const [fx, fy] = facing(s.rot ?? 0);
      const dx = t.x + tw.w / 2 - (s.x + 0.5);
      const dy = t.y + tw.h / 2 - (s.y + 0.5);
      assert.ok(fx * dx + fy * dy > 0, `${key}: the ${seat} at ${s.x},${s.y} (rot ${s.rot}) faces its ${at}`);
    }
  }
  const lounge = map.areas.find((x) => x.key === "lounge");
  assert.ok(lounge);
  const out = furnishedIn(map.objects, lounge, map);
  const gone = new Set(out.map((o) => o.id));
  for (const o of map.objects)
    if (entry(o.kind).onSurface && !gone.has(o.id)) {
      const h = hostOf(map.objects, o);
      assert.ok(!h || !gone.has(h.id), `${o.id} left floating`);
    }
  const owned = {
    ...map.objects.find((o) => o.id === "seat-3-5-a"),
    props: { desk: true, ownerId: 7 },
  } as WorldObjectDef;
  const tracking = map.areas.find((x) => x.key === "tracking");
  assert.ok(tracking);
  const objs = map.objects.map((o) => (o.id === owned.id ? owned : o));
  assert.ok(!furnishedIn(objs, tracking, map).some((o) => o.id === owned.id), "an owned seat stays");
});
