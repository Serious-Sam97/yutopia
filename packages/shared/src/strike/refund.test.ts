// (plan 118) Refunds in the buy time: each buy taken back as it was — and never the older armour first, which put
// the armour back on with all the money returned (the double check, 2026-11-23).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buy, join, newMatch, refund, startMatch } from "./match.ts";

const made = () => {
  const m = newMatch("sawmill", "competitive");
  const p = join(m, "a", "A", 0);
  startMatch(m);
  p.money = 2000;
  return { m, p };
};
describe("refunds (plan 118)", () => {
  it("kevlar then helmet: the older can't go back first; newest first, it's all as it was", () => {
    const { m, p } = made();
    assert.equal(buy(m, "a", "kevlar", true), null);
    assert.equal(buy(m, "a", "helmet", true), null);
    const spent = p.money;
    assert.notEqual(refund(m, "a", "kevlar", true), null);
    assert.equal(p.money, spent);
    assert.equal(p.armor, 100);
    assert.equal(refund(m, "a", "helmet", true), null);
    assert.equal(refund(m, "a", "kevlar", true), null);
    assert.equal(p.money, 2000);
    assert.equal(p.armor, 0);
    assert.equal(p.helmet, false);
  });
  it("a gun bought and taken back: the money and the slot as they were", () => {
    const { m, p } = made();
    const before = p.primary;
    p.money = 4000;
    assert.equal(buy(m, "a", "ak47", true), null);
    assert.equal(refund(m, "a", "ak47", true), null);
    assert.equal(p.money, 4000);
    assert.equal(p.primary, before);
  });
});

describe("refunds and gifts (the double check 2)", () => {
  it("a gifted helmet on my kevlar: the kevlar can't come back (and take the gift off with it), the gift's not refundable", () => {
    const { m, p } = made();
    assert.equal(buy(m, "a", "kevlar", true), null);
    p.money += 350;
    assert.equal(buy(m, "a", "helmet", true), null);
    const gb = p.bought.at(-1);
    if (gb) gb.gift = true;
    const left = p.money;
    assert.notEqual(refund(m, "a", "kevlar", true), null);
    assert.notEqual(refund(m, "a", "helmet", true), null);
    assert.equal(p.money, left);
    assert.equal(p.helmet, true);
  });
});
