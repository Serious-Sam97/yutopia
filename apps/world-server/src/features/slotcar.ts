import { footprint } from "@yutopia/shared";
import {
  isSlotTrack,
  plausibleCar,
  SLOT_LANES,
  SLOT_LAPS,
  SLOT_LIGHT_MS,
  SLOT_REACH,
  type SlotSetup,
  slotDiffOf,
  slotLap,
  slotTrackOf,
} from "@yutopia/shared/slotcar";
import { config } from "../config.ts";
import { fromSchema, type SpaceClient, type SpaceRoom, toSchema } from "../SpaceRoom.ts";
import { type SlotRace as Race, SlotCar, SlotRace } from "../schema.ts";
import { yondra } from "../yondra.ts";
import { registerFeature } from "./index.ts";

// Slot-car tracks: up to four racers take a lane, one starts the race (five red
// lights, then GO; its laps and difficulty), each drives their own car and
// reports it here; we check it's a car a real trigger could drive on this
// table's track at this difficulty, count laps and places, and everyone sees
// the cars go round. Racers who walk away (or leave) give their lane back.
// Anyone by the table picks which track is laid on it (between races); it's
// saved with the table, so it stays.
const WALK_AWAY = SLOT_REACH + 1.5; // a little slack before the lane is freed
const RESULTS_MS = 9000; // results stay up, then back to the lobby
const LAST_ONE_MS = 25_000; // after the winner, the rest have this long
const RACE_MAX_MS = 6 * 60_000;

interface Clock {
  at: number; // when the phase began (server ms)
  goAt: number; // countdown: when the lights go out
  firstAt: number; // race: when the winner finished
  lapAt: Map<string, number>; // lane → when its current lap began
  seenAt: Map<string, number>; // lane → when its last report came
}

