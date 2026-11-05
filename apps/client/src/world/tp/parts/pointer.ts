import { AIM_BLADE, beamOf } from "@yutopia/shared/beam";
import { type Object3D, Vector2 } from "three";
import type { Body3, ThirdPersonView } from "../view";
import { segBox } from "./common";

/** What Pointer reads of the ThirdPersonView (plan 72 phase 4: its dependencies, said). */
export type PointerHost = Pick<
  ThirdPersonView,
  | "activeAt"
  | "aim"
  | "aimDir"
  | "aimHit"
  | "aimOn"
  | "aimTurn"
  | "aimUp"
  | "armed"
  | "around"
  | "buildPick"
  | "building"
  | "camera"
  | "clampCam"
  | "dist"
  | "drag"
  | "dragged"
  | "events"
  | "flickX"
  | "follow"
  | "god"
  | "hidden"
  | "lifts3"
  | "lockAt"
  | "meId"
  | "mode"
  | "mood"
  | "mouseLook"
  | "people"
  | "people3"
  | "pets3"
  | "pitch"
  | "ray"
  | "renderer"
  | "stairs3"
  | "time"
  | "world"
  | "yaw"
>;

export class Pointer {
  constructor(private readonly c: PointerHost) {}

  // ── input ────────────────────────────────────────────────────────────────
  // two fingers: pinch to zoom (phones, tablets), as in iso
  touches = new Map<number, { x: number; y: number }>();

  pinch = 0;

  onTouch(e: PointerEvent): boolean {
    if (e.pointerType !== "touch") return false;
    if (e.type === "pointerdown" || e.type === "pointermove")
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    else this.touches.delete(e.pointerId);
    if (this.touches.size !== 2) {
      this.pinch = 0;
      return false;
    }
    const [a, b] = [...this.touches.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (this.pinch) {
      this.c.dist *= this.pinch / Math.max(1, d);
      this.c.clampCam();
    }
    this.pinch = d;
    this.c.drag = null; // no orbit (and no click) while pinching
    return true;
  }

  onDown = (e: PointerEvent) => {
    this.c.activeAt = performance.now();
    if (this.c.god) {
      this.c.renderer.domElement.setPointerCapture(e.pointerId);
      return this.c.god.input.down(e);
    }
    // the mouse is the camera (docs/plan/56-the-controls.md A): its buttons aim and fire (the
    // walker's, the dark's), and nothing in the world is clicked
    if (this.c.mouseLook.looking) return;
    if (this.onTouch(e)) return;
    // not locked yet (or Esc let it go): a click takes the pointer back — build mode's and the
    // arrival's own picking aside, which want it
    if (this.mouseCam(e)) {
      this.c.mouseLook.setLook(true);
      return;
    }
    this.c.renderer.domElement.setPointerCapture(e.pointerId);
    // build mode: the left button builds (the right one turns the camera)
    if (this.c.buildPick.buildMode && e.button === 0) {
      this.c.buildPick.buildPress = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t: performance.now() };
      const f = this.c.buildPick.buildAt(e.clientX, e.clientY);
      this.c.events.buildDown?.(f.x, f.y);
      return;
    }
    this.c.drag = { x: e.clientX, y: e.clientY, id: e.pointerId, x0: e.clientX, y0: e.clientY, t: performance.now() };
  };

  onMove = (e: PointerEvent) => {
    this.c.activeAt = performance.now();
    if (this.c.god) return this.c.god.input.move(e);
    if (this.c.mouseLook.looking) {
      // (some browsers send one huge jump as the lock starts)
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.c.dragged = this.c.time;
      if (this.c.mode === "chase" && !this.c.god && !this.c.buildPick.buildMode) {
        // the KH camera's: by how far it moved; locked on, a sideways flick is the next target
        const f = this.c.follow;
        f.yaw = this.c.yaw;
        f.pitch = this.c.pitch;
        f.mouse(e.movementX, e.movementY, !!this.c.lockAt);
        this.c.yaw = f.yaw;
        this.c.pitch = f.pitch;
        if (this.c.lockAt) this.c.flickX = this.c.flickX * 0.8 + e.movementX;
        return;
      }
      const k = 0.0024 * this.c.mouseLook.lookSens;
      this.c.yaw += e.movementX * k;
      this.c.pitch += e.movementY * k * 0.8 * (this.c.mouseLook.lookInvert ? -1 : 1);
      this.c.clampCam();
      return;
    }
    if (this.onTouch(e)) return;
    if (this.mouseCam(e)) return;
    this.c.buildPick.pointer = { x: e.clientX, y: e.clientY };
    if (this.c.buildPick.buildMode || this.c.buildPick.floorHover) {
      const f = this.c.buildPick.buildAt(e.clientX, e.clientY);
      this.c.events.buildMove?.(f.x, f.y, this.c.buildPick.pointer);
    }
    if (!this.c.drag || this.c.drag.id !== e.pointerId)
      return this.c.buildPick.buildMode ? undefined : this.hover(e.clientX, e.clientY);
    const dx = e.clientX - this.c.drag.x;
    const dy = e.clientY - this.c.drag.y;
    this.c.drag.x = e.clientX;
    this.c.drag.y = e.clientY;
    this.c.yaw += dx * 0.0055;
    this.c.pitch += dy * 0.004;
    this.c.dragged = this.c.time;
    this.c.clampCam();
  };

