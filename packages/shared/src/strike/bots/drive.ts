// The bots of a match, driven (docs/plan/117-bot-brains.md, phase 0, F10a): one driver for the server's match and
// the lab's — the map's knowledge (worked out a little a tick till it's there), what each bot hears, each side's
// brain twice a second, each bot's step, the radio. It knows the world only through `BotEnv`: where the people are,
// the smokes and flashes, and where its shots, grenades and words go.

import type { GunId } from "../../dark/arms.ts";
import { nodeNear, nodePos } from "../grid.ts";
import type { Team } from "../map.ts";
import {
  carryTick,
  grabHostage,
  holdTick,
  type Match,
  type MatchEvent,
  type MPlayer,
  pickCharge,
  teamOf,
} from "../match.ts";
import type { Nade, NadeKind } from "../nades.ts";
import { MAG, newAim, type Shot } from "./aim.ts";
import { type Out, stepBot, type Who, type World } from "./brain.ts";
import { type Know, knowPump, placeAt } from "./know.ts";
import { type BotLevel, LEVELS } from "./level.ts";
import { type Call, lineOf, Radio } from "./radio.ts";
import { type Contact, newPic, type Pic, picCall, picGone, picStep, REACH, type SoundKind } from "./senses.ts";
import { type BotState, newBotState } from "./state.ts";
import { aims, newReads, type Reads, Side, type SideCtx, sideBuys } from "./team.ts";
import { newFeet } from "./walk.ts";

/** What the driver needs of the world around the match. */
export interface BotEnv {
  rand(): number;
  /** a bot's level */
  level(id: string): BotLevel;
  /** a member who isn't one of these bots (a person): where they stand (local metres), crouched */
  other(id: string): { x: number; y: number; z: number; crouch: boolean } | null;
  /** the smokes standing */
  smokes(): Nade[];
  /** blinded till (match seconds) */
  blindTo(id: string): number;
  /** a bot's shot (a pellet that met nobody too: its tracer) */
  shot(by: string, s: Shot): void;
  /** a bot's grenade thrown */
  nade(by: string, kind: NadeKind, eye: [number, number, number], yaw: number, pitch: number, short: boolean): void;
  /** (plan 119) a bot's knife swung (the right's stab: `heavy`) — where it faces */
  stab?(by: string, heavy: boolean): void;
  /** a bot's words on its side's radio */
  say(by: string, text: string, team: Team): void;
  /** how much time the knowledge may take this tick (ms; the server's small, the lab's all) */
  budget(): number;
}

/** What the world draws of a bot. */
export interface BotView {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  crouch: boolean;
  /** its gun up: on someone, or holding a spot */
  aiming: boolean;
  using: boolean;
  /** who it's on ("" nobody) */
  on: string;
  vx: number;
  vz: number;
}

export class Bots {
  readonly bots = new Map<string, BotState>();
  k: Know | null = null;
  readonly sides: Record<Team, Side> = { r: new Side("r"), w: new Side("w") };
  readonly radios: Record<Team, Radio> = { r: new Radio(), w: new Radio() };
  pics: Record<Team, Pic> | null = null;
  readonly reads: Reads = newReads();
  liveAt = -1;
  private sideAt = 0;
  private fell: Record<Team, World["fell"]> = { r: null, w: null };
  private sounds: { kind: SoundKind; by: string; x: number; y: number; z: number }[] = [];
  private people = new Map<
    string,
    { x: number; y: number; z: number; vx: number; vz: number; at: number; stepAt: number }
  >();
  private plants = new Map<string, [number, number]>();
  /** the lab's: each bot's step time (ms, eased) */
  stepMs = 0;

  constructor(
    readonly m: Match,
    readonly env: BotEnv,
  ) {}

