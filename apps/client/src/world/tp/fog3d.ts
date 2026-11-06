import { AdditiveBlending, Color, Material, ShaderChunk, Vector3, Vector4 } from "three";

// The morning fog in 3D (docs/plan/64-the-fog.md, F2): three's fog chunks swapped once, for every
// material that takes fog, so nothing is patched one by one. Over three's own (the day's far fog,
// a storm's close one) the morning's:
//   - the haze: density `mfA` a tile at the fog's floor, falling off over `mfH` up from it,
//     integrated along the view ray (the low places white, the HQ's top floors clear);
//   - the wall (a thick morning): by the distance squared, the first few metres clear, at any
//     height: Silent Hill's;
//   - a slow drift in both, with the wind; gold towards a low sun.
// Neither counts the part of the ray inside the room I'm in (`mfBox`): from a room the land past
// its windows is white and the room clear — and a storm's fog stays out of it too.
// Its uniforms are shared by every material: a hook on Material's onBeforeCompile hands them to
// each shader that has the fog in it (the material's own hook first, as before).

/** The fog's uniforms, the same objects in every shader (the view sets them a frame). */
export const mf = {
  mfA: { value: 0 }, // the haze's density a tile at its floor (0: no morning fog: none of it runs)
  mfH: { value: 4.4 }, // how far up it falls off by e (tiles)
  mfY0: { value: 0 }, // its floor: the land's height 0, in the scene
  mfW: { value: 0 }, // the wall, 0 … 1
  mfV: { value: 18 }, // the wall's reach (tiles): 3 × (l / V)² is near all of it
  mfSunK: { value: 0 }, // how much gold towards the sun
  mfT: { value: 0 }, // time (s): the drift
  mfBox: { value: 0 }, // 1: the room I'm in is `mfBoxMin` … `mfBoxMax`
  mfBoxMin: { value: new Vector3() },
  mfBoxMax: { value: new Vector3() },
  mfCol: { value: new Color() },
  mfSunCol: { value: new Color() },
  mfSun: { value: new Vector3(0, 1, 0) }, // towards the sun
  mfWind: { value: [0.004, 0.0015] }, // the drift's (tiles × 0.012 a second)
  mfFlat: { value: 0 }, // how much of the sun the wall's taken (the shadows painted on go with it)
  mfLift: { value: -1000 }, // the haze's floor lifted (tiles up from mfY0): clear under it
  // under the water (docs/plan/66-the-water.md, S8): its level over the camera (the scene's), the
  // murk's density a metre, 1 when the camera's under it, the sun's light on its bed; the murk's colour
  mfUw: { value: new Vector4(-1000, 0.14, 0, 0) },
  mfUwCol: { value: new Color(0.012, 0.05, 0.048) },
};

