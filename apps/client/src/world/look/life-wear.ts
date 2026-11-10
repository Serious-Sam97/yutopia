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
  /** how far off the body it stands (dm): the extras sit over the thickest worn (coatOf) */
  thick?: number;
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
              `vec3 q = vLifeRest * 240.0; // (finer than at first: up close at 90 its flecks read as blocks — plan 74)
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

/** How much a cloth folds (plan 74 phase 3): a soft knit most, denim's larger stiffer folds a little less,
 *  a thick wool or tweed least. By the material library's fabric. */
export const FOLD_BY_FABRIC: Record<string, number> = {
  linen: 1,
  twill: 0.85,
  herringbone: 0.6,
  boucle: 0.45,
  tweed: 0.45,
};

/** How strong a garment's weave is in its normal against the library's cloth (plan 74): a coat's
 *  herringbone read as a loud zigzag, a sweater's boucle as popcorn. */
export const WEAVE_DEPTH_BY_FABRIC: Record<string, number> = {
  linen: 1,
  twill: 0.8,
  herringbone: 0.45,
  boucle: 0.4,
  tweed: 0.6,
};

/** How much finer a garment's weave is than the library's cloth (plan 74 phase 3): at the library's scale
 *  a tee's knit read as a chunky sweater's. */
export const WEAVE_BY_FABRIC: Record<string, number> = {
  linen: 3,
  twill: 2,
  herringbone: 2,
  boucle: 1.4,
  tweed: 1.6,
};

/** What a garment is made of, drawn by its cloth's shader (plan 74): a front placket and its buttons,
 *  an open front, a chest pocket, ribbed hems and cuffs; a waistband and its belt loops, a fly, front
 *  and back pockets; the seams, topstitched in a thread of their own (jeans'). By the garment's name. */
export interface GarmentDetail {
  /** 0 none, 1 a full placket (a shirt), 2 a short one (a polo, a henley), 3 an open front (a coat) */
  placket?: 0 | 1 | 2 | 3;
  buttons?: number;
  chestPocket?: boolean;
  rib?: boolean;
  /** 1 a plain band, 2 with belt loops */
  waistband?: 0 | 1 | 2;
  fly?: boolean;
  /** 1 jeans' scooped, 2 slanted */
  frontPockets?: 0 | 1 | 2;
  backPockets?: boolean;
  /** the topstitching's thread (jeans'), linear rgb */
  thread?: [number, number, number];
  cuffs?: boolean;
}

const GOLD: [number, number, number] = [0.62, 0.42, 0.16];
const TROUSERS: GarmentDetail = { waistband: 2, fly: true, frontPockets: 2 };
const SWEATER: GarmentDetail = { rib: true, cuffs: true };
export const DETAILS: Record<string, GarmentDetail> = {
  "top-shirt": { placket: 1, buttons: 7, chestPocket: true, cuffs: true },
  "top-flannel": { placket: 1, buttons: 7, chestPocket: true, cuffs: true },
  "top-shirttie": { placket: 1, buttons: 7, cuffs: true },
  "top-polo": { placket: 2, buttons: 2 },
  "top-henley": { placket: 2, buttons: 3 },
  "top-sweater": SWEATER,
  "top-turtleneck": SWEATER,
  "top-sweatshirt": SWEATER,
  "top-hoodie": SWEATER,
  "top-fleece": { rib: true },
  "top-cardigan": { placket: 3, buttons: 5, rib: true, cuffs: true },
  "top-blazer": { placket: 3, buttons: 2 },
  "top-jacket": { placket: 3 },
  "top-puffer": { placket: 3 },
  "outer-coat": { placket: 3, buttons: 4 },
  "outer-raincoat": { placket: 3, buttons: 4 },
  "outer-sportcoat": { placket: 3, buttons: 2 },
  "outer-denim": { placket: 3, buttons: 5, chestPocket: true, thread: GOLD },
  "outer-parka": { placket: 3 },
  "outer-puffer": { placket: 3 },
  "outer-vest": { placket: 3 },
  "bottom-jeans": { waistband: 2, fly: true, frontPockets: 1, backPockets: true, thread: GOLD },
  "bottom-trousers": TROUSERS,
  "bottom-chinos": TROUSERS,
  "bottom-suit": TROUSERS,
  "bottom-cargo": TROUSERS,
  "bottom-shorts": TROUSERS,
  "bottom-joggers": { waistband: 1 },
  "bottom-wide": { waistband: 1 },
  "bottom-snowpants": { waistband: 1 },
  "bottom-leggings": { waistband: 1 },
  "bottom-skirt": { waistband: 1 },
  "bottom-pleated": { waistband: 1 },
  "bottom-longskirt": { waistband: 1 },
};

/** Where a garment's details sit (metres up its torso's UVs, MakeHuman's rest): a bottom's top, a top's
 *  hem, the neck joint; and a sleeve's end along the arm (0…2). */
export function detailLevels(spec: WearSpec | undefined, lm: WearLm): [number, number, number, number] {
  const at = (l?: [string, number]) => (l && lm[l[0]] ? (lm[l[0]][1] + l[1]) * 0.1 : -9);
  return [at(spec?.top), at(spec?.hem), lm.neck ? lm.neck[1] * 0.1 : -9, spec?.sleeve ?? -9];
}

/** A garment's folds (plan 74 phase 3) and its details (plan 74, the clothes' second pass): the cloth
 *  isn't a smooth shell — a height field over its UVs (in metres: round the limb or the body, and along
 *  it) and what each vertex is (`_wear`: kind, along its limb), laid into its normal through the UVs'
 *  own tangent frame, a little shade in the creases:
 *  - at a bend (the elbow, the back of the knee) creases a couple of centimetres apart, in patches;
 *  - down a limb, long soft folds; at a trouser's hem, the cloth stacked over the shoe;
 *  - on the torso, the cloth's weight in soft folds falling, a few faint creases across;
 *  - its details (GarmentDetail): grooves, raised bands and buttons in the height, the thread's colour.
 *  The torso's UVs: u round it from the front (+ the wearer's left; the sides at ±0.22, the back at
 *  ±0.44), v its height; a leg's u round it from its outside or inside (seams where sin(u/0.07) = 0); an
 *  arm's from under it. `strength` by its fabric (FOLD_BY_FABRIC); `top`: a top's or a coat's hips as its
 *  torso (wear.py unwraps them with it). One program for every garment: the rest are uniforms. */
export function foldPiece(
  strength: number,
  then: Piece | null = null,
  top = false,
  detail: GarmentDetail = {},
  levels: [number, number, number, number] = [-9, -9, -9, -9],
): Piece {
  const d = detail;
  const u = {
    lifeFold: { value: strength },
    lifeTop: { value: top ? 1 : 0 },
    lifeDetA: { value: [d.placket ?? 0, d.buttons ?? 0, d.chestPocket ? 1 : 0, d.rib ? 1 : 0] },
    lifeDetB: { value: [d.waistband ?? 0, d.fly ? 1 : 0, d.frontPockets ?? 0, d.backPockets ? 1 : 0] },
    lifeLv: { value: levels },
    lifeThread: { value: d.thread ? [...d.thread, 1] : [0, 0, 0, 0] },
    lifeCuff: { value: d.cuffs ? 1 : 0 },
  };
  return {
    key: `life-fold${then ? `+${then.key}` : ""}`,
    patch(sh: Shader, r) {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute vec3 _wear;\nvarying vec2 vLifeFoldUv;\nvarying vec2 vLifeWear;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvLifeFoldUv = vec2( uv.x, 1.0 - uv.y );\nvLifeWear = _wear.xy;",
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
varying vec2 vLifeFoldUv;
varying vec2 vLifeWear;
uniform float lifeFold;
uniform float lifeTop;
uniform vec4 lifeDetA;
uniform vec4 lifeDetB;
uniform vec4 lifeLv;
uniform vec4 lifeThread;
uniform float lifeCuff;
float lifeN( vec2 p ) {
	vec2 i = floor( p ), f = fract( p );
	f = f * f * ( 3.0 - 2.0 * f );
	float a = fract( sin( dot( i, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	float b = fract( sin( dot( i + vec2( 1.0, 0.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	float c = fract( sin( dot( i + vec2( 0.0, 1.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	float d = fract( sin( dot( i + vec2( 1.0, 1.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}
float lifeKind( vec2 w ) {
	float kind = floor( w.x + 0.5 );
	if ( lifeTop > 0.5 && kind > 2.5 && kind < 4.5 ) kind = 0.0;
	return kind;
}
// a line d away (metres), w wide
float lifeLn( float d, float w ) { return 1.0 - smoothstep( 0.0, w, abs( d ) ); }
// the cloth's height off its shell (metres): q its UVs (round, along — v up the torso: the file's are
// flipped, glTF's), w its kind and place along a limb
float lifeFoldH( vec2 q, vec2 w ) {
	float kind = lifeKind( w );
	float t = w.y;
	float h = 0.0;
	if ( kind > 0.5 && kind < 4.5 ) {
		bool leg = kind > 2.5;
		// creases at the bend: short broken ones a couple of centimetres apart, a little diagonal, in
		// patches (regular rings read as an accordion)
		float bend = exp( - pow( ( t - 1.0 ) / ( leg ? 0.17 : 0.13 ), 2.0 ) );
		float spot = smoothstep( 0.35, 0.75, lifeN( q * vec2( 22.0, 9.0 ) ) );
		h += bend * spot * 0.0016 * sin( q.y * 230.0 + q.x * 60.0 + 3.0 * lifeN( q * vec2( 12.0, 5.0 ) ) );
		// long soft folds down the limb, a little twisted
		h += 0.0042 * sin( q.x * 78.0 + q.y * 6.0 + 3.5 * lifeN( q * vec2( 4.0, 2.5 ) ) );
		// a trouser's hem stacked over the shoe
		if ( leg ) h += smoothstep( 1.6, 1.92, t ) * smoothstep( 0.3, 0.7, lifeN( q * vec2( 16.0, 8.0 ) ) ) * 0.0022 * sin( q.y * 179.5 + q.x * 40.0 + 4.0 * lifeN( q * vec2( 7.0, 5.0 ) ) );
	} else if ( kind < 0.5 ) {
		// the torso: the cloth's weight in soft folds falling, wandering; a few faint creases across, in
		// patches (lit from above, creases across shade far more than folds down)
		// (round the body by its angle, the noise off the circle: where its UVs wrap round at the back, a
		// pattern by u jumped — a seam down the back)
		float ang = q.x / 0.14;
		vec2 c = vec2( cos( ang ), sin( ang ) );
		h += 0.0065 * sin( ang * 7.0 + 4.0 * lifeN( c * 1.6 + vec2( q.y * 4.0, - q.y * 2.0 ) ) );
		h += 0.0005 * sin( q.y * 140.0 + ang * 4.0 + 3.0 * lifeN( c * 3.0 + vec2( q.y * 6.0, q.y * 3.0 ) ) ) * smoothstep( 0.55, 0.85, lifeN( c * 2.5 + vec2( q.y * 7.0, 0.0 ) ) );
	}
	return h * lifeFold;
}
// (a rib a few millimetres apart fades out before it's smaller than the pixels: it shimmered in stripes)
float lifeRibFade = 1.0;
// its details: x the height (metres), y how much darker, z the thread's share
vec3 lifeDetail( vec2 q, vec2 w ) {
	float kind = lifeKind( w );
	float a = q.x, v = q.y, t = w.y;
	float h = 0.0, ink = 0.0, thr = 0.0;
	float vTop = lifeLv.x, vHem = lifeLv.y, vNeck = lifeLv.z, sleeve = lifeLv.w;
	if ( kind < 0.5 ) {
		float aa = abs( a );
		// the side seams (and a topstitch beside them)
		float ss = aa - 0.22;
		h -= 0.0007 * lifeLn( ss, 0.0022 );
		thr += lifeThread.w * lifeLn( ss - 0.004, 0.0007 );
		float pl = lifeDetA.x;
		if ( pl > 0.5 ) {
			bool open = pl > 2.5;
			float top = vNeck - 0.02;
			float bot = pl > 1.5 && pl < 2.5 ? vNeck - 0.24 : vHem;
			if ( v < top && v > bot - 0.01 ) {
				if ( ! open ) {
					// a placket: a raised strip down the front, stitched each side
					h += 0.0006 * ( 1.0 - smoothstep( 0.012, 0.015, aa ) );
					h -= 0.0008 * lifeLn( aa - 0.0145, 0.0014 );
				} else {
					// an open front: its edge over the other side, a shadow under it
					h -= 0.0016 * lifeLn( a - 0.006, 0.0024 );
					ink += 0.3 * lifeLn( a - 0.003, 0.003 ) * step( a, 0.006 );
					thr += lifeThread.w * lifeLn( a - 0.016, 0.0007 );
				}
			}
			float n = lifeDetA.y;
			if ( n > 0.5 ) {
				float bx = open ? - 0.024 : 0.0;
				float sp = open ? 0.11 : ( pl > 1.5 ? 0.06 : 0.085 );
				float first = open ? vNeck - ( n > 2.5 ? 0.36 : 0.52 ) : vNeck - 0.06;
				float k = clamp( floor( ( first - v ) / sp + 0.5 ), 0.0, n - 1.0 );
				vec2 c = vec2( bx, first - k * sp );
				if ( c.y > vHem + 0.025 ) {
					float R = open ? 0.0095 : 0.0055;
					float r = length( vec2( a, v ) - c );
					float b = 1.0 - smoothstep( R * 0.85, R, r );
					h += 0.0018 * b * sqrt( max( 0.0, 1.0 - r * r / ( R * R ) ) );
					ink -= 0.1 * b;
					// its holes
					ink += 0.35 * b * ( 1.0 - smoothstep( 0.0007, 0.0012, min( length( vec2( a, v ) - c - vec2( R * 0.3, 0.0 ) ), length( vec2( a, v ) - c + vec2( R * 0.3, 0.0 ) ) ) ) );
				}
			}
		}
		// a chest pocket, the wearer's left
		if ( lifeDetA.z > 0.5 ) {
			float x0 = 0.035, x1 = 0.105, y0 = vNeck - 0.25, y1 = vNeck - 0.12;
			if ( a > x0 - 0.003 && a < x1 + 0.003 && v > y0 - 0.003 && v < y1 + 0.003 ) {
				float e = min( min( abs( a - x0 ), abs( a - x1 ) ), abs( v - y0 + 0.008 * ( 1.0 - abs( ( a - 0.07 ) / 0.035 ) ) ) );
				h -= 0.0007 * lifeLn( e, 0.0014 );
				ink += 0.18 * lifeLn( v - y1, 0.0025 );
				h += 0.0004 * step( v, y1 ) * step( y0, v ) * step( x0, a ) * step( a, x1 );
			}
		}
		// a ribbed hem
		if ( lifeDetA.w > 0.5 && v < vHem + 0.055 ) {
			h += 0.0005 * sin( a * 900.0 ) * lifeRibFade;
			h -= 0.0007 * lifeLn( v - vHem - 0.055, 0.002 );
		}
		// a bottom's top: its waistband, belt loops, fly, pockets
		float wb = lifeDetB.x;
		if ( wb > 0.5 && v > vTop - 0.042 ) {
			h += 0.0007;
			h -= 0.0009 * lifeLn( v - vTop + 0.042, 0.0016 );
			thr += lifeThread.w * ( lifeLn( v - vTop + 0.036, 0.0007 ) + lifeLn( v - vTop + 0.008, 0.0007 ) );
		}
		if ( wb > 1.5 && v > vTop - 0.05 ) {
			float lp = min( min( abs( aa - 0.06 ), abs( aa - 0.19 ) ), min( abs( aa - 0.31 ), abs( aa - 0.44 ) ) );
			h += 0.0016 * ( 1.0 - smoothstep( 0.004, 0.0055, lp ) );
		}
		if ( lifeDetB.y > 0.5 && v < vTop - 0.042 ) {
			float cy = vTop - 0.165;
			float d1 = v > cy ? abs( a - 0.024 ) : 1.0;
			float d2 = v <= cy && a > 0.0 ? abs( length( vec2( a, v - cy ) ) - 0.024 ) : 1.0;
			float fd = min( d1, d2 );
			h -= 0.0008 * lifeLn( fd, 0.0016 );
			thr += lifeThread.w * lifeLn( fd - 0.004, 0.0007 );
			// the front's middle seam, down to the crotch
			if ( v < vTop - 0.04 ) h -= 0.0006 * lifeLn( a, 0.002 ) * step( v, cy + 0.024 );
		}
		float fp = lifeDetB.z;
		if ( fp > 0.5 && v < vTop - 0.04 && v > vTop - 0.17 ) {
			float e;
			if ( fp < 1.5 ) e = abs( length( vec2( ( aa - 0.135 ) / 0.075, ( v - vTop + 0.042 ) / 0.075 ) ) - 1.0 ) * 0.07;
			else {
				vec2 p0 = vec2( 0.08, vTop - 0.042 ), p1 = vec2( 0.135, vTop - 0.165 );
				vec2 pa = vec2( aa, v ) - p0, ba = p1 - p0;
				e = length( pa - ba * clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 ) );
			}
			if ( aa < 0.14 ) {
				h -= 0.0009 * lifeLn( e, 0.0018 );
				ink += 0.12 * lifeLn( e, 0.002 );
				thr += lifeThread.w * lifeLn( e - 0.004, 0.0007 );
			}
		}
		if ( lifeDetB.w > 0.5 ) {
			// back pockets: either side of the back's middle, their bottoms pointed
			float px = abs( aa - 0.33 );
			float y1 = vTop - 0.075, y0 = vTop - 0.205 - 0.016 * ( 1.0 - px / 0.06 );
			if ( px < 0.064 && v > y0 - 0.004 && v < y1 + 0.004 ) {
				float e = min( abs( px - 0.06 ), min( abs( v - y0 ), abs( v - y1 ) ) );
				h -= 0.0008 * lifeLn( e, 0.0016 );
				h += 0.0004 * step( px, 0.06 ) * step( y0, v ) * step( v, y1 );
				thr += lifeThread.w * ( lifeLn( e - 0.004, 0.0007 ) + lifeLn( e - 0.008, 0.0007 ) * step( 0.5, lifeThread.w ) );
			}
		}
	} else if ( kind > 2.5 && kind < 4.5 ) {
		// a leg's seams: outside and inside
		float s = abs( sin( q.x / 0.07 ) ) * 0.07;
		h -= 0.0007 * lifeLn( s, 0.0022 );
		thr += lifeThread.w * lifeLn( s - 0.004, 0.0007 );
	} else if ( kind > 0.5 && kind < 2.5 ) {
		// a sleeve's seam, under the arm; a cuff at its end (ribbed on a sweater)
		h -= 0.0006 * lifeLn( abs( sin( q.x / 0.09 ) ) * 0.09, 0.0022 );
		if ( lifeCuff > 0.5 && sleeve > 1.5 && t > sleeve - 0.14 ) {
			h -= 0.0008 * lifeLn( ( t - sleeve + 0.14 ) * 0.25, 0.0018 );
			if ( lifeDetA.w > 0.5 ) h += 0.0005 * sin( q.x * 900.0 ) * lifeRibFade;
		}
	}
	return vec3( h, ink, clamp( thr, 0.0, 1.0 ) );
}`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
lifeRibFade = 1.0 - smoothstep( 0.0025, 0.006, fwidth( vLifeFoldUv.x ) );
vec3 lifeD = lifeDetail( vLifeFoldUv, vLifeWear );
float lifeH = lifeFoldH( vLifeFoldUv, vLifeWear );
diffuseColor.rgb *= 1.0 - 0.15 * smoothstep( 0.0, 0.006, - lifeH );
diffuseColor.rgb *= clamp( 1.0 - lifeD.y, 0.4, 1.2 );
diffuseColor.rgb = mix( diffuseColor.rgb, lifeThread.rgb, lifeD.z * 0.85 );
lifeH += lifeD.x;`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
{
	// (the folds' and the details' slope, by a step either way along the UVs, through their own tangent
	// frame — three's; a short step: a seam is a couple of millimetres across)
	const float e = 0.0007;
	float hu = ( lifeFoldH( vLifeFoldUv + vec2( e, 0.0 ), vLifeWear ) + lifeDetail( vLifeFoldUv + vec2( e, 0.0 ), vLifeWear ).x - lifeH ) / e;
	float hv = ( lifeFoldH( vLifeFoldUv + vec2( 0.0, e ), vLifeWear ) + lifeDetail( vLifeFoldUv + vec2( 0.0, e ), vLifeWear ).x - lifeH ) / e;
	vec3 q0 = dFdx( - vViewPosition ), q1 = dFdy( - vViewPosition );
	vec2 st0 = dFdx( vLifeFoldUv ), st1 = dFdy( vLifeFoldUv );
	vec3 q1p = cross( q1, normal ), q0p = cross( normal, q0 );
	vec3 T = q1p * st0.x + q0p * st1.x;
	vec3 B = q1p * st0.y + q0p * st1.y;
	float det = max( dot( T, T ), dot( B, B ) );
	float s = det == 0.0 ? 0.0 : inversesqrt( det );
	normal = normalize( normal - ( hu * T + hv * B ) * s );
}`,
        );
      then?.patch(sh, r);
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
