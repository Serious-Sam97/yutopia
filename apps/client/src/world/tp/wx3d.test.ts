import assert from "node:assert/strict";
import { test } from "node:test";
import { groundsRng } from "@yutopia/shared/grounds";
import { BoxGeometry } from "three";
import { G, tinted } from "./campus";
import { landAround } from "./land-block";
import { driftAlong, flatSnow, icicles, slopeSnow, snowBox } from "./snow3d";
import {
  AT,
  BURIED,
  growOf,
  isSnow,
  layerShader,
  mergeGeometries,
  pieceAt,
  pressShader,
  SHOWN,
  smoothAt,
  WxEase,
  wx,
  wxHold,
} from "./wx3d";

// The snow as a layer (docs/plan/65-the-weather.md, phase 3): the pieces tagged where they're made,
// grown by the snow lying, gone under it; the dusting's shader on what it's put on.

const tags = (g: { getAttribute(n: string): { array: ArrayLike<number> } | undefined }) => {
  const a = g.getAttribute("wxTag")?.array;
  return a ? Array.from(a) : [];
};

test("a piece grows from its threshold over a fifth of the snow, all of it by snow 1, none at 0", () => {
  for (const [lo, hi] of Object.values(AT)) {
    assert.ok(hi <= 0.78 + 1e-9, "every kind grown by snow 1");
    for (const at of [lo, hi]) {
      assert.equal(growOf(at, 0, 0), 0);
      assert.equal(growOf(at, 1, 0), 1);
      assert.ok(growOf(at, at, 0) < SHOWN, "at its threshold: not there yet");
    }
  }
  // (rising, never back)
  let was = 0;
  for (let s = 0; s <= 1; s += 0.01) {
    const g = growOf(0.5, s, 0);
    assert.ok(g >= was - 1e-12);
    was = g;
  }
  // going, the shapes outlast the dusting: still there with less lying than they came in at
  assert.ok(growOf(0.5, 0.4, 1) > 0.5 && growOf(0.5, 0.4, 0) === 0);
});

test("each piece's threshold is its own and in its kind's range; a smooth one has no steps", () => {
  const seen = new Set<number>();
  for (let i = 0; i < 200; i++) {
    const v = pieceAt(i * 3.7, -i * 1.3, 0.4, 0.72);
    assert.ok(v >= 0.4 && v <= 0.72);
    seen.add(Math.round(v * 100));
  }
  assert.ok(seen.size > 20, "spread over its range");
  // a tile along, never more than a little different
  for (let x = -40; x < 40; x += 0.5) {
    const a = smoothAt(x, 7.3, 0.45, 0.74);
    const b = smoothAt(x + 0.5, 7.3, 0.45, 0.74);
    assert.ok(a >= 0.45 && a <= 0.74);
    assert.ok(Math.abs(a - b) < 0.06, `${a} → ${b} at ${x}`);
  }
});

test("the builder tags only what's made as snow, the rest none; tinted's too", () => {
  const g = new G().color(0x333333);
  g.box(0, 0, 0, 1, 1, 1);
  snowBox(g.color(0xffffff), 0, 1, 0, 1, 1.2, 1);
  g.color(0x333333).box(2, 0, 0, 3, 1, 1);
  const t = tags(g.build());
  assert.equal(t.length, (36 * 3 * 2) / 1, "a tag a vertex");
  const per = (k: number) => t.slice(k * 72, k * 72 + 72);
  assert.ok(
    per(0).every((v) => v === 0),
    "the box under it: none",
  );
  assert.ok(
    per(2).every((v) => v === 0),
    "the box after it: none",
  );
  const snow = per(1);
  for (let i = 0; i < snow.length; i += 2) {
    assert.ok(snow[i + 1] < 0 && -snow[i + 1] >= AT.cap[0] && -snow[i + 1] <= AT.cap[1], "its threshold, negated");
    // (its own height, and a centimetre into what it's on: not flickering against its top)
    assert.ok(snow[i] >= 0.01 - 1e-6 && snow[i] <= 0.21 + 1e-6, "pressed down by its own height and a centimetre");
  }
  // (one all at once: every vertex the same threshold)
  assert.equal(new Set(snow.filter((_, i) => i % 2)).size, 1);
  // nothing made as snow: no tags at all
  const plain = new G();
  plain.box(0, 0, 0, 1, 1, 1);
  assert.equal(isSnow(plain.build()), false);
  // tinted: a threshold makes it snow, pressed to its own foot
  const cone = tinted(new BoxGeometry(1, 0.4, 1).translate(0, 2.2, 0), 0xffffff, 0.5);
  const ct = tags(cone);
  for (let i = 0; i < ct.length; i += 2) {
    assert.equal(ct[i + 1], Math.fround(-0.5));
    assert.ok(Math.abs(ct[i]) < 1e-6 || Math.abs(ct[i] - 0.4) < 1e-6);
  }
  assert.equal(isSnow(tinted(new BoxGeometry(1, 1, 1), 0x222222)), false);
});

