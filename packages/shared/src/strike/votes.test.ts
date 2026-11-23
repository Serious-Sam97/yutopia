// (plan 118, phase 17) The team votes: a timeout (now in a freeze, else the next one's), a surrender (every person
// on the side), a bot kicked (most of the side's people); each passes and fails.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { callVote, castVote, join, newMatch, startMatch, tick } from "./match.ts";
import { ROUND, VOTE } from "./rules.ts";

const made = (people: number) => {
  const m = newMatch("sawmill", "competitive");
  for (let i = 0; i < people; i++) join(m, `p${i}`, `P${i}`, 0);
  join(m, "bot:00", "Bot", 0, true);
  join(m, "bot:10", "Bot", 1, true);
  join(m, "q0", "Q0", 1);
  startMatch(m);
  return m;
};
describe("the team votes (plan 118)", () => {
  it("a timeout in the freeze: the freeze longer at once, one fewer left", () => {
    const m = made(1);
    const left = m.left;
    assert.equal(callVote(m, "p0", "timeout"), null);
    assert.equal(m.vote, null);
    assert.equal(m.left, left + ROUND.timeout);
    assert.equal(m.timeouts[0], VOTE.timeouts - 1);
  });
  it("a timeout in the round: the next freeze the longer", () => {
    const m = made(1);
    tick(m, ROUND.freeze + 0.1);
    assert.equal(m.phase, "live");
    callVote(m, "p0", "timeout");
    assert.equal(m.pauseFor[0], true);
    // (the round runs out, then the pause after it)
    tick(m, ROUND.round + 0.1);
    tick(m, ROUND.after + 0.1);
    assert.equal(m.phase, "freeze");
    assert.ok(m.left > ROUND.freeze + ROUND.timeout - 1);
    assert.equal(m.pauseFor[0], false);
  });
  it("the timeouts run out", () => {
    const m = made(1);
    for (let i = 0; i < VOTE.timeouts; i++) assert.equal(callVote(m, "p0", "timeout"), null);
    assert.match(String(callVote(m, "p0", "timeout")), /no timeouts/);
  });
  it("a surrender needs every person on the side; one no fails it", () => {
    const m = made(2);
    callVote(m, "p0", "surrender");
    assert.ok(m.vote);
    castVote(m, "p1", false);
    assert.equal(m.vote, null);
    assert.notEqual(m.phase, "over");
    callVote(m, "p0", "surrender");
    castVote(m, "p1", true);
    assert.equal(m.phase, "over");
    assert.ok(m.events.some((e) => e.e === "over" && e.squad === 1));
  });
  it("a vote not answered closes failed", () => {
    const m = made(3);
    callVote(m, "p0", "surrender");
    assert.ok(m.vote);
    tick(m, VOTE.secs + 0.5);
    assert.equal(m.vote, null);
    assert.notEqual(m.phase, "over");
  });
  it("a bot kicked: off the side, its place left empty; never the other side's, never a person", () => {
    const m = made(1);
    assert.match(String(callVote(m, "p0", "kick", "bot:10")), /only a bot/);
    assert.match(String(callVote(m, "p0", "kick", "p0")), /only a bot/);
    assert.equal(callVote(m, "p0", "kick", "bot:00"), null);
    assert.equal(m.players.has("bot:00"), false);
    assert.deepEqual(m.short, [1, 0]);
  });
  it("another side's person can't vote on it; a bot can't call one", () => {
    const m = made(2);
    callVote(m, "p0", "kick", "bot:00");
    assert.equal(castVote(m, "q0", true), false);
    assert.match(String(callVote(m, "bot:10", "timeout")), /not in the match/);
  });
});
