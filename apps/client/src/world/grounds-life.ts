"use client";

import { floorOf, GROUND_OFFSET, type MapDef, parseAvatar } from "@yutopia/shared";
import type { Footing } from "@yutopia/shared/footing";
import type * as GroundsModule from "@yutopia/shared/grounds";
import type { GroundWhat } from "@yutopia/shared/shapes/grounds";
import { addStrings, trMaybe } from "@/lib/i18n";
import { Footprints } from "./footprints";
import { GroundsSound, type Here } from "./grounds-sound";
import type { AvatarState } from "./model";

// Life on the Grounds, the client's side (docs/plan/27-the-grounds.md, phase
// 6; the server drives it: world-server features/grounds-life.ts): the
// visitor's car and the shuttle eased between the server's ticks, their horns,
// the shuttle's "get on" / "get off", the night guard's look. Loaded with the
// Grounds (with their sound), so the world page doesn't carry it.

addStrings(
  {
    rideToTown: ["Shuttle · to the town", "Ônibus · para a cidade"],
    rideToHq: ["Shuttle · to HQ", "Ônibus · para a sede"],
    rideLeave: ["Get off the shuttle", "Descer do ônibus"],
    rideToLake: ["Bus · to Silver Lake", "Ônibus · para o Silver Lake"],
    rideToTownBus: ["Bus · to the town", "Ônibus · para a cidade"],
    rideLeaveBus: ["Get off the bus", "Descer do ônibus"],
    nightGuard: ["Night guard", "Vigia"],
    folkControl: ["Race control", "Direção de prova"],
    folkMechanic: ["Mechanic", "Mecânico"],
    folkCocoa: ["Hot cocoa", "Chocolate quente"],
  },
  "yutopia-grounds-life",
);
const t = (k: string) => trMaybe(k) ?? k;

export const SHUTTLE_ID = "shuttle";
/** The long road's bus (docs/plan/69, L7): ridden as the shuttle is. */
export const BUS_ID = "bus";
export const RIDING = "ride:shuttle";

export interface Car {
  id: string;
  kind: string;
  variant?: number; // a driven lot car's colour (docs/plan/28)
  fl?: number; // a driven car's lamps and switches (shared car/net.ts CAR_FLAGS)
  x: number; // the building's coords
  z: number;
  a: number;
  v: number;
  shown: boolean;
  /** the height it's at, when the server says (the Kart Park's ploughs: on its bridge or under it) */
  h?: number;
}
// (the room's state, as much of it as this reads)
interface VehicleIn {
  kind: string;
  x: number;
  z: number;
  a: number;
  v: number;
  shown: boolean;
  stop: string;
  honkAt: number;
  colour?: number;
  fl?: number;
  y?: number;
}
interface Vehicles {
  forEach(f: (v: VehicleIn, id: string) => void): void;
  get(id: string): VehicleIn | undefined;
}

export class GroundsLife {
  readonly sound: GroundsSound;
  /** Footprints in the snow: whoever walks it outdoors (the views draw them). */
  readonly prints = new Footprints();
  private pruned = 0;
  private cars = new Map<string, Car>();
  private honks = new Map<string, number>();

  constructor(private G: typeof GroundsModule) {
    this.sound = new GroundsSound(G);
  }

  /** A frame: where each is, eased; a horn heard from where it is. `me` the
   *  floor's coords (the ground floor's corner at `ox, oy`), `here` on it. */
  drive(
    dt: number,
    vehicles: Vehicles | undefined,
    me: { x: number; y: number },
    ox: number,
    oy: number,
    here: boolean,
  ) {
    if (!vehicles) return [];
    const k = 1 - Math.exp(-dt * 10);
    vehicles.forEach((v, id) => {
      let c = this.cars.get(id);
      if (!c || !c.shown) {
        c = { id, kind: v.kind, x: v.x, z: v.z, a: v.a, v: v.v, shown: v.shown, variant: v.colour };
        this.cars.set(id, c);
      }
      c.x += (v.x - c.x) * k;
      c.z += (v.z - c.z) * k;
      c.a += Math.atan2(Math.sin(v.a - c.a), Math.cos(v.a - c.a)) * k;
      c.v = v.v;
      c.fl = v.fl;
      // (the Kart Park's ploughs, the change's show, say their height — features/karts.ts showTick)
      if (id.startsWith("kart-plough") && v.y !== undefined) c.h = c.h === undefined ? v.y : c.h + (v.y - c.h) * k;
      else c.h = undefined;
      c.shown = v.shown;
      const was = this.honks.get(id) ?? v.honkAt;
      this.honks.set(id, v.honkAt);
      if (v.honkAt !== was && v.shown && here) {
        const d = Math.hypot(c.x - ox - me.x, c.z - oy - me.y);
        if (d < 60) this.sound.horn(1 - d / 60, v.kind === "shuttle");
      }
    });
    return [...this.cars.values()];
  }

