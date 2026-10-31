import type { BufferGeometry, Shape, Vector3 } from "three";
import type { Params, Seg } from "./params";
import type { JointName, RestPose, SpringName } from "./rig";
import { extrude, frontOnly, mapVerts, smoothNormals, subdivide } from "./shapes";

// What a person is built into: pieces of geometry, each riding one joint, with
// a flat colour and how the ink treats it. `bake.ts` merges them into one
// skinned mesh (one draw for the body, one for the line).
export interface Part {
  joint: JointName;
  geo: BufferGeometry; // in the joint's own space (the joint at the origin)
  color: string;
  /** 1 an outlined part, 0 no line (eyes, mouth), 0.5 a crease drawn as a line only */
  ink: number;
  /** drawn in the body pass (a crease is only a line) */
  body: boolean;
  /** the face's moving bits, for blink / talk morphs (P3) */
  tag?: string;
  /** other bones some vertices follow (a skirt's front rides the thighs; a mitten's fingers, index
   *  and thumb): which, and how much each (up to three; the part's own joint has the rest) */
  skin?: Skin;
  /** its normals its own (a lock of hair's), not smoothed from its faces */
  own?: boolean;
  /** a pattern drawn over its colour by the cel shade (plan 60): 1 plaid, 2 stripes; and its other colour */
  pattern?: [number, string];
}

export type Skin = (x: number, y: number, z: number) => [JointName, number] | [JointName, number][];

/** The surface of the head: things are stood on it (hair, eyes, brows). */
export interface HeadSurface {
  hh: number;
  R(y: number): number;
  normal(x: number, y: number, z: number): Vector3;
  at(t: number, phi: number, out?: number): Vector3;
  front(x: number, y: number): { p: Vector3; n: Vector3 };
}

/** A spring worn (plan 58 phase 2d): its joint, where its tip hangs from it (the joint's space), and
 *  how it swings — its frequency (Hz), damping (0..1, 1 no overshoot) and the most it turns (rad). */
export interface SpringSpec {
  joint: SpringName;
  tip: [number, number, number];
  hz: number;
  damp: number;
  limit: number;
}

/** Where a right hand goes to reach a part of the body (wrist targets, model space). */
export type Anchor = "ear" | "mouth" | "chin" | "chest" | "belly";

export class Kit {
  readonly parts: Part[] = [];
  readonly rest = {} as RestPose;
  readonly anchors = {} as Record<Anchor, [number, number, number]>;
  /** the springs this look wears */
  readonly springs: SpringSpec[] = [];
  /** the body's round bits the springs keep out of (a joint, a centre off it, a radius) */
  readonly collide: { joint: JointName; at: [number, number, number]; r: number }[] = [];
  /** between the eyes, a little inside the head (the head joint's space): where first person looks from */
  eye: [number, number, number] = [0, 0, 0];
  /** the right ear's opening, on the head's side (the head joint's space): where an earbud sits */
  ear: [number, number, number] = [0, 0, 0];
  head!: HeadSurface;

  constructor(
    readonly p: Params,
    readonly seg: Seg,
  ) {}

  get hh() {
    return this.p.height / this.p.heads;
  }

  /** The longest edge a flat piece may keep when it's bent onto a curved surface
   *  (round a ~0.15 trunk the chord then dips ~1 mm: less than pieces stand off). */
  get bend() {
    return (this.hh * 3) / this.seg.radial;
  }

  /** A joint, relative to its parent (the builder decides where they go). */
  joint(name: JointName, x: number, y: number, z = 0) {
    this.rest[name] = [x, y, z];
  }

  /** A part on a joint; smooth normals unless the geometry has its own. */
  add(
    joint: JointName,
    geo: BufferGeometry,
    color: string,
    o: {
      at?: Vector3;
      ink?: number;
      keepNormals?: boolean;
      tag?: string;
      skin?: Skin;
    } = {},
  ) {
    if (o.at) geo.translate(o.at.x, o.at.y, o.at.z);
    if (!o.keepNormals) smoothNormals(geo);
    this.parts.push({ joint, geo, color, ink: o.ink ?? 1, body: true, tag: o.tag, skin: o.skin, own: o.keepNormals });
  }

  /** A spring worn: its joint put at `at` (its parent's space) and swung from there, its tip `tip`
   *  off it; the parts that hang on it get their weights from the builder. */
  spring(
    joint: SpringName,
    at: [number, number, number],
    tip: [number, number, number],
    o: Omit<SpringSpec, "joint" | "tip">,
  ) {
    this.rest[joint] = at;
    const was = this.springs.findIndex((s) => s.joint === joint);
    if (was >= 0) this.springs.splice(was, 1);
    this.springs.push({ joint, tip, ...o });
  }

  /** A crease — a hem, a seam, a placket's edge — drawn only as a line. */
  crease(joint: JointName, geo: BufferGeometry) {
    smoothNormals(geo);
    this.parts.push({ joint, geo, color: this.p.ink, ink: 0.5, body: false });
  }

  /** A flat shape on the face plane bent onto the head: eyes, brows, the mouth. */
  decal(shape: Shape | Shape[], depth: number, bevel: number, lift: number, color: string, tag?: string) {
    // (seen only from the front: its back and walls never drawn)
    const g = subdivide(
      frontOnly(extrude(shape, depth, bevel, this.seg.curve, Math.max(1, this.seg.bevel - 2))),
      this.bend,
    );
    mapVerts(g, (v) => {
      const s = this.head.front(v.x, v.y);
      const z = v.z;
      v.copy(s.p).addScaledVector(s.n, z + lift);
    });
    this.add("head", g, color, { ink: 0, tag });
  }
}
