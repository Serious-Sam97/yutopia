// The skater on the board (docs/plan/104-the-skate-again.md F4a): keyed clips authored in Blender on our rig with a
// board bone (tools/art/skate-anim → public/life/skate/anim.json), played here — sampled, cross-faded (~80 ms; a trick
// in the air cuts in at once, ~35 ms), held where a trick is held (a grab's loop, a grind's, a manual's) and let go
// through its out; the balance's two poses blended over the hold by the needle ((bal + 1) / 2, as Neversoft's); a
// carve's lean and the crouch blended over the roll; fakie's look down the tail laid over all. A goofy rider is the
// clip's mirror. Out of it: her pose (the game's joints), the hips' lift, the board's place and turn in her space, each
// foot's lock to the deck and its spot, each hand's IK to a spot on the board (or a point of hers: a handplant's
// coping). The view puts the board there, the feet on its deck by IK (`legTo`), the hands to it (reachTo).
//
// Her space: x her left, y up, z ahead; the root on the ground under the board's middle (the step's contact).
// Loaded lazily, with its clips, the first time someone's seen on a board (the 3D view's chunk keeps none of it).
import { type SkateLook, TRICKS } from "@yutopia/shared/skate";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { asset } from "@/lib/asset";
import type { JointName, Pose } from "../chars/rig";
import type { BoardMeasures } from "./board3d";

/** A foot's spot under this (the street board's frame) is on the board's bottom (a darkslide's). */
export const UNDER_Y = 0.0885 - 0.006;

/** The bundle's mark (tools/budget.mjs finds the chunk by it). */
export const SKATE_ANIM_CHUNK = "yutopia-skate-anim";

type Ch = number | number[];
interface ClipData {
  dur: number;
  n: number;
  t: number[];
  kind: string;
  ch: Record<string, Ch>;
  loop?: boolean;
  hold?: [number, number];
  out?: number;
  space?: Record<string, string>;
}
interface AnimDoc {
  version: number;
  rig: { HIP_H: number; THIGH: number; ANKLE: number; restHips: [number, number, number] };
  board: { deckY: number; tailY: number; nose: number; tail: number; bolts: number; width: number };
  joints: JointName[];
  specials: Record<string, string>;
  clips: Record<string, ClipData>;
}

let doc: AnimDoc | null = null;
let loading = false;
/** The clips (null till they're in: the view draws her standing on the board meanwhile). */
export function clipsNow(): AnimDoc | null {
  if (loading) return doc;
  loading = true;
  void fetch(asset("/life/skate/anim.json"))
    .then((r) => (r.ok ? (r.json() as Promise<AnimDoc>) : null))
    .catch(() => null)
    .then((d) => {
      doc = d && d.version === 1 ? d : null;
      if (doc) for (const c of Object.values(doc.clips)) prepare(c);
      return doc;
    });
  return doc;
}

/** The clips given (tests: read off the disk). */
export function setClips(d: AnimDoc): void {
  doc = d;
  loading = true;
  for (const c of Object.values(d.clips)) prepare(c);
}
export type { AnimDoc, ClipData };

