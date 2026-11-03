import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanProps } from "./WorldRoom.ts";

// Words on things (docs/plan/68-more-furniture.md, phase 1): a sign keeps what its face draws, at
// most its length; nothing else keeps words at all.

test("a sign's words: kept as its face draws them, cut to its length; on anything else, gone", () => {
  const sign = cleanProps("marquee_sign", { text: "open late <script>" }, [], 0, 0);
  assert.equal(sign.text, "OPEN LATE");
  assert.equal(cleanProps("marquee_sign", { text: "x".repeat(40) }, [], 0, 0).text, "XXXXXXXXXX");
  assert.equal(cleanProps("vfd_ticker", { text: 7 }, [], 0, 0).text, "");
  // (none given, the sign shows its own)
  assert.equal("text" in cleanProps("split_flap", { variant: 0 }, [], 0, 0), false);
  assert.equal("text" in cleanProps("chair", { text: "HI" }, [], 0, 0), false);
});
