// A side's brain (docs/plan/117-bot-brains.md, phases 8–11, F3a; Killzone 2's commander over its bots): the round's
// plan from a CS playbook, roles, a spot or a lane for each bot (never two on one: the bunching gone by
// construction), stages and their release, rotations on what was called, the retake together, saves, the post-plant,
// the hostages carried and escorted, the side's economy, reads from earlier rounds, and your radio commands.
//
// The Raiders' plays (bomb maps): rush (one lane, fast), split (two lanes, staged, in together), default (spread for
// map control, then a late call on the weaker site), fake (two make noise at one site, the rest hit the other), lurk
// (one alone on the far side, the rest hit). The Wardens' setups: anchors and a rotator over both sites, a stack
// where they were hit before (reads), an aggressive early peek for information. The hostage maps the other way round:
// the Wardens attack the hostages' room, the Raiders hold it.

import { nodeAt, nodeNear, nodePos } from "../grid.ts";
import { shotThrough, type Team } from "../map.ts";
import { buy, type Match, type MPlayer, teamOf } from "../match.ts";
import { type ItemId, lossBonus, ROUND, shopItem } from "../rules.ts";
import { clear, type Goal, type Know, type Lineup, type Route, routesTo, type Spot } from "./know.ts";
import type { LevelSpec } from "./level.ts";
import type { Call } from "./radio.ts";
import type { Pic } from "./senses.ts";
import type { Order, Role } from "./state.ts";

export interface Mate {
  id: string;
  bot: boolean;
  alive: boolean;
  x: number;
  y: number;
  z: number;
  p: MPlayer;
}
export interface SideCtx {
  k: Know;
  m: Match;
  team: Team;
  /** s since the round went live */
  t: number;
  L: LevelSpec;
  rand: () => number;
  mates: Mate[];
  /** enemies alive */
  foes: number;
  pic: Pic;
  reads: Reads;
  say: (by: string, c: Call) => void;
}
/** What the bots remember of earlier rounds (the match's). */
export interface Reads {
  /** the objective the attackers went for, each round */
  hits: Goal[];
  /** attackers who died going for each objective */
  lost: Partial<Record<Goal, number>>;
  /** the attackers' plays that won, and where */
  won: { play: string; goal: Goal }[];
}
export const newReads = (): Reads => ({ hits: [], lost: {}, won: [] });

const other = (t: Team): Team => (t === "r" ? "w" : "r");
const RUN = 5.6;

/** The objectives a side attacks and defends on this map. */
export function aims(k: Know, team: Team): { attack: Goal[]; defend: Goal[] } {
  const attack: Goal[] = [];
  const defend: Goal[] = [];
  for (const g of ["A", "B", "H"] as Goal[]) {
    const holder = k.holds[g];
    if (!holder) continue;
    if (holder === team) defend.push(g);
    else attack.push(g);
  }
  return { attack, defend };
}

/** The node `back` m before a route reaches its entrance (where a group stages). */
export function stageOf(k: Know, route: Route, back: number): number {
  // (never where the holders see it: the unseen metre of the lane nearest the one wanted, further back first)
  const want = Math.round(back);
  for (let d = 0; d <= 40; d++) {
    const further = want + d;
    const nearer = want - d;
    if (further <= 70 && !route.seen[further]) {
      back = further;
      break;
    }
    if (nearer >= 8 && !route.seen[nearer]) {
      back = nearer;
      break;
    }
  }
  const ri = k.routes.indexOf(route);
  const e = k.entrances.find((q) => q.routes.includes(ri));
  const ns = route.nodes;
  const end = e ? ns.indexOf(e.node) : ns.length - 1;
  let i = end;
  let L = 0;
  while (i > 0 && L < back) {
    const a = nodePos(k.g, ns[i]);
    const b = nodePos(k.g, ns[i - 1]);
    L += Math.hypot(a[0] - b[0], a[2] - b[2]);
    i--;
  }
  return ns[Math.max(0, i)];
}
/** The node a share of the way along a route. */
export function along(route: Route, share: number): number {
  return route.nodes[Math.min(route.nodes.length - 1, Math.max(0, Math.floor(route.nodes.length * share)))];
}
const pos = (k: Know, n: number) => nodePos(k.g, n);

/** The lineups a side throws on a route's way in, by the level's utility. */
function throwsOn(k: Know, route: Route, team: Team, L: LevelSpec): Lineup[] {
  if (!L.utility) return [];
  const ri = k.routes.indexOf(route);
  const doors = k.entrances.map((e, i) => ({ e, i })).filter(({ e }) => e.routes.includes(ri));
  const kinds: Lineup["kind"][] =
    L.utility === 1 ? ["smoke"] : L.utility === 2 ? ["smoke", "flash"] : ["smoke", "flash", "molotov", "he"];
  return k.lineups.filter((l) => l.team === team && doors.some((d) => d.i === l.door) && kinds.includes(l.kind));
}

/** Spots for `n` bots at an objective: the best of each entrance in turn, apart, none taken. */
export function pickSpots(
  k: Know,
  team: Team,
  goal: Goal,
  n: number,
  taken: Spot[],
  kinds: Spot["kind"][],
  sniper = false,
): Spot[] {
  const all = k.spots.filter((s) => s.team === team && s.to === goal && kinds.includes(s.kind));
  const doors = [...new Set(all.map((s) => s.door))];
  const out: Spot[] = [];
  const free = (s: Spot) => ![...taken, ...out].some((q) => q === s || Math.hypot(q.x - s.x, q.z - s.z) < 4);
  if (sniper) {
    const s = all.filter((q) => q.kind === "sniper" && free(q)).sort((a, b) => b.d - a.d)[0];
    if (s) out.push(s);
  }
  for (let round = 0; out.length < n && round < 6; round++)
    for (const d of doors) {
      if (out.length >= n) break;
      const s = all.filter((q) => q.door === d && free(q)).sort((a, b) => b.score - a.score)[0];
      if (s) out.push(s);
    }
  return out;
}

/** A side's brain for one match. */
export class Side {
  play = "";
  goal: Goal | null = null;
  orders = new Map<string, Order>();
  /** the stage's release: who's in which group, released yet, by when at the latest (s) */
  released = true;
  releaseBy = 0;
  /** default: its map control held till */
  controlTo = 0;
  /** fake: the other objective, its noise made at */
  fakeGoal: Goal | null = null;
  fakeAt = 0;
  posted: Goal | null = null;
  retake: { stage: Map<string, number>; go: boolean } | null = null;
  saving = false;
  rotateAt = -99;
  late = false;
  lurker = "";
  /** the eco / force / full decided at the buy */
  buyKind: "pistol" | "eco" | "force" | "full" = "full";
  carriedSeen = false;
  constructor(readonly team: Team) {}

