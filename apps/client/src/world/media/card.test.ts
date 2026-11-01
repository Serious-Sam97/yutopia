import assert from "node:assert/strict";
import { test } from "node:test";
import { onto, type Quad } from "./card";

// YouTube's player taken onto its TV's glass (card.ts `onto`): the W × H box's corners land
// on the quad's, whatever its perspective, and a point inside stays inside.

function apply(css: string, x: number, y: number): [number, number] {
  const m = (css.match(/matrix3d\((.*)\)/)?.[1] ?? "").split(",").map(Number);
  const w = m[3] * x + m[7] * y + m[15];
  return [(m[0] * x + m[4] * y + m[12]) / w, (m[1] * x + m[5] * y + m[13]) / w];
}

const close = (a: [number, number], b: [number, number]) =>
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05, `${a} ≉ ${b}`);

test("the box's corners land on the glass's, flat on or in perspective", () => {
  const quads: Quad[] = [
    [
      [100, 50],
      [740, 50],
      [740, 410],
      [100, 410],
    ],
    // seen from the side: the far edge shorter
    [
      [393, 267],
      [1190, 280],
      [1185, 640],
      [398, 655],
    ],
    [
      [600, 120],
      [980, 210],
      [960, 520],
      [590, 600],
    ],
  ];
  const W = 640;
  const H = 342;
  for (const q of quads) {
    const css = onto(q, W, H);
    close(apply(css, 0, 0), q[0]);
    close(apply(css, W, 0), q[1]);
    close(apply(css, W, H), q[2]);
    close(apply(css, 0, H), q[3]);
    // the middle inside the quad's corners' box
    const [mx, my] = apply(css, W / 2, H / 2);
    assert.ok(mx > Math.min(...q.map((p) => p[0])) && mx < Math.max(...q.map((p) => p[0])));
    assert.ok(my > Math.min(...q.map((p) => p[1])) && my < Math.max(...q.map((p) => p[1])));
  }
});
