import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blowOff,
  burnOut,
  DOOR_GONE,
  DOOR_HANG,
  damageString,
  doorSlot,
  FIRE,
  headK,
  hitPane,
  knock,
  mergeDamage,
  noDamage,
  PANE_CRACK,
  PANE_GONE,
  PART,
  paneOf,
  parseDamage,
  shatterAll,
  steamOf,
  steerPull,
  WRECK,
} from "./damage.ts";
import { glassless, holesWithout, mend, nextMend } from "./repair.ts";
import {
  addHole,
  beltOf,
  bodyStruck,
  carAlong,
  claimShot,
  faceOf,
  frontRowEnd,
  levelCar,
  panesOpen,
  parseHoles,
  partAt,
  STARS_IN,
  seatedAlong,
  shotDamage,
  shotWreck,
} from "./shot.ts";
import { SEATS_OF, SEDAN } from "./specs.ts";

test("damage: the old four-zone string still reads; written back the same", () => {
  const d = parseDamage("0.2,0,0,0.5");
  assert.deepEqual(d.zones, [0.2, 0, 0, 0.5, 0]);
  assert.equal(d.parts, 0);
  assert.equal(damageString(d), "0.2,0,0,0.5");
  assert.equal(damageString(noDamage()), "");
  assert.deepEqual(parseDamage("junk").zones, [0, 0, 0, 0, 0]);
});

test("damage: the roof and the parts round-trip; merged only ever more", () => {
  const d = parseDamage("0.3,0,0,0,0.4|18");
  assert.equal(d.parts, 18);
  assert.equal(damageString(d), "0.3,0,0,0,0.4|18");
  const m = mergeDamage(d, { zones: [0.1, 0.9, 0, 0, 0], parts: 4 });
  assert.deepEqual(m.zones, [0.3, 0.5, 0, 0, 0.4], "never less; no more than half at once");
  assert.equal(m.parts, 18 | 4 | PART.bumperHang, "gone is past hanging");
});

test("damage: knocks break what they reach — the bumper, a lamp on its side, the glass", () => {
  const d = noDamage();
  assert.equal(knock(d, 0, 0.2, -0.6), 0, "a light knock dents only");
  const broke = knock(d, 0, 0.2, -0.6);
  assert.ok(broke & PART.bumperHang, "the bumper hangs");
  assert.ok(broke & PART.headL, "the lamp on the side struck");
  assert.ok(!(broke & PART.headR));
  knock(d, 0, 0.3, 0);
  assert.ok(d.parts & PART.bumperGone, "a hard front: the bumper's gone");
  assert.ok(d.parts & PART.screen, "…and the windscreen cracked");
  assert.equal(headK(d, "l"), 0);
  assert.ok(steerPull(d) !== 0, "a bad front pulls the steering");
  assert.ok(steamOf(d) === 0 || d.zones[0] > 0.8);
  knock(d, 0, 0.35, 0);
  assert.ok(steamOf(d) > 0, "steam past 0.8");
  const s = noDamage();
  knock(s, 2, 0.2, 0.5);
  assert.ok(s.parts & PART.mirrorL, "a side scrape folds its mirror");
  knock(s, 2, 0.45, 0);
  assert.ok(s.parts & PART.goneFL, "a hard side shatters the window it struck (ahead of its middle: the front one)");
  assert.ok(!(s.parts & PART.goneFR), "…not the other side's");
  const r = noDamage();
  knock(r, 4, 0.35, 0);
  assert.ok(r.parts & PART.screen, "on its roof: the windscreen gives");
});

