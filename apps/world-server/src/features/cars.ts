import { ANIM, CAR_COLOURS, campusLot, dirFromDelta, GROUND_OFFSET, levelMap } from "@yutopia/shared";
import {
  bayFor,
  CAR_FLAGS,
  CAR_HZ,
  type CarSpec,
  type CarWire,
  freeSpot,
  groundsWorld,
  headingQuat,
  implausible,
  parkAt,
  parkedBody,
  parkedPose,
  type Solid,
  SPECS,
} from "@yutopia/shared/car";
import { atPump, BUILDINGS, GROUNDS, heightAt, inBuilt, LOT } from "@yutopia/shared/grounds";
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
// near (ten minutes, its tank dry), it's towed back to a free bay when no one is
// looking — cleaned, its dents beaten out, a little fuel in it. Left roughly in a
// free bay of the lot, it's put square in it.
//
// What it carries from drive to drive: its tank (the driver's sim burns it; only a
// pump fills it — stopped at one, F), the dirt off the roads and the dents its
// knocks leave (the driver's client counts them: `car:wear`, only ever more).
// Hit at speed, someone is knocked down (never hurt); a passenger can change the
// radio's station (the driver's client keeps it: told).

const REACH = 4.2; // from its middle to whoever gets in
const OUT_V = 2.5; // m/s: slower than this to get in or out
const TOW_MS = 2 * 60 * 60 * 1000;
const TOW_NEAR = 30;
const QUIET_MS = 2500; // no state from the driver for this long: rolling on its own
const SHOVE_MAX = 6.5; // m: as far as a knock may move a parked car
const SHOVE_REACH = 12; // m: the knocking car this near where it ended up
const EMPTY_TOW_MS = 10 * 60 * 1000; // a dry car left out: towed sooner
const FILL_S = 8; // s: empty to full at a pump (a wash in the time)
const KNOCK_V = 2; // m/s: as fast as a car must be going to knock someone down
const KNOCK_REACH = 4; // m: them this near its middle
const UNSTICK_MS = 10_000; // a car pulled out: not again for this long
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
  sp: number; // the most it was going over its last two states (m/s)
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const num = (x: unknown, or: number) => (typeof x === "number" && Number.isFinite(x) ? x : or);