  /** `id` is at `st` (the ground floor's coords; `land` out on it): a print in the snow. */
  print(
    id: string,
    st: { x: number; y: number; z?: number; ground?: number },
    now: number,
    map: MapDef,
    land: boolean,
  ) {
    if (now - this.pruned > 1000) {
      this.pruned = now;
      this.prints.prune(now);
    }
    if (floorOf(map) !== 0 || !land) return this.prints.forget(id);
    const x = st.x + (map.ox ?? 0);
    const z = st.y + (map.oy ?? 0);
    const s = this.G.surfaceTileAt(Math.floor(x), Math.floor(z));
    // (in snow only — where it lies there now: docs/plan/65, W5 — not on the grass)
    if (s !== "snow" && s !== "deep") return this.prints.forget(id);
    const f = this.G.weatheredFooting(s, x, z);
    if (f !== "snow" && f !== "deep") return this.prints.forget(id);
    const ground = st.ground ?? st.z ?? 0;
    if ((st.z ?? 0) > ground + 0.05) return; // (in the air)
    this.prints.step(id, st.x, st.y, ground, now);
  }

  /** The weather underfoot (docs/plan/65, W5): the room's snow lying, how wet, whether it's freezing
   *  — the Grounds' footing, speed, the cars' grip and the prints by it. */
  underfoot(snow: number, wet: number, freezing: boolean, ice: number) {
    this.G.setUnderfoot({ snow, wet, freezing, ice });
  }

  /** What's underfoot out there (the steps', docs/plan/63-the-steps.md): the ground, a town
   *  building's floor, a road's slush and black ice — and its snow in a storm, the cold and the cover
   *  as the cars have them (car/cars.ts; not the ploughs' cells). `under`: on the land itself, under
   *  a bridge. */
  footingAt(x: number, y: number, map: MapDef, night: number, storm: number, under = false): Footing {
    const cold = Math.min(1, 0.35 + 0.5 * night + 0.3 * storm);
    const cover = Math.max(0, storm - 0.2) * 0.9;
    return this.G.footingAt(x + (map.ox ?? 0), y + (map.oy ?? 0), cold, cover, under);
  }
  /** A Grounds' thing stood on at (x, y) (a roof, a porch, a bridge's deck — by its way there). */
  thingFooting(what: GroundWhat, x: number, y: number, map: MapDef, night: number, storm: number): Footing {
    return this.G.whatFooting(what, () => this.footingAt(x, y, map, night, storm));
  }

  /** The Grounds' sound round me (`me` the floor's coords; `land` out on it). */
  hear(
    dt: number,
    me: { x: number; y: number },
    map: { ox?: number; oy?: number },
    land: boolean,
    night: number,
    storm: number,
    fog = 0,
    more: Pick<Here, "car" | "hour" | "wx" | "roof" | "up"> = {},
  ) {
    const x = me.x + (map.ox ?? 0);
    const z = me.y + (map.oy ?? 0);
    const inside = this.G.INSIDES.some((i) => x >= i.b.x0 && x < i.b.x1 && z >= i.b.z0 && z < i.b.z1);
    this.sound.update(dt, {
      x,
      z,
      land: land && !inside,
      inside: inside || !land,
      night,
      storm: Math.max(0, storm),
      fog,
      ...more,
    });
  }

  // the storm as I feel it: the server's (it ramps it itself, a second at a
  // time), smoothed between its updates; arriving in one, in it at once
  private storm = -1;
  weather(dt: number, storm: number | undefined, wind: number | undefined): [number, number] {
    const want = Number(storm ?? 0);
    if (this.storm < 0) this.storm = want;
    this.storm += (want - this.storm) * (1 - Math.exp(-dt * 2));
    return [this.storm, Number(wind ?? 0)];
  }