  // ── who's in ──
  add(id: string) {
    if (this.bots.has(id)) return;
    const [x, z] = this.m.map.spawns.r[0];
    this.bots.set(id, newBotState(id, this.env.level(id), newFeet(x, 0, z), newAim()));
  }
  remove(id: string) {
    this.bots.delete(id);
  }
  /** A bot put at its spawn (a round's start, a respawn). */
  place(id: string, x: number, y: number, z: number) {
    const b = this.bots.get(id);
    if (!b) return;
    const p = this.m.players.get(id);
    Object.assign(b.feet, { x, y, z, gy: y, vx: 0, vz: 0, path: [], pi: 0, wp: -1, to: -1, stuck: 0 });
    b.aim = newAim(this.faceIn(x, z));
    b.mem.clear();
    b.order = null;
    b.fighting = "";
    b.look = null;
    b.lookIdx = -1;
    b.checked.clear();
    b.throwing = null;
    b.using = false;
    b.saidHit = b.saidPlant = b.saidDefuse = false;
    b.tradeOf = b.tradeTo = -1;
    b.routeOf = null;
    b.postSpot = null;
    b.postOf = null;
    b.huntTo = 0;
    b.hp = p?.hp ?? 100;
    b.level = this.env.level(id);
    const gun = (p?.primary ?? p?.pistol ?? null) as GunId | null;
    b.gun = gun;
    b.loaded = gun ? MAG[gun] : 0;
    b.reloading = false;
    b.reloadTo = 0;
  }
  /** Facing into the map from a spawn (toward the objectives). */
  private faceIn(x: number, z: number): number {
    const S = this.m.map.size;
    return Math.atan2((S.z0 + S.z1) / 2 - z, (S.x0 + S.x1) / 2 - x);
  }
  view(id: string): BotView | null {
    const b = this.bots.get(id);
    if (!b) return null;
    return {
      x: b.feet.x,
      y: b.feet.y,
      z: b.feet.z,
      yaw: b.aim.yaw,
      pitch: b.aim.pitch,
      crouch: b.crouch,
      aiming: !!b.fighting || b.holdStill,
      using: b.using,
      on: b.fighting,
      vx: b.feet.vx,
      vz: b.feet.vz,
    };
  }

  // ── what happens ──
  /** A shot heard (a person's: the server tells it) at (x, z). */
  heard(by: string, x: number, y: number, z: number, kind: SoundKind = "shot") {
    this.sounds.push({ kind, by, x, y, z });
  }
  /** Someone hurt by someone: a bot turns to where it came from. */
  hurt(victim: string, by: string) {
    const b = this.bots.get(victim);
    if (!b) return;
    const at = this.where(by);
    b.hurtAt = this.m.clock;
    if (at) b.mem.set(by, { id: by, x: at.x, y: at.y, z: at.z, at: this.t(), seen: false });
  }
  /** A person's radio command (the menu's index). */
  command(by: string, i: number) {
    const p = this.m.players.get(by);
    if (!p || !this.k || !this.pics) return;
    const team = teamOf(this.m, p);
    const who = this.sides[team].command(this.ctx(team), by, i);
    if (who) this.ask(who, team, { k: i === 4 || i === 5 ? "roger" : "roger" });
  }
  /** The match's events. */
  event(e: MatchEvent) {
    const m = this.m;
    if (e.e === "round") {
      this.liveAt = -1;
      for (const t of ["r", "w"] as Team[]) {
        this.sides[t].newRound();
        this.radios[t].round([...m.players.values()].filter((q) => teamOf(m, q) === t).length);
        this.fell[t] = null;
      }
      if (this.k) this.pics = { r: newPic(this.k, "r"), w: newPic(this.k, "w") };
      this.people.clear();
      return;
    }
    if (e.e === "kill") {
      const v = m.players.get(e.victim);
      const by = m.players.get(e.by);
      if (!v) return;
      const vt = teamOf(m, v);
      const at = this.where(e.victim);
      const kat = this.where(e.by);
      if (at) this.fell[vt] = { x: at.x, z: at.z, at: this.t(), kx: kat?.x, kz: kat?.z };
      if (this.pics) picGone(this.pics[vt === "r" ? "w" : "r"], e.victim);
      // (the attackers' losses going for their objective: the reads)
      const goal = this.sides[vt].goal;
      if (goal && this.k && aims(this.k, vt).attack.length) this.reads.lost[goal] = (this.reads.lost[goal] ?? 0) + 1;
      // the killer's side: "Enemy down", how many left; the last one where it is
      if (by && this.bots.has(e.by) && teamOf(m, by) !== vt) {
        const kt = teamOf(m, by);
        const left = [...m.players.values()].filter((q) => q.alive && teamOf(m, q) === vt).length;
        // (a big side — Casual's ten — counts the last few down, not every one: ten "Enemy down"s a round is noise)
        const size = [...m.players.values()].filter((q) => teamOf(m, q) === vt).length;
        if (left > 0) {
          if (size <= 5 || left <= 3) this.ask(e.by, kt, { k: "down", left });
          if (left === 1 && this.k && this.pics) {
            const last = [...m.players.values()].find((q) => q.alive && teamOf(m, q) === vt);
            const c = last && this.pics[kt].known.get(last.id);
            if (c && this.t() - c.at < 8) this.ask(e.by, kt, { k: "last", area: placeAt(this.k, c.x, c.z, c.y) });
          }
        }
      }
      return;
    }
    if (e.e === "planted") {
      const p = m.players.get(e.by);
      if (p) this.ask(e.by, teamOf(m, p), { k: "planted", site: e.site });
      return;
    }
    if (e.e === "win") {
      const s = this.sides[e.team];
      if (this.k && s.goal && aims(this.k, e.team).attack.length) this.reads.won.push({ play: s.play, goal: s.goal });
    }
  }

