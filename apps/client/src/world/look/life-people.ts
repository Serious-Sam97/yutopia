// Plan 73, phase 4.2 — the life look's people, per avatar: tools/art/life/build_person.py's two people
// (person-man / person-woman, each with its slim and broad bodies as morph targets) made into the person
// an avatar is.
//
//   lifeBase(gender, renderer)   the file, loaded once: where each of our joints stands, every part's
//                                geometry with its skin's joints renumbered into chars/rig.ts's JOINTS
//                                order (the two eyes after them), its finished material; the extras
//                                (the skin's mean colour, the hair's and brows', each body's joint
//                                offsets)
//   lifeBody(base, avatar)       that person as this avatar: their body's rest joints and morph
//                                weights, the skin in their colour, the hair and brows in theirs, the
//                                outfit's top, bottom and shoes in theirs (the geometry shared by all;
//                                only the materials their own)
//   lifeGender(avatar, seed)     who they are drawn as: masculine the man, feminine the woman, neutral
//                                one of the two by a seed from their name (decided 2026-11-08)
//   lifeArms(part)               a part cut to the arms (first person's hands)
//   lifeWornNow(base, avatar, r) what an avatar wears (phase 5.4: their wardrobe's slots), its garments'
//                                files loaded (a file each, only those worn; null till they're in) —
//                                lifeBody's `worn` dresses them, the skin under them hidden
import type { AvatarLayers } from "@yutopia/shared";
import {
  type BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  FrontSide,
  type Material,
  Matrix3,
  MeshPhysicalMaterial,
  type MeshStandardMaterial,
  type Object3D,
  SkinnedMesh,
  SRGBColorSpace,
  Uint16BufferAttribute,
  Vector3,
  type WebGLRenderer,
} from "three";
import { JOINTS, type JointName, PARENT } from "../chars/rig";
import { loadLifeGLTF } from "./life-assets";
import { libMaterial, libStats } from "./life-matlib";
import { LIBRARY, type MatId } from "./life-matlib-list";
import {
  bodyIndex,
  DETAILS,
  detailLevels,
  FOLD_BY_FABRIC,
  foldPiece,
  isHair,
  patternOf,
  patternPiece,
  roleOf,
  WEAVE_BY_FABRIC,
  WEAVE_DEPTH_BY_FABRIC,
  type WearLm,
  type WearPattern,
  type WearSpec,
  wornNames,
} from "./life-wear";
import type { Piece, Shader } from "./yulit";

/** Bones beyond chars/rig.ts's 31: each eye, under the head, turned by the gaze. */
/** (plan 77 phase 6) each hand bone's knuckles — the middle and the tip of the fingers, the index and the
 *  thumb (build_person.py KNUCKLES): a curl shared down them (chars/model.ts setPose) */
export const KNUCKLES = [
  ...(["L", "R"] as const).flatMap((S) =>
    (["fingers", "index", "thumb"] as const).flatMap((j) => [`${j}2${S}`, `${j}3${S}`] as const),
  ),
  // (plan 78 phase 2) five fingers: "fingers" the middle alone, the ring and the little their own three
  // bones each, off the wrist (build_person.py KNUCKLES: the same order)
  ...(["L", "R"] as const).flatMap((S) =>
    (["ring", "little"] as const).flatMap((j) => [`${j}${S}`, `${j}2${S}`, `${j}3${S}`] as const),
  ),
  // (plan 78 phase 3) and each forearm's twist, half way down it, off the elbow: a palm turned by the
  // forearm, shared along it (chars/model.ts shareTwist)
  "forearmL" as const,
  "forearmR" as const,
];
export type Knuckle = (typeof KNUCKLES)[number];
export const EXTRA = ["eyeL", "eyeR", ...KNUCKLES] as const;
export type BoneName = JointName | (typeof EXTRA)[number];
export const ALL_BONES: readonly BoneName[] = [...JOINTS, ...EXTRA];
/** A knuckle's parent: the middle's the hand bone's, the tip's the middle; the ring's and the little's
 *  base the wrist; a forearm's twist the elbow. */
export const knuckleParent = (k: Knuckle): JointName | Knuckle => extraParent(k) as JointName | Knuckle;
/** (the same, by name: chars/model.ts builds the bones without this module) */
export function extraParent(k: string): string {
  if (k.startsWith("forearm")) return `elbow${k.slice(-1)}`;
  if (k.includes("3")) return k.replace("3", "2");
  if (k.includes("2")) return k.replace("2", "");
  return `wrist${k.slice(-1)}`;
}
export const parentOf = (b: BoneName): BoneName | null =>
  b === "eyeL" || b === "eyeR"
    ? "head"
    : (KNUCKLES as readonly string[]).includes(b)
      ? knuckleParent(b as Knuckle)
      : PARENT[b as JointName];

/** How far the file's arms hang out from straight down (build_person.py ARM_OUT: the two must agree). */
export const ARM_OUT = (9 * Math.PI) / 180;

// how far the eyes turn at the gaze's ±1 (rad): across, and up or down
export const EYE_YAW = 0.38;
export const EYE_PITCH = 0.22;

export type LifeGender = "man" | "woman";
export type LifeBuild = "slim" | "regular" | "broad";

export interface LifePart {
  /** the file's: body, clothes, shoes, hair, brows, lashes, eyes */
  name: string;
  geometry: BufferGeometry;
  material: Material;
  /** its morph targets' names → index (blink, talk, smile, slim, broad — those it has) */
  morphs: Record<string, number>;
}

export interface LifeBase {
  gender: LifeGender;
  /** where each joint stands, the regular body (metres, the person facing +z, feet at y 0) */
  at: Record<BoneName, Vector3>;
  /** each other body's joint offsets from `at` */
  bodies: Partial<Record<LifeBuild, Partial<Record<BoneName, [number, number, number]>>>>;
  /** linear colours the file was painted in: the skin texture's mean, the hair's and the brows' */
  skinMean: Color;
  hairRgb: Color;
  browRgb: Color;
  parts: LifePart[];
  height: number;
  /** (phase 5) the garments' cut rules and the landmarks they're cut by — the body says what each of its
   *  vertices is, so what's worn hides the skin under it */
  wear: Record<string, WearSpec>;
  wearLm: WearLm;
  /** the garments made, a file each (public/life/wear-<who>/<name>.glb) */
  wearFiles: string[];
  /** the body's geometry per outfit (the skin under it dropped), shared by everyone in it */
  outfits: Map<string, BufferGeometry>;
}

// ── the skin's light and the eyes' colour (plan 73 4.4) ──────────────────────────────────────────

// Skin: the light wraps a little past where it falls off — the red the farthest: light goes into skin
// and comes out a little further on, warm — a skin-only change to the physical model's direct light
// (its highlight and sheen as before). The lamps' (diffuse only, look/life-lamps.ts) wrap the same.
const SKIN_GLSL = `
const vec3 LIFE_SKIN_WRAP = vec3( 0.46, 0.22, 0.15 );
vec3 lifeSkinDiffuse( const in IncidentLight directLight, const in vec3 geometryNormal, const in PhysicalMaterial material ) {
	float nl = dot( geometryNormal, directLight.direction );
	vec3 wrapped = saturate( ( vec3( nl ) + LIFE_SKIN_WRAP ) / ( 1.0 + LIFE_SKIN_WRAP ) );
	return wrapped * directLight.color * BRDF_Lambert( material.diffuseContribution );
}
void RE_Direct_Skin( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	ReflectedLight own = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, own );
	reflectedLight.directSpecular += own.directSpecular;
	reflectedLight.directDiffuse += lifeSkinDiffuse( directLight, geometryNormal, material );
}
void RE_Direct_SkinLamp( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.directDiffuse += lifeSkinDiffuse( directLight, geometryNormal, material );
}
#undef RE_Direct
#define RE_Direct RE_Direct_Skin
#define RE_Direct_Lamp RE_Direct_SkinLamp
`;
/** The skin's own part of its material (the room's light after it: yulit's `base`). */
export const SKIN_PIECE: Piece = {
  key: "life-skin",
  patch(sh: Shader) {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <lights_physical_pars_fragment>",
      `#include <lights_physical_pars_fragment>\n${SKIN_GLSL}`,
    );
  },
};