  /** Riding the shuttle (or the bus): where it carries me (the server says), seated, facing its way. */
  seat(p: { busy?: string; x: number; y: number; d: number; z?: number } | undefined) {
    if (p?.busy !== RIDING) return null;
    return { me: { x: p.x, y: p.y, d: p.d, a: 2 }, z: p.z ?? 0, angle: this.heading(p) };
  }

  /** The heading of what I'm riding (the shuttle, or the bus — the nearer: I face its way). */
  heading(p?: { x: number; y: number }): number | undefined {
    const s = this.cars.get(SHUTTLE_ID);
    const b = this.cars.get(BUS_ID);
    if (!b || !p) return s?.a;
    if (!s) return b.a;
    const d = (c: Car) => Math.hypot(c.x - this.ox - p.x, c.z - this.oy - p.y);
    return d(b) < d(s) ? b.a : s.a;
  }
  /** The ground floor's corner (the building's coords): set as the prompt's asked. */
  private ox = 0;
  private oy = 0;

  /** At its stop, near it: on; riding: off. */
  prompt(
    vehicles: Vehicles | undefined,
    riding: boolean,
    me: { x: number; y: number },
    ox: number,
    oy: number,
  ): { objectId: string; kind: string; label: string } | null {
    this.ox = ox;
    this.oy = oy;
    // (the shuttle, or the long road's bus: the nearer at its stop)
    const near = (id: string) => {
      const v = vehicles?.get(id);
      return v?.shown && v.stop ? { id, v, d: Math.hypot(v.x - ox - me.x, v.z - oy - me.y) } : null;
    };
    const at = [near(SHUTTLE_ID), near(BUS_ID)].filter((x) => !!x).sort((a, b) => a.d - b.d)[0];
    if (!at) return null;
    const isBus = at.id === BUS_ID;
    if (riding) return { objectId: at.id, kind: "ride:leave", label: t(isBus ? "rideLeaveBus" : "rideLeave") };
    if (at.d > 5.5) return null;
    const label = isBus
      ? at.v.stop === "town"
        ? "rideToLake"
        : "rideToTownBus"
      : at.v.stop === "hq"
        ? "rideToTown"
        : "rideToHq";
    return { objectId: at.id, kind: "ride", label: t(label) };
  }

  /** The Kart Park's folk (shared KART_FOLK; world-server features/park-life.ts walks them): by
   *  their name, the staff's with what they do. */
  folk(n: { id: string; x: number; y: number; d: number; a: number }): AvatarState | null {
    const f = this.G.KART_FOLK.find((k) => `folk-${k.id}` === n.id);
    if (!f) return null;
    let look = this.folkLooks.get(f.id);
    if (!look) {
      look = parseAvatar(f.look);
      this.folkLooks.set(f.id, look);
    }
    const role = FOLK_ROLE[f.role];
    return {
      name: role ? `${f.name} · ${t(role)}` : f.name,
      avatar: look,
      x: n.x,
      y: n.y,
      d: n.d,
      a: n.a,
      status: "online",
      speaking: false,
      emote: "",
      mic: false,
      bot: true,
    };
  }
  private folkLooks = new Map<string, ReturnType<typeof parseAvatar>>();

  /** The night guard: a dark uniform and a cap, a flashlight; he says nothing. (A bot, not
   *  Vortex — `npc` is his —, so no muted mic shown.) */
  guard(n: { x: number; y: number; d: number; a: number }, night = 1): AvatarState {
    // (his flashlight: on outside after dark, off at his post in the gatehouse)
    const gx = n.x + GROUND_OFFSET.x;
    const gz = n.y + GROUND_OFFSET.y;
    const atPost = gx > -34 && gx < -29 && gz > -367 && gz < -361;
    return {
      name: t("nightGuard"),
      avatar: GUARD_LOOK,
      x: n.x,
      y: n.y,
      d: n.d,
      a: n.a,
      status: "online",
      speaking: false,
      emote: "",
      mic: false,
      bot: true,
      torch: night > 0.3 && !atPost,
    };
  }
}

const FOLK_ROLE: Record<string, string> = { control: "folkControl", mechanic: "folkMechanic", cocoa: "folkCocoa" };

const GUARD_LOOK = parseAvatar({
  // (his rounds walked heavy)
  gait: "heavy",
  body: "broad",
  skin: "#c9a27e",
  hair: "short",
  hairColor: "#2a2420",
  top: "jacket",
  topColor: "#1f2a3a",
  bottom: "trousers",
  bottomColor: "#1a1f28",
  accessory: "cap",
  accessoryColor: "#1f2a3a",
});