  newRound() {
    this.play = "";
    this.goal = null;
    this.orders.clear();
    this.released = true;
    this.releaseBy = 0;
    this.controlTo = 0;
    this.fakeGoal = null;
    this.fakeAt = 0;
    this.posted = null;
    this.retake = null;
    this.saving = false;
    this.rotateAt = -99;
    this.late = false;
    this.lurker = "";
    this.carriedSeen = false;
  }

  private bots(c: SideCtx) {
    return c.mates.filter((q) => q.bot && q.alive);
  }
  private set(id: string, o: Order) {
    this.orders.set(id, o);
  }

  /** The round's live: the plan picked and handed out. */
  live(c: SideCtx) {
    const bots = this.bots(c);
    if (!bots.length) return;
    if (!c.m.mode.rounds || (!c.k.goals.A && !c.k.goals.H)) {
      this.play = "hunt";
      for (const b of bots) this.set(b.id, { kind: "hunt", role: "free", why: "hunt" });
      return;
    }
    const { attack, defend } = aims(c.k, this.team);
    if (attack.length) this.attack(c, attack);
    else if (defend.length) this.defend(c, defend);
  }

  // ── attacking: the plays ──
  private attack(c: SideCtx, goals: Goal[]) {
    const bots = this.bots(c);
    const n = bots.length;
    // where: the reads (an objective that cost them less, a play that won there) and a little chance
    const w = goals.map((g) => {
      let v = 1;
      if (c.L.reads) {
        v /= 1 + (c.reads.lost[g] ?? 0) * 0.15;
        if (c.reads.won.slice(-3).some((x) => x.goal === g)) v *= 1.4;
      }
      return v;
    });
    let r = c.rand() * w.reduce((a, b) => a + b, 0);
    let goal = goals[0];
    for (let i = 0; i < goals.length; i++) {
      r -= w[i];
      if (r <= 0) {
        goal = goals[i];
        break;
      }
    }
    this.goal = goal;
    const routes = routesTo(c.k, this.team, goal);
    if (!routes.length) return;
    const two = goals.length > 1;
    // the play
    const allowed = c.L.plays.filter((p) => {
      if (this.buyKind === "eco" || this.buyKind === "pistol") return p === "rush" || (p === "split" && n >= 3);
      if (p === "split") return routes.length > 1 && n >= 2;
      if (p === "default") return n >= 3 && two;
      if (p === "fake" || p === "lurk") return n >= 4 && two;
      return true;
    });
    const weights: Record<string, number> = { rush: 0.25, split: 0.3, default: 0.3, fake: 0.08, lurk: 0.07 };
    // (a play that won lately, again more often)
    if (c.L.reads)
      for (const x of c.reads.won.slice(-2)) if (x.goal === goal) weights[x.play] = (weights[x.play] ?? 0) + 0.3;
    let tot = allowed.reduce((s, p) => s + (weights[p] ?? 0), 0);
    let roll = c.rand() * tot;
    let play: string = allowed[0] ?? "rush";
    for (const p of allowed) {
      roll -= weights[p] ?? 0;
      if (roll <= 0) {
        play = p;
        break;
      }
    }
    void tot;
    tot = 0;
    this.play = play;
    // the roles: the best gun goes in first, the charge second, the utility behind
    const ranked = [...bots].sort((a, b) => strength(b.p) - strength(a.p));
    const carrier = bots.find((b) => b.p.bomb);
    const other = goals.find((g) => g !== goal) ?? null;
    const call = (text: string) => this.say(c, bots[0].id, { k: "plan", text });
    if (play === "rush") {
      // (a big side — Casual's ten — rushes down its two ways at once, not ten in one alley)
      if (ranked.length > 5 && routes[1]) {
        const a = ranked.filter((_, i) => i % 2 === 0);
        const b = ranked.filter((_, i) => i % 2 === 1);
        this.rushOn(c, a, routes[0], goal, carrier && a.includes(carrier) ? carrier : undefined);
        this.rushOn(c, b, routes[1], goal, carrier && b.includes(carrier) ? carrier : undefined);
      } else this.rushOn(c, ranked, routes[0], goal, carrier);
      call(this.buyKind === "eco" ? `Eco. Rush ${goal} together!` : `Rush ${goal}! Everyone with me.`);
    } else if (play === "split") {
      this.splitOn(c, ranked, routes, goal, carrier);
      call(`Split ${goal}: ${routes[0].via} and ${routes[1]?.via ?? routes[0].via}.`);
    } else if (play === "default") {
      this.controlOn(c, ranked, goals, carrier);
      this.controlTo = c.t + 32 + c.rand() * 18;
      call("Default. Take control, play for picks.");
    } else if (play === "fake" && other) {
      const fakers = ranked.filter((b) => b !== carrier).slice(-2);
      const main = ranked.filter((b) => !fakers.includes(b));
      this.fakeGoal = other;
      const fr = routesTo(c.k, this.team, other);
      for (const f of fakers)
        if (fr[0])
          this.set(f.id, {
            kind: "stage",
            role: "support",
            route: fr[0],
            stage: stageOf(c.k, fr[0], 10),
            go: false,
            throws: throwsOn(c.k, fr[0], this.team, c.L).filter((l) => l.kind === "smoke" || l.kind === "flash"),
            why: `fake ${other}`,
            goal: other,
          });
      this.splitOn(c, main, routes, goal, carrier);
      this.releaseBy = c.t + 45;
      call(`Fake ${other}, we hit ${goal}.`);
    } else if (play === "lurk" && other) {
      const lurk = ranked.filter((b) => b !== carrier).slice(-1)[0];
      this.lurker = lurk?.id ?? "";
      const lr = routesTo(c.k, this.team, other)[0];
      if (lurk && lr)
        this.set(lurk.id, {
          kind: "stage",
          role: "lurk",
          route: lr,
          stage: stageOf(c.k, lr, 26),
          go: false,
          quiet: true,
          why: `lurk ${other}`,
          goal: other,
        });
      const rest = ranked.filter((b) => b !== lurk);
      if (routes.length > 1) this.splitOn(c, rest, routes, goal, carrier);
      else this.rushOn(c, rest, routes[0], goal, carrier);
      call(`${goal} with four, one lurks ${lr?.via ?? other}.`);
    } else {
      this.rushOn(c, ranked, routes[0], goal, carrier);
      call(`Rush ${goal}!`);
    }
    c.reads.hits.push(goal);
  }

