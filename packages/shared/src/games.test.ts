import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { canPlace } from "./build.ts";
import { footprint, type WorldObjectDef } from "./catalog.ts";
import {
  ANALOG_COMBO,
  CABLE_REACH,
  CONSOLES,
  discFits,
  GAME_ID,
  gap,
  hasSticks,
  isConsole,
  isDiscSystem,
  PAD_BITS_MAX,
  PAD_BUTTONS,
  romFits,
  SYSTEMS,
  sticksFit,
  TV_SCREEN,
  turnLocal,
} from "./games.ts";
import { BUILTIN_GAMES, builtinGame, GAME_ROOM_SETUP } from "./library.ts";
import { FLOORS, type MapDef, NO_WALL } from "./map.ts";

const FLOOR = Object.keys(FLOORS)[0];

test("cartridges fit their console by extension and size", () => {
  assert.ok(romFits("nes", "dabg.nes", 32784));
  assert.ok(romFits("md", "game.BIN", 2 * 1024 * 1024));
  assert.ok(!romFits("nes", "game.sfc", 1000), "another console's");
  assert.ok(!romFits("2600", "big.a26", 65 * 1024), "too big");
  assert.ok(!romFits("gb", "empty.gb", 0));
  assert.ok(GAME_ID.test("b:ucity") && GAME_ID.test("u:12"));
  assert.ok(!GAME_ID.test("b:../x") && !GAME_ID.test("u:x"));
});

test("cables reach between footprints; the TV's glass turns with it", () => {
  assert.equal(gap({ x: 0, y: 0, w: 2, h: 1 }, { x: 2, y: 0, w: 1, h: 1 }), 0, "touching");
  assert.equal(gap({ x: 0, y: 0, w: 2, h: 1 }, { x: 5, y: 0, w: 1, h: 1 }), 3);
  assert.ok(gap({ x: 0, y: 0, w: 2, h: 1 }, { x: 5, y: 4, w: 1, h: 1 }) > CABLE_REACH);
  // rot 0: the glass along +y; rot 1: turned onto the x = 1 - y side
  assert.deepEqual(turnLocal(TV_SCREEN.x0, TV_SCREEN.y, 0, 2, 1), [TV_SCREEN.x0, TV_SCREEN.y]);
  const [x, y] = turnLocal(TV_SCREEN.x0, TV_SCREEN.y, 1, 2, 1);
  assert.ok(Math.abs(x - (1 - TV_SCREEN.y)) < 1e-9 && Math.abs(y - TV_SCREEN.x0) < 1e-9);
});

test("the built-in library: every cartridge has its console, licence, credit and file", () => {
  const ids = new Set<string>();
  for (const g of BUILTIN_GAMES) {
    assert.ok(GAME_ID.test(g.id), g.id);
    assert.ok(!ids.has(g.id), `${g.id} once`);
    ids.add(g.id);
    assert.ok(Object.hasOwn(SYSTEMS, g.system), g.id);
    assert.ok(g.license && g.author && g.source, `${g.id} credited`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(g.color));
    assert.ok(g.players >= 1 && g.players <= SYSTEMS[g.system].ports, `${g.id} players`);
    const ext = g.file.split(".").pop() ?? "";
    assert.ok((SYSTEMS[g.system].ext as readonly string[]).includes(ext), `${g.id} extension`);
  }
  // every console has something to play
  for (const s of Object.keys(SYSTEMS))
    assert.ok(
      BUILTIN_GAMES.some((g) => g.system === s),
      s,
    );
  assert.equal(builtinGame("b:thwaite")?.system, "nes");
  // our own test cards are in the repo (the others come from tools/emu-assets.mjs)
  for (const g of BUILTIN_GAMES.filter((x) => x.file.startsWith("/emu/test/")))
    assert.ok(existsSync(new URL(`../../../apps/client/public${g.file}`, import.meta.url)), g.file);
});

