import { tileInMap } from "@yutopia/shared";
import type { Object3D } from "three";
import type { BuildLayer, BuildLook } from "../build3d";
import type { ThirdPersonView } from "../view";

/** What BuildPick reads of the ThirdPersonView (plan 72 phase 4: its dependencies, said). */
export type BuildPickHost = Pick<
  ThirdPersonView,
  "camera" | "events" | "landAt" | "map" | "mouseLook" | "pointerPart" | "ray" | "toys3" | "world"
>;

export class BuildPick {
  constructor(private readonly c: BuildPickHost) {}

  // ── build mode ─────────────────────────────────────────────────────────────
  buildMode = false;

  buildPress: { id: number; x0: number; y0: number; t: number } | null = null;

  pointer = { x: 0, y: 0 };

  buildLook: BuildLook | null = null;

  builder!: BuildLayer; // (made by the view's constructor)

  // what build mode shows (and my arrival pin, outside it too: `on` false)
  setBuild(look: BuildLook | null, on = !!look) {
    if (on) this.c.mouseLook.setLook(false);
    this.buildMode = on;
    this.buildLook = look;
  }

  // the floor under the pointer wanted outside build mode too (picking my arrival point)
  floorHover = false;

  // the floor under a point of the screen (tiles), or null looking up; `h`:
  // the point at that height instead (on a surface that high, in tiles)
  // The ray through a screen point, from the camera (world metres, z up).
  rayAt(
    clientX: number,
    clientY: number,
  ): { o: { x: number; y: number; z: number }; d: { x: number; y: number; z: number } } {
    this.c.pointerPart.setRay(clientX, clientY);
    const o = this.c.ray.ray.origin;
    const d = this.c.ray.ray.direction;
    return { o: { x: o.x, y: o.z, z: o.y }, d: { x: d.x, y: d.z, z: d.y } };
  }

  // The walls this view looks through now (faded runs): "h3,4" keys.
  /** A wall at (x, y) is looked through right now (cut away or faded for the view: any wall — the
   *  free ones too, plan 72 phase 11). */
  throughAt(x: number, y: number): boolean {
    for (const f of this.c.world.fades)
      if (!f.item && f.alpha < 0.5 && x >= f.x0 - 0.15 && x <= f.x1 + 0.15 && y >= f.y0 - 0.15 && y <= f.y1 + 0.15)
        return true;
    return false;
  }
  lookedThrough(): Set<string> {
    const out = new Set<string>();
    for (const f of this.c.world.fades) {
      if (f.item || f.alpha >= 0.5) continue;
      if (f.y1 - f.y0 < 0.5) {
        const y = Math.round((f.y0 + f.y1) / 2);
        for (let x = Math.floor(f.x0 + 0.2); x < f.x1 - 0.2; x++) out.add(`h${x},${y}`);
      } else if (f.x1 - f.x0 < 0.5) {
        const x = Math.round((f.x0 + f.x1) / 2);
        for (let y = Math.floor(f.y0 + 0.2); y < f.y1 - 0.2; y++) out.add(`v${x},${y}`);
      }
    }
    return out;
  }

  // Where build mode's pointer is on the floor. Pointing above the horizon (high
  // up a wall, the camera low) there's no floor under it: the last floor point
  // then, so presses, drags and clicks still reach build mode (a wall item in
  // hand goes by the pointer's ray anyway).
  lastBuildFloor: { x: number; y: number } | null = null;

  buildAt(clientX: number, clientY: number): { x: number; y: number } {
    const f = this.floorAt(clientX, clientY);
    if (f) this.lastBuildFloor = f;
    if (f ?? this.lastBuildFloor) return (f ?? this.lastBuildFloor) as { x: number; y: number };
    const c = this.c.camera.position;
    return { x: c.x, y: c.z };
  }

  floorAt(clientX: number, clientY: number, h = 0): { x: number; y: number } | null {
    this.c.pointerPart.setRay(clientX, clientY);
    const o = this.c.ray.ray.origin;
    const d = this.c.ray.ray.direction;
    if (d.y >= -1e-4 || o.y <= h) return null;
    const t = (h - o.y) / d.y;
    return { x: o.x + d.x * t, y: o.z + d.z * t };
  }

  // Everything under the pointer, front first (build mode's pick: furniture and
  // the rooms' clutter, as the iso engine's `picksAt`).
  picksAtPointer(): { id: string; dress: boolean; kind?: string; t: number }[] {
    this.c.pointerPart.setRay(this.pointer.x, this.pointer.y);
    const o = this.c.ray.ray.origin;
    const d = this.c.ray.ray.direction;
    const out: { id: string; dress: boolean; kind?: string; t: number }[] = [];
    for (const p of this.c.world.picks) {
      let t0 = 0;
      let t1 = Number.POSITIVE_INFINITY;
      let ok = true;
      for (const [oa, da, lo, hi] of [
        [o.x, d.x, p.x0, p.x1],
        [o.y, d.y, p.z0, p.z1],
        [o.z, d.z, p.y0, p.y1],
      ]) {
        if (Math.abs(da) < 1e-9) {
          if (oa < lo || oa > hi) ok = false;
          continue;
        }
        let a = (lo - oa) / da;
        let b = (hi - oa) / da;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
        if (t0 > t1) ok = false;
      }
      if (ok) out.push({ id: p.id, dress: !!p.dress, kind: p.dress?.kind, t: t0 });
    }
    // small things on a surface first (as iso: a mug wins over its desk), then nearest
    return out.sort((a, b) => a.t - b.t);
  }

  pick(clientX: number, clientY: number, mods?: { shift: boolean; right: boolean }) {
    this.c.pointerPart.setRay(clientX, clientY);
    // the nearest drawing actually under the pointer (not a plane's empty margin)
    const who = this.c.pointerPart.personAt();
    if (who) return this.c.events.person?.(who, { x: clientX, y: clientY });
    const toyHit = this.c.ray.intersectObjects(
      [...this.c.toys3.values()].map((t) => t.root),
      true,
    )[0];
    if (toyHit) {
      let o: Object3D | null = toyHit.object;
      while (o?.parent && !o.userData.toyId) o = o.parent;
      if (o?.userData.toyId) return this.c.events.toy?.(o.userData.toyId as string);
    }
    const hitObj = this.c.pointerPart.pickObject();
    if (hitObj) return this.c.events.object?.(hitObj, { x: clientX, y: clientY });
    const o = this.c.ray.ray.origin;
    const dir = this.c.ray.ray.direction;
    if (dir.y >= -1e-4) return;
    // out on the land (the ground floor): where the ray meets the ground
    const land = this.c.landAt(o, dir);
    if (land) return this.c.events.floor?.(land.x, land.y, mods);
    const t = -o.y / dir.y;
    const x = o.x + dir.x * t;
    const y = o.z + dir.z * t;
    if (tileInMap(this.c.map, x, y)) this.c.events.floor?.(x, y, mods);
  }
}
