import { BufferAttribute, BufferGeometry, Color, Sphere, Vector3 } from "three";
import type { Anchor, Kit, SpringSpec } from "./kit";
import { JOINTS, type JointName, PARENT, type RestPose } from "./rig";

// One person as two draws: every part merged into one geometry, each vertex
// riding its joint's bone (rigid skinning), its flat colour in the vertex
// colours. The ink line is the same vertices with a second index: outlined
// parts and creases only (no eyes, no mouth), each with its line weight.
export interface Baked {
  body: BufferGeometry;
  ink: BufferGeometry;
  rest: RestPose;
  height: number;
  /** the hip joints' height standing, and the thigh's radius (to sit the person on a seat) */
  hipY: number;
  thighR: number;
  /** wrist targets for the right hand (model space), and the arm's two lengths */
  anchors: Record<Anchor, [number, number, number]>;
  arm: [number, number];
  /** the eyes, in the head joint's space (first person looks from here) */
  eye: [number, number, number];
  /** the right ear, in the head joint's space (an earbud there) */
  ear: [number, number, number];
  /** only the arms, shoulder to fingertips (my own, in first person): made when first asked for */
  arms?: { body: BufferGeometry; ink: BufferGeometry };
  tris: number;
  /** vertex ranges of the face's moving bits ("eye", "mouth"), for morphs */
  tags: Record<string, [number, number][]>;
  /** the springs worn (plan 58 phase 2d), and the body's round bits they keep out of */
  springs: SpringSpec[];
  collide: Kit["collide"];
}

export const JOINT_INDEX = Object.fromEntries(JOINTS.map((j, i) => [j, i])) as Record<JointName, number>;

const ARM = new Set(
  (
    [
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
    ] as const
  ).map((j) => JOINT_INDEX[j]),
);

/** The arms alone: the same vertices, only the triangles riding the arms' bones. */
export function armsOf(b: Baked): { body: BufferGeometry; ink: BufferGeometry } {
  if (b.arms) return b.arms;
  const joint = b.body.getAttribute("skinIndex");
  const keep = (g: BufferGeometry) => {
    const I = g.getIndex();
    const out: number[] = [];
    if (I)
      for (let t = 0; t < I.count; t += 3) {
        const a = I.getX(t);
        const c = I.getX(t + 1);
        const d = I.getX(t + 2);
        if (ARM.has(joint.getX(a)) && ARM.has(joint.getX(c)) && ARM.has(joint.getX(d))) out.push(a, c, d);
      }
    const n = new BufferGeometry();
    for (const [name, a] of Object.entries(g.attributes)) n.setAttribute(name, a);
    n.setIndex(out);
    n.boundingSphere = g.boundingSphere?.clone() ?? null;
    return n;
  };
  b.arms = { body: keep(b.body), ink: keep(b.ink) };
  return b.arms;
}

/** Each joint's rest position in the model's space (no joint is turned at rest). */
export function restWorld(rest: RestPose): Record<JointName, Vector3> {
  const out = {} as Record<JointName, Vector3>;
  for (const j of JOINTS) {
    const parent = PARENT[j];
    const [x, y, z] = rest[j] ?? [0, 0, 0];
    out[j] = new Vector3(x, y, z).add(parent ? out[parent] : new Vector3());
  }
  return out;
}

// The trunk's skin weights (plan 58, phase 2): the body and all it wears from the hips to the
// shoulders ride the hips, the spine and the chest by height, blended across each joint — so the
// trunk bends as one, skin and clothes alike. (Till then it was two rigid pieces overlapping at the
// waist: a bend opened them and skin showed through a fitted top.)
const TRUNK = new Set<JointName>(["hips", "spine", "chest"]);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** The trunk's two bones and the second's weight at height `y` above the hips' joint. */
function trunkSkin(rest: RestPose, y: number): [JointName, JointName, number] {
  const spine = rest.spine[1];
  const chest = spine + rest.chest[1];
  const T = chest + rest.neck[1];
  const c = smooth(chest - 0.08 * T, chest + 0.08 * T, y);
  if (c > 0) return ["spine", "chest", c];
  return ["hips", "spine", smooth(spine - 0.12 * T, spine + 0.08 * T, y)];
}