const VERT_PARS = `
#ifdef USE_FOG
	varying vec3 vFogW;
#endif
`;
// (where it is in the world, from where it is to the camera: the view's rotation's transpose —
// every shader with the fog has mvPosition, not all of them `transformed`)
const VERT = `
#ifdef USE_FOG
	vFogW = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );
#endif
`;
const FRAG_PARS = `
#ifdef USE_FOG
	varying vec3 vFogW;
	uniform float mfA; uniform float mfH; uniform float mfY0; uniform float mfW; uniform float mfV;
	uniform float mfSunK; uniform float mfT; uniform float mfBox;
	uniform vec3 mfBoxMin; uniform vec3 mfBoxMax; uniform vec3 mfCol; uniform vec3 mfSunCol; uniform vec3 mfSun;
	uniform vec2 mfWind; uniform float mfFlat; uniform float mfLift;
	uniform vec4 mfUw; uniform vec3 mfUwCol;
	// the haze at a height (a tile's worth; never past e^20 of it: nothing's drawn that far down, and
	// an overflow's a NaN the bloom spreads over the frame)
	float mfDens( float y ) { return mfA * exp( min( - ( y - mfY0 ) / mfH, 20.0 ) ); }
	float mfHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
	float mfNoise( vec2 p ) {
		vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
		return mix( mix( mfHash( i ), mfHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( mfHash( i + vec2( 0.0, 1.0 ) ), mfHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
	}
	// the light rippling on a water's bed (plan 66 S8): two noises' crossings, thin and bright
	float mfCaustic( vec2 p, float t ) {
		float a = mfNoise( p * 1.3 + vec2( t * 0.25, - t * 0.18 ) );
		float b = mfNoise( p * 1.7 + vec2( - t * 0.2, t * 0.22 ) + 7.0 );
		return pow( clamp( 1.0 - abs( a - b ) * 3.2, 0.0, 1.0 ), 6.0 );
	}
#endif
`;
// MF_ADD (put on by the hook): a light added in (it fogs to nothing, not to a grey patch — and
// over three times the reach); MF_WHITE: a decal multiplied in (it fogs to white: gone, not grey);
// MF_SUN_SHADOW: one that's the
// sun's shadow (gone with the sun in the wall); MF_MORNING_ONLY: three's own fog left out (the far
// ridges: past the day's fog, as they always were)
const FRAG = `
#ifdef USE_FOG
	vec3 mfRo = cameraPosition;
	vec3 mfRv = vFogW - mfRo;
	float mfL = max( length( mfRv ), 1e-4 );
	vec3 mfRd = mfRv / mfL;
	// (the stretch of it inside the room I'm in)
	float mfOut = mfL;
	if ( mfBox > 0.5 ) {
		vec3 mfInv = 1.0 / ( mfRd + mix( vec3( -1e-5 ), vec3( 1e-5 ), step( 0.0, mfRd ) ) );
		vec3 mfT1 = ( mfBoxMin - mfRo ) * mfInv;
		vec3 mfT2 = ( mfBoxMax - mfRo ) * mfInv;
		vec3 mfN = min( mfT1, mfT2 );
		vec3 mfF = max( mfT1, mfT2 );
		float mfIn = min( min( mfF.x, mfF.y ), mfF.z ) - max( max( max( mfN.x, mfN.y ), mfN.z ), 0.0 );
		mfOut = mfL - clamp( mfIn, 0.0, mfL );
	}
	#if defined( MF_WHITE )
		vec3 mfTo = vec3( 1.0 );
	#elif defined( MF_ADD )
		vec3 mfTo = vec3( 0.0 );
	#else
		vec3 mfTo = fogColor;
	#endif
	#ifndef MF_MORNING_ONLY
		#ifdef FOG_EXP2
			float fogFactor = 1.0 - exp( - fogDensity * fogDensity * mfOut * mfOut );
		#else
			float fogFactor = smoothstep( fogNear, fogFar, vFogDepth * mfOut / mfL );
		#endif
		gl_FragColor.rgb = mix( gl_FragColor.rgb, mfTo, fogFactor );
	#endif
	if ( mfA > 0.0 ) {
		// the haze along the ray, by the heights at its ends (never past what's there — no overflow
		// looking down a long way): ∫ dens dt = h × (dens(y0) − dens(y1)) / (dy / L), every height
		// under the lifted floor taken as it (so that stretch adds nothing: clear under it)
		float mfYb = mfY0 + mfLift;
		float mfYc = max( mfRo.y, mfYb );
		float mfYf = max( vFogW.y, mfYb );
		float mfDy = vFogW.y - mfRo.y;
		float mfHz = abs( mfDy ) > 1e-2 ? mfH * mfL * ( mfDens( mfYc ) - mfDens( mfYf ) ) / mfDy : ( mfRo.y >= mfYb ? mfDens( mfRo.y ) * mfL : 0.0 );
		vec2 mfQ = vFogW.xz * 0.012 + mfWind * mfT;
		float mfD = 0.65 * mfNoise( mfQ ) + 0.35 * mfNoise( mfQ * 2.7 + 3.1 );
		float mfOd = max( mfHz, 0.0 ) * ( mfOut / mfL ) * ( 0.6 + 0.8 * mfD );
		float mfLw = max( 0.0, mfOut - 3.0 ) / mfV;
		float mfOw = mfW * 3.0 * mfLw * mfLw * ( 0.8 + 0.4 * mfD );
		#ifdef MF_ADD
			// (a light's glow carries three times as far: a glow at 40 m in the wall, then a lamp)
			mfOd = mfOd / 3.0 + mfOw / 9.0;
		#else
			mfOd += mfOw;
		#endif
		float mfS = pow( max( dot( mfRd, mfSun ), 0.0 ), 5.0 ) * mfSunK;
		#if defined( MF_WHITE )
			vec3 mfC = vec3( 1.0 );
		#elif defined( MF_ADD )
			vec3 mfC = vec3( 0.0 );
		#else
			vec3 mfC = mix( mfCol, mfSunCol, mfS );
		#endif
		gl_FragColor.rgb = mix( gl_FragColor.rgb, mfC, 1.0 - exp( - mfOd ) );
	}
	// under the water (plan 66 S8): the murk by how much of the ray is under its level — lighter
	// looking up, darker down — and the light rippling on what's under it; the surface's own
	// underside murks less (the light comes through it)
	if ( mfUw.z > 0.5 && mfRo.y < mfUw.x ) {
		float mfUd = vFogW.y < mfUw.x ? mfL : mfL * clamp( ( mfUw.x - mfRo.y ) / max( mfRv.y, 1e-3 ), 0.0, 1.0 );
		float mfUk = mfUw.y;
		#ifdef WX_UNDER
			mfUk *= 0.45;
		#else
			if ( vFogW.y < mfUw.x - 0.05 )
				gl_FragColor.rgb += mfUw.w * mfCaustic( vFogW.xz, mfT ) * ( 0.45 - 0.25 * clamp( ( mfUw.x - vFogW.y ) / 3.0, 0.0, 1.0 ) ) * vec3( 0.8, 1.0, 0.9 );
		#endif
		float mfUp = clamp( mfRd.y * 0.5 + 0.5, 0.0, 1.0 );
		#if defined( MF_ADD )
			vec3 mfUm = vec3( 0.0 );
		#else
			vec3 mfUm = mfUwCol * mix( 0.35, 2.2, mfUp * mfUp );
		#endif
		gl_FragColor.rgb = mix( gl_FragColor.rgb * vec3( 0.55, 0.85, 0.8 ), mfUm, 1.0 - exp( - mfUk * mfUd ) );
	}
	// (a sun's shadow painted on, multiplied in: gone with the sun in the wall)
	#ifdef MF_SUN_SHADOW
		gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( 1.0 ), mfFlat );
	#endif
#endif
`;

