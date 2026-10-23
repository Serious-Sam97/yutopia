import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  Shape,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";
import { kit, type P2, sect } from "./kit";
import type { Door, Sedan, SedanOpts, Wheel } from "./sedan";
import * as T from "./textures";

// The working ones (docs/plan/34-the-vehicles.md, wave 3), built with the kit (tp/car/kit.ts):
// the town's plough truck, the farm's tractor and the pond's toboggan.

/** The beacon's flash: a rotating lamp's pulse, `k` of a turn behind the other's. */
const pulse = (t: number, k = 0) => 0.35 + 3.8 * Math.max(0, Math.sin((t * 1.6 + k) * Math.PI * 2)) ** 6;

/** The town's plough truck: an 80s conventional cab-and-hood in the town's orange — a chrome
 *  grille between its fenders and their round lamps, the yellow moldboard on its push frame with
 *  its markers and its lamps up on posts, the day cab with its west-coast mirrors and an amber
 *  light bar, the galvanized dump body full of salt with the spinner under its tailgate, the
 *  fuel tank and the steps, dual wheels behind. */
export function buildPloughTruck(o: SedanOpts): Sedan {
  const L = 6.6;
  const W = 2.5;
  const axleF = 1.8;
  const axleR = 6.0;
  const K = kit(o, L, W);
  const { add, box, rbox, prof, loft, tube, cyl, beam, paint, satin, steel, chrome, rubber, glass, ux } = K;
  const yellow = K.tone("#e2ad1c", { coat: 0.3 });
  const galv = K.tone("#a3a8ab", { rough: 0.5, metal: 0.55 });
  const white = K.tone("#e9e8e2", { coat: 0.3 });
  const salt = K.tone("#8a8378", { rough: 1, out: false });
  const vinyl = K.tone("#3d4247", { rough: 0.7, out: false });
  const beacon = [0, 1].map(() => {
    const m = K.tone("#a0560c", { rough: 0.3, dirt: false });
    m.emissive.set("#ffa020");
    m.emissiveIntensity = 0;
    m.transparent = true;
    m.opacity = 0.85;
    return m;
  });

  // ── the chassis: the frame rails and their cross-members, the axles ──
  for (const s of [1, -1]) add(satin, box(0.5, 6.5, 0.56, 0.82, s * 0.4, s * 0.5));
  for (const u of [0.6, 2.4, 3.9, 5.2, 6.4]) add(satin, box(u - 0.05, u + 0.05, 0.6, 0.78, -0.45, 0.45));
  add(satin, box(axleF - 0.07, axleF + 0.07, 0.4, 0.52, -0.82, 0.82));
  add(satin, cyl(axleR, 0.5, 0, 0.11, 1.6, "z", 12));
  add(satin, cyl(axleR, 0.5, 0, 0.2, 0.32, "z", 14)); // (the differential)
  // springs: leaf packs over each axle
  for (const [u, s] of [
    [axleF, 1],
    [axleF, -1],
    [axleR, 1],
    [axleR, -1],
  ] as const)
    add(satin, box(u - 0.55, u + 0.55, 0.48, 0.6, s * 0.36, s * 0.54));

  // ── the front: the bumper, the push frame, the blade ──
  add(satin, rbox(0.46, 0.62, 0.58, 0.92, -1.2, 1.2, 0.03));
  for (const s of [1, -1]) add(steel, box(0.3, 0.5, 0.52, 0.9, s * 0.3, s * 0.42)); // (the mount's plates)
  // the blade: a moldboard curved to roll the snow over, turned to throw it right
  const blade = new Group();
  const B = K.bucket();
  const face: P2[] = [];
  const back: P2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const u = 0.36 - 0.24 * t + 0.11 * Math.sin(Math.PI * t) - (t > 0.85 ? (t - 0.85) * 0.5 : 0);
    const y = 0.07 + 1.05 * t;
    face.push([u, y]);
    back.push([u + 0.045, y - (t === 1 ? 0.02 : 0)]);
  }
  B.add(yellow, prof([...face, ...back.reverse()], -1.45, 1.45, 0.015));
  // its cutting edge, the ribs behind it, the top's hazard strip, its markers
  B.add(steel, box(0.32, 0.4, 0.02, 0.12, -1.46, 1.46));
  for (const z of [-1.2, -0.6, 0, 0.6, 1.2]) B.add(yellow, box(0.38, 0.5, 0.15, 0.95, z - 0.03, z + 0.03));
  B.add(yellow, box(0.33, 0.52, 0.5, 0.58, -1.42, 1.42));
  for (let i = 0; i < 12; i++) {
    const z0 = -1.44 + i * 0.24;
    B.add(i % 2 ? white : K.red, box(0.06, 0.11, 1.08, 1.13, z0, z0 + 0.24));
  }
  for (const s of [1, -1]) {
    B.add(satin, cyl(0.42, 1.1, s * 1.4, 0.012, 1.2, "y", 6));
    B.add(K.amber, K.sphere(0.42, 1.72, s * 1.4, 0.035, 8, 6));
  }
  B.build(blade);
  // (turned about its middle, its right end back)
  blade.position.set(ux(0.3), 0, 0);
  for (const m of blade.children) m.position.set(-ux(0.3), 0, 0);
  blade.rotation.y = -0.18;
  K.body.add(blade);
  // the push frame's arms and the lift ram
  for (const s of [1, -1]) add(steel, beam([0.48, 0.55, s * 0.36], [0.4, 0.45, s * 0.95], 0.1, 0.1));
  add(steel, beam([0.48, 0.92, 0], [0.4, 0.6, 0], 0.09, 0.09));
  add(chrome, beam([0.47, 1.05, 0.05], [0.42, 0.62, 0.05], 0.03, 0.03));

  // ── the hood, its grille, the fenders and their lamps ──
  const hoodS = (u: number, top: number, w: number) => ({ u, ring: sect(0.92, top, w, w - 0.04, 0.09, 0.02) });
  add(paint, loft([hoodS(0.66, 1.6, 0.62), hoodS(0.72, 1.64, 0.63), hoodS(1.5, 1.68, 0.63), hoodS(2.34, 1.74, 0.63)]));
  // (the hood's centre crease and its vents)
  add(paint, box(0.8, 2.3, 1.68, 1.72, -0.03, 0.03));
  for (const s of [1, -1])
    for (let i = 0; i < 6; i++) add(K.dark, box(1.75 + i * 0.07, 1.78 + i * 0.07, 1.25, 1.5, s * 0.63, s * 0.64));
  // the grille: a chrome surround, its bars, dark behind
  add(K.dark, box(0.63, 0.66, 0.98, 1.56, -0.54, 0.54));
  add(chrome, rbox(0.6, 0.66, 0.95, 1.6, -0.58, -0.52, 0.015));
  add(chrome, rbox(0.6, 0.66, 0.95, 1.6, 0.52, 0.58, 0.015));
  add(chrome, rbox(0.6, 0.66, 1.54, 1.6, -0.58, 0.58, 0.015));
  add(chrome, rbox(0.6, 0.66, 0.95, 1.0, -0.58, 0.58, 0.015));
  for (let y = 1.07; y < 1.52; y += 0.075) add(chrome, box(0.61, 0.64, y - 0.012, y + 0.012, -0.53, 0.53));
  add(chrome, box(0.605, 0.64, 1.0, 1.55, -0.02, 0.02));
  K.decal(["YUTOPIA"], { u: 0.598, y: 1.65, z: 0, w: 0.5, h: 0.07, face: "-u" }, { colour: "#1d1d1d", w: 512, h: 72 });
  // the fenders: shaped over the front wheels, each its lamp pair and its signal
  const fender: P2[] = [
    [0.74, 0.86],
    [0.7, 1.12],
    [0.76, 1.3],
    [0.98, 1.43],
    [2.2, 1.44],
    [2.36, 1.32],
    [2.38, 0.86],
  ];
  const ar = 0.66;
  const a0 = Math.acos(Math.min(1, (2.38 - axleF) / ar));
  for (let i = 0; i <= 12; i++) {
    const a = a0 + ((Math.PI - a0) * i) / 12;
    fender.push([axleF + Math.cos(a) * ar, 0.5 + Math.sin(a) * ar]);
  }
  fender.push([0.96, 0.62]);
  for (const s of [1, -1]) {
    add(paint, prof(fender, s * 0.6, s * 1.22, 0.05));
    // (the liner under it)
    add(
      K.dark,
      new CylinderGeometry(ar - 0.02, ar - 0.02, 0.56, 16, 1, true, Math.PI / 2 - 1.3, 2.6)
        .rotateX(Math.PI / 2)
        .translate(ux(axleF), 0.5, s * 0.91),
    );
    K.roundLamp(0.72, 1.14, s * 0.94, 0.1, -1, K.headLens);
    add(K.amber, rbox(0.73, 0.77, 0.92, 1.0, s * 0.82, s * 1.06, 0.01));
    add(K.amber, box(1.2, 1.3, 1.3, 1.36, s * 1.215, s * 1.225)); // (the side marker)
  }
  // the plough's own lamps up on posts above the hood
  for (const s of [1, -1]) {
    add(satin, cyl(1.05, 1.95, s * 0.52, 0.025, 0.55, "y", 8));
    add(satin, rbox(0.98, 1.12, 2.12, 2.36, s * 0.42, s * 0.62, 0.03));
    K.roundLamp(0.96, 2.24, s * 0.52, 0.075, -1, K.headLens, satin, 0.04);
  }

  // ── the cab ──
  const C0 = 2.34; // the cowl, the windscreen's foot
  const C1 = 3.62; // the back wall
  add(paint, rbox(C0, C1, 0.95, 1.98, -1.15, 1.15, 0.05));
  add(white, rbox(C0 - 0.02, C1 + 0.02, 2.72, 2.88, -1.16, 1.16, 0.05));
  // the pillars: A leaning back, B behind the doors, the back corners; the windscreen's centre post
  for (const s of [1, -1]) {
    add(paint, beam([C0 + 0.04, 1.97, s * 1.11], [C0 + 0.14, 2.73, s * 1.09], 0.08, 0.08));
    add(paint, beam([C1 - 0.05, 1.97, s * 1.11], [C1 - 0.05, 2.73, s * 1.11], 0.1, 0.08));
    add(paint, beam([3.25, 1.97, s * 1.13], [3.25, 2.73, s * 1.13], 0.04, 0.06));
  }
  add(paint, beam([C0 + 0.05, 1.97, 0], [C0 + 0.14, 2.73, 0], 0.05, 0.05));
  add(paint, beam([C0 + 0.03, 1.97, -1.1], [C0 + 0.03, 1.97, 1.1], 0.06, 0.06));
  add(glass, beam([C0 + 0.07, 1.98, 0], [C0 + 0.16, 2.72, 0], 2.16, 0.01));
  add(glass, K.pane(3.27, C1 - 0.1, 2.0, 2.7, 1.13, 1), K.pane(3.27, C1 - 0.1, 2.0, 2.7, -1.13, -1));
  for (const s of [1, -1]) K.surround(3.27, C1 - 0.1, 2.0, 2.7, s * 1.135, 0.025);
  add(glass, K.paneU(C1 + 0.005, 2.1, 2.62, -0.75, 0.75, 1));
  add(K.dark, K.paneU(C1 + 0.003, 2.06, 2.66, -0.79, 0.79, 1));
  // the wipers resting at the windscreen's foot
  for (const z of [0.55, -0.45]) add(satin, beam([C0 + 0.1, 2.0, z], [C0 + 0.11, 2.03, z - 0.55], 0.02, 0.02));
  // the roof: its marker lamps, the light bar and its two beacons
  for (const z of [-0.5, -0.25, 0, 0.25, 0.5])
    add(K.amber, rbox(C0 + 0.04, C0 + 0.1, 2.84, 2.9, z - 0.05, z + 0.05, 0.01));
  add(satin, rbox(2.85, 3.1, 2.88, 2.97, -0.75, 0.75, 0.02));
  for (const [i, z] of [
    [0, 0.48],
    [1, -0.48],
  ] as const) {
    add(beacon[i], cyl(2.975, 3.05, z, 0.1, 0.16, "y", 14));
    add(beacon[i], K.sphere(2.975, 3.13, z, 0.1, 14, 7, Math.PI / 2));
  }
  K.snowCap(C0 + 0.12, C1 - 0.06, -1.05, 1.05, 2.88);
  // the west-coast mirrors on their arms
  for (const s of [1, -1]) {
    add(
      chrome,
      tube(
        [
          [C0 + 0.18, 2.4, s * 1.14],
          [C0 + 0.12, 2.42, s * 1.34],
          [C0 + 0.1, 2.42, s * 1.48],
        ],
        0.016,
        6,
      ),
    );
    add(
      chrome,
      tube(
        [
          [C0 + 0.18, 2.05, s * 1.14],
          [C0 + 0.12, 2.0, s * 1.34],
          [C0 + 0.1, 2.0, s * 1.48],
        ],
        0.016,
        6,
      ),
    );
    add(satin, rbox(C0 + 0.06, C0 + 0.12, 1.92, 2.48, s * 1.42, s * 1.62, 0.02));
    add(K.chrome, box(C0 + 0.12, C0 + 0.125, 1.95, 2.45, s * 1.44, s * 1.6));
  }
  // the steps and the fuel tank (left), the battery box (right); the grab handles
  add(K.tread, box(2.5, 3.15, 0.6, 0.64, 0.98, 1.24), box(2.5, 3.15, 0.6, 0.64, -1.24, -0.98));
  for (const s of [1, -1]) {
    add(satin, box(2.52, 2.56, 0.6, 0.95, s * 1.0, s * 1.22), box(3.09, 3.13, 0.6, 0.95, s * 1.0, s * 1.22));
    add(
      chrome,
      tube(
        [
          [C1 + 0.04, 1.3, s * 1.17],
          [C1 + 0.08, 1.9, s * 1.17],
          [C1 + 0.04, 2.5, s * 1.17],
        ],
        0.018,
        6,
      ),
    );
  }
  add(galv, cyl(3.0, 0.88, 0.82, 0.26, 0.95, "u", 18));
  for (const u of [2.62, 3.38])
    add(satin, new TorusGeometry(0.265, 0.02, 4, 18).rotateY(Math.PI / 2).translate(ux(u), 0.88, 0.82));
  add(chrome, cyl(2.9, 1.15, 0.92, 0.05, 0.04, "y", 10));
  add(satin, rbox(2.6, 3.4, 0.62, 1.02, -1.02, -0.62, 0.03));
  // the exhaust stack behind the cab, its curl; the air cleaner on the other side
  add(chrome, cyl(C1 + 0.12, 2.0, -0.95, 0.075, 2.1, "y", 14));
  add(
    chrome,
    tube(
      [
        [C1 + 0.12, 3.02, -0.95],
        [C1 + 0.14, 3.18, -0.95],
        [C1 + 0.26, 3.24, -0.95],
      ],
      0.075,
      10,
    ),
  );
  add(steel, cyl(C1 + 0.12, 2.0, -0.95, 0.105, 0.9, "y", 14));
  add(satin, cyl(C1 + 0.13, 2.0, 0.92, 0.17, 0.8, "y", 16));
  add(satin, cyl(C1 + 0.13, 2.44, 0.92, 0.12, 0.1, "y", 12, 0.17));

  // the doors: the panel, its window frame and glass, the handle, the town's crest
  const doors: Door[] = [];
  for (const s of [1, -1] as const)
    doors.push(
      K.door(C0 + 0.1, s * 1.16, s, (P, g) => {
        const z0 = s * 1.155;
        const z1 = s * 1.19;
        P.add(paint, rbox(C0 + 0.1, 3.22, 1.0, 1.96, Math.min(z0, z1), Math.max(z0, z1), 0.015));
        P.add(paint, box(C0 + 0.16, 3.22, 1.96, 2.02, Math.min(z0, z1), Math.max(z0, z1)));
        P.add(paint, box(3.17, 3.22, 1.96, 2.7, Math.min(z0, z1), Math.max(z0, z1)));
        P.add(paint, beam([C0 + 0.13, 1.98, s * 1.17], [C0 + 0.2, 2.7, s * 1.17], 0.05, 0.035));
        P.add(paint, box(C0 + 0.2, 3.22, 2.68, 2.72, Math.min(z0, z1), Math.max(z0, z1)));
        P.add(glass, K.pane(C0 + 0.2, 3.17, 2.02, 2.68, s * 1.17, s));
        P.add(K.dark, box(C0 + 0.2, 3.17, 2.02, 2.045, Math.min(z0, z1), Math.max(z0, z1)));
        P.add(chrome, box(3.0, 3.14, 1.78, 1.82, s * 1.19, s * 1.205));
        K.decal(
          ["TOWN OF YUTOPIA", "PUBLIC WORKS"],
          { u: 2.78, y: 1.48, z: s * 1.195, w: 0.62, h: 0.3, face: s > 0 ? "z" : "-z" },
          { colour: "#1d3557", bg: "#f4f1e8", border: "#1d3557", w: 512, h: 248 },
          g,
        );
      }),
    );
  for (const s of [1, -1])
    K.decal(
      ["07"],
      { u: 2.05, y: 1.32, z: s * 0.645, w: 0.26, h: 0.18, face: s > 0 ? "z" : "-z" },
      { colour: "#151515", w: 256, h: 176 },
    );

  // ── the dump body: galvanized, its stakes and rails, the cab shield, full of salt ──
  const D0 = 3.82;
  const D1 = 6.55;
  add(galv, box(D0, D1, 1.0, 1.08, -1.2, 1.2));
  for (const s of [1, -1]) {
    add(galv, box(D0, D1, 1.08, 2.22, s * 1.13, s * 1.2));
    add(galv, rbox(D0, D1, 2.2, 2.3, s * 1.1, s * 1.24, 0.02));
    for (let u = D0 + 0.25; u < D1; u += 0.48) add(galv, box(u - 0.04, u + 0.04, 1.08, 2.22, s * 1.2, s * 1.25));
    add(galv, rbox(D0 - 0.02, D1 + 0.02, 0.98, 1.1, s * 1.1, s * 1.26, 0.02));
  }
  add(galv, box(D0, D0 + 0.08, 1.08, 2.4, -1.2, 1.2));
  add(galv, rbox(C1 - 0.08, D0 + 0.08, 2.92, 2.98, -0.95, 0.95, 0.02));
  for (const s of [1, -1]) add(galv, beam([D0 + 0.04, 2.4, s * 0.85], [C1 - 0.02, 2.95, s * 0.85], 0.05, 0.05));
  // the tailgate, ribbed; its hinges' bar
  add(galv, box(D1 - 0.06, D1, 1.08, 2.22, -1.13, 1.13));
  for (const y of [1.35, 1.7, 2.05]) add(galv, box(D1, D1 + 0.04, y - 0.04, y + 0.04, -1.13, 1.13));
  add(steel, cyl(D1 + 0.02, 2.28, 0, 0.03, 2.4, "z", 8));
  add(
    salt,
    loft([
      { u: D0 + 0.1, ring: sect(1.08, 1.85, 1.12, 1.08, 0.3, 0.01, 2) },
      { u: (D0 + D1) / 2, ring: sect(1.08, 2.05, 1.12, 1.1, 0.5, 0.01, 2) },
      { u: D1 - 0.1, ring: sect(1.08, 1.9, 1.12, 1.08, 0.3, 0.01, 2) },
    ]),
  );
  // the hoist under the body's front
  add(chrome, beam([D0 + 0.3, 0.75, 0], [D0 + 0.55, 1.0, 0], 0.08, 0.08));
  // the spreader under the tailgate: its chute and spinner
  add(steel, box(D1 - 0.3, D1 - 0.05, 0.75, 1.0, -0.2, 0.2));
  add(steel, cyl(D1 - 0.18, 0.62, 0, 0.3, 0.025, "y", 18));
  for (let i = 0; i < 4; i++)
    add(steel, new BoxGeometry(0.5, 0.045, 0.024).rotateY((i * Math.PI) / 4).translate(ux(D1 - 0.18), 0.655, 0));
  // the rear: its bumper, lamps, plate, the mud flaps behind the wheels
  add(satin, box(6.45, 6.56, 0.72, 0.86, -1.15, 1.15));
  for (const s of [1, -1]) {
    add(K.red, rbox(6.53, 6.57, 0.88, 1.0, s * 0.82, s * 1.06, 0.01));
    add(K.amber, rbox(6.53, 6.57, 0.88, 1.0, s * 0.62, s * 0.8, 0.01));
    add(rubber, box(6.42, 6.46, 0.22, 0.86, s * 0.66, s * 1.2));
    K.decal(
      ["YUTOPIA"],
      { u: 6.465, y: 0.5, z: s * 0.93, w: 0.48, h: 0.1, face: "u" },
      { colour: "#e9e8e2", w: 512, h: 100 },
    );
  }
  add(K.plateMat, K.paneU(6.565, 0.75, 0.86, -0.22, 0.22, 1));

  // ── inside: the floor, the dash and its gauges, the bench, the gear lever ──
  add(K.dark, box(C0 + 0.05, C1 - 0.05, 0.98, 1.04, -1.1, 1.1));
  add(satin, rbox(C0 + 0.04, C0 + 0.24, 1.55, 1.97, -1.1, 1.1, 0.03));
  add(K.gauge, K.paneU(C0 + 0.245, 1.68, 1.88, 0.2, 0.8, 1));
  add(vinyl, rbox(2.72, 3.2, 1.3, 1.48, -1.06, 1.06, 0.05));
  add(vinyl, rbox(3.16, 3.32, 1.45, 2.3, -1.06, 1.06, 0.05));
  add(satin, beam([2.75, 1.05, 0.05], [2.68, 1.55, 0.05], 0.025, 0.025));
  add(K.dark, K.sphere(2.68, 1.57, 0.05, 0.04, 10, 6));
  // the steering wheel, big and flat, on its leaning column
  const column = new Group();
  column.position.set(ux(2.6), 2.02, 0.5);
  column.rotation.z = 0.62;
  const steering = new Group();
  steering.rotation.y = Math.PI / 2;
  column.add(steering);
  const SW = K.bucket();
  K.wheelGeo(0.24, SW);
  SW.build(steering);
  const colMesh = new Mesh(K.keep(new CylinderGeometry(0.035, 0.045, 0.5, 8).translate(0, -0.27, 0)), satin);
  colMesh.rotation.z = Math.PI / 2;
  column.add(colMesh);
  K.body.add(column);

  // ── the wheels: singles in front, duals behind; steel rims in white ──
  const wheels: Wheel[] = [];
  for (const s of [1, -1] as const)
    wheels.push(K.tyredSlot(true, s, new Vector3(ux(axleF), 0.5, s * 0.95), 0.5, 0.3, { rimPaint: white, rim: 0.55 }));
  for (const s of [1, -1] as const)
    wheels.push(
      K.tyredSlot(false, s, new Vector3(ux(axleR), 0.5, s * 0.95), 0.5, 0.28, {
        rimPaint: white,
        rim: 0.55,
        dual: 0.31,
      }),
    );

  return K.finish({
    wheels,
    doors,
    steering,
    seats: [0.5, -0.5].map((z) => ({
      hip: new Vector3(ux(2.8), 1.6, z),
      side: (z > 0 ? 1 : -1) as 1 | -1,
      front: true,
    })),
    eye: new Vector3(ux(2.85), 2.35, 0.5),
    axleF,
    kind: "ploughtruck",
    lamps: {
      // (its driving light from the plough's lamps up on their posts: the fenders' would only light
      // the back of the blade)
      head: [new Vector3(ux(0.94), 2.24, 0.52), new Vector3(ux(0.94), 2.24, -0.52)],
      tail: [new Vector3(ux(6.57), 0.94, 0.94), new Vector3(ux(6.57), 0.94, -0.94)],
      exhaust: new Vector3(ux(C1 + 0.26), 3.24, -0.95),
    },
    screen: { u0: C0 + 0.07, y0: 1.98, u1: C0 + 0.16, y1: 2.72, hw0: 1.05, hw1: 1.04, len: 0.75 },
    rim: (phi, out = new Vector3()) => {
      steering.updateMatrix();
      column.updateMatrix();
      return out
        .set(Math.sin(phi) * 0.24, Math.cos(phi) * 0.24, 0)
        .applyMatrix4(steering.matrix)
        .applyMatrix4(column.matrix);
    },
    // (the light bar's two beacons turning while it's driven, a half-turn apart)
    beacon: (on, t) => {
      beacon[0].emissiveIntensity = on ? pulse(t) : 0;
      beacon[1].emissiveIntensity = on ? pulse(t, 0.5) : 0;
    },
  });
}

