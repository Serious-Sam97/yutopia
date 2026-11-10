// Plan 75 — the credits against what's built: every person file made from another's work (CC BY 4.0 —
// a credit owed) is credited in public/credits.json (tools/credits.py), names its author in its own
// asset.copyright, and every credit points at a file that exists. Skipped when the people aren't built.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const PUBLIC = join(import.meta.dirname, "../../../public");
const LIFE = join(PUBLIC, "life");
const built = existsSync(join(LIFE, "wear-man"));

type Work = {
  key: string;
  title: string;
  author: string;
  author_url: string;
  source: string;
  license: string;
  license_url: string;
  change: string;
  files: string[];
};
type Credits = {
  hair: Work[];
  people: { title: string; license: string }[];
  sounds: { title: string; author: string; source: string; license: string }[];
  code: { title: string; license: string; source: string; text: string | null }[];
  wardrobe: Record<string, string>;
};

const credits = (): Credits => JSON.parse(readFileSync(join(PUBLIC, "credits.json"), "utf8"));

/** A GLB's glTF JSON (its first chunk). */
function gltf(path: string): { asset: { copyright?: string } } {
  const b = readFileSync(path);
  const len = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + len).toString("utf8"));
}

test("credits: each work by others credited in full", () => {
  const c = credits();
  assert.ok(c.hair.length > 0, "no works listed");
  for (const w of c.hair) {
    for (const k of ["title", "author", "author_url", "source", "license", "license_url", "change"] as const)
      assert.ok(w[k], `${w.key}: no ${k}`);
    assert.match(w.source, /^https:\/\/sketchfab\.com\/3d-models\//, `${w.key}: its source`);
    assert.equal(w.license, "CC BY 4.0", `${w.key}: its licence`);
    assert.ok(w.files.length > 0, `${w.key}: credited but in no file`);
  }
});

test(
  "credits: every file made from a work is credited, and names its author itself",
  { skip: !built && "not built" },
  () => {
    const c = credits();
    const owed = new Map<string, Work>();
    for (const w of c.hair) for (const f of w.files) owed.set(f, w);
    // (the wardrobe's hairs made from a work — by hair.py's WARDROBE_HAIR — all owed)
    for (const [file, from] of Object.entries(c.wardrobe))
      if (c.hair.some((w) => w.key === from)) assert.ok(owed.has(file), `${file}: made from ${from}, not credited`);
    for (const who of ["man", "woman"])
      for (const [file, w] of owed) {
        const path = join(LIFE, `wear-${who}`, `${file}.glb`);
        assert.ok(existsSync(path), `${who}/${file}: credited, not built`);
        const line = gltf(path).asset.copyright ?? "";
        assert.ok(
          line.includes(w.author) && line.includes(w.title),
          `${who}/${file}: its copyright doesn't name ${w.author}`,
        );
      }
  },
);

test("credits: the courtesy groups — people, sounds, code — filled", () => {
  const c = credits();
  assert.ok(c.people.some((p) => p.title === "MakeHuman"));
  assert.ok(c.sounds.length >= 60, `${c.sounds.length} sounds — public/sfx/CREDITS.md lists more`);
  for (const s of c.sounds) assert.match(s.source, /^https:\/\//, `${s.title}: its source`);
  for (const lib of ["three", "react", "JoltPhysics.js (Jolt Physics)"])
    assert.ok(
      c.code.some((x) => x.title === lib && x.license && x.text),
      `${lib}: no licence text`,
    );
});