// Hair (plan 74 phase 4): its light runs along the strands — a band across them, not a blob. Two shifted
// lobes along the strand's direction (Kajiya-Kay, as hair cards are lit): a near-white one, and a wider
// one in the hair's own colour, broken up strand to strand; the diffuse wrapped a little (light comes
// through hair). The strand's direction: the texture's v (the cards' and the cap's run along it), from
// the UVs' derivatives.
const HAIR_GLSL = `
vec3 lifeHairT = vec3( 0.0, 1.0, 0.0 );
float lifeHairJit = 0.5;
float lifeHairSpec( vec3 T, vec3 H, float e ) {
	float th = dot( T, H );
	return pow( sqrt( max( 0.0, 1.0 - th * th ) ), e );
}
void RE_Direct_Hair( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float nl = dot( geometryNormal, directLight.direction );
	float wrap = saturate( ( nl + 0.35 ) / 1.35 );
	reflectedLight.directDiffuse += wrap * directLight.color * BRDF_Lambert( material.diffuseContribution );
	vec3 H = normalize( directLight.direction + geometryViewDir );
	vec3 T1 = normalize( lifeHairT + geometryNormal * 0.12 );
	vec3 T2 = normalize( lifeHairT - geometryNormal * 0.18 );
	float lit = smoothstep( -0.1, 0.35, nl );
	// (the near lobe warmed by the hair's colour too: white, it laid pale grey streaks over brown hair)
	vec3 s1 = mix( vec3( 0.035 ), material.diffuseContribution * 0.18, 0.6 ) * lifeHairSpec( T1, H, 110.0 );
	vec3 s2 = material.diffuseContribution * 0.45 * lifeHairSpec( T2, H, 24.0 ) * ( 0.6 + 0.8 * lifeHairJit );
	reflectedLight.directSpecular += ( s1 + s2 ) * directLight.color * lit;
}
void RE_Direct_HairLamp( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float nl = dot( geometryNormal, directLight.direction );
	reflectedLight.directDiffuse += saturate( ( nl + 0.35 ) / 1.35 ) * directLight.color * BRDF_Lambert( material.diffuseContribution );
}
#undef RE_Direct
#define RE_Direct RE_Direct_Hair
#define RE_Direct_Lamp RE_Direct_HairLamp
`;
// ── fur shells (plan 74, the technique samples) ─────────────────────────────────────────────────────

/** A fur shell: one of a stack of layers over a beard or a scalp (hair.py `_make_shells`: each vertex's
 *  `_shell` its layer 0…1 and the density there). Round strand sections cut out of it — thinner and fewer
 *  the higher, leaning down the face (`lean`), a cell `density` strands a decimetre, `thick` across one
 *  at the root — a little darker there, each strand its own shade (one flat colour read as felt). The
 *  third of `_shell`: how tall the hair is there (a fade's sides short: the layers' strands end lower).
 *  Grown wider as a strand gets smaller than a pixel (else they shimmered away at a distance). */
function shellPiece(density: number, lean: number, thick = 0.4): Piece {
  return {
    key: `life-shell-${density}-${lean}-${thick}`,
    patch(sh: Shader) {
      sh.vertexShader = sh.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute vec3 _shell;\nvarying vec3 vShell;\nvarying vec2 vShellUv;",
        )
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvShell = _shell;\nvShellUv = uv;");
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
varying vec3 vShell;
varying vec2 vShellUv;
float lifeSH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }`,
        )
        // (lit as the head's hair is, along the strands — down the face, its v: flat, it read as felt)
        .replace("#include <lights_physical_pars_fragment>", `#include <lights_physical_pars_fragment>\n${HAIR_GLSL}`)
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
{
	vec3 q0 = dFdx( - vViewPosition ), q1 = dFdy( - vViewPosition );
	vec2 st0 = dFdx( vShellUv ), st1 = dFdy( vShellUv );
	vec3 B = cross( q1, normal ) * st0.y + cross( normal, q0 ) * st1.y;
	if ( dot( B, B ) > 1e-12 ) lifeHairT = normalize( B - normal * dot( B, normal ) );
	lifeHairJit = lifeSH( floor( vShellUv * ${density.toFixed(1)} ) + 9.1 );
}`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
{
	float t = vShell.x, dens = vShell.y;
	vec2 g = vShellUv * ${density.toFixed(1)};
	g.y += ${lean.toFixed(2)} * t;
	vec2 cell = floor( g );
	vec2 f = fract( g ) - 0.5 - ( vec2( lifeSH( cell ), lifeSH( cell + 7.1 ) ) - 0.5 ) * 0.5;
	float len = 0.4 + 0.6 * lifeSH( cell + 5.7 );
	float r = mix( ${thick.toFixed(2)}, 0.07, clamp( t / len, 0.0, 1.0 ) ) + 0.5 * clamp( fwidth( g.x ) - 0.35, 0.0, 1.0 );
	if ( lifeSH( cell + 3.3 ) > dens * 1.15 || t > len || length( f * vec2( 1.0, 0.7 ) ) > r ) discard;
	diffuseColor.rgb *= mix( 0.7, 1.2, t / len ) * ( 0.8 + 0.4 * lifeSH( cell + 9.1 ) );
}`,
        );
    },
  };
}

/** A made style's cap or shell (hair.py: the style file's part without a suffix — a card style's cap,
 *  a locs shell); not MakeHuman's CC0 hairs, whole meshes under the wardrobe's names (plan 75: braids,
 *  crew, slick, pixie) — strand-lit hair, not a cap. */
const CARD_CAP = /^wear-hair-(?!(?:braids|crew|slick|pixie)$)[a-z]+$/;

/** The hair's own part of its material: its light along the strands (above). */
function hairPiece(cols: number, bend: number): Piece {
  return {
    key: `life-hair-${cols}-${bend}`,
    patch(sh: Shader) {
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <lights_physical_pars_fragment>", `#include <lights_physical_pars_fragment>\n${HAIR_GLSL}`)
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
#ifdef USE_MAP
{
	// (the strand's direction: along the texture's v, by the UVs' own derivatives — three's tangent frame)
	vec3 q0 = dFdx( - vViewPosition ), q1 = dFdy( - vViewPosition );
	vec2 st0 = dFdx( vMapUv ), st1 = dFdy( vMapUv );
	vec3 q1p = cross( q1, normal ), q0p = cross( normal, q0 );
	vec3 B = q1p * st0.y + q0p * st1.y;
	if ( dot( B, B ) > 1e-12 ) lifeHairT = normalize( B - normal * dot( B, normal ) );
	lifeHairJit = fract( sin( floor( vMapUv.x * 512.0 ) * 12.9898 ) * 43758.5453 );
	// (a card's normal bent across it, as round as a lock of hair — flat, each card caught one even
	// highlight, and rows of them read as blocks; its column of the atlas is a quarter across)
	vec3 side = normalize( cross( lifeHairT, normal ) );
	normal = normalize( normal + side * ( fract( vMapUv.x * ${cols.toFixed(1)} ) - 0.5 ) * ${bend.toFixed(2)} );
}
#endif`,
        );
    },
  };
}
/** Cards: the atlas four columns across. */
export const HAIR_PIECE = hairPiece(4, 1.4);

