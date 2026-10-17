// The pad in your hands, for walking, looking around and the slot machine's
// lever: of the pads plugged in (the ones the browser maps to the standard
// layout, when there are any), the one whose state moved last. The browser can
// list one pad more than once under the same name (a DualSense over Bluetooth
// on macOS: its HID interfaces, only one of which ever sends anything), so the
// first one listed isn't always the one that's alive.
export const latestPad = (gs: Gamepad[]): Gamepad | null =>
  gs.length > 1 ? gs.reduce((a, b) => ((b.timestamp ?? 0) > (a.timestamp ?? 0) ? b : a)) : (gs[0] ?? null);

export function activePad(): Gamepad | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  const all = [...navigator.getGamepads()].filter((g): g is Gamepad => !!g?.connected);
  const std = all.filter((g) => g.mapping === "standard");
  return latestPad(std.length ? std : all);
}
