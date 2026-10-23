import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  Shape,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import { kit, type P2, sect } from "./kit";
import type { Door, Sedan, SedanOpts, Wheel } from "./sedan";

// The tracked ones (docs/plan/34-the-vehicles.md, wave 2), built with the kit (tp/car/kit.ts):
// the snowmobile and the snowcat. The sim's four wheels: the snowmobile's two front ones are its
// skis (they steer), its back two the track under its tunnel; the snowcat's four, its two long
// tracks' ends.

/** The beacon's flash: a rotating lamp's pulse. */
const pulse = (t: number) => 0.35 + 3.8 * Math.max(0, Math.sin(t * 1.6 * Math.PI * 2)) ** 6;

/** The snowmobile: an 80s trail sled — the swept hood with its lamp, vents and name, the smoked
 *  windshield, the handlebars with their guards, the gauge pod, the padded saddle on the tunnel,
 *  the running boards, the grab handle and the tail lamp, the snow flap; the track and its idlers
 *  under the tunnel; the skis on their spindles and A-arms, a loop on each tip. */
export function buildSnowmobile(o: SedanOpts): Sedan {
  const L = 3.0;
  const W = 1.15;
  const axleF = 0.68; // the skis' spindles
  const axleR = axleF + 1.55;
  const K = kit(o, L, W);
  const { add, box, rbox, prof, loft, tube, cyl, beam, paint, satin, steel, chrome, rubber, ux } = K;
  const vinyl = K.tone("#141414", { rough: 0.5, coat: 0.2 });
  const trim = K.tone("#d9d6cf", { coat: 0.3 });
  const shock = K.tone("#e0b12a", { rough: 0.4 });
  const smoke = K.keep(K.glass.clone());
  smoke.color.set("#1e2428");
  smoke.opacity = 0.62;

  // ── the hood: swept up from a low nose to the windshield, its belly pan, the bumper ──
  const hood = [
    { u: 0.02, ring: sect(0.36, 0.47, 0.13, 0.09, 0.05, 0.03) },
    { u: 0.12, ring: sect(0.3, 0.55, 0.25, 0.19, 0.09, 0.04) },
    { u: 0.36, ring: sect(0.27, 0.66, 0.37, 0.29, 0.13, 0.05) },
    { u: 0.7, ring: sect(0.27, 0.78, 0.43, 0.34, 0.15, 0.05) },
    { u: 1.0, ring: sect(0.28, 0.86, 0.45, 0.36, 0.15, 0.05) },
    { u: 1.16, ring: sect(0.3, 0.84, 0.45, 0.35, 0.12, 0.05) },
  ];
  add(paint, loft(hood));
  add(satin, loft(hood.map((h) => ({ u: h.u, ring: h.ring.map(([y, z]): P2 => [Math.min(y, 0.36), z * 1.01]) }))));
  // its lamp in the nose, the stripes and vents down its sides, its name
  add(K.headLens, beam([0.15, 0.575, 0], [0.31, 0.645, 0], 0.3, 0.012));
  add(satin, beam([0.14, 0.57, 0], [0.32, 0.64, 0], 0.34, 0.008));
  for (const s of [1, -1]) {
    for (let i = 0; i < 4; i++)
      add(K.dark, beam([0.72 + i * 0.07, 0.48, s * 0.43], [0.8 + i * 0.07, 0.68, s * 0.37], 0.02, 0.03));
    add(trim, beam([0.2, 0.44, s * 0.335], [1.1, 0.5, s * 0.458], 0.035, 0.012));
    K.decal(
      ["STORM 440"],
      { u: 0.5, y: 0.4, z: s * 0.415, w: 0.36, h: 0.07, face: s > 0 ? "z" : "-z" },
      { colour: "#f2efe6", w: 512, h: 96 },
    );
  }
  add(
    chrome,
    tube(
      [
        [0.2, 0.38, 0.3],
        [0.04, 0.4, 0.2],
        [0.0, 0.41, 0],
        [0.04, 0.4, -0.2],
        [0.2, 0.38, -0.3],
      ],
      0.018,
      8,
    ),
  );
  // the windshield, smoked, its rim; the gauge pod on the hood under it
  add(smoke, beam([1.0, 0.86, 0], [1.13, 1.22, 0], 0.72, 0.008));
  add(
    satin,
    tube(
      [
        [1.0, 0.86, 0.36],
        [1.13, 1.22, 0.34],
        [1.13, 1.22, -0.34],
        [1.0, 0.86, -0.36],
      ],
      0.01,
      5,
    ),
  );
  add(satin, rbox(0.98, 1.1, 0.84, 0.94, -0.1, 0.1, 0.03));
  add(K.gauge, K.paneU(1.101, 0.86, 0.93, -0.08, 0.08, 1));

  // ── the tunnel, the saddle on it, the running boards, the back ──
  add(
    paint,
    prof(
      [
        [1.1, 0.3],
        [1.1, 0.52],
        [2.92, 0.52],
        [2.98, 0.46],
        [2.98, 0.3],
      ],
      -0.27,
      0.27,
      0.02,
    ),
  );
  const seatS = (u: number, top: number, w: number) => ({ u, ring: sect(0.5, top, w, w - 0.03, 0.08, 0.02) });
  add(vinyl, loft([seatS(1.25, 0.66, 0.19), seatS(1.4, 0.75, 0.23), seatS(2.25, 0.75, 0.23), seatS(2.45, 0.7, 0.21)]));
  add(trim, rbox(1.3, 2.42, 0.49, 0.53, -0.245, 0.245, 0.015));
  for (const s of [1, -1]) {
    add(K.tread, box(1.15, 2.5, 0.29, 0.32, s * 0.27, s * 0.52));
    add(satin, rbox(1.15, 2.5, 0.27, 0.33, s * 0.5, s * 0.54, 0.01));
    add(satin, beam([1.12, 0.3, s * 0.5], [1.18, 0.5, s * 0.42], 0.03, 0.03));
  }
  add(
    chrome,
    tube(
      [
        [2.5, 0.55, 0.22],
        [2.82, 0.63, 0.22],
        [2.93, 0.62, 0.12],
        [2.93, 0.62, -0.12],
        [2.82, 0.63, -0.22],
        [2.5, 0.55, -0.22],
      ],
      0.016,
      8,
    ),
  );
  add(K.red, rbox(2.955, 2.99, 0.42, 0.49, -0.1, 0.1, 0.01));
  add(rubber, box(2.94, 2.97, 0.08, 0.4, -0.25, 0.25));
  K.decal(["YUTOPIA"], { u: 2.972, y: 0.24, z: 0, w: 0.36, h: 0.08, face: "u" }, { colour: "#f2efe6", w: 512, h: 112 });
  K.snowCap(1.45, 2.3, -0.18, 0.18, 0.75);

  // ── the track under the tunnel: its belt and lugs, the idlers, the slide rails ──
  K.trackLoop({ u: 1.35, y: 0.24, r: 0.18 }, { u: 2.8, y: 0.14, r: 0.13 }, 0, 0.4, 0.035, 0.085, K.dark);
  for (const s of [1, -1]) {
    add(steel, cyl(1.35, 0.24, s * 0.215, 0.15, 0.03, "z", 16), cyl(2.8, 0.14, s * 0.215, 0.11, 0.03, "z", 14));
    for (const u of [1.75, 2.2]) add(steel, cyl(u, 0.12, s * 0.215, 0.07, 0.03, "z", 12));
    add(satin, beam([1.45, 0.08, s * 0.12], [2.75, 0.06, s * 0.12], 0.03, 0.04));
  }

  // ── the front suspension: the A-arms and the shocks (on the body) ──
  for (const s of [1, -1]) {
    add(satin, beam([0.6, 0.32, s * 0.16], [0.68, 0.36, s * 0.46], 0.025, 0.025));
    add(satin, beam([0.8, 0.32, s * 0.16], [0.7, 0.36, s * 0.46], 0.025, 0.025));
    add(shock, beam([0.74, 0.6, s * 0.24], [0.7, 0.38, s * 0.44], 0.05, 0.05));
    add(chrome, beam([0.74, 0.62, s * 0.24], [0.73, 0.55, s * 0.29], 0.02, 0.02));
  }

  // ── the handlebars: riser, bar, grips, hand guards (turning: the rig turns `steering`) ──
  const bar = new Group();
  bar.position.set(ux(1.18), 0.98, 0);
  bar.rotation.x = -Math.PI / 2; // (its z up: `steering` turns about it)
  const steering = new Group();
  bar.add(steering);
  K.body.add(bar);
  {
    const H = K.bucket();
    // (in the bar's frame: x along the car, y across (−z), z up)
    const T = (x: number, y: number, z: number) => new Vector3(x, y, z);
    const path = [T(0.06, 0.37, 0.05), T(0.02, 0.25, 0.02), T(0, 0, 0), T(0.02, -0.25, 0.02), T(0.06, -0.37, 0.05)];
    H.add(chrome, new TubeGeometry(new CatmullRomCurve3(path), 24, 0.014, 6));
    H.add(satin, new CylinderGeometry(0.03, 0.035, 0.2, 8).rotateX(Math.PI / 2).translate(0.01, 0, -0.1));
    const guard = new Shape([new Vector2(0, 0), new Vector2(0.12, 0), new Vector2(0.1, 0.1), new Vector2(0.02, 0.1)]);
    for (const s of [1, -1]) {
      H.add(rubber, new CylinderGeometry(0.022, 0.022, 0.12, 8).translate(0.06, s * 0.36, 0.05));
      H.add(
        paint,
        new ExtrudeGeometry(guard, { depth: 0.01, bevelEnabled: false })
          .rotateX(-Math.PI / 2)
          .translate(-0.04, s * 0.3, 0.02),
      );
    }
    H.build(steering);
  }

  // ── the skis on their spindles, in the front slots (they steer and ride) ──
  const ski = () => {
    const g = new Group();
    const P = K.bucket();
    // (in the slot's frame: x along the car, the slot's centre 0.22 above the ground; the kit's
    // shapes take u, so x + L / 2)
    const at = (pts: P2[]) => pts.map(([x, y]): P2 => [x + L / 2, y]);
    P.add(
      satin,
      prof(
        at([
          [0.55, -0.2],
          [-0.38, -0.2],
          [-0.54, -0.16],
          [-0.64, -0.06],
          [-0.66, 0.0],
          [-0.61, 0.0],
          [-0.52, -0.11],
          [-0.38, -0.145],
          [0.55, -0.145],
        ]),
        -0.075,
        0.075,
        0.012,
      ),
    );
    P.add(steel, box(L / 2 - 0.3, L / 2 + 0.5, -0.214, -0.2, -0.012, 0.012));
    // (its spine along the top, the spindle's saddle on it)
    P.add(satin, box(L / 2 - 0.45, L / 2 + 0.52, -0.15, -0.09, -0.022, 0.022));
    P.add(
      chrome,
      tube(
        [
          [L / 2 - 0.6, -0.05, 0.07],
          [L / 2 - 0.74, -0.02, 0],
          [L / 2 - 0.6, -0.05, -0.07],
        ],
        0.01,
        5,
      ),
    );
    P.add(satin, new CylinderGeometry(0.03, 0.03, 0.32, 8).translate(0.02, -0.04, 0));
    P.add(satin, box(L / 2 - 0.08, L / 2 + 0.12, -0.19, -0.15, -0.03, 0.03));
    P.build(g);
    return g;
  };
  const wheels: Wheel[] = [];
  for (const s of [1, -1] as const) {
    const w = K.slot(true, s, new Vector3(ux(axleF), 0.22, s * 0.5));
    w.steer.add(ski());
    wheels.push(w);
  }
  for (const s of [1, -1] as const) wheels.push(K.slot(false, s, new Vector3(ux(axleR), 0.22, s * 0.5)));
  return K.finish({
    wheels,
    doors: [],
    steering,
    seats: [{ hip: new Vector3(ux(1.6), 0.78, 0), side: 1, front: true }],
    eye: new Vector3(ux(1.55), 1.48, 0),
    axleF,
    kind: "snowmobile",
    lamps: {
      head: [new Vector3(ux(0.1), 0.62, 0.08), new Vector3(ux(0.1), 0.62, -0.08)],
      tail: [new Vector3(ux(2.99), 0.46, 0)],
      exhaust: new Vector3(ux(1.0), 0.32, -0.38),
    },
    screen: { u0: 1.0, y0: 0.86, u1: 1.13, y1: 1.22, hw0: 0.36, hw1: 0.34, len: 0.38 },
    rim: (phi, out = new Vector3()) => {
      bar.updateMatrix();
      steering.updateMatrix();
      return out
        .set(0.06, (phi < 0 ? -1 : 1) * 0.36, 0.05)
        .applyMatrix4(steering.matrix)
        .applyMatrix4(bar.matrix);
    },
  });
}