// ── a beard on the skin (plan 74 phase 5) ─────────────────────────────────────────────────────────

/** The beards painted on the skin, in the order the body file carries their densities (`_bearda` full,
 *  boxed, stubble; `_beardb` moustache, goatee, chinstrap; `_beardc` muttonchops — GLTFLoader lowercases
 *  the file's `_BEARDA`…). */
const BEARDS = ["full", "boxed", "stubble", "mustache", "goatee", "chinstrap", "muttonchops"];

/** A beard painted on the skin: its density (the body's own, per vertex: soft at every edge) in strokes
 *  of hair combed down (a noise long down the face and fine across, in the rest place), darker and
 *  rougher where it grows; stubble a fainter, finer shadow. `then` the skin's own piece. */
export function beardPiece(style: string, color: Color, then: Piece | null): Piece {
  const i = BEARDS.indexOf(style);
  const w = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  if (i >= 0) w[i] = 1;
  const u = {
    lifeBeardW: { value: w },
    lifeBeardC: { value: color },
    lifeBeardK: { value: style === "stubble" ? 0.75 : 1.0 },
  };
  return {
    key: `life-beard${then ? `+${then.key}` : ""}`,
    patch(sh: Shader, r) {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
attribute vec3 _bearda;
attribute vec3 _beardb;
attribute vec3 _beardc;
uniform float lifeBeardW[ 9 ];
varying float vBeardD;
varying vec3 vBeardP;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
vBeardD = dot( _bearda, vec3( lifeBeardW[ 0 ], lifeBeardW[ 1 ], lifeBeardW[ 2 ] ) )
	+ dot( _beardb, vec3( lifeBeardW[ 3 ], lifeBeardW[ 4 ], lifeBeardW[ 5 ] ) )
	+ dot( _beardc, vec3( lifeBeardW[ 6 ], lifeBeardW[ 7 ], lifeBeardW[ 8 ] ) );
vBeardP = position;`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
uniform vec3 lifeBeardC;
uniform float lifeBeardK;
varying float vBeardD;
varying vec3 vBeardP;
float lifeBH( vec3 i ) { return fract( sin( dot( i, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
float lifeBN( vec3 p ) {
	vec3 i = floor( p ), f = fract( p );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( lifeBH( i ), lifeBH( i + vec3( 1, 0, 0 ) ), f.x ), mix( lifeBH( i + vec3( 0, 1, 0 ) ), lifeBH( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
		mix( mix( lifeBH( i + vec3( 0, 0, 1 ) ), lifeBH( i + vec3( 1, 0, 1 ) ), f.x ), mix( lifeBH( i + vec3( 0, 1, 1 ) ), lifeBH( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float lifeBeardCover = 0.0;`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
if ( vBeardD > 0.01 ) {
	// strokes: long down the face, fine across (metres, the rest place); a finer grain over them
	float st = lifeBN( vBeardP * vec3( 650.0, 150.0, 650.0 ) );
	float gr = lifeBN( vBeardP * 1800.0 );
	float c = smoothstep( 0.1, 0.65, vBeardD ) * ( 0.5 + 0.5 * st ) + vBeardD * 0.3 * gr;
	lifeBeardCover = clamp( c * lifeBeardK, 0.0, 1.0 );
	diffuseColor.rgb = mix( diffuseColor.rgb, lifeBeardC * ( 0.7 + 0.6 * st ), lifeBeardCover * 0.88 );
}`,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          "#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.85, lifeBeardCover );",
        );
      then?.patch(sh, r);
    },
  };
}

/** Eye colours, as common as they are (a person's by the seed from their name: the avatar has none). */
const IRISES: [number, string][] = [
  [0.34, "#3a2416"], // dark brown
  [0.2, "#5e3a20"], // brown
  [0.12, "#6e5a2e"], // hazel
  [0.08, "#4a6040"], // green
  [0.14, "#46647f"], // blue
  [0.07, "#62707a"], // grey
  [0.05, "#7a5a2a"], // amber
];
export function irisOf(seed: number): Color {
  let x = ((seed >>> 0) % 1000) / 1000;
  for (const [p, hex] of IRISES) {
    if (x < p) return new Color(hex);
    x -= p;
  }
  return new Color(IRISES[0][1]);
}

/** The eyes' own part: the grey iris (build_person.py grey_iris) in the person's colour (`lifeIris`, set by
 *  whoever owns the material — chars/life.ts — else a brown). `at`: the two irises' centres and radius. */
export function eyePiece(at: number[]): Piece {
  const [u1, v1, u2, v2, r] = at;
  const f = (x: number) => x.toFixed(4);
  return {
    key: "life-eye",
    patch(sh: Shader) {
      sh.uniforms.lifeIris ??= { value: new Color("#5e3a20") };
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 lifeIris;")
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
#ifdef USE_MAP
{
	float d = min( distance( vMapUv, vec2( ${f(u1)}, ${f(v1)} ) ), distance( vMapUv, vec2( ${f(u2)}, ${f(v2)} ) ) );
	float k = 1.0 - smoothstep( ${f(r * 0.94)}, ${f(r * 1.06)}, d );
	diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * lifeIris * 2.2, k );
}
#endif`,
        );
    },
  };
}

/** The mouth's own part: the teeth and the tongue darker the farther back they are (a mouth's shade,
 *  which the room's light and the AO don't give a few millimetres in) — `front`: the front teeth's z. */
