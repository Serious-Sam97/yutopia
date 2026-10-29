import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { CARE, LESSON_MS, XP } from "@yutopia/shared/pets";
import { Client, type Room } from "colyseus.js";

process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 27670 + Math.floor(Math.random() * 100);
let server: { gracefullyShutdown: (exit?: boolean) => Promise<void> };
const rooms: Room[] = [];
let space = 300;

before(async () => {
  const { startWorldServer } = await import("./server.ts");
  server = await startWorldServer(PORT);
});
after(async () => {
  const bounded = <T>(p: Promise<T>) => Promise.race([p, sleep(1000)]);
  await Promise.all(rooms.map((r) => bounded(r.leave(true).catch(() => {}))));
  await bounded(server.gracefullyShutdown(false));
  setTimeout(() => process.exit(process.exitCode ?? 0), 50).unref();
});

interface Person {
  room: Room;
  msgs: Record<string, unknown[]>;
}
async function person(id: number, sandbox: number, roles = "member"): Promise<Person> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox,
    token: `dev:${id}:P${id}:${roles}`,
  });
  rooms.push(room);
  const p: Person = { room, msgs: {} };
  for (const t of ["toast", "pet:event", "pet:challenge", "snap"])
    room.onMessage(t, (m) => {
      if (!p.msgs[t]) p.msgs[t] = [];
      p.msgs[t].push(m);
    });
  await waitFor(() => !!room.state?.players?.get(room.sessionId));
  return p;
}
async function waitFor(fn: () => boolean, ms = 4000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(25);
  }
}
const petsOf = (p: Person) => [...p.room.state.pets.values()].filter((x: S) => x.sid === p.room.sessionId);
type S = Record<string, never> & { [k: string]: never };
const me = (p: Person) => p.room.state.players.get(p.room.sessionId) as S;

test("adopt a platypus: it shows up beside you, follows, and runs after you all the way", async () => {
  const sp = space++;
  const ana = await person(1, sp, "builder"); // (a builder may teleport anywhere)
  ana.room.send("pet:adopt", { species: "platypus", name: "Perry", look: { color: "#5b3a26", mark: "socks" } });
  await waitFor(() => petsOf(ana).length === 1);
  const pet = petsOf(ana)[0];
  assert.equal(pet.species, "platypus");
  assert.equal(pet.name, "Perry");
  assert.equal(JSON.parse(pet.look).mark, "socks");
  assert.ok(Math.hypot(pet.x - me(ana).x, pet.y - me(ana).y) < 5);
  // a second one with a bad look is cleaned; a fourth is refused
  ana.room.send("pet:adopt", { species: "dog", name: "", look: { color: "red" } });
  await waitFor(() => petsOf(ana).length === 2);
  assert.equal(petsOf(ana)[1].name, "Dog");
  ana.room.send("pet:adopt", { species: "cat", name: "Tom" });
  await waitFor(() => petsOf(ana).length === 3);
  ana.room.send("pet:adopt", { species: "parrot", name: "Polly" });
  await waitFor(() => (ana.msgs.toast ?? []).length > 0);
  assert.equal(petsOf(ana).length, 3);
  // far away: it runs after its owner the whole way — never a jump
  const before = { x: me(ana).x, y: me(ana).y };
  ana.room.send("teleport", { to: { x: 33.5, y: 30.5 } }); // the Live Room
  await waitFor(() => Math.hypot(me(ana).x - before.x, me(ana).y - before.y) > 14);
  const last = new Map(petsOf(ana).map((x: S) => [x.id, { x: x.x as number, y: x.y as number }]));
  let jump = 0;
  const watch = setInterval(() => {
    for (const x of petsOf(ana) as S[]) {
      const was = last.get(x.id);
      if (was) jump = Math.max(jump, Math.hypot(x.x - was.x, x.y - was.y));
      last.set(x.id, { x: x.x, y: x.y });
    }
  }, 20);
  try {
    await waitFor(() => petsOf(ana).every((x: S) => Math.hypot(x.x - me(ana).x, x.y - me(ana).y) < 4), 15000);
  } finally {
    clearInterval(watch);
  }
  assert.ok(jump < 2, `a step of ${jump.toFixed(2)} tiles`);
});

