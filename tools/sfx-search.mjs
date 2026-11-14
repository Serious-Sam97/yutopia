// The sound candidates' search (plans 79, 88): each slot's searches on Freesound — CC0 only, the most downloaded
// first — read from the search page (plain curl, 4 s apart: Freesound refuses a machine that asks fast, plan 63),
// the first few of a fitting length kept, written to a list json for tools/sfx-weather.mjs to fetch and cut. A slot
// already in the json keeps its `pick` (and `take`).
//   slots: { slot: [kind, [queries], [min s, max s], how many] } — kind: shot (cut into its events), loop (a bed)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const attr = (block, name) => {
  const m = block.match(new RegExp(`${name}="([^"]*)"`));
  return m
    ? m[1]
        .replace(/&amp;/g, "&")
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
    : "";
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function search(q) {
  const url = `https://freesound.org/search/?q=${encodeURIComponent(q).replace(/%20/g, "+")}&f=license%3A%22Creative+Commons+0%22&s=Downloads+desc`;
  const html = execFileSync("curl", ["-s", "-A", "yutopia-sfx/1.0", url], { maxBuffer: 1 << 26 }).toString();
  return html
    .split('class="bw-player"')
    .slice(1)
    .map((b) => {
      const id = attr(b, "data-sound-id");
      const uid = attr(b, "data-user-id");
      return {
        id,
        user: attr(b, "data-username"),
        title: attr(b, "data-title"),
        preview: `https://cdn.freesound.org/previews/${Math.floor(Number(id) / 1000)}/${id}_${uid}-hq.mp3`,
        url: `https://freesound.org/people/${attr(b, "data-username")}/sounds/${id}/`,
        dur: Math.round(Number(attr(b, "data-duration")) * 10) / 10,
        downloads: Number(attr(b, "data-num-downloads")) || 0,
      };
    })
    .filter((r) => r.id);
}

/** Every slot's candidates (only those in `only`, if given) into `out`'s json, under its header `_`. */
export async function searchSlots(slots, out, header, only) {
  const had = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : {};
  const all = { ...had, _: header };
  for (const [slot, [kind, queries, [lo, hi], n]] of Object.entries(slots)) {
    if (only && !only.includes(slot)) continue;
    const seen = new Set();
    const from = [];
    for (const q of queries) {
      if (from.length >= n) break;
      let rs = [];
      try {
        rs = await search(q);
      } catch (e) {
        console.log(`  ${slot}: "${q}" failed (${e.message})`);
      }
      await sleep(4000);
      for (const r of rs) {
        if (from.length >= n) break;
        if (seen.has(r.id) || r.dur < lo || r.dur > hi) continue;
        seen.add(r.id);
        from.push({ ...r, note: `"${q}"` });
      }
    }
    const keep = had[slot] ?? {};
    all[slot] = {
      kind,
      from,
      ...(keep.pick !== undefined ? { pick: keep.pick } : {}),
      ...(keep.take !== undefined ? { take: keep.take } : {}),
    };
    console.log(`${slot}: ${from.length} — ${from.map((f) => `${f.title} (${f.dur}s)`).join(" · ")}`);
    writeFileSync(out, `${JSON.stringify(all, null, 2)}\n`);
  }
}
