import assert from "node:assert/strict";
import { test } from "node:test";
import { standHeight } from "./catalog.ts";
import { Grid, moveStep, ZPX_TILE } from "./grid.ts";
import {
  type Height,
  isJump,
  JUMP_G,
  JumpTrack,
  jumpArc,
  jumpReady,
  jumpSpeed,
  jumpTimes,
  stepHeight,
} from "./jump.ts";
import type { MapDef } from "./map.ts";

test("a jump crouches, flies a gravity arc up to its apex and lands", () => {
  for (const kind of ["hop", "flip"] as const) {
    const T = jumpTimes(kind);
    assert.equal(jumpArc(kind, T.crouch / 2).stage, "crouch");
    assert.equal(jumpArc(kind, T.crouch / 2).h, 0);
    // the apex in the middle of the air time, at the spec'd height
    const top = jumpArc(kind, T.crouch + T.air / 2);
    assert.equal(top.stage, "air");
    assert.ok(Math.abs(top.h - T.h) < 1e-9);
    // back on the floor when the air time's up
    assert.ok(jumpArc(kind, T.crouch + T.air - 1e-6).h < 1e-4);
    assert.equal(jumpArc(kind, T.crouch + T.air + T.land / 2).stage, "land");
    assert.equal(jumpArc(kind, T.len + 0.01).stage, "done");
    // that's falling under JUMP_G: h(t) at a quarter of the air time = ¾ of the apex
    assert.ok(Math.abs(jumpArc(kind, T.crouch + T.air / 4).h - 0.75 * T.h) < 1e-9);
    assert.ok(JUMP_G * (T.air / 2) ** 2 > 0);
    // the next one may start on the way down, not on the way up
    assert.equal(jumpReady(kind, T.crouch + T.air / 2), false);
    assert.equal(jumpReady(kind, T.crouch + T.air), true);
  }
  // a flip goes higher and stays up longer
  assert.ok(jumpTimes("flip").air > jumpTimes("hop").air);
  assert.ok(isJump("flip") && !isJump("cartwheel"));
});

// a bare 10×6 room: a desk (2×1) at (3, 2), an arcade at (6, 2), a lamp at (8, 2)
function room() {
  const W = 10;
  const H = 6;
  const map: MapDef = {
    key: "t",
    name: "t",
    width: W,
    height: H,
    tiles: Array.from({ length: H }, () => ".".repeat(W)),
    hWalls: Array.from({ length: H + 1 }, () => ".".repeat(W)),
    vWalls: Array.from({ length: H }, () => ".".repeat(W + 1)),
    spawn: { x: 1, y: 1 },
    areas: [],
    objects: [],
  };
  const objects = [
    { id: "d", kind: "desk", x: 3, y: 2 },
    { id: "a", kind: "arcade", x: 6, y: 2 },
    { id: "l", kind: "lamp", x: 8, y: 2 },
  ];
  return Grid.from(map, objects, undefined, { dressing: false });
}

test("things have tops to stand on (or not), and bodies fit by their feet's height", () => {
  const g = room();
  assert.equal(g.topAt(0, 0), 0);
  assert.ok(Math.abs(g.topAt(3, 2) - 25 / ZPX_TILE) < 1e-6);
  assert.ok(Math.abs(g.topAt(6, 2) - 54 / ZPX_TILE) < 1e-6);
  assert.equal(g.topAt(8, 2), Number.POSITIVE_INFINITY); // a lamp: no
  // on the floor: the desk blocks; feet over the desk's top: it holds them
  assert.equal(g.fitsAt(3.5, 2.5, 0), false);
  assert.equal(g.fitsAt(3.5, 2.5, 0.7), true);
  assert.ok(Math.abs(g.groundAt(3.5, 2.5, 0.7) - 25 / ZPX_TILE) < 1e-6);
  // half over its edge: still on it
  assert.ok(g.groundAt(3.1, 1.9, 0.66) > 0.6);
  assert.equal(g.fitsAt(8.5, 2.5, 5), false);
  assert.equal(standHeight("lamp"), undefined);
  assert.equal(standHeight("desk"), 25);
});

// walk at `speed` along +x from x0 at y, jumping at `at` s; the feet's height on the way
function run(g: Grid, kind: "hop" | "flip", x0: number, y: number, speed: number, at = 0) {
  const h: Height = { z: 0, vz: 0, up: false };
  let x = x0;
  let launched = false;
  let landedOn = -1;
  const dt = 1 / 120;
  for (let t = 0; t < 2.5; t += dt) {
    if (!launched && t >= at + jumpTimes(kind).crouch) {
      h.vz = jumpSpeed(kind);
      h.up = true;
      launched = true;
    }
    const nx = moveStep(g, { x, y }, { x: 1, y: 0 }, speed, dt, h.z).x;
    x = nx;
    if (stepHeight(g, x, y, h, dt) && landedOn < 0) landedOn = h.z;
  }
  return { x, z: h.z, landedOn };
}

test("a hop lands on a desk, a flip on the arcade; a hop can't reach the arcade", () => {
  const g = room();
  // from the floor walking towards the desk (3..5): up, over its edge, landed on it
  const onDesk = run(g, "hop", 2.0, 2.5, 2.5, 0);
  assert.ok(Math.abs(onDesk.landedOn - 25 / ZPX_TILE) < 1e-6, `landed at ${onDesk.landedOn}`);
  // a hop at the arcade's side: stopped by it, back on the floor
  const atArcade = run(g, "hop", 5.4, 2.5, 3, 0);
  assert.ok(atArcade.x < 5.8 && atArcade.z === 0);
  // a flip from right by it clears it and lands on top
  const flip = run(g, "flip", 5.3, 2.5, 1.2, 0);
  assert.ok(Math.abs(flip.landedOn - 54 / ZPX_TILE) < 1e-6, `flip landed at ${flip.landedOn}`);
});

test("walking off the edge of something drops you to the floor", () => {
  const g = room();
  const h: Height = { z: 25 / ZPX_TILE, vz: 0, up: false };
  let x = 4.5;
  let landed = false;
  for (let t = 0; t < 1.5; t += 1 / 60) {
    x = moveStep(g, { x, y: 2.5 }, { x: -1, y: 0 }, 2, 1 / 60, h.z).x;
    landed = stepHeight(g, x, 2.5, h, 1 / 60) || landed;
  }
  assert.ok(x < 2.8 && h.z === 0 && landed);
});

test("the stage of a jump follows its landing, a fall shows as a hop's air and landing", () => {
  const tr = new JumpTrack();
  tr.begin("hop", 1000);
  assert.equal(tr.update(1050, false)?.stage, "crouch");
  assert.equal(tr.update(1200, true)?.stage, "air");
  // lands early (on a desk): the landing starts then
  const l = tr.update(1400, false);
  assert.equal(l?.stage, "land");
  assert.equal(tr.update(1400 + 1000, false), null);
  // off an edge: nothing at first, then air, then a landing
  assert.equal(tr.update(5000, true), null);
  assert.equal(tr.update(5200, true)?.stage, "air");
  assert.equal(tr.update(5400, false)?.stage, "land");
});
