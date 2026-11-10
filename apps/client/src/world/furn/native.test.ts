import assert from "node:assert/strict";
import { test } from "node:test";
import {
  entry,
  HANDS_AT,
  PIANO_STOOL,
  quarterYaw,
  SEAT_NEXT,
  SEAT_SPEC,
  SURFACE,
  SURFACE_NEXT,
  TABLE_TOP,
  TOP_NEXT,
  topCentre,
} from "@yutopia/shared";
import { COMPUTER_GLASS } from "@yutopia/shared/computer";
import { GLASS } from "@yutopia/shared/media";

// (what the kit draws is sat on and stood on as the spec says: in the world, or awaiting sign-off)
const SEAT = { ...SEAT_SPEC, ...SEAT_NEXT };
const SURF = { ...SURFACE, ...SURFACE_NEXT };

import { frameOf, turnPoint } from "@yutopia/shared/shapes";
import { type BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from "three";
import { Out } from "../tp/kit3d";
import type { LivePart } from "./kit";
import { animateLive, liveAt } from "./liveparts";
import { CEL_ALPHA } from "./look";
import { liveInto, modelOf, nativeDressInto, nativeInto, seatMotion, wordsOf } from "./native";
import { MAX_TRIS, TRIS_X } from "./tris-limit";
import { adventDay, XMAS_LOOKS } from "./xmas";

// Plan 67 phase 1 (docs/plan/67-the-furniture.md): a kind the kit draws stays on its footprint,
// its anchors are where its spec says (the task chair's seat at SEAT_NEXT's top), and it's turned
// into the world exactly as the physics' shapes are (shared turnPoint), marked for the cel.

const chair = { id: "c", kind: "chair", x: 5, y: 7, rot: 0 };

/** What's hit looking straight down at (x, z) from `from` m up: its height (0: nothing). */
function topAt(g: BufferGeometry, x: number, z: number, from = 0.6): number {
  const ray = new Raycaster(new Vector3(x, from, z), new Vector3(0, -1, 0));
  const hit = ray.intersectObject(new Mesh(g, new MeshBasicMaterial({ side: DoubleSide })))[0];
  return hit ? hit.point.y : 0;
}

function bounds(pos: ArrayLike<number>) {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (let i = 0; i < pos.length; i += 3) {
    b.x0 = Math.min(b.x0, pos[i]);
    b.x1 = Math.max(b.x1, pos[i]);
    b.y0 = Math.min(b.y0, pos[i + 1]);
    b.y1 = Math.max(b.y1, pos[i + 1]);
    b.z0 = Math.min(b.z0, pos[i + 2]);
    b.z1 = Math.max(b.z1, pos[i + 2]);
  }
  return b;
}

test("the task chair stands on its tile, its seat where the spec sits you", () => {
  const g = modelOf(chair);
  const b = bounds(g.attributes.position.array);
  assert.ok(b.x0 >= 0 && b.x1 <= 1 && b.z0 >= 0 && b.z1 <= 1, `on its 1×1: ${JSON.stringify(b)}`);
  assert.ok(Math.abs(b.y0) < 0.005, `on the floor: ${b.y0}`);
  assert.ok(b.y1 > 1 && b.y1 < 1.2, `its back's top ${b.y1}`);
  // the cushion's top over the seat's middle
  const top = topAt(g, 0.5, 0.52);
  assert.ok(Math.abs(top - SEAT.chair.top) < 0.015, `the seat ${top.toFixed(3)} vs ${SEAT.chair.top}`);
  // (the same look, the same model: built once)
  assert.equal(modelOf({ ...chair, x: 9 }), g);
  assert.notEqual(modelOf({ ...chair, props: { color: "#9a4a32" } }), g);
});

test("turned as the shapes are, every turn; its vertices marked for the cel", () => {
  const g = modelOf(chair);
  const m = bounds(g.attributes.position.array);
  for (let rot = 0; rot < 4; rot++) {
    const out = new Out();
    nativeInto(out, { ...chair, yaw: quarterYaw(rot) });
    const b = bounds(out.lit.pos);
    const a = turnPoint({ ...chair, rot }, 1, 1, m.x0, m.z0);
    const c = turnPoint({ ...chair, rot }, 1, 1, m.x1, m.z1);
    const near = (x: number, y: number) => Math.abs(x - y) < 1e-5;
    assert.ok(near(b.x0, Math.min(a.x, c.x)) && near(b.x1, Math.max(a.x, c.x)), `rot ${rot}: x`);
    assert.ok(near(b.z0, Math.min(a.z, c.z)) && near(b.z1, Math.max(a.z, c.z)), `rot ${rot}: z`);
    assert.ok(near(b.y1, m.y1), `rot ${rot}: y`);
    assert.equal(out.lit.pos.length, g.attributes.position.count * 3);
    for (let i = 3; i < out.lit.col.length; i += 4) assert.equal(out.lit.col[i], CEL_ALPHA);
    assert.equal(out.soft.rects.length, 1, "its shadow on the floor");
  }
  // sat at a desk (plan 62's pull): moved the way it faces (+y at rot 0, −x at rot 1), the same model
  for (const [rot, dx, dz] of [
    [0, 0, 0.4],
    [1, -0.4, 0],
  ]) {
    const a = new Out();
    const b = new Out();
    nativeInto(a, { ...chair, yaw: quarterYaw(rot) });
    nativeInto(b, { ...chair, yaw: quarterYaw(rot), props: { pull: 0.4 } });
    const ba = bounds(a.lit.pos);
    const bb = bounds(b.lit.pos);
    assert.ok(Math.abs(bb.x0 - ba.x0 - dx) < 1e-5 && Math.abs(bb.z0 - ba.z0 - dz) < 1e-5, `pulled at rot ${rot}`);
  }
});

// Plan 67 phase 2: every seat, every look, with and without its story, sat on or not — on its
// footprint at every turn, on the floor, its seat where the spec sits you, within its budget.
test("every seat and look: on its footprint, on the floor, its seat at its spec, under 8k tris", () => {
  const looks: Record<string, number> = { chair: 4, armchair: 2, sofa: 3, beanbag: 1, bench: 1 };
  for (const [kind, n] of Object.entries(looks)) {
    const e = { chair: [1, 1], armchair: [1, 1], sofa: [3, 1], beanbag: [1, 1], bench: [3, 1] }[kind] as number[];
    for (let variant = 0; variant < n; variant++)
      for (const id of ["a", "b", "c", "d", "e", "f"])
        for (const occupied of [false, true]) {
          const o = { id, kind, x: 0, y: 0, rot: 0, props: { variant, occupied } };
          const g = modelOf(o);
          const b = bounds(g.attributes.position.array);
          const what = `${kind} ${variant} ${id}${occupied ? " sat" : ""}`;
          assert.ok(b.x0 >= -0.005 && b.x1 <= e[0] + 0.005, `${what}: across ${b.x0.toFixed(3)}..${b.x1.toFixed(3)}`);
          assert.ok(b.z0 >= -0.005 && b.z1 <= e[1] + 0.005, `${what}: down ${b.z0.toFixed(3)}..${b.z1.toFixed(3)}`);
          assert.ok(b.y0 > -0.006 && b.y0 < 0.012, `${what}: on the floor (${b.y0.toFixed(3)})`);
          assert.ok(g.attributes.position.count / 3 < MAX_TRIS, `${what}: ${g.attributes.position.count / 3} tris`);
          if (occupied) continue;
          // the seat's top over its middle (a sofa's or a bench's middle tile), what's sat on
          // (a few points: a bench's slats have gaps)
          const top = Math.max(...[0.5, 0.55, 0.6].map((z) => topAt(g, e[0] / 2, z)));
          const want = SEAT[kind].top;
          const tol = kind === "beanbag" ? 0.06 : 0.03;
          assert.ok(Math.abs(top - want) < tol, `${what}: its seat ${top.toFixed(3)} vs ${want}`);
        }
  }
});

// Plan 67 phase 3: desks, tables, storage — on their footprints, their tops where SURFACE_NEXT has
// things stand (every quarter-tile cell a tabletop can use has the top under its middle), under
// budget; a desk's knee space empty all along its sitters' side.
test("desks, tables, storage: on the footprint, the top at its spec under every usable cell, under 8k", () => {
  const kinds: Record<string, number> = {
    desk: 4,
    meeting_table: 1,
    coffee_table: 1,
    side_table: 1,
    reception: 1,
    counter: 2,
    cupboard: 1,
    bookcase: 3,
    tape_shelf: 3,
    locker: 1,
    cart_shelf: 1,
    disc_rack: 2,
  };
  for (const [kind, n] of Object.entries(kinds)) {
    const e = entry(kind);
    const top = TOP_NEXT[kind] ?? e.top ?? [0, 0, e.w * 4, e.h * 4];
    for (let variant = 0; variant < n; variant++)
      for (const id of ["a", "b", "c"]) {
        const g = modelOf({ id, kind, x: 0, y: 0, yaw: quarterYaw(0), props: { variant } });
        const b = bounds(g.attributes.position.array);
        const what = `${kind} ${variant} ${id}`;
        assert.ok(b.x0 >= -0.005 && b.x1 <= e.w + 0.005, `${what}: across ${b.x0.toFixed(3)}..${b.x1.toFixed(3)}`);
        assert.ok(b.z0 >= -0.005 && b.z1 <= e.h + 0.005, `${what}: down ${b.z0.toFixed(3)}..${b.z1.toFixed(3)}`);
        assert.ok(b.y0 > -0.006 && b.y0 < 0.012, `${what}: on the floor (${b.y0.toFixed(3)})`);
        assert.ok(g.attributes.position.count / 3 < MAX_TRIS, `${what}: ${g.attributes.position.count / 3} tris`);
        const want = SURF[kind];
        if (want === undefined) continue;
        for (let cy = top[1]; cy < top[3]; cy++)
          for (let cx = top[0]; cx < top[2]; cx++) {
            const h = topAt(g, (cx + 0.5) / 4, (cy + 0.5) / 4, want + 0.3);
            assert.ok(
              Math.abs(h - want) < 0.012,
              `${what}: the top over cell ${cx},${cy} at ${h.toFixed(3)} (want ${want})`,
            );
          }
      }
  }
});

test("a desk's knees: nothing under it along its sitters' side, either tile", () => {
  for (let variant = 0; variant < 4; variant++) {
    const g = modelOf({ id: "a", kind: "desk", x: 0, y: 0, yaw: quarterYaw(0), props: { variant } });
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const [x, y, z] = [p[i], p[i + 1], p[i + 2]];
      const inKnees = x > 0.12 && x < 1.88 && y > 0.05 && y < 0.62 && z < 0.55;
      assert.ok(!inKnees, `desk ${variant}: a part where knees go (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
    }
  }
});

// Plan 67 phase 4: what stands on desks — in its tile's frame, on the top it stands on, under
// budget; the computer's glass clear where VortexOS draws its picture (shared COMPUTER_GLASS).
test("desk things: in their frame, on their top, under 3k tris; the dressing drawn as they are", () => {
  const things = [
    "keyboard",
    "desklamp",
    "phone",
    "mug",
    "papers",
    "book",
    "binder",
    "tapes",
    "vinyl",
    "photo",
    "succulent",
    "cards",
    "bell",
    "monitor",
  ];
  for (const d of things)
    for (const seed of [0.1, 0.6, 0.9]) {
      const g = modelOf({ id: "t", kind: "tabletop", x: 0, y: 0, props: { d, seed } });
      const b = bounds(g.attributes.position.array);
      assert.ok(b.x0 >= 0 && b.x1 <= 1 && b.z0 >= 0 && b.z1 <= 1, `${d}: in its tile ${JSON.stringify(b)}`);
      assert.ok(b.y0 > -0.003 && b.y0 < 0.01, `${d}: on the top (${b.y0.toFixed(3)})`);
      assert.ok(g.attributes.position.count / 3 < 3000, `${d}: ${g.attributes.position.count / 3} tris`);
    }
  for (const kind of ["computer", "radio", "turntable", "coffee_machine"])
    for (const variant of [0, 1]) {
      const g = modelOf({ id: "t", kind, x: 0, y: 0, props: { variant } });
      const b = bounds(g.attributes.position.array);
      assert.ok(b.x0 >= 0 && b.x1 <= 1 && b.z0 >= 0 && b.z1 <= 1 && b.y0 > -0.003, `${kind}: ${JSON.stringify(b)}`);
      assert.ok(g.attributes.position.count / 3 < 4000, `${kind}: ${g.attributes.position.count / 3} tris`);
    }
  // a mug put down by hand and one the room's dressing set out: the same model, at the same height
  const a = new Out();
  nativeInto(a, {
    id: "m",
    kind: "tabletop",
    x: 3,
    y: 4,
    yaw: quarterYaw(0),
    props: { d: "mug", seed: 0.37, c: [1, 1], z: 29 },
  });
  const b = new Out();
  const c = topCentre({ id: "m", kind: "tabletop", x: 3, y: 4, yaw: quarterYaw(0), props: { d: "mug", c: [1, 1] } });
  nativeDressInto(b, { kind: "mug", x: c.x, y: c.y, z: 29, seed: 0.37 });
  const [ba, bb] = [bounds(a.lit.pos), bounds(b.lit.pos)];
  for (const k of ["x0", "x1", "y0", "y1", "z0", "z1"] as const)
    assert.ok(Math.abs(ba[k] - bb[k]) < 0.003, `dressed mug ${k}`);
});

test("the computer's glass: nothing in front of it where the picture's drawn, its face just behind", () => {
  const g = COMPUTER_GLASS;
  for (const variant of [0, 1]) {
    const geo = modelOf({ id: "pc", kind: "computer", x: 0, y: 0, props: { variant } });
    const mesh = new Mesh(geo, new MeshBasicMaterial({ side: DoubleSide }));
    for (const [u, v] of [
      [0.5, 0.5],
      [0.1, 0.1],
      [0.9, 0.9],
    ]) {
      const x = g.x1 + (g.x0 - g.x1) * u;
      const y = g.z0 + (g.z1 - g.z0) * v;
      const hit = new Raycaster(new Vector3(x, y, -1), new Vector3(0, 0, 1)).intersectObject(mesh)[0];
      assert.ok(hit, `look ${variant}: the glass at ${u},${v}`);
      assert.ok(
        hit.point.z > g.y && hit.point.z < g.y + 0.012,
        `look ${variant}: its face at ${hit.point.z.toFixed(4)} (the picture's plane ${g.y})`,
      );
    }
  }
});

// Plan 67 phase 5: every screen's glass is what's first seen across its picture, a hair behind the
// plane the live picture's drawn on; the consoles' power LEDs where the game room lights them.
test("screens: across each picture, the glass first, just behind its plane; the LEDs where they light", () => {
  for (const [kind, g] of Object.entries(GLASS)) {
    for (let variant = 0; variant < (entry(kind).variants ?? 1); variant++) {
      const geo = modelOf({ id: "s", kind, x: 0, y: 0, props: { variant } });
      const mesh = new Mesh(geo, new MeshBasicMaterial({ side: DoubleSide }));
      const [x0, x1] = [Math.min(g.x0, g.x1), Math.max(g.x0, g.x1)];
      for (const [u, v] of [
        [0.5, 0.5],
        [0.08, 0.1],
        [0.92, 0.9],
      ]) {
        const x = x0 + (x1 - x0) * u;
        const y = g.z0 + (g.z1 - g.z0) * v;
        const hit = new Raycaster(new Vector3(x, y, g.y + 2), new Vector3(0, 0, -1)).intersectObject(mesh)[0];
        assert.ok(hit, `${kind} ${variant}: the glass at ${u},${v}`);
        assert.ok(
          hit.point.z < g.y && hit.point.z > g.y - 0.012,
          `${kind} ${variant}: at ${hit.point.z.toFixed(4)} (its picture's plane ${g.y})`,
        );
      }
    }
  }
  const leds: [string, number, [number, number, number]][] = [
    ["console_2600", 0, [0.3, 0.051, 0.74]],
    ["console_nes", 0, [0.3, 0.051, 0.74]],
    ["console_nes", 1, [0.3, 0.051, 0.74]],
    ["console_snes", 0, [0.3, 0.051, 0.74]],
    ["console_ps1", 0, [0.7, 0.1148, 0.545]],
    ["console_ps1_slim", 0, [0.71, 0.0944, 0.67]],
  ];
  for (const [kind, variant, [x, y, z]] of leds) {
    const glow = modelOf({ id: "l", kind, x: 0, y: 0, props: { variant } }).userData.glow;
    assert.ok(glow, `${kind}: its LED glows`);
    const p = glow.attributes.position.array;
    let near = 9;
    for (let i = 0; i < p.length; i += 3) near = Math.min(near, Math.hypot(p[i] - x, p[i + 1] - y, p[i + 2] - z));
    assert.ok(near < 0.02, `${kind}: its LED ${near.toFixed(3)} from where the room lights it`);
    // …and on the console, not floating off it: its body just behind the light
    const body = new Mesh(
      modelOf({ id: "l", kind, x: 0, y: 0, props: { variant } }),
      new MeshBasicMaterial({ side: DoubleSide }),
    );
    // (from in front, or — a light on its lid — from above)
    const front = new Raycaster(new Vector3(x, y, z + 0.2), new Vector3(0, 0, -1)).intersectObject(body)[0];
    const above = new Raycaster(new Vector3(x, y + 0.2, z), new Vector3(0, -1, 0)).intersectObject(body)[0];
    assert.ok(
      (front && front.point.z > z - 0.04) || (above && above.point.y > y - 0.04),
      `${kind} ${variant}: its LED on its body`,
    );
  }
});

// Plan 67 phase 6: play, tech, music and the lights — on their footprints (a piano's bench out in
// front at PIANO_STOOL, a ping-pong net's posts past its sides, a lamp post's arm over the cars), on
// the floor, under budget; the game tables' tops at TABLE_TOP, the piano's keys and bench, and the
// hands' parts where HANDS_AT puts them; a lamp lit only when it's on.
test("play, tech, music, lights: on the footprint, the tops, keys and parts where the spec has them", () => {
  const kinds: Record<string, { looks: number; out?: [number, number, number, number] }> = {
    arcade: { looks: 1 },
    vending: { looks: 2 },
    water_cooler: { looks: 1 },
    piano: { looks: 2, out: [0, 0, 2, PIANO_STOOL[1] + 0.16] },
    pingpong_table: { looks: 3, out: [0, -0.25, 4, 2.25] },
    server_rack: { looks: 3 },
    crt_terminal: { looks: 1 },
    mixing_desk: { looks: 1 },
    speaker_cab: { looks: 1 },
    mic_stand: { looks: 1 },
    lamp: { looks: 3, out: [-0.2, 0, 1, 1] }, // (the arc lamp's shade over the next tile)
    lamp_post: { looks: 1, out: [0, 0, 2.6, 1] },
    slot_track: { looks: 1 },
  };
  for (const [kind, k] of Object.entries(kinds)) {
    const e = entry(kind);
    const [ox0, oz0, ox1, oz1] = k.out ?? [0, 0, e.w, e.h];
    for (let variant = 0; variant < k.looks; variant++)
      for (const id of ["a", "b", "c"]) {
        const g = modelOf({ id, kind, x: 0, y: 0, yaw: quarterYaw(0), props: { variant } });
        const b = bounds(g.attributes.position.array);
        const what = `${kind} ${variant} ${id}`;
        assert.ok(b.x0 >= ox0 - 0.005 && b.x1 <= ox1 + 0.005, `${what}: across ${b.x0.toFixed(3)}..${b.x1.toFixed(3)}`);
        assert.ok(b.z0 >= oz0 - 0.005 && b.z1 <= oz1 + 0.005, `${what}: down ${b.z0.toFixed(3)}..${b.z1.toFixed(3)}`);
        assert.ok(b.y0 > -0.006 && b.y0 < 0.012, `${what}: on the floor (${b.y0.toFixed(3)})`);
        assert.ok(g.attributes.position.count / 3 < 12000 * TRIS_X, `${what}: ${g.attributes.position.count / 3} tris`);
      }
  }
  // the tables' tops (the ping-pong top away from its lines and net; the slot board on its felt)
  const pong = modelOf({ id: "p", kind: "pingpong_table", x: 0, y: 0, yaw: quarterYaw(0) });
  for (const [x, z] of [
    [1, 0.5],
    [3, 1.5],
    [0.6, 1.4],
  ])
    assert.ok(Math.abs(topAt(pong, x, z, 2) - TABLE_TOP.pingpong_table) < 0.004, `ping-pong top at ${x},${z}`);
  const slot = modelOf({ id: "s", kind: "slot_track", x: 0, y: 0, yaw: quarterYaw(0) });
  assert.ok(Math.abs(topAt(slot, 0.05, 1.5, 2) - TABLE_TOP.slot_track) < 0.012, "the slot board at its spec");
  // the piano: its keys' top where the hands go, its bench's top the stool's seat
  for (const variant of [0, 1]) {
    const pi = modelOf({ id: "k", kind: "piano", x: 0, y: 0, yaw: quarterYaw(0), props: { variant } });
    const [kx, kz, kh] = HANDS_AT.piano.keys;
    assert.ok(Math.abs(topAt(pi, kx + 0.012, kz, 1) - kh) < 0.02, `piano ${variant}: its keys at ${kh}`);
    assert.ok(
      Math.abs(topAt(pi, PIANO_STOOL[0], PIANO_STOOL[1], 1) - SEAT_SPEC.stool.top) < 0.012,
      `piano ${variant}: its bench`,
    );
  }
  // the hands' parts: the thing just behind where each goes, reaching in from the room
  const near = (g: BufferGeometry, [x, z, y]: readonly [number, number, number]) => {
    const mesh = new Mesh(g, new MeshBasicMaterial({ side: DoubleSide }));
    const hit = new Raycaster(new Vector3(x, y, z + 0.5), new Vector3(0, 0, -1)).intersectObject(mesh)[0];
    return hit ? Math.abs(hit.point.z - z) : 9;
  };
  for (const [kind, parts] of Object.entries({ water_cooler: HANDS_AT.water_cooler, vending: HANDS_AT.vending }))
    for (const [part, at] of Object.entries(parts)) {
      const d = near(modelOf({ id: "h", kind, x: 0, y: 0, yaw: quarterYaw(0) }), at);
      assert.ok(d < 0.05, `${kind}'s ${part}: ${d.toFixed(3)} from where the hand goes`);
    }
  // a lamp lit only when on
  for (let variant = 0; variant < 3; variant++) {
    assert.ok(modelOf({ id: "l", kind: "lamp", x: 0, y: 0, props: { variant } }).userData.glow, `lamp ${variant} lit`);
    assert.ok(
      !modelOf({ id: "l", kind: "lamp", x: 0, y: 0, props: { variant, on: false } }).userData.glow,
      `lamp ${variant} off`,
    );
  }
});

// Plan 67 phase 7: on the walls — along the wall within the footprint, out of the wall's face (0.1)
// not into it, a hand's depth at most; the boards' surfaces just behind where their live pictures
// are drawn (world/model.ts: the board wall's and the big screen's at 0.16, the whiteboard's at
// 0.165), the frame never in front of the picture.
test("on the walls: hung on the face, the live pictures' surfaces just behind them", () => {
  const kinds: Record<string, number> = {
    board_wall: 1,
    screen_wall: 1,
    whiteboard: 1,
    notice_board: 3,
    acoustic_panel: 1,
    clock: 1,
    neon: 3,
    poster: 1,
    light_switch: 1,
    frame: 1,
  };
  for (const [kind, n] of Object.entries(kinds)) {
    const e = entry(kind);
    for (let variant = 0; variant < n; variant++)
      for (const props of [
        { variant },
        { variant, art: "vu", seed: 0.1 },
        { variant, art: "yondra", seed: 0.9, on: false },
      ]) {
        const g = modelOf({ id: "w", kind, x: 0, y: 0, yaw: quarterYaw(0), props });
        const b = bounds(g.attributes.position.array);
        const what = `${kind} ${JSON.stringify(props)}`;
        assert.ok(b.x0 >= -0.005 && b.x1 <= e.w + 0.005, `${what}: along ${b.x0.toFixed(3)}..${b.x1.toFixed(3)}`);
        assert.ok(b.z0 >= 0.1 - 0.002 && b.z1 <= 0.32, `${what}: out ${b.z0.toFixed(3)}..${b.z1.toFixed(3)}`);
        assert.ok(b.y0 > 0.2, `${what}: up off the floor (${b.y0.toFixed(3)})`);
        assert.ok(g.attributes.position.count / 3 < MAX_TRIS, `${what}: ${g.attributes.position.count / 3} tris`);
      }
  }
  for (const [kind, x0, x1, z0, z1, plane] of [
    ["board_wall", 0.14, 2.86, 0.689, 1.7097, 0.16],
    ["screen_wall", 0.14, 3.86, 0.5359, 1.8628, 0.16],
    ["whiteboard", 0.14, 1.86, 0.689, 1.5566, 0.165],
  ] as const) {
    const mesh = new Mesh(
      modelOf({ id: "w", kind, x: 0, y: 0, yaw: quarterYaw(0) }),
      new MeshBasicMaterial({ side: DoubleSide }),
    );
    for (const [u, v] of [
      [0.5, 0.5],
      [0.04, 0.05],
      [0.96, 0.95],
    ]) {
      const hit = new Raycaster(
        new Vector3(x0 + (x1 - x0) * u, z0 + (z1 - z0) * v, 1),
        new Vector3(0, 0, -1),
      ).intersectObject(mesh)[0];
      assert.ok(
        hit && hit.point.z < plane && hit.point.z > plane - 0.012,
        `${kind} at ${u},${v}: ${hit?.point.z.toFixed(4)}`,
      );
    }
  }
});

// Plan 67 phase 8: decor, the floor, pets and outside — on their footprints (a rug's fringe past
// its short ends), on the floor, under budget; real leaves (no part a camera-facing card: every
// plant's model the same from any side it's built, nothing billboarded — the kit has no cards); a
// bowl's portions show; the floor clutter drawn as the same thing put down by hand.
test("decor, floor, pets, outside: on the footprint, on the floor, the bowls fill, the clutter alike", () => {
  const kinds: Record<string, { looks: number; out?: [number, number, number, number] }> = {
    plant: { looks: 5, out: [-0.2, -0.2, 1.2, 1.2] }, // (its leaves over the next tiles: only the pot is solid)
    partition: { looks: 3 },
    column: { looks: 2 },
    rug: { looks: 3, out: [-0.13, 0, 4.13, 3] },
    standup_mat: { looks: 1 },
    pet_bed: { looks: 2 },
    pet_bowl: { looks: 1 },
    water_bowl: { looks: 1 },
    scratch_post: { looks: 1 },
    pet_house: { looks: 2 },
    toy_box: { looks: 1 },
    pk_rail: { looks: 1 },
    pk_rail_long: { looks: 1 },
    pk_wall: { looks: 1, out: [-0.04, 0, 4.04, 1] },
    pk_wall_tall: { looks: 1, out: [-0.04, 0, 4.04, 1] },
    pk_pole: { looks: 1 },
    pk_pole_tall: { looks: 1 },
    decor: { looks: 1, out: [-0.2, -0.2, 1.2, 1.2] },
  };
  for (const [kind, k] of Object.entries(kinds)) {
    const e = entry(kind);
    const [ox0, oz0, ox1, oz1] = k.out ?? [0, 0, e.w, e.h];
    for (let variant = 0; variant < k.looks; variant++)
      for (const [id, d] of [
        ["a", "plant"],
        ["b", "boxes"],
        ["c", "bin"],
        ["d", "cable"],
      ]) {
        const g = modelOf({
          id,
          kind,
          x: 0,
          y: 0,
          yaw: quarterYaw(0),
          props: { variant, d, seed: id.charCodeAt(0) / 128, portions: 3 },
        });
        const b = bounds(g.attributes.position.array);
        const what = `${kind} ${variant} ${id}`;
        assert.ok(b.x0 >= ox0 - 0.005 && b.x1 <= ox1 + 0.005, `${what}: across ${b.x0.toFixed(3)}..${b.x1.toFixed(3)}`);
        assert.ok(b.z0 >= oz0 - 0.005 && b.z1 <= oz1 + 0.005, `${what}: down ${b.z0.toFixed(3)}..${b.z1.toFixed(3)}`);
        assert.ok(b.y0 > -0.006 && b.y0 < 0.012, `${what}: on the floor (${b.y0.toFixed(3)})`);
        assert.ok(g.attributes.position.count / 3 < MAX_TRIS, `${what}: ${g.attributes.position.count / 3} tris`);
      }
  }
  // what's left in a bowl shows
  for (const kind of ["pet_bowl", "water_bowl"]) {
    const n = (p: number) => modelOf({ id: "b", kind, x: 0, y: 0, props: { portions: p } }).attributes.position.count;
    assert.ok(n(3) > n(0), `${kind}: full has more than empty`);
  }
  // the floor clutter: the dressing's plant drawn as a decor plant put down by hand
  const out = new Out();
  nativeDressInto(out, { kind: "bin", x: 2.5, y: 3.5, z: 0, seed: 0.3 });
  const placed = new Out();
  nativeInto(placed, { id: "x", kind: "decor", x: 2, y: 3, yaw: quarterYaw(0), props: { d: "bin", seed: 0.3 } });
  assert.equal(out.lit.pos.length, placed.lit.pos.length);
  // a frame the room hangs on its wall: the picture frame's model, on the wall's face (its back at
  // 0.1 from the wall's line, as a hung one's)
  const wall = new Out();
  nativeDressInto(wall, { kind: "frame", x: 4.5, y: 2.5, z: 0, seed: 0.4 });
  let z0 = Infinity;
  for (let i = 2; i < wall.lit.pos.length; i += 3) z0 = Math.min(z0, wall.lit.pos[i]);
  assert.ok(wall.lit.pos.length > 0 && Math.abs(z0 - 2.1) < 0.005, `the room's frame on its wall (${z0.toFixed(3)})`);
});

// Plan 67 phase 8b: the office staples — on their footprints (the shelving's plant, the wall shelf
// on its wall), the tops where SURFACE has things stand, the seats where SEAT_SPEC sits you, the
// ceiling lights at the ceiling and lit only when on.
test("the staples: their tops and seats at the spec, the ceiling lights lit when on", () => {
  for (const [kind, want] of [
    ["standing_desk", SURFACE.standing_desk],
    ["high_table", SURFACE.high_table],
    ["shelving", SURFACE.shelving],
  ] as const)
    for (let variant = 0; variant < (entry(kind).variants ?? 1); variant++) {
      const g = modelOf({ id: "t", kind, x: 0, y: 0, yaw: quarterYaw(0), props: { variant } });
      const e = entry(kind);
      const h = topAt(g, e.w / 2 - 0.2, e.h / 2, want + 0.5);
      assert.ok(Math.abs(h - want) < 0.012, `${kind} ${variant}: its top at ${h.toFixed(3)} (want ${want})`);
    }
  for (const [kind, x, z] of [
    ["bar_stool", 0.5, 0.5],
    ["phone_booth", 0.5, 0.3],
  ] as const) {
    const g = modelOf({ id: "s", kind, x: 0, y: 0, yaw: quarterYaw(0) });
    const h = topAt(g, x, z, SEAT_SPEC[kind].top + 0.3);
    assert.ok(Math.abs(h - SEAT_SPEC[kind].top) < 0.03, `${kind}: its seat at ${h.toFixed(3)}`);
  }
  for (const kind of ["standing_desk", "filing_cabinet", "printer", "fridge", "bar_stool", "high_table", "coat_rack"]) {
    const e = entry(kind);
    const b = bounds(modelOf({ id: "f", kind, x: 0, y: 0, yaw: quarterYaw(0) }).attributes.position.array);
    assert.ok(
      b.x0 >= -0.005 && b.x1 <= e.w + 0.005 && b.z0 >= -0.005 && b.z1 <= e.h + 0.005,
      `${kind}: on its footprint`,
    );
    assert.ok(b.y0 > -0.006 && b.y0 < 0.012, `${kind}: on the floor`);
  }
  for (const kind of ["pendant_light", "panel_light"]) {
    const b = bounds(modelOf({ id: "l", kind, x: 0, y: 0, yaw: quarterYaw(0) }).attributes.position.array);
    assert.ok(Math.abs(b.y1 - 3.27) < 0.01, `${kind}: up at the ceiling (${b.y1.toFixed(3)})`);
    assert.ok(modelOf({ id: "l", kind, x: 0, y: 0 }).userData.glow, `${kind}: lit`);
    assert.ok(!modelOf({ id: "l", kind, x: 0, y: 0, props: { on: false } }).userData.glow, `${kind}: off`);
  }
});

// Plan 68 phase 0: the bench's heroes — on their footprints, the loveseat's seat and the mantel at
// their spec; live parts kept out of the merged model and moved by the clock (liveparts.ts).
test("plan 68's heroes: on their footprints, at their spec; live parts apart and moving", () => {
  for (const kind of ["loveseat", "fireplace", "lava_lamp"])
    for (let variant = 0; variant < 3; variant++) {
      const e = entry(kind);
      const g = modelOf({ id: "h", kind, x: 0, y: 0, yaw: quarterYaw(0), props: { variant } });
      const b = bounds(g.attributes.position.array);
      const what = `${kind} ${variant}`;
      assert.ok(
        b.x0 >= -0.005 && b.x1 <= e.w + 0.005 && b.z0 >= -0.005 && b.z1 <= e.h + 0.005,
        `${what}: on its footprint`,
      );
      assert.ok(b.y0 > -0.006 && b.y0 < 0.012, `${what}: on the floor`);
      assert.ok(g.attributes.position.count / 3 < MAX_TRIS, `${what}: under 8k tris`);
    }
  for (let variant = 0; variant < 3; variant++) {
    const sofa = modelOf({ id: "s", kind: "loveseat", x: 0, y: 0, yaw: quarterYaw(0), props: { variant } });
    for (const x of [0.6, 1.4]) {
      const h = topAt(sofa, x, 0.5 + SEAT_SPEC.loveseat.front - 0.15, 1);
      assert.ok(Math.abs(h - SEAT_SPEC.loveseat.top) < 0.03, `loveseat ${variant}: its seat at ${h.toFixed(3)}`);
    }
    const fire = modelOf({ id: "f", kind: "fireplace", x: 0, y: 0, yaw: quarterYaw(0), props: { variant } });
    const top = entry("fireplace").top ?? [0, 0, 8, 4];
    for (let cx = top[0]; cx < top[2]; cx++) {
      const h = topAt(fire, (cx + 0.5) / 4, (top[1] + 0.5) / 4, SURFACE.fireplace + 0.3);
      assert.ok(
        Math.abs(h - SURFACE.fireplace) < 0.012,
        `fireplace ${variant}: its mantel at ${h.toFixed(3)} over cell ${cx}`,
      );
    }
    // its flames live (lit), none when out
    assert.ok((fire.userData.live as unknown[]).length > 0, `fireplace ${variant}: flames`);
    const out = modelOf({ id: "f", kind: "fireplace", x: 0, y: 0, yaw: quarterYaw(0), props: { variant, on: false } });
    assert.equal((out.userData.live as unknown[]).length, 0, `fireplace ${variant}: out, no flames`);
  }
  // the lava lamp's blobs rise and fall with the clock; its glass stays put
  const lamp = modelOf({ id: "l", kind: "lava_lamp", x: 0, y: 0, yaw: quarterYaw(0) });
  const parts = lamp.userData.live as LivePart[];
  assert.ok(parts.some((p) => p.glass) && parts.filter((p) => p.anim.kind === "lava").length >= 3);
  const blob = parts.find((p) => p.anim.kind === "lava");
  assert.ok(blob);
  const ys = [0, 2, 4, 6, 8].map((t) => liveAt(blob.anim, t).dy);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 0.05, "a blob rises and falls");
  // (a model's still parts don't hold its live ones)
  const plain = new Out();
  nativeInto(plain, { id: "l", kind: "lava_lamp", x: 0, y: 0, yaw: quarterYaw(0) });
  assert.equal(plain.lit.pos.length / 3, lamp.attributes.position.count);
});

