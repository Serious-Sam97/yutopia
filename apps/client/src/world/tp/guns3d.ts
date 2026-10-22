import {
  type Box3,
  BoxGeometry,
  type BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  type Material,
  Mesh,
  MeshBasicMaterial,
  Path,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// The guns as models (docs/plan/32-the-arms.md): one builder per gun, the same
// shapes in the hand (mine up close, others'), and on the snow. The gun's own
// frame, in metres, life size: x along the barrel, y up, z to its right; the
// origin where the bore leaves the frame (the revolver) or the action (the
// double-barrel). Side profiles extruded and bevelled, barrels and cylinders
// turned; vertex-coloured, the edges worn bright and the tops a little
// lighter, so they read as steel and walnut under the world's Lambert light.
// The moving parts are their own meshes under a pivot each.

export type GunKind = "revolver" | "shotgun";
export type Detail = "near" | "far";

export interface GunModel {
  root: Group;
  /** what moves: the revolver's hammer, cylinder, gate, trigger; the double-barrel's
   *  barrels (and what's on them), lever, triggers */
  parts: Record<string, Group>;
  /** the rounds you can see (in the cylinder's chambers; at the breech): shown when loaded */
  rounds: Mesh[];
  /** the sight line (the revolver's rear notch and front blade; the double-barrel's eye over its rib
   *  — its rib seen running out to the bead — and the bead), in the gun's frame */
  sight: { rear: [number, number, number]; front: [number, number, number] };
  /** the muzzle (the flash, the tracers come out of it), in the gun's frame */
  muzzle: [number, number, number];
  /** where the right fist holds it, and the grip's slope (rad back from upright) */
  grip: { at: [number, number, number]; rake: number };
}

type P = BufferGeometry;
type Pt = [number, number];

// ── the palette ───────────────────────────────────────────────────────────────
const BLUED = 0x262b32;
const CASE = 0x5d5751; // the revolver's frame: colour-case hardened, warm grey
const STEEL = 0x3c424a;
const WALNUT = 0x5e3720;
const WALNUT_DARK = 0x3f2414;
const BRASS = 0xc39a46;
const LEAD = 0x8b8d90;
const BORE = 0x0a0a0b;
const RUBBER = 0x1c1a19;
const HULL = 0x9c2b25;

/** Vertex colours: `hex`, the edges (a bevel, between a face and a side) worn toward
 *  `edge` by `wear`, the up-facing a touch lighter (a sheen the Lambert light doesn't give). */
function paint(g: P, hex: number, wear = 0, edge = 0xa0a6ad, sheen = 0.18): P {
  const n = g.index ? g.toNonIndexed() : g;
  if (g.index) g.dispose();
  if (!n.getAttribute("normal")) n.computeVertexNormals();
  const nrm = n.getAttribute("normal");
  const base = new Color(hex);
  const worn = new Color(edge);
  const c = new Color();
  const out = new Float32Array(nrm.count * 3);
  for (let i = 0; i < nrm.count; i++) {
    const nz = Math.abs(nrm.getZ(i));
    const ny = nrm.getY(i);
    // (an extrusion's bevel: its normal half along z — the cap and the side have 1 and 0)
    const bev = wear > 0 ? Math.max(0, 1 - Math.abs(nz - 0.6) / 0.32) : 0;
    c.copy(base).lerp(worn, bev * wear);
    c.multiplyScalar(1 + sheen * Math.max(0, ny) - 0.12 * Math.max(0, -ny));
    out[i * 3] = c.r;
    out[i * 3 + 1] = c.g;
    out[i * 3 + 2] = c.b;
  }
  n.setAttribute("color", new Float32BufferAttribute(out, 3));
  return n;
}

/** A side profile (x, y), extruded `d` thick about z = `z`, bevelled `bev`; a point
 *  [x, y] goes straight there, ["s", ...] a smooth run through its points. */
type Seg = Pt | ["s", ...Pt[]];
function outline(segs: Seg[]): Shape {
  const s = new Shape();
  const first = segs[0] as Pt;
  s.moveTo(first[0], first[1]);
  for (const g of segs.slice(1)) {
    if (g[0] === "s") s.splineThru((g.slice(1) as Pt[]).map(([x, y]) => new Vector2(x, y)));
    else s.lineTo(g[0] as number, g[1] as number);
  }
  s.closePath();
  return s;
}
function slab(shape: Shape, d: number, bev: number, z = 0, near = true, holes: Pt[][] = []): P {
  for (const h of holes) shape.holes.push(new Path(h.map(([x, y]) => new Vector2(x, y))));
  const core = Math.max(0.0005, d - bev * 2);
  const g = new ExtrudeGeometry(shape, {
    depth: core,
    bevelEnabled: bev > 0,
    bevelThickness: bev,
    bevelSize: bev * 0.8,
    bevelOffset: -bev * 0.8,
    bevelSegments: near ? 3 : 1,
    curveSegments: near ? 10 : 4,
  });
  g.translate(0, 0, z - core / 2);
  return g;
}
/** Turned about the x axis (a barrel, a cylinder): the profile as [radius, x], front last;
 *  the axis at (y, z). */
function turned(prof: Pt[], y: number, z: number, seg: number): P {
  const g = new LatheGeometry(
    prof.map(([r, x]) => new Vector2(r, x)),
    seg,
  );
  g.rotateZ(-Math.PI / 2); // (its y: the gun's x)
  g.translate(0, y, z);
  return g;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number): P =>
  new BoxGeometry(w, h, d).translate(x, y, z);
/** A disc facing +x (a chamber's mouth, a bore) at (x, y, z). */
const disc = (r: number, x: number, y: number, z: number, seg = 12): P =>
  new CircleGeometry(r, seg).rotateY(Math.PI / 2).translate(x, y, z);
/** A pin along z (a screw's head both sides, a hinge pin). */
const pin = (r: number, l: number, x: number, y: number, seg = 10): P =>
  new CylinderGeometry(r, r, l, seg).rotateX(Math.PI / 2).translate(x, y, 0);

function part(parent: Group, mat: Material, geos: P[], pivot: [number, number, number] = [0, 0, 0]): Group {
  const g = new Group();
  g.position.set(...pivot);
  const merged = mergeGeometries(
    geos.map((p) => p.translate(-pivot[0], -pivot[1], -pivot[2])),
    false,
  );
  for (const p of geos) p.dispose();
  g.add(new Mesh(merged, mat));
  parent.add(g);
  return g;
}

// ── the revolver: a single-action .38, a loading gate on the right ────────────
// The bore at y 0; the cylinder's axis 12 mm under it (its top chamber lines up).
const CYL_Y = -0.012;
const CYL_R = 0.021;
const CYL_HALF = 0.021;
const CHAMBER_R = 0.012;

function revolver(mat: Material, detail: Detail): GunModel {
  const near = detail === "near";
  const seg = near ? 28 : 12;
  const root = new Group();
  const parts: Record<string, Group> = {};
  const rounds: Mesh[] = [];

  // the frame: the top strap over the cylinder's window, the recoil shield behind it, the
  // trigger's housing under it; the window a hole the cylinder sits in
  const frame = outline([
    [0.031, 0.0175],
    [-0.026, 0.0175],
    [-0.031, 0.013],
    ["s", [-0.036, 0.0], [-0.039, -0.017], [-0.035, -0.03]],
    [-0.027, -0.0405],
    [0.012, -0.0405],
    [0.025, -0.035],
    [0.031, -0.028],
  ]);
  const window: Pt[] = [
    [-0.0225, 0.0108],
    [0.0225, 0.0108],
    [0.0225, -0.0345],
    [-0.0225, -0.0345],
  ];
  const still: P[] = [paint(slab(frame, 0.024, 0.002, 0, near, [window]), CASE, 0.55, 0xb0aca6)];
  // the barrel, its crown and bore; a shoulder where it screws into the frame
  still.push(
    paint(
      turned(
        [
          [0.0099, 0.026],
          [0.0099, 0.034],
          [0.0087, 0.04],
          [0.0084, 0.1675],
          [0.0074, 0.1702],
          [0.0046, 0.1698],
          [0.0046, 0.15],
        ],
        0,
        0,
        seg,
      ),
      BLUED,
    ),
  );
  still.push(paint(disc(0.0046, 0.152, 0, 0), BORE, 0, 0, 0));
  // the front sight's blade; the rear sight a notch cut in the strap (two lips)
  still.push(paint(box(0.009, 0.0068, 0.0022, 0.1625, 0.0108, 0), BLUED));
  for (const z of [-0.0029, 0.0029]) still.push(paint(box(0.006, 0.0032, 0.0032, -0.024, 0.019, z), CASE, 0, 0, 0.3));
  // the ejector's housing under the barrel, right of it; its button; the base pin's head
  still.push(
    paint(
      turned(
        [
          [0.0047, 0.031],
          [0.0047, 0.119],
          [0.0036, 0.1245],
          [0.0001, 0.1258],
        ],
        -0.0098,
        0.0062,
        near ? 14 : 8,
      ),
      BLUED,
    ),
  );
  still.push(paint(new SphereGeometry(0.0034, 8, 6).scale(1.3, 1, 1).translate(0.1, -0.0098, 0.0112), STEEL));
  still.push(paint(pin(0.0032, 0.033, 0.0275, CYL_Y + 0.002), STEEL, 0, 0, 0.35));
  // the screws in the frame's sides
  for (const [x, y] of [
    [0.025, -0.006],
    [-0.012, -0.035],
    [0.006, -0.036],
    [-0.031, -0.008],
  ] as Pt[])
    still.push(paint(pin(0.0019, 0.0252, x, y, 8), 0x8a8e93, 0, 0, 0.1));
  // the grip: walnut, the plow handle's curve down and back; a screw through it; the strap's butt
  const gripPts: Pt[] = [
    [-0.0255, -0.039],
    [-0.029, -0.06],
    [-0.038, -0.083],
    [-0.05, -0.102],
    [-0.0625, -0.109],
    [-0.0725, -0.102],
    [-0.0715, -0.08],
    [-0.0605, -0.053],
    [-0.0495, -0.031],
    [-0.041, -0.015],
  ];
  const curved = (pts: Pt[]): Seg[] => [pts[0], ["s", ...pts.slice(1, 5)], ["s", ...pts.slice(5)]];
  still.push(paint(slab(outline(curved(gripPts)), 0.021, 0.0025, 0, near), CASE, 0.5, 0xb0aca6));
  // (the panels: the outline drawn in 2.5 mm, but for the top, under the frame)
  const cx = -0.05;
  const cy = -0.07;
  const panel = gripPts.map(([x, y], i): Pt => {
    const k = i === 0 || i === gripPts.length - 1 ? 0.97 : 0.9;
    return [cx + (x - cx) * k, cy + (y - cy) * k];
  });
  still.push(paint(slab(outline(curved(panel)), 0.031, 0.0045, 0, near), WALNUT, 0.35, 0x8a5a36, 0.25));
  // its screw; the grain's darker lines
  still.push(paint(pin(0.0026, 0.0325, -0.052, -0.068), 0x8a8e93, 0, 0, 0.2));
  const butt = outline([
    [-0.0495, -0.1045],
    [-0.0625, -0.1125],
    [-0.0755, -0.105],
    [-0.0745, -0.1015],
    [-0.0625, -0.1085],
    [-0.0505, -0.101],
  ]);
  still.push(paint(slab(butt, 0.0315, 0.001, 0, near), CASE, 0.4));
  // the trigger guard
  still.push(
    paint(
      new TorusGeometry(0.0128, 0.0017, near ? 6 : 4, near ? 16 : 8, Math.PI)
        .rotateZ(Math.PI)
        .translate(-0.0085, -0.0405, 0),
      CASE,
      0,
      0,
      0.3,
    ),
  );
  part(root, mat, still);

  // the hammer: pivoting behind the cylinder, its spur back over the grip (cocked: back 0.5)
  const hammer = outline([
    [-0.004, -0.004],
    [0.0035, -0.004],
    [0.0035, 0.019],
    ["s", [0.0, 0.026], [-0.008, 0.0285], [-0.017, 0.0295]],
    [-0.0195, 0.0262],
    ["s", [-0.012, 0.0235], [-0.005, 0.02]],
  ]);
  parts.hammer = part(
    root,
    mat,
    [paint(slab(hammer, 0.0085, 0.0012, 0, near).translate(-0.031, -0.006, 0), CASE, 0.6, 0xc0bcb6)],
    [-0.031, -0.006, 0],
  );
  // the trigger
  const trig = outline([
    [-0.0025, 0.0],
    [0.004, 0.0],
    ["s", [0.0015, -0.007], [-0.002, -0.012], [-0.0065, -0.0145]],
    ["s", [-0.0045, -0.008]],
  ]);
  parts.trigger = part(
    root,
    mat,
    [paint(slab(trig, 0.004, 0.0008, 0, near).translate(-0.004, -0.0405, 0), CASE, 0.4)],
    [-0.004, -0.0405, 0],
  );

  // the cylinder, about its axis: chamfered ends, six flutes between the chambers, the
  // chambers' mouths in its face and a round's lead nose in each one loaded
  const cyl: P[] = [
    paint(
      turned(
        [
          [0.0001, -CYL_HALF],
          [0.0188, -CYL_HALF],
          [CYL_R, -CYL_HALF + 0.0024],
          [CYL_R, CYL_HALF - 0.0026],
          [0.0186, CYL_HALF],
          [0.0001, CYL_HALF],
        ],
        CYL_Y,
        0,
        near ? 36 : 14,
      ),
      BLUED,
    ),
  ];
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    // a flute: a dark channel along the outside
    cyl.push(
      paint(
        box(0.027, 0.0016, 0.0058, -0.001, 0, 0)
          .translate(0, CYL_R - 0.0005, 0)
          .rotateX(a)
          .translate(0, CYL_Y, 0),
        0x15181c,
        0,
        0,
        0,
      ),
    );
    const b = (k * Math.PI) / 3;
    cyl.push(
      paint(disc(0.0049, CYL_HALF + 0.0002, CYL_Y + Math.cos(b) * CHAMBER_R, Math.sin(b) * CHAMBER_R), BORE, 0, 0, 0),
    );
  }
  parts.cylinder = part(root, mat, cyl, [0, CYL_Y, 0]);
  for (let k = 0; k < 6; k++) {
    const b = (k * Math.PI) / 3;
    const nose = new SphereGeometry(0.0037, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)
      .rotateZ(-Math.PI / 2)
      .translate(CYL_HALF - 0.0012, Math.cos(b) * CHAMBER_R, Math.sin(b) * CHAMBER_R);
    const m = new Mesh(paint(nose, LEAD, 0, 0, 0.4), mat);
    parts.cylinder.add(m);
    rounds.push(m);
  }
  // the loading gate, on the right behind the cylinder, hinged at its foot (open: out 1.5)
  parts.gate = part(
    root,
    mat,
    [
      paint(
        slab(
          outline([
            [-0.0035, 0],
            [0.0035, 0],
            [0.003, 0.0165],
            [-0.003, 0.0165],
          ]),
          0.003,
          0.0006,
          0,
          near,
        ).translate(-0.0265, -0.021, 0.0155),
        CASE,
        0.5,
      ),
    ],
    [-0.0265, -0.021, 0.0155],
  );

  return {
    root,
    parts,
    rounds,
    sight: { rear: [-0.024, 0.0206, 0], front: [0.1625, 0.0176, 0] },
    muzzle: [0.172, 0, 0],
    grip: { at: [-0.047, -0.066, 0], rake: 0.5 },
  };
}