// ── a frame of a clip: the joints as quaternions, the rest as numbers ───────────────────────────────────────
const NJ = 25;
export class Frame {
  readonly q: Quaternion[] = Array.from({ length: NJ }, () => new Quaternion());
  readonly lift = new Vector3();
  readonly bc = new Vector3();
  readonly bq = new Quaternion();
  /** each foot (0 her left, 1 her right): its lock to the deck, its spot on the board (its frame), turned, pointed */
  readonly foot = [0, 1].map(() => ({ lk: 0, p: new Vector3(), h: 0, t: 0 }));
  /** each hand: its IK's weight, its spot (the board's frame, or hers: `root`) */
  readonly hand = [0, 1].map(() => ({ w: 0, p: new Vector3(), root: false }));
  copy(o: Frame): this {
    for (let i = 0; i < NJ; i++) this.q[i].copy(o.q[i]);
    this.lift.copy(o.lift);
    this.bc.copy(o.bc);
    this.bq.copy(o.bq);
    for (let i = 0; i < 2; i++) {
      Object.assign(this.foot[i], { lk: o.foot[i].lk, h: o.foot[i].h, t: o.foot[i].t });
      this.foot[i].p.copy(o.foot[i].p);
      this.hand[i].w = o.hand[i].w;
      this.hand[i].root = o.hand[i].root;
      this.hand[i].p.copy(o.hand[i].p);
    }
    return this;
  }
  /** Toward `o` by `w` (the joints and the board slerped: a flip's whole turn is the board at rest again). */
  blend(o: Frame, w: number): this {
    if (w <= 0) return this;
    if (w >= 1) return this.copy(o);
    for (let i = 0; i < NJ; i++) this.q[i].slerp(o.q[i], w);
    this.lift.lerp(o.lift, w);
    this.bc.lerp(o.bc, w);
    // (a shove-it's board ends turned 180°: the same board to the eye — swapped at once, not spun back)
    if (Math.abs(_qa.copy(this.bq).multiply(RY_PI).dot(o.bq)) > Math.abs(this.bq.dot(o.bq))) this.bq.multiply(RY_PI);
    this.bq.slerp(o.bq, w);
    for (let i = 0; i < 2; i++) {
      const a = this.foot[i];
      const b = o.foot[i];
      a.lk += (b.lk - a.lk) * w;
      a.p.lerp(b.p, w);
      a.h += (b.h - a.h) * w;
      a.t += (b.t - a.t) * w;
      const ha = this.hand[i];
      const hb = o.hand[i];
      // (a hand's spot is the one reaching for it more)
      if (hb.w * w > ha.w * (1 - w)) {
        ha.p.copy(hb.p);
        ha.root = hb.root;
      }
      ha.w += (hb.w - ha.w) * w;
    }
    return this;
  }
  /** `side` over `zero` laid on, `w` of it (an additive pose: a balance's lean). */
  add(side: Frame, zero: Frame, w: number): this {
    if (w <= 1e-4) return this;
    for (let i = 0; i < NJ; i++) {
      _qa.copy(zero.q[i]).invert().multiply(side.q[i]);
      _qb.identity().slerp(_qa, w);
      this.q[i].multiply(_qb);
    }
    this.lift.addScaledVector(_va.copy(side.lift).sub(zero.lift), w);
    this.bc.addScaledVector(_va.copy(side.bc).sub(zero.bc), w);
    _qa.copy(zero.bq).invert().multiply(side.bq);
    _qb.identity().slerp(_qa, w);
    this.bq.multiply(_qb);
    return this;
  }
}
const _qa = new Quaternion();
const _qb = new Quaternion();
const RY_PI = new Quaternion(0, 1, 0, 0);
const _va = new Vector3();
const _e = new Euler();

