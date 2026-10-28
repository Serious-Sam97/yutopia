// The physics world under load (docs/plan/50-the-volume.md, guardrails 1 and 3), for CI
// (`pnpm physics`, tools/physics-bench/check.mjs) — too long for the unit tests:
//   node --import tsx soak.ts whole              the whole world: every Grounds chunk and the five-
//                                                floor HQ, 300 bodies walking, 500 things dropped
//   node --expose-gc --import tsx soak.ts long   20 simulated minutes near the HQ: bodies joining and
//                                                leaving, things dropped and gone, the building edited
// Prints one JSON line; exits 1 if a guardrail's broken.
import { campusBuilding } from "../building.ts";
import { CHUNK, GROUNDS, groundsChunk } from "../grounds.ts";
import { studio } from "../maps/studio.ts";
import { openingsIntoWalls } from "../openings.ts";
import { splitAll } from "../tops.ts";
import { buildingSolids, staticCount, WorldBuilder } from "./build.ts";
import { loadJolt } from "./load.ts";
import { PhysicsWorld, sizesFor } from "./world.ts";

const DT = 1 / 60;
const G = 9.81;
const [mode = "whole"] = process.argv.slice(2);

// the stored world as a fresh one starts: the studio, its floors added (WorldRoom does the same)
function hq() {
  const into = openingsIntoWalls(studio, splitAll(studio.objects).objects);
  const cb = campusBuilding(into.map, into.objects);
  if (!cb) return { map: into.map, objects: into.objects };
  const moved = new Map(cb.moved.map((o) => [o.id, o]));
  return { map: cb.map, objects: [...into.objects.map((o) => moved.get(o.id) ?? o), ...cb.add] };
}

