import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addItem,
  addItemTo,
  addStack,
  carries,
  cleanInventory,
  consume,
  count,
  emptyInventory,
  findStack,
  fits,
  freeQuick,
  giveTorch,
  HAND_SLOT,
  moveSlot,
  organize,
  POCKETS,
  QUICK_SLOT,
  removeSlot,
  STACKS,
  slotAt,
  splitSlot,
  takeSlot,
  takeStack,
  weaponIn,
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
  // (plan 86: the pack's last two pockets full stacks of other things)
  inv.pockets[6] = { id: "cell", n: STACKS.cell };
  inv.pockets[7] = { id: "r762", n: STACKS.r762 };
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
  // one of its kind already in the pack: not a second — its rounds instead
  assert.equal(addItemTo(inv, QUICK_SLOT + 1, { id: "revolver", n: 1, loaded: 3 }), 0);
  assert.equal(inv.quick[1], null);
  assert.equal(count(inv, "r38"), 3);
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

test("(plan 86) the pack's 8 pockets, the quick slots after them", () => {
  assert.equal(POCKETS, 8);
  assert.equal(QUICK_SLOT, 8);
  const inv = emptyInventory();
  assert.equal(inv.pockets.length, 8);
  // (a save of six read as eight, the rest empty)
  const old = cleanInventory({
    quick: [],
    pockets: [{ id: "aid", n: 1 }, null, null, null, null, { id: "fuse", n: 2 }],
  });
  assert.equal(old.pockets.length, 8);
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
    null,
  ]);
  assert.deepEqual(inv.quick[0], { id: "flare", n: 1 });
  assert.equal(organize(inv), false, "in order already");
  assert.equal(count(inv, "r38"), 30);
});

test("(plan 87) the left hand: slot 12 after the quick slots; anything but a weapon; the torch only there or in the pack", () => {
  assert.equal(HAND_SLOT, 12);
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
