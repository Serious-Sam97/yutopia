// A charm hung on the gun (docs/plan/115-the-strike-park-again.md, phase 55: the Strike Park's customization corner;
// our own: a pine, a snowflake, a die, a bear's paw, Vortex's face). A split ring at the trigger guard, a short chain,
// the pendant ~2 cm under it; in the gun's own frame, so it goes where the gun goes, first person and third.

import {
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Group,
  type Material,
  Mesh,
  MeshLambertMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from "three";
import type { GunModel } from "./guns3d";

const mats = new Map<string, Material>();
const mat = (key: string, make: () => Material) => {
  let m = mats.get(key);
  if (!m) {
    m = make();
    mats.set(key, m);
  }
  return m;
};
const lam = (c: number) => mat(`c${c}`, () => new MeshLambertMaterial({ color: c }));
function dieMat(): Material {
  return mat("die", () => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.fillStyle = "#f4efe6";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#1c1f22";
    for (const [x, y] of [
      [16, 16],
      [48, 48],
      [32, 32],
      [48, 16],
      [16, 48],
    ]) {
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fill();
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return new MeshLambertMaterial({ map: t });
  });
}
function vortexMat(): Material {
  return mat("vortex", () => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 32;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.fillStyle = "#f2c230";
    g.fillRect(0, 0, 64, 32);
    // (his face on the front half of the ball's wrap: two eyes, the smug mouth)
    g.fillStyle = "#1c1f22";
    g.beginPath();
    g.arc(42, 13, 2.6, 0, Math.PI * 2);
    g.arc(52, 13, 2.6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#1c1f22";
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(47, 18, 4, 0.2, Math.PI - 0.6);
    g.stroke();
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return new MeshLambertMaterial({ map: t });
  });
}

/** The pendant, its top at the origin, hanging down −y (m). */
function pendant(kind: string): Group {
  const g = new Group();
  if (kind === "pine") {
    g.add(new Mesh(new ConeGeometry(0.009, 0.02, 8).translate(0, -0.012, 0), lam(0x2f5d3a)));
    g.add(new Mesh(new ConeGeometry(0.007, 0.014, 8).translate(0, -0.004, 0), lam(0x3a7048)));
    g.add(new Mesh(new CylinderGeometry(0.002, 0.002, 0.006, 5).translate(0, -0.025, 0), lam(0x5c4026)));
  } else if (kind === "flake") {
    for (let i = 0; i < 3; i++) {
      const b = new Mesh(new BoxGeometry(0.022, 0.0025, 0.0025), lam(0xdce9f2));
      b.rotation.z = (i * Math.PI) / 3;
      b.position.y = -0.012;
      g.add(b);
    }
  } else if (kind === "die") {
    const d = new Mesh(new BoxGeometry(0.014, 0.014, 0.014), dieMat());
    d.position.y = -0.009;
    d.rotation.set(0.3, 0.6, 0.2);
    g.add(d);
  } else if (kind === "paw") {
    const pad = new Mesh(new SphereGeometry(0.007, 10, 8).scale(1, 0.8, 0.45), lam(0x6b4a2a));
    pad.position.y = -0.013;
    g.add(pad);
    for (let i = 0; i < 4; i++) {
      const toe = new Mesh(new SphereGeometry(0.0028, 8, 6).scale(1, 1, 0.5), lam(0x6b4a2a));
      toe.position.set(-0.0075 + i * 0.005, -0.004 - (i === 0 || i === 3 ? 0.002 : 0), 0);
      g.add(toe);
    }
  } else if (kind === "vortex") {
    const ball = new Mesh(new SphereGeometry(0.009, 14, 10), vortexMat());
    ball.position.y = -0.01;
    g.add(ball);
  }
  return g;
}

/** The charm for a gun: hung under it just ahead of the fist, by its ring and chain. */
export function charmFor(kind: string, model: GunModel): Group {
  const root = new Group();
  root.name = `charm-${kind}`;
  const grip = new Vector3(...model.grip.at);
  const muzzle = new Vector3(...model.muzzle);
  const axis = muzzle.clone().sub(grip).normalize();
  const top = new Vector3(...model.sight.rear).sub(grip);
  // (the gun's down: from its sight line toward the fist, square to the barrel)
  const down = top
    .clone()
    .sub(axis.clone().multiplyScalar(top.dot(axis)))
    .normalize()
    .negate();
  const at = grip.clone().addScaledVector(axis, 0.055).addScaledVector(down, 0.012);
  root.position.copy(at);
  // (its own up is the gun's up: −down)
  root.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), down.clone().negate());
  const ring = new Mesh(new TorusGeometry(0.004, 0.0009, 5, 12), lam(0xb8b8b0));
  ring.rotation.y = Math.PI / 2;
  root.add(ring);
  const chain = new Mesh(new CylinderGeometry(0.0007, 0.0007, 0.014, 4).translate(0, -0.011, 0), lam(0x9a9a94));
  root.add(chain);
  const p = pendant(kind);
  p.position.y = -0.018;
  root.add(p);
  return root;
}
