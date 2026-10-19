import { footprint, objLevel, type WorldObjectDef } from "@yutopia/shared";
import type { Player } from "../schema.ts";
import { fromSchema, toSchema, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// The building's elevators (docs/plan/25-building-floors.md). A shaft is the
// `elevator` things with the same props.shaft, one per floor it stops at; one
// car runs in it. Call it to your floor (E at its doors); in it, pick a floor:
// the doors shut, everyone inside rides (and their pets with them), the doors
// open there. Each stop's props tell everyone what it shows — the doors open
// only where the car is (shared grid.ts: shut doors are a wall), the floor it's
// at and which way it's going (the indicator over the doors). Not stored: a
// restart starts every car shut at the home floor.

const OPEN_MS = 7000; // doors stay open this long with nobody coming or going
const CLOSE_MS = 1100;
const OPEN_DOORS_MS = 700;
const RIDE_MS = 1500; // a ride: this, and a bit more a floor
const FLOOR_MS = 800;
const MAX_RIDERS = 4;
const REACH = 3; // how near the doors a call is made (tiles from the middle)

type Phase = "open" | "shut" | "closing" | "moving" | "opening";
interface Car {
  shaft: string;
  at: number; // the floor it's at (or left from)
  to: number | null; // where it's going
  queue: number[]; // floors it's been called or sent to, in order
  phase: Phase;
  until: number; // when this phase ends (open: when the doors close by themselves)
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
      c = { shaft, at, to: null, queue: [], phase: "shut", until: 0, riders: [] };
      cars.set(shaft, c);
    }
    return c;
  };
  const warn = (c: WorldClient, text: string) => room.send(c, "toast", { text, tone: "warn" });

  // inside the car's footprint on the floor it's at
  const inside = (o: WorldObjectDef, p: { x: number; y: number }) => {
    const { w, h } = footprint(o.kind, o.rot ?? 0);
    return p.x >= o.x && p.x < o.x + w && p.y >= o.y && p.y < o.y + h;
  };
  const people = (shaft: string, level: number) => {
    const o = stopOn(shaft, level);
    return o ? [...room.state.players.values()].filter((p) => p.level === level && inside(o, p)) : [];
  };

  // what every stop shows: open doors where the car stands open, the floor it's
  // at, which way it's going
  const show = (c: Car) => {
    const dir = c.to === null ? 0 : Math.sign(c.to - c.at);
    let changed = false;
    for (const o of stops(c.shaft)) {
      const level = objLevel(o, room.map);
      const door = level === c.at && (c.phase === "open" || c.phase === "closing") ? "open" : "closed";
      const props = { ...(o.props ?? {}), door, at: c.at, dir };
      if (JSON.stringify(props) === JSON.stringify(o.props ?? {})) continue;
      room.state.objects.set(o.id, toSchema({ ...o, props }));
      changed = true;
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
    const { w, h } = footprint(def.kind, def.rot ?? 0);
    if (objLevel(def, room.map) !== p.level || Math.hypot(p.x - (def.x + w / 2), p.y - (def.y + h / 2)) > REACH) return;
    go(car(shaftOf(def)), p.level);
  });

  room.on("lift:go", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const o = room.state.objects.get(String(m?.id ?? ""));
    const level = Number(m?.level);
    if (!p || !o || o.kind !== "elevator" || !Number.isInteger(level)) return;
    const def = fromSchema(o);
    const c = car(shaftOf(def));
    if (objLevel(def, room.map) !== p.level || c.at !== p.level || !inside(def, p)) return;
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

  const ride = (c: Car, now: number) => {
    const from = stopOn(c.shaft, c.at);
    // who's in it as the doors shut, and where in it
    c.riders = from
      ? people(c.shaft, c.at)
          .slice(0, MAX_RIDERS)
          .map((p) => ({ sid: p.sid, dx: p.x - from.x, dy: p.y - from.y }))
      : [];
    c.phase = "moving";
    c.until = now + RIDE_MS + FLOOR_MS * Math.abs((c.to ?? c.at) - c.at);
  };

  const arrive = (c: Car, now: number) => {
    const to = c.to ?? c.at;
    const stop = stopOn(c.shaft, to);
    c.at = to;
    c.to = null;
    if (stop)
      for (const r of c.riders) {
        const p = room.state.players.get(r.sid) as Player | undefined;
        const client = room.clients.getById(r.sid) as WorldClient | undefined;
        if (!p || !client) continue;
        // (still in it: nobody walks out of a moving car)
        room.moveTo(client, p, { x: stop.x + r.dx, y: stop.y + r.dy, level: to });
      }
    c.riders = [];
    c.phase = "opening";
    c.until = now + OPEN_DOORS_MS;
  };

  return {
    tick(_dt, now) {
      for (const o of room.state.objects.values()) if (o.kind === "elevator") car(shaftOf(fromSchema(o)));
      for (const c of cars.values()) {
        if (!stops(c.shaft).length) {
          cars.delete(c.shaft);
          continue;
        }
        if (now < c.until && c.phase !== "shut") continue;
        const before = c.phase;
        if (c.phase === "open") {
          // nobody there keeping it: the doors close (to go on, if it's wanted)
          c.phase = "closing";
          c.until = now + CLOSE_MS;
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
      cars.clear();
    },
  };
});