test("(plan 94 P3) each pane on its own: struck, it cracks; again, it goes; the windscreen badly first; old saves read", () => {
  const d = noDamage();
  assert.equal(paneOf(d.parts, 2), 0);
  hitPane(d, 2);
  assert.equal(paneOf(d.parts, 2), 1, "a front-left window cracked");
  assert.equal(paneOf(d.parts, 4), 0, "the one behind it whole");
  hitPane(d, 2);
  assert.equal(paneOf(d.parts, 2), 2, "…then gone");
  assert.equal(hitPane(d, 2), 0, "gone: nothing more");
  hitPane(d, 0);
  hitPane(d, 0);
  assert.equal(paneOf(d.parts, 0), 1, "the windscreen: cracked, then badly — still there");
  assert.ok(d.parts & PART.screenBad);
  hitPane(d, 0);
  assert.equal(paneOf(d.parts, 0), 2, "…the third: gone");
  hitPane(d, 1, true);
  assert.equal(paneOf(d.parts, 1), 2, "a hard blow takes the rear window at once");
  // (as its string and back)
  const back = parseDamage(damageString(d));
  assert.equal(back.parts, d.parts);
  // (a car saved before plan 94: a side's windows shattered — both of them gone)
  const old = parseDamage(`0,0,0.6,0|${PART.sideL}`);
  assert.equal(paneOf(old.parts, 2), 2);
  assert.equal(paneOf(old.parts, 4), 2);
  assert.equal(paneOf(old.parts, 3), 0);
  // (the blast: all of it)
  const b = noDamage();
  shatterAll(b);
  for (let i = 0; i < 6; i++) assert.equal(paneOf(b.parts, i as 0), 2);
  // (merged: only ever more)
  const m = mergeDamage(d, { zones: [0, 0, 0, 0, 0], parts: 0 });
  assert.equal(m.parts, d.parts);
});

test("(plan 94 P3) a round picks the pane it came in by: a side's front or rear window by the seats' rows", () => {
  const car = levelCar(0, 0, 0, 0, SEDAN);
  const shoot = (x: number, y: number) => {
    // (from 10 m out on its left, level at the windows' height, straight across)
    const { belt, roof } = beltOf(SEDAN);
    return carAlong({ x, y: -10, z: (belt + roof) / 2 }, { x: 0, y: 1, z: 0 }, car, 30, "ak");
  };
  const split = frontRowEnd(SEDAN);
  assert.ok(Number.isFinite(split), "a sedan has two rows");
  const front = shoot(split + 0.3, 0);
  const rear = shoot(split - 0.3, 0);
  assert.equal(front?.struck, "glass");
  assert.equal(front?.pane, 2, "ahead of the rows' line: its front-left window");
  assert.equal(rear?.pane, 4, "behind it: its rear-left");
  const dm = noDamage();
  if (rear) shotDamage(dm, rear);
  assert.equal(paneOf(dm.parts, 4), 1);
  assert.equal(paneOf(dm.parts, 2), 0);
});

test("(plan 94 P2) wrecked: a door hangs, then comes off; lids sprung, then off; the rear bumper; mirrors; kept and mended", () => {
  const d = noDamage();
  // (its left side, ahead of its middle, struck hard twice: the front-left door hangs, then goes)
  knock(d, 2, 0.3, 0.5);
  knock(d, 2, 0.3, 0.5);
  assert.ok(d.wreck & WRECK.hangFL, "hanging off its lower hinge");
  assert.ok(!(d.wreck & WRECK.goneFL));
  knock(d, 2, 0.3, 0.5);
  assert.ok(d.wreck & WRECK.goneFL, "…then off");
  assert.ok(!(d.wreck & (WRECK.hangFR | WRECK.hangRL)), "not the others");
  assert.ok(d.wreck & WRECK.mirrorLOff, "its mirror struck off");
  // (behind its middle: the rear door)
  const r = noDamage();
  knock(r, 3, 0.35, -0.6);
  knock(r, 3, 0.35, -0.6);
  assert.ok(r.wreck & WRECK.hangRR);
  // (the front: the bonnet sprung, then off; the back: its bumper and the boot lid)
  const f = noDamage();
  knock(f, 0, 0.3, 0);
  knock(f, 0, 0.3, 0);
  assert.ok(f.wreck & WRECK.bonnetLoose);
  assert.ok(!(f.wreck & WRECK.bonnetGone));
  knock(f, 0, 0.35, 0);
  assert.ok(f.wreck & WRECK.bonnetGone, "a wrecked front: the bonnet off");
  const b = noDamage();
  knock(b, 1, 0.32, 0);
  assert.ok(b.wreck & WRECK.bumperRHang, "the rear bumper hanging");
  knock(b, 1, 0.32, 0);
  assert.ok(b.wreck & WRECK.bumperRGone && b.wreck & WRECK.bootLoose);
  // (on the wire and back; an older string reads none)
  const back = parseDamage(damageString(d));
  assert.equal(back.wreck, d.wreck);
  assert.equal(parseDamage(`0.5,0,0,0|${PART.screen}`).wreck, 0);
  // (only ever more)
  assert.equal(mergeDamage(d, { zones: [0, 0, 0, 0, 0], parts: 0, wreck: 0 }).wreck, d.wreck);
  assert.equal(
    mergeDamage(noDamage(), { zones: [0, 0, 0, 0, 0], wreck: WRECK.goneRR }).wreck & WRECK.hangRR,
    WRECK.hangRR,
    "gone hung first",
  );
  // (the blast: doors and lids)
  const x = noDamage();
  blowOff(x);
  for (let i = 0; i < 4; i++) assert.ok(x.wreck & DOOR_GONE[i] && x.wreck & DOOR_HANG[i]);
  assert.ok(x.wreck & WRECK.bonnetGone && x.wreck & WRECK.bootGone);
  // (mended: the panels put it all back)
  assert.equal(nextMend(d, false), "panels");
  assert.equal(mend(d, "panels").dm.wreck, 0);
  // (the doors by their names)
  assert.deepEqual(
    ["door_fl", "door_fr", "door_rl", "door_rr", "door_sr", "door_x"].map(doorSlot),
    [0, 1, 2, 3, 3, -1],
  );
});

