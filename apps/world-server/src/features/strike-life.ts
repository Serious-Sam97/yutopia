import { ANIM, faceByte } from "@yutopia/shared";
import { heightAt } from "@yutopia/shared/grounds";
import { linesFor, type NpcDef, paceOf, TALK_EVERY } from "@yutopia/shared/npc";
import { STRIKE_FOLK, STRIKE_HUB, strikePosts, strikeStops } from "@yutopia/shared/strike";
import { type Cast, dress, wire } from "../cast.ts";
import { Npc } from "../schema.ts";
import type { WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// The Strike Park's lobby has its people (docs/plan/115-the-strike-park-again.md, arc F, phases 51–52): the staff at
// their posts — the quartermaster, the instructor, the cook, the keeper, the officer — turning about, saying a line
// now and then; and the recruits walking from the yard's hub out to a door, the board, the desk, the gallery's stairs
// or the gate along that stop's own way, a while there, and back. Room NPCs (kind "folk"), drawn by the client from
// shared strike/folk.ts's looks, as the Kart Park's folk (park-life.ts).

const V = 1.3;

registerFeature((room: WorldRoom) => {
  interface Walker {
    key: string;
    npc: Npc;
    role: string;
    v: number;
    /** the points still to walk (the last where they stop) */
    leg: { x: number; z: number }[];
    /** at a stop: its way back to the hub */
    back: { x: number; z: number }[];
    until: number;
    sayAt: number;
    /** what they say on their own (EN|PT), × how long between (plan 120: the cast's) */
    lines: string[];
    talk: number;
    post?: { x: number; z: number; a: number };
  }
  const walkers: Walker[] = [];
  const posts = strikePosts();
  const stops = strikeStops();
  const now0 = Date.now();
  // (plan 120) made from the world's cast by key — someone deleted from it isn't —, dressed as it says; live
  const fit = (w: Walker, d: NpcDef) => {
    dress(w.npc, d);
    w.v = V * paceOf(d);
    w.lines = linesFor(d);
    w.talk = TALK_EVERY[d.behaviour.talk];
  };
  const make = (k: number, f: (typeof STRIKE_FOLK)[number], d: NpcDef, now: number) => {
    const npc = new Npc();
    npc.id = `strike-${f.id}`;
    npc.kind = "folk";
    npc.level = 0;
    const post = f.role === "recruit" ? undefined : posts[f.role];
    const at = post ?? { x: STRIKE_HUB.x + (k % 3) * 1.5, z: STRIKE_HUB.z + (k % 2) * 1.2, a: 0 };
    Object.assign(npc, {
      x: at.x,
      y: at.z,
      z: heightAt(at.x, at.z),
      a: ANIM.idle,
      yaw: faceByte(Math.cos(at.a), Math.sin(at.a)),
    });
    const w: Walker = {
      key: npc.id,
      npc,
      role: f.role,
      v: V,
      leg: [],
      back: [],
      until: now + 2000 + k * 2500,
      sayAt: now + 15_000 + Math.random() * 45_000,
      lines: [],
      talk: 1,
      post,
    };
    fit(w, d);
    room.state.npcs.set(npc.id, npc);
    walkers.push(w);
  };
  const cast = (_c: Cast, now: number) => {
    for (let i = walkers.length - 1; i >= 0; i--) {
      const d = room.castFree(walkers[i].key);
      if (d) fit(walkers[i], d);
      else {
        room.state.npcs.delete(walkers[i].npc.id);
        walkers.splice(i, 1);
      }
    }
    STRIKE_FOLK.forEach((f, k) => {
      const d = room.castFree(`strike-${f.id}`);
      if (d && !walkers.some((w) => w.key === d.key)) make(k, f, d, now);
    });
  };
  cast(room.cast, now0);
  const pick = <T>(l: T[]): T => l[Math.floor(Math.random() * l.length)];

  return {
    tick(dt: number, now: number) {
      for (const w of walkers) {
        const n = w.npc;
        // a line now and then (the staff more often: they're talking to whoever's about)
        if (now >= w.sayAt) {
          // (nothing to say, or never talks: asked again in a minute)
          if (!w.lines.length || !Number.isFinite(w.talk)) w.sayAt = now + 60_000;
          else {
            n.say = wire(pick(w.lines));
            n.sayAt = now;
            w.sayAt = now + ((w.post ? 25_000 : 40_000) + Math.random() * 40_000) * w.talk;
          }
        }
        if (w.post) {
          // (the staff turn about at their post: to the yard, now and then aside)
          if (now >= w.until) {
            w.until = now + 6000 + Math.random() * 9000;
            const a = w.post.a + (Math.random() - 0.5) * 1.6;
            n.yaw = faceByte(Math.cos(a), Math.sin(a), n.yaw);
          }
          continue;
        }
        if (!w.leg.length) {
          if (now < w.until) {
            if (n.a !== ANIM.idle) n.a = ANIM.idle;
            continue;
          }
          if (w.back.length) {
            // back to the hub the way they came
            w.leg = [
              ...w.back.slice(0, -1).reverse(),
              { x: STRIKE_HUB.x + (Math.random() - 0.5) * 6, z: STRIKE_HUB.z + (Math.random() - 0.5) * 2 },
            ];
            w.back = [];
          } else {
            const s = pick(stops);
            w.leg = s.way.map((p) => ({ ...p }));
            w.back = s.way.map((p) => ({ ...p }));
          }
        }
        const to = w.leg[0];
        const dx = to.x - n.x;
        const dz = to.z - n.y;
        const d = Math.hypot(dx, dz);
        const step = w.v * dt;
        if (d <= step) {
          n.x = to.x;
          n.y = to.z;
          w.leg.shift();
          if (!w.leg.length) {
            n.a = ANIM.idle;
            w.until = now + (w.back.length ? 8000 + Math.random() * 14000 : 3000 + Math.random() * 6000);
          }
        } else {
          n.x += (dx / d) * step;
          n.y += (dz / d) * step;
          n.a = ANIM.walk;
          n.yaw = faceByte(dx, dz, n.yaw);
        }
        n.z = heightAt(n.x, n.y);
      }
    },
    cast(c) {
      cast(c, Date.now());
    },
    dispose() {
      for (const w of walkers) room.state.npcs.delete(w.npc.id);
    },
  };
});
