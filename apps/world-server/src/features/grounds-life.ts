import { ANIM, dirFromDelta, GROUND_OFFSET, levelMap } from "@yutopia/shared";
import { along, GUARD_ROUND, heightAt, type Route, SHUTTLE, VISITOR } from "@yutopia/shared/grounds";
import { config } from "../config.ts";
import { Npc, type Player, Vehicle } from "../schema.ts";
import type { WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// Life on the Grounds (docs/plan/27-the-grounds.md, phase 6), driven here so
// everyone sees the same: the visitor's car comes down the driveway now and
// then, parks in its bay by the doors and leaves (it stops for whoever's in
// its way, and honks); the shuttle runs between the headquarters and the town
// square — get on at a stop, ride it, get off at the other; a night guard walks
// the fence and says nothing. Positions are the building's coords (shared
// grounds.ts); people's are the ground floor's (the building's less GROUND_OFFSET).

// (YUTOPIA_LIFE_FAST: the tests' — a trip in seconds, not minutes)
const FAST = process.env.YUTOPIA_LIFE_FAST === "1";
const ACCEL = FAST ? 60 : 3; // tiles/s²
const BRAKE = FAST ? 120 : 9;
const SHUTTLE_V = FAST ? 120 : 10;
const VISITOR_V = 7;
const LOT_V = 3;
const STOP_MS = FAST ? 2500 : 25_000; // the shuttle at a stop
const BOARD_REACH = 6;
const GUARD_V = 1.25;
export const RIDING = "ride:shuttle";

interface Drive {
  veh: Vehicle;
  route: Route;
  s: number;
  dir: 1 | -1; // along the route or backing up it
  blockedFor: number;
}

registerFeature((room: WorldRoom) => {
  const has = () => !!levelMap(room.map, 0);
  const off = GROUND_OFFSET;
  const make = (id: string, kind: string) => {
    const v = new Vehicle();
    v.id = id;
    v.kind = kind;
    room.state.vehicles.set(id, v);
    return v;
  };
  const visitor: Drive = { veh: make("visitor", "visitor"), route: VISITOR.in, s: 0, dir: 1, blockedFor: 0 };
  const shuttle: Drive = { veh: make("shuttle", "shuttle"), route: SHUTTLE.there, s: 0, dir: 1, blockedFor: 0 };
  let vPhase: "away" | "in" | "park" | "back" | "out" = "away";
  let vUntil = Date.now() + 30_000;
  let sUntil = Date.now() + STOP_MS;
  shuttle.veh.stop = "hq";
  {
    const at = along(SHUTTLE.there, 0);
    Object.assign(shuttle.veh, { x: at.x, z: at.z, a: at.a });
  }
  const riders = new Set<string>();

  const guard = new Npc();
  guard.id = "guard";
  guard.kind = "guard";
  guard.level = 0;
  room.state.npcs.set("guard", guard);
  let gS = Math.random() * GUARD_ROUND.len;
  let gPause = 0;

  // people out on the ground floor, in the building's coords
  const outside = () =>
    [...room.state.players.values()]
      .filter((p) => p.level === 0 && p.busy !== RIDING)
      .map((p) => ({ x: p.x + off.x, z: p.y + off.y }));
  // someone in the way: just ahead of it (the way it's going)
  const blocked = (d: Drive, people: { x: number; z: number }[]) => {
    const { x, z } = d.veh;
    const a = along(d.route, d.s).a;
    const fa = d.dir > 0 ? a : a + Math.PI;
    const ax = x + Math.cos(fa) * 3.6;
    const az = z + Math.sin(fa) * 3.6;
    return people.some(
      (p) => Math.hypot(p.x - ax, p.z - az) < 2.4 && (p.x - x) * Math.cos(fa) + (p.z - z) * Math.sin(fa) > 0,
    );
  };
  // along its route at up to `top`, easing to a stop at the end; true at the end
  const drive = (d: Drive, top: number, dt: number, now: number, people: { x: number; z: number }[]) => {
    const left = d.dir > 0 ? d.route.len - d.s : d.s;
    const want = blocked(d, people) ? 0 : Math.min(top, Math.sqrt(2 * BRAKE * 0.5 * Math.max(0, left)) + 0.4);
    const v = Math.abs(d.veh.v);
    const nv = want < v ? Math.max(want, v - BRAKE * dt) : Math.min(want, v + ACCEL * dt);
    d.veh.v = nv * d.dir;
    d.s = Math.max(0, Math.min(d.route.len, d.s + nv * d.dir * dt));
    // held up: a honk (not too often)
    d.blockedFor = want === 0 && left > 0.5 ? d.blockedFor + dt : 0;
    if (d.blockedFor > 1.2 && now - d.veh.honkAt > 6000) d.veh.honkAt = now;
    const at = along(d.route, d.s);
    d.veh.x = at.x;
    d.veh.z = at.z;
    d.veh.a = at.a;
    return left <= 0.05;
  };

  // the riders: in their seats, carried along; off at the stop
  const seat = (p: Player, i: number) => {
    const v = shuttle.veh;
    const back = -1.2 - (i % 4) * 1.1;
    const side = i % 2 ? 0.55 : -0.55;
    const bx = v.x + Math.cos(v.a) * back - Math.sin(v.a) * side;
    const bz = v.z + Math.sin(v.a) * back + Math.cos(v.a) * side;
    p.x = bx - off.x;
    p.y = bz - off.y;
    p.z = heightAt(bx, bz) + 0.55;
    p.level = 0;
    p.a = ANIM.sit;
    p.d = dirFromDelta(Math.cos(v.a), Math.sin(v.a), p.d as 0);
  };
  const alight = (sid: string, i: number) => {
    riders.delete(sid);
    const p = room.state.players.get(sid);
    if (!p) return;
    const v = shuttle.veh;
    // out of its door (its right side: the kerb), one beside the other
    const bx = v.x + Math.cos(v.a) * (0.8 - i * 0.9) - Math.sin(v.a) * 2.4;
    const bz = v.z + Math.sin(v.a) * (0.8 - i * 0.9) + Math.cos(v.a) * 2.4;
    p.busy = "";
    p.a = ANIM.idle;
    p.x = bx - off.x;
    p.y = bz - off.y;
    p.z = heightAt(bx, bz);
    const c = room.clients.getById(sid);
    if (c) room.send(c, "snap", { x: p.x, y: p.y, z: p.z, level: p.level });
  };

  room.on("ride:board", (client) => {
    const p = room.state.players.get(client.sessionId);
    const v = shuttle.veh;
    if (!p || !has() || p.level !== 0 || !v.stop || riders.size >= 8 || p.busy === RIDING) return;
    if (Math.hypot(p.x + off.x - v.x, p.y + off.y - v.z) > BOARD_REACH) return;
    riders.add(client.sessionId);
    p.busy = RIDING;
    v.riders = riders.size;
    seat(p, riders.size - 1);
  });
  // (an admin calls it to the headquarters' stop: its riders off where it was)
  room.on("mod:shuttle", (client) => {
    const p = room.state.players.get(client.sessionId);
    if (!p?.admin && !config.offline) return;
    [...riders].forEach((sid, i) => {
      alight(sid, i);
    });
    const at = along(SHUTTLE.there, 0);
    Object.assign(shuttle, { route: SHUTTLE.there, s: 0, dir: 1 });
    Object.assign(shuttle.veh, { x: at.x, z: at.z, a: at.a, v: 0, stop: "hq", riders: 0 });
    sUntil = Date.now() + STOP_MS;
  });
  room.on("ride:leave", (client) => {
    if (!riders.has(client.sessionId) || !shuttle.veh.stop) return;
    alight(client.sessionId, 0);
    shuttle.veh.riders = riders.size;
  });

  return {
    tick(dt, now) {
      const on = has();
      visitor.veh.shown = on && vPhase !== "away";
      shuttle.veh.shown = on;
      if (!on) return;
      const people = outside();
      // ── the visitor's car ──
      if (vPhase === "away" && now > vUntil) {
        vPhase = "in";
        Object.assign(visitor, { route: VISITOR.in, s: 0, dir: 1 });
      } else if (
        vPhase === "in" &&
        drive(visitor, visitor.s > VISITOR.in.len - 70 ? LOT_V : VISITOR_V, dt, now, people)
      ) {
        vPhase = "park";
        visitor.veh.v = 0;
        vUntil = now + 60_000 + Math.random() * 90_000;
      } else if (vPhase === "park" && now > vUntil) {
        vPhase = "back";
        Object.assign(visitor, { route: VISITOR.back, s: 0, dir: 1 });
      } else if (vPhase === "back" && drive(visitor, 1.5, dt, now, people)) {
        vPhase = "out";
        Object.assign(visitor, { route: VISITOR.out, s: 0, dir: 1 });
      } else if (vPhase === "out" && drive(visitor, visitor.s < 40 ? LOT_V : VISITOR_V, dt, now, people)) {
        vPhase = "away";
        visitor.veh.v = 0;
        vUntil = now + 60_000 + Math.random() * 120_000;
      }
      // (backing out of the bay it still faces east, nosed in as it was)
      if (vPhase === "back") {
        visitor.veh.a = 0;
        visitor.veh.v = -Math.abs(visitor.veh.v);
      }
      // ── the shuttle ──
      const v = shuttle.veh;
      if (v.stop) {
        v.v = 0;
        if (now > sUntil) {
          v.stop = "";
          Object.assign(shuttle, { route: v.x > 100 ? SHUTTLE.back : SHUTTLE.there, s: 0, dir: 1 });
        }
      } else if (drive(shuttle, SHUTTLE_V, dt, now, people)) {
        v.stop = shuttle.route === SHUTTLE.there ? "town" : "hq";
        sUntil = now + STOP_MS;
        [...riders].forEach((sid, i) => {
          alight(sid, i);
        });
      }
      [...riders].forEach((sid, i) => {
        const p = room.state.players.get(sid);
        if (p) seat(p, i);
        else riders.delete(sid);
      });
      v.riders = riders.size;
      // ── the guard: round the fence, a look out now and then ──
      if (gPause > 0) {
        gPause -= dt;
        guard.a = ANIM.idle;
      } else {
        gS = (gS + GUARD_V * dt) % GUARD_ROUND.len;
        guard.a = ANIM.walk;
        if (Math.random() < dt / 150) gPause = 6 + Math.random() * 6;
      }
      const g = along(GUARD_ROUND, gS);
      guard.x = g.x - off.x;
      guard.y = g.z - off.y;
      guard.d = dirFromDelta(Math.cos(g.a), Math.sin(g.a), guard.d as 0);
    },
    leave(client) {
      if (riders.delete(client.sessionId)) shuttle.veh.riders = riders.size;
    },
  };
});
