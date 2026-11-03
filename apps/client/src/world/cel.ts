// The cel shade's bands (plan 59, the people; plan 67, the furniture shaded as them): the side of a
// form turned from a light over the viewer's left shoulder takes a cool shadow tone, cut sharp with a
// soft edge, and the lit side's edges catch a warm rim — in view space, so it keeps to the camera.
// GLSL lines for a fragment shader after its colour (`diffuseColor`) is known: `n` a view-space
// normal, `k` how much (1: the people's).
export function celBands(n: string, k = 1): string {
  return `  vec3 n = normalize(${n});
  float l = dot(n, normalize(vec3(-0.6, 0.5, 0.62)));
  float dark = 1.0 - smoothstep(-0.2, 0.12, l);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.6, 0.64, 0.86), dark * ${k.toFixed(3)});
  float rim = smoothstep(0.55, 0.85, 1.0 - abs(n.z)) * smoothstep(0.05, 0.4, -n.x) * (1.0 - dark);
  diffuseColor.rgb += rim * ${(0.16 * k).toFixed(3)} * vec3(1.0, 0.9, 0.75);`;
}
