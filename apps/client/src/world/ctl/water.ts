import type { WaterHere } from "@yutopia/shared/move";
import type { WorldController } from "../controller";
import type { Body3 } from "../tp/view";

/** What Water reads of the WorldController (plan 72 phase 4: its dependencies, said). */
export type WaterHost = Pick<
  WorldController,
  | "G"
  | "cars"
  | "grid"
  | "holesWire"
  | "level"
  | "life"
  | "map"
  | "me"
  | "myHoles"
  | "mySwim"
  | "room"
  | "steps"
  | "thinFor"
  | "tp"
>;

export class Water {
  constructor(private readonly c: WaterHost) {}

  // the water at (x, y) on the ground floor (docs/plan/66-the-water.md), the floor's coords and my
  // heights: the Grounds' pond and river, out on the land
  waterAt(x: number, y: number): WaterHere | null {
    const G = this.c.G;
    if (!G || this.c.level !== 0 || !this.c.grid.onLand(x, y)) return null;
    const gx = x;
    const gz = y;
    const w = G.waterAt(gx, gz);
    return w ? { level: w.level, bed: w.bed, vx: w.flow[0], vy: w.flow[1], ice: !!G.iceAt(gx, gz) } : null;
  }

  // how someone at (x, y, z) is in the water: 0 out, 1 wading, 2 afloat, 3 under (from where they
  // are: nothing on the wire says it)
  swimOf(x: number, y: number, z: number): number {
    const w = this.waterAt(x, y);
    if (!w || z > w.level - 0.15) return 0;
    if (w.level - w.bed < 1.15 || z <= w.bed + 0.05) return 1;
    return z < w.level - 1.6 ? 3 : 2;
  }

  // the water's sound (docs/plan/66-the-water.md S9): where I am (its beds), who's in it near me (their
  // splashes, strokes, gasps), a car gone in, the ice giving way — the Grounds' sound plays it
  riverSpots: { rapid: [number, number][]; falls: [number, number][] } | null = null;