// ── the double-barrel: a side-by-side 12 gauge, a boxlock ─────────────────────
// The barrels' axes at y 0, z ±BORE_Z; their breech at x 0, hinged under it at HINGE.
const BARREL = 0.68;
const BORE_Z = 0.0127;
const HINGE: [number, number, number] = [0.006, -0.022, 0];

function shotgun(mat: Material, detail: Detail): GunModel {
  const near = detail === "near";
  const seg = near ? 22 : 10;
  const root = new Group();
  const parts: Record<string, Group> = {};
  const rounds: Mesh[] = [];

  // the barrels, and what's on them: the rib between, the bead, the fore-end, the lugs
  const tubes: P[] = [];
  for (const z of [-BORE_Z, BORE_Z]) {
    tubes.push(
      paint(
        turned(
          [
            [0.0136, 0.0],
            [0.0136, 0.07],
            [0.0124, 0.16],
            [0.0114, BARREL - 0.004],
            [0.0104, BARREL],
            [0.0094, BARREL - 0.001],
            [0.0094, BARREL - 0.03],
          ],
          0,
          z,
          seg,
        ),
        BLUED,
      ),
    );
    tubes.push(paint(disc(0.0092, BARREL - 0.028, 0, z), BORE, 0, 0, 0));
    // the breech face: the chamber's dark mouth
    tubes.push(paint(new CircleGeometry(0.0098, 14).rotateY(-Math.PI / 2).translate(-0.0002, 0, z), BORE, 0, 0, 0));
  }
  // the rib along the top, between the barrels; the one under; the bead at the muzzle
  tubes.push(paint(box(BARREL - 0.01, 0.006, 0.007, BARREL / 2 - 0.004, 0.0098, 0), BLUED, 0, 0, 0.35));
  tubes.push(paint(box(BARREL - 0.24, 0.005, 0.008, BARREL / 2 + 0.11, -0.0098, 0), BLUED));
  tubes.push(paint(new SphereGeometry(0.0022, 10, 8).translate(BARREL - 0.008, 0.0145, 0), 0xe9e4d6, 0, 0, 0.3));
  // the lumps under the breech, on the hinge
  tubes.push(paint(box(0.05, 0.016, 0.016, 0.026, -0.016, 0), STEEL));
  // the splinter fore-end: walnut under the barrels, its iron at the back
  const fore = outline([
    [0.038, -0.006],
    [0.25, -0.006],
    ["s", [0.262, -0.014], [0.262, -0.026], [0.25, -0.034]],
    [0.07, -0.038],
    ["s", [0.046, -0.036], [0.038, -0.028]],
  ]);
  tubes.push(paint(slab(fore, 0.05, 0.008, 0, near), WALNUT, 0.35, 0x8a5a36, 0.25));
  tubes.push(paint(box(0.034, 0.005, 0.03, 0.058, -0.0385, 0), CASE, 0, 0, 0.3));
  parts.barrels = part(root, mat, tubes, HINGE);
  // the shells at the breech, their brass heads showing when it's open
  for (const z of [-BORE_Z, BORE_Z]) {
    const shell = mergeGeometries([
      paint(
        new CylinderGeometry(0.0097, 0.0097, 0.012, 14).rotateZ(Math.PI / 2).translate(-0.004, 0, z),
        BRASS,
        0,
        0,
        0.35,
      ),
      paint(
        new CylinderGeometry(0.0106, 0.0106, 0.0016, 14).rotateZ(Math.PI / 2).translate(-0.0102, 0, z),
        BRASS,
        0,
        0,
        0.35,
      ),
      paint(new CylinderGeometry(0.0092, 0.0092, 0.05, 12).rotateZ(Math.PI / 2).translate(0.026, 0, z), HULL),
      paint(new CircleGeometry(0.0026, 10).rotateY(-Math.PI / 2).translate(-0.011, 0, z), 0xd9c08a, 0, 0, 0),
    ]);
    shell.translate(-HINGE[0], -HINGE[1], -HINGE[2]);
    const m = new Mesh(shell, mat);
    parts.barrels.add(m);
    rounds.push(m);
  }

  // the action: the boxlock's body, its fences round the breech; the top tang back to the lever
  const action = outline([
    [0.0, 0.016],
    [-0.012, 0.016],
    ["s", [-0.03, 0.0125], [-0.056, 0.0095]],
    [-0.062, 0.0045],
    [-0.05, -0.027],
    ["s", [-0.03, -0.035], [-0.005, -0.034]],
    [0.03, -0.031],
    ["s", [0.037, -0.026], [0.036, -0.018]],
    [0.0, -0.0145],
  ]);
  const still: P[] = [paint(slab(action, 0.047, 0.004, 0, near), CASE, 0.6, 0xb6b1aa)];
  // the fences: round shoulders behind each barrel
  for (const z of [-BORE_Z, BORE_Z])
    still.push(
      paint(
        new SphereGeometry(0.0145, near ? 14 : 8, near ? 8 : 5, 0, Math.PI * 2, 0, Math.PI / 2)
          .rotateZ(Math.PI / 2)
          .scale(0.55, 1, 1)
          .translate(-0.0008, 0, z),
        CASE,
        0,
        0,
        0.3,
      ),
    );
  // the hinge pin's ends
  still.push(paint(pin(0.0046, 0.0482, HINGE[0], HINGE[1], 12), 0x8a8e93, 0, 0, 0.15));
  // the stock: walnut, the wrist and its pistol grip, the comb, out to the butt
  const stock = outline([
    [-0.054, 0.0095],
    ["s", [-0.085, -0.01], [-0.13, -0.026], [-0.25, -0.036], [-0.375, -0.05]],
    [-0.373, -0.07],
    ["s", [-0.367, -0.125], [-0.358, -0.178]],
    ["s", [-0.29, -0.145], [-0.2, -0.104], [-0.14, -0.08], [-0.115, -0.078]],
    ["s", [-0.103, -0.094], [-0.098, -0.108]],
    [-0.072, -0.108],
    ["s", [-0.064, -0.084], [-0.058, -0.06], [-0.05, -0.034]],
    [-0.058, 0.002],
  ]);
  still.push(paint(slab(stock, 0.044, 0.0085, 0, near), WALNUT, 0.3, 0x8f5d38, 0.28));
  // the grip's cap, the butt's rubber pad
  still.push(
    paint(
      slab(
        outline([
          [-0.1, -0.106],
          [-0.071, -0.106],
          [-0.0705, -0.111],
          [-0.1005, -0.111],
        ]),
        0.03,
        0.001,
        0,
        near,
      ),
      STEEL,
    ),
  );
  const pad = outline([
    [-0.3745, -0.05],
    [-0.391, -0.051],
    ["s", [-0.389, -0.115], [-0.374, -0.183]],
    [-0.358, -0.178],
    ["s", [-0.367, -0.125], [-0.373, -0.07]],
  ]);
  still.push(paint(slab(pad, 0.046, 0.003, 0, near), RUBBER, 0, 0, 0.1));
  // chequering on the wrist (a darker panel), the grip; the safety on the tang
  still.push(
    paint(
      slab(
        outline([
          [-0.068, -0.012],
          [-0.11, -0.03],
          [-0.112, -0.06],
          [-0.072, -0.044],
        ]),
        0.0452,
        0.001,
        0,
        near,
      ),
      WALNUT_DARK,
      0,
      0,
      0.1,
    ),
  );
  still.push(paint(box(0.012, 0.0035, 0.008, -0.04, 0.0128, 0), 0x8a8e93, 0, 0, 0.3));
  // the trigger guard, long, down from the action to the grip
  still.push(
    paint(
      new TorusGeometry(0.019, 0.0021, near ? 6 : 4, near ? 18 : 8, Math.PI)
        .scale(1.25, 0.8, 1)
        .rotateZ(Math.PI)
        .translate(-0.036, -0.031, 0),
      CASE,
      0,
      0,
      0.3,
    ),
  );
  part(root, mat, still);
  // two triggers, front (right barrel) and back (left)
  parts.triggers = part(
    root,
    mat,
    [-0.026, -0.04].map((x) =>
      paint(
        slab(
          outline([
            [-0.0025, 0],
            [0.003, 0],
            ["s", [0.001, -0.007], [-0.003, -0.012], [-0.006, -0.0135]],
            ["s", [-0.0045, -0.007]],
          ]),
          0.0042,
          0.0008,
          0,
          near,
        ).translate(x, -0.031, 0),
        CASE,
        0.4,
      ),
    ),
    [-0.033, -0.031, 0],
  );
  // the top lever, on the tang: swung right to break it open (0.6 about y)
  const lever = outline([
    [0.004, -0.004],
    [0.004, 0.004],
    ["s", [-0.012, 0.0055], [-0.028, 0.0062], [-0.04, 0.009]],
    [-0.044, 0.002],
    ["s", [-0.03, -0.004], [-0.012, -0.004]],
  ]);
  const lv = slab(lever, 0.0045, 0.0012, 0, near)
    .rotateX(Math.PI / 2)
    .translate(-0.006, 0.0182, 0);
  parts.lever = part(root, mat, [paint(lv, CASE, 0.2, 0xc0bcb6, 0.4)], [-0.006, 0.018, 0]);

  return {
    root,
    parts,
    rounds,
    sight: { rear: [0.004, 0.026, 0], front: [BARREL - 0.008, 0.0167, 0] },
    muzzle: [BARREL + 0.005, 0, 0],
    grip: { at: [-0.084, -0.07, 0], rake: 0.35 },
  };
}

