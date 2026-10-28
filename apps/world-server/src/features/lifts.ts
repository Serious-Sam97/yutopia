import {
  across,
  BODY_R,
  floorAt,
  inLift,
  inLiftDoorway,
  liftFront,
  objLevel,
  rideAt,
  STOREY,
  type WorldObjectDef,
} from "@yutopia/shared";
import type { Player } from "../schema.ts";
import { fromSchema, toSchema, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// The building's elevators (docs/plan/25-building-floors.md). A shaft is the
// `elevator` things with the same props.shaft, one per floor it stops at; one
// car runs in it. Call it to your floor (E at its doors); in it, pick a floor:
// the doors shut, everyone inside rides (and their pets with them), the doors
// open there. Each stop's props tell everyone what it shows — the doors open
// only where the car is (shared lift.ts: shut doors are a wall, a floor without
// the car is the empty shaft), the floor it's at and which way it's going (the
// indicator over the doors). Like a real one, the doors don't shut on someone
// in the doorway, and stay open while someone's in the car with nowhere to go
// (they pick a floor, or walk out). Not stored: a restart starts every car
// shut at the home floor. On the way the car carries its riders up (or down)
// the shaft, the building's one space (docs/plan/50-the-volume.md, D): each
// tick where it is, their floor the one it's passing (shared floorAt), their
// own clients moving them the same from the stops' props.

const OPEN_MS = 7000; // doors stay open this long with nobody coming or going
const CLOSE_MS = 1300; // the doors closing (drawn eased over this)
const OPEN_DOORS_MS = 1100; // and opening
const RIDE_MS = 1500; // a ride: this, and a bit more a floor
const FLOOR_MS = 800;
const MAX_RIDERS = 4;
const HOLD_MS = 1500; // held open (someone in the doorway, or in it going nowhere): looked at again after this
const REACH = 2.2; // how near the doors a call is made (tiles from the spot in front of them)

type Phase = "open" | "shut" | "closing" | "moving" | "opening";
interface Car {
  shaft: string;
  at: number; // the floor it's at (or left from)
  to: number | null; // where it's going
  queue: number[]; // floors it's been called or sent to, in order
  phase: Phase;
  until: number; // when this phase ends (open: when the doors close by themselves)
  since: number; // when this phase began (a ride's start)
  riders: { sid: string; dx: number; dy: number }[];
}

registerFeature((room: WorldRoom) => {
  const cars = new Map<string, Car>();
  const stops = (shaft: string): WorldObjectDef[] =>
    [...room.state.objects.values()]
      .filter((o) => o.kind === "elevator")
      .map(fromSchema)
      .filter((o) => String(o.props?.shaft ?? o.id) === shaft);
  const stopOn = (shaft: string, level: number) => stops(shaft).find((o) => objLevel(o, room.map) === level);
  const shaftOf = (o: WorldObjectDef) => String(o.props?.shaft ?? o.id);
  const car = (shaft: string): Car => {
    let c = cars.get(shaft);
    if (!c) {
      const floors = stops(shaft).map((o) => objLevel(o, room.map));
      const at = floors.includes(room.home) ? room.home : (floors.sort((a, b) => a - b)[0] ?? room.home);
      c = { shaft, at, to: null, queue: [], phase: "shut", until: 0, since: 0, riders: [] };
      cars.set(shaft, c);
      show(c); // (every stop learns where it is: the shaft is empty elsewhere)
    }
    return c;
  };
  const warn = (c: WorldClient, text: string) => room.send(c, "toast", { text, tone: "warn" });

  // in the car where it is; in its doorway (the doors wait for them)
  const people = (shaft: string, level: number) => {
    const o = stopOn(shaft, level);
    return o ? [...room.state.players.values()].filter((p) => p.level === level && inLift(o, p)) : [];
  };
  const doorway = (c: Car) => {
    const o = stopOn(c.shaft, c.at);
    return !!o && [...room.state.players.values()].some((p) => p.level === c.at && inLiftDoorway(o, p, BODY_R));
  };

  // what every stop shows: open doors where the car stands open, the floor it's
  // at, which way it's going — and, for the clients to move things as they
  // happen (shared lift.ts: liftMotion), the phase it's in, how long it lasts
  // (ms; doors opening or closing, a ride) and where it's going
  const show = (c: Car) => {
    const dir = c.to === null ? 0 : Math.sign(c.to - c.at);
    const timed = c.phase === "opening" || c.phase === "closing" || c.phase === "moving";
    const len = timed ? Math.max(0, c.until - Date.now()) : 0;
    let changed = false;
    for (const o of stops(c.shaft)) {
      const level = objLevel(o, room.map);
      const door = level === c.at && (c.phase === "open" || c.phase === "closing") ? "open" : "closed";
      const props = { ...(o.props ?? {}), door, at: c.at, dir, ph: c.phase, len, to: c.to ?? c.at };
      if (JSON.stringify(props) === JSON.stringify(o.props ?? {})) continue;
      // (the walls only move with the doors or the car)
      if (o.props?.door !== door || o.props?.at !== c.at) changed = true;
      room.state.objects.set(o.id, toSchema({ ...o, props }));
    }
    if (changed) room.rebuildGrid();
  };

  const go = (c: Car, level: number) => {
    if (!stopOn(c.shaft, level)) return;
    if (c.phase !== "moving" && c.at === level && c.queue.length === 0) {
      // here already: the doors open (again)
      if (c.phase === "shut" || c.phase === "closing") {
        c.phase = "opening";
        c.until = Date.now() + OPEN_DOORS_MS;
      } else if (c.phase === "open") c.until = Date.now() + OPEN_MS;
      show(c);
      return;
    }
    if (!c.queue.includes(level) && c.to !== level) c.queue.push(level);
    if (c.phase === "open") c.until = Math.min(c.until, Date.now() + 1500); // (a moment to step in)
  };

  room.on("lift:call", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const o = room.state.objects.get(String(m?.id ?? ""));
    if (!p || !o || o.kind !== "elevator") return;
    const def = fromSchema(o);
    const front = liftFront(def);
    if (objLevel(def, room.map) !== p.level) return;
    if (!inLift(def, p) && room.reach3(p, def, Math.hypot(p.x - front.x, p.y - front.y), front) > REACH) return;
    go(car(shaftOf(def)), p.level);
  });

  room.on("lift:go", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const o = room.state.objects.get(String(m?.id ?? ""));
    const level = Number(m?.level);
    if (!p || !o || o.kind !== "elevator" || !Number.isInteger(level)) return;
    const def = fromSchema(o);
    const c = car(shaftOf(def));
    if (objLevel(def, room.map) !== p.level || c.at !== p.level || !inLift(def, p)) return;
    if (!stopOn(c.shaft, level)) return warn(client, "This elevator doesn't stop there.");
    if (people(c.shaft, p.level).length > MAX_RIDERS) return warn(client, `Four at most — someone step out.`);
    if (level === p.level) return go(c, level);
    c.queue = [level, ...c.queue.filter((l) => l !== level)];
    if (c.phase === "open" || c.phase === "opening") {
      c.phase = "closing";
      c.until = Date.now() + CLOSE_MS;
      show(c);
    }
  });

  // the car's "close" button: shut the doors now (they'll go where they're
  // wanted, or stay shut with you in it — its "open" opens them again)
  room.on("lift:close", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const o = room.state.objects.get(String(m?.id ?? ""));
    if (!p || !o || o.kind !== "elevator") return;
    const def = fromSchema(o);
    const c = car(shaftOf(def));
    if (objLevel(def, room.map) !== p.level || c.at !== p.level || !inLift(def, p)) return;
    if (c.phase === "open" && !doorway(c)) {
      c.phase = "closing";
      c.until = Date.now() + CLOSE_MS;
      show(c);
    }
  });

  const ride = (c: Car, now: number) => {
    const from = stopOn(c.shaft, c.at);
    // who's in it as the doors shut, and where in it
    c.riders = from
      ? people(c.shaft, c.at)
          .slice(0, MAX_RIDERS)
          .map((p) => ({ sid: p.sid, dx: p.x - from.x, dy: p.y - from.y }))
      : [];
    c.phase = "moving";
    c.since = now;
    c.until = now + RIDE_MS + FLOOR_MS * Math.abs((c.to ?? c.at) - c.at);
    for (const r of c.riders) room.carried.add(r.sid);
  };

  // the riders where the car is now: up the shaft from where they stood in it, on the floor it's
  // passing (their frame a storey up each), their height over that floor
  const carry = (c: Car, now: number) => {
    const from = stopOn(c.shaft, c.at);
    if (!from) return;
    const car = rideAt(c.at, c.to ?? c.at, (now - c.since) / 1000, Math.max(1, c.until - c.since) / 1000);
    for (const r of c.riders) {
      const p = room.state.players.get(r.sid) as Player | undefined;
      const client = room.clients.getById(r.sid) as WorldClient | undefined;
      if (!p || !client) continue;
      const here = across(room.map, c.at, p.level, { x: from.x + r.dx, y: from.y + r.dy });
      const z = (car - p.level) * STOREY;
      const ch = floorAt(room.map, p.level, here, z);
      const at = ch?.at ?? here;
      room.moveTo(
        client,
        p,
        { x: at.x, y: at.y, level: ch?.level ?? p.level },
        { z: z + (ch?.dz ?? 0), carried: true },
      );
    }
  };

  const arrive = (c: Car, now: number) => {
    const to = c.to ?? c.at;
    const stop = stopOn(c.shaft, to);
    c.at = to;
    c.to = null;
    c.phase = "opening";
    c.until = now + OPEN_DOORS_MS;
    // (the car's floor is there before its riders are: the grids have it)
    show(c);
    if (stop)
      for (const r of c.riders) {
        room.carried.delete(r.sid);
        const p = room.state.players.get(r.sid) as Player | undefined;
        const client = room.clients.getById(r.sid) as WorldClient | undefined;
        if (!p || !client) continue;
        // (still in it: nobody walks out of a moving car)
        room.moveTo(client, p, { x: stop.x + r.dx, y: stop.y + r.dy, level: to });
      }
    c.riders = [];
  };

  return {
    tick(_dt, now) {
      for (const o of room.state.objects.values()) if (o.kind === "elevator") car(shaftOf(fromSchema(o)));
      for (const c of cars.values()) {
        if (!stops(c.shaft).length) {
          cars.delete(c.shaft);
          continue;
        }
        const before = c.phase;
        // someone in the doorway as they close: they open again
        if (c.phase === "closing" && doorway(c)) {
          c.phase = "open";
          c.until = now + HOLD_MS;
        }
        if (c.phase === "moving" && now < c.until) carry(c, now);
        if (now < c.until && c.phase !== "shut") continue;
        if (c.phase === "open") {
          // nobody in the way, and nobody in it waiting with nowhere to go
          // (they'd be shut in): the doors close (to go on, if it's wanted)
          if (doorway(c) || (!c.queue.length && people(c.shaft, c.at).length)) c.until = now + HOLD_MS;
          else {
            c.phase = "closing";
            c.until = now + CLOSE_MS;
          }
        } else if (c.phase === "closing") {
          c.phase = "shut";
        } else if (c.phase === "opening") {
          c.phase = "open";
          c.until = now + OPEN_MS;
        } else if (c.phase === "moving") arrive(c, now);
        if (c.phase === "shut" && c.queue.length) {
          const next = c.queue.shift() as number;
          if (next === c.at) {
            c.phase = "opening";
            c.until = now + OPEN_DOORS_MS;
          } else {
            c.to = next;
            ride(c, now);
          }
        }
        if (c.phase !== before) show(c);
      }
    },
    dispose() {
      for (const c of cars.values()) for (const r of c.riders) room.carried.delete(r.sid);
      cars.clear();
    },
  };
});
