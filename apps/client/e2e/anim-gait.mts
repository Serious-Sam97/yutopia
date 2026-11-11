/* biome-ignore-all lint/suspicious/noExplicitAny: reads the bench's window hooks */
// Plan 77 phase 0 — the gait report: a gait clip on /dev/anim (the dev client on :3100, the GPU), its
// steady part frame by frame at 120 Hz, against a real person's numbers at that speed (Perry; Winter;
// running from Novacheck). The knee's flexion at heel strike, through the stance and at its peak in the
// swing; the thigh forward and behind; the hips' highest against standing; steps a minute and a step's
// length; the speed; how far a flat foot's ankle is over where it stands (floating, or sunk). Knees count
// from the body's own straight leg. On the life body by default (the bones as drawn: the life legs fitted).
//   node --experimental-strip-types e2e/anim-gait.mts walk jog run sprint [-- --classic] [--woman]
import { chromium } from "@playwright/test";

type Range = [number, number];
/** what a real person shows at the game's speeds (plan 77, "Found"); steps and cadence for the rig's leg
 *  (0.80 m, hip to ankle: the woman's own) — a ~0.9 m leg's ×0.9 the step, ×1.1 the cadence */
const REAL: Record<string, Record<string, Range>> = {
  walk: {
    "knee at contact °": [0, 8],
    "knee least in stance °": [-5, 10],
    "a flat foot over the floor cm": [-0.3, 0.3],
    "knee most in swing °": [55, 70],
    "thigh forward °": [20, 32],
    "thigh behind °": [-22, -10],
    "hips' top vs standing cm": [-1.5, 0.5],
    "steps a minute": [118, 140],
    "step m": [0.62, 0.76],
  },
  jog: {
    "knee at contact °": [12, 28],
    "knee most in stance °": [35, 50],
    "knee most in swing °": [90, 130],
    "thigh forward °": [35, 55],
    "thigh behind °": [-25, -8],
    "steps a minute": [180, 210],
    "step m": [1.4, 1.67],
  },
  run: {
    "knee at contact °": [15, 30],
    "knee most in stance °": [35, 50],
    "knee most in swing °": [100, 135],
    "thigh forward °": [45, 65],
    "thigh behind °": [-25, -8],
    "steps a minute": [210, 248],
    "step m": [1.58, 1.8],
  },
  sprint: {
    "knee at contact °": [18, 32],
    "knee most in stance °": [35, 52],
    "knee most in swing °": [110, 140],
    "thigh forward °": [55, 75],
    "thigh behind °": [-28, -10],
    "steps a minute": [253, 297],
    "step m": [1.67, 1.94],
  },
};

