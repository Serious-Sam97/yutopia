import {
  BUILDINGS,
  CHUNK,
  GROUNDS,
  groundsChunk,
  INSIDES,
  LAMPS,
  SNOW_POLES,
  STREET,
  surfaceTileAt,
  WAYS,
  wallEdgeAt,
} from "./grounds.ts";
import { groundSolidsIn } from "./shapes/grounds.ts";

// The Grounds' fingerprint (docs/plan/53-the-god-mode.md § B): one number for each part of what
// the generator makes — every chunk's heights, walking and trees, the surfaces, the solids, the
// ways, lamps, street things and buildings — so "no edits is today's world" is a check, not a
// hope. FNV-1a over the values, rounded where floats could differ by the last bit.

export interface GroundsHash {
  land: string;
  walk: string;
  trees: string;
  surfaces: string;
  solids: string;
  things: string;
}

class Fnv {
  h = 0x811c9dc5;
  int(v: number) {
    let x = v | 0;
    for (let i = 0; i < 4; i++) {
      this.h ^= x & 0xff;
      this.h = Math.imul(this.h, 0x01000193);
      x >>>= 8;
    }
  }
  /** a float, to a thousandth */
  num(v: number) {
    this.int(Math.round(v * 1000));
  }
  str(s: string) {
    for (let i = 0; i < s.length; i++) this.int(s.charCodeAt(i));
  }
  get hex() {
    return (this.h >>> 0).toString(16).padStart(8, "0");
  }
}

/** The fingerprint of the whole Grounds as they are now (every chunk: seconds, not a frame's). */
export function groundsHash(): GroundsHash {
  const land = new Fnv();
  const walk = new Fnv();
  const trees = new Fnv();
  const surfaces = new Fnv();
  const solids = new Fnv();
  const things = new Fnv();
  for (let cz = Math.floor(GROUNDS.z0 / CHUNK); cz * CHUNK < GROUNDS.z1; cz++)
    for (let cx = Math.floor(GROUNDS.x0 / CHUNK); cx * CHUNK < GROUNDS.x1; cx++) {
      const c = groundsChunk(cx, cz);
      for (let i = 0; i < c.h.length; i += 3) land.num(c.h[i]);
      for (const w of c.walk) walk.int(w);
      // (the walls on the tiles' edges: the insides', the shelter's, the fences')
      for (let j = 0; j < CHUNK; j++)
        for (let i = 0; i < CHUNK; i++) {
          const x = cx * CHUNK + i;
          const z = cz * CHUNK + j;
          if (wallEdgeAt("h", x, z)) walk.int(x * 8192 + z);
          if (wallEdgeAt("v", x, z)) walk.int(-x * 8192 - z);
        }
      for (const t of c.trees) {
        trees.num(t.x);
        trees.num(t.z);
        trees.num(t.y);
        trees.str(t.kind);
        trees.num(t.s);
      }
      // (every other tile's surface, as walking reads them: kept per chunk)
      for (let j = 0; j < CHUNK; j += 2)
        for (let i = 0; i < CHUNK; i += 2) surfaces.str(surfaceTileAt(cx * CHUNK + i, cz * CHUNK + j));
      for (const g of groundSolidsIn(cx, cz)) {
        solids.str(g.what);
        for (const v of Object.values(g.s)) typeof v === "number" ? solids.num(v) : solids.str(String(v));
        if (g.blocks) solids.str(String(g.blocks));
      }
    }
  for (const w of WAYS) {
    things.str(w.key);
    things.num(w.w);
    for (const [x, z] of w.line) {
      things.num(x);
      things.num(z);
    }
    for (const h of w.h) things.num(h);
    for (const b of w.bridged) things.int(b ? 1 : 0);
  }
  for (const l of LAMPS) {
    things.str(l.key);
    things.num(l.x);
    things.num(l.z);
    things.num(l.ry);
  }
  for (const s of STREET) {
    things.str(s.key);
    things.num(s.x);
    things.num(s.z);
  }
  for (const p of SNOW_POLES) {
    things.str(p.key);
    things.num(p.x);
    things.num(p.z);
  }
  for (const b of BUILDINGS) {
    things.str(b.key);
    for (const v of [b.x0, b.z0, b.x1, b.z1, b.floors]) things.num(v);
  }
  for (const i of INSIDES) for (const f of i.fits) for (const v of [f.x, f.z, f.w, f.d]) things.num(v);
  return {
    land: land.hex,
    walk: walk.hex,
    trees: trees.hex,
    surfaces: surfaces.hex,
    solids: solids.hex,
    things: things.hex,
  };
}