// Plan 68 phase 1: live parts in the world — placed as the model is, every turn (shared turnPoint,
// as the shapes and the buffers are), lifted with things on a surface.
test("live parts in the world: at every turn where the model's own points go", () => {
  const mat = new MeshBasicMaterial();
  for (const [kind, props] of [
    ["fireplace", { variant: 0 }],
    ["lava_lamp", { z: 29, c: [1, 1] }],
  ] as const)
    for (const rot of [0, 1, 2, 3]) {
      const o = { id: "lv", kind, x: 5, y: 7, rot, props };
      const g = liveInto(o, mat, mat, mat);
      assert.ok(g, `${kind}: live parts`);
      g.updateMatrixWorld(true);
      const f = frameOf(o);
      for (const m of g.children) {
        const p = (m.userData.live as LivePart).at;
        const w = g.localToWorld(new Vector3(...p));
        const want = turnPoint(f, f.w, f.h, p[0], p[2]);
        assert.ok(Math.hypot(w.x - want.x, w.z - want.z) < 1e-6, `${kind} rot ${rot}: x/z`);
        assert.ok(Math.abs(w.y - (p[1] + f.lift)) < 1e-6, `${kind} rot ${rot}: lifted ${f.lift}`);
      }
    }
});

// Plan 68 phase 1: words on things — the marquee's bulbs spell its words (more letters, more bulbs),
// its border chases; the ticker and the split-flap a still housing round a face the screens draw on.
test("words on things: the marquee spells its words, the boards frame their faces", () => {
  const sign = (kind: string, text?: string) =>
    modelOf({ id: "w", kind, x: 0, y: 0, yaw: quarterYaw(0), props: text === undefined ? {} : { text } });
  for (const kind of ["marquee_sign", "vfd_ticker", "split_flap"]) {
    const e = entry(kind);
    const b = bounds(sign(kind).attributes.position.array);
    assert.ok(b.x0 >= -0.005 && b.x1 <= e.w + 0.005, `${kind}: across its footprint`);
    assert.ok(b.y1 < 3.27, `${kind}: under the ceiling`);
  }
  // (its letters' bulbs lit: in its glow)
  const tris = (text: string) => (sign("marquee_sign", text).userData.glow as BufferGeometry).attributes.position.count;
  assert.ok(tris("HELLO") > tris("HI"), "more letters, more bulbs");
  assert.equal(tris("hi <3"), tris("HI 3"), "drawn as the face draws it");
  assert.equal(wordsOf({ id: "w", kind: "marquee_sign", x: 0, y: 0 }), "OPEN");
  assert.equal(wordsOf({ id: "w", kind: "marquee_sign", x: 0, y: 0, props: { text: "x".repeat(30) } }).length, 10);
  // the chase: its bulb sets blink in turn
  const blinks = (sign("marquee_sign").userData.live as LivePart[]).filter((p) => p.anim.kind === "blink");
  assert.ok(blinks.length >= 3, "a chase round the border");
  const lit = [0, 0.3, 0.6].map((t) => blinks.map((p) => liveAt(p.anim, t).shown).join());
  assert.equal(new Set(lit).size, 3, "the chase moves");
});

