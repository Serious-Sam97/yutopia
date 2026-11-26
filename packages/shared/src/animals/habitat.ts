// Where the animals live (docs/plan/126-animal-life.md, phase 2): what the land is at a spot for them (its habitat),
// the groups each cell of the land keeps — made by habitat and seeded, the same for everyone (F9c) — and what God
// mode puts over them (the draft's `animals` section: herds, dens, nests placed by hand; places kept empty; the
// farm's pens). Pure: the server asks it for the cells round its players.
import { buildingAt } from "../grounds-buildings.ts";
import type { GroundsEdits } from "../grounds-edits.ts";
import { FARM, pavedAt, terrainAt, TOWN, treeDensity, walkableCell, waterAt } from "../grounds.ts";
import { grownAt } from "../grow.ts";
import { type Biome, beyondReach, landRegions } from "../land.ts";
import { ANIMAL_KINDS, ANIMALS, type AnimalKind, type Habitat, HABITATS, isAnimalKind } from "./species.ts";

export type HabitatWeights = Partial<Record<Habitat, number>>;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ramp = (a: number, b: number, v: number) => clamp01((v - a) / (b - a));

/** The region's biome at (x, z): the land's (long road's legs: forest, gorge, alpine, lake) or a grown piece's. */
export function biomeAt(x: number, z: number): Biome | null {
  const g = grownAt(x, z);
  if (g && g.w > 0.5) return g.g.def.biome as Biome;
  for (const r of landRegions()) if (beyondReach(r.reach, x, z) === 0) return r.biome;
  return null;
}

/** Open water deep enough to swim (m). */
export const SWIM_DEPTH = 0.5;
/** How far from the water's edge is its shore (m). */
export const SHORE = 8;

/** What the land is at (x, z) for the animals: each habitat's weight 0..1. */
export function habitatAt(x: number, z: number): HabitatWeights {
  const w: HabitatWeights = {};
  const water = waterAt(x, z);
  if (water && water.depth >= SWIM_DEPTH) {
    w.water = 1;
    return w;
  }
  // a bank: open water within SHORE
  let shore = water ? 1 : 0;
  if (!shore)
    for (let k = 0; k < 8 && !shore; k++) {
      const a = (k / 8) * Math.PI * 2;
      const q = waterAt(x + Math.cos(a) * SHORE, z + Math.sin(a) * SHORE);
      if (q && q.depth >= SWIM_DEPTH) shore = 1;
    }
  if (shore) w.shore = 1;
  const t = TOWN;
  const inTown = x >= t.x0 && x <= t.x1 && z >= t.z0 && z <= t.z1;
  const farm = x >= FARM.x0 && x <= FARM.x1 && z >= FARM.z0 && z <= FARM.z1;
  if (farm) w.farm = 1;
  else if (inTown || buildingAt(x, z) || pavedAt(x, z) > 0.5) w.town = 1;
  const biome = biomeAt(x, z);
  switch (biome) {
    case "meadow":
    case "hills":
      w.meadow = 1;
      break;
    case "mountains":
    case "alpine":
      w.alpine = 1;
      break;
    case "desert":
      w.desert = 1;
      break;
    case "beach":
      w.beach = 1;
      break;
    case "farmland":
      w.field = 1;
      break;
  }
  // (high ground is alpine wherever it is: over 380 m the trees thin to the pass)
  const h = terrainAt(x, z);
  if (h > 380) w.alpine = Math.max(w.alpine ?? 0, ramp(380, 440, h));
  const trees = treeDensity(x, z);
  if (trees >= 0.9) w.deepwoods = 1;
  const forest = ramp(0.2, 0.55, trees);
  if (forest > 0) w.forest = forest;
  if (!w.town && !w.farm && !w.desert && !w.beach) {
    const open = 1 - forest;
    if (open > 0.2) w.field = Math.max(w.field ?? 0, open * (w.alpine ? 0.4 : 1));
  }
  return w;
}

/** How much `kind` likes a spot with these weights (0..1): the best of its habitats there. */
export function likes(kind: AnimalKind, w: HabitatWeights): number {
  const h = ANIMALS[kind].habitat;
  let best = 0;
  for (const k of HABITATS) {
    const a = w[k];
    const b = h[k];
    if (a && b) best = Math.max(best, a * b);
  }
  return best;
}

// ── God mode's places (F9c) ──────────────────────────────────────────────────────────────────────────────────────

export const PLACE_KINDS = ["herd", "den", "nest", "empty", "pen"] as const;
export type AnimalPlaceKind = (typeof PLACE_KINDS)[number];

