import assert from "node:assert/strict";
import { test } from "node:test";
import { AdditiveBlending, Color, MeshBasicMaterial, ShaderChunk } from "three";
import { farFor, flatLight, fogColour, inkLeft, installFog, mf, roomBounds } from "./fog3d";

// The morning fog in 3D (docs/plan/64-the-fog.md, F2).

type Shader = Parameters<MeshBasicMaterial["onBeforeCompile"]>[0];
const shader = (withFog = true): Shader =>
  ({
    uniforms: {},
    vertexShader: "",
    fragmentShader: withFog ? "#include <fog_fragment>" : "void main() {}",
  }) as unknown as Shader;

test("the chunks: three's own fog kept, the morning's after it; swapped once", () => {
  installFog();
  installFog();
  assert.ok(ShaderChunk.fog_vertex.includes("vFogDepth = - mvPosition.z;"));
  assert.equal(ShaderChunk.fog_vertex.split("vFogW =").length, 2, "the world position once");
  assert.ok(ShaderChunk.fog_pars_fragment.includes("uniform float fogNear;"));
  assert.equal(ShaderChunk.fog_pars_fragment.split("uniform float mfA;").length, 2);
  // the day's (and a storm's) by the stretch outside the room I'm in; a decal multiplied in to white
  assert.ok(ShaderChunk.fog_fragment.includes("smoothstep( fogNear, fogFar, vFogDepth * mfOut / mfL )"));
  assert.ok(ShaderChunk.fog_fragment.includes("#if defined( MF_WHITE )"));
  assert.ok(ShaderChunk.fog_fragment.includes("#ifndef MF_MORNING_ONLY"));
  // (nothing of the morning's runs without it: an unset uniform is 0)
  assert.ok(ShaderChunk.fog_fragment.includes("if ( mfA > 0.0 )"));
  // the haze by the heights at the ray's ends, each at least the lifted floor: never an exp of a
  // long way down (inf − inf: a NaN, and the bloom blacks out the frame with it)
  assert.ok(ShaderChunk.fog_fragment.includes("max( mfRo.y, mfYb )"));
  assert.ok(ShaderChunk.fog_fragment.includes("max( vFogW.y, mfYb )"));
  assert.ok(!/exp\( - mfK|mfSpan/.test(ShaderChunk.fog_fragment));
  assert.equal(mf.mfLift.value, -1000, "not lifted till it's set");
});

test("every material's own hook still runs, and a shader with the fog gets the fog's uniforms", () => {
  const plain = new MeshBasicMaterial();
  const s0 = shader();
  plain.onBeforeCompile(s0, undefined as never);
  assert.equal(s0.uniforms.mfA, mf.mfA, "the same object: set once a frame, seen by all");
  const s1 = shader(false);
  plain.onBeforeCompile(s1, undefined as never);
  assert.equal(s1.uniforms.mfA, undefined, "none for a shader without the fog");

  let ran = 0;
  const own = new MeshBasicMaterial();
  own.onBeforeCompile = (s) => {
    ran++;
    s.fragmentShader += "\n// own";
  };
  const s2 = shader();
  own.onBeforeCompile(s2, undefined as never);
  assert.equal(ran, 1);
  assert.ok(s2.fragmentShader.endsWith("// own"));
  assert.equal(s2.uniforms.mfCol, mf.mfCol);
  // its program's key is its own hook's: two hooks, two programs; none, the same
  assert.notEqual(own.customProgramCacheKey(), plain.customProgramCacheKey());
  assert.equal(new MeshBasicMaterial().customProgramCacheKey(), plain.customProgramCacheKey());
});

test("a hook that keeps the one it found and calls it from a new one: each once, never itself", () => {
  const m = new MeshBasicMaterial();
  const calls: string[] = [];
  m.onBeforeCompile = () => calls.push("first");
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    prev.call(m, s, r);
    calls.push("second");
  };
  const s = shader();
  m.onBeforeCompile(s, undefined as never);
  assert.deepEqual(calls, ["first", "second"]);
  assert.equal(s.uniforms.mfA, mf.mfA);
});

test("its colour: the land's light (black in the dark), blue grey at first light, warm by 7:30, the wall's grey", () => {
  const c = new Color();
  fogColour(c, new Color(0, 0, 0), 5.5, 0);
  assert.deepEqual([c.r, c.g, c.b], [0, 0, 0]);
  const land = new Color(0.8, 0.8, 0.8);
  fogColour(c, land, 6, 0);
  assert.ok(c.b > c.r, "first light: blue grey");
  fogColour(c, land, 7.75, 0);
  assert.ok(c.r > c.b, "7:45: warm");
  const warm = c.r - c.b;
  fogColour(c, land, 7.75, 1);
  assert.ok(c.r - c.b < warm * 0.4, "the wall: greyed");
  // never past white
  fogColour(c, new Color(2, 2, 2), 9, 0);
  assert.ok(c.r <= 1 && c.g <= 1 && c.b <= 1);
});

