import {
  ANIM,
  across,
  doorCentre,
  doorLeaves,
  doorOwner,
  doorReach,
  entry,
  isDoorKind,
  objLevel,
  placedFootprint,
  quarterOf,
  STAIRS_D,
  STAIRS_W,
  stairsDoor,
  stairsLocal,
  stairsWayUp,
  V_FLIGHT,
  type WorldObjectDef,
} from "@yutopia/shared";
import { isRadio, radioOf } from "@yutopia/shared/media";
import type { WorldController } from "../controller";
import { liftSound, loadLiftSounds, nearGain } from "../lift-sound";
import { hud } from "../store";

/** What Doors reads of the WorldController (plan 72 phase 4: its dependencies, said). */
export type DoorsHost = Pick<
  WorldController,
  | "building"
  | "grid"
  | "level"
  | "map"
  | "me"
  | "model"
  | "myUid"
  | "objs"
  | "path"
  | "pathTarget"
  | "room"
  | "tp"
  | "walkTo"
>;

export class Doors {
  constructor(private readonly c: DoorsHost) {}

  // ── the stairs (shared stairs.ts) ─────────────────────────────────────
  // A click on a stairwell's flights: on my floor's own stairs (flight A's
  // side) up them, on the ones coming up from the floor below (flight B's) down.
  climbAt(x: number, y: number): boolean {
    let up: WorldObjectDef | null = null;
    let down: WorldObjectDef | null = null;
    for (const o of this.c.objs.values()) {
      if (o.kind !== "stairs") continue;
      const l = objLevel(o, this.c.building);
      if (l !== this.c.level && l !== this.c.level - 1) continue;
      const p = across(this.c.building, this.c.level, l, { x, y });
      const { u, v } = stairsLocal(o, p.x, p.y);
      // (its flights and half landing: the landing by the door is floor, walked to)
      if (u < 0 || u > STAIRS_W || v < V_FLIGHT || v > STAIRS_D) continue;
      if (l === this.c.level) up = o;
      else down = o;
    }
    if (up && down) {
      const p = { x, y };
      return this.climb(stairsLocal(up, p.x, p.y).u >= 2 ? up : down, stairsLocal(up, p.x, p.y).u >= 2);
    }
    if (up) return this.climb(up, true);
    if (down) return this.climb(down, false);
    return false;
  }

  /** Walk to a staircase and up it (from its floor) or down it (from the floor
   *  above): over to its door, then the flights, out on the other floor. */
  climb(o: WorldObjectDef, up: boolean): boolean {
    if (hud.get().build.on) return false;
    const S = objLevel(o, this.c.building);
    if (up ? S !== this.c.level : S + 1 !== this.c.level) return false;
    const way = stairsWayUp(o).map((p) => across(this.c.building, S, this.c.level, p));
    const pts = up ? way : [...way].reverse();
    return this.c.walkTo(pts[0], undefined, false, pts.slice(1));
  }

  // The fire doors on my floor: they swing open as someone comes near and shut
  // behind them (the 3D view draws it, both views hear it).
  fireDoors = new Map<string, boolean>();

  stairsDoors() {
    const people: { x: number; y: number }[] = [this.c.me];
    this.c.room?.state.players.forEach((p, sid) => {
      if (sid !== this.c.room?.sessionId && (p.level ?? 0) === this.c.level) people.push({ x: p.x, y: p.y });
    });
    for (const o of this.c.objs.values()) {
      if (o.kind !== "stairs" || objLevel(o, this.c.building) !== this.c.level) continue;
      const d = stairsDoor(o);
      const open = people.some((p) => Math.hypot(p.x - d.x, p.y - d.y) < 1.15);
      const was = this.fireDoors.get(o.id);
      this.fireDoors.set(o.id, open);
      if (was === undefined || was === open) continue;
      loadLiftSounds();
      const gain = nearGain(Math.hypot(d.x - this.c.me.x, d.y - this.c.me.y));
      liftSound(open ? "stairs/door-open" : "stairs/door-close", { gain: gain * 0.75, delay: open ? 0 : 0.35 });
    }
  }

  // Doors swing open while someone walks through them; chairs show who sits
  // in them; the radio's display lights while it plays.
  passing = new Map<string, boolean>();

  updateDoors() {
    const model = this.c.model;
    const room = this.c.room;
    if (!model || !room) return;
    const sitting = new Set<string>();
    if (this.c.me.a === ANIM.sit) sitting.add(`${Math.floor(this.c.me.x)},${Math.floor(this.c.me.y)}`);
    room.state.players.forEach((p, sid) => {
      if (sid !== room.sessionId && p.a === ANIM.sit && (p.level ?? 0) === this.c.level)
        sitting.add(`${Math.floor(p.x)},${Math.floor(p.y)}`);
    });
    for (const o of model.allObjects()) {
      // (every seat: plan 68's rock, turn and sway while sat in — the sitter anywhere on it)
      if (entry(o.kind).seat) {
        const fp = placedFootprint(o);
        let occupied = false;
        for (let dy = 0; dy < fp.h && !occupied; dy++)
          for (let dx = 0; dx < fp.w && !occupied; dx++) occupied = sitting.has(`${o.x + dx},${o.y + dy}`);
        // (a desk's chair comes in to it with whoever's on it: plan 62, the grid's `seatSpot`)
        const pull = occupied ? (this.c.grid.seatAt(o.x + 0.5, o.y + 0.5)?.pull ?? 0) : 0;
        if (!!o.props?.occupied !== occupied || (Number(o.props?.pull) || 0) !== pull)
          model.upsertObject({ ...o, props: { ...(o.props ?? {}), occupied, pull } });
        continue;
      }
      if (isRadio(o.kind)) {
        // its display lights while it plays (its own state)
        const playing = radioOf(o).playing;
        if (!!o.props?.on !== playing) model.upsertObject({ ...o, props: { ...(o.props ?? {}), on: playing } });
        continue;
      }
      if (!isDoorKind(o.kind) || !doorLeaves(o.kind)) continue;
      // someone in the doorway: close to the middle of the door's edges
      const c = doorCentre(o);
      const half = entry(o.kind).w / 2;
      // (plan 68: the automatic doors open from further off)
      const reach = doorReach(o.kind);
      const on = (x: number, y: number) =>
        quarterOf(o) % 2 === 0
          ? Math.abs(x - c.x) < half && Math.abs(y - c.y) < reach
          : Math.abs(y - c.y) < half && Math.abs(x - c.x) < reach;
      // (a locked door swings only for its room's owner, the one who can go
      // through it: anyone else at it finds it shut)
      const locked = o.props?.state === "locked";
      const owner = locked ? doorOwner(this.c.map, o) : null;
      const may = (uid: number) => !locked || (owner != null && uid === owner);
      let occupied = may(this.c.myUid()) && on(this.c.me.x, this.c.me.y);
      room.state.players.forEach((p, sid) => {
        if (sid !== room.sessionId && (p.level ?? 0) === this.c.level && on(p.x, p.y) && may(p.uid)) occupied = true;
      });
      if (!locked)
        room.state.npcs.forEach((n) => {
          if (on(n.x, n.y)) occupied = true;
        });
      if ((this.passing.get(o.id) ?? false) !== occupied) {
        this.passing.set(o.id, occupied);
        model.upsertObject({ ...o, props: { ...(o.props ?? {}), passing: occupied } });
      }
    }
  }
}
