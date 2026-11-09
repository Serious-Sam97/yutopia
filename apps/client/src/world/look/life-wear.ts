// Plan 73 phase 5 — the life look's garments and hair (tools/art/life/wear.py, hair.py → each person's
// person-<who>-wear.glb): what's worn over the body, and the skin under it hidden.
//
// The body comes whole (phase 5): each of its vertices says what it is (`_wear`: its kind — torso, an
// arm, a leg, the head; +8 under the person's own outfit —, how far along its limb, its height; `_neck`:
// how far in front of the neck, how far off its axis), and each garment's cut rules ride in the file's
// extras. A vertex a worn garment covers (a little inside its edges) is hidden — its triangles dropped
// from the body's index, one index per outfit, shared by everyone in it — as wear.py `covers` does.
//
//   covers(spec, …)            whether a garment covers one vertex
//   bodyIndex(g, specs, lm, own)  the body's triangles left showing under those garments (own: under the
//                              person's own outfit too)
//   patternPiece(kind, a, b)   a garment's pattern (none, stripes, plaid), off its rest place (it has no
//                              UVs): its own part of its material
import type { AvatarLayers } from "@yutopia/shared";
import type { BufferGeometry } from "three";
import type { Piece, Shader } from "./yulit";

/** A garment's cut (wear.py GARMENTS): along a limb 0 the shoulder or hip, 1 the elbow or knee, 2 the
 *  wrist or ankle; by height off a landmark (MakeHuman decimetres). */
export interface WearSpec {
  helper?: "tights" | "skirt" | "head";
  sleeve?: number | null;
  legs?: number;
  hem?: [string, number];
  top?: [string, number];
  neck?: number;
  scoop?: number;
  /** how far round the neck its neckline reaches (dm) */
  hole?: number;
  /** an overall's bib in front, a panel behind, the straps over the shoulders */
  bib?: boolean;
  /** a V neck: how far across (dm) its sides reach */
  vee?: number;
  /** a collar of its own (built in the file: here only for the record) */
  collar?: [string, number];
  above?: number;
  below?: [string, number];
  cc0?: string;
  /** drawn as that garment's mesh (the wardrobe's shoes the CC0 pack's nearest) */
  alias?: string;
  /** the material library's cloth it's drawn in (its UVs in metres) */
  fabric?: string;
  /** a CC0 hair: hides no skin */
  hair?: boolean;
  /** a second piece off the skirt's cone (a dress's, a coat's) */
  skirt?: WearSpec;
}
/** The landmarks the garments are cut by (MakeHuman space: decimetres, y up, facing +z). */
export type WearLm = Record<string, [number, number, number]>;

const TORSO = 0;
const ARM_L = 1;
const ARM_R = 2;
const LEG_L = 3;
const LEG_R = 4;
const HEAD = 5;
const M_T = 0.15;
const M_Y = 0.35;
const COLLAR = 1.0;
const NECK_RISE = 0.6;

const level = (lm: WearLm, l: [string, number]) => (lm[l[0]]?.[1] ?? 0) + l[1];

/** Whether `spec` covers a vertex of kind `kind`, `t` along its limb, at height `y` (`front`, `rad`, `dx`:
 *  off the neck — in front, round its axis, across) — `mt`, `my` in from its edges (0: its cut). As
 *  wear.py `covers`. */
