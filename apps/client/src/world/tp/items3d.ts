import {
  type Box3,
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { tinted } from "./campus";
import { gunLying } from "./guns3d";

// What lies on the snow, as small models (docs/plan/30-the-dark.md D3, 31-the-day.md): the
// pockets' things dropped, and the day's nests' caches. Tiles as metres, a little larger than life
// so they read from a few steps off; lying as they'd fall, the origin at the middle of their foot.
// Vertex-coloured, lit as the snow is (they go dark at night: the glint's what shows).

type Part = BufferGeometry;
const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number): Part =>
  tinted(new BoxGeometry(w, h, d).translate(x, y, z), c);
// a cylinder lying along x
const rod = (r: number, l: number, x: number, y: number, z: number, c: number, seg = 10, r2 = r): Part =>
  tinted(new CylinderGeometry(r, r2, l, seg).rotateZ(Math.PI / 2).translate(x, y, z), c);
const BRASS = 0xc9a24a;
const DARK = 0x2a2a2a;

function r38(): Part[] {
  const out = [box(0.14, 0.05, 0.09, 0, 0.025, 0, 0x8a3b2e), box(0.141, 0.012, 0.091, 0, 0.045, 0, 0xe8e0c8)];
  // a few rounds spilled by it
  for (const [x, z, a] of [
    [0.11, 0.03, 0.3],
    [0.13, -0.04, 1.2],
    [0.09, -0.07, 2.0],
  ]) {
    out.push(
      tinted(
        new CylinderGeometry(0.009, 0.009, 0.03, 8)
          .rotateZ(Math.PI / 2)
          .rotateY(a)
          .translate(x, 0.009, z),
        BRASS,
      ),
    );
    out.push(
      tinted(new SphereGeometry(0.009, 6, 4).translate(0.018, 0, 0).rotateY(a).translate(x, 0.009, z), 0x9a948a),
    );
  }
  return out;
}
function shells(): Part[] {
  const out: Part[] = [];
  for (const [x, z, a] of [
    [0, 0, 0.2],
    [0.03, 0.05, 1.1],
    [-0.04, 0.04, 2.4],
  ]) {
    out.push(
      tinted(
        new CylinderGeometry(0.012, 0.012, 0.055, 10)
          .rotateZ(Math.PI / 2)
          .rotateY(a)
          .translate(x, 0.012, z),
        0xb3302b,
      ),
    );
    out.push(
      tinted(
        new CylinderGeometry(0.013, 0.013, 0.016, 10)
          .rotateZ(Math.PI / 2)
          .translate(-0.035, 0, 0)
          .rotateY(a)
          .translate(x, 0.012, z),
        BRASS,
      ),
    );
  }
  return out;
}
function flare(): Part[] {
  return [
    rod(0.022, 0.26, 0, 0.022, 0, 0xc8322a, 10),
    rod(0.024, 0.05, 0.15, 0.022, 0, DARK, 10), // the cap
    rod(0.018, 0.02, -0.14, 0.022, 0, 0x8a8f94, 10), // the striker end
    rod(0.023, 0.02, 0.05, 0.022, 0, 0xe8c84a, 10), // its band
  ];
}
function battery(): Part[] {
  return [
    rod(0.03, 0.1, 0, 0.03, 0, 0x2b4f2f, 12),
    rod(0.031, 0.02, -0.04, 0.03, 0, BRASS, 12),
    rod(0.01, 0.012, 0.056, 0.03, 0, 0xc0c4c8, 8),
  ];
}
function aid(): Part[] {
  return [
    box(0.3, 0.1, 0.2, 0, 0.05, 0, 0xeceae4),
    box(0.302, 0.012, 0.202, 0, 0.09, 0, 0xd8d4cb), // the lid's seam
    box(0.1, 0.006, 0.03, 0, 0.103, 0, 0xc8322a), // the cross
    box(0.03, 0.006, 0.1, 0, 0.103, 0, 0xc8322a),
    tinted(new TorusGeometry(0.04, 0.008, 4, 10, Math.PI).translate(0, 0.1, -0.1), 0x9a948a), // the handle
  ];
}
function fuse(): Part[] {
  return [
    rod(0.016, 0.05, 0, 0.016, 0, 0xcfe3ee, 10),
    rod(0.018, 0.014, -0.03, 0.016, 0, 0xa7a9ad, 10),
    rod(0.018, 0.014, 0.03, 0.016, 0, 0xa7a9ad, 10),
  ];
}

