import { entry, isSocial, type WorldObjectDef } from "@yutopia/shared";
import { isGameTv } from "@yutopia/shared/games";
import { TOYS } from "@yutopia/shared/pets";
import type { ActTarget } from "../store";

// The focus (docs/plan/56-the-controls.md C): what's in front of me I could act on — someone, a
// pet, Vortex, a thing with something to do, a toy — instead of a click on it. Scored by how near
// it is and how far off my facing and the camera's line it is; the one I had keeps it a little
// longer (no flicker between two). The nearest few make the prompt's stack; [ ] or the pad's ↑ ↓
// pick between them. Tap Use: its main action; hold: its menu.

export type TargetKind = "object" | "person" | "pet" | "npc" | "toy";

export interface Target {
  /** "o:id", "p:sid", "pet:id", "npc:vortex", "toy:id" */
  key: string;
  kind: TargetKind;
  /** what it is: a name, a thing's label */
  label: string;
  /** its main action, a word (the menu's own, or a toy's, Vortex's) */
  act: string;
  x: number;
  y: number;
  /** its feet, tiles up (someone's: on a hill, up on something); none, where I stand */
  z?: number;
  /** its menu's target (none: Vortex, a toy — hold does what a tap does) */
  menu: ActTarget | null;
  /** an object's id (its picture on the prompt, its highlight) */
  objectId?: string;
  /** how good a pick it is: lower, better */
  score: number;
}

/** What the focus asks of the world (the controller). */
export interface TargetHost {
  room: { sessionId: string; state: S } | null;
  level: number;
  me(): { x: number; y: number };
  /** where I face (rad, the floor's atan2) and where the camera looks */
  facing(): number;
  camYaw(): number;
  /** the things with something to do, and how far my hands are from each (shared reach.ts) */
  objects(): WorldObjectDef[];
  reach(o: WorldObjectDef): number;
  /** a cable in hand: only what it plugs into counts */
  cable(): boolean;
  /** an elevator's panel is open (its car's the way to use it) */
  inLift(): boolean;
  menuFor(t: ActTarget): { title: string; items: { act: string; ok: boolean }[] } | null;
}
// biome-ignore lint/suspicious/noExplicitAny: the room's schema state, read as the controller reads it
type S = any;