export function mouthPiece(front: number): Piece {
  const f = (x: number) => x.toFixed(4);
  return {
    key: `life-mouth${f(front)}`,
    patch(sh: Shader) {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying float vLifeMouth;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\nvLifeMouth = smoothstep( ${f(front - 0.05)}, ${f(front - 0.004)}, position.z );`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vLifeMouth;")
        .replace(
          "#include <color_fragment>",
          "#include <color_fragment>\ndiffuseColor.rgb *= mix( 0.18, 1.0, vLifeMouth );",
        );
    },
  };
}

/** Put a material's own piece on it alone (the benches, unlit by a room): the world's people get it as
 *  yulit's `base` (chars/life.ts). */
export function givePiece(m: Material, piece: Piece): void {
  m.userData.lifePiece = piece;
  m.onBeforeCompile = (sh, r) => piece.patch(sh, r);
  m.customProgramCacheKey = () => piece.key;
}

// ── the materials' finish (the painted style: plan 73 phase 0b's polish) ─────────────────────────

function finish(name: string, mat: MeshStandardMaterial, hasColour: boolean, iris: number[] | null): Material {
  let out: MeshStandardMaterial = mat;
  if (name === "body") {
    out = new MeshPhysicalMaterial({
      map: mat.map,
      vertexColors: hasColour,
      roughness: 0.52,
      metalness: 0,
      specularIntensity: 0.55,
      sheen: 0.55,
      sheenColor: new Color(1, 0.72, 0.62),
      sheenRoughness: 0.55,
      envMapIntensity: 0.9,
    });
    mat.dispose();
    givePiece(out, SKIN_PIECE);
  } else if (isHair(name)) {
    out = new MeshPhysicalMaterial({
      map: mat.map,
      roughness: 0.6,
      metalness: 0,
      sheen: 0.25,
      sheenColor: new Color(0.9, 0.8, 0.7),
      sheenRoughness: 0.5,
    });
    mat.dispose();
    // (plan 74: no sheen, little of the sky — at grazing angles and facing up they lit the strands in pale
    // patches)
    const hair = out as MeshPhysicalMaterial;
    hair.sheen = 0;
    hair.envMapIntensity = 0.25;
    hair.specularIntensity = 0.35;
    if (CARD_CAP.test(name)) {
      // (a card style's cap: under the cards, plain and rough — lit along its strands too, it shone through
      // them as a smooth band)
      hair.roughness = 0.85;
    } else if (!/-shell$/.test(name) && (!/beard/.test(name) || /-cards$/.test(name))) givePiece(out, HAIR_PIECE);
    // (plan 74: lit along the strands; not a beard's — it's painted over the skin, and phase 5's)
  } else if (name === "eyes") {
    // wet: a clear coat over a softer eye (the whole eye a mirror read glassy), the light's glint on it
    out = new MeshPhysicalMaterial({
      map: mat.map,
      roughness: 0.32,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.2,
    });
    mat.dispose();
    if (iris) givePiece(out, eyePiece(iris));
  } else if (name === "teeth") {
    // ivory, not the texture's blue-white; little of the sky's light gets into a mouth
    mat.roughness = 0.35;
    mat.color.setRGB(0.8, 0.75, 0.66);
    mat.envMapIntensity = 0.35;
  } else if (name === "tongue") {
    mat.roughness = 0.5;
    mat.color.setRGB(0.72, 0.62, 0.62);
    mat.envMapIntensity = 0.35;
  } else if (!/lashes|brows/.test(name)) mat.roughness = Math.max(mat.roughness, 0.75);
  // hair and the eyes' corneas: cut out by their alpha, softly (alpha to coverage on the antialiased
  // frame: no sorting, no flicker on strands); the lashes too. Brows: truly see-through, drawn last.
  if (/-shell$/.test(name)) {
    // (a fur shell: no texture, its strands cut out in the shader; solid, outward only)
    out.map = null;
    out.transparent = false;
    out.alphaTest = 0;
    out.depthWrite = true;
    out.side = FrontSide;
    givePiece(
      out,
      /stubble/.test(name)
        ? shellPiece(320, 0.05, 0.15)
        : /buzz|fade/.test(name)
          ? shellPiece(140, 0.25)
          : shellPiece(110, 0.6),
    );
  } else if (/beard/.test(name) && !/-cards$/.test(name)) {
    // a beard: one layer of painted hair over the skin, blended (plan 73's; plan 74's are cards, below) — cut out, its soft edge went hard and
    // jagged without multisampling (the composer's frame)
    out.transparent = true;
    out.alphaTest = 0;
    out.depthWrite = false;
    out.side = DoubleSide;
  } else if (/hair|lashes|beard/.test(name)) {
    // (plan 74 phase 1) the core, cut at half: its soft fringe is a second, blended draw (softEdgeMesh).
    // Alpha to coverage needed a multisampled frame, and High's and Medium's aren't (+4.6 ms in the lobby
    // multisampled): there it fell back to a hard one-bit cut — the stair-stepped hairlines
    out.transparent = false;
    out.alphaToCoverage = false;
    out.alphaTest = 0.5;
    out.depthWrite = true;
    out.side = DoubleSide;
  } else if (/eyes/.test(name)) {
    out.transparent = false;
    out.alphaToCoverage = true;
    out.alphaTest = 0.02;
    out.depthWrite = true;
  } else if (name === "brows") {
    out.transparent = true;
    out.alphaTest = 0;
    out.depthWrite = false;
    out.side = DoubleSide;
  }
  if (name === "clothes" || name === "shoes") out.vertexColors = name === "clothes";
  // (the far person: its colours by what each vertex is, coloured by the avatar — farPiece)
  if (name === "far") {
    out.vertexColors = true;
    out.roughness = 0.8;
  }
  return out;
}

// ── the hair's soft edge (plan 74 phase 1) ────────────────────────────────────────────────────────

/** Parts drawn twice: the core cut at half its alpha (opaque, writing depth), then the soft edge. */
export const hasSoftEdge = (name: string): boolean =>
  name === "lashes" || (isHair(name) && !/-shell$/.test(name) && (!/beard/.test(name) || /-cards$/.test(name)));

/** The soft edge's material: the core's, blended, writing no depth. Where it falls on the core it lays
 *  the same colour over itself (no change); past it, the fringe fades into what's behind. The core's
 *  shader pieces come along (`copy` leaves `onBeforeCompile` behind). */
export function softEdgeMaterial(core: Material): Material {
  const m = core.clone();
  m.userData = { ...core.userData };
  m.onBeforeCompile = core.onBeforeCompile;
  m.customProgramCacheKey = core.customProgramCacheKey;
  m.transparent = true;
  m.depthWrite = false;
  m.alphaTest = 0.01;
  m.alphaToCoverage = false;
  return m;
}

/** The soft edge's mesh beside `core`: the same geometry, bones and face shapes (the same influences'
 *  array, so the face moves both), no shadow of its own. */
export function softEdgeMesh(core: SkinnedMesh, material: Material): SkinnedMesh {
  const e = new SkinnedMesh(core.geometry, material);
  e.name = `${core.name}-edge`;
  e.castShadow = false;
  e.receiveShadow = core.receiveShadow;
  e.frustumCulled = core.frustumCulled;
  e.boundingSphere = core.boundingSphere;
  e.renderOrder = core.renderOrder;
  e.morphTargetDictionary = core.morphTargetDictionary;
  e.morphTargetInfluences = core.morphTargetInfluences;
  e.bindMode = core.bindMode;
  e.bind(core.skeleton, core.bindMatrix);
  core.parent?.add(e);
  return e;
}

// ── the base: a file, once ──────────────────────────────────────────────────────────────────────

const srgb = (v: number[] | undefined, d: [number, number, number]) =>
  new Color().setRGB(...((v ?? d) as [number, number, number]), SRGBColorSpace);

/** A person's file made ready to dress: its joints, parts and extras. */
export async function loadLifeBase(url: string, renderer: WebGLRenderer, gender: LifeGender): Promise<LifeBase> {
  const gltf = await loadLifeGLTF(renderer, url);
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  // the extras (the rig's node: build_person.py EXTRAS)
  let extras: {
    skin_mean?: number[];
    hair_rgb?: number[];
    brow_rgb?: number[];
    iris?: number[];
    bodies?: LifeBase["bodies"];
    wear?: Record<string, WearSpec>;
    wear_lm?: WearLm;
    wear_files?: string[];
  } = {};
  scene.traverse((o: Object3D) => {
    const life = (o.userData as { life?: string }).life;
    if (life) extras = JSON.parse(life);
  });
  let found: SkinnedMesh | null = null;
  scene.traverse((o: Object3D) => {
    if ((o as SkinnedMesh).isSkinnedMesh && !found) found = o as SkinnedMesh;
  });
  if (!found) throw new Error(`${url}: no skinned mesh`);
  const at = {} as Record<BoneName, Vector3>;
  for (const b of (found as SkinnedMesh).skeleton.bones)
    if ((ALL_BONES as readonly string[]).includes(b.name)) at[b.name as BoneName] = b.getWorldPosition(new Vector3());
  for (const j of JOINTS) if (!at[j]) throw new Error(`${url}: no joint ${j}`);
  for (const e of ["eyeL", "eyeR"] as const) at[e] ??= at.head.clone();
  // (a file from before the knuckles: each at its hand bone — weighted nothing, it bends nothing)
  for (const k of KNUCKLES) at[k] ??= at[knuckleParent(k)].clone();
  const parts: LifePart[] = [];
  let top = 0;
  scene.traverse((o: Object3D) => {
    const m = o as SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    // (standing as drawn, their own place baked in; the shapes are offsets: turned, never moved)
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    const turn = new Matrix3().setFromMatrix4(m.matrixWorld);
    for (const a of g.morphAttributes.position ?? []) (a as BufferAttribute).applyMatrix3(turn);
    // its skin's joints renumbered into ours
    const order = m.skeleton.bones.map((b) => (ALL_BONES as readonly string[]).indexOf(b.name));
    const si = g.getAttribute("skinIndex") as BufferAttribute;
    const idx = new Uint16Array(si.count * 4);
    for (let i = 0; i < si.count * 4; i++) idx[i] = Math.max(0, order[si.array[i] as number]);
    g.setAttribute("skinIndex", new Uint16BufferAttribute(idx, 4));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    top = Math.max(top, g.boundingBox?.max.y ?? 0);
    // (the exporter's duplicates: "hair.001" → "hair_1")
    const name = m.name.replace(/[._]\d+$/, "");
    const material = finish(name, m.material as MeshStandardMaterial, !!g.getAttribute("color"), extras.iris ?? null);
    if (name === "teeth" || name === "tongue") givePiece(material, mouthPiece(g.boundingBox?.max.z ?? 0));
    parts.push({
      name,
      geometry: g,
      material,
      // (the shapes' names are the file's: GLTFLoader keeps them on its mesh, not the geometry)
      morphs: { ...(m.morphTargetDictionary ?? {}) },
    });
  });
  socksUnder(parts);
  return {
    gender,
    at,
    bodies: extras.bodies ?? {},
    skinMean: srgb(extras.skin_mean, [0.7, 0.5, 0.4]),
    hairRgb: srgb(extras.hair_rgb, [0.2, 0.13, 0.08]),
    browRgb: srgb(extras.brow_rgb, [0.2, 0.13, 0.08]),
    parts,
    height: top,
    wear: extras.wear ?? {},
    wearLm: extras.wear_lm ?? {},
    wearFiles: extras.wear_files ?? [],
    outfits: new Map(),
  };
}

// The shoes' socks run up the shin (23 cm) and poked through tight trousers in the colour of the shoes:
// under trousers (the clothes reaching below the knee), the socks are cut off a little over the hem.
function socksUnder(parts: LifePart[]): void {
  const clothes = parts.find((p) => p.name === "clothes");
  const shoes = parts.find((p) => p.name === "shoes");
  const hem = clothes?.geometry.boundingBox?.min.y ?? 1;
  if (!shoes || hem > 0.2) return;
  const g = shoes.geometry;
  const pos = g.getAttribute("position");
  const index = g.getIndex();
  const n = index ? index.count : pos.count;
  const keep: number[] = [];
  for (let t = 0; t < n; t += 3) {
    const v = [0, 1, 2].map((k) => (index ? index.getX(t + k) : t + k));
    if (Math.min(...v.map((i) => pos.getY(i))) < hem + 0.04) keep.push(...v);
  }
  g.setIndex(keep);
}

const bases = new Map<string, Promise<LifeBase>>();
const basesIn = new Map<string, LifeBase>();

/** The man's or the woman's file, loaded once (the first renderer's loader: the same GPU's formats). */
export function lifeBase(gender: LifeGender, renderer: WebGLRenderer): Promise<LifeBase> {
  let p = bases.get(gender);
  if (!p) {
    p = loadLifeBase(`/life/person-${gender}-painted.glb`, renderer, gender);
    bases.set(gender, p);
    p.then(
      (b) => basesIn.set(gender, b),
      () => bases.delete(gender),
    );
  }
  return p;
}
/** The file if it's in (null meanwhile: asked for). */
export function lifeBaseNow(gender: LifeGender, renderer: WebGLRenderer): LifeBase | null {
  void lifeBase(gender, renderer);
  return basesIn.get(gender) ?? null;
}

const fars = new Map<string, Promise<LifePart>>();
const farsIn = new Map<string, LifePart>();
/** The far person if it's in (null meanwhile: asked for). */
export function lifeFarNow(gender: LifeGender, renderer: WebGLRenderer): LifePart | null {
  void lifeFar(gender, renderer);
  return farsIn.get(gender) ?? null;
}

/** The man's or the woman's far person (plan 73 4.5: one coarse mesh, no textures), loaded once. */
export function lifeFar(gender: LifeGender, renderer: WebGLRenderer): Promise<LifePart> {
  let p = fars.get(gender);
  if (!p) {
    p = loadLifeBase(`/life/person-${gender}-far.glb`, renderer, gender).then((b) => {
      const far = b.parts.find((x) => x.name === "far");
      if (!far) throw new Error(`person-${gender}-far.glb: no far mesh`);
      return far;
    });
    fars.set(gender, p);
    p.then(
      (f) => farsIn.set(gender, f),
      () => fars.delete(gender),
    );
  }
  return p;
}

// (each garment's file, loaded once a gender: its parts, or null if it didn't load)
const garments = new Map<string, Promise<LifePart[] | null>>();
const garmentsIn = new Map<string, LifePart[] | null>();
function garment(gender: LifeGender, name: string, renderer: WebGLRenderer): Promise<LifePart[] | null> {
  const key = `${gender}/${name}`;
  let p = garments.get(key);
  if (!p) {
    p = loadLifeBase(`/life/wear-${gender}/${name}.glb`, renderer, gender).then(
      (b) => b.parts,
      (e) => {
        console.warn(`life wear: ${key} didn't load`, e);
        return null;
      },
    );
    garments.set(key, p);
    p.then((parts) => garmentsIn.set(key, parts));
  }
  return p;
}

