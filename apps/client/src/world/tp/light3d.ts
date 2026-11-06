import { type MapDef, STOREY, type WorldObjectDef } from "@yutopia/shared";
import { cellOf, layoutSig } from "@yutopia/shared/structure";
import {
  Color,
  Data3DTexture,
  DataTexture,
  HalfFloatType,
  LinearFilter,
  type Material,
  RGBAFormat,
  ShaderChunk,
  type Texture,
  Vector2,
} from "three";
import { daylight, litCap, outAmbient } from "../art/daylight";
import {
  headlights,
  type LightMap,
  type LightSource,
  type LightWall,
  lightMapFor,
  lightSig,
  lightSources,
} from "../art/light";
import { LAYERS, LightVolume } from "../art/light-volume";
import { type Piece, type Shader, yuLit } from "../look/yulit";
import { skyLeft } from "./sky-left";
import { kindOf, layerShader, type WxKind } from "./wx3d";

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
  lmSkyLeft: skyLeft, // what's left of the sky's light on the campus outside (the pitch dark: sky.ts)
  lmDark: { value: 0 }, // how dark it is out under the sky (daylight.ts `dark`)
  lmEyes: { value: 0 }, // what eyes adjusted to it put back on the lot (eyes.ts; linear)
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

/** A material that's out under the sky everywhere (the campus): the open sky's balance,
 *  and in the pitch dark only what's left of the sky's sun and fill (lmSkyLeft). */
/** A façade's ledges: their snow by a mask (white where it lies), shown as the snow lies (docs/plan/65:
 *  it was painted into the façade). After the layer's (its `wxSnow`). */
function ledgeShader(shader: { uniforms: Record<string, unknown>; fragmentShader: string }, ledge: Texture) {
  shader.uniforms.wxLedge = { value: ledge };
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nuniform sampler2D wxLedge;")
    .replace(
      "#include <emissivemap_fragment>",
      "diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.97), texture2D(wxLedge, vMapUv).r * smoothstep(0.3, 0.75, wxSnow));\n#include <emissivemap_fragment>",
    );
}
export function patchOutdoors(m: Material) {
  // (its own hook kept, called first — the family's base — and the snow's layer after it: docs/plan/65,
  // W4)
  const own = m.onBeforeCompile;
  const key = m.customProgramCacheKey.call(m);
  yuLit(m, { base: { key, patch: (sh, r) => own.call(m, sh, r) }, light: outdoorsPiece(m) });
}

/** The open sky's light as a part of a material of the family (look/yulit.ts): the day's balance of
 *  sun and fill out under it, what's left of the sky's in the pitch dark, the snow's layer by `m`'s
 *  kind, its ledges' snow by their mask (its userData.wxLedge). */
export function outdoorsPiece(m: Material): Piece {
  const kind = kindOf(m);
  const ledge = m.userData.wxLedge as Texture | undefined;
  return {
    key: `outdoors-${kind}${ledge ? "-ledge" : ""}`,
    patch: (shader) => {
      shader.uniforms.lmSunOut = litBalance.lmSunOut;
      shader.uniforms.lmFillOut = litBalance.lmFillOut;
      shader.uniforms.lmCap = litBalance.lmCap;
      shader.uniforms.lmSkyLeft = litBalance.lmSkyLeft;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform float lmSunOut;\nuniform float lmFillOut;\nuniform float lmCap;\nuniform float lmSkyLeft;",
        )
        .replace(
          "#include <lights_fragment_begin>",
          balanced("1.0")
            .replace("directLight.color *= lmSunK;", "directLight.color *= lmSunK * lmSkyLeft;")
            .replace(
              "irradiance += lmFillK * getHemisphereLightIrradiance(",
              "irradiance += lmFillK * lmSkyLeft * getHemisphereLightIrradiance(",
            ),
        )
        .replace("#include <opaque_fragment>", ROLL_OFF);
      layerShader(shader, kind);
      if (ledge && kind !== "none") ledgeShader(shader, ledge);
    },
  };
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
    // (and what else the material asks for: a road's snow cover — roads3d.ts)
    const extra = m.userData.grounds as { patch: (s: typeof shader) => void; key: string } | undefined;
    extra?.patch(shader);
    // (the snow's layer over it: docs/plan/65, W4)
    layerShader(shader, kind);
    if (ledge && kind !== "none") ledgeShader(shader, ledge);
  };
  const kind = kindOf(m);
  const ledge = m.userData.wxLedge as Texture | undefined;
  m.customProgramCacheKey = () =>
    `yutopia-grounds${(m.userData.grounds as { key?: string } | undefined)?.key ?? ""}-${kind}${ledge ? "-ledge" : ""}`;
  m.needsUpdate = true;
}

