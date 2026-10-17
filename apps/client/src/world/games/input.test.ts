import assert from "node:assert/strict";
import { test } from "node:test";

// Your pad's bindings (input.ts): the defaults, rebinding, sticks, the dead
// zone, the stick as a d-pad, hints, families — with a fake gamepad and storage.
const pad = {
  id: "Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)",
  index: 0,
  connected: true,
  mapping: "standard",
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
};
let listed: unknown[] = [pad]; // (what the browser lists: vpad.ts keeps the first getGamepads it sees)
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { getGamepads: () => listed } });
const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
});
const press = (i: number, on = true) => {
  pad.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 };
};
const clear = () => {
  for (let i = 0; i < pad.buttons.length; i++) press(i, false);
  pad.axes = [0, 0, 0, 0];
};

test("bindings: defaults, rebinding, sticks, dead zone, the stick as a d-pad, names", async () => {
  const io = await import("./input.ts");
  const none = new Set<string>();
  // the disc console's defaults: bottom = ✕ (b), the sticks are sticks
  press(0);
  assert.equal(io.readPad("ps1", none).bits, io.bit("b"));
  clear();
  pad.axes = [1, -1, 0, 0.1];
  assert.deepEqual(io.readPad("ps1", none).sticks, [127, -127, 0, 0]); // (0.1: inside the dead zone)
  pad.axes = [0.6, 0, 0, 0];
  assert.equal(io.readPad("ps1", none).sticks[0], Math.round(((0.6 - 0.2) / 0.8) * 127)); // rescaled past it
  // keys, and keys for a stick (I J K L: the right one)
  clear();
  assert.equal(io.readPad("ps1", new Set(["KeyX", "KeyQ"])).bits, io.bit("b") | io.bit("l"));
  assert.deepEqual(io.readPad("ps1", new Set(["KeyJ"])).sticks, [0, 0, -127, 0]);

  // ✕ moved to the top button: the bottom one does nothing now
  io.bind("ps1", "buttons", "3", "b");
  press(3);
  assert.equal(io.readPad("ps1", none).bits, io.bit("b"));
  clear();
  press(0);
  assert.equal(io.readPad("ps1", none).bits, 0);
  clear();
  // and a key bound to something else leaves what it did
  io.bind("ps1", "keys", "KeyX", "a");
  assert.equal(io.readPad("ps1", new Set(["KeyX"])).bits, io.bit("a"));
  assert.ok(JSON.parse(store.get("yutopia:pads") ?? "{}").per.ps1, "kept for this device");
  io.resetBinding("ps1");
  assert.equal(io.readPad("ps1", new Set(["KeyX"])).bits, io.bit("b"));

  // a console without sticks: the left stick moves the d-pad (unless turned off)
  pad.axes = [-0.9, 0.9, 0, 0];
  assert.equal(io.readPad("snes", none).bits, io.bit("left") | io.bit("down"));
  io.setPadPrefs({ dpadStick: false });
  assert.equal(io.readPad("snes", none).bits, 0);
  io.setPadPrefs({ dpadStick: true, deadzone: 0.95 });
  pad.axes = [0.9, 0, 0, 0];
  assert.deepEqual(io.readPad("ps1", none).sticks, [0, 0, 0, 0]); // (a big dead zone)
  io.setPadPrefs({ deadzone: 0.2 });
  clear();
  // the 16-bit consoles' own layouts: A B C on the black one
  press(2);
  assert.equal(io.readPad("md", none).bits, io.bit("y"));
  clear();

  // names: the console's, the pad's family, the hints from the bindings
  assert.equal(io.padFamily(pad.id), "playstation");
  assert.equal(io.padFamily("Xbox Wireless Controller (Vendor: 045e)"), "xbox");
  assert.equal(io.buttonName("playstation", 0), "✕");
  assert.equal(io.buttonName("xbox", 0), "A");
  assert.equal(io.controlName("ps1", "y"), "□");
  assert.ok(io.keyHints("ps1").some(([k, label]) => k === "X" && label === "✕"));
  io.bind("ps1", "keys", "KeyP", "b");
  assert.ok(io.keyHints("ps1").some(([k, label]) => k === "P" && label === "✕"));
  // the pad you picked, when it's there
  io.setPadPrefs({ device: "something else" });
  assert.equal(io.myGamepad()?.id, pad.id);
});

test("a PlayStation pad the browser can't map: its DirectInput order, the hat d-pad, picking the pad", async () => {
  const io = await import("./input.ts");
  io.setPadPrefs({ per: {}, device: "", deadzone: 0.2, dpadStick: true });
  const none = new Set<string>();
  // (as Firefox can show a DualSense: no standard mapping, a hat switch on axis 9)
  pad.id = "54c-ce6-DualSense Wireless Controller";
  pad.mapping = "";
  pad.axes = [0, 0, 0, -1, -1, 0, 0, 0, 0, 1.2857];
  assert.equal(io.layoutOf(pad as unknown as Gamepad), "ps-dinput");
  press(1); // ✕ is button 1 there
  assert.equal(io.readPad("ps1", none).bits, io.bit("b"));
  press(1, false);
  press(0); // □
  assert.equal(io.readPad("ps1", none).bits, io.bit("y"));
  press(0, false);
  assert.equal(io.readPad("ps1", none).bits, 0, "the hat at rest and the triggers' axes press nothing");
  assert.deepEqual(io.readPad("ps1", none).sticks, [0, 0, 0, 0]);
  pad.axes[9] = -1; // up
  assert.equal(io.readPad("ps1", none).bits, io.bit("up"));
  pad.axes[9] = -0.4286; // right
  assert.equal(io.readPad("snes", none).bits, io.bit("right"));
  pad.axes[9] = 1; // up-left
  assert.equal(io.readPad("ps1", none).bits, io.bit("up") | io.bit("left"));
  pad.axes = [0, 0, 0.9, -1, -1, -0.9, 0, 0, 0, 1.2857]; // the right stick is axes 2 and 5
  assert.deepEqual(io.readPad("ps1", none).sticks.slice(2), [111, -111]);
  assert.equal(io.buttonName("playstation", 1, "ps-dinput"), "✕");
  // with a standard-mapped pad there too, that one's played (not the first listed)
  const other = { ...pad, id: "Some Touchpad", index: 1, mapping: "", buttons: pad.buttons.slice(0, 2) };
  const std = { ...pad, id: "DualSense (STANDARD GAMEPAD)", index: 2, mapping: "standard" };
  listed = [other, std];
  assert.equal(io.myGamepad()?.id, "DualSense (STANDARD GAMEPAD)");
  // one pad listed twice under one name (macOS, Bluetooth: one of them never
  // moves): the one whose state moved last, picked or not
  const silent = { ...std, index: 0, timestamp: 100, buttons: pad.buttons.map(() => ({ pressed: false, value: 0 })) };
  const live = { ...std, index: 1, timestamp: 900, buttons: pad.buttons.map(() => ({ pressed: false, value: 0 })) };
  live.buttons[0] = { pressed: true, value: 1 }; // (✕, standard)
  listed = [silent, live];
  assert.equal(io.myGamepad()?.index, 1);
  io.setPadPrefs({ device: std.id });
  assert.equal(io.myGamepad()?.index, 1);
  assert.equal(io.readPad("ps1", none).bits, io.bit("b"));
});
