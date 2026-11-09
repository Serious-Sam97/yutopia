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
  collar?: number;
  above?: number;
  below?: [string, number];
  cc0?: string;
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

const level = (lm: WearLm, l: [string, number]) => (lm[l[0]]?.[1] ?? 0) + l[1];

/** Whether `spec` covers a vertex of kind `kind`, `t` along its limb, at height `y` (`front`, `rad`: off
 *  the neck) — `mt`, `my` in from its edges (0: its cut). As wear.py `covers`. */
export function covers(
  spec: WearSpec,
  kind: number,
  t: number,
  y: number,
  front: number,
  rad: number,
  lm: WearLm,
  mt = M_T,
  my = M_Y,
): boolean {
  if (spec.cc0 && !spec.below) return false;
  if (spec.skirt && covers(spec.skirt, kind, t, y, front, rad, lm, mt, my)) return true;
  const arm = kind === ARM_L || kind === ARM_R;
  const leg = kind === LEG_L || kind === LEG_R;
  if (spec.below) return leg && y <= level(lm, spec.below) - my;
  if (spec.helper === "head") return kind === HEAD && y >= (lm.brow?.[1] ?? 0) + (spec.above ?? 0) + my;
  const hem = spec.hem ? level(lm, spec.hem) : -1e9;
  const top = spec.top ? level(lm, spec.top) : 1e9;
  if (spec.helper === "skirt") return kind === TORSO && y >= hem + my && y <= top - my;
  if (kind === TORSO) {
    if (y < hem + my || y > top - my) return false;
    if (spec.neck !== undefined) {
      const line = (lm.neck?.[1] ?? 0) - spec.neck - (spec.scoop ?? 0) * Math.min(1, Math.max(0, front));
      if (y > line - my && rad < (spec.collar ?? COLLAR) + my) return false;
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
export function bodyIndex(g: BufferGeometry, specs: WearSpec[], lm: WearLm, own: boolean): number[] | null {
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
    for (const s of specs)
      if (covers(s, kind, t, y, front, rad, lm)) {
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

/** What a worn piece is coloured as: the avatar's top, bottom or shoes colour, or their hair's. */
export type WearRole = "top" | "bottom" | "shoes" | "hair" | "hat";
const BOTTOMS = /^(jeans|shorts|leggings|skirt|longskirt|trousers|chinos|pencil)/;
export function roleOf(name: string): WearRole {
  const n = name.replace(/^wear-/, "");
  if (/^(hair|beard)-/.test(n)) return "hair";
  if (/^(sneakers|boots|shoes|heels|sandals|loafers)/.test(n)) return "shoes";
  if (/^(beanie|cap|hat)/.test(n)) return "hat";
  if (BOTTOMS.test(n)) return "bottom";
  return "top";
}

/** Hair or a beard (their material is the hair's: cut out by its alpha, both sides). */
export const isHair = (name: string): boolean => name === "hair" || /^wear-(hair|beard)-/.test(name);

/** A garment's pattern: its two colours in bands off its rest place (metres; it has no UVs) — stripes
 *  across, or a plaid's two ways round. Its own part of its material (the room's light after it). */
export type WearPattern = "plain" | "stripes" | "plaid";
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
