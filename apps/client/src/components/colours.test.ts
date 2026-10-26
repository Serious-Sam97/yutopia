import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import baseline from "./colours-baseline.json";

// The HUD's colours live in globals.css as tokens (docs/plan/45-the-ui.md, phase 1).
// A component uses var(--…), never a hex of its own. What's left is art (pool balls,
// the lift's steel, a wall's swatch, canvas drawing), counted per file in
// colours-baseline.json: a file may lose hex, never gain one. Black and white (with
// any alpha) don't count. Out of scope: the phone (left as it is), /dev pages, icons.

const SRC = join(__dirname, "..");
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const PLAIN = /^#(0{3,4}|0{6}|f{3,4}|f{6})([0-9a-f]{2}|[0-9a-f])?$/i;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return e.name.endsWith(".tsx") ? [p] : [];
  });
}

export function hexCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of [...files(join(SRC, "components")), ...files(join(SRC, "app"))]) {
    const f = relative(SRC, p);
    if (f.includes("/phone/") || f.startsWith("app/dev/") || f.endsWith("icon.tsx")) continue;
    const n = (readFileSync(p, "utf8").match(HEX) ?? []).filter((h) => !PLAIN.test(h)).length;
    if (n) out[f] = n;
  }
  return out;
}

test("no new hard-coded colours in the HUD: use the tokens in globals.css", () => {
  const known = baseline as Record<string, number>;
  const grew = Object.entries(hexCounts())
    .filter(([f, n]) => n > (known[f] ?? 0))
    .map(([f, n]) => `${f}: ${n} (was ${known[f] ?? 0})`);
  assert.deepEqual(grew, [], "a colour of the HUD's belongs in globals.css; art may be added to colours-baseline.json");
});
