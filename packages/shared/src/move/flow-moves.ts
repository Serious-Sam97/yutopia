import { CLIMB, type FlowKind, type FlowMoves, type FlowNow, type FlowSpec, type FlowWorld, RUN_MIN } from "./flow.ts";
import type { MoveSpec } from "./spec.ts";
import type { Body, Collider, MoveInput, StepEvents } from "./step.ts";

// Flowmotion's moves themselves (flow.ts says what they are and what the world tells them): apart,
// so they load only where a world hands them to the step (the 3D view's physics, the sandbox) —
// not with every body that moves (the input chunk: the bundler keeps a module's every used export
// in each copy of it).

const BODY_R = 0.25;
const HANG = 1.45; // a hang: the feet this far under the top
const CARRY = 0.35; // s off a kick or a fling the body keeps its way (the air's control held off)
const SIDE_IN = 0.12; // at a wall at least this slant (the way into it) to run along it
const SIDE_OUT = 0.45; // and less than this: more, and it's run up

/** A Flowmotion move begun by this step's input, if any (the body's `flow` set, or a kick given). */
export function startFlow(
  b: Body,
  inp: MoveInput,
  grid: Collider,
  world: FlowWorld,
  spec: MoveSpec,
  ux: number,
  uy: number,
  mag: number,
  ev: StepEvents,
): boolean {
  const f = spec.flow;
  if (!f) return false;
  const speed = Math.hypot(b.vx, b.vy);
  const going = speed > 0.5 ? { x: b.vx / speed, y: b.vy / speed } : { x: ux, y: uy };
  // a rail under me: coming down onto it (or crossing it on the way up, the feet over its top —
  // not rising off a move, a jump off this rail itself), or
  // just landed on it on the move (the mover's solid rail caught my feet this step)
  {
    const r = world.rail(b.x, b.y, b.z, 0.32);
    const onIt =
      !!r &&
      (b.up
        ? b.z - r.z < 0.45 && (b.vz <= 0.5 ? b.z - r.z > -0.25 : b.z >= r.z - 0.05 && !b.carry)
        : Math.abs(b.z - r.z) < 0.06 && speed > 1);
    if (r && onIt) {
      const along = b.vx * r.ux + b.vy * r.uy;
      const dir = along >= 0 ? 1 : -1;
      b.flow = blank("grind", { ux: r.ux, uy: r.uy, s: dir * Math.max(Math.abs(along), f.grind) });
      b.flow.back = r.back;
      b.flow.ahead = r.ahead;
      b.x = r.x;
      b.y = r.y;
      b.z = r.z;
      ev.flow = "grind";
      return true;
    }
  }
  const dashing = inp.sprint && speed > spec.jog * 0.9;
  // a pole: rolled or dashed into
  if (inp.dodgePressed || dashing) {
    const p = world.pole(b.x, b.y, b.z, f.reach + 0.35);
    if (p) {
      const to = { x: p.x - b.x, y: p.y - b.y };
      const d = Math.hypot(to.x, to.y) || 1;
      if ((to.x * going.x + to.y * going.y) / d > 0.3) {
        const r = p.r + BODY_R + 0.15;
        const a = Math.atan2(b.y - p.y, b.x - p.x);
        // round the way it was going (the cross of where it is from the middle and its way)
        const cross = Math.cos(a) * going.y - Math.sin(a) * going.x;
        b.flow = blank("swing", { cx: p.x, cy: p.y, r, a, dir: cross >= 0 ? 1 : -1, top: p.top });
        b.verb = null;
        ev.flow = "swing";
        return true;
      }
    }
  }
  // a wall ahead: kicked off (jumped at in the air, rolled into), run up (dashed into)
  const w = mag > 0.2 || speed > 0.5 ? world.wall(b.x, b.y, b.z, going.x, going.y, f.reach) : null;
  const into = w ? going.x * -w.nx + going.y * -w.ny : 0;
  // slantwise at it, dashing: along it (on the ground or in the air, the wall high enough to hold)
  if (w?.run && dashing && into > SIDE_IN && into <= SIDE_OUT && b.z < w.top - 1.2 && b.takeoff < 0) {
    // the way along it: the way it went, less what went into it
    let tx = going.x + w.nx * into;
    let ty = going.y + w.ny * into;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    b.flow = blank("wallside", { ux: w.nx, uy: w.ny, cx: tx, cy: ty, top: w.top, s: Math.max(speed, f.side) });
    b.vz = Math.max(b.vz, f.sideUp);
    b.verb = null;
    ev.flow = "wallside";
    return true;
  }
  if (w && into > SIDE_OUT && b.z < w.top - 0.3) {
    if ((b.up && inp.jumpPressed && b.coyote <= 0) || (!b.up && inp.dodgePressed)) {
      kick(b, w.nx, w.ny, going, spec, f);
      b.buffer = 0;
      ev.flow = "kick";
      return false;
    }
    // (a top a mantle or a jump gets onto is climbed, not run up)
    if (dashing && w.run && b.takeoff < 0 && w.top - b.z >= RUN_MIN) {
      // (r: how far off its face it's begun, closed at a sprint in its first steps)
      b.flow = blank("wallrun", { ux: w.nx, uy: w.ny, top: w.top, r: Math.max(0, w.d) });
      b.verb = null;
      ev.flow = "wallrun";
      return true;
    }
  }
  // a ledge a little too high to mantle, falling at it: hang from it
  if (b.up && b.vz < 0 && mag > 0.2) {
    const ax = b.x + ux * 0.55;
    const ay = b.y + uy * 0.55;
    const top = grid.groundAt(ax, ay, b.z + 2.6);
    const over = top - b.z;
    if (over > 1.2 && over < 2.4 && grid.fitsAt(ax, ay, top) && !grid.fitsAt(ax, ay, b.z + 0.3)) {
      b.flow = blank("hang", { ux, uy, top });
      b.z = top - HANG;
      ev.flow = "hang";
      return true;
    }
  }
  return false;
}

