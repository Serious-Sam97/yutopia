// A facing (0..7, from the shared dirFromDelta: 0 = screen-down, clockwise)
// to the drawn view: five are drawn (S, SW, W, NW, N), the other three are
// their mirrors.
export type View = "S" | "SW" | "W" | "NW" | "N";
const VIEW_FOR_DIR: [View, boolean][] = [
  ["S", false],
  ["SW", false],
  ["W", false],
  ["NW", false],
  ["N", false],
  ["NW", true],
  ["W", true],
  ["SW", true],
];

export function viewFor(dir: number): { view: View; mirror: boolean } {
  const [view, mirror] = VIEW_FOR_DIR[((dir % 8) + 8) % 8];
  return { view, mirror };
}
