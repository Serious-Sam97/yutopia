// biome-ignore-all lint/suspicious/noApproximativeNumericConstant: the inputs are exact literals, the same on every host; Math.SQRT1_2 and the like would move the recorded hashes
// Round 2 — the same for both engines. What a game asks of its physics besides raw speed:
// A. behaviour: a 30 cm step climbed, a 50 cm one not; a 40° ramp walked up, a 55° one not;
//    a 1.2 m fence stops a walker and lets a flier over; a ceiling stops a flier's head; walking
//    into a wall at an angle slides along it.
// B. queries: rays (reach, aim) and sphere overlaps (who's near) against the real Grounds.
// C. things falling: balls and crates dropped onto the real land, stepped till they rest.
// D. a long session: 10 simulated minutes of 50 players, two leaving and two joining every second.
import { DT } from "./bench.mjs";

const G = 9.81;
// exact constants (no Math.sin: the same on every host) — a rotation about z by a
const QZ = {
  40: { x: 0, y: 0, z: 0.3420201433, w: 0.9396926208 },
  55: { x: 0, y: 0, z: 0.4617486132, w: 0.8870108332 },
};
const COS = { 40: 0.7660444431, 55: 0.5735764364 };
const SIN = { 40: 0.6427876097, 55: 0.8191520443 };