/** A step of the move under way; done: the body's `flow` gone, and how it left (`ev.flowEnd`). */
export function stepFlow(
  b: Body,
  inp: MoveInput,
  grid: Collider,
  spec: MoveSpec,
  dt: number,
  ev: StepEvents,
  world?: FlowWorld,
) {
  const v = b.flow as FlowNow;
  const f = spec.flow as FlowSpec;
  v.t += dt;
  b.up = true;
  switch (v.kind) {
    case "grind": {
      const step = v.s * dt;
      v.ahead -= step;
      v.back += step;
      b.x += v.ux * step;
      b.y += v.uy * step;
      b.vx = v.ux * v.s;
      b.vy = v.uy * v.s;
      b.vz = 0;
      b.yaw = Math.atan2(v.uy * Math.sign(v.s), v.ux * Math.sign(v.s));
      if (inp.jumpPressed) return flowJump(b, spec, f, ev);
      if ((v.s > 0 && v.ahead < 0) || (v.s < 0 && v.back < 0)) {
        // the next rail on from its end, going much the same way (a fence's next stretch past its
        // post): on along that one, as one grind
        const n = world?.rail(b.x, b.y, b.z, 0.2);
        const dot = n ? n.ux * v.ux + n.uy * v.uy : 0;
        if (n && Math.abs(dot) > 0.7 && Math.abs(n.z - b.z) < 0.15) {
          const sign = Math.sign(v.s) * Math.sign(dot);
          v.ux = n.ux;
          v.uy = n.uy;
          v.s = sign * Math.abs(v.s);
          v.back = n.back;
          v.ahead = n.ahead;
          b.x = n.x;
          b.y = n.y;
          b.z = n.z;
          return;
        }
        // off its end: on at its speed, falling
        return end(b, ev, "off");
      }
      return;
    }
    case "swing": {
      v.a += (v.dir * f.swing * dt) / v.r;
      b.x = v.cx + Math.cos(v.a) * v.r;
      b.y = v.cy + Math.sin(v.a) * v.r;
      // the way round, a tangent
      const tx = -Math.sin(v.a) * v.dir;
      const ty = Math.cos(v.a) * v.dir;
      b.vx = tx * f.swing;
      b.vy = ty * f.swing;
      b.vz = 0;
      b.yaw = Math.atan2(ty, tx);
      // held (the dash), round and round; let go — or a jump — flung off along the way it goes
      const held = inp.sprint || v.t < 0.45;
      if (inp.jumpPressed || !held) {
        b.vx = tx * f.fling;
        b.vy = ty * f.fling;
        return flowJump(b, spec, f, ev, inp.jumpPressed ? 1 : 0.6);
      }
      return;
    }
    case "wallrun": {
      const close = Math.min(v.r, spec.sprint * dt);
      v.r -= close;
      b.x -= v.ux * close;
      b.y -= v.uy * close;
      b.vx = 0;
      b.vy = 0;
      b.vz = f.runUp;
      b.z += f.runUp * dt;
      b.yaw = Math.atan2(-v.uy, -v.ux);
      // over the top: up onto it, on
      if (b.z + 0.9 >= v.top) {
        const ax = b.x - v.ux * 0.6;
        const ay = b.y - v.uy * 0.6;
        if (grid.fitsAt(ax, ay, v.top)) return climb(b, ax, ay, v.top, spec.jog, ev);
      }
      // a jump, the dash let go, or out of run: kicked off
      if (inp.jumpPressed || !inp.sprint || v.t >= f.runLen) {
        kick(b, v.ux, v.uy, { x: -v.ux, y: -v.uy }, spec, f);
        return end(b, ev, "kick");
      }
      return;
    }
    case "wallside": {
      // along the wall (the way kept in cx, cy), in a low arc, held against its face
      const step = v.s * dt;
      b.x += v.cx * step;
      b.y += v.cy * step;
      b.vz -= spec.g * f.sideG * dt;
      b.z += b.vz * dt;
      b.vx = v.cx * v.s;
      b.vy = v.cy * v.s;
      b.yaw = Math.atan2(v.cy, v.cx);
      const w = world?.wall(b.x, b.y, b.z, -v.ux, -v.uy, f.reach + 0.3);
      if (w) {
        b.x -= w.nx * w.d;
        b.y -= w.ny * w.d;
      }
      // a jump: off it, out and on, the flow jump
      if (inp.jumpPressed) {
        b.vx = v.cx * v.s * 0.8 + v.ux * f.kickOut;
        b.vy = v.cy * v.s * 0.8 + v.uy * f.kickOut;
        b.yaw = Math.atan2(b.vy, b.vx);
        return flowJump(b, spec, f, ev);
      }
      // the wall gone, or over its top: on, falling
      if (!w || w.d > f.reach || b.z > w.top - 0.6) return end(b, ev, "off");
      // the ground come up, the dash let go, or out of run: off it
      if (b.z <= grid.groundAt(b.x, b.y, b.z + 0.1) + 0.01) {
        b.vz = 0;
        return end(b, ev, "off");
      }
      if (!inp.sprint || v.t >= f.sideLen) {
        b.vx += v.ux * 1.5;
        b.vy += v.uy * 1.5;
        b.carry = CARRY * 0.5;
        return end(b, ev, "drop");
      }
      return;
    }
    case "climb": {
      // up first, then over onto the top
      const u = Math.min(1, v.t / CLIMB);
      const up = smooth(Math.min(1, u / 0.65));
      const over = smooth(Math.max(0, (u - 0.35) / 0.65));
      b.z = v.z0 + (v.top - v.z0) * up;
      b.x = v.x0 + (v.x1 - v.x0) * over;
      b.y = v.y0 + (v.y1 - v.y0) * over;
      b.vx = 0;
      b.vy = 0;
      b.vz = 0;
      if (u < 1) return;
      b.z = v.top;
      b.up = false;
      const dx = v.x1 - v.x0;
      const dy = v.y1 - v.y0;
      const l = Math.hypot(dx, dy) || 1;
      b.vx = (dx / l) * v.s;
      b.vy = (dy / l) * v.s;
      return end(b, ev, "top");
    }
    case "hang": {
      b.vx = 0;
      b.vy = 0;
      b.vz = 0;
      b.z = v.top - HANG;
      if (v.t < 0.18) return;
      const mag = Math.hypot(inp.x, inp.y);
      const toward = mag > 0.2 && (inp.x * v.ux + inp.y * v.uy) / mag > 0.3;
      // up onto it
      if (inp.jumpPressed || toward) return climb(b, b.x + v.ux * 0.6, b.y + v.uy * 0.6, v.top, 0, ev);
      if (inp.crouchPressed || (mag > 0.2 && !toward)) return end(b, ev, "drop");
      return;
    }
  }
}