test("the ready-made game room fits on an empty floor", () => {
  const W = 10;
  const map: MapDef = {
    key: "t",
    name: "t",
    width: W,
    height: W,
    tiles: Array.from({ length: W }, () => FLOOR.repeat(W)),
    hWalls: Array.from({ length: W + 1 }, () => NO_WALL.repeat(W)),
    vWalls: Array.from({ length: W }, () => NO_WALL.repeat(W + 1)),
    areas: [],
    spawn: { x: 9.5, y: 9.5 },
    objects: [],
  } as unknown as MapDef;
  const placed: WorldObjectDef[] = [];
  GAME_ROOM_SETUP.forEach((it, i) => {
    const o: WorldObjectDef = { id: `g${i}`, kind: it.kind, x: 2 + it.dx, y: 2 + it.dy, rot: it.rot, props: it.props };
    assert.ok(canPlace(map, placed, o), `${it.kind} at ${it.dx},${it.dy}`);
    placed.push(o);
  });
  // the consoles' cables reach the TV
  const tv = placed.find((o) => o.kind === "crt_tv") as WorldObjectDef;
  const rect = (o: WorldObjectDef) => ({ x: o.x, y: o.y, ...footprint(o.kind, o.rot) });
  for (const c of placed.filter((o) => isConsole(o.kind))) {
    assert.ok(gap(rect(c), rect(tv)) <= CABLE_REACH, c.kind);
    assert.ok(CONSOLES[c.kind]);
  }
});

test("a disc's files: one .chd / .pbp / .iso, or a .cue with its tracks (the .cue first)", () => {
  const f = (name: string, size = 10) => ({ name, size });
  assert.deepEqual(
    discFits("ps1", [f("a.bin"), f("a.cue")]).ordered.map((x) => x.name),
    ["a.cue", "a.bin"],
  );
  assert.deepEqual(
    discFits("ps1", [f("t2.bin"), f("g.cue"), f("t1.bin")]).ordered.map((x) => x.name),
    ["g.cue", "t2.bin", "t1.bin"],
  );
  assert.equal(discFits("ps1", [f("g.chd")]).why, null);
  assert.equal(discFits("ps1", [f("g.pbp")]).why, null);
  assert.match(String(discFits("ps1", [f("g.bin")]).why), /needs its \.cue/);
  assert.match(String(discFits("ps1", [f("a.cue"), f("b.cue"), f("a.bin")]).why), /one \.cue/);
  assert.match(String(discFits("ps1", [f("a.chd"), f("b.chd")]).why), /needs its \.cue/);
  assert.match(String(discFits("ps1", [f("a.cue")]).why), /tracks/);
  assert.match(String(discFits("ps1", [f("g.exe")]).why), /aren't a disc/);
  assert.match(String(discFits("ps1", [f("g.chd", 901 * 1024 * 1024)]).why), /too big/);
  assert.ok(isDiscSystem("ps1") && !isDiscSystem("nes"));
});

test("a pad: 16 buttons in a mask (new ones at the end), sticks −127…127", () => {
  assert.equal(PAD_BUTTONS.length, 16);
  assert.deepEqual(PAD_BUTTONS.slice(0, 12), [
    "up",
    "down",
    "left",
    "right",
    "a",
    "b",
    "x",
    "y",
    "l",
    "r",
    "start",
    "select",
  ]);
  assert.equal(PAD_BITS_MAX, 0xffff);
  assert.ok(sticksFit([0, 127, -127, 5]));
  for (const bad of [[0, 0, 0], [128, 0, 0, 0], [0.5, 0, 0, 0], "0,0,0,0", null])
    assert.ok(!sticksFit(bad), String(bad));
  assert.ok(hasSticks("ps1") && !hasSticks("snes"));
  // the disc console's pad has every button, the analog switch's among them
  for (const b of ANALOG_COMBO) assert.ok((SYSTEMS.ps1.buttons as readonly string[]).includes(b), b);
  for (const b of PAD_BUTTONS) assert.ok((SYSTEMS.ps1.buttons as readonly string[]).includes(b), b);
});
