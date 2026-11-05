import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, quarterYaw, SURFACE } from "@yutopia/shared";
import { type BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import type { LivePart } from "../kit";
import { liveAt } from "../liveparts";
import { modelOf } from "../native";
import { LOOKS, PLAY } from "./gameroom";

// Plan 68 phase 9 (docs/plan/68-more-furniture.md): the game room — every kind and look on its footprint
// (the dartboard on its wall), under the ceiling, on the floor, under 8k tris; the playing surfaces where
// PLAY has them (for the games to come); the live parts there and moving — the pinball's lamps, the claw
// swinging, the jukebox's record and bubbles, the skee-ball's chase.

const CEILING = 3.27;

function bounds(g: BufferGeometry) {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  const add = (pos: ArrayLike<number>, at: number[] = [0, 0, 0]) => {
    for (let i = 0; i < pos.length; i += 3) {
      b.x0 = Math.min(b.x0, pos[i] + at[0]);
      b.x1 = Math.max(b.x1, pos[i] + at[0]);
      b.y0 = Math.min(b.y0, pos[i + 1] + at[1]);
      b.y1 = Math.max(b.y1, pos[i + 1] + at[1]);
      b.z0 = Math.min(b.z0, pos[i + 2] + at[2]);
      b.z1 = Math.max(b.z1, pos[i + 2] + at[2]);
    }
  };
  add(g.attributes.position.array);
  const glow = g.userData.glow as BufferGeometry | null;
  if (glow) add(glow.attributes.position.array);
  // (a live part at rest, unturned: its own points round where it rests)
  for (const p of live(g)) add(p.geo.attributes.position.array, p.at);
  return b;
}
const live = (g: BufferGeometry) => (g.userData.live as LivePart[] | undefined) ?? [];
const tris = (g: BufferGeometry) =>
  (g.attributes.position.count +
    ((g.userData.glow as BufferGeometry | null)?.attributes.position.count ?? 0) +
    live(g).reduce((n, p) => n + p.geo.attributes.position.count, 0)) /
  3;

/** What's hit looking along `dir` from `from`: where (null: nothing). */
function hit(g: BufferGeometry, from: [number, number, number], dir: [number, number, number]): Vector3 | null {
  const ray = new Raycaster(new Vector3(...from), new Vector3(...dir).normalize());
  const mat = new MeshBasicMaterial({ side: DoubleSide });
  const meshes = [new Mesh(g, mat)];
  const glow = g.userData.glow as BufferGeometry | null;
  if (glow) meshes.push(new Mesh(glow, mat));
  const h = ray.intersectObjects(meshes)[0];
  return h ? h.point : null;
}
const topAt = (g: BufferGeometry, x: number, z: number, from = 3) => hit(g, [x, from, z], [0, -1, 0])?.y ?? 0;

const model = (kind: string, variant: number, id = "t") =>
  modelOf({ id, kind, x: 0, y: 0, yaw: quarterYaw(0), props: { variant } });

test(`game room: every kind and look on its footprint, under the ceiling, on the floor, under 8k tris`, () => {
  for (const kind of Object.keys(LOOKS)) {
    const e = entry(kind);
    assert.equal(e.variants ?? 1, LOOKS[kind].length, `${kind}: a look a variant`);
    assert.ok(e.buildable, `${kind}: in the panel`);
    for (let v = 0; v < LOOKS[kind].length; v++)
      for (const id of ["a", "b", "c", "d"]) {
        const g = model(kind, v, id);
        const b = bounds(g);
        const what = `${kind} ${v} (${id})`;
        const [w, h] = e.onSurface ? [1, 1] : [e.w, e.h];
        assert.ok(
          b.x0 >= -0.005 && b.x1 <= w + 0.005 && b.z0 >= -0.005 && b.z1 <= h + 0.005,
          `${what}: on its footprint (${b.x0.toFixed(2)}..${b.x1.toFixed(2)}, ${b.z0.toFixed(2)}..${b.z1.toFixed(2)})`,
        );
        assert.ok(b.y1 <= CEILING, `${what}: under the ceiling (${b.y1.toFixed(2)})`);
        if (e.wall) assert.ok(b.z0 >= 0.1 - 0.005, `${what}: out from the wall's face`);
        else assert.ok(b.y0 > -0.02 && b.y0 < 0.02, `${what}: on the floor (${b.y0.toFixed(3)})`);
        assert.ok(tris(g) < 8000, `${what}: under 8k tris (${tris(g)})`);
      }
  }
});

test("game room: the playing surfaces where PLAY has them", () => {
  for (let v = 0; v < 3; v++) {
    // air hockey: the field across its length and width, the rails round it
    const ah = model("air_hockey", v);
    const A = PLAY.air_hockey;
    for (const [x, z] of [
      [A.x0 + 0.1, A.z0 + 0.1],
      [A.x1 - 0.1, A.z1 - 0.1],
      [(A.x0 + A.x1) / 2 - 0.3, (A.z0 + A.z1) / 2 + 0.3],
    ])
      assert.ok(Math.abs(topAt(ah, x, z) - A.top) < 0.003, `air hockey ${v}: its field at ${x}, ${z}`);
    assert.ok(Math.abs(topAt(ah, 1.5, A.z0 - 0.03) - A.rail) < 0.003, `air hockey ${v}: its rail`);
    // foosball: the field between the rods
    const fb = model("foosball", v);
    const F = PLAY.foosball;
    assert.ok(Math.abs(topAt(fb, 0.468, 1.1) - F.top) < 0.003, `foosball ${v}: its field`);
    // the chess board: an empty square; in the world no men on it (plan 70: they're the living men,
    // drawn apart: chessmen3d.ts), in its picture a white rook on a1, a black king on e8
    const ch = model("chess_table", v);
    const pic = modelOf({
      id: "t",
      kind: "chess_table",
      x: 0,
      y: 0,
      yaw: quarterYaw(0),
      props: { variant: v, _thumb: true },
    });
    const C = PLAY.chess_table;
    const sq = (r: number, f: number) => [C.x0 + (r + 0.5) * C.sq + 0.004, C.z0 + (f + 0.5) * C.sq + 0.003] as const;
    assert.ok(
      Math.abs(topAt(ch, ...sq(3, 0)) - C.top) < 0.002,
      `chess ${v}: the board at ${topAt(ch, ...sq(3, 0)).toFixed(4)}`,
    );
    assert.ok(Math.abs(topAt(ch, ...sq(0, 0)) - C.top) < 0.002, `chess ${v}: no man on a1 in the world`);
    assert.ok(topAt(pic, ...sq(0, 0)) > C.top + 0.04, `chess ${v}: a rook on a1 in its picture`);
    assert.ok(topAt(pic, ...sq(7, 4)) > C.top + 0.065, `chess ${v}: the king on e8 in its picture`);
    for (const [x, z] of C.seats)
      assert.ok(Math.abs(topAt(ch, x, z, 0.6) - C.seat) < 0.03, `chess ${v}: a chair's seat at ${x}`);
    // the dartboard: its bull out from the wall at its height
    const db = model("dartboard", v);
    const D = PLAY.dartboard;
    const bull = hit(db, [D.x, D.y, 1], [0, 0, -1]);
    assert.ok(bull && Math.abs(bull.z - D.face) < 0.004, `dartboard ${v}: its bull at ${bull?.z.toFixed(3)}`);
    // the card table: its top under every cell
    const ct = model("card_table", v);
    for (let cx = 0; cx < 4; cx++)
      for (let cz = 0; cz < 4; cz++) {
        const h = topAt(ct, (cx + 0.5) / 4, (cz + 0.5) / 4);
        assert.ok(
          Math.abs(h - SURFACE.card_table) < 0.015,
          `card table ${v}: its top at ${h.toFixed(3)} over ${cx}, ${cz}`,
        );
      }
  }
});

test("live parts: the lamps flash, the claw swings, the record turns, the bubbles rise", () => {
  const parts = (kind: string, v = 0) => live(model(kind, v));
  const changes = (ps: LivePart[], f: (p: LivePart, t: number) => unknown) =>
    new Set([0, 0.23, 0.51, 0.77, 1.3].map((t) => ps.map((p) => JSON.stringify(f(p, t))).join("|"))).size > 1;
  for (let v = 0; v < 3; v++) {
    const pin = parts("pinball", v).filter((p) => p.anim.kind === "blink");
    assert.ok(pin.length >= 5 && pin.every((p) => p.glow), `pinball ${v}: its lamps lit`);
    assert.ok(
      changes(pin, (p, t) => liveAt(p.anim, t).shown),
      `pinball ${v}: they flash`,
    );
    const claw = parts("claw_machine", v);
    const swing = claw.find((p) => p.anim.kind === "nod");
    assert.ok(
      swing && Math.abs(liveAt(swing.anim, 0.6).turn[1] - liveAt(swing.anim, 0).turn[1]) > 0.01,
      `claw ${v}: swings`,
    );
    assert.ok(
      claw.some((p) => p.glass),
      `claw ${v}: behind glass`,
    );
    const juke = parts("jukebox", v);
    assert.ok(juke.filter((p) => p.anim.kind === "spin").length >= 2, `jukebox ${v}: its record turns`);
    const bubbles = juke.filter((p) => p.anim.kind === "lava");
    assert.ok(bubbles.length >= 6, `jukebox ${v}: bubbles in its tubes`);
    assert.ok(Math.abs(liveAt(bubbles[0].anim, 1).dy - liveAt(bubbles[0].anim, 0).dy) > 0.01, `jukebox ${v}: rising`);
    assert.ok(
      changes(
        parts("skee_ball", v).filter((p) => p.anim.kind === "blink"),
        (p, t) => liveAt(p.anim, t).shown,
      ),
      `skee-ball ${v}: its bulbs chase`,
    );
  }
  // (the still ones have none)
  for (const kind of ["air_hockey", "foosball", "chess_table", "card_table", "cornhole_board", "dartboard"])
    assert.equal(parts(kind).length, 0, `${kind}: still`);
});