function fnv(f32) {
  const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  let h = 0x811c9dc5;
  for (let k = 0; k < u8.length; k++) h = Math.imul(h ^ u8[k], 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

export async function behaviour(e) {
  await e.init();
  e.buildFlat();
  const lanes = {};
  let z = 0;
  const lane = (name, build, start, plan) => {
    build(z);
    lanes[name] = { id: e.addPlayer(start[0], start[1], z + (start[2] ?? 0)), z, plan, vy: 0, grounded: false };
    z += 12;
  };
  const walk = (vx, vz = 0) => ({ vx, vz, fly: false });
  lane("step 0.30 m", (z) => e.addStatic(5.5, 0.15, z, 0.5, 0.15, 3), [0, 0.02], walk(2));
  lane("step 0.50 m", (z) => e.addStatic(5.5, 0.25, z, 0.5, 0.25, 3), [0, 0.02], walk(2));
  for (const a of [40, 55])
    lane(`ramp ${a}°`, (z) => e.addStatic(3 + 5 * COS[a], 5 * SIN[a] - 0.1, z, 5, 0.1, 3, QZ[a]), [0, 0.02], walk(2));
  lane("fence 1.2 m, walking", (z) => e.addStatic(5.1, 0.6, z, 0.05, 0.6, 3), [0, 0.02], walk(2));
  lane("fence 1.2 m, flying at 2 m", (z) => e.addStatic(5.1, 0.6, z, 0.05, 0.6, 3), [0, 2], {
    vx: 2,
    vz: 0,
    fly: true,
    vyFly: 0,
  });
  lane("ceiling at 3 m, flying up", (z) => e.addStatic(5, 3.15, z, 7, 0.15, 3), [5, 0.02], {
    vx: 0,
    vz: 0,
    fly: true,
    vyFly: 3,
  });
  lane("wall at 45°, sliding", (z) => e.addStatic(10, 1.5, z + 1.5, 12, 1.5, 0.1), [0, 0.02], walk(1.7678, 1.7678));
  e.step();
  for (let t = 0; t < 240; t++) {
    for (const l of Object.values(lanes)) {
      const p = l.plan;
      if (p.fly) l.vy = p.vyFly;
      // (on the ground: a light push down — Rapier's autostep won't step up under a hard one)
      else if (l.grounded) l.vy = -0.1;
      else l.vy -= G * DT;
      l.grounded = e.move(l.id, p.vx * DT, l.vy * DT, p.vz * DT, !p.fly && l.vy <= 0);
    }
    e.step();
  }
  const out = {};
  const q = [0, 0, 0];
  const at = (name) => {
    e.position(lanes[name].id, q);
    return { x: +q[0].toFixed(2), y: +q[1].toFixed(2), dz: +(q[2] - lanes[name].z).toFixed(2) };
  };
  const check = (name, ok, note) => {
    const p = at(name);
    out[name] = { ...p, pass: ok(p), want: note };
  };
  check("step 0.30 m", (p) => p.x > 7, "climbs it: past x 7");
  check("step 0.50 m", (p) => p.x < 5.2, "stopped before it (x < 5)");
  check("ramp 40°", (p) => p.y > 1, "walks up it (y > 1 in 4 s)");
  check("ramp 55°", (p) => p.y < 1, "can't walk up (y < 1)");
  check("fence 1.2 m, walking", (p) => p.x < 5.1, "stopped (x < 5)");
  check("fence 1.2 m, flying at 2 m", (p) => p.x > 7, "flies over (x > 7)");
  check("ceiling at 3 m, flying up", (p) => p.y > 1.0 && p.y < 1.25, "head stops at 3 m: feet ~1.2");
  check("wall at 45°, sliding", (p) => p.x > 4 && p.dz < 1.45, "slides along the wall (x > 4, not through)");
  return out;
}

export async function queries(e, scene) {
  await e.init();
  e.build(scene, 32);
  const S = scene.spawns.length / 3;
  const pts = [];
  for (let k = 0; k < 10000; k++) {
    const j = (k * 7919) % S;
    pts.push([scene.spawns[j * 3], scene.spawns[j * 3 + 2] + 1.2, scene.spawns[j * 3 + 1]]);
  }
  let hits = 0;
  let t = performance.now();
  for (let k = 0; k < pts.length; k++) {
    const [x, y, z] = pts[k];
    // a reach (3 m ahead, 16 ways) or a look down
    hits +=
      k % 2 ? e.ray(x, y, z, 0, -1, 0, 50) : e.ray(x, y, z, k % 3 ? 1 : 0.7071067812, 0, k % 3 ? 0 : 0.7071067812, 3);
  }
  const rayMs = performance.now() - t;
  let near = 0;
  t = performance.now();
  for (const [x, y, z] of pts) near += e.overlap(x, y, z, 1.5);
  const overlapMs = performance.now() - t;
  return {
    rays: 10000,
    rayHits: hits,
    rayUs: +((rayMs / 10000) * 1000).toFixed(2),
    overlaps: 10000,
    overlapHits: near,
    overlapUs: +((overlapMs / 10000) * 1000).toFixed(2),
  };
}

export async function dynamics(e, scene, { balls = 300, crates = 100, seconds = 20 } = {}) {
  await e.init();
  e.build(scene, 32);
  const S = scene.spawns.length / 3;
  for (let k = 0; k < balls + crates; k++) {
    const j = (k * 104729) % S;
    const x = scene.spawns[j * 3] + (k % 5) * 0.37;
    const z = scene.spawns[j * 3 + 1] + (k % 3) * 0.41;
    const y = scene.spawns[j * 3 + 2] + 3 + (k % 6);
    if (k < balls) e.addBall(x, y, z, 0.15);
    else e.addCrate(x, y, z, 0.25);
  }
  const n = balls + crates;
  const ticks = Math.round(seconds / DT);
  const times = new Float64Array(ticks);
  for (let t = 0; t < ticks; t++) {
    const a = performance.now();
    e.step();
    times[t] = performance.now() - a;
  }
  const pos = new Float32Array(n * 3);
  const asleep = e.dynState(pos);
  let lost = 0;
  for (let i = 0; i < n; i++) if (pos[i * 3 + 1] < -50) lost++;
  const sorted = Array.from(times).sort((a, b) => a - b);
  const first = times.slice(0, 120).reduce((s, x) => s + x, 0) / 120;
  return {
    bodies: n,
    tickMeanFirst2s: +first.toFixed(3),
    tickMean: +(sorted.reduce((s, x) => s + x, 0) / ticks).toFixed(3),
    tickP95: +sorted[Math.floor(ticks * 0.95)].toFixed(3),
    asleepAtEnd: asleep,
    fellThrough: lost,
    hash: fnv(pos),
  };
}

export async function longrun(e, scene, { minutes = Number(globalThis.MINUTES ?? 10), players = 50 } = {}) {
  await e.init();
  e.build(scene, 32);
  const S = scene.spawns.length / 3;
  const spot = (k) => {
    const j = (k * 7919) % S;
    return [scene.spawns[j * 3], scene.spawns[j * 3 + 2] + 0.05, scene.spawns[j * 3 + 1]];
  };
  let next = 0;
  const live = [];
  for (let i = 0; i < players; i++) live.push({ id: e.addPlayer(...spot(next++)), vy: 0, g: false, k: next });
  e.step();
  const mem = () => {
    globalThis.gc?.(); // (JS garbage gone first: what's left is held)
    return { rss: typeof process !== "undefined" ? process.memoryUsage().rss : 0, heap: e.memory?.() ?? 0 };
  };
  // (warm: the first minute, then measure from there)
  const ticks = Math.round((minutes * 60) / DT);
  let m1 = null;
  let tMove = 0;
  for (let t = 0; t < ticks; t++) {
    if (t === 3600) m1 = mem();
    if (t % 60 === 0)
      for (let c = 0; c < 2; c++) {
        const i = (t / 60 + c * 17) % live.length;
        e.removePlayer(live[i].id);
        live[i] = { id: e.addPlayer(...spot(next++)), vy: 0, g: false, k: next };
      }
    const a = performance.now();
    for (const p of live) {
      const d = ((p.k * 5 + Math.floor(t / 120)) % 8) / 8;
      const vx = d < 0.5 ? 2 : -2;
      const vz = d < 0.25 || d >= 0.75 ? 2 : -2;
      if (p.g && t % 180 === p.k % 180) p.vy = 4.6;
      else if (p.g) p.vy = -1;
      else p.vy -= G * DT;
      p.g = e.move(p.id, vx * DT, p.vy * DT, vz * DT, p.vy <= 0);
    }
    e.step();
    tMove += performance.now() - a;
  }
  const m2 = mem();
  return {
    simMinutes: minutes,
    joinedAndLeft: next - players,
    tickMean: +(tMove / ticks).toFixed(3),
    rssGrowthMB: +((m2.rss - m1.rss) / 1048576).toFixed(1),
    engineHeapGrowthMB: m1.heap ? +((m2.heap - m1.heap) / 1048576).toFixed(2) : null,
  };
}