  private rushOn(c: SideCtx, ranked: Mate[], route: Route, goal: Goal, carrier: Mate | undefined) {
    const order = this.inOrder(ranked, carrier);
    const tl = throwsOn(c.k, route, this.team, c.L);
    order.forEach((b, i) => {
      const role: Role = i === 0 ? "entry" : b === carrier ? "carrier" : i === 1 ? "second" : "support";
      this.set(b.id, {
        kind: "move",
        role,
        route,
        // (the utility: the support's smoke, the second's flash)
        throws: tl.filter((l) =>
          role === "support" ? l.kind === "smoke" || l.kind === "he" : role === "second" ? l.kind === "flash" : false,
        ),
        why: `${role} · rush ${goal} via ${route.via}`,
        goal,
      });
    });
    this.released = true;
  }
  private splitOn(c: SideCtx, ranked: Mate[], routes: Route[], goal: Goal, carrier: Mate | undefined) {
    if (routes.length < 2) return this.rushOn(c, ranked, routes[0], goal, carrier);
    const order = this.inOrder(ranked, carrier);
    const big = Math.ceil(order.length / 2);
    order.forEach((b, i) => {
      const g = i < big ? 0 : 1;
      const route = routes[g];
      const tl = throwsOn(c.k, route, this.team, c.L);
      const role: Role = i === 0 || i === big ? "entry" : b === carrier ? "carrier" : "support";
      // (a column down the lane, 3 m apart: never stacked on one point)
      const rank = g === 0 ? i : i - big;
      this.set(b.id, {
        kind: "stage",
        role,
        route,
        stage: stageOf(c.k, route, 20 + rank * (order.length > 5 ? 4.5 : 3)),
        go: false,
        throws: tl.filter((l) =>
          role === "support" ? l.kind !== "flash" : role === "entry" ? false : l.kind === "flash",
        ),
        why: `${role} · split ${goal} via ${route.via}`,
        goal,
      });
    });
    this.released = false;
    this.releaseBy = Math.max(this.releaseBy, c.t + 40);
  }
  /** Map control: each bot a point partway down a different lane, watching on down it. */
  private controlOn(c: SideCtx, ranked: Mate[], goals: Goal[], carrier: Mate | undefined) {
    const lanes = goals.flatMap((g) => routesTo(c.k, this.team, g));
    const usedAreas = new Set<number>();
    ranked.forEach((b, i) => {
      const lane = lanes[i % lanes.length];
      // (the carrier back, the rest forward; a second on the same lane — a big side's — further back along it)
      const back = Math.floor(i / lanes.length) * 0.1;
      const share = b === carrier ? 0.3 : 0.45 + (i % 3) * 0.05 - back;
      let n = along(lane, share);
      if (usedAreas.has(c.k.areaOf[n])) n = along(lane, share - 0.08);
      usedAreas.add(c.k.areaOf[n]);
      const ahead = pos(c.k, along(lane, Math.min(0.9, share + 0.2)));
      this.set(b.id, {
        kind: "hold",
        role: b === carrier ? "carrier" : i === 0 ? "entry" : "support",
        to: n,
        watch: [ahead[0], ahead[1] + 1.3, ahead[2]],
        why: `control ${c.k.areas[c.k.areaOf[n]]?.name ?? ""}`,
        goal: lane.to,
      });
    });
  }
  /** Who goes in first: the best gun; the charge never first (second or third). */
  private inOrder(ranked: Mate[], carrier: Mate | undefined): Mate[] {
    const rest = ranked.filter((b) => b !== carrier);
    if (!carrier) return rest;
    rest.splice(Math.min(1, rest.length), 0, carrier);
    return rest;
  }

  // ── defending: the setups ──
  private defend(c: SideCtx, goals: Goal[]) {
    const bots = this.bots(c);
    const n = bots.length;
    let counts: number[];
    if (goals.length === 1) counts = [n];
    else {
      const rot = n >= 3 ? 1 : 0;
      const a = Math.ceil((n - rot) / 2);
      counts = [a + rot, n - rot - a];
      // (reads: hit there two of the last three rounds — stacked)
      if (c.L.reads && c.reads.hits.length >= 2) {
        const last = c.reads.hits.slice(-3);
        const g = goals.find((q) => last.filter((h) => h === q).length >= 2);
        if (g && n >= 3) {
          const i = goals.indexOf(g);
          counts = i === 0 ? [n - 1, 1] : [1, n - 1];
          this.play = `stack ${g}`;
        }
      }
    }
    if (!this.play) this.play = goals.length > 1 ? "setup" : `hold ${goals[0]}`;
    const taken: Spot[] = [];
    let k = 0;
    const sniperBot = bots.find((b) => b.p.primary === "sniper");
    goals.forEach((g, gi) => {
      const mine = bots.slice(k, k + counts[gi]);
      k += counts[gi];
      const hasSniper = !!sniperBot && mine.includes(sniperBot);
      const spots = pickSpots(c.k, this.team, g, mine.length, taken, ["hold", "sniper"], hasSniper);
      taken.push(...spots);
      // (the sniper to the long spot)
      const order = hasSniper && sniperBot ? [sniperBot, ...mine.filter((b) => b !== sniperBot)] : mine;
      order.forEach((b, i) => {
        const s = spots[i] ?? spots[i % Math.max(1, spots.length)];
        const role: Role =
          b === sniperBot
            ? "sniper"
            : goals.length > 1 && gi === 0 && i === order.length - 1 && counts[0] > counts[1]
              ? "rotator"
              : "anchor";
        // (the rotator, where the map has one, to the info spot: it sees them coming, the side hears it early)
        const info = role === "rotator" ? c.k.spots.find((q) => q.kind === "info" && q.team === this.team) : undefined;
        if (info) {
          this.set(b.id, {
            kind: "hold",
            role,
            spot: info,
            watch: [info.wx, info.wy + 1.3, info.wz],
            why: `info · ${c.k.areas[info.area]?.name ?? ""}`,
            goal: undefined,
          });
          return;
        }
        // (its door's delay: a smoke, fire or HE from where it stands, once the door's hit)
        const kinds: Lineup["kind"][] =
          c.L.utility >= 3
            ? ["smoke", "molotov", "he"]
            : c.L.utility >= 2
              ? ["smoke", "molotov"]
              : c.L.utility >= 1
                ? ["smoke"]
                : [];
        const delay = s
          ? c.k.lineups.filter(
              (l) => l.team === this.team && l.door === s.door && l.node === s.node && kinds.includes(l.kind),
            )
          : [];
        this.set(
          b.id,
          s
            ? {
                kind: "hold",
                role,
                spot: s,
                watch: [s.wx, s.wy + 1.3, s.wz],
                throws: delay,
                why: `${role} ${g} · ${c.k.areas[s.area]?.name ?? ""}`,
                goal: g,
              }
            : { kind: "move", role, to: c.k.goals[g]?.node, why: `to ${g}`, goal: g },
        );
      });
    });
    // (an early peek for information: Hard and up, now and then — out along their lane, back by 22 s)
    if (c.L.reads && n >= 4 && c.rand() < 0.35) {
      const peeker = bots.find((b) => this.orders.get(b.id)?.role === "anchor");
      const g = this.orders.get(peeker?.id ?? "")?.goal;
      const lane = g ? routesTo(c.k, other(this.team), g)[0] : undefined;
      if (peeker && lane) {
        const n0 = along(lane, 0.6);
        const back = pos(c.k, along(lane, 0.4));
        const was = this.orders.get(peeker.id) as Order;
        this.set(peeker.id, {
          ...was,
          kind: "hold",
          spot: undefined,
          to: n0,
          watch: [back[0], back[1] + 1.3, back[2]],
          why: `early peek ${c.k.areas[c.k.areaOf[n0]]?.name ?? ""}`,
          quiet: true,
        });
        this.peek = { id: peeker.id, until: 22, back: was };
      }
    }
    if (bots[0])
      this.say(c, bots[0].id, {
        k: "plan",
        text: this.play.startsWith("stack")
          ? `Stack ${this.play.slice(6)}, they hit it last rounds.`
          : goals.length > 1
            ? "Standard setup."
            : `Hold ${goals[0] === "H" ? "the hostages" : goals[0]}.`,
      });
  }
  peek: { id: string; until: number; back: Order } | null = null;