// each clip's channels in the order a frame reads them
interface Prepared {
  j: Ch[][];
  lift: Ch[];
  bc: Ch[];
  be: Ch[];
  f: { lk: Ch; p: Ch[]; h: Ch; t: Ch }[];
  h: { w: Ch; p: Ch[]; root: boolean }[];
}
const prepared = new WeakMap<ClipData, Prepared>();
const JOINT_ORDER: JointName[] = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "shoulderL",
  "elbowL",
  "wristL",
  "fingersL",
  "indexL",
  "thumbL",
  "shoulderR",
  "elbowR",
  "wristR",
  "fingersR",
  "indexR",
  "thumbR",
  "thighL",
  "kneeL",
  "ankleL",
  "toeL",
  "thighR",
  "kneeR",
  "ankleR",
  "toeR",
];
export const SKATE_JOINTS = JOINT_ORDER;
function prepare(c: ClipData) {
  const g = (n: string): Ch => c.ch[n] ?? 0;
  const xyz = (p: string) => ["x", "y", "z"].map((a) => g(`${p}.${a}`));
  prepared.set(c, {
    j: JOINT_ORDER.map((j) => xyz(j)),
    lift: xyz("lift"),
    bc: xyz("bc"),
    be: xyz("be"),
    f: (["L", "R"] as const).map((S) => ({ lk: g(`f${S}.lk`), p: xyz(`f${S}`), h: g(`f${S}.h`), t: g(`f${S}.t`) })),
    h: (["L", "R"] as const).map((S) => ({ w: g(`h${S}.w`), p: xyz(`h${S}`), root: c.space?.[S] === "root" })),
  });
}
/** A clip at `t` s (clamped; a looped one wrapped) into `out`. */
export function sampleClip(c: ClipData, t: number, out: Frame): Frame {
  const P = prepared.get(c);
  if (!P) return out;
  const ts = c.t;
  let tt = t;
  if (c.loop && c.dur > 0) tt = ((t % c.dur) + c.dur) % c.dur;
  tt = Math.max(0, Math.min(c.dur, tt));
  // (the samples are even: 1/30 s, the last one at the end)
  const n = ts.length;
  let i = Math.min(n - 2, Math.max(0, Math.floor((tt / c.dur) * (n - 1))));
  while (i < n - 2 && ts[i + 1] < tt) i++;
  while (i > 0 && ts[i] > tt) i--;
  const span = n > 1 ? ts[i + 1] - ts[i] : 1;
  const k = n > 1 && span > 0 ? Math.max(0, Math.min(1, (tt - ts[i]) / span)) : 0;
  const v = (ch: Ch) => (typeof ch === "number" ? ch : ch[i] + (ch[i + 1] - ch[i]) * k);
  for (let j = 0; j < NJ; j++) {
    const e = P.j[j];
    out.q[j].setFromEuler(_e.set(v(e[0]), v(e[1]), v(e[2]), "XYZ"));
  }
  out.lift.set(v(P.lift[0]), v(P.lift[1]), v(P.lift[2]));
  out.bc.set(v(P.bc[0]), v(P.bc[1]), v(P.bc[2]));
  out.bq.setFromEuler(_e.set(v(P.be[0]), v(P.be[1]), v(P.be[2]), "YXZ"));
  for (let s = 0; s < 2; s++) {
    const f = P.f[s];
    const o = out.foot[s];
    o.lk = v(f.lk);
    o.p.set(v(f.p[0]), v(f.p[1]), v(f.p[2]));
    o.h = v(f.h);
    o.t = v(f.t);
    const h = P.h[s];
    const oh = out.hand[s];
    oh.w = v(h.w);
    oh.p.set(v(h.p[0]), v(h.p[1]), v(h.p[2]));
    oh.root = h.root;
  }
  return out;
}

// ── which clip a look plays ───────────────────────────────────────────────────────────────────────────────
const KIND_CLIP: Record<string, string> = {
  flip: "kickflip",
  grab: "indy",
  grind: "fiftyfifty",
  slide: "boardslide",
  lip: "axlestall",
  manual: "manual",
  wall: "wallride",
  revert: "revert",
  air: "air",
};
/** A trick's clip: its own, else its kind's (an id the clips don't know yet still moves). */
export function clipFor(d: AnimDoc, id: string | null, double = false): string | null {
  if (!id) return null;
  if (double && d.clips[`${id}.x2`]) return `${id}.x2`;
  if (d.clips[id]) return id;
  const def = (TRICKS as Record<string, { kind: string } | undefined>)[id];
  const k = def ? KIND_CLIP[def.kind] : null;
  return k && d.clips[k] ? k : null;
}

/** What the player's told each frame (the wire's look; `t` the trick's own clock and `bal` the needle when the step
 *  gives them). */
export interface SkaterIn {
  look: SkateLook & { t?: number; bal?: number };
  /** s since this look's trick (or mode) began, as the view times it */
  t: number;
  dt: number;
  /** the drawn nose turned round in a step (a revert, a 180 landed): the skid's clip */
  turned?: boolean;
  /** just got on (the board's first frame) */
  first?: boolean;
}

interface Track {
  key: string;
  clip: ClipData;
  t: number;
  /** played by the trick's clock (a flip, a special): `t` set each frame */
  ext: boolean;
  /** held: loops its hold (a, b) while it's the one wanted; let go, plays on from `out` */
  held: boolean;
  w: number;
  fade: number;
  bal?: "manual" | "grind";
  roll?: boolean;
  done?: boolean;
}

/** One skater's player (a person's, kept while they're on a board). */
export class SkaterPlayer {
  private tracks: Track[] = [];
  private shot: Track | null = null;
  private prev: SkateLook | null = null;
  private crouchW = 0;
  private leanW = 0;
  private fakieW = 0;
  private balW = 0;
  readonly out = new Frame();
  private tmp = new Frame();
  private tmp2 = new Frame();
  private tmp3 = new Frame();
  private tmp4 = new Frame();