// Plan 68 phase 2: Christmas — every piece on its footprint (on a wall, its wall; hung from the
// ceiling, under it), under 8k tris; the lights twinkle while on and are still when off, the
// reindeer nods, the globe's flakes drift, the village's train goes round; the stocking says its
// name; the advent calendar opens to the day.
test("Christmas: on their footprints, lit and moving, named and dated", () => {
  const XMAS = Object.keys(XMAS_LOOKS);
  for (const kind of XMAS)
    for (let variant = 0; variant < (entry(kind).variants ?? 1); variant++) {
      const e = entry(kind);
      const g = modelOf({ id: "x", kind, x: 0, y: 0, yaw: quarterYaw(0), props: { variant } });
      const b = bounds(g.attributes.position.array);
      const what = `${kind} ${variant}`;
      const [w, h] = e.onSurface ? [1, 1] : [e.w, e.h];
      assert.ok(
        b.x0 >= -0.005 && b.x1 <= w + 0.005 && b.z0 >= -0.005 && b.z1 <= h + 0.005,
        `${what}: on its footprint`,
      );
      assert.ok(b.y1 <= 3.275, `${what}: under the ceiling (${b.y1.toFixed(3)})`);
      if (!e.wall && kind !== "mistletoe")
        assert.ok(b.y0 > -0.03 && b.y0 < 0.02, `${what}: on the floor (${b.y0.toFixed(3)})`);
      assert.ok(g.attributes.position.count / 3 < MAX_TRIS, `${what}: under 8k tris`);
    }
  const live = (kind: string, props: Record<string, unknown> = {}) =>
    (modelOf({ id: "x", kind, x: 0, y: 0, yaw: quarterYaw(0), props }).userData.live as LivePart[]) ?? [];
  // the lights: sets blinking out of step, so something's always changing; none when off
  for (const kind of ["xmas_tree", "xmas_tree_small", "garland"]) {
    const sets = live(kind).filter((p) => p.anim.kind === "blink");
    assert.ok(sets.length >= 2, `${kind}: its lights in sets`);
    const at = [0, 0.4, 0.8, 1.2].map((t) => sets.map((p) => liveAt(p.anim, t).shown).join());
    assert.ok(new Set(at).size > 1, `${kind}: they twinkle`);
    assert.equal(live(kind, { on: false }).filter((p) => p.anim.kind === "blink").length, 0, `${kind}: off, still`);
  }
  const nod = live("reindeer").find((p) => p.anim.kind === "nod");
  assert.ok(nod && Math.abs(liveAt(nod.anim, 0.9).turn[1] - liveAt(nod.anim, 0).turn[1]) > 0.05, "the reindeer nods");
  const flakes = live("snow_globe").filter((p) => p.anim.kind === "swirl");
  assert.ok(flakes.length === 3 && liveAt(flakes[0].anim, 2).turn[0] !== 0, "the globe's flakes drift");
  assert.ok(
    live("snow_globe").some((p) => p.glass),
    "under its glass",
  );
  assert.ok(
    live("xmas_village").some((p) => p.anim.kind === "spin"),
    "the village's train goes round",
  );
  assert.ok(!live("xmas_village", { on: false }).length, "and stops when it's off");
  // a stocking's name: another model a name, none drawn for nothing
  const tris = (text?: string) =>
    modelOf({ id: "s", kind: "stocking", x: 0, y: 0, yaw: quarterYaw(0), props: text === undefined ? {} : { text } })
      .attributes.position.count;
  assert.ok(tris("SAM") > tris(), "a name on its cuff");
  assert.equal(tris("sam!"), tris("SAM!"), "as the face draws it");
  // full on Christmas Day
  const sock = (d: number) =>
    modelOf({ id: "s", kind: "stocking", x: 0, y: 0, yaw: quarterYaw(0), props: { text: "SAM", _day: d } });
  assert.ok(sock(25).attributes.position.count > sock(24).attributes.position.count, "full on the 25th");
  // the advent calendar: shut before December, open to the day in it
  assert.equal(adventDay(new Date(2026, 10, 3)), 0);
  assert.equal(adventDay(new Date(2026, 11, 12)), 12);
  assert.equal(adventDay(new Date(2026, 11, 31)), 25);
  const cal = (d: number) =>
    modelOf({ id: "a", kind: "advent_calendar", x: 0, y: 0, yaw: quarterYaw(0), props: { _day: d } });
  assert.notEqual(cal(0), cal(12), "opened to the day");
  assert.ok(
    bounds(cal(12).attributes.position.array).z1 > bounds(cal(0).attributes.position.array).z1,
    "its doors swung out",
  );
});