/** (plan 73 phase 11) What the garment cache and the material library hold — every garment file loaded once a gender and kept
 *  (bounded: the wardrobe's files): their count, the textures on their materials and their geometry's
 *  bytes, for the memory checker (e2e/memcheck.mts) to tell a cache filling from a leak. */
export function lifeHeld(): { files: number; textures: number; MB: number } {
  const tex = new Set<string>();
  let bytes = 0;
  for (const parts of garmentsIn.values())
    for (const p of parts ?? []) {
      for (const v of Object.values(p.material as unknown as Record<string, unknown>))
        if (v && typeof v === "object" && (v as { isTexture?: boolean }).isTexture)
          tex.add((v as { uuid: string }).uuid);
      for (const a of Object.values(p.geometry.attributes))
        bytes += (a.array as ArrayLike<number> & { byteLength: number }).byteLength;
      for (const list of Object.values(p.geometry.morphAttributes))
        for (const a of list) bytes += (a.array as ArrayLike<number> & { byteLength: number }).byteLength;
    }
  // (and the material library's maps, three a set, kept to its byte budget — life-matlib.ts)
  // (the game's renderer's: the memory checker counts that one's textures)
  const lib = libStats(
    (window as unknown as { __yutopia?: { tp?: { renderer?: WebGLRenderer } } }).__yutopia?.tp?.renderer,
  );
  return { files: garmentsIn.size, textures: tex.size + (lib?.ready ?? 0) * 3, MB: bytes / 1e6 };
}
if (typeof window !== "undefined") (window as unknown as { __lifeHeld?: typeof lifeHeld }).__lifeHeld = lifeHeld;

/** What someone wears (phase 5): the garments' and hair's names (wear.py GARMENTS, hair.py — "top-tee",
 *  "bottom-jeans", "shoes-sneakers", "hair-long", "beard-full"), their parts (each one's file); each
 *  slot's pattern and its second colour; the renderer that draws them in the library's cloth. */