  /** The pose now (null till the clips are in). */
  update(i: SkaterIn): Frame | null {
    const d = clipsNow();
    if (!d) return null;
    const L = i.look;
    const dt = Math.min(0.1, i.dt);
    const was = this.prev;
    const k = (x: number, to: number, rate: number) => x + (to - x) * Math.min(1, dt * rate);
    this.crouchW = k(this.crouchW, L.crouch ? 1 : 0, 14);
    this.leanW = k(this.leanW, L.lean, 10);
    this.fakieW = k(this.fakieW, L.fakie ? 1 : 0, 8);
    this.balW = k(this.balW, Math.max(-1, Math.min(1, L.bal ?? 0)), 16);
    // ── one-shots on the changes: the pop, the landing, a grab let go, the revert's skid, getting on
    const shot = (id: string | null, from = 0, fade = 0.035) => {
      const c = id ? d.clips[id] : null;
      if (!c) return;
      this.shot = { key: `shot:${id}`, clip: c, t: from, ext: false, held: false, w: 0, fade };
      this.push(this.shot);
    };
    if (i.first) shot("geton", 0, 0.01);
    else if (was && was.mode !== L.mode) {
      const fromGround = was.mode === "roll" || was.mode === "manual" || was.mode === "grind";
      if (L.mode === "air" && fromGround && !L.trick) shot("ollie", 0, 0.03);
      else if (was.mode === "air" && L.mode === "roll") shot("land", 0, 0.03);
      else if ((was.mode === "lip" || was.mode === "wall") && L.mode === "roll") shot("land", 0.05, 0.08);
    } else if (was && L.mode === "air" && was.trick && was.trick !== L.trick) {
      // (a grab let go: its out, then the air)
      const c = clipFor(d, was.trick, was.double);
      const cd = c ? d.clips[c] : null;
      if (cd && cd.kind === "grab" && cd.out !== undefined && !L.trick) shot(c, cd.out, 0.03);
    }
    if (i.turned && L.mode === "roll") shot("revert", 0, 0.03);
    this.prev = L;
    // ── what's wanted under the shot
    const want = this.want(d, L);
    const top = this.tracks[this.tracks.length - 1];
    const shotOn = !!this.shot && !this.shot.done;
    // (a trick in the air cuts in over the shot at once: Tony Hawk's interrupts)
    if (shotOn && want.ext && this.shot && want.key !== top?.key) {
      this.shot.done = true;
      this.push({ ...want, w: 0, fade: 0.035 });
    } else if (!shotOn && want.key !== top?.key) {
      this.push({ ...want, w: 0, fade: want.fade });
    } else if (shotOn && this.shot && top === this.shot && this.shot.t >= this.shot.clip.dur - 0.06) {
      // (the shot near its end: what's wanted comes back over it)
      this.shot.done = true;
      this.push({ ...want, w: 0, fade: 0.09 });
    }
    // ── step the tracks: their clocks, their fades; those under a whole one go
    for (const tr of this.tracks) {
      tr.w = Math.min(1, tr.w + dt / Math.max(0.001, tr.fade));
      if (tr.ext && tr.key === want.key) tr.t = i.t;
      else if (tr.held && tr.key === want.key && tr.clip.hold) {
        const [a, b] = tr.clip.hold;
        tr.t += dt;
        if (tr.t > b) tr.t = a + ((tr.t - a) % Math.max(0.05, b - a));
      } else tr.t += dt;
    }
    for (let n = this.tracks.length - 1; n > 0; n--)
      if (this.tracks[n].w >= 1) {
        this.tracks.splice(0, n);
        break;
      }
    if (this.shot && !this.tracks.includes(this.shot)) this.shot = null;
    // ── the pose: each track over the last
    const out = this.out;
    let first = true;
    for (const tr of this.tracks) {
      const f = this.eval(d, tr, this.tmp);
      if (first) out.copy(f);
      else out.blend(f, tr.w);
      first = false;
    }
    // fakie: the look down the tail (the chest a little, the neck, the head)
    if (this.fakieW > 0.01) {
      const w = this.fakieW;
      look(out, 2, -0.3 * w);
      look(out, 3, -0.55 * w);
      look(out, 4, -0.9 * w);
    }
    return out;
  }

  private push(t: Track) {
    this.tracks.push(t);
    if (this.tracks.length > 6) this.tracks.splice(0, this.tracks.length - 6);
  }

