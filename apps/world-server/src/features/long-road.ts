import { ANIM, dirFromDelta, GROUND_OFFSET, levelMap } from "@yutopia/shared";
import { isCarKind } from "@yutopia/shared/car";
import { along, heightAt, LONG_BUS, type Route } from "@yutopia/shared/grounds";
import { config } from "../config.ts";
import { type Player, Vehicle } from "../schema.ts";
import type { WorldRoom } from "../WorldRoom.ts";
import { RIDING } from "./grounds-life.ts";
import { registerFeature } from "./index.ts";

// Long Pine Road's life (docs/plan/69-the-long-road.md, L3 and L7), driven here so everyone sees the
// same:
//   - the bus: from Main Street's stop by the road's end up to Silver Lake's by the lookout and back,
//     on a timetable — a minute at each stop; get on at a stop, ride it (seated, carried), off at
//     the other. Drawn as the shuttle; boarded as it is (ride:board, ride:leave);
//   - the traffic: now and then a car drives the whole road one way, town → lake or back, at a speed
//     for its bends, its lamps on after dark (drawn as the visitor's sedan), out of sight between.
// Both stop short of anyone in their way. Positions the building's coords; people's the ground
// floor's (the building's less GROUND_OFFSET).

const FAST = process.env.YUTOPIA_LIFE_FAST === "1";
// (fast, for the tests: the 14 km in about half a minute)
const ACCEL = FAST ? 400 : 2.5;
const BRAKE = FAST ? 800 : 8;
const BUS_V = FAST ? 900 : 14;
const TRAFFIC_V = FAST ? 900 : 17;
const BUS_STOP_MS = FAST ? 4000 : 60_000;
const TRAFFIC_EVERY_MS = FAST ? 3000 : 4 * 60_000;
const BOARD_REACH = 6;
const SEATS = 10;

interface Drive {
  veh: Vehicle;
  route: Route;
  s: number;
  blockedFor: number;
}

