import type { TrickId } from "@yutopia/shared/bike";
import { Vector3 } from "three";
import type { Act, CarStep } from "../chars/anim/acts";
import type { BikeModel } from "../tp/bike/model";

// A bicycle and its rider posed for a frame (docs/plan/101-the-bicycles.md, phase 3, F10a): the bike's cranks round,
// its bars turned, its levers pulled, a trick's frame or bars spun; its rider on it — the hips on the saddle (up off
// it stood on the pedals, down crouched for a hop), each foot on its pedal going round with the crank (the knee over
// it, in the bike's plane), the trunk bent over the bars as its body is (upright on the town bike, low on the racer),
// the head into the turn, the hands on the grips; a foot down at a stop; the tricks' bodies (the superman's legs out
// behind, the no-hander's arms out, the tailwhip's feet off and wide, the barspin's hands let go and caught again).
//
// Her space (carStep's): x her left, y up, z ahead, from her root — on the ground under the saddle, facing the bike's
// nose (the model's −x). The bike's points are the model's (nose −x, +z left).

export interface RiderNow {
  /** the cranks' turn (rad), how hard she pedals (0..1), stood (0..1), crouched for a hop (0..1) */
  crank: number;
  effort: number;
  stand: number;
  charge: number;
  /** a foot down at a stop (−1 the left, 1 the right, 0 none) */
  foot: number;
  trick: TrickId | null;
  trickT: number;
  /** the front wheel's turn (rad, + right), the brake (0..1) */
  steer: number;
  brake: number;
  /** her body's bend over the bars, 0 upright … 1 low (its kind's) */
  bend: number;
  air: boolean;
  /** (F9a) wheeling it on foot, walking beside it; how far (m: her steps' clock) */
  walk?: boolean;
  walked?: number;
  /** how fast it goes (m/s) */
  speed?: number;
}

/** The hip joint over the saddle's top, sat (m). */
const SIT = 0.085;
/** Stood on the pedals: the hips this far up off it and forward (m). */
const STAND_UP = 0.16;
const STAND_AHEAD = 0.12;
const GRIP = { fingers: 1.0, index: 0.95, thumb: 0.65 };
const OPEN = { fingers: 0.15, index: 0.1, thumb: 0.1 };
const ELBOW: [number, number, number] = [-0.85, -0.7, -0.35];

const pa = new Vector3();
const pb = new Vector3();
const pc = new Vector3();
/** Her shoulders over her root, stood (m: over the standing hips' height). */
const SHOULDERS = 0.5;
/** The superman stretched out: how far the body's turned forward (rad). */
const SUPER_PITCH = 1.22;
const ease = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/** The bike's own parts posed (its cranks, bars, levers, stand; a trick's spin). */
export function poseBike(m: BikeModel, r: RiderNow) {
  m.tick();
  m.setCrank(r.crank);
  let spin = 0;
  let whip = 0;
  if (r.trick === "barspin") spin = Math.PI * 2 * ease(r.trickT);
  if (r.trick === "tailwhipL" || r.trick === "tailwhipR")
    whip = (r.trick === "tailwhipL" ? 1 : -1) * Math.PI * 2 * ease(r.trickT);
  m.setBars(r.steer, spin);
  m.setWhip(whip);
  m.setLevers(r.brake, r.brake);
  m.setStand(0);
}

/** Where her root goes on the bike (the model's frame): under the saddle, forward as she stands. */
export function riderRoot(m: BikeModel, r: RiderNow, out: Vector3, stand = 0.863): Vector3 {
  const s = m.bike.saddle;
  // (wheeling it: stood at its left, by the saddle)
  if (r.walk) return out.set(s.x - 0.22, 0, s.z + 0.56);
  const up = Math.max(r.stand, r.trick === "superman" || r.trick === "tailwhipL" || r.trick === "tailwhipR" ? 1 : 0);
  out.set(s.x - STAND_AHEAD * up, 0, s.z);
  // the superman: the whole body turned about the shoulders — held up by the hands on the bars —, out flat behind
  const S = r.trick === "superman" ? trickEnv(r.trickT) : 0;
  if (S > 0) {
    const P = superPivot(m, pb);
    const sh = stand + SHOULDERS;
    const th = SUPER_PITCH * S;
    // (her root — her feet's — swung round the pivot: back along the bike and up)
    pa.set(P.x + sh * Math.sin(th), P.y - sh * Math.cos(th), s.z);
    out.lerp(pa, S);
  }
  return out;
}
/** Her whole body's pitch on the bike (rad, + forward — her head toward the bike's nose): the superman's. */
export function riderPitch(r: RiderNow): number {
  return r.trick === "superman" ? SUPER_PITCH * trickEnv(r.trickT) : 0;
}
/** The superman's pivot (the model's frame): her shoulders, an arm's length behind the grips, a little over them. */
function superPivot(m: BikeModel, out: Vector3): Vector3 {
  const [gl, gr] = m.bike.grips;
  return out
    .copy(gl)
    .add(gr)
    .multiplyScalar(0.5)
    .add(pc.set(0.5, 0.12, 0));
}
/** How far into a trick its pose is: in over its first 30 %, held, out over its last 30 % (back on the pedals to land). */
export function trickEnv(t: number): number {
  return ease(t / 0.3) * (1 - ease((t - 0.7) / 0.3));
}

