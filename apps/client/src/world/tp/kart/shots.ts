import { groundAt } from "@yutopia/shared/grounds";
import { kartTrack, trackAt } from "@yutopia/shared/kart";

// Where things are on the Kart Park's lap, for the stills' cameras, people and what flies
// (docs/plan/46-the-karts.md, phase 0). No three.js here: the stills' list is built before it loads.

type V3 = [number, number, number];
/** A side of the track at p: + its left. */
const side = (p: { x: number; z: number; a: number }, off: number): [number, number] => [
  p.x + Math.sin(p.a) * off,
  p.z - Math.cos(p.a) * off,
];

/** A camera behind a kart on the lap: `back` metres behind it along its heading, `up` over, looking
 *  `ahead` past it (a chase camera's). */
export function chaseOf(s: number, off: number, back: number, up: number, ahead: number): { cam: V3; look: V3 } {
  const t = kartTrack();
  const p = trackAt(t, s);
  const [x, z] = side(p, off);
  const y = groundAt(x, z) + p.y;
  const c = Math.cos(p.a);
  const n = Math.sin(p.a);
  return {
    cam: [x - c * back, y + up, z - n * back],
    look: [x + c * ahead, y + 0.9, z + n * ahead],
  };
}
/** Where `s` along the lap, `off` its middle, is (for a shot's people and fx). */
export function onLap(s: number, off = 0, up = 0): V3 {
  const t = kartTrack();
  const p = trackAt(t, s);
  const [x, z] = side(p, off);
  return [x, groundAt(x, z) + p.y + up, z];
}
export const lapHeading = (s: number) => trackAt(kartTrack(), s).a;
/** A point in the lap's own frame at `s`: `fwd` along it, `left` across (+ its left), `up` over. */
export function nearLap(s: number, fwd: number, left: number, up = 0): V3 {
  const p = trackAt(kartTrack(), s);
  const x = p.x + Math.cos(p.a) * fwd + Math.sin(p.a) * left;
  const z = p.z + Math.sin(p.a) * fwd - Math.cos(p.a) * left;
  return [x, groundAt(x, z) + p.y + up, z];
}
/** Which way the lap turns at `s` (+1 its heading growing, −1 shrinking, 0 straight). */
export const turnOf = (s: number) => Math.sign(trackAt(kartTrack(), s).k);
export {
  BENCH_TOP,
  KART_BOWL,
  KART_CARPARK,
  KART_DESK,
  KART_GATE,
  KART_PADDOCK,
  KART_PARK,
  KART_RACK,
  KART_SIGN,
  KART_STANDS,
  KART_TURN,
} from "@yutopia/shared/kart";
