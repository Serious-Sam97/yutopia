// (plan 123) A hug, a kiss on the cheek, a handshake: the two drawn close enough for it. The server keeps them where
// they stood (a chat's ~1 m apart, a player within reach), so for the act's length each is drawn stepped half the
// way in along the line between them — eased in, eased out, drawn only — and the arms are aimed at where the other
// one is then (`actTo`, straight ahead: each turned to face the other for it, eased the same way).

// how far apart the two are drawn for it (m, middle to middle)
export const CLOSE_GAP: Record<string, number> = { hug: 0.4, kiss: 0.5, handshake: 0.74 };
// (eased over its first and last 0.35 s; its length, s)
const EASE_S = 0.35;
const CLOSE_LEN: Record<string, number> = { hug: 2.6, kiss: 1.6, handshake: 1.8 };
// (farther apart than this they're not drawn in: a stale act, a teleport)
const MAX_D = 2.4;

export interface CloseBody {
  id: string;
  x: number;
  y: number;
  level?: number;
  act?: string;
  actAt?: number;
  actWith?: string;
  actTo?: number;
  yaw: number; // facing, world radians (atan2 of the floor's direction)
  angle?: number; // …turned freely
}

const smooth = (k: number) => {
  const c = Math.max(0, Math.min(1, k));
  return c * c * (3 - 2 * c);
};

/** The bodies with those in a close act drawn in to each other (new objects for those; the rest as they were).
 *  `seen` keeps when each act was first drawn (by `id|actAt`): pass the same map every frame. `now` in s. */
export function closeIn<B extends CloseBody>(bodies: B[], now: number, seen: Map<string, number>): B[] {
  let any = false;
  for (const b of bodies)
    if (b.act && CLOSE_GAP[b.act] !== undefined && b.actWith) {
      any = true;
      break;
    }
  if (!any) {
    if (seen.size) seen.clear();
    return bodies;
  }
  const byId = new Map<string, B>();
  for (const b of bodies) byId.set(b.id, b);
  const live = new Set<string>();
  const out = bodies.map((b) => {
    const gap = b.act ? CLOSE_GAP[b.act] : undefined;
    if (gap === undefined || !b.act || !b.actWith) return b;
    // (the other one: a player by their session, an NPC by its id — drawn as `npc:<id>`)
    const o = byId.get(b.actWith) ?? byId.get(`npc:${b.actWith}`);
    if (!o || o.act !== b.act || (o.level ?? 0) !== (b.level ?? 0)) return b;
    const key = `${b.id}|${b.actAt ?? 0}`;
    live.add(key);
    let from = seen.get(key);
    if (from === undefined) {
      from = now;
      seen.set(key, from);
    }
    const t = now - from;
    const len = CLOSE_LEN[b.act] ?? 2;
    const w = smooth(t / EASE_S) * (1 - smooth((t - (len - EASE_S)) / EASE_S));
    const dx = o.x - b.x;
    const dy = o.y - b.y;
    const d = Math.hypot(dx, dy);
    // (too far apart — a stale act, a teleport —, or on top of each other: left as they are, their own reach)
    if (d > MAX_D || d < 1e-3) return b;
    const step = (Math.max(0, d - gap) / 2) * w;
    // (turned to them: the short way round, eased with the step)
    const had = b.angle ?? b.yaw;
    const turn = Math.atan2(Math.sin(Math.atan2(dy, dx) - had), Math.cos(Math.atan2(dy, dx) - had));
    return {
      ...b,
      x: b.x + (dx / d) * step,
      y: b.y + (dy / d) * step,
      angle: had + turn * w,
      actTo: d - 2 * step,
    };
  });
  for (const k of seen.keys()) if (!live.has(k)) seen.delete(k);
  return out;
}