/** How far each kind is in reach (tiles): a thing's own (the controller's INTERACT_RANGE), the rest. */
export const REACH = { object: 1.7, person: 2.4, pet: 2.2, npc: 2.6, toy: 2.4 };
const OFF_FACING = (100 * Math.PI) / 180; // past this off where I face, only what's right by me
const BY_ME = 0.9;
const STICKY = 0.8; // the one I had: its score × this
const STACK = 3;
const LOCK_CONE = (70 * Math.PI) / 180; // a lock-on's pick: within this of the camera's line

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Targets {
  /** in reach, best first (the first is the focus unless one's picked) */
  list: Target[] = [];
  /** the one picked with [ ] / ↑ ↓ (its key), while it's in the list */
  private picked: string | null = null;
  private had: string | null = null;

  constructor(private readonly host: TargetHost) {}

  /** The focus now. */
  get focus(): Target | null {
    return this.list.find((t) => t.key === this.picked) ?? this.list[0] ?? null;
  }

  /** The next (1) or previous (-1) in the stack is the focus. */
  cycle(by: 1 | -1): void {
    if (this.list.length < 2) return;
    const at = Math.max(
      0,
      this.list.findIndex((t) => t.key === this.focus?.key),
    );
    this.picked = this.list[(at + by + this.list.length) % this.list.length].key;
  }

  /** Everyone and everything I could lock on to (docs/plan/56-the-controls.md E): what update()
   *  scores, out to `range`, scored by the camera's line first. */
  lockable(range: number): Target[] {
    const out = this.gather(range, true);
    out.sort((a, b) => a.score - b.score);
    return out;
  }
  /** One of them by its key, where it is now (null: gone, or out past `range`). */
  find(key: string, range: number): Target | null {
    return this.gather(range, true).find((t) => t.key === key) ?? null;
  }
  /** The next one to the left (-1) or right (1) of `from`, as I see it (null: none that way). */
  next(from: Target, side: number, range: number): Target | null {
    const me = this.host.me();
    const a0 = Math.atan2(from.y - me.y, from.x - me.x);
    let best: Target | null = null;
    let bestOff = Number.POSITIVE_INFINITY;
    for (const t of this.gather(range, true)) {
      if (t.key === from.key || t.kind === "object" || t.kind === "toy") continue;
      // (the floor's y is south: to the right as I look is the way the angle grows)
      const off = wrap(Math.atan2(t.y - me.y, t.x - me.x) - a0) * side;
      if (off > 0.02 && off < bestOff) {
        bestOff = off;
        best = t;
      }
    }
    return best;
  }

  update(): void {
    const out = this.gather(0, false);
    out.sort((a, b) => a.score - b.score);
    this.list = out.slice(0, STACK);
    if (this.picked && !this.list.some((t) => t.key === this.picked)) this.picked = null;
    this.had = this.focus?.key ?? null;
  }

  // what's about: in reach by its kind (`far` false), else out to `range` and scored by the
  // camera's line (a lock-on's pick)
  private gather(range: number, far: boolean): Target[] {
    const h = this.host;
    const room = h.room;
    if (!room) return [];
    const me = h.me();
    const face = h.facing();
    const cam = h.camYaw();
    const out: Target[] = [];
    const add = (t: Omit<Target, "score">, d: number, reach: number) => {
      const way = Math.atan2(t.y - me.y, t.x - me.x);
      const offCam = Math.abs(wrap(way - cam));
      if (far) {
        // (a lock-on: who the camera's looking at, out to `range`; not right behind it)
        if (d > range || offCam > LOCK_CONE) return;
        out.push({ ...t, score: d * (1 + (1.5 * offCam) / Math.PI) });
        return;
      }
      if (d > reach) return;
      const off = Math.abs(wrap(way - face));
      if (off > OFF_FACING && d > BY_ME) return;
      let score = d * (1 + (0.9 * off) / Math.PI) + (0.4 * offCam) / Math.PI;
      if (t.key === this.had) score *= STICKY;
      out.push({ ...t, score });
    };
    const here = (o: { level?: number }) => (o.level ?? h.level) === h.level;
    const cable = h.cable();

    // things with something to do — a use of their own, or a menu (a seat, my desk) — by my
    // hands' reach
    for (const o of h.objects()) {
      if (cable && !isGameTv(o.kind)) continue;
      if (o.kind === "elevator" && h.inLift()) continue;
      const d = h.reach(o);
      if (d > (far ? range : REACH.object)) continue;
      const e = entry(o.kind);
      const first = e.interact ? null : h.menuFor({ type: "object", id: o.id })?.items.find((i) => i.ok);
      if (!e.interact && !first) continue;
      add(
        {
          key: `o:${o.id}`,
          kind: "object",
          label: e.label,
          act: first?.act ?? "use",
          x: o.x + 0.5,
          y: o.y + 0.5,
          menu: { type: "object", id: o.id },
          objectId: o.id,
        },
        d,
        REACH.object,
      );
    }
    if (!cable) {
      // people (not me, not the bots)
      room.state.players.forEach((p: S, sid: string) => {
        if (sid === room.sessionId || p.bot || !here(p)) return;
        const menu: ActTarget = { type: "person", sid };
        const items = h.menuFor(menu)?.items ?? [];
        const first = items.find((i) => i.ok && isSocial(i.act)) ?? items.find((i) => i.ok);
        add(
          { key: `p:${sid}`, kind: "person", label: p.name, act: first?.act ?? "wave", x: p.x, y: p.y, z: p.z, menu },
          Math.hypot(p.x - me.x, p.y - me.y),
          REACH.person,
        );
      });
      // pets (alive, not riding in a car)
      room.state.pets.forEach((pet: S, id: string) => {
        // (a pet's `level` is how far it's come on; its floor is `floor`)
        if (!pet.alive || (pet.ride && pet.ride !== "lift") || (pet.floor ?? h.level) !== h.level) return;
        const menu: ActTarget = { type: "pet", id };
        const first = h.menuFor(menu)?.items.find((i) => i.ok);
        add(
          { key: `pet:${id}`, kind: "pet", label: pet.name, act: first?.act ?? "petpet", x: pet.x, y: pet.y, menu },
          Math.hypot(pet.x - me.x, pet.y - me.y),
          REACH.pet,
        );
      });
      // Vortex
      const vx = room.state.npcs?.get("vortex");
      // (its floor; -1: the studio's)
      if (vx && (vx.level < 0 || here(vx)))
        add(
          { key: "npc:vortex", kind: "npc", label: "Vortex", act: "poke", x: vx.x, y: vx.y, menu: null },
          Math.hypot(vx.x - me.x, vx.y - me.y),
          REACH.npc,
        );
      // toys lying about
      room.state.toys?.forEach((t: S) => {
        if (t.state !== "floor") return;
        const kind = (TOYS as readonly string[]).includes(t.kind) ? (t.kind as string) : "ball";
        add(
          {
            key: `toy:${t.id}`,
            kind: "toy",
            label: kind,
            act: `take${kind[0].toUpperCase()}${kind.slice(1)}`,
            x: t.x,
            y: t.y,
            menu: null,
          },
          Math.hypot(t.x - me.x, t.y - me.y),
          REACH.toy,
        );
      });
    }
    return out;
  }
}
