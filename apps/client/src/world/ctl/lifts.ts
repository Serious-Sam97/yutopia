import {
  carElev,
  floorAt,
  inLift,
  type LiftMotion,
  liftCarBody,
  liftMotion,
  liftShafts,
  objLevel,
  quarterOf,
  STOREY,
  type WorldObjectDef,
} from "@yutopia/shared";
import type { WorldController } from "../controller";
import { liftSound, loadLiftSounds, nearGain } from "../lift-sound";

/** What Lifts reads of the WorldController (plan 72 phase 4: its dependencies, said). */
export type LiftsHost = Pick<
  WorldController,
  "actions" | "building" | "height" | "level" | "me" | "objs" | "path" | "setLevel" | "tp"
>;

export class Lifts {
  constructor(private readonly c: LiftsHost) {}

  // ── the elevators' motion (shared lift.ts: liftMotion) ─────────────────
  // When each stop's phase was heard of: the doors and the car move from then
  // (everyone hears it at about the same moment). Its sounds start with it.
  liftSince = new Map<string, number>();

  liftKeys = new Map<string, string>();

  liftsDirty = true;

  liftHeard(o: WorldObjectDef) {
    loadLiftSounds(); // (the building has elevators: their sounds, decoded ahead)
    const p = o.props ?? {};
    const key = `${p.ph}|${p.len}|${p.at}|${p.to}`;
    this.liftsDirty = true;
    if (this.liftKeys.get(o.id) === key) return;
    const was = this.liftKeys.get(o.id);
    this.liftKeys.set(o.id, key);
    this.liftSince.set(o.id, performance.now());
    if (was !== undefined) this.liftSound(o, was);
  }

  // A stop's phase changed (`was`: the one before): what it sounds like, if it's
  // on my floor — the doors, the chime as it arrives, the ride if I'm in it.
  liftRide: ((fade?: number) => void) | null = null;

  liftSound(o: WorldObjectDef, wasKey: string) {
    loadLiftSounds();
    const [was, , wasAt, wasTo] = wasKey.split("|");
    if (objLevel(o, this.c.building) !== this.c.level) return;
    const p = o.props ?? {};
    const ph = String(p.ph ?? "");
    const len = (Number(p.len) || 0) / 1000;
    const here = p.at === this.c.level;
    const c = { x: o.x + 1, y: o.y + 1 };
    const inside = inLift(o, this.c.me);
    const gain = inside ? 1 : nearGain(Math.hypot(c.x - this.c.me.x, c.y - this.c.me.y));
    if (here && ph === "opening") {
      if (was === "moving") liftSound("lift/chime", { gain: gain * 0.7 });
      // (one tone for a car that came up, a second, lower, for one that came down)
      if (was === "moving" && Number(wasTo) < Number(wasAt))
        liftSound("lift/chime", { gain: gain * 0.7, rate: 0.8, delay: 0.42 });
      liftSound("lift/door-open", { gain: gain * 0.8, rate: 1.7 / Math.max(0.5, len) });
    }
    if (here && ph === "closing") liftSound("lift/door-close", { gain: gain * 0.8, rate: 1.7 / Math.max(0.5, len) });
    if (ph === "moving" && inside) {
      this.liftRide?.(0.3);
      const stop = liftSound("lift/ride.wav", { gain: 0.7, loop: true });
      this.liftRide = stop;
      if (stop) setTimeout(() => stop(0.6), Math.max(0, len - 0.6) * 1000);
    }
  }

  /** An elevator stop as it stands now (its doors' step, the car
   *  there or not); anything else as it is. */
  liftDrawn(o: WorldObjectDef): WorldObjectDef {
    if (o.kind !== "elevator") return o;
    const now = performance.now();
    const m = liftMotion(o, objLevel(o, this.c.building), (now - (this.liftSince.get(o.id) ?? now)) / 1000);
    return { ...o, props: { ...(o.props ?? {}), anim: Math.round(m.doors * 5) / 5, here: m.here } };
  }

