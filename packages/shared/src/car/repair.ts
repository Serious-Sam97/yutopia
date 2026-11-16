// Mending a car (docs/plan/93-the-car-in-the-world.md S7): its damage stays on it (`car:wear`, the shots) until
// someone mends it, stood at it, parked, a part at a time:
//   - under the bonnet (stood at its nose, the bonnet up): the engine (the radiator patched — dead or steaming, it
//     runs again), the lamps, the panels (the worst side's dents knocked out, its holes filled; a hanging bumper
//     and the mirrors put back), the glass (new: the garage's only);
//   - by a wheel (knelt): a flat changed for the spare in its boot (one a car; the garage fits a new one).
// At the gas station's bay (the car at a pump) the garage has everything; anywhere else it's a wrench from the
// pack, and the glass waits for the garage. There's no money in the world: the garage's is free, but it takes
// the time all the same. Pure: the server mends (features/cars.ts car:mend), the client shows what's next.
import { type Damage, FLATS, PART, steamOf } from "./damage.ts";

export type Mend = "engine" | "lamps" | "panels" | "glass" | "tyre";

/** How long each takes (ms). */
export const MEND_MS: Record<Mend, number> = {
  engine: 10_000,
  lamps: 4_000,
  panels: 6_000,
  glass: 8_000,
  tyre: 20_000,
};
/** How near its nose (its middle, a step ahead) or a wheel's spot one stands to mend it (m). */
export const MEND_REACH = 1.3;
/** A car's spare: one in its boot (`props.spare` 0 once it's been used); the garage's fits a new one. */
export const spareOf = (props: Record<string, unknown> | null | undefined): number => (props?.spare === 0 ? 0 : 1);

const LAMPS = PART.headL | PART.headR | PART.tailL | PART.tailR;
const GLASS = PART.screen | PART.screenBad | PART.sideL | PART.sideR;
const BODY = PART.bumperHang | PART.bumperGone | PART.mirrorL | PART.mirrorR;

/** What's next under the bonnet, in order (the engine first: it's what stops you), or null: nothing there to mend
 *  — or only the glass, and this isn't the garage. */
export function nextMend(dm: Damage, garage: boolean): Exclude<Mend, "tyre"> | null {
  if (dm.parts & PART.engineDead || steamOf(dm) > 0) return "engine";
  if (dm.parts & LAMPS) return "lamps";
  if (dm.parts & BODY || dm.zones.some((z) => z > 0.05)) return "panels";
  if (garage && dm.parts & GLASS) return "glass";
  return null;
}

/** May it be mended here: the garage has it all; a wrench does the engine, the lamps, the panels; a flat's the
 *  spare's (its jack's in the boot) or the garage's. */
export function mayMend(what: Mend, o: { garage: boolean; wrench: boolean; spare: number }): boolean {
  if (o.garage) return true;
  if (what === "glass") return false;
  if (what === "tyre") return o.spare > 0;
  return o.wrench;
}

/** Mended (a new damage): `wheel` for a tyre. The panels: the worst side's dents out (a zone a time), with the
 *  bumper and mirrors. Returns the zone the panels were knocked out of (its holes go too), else −1. */
export function mend(dm: Damage, what: Mend, wheel = 0): { dm: Damage; zone: number } {
  const out: Damage = { zones: dm.zones.slice(), parts: dm.parts };
  let zone = -1;
  if (what === "engine") {
    out.parts &= ~PART.engineDead;
    // (the radiator's patched: no steam — the front's dent itself is the panels')
    out.zones[0] = Math.min(out.zones[0], 0.75);
  } else if (what === "lamps") out.parts &= ~LAMPS;
  else if (what === "glass") out.parts &= ~GLASS;
  else if (what === "tyre") out.parts &= ~FLATS[wheel & 3];
  else {
    out.parts &= ~BODY;
    let worst = 0;
    for (let i = 1; i < 5; i++) if (out.zones[i] > out.zones[worst]) worst = i;
    if (out.zones[worst] > 0.05) {
      out.zones[worst] = 0;
      zone = worst;
    }
  }
  return { dm: out, zone };
}

/** A car's holes (shot.ts' string) without those in a side (`face`) just mended. */
export function holesWithout(s: string, face: number): string {
  if (!s || face < 0) return s;
  return s
    .split(";")
    .filter((h) => Number(h.split(",")[3]) !== face)
    .join(";");
}
