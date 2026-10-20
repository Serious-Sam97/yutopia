import { ANIM, CAR_COLOURS, campusLot, dirFromDelta, GROUND_OFFSET, levelMap } from "@yutopia/shared";
import {
  CAR_FLAGS,
  CAR_HZ,
  type CarSpec,
  type CarWire,
  headingQuat,
  implausible,
  parkAt,
  parkedPose,
  SPECS,
} from "@yutopia/shared/car";
import { BUILDINGS, GROUNDS, heightAt, LOT } from "@yutopia/shared/grounds";
import { api } from "../api.ts";
import { config } from "../config.ts";
import { type Player, Vehicle } from "../schema.ts";
import { fromSchema, toSchema, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// The lot's cars, driven (docs/plan/28-the-car.md, Together). Any free one is
// anyone's: X at a door takes that door's seat (0 the driver's). The driver's
// client runs the car's sim and sends its state (`car:state`, 20 Hz); this
// checks it is a car that could have got there (shared car/net.ts), keeps it
// in the room's vehicles for everyone, and carries the people in its seats.
// Got out of and stopped, it parks where it is: its object put back there at
// its exact heading (shared car/park.ts) and saved. With no driver (the line
// dropped) it rolls to a stop. Left out of the lot for two hours with nobody
// near, it's towed back to a free bay when no one is looking.

const REACH = 4.2; // from its middle to whoever gets in
const OUT_V = 2.5; // m/s: slower than this to get in or out
const TOW_MS = 2 * 60 * 60 * 1000;
const TOW_NEAR = 30;
const QUIET_MS = 2500; // no state from the driver for this long: rolling on its own
const SHOVE_MAX = 6.5; // m: as far as a knock may move a parked car
const SHOVE_REACH = 12; // m: the knocking car this near where it ended up
// the seats (car-local from the CoG: x forward, z to the right): the driver's on the left
const SEAT_AT: [number, number][] = [
  [-0.48, -0.42],
  [-0.48, 0.42],
  [-1.15, -0.45],
  [-1.15, 0.45],
];
const SEAT_HIP = 0.47; // above the ground at rest
// out of the seat's door, then the other side's, then the boot
const DOOR_OUT: [number, number][][] = [
  [
    [-0.35, -1.7],
    [-0.35, 1.7],
    [-3.4, 0],
  ],
  [
    [-0.35, 1.7],
    [-0.35, -1.7],
    [-3.4, 0],
  ],
  [
    [-1.3, -1.7],
    [-1.3, 1.7],
    [-3.4, 0],
  ],
  [
    [-1.3, 1.7],
    [-1.3, -1.7],
    [-3.4, 0],
  ],
];

interface Live {
  veh: Vehicle;
  spec: CarSpec;
  seats: string[];
  last: CarWire | null;
  lastAt: number;
  still: number;
  strikes: number;
}

registerFeature((room: WorldRoom) => {
  const off = GROUND_OFFSET;
  const live = new Map<string, Live>();
  const bySid = new Map<string, string>();
  const has = () => !!levelMap(room.map, 0);
  const clientOf = (sid: string) => room.clients.find((c) => c.sessionId === sid);
  const no = (c: WorldClient, why: string) => room.send(c, "car:no", { why });
  const forward = (v: Vehicle) => {
    // the car's own x, from its turn
    const { qx, qy, qz, qw } = v;
    return { x: 1 - 2 * (qy * qy + qz * qz), y: 2 * (qx * qy + qw * qz), z: 2 * (qx * qz - qw * qy) };
  };
  /** A car-local point (x forward, z right, from its CoG) on the Grounds. */
  const at = (v: Vehicle, lx: number, lz: number) => {
    const ca = Math.cos(v.a);
    const sa = Math.sin(v.a);
    return { x: v.x + ca * lx - sa * lz, z: v.z + sa * lx + ca * lz };
  };
  const seatsStr = (l: Live) => l.seats.join("|");
  const place = (p: Player, l: Live, i: number) => {
    const v = l.veh;
    const s = at(v, SEAT_AT[i][0], SEAT_AT[i][1]);
    p.x = s.x - off.x;
    p.y = s.z - off.y;
    p.z = v.y - l.spec.cog + SEAT_HIP;
    p.level = 0;
    p.a = ANIM.sit;
    p.d = dirFromDelta(Math.cos(v.a), Math.sin(v.a), p.d as 0);
  };

  room.on("car:enter", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const seat = Number(m?.seat) | 0;
    if (!p || !has() || p.level !== 0 || seat < 0 || seat > 3) return;
    if (bySid.has(client.sessionId) || p.busy.startsWith("ride:")) return no(client, "busy");
    const id = String(m?.id ?? "");
    let l = live.get(id) ?? live.get(`car:${id}`);
    if (!l) {
      const o = room.state.objects.get(id);
      if (!o || o.kind !== "car") return no(client, "gone");
      const def = fromSchema(o);
      if (def.props?.driven) return no(client, "busy");
      const pose = parkedPose(def);
      if (Math.hypot(p.x - pose.x, p.y - pose.y) > REACH) return no(client, "far");
      const kind = def.props?.model === "offroad" ? "offroad" : "sedan";
      const spec = SPECS[kind];
      const v = new Vehicle();
      v.id = `car:${o.id}`;
      v.kind = kind;
      v.x = pose.x + off.x;
      v.z = pose.y + off.y;
      v.a = pose.a;
      v.y = (pose.h ?? heightAt(v.x, v.z)) + spec.cog;
      const q = headingQuat(pose.a);
      Object.assign(v, { qx: q.x, qy: q.y, qz: q.z, qw: q.w });
      v.colour = Number(def.props?.variant ?? 0) % CAR_COLOURS.length;
      v.obj = o.id;
      v.shown = true;
      v.at = Date.now();
      l = { veh: v, spec, seats: ["", "", "", ""], last: null, lastAt: Date.now(), still: 0, strikes: 0 };
      live.set(v.id, l);
      room.state.vehicles.set(v.id, v);
      // its object: out, being driven (no longer in anyone's way where it stood)
      room.state.objects.set(o.id, toSchema({ ...def, props: { ...(def.props ?? {}), driven: 1 } }));
      room.rebuildGrid();
    } else {
      if (Math.hypot(p.x + off.x - l.veh.x, p.y + off.y - l.veh.z) > REACH) return no(client, "far");
      if (Math.hypot(l.veh.vx, l.veh.vz) > OUT_V) return no(client, "moving");
    }
    if (l.seats[seat]) return no(client, "taken");
    l.seats[seat] = client.sessionId;
    l.veh.seats = seatsStr(l);
    l.veh.riders = l.seats.filter(Boolean).length;
    bySid.set(client.sessionId, l.veh.id);
    p.busy = seat === 0 ? `drive:${l.veh.id}` : `ride:car:${l.veh.id}`;
    place(p, l, seat);
    if (seat === 0) {
      l.last = null; // (a new driver: their first state is believed where the car is)
      l.lastAt = Date.now();
    }
  });

  room.on("car:state", (client, m) => {
    const vid = bySid.get(client.sessionId);
    const l = vid ? live.get(vid) : undefined;
    if (!l || l.seats[0] !== client.sessionId || !m) return;
    const now = Date.now();
    const seq = Number(m.seq) >>> 0;
    if (l.last && seq <= l.last.seq) return;
    // too often: dropped (a stuck loop)
    if (now - l.lastAt < 1000 / (CAR_HZ * 2)) return;
    const v = l.veh;
    // its first state from this driver: it starts where the car is
    const prev: CarWire = l.last ?? {
      seq: 0,
      x: v.x,
      y: v.y,
      z: v.z,
      qx: v.qx,
      qy: v.qy,
      qz: v.qz,
      qw: v.qw,
      vx: v.vx,
      vy: v.vy,
      vz: v.vz,
      wy: 0,
      steer: 0,
      rpm: 0,
      gear: 0,
      fl: 0,
      slip: 0,
      fuel: 0,
    };
    const why = implausible(prev, m, (now - l.lastAt) / 1000, (x, z) => heightAt(x, z));
    if (why) {
      l.strikes++;
      room.send(client, "car:snap", { ...prev, id: v.id });
      if (l.strikes > 40) console.warn(`[cars] ${v.id}: ${why} (${l.strikes})`);
      return;
    }
    l.strikes = Math.max(0, l.strikes - 1);
    if (m.fl & CAR_FLAGS.horn && !(v.fl & CAR_FLAGS.horn)) v.honkAt = now;
    Object.assign(v, {
      x: m.x,
      y: m.y,
      z: m.z,
      qx: m.qx,
      qy: m.qy,
      qz: m.qz,
      qw: m.qw,
      vx: m.vx,
      vy: m.vy,
      vz: m.vz,
      wy: m.wy,
      steer: m.steer,
      rpm: Math.max(0, Math.min(65535, m.rpm | 0)),
      gear: m.gear | 0,
      fl: m.fl & 0xffff,
      slip: m.slip,
      seq,
      at: now,
    });
    const f = forward(v);
    v.a = Math.atan2(f.z, f.x);
    v.v = v.vx * Math.cos(v.a) + v.vz * Math.sin(v.a);
    l.last = { ...m, seq };
    l.lastAt = now;
  });

  // a parked car knocked by someone's driving, come to rest (its driver's client slid it):
  // put where it stopped, if it could have got there
  const shovedAt = new Map<string, number>();
  room.on("car:shove", (client, m) => {
    const vid = bySid.get(client.sessionId);
    const l = vid ? live.get(vid) : undefined;
    if (!l || l.seats[0] !== client.sessionId || !m) return;
    const o = room.state.objects.get(String(m.id ?? ""));
    if (!o || o.kind !== "car") return;
    const def = fromSchema(o);
    const x = Number(m.x);
    const z = Number(m.z);
    const a = Number(m.a);
    if (def.props?.driven || ![x, z, a].every(Number.isFinite)) return;
    const now = Date.now();
    if (now - (shovedAt.get(o.id) ?? 0) < 250) return;
    const was = parkedPose(def);
    if (Math.hypot(was.x + off.x - x, was.y + off.y - z) > SHOVE_MAX) return;
    if (Math.hypot(l.veh.x - x, l.veh.z - z) > SHOVE_REACH) return;
    if (x < GROUNDS.x0 || x > GROUNDS.x1 || z < GROUNDS.z0 || z > GROUNDS.z1) return;
    if (BUILDINGS.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1)) return;
    shovedAt.set(o.id, now);
    const spot = parkAt(x - off.x, z - off.y, a, heightAt(x, z), { ...(def.props ?? {}), level: 0 });
    const next = { ...def, ...spot };
    room.state.objects.set(o.id, toSchema(next));
    room.rebuildGrid();
    if (!config.offline) void api.putObject(next).catch((e) => console.warn("[cars] shove", e.message));
  });

  const leaveSeat = (sid: string, out: boolean) => {
    const vid = bySid.get(sid);
    const l = vid ? live.get(vid) : undefined;
    bySid.delete(sid);
    if (!l) return;
    const i = l.seats.indexOf(sid);
    if (i < 0) return;
    l.seats[i] = "";
    l.veh.seats = seatsStr(l);
    l.veh.riders = l.seats.filter(Boolean).length;
    const p = room.state.players.get(sid);
    if (!p) return;
    p.busy = "";
    p.a = ANIM.idle;
    if (!out) return;
    // out of the door on their side, else the other's, else round the back
    const g = room.gridFor(p.uid, 0);
    let spot: { x: number; y: number } | null = null;
    for (const [lx, lz] of DOOR_OUT[i]) {
      const s = at(l.veh, lx, lz);
      const x = s.x - off.x;
      const y = s.z - off.y;
      if (g.fits(x, y)) {
        spot = { x, y };
        break;
      }
    }
    if (!spot) {
      const s = at(l.veh, DOOR_OUT[i][0][0], DOOR_OUT[i][0][1]);
      spot = g.nearestOpen(s.x - off.x, s.z - off.y, 6) ?? { x: s.x - off.x, y: s.z - off.y };
    }
    p.x = spot.x;
    p.y = spot.y;
    p.z = g.onLand(p.x, p.y) ? g.groundAt(p.x, p.y, 0) : 0;
    p.level = 0;
    const c = clientOf(sid);
    if (c) room.send(c, "snap", { x: p.x, y: p.y, z: p.z, level: 0 });
  };

  room.on("car:leave", (client) => {
    const vid = bySid.get(client.sessionId);
    const l = vid ? live.get(vid) : undefined;
    if (l && Math.hypot(l.veh.vx, l.veh.vz) > OUT_V) return no(client, "moving");
    leaveSeat(client.sessionId, true);
  });

  /** Left still with no one in it: back to being a thing in the world, where it stopped. */
  const park = (l: Live) => {
    const v = l.veh;
    live.delete(v.id);
    room.state.vehicles.delete(v.id);
    const o = room.state.objects.get(v.obj);
    if (!o) return;
    const def = fromSchema(o);
    const ground = heightAt(v.x, v.z);
    const spot = parkAt(v.x - off.x, v.z - off.y, v.a, ground, {
      ...(def.props ?? {}),
      level: 0,
      parkedAt: Date.now(),
    });
    const next = { ...def, ...spot };
    room.state.objects.set(o.id, toSchema(next));
    room.rebuildGrid();
    if (!config.offline) void api.putObject(next).catch((e) => console.warn("[cars] park", e.message));
  };

  // every car back in a bay of the lot (an admin; the tests)
  const home = (all: boolean) => {
    const lot = campusLot(36);
    const cars = [...room.state.objects.values()].filter((o) => o.kind === "car");
    const taken = new Set<number>();
    const bayOf = (x: number, y: number) =>
      lot.bays.findIndex((b) => Math.abs(b.x - (x + off.x)) < 1.6 && Math.abs(b.z - (y + off.y)) < 1.2);
    for (const o of cars) {
      const pose = parkedPose(fromSchema(o));
      const b = bayOf(pose.x, pose.y);
      if (b >= 0 && typeof fromSchema(o).props?.a !== "number") taken.add(b);
    }
    for (const o of cars) {
      const def = fromSchema(o);
      if (def.props?.driven || typeof def.props?.a !== "number") continue;
      const parkedAt = Number(def.props?.parkedAt) || 0;
      const pose = parkedPose(def);
      const bx = pose.x + off.x;
      const bz = pose.y + off.y;
      const inLot = bx > LOT.x0 && bx < LOT.x1 && bz > LOT.z0 && bz < LOT.z1;
      if (!all) {
        if (inLot || Date.now() - parkedAt < TOW_MS) continue;
        const near = [...room.state.players.values()].some(
          (p) => p.level === 0 && Math.hypot(p.x + off.x - bx, p.y + off.y - bz) < TOW_NEAR,
        );
        if (near) continue;
      }
      const i = lot.bays.findIndex((_, k) => !taken.has(k));
      if (i < 0) break;
      taken.add(i);
      const b = lot.bays[i];
      const spot = parkAt(b.x - off.x, b.z - off.y, b.dir > 0 ? Math.PI : 0, 0, { ...(def.props ?? {}), level: 0 });
      // (in a bay it stands square, as the lot's cars do)
      delete spot.props.a;
      delete spot.props.hy;
      delete spot.props.parkedAt;
      const next = { ...def, ...spot };
      room.state.objects.set(o.id, toSchema(next));
      if (!config.offline) void api.putObject(next).catch((e) => console.warn("[cars] tow", e.message));
    }
    room.rebuildGrid();
  };
  room.on("mod:cars", (client) => {
    const p = room.state.players.get(client.sessionId);
    if (!p?.admin && !config.offline) return;
    for (const l of [...live.values()]) {
      for (const sid of l.seats) if (sid) leaveSeat(sid, true);
      park(l);
    }
    home(true);
  });

  // (two of the lot's cars are the 80s 4x4 — docs/plan/28, phase 6 — once, kept)
  let fleet = false;
  const makeFleet = () => {
    const cars = [...room.state.objects.values()].filter((o) => o.kind === "car");
    if (cars.length < 6) return;
    fleet = true;
    if (cars.some((o) => fromSchema(o).props?.model === "offroad")) return;
    for (const id of ["car-3", "car-11"]) {
      const o = room.state.objects.get(id);
      if (!o) continue;
      const def = fromSchema(o);
      const props: Record<string, unknown> = { ...(def.props ?? {}), model: "offroad" };
      delete props.wagon;
      const next = { ...def, props };
      room.state.objects.set(id, toSchema(next));
      if (!config.offline) void api.putObject(next).catch((e) => console.warn("[cars] 4x4", e.message));
    }
  };

  let towAt = Date.now() + 60_000;
  return {
    tick(dt, now) {
      if (!fleet) makeFleet();
      for (const l of [...live.values()]) {
        const v = l.veh;
        // its people in their seats (and out of them, if something else took them away)
        l.seats.forEach((sid, i) => {
          if (!sid) return;
          const p = room.state.players.get(sid);
          const want = i === 0 ? `drive:${v.id}` : `ride:car:${v.id}`;
          if (!p || p.busy !== want) {
            l.seats[i] = "";
            bySid.delete(sid);
            v.seats = seatsStr(l);
            v.riders = l.seats.filter(Boolean).length;
            return;
          }
          place(p, l, i);
        });
        // no one driving (or their line quiet): it rolls to a stop on its own
        const driven = !!l.seats[0] && now - l.lastAt < QUIET_MS;
        if (!driven) {
          const sp = Math.hypot(v.vx, v.vz);
          if (sp > 0.05) {
            const k = Math.max(0, sp - 3.5 * dt) / sp;
            v.vx *= k;
            v.vz *= k;
            v.x += v.vx * dt;
            v.z += v.vz * dt;
            v.y = heightAt(v.x, v.z) + l.spec.cog;
            v.v = v.vx * Math.cos(v.a) + v.vz * Math.sin(v.a);
            v.at = now;
          } else {
            v.vx = v.vz = v.vy = v.v = 0;
            v.rpm = l.seats.some(Boolean) ? v.rpm : 0;
          }
          v.fl &= ~(CAR_FLAGS.horn | CAR_FLAGS.brake);
        }
        const empty = !l.seats.some(Boolean);
        l.still = empty && Math.hypot(v.vx, v.vz) < 0.3 ? l.still + dt : 0;
        if (l.still > 2) park(l);
      }
      if (now > towAt) {
        towAt = now + 60_000;
        home(false);
      }
    },
    leave(client) {
      leaveSeat(client.sessionId, false);
    },
    levelChange(client, p, from, to) {
      if (to !== 0 && bySid.has(client.sessionId)) leaveSeat(client.sessionId, false);
      void p;
      void from;
    },
  };
});