// ── the day's nests' caches ─────────────────────────────────────────────────
function briefcase(): Part[] {
  // flat on the snow, as dropped
  return [
    box(0.46, 0.11, 0.33, 0, 0.055, 0, 0x3b2a20),
    box(0.462, 0.012, 0.332, 0, 0.07, 0, 0x2a1d16), // the seam round it
    box(0.03, 0.02, 0.012, -0.12, 0.08, -0.166, BRASS), // the clasps
    box(0.03, 0.02, 0.012, 0.12, 0.08, -0.166, BRASS),
    tinted(new TorusGeometry(0.06, 0.012, 4, 12, Math.PI).rotateX(-Math.PI / 2).translate(0, 0.07, -0.17), 0x2a1d16), // the handle
  ];
}
function lunchbox(): Part[] {
  return [
    box(0.3, 0.12, 0.18, 0, 0.06, 0, 0x2f5d8a),
    tinted(
      new CylinderGeometry(0.09, 0.09, 0.3, 14, 1, false, 0, Math.PI)
        .rotateZ(Math.PI / 2)
        .rotateX(-Math.PI / 2)
        .translate(0, 0.12, 0),
      0x2f5d8a,
    ), // the domed lid
    box(0.302, 0.01, 0.182, 0, 0.12, 0, 0x244a6e),
    tinted(new TorusGeometry(0.06, 0.008, 4, 10, Math.PI).translate(0, 0.21, 0), 0x8a929c), // the handle
    box(0.03, 0.04, 0.01, 0, 0.12, -0.092, 0xc0c4c8), // the latch
  ];
}
function toolbox(): Part[] {
  return [
    box(0.5, 0.18, 0.22, 0, 0.09, 0, 0xb3302b),
    box(0.502, 0.05, 0.222, 0, 0.2, 0, 0x8f2520), // the lid
    box(0.22, 0.025, 0.025, 0, 0.245, 0, 0x5c6166), // its handle
    box(0.02, 0.04, 0.025, -0.1, 0.23, 0, 0x5c6166),
    box(0.02, 0.04, 0.025, 0.1, 0.23, 0, 0x5c6166),
    box(0.04, 0.05, 0.01, -0.18, 0.17, -0.112, 0xc0c4c8), // the latches
    box(0.04, 0.05, 0.01, 0.18, 0.17, -0.112, 0xc0c4c8),
  ];
}
function hunting(): Part[] {
  return [
    tinted(new SphereGeometry(0.2, 12, 8).scale(1.1, 0.6, 0.8).translate(0, 0.11, 0), 0x4b5a34), // the canvas, slumped
    tinted(new BoxGeometry(0.34, 0.03, 0.2).rotateX(-0.25).translate(0, 0.2, -0.04), 0x3a4628), // the flap
    box(0.04, 0.03, 0.02, 0, 0.19, -0.14, 0x6b4a32), // its buckle strap
    tinted(
      new TorusGeometry(0.22, 0.012, 4, 16)
        .rotateX(Math.PI / 2)
        .scale(1.4, 1, 0.8)
        .translate(0.05, 0.012, 0.05),
      0x6b4a32,
    ), // the shoulder strap, loose
    tinted(new CylinderGeometry(0.012, 0.012, 0.06, 8).rotateZ(Math.PI / 2).translate(0.26, 0.02, 0.1), 0xb3302b), // a shell rolled out
  ];
}
function flareBag(): Part[] {
  const out = [
    tinted(new CylinderGeometry(0.13, 0.15, 0.22, 12).translate(0, 0.11, 0), 0xc8322a),
    tinted(new CylinderGeometry(0.135, 0.135, 0.03, 12).translate(0, 0.21, 0), 0x9e2620),
  ];
  // flares standing out of it
  for (const [x, z, t] of [
    [0.04, 0.02, 0.15],
    [-0.04, 0.03, -0.1],
    [0.0, -0.05, 0.05],
  ]) {
    out.push(tinted(new CylinderGeometry(0.02, 0.02, 0.3, 8).rotateZ(t).translate(x, 0.27, z), 0xc8322a));
    out.push(tinted(new CylinderGeometry(0.022, 0.022, 0.05, 8).rotateZ(t).translate(x - t * 0.14, 0.42, z), DARK));
  }
  return out;
}
function torch(): Part[] {
  // a torch left on, on its side: the body, the head, its lit lens
  return [
    rod(0.035, 0.24, -0.04, 0.04, 0, 0x2a2a2a, 12),
    tinted(new CylinderGeometry(0.05, 0.035, 0.08, 12).rotateZ(-Math.PI / 2).translate(0.12, 0.05, 0), 0x3a3a3a),
    rod(0.046, 0.008, 0.162, 0.05, 0, 0xfff2c4, 12),
    box(0.03, 0.012, 0.02, -0.02, 0.078, 0, 0x8a8f94), // the switch
    tinted(new ConeGeometry(0.006, 0.02, 6).translate(-0.17, 0.04, 0), 0x2a2a2a),
  ];
}