registerFeature((room: WorldRoom) => {
  const off = GROUND_OFFSET;
  const live = new Map<string, Live>();
  const bySid = new Map<string, string>();
  const has = () => !!levelMap(room.map, 0);
  const clientOf = (sid: string) => room.clients.find((c) => c.sessionId === sid);
  const no = (c: WorldClient, why: string) => room.send(c, "car:no", { why });
  /** The car `sid` is driving (the driver's seat), if any. */
  const driven = (sid: string) => {
    const vid = bySid.get(sid);
    const l = vid ? live.get(vid) : undefined;
    return l && l.seats[0] === sid ? l : undefined;
  };
  /** At a pump: the car's middle (not its CoG) by one (shared atPump). */
  const pumped = (l: Live) => {
    const b = l.spec.body;
    const o = (b.ahead - b.behind) / 2;
    return atPump(l.veh.x + Math.cos(l.veh.a) * o, l.veh.z + Math.sin(l.veh.a) * o);
  };
  const dmgOf = (s: string) => {
    const d = s.split(",").map(Number);
    return [0, 1, 2, 3].map((i) => clamp01(Number.isFinite(d[i]) ? d[i] : 0));
  };
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
      v.fuel = clamp01(num(def.props?.fuel, 0.7));
      v.grime = clamp01(num(def.props?.grime, 0));
      v.dmg = typeof def.props?.dmg === "string" ? def.props.dmg : "";
      l = { veh: v, spec, seats: ["", "", "", ""], last: null, lastAt: Date.now(), still: 0, strikes: 0, sp: 0 };
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
    // its tank: only ever down from the driver (a pump fills it here, not them)
    const fuel = Number(m.fuel) / l.spec.fuel.litres;
    if (!v.filling && Number.isFinite(fuel)) v.fuel = Math.max(0, Math.min(v.fuel, fuel));
    const sp = Math.hypot(Number(m.vx) || 0, Number(m.vz) || 0);
    l.sp = Math.max(sp, Math.hypot(v.vx, v.vz));
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

  // the dirt and dents the driver's client counted: only ever more, and not too much at once
  room.on("car:wear", (client, m) => {
    const l = driven(client.sessionId);
    if (!l || !m) return;
    const v = l.veh;
    const g = Number(m.grime);
    if (Number.isFinite(g)) v.grime = clamp01(Math.max(v.grime, Math.min(g, v.grime + 0.1)));
    const was = dmgOf(v.dmg);
    const d = Array.isArray(m.dmg) ? m.dmg.map(Number) : [];
    if (d.length === 4 && d.every(Number.isFinite)) {
      const next = was.map((x, i) => clamp01(Math.max(x, Math.min(d[i], x + 0.5))));
      v.dmg = next.some((x) => x > 0) ? next.map((x) => Math.round(x * 100) / 100).join(",") : "";
    }
  });
  // at a pump, stopped: F fills it (and washes it) till it's full or it moves
  room.on("car:fill", (client, m) => {
    const l = driven(client.sessionId);
    if (!l) return;
    const v = l.veh;
    if (!m?.on) {
      v.filling = false;
      return;
    }
    if (Math.hypot(v.vx, v.vz) > 0.4) return no(client, "moving");
    if (!pumped(l)) return no(client, "pump");
    v.filling = true;
  });
  // hit at speed by my car: knocked down (never hurt), the way the car was going
  const knockedAt = new Map<string, number>();
  room.on("car:knock", (client, m) => {
    const l = driven(client.sessionId);
    const sid = String(m?.sid ?? "");
    const q = room.state.players.get(sid);
    if (!l || !q || l.seats.includes(sid)) return;
    const now = Date.now();
    const v = l.veh;
    if (q.level !== 0 || q.fellAt || q.downAt || q.hp <= 0 || q.busy.startsWith("ride:") || q.busy.startsWith("drive:"))
      return;
    if (now - (knockedAt.get(sid) ?? 0) < 4000 || l.sp < KNOCK_V) return;
    if (Math.hypot(q.x + off.x - v.x, q.y + off.y - v.z) > KNOCK_REACH) return;
    knockedAt.set(sid, now);
    q.fellAt = now;
    q.fellYaw = Math.atan2(v.vz, v.vx);
  });
  // stuck (stopped, wedged among trunks, dug in): pulled out to the nearest clear spot on firm
  // ground — the server's pick (the Grounds' solids, the parked cars, the other cars on the move)
  const unstuckAt = new Map<string, number>();
  let skip = "";
  const carWorld = groundsWorld({
    extra: (x, z, r, out: Solid[]) => {
      for (const o of room.state.objects.values()) {
        if (o.kind !== "car") continue;
        const def = fromSchema(o);
        if (def.props?.driven) continue;
        const b = parkedBody(def);
        const bx = b.x + off.x;
        const bz = b.y + off.y;
        if (Math.abs(bx - x) < r + 3 && Math.abs(bz - z) < r + 3)
          out.push({ kind: "box", x: bx, z: bz, hx: b.hx, hz: b.hy, a: b.a, what: "car" });
      }
      for (const [id, k] of live) {
        if (id === skip) continue;
        const b = k.spec.body;
        const o2 = (b.ahead - b.behind) / 2;
        const v = k.veh;
        out.push({
          kind: "box",
          x: v.x + Math.cos(v.a) * o2,
          z: v.z + Math.sin(v.a) * o2,
          hx: (b.ahead + b.behind) / 2,
          hz: b.width / 2,
          a: v.a,
          what: "car",
        });
      }
    },
  });
  room.on("car:unstick", (client) => {
    const l = driven(client.sessionId);
    if (!l) return;
    const v = l.veh;
    const now = Date.now();
    if (Math.hypot(v.vx, v.vz) > 1) return no(client, "moving");
    if (now - (unstuckAt.get(v.id) ?? 0) < UNSTICK_MS) return no(client, "soon");
    skip = v.id;
    const spot = freeSpot(carWorld, l.spec, v.x, v.z, v.a);
    skip = "";
    if (!spot) return no(client, "nowhere");
    unstuckAt.set(v.id, now);
    const q = headingQuat(spot.a);
    Object.assign(v, {
      x: spot.x,
      z: spot.z,
      y: heightAt(spot.x, spot.z) + l.spec.cog,
      qx: q.x,
      qy: q.y,
      qz: q.z,
      qw: q.w,
      vx: 0,
      vy: 0,
      vz: 0,
      wy: 0,
      a: spot.a,
      v: 0,
      at: now,
    });
    // (its driver's next state is believed from here)
    l.last = null;
    l.lastAt = now;
    room.send(client, "car:snap", {
      id: v.id,
      seq: v.seq,
      x: v.x,
      y: v.y,
      z: v.z,
      qx: v.qx,
      qy: v.qy,
      qz: v.qz,
      qw: v.qw,
      vx: 0,
      vy: 0,
      vz: 0,
      wy: 0,
      steer: 0,
      rpm: v.rpm,
      gear: v.gear,
      fl: v.fl,
      slip: 0,
      fuel: v.fuel * l.spec.fuel.litres,
    });
  });
  // a passenger's radio button: the driver's client keeps the station, so it's told
  room.on("car:radio", (client) => {
    const vid = bySid.get(client.sessionId);
    const l = vid ? live.get(vid) : undefined;
    if (!l || l.seats[0] === client.sessionId || !l.seats[0]) return;
    const c = clientOf(l.seats[0]);
    if (c) room.send(c, "car:radio", {});
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
    if (BUILDINGS.some((b) => inBuilt(b, x, z))) return;
    shovedAt.set(o.id, now);
    const spot = parkAt(x - off.x, z - off.y, a, heightAt(x, z), { ...(def.props ?? {}), level: 0 });
    const next = { ...def, ...spot };
    room.state.objects.set(o.id, toSchema(next));
    room.rebuildGrid();
    room.rescue(); // (anyone it came to rest on: out from under it)
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

  /** Left still with no one in it: back to being a thing in the world, where it stopped (in a
   *  free bay of the lot, roughly: square in it), its tank and its wear kept. */
  const park = (l: Live) => {
    const v = l.veh;
    live.delete(v.id);
    room.state.vehicles.delete(v.id);
    const o = room.state.objects.get(v.obj);
    if (!o) return;
    const def = fromSchema(o);
    const props: Record<string, unknown> = {
      ...(def.props ?? {}),
      level: 0,
      parkedAt: Date.now(),
      fuel: Math.round(v.fuel * 1000) / 1000,
      grime: Math.round(v.grime * 100) / 100,
      dmg: v.dmg,
    };
    if (!v.grime) delete props.grime;
    if (!v.dmg) delete props.dmg;
    const lot = campusLot(36);
    const bay = bayFor(lot.bays, v.x, v.z, v.a);
    const b = bay ? lot.bays[bay.i] : null;
    const free =
      b &&
      ![...room.state.objects.values()].some((x) => {
        if (x.kind !== "car" || x.id === o.id) return false;
        const p = parkedPose(fromSchema(x));
        return !fromSchema(x).props?.driven && Math.abs(p.x + off.x - b.x) < 2 && Math.abs(p.y + off.y - b.z) < 1.4;
      });
    let spot: ReturnType<typeof parkAt>;
    if (b && bay && free) {
      spot = parkAt(b.x - off.x, b.z - off.y, bay.a, 0, props);
      // (in a bay it stands square, as the lot's cars do)
      delete spot.props.a;
      delete spot.props.hy;
      delete spot.props.parkedAt;
    } else spot = parkAt(v.x - off.x, v.z - off.y, v.a, heightAt(v.x, v.z), props);
    const next = { ...def, ...spot };
    room.state.objects.set(o.id, toSchema(next));
    room.rebuildGrid();
    room.rescue(); // (anyone it stopped on: out from under it — it's solid again)
    if (!config.offline) void api.putObject(next).catch((e) => console.warn("[cars] park", e.message));
  };

  // every car back in a bay of the lot (an admin; the tests): its own first (building.ts
  // seeds car-i in the lot's cars[i]), so the lot put back is the lot as it was, not reshuffled
  const home = (all: boolean) => {
    const lot = campusLot(36);
    const cars = [...room.state.objects.values()].filter((o) => o.kind === "car");
    const own = (id: string) => {
      const c = lot.cars[Number(/^car-(\d+)$/.exec(id)?.[1] ?? -1)];
      const bay = c ? lot.bays.findIndex((b) => b.x === c.x && Math.abs(b.z - c.z) < 1) : -1;
      return c && bay >= 0 ? { c, bay } : null;
    };
    const taken = new Set<number>();
    const bayOf = (x: number, y: number) =>
      lot.bays.findIndex((b) => Math.abs(b.x - (x + off.x)) < 1.6 && Math.abs(b.z - (y + off.y)) < 1.2);
    for (const o of cars) {
      const def = fromSchema(o);
      // (all put back: each lot car's own bay is its)
      const mine = all && !def.props?.driven ? own(o.id) : null;
      if (mine) taken.add(mine.bay);
      if (mine || typeof def.props?.a === "number") continue;
      const pose = parkedPose(def);
      const b = bayOf(pose.x, pose.y);
      if (b >= 0) taken.add(b);
    }
    const put = (def: ReturnType<typeof fromSchema>, x: number, z: number, dir: number) => {
      const spot = parkAt(x - off.x, z - off.y, dir > 0 ? Math.PI : 0, 0, { ...(def.props ?? {}), level: 0 });
      // (in a bay it stands square, as the lot's cars do)
      delete spot.props.a;
      delete spot.props.hy;
      delete spot.props.parkedAt;
      // (towed: cleaned, its dents beaten out, a little fuel to get about on; all put back: fresh)
      if (all) delete spot.props.fuel;
      else spot.props.fuel = Math.max(0.3, num(spot.props.fuel, 0.7));
      delete spot.props.grime;
      delete spot.props.dmg;
      const next = { ...def, ...spot };
      room.state.objects.set(def.id, toSchema(next));
      if (!config.offline) void api.putObject(next).catch((e) => console.warn("[cars] tow", e.message));
    };
    for (const o of cars) {
      const def = fromSchema(o);
      if (def.props?.driven) continue;
      const mine = own(o.id);
      const pose = parkedPose(def);
      if (all && mine) {
        // (already there: left as it is, but for its wear)
        const square = typeof def.props?.a !== "number" && o.rot === (mine.c.dir > 0 ? 0 : 2);
        if (!square || Math.hypot(pose.x + off.x - mine.c.x, pose.y + off.y - mine.c.z) > 0.02)
          put(def, mine.c.x, mine.c.z, mine.c.dir);
        continue;
      }
      if (typeof def.props?.a !== "number") continue;
      const parkedAt = Number(def.props?.parkedAt) || 0;
      const bx = pose.x + off.x;
      const bz = pose.y + off.y;
      const inLot = bx > LOT.x0 && bx < LOT.x1 && bz > LOT.z0 && bz < LOT.z1;
      if (!all) {
        const dry = num(def.props?.fuel, 1) <= 0.01;
        if (inLot || Date.now() - parkedAt < (dry ? EMPTY_TOW_MS : TOW_MS)) continue;
        const near = [...room.state.players.values()].some(
          (p) => p.level === 0 && Math.hypot(p.x + off.x - bx, p.y + off.y - bz) < TOW_NEAR,
        );
        if (near) continue;
      }
      const i = mine && !taken.has(mine.bay) ? mine.bay : lot.bays.findIndex((_, k) => !taken.has(k));
      if (i < 0) continue;
      taken.add(i);
      const b = lot.bays[i];
      put(def, b.x, b.z, b.dir);
    }
    // (all put back: every one fresh, the ones already in their bays too)
    if (all)
      for (const o of [...room.state.objects.values()]) {
        if (o.kind !== "car") continue;
        const def = fromSchema(o);
        const props = def.props ?? {};
        if (props.driven || (props.fuel === undefined && props.grime === undefined && props.dmg === undefined))
          continue;
        const rest = { ...props };
        delete rest.fuel;
        delete rest.grime;
        delete rest.dmg;
        const next = { ...def, props: rest };
        room.state.objects.set(o.id, toSchema(next));
        if (!config.offline) void api.putObject(next).catch((e) => console.warn("[cars] fresh", e.message));
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
        // at the pump: filling (and washed) till it's full, or it moves off
        if (v.filling) {
          if (Math.hypot(v.vx, v.vz) > 0.4 || !l.seats[0] || !pumped(l)) v.filling = false;
          else {
            v.fuel = Math.min(1, v.fuel + dt / FILL_S);
            v.grime = Math.max(0, v.grime - dt / FILL_S);
            if (v.fuel >= 1 && v.grime <= 0) v.filling = false;
          }
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