// (plan 70 phase 1) the chess table's model is the table alone — its men are the living men, drawn
// apart from the game (chessmen3d.ts) — so a move never builds it again; only its picture has men
test("a chess table's model: the same whatever the game, its men only in its picture", () => {
  const at = (props: Record<string, unknown>) => ({
    id: "cache-chess",
    kind: "chess_table",
    x: 0,
    y: 0,
    rot: 0,
    props,
  });
  const a = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
  const b = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";
  const table = modelOf(at({ fen: a }));
  assert.ok(modelOf(at({ fen: b })) === table, "a move: the same model");
  assert.ok(modelOf(at({ fen: "garbage" })) === table, "a bad position: the same model, never a throw");
  const picture = modelOf(at({ _thumb: true }));
  assert.ok(
    picture.attributes.position.count > table.attributes.position.count + 32 * 300,
    "the picture has the 32 men set out on it",
  );
});

// (plan 68) the seats that move while sat in — the egg chair swivels, the rocking chair rocks, the
// hanging chair and the hammock sway: the sitter is turned by seatMotion, so a point of the seat's
// moving part, turned by it from rest, must be where the part's drawn at that moment — at every turn
test("a moving seat's sitter goes with it: seatMotion turns as its live part does", () => {
  const mat = new MeshBasicMaterial();
  for (const kind of ["egg_chair", "rocking_chair", "hanging_chair", "hammock"])
    for (let rot = 0; rot < 4; rot++) {
      const o = { id: `ride-${kind}`, kind, x: 3, y: 5, rot, props: { variant: 0, occupied: true } };
      const g = liveInto(o, mat, mat, mat);
      assert.ok(g, `${kind}: has a live part`);
      const part = g.children[0] as Mesh;
      const a = (part.userData.live as LivePart).anim as { kind: string; period: number; phase: number };
      assert.equal(a.kind, "nod", kind);
      // (a point on it: its geometry's first vertex, in the floor's frame at time t)
      const v = new Vector3().fromBufferAttribute(part.geometry.attributes.position, 0);
      const at = (t: number) => {
        animateLive(g, t);
        g.updateMatrixWorld(true);
        return v.clone().applyMatrix4(part.matrixWorld);
      };
      const rest = at(-a.phase * a.period + a.period * 4); // (its nod at nought)
      for (const t of [0.7, 1.9, 3.3]) {
        const m = seatMotion(o, t);
        assert.ok(m, `${kind}: moves`);
        const q = new Quaternion().setFromAxisAngle(m.axis, m.angle);
        const want = rest.clone().sub(m.pivot).applyQuaternion(q).add(m.pivot);
        const got = at(t);
        assert.ok(want.distanceTo(got) < 1e-4, `${kind} rot ${rot} at ${t}: ${want.toArray()} vs ${got.toArray()}`);
      }
    }
  // (a seat that doesn't move: no motion)
  assert.equal(
    seatMotion({ id: "c", kind: "chair", x: 0, y: 0, yaw: quarterYaw(0), props: { occupied: true } }, 1),
    null,
  );
});