function vxtape(): Part[] {
  // (plan 88) Vortex's tape lying flat: the black shell, his pink label, two white hubs, the tape pulled out
  return [
    box(0.11, 0.014, 0.07, 0, 0.007, 0, 0x1d1d22),
    box(0.09, 0.002, 0.036, 0, 0.0145, -0.008, 0xff2d95),
    rod(0.007, 0.003, -0.018, 0.016, -0.008, 0xdddddd, 10),
    rod(0.007, 0.003, 0.018, 0.016, -0.008, 0xdddddd, 10),
    box(0.012, 0.002, 0.09, 0.02, 0.002, 0.07, 0x4a2c18),
  ];
}

// ── (plan 103) the skateboards, lying on their wheels: true size — the GLBs' measures and first colours
// (apps/client/public/life/skate/manifest.json, tools/art/skate) ────────────────────────────────────────────────
interface BoardLook {
  /** length tip to tip, width, the deck's top over the ground, its thickness, the axles apart (m) */
  l: number;
  w: number;
  h: number;
  t: number;
  wb: number;
  /** the wheels' radius, width */
  r: number;
  ww: number;
  /** the kicks: length (the tip's included), angle (rad) — a cruiser's flat nose 0 */
  nose: [number, number];
  tail: [number, number];
  paint: number;
  wheel: number;
}
const BOARDS: Record<string, BoardLook> = {
  board_vert_classic: {
    l: 0.763,
    w: 0.255,
    h: 0.1025,
    t: 0.0125,
    wb: 0.394,
    r: 0.032,
    ww: 0.042,
    nose: [0.09, 0.1745],
    tail: [0.155, 0.2618],
    paint: 0xe4007c,
    wheel: 0xf2efe4,
  },
  board_vert_fish: {
    l: 0.767,
    w: 0.255,
    h: 0.1025,
    t: 0.0125,
    wb: 0.394,
    r: 0.032,
    ww: 0.042,
    nose: [0.09, 0.1745],
    tail: [0.155, 0.2618],
    paint: 0x00a6a6,
    wheel: 0xf4f1e6,
  },
  board_vert_square: {
    l: 0.763,
    w: 0.255,
    h: 0.1025,
    t: 0.0125,
    wb: 0.394,
    r: 0.032,
    ww: 0.042,
    nose: [0.09, 0.1745],
    tail: [0.155, 0.2618],
    paint: 0x2b3bff,
    wheel: 0xffffff,
  },
  board_street_pop: {
    l: 0.806,
    w: 0.205,
    h: 0.0885,
    t: 0.0115,
    wb: 0.356,
    r: 0.025,
    ww: 0.031,
    nose: [0.171, 0.3316],
    tail: [0.163, 0.3491],
    paint: 0xc8a27a,
    wheel: 0xf3f0e8,
  },
  board_street_slick: {
    l: 0.806,
    w: 0.205,
    h: 0.0885,
    t: 0.0115,
    wb: 0.356,
    r: 0.025,
    ww: 0.031,
    nose: [0.171, 0.3316],
    tail: [0.163, 0.3491],
    paint: 0x1a1a1a,
    wheel: 0xf3f0e8,
  },
  board_street_tech: {
    l: 0.806,
    w: 0.199,
    h: 0.0875,
    t: 0.0115,
    wb: 0.356,
    r: 0.024,
    ww: 0.03,
    nose: [0.185, 0.3665],
    tail: [0.149, 0.3491],
    paint: 0x3c6e47,
    wheel: 0xf3f0e8,
  },
  board_cruiser_classic: {
    l: 0.74,
    w: 0.229,
    h: 0.102,
    t: 0.012,
    wb: 0.38,
    r: 0.03,
    ww: 0.043,
    nose: [0.107, 0.0],
    tail: [0.13, 0.2967],
    paint: 0xff7f50,
    wheel: 0xff8a3d,
  },
  board_cruiser_wood: {
    l: 0.74,
    w: 0.229,
    h: 0.102,
    t: 0.012,
    wb: 0.38,
    r: 0.03,
    ww: 0.043,
    nose: [0.107, 0.0],
    tail: [0.13, 0.2967],
    paint: 0xb98b5e,
    wheel: 0xf0e68c,
  },
  board_cruiser_mini: {
    l: 0.688,
    w: 0.191,
    h: 0.0965,
    t: 0.0105,
    wb: 0.34,
    r: 0.03,
    ww: 0.043,
    nose: [0.105, 0.0],
    tail: [0.121, 0.3142],
    paint: 0xff4f79,
    wheel: 0xffffff,
  },
};
const GRIP = 0x26282c;
const ALLOY = 0xa7a9ad;
function skateboard(b: BoardLook): Part[] {
  const { t } = b;
  const y = b.h - t / 2; // the deck's middle, over the ground
  const rise = b.h - t - b.r; // the truck under it
  // (the flat, to each kick; each kick out from there, its round tip at its end)
  const nf = b.l / 2 - b.nose[0];
  const tf = b.l / 2 - b.tail[0];
  const out: Part[] = [box(nf + tf, t, b.w, (nf - tf) / 2, y, 0, b.paint)];
  out.push(box(nf + tf, 0.003, b.w - 0.006, (nf - tf) / 2, y + t / 2 + 0.0015, 0, GRIP));
  const kick = (dir: 1 | -1, [len, a]: [number, number], at: number) => {
    const end = (g: BufferGeometry) => g.rotateZ(dir * a).translate(dir * at, y, 0);
    const k = Math.max(0, len - b.w / 4);
    if (k > 0) {
      out.push(tinted(end(new BoxGeometry(k, t, b.w).translate((dir * k) / 2, 0, 0)), b.paint));
      out.push(tinted(end(new BoxGeometry(k, 0.003, b.w - 0.006).translate((dir * k) / 2, t / 2 + 0.0015, 0)), GRIP));
    }
    const tip = new CylinderGeometry(b.w / 2, b.w / 2, t, 16, 1, false, dir > 0 ? 0 : Math.PI, Math.PI)
      .scale(0.5, 1, 1)
      .translate(dir * k, 0, 0);
    out.push(tinted(end(tip), b.paint));
  };
  kick(1, b.nose, nf);
  kick(-1, b.tail, tf);
  // the trucks: a baseplate under the deck, the kingpin's block, the hanger, the axle; the four wheels
  const half = b.w / 2 - b.ww / 2;
  for (const x of [b.wb / 2, -b.wb / 2]) {
    out.push(box(0.06, 0.012, 0.055, x, y - t / 2 - 0.006, 0, ALLOY));
    out.push(box(0.022, rise - 0.012, 0.03, x, b.r + (rise - 0.012) / 2, 0, ALLOY));
    out.push(box(0.03, 0.022, half * 1.5, x, b.r + 0.004, 0, ALLOY));
    out.push(
      tinted(
        new CylinderGeometry(0.004, 0.004, 2 * half + b.ww, 6).rotateX(Math.PI / 2).translate(x, b.r, 0),
        0x8a8f94,
      ),
    );
    for (const z of [half, -half])
      out.push(tinted(new CylinderGeometry(b.r, b.r, b.ww, 14).rotateX(Math.PI / 2).translate(x, b.r, z), b.wheel));
  }
  return out;
}

