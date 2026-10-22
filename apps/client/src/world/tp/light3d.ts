import { type MapDef, tileAt, type WorldObjectDef } from "@yutopia/shared";
import {
  CanvasTexture,
  Color,
  DataTexture,
  LinearFilter,
  type Material,
  RGBAFormat,
  ShaderChunk,
  SRGBColorSpace,
  Vector2,
} from "three";
import { daylight, litCap } from "../art/daylight";
import { headlights, type LightMap, type LightSource, lightMapFor, lightSig, lightSources } from "../art/light";

// The iso view's light, in 3D: the same baked light map (lamps and windows
// ray-marched across the tiles, walls and shut doors blocking them) plus the
// hour's ambient, as one plan-space texture that every lit surface multiplies
// by — sampled a little in front of the face it's on, as the iso view lights a
// wall by the floor in front of it. People take the same tint where they stand.
// One per floor drawn: mine at the origin, each floor below with its own (its
// `offset`: where its corner is in the scene), so every floor takes the hour.
//
// Out under the open sky (the lot; the campus, all of it) the sun is stronger
// and the sky's fill weaker than in the rooms: a room's even fill, out there,
// washed the sun's shadows off the ground. A mask of the floor's open tiles says
// where (soft at the edges: no line at a door), `litBalance` how much, by the hour.
//
// And every lit surface, in and out, rolls off its highlights towards a
// ceiling (lmCap) instead of clipping: 1 by day (the sun on a white wall, the
// snow), under the bloom's threshold after dark (daylight.ts litCap). Only the
// highlights: the dark tones are left as they are.

/** Shared by every lit material (the view and the light maps set them by the
 *  hour): the open sky's sun and fill against a room's (1, 1), and the ceiling. */
export const litBalance = {
  lmSunOut: { value: 1 },
  lmFillOut: { value: 1 },
  lmCap: { value: 1 },
  lmGlowK: { value: 0 }, // the lamp posts' glow (0 by day)
};

// The lamp posts' pools at night, over and above the light map's: its light
// tops out at daylight's, and on the lot's dark asphalt a pool as bright as
// noon read as nothing against the night round it. Their light added to what
// it falls on (its colour), warm, a soft disc under each head.
const GLOW_PX = 4; // samples a tile
const GLOW_COLOR: [number, number, number] = [1, 0.9, 0.72];
// …and the cars' headlights (lit in their drawing) throw a beam ahead of them
const BEAM_LEN = 6; // tiles
const BEAM = 1.1; // its strength at the nose

// highlights eased in under lmCap from three quarters of it (dark tones untouched)
const ROLL_OFF = `
  float lmPeak = max( outgoingLight.r, max( outgoingLight.g, outgoingLight.b ) );
  float lmKnee = lmCap * 0.75;
  if ( lmPeak > lmKnee ) outgoingLight *= ( lmKnee + ( lmCap - lmKnee ) * ( 1.0 - exp( ( lmKnee - lmPeak ) / ( lmCap - lmKnee ) ) ) ) / lmPeak;
  #include <opaque_fragment>`;

// the light chunk with the sun and the sky's fill each scaled (lmSunK, lmFillK)
const balanced = (k: string) =>
  ShaderChunk.lights_fragment_begin
    .replace(
      "getDirectionalLightInfo( directionalLight, directLight );",
      "getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= lmSunK;",
    )
    .replace(
      "irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );",
      "irradiance += lmFillK * getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );",
    )
    .replace(/^/, `float lmSunK = mix( 1.0, lmSunOut, ${k} );\nfloat lmFillK = mix( 1.0, lmFillOut, ${k} );\n`);

/** A material that's out under the sky everywhere (the campus): the open sky's balance. */
export function patchOutdoors(m: Material) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.lmSunOut = litBalance.lmSunOut;
    shader.uniforms.lmFillOut = litBalance.lmFillOut;
    shader.uniforms.lmCap = litBalance.lmCap;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float lmSunOut;\nuniform float lmFillOut;\nuniform float lmCap;",
      )
      .replace("#include <lights_fragment_begin>", balanced("1.0"))
      .replace("#include <opaque_fragment>", ROLL_OFF);
  };
  m.customProgramCacheKey = () => "yutopia-outdoors";
  m.needsUpdate = true;
}