/** Her pose on it: carStep's (the legs solved in three dimensions to the pedals), its lift; the hands after
 *  (`riderHands`). `stand` her standing hip's height (carFit's). */
export function riderAct(
  A: { carStep(f: CarStep, t: number): Act },
  m: BikeModel,
  r: RiderNow,
  root: Vector3,
  stand: number,
  t: number,
): { act: Act; hipY: number } {
  const b = m.bike;
  // a model point in her space: x her left (the model's +z), up, ahead (the model's −x)
  const her = (p: Vector3): [number, number, number] => [p.z - root.z, p.y, root.x - p.x];
  if (r.walk) {
    // (walking beside it: her steps by how far she's gone, a stride of 0.62 m; stood still, her feet together)
    const ph = ((r.walked ?? 0) / 0.62) * Math.PI;
    const going = Math.min(1, (r.speed ?? 0) / 0.5);
    const sw = (k: number) => Math.sin(ph + k * Math.PI);
    const feet: [[number, number, number], [number, number, number]] = [
      [0.1, 0.06 * Math.max(0, sw(0)) * going, 0.22 * Math.cos(ph) * going],
      [-0.1, 0.06 * Math.max(0, sw(1)) * going, -0.22 * Math.cos(ph) * going],
    ];
    const hipY = stand - 0.03 - 0.015 * Math.abs(Math.cos(ph)) * going;
    const act = A.carStep(
      {
        hipY,
        feet,
        toe: [0.05, 0.05],
        duck: 0.18,
        side: -0.06,
        knee: [
          [0.05, 0.2, 1],
          [-0.05, 0.2, 1],
        ],
        heading: [0, 0],
        look: -r.steer * 0.6,
        hands: { L: GRIP, R: GRIP },
      },
      t,
    );
    act.lift = [0, hipY - stand, 0];
    return { act, hipY };
  }
  const trick = r.trick;
  const k = trick ? trickEnv(r.trickT) : 0;
  const up = trick === "superman" || trick === "tailwhipL" || trick === "tailwhipR" ? 1 : r.stand;
  // (in the air with no trick: tucked a little, the knees up to the bike)
  let hipY = b.saddle.y + SIT + STAND_UP * up - 0.14 * r.charge - (r.air && !trick ? 0.06 : 0);
  // each foot on its pedal (its sole on the spindle's top), the toes a little down — more as it goes down the stroke
  const feet: [[number, number, number], [number, number, number]] = [
    [0, 0, 0],
    [0, 0, 0],
  ];
  const toe: [number, number] = [0.2, 0.2];
  for (const i of [0, 1] as const) {
    const p = her(m.pedalAt(i, pa));
    feet[i] = [p[0] + (i === 0 ? 0.015 : -0.015), p[1] + 0.012, p[2] - 0.04];
    // (the crank's angle for this side: the left half a turn round from the right)
    const a = r.crank + (i === 0 ? Math.PI : 0);
    toe[i] = 0.18 + 0.14 * Math.sin(a + 0.6);
  }
  // a foot down at a stop: on the ground beside the bike, the other on its pedal; sat a little to that side
  let side = 0;
  if (r.foot && !trick) {
    const i = r.foot < 0 ? 0 : 1;
    const out = i === 0 ? 1 : -1;
    feet[i] = [out * 0.34, 0, 0.12];
    toe[i] = 0.05;
    side = -out * 0.06;
  }
  const pole = (out: number): [number, number, number] => [out * 0.12, 0.3, 1];
  const knee: [[number, number, number], [number, number, number]] = [pole(1), pole(-1)];
  // (bent forward from the hips over the bars: a little on the town bike, low on the racer)
  let duck = Math.min(1, 0.38 + 0.55 * r.bend + 0.2 * up + 0.3 * r.charge);
  const mix = (f: [number, number, number], to: [number, number, number]) => {
    for (const j of [0, 1, 2]) f[j] += (to[j] - f[j]) * k;
  };
  const mixP = (p: [number, number, number], to: [number, number, number]) => {
    for (const j of [0, 1, 2]) p[j] += (to[j] - p[j]) * k;
  };
  // the tricks' bodies, each eased in from the riding one (k) and back out to land
  if (trick === "superman") {
    // (stretched out straight: the legs together and pointed, under the hips — the whole body's turned out flat
    // behind the bars by riderRoot and riderPitch, the arms straight to the grips)
    for (const i of [0, 1] as const) mix(feet[i], [i === 0 ? 0.06 : -0.06, 0, 0.03]);
    hipY += (stand - 0.005 - hipY) * k;
    toe[0] += (0.95 - toe[0]) * k;
    toe[1] += (0.95 - toe[1]) * k;
    duck += (-0.12 - duck) * k;
  } else if (trick === "nohander" || trick === "barspin") {
    // (the feet stay on the pedals, the knees squeezed in on the saddle's nose — the bike held between them —, up off
    // it a little, the trunk upright; the no-hander's arms out wide)
    hipY += (b.saddle.y + SIT + 0.1 - hipY) * k;
    for (const i of [0, 1] as const) {
      const out = i === 0 ? 1 : -1;
      mixP(knee[i], [-out * 0.6, 0.2, 1]);
    }
    duck += ((trick === "nohander" ? 0.05 : 0.3) - duck) * k;
  } else if (trick === "tailwhipL" || trick === "tailwhipR") {
    // (crouched over the bars, the feet pulled up and out wide — the knees out — while the frame swings round under
    // them; caught back on the pedals to land)
    const hy = b.saddle.y + 0.28;
    hipY += (hy - hipY) * k;
    for (const i of [0, 1] as const) {
      const out = i === 0 ? 1 : -1;
      mix(feet[i], [out * 0.36, hy - 0.4, 0.1]);
      mixP(knee[i], [out * 1, 0.45, 0.55]);
      toe[i] += (0.35 - toe[i]) * k;
    }
    duck += (0.62 - duck) * k;
  }
  const open = trick === "nohander" || (trick === "barspin" && r.trickT > 0.25 && r.trickT < 0.7);
  const step: CarStep = {
    hipY,
    feet,
    toe,
    duck,
    side,
    knee,
    heading: [0, 0],
    // (the no-hander's head up, looking ahead; else into the turn)
    look: -r.steer * 1.4,
    hands: { L: open ? OPEN : GRIP, R: open ? OPEN : GRIP },
  };
  const act = A.carStep(step, t);
  act.lift = [0, hipY - stand, 0];
  return { act, hipY };
}

