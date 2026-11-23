// A bot's brain (docs/plan/117-bot-brains.md, phases 3, 4, 6, 7; Dave Mark's utility over its actions): every step it
// sees, hears and remembers; picks who to fight; aims and fires as a person; moves as one (strafing, stopping for a
// shot, crouching at range, cover to reload); and otherwise does its side's order — a lane, a stage, a spot, the post,
// the retake, following you — checking the corners on its way one at a time, trading a teammate, throwing its
// lineups, planting, defusing, picking up the charge, carrying a hostage.

import { ARMS, type GunId, isCharged, isScoped } from "../../dark/arms.ts";
import { CELL, nodeAt, nodeNear, nodePos } from "../grid.ts";
import type { Team } from "../map.ts";
import { inRect } from "../map.ts";
import type { Match, MPlayer } from "../match.ts";
import type { Nade } from "../nades.ts";
import { type StrikeGun, speedWith } from "../rules.ts";
import { acquire, type Body, fire, letGo, MAG, RELOAD_S, ready, type Shot, track, turnTo, wrap } from "./aim.ts";
import { CHEST, clear, EYE, type Know, type Lineup, placeAt } from "./know.ts";
import type { LevelSpec } from "./level.ts";
import type { Call } from "./radio.ts";
import { type Contact, offView, type Pic, picClear, seesBody } from "./senses.ts";
import type { BotState } from "./state.ts";
import type { Side } from "./team.ts";
import { arrived, follow, type Gait, goTo, heading, stepFeet, walkClear } from "./walk.ts";

/** Someone a bot may see, shoot or keep clear of. */
export interface Who extends Body {
  vx: number;
  vz: number;
  bot: boolean;
  crouch: boolean;
}
/** What a bot's step needs of the world. */
export interface World {
  k: Know;
  m: Match;
  L: LevelSpec;
  /** s since the round went live; s of the match (the clock everything's timed on) */
  t: number;
  now: number;
  dt: number;
  rand: () => number;
  me: MPlayer;
  team: Team;
  enemies: Who[];
  mates: Who[];
  smokes: Nade[];
  pic: Pic;
  side: Side;
  /** a teammate fell: where, when, and where their killer was if known */
  fell: { x: number; z: number; at: number; kx?: number; kz?: number } | null;
  /** the plant's best spot at each site */
  plantSpot: (site: "A" | "B") => [number, number];
}
/** What a bot's step gives back. */
export interface Out {
  shots: Shot[];
  throws: { kind: Lineup["kind"]; eye: [number, number, number]; yaw: number; pitch: number; short: boolean }[];
  calls: { c: Call; contacts?: Contact[] }[];
  /** holding use this step (planting, defusing) */
  use: boolean;
  /** picks up the charge, grabs a hostage (its index) */
  pickup: boolean;
  grab: number;
  /** a footstep heard from it */
  step: boolean;
}

const gunOfP = (p: MPlayer): GunId | null => (p.primary ?? p.pistol ?? null) as GunId | null;

