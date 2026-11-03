import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, SEAT_SPEC, SURFACE } from "@yutopia/shared";
import { type BufferGeometry, DoubleSide, Euler, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { type LivePart, Model } from "../kit";
import { liveAt } from "../liveparts";
import { DRAW, LOOKS } from "./outdoors";

// Plan 68 phase 19 (docs/plan/68-more-furniture.md): the Outdoors — every kind and look on its
// footprint, on the ground, under 8k tris, only out of doors; the seats and the picnic table's top at
// their spec; the live parts there and moving: the fire's flames (none when it's out), the flag swinging
// round its pole, the birds pecking and coming and going, the heater's glow; what a seed picks inside
// what every one of a kind takes up.

type B = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };

/** The box round a model, its live parts at rest included. */
function bounds(g: BufferGeometry): B {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  const add = (x: number, y: number, z: number) => {
    b.x0 = Math.min(b.x0, x);
    b.x1 = Math.max(b.x1, x);
    b.y0 = Math.min(b.y0, y);
    b.y1 = Math.max(b.y1, y);
    b.z0 = Math.min(b.z0, z);
    b.z1 = Math.max(b.z1, z);
  };
  const pos = g.attributes.position.array;
  for (let i = 0; i < pos.length; i += 3) add(pos[i], pos[i + 1], pos[i + 2]);
  const glow = g.userData.glow as BufferGeometry | null;
  if (glow) {
    const p = glow.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) add(p[i], p[i + 1], p[i + 2]);
  }
  for (const part of (g.userData.live as LivePart[]) ?? []) {
    const m = new Matrix4().makeRotationFromEuler(new Euler(part.rot[0], part.rot[1], part.rot[2], "YXZ"));
    m.setPosition(...part.at);
    const p = part.geo.attributes.position;
    const v = new Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      add(v.x, v.y, v.z);
    }
  }
  return b;
}
const tris = (g: BufferGeometry) =>
  (g.attributes.position.count +
    ((g.userData.glow as BufferGeometry | null)?.attributes.position.count ?? 0) +
    ((g.userData.live as LivePart[]) ?? []).reduce((n, p) => n + p.geo.attributes.position.count, 0)) /
  3;
/** What's hit looking straight down at (x, z) from `from` m up: its height (0: nothing). */
function topAt(g: BufferGeometry, x: number, z: number, from: number): number {
  const ray = new Raycaster(new Vector3(x, from, z), new Vector3(0, -1, 0));
  const hit = ray.intersectObject(new Mesh(g, new MeshBasicMaterial({ side: DoubleSide })))[0];
  return hit ? hit.point.y : 0;
}

// (drawn as native.ts draws a kind of the kit's — a Model at Rich, its look, its seed from its id —
// without the rest of the kit's families: each is its own, built at once by others)
/** native.ts seedOf: 0..1 from an id, in 20 steps. */
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (Math.floor(((h >>> 0) % 1000) / 50) + 0.5) / 20;
}
function model(kind: string, props: Record<string, unknown> = {}, id = "x"): BufferGeometry {
  const m = new Model(2);
  DRAW[kind](m, {
    look: Number(props.variant ?? 0),
    fabric: null,
    seed: seedOf(id),
    occupied: false,
    ...(typeof props.on === "boolean" ? { on: props.on } : {}),
  });
  return m.geometry();
}
const live = (kind: string, props: Record<string, unknown> = {}, id = "x") =>
  (model(kind, props, id).userData.live as LivePart[]) ?? [];
// (seeds: the ids pick a story detail, how many bikes or birds' kinds)
const IDS = ["a", "b1", "c22", "dd3", "e-44", "f555", "g", "h7"];

