import { type BufferGeometry, Group, type Material, Mesh } from "three";
import type { LiveAnim, LivePart } from "./kit";

// Live parts (docs/plan/68-more-furniture.md, phase 0/1): the moving bits of a model — a lava
// lamp's blobs, a fire's flames, a fan's blades — as meshes of their own, moved each frame round
// where they rest. The model's still parts stay in the merged buffers; these are few and small.

/** A model's live parts as a group, at the model's own frame (place the group as the model is). */
export function liveGroup(geo: BufferGeometry, lit: Material, glow: Material, glass: Material): Group | null {
  const parts = (geo.userData.live as LivePart[] | undefined) ?? [];
  if (!parts.length) return null;
  const g = new Group();
  for (const p of parts) {
    const m = new Mesh(p.geo, p.glass ? glass : p.glow ? glow : lit);
    // (the glass drawn after what's inside it)
    if (p.glass) m.renderOrder = 2;
    m.position.set(...p.at);
    m.rotation.set(p.rot[0], p.rot[1], p.rot[2], "YXZ");
    m.userData.live = p;
    m.castShadow = !p.glow && !p.glass;
    g.add(m);
  }
  return g;
}

// a smooth wobble in −1..1 (two sines, out of step)
const wob = (t: number) => 0.6 * Math.sin(t) + 0.4 * Math.sin(t * 2.37 + 1.3);

/** Where a live part is at time `t` (s): its offset, turn and scale over its rest. */
export function liveAt(
  a: LiveAnim,
  t: number,
): { dy: number; turn: [number, number]; scale: [number, number, number]; shown?: boolean } {
  switch (a.kind) {
    case "lava": {
      const k = t / a.period + a.phase;
      const u = 0.5 - 0.5 * Math.cos(k * Math.PI * 2);
      const v = Math.abs(Math.sin(k * Math.PI * 2)); // (fastest midway: stretched most)
      const sy = 1 + 0.35 * v;
      const sx = 1 / Math.sqrt(sy);
      return { dy: a.lo + (a.hi - a.lo) * u, turn: [0, 0], scale: [sx, sy, sx] };
    }
    case "flame": {
      const f = wob(t * 9 + a.phase * 7);
      const sy = 0.85 + 0.25 * f + 0.1 * Math.sin(t * 23 + a.phase * 3);
      return { dy: 0, turn: [0, 0.14 * wob(t * 3.3 + a.phase * 5)], scale: [1 - 0.08 * f, sy, 1 - 0.08 * f] };
    }
    case "spin":
      return { dy: 0, turn: a.axis === "y" ? [t * a.speed, 0] : [0, t * a.speed], scale: [1, 1, 1] };
    case "still":
      return { dy: 0, turn: [0, 0], scale: [1, 1, 1] };
    case "nod":
      return {
        dy: 0,
        turn: [0, a.amp * Math.sin(((t / a.period + a.phase) % 1) * Math.PI * 2)],
        scale: [1, 1, 1],
      };
    case "swirl":
      return {
        dy: a.bob * Math.sin((t / a.period + a.phase) * Math.PI * 2),
        turn: [t * a.speed, 0],
        scale: [1, 1, 1],
      };
    case "clock": {
      const d = new Date();
      const s =
        a.zone === undefined
          ? d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000
          : Date.now() / 1000 + a.zone * 3600;
      return {
        dy: 0,
        turn: [0, -((((s % a.period) + a.period) % a.period) / a.period) * Math.PI * 2],
        scale: [1, 1, 1],
      };
    }
    case "blink": {
      // (shown or not: a set of bulbs lit together over their unlit glass)
      const k = (((t / a.period + a.phase) % 1) + 1) % 1;
      return { dy: 0, turn: [0, 0], scale: [1, 1, 1], shown: k < a.on };
    }
  }
}

/** Move a live group's parts to time `t` (s). */
export function animateLive(group: Group, t: number): void {
  for (const m of group.children) {
    const p = m.userData.live as LivePart;
    const at = liveAt(p.anim, t);
    m.position.set(p.at[0], p.at[1] + at.dy, p.at[2]);
    m.rotation.set(p.rot[0], p.rot[1] + at.turn[0], p.rot[2] + at.turn[1], "YXZ");
    m.scale.set(...at.scale);
    m.visible = at.shown ?? true;
  }
}
