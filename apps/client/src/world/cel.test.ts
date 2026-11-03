import assert from "node:assert/strict";
import { test } from "node:test";
import { celBands } from "./cel";

// Plan 67: the people's cel bands moved into one place (world/cel.ts) for the furniture to share —
// the people's shader text exactly as it was (chars/model.ts celShade, plan 59).
test("the people's cel bands, as they were", () => {
  assert.equal(
    celBands("vCelN", 1),
    `  vec3 n = normalize(vCelN);
  float l = dot(n, normalize(vec3(-0.6, 0.5, 0.62)));
  float dark = 1.0 - smoothstep(-0.2, 0.12, l);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.6, 0.64, 0.86), dark * 1.000);
  float rim = smoothstep(0.55, 0.85, 1.0 - abs(n.z)) * smoothstep(0.05, 0.4, -n.x) * (1.0 - dark);
  diffuseColor.rgb += rim * 0.160 * vec3(1.0, 0.9, 0.75);`,
  );
  assert.match(celBands("vCelN", 0.5), /dark \* 0\.500\);[\s\S]*rim \* 0\.080 \*/);
});