/** An animal place in the draft's `animals` section. */
export interface AnimalPlaceDef {
  key: string;
  kind: AnimalPlaceKind;
  /** herd/den/nest: who lives there; pen: who's kept in it (each with how many) */
  species?: AnimalKind;
  /** a pen's animals */
  keeps?: { species: AnimalKind; n: number }[];
  x: number;
  z: number;
  /** herd: how many (else its pack's); den: its young too */
  n?: number;
  /** empty: how far round (m); den: its territory (else its species') */
  r?: number;
  /** pen: its far corner (x, z is the near) */
  x1?: number;
  z1?: number;
  /** den/nest: young in it */
  young?: number;
}

/** The farm's pens (phase 11, F1c): where they are as the land was made — God mode moves them, or takes them away. */
export const FARM_PENS: readonly AnimalPlaceDef[] = [
  // the paddock east of the barn: the horses
  { key: "pen:paddock", kind: "pen", x: 452, z: -298, x1: 500, z1: -280, keeps: [{ species: "horse", n: 4 }] },
  // the pasture south-east: cows and sheep
  {
    key: "pen:pasture",
    kind: "pen",
    x: 460,
    z: -246,
    x1: 502,
    z1: -212,
    keeps: [
      { species: "cow", n: 5 },
      { species: "sheep", n: 8 },
    ],
  },
  // the sty west of the lane, by the barn
  { key: "pen:sty", kind: "pen", x: 418, z: -298, x1: 430, z1: -286, keeps: [{ species: "pig", n: 4 }] },
  // the coop's yard
  { key: "pen:coop", kind: "pen", x: 418, z: -280, x1: 432, z1: -266, keeps: [{ species: "chicken", n: 9 }] },
];

/** The places as the edits leave them: the farm's pens (changed or taken away by key) and those added. */
export function animalPlacesOf(e: GroundsEdits): AnimalPlaceDef[] {
  const s = e.animals;
  const gone = new Set(s?.remove ?? []);
  const out: AnimalPlaceDef[] = [];
  for (const p of FARM_PENS) {
    if (gone.has(p.key)) continue;
    const c = s?.change?.[p.key];
    out.push(c ? { ...p, ...c, key: p.key } : { ...p });
  }
  for (const p of s?.add ?? []) {
    if (gone.has(p.key)) continue;
    const c = s?.change?.[p.key];
    out.push(c ? { ...p, ...c, key: p.key } : p);
  }
  return out;
}

/** A place's key: its animals' ids are `<key>:<species>#<n>` (AnimalTrustController::ID, 64 at most). */
const PLACE_KEY = /^[A-Za-z0-9:_.-]{1,40}$/;

/** Why a place can't be as it is, or null (the server checks a draft's before it's published). */
export function checkAnimalPlace(p: AnimalPlaceDef): string | null {
  if (!p || typeof p.key !== "string" || !p.key) return "no key";
  // (its animals' ids are the key and more: within the wire's strings and the API's trust ids — 64, of these)
  if (!PLACE_KEY.test(p.key)) return `${p.key.slice(0, 40)}: key`;
  if (!(PLACE_KINDS as readonly string[]).includes(p.kind)) return `${p.key}: kind`;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return `${p.key}: where`;
  if (p.kind === "herd" || p.kind === "den" || p.kind === "nest") {
    // (by its own keys: not "toString" off the prototype)
    if (!isAnimalKind(p.species)) return `${p.key}: species`;
    if (p.n !== undefined && !(Number.isInteger(p.n) && p.n >= 1 && p.n <= 30)) return `${p.key}: n`;
    if (p.young !== undefined && !(Number.isInteger(p.young) && p.young >= 0 && p.young <= 6)) return `${p.key}: young`;
    if (p.r !== undefined && !(Number(p.r) >= 0 && Number(p.r) <= 2000)) return `${p.key}: r`;
  }
  if (p.kind === "empty" && !(Number(p.r) > 0 && Number(p.r) <= 2000)) return `${p.key}: r`;
  if (p.kind === "pen") {
    if (!Number.isFinite(p.x1) || !Number.isFinite(p.z1)) return `${p.key}: corner`;
    const w = Math.abs((p.x1 as number) - p.x);
    const d = Math.abs((p.z1 as number) - p.z);
    if (w < 4 || d < 4 || w > 300 || d > 300) return `${p.key}: size`;
    if (!Array.isArray(p.keeps) || !p.keeps.length || p.keeps.length > 6) return `${p.key}: keeps`;
    for (const k of p.keeps)
      if (!k || !isAnimalKind(k.species) || !(Number.isInteger(k.n) && k.n >= 1 && k.n <= 40)) return `${p.key}: keeps`;
  }
  return null;
}