const MODELS: Record<string, () => Part[]> = {
  // (the guns: their own models, the ones in the hand — tp/guns3d.ts)
  revolver: () => [gunLying("revolver")],
  shotgun: () => [gunLying("shotgun")],
  // (the AK has no drawn model yet — the double-barrel lies in for it: plan 79 phase 8 brings the life
  // look's to the snow)
  ak47: () => [gunLying("ak47")],
  sniper: () => [gunLying("sniper")],
  daybreak: () => [gunLying("daybreak")],
  r38,
  r762: r38,
  r308: r38,
  cell: r38,
  shell: shells,
  flare,
  battery,
  aid,
  fuse,
  "cache:briefcase": briefcase,
  "cache:lunchbox": lunchbox,
  "cache:toolbox": toolbox,
  "cache:hunting": hunting,
  "cache:flares": flareBag,
  "cache:torch": torch,
  vxtape,
  // (plan 87) the torch dropped: as a cache's
  torch,
  ...Object.fromEntries(Object.entries(BOARDS).map(([id, b]) => [id, () => skateboard(b)])),
};
// (how much bigger than life, to read on the snow)
const SCALE: Record<string, number> = {
  revolver: 1.8,
  shotgun: 1, // (a life-size double-barrel is long enough to read)
  ak47: 1,
  sniper: 1,
  daybreak: 1,
  r38: 1.8,
  r762: 1.8,
  r308: 1.8,
  cell: 1.8,
  shell: 2,
  flare: 1.6,
  battery: 1.8,
  aid: 1.4,
  fuse: 2.2,
  // (plan 88: the trophy, big enough to read where he fell)
  vxtape: 2.4,
  // (plan 103: a board at its true size — 0.7–0.8 m reads on its own)
  ...Object.fromEntries(Object.keys(BOARDS).map((id) => [id, 1])),
};

