import { areaAt, footprint, hearingGain, onLevel, parseAvatar, quarterOf, tileAt } from "@yutopia/shared";
import { keyFooting, MATS, TILE_FOOTING } from "@yutopia/shared/footing";
import { mixer } from "../audio";
import type { WorldController } from "../controller";
import { type Floor, sound } from "../sound";
import type { Ears, Footfalls, Shoe, StepGait, StepPlayer, Walker } from "../steps";
import { loadSteps, steps } from "../steps-load";
import { rainOf } from "./common";

/** What Steps reads of the WorldController (plan 72 phase 4: its dependencies, said). */
export type StepsHost = Pick<
  WorldController,
  | "G"
  | "building"
  | "cars"
  | "grid"
  | "height"
  | "inLiftCar"
  | "level"
  | "life"
  | "map"
  | "me"
  | "model"
  | "objs"
  | "objsRev"
  | "room"
  | "spaceHere"
  | "storm"
  | "tp"
  | "water"
>;

export class Steps {
  constructor(private readonly c: StepsHost) {}

  /** What (x, y)'s feet are on at z, on my floor (docs/plan/63-the-steps.md): what Jolt says they
   *  stand on — a car's roof, a desk, a porch, a bridge's deck — else the floor's tile (a rug on it)
   *  or the land (under a bridge: the ice). */
  footingAt(x: number, y: number, z: number): Floor {
    const on = this.c.tp?.underfoot(this.c.level, x, y, z)?.on ?? "";
    const night = this.c.model?.getDaylight().night ?? 0;
    const land = (under = false) => this.c.life?.footingAt(x, y, this.c.map, night, this.c.storm, under) ?? "asphalt";
    const f = on
      ? keyFooting(
          on,
          (id) => this.c.objs.get(id)?.kind,
          (what) => this.c.life?.thingFooting(what, x, y, this.c.map, night, this.c.storm) ?? "snow",
        )
      : null;
    if (f) return f;
    if (this.c.grid.onLand(x, y)) return land(on === "land");
    const t = this.matAt(x, y) ?? TILE_FOOTING[tileAt(this.c.map, Math.floor(x), Math.floor(y))] ?? "wood";
    // (the lot's asphalt, open to the sky, wet in the rain as the roads are: docs/plan/65)
    return t === "asphalt" && this.c.level === 0 && (this.c.G?.underfoot().wet ?? 0) > 0.4 ? "wet" : t;
  }

  // my steps' state: may they be heard now, at what gait; where the body isn't stepping them, the
  // way gone since the last
  feet: { ok: boolean; gait: StepGait } = { ok: false, gait: "walk" };

  // (`quiet`: s walked with no step of the body's — it's not stepping: first person, off screen…)
  stepped = { quiet: 0, way: 0, side: "R" as "L" | "R", speed: 0 };

  stepper: StepPlayer | null = null;

  shoe: { avatar: string; shoe: Shoe } = { avatar: "", shoe: "soft" };

  /** A foot of mine put down (the body's: the 3D view's onStep), or by the way gone (`side` none). */
  myStep(side?: "L" | "R") {
    if (!this.feet.ok) return;
    if (side) this.stepped.quiet = 0;
    this.stepped.way = 0;
    this.stepped.side = side ?? (this.stepped.side === "L" ? "R" : "L");
    const f = this.myFooting(this.c.height.z);
    const S = steps();
    if (!S) {
      void loadSteps();
      sound.stepSynth(f, this.feet.gait === "crouch" ? 0.22 : 0.7);
      return;
    }
    const av = this.c.room?.state.players.get(this.c.room.sessionId)?.avatar ?? "";
    if (av !== this.shoe.avatar) this.shoe = { avatar: av, shoe: S.shoeOf(parseAvatar(av).shoes) };
    // (setting off, stopping, turning on the spot — the body's slow steps: the sole scuffed too)
    this.stepPlayer(S).step(f, {
      gait: this.feet.gait,
      shoe: this.shoe.shoe,
      scuff: !!side && this.stepped.speed < S.SCUFF,
      // (wading, or soaked out of it: docs/plan/66 S9)
      water: this.c.water.waterOver(this.c.me.x, this.c.me.y, this.c.height.z),
      soaked: this.c.tp?.mood.wetness(this.c.room?.sessionId ?? ""),
    });
    // (thin ice under me: near its edge while it's young, or all of it then — docs/plan/65, 66 S4)
    const G = this.c.G;
    const thin =
      f === "ice" && G && this.c.level === 0 && this.c.grid.onLand(this.c.me.x, this.c.me.y)
        ? G.iceAt(this.c.me.x, this.c.me.y)?.thin
        : false;
    if (thin && Math.random() < 0.35)
      this.c.life?.sound.crack(
        Math.min(1, 0.4 + (THIN_ICE - (this.c.room?.state.weather?.ice ?? 1)) / THIN_ICE),
        this.feet.gait === "crouch" ? 0.4 : 1,
      );
  }

