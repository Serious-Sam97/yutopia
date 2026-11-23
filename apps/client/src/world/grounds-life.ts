"use client";

import { byteFace, floorOf, type MapDef, parseAvatar } from "@yutopia/shared";
import type { Footing } from "@yutopia/shared/footing";
import type * as GroundsModule from "@yutopia/shared/grounds";
import { packMv } from "@yutopia/shared/move";
import type { GroundWhat } from "@yutopia/shared/shapes/grounds";
import { addStrings, lang, trMaybe } from "@/lib/i18n";
import { Footprints } from "./footprints";
import { GroundsSound, type Here } from "./grounds-sound";
import type { AvatarState } from "./model";
import { biIn, npcLabel } from "./npc-words";

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
  /** (plan 98 phase 23) on Jolt: its nose up (rad) and its lean (rad, + its left up), eased; its turn rate (rad/s) and
   *  its change of speed (m/s²), for its wheels and its brake lamps */
  pitch?: number;
  roll?: number;
  turn?: number;
  accel?: number;
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
  qx?: number;
  qy?: number;
  qz?: number;
  qw?: number;
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

  /** A frame: where each is, eased; a horn heard from where it is. `here`: I'm on the ground
   *  floor. */
  drive(dt: number, vehicles: Vehicles | undefined, me: { x: number; y: number }, here: boolean) {
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
      const da = Math.atan2(Math.sin(v.a - c.a), Math.cos(v.a - c.a)) * k;
      c.a += da;
      // (plan 98 phase 23: its turn and its change of speed, eased — its wheels steered, its lamps)
      if (dt > 0) {
        c.turn = (c.turn ?? 0) + (da / dt - (c.turn ?? 0)) * Math.min(1, dt * 4);
        c.accel = (c.accel ?? 0) + ((v.v - c.v) / dt - (c.accel ?? 0)) * Math.min(1, dt * 3);
      }
      // (on Jolt — its quaternion said —: its nose and its lean as the land and its springs have them)
      const qw = v.qw ?? 1;
      if (Math.abs(qw) < 0.99999 && v.qx !== undefined && v.qy !== undefined && v.qz !== undefined) {
        const x = v.qx;
        const y = v.qy;
        const z = v.qz;
        // (its own +x, its nose, and +z, its side, turned by it: their heights)
        const fy = 2 * (x * y + qw * z);
        const sy = 2 * (y * z - qw * x);
        const pitch = Math.asin(Math.max(-1, Math.min(1, fy)));
        const roll = Math.asin(Math.max(-1, Math.min(1, sy)));
        c.pitch = (c.pitch ?? pitch) + (pitch - (c.pitch ?? pitch)) * k;
        c.roll = (c.roll ?? roll) + (roll - (c.roll ?? roll)) * k;
      }
      c.v = v.v;
      c.fl = v.fl;
      // (the Kart Park's ploughs, the change's show, say their height — features/karts.ts showTick)
      if (id.startsWith("kart-plough") && v.y !== undefined) c.h = c.h === undefined ? v.y : c.h + (v.y - c.h) * k;
      else c.h = undefined;
      c.shown = v.shown;
      const was = this.honks.get(id) ?? v.honkAt;
      this.honks.set(id, v.honkAt);
      if (v.honkAt !== was && v.shown && here) {
        const d = Math.hypot(c.x - me.x, c.z - me.y);
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
    const x = st.x;
    const z = st.y;
    const s = this.G.surfaceCellAt(Math.floor(x), Math.floor(z));
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
  footingAt(x: number, y: number, _map: MapDef, night: number, storm: number, under = false): Footing {
    const cold = Math.min(1, 0.35 + 0.5 * night + 0.3 * storm);
    const cover = Math.max(0, storm - 0.2) * 0.9;
    return this.G.footingAt(x, y, cold, cover, under);
  }
  /** A Grounds' thing stood on at (x, y) (a roof, a porch, a bridge's deck — by its way there). */
  thingFooting(what: GroundWhat, x: number, y: number, map: MapDef, night: number, storm: number): Footing {
    return this.G.whatFooting(what, () => this.footingAt(x, y, map, night, storm));
  }

  /** The Grounds' sound round me (`me` the floor's coords; `land` out on it). */
  hear(
    dt: number,
    me: { x: number; y: number },
    land: boolean,
    night: number,
    storm: number,
    fog = 0,
    more: Pick<Here, "car" | "hour" | "wx" | "roof" | "up"> = {},
  ) {
    const x = me.x;
    const z = me.y;
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
  seat(p: { busy?: string; x: number; y: number; yaw: number; z?: number } | undefined) {
    if (p?.busy !== RIDING) return null;
    return { me: { x: p.x, y: p.y, yaw: byteFace(p.yaw), a: 2 }, z: p.z ?? 0, angle: this.heading(p) };
  }

  /** The heading of what I'm riding (the shuttle, or the bus — the nearer: I face its way). */
  heading(p?: { x: number; y: number }): number | undefined {
    const s = this.cars.get(SHUTTLE_ID);
    const b = this.cars.get(BUS_ID);
    if (!b || !p) return s?.a;
    if (!s) return b.a;
    const d = (c: Car) => Math.hypot(c.x - p.x, c.z - p.y);
    return d(b) < d(s) ? b.a : s.a;
  }

  /** At its stop, near it: on; riding: off. */
  prompt(
    vehicles: Vehicles | undefined,
    riding: boolean,
    me: { x: number; y: number },
  ): { objectId: string; kind: string; label: string } | null {
    // (the shuttle, or the long road's bus: the nearer at its stop)
    const near = (id: string) => {
      const v = vehicles?.get(id);
      return v?.shown && v.stop ? { id, v, d: Math.hypot(v.x - me.x, v.z - me.y) } : null;
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

  /** The Kart Park's folk and the Strike Park's (world-server park-life.ts, strike-life.ts walk them): as the world's
   *  cast dresses them (plan 120), by their name, the staff's with what they do. */
  folk(n: {
    id: string;
    x: number;
    y: number;
    yaw: number;
    a: number;
    name?: string;
    role?: string;
    look?: string;
  }): AvatarState | null {
    // (the Strike Park's bots — plan 115 phase 84: one of the world's people in their team's kit, their gun in hand;
    // `mood` is "<team>:<gun>")
    if (n.id.startsWith("strike-bot:")) return this.strikeBot(n as typeof n & { mood?: string });
    // (plan 115 phase 88) a hostage: a civilian in a high-vis vest, hands up when held
    if (n.id.startsWith("strike-hostage:")) {
      const i = Number(n.id.slice(15)) || 0;
      const key = `hostage:${i}`;
      let look = this.folkLooks.get(key);
      if (!look) {
        look = parseAvatar({
          gait: "tired",
          gender: i % 2 ? "feminine" : "masculine",
          shoes: "sneakers",
          body: i % 3 ? "slim" : "broad",
          skin: ["#f0c7a0", "#a8693f", "#e4b48e", "#8d5a3b"][i % 4],
          hair: ["short", "bob", "buzz", "ponytail"][i % 4],
          hairColor: ["#3a2414", "#140e0a", "#9a9a9a", "#b5562f"][i % 4],
          top: "shirt",
          topColor: "#d8d4ca",
          bottom: "trousers",
          bottomColor: "#3c4450",
          outer: "vest",
          outerColor: "#e8732a",
        });
        this.folkLooks.set(key, look);
      }
      return {
        name: "Hostage",
        avatar: look,
        x: n.x,
        y: n.y,
        yaw: byteFace(n.yaw),
        a: n.a,
        status: "online",
        speaking: false,
        emote: "",
        mic: false,
        bot: true,
      };
    }
    // (the Kart Park's and the Strike Park's — plan 115 —: dressed by the world's cast, plan 120: their name, what
    // they do, their look on their Npc)
    return {
      name: this.castName(n),
      avatar: this.castLook(n.look ?? ""),
      x: n.x,
      y: n.y,
      yaw: byteFace(n.yaw),
      a: n.a,
      status: "online",
      speaking: false,
      emote: "",
      mic: false,
      bot: true,
    };
  }
  private folkLooks = new Map<string, ReturnType<typeof parseAvatar>>();
  /** (plan 120) a look as the cast sends it (shared packLook), parsed once */
  private castLook(s: string): ReturnType<typeof parseAvatar> {
    const key = `cast:${s}`;
    let look = this.folkLooks.get(key);
    if (!look) {
      look = parseAvatar(s || "{}");
      this.folkLooks.set(key, look);
    }
    return look;
  }
  /** (plan 120) "Name · Role" in my language, as the cast says */
  private castName(n: { name?: string; role?: string }): string {
    return npcLabel((n.name ?? "").trim(), biIn(n.role ?? "", lang() === "pt").trim());
  }
  private strikeBot(n: { id: string; x: number; y: number; yaw: number; a: number; mood?: string }): AvatarState {
    // (plan 115 phase 85) "<team>:<gun>:<pose>:<hit at>:<hit from ×100>:<fell at>" — the server's botNpc
    const [team, gun, pose = "", hitAt = "0", hitYaw = "0", fellAt = "0"] = String(n.mood ?? "r:").split(":");
    const key = `${n.id}|${team}`;
    let look = this.folkLooks.get(key);
    if (!look) {
      let h = 0;
      for (const ch of n.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      const r = (k: number) => ((h >>> (k * 3)) & 7) / 7;
      const skins = ["#f0c7a0", "#e4b48e", "#c58c63", "#a8693f", "#8d5a3b", "#5e3a24"];
      const hairs = ["short", "buzz", "bun", "ponytail", "bob", "short"];
      const fem = r(1) > 0.5;
      look = parseAvatar({
        gait: r(2) > 0.5 ? "brisk" : "heavy",
        gender: fem ? "feminine" : "masculine",
        shoes: "boots",
        body: r(3) > 0.6 ? "broad" : "athletic",
        skin: skins[Math.floor(r(4) * skins.length) % skins.length],
        hair: hairs[Math.floor(r(5) * hairs.length) % hairs.length],
        hairColor: ["#140e0a", "#3a2414", "#6b4a2a", "#9a9a9a"][Math.floor(r(6) * 4) % 4],
        top: "jacket",
        topColor: team === "w" ? "#3e5d72" : "#8c6323",
        bottom: "trousers",
        bottomColor: "#2c2f2a",
        accessory: "cap",
        accessoryColor: team === "w" ? "#6fa3c7" : "#e8a33a",
      });
      this.folkLooks.set(key, look);
    }
    const room = (
      window as unknown as {
        __yutopia?: { room?: { state?: { strike?: { members?: Map<string, { name?: string }> } } } };
      }
    ).__yutopia?.room;
    const name = room?.state?.strike?.members?.get(n.id.slice(11))?.name ?? "Vortex";
    return {
      name: `${name} · bot`,
      avatar: look,
      x: n.x,
      y: n.y,
      yaw: byteFace(n.yaw),
      a: n.a,
      status: "online",
      speaking: false,
      emote: "",
      mic: false,
      bot: true,
      // (plan 119: the knife out a moment — in its hand as a person's, swung where the server says)
      gun: gun && gun !== "knife" ? gun : undefined,
      held: gun === "knife" ? "knife" : undefined,
      // crouched (at the charge, or shooting far on Hard), the gun up when they've someone in sight, its aim level
      mv: packMv(n.a === 1 ? "walk" : "still", pose.includes("c") || pose.includes("k"), pose.includes("a")),
      focused: pose.includes("a") || undefined,
      // struck: the flinch from where it came; dead: down where they fell, staying down (pinned) till the round's over
      hitAt: Number(hitAt) || undefined,
      hitYaw: Number(hitYaw) / 100 || undefined,
      fellAt: Number(fellAt) || undefined,
      fellYaw: Number(fellAt) ? Number(hitYaw) / 100 : undefined,
      pinned: Number(fellAt) ? true : undefined,
    };
  }

  /** The night guard: a dark uniform and a cap, a flashlight; he says nothing. (A bot, not
   *  Vortex — `npc` is his —, so no muted mic shown.) */
  guard(
    n: { x: number; y: number; yaw: number; a: number; name?: string; role?: string; look?: string },
    night = 1,
  ): AvatarState {
    // (his flashlight: on outside after dark, off at his post in the gatehouse)
    const gx = n.x;
    const gz = n.y;
    const atPost = gx > -34 && gx < -29 && gz > -367 && gz < -361;
    return {
      name: this.castName(n) || t("nightGuard"),
      avatar: n.look ? this.castLook(n.look) : GUARD_LOOK,
      x: n.x,
      y: n.y,
      yaw: byteFace(n.yaw),
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
