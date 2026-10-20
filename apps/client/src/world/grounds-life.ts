"use client";

import { floorOf, type MapDef, parseAvatar } from "@yutopia/shared";
import type * as GroundsModule from "@yutopia/shared/grounds";
import { addStrings, trMaybe } from "@/lib/i18n";
import type { AvatarState } from "./engine";
import { Footprints } from "./footprints";
import { GroundsSound } from "./grounds-sound";
import type { Floor } from "./sound";

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
    nightGuard: ["Night guard", "Vigia"],
  },
  "yutopia-grounds-life",
);
const t = (k: string) => trMaybe(k) ?? k;

export const SHUTTLE_ID = "shuttle";
export const RIDING = "ride:shuttle";

export interface Car {
  id: string;
  kind: string;
  x: number; // the building's coords
  z: number;
  a: number;
  v: number;
  shown: boolean;
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
        c = { id, kind: v.kind, x: v.x, z: v.z, a: v.a, v: v.v, shown: v.shown };
        this.cars.set(id, c);
      }
      c.x += (v.x - c.x) * k;
      c.z += (v.z - c.z) * k;
      c.a += Math.atan2(Math.sin(v.a - c.a), Math.cos(v.a - c.a)) * k;
      c.v = v.v;
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
    const s = this.G.surfaceTileAt(Math.floor(st.x + (map.ox ?? 0)), Math.floor(st.y + (map.oy ?? 0)));
    if (s !== "snow" && s !== "deep") return this.prints.forget(id);
    const ground = st.ground ?? st.z ?? 0;
    if ((st.z ?? 0) > ground + 0.05) return; // (in the air)
    this.prints.step(id, st.x, st.y, ground, now);
  }

  /** What's underfoot out there (a footstep's sound). */
  floorAt(x: number, y: number, map: MapDef): Floor {
    const s = this.G.groundSurfaceAt(x + (map.ox ?? 0), y + (map.oy ?? 0));
    return s === "walk" || s === "rock" ? "concrete" : s === "floor" ? "wood" : s;
  }

  /** The Grounds' sound round me (`me` the floor's coords; `land` out on it). */
  hear(
    dt: number,
    me: { x: number; y: number },
    map: { ox?: number; oy?: number },
    land: boolean,
    night: number,
    storm: number,
  ) {
    const x = me.x + (map.ox ?? 0);
    const z = me.y + (map.oy ?? 0);
    const inside = this.G.INSIDES.some((i) => x >= i.b.x0 && x < i.b.x1 && z >= i.b.z0 && z < i.b.z1);
    this.sound.update(dt, { x, z, land: land && !inside, inside: inside || !land, night, storm: Math.max(0, storm) });
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

  /** Riding the shuttle: where it carries me (the server says), seated, facing its way. */
  seat(p: { busy?: string; x: number; y: number; d: number; z?: number } | undefined) {
    if (p?.busy !== RIDING) return null;
    return { me: { x: p.x, y: p.y, d: p.d, a: 2 }, z: p.z ?? 0, angle: this.heading() };
  }

  /** The shuttle's heading (riding it: I face its way). */
  heading(): number | undefined {
    return this.cars.get(SHUTTLE_ID)?.a;
  }

  /** At its stop, near it: on; riding: off. */
  prompt(
    vehicles: Vehicles | undefined,
    riding: boolean,
    me: { x: number; y: number },
    ox: number,
    oy: number,
  ): { objectId: string; kind: string; label: string } | null {
    const bus = vehicles?.get(SHUTTLE_ID);
    if (!bus?.shown || !bus.stop) return null;
    if (riding) return { objectId: SHUTTLE_ID, kind: "ride:leave", label: t("rideLeave") };
    if (Math.hypot(bus.x - ox - me.x, bus.z - oy - me.y) > 5.5) return null;
    return { objectId: SHUTTLE_ID, kind: "ride", label: t(bus.stop === "hq" ? "rideToTown" : "rideToHq") };
  }

  /** The night guard: a dark uniform and a cap; he says nothing. (A bot, not
   *  Vortex — `npc` is his —, so no muted mic shown.) */
  guard(n: { x: number; y: number; d: number; a: number }): AvatarState {
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
    };
  }
}

const GUARD_LOOK = parseAvatar({
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