/** A pen's rect, its corners in order. */
export function penRect(p: AnimalPlaceDef): { x0: number; z0: number; x1: number; z1: number } {
  const x1 = p.x1 ?? p.x;
  const z1 = p.z1 ?? p.z;
  return { x0: Math.min(p.x, x1), z0: Math.min(p.z, z1), x1: Math.max(p.x, x1), z1: Math.max(p.z, z1) };
}

// ── the groups a cell keeps ──────────────────────────────────────────────────────────────────────────────────────

/** The land's cells the animals are made in (m). */
export const CELL = 192;
const SAMPLES = 6;
const KM2 = (CELL * CELL) / 1e6;
/** The sheet's densities are the wild's, per km²; the world is walked past, not lived in for weeks: more than the
 *  wild keeps, so a walk through the woods meets something (0.4 left most squares empty — 2026-11-25). */
export const SPAWN_SCALE = 1.6;

/** A group of animals as the land makes it (or God mode puts it). */
export interface GroupSpec {
  /** stable: the cell and its number in it, or the place's key */
  id: string;
  species: AnimalKind;
  /** its home: where it rests, its den, its roost */
  x: number;
  z: number;
  n: number;
  young: number;
  /** its territory round home (m): a predator's (F5c) */
  territory: number;
  /** kept in a pen */
  pen?: { x0: number; z0: number; x1: number; z1: number };
  /** where it comes from: the land, a placed one, the farm */
  from: "land" | "placed" | "farm";
}