/** One step of a bot. */
export function stepBot(b: BotState, w: World, out: Out) {
  const { k, L, me, dt, now } = w;
  const g = k.g;
  const map = w.m.map;
  b.gun = gunOfP(me);
  const gun = b.gun;
  const eye: [number, number, number] = [b.feet.x, b.feet.y + (b.crouch ? 1.15 : EYE), b.feet.z];
  // ── hurt: where it came from turned to (its own sense of it) ──
  if (me.hp < b.hp - 0.5) {
    b.hurtAt = now;
    if (me.hp < 40 && !b.saidHit) {
      b.saidHit = true;
      out.calls.push({ c: { k: "hit" } });
    }
  }
  b.hp = me.hp;
  // ── sight ──
  const blind = now < b.blindTo;
  const seen: Who[] = [];
  if (!blind)
    for (const e of w.enemies) {
      const d = Math.hypot(e.x - b.feet.x, e.z - b.feet.z);
      if (d > L.sight) continue;
      const off = offView(b.aim.yaw, b.feet.x, b.feet.z, e.x, e.z);
      // (its view's cone; wider close by, all round just after a hit)
      const inCone = off <= 1 || (d < 9 && off <= 1.6) || now - b.hurtAt < 1.2;
      if (!inCone) continue;
      if (!seesBody(map, w.smokes, eye, e.x, e.y, e.z, e.h)) continue;
      seen.push(e);
      b.mem.set(e.id, { id: e.id, x: e.x, y: e.y, z: e.z, at: w.t, seen: true });
    }
  // ── who to fight: the one it's on if still in sight, else the nearest ──
  let target = seen.find((e) => e.id === b.fighting) ?? null;
  if (!target && seen.length)
    target = [...seen].sort(
      (a, c) => Math.hypot(a.x - b.feet.x, a.z - b.feet.z) - Math.hypot(c.x - b.feet.x, c.z - b.feet.z),
    )[0];
  const tAim = (e: Who): [number, number] => {
    const headAt = b.aimHead;
    const up = (e.crouch ? 1.25 : 1.8) - (headAt ? 0.12 : 0.6);
    const dx = e.x - eye[0];
    const dz = e.z - eye[2];
    return [Math.atan2(dz, dx), Math.atan2(e.y + up - eye[1], Math.hypot(dx, dz))];
  };
  let err = 9;
  let td = 0;
  if (target) {
    if (b.fighting !== target.id) {
      // (a new one: is it news to the side? a contact called, with how many are with them)
      b.aimHead = w.rand() < L.head;
      const known = w.pic.known.get(target.id);
      const near = seen.filter((e) => Math.hypot(e.x - target!.x, e.z - target!.z) < 12);
      if (!known || w.t - known.at > 6) {
        const area = placeAt(k, target.x, target.z, target.y);
        const contacts = near.map((e) => ({ id: e.id, x: e.x, y: e.y, z: e.z, at: w.t, seen: true }));
        const sniper = w.m.players.get(target.id)?.primary === "sniper";
        out.calls.push({ c: sniper ? { k: "sniper", area } : { k: "contact", n: near.length, area }, contacts });
        if (w.m.players.get(target.id)?.bomb) out.calls.push({ c: { k: "bomb", area }, contacts });
      }
    }
    b.fighting = target.id;
    td = Math.hypot(target.x - b.feet.x, target.z - b.feet.z);
    b.fightD = td;
    const [ty, tp] = tAim(target);
    // (surprise: it wasn't looking their way; expected: its side had them called there)
    const off = offView(b.aim.yaw, b.feet.x, b.feet.z, target.x, target.z);
    const area = k.areaOf[nodeNear(g, target.x, target.z, target.y)] ?? -1;
    // (expected: they were called there lately; or it's the door its spot watches and they came through it)
    const o0 = b.order;
    const atDoor =
      !!o0?.watch &&
      b.holdStill &&
      Math.abs(
        wrap(
          Math.atan2(o0.watch[2] - b.feet.z, o0.watch[0] - b.feet.x) -
            Math.atan2(target.z - b.feet.z, target.x - b.feet.x),
        ),
      ) < 0.35;
    const expected = atDoor || (area >= 0 && w.t - w.pic.calledAt[area] < 10);
    acquire(b.aim, L, target.id, ty, tp, off > 1 ? 1.55 : expected ? 0.8 : 1, now, w.rand);
    err = track(b.aim, L, ty, tp, now, dt, w.rand);
  } else if (b.fighting) {
    b.fighting = "";
    letGo(b.aim);
  }
  // ── a reload: empty, or low with nobody about ──
  const mag = gun ? MAG[gun] : 0;
  if (gun && now >= b.reloadTo && b.reloading) {
    b.reloading = false;
    b.loaded = mag;
  }
  if (gun && !b.reloading && (b.loaded <= 0 || (!target && b.loaded < mag * 0.4 && !recent(b, w.t, 2.5)))) {
    b.reloading = true;
    b.reloadTo = now + RELOAD_S[gun];
    // (said only mid-fight, with a teammate near to cover)
    if (target && w.mates.some((q) => Math.hypot(q.x - b.feet.x, q.z - b.feet.z) < 15))
      out.calls.push({ c: { k: "reload" } });
  }
  // ── the shot ──
  // (carrying a hostage: a person's pace with one, the match's 0.6)
  const max = (gun ? speedWith(gun as StrikeGun) : speedWith(null)) * (me.carry >= 0 ? 0.6 : 1);
  const speed = Math.hypot(b.feet.vx, b.feet.vz);
  // (in its gun's reach: past it, a fight's pointless — it keeps to its order, its eyes on them)
  const engage = !!target && !!gun && td <= ARMS[gun].range * 0.95;
  if (target && gun && engage && !b.reloading && now >= b.aim.reactAt && b.loaded > 0) {
    const half = Math.atan2(0.3, Math.max(1, td));
    const still = speed <= max * 0.34 || td < 5 || !L.counter;
    const onIt = err < half * L.trigger;
    // (a teammate on the line: hold)
    const mateOnLine = w.mates.some((q) => {
      const dq = Math.hypot(q.x - b.feet.x, q.z - b.feet.z);
      return (
        dq < td &&
        Math.abs(wrap(Math.atan2(q.z - b.feet.z, q.x - b.feet.x) - b.aim.yaw)) < Math.atan2(0.5, Math.max(1, dq))
      );
    });
    if (isCharged(gun) && onIt && still && !mateOnLine) {
      if (!b.aim.chargeAt) b.aim.chargeAt = now;
    } else if (isCharged(gun)) b.aim.chargeAt = 0;
    const charged =
      !isCharged(gun) || (b.aim.chargeAt > 0 && now - b.aim.chargeAt >= (ARMS.daybreak as { charge: number }).charge);
    if (onIt && still && !mateOnLine && charged && ready(b.aim, L, gun, td, now)) {
      const bodies: Body[] = [...w.enemies, ...w.mates.filter((q) => q.id !== me.id)];
      const shots = fire(
        map,
        b.aim,
        gun,
        eye,
        { speed, crouch: b.crouch, aimed: td > 8 && speed < max * 0.34 },
        bodies,
        now,
        w.rand,
      );
      // (friendly fire's the match's to rule on; a bot never means it — its own side's hits dropped)
      const mateIds = new Set(w.mates.map((q) => q.id));
      out.shots.push(...shots.map((s) => (mateIds.has(s.victim) ? { ...s, victim: "", dmg: 0 } : s)));
      b.loaded--;
      b.aim.chargeAt = 0;
    }
  }
  // ── decide (5 a second): what to do, where to go, where to look ──
  if (now >= b.decideAt) {
    b.decideAt = now + 0.2;
    decide(b, w, out, engage);
  }
  // ── the throw under way: stopped, turned, thrown ──
  if (b.throwing && !target) {
    const l = b.throwing;
    turnTo(b.aim, l.yaw, l.pitch, L.turn * 0.7, dt);
    if (
      now - b.throwSince > 0.35 &&
      Math.abs(wrap(b.aim.yaw - l.yaw)) < 0.04 &&
      Math.abs(b.aim.pitch - l.pitch) < 0.04
    ) {
      const kind = l.kind === "molotov" ? (w.team === "w" ? "incendiary" : "molotov") : l.kind;
      const i = me.nades.indexOf(kind as never);
      if (i >= 0) {
        me.nades.splice(i, 1);
        out.throws.push({
          kind: l.kind,
          eye: [b.feet.x, b.feet.y + 1.55, b.feet.z],
          yaw: l.yaw,
          pitch: l.pitch,
          short: l.short,
        });
      }
      b.throwing = null;
      if (b.order?.throws) b.order.throws = b.order.throws.filter((q) => q !== l);
    }
  }
  // ── the feet ──
  let gait: Gait = { mode: "run", max };
  b.crouch = false;
  if (b.using) gait = { mode: "crouch", max };
  else if (target && engage) {
    // a fight's feet: Easy walks on into it; the rest stop to shoot (counter-strafing), strafe while the aim settles at
    // close and middle range, crouch to shoot far, step back to cover to reload — and a holder alone against two or
    // more falls back out of their sight to wait for help (CS's: don't die at your spot, play for the retake)
    const sniper = gun ? isScoped(gun) : false;
    const holder = b.order?.kind === "hold" || b.order?.kind === "post";
    const alone = !w.mates.some((q) => Math.hypot(q.x - b.feet.x, q.z - b.feet.z) < 12);
    if (holder && L.cover && alone && seen.length >= 3 && now >= b.fallTo) {
      b.fallTo = now + 6;
      b.coverNode = coverNear(b, w, target, 7);
    }
    if (now < b.fallTo && b.coverNode >= 0) {
      const [cx, , cz] = nodePos(g, b.coverNode);
      const d = Math.hypot(cx - b.feet.x, cz - b.feet.z);
      gait =
        d > 0.4
          ? { mode: "run", max, side: [(cx - b.feet.x) / d, (cz - b.feet.z) / d] }
          : { mode: "stop", max, counter: true };
    } else if (b.reloading && L.cover) {
      if (b.coverNode < 0) b.coverNode = coverNear(b, w, target);
      if (b.coverNode >= 0) {
        const [cx, , cz] = nodePos(g, b.coverNode);
        const d = Math.hypot(cx - b.feet.x, cz - b.feet.z);
        gait =
          d > 0.4
            ? { mode: "run", max, side: [(cx - b.feet.x) / d, (cz - b.feet.z) / d] }
            : { mode: "stop", max, counter: true };
      } else gait = { mode: "stop", max, counter: true };
    } else if (!L.counter) gait = { mode: "run", max };
    else if (L.strafe && !sniper && td > 4 && td < 24 && err > Math.atan2(0.3, td) * L.trigger * 1.4) {
      if (now > b.strafeTo) {
        b.strafe = b.strafe >= 0 ? -1 : 1;
        b.strafeTo = now + 0.35 + w.rand() * 0.3;
      }
      const a = b.aim.yaw + (Math.PI / 2) * b.strafe;
      gait = { mode: "run", max, side: [Math.cos(a), Math.sin(a)] };
    } else {
      gait = { mode: "stop", max, counter: true };
      b.crouch = td > 14 && (L.strafe || sniper) && speed < 1;
    }
  } else if (now < b.fallTo && b.coverNode >= 0) {
    // (fallen back: held there, out of their sight, till help's near or the time's up)
    const [cx, , cz] = nodePos(g, b.coverNode);
    const d = Math.hypot(cx - b.feet.x, cz - b.feet.z);
    gait =
      d > 0.4
        ? { mode: "run", max, side: [(cx - b.feet.x) / d, (cz - b.feet.z) / d] }
        : { mode: "stop", max, counter: true };
    if (w.mates.some((q) => Math.hypot(q.x - b.feet.x, q.z - b.feet.z) < 10)) b.fallTo = 0;
  } else {
    b.coverNode = -1;
    // (a teammate within 4.2 m ahead the way it's going: it gives way — a column, not a crowd; one spray doesn't
    // find two of them, plan 117's balance pass)
    const [hx, hz] = heading(b.feet, g);
    const gap = 4.2;
    const crowd =
      (hx || hz) &&
      w.mates.some((q) => {
        const dx = q.x - b.feet.x;
        const dz = q.z - b.feet.z;
        const d = Math.hypot(dx, dz);
        return d < gap && d > 0.05 && (dx * hx + dz * hz) / d > 0.55 && Math.abs(q.y - b.feet.y) < 1.5;
      });
    if (b.throwing) gait = { mode: "stop", max, counter: true };
    else if (crowd && !b.holdStill) gait = { mode: "walk", max };
    else if (b.holdStill) gait = { mode: "stop", max, counter: true };
    else if (b.quiet) gait = { mode: "walk", max };
    b.crouch = b.holdStill && b.holdCrouch;
  }
  if (b.using) b.crouch = true;
  gait.tagged = now - b.hurtAt < 0.4 ? 0.4 : 0;
  stepFeet(b.feet, g, gait, dt, now);
  // stuck: a new path; long stuck, a step anywhere
  if (b.feet.stuck > 1.2 && b.feet.to >= 0) {
    const to = b.feet.to;
    goTo(b.feet, g, to);
    b.feet.stuck = 0;
  }
  // footsteps (running is heard; walking and crouching aren't)
  const sp = Math.hypot(b.feet.vx, b.feet.vz);
  if (sp > max * 0.6 && now >= b.stepAt) {
    b.stepAt = now + 0.34;
    out.step = true;
  }
  // ── the look when it's on nobody: what it decided (a corner, a sound, what its spot watches), else the way ──
  if (!target && !b.throwing) {
    let ly: number;
    let lp: number;
    if (b.look) {
      const [x, y, z] = b.look;
      ly = Math.atan2(z - eye[2], x - eye[0]);
      lp = Math.atan2(y - eye[1], Math.hypot(x - eye[0], z - eye[2]));
    } else {
      const [hx, hz] = heading(b.feet, g);
      ly = hx || hz ? Math.atan2(hz, hx) : b.aim.yaw;
      lp = -0.05;
    }
    turnTo(b.aim, ly, lp, L.turn * (b.look ? 0.75 : 0.5), dt);
    // (a corner looked at a moment, nobody there: checked; the area clear)
    if (b.look && b.lookIdx >= 0 && Math.abs(wrap(b.aim.yaw - ly)) < 0.12) {
      if (now - b.lookSince > 0.4) {
        b.checked.set(b.lookIdx, w.t);
        const dz = k.dangers[w.team][b.lookIdx];
        if (dz) picClear(w.pic, dz.area, w.t);
        b.lookIdx = -1;
        b.look = null;
      }
    } else if (b.look) b.lookSince = now;
  }
  // ── hands: plant, defuse, the charge picked up, a hostage taken ──
  out.use = b.using;
}