  private say(c: SideCtx, by: string, call: Call) {
    c.say(by, call);
  }

  /** Twice a second: the stage released, rotations, the plant's post and retake, saves, the late call, pickups,
   *  hostages. */
  step(c: SideCtx) {
    const bots = this.bots(c);
    if (!bots.length) return;
    const m = c.m;
    const ch = m.charge;
    const { attack, defend } = aims(c.k, this.team);
    // the early peek back to its spot
    if (this.peek && c.t >= this.peek.until) {
      if (this.orders.get(this.peek.id)?.why.startsWith("early")) this.set(this.peek.id, this.peek.back);
      this.peek = null;
    }
    if (this.play === "hunt") return;
    // ── attacking ──
    if (attack.length) {
      const planted = m.map.mode !== "hostage" && ch && (ch.state === "planted" || ch.state === "planting");
      if (planted && ch.site && this.posted !== ch.site) {
        this.posted = ch.site;
        this.postOn(c, ch.site);
        return;
      }
      if (planted) {
        this.postWatch(c, bots);
        return;
      }
      // the charge dropped: the nearest picks it up
      if (m.map.mode === "hostage") {
        // (the hostages: none to pick up)
      } else if (ch?.state === "dropped") {
        const near = [...bots].sort(
          (a, b) => Math.hypot(a.x - ch.x, a.z - ch.z) - Math.hypot(b.x - ch.x, b.z - ch.z),
        )[0];
        const o = this.orders.get(near.id);
        if (o?.kind !== "pickup")
          this.set(near.id, {
            kind: "pickup",
            role: o?.role ?? "carrier",
            to: nodeNear(c.k.g, ch.x, ch.z),
            why: "pick up the charge",
            goal: o?.goal,
          });
      } else
        for (const b of bots) {
          const o = this.orders.get(b.id);
          if (o?.kind === "pickup" && b.p.bomb && this.goal) {
            const r = routesTo(c.k, this.team, this.goal)[0];
            if (r)
              this.set(b.id, {
                kind: "move",
                role: "carrier",
                route: r,
                why: `carrier · ${this.goal}`,
                goal: this.goal,
              });
          }
        }
      // default: the late call on the weaker side
      if (this.play === "default" && c.t >= this.controlTo) {
        const goals = attack;
        const heat = (g: Goal) => {
          const r = c.k.goals[g]?.r;
          if (!r) return 0;
          let n = 0;
          for (const q of c.pic.known.values())
            if (Math.hypot(q.x - (r.x0 + r.x1) / 2, q.z - (r.z0 + r.z1) / 2) < 40) n++;
          return n;
        };
        const goal = [...goals].sort((a, b) => heat(a) - heat(b))[0];
        this.goal = goal;
        this.play = "execute";
        const routes = routesTo(c.k, this.team, goal);
        const ranked = [...bots].sort((a, b) => strength(b.p) - strength(a.p));
        const carrier = bots.find((b) => b.p.bomb);
        // (each down the lane nearest it)
        const order = this.inOrder(ranked, carrier);
        const per = new Map<Route, number>();
        order.forEach((b, i) => {
          const route = nearestRoute(c.k, routes, b) ?? routes[0];
          const tl = throwsOn(c.k, route, this.team, c.L);
          const rank = per.get(route) ?? 0;
          per.set(route, rank + 1);
          this.set(b.id, {
            kind: "stage",
            role: i === 0 ? "entry" : b === carrier ? "carrier" : "support",
            route,
            stage: stageOf(c.k, route, 20 + rank * (order.length > 5 ? 4.5 : 3)),
            go: false,
            throws: tl,
            why: `execute ${goal} via ${route.via}`,
            goal,
          });
        });
        this.released = false;
        this.releaseBy = c.t + 18;
        this.say(c, bots[0].id, {
          k: "plan",
          text: `Going ${goal}. ${routes[0]?.via ?? ""} and ${routes[1]?.via ?? ""}.`.replace(" and .", "."),
        });
      }
      // the stage released: everyone staged (one may be late), or time
      if (!this.released) {
        const staged = bots.filter((b) => {
          const o = this.orders.get(b.id);
          if (!o || o.kind !== "stage" || o.stage === undefined || o.role === "lurk" || o.why.startsWith("fake"))
            return true;
          const [x, , z] = pos(c.k, o.stage);
          return Math.hypot(x - b.x, z - b.z) < 4;
        }).length;
        const fakeDone = !this.fakeGoal || (this.fakeAt > 0 && c.t - this.fakeAt > 5);
        if ((staged >= bots.length && fakeDone) || c.t >= this.releaseBy) {
          this.released = true;
          for (const b of bots) {
            const o = this.orders.get(b.id);
            if (o?.kind === "stage" && o.role !== "lurk" && !o.why.startsWith("fake")) o.go = true;
          }
          this.say(c, bots[0].id, { k: "plan", text: "Go, go, go!" });
        }
      }
      // the fakers: their noise made (at their stage), then on to the real one
      if (this.fakeGoal && this.goal) {
        for (const b of bots) {
          const o = this.orders.get(b.id);
          if (!o?.why.startsWith("fake") || o.stage === undefined) continue;
          const [x, , z] = pos(c.k, o.stage);
          if (Math.hypot(x - b.x, z - b.z) < 4 && !this.fakeAt) this.fakeAt = c.t;
          if (this.fakeAt && c.t - this.fakeAt > 7) {
            const r = nearestRoute(c.k, routesTo(c.k, this.team, this.goal), b);
            if (r)
              this.set(b.id, {
                kind: "move",
                role: "support",
                route: r,
                why: `after the fake · ${this.goal}`,
                goal: this.goal,
              });
          }
        }
      }
      // the lurker in late
      if (this.lurker && c.t > 70 && this.goal) {
        const b = bots.find((q) => q.id === this.lurker);
        const o = b && this.orders.get(b.id);
        if (b && o?.role === "lurk") {
          const r = nearestRoute(c.k, routesTo(c.k, this.team, this.goal), b);
          if (r)
            this.set(b.id, {
              kind: "move",
              role: "support",
              route: r,
              why: `lurker in · ${this.goal}`,
              goal: this.goal,
            });
        }
      }
      // out of time: everyone in
      if (!this.late && c.t > ROUND.round - 28 && this.goal) {
        this.late = true;
        for (const b of bots) {
          const r = nearestRoute(c.k, routesTo(c.k, this.team, this.goal), b);
          const o = this.orders.get(b.id);
          if (r && o?.kind !== "pickup" && o?.kind !== "carry" && o?.kind !== "escort")
            this.set(b.id, {
              kind: "move",
              role: o?.role ?? "support",
              route: r,
              why: `late · ${this.goal}`,
              goal: this.goal,
            });
        }
        this.say(c, bots[0].id, { k: "plan", text: `Out of time. Everyone ${this.goal}!` });
      }
      // a lost round: the last one saves
      if (!this.saving && bots.length === 1 && c.foes >= 3 && c.t > 75) {
        this.saving = true;
        this.set(bots[0].id, {
          kind: "save",
          role: "free",
          to: nodeNear(c.k.g, ...firstSpawn(m, this.team)),
          why: "save",
        });
      }
    }
    // ── the hostage maps' attackers (the Wardens): take one, carry it out, the rest round them ──
    if (attack.length && m.map.mode === "hostage") this.hostageAttack(c, bots);
    // ── defending ──
    if (defend.length) {
      if (m.map.mode === "hostage") this.hostageDefend(c, bots);
      else {
        const planted = ch && ch.state === "planted";
        if (planted && ch.site) this.retakeStep(c, bots, ch.site);
        else this.rotateStep(c, bots, defend);
      }
    }
  }

