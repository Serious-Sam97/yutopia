import assert from "node:assert/strict";
import { test } from "node:test";
import {
  entry,
  HANDS_AT,
  ISO_PX,
  PIANO_STOOL,
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

import { turnPoint } from "@yutopia/shared/shapes";
import { type BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { Out } from "../tp/kit3d";
import { CEL_ALPHA } from "./look";
import { modelOf, nativeDressInto, nativeInto } from "./native";

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
    nativeInto(out, { ...chair, rot });
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
    nativeInto(a, { ...chair, rot });
    nativeInto(b, { ...chair, rot, props: { pull: 0.4 } });
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
          assert.ok(g.attributes.position.count / 3 < 8000, `${what}: ${g.attributes.position.count / 3} tris`);
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
        const g = modelOf({ id, kind, x: 0, y: 0, rot: 0, props: { variant } });
        const b = bounds(g.attributes.position.array);
        const what = `${kind} ${variant} ${id}`;
        assert.ok(b.x0 >= -0.005 && b.x1 <= e.w + 0.005, `${what}: across ${b.x0.toFixed(3)}..${b.x1.toFixed(3)}`);
        assert.ok(b.z0 >= -0.005 && b.z1 <= e.h + 0.005, `${what}: down ${b.z0.toFixed(3)}..${b.z1.toFixed(3)}`);
        assert.ok(b.y0 > -0.006 && b.y0 < 0.012, `${what}: on the floor (${b.y0.toFixed(3)})`);
        assert.ok(g.attributes.position.count / 3 < 8000, `${what}: ${g.attributes.position.count / 3} tris`);
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
    const g = modelOf({ id: "a", kind: "desk", x: 0, y: 0, rot: 0, props: { variant } });
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
  nativeInto(a, { id: "m", kind: "tabletop", x: 3, y: 4, rot: 0, props: { d: "mug", seed: 0.37, c: [1, 1], z: 29 } });
  const b = new Out();
  const c = topCentre({ id: "m", kind: "tabletop", x: 3, y: 4, rot: 0, props: { d: "mug", c: [1, 1] } });
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
      const y = (g.z0 + (g.z1 - g.z0) * v) / ISO_PX;
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
        const y = (g.z0 + (g.z1 - g.z0) * v) / ISO_PX;
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
    ["console_2600", 0, [0.3, 2 / ISO_PX, 0.74]],
    ["console_nes", 0, [0.3, 2 / ISO_PX, 0.74]],
    ["console_nes", 1, [0.3, 2 / ISO_PX, 0.74]],
    ["console_snes", 0, [0.3, 2 / ISO_PX, 0.74]],
    ["console_ps1", 0, [0.7, 4.5 / ISO_PX, 0.545]],
    ["console_ps1_slim", 0, [0.71, 3.7 / ISO_PX, 0.67]],
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
        const g = modelOf({ id, kind, x: 0, y: 0, rot: 0, props: { variant } });
        const b = bounds(g.attributes.position.array);
        const what = `${kind} ${variant} ${id}`;
        assert.ok(b.x0 >= ox0 - 0.005 && b.x1 <= ox1 + 0.005, `${what}: across ${b.x0.toFixed(3)}..${b.x1.toFixed(3)}`);
        assert.ok(b.z0 >= oz0 - 0.005 && b.z1 <= oz1 + 0.005, `${what}: down ${b.z0.toFixed(3)}..${b.z1.toFixed(3)}`);
        assert.ok(b.y0 > -0.006 && b.y0 < 0.012, `${what}: on the floor (${b.y0.toFixed(3)})`);
        assert.ok(g.attributes.position.count / 3 < 12000, `${what}: ${g.attributes.position.count / 3} tris`);
      }
  }
  // the tables' tops (the ping-pong top away from its lines and net; the slot board on its felt)
  const pong = modelOf({ id: "p", kind: "pingpong_table", x: 0, y: 0, rot: 0 });
  for (const [x, z] of [
    [1, 0.5],
    [3, 1.5],
    [0.6, 1.4],
  ])
    assert.ok(Math.abs(topAt(pong, x, z, 2) - TABLE_TOP.pingpong_table) < 0.004, `ping-pong top at ${x},${z}`);
  const slot = modelOf({ id: "s", kind: "slot_track", x: 0, y: 0, rot: 0 });
  assert.ok(Math.abs(topAt(slot, 0.05, 1.5, 2) - TABLE_TOP.slot_track) < 0.012, "the slot board at its spec");
  // the piano: its keys' top where the hands go, its bench's top the stool's seat
  for (const variant of [0, 1]) {
    const pi = modelOf({ id: "k", kind: "piano", x: 0, y: 0, rot: 0, props: { variant } });
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
      const d = near(modelOf({ id: "h", kind, x: 0, y: 0, rot: 0 }), at);
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
        const g = modelOf({ id: "w", kind, x: 0, y: 0, rot: 0, props });
        const b = bounds(g.attributes.position.array);
        const what = `${kind} ${JSON.stringify(props)}`;
        assert.ok(b.x0 >= -0.005 && b.x1 <= e.w + 0.005, `${what}: along ${b.x0.toFixed(3)}..${b.x1.toFixed(3)}`);
        assert.ok(b.z0 >= 0.1 - 0.002 && b.z1 <= 0.32, `${what}: out ${b.z0.toFixed(3)}..${b.z1.toFixed(3)}`);
        assert.ok(b.y0 > 0.2, `${what}: up off the floor (${b.y0.toFixed(3)})`);
        assert.ok(g.attributes.position.count / 3 < 8000, `${what}: ${g.attributes.position.count / 3} tris`);
      }
  }
  const px = (p: number) => p / ISO_PX;
  for (const [kind, x0, x1, z0, z1, plane] of [
    ["board_wall", 0.14, 2.86, 27, 67, 0.16],
    ["screen_wall", 0.14, 3.86, 21, 73, 0.16],
    ["whiteboard", 0.14, 1.86, 27, 61, 0.165],
  ] as const) {
    const mesh = new Mesh(modelOf({ id: "w", kind, x: 0, y: 0, rot: 0 }), new MeshBasicMaterial({ side: DoubleSide }));
    for (const [u, v] of [
      [0.5, 0.5],
      [0.04, 0.05],
      [0.96, 0.95],
    ]) {
      const hit = new Raycaster(
        new Vector3(x0 + (x1 - x0) * u, px(z0 + (z1 - z0) * v), 1),
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
          rot: 0,
          props: { variant, d, seed: id.charCodeAt(0) / 128, portions: 3 },
        });
        const b = bounds(g.attributes.position.array);
        const what = `${kind} ${variant} ${id}`;
        assert.ok(b.x0 >= ox0 - 0.005 && b.x1 <= ox1 + 0.005, `${what}: across ${b.x0.toFixed(3)}..${b.x1.toFixed(3)}`);
        assert.ok(b.z0 >= oz0 - 0.005 && b.z1 <= oz1 + 0.005, `${what}: down ${b.z0.toFixed(3)}..${b.z1.toFixed(3)}`);
        assert.ok(b.y0 > -0.006 && b.y0 < 0.012, `${what}: on the floor (${b.y0.toFixed(3)})`);
        assert.ok(g.attributes.position.count / 3 < 8000, `${what}: ${g.attributes.position.count / 3} tris`);
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
  nativeInto(placed, { id: "x", kind: "decor", x: 2, y: 3, rot: 0, props: { d: "bin", seed: 0.3 } });
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
      const g = modelOf({ id: "t", kind, x: 0, y: 0, rot: 0, props: { variant } });
      const e = entry(kind);
      const h = topAt(g, e.w / 2 - 0.2, e.h / 2, want + 0.5);
      assert.ok(Math.abs(h - want) < 0.012, `${kind} ${variant}: its top at ${h.toFixed(3)} (want ${want})`);
    }
  for (const [kind, x, z] of [
    ["bar_stool", 0.5, 0.5],
    ["phone_booth", 0.5, 0.3],
  ] as const) {
    const g = modelOf({ id: "s", kind, x: 0, y: 0, rot: 0 });
    const h = topAt(g, x, z, SEAT_SPEC[kind].top + 0.3);
    assert.ok(Math.abs(h - SEAT_SPEC[kind].top) < 0.03, `${kind}: its seat at ${h.toFixed(3)}`);
  }
  for (const kind of ["standing_desk", "filing_cabinet", "printer", "fridge", "bar_stool", "high_table", "coat_rack"]) {
    const e = entry(kind);
    const b = bounds(modelOf({ id: "f", kind, x: 0, y: 0, rot: 0 }).attributes.position.array);
    assert.ok(
      b.x0 >= -0.005 && b.x1 <= e.w + 0.005 && b.z0 >= -0.005 && b.z1 <= e.h + 0.005,
      `${kind}: on its footprint`,
    );
    assert.ok(b.y0 > -0.006 && b.y0 < 0.012, `${kind}: on the floor`);
  }
  for (const kind of ["pendant_light", "panel_light"]) {
    const b = bounds(modelOf({ id: "l", kind, x: 0, y: 0, rot: 0 }).attributes.position.array);
    assert.ok(Math.abs(b.y1 - 3.27) < 0.01, `${kind}: up at the ceiling (${b.y1.toFixed(3)})`);
    assert.ok(modelOf({ id: "l", kind, x: 0, y: 0 }).userData.glow, `${kind}: lit`);
    assert.ok(!modelOf({ id: "l", kind, x: 0, y: 0, props: { on: false } }).userData.glow, `${kind}: off`);
  }
});
