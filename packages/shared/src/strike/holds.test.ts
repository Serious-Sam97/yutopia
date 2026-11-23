// (plan 118, the double check 2, 2026-11-23) a mate's fire cut and not counted a hit a tick; your own dropped gun
// not walked back up, none dropped in Deathmatch; a defuser leaving lets go of the charge.
import assert from "node:assert/strict";
import { it } from "node:test";
import { dropGun, hit, join, leave, newMatch, pickGun, startMatch, teamOf, tick } from "./match.ts";
import { NADE } from "./nades.ts";

it("team fire is cut, not rounded up; fire ticks aren't hits", () => {
  const m = newMatch("sawmill", "competitive");
  const a = join(m, "a", "A", 0);
  const b = join(m, "b", "B", 0);
  startMatch(m);
  m.phase = "live";
  if (!m.mode.friendlyFire) {
    console.log("ff off in competitive");
    return;
  }
  assert.equal(teamOf(m, a), teamOf(m, b));
  b.armor = 0;
  const hp = b.hp;
  for (let i = 0; i < 20; i++) hit(m, "a", "b", "molotov", NADE.fire.dps * 0.05, "legs");

  assert.ok(hp - b.hp < 15);
  assert.equal(a.hitsOn.b ?? 0, 0);
});
it("own dropped gun not walked back up; E takes it; DM no drops", () => {
  const m = newMatch("sawmill", "competitive");
  const a = join(m, "a", "A", 0);
  startMatch(m);
  m.phase = "live";
  a.primary = "ak47";
  const id = dropGun(m, a, "ak47", 0, 0, 0)?.id ?? "";
  assert.ok(id);
  assert.equal(pickGun(m, a, id, false), null);
  assert.equal(pickGun(m, a, id, true), "ak47");
  const d = newMatch("sawmill", "deathmatch");
  const q = join(d, "q", "Q", 0);
  startMatch(d);
  q.primary = "ak47";
  assert.equal(dropGun(d, q, "ak47", 0, 0, 0), null);
});
it("a defuser who leaves lets go of the charge", () => {
  const m = newMatch("sawmill", "competitive");
  join(m, "a", "A", 0);
  startMatch(m);
  m.charge = { ...(m.charge ?? {}), state: "planted", defuser: "a", defuseLeft: 3 } as never;
  leave(m, "a");
  assert.equal((m.charge as { defuser?: string } | null)?.defuser, undefined);
});
it("Deathmatch: a respawn starts the buy record again", () => {
  const d = newMatch("sawmill", "deathmatch");
  const q = join(d, "q", "Q", 0);
  startMatch(d);
  q.bought.push({
    item: "kevlar",
    paid: 650,
    before: { primary: null, pistol: null, armor: 0, helmet: false, kit: false },
  });
  q.alive = false;
  q.respawnAt = 0;
  d.phase = "live";
  tick(d, 0.05);
  assert.equal(q.alive, true);
  assert.equal(q.bought.length, 0);
});