  /** The car I'm standing in on my floor (and its motion), if I am. */
  myLift(now: number): { o: WorldObjectDef; m: LiftMotion } | null {
    for (const o of this.c.objs.values()) {
      if (o.kind !== "elevator" || objLevel(o, this.c.building) !== this.c.level || !inLift(o, this.c.me)) continue;
      return { o, m: liftMotion(o, this.c.level, (now - (this.liftSince.get(o.id) ?? now)) / 1000) };
    }
    return null;
  }

  /** Each shaft's car where it is now, as Jolt has it (docs/plan/72 phase 8: lifts as moving
   *  platforms — a body that carries who stands on it; tp/physics3d.ts setLifts). */
  carBodies(now: number): ReturnType<typeof liftCarBody>[] {
    const out: ReturnType<typeof liftCarBody>[] = [];
    for (const list of liftShafts(this.c.objs.values(), this.c.building).values()) {
      const s = list[0];
      if (!s) continue;
      const m = liftMotion(s.o, s.level, (now - (this.liftSince.get(s.o.id) ?? now)) / 1000);
      out.push(liftCarBody(s.o, carElev(m.car)));
    }
    return out;
  }

  // In a lift's car on the move: it carries me — standing on its floor, a body in Jolt (my floor the
  // one it's passing: shared floorAt, as the stairs). My walk waits for the doors (nowhere to go
  // meanwhile but about the car). Before Jolt's in (`standing` false), held at its floor's height,
  // up (or down) the shaft with it, the building's one space (docs/plan/50-the-volume.md, D).
  liftCarry(now: number, standing: boolean): boolean {
    const at = this.myLift(now);
    if (!at || at.m.phase !== "moving") return false;
    this.c.path = null;
    this.c.actions.clear();
    if (standing) return false;
    const h = this.c.height;
    h.z = (at.m.car - this.c.level) * STOREY;
    h.vz = 0;
    h.up = false;
    const ch = floorAt(this.c.building, this.c.level, this.c.me, h.z);
    if (ch) {
      const from = this.c.level;
      this.c.me.x = ch.at.x;
      this.c.me.y = ch.at.y;
      h.z += ch.dz;
      if (this.c.tp) this.c.tp.carryFrom = from; // (the 3D camera keeps its place in the building)
      this.c.setLevel(ch.level);
    }
    return true;
  }

  // In the car (3D), the camera rides in it with you: high in its back corner,
  // over your shoulder to the doors and the panel; it sways a hair on the way.
  liftCam(now: number): {
    eye: [number, number, number];
    look: [number, number, number];
    showMe: boolean;
    fov: number;
    snap: boolean;
  } | null {
    const at = this.myLift(now);
    if (this.c.tp) this.c.tp.liftIn = at?.o.id ?? null;
    if (!at) {
      if (this.c.tp) {
        this.c.tp.liftSway = 0;
        this.c.tp.liftRise = 0;
      }
      return null;
    }
    const { o, m } = at;
    const moving = m.phase === "moving";
    const sway = moving ? Math.sin((now / 1000) * 31) * 0.002 + Math.sin((now / 1000) * 7.3) * 0.003 : 0;
    // (and on the way up the shaft its floor's under my feet, between this floor and the next)
    const rise = moving ? this.c.height.z : 0;
    if (this.c.tp) {
      this.c.tp.liftSway = sway;
      this.c.tp.liftRise = rise;
    }
    // the car's own frame: doors on its local −y side (rot 0), turned with it
    const r = quarterOf(o) & 3;
    const turn = (u: number, v: number): [number, number] => {
      const dx = u - 1;
      const dy = v - 1;
      const c = [1, 0, -1, 0][r];
      const s = [0, 1, 0, -1][r];
      return [o.x + 1 + dx * c - dy * s, o.y + 1 + dx * s + dy * c];
    };
    const [ex, ey] = turn(1, 1.82);
    const [lx, ly] = turn(1, -1.6);
    // (the keys follow this camera — W towards the doors — and so does the one
    // behind me as I walk out)
    if (this.c.tp) this.c.tp.yaw = Math.atan2(ly - ey, lx - ex);
    // (on the way, held to the car: eased, it'd lag out through its ceiling — and each floor passed
    // moves the frame a storey under it)
    return {
      eye: [ex, ey, 2.2 + sway + rise],
      look: [lx, ly, 1.15 + sway + rise],
      showMe: true,
      fov: 74,
      snap: moving,
    };
  }
}
