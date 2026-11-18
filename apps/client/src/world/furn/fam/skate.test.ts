import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, quarterYaw } from "@yutopia/shared";
import { parkPieces, piecesOfThings, SKATE_FITS, TOWN_PARKS } from "@yutopia/shared/skate/parks";
import { PIECES, SkatePark } from "@yutopia/shared/skate/pieces";
import { type BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { skateParkGeometry } from "../../tp/skate3d";
import { modelOf } from "../native";
import { MAX_TRIS } from "../tris-limit";
import { LOOKS } from "./skate";

// Plan 103 (docs/plan/103-the-skate.md F6a, F7c): what's drawn is what's ridden — the build menu's skate pieces and
// the town's two parks, looked at straight down all over: the drawn face where the board's profile is (shared
// skate/pieces.ts SkatePark.topAt), to a few millimetres; every look on its footprint, on the ground, in budget.

/** What's hit looking straight down at (x, z) from `from` m up: its height (null: nothing). */
function hitAt(g: BufferGeometry, x: number, z: number, from: number): number | null {
  const ray = new Raycaster(new Vector3(x, from, z), new Vector3(0, -1, 0));
  const hit = ray.intersectObject(new Mesh(g, new MeshBasicMaterial({ side: DoubleSide })))[0];
  return hit ? hit.point.y : null;
}
/** Points over a park's pieces, off their edges and copings (the steel stands proud there): (x, z) with the
 *  ridden top's height. */
function samples(park: SkatePark, x0: number, z0: number, x1: number, z1: number, step: number) {
  const out: { x: number; z: number; top: number }[] = [];
  for (let x = x0 + 0.013; x < x1; x += step)
    for (let z = z0 + 0.029; z < z1; z += step) {
      const t = park.topAt(x, z, 99);
      if (!t) continue;
      const pr = t.p.s.prof;
      const near = (l: number) => Math.abs(t.on.l - l) < 0.12;
      // (not by a coping, an edge, the deck's end; not on an upright stretch)
      if (pr.copings.some(near) || pr.edges.some(near) || t.on.l < 0.02 || t.on.l > pr.total - 0.05) continue;
      if (Math.abs(pr.at(t.on.l).tz) > 0.97) continue;
      const s = t.p.s;
      const w = t.on.w;
      if (s.sweep === "line" && (w - s.w0 < 0.05 || s.w1 - w < 0.05)) continue;
      if (s.sweep === "turn" && (w - s.w0 < 0.01 || s.w1 - w < 0.01)) continue;
      out.push({ x, z, top: t.z });
    }
  return out;
}

test("skate pieces: every look on its footprint, on the ground, out of doors, solid, in budget", () => {
  for (const kind of Object.keys(LOOKS)) {
    const e = entry(kind);
    assert.equal(e.variants ?? 1, LOOKS[kind].length, `${kind}: a name a look`);
    assert.ok(e.outdoor && e.solid && e.buildable, `${kind}: out of doors, solid, built`);
    for (let v = 0; v < LOOKS[kind].length; v++) {
      const g = modelOf({ id: "s", kind, x: 0, y: 0, yaw: quarterYaw(0), props: { variant: v } });
      g.computeBoundingBox();
      const b = g.boundingBox;
      assert.ok(b);
      const what = `${kind} ${v}`;
      assert.ok(
        b.min.x >= -0.04 && b.max.x <= e.w + 0.04 && b.min.z >= -0.04 && b.max.z <= e.h + 0.04,
        `${what}: on its footprint (${b.min.x.toFixed(2)}…${b.max.x.toFixed(2)}, ${b.min.z.toFixed(2)}…${b.max.z.toFixed(2)})`,
      );
      assert.ok(b.min.y > -0.01 && b.min.y < 0.02, `${what}: on the ground (${b.min.y.toFixed(3)})`);
      assert.ok(g.attributes.position.count / 3 < MAX_TRIS, `${what}: ${g.attributes.position.count / 3} tris`);
    }
  }
});

test("skate pieces: the drawn face is the ridden profile, every kind, every look", () => {
  for (const [kind, f] of Object.entries(SKATE_FITS)) {
    if (!PIECES[f.piece].surfaces.length) continue;
    // (at rot 0 on (0, 0): the model's frame is the floor's — x, z the floor's x, y)
    const park = new SkatePark(piecesOfThings([{ kind, x: 0, y: 0, yaw: 0 }]));
    const pts = samples(park, 0, 0, f.w, f.h, 0.21);
    assert.ok(pts.length > 10, `${kind}: ${pts.length} points`);
    for (let v = 0; v < LOOKS[kind].length; v++) {
      const g = modelOf({ id: "s", kind, x: 0, y: 0, yaw: quarterYaw(0), props: { variant: v } });
      for (const p of pts) {
        const h = hitAt(g, p.x, p.z, p.top + 0.3);
        const want = p.top < 1e-6 ? 0.004 : p.top;
        assert.ok(
          h !== null && Math.abs(h - want) < 0.006,
          `${kind} ${v} at ${p.x}, ${p.z}: drawn ${h}, ridden ${p.top}`,
        );
      }
    }
  }
});

test("the town's parks: the drawn faces are the ridden profiles", () => {
  for (const p of TOWN_PARKS) {
    const park = new SkatePark(parkPieces(p));
    const geo = skateParkGeometry(p);
    const pts = samples(park, p.x0, p.z0, p.x1, p.z1, 0.37);
    assert.ok(pts.length > 300, `${p.key}: ${pts.length} points`);
    const face = geo.face;
    assert.ok(face);
    let bad = 0;
    for (const q of pts) {
      // (the face, or the steel where a rod lies over it — a rail over a tread: the face's under it)
      const h = hitAt(face, q.x, q.z, q.top + 0.3);
      // (the flat bottom of a pipe drawn a hair over the floor)
      const want = q.top - p.h < 1e-6 ? q.top + 0.004 : q.top;
      if (h === null || Math.abs(h - want) > 0.006) {
        bad++;
        if (bad < 6) console.log(p.key, q.x.toFixed(2), q.z.toFixed(2), h, want);
      }
    }
    assert.equal(bad, 0, `${p.key}: ${bad} of ${pts.length} points off the profile`);
  }
});