function hash(...v: number[]): number {
  let h = 2166136261;
  for (const n of v) {
    h ^= Math.floor(n) | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}
/** A seeded random (mulberry32). */
export function rngOf(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A species' own number for the land's draws: by its name, not its place in the list (a species added or moved
 *  doesn't re-key or reshuffle the others' groups — their trust and God mode's changes are kept by those keys). */
const kindNo = (k: AnimalKind) => {
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (Math.imul(h, 31) + k.charCodeAt(i)) | 0;
  return h >>> 0;
};

/** Is a home at (x, z) somewhere `kind` can be (its ground: the land walked, open water for a swimmer)? */
export type CanBe = (kind: AnimalKind, x: number, z: number) => boolean;

/** The groups the land makes in cell (cx, cz) — the same each time (`seed`: the world's, a new one a day). */
export function landGroups(cx: number, cz: number, seed: number, canBe: CanBe, empty: AnimalPlaceDef[] = []): GroupSpec[] {
  const x0 = cx * CELL;
  const z0 = cz * CELL;
  const step = CELL / SAMPLES;
  const pts: { x: number; z: number; w: HabitatWeights }[] = [];
  for (let j = 0; j < SAMPLES; j++)
    for (let i = 0; i < SAMPLES; i++) {
      const x = x0 + (i + 0.5) * step;
      const z = z0 + (j + 0.5) * step;
      pts.push({ x, z, w: habitatAt(x, z) });
    }
  const out: GroupSpec[] = [];
  for (const kind of ANIMAL_KINDS) {
    const d = ANIMALS[kind];
    if (d.group === "farm" || !d.density) continue;
    const like = pts.map((p) => likes(kind, p.w));
    const mean = like.reduce((a, b) => a + b, 0) / like.length;
    if (mean <= 0.02) continue;
    const r = rngOf(hash(seed, cx, cz, kindNo(kind)));
    const expect = d.density * KM2 * mean * SPAWN_SCALE;
    const n = Math.floor(expect + r());
    const sum = like.reduce((a, b) => a + b * b, 0);
    for (let g = 0; g < n; g++) {
      // a home where it likes it most (weighted by the liking's square), a little off the sample
      let pick = r() * sum;
      let at = 0;
      for (; at < like.length - 1; at++) {
        pick -= like[at] * like[at];
        if (pick <= 0) break;
      }
      let home: { x: number; z: number } | null = null;
      for (let tries = 0; tries < 6 && !home; tries++) {
        const x = pts[at].x + (r() - 0.5) * step;
        const z = pts[at].z + (r() - 0.5) * step;
        if (likes(kind, habitatAt(x, z)) > 0.15 && canBe(kind, x, z)) home = { x, z };
      }
      if (!home) continue;
      const size = d.pack[0] + Math.floor(r() * (d.pack[1] - d.pack[0] + 1));
      // a herd, a pack, a pair with young about a third of the time (a den's: a predator's young)
      const young = size >= 2 && r() < (d.danger ? 0.4 : 0.3) ? 1 + Math.floor(r() * Math.min(2, size - 1)) : 0;
      // (a place kept empty: after the draws — it takes this one away without moving the cell's others, plan 127)
      if (empty.some((e) => Math.hypot(e.x - home.x, e.z - home.z) < (e.r ?? 0))) continue;
      out.push({
        id: `l${cx}_${cz}_${kind}_${g}`,
        species: kind,
        x: home.x,
        z: home.z,
        n: size,
        young,
        territory: d.danger?.territory ?? 0,
        from: "land",
      });
    }
  }
  return out;
}

/** The groups the places make (God mode's herds, dens and nests; the farm's pens). */
export function placedGroups(places: AnimalPlaceDef[]): GroupSpec[] {
  const out: GroupSpec[] = [];
  for (const p of places) {
    if (p.kind === "pen") {
      const pen = penRect(p);
      for (const k of p.keeps ?? [])
        out.push({
          id: `${p.key}:${k.species}`,
          species: k.species,
          x: (pen.x0 + pen.x1) / 2,
          z: (pen.z0 + pen.z1) / 2,
          n: k.n,
          // (the farm has young: a foal, a calf, lambs, chicks)
          young: Math.min(2, Math.floor(k.n / 4)),
          territory: 0,
          pen,
          from: "farm",
        });
    } else if (p.kind !== "empty" && p.species) {
      const d = ANIMALS[p.species];
      out.push({
        id: p.key,
        species: p.species,
        x: p.x,
        z: p.z,
        n: p.n ?? Math.ceil((d.pack[0] + d.pack[1]) / 2),
        young: p.young ?? (p.kind === "den" || p.kind === "nest" ? 1 : 0),
        territory: p.kind === "den" ? (p.r ?? d.danger?.territory ?? 0) : (d.danger?.territory ?? 0),
        from: "placed",
      });
    }
  }
  return out;
}

/** The cell (x, z) is in. */
export const cellOf = (x: number, z: number): [number, number] => [Math.floor(x / CELL), Math.floor(z / CELL)];
/** Is a placed group's home in cell (cx, cz)? */
export const inCell = (g: { x: number; z: number }, cx: number, cz: number) =>
  Math.floor(g.x / CELL) === cx && Math.floor(g.z / CELL) === cz;

/** Can `kind` be at (x, z): open water for a swimmer, else the land walked (the server's and God mode's alike). */
export function canBeAt(kind: AnimalKind, x: number, z: number): boolean {
  if ((waterAt(x, z)?.depth ?? 0) >= SWIM_DEPTH) return !!ANIMALS[kind].swims;
  try {
    return walkableCell(Math.floor(x), Math.floor(z));
  } catch {
    return false;
  }
}

// ── the land's own places, God mode's over them (docs/plan/127-default-nests.md, F2a/F5a/F7a) ──────────────────────

/** The world's seed for the land's groups (the same groups every time: trust is kept by their ids). */
export const ANIMAL_SEED = 126;
/** A group the land makes: `l<cx>_<cz>_<species>_<n>`. */
const GENERATED = /^l(-?\d+)_(-?\d+)_[a-z]+_\d+$/;
export const isGeneratedKey = (k: string) => GENERATED.test(k);
/** The cell a generated group was made in. */
export function generatedCell(k: string): [number, number] | null {
  const m = GENERATED.exec(k);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
/** What God mode calls a group the land made: a predator's den, a bird's nest, else a herd. */
export function placeKindOf(kind: AnimalKind): "herd" | "den" | "nest" {
  const d = ANIMALS[kind];
  return d.danger && d.danger.territory > 0 ? "den" : d.flies ? "nest" : "herd";
}
/** A group as a place (God mode draws and edits it). */
export function placeOfGroup(g: GroupSpec): AnimalPlaceDef {
  const kind = placeKindOf(g.species);
  return {
    key: g.id,
    kind,
    species: g.species,
    x: g.x,
    z: g.z,
    n: g.n,
    young: g.young,
    ...(kind === "den" ? { r: g.territory } : {}),
  };
}

/** The empty places the edits keep (they take the land's groups away). */
export const emptyPlacesOf = (e: GroundsEdits) => animalPlacesOf(e).filter((p) => p.kind === "empty");

/** The land's groups God mode changed (moved, another species, how many) — wherever they're now: each made from
 *  its cell's group and the change over it; one the land no longer makes (the land changed under it, F7a) from the
 *  change alone, when it says enough. Cached by the edits. */
const changedOf = new WeakMap<GroundsEdits, GroupSpec[]>();
export function changedDefaults(e: GroundsEdits, canBe: CanBe = canBeAt): GroupSpec[] {
  const hit = changedOf.get(e);
  if (hit) return hit;
  const s = e.animals;
  const gone = new Set(s?.remove ?? []);
  const out: GroupSpec[] = [];
  const byCell = new Map<string, GroupSpec[]>();
  for (const [key, c] of Object.entries(s?.change ?? {})) {
    const cell = generatedCell(key);
    if (!cell || gone.has(key) || !c) continue;
    // (God mode writes a change whole — species, where, how many, young —: its cell's land not read again, which
    // could be far off and not made; a change that leaves something out takes it from its cell's group)
    const whole = isAnimalKind(c.species) && Number.isFinite(c.x) && Number.isFinite(c.z) && c.n !== undefined && c.young !== undefined;
    let base: GroupSpec | undefined;
    if (!whole) {
      const ck = `${cell[0]},${cell[1]}`;
      let groups = byCell.get(ck);
      if (!groups) {
        groups = landGroups(cell[0], cell[1], ANIMAL_SEED, canBe);
        byCell.set(ck, groups);
      }
      base = groups.find((g) => g.id === key);
    }
    const species = isAnimalKind(c.species) ? c.species : base?.species;
    const x = Number.isFinite(c.x) ? (c.x as number) : base?.x;
    const z = Number.isFinite(c.z) ? (c.z as number) : base?.z;
    if (!species || x === undefined || z === undefined) continue;
    const d = ANIMALS[species];
    out.push({
      id: key,
      species,
      x,
      z,
      n: c.n ?? base?.n ?? Math.ceil((d.pack[0] + d.pack[1]) / 2),
      young: c.young ?? base?.young ?? 0,
      territory: c.r ?? (base && species === base.species ? base.territory : (d.danger?.territory ?? 0)),
      from: "land",
    });
  }
  changedOf.set(e, out);
  return out;
}

/** A cell's groups as the edits leave them: the land's (those taken away or changed left out, the empty places'
 *  taken away), the changed ones now in it, and those placed in it. */
export function cellGroups(e: GroundsEdits, cx: number, cz: number, canBe: CanBe = canBeAt, land = true): GroupSpec[] {
  const s = e.animals;
  const off = new Set([...(s?.remove ?? []), ...Object.keys(s?.change ?? {})]);
  const places = animalPlacesOf(e);
  const empties = places.filter((p) => p.kind === "empty");
  return [
    ...(land ? landGroups(cx, cz, ANIMAL_SEED, canBe, empties).filter((g) => !off.has(g.id)) : []),
    ...changedDefaults(e, canBe).filter((g) => inCell(g, cx, cz)),
    ...placedGroups(places).filter((g) => inCell(g, cx, cz)),
  ];
}

/** Why a change to one of the land's groups can't be as it is, or null (`canBe`: where it's moved to, F7a). */
export function checkDefaultChange(key: string, c: Partial<AnimalPlaceDef>, canBe?: CanBe): string | null {
  if (!isGeneratedKey(key) || key.length > 40) return `${key.slice(0, 40)}: not one of the land's`;
  if (!c || typeof c !== "object") return `${key}: change`;
  if (c.species !== undefined && !isAnimalKind(c.species)) return `${key}: species`;
  if (c.x !== undefined && !Number.isFinite(c.x)) return `${key}: where`;
  if (c.z !== undefined && !Number.isFinite(c.z)) return `${key}: where`;
  if (c.n !== undefined && !(Number.isInteger(c.n) && c.n >= 1 && c.n <= 30)) return `${key}: n`;
  if (c.young !== undefined && !(Number.isInteger(c.young) && c.young >= 0 && c.young <= 6)) return `${key}: young`;
  if (c.r !== undefined && !(Number(c.r) >= 0 && Number(c.r) <= 2000)) return `${key}: r`;
  if (canBe && c.x !== undefined && c.z !== undefined && c.species && !canBe(c.species as AnimalKind, c.x, c.z))
    return `${key}: moved where a ${c.species} can't be (${Math.round(c.x)}, ${Math.round(c.z)})`;
  return null;
}