  private postOn(c: SideCtx, site: Goal) {
    const bots = this.bots(c);
    // (one or two left: an angle of their own near the charge, not one of the map's known spots — a lone post on a
    // known spot is the first corner the retaker checks; Boathouse's 1 v 1s went the Wardens' way 27 in 30)
    const ch0 = c.m.charge;
    if (bots.length <= 2 && ch0) {
      const own = offAngles(c, ch0.x, ch0.z, c.k.goals[site]?.y ?? 0, bots.length);
      if (own.length === bots.length) {
        bots.forEach((b, i) => {
          const s = { ...own[i], to: site };
          this.set(b.id, {
            kind: "post",
            role: this.orders.get(b.id)?.role ?? "support",
            spot: s,
            watch: [s.wx, s.wy + 1.3, s.wz],
            why: `post-plant ${c.k.areas[s.area]?.name ?? site} (own angle)`,
            goal: site,
          });
        });
        return;
      }
    }
    // (one watches the charge itself — "play the bomb" — the rest the ways back in)
    const ch = c.m.charge;
    const onCharge = ch
      ? c.k.spots
          .filter((s) => s.to === site && (s.kind === "post" || s.kind === "hold"))
          .map((s) => ({ s, d: Math.hypot(s.x - ch.x, s.z - ch.z) }))
          .filter(({ s, d }) => d > 4 && d < 22 && clear(c.m.map, [s.x, s.y + 1.62, s.z], [ch.x, s.y + 0.4, ch.z]))
          .sort((a, b) => a.d - b.d)[0]?.s
      : undefined;
    // (the rest in pairs on the ways they'll most likely come — the shortest from their spawn first —: two on one
    // door is a crossfire; one on each, a holder alone picked off by a group of retakers one at a time)
    const want = bots.length - (onCharge ? 1 : 0);
    const routeLen = (e: (typeof c.k.entrances)[number]) => Math.min(...e.routes.map((ri) => c.k.routes[ri].len));
    const ways = c.k.entrances
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.to === site && e.team !== this.team)
      .sort((a, b) => routeLen(a.e) - routeLen(b.e))
      .slice(0, Math.max(1, Math.ceil(want / 2)));
    const paired: Spot[] = [];
    const freeOf = (s: Spot) =>
      ![onCharge, ...paired].some((q) => q && (q === s || Math.hypot(q.x - s.x, q.z - s.z) < 4));
    for (const { i } of ways)
      for (const s of c.k.spots
        .filter((q) => q.team === this.team && q.to === site && q.kind === "post" && q.door === i)
        .sort((a, b) => b.score - a.score)) {
        if (paired.length >= want || paired.filter((q) => q.door === i).length >= 2) break;
        if (freeOf(s)) paired.push(s);
      }
    const doors = [
      ...paired,
      ...pickSpots(c.k, this.team, site, want - paired.length, onCharge ? [onCharge, ...paired] : paired, ["post"]),
    ];
    const spots = onCharge
      ? [
          { ...onCharge, wx: ch?.x ?? onCharge.wx, wy: onCharge.y, wz: ch?.z ?? onCharge.wz, kind: "post" as const },
          ...doors,
        ]
      : doors;
    // (each to the spot nearest it)
    const left = [...spots];
    for (const b of bots) {
      left.sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z));
      const s = left.shift();
      const was = this.orders.get(b.id);
      if (s)
        this.set(b.id, {
          kind: "post",
          role: was?.role ?? "support",
          spot: s,
          watch: [s.wx, s.wy + 1.3, s.wz],
          why: `post-plant ${c.k.areas[s.area]?.name ?? site}`,
          goal: site,
        });
      else
        this.set(b.id, {
          kind: "hold",
          role: was?.role ?? "support",
          to: c.k.goals[site]?.node,
          why: `post-plant ${site}`,
          goal: site,
        });
    }
  }

  /** The post-plant's eyes on who's left: a post watches where one of them was last seen or heard near it (6 s),
   *  not only its door from their spawn — Boathouse's last Warden was already in the hall behind the posts, and won
   *  47 of 57 of those. */
  private postWatch(c: SideCtx, bots: Mate[]) {
    for (const b of bots) {
      const o = this.orders.get(b.id);
      if (o?.kind !== "post" || !o.spot) continue;
      let best: { x: number; y: number; z: number } | null = null;
      let bd = 32;
      for (const q of c.pic.known.values()) {
        if (c.t - q.at > 6 || !c.m.players.get(q.id)?.alive) continue;
        const d = Math.hypot(q.x - o.spot.x, q.z - o.spot.z);
        if (d < bd) {
          bd = d;
          best = q;
        }
      }
      o.watch = best ? [best.x, best.y + 1.3, best.z] : [o.spot.wx, o.spot.wy + 1.3, o.spot.wz];
    }
  }

  private rotateStep(c: SideCtx, bots: Mate[], goals: Goal[]) {
    if (goals.length < 2 || c.t - this.rotateAt < 15) return;
    // what's been called near each objective in the last 8 s (and the charge seen)
    const near = goals.map((g) => {
      const G = c.k.goals[g];
      if (!G) return 0;
      let n = 0;
      for (const q of c.pic.known.values()) {
        if (c.t - q.at > 8) continue;
        if (Math.hypot(q.x - G.x, q.z - G.z) < 40) n += c.m.players.get(q.id)?.bomb ? 2 : 1;
      }
      return n;
    });
    const i = near[0] >= 2 && near[0] > near[1] ? 0 : near[1] >= 2 && near[1] > near[0] ? 1 : -1;
    if (i < 0) return;
    const to = goals[i];
    const from = goals[1 - i];
    this.rotateAt = c.t;
    // the rotator, and all but one of the other side's
    const there = bots.filter((b) => this.orders.get(b.id)?.goal === from);
    const going = [
      ...bots.filter((b) => this.orders.get(b.id)?.role === "rotator" && this.orders.get(b.id)?.goal !== to),
      ...there.slice(1),
    ];
    const uniq = [...new Set(going)];
    if (!uniq.length) return;
    const taken = bots
      .filter((b) => this.orders.get(b.id)?.goal === to)
      .map((b) => this.orders.get(b.id)?.spot)
      .filter((s): s is Spot => !!s);
    const spots = pickSpots(c.k, this.team, to, uniq.length, taken, ["hold", "sniper"]);
    uniq.forEach((b, j) => {
      const s = spots[j];
      this.set(
        b.id,
        s
          ? {
              kind: "hold",
              role: "rotator",
              spot: s,
              watch: [s.wx, s.wy + 1.3, s.wz],
              why: `rotate ${to} · ${c.k.areas[s.area]?.name ?? ""}`,
              goal: to,
            }
          : { kind: "move", role: "rotator", to: c.k.goals[to]?.node, why: `rotate ${to}`, goal: to },
      );
    });
    this.say(c, uniq[0].id, { k: "rotate", to: String(to) });
  }

  private retakeStep(c: SideCtx, bots: Mate[], site: Goal) {
    const ch = c.m.charge;
    if (!ch) return;
    const G = c.k.goals[site];
    if (!G) return;
    // can it be done? the nearest one's way there and the defuse
    const need = (b: Mate) =>
      Math.hypot(b.x - ch.x, b.z - ch.z) / RUN + (b.p.kit ? ROUND.defuseKit : ROUND.defuse) + 1.5;
    const best = Math.min(...bots.map(need));
    // (not while one of us is on it)
    if (!this.saving && best > ch.left && !ch.defuser) {
      this.saving = true;
      for (const b of bots)
        this.set(b.id, {
          kind: "save",
          role: "free",
          to: nodeNear(c.k.g, ...firstSpawn(c.m, this.team)),
          why: "save: no time",
        });
      this.say(c, bots[0].id, { k: "plan", text: "Save, we can't make it." });
      return;
    }
    if (this.saving) return;
    if (!this.retake) {
      // each to a stage on its own way back in, 12 m out
      const stage = new Map<string, number>();
      const routes = routesTo(c.k, this.team, site);
      const per = new Map<Route, number>();
      // (spread over the ways in — a crossfire on the post-plant, not a queue at one door: each to the way in
      // with the fewest on it, the nearer first)
      const doorOf = (r: Route) => c.k.entrances.findIndex((e) => e.routes.includes(c.k.routes.indexOf(r)));
      const onDoor = new Map<number, number>();
      const byNear = [...bots].sort((a, b) => Math.hypot(a.x - ch.x, a.z - ch.z) - Math.hypot(b.x - ch.x, b.z - ch.z));
      const pickRoute = (b: Mate) => {
        const ranked = [...routes].sort(
          (p, q) =>
            (onDoor.get(doorOf(p)) ?? 0) - (onDoor.get(doorOf(q)) ?? 0) || routeDist(c.k, p, b) - routeDist(c.k, q, b),
        );
        const r = ranked[0];
        if (r) onDoor.set(doorOf(r), (onDoor.get(doorOf(r)) ?? 0) + 1);
        return r;
      };
      const chosen = new Map<string, Route | undefined>();
      for (const b of byNear) chosen.set(b.id, pickRoute(b));
      for (const b of bots) {
        const r = chosen.get(b.id) ?? nearestRoute(c.k, routes, b) ?? routes[0];
        const rank = r ? (per.get(r) ?? 0) : 0;
        if (r) per.set(r, rank + 1);
        if (r) stage.set(b.id, stageOf(c.k, r, 12 + rank * 3));
        const o = this.orders.get(b.id);
        this.set(b.id, {
          kind: "retake",
          role: o?.role ?? "anchor",
          route: r,
          stage: stage.get(b.id),
          go: false,
          throws: r ? throwsOn(c.k, r, this.team, c.L) : [],
          why: `retake ${site}`,
          goal: site,
        });
      }
      this.retake = { stage, go: false };
      // (Retakes: they start round the site already, each from its own side — in from there at once, a crossfire of
      // ways, not a walk to their base's lanes to stage)
      if (c.m.mode.id === "retakes") {
        this.retake.go = true;
        for (const b of bots) {
          const o = this.orders.get(b.id);
          if (o) o.go = true;
        }
        this.say(c, bots[0].id, { k: "plan", text: `Retake ${site}, all in!` });
      } else this.say(c, bots[0].id, { k: "plan", text: `Retake ${site}. Wait for me.` });
    }
    if (!this.retake.go) {
      const ready = bots.filter((b) => {
        const s = this.retake?.stage.get(b.id);
        if (s === undefined) return true;
        const [x, , z] = pos(c.k, s);
        return Math.hypot(x - b.x, z - b.z) < 4;
      }).length;
      if (ready >= Math.min(bots.length >= 4 ? 3 : 2, bots.length) || ch.left < best + 9) {
        this.retake.go = true;
        for (const b of bots) {
          const o = this.orders.get(b.id);
          if (o) o.go = true;
        }
        this.say(c, bots[0].id, { k: "plan", text: "Go in together!" });
      }
    }
  }

  private hostageAttack(c: SideCtx, bots: Mate[]) {
    const carrier = bots.find((b) => b.p.carry >= 0);
    const out = c.k.routes.filter((r) => r.from === "H" && r.to === "R").sort((a, b) => a.len - b.len);
    if (carrier) {
      const o = this.orders.get(carrier.id);
      if (o?.kind !== "carry" && out[0]) {
        this.set(carrier.id, {
          kind: "carry",
          role: "carrier",
          route: nearestRoute(c.k, out, carrier) ?? out[0],
          why: "carry a hostage out",
          goal: "R",
        });
        this.say(c, carrier.id, { k: "hostage" });
      }
      // (three round them at most, the nearest — a big side's other six back for another, not a crowd round one)
      const near = bots
        .filter((b) => b !== carrier)
        .sort((a, b) => Math.hypot(a.x - carrier.x, a.z - carrier.z) - Math.hypot(b.x - carrier.x, b.z - carrier.z));
      near.forEach((b, i) => {
        const o = this.orders.get(b.id);
        if (i < 3) {
          if (o?.kind !== "escort")
            this.set(b.id, { kind: "escort", role: "escort", who: carrier.id, why: "escort the hostage", goal: "R" });
        } else if (o?.kind === "escort" || !o) {
          const r = nearestRoute(c.k, routesTo(c.k, this.team, "H"), b);
          if (r) this.set(b.id, { kind: "move", role: "entry", route: r, why: "back for another", goal: "H" });
        }
      });
    } else
      for (const b of bots) {
        const o = this.orders.get(b.id);
        if (o?.kind === "escort" || o?.kind === "carry") {
          const r = nearestRoute(c.k, routesTo(c.k, this.team, "H"), b);
          if (r) this.set(b.id, { kind: "move", role: "entry", route: r, why: "back for another", goal: "H" });
        }
      }
  }

  private hostageDefend(c: SideCtx, bots: Mate[]) {
    const taken = c.m.hostages.some((h) => h.by && !h.rescued);
    if (taken && !this.carriedSeen) {
      this.carriedSeen = true;
      const out = c.k.routes.filter((r) => r.from === "H" && r.to === "R").sort((a, b) => a.len - b.len);
      bots.forEach((b, i) => {
        const r = out[i % Math.max(1, out.length)];
        if (!r) return;
        const n = along(r, 0.6);
        const back = pos(c.k, along(r, 0.3));
        this.set(b.id, {
          kind: "hold",
          role: "anchor",
          to: n,
          watch: [back[0], back[1] + 1.3, back[2]],
          why: `cut off the hostage · ${r.via}`,
          goal: "R",
        });
      });
      this.say(c, bots[0].id, { k: "plan", text: "They've got a hostage. Cut them off!" });
    }
    if (!taken && this.carriedSeen) {
      this.carriedSeen = false;
      this.defend(c, ["H"]);
    }
  }

  /** A command from a person on the side (the radio menu's): obeyed by the bots near (or all). */
  command(c: SideCtx, by: string, i: number): string | null {
    const me = c.mates.find((q) => q.id === by);
    const bots = this.bots(c);
    if (!me || !bots.length) return null;
    const near = [...bots].sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
    const meNode = nodeNear(c.k.g, me.x, me.z, me.y);
    const { attack, defend } = aims(c.k, this.team);
    switch (i) {
      case 0: {
        // Move in!: the stage released, everyone on in
        this.released = true;
        for (const b of bots) {
          const o = this.orders.get(b.id);
          if (o && (o.kind === "stage" || o.kind === "retake")) o.go = true;
        }
        if (this.retake) this.retake.go = true;
        return near[0].id;
      }
      case 1: {
        // Fall back!: back toward me, held
        for (const b of near.slice(0, 3))
          this.set(b.id, { kind: "follow", role: "free", who: by, why: "falling back to you" });
        return near[0].id;
      }
      case 2: {
        // Hold this spot: the ones near me hold where they stand, watching on
        for (const b of near) {
          if (Math.hypot(b.x - me.x, b.z - me.z) > 25) break;
          const n = nodeNear(c.k.g, b.x, b.z, b.y);
          this.set(b.id, {
            kind: "hold",
            role: "free",
            to: n,
            watch: [b.x + (b.x - me.x), b.y + 1.5, b.z + (b.z - me.z)],
            why: "holding, as told",
          });
        }
        return near[0].id;
      }
      case 3:
      case 9: {
        // I need help here! (two come), Regroup! (all come)
        for (const b of i === 3 ? near.slice(0, 2) : near)
          this.set(b.id, { kind: "follow", role: "free", who: by, why: i === 3 ? "helping you" : "regrouping on you" });
        return near[0].id;
      }
      case 6: {
        // Follow me!: two follow
        for (const b of near.slice(0, 2))
          this.set(b.id, { kind: "follow", role: "free", who: by, why: "following you" });
        return near[0].id;
      }
      case 7:
      case 8: {
        // Go A! / Go B!
        const g: Goal = i === 7 ? "A" : "B";
        if (!c.k.goals[g]) return null;
        if (attack.includes(g)) {
          this.goal = g;
          this.play = "rush";
          const routes = routesTo(c.k, this.team, g);
          for (const b of bots) {
            const r = nearestRoute(c.k, routes, b) ?? routes[0];
            if (r)
              this.set(b.id, {
                kind: "move",
                role: "support",
                route: r,
                throws: throwsOn(c.k, r, this.team, c.L),
                why: `going ${g}, as told`,
                goal: g,
              });
          }
        } else if (defend.includes(g)) {
          const spots = pickSpots(c.k, this.team, g, bots.length, [], ["hold", "sniper"]);
          bots.forEach((b, j) => {
            const s = spots[j];
            this.set(
              b.id,
              s
                ? {
                    kind: "hold",
                    role: "anchor",
                    spot: s,
                    watch: [s.wx, s.wy + 1.3, s.wz],
                    why: `to ${g}, as told`,
                    goal: g,
                  }
                : { kind: "move", role: "anchor", to: c.k.goals[g]?.node, why: `to ${g}, as told`, goal: g },
            );
          });
        }
        return near[0].id;
      }
      default:
        void meNode;
        return null;
    }
  }
}

