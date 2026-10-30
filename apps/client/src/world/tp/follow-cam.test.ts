import assert from "node:assert/strict";
import { test } from "node:test";
import { type CamIn, FollowCam } from "./follow-cam";

// The KH camera (docs/plan/56-the-controls.md D).

const DT = 1 / 60;
const still = (o: Partial<CamIn> = {}): CamIn => ({
  dt: DT,
  look: { x: 0, y: 0 },
  recenter: false,
  yaw: 0,
  vx: 0,
  vy: 0,
  air: 0,
  run: 5.8,
  dash: 8.2,
  ...o,
});
const runFor = (c: FollowCam, secs: number, inp: (t: number) => Partial<CamIn>) => {
  for (let t = 0; t < secs; t += DT) c.update(still(inp(t)));
};
const angle = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

test("a press puts it behind you in its 0.2 s, at rest's pitch", () => {
  const c = new FollowCam();
  c.yaw = 2.5;
  c.pitch = 0.7;
  c.update(still({ recenter: true, yaw: -1 }));
  runFor(c, 0.2, () => ({ yaw: -1 }));
  assert.ok(angle(c.yaw, -1) < 1e-3, `yaw ${c.yaw}`);
  assert.ok(Math.abs(c.pitch - c.tune.pitch) < 1e-3, `pitch ${c.pitch}`);
});

test("it comes round behind a run; across the way slower; never round to your face", () => {
  const ahead = new FollowCam();
  ahead.yaw = 0;
  // running 20° off where it looks: in behind in about a second
  runFor(ahead, 1.2, () => ({ vx: 5.8 * Math.cos(0.35), vy: 5.8 * Math.sin(0.35) }));
  assert.ok(angle(ahead.yaw, 0.35) < 0.05, `ahead: ${ahead.yaw}`);
  const across = new FollowCam();
  runFor(across, 0.5, () => ({ vx: 0, vy: 5.8 }));
  const straight = new FollowCam();
  runFor(straight, 0.5, () => ({ vx: 5.8 * Math.cos(0.4), vy: 5.8 * Math.sin(0.4) }));
  assert.ok(across.yaw > 0.1 && across.yaw / (Math.PI / 2) < straight.yaw / 0.4, "across comes round slower");
  const back = new FollowCam();
  runFor(back, 2, () => ({ vx: -5.8, vy: 0.2 }));
  assert.ok(angle(back.yaw, 0) < 0.05, `ran at it: ${back.yaw}`);
});

test("turned by hand it waits before following again; the stick ramps in on a curve", () => {
  const c = new FollowCam();
  runFor(c, 0.3, () => ({ look: { x: 1, y: 0 } }));
  const turned = c.yaw;
  runFor(c, 0.4, () => ({ vx: 5.8, vy: 0 }));
  assert.ok(angle(c.yaw, turned) < 1e-6, "it held where I left it");
  const full = new FollowCam();
  const half = new FollowCam();
  full.update(still({ look: { x: 1, y: 0 } }));
  const first = full.yaw;
  runFor(full, 0.3, () => ({ look: { x: 1, y: 0 } }));
  runFor(half, 0.3 + DT, () => ({ look: { x: 0.5, y: 0 } }));
  assert.ok(first < (full.yaw / 0.3) * DT * 0.5, "the first frame is slow");
  assert.ok(half.yaw < full.yaw * 0.4, "half a tilt is less than half the speed");
});

test("it pulls back in a dash and up in the air; a locked-on target is faced", () => {
  const c = new FollowCam();
  runFor(c, 2, () => ({ vx: 8.2, vy: 0, air: 2 }));
  assert.ok(c.dist > c.tune.dist + c.tune.dashPull + c.tune.airPull - 0.1, `dist ${c.dist}`);
  const l = new FollowCam();
  runFor(l, 1, () => ({ lock: { dx: 0, dy: 5 }, look: { x: 1, y: 0 } }));
  assert.ok(angle(l.yaw, Math.PI / 2) < 0.02, `locked: ${l.yaw}`);
});

test("the mouse turns it by how far it moves, and it waits before following again", () => {
  const c = new FollowCam();
  c.mouse(100, 0);
  assert.ok(Math.abs(c.yaw - 100 * c.tune.mouse) < 1e-9, `yaw ${c.yaw}`);
  c.mouse(0, -1000);
  assert.ok(Math.abs(c.pitch - c.tune.pitch) < 1e-9, "a jump past 400 px is dropped");
  c.mouse(0, 50);
  assert.ok(c.pitch > c.tune.pitch, "down tilts it down");
  const turned = c.yaw;
  runFor(c, 0.4, () => ({ vx: 5.8, vy: 0 }));
  assert.ok(Math.abs(c.yaw - turned) < 1e-9, "held where the mouse left it");
  runFor(c, 1.5, () => ({ vx: 5.8, vy: 0 }));
  assert.ok(Math.abs(c.yaw) < 0.05, `then back behind the run: ${c.yaw}`);
  const l = new FollowCam();
  l.mouse(300, 0, true);
  assert.equal(l.yaw, 0, "locked on, the mouse doesn't turn it");
});