  onUp = (e: PointerEvent) => {
    if (this.c.god) return this.c.god.input.up(e);
    this.onTouch(e);
    if (this.mouseCam(e)) return;
    const b = this.c.buildPick.buildPress;
    if (b && b.id === e.pointerId) {
      this.c.buildPick.buildPress = null;
      const f = this.c.buildPick.buildAt(e.clientX, e.clientY);
      this.c.events.buildUp?.(f.x, f.y);
      // a click: build mode's click on the floor there (it picks what's under the pointer itself)
      if (e.type === "pointerup" && Math.hypot(e.clientX - b.x0, e.clientY - b.y0) < 6 && performance.now() - b.t < 600)
        this.c.events.floor?.(f.x, f.y);
      return;
    }
    const d = this.c.drag;
    if (d?.id !== e.pointerId) return;
    this.c.drag = null;
    // a click (not a drag): someone, or a spot on the floor (armed, the right button only aims)
    if (
      e.type === "pointerup" &&
      !(e.button === 2 && this.c.armed) &&
      Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6 &&
      performance.now() - d.t < 600
    )
      this.c.buildPick.pick(e.clientX, e.clientY, { shift: e.shiftKey, right: e.button === 2 });
  };

  /** A mouse in play: the camera's, not a pointer (touch taps and drags as it did; build mode and
   *  choosing my arrival on the floor still point). */
  mouseCam(e: PointerEvent): boolean {
    return e.pointerType === "mouse" && !this.c.buildPick.buildMode && !this.c.buildPick.floorHover;
  }

  // the nearest usable thing along the ray (its 3D box; see-through walls don't
  // stop it) — an elevator car's buttons first (you're in the car's own box)
  pickObject(): string | null {
    const btn = this.c.lifts3?.buttonPicks.length ? this.nearestPick(this.c.lifts3.buttonPicks) : null;
    if (btn) return btn;
    return this.nearestPick([...this.c.world.picks, ...(this.c.lifts3?.picks ?? []), ...this.c.stairs3.picks]);
  }

  nearestPick(
    picks: { id: string; use: boolean; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }[],
  ): string | null {
    const o = this.c.ray.ray.origin;
    const d = this.c.ray.ray.direction;
    let best: string | null = null;
    let bestT = Number.POSITIVE_INFINITY;
    for (const p of picks) {
      if (!p.use) continue;
      let t0 = 0;
      let t1 = bestT;
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
      if (ok && t0 < bestT) {
        bestT = t0;
        best = p.id;
      }
    }
    // a wall in the way (standing, not faded) hides what's behind it
    if (best !== null) {
      const hit = o.clone().addScaledVector(d, bestT);
      if (this.c.hidden(hit.x, hit.z, hit.y)) return null;
    }
    return best;
  }

  setRay(clientX: number, clientY: number) {
    const r = this.c.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.c.ray.setFromCamera(ndc, this.c.camera);
  }

  /** How far along the crosshair's line (from the camera, tiles) one of the others stands, or null. */
  personAlongLook(): number | null {
    this.c.ray.setFromCamera(new Vector2(0, 0), this.c.camera);
    let best: number | null = null;
    for (const [id, p] of this.c.people3) {
      if (id === this.c.meId) continue;
      const t = p.hitDistance(this.c.ray.ray);
      if (t !== null && (best === null || t < best)) best = t;
    }
    return best;
  }

  /** Where a shot from (x, y, z) — the floor's coords, z up — going `yaw`, `pitch` stops within `max`:
   *  the first wall (or anything solid this view fades), else the ground (the land's or the floor's);
   *  null: neither (docs/plan/32-the-arms.md: tracers that stop where the shot did). */
  rayStop(
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number,
    max: number,
  ): { t: number; what: "wall" | "ground" } | null {
    const c = Math.cos(pitch);
    const dx = Math.cos(yaw) * c;
    const dy = Math.sin(yaw) * c;
    const dz = Math.sin(pitch);
    let t = max;
    let what: "wall" | "ground" | null = null;
    const ex = x + dx * max;
    const ey = y + dy * max;
    for (const f of this.c.world.fades) {
      if (f.item) continue;
      const k = segBox(x, y, ex, ey, f.x0, f.y0, f.x1, f.y1);
      if (k === null || k <= 0.01) continue;
      const at = k * max;
      if (at < t && z + dz * at < f.top) {
        t = at;
        what = "wall";
      }
    }
    const g = this.c.around.grounds;
    for (let s = 0.3; s < t; s += 0.2) {
      const px = x + dx * s;
      const py = y + dy * s;
      const floor = g && this.c.mood.onLand(px, py) ? g.heightAt(px, py) : 0;
      if (z + dz * s <= floor) {
        t = s;
        what = "ground";
        break;
      }
    }
    return what ? { t, what } : null;
  }

