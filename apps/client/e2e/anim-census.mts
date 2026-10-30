// Plan 58 phase 10 (docs/plan/58-the-animation.md): every clip on /dev/anim, worked out in node as the
// bench works it — its frames finite (no NaN anywhere: a joint, the hips, a hand's target) and its pops
// counted (a joint's speed breaking at a thousand samples a second: clips.ts `pops`), "after" (plan 58)
// beside "before". The limp clips' ragdoll stretch is the page's (Jolt): their keyed frames only here.
//   npx tsx e2e/anim-census.mts [group…]   (JSON=1: the table as JSON; SAVE=1: kept as the baseline,
//   e2e/anim-census.json; CHECK=1: against it — no NaN, and no clip's pops past its own by more than
//   a fifth or 3, whichever's more: exits 1 if so)

import { clipList, POP_RATE, pops, tabulate } from "@/app/dev/anim/clips";
import * as C from "@/world/chars";

await C.loadHero();
const H = C.heroNow();
if (!H) throw new Error("no hero");
const x = { C, H, T: 0 } as never;
const only = process.argv.slice(2);
const rows: { group: string; name: string; frames: number; bad: string; pops: number; before: number | null }[] = [];
for (const clip of clipList()) {
  if (only.length && !only.includes(clip.group)) continue;
  const live = !clip.raw;
  const fr = tabulate(x, clip, "after", live) ?? [];
  let bad = "";
  for (const f of fr) {
    for (const [j, r] of Object.entries(f.pose)) if (!(r as number[]).every(Number.isFinite)) bad ||= j;
    if (!f.lift.every(Number.isFinite)) bad ||= "lift";
    for (const h of Object.values(f.hands ?? {})) if (h && !h.at.every(Number.isFinite)) bad ||= "a hand";
  }
  const after = pops(tabulate(x, clip, "after", live, POP_RATE) ?? []).length;
  const b = tabulate(x, clip, "before", live, POP_RATE);
  rows.push({
    group: clip.group,
    name: clip.name,
    frames: fr.length,
    bad,
    pops: after,
    before: b ? pops(b).length : null,
  });
}
const BASE = new URL("./anim-census.json", import.meta.url);
if (process.env.SAVE) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(BASE, `${JSON.stringify(Object.fromEntries(rows.map((r) => [r.name, r.pops])), null, 1)}\n`);
}
if (process.env.CHECK) {
  const { readFileSync } = await import("node:fs");
  const base = JSON.parse(readFileSync(BASE, "utf8")) as Record<string, number>;
  const worse = rows.filter((r) => r.bad || r.pops > (base[r.name] ?? 0) + Math.max(3, 0.2 * (base[r.name] ?? 0)));
  for (const r of worse)
    console.log(`WORSE ${r.name}: ${r.bad ? `NaN ${r.bad}` : `${r.pops} pops (was ${base[r.name] ?? "—"})`}`);
  console.log(`${rows.length} clips; ${worse.length} worse`);
  process.exit(worse.length ? 1 : 0);
}
if (process.env.JSON) console.log(JSON.stringify(rows));
else
  for (const r of rows)
    console.log(
      `${r.group.padEnd(22)} ${r.name.padEnd(36)} ${String(r.frames).padStart(5)} ${r.bad ? `NaN: ${r.bad}` : "ok "} pops ${String(r.pops).padStart(3)}${r.before === null ? "" : ` (before ${r.before})`}`,
    );
