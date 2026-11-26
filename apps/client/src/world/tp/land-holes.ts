import type { Material } from "three";

// The land's holes in the drawing (docs/plan/130-the-house-build.md, phases 5 and 11): a basement dug, a pool — the
// land's shader drops its fragments inside them (world rects, the shared structure/found.ts landHoles), so what's dug
// shows. As many as HOLE_MAX at once, the nearest to me when there are more.

export const HOLE_MAX = 16;
// (a flat array, four a hole — three takes a vec4 array so: no three on the page, the controller sets them)
const U = { value: new Float32Array(HOLE_MAX * 4) };
const N = { value: 0 };

/** The holes now (world rects). */
export function setLandHoleUniforms(
  holes: readonly { x0: number; z0: number; x1: number; z1: number }[],
  near?: { x: number; z: number },
) {
  const list = near
    ? [...holes].sort(
        (a, b) =>
          Math.hypot((a.x0 + a.x1) / 2 - near.x, (a.z0 + a.z1) / 2 - near.z) -
          Math.hypot((b.x0 + b.x1) / 2 - near.x, (b.z0 + b.z1) / 2 - near.z),
      )
    : holes;
  N.value = Math.min(HOLE_MAX, list.length);
  for (let i = 0; i < N.value; i++) U.value.set([list[i].x0, list[i].z0, list[i].x1, list[i].z1], i * 4);
}

/** The land's material taught its holes (on top of whatever it compiles with). */
export function patchLandHoles(m: Material) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev.call(m, shader, r);
    shader.uniforms.uHoles = U;
    shader.uniforms.uHoleN = N;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vHoleW;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvHoleW = (modelMatrix * vec4(transformed, 1.0)).xz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec2 vHoleW;\nuniform vec4 uHoles[${HOLE_MAX}];\nuniform int uHoleN;`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
for (int i = 0; i < ${HOLE_MAX}; i++) {
  if (i >= uHoleN) break;
  vec4 h = uHoles[i];
  if (vHoleW.x > h.x && vHoleW.x < h.z && vHoleW.y > h.y && vHoleW.y < h.w) discard;
}`,
      );
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${key()}|landholes`;
}