  waterSound(bodies: Body3[], dt: number) {
    const W = this.c.life?.sound.water;
    const G = this.c.G;
    if (!W || !G) return;
    const sid = this.c.room?.sessionId ?? "";
    const land = this.c.level === 0 && this.c.grid.onLand(this.c.me.x, this.c.me.y);
    const x = this.c.me.x;
    const z = this.c.me.y;
    // (the rapid and the falls: the river's samples by its current, every fourth)
    if (!this.riverSpots) {
      const r = G.riverWater();
      const spots: { rapid: [number, number][]; falls: [number, number][] } = { rapid: [], falls: [] };
      G.RIVER.line.forEach((p, i) => {
        if (i % 4 || r.speed[i] <= G.ICE_FAST) return;
        spots[r.speed[i] > FALLS_SPEED ? "falls" : "rapid"].push([p[0], p[1]]);
      });
      this.riverSpots = spots;
    }
    const near = (pts: [number, number][]) => {
      let d = 1e9;
      for (const [px, pz] of pts) d = Math.min(d, Math.hypot(px - x, pz - z));
      return d;
    };
    const P = G.POND;
    const e = Math.hypot((x - P.cx) / P.rx, (z - P.cz) / P.rz);
    const wat = land ? this.waterAt(this.c.me.x, this.c.me.y) : null;
    const ice = this.c.room?.state.weather?.ice ?? 1;
    const waders = [];
    for (const b of bodies) {
      if (b.id.startsWith("pet:") || (b.level ?? 0) !== 0 || this.c.level !== 0) continue;
      const me = b.id === sid;
      if (!me && Math.hypot(b.x - this.c.me.x, b.y - this.c.me.y) > WATER_HEARD) continue;
      const w = me ? null : { ...b, level: b.level ?? 0 };
      waders.push({
        id: b.id,
        swim: b.swim ?? 0,
        x: b.x,
        y: b.y,
        z: b.z ?? 0,
        gain: w ? this.c.steps.ears.gain(w) : 1,
        pan: w ? this.c.steps.ears.pan(w) : 0,
        gender: b.avatar.gender,
        me,
      });
    }
    // (the cars near in deep water, their middle under its level)
    const cars = [];
    for (const c of this.c.cars?.where() ?? []) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d > WATER_HEARD * 2 || this.c.level !== 0) continue;
      const w = G.waterAt(c.x, c.z);
      const at = { x: c.x, y: c.z, level: 0 };
      cars.push({
        id: c.id,
        wet: !!w && w.depth >= 1 && c.y < w.level + 0.3,
        gain: Math.max(0, 1 - d / (WATER_HEARD * 2)),
        pan: this.c.tp?.pan(this.c.me, at) ?? 0,
      });
    }
    const holes = [...G.holesFromWire(this.c.holesWire), ...this.c.myHoles].map((h) => {
      const d = Math.hypot(h.x - x, h.z - z);
      return {
        key: `${Math.round(h.x)},${Math.round(h.z)}`,
        gain: this.c.level === 0 ? Math.max(0, 1 - d / (WATER_HEARD * 2)) : 0,
        pan: this.c.tp?.pan(this.c.me, { x: h.x, y: h.z }) ?? 0,
      };
    });
    W.update(
      dt,
      {
        swim: this.c.mySwim,
        speed: this.c.steps.stepped.speed,
        out: land && !this.c.cars?.inCar(),
        up: this.c.tp?.mood.earUp() ?? 0,
        pond: land ? Math.max(0, 1 - (Math.abs(e - 1) * Math.min(P.rx, P.rz)) / 25) : 0,
        rapid: land ? near(this.riverSpots.rapid) : 1e9,
        falls: land ? near(this.riverSpots.falls) : 1e9,
        current: wat ? Math.hypot(wat.vx, wat.vy) : 0,
        ice,
        soaked: this.c.tp?.mood.wetness(sid),
      },
      waders,
      cars,
      holes,
    );
  }

  // thin ice under my feet (plan 66 S4): stood on a second and a half, or landed on hard, it gives — a
  // hole for everyone (the room checks it), mine at once (the physics' ice made again round it)
  thinIce(dt: number, out: { up: boolean; swim: number; landed: number | null }) {
    const G = this.c.G;
    if (
      !G ||
      !this.c.room ||
      this.c.level !== 0 ||
      out.up ||
      out.swim ||
      !this.c.grid.onLand(this.c.me.x, this.c.me.y)
    ) {
      this.c.thinFor = 0;
      return;
    }
    const x = this.c.me.x;
    const z = this.c.me.y;
    if (!G.iceAt(x, z)?.thin) {
      this.c.thinFor = 0;
      return;
    }
    this.c.thinFor += dt;
    // (its giving way heard: the water's sound, as the hole comes — waterSound)
    this.c.life?.sound.water.preload("ice-crack");
    if (this.c.thinFor < THIN_GIVES && (out.landed ?? 0) < 0.3) return;
    this.c.thinFor = 0;
    this.c.room.send("ice:break", { x, z });
    this.c.myHoles.push({ x, z, r: G.ICE_HOLE.r, at: Date.now() });
    G.setIceHoles([...G.holesFromWire(this.c.holesWire), ...this.c.myHoles]);
  }

  // the water over someone's feet at (x, y, z) (m; wading's waterline), or undefined out of it
  waterOver(x: number, y: number, z: number): number | undefined {
    const w = this.waterAt(x, y);
    return w && w.level > z ? w.level - z : undefined;
  }

  // over water deep enough to catch a fall (plan 66: no ragdoll into it)
  overDeep(x: number, y: number): boolean {
    const w = this.waterAt(x, y);
    return !!w && w.level - w.bed >= SWIM_CATCH;
  }
}

// water this deep catches a fall (shared move SWIM.catch: a copy — the move core's the input chunk's,
// not the page's)
const SWIM_CATCH = 1.3;

const THIN_GIVES = 1.5;

// the water's sound (docs/plan/66 S9): how far someone in it is heard (m: water-sound.ts HEARD), and
// the river's current past which it's the falls' roar, not the rapid's (m/s)
const WATER_HEARD = 30;

const FALLS_SPEED = 2.4;