/** Her hands on the grips (the bars as they're turned), let go for the no-hander (out to her sides) and the barspin
 *  (up off them as they spin, caught again). World targets for her model's reachTo. */
export function riderHands(
  person: { reachTo(S: "L" | "R", at: Vector3, w?: number, pole?: [number, number, number], close?: boolean): void },
  m: BikeModel,
  r: RiderNow,
  w: number,
) {
  const trick = r.trick;
  const k = trick ? trickEnv(r.trickT) : 0;
  for (const [i, S] of [
    [0, "L"],
    [1, "R"],
  ] as const) {
    // (wheeling it: the left hand on its grip, the right on the saddle's nose)
    if (r.walk) {
      const at = S === "L" ? m.gripAt(0, pa) : pa.copy(m.bike.saddle).add(pb.set(-0.08, 0.04, 0));
      m.root.localToWorld(at);
      person.reachTo(S, at, w, ELBOW);
      continue;
    }
    const at = m.gripAt(i, pa);
    const out = i === 0 ? 1 : -1;
    if (trick === "nohander") {
      // (let go and thrown out wide, a little up: the arms open, from the shoulders)
      at.add(pb.set(0.42 * k, 0.5 * k, out * 0.4 * k));
      m.root.localToWorld(at);
      person.reachTo(S, at, w, [-0.2, -1, -0.6]);
      continue;
    }
    if (trick === "barspin") {
      // (let go as the bars are thrown — up and a little back, open — and caught again as they come round)
      const u = Math.sin(Math.PI * Math.max(0, Math.min(1, (r.trickT - 0.2) / 0.55)));
      at.add(pb.set(0.1 * u, 0.2 * u, out * 0.06 * u));
    }
    m.root.localToWorld(at);
    person.reachTo(S, at, w, ELBOW);
  }
}