test("in the wall the camera sees no further than the fog; the light goes flat", () => {
  assert.equal(farFor(0, 1400), 1400);
  const far = farFor(1, 1400);
  assert.ok(far > 35 && far < 60, `${far}`);
  assert.ok(farFor(0.35, 1400) > far);
  assert.equal(farFor(1, 30), 30, "never further than it was");
  assert.ok(inkLeft(far - 10, 1, 1) < 0.001, "nothing left there to draw");
  assert.deepEqual(flatLight(0), { sun: 1, fill: 1 });
  assert.deepEqual(flatLight(1), { sun: 0, fill: 1.6 });
  assert.ok(flatLight(0.35).sun > 0.4 && flatLight(0.8).sun < 0.05, "back as it lifts, none in it");
});

test("the room I'm in: its indoor tiles' bounds, none out on the lot", () => {
  // a hall and an office through a door, the lot's asphalt west, nothing north
  const tiles = ["          ", "aaa.....  ", "aaa.....  ", "aaa...ww  ", "aaa   ww  "];
  const open = (ch: string | undefined) => !ch || ch === " " || ch === "a";
  // (asked of cells, within the floor's extent — its corner anywhere: here at 20, -7)
  const [ox, oy] = [20, -7];
  const cell = (x: number, y: number) => tiles[y - oy]?.[x - ox];
  const ext = { x0: ox, y0: oy, x1: ox + 10, y1: oy + tiles.length };
  const at = (x: number, y: number) => roomBounds(cell, ext, x + ox, y + oy, open);
  const back = (r: ReturnType<typeof at>) => r && { x0: r.x0 - ox, y0: r.y0 - oy, x1: r.x1 - ox, y1: r.y1 - oy };
  assert.equal(at(1, 2), null);
  assert.equal(at(0, 0), null);
  assert.deepEqual(back(at(4, 2)), { x0: 3, y0: 1, x1: 8, y1: 5 });
  assert.deepEqual(back(at(6, 4)), { x0: 3, y0: 1, x1: 8, y1: 5 });
});

test("the ink's lines go with the fog: all of them close, none deep in the wall", () => {
  assert.equal(inkLeft(10, 0, 0), 1);
  assert.ok(inkLeft(3, 0, 1) > 0.99);
  assert.ok(inkLeft(21, 0, 1) < 0.1);
  assert.ok(inkLeft(150, 1, 0) < 0.1 && inkLeft(20, 1, 0) > 0.6, "the haze's: ~150 m");
});

test("a light added in fogs to nothing, not a grey patch, and carries three times as far", () => {
  assert.ok(ShaderChunk.fog_fragment.includes("#elif defined( MF_ADD )"));
  assert.ok(ShaderChunk.fog_fragment.includes("mfOd = mfOd / 3.0 + mfOw / 9.0;"));
  const glow = new MeshBasicMaterial({ blending: AdditiveBlending, transparent: true });
  const s = shader();
  glow.onBeforeCompile(s, undefined as never);
  assert.ok(s.fragmentShader.startsWith("#define MF_ADD\n"));
  const plain = new MeshBasicMaterial({ transparent: true });
  const p = shader();
  plain.onBeforeCompile(p, undefined as never);
  assert.ok(!p.fragmentShader.includes("MF_ADD"));
  // (its own program: the same hook, but not the same fog)
  assert.notEqual(glow.customProgramCacheKey(), plain.customProgramCacheKey());
});

test("a material's own program key kept, an added light's marked whoever set it; keys that call the one they found, once each", () => {
  // (the light map gives every material it lights the same key: a glow among them still its own)
  const lit = new MeshBasicMaterial();
  lit.customProgramCacheKey = () => "yutopia-lightmap";
  const glow = new MeshBasicMaterial({ blending: AdditiveBlending });
  glow.customProgramCacheKey = () => "yutopia-lightmap";
  assert.equal(lit.customProgramCacheKey(), "yutopia-lightmap");
  assert.equal(glow.customProgramCacheKey(), "yutopia-lightmap|add");
  // a key that wraps the one it found (pets3d.ts, chars' model.ts)
  const m = new MeshBasicMaterial();
  m.onBeforeCompile = () => {};
  const prev = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${prev.call(m)}|rim`;
  const prev2 = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${prev2.call(m)}|legs`;
  assert.ok(m.customProgramCacheKey().endsWith("|rim|legs"), m.customProgramCacheKey());
  // one material's key handed to another (person3d.ts): the other's own hook read, not the first's
  const a = new MeshBasicMaterial();
  a.onBeforeCompile = (sh) => {
    sh.vertexShader += "hook-a";
  };
  const b = new MeshBasicMaterial();
  b.onBeforeCompile = (sh) => {
    sh.vertexShader += "hook-b";
  };
  b.customProgramCacheKey = a.customProgramCacheKey;
  assert.ok(b.customProgramCacheKey().includes("hook-b"), b.customProgramCacheKey());
});