test("explore: off round the rooms on its own; follow me brings it back the whole way", async () => {
  const sp = space++;
  const ana = await person(7, sp);
  ana.room.send("pet:adopt", { species: "dog", name: "Scout" });
  await waitFor(() => petsOf(ana).length === 1);
  const id = petsOf(ana)[0].id;
  const pet = () => ana.room.state.pets.get(id) as S;
  ana.room.send("pet:cmd", { id, cmd: "explore" });
  await waitFor(() => pet().mode === "explore");
  // it wanders well away from its owner (who stands still)
  await waitFor(() => Math.hypot(pet().x - me(ana).x, pet().y - me(ana).y) > 9, 20000);
  // and back when called, walking
  ana.room.send("pet:cmd", { id, cmd: "follow" });
  await waitFor(() => pet().mode === "follow");
  let prev = { x: pet().x as number, y: pet().y as number };
  let jump = 0;
  const watch = setInterval(() => {
    jump = Math.max(jump, Math.hypot(pet().x - prev.x, pet().y - prev.y));
    prev = { x: pet().x, y: pet().y };
  }, 20);
  try {
    await waitFor(() => Math.hypot(pet().x - me(ana).x, pet().y - me(ana).y) < 4, 15000);
  } finally {
    clearInterval(watch);
  }
  assert.ok(jump < 2, `a step of ${jump.toFixed(2)} tiles`);
});

test("commands, care and a lesson", async () => {
  const sp = space++;
  const bia = await person(2, sp);
  bia.room.send("pet:adopt", { species: "dog", name: "Rex" });
  await waitFor(() => petsOf(bia).length === 1);
  const id = petsOf(bia)[0].id;
  const pet = () => bia.room.state.pets.get(id) as S;
  bia.room.send("pet:cmd", { id, cmd: "stay" });
  await waitFor(() => pet().mode === "stay");
  bia.room.send("pet:cmd", { id, cmd: "speak" });
  await waitFor(() => pet().say === "call" && pet().sayAt > 0);
  assert.equal(pet().xp, XP.command * 2);
  // a stranger's commands do nothing
  const cid = await person(3, sp);
  cid.room.send("pet:cmd", { id, cmd: "explore" });
  await sleep(200);
  assert.equal(pet().mode, "stay");
  // care by hand: a snack, then the cooldown
  bia.room.send("pet:care", { id, what: "snack" });
  await waitFor(() => pet().act === "eat");
  assert.equal(pet().xp, XP.command * 2 + CARE.snack.xp);
  bia.room.send("pet:care", { id, what: "snack" });
  await waitFor(() => (bia.msgs["pet:event"] ?? []).some((e) => (e as { kind: string }).kind === "wait"));
  // a lesson (once the snack's eaten): progress after it, learned after enough of them
  await waitFor(() => pet().act === "", 5000);
  bia.room.send("pet:teach", { id, trick: "sit" });
  await waitFor(() => pet().act === "lesson:sit");
  await waitFor(() => pet().act === "", LESSON_MS + 2000);
  const prog = JSON.parse(pet().tricks).sit;
  assert.ok(prog > 0 && prog < 100, `progress ${prog}`);
  // not learned yet: "do the trick" does nothing; "fetch" isn't a dog's trick to learn either way
  bia.room.send("pet:cmd", { id, cmd: "trick", trick: "sit" });
  await sleep(150);
  assert.equal(pet().act, "");
  // a toy: the ball in hand, thrown ahead, fetched and brought back
  bia.room.send("pet:cmd", { id, cmd: "follow" });
  bia.room.send("toy:take", { toy: "ball" });
  await waitFor(() => me(bia).held === "ball");
  const at = { x: me(bia).x, y: me(bia).y };
  bia.room.send("toy:throw", { x: at.x + 4, y: at.y });
  await waitFor(() => bia.room.state.toys.size === 1);
  const toy = () => [...bia.room.state.toys.values()][0] as S;
  assert.equal(toy().kind, "ball");
  assert.equal(me(bia).held, "");
  assert.ok(Math.hypot(toy().x - at.x, toy().y - at.y) > 2, "it flew");
  await waitFor(() => toy().state === "floor", 3000);
  await waitFor(() => pet().act === "fetch:go", 3000);
  await waitFor(() => pet().carry === "ball" && toy().state === "mouth", 6000);
  await waitFor(() => pet().carry === "" && toy().state === "floor", 8000);
  assert.ok(Math.hypot(toy().x - me(bia).x, toy().y - me(bia).y) < 1.6, "brought back to my feet");
  assert.ok(pet().xp > XP.command * 3 + CARE.snack.xp, "xp for the fetch");
  // picked up again
  bia.room.send("toy:pick", { id: toy().id });
  await waitFor(() => me(bia).held === "ball");
  assert.equal(bia.room.state.toys.size, 0);
});