export function covers(
  spec: WearSpec,
  kind: number,
  t: number,
  y: number,
  front: number,
  rad: number,
  dx: number,
  lm: WearLm,
  mt = M_T,
  my = M_Y,
): boolean {
  if ((spec.cc0 || spec.alias) && !spec.below) return false;
  if (spec.skirt && covers(spec.skirt, kind, t, y, front, rad, dx, lm, mt, my)) return true;
  const arm = kind === ARM_L || kind === ARM_R;
  const leg = kind === LEG_L || kind === LEG_R;
  if (spec.below) return leg && y <= level(lm, spec.below) - my;
  if (spec.helper === "head") return kind === HEAD && y >= (lm.brow?.[1] ?? 0) + (spec.above ?? 0) + my;
  const hem = spec.hem ? level(lm, spec.hem) : -1e9;
  const top = spec.top ? level(lm, spec.top) : 1e9;
  if (spec.helper === "skirt") return kind === TORSO && y >= hem + my && y <= top - my;
  if (kind === TORSO && spec.bib) {
    // (as wear.py: the bib, the back panel, the straps)
    const ny = lm.neck?.[1] ?? 0;
    const bib = front > 0.3 && dx < 0.75 - my && y <= ny - 1.3 - my;
    const back = front < -0.3 && dx < 0.6 - my && y <= (lm.waist?.[1] ?? 0) + 0.7 - my;
    const straps = Math.abs(dx - 0.62) < 0.13 - my * 0.3 && y <= ny - 0.3 - my;
    if (bib || back || straps) return y >= hem + my;
  }
  if (kind === TORSO) {
    if (y < hem + my || y > top - my) return false;
    if (spec.neck !== undefined) {
      // (a U: rising away from the neck's axis, wear.py neckline)
      const k = Math.min(1, Math.max(0, (rad - 0.55) / ((spec.hole ?? COLLAR) - 0.55)));
      const ny = lm.neck?.[1] ?? 0;
      let dip = Math.min(1, Math.max(0, front));
      // (a V: as deep as the scoop at the middle, straight up its sides)
      if (spec.vee) dip *= Math.min(1, Math.max(0, 1 - dx / spec.vee));
      const line = Math.min(ny - spec.neck - (spec.scoop ?? 0) * dip + NECK_RISE * k * k, ny - 0.1);
      if (y > line - my && rad < (spec.hole ?? COLLAR) + my) return false;
    }
    return true;
  }
  if (arm) return spec.sleeve !== undefined && spec.sleeve !== null && t <= spec.sleeve - mt;
  if (leg) {
    if (spec.legs !== undefined) return t <= spec.legs - mt && y <= top - my;
    return spec.hem !== undefined && y >= hem + my;
  }
  return false;
}

/** The body's triangles that still show under `specs` (and under the person's own outfit, `own`) — null
 *  if the body doesn't say what its vertices are (a file from before phase 5). */
export function bodyIndex(
  g: BufferGeometry,
  specs: WearSpec[],
  lm: WearLm,
  own: boolean,
  /** how far inside a covering garment's edges (along a limb; dm): a garment under another, further in —
   *  at the default a gap opened at a tee's hem over the jeans */
  mt = M_T,
  my = M_Y,
): number[] | null {
  const w = g.getAttribute("_wear");
  const n = g.getAttribute("_neck");
  const index = g.getIndex();
  if (!w || !n || !index) return null;
  const hidden = new Uint8Array(w.count);
  for (let i = 0; i < w.count; i++) {
    const raw = w.getX(i);
    const under = raw > 7.5;
    if (own && under) {
      hidden[i] = 1;
      continue;
    }
    const kind = Math.round(under ? raw - 8 : raw);
    const t = w.getY(i);
    const y = w.getZ(i);
    const front = n.getX(i);
    const rad = n.getY(i);
    const dx = n.itemSize > 2 ? n.getZ(i) : 0;
    for (const s of specs)
      if (covers(s, kind, t, y, front, rad, dx, lm, mt, my)) {
        hidden[i] = 1;
        break;
      }
  }
  const out: number[] = [];
  for (let k = 0; k < index.count; k += 3) {
    const a = index.getX(k);
    const b = index.getX(k + 1);
    const c = index.getX(k + 2);
    if (!hidden[a] && !hidden[b] && !hidden[c]) out.push(a, b, c);
  }
  return out;
}

/** What a worn piece is coloured as — by its slot (the keys: top-, bottom-, outer-, shoes-, hat-, hair-,
 *  beard-, eyewear-, extra-, as the wardrobe's own slots): the avatar's colour for that slot, or their hair's. */
export type WearRole = "top" | "bottom" | "outer" | "shoes" | "hat" | "hair" | "eyewear" | "extra";
export function roleOf(name: string): WearRole {
  const n = name.replace(/^wear-/, "");
  if (/^(hair|beard)-/.test(n)) return "hair";
  const slot = n.split("-")[0];
  return slot === "bottom" ||
    slot === "outer" ||
    slot === "shoes" ||
    slot === "hat" ||
    slot === "eyewear" ||
    slot === "extra"
    ? slot
    : "top";
}

/** Hair or a beard (their material is the hair's: cut out by its alpha, both sides). */
export const isHair = (name: string): boolean => name === "hair" || /^wear-(hair|beard)-/.test(name);

/** A garment's pattern: its two colours in bands off its rest place (metres; it has no UVs) — stripes
 *  across, or a plaid's two ways round. Its own part of its material (the room's light after it). */
