import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addItem,
  addItemAt,
  addItemTo,
  addStack,
  addWeapon,
  carries,
  caseCells,
  cleanInventory,
  consume,
  count,
  emptyInventory,
  findStack,
  fits,
  fitsAt,
  freeQuick,
  giveTorch,
  HAND_SLOT,
  type Item,
  moveSlot,
  organize,
  POCKETS,
  placeSlot,
  QUICK_SLOT,
  removeSlot,
  STACKS,
  type StackId,
  slotAt,
  splitSlot,
  takeSlot,
  takeStack,
  torchToHand,
  weaponIn,
} from "./inventory.ts";
import { BOARDS_MAX, rackNear } from "./skate/racks.ts";
import { BOARD_ITEMS, BOARD_VARIANTS, boardItem, isBoardItem, variantOfItem } from "./skate/spec.ts";

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
  // (plan 86: the pack's other pockets full stacks of other things — plan 125: as many as there are)
  for (let i = 6; i < POCKETS; i++) inv.pockets[i] = { id: "cell", n: STACKS.cell };
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
  assert.equal(count(inv, "r38"), 0, "and its rounds in it (plan 125: told 0, the caller leaves them there)");
  assert.deepEqual(addWeapon(inv, { id: "revolver", loaded: 4 }), { id: "revolver", loaded: 0 }, "a search's");
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
  assert.deepEqual(inv.pockets, [
    { id: "r38", n: STACKS.r38 },
    null,
    null,
    null,
    { id: "fuse", n: 2 },
    ...Array(POCKETS - 5).fill(null),
  ]);
  assert.deepEqual(inv.pages, ["p-1", "p-2"]);
  assert.deepEqual(
    cleanInventory({
      quick: [null, { id: "aid", n: 9 }, { id: "laser", n: 1 }, { id: "shotgun", loaded: 2 }, { id: "fuse", n: 1 }],
    }).quick,
    [null, { id: "aid", n: 2 }, null, { id: "shotgun", loaded: 2 }],
  );
  assert.deepEqual(cleanInventory(null), emptyInventory());
  assert.deepEqual(cleanInventory("junk"), emptyInventory());
  // (plan 85) a weapon in the pack kept, loaded no more than it holds; one of a kind with the quick slots
  const pack = cleanInventory({
    quick: [{ id: "revolver", loaded: 3 }],
    pockets: [
      { id: "ak47", loaded: 99 },
      { id: "revolver", loaded: 6 },
      { id: "sniper", loaded: -2 },
      { id: "ak47", loaded: 1 },
    ],
  });
  assert.deepEqual(pack.quick[0], { id: "revolver", loaded: 3 });
  assert.deepEqual(pack.pockets, [
    { id: "ak47", loaded: 30 },
    null,
    { id: "sniper", loaded: 0 },
    ...Array(POCKETS - 3).fill(null),
  ]);
});