export interface LifeWorn {
  names: string[];
  parts: LifePart[];
  patterns?: Partial<Record<"top" | "bottom" | "outer", { kind: WearPattern; color2: string }>>;
  /** (the benches) one pattern on every top */
  pattern?: WearPattern;
  renderer?: WebGLRenderer;
}

/** The files `names` need (an alias's its source's). */
const filesOf = (base: LifeBase, names: string[]) =>
  [...new Set(names.map((n) => base.wear[n]?.alias ?? n))].filter((n) => base.wearFiles.includes(n));

/** What an avatar wears, once each of its garments' files is in (null meanwhile: asked for). */
export function lifeWornNow(base: LifeBase, a: AvatarLayers, renderer: WebGLRenderer): LifeWorn | null {
  const names = wornNames(a, base.wear, base.wearFiles);
  const parts: LifePart[] = [];
  let waiting = false;
  for (const f of filesOf(base, names)) {
    void garment(base.gender, f, renderer);
    const got = garmentsIn.get(`${base.gender}/${f}`);
    if (got === undefined) waiting = true;
    else if (got) parts.push(...got);
  }
  if (waiting) return null;
  const pat = (k: string | undefined, c2: string | undefined) => ({ kind: patternOf(k), color2: c2 ?? "#2a2420" });
  return {
    names,
    parts,
    renderer,
    patterns: {
      top: pat(a.topPattern, a.topColor2),
      bottom: pat(a.bottomPattern, a.bottomColor2),
      outer: pat(a.outerPattern, a.outerColor2),
    },
  };
}

/** What an avatar wears (the benches: lifeWornNow, waited for). */
export async function lifeWorn(base: LifeBase, a: AvatarLayers, renderer: WebGLRenderer): Promise<LifeWorn | null> {
  if (!base.wearFiles.length) return null;
  await Promise.all(
    filesOf(base, wornNames(a, base.wear, base.wearFiles)).map((f) => garment(base.gender, f, renderer)),
  );
  return lifeWornNow(base, a, renderer);
}

/** `names` worn (the benches), once their files are in. */
export async function lifeWornOf(
  base: LifeBase,
  names: string[],
  renderer: WebGLRenderer,
  pattern?: WearPattern,
): Promise<LifeWorn> {
  const loaded = await Promise.all(filesOf(base, names).map((f) => garment(base.gender, f, renderer)));
  return { names, parts: loaded.flatMap((p) => p ?? []), renderer, pattern };
}

/** The body's geometry for an outfit: its own attributes, its index without the skin under it (and,
 *  wearing none of the made garments, under the file's own outfit). Cached on the base. */
function bodyFor(base: LifeBase, body: LifePart, names: string[]): BufferGeometry {
  const own = !names.some((n) => ["top", "bottom", "outer"].includes(roleOf(n)));
  const key = `${own ? "own|" : ""}${[...names].sort().join(",")}`;
  const had = base.outfits.get(key);
  if (had) return had;
  const g = body.geometry;
  const specs = names.map((n) => base.wear[n]).filter((x): x is WearSpec => !!x);
  const index = bodyIndex(g, specs, base.wearLm, own);
  if (!index) return g;
  const out = new BufferGeometry();
  for (const [k, a] of Object.entries(g.attributes)) out.setAttribute(k, a);
  out.morphAttributes = g.morphAttributes;
  out.morphTargetsRelative = g.morphTargetsRelative;
  out.setIndex(index);
  out.boundingBox = g.boundingBox;
  out.boundingSphere = g.boundingSphere;
  base.outfits.set(key, out);
  return out;
}

/** A garment's geometry under `covering` (garment names): its own attributes, its index without what
 *  they cover — cached on the base, per garment and what's over it. */
function layered(base: LifeBase, part: LifePart, covering: string[]): BufferGeometry {
  const key = `${part.name}<${[...covering].sort().join(",")}`;
  const had = base.outfits.get(key);
  if (had) return had;
  const g = part.geometry;
  const specs = covering.map((n) => base.wear[n]).filter((x): x is WearSpec => !!x);
  const index = bodyIndex(g, specs, base.wearLm, false, 0.3, 0.7);
  if (!index) return g;
  const out = new BufferGeometry();
  for (const [k, a] of Object.entries(g.attributes)) out.setAttribute(k, a);
  out.morphAttributes = g.morphAttributes;
  out.morphTargetsRelative = g.morphTargetsRelative;
  out.setIndex(index);
  out.boundingBox = g.boundingBox;
  out.boundingSphere = g.boundingSphere;
  base.outfits.set(key, out);
  return out;
}

// ── who an avatar is drawn as ───────────────────────────────────────────────────────────────────

/** Masculine: the man; feminine: the woman; neutral: one of the two, by a seed from their name. */
export function lifeGender(a: Pick<AvatarLayers, "gender">, seed = 0): LifeGender {
  if (a.gender === "masculine") return "man";
  if (a.gender === "feminine") return "woman";
  return (seed >>> 0) % 2 === 0 ? "man" : "woman";
}

export const lifeBuild = (a: Pick<AvatarLayers, "body">): LifeBuild =>
  a.body === "slim" || a.body === "broad" ? a.body : "regular";

// ── the outfit's colours: the mask in its vertex colour (R 1 the top's), the colours by uniform ─────

/** The outfit's own part of its material (its top's and bottom's colours by the mask), as a piece of
 *  the material family (look/yulit.ts `base`: the room's light goes on after it). */
export function outfitPiece(top: Color, bottom: Color): Piece {
  const u = { lifeTop: { value: top }, lifeBottom: { value: bottom } };
  return {
    key: "life-outfit",
    patch(sh: Shader) {
      sh.uniforms.lifeTop = u.lifeTop;
      sh.uniforms.lifeBottom = u.lifeBottom;
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 lifeTop;\nuniform vec3 lifeBottom;")
        .replace("#include <color_fragment>", "diffuseColor.rgb *= mix( lifeBottom, lifeTop, vColor.r );");
    },
  };
}

// ── a body: the base as this avatar ─────────────────────────────────────────────────────────────

export interface LifeBody {
  base: LifeBase;
  build: LifeBuild;
  /** each bone's place from its parent, at rest (the hips': from the person's feet) */
  rest: Record<BoneName, Vector3>;
  /** where each joint stands at rest (metres, feet at 0) */
  at: Record<BoneName, Vector3>;
  parts: LifePart[];
  /** the slim and broad morphs' weights; `coat` the extras' shape over thick clothes (props.py COAT) */
  morph: { slim: number; broad: number; coat: number };
  height: number;
  /** the hip joints' height, standing */
  hipY: number;
  /** let go of what's this avatar's own (its materials: the geometry is the base's) */
  dispose(): void;
}

/** An avatar's skin colour as the surface's own under the life light: a little darker, a little richer. */
/** The most a hair's or brow's colour may lift the file's (its 8-bit dark texture: more bands). */
const HAIR_GAIN = 16;
const SKIN_LIT = 0.84;
const SKIN_RICH = 1.1;

/** How far out the extras (a bag's straps, a lanyard) sit by the thickest top or coat worn: their file's
 *  `coat` shape's weight (props.py: OVER 0.2 dm off the tights at 0, COAT 0.45 at 1 — 5.7: a backpack's
 *  straps came through a parka). */
export function coatOf(base: { wear: Record<string, WearSpec> }, names: readonly string[]): number {
  let t = 0;
  for (const n of names)
    if (roleOf(n) === "top" || roleOf(n) === "outer") t = Math.max(t, Number(base.wear[n]?.thick ?? 0));
  // (none to a sweater's 0.14; a coat's collar and shoulders stand out past its thickness: more there)
  return Math.min(1.6, Math.max(0, ((t - 0.14) / 0.25) * 1.6));
}