  /** The Grounds' sound round me, every frame — on foot, in a car, on the shuttle, in a lift, in god
   *  mode. Open to the sky out on the land and on the ground floor's asphalt and concrete (the lot,
   *  the pavements: as the view's fog has them); under the building's roof on its top floor, its
   *  windows' rain below. */
  hearAround(dt: number) {
    const land = this.c.level === 0 && this.c.grid.onLand(this.c.me.x, this.c.me.y);
    const t = tileAt(this.c.map, Math.floor(this.c.me.x), Math.floor(this.c.me.y));
    // (the top: the office's own floor too — the building's levels list the floors under it)
    const top = Math.max(this.c.building.floor ?? 0, ...(this.c.building.levels ?? []).map((l) => l.index));
    this.c.life?.hear(
      dt,
      this.c.me,
      land || (this.c.level === 0 && (t === "a" || t === "c")),
      this.c.model?.getDaylight().night ?? 0,
      this.c.storm,
      this.c.tp?.fogAir ?? 0,
      { ...this.hearWeather(), roof: this.c.level >= top ? ROOF_TOP : ROOF_BELOW, up: this.c.tp?.mood.earUp() ?? 0 },
    );
  }

  /** The weather for the Grounds' sound (docs/plan/65-the-weather.md W8): the room's, as the view's. */
  hearWeather() {
    const w = this.c.room?.state.weather;
    return {
      car: !!this.c.cars?.inCar(),
      hour: this.c.model?.getDaylight().hour ?? 12,
      wx: w
        ? {
            rain: rainOf(w, this.c.storm),
            sleet: w.kind === "sleet",
            thunder: w.thunder ?? 0,
            temp: w.temp ?? -5,
            wet: w.wet ?? 0,
            ice: w.ice ?? 1,
            cloud: w.cloud ?? 1,
            vol: w.vol ?? 1,
          }
        : undefined,
    };
  }

  /** Both my feet down at once out of my own hop (a turn round from a run: the 3D view's onHop). */
  myHop(hard: number) {
    const S = steps();
    if (!S || !this.feet.ok) return;
    this.stepPlayer(S).land(this.myFooting(this.c.height.z), hard, { shoe: this.shoe.shoe, thud: false });
  }

  stepPlayer(S: NonNullable<ReturnType<typeof steps>>): StepPlayer {
    this.stepper ??= new S.StepPlayer(
      () => (mixer.ctx?.state === "running" ? mixer.ctx : null),
      () => mixer.buses.effects,
      (g, gain) => sound.stepSynth(g, gain * (this.stepper?.vol ?? 1)),
    );
    return this.stepper;
  }

  // everyone else's: the nearest few on my floor, as loud and where the voices' rule has them (a
  // stairwell's other floor not: their feet aren't on mine), on what's under their feet
  footfalls: Footfalls | null = null;

  ears: Ears = {
    me: "",
    level: 0,
    gain: (w) =>
      hearingGain(
        this.c.building,
        { x: this.c.me.x, y: this.c.me.y, level: this.c.level },
        { x: w.x, y: w.y, level: w.level ?? this.c.level },
        true,
      ),
    pan: (w) => this.c.tp?.pan(this.c.me, w) ?? 0,
    footing: (w) => this.footingAt(w.x, w.y, w.z ?? w.ground ?? 0),
    down: (id) => this.c.tp?.downed.get(id),
    lift: (w) => this.c.inLiftCar(w.x, w.y),
    soaked: (w) => this.c.tp?.mood.wetness(w.id) ?? 0,
    // (phase 5) the far off's top lost; through a doorway, another room: muffled
    lp: (w) => {
      // (and faster in the morning fog: docs/plan/64-the-fog.md F6)
      const f =
        16000 / (1 + 0.35 * Math.hypot(w.x - this.c.me.x, w.y - this.c.me.y) * (1 + 1.5 * (this.c.tp?.fogAir ?? 0)));
      const a = areaAt(this.c.map, w.x, w.y);
      const b = areaAt(this.c.map, this.c.me.x, this.c.me.y);
      return (a?.key ?? "") !== (b?.key ?? "") && a?.kind !== "stage" && b?.kind !== "stage" ? Math.min(f, 900) : f;
    },
  };

