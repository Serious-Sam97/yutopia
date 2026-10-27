import { ANIM, dirFromDelta, GROUND_OFFSET } from "@yutopia/shared";
import { heightAt } from "@yutopia/shared/grounds";
import {
  KART_DESK,
  KART_FOLK,
  KART_GATE,
  KART_RACK,
  KART_SITTING,
  KART_STANDS,
  KART_THINGS,
  type KartSeat,
  kartSeats,
  SIT_HIP,
} from "@yutopia/shared/kart";
import { Npc, type Player } from "../schema.ts";
import type { WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// The Kart Park's seats and its people (docs/plan/46-the-karts.md, "the park's people"): sit on a
// stand's row or a bench by the fire (X by one: you're posed on it, here, till you get up); and
// the folk who are always about — Rosa of race control by the desk, Joe at the kart up on
// its stand, Lia at the cocoa cart, and four visitors going between the cocoa, the fire's
// benches, the rack, the stands and the podium (sitting where there's room). Walked in straight
// legs along the paddock's walk from the gate (shared: clear of everything), as the night guard
// is (grounds-life.ts).

const off = GROUND_OFFSET; // (a player's x, y + off: the Grounds' coords)
const SITTING = KART_SITTING; // (busy "ride:…": the room leaves my pose alone, as a rider's)
const V = 1.25; // a visitor's pace, m/s
const SPINE = KART_GATE.x; // the paddock's walk, gate to desk
const FOLK_LINES: Record<string, string[]> = {
  control: [
    "Karts are on the rack: X at the desk takes one.",
    "Next race is up to you: a Grand Prix or the Bowl.",
    "Vortex holds the lap record. For now.",
    "Mind the jump on the north straight!",
  ],
  mechanic: ["She pulls left. Always pulls left.", "Who put snow in the carburettor?", "Tyres are warm. Go on."],
  cocoa: ["Hot cocoa! Marshmallows on top.", "Warm your hands by the fire.", "A free cocoa for whoever beats Vortex."],
  visitor: [
    "Did you see that drift?",
    "I'm doing the Bowl next.",
    "Brr. Cocoa?",
    "That jump, though!",
    "Purple sparks!",
  ],
};

registerFeature((room: WorldRoom) => {
  const seats = kartSeats();
  const taken = new Map<number, string>(); // seat → who (a session, or "npc:" an id)
  const sync = () => {
    const park = room.state.karts.get("park");
    if (park) park.seats = [...taken.keys()].sort((a, b) => a - b).join(",");
  };
  const seatZ = (s: KartSeat) => heightAt(s.x, s.z) + s.top - SIT_HIP;
  const fire = KART_THINGS.find((t) => t.kind === "fire") ?? { x: 0, z: 0, hx: 0, hz: 0 };
  const stand = KART_THINGS.find((t) => t.kind === "stand") ?? fire;
  const cocoa = KART_THINGS.find((t) => t.kind === "cocoa") ?? fire;
  const podium = KART_THINGS.find((t) => t.kind === "podium") ?? fire;

  // ── anyone sitting down ──
  const pose = (p: Player, i: number) => {
    const s = seats[i];
    p.x = s.x - off.x;
    p.y = s.z - off.y;
    p.z = seatZ(s);
    p.level = 0;
    p.a = ANIM.sit;
    p.d = dirFromDelta(Math.cos(s.a), Math.sin(s.a), p.d as 0);
  };
  // (`walk`: walked off it, as off the office's bench — they go on from the seat, no snap)
  const standUp = (sid: string, snap = true, walk = false) => {
    for (const [i, who] of taken)
      if (who === sid) {
        taken.delete(i);
        const p = room.state.players.get(sid);
        if (p && p.busy === SITTING && walk) {
          p.busy = "";
          p.a = ANIM.idle;
          p.z = heightAt(seats[i].x, seats[i].z);
        } else if (p && p.busy === SITTING) {
          const [x, z] = seats[i].out;
          p.busy = "";
          p.a = ANIM.idle;
          p.x = x - off.x;
          p.y = z - off.y;
          p.z = heightAt(x, z);
          const c = room.clients.getById(sid);
          if (c && snap) room.send(c, "snap", { x: p.x, y: p.y, z: p.z, level: p.level });
        }
      }
    sync();
  };
  /** In reach of a seat: a bench's, by it; a stand's, at its front or its ends, abreast of it. */
  const reaches = (p: Player, s: KartSeat) => {
    const x = p.x + off.x;
    const z = p.y + off.y;
    if (s.stand === undefined) return Math.hypot(x - s.x, z - s.z) < 2.2;
    const st = KART_STANDS[s.stand];
    return Math.abs(x - s.x) < 2.6 && z > st.z - 3 && z < st.z + st.rows * 1.2 + 1.5;
  };
  room.on("park:sit", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const i = Number(m?.i);
    const s = seats[i];
    if (!p || !s || s.crowd || taken.has(i) || p.level !== 0) return;
    if (p.busy || p.downAt || p.fellAt || !reaches(p, s)) return;
    taken.set(i, client.sessionId);
    p.busy = SITTING;
    pose(p, i);
    sync();
  });
  room.on("park:stand", (client, m) => standUp(client.sessionId, true, !!m?.walk));

  // ── the folk ──
  type Stop = "cocoa" | "fire" | "rack" | "stands" | "podium";
  interface Walker {
    npc: Npc;
    role: string;
    leg: { x: number; z: number }[];
    /** where they are: a stop, and how they got there from the walk (back the same way) */
    stop: Stop | "";
    from: { x: number; z: number }[];
    until: number;
    seat: number;
    sayAt: number;
    /** staff: their spots, turned which way */
    spots?: { x: number; z: number; a: number }[];
  }
  const walkers: Walker[] = [];
  const now0 = Date.now();
  for (const [k, f] of KART_FOLK.entries()) {
    const npc = new Npc();
    npc.id = `folk-${f.id}`;
    npc.kind = "folk";
    npc.level = 0;
    const spots =
      f.role === "control"
        ? [{ x: KART_DESK.x + 0.3 * KART_DESK.face, z: KART_DESK.z - 2.6, a: Math.PI / 4 }]
        : f.role === "mechanic"
          ? [
              { x: stand.x - 0.4, z: stand.z + 1.2, a: -Math.PI / 2 },
              { x: stand.x + stand.hx + 0.7, z: stand.z + 0.2, a: Math.PI },
            ]
          : f.role === "cocoa"
            ? [{ x: cocoa.x + 0.4, z: cocoa.z - cocoa.hz - 0.5, a: 0.4 }]
            : undefined;
    // (visitors start about the walk, spread out)
    const at = spots?.[0] ?? { x: SPINE + (k % 2 ? 1 : -1), z: KART_GATE.z - 8 - k * 9, a: -Math.PI / 2 };
    Object.assign(npc, {
      x: at.x - off.x,
      y: at.z - off.y,
      a: ANIM.idle,
      d: dirFromDelta(Math.cos(at.a), Math.sin(at.a), 0),
    });
    room.state.npcs.set(npc.id, npc);
    walkers.push({
      npc,
      role: f.role,
      leg: [],
      stop: "",
      from: [],
      // (the visitors set off one after another)
      until: now0 + 1500 + Math.max(0, k - 3) * 3000,
      seat: -1,
      sayAt: now0 + 20_000 + Math.random() * 60_000,
      spots,
    });
  }
  const pick = <T>(l: T[]): T => l[Math.floor(Math.random() * l.length)];
  /** A free seat for a visitor: a bench by the fire (the two along the walk's side of it and
   *  across), or the nearer stand's two lowest rows (climbed to from its front). */
  const freeSeat = (kind: "fire" | "stands"): number => {
    const list = seats
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) =>
        kind === "fire"
          ? s.stand === undefined && s.a !== -Math.PI / 2 && s.a !== Math.PI / 2 && !taken.has(i)
          : s.stand === 0 && (s.row ?? 9) < 2 && !s.crowd && !taken.has(i),
      );
    return list.length ? pick(list).i : -1;
  };
  /** Off the walk to a stop: the points from the walk out to it (the last its spot). */
  const route = (w: Walker, stop: Stop): { x: number; z: number }[] | null => {
    if (stop === "cocoa")
      return [
        { x: SPINE, z: cocoa.z + (Math.random() - 0.5) },
        { x: cocoa.x + cocoa.hx + 1, z: cocoa.z + (Math.random() - 0.5) },
      ];
    if (stop === "podium") {
      const z = podium.z + podium.hz + 1.2 + Math.random();
      return [
        { x: SPINE, z },
        { x: podium.x + (Math.random() - 0.5) * 4, z },
      ];
    }
    if (stop === "rack") {
      const z = KART_RACK.z0 + Math.floor(Math.random() * KART_RACK.n) * KART_RACK.dz + 0.6;
      return [
        { x: SPINE, z },
        { x: KART_RACK.x + 4.4, z },
      ];
    }
    const i = freeSeat(stop);
    if (i < 0) return null;
    w.seat = i;
    taken.set(i, `npc:${w.npc.id}`);
    sync();
    const s = seats[i];
    if (stop === "fire") {
      const gap = { x: fire.x, z: fire.z + 3.4 };
      return [{ x: SPINE, z: gap.z }, gap, { x: s.out[0], z: s.out[1] }];
    }
    const st = KART_STANDS[0];
    const end = st.x1 + 1.5;
    return [
      { x: SPINE, z: KART_GATE.z - 4 },
      { x: end, z: KART_GATE.z - 4 },
      { x: end, z: s.out[1] },
      { x: s.out[0], z: s.out[1] },
    ];
  };
  const facing: Record<Stop, number> = { cocoa: Math.PI, podium: -Math.PI / 2, rack: Math.PI, fire: 0, stands: 0 };
  const walk = (w: Walker, dt: number): boolean => {
    const t = w.leg[0];
    if (!t) return true;
    const n = w.npc;
    const gx = n.x + off.x;
    const gz = n.y + off.y;
    const d = Math.hypot(t.x - gx, t.z - gz);
    const step = V * dt;
    n.a = ANIM.walk;
    n.z = 0;
    if (d <= step) {
      n.x = t.x - off.x;
      n.y = t.z - off.y;
      w.leg.shift();
      return w.leg.length === 0;
    }
    n.x += ((t.x - gx) / d) * step;
    n.y += ((t.z - gz) / d) * step;
    n.d = dirFromDelta((t.x - gx) / d, (t.z - gz) / d, n.d as 0);
    return false;
  };
  const say = (w: Walker, now: number) => {
    if (now < w.sayAt) return;
    w.sayAt = now + 50_000 + Math.random() * 70_000;
    const x = w.npc.x;
    const y = w.npc.y;
    let near = false;
    room.state.players.forEach((p) => {
      if (p.level === 0 && Math.hypot(p.x - x, p.y - y) < 10) near = true;
    });
    if (!near) return;
    w.npc.say = pick(FOLK_LINES[w.role] ?? FOLK_LINES.visitor);
    w.npc.sayAt = now;
  };
  const racing = () => {
    const ph = room.state.karts.get("park")?.phase;
    return !!ph && ph !== "lobby";
  };

  return {
    tick(dt, now) {
      // the seated: still mine? (a kart, a teleport, a fall took them off it)
      for (const [i, who] of taken) {
        if (who.startsWith("npc:")) continue;
        const p = room.state.players.get(who);
        if (!p || p.busy !== SITTING) {
          taken.delete(i);
          sync();
        } else pose(p, i);
      }
      for (const w of walkers) {
        const n = w.npc;
        say(w, now);
        // staff: at their spot, now and then the other
        if (w.spots) {
          if (w.leg.length) {
            if (walk(w, dt)) n.a = ANIM.idle;
            continue;
          }
          const sp = w.spots.find((s) => Math.hypot(s.x - off.x - n.x, s.z - off.y - n.y) < 0.2) ?? w.spots[0];
          n.a = ANIM.idle;
          n.d = dirFromDelta(Math.cos(sp.a), Math.sin(sp.a), n.d as 0);
          if (w.spots.length > 1 && now > w.until) {
            const next = w.spots[(w.spots.indexOf(sp) + 1) % w.spots.length];
            w.leg = [{ x: next.x, z: next.z }];
            w.until = now + 20_000 + Math.random() * 25_000;
          }
          continue;
        }
        // visitors: walking somewhere, or there till it's time to go on
        if (w.leg.length) {
          if (!walk(w, dt)) continue;
          // arrived: sit down, or stand looking at it
          if (w.seat >= 0) {
            const s = seats[w.seat];
            n.x = s.x - off.x;
            n.y = s.z - off.y;
            n.z = seatZ(s);
            n.a = ANIM.sit;
            n.d = dirFromDelta(Math.cos(s.a), Math.sin(s.a), n.d as 0);
          } else {
            n.a = ANIM.idle;
            const a = facing[w.stop as Stop] ?? 0;
            n.d = dirFromDelta(Math.cos(a), Math.sin(a), n.d as 0);
          }
          continue;
        }
        if (now < w.until) continue;
        // on to the next: off the seat, back to the walk the way they came, out to the next
        const choices: Stop[] = ["cocoa", "fire", "rack", "stands", "podium"];
        if (racing()) choices.push("stands", "stands");
        let next = pick(choices.filter((c) => c !== w.stop));
        const back = [...w.from].reverse();
        if (w.seat >= 0) {
          const s = seats[w.seat];
          taken.delete(w.seat);
          w.seat = -1;
          n.x = s.out[0] - off.x;
          n.y = s.out[1] - off.y;
          n.z = 0;
          sync();
        }
        let out = route(w, next);
        if (!out) {
          next = "cocoa";
          out = route(w, next);
        }
        if (!out) continue;
        w.leg = [...back.slice(1), ...out];
        w.from = out;
        w.stop = next;
        w.until =
          now +
          1000 *
            (next === "stands"
              ? 60 + Math.random() * 90
              : next === "fire"
                ? 40 + Math.random() * 50
                : next === "cocoa"
                  ? 15 + Math.random() * 15
                  : 10 + Math.random() * 15);
        // (the time there starts once they're there: walking's on top)
        let len = 0;
        let [px, pz] = [n.x + off.x, n.y + off.y];
        for (const q of w.leg) {
          len += Math.hypot(q.x - px, q.z - pz);
          [px, pz] = [q.x, q.z];
        }
        w.until += (len / V) * 1000;
      }
    },
    leave(client) {
      standUp(client.sessionId, false);
    },
    dispose() {
      for (const w of walkers) room.state.npcs.delete(w.npc.id);
    },
  };
});
