import assert from "node:assert/strict";
import { test } from "node:test";
import { biosFits, discRegion, hasBootLogo, relicense } from "./region.ts";

// A disc's region from its licence sector (raw Mode 2, Mode 1, or plain .iso).
const image = (text: string, at: number, size = 6 * 2352) => {
  const b = new Uint8Array(size);
  b.set(new TextEncoder().encode(text), at);
  return new Blob([b]);
};
const LIC = "          Licensed  by          Sony Computer Entertainment ";

test("a disc's region, from its licence sector", async () => {
  const mode2 = 4 * 2352 + 24;
  assert.equal(await discRegion([{ name: "g.bin", blob: image(`${LIC}Amer  ica `, mode2) }]), "NTSC-U");
  assert.equal(await discRegion([{ name: "g.bin", blob: image(`${LIC}Euro pe `, mode2) }]), "PAL");
  assert.equal(await discRegion([{ name: "g.bin", blob: image(`${LIC}Inc.`, mode2) }]), "NTSC-J");
  assert.equal(await discRegion([{ name: "g.iso", blob: image(`${LIC}Amer  ica `, 4 * 2048, 6 * 2048) }]), "NTSC-U");
  // the .cue's first track is the one read (not another .bin)
  const cue = new Blob(['FILE "Game (Track 1).bin" BINARY\r\n  TRACK 01 MODE2/2352\r\n']);
  assert.equal(
    await discRegion([
      { name: "Game.cue", blob: cue },
      { name: "Game (Track 2).bin", blob: image("", 0) },
      { name: "Game (Track 1).bin", blob: image(`${LIC}Euro pe `, mode2) },
    ]),
    "PAL",
  );
  // compressed, or nothing there: unknown
  assert.equal(await discRegion([{ name: "g.chd", blob: new Blob(["MComprHD"]) }]), null);
  assert.equal(await discRegion([{ name: "g.bin", blob: image("", 0) }]), null);
  // a BIOS boots a disc of its own region only
  assert.ok(biosFits("NTSC-U", "NTSC-U"));
  assert.ok(!biosFits("NTSC-J", "NTSC-U"));
  assert.ok(!biosFits("NTSC-U", null));
});

test("a USA disc as a Japanese console takes it (and back); never a European one", async () => {
  const mode2 = 4 * 2352 + 24;
  const us = image(`${LIC}Amer  ica `, mode2);
  const cue = new Blob(['FILE "Game.bin" BINARY\r\n']);
  const files = [
    { name: "Game.cue", blob: cue },
    { name: "Game.bin", blob: us },
  ];
  const jp = await relicense(files, "NTSC-J");
  assert.equal(jp[0], files[0], "the .cue as it was");
  assert.equal(await discRegion(jp), "NTSC-J");
  assert.equal(jp[1].blob.size, us.size, "the same size");
  const a = new Uint8Array(await us.arrayBuffer());
  const b = new Uint8Array(await jp[1].blob.arrayBuffer());
  const changed = [...a.keys()].filter((i) => a[i] !== b[i]);
  assert.ok(changed[0] >= mode2 && (changed.at(-1) ?? 0) < mode2 + 2048, "only the licence sector's data");
  assert.equal((jp[1].blob as File).name, "Game.bin");
  assert.equal(await discRegion(await relicense(jp, "NTSC-U")), "NTSC-U");
  // a European disc stays European; a disc of that region already: as it was
  const eu = [{ name: "g.bin", blob: image(`${LIC}Euro pe `, mode2) }];
  assert.equal(await relicense(eu, "NTSC-J"), eu);
  assert.equal(await relicense(files, "NTSC-U"), files);
});

test("the PlayStation logo's data on the disc (sectors 5–11), or not", async () => {
  const mode2 = 4 * 2352 + 24;
  const bare = image(`${LIC}Amer  ica `, mode2, 12 * 2352);
  assert.equal(await hasBootLogo([{ name: "g.bin", blob: bare }]), false);
  const b = new Uint8Array(await bare.arrayBuffer());
  b[5 * 2352 + 24 + 100] = 7;
  assert.equal(await hasBootLogo([{ name: "g.bin", blob: new Blob([b]) }]), true);
  const iso = new Uint8Array(12 * 2048);
  iso.set(new TextEncoder().encode(`${LIC}Inc.`), 4 * 2048);
  assert.equal(await hasBootLogo([{ name: "g.iso", blob: new Blob([iso]) }]), false);
  iso[5 * 2048 + 3] = 1;
  assert.equal(await hasBootLogo([{ name: "g.iso", blob: new Blob([iso]) }]), true);
});
