// Plan 73 phase 2.7 — the lamps light diffusely in the life look. A Standard material works out the
// full GGX highlight for every point and spot light on every pixel; with High's ~19 lamps in an
// office that put the life look's frame at ~40 ms against the classic one's ~25 (measured: lamps off,
// 20 and 17). So the lamps' loops call RE_Direct_Lamp: for the Standard (physical) model only the
// diffuse part — Lambert's — and for every other model its own RE_Direct as before. The sun and the
// sky keep their sheen; a lamp's glint on a painted wall was never seen.
//
// Done on three's shared chunks once, before anything compiles (the view, in the life look only):
// every lit shader — and the light map's own `balanced` copy of lights_fragment_begin, read when a
// material compiles — takes it.
import { ShaderChunk } from "three";

let done = false;

export function installLifeLamps() {
  if (done) return;
  done = true;
  const begin = ShaderChunk.lights_fragment_begin;
  const call =
    "RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );";
  const lamp = call.replace("RE_Direct(", "RE_Direct_Lamp(");
  // (only inside the point and spot lights' blocks: the sun's and the directional ones keep theirs)
  const blocks = [
    "#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )",
    "#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )",
  ];
  let out = begin;
  for (const head of blocks) {
    const i = out.indexOf(head);
    if (i < 0) throw new Error(`life lamps: no "${head}" in lights_fragment_begin (three changed?)`);
    // (the block runs to the next top-level block: its own nested #if…#endif come first)
    const nexts = [
      "#if ( NUM_SPOT_LIGHTS",
      "#if ( NUM_SUN_LIGHTS",
      "#if ( NUM_DIR_LIGHTS",
      "#if ( NUM_RECT_AREA_LIGHTS",
    ]
      .map((h) => out.indexOf(h, i + head.length))
      .filter((x) => x > 0);
    const j = nexts.length ? Math.min(...nexts) : out.length;
    const k = out.indexOf(call, i);
    if (k < 0 || k > j) throw new Error("life lamps: the lamps' RE_Direct call not found");
    out = out.slice(0, k) + lamp + out.slice(k + call.length);
  }
  ShaderChunk.lights_fragment_begin = out;
  // the physical model: the lamp's light diffuse only
  ShaderChunk.lights_physical_pars_fragment += `
void RE_Direct_Lamp( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	reflectedLight.directDiffuse += dotNL * directLight.color * BRDF_Lambert( material.diffuseColor );
}
`;
  // every other model: as it was
  ShaderChunk.lights_lambert_pars_fragment += "\n#define RE_Direct_Lamp RE_Direct_Lambert\n";
  ShaderChunk.lights_phong_pars_fragment += "\n#define RE_Direct_Lamp RE_Direct_BlinnPhong\n";
  ShaderChunk.lights_toon_pars_fragment += "\n#define RE_Direct_Lamp RE_Direct_Toon\n";
}