/** A gun as a model: its parts and where it's held. `mat` is the world's vertex-coloured
 *  Lambert (one material for all of it). */
export function gunModel(kind: GunKind, mat: Material, detail: Detail = "near"): GunModel {
  return kind === "shotgun" ? shotgun(mat, detail) : revolver(mat, detail);
}

/** The pool cue off a table, held as a gun (features/pballs.ts on the server: it fires the balls;
 *  the user's ask, 2026-10-22). In the double-barrel's frame — so it's carried and shouldered
 *  the same, two-handed — its butt at the shoulder, the right fist round it a hand behind the
 *  breech's place, the left under it further on; its tip, the muzzle the balls come out of.
 *  A two-piece cue: the rubber bumper, the dark butt with its rings, the brass joint, a long maple
 *  shaft, the ivory ferrule and the blue chalked tip. */
export function cueModel(mat: Material, detail: Detail = "near"): GunModel {
  const seg = detail === "near" ? 16 : 8;
  const root = new Group();
  const y = -0.035; // the stick's axis (the fist round it)
  const x0 = -0.36; // the butt
  const x1 = 0.86; // the tip
  const L = x1 - x0;
  const at = (f: number) => x0 + L * f;
  const r = (f: number) => 0.0155 + (0.0062 - 0.0155) * f;
  const piece = (f0: number, f1: number, hex: number, wear = 0) =>
    paint(
      turned(
        [
          [0.0001, at(f0)],
          [r(f0), at(f0)],
          [r(f1), at(f1)],
          [0.0001, at(f1)],
        ],
        y,
        0,
        seg,
      ),
      hex,
      wear,
      0xd8c9a8,
      0.25,
    );
  part(root, mat, [
    piece(0, 0.015, 0x111111),
    piece(0.015, 0.08, 0x1c1a17),
    piece(0.08, 0.36, 0x5b2a1c, 0.2),
    piece(0.36, 0.37, 0xf4efe2),
    piece(0.37, 0.45, 0x2a1810),
    piece(0.45, 0.465, BRASS),
    piece(0.465, 0.975, 0xe6cf9c),
    piece(0.975, 0.993, 0xf4efe2),
    piece(0.993, 1, 0x3d6fa8),
  ]);
  return {
    root,
    parts: {},
    rounds: [],
    sight: { rear: [-0.05, y + 0.016, 0], front: [x1 - 0.02, y + 0.008, 0] },
    muzzle: [x1 + 0.01, y, 0],
    grip: { at: [-0.084, y - 0.01, 0], rake: 0 },
  };
}