// a volume's samples as the GPU takes them: half floats, four to a sample (its own array, sent as it is)
function volumeTexture(data: Uint16Array, w: number, h: number, d: number): Data3DTexture {
  const t = new Data3DTexture(data, w, h, d);
  t.format = RGBAFormat;
  t.type = HalfFloatType;
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

export class Light3 {
  private lm: LightMap | null = null;
  private vol: LightVolume | null = null;
  private sig = "";
  private hour = 12;
  private skySig = "";
  private sky = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat); // the open tiles (r)
  private glow = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat); // the lamp posts' pools (rgb, ÷2)
  readonly uniforms = {
    lmSize: { value: new Vector2(1, 1) },
    lmOff: { value: new Vector2(0, 0) },
    lmSky: { value: this.sky },
    lmGlow: { value: this.glow },
    // (the light volume's: its samples, the floor's height in the scene, the hour's ambient — the
    // rooms' and the open sky's — and the windows' colour, put together on the GPU)
    lmVol: { value: volumeTexture(new Uint16Array(4), 1, 1, 1) },
    lmY: { value: 0 },
    lmAmb: { value: new Color(1, 1, 1) },
    lmAmbOut: { value: new Color(1, 1, 1) },
    lmWinC: { value: new Color(0, 0, 0) },
  };

  constructor() {
    this.sky.magFilter = LinearFilter;
    this.sky.minFilter = LinearFilter;
    this.sky.flipY = false;
    this.sky.needsUpdate = true;
  }

  // the floor's open tiles (the lot's asphalt and concrete: no ceiling over them)
  private openSky(map: MapDef) {
    const sig = `${map.width}x${map.height}|${map.ox ?? 0},${map.oy ?? 0}|${layoutSig(map)}`;
    if (sig === this.skySig) return;
    this.skySig = sig;
    const W = map.width;
    const H = map.height;
    const d = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const ch = cellOf(map, x, y);
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
  update(map: MapDef, objects: WorldObjectDef[], free: readonly LightWall[] = []) {
    const bake = lightSig(map, objects, free);
    // (the cars too: their headlights' beams are drawn here, not baked)
    const sig = `${bake}|${JSON.stringify(headlights(objects))}`;
    if (sig === this.sig) return;
    this.sig = sig;
    // (each floor's kept: art/light.ts; its volume made from the one before on the same floor —
    // only what an edit touched again)
    this.lm = lightMapFor(map, objects, bake, free);
    const before = this.vol?.lm.map.key === map.key && this.vol.lm.map.floor === map.floor ? this.vol : null;
    this.uniforms.lmSize.value.set(map.width, map.height);
    // (the floor's volume: this light's own, made again only when what lights it changed — from the
    // one before on the same floor, where the edit touched)
    if (this.vol?.lm !== this.lm) {
      const v = new LightVolume(this.lm, before ?? undefined);
      this.upload(v);
      this.vol = v;
    }
    this.openSky(map);
    this.lampGlow(map, objects);
    this.composite();
  }

  // the volume to the GPU (its texture sent whole: three sends a 3D texture whole — 3 MB a floor of
  // 64 × 48 m, a fraction of a millisecond's copy on the GPU's side)
  private upload(v: LightVolume) {
    const u = this.uniforms;
    const t = u.lmVol.value;
    const img = t.image as { data: Uint16Array; width: number; height: number; depth: number };
    if (img.width === v.w && img.height === v.h && img.depth === v.d) {
      img.data = v.data;
      t.needsUpdate = true;
      return;
    }
    t.dispose();
    u.lmVol.value = volumeTexture(v.data, v.w, v.h, v.d);
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

  /** Its textures sent again (a GPU reset lost them). */
  redraw() {
    this.uniforms.lmVol.value.needsUpdate = true;
    this.sky.needsUpdate = true;
    this.glow.needsUpdate = true;
  }

  /** Where the floor's corner is in the scene (x, z) and its floor's height (`y`: a floor drawn
   *  below mine). */
  setOffset(x: number, z: number, y = 0) {
    this.uniforms.lmOff.value.set(x, z);
    this.uniforms.lmY.value = y;
  }

  // the hour's colours to the GPU — the rooms' ambient, the open sky's, the windows' daylight — put
  // together there with the volume's light (no picture to paint)
  private composite() {
    const d = daylight(this.hour);
    // (lit things kept under the bloom after dark: daylight.ts litCap)
    litBalance.lmCap.value = litCap(d.night);
    const u = this.uniforms;
    u.lmAmb.value.setRGB(...d.ambient);
    u.lmAmbOut.value.setRGB(...outAmbient(d));
    u.lmWinC.value.setRGB(...d.window);
  }

  /** Does a lamp's light reach (x, y) on this floor (no wall or shut door between)? The lamp in
   *  the floor's own frame (as its things were given), the point in the scene's. */
  reaches(l: LightSource, x: number, y: number): boolean {
    const o = this.uniforms.lmOff.value;
    return this.lm?.reaches(l, x - o.x, y - o.y) ?? true;
  }

  // the light at a point of the scene (`up` over the floor: a person's chest), ambient included
  // (0xRRGGBB: a person's tint)
  tintAt(x: number, y: number, up = 1.2): number {
    if (!this.vol) return 0xffffff;
    const d = daylight(this.hour);
    const o = this.uniforms.lmOff.value;
    return this.vol.tintAt(x - o.x, y - o.y, up, d.ambient, d.window, outAmbient(d));
  }

  // Make a material take this light (Lambert: its lit colour is multiplied) — one of the family with
  // only this light (look/yulit.ts).
  patch(m: Material) {
    yuLit(m, { light: this.piece(m) });
  }

  /** This light as a part of a material of the family (look/yulit.ts): the light map, the day's
   *  balance, the lamps' pools; the snow's layer where `m`'s open to the sky (its userData.wx — else
   *  a way, or nothing on glass); and what else `m` asks for (its userData.grounds: the lot's cover). */
  piece(m: Material): Piece {
    const u = this.uniforms;
    const kind: WxKind = (m.userData.wx as WxKind | undefined) ?? (m.transparent ? "none" : "way");
    const extra = m.userData.grounds as { patch: (s: Shader) => void; key: string } | undefined;
    return {
      key: `lightvol${extra?.key ?? ""}-${kind}`,
      patch: (shader) => {
        shader.uniforms.lmSize = u.lmSize;
        shader.uniforms.lmOff = u.lmOff;
        shader.uniforms.lmCap = litBalance.lmCap;
        shader.uniforms.lmSky = u.lmSky;
        shader.uniforms.lmGlow = u.lmGlow;
        shader.uniforms.lmGlowK = litBalance.lmGlowK;
        shader.uniforms.lmSunOut = litBalance.lmSunOut;
        shader.uniforms.lmFillOut = litBalance.lmFillOut;
        shader.uniforms.lmDark = litBalance.lmDark;
        shader.uniforms.lmEyes = litBalance.lmEyes;
        shader.uniforms.landLight = landLight;
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nuniform vec2 lmSize;\nuniform vec2 lmOff;\nuniform float lmY;\nvarying vec2 vLmUv;\nvarying float vLmUp;\nvarying float vLmH;",
          )
          .replace(
            "#include <project_vertex>",
            `#include <project_vertex>
          vec4 lmW = modelMatrix * vec4( transformed, 1.0 );
          vec3 lmN = normalize( mat3( modelMatrix ) * objectNormal );
          vLmUv = ( lmW.xz - lmOff + lmN.xz * 0.22 ) / lmSize;
          vLmUp = lmN.y;
          vLmH = lmW.y - lmY;`,
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nuniform sampler3D lmVol;\nuniform vec3 lmAmb;\nuniform vec3 lmAmbOut;\nuniform vec3 lmWinC;\nvarying float vLmH;\nuniform sampler2D lmSky;\nuniform sampler2D lmGlow;\nuniform float lmGlowK;\nuniform float lmCap;\nuniform float lmSunOut;\nuniform float lmFillOut;\nuniform float lmDark;\nuniform float lmEyes;\nuniform vec3 landLight;\nvarying vec2 vLmUv;\nvarying float vLmUp;",
          )
          .replace("#include <lights_fragment_begin>", balanced("texture2D( lmSky, clamp( vLmUv, 0.0, 1.0 ) ).r"))
          .replace(
            "#include <opaque_fragment>",
            `// (out under the sky in the dark, what's lit is lit by lamps hung high: a face turned
          // up takes their light, one standing (a pole, a car's side) next to none of it)
          // (their pools — lmGlow — on faces turned up only)
          // (past the floor's edge — a wall's outer face, someone out on the land — the land's light:
          // landLight; a person's own tint on top, view.ts)
          // (the light where the face is — up its floor's storey too — and the hour's ambient and the
          // windows' daylight added: each clamped to 1, then as an sRGB colour reads)
          vec4 lmV = texture( lmVol, vec3( clamp( vLmUv, 0.0, 1.0 ), ( clamp( vLmH / ${STOREY.toFixed(3)}, 0.0, 1.0 ) * ${(LAYERS - 1).toFixed(1)} + 0.5 ) / ${LAYERS.toFixed(1)} ) );
          vec3 lmC = min( vec3( 1.0 ), mix( lmAmb, lmAmbOut, texture2D( lmSky, clamp( vLmUv, 0.0, 1.0 ) ).r ) + lmV.rgb + lmWinC * min( 1.0, lmV.a ) );
          lmC = sRGBTransferEOTF( vec4( lmC, 1.0 ) ).rgb;
          vec2 lmIn = step( vec2( 0.0 ), vLmUv ) * step( vLmUv, vec2( 1.0 ) );
          float lmOn = lmIn.x * lmIn.y;
          float lmOut = texture2D( lmSky, clamp( vLmUv, 0.0, 1.0 ) ).r * lmDark * lmOn;
          float lmUp = clamp( vLmUp, 0.0, 1.0 );
          // (and on the lot, what eyes adjusted to the dark see: a faint fill of its own)
          outgoingLight *= mix( landLight, lmC, lmOn ) * mix( 1.0, 0.08 + 0.92 * lmUp, lmOut ) + lmEyes * lmOut;
          outgoingLight += diffuseColor.rgb * texture2D( lmGlow, clamp( vLmUv, 0.0, 1.0 ) ).rgb * lmGlowK * mix( 1.0, lmUp, lmOut ) * lmOn;${ROLL_OFF}`,
          );
        shader.uniforms.lmVol = u.lmVol;
        shader.uniforms.lmY = u.lmY;
        shader.uniforms.lmAmb = u.lmAmb;
        shader.uniforms.lmAmbOut = u.lmAmbOut;
        shader.uniforms.lmWinC = u.lmWinC;
        // (and what else the material asks for: the lot's snow cover — roads3d.ts lotCover)
        extra?.patch(shader);
        // (the snow's layer on its tiles open to the sky — the lot, the pavements by the doors: trodden
        // ways — docs/plan/65)
        layerShader(shader, kind, true);
      },
    };
  }

  dispose() {
    this.uniforms.lmVol.value.dispose();
    this.sky.dispose();
    this.glow.dispose();
  }
}