const made = new Map<string, BufferGeometry>();
// (the guns' life-look models, once they've loaded: plan 79 phase 8)
const life = new Set<string>();
/** A gun lying on the snow from its life-look scene (tools/art/guns/build_guns.py), once it's loaded: its
 *  parts as they rest, coloured by their materials, on its left side — then what itemModel gives for it
 *  (a drop already lying swaps to it: tp/arms3d.ts). */
export function lifeItemModel(kind: string, scene: Object3D): BufferGeometry {
  const had = made.get(kind);
  if (life.has(kind) && had) return had;
  const gun = (scene.getObjectByName(kind) ?? scene).clone(true);
  gun.position.set(0, 0, 0);
  gun.updateMatrixWorld(true);
  const parts: BufferGeometry[] = [];
  gun.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || !m.visible) return;
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    for (const a of Object.keys(g.attributes)) if (a !== "position" && a !== "normal") g.deleteAttribute(a);
    const mat = m.material as MeshStandardMaterial;
    parts.push(tinted(g, mat.color ? mat.color.getHex() : 0x777777));
  });
  const out = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  out.rotateX(-Math.PI / 2);
  out.scale(1.15, 1.15, 1.15);
  out.computeBoundingBox();
  const b = out.boundingBox as Box3;
  out.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  had?.dispose();
  made.set(kind, out);
  life.add(kind);
  return out;
}
/** The model of `item` (an inventory item id, or "cache:<kind>"), made once and shared. */
export function itemModel(item: string): BufferGeometry {
  let g = made.get(item);
  if (g) return g;
  const parts = (MODELS[item] ?? (() => [box(0.12, 0.08, 0.12, 0, 0.04, 0, 0x888888)]))();
  g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  const s = SCALE[item] ?? 1.15;
  g.scale(s, s, s);
  made.set(item, g);
  return g;
}
