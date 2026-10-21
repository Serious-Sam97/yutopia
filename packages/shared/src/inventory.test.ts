import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addItem,
  addItemTo,
  addStack,
  cleanInventory,
  consume,
  count,
  emptyInventory,
  findStack,
  moveSlot,
  QUICK_SLOT,
  removeSlot,
  STACKS,
  slotAt,
  takeStack,
} from "./inventory.ts";

test("stacks top up first, then take empty pockets; what doesn't fit stays out", () => {
  const inv = emptyInventory();
  assert.equal(addStack(inv, "r38", 30), 30);
  assert.deepEqual(inv.pockets.slice(0, 2), [
    { id: "r38", n: 24 },
    { id: "r38", n: 6 },
  ]);
  assert.equal(addStack(inv, "r38", 10), 10);
  assert.deepEqual(inv.pockets[1], { id: "r38", n: 16 });
  for (const id of ["flare", "aid", "battery", "fuse"] as const) addStack(inv, id, 1);
  assert.equal(inv.pockets.filter(Boolean).length, 6);
  assert.equal(addStack(inv, "shell", 4), 4, "the pockets full: into a quick slot");
  assert.deepEqual(inv.quick[0], { id: "shell", n: 4 });
  inv.quick[1] = { id: "fuse", n: 1 };
  inv.quick[2] = { id: "fuse", n: 1 };
  inv.quick[3] = { id: "fuse", n: 1 };
  assert.equal(addStack(inv, "aid", 4), 1, "everything full: the aid pocket takes one more");
  assert.equal(addStack(inv, "flare", 5), 2, "the flares' pocket takes two more (3 a pocket)");
  assert.equal(count(inv, "r38"), 40);
  assert.equal(takeStack(inv, "r38", 20), 20);
  assert.equal(count(inv, "r38"), 20);
  assert.equal(inv.pockets.filter((s) => s?.id === "r38").length, 1, "the smaller stack went first");
});

test("weapons: one of a kind, in the quick slots; a second gives its rounds; dropping one frees the slot", () => {
  const inv = emptyInventory();
  assert.equal(addItem(inv, { id: "revolver", n: 1, loaded: 6 }), 1);
  assert.deepEqual(inv.quick[0], { id: "revolver", loaded: 6 });
  assert.equal(addItem(inv, { id: "revolver", n: 1, loaded: 4 }), 0, "the gun stays where it was");
  assert.equal(count(inv, "r38"), 4, "its rounds came along");
  assert.equal(addItem(inv, { id: "shotgun", n: 1, loaded: 9 }), 1);
  assert.deepEqual(inv.quick[1], { id: "shotgun", loaded: 2 }, "loaded no more than it holds");
  assert.deepEqual(removeSlot(inv, QUICK_SLOT), { id: "revolver", loaded: 6 });
  assert.equal(inv.quick[0], null);
  assert.equal(addItem(inv, { id: "revolver", n: 1, loaded: 0 }), 1);
  assert.equal(removeSlot(inv, 99), null);
});

test("using one: only what's usable, the pocket emptied at the last", () => {
  const inv = emptyInventory();
  addStack(inv, "aid", 2);
  addStack(inv, "r38", 3);
  assert.equal(consume(inv, 1, ["aid", "battery"]), null);
  assert.equal(consume(inv, 0, ["aid", "battery"]), "aid");
  assert.equal(consume(inv, 0, ["aid", "battery"]), "aid");
  assert.equal(inv.pockets[0], null);
  assert.equal(consume(inv, 0, ["aid"]), null);
  // from a quick slot too, by default only what's usable
  inv.quick[2] = { id: "battery", n: 1 };
  inv.quick[3] = { id: "flare", n: 1 };
  assert.equal(consume(inv, QUICK_SLOT + 3), null);
  assert.equal(findStack(inv, "battery"), QUICK_SLOT + 2);
  assert.equal(consume(inv, QUICK_SLOT + 2), "battery");
  assert.equal(inv.quick[2], null);
});

test("cleanInventory: unknown ids gone, counts capped, one weapon a kind, pages sane", () => {
  const inv = cleanInventory({
    weapons: [
      { id: "revolver", loaded: 99 },
      { id: "revolver", loaded: 2 },
      { id: "shotgun", loaded: 1 },
    ],
    pockets: [{ id: "r38", n: 500 }, { id: "laser", n: 1 }, null, { id: "aid", n: -3 }, { id: "fuse", n: 2.7 }],
    pages: ["p-1", "p-1", "BAD PAGE", 7, "p-2"],
  });
  // (an old save's two weapons: the first two quick slots)
  assert.deepEqual(inv.quick, [{ id: "revolver", loaded: 6 }, null, { id: "shotgun", loaded: 1 }, null]);
  assert.deepEqual(inv.pockets, [{ id: "r38", n: STACKS.r38 }, null, null, null, { id: "fuse", n: 2 }, null]);
  assert.deepEqual(inv.pages, ["p-1", "p-2"]);
  assert.deepEqual(
    cleanInventory({
      quick: [null, { id: "aid", n: 9 }, { id: "laser", n: 1 }, { id: "shotgun", loaded: 2 }, { id: "fuse", n: 1 }],
    }).quick,
    [null, { id: "aid", n: 2 }, null, { id: "shotgun", loaded: 2 }],
  );
  assert.deepEqual(cleanInventory(null), emptyInventory());
  assert.deepEqual(cleanInventory("junk"), emptyInventory());
});

