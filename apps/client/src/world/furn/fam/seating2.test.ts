import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, quarterYaw, SEAT_SPEC } from "@yutopia/shared";
import { Box3, type BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import type { LivePart } from "../kit";
import { liveAt, liveGroup } from "../liveparts";
import { modelOf } from "../native";
import { MAX_TRIS } from "../tris-limit";
import { LOOKS } from "./seating2";

// Plan 68 phase 3 (docs/plan/68-more-furniture.md): the new seats — every kind and look, empty and sat
// in, on its footprint, under the ceiling, on the floor (the hanging chair: under its hook), under 8k
// tris; sat on where shared SEAT_SPEC puts the sitter; and what moves, moving: the egg chair swivels
// and the rocking chair rocks only while sat in, the hanging chair and the hammock always sway.

const mat = new MeshBasicMaterial({ side: DoubleSide });
const KINDS = Object.keys(LOOKS);

/** A thing's model and its live parts at rest, as one group in its own frame. */
function whole(g: BufferGeometry): Group {
  const out = new Group();
  out.add(new Mesh(g, mat));
  const live = liveGroup(g, mat, mat, mat);
  if (live) out.add(live);
  out.updateMatrixWorld(true);
  return out;
}
const tris = (g: BufferGeometry) =>
  (g.attributes.position.count +
    ((g.userData.live as LivePart[]) ?? []).reduce((n, p) => n + p.geo.attributes.position.count, 0) +
    ((g.userData.glow as BufferGeometry | null)?.attributes.position.count ?? 0)) /
  3;
/** The highest thing under (x, z), looked at from `from` m up. */
function topAt(o: Group, x: number, z: number, from = 0.62): number {
  const hit = new Raycaster(new Vector3(x, from, z), new Vector3(0, -1, 0)).intersectObject(o, true)[0];
  return hit ? hit.point.y : 0;
}
const live = (kind: string, props: Record<string, unknown> = {}) =>
  (modelOf({ id: "q", kind, x: 0, y: 0, yaw: quarterYaw(0), props }).userData.live as LivePart[]) ?? [];

test("seating 2: every kind and look, empty and sat in — on its footprint, under the ceiling, sat at its spec", () => {
  for (const kind of KINDS) {
    const e = entry(kind);
    assert.equal(e.variants ?? 1, LOOKS[kind].length, `${kind}: a name a look`);
    assert.ok(e.seat && SEAT_SPEC[kind], `${kind}: a seat, in SEAT_SPEC`);
    for (let variant = 0; variant < LOOKS[kind].length; variant++)
      for (const id of ["a", "b", "c", "d", "e", "f"])
        for (const occupied of [false, true]) {
          const g = modelOf({ id, kind, x: 0, y: 0, yaw: quarterYaw(0), props: { variant, occupied } });
          const w = whole(g);
          const b = new Box3().setFromObject(w);
          const what = `${kind} ${variant} ${id}${occupied ? " sat" : ""}`;
          assert.ok(
            b.min.x >= -0.005 && b.max.x <= e.w + 0.005,
            `${what}: across ${b.min.x.toFixed(3)}..${b.max.x.toFixed(3)}`,
          );
          assert.ok(
            b.min.z >= -0.005 && b.max.z <= e.h + 0.005,
            `${what}: down ${b.min.z.toFixed(3)}..${b.max.z.toFixed(3)}`,
          );
          assert.ok(b.max.y <= 3.275, `${what}: under the ceiling (${b.max.y.toFixed(3)})`);
          if (kind === "hanging_chair") assert.ok(b.min.y > 0.25 && b.max.y > 3.2, `${what}: hung from the ceiling`);
          else assert.ok(b.min.y > -0.006 && b.min.y < 0.012, `${what}: on the floor (${b.min.y.toFixed(3)})`);
          assert.ok(tris(g) < MAX_TRIS, `${what}: ${tris(g)} tris`);
          if (occupied) continue;
          // the seat's top where she sits (the middle of a tile; the bleachers' front row)
          const s = SEAT_SPEC[kind];
          const zs = kind === "bleachers" ? [1.5, 1.55, 1.6] : [0.5, 0.55, 0.6];
          const top = Math.max(...zs.map((z) => topAt(w, e.w / 2, z, s.top + 0.12)));
          assert.ok(Math.abs(top - s.top) < 0.03, `${what}: its seat ${top.toFixed(3)} vs ${s.top}`);
        }
  }
});

test("seating 2: what moves — the egg swivels and the rocker rocks sat in; the hanging chair and hammock sway", () => {
  for (const kind of ["egg_chair", "rocking_chair"])
    for (let variant = 0; variant < LOOKS[kind].length; variant++) {
      assert.equal(live(kind, { variant }).length, 0, `${kind} ${variant}: still when empty`);
      const sat = live(kind, { variant, occupied: true });
      assert.ok(sat.length > 0 && sat.every((p) => p.anim.kind === "nod"), `${kind} ${variant}: moving when sat in`);
      const a = sat[0].anim;
      const turns = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((t) => liveAt(a, t).turn[1]);
      assert.ok(Math.max(...turns) - Math.min(...turns) > 0.05, `${kind} ${variant}: it moves`);
      // (all of it as one: the same pivot and the same clock)
      assert.ok(sat.every((p) => JSON.stringify(p.anim) === JSON.stringify(a) && p.at.join() === sat[0].at.join()));
    }
  for (const kind of ["hanging_chair", "hammock"])
    for (let variant = 0; variant < LOOKS[kind].length; variant++) {
      const empty = live(kind, { variant });
      const sat = live(kind, { variant, occupied: true });
      assert.ok(empty.length > 0 && sat.length > 0, `${kind} ${variant}: swaying`);
      const amp = (ps: LivePart[]) => (ps[0].anim.kind === "nod" ? ps[0].anim.amp : 0);
      assert.ok(amp(empty) > amp(sat) && amp(sat) > 0, `${kind} ${variant}: gentler with someone in it`);
    }
  // the hanging chair swings from its hook, at the ceiling
  for (const p of live("hanging_chair")) assert.ok(p.at[1] > 3.15, "from its hook");
});