export type WearPattern = "plain" | "stripes" | "plaid" | "check" | "dots" | "tweed";
export function patternPiece(
  kind: WearPattern,
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): Piece {
  const u = {
    lifeA: { value: [a.r, a.g, a.b] },
    lifeB: { value: [b.r, b.g, b.b] },
  };
  const band =
    kind === "stripes"
      ? "float k = smoothstep( 0.46, 0.54, abs( fract( vLifeRest.y * 12.0 ) - 0.5 ) * 2.0 );"
      : kind === "check"
        ? // (gingham: small even bands both ways, their crossings the darkest)
          `vec2 g = step( 0.5, fract( vec2( vLifeRest.y, vLifeRest.x + vLifeRest.z ) * 16.0 ) );
	float k = ( g.x + g.y ) * 0.5;`
        : kind === "dots"
          ? `vec2 c = fract( vec2( vLifeRest.y, vLifeRest.x + vLifeRest.z ) * 14.0 ) - 0.5;
	float k = 1.0 - smoothstep( 0.17, 0.22, length( c ) );`
          : kind === "tweed"
            ? // (a flecked weave: the two colours in a fine broken noise)
              `vec3 q = vLifeRest * 90.0;
	float n = fract( sin( dot( floor( q ), vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
	float k = step( 0.62, n ) * 0.8;`
            : // (a plaid: bands up and round, where they cross the darker; a thin line through each)
              `vec2 q = vec2( vLifeRest.y * 7.0, ( vLifeRest.x + vLifeRest.z ) * 7.0 );
	vec2 f = abs( fract( q ) - 0.5 ) * 2.0;
	vec2 s = smoothstep( 0.55, 0.62, f );
	vec2 l = 1.0 - smoothstep( 0.04, 0.08, abs( fract( q * 2.0 + 0.25 ) - 0.5 ) );
	float k = clamp( ( s.x + s.y ) * 0.5 + ( l.x + l.y ) * 0.18, 0.0, 1.0 );`;
  return {
    key: `life-pattern-${kind}`,
    patch(sh: Shader) {
      sh.uniforms.lifeA = u.lifeA;
      sh.uniforms.lifeB = u.lifeB;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vLifeRest;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLifeRest = position;");
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vLifeRest;\nuniform vec3 lifeA;\nuniform vec3 lifeB;",
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
{
	${band}
	diffuseColor.rgb *= mix( lifeA, lifeB, k );
}`,
        );
    },
  };
}

/** What an avatar wears, by the wardrobe's slots (shared/avatar.ts): the garments' names as the files have
 *  them — `files` the ones made, `specs` their rules (an alias drawn as another). A dress stands for the
 *  bottom too (but leggings); bald is no hair (the file's own dropped); none, nothing. */
export function wornNames(a: AvatarLayers, specs: Record<string, WearSpec>, files: readonly string[]): string[] {
  const has = (n: string) => files.includes(n) || !!specs[n]?.alias;
  const out: string[] = [];
  const top = has(`top-${a.top}`) ? `top-${a.top}` : "top-tee";
  out.push(top);
  if (top !== "top-dress" || a.bottom === "leggings")
    out.push(has(`bottom-${a.bottom}`) ? `bottom-${a.bottom}` : "bottom-jeans");
  if (a.outer && a.outer !== "none" && has(`outer-${a.outer}`)) out.push(`outer-${a.outer}`);
  out.push(has(`shoes-${a.shoes}`) ? `shoes-${a.shoes}` : "shoes-sneakers");
  if (a.accessory && has(`hat-${a.accessory}`)) out.push(`hat-${a.accessory}`);
  if (a.hair === "bald") out.push("hair-bald");
  else if (has(`hair-${a.hair}`)) out.push(`hair-${a.hair}`);
  if (a.beard && a.beard !== "none" && has(`beard-${a.beard}`)) out.push(`beard-${a.beard}`);
  // (the glasses and the one more thing: props.py's, laid on the body — no skin hidden under them)
  if (a.eyewear && a.eyewear !== "none" && has(`eyewear-${a.eyewear}`)) out.push(`eyewear-${a.eyewear}`);
  if (a.extra && a.extra !== "none" && has(`extra-${a.extra}`)) out.push(`extra-${a.extra}`);
  return out;
}

/** The wardrobe's pattern names as the patterns drawn ("trim", "none": plain). */
export function patternOf(name: string | undefined): WearPattern {
  return name === "stripes" || name === "plaid" || name === "check" || name === "dots" || name === "tweed"
    ? name
    : "plain";
}