/** Whether it's had an enemy in mind within `s` seconds. */
function recent(b: BotState, t: number, s: number): boolean {
  for (const c of b.mem.values()) if (t - c.at < s) return true;
  return false;
}

/** A node within 4 m that the target's eye can't see its chest at (cover to reload behind), or −1. */
function coverNear(b: BotState, w: World, e: Who, reach = 3.4): number {
  const g = w.k.g;
  const eye: [number, number, number] = [e.x, e.y + EYE, e.z];
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  for (const r of [1.2, 2.2, 3.4, 5, 7].filter((q) => q <= reach))
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const x = b.feet.x + Math.cos(a) * r;
      const z = b.feet.z + Math.sin(a) * r;
      const n = nodeNear(g, x, z, b.feet.gy);
      if (n < 0) continue;
      const [nx, ny, nz] = nodePos(g, n);
      if (Math.abs(ny - b.feet.gy) > 0.6) continue;
      if (!walkClear(g, b.feet.x, b.feet.gy, b.feet.z, nx, nz)) continue;
      if (clear(w.m.map, eye, [nx, ny + CHEST, nz])) continue;
      const d = Math.hypot(nx - b.feet.x, nz - b.feet.z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
  return best;
}

/** The decision: the order done (its route, its stage, its spot), a trade, a sound turned to, the corners checked, a
 *  throw begun, plant and defuse. */
function decide(b: BotState, w: World, out: Out, fighting: boolean) {
  const { k, me, L } = w;
  const g = k.g;
  const o = b.order;
  const ch = w.m.charge;
  b.holdStill = false;
  b.holdCrouch = false;
  b.using = false;
  b.quiet = !!o?.quiet;
  b.look = b.lookIdx >= 0 ? b.look : null;
  if (!o) return;
  const at = (n: number | undefined, r = 1) => {
    if (n === undefined || n < 0) return true;
    const [x, y, z] = nodePos(g, n);
    return Math.hypot(x - b.feet.x, z - b.feet.z) <= r && Math.abs(y - b.feet.gy) < 1.5;
  };
  // ── the hands first: plant, defuse, pick up, a hostage ──
  if (w.team === "r" && me.bomb && w.m.map.sites && !fighting) {
    for (const site of ["A", "B"] as const) {
      const r = w.m.map.sites[site];
      if (!r || !inRect(r, b.feet.x, b.feet.z)) continue;
      const [px, pz] = w.plantSpot(site);
      const there = Math.hypot(px - b.feet.x, pz - b.feet.z) < 1.2;
      // (at its spot; or anywhere on the site late or with enemies about)
      if (there || w.t > 85 || recent(b, w.t, 3)) {
        b.using = true;
        b.holdStill = true;
        if (!b.saidPlant) {
          b.saidPlant = true;
          out.calls.push({ c: { k: "planting" } });
        }
        return;
      }
      if (b.feet.to !== nodeNear(g, px, pz)) goTo(b.feet, g, nodeNear(g, px, pz));
      return;
    }
  }
  if (w.team === "w" && ch?.state === "planted") {
    const d = Math.hypot(ch.x - b.feet.x, ch.z - b.feet.z);
    // (one defuser, chosen the same way by all: of those at the charge, a kit first, then the lowest id — or whoever's
    // already on it)
    const atIt = [me.id, ...w.mates.filter((q) => Math.hypot(ch.x - q.x, ch.z - q.z) < 1.6).map((q) => q.id)];
    const pick =
      ch.defuser && atIt.includes(ch.defuser)
        ? ch.defuser
        : atIt.sort(
            (a, c) => Number(!!w.m.players.get(c)?.kit) - Number(!!w.m.players.get(a)?.kit) || (a < c ? -1 : 1),
          )[0];
    const defuser = d < 1.6 ? pick === me.id : o.role !== "sniper";
    const going = o.kind === "retake" ? o.go : o.kind !== "save";
    const need = (me.kit ? 5 : 10) + 2.5;
    const seenLately = [...b.mem.values()].some((c) => c.seen && w.t - c.at < 1.5);
    if (going && defuser && d < 1.4 && !fighting && (!seenLately || ch.left < need)) {
      b.using = true;
      b.holdStill = true;
      if (!b.saidDefuse) {
        b.saidDefuse = true;
        out.calls.push({ c: { k: "defusing" } });
      }
      return;
    }
  }
  if (w.team === "r" && ch?.state === "dropped" && Math.hypot(ch.x - b.feet.x, ch.z - b.feet.z) < 1.2)
    out.pickup = true;
  // (the Raiders after the plant: a defuse heard — someone at the charge — they go to stop it)
  if (w.team === "r" && ch?.state === "planted" && !fighting && (o.kind === "post" || o.kind === "hold")) {
    const dc = Math.hypot(ch.x - b.feet.x, ch.z - b.feet.z);
    const atIt = [...b.mem.values()].some((c) => w.t - c.at < 2.5 && Math.hypot(c.x - ch.x, c.z - ch.z) < 4);
    const heardDefuse = !!ch.defuser && dc < 26;
    if ((atIt || heardDefuse) && dc > 3) {
      const n = chargeNode(k, ch, b.feet.x, b.feet.z, 2.5, b.feet.gy);
      if (n >= 0 && b.feet.to !== n) goTo(b.feet, g, n);
      b.look = [ch.x, b.feet.y + 1.2, ch.z];
      b.lookIdx = -1;
      return;
    }
  }
  if (w.team === "w" && w.m.map.mode === "hostage" && me.carry < 0) {
    const i = w.m.hostages.findIndex(
      (h) => !h.by && !h.rescued && !h.dead && Math.hypot(h.x - b.feet.x, h.z - b.feet.z) < 2,
    );
    if (i >= 0) out.grab = i;
    // (in the hostages' room, nobody in sight: to the nearest one free — the room's middle isn't where they sit)
    const H = k.goals.H;
    if (
      !fighting &&
      H &&
      Math.hypot(H.x - b.feet.x, H.z - b.feet.z) < 16 &&
      Math.abs(H.y - b.feet.gy) < 2 &&
      (o.kind === "move" || o.kind === "stage")
    ) {
      let best = -1;
      let bd = Number.POSITIVE_INFINITY;
      w.m.hostages.forEach((h, j) => {
        if (h.by || h.rescued || h.dead) return;
        // (one each: not one a teammate's nearer to)
        const mine = Math.hypot(h.x - b.feet.x, h.z - b.feet.z);
        if (w.mates.some((q) => Math.hypot(h.x - q.x, h.z - q.z) < mine - 1)) return;
        if (mine < bd) {
          bd = mine;
          best = j;
        }
      });
      if (best >= 0) {
        const h = w.m.hostages[best];
        const n = nodeNear(g, h.x, h.z, H.y);
        if (n >= 0 && b.feet.to !== n) goTo(b.feet, g, n);
        return;
      }
    }
  }
  const holding = o.kind === "hold" || o.kind === "post";
  // ── a throw on the way: at its lineup's node (a holder's: only once its door's hit — two or more there lately) ──
  if (!fighting && !b.throwing && o.throws?.length && (o.kind !== "stage" || o.go) && (o.kind !== "retake" || o.go)) {
    for (const l of o.throws) {
      const kind = l.kind === "molotov" ? (w.team === "w" ? "incendiary" : "molotov") : l.kind;
      if (!me.nades.includes(kind as never)) continue;
      if (holding) {
        const e = k.entrances[l.door];
        if (!e) continue;
        let near = 0;
        for (const c of [...b.mem.values(), ...w.pic.known.values()])
          if (w.t - c.at < 5 && Math.hypot(c.x - e.x, c.z - e.z) < 22) near++;
        if (near < 2) continue;
      }
      if (Math.hypot(l.x - b.feet.x, l.z - b.feet.z) < 1.3) {
        b.throwing = l;
        b.throwSince = w.now;
        return;
      }
    }
  }
  // ── a trade: a teammate fell near, a moment ago — to where their killer was ──
  const f = w.fell;
  if (!fighting && f && w.t - f.at < 4 && b.tradeOf !== f.at && o.kind !== "save") {
    b.tradeOf = f.at;
    const d = Math.hypot(f.x - b.feet.x, f.z - b.feet.z);
    const anchor = o.role === "anchor" || o.role === "sniper";
    if (d < (anchor ? 12 : 22) && d > 2 && w.rand() < L.trade) {
      const tx = f.kx ?? f.x;
      const tz = f.kz ?? f.z;
      b.tradeTo = w.t + 4;
      goTo(b.feet, g, nodeNear(g, f.x, f.z));
      b.look = [tx, b.feet.y + 1.6, tz];
      b.lookIdx = -1;
      return;
    }
  }
  if (w.t < b.tradeTo) return;
  // ── a sound turned to (heard, not seen, in the last 3 s, near) — a holder only to what's toward its door or close ──
  let heard: Contact | null = null;
  const wy = o.watch ? Math.atan2(o.watch[2] - b.feet.z, o.watch[0] - b.feet.x) : 0;
  for (const c of b.mem.values()) {
    if (c.seen || w.t - c.at >= 3) continue;
    const d = Math.hypot(c.x - b.feet.x, c.z - b.feet.z);
    if (d >= 25) continue;
    if (holding && o.watch && d > 9 && Math.abs(wrap(Math.atan2(c.z - b.feet.z, c.x - b.feet.x) - wy)) > 1.2) continue;
    if (!heard || c.at > heard.at) heard = c;
  }
  // (two or more heard lately and not seen: said — the side's picture gets them)
  const fresh = [...b.mem.values()].filter(
    (c) => !c.seen && w.t - c.at < 4 && Math.hypot(c.x - b.feet.x, c.z - b.feet.z) < 30,
  );
  if (fresh.length >= 2 && w.t - b.heardSaid > 10) {
    b.heardSaid = w.t;
    const mx = fresh.reduce((s, c) => s + c.x, 0) / fresh.length;
    const mz = fresh.reduce((s, c) => s + c.z, 0) / fresh.length;
    out.calls.push({ c: { k: "heard", n: fresh.length, area: placeAt(k, mx, mz, b.feet.y) }, contacts: fresh });
  }
  // ── the order ──
  const hold = (n: number | undefined, watch: [number, number, number] | undefined) => {
    if (n === undefined || n < 0) return;
    if (!at(n, 0.9)) {
      if (b.feet.to !== n) goTo(b.feet, g, n);
      return;
    }
    b.holdStill = true;
    b.holdCrouch = (L.counter && !!watch && Math.hypot(watch[0] - b.feet.x, watch[2] - b.feet.z) > 14) || false;
    if (watch) {
      b.look = watch;
      b.lookIdx = -1;
    }
  };
  const onRoute = () => {
    if (!o.route) return;
    if (b.routeOf !== o) {
      b.routeOf = o;
      follow(b.feet, g, o.route.nodes);
    }
  };
  switch (o.kind) {
    case "move":
    case "carry":
    case "save":
    case "pickup": {
      if (o.route) onRoute();
      else if (o.to !== undefined && b.feet.to !== o.to) goTo(b.feet, g, o.to);
      // in: the objective reached — a spot of the post's, apart from the others (the Raiders on a site, before the
      // plant: each its own corner, not the middle)
      if (o.kind === "move" && o.goal && o.route && arrived(b.feet, g, 2.5)) {
        if (!b.postSpot || b.postOf !== o) {
          b.postOf = o;
          const taken = w.mates.map((q) => q.id);
          void taken;
          const s = k.spots
            .filter(
              (q) => q.to === o.goal && q.team === w.team && (q.kind === "post" || q.team === k.holds[o.goal as "A"]),
            )
            .sort((p, q) => Math.hypot(p.x - b.feet.x, p.z - b.feet.z) - Math.hypot(q.x - b.feet.x, q.z - b.feet.z))
            .find((s) => !w.mates.some((q) => q.id !== me.id && Math.hypot(q.x - s.x, q.z - s.z) < 3));
          b.postSpot = s ?? null;
        }
        if (b.postSpot) hold(b.postSpot.node, [b.postSpot.wx, b.postSpot.wy + 1.3, b.postSpot.wz]);
        else b.holdStill = true;
      }
      if ((o.kind === "save" || o.kind === "pickup") && arrived(b.feet, g, 1.5)) b.holdStill = true;
      break;
    }
    case "stage":
    case "retake": {
      if (!o.go && o.stage !== undefined) {
        if (!at(o.stage, 1.5)) {
          if (o.route && b.routeOf !== o) {
            b.routeOf = o;
            b.routeGo = false;
            const i = o.route.nodes.indexOf(o.stage);
            follow(b.feet, g, i > 0 ? o.route.nodes.slice(0, i + 1) : o.route.nodes);
          } else if (!o.route && b.feet.to !== o.stage) goTo(b.feet, g, o.stage);
        } else {
          b.holdStill = true;
          // (staged: watching the way in)
          if (o.route) {
            const i = o.route.nodes.indexOf(o.stage);
            const [x, y, z] = nodePos(g, o.route.nodes[Math.min(o.route.nodes.length - 1, i + 30)]);
            b.look = [x, y + 1.5, z];
            b.lookIdx = -1;
          }
        }
      } else if (o.kind === "retake" && ch?.state === "planted") {
        const n = chargeNode(k, ch, b.feet.x, b.feet.z, 0, b.feet.gy);
        if (b.feet.to !== n) goTo(b.feet, g, n);
      } else if (o.route) {
        if (b.routeOf !== o || b.routeGo !== o.go) {
          b.routeOf = o;
          b.routeGo = !!o.go;
          follow(b.feet, g, o.route.nodes);
        }
        if (o.goal && arrived(b.feet, g, 2.5)) {
          const s = k.spots
            .filter((q) => q.to === o.goal && q.team === w.team)
            .sort((p, q) => Math.hypot(p.x - b.feet.x, p.z - b.feet.z) - Math.hypot(q.x - b.feet.x, q.z - b.feet.z))
            .find((s) => !w.mates.some((q) => q.id !== me.id && Math.hypot(q.x - s.x, q.z - s.z) < 3));
          if (s) hold(s.node, [s.wx, s.wy + 1.3, s.wz]);
          else b.holdStill = true;
        }
      }
      break;
    }
    case "hold":
    case "post":
      hold(o.spot?.node ?? o.to, o.watch);
      break;
    case "follow":
    case "escort": {
      const who = [...w.mates, ...w.enemies].find((q) => q.id === o.who);
      if (!who) break;
      // (behind them and to a side, apart from the others following)
      const i = Number(me.id.slice(-1)) || 0;
      const a = Math.atan2(who.vz, who.vx) + Math.PI + (i % 2 ? 0.6 : -0.6);
      const sp = Math.hypot(who.vx, who.vz);
      const r = 4.5 + (i % 3) * 1.5;
      const tx = who.x + (sp > 0.5 ? Math.cos(a) : Math.cos(i)) * r;
      const tz = who.z + (sp > 0.5 ? Math.sin(a) : Math.sin(i)) * r;
      const n = nodeNear(g, tx, tz, who.y);
      if (Math.hypot(tx - b.feet.x, tz - b.feet.z) < 1.5) b.holdStill = true;
      else if (n >= 0 && (b.feet.to < 0 || w.now - b.repathAt > 0.7)) {
        b.repathAt = w.now;
        goTo(b.feet, g, n);
      }
      break;
    }
    case "hunt": {
      // where they were last known; else a place they're likely; a few seconds held there
      let tgt: Contact | null = null;
      for (const c of [...b.mem.values(), ...w.pic.known.values()])
        if (w.t - c.at < 8 && (!tgt || c.at > tgt.at)) tgt = c;
      if (w.now >= b.huntTo || (tgt && b.huntOf !== tgt.id)) {
        b.huntTo = w.now + 6 + w.rand() * 5;
        let n: number;
        if (tgt) {
          b.huntOf = tgt.id;
          n = nodeNear(g, tgt.x, tgt.z, tgt.y);
        } else {
          const a = k.areas[Math.floor(w.rand() * k.areas.length)];
          n = a.mid;
        }
        if (n >= 0) goTo(b.feet, g, n);
      }
      if (arrived(b.feet, g, 1.5)) b.holdStill = true;
      break;
    }
  }
  // ── quiet near where they likely are (not on a rush; not once in) ──
  const myArea = k.areaOf[nodeNear(g, b.feet.x, b.feet.z, b.feet.gy)] ?? -1;
  if (
    L.quiet &&
    !b.holdStill &&
    o.kind !== "save" &&
    w.side.play !== "rush" &&
    !(o.kind === "stage" && o.go) &&
    myArea >= 0
  ) {
    if (w.pic.threat[myArea] > 0.55 && w.t > 8) b.quiet = true;
  }
  if (o.kind === "move" && w.side.play === "rush") b.quiet = false;
  // ── where to look: a sound; what its spot watches (set above); else the next corner unchecked ──
  if (heard) {
    b.look = [heard.x, heard.y + 1.5, heard.z];
    b.lookIdx = -1;
    return;
  }
  if (b.holdStill && b.look) return;
  if (L.prefire || w.rand() < 0.85) checkCorners(b, w);
}

/** The next corner to check on the way: the other side's places in reach and in view, ahead, not checked lately —
 *  the likeliest first. */
function checkCorners(b: BotState, w: World) {
  const { k } = w;
  const list = k.dangers[w.team];
  const [hx, hz] = heading(b.feet, k.g);
  const moving = hx || hz;
  const eye: [number, number, number] = [b.feet.x, b.feet.y + EYE, b.feet.z];
  if (b.lookIdx >= 0 && b.look) return;
  const cand: { i: number; s: number }[] = [];
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    const dist = Math.hypot(d.x - b.feet.x, d.z - b.feet.z);
    if (dist < 4 || dist > 32) continue;
    if (w.t - (b.checked.get(i) ?? -99) < 12) continue;
    if (moving) {
      const a = Math.atan2(d.z - b.feet.z, d.x - b.feet.x);
      if (Math.abs(wrap(a - Math.atan2(hz, hx))) > 1.75) continue;
    }
    const threat = d.area >= 0 ? w.pic.threat[d.area] : 0.3;
    if (threat < 0.05) continue;
    cand.push({ i, s: threat * 2 - dist / 32 });
  }
  cand.sort((a, c) => c.s - a.s);
  for (const { i } of cand.slice(0, 5)) {
    const d = list[i];
    if (!clear(w.m.map, eye, [d.x, d.y + 1.5, d.z])) continue;
    b.look = [d.x, d.y + 1.5, d.z];
    b.lookIdx = i;
    b.lookSince = w.now;
    return;
  }
}

/** A node to stand at by the charge: `off` m out from it toward (fx, fz), on its site's floor — not the top of
 *  whatever it was dropped on (Boathouse's boats on their trestles: nobody gets up there). */
function chargeNode(
  k: Know,
  ch: { x: number; z: number; site?: string },
  fx: number,
  fz: number,
  off: number,
  y: number,
): number {
  const d = Math.hypot(fx - ch.x, fz - ch.z) || 1;
  const fy = (ch.site ? k.goals[ch.site as "A"]?.y : undefined) ?? y;
  const x = ch.x + ((fx - ch.x) / d) * off;
  const z = ch.z + ((fz - ch.z) / d) * off;
  // (the nearest cell with ground at that floor: a cell under a boat has only the boat's top)
  for (let r = 0; r <= 8; r++)
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const n = nodeAt(k.g, x + di * CELL, z + dj * CELL, fy);
        if (n >= 0 && Math.abs(k.g.hs[n] - fy) < 1.2) return n;
      }
  return nodeNear(k.g, x, z, fy);
}