export function bake(k: Kit): Baked {
  const at = restWorld(k.rest);
  const hipsY = at.hips.y;
  let nv = 0;
  for (const p of k.parts) nv += p.geo.getAttribute("position").count;
  const pos = new Float32Array(nv * 3);
  const nrm = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const skinI = new Uint16Array(nv * 4);
  const skinW = new Float32Array(nv * 4);
  const inkK = new Float32Array(nv);
  const bodyIdx: number[] = [];
  const inkIdx: number[] = [];
  const tags: Record<string, [number, number][]> = {};
  const c = new Color();
  let base = 0;
  for (const part of k.parts) {
    const g = part.geo;
    const P = g.getAttribute("position");
    const N = g.getAttribute("normal");
    const o = at[part.joint];
    const ji = JOINT_INDEX[part.joint];
    c.set(part.color);
    for (let i = 0; i < P.count; i++) {
      const v = base + i;
      pos[v * 3] = P.getX(i) + o.x;
      pos[v * 3 + 1] = P.getY(i) + o.y;
      pos[v * 3 + 2] = P.getZ(i) + o.z;
      nrm[v * 3] = N.getX(i);
      nrm[v * 3 + 1] = N.getY(i);
      nrm[v * 3 + 2] = N.getZ(i);
      col[v * 3] = c.r;
      col[v * 3 + 1] = c.g;
      col[v * 3 + 2] = c.b;
      skinI[v * 4] = ji;
      skinW[v * 4] = 1;
      // (a part's own other bones first — a skirt's front riding the thighs, a mitten's fingers — else
      // the trunk's by height)
      const got = part.skin?.(P.getX(i), P.getY(i), P.getZ(i));
      const own =
        (got && (typeof got[0] === "string" ? [got as [JointName, number]] : (got as [JointName, number][]))) ?? [];
      let slot = 1;
      let rest = 1;
      for (const [j, w] of own) {
        if (w <= 0 || slot > 3) continue;
        skinI[v * 4 + slot] = JOINT_INDEX[j];
        skinW[v * 4 + slot] = w;
        rest -= w;
        slot++;
      }
      if (slot > 1) {
        skinW[v * 4] = Math.max(0, rest);
        // (what's left of a trunk part's weight goes by the trunk's, as everything's on it does)
        if (TRUNK.has(part.joint) && rest > 0 && slot <= 3) {
          const [a, b, w] = trunkSkin(k.rest, pos[v * 3 + 1] - hipsY);
          skinI[v * 4] = JOINT_INDEX[a];
          skinW[v * 4] = rest * (1 - w);
          skinI[v * 4 + slot] = JOINT_INDEX[b];
          skinW[v * 4 + slot] = rest * w;
        }
      } else if (TRUNK.has(part.joint)) {
        const [a, b, w] = trunkSkin(k.rest, pos[v * 3 + 1] - hipsY);
        skinI[v * 4] = JOINT_INDEX[a];
        skinI[v * 4 + 1] = JOINT_INDEX[b];
        skinW[v * 4] = 1 - w;
        skinW[v * 4 + 1] = w;
      }
      inkK[v] = part.ink;
    }
    const I = g.getIndex();
    const n = I ? I.count : P.count;
    const into = (list: number[]) => {
      for (let i = 0; i < n; i++) list.push(base + (I ? I.getX(i) : i));
    };
    if (part.body) into(bodyIdx);
    if (part.ink > 0) into(inkIdx);
    if (part.tag) {
      tags[part.tag] = tags[part.tag] ?? [];
      tags[part.tag].push([base, P.count]);
    }
    base += P.count;
    g.dispose();
  }
  const attrs = {
    position: new BufferAttribute(pos, 3),
    normal: new BufferAttribute(nrm, 3),
    color: new BufferAttribute(col, 3),
    skinIndex: new BufferAttribute(skinI, 4),
    skinWeight: new BufferAttribute(skinW, 4),
    inkK: new BufferAttribute(inkK, 1),
  };
  const make = (idx: number[]) => {
    const g = new BufferGeometry();
    for (const [name, a] of Object.entries(attrs)) g.setAttribute(name, a);
    g.setIndex(idx);
    return g;
  };
  const body = make(bodyIdx);
  const ink = make(inkIdx);
  // the face's two morphs (relative): blink squashes each eye dot to a line,
  // talk opens the mouth's line into a mouth
  const morph = (tag: string, sx: number, sy: number) => {
    const d = new Float32Array(nv * 3);
    for (const [start, count] of tags[tag] ?? []) {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let v = start; v < start + count; v++) {
        x0 = Math.min(x0, pos[v * 3]);
        x1 = Math.max(x1, pos[v * 3]);
        y0 = Math.min(y0, pos[v * 3 + 1]);
        y1 = Math.max(y1, pos[v * 3 + 1]);
      }
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      for (let v = start; v < start + count; v++) {
        d[v * 3] = (pos[v * 3] - cx) * (sx - 1);
        d[v * 3 + 1] = (pos[v * 3 + 1] - cy) * (sy - 1);
      }
    }
    const a = new BufferAttribute(d, 3);
    a.name = tag;
    return a;
  };
  // …and two that look (plan 58 G.D): the eye dots slid to the person's left (+x) and up, about
  // their own width at a full look (the influence ±1 picks the way)
  const look = (tag: string, fx: number, fy: number, name: string) => {
    const d = new Float32Array(nv * 3);
    for (const [start, count] of tags[tag] ?? []) {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let v = start; v < start + count; v++) {
        x0 = Math.min(x0, pos[v * 3]);
        x1 = Math.max(x1, pos[v * 3]);
        y0 = Math.min(y0, pos[v * 3 + 1]);
        y1 = Math.max(y1, pos[v * 3 + 1]);
      }
      // (sliding round the face's curve: the eye heading for the middle comes out, the one heading
      // for the side goes back — flat, the one sank under the skin)
      const cx = (x0 + x1) / 2;
      for (let v = start; v < start + count; v++) {
        d[v * 3] = (x1 - x0) * fx;
        d[v * 3 + 1] = (y1 - y0) * fy;
        d[v * 3 + 2] = -Math.sign(cx) * 0.45 * (x1 - x0) * fx + 0.08 * (y1 - y0) * Math.abs(fy);
      }
    }
    const a = new BufferAttribute(d, 3);
    a.name = name;
    return a;
  };
  body.morphAttributes.position = [
    morph("eye", 1.15, 0.14),
    morph("mouth", 0.72, 4.2),
    look("eye", 0.75, 0, "lookX"),
    look("eye", 0, 0.32, "lookY"),
  ];
  body.morphTargetsRelative = true;
  // culling: a sphere round the whole figure, generous enough for any pose
  const height = k.p.height;
  const sphere = new Sphere(new Vector3(0, height * 0.5, 0), height * 0.75);
  body.boundingSphere = sphere;
  ink.boundingSphere = sphere.clone();
  return {
    body,
    ink,
    rest: k.rest,
    height,
    hipY: at.thighL.y,
    thighR: k.p.leg.thigh * k.hh,
    anchors: k.anchors,
    arm: [-k.rest.elbowL[1], -k.rest.wristL[1]],
    eye: k.eye,
    ear: k.ear,
    tris: bodyIdx.length / 3,
    tags,
    springs: k.springs,
    collide: k.collide,
  };
}