  private want(d: AnimDoc, L: SkateLook): Track {
    const mk = (key: string, id: string, o: Partial<Track> = {}): Track => ({
      key,
      clip: d.clips[id] ?? d.clips.stance,
      t: 0,
      ext: false,
      held: false,
      w: 0,
      fade: 0.08,
      ...o,
    });
    const id = clipFor(d, L.trick, L.double);
    switch (L.mode) {
      case "air": {
        if (!id || !d.clips[id]) return mk("air", "air", { fade: 0.12 });
        const c = d.clips[id];
        if (c.kind === "grab" && c.hold) return mk(`grab:${id}`, id, { held: true, fade: 0.035 });
        return mk(`trick:${id}:${L.trick}`, id, { ext: true, fade: 0.035 });
      }
      case "manual":
        return mk(`hold:${id ?? "manual"}`, id ?? "manual", { held: true, bal: "manual", fade: 0.06 });
      case "grind":
        return mk(`hold:${id ?? "fiftyfifty"}`, id ?? "fiftyfifty", { held: true, bal: "grind", fade: 0.05 });
      case "lip":
        return mk(`hold:${id ?? "axlestall"}`, id ?? "axlestall", { held: true, fade: 0.06 });
      case "wall":
        return mk(`hold:${id ?? "wallride"}`, id ?? "wallride", { held: true, fade: 0.06 });
      default:
        if (L.cess) return mk("hold:powerslide", "powerslide", { held: true, fade: 0.06 });
        return mk(L.push ? "roll:push" : "roll:stance", L.push ? "push" : "stance", { roll: true, fade: 0.14 });
    }
  }

  private eval(d: AnimDoc, tr: Track, out: Frame): Frame {
    sampleClip(tr.clip, tr.t, out);
    if (tr.roll) {
      // the carve's lean (+ to her toes) and the crouch, over the roll
      const lean = this.leanW;
      const side = d.clips[lean >= 0 ? "carve+" : "carve-"];
      if (side && Math.abs(lean) > 0.02) out.blend(sampleClip(side, 0, this.tmp2), Math.min(1, Math.abs(lean)) * 0.9);
      const cr = d.clips.crouch;
      if (cr && this.crouchW > 0.01) out.blend(sampleClip(cr, 0, this.tmp2), this.crouchW);
    } else if (tr.bal) {
      // the needle: the end it leans to, over the hold's own (manual's against its own, a grind's the 50-50's)
      const b = this.balW;
      const zero = d.clips[`${tr.bal}.bal0`];
      const side = d.clips[`${tr.bal}.bal${b >= 0 ? "+" : "-"}`];
      if (zero && side && Math.abs(b) > 0.01) {
        // (a nose manual leans the other way)
        const flip = tr.clip === d.clips.nosemanual || tr.clip === d.clips.hangten;
        const s2 = flip ? d.clips[`${tr.bal}.bal${b >= 0 ? "-" : "+"}`] : side;
        out.add(sampleClip(s2 ?? side, 0, this.tmp3), sampleClip(zero, 0, this.tmp4), Math.abs(b));
      }
    }
    return out;
  }
}
const _ly = new Quaternion();
const _Y = new Vector3(0, 1, 0);
function look(f: Frame, j: number, yaw: number) {
  f.q[j].multiply(_ly.setFromAxisAngle(_Y, yaw));
}

// ── a goofy rider: the clip's mirror ──────────────────────────────────────────────────────────────────────
const MIRROR_OF = JOINT_ORDER.map((j) => {
  const m = j.endsWith("L") ? `${j.slice(0, -1)}R` : j.endsWith("R") ? `${j.slice(0, -1)}L` : j;
  return JOINT_ORDER.indexOf(m as JointName);
});
/** `f` mirrored across her middle (x → −x) into `out`: the board turned to match (its nose to her right, its toe
 *  side still ahead of her) and its spots onto its other side. */
