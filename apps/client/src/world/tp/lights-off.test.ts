import assert from "node:assert/strict";
import { test } from "node:test";
import { MeshStandardMaterial, ShaderChunk } from "three";
import { installLifeLamps } from "../look/life-lamps";
import { setLightsOffSkip, skipOffLights } from "./lights-off";

// The lights that are off cost nothing (docs/plan/89-the-weight.md, phase 1).

type Shader = Parameters<MeshStandardMaterial["onBeforeCompile"]>[0];
const shader = (): Shader =>
  ({ uniforms: {}, vertexShader: "", fragmentShader: "#include <lights_fragment_begin>" }) as unknown as Shader;

test("each point and spot light's turn is skipped when its colour is 0, the rest as three has it", () => {
  const src = ShaderChunk.lights_fragment_begin;
  const out = skipOffLights(src);
  assert.ok(out, "three's loop as expected");
  assert.equal(out.split("if ( loAll || pointLight.color != vec3( 0.0 ) ) {").length, 2);
  assert.equal(out.split("if ( loAll || spotLight.color != vec3( 0.0 ) ) {").length, 2);
  // nothing else touched: take the two guards out and it's three's own again
  const back = out
    .replace("\n\t\tif ( loAll || pointLight.color != vec3( 0.0 ) ) {", "")
    .replace("\n\t\tif ( loAll || spotLight.color != vec3( 0.0 ) ) {", "")
    .split("\t}\n\t}\n\t#pragma unroll_loop_end")
    .join("}\n\t#pragma unroll_loop_end");
  assert.equal(back.replace(/\s+/g, " "), src.replace(/\s+/g, " "));
  // the sun's and the directional lights' loops untouched
  assert.ok(!out.includes("sunLight.color != vec3"));
  assert.ok(!out.includes("directionalLight.color != vec3"));
});

test("each guard closes inside its own unrolled loop (three unrolls up to the first `} #pragma unroll_loop_end`)", () => {
  const out = skipOffLights(ShaderChunk.lights_fragment_begin) as string;
  for (const first of ["pointLight = pointLights[ i ];", "spotLight = spotLights[ i ];"]) {
    const a = out.indexOf(first);
    const end = out.indexOf("#pragma unroll_loop_end", a);
    const body = out.slice(a, end);
    // braces balance within the loop's body: the guard's and the loop's closing ones
    const opens = body.split("{").length - 1;
    const closes = body.split("}").length - 1;
    assert.equal(closes - opens, 1, `${first}: the loop's own brace left to close`);
    // three's regex takes the body up to the first `}` followed by the pragma: the loop's, not the guard's
    assert.ok(/\t}\n\t}\n\t#pragma unroll_loop_end/.test(out.slice(a, end + 30)));
  }
});

test("with the life look's lamps in the chunk too", () => {
  installLifeLamps();
  const out = skipOffLights(ShaderChunk.lights_fragment_begin);
  assert.ok(out);
  assert.ok(out.includes("RE_Direct_Lamp("));
  assert.equal(out.split("if ( loAll || pointLight.color != vec3( 0.0 ) ) {").length, 2);
});

test("a material whose own hook put the chunk in already (the light map's, the vehicles'): guarded all the same", () => {
  const m = new MeshStandardMaterial();
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <lights_fragment_begin>",
      ShaderChunk.lights_fragment_begin.replace(
        "getPointLightInfo( pointLight, geometryPosition, directLight );",
        "getPointLightInfo( pointLight, geometryPosition, directLight );\n\t\tdirectLight.color *= lmBoost;",
      ),
    );
  };
  const a = shader();
  m.onBeforeCompile(a, undefined as never);
  assert.ok(a.fragmentShader.includes("directLight.color *= lmBoost;"));
  assert.equal(a.fragmentShader.split("if ( loAll || pointLight.color != vec3( 0.0 ) ) {").length, 2);
  assert.equal(a.fragmentShader.split("if ( loAll || spotLight.color != vec3( 0.0 ) ) {").length, 2);
  // (the boost inside the guard: skipped with the light)
  assert.ok(
    a.fragmentShader.indexOf("if ( loAll || pointLight.color != vec3( 0.0 ) ) {") <
      a.fragmentShader.indexOf("directLight.color *= lmBoost;"),
  );
});

test("a shader with no lights is left alone", () => {
  const m = new MeshStandardMaterial();
  const a = { uniforms: {}, vertexShader: "", fragmentShader: "void main() {}" } as unknown as Shader;
  m.onBeforeCompile(a, undefined as never);
  assert.equal(a.fragmentShader, "void main() {}");
});

test("through the materials' hook: its switch is a uniform shared by every shader, the programs the same", () => {
  const m = new MeshStandardMaterial();
  const a = shader();
  const b = shader();
  const key = m.customProgramCacheKey();
  m.onBeforeCompile(a, undefined as never);
  assert.ok(a.fragmentShader.startsWith("uniform bool loAll;\n"));
  assert.ok(a.fragmentShader.includes("if ( loAll || pointLight.color != vec3( 0.0 ) ) {"));
  const u = (a.uniforms as Record<string, { value: boolean }>).loAll;
  assert.equal(u.value, false, "the game's: the lights at 0 skipped");
  setLightsOffSkip(false);
  try {
    assert.equal(u.value, true);
    m.onBeforeCompile(b, undefined as never);
    assert.equal(b.fragmentShader, a.fragmentShader, "the same source either way");
    assert.equal((b.uniforms as Record<string, unknown>).loAll, u, "one uniform for all");
    assert.equal(m.customProgramCacheKey(), key, "no other program");
  } finally {
    setLightsOffSkip(true);
  }
  assert.equal(u.value, false);
});