// The Grounds' land and all on it (docs/plan/27): out under the sky as the campus
// is, and the hour's light on it (the sun or moon and the sky's fill: dark at
// night off the lit ways) — the lamps and the flashlights stay as bright as they are
export const landLight = { value: new Color(1, 1, 1) };
// …and what the snow throws back up is cold (docs/plan/33-the-look.md): the
// hemisphere's ground half there is the sky's light this colour, not the rooms'
// warm floor (a brown bounce turned all the snow beige)
export const landBounce = { value: new Color(0.68, 0.77, 0.92) };
export function patchGrounds(m: Material) {
  // the look (docs/plan/33-the-look.md): each face one tone
  (m as Material & { flatShading?: boolean }).flatShading = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.lmSunOut = litBalance.lmSunOut;
    shader.uniforms.lmFillOut = litBalance.lmFillOut;
    shader.uniforms.lmCap = litBalance.lmCap;
    shader.uniforms.landLight = landLight;
    shader.uniforms.landBounce = landBounce;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float lmSunOut;
uniform float lmFillOut;
uniform float lmCap;
uniform vec3 landLight;
uniform vec3 landBounce;`,
      )
      .replace(
        "#include <lights_fragment_begin>",
        balanced("1.0")
          .replace("directLight.color *= lmSunK;", "directLight.color *= lmSunK * landLight;")
          .replace(
            "irradiance += lmFillK * getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );",
            `{
			HemisphereLight lmH = hemisphereLights[ i ];
			lmH.groundColor = lmH.skyColor * landBounce;
			irradiance += lmFillK * landLight * getHemisphereLightIrradiance( lmH, geometryNormal );
		}`,
          ),
      )
      .replace("#include <opaque_fragment>", ROLL_OFF);
  };
  m.customProgramCacheKey = () => "yutopia-grounds";
  m.needsUpdate = true;
}

export class Light3 {
  private lm: LightMap | null = null;
  private canvas = document.createElement("canvas");
  private tex = new CanvasTexture(this.canvas);
  private sig = "";
  private hour = 12;
  private skySig = "";
  private sky = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat); // the open tiles (r)
  private glow = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat); // the lamp posts' pools (rgb, ÷2)
  readonly uniforms = {
    lmTex: { value: this.tex },
    lmSize: { value: new Vector2(1, 1) },
    lmOff: { value: new Vector2(0, 0) },
    lmSky: { value: this.sky },
    lmGlow: { value: this.glow },
  };

  constructor() {
    this.tex.colorSpace = SRGBColorSpace; // light values as the iso view multiplies them (in sRGB)
    this.tex.flipY = false; // row 0 = y 0
    this.tex.magFilter = LinearFilter;
    this.tex.minFilter = LinearFilter;
    this.tex.generateMipmaps = false;
    this.sky.magFilter = LinearFilter;
    this.sky.minFilter = LinearFilter;
    this.sky.flipY = false;
    this.sky.needsUpdate = true;
  }

  // the floor's open tiles (the lot's asphalt and concrete: no ceiling over them)
  private openSky(map: MapDef) {
    const sig = `${map.width}x${map.height}|${map.tiles.join("")}`;
    if (sig === this.skySig) return;
    this.skySig = sig;
    const W = map.width;
    const H = map.height;
    const d = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const ch = tileAt(map, x, y);
        d[(y * W + x) * 4] = ch === "a" || ch === "c" ? 255 : 0;
      }
    this.sky.dispose();
    this.sky = new DataTexture(d, W, H, RGBAFormat);
    this.sky.magFilter = LinearFilter;
    this.sky.minFilter = LinearFilter;
    this.sky.needsUpdate = true;
    this.uniforms.lmSky.value = this.sky;
  }

  // Bake again when what gives or blocks light changed (cheap to call often).
  update(map: MapDef, objects: WorldObjectDef[]) {
    const bake = lightSig(map, objects);
    // (the cars too: their headlights' beams are drawn here, not baked)
    const sig = `${bake}|${JSON.stringify(headlights(objects))}`;
    if (sig === this.sig) return;
    this.sig = sig;
    // (each floor's bake kept, shared with the iso view: art/light.ts)
    this.lm = lightMapFor(map, objects, bake);
    this.uniforms.lmSize.value.set(map.width, map.height);
    this.openSky(map);
    this.lampGlow(map, objects);
    this.composite();
  }

  // the lamp posts' pools (those that hang high: `h`) and the cars' beams, walls
  // and shut doors blocking them as the light map's
  private lampGlow(map: MapDef, objects: WorldObjectDef[]) {
    const lamps = lightSources(objects).filter((l) => l.h);
    const beams = headlights(objects);
    const W = map.width * GLOW_PX;
    const H = map.height * GLOW_PX;
    const acc = new Float32Array(lamps.length || beams.length ? W * H : 0);
    for (const l of lamps) {
      const R = l.radius * 0.7; // (a pool under it, the night between them)
      const seen = new Map<number, boolean>(); // (by tile: the ray-march is the cost)
      const x0 = Math.max(0, Math.floor((l.x - R) * GLOW_PX));
      const x1 = Math.min(W - 1, Math.ceil((l.x + R) * GLOW_PX));
      const y0 = Math.max(0, Math.floor((l.y - R) * GLOW_PX));
      const y1 = Math.min(H - 1, Math.ceil((l.y + R) * GLOW_PX));
      for (let py = y0; py <= y1; py++)
        for (let px = x0; px <= x1; px++) {
          const x = (px + 0.5) / GLOW_PX;
          const y = (py + 0.5) / GLOW_PX;
          const d = Math.hypot(x - l.x, y - l.y);
          if (d >= R) continue;
          const tile = Math.floor(y) * map.width + Math.floor(x);
          let ok = seen.get(tile);
          if (ok === undefined) {
            ok = this.reaches(l, Math.floor(x) + 0.5, Math.floor(y) + 0.5);
            seen.set(tile, ok);
          }
          if (ok) acc[py * W + px] += (1 - (d / R) ** 2) ** 3 * l.intensity;
        }
    }
    for (const b of beams) {
      // a cone from the nose, widening and fading out ahead
      const reach = { x: b.x, y: b.y, color: 0, radius: BEAM_LEN, intensity: 0 };
      const seen = new Map<number, boolean>();
      const x0 = Math.max(0, Math.floor((b.x - BEAM_LEN) * GLOW_PX));
      const x1 = Math.min(W - 1, Math.ceil((b.x + BEAM_LEN) * GLOW_PX));
      const y0 = Math.max(0, Math.floor((b.y - BEAM_LEN) * GLOW_PX));
      const y1 = Math.min(H - 1, Math.ceil((b.y + BEAM_LEN) * GLOW_PX));
      for (let py = y0; py <= y1; py++)
        for (let px = x0; px <= x1; px++) {
          const x = (px + 0.5) / GLOW_PX - b.x;
          const y = (py + 0.5) / GLOW_PX - b.y;
          const along = x * b.dx + y * b.dy;
          if (along <= 0 || along >= BEAM_LEN) continue;
          const half = 0.75 + along * 0.38;
          const side = Math.abs(x * b.dy - y * b.dx);
          if (side >= half) continue;
          const tile = Math.floor(y + b.y) * map.width + Math.floor(x + b.x);
          let ok = seen.get(tile);
          if (ok === undefined) {
            ok = this.reaches(reach, Math.floor(x + b.x) + 0.5, Math.floor(y + b.y) + 0.5);
            seen.set(tile, ok);
          }
          if (!ok) continue;
          const t = along / BEAM_LEN;
          const e = 1 - (side / half) ** 2;
          acc[py * W + px] += BEAM * (1 - t) ** 2 * Math.min(1, along * 2) * e * e;
        }
    }
    const data = new Uint8Array(Math.max(1, W * H) * 4);
    for (let i = 0; i < acc.length; i++) {
      const v = Math.min(2, acc[i]) * 127.5;
      data[i * 4] = v * GLOW_COLOR[0];
      data[i * 4 + 1] = v * GLOW_COLOR[1];
      data[i * 4 + 2] = v * GLOW_COLOR[2];
    }
    this.glow.dispose();
    this.glow = acc.length ? new DataTexture(data, W, H, RGBAFormat) : new DataTexture(data, 1, 1, RGBAFormat);
    this.glow.magFilter = LinearFilter;
    this.glow.minFilter = LinearFilter;
    this.glow.needsUpdate = true;
    this.uniforms.lmGlow.value = this.glow;
  }

  setHour(h: number) {
    this.hour = h;
    this.composite();
  }

  /** Where the floor's corner is in the scene (x, z): a floor drawn below mine. */
  setOffset(x: number, z: number) {
    this.uniforms.lmOff.value.set(x, z);
  }

  private composite() {
    if (!this.lm) return;
    const d = daylight(this.hour);
    // (lit things kept under the bloom after dark: daylight.ts litCap)
    litBalance.lmCap.value = litCap(d.night);
    const w = this.canvas.width;
    this.lm.composite(d.ambient, d.window, this.canvas);
    if (w !== this.canvas.width) {
      // a new size needs a new GPU texture
      this.tex.dispose();
    }
    this.tex.needsUpdate = true;
  }

  /** Does a lamp's light reach (x, y) on this floor (no wall or shut door between)? */
  reaches(l: LightSource, x: number, y: number): boolean {
    return this.lm?.reaches(l, x, y) ?? true;
  }

  // the light at a point, ambient included (0xRRGGBB, as iso tints people)
  tintAt(x: number, y: number): number {
    if (!this.lm) return 0xffffff;
    const d = daylight(this.hour);
    return this.lm.tintAt(x, y, d.ambient, d.window);
  }

  // Make a material take this light (Lambert: its lit colour is multiplied).
  patch(m: Material) {
    const u = this.uniforms;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.lmTex = u.lmTex;
      shader.uniforms.lmSize = u.lmSize;
      shader.uniforms.lmOff = u.lmOff;
      shader.uniforms.lmCap = litBalance.lmCap;
      shader.uniforms.lmSky = u.lmSky;
      shader.uniforms.lmGlow = u.lmGlow;
      shader.uniforms.lmGlowK = litBalance.lmGlowK;
      shader.uniforms.lmSunOut = litBalance.lmSunOut;
      shader.uniforms.lmFillOut = litBalance.lmFillOut;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform vec2 lmSize;\nuniform vec2 lmOff;\nvarying vec2 vLmUv;",
        )
        .replace(
          "#include <project_vertex>",
          `#include <project_vertex>
          vec4 lmW = modelMatrix * vec4( transformed, 1.0 );
          vec3 lmN = normalize( mat3( modelMatrix ) * objectNormal );
          vLmUv = ( lmW.xz - lmOff + lmN.xz * 0.22 ) / lmSize;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform sampler2D lmTex;\nuniform sampler2D lmSky;\nuniform sampler2D lmGlow;\nuniform float lmGlowK;\nuniform float lmCap;\nuniform float lmSunOut;\nuniform float lmFillOut;\nvarying vec2 vLmUv;",
        )
        .replace("#include <lights_fragment_begin>", balanced("texture2D( lmSky, clamp( vLmUv, 0.0, 1.0 ) ).r"))
        .replace(
          "#include <opaque_fragment>",
          `outgoingLight *= texture2D( lmTex, clamp( vLmUv, 0.0, 1.0 ) ).rgb;
          outgoingLight += diffuseColor.rgb * texture2D( lmGlow, clamp( vLmUv, 0.0, 1.0 ) ).rgb * lmGlowK;${ROLL_OFF}`,
        );
    };
    m.customProgramCacheKey = () => "yutopia-lightmap";
    m.needsUpdate = true;
  }

  dispose() {
    this.tex.dispose();
    this.sky.dispose();
    this.glow.dispose();
  }
}
