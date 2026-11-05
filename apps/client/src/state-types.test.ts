import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

// The room's state is typed by the world-server's own schema (docs/plan/72-the-3d-core.md, phase 3):
// `@yutopia/state` is tsconfig's alias for apps/world-server/src/schema.ts — for types only. A value
// import would have the bundler pull the server's schema (and @colyseus/schema's decorators) into
// the page; `import type` is erased.
const SRC = __dirname;
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

test("@yutopia/state is imported for its types only", () => {
  const bad: string[] = [];
  for (const p of files(SRC)) {
    const s = readFileSync(p, "utf8");
    for (const m of s.matchAll(/^import\s+(type\s+)?[^;]*from\s+"@yutopia\/state";/gm))
      if (!m[1]) bad.push(relative(SRC, p));
  }
  assert.deepEqual(bad, []);
});