test("outdoors: every look on its footprint, on the ground, under 8k tris, out of doors", () => {
  const bad: string[] = [];
  for (const kind of Object.keys(LOOKS)) {
    const e = entry(kind);
    assert.equal(LOOKS[kind].length, e.variants ?? 1, `${kind}: a look a variant`);
    assert.ok(e.outdoor, `${kind}: out of doors only`);
    for (let variant = 0; variant < (e.variants ?? 1); variant++)
      for (const id of IDS) {
        const g = model(kind, { variant }, id);
        const b = bounds(g);
        const what = `${kind} ${variant} (${id})`;
        if (!(b.x0 >= -0.005 && b.x1 <= e.w + 0.005 && b.z0 >= -0.005 && b.z1 <= e.h + 0.005))
          bad.push(`${what}: off its footprint ${JSON.stringify(b)}`);
        // (out of doors there's no ceiling: only the flag pole is taller than a room)
        if (b.y1 > (kind === "flag_pole" ? 4.6 : 3.0)) bad.push(`${what}: ${b.y1.toFixed(2)} high`);
        if (!(b.y0 > -0.02 && b.y0 < 0.02)) bad.push(`${what}: on the ground (${b.y0.toFixed(3)})`);
        if (tris(g) >= 8000) bad.push(`${what}: ${tris(g)} tris`);
      }
  }
  assert.deepEqual(bad, []);
});

test("the seats and the picnic table's top where the spec has them", () => {
  for (let variant = 0; variant < 3; variant++) {
    const log = model("log_seat", { variant: variant === 2 ? 0 : variant });
    const s = SEAT_SPEC.log_seat;
    for (const x of [0.6, 1.4]) {
      const h = topAt(log, x, 0.5 + s.front - 0.12, 1);
      assert.ok(Math.abs(h - s.top) < 0.012, `log seat ${variant}: its top at ${h.toFixed(3)}`);
    }
    const t = model("picnic_table", { variant });
    const p = SEAT_SPEC.picnic_table;
    for (const x of [0.7, 1.15])
      for (const z of [0.5, 1.5]) {
        const h = topAt(t, x, z - 0.05, 0.6);
        assert.ok(Math.abs(h - p.top) < 0.012, `picnic table ${variant}: its bench at ${h.toFixed(3)} (${x}, ${z})`);
      }
    // (its top's cells: things stand on its boards)
    const top = entry("picnic_table").top ?? [0, 0, 8, 8];
    for (let cx = top[0]; cx < top[2]; cx++)
      for (let cy = top[1]; cy < top[3]; cy++) {
        const h = topAt(t, (cx + 0.5) / 4, (cy + 0.5) / 4, 1.2);
        assert.ok(Math.abs(h - SURFACE.picnic_table) < 0.012, `picnic table ${variant}: its top at ${h.toFixed(3)}`);
      }
    const bus = model("bus_shelter", { variant });
    const b = SEAT_SPEC.bus_shelter;
    for (const x of [1.0, 2.0]) {
      const h = topAt(bus, x, 0.5 + b.front - 0.1, 0.8);
      assert.ok(Math.abs(h - b.top) < 0.012, `bus shelter ${variant}: its perch at ${h.toFixed(3)}`);
    }
  }
});

