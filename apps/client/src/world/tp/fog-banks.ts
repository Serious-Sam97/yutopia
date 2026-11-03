import { landAt, landReady, POND, POND_LEVEL, RAVINE, RIVER, waterAt } from "@yutopia/shared/grounds";
import {
  BufferGeometry,
  CanvasTexture,
  type Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  RepeatWrapping,
} from "three";

// The banks (docs/plan/64-the-fog.md, F3): on a fog morning, sheets of fog lying low over the low
// places — the frozen river, the pond, the ravine — drifting with the wind. From up on the road
// bridge or the bank they're a white sea in the valley; walk down into them and they're gone (you're
// in the haze, fog3d.ts, and a sheet seen edge on is nothing): each fades out near you and in its
// own layer. Where the land comes up to a sheet it thins out, so it never cuts into a bank. High
// only; made a sheet a frame, the nearest first and only within NEAR of me (past it the haze has
// them anyway) — the land under each sampled then, where the Grounds have it made already (out to
// 440 tiles: grounds-stream.ts) — a sheet waits till its land's made (a land chunk by the river is
// 30–50 ms to make), never makes it.

/** One sheet, in the Grounds' coords: its middle, its size (along, across), which way it lies
 *  (radians, `along` that way) and its height. */
export interface Sheet {
  x: number;
  z: number;
  along: number;
  across: number;
  yaw: number;
  y: number;
  /** its height over the land under its middle (the river's, the ravine's), or a level of its own
   *  (the pond's): FogBanks takes the land when it makes it */
  overLand: boolean;
}

// (the river north of here runs under the Kart Park's ground: no sheets there)
const RIVER_NORTH = -640;

/** The land, or the water's level over its bed (plan 66: the river's deep under it). */
const overWater = (x: number, z: number) => {
  const w = waterAt(x, z);
  return w ? Math.max(landAt(x, z), w.level) : landAt(x, z);
};

/** Where the sheets lie: along the river every 70 tiles, the ravine every 55, three on the pond.
 *  Their heights from the land under their middles (the bed's: `land`). */
export function bankSheets(land: (x: number, z: number) => number = overWater): Sheet[] {
  const out: Sheet[] = [];
  const along = (line: readonly (readonly [number, number])[], step: number, size: [number, number], up: number) => {
    let left = step / 2;
    for (let i = 1; i < line.length; i++) {
      const [x0, z0] = line[i - 1];
      const [x1, z1] = line[i];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 1e-6) continue;
      let t = left;
      for (; t <= len; t += step) {
        const x = x0 + ((x1 - x0) * t) / len;
        const z = z0 + ((z1 - z0) * t) / len;
        if (z < RIVER_NORTH) continue;
        out.push({
          x,
          z,
          along: size[0],
          across: size[1],
          yaw: Math.atan2(z1 - z0, x1 - x0),
          y: land(x, z) + up,
          overLand: true,
        });
      }
      left = t - len;
    }
  };
  along(RIVER.line, 70, [110, 58], 2.2);
  along(RAVINE.line, 55, [90, 34], 3);
  for (const dx of [-26, 0, 26])
    out.push({ x: POND.cx + dx, z: POND.cz, along: 64, across: 52, yaw: 0, y: POND_LEVEL + 1.6, overLand: false });
  return out;
}

const N = 10; // a sheet's grid: its vertices take the land under them
const NEAR = 200; // made only this near me (tiles: past it the haze leaves under 2 % of one, and the Grounds have their land made out to 440)

/** Where a sheet's vertices lie (Grounds coords), row by row. */
function sheetPoints(s: Sheet, at: (x: number, z: number, u: number, v: number) => void) {
  const ca = Math.cos(s.yaw);
  const sa = Math.sin(s.yaw);
  for (let j = 0; j <= N; j++)
    for (let i = 0; i <= N; i++) {
      const u = i / N - 0.5;
      const v = j / N - 0.5;
      const lx = u * s.along;
      const lz = v * s.across;
      at(s.x + lx * ca - lz * sa, s.z + lx * sa + lz * ca, u, v);
    }
}

/** Whether the land under all of a sheet is made already (`ready`: shared grounds.ts landReady). */
export function sheetReady(s: Sheet, ready: (x: number, z: number) => boolean = landReady): boolean {
  let ok = ready(s.x, s.z);
  if (ok)
    sheetPoints(s, (x, z) => {
      if (ok && !ready(x, z)) ok = false;
    });
  return ok;
}

