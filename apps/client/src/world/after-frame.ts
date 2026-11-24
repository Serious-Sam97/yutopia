// What an edit costs spread over the frames after it (docs/plan/122): each job in a task of its own just after a
// frame's drawn, one a frame — the land's blocks marked to be made again, the Grounds' solids, a chunk of the land.
// Laid on the frame that first asked for them, or all after the one frame, they were a frame missed at every publish.
const jobs: (() => void)[] = [];
let waiting = false;
/** `f` after a frame, the jobs asked before it each after one of their own (a hidden page's: a moment apart — it
 *  draws none). */
export function afterFrame(f: () => void) {
  jobs.push(f);
  if (!waiting) next();
}
/** `step` run after the frames, a slice of `budget` ms of it each (a job of the queue's each), till it says it's done. */
export function afterFrameSteps(step: () => boolean, budget = 1.5) {
  const go = () => {
    const t = performance.now();
    do if (step()) return;
    while (performance.now() - t < budget);
    afterFrame(go);
  };
  afterFrame(go);
}
function next() {
  waiting = true;
  let ran = false;
  const run = () => {
    if (ran) return;
    ran = true;
    waiting = false;
    const f = jobs.shift();
    if (jobs.length) next();
    f?.();
  };
  const late = setTimeout(run, 250);
  requestAnimationFrame(() =>
    setTimeout(() => {
      clearTimeout(late);
      run();
    }, 0),
  );
}
