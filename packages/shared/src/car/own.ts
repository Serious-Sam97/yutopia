import type { WorldObjectDef } from "../catalog.ts";
import { SP_OFFSET_H } from "../clock.ts";
import { bayId, type LotLayout, lotLayout } from "../lot.ts";
import { boardOfOwner } from "../spot.ts";
import { bayFor, parkedPose } from "./park.ts";
import type { CarKind } from "./specs.ts";

// Your own vehicle, from the dealer (docs/plan/43-the-spot.md): what MOTORS sells (every drivable
// one) and a plate's rules — up to 8 of A–Z, 0–9, "·" and "-", accents dropped; none given, your
// first name's letters.

export const BUYABLE: CarKind[] = [
  "sedan",
  "estate",
  "hatch",
  "offroad",
  "pickup",
  "van",
  "snowmobile",
  "snowcat",
  "tractor",
  "ploughtruck",
  "toboggan",
];
export const PLATE_MAX = 8;

/** What a plate can carry of `t` (as it's typed: no more than 8). */
export const cleanPlate = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\./g, "·")
    .replace(/[^A-Z0-9·-]/g, "")
    .slice(0, PLATE_MAX);

/** A plate as it can be (`raw` as typed); `name`: whose, for one when there's nothing to keep. */
export function plateOf(raw: string, name: string): string {
  return cleanPlate(raw) || cleanPlate(name.split(" ")[0] ?? "") || "YTP·1986";
}

/** The world's day (São Paulo's, as the clock and the nests): lent keys come back when it ends. */
export const keysDay = (ms: number) => Math.floor((ms + SP_OFFSET_H * 3_600_000) / 86_400_000);

/** Who may take a car's wheel: anyone, a pool car; someone's own, its owner, and whoever holds its
 *  keys today (`lentTo`, lent on `lentDay`). */
export function mayDrive(props: Record<string, unknown> | undefined, uid: number, now: number): boolean {
  const owner = Number(props?.ownerId) || 0;
  if (!owner || owner === uid) return true;
  return Number(props?.lentTo) === uid && Number(props?.lentDay) === keysDay(now);
}

let lot: LotLayout | null = null;
/** Where a car may be repainted (docs/plan/92-the-cars.md F13b, "Repaint"): parked at home — in its owner's
 *  own bay of the lot, or on MOTORS' forecourt (`yard`: grounds' MOTORS.yard, passed in so this stays light). */
export function carAtHome(
  car: WorldObjectDef,
  objects: Iterable<WorldObjectDef>,
  yard: { x0: number; x1: number; z0: number; z1: number },
): boolean {
  const pr = car.props ?? {};
  if (Number(pr.level ?? 0) !== 0 || pr.driven) return false;
  const q = parkedPose(car);
  if (q.x >= yard.x0 - 14 && q.x <= yard.x1 + 2 && q.y >= yard.z0 - 4 && q.y <= yard.z1 + 2) return true;
  lot ??= lotLayout();
  const bay = bayFor(lot.bays, q.x, q.y, q.a);
  if (!bay) return false;
  const board = boardOfOwner(objects, Number(pr.ownerId));
  return !!board && board.props?.bay === bayId(lot.bays[bay.i]);
}