  /** The round's buys (each side's, together). */
  buys() {
    const m = this.m;
    for (const t of ["r", "w"] as Team[]) {
      const mates = [...m.players.values()].filter((p) => teamOf(m, p) === t);
      sideBuys(m, t, mates, LEVELS[this.levelOf(t)], this.sides[t], this.env.rand);
    }
    for (const [id, b] of this.bots) {
      const p = m.players.get(id);
      const gun = (p?.primary ?? p?.pistol ?? null) as GunId | null;
      if (gun !== b.gun) {
        b.gun = gun;
        b.loaded = gun ? MAG[gun] : 0;
      }
    }
  }

  // ── the step ──
  /** s since the round went live (0 before). */
  t(): number {
    return this.liveAt < 0 ? 0 : this.m.clock - this.liveAt;
  }
  private where(id: string): { x: number; y: number; z: number } | null {
    const b = this.bots.get(id);
    if (b) return { x: b.feet.x, y: b.feet.y, z: b.feet.z };
    return this.env.other(id);
  }
  private ask(by: string, team: Team, c: Call, contacts?: Contact[]) {
    // (the respawn modes: everyone for themselves — no side to talk to)
    if (!this.m.mode.rounds) return;
    const ok = this.radios[team].ask(by, c, this.m.clock);
    // (what's said, the side knows)
    if (ok && contacts && this.pics && this.k)
      for (const q of contacts)
        picCall(this.pics[team], this.k, q, this.k.areaOf[nodeNear(this.k.g, q.x, q.z, q.y)] ?? -1);
  }
  /** A side's level: its bots' (the first one's). */
  private levelOf(team: Team): BotLevel {
    for (const b of this.bots.values()) {
      const p = this.m.players.get(b.id);
      if (p && teamOf(this.m, p) === team) return b.level;
    }
    return "normal";
  }
  private ctx(team: Team): SideCtx {
    const m = this.m;
    const k = this.k as Know;
    const mates: SideCtx["mates"] = [];
    let foes = 0;
    for (const p of m.players.values()) {
      if (teamOf(m, p) !== team) {
        if (p.alive) foes++;
        continue;
      }
      const at = this.where(p.id);
      mates.push({
        id: p.id,
        bot: p.bot && this.bots.has(p.id),
        alive: p.alive,
        x: at?.x ?? 0,
        y: at?.y ?? 0,
        z: at?.z ?? 0,
        p,
      });
    }
    return {
      k,
      m,
      team,
      t: this.t(),
      L: LEVELS[this.levelOf(team)],
      rand: this.env.rand,
      mates,
      foes,
      pic: (this.pics as Record<Team, Pic>)[team],
      reads: this.reads,
      say: (by, c) => this.ask(by, team, c),
    };
  }