export const FLOW_MOVES: FlowMoves = { start: startFlow, step: stepFlow };

function blank(kind: FlowKind, o: Partial<FlowNow>): FlowNow {
  return {
    kind,
    t: 0,
    cx: 0,
    cy: 0,
    r: 0,
    a: 0,
    dir: 1,
    ux: 0,
    uy: 0,
    top: 0,
    s: 0,
    back: 0,
    ahead: 0,
    x0: 0,
    y0: 0,
    z0: 0,
    x1: 0,
    y1: 0,
    ...o,
  };
}

const smooth = (x: number) => x * x * (3 - 2 * x);

// up onto a top at (x1, y1): a climb's own short move (the body there at its end, on at `s`)
function climb(b: Body, x1: number, y1: number, top: number, s: number, ev: StepEvents) {
  const yaw = b.yaw;
  b.flow = blank("climb", { x0: b.x, y0: b.y, z0: b.z, x1, y1, top, s });
  b.yaw = Math.abs(x1 - b.x) + Math.abs(y1 - b.y) > 1e-6 ? Math.atan2(y1 - b.y, x1 - b.x) : yaw;
  ev.flow = "climb";
}

// off a wall: up and back from its face (`n` its outward normal), keeping some of the way along it
function kick(b: Body, nx: number, ny: number, going: { x: number; y: number }, spec: MoveSpec, f: FlowSpec) {
  const along = going.x * -ny + going.y * nx;
  b.vx = nx * f.kickOut + -ny * along * 2;
  b.vy = ny * f.kickOut + nx * along * 2;
  b.vz = Math.sqrt(2 * spec.g * f.kickUp);
  b.up = true;
  // (a whole arc: not cut short by letting go, as a jump is)
  b.rising = false;
  b.riseFrom = b.z;
  b.jump = "flip";
  b.yaw = Math.atan2(b.vy, b.vx);
  b.airJumps = 0;
  b.dashed = false;
  b.verb = null;
  b.carry = CARRY;
}

// the flow jump: off a move, higher than a jump, the air's jump and dash given back
function flowJump(b: Body, spec: MoveSpec, f: FlowSpec, ev: StepEvents, k = 1) {
  b.vz = Math.sqrt(2 * spec.g * f.jump * k);
  b.up = true;
  // (a whole arc: not cut short by letting go, as a jump is)
  b.rising = false;
  b.riseFrom = b.z;
  b.jump = "flip";
  b.airJumps = 0;
  b.dashed = false;
  b.carry = CARRY;
  ev.jumped = "flip";
  end(b, ev, "jump");
}

function end(b: Body, ev: StepEvents, how: "off" | "jump" | "top" | "kick" | "drop") {
  ev.flowEnd = how;
  b.flow = null;
}
