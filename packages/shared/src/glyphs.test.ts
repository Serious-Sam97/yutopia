import assert from "node:assert/strict";
import { test } from "node:test";
import { CATALOG, type CatalogEntry } from "./catalog.ts";
import { TEXT_DEFAULT, TEXT_FACE } from "./furniture.ts";
import { cleanText, GLYPHS, glyphDots } from "./glyphs.ts";

// Words on things (docs/plan/68-more-furniture.md, phase 1): one 5×7 face, the words kept to what it
// draws, every sign's own words drawable and inside its length.

test("the face: seven rows of five dots for every glyph, the blank one empty", () => {
  for (const [ch, rows] of Object.entries(GLYPHS)) {
    assert.equal(rows.length, 7, ch);
    for (const r of rows) assert.ok(Number.isInteger(r) && r >= 0 && r < 32, `${ch}: ${r}`);
    if (ch !== " ") assert.ok(glyphDots(ch).length > 0, `${ch}: lights something`);
  }
  assert.equal(glyphDots(" ").length, 0);
  // (what it hasn't, a question mark)
  assert.deepEqual(glyphDots("~"), glyphDots("?"));
});

test("cleanText: capitals, only what the face draws, spaces run together, at most its length", () => {
  assert.equal(cleanText("hello, world!", 20), "HELLO, WORLD!");
  assert.equal(cleanText("  café  <b>x</b>  ", 20), "CAF BX/B");
  assert.equal(cleanText("a   b\n\tc", 20), "A B C");
  assert.equal(cleanText("abcdefghijkl", 5), "ABCDE");
  assert.equal(cleanText(42, 5), "");
  assert.equal(cleanText(undefined, 5), "");
});

test("every sign: its words drawable, its default inside its length, its face on its footprint", () => {
  const signs = Object.entries(CATALOG as Record<string, CatalogEntry>).filter(([, e]) => e.text);
  assert.ok(signs.length >= 3);
  for (const [kind, e] of signs) {
    // (a sign says something till it's told otherwise; a stocking's or a present's name is whoever's
    // it is)
    const d = TEXT_DEFAULT[kind] ?? "";
    if (kind !== "stocking" && kind !== "present") assert.ok(d, `${kind}: a default`);
    assert.equal(cleanText(d, e.text ?? 0), d, `${kind}: its default as the face draws it`);
    const f = (TEXT_FACE as Record<string, { x0: number; x1: number; y0: number; y1: number }>)[kind];
    if (f) assert.ok(f.x0 >= 0 && f.x1 <= e.w + 1e-6 && f.x0 < f.x1 && f.y0 < f.y1, `${kind}: its face`);
  }
});
