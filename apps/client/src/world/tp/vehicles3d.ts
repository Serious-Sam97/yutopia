import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  RingGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { G, tinted } from "./campus";
import { flatSnow } from "./snow3d";

// The shuttle (docs/plan/33-the-look.md, phase 6): a small town bus, 10 long and 2.4 wide as
// before (its nose to −x). Cream over a rust stripe, a band of windows you see the riders
// through, the windscreen, the folding door on the kerb side (+z), mirrors on their arms, the
// destination sign lit, red lamps at the back, snow on the roof; its wheels turn as it goes.

const CREAM = 0xe6dccb;
const RUST = 0xa8432c;
const DARK = 0x1f2326;

const part = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) =>
  tinted(new BoxGeometry(w, h, d).translate(x, y, z), c);

export interface Bus {
  root: Group;
  wheels: Group[];
  /** the headlamps' and the sign's materials (their glow by the hour) */
  lamps: MeshBasicMaterial;
  sign: MeshBasicMaterial;
  tail: MeshBasicMaterial;
}

export function busModel(body: Material): Bus {
  const root = new Group();
  const solid: BufferGeometry[] = [
    // the lower body, the stripe, the skirt
    part(10, 1.05, 2.4, 0, 1.0, 0, CREAM),
    part(10.02, 0.22, 2.42, 0, 1.38, 0, RUST),
    part(9.6, 0.3, 2.3, 0, 0.42, 0, 0x8d8a84),
    // the pillars between the side windows, the frame round the window band
    part(10, 0.12, 2.4, 0, 1.55, 0, CREAM),
    part(10, 0.12, 2.4, 0, 2.5, 0, CREAM),
    ...[-3.4, -2.1, -0.8, 0.5, 1.8, 3.1, 4.4].flatMap((x) => [
      part(0.16, 0.85, 0.06, x, 2.02, 1.18, CREAM),
      part(0.16, 0.85, 0.06, x, 2.02, -1.18, CREAM),
    ]),
    part(0.3, 0.95, 2.4, 4.85, 2.02, 0, CREAM), // the back, solid
    // the roof, its rounded edges, a vent
    part(10, 0.28, 2.2, 0, 2.7, 0, CREAM),
    tinted(new CylinderGeometry(0.14, 0.14, 10, 8).rotateZ(Math.PI / 2).translate(0, 2.63, 1.1), CREAM),
    tinted(new CylinderGeometry(0.14, 0.14, 10, 8).rotateZ(Math.PI / 2).translate(0, 2.63, -1.1), CREAM),
    part(1, 0.12, 0.8, 1.5, 2.9, 0, 0xcfc6b4),
    // the front: bumper, grille, the sign's box over the windscreen, the wipers
    part(0.2, 0.3, 2.5, -5.05, 0.6, 0, DARK),
    part(0.06, 0.4, 1.0, -5.02, 1.05, 0, 0x3a3f45),
    part(0.3, 0.32, 2.3, -4.9, 2.62, 0, DARK),
    part(0.03, 0.04, 0.7, -5.1, 1.7, 0.4, DARK),
    part(0.03, 0.04, 0.7, -5.1, 1.7, -0.4, DARK),
    // the back: bumper, the engine's grille
    part(0.2, 0.3, 2.5, 5.05, 0.6, 0, DARK),
    part(0.04, 0.5, 1.6, 5.02, 1.1, 0, 0xb8b0a0),
    // the door on the kerb side, its frame (folding: two leaves)
    part(1.3, 2.1, 0.04, -3.9, 1.5, 1.21, 0x3a3f45),
    part(0.04, 1.9, 0.05, -3.9, 1.52, 1.23, CREAM),
    // the mirrors on their arms
    ...[1, -1].flatMap((s) => [
      part(0.5, 0.04, 0.04, -5.15, 2.2, s * 1.35, DARK),
      part(0.08, 0.35, 0.2, -5.4, 2.0, s * 1.45, DARK),
    ]),
    // the arches round the wheels, dark (rings: the tyres show inside)
    ...[-3.1, 3.1].flatMap((x) =>
      [1, -1].map((s) => {
        const g = new RingGeometry(0.51, 0.64, 14, 1, 0, Math.PI);
        if (s < 0) g.rotateY(Math.PI);
        return tinted(g.translate(x, 0.5, s * 1.206), 0x15171a);
      }),
    ),
  ];
  const g = new G();
  const r = (() => {
    let k = 4127;
    return () => {
      k = (k * 16807) % 2147483647;
      return k / 2147483647;
    };
  })();
  flatSnow(g, -4.9, -1.05, 4.9, 1.05, 2.84, 0.16, r);
  solid.push(g.build());
  const m = new Mesh(mergeGeometries(solid, false), body);
  for (const p of solid) p.dispose();
  m.castShadow = true;
  root.add(m);
  // the glass: the windscreen and the side band, see-through (the riders inside)
  const glass = new Mesh(
    mergeGeometries(
      [part(0.04, 1.0, 2.3, -5.0, 2.02, 0, 0x2a3a44), part(9.5, 0.85, 2.36, -0.25, 2.02, 0, 0x2a3a44)],
      false,
    ),
    new MeshLambertMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  root.add(glass);
  // the lamps: headlamps, the sign, the tail lamps
  const lamps = new MeshBasicMaterial({ color: 0xfff1cc, transparent: true, toneMapped: false });
  const sign = new MeshBasicMaterial({ color: 0xffb24a, transparent: true, toneMapped: false });
  const tail = new MeshBasicMaterial({ color: 0xff3a24, transparent: true, toneMapped: false });
  root.add(
    new Mesh(
      mergeGeometries(
        [1, -1].map((s) => new BoxGeometry(0.06, 0.2, 0.32).translate(-5.04, 0.95, s * 0.9)),
        false,
      ),
      lamps,
    ),
  );
  root.add(new Mesh(new BoxGeometry(0.04, 0.22, 1.9).translate(-5.06, 2.62, 0), sign));
  root.add(
    new Mesh(
      mergeGeometries(
        [1, -1].map((s) => new BoxGeometry(0.06, 0.3, 0.2).translate(5.04, 1.1, s * 1.0)),
        false,
      ),
      tail,
    ),
  );
  // the wheels, each its own (they turn)
  const wheels: Group[] = [];
  const tyre = new MeshLambertMaterial({ color: 0x1b1d20 });
  const hub = new MeshLambertMaterial({ color: 0xb9bec4 });
  for (const x of [-3.1, 3.1])
    for (const s of [1, -1]) {
      const w = new Group();
      w.position.set(x, 0.5, s * 1.07);
      w.add(new Mesh(new CylinderGeometry(0.5, 0.5, 0.32, 14).rotateX(Math.PI / 2), tyre));
      const h = new Mesh(new CylinderGeometry(0.26, 0.26, 0.34, 6).rotateX(Math.PI / 2), hub);
      w.add(h);
      // (a spoke you can see turn)
      w.add(new Mesh(new BoxGeometry(0.42, 0.06, 0.35), hub));
      root.add(w);
      wheels.push(w);
    }
  return { root, wheels, lamps, sign, tail };
}
