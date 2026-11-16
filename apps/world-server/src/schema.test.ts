/* biome-ignore-all lint/suspicious/noExplicitAny: reads each class's Colyseus metadata */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "@colyseus/schema";
import { SCHEMA_FIELDS } from "@yutopia/shared/worn";
import * as S from "./schema.ts";

// No state class past Colyseus's 64 fields (2026-11-16: the Player at 65 — its 65th, sent, read on every screen
// as "delete field 0": everyone's sid "", and the gun sounds near another player a roar).
test("every state class within Colyseus's 64 fields", () => {
  let seen = 0;
  for (const [name, C] of Object.entries(S)) {
    if (typeof C !== "function" || !(C.prototype instanceof Schema)) continue;
    const meta = (C as any)[Symbol.metadata];
    const n = meta ? Object.keys(meta).filter((k) => /^\d+$/.test(k)).length : 0;
    assert.ok(n <= SCHEMA_FIELDS, `${name}: ${n} fields (Colyseus sends ${SCHEMA_FIELDS})`);
    seen++;
  }
  assert.ok(seen > 10);
});
