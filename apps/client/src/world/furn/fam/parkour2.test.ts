import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, quarterYaw, STAND } from "@yutopia/shared";
import { type BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import type { LivePart } from "../kit";
import { liveAt } from "../liveparts";
import { modelOf } from "../native";
import { MAX_TRIS } from "../tris-limit";
import { LOOKS } from "./parkour2";

// Plan 68 phase 17 (docs/plan/68-more-furniture.md): the parkour pieces — every look on its footprint,
// on the ground, under 8k tris; each stood on where the jump table says (STAND: its top under the
// middle of what's stood on); the zip line's handle swaying, the cable from pole to pole.

const KINDS = Object.keys(LOOKS);

function bounds(g: BufferGeometry) {
  const p = g.attributes.position.array;
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  const take = (x: number, y: number, z: number) => {
    b.x0 = Math.min(b.x0, x);
    b.x1 = Math.max(b.x1, x);
    b.y0 = Math.min(b.y0, y);
    b.y1 = Math.max(b.y1, y);
    b.z0 = Math.min(b.z0, z);
    b.z1 = Math.max(b.z1, z);
  };
  for (let i = 0; i < p.length; i += 3) take(p[i], p[i + 1], p[i + 2]);
  // (its live parts where they rest)
  for (const l of (g.userData.live as LivePart[]) ?? []) {
    const q = l.geo.attributes.position.array;
    for (let i = 0; i < q.length; i += 3) take(q[i] + l.at[0], q[i + 1] + l.at[1], q[i + 2] + l.at[2]);
  }
  return b;
}

/** What's hit looking straight down at (x, z) from `from` m up: its height (0: nothing). */
function topAt(g: BufferGeometry, x: number, z: number, from: number): number {
  const ray = new Raycaster(new Vector3(x, from, z), new Vector3(0, -1, 0));
  const hit = ray.intersectObject(new Mesh(g, new MeshBasicMaterial({ side: DoubleSide })))[0];
  return hit ? hit.point.y : 0;
}

const model = (kind: string, variant: number, id = "p") =>
  modelOf({ id, kind, x: 0, y: 0, yaw: quarterYaw(0), props: { variant } });

test("parkour: every look on its footprint, on the ground, out of doors, solid, under 8k tris", () => {
  for (const kind of KINDS) {
    const e = entry(kind);
    assert.equal(e.variants ?? 1, LOOKS[kind].length, `${kind}: a name a look`);
    assert.ok(e.outdoor && e.solid && e.buildable, `${kind}: out of doors, solid, built`);
    for (let v = 0; v < LOOKS[kind].length; v++) {
      const g = model(kind, v);
      const b = bounds(g);
      const what = `${kind} ${v}`;
      assert.ok(
        b.x0 >= -0.005 && b.x1 <= e.w + 0.005 && b.z0 >= -0.005 && b.z1 <= e.h + 0.005,
        `${what}: on its footprint`,
      );
      assert.ok(b.y0 > -0.01 && b.y0 < 0.02, `${what}: on the ground (${b.y0.toFixed(3)})`);
      assert.ok(b.y1 < 4, `${what}: ${b.y1.toFixed(2)} m`);
      assert.ok(
        g.attributes.position.count / 3 < MAX_TRIS,
        `${what}: under 8k tris (${g.attributes.position.count / 3})`,
      );
    }
  }
});

test("parkour: stood on at the jump table's height", () => {
  // (where on each its top is stood: x, z in its frame)
  const spots: Record<string, [number, number][]> = {
    pk_vault_box: [
      [0.6, 0.5],
      [1, 0.5],
      [1.4, 0.5],
    ],
    pk_beam: [
      [0.8, 0.5],
      [2, 0.5],
      [3.2, 0.5],
    ],
    pk_trampoline: [
      [1.5, 1.5],
      [1, 1.2],
      [2, 1.9],
    ],
    pk_quarter_pipe: [
      [0.5, 0.6],
      [2.5, 1.0],
    ],
    pk_zip_line: [
      [0.6, 0.3],
      [0.8, 0.7],
    ],
    pk_tyre_run: [[0.48 + 0.28, 0.62]],
    pk_climb_wall: [
      [0.5, 0.5],
      [3.5, 0.5],
    ],
  };
  for (const [kind, at] of Object.entries(spots)) {
    const want = STAND[kind];
    assert.ok(want !== undefined, `${kind}: in the jump table`);
    for (let v = 0; v < LOOKS[kind].length; v++)
      for (const [x, z] of at) {
        const h = topAt(model(kind, v), x, z, want + 0.25);
        assert.ok(
          Math.abs(h - want) < 0.04,
          `${kind} ${v}: its top at (${x}, ${z}) is ${h.toFixed(3)}, stood at ${want}`,
        );
      }
  }
});

test("parkour: the quarter pipe's face rises from its toe to its lip; the monkey bars walked under", () => {
  for (let v = 0; v < 3; v++) {
    const g = model("pk_quarter_pipe", v);
    const hs = [2.9, 2.5, 2.1, 1.8, 1.6].map((z) => topAt(g, 1.5, z, 1.6));
    for (let i = 1; i < hs.length; i++)
      assert.ok(hs[i] > hs[i - 1], `quarter pipe ${v}: rising (${hs.map((h) => h.toFixed(2))})`);
    assert.ok(hs[0] < 0.08, "its toe at the ground");
    const bars = model("pk_monkey_bars", v);
    // (nothing between its ends under 2.1 m along its middle)
    for (const x of [0.6, 2, 3.4]) assert.ok(topAt(bars, x, 0.5, 2.1) === 0, `monkey bars ${v}: clear under at ${x}`);
    assert.ok(topAt(bars, 1.833, 0.5, 2.6) > 2.15, `monkey bars ${v}: its bars overhead`);
  }
});

test("parkour: the zip line's cable from pole to pole, its handle hanging at the start and swaying", () => {
  for (let v = 0; v < 2; v++) {
    const g = model("pk_zip_line", v);
    const live = g.userData.live as LivePart[];
    const sway = live.filter((p) => p.anim.kind === "nod");
    assert.ok(sway.length >= 1, `zip line ${v}: its trolley hangs live`);
    assert.ok(Math.abs(liveAt(sway[0].anim, 0.8).turn[1] - liveAt(sway[0].anim, 0).turn[1]) > 0.01, "it sways");
    // (the handle within reach from the platform: 0.9 + a 1.79 m body's raised hands, ~2.2 over it)
    const hb = bounds(g);
    const low = Math.min(
      ...sway.map((p) => {
        const q = p.geo.attributes.position.array;
        let m = Infinity;
        for (let i = 1; i < q.length; i += 3) m = Math.min(m, q[i] + p.at[1]);
        return m;
      }),
    );
    assert.ok(low > 2.2 && low < 2.6, `zip line ${v}: its handle at ${low.toFixed(2)}`);
    assert.ok(hb.x1 > 9.6, "to the end pole");
  }
});
