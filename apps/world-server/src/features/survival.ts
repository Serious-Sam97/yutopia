import { ANIM, levelMap, objLevel, tileAt } from "@yutopia/shared";
import { hasPower } from "@yutopia/shared/admin";
import {
  addItem,
  addItemTo,
  addStack,
  addWeapon,
  type Budget,
  blackoutAt,
  type Cache,
  canFocus,
  cleanInventory,
  consume,
  count,
  DOWN,
  DROP_MS,
  dayNests,
  dayOf,
  emptyInventory,
  FULL_VITALS,
  freshClock,
  hasWeapon,
  hurt,
  type Inventory,
  type ItemId,
  inLampPool,
  isStack,
  isWeapon,
  KIT_SPOT,
  LOCKER,
  LOCKER_KIT,
  LOOT_REACH,
  type LootItem,
  lockerFront,
  lootSpot,
  moveSlot,
  type Nest,
  nestCount,
  nightBudget,
  nightness,
  nightOf,
  QUICK_SLOT,
  REFILL_MIN,
  removeSlot,
  rollLoot,
  type Stack,
  slotAt,
  spendRoll,
  stepVitals,
  takeStack,
  USABLE,
  type Vitals,
  type VitalsClock,
  vitalByte,
  WEAPONS,
} from "@yutopia/shared/dark";
import { INSIDES } from "@yutopia/shared/grounds";
import { GAITS, KH_MOVE, MV_AIM } from "@yutopia/shared/move";
import { between } from "@yutopia/shared/reach";
import { api, type SurvivorRecord } from "../api.ts";
import { config } from "../config.ts";
import { Cache as CacheWire, Drop, type Player } from "../schema.ts";
import { fromSchema, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// Survival on the Grounds (docs/plan/30-the-dark.md, phase 2): everyone's
// vitals settled every tick from what their body does (a sprint outside drains
// stamina; the cold, warmth; the battery), what each person carries (sent only
// to them), the loot spots and what's dropped (on any floor), the gatehouse's
// locker, and saving it all through the API — the people's (`survivors`),
// debounced as the pets are, and the Grounds' loot (the world's settings).
// The room asks it whether someone is winded (the allowance falls to a jog)
// and to pay for a roll.

// (YUTOPIA_LOOT_FAST: the tests' — refills in a moment, not minutes)
const FAST = process.env.YUTOPIA_LOOT_FAST === "1";
const SAVE_MS = 30_000;
// (YUTOPIA_DARK_FAST: the tests' — down, a bleed in seconds)
const FAST_DOWN = process.env.YUTOPIA_DARK_FAST === "1";
const BLEED_MS = (FAST_DOWN ? 3 : DOWN.bleed) * 1000;
const REVIVE_MS = DOWN.revive * 1000;
const SELF_MS = DOWN.selfAid * 1000;
const WINDED_GRACE_MS = 300; // the client stops sprinting a message's lag before we hear of it
// tiles / s over the last quarter second (for a second): no run (the body's KH run since plan 56)
const SPRINT_SEEN = KH_MOVE.jog * 1.2;
const SPRINT = GAITS.indexOf("sprint");
const MAX_DROPS = 300;

interface Survivor {
  uid: number;
  bot: boolean;
  v: Vitals;
  c: VitalsClock;
  inv: Inventory;
  issued: boolean; // the locker's first revolver (loaded) given
  kitDay: number; // the day (shared dayOf) the lobby's locker last gave its kit (-1: never)
  loaded: boolean; // the saved record is in (until then nothing can be taken or used)
  dirty: boolean;
  savedAt: number;
  windedAt: number; // when stamina ran out (0: not winded)
  trail: { t: number; x: number; y: number }[]; // the last quarter second's positions
  selfAt: number; // down, using their own first aid since (server ms; 0: not)
  awayOut: number; // s away out on the land at night (D7: then down)
  fastSince: number; // going faster than a jog since (0: not)
  batSent: number;
  batAt: number;
  out: boolean; // outside (counted for the night's budget)
}

interface SpotState {
  until: number; // empty until then (0: full)
  left?: LootItem[]; // what didn't fit last time (found first next time)
}
interface LootSave {
  spots: Record<string, SpotState>;
  night: number;
  people: number[];
  spent: Budget;
  drops: { id: string; item: string; n: number; loaded: number; x: number; y: number; at: number; level?: number }[];
  /** the day's caches (docs/plan/31-the-day.md): whose day, who's been out, what's left in each searched */
  cache?: { day: number; out: number[]; left: Record<string, LootItem[]> };
}

export interface SurvivalHooks {
  /** out of breath for longer than a message's lag: the allowance is a jog's */
  winded(sid: string): boolean;
  /** a roll's stamina: false (refuse it) while winded */
  roll(sid: string): boolean;
  /** the client says it's out of breath (its own count reached 0 a moment before ours) */
  breathless(sid: string): void;
  /** a strike (features/dark.ts): `n` off health; at nothing, they go down */
  hurt(sid: string, n: number): void;
  /** down (D7): crawling, no jumps, no shots */
  down(sid: string): boolean;
  /** what they carry, to change in place (features/arms.ts: rounds, flares); null until loaded */
  inventory(sid: string): Inventory | null;
  /** …changed: sent to them and saved */
  changed(sid: string): void;
  /** an admin's (docs/plan/48-the-admin.md): health, breath and battery full; up again if down */
  heal(sid: string): void;
  /** an admin's: something into their pockets (or, `drop`, on the ground where they stand);
   *  false: nothing went (unknown, or no room) */
  give(sid: string, item: string, n: number, drop?: boolean): boolean;
}

const offlineSurvivors = new Map<number, SurvivorRecord>();
/** The lobby locker's clock, ahead by `shift` ms (the tests' next day). */
export const kitClock = { shift: 0 };

registerFeature((room: WorldRoom) => {
  const people = new Map<number, Survivor>(); // by user id
  const hello = new Set<string>(); // sids whose chunk listens
  const ground = () => levelMap(room.map, 0);
  // building coords (the Grounds') of a ground-floor spot
  const toB = (x: number, y: number) => ({ x: x + (ground()?.ox ?? 0), z: y + (ground()?.oy ?? 0) });
  const onLand = (p: Player) => p.level === 0 && room.gridFor(p.uid, 0).onLand(p.x, p.y);
  const inside = (bx: number, bz: number) =>
    INSIDES.some((i) => bx >= i.b.x0 && bx < i.b.x1 && bz >= i.b.z0 && bz < i.b.z1);
  const of = (sid: string) => {
    const p = room.state.players.get(sid);
    return p ? people.get(p.uid) : undefined;
  };
  const clientOf = (sid: string) => room.clients.getById(sid) as WorldClient | undefined;

  // ── the people ─────────────────────────────────────────────────────────────
  const recordOf = (s: Survivor): SurvivorRecord => ({
    inventory: { quick: s.inv.quick, pockets: s.inv.pockets },
    vitals: { hp: s.v.hp, wm: s.v.wm, bat: s.v.bat },
    pages: s.inv.pages,
    issued: s.issued,
    kitDay: s.kitDay >= 0 ? s.kitDay : null,
  });
  const save = async (s: Survivor, now = Date.now()) => {
    if (s.bot || !s.loaded) return;
    s.dirty = false;
    s.savedAt = now;
    const rec = recordOf(s);
    if (config.offline) {
      offlineSurvivors.set(s.uid, structuredClone(rec));
      return;
    }
    await api.saveSurvivor(s.uid, rec).catch((e) => console.warn("[survival] save", (e as Error).message));
  };
  const adopt = (s: Survivor, rec: SurvivorRecord | null) => {
    if (rec) {
      s.inv = cleanInventory({ ...rec.inventory, pages: rec.pages });
      const n = (x: unknown, d: number) => (Number.isFinite(Number(x)) ? Math.max(0, Math.min(100, Number(x))) : d);
      s.v.hp = n(rec.vitals?.hp, 100);
      // (saved while down — a restart, the line dropped — and being down isn't saved: back as if
      // woken, not standing at 0 where nothing can be done, nor done to them)
      if (s.v.hp <= 0) s.v.hp = DOWN.awakeHp;
      s.v.wm = n(rec.vitals?.wm, 100);
      s.v.bat = n(rec.vitals?.bat, 100);
      s.issued = !!rec.issued;
      s.kitDay = Number.isInteger(rec.kitDay) ? Number(rec.kitDay) : -1;
    }
    s.loaded = true;
    sendPockets(s);
  };
  const sendPockets = (s: Survivor) => {
    for (const p of room.state.players.values()) {
      if (p.uid !== s.uid || !hello.has(p.sid)) continue;
      const c = clientOf(p.sid);
      if (c) room.send(c, "dark:pockets", { inv: s.inv, bat: Math.round(s.v.bat) });
      s.batSent = Math.round(s.v.bat);
    }
  };
  const changed = (s: Survivor) => {
    s.dirty = true;
    sendPockets(s);
  };

  // ── the loot ───────────────────────────────────────────────────────────────
  const loot: LootSave = {
    spots: {},
    night: nightOf(Date.now()),
    people: [],
    spent: { r38: 0, shell: 0 },
    drops: [],
    cache: { day: dayOf(Date.now()), out: [], left: {} },
  };
  let lootDirty = false;
  let lootSavedAt = 0;
  {
    const saved = room.savedLoot as Partial<LootSave> | null;
    if (saved && typeof saved === "object") {
      for (const [id, st] of Object.entries(saved.spots ?? {}))
        if (lootSpot(id) && st && typeof st === "object")
          loot.spots[id] = {
            until: Number(st.until) || 0,
            left: Array.isArray(st.left) && st.left.length ? cleanItems(st.left) : undefined,
          };
      if (saved.night === loot.night) {
        loot.people = (saved.people ?? []).filter((u) => Number.isInteger(u));
        loot.spent = { r38: Number(saved.spent?.r38) || 0, shell: Number(saved.spent?.shell) || 0 };
      }
      const now = Date.now();
      // (the day's caches: what's been taken today, kept across a restart)
      if (saved.cache?.day === dayOf(now))
        loot.cache = {
          day: saved.cache.day,
          out: (saved.cache.out ?? []).filter((u) => Number.isInteger(u)),
          left: Object.fromEntries(
            Object.entries(saved.cache.left ?? {}).map(([k, v]) => [k, Array.isArray(v) ? cleanItems(v) : []]),
          ),
        };
      for (const d of saved.drops ?? []) {
        if (!(isStack(d.item) || isWeapon(d.item)) || now - d.at > DROP_MS) continue;
        putDrop(d.item, d.n, d.loaded, d.x, d.y, d.at, d.id, Number.isInteger(d.level) ? Number(d.level) : 0);
      }
    }
  }
  function putDrop(item: ItemId, n: number, loaded: number, x: number, y: number, at: number, id?: string, level = 0) {
    const d = new Drop();
    d.id = id ?? `d${at.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    d.item = item;
    d.n = Math.max(1, Math.min(255, n | 0));
    d.loaded = Math.max(0, Math.min(255, loaded | 0));
    d.x = x;
    d.y = y;
    d.at = at;
    d.level = Math.max(0, Math.min(255, level | 0));
    room.state.drops.set(d.id, d);
    // (the oldest go first past the cap)
    if (room.state.drops.size > MAX_DROPS) {
      const old = [...room.state.drops.values()].sort((a, b) => a.at - b.at)[0];
      room.state.drops.delete(old.id);
    }
    lootDirty = true;
  }
  // ── the day's caches: the nests' (shared dark/nests.ts), laid out with them; what's taken kept ──
  let nestsOf: { day: number; nests: Nest[] } | null = null;
  const todays = (day: number) => {
    if (nestsOf?.day !== day) nestsOf = { day, nests: dayNests(day) };
    return nestsOf.nests;
  };
  const cacheOf = (id: string): Cache | null => {
    const c = loot.cache;
    if (!c) return null;
    return todays(c.day).find((n) => n.cache?.id === id)?.cache ?? null;
  };
  // the caches out today: the nests that are (the base and more as people go out), not emptied
  const cachesTick = (now: number) => {
    const day = dayOf(now);
    if (!loot.cache || loot.cache.day !== day) {
      loot.cache = { day, out: [], left: {} };
      lootDirty = true;
    }
    const c = loot.cache;
    const all = todays(day);
    const k = room.dark?.peaceful ? 0 : nestCount(all, c.out.length);
    const want = new Set<string>();
    const g = ground();
    for (let i = 0; i < k; i++) {
      const cache = all[i].cache;
      if (!cache || c.left[cache.id]?.length === 0) continue;
      want.add(cache.id);
      if (room.state.caches.has(cache.id)) continue;
      const w = new CacheWire();
      w.id = cache.id;
      w.kind = cache.kind;
      w.x = cache.x - (g?.ox ?? 0);
      w.y = cache.z - (g?.oy ?? 0);
      room.state.caches.set(w.id, w);
    }
    for (const id of [...room.state.caches.keys()]) if (!want.has(id)) room.state.caches.delete(id);
  };
  const budgetLeft = (): Budget => {
    const b = nightBudget(loot.people.length);
    return { r38: Math.max(0, b.r38 - loot.spent.r38), shell: Math.max(0, b.shell - loot.spent.shell) };
  };
  const newNight = (now: number) => {
    const n = nightOf(now);
    if (n === loot.night) return;
    loot.night = n;
    loot.people = [];
    loot.spent = { r38: 0, shell: 0 };
    lootDirty = true;
  };
  const saveLoot = (now = Date.now()) => {
    lootDirty = false;
    lootSavedAt = now;
    if (config.offline) return;
    loot.drops = [...room.state.drops.values()].map((d) => ({
      id: d.id,
      item: d.item,
      n: d.n,
      loaded: d.loaded,
      x: d.x,
      y: d.y,
      at: d.at,
      level: d.level,
    }));
    void api.putLoot(loot).catch((e) => console.warn("[survival] loot save", (e as Error).message));
  };
  /** Into someone's pockets: what went in, what's left over. */
  const take = (s: Survivor, items: LootItem[]) => {
    const got: LootItem[] = [];
    const left: LootItem[] = [];
    for (const it of items) {
      if (isWeapon(it.id)) {
        const rest = addWeapon(s.inv, { id: it.id, loaded: it.loaded ?? 0 });
        if (!rest) {
          got.push(it);
          continue;
        }
        // one of a kind already carried: its rounds come to the pockets, the gun stays
        const rounds = (it.loaded ?? 0) - rest.loaded;
        if (rounds > 0) got.push({ id: WEAPONS[it.id].ammo, n: rounds });
        left.push({ id: it.id, n: 1, loaded: rest.loaded });
        continue;
      }
      const n = addItem(s.inv, it);
      if (n) got.push({ id: it.id, n });
      if (n < it.n) left.push({ id: it.id, n: it.n - n });
    }
    return { got, left };
  };
  const found = (
    s: Survivor,
    sid: string,
    spot: string,
    got: LootItem[],
    full: boolean,
    gone = false,
    later = false,
  ) => {
    const p = room.state.players.get(sid);
    if (got.length && p) {
      p.held = ""; // (picking something up puts the mug down)
      p.heldAt = 0;
    }
    const c = clientOf(sid);
    if (c) room.send(c, "dark:found", { spot, got, full, ...(gone ? { gone } : {}), ...(later ? { later } : {}) });
    if (got.length) changed(s);
  };
  // (a loot spot on the ground: in three dimensions — shared reach.ts)
  const near = (p: Player, x: number, z: number) => {
    const b = toB(p.x, p.y);
    const at = { x: p.x + (x - b.x), y: p.y + (z - b.z) };
    return Math.hypot(b.x - x, b.z - z, room.upOff(p, at, 1)) <= LOOT_REACH;
  };
  const ready = (client: WorldClient) => {
    const p = room.state.players.get(client.sessionId);
    const s = p && people.get(p.uid);
    if (!p || !s?.loaded || p.busy || p.act || p.a === ANIM.sit || p.downAt) return null;
    return { p, s };
  };

  room.on("dark:hello", (client) => {
    hello.add(client.sessionId);
    const s = of(client.sessionId);
    if (s?.loaded) sendPockets(s);
  });
  room.on("dark:loot", (client, m) => {
    const r = ready(client);
    const id = String(m?.spot ?? "");
    if (!r) return;
    const { p, s } = r;
    const now = Date.now();
    // a supply locker (put anywhere in build mode): a kit a day (what fits; the day's taken if
    // anything was) — on its floor
    if (id.startsWith(KIT_SPOT)) {
      const o = room.state.objects.get(id.slice(KIT_SPOT.length));
      if (o?.kind !== "locker" || objLevel(fromSchema(o), room.map) !== p.level) return;
      const f = lockerFront(o);
      if (room.reach3(p, fromSchema(o), Math.hypot(p.x - f.x, p.y - f.y), f) > LOOT_REACH) return;
      const day = dayOf(now + kitClock.shift);
      if (s.kitDay === day) return found(s, client.sessionId, id, [], false, false, true);
      const gun = !hasWeapon(s.inv, "revolver");
      const kit: LootItem[] = [
        ...(gun ? [{ id: "revolver" as const, n: 1, loaded: s.issued ? 0 : WEAPONS.revolver.mag }] : []),
        ...LOCKER_KIT,
      ];
      const { got, left } = take(s, kit);
      if (!got.length) return found(s, client.sessionId, id, [], true);
      s.kitDay = day;
      if (gun && got.some((g) => g.id === "revolver")) s.issued = true;
      found(s, client.sessionId, id, got, left.length > 0);
      // (saved now: a restart mustn't hand out a second)
      void save(s);
      return;
    }
    // (the rest are all on the ground floor: the Grounds')
    if (p.level !== 0) return;
    if (id === "locker") {
      if (!near(p, LOCKER.x, LOCKER.z)) return;
      if (hasWeapon(s.inv, "revolver")) return found(s, client.sessionId, id, [], false, true);
      const gun: LootItem = { id: "revolver", n: 1, loaded: s.issued ? 0 : WEAPONS.revolver.mag };
      const { got } = take(s, [gun]);
      if (got.length) s.issued = true;
      return found(s, client.sessionId, id, got, !got.length);
    }
    // a cache in a day's nest: what's in it (or what's left), once
    if (id.startsWith("cache-")) {
      const w = room.state.caches.get(id);
      const cache = cacheOf(id);
      if (!w || !cache || !loot.cache) return;
      const b = toB(w.x, w.y);
      if (!near(p, b.x, b.z)) return;
      const { got, left } = take(s, loot.cache.left[id] ?? cache.items);
      loot.cache.left[id] = left;
      if (!left.length) room.state.caches.delete(id);
      lootDirty = true;
      return found(s, client.sessionId, id, got, left.length > 0);
    }
    const spot = lootSpot(id);
    if (!spot || !near(p, spot.x, spot.z)) return;
    newNight(now);
    loot.spots[id] ??= { until: 0 };
    const st = loot.spots[id];
    if (st.until > now) return found(s, client.sessionId, id, [], false, true);
    let items = st.left;
    if (!items) {
      const b = budgetLeft();
      const was = { ...b };
      items = rollLoot(spot.place, Math.random, b);
      loot.spent.r38 += was.r38 - b.r38;
      loot.spent.shell += was.shell - b.shell;
    }
    const { got, left } = take(s, items);
    if (left.length) st.left = left;
    else {
      const min = REFILL_MIN[spot.place] * (0.75 + Math.random() * 0.5);
      st.until = now + (FAST ? min * 100 : min * 60_000);
      st.left = undefined;
    }
    lootDirty = true;
    found(s, client.sessionId, id, got, left.length > 0);
  });
  room.on("dark:pick", (client, m) => {
    const r = ready(client);
    const d = room.state.drops.get(String(m?.id ?? ""));
    if (!r || !d || d.level !== r.p.level) return;
    if (Math.hypot(r.p.x - d.x, r.p.y - d.y, room.upOff(r.p, d, 0.3)) > LOOT_REACH) return;
    const item = d.item as ItemId;
    // (into the slot it was dragged to, if it was and it fits there: the inventory's)
    const slot = Number(m?.slot);
    const at = slotAt(r.s.inv, slot);
    const into =
      at !== undefined &&
      (isStack(item) || (isWeapon(item) && !hasWeapon(r.s.inv, item) && at === null && slot >= QUICK_SLOT));
    let got: LootItem[];
    let left: LootItem[];
    if (into) {
      const n = addItemTo(r.s.inv, slot, { id: item, n: d.n, loaded: d.loaded });
      const all = isWeapon(item) ? 1 : d.n;
      got = n ? [isWeapon(item) ? { id: item, n: 1, loaded: d.loaded } : { id: item, n }] : [];
      left = n < all ? [{ id: item, n: all - n, loaded: d.loaded }] : [];
    } else ({ got, left } = take(r.s, [{ id: item, n: d.n, loaded: d.loaded }]));
    if (!left.length) room.state.drops.delete(d.id);
    else {
      d.n = left[0].n;
      d.loaded = left[0].loaded ?? 0;
    }
    lootDirty = true;
    found(r.s, client.sessionId, d.id, got, left.length > 0);
  });
  // a drag in the inventory: any slot to any, a weapon only into a quick slot (shared moveSlot)
  room.on("dark:move", (client, m) => {
    const s = of(client.sessionId);
    if (s?.loaded && moveSlot(s.inv, Number(m?.from), Number(m?.to))) changed(s);
  });
  room.on("dark:use", (client, m) => {
    const s = of(client.sessionId);
    const slot = Number(m?.slot);
    if (!s?.loaded || !Number.isInteger(slot)) return;
    const used = consume(s.inv, slot, USABLE);
    if (used === "aid") s.v.hp = 100;
    if (used === "battery") s.v.bat = 100;
    if (used) changed(s);
  });
  // ── down, up, awake (D7) ─────────────────────────────────────────────────
  // down: crawling, bleeding out; the shadowed leave them alone (features/dark.ts: hp 0)
  function goDown(p: Player, s: Survivor) {
    s.v.hp = 0;
    p.hp = 0;
    p.downAt = Date.now();
    p.revBy = "";
    p.revAt = 0;
    p.gun = "";
    s.selfAt = 0;
    s.dirty = true;
  }
  function stopRevive(p: Player) {
    p.revBy = "";
    p.revAt = 0;
  }
  function getUp(p: Player, s: Survivor, hp: number) {
    p.downAt = 0;
    stopRevive(p);
    s.selfAt = 0;
    s.v.hp = hp;
    s.c.sinceHurt = 0;
    p.hp = vitalByte(hp);
    s.dirty = true;
  }
  // nobody came: at the office, 50 health, warm — what they carried, kept
  function awake(p: Player, s: Survivor) {
    getUp(p, s, DOWN.awakeHp);
    s.v.wm = 100;
    p.wm = 100;
    s.awayOut = 0;
    const c = clientOf(p.sid);
    if (c) {
      room.send(c, "dark:awake", {}); // (first: the move's snap that follows is no put-back)
      room.moveTo(c, p, room.arrivalFor(p));
    }
  }
  // someone holding to get them up: within reach, on their own feet
  room.on("dark:revive", (client, m) => {
    const me = room.state.players.get(client.sessionId);
    const p = room.state.players.get(String(m?.sid ?? ""));
    if (!me || !p || !p.downAt) return;
    if (!m?.on) {
      if (p.revBy === client.sessionId) stopRevive(p);
      return;
    }
    // (body to body: shared reach.ts — down on the ground, reached from beside them, not from above)
    if (me.downAt || me.level !== p.level || between(me, p) > DOWN.reach || p.revBy) return;
    p.revBy = client.sessionId;
    p.revAt = Date.now();
  });
  // their own first aid, down: 5 s held
  room.on("dark:selfaid", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const s = p && people.get(p.uid);
    if (!p || !s?.loaded || !p.downAt) return;
    s.selfAt = m?.on && count(s.inv, "aid") > 0 ? Date.now() : 0;
  });
  room.on("mod:down", (client) => {
    const p = room.state.players.get(client.sessionId);
    const s = p && people.get(p.uid);
    if (p?.admin && s && !p.downAt) goDown(p, s);
  });

  room.on("mod:refill", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const s = p && people.get(p.uid);
    if (!p?.admin || !s) return;
    Object.assign(s.v, FULL_VITALS);
    s.c.winded = false;
    s.windedAt = 0;
    if (p.downAt) getUp(p, s, 100); // (and up, if down)
    // (or set: health, warmth — to see the HUD at a level)
    const lvl = (x: unknown) => Math.max(1, Math.min(100, Number(x)));
    if (m?.hp !== undefined && Number.isFinite(Number(m.hp))) s.v.hp = lvl(m.hp);
    if (m?.wm !== undefined && Number.isFinite(Number(m.wm))) s.v.wm = lvl(m.wm);
    // `kit`: armed for trying the fight — both guns loaded (quick 1 and 2; what was there put
    // away), rounds, shells, flares, first aid, a battery
    if (m?.kit) {
      const was = s.inv.quick.filter((it): it is Stack => !!it && isStack(it.id));
      s.inv.quick = [
        { id: "revolver", loaded: WEAPONS.revolver.mag },
        { id: "shotgun", loaded: WEAPONS.shotgun.mag },
        null,
        null,
      ];
      for (const it of was) addStack(s.inv, it.id, it.n);
      for (const [id, n] of [
        ["r38", 24],
        ["shell", 12],
        ["flare", 3],
        ["aid", 1],
        ["battery", 1],
      ] as const)
        addStack(s.inv, id, n - count(s.inv, id));
    }
    changed(s);
  });
  room.on("dark:drop", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const s = p && people.get(p.uid);
    const slot = Number(m?.slot);
    // (onto the snow, or the floor they're on: anywhere, the office too)
    if (!p || !s?.loaded || !Number.isInteger(slot) || p.busy || p.downAt) return;
    const it = removeSlot(s.inv, slot);
    if (!it) return;
    putDrop(it.id, "n" in it ? it.n : 1, "loaded" in it ? it.loaded : 0, p.x, p.y, Date.now(), undefined, p.level);
    changed(s);
  });

  room.survival = {
    heal(sid) {
      const p = room.state.players.get(sid);
      const s = p && people.get(p.uid);
      if (!p || !s) return;
      Object.assign(s.v, FULL_VITALS);
      s.c.winded = false;
      s.windedAt = 0;
      if (p.downAt) getUp(p, s, 100);
      p.hp = vitalByte(s.v.hp);
      changed(s);
    },
    give(sid, item, n, drop) {
      const p = room.state.players.get(sid);
      const s = p && people.get(p.uid);
      if (!p || !s?.loaded || !(isStack(item) || isWeapon(item))) return false;
      const many = isWeapon(item) ? 1 : Math.max(1, Math.min(99, Math.floor(n) || 1));
      const loaded = isWeapon(item) ? WEAPONS[item].mag : 0;
      if (drop) {
        putDrop(item, many, loaded, p.x, p.y, Date.now(), undefined, p.level);
        return true;
      }
      const left = addItem(s.inv, { id: item, n: many, loaded });
      if (left === many) return false;
      changed(s);
      return true;
    },
    winded(sid) {
      const s = of(sid);
      return !!s && s.c.winded && s.windedAt > 0 && Date.now() - s.windedAt > WINDED_GRACE_MS;
    },
    roll(sid) {
      const p = room.state.players.get(sid);
      const s = p && people.get(p.uid);
      if (!p || !s) return true;
      // (a moment's grace, as for the sprint: the client's own stamina may be a message ahead)
      if (s.c.winded && Date.now() - s.windedAt <= WINDED_GRACE_MS) return true;
      const ok = spendRoll(s.v, s.c, onLand(p));
      if (s.c.winded && !s.windedAt) s.windedAt = Date.now();
      return ok;
    },
    hurt(sid, n) {
      const p = room.state.players.get(sid);
      const s = p && people.get(p.uid);
      // (an admin who's unhurt: nothing — docs/plan/48-the-admin.md)
      if (!p || !s || p.downAt || (p.admin && hasPower(p.powers, "unhurt"))) return;
      hurt(s.v, s.c, n);
      p.hp = vitalByte(s.v.hp);
      s.dirty = true;
      // (struck while getting someone up, or using first aid: that stops)
      for (const q of room.state.players.values()) if (q.revBy === sid) stopRevive(q);
      if (s.v.hp <= 0) goDown(p, s);
    },
    down(sid) {
      return !!room.state.players.get(sid)?.downAt;
    },
    inventory(sid) {
      const s = of(sid);
      return s?.loaded ? s.inv : null;
    },
    changed(sid) {
      const s = of(sid);
      if (s) changed(s);
    },
    breathless(sid) {
      const s = of(sid);
      if (!s || s.c.winded) return;
      s.c.winded = true;
      s.windedAt = Date.now();
    },
  } satisfies SurvivalHooks;

  // ── each tick ──────────────────────────────────────────────────────────────
  let sweptAt = 0;
  return {
    join(client, p) {
      hello.delete(client.sessionId);
      let s = people.get(p.uid);
      if (!s) {
        s = {
          uid: p.uid,
          bot: p.bot,
          v: { ...FULL_VITALS },
          c: freshClock(),
          inv: emptyInventory(),
          issued: false,
          kitDay: -1,
          loaded: p.bot,
          dirty: false,
          savedAt: Date.now(),
          windedAt: 0,
          trail: [],
          selfAt: 0,
          awayOut: 0,
          fastSince: 0,
          batSent: -1,
          batAt: 0,
          out: false,
        };
        people.set(p.uid, s);
        const me = s;
        if (!p.bot) {
          if (config.offline) adopt(me, offlineSurvivors.get(p.uid) ?? null);
          else
            void api
              .survivor(p.uid)
              .then((r) => people.get(p.uid) === me && adopt(me, r.survivor))
              .catch((e) => {
                // (no record to be had: carry on with nothing, but don't overwrite what's saved)
                console.warn("[survival] load", (e as Error).message);
              });
        }
      }
      p.hp = vitalByte(s.v.hp);
      p.st = vitalByte(s.v.st);
      p.wm = vitalByte(s.v.wm);
    },
    back(client) {
      hello.delete(client.sessionId);
    },
    leave(client, p) {
      hello.delete(client.sessionId);
      const s = people.get(p.uid);
      if (!s) return;
      // (another tab of theirs still here: keep it)
      if ([...room.state.players.values()].some((q) => q.uid === p.uid && q.sid !== p.sid)) return;
      void save(s);
      people.delete(p.uid);
    },
    tick(dt, now) {
      const g = ground();
      const hour = room.state.hour;
      const night = nightness(hour);
      const dark = blackoutAt(now, hour);
      // one body a person: another tab of theirs, or the one kept for a reconnection, shares
      // their vitals — settled once a tick, through the newest, the rest shown the same
      const newest = new Map<number, Player>();
      for (const p of room.state.players.values()) newest.set(p.uid, p);
      for (const p of room.state.players.values()) {
        const s = people.get(p.uid);
        if (!s) continue;
        if (newest.get(p.uid) !== p) {
          p.hp = vitalByte(s.v.hp);
          p.st = vitalByte(s.v.st);
          p.wm = vitalByte(s.v.wm);
          p.focused = false;
          continue;
        }
        // (at nothing and not down — however it came about: down)
        if (!p.downAt && s.loaded && s.v.hp <= 0) goDown(p, s);
        // down: someone getting them up (it holds the bleeding), their own first aid, else bleeding out
        if (p.downAt) {
          const by = p.revBy ? room.state.players.get(p.revBy) : undefined;
          if (p.revBy && (!by || by.downAt || by.level !== p.level || between(by, p) > DOWN.reach + 0.3)) stopRevive(p);
          if (p.revBy) p.downAt += dt * 1000;
          if (p.revBy && now - p.revAt >= REVIVE_MS) getUp(p, s, DOWN.upHp);
          else if (s.selfAt && now - s.selfAt >= SELF_MS) {
            if (takeStack(s.inv, "aid", 1)) {
              getUp(p, s, 100);
              changed(s);
            } else s.selfAt = 0;
          } else if (!p.revBy && now - p.downAt >= BLEED_MS) awake(p, s);
        }
        const riding = p.busy.startsWith("ride:") || p.busy.startsWith("drive:");
        const land = !riding && onLand(p);
        // the speed it really went over the last quarter second (a teleport, a floor change: forgotten)
        const tr = s.trail;
        tr.push({ t: now, x: p.x, y: p.y });
        while (tr.length > 2 && now - tr[1].t >= 250) tr.shift();
        const span = (now - tr[0].t) / 1000;
        const dist = Math.hypot(p.x - tr[0].x, p.y - tr[0].y);
        if (dist > 4 || p.level !== 0) tr.splice(0, tr.length - 1);
        const verb =
          p.jump !== "" && now - p.jumpAt < 1500 && p.jump !== "hop" && p.jump !== "flip" && p.jump !== "leap";
        // (a second of it: a sprint's momentum on the ice after letting go isn't a sprint)
        const fast = span >= 0.2 && dist / span > SPRINT_SEEN && !verb;
        s.fastSince = fast ? s.fastSince || now : 0;
        const sprinting = land && ((p.mv & 7) === SPRINT || (s.fastSince > 0 && now - s.fastSince > 1000));
        const b = toB(p.x, p.y);
        const onLot = !land && p.level === 0 && !!g && tileAt(g, Math.floor(p.x), Math.floor(p.y)) === "a";
        const warm =
          riding || (!land && !onLot) || inside(b.x, b.z) || (land && !dark && night > 0.3 && inLampPool(b.x, b.z));
        const was = s.c.winded;
        const before = { hp: s.v.hp, wm: s.v.wm, bat: s.v.bat };
        // the torch focused: on, aiming (shared/move's mv bit), on foot (the land or indoors), battery
        // left (and not run out and still coming back)
        const focus = !riding && p.torch && (p.mv & MV_AIM) !== 0 && canFocus(s.v, s.c);
        stepVitals(s.v, s.c, { sprinting, outside: land, night, storm: room.state.storm, warm, focus }, dt);
        p.focused = focus && s.v.bat > 0;
        if (s.c.winded && !was) s.windedAt = now;
        if (!s.c.winded) s.windedAt = 0;
        p.hp = vitalByte(s.v.hp);
        p.st = vitalByte(s.v.st);
        p.wm = vitalByte(s.v.wm);
        if (!s.bot && (before.hp !== s.v.hp || before.wm !== s.v.wm || before.bat !== s.v.bat)) s.dirty = true;
        // (the battery is mine only: told when it moves a whole percent, twice a second at most)
        if (Math.round(s.v.bat) !== s.batSent && now - s.batAt >= 500) {
          s.batAt = now;
          sendPockets(s);
        }
        // away out on the land at night: down (the shadowed leave the away alone; this doesn't)
        if (land && !p.downAt && p.status === "away" && night >= 0.5 && !s.bot && !room.dark?.peaceful) {
          s.awayOut += dt;
          if (s.awayOut >= (FAST_DOWN ? 1 : DOWN.awayOut)) goDown(p, s);
        } else s.awayOut = 0;
        // (out tonight: the ammo's budget grows by a person)
        // (out today: more of the day's nests, and their caches)
        if (land && !s.bot && loot.cache && !loot.cache.out.includes(s.uid)) {
          loot.cache.out.push(s.uid);
          lootDirty = true;
        }
        if (land && !s.bot && !s.out) {
          newNight(now);
          s.out = true;
          if (!loot.people.includes(s.uid)) {
            loot.people.push(s.uid);
            lootDirty = true;
          }
        }
        if (s.dirty && now - s.savedAt > SAVE_MS) void save(s, now);
      }
      // twice a minute: old drops gone, a new night's people counted afresh, the loot saved
      if (now - sweptAt > 5000) {
        sweptAt = now;
        for (const d of [...room.state.drops.values()])
          if (now - d.at > DROP_MS) {
            room.state.drops.delete(d.id);
            lootDirty = true;
          }
        if (nightOf(now) !== loot.night) {
          newNight(now);
          for (const s of people.values()) s.out = false;
        }
        cachesTick(now);
        if (lootDirty && now - lootSavedAt > SAVE_MS) saveLoot(now);
      }
    },
    dispose() {
      for (const s of people.values()) if (s.dirty) void save(s);
      if (lootDirty) saveLoot();
      room.survival = null;
    },
  };
});

function cleanItems(xs: unknown[]): LootItem[] {
  const out: LootItem[] = [];
  for (const x of xs) {
    const o = x as Record<string, unknown>;
    if (isWeapon(o?.id)) out.push({ id: o.id, n: 1, loaded: Math.max(0, Number(o.loaded) | 0) });
    else if (isStack(o?.id) && Number(o.n) > 0) out.push({ id: o.id, n: Number(o.n) | 0 });
  }
  return out;
}