registerFeature((room: SpaceRoom) => {
  const clocks = new Map<string, Clock>();
  const clock = (id: string): Clock => {
    let c = clocks.get(id);
    if (!c) {
      c = { at: Date.now(), goAt: 0, firstAt: 0, lapAt: new Map(), seenAt: new Map() };
      clocks.set(id, c);
    }
    return c;
  };
  const track = (id: string) => {
    const o = room.state.objects.get(id);
    return o?.kind === "slot_track" ? o : undefined;
  };
  // what a race on this table runs on: the table's track, the race's difficulty
  const setupOf = (id: string, race: Race): SlotSetup => {
    const o = track(id);
    return { track: slotTrackOf(o ? fromSchema(o).props : null), diff: slotDiffOf(race.diff) };
  };
  const save = async (o: ReturnType<typeof fromSchema>) => {
    const saved = config.offline ? o : (await yondra.putObject(room.spaceId, o).catch(() => ({ object: o }))).object;
    room.state.objects.set(saved.id, toSchema(saved));
  };
  // how far someone is from the table's edge
  const away = (id: string, sid: string) => {
    const o = track(id);
    const p = room.state.players.get(sid);
    if (!o || !p) return Number.POSITIVE_INFINITY;
    const { w, h } = footprint(o.kind, o.rot);
    const cx = Math.max(o.x, Math.min(p.x, o.x + w));
    const cy = Math.max(o.y, Math.min(p.y, o.y + h));
    return Math.hypot(p.x - cx, p.y - cy);
  };
  const laneOf = (race: SlotRace, sid: string) => [...race.cars.entries()].find(([, c]) => c.sid === sid)?.[0];
  const warn = (c: SpaceClient, text: string) => room.send(c, "toast", { text, tone: "warn" });
  const lobby = (id: string, race: SlotRace) => {
    race.phase = "lobby";
    race.lights = 0;
    for (const car of race.cars.values()) {
      car.s = 0;
      car.v = 0;
      car.off = 0;
      car.ov = 0;
    }
    clock(id).at = Date.now();
  };

  room.on("slot:join", (client, m) => {
    const id = String(m?.id ?? "");
    const lane = Number(m?.lane);
    const p = room.state.players.get(client.sessionId);
    if (!p || !track(id) || !Number.isInteger(lane) || lane < 0 || lane >= SLOT_LANES) return;
    if (away(id, client.sessionId) > SLOT_REACH) return warn(client, "Get closer to the track to take a lane.");
    let race = room.state.slots.get(id);
    if (!race) {
      race = new SlotRace();
      room.state.slots.set(id, race);
    }
    if (race.phase === "countdown" || race.phase === "race") return warn(client, "Wait for this race to finish.");
    const taken = race.cars.get(String(lane));
    if (taken && taken.sid !== client.sessionId) return warn(client, `${taken.name} is on that lane.`);
    // one lane each (and not on two tracks at once)
    for (const [tid, r] of room.state.slots) {
      const mine = laneOf(r, client.sessionId);
      if (mine !== undefined && (tid !== id || mine !== String(lane))) r.cars.delete(mine);
    }
    const car = new SlotCar();
    car.sid = client.sessionId;
    car.uid = p.uid;
    car.name = p.name;
    race.cars.set(String(lane), car);
  });

  room.on("slot:leave", (client, m) => {
    const race = room.state.slots.get(String(m?.id ?? ""));
    const lane = race && laneOf(race, client.sessionId);
    if (race && lane !== undefined) race.cars.delete(lane);
  });

  room.on("slot:start", (client, m) => {
    const id = String(m?.id ?? "");
    const race = room.state.slots.get(id);
    if (!race || laneOf(race, client.sessionId) === undefined) return;
    if (race.phase === "countdown" || race.phase === "race") return;
    const laps = Number(m?.laps);
    race.laps = (SLOT_LAPS as readonly number[]).includes(laps) ? laps : 5;
    race.diff = slotDiffOf(m?.diff);
    race.by = room.state.players.get(client.sessionId)?.name ?? "";
    lobby(id, race);
    for (const car of race.cars.values()) {
      car.lap = 0;
      car.last = 0;
      car.best = 0;
      car.place = 0;
      car.time = 0;
      car.offs = 0;
    }
    race.phase = "countdown";
    const c = clock(id);
    c.at = Date.now();
    // five lights a beat apart, then out after a pause nobody can guess
    c.goAt = c.at + SLOT_LIGHT_MS * 5 + 400 + Math.random() * 1200;
  });

  room.on("slot:car", (client, m) => {
    const id = String(m?.id ?? "");
    const race = room.state.slots.get(id);
    if (!race || race.phase !== "race") return;
    const lane = laneOf(race, client.sessionId);
    const car = lane !== undefined ? race.cars.get(lane) : undefined;
    if (!car || lane === undefined || car.place) return;
    const c = clock(id);
    const now = Date.now();
    const next = { s: Number(m.s), v: Number(m.v), off: Number(m.off), ov: Number(m.ov) };
    const dt = (now - (c.seenAt.get(lane) ?? c.at)) / 1000;
    const setup = setupOf(id, race);
    if (!plausibleCar(car, next, dt, setup)) return;
    c.seenAt.set(lane, now);
    if (next.off > 0 && car.off === 0) car.offs++;
    car.s = next.s;
    car.v = next.v;
    car.off = next.off;
    car.ov = next.ov;
    // laps: each time it passes the line
    const done = Math.min(race.laps, Math.floor(car.s / slotLap(setup.track)));
    if (done > car.lap) {
      const began = c.lapAt.get(lane) ?? c.at;
      car.last = (now - began) / 1000;
      if (!car.best || car.last < car.best) car.best = car.last;
      c.lapAt.set(lane, now);
      car.lap = done;
    }
    if (car.lap >= race.laps && !car.place) {
      car.place = [...race.cars.values()].filter((x) => x.place).length + 1;
      car.time = (now - c.at) / 1000;
      car.v = 0;
      if (car.place === 1) c.firstAt = now;
    }
  });

  // The track laid on the table: anyone by it, between races.
  room.on("slot:track", (client, m) => {
    const id = String(m?.id ?? "");
    const o = track(id);
    const pick = m?.track;
    if (!o || !isSlotTrack(pick)) return;
    if (away(id, client.sessionId) > SLOT_REACH) return warn(client, "Get closer to the track to change it.");
    const race = room.state.slots.get(id);
    if (race && (race.phase === "countdown" || race.phase === "race"))
      return warn(client, "Wait for this race to finish.");
    const def = fromSchema(o);
    if (slotTrackOf(def.props) === pick) return;
    void save({ ...def, props: { ...(def.props ?? {}), track: pick } });
    if (race) lobby(id, race); // the cars back on the new grid
  });

  return {
    tick(_dt, now) {
      for (const [id, race] of room.state.slots) {
        if (!track(id)) {
          room.state.slots.delete(id);
          clocks.delete(id);
          continue;
        }
        // who walked away or left gives their lane back
        for (const [lane, car] of race.cars)
          if (!room.state.players.has(car.sid) || away(id, car.sid) > WALK_AWAY) race.cars.delete(lane);
        if (!race.cars.size) {
          if (race.phase !== "lobby") lobby(id, race);
          continue;
        }
        const c = clock(id);
        if (race.phase === "countdown") {
          race.lights = Math.min(5, Math.floor((now - c.at) / SLOT_LIGHT_MS) + 1);
          if (now >= c.goAt) {
            race.phase = "race";
            race.lights = 0;
            c.at = now;
            c.firstAt = 0;
            c.lapAt.clear();
            c.seenAt.clear();
          }
        } else if (race.phase === "race") {
          const cars = [...race.cars.values()];
          const all = cars.every((x) => x.place);
          const late = c.firstAt && now - c.firstAt > LAST_ONE_MS;
          if (all || late || now - c.at > RACE_MAX_MS) {
            race.phase = "done";
            c.at = now;
          }
        } else if (race.phase === "done" && now - c.at > RESULTS_MS) lobby(id, race);
      }
    },
    leave(client) {
      for (const race of room.state.slots.values()) {
        const lane = laneOf(race, client.sessionId);
        if (lane !== undefined) race.cars.delete(lane);
      }
    },
  };
});