test("(plan 94 P4) a round through a car finds who sat in its way: the nearest, by the seat; nobody in an empty seat", () => {
  const car = levelCar(0, 0, 0, 0, SEDAN);
  const S = SEATS_OF[SEDAN.kind];
  // (across the car from its left at the driver's seat's place: chest height, then head height)
  const [u, w] = S.at[0];
  const across = (h: number) => {
    const o = { x: u, y: -10, z: h };
    const d = { x: 0, y: 1, z: 0 };
    const hit = carAlong(o, d, car, 30, "ak");
    return { o, d, hit };
  };
  const chest = across(S.hip[0] + 0.35);
  assert.ok(chest.hit, "it meets the car");
  const all = [0, 1, 2, 3];
  const c = seatedAlong(chest.o, chest.d, car, all, chest.hit?.t ?? 0, chest.hit?.out ?? 0);
  // (the driver sits on its left — the nearer of the front two from that side)
  assert.equal(c?.seat, w < 0 ? 0 : 1, "the nearer front seat");
  assert.equal(c?.head, false);
  const head = across(S.hip[0] + 0.75);
  const hh = seatedAlong(head.o, head.d, car, all, head.hit?.t ?? 0, head.hit?.out ?? 0);
  assert.equal(hh?.head, true, "at the head's height: the head");
  // (only the far seat taken: it's them)
  const far = seatedAlong(chest.o, chest.d, car, [w < 0 ? 1 : 0], chest.hit?.t ?? 0, chest.hit?.out ?? 0);
  assert.equal(far?.seat, w < 0 ? 1 : 0);
  // (nobody in: nobody)
  assert.equal(seatedAlong(chest.o, chest.d, car, [], chest.hit?.t ?? 0, chest.hit?.out ?? 0), null);
  // (through the back seats' line: the front's untouched)
  const back = { x: S.at[2][0], y: -10, z: S.hip[2] + 0.35 };
  const bh = carAlong(back, { x: 0, y: 1, z: 0 }, car, 30, "ak");
  const b = seatedAlong(back, { x: 0, y: 1, z: 0 }, car, [0, 1], bh?.t ?? 0, bh?.out ?? 0);
  assert.equal(b, null, "the front two aren't in the back row's line");
});

test("(plan 94 P1) the fire's stage on the wire; only ever further; burnt out: everything gone; not mended", () => {
  const d = noDamage();
  d.fire = FIRE.smoke;
  assert.equal(parseDamage(damageString(d)).fire, FIRE.smoke, "smoking, on its own");
  assert.equal(mergeDamage(d, { zones: [0, 0, 0, 0, 0] }).fire, FIRE.smoke, "a client's wear never puts it out");
  assert.equal(mergeDamage(d, { zones: [0, 0, 0, 0, 0], fire: FIRE.burning }).fire, FIRE.burning);
  burnOut(d);
  const back = parseDamage(damageString(d));
  assert.equal(back.fire, FIRE.burnt);
  for (let i = 0; i < 6; i++) assert.equal(paneOf(back.parts, i as 0), 2, "its glass gone");
  assert.ok(back.wreck & WRECK.goneFL && back.wreck & WRECK.bonnetGone, "its doors and lids off");
  assert.ok(back.parts & PART.engineDead && back.parts & PART.flatRR, "dead, on its rims");
  assert.equal(nextMend(back, true), null, "nothing to mend: it's towed and made new");
  // (smoke's put out with the engine)
  const sm = noDamage();
  sm.fire = FIRE.smoke;
  sm.parts = PART.engineDead;
  assert.equal(mend(sm, "engine").dm.fire, FIRE.none);
});

