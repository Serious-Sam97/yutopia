import assert from "node:assert/strict";
import { test } from "node:test";
import * as shared from "@yutopia/shared/npc";
import { biIn, npcLabel } from "./npc-words";

// The client's copies of the cast's word helpers (docs/plan/120-god-mode-npcs.md) agree with shared npc/cast.ts.
test("npc words: the client's copies say what shared's do", () => {
  for (const w of [
    { en: "Race control", pt: "Direção de prova" },
    { en: "Mechanic", pt: "" },
    { en: "", pt: "" },
    { en: "Same", pt: "Same" },
  ]) {
    const s = shared.biOf(w);
    for (const pt of [false, true]) assert.equal(biIn(s, pt), shared.biIn(s, pt));
  }
  for (const [n, r] of [
    ["Rosa", "Race control"],
    ["", "Night guard"],
    ["Maya", ""],
    ["", ""],
  ])
    assert.equal(npcLabel(n, r), shared.npcLabel(n, r));
});