const OWN = Symbol("own onBeforeCompile");
const OWN_KEY = Symbol("own customProgramCacheKey");
type Hooked = Material & {
  [OWN]?: Material["onBeforeCompile"];
  [OWN_KEY]?: Material["customProgramCacheKey"];
};

let installed = false;
/** Once, before the 3D view makes a material: the chunks swapped, the hook on. */
export function installFog() {
  if (installed) return;
  installed = true;
  ShaderChunk.fog_pars_vertex += VERT_PARS;
  ShaderChunk.fog_vertex += VERT;
  ShaderChunk.fog_pars_fragment += FRAG_PARS;
  ShaderChunk.fog_fragment = FRAG;
  // every material's own hook kept (set it as before), and the fog's uniforms handed over after it
  // (a shader without the fog doesn't get them); its program's key is still its own hook's. Each
  // own hook gets its own wrapper: code that keeps the hook it found and calls it from a new one
  // (`prev`) calls the old wrapper, never itself
  const proto = Material.prototype as Hooked;
  type Hook = Material["onBeforeCompile"];
  const inject = (m: Material, shader: Parameters<Hook>[0]) => {
    if (!shader.fragmentShader.includes("fog_fragment")) return;
    Object.assign(shader.uniforms, mf);
    if (m?.blending === AdditiveBlending) shader.fragmentShader = `#define MF_ADD\n${shader.fragmentShader}`;
  };
  const none: Hook = function (this: Material, shader) {
    inject(this, shader);
  };
  const wrappers = new WeakMap<Hook, Hook>();
  const wrap = (own: Hook): Hook => {
    let w = wrappers.get(own);
    if (!w) {
      w = function (this: Material, shader, renderer) {
        own.call(this, shader, renderer);
        inject(this, shader);
      };
      wrappers.set(own, w);
    }
    return w;
  };
  Object.defineProperty(proto, "onBeforeCompile", {
    configurable: true,
    get(this: Hooked) {
      const own = this[OWN];
      return own ? wrap(own) : none;
    },
    set(this: Hooked, f: Hook) {
      this[OWN] = f;
    },
  });
  // its program's key: its own (or, none set, its own hook's source, as three's own is), and an
  // added light's marked whoever set its key — its fog goes to nothing, its program isn't another's
  // (the light map gives every material it lights one key). Kept as the hook is: each own key its
  // own wrapper, so one that calls the key it found never calls itself
  type Key = Material["customProgramCacheKey"];
  const keys = new WeakMap<Key, Key>();
  const add = (m: Material, k: string) => (m.blending === AdditiveBlending ? `${k}|add` : k);
  const byHook: Key = function (this: Hooked) {
    return add(this, this[OWN]?.toString() ?? "");
  };
  Object.defineProperty(proto, "customProgramCacheKey", {
    configurable: true,
    get(this: Hooked) {
      const own = this[OWN_KEY];
      if (!own) return byHook;
      let w = keys.get(own);
      if (!w) {
        w = function (this: Material) {
          return add(this, own.call(this));
        };
        keys.set(own, w);
      }
      return w;
    },
    set(this: Hooked, f: Key) {
      this[OWN_KEY] = f;
    },
  });
}

// (on import: view.ts imports this first, before it or anything it brings in makes a material)
installFog();

// ── what the view sets, by the hour and the fog (pure: fog3d.test.ts) ──

