import assert from "node:assert/strict";
import { test } from "node:test";

// A public file's URL with its folder's version (docs/plan/89-the-weight.md phase 5).

test("a file and a folder take their folder's version; one with none is asked for as it is", async () => {
  process.env.NEXT_PUBLIC_ASSET_V = JSON.stringify({ "/life": "aaa", "/life/wear-man": "bbb", "/sfx/steps": "ccc" });
  const { asset } = await import("./asset");
  assert.equal(asset("/life/person-man-painted.glb"), "/a/aaa/life/person-man-painted.glb");
  assert.equal(asset("/life/wear-man/hair-afro.glb"), "/a/bbb/life/wear-man/hair-afro.glb");
  assert.equal(asset("/sfx/steps/"), "/a/ccc/sfx/steps/");
  assert.equal(`${asset("/sfx/steps/")}manifest.json`, "/a/ccc/sfx/steps/manifest.json");
  assert.equal(asset("/sfx/other/x.mp3"), "/sfx/other/x.mp3");
  assert.equal(asset("/credits.json"), "/credits.json");
});