  // Aiming: what the crosshair is on — the first wall beyond me, else the ground (the land's or the
  // floor's), within 16 tiles — and the turn and the pitch that point the flashlight in my hand
  // (shared beam.ts, held out) at it. Eased: the crosshair crossing an edge doesn't snap the body.
  aimFrame(dt: number, me: Body3 | undefined) {
    const was = this.c.aimOn;
    this.c.aimOn = this.c.aim && !!me;
    if (!this.c.aimOn || !me) return;
    const cam = this.c.camera.position;
    const d = this.c.camera.getWorldDirection(this.c.aimDir);
    const L = 16;
    // past me (the walls between the camera and me are faded, or behind me)
    const near = Math.max(0, (me.x - cam.x) * d.x + (me.y - cam.z) * d.z) + 0.6;
    let t = L;
    const ex = cam.x + d.x * L;
    const ez = cam.z + d.z * L;
    for (const f of this.c.world.fades) {
      if (f.item || f.alpha < 0.5) continue;
      const k = segBox(cam.x, cam.z, ex, ez, f.x0, f.y0, f.x1, f.y1);
      if (k === null) continue;
      const at = k * L;
      if (at > near && at < t && cam.y + d.y * at < f.top) t = at;
    }
    // the ground: a step at a time (the land rises and falls; a floor is 0)
    const g = this.c.around.grounds;
    for (let s = near; s < t; s += 0.25) {
      const x = cam.x + d.x * s;
      const z = cam.z + d.z * s;
      const floor = g && this.c.mood.onLand(x, z) ? g.heightAt(x, z) : 0;
      if (cam.y + d.y * s <= floor) {
        t = s;
        break;
      }
    }
    const tx = cam.x + d.x * t;
    const ty = cam.y + d.y * t;
    const tz = cam.z + d.z * t;
    this.c.aimHit.set(tx, ty, tz);
    // from the lens (held out) to there — not nearer than 2.5
    // (as the body faces: last frame's turn on the camera's)
    const o = beamOf(me.x, me.y, me.z ?? me.ground ?? 0, this.c.yaw + (was ? this.c.aimTurn : 0) + AIM_BLADE, 0, false);
    const flat = Math.max(2.5, Math.hypot(tx - o.x, tz - o.y));
    let turn = Math.atan2(tz - o.y, tx - o.x) - this.c.yaw;
    turn = Math.max(-0.35, Math.min(0.35, Math.atan2(Math.sin(turn), Math.cos(turn))));
    const up = Math.max(-0.9, Math.min(0.9, Math.atan2(ty - o.z, flat)));
    const k = was ? 1 - Math.exp(-dt * 14) : 1;
    this.c.aimTurn += (turn - this.c.aimTurn) * k;
    this.c.aimUp += (up - this.c.aimUp) * k;
  }

  // what's under the pointer: someone, or something to use
  personAt(): string | null {
    // the 3D people: the nearest one the ray passes through
    let best: { id: string; t: number } | null = null;
    for (const [id, p] of this.c.people3) {
      const t = p.hitDistance(this.c.ray.ray);
      if (t !== null && (!best || t < best.t)) best = { id, t };
    }
    if (best) return best.id;
    const planes: Object3D[] = [];
    for (const p of this.c.people.values()) if (p.plane.visible && p.root.visible) planes.push(p.plane);
    for (const hit of this.c.ray.intersectObjects(planes, false)) {
      const found = [...this.c.people].find(([, p]) => p.plane === hit.object);
      if (found && hit.uv && found[1].opaqueAt(hit.uv.x, hit.uv.y)) return found[0];
    }
    // pets: their meshes
    const roots: Object3D[] = [...this.c.pets3.values()].map((e) => e.model.root);
    const hit = this.c.ray.intersectObjects(roots, true)[0];
    if (hit) {
      let o: Object3D | null = hit.object;
      while (o && !roots.includes(o)) o = o.parent;
      if (o) return [...this.c.pets3].find(([, e]) => e.model.root === o)?.[0] ?? null;
    }
    return null;
  }

  hoverAt = 0;

  hover(clientX: number, clientY: number) {
    const now = performance.now();
    if (now - this.hoverAt < 50) return; // a few times a second is plenty
    this.hoverAt = now;
    this.setRay(clientX, clientY);
    const any = this.personAt() ?? this.pickObject();
    this.c.renderer.domElement.style.cursor = any ? "pointer" : "";
  }
}