const args = process.argv.slice(2);
const classic = args.includes("--classic");
const woman = args.includes("--woman");
// (--trace: the right leg frame by frame too — knee from straight, thigh, ankle over standing, contact)
const trace = args.includes("--trace");
// (--gait=old: a walk's style — calm, bouncy, heavy, brisk, tired, old)
const gait = args.find((a) => a.startsWith("--gait="))?.slice(7);
const clips = args.filter((a) => !a.startsWith("--"));
const b = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
p.on("pageerror", (e) => console.log("  error:", e.message));
for (const clip of clips) {
  await p.goto(
    `http://localhost:3100/dev/anim?clip=${encodeURIComponent(clip)}&live=${process.env.RAW ? 0 : 1}&compare=0&trail=0&play=0&view=side` +
      (woman ? "&gender=feminine" : "&gender=masculine&hair=short") +
      (classic ? "" : "&look=life") +
      (gait ? `&gait=${gait}` : ""),
  );
  await p.waitForFunction(() => (window as any).__anim?.ready === true, null, { timeout: 180_000 });
  await p.waitForTimeout(classic ? 800 : 4000);
  const got = await p.evaluate(async () => {
    const A = (window as any).__anim;
    const m = A.sway().after;
    const n = A.bench.feet.down.length;
    // the steady part: from 0.8 s in to 0.3 s before the end
    const i0 = Math.min(n - 1, 96);
    const i1 = Math.max(i0 + 1, n - 36);
    const V = m.bones.hips.position.constructor;
    const W = (j: string) => m.bones[j].getWorldPosition(new V());
    const kneeOf = (S: string) => {
      const th = W(`thigh${S}`);
      const kn = W(`knee${S}`);
      const an = W(`ankle${S}`);
      const u = kn.clone().sub(th).normalize();
      const v = an.clone().sub(kn).normalize();
      return { u, an, deg: (Math.acos(Math.max(-1, Math.min(1, u.dot(v)))) * 180) / Math.PI };
    };
    // the body standing (its rest): a life leg's joints sit a little off one line even straight
    // (MakeHuman's knee in front: ~6°), so a knee's flexion counts from its rest; its ankle there is
    // where a flat foot's is on the ground
    A.seek(0);
    await new Promise((r) => setTimeout(r, 40));
    m.setPose({}, [0, 0, 0]);
    m.root.updateMatrixWorld(true);
    const restKnee = [kneeOf("L").deg, kneeOf("R").deg];
    const restAnkle = [kneeOf("L").an.y, kneeOf("R").an.y].map((y) => y - m.root.position.y);
    const f: { t: number; knee: [number, number]; thigh: [number, number]; ankle: any[]; hips: number; root: any }[] =
      [];
    for (let i = i0; i <= i1; i++) {
      A.seek(i / 120);
      await new Promise((r) => setTimeout(r, 25));
      m.root.updateMatrixWorld(true);
      const fwd = new V(0, 0, 1).applyQuaternion(m.root.quaternion);
      const knee: [number, number] = [0, 0];
      const thigh: [number, number] = [0, 0];
      const ankle: any[] = [];
      for (const [k, S] of ["L", "R"].entries()) {
        const q = kneeOf(S);
        knee[k] = q.deg - restKnee[k];
        thigh[k] = (Math.atan2(q.u.dot(fwd), -q.u.y) * 180) / Math.PI;
        ankle.push(q.an);
      }
      f.push({ t: i / 120, knee, thigh, ankle, hips: W("hips").y - m.root.position.y, root: m.root.position.clone() });
    }
    // a foot's down while it's slow and near its lowest (the bench's own lanes split a walk's stance as
    // the life sole rolls): under 0.3 m/s across the ground, within 3.5 cm of its lowest (a heel strike's
    // ankle is ~2 cm over a flat foot's); a change counts once it holds 50 ms
    const low = [0, 1].map((s) => Math.min(...f.map((x) => x.ankle[s].y)));
    // (at a run the planted ankle goes round the ball faster and higher: the limits grow with the speed)
    const spd =
      Math.hypot(f[f.length - 1].root.x - f[0].root.x, f[f.length - 1].root.z - f[0].root.z) /
      Math.max(1e-6, f[f.length - 1].t - f[0].t);
    const vMax = Math.max(0.3, 0.13 * spd);
    const yMax = 0.035 + 0.006 * spd;
    const rawDown: boolean[][] = f.map((x, k) =>
      [0, 1].map((s) => {
        const prev = f[Math.max(0, k - 1)].ankle[s];
        const next = f[Math.min(f.length - 1, k + 1)].ankle[s];
        const v = Math.hypot(next.x - prev.x, next.z - prev.z) / (2 / 120);
        return v < vMax && x.ankle[s].y - low[s] < yMax;
      }),
    );
    const down: boolean[][] = rawDown.map((d) => [...d]);
    for (const s of [0, 1]) {
      let cur = rawDown[0][s];
      for (let k = 0; k < f.length; k++) {
        if (rawDown[k][s] !== cur) {
          let held = true;
          for (let q = k; q < Math.min(f.length, k + 6); q++) if (rawDown[q][s] === cur) held = false;
          if (held) cur = rawDown[k][s];
        }
        down[k][s] = cur;
      }
    }
    const standing = m.restHips[1];
    // contacts (a foot coming down) and lift-offs, each foot
    const ev: { t: number; side: number; at: any; knee: number }[] = [];
    const stance: number[][] = [[], []];
    const stanceMax: number[] = [];
    const stanceMin: number[] = [];
    const swingMax: number[] = [];
    for (const side of [0, 1]) {
      let inStance = false;
      let mn = 999;
      let mx = -999;
      let sw = -999;
      for (let k = 1; k < f.length; k++) {
        const d = down[k][side];
        const was = down[k - 1][side];
        if (d && !was) {
          ev.push({ t: f[k].t, side, at: f[k].ankle[side], knee: f[k].knee[side] });
          if (sw > -999) swingMax.push(sw);
          inStance = true;
          mn = 999;
          mx = -999;
        } else if (!d && was && inStance) {
          stanceMin.push(mn);
          stanceMax.push(mx);
          stance[side].push(f[k].t);
          inStance = false;
          sw = -999;
        }
        if (d) {
          mn = Math.min(mn, f[k].knee[side]);
          mx = Math.max(mx, f[k].knee[side]);
        } else sw = Math.max(sw, f[k].knee[side]);
      }
    }
    ev.sort((a, b) => a.t - b.t);
    const gaps: number[] = [];
    const steps: number[] = [];
    for (let k = 1; k < ev.length; k++)
      if (ev[k].side !== ev[k - 1].side) {
        gaps.push(ev[k].t - ev[k - 1].t);
        steps.push(Math.hypot(ev[k].at.x - ev[k - 1].at.x, ev[k].at.z - ev[k - 1].at.z));
      }
    const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : Number.NaN);
    const thighs = f.flatMap((x) => x.thigh);
    const dur = f[f.length - 1].t - f[0].t;
    const r0 = f[0].root;
    const r1 = f[f.length - 1].root;
    const rows = f.map(
      (x, k) =>
        `    ${x.t.toFixed(3)} knee ${x.knee[1].toFixed(0).padStart(3)} thigh ${x.thigh[1].toFixed(0).padStart(4)} ` +
        `ankle ${((x.ankle[1].y - x.root.y - restAnkle[1]) * 100).toFixed(1).padStart(5)} cm${down[k][1] ? " down" : ""}`,
    );
    return {
      rows,
      "knee at contact °": mean(ev.map((e) => e.knee)),
      "knee least in stance °": mean(stanceMin),
      "knee most in stance °": mean(stanceMax),
      "knee most in swing °": mean(swingMax),
      "thigh forward °": Math.max(...thighs),
      "thigh behind °": Math.min(...thighs),
      "hips' top vs standing cm": (Math.max(...f.map((x) => x.hips)) - standing) * 100,
      "a flat foot over the floor cm": Math.min(
        ...[0, 1].map((s) => (Math.min(...f.map((x) => x.ankle[s].y - x.root.y)) - restAnkle[s]) * 100),
      ),
      "hips' bob cm": (Math.max(...f.map((x) => x.hips)) - Math.min(...f.map((x) => x.hips))) * 100,
      "steps a minute": 60 / mean(gaps),
      "step m": mean(steps),
      "speed m/s": Math.hypot(r1.x - r0.x, r1.z - r0.z) / dur,
      contacts: ev.length,
    } as Record<string, number> & { rows: string[] };
  });
  if (trace) console.log(got.rows.join("\n"));
  // (a clip's real numbers by its gait: "walk hurt", "aside left, walk" are walks)
  const kind = ["sprint", "run", "jog", "walk"].find((k) => clip.includes(k)) ?? clip.split(/[ ,]/)[0];
  const real = REAL[kind] ?? {};
  console.log(
    `\n${clip}${gait ? ` [${gait}]` : ""} (${classic ? "classic" : "life"}, ${woman ? "the woman" : "the man"})`,
  );
  let off = 0;
  for (const [k, v] of Object.entries(got)) {
    if (typeof v !== "number") continue;
    const r = real[k];
    const ok = !r || (v >= r[0] && v <= r[1]);
    if (!ok) off++;
    console.log(
      `  ${k.padEnd(26)} ${Number.isFinite(v) ? v.toFixed(k.includes("m/s") || k === "step m" ? 2 : 1).padStart(7) : "    —"}` +
        (r ? `   real ${r[0]}…${r[1]}${ok ? "" : "   ✗"}` : ""),
    );
  }
  console.log(`  ${off ? `${off} out of range` : "all in range"}`);
}
await b.close();