registerFeature((room: WorldRoom) => {
  const routes = LONG_BUS;
  if (!routes) return {};
  const has = () => !!levelMap(room.map, 0);
  const off = GROUND_OFFSET;
  const make = (id: string, kind: string) => {
    const v = new Vehicle();
    v.id = id;
    v.kind = kind;
    room.state.vehicles.set(id, v);
    return v;
  };
  const bus: Drive = { veh: make("bus", "shuttle"), route: routes.there, s: 0, blockedFor: 0 };
  const traffic: Drive = { veh: make("traffic", "visitor"), route: routes.there, s: 0, blockedFor: 0 };
  {
    const at = along(routes.there, 0);
    Object.assign(bus.veh, { x: at.x, z: at.z, a: at.a, stop: "town" });
  }
  let busUntil = Date.now() + BUS_STOP_MS;
  let trafficOn = false;
  let trafficAt = Date.now() + TRAFFIC_EVERY_MS / 2;
  let trafficWay = 0;
  const riders = new Set<string>();

  // people out on the ground floor (not riding or driving), and the cars people drive
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
  const blocked = (d: Drive, people: { x: number; z: number }[]) => {
    const { x, z, a } = d.veh;
    const ax = x + Math.cos(a) * 4.5;
    const az = z + Math.sin(a) * 4.5;
    return people.some(
      (p) => Math.hypot(p.x - ax, p.z - az) < 3 && (p.x - x) * Math.cos(a) + (p.z - z) * Math.sin(a) > 0,
    );
  };
  // along its route at up to `top` (slower round the bends), easing to a stop at the end; true at the end
  const drive = (d: Drive, top: number, dt: number, now: number, people: { x: number; z: number }[]) => {
    const left = d.route.len - d.s;
    const a0 = along(d.route, d.s).a;
    const a1 = along(d.route, Math.min(d.route.len, d.s + 25)).a;
    let turn = Math.abs(a1 - a0);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    const bend = Math.max(4, top * (1 - Math.min(0.75, turn * 0.9)));
    const want = blocked(d, people) ? 0 : Math.min(bend, Math.sqrt(2 * BRAKE * 0.5 * Math.max(0, left)) + 0.4);
    const v = Math.abs(d.veh.v);
    const nv = want < v ? Math.max(want, v - BRAKE * dt) : Math.min(want, v + ACCEL * dt);
    d.veh.v = nv;
    d.s = Math.min(d.route.len, d.s + nv * dt);
    d.blockedFor = want === 0 && left > 0.5 ? d.blockedFor + dt : 0;
    if (d.blockedFor > 1.2 && now - d.veh.honkAt > 6000) d.veh.honkAt = now;
    const at = along(d.route, d.s);
    d.veh.x = at.x;
    d.veh.z = at.z;
    d.veh.a = at.a;
    return left <= 0.05;
  };
  // the riders: in its seats, carried along; off at a stop
  const seat = (p: Player, i: number) => {
    const v = bus.veh;
    const back = -1.2 - (i % 5) * 1.1;
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
    const v = bus.veh;
    const bx = v.x + Math.cos(v.a) * (0.8 - i * 0.9) - Math.sin(v.a) * 2.6;
    const bz = v.z + Math.sin(v.a) * (0.8 - i * 0.9) + Math.cos(v.a) * 2.6;
    p.busy = "";
    p.a = ANIM.idle;
    p.x = bx - off.x;
    p.y = bz - off.y;
    p.z = heightAt(bx, bz);
    const c = room.clients.getById(sid);
    if (c) room.send(c, "snap", { x: p.x, y: p.y, z: p.z, level: p.level });
  };

  // (boarding: the shuttle's messages — the one near and at its stop takes you)
  room.on("ride:board", (client) => {
    const p = room.state.players.get(client.sessionId);
    const v = bus.veh;
    if (!p || !has() || p.level !== 0 || !v.stop || riders.size >= SEATS || p.busy === RIDING) return;
    const flat = Math.hypot(p.x + off.x - v.x, p.y + off.y - v.z);
    if (Math.hypot(flat, room.upOff(p, { x: v.x - off.x, y: v.z - off.y }, 3)) > BOARD_REACH) return;
    riders.add(client.sessionId);
    p.busy = RIDING;
    v.riders = riders.size;
    seat(p, riders.size - 1);
  });
  room.on("ride:leave", (client) => {
    if (!riders.has(client.sessionId) || !bus.veh.stop) return;
    alight(client.sessionId, 0);
    bus.veh.riders = riders.size;
  });
  // (an admin sends it back to the town's stop; its riders off where it was)
  room.on("mod:bus", (client) => {
    const p = room.state.players.get(client.sessionId);
    if (!p?.admin && !config.offline) return;
    [...riders].forEach((sid, i) => {
      alight(sid, i);
    });
    const at = along(routes.there, 0);
    Object.assign(bus, { route: routes.there, s: 0 });
    Object.assign(bus.veh, { x: at.x, z: at.z, a: at.a, v: 0, stop: "town", riders: 0 });
    busUntil = Date.now() + BUS_STOP_MS;
  });

  return {
    tick(dt, now) {
      const on = has();
      bus.veh.shown = on;
      traffic.veh.shown = on && trafficOn;
      if (!on) return;
      const people = outside();
      // ── the bus ──
      const v = bus.veh;
      if (v.stop) {
        v.v = 0;
        if (now > busUntil) {
          Object.assign(bus, { route: v.stop === "town" ? routes.there : routes.back, s: 0 });
          v.stop = "";
        }
      } else if (drive(bus, BUS_V, dt, now, people)) {
        v.stop = bus.route === routes.there ? "lake" : "town";
        busUntil = now + BUS_STOP_MS;
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
      // ── the traffic ──
      if (!trafficOn && now > trafficAt) {
        trafficOn = true;
        trafficWay = 1 - trafficWay;
        Object.assign(traffic, { route: trafficWay ? routes.there : routes.back, s: 0 });
        const at = along(traffic.route, 0);
        Object.assign(traffic.veh, { x: at.x, z: at.z, a: at.a, v: 0 });
      } else if (trafficOn && drive(traffic, TRAFFIC_V, dt, now, [...people, { x: v.x, z: v.z }])) {
        trafficOn = false;
        traffic.veh.v = 0;
        trafficAt = now + TRAFFIC_EVERY_MS * (0.6 + Math.random() * 0.8);
      }
    },
    leave(client) {
      if (riders.delete(client.sessionId)) bus.veh.riders = riders.size;
    },
  };
});
