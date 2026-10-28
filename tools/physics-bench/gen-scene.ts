// The real Grounds as an engine-neutral scene: the land's heights (1 m apart) and every tile you
// can't walk as a box (merged along rows), 2.5 m over the ground there. Same file for both engines.
import { writeFileSync } from "node:fs";
import { GROUNDS, heightAt, walkableTile } from "../../packages/shared/src/grounds.ts";

function scene(name: string, x0: number, z0: number, w: number, d: number) {
  const t0 = performance.now();
  const heights = new Float32Array((w + 1) * (d + 1)); // [iz * (w+1) + ix]: (x0 + ix, z0 + iz)
  for (let iz = 0; iz <= d; iz++)
    for (let ix = 0; ix <= w; ix++) heights[iz * (w + 1) + ix] = heightAt(x0 + ix, z0 + iz);
  const boxes: number[] = []; // x, z (centre), hx, hz, base, top
  for (let iz = 0; iz < d; iz++) {
    let run = -1;
    let lo = 0;
    let hi = 0;
    const flush = (end: number) => {
      if (run < 0) return;
      boxes.push(x0 + (run + end) / 2, z0 + iz + 0.5, (end - run) / 2, 0.5, lo - 0.5, hi + 2.5);
      run = -1;
    };
    for (let ix = 0; ix < w; ix++) {
      const blocked = !walkableTile(x0 + ix, z0 + iz);
      const g = heightAt(x0 + ix + 0.5, z0 + iz + 0.5);
      if (!blocked) {
        flush(ix);
        continue;
      }
      if (run >= 0 && (Math.abs(g - lo) > 0.4 || Math.abs(g - hi) > 0.4)) flush(ix);
      if (run < 0) {
        run = ix;
        lo = hi = g;
      } else {
        lo = Math.min(lo, g);
        hi = Math.max(hi, g);
      }
    }
    flush(w);
  }
  // spawn spots: walkable tiles, spread out
  const spawns: number[] = [];
  for (let iz = 8; iz < d - 8; iz += 9)
    for (let ix = 8; ix < w - 8; ix += 9)
      if (walkableTile(x0 + ix, z0 + iz))
        spawns.push(x0 + ix + 0.5, z0 + iz + 0.5, heightAt(x0 + ix + 0.5, z0 + iz + 0.5));
  const out = { name, x0, z0, w, d, heights: Array.from(heights), boxes, spawns };
  writeFileSync(new URL(`./${name}.json`, import.meta.url), JSON.stringify(out));
  console.log(
    name,
    `${w}x${d}`,
    "boxes",
    boxes.length / 6,
    "spawns",
    spawns.length / 3,
    `${Math.round(performance.now() - t0)} ms`,
  );
}
scene("area", -148, -108, 256, 256);
scene("full", GROUNDS.x0, GROUNDS.z0, GROUNDS.x1 - GROUNDS.x0, GROUNDS.z1 - GROUNDS.z0);
