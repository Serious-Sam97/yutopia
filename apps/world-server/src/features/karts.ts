import { ANIM, dirFromDelta, GROUND_OFFSET } from "@yutopia/shared";
import { terrainAt } from "@yutopia/shared/grounds";
import {
  ALL_READY_MS,
  BATTLE_MS,
  BLINK_MS,
  bowlCrates,
  bowlSpawns,
  bumpKart,
  createKart,
  GO_MS,
  gridRevs,
  ITEM,
  ITEMS,
  type ItemKind,
  implausibleKart,
  KART,
  KART_COLOURS,
  KART_DESK,
  KART_LAPS,
  KART_LAYOUTS,
  KART_RACK,
  KART_REACH,
  KART_SHOW,
  KART_SLOTS,
  KART_STEP,
  type KartSpec,
  type KartState,
  type KartWorld,
  kartBowlWorld,
  kartInWake,
  kartLayoutNow,
  kartPloughAt,
  kartShowF,
  kartSpeed,
  kartStart,
  kartTrack,
  kartTrackNow,
  kartTrackWorld,
  LAST_ONE_MS,
  LapCounter,
  NO_INPUT,
  READY_MS,
  RESULTS_MS,
  rollItem,
  SMASH_MS,
  spinOut,
  stepKart,
  trackAt,
  type VortexLevel,
  vortexBand,
  vortexBrawler,
  vortexRacer,
} from "@yutopia/shared/kart";
import { api } from "../api.ts";
import { config } from "../config.ts";
import { landLayout } from "../land.ts";
import { KartPark, KartShot, KartSlot, type Player, Vehicle } from "../schema.ts";
import type { WorldClient, WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// The Kart Park (docs/plan/46-the-karts.md, K-M3): take a kart at the paddock's desk and you're on
// the circuit, free laps on the clock; anyone in a kart sets up the next race and starts it — a
// Grand Prix (laps, places, items by place) or a battle in the bowl (three minutes, smashes) —
// empty slots filled with Vortex karts at a level if they want. Your kart is yours: your client
// drives it and reports it 20×/s; here we check it's a kart that could be there, count laps and
// places, and own the clock, the crates, everything that flies, and every hit. Vortex's karts are
// driven here, with the same sim. The park's record lives here (the room's, while it's up).

const off = GROUND_OFFSET; // (a player's x, y + off: the Grounds' coords)
const RACE_MAX_MS = 8 * 60_000;
const QUIET_MS = 4000;
// a thrower's view: others' karts drawn 110 ms behind (kart/karts.ts BEHIND), plus half their
// ping (`kart:use` lag, capped); a trail of each kart's last 1.2 s to look back along
const DRAWN_BEHIND = 110;
const MAX_LAG = 300;
const TRAIL_MS = 1200; // a kart whose driver's gone quiet this long: put back where it was told

interface Live {
  key: string;
  slot: KartSlot;
  lc: LapCounter;
  /** the last report taken (Grounds' coords), when */
  prev: { x: number; z: number; vx: number; vz: number; at: number } | null;
  /** Vortex's: his kart, its sim, how he drives */
  sim: KartState | null;
  drive: ((k: KartState) => ReturnType<ReturnType<typeof vortexRacer>>) | null;
  brawl: ReturnType<typeof vortexBrawler> | null;
  acc: number;
  /** staples taken lately (server ms) */
  staples: number[];
  /** a coffee or the plough on Vortex's kart: boost left (s), its top */
  vortexItemAt: number;
  /** where it's been, the last TRAIL_MS (server ms, oldest first) */
  trail: { t: number; x: number; z: number }[];
  /** the last item it got (not the same twice running) */
  lastItem: ItemKind | null;
  /** Vortex's own numbers (his rubber band moves his top speed) */
  spec: KartSpec;
  /** Vortex's start: how long before the lights go out his throttle goes down (s; shared kartStart) */
  early: number;
}

registerFeature((room: WorldRoom) => {
  const park = new KartPark();
  room.state.karts.set("park", park);
  // the layout raced (docs/plan/47-the-track-changer.md): the park's state, kept with its record
  let track = kartTrack();
  let world = kartTrackWorld(track);
  const bowl = kartBowlWorld();
  const live = new Map<string, Live>();
  const bySid = new Map<string, string>(); // driver → slot
  // the crates: the circuit's four rows of four, then the bowl's ten; when each is back (server ms)
  const crates: { x: number; z: number; battle: boolean }[] = [];
  const circuitCrates = () => {
    const out: typeof crates = [];
    for (const s of track.boxes) {
      const p = trackAt(track, s);
      for (let i = 0; i < 4; i++) {
        const o = -6 + 1.5 + i * ((12 - 3) / 3);
        out.push({ x: p.x + Math.sin(p.a) * o, z: p.z - Math.cos(p.a) * o, battle: false });
      }
    }
    return out;
  };
  crates.push(...circuitCrates());
  for (const c of bowlCrates()) crates.push({ ...c, battle: true });
  const crateBack = crates.map(() => 0);
  const record: {
    /** the Figure Eight's best lap (the first record: kept where it was) */
    best: { t: number; name: string } | null;
    /** the other layouts' best laps, by layout ("oval", "oval-r"…) */
    bests: Record<string, { t: number; name: string }>;
    /** the layout raced, kept till someone changes it */
    layout: { key: string; reverse: boolean };
    last: { at: number; mode: string; top: string[] }[];
    wins: Record<string, number>;
  } = { best: null, bests: {}, layout: { key: "eight", reverse: false }, last: [], wins: {} };
  // (as it was saved: the API keeps it in the world's settings)
  {
    const saved = room.savedKarts as Partial<typeof record> | null;
    if (saved && typeof saved === "object") {
      if (saved.best && typeof saved.best.t === "number" && typeof saved.best.name === "string")
        record.best = saved.best;
      if (Array.isArray(saved.last)) record.last = saved.last.slice(0, 10);
      if (saved.wins && typeof saved.wins === "object") record.wins = saved.wins;
      if (saved.bests && typeof saved.bests === "object") record.bests = saved.bests;
      if (saved.layout && typeof saved.layout.key === "string")
        record.layout = { key: saved.layout.key, reverse: saved.layout.reverse === true };
      park.record = JSON.stringify(record);
    }
  }
  const saveRecord = () => {
    park.record = JSON.stringify(record);
    if (!config.offline) void api.putKarts(record).catch((e) => console.warn("[karts] record", e.message));
  };
  /** The layout to race: the circuit, its world, its crates and the park's land made for it; the
   *  karts out on free laps back on its grid. */
  const raceLayout = (key: string, reverse: boolean) => {
    landLayout(key, reverse);
    const now = kartLayoutNow();
    if (track.key === now.key && track.reverse === now.reverse) return;
    track = kartTrackNow();
    world = kartTrackWorld(track);
    const fresh = circuitCrates();
    for (let i = 0; i < fresh.length; i++) {
      crates[i] = fresh[i];
      crateBack[i] = 0;
    }
    park.layout = now.key;
    park.reverse = now.reverse;
    record.layout = { key: now.key, reverse: now.reverse };
    for (const [key, l] of live) {
      l.lc = new LapCounter(track);
      const g = track.grid[Number(key) % track.grid.length];
      place(l, g.x, g.z, g.a, false);
    }
  };
  // (the one kept: raced again after a restart)
  raceLayout(record.layout.key, record.layout.reverse);
  let lastCall = 0;
  let shotNo = 0;
  let rng = 12345;
  const rand = () => {
    rng = (rng * 16807) % 2147483647;
    return rng / 2147483647;
  };

  const clientOf = (sid: string) => room.clients.find((c) => c.sessionId === sid) as WorldClient | undefined;
  const say = (sid: string, f: (c: WorldClient) => void) => {
    const c = clientOf(sid);
    if (c) f(c);
  };
  const battle = () => park.mode === "battle";
  const worldNow = (): KartWorld => (battle() && park.phase !== "lobby" ? bowl : world);
  const racing = () => park.phase === "lights" || park.phase === "race";

  // ── karts in and out ──
  const freeSlot = () => {
    for (let i = 0; i < KART_SLOTS; i++) if (!park.karts.has(String(i))) return String(i);
    return null;
  };
  const place = (l: Live, x: number, z: number, a: number, still = true) => {
    const s = l.slot;
    const y = worldNow().under(x, z, 50).y;
    Object.assign(s, { x, y, z, a, vx: 0, vz: 0, steer: 0, drift: 0, tier: 0, boost: false, air: false });
    l.prev = { x, z, vx: 0, vz: 0, at: Date.now() };
    if (l.sim) {
      l.sim = createKart(x, y, z, a);
      l.acc = 0;
    }
    if (s.sid) say(s.sid, (c) => room.send(c, "kart:snap", { x, y, z, a, still }));
  };
  const addLive = (key: string, slot: KartSlot): Live => {
    const l: Live = {
      key,
      slot,
      lc: new LapCounter(track),
      prev: null,
      sim: null,
      drive: null,
      brawl: null,
      acc: 0,
      staples: [],
      vortexItemAt: 0,
      trail: [],
      lastItem: null,
      spec: { ...KART },
      early: -1,
    };
    live.set(key, l);
    park.karts.set(key, slot);
    return l;
  };
  const drop = (key: string) => {
    const l = live.get(key);
    live.delete(key);
    park.karts.delete(key);
    if (l?.slot.sid) bySid.delete(l.slot.sid);
  };
  /** Out of the kart: standing by the desk. */
  const out = (client: WorldClient | undefined, p: Player | undefined) => {
    if (!p) return;
    const key = bySid.get(p.sid);
    if (key !== undefined) drop(key);
    if (p.busy.startsWith("drive:kart:")) p.busy = "";
    if (client)
      room.moveTo(client, p, { x: KART_DESK.x + 2 * KART_DESK.face - off.x, y: KART_DESK.z + 1 - off.y, level: 0 });
  };

  room.on("kart:take", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    if (!p || p.level !== 0 || bySid.has(p.sid)) return;
    if (p.busy || p.downAt || p.fellAt) return room.send(client, "kart:no", { why: "busy" });
    const bx = p.x + off.x;
    const bz = p.y + off.y;
    const nearDesk = Math.hypot(bx - KART_DESK.x, bz - KART_DESK.z) < KART_REACH;
    const nearRack =
      Math.abs(bx - KART_RACK.x) < KART_REACH &&
      bz > KART_RACK.z0 - KART_REACH &&
      bz < KART_RACK.z0 + KART_RACK.n * KART_RACK.dz + KART_REACH;
    if (!nearDesk && !nearRack) return room.send(client, "kart:no", { why: "far" });
    if (park.phase !== "lobby") return room.send(client, "kart:no", { why: "racing" });
    if (park.showing) return room.send(client, "kart:no", { why: "show" });
    const key = freeSlot();
    if (key === null) return room.send(client, "kart:no", { why: "full" });
    // its colour: the one asked for if no one has it, else the slot's own, else any free
    const taken = new Set([...park.karts.values()].map((k) => k.colour));
    let colour = Number(m.colour);
    if (!Number.isInteger(colour) || colour < 0 || colour >= KART_COLOURS.length || taken.has(colour))
      colour = Number(key);
    if (taken.has(colour)) colour = KART_COLOURS.findIndex((_, i) => !taken.has(i));
    const slot = new KartSlot();
    slot.sid = p.sid;
    slot.name = p.name;
    slot.colour = Math.max(0, colour);
    const l = addLive(key, slot);
    bySid.set(p.sid, key);
    p.busy = `drive:kart:${key}`;
    // on the circuit, on the grid behind the line (free laps till someone starts a race)
    const g = track.grid[Number(key) % track.grid.length];
    place(l, g.x, g.z, g.a, false);
    seat(p, slot);
  });
  room.on("kart:leave", (client) => {
    const p = room.state.players.get(client.sessionId);
    out(client, p);
  });
  room.on("kart:setup", (client, m) => {
    if (!bySid.has(client.sessionId) || park.phase !== "lobby") return;
    if (m.mode === "gp" || m.mode === "battle") park.mode = m.mode;
    if (typeof m.laps === "number" && (KART_LAPS as readonly number[]).includes(m.laps)) park.laps = m.laps;
    if (typeof m.fill === "boolean") park.fill = m.fill;
    if (m.level === "easy" || m.level === "medium" || m.level === "hard") park.level = m.level;
  });
  // the track changer (docs/plan/47-the-track-changer.md): anyone's, when the park's quiet — no
  // race, nobody in a kart
  room.on("kart:layout", (client, m) => {
    if (!room.state.players.get(client.sessionId)) return;
    if (park.phase !== "lobby" || park.showing || [...live.values()].some((l) => l.slot.sid))
      return room.send(client, "kart:no", { why: park.showing ? "show" : "busy" });
    if (!KART_LAYOUTS.some((l) => l.key === m?.layout)) return;
    const was = `${park.layout}${park.reverse ? "-r" : ""}`;
    raceLayout(String(m.layout), m.reverse === true);
    saveRecord();
    // (the one raced already: nothing to do)
    if (`${park.layout}${park.reverse ? "-r" : ""}` === was) return;
    // the show: the park shut for it, the ploughs out on the new circuit (the tick drives them)
    showFrom = Date.now();
    park.showing = true;
    park.show = 0;
    // Rosa at race control calls it out (features/park-life.ts: the park's folk)
    const rosa = room.state.npcs.get("folk-rosa");
    if (rosa) {
      const name = KART_LAYOUTS.find((l) => l.key === park.layout)?.name ?? "the Figure Eight";
      rosa.say = `New circuit: ${name}${park.reverse ? ", the other way round" : ""}! Ploughs out!`;
      rosa.sayAt = Date.now();
    }
  });
  room.on("kart:ready", (client, m) => {
    const key = bySid.get(client.sessionId);
    const l = key !== undefined ? live.get(key) : undefined;
    if (l) l.slot.ready = !!m.on;
  });
  room.on("kart:colour", (client, m) => {
    const key = bySid.get(client.sessionId);
    const l = key !== undefined ? live.get(key) : undefined;
    const c = Number(m.colour);
    if (!l || park.phase !== "lobby" || !Number.isInteger(c) || c < 0 || c >= KART_COLOURS.length) return;
    if ([...park.karts.values()].some((k) => k !== l.slot && k.colour === c)) return;
    l.slot.colour = c;
  });
  room.on("mod:kart-item", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const key = bySid.get(client.sessionId);
    const l = key !== undefined ? live.get(key) : undefined;
    if (!p?.admin || !l || !(m.item in ITEMS)) return;
    l.slot.item = m.item;
    l.slot.itemN = ITEMS[m.item as ItemKind].n;
    l.slot.rolling = 0;
  });
  room.on("kart:start", (client) => {
    if (!bySid.has(client.sessionId) || park.phase !== "lobby" || park.showing) return;
    begin(Date.now());
  });

  // ── a race (or a battle) ──
  function begin(now: number) {
    const humans = [...live.values()].filter((l) => !!l.slot.sid);
    if (!humans.length) return;
    // the grid filled with Vortex at their level, if they want
    if (park.fill)
      for (let n = 0; live.size < KART_SLOTS && n < KART_SLOTS; n++) {
        const key = freeSlot();
        if (key === null) break;
        const s = new KartSlot();
        s.vortex = park.level;
        s.name = "Vortex";
        const taken = new Set([...park.karts.values()].map((k) => k.colour));
        s.colour = Math.max(
          0,
          KART_COLOURS.findIndex((_, i) => !taken.has(i)),
        );
        const l = addLive(key, s);
        l.sim = createKart(0, 0, 0, 0);
        const seed = Number(key) * 1.7 + 0.3;
        l.drive = vortexRacer(world, s.vortex as VortexLevel, seed, ((Number(key) % 3) - 1) * 2.2, l.spec);
        l.brawl = vortexBrawler(s.vortex as VortexLevel, seed);
      }
    const all = [...live.values()].sort(
      (a, b) => (a.slot.sid ? 0 : 1) - (b.slot.sid ? 0 : 1) || Number(a.key) - Number(b.key),
    );
    const spawns = bowlSpawns();
    park.phase = "lights";
    park.startAt = now;
    park.goAt = now + GO_MS;
    park.endAt = battle() ? park.goAt + BATTLE_MS : 0;
    park.results = "";
    park.shots.clear();
    shotNo = 0;
    lastCall = 0;
    crateBack.fill(0);
    park.crates = crates.map(() => "1").join("");
    all.forEach((l, i) => {
      const s = l.slot;
      Object.assign(s, {
        lap: 0,
        next: 1,
        place: i + 1,
        done: 0,
        best: 0,
        score: 0,
        item: "",
        itemN: 0,
        rolling: 0,
        spinTo: 0,
        smashTo: 0,
        shieldTo: 0,
        ploughTo: 0,
        blinkTo: 0,
        ready: false,
        rev: 0,
      });
      // (Vortex's start: down on the fourth or fifth light, the more often the better he is)
      if (l.sim) {
        const r = rand();
        const rocket = s.vortex === "hard" ? 0.8 : s.vortex === "medium" ? 0.5 : 0.25;
        l.early = r < rocket ? 0.9 + rand() * 1.2 : r < rocket + 0.3 ? 0.3 + rand() * 0.4 : 0.1;
      }
      l.lc = new LapCounter(track);
      l.staples = [];
      const at = battle() ? spawns[i % spawns.length] : track.grid[i % track.grid.length];
      place(l, at.x, at.z, at.a, true);
    });
  }
  function finish(now: number) {
    const ks = [...live.values()].map((l) => l.slot);
    const rows = battle()
      ? ks
          .sort((a, b) => b.score - a.score)
          .map((s) => ({ name: s.name, colour: s.colour, score: s.score, vortex: !!s.vortex }))
      : ks
          .sort((a, b) => (a.done && b.done ? a.done - b.done : a.done ? -1 : b.done ? 1 : a.place - b.place))
          .map((s) => ({ name: s.name, colour: s.colour, time: s.done, best: s.best, lap: s.lap, vortex: !!s.vortex }));
    park.results = JSON.stringify({ mode: park.mode, laps: park.laps, rows });
    const top = rows.slice(0, 3).map((r) => r.name);
    record.last = [{ at: now, mode: park.mode, top }, ...record.last].slice(0, 10);
    if (rows[0]) record.wins[rows[0].name] = (record.wins[rows[0].name] ?? 0) + 1;
    saveRecord();
    park.phase = "done";
    park.endAt = now + RESULTS_MS;
    park.shots.clear();
  }
  function toLobby() {
    park.phase = "lobby";
    park.endAt = 0;
    park.shots.clear();
    park.crates = "";
    for (const [key, l] of [...live]) {
      if (!l.slot.sid) drop(key);
      else {
        Object.assign(l.slot, { item: "", itemN: 0, spinTo: 0, smashTo: 0, shieldTo: 0, ploughTo: 0, blinkTo: 0 });
        l.lc = new LapCounter(track);
        // (out of the bowl: back on the circuit)
        if (park.mode === "battle") {
          const g = track.grid[Number(key) % track.grid.length];
          place(l, g.x, g.z, g.a, false);
        }
      }
    }
  }

  /** Where it is in the race: laps done and how far round, for its place. */
  const _progress = (l: Live) => {
    const on = world.locate(l.slot.x, l.slot.z, l.slot.y);
    let s = on ? on.s : 0;
    // (behind the line before it's started a lap: counts as before it)
    if (l.lc.started === null && s > track.len / 2) s -= track.len;
    return l.slot.done ? 1e9 - l.slot.done : l.lc.lap * track.len + s;
  };

  // ── the reports ──
  room.on("kart:state", (client, w) => {
    const key = bySid.get(client.sessionId);
    const l = key !== undefined ? live.get(key) : undefined;
    if (!l) return;
    const now = Date.now();
    const s = l.slot;
    if (s.smashTo > now) return;
    const dt = l.prev ? (now - l.prev.at) / 1000 : 0;
    const why = implausibleKart(l.prev, w, dt);
    // held on the grid till the lights go out
    const held = park.phase === "lights" && l.prev && Math.hypot(w.x - l.prev.x, w.z - l.prev.z) > 1.2;
    if (why || held) {
      room.send(client, "kart:snap", { x: s.x, y: s.y, z: s.z, a: s.a, still: !!held });
      return;
    }
    if (w.q <= s.seq && s.seq - w.q < 1000) return;
    Object.assign(s, {
      seq: w.q,
      x: w.x,
      y: w.y,
      z: w.z,
      a: w.a,
      vx: w.vx,
      vz: w.vz,
      steer: w.st,
      drift: Math.sign(w.d),
      tier: Math.max(0, Math.min(3, Math.round(w.tr))),
      boost: w.b > 0,
      air: !!w.air,
      trick: !!w.tk && !!w.air,
      rev: park.phase === "lights" && Number.isFinite(w.rv) ? Math.max(-1, Math.min(1, w.rv ?? 0)) : 0,
    });
    l.prev = { x: w.x, z: w.z, vx: w.vx, vz: w.vz, at: now };
    count(l, now);
  });
  /** Its laps (the race's, or free laps'), from where it is. */
  function count(l: Live, now: number) {
    if (battle() && park.phase !== "lobby") return;
    if (park.phase === "lights" || park.phase === "done") return;
    const on = world.locate(l.slot.x, l.slot.z, l.slot.y);
    if (!on) return;
    const t = (now - (park.phase === "race" ? park.goAt : 0)) / 1000;
    const ev = l.lc.update(on.s, t);
    l.slot.lap = l.lc.lap;
    l.slot.next = l.lc.next;
    if (ev !== "lap" || l.lc.last === null) return;
    l.slot.best = Math.round((l.lc.best ?? 0) * 1000);
    const ms = Math.round(l.lc.last * 1000);
    // (the park's record: the layout's own — the Figure Eight's where it always was)
    const id = `${track.key}${track.reverse ? "-r" : ""}`;
    const had = id === "eight" ? record.best : (record.bests[id] ?? null);
    if (l.slot.sid && (!had || ms < had.t)) {
      if (id === "eight") record.best = { t: ms, name: l.slot.name };
      else record.bests[id] = { t: ms, name: l.slot.name };
      saveRecord();
    }
    if (park.phase === "race" && l.lc.lap >= park.laps && !l.slot.done) {
      l.slot.done = now - park.goAt;
      if (!lastCall) lastCall = now + LAST_ONE_MS;
    }
  }

  // ── items ──
  room.on("kart:use", (client, m) => {
    const key = bySid.get(client.sessionId);
    const l = key !== undefined ? live.get(key) : undefined;
    if (l) use(l, !!m.back, Date.now(), Math.max(0, Math.min(MAX_LAG, Number(m.lag) || 0)));
  });
  /** Where a kart was at `t` (server ms, along its trail). */
  const pastOf = (l: Live, t: number): { x: number; z: number } => {
    const tr = l.trail;
    if (!tr.length) return l.slot;
    let i = tr.length - 1;
    while (i > 0 && tr[i].t > t) i--;
    const a = tr[i];
    const b = tr[i + 1];
    if (!b || t <= a.t) return a;
    const u = (t - a.t) / Math.max(1, b.t - a.t);
    return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
  };
  function use(l: Live, back: boolean, now: number, lag = 0) {
    const s = l.slot;
    if (park.phase !== "race" || !s.item || s.itemN < 1 || s.rolling > now || s.smashTo > now || s.spinTo > now) return;
    const kind = s.item as ItemKind;
    const fx = Math.cos(s.a);
    const fz = Math.sin(s.a);
    const v = Math.hypot(s.vx, s.vz);
    const shot = (k: string, x: number, z: number, vx: number, vz: number, y = s.y + 0.5) => {
      const t = new KartShot();
      Object.assign(t, { kind: k, by: l.key, x, y, z, vx, vz, a: Math.atan2(vz, vx), at: now });
      // (a person's: judged where they saw the others; Vortex's are here and now)
      t.lag = l.slot.sid ? DRAWN_BEHIND + lag : 0;
      park.shots.set(String(++shotNo), t);
      return t;
    };
    const dir = back ? -1 : 1;
    switch (kind) {
      case "snowball": {
        const sp = ITEM.snowball.speed * dir + (back ? 0 : v);
        shot("snowball", s.x + fx * 1.6 * dir, s.z + fz * 1.6 * dir, fx * sp, fz * sp);
        break;
      }
      case "ice":
        shot("ice", s.x - fx * ITEM.ice.behind, s.z - fz * ITEM.ice.behind, 0, 0, s.y);
        break;
      case "stapler":
        // (a burst: the tick keeps firing it till it's done)
        shot("stapler", s.x, s.z, 0, 0);
        break;
      case "fax": {
        const d = back ? -4 : ITEM.fax.ahead;
        const sp = d / (ITEM.fax.flight / 1000);
        shot("fax", s.x + fx * 1.2, s.z + fz * 1.2, fx * sp, fz * sp);
        break;
      }
      case "drone": {
        const t = shot(
          "drone",
          s.x + fx * 1.5,
          s.z + fz * 1.5,
          fx * ITEM.drone.speed,
          fz * ITEM.drone.speed,
          s.y + 2.4,
        );
        t.a = s.a;
        break;
      }
      case "coffee":
        boost(l, ITEM.coffee.boost);
        break;
      case "umbrella":
        s.shieldTo = now + ITEM.umbrella.for;
        break;
      case "plough":
        s.ploughTo = now + ITEM.plough.for;
        boost(l, ITEM.plough.for / 1000, ITEM.plough.top);
        break;
    }
    s.itemN--;
    if (s.itemN <= 0) s.item = "";
  }
  const boost = (l: Live, secs: number, top?: number) => {
    if (l.sim) l.sim.boost = Math.max(l.sim.boost, secs);
    else if (l.slot.sid) say(l.slot.sid, (c) => room.send(c, "kart:boost", { secs, top }));
  };
  /** A hit: an umbrella eats it; a race spins it out, a battle smashes it (a point to whoever). */
  function hit(l: Live, by: string, item: string, now: number) {
    const s = l.slot;
    if (s.blinkTo > now || s.ploughTo > now || s.smashTo > now || s.spinTo > now) return;
    if (s.shieldTo > now) {
      s.shieldTo = 0;
      return;
    }
    if (battle()) {
      s.smashTo = now + SMASH_MS;
      s.blinkTo = now + SMASH_MS + BLINK_MS;
      const b = live.get(by);
      if (b && b !== l) b.slot.score++;
    } else {
      s.spinTo = now + KART.spinFor * 1000;
      if (l.sim) spinOut(l.sim);
    }
    if (s.sid)
      say(s.sid, (c) => room.send(c, "kart:hit", { by: live.get(by)?.slot.name ?? "", item, smash: battle() }));
  }
  /** The crates: driven through, a roll (by place in a race). */
  function crateTakes(now: number) {
    let changed = false;
    const ranked = [...live.values()].filter((l) => !l.slot.done);
    const n = Math.max(1, ranked.length - 1);
    crates.forEach((c, i) => {
      if (c.battle !== battle()) return;
      if (crateBack[i] > now) return;
      if (crateBack[i] !== 0) {
        crateBack[i] = 0;
        changed = true;
      }
      for (const l of live.values()) {
        const s = l.slot;
        if (s.smashTo > now || Math.hypot(s.x - c.x, s.z - c.z) > ITEM.crateR) continue;
        crateBack[i] = now + ITEM.crateBack;
        changed = true;
        if (s.item || s.rolling > now) break;
        const pos = battle() ? 0.5 : (s.place - 1) / n;
        // (not the same twice running; one plough out at a time)
        const not: ItemKind[] = l.lastItem ? [l.lastItem] : [];
        for (const o of live.values()) if (o.slot.ploughTo > now || o.slot.item === "plough") not.push("plough");
        const kind = rollItem(pos, battle(), rand(), not);
        l.lastItem = kind;
        s.item = kind;
        s.itemN = ITEMS[kind].n;
        s.rolling = now + ITEM.roll;
        break;
      }
    });
    if (changed) park.crates = crates.map((_, i) => (crateBack[i] > now ? "0" : "1")).join("");
  }
  /** Everything flying: moved, into walls, into karts. */
  function fly(dt: number, now: number) {
    const w = worldNow();
    // (what it hits: each kart where the thrower saw it — `lag` ms back along its trail — or,
    // if it's nearer, where it is now: fair to both)
    let lagNow = 0;
    const kartsNear = (x: number, z: number, r: number, not: string, immune = 0) =>
      [...live.values()].filter((l) => {
        if ((l.key === not && now <= immune) || l.slot.smashTo > now) return false;
        if (Math.hypot(l.slot.x - x, l.slot.z - z) < r) return true;
        if (!lagNow) return false;
        const p = pastOf(l, now - lagNow);
        return Math.hypot(p.x - x, p.z - z) < r;
      });
    for (const [id, t] of [...park.shots]) {
      const age = now - t.at;
      // (what flies at someone: judged by its thrower's view; what lies there, by now)
      lagNow = t.kind === "snowball" || t.kind === "staple" || t.kind === "drone" ? t.lag : 0;
      const owner = live.get(t.by);
      if (t.kind === "snowball" || t.kind === "staple") {
        const spec = t.kind === "snowball" ? ITEM.snowball : ITEM.stapler;
        if (age > spec.life) {
          park.shots.delete(id);
          continue;
        }
        t.x += t.vx * dt;
        t.z += t.vz * dt;
        t.y = w.under(t.x, t.z, t.y + 2).y + 0.5;
        const wall = w.wall(t.x, t.z, t.y, 0.2);
        if (wall) {
          // (a snowball bounces once; a staple's gone)
          if (t.kind === "staple" || t.a < -10) {
            park.shots.delete(id);
            continue;
          }
          const vn = t.vx * wall.nx + t.vz * wall.nz;
          t.vx -= 2 * vn * wall.nx;
          t.vz -= 2 * vn * wall.nz;
          t.x += wall.nx * wall.depth;
          t.z += wall.nz * wall.depth;
          t.a = -11; // (bounced)
        }
        // (in the bowl a snowball leans towards the nearest kart ahead of it, a little)
        if (t.kind === "snowball" && battle()) {
          const sp = Math.hypot(t.vx, t.vz);
          const dir = Math.atan2(t.vz, t.vx);
          let best: Live | undefined;
          let bd = 30;
          for (const o of live.values()) {
            if (o.key === t.by || o.slot.smashTo > now) continue;
            const d = Math.hypot(o.slot.x - t.x, o.slot.z - t.z);
            const off = Math.abs(
              Math.atan2(
                Math.sin(Math.atan2(o.slot.z - t.z, o.slot.x - t.x) - dir),
                Math.cos(Math.atan2(o.slot.z - t.z, o.slot.x - t.x) - dir),
              ),
            );
            if (d < bd && off < 1.1) {
              bd = d;
              best = o;
            }
          }
          if (best) {
            let d = Math.atan2(best.slot.z - t.z, best.slot.x - t.x) - dir;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            const na = dir + Math.max(-2.4 * dt, Math.min(2.4 * dt, d));
            t.vx = Math.cos(na) * sp;
            t.vz = Math.sin(na) * sp;
          }
        }
        const victim = kartsNear(t.x, t.z, spec.r, t.by, t.at + 350)[0];
        if (victim) {
          park.shots.delete(id);
          if (t.kind === "snowball") hit(victim, t.by, "snowball", now);
          else {
            victim.staples = [...victim.staples.filter((x) => now - x < ITEM.stapler.within), now];
            if (victim.staples.length >= ITEM.stapler.hits) {
              victim.staples = [];
              hit(victim, t.by, "stapler", now);
            }
          }
        }
      } else if (t.kind === "stapler") {
        // the burst: a staple every so often from the owner's nose, for its time
        if (!owner || age > ITEM.stapler.for) {
          park.shots.delete(id);
          continue;
        }
        if (Math.floor(age / ITEM.stapler.every) > Math.floor((age - dt * 1000) / ITEM.stapler.every)) {
          const s = owner.slot;
          const fx = Math.cos(s.a);
          const fz = Math.sin(s.a);
          const sp = ITEM.stapler.speed + Math.hypot(s.vx, s.vz);
          const st = new KartShot();
          Object.assign(st, {
            kind: "staple",
            by: t.by,
            x: s.x + fx * 1.4,
            y: s.y + 0.6,
            z: s.z + fz * 1.4,
            vx: fx * sp,
            vz: fz * sp,
            a: s.a,
            at: now,
          });
          st.lag = t.lag;
          park.shots.set(String(++shotNo), st);
        }
      } else if (t.kind === "ice") {
        if (age > ITEM.ice.life) {
          park.shots.delete(id);
          continue;
        }
        const victim = kartsNear(t.x, t.z, ITEM.ice.r, t.by, t.at + 1000)[0];
        if (victim) {
          park.shots.delete(id);
          hit(victim, t.by, "ice", now);
        }
      } else if (t.kind === "fax") {
        if (age < ITEM.fax.flight) {
          t.x += t.vx * dt;
          t.z += t.vz * dt;
          const u = age / ITEM.fax.flight;
          t.y = w.under(t.x, t.z, t.y + 3).y + 4 * u * (1 - u) * 3;
          continue;
        }
        t.y = w.under(t.x, t.z, t.y + 3).y;
        const tripped = kartsNear(t.x, t.z, ITEM.fax.trip, t.by, t.at + ITEM.fax.flight + 600).length > 0;
        if (tripped || age > ITEM.fax.flight + ITEM.fax.fuse) {
          park.shots.delete(id);
          for (const v of kartsNear(t.x, t.z, ITEM.fax.blast, "")) hit(v, t.by, "fax", now);
          const b = new KartShot();
          Object.assign(b, { kind: "blast", by: t.by, x: t.x, y: t.y, z: t.z, at: now });
          park.shots.set(String(++shotNo), b);
        }
      } else if (t.kind === "blast") {
        if (age > 700) park.shots.delete(id);
      } else if (t.kind === "drone") {
        if (age > ITEM.drone.life) {
          park.shots.delete(id);
          continue;
        }
        // its target: the kart one place ahead of its owner's (a race), the nearest (a battle)
        const me = owner?.slot;
        let target: Live | undefined;
        if (battle() || !me)
          target = [...live.values()]
            .filter((l) => l.key !== t.by && l.slot.smashTo <= now)
            .sort((a, b) => Math.hypot(a.slot.x - t.x, a.slot.z - t.z) - Math.hypot(b.slot.x - t.x, b.slot.z - t.z))[0];
        else target = [...live.values()].find((l) => l.slot.place === Math.max(1, me.place - 1) && l.key !== t.by);
        if (target) {
          const want = Math.atan2(target.slot.z - t.z, target.slot.x - t.x);
          let d = want - t.a;
          while (d > Math.PI) d -= 2 * Math.PI;
          while (d < -Math.PI) d += 2 * Math.PI;
          t.a += Math.max(-3.5 * dt, Math.min(3.5 * dt, d));
        }
        t.vx = Math.cos(t.a) * ITEM.drone.speed;
        t.vz = Math.sin(t.a) * ITEM.drone.speed;
        t.x += t.vx * dt;
        t.z += t.vz * dt;
        t.y = w.under(t.x, t.z, t.y + 4).y + 2.2;
        const victim = kartsNear(t.x, t.z, ITEM.drone.r, t.by, Number.POSITIVE_INFINITY)[0];
        if (victim) {
          park.shots.delete(id);
          hit(victim, t.by, "drone", now);
        }
      }
    }
    lagNow = 0;
    // the plough: whoever it touches
    for (const l of live.values())
      if (l.slot.ploughTo > now)
        for (const v of kartsNear(l.slot.x, l.slot.z, ITEM.plough.r, l.key, Number.POSITIVE_INFINITY))
          hit(v, l.key, "plough", now);
  }

  // ── Vortex at the wheel ──
  /** How far round the race (m): its laps and where it is on this one (the grid, behind the line: −). */
  function progress(l: Live): number {
    const on = world.locate(l.slot.x, l.slot.z, l.slot.y);
    const s = on ? on.s : 0;
    return l.lc.lap * track.len + (l.lc.next === 1 && s > track.len - 60 ? s - track.len : s);
  }
  function vortexDrive(dt: number, now: number) {
    // (the leading driver who isn't him, still racing: his rubber band's mark)
    let lead = Number.NEGATIVE_INFINITY;
    if (park.phase === "race" && !battle())
      for (const o of live.values()) if (o.slot.sid && !o.slot.done) lead = Math.max(lead, progress(o));
    for (const l of live.values()) {
      if (!l.sim || !l.drive || !l.brawl) continue;
      const s = l.slot;
      const k = l.sim;
      if (s.smashTo > now) continue;
      l.spec.vmax = KART.vmax * (Number.isFinite(lead) ? vortexBand(s.vortex as VortexLevel, lead - progress(l)) : 1);
      l.acc += dt;
      const w = worldNow();
      // (the nearest kart, for the bowl)
      let near: { x: number; z: number } | null = null;
      if (battle()) {
        let bd = 1e9;
        for (const o of live.values()) {
          if (o === l || o.slot.smashTo > now) continue;
          const d = Math.hypot(o.slot.x - k.x, o.slot.z - k.z);
          if (d < bd) {
            bd = d;
            near = o.slot;
          }
        }
      }
      // (the others, for his slipstream)
      const others = [...live.values()].filter((o) => o !== l && o.slot.smashTo <= now).map((o) => o.slot);
      while (l.acc >= KART_STEP) {
        l.acc -= KART_STEP;
        const input = park.phase !== "race" ? NO_INPUT : battle() ? l.brawl(k, near) : l.drive(k);
        stepKart(k, input === NO_INPUT ? input : { ...input, draft: kartInWake(k, others) }, w, l.spec);
        // (shoved by the karts round it)
        for (const o of live.values())
          if (o !== l && o.slot.smashTo <= now) bumpKart(k, o.slot.x, o.slot.z, o.slot.vx, o.slot.vz);
      }
      Object.assign(s, {
        x: k.x,
        y: k.y,
        z: k.z,
        a: k.a,
        vx: k.vx,
        vz: k.vz,
        steer: k.steer,
        drift: k.drift,
        tier: k.tier,
        boost: k.boost > 0,
        air: k.air,
        trick: k.trick && k.air,
        seq: s.seq + 1,
        // (revving on the grid, his throttle down)
        rev: park.phase === "lights" ? gridRevs(l.early - (park.goAt - now) / 1000, now / 1000) : 0,
      });
      count(l, now);
      // his items: used when it makes sense (a snowball or the stapler at someone ahead, ice when
      // someone's behind, the rest at once)
      if (s.item && s.rolling <= now && now > l.vortexItemAt) {
        const fx = Math.cos(k.a);
        const fz = Math.sin(k.a);
        let ahead = false;
        let behind = false;
        for (const o of live.values()) {
          if (o === l) continue;
          const dx = o.slot.x - k.x;
          const dz = o.slot.z - k.z;
          const d = Math.hypot(dx, dz);
          const dot = (dx * fx + dz * fz) / Math.max(d, 0.01);
          if (d < (battle() ? 32 : 26) && dot > (battle() ? 0.75 : 0.9)) ahead = true;
          if (d < 14 && dot < -0.8) behind = true;
        }
        const kind = s.item as ItemKind;
        const go = kind === "snowball" || kind === "stapler" || kind === "fax" ? ahead : kind === "ice" ? behind : true;
        if (go) {
          use(l, false, now);
          l.vortexItemAt = now + 900 + rand() * 1500;
        }
      }
      if (kartSpeed(k) < 0 && park.phase === "race" && !battle()) {
        // (backwards and stuck: back on the road facing the right way)
        const on = world.locate(k.x, k.z, k.y);
        if (!on) {
          const p = trackAt(track, 0);
          place(l, p.x, p.z, p.a);
        }
      }
    }
  }

  /** The people in karts, in their seats (their own `pos` isn't taken while they drive). */
  const seat = (p: Player, s: KartSlot) => {
    p.x = s.x - off.x;
    p.y = s.z - off.y;
    p.z = s.y + 0.25;
    p.level = 0;
    p.a = ANIM.sit;
    p.d = dirFromDelta(Math.cos(s.a), Math.sin(s.a), p.d as 0);
  };

  // ── the change's show (shared KART_SHOW): the Grounds' ploughs, one a quarter of the circuit ──
  let showFrom = 0;
  const ploughs: Vehicle[] = [];
  const showTick = (now: number) => {
    if (!park.showing) return;
    const ms = now - showFrom;
    if (!ploughs.length)
      for (let k = 0; k < KART_SHOW.ploughs; k++) {
        const v = new Vehicle();
        v.id = `kart-plough-${k}`;
        v.kind = "plough";
        room.state.vehicles.set(v.id, v);
        ploughs.push(v);
      }
    const f = kartShowF(ms);
    park.show = f;
    const run = f > 0 && f < 1;
    for (const [k, v] of ploughs.entries()) {
      const p = kartPloughAt(track, k, f);
      // (its height too: up the bridge's ramps, or under its span — the land's is the deck's there)
      Object.assign(v, {
        x: p.x,
        z: p.z,
        y: terrainAt(p.x, p.z) + p.y,
        a: p.a,
        v: run ? (track.len / KART_SHOW.ploughs / (KART_SHOW.to - KART_SHOW.from)) * 1000 : 0,
      });
      v.shown = ms < KART_SHOW.ms;
    }
    if (ms >= KART_SHOW.ms) {
      park.showing = false;
      park.show = 0;
    }
  };

  return {
    tick(dt, now) {
      showTick(now);
      // each kart's trail (for judging a throw where its thrower saw them)
      for (const l of live.values()) {
        const tr = l.trail;
        const last = tr[tr.length - 1];
        if (!last || last.x !== l.slot.x || last.z !== l.slot.z) tr.push({ t: now, x: l.slot.x, z: l.slot.z });
        while (tr.length > 2 && tr[0].t < now - TRAIL_MS) tr.shift();
      }
      // the drivers in their seats; a driver gone (or out of the kart some other way): its kart freed
      for (const [key, l] of [...live]) {
        const s = l.slot;
        if (!s.sid) continue;
        const p = room.state.players.get(s.sid);
        if (!p || p.busy !== `drive:kart:${key}`) {
          drop(key);
          continue;
        }
        seat(p, s);
        // a smashed kart's back on a spawn
        if (s.smashTo && s.smashTo <= now && battle()) {
          s.smashTo = 0;
          const sp = bowlSpawns()[Math.floor(rand() * 8)];
          place(l, sp.x, sp.z, sp.a, false);
        }
        if (l.prev && now - l.prev.at > QUIET_MS && racing()) l.prev.at = now;
      }
      // (everyone gone but Vortex: the race is off)
      if (park.phase !== "lobby" && ![...live.values()].some((l) => l.slot.sid)) toLobby();
      if (park.phase === "lights" && now >= park.goAt) {
        park.phase = "race";
        for (const l of live.values()) {
          l.slot.rev = 0;
          // (Vortex off the line as his throttle was timed: the players' are their own, kart/karts.ts)
          const st = l.sim ? kartStart(l.early) : "go";
          if (l.sim && (st === "rocket" || st === "good")) l.sim.boost = KART.turbo[st === "rocket" ? 1 : 0];
        }
      }
      if (park.phase === "race") {
        vortexDrive(dt, now);
        // Vortex's smashed karts back
        for (const l of live.values())
          if (l.sim && l.slot.smashTo && l.slot.smashTo <= now) {
            l.slot.smashTo = 0;
            const sp = bowlSpawns()[Math.floor(rand() * 8)];
            place(l, sp.x, sp.z, sp.a, false);
          }
        crateTakes(now);
        fly(dt, now);
        if (!battle()) {
          // places
          const ranked = [...live.values()].sort((a, b) => progress(b) - progress(a));
          ranked.forEach((l, i) => {
            l.slot.place = i + 1;
          });
          const humansDone = [...live.values()].filter((l) => l.slot.sid).every((l) => l.slot.done);
          if (humansDone || (lastCall && now > lastCall) || now - park.goAt > RACE_MAX_MS) finish(now);
        } else {
          const ranked = [...live.values()].sort((a, b) => b.slot.score - a.slot.score);
          ranked.forEach((l, i) => {
            l.slot.place = i + 1;
          });
          if (now >= park.endAt) finish(now);
        }
      } else if (park.phase === "lights") vortexDrive(dt, now);
      if (park.phase === "done" && now >= park.endAt) toLobby();
      // the lobby's countdown: someone ready, then everyone ready, starts it on its own
      if (park.phase === "lobby") {
        const humans = [...live.values()].filter((l) => !!l.slot.sid);
        const ready = humans.filter((l) => l.slot.ready).length;
        if (!ready) park.autoAt = 0;
        else {
          if (!park.autoAt) park.autoAt = now + READY_MS;
          if (ready === humans.length) park.autoAt = Math.min(park.autoAt, now + ALL_READY_MS);
          if (now >= park.autoAt && !park.showing) {
            park.autoAt = 0;
            begin(now);
          }
        }
      } else park.autoAt = 0;
    },
    leave(client, p) {
      if (bySid.has(client.sessionId)) out(undefined, p);
    },
  };
});