test("a drag: a swap, the same stack topped up to its cap, a weapon into a pocket and back", () => {
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
  // an empty one dragged: nothing; out of range
  assert.equal(moveSlot(inv, 3, 4), false);
  inv.quick[0] = { id: "revolver", loaded: 4 };
  assert.equal(moveSlot(inv, 0, HAND_SLOT + 1), false);
  // (plan 85) a weapon into an empty pocket — carried, not equipped — and back
  assert.equal(moveSlot(inv, QUICK_SLOT, 3), true);
  assert.deepEqual(inv.pockets[3], { id: "revolver", loaded: 4 });
  assert.equal(inv.quick[0], null);
  assert.equal(weaponIn(inv, "revolver"), null, "in the pack: not equipped");
  assert.equal(carries(inv, "revolver"), true, "…but carried");
  assert.equal(moveSlot(inv, 3, QUICK_SLOT), true);
  assert.deepEqual(weaponIn(inv, "revolver"), { id: "revolver", loaded: 4 });
  // quick slots swap
  assert.equal(moveSlot(inv, QUICK_SLOT, QUICK_SLOT + 3), true);
  assert.deepEqual(inv.quick, [null, null, null, { id: "revolver", loaded: 4 }]);
  // a stack from a pocket into a quick slot, and back onto the same stack
  assert.equal(moveSlot(inv, 0, QUICK_SLOT), true);
  assert.deepEqual(inv.quick[0], { id: "aid", n: 1 });
  assert.equal(inv.pockets[0], null);
  // (plan 85) a stack in a pocket swapped with a quick slot's weapon: the weapon to the pocket, the stack up
  assert.equal(moveSlot(inv, 1, QUICK_SLOT + 3), true);
  assert.deepEqual(inv.pockets[1], { id: "revolver", loaded: 4 });
  assert.deepEqual(inv.quick[3], { id: "r38", n: 24 });
  assert.equal(moveSlot(inv, QUICK_SLOT + 3, 1), true, "and back");
  assert.deepEqual(inv.quick[3], { id: "revolver", loaded: 4 });
  // two stacks: they swap
  assert.equal(moveSlot(inv, 1, QUICK_SLOT), true);
  assert.deepEqual(inv.pockets[1], { id: "aid", n: 1 });
  assert.deepEqual(slotAt(inv, QUICK_SLOT), { id: "r38", n: 24 });
  // two weapons, one in the pack: they swap
  inv.pockets[4] = { id: "shotgun", loaded: 2 };
  assert.equal(moveSlot(inv, 4, QUICK_SLOT + 3), true);
  assert.deepEqual(inv.quick[3], { id: "shotgun", loaded: 2 });
  assert.deepEqual(inv.pockets[4], { id: "revolver", loaded: 4 });
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
  // (plan 85) a weapon asked into an empty pocket: there, in the pack
  assert.equal(addItemTo(inv, 5, { id: "revolver", n: 1, loaded: 0 }), 1);
  assert.deepEqual(inv.pockets[5], { id: "revolver", loaded: 0 });
  assert.equal(weaponIn(inv, "revolver"), null);
  // …into a full pocket: as addItem would — the first free quick slot
  assert.equal(addItemTo(inv, 4, { id: "ak47", n: 1, loaded: 30 }), 1);
  assert.deepEqual(inv.quick[0], { id: "ak47", loaded: 30 });
  // one of its kind already in the pack: not a second — and (plan 125) its rounds left in it, where it lies
  assert.equal(addItemTo(inv, QUICK_SLOT + 1, { id: "revolver", n: 1, loaded: 3 }), 0);
  assert.equal(inv.quick[1], null);
  assert.equal(count(inv, "r38"), 0);
});