const lerp3 = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * Math.min(1, Math.max(0, t)));

/** The fog's colour: as light as the land's (black in the dark), blue grey at first light, warm by
 *  7:30, white by the time it goes; the wall's greyed (Silent Hill's, the hour's colour mostly
 *  gone). Linear, into `out`. */
export function fogColour(out: Color, land: Color, hour: number, wall: number): Color {
  const tint =
    hour < 6.5
      ? [0.82, 0.87, 0.97]
      : hour < 8
        ? lerp3([0.82, 0.87, 0.97], [1, 0.95, 0.88], (hour - 6.5) / 1.5)
        : lerp3([1, 0.95, 0.88], [0.96, 0.97, 1], (hour - 8) / 1.5);
  const lift = 1.05;
  out.setRGB(
    Math.min(1, land.r * lift) * tint[0],
    Math.min(1, land.g * lift) * tint[1],
    Math.min(1, land.b * lift) * tint[2],
  );
  if (wall > 0) {
    const g = (out.r * 0.3 + out.g * 0.55 + out.b * 0.15) * 0.95;
    const k = 0.75 * Math.min(1, wall);
    out.setRGB(out.r + (g - out.r) * k, out.g + (g - out.g) * k, out.b + (g - out.b) * k);
  }
  return out;
}

/** The haze's density a tile at its floor: a haze ~150 m at eye height on open land at 1. */
export const hazeDensity = (haze: number) => 0.028 * haze;

/** How far the camera need see in the wall (tiles): past where it's all fog (3 × w × ((l − 3) /
 *  V)² × 0.8 ≥ 8), or `usual` when that's further. */
export function farFor(wall: number, usual: number, reach = 18): number {
  if (wall < 0.02) return usual;
  return Math.min(usual, 3 + reach * Math.sqrt(8 / (3 * 0.8 * wall)) + 10);
}

/** The sun (its light's intensity, everywhere) and the open sky's fill (light3d.ts litBalance) in
 *  the wall: flat light, the sun given to the fill — no hard shadows in thick fog (phase 0), back
 *  as it lifts. */
export function flatLight(wall: number): { sun: number; fill: number } {
  const w = Math.min(1, Math.max(0, wall));
  return { sun: (1 - w) * (1 - w), fill: 1 + 0.6 * w };
}

/** The room I'm in, round cell (x, y) of a floor: its indoor cells' bounds, or null on the open
 *  sky (`open`: a cell that's out — the lot's asphalt and concrete — or none at all). `cell`: what a
 *  cell is (a floor char; the structure's — plan 72 phase 11), within the floor's extent [x0, x1). */
export function roomBounds(
  cell: (x: number, y: number) => string | undefined,
  ext: { x0: number; y0: number; x1: number; y1: number },
  x: number,
  y: number,
  open: (ch: string | undefined) => boolean,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const inside = (tx: number, ty: number) => tx >= ext.x0 && ty >= ext.y0 && tx < ext.x1 && ty < ext.y1;
  if (!inside(x, y) || open(cell(x, y))) return null;
  let x0 = x;
  let x1 = x;
  let y0 = y;
  let y1 = y;
  const w = ext.x1 - ext.x0;
  const seen = new Uint8Array(w * (ext.y1 - ext.y0));
  const idx = (tx: number, ty: number) => tx - ext.x0 + (ty - ext.y0) * w;
  const todo: [number, number][] = [[x, y]];
  seen[idx(x, y)] = 1;
  while (todo.length) {
    const [tx, ty] = todo.pop() as [number, number];
    if (tx < x0) x0 = tx;
    if (tx > x1) x1 = tx;
    if (ty < y0) y0 = ty;
    if (ty > y1) y1 = ty;
    for (const [nx, ny] of [
      [tx + 1, ty],
      [tx - 1, ty],
      [tx, ty + 1],
      [tx, ty - 1],
    ]) {
      if (!inside(nx, ny)) continue;
      const j = idx(nx, ny);
      if (seen[j] || open(cell(nx, ny))) continue;
      seen[j] = 1;
      todo.push([nx, ny]);
    }
  }
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** How much the ink's lines go at a distance `d` (tiles) in the fog, 0 … 1 kept: the fog's own
 *  amount there at eye height (the haze's, the wall's), so a line goes with what it outlines. */
export function inkLeft(d: number, haze: number, wall: number, reach = 18): number {
  const lw = Math.max(0, d - 3) / reach;
  return Math.exp(-(hazeDensity(haze) * 0.71 * d + wall * 3 * lw * lw));
}

/** How high the haze's floor has risen when it's all but gone (tiles): the HQ's roof last. */
export const LIFT_TOP = 12;
