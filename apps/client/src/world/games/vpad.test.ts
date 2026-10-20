import assert from "node:assert/strict";
import { test } from "node:test";

// The virtual pads (vpad.ts) while a console runs: the page reading the pad in
// your hands (the walker, every frame) gets the real one and leaves the core's
// pulse (the disc console's analog switch) for the core's next read.
const real = {
  id: "Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)",
  index: 0,
  connected: true,
  mapping: "standard",
  timestamp: 0,
  axes: [-1, -1, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
};
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { getGamepads: () => [real] } });
Object.defineProperty(globalThis, "window", { configurable: true, value: { dispatchEvent: () => true } });

test("a pulse waits for the core: the page's reads see the real pads", async () => {
  const vp = await import("./vpad.ts");
  const { activePad } = await import("../pads.ts");
  const unplug = vp.installVirtualPads(2);
  const combo = (1 << vp.STD.l) | (1 << vp.STD.r) | (1 << vp.STD.l3);
  vp.pulseVirtualPad(1, combo);
  // the world's frame comes first: the pad in my hands, not the core's
  assert.equal(activePad()?.id, real.id);
  assert.equal(vp.realGamepads()[0]?.id, real.id);
  // then the core's: the combo, for that one read
  const held = (pads: (Gamepad | null)[]) =>
    pads[0]?.buttons.reduce((n, b, i) => (b.pressed ? n | (1 << i) : n), 0) ?? -1;
  assert.equal(held(navigator.getGamepads()), combo);
  assert.equal(held(navigator.getGamepads()), 0);
  unplug();
  assert.equal(navigator.getGamepads()[0]?.id, real.id);
});