test("(plan 95 F1a) the windows wound down by seat: each seat's own pane — its side, its row; none down, none", () => {
  assert.equal(panesOpen(SEDAN, 0), 0);
  // (the driver's on the left in front: FL; beside: FR; behind: RL, RR)
  assert.equal(panesOpen(SEDAN, 1), 1 << 2);
  assert.equal(panesOpen(SEDAN, 2), 1 << 3);
  assert.equal(panesOpen(SEDAN, 4), 1 << 4);
  assert.equal(panesOpen(SEDAN, 8), 1 << 5);
  assert.equal(panesOpen(SEDAN, 1 | 8), (1 << 2) | (1 << 5));
});

test("(plan 95 F4a) a shooter's claim: taken on the car and on the round's line (its point, its normal); off the line, off the car or not a number, not", () => {
  const car = levelCar(0, 0, 0, 0, SEDAN);
  const S = SEDAN;
  // (from 7 m ahead, at a point on its bonnet's top)
  const o = { x: S.body.ahead + 7, y: 0, z: 1.35 };
  const p = { x: S.body.ahead - 0.55, y: 0.1, z: 0.95 };
  const L = Math.hypot(p.x - o.x, p.y - o.y, p.z - o.z);
  const d = { x: (p.x - o.x) / L, y: (p.y - o.y) / L, z: (p.z - o.z) / L };
  const c = { id: "c", u: p.x, w: p.y, h: p.z, f: 0, s: "engine" as const, nu: 0, nw: 0, nh: 100 };
  const got = claimShot(o, d, car, c, 60, "revolver");
  assert.ok(got);
  assert.equal(got.struck, "engine");
  assert.ok(Math.abs(got.t - L) < 1e-6);
  assert.deepEqual(got.n, [0, 0, 1]);
  assert.equal(got.through, false);
  // (a metre off its line)
  assert.equal(claimShot(o, d, car, { ...c, w: -S.body.width / 2, u: 0, h: 0.7 }, 60, "revolver"), null);
  // (off the car)
  assert.equal(claimShot(o, d, car, { ...c, u: S.body.ahead + 1 }, 60, "revolver"), null);
  assert.equal(claimShot(o, d, car, { ...c, h: Number.NaN }, 60, "revolver"), null);
  // (glass with no pane: by its face)
  const g = claimShot(o, d, car, { ...c, s: "glass", f: 0 }, 60, "revolver");
  assert.equal(g?.pane, 0);
  assert.equal(g?.through, true);
  // (what a face and a body hit are)
  assert.equal(faceOf(S, S.body.ahead - 0.5, 0, 0, 1), 0, "the bonnet's top: the front's");
  assert.equal(faceOf(S, 0, 0, 0, 1), 4, "the roof");
  assert.equal(faceOf(S, -S.body.behind + 0.4, 0, 0, 1), 1, "the boot lid: the back's");
  assert.equal(faceOf(S, 0, 0, -1, 0), 2);
  assert.equal(bodyStruck(S, S.body.ahead - 0.5, 0.95, 0), "engine");
  assert.equal(bodyStruck(S, 0, 0.7, 2), "panel");
});