test("a drift comes in by its own places, out of the ground; a roof's slab, a flat top and icicles all at once", () => {
  const ground = (x: number, z: number) => 0.1 * Math.sin(x * 0.3) + 0.05 * z;
  const g = new G();
  driftAlong(g, [0, 0], [12, 0], [0, 1], ground, groundsRng(3), { h: 0.6, w: 1.8 });
  const pos = Array.from(g.build().getAttribute("position").array);
  const t = tags(g.build());
  assert.ok(t.length > 0);
  const ats = new Set<number>();
  for (let i = 0, v = 0; i < t.length; i += 2, v += 3) {
    const at = -t[i + 1];
    assert.ok(at > BURIED, "buried when gone, never dropped");
    ats.add(Math.round((at - BURIED) * 1000));
    // pressed: under the ground where it is
    const y = pos[v + 1] - t[i];
    assert.ok(y < ground(pos[v], pos[v + 2]) - 0.45 + 1e-6, `${y} under ${ground(pos[v], pos[v + 2])}`);
  }
  assert.ok(ats.size > 3, "its places in at their own");
  // a roof's slab: one threshold; pressed onto the slope (never through it)
  const r = new G();
  slopeSnow(r, [0, 5, 0], [6, 5, 0], [0, 3, 2], [6, 3, 2], 0.3, groundsRng(5), 0);
  const rt = tags(r.build());
  const rp = Array.from(r.build().getAttribute("position").array);
  assert.equal(new Set(rt.filter((_, i) => i % 2)).size, 1);
  for (let i = 0, v = 0; i < rt.length; i += 2, v += 3) {
    // the slope: y = 5 − (z / 2) × 2 = 5 − z
    const onSlope = 5 - rp[v + 2];
    const pressed = rp[v + 1] - rt[i];
    assert.ok(pressed <= Math.max(rp[v + 1], onSlope) + 1e-6);
    if (rp[v + 2] >= 0 && rp[v + 2] <= 2) assert.ok(pressed >= onSlope - 1e-3, `${pressed} through ${onSlope}`);
  }
  const f = new G();
  flatSnow(f, 0, 0, 4, 4, 2, 0.3, groundsRng(9));
  const ft = tags(f.build());
  const fp = Array.from(f.build().getAttribute("position").array);
  for (let i = 0, v = 0; i < ft.length; i += 2, v += 3) assert.ok(Math.abs(fp[v + 1] - ft[i] - 1.98) < 1e-5);
  const ic = new G();
  icicles(ic, [0, 3, 0], [5, 3, 0], groundsRng(11), 1);
  const it = tags(ic.build());
  const ip = Array.from(ic.build().getAttribute("position").array);
  for (let i = 0, v = 0; i < it.length; i += 2, v += 3) {
    assert.ok(-it[i + 1] >= AT.icicle[0] - 1e-6, "the icicles last");
    assert.ok(Math.abs(ip[v + 1] - it[i] - 3) < 1e-5, "drawn up into the edge they hang from");
  }
});

test("merging snow with what it lies on: the rest given empty tags, not dropped", () => {
  const a = tinted(new BoxGeometry(1, 1, 1), 0x333333);
  const b = tinted(new BoxGeometry(1, 0.2, 1).translate(0, 0.6, 0), 0xffffff, 0.4);
  const m = mergeGeometries([a, b]);
  assert.ok(m, "merged");
  const t = tags(m);
  assert.equal(t.length, m.getAttribute("position").count * 2);
  const n = a.getAttribute("position").count;
  assert.ok(t.slice(0, n * 2).every((v) => v === 0));
  assert.ok(t.slice(n * 2).every((v, i) => (i % 2 ? v === Math.fround(-0.4) : v >= 0)));
  // (none of them snow: as three's)
  const c = mergeGeometries([tinted(new BoxGeometry(1, 1, 1), 1), tinted(new BoxGeometry(1, 1, 1), 2)]);
  assert.equal(isSnow(c), false);
});