/** The farm's tractor: an old red utility tractor — the rounded hood over its grey engine, the
 *  grille and its lamps, the air cleaner's bowl and the stack with its rain cap, the dash pod, the
 *  big lugged back tyres under their fenders (lamps on them), small ribbed front ones on their
 *  beam, the pan seat on its spring between the fenders, the footplates, the roll bar with its
 *  slow-vehicle sign, the three-point hitch and the drawbar. */
export function buildTractor(o: SedanOpts): Sedan {
  const L = 3.3;
  const W = 1.9;
  const axleF = 0.4;
  const axleR = 2.7;
  const K = kit(o, L, W);
  const { add, box, rbox, prof, loft, tube, cyl, beam, paint, satin, steel, chrome, glass, ux } = K;
  const grey = K.tone("#56595c", { rough: 0.55, metal: 0.35 });
  const cream = K.tone("#e6dcc2", { coat: 0.25 });
  const vinyl = K.tone("#1d1c1b", { rough: 0.55 });
  const ry = 0.78; // the back wheels' centres (big ones: the sim's are all 0.6 round)
  const fy = 0.42; // the front ones'

  // ── the front: the weights, the axle beam on its pivot ──
  add(satin, rbox(0.0, 0.14, 0.42, 0.66, -0.4, 0.4, 0.02));
  for (let i = 0; i < 6; i++) add(grey, rbox(0.01, 0.12, 0.3, 0.45, -0.36 + i * 0.12, -0.26 + i * 0.12, 0.015));
  add(satin, box(axleF - 0.06, axleF + 0.06, fy - 0.06, fy + 0.06, -0.66, 0.66));
  add(satin, cyl(axleF, fy + 0.08, 0, 0.06, 0.2, "u", 10));
  for (const s of [1, -1]) add(satin, cyl(axleF, fy + 0.05, s * 0.64, 0.045, 0.3, "y", 8));
  // the engine and the frame under the hood (grey), its sump; the transmission and the back axle
  add(grey, rbox(0.15, 1.95, 0.42, 0.86, -0.26, 0.26, 0.04));
  add(grey, rbox(0.4, 1.4, 0.34, 0.45, -0.18, 0.18, 0.03));
  for (let i = 0; i < 4; i++) add(grey, cyl(0.55 + i * 0.3, 0.88, 0.27, 0.035, 0.05, "z", 8));
  add(grey, rbox(1.9, 2.95, 0.48, 1.06, -0.33, 0.33, 0.06));
  add(grey, cyl(axleR, ry, 0, 0.12, 1.5, "z", 12));
  for (const s of [1, -1]) add(grey, cyl(axleR, ry, s * 0.5, 0.17, 0.25, "z", 12, 0.12));

  // ── the hood: rounded, from the grille back to the dash; its lamps, cleaner, stack ──
  const hoodS = (u: number, top: number, w: number) => ({ u, ring: sect(0.8, top, w, w - 0.05, 0.13, 0.02) });
  add(paint, loft([hoodS(0.1, 1.36, 0.31), hoodS(0.16, 1.4, 0.33), hoodS(0.9, 1.44, 0.34), hoodS(1.8, 1.48, 0.35)]));
  // the grille: dark behind cream bars, a surround in the paint
  add(K.dark, box(0.085, 0.1, 0.84, 1.3, -0.25, 0.25));
  for (let z = -0.21; z <= 0.215; z += 0.06) add(cream, box(0.075, 0.095, 0.86, 1.28, z - 0.012, z + 0.012));
  add(cream, rbox(0.07, 0.11, 1.28, 1.33, -0.27, 0.27, 0.01));
  K.decal(["YUTOPIA"], { u: 0.12, y: 1.37, z: 0, w: 0.34, h: 0.06, face: "-u" }, { colour: "#e6dcc2", w: 512, h: 90 });
  for (const s of [1, -1]) {
    add(satin, beam([0.32, 1.05, s * 0.33], [0.25, 1.14, s * 0.42], 0.03, 0.03));
    K.roundLamp(0.22, 1.16, s * 0.43, 0.065, -1, K.headLens, cream, 0.09);
    // the hood's sides: louvres, the name and the model
    for (let i = 0; i < 5; i++) add(K.dark, box(0.35 + i * 0.07, 0.38 + i * 0.07, 1.0, 1.24, s * 0.335, s * 0.345));
    K.decal(
      ["YUTOPIA  285"],
      { u: 1.15, y: 1.22, z: s * 0.346, w: 0.62, h: 0.1, face: s > 0 ? "z" : "-z" },
      { colour: "#e6dcc2", w: 512, h: 84 },
    );
  }
  add(cream, box(0.75, 1.75, 1.04, 1.07, -0.345, 0.345)); // (the cream band along the hood's foot)
  // the air cleaner's glass bowl on its stalk; the stack with its rain cap
  add(satin, cyl(0.55, 1.5, 0.14, 0.025, 0.14, "y", 8));
  add(glass, cyl(0.55, 1.62, 0.14, 0.06, 0.11, "y", 12, 0.05));
  add(satin, cyl(0.55, 1.69, 0.14, 0.065, 0.03, "y", 12));
  add(satin, cyl(1.0, 1.85, -0.16, 0.045, 0.85, "y", 12));
  add(chrome, cyl(1.0, 2.3, -0.16, 0.047, 0.06, "y", 12));
  add(satin, new CylinderGeometry(0.06, 0.06, 0.01, 12).rotateZ(0.5).translate(ux(1.01), 2.34, -0.16));
  add(satin, cyl(1.6, 1.5, 0, 0.05, 0.05, "y", 10)); // (the fuel cap)
  // the dash pod at the hood's end, its gauges; the levers
  add(satin, rbox(1.76, 1.98, 1.15, 1.58, -0.32, 0.32, 0.04));
  add(K.gauge, K.paneU(1.985, 1.3, 1.5, -0.24, 0.24, 1));
  for (const z of [-0.4, -0.48]) {
    add(chrome, beam([2.5, 1.12, z], [2.42, 1.48, z], 0.015, 0.015));
    add(K.red, K.sphere(2.42, 1.49, z, 0.025, 8, 6));
  }

  // ── the footplates; the fenders over the back wheels, their lamps ──
  for (const s of [1, -1]) {
    add(K.tread, box(1.72, 2.5, 0.6, 0.64, s * 0.32, s * 0.86));
    add(satin, box(1.75, 1.79, 0.42, 0.6, s * 0.34, s * 0.8));
    const arc: P2[] = [];
    const R0 = 0.86;
    const R1 = 0.9;
    for (let i = 0; i <= 16; i++) {
      const a = 0.25 + ((Math.PI - 0.55) * i) / 16;
      arc.push([axleR + Math.cos(a) * R1, ry + Math.sin(a) * R1]);
    }
    for (let i = 16; i >= 0; i--) {
      const a = 0.25 + ((Math.PI - 0.55) * i) / 16;
      arc.push([axleR + Math.cos(a) * R0, ry + Math.sin(a) * R0]);
    }
    add(paint, prof(arc, s * 0.55, s * 1.12, 0.015));
    // (its inner side: a plate under the arc, down to the axle's housing)
    const side: P2[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = 0.25 + ((Math.PI - 0.55) * i) / 16;
      side.push([axleR + Math.cos(a) * R0, ry + Math.max(0.17, Math.sin(a) * R0)]);
    }
    add(paint, prof(side, s * 0.5, s * 0.55, 0.008));
    add(K.headLens, rbox(2.18, 2.22, 1.55, 1.65, s * 0.78, s * 0.96, 0.01));
    add(satin, rbox(2.2, 2.32, 1.53, 1.67, s * 0.76, s * 0.98, 0.02));
    add(K.red, rbox(3.3, 3.34, 1.0, 1.1, s * 0.8, s * 0.95, 0.01));
    add(K.amber, rbox(2.2, 2.26, 1.45, 1.5, s * 1.0, s * 1.08, 0.01));
  }
  // ── the seat: a pan on its spring, the backrest ──
  add(satin, beam([2.45, 1.05, 0], [2.4, 1.22, 0], 0.08, 0.08));
  add(vinyl, rbox(2.12, 2.6, 1.2, 1.31, -0.25, 0.25, 0.05));
  add(vinyl, rbox(2.55, 2.66, 1.29, 1.72, -0.24, 0.24, 0.05));
  add(steel, rbox(2.1, 2.62, 1.17, 1.21, -0.27, 0.27, 0.015));
  // the roll bar and its slow-vehicle triangle
  add(
    satin,
    tube(
      [
        [2.98, 0.95, 0.6],
        [2.98, 2.2, 0.6],
        [2.98, 2.42, 0.48],
        [2.98, 2.45, 0],
        [2.98, 2.42, -0.48],
        [2.98, 2.2, -0.6],
        [2.98, 0.95, -0.6],
      ],
      0.045,
      10,
    ),
  );
  {
    // (a triangle facing back, on the roll bar's right post)
    const sign = (r: number, du: number) =>
      new ExtrudeGeometry(
        new Shape(
          [0, 1, 2].map((k) => new Vector2(Math.sin((k / 3) * Math.PI * 2) * r, Math.cos((k / 3) * Math.PI * 2) * r)),
        ),
        { depth: 0.008, bevelEnabled: false },
      )
        .rotateY(Math.PI / 2)
        .translate(ux(3.02) + du, 1.95, -0.34);
    add(K.red, sign(0.19, 0));
    add(K.amber, sign(0.125, 0.006));
  }
  // ── the back: the three-point hitch, the drawbar, the PTO ──
  for (const s of [1, -1]) add(steel, beam([2.92, 0.6, s * 0.24], [3.28, 0.46, s * 0.36], 0.05, 0.05));
  add(steel, beam([2.96, 1.1, 0], [3.28, 0.86, 0], 0.06, 0.06));
  add(steel, box(2.9, 3.3, 0.46, 0.52, -0.08, 0.08));
  add(chrome, cyl(3.0, 0.75, 0, 0.035, 0.16, "u", 8));
  add(K.plateMat, K.paneU(3.335, 1.17, 1.27, -0.18, 0.18, 1));

  // the steering wheel on its leaning column
  const column = new Group();
  column.position.set(ux(2.0), 1.72, 0);
  column.rotation.z = 0.85;
  const steering = new Group();
  steering.rotation.y = Math.PI / 2;
  column.add(steering);
  const SW = K.bucket();
  K.wheelGeo(0.2, SW);
  SW.build(steering);
  const colMesh = new Mesh(K.keep(new CylinderGeometry(0.03, 0.04, 0.42, 8).translate(0, -0.22, 0)), satin);
  colMesh.rotation.z = Math.PI / 2;
  column.add(colMesh);
  K.body.add(column);
  K.snowCap(0.3, 1.75, -0.24, 0.24, 1.47);

  // ── the wheels: small ribbed fronts, the big lugged backs; cream rims ──
  const wheels: Wheel[] = [];
  for (const s of [1, -1] as const)
    wheels.push(
      K.tyredSlot(true, s, new Vector3(ux(axleF), 0.6, s * 0.74), 0.42, 0.2, {
        rimPaint: cream,
        rim: 0.55,
        dy: fy - 0.6,
        nuts: 5,
        simR: 0.6,
      }),
    );
  for (const s of [1, -1] as const)
    wheels.push(
      K.tyredSlot(false, s, new Vector3(ux(axleR), 0.6, s * 0.84), 0.74, 0.42, {
        rimPaint: cream,
        rim: 0.5,
        dy: ry - 0.6,
        lugs: true,
        simR: 0.6,
      }),
    );

  return K.finish({
    wheels,
    doors: [],
    steering,
    seats: [{ hip: new Vector3(ux(2.3), 1.35, 0), side: 1, front: true }],
    eye: new Vector3(ux(2.25), 2.0, 0),
    axleF,
    kind: "tractor",
    lamps: {
      head: [new Vector3(ux(0.22), 1.16, 0.43), new Vector3(ux(0.22), 1.16, -0.43)],
      tail: [new Vector3(ux(3.34), 1.05, 0.88), new Vector3(ux(3.34), 1.05, -0.88)],
      exhaust: new Vector3(ux(1.0), 2.34, -0.16),
    },
    screen: { u0: 1.7, y0: 1.45, u1: 1.75, y1: 1.6, hw0: 0.3, hw1: 0.3, len: 0.2 },
    rim: (phi, out = new Vector3()) => {
      steering.updateMatrix();
      column.updateMatrix();
      return out
        .set(Math.sin(phi) * 0.2, Math.cos(phi) * 0.2, 0)
        .applyMatrix4(steering.matrix)
        .applyMatrix4(column.matrix);
    },
  });
}