/** What a gun in the hand is doing this moment (docs/plan/32-the-arms.md): poseGun's parts, and
 *  `kick` (0..1: a shot's jolt, back and up, settling) and `reload` (0..1: tipped up and turned in
 *  to load it). */
export interface GunFx {
  kick: number;
  cock: number;
  turn: number;
  open: number;
  loaded: number;
  trigger: number;
  reload: number;
}

/** Pose the moving parts. `cock` 0..1 (the revolver's hammer back); `turn` the cylinder in
 *  chambers (0..6, fractions mid-turn); `open` 0..1 (the gate out; the barrels dropped);
 *  `loaded` how many rounds show. */
export function poseGun(
  g: GunModel,
  kind: GunKind,
  s: { cock?: number; turn?: number; open?: number; loaded?: number; trigger?: number },
): void {
  const open = s.open ?? 0;
  if (kind === "revolver") {
    g.parts.hammer.rotation.z = 0.52 * (s.cock ?? 0);
    g.parts.cylinder.rotation.x = ((s.turn ?? 0) * Math.PI) / 3;
    g.parts.gate.rotation.x = 1.5 * open;
    g.parts.trigger.rotation.z = 0.25 * (s.trigger ?? 0);
  } else {
    g.parts.barrels.rotation.z = -0.52 * open;
    g.parts.lever.rotation.y = -0.6 * Math.min(1, open * 3);
    g.parts.triggers.rotation.z = 0.2 * (s.trigger ?? 0);
  }
  g.rounds.forEach((m, i) => {
    m.visible = i < (s.loaded ?? g.rounds.length);
  });
}

