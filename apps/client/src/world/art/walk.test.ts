import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_AVATAR, dirFromDelta, toScreen } from "@yutopia/shared";
import { walkPose } from "./avatar-motion";
import { apply, bones, type Pt } from "./avatar-rig";
import { avatarRig } from "./avatar-svg";
import { type View, viewFor } from "./views";

// People, angle by angle: every heading shows the view that faces it, and the
// walk in each view keeps a foot on the floor, strides the way it's going and
// swings the arms against the legs.

const HEADINGS: [number, number][] = [
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
];
// which way each drawn view faces on screen (unmirrored)
const FACES: Record<View, [number, number]> = { S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1], N: [0, -1] };
const sign = (v: number) => (Math.abs(v) < 1e-6 ? 0 : Math.sign(v));

test("every heading shows the view facing that way on screen", () => {
  for (const [dx, dy] of HEADINGS) {
    const s = toScreen(dx, dy);
    const { view, mirror } = viewFor(dirFromDelta(dx, dy));
    const [fx, fy] = FACES[view];
    assert.deepEqual(
      [sign(mirror ? -fx : fx), sign(fy)],
      [sign(s.x), sign(s.y)],
      `walking world (${dx},${dy}) shows ${view}${mirror ? " mirrored" : ""}`,
    );
  }
});

const VIEWS: View[] = ["S", "SW", "W", "NW", "N"];
const PHASES = Array.from({ length: 16 }, (_, i) => i / 16);

// the feet in a pose (board units): the front views' whole legs end at the
// floor (y 167); in profile the shins end at the ankle (y 160)
function feet(view: View, phase: number): { L: Pt; R: Pt; hipL: Pt; hipR: Pt } {
  const rig = avatarRig(DEFAULT_AVATAR, view, false);
  const b = bones(rig, walkPose(rig, phase, 1));
  const j = rig.joints;
  if (rig.side)
    return { L: apply(b.shinL, [j.kneeL[0], 160]), R: apply(b.shinR, [j.kneeR[0], 160]), hipL: j.hipL, hipR: j.hipR };
  return { L: apply(b.legL, [j.hipL[0], 167]), R: apply(b.legR, [j.hipR[0], 167]), hipL: j.hipL, hipR: j.hipR };
}

test("walking in every view, a foot stays on the floor", () => {
  for (const view of VIEWS) {
    // seen from above at an angle, a foot nearer you sits lower on screen and
    // one further away higher: the floor is a band as deep as a stride
    // (±0.085 of the 64-unit leg); in profile the ankles stay at 160
    const [lo, hi] = view === "W" ? [158.5, 161.5] : [161, 173];
    for (const ph of PHASES) {
      const { L, R } = feet(view, ph);
      const planted = Math.max(L[1], R[1]); // the lower foot
      assert.ok(planted > lo && planted < hi, `${view} at ${ph}: the planted foot is at ${planted.toFixed(1)}`);
      // and the other one never sinks through it
      assert.ok(Math.min(L[1], R[1]) > lo - 14, `${view} at ${ph}: the lifted foot stays near the floor`);
    }
  }
});

test("on a diagonal the stride runs along it; head-on it doesn't", () => {
  for (const view of ["SW", "NW"] as View[]) {
    // a quarter into the cycle the left leg reaches forward (towards −x, the heading), the right one back
    const a = feet(view, 0.25);
    assert.ok(a.L[0] < a.hipL[0] - 4, `${view}: the reaching foot goes the way it's walking`);
    assert.ok(a.R[0] > a.hipR[0] + 4, `${view}: the trailing foot behind`);
    const b = feet(view, 0.75);
    assert.ok(b.R[0] < b.hipR[0] - 4 && b.L[0] > b.hipL[0] + 4, `${view}: and the other way half a cycle on`);
  }
  for (const view of ["S", "N"] as View[])
    for (const ph of PHASES) {
      const { L, R, hipL, hipR } = feet(view, ph);
      // (the hips sway over the planted foot: a little either way)
      assert.ok(Math.abs(L[0] - hipL[0]) < 5 && Math.abs(R[0] - hipR[0]) < 5, `${view} at ${ph}: steps under the hips`);
    }
  // in profile the near leg reaches forward (−x) a quarter in
  const w = feet("W", 0.25);
  assert.ok(w.R[0] < w.L[0] - 10, "W: a long stride");
});

test("the arms swing against the legs", () => {
  for (const view of VIEWS) {
    const rig = avatarRig(DEFAULT_AVATAR, view, false);
    const p = walkPose(rig, 0.25, 1); // left leg forward…
    if (rig.side) {
      // …the near (right) arm swings back (−), the far one forward
      assert.ok(p.armR.sh < -10 && p.armL.sh > 10, `${view}: arms against the legs`);
    } else if (rig.quarter) {
      assert.ok(p.armR.sh > p.armL.sh + 10, `${view}: the right arm forward (towards the heading)`);
    } else {
      // …the right arm comes forward: it bends and shortens towards the viewer
      assert.ok(p.armR.sf < p.armL.sf && p.armR.el > 10, `${view}: the right arm forward`);
    }
  }
});