test("(plan 85) a weapon picked up: into a free quick slot, none free into a free pocket, then its rounds only", () => {
  const inv = emptyInventory();
  inv.quick = [
    { id: "aid", n: 1 },
    { id: "fuse", n: 1 },
    { id: "flare", n: 1 },
    { id: "battery", n: 1 },
  ];
  assert.equal(freeQuick(inv), -1);
  assert.equal(addItem(inv, { id: "sniper", n: 1, loaded: 5 }), 1);
  assert.deepEqual(inv.pockets[0], { id: "sniper", loaded: 5 }, "the quick slots full: into the pack");
  assert.equal(carries(inv, "sniper"), true);
  assert.equal(weaponIn(inv, "sniper"), null);
  // one of a kind across both: a second sniper's rounds instead
  assert.equal(addItem(inv, { id: "sniper", n: 1, loaded: 4 }), 0);
  assert.equal(count(inv, "r308"), 0);
  assert.deepEqual(addWeapon(inv, { id: "sniper", loaded: 4 }), { id: "sniper", loaded: 0 });
  assert.equal(count(inv, "r308"), 4);
  assert.equal(inv.pockets.filter((it) => it?.id === "sniper").length, 1);
  // a free quick slot again: the next one goes there
  inv.quick[2] = null;
  assert.equal(freeQuick(inv), QUICK_SLOT + 2);
  assert.equal(addItem(inv, { id: "daybreak", n: 1, loaded: 3 }), 1);
  assert.deepEqual(inv.quick[2], { id: "daybreak", loaded: 3 });
  // everything full: the weapon stays out, its rounds in (here none fit: the pockets are full of other things)
  inv.quick[2] = { id: "flare", n: 1 };
  for (let i = 1; i < POCKETS; i++) inv.pockets[i] = inv.pockets[i] ?? { id: "fuse", n: STACKS.fuse };
  assert.equal(addItem(inv, { id: "shotgun", n: 1, loaded: 2 }), 0);
  assert.equal(carries(inv, "shotgun"), false);
  // stacks never land on a weapon in a pocket, nor are counted from it
  const inv2 = emptyInventory();
  inv2.pockets[0] = { id: "ak47", loaded: 10 };
  assert.equal(addStack(inv2, "r762", 5), 5);
  assert.deepEqual(inv2.pockets[0], { id: "ak47", loaded: 10 });
  assert.deepEqual(inv2.pockets[1], { id: "r762", n: 5 });
  assert.equal(count(inv2, "r762"), 5);
  assert.equal(takeStack(inv2, "r762", 9), 5);
  assert.deepEqual(inv2.pockets[0], { id: "ak47", loaded: 10 });
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

test("(plan 86, 125) the pack's pockets, the quick slots after them", () => {
  assert.equal(POCKETS, 16);
  assert.equal(QUICK_SLOT, POCKETS);
  const inv = emptyInventory();
  assert.equal(inv.pockets.length, POCKETS);
  // (a save of six read as all of them, the rest empty)
  const old = cleanInventory({
    quick: [],
    pockets: [{ id: "aid", n: 1 }, null, null, null, null, { id: "fuse", n: 2 }],
  });
  assert.equal(old.pockets.length, POCKETS);
  assert.deepEqual(old.pockets[5], { id: "fuse", n: 2 });
  assert.equal(old.pockets[7], null);
});

test("(plan 86) some of a stack taken out to drop; a weapon whole", () => {
  const inv = emptyInventory();
  inv.pockets[0] = { id: "shell", n: 6 };
  inv.quick[0] = { id: "revolver", loaded: 4 };
  assert.deepEqual(takeSlot(inv, 0, 1), { id: "shell", n: 1 });
  assert.deepEqual(inv.pockets[0], { id: "shell", n: 5 });
  assert.deepEqual(takeSlot(inv, 0, 9), { id: "shell", n: 5 }, "as many or more: all of it");
  assert.equal(inv.pockets[0], null);
  assert.equal(takeSlot(inv, 0), null, "nothing there");
  assert.deepEqual(takeSlot(inv, QUICK_SLOT, 1), { id: "revolver", loaded: 4 }, "a weapon: whole");
  inv.pockets[1] = { id: "aid", n: 2 };
  assert.equal(takeSlot(inv, 1, 0), null, "none asked: none");
  assert.deepEqual(takeSlot(inv, 1), { id: "aid", n: 2 }, "no count: all of it");
});

test("(plan 86) a stack split: half into an empty slot, some onto the same stack, never past its cap", () => {
  const inv = emptyInventory();
  inv.pockets[0] = { id: "r38", n: 18 };
  assert.equal(splitSlot(inv, 0, 3), 9, "half");
  assert.deepEqual(inv.pockets[0], { id: "r38", n: 9 });
  assert.deepEqual(inv.pockets[3], { id: "r38", n: 9 });
  assert.equal(splitSlot(inv, 0, 3, 4), 4, "onto the same stack");
  assert.deepEqual(inv.pockets[3], { id: "r38", n: 13 });
  inv.pockets[4] = { id: "r38", n: 22 };
  assert.equal(splitSlot(inv, 0, 4, 5), 2, "topped up to its cap");
  assert.deepEqual(inv.pockets[0], { id: "r38", n: 3 });
  inv.pockets[5] = { id: "aid", n: 1 };
  assert.equal(splitSlot(inv, 0, 5), 0, "onto another kind: nothing");
  assert.equal(splitSlot(inv, 5, 6), 0, "one alone: half's none");
  assert.equal(splitSlot(inv, 0, QUICK_SLOT + 2, 3), 3, "into a quick slot, all of it");
  assert.equal(inv.pockets[0], null);
  inv.pockets[7] = { id: "ak47", loaded: 30 };
  assert.equal(splitSlot(inv, 7, 6), 0, "a weapon doesn't split");
});

test("(plan 86) the pack organized: like stacks topped up, weapons first, then rounds, then the rest; the quick slots kept", () => {
  const inv = emptyInventory();
  inv.quick[0] = { id: "flare", n: 1 };
  inv.pockets = [
    { id: "fuse", n: 1 },
    { id: "r38", n: 10 },
    null,
    { id: "ak47", loaded: 12 },
    { id: "r38", n: 20 },
    { id: "aid", n: 1 },
    { id: "shell", n: 3 },
    { id: "revolver", loaded: 6 },
  ];
  assert.equal(organize(inv), true);
  assert.deepEqual(inv.pockets, [
    { id: "revolver", loaded: 6 },
    { id: "ak47", loaded: 12 },
    { id: "r38", n: 24 },
    { id: "r38", n: 6 },
    { id: "shell", n: 3 },
    { id: "aid", n: 1 },
    { id: "fuse", n: 1 },
    ...Array(POCKETS - 7).fill(null),
  ]);
  assert.deepEqual(inv.quick[0], { id: "flare", n: 1 });
  assert.equal(organize(inv), false, "in order already");
  assert.equal(count(inv, "r38"), 30);
});

test("(plan 87) the left hand: slot 12 after the quick slots; anything but a weapon; the torch only there or in the pack", () => {
  assert.equal(HAND_SLOT, POCKETS + 4);
  const inv = emptyInventory();
  assert.equal(inv.hand, null);
  assert.equal(slotAt(inv, HAND_SLOT), null);
  assert.equal(slotAt(inv, HAND_SLOT + 1), undefined);
  assert.equal(fits(HAND_SLOT, "flare"), true);
  assert.equal(fits(HAND_SLOT, "revolver"), false, "a weapon takes both hands");
  assert.equal(fits(QUICK_SLOT, "torch"), false, "the torch lights only from the left hand");
  assert.equal(fits(0, "torch"), true);
  inv.pockets[0] = { id: "flare", n: 2 };
  inv.quick[0] = { id: "revolver", loaded: 6 };
  // the flares into the left hand, and back
  assert.equal(moveSlot(inv, 0, HAND_SLOT), true);
  assert.deepEqual(inv.hand, { id: "flare", n: 2 });
  assert.equal(count(inv, "flare"), 2, "the left hand counts");
  // a weapon won't go in; nor swap into it
  assert.equal(moveSlot(inv, QUICK_SLOT, HAND_SLOT), false);
  assert.equal(moveSlot(inv, HAND_SLOT, QUICK_SLOT), false, "a swap would put the revolver in the left hand");
  assert.deepEqual(inv.quick[0], { id: "revolver", loaded: 6 });
  // a torch: given into the left hand if it's free — here the pack's first free pocket — one only
  assert.equal(giveTorch(inv), true);
  assert.deepEqual(inv.pockets[0], { id: "torch", n: 1 });
  assert.equal(giveTorch(inv), false, "one of a kind");
  assert.equal(addStack(inv, "torch", 1), 0);
  // into a quick slot: refused; into the left hand: swapped with the flares
  assert.equal(moveSlot(inv, 0, QUICK_SLOT + 1), false);
  assert.equal(moveSlot(inv, 0, HAND_SLOT), true);
  assert.deepEqual(inv.hand, { id: "torch", n: 1 });
  assert.deepEqual(inv.pockets[0], { id: "flare", n: 2 });
  // the flares topped up in the pocket, not a new stack in the hand; nothing else lands in the left hand
  inv.hand = null;
  assert.equal(addStack(inv, "aid", 2), 2);
  assert.equal(inv.hand, null);
  assert.equal(findStack(inv, "aid") >= 0 && findStack(inv, "aid") < POCKETS, true);
});

test("(plan 87) picked up: the torch to the left hand first; asked into a quick slot, it goes where it fits", () => {
  const inv = emptyInventory();
  assert.equal(addItem(inv, { id: "torch", n: 1 }), 1);
  assert.deepEqual(inv.hand, { id: "torch", n: 1 });
  assert.equal(addItem(inv, { id: "torch", n: 1 }), 0, "a second: left lying");
  const inv2 = emptyInventory();
  inv2.hand = { id: "aid", n: 1 };
  assert.equal(addItemTo(inv2, QUICK_SLOT + 2, { id: "torch", n: 1 }), 1);
  assert.deepEqual(inv2.pockets[0], { id: "torch", n: 1 }, "the left hand busy: the pack");
  assert.equal(inv2.quick[2], null);
  // a weapon asked into the left hand: where a weapon goes
  const inv3 = emptyInventory();
  assert.equal(addItemTo(inv3, HAND_SLOT, { id: "ak47", n: 1, loaded: 10 }), 1);
  assert.equal(inv3.hand, null);
  assert.deepEqual(inv3.quick[0], { id: "ak47", loaded: 10 });
  // a flare into the left hand, and used from there? (a flare's no use: consume takes aid and battery)
  assert.equal(addItemTo(inv3, HAND_SLOT, { id: "aid", n: 1 }), 1);
  assert.equal(consume(inv3, HAND_SLOT), "aid");
  assert.equal(inv3.hand, null);
});

test("(plan 87) a save cleaned: the left hand kept, no weapon there, one torch, none in a quick slot", () => {
  const inv = cleanInventory({
    hand: { id: "torch", n: 1 },
    quick: [
      { id: "torch", n: 1 },
      { id: "flare", n: 2 },
    ],
    pockets: [
      { id: "torch", n: 1 },
      { id: "aid", n: 1 },
    ],
  });
  assert.deepEqual(inv.hand, { id: "torch", n: 1 });
  assert.equal(count(inv, "torch"), 1);
  assert.equal(inv.quick[0], null);
  assert.deepEqual(inv.quick[1], { id: "flare", n: 2 });
  assert.equal(inv.pockets[0], null);
  assert.equal(cleanInventory({ hand: { id: "revolver", loaded: 6 } }).hand, null);
  // a torch only in a quick slot: to the left hand
  assert.deepEqual(cleanInventory({ quick: [{ id: "torch", n: 1 }] }).hand, { id: "torch", n: 1 });
  // an old save (no hand): none
  assert.equal(cleanInventory({ quick: [], pockets: [] }).hand, null);
});

test("(plan 87) the torch to the left hand (an admin's refill): given if none, the hand's thing swapped to where it was", () => {
  const inv = emptyInventory();
  inv.hand = { id: "flare", n: 2 };
  assert.equal(torchToHand(inv), true);
  assert.deepEqual(inv.hand, { id: "torch", n: 1 });
  assert.deepEqual(inv.pockets[0], { id: "flare", n: 2 }, "the flares where the torch was given");
  // in the pack already: swapped in
  const inv2 = emptyInventory();
  inv2.pockets[3] = { id: "torch", n: 1 };
  inv2.hand = { id: "aid", n: 1 };
  assert.equal(torchToHand(inv2), true);
  assert.deepEqual(inv2.pockets[3], { id: "aid", n: 1 });
  assert.equal(count(inv2, "torch"), 1);
  // in the hand already: as it was
  assert.equal(torchToHand(inv2), true);
});

test("(plan 103) the boards are items: one to a slot, in the pack, at hand or the left hand — saved, organized last", () => {
  for (const id of BOARD_ITEMS) assert.equal(STACKS[id as StackId], 1, id);
  assert.equal(Object.keys(STACKS).filter(isBoardItem).length, BOARD_VARIANTS.length);
  for (const v of BOARD_VARIANTS) assert.equal(variantOfItem(boardItem(v)), v);
  const id = "board_street_pop" as StackId;
  assert.ok(fits(HAND_SLOT, id) && fits(QUICK_SLOT, id) && fits(0, id));
  const inv = emptyInventory();
  // (two of a kind: a slot each, never the left hand by addStack)
  assert.equal(addStack(inv, id, 2), 2);
  assert.deepEqual(inv.pockets.slice(0, 2), [
    { id, n: 1 },
    { id, n: 1 },
  ]);
  assert.equal(inv.hand, null);
  assert.equal(moveSlot(inv, 1, HAND_SLOT), true);
  assert.deepEqual(inv.hand, { id, n: 1 });
  // (no stacking two in one slot: the same board onto it is no move)
  assert.equal(moveSlot(inv, 0, HAND_SLOT), false);
  assert.equal(count(inv, id), 2);
  // a save's round trip keeps it in the left hand
  const back = cleanInventory(JSON.parse(JSON.stringify(inv)));
  assert.deepEqual(back.hand, { id, n: 1 });
  inv.pockets[2] = { id: "aid", n: 1 };
  organize(inv);
  assert.deepEqual(inv.pockets.map((it) => it?.id ?? null).filter(Boolean), ["aid", id]);
});

test("(plan 103) a rack's reach: across and up, the nearest in 3 m; two boards the most", () => {
  const racks = [
    { id: "a", x: 10, y: 0, z: 20, yaw: 0 },
    { id: "b", x: 12, y: 0, z: 20, yaw: 0 },
  ];
  assert.equal(rackNear(11.8, 20.5, 0, racks)?.id, "b");
  assert.equal(rackNear(10, 23.5, 0, racks), null);
  assert.equal(rackNear(10, 20, 3.5, racks), null, "a floor up");
  assert.equal(rackNear(0, 0, 0), null, "none placed yet");
  assert.equal(BOARDS_MAX, 2);
});

// ── (plan 125) Ana's Case: every thing its size in a 10 × 7 case ──
test("(plan 125) the case: things take room by their size; no room, none taken", () => {
  const inv = emptyInventory();
  assert.equal(addItem(inv, { id: "ak47", n: 1, loaded: 30 }), 1);
  assert.equal(addItem(inv, { id: "daybreak", n: 1, loaded: 3 }), 1);
  assert.deepEqual(inv.place?.[QUICK_SLOT], [0, 0, 0], "the first where it fits");
  // 6×3 and 6×3 stacked: an 8×2 sniper fits nowhere (nor turned: 2×8 is taller than the case)
  assert.equal(addItem(inv, { id: "sniper", n: 1, loaded: 5 }), 0, "no room: not taken");
  assert.equal(count(inv, "r308"), 0, "nor its rounds (they stay in it)");
  // a revolver (3×2) fits beside them
  assert.equal(addItem(inv, { id: "revolver", n: 1, loaded: 6 }), 1);
  const g = caseCells(inv);
  assert.equal(g.filter(Boolean).length, 18 + 18 + 6);
});

test("(plan 125) a thing moved or turned in the case: only where it fits", () => {
  const inv = emptyInventory();
  addItem(inv, { id: "shotgun", n: 1, loaded: 2 });
  addStack(inv, "aid", 1);
  const gun = QUICK_SLOT;
  const aid = findStack(inv, "aid");
  assert.deepEqual(inv.place?.[gun], [0, 0, 0]);
  assert.equal(placeSlot(inv, aid, [3, 1, 0]), false, "over the shotgun");
  assert.equal(placeSlot(inv, aid, [8, 5, 0]), true);
  // the shotgun turned (2×7) at the left fits; out of the case it doesn't
  assert.equal(placeSlot(inv, gun, [0, 0, 1]), true);
  assert.equal(placeSlot(inv, gun, [9, 0, 1]), false);
  // swapped to another hand: it keeps its place
  const where = inv.place?.[aid];
  assert.equal(moveSlot(inv, aid, HAND_SLOT), true);
  assert.deepEqual(inv.place?.[HAND_SLOT], where);
  assert.equal(inv.place?.[aid], undefined);
});

test("(plan 125 F14a) something found laid where it was put", () => {
  const inv = emptyInventory();
  assert.equal(addItemAt(inv, { id: "flare", n: 3 }, [5, 4, 1]), 3);
  const at = findStack(inv, "flare");
  assert.deepEqual(inv.place?.[at], [5, 4, 1]);
  // not where it doesn't fit: where addItem puts it
  assert.equal(addItemAt(inv, { id: "aid", n: 1 }, [5, 4, 0]), 1);
  assert.notDeepEqual(inv.place?.[findStack(inv, "aid")], [5, 4, 0]);
});

test("(plan 125 F17a) an old pack into the case: places kept, the rest placed, what has no room to the stash", () => {
  const inv = cleanInventory({
    quick: [
      { id: "ak47", loaded: 10 },
      { id: "daybreak", loaded: 1 },
      { id: "shotgun", loaded: 2 },
    ],
    pockets: [
      { id: "sniper", loaded: 5 },
      { id: "aid", n: 2 },
    ],
    place: { [QUICK_SLOT + 2]: [3, 5, 0] },
  });
  assert.deepEqual(inv.place?.[QUICK_SLOT + 2], [3, 5, 0], "kept where it lay");
  // everything carried has a place, none over another (caseCells counts each cell once)
  for (const [k, p] of Object.entries(inv.place ?? {})) assert.ok(p, `slot ${k} placed`);
  assert.ok(caseCells(inv).filter(Boolean).length > 0);
  assert.ok((inv.stash ?? []).length >= 1, "what had no room went to the stash");
  assert.ok(
    (inv.stash ?? []).every((it) => !inv.pockets.includes(it) && !inv.quick.includes(it)),
    "the stash's things aren't carried too",
  );
});

test("(plan 125) no room for a gun: it stays out whole — its rounds not taken (else told 0, they'd be in both)", () => {
  const inv = emptyInventory();
  // the case full of fuses (1 × 1 boxes: 16 pockets) and the quick slots taken
  for (let i = 0; i < POCKETS; i++) addItemTo(inv, i, { id: "fuse", n: STACKS.fuse });
  inv.quick = [
    { id: "flare", n: 1 },
    { id: "flare", n: 1 },
    { id: "flare", n: 1 },
    { id: "flare", n: 1 },
  ];
  assert.equal(addItem(inv, { id: "revolver", n: 1, loaded: 6 }), 0);
  assert.equal(count(inv, "r38"), 0);
});

test("(plan 125) Organize never loses a thing: if packing again leaves one out, the case stays as it was", () => {
  const inv = emptyInventory();
  // two boards (6 × 2) and a shotgun (5 × 1), laid so they all fit — the repack, biggest first, may not
  inv.pockets[0] = { id: "board_street_pop", n: 1 };
  inv.pockets[1] = { id: "board_street_pop", n: 1 };
  inv.pockets[2] = { id: "shotgun", loaded: 0 };
  inv.place = { 0: [0, 0, 0], 1: [0, 2, 0], 2: [0, 4, 0] };
  const before = JSON.stringify({ p: inv.pockets, pl: inv.place });
  organize(inv);
  const all = [...inv.pockets, ...inv.quick, inv.hand].filter(Boolean).length;
  assert.equal(all, 3, "nothing gone");
  assert.equal((inv.stash ?? []).length, 0, "nothing sent home");
  if (JSON.stringify({ p: inv.pockets, pl: inv.place }) !== before)
    for (const [k, p] of Object.entries(inv.place ?? {}))
      assert.ok(fitsAt(inv, (slotAt(inv, Number(k)) as Item).id, p, Number(k)));
});

test("(plan 125) laid where it was put: the torch too; a stack tops up its boxes first", () => {
  const inv = emptyInventory();
  assert.equal(addItemAt(inv, { id: "torch", n: 1 }, [0, 6, 0]), 1);
  assert.deepEqual(inv.place?.[HAND_SLOT], [0, 6, 0]);
  addItemAt(inv, { id: "r38", n: 10 }, [5, 0, 0]);
  const boxes = () => inv.pockets.filter((it) => it?.id === "r38").length;
  assert.equal(boxes(), 1);
  assert.equal(addItemAt(inv, { id: "r38", n: 6 }, [8, 3, 0]), 6);
  assert.equal(boxes(), 1, "topped up, no new box");
  assert.equal(count(inv, "r38"), 16);
});

test("(plan 125) a bad place past the case's edge doesn't wrap into the next row", () => {
  const inv = emptyInventory();
  inv.pockets[0] = { id: "shotgun", loaded: 0 };
  inv.place = { 0: [8, 0, 0] }; // (5 wide at x 8: past the edge)
  const g = caseCells(inv);
  assert.equal(g[1 * 10 + 0], 0, "row 1 untouched");
});
