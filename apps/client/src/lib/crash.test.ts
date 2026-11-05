import assert from "node:assert/strict";
import { test } from "node:test";
import { type ClientError, isChunkError, reportError, setErrorSink } from "./crash";

// The page's errors (docs/plan/72-the-3d-core.md, phase 1): a chunk that didn't load is told from
// a bug; a bug is reported once per message, the ones before the room's there sent once it is,
// a page load's worth at most.

test("a chunk that didn't load, as webpack, turbopack and the browsers say it", () => {
  const named = new Error("Loading chunk 123 failed.");
  named.name = "ChunkLoadError";
  assert.ok(isChunkError(named));
  assert.ok(isChunkError(new Error("Loading CSS chunk app-pages failed")));
  assert.ok(isChunkError(new Error("Failed to load chunk /_next/static/chunks/abc.js")));
  assert.ok(isChunkError(new TypeError("Failed to fetch dynamically imported module: https://x/y.js")));
  assert.ok(isChunkError(new TypeError("Importing a module script failed.")));
  assert.ok(!isChunkError(new TypeError("Cannot read properties of undefined (reading 'x')")));
  assert.ok(!isChunkError(null));
});

test("reports: held until there's a sink, each message once, at most a page load's worth", () => {
  const got: ClientError[] = [];
  const quiet = console.error;
  console.error = () => {};
  try {
    reportError("window", new Error("before the room"));
    assert.equal(got.length, 0);
    setErrorSink((e) => got.push(e));
    assert.deepEqual(
      got.map((e) => e.message),
      ["before the room"],
    );
    reportError("window", new Error("before the room")); // (the same: not again)
    reportError("hud:Dock", new Error("a broken dock"));
    assert.equal(got.length, 2);
    assert.equal(got[1].where, "hud:Dock");
    for (let i = 0; i < 50; i++) reportError("promise", new Error(`loop ${i}`));
    assert.equal(got.length, 20);
  } finally {
    console.error = quiet;
    setErrorSink(null);
  }
});