test("a drag: a swap, the same stack topped up to its cap, a weapon only ever in a quick slot", () => {
  const inv = emptyInventory();
  inv.pockets[0] = { id: "r38", n: 20 };
  inv.pockets[1] = { id: "aid", n: 1 };
  inv.pockets[2] = { id: "r38", n: 10 };
  // a different stack: they swap
  assert.equal(moveSlot(inv, 0, 1), true);
  assert.deepEqual(inv.pockets.slice(0, 2), [
    { id: "aid", n: 1 },
    { id: "r38", n: 20 },
  ]);
  // the same: topped up to 24, the rest stays
  assert.equal(moveSlot(inv, 2, 1), true);
  assert.deepEqual(inv.pockets[1], { id: "r38", n: 24 });
  assert.deepEqual(inv.pockets[2], { id: "r38", n: 6 });
  // full already: nothing
  assert.equal(moveSlot(inv, 2, 1), false);
  // into an empty pocket
  assert.equal(moveSlot(inv, 2, 5), true);
  assert.equal(inv.pockets[2], null);
  assert.deepEqual(inv.pockets[5], { id: "r38", n: 6 });
  // an empty one dragged: nothing; a weapon into a pocket: no; out of range
  assert.equal(moveSlot(inv, 3, 4), false);
  inv.quick[0] = { id: "revolver", loaded: 4 };
  assert.equal(moveSlot(inv, QUICK_SLOT, 3), false);
  assert.equal(moveSlot(inv, 0, 10), false);
  // quick slots swap
  assert.equal(moveSlot(inv, QUICK_SLOT, QUICK_SLOT + 3), true);
  assert.deepEqual(inv.quick, [null, null, null, { id: "revolver", loaded: 4 }]);
  // a stack from a pocket into a quick slot, and back onto the same stack
  assert.equal(moveSlot(inv, 0, QUICK_SLOT), true);
  assert.deepEqual(inv.quick[0], { id: "aid", n: 1 });
  assert.equal(inv.pockets[0], null);
  // a stack in a pocket swapped with a quick slot's weapon: the weapon would land in a pocket
  assert.equal(moveSlot(inv, 1, QUICK_SLOT + 3), false);
  assert.equal(moveSlot(inv, QUICK_SLOT + 3, 1), false);
  // two stacks: they swap
  assert.equal(moveSlot(inv, 1, QUICK_SLOT), true);
  assert.deepEqual(inv.pockets[1], { id: "aid", n: 1 });
  assert.deepEqual(slotAt(inv, QUICK_SLOT), { id: "r38", n: 24 });
});

test("taken into a chosen pocket first, the rest where it fits", () => {
  const inv = emptyInventory();
  inv.pockets[0] = { id: "shell", n: 2 };
  // into the empty pocket 4, not on top of pocket 0
  assert.equal(addItemTo(inv, 4, { id: "shell", n: 5 }), 5);
  assert.deepEqual(inv.pockets[4], { id: "shell", n: 5 });
  assert.deepEqual(inv.pockets[0], { id: "shell", n: 2 });
  // a pocket with something else in it: as addItem would
  assert.equal(addItemTo(inv, 4, { id: "flare", n: 1 }), 1);
  assert.deepEqual(inv.pockets[1], { id: "flare", n: 1 });
  // the same stack nearly full: topped up there, the rest elsewhere
  inv.pockets[4] = { id: "shell", n: 11 };
  assert.equal(addItemTo(inv, 4, { id: "shell", n: 3 }), 3);
  assert.equal(inv.pockets[4]?.n, 12);
  assert.equal(inv.pockets[0]?.n, 4);
  // a weapon into the chosen quick slot; a stack into one too
  assert.equal(addItemTo(inv, QUICK_SLOT + 2, { id: "shotgun", n: 1, loaded: 2 }), 1);
  assert.deepEqual(inv.quick, [null, null, { id: "shotgun", loaded: 2 }, null]);
  assert.equal(addItemTo(inv, QUICK_SLOT + 3, { id: "aid", n: 1 }), 1);
  assert.deepEqual(inv.quick[3], { id: "aid", n: 1 });
  // a weapon asked into a pocket: the first free quick slot
  assert.equal(addItemTo(inv, 5, { id: "revolver", n: 1, loaded: 0 }), 1);
  assert.deepEqual(inv.quick[0], { id: "revolver", loaded: 0 });
});

test("ammo in a quick slot counts and is taken", () => {
  const inv = emptyInventory();
  inv.quick[1] = { id: "r38", n: 5 };
  inv.pockets[2] = { id: "r38", n: 10 };
  assert.equal(count(inv, "r38"), 15);
  assert.equal(takeStack(inv, "r38", 7), 7);
  assert.equal(inv.quick[1], null, "the smaller went first");
  assert.deepEqual(inv.pockets[2], { id: "r38", n: 8 });
});