  /** One step of every bot (`dt` s), the match's clock as the time. */
  step(dt: number) {
    const m = this.m;
    if (!this.k) {
      this.k = knowPump(m.map, this.env.budget());
      if (!this.k) return;
      this.pics = { r: newPic(this.k, "r"), w: newPic(this.k, "w") };
    }
    const k = this.k;
    const pics = this.pics as Record<Team, Pic>;
    const now = m.clock;
    const live = m.phase === "live" || m.phase === "planted";
    if (!live) return;
    if (this.liveAt < 0) {
      this.liveAt = now;
      for (const t of ["r", "w"] as Team[]) this.sides[t].live(this.ctx(t));
      this.sideAt = now;
    }
    const t = this.t();
    // the people: how they move, their steps heard
    for (const p of m.players.values()) {
      if (this.bots.has(p.id) || !p.alive) continue;
      const at = this.env.other(p.id);
      if (!at) continue;
      const was = this.people.get(p.id);
      const ddt = was ? Math.max(1e-3, now - was.at) : 1;
      const vx = was ? (at.x - was.x) / ddt : 0;
      const vz = was ? (at.z - was.z) / ddt : 0;
      const rec = { x: at.x, y: at.y, z: at.z, vx, vz, at: now, stepAt: was?.stepAt ?? 0 };
      if (Math.hypot(vx, vz) > 4 && !at.crouch && now >= rec.stepAt) {
        rec.stepAt = now + 0.34;
        this.sounds.push({ kind: "step", by: p.id, x: at.x, y: at.y, z: at.z });
      }
      this.people.set(p.id, rec);
    }
    // each side's brain, twice a second (and its picture)
    if (now - this.sideAt >= 0.5) {
      this.sideAt = now;
      for (const team of ["r", "w"] as Team[]) {
        picStep(pics[team], k, t);
        this.sides[team].step(this.ctx(team));
      }
    }
    // hearing: last step's sounds, by each bot of the other side in reach
    const sounds = this.sounds;
    this.sounds = [];
    for (const s of sounds) {
      const sp = m.players.get(s.by);
      if (!sp) continue;
      const st = teamOf(m, sp);
      for (const b of this.bots.values()) {
        const bp = m.players.get(b.id);
        if (!bp?.alive || teamOf(m, bp) === st) continue;
        const d = Math.hypot(s.x - b.feet.x, s.z - b.feet.z);
        if (d > REACH[s.kind] * LEVELS[b.level].hear) continue;
        const fuzz = d * 0.08;
        const r = this.env.rand;
        b.mem.set(s.by, {
          id: s.by,
          x: s.x + (r() - 0.5) * fuzz,
          y: s.y,
          z: s.z + (r() - 0.5) * fuzz,
          at: t,
          seen: false,
        });
      }
    }
    // the bodies each bot sees and shoots at
    const bodies: (Who & { team: Team })[] = [];
    for (const p of m.players.values()) {
      if (!p.alive) continue;
      const b = this.bots.get(p.id);
      const team = teamOf(m, p);
      if (b)
        bodies.push({
          id: p.id,
          x: b.feet.x,
          y: b.feet.y,
          z: b.feet.z,
          h: b.crouch ? 1.25 : 1.8,
          vx: b.feet.vx,
          vz: b.feet.vz,
          bot: true,
          crouch: b.crouch,
          team,
        });
      else {
        const q = this.people.get(p.id);
        const at = this.env.other(p.id);
        if (!at) continue;
        bodies.push({
          id: p.id,
          x: at.x,
          y: at.y,
          z: at.z,
          h: at.crouch ? 1.25 : 1.8,
          vx: q?.vx ?? 0,
          vz: q?.vz ?? 0,
          bot: false,
          crouch: at.crouch,
          team,
        });
      }
    }
    const smokes = this.env.smokes();
    const t0 = performance.now();
    // (every bot's shots this step land after they've all stepped: none's quicker for being first in the list)
    const fired: [string, Shot][] = [];
    for (const b of this.bots.values()) {
      const me = m.players.get(b.id);
      if (!me?.alive) continue;
      const team = teamOf(m, me);
      const side = this.sides[team];
      const o = side.orders.get(b.id) ?? null;
      if (o !== b.order) {
        b.order = o;
        b.routeOf = null;
        b.postSpot = null;
      }
      b.blindTo = this.env.blindTo(b.id);
      const w: World = {
        k,
        m,
        L: LEVELS[b.level],
        t,
        now,
        dt,
        rand: this.env.rand,
        me,
        team,
        enemies: bodies.filter((q) => q.team !== team),
        mates: bodies.filter((q) => q.team === team && q.id !== b.id),
        smokes,
        pic: pics[team],
        side,
        fell: this.fell[team],
        plantSpot: (site) => this.plantSpot(site),
      };
      const out: Out = { shots: [], throws: [], calls: [], use: false, pickup: false, grab: -1, step: false, stab: 0 };
      stepBot(b, w, out);
      for (const s of out.shots) fired.push([b.id, s]);
      if (out.shots.length) this.sounds.push({ kind: "shot", by: b.id, x: b.feet.x, y: b.feet.y, z: b.feet.z });
      for (const n of out.throws)
        this.env.nade(
          b.id,
          n.kind === "molotov" && team === "w" ? "incendiary" : n.kind,
          n.eye,
          n.yaw,
          n.pitch,
          n.short,
        );
      for (const c of out.calls) this.ask(b.id, team, c.c, c.contacts);
      if (out.stab) this.env.stab?.(b.id, out.stab === 2);
      if (out.step) this.sounds.push({ kind: "step", by: b.id, x: b.feet.x, y: b.feet.y, z: b.feet.z });
      // the hands
      const at: [number, number] = [b.feet.x, b.feet.z];
      if (team === "r" && me.bomb) holdTick(m, b.id, out.use, at, dt);
      if (team === "w" && (out.use || m.charge?.defuser === b.id)) holdTick(m, b.id, out.use, at, dt);
      if (out.use && m.charge?.state === "planting")
        this.sounds.push({ kind: "plant", by: b.id, x: b.feet.x, y: b.feet.y, z: b.feet.z });
      if (out.use && m.charge?.defuser === b.id)
        this.sounds.push({ kind: "defuse", by: b.id, x: b.feet.x, y: b.feet.y, z: b.feet.z });
      if (out.pickup) pickCharge(m, b.id);
      if (out.grab >= 0) grabHostage(m, b.id, out.grab);
      if (me.carry >= 0) carryTick(m, b.id, at);
      if (m.charge?.state === "carried" && me.bomb) [m.charge.x, m.charge.z] = at;
    }
    for (const [by, s] of fired) if (m.players.get(by)?.alive || s.victim) this.env.shot(by, s);
    this.stepMs = this.stepMs * 0.95 + (performance.now() - t0) * 0.05;
    // the radio: a line a side at most, said
    for (const team of ["r", "w"] as Team[]) {
      const line = this.radios[team].step(now, (id) => !!m.players.get(id)?.alive);
      if (line) this.env.say(line.by, line.text, team);
    }
  }