  /** who stepped out of a car this frame (their feet heard down once they're drawn again) */
  alighted: string[] = [];

  wasInCar = false;

  theirSteps(bodies: Walker[], dt: number) {
    const S = steps();
    if (!S) {
      void loadSteps();
      return;
    }
    this.footfalls ??= new S.Footfalls(this.stepPlayer(S));
    this.ears.me = this.c.room?.sessionId ?? "";
    this.ears.level = this.c.level;
    this.footfalls.frame(bodies, this.ears, dt, performance.now());
    for (const id of this.alighted.splice(0)) this.footfalls.alight(id);
  }

  stepsBy(went: number, f: Floor, dt: number) {
    this.stepper?.space(this.c.spaceHere(f));
    // (the steps' volume an admin set, for everyone: the room's)
    this.stepper?.volume(this.c.room?.state.stepsVol ?? 1);
    // (the puddles out there: a splash now and then on a wet way — docs/plan/65)
    this.stepper?.puddled(this.c.room?.state.weather?.puddles ?? 0);
    if (dt > 0 && went < 1.5) this.stepped.speed += (went / dt - this.stepped.speed) * Math.min(1, dt * 8);
    this.stepper?.preload(f);
    if (!this.feet.ok || went > 1.5) return;
    this.stepped.way += went;
    // (setting off, the body's first foot's down a third of a second in: none by the way till half a
    // second's gone with no foot of its own)
    if (went > 0) this.stepped.quiet += dt;
    if (this.stepped.quiet < QUIET) return;
    if (this.stepped.way >= HALF_STRIDE[this.feet.gait]) this.myStep();
  }

  // mine, looked again only when I've gone a little way (a step's worth) or up or down
  footing = { x: Number.NaN, y: Number.NaN, z: 0, level: -1, f: "wood" as Floor };

  myFooting(z: number): Floor {
    const m = this.footing;
    if (Math.hypot(this.c.me.x - m.x, this.c.me.y - m.y) < 0.2 && Math.abs(z - m.z) < 0.1 && m.level === this.c.level)
      return m.f;
    this.footing = {
      x: this.c.me.x,
      y: this.c.me.y,
      z,
      level: this.c.level,
      f: this.footingAt(this.c.me.x, this.c.me.y, z),
    };
    return this.footing.f;
  }

  // the rugs and mats on my floor, by tile (made again when the things or my floor change)
  mats: { key: string; at: Map<number, Floor> } | null = null;

  matAt(x: number, y: number): Floor | undefined {
    const key = `${this.c.objsRev}|${this.c.level}`;
    if (this.mats?.key !== key) {
      const at = new Map<number, Floor>();
      for (const o of onLevel(this.c.objs.values(), this.c.map)) {
        const m = MATS[o.kind];
        if (!m) continue;
        const { w, h } = footprint(o.kind, quarterOf(o));
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) at.set((o.y + j) * 4096 + o.x + i, m);
      }
      this.mats = { key, at };
    }
    return this.mats.at.get(Math.floor(y) * 4096 + Math.floor(x));
  }
}

/** half a stride, by gait (tiles: plan 58's walk2/run2/crouch2Stride) — a step by the way gone */
const HALF_STRIDE: Record<StepGait, number> = { walk: 0.62, crouch: 0.66, jog: 1.31, sprint: 1.77 };
/** walked this long (s) with no step of the body's, it isn't stepping: steps by the way gone */

/** walked this long (s) with no step of the body's, it isn't stepping: steps by the way gone */
const QUIET = 0.5;

// the water's ice thin under it (docs/plan/65-the-weather.md, 66 S4: a creak, a crack; shared grounds.ts
// iceAt's), how long stood on it till it gives
const THIN_ICE = 0.95;

// how much of the rain on the building's roof is heard indoors: on its top floor, under it (too loud
// at all of it, on the user's ear 2026-11-02), and the floors below, through the windows
const ROOF_TOP = 0.55;

const ROOF_BELOW = 0.25;
/** out on the land, a building's floor underfoot: inside one of the town's (its room rings) */
