import type { AvatarLayers } from "@yutopia/shared";
import { beamAt, beamOf } from "@yutopia/shared/beam";
import { heightAt } from "@yutopia/shared/grounds";
import type { WorldController } from "../controller";
import type { AvatarState } from "../engine";
import type { Body3 } from "../tp/view";

// The shadowed on my screen (docs/plan/30-the-dark.md D5): the server sends
// those near me while I'm outside (StateView) — where they are ten times a
// second, their state, their shield. Played back a moment late and smooth,
// handed to the 3D view as bodies (dressed in the dark there: tp/person3d.ts,
// tp/shroud3d.ts) and to iso as people drawn dark.

// (the move's wire, shared move/spec.ts, by hand: importing that module here re-splits the
// world page's chunks — docs/plan/30-the-dark.md, phase 2's budget trap)
const byteToYaw = (b: number) => ((b & 255) / 256) * 2 * Math.PI;
const MV_AIM = 16;
const packMv = (gait: "walk" | "jog") => (gait === "walk" ? 1 : 2); // (GAITS: still, walk, jog…)

// the shadowed's states, by their number on the wire (shared dark/fsm.ts SHADE_STATES)
const STATES = ["dormant", "emerge", "stalk", "windup", "strike", "recover", "burning", "exposed", "flee", "dissolve"];
const DELAY = 150; // ms behind: they're sent ten times a second

interface Sample {
  t: number;
  x: number;
  y: number;
  a: number;
}
interface Seen {
  id: string;
  look: AvatarLayers;
  seed: number;
  buf: Sample[];
  state: string;
  since: number; // performance.now
  sh: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  iso: boolean;
  /** shot down (its dissolve's a burst of light) */
  killed: boolean;
}

// ── who they were: office people (a seed's worth of clothes) ─────────────────
const SKIN = ["#f3d2b3", "#e4b48e", "#c68a5e", "#a8693f", "#7c4a2b", "#4f2e1c"];
const HAIR = ["short", "long", "curly", "bun", "bob", "bald", "ponytail", "buzz"];
const HAIR_C = ["#1c1410", "#3b2a20", "#6b4128", "#a8692f", "#d9b26a", "#e8e0d0"];
const TOPS = ["shirt", "blazer", "polo", "cardigan", "turtleneck", "sweater", "shirt", "blazer"];
const TOP_C = ["#e8e4dc", "#b8c8d8", "#8a8f96", "#2c3445", "#c9b89a", "#2a2a2e", "#efe9df", "#5a6470"];
const BOTTOMS = ["trousers", "trousers", "skirt", "longskirt", "trousers"];
const BOTTOM_C = ["#3a3f48", "#2c3445", "#2a2a2e", "#6d6458", "#8a8f96"];
function officeLook(seed: number): AvatarLayers {
  let s = (seed * 2654435761) >>> 0;
  const pick = <T>(a: readonly T[]): T => {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    return a[s % a.length];
  };
  return {
    body: pick(["regular", "broad", "slim"]),
    skin: pick(SKIN),
    hair: pick(HAIR),
    hairColor: pick(HAIR_C),
    top: pick(TOPS),
    topColor: pick(TOP_C),
    bottom: pick(BOTTOMS),
    bottomColor: pick(BOTTOM_C),
    accessory: "none",
    accessoryColor: "#2a2420",
    style: "ligne",
    gender: pick(["masculine", "feminine", "neutral"]),
    eyewear: pick(["none", "none", "glasses", "round"]),
    eyewearColor: "#2a2420",
    extra: pick(["none", "none", "watch"]),
    extraColor: "#8a8f96",
    shoes: pick(["loafers", "loafers", "boots"]),
    shoesColor: pick(["#2a2420", "#5b3a26"]),
    beard: pick(["none", "none", "none", "stubble"]),
  } as AvatarLayers;
}

// the 8 ways iso draws a facing (shared iso.ts dirFromDelta: the screen's angle, tiles 2:1)
function dir8(angle: number): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const sx = (dx - dy) * 2;
  const sy = dx + dy;
  const i = Math.round(Math.atan2(-sx, sy) / (Math.PI / 4));
  return ((i % 8) + 8) % 8;
}

// the upper body they're posed in, by state (chars/moves.ts shadePose)
function poseOf(state: string): NonNullable<Body3["shade"]>["pose"] {
  if (state === "windup") return "windup";
  if (state === "strike") return "strike";
  if (state === "burning") return "recoil";
  if (state === "exposed") return "exposed";
  return "lurch";
}

export class Shades {
  private seen = new Map<string, Seen>();
  private isoIds = new Set<string>();
  private lastFrame = 0;

  constructor(private readonly ctl: WorldController) {}

  dispose(): void {
    for (const id of this.isoIds) this.ctl.engine?.removeAvatar(id);
    this.isoIds.clear();
    if (this.ctl.tp?.extraBodies === this.bodies) this.ctl.tp.extraBodies = null;
  }

