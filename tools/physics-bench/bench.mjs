// biome-ignore-all lint/suspicious/noApproximativeNumericConstant: the inputs are exact literals, the same on every host; Math.SQRT1_2 and the like would move the recorded hashes
// The bench, the same for both engines and every host (Node, Chrome, Firefox): a scene of the
// real Grounds (gen-scene.ts), N players on it — walking, running, jumping, 1 in 5 flying —
// driven by inputs that are a pure function of (player, time) with exact arithmetic (no Math.sin:
// the hosts' own maths mustn't make the inputs differ), stepped at 60 Hz. What comes out: how
// long the scene took to build, the time a tick takes (all players moved + the world stepped),
// a hash of every player's position at the end (determinism), and a sanity check of the terrain.

// 16 directions, exact constants (cos, sin of k·22.5°)
const DIRS = [
  [1, 0],
  [0.9238795325, 0.3826834324],
  [0.7071067812, 0.7071067812],
  [0.3826834324, 0.9238795325],
  [0, 1],
  [-0.3826834324, 0.9238795325],
  [-0.7071067812, 0.7071067812],
  [-0.9238795325, 0.3826834324],
  [-1, 0],
  [-0.9238795325, -0.3826834324],
  [-0.7071067812, -0.7071067812],
  [-0.3826834324, -0.9238795325],
  [0, -1],
  [0.3826834324, -0.9238795325],
  [0.7071067812, -0.7071067812],
  [0.9238795325, -0.3826834324],
];
const SPEEDS = [0, 2.2, 4.2, 4.2, 6.8];
function rnd(a, b) {
  // a small integer hash → [0, 1)
  let h = (Math.imul(a, 0x9e3779b1) ^ Math.imul(b + 0x632be5ab, 0x85ebca77)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export const DT = 1 / 60;
const G = 9.81;
const JUMP = 4.6; // m/s up: a hop of ~1.1 m

/** What player i wants at tick t: its horizontal velocity, a jump, and (fliers) its climb. */
function input(i, t) {
  const seg = Math.floor(t / 120); // a new intent every 2 s
  const r1 = rnd(i, seg * 3 + 1);
  const dir = DIRS[Math.floor(r1 * 16)];
  const speed = SPEEDS[Math.floor(rnd(i, seg * 3 + 2) * SPEEDS.length)];
  const jump = t % 120 === 30 && rnd(i, seg * 3 + 3) < 0.3;
  const climb = (Math.floor(rnd(i + 7777, seg) * 3) - 1) * 3; // fliers: -3, 0 or +3 m/s
  return { vx: dir[0] * speed, vz: dir[1] * speed, jump, climb };
}

function fnv(f32) {
  const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  let h = 0x811c9dc5;
  for (let k = 0; k < u8.length; k++) h = Math.imul(h ^ u8[k], 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/**
 * engine: { name, init(), build(scene), addPlayer(x, y, z) → id, move(id, dx, dy, dz) → grounded,
 *           position(id, out[3]), step(), raycastDown(x, z) → y | null, memory() → bytes|null }
 */
export async function run(engine, scene, { players = 50, seconds = 60, chunk = 0, log = () => {} } = {}) {
  const now = () => performance.now();
  const t0 = now();
  await engine.init();
  const tInit = now() - t0;
  const t1 = now();
  engine.build(scene, chunk);
  const tBuild = now() - t1;
  // the terrain where it should be: down onto the spawn spots (walkable: no box there)
  let worst = 0;
  const S = scene.spawns.length / 3;
  for (let k = 0; k < Math.min(S, 200); k++) {
    const j = Math.floor((k * S) / Math.min(S, 200));
    // (spawns: x, z, the ground's height there)
    const x = scene.spawns[j * 3];
    const z = scene.spawns[j * 3 + 1];
    const y = engine.raycastDown(x, z);
    worst = Math.max(worst, y === null ? 999 : Math.abs(y - scene.spawns[j * 3 + 2]));
  }
  // the players, on spawn spots spread over the scene; one in five flies
  const ids = [];
  const vy = new Float64Array(players);
  const flier = (i) => i % 5 === 4;
  for (let i = 0; i < players; i++) {
    const j = Math.floor((i * S) / players) % S;
    ids.push(engine.addPlayer(scene.spawns[j * 3], scene.spawns[j * 3 + 2] + 0.05, scene.spawns[j * 3 + 1]));
  }
  engine.step();
  const ticks = Math.round(seconds / DT);
  const times = new Float64Array(ticks);
  const grounded = new Uint8Array(players);
  // (that they really move: how far, and how much of the time a walker's on the ground)
  const start = [];
  const q = [0, 0, 0];
  for (let i = 0; i < players; i++) {
    engine.position(ids[i], q);
    start.push([q[0], q[1], q[2]]);
  }
  let onGround = 0;
  let walkerTicks = 0;
  for (let t = 0; t < ticks; t++) {
    const a = now();
    for (let i = 0; i < players; i++) {
      const inp = input(i, t);
      if (flier(i)) vy[i] = inp.climb;
      else if (grounded[i] && inp.jump) vy[i] = JUMP;
      else if (grounded[i])
        vy[i] = -0.1; // (a light push down: snap-to-ground keeps it on slopes; Rapier won't autostep under a hard one)
      else vy[i] -= G * DT;
      // (snapped to the ground only walking and not on the way up)
      grounded[i] = engine.move(ids[i], inp.vx * DT, vy[i] * DT, inp.vz * DT, !flier(i) && vy[i] <= 0) ? 1 : 0;
    }
    engine.step();
    times[t] = now() - a;
    for (let i = 0; i < players; i++)
      if (!flier(i)) {
        walkerTicks++;
        onGround += grounded[i];
      }
  }
  const pos = new Float32Array(players * 3);
  const p = [0, 0, 0];
  let flying = 0;
  for (let i = 0; i < players; i++) {
    engine.position(ids[i], p);
    pos[i * 3] = p[0];
    pos[i * 3 + 1] = p[1];
    pos[i * 3 + 2] = p[2];
    if (flier(i) && p[1] - start[i][1] > 3) flying++;
  }
  let moved = 0;
  for (let i = 0; i < players; i++) moved += Math.hypot(pos[i * 3] - start[i][0], pos[i * 3 + 2] - start[i][2]);
  const sorted = Array.from(times).sort((x, y) => x - y);
  const mean = sorted.reduce((s, x) => s + x, 0) / ticks;
  const out = {
    engine: engine.name,
    scene: scene.name + (chunk ? `/chunk${chunk}` : ""),
    players,
    initMs: +tInit.toFixed(1),
    buildMs: +tBuild.toFixed(1),
    terrainErr: +worst.toFixed(3),
    tickMean: +mean.toFixed(3),
    tickP95: +sorted[Math.floor(ticks * 0.95)].toFixed(3),
    tickMax: +sorted[ticks - 1].toFixed(3),
    perPlayerUs: +((mean / players) * 1000).toFixed(1),
    hash: fnv(pos),
    fliersUp: flying,
    movedMean: +(moved / players).toFixed(1),
    groundedShare: +(onGround / Math.max(1, walkerTicks)).toFixed(2),
    memory: engine.memory?.() ?? null,
  };
  log(out);
  return out;
}
