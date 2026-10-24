import assert from "node:assert/strict";
import { test } from "node:test";
import { GROUND_OFFSET } from "./building.ts";
import { entry } from "./catalog.ts";
import { bayById, bayId, boardOf, lotLayout } from "./lot.ts";
import { BOARD_KIND, bayAt, boardObject, boardOfOwner, boardsOf, cantClaim, postOf } from "./spot.ts";

// Someone's own bay (docs/plan/43-the-spot.md): the board object stands where the lot says, on the
// ground floor; standing in a plain free bay claims it, nothing else does.

const off = GROUND_OFFSET;

test("the board object: its post where boardOf puts it, on the ground floor, facing its bay", () => {
  const l = lotLayout();
  for (const b of l.bays) {
    const o = boardObject(l, b, { id: 7, name: "Ana Demo" }, off);
    assert.equal(o.kind, BOARD_KIND);
    assert.equal(o.id, `bay-${bayId(b)}`);
    assert.equal(o.props?.level, 0);
    const p = postOf(o, off);
    const w = boardOf(l, b);
    assert.ok(Math.abs(p.x - w.x) < 0.002 && Math.abs(p.z - w.z) < 0.002, `${bayId(b)}'s post`);
    // its tile is the post's
    assert.ok(Number(o.props?.ox) >= 0 && Number(o.props?.ox) < 1);
    assert.ok(Number(o.props?.oy) >= 0 && Number(o.props?.oy) < 1);
    // its face looks into the bay
    assert.ok((b.x - p.x) * Number(o.props?.face) > 0);
    assert.equal(!!o.props?.half, b.row === "mid-w" || b.row === "mid-e");
    assert.equal(!!o.props?.back, b.row === "e");
  }
  assert.ok(entry(BOARD_KIND).solid);
});

test("claiming: in a free plain bay, not a marked one, not someone else's, not from afar", () => {
  const l = lotLayout();
  const d5 = bayById(l, "d-05");
  const visitor = l.bays.find((b) => b.kind === "visitor");
  assert.ok(d5 && visitor);
  assert.equal(bayAt(l, d5.x, d5.z), d5);
  assert.equal(bayAt(l, l.aisles[1], 20), null, "an aisle is no bay");
  assert.equal(cantClaim(l, [], "d-05", 7, d5.x, d5.z), null);
  assert.equal(cantClaim(l, [], "d-05", 7, d5.x, d5.z + 4), "far");
  // (from its open end, a step into the aisle: a bay with a car in it; not two)
  const open = d5.x + d5.dir * (l.bayL / 2 + 1);
  assert.equal(cantClaim(l, [], "d-05", 7, open, d5.z), null);
  assert.equal(cantClaim(l, [], "d-05", 7, open + d5.dir, d5.z), "far");
  assert.equal(cantClaim(l, [], bayId(visitor), 7, visitor.x, visitor.z), "kind");
  assert.equal(cantClaim(l, [], "d-00", 7, d5.x, d5.z), "gone");
  const mine = boardObject(l, d5, { id: 7, name: "Ana" }, off);
  assert.equal(cantClaim(l, [mine], "d-05", 7, d5.x, d5.z), "yours");
  assert.equal(cantClaim(l, [mine], "d-05", 8, d5.x, d5.z), "taken");
  assert.equal(boardsOf([mine]).get("d-05"), mine);
  assert.equal(boardOfOwner([mine], 7), mine);
  assert.equal(boardOfOwner([mine], 8), null);
});