test("a throw stops at a wall", async () => {
  const sp = space++;
  const gil = await person(7, sp, "builder");
  gil.room.send("pet:adopt", { species: "dog", name: "Rex" });
  await waitFor(() => petsOf(gil).length === 1);
  // the lobby's north wall runs along the top of row 21: a throw north from
  // (3.5, 22.5) lands this side of it
  gil.room.send("teleport", { to: { x: 3.5, y: 22.5 } });
  await waitFor(() => Math.abs(me(gil).y - 22.5) < 1);
  gil.room.send("toy:take", { toy: "ball" });
  await waitFor(() => me(gil).held === "ball");
  gil.room.send("toy:throw", { x: me(gil).x, y: me(gil).y - 5 });
  await waitFor(() => gil.room.state.toys.size === 1);
  const toy = [...gil.room.state.toys.values()][0] as S;
  assert.ok(toy.y >= 21, `landed at y ${toy.y}, inside the lobby`);
});

test("a battle between two pets: challenge, accept, a round, and the end", async () => {
  const sp = space++;
  const dan = await person(4, sp);
  const eva = await person(5, sp);
  dan.room.send("pet:adopt", { species: "dog", name: "Brutus" });
  eva.room.send("pet:adopt", { species: "cat", name: "Luna" });
  await waitFor(() => petsOf(dan).length === 1 && petsOf(eva).length === 1);
  const a = petsOf(dan)[0].id;
  const b = petsOf(eva)[0].id;
  dan.room.send("pet:challenge", { id: b, mine: a });
  await waitFor(() => (eva.msgs["pet:challenge"] ?? []).length === 1);
  const ch = eva.msgs["pet:challenge"][0] as { battle: string; fromName: string; pet: string; mine: string };
  assert.equal(ch.fromName, "P4");
  assert.equal(ch.pet, a);
  assert.equal(ch.mine, b);
  eva.room.send("pet:answer", { battle: ch.battle, accept: true });
  await waitFor(() => dan.room.state.battles.get(ch.battle)?.phase === "pick");
  const bt = () => dan.room.state.battles.get(ch.battle) as S;
  assert.ok(bt().hpA > 0 && bt().hpB > 0);
  assert.equal(dan.room.state.pets.get(a).battle, ch.battle);
  dan.room.send("pet:move", { battle: ch.battle, move: "attack" });
  eva.room.send("pet:move", { battle: ch.battle, move: "defend" });
  await waitFor(() => bt().phase === "anim");
  const log = JSON.parse(bt().log) as { who: string; move: string; dmg?: number }[];
  assert.ok(log.some((e) => e.who === "a" && e.move === "attack" && e.dmg));
  assert.ok(bt().hpB < bt().maxB);
  // the next round comes round on its own
  await waitFor(() => bt().phase === "pick" && bt().round === 2, 5000);
  // eva leaves: the battle ends with nobody winning, Brutus is free again
  await eva.room.leave(true);
  await waitFor(() => !dan.room.state.battles.get(ch.battle));
  assert.equal(dan.room.state.pets.get(a).battle, "");
  assert.equal(petsOf(dan)[0].wins, 0);
});

test("a pet is kept between visits", async () => {
  const sp = space++;
  const fay = await person(6, sp);
  fay.room.send("pet:adopt", { species: "capybara", name: "Capi" });
  await waitFor(() => petsOf(fay).length === 1);
  const id = petsOf(fay)[0].id;
  fay.room.send("pet:care", { id, what: "pet" });
  await waitFor(() => fay.room.state.pets.get(id).xp === CARE.pet.xp);
  fay.room.send("pet:edit", { id, name: "Capivara", outfit: { hat: "crown", coat: "nope" } });
  await waitFor(() => fay.room.state.pets.get(id).name === "Capivara");
  await fay.room.leave(true);
  const again = await person(6, sp);
  await waitFor(() => petsOf(again).length === 1);
  const pet = petsOf(again)[0];
  assert.equal(pet.id, id);
  assert.equal(pet.name, "Capivara");
  assert.equal(pet.xp, CARE.pet.xp);
  assert.equal(JSON.parse(pet.outfit).hat, "crown");
  assert.equal(JSON.parse(pet.outfit).coat, "none");
  again.room.send("pet:release", { id });
  await waitFor(() => petsOf(again).length === 0);
});