  /** The best spot to plant at a site (a covered corner: shared with the server's old one). */
  private plantSpot(site: "A" | "B"): [number, number] {
    const had = this.plants.get(site);
    if (had) return had;
    const k = this.k as Know;
    const r = this.m.map.sites?.[site];
    if (!r) return [0, 0];
    // (of the post spots' middle and the site's, the node in the site nearest the spots' middle — the plant where
    // the post-plant holds can see it)
    const ps = k.spots.filter((s) => s.to === site && s.kind === "post");
    const cx = ps.length ? ps.reduce((s, q) => s + q.x, 0) / ps.length : (r.x0 + r.x1) / 2;
    const cz = ps.length ? ps.reduce((s, q) => s + q.z, 0) / ps.length : (r.z0 + r.z1) / 2;
    const x = Math.max(r.x0 + 1, Math.min(r.x1 - 1, cx));
    const z = Math.max(r.z0 + 1, Math.min(r.z1 - 1, cz));
    const n = nodeNear(k.g, x, z);
    const at: [number, number] = n >= 0 ? [nodePos(k.g, n)[0], nodePos(k.g, n)[2]] : [x, z];
    this.plants.set(site, at);
    return at;
  }
  /** The radio's words of a call (the lab's log). */
  static words(c: Call) {
    return lineOf(c);
  }
}
export type { MPlayer };