const LENS = "#1a1d22"; // (a glasses' dark lenses — props.py's `-lens` parts)
const own = (m: Material) => {
  const c = m.clone();
  c.userData = { ...m.userData };
  // (a clone has no hook of its own: its piece put back)
  const piece = m.userData.lifePiece as Piece | undefined;
  if (piece) givePiece(c, piece);
  return c;
};

/** An avatar's skin colour as the surface's own (linear): their colour was chosen for today's unlit
 *  people — lit, it read pale and washed out — a little darker and richer. */
export function skinOf(hex: string): Color {
  const s = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  s.getHSL(hsl);
  // (the lightest the most: lit, they ran into the curve's shoulder and went chalk white)
  const light = Math.min(1, Math.max(0, (hsl.l - 0.55) / 0.4));
  return s.setHSL(hsl.h, Math.min(1, hsl.s * (SKIN_RICH + 0.3 * light)), hsl.l).multiplyScalar(SKIN_LIT - 0.28 * light);
}

/** The far person's own part: each vertex coloured by what it is (its vertex colour: R the clothes —
 *  0.5 the bottom, 1 the top —, G the shoes, B the hair; the rest skin) in the avatar's colours. */
export function farPiece(a: AvatarLayers | null, gender: LifeGender): Piece {
  // (the near person's clothes and shoes are a near-white texture × their colour: about this much)
  const CLOTH = 0.72;
  const c = (hex: string, k = 1) => new Color(hex).multiplyScalar(k);
  // (5.6: what's seen from far off — a coat over the top, a dress for the legs too, a bald head the
  // skin)
  const skin = skinOf(a?.skin ?? (gender === "man" ? "#e2b996" : "#5b3a27"));
  const outer = a?.outer && a.outer !== "none" ? a.outerColor : null;
  const dress = a?.top === "dress" && a.bottom !== "leggings";
  const u = {
    lifeSkin: { value: skin },
    lifeTop: { value: c(outer ?? a?.topColor ?? "#d8d4cc", CLOTH) },
    lifeBottom: { value: c((dress ? a?.topColor : a?.bottomColor) ?? "#3d4a5c", CLOTH) },
    lifeShoes: { value: c(a?.shoesColor ?? "#2a2420", CLOTH) },
    lifeHair: { value: a?.hair === "bald" ? skin.clone() : c(a?.hairColor ?? "#3b2a20") },
  };
  return {
    key: "life-far",
    patch(sh: Shader) {
      Object.assign(sh.uniforms, u);
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform vec3 lifeSkin;\nuniform vec3 lifeTop;\nuniform vec3 lifeBottom;\nuniform vec3 lifeShoes;\nuniform vec3 lifeHair;",
        )
        .replace(
          "#include <color_fragment>",
          `{
	float cloth = smoothstep( 0.1, 0.4, vColor.r );
	float top = smoothstep( 0.6, 0.9, vColor.r );
	float skin = clamp( 1.0 - cloth - vColor.g - vColor.b, 0.0, 1.0 );
	diffuseColor.rgb *= lifeSkin * skin + mix( lifeBottom, lifeTop, top ) * cloth + lifeShoes * vColor.g + lifeHair * vColor.b;
}`,
        );
    },
  };
}