  /** Every frame: read the room, play them back, hand them to whichever view is showing. */
  frame(): void {
    const ctl = this.ctl;
    const room = ctl.room;
    const now = performance.now();
    const dt = Math.max(0.001, Math.min(0.25, (now - (this.lastFrame || now - 16)) / 1000));
    this.lastFrame = now;
    const map = room?.state.shadows;
    const here = new Set<string>();
    map?.forEach((w: { id: string; x: number; y: number; a: number; s: number; sh: number; look: number }) => {
      here.add(w.id);
      let s = this.seen.get(w.id);
      const state = STATES[w.s] ?? "stalk";
      if (!s) {
        s = {
          id: w.id,
          look: officeLook(w.look * 7919 + w.id.length),
          seed: w.look,
          buf: [],
          state,
          since: now,
          sh: w.sh,
          x: w.x,
          y: w.y,
          angle: byteToYaw(w.a),
          speed: 0,
          iso: false,
          killed: false,
        };
        this.seen.set(w.id, s);
      }
      if (state !== s.state) {
        s.state = state;
        s.since = now;
      }
      s.sh = w.sh;
      s.killed = !!(w as { k?: boolean }).k;
      const last = s.buf[s.buf.length - 1];
      if (!last || last.x !== w.x || last.y !== w.y || last.a !== w.a) s.buf.push({ t: now, x: w.x, y: w.y, a: w.a });
      while (s.buf.length > 2 && s.buf[1].t < now - DELAY - 400) s.buf.shift();
    });
    for (const id of [...this.seen.keys()]) if (!here.has(id)) this.seen.delete(id);
    // played back DELAY late, between the two samples round then
    const at = now - DELAY;
    for (const s of this.seen.values()) {
      const b = s.buf;
      let i = b.length - 1;
      while (i > 0 && b[i].t > at) i--;
      const p = b[i];
      const q = b[Math.min(b.length - 1, i + 1)];
      const k = q.t > p.t ? Math.max(0, Math.min(1, (at - p.t) / (q.t - p.t))) : 1;
      const x = p.x + (q.x - p.x) * k;
      const y = p.y + (q.y - p.y) * k;
      const da = byteToYaw(q.a) - byteToYaw(p.a);
      const angle = byteToYaw(p.a) + Math.atan2(Math.sin(da), Math.cos(da)) * k;
      s.speed = s.speed * 0.8 + (Math.hypot(x - s.x, y - s.y) / dt) * 0.2;
      s.x = x;
      s.y = y;
      s.angle = angle;
    }
    // 3D: bodies for the view; iso: people drawn dark
    const tp = ctl.tp;
    if (tp) {
      tp.extraBodies = this.bodies;
      for (const id of this.isoIds) ctl.engine?.removeAvatar(id);
      this.isoIds.clear();
      return;
    }
    const engine = ctl.engine;
    if (!engine) return;
    for (const s of this.seen.values()) {
      const st = this.stateOf(s);
      engine.upsertAvatar(s.id, st);
      this.isoIds.add(s.id);
    }
    for (const id of [...this.isoIds])
      if (!this.seen.has(id)) {
        engine.removeAvatar(id);
        this.isoIds.delete(id);
      }
  }

  /** All of them as drawn, their state (the sounds follow it). */
  list(): { id: string; x: number; y: number; state: string; killed: boolean }[] {
    return [...this.seen.values()].map((s) => ({ id: s.id, x: s.x, y: s.y, state: s.state, killed: s.killed }));
  }

  /** Where they're drawn (the floor's coords, feet z): what a shot is aimed at. */
  drawn(): { id: string; x: number; y: number; z: number }[] {
    return [...this.seen.values()]
      .filter((s) => s.state !== "dissolve")
      .map((s) => ({ id: s.id, x: s.x, y: s.y, z: this.ground(s.x, s.y) }));
  }

  private ground(x: number, y: number): number {
    const map = this.ctl.map;
    return heightAt(x + (map?.ox ?? 0), y + (map?.oy ?? 0));
  }

  private stateOf(s: Seen): AvatarState {
    const moving = s.speed > 0.3 && s.state !== "windup" && s.state !== "emerge";
    return {
      name: "",
      avatar: s.look,
      x: s.x,
      y: s.y,
      d: dir8(s.angle),
      a: moving ? 1 : 0,
      status: "online",
      speaking: false,
      emote: "",
      mic: false,
      bot: true,
      angle: s.angle,
      z: this.ground(s.x, s.y),
      mv: packMv(s.speed > 3.6 ? "jog" : "walk"),
      shaded: s.state !== "exposed" && s.sh > 50,
    };
  }

  // the 3D view asks each frame
  readonly bodies = (): Body3[] => {
    const room = this.ctl.room;
    const now = performance.now();
    // the focused torches near: where the embers fly off
    const torches: ReturnType<typeof beamOf>[] = [];
    room?.state.players.forEach(
      (p: {
        x: number;
        y: number;
        z: number;
        yaw: number;
        pitch: number;
        mv: number;
        focused: boolean;
        level: number;
      }) => {
        if (p.focused && p.level === 0)
          torches.push(beamOf(p.x, p.y, p.z, byteToYaw(p.yaw), (p.mv & MV_AIM) !== 0 ? p.pitch / 40 : null, true));
      },
    );
    const out: Body3[] = [];
    for (const s of this.seen.values()) {
      const z = this.ground(s.x, s.y);
      // (anywhere on the body, as the server has it: features/dark.ts)
      const lit = torches.find((b) => [0.4, 0.9, 1.4].some((h) => beamAt(b, s.x, s.y, z + h) > 0));
      out.push({
        ...this.stateOf(s),
        id: s.id,
        level: 0,
        angle: s.angle,
        shade: {
          pose: poseOf(s.state),
          t: (now - s.since) / 1000,
          seed: s.seed,
          dark: s.state === "exposed" ? 0 : s.sh / 100,
          state: s.state,
          since: s.since,
          burn: lit ? { x: lit.x, y: lit.y } : null,
        },
      });
    }
    return out;
  };
}
