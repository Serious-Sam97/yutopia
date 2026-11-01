import assert from "node:assert/strict";
import { test } from "node:test";
import { Color, PerspectiveCamera } from "three";
import { type GlassQuad, type Live, LiveSurfaces } from "./live";

// A glass a real player shows through (YouTube's iframe under the canvas): while it's in
// sight it's a clear hole in the frame and the player is told where it is on the page; behind
// me, off the screen, or for a photo of the frame, it has its picture back and the player is
// told it isn't there.

// (no DOM here: live.ts only asks whether a source is a video)
(globalThis as { HTMLVideoElement?: unknown }).HTMLVideoElement ??= class {};

const PAGE = { left: 0, top: 0, width: 1280, height: 800, right: 1280, bottom: 800 } as DOMRect;

function setup() {
  const s = new LiveSurfaces();
  const got: (GlassQuad | null)[] = [];
  const canvas = { width: 320, height: 180 } as HTMLCanvasElement;
  // a TV's glass on the wall at y = 0, facing +y (into the room), 2 tiles wide
  const live: Live = {
    key: "m:tv",
    src: canvas,
    tl: [0, 0],
    tr: [2, 0],
    zTop: 60,
    zBot: 20,
    version: 1,
    glow: true,
    glass: (q) => got.push(q),
  };
  s.set([live], 1, 3, new Color(1, 1, 1));
  s.root.updateMatrixWorld(true);
  const mesh = s.root.children[0] as unknown as { material: { opacity: number } };
  return { s, got, mesh };
}

function camAt(x: number, y: number, lookX: number, lookY: number) {
  const c = new PerspectiveCamera(60, 1280 / 800, 0.05, 200);
  c.position.set(x, 0.6, y);
  c.lookAt(lookX, 0.6, lookY);
  c.updateMatrixWorld();
  return c;
}

test("in sight: a hole, the player told the glass's corners on the page", () => {
  const { s, got, mesh } = setup();
  s.holes(camAt(1, 3, 1, 0), () => PAGE);
  const q = got.pop();
  assert.ok(q, "the player is told where");
  // facing it square: tl left of tr, top above bottom, all on the page
  assert.ok(q[0][0] < q[1][0] && q[3][0] < q[2][0]);
  assert.ok(q[0][1] < q[3][1] && q[1][1] < q[2][1]);
  for (const [x, y] of q) assert.ok(x > 0 && x < 1280 && y > 0 && y < 800);
  assert.equal(mesh.material.opacity, 0, "the hole's material (clear)");
});

test("behind me, or a photo of the frame: the picture back, the player told it isn't there", () => {
  const { s, got, mesh } = setup();
  s.holes(camAt(1, 3, 1, 6), () => PAGE);
  assert.equal(got.pop(), null);
  assert.equal(mesh.material.opacity, 1, "its own picture");
  s.holes(camAt(1, 3, 1, 0), () => PAGE);
  assert.ok(got.pop());
  s.holes(camAt(1, 3, 1, 0), () => PAGE, true);
  assert.equal(got.pop(), null);
  assert.equal(mesh.material.opacity, 1);
});

test("off to the side, out of the frame: not there", () => {
  const { s, got } = setup();
  s.holes(camAt(1, 3, 12, 3), () => PAGE);
  assert.equal(got.pop(), null);
});