/** A sheet's vertices (Grounds coords) and their alpha: soft to its own edge, thin where the land
 *  comes up within 2 tiles of it, none where the land's over it. */
export function sheetGrid(s: Sheet, land: (x: number, z: number) => number = overWater) {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  sheetPoints(s, (x, z, u, v) => {
    const r = Math.min(1, Math.hypot(u * 2, v * 2));
    const edge = 1 - r * r;
    const gap = s.y - land(x, z);
    const k = Math.min(1, Math.max(0, (gap - 0.4) / 1.8));
    const a = Math.max(0, edge) * k * k * (3 - 2 * k);
    pos.push(x, s.y, z);
    col.push(1, 1, 1, a);
    // (the cloud's texture by where it is: one cloud across sheets that meet)
    uv.push(x / 90, z / 90);
  });
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i;
      const b = a + 1;
      const c = a + N + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  return { pos, col, uv, idx };
}

// a tileable soft cloud: white blobs, its alpha the density
function cloudTex(): CanvasTexture {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  let seed = 64;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 150; i++) {
    const x = r() * S;
    const y = r() * S;
    const w = 28 + r() * 70;
    const a = 0.22 + r() * 0.3;
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, w);
        grd.addColorStop(0, `rgba(255,255,255,${a})`);
        grd.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = grd;
        g.fillRect(x + ox - w, y + oy - w, w * 2, w * 2);
      }
  }
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  return t;
}

export class FogBanks {
  private mat: MeshBasicMaterial;
  private tex: CanvasTexture;
  private todo: Sheet[] | null = null;
  private meshes: Mesh[] = [];

  constructor(private root: Object3D) {
    this.tex = cloudTex();
    this.mat = new MeshBasicMaterial({
      map: this.tex,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      opacity: 0,
    });
    // (gone near me and in their own layer: seen edge on, or from inside, a sheet is nothing)
    this.mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
#ifdef USE_FOG
	diffuseColor.a *= smoothstep( 12.0, 45.0, length( vFogW - cameraPosition ) ) * smoothstep( 0.8, 4.0, abs( cameraPosition.y - vFogW.y ) );
#endif`,
      );
    };
  }

  /** A frame: how much of them (0 … 1: the haze, less the wall and the lift; 0 below High), their
   *  colour (the fog's, linear), the wind (radians), where I am (Grounds coords) and the time. */
  update(k: number, colour: Color, wind: number, at: { x: number; z: number }, time: number) {
    this.mat.opacity = k;
    const on = k > 0.01;
    for (const m of this.meshes) m.visible = on;
    if (!on) return;
    // (their tops lit from above: a little brighter than the haze round them)
    this.mat.color.copy(colour).multiplyScalar(1.12);
    this.tex.offset.set(Math.cos(wind) * time * 0.0016, Math.sin(wind) * time * 0.0016);
    // made a sheet a frame, the nearest within NEAR whose land the Grounds have made (where they
    // lie: no land read for that; the land under one never made here — a chunk's 30–50 ms)
    this.todo ??= bankSheets(() => 0);
    let best = -1;
    let bestD = NEAR;
    this.todo.forEach((s, i) => {
      const d = Math.hypot(s.x - at.x, s.z - at.z);
      if (d < bestD && sheetReady(s)) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0) return;
    const [s] = this.todo.splice(best, 1);
    if (s.overLand) s.y += overWater(s.x, s.z);
    this.add(s);
  }

  /** A one-quad stand-in in their material (as a sheet is made: its colours with alpha, its uvs),
   *  for the view to compile while the world loads: a first fog doesn't stall a frame compiling it.
   *  Its geometry's the caller's to drop. */
  warm(): Mesh {
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1], 3));
    geo.setAttribute("color", new Float32BufferAttribute(new Array(16).fill(1), 4));
    geo.setAttribute("uv", new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    geo.setIndex([0, 2, 1, 1, 2, 3]);
    return new Mesh(geo, this.mat);
  }

  private add(s: Sheet) {
    const g = sheetGrid(s);
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(g.pos, 3));
    geo.setAttribute("color", new Float32BufferAttribute(g.col, 4));
    geo.setAttribute("uv", new Float32BufferAttribute(g.uv, 2));
    geo.setIndex(g.idx);
    geo.computeBoundingSphere();
    const m = new Mesh(geo, this.mat);
    m.renderOrder = 3;
    this.meshes.push(m);
    this.root.add(m);
  }

  dispose() {
    for (const m of this.meshes) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    this.meshes = [];
    this.mat.dispose();
    this.tex.dispose();
  }
}