test("(plan 95 F5a) the windscreen stars where each round goes in and stays — badly from the third, in at the fifth; its rounds' points kept with their pane; mended panels keep the glass's, new glass drops them", () => {
  const dm = parseDamage("");
  const base = {
    t: 5,
    out: 7,
    x: 0,
    y: 0,
    z: 1.2,
    u: 1,
    w: 0,
    h: 1.2,
    face: 0 as const,
    struck: "glass" as const,
    which: 0,
    pane: 0 as const,
    through: true,
  };
  let holes = "";
  for (let k = 0; k < STARS_IN; k++) {
    const hit = { ...base, w: -0.4 + k * 0.2, stars: parseHoles(holes).filter((x) => x.pane === 0).length };
    shotDamage(dm, hit);
    holes = addHole(holes, hit);
    if (k < STARS_IN - 1) assert.equal(dm.parts & PART.screenGone, 0, `still in after ${k + 1}`);
  }
  assert.ok(dm.parts & PART.screenGone, "in at the fifth");
  assert.ok(dm.parts & PART.screenBad, "badly before it");
  const list = parseHoles(holes);
  assert.equal(list.length, 5);
  assert.ok(
    list.every((x) => x.pane === 0 && x.n === undefined),
    "its pane, no normal (0,0,0)",
  );
  // (a side window's: cracked, then gone, by hitPane as before)
  const d2 = parseDamage("");
  shotDamage(d2, { ...base, pane: 3, face: 3 });
  assert.ok(d2.parts & PANE_CRACK[3] && !(d2.parts & PANE_GONE[3]));
  shotDamage(d2, { ...base, pane: 3, face: 3 });
  assert.ok(d2.parts & PANE_GONE[3]);
  // (mending: the front's panels keep its glass's points; new glass takes them)
  const mixed = `${holes};10,20,30,0`;
  assert.equal(parseHoles(holesWithout(mixed, 0)).length, 5);
  assert.equal(glassless(mixed), "10,20,30,0");
});

test("(plan 96 F4a) parts shot off by their rounds: the bonnet loose at 4 and off at 8, a door hanging at 5 and off at 10, a bumper at 3 and 6, a mirror off at 1; the part's own holes counted, kept through mending its glass", () => {
  const base = {
    t: 5,
    out: 6,
    x: 0,
    y: 0,
    z: 1,
    u: 1.7,
    w: 0.1,
    h: 0.95,
    face: 0 as const,
    struck: "engine" as const,
    which: 0,
    pane: -1 as const,
    through: false,
  };
  const shoot = (part: "bonnet" | "door_fr" | "bumper_r" | "mirror_l", n: number) => {
    const dm = parseDamage("");
    let holes = "";
    const at: number[] = [];
    for (let k = 0; k < n; k++) {
      holes = addHole(holes, { ...base, part });
      shotWreck(dm, parseHoles(holes), part);
      at.push(dm.wreck);
    }
    return { dm, at, holes };
  };
  const b = shoot("bonnet", 8);
  assert.equal(b.at[2] & WRECK.bonnetLoose, 0, "not loose at 3");
  assert.ok(b.at[3] & WRECK.bonnetLoose, "loose at 4");
  assert.equal(b.at[6] & WRECK.bonnetGone, 0, "on at 7");
  assert.ok(b.at[7] & WRECK.bonnetGone, "off at 8");
  const d = shoot("door_fr", 10);
  assert.ok(!(d.at[3] & DOOR_HANG[1]) && d.at[4] & DOOR_HANG[1], "hanging at 5");
  assert.ok(!(d.at[8] & DOOR_GONE[1]) && d.at[9] & DOOR_GONE[1], "off at 10");
  const r = shoot("bumper_r", 6);
  assert.ok(r.at[2] & WRECK.bumperRHang && !(r.at[4] & WRECK.bumperRGone) && r.at[5] & WRECK.bumperRGone);
  const m = shoot("mirror_l", 1);
  assert.ok(m.dm.wreck & WRECK.mirrorLOff && m.dm.parts & PART.mirrorL, "a mirror off with one");
  // (each hole keeps its part; a part's holes aren't the glass's)
  assert.ok(parseHoles(b.holes).every((x) => x.part === "bonnet" && x.pane === undefined));
  assert.equal(parseHoles(glassless(b.holes)).length, 8, "new glass keeps a part's holes");
  assert.equal(holesWithout(b.holes, 0), "", "mended at its front: gone");
  // (where on the box: a part, else none)
  assert.equal(partAt(SEDAN, SEDAN.body.ahead - 0.5, 0, 0.95, 4), "bonnet");
  assert.equal(partAt(SEDAN, SEDAN.body.ahead, 0, 0.4, 0), "bumper_f");
  assert.equal(partAt(SEDAN, 0, 0, 1.4, 4), null, "the roof");
});
