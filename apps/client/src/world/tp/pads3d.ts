import {
  CapsuleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  type Material,
  Mesh,
  Path,
  Shape,
  SphereGeometry,
  Vector2,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// The disc console's pad in 3D (docs/plan/23-disc-console.md): the twin-grip
// pad with two sticks — a bevelled extrusion of its outline seen from above,
// the cross pad, four shape buttons (dark caps, their colour round the top),
// the two sticks, start / select, the analog button and its LED, the shoulder
// buttons two by two. No marks or names on it.
//
// Built in "pad widths" (the grips' outer edges 1 apart), then scaled to `w`
// tiles. Local axes: x across, y up, +z towards whoever holds it (the grips).

export interface PadLook {
  body: Material;
  dark: Material; // buttons, sticks
  colors: [Material, Material, Material, Material]; // the shape buttons: top, right, bottom, left
  led: Material; // lit while the pad is analog (glow)
}

const T = 0.11; // body thickness
const BEVEL = 0.03;
const TOP = T + BEVEL * 2; // the top surface (the extrusion is lifted to stand on 0)

// Half the outline (x ≥ 0), from the middle of the top edge round the grip to
// the middle of the bridge, sampled smooth.
function halfOutline(): Vector2[] {
  const p = new Path();
  p.moveTo(0, -0.2);
  p.lineTo(0.34, -0.2);
  p.quadraticCurveTo(0.5, -0.2, 0.5, -0.06);
  p.bezierCurveTo(0.5, 0.1, 0.49, 0.28, 0.43, 0.39);
  p.quadraticCurveTo(0.39, 0.47, 0.32, 0.45);
  p.bezierCurveTo(0.26, 0.43, 0.24, 0.3, 0.21, 0.2);
  p.quadraticCurveTo(0.18, 0.11, 0.1, 0.11);
  p.lineTo(0, 0.11);
  return p.getSpacedPoints(64);
}

function outline(): Shape {
  const r = halfOutline();
  const l = r
    .slice(1, -1)
    .reverse()
    .map((v) => new Vector2(-v.x, v.y));
  return new Shape([...r, ...l]);
}

// The cross pad's outline: two crossed bars with rounded ends.
function cross(arm: number, len: number): Shape {
  const a = arm / 2;
  const l = len / 2;
  const s = new Shape();
  s.moveTo(-a, -l);
  s.lineTo(a, -l);
  s.lineTo(a, -a);
  s.lineTo(l, -a);
  s.lineTo(l, a);
  s.lineTo(a, a);
  s.lineTo(a, l);
  s.lineTo(-a, l);
  s.lineTo(-a, a);
  s.lineTo(-l, a);
  s.lineTo(-l, -a);
  s.lineTo(-a, -a);
  s.closePath();
  return s;
}

// An extrusion lying flat: the shape's y goes to z, it stands on `y0`.
function flat(shape: Shape, depth: number, bevel: number, y0: number): ExtrudeGeometry {
  const g = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 24,
  });
  g.rotateX(Math.PI / 2); // (x, y, z) → (x, −z, y): the shape's y runs along z, extruded downwards
  g.translate(0, y0 + depth + bevel, 0);
  return g;
}

export function ps1Pad(look: PadLook, w: number): Group {
  const g = new Group();
  const add = (geo: ConstructorParameters<typeof Mesh>[0], m: Material, x = 0, y = 0, z = 0) => {
    const mesh = new Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  add(flat(outline(), T, BEVEL, 0), look.body);

  // the cross pad (left) and the four shape buttons (right), each in a shallow well
  add(flat(cross(0.065, 0.2), 0.012, 0.006, TOP - 0.004), look.dark, -0.3, 0, -0.05);
  const btn = new CylinderGeometry(0.034, 0.036, 0.03, 24);
  const ring = new CylinderGeometry(0.02, 0.02, 0.004, 20);
  for (const [i, [dx, dz]] of (
    [
      [0, -0.075],
      [0.075, 0],
      [0, 0.075],
      [-0.075, 0],
    ] as const
  ).entries()) {
    add(btn, look.dark, 0.3 + dx, TOP + 0.01, -0.05 + dz);
    add(ring, look.colors[i], 0.3 + dx, TOP + 0.027, -0.05 + dz);
  }

  // the sticks: a base, the stem, the cap
  for (const x of [-0.15, 0.15]) {
    add(new CylinderGeometry(0.075, 0.08, 0.016, 28), look.dark, x, TOP + 0.002, 0.16);
    add(new CylinderGeometry(0.022, 0.022, 0.05, 12), look.dark, x, TOP + 0.03, 0.16);
    add(new CylinderGeometry(0.06, 0.056, 0.03, 28), look.dark, x, TOP + 0.065, 0.16);
  }

  // start / select, the analog button and its LED
  const pill = new CapsuleGeometry(0.012, 0.04, 4, 10);
  pill.rotateZ(Math.PI / 2);
  for (const x of [-0.07, 0.07]) add(pill, look.dark, x, TOP + 0.004, -0.07);
  add(new CylinderGeometry(0.018, 0.018, 0.012, 16), look.dark, 0, TOP + 0.004, 0.02);
  add(new SphereGeometry(0.012, 10, 8), look.led, 0.055, TOP, 0.02).name = "led";

  // shoulder buttons along the far edge: the upper pair, the lower pair under them
  for (const x of [-0.33, 0.33]) {
    add(new RoundedBoxGeometry(0.2, 0.04, 0.06, 3, 0.015), look.body, x, TOP - 0.03, -0.22);
    add(new RoundedBoxGeometry(0.19, 0.045, 0.06, 3, 0.015), look.dark, x, TOP - 0.085, -0.235);
  }

  g.scale.setScalar(w);
  return g;
}