export function mirrorFrame(f: Frame, out: Frame): Frame {
  for (let i = 0; i < NJ; i++) {
    const q = f.q[MIRROR_OF[i]];
    out.q[i].set(q.x, -q.y, -q.z, q.w);
  }
  out.lift.set(-f.lift.x, f.lift.y, f.lift.z);
  out.bc.set(-f.bc.x, f.bc.y, f.bc.z);
  out.bq.set(f.bq.x, -f.bq.y, -f.bq.z, f.bq.w).multiply(RY_PI);
  for (let s = 0; s < 2; s++) {
    const a = f.foot[1 - s];
    const o = out.foot[s];
    o.lk = a.lk;
    o.p.set(a.p.x, a.p.y, -a.p.z);
    o.h = Math.PI - a.h;
    o.t = a.t;
    const h = f.hand[1 - s];
    const oh = out.hand[s];
    oh.w = h.w;
    oh.root = h.root;
    if (h.root) oh.p.set(-h.p.x, h.p.y, h.p.z);
    else oh.p.set(h.p.x, h.p.y, -h.p.z);
  }
  return out;
}

/** The frame's joints as the game's pose (the fingers too). */
export function poseOf(f: Frame, into: Pose): Pose {
  for (let i = 0; i < NJ; i++) {
    _e.setFromQuaternion(f.q[i], "XYZ");
    into[JOINT_ORDER[i]] = [_e.x, _e.y, _e.z];
  }
  return into;
}

// ── another board: the clip's spots (the street popsicle's) onto its own ────────────────────────────────────
/** A spot authored on the street board, onto board `m` (its frame): between the bolts by the wheelbase, out past them
 *  along to its own nose or tail, the kick's rise kept over its own deck, across by its width. */
export function mapPoint(p: Vector3, m: BoardMeasures, out: Vector3): Vector3 {
  const a = doc?.board;
  if (!a) return out.copy(p);
  const P = m.points;
  const bf = P.bolts_f?.[0] ?? m.wheelbase / 2;
  const br = P.bolts_r?.[0] ?? -m.wheelbase / 2;
  const nose = P.nose?.[0] ?? m.length / 2;
  const tail = P.tail?.[0] ?? -m.length / 2;
  const deck = (x: number, nx: number, tx: number, bfx: number, brx: number, dy: number, ny: number, ty: number) =>
    x > bfx
      ? dy + ((ny - dy) * (x - bfx)) / Math.max(0.01, nx - bfx)
      : x < brx
        ? dy + ((ty - dy) * (brx - x)) / Math.max(0.01, brx - tx)
        : dy;
  let x: number;
  const x0 = p.x;
  if (x0 > a.bolts) x = bf + ((x0 - a.bolts) * (nose - bf)) / Math.max(0.01, a.nose - a.bolts);
  else if (x0 < -a.bolts) x = br + ((x0 + a.bolts) * (br - tail)) / Math.max(0.01, a.bolts + a.tail);
  else x = (x0 / a.bolts) * (x0 >= 0 ? bf : -br);
  // (the street deck's own heights at its nose and tail tips)
  const aNoseY = 0.1426;
  const aTailY = 0.1425;
  const over = p.y - deck(x0, a.nose, a.tail, a.bolts, -a.bolts, a.deckY, aNoseY, aTailY);
  const y = deck(x, nose, tail, bf, br, m.deckY, P.nose?.[1] ?? m.deckY, P.tail?.[1] ?? m.deckY) + over;
  return out.set(x, y, p.z * (m.width / a.width));
}

// ── the legs onto the deck ────────────────────────────────────────────────────────────────────────────────
/** What the legs' IK needs of the body (a life one's: its legs fitted to the rig's after, chars/model.ts fitLeg —
 *  the rig's thigh joint HIP_H − hipY straight down the root under its own). */
export interface LegBody {
  restHips: [number, number, number];
  /** each thigh joint's place under the hips (its bone's rest), L then R */
  thigh: [Vector3, Vector3];
  /** the rig's thigh joint under the life one (HIP_H − its hip height; 0 for today's) */
  drop: number;
  thighLen: number;
  shinLen: number;
  ankle: number;
}
const _H = new Vector3();
const _D = new Vector3();
const _u = new Vector3();
const _v = new Vector3();
const _T = new Vector3();
const _K = new Vector3();
const _S = new Vector3();
const _F = new Vector3();
const _X = new Vector3();
const _Yv = new Vector3();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _hq = new Quaternion();
const _tq = new Quaternion();
const _kq = new Quaternion();
const _aq = new Quaternion();
const _hp = new Vector3();
/** Leg `s` (0 her left) of `pose` (lifted `lift`) solved for its ankle at `ankle` (her space), its knee toward `pole`,
 *  its foot turned `foot` (her space) — into `pose`, `w` of the way from the clip's. */
