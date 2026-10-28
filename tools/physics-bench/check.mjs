// The bench as CI's check (plan 50, guardrails 3–4): Jolt's behaviour, its determinism against the
// hashes recorded in RESULTS.md, and its heap flat over a long session. Each run in its own Node
// (a fresh Jolt, as the hashes were recorded). Exits 1 on any miss.
//   node check.mjs            (makes the scenes first if they're missing)
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const here = new URL(".", import.meta.url).pathname;
// (the hashes hold for this build only: Jolt moves with the bench, never alone)
const JOLT = "1.1.1";
const HASH = { players: "68ea128e", area: "d430410a", full: "a54956d2" };
const MINUTES = 20;

const require = createRequire(import.meta.url);
const version = require("jolt-physics/package.json").version;
let failed = false;
const report = (name, ok, detail) => {
  failed ||= !ok;
  console.log(`[physics] ${ok ? "ok  " : "FAIL"} ${name.padEnd(36)} ${detail}`);
};
report("jolt-physics version", version === JOLT, `${version} (hashes recorded on ${JOLT})`);

if (!existsSync(`${here}area.json`) || !existsSync(`${here}full.json`)) {
  const r = spawnSync("npx", ["tsx", "gen-scene.ts"], { cwd: here, stdio: "inherit" });
  if (r.status !== 0) process.exit(1);
}

/** One run of a runner; its last line of output is its result (JSON). */
function run(args, env = {}) {
  const r = spawnSync("node", args, { cwd: here, encoding: "utf8", env: { ...process.env, ...env } });
  if (r.status !== 0) {
    process.stderr.write(r.stdout + r.stderr);
    return null;
  }
  return JSON.parse(r.stdout.trim().split("\n").at(-1));
}

const b = run(["node-round2.mjs", "jolt", "behaviour"]);
const lanes = b ? Object.entries(b).filter(([, v]) => typeof v === "object") : [];
for (const [name, v] of lanes) report(`behaviour: ${name}`, v.pass, `${v.want} — x ${v.x}, y ${v.y}, dz ${v.dz}`);
if (lanes.length !== 8) report("behaviour", false, `${lanes.length} of 8 lanes ran`);

const p = run(["node-run.mjs", "jolt", "area", "50", "60", "32"]);
report(
  "hash: players, area 50",
  p?.hash === HASH.players,
  `${p?.hash} (want ${HASH.players}; ${p?.tickMean} ms a tick)`,
);

for (const scene of ["area", "full"]) {
  const d = run(["node-round2.mjs", "jolt", "dynamics", scene, "ccd"]);
  report(
    `hash: dynamics, ${scene}+ccd`,
    d?.hash === HASH[scene],
    `${d?.hash} (want ${HASH[scene]}; ${d?.fellThrough} of ${d?.bodies} fell through)`,
  );
}

// (2,400 joins over the session: a leak of even a character each would show as megabytes)
const l = run(["--expose-gc", "node-round2.mjs", "jolt", "longrun", "area"], { MINUTES: String(MINUTES) });
report(
  `long session, ${MINUTES} min`,
  l !== null && l.engineHeapGrowthMB !== null && Math.abs(l.engineHeapGrowthMB) < 0.25,
  `Jolt's heap ${l?.engineHeapGrowthMB} MB, the process ${l?.rssGrowthMB} MB over ${l?.joinedAndLeft} joins`,
);

// the game's own physics world (packages/shared/src/physics): the whole world loaded with 300 bodies
// and 500 things, nothing refused (guardrail 1); 20 minutes of people, things and edits with Jolt's
// heap flat (guardrail 3)
const SOAK = "../../packages/shared/src/physics/soak.ts";
const whole = run(["--import", "tsx", SOAK, "whole"]);
report(
  "PhysicsWorld: the whole world",
  whole !== null && whole.refused === 0 && whole.fellThrough === 0,
  `${whole?.bodies} of ${whole?.maxBodies} bodies, ${whole?.characters} bodies walking, ${whole?.things} things, ${whole?.refused} refused, ${whole?.fellThrough} fell through; ${whole?.tickMean} ms a tick`,
);
const soak = run(["--expose-gc", "--import", "tsx", SOAK, "long"], { MINUTES: String(MINUTES) });
report(
  `PhysicsWorld: ${MINUTES} min of joins`,
  soak !== null && soak.refused === 0 && Math.abs(soak.heapGrowthMB) < 0.25,
  `Jolt's heap ${soak?.heapGrowthMB} MB over ${soak?.joinedAndLeft} joins, things and edits`,
);

// the Grounds' walking against their solids (docs/plan/50 phase 4): the grid's tiles and Jolt's shapes
// agree but for what's by design (packages/shared/src/physics/audit.ts)
const audited = run(["--import", "tsx", "../../packages/shared/src/physics/audit.ts", "--check"]);
report(
  "the Grounds: walking = solids",
  audited !== null && audited.failures.length === 0,
  audited
    ? `${audited.tiles} tiles in ${audited.ms} ms${audited.failures.length ? `: ${audited.failures.join("; ")}` : ""}`
    : "failed",
);

// pinned exactly wherever it's a dependency: the bench and the game move together
for (const p of ["package.json", "../../packages/shared/package.json"]) {
  const pkg = readFileSync(`${here}${p}`, "utf8");
  report(`jolt-physics pinned: ${p.replace("../../", "")}`, pkg.includes(`"jolt-physics": "${JOLT}"`), JOLT);
}
process.exit(failed ? 1 : 0);