test("the live parts: the fire, the flag, the birds, the heater", () => {
  // the fire pit's flames while it's lit, none when it's out
  for (let variant = 0; variant < 3; variant++) {
    const f = live("fire_pit", { variant }).filter((p) => p.anim.kind === "flame");
    assert.ok(f.length >= 6, `fire pit ${variant}: flames`);
    assert.ok(f.every((p) => p.glow));
    assert.equal(live("fire_pit", { variant, on: false }).length, 0, `fire pit ${variant}: out`);
  }
  // the flag swings round its pole: its fly end goes from side to side, its hoist stays put
  for (let variant = 0; variant < 3; variant++) {
    const parts = live("flag_pole", { variant }).filter((p) => p.anim.kind === "nod");
    assert.ok(parts.length >= 2, `flag ${variant}: its cloth and its emblem`);
    const cloth = parts[0];
    const at = (t: number, local: Vector3) => {
      const a = liveAt(cloth.anim, t);
      const m = new Matrix4().makeRotationFromEuler(
        new Euler(cloth.rot[0], cloth.rot[1] + a.turn[0], cloth.rot[2] + a.turn[1], "YXZ"),
      );
      return local
        .clone()
        .applyMatrix4(m)
        .add(new Vector3(...cloth.at));
    };
    // (its fly's corner and its hoist's, in the part's own frame)
    const p = cloth.geo.attributes.position;
    let fly = new Vector3();
    let hoist = new Vector3(1e9, 0, 0);
    for (let i = 0; i < p.count; i++) {
      const v = new Vector3().fromBufferAttribute(p, i);
      if (v.x > fly.x) fly = v;
      if (v.x < hoist.x) hoist = v;
    }
    const zs = [0, 0.8, 1.7, 2.5].map((t) => at(t, fly).z);
    const ys = [0, 0.8, 1.7, 2.5].map((t) => at(t, fly).y);
    assert.ok(Math.max(...zs) - Math.min(...zs) > 0.2, `flag ${variant}: it swings (${zs.map((z) => z.toFixed(2))})`);
    assert.ok(Math.max(...ys) - Math.min(...ys) < 0.02, `flag ${variant}: round the pole, not up and down`);
    assert.ok(at(0, fly).y > 3.6, `flag ${variant}: at the top of its pole`);
    assert.ok(Math.abs(at(1.3, hoist).x - 1) < 0.06, `flag ${variant}: its hoist on the pole`);
  }
  // the birds: two peck (tipping down and back), one comes and goes
  for (let variant = 0; variant < 3; variant++) {
    const parts = live("bird_feeder", { variant });
    const pecks = parts.filter((p) => p.anim.kind === "nod");
    const visits = parts.filter((p) => p.anim.kind === "blink");
    assert.ok(pecks.length >= 4 && visits.length >= 2, `bird feeder ${variant}: its birds`);
    const tips = [0, 0.3, 0.6, 0.9].map((t) => pecks[0].rot[2] + liveAt(pecks[0].anim, t).turn[1]);
    assert.ok(Math.max(...tips) <= 1e-9 && Math.min(...tips) < -0.3, `bird feeder ${variant}: it pecks down`);
    const shown = Array.from({ length: 20 }, (_, i) => liveAt(visits[0].anim, i * 0.6).shown);
    assert.ok(shown.includes(true) && shown.includes(false), `bird feeder ${variant}: one comes and goes`);
  }
  // the heater's head glows while it's on; the tower's flame dances in its glass
  const lit = model("patio_heater", { variant: 0 });
  const out = model("patio_heater", { variant: 0, on: false });
  assert.ok(lit.userData.glow && !out.userData.glow, "the heater's head glows while it's on");
  assert.ok(
    live("patio_heater", { variant: 2 }).some((p) => p.glass),
    "the tower's glass",
  );
  assert.ok(
    live("patio_heater", { variant: 2 }).some((p) => p.anim.kind === "flame"),
    "its flame",
  );
  assert.ok(!live("patio_heater", { variant: 2, on: false }).some((p) => p.anim.kind === "flame"), "out, no flame");
});

test("story details by the seed stay inside what every one of a kind takes up", () => {
  // (the shapes are one a kind: a seed's extras never reach past the kind's own box)
  for (const kind of ["bike_rack", "fire_pit", "ski_rack", "bus_shelter", "mailbox", "snowman", "street_sign"]) {
    const e = entry(kind);
    for (let variant = 0; variant < (e.variants ?? 1); variant++) {
      const bs = IDS.map((id) => bounds(model(kind, { variant }, id)));
      for (const k of ["x0", "x1", "z0", "z1", "y1"] as const) {
        const v = bs.map((b) => b[k]);
        assert.ok(
          Math.max(...v) - Math.min(...v) < 0.05,
          `${kind} ${variant}: its ${k} by the seed ${v.map((x) => x.toFixed(2))}`,
        );
      }
    }
  }
});