test("the shaders: the press on the vertex, the dusting by kind, none on a 'none'", () => {
  const sh = () => ({
    uniforms: {} as Record<string, unknown>,
    vertexShader: "#include <common>\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\n}",
    fragmentShader: "#include <common>\nvoid main() {\n#include <emissivemap_fragment>\n}",
  });
  const p = sh();
  pressShader(p);
  assert.match(p.vertexShader, /attribute vec2 wxTag/);
  assert.match(p.vertexShader, /transformed\.y -= wxTag\.x/);
  assert.match(p.vertexShader, /gl_Position = vec4\(0\.0, 0\.0, 2\.0, 1\.0\)/);
  assert.equal(p.uniforms.wxSnow, wx.wxSnow, "the same uniform object everywhere");
  const land = sh();
  layerShader(land, "land");
  assert.match(land.fragmentShader, /#define WX_LAND/);
  assert.match(land.fragmentShader, /diffuseColor\.rgb = mix\(diffuseColor\.rgb/);
  assert.ok(land.fragmentShader.indexOf("wxGrain") < land.fragmentShader.indexOf("#include <emissivemap_fragment>"));
  assert.equal(land.uniforms.wxRoofs, wx.wxRoofs);
  const none = sh();
  layerShader(none, "none");
  assert.doesNotMatch(none.fragmentShader, /wxGrain/);
  assert.match(none.vertexShader, /wxTag/, "the press still");
});

test("the view's ease: at once the first time, then eased; going when it falls; held for the stills", () => {
  const e = new WxEase();
  e.step(0.016, 0.8, 0);
  assert.equal(wx.wxSnow.value, 0.8);
  assert.equal(wx.wxMelt.value, 0);
  e.step(1, 0.6, 1000);
  assert.ok(wx.wxSnow.value < 0.8 && wx.wxSnow.value > 0.6, "eased");
  // (a call made now: at once)
  e.step(0.016, 0, 1016);
  assert.equal(wx.wxSnow.value, 0);
  e.step(0.016, 0.6, 1032);
  assert.equal(wx.wxSnow.value, 0.6);
  // falling for a minute: going, over two
  let t = 1000;
  for (let i = 0; i < 300; i++) {
    t += 1000;
    e.step(1, 0.6 - i * 0.0005, t);
  }
  assert.ok(wx.wxMelt.value > 0.8, `${wx.wxMelt.value}`);
  // rising again: coming
  for (let i = 0; i < 400; i++) {
    t += 1000;
    e.step(1, 0.5 + i * 0.0005, t);
  }
  assert.ok(wx.wxMelt.value < 0.2, `${wx.wxMelt.value}`);
  // held: the room's left out
  wxHold.on = true;
  wx.wxSnow.value = 0.3;
  e.step(1, 1, t + 1000);
  assert.equal(wx.wxSnow.value, 0.3);
  wxHold.on = false;
  e.set(1, 0);
  assert.equal(wx.wxSnow.value, 1);
});

test("the icicles: only freezing after a thaw — snow lying with its meltwater about — and gone above +1 °C", () => {
  const e = new WxEase();
  // coming in: at once, by the weather now
  e.icicles(0, 0.9, 0.5, -3);
  assert.equal(wx.wxIcicle.value, 1);
  // a thaw: they drip away over half an hour
  for (let i = 0; i < 900; i++) e.icicles(1, 0.9, 0.7, 4);
  assert.ok(wx.wxIcicle.value > 0.4 && wx.wxIcicle.value < 0.6, `${wx.wxIcicle.value}`);
  for (let i = 0; i < 1000; i++) e.icicles(1, 0.9, 0.7, 4);
  assert.equal(wx.wxIcicle.value, 0);
  // a first snow, freezing but dry: none (nothing's melted to freeze)
  for (let i = 0; i < 3600; i++) e.icicles(1, 0.9, 0, -5);
  assert.equal(wx.wxIcicle.value, 0);
  // freezing again after the thaw, the meltwater about: they grow
  for (let i = 0; i < 1800; i++) e.icicles(1, 0.9, 0.5, -3);
  assert.ok(wx.wxIcicle.value > 0.999, `${wx.wxIcicle.value}`);
});

test("the green's land: two blocks side by side agree on their shared edge (no seam)", () => {
  // (woods to the west of x 7, a path along z 3: across both blocks)
  const land = (x: number, z: number) => (x < 7 ? "deep" : Math.abs(z - 3) < 1 ? "path" : "snow");
  const n = 8;
  const step = 1;
  const block = (x0: number) => landAround((i, j) => land(x0 + i * step, j * step), n, step);
  const a = block(0);
  const b = block(n * step);
  for (let j = 0; j <= n; j++) {
    const ea = (j * (n + 1) + n) * 2;
    const eb = j * (n + 1) * 2;
    assert.ok(Math.abs(a[ea] - b[eb]) < 1e-6, `the woods at the edge, row ${j}: ${a[ea]} vs ${b[eb]}`);
    assert.ok(Math.abs(a[ea + 1] - b[eb + 1]) < 1e-6, `a way near at the edge, row ${j}`);
  }
});
