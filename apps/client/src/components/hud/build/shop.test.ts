import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, FAM_KINDS } from "@yutopia/shared";
import { BUILD_PARTS, buildShelf, FUNCS, ROOMS, roomSubs, SHOP, shopShelf } from "./shop.ts";

// (plan 124, phase 4) the catalog sorted twice, as The Sims 3's Buy mode: nothing left out
test("every thing in the shop has a function and its subcategory, and a room — or is the Build tab's", () => {
  const subs = new Map(FUNCS.map((f) => [f.key, f.subs]));
  for (const i of SHOP) {
    if (i.build) {
      assert.equal(i.func, null, `${i.key}: the Build tab's`);
      continue;
    }
    assert.ok(i.func, `${i.key} has a function`);
    assert.ok(subs.get(i.func)?.includes(i.sub), `${i.key}: ${i.func} has the subcategory ${i.sub}`);
    assert.ok(i.rooms.length > 0, `${i.key} goes in a room`);
  }
});

test("every family's piece is in the shop, once", () => {
  const keys = SHOP.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length, "no thing twice");
  for (const k of Object.values(FAM_KINDS).flat()) assert.ok(keys.includes(k), `${k} is in the shop`);
});

test("every room, function and subcategory has things; each face is a kind", () => {
  for (const r of ROOMS) {
    assert.ok(shopShelf("room", r.key).length > 0, `${r.key} has things`);
    assert.ok(roomSubs(r.key).length > 0);
    assert.ok(entry(r.face), r.face);
  }
  for (const f of FUNCS) {
    assert.ok(entry(f.face), f.face);
    for (const s of f.subs) assert.ok(shopShelf("func", f.key, s).length > 0, `${f.key}/${s} has things`);
  }
  for (const p of BUILD_PARTS) assert.ok(buildShelf(p.key).length > 0, `${p.key} has things`);
  assert.deepEqual(
    buildShelf("stairs").map((i) => i.kind),
    ["stairs", "flight", "elevator"],
  );
});