test("its mind: hungry with an empty bowl it begs there; filled, it eats; a friend at the door is greeted", async () => {
  const sp = space++;
  const ana = await person(11, sp, "builder");
  const bx = (me(ana).x | 0) + 1;
  const by = me(ana).y | 0;
  ana.room.send("obj:batch", {
    items: [{ id: "t-bowl", kind: "pet_bowl", x: bx, y: by, rot: 0, props: { portions: 0 } }],
  });
  await waitFor(() => !!ana.room.state.objects.get("t-bowl"));
  ana.room.send("pet:adopt", { species: "dog", name: "Rex" });
  await waitFor(() => petsOf(ana).length === 1);
  const id = petsOf(ana)[0].id;
  const pet = () => ana.room.state.pets.get(id) as S;
  const traits = JSON.parse(pet().traits);
  assert.ok(traits.obedience > 0 && traits.obedience <= 1, "traits rolled at adoption");
  assert.equal(pet().want, "");
  // hungry, and the only bowl is empty: a bone on its mind, over to the bowl, and it begs
  ana.room.send("pet:test", { id, needs: { food: 20 } });
  await waitFor(() => pet().want === "bone", 4000);
  await waitFor(() => pet().act === "beg", 4000);
  await waitFor(() => Math.hypot(pet().x - bx - 0.5, pet().y - by - 0.5) < 1.5, 6000);
  await waitFor(() => (ana.msgs["pet:event"] ?? []).some((e) => (e as { kind: string }).kind === "hungry"));
  // filled: it eats, and the bone leaves its mind
  ana.room.send("pet:bowl", { id: "t-bowl" });
  await waitFor(() => pet().act === "eat", 20_000);
  await waitFor(() => pet().food > 20, 10_000);
  // fed and done (a lively one runs a few laps after a meal): nothing on its mind
  ana.room.send("pet:test", { id, needs: { food: 100 } });
  await waitFor(() => pet().want === "" && pet().act === "", 20_000);
  // a friend it knows well comes in: over to greet them
  ana.room.send("pet:test", { id, bonds: { "12": 60 } });
  await waitFor(() => JSON.parse(pet().bonds)["12"] === 60);
  const bia = await person(12, sp);
  try {
    await waitFor(() => String(pet().act).startsWith("greet:") || pet().act === "trick:jump", 8000);
  } catch (e) {
    console.log("greet state", {
      act: pet().act,
      mode: pet().mode,
      bonds: pet().bonds,
      uid: me(bia).uid,
      want: pet().want,
    });
    throw e;
  }
});

test("floors: a pet left behind (told to stay) goes after its owner when called; with them, it comes along", async () => {
  const sp = space++;
  const ana = await person(71, sp, "builder"); // (someone with no pets yet)
  ana.room.send("pet:adopt", { species: "dog", name: "Rex" });
  await waitFor(() => petsOf(ana).length === 1);
  const pet = () => petsOf(ana)[0];
  ana.room.send("pet:cmd", { id: pet().id, cmd: "stay" });
  await waitFor(() => pet().mode === "stay");
  // down to the lobby (the ground floor's corner is at −60, −10 in the studio's)
  ana.room.send("teleport", { to: { x: 72.5, y: 27.5, level: 0 } });
  await waitFor(() => me(ana).level === 0);
  await sleep(3200);
  assert.equal(pet().floor, 4, "it stayed upstairs");
  ana.room.send("pet:cmd", { id: pet().id, cmd: "follow" });
  await waitFor(() => pet().floor === 0, 6000);
  assert.ok(Math.hypot(pet().x - me(ana).x, pet().y - me(ana).y) < 4, "beside its owner down there");
  // and back up together
  ana.room.send("teleport", { to: { x: 16.5, y: 20.5, level: 4 } });
  await waitFor(() => me(ana).level === 4);
  await waitFor(() => pet().floor === 4, 3000);
});

