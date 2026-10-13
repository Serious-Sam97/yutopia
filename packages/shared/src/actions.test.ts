import assert from "node:assert/strict";
import { test } from "node:test";
import { type ActionContext, objectActions, socialFor } from "./actions.ts";

const ctx: ActionContext = { uid: 7, focus: false, mayLock: () => false, radioOn: false, task: null };
const o = (kind: string, props: Record<string, unknown> = {}) => ({ id: "x", kind, x: 0, y: 0, props });

test("what a thing offers: the first is what X does", () => {
  assert.deepEqual(objectActions(o("coffee_machine"), ctx), ["brew"]);
  assert.deepEqual(objectActions(o("piano"), ctx), ["play", "tune"]);
  assert.deepEqual(objectActions(o("slot_track"), ctx), ["race"]);
  assert.deepEqual(objectActions(o("chair"), ctx), ["sit"]);
  assert.deepEqual(objectActions(o("lamp"), ctx), ["lightOff"]);
  assert.deepEqual(objectActions(o("lamp", { on: false }), ctx), ["lightOn"]);
  assert.deepEqual(objectActions(o("tabletop", { d: "desklamp", on: false }), ctx), ["lightOn"]);
  assert.deepEqual(objectActions(o("light_switch"), ctx), ["roomLightsOff"]);
  assert.deepEqual(objectActions(o("radio"), { ...ctx, radioOn: true }), ["musicOff", "open"]);
  assert.deepEqual(objectActions(o("board_wall"), ctx), ["open"]);
  assert.deepEqual(objectActions(o("plant"), ctx), []);
});

test("doors: only the room's owner (or a builder) locks", () => {
  assert.deepEqual(objectActions(o("door"), ctx), ["doorClose"]);
  assert.deepEqual(objectActions(o("door", { state: "closed" }), { ...ctx, mayLock: () => true }), [
    "doorOpen",
    "doorLock",
  ]);
  assert.deepEqual(objectActions(o("door", { state: "locked" }), ctx), []);
  assert.deepEqual(objectActions(o("door", { state: "locked" }), { ...ctx, mayLock: () => true }), ["doorUnlock"]);
});

test("my own desk: focus, work, my card", () => {
  assert.deepEqual(objectActions(o("desk", { ownerId: 9 }), ctx), []);
  assert.deepEqual(objectActions(o("desk", { ownerId: 7 }), ctx), ["focus", "work"]);
  assert.deepEqual(objectActions(o("desk", { ownerId: 7 }), { ...ctx, focus: true, task: { ticket: "YON-1" } }), [
    "unfocus",
    "work",
    "openCard",
  ]);
});

test("between people: what's on offer depends on the drinks and do-not-disturb", () => {
  const free = { held: "", status: "online" };
  const mug = { held: "mug", status: "online" };
  assert.deepEqual(socialFor(free, free), ["wave", "highfive", "fistbump"]);
  assert.deepEqual(socialFor(mug, free), ["wave", "highfive", "fistbump", "give"]);
  assert.deepEqual(socialFor(mug, mug), ["wave", "highfive", "fistbump", "cheers"]);
  assert.deepEqual(socialFor(mug, { held: "", status: "dnd" }), ["wave"]);
});
