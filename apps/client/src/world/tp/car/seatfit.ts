import type { Bone, Vector3 } from "three";
import type { CarFit } from "../../chars/anim/acts";
import { legOf } from "../seats3d";

// (plan 62, docs/plan/62-the-touch.md phase 5) Someone sat in a vehicle, fitted to it: the hips onto
// its seat, the back against the seat's back, each foot where it goes — the driver's right on the
// throttle and the left on the floor by the clutch, a passenger's both on the footwell's floor, a
// kart's on its pedals, out flat on a pickup's bed —, in their own space for `car3`.

interface Sat {
  bone(j: "kneeL" | "ankleL"): Bone | null;
  sitDrop(seatY: number): number;
}
/** the vehicle: its pedals (clutch, brake, throttle — a kart's brake, throttle) and footwell floor */
interface Cabin {
  pedals?: Vector3[];
  floor?: number;
}

/** How a person's seated in a vehicle, `s` their scale in it. `face`: the way the vehicle's nose is
 *  along x (a car's −x, a kart's +x). The seat's hip point is the root's place. */
export function carFit(
  m: Sat,
  seat: { hip: Vector3; front: boolean },
  driver: boolean,
  cab: Cabin,
  s: number,
  face: 1 | -1,
  kart = false,
): CarFit {
  const hip = seat.hip;
  const leg = legOf((j) => m.bone(j));
  const drop = m.sitDrop((hip.y + 0.02) / s);
  // (a point of the vehicle in their own space: out to the left, up, ahead)
  const own = (p: Vector3) => ({
    left: (-face * (p.z - hip.z)) / s,
    up: p.y / s,
    ahead: (face * (p.x - hip.x)) / s,
  });
  const bed = !kart && cab.floor !== undefined && hip.y - cab.floor > 0.5;
  const floor = cab.floor !== undefined && !bed ? cab.floor / s : (hip.y - (bed ? 0.02 : 0.4)) / s;
  const stand: [number, number, number] = [0.13, bed ? 0.7 : seat.front ? 0.62 : 0.45, floor];
  let feet: CarFit["feet"] = [stand, stand];
  const pedals = cab.pedals;
  if (driver && pedals?.length) {
    // (the ankle a foot's ball behind the pedal's face, a little under its middle)
    const onPedal = (p: Vector3, side: 1 | -1): [number, number, number] => {
      const q = own(p);
      return [side * q.left, q.ahead - 0.12, q.up - 0.04];
    };
    const throttle = onPedal(pedals[pedals.length - 1], -1);
    feet = kart ? [onPedal(pedals[0], 1), throttle] : [[0.17, throttle[1] - 0.1, floor], throttle];
  }
  return {
    drop,
    stand: leg.hipY,
    recline: kart ? 0.45 : bed ? 0.15 : seat.front ? 0.35 : 0.3,
    feet,
    lap: !driver,
  };
}