test("its owner gone, it stays: waiting where it was, fed by a friend, theirs again where it is; the room shut and opened, it's back (docs/plan/51-the-pet.md)", async () => {
  const sp = space++;
  const ana = await person(21, sp, "builder");
  const bia = await person(22, sp, "builder");
  ana.room.send("pet:adopt", { species: "dog", name: "Rex" });
  await waitFor(() => petsOf(ana).length === 1);
  const id = petsOf(ana)[0].id;
  const rex = () => bia.room.state.pets.get(id) as S;
  // into the Live Room with her, then she goes
  ana.room.send("teleport", { to: { x: 33.5, y: 30.5 } });
  await waitFor(() => Math.hypot(rex().x - 33.5, rex().y - 30.5) < 4, 15_000);
  const left = { x: rex().x, y: rex().y };
  rooms.splice(rooms.indexOf(ana.room), 1); // (left here: not again at the end)
  await ana.room.leave(true);
  await waitFor(() => rex().sid === "");
  assert.equal(rex().mode, "wait");
  assert.equal(rex().owner, "P21");
  // it waits about the spot (a sniff, a sit), never far from it
  await sleep(2500);
  assert.ok(Math.hypot(rex().x - left.x, rex().y - left.y) < 4.5);
  // her away, anyone near may feed it, not only pet it
  bia.room.send("teleport", { to: { x: rex().x + 1, y: rex().y } });
  await waitFor(() => Math.hypot(me(bia).x - rex().x, me(bia).y - rex().y) < 2.5);
  bia.room.send("pet:care", { id, what: "snack" });
  await waitFor(() => rex().act === "eat");
  // back (where she was): hers again, still waiting
  const again = await person(21, sp, "builder");
  await waitFor(() => rex().sid === again.room.sessionId);
  assert.equal(rex().mode, "wait");
  // told to stay, and off she goes to the lobby, and out
  again.room.send("pet:cmd", { id, cmd: "stay" });
  await waitFor(() => rex().mode === "stay");
  const kept = { x: rex().x, y: rex().y };
  again.room.send("teleport", { to: { x: 6.5, y: 24.5 } });
  await waitFor(() => Math.hypot(me(again).x - 6.5, me(again).y - 24.5) < 2);
  rooms.splice(rooms.indexOf(again.room), 1);
  await again.room.leave(true);
  await waitFor(() => rex().sid === "");
  assert.equal(rex().mode, "stay");
  // back in the lobby: hers, where it is — not jumped to her side; told where
  const fourth = await person(21, sp, "builder");
  await waitFor(() => rex().sid === fourth.room.sessionId);
  assert.ok(Math.hypot(rex().x - kept.x, rex().y - kept.y) < 0.5);
  assert.ok(Math.hypot(rex().x - me(fourth).x, rex().y - me(fourth).y) > 8);
  await waitFor(() =>
    (fourth.msgs.toast ?? []).some((t) =>
      /Rex is waiting where you left it: Live Room/.test((t as { text: string }).text),
    ),
  );
  // everyone gone: the room shuts; opened again, it's back where it was, and hers when she's in
  for (const p of [fourth, bia]) {
    rooms.splice(rooms.indexOf(p.room), 1);
    await p.room.leave(true);
  }
  await sleep(600);
  const third = await person(21, sp, "builder");
  await waitFor(() => petsOf(third).length === 1);
  const back = petsOf(third)[0];
  assert.equal(back.id, id);
  assert.ok(Math.hypot(back.x - kept.x, back.y - kept.y) < 1.5, `at ${back.x},${back.y}, left at ${kept.x},${kept.y}`);
  assert.equal(back.mode, "stay");
  third.room.send("pet:release", { id });
  await waitFor(() => petsOf(third).length === 0);
});

test("dead with its owner away: out of the world, and they're told at their next login", async () => {
  const sp = space++;
  const cai = await person(23, sp);
  const dee = await person(24, sp);
  cai.room.send("pet:adopt", { species: "cat", name: "Mia" });
  await waitFor(() => petsOf(cai).length === 1);
  const id = petsOf(cai)[0].id;
  cai.room.send("pet:test", { id, needs: { food: 0, water: 0, health: 0 } });
  await waitFor(() => (dee.room.state.pets.get(id) as S)?.health === 0);
  rooms.splice(rooms.indexOf(cai.room), 1);
  await cai.room.leave(true);
  await waitFor(() => !dee.room.state.pets.has(id));
  const back = await person(23, sp);
  await waitFor(() => (back.msgs["pet:event"] ?? []).some((e) => (e as { kind: string }).kind === "died"));
  await waitFor(() => petsOf(back).length === 1);
  assert.equal(petsOf(back)[0].alive, false);
  back.room.send("pet:release", { id });
  await waitFor(() => petsOf(back).length === 0);
});
