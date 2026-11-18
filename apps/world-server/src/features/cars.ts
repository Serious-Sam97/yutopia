import { ANIM, bayId, CAR_COLOURS, faceByte, levelMap, lotLayout, quarterOf } from "@yutopia/shared";
import {
  addHole,
  BUYABLE,
  bayFor,
  burnOut,
  buyLook,
  CAR_FLAGS,
  CAR_HZ,
  type CarAt,
  type CarKind,
  type CarShot,
  type CarSpec,
  type CarWire,
  CHAIN_OFF_MS,
  CHAIN_ON_MS,
  CHAIN_REACH,
  carAlong,
  carAtHome,
  carKindOf,
  chainSpot,
  chainsOf,
  claimShot,
  type Damage,
  damageString,
  FIRE,
  FLATS,
  finiteState,
  freeSpot,
  glassless,
  groundsWorld,
  HOME_CARS,
  type HomeCar,
  headingQuat,
  holesWithout,
  keysDay,
  levelCar,
  MEND_MS,
  MEND_REACH,
  type Mend,
  mayDrive,
  mayMend,
  mend,
  mergeDamage,
  nearestColour,
  nextMend,
  PART,
  type Pane,
  paneOf,
  panesOpen,
  parkAt,
  parkedBody,
  parkedPose,
  parseDamage,
  parseHoles,
  plateOf,
  putIn,
  SEATS_OF,
  boxHits,
  type Solid,
  SPECS,
  type Stored,
  type StoreKind,
  SUNK,
  seatedAlong,
  shotDamage,
  shotWreck,
  spareOf,
  storeOf,
  variantSpec,
  wireCar,
} from "@yutopia/shared/car";
import { atPump, BUILDINGS, heightAt, inBuilt, inLandBounds, LOT, MOTORS, waterAt } from "@yutopia/shared/grounds";
import { addItem, addItemTo, addStack, count, slotAt, takeSlot, takeStack } from "@yutopia/shared/inventory";
import { SWIM } from "@yutopia/shared/move";
import { BOARD_KIND, boardOfOwner, boardsOf, postOf } from "@yutopia/shared/spot";
import { api } from "../api.ts";
import { config } from "../config.ts";
import { onLandChanged, prefetch } from "../land.ts";
import { type Player, Vehicle } from "../schema.ts";
import { fromSchema, toSchema, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";
import { ploughAt, ploughedSweep } from "./ploughed.ts";

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
//
// Not every car lives in the lot (wave 1, docs/plan/34-the-vehicles.md): Main Street's parked
// cars, the farm's pickup, the Church Street pair, the boathouse's 4x4 and the gas station's
// rental (shared car/homes.ts) are made once and kept, each with its home spot — the tow brings
// it back there, and putting the lot back puts each at its own.

const REACH = 4.2; // from its middle to whoever gets in
const LOCK_REACH = 8; // (plan 93 S9) its key fob reaches this far (m)
const CAR_H = 1.5; // a car's height (m): what its door and its knock reach up to
const OUT_V = 2.5; // m/s: slower than this to get in or out
const TOW_MS = 2 * 60 * 60 * 1000;
const TOW_NEAR = 30;
/** (plan 98 F5a) m/s: out of a car slower than this, a stumble; faster, thrown down and rolling (15 km/h) */
const JUMP_STUMBLE_V = 4.2;
const QUIET_MS = 2500; // no state from the driver for this long: rolling on its own
/** (plan 98 phase 24) m/s²: a car whose driver's gone quiet, braked; one with nobody at its wheel, rolling on */
const QUIET_BRAKE = 9;
const ROLL_DECEL = 1.6;
const SHOVE_MAX = 6.5; // m: as far as a knock may move a parked car
const SHOVE_REACH = 12; // m: the knocking car this near where it ended up
const EMPTY_TOW_MS = 10 * 60 * 1000; // a dry car left out: towed sooner
const FILL_S = 8; // s: empty to full at a pump (a wash in the time)
const KNOCK_V = 2; // m/s: as fast as a car must be going to knock someone (a stagger)
const STAGGER_V = 4.2; // m/s (~15 km/h): slower, a stagger; faster, knocked down (plan 93 S3)
// (plan 94 P1) the fire: a wrecked engine's heat from rounds (an engine's 2, its front's 1, elsewhere ½) and crashes —
// smoking past HEAT_SMOKE, burning past HEAT_FIRE, blown at HEAT_BLAST (never before BURN_MIN_MS on fire — plan 95
// F7a) or BURN_MS on fire; the blast's reach and its worst; a burnt-out wreck towed home (made new) after
// BURNT_TOW_MS with nobody near
const HEAT_SMOKE = 2;
const HEAT_FIRE = 5;
const HEAT_BLAST = 9;
const BURN_MS = 25_000;
const BURN_MIN_MS = 10_000;
const BLAST_R = 9;
const BLAST_HURT = 95;
const FIRE_HURT = 6; // a second, seated in a burning car
const BURNT_TOW_MS = 3 * 60 * 1000;
const FIGHT_MS = 45_000; // a fight: someone fired, was shot or hurt this lately (plan 93 S3, F8a)
const KNOCK_REACH = 4; // m: them this near its middle
const UNSTICK_MS = 10_000; // a car pulled out: not again for this long
interface Live {
  veh: Vehicle;
  spec: CarSpec;
  seats: string[];
  last: CarWire | null;
  lastAt: number;
  still: number;
  sp: number; // the most it was going over its last two states (m/s)
  /** (plan 99 F2a) who jumped out of it at its wheel: their client drives it on, rolling, till it stops */
  coaster?: string;
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const num = (x: unknown, or: number) => (typeof x === "number" && Number.isFinite(x) ? x : or);

registerFeature((room: WorldRoom) => {
  const live = new Map<string, Live>();
  const bySid = new Map<string, string>();
  const has = () => !!levelMap(room.map, 0);
  const clientOf = (sid: string) => room.clients.find((c) => c.sessionId === sid);
  const no = (c: WorldClient, why: string) => room.send(c, "car:no", { why });
  // ── (plan 93 S9) lock and alarm: a car with an owner locked from outside by its keys (the owner, or whoever's
  // lent them today); locked, its doors and boot open to nobody else — a stranger's try, a shot, a hard knock set
  // its alarm off (20 s: `props.alarmAt`, every client whoops and flashes it), its owner told if they're here ──
  const ALARM_MS = 20_000;
  const alarm = (id: string, why: "door" | "boot" | "shot" | "knock") => {
    const o = room.state.objects.get(id);
    if (!o) return;
    const def = fromSchema(o);
    const now = Date.now();
    const was = Number(def.props?.alarmAt) || 0;
    if (now - was < ALARM_MS / 2) return;
    room.state.objects.set(id, toSchema({ ...def, props: { ...(def.props ?? {}), alarmAt: now } }));
    const owner = Number(def.props?.ownerId) || 0;
    for (const c of room.clients) {
      const q = room.state.players.get(c.sessionId);
      if (owner && q?.uid === owner) room.send(c, "car:alarm", { id, why, plate: String(def.props?.plate ?? "") });
    }
  };
  room.on("car:lock", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const id = String(m?.id ?? "");
    const o = room.state.objects.get(id);
    if (!p || !o || o.kind !== "car" || p.level !== 0) return;
    const def = fromSchema(o);
    if (!def.props?.ownerId) return;
    if (!mayDrive(def.props, p.uid, Date.now())) return no(client, "owned");
    // (plan 94 G6, F10b: its driver locks it from inside — its empty seats then open to its keys alone; else from
    // beside it, parked)
    const mine = driven(client.sessionId);
    if (mine) {
      if (mine.veh.obj !== id) return;
    } else {
      if (def.props?.driven || bySid.has(client.sessionId)) return;
      const pose = parkedPose(def);
      if (Math.hypot(p.x - pose.x, p.y - pose.y) > LOCK_REACH) return no(client, "far");
    }
    const props: Record<string, unknown> = { ...(def.props ?? {}), locked: m?.on ? 1 : 0 };
    if (!m?.on) {
      delete props.locked;
      delete props.alarmAt;
    }
    room.state.objects.set(id, toSchema({ ...def, props }));
    if (!config.offline) void api.putObject({ ...def, props }).catch((e) => console.warn("[cars] lock", e.message));
  });
  /** The water over the ground at (x, z) (the Grounds'; m, 0 none): a car's in it this deep
   *  (docs/plan/66-the-water.md, S5). */
  const wetAt = (x: number, z: number) => {
    const w = waterAt(x, z);
    return w ? Math.max(0, w.level - heightAt(x, z)) : 0;
  };
  /** A parked car gone down in the water, left two minutes: towed (whoever's, whoever's near). */
  const SUNK_TOW_MS = 2 * 60_000;
  const sunk = (def: ReturnType<typeof fromSchema>) => {
    const pose = parkedPose(def);
    return wetAt(pose.x, pose.y) >= SUNK && Date.now() - (Number(def.props?.parkedAt) || 0) >= SUNK_TOW_MS;
  };
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
    const seats = SEATS_OF[l.spec.kind];
    const s = at(v, seats.at[i][0], seats.at[i][1]);
    p.x = s.x;
    p.y = s.z;
    p.z = v.y - l.spec.cog + seats.hip[i];
    p.level = 0;
    p.a = ANIM.sit;
    p.yaw = faceByte(Math.cos(v.a), Math.sin(v.a), p.yaw);
  };

  /** Someone's own, and its keys aren't theirs: whose it is. */
  const notYours = (c: WorldClient, props: Record<string, unknown> | undefined) =>
    room.send(c, "car:no", { why: "owned", who: String(props?.owner ?? "") });

  room.on("car:enter", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const seat = Number(m?.seat) | 0;
    if (!p || !has() || p.level !== 0 || !Number.isInteger(seat) || seat < 0 || seat > 7) return;
    if (bySid.has(client.sessionId) || p.busy.startsWith("ride:")) return no(client, "busy");
    const id = String(m?.id ?? "");
    let l = live.get(id) ?? live.get(`car:${id}`);
    if (!l) {
      const o = room.state.objects.get(id);
      if (!o || o.kind !== "car") return no(client, "gone");
      const def = fromSchema(o);
      if (def.props?.driven) return no(client, "busy");
      // (MOTORS' vehicles on show are looked at; a car on its way out, gone soon: docs/plan/43)
      if (def.props?.role === "show") return no(client, "show");
      if (def.props?.retire) return no(client, "gone");
      if (seat === 0 && !mayDrive(def.props, p.uid, Date.now())) return notYours(client, def.props);
      const pose = parkedPose(def);
      // (gone down in the water: nobody gets in — it's towed in a minute or two)
      if (wetAt(pose.x, pose.y) >= SUNK) return no(client, "gone");
      // (in three dimensions: shared reach.ts — a car's 1.5 tall)
      if (Math.hypot(p.x - pose.x, p.y - pose.y, room.upOff(p, pose, CAR_H)) > REACH) return no(client, "far");
      // (plan 93 S9: locked — its doors don't open but to its keys; a stranger's try sets its alarm off)
      if (def.props?.locked && !mayDrive(def.props, p.uid, Date.now())) {
        alarm(o.id, "door");
        return no(client, "locked");
      }
      const kind = carKindOf(def.props?.model);
      const spec = SPECS[kind];
      const v = new Vehicle();
      v.id = `car:${o.id}`;
      v.kind = kind;
      v.x = pose.x;
      v.z = pose.y;
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
      v.holes = typeof def.props?.holes === "string" ? def.props.holes : "";
      v.chains = chainsOf(def.props);
      v.towing = typeof def.props?.towing === "string" ? def.props.towing : "";
      v.towedBy = typeof def.props?.towedBy === "string" ? def.props.towedBy : "";
      v.role = typeof def.props?.role === "string" ? def.props.role : "";
      v.plate = typeof def.props?.plate === "string" ? def.props.plate : "";
      l = {
        veh: v,
        spec,
        seats: new Array(Math.max(4, SEATS_OF[kind].at.length)).fill(""),
        last: null,
        lastAt: Date.now(),
        still: 0,
        sp: 0,
      };
      live.set(v.id, l);
      room.state.vehicles.set(v.id, v);
      // its object: out, being driven (no longer in anyone's way where it stood)
      // (plan 93 S9: its alarm off; plan 94 G6, F10b: locked, it stays so while it's driven — its seats its keys')
      const { alarmAt: _a, ...kept } = def.props ?? {};
      room.state.objects.set(o.id, toSchema({ ...def, props: { ...kept, driven: 1 } }));
      room.rebuildGrid();
    } else {
      const at = { x: l.veh.x, y: l.veh.z };
      if (Math.hypot(p.x - at.x, p.y - at.y, room.upOff(p, at, CAR_H)) > REACH) return no(client, "far");
      if (Math.hypot(l.veh.vx, l.veh.vz) > OUT_V) return no(client, "moving");
      // (plan 94 G6, F10b: locked by its driver — its doors open to its keys alone)
      const od = room.state.objects.get(l.veh.obj);
      const op = od ? fromSchema(od).props : undefined;
      if (op?.locked && !mayDrive(op, p.uid, Date.now())) return no(client, "locked");
      if (seat === 0) {
        const od = room.state.objects.get(l.veh.obj);
        const props = od ? fromSchema(od).props : undefined;
        if (!mayDrive(props, p.uid, Date.now())) return notYours(client, props);
      }
    }
    // (only the seats it has: the snowmobile's one)
    if (l.seats[seat] || seat >= SEATS_OF[l.spec.kind].at.length) return no(client, "taken");
    l.seats[seat] = client.sessionId;
    l.veh.seats = seatsStr(l);
    l.veh.riders = l.seats.filter(Boolean).length;
    bySid.set(client.sessionId, l.veh.id);
    p.busy = seat === 0 ? `drive:${l.veh.id}` : `ride:car:${l.veh.id}`;
    place(p, l, seat);
    if (seat === 0) {
      // (plan 98: in by the passenger's door of an empty car — everyone sees them across after)
      const via = Number(m?.via);
      l.veh.via = Number.isInteger(via) && via > 0 && via < l.seats.length && !l.seats[via] ? via : -1;
      l.last = null; // (a new driver: their first state is believed where the car is)
      l.lastAt = Date.now();
      // (their sim clock starts again from 0: everyone else starts its playback again)
      l.veh.jump = (l.veh.jump + 1) & 255;
    }
  });

  room.on("car:state", (client, m) => {
    const vid = bySid.get(client.sessionId);
    // (plan 99 F2a: the car they jumped out of, rolling on — theirs to say till someone takes its wheel)
    const l =
      (vid ? live.get(vid) : undefined) ??
      [...live.values()].find((x) => x.coaster === client.sessionId && !x.seats[0]);
    if (!l || !m || (l.seats[0] !== client.sessionId && !(l.coaster === client.sessionId && !l.seats[0]))) return;
    const now = Date.now();
    const seq = Number(m.seq) >>> 0;
    if (l.last && seq <= l.last.seq) return;
    // too often: dropped (a stuck loop)
    if (now - l.lastAt < 1000 / (CAR_HZ * 2)) return;
    const v = l.veh;
    // where the driver says it is, it is: nothing put back for its pace or its place (the user's
    // call, 2026-10-28: no anticheat for now) — only a state that isn't numbers is let go
    if (!finiteState(m)) return;
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
      fl: (Number(m.fl) >>> 0) & 0x1ffff,
      slip: m.slip,
      grip: Math.max(0, Math.min(255, Number(m.grip) | 0)),
      thr: Math.max(0, Math.min(100, Number(m.thr) | 0)),
      wc: Number(m.wc) >>> 0 || 0,
      seq,
      at: now,
    });
    // (its sim clock: a whole number of ms, or 0 from a client from before it)
    const st = Number(m.st);
    v.st = Number.isFinite(st) && st >= 0 ? Math.min(st, 0xffffffff) >>> 0 : 0;
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
    // (the zones — four from a client before the roof, five now — and the parts it broke: shared
    // car/damage.ts, docs/plan/92 phase 9)
    const d = Array.isArray(m.dmg) ? m.dmg.map(Number) : [];
    const parts = Number(m.parts);
    // (plan 94 P2: what's come off it — doors, lids, the rear bumper, mirrors — kept on it for everyone)
    const wreck = Number(m.wreck);
    if ((d.length === 4 || d.length === 5) && d.every(Number.isFinite)) {
      const was = parseDamage(v.dmg);
      const dm = mergeDamage(was, {
        zones: d,
        parts: Number.isFinite(parts) ? parts : 0,
        wreck: Number.isFinite(wreck) ? wreck : 0,
      });
      // (plan 94 P1: a crash into a front past its worst: smoking; crashed again, hard, while it smokes: heat)
      const rise = dm.zones.reduce((a, z, i) => a + z - (was.zones[i] ?? 0), 0);
      if (dm.zones[0] >= 0.97 && dm.fire === FIRE.none) fireUp(dm, v.obj, HEAT_SMOKE, null);
      else if (dm.fire >= FIRE.smoke && rise > 0.15) fireUp(dm, v.obj, 1.5, null);
      v.dmg = damageString(dm);
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
  // (plan 93 S5) my seat's own window switch: down or up (everyone hears what it lets in and out)
  room.on("car:window", (client, m) => {
    const vid = bySid.get(client.sessionId);
    const l = vid ? live.get(vid) : undefined;
    const seat = l ? l.seats.indexOf(client.sessionId) : -1;
    if (!l || seat < 0 || seat > 7) return;
    const bit = 1 << seat;
    l.veh.win = m?.down ? l.veh.win | bit : l.veh.win & ~bit;
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
    // (high over the car: it passes under them — docs/plan/49-the-height.md)
    // (its body against theirs: over a car's roof, nobody's knocked — shared reach.ts)
    const at = { x: v.x, y: v.z };
    if (Math.hypot(q.x - at.x, q.y - at.y, room.upOff(q, at, CAR_H)) > KNOCK_REACH) return;
    knockedAt.set(sid, now);
    // (plan 93 S3: at a walk's pace a stagger — thrown off from where it came, as a shot throws them —;
    // faster, knocked down)
    if (l.sp < STAGGER_V) {
      q.hitAt = now;
      q.hitYaw = Math.atan2(v.z - q.y, v.x - q.x);
    } else {
      q.fellAt = now;
      q.fellYaw = Math.atan2(v.vz, v.vx);
    }
    // (F8a: hurt only in a fight — they or the driver fired, were shot or hurt lately — by how fast)
    const inFight = (s: string) => now - (room.fightAt.get(s) ?? 0) < FIGHT_MS;
    if (inFight(sid) || inFight(client.sessionId)) {
      const n = Math.round(Math.max(0, Math.min(70, (l.sp - 3) * 4)));
      if (n > 0) room.survival?.hurt(sid, n);
    }
  });
  // stuck (stopped, wedged among trunks, dug in): pulled out to the nearest clear spot on firm
  // ground — the server's pick (the Grounds' solids, the parked cars, the other cars on the move)
  const unstuckAt = new Map<string, number>();
  let skip = "";
  const carWorld = groundsWorld({
    extra: (x, z, r, out: Solid[]) => {
      for (const o of room.state.objects.values()) {
        // (the bays' name boards: a post, its planks along the bay's head — shared spot.ts)
        if (o.kind === BOARD_KIND) {
          const p = postOf(fromSchema(o));
          if (Math.abs(p.x - x) < r + 0.6 && Math.abs(p.z - z) < r + 0.6)
            out.push({ kind: "box", x: p.x, z: p.z, hx: 0.08, hz: 0.55, what: "post" });
          continue;
        }
        if (o.kind !== "car") continue;
        const def = fromSchema(o);
        if (def.props?.driven) continue;
        const b = parkedBody(def);
        const bx = b.x;
        const bz = b.y;
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
    v.jump = (v.jump + 1) & 255; // (drawn there at once by everyone)
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
    if (Math.hypot(was.x - x, was.y - z) > SHOVE_MAX) return;
    if (Math.hypot(l.veh.x - x, l.veh.z - z) > SHOVE_REACH) return;
    if (!inLandBounds(x, z)) return;
    if (BUILDINGS.some((b) => inBuilt(b, x, z))) return;
    shovedAt.set(o.id, now);
    // (plan 93 S9: knocked hard where it stood, locked: its alarm)
    if (def.props?.locked && Math.hypot(was.x - x, was.y - z) > 0.25) alarm(o.id, "knock");
    const spot = parkAt(x, z, a, heightAt(x, z), { ...(def.props ?? {}), level: 0 });
    const next = { ...def, ...spot };
    room.state.objects.set(o.id, toSchema(next));
    room.rebuildGrid();
    room.rescue(); // (anyone it came to rest on: out from under it)
    if (!config.offline) void api.putObject(next).catch((e) => console.warn("[cars] shove", e.message));
  });

  const leaveSeat = (sid: string, out: boolean, swim = false) => {
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
    // (gone down in the water: out of their door into it, afloat — plan 66)
    if (swim) {
      const [lx, lz] = SEATS_OF[l.spec.kind].out[i][0];
      const s = at(l.veh, lx, lz);
      const w = waterAt(s.x, s.z);
      p.x = s.x;
      p.y = s.z;
      p.z = w ? Math.max(heightAt(s.x, s.z), w.level - SWIM.ride) : heightAt(s.x, s.z);
      p.level = 0;
      const c = clientOf(sid);
      if (c) room.send(c, "snap", { x: p.x, y: p.y, z: p.z, level: 0 });
      return;
    }
    // out of the door on their side, else the other's, else round the back
    const g = room.gridFor(p.uid, 0);
    let spot: { x: number; y: number } | null = null;
    const ways = SEATS_OF[l.spec.kind].out[i];
    for (const [lx, lz] of ways) {
      const s = at(l.veh, lx, lz);
      const x = s.x;
      const y = s.z;
      if (g.fits(x, y)) {
        spot = { x, y };
        break;
      }
    }
    if (!spot) {
      const s = at(l.veh, ways[0][0], ways[0][1]);
      spot = g.nearestOpen(s.x, s.z, 6) ?? { x: s.x, y: s.z };
    }
    p.x = spot.x;
    p.y = spot.y;
    p.z = g.onLand(p.x, p.y) ? g.groundAt(p.x, p.y, 0) : 0;
    p.level = 0;
    const c = clientOf(sid);
    if (c) room.send(c, "snap", { x: p.x, y: p.y, z: p.z, level: 0 });
  };

  // (plan 98 phase 25) one driver's car into another's, as the first one's screen had it: told to the other's driver —
  // unless they've told the same crash themselves just now (both felt it already)
  const crashAt = new Map<string, number>();
  room.on("car:hit", (client, m) => {
    const vid = bySid.get(client.sessionId);
    const l = vid ? live.get(vid) : undefined;
    const other = live.get(String(m?.other ?? ""));
    if (!l || !other || l.seats[0] !== client.sessionId || other === l) return;
    const to = other.seats[0];
    if (!to || to === client.sessionId) return;
    const now = Date.now();
    const key = [l.veh.id, other.veh.id].sort().join("|");
    if (now - (crashAt.get(key) ?? 0) < 400) return;
    crashAt.set(key, now);
    if (crashAt.size > 64) for (const [k, t] of crashAt) if (now - t > 5000) crashAt.delete(k);
    const c = clientOf(to);
    if (!c) return;
    const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
    room.send(c, "car:struck", {
      by: l.veh.id,
      j: Math.min(200_000, Math.max(0, num(m.j))),
      vx: num(m.vx),
      vz: num(m.vz),
      m: num(m.m),
      x: num(m.x),
      z: num(m.z),
    });
  });
  // (plan 98 phase 24) a passenger across to the empty driver's seat — the keys theirs —: driving it, without getting out
  room.on("car:swap", (client) => {
    const vid = bySid.get(client.sessionId);
    const l = vid ? live.get(vid) : undefined;
    const p = room.state.players.get(client.sessionId);
    if (!l || !p) return;
    const i = l.seats.indexOf(client.sessionId);
    if (i <= 0 || l.seats[0]) return no(client, "taken");
    const od = room.state.objects.get(l.veh.obj);
    const props = od ? fromSchema(od).props : undefined;
    if (!mayDrive(props, p.uid, Date.now())) return notYours(client, props);
    l.seats[i] = "";
    l.seats[0] = client.sessionId;
    l.veh.seats = seatsStr(l);
    l.veh.via = i;
    p.busy = `drive:${l.veh.id}`;
    place(p, l, 0);
    l.last = null;
    l.lastAt = Date.now();
    l.veh.jump = (l.veh.jump + 1) & 255;
  });
  room.on("car:leave", (client, m) => {
    const vid = bySid.get(client.sessionId);
    const l = vid ? live.get(vid) : undefined;
    const sp = l ? Math.hypot(l.veh.vx, l.veh.vz) : 0;
    // (plan 98 F5a) out of it on the move: only asked for — a stumble at a run's pace, thrown down and rolling past it
    // (hurt by how fast only in a fight); it rolls on without them
    if (l && sp > OUT_V && !m?.jump) return no(client, "moving");
    const vx = l?.veh.vx ?? 0;
    const vz = l?.veh.vz ?? 0;
    const atWheel = !!l && l.seats[0] === client.sessionId;
    leaveSeat(client.sessionId, true);
    if (l && atWheel && sp > OUT_V) l.coaster = client.sessionId;
    const q = room.state.players.get(client.sessionId);
    if (!l || !q || sp <= OUT_V) return;
    const now = Date.now();
    if (sp < JUMP_STUMBLE_V) {
      q.hitAt = now;
      q.hitYaw = Math.atan2(-vz, -vx);
    } else {
      q.fellAt = now;
      q.fellYaw = Math.atan2(vz, vx);
      // (plan 99 F1a: thrown — everyone's screen has them limp on the ragdoll at the car's speed, out of its door)
      room.broadcast("car:thrown", { sid: client.sessionId, vx: vx * 0.85, vz: vz * 0.85 });
    }
    if (now - (room.fightAt.get(client.sessionId) ?? 0) < FIGHT_MS) {
      const n = Math.round(Math.max(0, Math.min(80, (sp - JUMP_STUMBLE_V) * 4.5)));
      if (n > 0) room.survival?.hurt(client.sessionId, n);
    }
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
      holes: v.holes,
      chains: v.chains,
      towing: v.towing,
      towedBy: v.towedBy,
    };
    if (!v.chains) delete props.chains;
    if (!v.towing) delete props.towing;
    if (!v.towedBy) delete props.towedBy;
    if (!v.grime) delete props.grime;
    if (!v.dmg) delete props.dmg;
    if (!v.holes) delete props.holes;
    const lot = lotLayout();
    const bay = bayFor(lot.bays, v.x, v.z, v.a);
    const b = bay ? lot.bays[bay.i] : null;
    // (lent, left in its owner's own bay: the keys are back with them)
    if (props.lentTo && b) {
      const home = boardOfOwner([...room.state.objects.values()].map(fromSchema), Number(props.ownerId));
      if (home?.props?.bay === bayId(b)) keysBack(props, "home");
    }
    const free =
      b &&
      ![...room.state.objects.values()].some((x) => {
        if (x.kind !== "car" || x.id === o.id) return false;
        const p = parkedPose(fromSchema(x));
        return !fromSchema(x).props?.driven && Math.abs(p.x - b.x) < 2 && Math.abs(p.y - b.z) < 1.4;
      });
    let spot: ReturnType<typeof parkAt>;
    if (b && bay && free) {
      spot = parkAt(b.x, b.z, bay.a, 0, props);
      // (in a bay it stands square, as the lot's cars do)
      delete spot.props.a;
      delete spot.props.hy;
      delete spot.props.parkedAt;
    } else spot = parkAt(v.x, v.z, v.a, heightAt(v.x, v.z), props);
    const next = { ...def, ...spot };
    room.state.objects.set(o.id, toSchema(next));
    room.rebuildGrid();
    room.rescue(); // (anyone it stopped on: out from under it — it's solid again)
    if (!config.offline) void api.putObject(next).catch((e) => console.warn("[cars] park", e.message));
  };

  // every car back in a bay of the lot (an admin; the tests): its own first (building.ts
  // seeds car-i in the lot's cars[i]), so the lot put back is the lot as it was, not reshuffled
  const home = (all: boolean) => {
    const lot = lotLayout();
    // (the cars that live away from the lot: to their own homes, not the lot's bays)
    const cars = [...room.state.objects.values()].filter((o) => o.kind === "car" && !homeCar(o, all));
    const own = (id: string) => {
      const c = lot.cars[Number(/^car-(\d+)$/.exec(id)?.[1] ?? -1)];
      const bay = c ? lot.bays.findIndex((b) => b.x === c.x && Math.abs(b.z - c.z) < 1) : -1;
      return c && bay >= 0 ? { c, bay } : null;
    };
    // (someone's own bays, docs/plan/43-the-spot.md: a pool car never parked into one, and one
    // left there towed out; by owner)
    const claimed = new Map<number, number>();
    for (const [id, bd] of boardsOf([...room.state.objects.values()].map(fromSchema))) {
      const i = lot.bays.findIndex((b) => bayId(b) === id);
      if (i >= 0) claimed.set(i, Number(bd.props?.ownerId) || 0);
    }
    const taken = new Set<number>(claimed.keys());
    const bayOf = (x: number, y: number) =>
      lot.bays.findIndex((b) => Math.abs(b.x - x) < 1.6 && Math.abs(b.z - y) < 1.2);
    /** In someone's own bay, not theirs to be in. */
    const intruding = (def: ReturnType<typeof fromSchema>) => {
      const pose = parkedPose(def);
      const owner = claimed.get(bayOf(pose.x, pose.y));
      return owner !== undefined && Number(def.props?.ownerId) !== owner;
    };
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
      const spot = parkAt(x, z, dir > 0 ? Math.PI : 0, 0, { ...(def.props ?? {}), level: 0 });
      // (in a bay it stands square, as the lot's cars do)
      delete spot.props.a;
      delete spot.props.hy;
      delete spot.props.parkedAt;
      // (towed: cleaned, its dents beaten out, a little fuel to get about on; all put back: fresh)
      if (all) delete spot.props.fuel;
      else spot.props.fuel = Math.max(0.3, num(spot.props.fuel, 0.7));
      delete spot.props.grime;
      delete spot.props.dmg;
      delete spot.props.holes;
      const next = { ...def, ...spot };
      room.state.objects.set(def.id, toSchema(next));
      if (!config.offline) void api.putObject(next).catch((e) => console.warn("[cars] tow", e.message));
    };
    for (const o of cars) {
      const def = fromSchema(o);
      // (someone's own is never towed: it stays where it's left, their GPS shows it — but out of the
      // water it went down in)
      const down = sunk(def);
      // (plan 94 P1: burnt out — towed home and made new, someone's own too)
      const burnt = parseDamage(def.props?.dmg).fire === FIRE.burnt;
      if (def.props?.driven || (def.props?.ownerId && !down && !burnt)) continue;
      const mine = own(o.id);
      const pose = parkedPose(def);
      const out = intruding(def);
      if (all && mine && !claimed.has(mine.bay)) {
        // (already there: left as it is, but for its wear)
        const square = typeof def.props?.a !== "number" && quarterOf(o) === (mine.c.dir > 0 ? 0 : 2);
        if (!square || Math.hypot(pose.x - mine.c.x, pose.y - mine.c.z) > 0.02)
          put(def, mine.c.x, mine.c.z, mine.c.dir);
        continue;
      }
      if (typeof def.props?.a !== "number" && !out && !down && !burnt && !(all && mine)) continue;
      const parkedAt = Number(def.props?.parkedAt) || 0;
      const bx = pose.x;
      const bz = pose.y;
      const inLot = bx > LOT.x0 && bx < LOT.x1 && bz > LOT.z0 && bz < LOT.z1;
      if (!all && !down) {
        // (plan 93 S1: shot dead, as stranded as dry)
        const dry = num(def.props?.fuel, 1) <= 0.01 || !!(parseDamage(def.props?.dmg).parts & PART.engineDead);
        // (in someone's bay: out the next time nobody's near, however long it's been there)
        if (
          burnt
            ? Date.now() - parkedAt < BURNT_TOW_MS
            : !out && (inLot || Date.now() - parkedAt < (dry ? EMPTY_TOW_MS : TOW_MS))
        )
          continue;
        const near = [...room.state.players.values()].some(
          (p) => p.level === 0 && Math.hypot(p.x - bx, p.y - bz) < TOW_NEAR,
        );
        if (near) continue;
      }
      // (a towed stranger: into a plain bay, never the visitors' or the accessible ones)
      // (and never into someone's own)
      const i =
        mine && !taken.has(mine.bay) ? mine.bay : lot.bays.findIndex((b, k) => b.kind === "plain" && !taken.has(k));
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
    if (p?.admin) room.adminLog(p, "cars", null, "every car home");
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
    if (cars.some((o) => /^car-\d+$/.test(o.id) && fromSchema(o).props?.model === "offroad")) return;
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

  // the cars that live away from the lot: made once (each where it lives), kept
  // ── your own, from the dealer (docs/plan/43-the-spot.md, phase 2) ──
  // At MOTORS someone picks a vehicle, its colour and plate (`car:buy`): it's there beside them,
  // in the collection bay (or the nearest free spot), a full tank, theirs. One each: the old one is
  // retired (no one gets in it) and goes the next time nobody's near it.
  const BUY_NEAR = 16; // m from the forecourt
  room.on("car:buy", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    if (!p || !p.uid || !has() || p.level !== 0) return;
    if (/^(drive|ride):/.test(p.busy)) return no(client, "busy");
    const bx = p.x;
    const bz = p.y;
    const Y = MOTORS.yard;
    if (bx < Y.x0 - BUY_NEAR - 14 || bx > Y.x1 + BUY_NEAR || bz < Y.z0 - BUY_NEAR || bz > Y.z1 + BUY_NEAR)
      return no(client, "far");
    const model = String(m?.model ?? "");
    if (!BUYABLE.includes(model as CarKind)) return no(client, "model");
    // its look chosen (docs/plan/92-the-cars.md F13b): one the panel offers, or none (seeded by its id)
    const look = m?.look == null ? null : buyLook(model as CarKind, m.look);
    if (m?.look != null && !look) return no(client, "look");
    const colour = look ? nearestColour(look.colour) : Number(m?.colour);
    if (!Number.isInteger(colour) || colour < 0 || colour >= CAR_COLOURS.length) return no(client, "model");
    const plate = plateOf(String(m?.plate ?? ""), p.name);
    const spec = variantSpec(model as CarKind, look?.variant);
    // the collection bay, if nothing's in it; else the nearest free spot by them
    const c = MOTORS.collect;
    const inBay = [...room.state.objects.values()].some((o) => {
      if (o.kind !== "car") return false;
      const b = parkedBody(fromSchema(o));
      return Math.hypot(b.x - c.x, b.y - c.z) < 2.6;
    });
    const at = inBay ? freeSpot(carWorld, spec, bx, bz, c.a, 24) : { x: c.x, z: c.z, a: c.a };
    if (!at) return no(client, "full");
    // (the old one: retired, gone when nobody's looking — the minute's tick)
    for (const o of room.state.objects.values()) {
      if (o.kind !== "car") continue;
      const def = fromSchema(o);
      if (Number(def.props?.ownerId) !== p.uid || def.props?.retire) continue;
      const next = { ...def, props: { ...(def.props ?? {}), retire: 1 } };
      room.state.objects.set(o.id, toSchema(next));
      if (!config.offline) void api.putObject(next).catch((e) => console.warn("[cars] retire", e.message));
    }
    const props: Record<string, unknown> = {
      level: 0,
      variant: colour,
      plate,
      ownerId: p.uid,
      // (not `ownerName`: the world labels whatever has one — a desk, a name board)
      owner: p.name,
      fuel: 1,
    };
    if (model !== "sedan") props.model = model;
    if (look) props.look = look;
    const id = `own-${p.uid}-${Date.now().toString(36)}`;
    const next = { id, kind: "car", ...parkAt(at.x, at.z, at.a, heightAt(at.x, at.z), props) };
    room.state.objects.set(id, toSchema(next));
    room.rebuildGrid();
    room.rescue();
    if (!config.offline) void api.putObject(next).catch((e) => console.warn("[cars] buy", e.message));
    room.send(client, "car:bought", { id });
  });
  // "Repaint" (docs/plan/92-the-cars.md F13b): my own car's look, chosen again — parked at home (my own
  // bay of the lot, or MOTORS' forecourt), nobody in it; free for now. Its variant's numbers come with
  // it: the next time it's driven (the client reads its spec from its look).
  room.on("car:look", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    if (!p?.uid || !has()) return;
    const id = String(m?.id ?? "");
    const o = room.state.objects.get(id);
    if (!o || o.kind !== "car") return no(client, "gone");
    const def = fromSchema(o);
    const pr = def.props ?? {};
    if (Number(pr.ownerId) !== p.uid || pr.retire) return no(client, "notyours");
    if (pr.driven || live.has(`car:${id}`)) return no(client, "busy");
    const look = buyLook(carKindOf(pr.model), m?.look);
    if (!look) return no(client, "look");
    if (!carAtHome(def, [...room.state.objects.values()].map(fromSchema), MOTORS.yard)) return no(client, "home");
    const props: Record<string, unknown> = { ...pr, look, variant: nearestColour(look.colour) };
    const next = { ...def, props };
    room.state.objects.set(id, toSchema(next));
    room.rebuildGrid();
    room.rescue();
    if (!config.offline) void api.putObject(next).catch((e) => console.warn("[cars] look", e.message));
    room.send(client, "car:looked", { id });
  });
  // ── an admin's (docs/plan/48-the-admin.md): a vehicle spawned in front of them, any of the
  // kinds, anyone's to drive; gone when they clear what they spawned, or at the day's end
  // (retired: gone once nobody's near it, as a sold car goes) ──
  room.on("mod:spawn-car", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    if (!p?.admin || !has() || p.level !== 0) return;
    if (/^(drive|ride):/.test(p.busy)) return no(client, "busy");
    const model = String(m?.model ?? "");
    if (!Object.hasOwn(SPECS, model)) return no(client, "model");
    const colour = Number(m?.colour);
    if (!Number.isInteger(colour) || colour < 0 || colour >= CAR_COLOURS.length) return no(client, "model");
    const spec = SPECS[model as CarKind];
    // a few metres ahead, facing my way (the world's x, z)
    const yaw = (p.yaw / 256) * Math.PI * 2;
    const bx = p.x + Math.cos(yaw) * 5;
    const bz = p.y + Math.sin(yaw) * 5;
    const at = freeSpot(carWorld, spec, bx, bz, yaw, 14);
    if (!at) return no(client, "full");
    const props: Record<string, unknown> = {
      level: 0,
      variant: colour,
      plate: plateOf(String(m?.plate ?? ""), p.name),
      fuel: 1,
      spawnedBy: p.uid,
      spawnDay: keysDay(Date.now()),
    };
    if (model !== "sedan") props.model = model;
    const id = `adm-${p.uid}-${Date.now().toString(36)}`;
    const next = { id, kind: "car", ...parkAt(at.x, at.z, at.a, heightAt(at.x, at.z), props) };
    room.state.objects.set(id, toSchema(next));
    room.rebuildGrid();
    room.rescue();
    if (!config.offline) void api.putObject(next).catch((e) => console.warn("[cars] spawn", e.message));
    room.adminLog(p, "spawn", null, `a ${model}`);
  });
  /** Spawned cars (one admin's, or every one from before today): retired, gone once nobody's near. */
  const retireSpawned = (uid: number | null) => {
    const today = keysDay(Date.now());
    let n = 0;
    for (const o of [...room.state.objects.values()]) {
      if (o.kind !== "car") continue;
      const def = fromSchema(o);
      const by = Number(def.props?.spawnedBy);
      if (!by || def.props?.retire) continue;
      if (uid === null ? Number(def.props?.spawnDay) === today : by !== uid) continue;
      const next = { ...def, props: { ...(def.props ?? {}), retire: 1 } };
      room.state.objects.set(o.id, toSchema(next));
      if (!config.offline) void api.putObject(next).catch((e) => console.warn("[cars] unspawn", e.message));
      n++;
    }
    if (n) retire();
    return n;
  };
  room.on("mod:clear", (client) => {
    const p = room.state.players.get(client.sessionId);
    if (!p?.admin) return;
    const n = retireSpawned(p.uid);
    room.send(client, "toast", {
      text: n ? `Cleared: ${n} vehicle${n > 1 ? "s" : ""}.` : "Nothing of yours to clear.",
    });
    if (n) room.adminLog(p, "clear", null, `${n} vehicle${n > 1 ? "s" : ""}`);
  });
  // someone out of their car (as getting out does: by their door)
  room.on("mod:unseat", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const target = [...room.state.players.values()].find((q) => q.uid === Number(m?.userId));
    if (!p?.admin || !target || !bySid.has(target.sid)) return;
    leaveSeat(target.sid, true);
    room.adminLog(p, "unseat", target);
  });

  // ── lending the keys (docs/plan/43-the-spot.md, phase 3) ──
  // The owner, on someone's card: `car:lend` with their uid (one at a time), or null to take them
  // back. They come back by themselves when the car's left in the owner's bay, and at the world's
  // day's end. Taken back mid-drive, the borrower finishes it: the wheel's checked getting in.
  /** Someone in the room by their uid. */
  const clientOfUid = (uid: number) =>
    room.clients.find((c) => room.state.players.get(c.sessionId)?.uid === uid) ?? null;
  /** A car's keys back with its owner (its props changed here: the caller saves them). */
  const keysBack = (props: Record<string, unknown>, why: "taken" | "home" | "day") => {
    const to = clientOfUid(Number(props.lentTo));
    if (to)
      room.send(to, "car:keys", {
        from: String(props.owner ?? ""),
        plate: String(props.plate ?? ""),
        lent: false,
        why,
      });
    delete props.lentTo;
    delete props.lentName;
    delete props.lentDay;
  };
  const ownCar = (uid: number) =>
    [...room.state.objects.values()].find((o) => {
      if (o.kind !== "car") return false;
      const pr = fromSchema(o).props;
      return Number(pr?.ownerId) === uid && !pr?.retire;
    });
  room.on("car:lend", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    if (!p?.uid) return;
    const o = ownCar(p.uid);
    if (!o) return no(client, "nocar");
    const def = fromSchema(o);
    const props: Record<string, unknown> = { ...(def.props ?? {}) };
    const to = m?.to == null ? null : Number(m.to);
    if (to === null) {
      if (!props.lentTo) return;
      keysBack(props, "taken");
    } else {
      const q = [...room.state.players.values()].find((x) => x.uid === to && !x.bot);
      if (!q || to === p.uid) return no(client, "gone");
      if (props.lentTo && Number(props.lentTo) !== to) keysBack(props, "taken");
      props.lentTo = to;
      props.lentName = q.name;
      props.lentDay = keysDay(Date.now());
      const c = clientOfUid(to);
      if (c) room.send(c, "car:keys", { from: p.name, plate: String(props.plate ?? ""), lent: true });
    }
    const next = { ...def, props };
    room.state.objects.set(o.id, toSchema(next));
    if (!config.offline) void api.putObject(next).catch((e) => console.warn("[cars] keys", e.message));
  });
  /** Keys lent on a day that's over: back with their owners. */
  const keysAtDayEnd = () => {
    const today = keysDay(Date.now());
    for (const o of [...room.state.objects.values()]) {
      if (o.kind !== "car") continue;
      const def = fromSchema(o);
      if (!def.props?.lentTo || Number(def.props.lentDay) === today) continue;
      const props = { ...def.props };
      keysBack(props, "day");
      const next = { ...def, props };
      room.state.objects.set(o.id, toSchema(next));
      if (!config.offline) void api.putObject(next).catch((e) => console.warn("[cars] keys", e.message));
    }
  };

  /** The retired cars nobody's near: gone. */
  const retire = () => {
    for (const o of [...room.state.objects.values()]) {
      if (o.kind !== "car") continue;
      const def = fromSchema(o);
      if (!def.props?.retire || def.props?.driven) continue;
      const pose = parkedPose(def);
      const near = [...room.state.players.values()].some(
        (q) => q.level === 0 && Math.hypot(q.x - pose.x, q.y - pose.y) < TOW_NEAR,
      );
      if (near) continue;
      room.state.objects.delete(o.id);
      if (!config.offline) void api.deleteObject(o.id).catch((e) => console.warn("[cars] retired", e.message));
    }
    room.rebuildGrid();
  };

  const homeOf = new Map(HOME_CARS.map((h) => [h.id, h]));
  const homeProps = (h: HomeCar, was: Record<string, unknown> = {}) => {
    const props: Record<string, unknown> = { ...was, level: 0, variant: h.colour, home: 1 };
    if (h.model !== "sedan") props.model = h.model;
    if (h.wagon) props.wagon = 1;
    if (h.snowy) props.snowy = 1;
    if (h.role) props.role = h.role;
    return props;
  };
  const putHome = (h: HomeCar, was?: Record<string, unknown>, fresh = false) => {
    const props = homeProps(h, was);
    delete props.parkedAt;
    if (fresh) {
      delete props.fuel;
      delete props.grime;
      delete props.dmg;
      delete props.holes;
    } else props.fuel = Math.max(0.3, num(props.fuel, 0.7));
    const spot = parkAt(h.x, h.z, h.a, heightAt(h.x, h.z), props);
    const next = { id: h.id, kind: "car", ...spot };
    room.state.objects.set(h.id, toSchema(next));
    if (!config.offline) void api.putObject(next).catch((e) => console.warn("[cars] home", e.message));
  };
  let homesMade = false;
  // (the land under each home made ahead, in the worker, while the room's made: putHome asks its height — on the
  // tick, a chunk made then is ~6–30 ms, the land's 35 homes ~250 ms — docs/plan/89-the-weight.md phase 8)
  for (const h of HOME_CARS) prefetch(h.x, h.z, 2);
  const makeHomes = () => {
    const cars = [...room.state.objects.values()].filter((o) => o.kind === "car");
    if (cars.length < 6) return;
    homesMade = true;
    let made = 0;
    for (const h of HOME_CARS)
      if (!room.state.objects.get(h.id)) {
        putHome(h, undefined, true);
        made++;
      }
    if (made) room.rebuildGrid();
  };
  /** A car that lives away from the lot, left away from its home: towed back there (or, `all`, put back). */
  const homeCar = (o: { id: string }, all: boolean): boolean => {
    const h = homeOf.get(o.id);
    if (!h) return false;
    const def = fromSchema(o as Parameters<typeof fromSchema>[0]);
    if (def.props?.driven) return true;
    const pose = parkedPose(def);
    const bx = pose.x;
    const bz = pose.y;
    const away = Math.hypot(bx - h.x, bz - h.z) > 1.5;
    if (all) {
      putHome(h, def.props ?? {}, true);
      return true;
    }
    if (!away) return true;
    // (gone down in the water, left two minutes: home, whoever's near)
    if (sunk(def)) {
      const props = { ...(def.props ?? {}) };
      delete props.grime;
      delete props.dmg;
      delete props.holes;
      putHome(h, props);
      return true;
    }
    const parkedAt = Number(def.props?.parkedAt) || 0;
    // (plan 93 S1: shot dead, as stranded as dry)
    const dry = num(def.props?.fuel, 1) <= 0.01 || !!(parseDamage(def.props?.dmg).parts & PART.engineDead);
    if (Date.now() - parkedAt < (dry ? EMPTY_TOW_MS : TOW_MS)) return true;
    const near = [...room.state.players.values()].some(
      (p) =>
        p.level === 0 && (Math.hypot(p.x - bx, p.y - bz) < TOW_NEAR || Math.hypot(p.x - h.x, p.y - h.z) < TOW_NEAR),
    );
    if (near) return true;
    const props = { ...(def.props ?? {}) };
    delete props.grime;
    delete props.dmg;
    delete props.holes;
    putHome(h, props);
    return true;
  };

  let towAt = Date.now() + 60_000;
  let sweepAt = 0;
  // god mode's edits laid (docs/plan/53-the-god-mode.md): a car nobody's driving set down on the
  // land where it changed
  const offLand = onLandChanged((cs) => {
    const dirty = new Set(cs.map(([x, z]) => `${x},${z}`));
    for (const l of live.values()) {
      const v = l.veh;
      if (l.seats[0] || !dirty.has(`${Math.floor(v.x / 32)},${Math.floor(v.z / 32)}`)) continue;
      v.y = heightAt(v.x, v.z) + l.spec.cog;
    }
  });

  // ── shots meet cars (docs/plan/93 S1): the nearest along a ray, driven or parked — what it struck, the
  // round on or stopped; taken (`apply`): the car's damage (only ever more), its hole. A parked one's kept on
  // its object (saved a moment after: a burst is one save) ──
  const saveSoon = new Map<string, ReturnType<typeof setTimeout>>();
  const saveLater = (id: string) => {
    if (config.offline || saveSoon.has(id)) return;
    saveSoon.set(
      id,
      setTimeout(() => {
        saveSoon.delete(id);
        const o = room.state.objects.get(id);
        if (o) void api.putObject(fromSchema(o)).catch((e) => console.warn("[cars] shot", e.message));
      }, 2500),
    );
  };
  // ── a car's own storage (docs/plan/93 S4): its boot — stood behind it, parked —, its glove box — sat in its
  // front, driven or not; what's put in kept on its object (saved a moment after) ──
  const BOOT_REACH = 1.7; // m: from the middle of its back to whoever opens it
  const storeObj = (sid: string, p: Player, kind: StoreKind, id: string) => {
    const o = room.state.objects.get(id);
    if (!o || o.kind !== "car" || p.hp <= 0 || p.downAt) return null;
    const def = fromSchema(o);
    if (kind === "glove") {
      const vid = bySid.get(sid);
      const l = vid ? live.get(vid) : undefined;
      if (!l || l.veh.obj !== id || l.seats.indexOf(sid) > 1 || l.seats.indexOf(sid) < 0) return null;
      return def;
    }
    if (def.props?.driven || bySid.has(sid) || p.level !== 0) return null;
    const pose = parkedPose(def);
    const back = SPECS[carKindOf(def.props?.model)].body.behind;
    // (plan 93 S9: a locked boot opens to its keys; a stranger's try sets the alarm off)
    if (def.props?.locked && !mayDrive(def.props, p.uid, Date.now())) {
      alarm(id, "boot");
      return null;
    }
    const rx = pose.x - Math.cos(pose.a) * (back + 0.35);
    const ry = pose.y - Math.sin(pose.a) * (back + 0.35);
    return Math.hypot(p.x - rx, p.y - ry) <= BOOT_REACH ? def : null;
  };
  const storeKind = (k: unknown): StoreKind | null => (k === "boot" || k === "glove" ? k : null);
  const putStore = (id: string, def: ReturnType<typeof fromSchema>, kind: StoreKind, store: Stored[]) => {
    const props: Record<string, unknown> = { ...(def.props ?? {}), [kind]: store };
    if (!store.length) delete props[kind];
    room.state.objects.set(id, toSchema({ ...def, props }));
    saveLater(id);
  };
  // (plan 94 G3) its boot open, or shut: whoever has it open `boot:<id>` — everyone's clients lift its lid
  room.on("car:boot", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const id = String(m?.id ?? "");
    if (!p) return;
    if (!m?.open) {
      if (p.busy.startsWith("boot:")) p.busy = "";
      return;
    }
    if (p.busy && !p.busy.startsWith("boot:")) return;
    if (!storeObj(client.sessionId, p, "boot", id)) return;
    p.busy = `boot:${id}`;
  });
  // (plan 94 G4, F9b) the ruts pressed lately, for whoever joins: each driver's client says its own (its front
  // wheels' in deep snow and mud, a stretch at a time); kept RUTS_KEEP_MS, RUTS_MAX of them
  const RUTS_KEEP_MS = 10 * 60_000;
  const RUTS_MAX = 4000;
  const ruts: { t: number; s: [number, number, number, number] }[] = [];
  room.on("car:ruts", (client, m) => {
    const l = driven(client.sessionId);
    const segs = Array.isArray(m?.segs) ? m.segs : [];
    if (!l || segs.length % 4 || segs.length > 400) return;
    const now = Date.now();
    const v = l.veh;
    for (let i = 0; i < segs.length; i += 4) {
      const s4 = segs.slice(i, i + 4).map(Number) as [number, number, number, number];
      if (!s4.every(Number.isFinite)) continue;
      const [ax, az, bx, bz] = s4.map((c) => c / 100);
      // (a stretch of a step or two, near the car it's from)
      if (Math.hypot(bx - ax, bz - az) > 3.5 || Math.hypot(bx - v.x, bz - v.z) > 40) continue;
      ruts.push({ t: now, s: s4.map(Math.round) as [number, number, number, number] });
    }
    while (ruts.length > RUTS_MAX || (ruts.length && now - ruts[0].t > RUTS_KEEP_MS)) ruts.shift();
  });
  // (plan 94 G4: the ruts of the last minutes, for someone just in — asked once its client listens)
  room.on("car:ruts-hello", (client) => {
    const now = Date.now();
    const segs = ruts.filter((r) => now - r.t < RUTS_KEEP_MS).flatMap((r) => r.s);
    if (segs.length) room.send(client, "car:ruts", { segs });
  });
  /** (plan 94 G3) Boots left open by someone walked off (or the car gone, or driven): shut. */
  const bootsShut = () => {
    for (const [sid, p] of room.state.players) {
      if (!p.busy.startsWith("boot:")) continue;
      const id = p.busy.slice(5);
      const o = room.state.objects.get(id);
      if (!o) {
        p.busy = "";
        continue;
      }
      const def = fromSchema(o);
      const pose = parkedPose(def);
      const back = SPECS[carKindOf(def.props?.model)].body.behind;
      const rx = pose.x - Math.cos(pose.a) * (back + 0.35);
      const ry = pose.y - Math.sin(pose.a) * (back + 0.35);
      if (def.props?.driven || p.level !== 0 || Math.hypot(p.x - rx, p.y - ry) > BOOT_REACH + 0.6) p.busy = "";
      void sid;
    }
  };
  // something from the pack (a slot, `n` of a stack or all) into it
  room.on("car:put", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const kind = storeKind(m?.kind);
    const inv = room.survival?.inventory(client.sessionId);
    const id = String(m?.id ?? "");
    if (!p || !kind || !inv) return;
    const def = storeObj(client.sessionId, p, kind, id);
    if (!def) return;
    const from = Number(m?.from);
    const it = slotAt(inv, from);
    if (!it) return;
    const store = storeOf(def.props, kind);
    const want = "loaded" in it ? 1 : Math.max(1, Math.min(it.n, Number(m?.n) || it.n));
    const got = takeSlot(inv, from, "loaded" in it ? undefined : want);
    if (!got) return;
    const n = putIn(store, kind, got as Stored);
    // (no room for it all: what didn't go back where it came from)
    if (n < ("loaded" in got ? 1 : got.n))
      addItemTo(inv, from, { ...(got as Stored), n: ("loaded" in got ? 1 : got.n) - n });
    putStore(id, def, kind, store);
    room.survival?.changed(client.sessionId);
  });
  // something in it (its place `i`; −1: all of it) into the pack — into slot `slot` if it's dragged there
  room.on("car:take", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const kind = storeKind(m?.kind);
    const inv = room.survival?.inventory(client.sessionId);
    const id = String(m?.id ?? "");
    if (!p || !kind || !inv) return;
    const def = storeObj(client.sessionId, p, kind, id);
    if (!def) return;
    const store = storeOf(def.props, kind);
    const i = Number(m?.i);
    const which = i === -1 ? store.map((_, k) => k) : Number.isInteger(i) && store[i] ? [i] : [];
    if (!which.length) return;
    const slot = m?.slot === undefined ? undefined : Number(m.slot);
    for (const k of which) {
      const s = store[k];
      const n =
        slot !== undefined && which.length === 1 && slotAt(inv, slot) !== undefined
          ? addItemTo(inv, slot, s)
          : addItem(inv, s);
      if ("loaded" in s && s.loaded !== undefined) s.n = n ? 0 : 1;
      else s.n -= n;
    }
    putStore(
      id,
      def,
      kind,
      store.filter((s) => s.n > 0),
    );
    room.survival?.changed(client.sessionId);
  });

  // ── (plan 93 S6) snow chains: knelt by a parked car's wheel (its spot out from its side), one fitted from the
  // pack in CHAIN_ON_MS, or taken off back into it in CHAIN_OFF_MS; stood up or walked off: not done ──
  const chainJobs = new Map<string, ReturnType<typeof setTimeout>>();
  const chainEnd = (sid: string) => {
    const t = chainJobs.get(sid);
    if (t) clearTimeout(t);
    chainJobs.delete(sid);
    const p = room.state.players.get(sid);
    if (p?.busy.startsWith("chain:") || p?.busy.startsWith("mend:")) p.busy = "";
  };
  room.on("car:chain", (client, m) => {
    const sid = client.sessionId;
    const p = room.state.players.get(sid);
    const inv = room.survival?.inventory(sid);
    const id = String(m?.id ?? "");
    const wheel = Number(m?.wheel);
    const on = !!m?.on;
    chainEnd(sid);
    if (!p || !inv || !Number.isInteger(wheel) || wheel < 0 || wheel > 3) return;
    const o = room.state.objects.get(id);
    if (!o || o.kind !== "car" || p.hp <= 0 || p.downAt || p.level !== 0 || bySid.has(sid) || p.busy) return;
    const def = fromSchema(o);
    if (def.props?.driven) return;
    const spec = SPECS[carKindOf(def.props?.model)];
    const pose = parkedPose(def);
    const at = chainSpot(spec, pose.x, pose.y, pose.a, wheel);
    if (Math.hypot(p.x - at.x, p.y - at.y) > CHAIN_REACH) return no(client, "far");
    const has = !!(chainsOf(def.props) & (1 << wheel));
    if (on === has) return;
    if (on && count(inv, "chains") < 1) return no(client, "chains");
    const x0 = p.x;
    const y0 = p.y;
    p.busy = `chain:${id}:${wheel}`;
    chainJobs.set(
      sid,
      setTimeout(
        () => {
          chainJobs.delete(sid);
          const q = room.state.players.get(sid);
          if (!q || q.busy !== `chain:${id}:${wheel}`) return;
          q.busy = "";
          const inv2 = room.survival?.inventory(sid);
          const o2 = room.state.objects.get(id);
          if (!inv2 || !o2 || Math.hypot(q.x - x0, q.y - y0) > 0.6) return;
          const d2 = fromSchema(o2);
          if (d2.props?.driven) return;
          const bits = chainsOf(d2.props);
          if (on ? takeStack(inv2, "chains", 1) !== 1 : addStack(inv2, "chains", 1) !== 1) return;
          const props: Record<string, unknown> = {
            ...(d2.props ?? {}),
            chains: on ? bits | (1 << wheel) : bits & ~(1 << wheel),
          };
          if (!props.chains) delete props.chains;
          room.state.objects.set(id, toSchema({ ...d2, props }));
          saveLater(id);
          room.survival?.changed(sid);
        },
        on ? CHAIN_ON_MS : CHAIN_OFF_MS,
      ),
    );
  });
  // (moved off, or left: the job's dropped)
  room.on("car:chain-stop", (client) => chainEnd(client.sessionId));

  // ── (plan 93 S7) mending a parked car: stood at its nose (its bonnet up), the next thing under it (shared
  // car/repair.ts); knelt at a wheel, a flat changed for its spare. At a pump (the garage's bay) everything,
  // free; elsewhere a wrench from the pack, the glass not. A while each (MEND_MS); walked off: not done ──
  const noseOf = (def: ReturnType<typeof fromSchema>) => {
    const spec = SPECS[carKindOf(def.props?.model)];
    const pose = parkedPose(def);
    const k = spec.body.ahead + 0.45;
    const o = (spec.body.ahead - spec.body.behind) / 2;
    return {
      spec,
      pose,
      x: pose.x + Math.cos(pose.a) * k,
      y: pose.y + Math.sin(pose.a) * k,
      garage: atPump(pose.x + Math.cos(pose.a) * o, pose.y + Math.sin(pose.a) * o),
    };
  };
  room.on("car:mend", (client, m) => {
    const sid = client.sessionId;
    const p = room.state.players.get(sid);
    const inv = room.survival?.inventory(sid);
    const id = String(m?.id ?? "");
    const what = String(m?.what ?? "") as Mend;
    const wheel = Number(m?.wheel ?? 0);
    chainEnd(sid);
    if (!p || !inv || !(what in MEND_MS) || !Number.isInteger(wheel) || wheel < 0 || wheel > 3) return;
    const o = room.state.objects.get(id);
    if (!o || o.kind !== "car" || p.hp <= 0 || p.downAt || p.level !== 0 || bySid.has(sid) || p.busy) return;
    const def = fromSchema(o);
    if (def.props?.driven) return;
    const at = noseOf(def);
    const spot = what === "tyre" ? chainSpot(at.spec, at.pose.x, at.pose.y, at.pose.a, wheel) : at;
    if (Math.hypot(p.x - spot.x, p.y - spot.y) > MEND_REACH) return no(client, "far");
    const dm = parseDamage(def.props?.dmg);
    if (what === "tyre" ? !(dm.parts & FLATS[wheel]) : nextMend(dm, at.garage) !== what) return;
    if (!mayMend(what, { garage: at.garage, wrench: count(inv, "wrench") > 0, spare: spareOf(def.props) }))
      return no(client, what === "glass" ? "garage" : what === "tyre" ? "spare" : "wrench");
    const x0 = p.x;
    const y0 = p.y;
    const busy = `mend:${id}:${what}${what === "tyre" ? wheel : ""}`;
    p.busy = busy;
    chainJobs.set(
      sid,
      setTimeout(() => {
        chainJobs.delete(sid);
        const q = room.state.players.get(sid);
        if (!q || q.busy !== busy) return;
        q.busy = "";
        const o2 = room.state.objects.get(id);
        if (!o2 || Math.hypot(q.x - x0, q.y - y0) > 0.6) return;
        const d2 = fromSchema(o2);
        if (d2.props?.driven) return;
        const r = mend(parseDamage(d2.props?.dmg), what, wheel);
        const props: Record<string, unknown> = { ...(d2.props ?? {}), dmg: damageString(r.dm) };
        if (r.zone >= 0 && typeof props.holes === "string") props.holes = holesWithout(props.holes, r.zone);
        // (plan 95 F5a: new glass — its stars and cracks' points gone with the old)
        if (what === "glass" && typeof props.holes === "string") props.holes = glassless(props.holes);
        // (its spare used — or, at the garage, a new tyre fitted and its spare in the boot again)
        if (what === "tyre") {
          if (noseOf(d2).garage) delete props.spare;
          else props.spare = 0;
        }
        if (!props.dmg) delete props.dmg;
        if (!props.holes) delete props.holes;
        room.state.objects.set(id, toSchema({ ...d2, props }));
        saveLater(id);
      }, MEND_MS[what]),
    );
  });

  // ── (plan 93 S7) a tow rope: from one car's back to another's front (both parked, or stopped with a driver),
  // the rope from the pack; untied from either, back into it. The drivers' own cars feel it (car/cars.ts) ──
  const TOW_TIE = 9; // m: the most between the two cars' middles as it's tied
  const tieOf = (id: string): { def: ReturnType<typeof fromSchema> | null; veh: Vehicle | null } => {
    const o = room.state.objects.get(id);
    const def = o ? fromSchema(o) : null;
    let veh: Vehicle | null = null;
    for (const l of live.values()) if (l.veh.obj === id) veh = l.veh;
    return { def, veh };
  };
  const setTie = (id: string, key: "towing" | "towedBy", to: string) => {
    const { def, veh } = tieOf(id);
    if (veh) veh[key] = to;
    if (def) {
      const props: Record<string, unknown> = { ...(def.props ?? {}), [key]: to };
      if (!to) delete props[key];
      room.state.objects.set(id, toSchema({ ...def, props }));
      saveLater(id);
    }
  };
  const tieWhere = (id: string) => {
    const { def, veh } = tieOf(id);
    if (veh) return { x: veh.x, y: veh.z, moving: Math.hypot(veh.vx, veh.vz) > 0.5 };
    if (!def || def.kind !== "car") return null;
    const pose = parkedPose(def);
    return { x: pose.x, y: pose.y, moving: false };
  };
  room.on("car:tow", (client, m) => {
    const sid = client.sessionId;
    const p = room.state.players.get(sid);
    const inv = room.survival?.inventory(sid);
    const from = String(m?.from ?? "");
    const to = String(m?.to ?? "");
    if (!p || !inv || from === to || p.level !== 0 || bySid.has(sid) || p.hp <= 0 || p.downAt) return;
    const a = tieWhere(from);
    const b = tieWhere(to);
    if (!a || !b || a.moving || b.moving) return;
    if (Math.hypot(a.x - b.x, a.y - b.y) > TOW_TIE) return no(client, "far");
    if (Math.min(Math.hypot(p.x - a.x, p.y - a.y), Math.hypot(p.x - b.x, p.y - b.y)) > 5) return no(client, "far");
    const ta = tieOf(from);
    const tb = tieOf(to);
    const busyA = ta.veh?.towing || ta.def?.props?.towing;
    const busyB = tb.veh?.towedBy || tb.def?.props?.towedBy;
    if (busyA || busyB) return no(client, "tied");
    if (count(inv, "towrope") < 1 || takeStack(inv, "towrope", 1) !== 1) return no(client, "rope");
    setTie(from, "towing", to);
    setTie(to, "towedBy", from);
    room.survival?.changed(sid);
  });
  room.on("car:untow", (client, m) => {
    const sid = client.sessionId;
    const p = room.state.players.get(sid);
    const inv = room.survival?.inventory(sid);
    const id = String(m?.id ?? "");
    if (!p || !inv || bySid.has(sid)) return;
    const here = tieWhere(id);
    if (!here || here.moving || Math.hypot(p.x - here.x, p.y - here.y) > 5) return;
    const t = tieOf(id);
    const towing = String(t.veh?.towing || t.def?.props?.towing || "");
    const towedBy = String(t.veh?.towedBy || t.def?.props?.towedBy || "");
    if (!towing && !towedBy) return;
    if (addStack(inv, "towrope", 1) !== 1) return no(client, "full");
    if (towing) {
      setTie(id, "towing", "");
      setTie(towing, "towedBy", "");
    } else {
      setTie(id, "towedBy", "");
      setTie(towedBy, "towing", "");
    }
    room.survival?.changed(sid);
  });

  /** (plan 95 F5a) A round into glass that's still there: its point kept (a star on the windscreen — how many it
   *  has told; where a side's or the rear's cracked from), and true. */
  const starOf = (dm: Damage, h: CarShot, holes: string): boolean => {
    if (h.struck !== "glass" || h.pane < 0 || paneOf(dm.parts, h.pane as Pane) === 2) return false;
    if (h.pane === 0) h.stars = parseHoles(holes).filter((x) => x.pane === 0).length;
    return true;
  };

  // ── (plan 94 P1) the fire ──
  // heat (by the car's object's id) and what's burning: since when, who set it alight (a shooter: the blast hurts as a
  // fight's does), when its people were last burnt
  const heat = new Map<string, number>();
  // (`due`: when it blows — BURN_MS after it caught; shot on past HEAT_BLAST, sooner, but never before BURN_MIN_MS)
  const burning = new Map<string, { at: number; due: number; by: string | null; hurtAt: number }>();
  /** Heat into a car's damage `dm` (its object's `id`): only a wrecked engine's (steaming, or dead) takes it;
   *  smoking, burning (its engine dead), or — burning and hit on — about to blow. */
  const fireUp = (dm: Damage, id: string, add: number, by: string | null) => {
    if (dm.fire >= FIRE.burnt) return;
    if (dm.zones[0] < 0.8 && !(dm.parts & PART.engineDead) && dm.fire === FIRE.none) return;
    const n = (heat.get(id) ?? 0) + add;
    heat.set(id, n);
    const now = Date.now();
    if (n >= HEAT_SMOKE && dm.fire < FIRE.smoke) dm.fire = FIRE.smoke;
    if (n >= HEAT_FIRE && dm.fire < FIRE.burning) {
      dm.fire = FIRE.burning;
      dm.parts |= PART.engineDead;
      burning.set(id, { at: now, due: now + BURN_MS, by, hurtAt: now });
    }
    const b = burning.get(id);
    if (b) {
      if (by) b.by = by;
      // (shot on while it burns: it goes sooner — but it's burnt BURN_MIN_MS first, plan 95 F7a; the tick's)
      if (n >= HEAT_BLAST) b.due = Math.min(b.due, Math.max(now, b.at + BURN_MIN_MS));
    }
  };
  /** Where a car is (live or parked, by its object's id), its damage, and how to put it back. */
  const carNow = (id: string) => {
    const l = live.get(`car:${id}`);
    if (l) {
      const v = l.veh;
      return {
        l,
        x: v.x,
        y: v.z,
        z: v.y,
        dm: parseDamage(v.dmg),
        save: (dm: Damage) => {
          v.dmg = damageString(dm);
        },
      };
    }
    const o = room.state.objects.get(id);
    if (!o || o.kind !== "car") return null;
    const def = fromSchema(o);
    const pose = parkedPose(def);
    const props: Record<string, unknown> = { ...(def.props ?? {}) };
    return {
      l: null,
      x: pose.x,
      y: pose.y,
      z: (pose.h ?? heightAt(pose.x, pose.y)) + 0.6,
      dm: parseDamage(props.dmg),
      save: (dm: Damage) => {
        props.dmg = damageString(dm);
        // (burnt out: its clock for the tow from now)
        if (dm.fire === FIRE.burnt) props.parkedAt = Date.now();
        room.state.objects.set(id, toSchema({ ...def, props }));
        saveLater(id);
      },
    };
  };
  /** It blows: burnt out (burnOut), its people thrown out of it, everyone near knocked down and hurt by how near
   *  (in a fight's rules: set alight by a shooter, or they're in one), and everyone near shown it (`car:blast`). */
  const blast = (id: string, by: string | null) => {
    burning.delete(id);
    heat.delete(id);
    const c = carNow(id);
    if (!c) return;
    const now = Date.now();
    c.dm.zones = c.dm.zones.slice();
    burnOut(c.dm);
    c.save(c.dm);
    if (c.l) for (const sid of [...c.l.seats]) if (sid) leaveSeat(sid, true);
    const inFight = (s: string) => now - (room.fightAt.get(s) ?? 0) < FIGHT_MS;
    for (const q of room.state.players.values()) {
      if (q.level !== 0 || q.hp <= 0) continue;
      const d = Math.hypot(q.x - c.x, q.y - c.y);
      if (d > BLAST_R) continue;
      q.fellAt = now;
      q.fellYaw = Math.atan2(q.y - c.y, q.x - c.x);
      if (by || inFight(q.sid)) {
        const n = Math.round(BLAST_HURT * (1 - d / BLAST_R) ** 1.3);
        if (n > 0) {
          room.survival?.hurt(q.sid, n);
          room.fightAt.set(q.sid, now);
        }
      }
    }
    room.broadcastMsg("car:blast", { id, x: c.x, y: c.y, z: c.z });
  };
  /** A second of the fire: the people in a burning car burnt, a burning car blown when its time's up. */
  const fireTick = (now: number) => {
    for (const [id, b] of [...burning]) {
      const c = carNow(id);
      if (!c || c.dm.fire !== FIRE.burning) {
        burning.delete(id);
        continue;
      }
      if (c.l && now - b.hurtAt >= 1000) {
        b.hurtAt = now;
        for (const sid of c.l.seats) if (sid) room.survival?.hurt(sid, FIRE_HURT);
      }
      if (now >= b.due) blast(id, b.by);
    }
  };

  room.carShot = {
    seatOf(sid) {
      const vid = bySid.get(sid);
      const l = vid ? live.get(vid) : undefined;
      if (!l) return null;
      const seat = l.seats.indexOf(sid);
      if (seat < 0) return null;
      const w = SEATS_OF[l.spec.kind].at[seat]?.[1] ?? 0;
      const v = l.veh;
      return { vid: v.id, seat, side: w < 0 ? -1 : 1, a: v.a, speed: Math.hypot(v.vx, v.vz) };
    },
    along(level, o, d, range, gun, skip, claim) {
      if (level !== 0) return null;
      // (plan 95 F4a: the shooter's screen met no car it drew along this round — none struck)
      if (claim === 0) return null;
      // (…or one, where on it: checked against the car as it is here and this round's ray; not taken, the box's)
      const claimed = claim && typeof claim === "object" ? claim : null;
      const hitOf = (id: string, at: CarAt) =>
        claimed
          ? id === claimed?.id
            ? claimShot(o, d, at, claimed, range, gun)
            : null
          : carAlong(o, d, at, range, gun);
      let best:
        | (ReturnType<typeof carAlong> &
            object & {
              id: string;
              apply(by?: string): void;
              seated?(): { sid: string; t: number; head: boolean } | null;
            })
        | null = null;
      const near = (x: number, y: number) => {
        // (by the ray's line: within its reach and a car's length of it)
        const rx = x - o.x;
        const ry = y - o.y;
        const along = rx * d.x + ry * d.y;
        if (along < -6 || along > (best?.t ?? range) + 6) return false;
        return Math.abs(rx * d.y - ry * d.x) < 6 + Math.abs(d.z) * along;
      };
      for (const l of live.values()) {
        const v = l.veh;
        if (v.id === skip || !near(v.x, v.z)) continue;
        const at = wireCar(v.x, v.y, v.z, [v.qx, v.qy, v.qz, v.qw], l.spec);
        const h = hitOf(v.id, at);
        if (!h || (best && h.t >= best.t)) continue;
        best = {
          ...h,
          id: v.id,
          // (plan 94 P4: on through it, whoever sat in its way)
          seated() {
            if (!h.through) return null;
            const taken = l.seats.flatMap((sid, i) => (sid ? [i] : []));
            const hit = seatedAlong(o, d, at, taken, h.t, h.out);
            return hit ? { sid: l.seats[hit.seat], t: hit.t, head: hit.head } : null;
          },
          apply(by) {
            // (plan 95 F1a: its window wound down — no glass there to crack; the round goes on through)
            if (h.struck === "glass" && h.pane >= 2 && panesOpen(l.spec, v.win) & (1 << h.pane)) return;
            const dm = parseDamage(v.dmg);
            const star = starOf(dm, h, v.holes);
            shotDamage(dm, h);
            fireUp(dm, v.obj, h.struck === "engine" ? 2 : h.face === 0 ? 1 : 0.5, by ?? null);
            if (h.struck === "panel" || h.struck === "engine" || star) v.holes = addHole(v.holes, h);
            // (plan 96 F4a: its part's rounds counted — loose, then off)
            if (h.part && (h.struck === "panel" || h.struck === "engine")) shotWreck(dm, parseHoles(v.holes), h.part);
            v.dmg = damageString(dm);
          },
        };
      }
      for (const ob of room.state.objects.values()) {
        if (ob.kind !== "car") continue;
        const def = fromSchema(ob);
        if (def.props?.driven || num(def.props?.level, 0) !== 0) continue;
        const pose = parkedPose(def);
        if (!near(pose.x, pose.y)) continue;
        const spec = SPECS[carKindOf(def.props?.model)];
        const car = levelCar(pose.x, pose.y, pose.h ?? heightAt(pose.x, pose.y), pose.a, spec);
        const h = hitOf(ob.id, car);
        if (!h || (best && h.t >= best.t)) continue;
        best = {
          ...h,
          id: ob.id,
          apply(by) {
            const cur = room.state.objects.get(ob.id);
            if (!cur) return;
            const was = fromSchema(cur);
            const props: Record<string, unknown> = { ...(was.props ?? {}) };
            const dm = parseDamage(props.dmg);
            const star = starOf(dm, h, typeof props.holes === "string" ? props.holes : "");
            shotDamage(dm, h);
            fireUp(dm, ob.id, h.struck === "engine" ? 2 : h.face === 0 ? 1 : 0.5, by ?? null);
            if (h.struck === "panel" || h.struck === "engine" || star)
              props.holes = addHole(typeof props.holes === "string" ? props.holes : "", h);
            // (plan 96 F4a: its part's rounds counted — loose, then off)
            if (h.part && (h.struck === "panel" || h.struck === "engine"))
              shotWreck(dm, parseHoles(typeof props.holes === "string" ? props.holes : ""), h.part);
            props.dmg = damageString(dm);
            room.state.objects.set(ob.id, toSchema({ ...was, props }));
            saveLater(ob.id);
            // (plan 93 S9: shot, locked: its alarm)
            if (props.locked) alarm(ob.id, "shot");
          },
        };
      }
      // (plan 95 F4a: the claim not taken — not on that car here, or too far off this round's line: the box's)
      if (!best && claimed) return room.carShot?.along(level, o, d, range, gun, skip) ?? null;
      return best;
    },
  };

  room.carMaps = () => ({
    live: live.size,
    bySid: bySid.size,
    knockedAt: knockedAt.size,
    unstuckAt: unstuckAt.size,
    shovedAt: shovedAt.size,
    saveSoon: saveSoon.size,
    chainJobs: chainJobs.size,
    heat: heat.size,
    burning: burning.size,
  });

  return {
    dispose() {
      offLand();
      room.carShot = null;
      room.carMaps = null;
      for (const t of saveSoon.values()) clearTimeout(t);
    },
    // (the fleet and the homes made before anyone's in: the first tick's, done as the room's made)
    ready() {
      if (!fleet) makeFleet();
      if (!homesMade) makeHomes();
    },
    tick(dt, now) {
      if (!fleet) makeFleet();
      if (!homesMade) makeHomes();
      for (const l of [...live.values()]) {
        const v = l.veh;
        // (gone down in the water: its people out of it, swimming — plan 66)
        if (l.seats.some(Boolean) && wetAt(v.x, v.z) >= SUNK)
          for (const sid of [...l.seats]) if (sid) leaveSeat(sid, true, true);
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
        // (plan 99 F2a: rolling on its coaster's client counts as driven while their states come)
        if (l.coaster && (l.seats[0] || !room.state.players.has(l.coaster))) l.coaster = undefined;
        const driven = (!!l.seats[0] || !!l.coaster) && now - l.lastAt < QUIET_MS;
        if (!driven) {
          const sp = Math.hypot(v.vx, v.vz);
          if (sp > 0.05) {
            // (plan 98 phase 24: its driver gone quiet — a tab in the background, a dropped line —: braked where it is;
            // nobody at its wheel (jumped out): rolling on, slowing; either way stopped by what's hard in its way — it
            // rolled up to ~130 m in a line through walls and water)
            const decel = l.seats[0] ? QUIET_BRAKE : ROLL_DECEL;
            const k = Math.max(0, sp - decel * dt) / sp;
            v.vx *= k;
            v.vz *= k;
            const nx = v.x + v.vx * dt;
            const nz = v.z + v.vz * dt;
            const b = l.spec.body;
            const off = (b.ahead - b.behind) / 2;
            const cx = nx + Math.cos(v.a) * off;
            const cz = nz + Math.sin(v.a) * off;
            const hit: Solid[] = [];
            carWorld.solids(cx, cz, Math.max(b.ahead, b.behind) + 1, hit);
            const blocked = hit.some(
              (o) => !o.soft && boxHits(cx, cz, (b.ahead + b.behind) / 2, b.width / 2, v.a, o),
            );
            if (blocked) {
              v.vx = v.vz = 0;
            } else {
              v.x = nx;
              v.z = nz;
            }
            v.y = heightAt(v.x, v.z) + l.spec.cog;
            v.v = v.vx * Math.cos(v.a) + v.vz * Math.sin(v.a);
            v.at = now;
            // (a new state for everyone watching it roll: on its clock, as a driver's would be)
            v.seq = (v.seq + 1) >>> 0;
            v.st = (v.st + Math.round(dt * 1000)) >>> 0;
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
        // the plough truck's blade, down as it goes: the road cleared behind it
        if (l.veh.kind === "ploughtruck" && Math.hypot(v.vx, v.vz) > 1)
          ploughAt(room.state, v.x, v.z, v.a, 3.1, 3.0, now);
        const empty = !l.seats.some(Boolean);
        l.still = empty && Math.hypot(v.vx, v.vz) < 0.3 ? l.still + dt : 0;
        if (l.still > 2) park(l);
      }
      if (now > sweepAt) {
        sweepAt = now + 5000;
        ploughedSweep(room.state, now);
      }
      fireTick(now);
      bootsShut();
      if (now > towAt) {
        towAt = now + 60_000;
        home(false);
        retireSpawned(null);
        retire();
        keysAtDayEnd();
      }
    },
    leave(client) {
      leaveSeat(client.sessionId, false);
      // (plan 97 L4: when they were last knocked, kept only while they're here)
      knockedAt.delete(client.sessionId);
    },

    levelChange(client, p, from, to) {
      if (to !== 0 && bySid.has(client.sessionId)) leaveSeat(client.sessionId, false);
      void p;
      void from;
    },
  };
});
