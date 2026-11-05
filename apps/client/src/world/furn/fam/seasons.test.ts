import assert from "node:assert/strict";
import { test } from "node:test";
import { ART_PX, entry, hangSize } from "@yutopia/shared";
import { type BufferGeometry, Euler, Matrix4, Vector3 } from "three";
import { type LivePart, Model } from "../kit";
import { liveAt } from "../liveparts";
import { DRAW, LOOKS } from "./seasons";

// Plan 68 phase 20 (docs/plan/68-more-furniture.md): the other seasons — every kind and look on its
// footprint (a wall piece on its wall, between the heights it hangs at; the paper chains under the
// ceiling and over heads; the jack-o'-lantern in its 1×1 frame), under 8k tris; the jack-o'-lantern's
// face lit and flickering while it's lit, dark when it's out, its candle in its open top; the bunting
// spelling its words.

const CEILING = 3.27;
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

test("seasons: every look on its footprint, on the floor or its wall, under the ceiling, under 8k tris", () => {
  const bad: string[] = [];
  for (const kind of Object.keys(LOOKS)) {
    const e = entry(kind);
    assert.equal(LOOKS[kind].length, e.variants ?? 1, `${kind}: a look a variant`);
    assert.ok(!e.outdoor, `${kind}: indoors and out`);
    for (let variant = 0; variant < (e.variants ?? 1); variant++)
      for (const id of IDS) {
        const g = model(kind, { variant }, id);
        const b = bounds(g);
        const what = `${kind} ${variant} (${id})`;
        const [w, h] = e.onSurface ? [1, 1] : [e.w, e.h];
        if (!(b.x0 >= -0.005 && b.x1 <= w + 0.005 && b.z0 >= -0.005 && b.z1 <= h + 0.005))
          bad.push(`${what}: off its footprint ${JSON.stringify(b)}`);
        if (b.y1 > CEILING + 0.005) bad.push(`${what}: over the ceiling (${b.y1.toFixed(3)})`);
        if (e.wall) {
          // (on the wall's face, between the heights hang.ts has it at)
          const [, lo, hi] = hangSize(kind);
          if (b.z0 < 0.099) bad.push(`${what}: behind the wall's face`);
          if (Math.abs(b.y0 - lo) * ART_PX > 1.5 || Math.abs(b.y1 - hi) * ART_PX > 1.5)
            bad.push(`${what}: hangs ${b.y0.toFixed(3)}–${b.y1.toFixed(3)} m, not ${lo}–${hi}`);
        } else if (kind === "paper_chains") {
          if (b.y0 < 2.4) bad.push(`${what}: under heads (${b.y0.toFixed(2)})`);
        } else if (!(b.y0 > -0.02 && b.y0 < 0.02)) bad.push(`${what}: on the floor (${b.y0.toFixed(3)})`);
        if (tris(g) >= 8000) bad.push(`${what}: ${tris(g)} tris`);
      }
  }
  assert.deepEqual(bad, []);
});

test("the jack-o'-lantern: lit, its face flickers; out, dark; its candle in its open top", () => {
  for (let variant = 0; variant < 3; variant++) {
    const f = live("jack_o_lantern", { variant }).filter((p) => p.anim.kind === "blink");
    assert.ok(f.length >= 2 && f.every((p) => p.glow), `jack-o'-lantern ${variant}: flickers`);
    const seen = new Set([0, 0.1, 0.2, 0.3, 0.4, 0.5].map((t) => f.map((p) => liveAt(p.anim, t).shown).join()));
    assert.ok(seen.size > 1, `jack-o'-lantern ${variant}: its flicker changes`);
    assert.ok(model("jack_o_lantern", { variant }).userData.glow, `jack-o'-lantern ${variant}: its face lit`);
    assert.equal(live("jack_o_lantern", { variant, on: false }).length, 0, `jack-o'-lantern ${variant}: out`);
    assert.ok(!model("jack_o_lantern", { variant, on: false }).userData.glow, `jack-o'-lantern ${variant}: dark`);
  }
  const candle = live("jack_o_lantern", { variant: 2 }).find((p) => p.anim.kind === "flame");
  assert.ok(candle?.glow, "the candle in its open top");
  assert.notEqual(liveAt(candle.anim, 0.3).scale[1], liveAt(candle.anim, 0).scale[1], "its flame flickers");
});

test("the bunting spells HAPPY BIRTHDAY; the other seasons' pieces are still", () => {
  const n = (variant: number) => model("bunting", { variant }).attributes.position.count;
  assert.ok(n(2) > n(0), "a letter a flag");
  for (const kind of ["pumpkins", "leaf_garland", "bunting", "paper_chains"])
    for (let variant = 0; variant < 3; variant++)
      assert.equal(live(kind, { variant }).length, 0, `${kind} ${variant}: still`);
});