/** The toboggan: six ash slats on their cross-bars, curled up in front round a dowel, side rails,
 *  the rope threaded along both sides from the curl, a long cushion in the colour (three seats,
 *  stitched), the pull rope lying in front. */
export function buildToboggan(o: SedanOpts): Sedan {
  const L = 1.8;
  const W = 0.6;
  const axleF = 0.2;
  const axleR = 1.4;
  const K = kit(o, L, W);
  const { add, rbox, prof, tube, cyl, satin, ux } = K;
  const ashTex = K.keep(T.ash());
  ashTex.repeat.set(1.4, 3);
  const wood = K.tone("#ffffff", { rough: 0.5, coat: 0.4, map: ashTex });
  const woodDark = K.tone("#8a5a32", { rough: 0.55, coat: 0.3 });
  const rope = K.tone("#cdb68a", { rough: 0.95, dirt: false });
  const pad = K.tone(o.colour, { rough: 0.88 });
  // a slat: flat along the bottom, curled up in front round (0.42, 0.25)
  const cu = 0.34;
  const cy = 0.2;
  const r = 0.15;
  const t = 0.022;
  const end = -Math.PI / 2 - 3.25;
  const outer: P2[] = [[1.8, 0.05]];
  const inner: P2[] = [[1.8, 0.05 + t]];
  for (let i = 0; i <= 18; i++) {
    const a = -Math.PI / 2 + ((end + Math.PI / 2) * i) / 18;
    outer.push([cu + Math.cos(a) * r, cy + Math.sin(a) * r]);
    inner.push([cu + Math.cos(a) * (r - t), cy + Math.sin(a) * (r - t)]);
  }
  const slat = [...inner, ...outer.reverse()];
  for (let i = 0; i < 6; i++) {
    const z0 = -0.29 + i * 0.098;
    add(wood, prof(slat, z0, z0 + 0.09, 0.006));
  }
  // the cross-bars under it, the dowel at the curl's top and one across its front
  for (const u of [0.62, 1.0, 1.38, 1.72]) add(woodDark, rbox(u - 0.025, u + 0.025, 0.026, 0.05, -0.3, 0.3, 0.008));
  add(woodDark, cyl(0.36, 0.345, 0, 0.016, 0.64, "z", 10));
  add(woodDark, cyl(0.19, 0.2, 0, 0.014, 0.62, "z", 10));
  // the side rails, the rope along them through their eyes
  for (const s of [1, -1]) {
    add(woodDark, rbox(0.5, 1.76, 0.072, 0.1, s * 0.27, s * 0.3, 0.006));
    add(
      rope,
      tube(
        [
          [0.36, 0.345, s * 0.32],
          [0.46, 0.25, s * 0.32],
          [0.62, 0.13, s * 0.31],
          [1.1, 0.12, s * 0.31],
          [1.5, 0.12, s * 0.31],
          [1.74, 0.11, s * 0.305],
        ],
        0.009,
        6,
      ),
    );
    for (const u of [0.7, 1.1, 1.5]) add(satin, cyl(u, 0.11, s * 0.3, 0.012, 0.02, "z", 6));
  }
  // the pull rope, lying in a loop in front of the curl
  add(
    rope,
    tube(
      [
        [0.34, 0.34, 0.24],
        [0.16, 0.16, 0.22],
        [0.05, 0.02, 0.12],
        [0.02, 0.012, 0],
        [0.05, 0.02, -0.12],
        [0.16, 0.16, -0.22],
        [0.34, 0.34, -0.24],
      ],
      0.01,
      6,
    ),
  );
  // the cushion: three seats stitched in a row
  for (const [u0, u1] of [
    [0.6, 0.98],
    [1.0, 1.36],
    [1.38, 1.72],
  ])
    add(pad, rbox(u0, u1, 0.072, 0.115, -0.19, 0.19, 0.02));
  // (the front rider's hands on the rope where it leaves the curl)
  const steering = new Group();
  steering.position.set(ux(0.36), 0.345, 0);
  K.body.add(steering);
  const wheels: Wheel[] = [];
  for (const [u, front] of [
    [axleF, true],
    [axleR, false],
  ] as const)
    for (const s of [1, -1] as const) wheels.push(K.slot(front, s, new Vector3(ux(u), 0.1, s * 0.22)));
  return K.finish({
    wheels,
    doors: [],
    steering,
    seats: [0.5, 1.05, 1.6].map((u, i) => ({
      hip: new Vector3(ux(u + 0.12), 0.28, 0),
      side: 1 as const,
      front: i === 0,
    })),
    eye: new Vector3(ux(0.55), 0.95, 0),
    axleF,
    kind: "toboggan",
    lamps: {
      head: [new Vector3(ux(0), 0.3, 0), new Vector3(ux(0), 0.3, 0)],
      tail: [],
      exhaust: new Vector3(ux(1.8), 0.1, 0),
    },
    screen: { u0: 0.1, y0: 0.3, u1: 0.15, y1: 0.4, hw0: 0.25, hw1: 0.25, len: 0.1 },
    rim: (phi, out = new Vector3()) => out.set(ux(0.56), 0.3, (phi < 0 ? 1 : -1) * 0.31),
    lights: false,
  });
}