/** A 12-gauge shell — the red hull, the brass head — lying along x, its head at −x (one in the hand,
 *  on its way to the breech). */
export function shellGeometry(): BufferGeometry {
  const parts = [
    paint(
      new CylinderGeometry(0.0097, 0.0097, 0.012, 14).rotateZ(Math.PI / 2).translate(-0.004, 0, 0),
      BRASS,
      0,
      0,
      0.35,
    ),
    paint(
      new CylinderGeometry(0.0106, 0.0106, 0.0016, 14).rotateZ(Math.PI / 2).translate(-0.0102, 0, 0),
      BRASS,
      0,
      0,
      0.35,
    ),
    paint(new CylinderGeometry(0.0092, 0.0092, 0.05, 12).rotateZ(Math.PI / 2).translate(0.026, 0, 0), HULL),
  ];
  const g = mergeGeometries(parts, false);
  for (const q of parts) q.dispose();
  return g;
}

/** A gun as one geometry, lying on its left side as it fell (the origin at the middle of
 *  where it touches the ground): what lies on the snow (tp/items3d.ts). */
export function gunLying(kind: GunKind): BufferGeometry {
  const g = gunModel(kind, new MeshBasicMaterial(), "far");
  poseGun(g, kind, {});
  g.root.updateMatrixWorld(true);
  const parts: BufferGeometry[] = [];
  g.root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && m.visible) parts.push(m.geometry.clone().applyMatrix4(m.matrixWorld));
  });
  for (const o of g.root.children) o.traverse((m) => (m as Mesh).geometry?.dispose());
  const out = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  out.rotateX(-Math.PI / 2);
  out.computeBoundingBox();
  const b = out.boundingBox as Box3;
  out.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  return out;
}