export function legTo(
  B: LegBody,
  pose: Pose,
  lift: Vector3,
  s: 0 | 1,
  ankle: Vector3,
  pole: Vector3,
  foot: Quaternion,
  w: number,
): void {
  if (w <= 1e-3) return;
  const S = s === 0 ? "L" : "R";
  const he = pose.hips ?? [0, 0, 0];
  _hq.setFromEuler(_e.set(he[0], he[1], he[2], "XYZ"));
  _hp.set(B.restHips[0] + lift.x, B.restHips[1] + lift.y, B.restHips[2] + lift.z);
  const H = _H.copy(B.thigh[s]).applyQuaternion(_hq).add(_hp);
  H.y += B.drop;
  const a = B.thighLen;
  const b = B.shinLen;
  const D = _D.copy(ankle).sub(H);
  const d = Math.max(0.05, Math.min(a + b - 1e-4, D.length()));
  const u = _u.copy(D).normalize();
  const v = _v.copy(pole).addScaledVector(u, -pole.dot(u));
  if (v.lengthSq() < 1e-8) v.set(0, 0, 1).addScaledVector(u, -u.z);
  v.normalize();
  const ca = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)));
  const sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  const T = _T.copy(u).multiplyScalar(ca).addScaledVector(v, sa).normalize();
  const K = _K.copy(H).addScaledVector(T, a);
  const Sh = _S.copy(H).addScaledVector(u, d).sub(K).normalize();
  const F = _F.copy(Sh).addScaledVector(T, -Sh.dot(T)).multiplyScalar(-1);
  if (F.lengthSq() < 1e-8) F.copy(v).addScaledVector(T, -v.dot(T));
  F.normalize();
  const bend = Math.acos(Math.max(-1, Math.min(1, T.dot(Sh))));
  const Y = _Yv.copy(T).multiplyScalar(-1);
  const X = _X.crossVectors(Y, F);
  _m.makeBasis(X, Y, F);
  const Wt = _tq.setFromRotationMatrix(_m);
  // (under the hips)
  const thighQ = _aq.copy(_hq).invert().multiply(Wt);
  const shinW = _kq.copy(Wt).multiply(_qa.setFromAxisAngle(_X.set(1, 0, 0), bend));
  const ankQ = _qb.copy(shinW).invert().multiply(foot);
  // (blended from the clip's own leg)
  const blendJ = (j: JointName, q: Quaternion) => {
    const c = pose[j] ?? [0, 0, 0];
    _m2.makeRotationFromEuler(_e.set(c[0], c[1], c[2], "XYZ"));
    const cq = new Quaternion().setFromRotationMatrix(_m2);
    cq.slerp(q, w);
    _e.setFromQuaternion(cq, "XYZ");
    pose[j] = [_e.x, _e.y, _e.z];
  };
  blendJ(`thigh${S}` as JointName, thighQ);
  const kc = pose[`knee${S}` as JointName] ?? [0, 0, 0];
  pose[`knee${S}` as JointName] = [kc[0] + (bend - kc[0]) * w, kc[1] * (1 - w), kc[2] * (1 - w)];
  _e.setFromQuaternion(ankQ, "XYZ");
  const ae: [number, number, number] = [
    Math.max(-0.85, Math.min(0.95, _e.x)),
    Math.max(-0.45, Math.min(0.45, _e.y)),
    Math.max(-0.4, Math.min(0.4, _e.z)),
  ];
  _aq.setFromEuler(_e.set(ae[0], ae[1], ae[2], "XYZ"));
  blendJ(`ankle${S}` as JointName, _aq);
}

/** The knee's way in the clip's leg (her space): its thigh's front (+z) under the hips, the pole for the IK. */
export function kneeWay(pose: Pose, s: 0 | 1, out: Vector3): Vector3 {
  const he = pose.hips ?? [0, 0, 0];
  const te = pose[s === 0 ? "thighL" : "thighR"] ?? [0, 0, 0];
  _hq.setFromEuler(_e.set(he[0], he[1], he[2], "XYZ"));
  _tq.setFromEuler(_e.set(te[0], te[1], te[2], "XYZ"));
  return out.set(0, 0, 1).applyQuaternion(_hq.multiply(_tq));
}