/** The snowcat: a groomer-style crawler in the Grounds' orange — two long tracks on their road
 *  wheels, idlers and toothed sprockets, fenders over them; the rounded cab with its big glass,
 *  white roof, light bar and amber beacon, mirrors, steps and two doors; the engine deck behind
 *  with its louvres and stack; the blade in front on its rams, the tiller and its comb behind. */
export function buildSnowcat(o: SedanOpts): Sedan {
  const L = 4.6;
  const W = 2.4;
  const axleF = 2.2 - 1.25; // (the CoG 2.2 back from the nose; 1.25 behind the front axle)
  const axleR = axleF + 2.6;
  const K = kit(o, L, W);
  const { add, box, rbox, prof, tube, cyl, beam, paint, satin, steel, chrome, glass, ux } = K;
  const white = K.tone("#ecebe6", { coat: 0.3 });
  const vinyl = K.tone("#33373b", { rough: 0.7, out: false });
  const bladeMat = K.tone("#3e4246", { rough: 0.5, metal: 0.4 });
  const beacon = K.tone("#a0560c", { rough: 0.3, dirt: false });
  beacon.emissive.set("#ffa020");
  beacon.emissiveIntensity = 0;
  beacon.transparent = true;
  beacon.opacity = 0.85;

  // ── the tracks: belts and cleats round an idler (front) and a sprocket (back), road wheels ──
  for (const s of [1, -1]) {
    const zc = s * 0.9;
    K.trackLoop({ u: 0.44, y: 0.42, r: 0.4 }, { u: 4.12, y: 0.48, r: 0.46 }, zc, 0.62, 0.05, 0.19);
    for (const u of [1.0, 1.62, 2.24, 2.86, 3.48]) {
      add(K.rubber, K.tyreGeo(0.27, 0.14, 0.6).translate(ux(u), 0.3, zc + s * 0.17));
      add(steel, cyl(u, 0.3, zc + s * 0.245, 0.16, 0.02, "z", 14));
      add(chrome, cyl(u, 0.3, zc + s * 0.26, 0.05, 0.02, "z", 8));
    }
    // the idler and the sprocket: discs with their hubs, the sprocket's teeth
    add(steel, cyl(0.44, 0.42, zc + s * 0.27, 0.33, 0.04, "z", 20));
    add(K.dark, cyl(0.44, 0.42, zc + s * 0.29, 0.1, 0.02, "z", 10));
    add(steel, cyl(4.12, 0.48, zc + s * 0.27, 0.38, 0.04, "z", 20));
    for (let i = 0; i < 12; i++)
      add(
        steel,
        new BoxGeometry(0.07, 0.1, 0.04)
          .translate(0, 0.41, 0)
          .rotateZ((i / 12) * Math.PI * 2)
          .translate(ux(4.12), 0.48, zc + s * 0.27),
      );
    // the fender over it: flat along the top, its nose and tail swept down
    add(
      paint,
      prof(
        [
          [0.0, 0.62],
          [0.22, 1.0],
          [0.5, 1.1],
          [4.1, 1.12],
          [4.5, 1.0],
          [4.6, 0.8],
          [4.52, 0.8],
          [4.38, 0.98],
          [4.1, 1.05],
          [0.5, 1.03],
          [0.28, 0.95],
          [0.08, 0.62],
        ],
        zc - 0.35,
        zc + 0.35,
        0.02,
      ),
    );
  }
  // the hull between the tracks
  add(satin, rbox(0.3, 4.3, 0.42, 1.04, -0.56, 0.56, 0.04));

  // ── the cab ──
  const C0 = 0.6;
  const C1 = 3.45;
  add(paint, rbox(C0, C1, 1.04, 1.58, -1.12, 1.12, 0.07));
  for (const s of [1, -1]) add(white, box(C0 + 0.05, C1 - 0.05, 1.42, 1.5, s * 1.118, s * 1.126));
  // the pillars, the windscreen raked back, the side and back glass
  const A0 = C0 + 0.04;
  const A1 = C0 + 0.32;
  for (const s of [1, -1] as const) {
    add(paint, beam([A0, 1.57, s * 1.08], [A1, 2.44, s * 1.05], 0.08, 0.08));
    add(paint, beam([2.2, 1.57, s * 1.1], [2.2, 2.44, s * 1.1], 0.08, 0.07));
    add(paint, beam([C1 - 0.04, 1.57, s * 1.08], [C1 - 0.08, 2.44, s * 1.06], 0.1, 0.08));
    add(glass, K.pane(2.26, C1 - 0.12, 1.6, 2.4, s * 1.09, s));
    K.surround(2.26, C1 - 0.12, 1.6, 2.4, s * 1.095);
  }
  add(glass, beam([A0 + 0.04, 1.58, 0], [A1 + 0.03, 2.43, 0], 2.1, 0.01));
  add(paint, beam([A0, 1.58, -1.08], [A0, 1.58, 1.08], 0.06, 0.06));
  add(glass, K.paneU(C1 - 0.06, 1.65, 2.35, -0.95, 0.95, 1));
  // the roof (white), its light bar, the beacon, the antenna, the rack
  add(white, rbox(A1 - 0.06, C1 + 0.02, 2.42, 2.56, -1.13, 1.13, 0.06));
  for (const z of [-0.72, -0.25, 0.25, 0.72]) {
    add(satin, rbox(A1 - 0.06, A1 + 0.06, 2.57, 2.72, z - 0.11, z + 0.11, 0.02));
    add(K.headLens, K.paneU(A1 - 0.065, 2.59, 2.7, z - 0.09, z + 0.09, -1));
  }
  add(satin, rbox(A1 - 0.02, A1 + 0.14, 2.55, 2.58, -0.95, 0.95, 0.01));
  add(beacon, cyl(3.0, 2.64, 0, 0.11, 0.16, "y", 14));
  add(beacon, K.sphere(3.0, 2.72, 0, 0.11, 14, 7, Math.PI / 2));
  add(satin, cyl(3.25, 2.95, -0.85, 0.008, 0.8, "y", 4));
  for (const s of [1, -1])
    add(
      satin,
      tube(
        [
          [1.2, 2.56, s * 0.85],
          [1.25, 2.62, s * 0.85],
          [3.1, 2.62, s * 0.85],
          [3.15, 2.56, s * 0.85],
        ],
        0.02,
        6,
      ),
    );
  K.snowCap(1.25, 3.3, -1.0, 1.0, 2.56);
  // the mirrors on their arms; the steps up to the doors; the grab handles
  for (const s of [1, -1]) {
    add(
      satin,
      tube(
        [
          [A0 + 0.12, 2.0, s * 1.08],
          [A0 + 0.05, 2.05, s * 1.28],
        ],
        0.015,
        5,
      ),
    );
    add(satin, rbox(A0, A0 + 0.06, 1.92, 2.18, s * 1.24, s * 1.42, 0.02));
    add(chrome, box(A0 + 0.06, A0 + 0.065, 1.94, 2.16, s * 1.26, s * 1.4));
    add(K.tread, box(0.95, 1.4, 0.74, 0.78, s * 1.2, s * 1.34));
    add(satin, box(0.97, 1.0, 0.74, 1.04, s * 1.21, s * 1.24), box(1.35, 1.38, 0.74, 1.04, s * 1.21, s * 1.24));
    add(
      chrome,
      tube(
        [
          [2.24, 1.2, s * 1.13],
          [2.28, 1.6, s * 1.15],
          [2.24, 2.1, s * 1.13],
        ],
        0.016,
        6,
      ),
    );
  }

  // ── the engine deck behind the cab: louvres, the name, the stack ──
  add(
    paint,
    prof(
      [
        [C1 - 0.05, 1.04],
        [C1 - 0.05, 1.9],
        [4.0, 1.86],
        [4.4, 1.6],
        [4.4, 1.04],
      ],
      -0.98,
      0.98,
      0.05,
    ),
  );
  for (const s of [1, -1]) {
    for (let i = 0; i < 7; i++) add(K.dark, box(3.62 + i * 0.09, 3.66 + i * 0.09, 1.2, 1.6, s * 0.98, s * 0.99));
    K.decal(
      ["YUTOPIA GROUNDS"],
      { u: 3.95, y: 1.72, z: s * 0.985, w: 0.72, h: 0.1, face: s > 0 ? "z" : "-z" },
      { colour: "#1b1b1b", w: 512, h: 72 },
    );
  }
  for (let i = 0; i < 6; i++) add(K.dark, box(3.6, 3.95, 1.885, 1.9, -0.6 + i * 0.22, -0.52 + i * 0.22));
  add(chrome, cyl(3.75, 2.15, -0.7, 0.06, 0.6, "y", 12));
  add(
    chrome,
    tube(
      [
        [3.75, 2.44, -0.7],
        [3.76, 2.52, -0.7],
        [3.85, 2.55, -0.7],
      ],
      0.06,
      8,
    ),
  );
  for (const s of [1, -1]) add(K.red, rbox(4.38, 4.42, 1.3, 1.45, s * 0.6, s * 0.8, 0.01));

  // ── the blade in front on its arms and rams ──
  const face: P2[] = [];
  const back: P2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const u = 0.26 - 0.2 * t + 0.08 * Math.sin(Math.PI * t);
    face.push([u, 0.05 + 0.92 * t]);
    back.push([u + 0.045, 0.05 + 0.92 * t]);
  }
  add(bladeMat, prof([...face, ...back.reverse()], -1.32, 1.32, 0.015));
  add(steel, box(0.24, 0.31, 0.02, 0.09, -1.32, 1.32));
  for (const z of [-1.0, -0.5, 0, 0.5, 1.0]) add(bladeMat, box(0.26, 0.36, 0.12, 0.85, z - 0.03, z + 0.03));
  // (its ends' marker stripes)
  for (const s of [1, -1])
    for (let i = 0; i < 3; i++)
      add(i % 2 ? white : K.red, box(0.06 + i * 0.002, 0.11, 0.75 - i * 0.2, 0.93 - i * 0.2, s * 1.1, s * 1.3));
  for (const s of [1, -1]) {
    add(steel, beam([0.33, 0.45, s * 0.7], [0.62, 0.55, s * 0.5], 0.09, 0.09));
    add(satin, beam([0.33, 0.8, s * 0.45], [0.7, 1.0, s * 0.4], 0.07, 0.07));
    add(chrome, beam([0.35, 0.81, s * 0.45], [0.5, 0.9, s * 0.43], 0.035, 0.035));
  }

  // ── the tiller behind: its hood, the comb trailing it, its arms ──
  add(paint, rbox(4.3, 4.56, 0.2, 0.6, -1.25, 1.25, 0.06));
  for (let i = 0; i < 26; i++) add(K.dark, box(4.5, 4.59, 0.03, 0.22, -1.24 + i * 0.096, -1.18 + i * 0.096));
  for (const s of [1, -1]) add(steel, beam([4.3, 0.85, s * 0.45], [4.45, 0.58, s * 0.6], 0.07, 0.07));

  // ── inside: the floor, the dash and its gauges, four seats ──
  add(K.dark, box(C0 + 0.1, C1 - 0.1, 1.24, 1.28, -1.05, 1.05));
  add(satin, rbox(C0 + 0.08, C0 + 0.42, 1.55, 1.82, -1.05, 1.05, 0.03));
  add(K.gauge, K.paneU(C0 + 0.425, 1.62, 1.78, 0.2, 0.8, 1));
  const seatAt: [number, number][] = [
    [1.85, 0.5],
    [1.85, -0.5],
    [2.75, 0.5],
    [2.75, -0.5],
  ];
  for (const [u, z] of seatAt) {
    add(vinyl, rbox(u - 0.25, u + 0.25, 1.27, 1.43, z - 0.24, z + 0.24, 0.05));
    add(vinyl, rbox(u + 0.2, u + 0.32, 1.42, 2.0, z - 0.23, z + 0.23, 0.05));
  }
  // the steering wheel on its column
  const column = new Group();
  column.position.set(ux(1.35), 1.85, 0.5);
  column.rotation.z = 0.45;
  const steering = new Group();
  steering.rotation.y = Math.PI / 2;
  column.add(steering);
  const SW = K.bucket();
  K.wheelGeo(0.19, SW);
  SW.build(steering);
  const colMesh = new Mesh(K.keep(new CylinderGeometry(0.03, 0.04, 0.4, 8).translate(0, -0.21, 0)), satin);
  colMesh.rotation.z = Math.PI / 2;
  column.add(colMesh);
  K.body.add(column);

  // the doors: a panel and its window each side, by the front seats
  const doors: Door[] = [];
  for (const s of [1, -1] as const)
    doors.push(
      K.door(1.02, s * 1.13, s, (P) => {
        const z0 = Math.min(s * 1.115, s * 1.15);
        const z1 = Math.max(s * 1.115, s * 1.15);
        const zo = s > 0 ? z1 : z0; // (the outside face)
        P.add(paint, rbox(1.02, 2.16, 1.06, 1.58, z0, z1, 0.015));
        P.add(white, box(1.04, 2.14, 1.42, 1.5, Math.min(zo, zo + s * 0.004), Math.max(zo, zo + s * 0.004)));
        P.add(paint, box(1.02, 2.16, 2.36, 2.42, z0, z1));
        P.add(paint, box(2.1, 2.16, 1.58, 2.42, z0, z1));
        P.add(paint, beam([1.02, 1.58, s * 1.132], [1.1, 2.4, s * 1.132], 0.05, 0.035));
        P.add(glass, K.pane(1.08, 2.1, 1.6, 2.36, s * 1.135, s));
        for (const g of [
          box(1.05, 2.13, 1.58, 1.61, z0, z1),
          box(1.05, 2.13, 2.35, 2.38, z0, z1),
          box(2.09, 2.12, 1.58, 2.38, z0, z1),
        ])
          P.add(K.dark, g);
        P.add(chrome, box(1.9, 2.04, 1.33, 1.37, Math.min(zo, zo + s * 0.015), Math.max(zo, zo + s * 0.015)));
      }),
    );

  // the sim's four wheels: the tracks' ends (nothing of their own drawn)
  const wheels: Wheel[] = [];
  for (const [u, front] of [
    [axleF, true],
    [axleR, false],
  ] as const)
    for (const s of [1, -1] as const) wheels.push(K.slot(front, s, new Vector3(ux(u), 0.45, s * 0.9)));
  return K.finish({
    wheels,
    doors,
    steering,
    seats: seatAt.map(([u, z], i) => ({ hip: new Vector3(ux(u), 1.38, z), side: z > 0 ? 1 : -1, front: i < 2 })),
    eye: new Vector3(ux(1.95), 2.0, 0.5),
    axleF,
    kind: "snowcat",
    lamps: {
      head: [new Vector3(ux(A1 - 0.06), 2.64, 0.72), new Vector3(ux(A1 - 0.06), 2.64, -0.72)],
      tail: [new Vector3(ux(4.42), 1.38, 0.7), new Vector3(ux(4.42), 1.38, -0.7)],
      exhaust: new Vector3(ux(3.85), 2.55, -0.7),
    },
    screen: { u0: A0 + 0.04, y0: 1.58, u1: A1 + 0.03, y1: 2.43, hw0: 1.05, hw1: 1.02, len: 0.9 },
    rim: (phi, out = new Vector3()) => {
      steering.updateMatrix();
      column.updateMatrix();
      return out
        .set(Math.sin(phi) * 0.19, Math.cos(phi) * 0.19, 0)
        .applyMatrix4(steering.matrix)
        .applyMatrix4(column.matrix);
    },
    beacon: (on, t) => {
      beacon.emissiveIntensity = on ? pulse(t) : 0;
    },
  });
}
