import assert from "node:assert/strict";
import { test } from "node:test";
import { CustomToneMapping, ShaderChunk, type WebGLRenderer } from "three";
import { setLifeTone } from "./life-tone";

test("the renderer's curve is the finish's shoulder, no toe: dark tones pass through as they are", () => {
  const r = { toneMapping: 0 } as unknown as WebGLRenderer;
  setLifeTone(r);
  assert.equal(r.toneMapping, CustomToneMapping);
  const s = ShaderChunk.tonemapping_pars_fragment;
  assert.match(s, /vec3 CustomToneMapping\( vec3 color \) \{ return lifeToneShoulder\(/);
  assert.match(s, /if \(peak < start\) return color;/, "under the shoulder, untouched (no toe)");
  // (the finish's own copy is another name: the prefix of a pass drawn to the screen has this chunk)
  assert.doesNotMatch(s, /vec3 lifeShoulder\(/);
  // (twice: no harm)
  setLifeTone(r);
  assert.equal((ShaderChunk.tonemapping_pars_fragment.match(/vec3 lifeToneShoulder\(/g) ?? []).length, 1);
});