/** The base as this avatar (or as the file is, without one); `worn`: in the made garments (phase 5). */
export function lifeBody(base: LifeBase, a: AvatarLayers | null, worn: LifeWorn | null = null): LifeBody {
  const build = a ? lifeBuild(a) : "regular";
  const off = build === "regular" ? {} : (base.bodies[build] ?? {});
  const at = {} as Record<BoneName, Vector3>;
  for (const b of ALL_BONES) {
    const o = off[b];
    // (a base without the knuckles — before plan 77's, a made-up one — has each at its parent)
    at[b] = (base.at[b] ?? at[parentOf(b) as BoneName]).clone();
    if (o) at[b].add(new Vector3(...o));
  }
  const rest = {} as Record<BoneName, Vector3>;
  for (const b of ALL_BONES) {
    const p = parentOf(b);
    rest[b] = p ? at[b].clone().sub(at[p]) : at[b].clone();
  }
  const mine: Material[] = [];
  // (without an avatar — the benches — each person's own tone from phase 0b: the file's skin is grey)
  const skinHex = a?.skin ?? (base.gender === "man" ? "#e2b996" : "#5b3a27");
  // what's worn: the made garments in place of the file's own outfit (its shoes, its hair, as worn)
  const names = worn?.names ?? [];
  const has = (r: string) => names.some((n) => roleOf(n) === r);
  const dropped = new Set<string>();
  if (has("top") || has("bottom") || has("outer")) dropped.add("clothes");
  if (has("shoes")) dropped.add("shoes");
  if (has("hair") && names.some((n) => n.startsWith("hair-"))) dropped.add("hair");
  // (a garment drawn as another's mesh — the wardrobe's high-tops as the sneakers — by its `alias`)
  const wornParts = worn?.parts ?? [];
  const all = [...base.parts.filter((p) => !dropped.has(p.name)), ...wornParts];
  // (a layer under another hidden where that one covers it, as the skin is: a bottom under a top or a
  // coat, a top under a coat — 5.4: a skirt came through a coat at the hips)
  const over = (r: string) =>
    names.filter((n) => (r === "bottom" ? ["top", "outer"] : r === "top" ? ["outer"] : []).includes(roleOf(n)));
  const parts = all.map((p) => {
    if (p.name === "body") p = { ...p, geometry: bodyFor(base, p, names) };
    else if (p.name.startsWith("wear-") && over(roleOf(p.name)).length)
      p = { ...p, geometry: layered(base, p, over(roleOf(p.name))) };
    if (!a && p.name !== "body" && !p.name.startsWith("wear-")) return p;
    let material = p.material;
    const tint = (c: Color) => {
      material = own(p.material);
      (material as MeshStandardMaterial).color.copy(c);
      mine.push(material);
    };
    if (p.name === "body") {
      // the skin texture's colour made theirs (the file's is an even grey with its painted detail: × their
      // skin ÷ its mean)
      const s = skinOf(skinHex);
      const m = base.skinMean;
      tint(new Color(Math.min(3, s.r / m.r), Math.min(3, s.g / m.g), Math.min(3, s.b / m.b)));
      // (plan 74 phase 5) their beard painted on the skin, in their hair's colour a little darker
      const beard = names
        .find((n) => n.startsWith("beard-"))
        ?.slice(6)
        .replace(/fur$/, "");
      if (beard && a)
        givePiece(
          material,
          beardPiece(beard, new Color(a.hairColor).multiplyScalar(0.7), (material.userData.lifePiece as Piece) ?? null),
        );
    } else if (!a) {
      // (none: as the file is — the made garments a plain cloth's grey)
      if (p.name.startsWith("wear-") && !isHair(p.name)) tint(new Color(0.55, 0.55, 0.55));
    } else if (/-shell$/.test(p.name)) {
      // (a fur shell has no texture to tint: their hair's colour itself — a beard's a little lighter:
      // its layers shade each other, and it read near black under brown hair)
      tint(new Color(a.hairColor).multiplyScalar(/^wear-beard-(?!stubble)/.test(p.name) ? 1.3 : 1));
    } else if (isHair(p.name) || p.name === "brows") {
      // (their colour over the file's: the file's hair is dark, so a light colour asks a lot of each
      // channel — capped as a whole, not channel by channel, or ginger and blonde went grey: 4.5)
      const h = new Color(a.hairColor);
      const m = isHair(p.name) ? base.hairRgb : base.browRgb;
      const k = new Color(h.r / m.r, h.g / m.g, h.b / m.b);
      const most = Math.max(k.r, k.g, k.b);
      if (most > HAIR_GAIN) k.multiplyScalar(HAIR_GAIN / most);
      tint(k);
    } else if (p.name === "shoes") tint(new Color(a.shoesColor));
    else if (p.name.startsWith("wear-")) {
      // (a made garment: the avatar's colour for what it is; a top's pattern in it and the bottom's)
      const r = roleOf(p.name);
      const hex = {
        top: a.topColor,
        bottom: a.bottomColor,
        outer: a.outerColor ?? a.topColor,
        shoes: a.shoesColor,
        hat: a.accessoryColor ?? a.topColor,
        hair: a.hairColor,
        eyewear: a.eyewearColor ?? "#2a2420",
        extra: a.extraColor ?? "#8a8f96",
      }[r];
      // (a piece of its own on a garment — a shirt's tie — in that garment's second colour)
      const second = p.name.endsWith("-tie") ? (a.topColor2 ?? "#2a2420") : null;
      const fabric = base.wear[p.name.replace(/^wear-/, "")]?.fabric as MatId | undefined;
      if (p.name.endsWith("-lens")) {
        // (a glasses' lenses: dark glass, glossy)
        tint(new Color(LENS));
        (material as MeshStandardMaterial).roughness = 0.12;
        (material as MeshStandardMaterial).metalness = 0.2;
      } else if (r === "eyewear" || r === "extra") {
        // (a frame, a bag, a watch: their colour, a little smoother than cloth)
        tint(new Color(hex).multiplyScalar(0.9));
        (material as MeshStandardMaterial).roughness = r === "eyewear" ? 0.35 : 0.6;
      } else if (fabric && worn?.renderer && fabric in LIBRARY) {
        // (in the library's cloth — its weave by the garment's UVs in metres — in their colour)
        material = libMaterial(fabric, worn.renderer, {
          color: new Color(hex).multiplyScalar(0.85),
          scale: WEAVE_BY_FABRIC[fabric] ?? 1,
        });
        (material as MeshStandardMaterial).normalScale.multiplyScalar(WEAVE_DEPTH_BY_FABRIC[fabric] ?? 1);
        material.name = p.name;
        mine.push(material);
      } else {
        // (the CC0 shoes are textured: their file's colour × the avatar's, as the file's own shoes)
        tint(new Color(second ?? hex).multiplyScalar(r === "shoes" ? 1 : 0.85));
      }
      // (its slot's pattern, in its colour and its second — the benches': one on every top)
      const pat =
        r === "top" || r === "bottom" || r === "outer"
          ? worn?.pattern && r === "top"
            ? { kind: worn.pattern, color2: a.bottomColor }
            : worn?.patterns?.[r]
          : undefined;
      const patterned = !!pat && pat.kind !== "plain" && !second;
      const pattern =
        patterned && pat ? patternPiece(pat.kind, new Color(1, 1, 1), new Color(pat.color2).multiplyScalar(1.1)) : null;
      // (plan 74 phase 3: the cloth's folds, by its fabric — before its pattern)
      const fold = fabric && fabric in FOLD_BY_FABRIC && !second ? FOLD_BY_FABRIC[fabric] : 0;
      if (pattern || fold > 0) {
        if (!mine.includes(material)) {
          material = own(material);
          mine.push(material);
        }
        const gname = p.name.replace(/^wear-/, "");
        const piece =
          fold > 0
            ? foldPiece(
                fold,
                pattern,
                r === "top" || r === "outer",
                DETAILS[gname],
                detailLevels(base.wear[gname], base.wearLm),
              )
            : (pattern as Piece);
        givePiece(material, piece);
        if (pattern) (material as MeshStandardMaterial).color.copy(new Color(hex).multiplyScalar(0.85));
      }
    } else if (p.name === "clothes") {
      material = own(p.material);
      givePiece(material, outfitPiece(new Color(a.topColor), new Color(a.bottomColor)));
      mine.push(material);
    }
    return { ...p, material };
  });
  const hipY = (at.thighL.y + at.thighR.y) / 2;
  return {
    base,
    build,
    rest,
    at,
    parts,
    morph: { slim: build === "slim" ? 1 : 0, broad: build === "broad" ? 1 : 0, coat: coatOf(base, names) },
    height: base.height,
    hipY,
    dispose() {
      for (const m of mine) m.dispose();
    },
  };
}

// ── the right ear (plan 73 4.6): where a phone's held and an earbud sits ──────────────────────────

const ears = new WeakMap<LifeBase, Vector3>();

/** The right ear's opening at rest (metres, the person facing +z, its right −x): the head's widest point
 *  on its right a little under and behind the eyes — the ear's rim — a touch in from it. */
export function lifeEar(base: LifeBase): Vector3 {
  let e = ears.get(base);
  if (e) return e;
  const eye = base.at.eyeR;
  const body = base.parts.find((p) => p.name === "body");
  let best: Vector3 | null = null;
  const pos = body?.geometry.getAttribute("position");
  if (pos)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (Math.abs(y - (eye.y - 0.02)) > 0.025 || z > eye.z - 0.04 || z < eye.z - 0.16) continue;
      if (!best || x < best.x) best = new Vector3(x, y, z);
    }
  e = best ? best.add(new Vector3(0.008, 0, 0)) : new Vector3(eye.x - 0.04, eye.y - 0.02, eye.z - 0.09);
  ears.set(base, e);
  return e;
}

// ── first person's arms ─────────────────────────────────────────────────────────────────────────

const ARM = new Set([
  ...(["shoulder", "elbow", "wrist", "fingers", "index", "thumb"] as const).flatMap((j) => [
    ALL_BONES.indexOf(`${j}L` as BoneName),
    ALL_BONES.indexOf(`${j}R` as BoneName),
  ]),
  ...KNUCKLES.map((k) => ALL_BONES.indexOf(k)),
]);
const armCuts = new WeakMap<BufferGeometry, BufferGeometry | null>();

/** A part cut to the triangles that go with the arms (shoulder to fingertips): null if it has none. */
export function lifeArms(p: LifePart): BufferGeometry | null {
  const g = p.geometry;
  if (armCuts.has(g)) return armCuts.get(g) ?? null;
  const si = g.getAttribute("skinIndex") as BufferAttribute;
  const sw = g.getAttribute("skinWeight") as BufferAttribute;
  const armW = (v: number) => {
    let w = 0;
    for (let k = 0; k < 4; k++) if (ARM.has(si.getComponent(v, k))) w += sw.getComponent(v, k);
    return w;
  };
  const index = g.getIndex();
  const n = index ? index.count : g.getAttribute("position").count;
  const keep: number[] = [];
  for (let t = 0; t < n; t += 3) {
    const a = index ? index.getX(t) : t;
    const b = index ? index.getX(t + 1) : t + 1;
    const c = index ? index.getX(t + 2) : t + 2;
    if (armW(a) > 0.5 && armW(b) > 0.5 && armW(c) > 0.5) keep.push(a, b, c);
  }
  let cut: BufferGeometry | null = null;
  if (keep.length) {
    cut = new BufferGeometry();
    for (const [k, attr] of Object.entries(g.attributes)) cut.setAttribute(k, attr);
    cut.morphAttributes = g.morphAttributes;
    cut.morphTargetsRelative = g.morphTargetsRelative;
    cut.setIndex(keep);
    cut.boundingBox = g.boundingBox;
    cut.boundingSphere = g.boundingSphere;
  }
  armCuts.set(g, cut);
  return cut;
}