/** A side's buys at the round's start, together (F9a): a pistol round, an eco, a force or a full buy, decided as
 *  one; the rich buy a rifle for the short; a sniper for one at most; the utility by the level. */
export function sideBuys(m: Match, team: Team, mates: MPlayer[], L: LevelSpec, side: Side, rand: () => number) {
  const bots = mates.filter((p) => p.bot && p.alive);
  if (!bots.length) return;
  const pistol = m.round === 1 || m.round === m.mode.half + 1;
  const avg = mates.reduce((s, p) => s + p.money, 0) / Math.max(1, mates.length);
  const rifle = 2700;
  const full = (team === "w" ? 400 : 0) + rifle + 1000 + 300;
  const can = bots.filter((p) => p.money >= full || p.primary).length;
  const lastOfHalf = m.round === m.mode.half || m.score[0] === m.mode.first - 1 || m.score[1] === m.mode.first - 1;
  // (CS's: buy full when most can; else save for a full buy next round if another loss's bonus gets there; force only
  // when it wouldn't anyway, or the round decides something — the half's last, the other side a round from winning)
  const nextLoss = avg + lossBonus(m.streak[team] + 1);
  let kind: Side["buyKind"];
  if (pistol) kind = "pistol";
  else if (!L.economy) kind = "full";
  else if (can >= Math.ceil(bots.length * 0.8) || avg >= full + 800) kind = "full";
  else if (lastOfHalf && avg >= 2000) kind = "force";
  else if (nextLoss >= full) kind = "eco";
  else if (avg >= 2400) kind = "force";
  else kind = "eco";
  side.buyKind = kind;
  const get = (p: MPlayer, item: ItemId) => buy(m, p.id, item, true);
  const hasSniper = mates.some((p) => p.primary === "sniper");
  for (const p of bots) {
    if (kind === "pistol") {
      if (p.money >= 650 && L.economy) get(p, "kevlar");
      if (L.utility >= 2 && p.money >= 200) get(p, "flash");
      continue;
    }
    if (kind === "eco") continue;
    if (!p.primary) {
      if (kind === "full" && !hasSniper && L.utility >= 1 && p.money >= 4750 + 1000 && p === bots[0] && rand() < 0.6)
        get(p, "sniper");
      else if (p.money >= rifle + (kind === "full" ? 650 : 0)) get(p, "ak47");
      else if (p.money >= 1100) get(p, "shotgun");
    }
    if (p.money >= 1000 && !(p.armor >= 100 && p.helmet)) get(p, "helmet");
    else if (p.money >= 650 && p.armor < 100) get(p, "kevlar");
    if (team === "w" && p.money >= 400 && !p.kit && (kind === "full" || rand() < 0.5)) get(p, "kit");
    if (L.utility >= 1 && p.money >= 300) get(p, "smoke");
    if (L.utility >= 2 && p.money >= 200) get(p, "flash");
    if (L.utility >= 3 && p.money >= 500) get(p, team === "r" ? "molotov" : "incendiary");
    if (L.utility >= 3 && p.money >= 300) get(p, "he");
  }
  // (the rich buy a rifle for a teammate short of one, on a full buy)
  if (kind === "full" && L.economy)
    for (const p of bots) {
      if (p.primary) continue;
      const giver = bots.find((q) => q.money >= rifle + 1500);
      if (!giver) break;
      const before = p.money;
      p.money += rifle;
      if (buy(m, p.id, "ak47", true)) p.money = before;
      else giver.money -= rifle;
    }
  void shopItem;
}