// a small integer hash → [0, 1) (no Math.random: the same every run)
function rnd(a: number, b: number): number {
  let h = (Math.imul(a, 0x9e3779b1) ^ Math.imul(b + 0x632be5ab, 0x85ebca77)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// walkable spots on the Grounds' land in a rectangle of chunks: [x, y, z]
function spots(cx0: number, cz0: number, cx1: number, cz1: number, n: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let k = 0; out.length < n && k < n * 50; k++) {
    const cx = cx0 + Math.floor(rnd(k, 1) * (cx1 - cx0));
    const cz = cz0 + Math.floor(rnd(k, 2) * (cz1 - cz0));
    const c = groundsChunk(cx, cz);
    const i = Math.floor(rnd(k, 3) * CHUNK);
    const j = Math.floor(rnd(k, 4) * CHUNK);
    if (!c.walk[j * CHUNK + i]) continue;
    const LN = CHUNK * 2 + 1;
    out.push([cx * CHUNK + i + 0.5, c.h[(j * 2 + 1) * LN + i * 2 + 1] + 0.05, cz * CHUNK + j + 0.5]);
  }
  return out;
}

function heap(J: { JoltInterface: { prototype: { sGetTotalMemory(): number; sGetFreeMemory(): number } } }) {
  (globalThis as { gc?: () => void }).gc?.();
  return J.JoltInterface.prototype.sGetTotalMemory() - J.JoltInterface.prototype.sGetFreeMemory();
}

interface Walker {
  id: number;
  vy: number;
  on: boolean;
  k: number;
}
function stepWalkers(w: PhysicsWorld, ws: Walker[], t: number) {
  for (const p of ws) {
    const seg = Math.floor(t / 120);
    const a = rnd(p.k, seg) * 2 * Math.PI;
    const speed = [1.4, 2.2, 4.2][Math.floor(rnd(p.k, seg + 9) * 3)];
    if (p.on && t % 180 === p.k % 180) p.vy = 4.6;
    else if (p.on) p.vy = -1;
    else p.vy -= G * DT;
    p.on = w.moveCharacter(p.id, Math.cos(a) * speed, p.vy, Math.sin(a) * speed, DT, p.vy <= 0);
  }
}

async function whole() {
  const J = await loadJolt();
  const t0 = performance.now();
  const { map, objects } = hq();
  const b = buildingSolids(map, objects);
  const [cx0, cz0] = [Math.floor(GROUNDS.x0 / CHUNK), Math.floor(GROUNDS.z0 / CHUNK)];
  const [cx1, cz1] = [Math.ceil(GROUNDS.x1 / CHUNK), Math.ceil(GROUNDS.z1 / CHUNK)];
  const chunks = (cx1 - cx0) * (cz1 - cz0);
  const sizes = sizesFor({ statics: staticCount(b, chunks), things: 500, vehicles: b.cars.size });
  const log: string[] = [];
  const w = await PhysicsWorld.create(loadJolt, sizes, (m) => log.push(m));
  const build = new WorldBuilder(w);
  build.groundRect(GROUNDS.x0, GROUNDS.z0, GROUNDS.x1, GROUNDS.z1);
  build.building(b);
  w.settle();
  const buildMs = performance.now() - t0;
  const ws: Walker[] = spots(cx0, cz0, cx1, cz1, 300).map(([x, y, z], k) => ({
    id: w.addCharacter(x, y, z) as number,
    vy: 0,
    on: false,
    k,
  }));
  const things: number[] = [];
  for (const [k, [x, y, z]] of spots(-4, -4, 4, 4, 500).entries()) {
    const id = w.addThing(k % 2 ? { kind: "ball", r: 0.12 } : { kind: "crate", h: 0.2 }, x, y + 3 + (k % 7), z);
    if (id !== null) things.push(id);
  }
  const ticks = 20 * 60;
  const times = new Float64Array(ticks);
  for (let t = 0; t < ticks; t++) {
    const a = performance.now();
    stepWalkers(w, ws, t);
    w.step(DT);
    times[t] = performance.now() - a;
  }
  const p: [number, number, number] = [0, 0, 0];
  let lost = 0;
  for (const id of things) if (w.thingAt(id, p) && p[1] < -60) lost++;
  const sorted = [...times].sort((x, y) => x - y);
  const c = w.counts();
  const out = {
    mode,
    buildMs: Math.round(buildMs),
    bodies: c.bodies,
    maxBodies: c.maxBodies,
    statics: c.statics,
    vehicles: c.vehicles,
    characters: c.characters,
    things: c.things,
    refused: c.refused,
    fellThrough: lost,
    tickMean: +(sorted.reduce((s, x) => s + x, 0) / ticks).toFixed(2),
    tickP95: +sorted[Math.floor(ticks * 0.95)].toFixed(2),
    heapMB: +(heap(J) / 1048576).toFixed(1),
    log,
  };
  w.destroy();
  console.log(JSON.stringify(out));
  return out.refused === 0 && out.things === 500 && out.characters === 300 && out.fellThrough === 0;
}

async function long() {
  const J = await loadJolt();
  const minutes = Number(process.env.MINUTES ?? 20);
  const { map, objects } = hq();
  const b = buildingSolids(map, objects);
  const w = await PhysicsWorld.create(loadJolt, sizesFor({ statics: staticCount(b, 64), things: 200, vehicles: 20 }));
  const build = new WorldBuilder(w);
  build.groundRect(-4 * CHUNK, -4 * CHUNK, 4 * CHUNK, 4 * CHUNK);
  build.building(b);
  w.settle();
  const at = spots(-4, -4, 4, 4, 400);
  let next = 0;
  const join = (): Walker => {
    const [x, y, z] = at[next % at.length];
    next++;
    return { id: w.addCharacter(x, y, z) as number, vy: 0, on: false, k: next };
  };
  const ws = Array.from({ length: 50 }, join);
  const things: number[] = [];
  // a thing that moves about the floor: removed and made again (an edit in build mode)
  const desk = objects.find((o) => o.kind === "desk");
  let m1 = 0;
  const ticks = minutes * 60 * 60;
  for (let t = 0; t < ticks; t++) {
    if (t === 3600) m1 = heap(J);
    if (t % 60 === 0) {
      for (let c = 0; c < 2; c++) {
        const i = (t / 60 + c * 17) % ws.length;
        w.removeCharacter(ws[i].id);
        ws[i] = join();
      }
      const [x, y, z] = at[(t / 60) % at.length];
      const id = w.addThing(t % 120 ? { kind: "ball", r: 0.12 } : { kind: "crate", h: 0.2 }, x, y + 4, z);
      if (id !== null) things.push(id);
      if (things.length > 120) w.removeThing(things.shift() as number);
    }
    if (desk && t % 600 === 0) {
      const moved = objects.map((o) => (o === desk ? { ...o, x: o.x + ((t / 600) % 2 ? 1 : -1) } : o));
      build.building(buildingSolids(map, (t / 600) % 2 ? moved : objects));
    }
    stepWalkers(w, ws, t);
    w.step(DT);
  }
  const growth = heap(J) - m1;
  const c = w.counts();
  w.destroy();
  const out = {
    mode,
    simMinutes: minutes,
    joinedAndLeft: next - 50,
    refused: c.refused,
    heapGrowthMB: +(growth / 1048576).toFixed(2),
  };
  console.log(JSON.stringify(out));
  return out.refused === 0 && Math.abs(growth) < 0.25 * 1048576;
}

const ok = await (mode === "long" ? long() : whole());
process.exit(ok ? 0 : 1);
