import assert from "node:assert/strict";
import { test } from "node:test";
import { ShaderChunk } from "three";
import { installLifeLamps } from "./life-lamps";

test("the lamps' loops light diffusely, the sun's keeps its own (and every model knows the lamp's)", () => {
  installLifeLamps();
  const s = ShaderChunk.lights_fragment_begin;
  assert.equal((s.match(/RE_Direct_Lamp\(/g) ?? []).length, 2, "the point and the spot lights' calls");
  assert.equal((s.match(/RE_Direct\( directLight/g) ?? []).length, 2, "the sun's and the directional ones' kept");
  const point = s.slice(
    s.indexOf("#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )"),
    s.indexOf("#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )"),
  );
  assert.match(point, /RE_Direct_Lamp\(/);
  assert.match(ShaderChunk.lights_physical_pars_fragment, /void RE_Direct_Lamp\(/);
  for (const k of ["lights_lambert_pars_fragment", "lights_phong_pars_fragment", "lights_toon_pars_fragment"] as const)
    assert.match(ShaderChunk[k], /#define RE_Direct_Lamp RE_Direct_/);
  // (twice: no harm)
  installLifeLamps();
  assert.equal((ShaderChunk.lights_fragment_begin.match(/RE_Direct_Lamp\(/g) ?? []).length, 2);
});