/** How strong a player's hand is (the entry goes first). */
export function strength(p: MPlayer): number {
  const g = p.primary ?? p.pistol;
  return (
    (g === "ak47" ? 5 : g === "sniper" ? 3 : g === "shotgun" ? 3.5 : g === "daybreak" ? 4 : 1) +
    p.hp / 100 +
    (p.armor ? 0.5 : 0)
  );
}
/** How near a route's line passes a mate (m). */
export function routeDist(k: Know, r: Route, b: { x: number; z: number }): number {
  let bd = Number.POSITIVE_INFINITY;
  for (let i = 0; i < r.nodes.length; i += 6) {
    const [x, , z] = nodePos(k.g, r.nodes[i]);
    bd = Math.min(bd, Math.hypot(x - b.x, z - b.z));
  }
  return bd;
}
/** The route of a set whose line passes nearest a mate. */
export function nearestRoute(k: Know, routes: Route[], b: { x: number; z: number }): Route | undefined {
  let best: Route | undefined;
  let bd = Number.POSITIVE_INFINITY;
  for (const r of routes)
    for (let i = 0; i < r.nodes.length; i += 6) {
      const [x, , z] = nodePos(k.g, r.nodes[i]);
      const d = Math.hypot(x - b.x, z - b.z);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
  return best;
}
function firstSpawn(m: Match, t: Team): [number, number] {
  return m.map.spawns[t][0];
}
export { teamOf };

/** Places near a charge to play it from that aren't the map's known spots: 5–16 m out on its floor, a clear line to
 *  it, cover at hand (two of eight sides closed within 1.3 m), apart; picked at random from the better half. */
function offAngles(c: SideCtx, cx: number, cz: number, fy: number, n: number): Spot[] {
  const g = c.k.g;
  const cands: { s: Spot; cover: number }[] = [];
  for (let x = cx - 16; x <= cx + 16; x += 1.5)
    for (let z = cz - 16; z <= cz + 16; z += 1.5) {
      const d = Math.hypot(x - cx, z - cz);
      if (d < 5 || d > 16) continue;
      const node = nodeAt(g, x, z, fy);
      if (node < 0 || Math.abs(g.hs[node] - fy) > 0.8) continue;
      const [nx, ny, nz] = nodePos(g, node);
      if (!clear(c.m.map, [nx, ny + 1.62, nz], [cx, fy + 0.5, cz])) continue;
      if (c.k.spots.some((q) => Math.hypot(q.x - nx, q.z - nz) < 3)) continue;
      let cover = 0;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        if (shotThrough(c.m.map, [nx, ny + 1, nz], [nx + Math.cos(a) * 1.3, ny + 1, nz + Math.sin(a) * 1.3]).walls > 0)
          cover++;
      }
      if (cover < 2) continue;
      cands.push({
        cover,
        s: {
          node,
          x: nx,
          y: ny,
          z: nz,
          team: c.team,
          to: "A",
          door: -1,
          wx: cx,
          wy: fy,
          wz: cz,
          d,
          kind: "post",
          area: c.k.areaOf[node] ?? -1,
          score: cover,
        },
      });
    }
  cands.sort((a, b) => b.cover - a.cover);
  const pool = cands.slice(0, Math.max(n, Math.ceil(cands.length / 2)));
  const out: Spot[] = [];
  while (out.length < n && pool.length) {
    const i = Math.floor(c.rand() * pool.length);
    const [p] = pool.splice(i, 1);
    if (out.every((q) => Math.hypot(q.x - p.s.x, q.z - p.s.z) > 4)) out.push(p.s);
  }
  return out;
}
