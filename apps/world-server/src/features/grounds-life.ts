import { ANIM, dirFromDelta, entranceZOf, GROUND_OFFSET, levelMap, lotLayout } from "@yutopia/shared";
import { isCarKind } from "@yutopia/shared/car";
import { nightness } from "@yutopia/shared/dark";
import { along, GUARD_ROUND, heightAt, LOT, type Route, SHUTTLE, visitorRoute } from "@yutopia/shared/grounds";
import { config } from "../config.ts";
import { Npc, type Player, Vehicle } from "../schema.ts";
import type { WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";
import { ploughAt } from "./ploughed.ts";

// Life on the Grounds (docs/plan/27-the-grounds.md, phase 6), driven here so
// everyone sees the same: the visitor's car comes down the driveway now and
// then, parks in its bay by the doors and leaves (it stops for whoever's in
// its way, and honks); the shuttle runs between the headquarters and the town
// square — get on at a stop, ride it, get off at the other; a night guard walks
// the fence and says nothing. In a storm the snow plough comes out: from the
// town square to the headquarters and back along the shuttle's roads, again
// while it's still snowing, then home. Positions are the building's coords (shared
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
const GUARD_V = FAST ? 40 : 1.25;
const PLOUGH_V = FAST ? 120 : 8;
const PLOUGH_OUT = 0.45; // the storm this strong: the plough comes out
const PLOUGH_ON = 0.25; // …and keeps going round while it's still this strong
const PLOUGH_REST_MS = 10 * 60 * 1000; // home a while after a storm
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
  // the visitor's way round the lot to the visitors' bay by this studio's doors (made once the
  // building is: till then, a studio 36 deep's)
  let visit: ReturnType<typeof visitorRoute> | null = null;
  const visits = () => {
    visit ??= visitorRoute(lotLayout(entranceZOf(room.map)));
    return visit;
  };
  const visitor: Drive = {
    veh: make("visitor", "visitor"),
    route: visitorRoute(lotLayout()).in,
    s: 0,
    dir: 1,
    blockedFor: 0,
  };
  // (at a walk on the lot and just off it: its mouth, its loop)
  const inLot = (d: Drive) =>
    d.veh.x > LOT.x0 - 3 && d.veh.x < LOT.x1 + 3 && d.veh.z > LOT.z0 - 12 && d.veh.z < LOT.z1 + 3;
  const shuttle: Drive = { veh: make("shuttle", "shuttle"), route: SHUTTLE.there, s: 0, dir: 1, blockedFor: 0 };
  const plough: Drive = { veh: make("plough", "plough"), route: SHUTTLE.back, s: 0, dir: 1, blockedFor: 0 };
  let pPhase: "away" | "in" | "out" = "away";
  let pRestUntil = 0;
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
  let gS = 0;
  let gPause = 0;
  // his shift (docs/plan/33-the-look.md): by day at his post in the gatehouse; as it gets dark he
  // comes out of its door and walks to the fence, and does his rounds; as it gets light he walks
  // back the shorter way round, in at the door, to his post. Never popping in or out.
  const POST = { x: -31.5, z: -364 }; // at the desk, by its glass
  const DOOR = { x: -36, z: -364 }; // just outside its door (west)
  const GATE = { x: -36, z: GUARD_ROUND.pts[0][1] }; // where his round passes it
  const gateS = GATE.x - GUARD_ROUND.pts[0][0]; // (the round starts at its north-west corner, east)
  let shift: "post" | "out" | "round" | "home" | "in" = "post";
  let leg: { x: number; z: number }[] = [];
  let homeDir: 1 | -1 = 1;
  Object.assign(guard, { x: POST.x - off.x, y: POST.z - off.y, a: ANIM.idle });
  // walks him towards the next point of `leg` (true: there)
  const walkLeg = (dt: number): boolean => {
    const t = leg[0];
    if (!t) return true;
    const gx = guard.x + off.x;
    const gz = guard.y + off.y;
    const d = Math.hypot(t.x - gx, t.z - gz);
    const step = GUARD_V * dt;
    guard.a = ANIM.walk;
    if (d <= step) {
      guard.x = t.x - off.x;
      guard.y = t.z - off.y;
      leg.shift();
      return leg.length === 0;
    }
    guard.x += ((t.x - gx) / d) * step;
    guard.y += ((t.z - gz) / d) * step;
    guard.d = dirFromDelta((t.x - gx) / d, (t.z - gz) / d, guard.d as 0);
    return false;
  };

  // people out on the ground floor, in the building's coords
  // (and the cars people drive — features/cars.ts — along their length)
  const outside = () => {
    const out = [...room.state.players.values()]
      .filter((p) => p.level === 0 && !p.busy.startsWith("ride:") && !p.busy.startsWith("drive:"))
      .map((p) => ({ x: p.x + off.x, z: p.y + off.y }));
    room.state.vehicles.forEach((v) => {
      if (!isCarKind(v.kind)) return;
      for (const k of [-2.2, 0, 2.2]) out.push({ x: v.x + Math.cos(v.a) * k, z: v.z + Math.sin(v.a) * k });
    });
    return out;
  };
  // the other big ones on the road (the shuttle and the plough queue, not drive through each other)
  const along3 = (d: Drive) => {
    const out: { x: number; z: number }[] = [];
    if (!d.veh.shown) return out;
    for (const k of [-4, -2, 0, 2, 4])
      out.push({ x: d.veh.x + Math.cos(d.veh.a) * k, z: d.veh.z + Math.sin(d.veh.a) * k });
    return out;
  };
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
    // (in three dimensions: shared reach.ts — the bus 3 m tall on the road)
    const flat = Math.hypot(p.x + off.x - v.x, p.y + off.y - v.z);
    if (Math.hypot(flat, room.upOff(p, { x: v.x - off.x, y: v.z - off.y }, 3)) > BOARD_REACH) return;
    riders.add(client.sessionId);
    p.busy = RIDING;
    v.riders = riders.size;
    seat(p, riders.size - 1);
  });
  // (an admin calls it to the headquarters' stop: its riders off where it was)
  room.on("mod:shuttle", (client) => {
    const p = room.state.players.get(client.sessionId);
    if (!p?.admin && !config.offline) return;
    if (p?.admin) room.adminLog(p, "shuttle", null, "to HQ");
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
        Object.assign(visitor, { route: visits().in, s: 0, dir: 1 });
      } else if (vPhase === "in" && drive(visitor, inLot(visitor) ? LOT_V : VISITOR_V, dt, now, people)) {
        vPhase = "park";
        visitor.veh.v = 0;
        vUntil = now + 60_000 + Math.random() * 90_000;
      } else if (vPhase === "park" && now > vUntil) {
        vPhase = "back";
        Object.assign(visitor, { route: visits().back, s: 0, dir: 1 });
      } else if (vPhase === "back" && drive(visitor, 1.5, dt, now, people)) {
        vPhase = "out";
        Object.assign(visitor, { route: visits().out, s: 0, dir: 1 });
      } else if (vPhase === "out" && drive(visitor, inLot(visitor) ? LOT_V : VISITOR_V, dt, now, people)) {
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
      } else if (drive(shuttle, SHUTTLE_V, dt, now, [...people, ...along3(plough)])) {
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
      // ── the plough: out in a storm, round the shuttle's roads, home after it ──
      const storm = Number(room.state.storm) || 0;
      plough.veh.shown = pPhase !== "away";
      if (pPhase === "away") {
        // (out from the town square's end, once the shuttle's not standing there)
        const start = along(SHUTTLE.back, 0);
        if (storm > PLOUGH_OUT && now > pRestUntil && Math.hypot(v.x - start.x, v.z - start.z) > 20) {
          pPhase = "in";
          Object.assign(plough, { route: SHUTTLE.back, s: 0, dir: 1 });
          Object.assign(plough.veh, { x: start.x, z: start.z, a: start.a, v: 0 });
        }
      } else if (drive(plough, PLOUGH_V, dt, now, [...people, ...along3(shuttle)])) {
        if (pPhase === "in") {
          pPhase = "out";
          Object.assign(plough, { route: SHUTTLE.there, s: 0, dir: 1 });
        } else if (storm > PLOUGH_ON) {
          pPhase = "in";
          Object.assign(plough, { route: SHUTTLE.back, s: 0, dir: 1 });
        } else {
          pPhase = "away";
          plough.veh.v = 0;
          pRestUntil = now + PLOUGH_REST_MS;
        }
      }
      // (its blade clears the road behind it: every car grips better there for a while)
      if (pPhase !== "away" && Math.abs(plough.veh.v) > 1)
        ploughAt(room.state, plough.veh.x, plough.veh.z, plough.veh.a, 4.6, 3.2, now);
      // ── the guard: his shift (out at dusk, home at dawn), round the fence at night ──
      const night = nightness(room.state.hour);
      if (shift === "post" && night > 0.3) {
        shift = "out";
        leg = [{ ...DOOR }, { ...GATE }];
      } else if (shift === "round" && night < 0.2) {
        shift = "home";
        const ahead = (gateS - gS + GUARD_ROUND.len) % GUARD_ROUND.len;
        homeDir = ahead <= GUARD_ROUND.len / 2 ? 1 : -1;
      }
      if (shift === "post") {
        guard.a = ANIM.idle;
        guard.d = dirFromDelta(-1, 0, guard.d as 0); // looking out at the road
      } else if (shift === "out") {
        if (walkLeg(dt)) {
          shift = "round";
          gS = gateS;
        }
      } else if (shift === "in") {
        if (walkLeg(dt)) {
          shift = "post";
          guard.a = ANIM.idle;
        }
      } else {
        if (gPause > 0 && shift === "round") {
          gPause -= dt;
          guard.a = ANIM.idle;
        } else {
          const dir = shift === "home" ? homeDir : 1;
          const before = gS;
          gS = (gS + dir * GUARD_V * dt + GUARD_ROUND.len) % GUARD_ROUND.len;
          guard.a = ANIM.walk;
          if (shift === "round" && Math.random() < dt / 150) gPause = 6 + Math.random() * 6;
          // home: past the gate's point this step — off the round, in at the door
          const passed =
            (dir > 0
              ? (gateS - before + GUARD_ROUND.len) % GUARD_ROUND.len
              : (before - gateS + GUARD_ROUND.len) % GUARD_ROUND.len) <=
            GUARD_V * dt + 1e-6;
          if (shift === "home" && passed) {
            gS = gateS;
            shift = "in";
            leg = [{ ...DOOR }, { ...POST }];
          }
        }
        if (shift === "round" || shift === "home") {
          const g = along(GUARD_ROUND, gS);
          guard.x = g.x - off.x;
          guard.y = g.z - off.y;
          const k = shift === "home" ? homeDir : 1;
          guard.d = dirFromDelta(Math.cos(g.a) * k, Math.sin(g.a) * k, guard.d as 0);
        }
      }
    },
    leave(client) {
      if (riders.delete(client.sessionId)) shuttle.veh.riders = riders.size;
    },
  };
});
